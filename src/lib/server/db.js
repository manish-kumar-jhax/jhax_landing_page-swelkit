/**
 * PostgreSQL persistence (postgres.js).
 *
 * Faithful port of the original backend/db.py (SQLAlchemy 2.0 async + asyncpg).
 * Set DATABASE_URL to a Postgres connection string, e.g.
 *   postgresql://user:pass@host:5432/dbname
 * Render provides DATABASE_URL automatically when you attach a Postgres instance;
 * it may hand out the bare `postgres://` form, which postgres.js accepts directly.
 *
 * Tables mirror the ORM models exactly:
 *   leads(id, email, source, business_name, person_name, phone, created_at)
 *   status_checks(id, client_name, timestamp)
 */
import postgres from 'postgres';
import { env } from '$env/dynamic/private';

/**
 * Build (cleanUrl, options) for postgres.js from a libpq-style URL.
 * - Strips libpq-only query params that the driver does not need (sslmode,
 *   channel_binding, sslrootcert, sslcert, sslkey).
 * - Translates sslmode (anything other than "disable") into a permissive TLS
 *   option, so managed Postgres (Render/Neon/Supabase) connects from outside
 *   without cert/hostname quirks blocking startup.
 * @param {string} rawUrl
 * @returns {{ url: string, options: import('postgres').Options<{}> }}
 */
function buildConfig(rawUrl) {
	if (!rawUrl) return { url: '', options: {} };

	let url = rawUrl;
	// postgres.js accepts both postgres:// and postgresql://; no driver suffix needed.

	/** @type {import('postgres').Options<{}>} */
	const options = {};
	try {
		const parsed = new URL(url);
		const sslmode = parsed.searchParams.get('sslmode');
		// Unix-socket host (e.g. Cloud SQL: ?host=/cloudsql/PROJECT:REGION:INSTANCE).
		// Passed as a connection option; SSL is not used over a local socket.
		const hostParam = parsed.searchParams.get('host');
		for (const k of ['sslmode', 'host', 'channel_binding', 'sslrootcert', 'sslcert', 'sslkey']) {
			parsed.searchParams.delete(k);
		}
		if (hostParam) {
			options.host = hostParam;
		} else if (sslmode && sslmode !== 'disable') {
			options.ssl = { rejectUnauthorized: false };
		}
		url = parsed.toString();
	} catch {
		// If URL parsing fails, hand the raw string to postgres.js unchanged.
	}
	return { url, options };
}

const DATABASE_URL = env.DATABASE_URL || '';
const { url: CLEAN_URL, options: CONNECT_OPTIONS } = buildConfig(DATABASE_URL);

/** @type {import('postgres').Sql<{}> | null} */
export const sql = CLEAN_URL
	? postgres(CLEAN_URL, { ...CONNECT_OPTIONS, prepare: false })
	: null;

let _ready = /** @type {Promise<void> | null} */ (null);

/**
 * Create tables if they don't exist yet (idempotent). Runs at most once per
 * process; concurrent callers share the same promise.
 */
export function initDb() {
	if (sql === null) {
		return Promise.reject(new Error('DATABASE_URL is not configured'));
	}
	if (_ready) return _ready;
	_ready = (async () => {
		await sql`
			CREATE TABLE IF NOT EXISTS leads (
				id VARCHAR(36) PRIMARY KEY,
				email VARCHAR(320) NOT NULL,
				source VARCHAR(64) DEFAULT 'final_cta',
				business_name VARCHAR(255),
				person_name VARCHAR(255),
				phone VARCHAR(64),
				created_at TIMESTAMPTZ NOT NULL
			)
		`;
		await sql`
			CREATE TABLE IF NOT EXISTS status_checks (
				id VARCHAR(36) PRIMARY KEY,
				client_name VARCHAR(255) NOT NULL,
				timestamp TIMESTAMPTZ NOT NULL
			)
		`;
	})();
	return _ready;
}

export async function disposeDb() {
	if (sql) await sql.end({ timeout: 5 });
}
