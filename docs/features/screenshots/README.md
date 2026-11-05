# Screenshots for the Feature Guide

PNG files in this directory are referenced by `docs/features/index.html`. When a file is missing, the guide shows a styled placeholder with the expected filename.

**UI language:** NextOps operator UI is **zh-TW** (Traditional Chinese). Screenshots should show the live UI as-is — nav labels like 全球矩陣大盤, 智能日誌流, 告警中心, 管理配置, and page titles like 混合資源 調度指揮中心. Do not switch the app locale for capture; the feature guide prose is also zh-TW (decision B).

## Naming convention

| File | Route | Page |
|------|-------|------|
| `login.png` | `/login` | Login |
| `dashboard.png` | `/` | Global Matrix Dashboard |
| `site-detail.png` | `/sites/龍華-生產` | Site Detail |
| `logs.png` | `/logs` | Smart Logging |
| `alerts.png` | `/alerts` | Alert Center |
| `ai-diagnosis.png` | `/ai` | AI Diagnosis |
| `admin.png` | `/admin` | SRE Admin Configuration |
| `diagnosis.png` | `/admin/diagnosis` | Upstream Diagnosis |

Recommended size: **1280×720** viewport (matches the Playwright script).

---

## Manual capture (primary — use now)

### 1. Start NextOps

**Node.js (hot reload):**

```bash
npm install
cp .env.example .env   # if first run
npm run dev
```

Open `http://localhost:5173`.

**Container (nerdctl / Docker Compose):**

```bash
cp .env.example .env
nerdctl compose up --build
```

Open `http://localhost:3000` (or `${PORT}` from `.env`).

See [local-development.md](../../local-development.md) for upstream URL configuration.

### 2. Log in

1. Go to `/login`.
2. Username is `admin` (or `NEXTOPS_ADMIN_USER` from `.env`).
3. Password is `NEXTOPS_ADMIN_PASS` from `.env`.

### 3. Capture each page

Use browser devtools or OS screenshot at **1280×720** (or resize window first).

| Order | Navigate to | Save as |
|-------|-------------|---------|
| 1 | `/login` (log out first if needed) | `login.png` |
| 2 | `/` | `dashboard.png` |
| 3 | `/sites/龍華-生產` (or any live Site) | `site-detail.png` |
| 4 | `/logs` | `logs.png` |
| 5 | `/alerts` | `alerts.png` |
| 6 | `/ai` | `ai-diagnosis.png` |
| 7 | `/admin` | `admin.png` |
| 8 | `/admin/diagnosis` | `diagnosis.png` |

Save PNGs into **this directory**. No `index.html` edits needed — the guide already references these filenames and falls back to placeholders when files are absent.

### 4. Preview the guide

Open `docs/features/index.html` in a browser (file:// or any static server). Captured images appear automatically.

---

## Automated capture (optional — when staging URL is pinned)

A Playwright script lives at `scripts/capture-screenshots.mjs`. It is **not required** for day-to-day docs work; use it once a stable staging or local URL is agreed.

### Prerequisites

`@playwright/test` is listed as an optional devDependency. Install only when you want automation:

```bash
npm install -D @playwright/test
npx playwright install chromium
```

### Run

```bash
STAGING_URL=http://localhost:5173 NEXTOPS_ADMIN_PASS=your-password npm run docs:screenshots
```

| Variable | Required | Description |
|----------|----------|-------------|
| `STAGING_URL` | Yes | Base URL of a running NextOps instance |
| `NEXTOPS_ADMIN_PASS` | Yes | Dashboard password |
| `NEXTOPS_ADMIN_USER` | No | Default `admin` |

If `STAGING_URL` is unset, the script prints a skip message and exits 0 (safe for CI that does not capture screenshots).

### Route order (script)

```
/login → / → /sites/龍華-生產 → /logs → /alerts → /ai → /admin → /admin/diagnosis
```

Output overwrites PNGs in this folder.

---

## Decision record

**Hybrid workflow (grill D):** manual capture unblocks the feature guide immediately; Playwright scaffolding is prepared for when a pinned staging URL exists. No screenshot capture runs in CI by default.
