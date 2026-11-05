# antigravity-hh-proxy

Antigravity + Gemini CLI 的開發前環境準備。AI 流量走 Gemini CLI → hh-gemini-api-proxy → Control Tower。Antigravity 只當編輯器和終端機，內建 agent 不能接 proxy，不要使用它。

## 檔案

| 檔案 | 用途 |
|---|---|
| `prepare-env.ps1` | 設定 UTF-8、環境變數，檢查 proxy、node_modules、Gemini CLI 設定和版本，切換到目標目錄。可選擇建立拋棄式 worktree。 |
| `cleanup.ps1` | 只移除用 `-Worktree` 建立的 worktree。拒絕移除 repo 根目錄。刪除前詢問。 |

## 日常開發（目標：repo 根目錄）

1. 啟動 proxy（另一個終端機）：`cd C:\Users\james\repositories\hh-gemini-api-proxy; npm run dev`
2. 在 Antigravity 開啟 repo，在整合式終端機（PowerShell）執行（前面有一個點和空格）：

   ```powershell
   . .\scripts\antigravity-hh-proxy\prepare-env.ps1
   gemini --approval-mode auto_edit
   ```

## 拋棄式 worktree（試驗、彩排）

```powershell
. .\scripts\antigravity-hh-proxy\prepare-env.ps1 -Worktree C:\Users\james\repositories\nextops-run -Ref demo/gemini-cli-skills
gemini --approval-mode yolo
```

結束後關閉 Antigravity 的該資料夾和相關終端機，在其他 PowerShell 執行：

```powershell
.\scripts\antigravity-hh-proxy\cleanup.ps1 -Worktree C:\Users\james\repositories\nextops-run
```

## 選項

`-Worktree`、`-Ref`（預設目前 HEAD）、`-ProxyUrl`（預設 http://127.0.0.1:3000）、`-Model`（預設 gemini-3.6-flash）、`-ProxyDir`、`-StartProxy`（proxy 沒啟動時另開視窗啟動）。

## Gemini CLI 設定

主目錄目前有 `GEMINI.md` 和 `.gemini\`（2026-10-20 從 demo/gemini-cli-skills 複製，尚未 commit）。其他分支或 worktree 可能沒有，腳本會警告，但不會自動複製。

## 執行原則被擋住時

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

## 安全

- 不修改 repo 檔案，不執行 checkout、stash、commit、npm install。
- 不讀取 `.env`。
- 環境變數只在目前終端機有效。新終端機要重新執行。
