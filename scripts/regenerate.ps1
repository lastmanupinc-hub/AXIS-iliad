#!/usr/bin/env pwsh
# Full Axis' Iliad regeneration pipeline
# Usage: pwsh scripts/regenerate.ps1
#   or:  pnpm regenerate:sh   (this is the PowerShell twin of regenerate.sh —
#        keep the two behaviorally identical)
#
# Contract (post-9ff7363): the CLI writes every generated artifact under a
# bare path (Dockerfile, AGENTS.md, mcp/README.md, ...) directly into
# --output — there is no nested `.ai-output/.ai/` layout anymore. Those
# generated files are templates for the repos THIS TOOL analyzes, not for
# axis-iliad's own infra: copying them broadly over the repo root would
# clobber our real Dockerfile/Makefile/CI workflows and the live begin-loop
# state (begin.yaml/continuation.yaml) that this very pipeline runs under.
# Only .ai/ (the full self-dogfood mirror) and an explicit root allowlist
# are ever written to.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

# Confirmed 2026-07-25: the dogfood run DOES emit begin.yaml, continuation.yaml,
# Dockerfile, docker-compose.yml and Makefile (verified against real output --
# they are legitimate generated artifacts for repos this tool analyzes). They
# must land only in .ai/, never at the repo root. The root-copy loop below is
# the actual safety boundary: it can only ever touch names literally listed
# in $RootAllowlist. This self-check guards THAT invariant -- it fires before
# any build or dogfood run, if a future edit ever adds a protected name to
# the allowlist (the shape of the 2026-07 data-loss bug).
$ProtectedRootFiles = @("begin.yaml", "continuation.yaml", "Dockerfile", "docker-compose.yml", "Makefile", "render.yaml")
$RootAllowlist = @("AGENTS.md", "CLAUDE.md", ".cursorrules")

foreach ($f in $RootAllowlist) {
    if ($ProtectedRootFiles -contains $f) {
        throw "'$f' is in both RootAllowlist and ProtectedRootFiles. Refusing to run -- fix this script before regenerating."
    }
}

Write-Host "Starting full Axis regeneration pipeline..." -ForegroundColor Cyan

Write-Host "  Building packages..." -ForegroundColor Cyan
pnpm -r build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

Write-Host "  Running dogfood: repo-parser -> context-engine -> generator-core..." -ForegroundColor Cyan
if (Test-Path ".ai-output") { Remove-Item ".ai-output" -Recurse -Force }
node apps/cli/bin/axis.js analyze . --output .ai-output
if ($LASTEXITCODE -ne 0) { throw "Dogfood failed" }

if (-not (Test-Path ".ai-output") -or -not (Get-ChildItem ".ai-output" -Force | Select-Object -First 1)) {
    throw "dogfood produced no output (.ai-output missing or empty) -- aborting before touching .ai/ or the repo root."
}

Write-Host "  Refreshing .ai/ (full dogfood mirror)..." -ForegroundColor Cyan
if (Test-Path ".ai") { Remove-Item ".ai" -Recurse -Force }
New-Item -ItemType Directory -Path ".ai" | Out-Null
Copy-Item ".ai-output\*" ".ai\" -Recurse -Force
# Copy-Item's wildcard misses dotfiles/dotdirs (e.g. .github/) on some
# PowerShell versions -- sweep them explicitly so the mirror is complete.
Get-ChildItem ".ai-output" -Force -Filter ".*" | ForEach-Object {
    Copy-Item $_.FullName (Join-Path ".ai" $_.Name) -Recurse -Force
}

Write-Host "  Refreshing root allowlist ($($RootAllowlist -join ', '))..." -ForegroundColor Cyan
foreach ($f in $RootAllowlist) {
    $src = Join-Path ".ai" $f
    if (Test-Path $src) {
        Copy-Item $src "./$f" -Force
    }
}

Remove-Item ".ai-output" -Recurse -Force

Write-Host "  Running tests..." -ForegroundColor Cyan
npx vitest run
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }

Write-Host "Full sync complete." -ForegroundColor Green
