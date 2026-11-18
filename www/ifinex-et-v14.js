/* iFiNeX v14.0 — Expense trackers: per-tracker categories (🏷️) and CLONE (📑).
   * 🏷️ Categories  : every tracker keeps its OWN list (a Mess tracker offers Breakfast/Lunch/Dinner/Tiffin/Snacks only, Groceries offers Vegetables/Dairy/…).
                      Pick a ready-made set or type your own list (one per line, emoji first is optional). Existing entries are never changed.
   * 📑 Clone       : copies a tracker into a new period — asks for the NAME and the DURATION, can carry over the category list, the people and (optionally) the entries.
   Uses page globals declared in bill-tracker.html (etTrackers, etEntries, etCatsOf, etSetCats, ET_SETS, ET_SET_ORDER, managing, me, sb, loadEt, renderEt …). */
(function () {
  'use strict';
  var W = window, D = document;
  var q = function (x) { return String(x == null ? '' : x); };
  var toast = function (m) { try { (W.toast || W.showToast)(m); } catch (e) { alert(m); } };
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  var iso = function (d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  var parse = function (s) { return new Date(s + 'T00:00:00'); };
  var addDays = function (s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  var diffDays = function (a, b) { return Math.round((parse(b) - parse(a)) / 864e5); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var low = function (s) { return q(s).trim().toLowerCase(); };
  function tracker(id) { return etTrackers.find(function (x) { return String(x.id) === String(id); }); }
  function mine(t) { return low(t.user_email) === low(managing.email); }
  function missingCol(err) { return err && /categories|cat_set|schema cache|column/i.test(err.message || ''); }

  /* ---------- categories ---------- */
  function catsToText(list) { return list.map(function (c) { return (c[1] ? c[1] + ' ' : '') + c[0]; }).join('\n'); }
  function textToCats(txt) {
    var out = [], seen = {};
    q(txt).split(/\r?\n|;/).forEach(function (line) {
      line = line.trim(); if (!line) return;
      var icon = '', name = line, m = null;
      try { m = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s+(.+)$/u.exec(line); } catch (e) { m = null; }
      if (m) { icon = m[1]; name = m[2].trim(); }
      name = name.slice(0, 40); if (!name) return;
      var k = name.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push({ name: name, icon: icon || '🏷️' });
    });
    return out;
  }
  W.etCatsEdit = async function (id) {
    var t = tracker(id); if (!t) return;
    if (!mine(t)) return toast('Only the owner can change the categories');
    var cur = etCatsOf(t);
    var v = await ifxAsk('🏷️ Categories — ' + t.title, [
      { k: 'set', label: 'Start from a ready-made set', type: 'select', val: '', options: [['', '— no, use my list below —']].concat(ET_SET_ORDER.map(function (k) { return [k, ET_SETS[k].icon + ' ' + ET_SETS[k].name]; })) },
      { k: 'list', label: 'Categories offered when adding an expense', type: 'textarea', val: catsToText(cur), hint: 'One per line. Put an emoji first if you like, e.g.  🍳 Breakfast. A ready-made set above replaces this list.' }
    ], { sub: 'Entries you already added keep their category even if you remove it here.', validate: function (v) { if (!v.set && !textToCats(v.list).length) return 'Keep at least one category'; return null; } });
    if (!v) return;
    var cats = v.set ? etSetCats(v.set) : textToCats(v.list);
    var r = await sb.from('et_trackers').update({ categories: cats, cat_set: v.set || t.cat_set || null }).eq('id', t.id);
    if (r.error) return toast(missingCol(r.error) ? 'Run the v10.0 database upgrade first (SQL file 1)' : '❌ ' + r.error.message);
    await loadEt(); renderEt(); toast('Categories saved ✓');
  };

  /* ---------- clone ---------- */
  function isFullMonth(t) { var a = parse(t.start_date), b = parse(t.end_date); return a.getDate() === 1 && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && b.getDate() === new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate(); }
  function nextTitle(t, newStart) {
    var d = parse(newStart), re = new RegExp('(' + MONTHS.join('|') + ')\\s+(\\d{4})', 'i');
    if (re.test(t.title)) return t.title.replace(re, MONTHS[d.getMonth()] + ' ' + d.getFullYear());
    var m = /(\d{4})-(\d{2})/.exec(t.title); if (m) return t.title.replace(m[0], d.getFullYear() + '-' + p2(d.getMonth() + 1));
    return t.title + ' (copy)';
  }
  function endFor(start, dur, orig, endField) {
    var d = parse(start);
    if (dur === 'custom') return endField;
    if (dur === 'month') return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    if (dur === 'same') return addDays(start, diffDays(orig.start_date, orig.end_date));
    if (/^m\d+$/.test(dur)) return iso(new Date(d.getFullYear(), d.getMonth() + (+dur.slice(1)), d.getDate() - 1));
    return addDays(start, (+dur || 1) - 1);
  }
  W.etClone = async function (id) {
    var t = tracker(id); if (!t) return;
    if (!mine(t)) return toast('Only the owner can clone this tracker');
    var full = isFullMonth(t), ns, ne;
    if (full) { var d = parse(t.end_date); ns = iso(new Date(d.getFullYear(), d.getMonth() + 1, 1)); ne = iso(new Date(d.getFullYear(), d.getMonth() + 2, 0)); }
    else { ns = addDays(t.end_date, 1); ne = addDays(ns, diffDays(t.start_date, t.end_date)); }
    var n = etEntries.filter(function (e) { return e.tracker_id === t.id; }).length;
    var v = await ifxAsk('📑 Clone — ' + t.title, [
      { k: 'title', label: 'Name of the new tracker', val: nextTitle(t, ns), req: true },
      { k: 'start', label: 'Starts on', type: 'date', val: ns, req: true },
      { k: 'dur', label: 'Duration', type: 'select', val: full ? 'month' : 'same', options: [['month', 'Until the end of that calendar month'], ['m1', '1 month (to the day before the same date next month)'], ['m3', '3 months'], ['m6', '6 months'], ['m12', '1 year'], ['7', '1 week'], ['14', '2 weeks'], ['same', 'Same number of days as “' + t.title + '” (' + (diffDays(t.start_date, t.end_date) + 1) + ' days)'], ['custom', 'Use the end date below']] },
      { k: 'end', label: 'End date (only used when Duration = “Use the end date below”)', type: 'date', val: ne },
      { k: 'copy', label: 'What to copy', type: 'checks', val: ['cats', 'people', 'notes'], options: [['cats', 'Category list'], ['people', 'People (shared trackers)'], ['notes', 'Notes'], ['entries', 'Entries too (' + n + ' — dates moved into the new period)']] }
    ], { ok: 'Create clone', sub: 'Currency and type stay the same. Nothing in “' + t.title + '” is changed.', validate: function (v) {
      var e = endFor(v.start, v.dur, t, v.end); if (!e || e < v.start) return 'The end date must be on or after the start date'; return null; } });
    if (!v) return;
    var start = v.start, end = endFor(v.start, v.dur, t, v.end), want = function (k) { return v.copy.indexOf(k) >= 0; };
    var row = { user_email: t.user_email, kind: t.kind, title: v.title.slice(0, 120), currency: t.currency, start_date: start, end_date: end, participants: want('people') ? (t.participants || []) : [], notes: want('notes') ? (t.notes || '') : '', created_by_email: me.email };
    if (t.auto_complete != null) row.auto_complete = t.auto_complete;
    var extra = want('cats') ? { categories: Array.isArray(t.categories) ? t.categories : etCatsOf(t).map(function (c) { return { name: c[0], icon: c[1] }; }), cat_set: t.cat_set || null } : {};
    var r = await sb.from('et_trackers').insert(Object.assign({}, row, extra)).select().single();
    if (r.error && missingCol(r.error)) r = await sb.from('et_trackers').insert(row).select().single();
    if (r.error || !r.data) return toast('❌ ' + ((r.error && r.error.message) || 'Could not clone'));
    var made = r.data, copied = 0;
    if (want('entries') && n) {
      var off = diffDays(t.start_date, start), rows = etEntries.filter(function (e) { return e.tracker_id === t.id; }).map(function (e) {
        var d = addDays(e.entry_date, off); if (d < start) d = start; if (d > end) d = end;
        return { tracker_id: made.id, user_email: t.user_email, category: e.category, amount: e.amount, entry_date: d, note: e.note || '', spent_by: e.spent_by || t.user_email, created_by_email: me.email };
      });
      for (var i = 0; i < rows.length; i += 200) { var ins = await sb.from('et_entries').insert(rows.slice(i, i + 200)); if (ins.error) { toast('⚠️ Tracker created, but copying entries stopped: ' + ins.error.message); break; } copied += Math.min(200, rows.length - i); }
    }
    etTab = t.kind; await loadEt(); etOpen = made.id; renderEt(); try { window.scrollTo(0, 0); } catch (e) { }
    toast('Cloned ✓ — ' + v.title + (copied ? ' · ' + copied + ' entries copied' : ''));
  };
})();
