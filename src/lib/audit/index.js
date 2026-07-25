/**
 * Client-side audit orchestrator — replaces the old POST /api/audit backend route.
 * Runs entirely in the browser: fetches place facts from the active provider, then
 * computes the heuristics locally. Returns the EXACT same object shape the backend
 * used to return, so FreeAudit's buildReportFromApi() is unchanged.
 *
 * Errors are thrown as Error objects carrying `.status` (400/404/502) so the
 * component's existing status-based error messages behave identically to before.
 */
import { getProvider, PlaceNotFound, DataSourceError } from './providers.js';
import {
	estimateHealthScore,
	estimateMoneyLostWeekly,
	healthLabel,
	BENCHMARK_RATING,
	REVENUE_PER_STAR
} from './heuristics.js';

/** Reproduce Python's str(float) for one-decimal ratings (4.0 -> "4.0", 3.2 -> "3.2"). */
function pyFloatStr(x) {
	return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/** @param {number} status @param {string} message */
function httpErr(status, message) {
	const e = /** @type {Error & { status?: number }} */ (new Error(message));
	e.status = status;
	return e;
}

/**
 * @param {{ name: string, city?: string }} input
 * @returns {Promise<object>} same shape as the former /api/audit response
 */
export async function runAudit({ name, city }) {
	const cleanName = String(name ?? '').trim();
	const cleanCity = String(city ?? '');
	if (!cleanName) throw httpErr(400, 'Restaurant name is required');

	const provider = getProvider();
	let place;
	try {
		place = await provider.fetch(cleanName, cleanCity);
	} catch (exc) {
		if (exc instanceof PlaceNotFound) throw httpErr(404, 'Restaurant not found');
		if (exc instanceof DataSourceError) throw httpErr(502, 'Place lookup failed');
		throw exc;
	}

	const rating = place.rating ?? null;
	const reviewCount = place.review_count ?? null;

	// --- Estimated / heuristic block (formulas unchanged) ---
	const health = estimateHealthScore(rating, reviewCount);
	const moneyLost = estimateMoneyLostWeekly(rating, reviewCount);

	return {
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
	};
}
