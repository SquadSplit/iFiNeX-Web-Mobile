package io.github.squadsplit.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(IfinexNotifierPlugin.class); // must run BEFORE super.onCreate
        registerPlugin(IfinexUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        IfinexNotify.ensureChannels(this);
        // Re-arm in case Android dropped our alarm (force-stop / OEM cleaner). Harmless if it is already armed.
        if (IfinexNotify.isEnabled(this)) IfinexNotify.schedule(this, 30000L);
    }

    @Override
    public void onStart() {
        super.onStart();
        IfinexNotify.setAppVisible(true);
    }

    @Override
    public void onStop() {
        IfinexNotify.setAppVisible(false);
        super.onStop();
    }
}
