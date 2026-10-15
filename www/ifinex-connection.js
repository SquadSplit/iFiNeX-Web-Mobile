/* iFiNeX v8.7 — Settings ☰ → 🔌 Connection. Shows how this app is connected (server / standalone) and lets the user change it. App (Android/iOS) only. */
(function (W, D) {
  'use strict';
  var C = W.IFX_CFG; if (!C || !C.native) return;
  var ov = null;
  function el(t, css, txt) { var n = D.createElement(t); if (css) n.style.cssText = css; if (txt != null) n.textContent = txt; return n; }
  function btn(label, primary, fn) {
    var b = el('button', 'width:100%;padding:13px;border-radius:12px;margin-top:8px;font-weight:800;font-size:.9rem;cursor:pointer;border:1px solid var(--border,rgba(255,255,255,.2));' + (primary ? 'background:var(--accent,#4d96ff);color:#fff;border-color:transparent;' : 'background:var(--card2,rgba(255,255,255,.06));color:var(--text,inherit);'), label);
    b.addEventListener('click', fn); return b;
  }
  function close() { if (ov) { ov.remove(); ov = null; } }
  function say(m) { try { (W.toast || W.showToast)(m); } catch (e) { alert(m); } }
  function nice(u) { try { return new URL(u).host; } catch (e) { return u || ''; } }

  function open() {
    close();
    ov = el('div', 'position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;');
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var box = el('div', 'width:min(520px,100%);max-height:88vh;overflow:auto;background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:22px 22px 0 0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));box-sizing:border-box;');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    var h = el('div', 'display:flex;justify-content:space-between;align-items:center;font-weight:900;font-size:1.05rem;'); h.appendChild(el('span', '', '🔌 Connection'));
    var x = el('button', 'background:none;border:0;color:inherit;font-size:1.2rem;cursor:pointer;', '✕'); x.setAttribute('aria-label', 'Close'); x.addEventListener('click', close); h.appendChild(x); box.appendChild(h);
    var info = el('div', 'font-size:.84rem;line-height:1.6;margin:12px 0;background:var(--card2,rgba(255,255,255,.05));border-radius:12px;padding:11px;');
    if (C.mode === 'standalone') {
      info.appendChild(el('div', 'font-weight:800;', '📱 Standalone — this phone only'));
      info.appendChild(el('div', 'color:var(--muted,#9aa3c7);font-size:.76rem;', 'Your data is stored on this phone. No account, no internet needed.'));
    } else {
      info.appendChild(el('div', 'font-weight:800;', '☁️ ' + C.name));
      info.appendChild(el('div', 'color:var(--muted,#9aa3c7);font-size:.76rem;', 'Server: ' + nice(C.site || (JSON.parse(localStorage.getItem('ifx_server') || '{}').url || '')) + ''));
    }
    box.appendChild(info);
    if (C.mode === 'server') {
      box.appendChild(btn('Re-check this server', false, async function () {
        try {
          var s = JSON.parse(localStorage.getItem('ifx_server') || '{}'); if (!s.url) return say('No server address stored — use “Change”.');
          var r = await fetch(s.url + 'ifinex-config.json', { cache: 'no-store', credentials: 'omit' }); var c = await r.json();
          if (!W.IFX_MODE.valid(c)) throw new Error('invalid');
          if (c.supabaseUrl.replace(/\/+$/, '') !== s.supabaseUrl) { if (!confirm('This server now points to a DIFFERENT database.\nOnly accept if the server owner told you.\n\nContinue?')) return; }
          W.IFX_MODE.useServer(c, s.url); say('Server settings refreshed ✓'); setTimeout(function () { location.reload(); }, 600);
        } catch (e) { say('❌ Could not reach the server right now.'); }
      }));
    }
    box.appendChild(btn(C.mode === 'standalone' ? 'Connect to a server…' : 'Change server / switch to standalone…', true, function () { location.href = 'start.html?change=1'; }));
    box.appendChild(el('div', 'font-size:.7rem;color:var(--muted,#9aa3c7);margin-top:10px;line-height:1.5;', 'Switching never deletes anything: the standalone data stays on this phone, and server data stays on the server.'));
    box.appendChild(btn('Close', false, close));
    ov.appendChild(box); D.body.appendChild(ov);
  }
  W.ifxConnection = { open: open };

  function drawer() {
    var dr = D.getElementById('drawer'); if (!dr || dr.querySelector('.ifx-conn-item')) return;
    var secs = [].slice.call(dr.querySelectorAll('.drawer-sec')), s = secs.filter(function (x) { return /settings/i.test(x.textContent); })[0];
    var b = D.createElement('button'); b.className = 'drawer-item ifx-conn-item'; b.textContent = '🔌 Connection'; b.addEventListener('click', function () { try { W.closeDrawer(); } catch (e) { } open(); });
    if (s) s.insertAdjacentElement('afterend', b); else dr.appendChild(b);
    var ft = D.getElementById('ifx-ver'); if (ft && !/·\s*(☁️|📱)/.test(ft.textContent)) if (C.mode !== 'standalone') ft.dataset.mode = '☁️ server';
  }
  function paintFooter() { var ft = D.getElementById('ifx-ver'); if (ft && ft.dataset.mode && ft.textContent.indexOf(ft.dataset.mode) < 0) ft.textContent += ' · ' + ft.dataset.mode; }
  function boot() { drawer(); setInterval(function () { drawer(); paintFooter(); }, 1500); }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
