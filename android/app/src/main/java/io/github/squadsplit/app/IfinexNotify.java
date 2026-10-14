package io.github.squadsplit.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

/**
 * iFiNeX background alerts with NO Firebase / APNs / third-party push service.
 *
 * How it works (Supabase + this app only):
 *   1. The signed-in user registers this phone once (JS -> Supabase RPC register_device) with a random per-device secret.
 *   2. An inexact "allow while idle" AlarmManager alarm wakes PollReceiver every ~2 minutes, even when the app is closed.
 *   3. PollReceiver calls the Supabase RPC poll_notifications(device_id, secret, last_id) with the PUBLIC anon key + the secret.
 *      Server returns only that user's new rows from bill_notifications. We show them as native notifications.
 *   4. The next alarm is armed BEFORE the network call, so a killed process can never break the chain.
 *
 * Honest limits: Android may delay alarms while the phone is deeply idle (Doze) unless the user exempts the app from
 * battery optimisation; a force-stop (or an OEM "kill all") clears alarms until the app is opened once more.
 */
final class IfinexNotify {
    private IfinexNotify() {}

    static final String TAG = "iFiNeX";
    static final String PREFS = "ifinex_notify";
    static final String CH_ALERTS = "ifinex_alerts";
    static final String CH_DUE = "ifinex_due";
    static final String ACTION_POLL = "io.github.squadsplit.app.POLL";
    static final int DEFAULT_POLL_SECONDS = 120;
    static final int MIN_POLL_SECONDS = 60;
    static final int MAX_POLL_SECONDS = 900;
    /** Keep identical to NOTIF_ID_BASE in bill-tracker.html: same id => Android REPLACES a notification instead of duplicating it. */
    static final int NOTIF_ID_BASE = 1000000;
    static final int ID_TEST = 999001;
    static final int ID_ALERTS_OFF = 999002;

    private static final Object LOCK = new Object();
    private static volatile boolean appVisible = false;

    static void setAppVisible(boolean v) { appVisible = v; }

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context c) { return prefs(c).getBoolean("enabled", false); }

    static long pollDelayMs(Context c) {
        int s = prefs(c).getInt("poll_s", DEFAULT_POLL_SECONDS);
        return Math.max(MIN_POLL_SECONDS, Math.min(MAX_POLL_SECONDS, s)) * 1000L;
    }

    static String newSecret() {
        byte[] b = new byte[32];
        new SecureRandom().nextBytes(b);
        return Base64.encodeToString(b, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    // ---------------------------------------------------------------- channels
    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        AudioAttributes aa = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        nm.createNotificationChannel(channel(CH_ALERTS, "Activity alerts",
                "Ledger, card, plan and sharing updates from you, your delegates and friends", aa));
        nm.createNotificationChannel(channel(CH_DUE, "Payment due reminders",
                "Cards and EPP / Gold instalments that are due today or tomorrow", aa));
    }

    private static NotificationChannel channel(String id, String name, String desc, AudioAttributes aa) {
        // IMPORTANCE_HIGH is what makes Android show the heads-up "banner" on top of the screen.
        NotificationChannel ch = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(desc);
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 250, 150, 250});
        ch.enableLights(true);
        ch.setLightColor(0xFF4D96FF);
        ch.setShowBadge(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE); // amounts stay hidden on a locked screen
        ch.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, aa);
        return ch;
    }

    // ---------------------------------------------------------------- show
    private static int flags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    static boolean notificationsAllowed(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return false;
        return Build.VERSION.SDK_INT < 24 || nm.areNotificationsEnabled();
    }

    static boolean batteryUnrestricted(Context c) {
        if (Build.VERSION.SDK_INT < 23) return true;
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName());
    }

    static void show(Context c, int id, String title, String body, String channelId) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null || !notificationsAllowed(c)) return;
            ensureChannels(c);
            String pkg = c.getPackageName();
            int small = c.getResources().getIdentifier("ic_stat_ifinex", "drawable", pkg);
            if (small == 0) small = android.R.drawable.ic_dialog_info; // never crash because of a missing icon
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channelId) : new Notification.Builder(c);
            b.setSmallIcon(small)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setColor(0xFF4D96FF)
                    .setCategory(Notification.CATEGORY_MESSAGE)
                    .setVisibility(Notification.VISIBILITY_PRIVATE);
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
            int large = c.getResources().getIdentifier("ic_notif_large", "drawable", pkg);
            if (large != 0) {
                Bitmap bm = BitmapFactory.decodeResource(c.getResources(), large);
                if (bm != null) b.setLargeIcon(bm);
            }
            Intent open = c.getPackageManager().getLaunchIntentForPackage(pkg);
            if (open != null) {
                open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                b.setContentIntent(PendingIntent.getActivity(c, id, open, flags()));
            }
            nm.notify(id, b.build());
        } catch (Throwable t) {
            Log.w(TAG, "show failed: " + t);
        }
    }

    // ---------------------------------------------------------------- alarm chain
    static PendingIntent pollIntent(Context c) {
        Intent i = new Intent(c, PollReceiver.class).setAction(ACTION_POLL);
        return PendingIntent.getBroadcast(c, 4711, i, flags());
    }

    static void schedule(Context c, long delayMs) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            long at = SystemClock.elapsedRealtime() + Math.max(5000L, delayMs);
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pollIntent(c));
            else am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pollIntent(c));
        } catch (Throwable t) {
            Log.w(TAG, "schedule failed: " + t);
        }
    }

    static void cancel(Context c) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(pollIntent(c));
        } catch (Throwable t) {
            Log.w(TAG, "cancel failed: " + t);
        }
    }

    /** Called when the server says this device was revoked (logout elsewhere / row deleted). */
    static void revokeLocal(Context c) {
        prefs(c).edit().putBoolean("enabled", false).remove("secret").remove("device_id").putString("last_err", "revoked").apply();
        cancel(c);
        show(c, ID_ALERTS_OFF, "iFiNeX alerts are off",
                "This phone was signed out of background alerts. Open iFiNeX and switch them on again.", CH_ALERTS);
    }

    // ---------------------------------------------------------------- polling
    private static String trimSeen(String csv) {
        if (csv.isEmpty()) return csv;
        String[] parts = csv.split(",");
        StringBuilder sb = new StringBuilder();
        for (int i = Math.max(0, parts.length - 80); i < parts.length; i++) {
            if (sb.length() > 0) sb.append(',');
            sb.append(parts[i]);
        }
        return sb.toString();
    }

    private static String readAll(InputStream is) throws Exception {
        if (is == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        is.close();
        return bo.toString("UTF-8");
    }

    private static JSONObject rpc(String base, String anon, String dev, String secret, long after) throws Exception {
        String endpoint = base.replaceAll("/+$", "") + "/rest/v1/rpc/poll_notifications";
        JSONObject body = new JSONObject();
        body.put("p_device_id", dev);
        body.put("p_secret", secret);
        body.put("p_after", after);
        byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
        HttpURLConnection conn = (HttpURLConnection) new URL(endpoint).openConnection();
        try {
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4500);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setFixedLengthStreamingMode(data.length);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("apikey", anon);
            conn.setRequestProperty("Authorization", "Bearer " + anon);
            OutputStream os = conn.getOutputStream();
            os.write(data);
            os.close();
            int code = conn.getResponseCode();
            String text = readAll(code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream());
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code + (text.length() > 120 ? "" : " " + text));
            return new JSONObject(text);
        } finally {
            conn.disconnect();
        }
    }

    /**
     * One poll. Returns notifications shown, -1 on error, -2 if the server revoked this device.
     * While the app is on screen the web layer already pops the alert (Realtime), so we only advance the cursor.
     */
    static int pollOnce(Context c, boolean forceShow) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            if (!p.getBoolean("enabled", false)) return 0;
            String url = p.getString("url", ""), anon = p.getString("anon", "");
            String dev = p.getString("device_id", ""), secret = p.getString("secret", "");
            if (url.isEmpty() || anon.isEmpty() || dev.isEmpty() || secret.isEmpty()) {
                p.edit().putString("last_err", "not configured").apply();
                return -1;
            }
            long last = p.getLong("last_id", -1L);
            String seen = p.getString("seen", "");
            int shown = 0;
            long started = SystemClock.elapsedRealtime();
            try {
                for (int round = 0; round < 3; round++) {
                    JSONObject r = rpc(url, anon, dev, secret, last);
                    if (!r.optBoolean("ok", false)) {
                        if ("invalid_device".equals(r.optString("error"))) { revokeLocal(c); return -2; }
                        throw new Exception("server: " + r.optString("error", "unknown"));
                    }
                    JSONArray items = r.optJSONArray("items");
                    if (items != null) {
                        for (int i = 0; i < items.length(); i++) {
                            JSONObject it = items.getJSONObject(i);
                            long id = it.getLong("id");
                            if (("," + seen + ",").contains("," + id + ",")) continue; // server re-sends a short overlap window on purpose
                            seen = seen.isEmpty() ? String.valueOf(id) : seen + "," + id;
                            if (!appVisible || forceShow) {
                                show(c, (int) (NOTIF_ID_BASE + (id % 1000000000L)), it.optString("title", "iFiNeX"),
                                        it.optString("message", ""), CH_ALERTS);
                                shown++;
                            }
                        }
                    }
                    last = Math.max(last, r.optLong("max_id", last));
                    if (!r.optBoolean("has_more", false)) break;
                    if (SystemClock.elapsedRealtime() - started > 7000L) break;
                }
                p.edit().putLong("last_id", last).putString("seen", trimSeen(seen))
                        .putLong("last_ok", System.currentTimeMillis()).putString("last_err", "").apply();
                return shown;
            } catch (Exception e) {
                Log.w(TAG, "poll failed: " + e);
                p.edit().putLong("last_id", last).putString("seen", trimSeen(seen)).putString("last_err", String.valueOf(e.getMessage())).apply();
                return -1;
            }
        }
    }
}
