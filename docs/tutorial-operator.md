# Cluster Operator 操作教學

> **對象：** Cluster Operator（SRE / DevOps）  
> **語言：** 繁體中文（與 UI 標籤一致）  
> **前置條件：** 見 [本地開發](local-development.md)、[設定參考](configuration.md)

本教學帶你走完 NextOps 日常維運流程：登入 → 全球矩陣大盤 → 智能日誌流 → 告警中心 → AI 診斷 → 管理配置 → 上游診斷。

術語對照見專案根目錄 [CONTEXT.md](../CONTEXT.md)。

---

## 0. 導覽模型

NextOps 主導覽分三層：

| 層級 | 位置 | 項目 |
|------|------|------|
| 側邊欄 | 左側固定 | 全球矩陣大盤、運維助手、智能日誌流、告警中心、Robusta 調查歷史、運維點檢、應用目錄、應用上線 |
| 頂部列 | Header | 管理配置（`/admin`）、告警徽章、一鍵點檢 |
| 情境連結 | 頁面內 | Site 卡片 → Site Detail；診斷橫幅 → 上游診斷 |

### 直接 URL 路由 {#直接-url-路由}

部分頁面為**刻意不在側邊欄**的 **Direct URL Route**（見 [CONTEXT.md](../CONTEXT.md)）。功能完整可用，但需直接輸入 URL 或從情境入口進入：

| 路徑 | 進入方式 | 說明 |
|------|----------|------|
| `/ai` | 側邊欄「運維助手」，或從運維點檢抽屜「交給 GE Agent 分析」 | AI 診斷。運維點檢只帶入項目與日期，不在抽屜裡編造結論 |
| `/ops-check` | 側邊欄「運維點檢」 | 雲平台服務點檢。CaaS 為 Prometheus；SaaS 列標示示範資料。寄送與 Runbook 都要另外按 |
| `/admin/diagnosis` | 大盤紅色「系統診斷警報」橫幅 → **查看診斷詳情** | 僅在上游失敗活躍時出現入口 |

此為產品設計決策，非遺漏。側邊欄維持精簡，專注監控與告警；AI 診斷與上游診斷透過文件與情境連結教學即可。

---

## 1. 首次登入

**路徑：** `/login`

1. 開啟 NextOps URL（本地開發預設 `http://localhost:5173`）。
2. 未登入時，系統會自動導向登入頁。
3. 輸入**管理員密碼**（對應環境變數 `NEXTOPS_ADMIN_PASS`；使用者名稱固定為 `admin`）。
4. 點擊 **登入系統**。
5. 成功後設定 `session` Cookie，並導向 **全球矩陣大盤**（`/`）。

**登出：** 側邊欄底部 **登出** 按鈕 → `POST /api/auth/logout` → 回到 `/login`。

> 若密碼錯誤，頁面顯示「密碼錯誤」。若 API 無法連線，顯示「網路連接失敗，請檢查網路」。

---

## 2. 全球矩陣大盤（Global Matrix Dashboard）

**路徑：** `/`  
**側邊欄：** 全球矩陣大盤  
**頁面標題：** 混合資源 調度指揮中心

登入後的預設首頁，提供跨 Site 的全局視圖。

### 2.1 KPI 指標列

頂部四張 KPI 卡片（每 30 秒自動刷新，卡片上顯示倒數計時）：

| KPI 標籤 | 資料來源 | 說明 |
|----------|----------|------|
| 服務響應整體健康度 | Prometheus（全局） | 日誌管線健康分數（%） |
| 服務響應平均延遲 | Prometheus（全局） | 平均回應延遲（ms） |
| 流水線成功率 | MySQL `jenkins_build_info` | CI 建置成功率（%） |
| 流水線超時率 | MySQL | 建置超時率（%） |

若上游不可用（Prometheus 或 MySQL 查詢失敗），該 KPI 卡片顯示**紅色邊框**、錯誤圖示與上游錯誤訊息（例如 `UPSTREAM_ERROR`），**不會**顯示占位數值。

### 2.2 告警趨勢圖

KPI 下方為 **告警趨勢圖**（Alert Trend Chart），呈現近期 firing 告警的時間分布，協助判斷是否出現集中爆發。若告警資料無法載入，圖表顯示錯誤狀態；在尚未收到任何 Alertmanager Webhook 前，圖表為空（**不會**種入演示告警）。

### 2.3 Site 卡片網格

**全球生產設施 · 資源監控** 區塊列出所有已設定 Site（例如 龍華-生產、重慶-生產、越南-生產）。

每張卡片顯示：

- K8S / 節點的 CPU、記憶體、磁碟使用率
- OS 節點、K8S 節點、Pod 就緒數量
- 告警數量（critical + warning）

**點擊卡片** → 進入 **Site Detail**（`/sites/[siteId]`），`siteId` 為 Site 顯示名稱（需 URL 編碼）。

### 2.4 上游錯誤狀態（Upstream Error State）

NextOps **不內嵌**演示 Site、指標或告警。當 Prometheus、MySQL 或 Site 設定不可達時，大盤顯示明確錯誤狀態，操作者必須修復上游連線（見 [CONTEXT.md](../CONTEXT.md) 詞彙「Upstream Error State」）。

| 失敗情境 | UI 表現 |
|----------|---------|
| `/api/sites` 清單失敗 | Site 網格區顯示錯誤面板與 **重試** |
| 單一 Site overview 失敗 | 該 **Site 卡片**紅色邊框 + 錯誤圖示 + 上游錯誤訊息 |
| 全局 KPI / 流水線 API 失敗 | 對應 **KPI 卡片**紅色邊框 + 錯誤圖示 + 上游錯誤訊息 |
| 告警趨勢資料無法載入 | 圖表錯誤狀態；無 Webhook 時為空 |

**本地開發：** 須在 `.env` 指向可連線的上游，否則會看到上述錯誤狀態（見 [本地開發](local-development.md)）。**生產環境**若長期出現紅框卡片，表示上游或 API 異常，應排查連線與設定（見 §7 上游診斷）。

### 2.5 系統診斷警報橫幅

當後端偵測到 **Upstream Diagnosis** 活躍錯誤時，頁面頂部出現紅色橫幅：

- 標題：「系統診斷警報: N 個服務檢測到異常」
- 列出受影響服務（如 `Elasticsearch`、`Prometheus (Global)`、`MySQL Database`、`Prometheus (龍華-生產)`）
- **查看診斷詳情** → `/admin/diagnosis`

---

## 3. 智能日誌流（Smart Logging）

**路徑：** `/logs`  
**側邊欄：** 智能日誌流

透過 SSE 從 Elasticsearch 串流日誌（非 WebSocket）。頁面**必須先選一個 Site**，並在 Index Watchlist 裡至少有一個 index family，串流才會連線。

### 3.1 開始串流

1. 側邊欄點 **智能日誌流**。
2. 上方 **Site** 選一個有 Factory Code 的站點。
3. 若尚未設定 Watchlist，會出現 **Site Index Catalog**：用模糊或 Regex 搜尋 `logs-{factoryCode}-*` 底下的 family，勾選至少一個，按 **存成 Watchlist**。
4. **Active index** 只會查 Watchlist 裡**目前這一個** pattern（不是全部聯集）。
5. 時間預設（5m / 15m / 1h / 24h）與 Keyword 可再縮小範圍。連線成功後表頭出現 LIVE，列開始進來。

沒有 Watchlist 時 SSE **不會**連線（空狀態：「Watchlist required」）。這是設計，不是故障。

### 3.2 篩選與展開

| 控制項 | 作用 |
|--------|------|
| Site | 必選，單一站點 |
| Active index | Watchlist 裡目前查詢的 family |
| Time | 5m / 15m / 1h / 24h |
| Keyword | ES `query_string` |
| Interval | 伺服器輪詢 ES 的間隔 |
| Document Filter | 展開一列 → 欄位表或 JSON Tree，點欄位值加入／取消 term filter |
| Log Category | 可點的規則（錯誤詞 / 5xx / Timeout / 連線失敗），點下去當過濾 |

主列**沒有** Mode、Namespace、Pod、level 下拉。要依 pod / namespace 縮小範圍：展開 JSON → 點該欄位值加成 Document Filter。

點一列：Log Summary → **欄位表** → **JSON Tree**。訊息上的 Log Highlight 只是前端關鍵字／分類著色，**不會**呼叫大模型。

### 3.3 框選日誌分析（送給大模型）— 範例

功能在表格**上方**的藍色提示列 **「框選日誌分析」**，不是側邊欄另開一頁，也不會自動跳到 `/ai`。

**範例：12 筆 HikariCP 連線錯誤**

1. Site 選「龍華-生產」，Watchlist 選 `logs-lh-k8s-es-log-*`，時間 1h，Keyword 填 `HikariPool` 或點 Category「連線失敗」。
2. 等 LIVE 列出現後，在**每一列最左邊「選」欄**勾核取方塊（最多 **20** 筆；超過會擋下，不會默默截斷）。
3. 提示列會變成「已選 n / 20 筆…」。按右側 **送出分析**。
4. 右下角浮出 **日誌分析** 視窗（Analysis Window）。文字摘要進來後，文末「建議提問」會變成可點芯片；點芯片會在**同一視窗、同一 conversation** 再問一輪，人不用離開 `/logs`。
5. 可把視窗拖到別處、拉右下角改大小；最小化／放大／還原會回到剛才的位置與尺寸。若要分析另一批日誌，再按送出時會先確認，然後**取代**目前這扇窗。

**不會發生的事**

- 勾選後不會自動打 LLM（一定要按「送出分析」）。
- 結果不會出現在 OPSGPT 聊天泡泡裡（那是 `/ai`）；這次是 Smart Logging 專用分析窗。
- Viewer 角色不能送出（按鈕維持停用）。

後端走既有 `POST /api/ai/query`（Diagnosis Orchestrator），不是瀏覽器直連 Gemini。

### 3.4 串流行為

- 連線：`GET /api/logs/stream`
- **自動捲動** 可開關
- 狀態：connecting → connected；斷線會自動重連
- 緩衝區約保留最近載入列；**框選只能勾已經載入的列**，不能把整個時間窗一次丟給模型

### 3.5 操作建議

1. 收到告警後，先選對應 Site 與 Watchlist family
2. 用 Keyword 或 Category 縮到錯誤列，再勾 5–20 筆送出分析
3. 若串流無資料，檢查 Watchlist／時間範圍，或 `/admin` 的 ES 設定與 **上游診斷**

---

## 4. 告警中心（Alert Center）

**路徑：** `/alerts`  
**側邊欄：** 告警中心（未讀數顯示在側邊欄與頂部 **告警** 按鈕徽章）

### 4.1 告警來源

- **Alertmanager Webhook** → `POST /api/alerts/webhook`（生產環境必須設定）
- 程序啟動時**不會**種入演示告警；告警中心在收到 Webhook 前為空狀態。真實告警依 fingerprint 去重與更新

### 4.2 篩選與搜尋

| 篩選 | 選項 |
|------|------|
| Site | 依 `cluster_tag`（如 `lh-k8s-cluster`） |
| 嚴重度 | critical / warning / info |
| 狀態 | firing / resolved / all |
| 時間範圍 | 1h / 6h / 24h / 7d / all |
| 關鍵字 | 標籤或訊息全文搜尋 |

### 4.3 即時更新

- 頁面透過 `GET /api/alerts/stream`（SSE）接收新告警
- 全局 Layout 也訂閱同一串流，驅動未讀徽章

### 4.4 確認告警（Acknowledge）

選取告警後可批次 **確認**，呼叫 `POST /api/alerts/ack`。已確認告警不再計入未讀數。

### 4.5 嚴重度判讀

| 等級 | 典型情境 |
|------|----------|
| critical | 服務中斷、節點 NotReady、磁碟滿 |
| warning | 資源偏高、副本數不足 |
| info | 資訊性通知 |

點擊單筆告警可展開標籤、註解、時間線。

---

## 5. AI 診斷（AI Diagnosis）

**路徑：** `/ai`（**不在側邊欄**，需直接輸入 URL 或從其他入口連結）  
**頁面標題：** 運維助手

### 5.1 版面配置

- **左側（站點健康簡報 / Site Health Brief）：** 未綁定顯示全站 overview 飽和與 firing 筆數；綁定後顯示該站 Site Resource Health 與 firing 告警。診斷報告只在按「產生報告」後寫入。
- **右側（OPSGPT / ChatPanel）：** 自然語言問答輸入框（與產生報告共用同一條 Diagnosis Conversation）

### 5.2 使用流程

1. 開啟 `/ai`（預設未綁定，左側為全站摘要）
2. 點選站點卡片或上方選單綁定 Site
3. 可先掃資源飽和、熱點、firing 告警；需要 LLM 時按「產生報告」
4. 後端 `POST /api/ai/query` 走 LangGraph Orchestrator Chat Contract（ADR-0023；Dify 不再是編排路徑）
5. 編排層呼叫 Tool Endpoint 查詢 Prometheus / 告警，合成 Diagnosis Answer
6. 該次產生的助手回覆填入左側「診斷報告」；一般追問不會覆寫報告

> 綁定 Site 時 `siteId` 仍以 `clusterTag` 傳入編排層（`inputs.site_id`）。詳見 [資料流](data-flow.md#ai-diagnosis-ai) 與 [ADR-0017](adr/0017-site-health-brief.md)。

### 5.3 與告警聯動的建議工作流

1. 告警中心發現 critical 告警
3. 智能日誌流確認錯誤 pattern；需要模型時在列左側勾選（最多 20）→ **送出分析**
3. `/ai` 提問，取得 RCA 與修復建議
4. 必要時進入 Site Detail 查看即時指標

---

## 6. SRE 管理配置（Admin）

**路徑：** `/admin`  
**頂部導覽：** 管理配置（齒輪圖示）

此頁為**唯讀顯示**伺服器 `PUBLIC_*` 預設值，並允許在瀏覽器 `localStorage` 覆寫連線設定（僅影響當前瀏覽器）。

### 6.1 可覆寫項目

| 區塊 | 欄位 | 用途 |
|------|------|------|
| LOGGING — ElasticSearch | URL、帳密 | Smart Logging ES 查詢 |
| RESOURCE — Prometheus | URL | 全局 KPI 與 Site 指標 |
| PROXY | 啟用、主機、埠 | 企業網路 HTTP CONNECT 代理 |
| AI AGENTS — DiFy API | URL、API Key | 瀏覽器端測試用（伺服器仍用 `DIFY_*` 環境變數） |

另含 **字型大小** 與 **PromQL 模板** 覆寫面板。

### 6.2 何時需要調整

- 切換測試 / 生產 Prometheus 端點
- 透過 Proxy 存取內網 ES
- 自訂 PromQL 查詢模板以符合叢集標籤慣例

完整環境變數清單見 [Configuration](configuration.md)。

---

## 7. 上游診斷（Upstream Diagnosis）

**路徑：** `/admin/diagnosis`  
**入口：** 大盤紅色診斷橫幅 → 查看診斷詳情

### 7.1 用途

登記並展示 API 代理呼叫外部服務時的失敗記錄。`service` 欄位為程式登記名稱，例如：

- `Elasticsearch` — ES 查詢或日誌串流失敗
- `Prometheus (Global)` — 全局 KPI PromQL 失敗
- `Prometheus (<Site 標題>)` — 單一 Site overview 失敗（對應 Site 卡片紅框錯誤狀態）
- `MySQL Database` — Pipeline Metrics 查詢失敗

### 7.2 頁面操作

| 操作 | 說明 |
|------|------|
| 重新整理 | `GET /api/diagnosis` 重新載入 |
| 展開單筆 | 查看錯誤 ID、堆疊追蹤、詳細訊息 |
| 清除所有錯誤 | `POST /api/diagnosis` `{ "action": "clear" }`，標記為已解決 |

統計列顯示：總記錄 / 未解決 / 已解決。

### 7.3 與其他頁面的關係

| 症狀 | 可能原因 | 下一步 |
|------|----------|--------|
| KPI 卡片紅框 + 錯誤訊息 | Prometheus 或 MySQL 不可達 | 檢查診斷頁 `Prometheus (Global)` / `MySQL Database` 錯誤 |
| 日誌流無資料 | ES 連線或索引問題 | 檢查 `Elasticsearch` 錯誤 + `/admin` ES 設定 |
| Site 卡片紅框 + 錯誤訊息 | 該 Site overview 失敗（HTTP 502） | 修復該 Site 的 Prometheus 連線與設定 |
| Site 網格錯誤面板 | `/api/sites` 清單失敗 | 檢查 Site 設定與 API 連線 |
| 告警中心 / 趨勢圖為空 | 尚未收到 Webhook 或上游異常 | 設定 Alertmanager Webhook；排查告警 API |

---

## 8. 導覽速查

```
/login ──登入──► / (全球矩陣大盤)
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
  /logs          /alerts      /sites/[title]
 (智能日誌流)    (告警中心)     (Site Detail)
     │              │
     └──────┬───────┘
            ▼
          /ai (AI 診斷 — 直接 URL)
            │
     /admin (管理配置)
            │
     /admin/diagnosis (上游診斷)
```

**側邊欄項目：** 全球矩陣大盤 · 智能日誌流 · 告警中心  
**頂部快捷：** 管理配置 · 告警徽章 · 一鍵點檢  
**直接 URL（不在側邊欄）：** `/ai` · `/admin/diagnosis` — 見 [§0 導覽模型](#直接-url-路由)

---

## 相關文件

- [功能導覽（HTML）](features/index.html) — 附截圖占位符的視覺導覽
- [資料流](data-flow.md) — 各功能背後的 API 與上游路徑
- [架構概覽](architecture.md) — 路由與驗證模型
- [部署指南](deployment.md) — 生產環境部署
