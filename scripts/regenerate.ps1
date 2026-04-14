#!/usr/bin/env pwsh
# Full AXIS Toolbox regeneration pipeline
# Usage: pwsh scripts/regenerate.ps1
#   or:  pnpm regenerate

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Starting full Axis regeneration pipeline..." -ForegroundColor Cyan

# 1. Clean stale nested duplicates
if (Test-Path ".ai\.ai") {
    Remove-Item ".ai\.ai" -Recurse -Force
    Write-Host "  Cleaned .ai\.ai/ nested duplicates" -ForegroundColor Yellow
}

# 2. Build all packages
Write-Host "  Building packages..." -ForegroundColor Cyan
pnpm -r build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

# 3. Run CLI dogfood — generates all 86 artifacts
Write-Host "  Running dogfood: repo-parser -> context-engine -> generator-core..." -ForegroundColor Cyan
node apps/cli/bin/axis.js analyze . --output .ai-output
if ($LASTEXITCODE -ne 0) { throw "Dogfood failed" }

# 4. Copy generated artifacts to their final locations
Copy-Item ".ai-output\*" "." -Recurse -Force
Copy-Item ".ai-output\.ai\*" ".ai\" -Force
Write-Host "  Artifacts copied to repo" -ForegroundColor Green

# 5. Clean up temp output
Remove-Item ".ai-output" -Recurse -Force

# 6. Run tests
Write-Host "  Running tests..." -ForegroundColor Cyan
npx vitest run
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }

Write-Host "Full sync complete." -ForegroundColor Green
