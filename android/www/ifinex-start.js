/* iFiNeX v8.7 — first-launch chooser (start.html). Server  = discover the backend from <server>/ifinex-config.json · Standalone = on-device. */
(function (W, D) {
  'use strict';
  var $ = function (id) { return D.getElementById(id); }, M = W.IFX_MODE, found = null, foundUrl = '';
  function msg(t, cls) { var m = $('msg'); m.textContent = t || ''; m.className = 'msg' + (cls ? ' ' + cls : ''); }
  function show(el, on) { el.classList.toggle('hide', !on); }
  function go() { location.replace('bill-tracker.html'); }

  // SECURITY: the address box is ALWAYS empty. No site is pre-filled, remembered or suggested (not the bundled one, not the previous one):
  // the user types the address of the server they were given. Nothing about any server is shown until they ask to check one.
  var changing = !!(W.IFX_CFG && W.IFX_CFG.mode) || /[?&]change=1/.test(location.search);
  if (changing) { show($('btn-cancel'), true); $('h').textContent = 'Change how iFiNeX connects'; }
  $('btn-cancel').onclick = function () { go(); };

  // ---- tabs: Server | Standalone (side by side, one panel at a time) ----
  var TABS = ['server', 'sa'];
  function tab(name) {
    TABS.forEach(function (t) {
      var on = t === name, b = $('tab-' + t), p = $('c-' + t);
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; show(p, on);
    });
  }
  TABS.forEach(function (t, i) {
    var b = $('tab-' + t);
    b.addEventListener('click', function () { tab(t); });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]; tab(n); $('tab-' + n).focus(); e.preventDefault(); }
    });
  });
  tab(/[?&]tab=sa/.test(location.search) ? 'sa' : 'server');

  // "my-group.example" / "https://host/path/index.html" → "https://host/path/"
  function normalize(raw) {
    var s = String(raw || '').trim(); if (!s) throw new Error('Type the server web address first.');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
    var u; try { u = new URL(s); } catch (e) { throw new Error('That does not look like a web address.'); }
    if (u.protocol !== 'https:') throw new Error('Only secure https:// addresses are supported.');
    var p = u.pathname; if (/\.[a-z0-9]+$/i.test(p.split('/').pop())) p = p.replace(/[^/]*$/, ''); if (!/\/$/.test(p)) p += '/';
    return u.origin + p;
  }
  async function getJson(url) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 12000);
    try { var r = await fetch(url, { cache: 'no-store', signal: ctl.signal, credentials: 'omit' }); if (!r.ok) throw new Error('http_' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }

  $('btn-find').onclick = async function () {
    var b = this; show($('found'), false); show($('btn-use'), false); found = null; msg('');
    var base; try { base = normalize($('url').value); } catch (e) { return msg(e.message, 'err'); }
    b.disabled = true; msg('Checking ' + new URL(base).host + ' …');
    try {
      var c = await getJson(base + 'ifinex-config.json');
      if (!c || c.format !== 'ifinex-server' || !M.valid(c)) throw new Error('not_ifinex');
      found = c; foundUrl = base;
      var f = $('found'); f.textContent = '';
      var n = D.createElement('b'); n.textContent = '✅ ' + String(c.name || 'iFiNeX server').slice(0, 60); f.appendChild(n);
      // SECURITY: only the server's NAME is shown. Database address, keys and any other technical detail are never displayed.
      var l3 = D.createElement('div'); l3.textContent = 'Found. Only continue if you trust the person who gave you this address — you will sign in to this server.'; l3.style.cssText = 'margin-top:6px;font-size:.74rem'; f.appendChild(l3);
      show(f, true); show($('btn-use'), true); msg('');
    } catch (e) {
      var m = String(e && e.message || e);
      if (m === 'not_ifinex') msg('Found a website, but it is not an iFiNeX server (its ifinex-config.json is missing or invalid).', 'err');
      else if (/^http_404/.test(m)) msg('No ifinex-config.json on that address. Is it the right link? (See “Advanced” if you know the database settings.)', 'err');
      else if (e && e.name === 'AbortError') msg('The server did not answer in time. Check your internet and try again.', 'err');
      else msg('Could not reach that address. Check the spelling and your internet. If the server is yours, its host must allow other sites to read ifinex-config.json (CORS) — or use “Advanced”.', 'err');
    }
    b.disabled = false;
  };
  $('url').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('btn-find').click(); });

  $('btn-use').onclick = function () {
    if (!found) return;
    try { M.useServer(found, foundUrl); go(); } catch (e) { msg('Could not save these settings.', 'err'); }
  };
  $('btn-adv').onclick = function () { show($('adv'), $('adv').classList.contains('hide')); };
  $('btn-adv-go').onclick = function () {
    var c = { name: $('a-name').value.trim() || 'My server', supabaseUrl: $('a-url').value.trim(), supabaseKey: $('a-key').value.trim() };
    if (!M.valid(c)) return msg('Check the database address (must be https://…) and the public key.', 'err');
    try { M.useServer(c, ''); go(); } catch (e) { msg('Could not save these settings.', 'err'); }
  };
  $('btn-sa').onclick = function () {
    if (changing && W.IFX_CFG && W.IFX_CFG.mode === 'server' && !confirm('Switch to Standalone?\n\nYou stay signed in to the server and can switch back any time. Standalone starts with its own, separate data on this phone.')) return;
    M.useStandalone(); go();
  };
})(window, document);
