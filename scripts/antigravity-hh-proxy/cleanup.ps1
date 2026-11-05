<#
.SYNOPSIS
  移除用 prepare-env.ps1 -Worktree 建立的拋棄式 worktree。
.USAGE
  在 Antigravity 以外的 PowerShell 執行：.\scripts\antigravity-hh-proxy\cleanup.ps1 -Worktree C:\path\x [-Yes]
  執行前：關閉 Antigravity 開啟的該資料夾，以及所有目前目錄在該資料夾的終端機。
  不會移除 repo 根目錄，不 commit。
#>
param([Parameter(Mandatory = $true)][string]$Worktree, [switch]$Yes)

chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = (git -C $PSScriptRoot rev-parse --show-toplevel) 2>$null
if (-not $repoRoot) { Write-Host '[失敗] 找不到 git repo。' -ForegroundColor Red; exit 1 }
$repoRoot = (Resolve-Path $repoRoot).Path.TrimEnd('\')
$wt = [IO.Path]::GetFullPath($Worktree).TrimEnd('\')

if ($wt -ieq $repoRoot -or $repoRoot -like "$wt\*") { Write-Host "[失敗] 拒絕：$wt 是 repo 根目錄或包含它。" -ForegroundColor Red; exit 1 }
$listed = (git -C $repoRoot worktree list --porcelain) -match '^worktree ' | ForEach-Object { ([IO.Path]::GetFullPath($_.Substring(9))).TrimEnd('\') }
if (($listed | Select-Object -First 1) -ieq $wt) { Write-Host '[失敗] 拒絕：這是主 worktree。' -ForegroundColor Red; exit 1 }
if (-not ($listed -icontains $wt) -and (Test-Path $wt) -and -not (Test-Path (Join-Path $wt '.git') -PathType Leaf)) {
    Write-Host "[失敗] 拒絕：$wt 不是這個 repo 的 worktree。" -ForegroundColor Red; exit 1
}

Write-Host '注意：先關閉 Antigravity 開啟的這個資料夾，以及所有目前目錄在這裡的終端機。' -ForegroundColor Yellow
if ((Get-Location).Path -like "$wt*") { Write-Host '[失敗] 目前目錄在 worktree 裡面。先切換到其他目錄。' -ForegroundColor Red; exit 1 }
if (-not $Yes) { if ((Read-Host "要刪除 $wt 嗎？未保存的變更會消失。輸入 y 繼續") -ne 'y') { Write-Host '已取消。'; exit 0 } }

# 1. 先拆 node_modules 連結，否則可能刪除 repo 根目錄真正的 node_modules。
$nm = Join-Path $wt 'node_modules'
if (Test-Path $nm) {
    if ((Get-Item $nm -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        cmd /c rmdir "$nm"
        if (Test-Path $nm) { Write-Host '[失敗] 無法拆除 node_modules 連結。' -ForegroundColor Red; exit 1 }
        Write-Host '[通過] node_modules 連結已拆除' -ForegroundColor Green
    } else { Write-Host '[說明] node_modules 是真的資料夾（不是連結），會隨 worktree 一起刪除。' -ForegroundColor Cyan }
}

# 2. 移除 worktree
if (Test-Path $wt) {
    $out = (git -C $repoRoot worktree remove --force $wt 2>&1 | Out-String)
    if ($LASTEXITCODE -eq 0) { Write-Host '[通過] git worktree remove 完成' -ForegroundColor Green }
    elseif ($out -match 'is not a working tree') { Write-Host '[說明] git 已沒有這個 worktree 的紀錄，改用直接刪除資料夾。' -ForegroundColor Cyan }
    else { Write-Host "[說明] git worktree remove 失敗：$($out.Trim())；改用 Remove-Item。" -ForegroundColor Cyan }
}
if (Test-Path $wt) {
    try { Remove-Item -Recurse -Force $wt -ErrorAction Stop; Write-Host '[通過] 資料夾已刪除' -ForegroundColor Green }
    catch { Write-Host "[失敗] 無法刪除，可能仍被程式鎖住：$($_.Exception.Message)" -ForegroundColor Red; exit 1 }
}

# 3. 清理 git 紀錄
git -C $repoRoot worktree prune
Write-Host ''; Write-Host 'git worktree list：' -ForegroundColor White
git -C $repoRoot worktree list
