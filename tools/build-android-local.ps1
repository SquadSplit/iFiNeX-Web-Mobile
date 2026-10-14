# iFiNeX - prepare the project for Android Studio (Windows).  Double-click build-android-local.bat  (or right-click this file -> Run with PowerShell)
# It finds the project folder (the one that contains package.json) by itself, so it works from anywhere.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'package.json'))) { Write-Host "ERROR: package.json not found in $root. This script must stay inside the 'tools' folder of the iFiNeX project." -ForegroundColor Red; Read-Host 'Press Enter'; exit 1 }
Set-Location $root
Write-Host "Project folder: $root"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Node.js is not installed. Install the LTS version from https://nodejs.org (Next, Next, Finish), then run this again." -ForegroundColor Red; Read-Host 'Press Enter'; exit 1 }

Write-Host "`n[1/3] Installing packages (npm ci) ..." -ForegroundColor Cyan
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { npm install --no-audit --no-fund }

Write-Host "`n[2/3] Copying the website + plugins into the Android project (cap sync) ..." -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Host 'cap sync failed - read the message above.' -ForegroundColor Red; Read-Host 'Press Enter'; exit 1 }

Write-Host "`n[3/3] Checking the signing key (needed so the APK installs as an UPDATE) ..." -ForegroundColor Cyan
node tools\signing-key.js check
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nNo working signing key yet. Without it Android Studio will refuse to build (on purpose)." -ForegroundColor Yellow
  $k = Read-Host 'Create the key now? (y/n)'
  if ($k -eq 'y') { node tools\signing-key.js setup } else { Write-Host "OK. Later: double-click tools\SIGNING_KEY_create.bat" }
}

Write-Host "`nDONE. In Android Studio: File > Open > choose the 'android' folder inside $root -> wait for Gradle sync -> Build > Build APK(s)." -ForegroundColor Green
Write-Host "APK appears in android\app\build\outputs\apk\debug\app-debug.apk"
$a = Read-Host 'Open Android Studio now? (y/n)'
if ($a -eq 'y') { npx cap open android }
