package io.github.squadsplit.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * v2.1 in-app updater.   JS bridge: window.Capacitor.Plugins.IfinexUpdater   (Android only)
 *
 *   info()      -> installed versionName / versionCode / package / update repo
 *   check()     -> asks GitHub "latest release" of the repo that BUILDS this app and says if it is newer (build number in the APK file name > installed versionCode)
 *   download()  -> downloads that release's .apk into the app cache, VERIFIES it (see below), emits "progress" events
 *   install()   -> hands the verified file to Android's package installer (the user taps Install)
 *
 * Security rules (the JS side can NOT choose the repo or the URL - both come from this file / app resources):
 *   1. repo comes from the string resource ifinex_update_repo (written by the GitHub workflow), never from JS
 *   2. https only; every redirect hop must stay on a GitHub host
 *   3. the downloaded file must be the SAME package, a HIGHER versionCode, and signed by the SAME certificate(s) as the installed app,
 *      otherwise it is deleted and never offered to the installer (Android enforces the same signature rule again at install time)
 *   4. if GitHub publishes a sha256 digest for the asset, the file must match it
 */
@CapacitorPlugin(name = "IfinexUpdater")
public class IfinexUpdatePlugin extends Plugin {

    private static final String[] HOSTS = {"github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "github-releases.githubusercontent.com"};
    private static final Pattern REPO = Pattern.compile("^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$");
    private static final long MAX_APK = 200L * 1024L * 1024L;

    private final ExecutorService ex = Executors.newSingleThreadExecutor();
    private volatile String assetUrl = null, assetName = null, assetSha = null, assetVersion = null;
    private volatile long assetSize = 0;
    private volatile File ready = null;

    @Override
    public void load() {
        // a finished update leaves its file behind: tidy up on every start
        try { deleteDir(updDir()); } catch (Throwable ignored) { }
    }

    // ------------------------------------------------------------------------------------------------ helpers
    private Context ctx() { return getContext(); }

    private File updDir() { return new File(ctx().getCacheDir(), "ifinex-update"); }

    private static void deleteDir(File d) {
        if (d == null || !d.exists()) return;
        File[] fs = d.listFiles();
        if (fs != null) for (File f : fs) { if (f.isDirectory()) deleteDir(f); else f.delete(); }
        d.delete();
    }

    private String res(String name, String dflt) {
        try {
            int id = ctx().getResources().getIdentifier(name, "string", ctx().getPackageName());
            return id == 0 ? dflt : ctx().getString(id);
        } catch (Throwable t) { return dflt; }
    }

    @SuppressWarnings("deprecation")
    private PackageInfo installed(int flags) throws Exception {
        return ctx().getPackageManager().getPackageInfo(ctx().getPackageName(), flags);
    }

    @SuppressWarnings("deprecation")
    private static long codeOf(PackageInfo p) {
        return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : (long) p.versionCode;
    }

    private static boolean hostOk(URL u) {
        if (!"https".equalsIgnoreCase(u.getProtocol())) return false;
        String h = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
        for (String ok : HOSTS) if (h.equals(ok)) return true;
        return false;
    }

    /** "v2.1.0" -> {2,1,0}; anything after '-' or '+' is ignored. Non-numeric parts count as 0. */
    private static int[] ver(String s) {
        if (s == null) return new int[]{0};
        s = s.trim();
        if (s.startsWith("v") || s.startsWith("V")) s = s.substring(1);
        int cut = s.length();
        for (int i = 0; i < s.length(); i++) { char c = s.charAt(i); if (c == '-' || c == '+' || c == ' ') { cut = i; break; } }
        String[] parts = s.substring(0, cut).split("\\.");
        int[] out = new int[Math.max(parts.length, 1)];
        for (int i = 0; i < parts.length; i++) { try { out[i] = Integer.parseInt(parts[i].replaceAll("[^0-9]", "")); } catch (Exception e) { out[i] = 0; } }
        return out;
    }

    static int compare(String a, String b) {
        int[] x = ver(a), y = ver(b);
        int n = Math.max(x.length, y.length);
        for (int i = 0; i < n; i++) {
            int p = i < x.length ? x[i] : 0, q = i < y.length ? y[i] : 0;
            if (p != q) return p > q ? 1 : -1;
        }
        return 0;
    }

    private static final Pattern BUILD = Pattern.compile("-b([0-9]{1,10})\\.apk$", Pattern.CASE_INSENSITIVE);

    /** "iFiNeX-app-v2.5.0-b29865123.apk" -> 29865123 ; 0 when the name carries no build number */
    static long buildOf(String assetName) {
        java.util.regex.Matcher m = BUILD.matcher(assetName == null ? "" : assetName);
        if (!m.find()) return 0;
        try { return Long.parseLong(m.group(1)); } catch (Exception e) { return 0; }
    }

    private static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte v : b) sb.append(String.format("%02x", v));
        return sb.toString();
    }

    @SuppressWarnings("deprecation")
    private static Set<String> signers(PackageInfo p) throws Exception {
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= 28) {
            if (p.signingInfo != null) sigs = p.signingInfo.getApkContentsSigners();
        } else {
            sigs = p.signatures;
        }
        Set<String> out = new HashSet<>();
        if (sigs != null) for (Signature s : sigs) out.add(hex(MessageDigest.getInstance("SHA-256").digest(s.toByteArray())));
        return out;
    }

    @SuppressWarnings("deprecation")
    private static int signFlag() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }

    /** GET with manual redirects; each hop must be https on a GitHub host. Caller closes the stream. */
    private HttpURLConnection open(String url, String accept) throws Exception {
        String cur = url;
        for (int hop = 0; hop < 6; hop++) {
            URL u = new URL(cur);
            if (!hostOk(u) && !(u.getHost() != null && u.getHost().equalsIgnoreCase("api.github.com") && "https".equalsIgnoreCase(u.getProtocol()) && hop == 0))
                throw new Exception("blocked_host");
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "iFiNeX-updater");
            if (accept != null) c.setRequestProperty("Accept", accept);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new Exception("bad_redirect");
                cur = new URL(u, loc).toString();
                continue;
            }
            if (code != 200) { c.disconnect(); throw new Exception("http_" + code); }
            return c;
        }
        throw new Exception("too_many_redirects");
    }

    private static String readAll(InputStream in, int max) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > max) throw new Exception("too_large"); }
        return bo.toString("UTF-8");
    }

    // ------------------------------------------------------------------------------------------------ JS API
    @PluginMethod
    public void info(PluginCall call) {
        try {
            PackageInfo p = installed(0);
            JSObject o = new JSObject();
            o.put("versionName", p.versionName);
            o.put("versionCode", codeOf(p));
            o.put("packageName", ctx().getPackageName());
            o.put("repo", res("ifinex_update_repo", ""));
            o.put("edition", res("ifinex_update_edition", ""));
            o.put("canInstall", Build.VERSION.SDK_INT < 26 || ctx().getPackageManager().canRequestPackageInstalls());
            try { // which key signed the INSTALLED app (must equal the "Signing certificate SHA-256" in every GitHub Release note)
                java.util.TreeSet<String> sg = new java.util.TreeSet<>(signers(installed(signFlag())));
                o.put("certSha256", sg.isEmpty() ? "" : sg.first());
            } catch (Throwable t) { o.put("certSha256", ""); }
            call.resolve(o);
        } catch (Exception e) { call.reject("info_failed: " + e.getMessage()); }
    }

    @PluginMethod
    public void check(final PluginCall call) {
        ex.execute(new Runnable() {
            @Override public void run() {
                try { call.resolve(doCheck()); }
                catch (Exception e) { call.reject(e.getMessage() == null ? "check_failed" : e.getMessage()); }
            }
        });
    }

    private JSObject doCheck() throws Exception {
        String repo = res("ifinex_update_repo", "").trim();
        if (repo.isEmpty() || repo.equals("OWNER/REPO") || !REPO.matcher(repo).matches()) throw new Exception("not_configured");
        String edition = res("ifinex_update_edition", "").trim().toLowerCase(Locale.ROOT);
        HttpURLConnection c = open("https://api.github.com/repos/" + repo + "/releases/latest", "application/vnd.github+json");
        String body;
        try { body = readAll(new BufferedInputStream(c.getInputStream()), 2 * 1024 * 1024); } finally { c.disconnect(); }
        JSONObject r = new JSONObject(body);
        if (r.optBoolean("draft", false) || r.optBoolean("prerelease", false)) throw new Exception("no_release");
        String tag = r.optString("tag_name", "");
        PackageInfo me = installed(0);

        // pick the .apk asset: the one that names this edition, else the only one
        JSONArray assets = r.optJSONArray("assets");
        JSONObject pick = null; int apks = 0; JSONObject only = null;
        if (assets != null) for (int i = 0; i < assets.length(); i++) {
            JSONObject a = assets.getJSONObject(i);
            String n = a.optString("name", "");
            if (!n.toLowerCase(Locale.ROOT).endsWith(".apk")) continue;
            apks++; only = a;
            if (!edition.isEmpty() && n.toLowerCase(Locale.ROOT).contains(edition)) pick = a;
        }
        if (pick == null && apks == 1) pick = only;
        // every build gets its own number (minutes since 1970) that is part of the file name:  iFiNeX-app-v2.5.0-b29865123.apk
        // -> a bug-fix build with the same versionName is still offered. Older releases without it fall back to comparing version names.
        long releaseBuild = pick == null ? 0 : buildOf(pick.optString("name", ""));
        long myCode = codeOf(me);
        boolean newer = releaseBuild > 0 ? releaseBuild > myCode : compare(tag, me.versionName) > 0;

        JSObject o = new JSObject();
        o.put("ok", true);
        o.put("installedVersion", me.versionName);
        o.put("tag", tag);
        o.put("version", tag.replaceFirst("^[vV]", "").replaceFirst("(?i)-b[0-9]+$", ""));
        o.put("build", releaseBuild);
        o.put("installedBuild", myCode);
        o.put("newer", newer && pick != null);
        o.put("hasApk", pick != null);
        String notes = r.optString("body", "");
        o.put("notes", notes.length() > 1500 ? notes.substring(0, 1500) + "…" : notes);
        o.put("published", r.optString("published_at", ""));
        if (pick != null) {
            assetUrl = pick.optString("browser_download_url", "");
            assetName = pick.optString("name", "");
            assetSize = pick.optLong("size", 0);
            String dg = pick.optString("digest", "");
            assetSha = dg.startsWith("sha256:") ? dg.substring(7).toLowerCase(Locale.ROOT) : null;
            assetVersion = o.getString("version");
            o.put("assetName", assetName);
            o.put("assetSize", assetSize);
            o.put("sha256Published", assetSha != null);
        }
        return o;
    }

    @PluginMethod
    public void download(final PluginCall call) {
        ex.execute(new Runnable() {
            @Override public void run() {
                try {
                    if (assetUrl == null || assetUrl.isEmpty()) {
                        JSObject c = doCheck();
                        if (!c.optBoolean("newer", false)) throw new Exception("up_to_date");
                    }
                    ready = null;
                    File dir = updDir(); deleteDir(dir); dir.mkdirs();
                    File part = new File(dir, "update.apk.part"), fin = new File(dir, "update.apk");
                    HttpURLConnection c = open(assetUrl, "application/octet-stream");
                    long total = c.getContentLength() > 0 ? (long) c.getContentLength() : assetSize;
                    if (total > MAX_APK) { c.disconnect(); throw new Exception("too_large"); }
                    MessageDigest md = MessageDigest.getInstance("SHA-256");
                    long done = 0, lastEmit = 0;
                    try (InputStream in = new BufferedInputStream(c.getInputStream()); FileOutputStream out = new FileOutputStream(part)) {
                        byte[] buf = new byte[32768]; int n;
                        while ((n = in.read(buf)) > 0) {
                            out.write(buf, 0, n); md.update(buf, 0, n); done += n;
                            if (done > MAX_APK) throw new Exception("too_large");
                            long now = System.currentTimeMillis();
                            if (now - lastEmit > 250) { lastEmit = now; JSObject p = new JSObject(); p.put("done", done); p.put("total", total); notifyListeners("progress", p); }
                        }
                    } finally { c.disconnect(); }
                    JSObject p = new JSObject(); p.put("done", done); p.put("total", done); notifyListeners("progress", p);

                    if (assetSha != null && !assetSha.equals(hex(md.digest()))) { deleteDir(dir); throw new Exception("checksum_mismatch"); }
                    if (!part.renameTo(fin)) { deleteDir(dir); throw new Exception("rename_failed"); }
                    String bad = verify(fin);
                    if (bad != null) { deleteDir(dir); throw new Exception(bad); }
                    ready = fin;
                    JSObject o = new JSObject(); o.put("ok", true); o.put("version", assetVersion); o.put("bytes", done);
                    call.resolve(o);
                } catch (Exception e) {
                    call.reject(e.getMessage() == null ? "download_failed" : e.getMessage());
                }
            }
        });
    }

    /** returns null when the downloaded file may be installed, otherwise a short error code */
    @SuppressWarnings("deprecation")
    private String verify(File f) {
        try {
            PackageManager pm = ctx().getPackageManager();
            PackageInfo arc = pm.getPackageArchiveInfo(f.getAbsolutePath(), signFlag());
            if (arc == null) return "bad_apk";
            if (!ctx().getPackageName().equals(arc.packageName)) return "wrong_package";
            PackageInfo me = installed(signFlag());
            if (codeOf(arc) <= codeOf(me)) return "not_newer";
            Set<String> a = signers(arc), b = signers(me);
            if (a.isEmpty() || b.isEmpty()) return "cannot_verify_signature";
            if (!a.equals(b)) return "signature_mismatch";
            return null;
        } catch (Exception e) { return "verify_failed"; }
    }

    @PluginMethod
    public void install(PluginCall call) {
        try {
            File f = ready;
            if (f == null || !f.exists()) { call.reject("nothing_downloaded"); return; }
            if (Build.VERSION.SDK_INT >= 26 && !ctx().getPackageManager().canRequestPackageInstalls()) {
                Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx().getPackageName()));
                s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx().startActivity(s);
                JSObject o = new JSObject(); o.put("needsPermission", true); call.resolve(o);
                return;
            }
            Uri uri = FileProvider.getUriForFile(ctx(), ctx().getPackageName() + ".fileprovider", f);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx().startActivity(i);
            JSObject o = new JSObject(); o.put("started", true); call.resolve(o);
        } catch (Exception e) { call.reject("install_failed: " + e.getMessage()); }
    }
}
