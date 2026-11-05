<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import OpsCheckView from '$lib/components/ops-check/OpsCheckView.svelte';
  import { publicHref } from '$lib/kit-public-href';
  import type { DeliveryEntry, FilterId, HistoryPayload, ItemDetail, OpsReport } from '$lib/ops-check';

  let report = $state<OpsReport | null>(null);
  let history = $state<HistoryPayload | null>(null);
  let delivery = $state<DeliveryEntry[]>([]);
  let detail = $state<ItemDetail | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let actionError = $state<string | null>(null);
  let approvalNotice = $state<string | null>(null);
  let busy = $state(false);
  let filter = $state<FilterId>('all');
  let selectedDate = $state(new Date().toISOString().slice(0, 10));
  let previewSrc = $state('');

  const agentAvailable = true;

  async function readError(res: Response): Promise<string> {
    try {
      const data = await res.json();
      if (typeof data?.error === 'string') return data.error;
      if (typeof data?.detail === 'string') return data.detail;
    } catch {
      /* keep status */
    }
    return `HTTP ${res.status}`;
  }

  async function loadReport(day: string) {
    const latest = await fetch(publicHref('/api/daily-check/latest'));
    if (latest.status === 404) {
      report = null;
      previewSrc = '';
      return;
    }
    if (!latest.ok) throw new Error(await readError(latest));
    const body = (await latest.json()) as OpsReport;
    if (day && body.date !== day) {
      const byDate = await fetch(publicHref(`/api/daily-check/reports/${day}`));
      if (byDate.status === 404) {
        report = null;
        previewSrc = '';
        error = `${day} 沒有已儲存的點檢報告`;
        return;
      }
      if (!byDate.ok) throw new Error(await readError(byDate));
      report = (await byDate.json()) as OpsReport;
      previewSrc = '';
      return;
    }
    report = body;
    selectedDate = body.date || selectedDate;
    previewSrc = body.has_png ? publicHref(`/api/daily-check/latest.png?t=${encodeURIComponent(body.generated_at || '')}`) : '';
  }

  async function loadHistory() {
    const res = await fetch(publicHref(`/api/daily-check/history?days=14&end=${selectedDate}`));
    if (!res.ok) throw new Error(await readError(res));
    history = (await res.json()) as HistoryPayload;
  }

  async function loadDelivery() {
    const res = await fetch(publicHref('/api/daily-check/delivery'));
    if (!res.ok) throw new Error(await readError(res));
    const body = await res.json();
    delivery = Array.isArray(body.entries) ? body.entries : [];
  }

  async function refresh() {
    loading = true;
    error = null;
    try {
      await loadReport(selectedDate);
      await Promise.all([loadHistory(), loadDelivery()]);
    } catch (err) {
      error = err instanceof Error ? err.message : '無法讀取點檢服務';
    } finally {
      loading = false;
    }
  }

  async function post(path: string, body: unknown): Promise<Response> {
    return fetch(publicHref(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function onRun() {
    busy = true;
    actionError = null;
    try {
      const res = await post('/api/daily-check/run', {
        date: selectedDate,
        send_gmail: false,
        send_chat: false,
      });
      if (!res.ok) throw new Error(await readError(res));
      report = (await res.json()) as OpsReport;
      selectedDate = report.date || selectedDate;
      previewSrc = report.has_png ? publicHref(`/api/daily-check/latest.png?t=${Date.now()}`) : '';
      await Promise.all([loadHistory(), loadDelivery()]);
    } catch (err) {
      actionError = err instanceof Error ? err.message : '點檢失敗';
    } finally {
      busy = false;
    }
  }

  async function send(channel: 'gmail' | 'chat') {
    busy = true;
    actionError = null;
    try {
      const res = await post('/api/daily-check/send', { channel, date: report?.date || selectedDate });
      if (!res.ok) throw new Error(await readError(res));
      await loadDelivery();
    } catch (err) {
      actionError = err instanceof Error ? err.message : '寄送失敗';
    } finally {
      busy = false;
    }
  }

  async function onOpenItem(id: string) {
    actionError = null;
    const day = report?.date || selectedDate;
    const res = await fetch(publicHref(`/api/daily-check/items/${encodeURIComponent(id)}?date=${day}`));
    if (!res.ok) {
      actionError = await readError(res);
      return;
    }
    detail = (await res.json()) as ItemDetail;
  }

  async function onRequestRunbook(itemId: string, checkId: string) {
    actionError = null;
    approvalNotice = null;
    const res = await post('/api/daily-check/approvals', {
      item_id: itemId,
      check_id: checkId,
      date: report?.date || selectedDate,
    });
    if (!res.ok) {
      actionError = await readError(res);
      return;
    }
    const body = await res.json();
    approvalNotice = body.executed
      ? '核准要求已記錄'
      : '已建立核准要求，尚未執行 Runbook';
  }

  function onDateChange(day: string) {
    selectedDate = day;
    detail = null;
    refresh();
  }

  onMount(() => {
    refresh();
  });
</script>

<OpsCheckView
  {report}
  {history}
  {delivery}
  {detail}
  {loading}
  {error}
  {selectedDate}
  {filter}
  {agentAvailable}
  {busy}
  {actionError}
  {approvalNotice}
  {previewSrc}
  publicBasePath={base}
  link={publicHref}
  {onDateChange}
  {onRun}
  onSendGmail={() => send('gmail')}
  onSendChat={() => send('chat')}
  onFilter={(next) => (filter = next)}
  {onOpenItem}
  onCloseDrawer={() => (detail = null)}
  {onRequestRunbook}
/>
