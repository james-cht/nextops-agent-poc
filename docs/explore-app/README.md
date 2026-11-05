# Documentation Explorer (文件探索中心)

Vite + Svelte 靜態 SPA。設計決策見 [ADR-0008](../adr/0008-documentation-explore-spa.md) 與 [FUTURE.md](./FUTURE.md)。

## 本地預覽

```bash
# 從 repo 根目錄
npm run docs:explore

# 或在此目錄
npm install
npm run dev      # http://localhost:5180
npm run build    # 輸出至 dist/（勿提交）
npm run preview
```

產生資料：`public/data/*.json`（建置時寫入，可本地查看）。

互動 HTML（經 Vite 掛載 `docs/features` → `/docs-static/features/`）：

- 功能導覽：`#/features`
- **Dify Chatflow Phase I：** `#/dify-chatflow` → `dify-chatflow-setup.html`

## 舊版 hub

過渡期間仍保留 [`../explore/index.html`](../explore/index.html) 作為後備入口。
