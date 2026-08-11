# Install Wanwu CLI for Windows (PowerShell).
$ErrorActionPreference = "Stop"

$Version = if ($env:WANWU_INSTALL_VERSION) { $env:WANWU_INSTALL_VERSION } else { "1.0.0-beta" }
$InstallDir = if ($env:WANWU_INSTALL_DIR) { $env:WANWU_INSTALL_DIR } else { Join-Path $HOME ".wanwu\bin" }
$Repo = if ($env:WANWU_INSTALL_REPO) { $env:WANWU_INSTALL_REPO } else { "yipengcao-css/Wanwu-Code" }
$From = if ($env:WANWU_INSTALL_FROM) { $env:WANWU_INSTALL_FROM } else { "release" }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$Asset = "wanwu-$Version-win-x64.exe"
$Dest = Join-Path $InstallDir "wanwu.exe"

if ($From -eq "local") {
  $Root = Split-Path -Parent $PSScriptRoot
  if (-not $Root) { $Root = Get-Location }
  # When run as scripts/install.ps1, repo root is parent of scripts
  $Root = Resolve-Path (Join-Path $PSScriptRoot "..")
  $Local = Join-Path $Root "dist-bin\$Asset"
  $Mjs = Join-Path $Root "dist-bin\wanwu.mjs"
  if (Test-Path $Local) {
    Copy-Item $Local $Dest -Force
    Write-Host "installed local native → $Dest"
  } elseif (Test-Path $Mjs) {
    Copy-Item $Mjs (Join-Path $InstallDir "wanwu.mjs") -Force
    @"
@echo off
node "%~dp0wanwu.mjs" %*
"@ | Set-Content -Path (Join-Path $InstallDir "wanwu.cmd") -Encoding ASCII
    Write-Host "installed local mjs wrapper → $InstallDir\wanwu.cmd"
  } else {
    throw "local dist-bin missing — run pnpm build:cli && pnpm build:cli:native"
  }
} else {
  $Url = "https://github.com/$Repo/releases/download/v$Version/$Asset"
  try {
    Write-Host "downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Dest
    Write-Host "installed native → $Dest"
  } catch {
    $MjsUrl = "https://github.com/$Repo/releases/download/v$Version/wanwu-$Version.mjs"
    Write-Host "native missing; falling back to $MjsUrl"
    $MjsDest = Join-Path $InstallDir "wanwu.mjs"
    Invoke-WebRequest -Uri $MjsUrl -OutFile $MjsDest
    @"
@echo off
node "%~dp0wanwu.mjs" %*
"@ | Set-Content -Path (Join-Path $InstallDir "wanwu.cmd") -Encoding ASCII
    Write-Host "installed mjs → $InstallDir\wanwu.cmd"
  }
}

Write-Host ""
Write-Host "Add to PATH (User):"
Write-Host "  $InstallDir"
Write-Host "Then: wanwu doctor"
