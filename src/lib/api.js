// The frontend and backend are now one SvelteKit app, so API calls are same-origin.
// (The original React app used process.env.REACT_APP_BACKEND_URL because the
// FastAPI backend was deployed separately.)
export const API = '/api';

/**
 * POST JSON to an /api path. Throws an Error carrying `.status` and `.data` on a
 * non-2xx response, so callers can branch on HTTP status exactly like the axios
 * error handling in the original components did.
 * @param {string} path
 * @param {Record<string, unknown>} body
 */
export async function apiPost(path, body) {
	const res = await fetch(`${API}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const err = /** @type {Error & { status?: number, data?: any }} */ (
			new Error(`Request failed with status ${res.status}`)
		);
		err.status = res.status;
		try {
			err.data = await res.json();
		} catch {
			/* ignore */
		}
		throw err;
	}
	return res.json();
}
