#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
node tools/signing-key.js show
