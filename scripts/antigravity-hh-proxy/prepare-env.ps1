<#
.SYNOPSIS
  Antigravity + Gemini CLI 開發前環境準備（Gemini CLI → hh-gemini-api-proxy → Control Tower）
.USAGE
  在 Antigravity 整合式終端機（PowerShell）用 dot-source 執行：
    . .\scripts\antigravity-hh-proxy\prepare-env.ps1                       # 目標：repo 根目錄（git rev-parse --show-toplevel）（日常開發）
    . .\scripts\antigravity-hh-proxy\prepare-env.ps1 -Worktree C:\path\x   # 目標：拋棄式 detached worktree（不存在才建立）
    選項：-Ref <ref>（預設目前 HEAD）、-ProxyUrl、-Model、-ProxyDir、-StartProxy
  本腳本不修改 repo 檔案，不執行 checkout / stash / commit / npm install，不讀 .env。
#>
param(
    [string]$Worktree,
    [string]$Ref,
    [string]$ProxyUrl = 'http://127.0.0.1:3000',
    [string]$Model    = 'gemini-3.6-flash',
    [string]$ProxyDir = 'C:\Users\james\repositories\hh-gemini-api-proxy',
    [switch]$StartProxy
)

$__dotSourced = ($MyInvocation.InvocationName -eq '.')
$__scriptRoot = $PSScriptRoot

function Invoke-AgPrepare {
    param($Worktree, $Ref, $ProxyUrl, $Model, $ProxyDir, [bool]$StartProxy, [bool]$DotSourced, $ScriptRoot)
    $results = New-Object System.Collections.Generic.List[string]
    $warns   = New-Object System.Collections.Generic.List[string]
    function Ok($m)   { Write-Host "  [通過] $m" -ForegroundColor Green; $results.Add("通過：$m") }
    function Warn($m) { Write-Host "  [警告] $m" -ForegroundColor Yellow; $warns.Add("警告：$m") }
    function Info($m) { Write-Host "  [說明] $m" -ForegroundColor Cyan }
    function Fail($m) { Write-Host "  [失敗] $m" -ForegroundColor Red; Write-Host '準備中止。修正上述問題後重新執行。' -ForegroundColor Red }
    function Step($n, $m) { Write-Host ''; Write-Host "步驟 $n：$m" -ForegroundColor White }

    if (-not $DotSourced) { Write-Host '[警告] 沒有用 dot-source 執行。建議：. .\scripts\antigravity-hh-proxy\prepare-env.ps1（前面有一個點和空格）。' -ForegroundColor Yellow }

    Step 1 '設定終端機編碼為 UTF-8'
    chcp 65001 > $null
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $global:OutputEncoding = [System.Text.Encoding]::UTF8
    Ok '編碼：65001（UTF-8）'

    Step 2 '決定目標目錄'
    $repoRoot = (git -C $ScriptRoot rev-parse --show-toplevel) 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $repoRoot) { Fail "找不到 git repo：$ScriptRoot"; return $false }
    $repoRoot = (Resolve-Path $repoRoot).Path
    Info "repo 根目錄：$repoRoot"
    if (-not $Worktree) {
        $target = $repoRoot
        Ok "目標：repo 根目錄（日常開發）"
    } else {
        $wt = [IO.Path]::GetFullPath($Worktree)
        if ($wt.TrimEnd('\') -ieq $repoRoot.TrimEnd('\')) { Fail '-Worktree 不能是 repo 根目錄。'; return $false }
        if (Test-Path $wt) {
            Ok "worktree 已存在：$wt"
        } else {
            if (-not $Ref) { $Ref = (git -C $repoRoot rev-parse HEAD).Trim() }
            Info "建立 detached worktree：$wt（ref：$Ref）。不影響主目錄未提交的變更。"
            git -C $repoRoot worktree add --detach $wt $Ref
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path $wt)) { Fail 'git worktree add 失敗。'; return $false }
            Ok 'worktree 已建立'
        }
        $nm = Join-Path $wt 'node_modules'
        if (-not (Test-Path $nm)) {
            $srcNm = Join-Path $repoRoot 'node_modules'
            if (Test-Path $srcNm) { cmd /c mklink /J "$nm" "$srcNm" | Out-Null; if (Test-Path $nm) { Ok 'node_modules 連結已建立' } else { Fail 'mklink /J 失敗'; return $false } }
            else { Warn 'repo 根目錄沒有 node_modules，無法建立連結。' }
        }
        $target = $wt
        Info "HEAD：$((git -C $wt log -1 --oneline) 2>$null)"
    }

    Step 3 '設定環境變數（只在這個終端機有效）'
    $env:GOOGLE_GEMINI_BASE_URL     = $ProxyUrl
    $env:GEMINI_API_KEY             = 'placeholder'
    $env:GEMINI_MODEL               = $Model
    $env:GEMINI_CLI_TRUST_WORKSPACE = 'true'
    Ok "GOOGLE_GEMINI_BASE_URL=$ProxyUrl、GEMINI_MODEL=$Model"

    Step 4 "確認 proxy：$ProxyUrl/health"
    $h = $null; try { $h = Invoke-RestMethod -Uri "$ProxyUrl/health" -TimeoutSec 5 } catch {}
    if (-not $h -and $StartProxy) {
        Info '另開 PowerShell 視窗啟動 proxy（npm run dev），等待最多 60 秒。'
        Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$ProxyDir'; npm run dev"
        for ($i = 0; $i -lt 30 -and -not $h; $i++) { Start-Sleep 2; try { $h = Invoke-RestMethod -Uri "$ProxyUrl/health" -TimeoutSec 5 } catch {} }
    }
    if (-not $h) {
        Fail 'proxy 沒有回應。另開一個終端機執行：'
        Write-Host "    cd $ProxyDir; npm run dev" -ForegroundColor Yellow
        Write-Host '  或加上 -StartProxy 重新執行。' -ForegroundColor Yellow
        return $false
    }
    if ($h.status -ne 'ok' -or $h.upstream -ne 'gemini-ct') { Fail "回應不符：status=$($h.status) upstream=$($h.upstream)"; return $false }
    Ok 'proxy 正常：status=ok、upstream=gemini-ct'

    Step 5 '確認 node_modules'
    if (Test-Path (Join-Path $target 'node_modules')) { Ok 'node_modules 存在' }
    else { Warn "沒有 node_modules。需要時在 $target 執行 npm install（本腳本不執行）。" }

    Step 6 '確認 Gemini CLI 專案設定'
    $hasMd = Test-Path (Join-Path $target 'GEMINI.md')
    $sp = Join-Path $target '.gemini\settings.json'
    $hasSet = Test-Path $sp
    if ($hasMd) { Ok 'GEMINI.md 存在' } else { Warn '沒有 GEMINI.md。' }
    if ($hasSet) {
        try { $s = Get-Content $sp -Raw -Encoding UTF8 | ConvertFrom-Json; Ok ".gemini\settings.json 存在，model.name=$($s.model.name)" }
        catch { Fail '.gemini\settings.json 不是有效的 JSON'; return $false }
    } else { Warn '沒有 .gemini\settings.json。' }
    if (-not ($hasMd -and $hasSet)) {
        Warn '這個分支或目錄缺少 Gemini CLI 設定。主目錄 nextops 已有（2026-10-20 從 demo/gemini-cli-skills 複製，未 commit）；其他分支或 worktree 可能沒有。本腳本不會自動複製。'
    }

    Step 7 '確認 Gemini CLI'
    if (-not (Get-Command gemini -ErrorAction SilentlyContinue)) { Fail '找不到 gemini 指令。確認已安裝 Gemini CLI。'; return $false }
    $v = (& gemini --version) 2>$null
    if ($LASTEXITCODE -ne 0) { Fail 'gemini --version 執行失敗'; return $false }
    Ok "Gemini CLI 版本：$v"

    Step 8 '切換到目標目錄'
    Set-Location $target
    Ok "目前目錄：$((Get-Location).Path)"

    Write-Host ''
    Write-Host '===== 準備完成 =====' -ForegroundColor Green
    $results | ForEach-Object { Write-Host "  $_" }
    $warns   | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Write-Host ''
    Write-Host '下一個指令：' -ForegroundColor White
    if ($Worktree) { Write-Host '  gemini --approval-mode yolo        # 拋棄式 worktree 可用 yolo' -ForegroundColor Yellow }
    Write-Host '  gemini --approval-mode auto_edit   # 日常開發：改檔自動核准，執行 shell 前詢問' -ForegroundColor Yellow
    Write-Host '注意：yolo 只在拋棄式 worktree 使用。不要使用 Antigravity 內建 agent。' -ForegroundColor Yellow
    return $true
}

$__prepOk = Invoke-AgPrepare -Worktree $Worktree -Ref $Ref -ProxyUrl $ProxyUrl -Model $Model -ProxyDir $ProxyDir -StartProxy $StartProxy.IsPresent -DotSourced $__dotSourced -ScriptRoot $__scriptRoot
Remove-Item Function:\Invoke-AgPrepare -ErrorAction SilentlyContinue
Remove-Variable __dotSourced, __scriptRoot -ErrorAction SilentlyContinue
