import { json } from '@sveltejs/kit';

/**
 * Return a FastAPI-style error response: `{ "detail": ... }` with the given
 * status. Matches the original backend's HTTPException body shape.
 * @param {number} status
 * @param {string} detail
 */
export function httpError(status, detail) {
	return json({ detail }, { status });
}
