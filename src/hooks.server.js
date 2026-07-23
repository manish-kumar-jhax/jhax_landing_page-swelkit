import { env } from '$env/dynamic/private';

/**
 * CORS for /api/* — faithful port of the FastAPI CORSMiddleware config.
 *
 * CORS_ORIGINS is a comma-separated allow-list (default "*"). With "*" we reflect
 * the caller's Origin so credentialed requests still work (a literal "*" can't be
 * sent with credentials). allow_methods/headers = *, allow_credentials = true.
 */
const corsOrigins = (env.CORS_ORIGINS || '*')
	.split(',')
	.map((o) => o.trim())
	.filter(Boolean);
const allowAll = corsOrigins.includes('*');

/**
 * @param {Headers} headers
 * @param {string | null} origin
 */
function applyCors(headers, origin) {
	const allowOrigin = allowAll ? origin || '*' : corsOrigins.includes(origin || '') ? origin : '';
	if (allowOrigin) {
		headers.set('Access-Control-Allow-Origin', allowOrigin);
		headers.set('Access-Control-Allow-Credentials', 'true');
		headers.set('Vary', 'Origin');
		headers.set('Access-Control-Allow-Methods', '*');
		headers.set('Access-Control-Allow-Headers', '*');
	}
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const isApi = event.url.pathname === '/api' || event.url.pathname.startsWith('/api/');
	const origin = event.request.headers.get('origin');

	// Preflight
	if (isApi && event.request.method === 'OPTIONS') {
		const headers = new Headers();
		applyCors(headers, origin);
		headers.set('Access-Control-Max-Age', '600');
		return new Response(null, { status: 204, headers });
	}

	const response = await resolve(event);
	if (isApi) applyCors(response.headers, origin);
	return response;
}
