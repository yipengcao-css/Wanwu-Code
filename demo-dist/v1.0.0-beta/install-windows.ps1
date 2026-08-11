# Wanwu-Code Windows demo installer (OFFLINE — runs from this folder after git clone + git lfs pull)
# Usage (PowerShell, from repo or this folder):
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   cd <repo>\demo-dist\v1.0.0-beta
#   .\install-windows.ps1
#
# Optional:
#   .\install-windows.ps1 -SkipDesktop
#   .\install-windows.ps1 -SkipCli
#   .\install-windows.ps1 -InstallDir "$env:USERPROFILE\WanwuCode"

param(
  [string]$InstallDir = (Join-Path $env:USERPROFILE "WanwuCode"),
  [switch]$SkipDesktop,
  [switch]$SkipCli,
  [switch]$SkipExtension
)

$ErrorActionPreference = "Stop"
$Here = $PSScriptRoot
$DesktopZip = Join-Path $Here "desktop\Wanwu-Code-1.0.0-beta-win-x64.zip"
$CliExe = Join-Path $Here "cli\wanwu-1.0.0-beta-win-x64.exe"
$Vsix = Join-Path $Here "extension\wanwu-code-1.0.0-beta.vsix"

Write-Host "==> Wanwu-Code Windows demo install"
Write-Host "    source: $Here"
Write-Host "    target: $InstallDir"

if (-not (Test-Path $DesktopZip) -and -not $SkipDesktop) {
  throw "Desktop zip missing: $DesktopZip`nDid you run: git lfs pull ?"
}
if (-not (Test-Path $CliExe) -and -not $SkipCli) {
  throw "CLI exe missing: $CliExe`nDid you run: git lfs pull ?"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$BinDir = Join-Path $InstallDir "bin"
$AppDir = Join-Path $InstallDir "app"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

if (-not $SkipDesktop) {
  Write-Host "==> Extract Desktop IDE"
  if (Test-Path $AppDir) { Remove-Item -Recurse -Force $AppDir }
  Expand-Archive -Path $DesktopZip -DestinationPath $AppDir -Force
  # Find Wanwu Code.exe under extracted tree
  $Exe = Get-ChildItem -Path $AppDir -Recurse -Filter "Wanwu Code.exe" | Select-Object -First 1
  if (-not $Exe) { throw "Wanwu Code.exe not found inside $DesktopZip" }
  $Shortcut = Join-Path $InstallDir "Wanwu Code.lnk"
  $Wsh = New-Object -ComObject WScript.Shell
  $Sc = $Wsh.CreateShortcut($Shortcut)
  $Sc.TargetPath = $Exe.FullName
  $Sc.WorkingDirectory = $Exe.DirectoryName
  $Sc.Save()
  Write-Host "    Desktop: $($Exe.FullName)"
  Write-Host "    Shortcut: $Shortcut"
}

if (-not $SkipCli) {
  Write-Host "==> Install CLI wanwu.exe"
  Copy-Item $CliExe (Join-Path $BinDir "wanwu.exe") -Force
  Write-Host "    CLI: $BinDir\wanwu.exe"
}

if (-not $SkipExtension -and (Test-Path $Vsix)) {
  Write-Host "==> VS Code / Cursor extension VSIX"
  Write-Host "    File: $Vsix"
  Write-Host "    Install manually: Extensions → … → Install from VSIX"
  if (Get-Command code -ErrorAction SilentlyContinue) {
    try {
      & code --install-extension $Vsix
      Write-Host "    Installed via 'code --install-extension'"
    } catch {
      Write-Host "    (auto install failed; use VSIX UI)"
    }
  }
}

# User PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
  [Environment]::SetEnvironmentVariable("Path", ($userPath.TrimEnd(';') + ";" + $BinDir), "User")
  Write-Host "==> Added to User PATH: $BinDir"
  Write-Host "    Re-open PowerShell, then: wanwu doctor"
} else {
  Write-Host "==> PATH already contains $BinDir"
}

Write-Host ""
Write-Host "Done. Launch Desktop via shortcut, or CLI:"
Write-Host "  $BinDir\wanwu.exe doctor"
