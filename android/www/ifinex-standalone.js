/* iFiNeX Standalone — on-device edition UI layer (loaded on both pages, after ifinex-tools.js).
   * no login / OTP / admin accounts / delegates / cloud notifications
   * Settings → "Backup & Restore": export / import ALL data as one file, erase everything
   * first run: asks for your name once                                                          */
(function () {
  'use strict';
  var W = window, D = document, L = W.IFX_LOCAL; if (!L) return;
  W.IFX_STANDALONE = true;
  D.documentElement.classList.add('ifx-sa');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var say = function (m) { try { (W.toast || W.showToast)(m); } catch (e) { alert(m); } };
  var isSQ = !!D.getElementById('page-balances');

  var css = D.createElement('style');
  css.textContent =
    // cloud-only things disappear
    '.ifx-sa .notif-wrap,.ifx-sa #btn-switch-account,.ifx-sa #link-to-squad-x,.ifx-sa #btn-open-admin,.ifx-sa #owesub-admin,.ifx-sa #htab-owedtome,.ifx-sa .drawer-item[onclick*="logout"],.ifx-sa .drawer-item[onclick*="openAlerts"],.ifx-sa .drawer-item[href*="#alerts"],.ifx-sa .login-only{display:none!important}' +
    '.ifx-sa .user-pill{pointer-events:none}' +
    '#ifx-bk{position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center}#ifx-bk.open{display:flex}' +
    '#ifx-bk .box{width:min(560px,100%);max-height:92vh;overflow:auto;background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.15));border-radius:22px 22px 0 0;padding:18px 16px 24px;box-sizing:border-box}' +
    '@media(min-width:700px){#ifx-bk{align-items:center}#ifx-bk .box{border-radius:22px}}' +
    '#ifx-bk h3{margin:0 0 4px;font-size:1.1rem}#ifx-bk .sub{font-size:.74rem;color:var(--muted,#9aa3c7);margin-bottom:12px;line-height:1.5}' +
    '#ifx-bk .stat{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0 14px}#ifx-bk .stat div{background:var(--card2,rgba(255,255,255,.06));border:1px solid var(--border,rgba(255,255,255,.12));border-radius:12px;padding:8px 6px;text-align:center;font-size:.64rem;color:var(--muted,#9aa3c7)}#ifx-bk .stat b{display:block;font-size:1.05rem;color:var(--text,#fff)}' +
    '#ifx-bk .act{display:block;width:100%;padding:13px;border-radius:13px;border:1px solid var(--border,rgba(255,255,255,.2));background:var(--card2,rgba(255,255,255,.06));color:inherit;font-weight:800;font-size:.9rem;margin-top:9px;cursor:pointer;text-align:left}' +
    '#ifx-bk .act.p{background:linear-gradient(135deg,#4D96FF,#B06AFF);color:#fff;border:0}#ifx-bk .act.d{color:#FF6B6B;border-color:#FF6B6B55}#ifx-bk .act small{display:block;font-weight:500;font-size:.68rem;opacity:.8;margin-top:2px}' +
    '#ifx-bk .warn{background:rgba(255,193,7,.12);border:1px solid rgba(255,193,7,.4);border-radius:12px;padding:9px 11px;font-size:.72rem;line-height:1.5;margin-bottom:6px}' +
    '#ifx-bk .x{float:right;background:none;border:0;color:inherit;font-size:1.3rem;cursor:pointer}' +
    '#ifx-sa-banner{position:fixed;left:10px;right:10px;bottom:76px;z-index:9000;background:var(--card,#151528);color:var(--text,#fff);border:1px solid #ffc10788;border-radius:14px;padding:10px 12px;font-size:.76rem;display:none;gap:10px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.4)}#ifx-sa-banner button{border:0;border-radius:10px;padding:8px 12px;font-weight:800;background:#ffc107;color:#222;cursor:pointer;white-space:nowrap}#ifx-sa-banner i{font-style:normal;flex:1}';
  D.head.appendChild(css);

  // ---- no login, ever ----------------------------------------------------------------
  W.logout = function () { say('This is the on-device edition — there is no login. Use Backup & Restore to move your data.'); };

  // ---- Backup & Restore panel --------------------------------------------------------
  var modal;
  function dateTxt(iso) { if (!iso) return 'never'; var d = new Date(iso); return isNaN(d) ? 'never' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  async function paint() {
    var c = await L.counts(), n = function (k) { return c[k] || 0; };
    var big = [['Bills', n('bill_expenses')], ['Squad expenses', n('expenses')], ['Trackers', n('et_trackers')], ['Entries', n('et_entries') + n('bill_payee_entries')], ['Cards', n('bill_cards')], ['Plans', n('bill_plans')], ['Budget lines', n('bp_items') + n('bp_income') + n('bp_goals')], ['People', n('bill_payees') + Math.max(0, n('members_config') - 0)], ['Settlements', n('settlements') + n('bill_settlements')]];
    D.getElementById('ifx-bk-box').innerHTML =
      '<button class="x" onclick="ifxBackup.close()" aria-label="Close">✕</button><h3>💾 Backup &amp; Restore</h3>' +
      '<div class="sub">Your data lives <b>only on this phone</b>. Make a backup file now and then, and keep it somewhere safe (Google Drive, email to yourself, a computer). If you lose or reset the phone, restoring that file brings everything back.</div>' +
      '<div class="stat">' + big.map(function (b) { return '<div><b>' + b[1] + '</b>' + esc(b[0]) + '</div>'; }).join('') + '</div>' +
      '<div class="sub">Last backup: <b>' + esc(dateTxt(L.lastBackup())) + '</b></div>' +
      '<button class="act p" onclick="ifxBackup.exportNow()">⬇ Create backup file<small>Saves ALL your data (every module, theme, background) as one .json file</small></button>' +
      '<button class="act" onclick="document.getElementById(\'ifx-bk-file\').click()">⬆ Restore from a backup file<small>Replaces everything on this phone with the file’s content</small></button>' +
      '<input type="file" id="ifx-bk-file" accept=".json,application/json" style="display:none" onchange="ifxBackup.pick(this)">' +
      '<button class="act" onclick="ifxBackup.close();ifxGDrive&&ifxGDrive.open()">☁️ Google Drive backup<small>Back up to (and restore from) a hidden folder in YOUR Google Drive</small></button>' +
      '<button class="act d" onclick="ifxBackup.erase()">🗑 Erase everything on this phone<small>Starts the app empty. Make a backup first!</small></button>';
  }
  var B = W.ifxBackup = {
    open: async function () { if (!modal) { modal = D.createElement('div'); modal.id = 'ifx-bk'; modal.innerHTML = '<div class="box" id="ifx-bk-box"></div>'; modal.addEventListener('click', function (e) { if (e.target === modal) B.close(); }); D.body.appendChild(modal); } await paint(); modal.classList.add('open'); },
    close: function () { if (modal) modal.classList.remove('open'); },
    exportNow: async function () {
      try {
        var o = await L.exportAll(), d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
        var name = 'iFiNeX-backup-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.json';
        await W.ifxXfer.saveBlob(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' }), name);
        localStorage.setItem('ifx_sa_lastbackup', new Date().toISOString()); say('Backup created ✓ — keep the file safe'); paint(); banner();
      } catch (e) { say('❌ Could not create backup: ' + (e && e.message || e)); }
    },
    pick: async function (inp) {
      var f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
      var o; try { o = JSON.parse(await f.text()); } catch (e) { return say('❌ That file is not a valid backup (cannot be read).'); }
      var err = L.validate(o); if (err) return say('❌ ' + err);
      var cnt = Object.keys(o.tables).reduce(function (t, k) { return t + o.tables[k].length; }, 0);
      if (!confirm('Restore this backup?\n\nFile: ' + f.name + '\nMade: ' + dateTxt(o.exported_at) + '\nRecords: ' + cnt + '\n\nEverything currently on this phone will be REPLACED.')) return;
      try { await L.importAll(o); say('Restored ✓ — reloading…'); setTimeout(function () { location.reload(); }, 900); }
      catch (e) { say('❌ Restore failed: ' + (e && e.message || e)); }
    },
    erase: async function () {
      if (!confirm('Erase ALL data on this phone?\n\nThis cannot be undone. Create a backup first if you may need it.')) return;
      if ((prompt('Type ERASE to confirm') || '').trim().toUpperCase() !== 'ERASE') return say('Cancelled — nothing was erased');
      await L.wipe(); say('Everything erased — reloading…'); setTimeout(function () { location.reload(); }, 900);
    }
  };

  // ---- drawer entries -----------------------------------------------------------------
  function drawer() {
    var dr = D.getElementById('drawer'); if (!dr || W.ifxSettings || dr.querySelector('.ifx-bk-item')) { if (dr) { var ad0 = D.getElementById('btn-admin-panel'); if (ad0) ad0.textContent = '👥 People & data'; } return; }
    var secs = [].slice.call(dr.querySelectorAll('.drawer-sec')), s = secs.filter(function (x) { return /settings/i.test(x.textContent); })[0];
    var b = '<button class="drawer-item ifx-bk-item" onclick="closeDrawer();ifxBackup.open()">💾 Backup &amp; Restore</button>';
    if (s) s.insertAdjacentHTML('afterend', b); else dr.insertAdjacentHTML('beforeend', b);
    var ad = D.getElementById('btn-admin-panel');
    if (ad) { ad.textContent = '👥 People & data'; }
    var ft = [].slice.call(dr.querySelectorAll('div')).filter(function (x) { return /iFiNeX web/.test(x.textContent) && !x.children.length; })[0];
    if (ft) ft.textContent = ft.textContent + ' · standalone';
  }

  // ---- reminder banner ----------------------------------------------------------------
  function banner() {
    var el = D.getElementById('ifx-sa-banner'); if (!el) { el = D.createElement('div'); el.id = 'ifx-sa-banner'; el.innerHTML = '<i>💾 Your data is only on this phone — make a backup.</i><button onclick="ifxBackup.open()">Backup</button><button style="background:transparent;color:inherit;padding:8px" onclick="this.parentNode.style.display=\'none\';localStorage.setItem(\'ifx_sa_snooze\',Date.now())">✕</button>'; D.body.appendChild(el); }
    L.counts().then(function (c) {
      var recs = (c.bill_expenses || 0) + (c.expenses || 0) + (c.et_entries || 0) + (c.bill_payee_entries || 0) + (c.bp_items || 0);
      var last = L.lastBackup(), age = last ? (Date.now() - new Date(last)) / 864e5 : 999, snooze = +(localStorage.getItem('ifx_sa_snooze') || 0);
      el.style.display = (recs >= 5 && age > 14 && Date.now() - snooze > 864e5) ? 'flex' : 'none';
    });
  }

  // ---- first run: your name -----------------------------------------------------------
  async function firstRun() {
    if (localStorage.getItem('ifx_sa_setup')) return;
    var v = await W.ifxAsk('👋 Welcome to iFiNeX', [
      { k: 'name', label: 'What should the app call you?', val: '', ph: 'Your name', req: true },
      { k: 'emoji', label: 'Pick an emoji', type: 'select', options: ['😀', '😎', '🦁', '🐯', '🌟', '🚀', '👨', '👩', '🧑'], val: '😀' }
    ], { sub: 'Everything stays on this phone. No account, no login. You can make a backup file any time from the menu (☰ → Backup & Restore).' });
    if (!v) { localStorage.setItem('ifx_sa_setup', '1'); return; }
    var c = W.supabase.createClient();
    await c.from('app_users').update({ name: v.name.trim(), emoji: v.emoji }).eq('email', L.email);
    await c.from('members_config').update({ name: v.name.trim(), emoji: v.emoji }).eq('email', L.email);
    localStorage.setItem('ifx_sa_setup', '1'); localStorage.removeItem('ifx_prof_' + L.email); localStorage.removeItem('ifx_sqcache_' + L.email);
    location.reload();
  }

  function whenApp(fn) { var t = setInterval(function () { var a = D.getElementById('screen-app'); if (a && a.classList.contains('active')) { clearInterval(t); fn(); } }, 250); setTimeout(function () { clearInterval(t); }, 30000); }
  function boot() {
    if (!W.ifxAsk || !W.ifxXfer) return setTimeout(boot, 80);
    drawer(); whenApp(function () { drawer(); banner(); firstRun(); try { if (!isSQ && typeof switchOweSubTab === 'function') switchOweSubTab('others'); } catch (e) {} });
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else boot();
})();
