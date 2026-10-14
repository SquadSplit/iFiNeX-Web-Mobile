#!/usr/bin/env node
/*
 iFiNeX - signing key tool.  ONE key for Android Studio AND GitHub, so every APK installs as an UPDATE (no uninstall, data kept).

   node tools/signing-key.js            create the key (first time) and walk you through the GitHub secrets      (= setup)
   node tools/signing-key.js show       print where the key is and its fingerprint (SHA-256)
   node tools/signing-key.js check      verify the key opens (exit code 0 = good)
   node tools/signing-key.js setup --use-android-studio-key
                                         OPTION B: reuse Android Studio's own debug key (~/.android/debug.keystore) instead of making a new one
   flags: --no-prompt (no questions, no clipboard)   --keytool <path>   --force-new (DANGEROUS: replaces an existing key)

 The key lives in  <your home>/ifinex-keys/   (Windows: C:\Users\<you>\ifinex-keys\ ; change with env IFX_KEYS_DIR):
   ifinex.keystore       the key itself            - BACK IT UP, NEVER put it on GitHub or send it to anyone
   signing.properties    alias + password          - Android Studio / Gradle reads this automatically
   GITHUB_SECRET_*.txt   the values you paste into GitHub (Settings > Secrets and variables > Actions)
 Plain Node.js, no packages. Needs Java's keytool (comes with Android Studio).
*/
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto'), readline = require('readline');

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = n => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null; };
const KT_VAL_IDX = argv.indexOf('--keytool') >= 0 ? argv.indexOf('--keytool') + 1 : -2;
const cmd = (argv.find((a, i) => !a.startsWith('--') && i !== KT_VAL_IDX) || 'setup').toLowerCase();
const IS_WIN = process.platform === 'win32', IS_MAC = process.platform === 'darwin';
const NOPROMPT = flag('no-prompt') || !process.stdin.isTTY;

const KEYS_DIR = (process.env.IFX_KEYS_DIR && process.env.IFX_KEYS_DIR.trim()) || path.join(os.homedir(), 'ifinex-keys');
const KS = path.join(KEYS_DIR, 'ifinex.keystore'), PROPS = path.join(KEYS_DIR, 'signing.properties');
const S1 = path.join(KEYS_DIR, 'GITHUB_SECRET_1_IFX_KEYSTORE_B64.txt');
const S2 = path.join(KEYS_DIR, 'GITHUB_SECRET_2_IFX_KEYSTORE_PASSWORD.txt');
const S3 = path.join(KEYS_DIR, 'GITHUB_SECRET_3_IFX_KEY_ALIAS.txt');

const say = (...a) => console.log(...a);
const hr = () => say('-'.repeat(72));
function die(msg, code) { say('\nERROR: ' + msg + '\n'); process.exit(code || 1); }

// ---------------------------------------------------------------- find keytool
function tryKeytool(p) {
  try { const r = cp.spawnSync(p, ['-help'], { encoding: 'utf8', timeout: 20000 }); if (r.error) return false; return /keytool|Key and Certificate/i.test((r.stdout || '') + (r.stderr || '')); } catch (e) { return false; }
}
function globDirs(base, re) { try { return fs.readdirSync(base).filter(n => re.test(n)).map(n => path.join(base, n)); } catch (e) { return []; } }
function findKeytool() {
  const exe = IS_WIN ? 'keytool.exe' : 'keytool';
  const c = [];
  if (opt('keytool')) c.push(opt('keytool'));
  if (process.env.JAVA_HOME) c.push(path.join(process.env.JAVA_HOME, 'bin', exe));
  c.push('keytool');
  if (IS_WIN) {
    const pf = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
    for (const base of pf) {
      for (const d of globDirs(base, /^Android$/i)) for (const s of globDirs(d, /^Android Studio/i)) { c.push(path.join(s, 'jbr', 'bin', exe)); c.push(path.join(s, 'jre', 'bin', exe)); }
      for (const s of globDirs(base, /^Android Studio/i)) { c.push(path.join(s, 'jbr', 'bin', exe)); c.push(path.join(s, 'jre', 'bin', exe)); }
      for (const vendor of ['Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft']) for (const j of globDirs(path.join(base, vendor), /./)) c.push(path.join(j, 'bin', exe));
    }
  } else if (IS_MAC) {
    c.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool', '/Applications/Android Studio.app/Contents/jre/Contents/Home/bin/keytool');
    for (const j of globDirs('/Library/Java/JavaVirtualMachines', /./)) c.push(path.join(j, 'Contents', 'Home', 'bin', 'keytool'));
  } else {
    c.push('/opt/android-studio/jbr/bin/keytool', '/usr/local/android-studio/jbr/bin/keytool', '/usr/lib/jvm/default-java/bin/keytool');
    for (const j of globDirs('/usr/lib/jvm', /./)) c.push(path.join(j, 'bin', 'keytool'));
  }
  for (const p of c) { if ((p === 'keytool' || fs.existsSync(p)) && tryKeytool(p)) return p; }
  return null;
}
function needKeytool() {
  const k = findKeytool();
  if (!k) die('Java "keytool" was not found on this computer.\n' +
    '  Easiest fix: install Android Studio (it contains Java) - https://developer.android.com/studio - then run this again.\n' +
    '  Or install Java 17 (Temurin) from https://adoptium.net .\n' +
    '  If Java is installed in an unusual place, run:  node tools/signing-key.js --keytool "C:\\path\\to\\keytool.exe"');
  return k;
}

// ---------------------------------------------------------------- helpers
function randomPassword(n) { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < n; i++) s += A[crypto.randomInt(A.length)]; return s; }
function readProps() {
  const o = {}; for (const line of fs.readFileSync(PROPS, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Za-z]+)\s*=\s*(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o;
}
function writeProps(alias, pw) { fs.writeFileSync(PROPS, 'keyAlias=' + alias + '\nstorePassword=' + pw + '\nkeyPassword=' + pw + '\n', { mode: 0o600 }); }
function listKey(kt, alias, pw) {
  const r = cp.spawnSync(kt, ['-list', '-v', '-keystore', KS, '-storepass', pw, '-alias', alias], { encoding: 'utf8', timeout: 30000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0) return { ok: false, out };
  const m = out.match(/SHA-?256:\s*([0-9A-Fa-f:]{95,})/);
  return { ok: true, sha: m ? m[1].replace(/:/g, '').toLowerCase() : null, out };
}
function fmtSha(h) { return h ? h.toUpperCase().match(/.{2}/g).join(':') : '?'; }
function copyToClipboard(text) {
  const tries = IS_WIN ? [['clip', []]] : IS_MAC ? [['pbcopy', []]] : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]];
  for (const [c, a] of tries) { try { const r = cp.spawnSync(c, a, { input: text }); if (!r.error && r.status === 0) return true; } catch (e) { } }
  return false;
}
function ask(q) { return new Promise(res => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); res(a); }); }); }

// ---------------------------------------------------------------- commands
function create(kt) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const have = fs.existsSync(KS), haveP = fs.existsSync(PROPS);
  if ((have || haveP) && !flag('force-new')) {
    if (have && haveP) { say('A key already exists in ' + KEYS_DIR + ' - REUSING it (this is what keeps updates working). Nothing was changed.'); return 'reused'; }
    die('Half a key found in ' + KEYS_DIR + ' (' + (have ? 'ifinex.keystore without signing.properties' : 'signing.properties without ifinex.keystore') + ').\n' +
      '  If you have a backup, copy BOTH files back into that folder. If you have none, move this folder away and run this again (a new key = one final uninstall of the app).');
  }
  if (flag('force-new')) { const bak = KEYS_DIR + '-old-' + Date.now(); fs.mkdirSync(bak); for (const f of [KS, PROPS]) if (fs.existsSync(f)) fs.renameSync(f, path.join(bak, path.basename(f))); say('Old key moved to ' + bak); }
  if (flag('use-android-studio-key')) {
    const dbg = path.join(os.homedir(), '.android', 'debug.keystore');
    if (!fs.existsSync(dbg)) die('Android Studio\'s debug key was not found at ' + dbg + '.\n  It is created the first time Android Studio builds any app on this PC. Build once, or choose OPTION A (no flag) instead.');
    fs.copyFileSync(dbg, KS); writeProps('androiddebugkey', 'android');
    say('OPTION B: copied Android Studio\'s debug key into ' + KEYS_DIR);
    return 'debug';
  }
  const pw = randomPassword(28);
  const r = cp.spawnSync(kt, ['-genkeypair', '-storetype', 'PKCS12', '-keystore', KS, '-alias', 'ifinex', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '36500',
    '-storepass', pw, '-keypass', pw, '-dname', 'CN=iFiNeX, O=iFiNeX, C=AE'], { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) die('keytool could not create the key:\n' + (r.stdout || '') + (r.stderr || ''));
  writeProps('ifinex', pw);
  say('NEW key created in ' + KEYS_DIR);
  return 'created';
}

function verify(kt) {
  if (!fs.existsSync(KS) || !fs.existsSync(PROPS)) die('No key in ' + KEYS_DIR + '. Run  SIGNING_KEY_create  first.');
  const p = readProps();
  if (!p.storePassword) die('signing.properties has no storePassword.');
  const r = listKey(kt, p.keyAlias || 'ifinex', p.storePassword);
  if (!r.ok) die('The key file does not open with the saved password/alias:\n' + r.out.trim().split('\n').slice(0, 4).join('\n'));
  return { p, sha: r.sha };
}

function writeSecrets(p) {
  const b64 = fs.readFileSync(KS).toString('base64');
  fs.writeFileSync(S1, b64, { mode: 0o600 });
  fs.writeFileSync(S2, p.storePassword, { mode: 0o600 });
  const secrets = [['IFX_KEYSTORE_B64', S1, b64], ['IFX_KEYSTORE_PASSWORD', S2, p.storePassword]];
  if ((p.keyAlias || 'ifinex') !== 'ifinex') { fs.writeFileSync(S3, p.keyAlias, { mode: 0o600 }); secrets.push(['IFX_KEY_ALIAS', S3, p.keyAlias]); }
  else if (fs.existsSync(S3)) fs.unlinkSync(S3);
  fs.writeFileSync(path.join(KEYS_DIR, 'README_KEEP_SAFE.txt'),
    'iFiNeX signing key\r\n\r\nThis folder IS your app identity. Whoever has ifinex.keystore + signing.properties can publish apps that Android treats as yours.\r\n' +
    '- Back up this whole folder (USB stick + a private cloud drive). NEVER upload it to GitHub, never e-mail it.\r\n' +
    '- If you lose it, the next APK cannot update the installed app: you must uninstall once (offline data is lost unless you made a backup in the app).\r\n' +
    '- New computer: copy this whole folder to the same place (C:\\Users\\<you>\\ifinex-keys) and everything keeps working.\r\n');
  return secrets;
}

async function walk(secrets) {
  say('\nNow put the key into GitHub (needed ONCE, so GitHub signs with the same key as your PC):');
  say('  1. Open  https://github.com/SquadSplit/iFiNeX-V2.4.0-Mobile/settings/secrets/actions   (log in to GitHub first)');
  say('  2. Click the green button  "New repository secret"  - once for each secret below.');
  hr();
  for (let i = 0; i < secrets.length; i++) {
    const [name, file, val] = secrets[i];
    say('SECRET ' + (i + 1) + ' of ' + secrets.length + '   Name:  ' + name);
    if (NOPROMPT) { say('   Value is in the file: ' + file); continue; }
    await ask('   Type the name above into the "Name" box, then press ENTER here to copy the value to your clipboard... ');
    if (copyToClipboard(val)) say('   Copied. Click the "Secret" box on GitHub, press Ctrl+V, then click "Add secret".');
    else say('   Could not use the clipboard. Open this file in Notepad, Select All, Copy, and paste it into GitHub:\n   ' + file);
    if (i < secrets.length - 1) await ask('   When "Add secret" is done, press ENTER for the next one... ');
  }
  hr();
}

async function main() {
  if (cmd === 'help' || flag('help') || flag('h')) { say(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('/*')[1]); return; }
  const kt = needKeytool();
  if (cmd === 'show' || cmd === 'check') {
    const v = verify(kt);
    say('Key folder : ' + KEYS_DIR); say('Alias      : ' + (v.p.keyAlias || 'ifinex'));
    say('SHA-256    : ' + v.sha); say('            ' + fmtSha(v.sha));
    say('\nThis fingerprint must equal the "Signing certificate SHA-256" in every GitHub Release note and the one shown in the app under Check for updates.');
    say('Key OK.'); return;
  }
  if (cmd !== 'setup') die('Unknown command "' + cmd + '". Use: setup | show | check');
  const how = create(kt);
  const v = verify(kt);
  const secrets = writeSecrets(v.p);
  say('\nKey folder : ' + KEYS_DIR); say('SHA-256    : ' + v.sha);
  say('\nAndroid Studio needs NOTHING else: the build finds this key by itself (no clicks in Android Studio).');
  await walk(secrets);
  say('DONE.  Two things to remember:');
  say('  * BACK UP the folder  ' + KEYS_DIR + '  (USB stick + private cloud drive). Never upload it to GitHub.');
  say('  * Fingerprint (compare later with the GitHub Release note and the app):  ' + v.sha);
  if (how === 'created') say('  * This is a NEW key: if iFiNeX is already on your phone, uninstall it ONCE (make a backup first in the app: Settings > Backup & Restore). After that, updates install over it for good.');
  if (how === 'debug') say('  * OPTION B: if the app on your phone was installed from an Android Studio build on THIS PC, the next APK should install as an update without uninstalling. If Android still refuses, uninstall once.');
}
main().catch(e => die(String(e && e.stack || e)));
