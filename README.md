# iFiNeX app (Android + iOS, one project)

Repo: SquadSplit/iFiNeX-V2.4.0-Mobile (keep PUBLIC; never put secrets or keys in it).
Standard Capacitor project: `package.json`, `www/` (the website inside the app), `android/`, `ios/` are all in this one folder.

* **Signing key (once):** double-click `tools/SIGNING_KEY_create.bat` (Mac/Linux: `bash tools/SIGNING_KEY_create.sh`). One key for Android Studio AND GitHub -> every APK installs as an update. Guide: "Signing Key & Auto-Update Guide".
* **GitHub builds the APK:** every upload builds, signs and publishes a Release (Actions -> *Build iFiNeX APK*). *Sync website into the app* copies the website repo in every 30 min.
* **Android Studio:** `tools/build-android-local.bat`, then File -> Open -> the `android` folder -> Build -> Build APK(s).
  Manual: in the folder that contains `package.json`:  `npm ci` then `npx cap sync android` (never inside `android/`).
* **Phone:** banner "Update available" or Settings -> Check for updates -> Download -> Install now.
