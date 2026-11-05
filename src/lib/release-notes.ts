/**
 * Baked Release Notes catalog (ADR-0031). Ships in the dashboard image.
 */

export type ReleaseNoteRecord = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  guidance?: string;
};

export type ReleaseRecord = {
  version: string;
  notes: ReleaseNoteRecord[];
};

export type ReleaseNotesSnapshot = {
  runningVersion: string;
  lastRead: string | null;
  unread: boolean;
  releases: ReleaseRecord[];
};

export type ReleaseCatalog = {
  runningVersion: string;
  releases: ReleaseRecord[];
};

export type ReleaseMarkupInline =
  | { type: 'text'; value: string }
  | { type: 'link'; href: string; label: string };

export type ReleaseMarkupBlock =
  | { type: 'paragraph'; children: ReleaseMarkupInline[] }
  | { type: 'list'; items: ReleaseMarkupInline[][] };

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const SAME_ORIGIN_PATH_RE = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/\-]*$/;
const MD_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/** First numbered Release of the current dashboard (ADR-0031). Published Releases are frozen. */
export const RELEASE_NOTES_RAW: ReleaseRecord[] = [
  {
    version: '1.4.0',
    notes: [
      {
        id: '1.4.0-live-pod-diagnostics-reading',
        title: '應用即時狀態分析視窗顯示診斷閱讀',
        summary:
          '智能日誌流的 Live Pod Diagnostics 視窗在 Store 列就緒後，直接顯示診斷結論、健康分數、AI 診斷、資源／節點／風險與身分，不再只給原始列。',
        detail:
          '觸發應用即時狀態分析後，視窗標題仍依 Store 列是成功或失敗。成功時主畫面是這次診斷的閱讀：結論與健康分數、寫下的診斷、CPU／記憶體用量與上限、節點、重啟摘要與風險因素、命名空間／Pod／容器身分。結果列帶 pod 頁面 URL 時顯示「移至服務」（另開分頁），不是 Service Name。缺欄位就省略，不畫「未設定」。原始列仍可展開，且仍不顯示 Robusta Action Token。等待 Store 列時維持 pending，不改成頁面擋操作的 spinner。',
        guidance:
          '打開 [智能日誌流](/logs)。\n\n- 選恰好一列有 namespace 與 pod 的日誌，再按應用即時狀態分析\n- 成功後視窗直接讀診斷，不必自己拆 JSON\n- 「移至服務」會另開 pod 頁；沒有 URL 就不會出現該連結\n- Viewer 可打開已在進行或已完成的視窗，但不能觸發新的 Task',
      },
    ],
  },
  {
    version: '1.3.2',
    notes: [
      {
        id: '1.3.2-admin-gear-redirect',
        title: '齒輪（SRE 管理配置）進入時不再被踢出 NextOps',
        summary:
          'Header 齒輪點下去進入 /admin 後，會正確落到 /nextops/admin/sources；1.3.1 漏了這個 server-side redirect。',
        detail:
          '/admin 的 SvelteKit +page.ts loader 用 redirect(302, /admin/sources) 把使用者導去第一個分類，但沒帶上 Public Base Path，共享網域下瀏覽器會跟到 host root 被 tmdev 截去登入頁。1.3.1 的守門測試只掃 href / goto / EventSource / lib 回傳字串，沒攔 SvelteKit 的 redirect() 呼叫，因此這一支漏網。本版把該 redirect 補上 publicHref，並擴充守門測試把 redirect(<code>, /…) 也納入。',
        guidance:
          '這一版不需要 Cluster Operator 動作。已登入的 Operator 若之前點齒輪被跳到 tmdev，本版之後直接會落到 SRE 管理配置的資料源分頁。',
      },
    ],
  },
  {
    version: '1.3.1',
    notes: [
      {
        id: '1.3.1-public-base-path-navigation',
        title: '共享網域下的側欄與頁內連結不再跳出 NextOps',
        summary:
          '按齒輪、告警鈴、Robusta 調查歷史、告警中心的篩選／分頁與流水線逾時分析等連結，會留在 NextOps 內，不再被共享網域截去登入頁。',
        detail:
          '共享網域部署的 Public Base Path 是 /nextops。過去有一批連結與頁內跳轉（Header 齒輪 / 告警鈴、Robusta 調查歷史頁的 Site／時間窗／類別／分頁、告警中心的篩選與清空鑽取、告警趨勢圖桶格鑽取、流水線逾時分析、Dashboard 診斷入口與站點卡片、Site 頁的運維助手與智能日誌流、應用目錄的 GitLab 授權、應用上線與帳號安全內部連結、返回鏈接）以 / 開頭卻沒帶上 /nextops，瀏覽器與 SvelteKit 就把使用者送到共享網域根，被 tmdev 截去它自己的登入頁。SSE 連線（告警與聊天）同樣沒帶前綴。此版把所有站內連結、頁內跳轉、SSE 起始 URL 都補上 Public Base Path，並在測試層加了一支 repo-wide 守門測試，未來只要有人再寫 / 開頭的裸連結／goto／EventSource 就會被擋下。',
        guidance:
          '這一版不需要 Cluster Operator 動作。若之前遇到「點側欄或齒輪被跳到 tmdev 登入頁」的狀況，重載頁面即可恢復。SRE 若要新增連結，改寫時請務必用 publicHref(...) 包起來或用 $app/paths 的 base 前綴。',
      },
    ],
  },
  {
    version: '1.3.0',
    notes: [
      {
        id: '1.3.0-application-catalog',
        title: '應用目錄與 Application Registration',
        summary:
          '側欄新增應用目錄：可掛上或新建 GitLab Project，也可解除登記；Viewer 只讀。',
        detail:
          'Application 是 NextOps 目錄身分，對應唯一 GitLab Project 路徑，名稱不必等於 repo slug。Operator／Platform Owner 可登記（掛上既有或新建並寫一次 first commit）與解除登記；解除只刪目錄列，不刪 GitLab Project。Application Store 與 Local Settings Store 分開，帳號重種不會清掉目錄。',
        guidance:
          '打開 [應用目錄](/applications)。\n\n- 登記前先到自己的帳號頁連接 GitLab Access\n- 掛上：不改 GitLab 歷史\n- 新建：選資料夾或 zip，只寫一次 first commit\n- 解除登記不會刪遠端 repo',
      },
      {
        id: '1.3.0-gitlab-access',
        title: 'GitLab Access 與平台 Read Access',
        summary:
          '用 OAuth 取得個人 GitLab Access；Platform Owner 設定 OAuth Client 與平台唯讀憑證。',
        detail:
          'GitLab Access 綁在 Operator Account，不是 Session；過期只再挑戰 GitLab。GitLab OAuth Client 與 GitLab Read Access 是 Runtime Setting（需 Step-up）。登記時會把平台 Read Access 身分加進該 Project；失敗則不寫目錄列。',
        guidance:
          '- Operator：打開 [自己的帳號](/admin/account/me) → 連接 GitLab\n- Platform Owner：打開 [GitLab](/admin/gitlab) 設定 OAuth Client 與 Read Access\n- 不要用 PAT 或 GitLab 密碼當 GitLab Access',
      },
      {
        id: '1.3.0-application-online',
        title: '應用上線（Application Online）',
        summary: '側欄新增應用上線：NAME_SPACE 專案與成員、規格草稿；與應用目錄分開。',
        detail:
          '應用上線是另一條產品路徑（Spec／成員），不是應用目錄的 GitLab 登記。兩者可並存；Application Developer 角色用於 Online，不寫應用目錄。',
        guidance: '打開 [應用上線](/online)。應用目錄仍在 [應用目錄](/applications)。',
      },
      {
        id: '1.3.0-image-rollback',
        title: '發佈 1.3.0 後可退回上一張 image',
        summary:
          'Image-Only Deploy 會留下上一張 IMAGE_TAG；異常時用既有 rollback 腳本切回，不是改頁首版本號。',
        detail:
          '成功發佈後 VM 的 .nextops-rollout.json 記 current／previous（BUILD_SHA）。退回會把 compose 與 .env.prod 的 IMAGE_TAG 切到 previous，並保留剛退下的那張以便再前進。頁首更新說明顯示的是該 image 內建的 Release Version（例如退回後可能仍是 1.1.0）。',
        guidance:
          '發佈後若異常，由 SRE 在工作站執行：\n\n- WSL：`./scripts/shsdgx-rollout.sh status` 再 `./scripts/shsdgx-rollout.sh rollback`（輸入 ROLLBACK）\n- Windows：`.\\scripts\\shsdgx-rollout.ps1 rollback`\n- 等同：`./scripts/rollback-remote.sh`\n\n需 VM 仍有 `nextops:<previous>`，或工作站有 `nextops-<previous>.tar`。不要在部署後 prune 舊 nextops image。',
      },
    ],
  },
  {
    version: '1.2.0',
    notes: [
      {
        id: '1.2.0-operator-display-name',
        title: 'Operator Account 增加姓名',
        summary:
          '帳號安全可填 Operator Display Name（姓名）；Header 與聊天標籤優先顯示姓名，登入與 @ 仍用 Username。',
        detail:
          'Platform Owner 建立帳號時必填姓名，詳情可改但不可清空。既有帳號與 env seed 可暫時空白，補上後不可再清回空。姓名不唯一；禁止 OPSGPT。Accounts 清單與搜尋含姓名。頁首主標與 Operator Chat 名冊／訊息作者／DM 房間標題優先用姓名（空則 Username）；@ 提及與身分鍵仍是 Username。這不是可自訂的人員欄位 schema。',
        guidance:
          '打開 [帳號安全](/admin/account)。\n\n- 建立帳號時填「姓名」\n- 既有帳號到詳情補姓名\n- Header／聊天看到的是姓名；@ 與登入仍用 Username\n- 不要期望可新增任意人事欄位',
      },
    ],
  },
  {
    version: '1.1.0',
    notes: [
      {
        id: '1.1.0-account-admin',
        title: '帳號安全改成分頁',
        summary: '帳號安全分成 Accounts、Roles、自己的；Header 的 Username 依 Operator Role 進對應頁。',
        detail:
          'Platform Owner 在 Accounts 看清單（Username、Operator Email、Role、上次成功登入、Session 數、停用／Lockout／待綁 2FA），點 Username 進獨立詳情。建立 Operator Account 是另一頁，Temporary Password 只在該頁顯示一次。Roles 把既有 Operator Role 能力攤成只讀對照，不是 Runtime Setting，不能勾選。Operator 與 Viewer 從 Header 進自己的；Viewer 仍可看自己的 Session 與 Login Event，但不在此改 Lasting Password 或綁 TOTP。授權模型沒變：仍是三個全域 Operator Role，一帳一角。',
        guidance:
          '打開 [帳號安全](/admin/account)。\n\n- Platform Owner 看 Accounts；點 Username 進詳情，不是密碼表單\n- 建立帳號走獨立頁；Temporary Password 只顯示一次\n- Roles 只能對照能／不能\n- Operator／Viewer 從 Header Username 進自己的',
      },
      {
        id: '1.1.0-image-rollback',
        title: '部署可回上一張 image',
        summary: '成功部署會留下上一張 image；SRE 可把 compose 退回上一張，不是改 Release Version。',
        detail:
          'shsdgx Image-Only Deploy 在 VM 上記 current／previous 的 IMAGE_TAG（BUILD_SHA），並把 IMAGE_TAG 寫進 .env.prod。上一張 nextops:<tag> 不會在成功部署後刪掉。退回切的是 image 標籤，頁首更新說明仍顯示該 image 內建的 Release Version。',
        guidance:
          '值班若更新後異常，請 SRE 從工作站執行 scripts/rollback-remote.sh。這會切 IMAGE_TAG，不是把頁首版本改回 1.0.0。退回後頁首顯示的是那張 image 裡的 Release Version。',
      },
    ],
  },
  {
    version: '1.0.0',
    notes: [
      {
        id: '1.0.0-release-notes',
        title: '頁首更新說明',
        summary: '右上（聊天左邊）可查看這一版改了什麼；未讀會亮圓點。',
        detail:
          '從 1.0.0 起，NextOps 用更新說明告訴值班儀表板改了哪些行為。這不是告警、不是聊天，也不是文件探索中心。清單上每一條是一則摘要；點開可看細節與操作引導。',
        guidance:
          '打開頁首右上、聊天左邊的圖示。\n\n- 圓點表示目前版本還沒看過\n- 打開面板即標成已讀；較舊的版本仍留在清單裡\n- 引導裡的連結會進入該頁並關掉面板',
      },
      {
        id: '1.0.0-versioning',
        title: '產品版本 1.0.0',
        summary: '畫面上的版本是 1.0.0；部署 image 仍用 BUILD_SHA，兩者不是同一個號碼。',
        detail:
          '這一版是儀表板第一次用 Release Version 編號。沒有新的更新說明時，重打 image 不會加版。之後有新能力會加 minor，修正或文案會加 patch。',
        guidance: '之後若右上再亮圓點，打開即可看到新摘要。不必到管理配置裡找版本說明。',
      },
    ],
  },
];

export function parseReleaseVersion(version: string): [number, number, number] | null {
  const m = version.trim().match(SEMVER_RE);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareReleaseVersion(a: string, b: string): number {
  const pa = parseReleaseVersion(a);
  const pb = parseReleaseVersion(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function releaseNotesUnread(runningVersion: string, lastRead: string | null): boolean {
  if (!parseReleaseVersion(runningVersion)) return false;
  if (!lastRead || !parseReleaseVersion(lastRead)) return true;
  return compareReleaseVersion(runningVersion, lastRead) > 0;
}

export function isSameOriginPath(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//') || href.includes(':')) return false;
  return SAME_ORIGIN_PATH_RE.test(href);
}

export function parseReleaseMarkupInlines(text: string): ReleaseMarkupInline[] {
  const nodes: ReleaseMarkupInline[] = [];
  let last = 0;
  for (const match of text.matchAll(MD_LINK_RE)) {
    const full = match[0];
    const label = match[1] ?? '';
    const href = match[2] ?? '';
    const index = match.index ?? 0;
    if (index > last) nodes.push({ type: 'text', value: text.slice(last, index) });
    if (isSameOriginPath(href)) nodes.push({ type: 'link', href, label });
    else nodes.push({ type: 'text', value: full });
    last = index + full.length;
  }
  if (last < text.length) nodes.push({ type: 'text', value: text.slice(last) });
  if (nodes.length === 0) nodes.push({ type: 'text', value: text });
  return nodes;
}

export function parseReleaseMarkup(body: string): ReleaseMarkupBlock[] {
  const trimmed = body.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return [];
  const chunks = trimmed.split(/\n{2,}/);
  const blocks: ReleaseMarkupBlock[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n').filter((line) => line.trim() !== '');
    if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
      blocks.push({
        type: 'list',
        items: lines.map((line) => parseReleaseMarkupInlines(line.trim().replace(/^[-*]\s+/, ''))),
      });
      continue;
    }
    blocks.push({
      type: 'paragraph',
      children: parseReleaseMarkupInlines(chunk.replace(/\n/g, ' ').trim()),
    });
  }
  return blocks;
}

function requireNote(note: ReleaseNoteRecord, seenIds: Set<string>): void {
  const id = note.id?.trim();
  const title = note.title?.trim();
  const summary = note.summary?.trim();
  const detail = note.detail?.trim();
  if (!id) throw new Error('Release Note id is required');
  if (seenIds.has(id)) throw new Error(`Duplicate Release Note id: ${id}`);
  seenIds.add(id);
  if (!title) throw new Error(`Release Note ${id} is missing a title`);
  if (!summary) throw new Error(`Release Note ${id} is missing a summary`);
  if (!detail) throw new Error(`Release Note ${id} is missing detail`);
}

export function compileReleaseCatalog(raw: ReleaseRecord[]): ReleaseCatalog {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Release catalog must contain at least one Release');
  }
  const seenVersions = new Set<string>();
  const seenIds = new Set<string>();
  const releases: ReleaseRecord[] = [];
  for (const item of raw) {
    const version = item.version?.trim() ?? '';
    if (!parseReleaseVersion(version)) {
      throw new Error(`Invalid Release Version: ${item.version}`);
    }
    if (seenVersions.has(version)) throw new Error(`Duplicate Release Version: ${version}`);
    seenVersions.add(version);
    if (!Array.isArray(item.notes) || item.notes.length === 0) {
      throw new Error(`Release ${version} must contain at least one Release Note`);
    }
    const notes: ReleaseNoteRecord[] = [];
    for (const note of item.notes) {
      requireNote(note, seenIds);
      const compiled: ReleaseNoteRecord = {
        id: note.id.trim(),
        title: note.title.trim(),
        summary: note.summary.trim(),
        detail: note.detail.trim(),
      };
      const guidance = note.guidance?.trim();
      if (guidance) compiled.guidance = guidance;
      notes.push(compiled);
    }
    releases.push({ version, notes });
  }
  releases.sort((a, b) => compareReleaseVersion(b.version, a.version));
  return { runningVersion: releases[0].version, releases };
}

export const RELEASE_CATALOG = compileReleaseCatalog(RELEASE_NOTES_RAW);

export function getReleaseCatalog(): ReleaseCatalog {
  return RELEASE_CATALOG;
}
