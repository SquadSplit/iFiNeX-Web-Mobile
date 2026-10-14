/* iFiNeX v8.8 — ONE Settings menu, identical on every page and in every mode (website, app+server, standalone).
   Order:  🎨 Theme & background · 🔔 Alerts & notifications · 💾 Backup & Restore · ⇅ Import / Export · ⬆️ Check for updates · 🔌 Connection (app only)
   Then "Account": ⚙️ Admin · 🚪 Log out.   Other scripts still inject their own entries; this file removes duplicates and puts everything in this order. */
(function (W, D) {
  'use strict';
  var C = W.IFX_CFG || {};
  function mk(cls, html, fn) { var b = D.createElement('button'); b.className = 'drawer-item ' + cls; b.innerHTML = html; b.addEventListener('click', function () { try { W.closeDrawer(); } catch (e) { } fn(); }); return b; }
  function pick(dr, sel) { return dr.querySelector(sel); }
  function organize() {
    var dr = D.getElementById('drawer'); if (!dr) return;
    var head = [].slice.call(dr.querySelectorAll('.drawer-sec')).filter(function (x) { return /settings/i.test(x.textContent); })[0];
    if (!head) { head = D.createElement('div'); head.className = 'drawer-sec'; head.textContent = 'Settings'; var ft = D.getElementById('ifx-ver'); dr.insertBefore(head, ft || null); }
    // remove entries that now live inside "Backup & Restore"
    [].forEach.call(dr.querySelectorAll('.ifx-bk-item,.ifx-gd-item'), function (x) { x.remove(); });
    var theme = pick(dr, '[onclick*="openAppearance"],a[href$="#theme"]');
    var alerts = pick(dr, '[onclick*="openAlerts"],a[href$="#alerts"]');
    var bk = pick(dr, '.ifx-bkr-item') || mk('ifx-bkr-item', '💾 Backup &amp; Restore', function () { W.ifxBR && W.ifxBR.open(); });
    var xfer = pick(dr, '.ifx-xfer-item,[onclick*="ifxXfer.open"]') || mk('ifx-xfer-item', '⇅ Import / Export (Excel &amp; PDF)', function () { W.ifxXfer && W.ifxXfer.open(); });
    var upd = D.getElementById('btn-update') || (W.ifxUpdate ? (function () { var b = mk('', '⬆️ Check for updates<span id="upd-dot"></span>', function () { W.ifxUpdate.open(); }); b.id = 'btn-update'; return b; })() : null);
    var conn = pick(dr, '.ifx-conn-item');
    var list = [theme, alerts, bk, xfer, upd, conn].filter(Boolean), at = head;
    list.forEach(function (n) { if (at.nextElementSibling !== n) at.parentNode.insertBefore(n, at.nextElementSibling); at = n; });
    // Account block
    var acc = dr.querySelector('.ifx-acc-sec');
    if (!acc) { acc = D.createElement('div'); acc.className = 'drawer-sec ifx-acc-sec'; acc.textContent = 'Account'; at.parentNode.insertBefore(acc, at.nextElementSibling); }
    at = acc;
    var admin = D.getElementById('btn-open-admin') || D.getElementById('btn-admin-panel');
    var out = dr.querySelector('.drawer-item[onclick*="logout"]');
    [admin, out].filter(Boolean).forEach(function (n) { if (at.nextElementSibling !== n) at.parentNode.insertBefore(n, at.nextElementSibling); at = n; });
    var ver = D.getElementById('ifx-ver'); if (ver && ver !== at.nextElementSibling) at.parentNode.insertBefore(ver, at.nextElementSibling);
  }
  function boot() { organize(); setInterval(organize, 1200); }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else boot();
  W.ifxSettings = { organize: organize };
})(window, document);
