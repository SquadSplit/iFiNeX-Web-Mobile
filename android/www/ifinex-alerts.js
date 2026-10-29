/* ============================================================================
   iFiNeX background alerts — shared by index.html and bill-tracker.html   (v8.0)
   NO Firebase / APNs / third-party push. Works in the Android app only: the
   IfinexNotifier plugin does not exist on iOS or in a browser (all functions
   below are then harmless no-ops).

   Phone side : android/app/src/main/java/io/github/squadsplit/app/IfinexNotify.java
                (AlarmManager wakes the app every ~2 min -> Supabase RPC poll_notifications -> native notification)
   Server side: sql/migrations/v8_0_device_alerts.sql
                (bill_devices + register_device / unregister_device / poll_notifications)
   ============================================================================ */
(function () {
  'use strict';
  var W = window;
  var WANT_KEY = 'ifx_alerts_want';          // e-mail that switched alerts on: lets them come back after logout -> login
  W.IFX_NOTIF_ID_BASE = 1000000;             // MUST equal IfinexNotify.NOTIF_ID_BASE (Java): same id => Android REPLACES, never duplicates
  var cache = null;                          // last status() answer from the native plugin

  function say(msg) {
    try {
      if (typeof W.toast === 'function') W.toast(msg);
      else if (typeof W.showToast === 'function') W.showToast(msg);
      else console.log('[iFiNeX]', msg);
    } catch (e) { /* never break the page for a toast */ }
  }
  function setWant(v) { try { if (v) localStorage.setItem(WANT_KEY, v); else localStorage.removeItem(WANT_KEY); } catch (e) {} }

  W.ifxIsNative = function () {
    try { return !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()); } catch (e) { return false; }
  };
  W.ifxAlertsPlugin = function () {
    try { return W.ifxIsNative() ? ((W.Capacitor.Plugins || {}).IfinexNotifier || null) : null; } catch (e) { return null; }
  };
  W.ifxAlertsStatus = async function () {
    var P = W.ifxAlertsPlugin();
    if (!P) { cache = null; return null; }
    try { cache = await P.status(); } catch (e) { cache = null; }
    return cache;
  };
  W.ifxAlertsOn = function () { return !!(cache && cache.enabled); };
  W.ifxAlertsWant = function () { try { return localStorage.getItem(WANT_KEY) || ''; } catch (e) { return ''; } };

  async function sessionEmail() {
    try {
      if (typeof sb === 'undefined' || !sb) return '';
      var r = await sb.auth.getSession();
      var u = r && r.data && r.data.session && r.data.session.user;
      return u && u.email ? u.email.toLowerCase() : '';
    } catch (e) { return ''; }
  }
  async function notifPermission(request) {
    var LN = W.Capacitor && W.Capacitor.Plugins && W.Capacitor.Plugins.LocalNotifications;
    if (!LN) return false;
    try {
      var c = await LN.checkPermissions();
      if (c.display !== 'granted' && request) c = await LN.requestPermissions();
      return c.display === 'granted';
    } catch (e) { return false; }
  }

  // Turn alerts on for THIS phone and the signed-in person: permission -> prepare (id+secret) -> register on Supabase -> start alarms.
  W.ifxAlertsEnable = async function (silent) {
    var P = W.ifxAlertsPlugin();
    if (!P) { if (!silent) say('Background alerts are only in the Android app'); return false; }
    try {
      var email = await sessionEmail();
      if (!email) throw new Error('Not signed in');
      await notifPermission(true);
      var s = await P.status();
      if (!s.notificationsAllowed) {
        if (!silent) { say('Notifications are blocked for iFiNeX — opening settings'); try { await P.openNotificationSettings(); } catch (e) {} }
        return false;
      }
      var prep = await P.prepare({ url: SUPABASE_URL, anonKey: SUPABASE_KEY, email: email });
      var r = await sb.rpc('register_device', { p_device_id: prep.deviceId, p_secret: prep.secret, p_label: prep.label || 'Android phone', p_platform: 'android' });
      if (r.error) throw new Error(r.error.message);
      if (!r.data || r.data.ok !== true) throw new Error((r.data && r.data.error) || 'register_device failed');
      await P.start({ pollSeconds: 120 });
      setWant(email);
      await W.ifxAlertsStatus();
      if (!silent) say('✅ Background alerts are ON');
      return true;
    } catch (e) {
      console.error('alerts enable failed', e);
      if (!silent) W.alert('Could not turn background alerts on.\n\n' + (e && e.message ? e.message : e) +
        '\n\nIf this says the function does not exist, run sql/migrations/v8_0_device_alerts.sql in Supabase (SQL Editor) first.');
      return false;
    }
  };

  // Turn alerts off: tell Supabase to forget this phone FIRST (needs the session), then wipe the local secret + alarms.
  // keepWant=true (used by logout) lets them come back automatically for the same person after the next login.
  W.ifxAlertsDisable = async function (silent, keepWant) {
    var P = W.ifxAlertsPlugin();
    if (!P) return;
    try {
      var s = await P.status();
      if (s && s.deviceId) {
        try { if (typeof sb !== 'undefined' && sb) await sb.rpc('unregister_device', { p_device_id: s.deviceId }); }
        catch (e) { console.warn('unregister_device', e); }
      }
      await P.stop();
    } catch (e) { console.warn('alerts disable', e); }
    if (!keepWant) setWant('');
    await W.ifxAlertsStatus();
    if (!silent) say('Background alerts are OFF');
  };

  // After login: bring alerts back if this same person had them on, and never keep someone else's alerts running.
  W.ifxAlertsResume = async function () {
    try {
      var P = W.ifxAlertsPlugin();
      if (!P) return;
      var email = await sessionEmail();
      if (!email) return;
      var s = await W.ifxAlertsStatus();
      if (!s) return;
      if (s.enabled) {
        if (s.email && s.email !== email) { await W.ifxAlertsDisable(true, true); setWant(''); }
        return;
      }
      if (W.ifxAlertsWant() === email && s.notificationsAllowed) await W.ifxAlertsEnable(true);
    } catch (e) { console.warn('alerts resume', e); }
  };
})();
