# 下一步 / Future improvements

Documentation Explorer v1 已鎖定範圍見 [ADR-0008](../adr/0008-documentation-explore-spa.md)。以下為刻意延後、但應持續推進的項目。

## 近期（v1 之後）

1. **移除舊版靜態 hub** — 確認 SPA 可用後，將 `docs/explore/` 收斂為 stub README（僅保留建置說明與發布連結）。
2. **公開發布** — 選定 GitHub Pages（或同等靜態託管），讓 CI 產物成為正式入口；README / `docs/README.md` 改連到該 URL。
3. **功能導覽內嵌升級** — 將 `docs/features/` 視覺導覽移植為 SPA 內建區塊（目前經 `/docs-static/features/` 掛載嵌入）。
4. **截圖資產對齊** — 讓 feature guide 與 `docs/features/screenshots/` 命名一致，或改指向 `docs/screenshots/`。

## 中期

5. **雙語 chrome** — 導覽／Drift／圖譜標籤提供 EN 切換（文件本文仍依原稿語言）。
6. **更嚴的 Drift** — 權威文件對齊後，CI 改為警告註解，必要時再升級為硬失敗；可加 allowlist。
7. **架構專屬提示** — 除「未文件化」外，標示「僅出現在 README、未進入 architecture.md」等細粒度缺口。
8. **公開路徑註記** — 從 `hooks.server.ts` 標註無需 session 的路徑，減少誤報。

## 長期

9. **更豐富的圖譜** — 社群聚類、路徑高亮、與 completeness-review 一鍵對照。
10. **不要做成 GitNexus** — 符號呼叫圖仍交由 GitNexus／graphify；Explore 專注文件 ↔ 程式碼表面。
