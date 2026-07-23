/**
 * Audit heuristics — faithful port of the ESTIMATE formulas in backend/server.py.
 *
 * These are transparent rules-of-thumb derived only from the two public signals
 * Google/OSM gives us: star rating and review count. They are returned under an
 * `estimated: true` block so the UI can label them as estimates, never as facts.
 *
 * Health score (0-100): 75% driven by rating quality, 25% by review volume.
 * Money lost / week: reputation leak (below 4.7 benchmark) + visibility leak
 * (below ~150 reviews), both anchored to ~$12k/week typical revenue.
 *
 * The rounding MUST match Python's built-in round() (round-half-to-even) so the
 * numbers are byte-identical to the original backend. See pyRound below.
 */

export const BENCHMARK_RATING = 4.7;
export const ASSUMED_WEEKLY_REVENUE = 12000.0;
export const REVENUE_PER_STAR = 0.07;
export const VISIBILITY_REVIEW_FLOOR = 150;
export const VISIBILITY_PENALTY = 0.03;

/**
 * Replicate Python's built-in round() for floats: correctly-rounded, round-half-
 * to-even ("banker's rounding"). Operates on a faithful decimal expansion of the
 * IEEE-754 double (via toFixed(12)) so results match CPython bit-for-bit across
 * the domains this app uses.
 * @param {number} value
 * @param {number} [ndigits=0]
 * @returns {number}
 */
export function pyRound(value, ndigits = 0) {
	if (!Number.isFinite(value)) return value;

	// Operate on the EXACT IEEE-754 double (no decimal pre-rounding, which would
	// turn values like 55.4999999999 into a false tie). A tie can only occur when
	// the scaled fractional part is exactly 0.5, which — for the domains this app
	// uses — happens only when the value is genuinely representable as n + 0.5,
	// matching CPython. Non-tie values resolve to the unique nearest, identical to
	// Python's round-to-nearest. Ties resolve to even.
	const m = Math.pow(10, ndigits);
	const scaled = value * m;
	const floor = Math.floor(scaled);
	const diff = scaled - floor;

	let n;
	if (diff < 0.5) n = floor;
	else if (diff > 0.5) n = floor + 1;
	else n = floor % 2 === 0 ? floor : floor + 1; // exact tie → round to even

	return ndigits === 0 ? n : n / m;
}

/**
 * @param {number|null|undefined} rating
 * @param {number|null|undefined} reviewCount
 * @returns {number} integer 0..100
 */
export function estimateHealthScore(rating, reviewCount) {
	rating = rating || 0.0;
	reviewCount = reviewCount || 0;
	const ratingScore = Math.max(0.0, Math.min(1.0, (rating - 2.5) / 2.5));
	const volumeScore = Math.max(
		0.0,
		Math.min(1.0, Math.log10(reviewCount + 1) / Math.log10(1000))
	);
	const score = pyRound((0.75 * ratingScore + 0.25 * volumeScore) * 100);
	return Math.trunc(Math.max(0, Math.min(100, score)));
}

/**
 * @param {number|null|undefined} rating
 * @param {number|null|undefined} reviewCount
 * @returns {number} integer dollars/week
 */
export function estimateMoneyLostWeekly(rating, reviewCount) {
	rating = rating || 0.0;
	reviewCount = reviewCount || 0;
	const reputationLoss =
		ASSUMED_WEEKLY_REVENUE * REVENUE_PER_STAR * Math.max(0.0, BENCHMARK_RATING - rating);
	let visibilityLoss = 0.0;
	if (reviewCount < VISIBILITY_REVIEW_FLOOR) {
		const shortfall = (VISIBILITY_REVIEW_FLOOR - reviewCount) / VISIBILITY_REVIEW_FLOOR;
		visibilityLoss = ASSUMED_WEEKLY_REVENUE * VISIBILITY_PENALTY * shortfall;
	}
	return pyRound(reputationLoss + visibilityLoss);
}

/**
 * @param {number} score
 * @returns {string}
 */
export function healthLabel(score) {
	if (score >= 75) return 'Good';
	if (score >= 50) return 'Needs work';
	return 'At risk';
}
