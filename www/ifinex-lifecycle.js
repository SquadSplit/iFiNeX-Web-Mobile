/* ============================================================================
   iFiNeX v9.8 — LIFECYCLE: ⋯ actions (Edit · Delete · Mark as completed · Reopen · Export), Completed area and date / category filters
   for the Expense Tracker, EPP & Gold plans and the Budget & Salary Planner. Loaded by bill-tracker.html (defer, after ifinex-budget.js).
   Rows live in: et_trackers, bill_plans, bp_items, bp_income, bp_goals  — columns status ('active'|'completed'), completed_at, auto_complete.
   "Completed" = status 'completed' (you tapped it, or the nightly job ifx_auto_complete() did it)  OR  it has finished by itself right now:
        tracker / budget month  → its end date (or month) is over            plan → every instalment is paid
        goal → saved ≥ target                                                income → pay date / month is over
   Reopen sets auto_complete=false so a reopened item stays Active. All user text is escaped; no inline JS is built from user data.
   ============================================================================ */
(function () {
  'use strict';
  var W = window, D = document;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var today = function () { return W.localDateStr ? W.localDateStr(new Date()) : (function (d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); })(new Date()); };
  var curMonth = function () { return today().slice(0, 7); };
  var toast = function (m) { try { (W.toast || W.showToast)(m); } catch (e) { alert(m); } };
  var KIND = { et: 'et_trackers', plan: 'bill_plans', item: 'bp_items', income: 'bp_income', goal: 'bp_goals' };
  var NAME = { et: 'tracker', plan: 'plan', item: 'budget line', income: 'income', goal: 'goal' };
  var H = {}, CB = {}, F = {};
  // the page's data lives in top-level `let` variables (not window properties) — read them by bare name through these getters
  var gET = function () { try { return etTrackers; } catch (e) { return []; } }, gEN = function () { try { return etEntries; } catch (e) { return []; } },
      gTAB = function () { try { return etTab; } catch (e) { return 'period'; } }, gPL = function () { try { return myPlans; } catch (e) { return []; } },
      gPP = function () { try { return myPlanPays; } catch (e) { return []; } }, gOPEN = function () { try { return etOpen; } catch (e) { return null; } },
      sOPEN = function (v) { try { etOpen = v; } catch (e) { } }, gSB = function () { return sb; };
  function monthLabel(m) { var p = String(m).split('-').map(Number); return new Date(p[0], p[1] - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }); }
  function shiftMonth(m, d) { var p = m.split('-').map(Number), x = new Date(p[0], p[1] - 1 + d, 1); return x.getFullYear() + '-' + p2(x.getMonth() + 1); }
  function state(key) { return F[key] || (F[key] = { view: 'active', mode: key === 'bp' ? 'month' : 'all', month: curMonth(), from: '', to: '', cat: 'all' }); }

  /* ---------- effective status ---------- */
  function eff(kind, r) {
    if (!r) return 'active';
    if (r.status === 'completed') return 'completed';
    if (r.auto_complete === false) return 'active';
    switch (kind) {
      case 'et': return r.end_date && r.end_date < today() ? 'completed' : 'active';
      case 'plan': { var s = W.planStats ? W.planStats(r) : null; return s && s.ps.length && s.left === 0 ? 'completed' : 'active'; }
      case 'item': return r.month && r.month < curMonth() ? 'completed' : 'active';
      case 'income': return (r.month && r.month < curMonth()) || (r.pay_date && r.pay_date <= today()) ? 'completed' : 'active';
      case 'goal': return Number(r.target) > 0 && Number(r.saved) >= Number(r.target) ? 'completed' : 'active';
    }
    return 'active';
  }
  var isAuto = function (kind, r) { return r.status !== 'completed' && eff(kind, r) === 'completed'; };
  function badge(kind, r) {
    if (eff(kind, r) !== 'completed') return '';
    var auto = isAuto(kind, r), why = auto ? (kind === 'et' ? 'ended ' + r.end_date : kind === 'plan' ? 'all instalments paid' : kind === 'goal' ? 'target reached' : 'period over') : (r.completed_at ? String(r.completed_at).slice(0, 10) : '');
    return '<span class="lc-badge' + (auto ? ' auto' : '') + '">✅ Completed' + (why ? ' · ' + esc(why) : '') + (auto ? ' (automatic)' : '') + '</span>';
  }
  async function setStatus(kind, id, done) {
    var p = done ? { status: 'completed', completed_at: new Date().toISOString() } : { status: 'active', completed_at: null, auto_complete: false };
    var r = await gSB().from(KIND[kind]).update(p).eq('id', id);
    return r && r.error ? r.error : null;
  }
  async function toggle(kind, id) {
    var h = H[kind], row = h && h.get(id); if (!row) return;
    var done = eff(kind, row) !== 'completed';
    if (done && kind === 'plan') {
      var s = W.planStats(row);
      if (s.left > 0 && !confirm('This plan still has ' + s.left + ' unpaid payment(s) (' + s.remain.toFixed(2) + ' to pay).\nMark it completed anyway? You can reopen it later.')) return;
    }
    if (done && kind === 'et' && row.end_date >= today() && !confirm('This tracker has not reached its end date (' + row.end_date + ').\nMark it completed now? You can reopen it later.')) return;
    var before = { status: row.status, completed_at: row.completed_at, auto_complete: row.auto_complete };
    row.status = done ? 'completed' : 'active'; row.completed_at = done ? new Date().toISOString() : null; if (!done) row.auto_complete = false;
    h.after && h.after(); toast(done ? '✅ Moved to Completed' : '↩️ Back in Active');           // instant; saved in the background
    var err = await setStatus(kind, id, done);
    if (err) { Object.assign(row, before); h.after && h.after(); toast('❌ ' + err.message + (/status|column/i.test(err.message) ? ' — run the v9.8 database upgrade first' : '')); }
  }

  /* ---------- scope filters ---------- */
  function overlap(f, a, b) {                                   // does the date interval [a,b] touch the chosen months / range?
    if (f.mode === 'all') return true; a = a || b || ''; b = b || a || '';
    if (!a && !b) return true;
    if (f.mode === 'month') return a <= f.month + '-31' && b >= f.month + '-01';
    return (!f.to || a <= f.to) && (!f.from || b >= f.from);
  }
  var viewOk = function (f, kind, r) { return f.view === 'all' || eff(kind, r) === f.view; };

  /* ---------- filter bar (status tabs + dates + category) ---------- */
  function bar(key, o) {
    o = o || {}; var f = state(key), c = o.counts || {};
    var h = '<div class="lc-bar" data-lc-key="' + esc(key) + '"><div class="ptabs lc-tabs">' +
      [['active', '🟢 Active', c.active], ['completed', '✅ Completed', c.completed], ['all', '📋 All', c.all]].map(function (t) { return '<button class="ptab ' + (f.view === t[0] ? 'on' : '') + '" data-lc="view" data-v="' + t[0] + '">' + t[1] + (t[2] != null ? ' · ' + esc(t[2]) : '') + '</button>'; }).join('') + '</div>' +
      '<div class="lc-row"><select data-lc="mode" aria-label="Date filter"><option value="all"' + (f.mode === 'all' ? ' selected' : '') + '>📅 All dates</option><option value="month"' + (f.mode === 'month' ? ' selected' : '') + '>🗓️ ' + (o.noMonth ? 'Month (use ‹ ›)' : 'By month') + '</option><option value="range"' + (f.mode === 'range' ? ' selected' : '') + '>↔️ Custom dates</option></select>';
    if (f.mode === 'month' && !o.noMonth) h += '<button class="btn-tiny" data-lc="mprev" aria-label="Previous month">‹</button><b class="lc-m">' + esc(monthLabel(f.month)) + '</b><button class="btn-tiny" data-lc="mnext" aria-label="Next month">›</button>';
    if (f.mode === 'range') h += '<input type="date" data-lc="from" value="' + esc(f.from) + '" aria-label="From"><span>→</span><input type="date" data-lc="to" value="' + esc(f.to) + '" aria-label="To">';
    if (o.cats && o.cats.length) h += '<select data-lc="cat" aria-label="Category"><option value="all">🏷️ All ' + esc(o.catLabel || 'categories') + '</option>' + o.cats.map(function (x) { return '<option value="' + esc(x) + '"' + (f.cat === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>';
    if (f.mode !== (key === 'bp' ? 'month' : 'all') || f.cat !== 'all' || f.view !== 'active') h += '<button class="btn-tiny ghost" data-lc="clear">✕ Reset filters</button>';
    return h + '</div></div>';
  }
  D.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.lc-bar [data-lc]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
    var key = b.closest('.lc-bar').getAttribute('data-lc-key'), f = state(key), a = b.getAttribute('data-lc');
    if (a === 'view') f.view = b.getAttribute('data-v'); else if (a === 'mprev') f.month = shiftMonth(f.month, -1); else if (a === 'mnext') f.month = shiftMonth(f.month, 1);
    else if (a === 'clear') { F[key] = null; state(key); } else return;
    CB[key] && CB[key]();
  });
  D.addEventListener('change', function (e) {
    var b = e.target.closest && e.target.closest('.lc-bar [data-lc]'); if (!b) return;
    var key = b.closest('.lc-bar').getAttribute('data-lc-key'), f = state(key), a = b.getAttribute('data-lc');
    if (a === 'mode') { f.mode = b.value; if (f.mode === 'month' && !f.month) f.month = curMonth(); } else if (a === 'cat') f.cat = b.value; else if (a === 'from') f.from = b.value; else if (a === 'to') f.to = b.value; else return;
    CB[key] && CB[key]();
  });

  /* ---------- ⋯ menu ---------- */
  var openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
  function menu(btn, kind, id) {
    closeMenu(); var h = H[kind], row = h && h.get(id); if (!row) return;
    var done = eff(kind, row) === 'completed', items = (h.extra ? h.extra(id, row) : []).concat([
      ['✏️ Edit', function () { h.edit(id); }], [done ? '↩️ Reopen — move back to Active' : '✅ Mark as completed', function () { toggle(kind, id); }], ['🗑️ Delete', function () { h.del(id); }, true]]);
    var m = D.createElement('div'); m.className = 'lc-menu'; m.setAttribute('role', 'menu');
    items.forEach(function (it) { var x = D.createElement('button'); x.type = 'button'; x.textContent = it[0]; if (it[2]) x.className = 'danger'; x.onclick = function (ev) { ev.stopPropagation(); closeMenu(); it[1](); }; m.appendChild(x); });
    D.body.appendChild(m); openMenu = m;
    var r = btn.getBoundingClientRect(), w = m.offsetWidth, hh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px'; m.style.top = (r.bottom + hh + 12 > innerHeight ? Math.max(8, r.top - hh - 4) : r.bottom + 4) + 'px';
  }
  D.addEventListener('click', function (e) { if (openMenu && !e.target.closest('.lc-menu') && !e.target.closest('.lc-dots')) closeMenu(); });
  D.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  W.addEventListener('scroll', closeMenu, true);
  var dots = function (kind, id) { return '<button type="button" class="lc-dots" aria-label="Actions" aria-haspopup="menu" onclick="event.stopPropagation();ifxLC.menu(this,\'' + kind + '\',' + Number(id) + ')">⋯</button>'; };

  /* ---------- Expense Tracker ---------- */
  var etById = function (id) { return gET().find(function (t) { return String(t.id) === String(id); }); };
  H.et = {
    get: etById, edit: function (id) { W.etEditTracker(id); }, del: function (id) { W.deleteEt(id); }, after: function () { W.renderEt(); },
    extra: function (id) { var go = function (f) { return function () { var prev = gOPEN(); sOPEN(Number(id)); Promise.resolve(W.exportEt(f)).finally(function () { sOPEN(prev); }); }; }; return [['📊 Export Excel', go('xlsx')], ['📄 Export PDF', go('pdf')]]; }
  };
  CB.et = function () { W.renderEt(); };
  function etScope(t, f) { return overlap(f, t.start_date, t.end_date); }
  function etHasCat(t, cat) { return cat === 'all' || gEN().some(function (e) { return e.tracker_id === t.id && e.category === cat; }); }
  function decorateEtList(r) {
    var f = state('et'), all = gET().filter(function (t) { return t.kind === gTAB(); });
    var base = all.filter(function (t) { return etScope(t, f) && etHasCat(t, f.cat); });
    var counts = { active: base.filter(function (t) { return eff('et', t) === 'active'; }).length, completed: base.filter(function (t) { return eff('et', t) === 'completed'; }).length, all: base.length };
    var show = {}; base.forEach(function (t) { if (viewOk(f, 'et', t)) show[t.id] = t; });
    r.querySelectorAll('.et-card[data-ifx-k^="t"]').forEach(function (el) {
      var t = show[el.getAttribute('data-ifx-k').slice(1)]; if (!t) { el.remove(); return; }
      var top = el.firstElementChild; if (top) { top.style.alignItems = 'center'; top.insertAdjacentHTML('beforeend', dots('et', t.id)); }
      var b = badge('et', t); if (b) el.insertAdjacentHTML('beforeend', '<div>' + b + '</div>');
    });
    var cats = []; gEN().forEach(function (e) { if (all.some(function (t) { return t.id === e.tracker_id; }) && cats.indexOf(e.category) < 0) cats.push(e.category); }); cats.sort();
    var add = r.querySelector('.btn-add'), row = add && add.parentNode, html = bar('et', { counts: counts, cats: cats, catLabel: 'categories' });
    if (row) row.insertAdjacentHTML('afterend', html); else r.insertAdjacentHTML('afterbegin', html);
    if (!Object.keys(show).length) { var host = r.querySelector('.lc-bar'); host.insertAdjacentHTML('afterend', '<p style="text-align:center;color:var(--muted);">' + (f.view === 'completed' ? 'Nothing completed yet — finished trackers move here by themselves, or tap ⋯ → Mark as completed.' : f.view === 'active' ? 'No active trackers match. Check the Completed tab or change the filters.' : 'Nothing matches these filters.') + '</p>'); }
  }
  function decorateEtDetail(r, t) {
    var done = eff('et', t) === 'completed', ed = r.querySelector('button[onclick^="etEditTracker("]');
    if (ed) ed.insertAdjacentHTML('beforebegin', '<button class="btn-tiny" onclick="ifxLC.toggle(\'et\',' + Number(t.id) + ')">' + (done ? '↩️ Reopen' : '✅ Mark completed') + '</button>');
    var card = r.querySelector('.et-card'); if (card && done) card.insertAdjacentHTML('beforeend', '<div style="margin-top:6px;">' + badge('et', t) + '</div>');
    if (done) { var amt = r.querySelector('#ete-amt'), box = amt && amt.closest('.card'); if (box) box.outerHTML = '<div class="card"><p style="margin:0;font-size:.82rem;">✅ This tracker is completed. <button class="btn-tiny" onclick="ifxLC.toggle(\'et\',' + Number(t.id) + ')">↩️ Reopen to add expenses</button></p></div>'; }
  }

  /* ---------- EPP & Gold plans ---------- */
  var planById = function (id) { return gPL().find(function (p) { return String(p.id) === String(id); }); };
  H.plan = { get: planById, edit: function (id) { W.openPlanModal(Number(id)); }, del: function (id) { W.deletePlan(Number(id)); }, after: function () { W.renderPlans(); } };
  CB.plan = function () { W.renderPlans(); };
  function planScope(p, f) {
    if (f.mode === 'all') return true;
    var pays = gPP().filter(function (x) { return x.plan_id === p.id; });
    if (pays.length) return pays.some(function (x) { return overlap(f, x.due_date, x.due_date); });
    return overlap(f, p.start_date, p.end_date);
  }
  function planPass(p) { var f = state('plan'); return planScope(p, f) && viewOk(f, 'plan', p); }
  function planBar() {
    var host = D.getElementById('plan-lc'); if (!host) return; var f = state('plan');
    var base = gPL().filter(function (p) { return planScope(p, f); });
    host.innerHTML = bar('plan', { counts: { active: base.filter(function (p) { return eff('plan', p) === 'active'; }).length, completed: base.filter(function (p) { return eff('plan', p) === 'completed'; }).length, all: base.length } });
  }
  var _pch = W.planCardHtml;
  if (typeof _pch === 'function') W.planCardHtml = function (p) {
    var html = _pch(p), t = D.createElement('div'); t.innerHTML = html;
    var head = t.querySelector('.plan-head'); if (head) { head.insertAdjacentHTML('beforeend', dots('plan', p.id)); var b = badge('plan', p); if (b) head.insertAdjacentHTML('afterend', '<div style="padding:0 12px 6px;">' + b + '</div>'); }
    return t.innerHTML;
  };

  /* ---------- wrap the Expense Tracker renderers ---------- */
  function wrapEt() {
    var l = W.etList, d = W.etDetail;
    if (typeof l === 'function' && !l._lc) { W.etList = function (r) { l(r); try { decorateEtList(r); } catch (e) { console.warn('lifecycle list', e); } }; W.etList._lc = 1; }
    if (typeof d === 'function' && !d._lc) { W.etDetail = function (r, t) { d(r, t); try { decorateEtDetail(r, t); } catch (e) { console.warn('lifecycle detail', e); } }; W.etDetail._lc = 1; }
  }

  /* ---------- styles ---------- */
  var st = D.createElement('style'); st.textContent = '.lc-bar{margin:6px 0 12px}.lc-tabs{margin-bottom:0}.lc-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}' +
    '.lc-row select,.lc-row input{padding:8px;border-radius:10px;border:1px solid var(--border,rgba(255,255,255,.18));background:var(--card2,rgba(255,255,255,.06));color:inherit;font-size:.78rem;max-width:100%}' +
    '.lc-m{font-size:.8rem;min-width:110px;text-align:center}.lc-dots{border:0;background:transparent;color:inherit;font-size:1.3rem;line-height:1;padding:2px 9px;border-radius:8px;cursor:pointer;margin-left:4px}.lc-dots:hover{background:rgba(255,255,255,.1)}' +
    '.lc-badge{display:inline-block;font-size:.64rem;font-weight:800;padding:2px 9px;border-radius:20px;background:rgba(107,203,119,.18);color:#6BCB77;margin-top:5px}.lc-badge.auto{background:rgba(77,150,255,.18);color:#4D96FF}' +
    '.lc-menu{position:fixed;z-index:9900;min-width:220px;background:var(--card,#151528);color:var(--text,#e8ecff);border:1px solid var(--border,rgba(255,255,255,.2));border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:6px}' +
    '.lc-menu button{display:block;width:100%;text-align:left;background:none;border:0;color:inherit;padding:11px 12px;border-radius:8px;font:inherit;font-size:.85rem;cursor:pointer}.lc-menu button:hover{background:rgba(255,255,255,.1)}.lc-menu .danger{color:#FF6B6B}';
  D.head.appendChild(st);

  W.ifxLC = {
    eff: eff, isAuto: isAuto, badge: badge, setStatus: setStatus, toggle: toggle, bar: bar, state: state, menu: menu, dots: dots, overlap: overlap, viewOk: viewOk,
    register: function (kind, h, onChange, key) { H[kind] = h; if (onChange) CB[key || kind] = onChange; }, onChange: function (key, fn) { CB[key] = fn; },
    planPass: planPass, planBar: planBar, today: today, curMonth: curMonth, monthLabel: monthLabel
  };
  wrapEt(); D.addEventListener('DOMContentLoaded', wrapEt); W.addEventListener('load', function () { wrapEt(); if (D.getElementById('plan-lc') && typeof W.renderPlans === 'function') try { W.renderPlans(); } catch (e) { } });
})();
