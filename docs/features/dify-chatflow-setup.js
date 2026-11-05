/**
 * Dify Chatflow Phase I setup guide — interactive steps, copy, checklist.
 */
(function () {
  const STORAGE_KEY = 'nextops-dify-chatflow-checklist-v1';
  const STEP_DONE_KEY = 'nextops-dify-chatflow-steps-v1';

  const SYSTEM_PROMPT = `你是 NextOps 運維助手（OPSGPT）。你透過 Tool Endpoints 取得真實叢集資料後，再用繁體中文給出 Diagnosis Answer。

## Site Binding
- 若 inputs.site_id 非空：優先用該值作為 siteId 呼叫 metrics 工具。
- 若為空，或使用者問的是另一個 Site：先呼叫 list_sites，把使用者用語（例如「龍華」）對到回傳的 siteId（不要用 clusterTag 當 path）。
- path 的 siteId 必須 URL-encode；工具參數請填 catalog 的 siteId 字串。

## 何時必須呼叫工具
- 任何涉及資源用量、運行狀態、負載、告警、節點/容器健康的問題：在回答前必須取得 siteId，並至少呼叫 get_site_resource_health；需要告警/總覽時再呼叫 get_site_overview；需要索引/中繼資料時呼叫 describe_site。
- 禁止要求使用者貼 CPU%、記憶體%、Load 等數字來代替工具結果。
- 純知識／名詞解釋且不涉及某 Site 現況時，可不呼叫工具。

## 回答
- 只根據工具回傳的 JSON 做判斷；工具失敗或 partial 時明確說明缺哪一塊，不要編造用量。
- 輸出自然語言（可用 markdown 表格）。不要假設 NextOps 會解析你的 JSON；最終回覆就是給操作員看的 Diagnosis Answer。`;

  const toastEl = document.getElementById('toast');

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('已複製到剪貼簿');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('已複製到剪貼簿');
    }
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* —— Copy buttons —— */
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-copy');
      const el = id ? document.getElementById(id) : null;
      const text = el ? el.textContent : btn.getAttribute('data-copy-text') || '';
      copyText(text.trim());
    });
  });

  const promptBtn = document.getElementById('copy-system-prompt');
  if (promptBtn) {
    promptBtn.addEventListener('click', () => copyText(SYSTEM_PROMPT));
  }

  /* —— Step done flags —— */
  const stepDone = loadJson(STEP_DONE_KEY, {});

  function syncStepUi() {
    document.querySelectorAll('.step-card[data-step]').forEach((card) => {
      const id = card.getAttribute('data-step');
      const done = Boolean(stepDone[id]);
      card.classList.toggle('is-done', done);
      const cb = card.querySelector('input[data-step-done]');
      if (cb) cb.checked = done;
      const railBtn = document.querySelector(`.step-rail button[data-step="${id}"]`);
      if (railBtn) railBtn.classList.toggle('is-done', done);
    });
  }

  document.querySelectorAll('input[data-step-done]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-step-done');
      stepDone[id] = cb.checked;
      saveJson(STEP_DONE_KEY, stepDone);
      syncStepUi();
    });
  });

  /* —— Rail + flow highlight —— */
  const railButtons = document.querySelectorAll('.step-rail button[data-step]');
  const flowNodes = {
    env: document.getElementById('flow-env'),
    start: document.getElementById('flow-start'),
    tools: document.getElementById('flow-tools'),
    llm: document.getElementById('flow-llm'),
    answer: document.getElementById('flow-answer'),
    publish: document.getElementById('flow-publish')
  };

  const stepToFlow = {
    '1': ['env'],
    '2': ['start'],
    '3': ['tools'],
    '4': ['llm'],
    '5': ['answer'],
    '6': ['publish'],
    verify: ['start', 'llm', 'answer']
  };

  function lightFlow(keys) {
    Object.values(flowNodes).forEach((n) => n && n.classList.remove('is-lit'));
    (keys || []).forEach((k) => {
      if (flowNodes[k]) flowNodes[k].classList.add('is-lit');
    });
  }

  function activateStep(id) {
    railButtons.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-step') === id));
    lightFlow(stepToFlow[id] || []);
    const card = document.querySelector(`.step-card[data-step="${id}"]`);
    if (card) {
      card.open = true;
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  railButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateStep(btn.getAttribute('data-step')));
  });

  document.querySelectorAll('.step-card[data-step]').forEach((card) => {
    card.addEventListener('toggle', () => {
      if (card.open) {
        const id = card.getAttribute('data-step');
        railButtons.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-step') === id));
        lightFlow(stepToFlow[id] || []);
      }
    });
  });

  /* —— TOC active on scroll —— */
  const tocLinks = document.querySelectorAll('nav.toc a[href^="#"]');
  const sections = [...tocLinks]
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  function updateToc() {
    let current = sections[0];
    const y = window.scrollY + 80;
    for (const s of sections) {
      if (s.offsetTop <= y) current = s;
    }
    tocLinks.forEach((a) => {
      a.classList.toggle('is-active', a.getAttribute('href') === `#${current.id}`);
    });
  }

  window.addEventListener('scroll', updateToc, { passive: true });
  updateToc();

  /* —— Verification checklist —— */
  const checks = loadJson(STORAGE_KEY, {});
  const checkItems = document.querySelectorAll('[data-check]');
  const progressBar = document.getElementById('check-progress');
  const progressLabel = document.getElementById('check-progress-label');

  function syncChecks() {
    let done = 0;
    checkItems.forEach((input) => {
      const id = input.getAttribute('data-check');
      input.checked = Boolean(checks[id]);
      const li = input.closest('li');
      if (li) li.classList.toggle('done', input.checked);
      if (input.checked) done += 1;
    });
    const total = checkItems.length || 1;
    const pct = Math.round((done / total) * 100);
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressLabel) progressLabel.textContent = `${done} / ${total}（${pct}%）`;
  }

  checkItems.forEach((input) => {
    input.addEventListener('change', () => {
      checks[input.getAttribute('data-check')] = input.checked;
      saveJson(STORAGE_KEY, checks);
      syncChecks();
    });
  });

  const resetBtn = document.getElementById('reset-progress');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      Object.keys(checks).forEach((k) => delete checks[k]);
      Object.keys(stepDone).forEach((k) => delete stepDone[k]);
      saveJson(STORAGE_KEY, checks);
      saveJson(STEP_DONE_KEY, stepDone);
      syncChecks();
      syncStepUi();
      showToast('進度已重設');
    });
  }

  syncChecks();
  syncStepUi();
  lightFlow(['start', 'llm', 'answer']);
})();
