package io.github.squadsplit.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Re-arms the alert alarm after a reboot or an app update (Android drops all alarms in both cases). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || "android.intent.action.QUICKBOOT_POWERON".equals(a)) {
            Context app = context.getApplicationContext();
            if (IfinexNotify.isEnabled(app)) {
                IfinexNotify.ensureChannels(app);
                IfinexNotify.schedule(app, 60000L);
            }
        }
    }
}
