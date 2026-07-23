import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { sql, initDb } from '$lib/server/db.js';
import { httpError } from '$lib/server/http.js';

const StatusCheckCreate = z.object({ client_name: z.string() });

// POST /api/status  -> create a status check
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return httpError(422, 'Invalid JSON body');
	}
	const parsed = StatusCheckCreate.safeParse(body);
	if (!parsed.success) return httpError(422, 'client_name is required');

	try {
		await initDb();
	} catch {
		return httpError(500, 'Database not configured');
	}

	const id = crypto.randomUUID();
	const timestamp = new Date();
	await sql`
		INSERT INTO status_checks (id, client_name, timestamp)
		VALUES (${id}, ${parsed.data.client_name}, ${timestamp})
	`;
	return json({
		id,
		client_name: parsed.data.client_name,
		timestamp: timestamp.toISOString()
	});
}

// GET /api/status  -> list all status checks
export async function GET() {
	try {
		await initDb();
	} catch {
		return httpError(500, 'Database not configured');
	}
	const rows = await sql`SELECT id, client_name, timestamp FROM status_checks`;
	return json(
		rows.map((r) => ({
			id: r.id,
			client_name: r.client_name,
			timestamp: new Date(r.timestamp).toISOString()
		}))
	);
}
