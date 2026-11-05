# Human-gated shsdgx Image-Only publish / IMAGE_TAG rollback (Windows → WSL).
# Agent must not publish. After this Release is implemented, the operator runs Publish.
# Rollback is IMAGE_TAG (BUILD_SHA), not Release Version. See ADR-0032.
#
#   .\scripts\shsdgx-rollout.ps1 status
#   .\scripts\shsdgx-rollout.ps1 publish
#   .\scripts\shsdgx-rollout.ps1 rollback
#   .\scripts\shsdgx-rollout.ps1 publish -Yes

param(
  [Parameter(Position = 0)]
  [ValidateSet('status', 'publish', 'rollback')]
  [string]$Command = 'status',
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
  throw 'Need WSL (wsl -u james). Image-Only Deploy uses nerdctl in WSL, not Windows-native Docker.'
}

$wslRepo = (wsl.exe -u james wslpath -a $RepoRoot).Trim()
if (-not $wslRepo) {
  throw "wslpath failed for $RepoRoot"
}

$yesPrefix = ''
if ($Yes) { $yesPrefix = 'YES=1 ' }

$inner = "${yesPrefix}./scripts/shsdgx-rollout.sh $Command"
Write-Host ">> wsl -u james: cd $wslRepo && $inner"
wsl.exe -u james bash -lc "cd '$wslRepo' && $inner"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
