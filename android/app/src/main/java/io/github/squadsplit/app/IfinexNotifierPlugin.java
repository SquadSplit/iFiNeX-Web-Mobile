package io.github.squadsplit.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.UUID;

/**
 * JS bridge: window.Capacitor.Plugins.IfinexNotifier  (Android only; on iOS the plugin simply does not exist).
 * Flow used by bill-tracker.html:  prepare() -> Supabase rpc register_device -> start().   Logout: rpc unregister_device -> stop().
 */
@CapacitorPlugin(name = "IfinexNotifier")
public class IfinexNotifierPlugin extends Plugin {

    private JSObject statusObject() {
        Context c = getContext();
        SharedPreferences p = IfinexNotify.prefs(c);
        JSObject o = new JSObject();
        o.put("available", true);
        o.put("enabled", p.getBoolean("enabled", false));
        o.put("deviceId", p.getString("device_id", ""));
        o.put("email", p.getString("email", ""));
        o.put("pollSeconds", (int) (IfinexNotify.pollDelayMs(c) / 1000L));
        o.put("notificationsAllowed", IfinexNotify.notificationsAllowed(c));
        o.put("batteryUnrestricted", IfinexNotify.batteryUnrestricted(c));
        o.put("lastOkAt", p.getLong("last_ok", 0L));
        o.put("lastError", p.getString("last_err", ""));
        o.put("sdk", Build.VERSION.SDK_INT);
        return o;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject());
    }

    /** Step 1 of switching alerts on: create (or reuse) this phone's id + random secret. JS registers them on Supabase next. */
    @PluginMethod
    public void prepare(PluginCall call) {
        String url = call.getString("url");
        String anon = call.getString("anonKey");
        String email = call.getString("email");
        if (url == null || !url.startsWith("https://") || anon == null || anon.isEmpty() || email == null || email.trim().isEmpty()) {
            call.reject("url (https), anonKey and email are required");
            return;
        }
        Context c = getContext();
        SharedPreferences p = IfinexNotify.prefs(c);
        String em = email.trim().toLowerCase();
        String dev = p.getString("device_id", "");
        String sec = p.getString("secret", "");
        boolean fresh = false;
        if (dev.isEmpty() || sec.isEmpty() || !em.equals(p.getString("email", ""))) {
            dev = UUID.randomUUID().toString();
            sec = IfinexNotify.newSecret();
            fresh = true;
            p.edit().putString("device_id", dev).putString("secret", sec).putString("email", em)
                    .putLong("last_id", -1L).putString("seen", "").putBoolean("enabled", false).commit();
        }
        p.edit().putString("url", url).putString("anon", anon).commit();
        JSObject o = new JSObject();
        o.put("deviceId", dev);
        o.put("secret", sec);
        o.put("fresh", fresh);
        o.put("label", ((Build.MANUFACTURER == null ? "" : Build.MANUFACTURER) + " " + (Build.MODEL == null ? "" : Build.MODEL)).trim());
        call.resolve(o);
    }

    /** Step 3: arm the alarm chain. The first poll is a baseline: it remembers "now" and never replays old notifications. */
    @PluginMethod
    public void start(final PluginCall call) {
        final Context c = getContext();
        SharedPreferences p = IfinexNotify.prefs(c);
        if (p.getString("secret", "").isEmpty()) {
            call.reject("Call prepare() first");
            return;
        }
        Integer ps = call.getInt("pollSeconds");
        int poll = ps == null ? IfinexNotify.DEFAULT_POLL_SECONDS
                : Math.max(IfinexNotify.MIN_POLL_SECONDS, Math.min(IfinexNotify.MAX_POLL_SECONDS, ps));
        p.edit().putBoolean("enabled", true).putInt("poll_s", poll).putLong("last_id", -1L).putString("seen", "").commit();
        IfinexNotify.ensureChannels(c);
        new Thread(new Runnable() {
            @Override
            public void run() {
                int r = IfinexNotify.pollOnce(c, false);
                IfinexNotify.schedule(c, IfinexNotify.pollDelayMs(c));
                JSObject o = statusObject();
                o.put("baselineOk", r >= 0);
                call.resolve(o);
            }
        }, "ifinex-start").start();
    }

    /** Switch off + forget the secret. JS calls rpc unregister_device BEFORE this (it needs the signed-in session). */
    @PluginMethod
    public void stop(PluginCall call) {
        Context c = getContext();
        IfinexNotify.prefs(c).edit().putBoolean("enabled", false).remove("secret").remove("device_id").remove("email")
                .putLong("last_id", -1L).putString("seen", "").commit();
        IfinexNotify.cancel(c);
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context c = getContext();
        if (Build.VERSION.SDK_INT < 23) {
            call.resolve();
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
            call.resolve();
        } catch (Throwable t) {
            try {
                Intent i2 = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                c.startActivity(i2);
                call.resolve();
            } catch (Throwable t2) {
                call.reject("Cannot open battery settings");
            }
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context c = getContext();
        try {
            Intent i = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName())
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
            call.resolve();
        } catch (Throwable t) {
            call.reject("Cannot open notification settings");
        }
    }

    /** Fires one notification right now through the real channel + icons (tests permission, banner, sound, icon). */
    @PluginMethod
    public void testLocal(PluginCall call) {
        Context c = getContext();
        boolean allowed = IfinexNotify.notificationsAllowed(c);
        IfinexNotify.show(c, IfinexNotify.ID_TEST, "🔔 iFiNeX test",
                "Notifications work on this phone. Banner, sound and icon come from the iFiNeX channels.", IfinexNotify.CH_ALERTS);
        JSObject o = new JSObject();
        o.put("allowed", allowed);
        call.resolve(o);
    }

    /** Polls Supabase immediately and shows anything new (even while the app is open). Used by the "Check now" button. */
    @PluginMethod
    public void checkNow(final PluginCall call) {
        final Context c = getContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                int r = IfinexNotify.pollOnce(c, true);
                JSObject o = statusObject();
                o.put("result", r);
                call.resolve(o);
            }
        }, "ifinex-check").start();
    }
}
