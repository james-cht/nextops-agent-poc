<script lang="ts">
  import {
    abnormalCount,
    actualValue,
    chipLabel,
    distributionText,
    filterItems,
    flattenItems,
    formatWhen,
    geAgentHref,
    heatmapEmpty,
    promqlHref,
    rowRemark,
    sortWorstFirst,
    worstCheck,
    type DeliveryEntry,
    type FilterId,
    type HistoryPayload,
    type ItemDetail,
    type OpsReport,
  } from '$lib/ops-check';

  let {
    report,
    history,
    delivery,
    detail = null,
    loading = false,
    error = null,
    selectedDate,
    filter,
    agentAvailable,
    busy = false,
    actionError = null,
    approvalNotice = null,
    previewSrc = '',
    publicBasePath = '',
    link = (href: string) => href,
    onDateChange,
    onRun,
    onSendGmail,
    onSendChat,
    onFilter,
    onOpenItem,
    onCloseDrawer,
    onRequestRunbook,
  }: {
    report: OpsReport | null;
    history: HistoryPayload | null;
    delivery: DeliveryEntry[];
    detail?: ItemDetail | null;
    loading?: boolean;
    error?: string | null;
    selectedDate: string;
    filter: FilterId;
    agentAvailable: boolean;
    busy?: boolean;
    actionError?: string | null;
    approvalNotice?: string | null;
    previewSrc?: string;
    publicBasePath?: string;
    link?: (href: string) => string;
    onDateChange: (day: string) => void;
    onRun: () => void;
    onSendGmail: () => void;
    onSendChat: () => void;
    onFilter: (filter: FilterId) => void;
    onOpenItem: (id: string) => void;
    onCloseDrawer: () => void;
    onRequestRunbook: (itemId: string, checkId: string) => void;
  } = $props();

  const rows = $derived(filterItems(sortWorstFirst(flattenItems(report)), filter));
  const focus = $derived(worstCheck(detail ?? null));
  const agentHref = $derived(
    detail ? geAgentHref(publicBasePath, agentAvailable, detail.id, detail.date || selectedDate) : null,
  );
  const showHeatmap = $derived(!heatmapEmpty(history));
  const abnormal = $derived(report ? abnormalCount(report.counts) : 0);
  const saasDemo = $derived(report?.sources?.saas === 'demo' || rows.some((row) => row.demo_data));
  const caasReal = $derived(report?.sources?.caas === 'prometheus' && !(report?.caas_note || '').includes('模擬'));

  function statusClass(status: string | null | undefined): string {
    if (status === 'OK' || status === 'WARN' || status === 'FAIL' || status === 'UNKNOWN') return status;
    return 'NONE';
  }
</script>

<section class="ops">
  <header class="top">
    <div>
      <p class="crumb">NextOps / 運維點檢</p>
      <h1><span>運維點檢</span> · 雲平台服務</h1>
      <div class="badges">
        {#if caasReal}
          <span class="badge real">CaaS 真實 Prometheus</span>
        {:else if report?.caas_note}
          <span class="badge demo">{report.caas_note}</span>
        {/if}
        {#if saasDemo}
          <span class="badge demo">SaaS 示範資料</span>
        {/if}
        {#if report?.generated_at}
          <span class="muted">上次點檢 {formatWhen(report.generated_at)}{report.caas_note?.includes('快照') ? '（快照）' : ''}</span>
        {/if}
      </div>
    </div>
    <div class="actions">
      <label>
        <span class="sr">點檢日期</span>
        <input type="date" value={selectedDate} onchange={(event) => onDateChange((event.currentTarget as HTMLInputElement).value)} />
      </label>
      <button type="button" class="primary" disabled={busy} onclick={onRun}>立即點檢</button>
      <button type="button" disabled={busy || !report} onclick={onSendGmail}>寄送 Gmail</button>
      <button type="button" disabled={busy || !report} onclick={onSendChat}>發 Google Chat</button>
    </div>
  </header>

  {#if error}
    <p class="banner" role="alert">{error}</p>
  {/if}
  {#if actionError}
    <p class="banner" role="alert">{actionError}</p>
  {/if}
  {#if approvalNotice}
    <p class="banner ok" role="status">{approvalNotice}</p>
  {/if}

  {#if loading}
    <p class="muted">讀取點檢報告…</p>
  {:else if !report}
    <p class="empty">尚無點檢報告。按「立即點檢」向 Prometheus 收集 CaaS；SaaS 列會標成示範資料。</p>
  {:else}
    <div class="summary">
      <div class="ring {report.overall}" aria-label="整體 {report.overall_label || report.overall}">
        <strong>{report.overall}</strong>
        <span>整體：{report.overall_label || report.overall}</span>
        <small>{report.counts.WARN} 項 WARN · {report.counts.FAIL} 項 FAIL</small>
      </div>
      <div class="counts">
        <div><b>{report.counts.OK}</b><span>OK</span></div>
        <div><b>{report.counts.WARN}</b><span>WARN</span></div>
        <div><b>{report.counts.FAIL}</b><span>FAIL</span></div>
        <div><b>{report.counts.unmonitored}</b><span>未監控</span></div>
      </div>
      <div class="chips">
        {#each report.site_chips as chip}
          <span class:dim={chip.nodes == null}>{chipLabel(chip)}</span>
        {/each}
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-head">
          <h2>點檢項目 {rows.length} 項 · 依嚴重度排序</h2>
          <div class="filters">
            <button type="button" class:on={filter === 'all'} onclick={() => onFilter('all')}>全部</button>
            <button type="button" class:on={filter === 'abnormal'} onclick={() => onFilter('abnormal')}>異常 {abnormal}</button>
            <button type="button" class:on={filter === 'CaaS'} onclick={() => onFilter('CaaS')}>CaaS</button>
            <button type="button" class:on={filter === 'SaaS'} onclick={() => onFilter('SaaS')}>SaaS</button>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>廠區</th><th>層級</th><th>點檢項目</th><th>點檢人</th><th>狀態</th><th>備註</th></tr>
          </thead>
          <tbody>
            {#each rows as row}
              <tr>
                <td>{row.site}</td>
                <td><span class="layer {row.layer}">{row.layer}</span></td>
                <td>
                  <button type="button" class="row-btn" onclick={() => onOpenItem(row.id)}>
                    {row.item}
                    {#if row.demo_data}<em>示範資料</em>{/if}
                  </button>
                </td>
                <td>{row.inspectors}</td>
                <td><span class="pill {row.status}">{row.status}</span></td>
                <td>{rowRemark(row)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <aside class="side">
        <div class="card">
          <div class="card-head">
            <h2>報告預覽</h2>
            {#if report.has_png && previewSrc}
              <a href={previewSrc}>下載 PNG</a>
            {/if}
          </div>
          {#if report.has_png && previewSrc}
            <img src={previewSrc} alt="點檢報告預覽" />
          {:else}
            <p class="muted">尚無報告圖{report.screenshot_error ? `（${report.screenshot_error}）` : ''}</p>
          {/if}
        </div>
        <div class="card">
          <h2>發送紀錄</h2>
          {#if delivery.length === 0}
            <p class="muted">尚無寄送紀錄。寄送只會在按下 Gmail 或 Google Chat 後發生。</p>
          {:else}
            <ul>
              {#each delivery as entry}
                <li>
                  <span>{entry.channel === 'gmail' ? 'Gmail' : entry.channel === 'chat' ? 'Google Chat' : entry.channel}</span>
                  <span class="muted">{entry.status}{entry.at ? ` · ${formatWhen(entry.at)}` : ''}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </aside>
    </div>

    <div class="card heat">
      <div class="card-head">
        <h2>近 14 天點檢狀態</h2>
        <span class="legend"><i class="OK"></i>OK <i class="WARN"></i>WARN <i class="FAIL"></i>FAIL <i class="NONE"></i>無資料</span>
      </div>
      {#if !showHeatmap || !history}
        <p class="empty">尚無點檢歷史</p>
      {:else}
        <div class="heat-scroll">
          <table>
            <thead>
              <tr>
                <th>項目</th>
                {#each history.days as day}<th>{day.slice(5)}</th>{/each}
              </tr>
            </thead>
            <tbody>
              {#each history.items as item}
                <tr>
                  <td>{item.item}{#if item.demo_data} <em>示範資料</em>{/if}</td>
                  {#each history.days as day}
                    <td><span class="cell {statusClass(item.statuses[day])}">{item.statuses[day] ?? ''}</span></td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}

  {#if detail}
    <div class="drawer" role="dialog" aria-label={detail.item}>
      <header>
        <p class="muted">{detail.layer} · {detail.site} · 點檢人 {detail.inspectors}</p>
        <h2>{detail.item} <span class="pill {detail.status}">{detail.status}</span></h2>
        {#if detail.demo_data}<em>示範資料</em>{/if}
        <button type="button" class="close" onclick={onCloseDrawer} aria-label="關閉">×</button>
      </header>
      {#if focus}
        <h3>為什麼是 {focus.status}</h3>
        <div class="why">
          <div><span>門檻</span><b>{focus.threshold?.text || '—'}</b></div>
          <div><span>實際值</span><b>{actualValue(focus) ?? '—'}</b></div>
          <div><span>分佈</span><b>{focus.per_cluster?.length ? distributionText(focus.per_cluster) : '—'}</b></div>
        </div>
        {#if focus.summary}<p>{focus.summary}</p>{/if}
        {#if focus.query}
          <h3>證據 · PromQL</h3>
          <pre>{focus.query}</pre>
          <a href={promqlHref(publicBasePath, focus.query)}>在 PromQL 查詢開啟</a>
          {#if focus.per_cluster?.length}
            <ul class="series">
              {#each focus.per_cluster as row}
                <li>{row.cluster || row.site}{row.phase ? ` ${row.phase}` : ''} = {row.value}{row.implied_zero ? '（查無 series，視為 0）' : ''}</li>
              {/each}
            </ul>
          {/if}
        {/if}
        {#if focus.runbook}
          <h3>建議動作 · Runbook</h3>
          <p><strong>{focus.runbook.title}</strong> {focus.runbook.summary}</p>
          <button type="button" onclick={() => onRequestRunbook(detail.id, focus.id)}>申請執行（需核准）</button>
        {/if}
      {/if}
      <h3>關聯資訊</h3>
      <p class="links">
        <a href={link('/alerts')}>告警中心</a>
        <a href={link('/robusta')}>Robusta 調查</a>
        <a href={link('/logs')}>日誌查詢</a>
      </p>
      <h3>AI 洞察</h3>
      <p class="muted">尚未分析。這裡不會顯示未經 GE Agent 產生的結論或信心分數。</p>
      {#if agentHref}
        <a class="agent" href={agentHref}>交給 GE Agent 分析</a>
      {:else}
        <button type="button" disabled>交給 GE Agent 分析（TODO：尚未接上 GE Agent）</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .ops { display: flex; flex-direction: column; gap: 16px; color: var(--theme-fg); }
  .top, .card-head, .actions, .badges, .filters, .chips, .counts, .legend, .links { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .top { justify-content: space-between; }
  h1 { margin: 0; font-size: 22px; }
  h2 { margin: 0; font-size: 15px; }
  h3 { margin: 14px 0 6px; font-size: 13px; }
  .crumb, .muted, .sr { color: var(--theme-muted); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; }
  .badge, .pill, .layer, .chips span, button, .agent {
    border-radius: 999px; padding: 2px 8px; font-size: 12px;
  }
  .badge.real { background: var(--theme-success-bg); color: var(--theme-success-fg); }
  .badge.demo { background: var(--theme-warning-bg); color: var(--theme-warning-fg); }
  .actions button, .filters button, .card button, .agent {
    border: 1px solid var(--theme-line); background: var(--theme-card); color: var(--theme-fg); cursor: pointer;
    border-radius: 8px; padding: 6px 10px;
  }
  .primary { background: var(--theme-success); color: white; border-color: transparent; }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
  .summary, .card, .drawer {
    background: var(--theme-card); border: 1px solid var(--theme-line); border-radius: 12px; padding: 14px;
  }
  .summary { display: flex; gap: 18px; align-items: center; }
  .ring { width: 92px; height: 92px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 6px solid var(--theme-warning); }
  .ring.OK { border-color: var(--theme-success); }
  .ring.FAIL { border-color: var(--theme-danger); }
  .ring.UNKNOWN { border-color: var(--theme-muted); }
  .counts b { display: block; font-size: 22px; }
  .chips span { background: var(--theme-inset); }
  .chips span.dim { opacity: 0.7; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--theme-line); vertical-align: top; }
  .row-btn { border: 0; background: transparent; color: inherit; padding: 0; border-radius: 0; text-align: left; cursor: pointer; }
  .row-btn em, em { font-style: normal; margin-left: 6px; color: var(--theme-warning-fg); font-size: 11px; }
  .pill.OK, .cell.OK { background: var(--theme-success-bg); color: var(--theme-success-fg); }
  .pill.WARN, .cell.WARN { background: var(--theme-warning-bg); color: var(--theme-warning-fg); }
  .pill.FAIL, .cell.FAIL { background: var(--theme-danger-bg); color: var(--theme-danger-fg); }
  .pill.UNKNOWN, .cell.UNKNOWN, .cell.NONE { background: var(--theme-inset); color: var(--theme-muted); }
  .cell { display: inline-block; min-width: 28px; min-height: 16px; border-radius: 4px; }
  .legend i { width: 10px; height: 10px; display: inline-block; border-radius: 2px; }
  .legend i.OK { background: var(--theme-success); }
  .legend i.WARN { background: var(--theme-warning); }
  .legend i.FAIL { background: var(--theme-danger); }
  .legend i.NONE { background: var(--theme-muted); }
  .empty, .banner { padding: 12px; border: 1px dashed var(--theme-line); border-radius: 8px; }
  .banner { border-style: solid; background: var(--theme-danger-bg); }
  .banner.ok { background: var(--theme-success-bg); }
  img { width: 100%; border-radius: 8px; }
  .side { display: flex; flex-direction: column; gap: 12px; }
  .drawer { position: fixed; top: 0; right: 0; height: 100vh; width: min(420px, 100vw); overflow: auto; z-index: 30; box-shadow: -8px 0 24px rgb(0 0 0 / 0.18); }
  .why { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .why div { background: var(--theme-inset); border-radius: 8px; padding: 8px; }
  .why span { display: block; color: var(--theme-muted); font-size: 11px; }
  pre { white-space: pre-wrap; background: #0f172a; color: #e2e8f0; padding: 8px; border-radius: 8px; font-size: 11px; }
  .close { position: absolute; top: 10px; right: 10px; }
  .heat-scroll { overflow-x: auto; }
  @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
</style>
