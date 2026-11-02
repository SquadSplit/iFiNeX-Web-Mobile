/* iFiNeX v9.8 — SPEED GUARD (loaded on bill-tracker.html and squad.html).
   Problem: on a slow connection a Save button looked "dead", people tapped it again and got duplicate rows, and every save waited for a full reload.
   Fix here: a Save/Add/Pay function that is already running ignores a second tap and its button is greyed out until it finishes.
   (The instant "optimistic" display and the one-round reload live in the pages themselves.) */
(function () {
  'use strict';
  var W = window, D = document, busy = {};
  var NAMES = ['addExpense', 'addOwedInline', 'addPayeeEntry', 'addEtEntry', 'savePlan', 'saveEditedPlan', 'createEt', 'recordSettlement', 'saveEditExpense', 'saveEditOwed',
    'saveEditPayeeEntry', 'confirmSettleAmount', 'submitQuickEntry', 'addCard', 'addParty', 'confirmDeleteWithReason', 'payInstallment', 'addEtCat'];
  function wrap(n) {
    var o = W[n]; if (typeof o !== 'function' || o._ifxg) return;
    var f = function () {
      if (busy[n]) return;
      busy[n] = 1;
      var a = D.activeElement, b = a && a.tagName === 'BUTTON' ? a : null; if (b) { b.disabled = true; b.setAttribute('data-ifx-wait', '1'); }
      var done = function () { delete busy[n]; if (b) { b.disabled = false; b.removeAttribute('data-ifx-wait'); } };
      try { return Promise.resolve(o.apply(this, arguments)).then(function (r) { done(); return r; }, function (e) { done(); throw e; }); } catch (e) { done(); throw e; }
    };
    f._ifxg = 1; W[n] = f;
  }
  function go() { NAMES.forEach(wrap); }
  var st = D.createElement('style'); st.textContent = '[data-ifx-wait]{opacity:.55;cursor:progress}'; D.head.appendChild(st);
  go(); D.addEventListener('DOMContentLoaded', go); W.addEventListener('load', function () { go(); setTimeout(go, 1500); });
})();
