import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { sql, initDb } from '$lib/server/db.js';
import { httpError } from '$lib/server/http.js';

const LeadCreate = z.object({
	email: z.string().email(),
	source: z.string().nullish(),
	business_name: z.string().nullish(),
	person_name: z.string().nullish(),
	phone: z.string().nullish()
});

// POST /api/leads  -> capture a lead
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return httpError(422, 'Invalid JSON body');
	}
	const parsed = LeadCreate.safeParse(body);
	if (!parsed.success) {
		// Mirror the original: a missing/invalid email is the primary failure.
		return httpError(422, 'A valid email is required');
	}

	try {
		await initDb();
	} catch {
		return httpError(500, 'Database not configured');
	}

	const d = parsed.data;
	const lead = {
		id: crypto.randomUUID(),
		email: d.email,
		source: d.source || 'final_cta',
		business_name: d.business_name ?? null,
		person_name: d.person_name ?? null,
		phone: d.phone ?? null,
		created_at: new Date()
	};

	await sql`
		INSERT INTO leads (id, email, source, business_name, person_name, phone, created_at)
		VALUES (${lead.id}, ${lead.email}, ${lead.source}, ${lead.business_name}, ${lead.person_name}, ${lead.phone}, ${lead.created_at})
	`;

	return json({
		id: lead.id,
		email: lead.email,
		source: lead.source,
		business_name: lead.business_name,
		person_name: lead.person_name,
		phone: lead.phone,
		created_at: lead.created_at.toISOString()
	});
}

// GET /api/leads  -> list leads, newest first
export async function GET() {
	try {
		await initDb();
	} catch {
		return httpError(500, 'Database not configured');
	}
	const rows = await sql`
		SELECT id, email, source, business_name, person_name, phone, created_at
		FROM leads
		ORDER BY created_at DESC
	`;
	return json(
		rows.map((r) => ({
			id: r.id,
			email: r.email,
			source: r.source,
			business_name: r.business_name,
			person_name: r.person_name,
			phone: r.phone,
			created_at: new Date(r.created_at).toISOString()
		}))
	);
}
