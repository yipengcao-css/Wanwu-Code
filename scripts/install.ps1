# Install Wanwu CLI for Windows (PowerShell).
#
# IMPORTANT: If the GitHub repo is PRIVATE, this will NOT work:
#   irm https://raw.githubusercontent.com/.../install.ps1 | iex
# because raw.githubusercontent.com returns 404 without auth.
#
# For company demos, prefer the offline script after clone + git lfs pull:
#   cd demo-dist\v1.0.0-beta
#   .\install-windows.ps1
#
# Or from a local clone:
#   $env:WANWU_INSTALL_FROM="demo"
#   .\scripts\install.ps1

$ErrorActionPreference = "Stop"

$Version = if ($env:WANWU_INSTALL_VERSION) { $env:WANWU_INSTALL_VERSION } else { "1.0.0-beta" }
$InstallDir = if ($env:WANWU_INSTALL_DIR) { $env:WANWU_INSTALL_DIR } else { Join-Path $HOME ".wanwu\bin" }
$Repo = if ($env:WANWU_INSTALL_REPO) { $env:WANWU_INSTALL_REPO } else { "yipengcao-css/Wanwu-Code" }
$From = if ($env:WANWU_INSTALL_FROM) { $env:WANWU_INSTALL_FROM } else { "demo" }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$Asset = "wanwu-$Version-win-x64.exe"
$Dest = Join-Path $InstallDir "wanwu.exe"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Install-Native([string]$Src) {
  Copy-Item $Src $Dest -Force
  Write-Host "installed → $Dest"
}

if ($From -eq "demo") {
  $DemoCli = Join-Path $Root "demo-dist\v$Version\cli\$Asset"
  # also allow without 'v' prefix folder already uses v1.0.0-beta
  if (-not (Test-Path $DemoCli)) {
    $DemoCli = Join-Path $Root "demo-dist\$Version\cli\$Asset"
  }
  if (-not (Test-Path $DemoCli)) {
    $DemoCli = Join-Path $Root "demo-dist\v1.0.0-beta\cli\$Asset"
  }
  if (Test-Path $DemoCli) {
    Install-Native $DemoCli
  } else {
    throw "demo CLI missing: $DemoCli`nRun: git lfs pull`nOr: demo-dist\v1.0.0-beta\install-windows.ps1"
  }
} elseif ($From -eq "local") {
  $Local = Join-Path $Root "dist-bin\$Asset"
  $Mjs = Join-Path $Root "dist-bin\wanwu.mjs"
  if (Test-Path $Local) {
    Install-Native $Local
  } elseif (Test-Path $Mjs) {
    Copy-Item $Mjs (Join-Path $InstallDir "wanwu.mjs") -Force
    @"
@echo off
node "%~dp0wanwu.mjs" %*
"@ | Set-Content -Path (Join-Path $InstallDir "wanwu.cmd") -Encoding ASCII
    Write-Host "installed local mjs wrapper → $InstallDir\wanwu.cmd"
  } else {
    throw "local dist-bin missing — run pnpm build:cli:native"
  }
} else {
  $Url = "https://github.com/$Repo/releases/download/v$Version/$Asset"
  Write-Host "downloading $Url"
  try {
    Invoke-WebRequest -Uri $Url -OutFile $Dest
    Write-Host "installed native → $Dest"
  } catch {
    throw "Download failed (private repo / no Release asset?). Use:`n  git clone … && git lfs pull`n  demo-dist\v1.0.0-beta\install-windows.ps1`nError: $_"
  }
}

Write-Host ""
Write-Host "Add to PATH (User) if needed:"
Write-Host "  $InstallDir"
Write-Host "Then open a new PowerShell: wanwu doctor"
Write-Host ""
Write-Host "Full Windows demo (Desktop+CLI):"
Write-Host "  .\demo-dist\v1.0.0-beta\install-windows.ps1"
