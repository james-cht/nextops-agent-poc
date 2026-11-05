# Legacy PowerShell deploy. Production shsdgx publish / rollback:
#   .\scripts\shsdgx-rollout.ps1 status
#   .\scripts\shsdgx-rollout.ps1 publish
#   .\scripts\shsdgx-rollout.ps1 rollback
#
# This file is not Image-Only Deploy (ADR-0018): default Mode is RemoteBuild and
# RemoteDir defaults to ~/nextops (production is ~/repositories/nextops).
#
# Modes:
#   RemoteBuild  — git pull on server + nerdctl compose build (default)
#   ImageTar     — nerdctl save locally, scp, nerdctl load on server
#
# Examples:
#   .\scripts\deploy-remote.ps1
#   .\scripts\deploy-remote.ps1 -Mode ImageTar -SshHost shsdgx -RemoteDir ~/nextops
#   .\scripts\deploy-remote.ps1 -ImageTag 232cc46

param(
  [ValidateSet('RemoteBuild', 'ImageTar')]
  [string]$Mode = 'RemoteBuild',
  [string]$SshHost = $(if ($env:DEPLOY_SSH_HOST) { $env:DEPLOY_SSH_HOST } else { 'shsdgx' }),
  [string]$SshUser = $(if ($env:DEPLOY_SSH_USER) { $env:DEPLOY_SSH_USER } else { 'james' }),
  [string]$RemoteDir = $(if ($env:DEPLOY_REMOTE_DIR) { $env:DEPLOY_REMOTE_DIR } else { '~/nextops' }),
  [string]$ImageTag = $(if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { (git rev-parse --short HEAD) }),
  [string]$TarPath = $(Join-Path $PSScriptRoot '..' 'nextops-image.tar')
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$SshOpts = @('-o', "User=$SshUser", '-o', 'BatchMode=yes')

function Invoke-Remote([string]$Command) {
  Write-Host ">> ssh ${SshUser}@${SshHost}: $Command"
  ssh @SshOpts $SshHost $Command
  if ($LASTEXITCODE -ne 0) { throw "Remote command failed (exit $LASTEXITCODE)" }
}

function Test-Ssh {
  Write-Host "Testing SSH to ${SshUser}@${SshHost} ..."
  ssh -o ConnectTimeout=20 @SshOpts $SshHost "echo ssh_ok"
  if ($LASTEXITCODE -ne 0) {
    throw "Cannot reach $SshHost over SSH as $SshUser. Connect VPN/proxy and retry."
  }
  $who = (ssh @SshOpts $SshHost "whoami").Trim()
  if ($who -eq 'root') { throw "Refusing deploy as root. Use james (SshUser=$SshUser)." }
  if ($who -ne $SshUser) { throw "Remote user is '$who', expected '$SshUser'." }
  Write-Host "Remote account: $who (ok)"
}

Push-Location $RepoRoot
try {
  Test-Ssh

  switch ($Mode) {
    'RemoteBuild' {
      Write-Host "Deploying via remote git pull + nerdctl compose build (tag: $ImageTag)"
      Invoke-Remote "mkdir -p $RemoteDir"
      Invoke-Remote "test -d $RemoteDir/.git || git clone https://github.com/james-cht/nextops.git $RemoteDir"
      Invoke-Remote "cd $RemoteDir && git fetch origin && git checkout master && git pull --ff-only origin master"
      Invoke-Remote "cd $RemoteDir && nerdctl compose down || true"
      Invoke-Remote "cd $RemoteDir && nerdctl compose build"
      Invoke-Remote "cd $RemoteDir && IMAGE_TAG=$ImageTag nerdctl compose up -d"
    }

    'ImageTar' {
      Write-Host "Deploying via image tar (tag: $ImageTag)"
      $resolvedTar = Resolve-Path $TarPath -ErrorAction SilentlyContinue
      if (-not $resolvedTar) { $resolvedTar = Join-Path $RepoRoot "nextops-$ImageTag.tar" }

      if (-not (Test-Path $resolvedTar)) {
        Write-Host "Building image nextops:$ImageTag ..."
        nerdctl build -t "nextops:$ImageTag" .
        if ($LASTEXITCODE -ne 0) { throw 'nerdctl build failed (is buildkitd running?)' }
        Write-Host "Saving image to $resolvedTar ..."
        nerdctl save -o $resolvedTar "nextops:$ImageTag"
      }

      $remoteTar = "/tmp/nextops-$ImageTag.tar"
      Write-Host "Copying tar to server ..."
      scp @SshOpts $resolvedTar "${SshHost}:$remoteTar"
      scp @SshOpts docker-compose.yml "${SshHost}:${RemoteDir}/"

      Invoke-Remote "nerdctl load -i $remoteTar"
      Invoke-Remote "cd $RemoteDir && nerdctl compose down || true"
      Invoke-Remote "cd $RemoteDir && IMAGE_TAG=$ImageTag nerdctl compose up -d --no-build"
      Invoke-Remote "rm -f $remoteTar"
    }
  }

  Write-Host 'Waiting for health check ...'
  Start-Sleep -Seconds 8
  Invoke-Remote "cd $RemoteDir && nerdctl compose ps"
  Invoke-Remote "curl -fsS http://127.0.0.1:3000/api/health || nerdctl compose logs --tail 40 nextops"

  Write-Host "Deploy complete. Image tag: $ImageTag"
}
finally {
  Pop-Location
}
