/**
 * Audit data-source providers — running in the BROWSER, a faithful port of the
 * original data_source.py. Same normalized place shape, same errors, same
 * provider selection.
 *
 * Provider chosen by PUBLIC_AUDIT_DATA_SOURCE (default: osm):
 *   osm     -> OSMProvider     (OpenStreetMap Nominatim REST; allows CORS)
 *   google  -> GoogleProvider  (Google Maps JavaScript "Places" library)
 *
 * IMPORTANT: Google's Places REST endpoints (places.googleapis.com) do NOT send
 * CORS headers, so they can't be called with fetch() from a browser. The correct
 * client-side path is the Maps JavaScript API Places library, which we load on
 * demand below. Enable "Maps JavaScript API" + "Places API (New)" for the key and
 * restrict it by HTTP referrer.
 */
import { env } from '$env/dynamic/public';
import { seededMetrics } from './seeded.js';

// ---------- Errors ----------
export class PlaceNotFound extends Error {}
export class DataSourceError extends Error {}

// ---------- 1 request/second rate limiter (OSM) ----------
class RateLimiter {
	/** @param {number} minIntervalSeconds */
	constructor(minIntervalSeconds) {
		this._minInterval = minIntervalSeconds * 1000;
		this._last = 0;
		/** @type {Promise<void>} */
		this._chain = Promise.resolve();
	}
	acquire() {
		this._chain = this._chain.then(async () => {
			const now = Date.now();
			const wait = this._minInterval - (now - this._last);
			if (wait > 0) await new Promise((r) => setTimeout(r, wait));
			this._last = Date.now();
		});
		return this._chain;
	}
}

// ---------- OpenStreetMap Nominatim ----------
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_LIMITER = new RateLimiter(1.0);

class OSMProvider {
	data_source = 'estimated';

	/** @param {string} name @param {string} city */
	async fetch(name, city) {
		const query = `${name} ${city}`.trim();
		await NOMINATIM_LIMITER.acquire();
		let resp;
		try {
			const url = new URL(NOMINATIM_URL);
			url.searchParams.set('q', query);
			url.searchParams.set('format', 'json');
			url.searchParams.set('addressdetails', '1');
			url.searchParams.set('limit', '1');
			// Browsers forbid setting User-Agent; Nominatim accepts the browser's UA + Referer.
			resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
		} catch (exc) {
			throw new DataSourceError(`Nominatim request failed: ${exc}`);
		}

		if (resp.status !== 200) {
			const body = await resp.text().catch(() => '');
			throw new DataSourceError(`Nominatim returned ${resp.status}: ${body.slice(0, 200)}`);
		}

		let results;
		try {
			results = await resp.json();
		} catch {
			throw new DataSourceError('Nominatim returned invalid JSON');
		}

		if (!results || results.length === 0) throw new PlaceNotFound();

		const r = results[0];
		const displayName = r.display_name || name;
		const seedKey = String(r.place_id ?? displayName);
		const shortName = r.name || displayName.split(',')[0].trim() || name;

		const [rating, reviewCount] = await seededMetrics(seedKey);

		return {
			name: shortName,
			address: displayName,
			rating,
			review_count: reviewCount,
			top_reviews: [],
			opening_hours: { open_now: null, weekday_text: [] },
			data_source: this.data_source
		};
	}
}

// ---------- Google Maps JavaScript API loader (browser only) ----------
let _mapsLoad = /** @type {Promise<any> | null} */ (null);

/** Load (once) the Maps JS "places" library and resolve with it. */
function loadPlacesLibrary(apiKey) {
	if (_mapsLoad) return _mapsLoad;
	_mapsLoad = new Promise((resolve, reject) => {
		if (typeof window === 'undefined') {
			reject(new DataSourceError('Google Places is only available in the browser'));
			return;
		}
		const g = window;
		const start = () =>
			g.google.maps.importLibrary('places').then(resolve, (e) =>
				reject(new DataSourceError(`Maps places library failed: ${e}`))
			);

		if (g.google?.maps?.importLibrary) {
			start();
			return;
		}
		// Official Google Maps inline bootstrap loader (defines importLibrary).
		((cfg) => {
			let scriptEl;
			const doc = document;
			const win = window;
			const gm = (win.google || (win.google = {})).maps || ((win.google.maps = {}));
			const libs = new Set();
			const params = new URLSearchParams();
			const CB = '__ib__';
			let loadPromise;
			const ensure = () =>
				loadPromise ||
				(loadPromise = new Promise((res, rej) => {
					scriptEl = doc.createElement('script');
					params.set('libraries', [...libs].join(','));
					for (const key in cfg) {
						params.set(
							key.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()),
							cfg[key]
						);
					}
					params.set('callback', 'google.maps.' + CB);
					scriptEl.src = 'https://maps.googleapis.com/maps/api/js?' + params;
					gm[CB] = res;
					scriptEl.onerror = () => rej(new DataSourceError('Google Maps JS could not load'));
					scriptEl.nonce = doc.querySelector('script[nonce]')?.nonce || '';
					doc.head.append(scriptEl);
				}));
			gm.importLibrary = (name) => ensure().then(() => gm.importLibrary(name));
			// note: after the real API loads, it replaces importLibrary with its own.
			libs.add('places');
		})({ key: apiKey, v: 'weekly' });
		start();
	});
	return _mapsLoad;
}

/**
 * Compute whether a place is open right now from its regular weekly hours —
 * reproducing the REST `regularOpeningHours.openNow` the original backend used.
 * We do NOT use Place.isOpen() because it is beta-channel only (we load the stable
 * `weekly` channel). Returns true/false when hours are known, or null when the
 * data is insufficient (matches the backend, which returned null → no "closed" card).
 *
 * Periods use day 0..6 (Sunday=0). A period with an `open` point but no `close`
 * means open 24 hours. Periods may wrap past the end of the week (e.g. Fri 18:00 →
 * Sat 02:00), which we handle by comparing absolute minutes-within-week.
 * @param {any} place
 * @returns {boolean|null}
 */
function computeOpenNow(place) {
	const periods = place?.regularOpeningHours?.periods;
	const utc = place?.utcOffsetMinutes;
	if (!periods || periods.length === 0 || typeof utc !== 'number') return null;

	// "Wall clock" in the place's timezone: shift the epoch by the offset, read via UTC getters.
	const local = new Date(Date.now() + utc * 60000);
	const WEEK = 7 * 1440;
	const nowAbs = local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();

	for (const p of periods) {
		const o = p?.open;
		if (!o || typeof o.day !== 'number') continue;
		// Open point with no close → open 24 hours.
		if (!p.close || typeof p.close.day !== 'number') return true;

		const openAbs = o.day * 1440 + (o.hour || 0) * 60 + (o.minute || 0);
		let closeAbs = p.close.day * 1440 + (p.close.hour || 0) * 60 + (p.close.minute || 0);
		if (closeAbs <= openAbs) closeAbs += WEEK; // period wraps into the next week

		if (
			(nowAbs >= openAbs && nowAbs < closeAbs) ||
			(nowAbs + WEEK >= openAbs && nowAbs + WEEK < closeAbs)
		) {
			return true;
		}
	}
	return false;
}

// ---------- Google Places (New) via Maps JS library ----------
class GoogleProvider {
	data_source = 'google';

	constructor() {
		this.apiKey = env.PUBLIC_GOOGLE_PLACES_API_KEY || '';
	}

	/** @param {string} name @param {string} city */
	async fetch(name, city) {
		if (!this.apiKey) throw new DataSourceError('PUBLIC_GOOGLE_PLACES_API_KEY is not configured');

		const query = `${name} ${city}`.trim();

		let Place;
		try {
			({ Place } = await loadPlacesLibrary(this.apiKey));
		} catch (exc) {
			if (exc instanceof DataSourceError) throw exc;
			throw new DataSourceError(`Google Places load failed: ${exc}`);
		}

		let place;
		try {
			const { places } = await Place.searchByText({
				textQuery: query,
				fields: [
					'displayName',
					'formattedAddress',
					'rating',
					'userRatingCount',
					'reviews',
					'regularOpeningHours',
					'utcOffsetMinutes'
				],
				maxResultCount: 1
			});
			if (!places || places.length === 0) throw new PlaceNotFound();
			place = places[0];
		} catch (exc) {
			if (exc instanceof PlaceNotFound) throw exc;
			throw new DataSourceError(`Google Places request failed: ${exc}`);
		}

		// open_now — computed from regularOpeningHours.periods + utcOffsetMinutes,
		// reproducing the REST regularOpeningHours.openNow the backend used.
		const openNow = computeOpenNow(place);

		const topReviews = [];
		for (const rv of (place.reviews || []).slice(0, 5)) {
			topReviews.push({
				author: rv.authorAttribution?.displayName ?? null,
				rating: rv.rating ?? null,
				text: rv.text ?? null,
				relative_time: rv.relativePublishTimeDescription ?? null
			});
		}

		return {
			name: place.displayName || name,
			address: place.formattedAddress ?? null,
			rating: place.rating ?? null,
			review_count: place.userRatingCount ?? null,
			top_reviews: topReviews,
			opening_hours: {
				open_now: openNow,
				weekday_text: place.regularOpeningHours?.weekdayDescriptions || []
			},
			data_source: this.data_source
		};
	}
}

const PROVIDERS = { osm: OSMProvider, google: GoogleProvider };

/** Return the active provider, chosen by PUBLIC_AUDIT_DATA_SOURCE (default: osm). */
export function getProvider() {
	const source = (env.PUBLIC_AUDIT_DATA_SOURCE || 'osm').trim().toLowerCase();
	const ProviderCls = PROVIDERS[source] || OSMProvider;
	return new ProviderCls();
}
