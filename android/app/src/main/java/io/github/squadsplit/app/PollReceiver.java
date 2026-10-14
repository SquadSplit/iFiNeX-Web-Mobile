package io.github.squadsplit.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;
import android.util.Log;

/** Fired by AlarmManager every ~2 min while background alerts are on. Works with the app swiped away. */
public class PollReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context context, Intent intent) {
        final Context app = context.getApplicationContext();
        if (!IfinexNotify.isEnabled(app)) return;
        // Re-arm FIRST: if Android kills the process mid-request the chain must not break.
        IfinexNotify.schedule(app, IfinexNotify.pollDelayMs(app));
        final PendingResult pr = goAsync();
        PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
        final PowerManager.WakeLock wl = pm == null ? null : pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ifinex:poll");
        if (wl != null) {
            try { wl.acquire(20000L); } catch (Throwable ignored) { }
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    IfinexNotify.pollOnce(app, false);
                } catch (Throwable t) {
                    Log.w(IfinexNotify.TAG, "poll crashed: " + t);
                } finally {
                    try { if (wl != null && wl.isHeld()) wl.release(); } catch (Throwable ignored) { }
                    pr.finish();
                }
            }
        }, "ifinex-poll").start();
    }
}
