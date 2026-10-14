@echo off
title iFiNeX - signing key fingerprint
cd /d "%~dp0.."
node tools\signing-key.js show
echo.
pause
