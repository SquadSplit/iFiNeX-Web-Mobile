/* iFiNeX v8.7 — first-launch chooser (start.html). Server  = discover the backend from <server>/ifinex-config.json · Standalone = on-device. */
(function (W, D) {
  'use strict';
  var $ = function (id) { return D.getElementById(id); }, M = W.IFX_MODE, found = null, foundUrl = '';
  function msg(t, cls) { var m = $('msg'); m.textContent = t || ''; m.className = 'msg' + (cls ? ' ' + cls : ''); }
  function show(el, on) { el.classList.toggle('hide', !on); }
  function go() { location.replace('bill-tracker.html'); }

  // default address = the server this app was built for (bundled ifinex-config.json → "site"), or the one used before
  var prev = null; try { prev = JSON.parse(localStorage.getItem('ifx_server') || 'null'); } catch (e) { }
  var changing = !!(W.IFX_CFG && W.IFX_CFG.mode) || /[?&]change=1/.test(location.search);
  if (prev && prev.url) $('url').value = prev.url;
  else fetch('ifinex-config.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) { if (c && c.site && !$('url').value) $('url').value = c.site; }).catch(function () { });
  if (changing) { show($('btn-cancel'), true); $('h').textContent = 'Change how iFiNeX connects'; }
  $('btn-cancel').onclick = function () { go(); };

  // "squadsplit.github.io" / "https://host/path/index.html" → "https://host/path/"
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
      var l1 = D.createElement('div'); l1.textContent = 'Website: ' + new URL(base).host; f.appendChild(l1);
      var l2 = D.createElement('div'); l2.className = 'mono'; l2.textContent = 'Database: ' + M.host(c.supabaseUrl); f.appendChild(l2);
      var l3 = D.createElement('div'); l3.textContent = 'Only continue if you trust this server — you will sign in to it.'; l3.style.cssText = 'margin-top:6px;font-size:.74rem'; f.appendChild(l3);
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
