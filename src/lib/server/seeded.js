/**
 * Deterministic pseudo-metrics for the OSM provider (which has no rating/review
 * data). Pure module (no env / SvelteKit imports) so it can be unit-tested by the
 * parity harness. Faithful port of _seeded_metrics in backend/data_source.py.
 */
import { createHash } from 'node:crypto';
import { pyRound } from './audit.js';

/**
 * Derive a plausible (rating, review_count) from a stable place key using SHA-256
 * (not a per-process-randomized hash) so repeat searches yield identical numbers.
 *   rating:       3.2 – 4.8 (one decimal)
 *   review_count: 20 – 400
 * @param {string} key
 * @returns {[number, number]}
 */
export function seededMetrics(key) {
	const digest = createHash('sha256').update(key, 'utf-8').digest();
	const a = digest.readUInt32BE(0) / 0xffffffff; // 0..1
	const b = digest.readUInt32BE(4) / 0xffffffff; // 0..1
	const rating = pyRound(3.2 + a * (4.8 - 3.2), 1);
	const reviewCount = Math.trunc(20 + b * (400 - 20));
	return [rating, reviewCount];
}
