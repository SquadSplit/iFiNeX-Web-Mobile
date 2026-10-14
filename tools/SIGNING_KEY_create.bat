@echo off
title iFiNeX - create / show signing key
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org ^(Next, Next, Finish^), then double-click this file again.
  pause
  exit /b 1
)
node tools\signing-key.js setup %*
echo.
pause
