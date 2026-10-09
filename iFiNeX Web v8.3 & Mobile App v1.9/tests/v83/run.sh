#!/bin/bash
cd /home/claude/out/tree/web && python3 -m http.server 8765 >/dev/null 2>&1 &
SP=$!; sleep 1.2
cd /home/claude/work/t && python3 "$@"
kill $SP 2>/dev/null
