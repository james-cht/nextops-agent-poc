<script lang="ts">
  import { onMount } from 'svelte';
  import { loadExploreData, parseHash, toHash, githubBlobUrl, searchDocs } from './lib/data';
  import type { ExploreData, Route } from './lib/types';
  import GraphView from './components/GraphView.svelte';

  let data = $state<ExploreData | null>(null);
  let error = $state<string | null>(null);
  let route = $state<Route>(parseHash());
  let searchInput = $state('');

  onMount(() => {
    const onHash = () => {
      route = parseHash();
      if (route.name === 'search') searchInput = route.q;
    };
    window.addEventListener('hashchange', onHash);
    loadExploreData()
      .then((d) => {
        data = d;
      })
      .catch((e: Error) => {
        error = e.message;
      });
    return () => window.removeEventListener('hashchange', onHash);
  });

  function go(next: Route) {
    window.location.hash = toHash(next);
  }

  function isCurrent(name: Route['name'], id?: string) {
    if (route.name !== name) return false;
    if (name === 'doc' && route.name === 'doc') return route.id === id;
    return true;
  }

  const activeDoc = $derived(
    data && route.name === 'doc' ? data.corpus.docs.find((d) => d.id === route.id) : null
  );

  const searchHits = $derived(
    data && route.name === 'search' ? searchDocs(data.corpus.docs, route.q) : []
  );

  const docsBySection = $derived.by(() => {
    if (!data) return [] as Array<{ section: string; label: string; docs: typeof data.corpus.docs }>;
    const order = [
      'getting-started',
      'architecture',
      'ops',
      'integration',
      'glossary',
      'planning'
    ];
    return order
      .map((section) => ({
        section,
        label: data!.corpus.sections[section] || section,
        docs: data!.corpus.docs.filter((d) => d.section === section)
      }))
      .filter((g) => g.docs.length);
  });

  function onSearchSubmit(e: Event) {
    e.preventDefault();
    go({ name: 'search', q: searchInput });
  }

  function resolveRepoPath(fromFile: string, href: string) {
    const [pathPart, hashPart] = href.split('#');
    if (!pathPart) return { id: null as string | null, hash: hashPart || '' };
    const fromParts = fromFile.split('/').slice(0, -1);
    const bits = pathPart.split('/');
    const stack = [...fromParts];
    for (const bit of bits) {
      if (bit === '' || bit === '.') continue;
      if (bit === '..') stack.pop();
      else stack.push(bit);
    }
    const resolved = stack.join('/');
    const byFile = new Map(data!.corpus.docs.map((d) => [d.file.replace(/\\/g, '/'), d.id]));
    return { id: byFile.get(resolved) ?? null, hash: hashPart || '' };
  }

  function enhanceDocHtml(html: string, file: string) {
    if (!data) return html;
    return html.replace(/href="([^"]+)"/g, (full, href: string) => {
      if (/^(https?:|mailto:|#)/i.test(href)) return full;
      const { id, hash } = resolveRepoPath(file, href);
      if (!id) return full;
      return `href="#/doc/${encodeURIComponent(id)}${hash ? '#' + hash : ''}"`;
    });
  }
</script>

<a class="skip-link" href="#main">跳至主要內容</a>

{#if error}
  <main class="main">
    <div class="panel">
      <h1>無法載入資料</h1>
      <p class="muted">{error}</p>
      <p>請先執行 <code>npm run docs:explore</code> 產生 <code>public/data/*.json</code>。</p>
    </div>
  </main>
{:else if !data}
  <main class="main"><p class="muted">載入文件探索中心…</p></main>
{:else}
  <div class="app-shell">
    <aside class="sidebar" aria-label="文件導覽">
      <p class="brand">NextOps</p>
      <p class="brand-sub">文件探索中心</p>

      <form onsubmit={onSearchSubmit}>
        <input
          class="search-box"
          type="search"
          placeholder="搜尋文件…"
          bind:value={searchInput}
          aria-label="搜尋文件"
        />
      </form>

      <nav class="nav-group" aria-label="探索工具">
        <h2>探索</h2>
        <button type="button" class="linkish" aria-current={isCurrent('home') ? 'page' : undefined} onclick={() => go({ name: 'home' })}>首頁</button>
        <button type="button" class="linkish" aria-current={isCurrent('graph') ? 'page' : undefined} onclick={() => go({ name: 'graph' })}>程式碼表面圖</button>
        <button type="button" class="linkish" aria-current={isCurrent('drift') ? 'page' : undefined} onclick={() => go({ name: 'drift' })}>
          Drift
          {#if data.drift.undocumented.length}
            <span class="badge warn">{data.drift.undocumented.length}</span>
          {/if}
        </button>
        <button type="button" class="linkish" aria-current={isCurrent('links') ? 'page' : undefined} onclick={() => go({ name: 'links' })}>
          連結健檢
          {#if data.links.brokenCount}
            <span class="badge danger">{data.links.brokenCount}</span>
          {/if}
        </button>
        <button type="button" class="linkish" aria-current={isCurrent('features') ? 'page' : undefined} onclick={() => go({ name: 'features' })}>功能導覽</button>
        <button type="button" class="linkish" aria-current={isCurrent('dify-chatflow') ? 'page' : undefined} onclick={() => go({ name: 'dify-chatflow' })}>Dify Chatflow</button>
        <button type="button" class="linkish" aria-current={isCurrent('outbound') ? 'page' : undefined} onclick={() => go({ name: 'outbound' })}>外連文件</button>
        <button type="button" class="linkish" aria-current={isCurrent('future') ? 'page' : undefined} onclick={() => go({ name: 'future' })}>下一步</button>
      </nav>

      {#each docsBySection as group}
        <nav class="nav-group" aria-label={group.label}>
          <h2>{group.label}</h2>
          {#each group.docs as doc}
            <button
              type="button"
              class="linkish"
              aria-current={isCurrent('doc', doc.id) ? 'page' : undefined}
              onclick={() => go({ name: 'doc', id: doc.id })}
            >
              {doc.title}
            </button>
          {/each}
        </nav>
      {/each}
    </aside>

    <main id="main" class="main">
      {#if route.name === 'home'}
        <div class="panel">
          <h1>NextOps</h1>
          <p>互動式文件探索：閱讀精選 Markdown、搜尋、檢視文件 ↔ 路由／API 圖譜，並以軟性 Drift 對照程式碼表面。</p>
          <div class="meta-row">
            <span class="badge">文件 {data.meta.curatedCount}</span>
            <span class="badge">頁面 {data.meta.pageCount}</span>
            <span class="badge">API {data.meta.apiCount}</span>
            <span class="badge warn">未文件化 {data.meta.driftSummary.undocumentedPages + data.meta.driftSummary.undocumentedApis}</span>
            <span class="badge">產生於 {new Date(data.meta.generatedAt).toLocaleString()}</span>
          </div>
          <div class="toolbar">
            <button type="button" class="btn primary" onclick={() => go({ name: 'doc', id: 'architecture' })}>開始讀架構</button>
            <button type="button" class="btn" onclick={() => go({ name: 'dify-chatflow' })}>Dify Chatflow 配置</button>
            <button type="button" class="btn" onclick={() => go({ name: 'graph' })}>開啟圖譜</button>
            <button type="button" class="btn" onclick={() => go({ name: 'drift' })}>查看 Drift</button>
            <a class="btn" href="../explore/index.html">舊版 hub（過渡）</a>
          </div>
          <div class="grid-cards" style="margin-top:1rem">
            {#each data.corpus.docs.slice(0, 8) as doc}
              <button type="button" class="card" onclick={() => go({ name: 'doc', id: doc.id })}>
                <h3>{doc.title}</h3>
                <p>{doc.sectionLabel}</p>
              </button>
            {/each}
          </div>
        </div>
      {:else if route.name === 'doc' && activeDoc}
        <div class="panel">
          <div class="toolbar">
            <h1 style="flex:1;margin:0;font-family:var(--font-display);font-size:1.6rem">{activeDoc.title}</h1>
            <a class="btn" href={githubBlobUrl(activeDoc.openSource)} target="_blank" rel="noopener">Open source</a>
          </div>
          <p class="muted" style="margin-top:0">{activeDoc.file}</p>
          {#if activeDoc.headings.length}
            <details style="margin-bottom:1rem">
              <summary>本頁大綱</summary>
              <ul>
                {#each activeDoc.headings as h}
                  <li style="margin-left:{(h.level - 1) * 0.75}rem">
                    <a href={`#/doc/${activeDoc.id}#${h.id}`}>{h.title}</a>
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
          <article class="prose">
            {@html enhanceDocHtml(activeDoc.html, activeDoc.file)}
          </article>
        </div>
      {:else if route.name === 'doc'}
        <div class="panel"><h1>找不到文件</h1><p class="muted">id={route.id}</p></div>
      {:else if route.name === 'search'}
        <div class="panel">
          <h1>搜尋結果</h1>
          <p class="muted">關鍵字：{route.q || '（空）'}</p>
          {#if !searchHits.length}
            <p>沒有符合的文件。</p>
          {:else}
            <div class="grid-cards">
              {#each searchHits as hit}
                <button type="button" class="card" onclick={() => go({ name: 'doc', id: hit.doc.id })}>
                  <h3>{hit.doc.title}</h3>
                  <p>{hit.doc.sectionLabel} · score {hit.score.toFixed(1)}</p>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else if route.name === 'graph'}
        <div class="panel">
          <h1>程式碼表面圖</h1>
          <p class="muted">文件節點、UI 路由、API，以及未文件化的 Drift 邊。</p>
          <GraphView graph={data.graph} focus={route.focus} onSelect={(id) => {
            if (id.startsWith('doc:')) go({ name: 'doc', id: id.slice(4) });
            else if (id === 'drift:undocumented') go({ name: 'drift' });
            else go({ name: 'graph', focus: id });
          }} />
        </div>
      {:else if route.name === 'drift'}
        <div class="panel">
          <h1>Drift（軟性）</h1>
          <p>建置不會因 Drift 失敗。以下為程式碼表面與權威文件（架構／README／API 契約／資料流／設定／教學）比對結果。</p>
          <div class="meta-row">
            <span class="badge warn">未文件化頁面 {data.drift.summary.undocumentedPages}</span>
            <span class="badge warn">未文件化 API {data.drift.summary.undocumentedApis}</span>
            <span class="badge">已對上 {data.drift.summary.documentedCount}</span>
            <span class="badge">過時提及 {data.drift.summary.staleMentions}</span>
          </div>
          <h2>未文件化</h2>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>類型</th><th>路徑</th><th>檔案</th></tr></thead>
              <tbody>
                {#each data.drift.undocumented as row}
                  <tr>
                    <td>{row.kind}</td>
                    <td><code>{row.route}</code></td>
                    <td><a href={githubBlobUrl(row.file)} target="_blank" rel="noopener">{row.file}</a></td>
                  </tr>
                {:else}
                  <tr><td colspan="3">目前沒有 Drift — 太好了。</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if data.drift.stale.length}
            <h2>文件提及但庫存沒有</h2>
            <ul>
              {#each data.drift.stale as s}
                <li><code>{s.route}</code> — {s.note}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else if route.name === 'links'}
        <div class="panel">
          <h1>連結健檢</h1>
          <p class="muted">精選 corpus 內相對連結：通過 {data.links.okCount}，損壞 {data.links.brokenCount}</p>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>來源</th><th>標籤</th><th>href</th><th>解析</th></tr></thead>
              <tbody>
                {#each data.links.broken as b}
                  <tr>
                    <td>{b.fromFile}</td>
                    <td>{b.label}</td>
                    <td><code>{b.href}</code></td>
                    <td>{b.resolved}</td>
                  </tr>
                {:else}
                  <tr><td colspan="4">沒有損壞的相對連結。</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {:else if route.name === 'features'}
        <div class="panel">
          <h1>功能導覽</h1>
          <p class="muted">v1 嵌入既有 HTML 導覽（見「下一步」）。由 Vite 掛載 <code>docs/features</code> 於 <code>/docs-static/features/</code>。</p>
          <p>
            <a class="btn" href="./docs-static/features/index.html" target="_blank" rel="noopener">新分頁開啟</a>
            <button type="button" class="btn" onclick={() => go({ name: 'dify-chatflow' })}>Dify Chatflow 配置</button>
          </p>
          <iframe
            class="feature-frame"
            title="NextOps 功能導覽"
            src="./docs-static/features/index.html"
          ></iframe>
        </div>
      {:else if route.name === 'dify-chatflow'}
        <div class="panel">
          <h1>Dify Chatflow Phase I</h1>
          <p class="muted">
            Interactive HTML guide for Studio nodes（開始 / LLM / 直接回覆）與 Tool Endpoint 參數。
            靜態檔在 <code>docs/features/dify-chatflow-setup.html</code>，經 <code>/docs-static/features/</code> 掛載。
          </p>
          <p>
            <a class="btn" href="./docs-static/features/dify-chatflow-setup.html" target="_blank" rel="noopener">新分頁開啟</a>
            <button type="button" class="btn" onclick={() => go({ name: 'doc', id: 'dify-setup' })}>文字版 dify-setup</button>
            <button type="button" class="btn" onclick={() => go({ name: 'doc', id: 'api-contract' })}>API 契約</button>
          </p>
          <iframe
            class="feature-frame"
            title="Dify Chatflow Phase I 配置指南"
            src="./docs-static/features/dify-chatflow-setup.html"
          ></iframe>
        </div>
      {:else if route.name === 'outbound'}
        <div class="panel">
          <h1>外連文件</h1>
          <p class="muted">ADR／設計／計畫 — 不在應用內閱讀器，改開原始檔。</p>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>群組</th><th>標題</th><th>檔案</th></tr></thead>
              <tbody>
                {#each data.outbound.items as item}
                  <tr>
                    <td>{item.group}</td>
                    <td>{item.title}</td>
                    <td><a href={githubBlobUrl(item.file)} target="_blank" rel="noopener">{item.file}</a></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {:else if route.name === 'future'}
        {@const futureDoc = data.corpus.docs.find((d) => d.id === 'future')}
        <div class="panel">
          <h1>下一步</h1>
          {#if futureDoc}
            <div class="toolbar">
              <a class="btn" href={githubBlobUrl(futureDoc.openSource)} target="_blank" rel="noopener">Open source</a>
            </div>
            <article class="prose">{@html futureDoc.html}</article>
          {:else}
            <p>找不到 FUTURE.md</p>
          {/if}
        </div>
      {/if}
    </main>
  </div>
{/if}
