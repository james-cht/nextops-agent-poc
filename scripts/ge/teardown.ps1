$ErrorActionPreference = "Stop"
if (-not $env:CONFIRM) {
	Write-Error "Refusing to delete. Re-run with CONFIRM=delete after verification."
	exit 1
}
$bash = Get-Command bash -ErrorAction SilentlyContinue
if (-not $bash) {
	Write-Error "bash is required. Run scripts/ge/teardown.sh from Cloud Shell or Git Bash."
	exit 1
}
& bash (Join-Path $PSScriptRoot "teardown.sh")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
