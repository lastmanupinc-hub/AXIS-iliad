# AXIS deploy/deploy-cloudflare.ps1 — Cloudflare deploy, Windows/PowerShell variant.
# Usage:
#   .\deploy\deploy-cloudflare.ps1                # auto
#   .\deploy\deploy-cloudflare.ps1 -Target pages
#   .\deploy\deploy-cloudflare.ps1 -Target containers

[CmdletBinding()]
param(
  [ValidateSet('auto','pages','containers')]
  [string]$Target = 'auto'
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$PagesCfg = 'deploy/wrangler.pages.toml'
$ContainersCfg = 'deploy/wrangler.containers.toml'

function Invoke-Pages {
  Write-Host 'Cloudflare Pages deploy (static, target dir: dist/)'
  if (-not (Test-Path 'dist')) {
    Write-Host '  Building...'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'build failed' }
  }
  npx wrangler pages deploy "dist/" --project-name="axis-iliad" --config=$PagesCfg
  if ($LASTEXITCODE -ne 0) { throw 'wrangler pages deploy failed' }
  Write-Host 'Pages deployed'
}

function Invoke-Containers {
  Write-Host 'Cloudflare Containers deploy (backend)'
  Write-Host '  wrangler will run docker locally to build deploy/Dockerfile, then push to CF.'
  npx wrangler deploy --config=$ContainersCfg
  if ($LASTEXITCODE -ne 0) { throw 'wrangler deploy failed' }
  Write-Host 'Container deployed'
}

switch ($Target) {
  'pages'      { Invoke-Pages }
  'containers' { Invoke-Containers }
  default {
    # 'auto' → the detected stack's recommended target: containers
    Invoke-Containers
  }
}
