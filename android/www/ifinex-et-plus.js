/* ============================================================================
   iFiNeX Expense Tracker PLUS (v8.4) — loaded by bill-tracker.html after the main script.
   Adds, on top of the existing Expense Tracker:
     • your own tracker TYPES (Wedding, Hajj, Business…) next to Monthly / Events / Trips — create, rename, re-icon, delete
     • edit a tracker (title, type, dates, currency, notes, people)       • edit any entry
     • manage expense CATEGORIES: add, rename (entries follow), change icon, delete
   Types live in table et_kinds (see sql/migrations/…v8_4_et_custom_kinds.sql). If that table does not exist yet the rest still
   works and creating a type explains what to run.
   ============================================================================ */
(function () {
  'use strict';
  var W = window, D = document;
  var BASE = [{ key: 'period', label: 'Monthly', icon: '📆', name: 'period tracker' }, { key: 'occasion', label: 'Events', icon: '🎟️', name: 'event tracker' }, { key: 'trip', label: 'Trips', icon: '✈️', name: 'trip tracker' }];
  W.etKinds = []; W.etKindsOk = true;
  var NEED_SQL = 'Custom types need the v8.5 database upgrade (et_kinds). Run the UPGRADE sql from the setup guide, then try again.';
  var isMissing = function (e) { return e && (e.code === '42P01' || /et_kinds|relation|schema cache/i.test(e.message || '')); };
  var q = function (x) { return String(x == null ? '' : x); };

  function kinds() {
    var over = {}; W.etKinds.forEach(function (k) { over[k.key] = k; });
    var list = BASE.map(function (b) { var o = over[b.key]; return { key: b.key, label: o ? o.label : b.label, icon: o ? o.icon : b.icon, builtin: true, overridden: !!o, id: o && o.id, name: o ? o.label.toLowerCase() + ' tracker' : b.name }; });
    W.etKinds.forEach(function (k) { if (!BASE.some(function (b) { return b.key === k.key; })) list.push({ key: k.key, label: k.label, icon: k.icon, id: k.id, name: k.label.toLowerCase() + ' tracker' }); });
    (W.etTrackers || []).forEach(function (t) { if (!list.some(function (x) { return x.key === t.kind; })) list.push({ key: t.kind, label: t.kind, icon: '🏷️', orphan: true, name: t.kind + ' tracker' }); });
    return list;
  }
  function sync() { kinds().forEach(function (k) { ETK_ICON[k.key] = k.icon; ETK_NAME[k.key] = k.name; }); }
  W.etKindList = kinds;

  var _load = W.loadEt;
  W.loadEt = async function () {
    await _load.apply(this, arguments);
    try { var r = await sb.from('et_kinds').select('*').ilike('user_email', escLike(managing.email)); if (r.error) throw r.error; W.etKinds = r.data || []; W.etKindsOk = true; }
    catch (e) { W.etKinds = []; W.etKindsOk = !isMissing(e) ? W.etKindsOk : false; }
    sync();
  };
  async function refresh() { await W.loadEt(); renderEt(); }

  // ---------- tabs / labels (called from the list template) ----------
  W.etTabsHtml = function () {
    sync();
    return '<div class="ptabs scroll">' + kinds().map(function (k) { return '<button class="ptab ' + (etTab === k.key ? 'on' : '') + '" onclick="etTab=\'' + esc(k.key) + '\';renderEt()">' + esc(k.icon) + ' ' + esc(k.label) + '</button>'; }).join('') +
      '<button class="ptab" onclick="etKindNew()" aria-label="New tracker type">＋ Type</button><button class="ptab" onclick="etManage()" aria-label="Manage types and categories">⚙️ Manage</button></div>';
  };
  W.etNewLabel = function () { sync(); return ETK_NAME[etTab] || 'tracker'; };

  var slug = function (s) { return q(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'type'; };

  // ---------- tracker TYPES ----------
  W.etKindNew = async function () {
    var v = await ifxAsk('New tracker type', [{ k: 'label', label: 'Name (e.g. Wedding, Hajj, Business)', req: true, ph: 'Wedding' }, { k: 'icon', label: 'Emoji', val: '🏷️', ph: '🎉' }], { ok: 'Create', validate: function (v) { return v.label.length > 40 ? 'Name is too long (max 40)' : /[<>"'&]/.test(v.label) ? 'Please avoid < > " \' & in the name' : null; } });
    if (!v) return;
    var key = slug(v.label), have = kinds().map(function (k) { return k.key; }), n = 2, base = key; while (have.indexOf(key) >= 0) key = base + '-' + (n++);
    var r = await sb.from('et_kinds').insert({ user_email: managing.email, key: key, label: v.label, icon: (v.icon || '🏷️').slice(0, 8), created_by_email: me.email });
    if (r.error) return toast(isMissing(r.error) ? NEED_SQL : '❌ ' + r.error.message);
    etTab = key; await refresh(); toast('Type created ✓');
  };
  W.etKindEdit = async function (key) {
    var k = kinds().find(function (x) { return x.key === key; }); if (!k) return;
    var v = await ifxAsk('Edit tracker type', [{ k: 'label', label: 'Name', val: k.label, req: true }, { k: 'icon', label: 'Emoji', val: k.icon }], { validate: function (v) { return /[<>"'&]/.test(v.label) ? 'Please avoid < > " \' & in the name' : v.label.length > 40 ? 'Name is too long (max 40)' : null; } });
    if (!v) return;
    var row = { label: v.label, icon: (v.icon || '🏷️').slice(0, 8) }, r;
    if (k.id) r = await sb.from('et_kinds').update(row).eq('id', k.id);
    else r = await sb.from('et_kinds').insert(Object.assign({ user_email: managing.email, key: k.key, created_by_email: me.email }, row));
    if (r.error) return toast(isMissing(r.error) ? NEED_SQL : '❌ ' + r.error.message);
    await refresh(); toast('Saved ✓'); etManage();
  };
  W.etKindDelete = async function (key) {
    var k = kinds().find(function (x) { return x.key === key; }); if (!k) return;
    if (k.builtin) {   // built-ins can only be reset to their original name
      if (!k.id) return toast('Built-in type — nothing to reset'); if (!confirm('Reset "' + k.label + '" to its original name?')) return;
      var r0 = await sb.from('et_kinds').delete().eq('id', k.id); if (r0.error) return toast('❌ ' + r0.error.message); await refresh(); return etManage();
    }
    var used = etTrackers.filter(function (t) { return t.kind === key && q(t.user_email).toLowerCase() === q(managing.email).toLowerCase(); });
    var target = 'period';
    if (used.length) {
      var v = await ifxAsk('Delete “' + k.label + '”', [{ k: 'to', label: used.length + ' tracker(s) use this type. Move them to:', type: 'select', val: 'period', options: kinds().filter(function (x) { return x.key !== key; }).map(function (x) { return [x.key, x.icon + ' ' + x.label]; }) }], { ok: 'Move & delete', danger: true });
      if (!v) return; target = v.to;
      var m = await sb.from('et_trackers').update({ kind: target }).eq('kind', key).ilike('user_email', escLike(managing.email)); if (m.error) return toast('❌ ' + m.error.message);
    } else if (!confirm('Delete type “' + k.label + '”?')) return;
    var r = await sb.from('et_kinds').delete().eq('id', k.id); if (r.error) return toast('❌ ' + r.error.message);
    if (etTab === key) etTab = target; await refresh(); toast('Deleted'); etManage();
  };

  // ---------- CATEGORIES ----------
  W.etCatNew = async function () {
    var v = await ifxAsk('New expense category', [{ k: 'name', label: 'Name', req: true, ph: 'Pets' }, { k: 'icon', label: 'Emoji', val: '🏷️' }], { ok: 'Add' });
    if (!v) return; var r = await sb.from('et_categories').insert({ user_email: managing.email, name: v.name.slice(0, 60), icon: (v.icon || '🏷️').slice(0, 8) });
    if (r.error) return toast(r.error.code === '23505' ? 'That category already exists' : '❌ ' + r.error.message);
    await refresh(); etManage();
  };
  W.etCatEdit = async function (id) {
    var c = etCats.find(function (x) { return String(x.id) === String(id); }); if (!c) return;
    var v = await ifxAsk('Edit category', [{ k: 'name', label: 'Name', val: c.name, req: true }, { k: 'icon', label: 'Emoji', val: c.icon }], { sub: 'Renaming also updates every entry that uses it.' });
    if (!v) return; var nn = v.name.slice(0, 60), oldName = c.name;
    if (nn.toLowerCase() !== oldName.toLowerCase() && etAllCats().some(function (x) { return x[0].toLowerCase() === nn.toLowerCase(); })) return toast('That name is already used');
    var r = await sb.from('et_categories').update({ name: nn, icon: (v.icon || '🏷️').slice(0, 8) }).eq('id', c.id); if (r.error) return toast('❌ ' + r.error.message);
    if (nn !== oldName) { var m = await sb.from('et_entries').update({ category: nn }).eq('category', oldName).ilike('user_email', escLike(managing.email)); if (m.error) toast('Renamed, but some entries could not be updated: ' + m.error.message); }
    await refresh(); toast('Saved ✓'); etManage();
  };
  W.etCatDelete = async function (id) {
    var c = etCats.find(function (x) { return String(x.id) === String(id); }); if (!c) return;
    var n = etEntries.filter(function (e) { return e.category === c.name; }).length;
    if (!confirm('Delete category “' + c.name + '”?' + (n ? '\n' + n + ' existing entr' + (n === 1 ? 'y keeps' : 'ies keep') + ' the name (shown with a generic icon).' : ''))) return;
    var r = await sb.from('et_categories').delete().eq('id', c.id); if (r.error) return toast('❌ ' + r.error.message);
    await refresh(); toast('Deleted'); etManage();
  };

  // ---------- manager sheet ----------
  W.etManage = function () {
    sync();
    var ov = D.getElementById('etm') || D.createElement('div'); ov.id = 'etm';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9700;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;';
    var row = function (icon, label, sub, act) { return '<div class="et-row"><span>' + esc(icon) + '</span><span style="flex:1;min-width:0;"><b>' + esc(label) + '</b>' + (sub ? '<small style="color:var(--muted)"> · ' + esc(sub) + '</small>' : '') + '</span>' + act + '</div>'; };
    var h = '<div style="width:min(560px,100%);background:var(--card,#151528);color:var(--text);border:1px solid var(--border);border-radius:22px 22px 0 0;padding:16px 16px calc(20px + env(safe-area-inset-bottom,0px));max-height:90vh;overflow:auto;box-sizing:border-box;"><div style="display:flex;justify-content:space-between;align-items:center;"><h3 style="margin:0;">⚙️ Types &amp; categories</h3><button class="btn-tiny" data-m="close">Done</button></div>' +
      '<div class="section-title" style="font-size:.95rem;margin-top:12px;">Tracker types</div>' +
      kinds().map(function (k) { return row(k.icon, k.label, k.builtin ? (k.overridden ? 'built-in · renamed' : 'built-in') : (k.orphan ? 'shared with you' : ''), (k.orphan ? '' : '<button class="btn-tiny ghost" data-m="ke" data-k="' + esc(k.key) + '">✏️</button>') + ((k.builtin && !k.overridden) || k.orphan ? '' : '<button class="btn-tiny ghost" data-m="kd" data-k="' + esc(k.key) + '">' + (k.builtin ? '↺' : '🗑️') + '</button>')); }).join('') +
      '<button class="btn-add" style="margin-top:10px;" data-m="kn">＋ New tracker type</button>' +
      '<div class="section-title" style="font-size:.95rem;margin-top:16px;">Expense categories</div><div style="font-size:.7rem;color:var(--muted);margin-bottom:4px;">Built-in categories (Breakfast, Lunch, Groceries…) stay as they are; your own can be edited or deleted.</div>' +
      (etCats.filter(function (c) { return !ET_DEF.some(function (d) { return d[0] === c.name; }); }).map(function (c) { return row(c.icon, c.name, etEntries.filter(function (e) { return e.category === c.name; }).length + ' entries', '<button class="btn-tiny ghost" data-m="ce" data-k="' + esc(c.id) + '">✏️</button><button class="btn-tiny ghost" data-m="cd" data-k="' + esc(c.id) + '">🗑️</button>'); }).join('') || '<p style="color:var(--muted);font-size:.78rem;">No custom categories yet.</p>') +
      '<button class="btn-add" style="margin-top:10px;" data-m="cn">＋ New category</button></div>';
    ov.innerHTML = h; if (!ov.parentNode) D.body.appendChild(ov);
    ov.onclick = function (e) {
      if (e.target === ov) return ov.remove();
      var b = e.target.closest('[data-m]'); if (!b) return; var m = b.getAttribute('data-m'), k = b.getAttribute('data-k');
      if (m === 'close') ov.remove(); else if (m === 'kn') etKindNew().then(etManage); else if (m === 'ke') etKindEdit(k); else if (m === 'kd') etKindDelete(k); else if (m === 'cn') etCatNew(); else if (m === 'ce') etCatEdit(k); else if (m === 'cd') etCatDelete(k);
    };
  };

  // ---------- edit a TRACKER ----------
  W.etEditTracker = async function (id) {
    var t = etTrackers.find(function (x) { return x.id === id; }); if (!t) return;
    var mine = q(t.user_email).toLowerCase() === q(managing.email).toLowerCase(); if (!mine) return toast('Only the owner can edit this tracker');
    var es = etEntries.filter(function (e) { return e.tracker_id === t.id; }), dates = es.map(function (e) { return e.entry_date; }).sort();
    var people = appUsersDirectory.filter(function (u) { return u.email.toLowerCase() !== managing.email.toLowerCase(); }).map(function (u) { return [u.email.toLowerCase(), u.name + ' (' + u.email + ')']; });
    var v = await ifxAsk('Edit tracker', [
      { k: 'title', label: 'Title', val: t.title, req: true },
      { k: 'kind', label: 'Type', type: 'select', val: t.kind, options: kinds().map(function (k) { return [k.key, k.icon + ' ' + k.label]; }) },
      { k: 'currency', label: 'Currency', val: t.currency, req: true },
      { k: 'start', label: 'Start date', type: 'date', val: t.start_date, req: true }, { k: 'end', label: 'End date', type: 'date', val: t.end_date, req: true },
      { k: 'people', label: 'Spending with (not used for Monthly)', type: 'checks', val: t.participants || [], options: people },
      { k: 'notes', label: 'Notes', val: t.notes || '' }
    ], { sub: dates.length ? es.length + ' entries from ' + dates[0] + ' to ' + dates[dates.length - 1] : '', validate: function (v) {
      if (v.end < v.start) return 'End date must be on or after the start date';
      if (dates.length && (dates[0] < v.start || dates[dates.length - 1] > v.end)) return 'The period must include all entries (' + dates[0] + ' → ' + dates[dates.length - 1] + ')';
      if (/[<>"'&]/.test(v.currency) || v.currency.length > 12) return 'Currency looks invalid';
      return null; } });
    if (!v) return;
    var r = await sb.from('et_trackers').update({ title: v.title.slice(0, 120), kind: v.kind, currency: v.currency.toUpperCase(), start_date: v.start, end_date: v.end, participants: v.kind === 'period' ? [] : v.people, notes: v.notes.slice(0, 300) }).eq('id', t.id);
    if (r.error) return toast('❌ ' + r.error.message);
    if (v.kind !== etTab && etOpen == null) etTab = v.kind; await refresh(); toast('Saved ✓');
  };

  // ---------- edit an ENTRY ----------
  W.etEditEntry = async function (id) {
    var e = etEntries.find(function (x) { return x.id === id; }); if (!e) return; var t = etTrackers.find(function (x) { return x.id === e.tracker_id; }); if (!t) return;
    var cats = etAllCats().map(function (c) { return c[0]; }); if (cats.indexOf(e.category) < 0) cats.unshift(e.category);
    var people = [t.user_email].concat(t.participants || []);
    var f = [{ k: 'category', label: 'Category', type: 'select', val: e.category, options: cats.map(function (c) { return [c, etIcon(c) + ' ' + c]; }) },
      { k: 'amount', label: 'Amount (' + t.currency + ')', type: 'number', val: e.amount, req: true },
      { k: 'date', label: 'Date', type: 'date', val: e.entry_date, min: t.start_date, max: t.end_date, req: true },
      { k: 'note', label: 'Note', val: e.note || '' }];
    if (people.length > 1) f.push({ k: 'by', label: 'Spent by', type: 'select', val: e.spent_by || t.user_email, options: people.map(function (p) { return [p, etName(p)]; }) });
    var v = await ifxAsk('Edit entry', f, { validate: function (v) { var a = parseFloat(v.amount); if (!(a > 0)) return 'Enter an amount above 0'; if (v.date < t.start_date || v.date > t.end_date) return 'Date must be within ' + t.start_date + ' → ' + t.end_date; return null; } });
    if (!v) return;
    var r = await sb.from('et_entries').update({ category: v.category, amount: Math.round(parseFloat(v.amount) * 100) / 100, entry_date: v.date, note: v.note.slice(0, 200), spent_by: v.by || e.spent_by || t.user_email }).eq('id', e.id);
    if (r.error) return toast('❌ ' + r.error.message); await W.loadEt(); renderEt(); toast('Saved ✓');
  };
})();
