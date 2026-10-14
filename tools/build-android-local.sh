#!/bin/bash
# iFiNeX - prepare the project for Android Studio (Mac/Linux)
set -e
cd "$(dirname "$0")/.."
[ -f package.json ] || { echo "package.json not found - run this from the iFiNeX project"; exit 1; }
echo "[1/3] npm ci";  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
echo "[2/3] cap sync"; npx cap sync android
echo "[3/3] signing key"
if ! node tools/signing-key.js check; then
  read -r -p "No working signing key yet. Create it now? (y/n) " k
  [ "$k" = "y" ] && node tools/signing-key.js setup || echo "Later: bash tools/SIGNING_KEY_create.sh"
fi
echo "DONE. Android Studio: File > Open > the 'android' folder -> Build > Build APK(s)."
