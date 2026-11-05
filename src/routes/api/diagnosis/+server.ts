import { json } from '@sveltejs/kit';
import { getErrors, clearAllErrors } from '$lib/server/diagnosis';
import { getTrackingDashboardPayload } from '$lib/server/system-behavior-tracker';

export async function GET({ url }) {
  const limit = Number(url.searchParams.get('limit') ?? '200');
  return json({
    errors: getErrors(),
    tracking: getTrackingDashboardPayload(limit),
  });
}

export async function POST({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'clear') {
      clearAllErrors();
      return json({ success: true, errors: getErrors() });
    }
    return json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return json({ success: false, error: msg }, { status: 500 });
  }
}
