/**
 * Audit data-source providers (factory pattern) — faithful port of
 * backend/data_source.py.
 *
 * A provider turns a {name, city} query into normalized place facts, or throws
 * PlaceNotFound / DataSourceError. Heuristics (health score, money lost) live in
 * audit.js and consume `rating` + `review_count` from whichever provider is active.
 *
 * Switch providers with the AUDIT_DATA_SOURCE env var:
 *   osm     -> OSMProvider     (default; OpenStreetMap Nominatim, no key needed)
 *   google  -> GoogleProvider  (real Google Places, needs GOOGLE_PLACES_API_KEY)
 */
import { env } from '$env/dynamic/private';
import { seededMetrics } from './seeded.js';

// ---------- Errors (mapped to HTTP status in the route) ----------
export class PlaceNotFound extends Error {}
export class DataSourceError extends Error {}

// ---------- 1 request/second rate limiter (shared across all requests) ----------
class RateLimiter {
	/** @param {number} minIntervalSeconds */
	constructor(minIntervalSeconds) {
		this._minInterval = minIntervalSeconds * 1000;
		this._last = 0;
		/** @type {Promise<void>} */
		this._chain = Promise.resolve();
	}

	/** Serializes callers and enforces a minimum interval between acquisitions. */
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
const NOMINATIM_USER_AGENT =
	env.NOMINATIM_USER_AGENT || 'JHAX-Audit-Tool/1.0 (contact: jhapayapp@gmail.com)';
const NOMINATIM_LIMITER = new RateLimiter(1.0);

class OSMProvider {
	data_source = 'estimated';

	/**
	 * @param {string} name
	 * @param {string} city
	 * @returns {Promise<Record<string, any>>}
	 */
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
			resp = await fetch(url, {
				headers: { 'User-Agent': NOMINATIM_USER_AGENT },
				signal: AbortSignal.timeout(12000)
			});
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

		const [rating, reviewCount] = seededMetrics(seedKey);

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

// ---------- Google Places (New) ----------
const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const PLACES_DETAILS_URL = 'https://places.googleapis.com/v1/places/';

class GoogleProvider {
	data_source = 'google';

	constructor() {
		this.apiKey = env.GOOGLE_PLACES_API_KEY || '';
	}

	/**
	 * @param {string} name
	 * @param {string} city
	 * @returns {Promise<Record<string, any>>}
	 */
	async fetch(name, city) {
		if (!this.apiKey) throw new DataSourceError('GOOGLE_PLACES_API_KEY is not configured');

		const query = `${name} ${city}`.trim();
		let details;
		try {
			const searchResp = await fetch(PLACES_SEARCH_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Goog-Api-Key': this.apiKey,
					'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress'
				},
				body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
				signal: AbortSignal.timeout(12000)
			});
			if (searchResp.status !== 200) {
				const body = await searchResp.text().catch(() => '');
				throw new DataSourceError(`Places textSearch ${searchResp.status}: ${body.slice(0, 200)}`);
			}
			const searchJson = await searchResp.json();
			const places = searchJson.places || [];
			if (places.length === 0) throw new PlaceNotFound();
			const placeId = places[0].id;
			if (!placeId) throw new PlaceNotFound();

			const detailsResp = await fetch(PLACES_DETAILS_URL + encodeURIComponent(placeId), {
				headers: {
					'X-Goog-Api-Key': this.apiKey,
					'X-Goog-FieldMask':
						'id,displayName,formattedAddress,rating,userRatingCount,reviews,regularOpeningHours'
				},
				signal: AbortSignal.timeout(12000)
			});
			if (detailsResp.status !== 200) {
				const body = await detailsResp.text().catch(() => '');
				throw new DataSourceError(`Places details ${detailsResp.status}: ${body.slice(0, 200)}`);
			}
			details = await detailsResp.json();
		} catch (exc) {
			if (exc instanceof PlaceNotFound || exc instanceof DataSourceError) throw exc;
			throw new DataSourceError(`Google Places request failed: ${exc}`);
		}

		const topReviews = [];
		for (const rv of (details.reviews || []).slice(0, 5)) {
			const textObj = rv.text || rv.originalText || {};
			topReviews.push({
				author: (rv.authorAttribution || {}).displayName ?? null,
				rating: rv.rating ?? null,
				text: textObj.text ?? null,
				relative_time: rv.relativePublishTimeDescription ?? null
			});
		}

		const hours = details.regularOpeningHours || {};
		return {
			name: (details.displayName || {}).text || name,
			address: details.formattedAddress ?? null,
			rating: details.rating ?? null,
			review_count: details.userRatingCount ?? null,
			top_reviews: topReviews,
			opening_hours: {
				open_now: hours.openNow ?? null,
				weekday_text: hours.weekdayDescriptions || []
			},
			data_source: this.data_source
		};
	}
}

// ---------- Factory ----------
const PROVIDERS = {
	osm: OSMProvider,
	google: GoogleProvider
};

/** Return the active provider, chosen by AUDIT_DATA_SOURCE (default: osm). */
export function getProvider() {
	const source = (env.AUDIT_DATA_SOURCE || 'osm').trim().toLowerCase();
	const ProviderCls = PROVIDERS[source] || OSMProvider;
	return new ProviderCls();
}
