# iFiNeX Web v8.3 & Mobile App v1.9 — CLAUDE REFERENCE  (generated 2026-10-08)

> Keep this file in the project. Paste it at the start of the next chat. Sections 0–12 and the appendix below are the v8.2 reference (still valid unless contradicted by **section V83**).

## V83. WHAT v8.3 / v1.9 CHANGED  (complete)

### V83.1 Identity
- Web **v8.3**, Mobile **v1.9** (versionCode 19, versionName 1.9.0), preview port **8093** (`python -m http.server 8093` in `web/`; if busy use the next free port, 8094…). Database schema **v8.3** (additive). Next release: Web v8.4 / Mobile v2.0 / port 8094.
- Supabase project `lznnetxeklmdrykxtsbm`. All v8.3 DB changes were APPLIED to the live project on 2026-10-08 (5 migrations, see V83.6).

### V83.2 Requests from the owner → what was done
| # | Request | Result |
|---|---|---|
| 1 | Budget planner + Salary planner module | NEW page `page-budget` (`ifinex-budget.js`): Overview · Salary · Budget · Goals; tables `bp_income`, `bp_items`, `bp_goals` |
| 2 | Checkbox per title → total of ticked items, in every module | `ifxSel` in `ifinex-tools.js`: any element with `data-ifx-k` + `data-ifx-amt` gets a tick-box; floating bar "N selected · Total X [Select all][Excel][PDF][Clear]". Wired into: bills, owed, history, party entries, cards (cycle amount), EPP/Gold plans, ET trackers, ET entries, budget lines, income, goals, Squad Split expenses/settlements/carry-forward |
| 3 | Template / export / import via Excel, + PDF export, everywhere | `ifxXfer` engine; data sets: bills, cards, owed, party, settlements(export), plans, et_trackers, et_entries, bp_income, bp_items, bp_goals, sq_expenses, sq_settle, sq_prev. Blank template (Data/Example/Instructions/Lists sheets), Excel export (with TOTAL row), PDF export, Excel/CSV import with preview, per-row validation, duplicate skipping |
| 4 | Mobile app asks to log in on every open | See V83.4 |
| 5 | Alerts & notifications "still has the issue" in the app | Code verified clean (web + simulated Android: no raw HTML). If the phone still shows it, the INSTALLED APK is older than v1.8 — install v1.9; version shown in drawer footer + login screen |
| 6 | App must reflect the logo (modules, small mark, icon) | New artwork pipeline from the owner's logo: emblem (app icon/splash/notification), wordmark plaque (name **+ small node mark**), 7 module pictures cut from the logo, module **Hub** screen with neon-coloured tiles named exactly as in the logo |
| 7 | Theme photo: choose part, size, opacity, recommended size note | New background editor (V83.5) |
| 8 | Event + Trip trackers (logo shows both) | ET now has Monthly / Events / Trips (`et_trackers.kind` = `period` \| `occasion` (=Event) \| `trip`) |

### V83.3 New / changed files (all in `web/`, mirrored into `mobile/www` and `mobile/android/app/src/main/assets/public`)
| File | Purpose |
|---|---|
| `ifinex-session.js` | `IFX_AUTH_STORAGE` (localStorage + IndexedDB + native Preferences), `ifxRestoreSession(sb)`, `ifxBootSplash/Offline/Hide`, `ifxKeep` |
| `ifinex-theme.js` | `ifxBg.apply()`, `ifxBgEditor.mount()`, `ifxPrepPhoto()` |
| `ifinex-tools.js` | `ifxSel` (multi-select totals) and `ifxXfer` (templates/export/import engine; `register(dataset)`) |
| `ifinex-datasets.js` | Bill Tracker data sets |
| `ifinex-datasets-squad.js` | Squad Split data sets (index.html only) |
| `ifinex-budget.js` | Budget & Salary Planner page + its 3 data sets |
| `vendor/` | supabase-js 2.110.9, SheetJS xlsx 0.18.5, jsPDF 2.5.2, jspdf-autotable 3.8.2 — **bundled locally** (no CDN → works offline in the app; CSP `script-src` no longer allows jsdelivr) |
| `assets/` | regenerated from the new logo: `ifinex-emblem-192.png`, `ifinex-wordmark.png`, `ifinex-mark.png`, `ifinex-hero.jpg`, `art-{bill,expense,squad,card,budget,trip,event}.webp`, all icons/splash/store art |
| `bill-tracker.html`, `index.html` | patched (see below) |

### V83.4 Persistent login — root causes and fix
Server data showed sessions refreshing normally, so the failure was client-side. Causes found in code:
1. Any error at start-up (slow radio on cold start, a failed `app_users` lookup) fell through to the login form or the "not registered" screen although a valid session existed (`tryEnter` ignored `.error`; `routeAfterLogin(true)` swallowed it).
2. The session lived only in WebView localStorage.
3. Delegate "managing account" choice lived in `sessionStorage`, which Android clears when the app is killed.
Fix: `IFX_AUTH_STORAGE` writes the session to 3 places and reads from whichever survives; `ifxRestoreSession` retries (0.5/1/2/4 s) and distinguishes **no session** (login form) from **offline** (Retry screen, stored login kept); fatal refresh errors (400/401/403, "invalid refresh token") clear storage and show login; lookup errors now throw into the Retry screen; managing choice moved to `ifxKeep` (localStorage); logout clears everything. Native durability needs `@capacitor/preferences` (added to `mobile/package.json`; run `npm install` + `npx cap sync`). Without it the app still works (localStorage + IndexedDB).
Device-level limit (not code): if the OS wipes app storage ("Clear data", uninstall), login is lost by design.

### V83.5 Background photo editor
- Prefs columns: `bill_user_prefs.bg_zoom` (40–400, % of "cover"), `bg_x`, `bg_y` (0–100), plus existing `bg_opacity` (0.05–0.9).
- One layout function drives both the live page and the preview, so the preview is exactly what the screen shows (preview box uses the device aspect ratio). Drag to pan, sliders for Size / Left-Right / Up-Down / Opacity, buttons *Fill screen*, *Fit whole photo*, *Reset*. The editor shows the photo's pixel size/ratio and warns when low-res.
- Recommended (shown in the editor): phone portrait **1080×2340 px (9:19.5)**, desktop **1920×1080 (16:9)**, JPG/WebP **≤ 1 MB** (hard limit 5 MB). Photos with a long edge > 2400 px are shrunk in the browser before upload.
- Squad Split reads the same prefs (read-only) via `ifxBg.apply`.

### V83.6 Database (all applied live; also in `sql/migrations/`)
```
bp_income (id, user_email, month 'YYYY-MM', source, kind salary|bonus|allowance|freelance|other, amount>=0, pay_date, note, created_by_email, created_at)
bp_items  (id, user_email, month, category, bucket needs|wants|savings|debt|other, planned>=0, note, ...)  UNIQUE(lower(user_email), month, lower(category))
bp_goals  (id, user_email, name, target>0, saved>=0, due_date, note, ...)
RLS (all three): FOR ALL to authenticated using/with check  lower(user_email)=my_email() OR is_delegate_for(user_email) OR is_bill_admin()
        + RESTRICTIVE gate ifx_registered_gate (is_registered()); anon: no grants.
bill_user_prefs += bg_zoom, bg_x, bg_y (+ check)       et_trackers.kind check now ('period','occasion','trip')
notify_people(): returns immediately when GUC ifinex.bulk = '1'
ifx_bulk_import(p_kind, p_owner, p_rows jsonb)  SECURITY INVOKER (RLS still applies), kinds: bill_expenses | bill_owed | bill_payee_entries, max 2000 rows;
        sends ONE summary notification through ifx_bulk_notify() (SECURITY DEFINER, authorises owner/delegate/admin itself)
```
Verified on live (rolled-back tests): non-admin cannot import for another user (SQLSTATE 42501); own import works; unsupported table rejected; no per-row notification spam. Security advisor: no new findings except `ifx_bulk_notify` being callable by signed-in users (intentional; it authorises internally).

### V83.7 Payloads
- Budget actuals = Σ ET entries (own trackers, spent by this person, same month, same category name case-insensitive) + Σ `bill_expenses` (same month/category). EPP/Gold installments due in the month are shown separately.
- Salary split default 50/30/20/0 → lines Rent 40% · Groceries 25% · Utilities 12% · Transport 15% · Medical 8% (needs); Outing 35 · Shopping 30 · Lifestyle 20 · Gifts 15 (wants); Savings 60 · Emergency fund 40 (savings); Debt payments (debt). "Create budget lines" updates same-named lines, inserts the rest.
- Import columns (labels are the header names; `*` required): see each data set in `ifinex-datasets*.js` / `ifinex-budget.js` — or download the template in the app.
- Dates accept `YYYY-MM-DD` and `DD/MM/YYYY`; numbers accept `1,250.50`; markup characters `< >` are stripped from text cells; max 2000 rows per import (plans: 30).

### V83.8 Function index (new)
`ifxRestoreSession, ifxBootSplash, ifxBootOffline, ifxBootHide, ifxKeep.{get,set,del,clearAll}, ifxBg.apply, ifxBgEditor.mount, ifxPrepPhoto, ifxSel.{clear,count,refresh}, ifxXfer.{register,open,close,button,tableXlsx,tablePdf,saveBlob,coerce,chunk}, ifxBudget.{enter,reset}, renderHub, HUB_TILES, mountBgEditor, saveAppearanceSoon` (bill-tracker.html: `loadAppearance, saveAppearance, selectTheme, openAppearance, uploadBackground, removeBackground` rewritten).

### V83.9 Tests run (Playwright + in-memory Supabase stand-in, `tests/v83/`)
Boot → hub (8 tiles, all images load) · selection total 345.31 for 3 ticked bills · bar clears on page change · ET tabs Monthly/Events/Trips + tick-boxes · budget: add income 9500 → split creates 11 lines summing exactly 9500 · spent 411.62 = bills + tracker entries · template download (Data/Example/Instructions/Lists, correct headers) · Excel export with TOTAL row · PDF export · import preview: 2 ready / 2 errors / 1 duplicate; DD/MM/YYYY parsed; unknown card & bad number rejected; ET import rejects unknown tracker and out-of-period date · hostile cell `<img onerror>` stored without markup and nothing injected · background editor: layout maths, drag, opacity/zoom persisted in upsert · session: IndexedDB-only restore, 2 transient failures then success, fatal error clears + login, nothing stored → login, offline keeps stored session · Squad Split: lands in app, tick-boxes total 130, data-set dropdown · Alerts modal (simulated Android): no raw HTML.
**Not tested (no device/Google access):** real Android install, real Preferences plugin, real e-mail OTP, real Supabase storage upload of a photo, real PDF viewing on phone.

### V83.10 Known limits / next
- `xlsx` 0.18.5 (last npm release) has known parser CVEs (prototype pollution / ReDoS) for *malicious* files: only import spreadsheets you made. Newer SheetJS builds are not on npm.
- PDF uses the standard Latin font: Arabic/Chinese text prints as boxes in PDF (Excel is fine).
- "Fit whole photo" cannot go below 40% size (DB check); very wide panoramas cannot be shown whole on a portrait phone.
- With-data SQL file contains the **v8.1 data snapshot** + v8.3 additions (live data changed since). Take a fresh data dump with the Supabase CLI if you need today's data.
- Plan import creates plans one by one (each notifies the people involved) — capped at 30.
- Alerts: verify on the phone after installing v1.9 (Part 8 of the guide).


---
# (v8.2 reference follows)
> File name: "iFiNeX Web v8.2 & Mobile App v1.8 - Claude Reference.md". Give this file to Claude at the START of every new session. It replaces all older notes (v7.4 / v7.8 / v8.0).

## 0. NAMING RULES (apply to EVERY file Claude produces)
- The project is **iFiNeX** (renamed from SquadSplit; the user may type "!FiNeX" — the logo and the name are **iFiNeX**). Do not write "SquadSplit/Squad Splitter" in new text. Only two legacy strings must stay: the live URL https://squadsplit.github.io (repo name) and the browser storage key `squadsplit-auth-v1` (changing it logs everyone out).
- Every document / SQL / archive is named: `iFiNeX Web v<web> & Mobile App v<mobile> - <what it is>.<ext>` — e.g. `- Claude Reference.md`, `- Setup Guide.md`, `- Database FULL (no data).sql`, `- Database FULL (with data).sql`, `- Database UPGRADE (run once on live).sql`, `- Database Emergency Rollback.sql`, `- Complete Project.zip`. Website zip: `iFiNeX Web v<web> - Website files (upload to GitHub).zip`.
- **Exception — deployment names must NOT change or the site breaks:** `index.html`, `bill-tracker.html`, `sw.js`, `ifinex-alerts.js`, `manifest.webmanifest`, `assets/`. Their version is shown in the zip/folder name and on the login screen.
- Every release: incremental versions + incremental preview port, this reference, a Setup Guide, full SQL **with and without data** (Squad Split), and a plain list of what was verified vs not.
- **Claude HAS a Supabase connector on this account** (project `lznnetxeklmdrykxtsbm`, region ap-southeast-2, Postgres 17). In a new chat load it with `tool_search` (query "supabase"), then use `execute_sql`, `apply_migration`, `get_advisors`, `list_edge_functions` / `get_edge_function`. **Never ask the user to paste SQL — apply it yourself:** back up first (schema `backup_YYYYMMDD`), apply with `apply_migration`, verify with simulated roles on REAL data, run `get_advisors`. Claude has NO GitHub, phone or dashboard-settings access: website upload, APK build and Auth settings stay manual and must be listed plainly as the user's remaining steps.
- **Claude memory is OFF for this user** (Settings → memory not enabled), so nothing can be saved to it from chat. Instead paste this block into Settings → Profile/Preferences once:
```
Project name: iFiNeX (renamed from SquadSplit; I may type "!FiNeX" = iFiNeX). Modules: Squad Split, Bill Tracker, Expense Tracker. Stack: static HTML on GitHub Pages + Supabase only (no Firebase / third-party push). Name every file "iFiNeX Web vX & Mobile App vY - <purpose>.<ext>" (deploy files index.html, bill-tracker.html, sw.js keep their names). Each release: incremental versions + incremental preview port, a Claude Reference md, a Setup Guide, and full SQL with AND without data for Squad Split. Be blunt and correct my mistakes directly.
```

## 1. Identity / versions
- Web **v8.2**, Mobile **v1.8** (versionCode 18 = 10×major+minor, versionName 1.8.0), preview port **8092** (`python -m http.server 8092` in the website folder; skip to the next free port if busy). Database schema stays **v8.1** (no database change in v8.2). Next release: Web v8.3 / Mobile v1.9 / port 8093.
- appId stays `io.github.squadsplit.app` (a different id would install as a second app). Live site https://squadsplit.github.io. Supabase project ref `lznnetxeklmdrykxtsbm`.
- Modules: **Squad Split** (`index.html`), **Bill Tracker** (`bill-tracker.html`: bills, cards, EPP/Gold plans, Party ledger, Owed-to-you, Expense Tracker `#et`, Admin). Roadmap in the logo (not built): Budgeting, Trip, Event, Shared-card.
- Stack: static HTML/JS (no bundler) on GitHub Pages · Supabase (Postgres+RLS, Auth email OTP, Realtime, Storage, Edge Functions `send-push` + `send-report`, pg_cron, pg_net) · Capacitor 6 (Android Java, iOS) · supabase-js 2.110.9 / jsPDF / SheetJS from jsDelivr.

## 2. Release history
**v8.2 / v1.8 — HOTFIX (this release):** the Alerts & notifications screen (and the Reports screen) printed raw HTML tags — my v8.1 escaping pass also escaped helper parameters that carry ready-made HTML (`row()`, `sec()`). Fixed. **Coding rule: a parameter/variable whose name ends in `Html` is trusted ready-made HTML and is never escaped by the escaping pass.** Added: static scan for the same flaw (`tests/scan_param_html.js`, 0 left), raw-HTML + hostile checks on the Alerts screen, a Report-screen step in the DOM-diff harness. No database change.
**v8.1 / v1.7 — SECURITY:** squad tables locked; registered-users-only gate on every table; admin-takeover closed; cross-site-scripting fixed (context-aware escaping, `esc()`/`jsq()`); notification spoofing closed; directory views private; audited deletes enforced; Delete Party reason+history+notify; CSP; anon role has no table access; roster reloaded after sign-in; single upgrade script + emergency rollback.
**v8.0 / v1.6:** plan-table scroll fix (page width), sticky-header fix, native Android background alerts without Firebase (alarm → Supabase RPC poll → native notification), channels `ifinex_alerts`/`ifinex_due`, rebrand to iFiNeX + generated icons/splash/banner, removed `@capacitor/push-notifications` (Firebase), filesystem+share plugins registered, `allowBackup=false`, index.html logout really signs out.

## 3. SECURITY REGISTER  (status after v8.1)
| # | Issue | Severity | Status | What was done / what remains |
|---|---|---|---|---|
| 1 | Squad tables (`expenses`,`settlements`,`prev_balances`,`members_config`) were "Allow all" for everyone, even logged-out visitors | Critical | **FIXED** | Squad members read; members add expenses/settlements/carry-forwards; only admins edit/delete/manage roster; logged-out = nothing (SQL suite S1–S6) |
| 2 | Admin takeover: plant `is_admin` roster row → "Import from Squad" copied it into app_users | Critical | **FIXED** | Roster writable by admins only; import never copies admin rights (grant in Admin → Users) |
| 3 | Stored cross-site scripting: user text rendered unescaped (names, notes, expense names, card/party names, tracker currency, notification text); old `escapeHtml` ignored quotes; names inside inline `onclick` | Critical | **FIXED** | Context-aware pass escaped 231 (bill-tracker) + 150 (index) expressions, incl. JS-string-in-handler contexts; DB check on currency. Evidence: hostile data injected 22 / 48 live `<img onerror>` elements in v8.0, **0 / 0** in v8.1; benign render identical in 25/25 + 15/15 steps. Residual: only paths exercised by the harness are proven; CSP keeps inline scripts allowed, so it is defence in depth |
| 4 | Open sign-up: any stranger could read all users + all cards, create trackers/rows | High | **FIXED** | Restrictive "registered users only (or delegate)" policy on 23 tables; app_users & cards visible only to registered users. Residual: a stranger can still create an empty auth account (zero access). Optional close: disable sign-ups + invite users from the dashboard (Setup Guide Part 5B) |
| 5 | Any logged-in user could spoof notifications (and push) to anyone | High | **FIXED** | Insert allowed only for yourself; triggers/functions (SECURITY DEFINER) unaffected |
| 6 | `app_users_directory` (all e-mails) readable by logged-out visitors | High | **FIXED** | View now returns rows only to registered users; anon revoked |
| 7 | Delete Party silently wiped the whole ledger ("Past entries stay" was false); linked party could delete it | High | **FIXED** | `delete_payee_with_reason()` — owner/delegate/admin only, reason required, entries archived to Deleted history, other person notified; party insert/update restricted to owner side |
| 8 | Raw REST deletes bypassed the audited delete functions | Medium | **FIXED** | Direct DELETE removed on `bill_payee_entries`, `bill_settlements`, `bill_owed` |
| 9 | Logged-out (`anon`) role had table access | Medium | **FIXED** | All table/sequence privileges revoked from anon; `poll_notifications` (secret-protected) remains callable |
| 10 | Session/alert secret in Android backups | Low | **FIXED (v1.6)** | `allowBackup=false` |
| 11 | CDN scripts (supabase-js, jsPDF, SheetJS) without integrity hashes | Medium | **OPEN** | CSP allows scripts only from this site + cdn.jsdelivr.net. Real fix: vendor the three libraries into the repo (next release) |
| 12 | Session token in localStorage | Medium | **MITIGATED** | XSS fixed + CSP `connect-src` allows only this site + the Supabase project. Inherent to supabase-js in a web app |
| 13 | Edge Function `send-report` | — | **AUDITED — SAFE** | Retired stub: always answers HTTP 410 and sends nothing (read live, version 18) |
| 14 | Edge Function `send-push` (`verify_jwt` is off) | Medium | **AUDITED — SAFE** | Code rejects any request without the cron/service secret (HTTP 403); the live DB function no longer contains the `__PUSH_SECRET__` placeholder; no change needed |
| 15 | E-mail OTP rate limits / expiry | Medium | **OWNER ACTION** | Dashboard settings in Setup Guide Part 5A |
| 16 | Registered users can see each other's card names/colours and the user list incl. admin flags | Low | **ACCEPTED (design)** | Needed for pickers/sharing; tighten later via the directory views |
| 17 | Non-atomic multi-step writes (payInstallment, saveEditedPlan, saveMembers, addPayeeEntry) | Low | **OPEN** | Integrity, not security: a failure can leave partial data |
| 18 | Directory views were SECURITY DEFINER; older delete functions executable by logged-out visitors | Medium | **FIXED (v8.1b, live)** | Views now `security_invoker`; EXECUTE revoked from anon on `delete_*_entry` and `is_admin_delegate` |
| 19 | Supabase linter advisories that remain | Info | **ACCEPTED** | `bill_devices` has no policies (intentional: only SECURITY DEFINER RPCs touch it); `poll_notifications` is anon-callable (the secret is the credential); helper/RPC functions executable by signed-in users only answer about the caller; `pg_net` lives in `public` (moving it would break push for no gain); leaked-password protection n/a (e-mail OTP, no passwords) |

### 3.1 Access matrix after v8.1
| Data | Logged-out | Stranger (signed up, not registered) | Squad member | Squad admin | General user | Pure delegate (no own row) |
|---|---|---|---|---|---|---|
| Squad expenses / settlements / carry-forwards: read | no | no | yes | yes | no | yes (as delegator) |
| …add | no | no | yes | yes | no | yes |
| …edit / delete | no | no | no | yes | no | no |
| Squad roster (`members_config`) | no | no | read | read+write | no | read |
| `app_users`, cards, directory views | no | no | yes | yes | yes | yes |
| Own bills / cards / plans / parties | no | no | yes | yes | yes | via delegation |
| Notifications insert | no | no | to self only | to self only | to self only | to self only |
Definitions: `is_registered()` (own row or delegate_email of some row), `is_squad_member()` (`group_type='squad_split'`, own or delegate), `is_squad_admin()` (`members_config.is_admin` or `app_users.is_admin`, own or delegate).

## 4. Files and where they go
| File | Goes to |
|---|---|
| `index.html`, `bill-tracker.html`, `sw.js`, `ifinex-alerts.js`, `manifest.webmanifest`, `assets/` | GitHub Pages repo root (Setup Guide Part 6) — also copied into `mobile/www` |
| `... Database UPGRADE (run once on live).sql` | Supabase SQL Editor on the LIVE project (device alerts + security; safe to re-run) |
| `... Database FULL (no data).sql` / `(with data).sql` | Only to create a NEW clone project. The with-data file holds real e-mails/money — never publish it. Replace `__PUSH_SECRET__` first |
| `... Database Emergency Rollback.sql` | Only if the live app is locked out; re-opens the old insecure rules |
| `mobile/` | Android Studio / Xcode (Setup Guide Part 7) |
| `store/`, `brand/` | Play Store icon + banner, logo sources, `make_assets.py` |
| `tests/` | Chromium + SQL regression suite (paths are sandbox paths; edit before reuse) |

## 5. Design system
Dark glass UI. Tokens: bg `#0b0b18`, blue `#4D96FF`, purple `#B06AFF`, green `#6BCB77`, gold `#FFD93D`, red `#FF6B6B`; fonts Fredoka One + Nunito; themes switchable (☰ Theme & background; custom background upload → Storage). Icon palette bg `#050D14`. Android channels `ifinex_alerts` / `ifinex_due` are IMPORTANCE_HIGH (heads-up banner, sound, vibration, light, lock-screen private).

## 6. Flows (as implemented)
- **Login:** email OTP (`signInWithOtp` → `verifyOtp`, 6-digit code; the magic link does not work inside the app). Bill Tracker `tryEnter()` / Squad `routeAfterLogin()` look up `app_users` by e-mail plus rows where the person is `delegate_email`; builds `me`, `managing`, account switcher. `group_type` = `squad_split` | `general` decides Squad access. Squad `loadMembers()` now also runs after sign-in (roster is private).
- **Squad Split:** roster `members_config`; expenses split among members; balance = paid − share + carry-forwards ± settlements; settle suggestions; admin panel edits members/expenses/balances (admin only now enforced server-side).
- **Bill Tracker:** bills (`bill_expenses`), cards (`bill_cards`, shares, payments, due cycles), EPP/Gold plans (`bill_plans`, `bill_plan_payments`), Party ledger (`bill_payees`, `bill_payee_entries`, link a party to a user), Owed-to-you (`bill_owed`, admin), settlements, Expense Tracker (`et_*`), reports (PDF/Excel/e-mail), notifications, Admin (users, import from squad, spending overview), delegation, themes.
- **Deletes with audit:** `delete_payee_entry`, `delete_settlement_entry`, `delete_owed_entry`, and (v8.1) `delete_payee_with_reason` — reason required, archived to `bill_deleted_history`, other side notified.
- **Notifications:** website = service worker + Web Push (`send-push` Edge Function via `dispatch_push_for_notification`); app open = Realtime pop-up; app closed (Android) = alarm every ~2 min → RPC `poll_notifications` → native notification (§8).

## 7. Database (public schema, from the TESTED v8.1 script; `*` = NOT NULL)
- **app_users**: id int8*, email text*, name text*, group_type text*, is_admin bool, emoji text, color text, created_at timestamptz, delegate_email text
- **app_users_directory**: email text, name text
- **bill_card_payments**: id int8*, card_id int8*, user_email text*, month text*, due_date date*, amount_due numeric*, status text*, paid_at timestamptz, reminder_sent_at timestamptz, created_at timestamptz*, push_sent_at timestamptz
- **bill_card_shares**: id int8*, card_id int8*, owner_email text*, shared_with_email text*, created_at timestamptz*
- **bill_cards**: id int8*, user_email text*, card_name text*, color text, created_at timestamptz, due_day int4, reminder_enabled bool*
- **bill_cards_directory**: id int8, user_email text, card_name text, color text
- **bill_deleted_history**: id int8*, source text*, owner_email text*, party_email text, amount numeric*, entry_type text, note text, original_created_at timestamptz, deleted_at timestamptz*, deleted_by_email text*, reason text*
- **bill_devices**: id int8*, device_id uuid*, user_email text*, secret_hash text*, platform text*, label text, created_at timestamptz*, last_seen_at timestamptz
- **bill_expenses**: id int8*, user_email text*, description text*, amount numeric*, card_id int8, category text, date date*, month text*, created_at timestamptz
- **bill_notifications**: id int8*, recipient_email text*, title text*, message text*, is_read bool*, created_at timestamptz*
- **bill_owed**: id int8*, user_email text*, amount numeric*, note text, month text*, created_at timestamptz
- **bill_payee_entries**: id int8*, user_email text*, payee_id int8, amount numeric*, entry_type text*, note text, date date*, month text*, created_at timestamptz, entered_by_email text, created_by_email text, payment_method text, card_id int8, payment_type text*
- **bill_payees**: id int8*, user_email text*, party_name text*, color text, created_at timestamptz, party_email text
- **bill_plan_payments**: id int8*, plan_id int8*, user_email text*, seq int4*, due_date date*, amount numeric*, status text*, paid_at timestamptz, paid_by_email text
- **bill_plans**: id int8*, user_email text*, plan_type text*, event_name text*, title text*, ledger text*, payee_id int8, card_id int8, total_amount numeric*, installments int4*, start_date date*, end_date date*, due_day int4*, notes text, created_by_email text, created_at timestamptz*
- **bill_push_subscriptions**: id int8*, user_email text*, endpoint text*, p256dh text*, auth text*, created_at timestamptz*
- **bill_report_log**: id int8*, user_email text*, report_type text*, month text*, sent_at timestamptz
- **bill_settlements**: id int8*, user_email text*, amount numeric*, month text*, note text, created_at timestamptz
- **bill_user_prefs**: user_email text*, theme text*, bg_url text, bg_opacity numeric*, updated_at timestamptz*
- **et_categories**: id int8*, user_email text*, name text*, icon text*, created_at timestamptz*
- **et_entries**: id int8*, tracker_id int8*, user_email text*, category text*, amount numeric*, entry_date date*, note text, spent_by text, created_by_email text, created_at timestamptz*
- **et_trackers**: id int8*, user_email text*, kind text*, title text*, currency text*, start_date date*, end_date date*, participants _text*, notes text, created_by_email text, created_at timestamptz*
- **expenses**: id int8*, name text*, amount numeric*, paid_by text*, split_between _text*, date date*, category text, month text*, created_at timestamptz
- **members_config**: id text*, name text*, email text, emoji text, color text, is_admin bool, sort_order int4
- **prev_balances**: id int8*, from_member text*, to_member text*, amount numeric*, month text*, created_at timestamptz
- **settlements**: id int8*, from_member text*, to_member text*, amount numeric*, month text*, created_at timestamptz

### Policies
| table | policy | cmd | roles |
|---|---|---|---|
| app_users | app_users_delete | DELETE | {authenticated} |
| app_users | app_users_insert | INSERT | {authenticated} |
| app_users | app_users_select | SELECT | {authenticated} |
| app_users | app_users_update | UPDATE | {authenticated} |
| app_users | ifx_registered_gate | ALL | {authenticated} |
| bill_card_payments | bill_card_payments_all | ALL | {authenticated} |
| bill_card_payments | ifx_registered_gate | ALL | {authenticated} |
| bill_card_shares | bill_card_shares_owner_all | ALL | {public} |
| bill_card_shares | bill_card_shares_shared_select | SELECT | {public} |
| bill_card_shares | ifx_registered_gate | ALL | {authenticated} |
| bill_cards | bill_cards_delete | DELETE | {authenticated} |
| bill_cards | bill_cards_insert | INSERT | {authenticated} |
| bill_cards | bill_cards_select | SELECT | {authenticated} |
| bill_cards | bill_cards_update | UPDATE | {authenticated} |
| bill_cards | ifx_registered_gate | ALL | {authenticated} |
| bill_deleted_history | bill_deleted_history_select | SELECT | {authenticated} |
| bill_deleted_history | ifx_registered_gate | ALL | {authenticated} |
| bill_expenses | bill_expenses_all | ALL | {authenticated} |
| bill_expenses | ifx_registered_gate | ALL | {authenticated} |
| bill_notifications | bill_notifications_delete | DELETE | {public} |
| bill_notifications | bill_notifications_insert | INSERT | {authenticated} |
| bill_notifications | bill_notifications_select | SELECT | {authenticated} |
| bill_notifications | bill_notifications_update | UPDATE | {authenticated} |
| bill_notifications | ifx_registered_gate | ALL | {authenticated} |
| bill_owed | bill_owed_insert | INSERT | {public} |
| bill_owed | bill_owed_select | SELECT | {public} |
| bill_owed | bill_owed_update | UPDATE | {public} |
| bill_owed | ifx_registered_gate | ALL | {authenticated} |
| bill_payee_entries | bill_payee_entries_insert | INSERT | {authenticated} |
| bill_payee_entries | bill_payee_entries_select | SELECT | {authenticated} |
| bill_payee_entries | bill_payee_entries_update | UPDATE | {authenticated} |
| bill_payee_entries | ifx_registered_gate | ALL | {authenticated} |
| bill_payees | bill_payees_insert | INSERT | {authenticated} |
| bill_payees | bill_payees_select | SELECT | {authenticated} |
| bill_payees | bill_payees_update | UPDATE | {authenticated} |
| bill_payees | ifx_registered_gate | ALL | {authenticated} |
| bill_plan_payments | bill_plan_payments_all | ALL | {public} |
| bill_plan_payments | ifx_registered_gate | ALL | {authenticated} |
| bill_plans | bill_plans_all | ALL | {public} |
| bill_plans | bill_plans_card_owner_select | SELECT | {public} |
| bill_plans | ifx_registered_gate | ALL | {authenticated} |
| bill_push_subscriptions | bill_push_subscriptions_all | ALL | {authenticated} |
| bill_push_subscriptions | ifx_registered_gate | ALL | {authenticated} |
| bill_report_log | bill_report_log_admin_only | ALL | {authenticated} |
| bill_report_log | ifx_registered_gate | ALL | {authenticated} |
| bill_settlements | bill_settlements_insert | INSERT | {authenticated} |
| bill_settlements | bill_settlements_select | SELECT | {authenticated} |
| bill_settlements | ifx_registered_gate | ALL | {authenticated} |
| bill_user_prefs | bill_user_prefs_all | ALL | {authenticated} |
| bill_user_prefs | ifx_registered_gate | ALL | {authenticated} |
| et_categories | et_categories_all | ALL | {authenticated} |
| et_categories | ifx_registered_gate | ALL | {authenticated} |
| et_entries | et_entries_delete | DELETE | {authenticated} |
| et_entries | et_entries_insert | INSERT | {authenticated} |
| et_entries | et_entries_select | SELECT | {authenticated} |
| et_entries | et_entries_update | UPDATE | {authenticated} |
| et_entries | ifx_registered_gate | ALL | {authenticated} |
| et_trackers | et_trackers_select | SELECT | {authenticated} |
| et_trackers | et_trackers_write | ALL | {authenticated} |
| et_trackers | ifx_registered_gate | ALL | {authenticated} |
| expenses | ifx_registered_gate | ALL | {authenticated} |
| expenses | squad_expenses_delete | DELETE | {authenticated} |
| expenses | squad_expenses_insert | INSERT | {authenticated} |
| expenses | squad_expenses_select | SELECT | {authenticated} |
| expenses | squad_expenses_update | UPDATE | {authenticated} |
| members_config | ifx_registered_gate | ALL | {authenticated} |
| members_config | squad_members_delete | DELETE | {authenticated} |
| members_config | squad_members_insert | INSERT | {authenticated} |
| members_config | squad_members_select | SELECT | {authenticated} |
| members_config | squad_members_update | UPDATE | {authenticated} |
| prev_balances | ifx_registered_gate | ALL | {authenticated} |
| prev_balances | squad_prevbal_delete | DELETE | {authenticated} |
| prev_balances | squad_prevbal_insert | INSERT | {authenticated} |
| prev_balances | squad_prevbal_select | SELECT | {authenticated} |
| prev_balances | squad_prevbal_update | UPDATE | {authenticated} |
| settlements | ifx_registered_gate | ALL | {authenticated} |
| settlements | squad_settlements_delete | DELETE | {authenticated} |
| settlements | squad_settlements_insert | INSERT | {authenticated} |
| settlements | squad_settlements_select | SELECT | {authenticated} |
| settlements | squad_settlements_update | UPDATE | {authenticated} |

### Functions
- `delegate_of(p_owner_email text)` — invoker
- `delete_owed_entry(p_id bigint, p_reason text)` — DEFINER
- `delete_payee_entry(p_entry_id bigint, p_reason text)` — DEFINER
- `delete_payee_with_reason(p_payee_id bigint, p_reason text)` — DEFINER
- `delete_settlement_entry(p_id bigint, p_reason text)` — DEFINER
- `dispatch_push_for_notification()` — DEFINER
- `et_can(tid bigint)` — DEFINER
- `is_admin_delegate()` — DEFINER
- `is_bill_admin()` — DEFINER
- `is_delegate_for(target_email text)` — invoker
- `is_registered()` — DEFINER
- `is_squad_admin()` — DEFINER
- `is_squad_member()` — DEFINER
- `my_email()` — invoker
- `notify_card_change()` — DEFINER
- `notify_card_payment_change()` — DEFINER
- `notify_card_share_change()` — DEFINER
- `notify_expense_change()` — DEFINER
- `notify_owed_change()` — DEFINER
- `notify_payee_entry_change()` — DEFINER
- `notify_people(p_actor_email text, p_emails text[], p_title text, p_message text)` — DEFINER
- `notify_plan_change()` — DEFINER
- `notify_plan_payment_change()` — DEFINER
- `notify_settlement_change()` — DEFINER
- `poll_notifications(p_device_id uuid, p_secret text, p_after bigint)` — DEFINER
- `register_device(p_device_id uuid, p_secret text, p_label text, p_platform text)` — DEFINER
- `unregister_device(p_device_id uuid)` — DEFINER

### Triggers
bill_card_payments.trg_notify_card_payment, bill_card_shares.trg_notify_card_share, bill_cards.trg_notify_card, bill_expenses.trg_notify_expense, bill_notifications.trg_dispatch_push, bill_owed.trg_notify_owed, bill_payee_entries.trg_notify_payee_entry, bill_plan_payments.trg_notify_plan_payment, bill_plans.trg_notify_plan, bill_settlements.trg_notify_settlement

Other: Storage bucket for backgrounds, Realtime publication, pg_cron (`daily-push-reminders`, `purge-stale-devices`). Verification numbers: a correct v8.1 database has **24** policies named `ifx_registered_gate` + `squad_expenses_select` (23 gates + 1).

### 7.1 Payloads / contracts
- `register_device(p_device_id uuid, p_secret text, p_label text, p_platform text)` → `{"ok":true}` | error `not_authenticated|bad_secret|unknown_user|device_owned_by_other` (authenticated; e-mail comes from the JWT; max 8 devices/person).
- `unregister_device(p_device_id)` → `{"ok":true,"removed":n}`.
- `poll_notifications(p_device_id, p_secret, p_after bigint)` — anon-callable; secret is the credential (only SHA-256 stored). `p_after<0` = baseline. Returns ≤20 items `{id,title,message,created_at}` + 3-minute look-back (app de-dupes by id), 7-day cap → `{"ok":true,"items":[…],"max_id":N,"has_more":bool}` | `{"ok":false,"error":"invalid_device"}`.
- `delete_payee_with_reason(p_payee_id bigint, p_reason text)` → `{"ok":true,"archived":n}` | error `not_authenticated|not_found|forbidden|reason_required`.
- Native bridge `Capacitor.Plugins.IfinexNotifier`: `status`, `prepare({url,anonKey,email})`, `start({pollSeconds})`, `stop`, `requestBatteryExemption`, `openNotificationSettings`, `testLocal`, `checkNow`.

## 8. Notification architecture (no third party)
Alarm (`setAndAllowWhileIdle`, ~120 s, request code 4711) → `PollReceiver` (re-arms first, `goAsync`, 20 s wake lock) → `IfinexNotify.pollOnce` → HTTPS RPC → `Notification.Builder` on `ifinex_alerts`. While the app is visible only the cursor advances. `BootReceiver` + `MainActivity.onCreate` re-arm. Prefs `ifinex_notify`: url, anon, email, device_id, secret, last_id, seen, enabled, poll_s, last_ok, last_err. Ids: 1000000+id alerts · 999001 test · 999002 revoked · 900000+ due reminders · 100000–899999 id-less pop-ups. **Limits:** ~2 min typical, longer under Doze/OEM killers unless battery = Unrestricted; force-stop clears alarms until the app opens; **iPhone cannot background-push without APNs** (Apple's paid service) → due reminders + live pop-ups only; instant (<5 s) delivery would need a foreground service + WebSocket (persistent notification, more battery). Play Store restricts `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` and needs a newer targetSdk than 34 — check current rules before publishing.

## 9. Function index (top-level, `name:line` in the shipped file)
**index.html**: applyMyAppearance:535, localDateStr:547, localMonthStr:548, escLike:549, esc:551, jsq:553, loadMembers:615, saveMembers:627, saveMembersLocal:640, renderMemberGrid:645, pickMember:653, goStep2:657, goStep1:665, sendOTP:667, verifyOTP:691, routeAfterLogin:713, finishLogin:762, resendOTP:774, startTimer:779, buildOTPBoxes:785, otpNav:790, showStep:794, enterApp:800, loadAllData:820, updateExpSplit:851, logout:854, refresh:865, changeMonth:875, updateMonthLabels:881, getPrevMonth:888, renderSquad:895, showPersonDetail:907, calcTotalNetForMember:981, getPrevMonthOf:998, initAddForm:1005, addExpense:1012, renderExpenses:1036, expCard:1053, delExp:1073, calcNet:1085, simplify:1101, renderBalances:1116, renderSettlements:1153, recordSettlement:1190, emailSquadReport:1208, delSettlement:1218, populatePrevBalDropdowns:1230, renderPrevBals:1241, addPrevBal:1255, delPrev:1271, openAdmin:1285, closeAdmin:1291, adminTab:1295, renderAdminMembers:1302, adminSendSquadReport:1333, saveMember:1340, addNewMember:1357, removeMember:1364, renderAdminExpenses:1372, saveExpense:1403, renderAdminBalances:1423, savePrevBal:1449, adminAddPrevBal:1464, showToast:1479, openDrawer:1489, closeDrawer:1490, loadNtf:1493, readNtf:1499, readAllNtf:1500, toggleNtf:1501, showPage:1505, showErr:1513, showSucc:1514, hideMsg:1515

**bill-tracker.html**: localDateStr:1102, localMonthStr:1103, escLike:1106, dhs:1123, toast:1124, popNotification:1128, showErr:1138, canManageOwed:1141, sendOTP:1185, buildOTPBoxes:1199, startTimer:1210, verifyOTP:1215, backToEmail:1226, tryEnter:1232, rememberManaging:1282, getRememberedManaging:1283, forgetManaging:1284, renderAccountList:1285, chooseAccount:1293, openSwitchAccount:1304, closeSwitchAccount:1308, confirmSwitchAccount:1309, switchAccount:1316, renderTrackerBanner:1323, switchToSelf:1333, updateSwitcherVisibility:1337, logout:1342, enterApp:1352, refreshManagingUI:1364, applyTheme:1410, applyBackground:1414, renderThemeSwatches:1420, loadAppearance:1429, saveAppearance:1435, selectTheme:1438, openAppearance:1445, closeAppearance:1453, previewBgOpacity:1454, persistBgOpacity:1455, uploadBackground:1456, removeBackground:1472, loadDeletedHistory:1483, renderDeletedHistory:1495, loadMyData:1514, fillPayeeEmailDatalist:1537, switchPage:1546, switchHomeTab:1555, switchOweSubTab:1561, changeMonth:1567, urlBase64ToUint8Array:1579, registerServiceWorker:1585, nativeIsApp:1601, nativeRequestNotifPermission:1602, nativeFireLocal:1612, alertsChip:1629, openAlerts:1633, closeAlerts:1634, renderAlerts:1635, alertsOn:1663, alertsOff:1664, alertsAllow:1665, alertsBattery:1671, alertsTestLocal:1675, alertsTestServer:1679, alertsBannerNative:1691, refreshPushUI:1704, enablePush:1730, loadNotifications:1754, subscribeNotifRealtime:1760, unsubscribeNotifRealtime:1773, renderNotifications:1776, toggleNotifPanel:1792, closeNotifPanel:1805, deleteNotification:1809, clearAllNotifications:1816, requestDelete:1831, closeDeleteModal:1838, confirmDeleteWithReason:1839, renderHome:1856, viewMyReport:1946, openReportPeriodModal:1947, closeReportPeriodModal:1953, setReportPreset:1954, generateReportFromPicker:1966, gatherReportData:1985, renderReportHTML:2070, openReport:2108, closeReport:2119, exportReportPDF:2127, exportReportExcel:2157, fillCardSelect:2178, addExpense:2183, deleteExpense:2204, editExpense:2211, closeEditExpense:2223, saveEditExpense:2224, clampDay:2244, nextDueDate:2245, cardAttribution:2257, cardCycleInfo:2283, renderCards:2295, openCardDetail:2326, closeCardDetail:2376, addCard:2377, editCardDueDay:2389, toggleCardPaid:2398, deleteCard:2406, openManageShares:2412, closeManageShares:2419, renderShareList:2420, addCardShare:2435, removeCardShare:2450, deleteOwedEntry:2456, recordSettlement:2461, addOwedInline:2474, deleteSettlementEntry:2490, openBreakdown:2497, closeBreakdown:2502, monthLabel:2503, openSpendBreakdown:2508, openOwedBreakdown:2526, openHistoryBreakdown:2543, editOwedEntry:2559, closeEditOwed:2569, saveEditOwed:2570, switchAddTab:2584, renderPartyGrid:2593, newPartyEmailHint:2604, addParty:2616, deleteParty:2630, fillPayeeSelect:2641, peSelectionChanged:2653, peMethodChanged:2658, loadPayeeCardOptions:2666, addPayeeEntry:2675, renderPayeeBalances:2708, deletePayeeEntry:2743, editPayeeEntry:2762, closeEditPayeeEntry:2775, epeMethodChanged:2776, saveEditPayeeEntry:2798, settleUpParty:2823, closeSettleAmountModal:2829, confirmSettleAmount:2830, showPayeeDetail:2856, closePayeeDetail:2899, loadOwedToMe:2905, renderOwedToMe:2924, openAddFromOwedToMe:2957, closeQuickEntry:2967, openAddFromOwedToOthers:2972, submitQuickEntry:2982, openAdmin:3004, closeAdmin:3008, switchAdminTab:3009, loadAllUsers:3016, renderAdminUsers:3025, openEditUser:3048, closeEditUser:3059, saveEditUser:3060, adminSendOneReport:3074, createUser:3077, deleteUser:3092, importFromSquad:3097, adminAddOwed:3109, loadAdminOwedList:3121, loadAdminSpending:3130, loadPlans:3147, planStats:3153, renderPlans:3158, openPlanModal:3172, closePlanModal:3187, plLedgerChange:3188, plRefreshCards:3189, plAutoEnd:3196, planSchedule:3197, savePlan:3204, saveEditedPlan:3218, togglePlanPay:3230, deletePlan:3234, scheduleDueNotifs:3241, openDrawer:3264, closeDrawer:3265, goModule:3266, loadSharedWithMe:3270, usableCards:3275, cardLabel:3276, planCardName:3277, guessUser:3279, openPartyDetail:3284, linkParty:3305, togglePartyCard:3314, togglePlan:3322, setPlanTab:3323, planCardHtml:3324, nextMonthDue:3337, payInstallment:3338, loadEt:3362, etFilt:3373, etCatTotals:3374, renderEt:3375, etList:3376, etOpenT:3383, etDetail:3384, etThisMonth:3404, openEtModal:3405, createEt:3412, addEtEntry:3419, addEtCat:3426, delEtEntry:3431, deleteEt:3432, loadScript:3434, saveBlob:3435, exportEt:3443, closeCardMenu:3465, openCardMenu:3466, removeShareFromMenu:3483, esc:3488, jsq:3490, escapeHtml:3491

**ifinex-alerts.js**: ifxIsNative, ifxAlertsPlugin, ifxAlertsStatus, ifxAlertsOn, ifxAlertsWant, ifxAlertsEnable, ifxAlertsDisable, ifxAlertsResume.
New in v8.1: `esc()`, `jsq()` (both pages); `deleteParty()` rewritten.

## 10. Tests (all passing for this release)
- Chromium 141 mobile emulation, real touch events: page width 584→390px, swipe scrollLeft 0→194, sticky header −800→0 (`scroll_test.py`, `sticky_test.py`).
- 34/34 alert-flow checks with mocked Android plugins + Supabase (`native_test.py`; v8.2 added: no raw HTML shown as text, real chip/button elements, hostile last-error text). DOM-diff harness now has 26 bill-tracker steps incl. the Report screen (old vs new identical on benign data; the `index.html` run has one timing-flaky step that flips direction between runs).
- **XSS proof** (`xss_harness.py` + `fx_benign.json` / `fx_hostile.json` generated from the schema + `diff_snap.py`): hostile data on v8.0 → 22 (bill-tracker) / 48 (index) injected elements and script executed; v8.1 → 0 / 0. Benign data renders byte-identical between v8.0 and v8.1 (25/25 and 15/15 DOM snapshots). No CSP violations.
- PostgreSQL 16 + Supabase stand-ins (mirroring Supabase default grants): both full schemas run with 0 errors (24 tables, 27 functions, 80 policies, 10 triggers); `test_security.sql` (anon, stranger, member, admin, general, pure delegate, party, audited delete) and `test_alerts.sql` pass; UPGRADE applies twice on a fresh v7.8 database; ROLLBACK then re-UPGRADE works.
- **NOT verified:** a physical phone / emulator (no Android SDK here), Gradle build, iOS build, Doze timing, OEM battery killers, the Edge Function sources, every single screen under hostile data (only the 25 + 15 exercised render paths).

## 11. Open issues (fix next)
Vendor jsDelivr libraries (SRI-equivalent) · verify/fix `send-report` + `send-push` · non-atomic multi-step writes · card overdue badge dead (`nextDueDate`) · card totals before owed loaded · plan end_date/installments edge cases · negative amounts allowed · delegate notifications keyed on `managing.email` · duplicate indexes ×3 · unused columns `payment_type`, `entered_by_email` · storage backgrounds never deleted · `index.html` hostile-data run shows 1 pre-existing page error (same in v8.0).

## 12. LIVE STATE LOG (project lznnetxeklmdrykxtsbm)
- **2026-10-06** hotfix v8.2 / v1.8 — website + app only; database unchanged since v8.1b.
- **2026-10-04** safety copy → schema `backup_20261003` (23 tables, 284 rows; privileges revoked from anon/authenticated; not exposed by the API).
- Migrations applied to production (visible in Supabase migration history): `ifinex_v8_0_device_alerts`, `ifinex_v8_1_security_hardening`, `ifinex_v8_1b_views_invoker_and_function_grants`.
- Pre-flight found: 9 app_users (2 admins), 5 roster rows (1 admin), no script/markup text in any column, tracker currencies = AED only. Auth accounts not registered in the app: 2 (they now see nothing). Registered people who never logged in: 2.
- Verified with simulated roles on REAL data — logged-out: denied everywhere; unregistered account: 0 rows; squad member: 45 expenses / 11 settlements / 7 carry-forwards / 5 roster, not admin; general user: 0 squad rows, own bills intact; admin: sees every real row.
- Structure fingerprint (columns, constraints, indexes, function bodies, triggers, policies, views, storage bucket, realtime): **95/95 identical** between live and `Database FULL (no data)`.
- Data: `Database FULL (with data)` regenerated from live — snapshot **2026-10-04 19:12 UTC**, **22/22 tables hash-identical**. The previous file (snapshot 2026-09-29) was missing plans, plan payments, trackers, entries, categories and card shares and had stale rows. `bill_push_subscriptions` is deliberately not exported. **Live data keeps changing (someone was adding expenses during the check) — re-snapshot before relying on it.**
- Edge functions read from live: send-report v18 = retired stub (410); send-push v5 = secret-gated.
- Rollback path tested: UPGRADE → ROLLBACK → UPGRADE.
- PENDING (manual, outside Claude's access): GitHub upload of the website (until then fresh Squad Split OTP logins on the OLD page can fail and the old Delete Party fails), Supabase Auth dashboard settings, APK build.
- Test-suite note: `test_security.sql` assumes an empty database (it asserts a roster count of 2); on the with-data clone that single assertion fails by design.

## Appendix A — previous addendum v7.8 (verbatim, still valid where not contradicted above)
# CLAUDE FUTURE REFERENCE — v7.8 addendum (29 Sep 2026)
Base doc: CLAUDE_REFERENCE_v7_4 (full source, schema, RLS, flows). This addendum supersedes it where they differ.
Live checked: Supabase project `lznnetxeklmdrykxtsbm` (ap-southeast-2, PG17). 20 public tables incl. new bill_plans, bill_plan_payments. uploaded www/*.html == zip www/*.html.

## v7.5 changes
1. **DB**: `bill_plans` (plan_type epp|gold, event_name, title, ledger own|owe_admin|owe_other|owed_to_you, payee_id, card_id [own or shared card], total_amount, installments, start/end_date, due_day, notes, created_by_email) and `bill_plan_payments` (plan_id, seq, due_date, amount, status pending|paid, paid_at, paid_by_email; unique plan_id+seq, cascade delete). RLS = owner OR `is_delegate_for()` OR `is_bill_admin()`; card owner gets SELECT on plans using their card. Triggers notify owner + owner's delegate via `notify_people` (plan create/update/delete, installment paid/reopened). SQL: SquadSplit_FULL_SCHEMA_*_v7.8.sql (full rebuild, see below).
2. **Bill Tracker**: new 📅 Plans tab (`page-plans`). Filters: type / event / ledger. Summary: total, paid, remaining, plans, months left. Per plan: card used + owner, start→end, due day, total/paid/need to pay/payments done/months left/progress bar, scrollable (both axes, sticky header) payment table with Mark paid/Undo, overdue flag. Create modal: type, event (datalist), title, ledger, party, card, total, N payments, start, end (auto = start + N-1 months), due day. Schedule is generated client-side (`planSchedule`): monthly on due_day (clamped to month length), last payment absorbs rounding. Delegates use the same code path (`managing.email` = plan owner, `created_by_email` = logged-in person).
3. **Header overflow** (both HTML files): header no longer wraps/overflows; `.header-right` scrolls horizontally, buttons `flex:0 0 auto`.
4. **Native**: `scheduleDueNotifs()` schedules OS local notifications (day-before + due-day 09:00, max 60) for pending plan payments — fire with app closed, default sound. Re-scheduled on every `loadPlans()`.

## Key functions (new)
loadPlans, planStats, renderPlans, openPlanModal, closePlanModal, plLedgerChange, plAutoEnd, planSchedule, savePlan, togglePlanPay, deletePlan, scheduleDueNotifs.
Payload examples — plan insert: `{user_email,plan_type,event_name,title,ledger,payee_id,card_id,total_amount,installments,start_date,end_date,due_day,notes,created_by_email}`; payment insert: `{plan_id,user_email,seq,due_date,amount}`; mark paid: `{status:'paid',paid_at,paid_by_email}`.

## NOT done / limits (be honest)
- **True push with app fully killed for events made by OTHER people** (e.g. someone adds an owed entry at 3am) still needs FCM/APNs. Not built. Web Push (Edge Function send-push v5) covers browsers/PWA only. Needs Firebase project + google-services.json + APNs key.
- Plan edit (change amounts/dates) not built: delete + recreate. Card due-date reminders are not yet included in scheduleDueNotifs.
- Card-usage of a shared card by a non-owner is stored (card_id) but the card's own monthly bill total is not auto-updated by plan payments.
- Not runtime-tested in a browser here (syntax-checked only). Test the flow after upload.
- Version 7.5; local preview port: use 8085 (next after v7.4 convention; skip if occupied).

## v7.6 additions
- **Plan edit** (✏️ on each plan): `saveEditedPlan()` updates the plan, KEEPS paid installments, regenerates pending ones (remaining amount split evenly; last absorbs rounding). Blocks if installments < paid count or total <= already paid.
- **Card due-date alerts** added to `scheduleDueNotifs()` (day-before + due-day 09:00, next 3 months, respects `reminder_enabled`), native app only.
- **No Firebase/external services** (decision 29 Sep 2026). Notification stack = DB trigger -> `bill_notifications` (Realtime) + Web Push via existing `send-push` Edge Function + cron `daily-push-reminders` + OS-scheduled local notifications in the Capacitor app. Limit: a killed native app is NOT woken by remote events from other users (needs FCM/APNs); it still gets all scheduled due alerts and catches up on open.

## Full SQL rebuild files
- `SquadSplit_FULL_SCHEMA_no_data_v7.8.sql` — extensions, sequences, 20 tables, constraints, FKs, indexes, 18 functions, 2 views, 10 triggers, RLS + 39 policies, storage bucket + 4 storage policies, realtime, cron.
- `SquadSplit_FULL_SCHEMA_with_data_v7.8.sql` — same + all rows (triggers created AFTER data load so no fake notifications). Tested on a clean local Postgres 16 with Supabase stubs: both run with zero errors; row counts match live (users 9, bill_expenses 69, card_payments 30, expenses 45, notifications 9).
- Placeholders to fill: `__PUSH_SECRET__` (2 places: `dispatch_push_for_notification`, cron job) and the project ref in the send-push URL.
- Not in SQL: `auth.users` (logins/passwords), Edge Function `send-push` code + its secrets (VAPID keys), `bill_push_subscriptions` rows.
- Rebuild order on a new project: run SQL -> deploy send-push function -> set secrets -> replace placeholders -> update SUPABASE_URL/anon key in both HTML files -> users sign up with the SAME emails (app_users matches by email).
- Local preview port: 8086.

## v7.7 additions (30 Sep 2026)
1. **Header**: ☰ drawer (left) = Modules (Bill Tracker, Expense Tracker, Plans, Squad Splitter link), Theme, Admin, Log out. Right: 🔔 notifications, 🔀 Switch, me-pill. No scrolling/overlap; ids kept (`btn-switch-account`, `link-to-squad`, `btn-open-admin`). index.html (Squad Splitter) still has the v7.5 scrolling header, NOT the drawer.
2. **Card access**: `loadSharedWithMe()` -> `usableCards()`/`cardLabel()` feed Add-expense (`add-card`) and Plan card pickers (own + cards shared with me, labelled with owner). Share modal uses a dropdown of registered users (name + email). Party tile -> `openPartyDetail()`: ledger count/net, checkbox list of my cards to grant/revoke (writes `bill_card_shares`), list of their cards shared with me. "Preferred card" = multi-select of cards (no separate preferred flag).
3. **Plans**: accordion (`planCardHtml`, `planOpen`, `planTab`): collapsed = title only; expanded tabs Overview / Payments / Details. `payInstallment(id, full)`: pay less -> installment amount becomes paid amount, remainder carried to next pending installment (or a new installment + plan end_date extended); pay more -> later installments reduced/removed. Remaining = total - sum(paid). Math verified in node mock.
4. **Expense Tracker** (page `page-et`, drawer -> Expense Tracker): tables `et_categories`, `et_trackers` (kind period|occasion, currency, start/end, participants[] lowercase emails), `et_entries`; function `et_can()`. RLS: owner/delegate/admin, participants can read tracker and add entries (edit/delete own). Default categories in `ET_DEF` + custom per user. Filters: category chips + date range; breakdown bars; per-person totals for shared occasions; dates restricted to tracker period. Export PDF (jsPDF+autotable) and Excel (SheetJS) lazily loaded from cdnjs (needs internet); native app saves via @capacitor/filesystem + @capacitor/share (added to package.json: run `npm install && npx cap sync`).
5. **Look**: aurora background glows, blurred gradient header, floating glass bottom nav, elevated cards, gradient active states.
6. Limits: enter-paid-amount applies to EPP/Gold plans only (monthly CARD bill partial payment not built). Expense Tracker has no notifications. Not browser-tested (syntax + logic tests only). Local preview port 8087.

## v7.8 additions (1 Oct 2026)
1. **BUG FIXED (pre-existing since v7.4 upload):** the Share-access popup `#manage-shares-modal` had NO opening wrapper div in the HTML, so `openManageShares()` threw `null.classList` and "Share access" never opened. Wrapper restored (`modal-overlay` + `modal-box`, click-outside closes).
2. **Card tile = menu**: tapping a card tile opens `openCardMenu(id)`: 📊 Breakdown, 🔗 Share access, 📅 Due day, ✅ Mark paid/unpaid, plus "Who has access (N)" list (name + email + Remove) and "Share with someone". "shared with N — tap to see who" on the tile opens the same menu. Tile buttons use `stopPropagation`.
3. **Share access**: dropdown of registered users (excludes owner + already shared) AND manual email input (manual wins). Unregistered email allowed after a confirm (access applies when they sign up with that exact email). Payload: `bill_card_shares {card_id, owner_email, shared_with_email(lowercase)}`.
4. **Party detail fix** (screenshot 2 bug): parties added with no email (e.g. party_name = "farookmsd@gmail.com", party_email NULL) showed "No email" and no card options. Now every party shows a "Link this party to a person" box (dropdown pre-selected by `guessUser()` name/email match + manual email) -> `linkParty()` updates `bill_payees.party_email` (and replaces an email-looking name with the registered name). Card checkboxes ("Cards you let them use") then work for any linked email (registered or not). `addParty()` auto-links when the name is an email or exactly matches a registered user. "Cards they let you use" now reads `sharedWithMeCards` (was wrongly showing all cards for admins).
5. **Plans**: card picker refreshes when a party is chosen (`plRefreshCards`) and adds an optgroup with that party's cards.
6. **Squad Splitter (index.html) header**: ☰ drawer (Modules: Squad Splitter / Bill Tracker / Expense Tracker, Settings: Theme link, Admin, Log out), right side 🔔 bell with unread badge + panel (reads `bill_notifications`, polls 30s, mark read / mark all) then the me pill. No Switch button there (Squad Splitter has no account switching). Deep links `bill-tracker.html#et` and `#theme` supported.
7. **Layout**: pages max 1020px centered on desktop, cards grid auto-fills, bottom nav centered (max 780px), `html/body overflow-x:hidden`.
8. **Testing done**: jsdom walkthrough with mocked Supabase (both pages boot, no runtime errors): card menu, share dropdown + manual payloads, party link/share payloads, plan card picker, expense tracker open/create modal, drawer, bell badge/panel, `#et`/`#theme` deep links. NOT tested on a real device/browser or against live Supabase data.
9. No DB change in v7.8 (SQL files re-versioned only). Local preview port 8088.

