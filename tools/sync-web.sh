#!/bin/bash
# Pulls the newest website from WEB_REPO and, if it differs from what is inside the app, replaces www/ and raises the patch version.
# Writes  changed=true|false  and  version=x.y.z  to $GITHUB_OUTPUT.
#
# Safety rules (each one exists because of a real risk):
#   * ALLOW-LIST: only the website's real files are copied (*.html *.js *.css *.json *.webmanifest + folders assets/ and vendor/).
#     Old folders / notes in the website repo ("iFiNeX v8.1", "_scripts", CHANGED_FILES.txt, *.md ...) never end up inside the APK.
#   * NEVER GO BACKWARDS: if the website repo says a LOWER web version than the one already inside the app, nothing is synced.
#   * sanity check that it really is the iFiNeX site before touching anything.
set -euo pipefail
: "${WEB_REPO:?WEB_REPO is not set}"; BR="${WEB_BRANCH:-main}"
OUTF="${GITHUB_OUTPUT:-/dev/stdout}"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
if [ -n "${WEB_ZIP:-}" ]; then cp "$WEB_ZIP" "$T/w.zip"; else curl -fsSL --retry 3 "https://codeload.github.com/$WEB_REPO/zip/refs/heads/$BR" -o "$T/w.zip"; fi
unzip -q "$T/w.zip" -d "$T/x"; SRC=$(ls -d "$T"/x/*/ | head -1); SRC=${SRC%/}
for f in bill-tracker.html index.html start.html ifinex-update.js ifinex-session.js ifinex-config.js ifinex-config.json vendor/ifinex-local.js; do [ -f "$SRC/$f" ] || { echo "::error::$f missing in $WEB_REPO@$BR — refusing to sync"; exit 1; }; done
grep -q "supabase" "$SRC/bill-tracker.html" || { echo "::error::unexpected website content"; exit 1; }

# ---- allow-list copy
PUB="$T/pub"; mkdir -p "$PUB"
shopt -s nullglob
for f in "$SRC"/*.html "$SRC"/*.js "$SRC"/*.css "$SRC"/*.json "$SRC"/*.webmanifest; do cp "$f" "$PUB/"; done
for d in assets vendor; do [ -d "$SRC/$d" ] && cp -r "$SRC/$d" "$PUB/$d"; done
shopt -u nullglob
find "$PUB" -name '.DS_Store' -delete 2>/dev/null || true

# ---- never go backwards
webver() { python3 -I -c "import json,sys
try: print(json.load(open(sys.argv[1])).get('web',''))
except Exception: print('')" "$1"; }
NEWV=$(webver "$PUB/ifinex-version.json"); OLDV=$(webver www/ifinex-version.json 2>/dev/null || true)
if [ -n "$NEWV" ] && [ -n "$OLDV" ] && [ "$NEWV" != "$OLDV" ] && [ "$(printf '%s\n%s\n' "$NEWV" "$OLDV" | sort -V | head -1)" = "$NEWV" ]; then
  echo "::warning::Website repo is at web v$NEWV but the app already contains v$OLDV. NOT syncing an older website. Upload the newer website files to $WEB_REPO first."
  echo "changed=false" >> "$OUTF"; exit 0
fi

CUR=www
if [ -d "$CUR" ] && diff -rq "$PUB" "$CUR" >/dev/null 2>&1; then
  echo "Website unchanged — nothing to do."; echo "changed=false" >> "$OUTF"; exit 0
fi
rm -rf "$CUR"; cp -r "$PUB" "$CUR"
python3 -I - <<'PY' >> "$OUTF"
import re
p='android/app/build.gradle'; s=open(p).read()
m=re.search(r'versionName "(\d+)\.(\d+)\.(\d+)"',s)
a,b,c=map(int,m.groups()); new=f'{a}.{b}.{c+1}'
s=s.replace(m.group(0),f'versionName "{new}"',1); open(p,'w').write(s)
import json
q='package.json'; d=json.load(open(q)); d['version']=new; open(q,'w').write(json.dumps(d,indent=2)+'\n')
print('changed=true'); print('version='+new)
PY
echo "Website changed — copied into the app and version raised."
