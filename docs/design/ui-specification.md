# NextOps UI Design Specification

> Source: 5 screenshot mockups from `C:\Users\james\repositories\opsdashboard\docs\screenshots/`
> All text in Traditional Chinese. Dark theme throughout.

---

## Design System

### Color Palette
| Role | Color | Hex (approx) | Usage |
|------|-------|-------------|-------|
| Background | Deep navy/black | `#0f172a` | Page background |
| Card background | Dark blue-grey | `#1e293b` | Cards, panels |
| Card border | Subtle | `#334155` | Card borders |
| Primary text | White | `#ffffff` | Headings, values |
| Secondary text | Light grey | `#94a3b8` | Labels, subtitles |
| Accent purple | Purple gradient | `#8b5cf6` → `#6366f1` | Logo, avatar, AI badge |
| Accent blue | Cyan/blue | `#06b6d4` | KPI positive, links |
| Accent green | Green | `#10b981` | Normal status, online dot |
| Accent orange | Orange/amber | `#f59e0b` | Warning status |
| Accent red | Red | `#ef4444` | Critical alerts, errors |
| Accent yellow | Yellow | `#eab308` | Latency metric |
| Accent teal | Teal/green | `#14b8a6` | Save button |

### Typography
- **Font family:** System sans-serif (Inter or system-ui)
- **KPI numbers:** Large, bold, monospaced (~36-48px)
- **Card titles:** Bold white (~16px)
- **Labels:** Light grey (~12-14px)
- **Body:** White/light grey (~14px)

### Spacing & Layout
- **Border radius:** 8-12px on all cards, buttons, inputs
- **Padding:** Generous (16-24px inside cards)
- **Gaps:** 16px between grid items
- **Sidebar width:** ~200px fixed
- **Header height:** ~56px fixed

### Icons
- Minimalist outline style (Lucide / Heroicons)
- Consistent 16-20px size
- White or grey, colored only for status/severity

---

## Page 1: Global Matrix Dashboard (`/`)

### Header
- **Left:** Purple gradient square logo "N" + "NEXTOPS" (bold white) + "AI OPS PLATFORM" (small grey)
- **Center:** "$ 混合资源 调度指挥中心" (page title) + "UTC+8 · YYYY/MM/DD HH:MM:SS" (timestamp)
- **Right:** Green dot + "ALL SYSTEMS MONITORED" + "SRE配置" (gear icon) + "告警" (bell icon, red badge "3") + "一鍵點檢" (blue lightning button)

### Sidebar
1. **Active:** Grid icon + "全球矩陣大盤" (dark blue background highlight)
2. Document icon + "智能日誌流"
3. Warning triangle + "告警中心" (red badge "3")
- **Bottom:** Purple gradient avatar "AS" + "ADMIN SRE" + "管理員 · 在線" (green dot)

### KPI Cards (4 across, top row)
1. **日誌健康評分** (Log Health Score) — Blue accent
   - Large number "97.2%" + shield icon
   - Subtext: "ElasticSearch 索引正常"
   - Progress bar at bottom
2. **流水線成功率** (Pipeline Success Rate) — Cyan accent
   - Large number "94.5%" + green "+2.4%" pill
   - Subtext: "DiFy Agent 調度正常"
   - Progress bar
3. **錯誤率 (P99)** (Error Rate) — Red accent
   - Large number "1.8%" + red "-1.2%" pill
   - Subtext: "過去 24h 異常曲線"
   - Progress bar
4. **平均延遲 P99** (Avg Latency) — Yellow accent
   - Large number "423ms" + bell icon
   - Subtext: "API 響應時長"
   - Progress bar

### Resource Monitoring Grid (2×3 cards)
Title: "全球生產設施 · 資源監控"

Each site card shows:
- Site name (e.g., "龍華-生產")
- Environment tag: "混合環境"
- Status dot: green (正常) or orange (警告)
- CPU/MEM/DISK/NET progress bars (color-coded: blue < 60%, orange 60-80%, red > 80%)
- Pod status: "PODS XX/XX" + "ALL CLEAR" or "X 告警"

Sites: 龍華-生產, 煙台-生產, 重慶-生產, 越南-生產, NA-生產, CTV-生產

### Right Column
- **告警趨勢 24H** — Blue bar chart (00:00 to 24:00), "+14.2%" indicator
- **快速操作** — 2×2 grid: 日誌流, 告警, 配置, 一鍵點檢

---

## Page 2: Smart Logging (`/logs`)

### Header
- **智能日誌流** + Index Watchlist 說明；LIVE pill 在已連線時出現

### Filters
- 單一 **Site**（必選）→ **Active index**（Watchlist 內一個 family）→ Time / Keyword / Interval
- 無 Mode / Namespace / Pod / level 主列

### 框選日誌分析
- 表格上方提示列：**框選日誌分析** + **送出分析 (n/20)**
- 表格第一欄 **選** 核取方塊；最多 20 筆
- 送出後右下角浮動 **日誌分析** 視窗（可拖、可縮放、建議提問芯片）

### Log table
Columns: 選 | 展開 | 時間 | 服務名稱 | HTTP | Method | Proto | Path | UA | Message

Expand: 欄位表 → JSON Tree（點值加成 Document Filter）

Footer: End of buffer · N loaded · ES total

---

## Page 3: Alert Center (`/alerts`)

### Header
- **Center:** "告警中心" + "Prometheus · ElasticSearch · DiFy Agent 聚合"
- **Right:** Dark red "3 UNACKED" + Blue "全部已讀" + "← 返回"

### Alert Cards (vertical list, newest first)

**CRITICAL** — Dark red/maroon background, red border, red triangle icon
- Header: "CRITICAL" (red) + source (grey) + region (grey)
- Message (white text)
- Timestamp (grey, bottom left)
- "NEW" badge (red pill, top right) for unacked

**WARNING** — Dark amber/brown background, orange border, orange triangle icon
- Header: "WARNING" (orange) + source + region
- Message + timestamp
- Optional "NEW" badge

**INFO** — Dark blue background, blue border, blue checkmark icon
- Header: "INFO" (blue) + source + region
- Message + timestamp

---

## Page 4: AI Diagnosis (`/ai` or `/sites/[siteId]/diagnosis`)

### Header
- **Center:** Red dot + "重慶-生產" + "智能診斷分析報告"
- **Right:** "← 返回"

### Center Panel: RCA Card
Title: "戰略性根因分析 (RCA)" with chain/link icon

**Diagnosis text block:**
- Explains root cause in natural language
- Mentions specific node, duration, metrics
- AI correlation percentage

**推薦處置建議** (green left border):
- Numbered dark blue cards with remediation steps
- Specific commands (kubectl drain), scheduling changes, infrastructure upgrades

**指標異常下鑽 (DRILL-DOWN)** (red left border):
- Bar chart (yellow→orange→red gradient)
- X-axis: "T-60 緩衝區" to "NOW"
- Annotation: "I/O 消耗排序：<process> <rate>"
- Red text: "檢測到飄高異常波峰"

### Right Panel: OPSGPT Assistant
- Title: "OPSGPT 助手" (purple sparkle icon)
- Green status: "代理連線成功：<site>"
- Chat bubble with AI greeting
- Input: "詢問任何排障細節或下達維護指令..."
- Footer: "Powered by NextOps · LangGraph"

---

## Page 5: Admin Configuration (`/admin`)

### Header
- **Center:** "SRE 管理配置" + breadcrumbs "資料源 · 集成 · 安全"
- **Right:** "← 返回"

### Config Card
Title: "後端資料來源配置"
Subtitle: "Clean Architecture — Infrastructure Layer 設定"

**Service sections (each with colored badge + label + input):**

1. **ES** (dark red badge) — "LOGGING — ElasticSearch"
   - Input: `https://elastic.ops.internal:9200`

2. **PR** (dark red badge) — "RESOURCE — Prometheus"
   - Input: `http://prometheus.ops:9090`

3. **AI** (dark purple badge) — "AI AGENTS — Tool Endpoint Token"
   - Input: `............` (masked `NEXTOPS_DIFY_TOKEN`)

**Save button:** Bright green/teal rounded — "儲存配置並重新連線"

**Footer note:** "Demo only · 配置儲存於瀏覽器 localStorage"

---

## Navigation Map

| Page | Route | Icon | Chinese |
|------|-------|------|---------|
| Global Matrix Dashboard | `/` | Grid 4-square | 全球矩陣大盤 |
| Smart Logging | `/logs` | Document | 智能日誌流 |
| Alert Center | `/alerts` | Warning triangle | 告警中心 |
| AI Diagnosis | `/ai` or `/sites/:id/diagnosis` | Sparkle/RCA | 智能診斷分析報告 |
| Admin Config | `/admin` | Gear | SRE 管理配置 |
| Site Detail | `/sites/:id` | — | (per-site view) |

## Component Library Needed

1. **Sidebar** — Collapsible nav with icons, badges, user profile
2. **Header bar** — Logo, center title, right action buttons
3. **KPI Card** — Large number, label, icon, progress bar, trend pill
4. **Site Card** — Name, status dot, environment tag, 4 metric bars, pod status
5. **Alert Card** — Severity-colored background, icon, message, timestamp, NEW badge
6. **Log Table** — Sortable columns, severity badges, trace paths
7. **RCA Panel** — Diagnosis text, numbered recommendations, drill-down chart
8. **Chat Panel** — Message bubbles, input field, status indicator
9. **Config Card** — Service badge, label, input fields, save button
10. **Bar Chart** — Time-series with gradient fills, annotations
11. **Progress Bar** — Color-coded thresholds (blue/orange/red)
12. **Status Dot** — Green/orange/red with optional pulse animation
