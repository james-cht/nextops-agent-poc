import { addClient, getSnapshot, getAlertsBySite } from '$lib/alert-manager';

/**
 * GET /api/alerts/stream — SSE endpoint for real-time alert push.
 *
 * Query params:
 *   ?site=<clusterTag> — optional filter by site cluster tag
 *
 * On connect, sends the current alert state as an initial snapshot,
 * then pushes new alerts in real time. Heartbeat every 30s.
 */
export function GET({ url, request }) {
	const siteFilter = url.searchParams.get('site') ?? null;

	const stream = new ReadableStream<string>({
		start(controller) {
			// 1. Send initial snapshot of current alerts + summary
			const snapshot = getSnapshot(
				siteFilter ? getAlertsBySite(siteFilter) : undefined,
			);

			controller.enqueue(`data: ${JSON.stringify(snapshot)}\n\n`);

			// 2. Register for future pushes
			const cleanup = addClient(controller);

			// 3. Heartbeat every 30s to prevent proxy / load-balancer timeouts
			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(`data: ${JSON.stringify({ type: 'heartbeat', ts: new Date().toISOString() })}\n\n`);
				} catch {
					cleanup();
					clearInterval(heartbeat);
				}
			}, 30000);

			// 4. Handle client disconnect
			request.signal.addEventListener('abort', () => {
				cleanup();
				clearInterval(heartbeat);
			});
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
}
