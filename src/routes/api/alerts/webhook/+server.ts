import { json } from '@sveltejs/kit';
import { ingestAlerts, startPruneInterval, type Alert } from '$lib/alert-manager';
import { ErrorCode, createErrorResponse } from '$lib/errors';

// Start the resolved-alert pruner once at module load
startPruneInterval();

/**
 * POST /api/alerts/webhook — Ingest alerts from Alertmanager.
 *
 * Expects the standard Alertmanager webhook JSON payload:
 * {
 *   receiver: string,
 *   status: 'firing' | 'resolved',
 *   alerts: Array<{ status, labels, annotations, startsAt, endsAt, generatorURL, fingerprint }>,
 *   ...
 * }
 */
export async function POST({ request }) {
	try {
		const body = await request.json();
		const alertList = body.alerts;

		if (!Array.isArray(alertList)) {
			return json({ ok: false, error: 'Missing alerts array' }, { status: 400 });
		}

		// Normalise Alertmanager payload to our Alert shape
		const normalized: Alert[] = alertList.map((a: any) => ({
			id: a.fingerprint,
			status: a.status === 'resolved' ? 'resolved' : 'firing',
			labels: a.labels ?? {},
			annotations: a.annotations ?? {},
			startsAt: a.startsAt ?? new Date().toISOString(),
			endsAt: a.endsAt ?? null,
			generatorURL: a.generatorURL ?? '',
			fingerprint: a.fingerprint ?? crypto.randomUUID(),
			receivedAt: new Date().toISOString(),
			acknowledged: false,
		}));

		const count = ingestAlerts(normalized);

		return json({ ok: true, ingested: count });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		return json(createErrorResponse(ErrorCode.UPSTREAM_ERROR, msg), { status: 500 });
	}
}
