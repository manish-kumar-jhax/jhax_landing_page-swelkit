import { json } from '@sveltejs/kit';

// GET /api  ->  { message: "JHAX.ai API" }  (parity with backend root route)
export function GET() {
	return json({ message: 'JHAX.ai API' });
}
