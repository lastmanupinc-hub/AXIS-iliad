# AXIS deploy/deploy.ps1 — local build → GHCR push, Windows/PowerShell variant.
# Usage:
#   $env:GHCR_OWNER = 'youruser'; .\deploy\deploy.ps1
#   $env:GHCR_OWNER = 'youruser'; .\deploy\deploy.ps1 -Tag 'v1.2.3'

[CmdletBinding()]
param(
  [string]$Tag = 'prod'
)

$ErrorActionPreference = 'Stop'

if (-not $env:GHCR_OWNER) {
  throw 'Set GHCR_OWNER first, e.g. $env:GHCR_OWNER = your-github-user'
}

$Image = "ghcr.io/$($env:GHCR_OWNER)/axis-iliad:$Tag"

Write-Host "Building $Image"
docker build -f deploy/Dockerfile -t $Image .
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

Write-Host "Pushing $Image"
docker push $Image
if ($LASTEXITCODE -ne 0) { throw "docker push failed" }

Write-Host "Pushed $Image"
Write-Host ""
Write-Host "Next:"
Write-Host "  Render dashboard -> axis-iliad service -> Manual Deploy -> Deploy latest image"
