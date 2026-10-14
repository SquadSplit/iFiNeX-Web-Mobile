#!/bin/bash
# iFiNeX - create the ONE signing key (first time) and walk through the GitHub secrets.  Mac/Linux:  bash tools/SIGNING_KEY_create.sh
cd "$(dirname "$0")/.." || exit 1
command -v node >/dev/null || { echo "Install Node.js (LTS) from https://nodejs.org first."; exit 1; }
node tools/signing-key.js setup "$@"
