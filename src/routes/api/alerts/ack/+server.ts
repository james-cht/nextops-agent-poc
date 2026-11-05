import { json } from '@sveltejs/kit';
import { acknowledgeAlert, acknowledgeAll } from '$lib/alert-manager';
import { ErrorCode, createErrorResponse } from '$lib/errors';

/**
 * POST /api/alerts/ack — Acknowledge one or all alerts.
 *
 * Body (JSON):
 *   { fingerprint: string } — acknowledge a single alert
 *   { all: true }           — acknowledge all firing alerts
 *
 * Response:
 *   { ok: true, acknowledged: number }
 */
export async function POST({ request }) {
	try {
		const body = await request.json();

		if (body.all === true) {
			const count = acknowledgeAll();
			return json({ ok: true, acknowledged: count });
		}

		if (typeof body.fingerprint === 'string' && body.fingerprint) {
			const found = acknowledgeAlert(body.fingerprint);
			return json({ ok: found, acknowledged: found ? 1 : 0 });
		}

		return json({ ok: false, error: 'Provide fingerprint or { all: true }' }, { status: 400 });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		return json(createErrorResponse(ErrorCode.BAD_REQUEST, msg), { status: 400 });
	}
}
