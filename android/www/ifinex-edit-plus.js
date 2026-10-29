/* iFiNeX v8.4 — edit/delete completeness + Import/Export strip on every page.
   Pure add-on: wraps existing render functions, never replaces their logic. */
(function () {
  'use strict';
  var W = window, D = document;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var toast = function (m) { try { (W.toast || W.showToast)(m); } catch (e) { alert(m); } };
  var isBT = !!D.getElementById('page-cards');           // bill-tracker.html
  var isSQ = !isBT && !!D.getElementById('page-balances'); // index.html (Squad Split)

  function later(fn) { setTimeout(function () { try { fn(); } catch (e) { console.error(e); } }, 0); }
  function wrap(name, after) {
    var o = W[name]; if (typeof o !== 'function' || o.__ifxw) return;
    var n = function () { var r = o.apply(this, arguments); try { after.apply(this, arguments); } catch (e) { console.error(name, e); } return r; };
    n.__ifxw = 1; W[name] = n;
    try { (0, eval)(name + ' = window.' + name); } catch (e) {}
  }
  function pen(onclick, title) { return '<button class="cedit" title="' + esc(title || 'Edit') + '" aria-label="' + esc(title || 'Edit') + '" onclick="event.stopPropagation();' + onclick + '">✏️</button>'; }

  // ── Bill Tracker ────────────────────────────────────────────────────────────
  function btInit() {
    var COLORS = (typeof CARD_COLORS !== 'undefined') ? CARD_COLORS : ['#4d96ff'];
    var NAMES = ['Blue', 'Red', 'Pink', 'Yellow', 'Green', 'Purple', 'Orange', 'Cyan'];
    var colorOpts = COLORS.map(function (c, i) { return [c, '● ' + (NAMES[i] || c)]; });

    W.editCard = async function (id) {
      var c = myCards.find(function (x) { return x.id === id; }); if (!c) return;
      var v = await ifxAsk('✏️ Edit card', [
        { k: 'name', label: 'Card name', val: c.card_name, req: true },
        { k: 'due', label: 'Due day of month (1–31, blank = no reminders)', type: 'number', val: c.due_day || '', min: 1, max: 31 },
        { k: 'color', label: 'Colour', type: 'select', options: colorOpts.some(function (o) { return o[0] === c.color; }) ? colorOpts : colorOpts.concat([[c.color, '● Custom']]), val: c.color }
      ], { validate: function (v) { var d = v.due === '' ? null : parseInt(v.due, 10); if (d !== null && !(d >= 1 && d <= 31)) return 'Due day must be 1–31'; return null; } });
      if (!v) return;
      var due = v.due === '' ? null : Math.max(1, Math.min(31, parseInt(v.due, 10)));
      var r = await sb.from('bill_cards').update({ card_name: v.name.trim(), due_day: due, color: v.color, reminder_enabled: !!due }).eq('id', id);
      if (r.error) return toast('❌ ' + r.error.message);
      toast('Card updated ✓'); await loadMyData();
    };
    W.editParty = async function (id) {
      var p = myPayees.find(function (x) { return x.id === id; }); if (!p) return;
      var v = await ifxAsk('✏️ Edit party', [
        { k: 'name', label: 'Name', val: p.party_name, req: true },
        { k: 'email', label: 'Email (optional — links to a registered person)', type: 'email', val: p.party_email || '' },
        { k: 'color', label: 'Colour', type: 'select', options: colorOpts.some(function (o) { return o[0] === p.color; }) ? colorOpts : colorOpts.concat([[p.color, '● Custom']]), val: p.color }
      ], { validate: function (v) { return v.email && !/^\S+@\S+\.\S+$/.test(v.email) ? 'That email looks wrong' : null; } });
      if (!v) return;
      var r = await sb.from('bill_payees').update({ party_name: v.name.trim(), party_email: v.email ? v.email.trim().toLowerCase() : null, color: v.color }).eq('id', id);
      if (r.error) return toast('❌ ' + r.error.message);
      toast('Party updated ✓'); await loadMyData();
    };
    W.editSettlementEntry = async function (id) {
      if (typeof canManageOwed === 'function' && !canManageOwed()) return toast('Only admin or an admin delegate can edit a payment record');
      var s = mySettlements.find(function (x) { return x.id === id; }); if (!s) return;
      var v = await ifxAsk('✏️ Edit payment to admin', [
        { k: 'amount', label: 'Amount (AED)', type: 'number', val: s.amount, req: true, min: 0.01 },
        { k: 'month', label: 'Month', type: 'month', val: s.month, req: true }
      ], { validate: function (v) { return !(parseFloat(v.amount) > 0) ? 'Amount must be above 0' : null; } });
      if (!v) return;
      var r = await sb.from('bill_settlements').update({ amount: parseFloat(v.amount), month: v.month }).eq('id', id);
      if (r.error) return toast('❌ ' + (/policy|permission|denied/i.test(r.error.message) ? 'Database needs the v8.5 upgrade SQL (settlement edit policy)' : r.error.message));
      toast('Payment updated ✓'); await loadMyData(); try { renderHome(); } catch (e) {}
    };

    wrap('renderCards', function () {
      D.querySelectorAll('#cards-grid .card-tile').forEach(function (t) {
        if (t.querySelector('.cedit')) return;
        var d = t.querySelector('.cdel'), m = d && /deleteCard\((\d+)\)/.exec(d.getAttribute('onclick') || ''); if (!m) return;
        t.insertAdjacentHTML('afterbegin', pen('editCard(' + m[1] + ')', 'Edit card'));
      });
    });
    wrap('renderPartyGrid', function () {
      D.querySelectorAll('#party-grid .card-tile').forEach(function (t) {
        if (t.querySelector('.cedit')) return;
        var d = t.querySelector('.cdel'), m = d && /deleteParty\((\d+)\)/.exec(d.getAttribute('onclick') || ''); if (!m) return;
        t.insertAdjacentHTML('afterbegin', pen('editParty(' + m[1] + ')', 'Edit party'));
      });
    });
    // payment history: add ✏️ before each 🗑️
    wrap('openHistoryBreakdown', function () {
      D.querySelectorAll('#brk-body .brk-actions').forEach(function (a) {
        if (a.querySelector('.ed2')) return;
        var b = a.querySelector('button'), oc = b ? b.getAttribute('onclick') || '' : '', m;
        var h = (m = /deleteSettlementEntry\((\d+)\)/.exec(oc)) ? 'closeBreakdown();editSettlementEntry(' + m[1] + ')' : (m = /deletePayeeEntry\((\d+)\)/.exec(oc)) ? 'closeBreakdown();editPayeeEntry(' + m[1] + ')' : null;
        if (h && (!/editSettlementEntry/.test(h) || typeof canManageOwed !== 'function' || canManageOwed())) a.insertAdjacentHTML('afterbegin', '<button class="ed2" title="Edit" onclick="' + h + '">✏️</button>');
      });
    });
    // card detail modal: full edit button
    wrap('openCardDetail', function (id) {
      var box = D.querySelector('#card-detail-body .modal-actions'); if (!box || box.querySelector('.ed3')) return;
      box.insertAdjacentHTML('afterbegin', '<button class="btn btn-ghost ed3" onclick="closeCardDetail();editCard(' + Number(id) + ')">✏️ Edit card</button>');
    });
  }

  // ── Squad Split ─────────────────────────────────────────────────────────────
  function sqInit() {
    var CATS = (typeof CAT_ICONS !== 'undefined') ? Object.keys(CAT_ICONS) : ['food', 'transport', 'shopping', 'bills', 'entertainment', 'health', 'other'];
    var mem = function () { return MEMBERS.map(function (m) { return [m.id, (m.emoji || '') + ' ' + m.name]; }); };
    var sameId = function (a, b) { return String(a.id) === String(b); };

    W.editSqExpense = async function (id) {
      if (!currentUser || !currentUser.isAdmin) return alert('⛔ Admin only!');
      var e = expenses.find(function (x) { return sameId(x, id); }); if (!e) return;
      var v = await ifxAsk('✏️ Edit expense', [
        { k: 'name', label: 'Name', val: e.name, req: true },
        { k: 'amount', label: 'Amount (AED)', type: 'number', val: e.amount, req: true, min: 0.01 },
        { k: 'date', label: 'Date', type: 'date', val: e.date, req: true },
        { k: 'category', label: 'Category', type: 'select', options: CATS, val: e.category },
        { k: 'paid_by', label: 'Paid by', type: 'select', options: mem(), val: e.paid_by },
        { k: 'split', label: 'Split between', type: 'checks', options: mem(), val: e.split_between }
      ], { validate: function (v) { return !(parseFloat(v.amount) > 0) ? 'Amount must be above 0' : null; } });
      if (!v) return;
      var upd = { name: v.name.trim(), amount: parseFloat(v.amount), date: v.date, month: v.date.slice(0, 7), category: v.category, paid_by: v.paid_by, split_between: v.split };
      if (!isDemoMode && sb) { var r = await sb.from('expenses').update(upd).eq('id', e.id); if (r.error) return alert('Error: ' + r.error.message); }
      Object.assign(e, upd); showToast('✅ Expense updated'); refresh();
    };
    W.editSqSettlement = async function (id) {
      if (!currentUser || !currentUser.isAdmin) return alert('⛔ Admin only!');
      var s = settlements.find(function (x) { return sameId(x, id); }); if (!s) return;
      var v = await ifxAsk('✏️ Edit settlement', [
        { k: 'from', label: 'Paid by', type: 'select', options: mem(), val: s.from_member },
        { k: 'to', label: 'Paid to', type: 'select', options: mem(), val: s.to_member },
        { k: 'amount', label: 'Amount (AED)', type: 'number', val: s.amount, req: true, min: 0.01 },
        { k: 'month', label: 'Month', type: 'month', val: s.month, req: true }
      ], { validate: function (v) { return v.from === v.to ? 'Payer and receiver must differ' : !(parseFloat(v.amount) > 0) ? 'Amount must be above 0' : null; } });
      if (!v) return;
      var upd = { from_member: v.from, to_member: v.to, amount: parseFloat(v.amount), month: v.month };
      if (!isDemoMode && sb) { var r = await sb.from('settlements').update(upd).eq('id', s.id); if (r.error) return alert('Error: ' + r.error.message); }
      Object.assign(s, upd); showToast('✅ Settlement updated'); refresh();
    };
    W.editSqPrev = async function (id) {
      if (!currentUser || !currentUser.isAdmin) return alert('⛔ Admin only!');
      var b = prevBals.find(function (x) { return sameId(x, id); }); if (!b) return;
      var v = await ifxAsk('✏️ Edit previous balance', [
        { k: 'from', label: 'Owes (from)', type: 'select', options: mem(), val: b.from_member },
        { k: 'to', label: 'Owed to', type: 'select', options: mem(), val: b.to_member },
        { k: 'amount', label: 'Amount (AED)', type: 'number', val: b.amount, req: true, min: 0.01 },
        { k: 'month', label: 'Month it applies to', type: 'month', val: b.month, req: true }
      ], { validate: function (v) { return v.from === v.to ? 'From and To must differ' : !(parseFloat(v.amount) > 0) ? 'Amount must be above 0' : null; } });
      if (!v) return;
      var upd = { from_member: v.from, to_member: v.to, amount: parseFloat(v.amount), month: v.month };
      if (!isDemoMode && sb) { var r = await sb.from('prev_balances').update(upd).eq('id', b.id); if (r.error) return alert('Error: ' + r.error.message); }
      Object.assign(b, upd); showToast('✅ Balance updated'); refresh();
    };

    // inject ✏️ next to every admin 🗑️
    function addPens(rootSel, delRe, fn) {
      D.querySelectorAll(rootSel + ' .btn-del').forEach(function (b) {
        if (b.previousElementSibling && b.previousElementSibling.classList.contains('btn-edit')) return;
        var m = delRe.exec(b.getAttribute('onclick') || ''); if (!m) return;
        b.insertAdjacentHTML('beforebegin', '<button class="btn-del btn-edit" title="Edit" onclick="' + fn + '(\'' + m[1] + '\')">✏️</button>');
      });
    }
    wrap('renderExpenses', function () { addPens('#expense-list', /delExp\('([^']*)'\)/, 'editSqExpense'); });
    wrap('renderSettlements', function () { addPens('#settlements-history', /delSettlement\('([^']*)'\)/, 'editSqSettlement'); });
    wrap('renderPrevBals', function () { addPens('#prev-list', /delPrev\('([^']*)'\)/, 'editSqPrev'); });
  }

  // ── Import / Export strip on every page ──────────────────────────────────────
  var MAP_BT = { home: [['bills', 'Bills'], ['owed', 'Owed'], ['settle', 'Payments']], add: [['bills', 'Bills']], cards: [['cards', 'Cards']], party: [['party', 'Ledger']], plans: [['plans', 'Plans']] };
  var MAP_SQ = { home: [['sq_expenses', 'Expenses']], add: [['sq_expenses', 'Expenses']], balances: [['sq_prev', 'Prev. balances']], settle: [['sq_settle', 'Settlements'], ['sq_prev', 'Prev. balances']] };
  function strips() {
    var map = isBT ? MAP_BT : isSQ ? MAP_SQ : null; if (!map || !W.ifxXfer) return;
    Object.keys(map).forEach(function (pg) {
      var host = D.getElementById('page-' + pg); if (!host || host.querySelector(':scope > .ifx-strip')) return;
      var h = '<div class="ifx-strip"><span class="ifx-strip-l">⇅ Excel / PDF</span>' + map[pg].map(function (d) { return '<button class="ifx-xbtn" onclick="ifxXfer.open(\'' + d[0] + '\')">' + esc(d[1]) + '</button>'; }).join('') + '</div>';
      host.insertAdjacentHTML('afterbegin', h);
    });
  }

  function boot() {
    if (!W.ifxAsk || !W.ifxXfer) return setTimeout(boot, 80);
    try { if (isBT) btInit(); if (isSQ) sqInit(); strips(); } catch (e) { console.error('ifx edit-plus', e); }
    // re-render once so buttons appear on already-painted lists
    try { if (isBT && typeof myCards !== 'undefined') { renderCards(); renderPartyGrid(); } if (isSQ && typeof expenses !== 'undefined') { refresh(); } } catch (e) {}
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', function () { later(boot); }); else later(boot);
})();
