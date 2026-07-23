import { json } from '@sveltejs/kit';
import { getProvider, PlaceNotFound, DataSourceError } from '$lib/server/dataSource.js';
import {
	estimateHealthScore,
	estimateMoneyLostWeekly,
	healthLabel,
	BENCHMARK_RATING,
	REVENUE_PER_STAR
} from '$lib/server/audit.js';
import { httpError } from '$lib/server/http.js';

/** Reproduce Python's str(float) for one-decimal ratings (4.0 -> "4.0", 3.2 -> "3.2"). */
function pyFloatStr(x) {
	return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

// POST /api/audit  -> free restaurant audit (Google Places / OSM + heuristics)
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		body = {};
	}
	const name = String(body?.name ?? '').trim();
	const city = String(body?.city ?? '');

	if (!name) return httpError(400, 'Restaurant name is required');

	const provider = getProvider();
	let place;
	try {
		place = await provider.fetch(name, city);
	} catch (exc) {
		if (exc instanceof PlaceNotFound) return httpError(404, 'Restaurant not found');
		if (exc instanceof DataSourceError) {
			console.error('Audit data-source error:', exc);
			return httpError(502, 'Place lookup failed');
		}
		throw exc;
	}

	const rating = place.rating ?? null;
	const reviewCount = place.review_count ?? null;

	// --- Estimated / heuristic block (formulas unchanged) ---
	const health = estimateHealthScore(rating, reviewCount);
	const moneyLost = estimateMoneyLostWeekly(rating, reviewCount);

	return json({
		found: true,
		data_source: place.data_source || 'estimated',
		place: {
			name: place.name ?? null,
			address: place.address ?? null,
			rating,
			review_count: reviewCount,
			opening_hours: place.opening_hours || { open_now: null, weekday_text: [] },
			top_reviews: place.top_reviews || []
		},
		estimated: {
			estimated: true,
			health_score: health,
			health_label: healthLabel(health),
			money_lost_weekly: moneyLost,
			basis:
				`Estimated from rating (${rating !== null ? pyFloatStr(rating) : 'n/a'}★) and ` +
				`${reviewCount !== null ? reviewCount : 0} reviews. ` +
				`Benchmark ${BENCHMARK_RATING}★, ~${Math.trunc(REVENUE_PER_STAR * 100)}% weekly revenue per star.`
		}
	});
}
