const ROLE_LABEL = {
  application_developer: "Application Developer",
  operator: "Operator",
  platform_owner: "Platform Owner",
  viewer: "Viewer",
};

const state = {
  catalog: null,
  version: "1.2.0",
  filterMode: "upto",
  role: "application_developer",
  screenId: "nav-matrix",
  dirtyDockerfile: false,
  keepManual: false,
  mrOpened: false,
  publishedSha: "c3f91a2",
  devStatus: "idle",
  runtimeOk: false,
  bindingQa: false,
  hop: "dev",
  family: "promote",
  path: "dev→qa→uat→prod",
  sites: { lh: false, cq: false },
  glass: [],
};

function semverTuple(v) {
  return String(v)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}
function semverLte(a, b) {
  const A = semverTuple(a);
  const B = semverTuple(b);
  for (let i = 0; i < 3; i++) {
    if (A[i] < B[i]) return true;
    if (A[i] > B[i]) return false;
  }
  return true;
}

function visibleScreens() {
  const { catalog, version, filterMode } = state;
  return catalog.screens.filter((s) => {
    if (filterMode === "added-in") return s.versionAdded === version;
    return semverLte(s.versionAdded, version);
  });
}

function canRole(screen) {
  return screen.roles.includes(state.role);
}

const NAV_ICONS = {
  matrix:
    "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
  ai: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.785L16.5 21.75l-.394-.965a1.125 1.125 0 00-.83-.83L14.25 19.5l.965-.394a1.125 1.125 0 00.83-.83l.394-.965.394.965a1.125 1.125 0 00.83.83l.965.394-.965.394a1.125 1.125 0 00-.83.83z",
  logs: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  alerts:
    "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  robusta:
    "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0v3.75c0 .621.504 1.125 1.125 1.125h3.75m-1.5 4.5h-6m3 3H9.75M8.25 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  idp: "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
};

function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="${NAV_ICONS[name]}"/></svg>`;
}

function idpVisible() {
  return semverLte("1.2.0", state.version);
}

function isIdpScreen(screenId) {
  return Boolean(screenId) && !screenId.startsWith("nav-") && screenId !== "account-role";
}

function navIdFor(screenId) {
  const s = state.catalog?.screens.find((x) => x.id === screenId);
  if (s?.nav) return s.nav;
  if (screenId === "account-role") return "account";
  if (screenId.startsWith("nav-")) return screenId.slice(4);
  return "idp";
}

function aiLocked() {
  return state.role === "application_developer" || state.role === "viewer";
}

function idpTabs() {
  if (!idpVisible() || !isIdpScreen(state.screenId)) return "";
  const tabs = [
    ["idp-home", "首頁", ["application_developer", "operator", "platform_owner", "viewer"]],
    ["spec-pipeline", "Spec", ["application_developer", "operator", "platform_owner"]],
    ["spec-generate", "生成", ["application_developer", "operator", "platform_owner"]],
    ["spec-resources", "資源", ["application_developer", "operator", "platform_owner"]],
    ["spec-mr", "開 MR", ["application_developer", "operator", "platform_owner"]],
    ["dev-job", "Dev job", ["application_developer", "operator", "platform_owner"]],
    ["validate-dev", "驗證", ["application_developer", "operator", "platform_owner"]],
    ["runtime-check", "探活", ["application_developer", "operator", "platform_owner", "viewer"]],
    ["bindings", "Binding", ["operator", "platform_owner"]],
    ["ladder", "梯子", ["operator", "platform_owner"]],
    ["prod-sites", "Site", ["operator", "platform_owner"]],
    ["web-rebuild", "web-rebuild", ["application_developer", "operator", "platform_owner"]],
    ["break-glass", "破窗", ["operator", "platform_owner"]],
  ];
  return `<nav class="idp-tabs" aria-label="應用上線流程">${tabs
    .filter(([, , roles]) => roles.includes(state.role))
    .map(
      ([id, label]) =>
        `<button type="button" data-screen="${id}" class="${state.screenId === id ? "on" : ""}">${label}</button>`,
    )
    .join("")}</nav>`;
}

function shell(inner, title) {
  const nav = navIdFor(state.screenId);
  const lockAi = aiLocked();
  const items = [
    ["matrix", "全球矩陣大盤", false, false, false],
    ["ai", "運維助手", lockAi, false, false],
    ["logs", "智能日誌流", false, false, false],
    ["alerts", "告警中心", false, true, false],
    ["robusta", "Robusta 調查歷史", false, false, false],
  ];
  if (idpVisible()) items.push(["idp", "應用上線", false, false, true]);
  const navHtml = items
    .map(([id, label, locked, badge, isNew]) => {
      const on = nav === id ? " on" : "";
      const extra = id === "idp" ? " idp" : "";
      const lock = locked ? " lock" : "";
      const newb = isNew ? `<span class="new">新</span>` : "";
      const badgeEl = badge ? `<span class="nbadge">3</span>` : "";
      return `<a href="#${id}" data-nav="${id}" class="${on}${extra}${lock}">${icon(id)}<span>${label}</span>${newb}${badgeEl}</a>`;
    })
    .join("");
  const beforeAfter = idpVisible()
    ? `<p class="side-note">前五項與現行產品相同。第 6 項是「應用上線」，不取代大盤／助手／日誌／告警／Robusta。</p>`
    : `<p class="side-note">現行左側欄只有這五項。切到版本 1.2.0 會在最底下多出「應用上線」。</p>`;
  return `
  <div class="dash" role="region" aria-label="NextOps 畫面原型">
    <aside class="dash-side">
      <div class="logo">
        <div class="nmark">N</div>
        <div><b>NEXTOPS</b><small>AI OPS PLATFORM</small></div>
      </div>
      <nav class="nav" aria-label="主功能">${navHtml}</nav>
      ${beforeAfter}
      <div class="side-foot">
        <span class="who-pill">${ROLE_LABEL[state.role]}</span>
        <span class="muted">mc00991 · 在線</span>
      </div>
    </aside>
    <header class="dash-head">
      <h1><span class="tilde">~$</span> ${title}</h1>
      <div class="head-tools">
        <span class="muted">UTC+8</span>
        <button type="button" class="iconish" title="更新說明">說明</button>
        <button type="button" class="iconish" title="聊天">聊天</button>
        <button type="button" class="iconish" title="告警">告警<span class="nbadge">3</span></button>
        ${state.role === "platform_owner" && idpVisible() ? `<button type="button" class="iconish" data-nav="account">帳號</button>` : ""}
        <div class="who">${ROLE_LABEL[state.role]} · mc00991</div>
      </div>
    </header>
    <div class="dash-body">${idpTabs()}${inner}</div>
  </div>`;
}

function hops(active) {
  const order = ["dev", "qa", "uat", "prod-promote", "prod-lh"];
  const labels = { dev: "DEV", qa: "QA", uat: "UAT", "prod-promote": "PROMOTE", "lh": "LH", cq: "CQ" };
  const map = ["dev", "qa", "uat", "prod-promote"];
  return `<div class="hops" aria-label="晋升高路徑">
    ${map
      .map((id) => {
        let cls = "hop";
        if (id === active) cls += " on";
        else if (order.indexOf(id) < order.indexOf(active)) cls += " done";
        else cls += " locked";
        return `<div class="${cls}">${id === "prod-promote" ? "PROMOTE" : id.toUpperCase()}</div>`;
      })
      .join("")}
    <div class="hop ${state.sites.lh ? "done" : "locked"}">LH</div>
    <div class="hop ${state.sites.cq ? "done" : "locked"}">CQ</div>
  </div>
  <p class="stamp-note">路徑 ${state.path} · 家族 ${state.family} · pin ${state.publishedSha}</p>`;
}

function denied(screen) {
  return `<div class="denied">此畫面給 ${screen.roles.map((r) => ROLE_LABEL[r]).join("／")}。<br>請在上方切換角色。</div>`;
}

const screens = {
  "nav-matrix": () =>
    shell(
      `${
        idpVisible()
          ? `<div class="banner info">加上「應用上線」之後：左側前五項不動。新項在最底下「應用上線」。${
              state.role === "application_developer"
                ? "Developer 看得到大盤，但不能從這裡開診斷。"
                : ""
            }</div>`
          : `<div class="banner info">這是現行產品。左側只有五項。把館上版本切到 1.2.0 看第六項出現。</div>`
      }
      ${
        state.role === "application_developer" && idpVisible()
          ? `<div class="banner warn">上線工作請點左側第六項，不要走運維助手。</div>`
          : ""
      }
      <div class="kpi">
        <div class="kpi-card"><span>日誌健康</span><b>97.2%</b><small>Elasticsearch 索引正常</small></div>
        <div class="kpi-card"><span>流水線成功率</span><b>94.5%</b><small>jenkins_build_info · 24h</small></div>
        <div class="kpi-card hot"><span>逾時率</span><b>3.1%</b><small>可下鑽 Direct URL</small></div>
        <div class="kpi-card"><span>延遲 P99</span><b>423ms</b><small>跨 Site 聚合</small></div>
      </div>
      <h2 class="block-title">全球生產設施 · Site</h2>
      <div class="sites">
        <article class="site"><h3>龍華</h3><p>K8s CPU 62% · 告警 1</p></article>
        <article class="site"><h3>重慶</h3><p>K8s CPU 41% · 告警 0</p></article>
        <article class="site"><h3>煙台</h3><p>K8s CPU 55% · 告警 2</p></article>
      </div>
      <p class="muted">威海流水線場不是 Site，不會出現在這張卡片牆。</p>`,
      "全球矩陣大盤",
    ),

  "nav-ai": () =>
    shell(
      `${
        aiLocked()
          ? `<div class="banner warn">此角色不能開始 AI Diagnosis 回合（含聊天 @OPSGPT）。${
              state.role === "application_developer"
                ? idpVisible()
                  ? "請改走左側「應用上線」。"
                  : "1.2.0 才會在左側最底下加上線入口。"
                : "Viewer 只能看，不能送出。"
            }</div>`
          : `<div class="banner info">Operator／Owner 可綁 Site、問 資源熱點／重啟風險，或生成報告。</div>`
      }
      <div class="split">
        <div class="card">
          <h2>Site Health Brief</h2>
          <p class="muted">即時簡報 · 龍華 saturation 62%</p>
          <div class="bar"><i style="width:62%"></i></div>
        </div>
        <div class="card">
          <h2>OPSGPT</h2>
          <textarea ${aiLocked() ? "disabled" : ""} placeholder="${aiLocked() ? "此角色不能送出診斷" : "輸入問題…"}"></textarea>
          <button class="btn pri" type="button" ${aiLocked() ? "disabled" : ""}>送出</button>
        </div>
      </div>`,
      "運維助手",
    ),

  "nav-logs": () =>
    shell(
      `<div class="card">
        <h2>智能日誌流 · 龍華</h2>
        <p class="muted">Index Watchlist 已選 logs-lh-k8s-es-log-*</p>
        <table class="table">
          <tr><th>時間</th><th>服務名稱</th><th>status</th><th>message</th></tr>
          <tr><td class="mono">11:18:02</td><td>efactory-ap-7f9</td><td>200</td><td>health ok</td></tr>
          <tr><td class="mono">11:18:04</td><td>efactory-ap-7f9</td><td class="warn">502</td><td>upstream timeout</td></tr>
        </table>
      </div>`,
      "智能日誌流",
    ),

  "nav-alerts": () =>
    shell(
      `<div class="card">
        <h2>告警中心</h2>
        <table class="table">
          <tr><th>狀態</th><th>告警</th><th>Site</th></tr>
          <tr><td class="bad">firing</td><td>KubePodCrashLooping</td><td>煙台</td></tr>
          <tr><td class="warn">firing</td><td>NodeDiskPressure</td><td>龍華</td></tr>
          <tr><td class="ok">resolved</td><td>HighCPU</td><td>重慶</td></tr>
        </table>
        <p class="muted">Viewer 不能 acknowledge；Developer 同樣不能 ack（非 Operator）。</p>
      </div>`,
      "告警中心",
    ),

  "nav-robusta": () =>
    shell(
      `<div class="card">
        <h2>Robusta 調查歷史 · 龍華</h2>
        <p class="muted">Robusta Coverage 已部署 · 168h</p>
        <table class="table">
          <tr><th>時間</th><th>調查</th><th>status</th></tr>
          <tr><td class="mono">10:02</td><td>cpu_autoscale shop-api</td><td>scaled</td></tr>
          <tr><td class="mono">09:40</td><td>OOMKilled worker</td><td>open</td></tr>
        </table>
      </div>`,
      "Robusta 調查歷史",
    ),

  "account-role": () =>
    shell(
      `<div class="card">
        <h2>建立 Operator Account</h2>
        <div class="row">
          <div class="field"><label>Username</label><input value="lin.dev" readonly></div>
          <div class="field"><label>Operator Role</label>
            <select><option>Platform Owner</option><option>Operator</option><option selected>Application Developer</option><option>Viewer</option></select>
          </div>
        </div>
        <p class="muted" style="margin-top:.7rem">一個帳號一個角色。Developer 不能開診斷、不能改 Runtime Setting、不能管帳號。Project Membership 下一步才加。</p>
        <button class="btn pri" type="button">建立帳號</button>
      </div>`,
      "Operator Accounts",
    ),

  "idp-home": () => {
    if (state.role === "application_developer") {
      return shell(
        `${hops("dev")}
        <div class="card">
          <h2>我的 Project</h2>
          <table class="table">
            <tr><th>NAME_SPACE</th><th>路徑</th><th>Membership</th></tr>
            <tr><td class="mono">efactory</td><td>dev→qa→uat→prod</td><td>可填 Spec</td></tr>
          </table>
          <p class="muted">看不到 control-tower：沒有 Project Membership。</p>
          <button class="btn pri" data-screen="spec-pipeline" type="button">填 Pipeline 區塊</button>
        </div>`,
        "應用上線",
      );
    }
    if (state.role === "viewer") {
      return shell(
        `<div class="banner info">只讀。不能加人、不能送 MR、不能放行。</div>
        <div class="card"><h2>Project 清單</h2><p class="mono">efactory · factorygpt</p></div>`,
        "應用上線",
      );
    }
    return shell(
      `${hops("dev")}
      <div class="card">
        <h2>Project Membership</h2>
        <table class="table">
          <tr><th>Project</th><th>Developer</th><th></th></tr>
          <tr><td>efactory</td><td>lin.dev</td><td><button class="btn" data-act="noop" type="button">移出</button></td></tr>
          <tr><td>efactory</td><td>
            <select><option>chen.qa</option></select>
            <button class="btn pri" type="button">加入</button>
          </td><td></td></tr>
        </table>
        <p class="muted">開帳號仍是 Platform Owner。Operator 只能把既有 Developer 加進 Project。大盤／助手／日誌／告警／Robusta 權限不變。</p>
        <button class="btn" data-screen="spec-pipeline" type="button">看 Spec</button>
        <button class="btn" data-screen="bindings" type="button">Binding</button>
        <button class="btn pri" data-screen="ladder" type="button">晋升高梯子</button>
      </div>`,
      "應用上線",
    );
  },

  "spec-pipeline": () =>
    shell(
      `${hops("dev")}
      <div class="card">
        <h2>Pipeline 區塊 · eFactory-ap</h2>
        <div class="row3">
          <div class="field"><label>NAME_SPACE</label><input value="efactory"></div>
          <div class="field"><label>APP_NAME</label><input value="efactory-ap"></div>
          <div class="field"><label>家族</label>
            <select data-field="family">
              <option value="promote" ${state.family === "promote" ? "selected" : ""}>promote</option>
              <option value="web-rebuild" ${state.family === "web-rebuild" ? "selected" : ""}>web-rebuild</option>
            </select>
          </div>
          <div class="field"><label>Promotion Path</label>
            <select data-field="path">
              <option>dev→qa→uat→prod</option>
              <option>dev→uat→prod</option>
              <option>dev→prod</option>
              <option>dev→qa→prod</option>
            </select>
          </div>
          <div class="field"><label>GITLAB_URL</label><input value="https://gitlab-hep.corp.example.com/smfg/ssa/efactory/efactory.git"></div>
          <div class="field"><label>PACKAGING_COMMAND</label><input value="mvn clean package -Pservice -DskipTests"></div>
        </div>
        <p class="muted">不要寫 efactory-ap-dev。K8s namespace 在 Landing／overlay，不是 NAME_SPACE。</p>
        <button class="btn pri" data-act="toast-draft" type="button">存草稿</button>
      </div>`,
      "Service Deploy Spec",
    ),

  "spec-generate": () =>
    shell(
      `${hops("dev")}
      <div class="card">
        <h2>生成預覽</h2>
        <div class="row">
          <div class="field"><label>base image</label>
            <select><option>192.0.2.6:30002/base/rockylinux8-openjdk21:2025-01</option></select>
          </div>
          <div class="field"><label>port / CPU / Memory</label><input value="8080 · 1 · 2G"></div>
        </div>
        <pre class="preview">${state.dirtyDockerfile && state.keepManual
          ? "FROM scratch\n# 已手工調整 — 欄位變更不會覆蓋"
          : `FROM 192.0.2.6:30002/base/rockylinux8-openjdk21:2025-01
WORKDIR /app
ADD target/*.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]`}</pre>
        <p class="muted">${state.dirtyDockerfile ? "狀態：已手工調整。下次改欄位必須選重新生成或保留手工。" : "FROM 來自中央 base-images.yaml。"}</p>
        <button class="btn" data-act="dirty" type="button">模擬手工改 Dockerfile</button>
        ${state.dirtyDockerfile
          ? `<button class="btn" data-act="regen" type="button">依欄位重新生成</button>
             <button class="btn pri" data-act="keep" type="button">保留手工</button>`
          : ""}
      </div>`,
      "Dockerfile / Overlay",
    ),

  "spec-resources": () =>
    shell(
      `${hops("dev")}
      <div class="banner info">Resource Request 可空。空 sheet = 無此需求。不擋存草稿、不擋 Dev。</div>
      <div class="card">
        <h2>DB 需求</h2>
        <div class="row">
          <div class="field"><label>類型</label><input value="SQLServer"></div>
          <div class="field"><label>環境</label><input value="QA／Prod（Dev 可後補）"></div>
        </div>
        <p class="warn">密碼另外提供，不會進 Git MR。</p>
      </div>
      <div class="card">
        <h2>MinIO</h2>
        <p class="muted">未填 → 視為不需要。</p>
      </div>`,
      "Resource Request",
    ),

  "spec-mr": () =>
    shell(
      `${hops("dev")}
      ${
        state.mrOpened
          ? `<div class="banner ok">機器帳號已開 MR !4321 · Operator 用自己的 GitLab 帳號 merge。Bot 不能 push main。</div>`
          : `<div class="banner info">送出後寫入 deploy/efactory/efactory-ap/ ，不複製 Jenkinsfile。</div>`
      }
      <div class="card">
        <h2>將發表的檔</h2>
        <ul class="mono">
          <li>deploy/efactory/efactory-ap/Dockerfile</li>
          <li>deploy/efactory/efactory-ap/pipeline-params.yaml</li>
          <li>deploy/efactory/efactory-ap/deploy-yaml/base/*</li>
          <li>deploy/efactory/efactory-ap/deploy-yaml/overlays/{dev,qa,uat,prod}/*</li>
        </ul>
        <button class="btn pri" data-act="open-mr" type="button">送出並開 MR</button>
      </div>`,
      "送出 Spec",
    ),

  "dev-job": () =>
    shell(
      `${hops("dev")}
      <div class="card">
        <h2>發表後</h2>
        <p>published SHA <span class="mono ok">${state.publishedSha}</span></p>
        <p>KubeSphere job：<span class="mono">efactory-ap-dev</span> 掛 Jenkinsfile-dev · 憑證 id only</p>
        <p class="muted">沒有 qa/uat/prod job。Dockerfile 不存在 job 參數裡。</p>
      </div>`,
      "Dev job",
    ),

  "validate-dev": () =>
    shell(
      `${hops("dev")}
      <div class="card">
        <h2>在 Dev 驗證</h2>
        <p class="muted">跑 pin SHA ${state.publishedSha} · 預設分支 main。不是 merge 自動跑。</p>
        <p>狀態：<strong class="${state.devStatus === "green" ? "ok" : ""}">${
          state.devStatus === "green" ? "通過（到 kubectl apply）" : "尚未跑"
        }</strong></p>
        <button class="btn pri" data-act="run-dev" type="button" ${
          state.role === "viewer" ? "disabled" : ""
        }>在 Dev 驗證</button>
      </div>`,
      "在 Dev 驗證",
    ),

  "runtime-check": () =>
    shell(
      `${hops("dev")}
      <div class="banner ${state.runtimeOk ? "ok" : "warn"}">
        Jenkins apply 後探活：${state.runtimeOk ? "就緒" : "未就緒（job 仍綠）"}。Callback Token 回寫應用上線。
      </div>
      <div class="card">
        <h2>配置檢查</h2>
        <ul>
          <li class="warn">QA SQLServer 尚未 Environment Binding</li>
          <li class="ok">Pipeline 區塊完整</li>
          <li class="ok">FROM 在 base-images 清單</li>
        </ul>
        <button class="btn" data-act="runtime-ok" type="button">模擬探活轉綠</button>
      </div>`,
      "Runtime Check",
    ),

  bindings: () =>
    shell(
      `${hops("dev")}
      <div class="card">
        <h2>QA Environment Binding</h2>
        <div class="row">
          <div class="field"><label>DB host</label><input value="192.0.2.7"></div>
          <div class="field"><label>K8s namespace</label><input value="efactory-qa"></div>
        </div>
        <p class="muted">密碼不進 Git。沒 Binding 不能放行 QA；Dev 仍可驗證。</p>
        <button class="btn ok" data-act="bind-qa" type="button">儲存 Binding</button>
        ${state.bindingQa ? `<p class="ok">QA Binding 已齊，可開 QA job。</p>` : `<p class="warn">放行 QA 會被擋住。</p>`}
      </div>`,
      "Environment Binding",
    ),

  ladder: () =>
    shell(
      `${hops(state.hop)}
      <div class="card">
        <h2>放行下一跳</h2>
        <p class="muted">上一跳必須 apply 綠。SOURCE_IMAGE 來自上一跳 Harbor，不是寫死 QA。</p>
        <p>目前 hop：<span class="mono">${state.hop}</span></p>
        <button class="btn pri" data-act="release-qa" type="button">開 QA</button>
        <button class="btn" data-act="release-uat" type="button">開 UAT</button>
        <button class="btn" data-act="release-promote" type="button">開 prod-promote</button>
      </div>`,
      "晋升高梯子",
    ),

  "prod-sites": () =>
    shell(
      `${hops("prod-promote")}
      <div class="card">
        <h2>同一 -release digest</h2>
        <p class="mono">harbor-hep.corp.example.com/efactory/efactory-ap-release:1.4.2</p>
        <p>prod-promote 已做资安 + push。Site job 只 kubectl。</p>
        <label><input type="checkbox" data-site="lh" ${state.sites.lh ? "checked" : ""}> 放行 prod-lh</label><br>
        <label><input type="checkbox" data-site="cq" ${state.sites.cq ? "checked" : ""}> 放行 prod-cq</label>
        <p class="muted">煙台未放行 = 沒有 job。NAME_SPACE 仍是 efactory，不是 efactory-cq。</p>
      </div>`,
      "Site 落地",
    ),

  "web-rebuild": () =>
    shell(
      `${hops("dev")}
      <div class="banner warn">家族 web-rebuild：每一跳掛 Jenkinsfile-*-web，重編 npm，不 copy digest。</div>
      <div class="card">
        <h2>eFactory-web</h2>
        <p>Dev / QA / UAT / Prod 都編譯。Pipeline SHA 仍要 pin。</p>
        <button class="btn" data-act="set-web" type="button">切到 web-rebuild 演示</button>
        <button class="btn" data-act="set-promote" type="button">切回 promote</button>
      </div>`,
      "web-rebuild",
    ),

  "break-glass": () =>
    shell(
      `${hops(state.hop)}
      <div class="card">
        <h2>Break-glass</h2>
        <p class="muted">Developer 不能用。每次要原因，寫進應用上線紀錄。</p>
        <input placeholder="原因" id="glass-why" style="width:100%;margin-bottom:.5rem">
        <button class="btn bad" data-act="glass" type="button">略過 QA Binding 閘</button>
        <ul>${state.glass.map((g) => `<li class="mono">${g}</li>`).join("") || "<li class='muted'>尚無紀錄</li>"}</ul>
      </div>`,
      "Break-glass",
    ),

  "vm-family-stub": () =>
    shell(
      `<div class="banner info">versionAdded 1.3.0 占位。篩選「僅 1.2.0 新增」時這頁不會出現。</div>
      <div class="card"><h2>VM container / ssh</h2><p class="muted">PRD #18 Out of Scope。之後加 catalog 一筆即可擴展。</p></div>`,
      "預留",
    ),
};

function renderList() {
  const ul = document.getElementById("screen-list");
  const vis = visibleScreens();
  let html = "";
  let grp = "";
  for (const s of vis) {
    if (s.group !== grp) {
      grp = s.group;
      html += `<div class="grp">${grp}</div>`;
    }
    html += `<li><button type="button" data-screen="${s.id}" class="${s.id === state.screenId ? "active" : ""} ${
      s.status === "planned" ? "planned" : ""
    }">${s.title}<span class="ver-pill">${s.versionAdded}</span></button></li>`;
  }
  ul.innerHTML = html || "<li class='muted'>此篩選沒有畫面</li>";
}

function renderStage() {
  if (!idpVisible() && (isIdpScreen(state.screenId) || state.screenId === "account-role")) {
    state.screenId = "nav-matrix";
  }
  const screen = state.catalog.screens.find((s) => s.id === state.screenId);
  const host = document.getElementById("stage");
  if (!screen) {
    host.innerHTML = "";
    return;
  }
  document.getElementById("meta").innerHTML = `<strong>${screen.title}</strong>
    · v${screen.versionAdded}${screen.ticket ? ` · #${screen.ticket}` : ""} · ${ROLE_LABEL[state.role]}`;
  if (!canRole(screen)) {
    host.innerHTML = shell(denied(screen), screen.title);
    return;
  }
  host.innerHTML = screens[screen.id]();
}

function render() {
  renderList();
  renderStage();
}

function toast(msg) {
  const bar = document.getElementById("flash");
  bar.textContent = msg;
  bar.hidden = false;
  setTimeout(() => {
    bar.hidden = true;
  }, 2200);
}

document.addEventListener("DOMContentLoaded", async () => {
  state.catalog = await (await fetch("catalog.json")).json();
  const ver = document.getElementById("version");
  ver.innerHTML = state.catalog.releases
    .map((r) => `<option value="${r.version}">${r.version} · ${r.title}</option>`)
    .join("");
  ver.value = state.version;
  document.getElementById("mode").innerHTML = state.catalog.filterModes
    .map((m) => `<option value="${m.id}">${m.label}</option>`)
    .join("");

  ver.addEventListener("change", (e) => {
    state.version = e.target.value;
    render();
  });
  document.getElementById("mode").addEventListener("change", (e) => {
    state.filterMode = e.target.value;
    render();
  });
  document.getElementById("roles").addEventListener("click", (e) => {
    const b = e.target.closest("[data-role]");
    if (!b) return;
    state.role = b.dataset.role;
    for (const x of document.querySelectorAll("[data-role]")) x.setAttribute("aria-pressed", String(x === b));
    render();
  });
  document.getElementById("screen-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-screen]");
    if (!b) return;
    state.screenId = b.dataset.screen;
    render();
  });
  document.getElementById("stage").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "toast-draft") toast("草稿已寫入（假）");
    if (act === "dirty") {
      state.dirtyDockerfile = true;
      state.keepManual = false;
      render();
    }
    if (act === "regen") {
      state.dirtyDockerfile = false;
      state.keepManual = false;
      render();
    }
    if (act === "keep") {
      state.keepManual = true;
      render();
    }
    if (act === "open-mr") {
      state.mrOpened = true;
      render();
      toast("已開 MR（機器帳號）");
    }
    if (act === "run-dev") {
      state.devStatus = "green";
      state.hop = "dev";
      render();
    }
    if (act === "runtime-ok") {
      state.runtimeOk = true;
      render();
    }
    if (act === "bind-qa") {
      state.bindingQa = true;
      render();
    }
    if (act === "release-qa") {
      if (!state.bindingQa) {
        toast("QA Binding 未齊，放行被拒");
        return;
      }
      if (state.devStatus !== "green") {
        toast("Dev 尚未 apply 綠");
        return;
      }
      state.hop = "qa";
      render();
    }
    if (act === "release-uat") {
      if (state.hop !== "qa") {
        toast("必須先放行 QA");
        return;
      }
      state.hop = "uat";
      render();
    }
    if (act === "release-promote") {
      if (state.hop !== "uat") {
        toast("完整路徑下 Prod 從 UAT 拉 digest");
        return;
      }
      state.hop = "prod-promote";
      render();
    }
    if (act === "set-web") {
      state.family = "web-rebuild";
      render();
    }
    if (act === "set-promote") {
      state.family = "promote";
      render();
    }
    if (act === "glass") {
      const why = document.getElementById("glass-why")?.value || "未填原因";
      state.glass.push(`${new Date().toISOString().slice(11, 19)} ${state.role} ${why}`);
      state.bindingQa = true;
      render();
    }
    const jump = e.target.closest("[data-screen]")?.dataset.screen;
    if (jump) {
      state.screenId = jump;
      render();
      return;
    }
    const nav = e.target.closest("[data-nav]")?.dataset.nav;
    if (nav) {
      e.preventDefault();
      const map = {
        matrix: "nav-matrix",
        ai: "nav-ai",
        logs: "nav-logs",
        alerts: "nav-alerts",
        robusta: "nav-robusta",
        idp: "idp-home",
        account: "account-role",
      };
      state.screenId = map[nav] || "idp-home";
      render();
    }
    const site = e.target.closest("[data-site]");
    if (site?.dataset.site) {
      state.sites[site.dataset.site] = site.checked;
      render();
    }
  });
  document.getElementById("stage").addEventListener("change", (e) => {
    if (e.target.dataset.field === "family") state.family = e.target.value;
    if (e.target.dataset.field === "path") state.path = e.target.value;
    if (e.target.dataset.field) render();
  });
  render();
});
