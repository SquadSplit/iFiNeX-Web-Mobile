/* iFiNeX v8.7 — "Check for updates" (Settings ☰ → ⬆️ Check for updates)
   • Android app: asks the native plugin IfinexUpdater, which looks at the newest GitHub Release of the repo that BUILDS the app (a new Release appears by itself
     whenever you push to the website repo or the app repo), shows "update available", downloads the .apk ONLY when the user taps Download, verifies it
     (same app, newer build number, same signing certificate) and opens Android's install screen — the user taps Install there.
   • Browser / website: compares ifinex-version.json on the server with the version loaded in this tab and offers a reload.
   The JS never chooses a repo or a URL — that is fixed inside the app (see IfinexUpdatePlugin.java). Release notes are shown as plain text only. */
(function (W, D) {
  'use strict';
  var WEB_VER = '9.0';
  var LAST_KEY = 'ifx_upd_last', BANNER_KEY = 'ifx_upd_banner';
  var CHECK_EVERY_MS = 3 * 3600 * 1000;     // background check cadence

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { } return null; }
  function native() { try { return !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  function plugin() { try { return native() ? ((W.Capacitor.Plugins || {}).IfinexUpdater || null) : null; } catch (e) { return null; } }
  function mb(n) { return n ? (n / 1048576).toFixed(1) + ' MB' : ''; }
  // build number = minutes since 1970 (see build.gradle) -> a readable date
  function bdate(n) { try { return n > 1e6 ? new Date(n * 60000).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; } catch (e) { return ''; } }
  function shortKey(h) { return h ? String(h).toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 16).replace(/(.{4})(?=.)/g, '$1 ') : ''; }

  var MSG = {
    not_configured: 'Updates are not set up in this build yet. The app has no GitHub repository configured (see Setup Guide → Automatic updates).',
    no_release: 'No published release was found yet. Publish one on GitHub first.',
    http_404: 'No release found on GitHub (is the repository public and does it have a Release?).',
    http_403: 'GitHub is limiting requests right now. Try again in an hour.',
    blocked_host: 'Blocked: the download address is not a GitHub address.',
    up_to_date: 'You already have the newest version.',
    checksum_mismatch: 'The download is damaged (checksum does not match). Nothing was installed. Try again.',
    wrong_package: 'Blocked: that file is not this app. Nothing was installed.',
    not_newer: 'That file is not newer than the installed app. Nothing was installed.',
    signature_mismatch: 'Blocked for your safety: this update is signed with a DIFFERENT key than the app installed on this phone, so Android would refuse it. One-time fix: make a backup (Settings → Backup & Restore), uninstall iFiNeX, install the newest APK from GitHub. After that every update installs over the old one. Details: "Signing Key & Auto-Update Guide", Part 6.',
    cannot_verify_signature: 'Could not verify who signed the update, so it was not installed.',
    bad_apk: 'The downloaded file is not a valid app. Nothing was installed.',
    too_large: 'The download is unexpectedly large. Nothing was installed.',
    nothing_downloaded: 'Nothing downloaded yet.'
  };
  function friendly(e) {
    var m = String((e && (e.message || e.errorMessage)) || e || '');
    var k = m.split(':')[0].trim();
    if (MSG[k]) return MSG[k];
    if (/Unable to resolve host|timeout|timed out|UnknownHost|Failed to connect/i.test(m)) return 'No internet connection — try again when you are online.';
    return 'Update problem: ' + m;
  }

  // ---------- UI (plain DOM, textContent only) ----------
  var ov = null;
  function el(tag, css, txt) { var n = D.createElement(tag); if (css) n.style.cssText = css; if (txt != null) n.textContent = txt; return n; }
  function btn(label, primary, fn) {
    var b = el('button', 'width:100%;padding:13px;border-radius:12px;margin-top:8px;font-weight:800;font-size:.9rem;cursor:pointer;border:1px solid var(--border,rgba(255,255,255,.2));' +
      (primary ? 'background:var(--accent,#4d96ff);color:#fff;border-color:transparent;' : 'background:var(--card2,rgba(255,255,255,.06));color:var(--text,inherit);'), label);
    b.addEventListener('click', fn); return b;
  }
  function close() { if (ov) { ov.remove(); ov = null; } }
  function shell() {
    close();
    ov = el('div', 'position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;');
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var box = el('div', 'width:min(520px,100%);max-height:88vh;overflow:auto;background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:22px 22px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));box-sizing:border-box;');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    ov.appendChild(box); D.body.appendChild(ov); return box;
  }
  function head(box, sub) {
    var h = el('div', 'display:flex;justify-content:space-between;align-items:center;font-weight:900;font-size:1.05rem;');
    h.appendChild(el('span', '', '⬆️ Updates'));
    var x = el('button', 'background:none;border:0;color:inherit;font-size:1.2rem;cursor:pointer;', '✕'); x.setAttribute('aria-label', 'Close'); x.addEventListener('click', close); h.appendChild(x);
    box.appendChild(h);
    if (sub) box.appendChild(el('div', 'font-size:.74rem;color:var(--muted,#9aa3c7);margin:6px 0 4px;', sub));
  }
  function line(box, txt, color) { var d = el('div', 'font-size:.84rem;margin:10px 0;line-height:1.45;' + (color ? 'color:' + color + ';' : ''), txt); box.appendChild(d); return d; }

  async function appInfo() {
    var p = plugin(); if (!p) return null;
    try { return await p.info(); } catch (e) { return null; }
  }

  // ---------- website / browser ----------
  async function openWeb(box) {
    head(box, 'Website version v' + WEB_VER);
    var status = line(box, 'Checking…');
    try {
      var r = await fetch('ifinex-version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('http_' + r.status);
      var j = await r.json();
      if (String(j.web) === WEB_VER) { status.textContent = '✅ You have the newest version (v' + WEB_VER + ').'; box.appendChild(btn('Close', false, close)); return; }
      status.textContent = 'A newer version (v' + j.web + ') is available.';
      box.appendChild(btn('Reload and update now', true, async function () {
        try { if (W.caches) { var ks = await W.caches.keys(); await Promise.all(ks.map(function (k) { return W.caches.delete(k); })); } } catch (e) { }
        try { if (navigator.serviceWorker) { var rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(function (x) { return x.update(); })); } } catch (e) { }
        W.location.reload();
      }));
    } catch (e) { status.textContent = '❌ Could not check: ' + friendly(e); status.style.color = '#FF6B6B'; }
    box.appendChild(btn('Close', false, close));
  }

  // ---------- Android app ----------
  var busy = false;
  async function openNative(box, p) {
    var inf = await appInfo();
    head(box, 'Website v' + WEB_VER + ' · App v' + (inf && inf.versionName || '?') + (inf && inf.edition ? ' (' + inf.edition + ')' : ''));
    var status = line(box, 'Checking GitHub…');
    var area = el('div'); box.appendChild(area);
    if (inf && inf.certSha256) { var kd = el('div', 'font-size:.68rem;color:var(--muted,#9aa3c7);margin:-4px 0 6px;', 'Installed build ' + (bdate(inf.versionCode) || inf.versionCode) + ' · signed with key ' + shortKey(inf.certSha256) + '…'); box.insertBefore(kd, area); }
    var r;
    try { r = await p.check(); } catch (e) { status.textContent = '❌ ' + friendly(e); status.style.color = '#FF6B6B'; area.appendChild(btn('Close', false, close)); return; }
    ls(LAST_KEY, String(Date.now()));
    if (!r.newer) {
      status.textContent = r.hasApk === false && r.version ? 'Latest release v' + r.version + ' has no app file for this edition.' : '✅ You have the newest version (v' + r.installedVersion + (r.installedBuild ? ', built ' + bdate(r.installedBuild) : '') + ').';
      area.appendChild(btn('Close', false, close)); setDot(false); return;
    }
    setDot(true);
    status.textContent = 'Update available: v' + r.version + (r.build ? ' (built ' + bdate(r.build) + ')' : '') + ' — you have v' + r.installedVersion + (r.installedBuild ? ' (built ' + bdate(r.installedBuild) + ')' : '') + (r.assetSize ? ' · ' + mb(r.assetSize) : '') + '. Nothing is downloaded until you tap Download.';
    if (r.notes) { var pre = el('pre', 'white-space:pre-wrap;font:inherit;font-size:.76rem;color:var(--muted,#9aa3c7);background:var(--card2,rgba(255,255,255,.05));border-radius:10px;padding:9px;max-height:150px;overflow:auto;margin:6px 0;'); pre.textContent = r.notes.slice(0, 900); area.appendChild(pre); }
    var bar = el('div', 'height:8px;border-radius:6px;background:var(--card2,rgba(255,255,255,.1));overflow:hidden;margin-top:10px;display:none;'), fill = el('div', 'height:100%;width:0;background:var(--accent,#4d96ff);transition:width .2s;'); bar.appendChild(fill); area.appendChild(bar);
    var go = btn('Download update', true, async function () {
      if (busy) return; busy = true; go.disabled = true; go.textContent = 'Downloading…'; bar.style.display = 'block';
      var h; try { h = await p.addListener('progress', function (e) { if (e && e.total > 0) fill.style.width = Math.min(100, Math.round(100 * e.done / e.total)) + '%'; }); } catch (e) { }
      try {
        await p.download(); fill.style.width = '100%';
        status.textContent = '✅ Downloaded and verified (same app, same signing key, newer build). Tap "Install now", then confirm on the Android screen.';
        go.textContent = 'Install now'; go.disabled = false; busy = false;
        go.onclick = null; go.replaceWith(inst);
      } catch (e) { status.textContent = '❌ ' + friendly(e); status.style.color = '#FF6B6B'; go.textContent = 'Try again'; go.disabled = false; busy = false; }
      try { if (h && h.remove) h.remove(); } catch (e) { }
    });
    var inst = btn('Install now', true, async function () {
      // offline edition: the data lives only in the phone — offer a backup first (updates keep it, a backup is insurance)
      try {
        if (W.ifxBackup && W.ifxBackup.exportNow) {
          var last = +new Date(ls('ifx_sa_lastbackup') || 0);
          if (!last || Date.now() - last > 864e5) { if (W.confirm('Make a backup file first? (recommended — your data lives only on this phone)')) await W.ifxBackup.exportNow(); }
        }
      } catch (e) { }
      try {
        var res = await p.install();
        if (res && res.needsPermission) { status.textContent = 'Android needs your permission: in the screen that just opened switch ON "Allow from this source", then come back and tap Install now again.'; }
        else status.textContent = 'Android install screen opened — tap Install there. The app restarts when it finishes.';
      } catch (e) { status.textContent = '❌ ' + friendly(e); status.style.color = '#FF6B6B'; }
    });
    area.appendChild(go); area.appendChild(btn('Later', false, close));
  }

  function setDot(on) {
    try { var d = D.getElementById('upd-dot'); if (d) d.textContent = on ? ' 🔴 new' : ''; } catch (e) { }
  }

  async function open() {
    var box = shell(), p = plugin();
    if (p) return openNative(box, p);
    return openWeb(box);
  }

  // update banner: shown when a quiet check finds a newer build; the tap only OPENS the update dialog (nothing is downloaded or installed by itself)
  function banner(r) {
    try {
      if (D.getElementById('ifx-upd-banner') || ov) return;
      var b = el('div', 'position:fixed;left:10px;right:10px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:9800;display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:14px;background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--accent,#4d96ff);box-shadow:0 8px 28px rgba(0,0,0,.45);font-size:.82rem;');
      b.id = 'ifx-upd-banner'; b.setAttribute('role', 'status');
      b.appendChild(el('span', 'flex:1;line-height:1.35;', '⬆️ Update available: iFiNeX v' + r.version + (r.build ? ' · ' + bdate(r.build) : '')));
      var go = el('button', 'padding:8px 14px;border-radius:10px;border:0;background:var(--accent,#4d96ff);color:#fff;font-weight:800;cursor:pointer;', 'View'); go.addEventListener('click', function () { b.remove(); open(); });
      var x = el('button', 'background:none;border:0;color:inherit;font-size:1.05rem;cursor:pointer;padding:4px;', '✕'); x.setAttribute('aria-label', 'Dismiss'); x.addEventListener('click', function () { b.remove(); });
      b.appendChild(go); b.appendChild(x); D.body.appendChild(b);
    } catch (e) { }
  }

  // quiet background check (native only): at start and whenever the app comes back to the front, at most every CHECK_EVERY_MS
  async function quiet(force) {
    try {
      var p = plugin(); if (!p) return;
      if (!force && Date.now() - (+ls(LAST_KEY) || 0) < CHECK_EVERY_MS) return;
      var r = await p.check(); ls(LAST_KEY, String(Date.now()));
      if (r && r.newer) {
        setDot(true);
        var id = String(r.build || r.version);
        if (ls(BANNER_KEY) !== id) { ls(BANNER_KEY, id); banner(r); }
      }
    } catch (e) { /* offline or not configured: stay silent */ }
  }

  async function paintVersion() {
    var inf = await appInfo(); if (!inf || !inf.versionName) return;
    var f = D.getElementById('ifx-ver'); if (f) f.textContent = 'iFiNeX web v' + WEB_VER + ' · app v' + inf.versionName;
  }

  W.ifxUpdate = { open: open, quiet: quiet, webVersion: WEB_VER, friendly: friendly };
  function start() {
    paintVersion(); setTimeout(quiet, 6000);
    try { D.addEventListener('visibilitychange', function () { if (D.visibilityState === 'visible') setTimeout(quiet, 1500); }); } catch (e) { }
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})(window, document);
