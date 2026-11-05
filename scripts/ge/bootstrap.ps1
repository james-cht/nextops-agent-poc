$ErrorActionPreference = "Stop"
$bash = Get-Command bash -ErrorAction SilentlyContinue
if (-not $bash) {
	Write-Error "bash is required. Run scripts/ge/bootstrap.sh from Cloud Shell or Git Bash."
	exit 1
}
& bash (Join-Path $PSScriptRoot "bootstrap.sh")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
