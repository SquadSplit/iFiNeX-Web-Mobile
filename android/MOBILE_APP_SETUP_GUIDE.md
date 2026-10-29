# SquadSplit Mobile App — Setup Guide

## What this actually is (read this first)

This is a **real, working Capacitor project** — it wraps your exact `bill-tracker.html` and `index.html` (same Supabase backend, same login, same everything) so they run as a native Android or iOS app instead of a website. It is **not** a compiled app yet. I cannot produce a finished, installable `.apk` or `.ipa` file from where I'm running — that step needs tools that only exist on your own computer (or a Mac, for iOS). This guide is the rest of the way, and it's short: **10–15 minutes for Android, if you already have a Mac for iOS.**

Why I can't finish it myself, in one sentence: building Android needs Google's Android SDK and Gradle servers, and building iOS needs Apple's Xcode, which only runs on a Mac — none of that is reachable from this session, no matter how long I run.

Everything below assumes you've never done this before.

---

## Part 1 — Android (do this first, it's the easier one)

### Step 1: Install Android Studio
1. Go to **https://developer.android.com/studio** on your computer (Windows, Mac, or Linux all work).
2. Click the big **Download** button, accept the terms, download it.
3. Run the installer, keep every default option, let it finish (it downloads the Android SDK automatically the first time you open it — this can take 10-20 minutes on the first run, that's normal).

### Step 2: Open this project
1. Unzip the `squadsplit-mobile.zip` file I gave you, anywhere on your computer.
2. Open a terminal (Mac/Linux: Terminal app. Windows: search for "Command Prompt" or use the terminal built into Android Studio in step 3) inside the unzipped folder, and run:
   ```
   npm install
   ```
   (This needs Node.js installed — if `npm` isn't recognized, download Node.js from **https://nodejs.org** first, the "LTS" version, then try again.)
3. Open **Android Studio** → **File → Open** → pick the `android` folder *inside* the unzipped project (not the top-level folder — the one literally named `android`).
4. Wait for Android Studio to finish "Gradle Sync" (a progress bar at the bottom — first time can take several minutes while it downloads things, this is the exact step I can't do from here).

### Step 3: Run it on your phone (to test)
1. On your Android phone: **Settings → About phone → tap "Build number" 7 times** (turns on Developer Mode). Then **Settings → Developer options → turn on USB debugging**.
2. Plug your phone into your computer with a USB cable. Allow the "USB debugging" prompt that appears on the phone.
3. In Android Studio, your phone's name should appear in the device dropdown at the top. Click the green **▶ Run** button.
4. The app installs and opens on your actual phone. This is the real app — same login, same data, same everything as the website.

### Step 4: Get a real installable file (APK)
- In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
- When it finishes, click the "locate" link in the notification — that `.apk` file is installable on any Android phone (share it directly, no store needed).

### Step 5 (optional): Publish to the Google Play Store
1. Create a **Google Play Console** account at **https://play.google.com/console** — **one-time $25 fee**.
2. In Android Studio: **Build → Generate Signed Bundle / APK** → choose **Android App Bundle** → follow the wizard to create a "signing key" (it'll ask you to set a password — **write this down and keep it safe forever**, you cannot update your app on the Play Store again if you lose it).
3. Upload the resulting `.aab` file in the Play Console, fill in your app's description/screenshots, submit for review. Google typically reviews within a few days.

---

## Part 2 — iOS (needs a Mac — there is no way around this, it's an Apple rule, not mine)

If you don't own a Mac: options are borrowing one, a Mac at a friend's/library, or a "cloud Mac" rental service (search "Mac in the cloud" — I haven't personally vetted specific providers, so check reviews yourself). There's no way to build a real iOS app without Apple's own tools on Apple's own OS.

### Step 1: Install Xcode
On a Mac: open the **App Store** app → search **Xcode** → Install (it's free, but large — several GB, budget 30-60 minutes).

### Step 2: Open the project
1. Unzip `squadsplit-mobile.zip` on the Mac.
2. Open Terminal inside the unzipped folder, run `npm install`, then `npx cap sync ios`.
3. You need **CocoaPods** once: run `sudo gem install cocoapods`, then inside the `ios/App` folder run `pod install`.
4. Open the file **`ios/App/App.xcworkspace`** (not `.xcodeproj` — must be the `.xcworkspace` one) — this opens in Xcode automatically.

### Step 3: Run it on your iPhone (to test)
1. Plug your iPhone into the Mac.
2. In Xcode, top-left, pick your iPhone from the device list.
3. Click the ▶ Play button. First time, your iPhone will say "Untrusted Developer" — go to **iPhone Settings → General → VPN & Device Management** → trust your account.
4. The app installs and runs on your iPhone.

### Step 4 (optional): Publish to the App Store
1. Create an **Apple Developer account** at **https://developer.apple.com** — **$99/year**.
2. In Xcode: **Product → Archive**, then follow the "Distribute App" wizard to upload to **App Store Connect**.
3. Fill in your app's listing at **https://appstoreconnect.apple.com**, submit for review. Apple typically reviews within 1-3 days.

---

## Keeping the app in sync when you update the website later

Whenever I (or you) change `bill-tracker.html` or `index.html`:
1. Copy the new file(s) into this project's `www/` folder, replacing the old ones.
2. Run `npx cap sync` in a terminal inside the project.
3. Re-open/re-build in Android Studio and/or Xcode as in the steps above.

You do **not** need to redo the whole setup — just these 2 commands, every time.

---

## What's already correctly set up for you
- **Same backend, zero duplication.** The app talks to your exact Supabase project — same login, same data, same everything a user does on the web works identically in the app.
- **Internet permission** is already enabled on Android (needed for it to reach Supabase).
- App is named **"SquadSplit"**, package ID `io.github.squadsplit.app` — change this in `capacitor.config.json` (and re-run `npx cap sync`) before publishing if you want a different name/ID.
- Uses the **default Capacitor icon** for now — you'll want to replace this with your own before publishing. (Ask me and I can help design one, or use **https://icon.kitchen** to generate a full icon set from an image you already have.)
