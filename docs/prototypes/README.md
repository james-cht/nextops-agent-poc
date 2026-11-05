# NextOps 畫面原型館

靜態 HTML 演示，**不是** Documentation Explorer（ADR-0008 的文件↔程式碼圖譜）。本館給產品／實作前看「應用上線」畫面與角色差異；資料全假。

## 開法

用本機靜態伺服器開（`fetch('catalog.json')` 不能直接 `file://`）：

```bash
npx --yes serve docs/prototypes
```

或已在跑的：`http://127.0.0.1:8765/`（`docs/prototypes` 下 `python -m http.server 8765`）。

瀏覽器開提示的 URL（通常是 `http://localhost:3000`）。

## 擴展下一版功能

1. 在 `catalog.json` 的 `releases` 加一筆版本（例如 `1.3.0`）。
2. 在 `screens` 加畫面：`versionAdded`、`roles`、`group`、`title`。
3. 在 `app.js` 的 `screens` map 寫對應渲染函式。

館上的篩選：

- **含此版本以前**：`versionAdded <=` 所選 semver
- **僅此版本新增**：只顯示該版 `versionAdded`

產品已有 Release `1.0.0`／`1.1.0`／`1.3.0`（應用目錄＋GitLab Registration；中間的 `1.2.0` 原型未發佈為正式 Release）。原型館仍可參考舊畫面。畫面標題與左側欄寫「應用上線」，不要寫 IDP。

## 實作後誰發佈、怎麼退

原型館不能發佈生產。應用上線實作完後由你在工作站發佈 shsdgx（Image-Only Deploy）。發佈後若要退，切的是上一張 `IMAGE_TAG`（BUILD_SHA），不是把頁首 Release Version 改回去。

```powershell
.\scripts\shsdgx-rollout.ps1 status
.\scripts\shsdgx-rollout.ps1 publish
.\scripts\shsdgx-rollout.ps1 rollback
```

WSL：`./scripts/shsdgx-rollout.sh status|publish|rollback`。見 `docs/deployment.md`、ADR-0032。

## 與 Explore 的關係

不嵌入 `docs/explore-app/`。Explore 繼續管 Markdown／Drift；原型館管可點的假畫面。
