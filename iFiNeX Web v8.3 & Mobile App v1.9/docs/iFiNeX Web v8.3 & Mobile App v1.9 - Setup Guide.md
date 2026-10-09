# iFiNeX Web v8.3 & Mobile App v1.9 — SETUP & USER GUIDE  (2026-10-08)

Written so that a person who has never done this before can follow it. Do the steps **in order**. Each step says what you will SEE when it worked.

## STATUS — read first
### ✅ Already done for you on your LIVE Supabase project (nothing to run)
- The Budget & Salary Planner tables, the Trip tracker type, the background-photo settings columns and the safe bulk-import function were **already applied** to your live database on 2026-10-08 and tested. You do **not** have to run any SQL for the app to work.
- The SQL files are only for backup / for building a copy of the database (Part 6).
### ⏳ What is LEFT for you
1. Upload the new website files to GitHub (Part 1).
2. Build and install the new Android app v1.9 (Part 2) — **this is what fixes "login every time" and the app side of everything else.**
3. Check the new features (Part 4).

---

## PART 1 — Put the new website on GitHub (10 minutes)
1. Unzip **`iFiNeX Web v8.3 - Website files (upload to GitHub).zip`** on your computer. You will see: `index.html`, `bill-tracker.html`, several `ifinex-*.js` files, `sw.js`, `manifest.webmanifest`, and two folders **`assets`** and **`vendor`**.
2. Open `https://github.com/SquadSplit/Squadsplit.github.io` and sign in.
3. Click **Add file → Upload files**.
4. Select **everything inside the unzipped folder** (all files **and both folders**) and drag them into the page. ⚠️ The `vendor` folder is new and is **required** — without it Excel/PDF and login will not work.
5. Scroll down, write `v8.3` in the box, press **Commit changes**.
6. Wait 2 minutes. Open `https://squadsplit.github.io/bill-tracker.html` and press **Ctrl+Shift+R** (phone: close the tab and reopen).
✅ You should see: the new iFiNeX logo with the small mark after the name, and after login the **Hub** with 8 picture tiles.
❌ If the page is blank: the `vendor` folder was not uploaded — upload it again.

## PART 2 — Android app v1.9 (45 minutes the first time)
You need a Windows/Mac computer with **Node.js (LTS)** and **Android Studio** (same as when you built v1.8). If you built before, skip the installs.
1. Unzip **`iFiNeX Web v8.3 & Mobile App v1.9 - Complete Project.zip`**. Open the `mobile` folder.
2. Open a terminal **inside the `mobile` folder** (Windows: click the folder address bar, type `cmd`, Enter).
3. Type this and press Enter (downloads the new storage plug-in — this is the "stay logged in" part):
   `npm install`
4. Type: `npx cap sync`  → you should see "Sync finished".
5. Type: `npx cap open android` → Android Studio opens. Wait until the bottom bar stops moving (first time can take 10 minutes).
6. Menu **Build → Build Bundle(s)/APK(s) → Build APK(s)**. When "APK(s) generated" appears click **locate**.
7. Send `app-debug.apk` to your phone (USB cable / Drive) and open it. If Android asks, allow "install unknown apps". **It installs over the old app and keeps nothing to re-enter except one last login.**
8. Open the app, log in **once**. Close the app completely (swipe it away), wait a minute, open again.
✅ You go straight into the app — **no login screen**. You only see login again after you press **Log out** (menu ☰ → Log out) or clear the app's data.
ℹ️ To confirm you have the new build: open ☰ and look at the bottom: **"iFiNeX web v8.3 · app v1.9"**.
ℹ️ No internet when opening? You will see "Can't reach the server – You are still signed in – Try again". That is normal and does **not** log you out.

## PART 3 — Alerts & notifications on the phone
1. ☰ → **Alerts & notifications**. You should see rows: Notification permission, Background alerts, Battery setting, Last check — as normal text and small buttons.
2. If you see strange text like `<div style=...` the phone still has the OLD app → repeat Part 2.
3. Tap **Allow** if shown, **Turn on** for background alerts, **Fix** for battery → choose **Unrestricted**.
4. Tap **Test on this phone**. A notification should appear.

## PART 4 — How to use each new thing

### 4.1 The Hub (new home screen)
After login you land on the Hub: Bill Tracker · General Expense Tracker · Squad Split (squad members only) · Shared Card Payment · Budgeting Tools · Event Expense Tracker · Trip Expense Tracker · EPP & Gold Plans. Tap a picture to open it. Tap the logo in the top bar any time to come back to the Hub.

### 4.2 Tick-boxes and totals
Every list row (bills, owed, history, party entries, cards, plans, trackers, tracker entries, budget lines, income, goals, Squad Split expenses…) has a small ☐ box. Tick 3 titles → a blue bar appears above the menu: **"3 selected · Total AED 345.31"**. Buttons: **Select all** (everything visible), **Excel** / **PDF** (export only the ticked rows), **✕ Clear**. Changing page or month clears the ticks.
Different currencies are never mixed: you see "AED 100 + USD 20".

### 4.3 Excel & PDF — template, export, import (every module)
Open it from: ☰ → **⇅ Import / Export**, or the **⇅ Import / Export** button on the Expense Tracker and Budget pages, or the **⇅ Excel** button at the bottom of Squad Split.
1. Choose the **data set** from the list (Bills, Cards, Plans, Party, Expense trackers, Tracker entries, Budget income / lines / goals…).
2. **📥 Blank template** → an Excel file with sheets *Data* (empty, fill this), *Example*, *Instructions*, *Lists* (allowed values).
3. Fill the *Data* sheet. Dates like `2026-10-07` or `07/10/2026`. Amounts as plain numbers. Required columns have `*`.
4. Press **Choose file**, select your Excel. A **preview** shows ✅ ready, ❌ errors (with the row number and why), ⏭️ already exists (skipped).
5. Press **Import N rows**. Bad rows are never imported.
**📊 Export Excel** / **📄 Export PDF** save everything of that data set with a TOTAL row.
On the phone the file opens the Android **Share** sheet (save to Drive/Files/WhatsApp).
Rules: Tracker entries need the **tracker title to match exactly** an existing tracker and the date inside its period. Party names that do not exist are created automatically. Cards must exist before bills can use them. Settlements are export-only (use "Settle up" so the history stays correct). Up to 2000 rows per import (30 for plans).
Importing many bills does **not** spam your delegate: they get one summary message.

### 4.4 Budget & Salary Planner (Hub → Budgeting Tools)
Top: month arrows. Four tabs:
- **💼 Salary** — add income (salary, bonus…). **Copy last month** repeats it. Under it the **Salary split calculator**: type percentages for Needs / Wants / Savings / Debt (default 50/30/20/0, must total 100) and press **Create budget lines** — it fills the Budget tab for you (you can edit every line).
- **🎯 Budget** — each line shows *spent / planned* with a bar. "Spent" fills in **by itself** from your Expense Tracker entries and bills of that month **when the category name matches** (e.g. a line called *Groceries* collects everything you log as Groceries). Red = over budget. ✏️ edit, ✕ delete, **Copy last month**.
- **📊 Overview** — income, planned, spent, left, savings rate, planned money by group, over-budget list, and EPP/Gold installments due this month.
- **🏆 Goals** — savings goals with target, saved so far, date and "save X per month" hint. **+ Add money** adds to the saved amount.

### 4.5 Expense Tracker: Monthly, Events, Trips
Tabs **📆 Monthly · 🎟️ Events · ✈️ Trips**. Events/Trips can be shared with other registered users. Old "Occasions" are now called Events (nothing lost).

### 4.6 Theme & background photo (☰ → Theme & background)
1. Pick a theme, then **Choose file** to add your own photo.
2. In the preview box **drag the photo** to choose which part shows. Sliders: **Size** (zoom), **Left↔Right**, **Up↕Down**, **Opacity**. Buttons: **Fill screen**, **Fit whole photo**, **Reset**.
3. Best photo: **phone portrait 1080 × 2340 px (ratio 9 : 19.5)**; desktop **1920 × 1080 (16 : 9)**; JPG/WebP **under 1 MB**. Put the important part in the middle. Opacity 25–40% keeps text readable. Big photos are shrunk automatically.
Settings save by themselves and apply on all your devices, including Squad Split.

---

## PART 5 — Final checklist (tick each)
- [ ] Website shows new logo and Hub  - [ ] Phone drawer says "app v1.9"  - [ ] Close + reopen app: no login  - [ ] Tick 3 bills: total bar  - [ ] Template download works  - [ ] Import a 2-row test Excel  - [ ] Budget: add salary → create lines  - [ ] Change background and drag it  - [ ] Alerts screen looks normal, "Test on this phone" works

## PART 6 — Database files (only for backup / a new copy)
In `sql/`: **FULL (no data)** = empty database, v1 → v8.3 in one go. **FULL (with data)** = same + the data snapshot taken for v8.1 (older than today's live data). **UPGRADE** = only the v8.3 additions (already applied; safe to re-run). **Emergency Rollback** = removes v8.3 additions (deletes planner data!).
How to run: Supabase dashboard → **SQL Editor → New query** → paste the whole file → **Run**. For a brand-new project use FULL, then follow Part 11 of the older guide below (Auth settings, storage bucket `user-backgrounds`).
For a fresh copy of today's data use the Supabase CLI: `supabase db dump --data-only -f data.sql`.

## PART 7 — Troubleshooting v8.3
| You see | Do this |
|---|---|
| Login form every time on the phone | You are on the old APK. Rebuild/install v1.9 (Part 2) and confirm the footer text. Also: Android Settings → Apps → iFiNeX → Storage → do **not** press "Clear data". |
| "Can't reach the server" | No internet / Supabase paused. Press Try again. You are still logged in. |
| Excel/PDF buttons do nothing | `vendor` folder missing on GitHub (web) — upload it. |
| Import says "Tracker not found" | Tracker title must match exactly; check the *Lists* sheet in the template. |
| Import says "Card does not exist" | Add the card under Cards first, or leave the Card cell empty. |
| Budget "Spent" is 0 | The budget line name must equal the category name (Groceries = Groceries). |
| Photo looks blurry | Use a bigger photo (1080 px on the short side). |
| PDF shows boxes instead of Arabic letters | Use the Excel export for Arabic text. |

## PART 8 — Naming and Claude memory
Every release is named `iFiNeX Web vX.Y & Mobile App vA.B`, preview port increments (this release **8093**; next **8094**). Give Claude the file **"… - Claude Reference.md"** at the start of a new chat.

---
# (older guide, kept for reference — Parts 0–12 of v8.2)
Complete, step by step, written for a non-technical person. Do the parts **in order**. Every step says what you should SEE when it worked. If anything looks different, stop and send me the exact text on the screen (or a screenshot).

## STATUS — updated 2026-10-04 (read this first)
### ✅ Already done by Claude on your LIVE Supabase project — nothing for you to run
| # | What was done | Proof |
|---|---|---|
| 1 | In-database safety copy of all 23 tables (284 rows) into a private schema `backup_20261003` | 23 tables / 284 rows copied |
| 2 | Pre-flight check for planted admins / script text / strange data | none found (2 admins and 1 roster admin all look like your own addresses; all tracker currencies are AED) |
| 3 | Applied the migrations `ifinex_v8_0_device_alerts`, `ifinex_v8_1_security_hardening`, `ifinex_v8_1b_views_invoker_and_function_grants` | success; visible in Supabase → Database → Migrations |
| 4 | Tested with simulated users on your REAL data | logged-out: denied everywhere · unregistered account: sees 0 rows · squad member (Naina): sees all 45 expenses, 11 settlements, 7 carry-forwards, 5 roster, not admin · general user (Farook): no squad data, own bills intact · admin (Khan): sees every row |
| 5 | Supabase security linter | no more "Allow all" or always-true policies; I also fixed the 2 SECURITY DEFINER views and the logged-out-callable delete functions |
| 6 | Edge Functions read and audited | `send-report` is a retired stub (always HTTP 410, sends nothing); `send-push` rejects every request without the secret → both safe, unchanged |
| 7 | Clone scripts certified | `Database FULL (no data)`: 95/95 structure fingerprints identical to live · `Database FULL (with data)`: regenerated from live at **2026-10-04 19:12 UTC**, 22/22 tables identical (your old file was missing your plans, trackers and card shares) |

### ⏳ What is LEFT for you (I have no GitHub, phone or Auth-settings access)
0. **HOTFIX v8.2 / v1.8 (you reported it):** the Alerts screen (and the Reports screen) showed raw HTML tags. Upload the new website files (Part 6) **and rebuild + reinstall the APK (Part 7)** — the app carries its own copy of the pages. The database needs nothing.
1. **Upload the website to GitHub NOW (Part 6, 5 minutes).** Until you do, the OLD website talks to the locked database: people who are already logged in are fine, but a *fresh* Squad Split login (new e-mail code) can show "not linked" and "Delete party" fails. Bill Tracker is not affected.
2. Supabase dashboard → Authentication: OTP expiry ≤ 600 s and rate limits (Part 5A). Optional: switch sign-ups off (Part 5B) — first create `niyazmohazzz@gmail.com` and `shaha758@gmail.com` in Authentication → Users (they have never logged in).
3. Two login accounts exist that are not registered in iFiNeX: `abdullah.be@yahoo.com` and `abdullahbinjinnah.hr@gmail.com`. They now see nothing. If they are not yours: Authentication → Users → delete.
4. Build + install the Android app (Part 7), switch alerts on (Part 8).
5. Tick the acceptance checklist (Part 9).

### Remaining linter notes (intentional, no action)
`bill_devices` has no policies on purpose (only the alert functions touch it) · the phone-alert function is callable without login by design (the per-phone secret is the credential) · signed-in helper functions only answer about the caller.

*Parts 1–4 below are kept as reference (for a clone or disaster recovery) — skip them for your live project.*

## PART 0 — What you have, and the 10-step checklist
| Step | What | Time |
|---|---|---|
| 1 | Safety copy of your data (Part 1) | 1 min |
| 2 | Look for anything suspicious already planted (Part 2) | 5 min |
| 3 | Run the ONE upgrade SQL on your live Supabase (Part 3) | 3 min |
| 4 | Verify the lock-down worked (Part 3) | 2 min |
| 5 | Supabase dashboard security settings (Part 5) | 10 min |
| 6 | Upload the website files to GitHub (Part 6) | 5 min |
| 7 | Test the website (Part 6 + Part 9) | 10 min |
| 8 | Build + install the Android app (Part 7) | 45 min first time |
| 9 | Switch background alerts on (Part 8) | 3 min |
| 10 | Final acceptance checklist (Part 9) | 10 min |

**Your files (all in the download):**
| File | What it is | Where it goes |
|---|---|---|
| `index.html`, `bill-tracker.html`, `sw.js`, `ifinex-alerts.js`, `manifest.webmanifest`, folder `assets` | The website (Squad Split, Bill Tracker, notifications, logo). Also inside the zip `... Website files (upload to GitHub).zip` | GitHub (Part 6) |
| `... Database UPGRADE (run once on live).sql` | The ONLY SQL you run on your existing Supabase | Supabase SQL Editor (Part 3) |
| `... Database FULL (no data).sql` / `(with data).sql` | Complete database from the beginning until now, to build a NEW copy. The "with data" file contains real e-mails and money — **never put it on GitHub** | Only for a new Supabase project (Part 11) |
| `... Database Emergency Rollback.sql` | Undo button for the lock-down — only if the app is locked out | Part 4 |
| `... Complete Project.zip` | Everything: website, Android/iOS project, SQL, docs, brand files, tests | Keep as your archive; `mobile` folder is used in Part 7 |
| `... Claude Reference.md` | Memory file for Claude. Give it to Claude at the start of every new chat | — |

> **File names:** `index.html`, `bill-tracker.html` and `sw.js` MUST keep exactly these names (the website looks for them). The version is in the zip/folder name and on the login screen (v8.1).

## PART 1 — Safety copy — ✅ ALREADY DONE (skip)
1. Open https://supabase.com → sign in → open your project → left menu **SQL Editor** → **New query**.
2. Paste this, click **Run**. You should see *Success*. It copies every table into a separate area called `backup_20261003`; nothing is changed.
```sql
do $$ declare t text; begin
  create schema if not exists backup_20261003;
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('create table if not exists backup_20261003.%I as table public.%I', t, t);
  end loop;
end $$;
```
(To restore a table later: `insert into public.<table> select * from backup_20261003.<table>;` — ask me and I will do it with you.)

## PART 2 — Look for anything suspicious — ✅ ALREADY DONE (skip)
Until now anyone on the internet could write to your squad tables and sign themselves up. Check that nobody did. New query → paste → Run → read each result.
```sql
-- A) Everybody listed here must be a person you know. Anyone with is_admin = true you do not recognise: DELETE that row.
select id, name, email, is_admin from members_config order by sort_order;
select email, name, is_admin, group_type, delegate_email, created_at from app_users order by created_at;

-- B) Accounts that signed up but are NOT registered in iFiNeX (strangers). Delete each one in
--    Supabase → Authentication → Users (three dots → Delete user). After the upgrade they can see nothing anyway.
select u.email, u.created_at from auth.users u
 where not exists (select 1 from app_users a where lower(a.email)=lower(u.email) or lower(coalesce(a.delegate_email,''))=lower(u.email))
 order by u.created_at desc;

-- C) Trackers with strange characters in the currency (an attack attempt). Normally this returns 0 rows.
select id, user_email, currency from et_trackers where currency ~ '[<>"''&]';

-- D) How many squad rows exist (compare with what you expect)
select (select count(*) from expenses) as expenses, (select count(*) from settlements) as settlements, (select count(*) from prev_balances) as carry_forwards;
```
If you see anything you do not understand, **do not delete — send me the result**.

## PART 3 — Run the upgrade and verify — ✅ ALREADY DONE (skip)
1. Unzip the download. Open the file **`... Database UPGRADE (run once on live).sql`** with Notepad (right-click → Open with → Notepad). Press **Ctrl+A**, **Ctrl+C**.
2. Supabase → **SQL Editor** → **New query** → **Ctrl+V** → **Run**. You should see *Success* (a job number may appear). It is safe to run twice. It works whether you are on v7.8 or v8.0.
3. **Verify** — new query, paste, Run:
```sql
select 'logged-out visitors can read squad expenses: ' || has_table_privilege('anon','public.expenses','select') as check_1;   -- must say false
select count(*) as security_policies from pg_policies where schemaname='public' and policyname in ('ifx_registered_gate','squad_expenses_select');  -- must say 24
select string_agg(proname, ', ' order by proname) as new_functions from pg_proc
 where proname in ('is_registered','is_squad_member','is_squad_admin','delete_payee_with_reason','register_device','unregister_device','poll_notifications');  -- must list all 7
```
Expected: `false`, `24`, and 7 function names. Anything else → Part 10.
4. **Right away** open the app (website) as admin and as a normal member and do the first four checks of Part 9. If the app is locked out and you cannot fix it in a few minutes, use Part 4.

## PART 4 — Emergency rollback (only if locked out)
Run **`... Database Emergency Rollback.sql`** the same way as Part 3 (paste → Run). It puts back the OLD rules (which are insecure) so the app works again. Then send me what failed; run the UPGRADE file again once fixed. Rolling back keeps the alerts and the new "delete party" function.

## PART 5 — Supabase dashboard security settings (10 minutes)
Menu names move around a little between Supabase versions — look for the same words.
**A. Login limits (recommended).** Authentication → **Sign In / Providers** → *Email*: set **OTP expiry** to 600 seconds or less. Authentication → **Rate Limits**: keep e-mail sending low (for example 5–10 per hour) so nobody can spam your e-mail quota.
**B. Close sign-up completely (optional, strongest).** The database already blocks strangers (they see nothing). If you also want strangers unable to create accounts at all: Authentication → **Sign In / Providers** → switch **Allow new users to sign up** OFF. From then on, for every NEW person: (1) Authentication → **Users → Add user** (their e-mail), then (2) add them in the app under Admin → Users. People already added in the app but who have **never logged in** must also be created in Authentication → Users first — find them with:
```sql
select a.email from app_users a left join auth.users u on lower(u.email)=lower(a.email) where u.id is null;
```
**C/D. Edge Functions — ✅ already audited by Claude** (details in the status table above). Nothing to do.

## PART 6 — Upload the website to GitHub (5 minutes) and test
1. Unzip **`iFiNeX Web v8.2 - Website files (upload to GitHub).zip`** into a folder. Open it: you should see `index.html`, `bill-tracker.html`, `sw.js`, `ifinex-alerts.js`, `manifest.webmanifest` and a folder `assets`.
2. Go to https://github.com/SquadSplit/Squadsplit.github.io → sign in.
3. **Add file ▸ Upload files** → select **everything inside that folder** (all 5 files and the `assets` folder) and drop them on the page. Do **not** drop the folder itself and do **not** upload anything from the `sql` or `mobile` folders.
4. In the box write `iFiNeX v8.1` → **Commit changes**.
5. Wait 2 minutes. Open https://squadsplit.github.io and press **Ctrl+Shift+R**. You should see the iFiNeX logo and the text *v8.2* on the login screen.
6. Phone browsers: close the tab and reopen (or clear site data) so the old version is dropped.

## PART 7 — Build and install the Android app (45 minutes the first time)
Install once: **Node.js LTS** (nodejs.org) and **Android Studio** (developer.android.com/studio — accept all defaults; it brings its own Java 17).
1. Unzip **`... Complete Project.zip`**. Open the folder **mobile**.
2. Click the folder's address bar, type `cmd`, press Enter (a black window opens in that folder).
3. Type `npm install` → Enter. Wait until it stops (1–2 minutes).
4. Type `npx cap sync android` → Enter. You should see *Sync finished*.
5. Type `npx cap open android` → Enter. Android Studio opens. Wait until the bottom bar stops saying *Gradle … running* (several minutes the first time; accept any "update" prompts with **Don't remind me** unless it says an SDK is missing — then click **Install**).
6. Menu **Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)**. When *APK(s) generated successfully* appears click **locate**.
7. Copy `app-debug.apk` to the phone (USB cable, Google Drive, or WhatsApp to yourself) → tap it → **Install** (allow "install unknown apps" if asked).
   * *"App not installed"* → uninstall the old SquadSplit app first (your data is safe in Supabase) and install again.
8. The app is named **iFiNeX** with the new logo. (Version 1.8 — Android setting: App info shows 1.8.0.)
**iPhone:** needs a Mac with Xcode (`npx cap open ios`) and an Apple developer account; I have not built it. iPhones get due-date reminders and live pop-ups, **not** background alerts (Apple only allows that through its own paid push service).

## PART 8 — Switch background alerts on (3 minutes, in the app)
1. Open iFiNeX → log in with the e-mail code → tap **Allow** when Android asks about notifications.
2. ☰ menu → **🔔 Alerts & notifications**.
3. **Test on this phone** → a banner appears at the top with the iFiNeX icon. ✅
4. **Background alerts → Turn on** → shows ✅ ON.
5. **Battery setting → Fix → Allow** → shows ✅ Unrestricted.
6. **Test via server** → toast *Server → phone works ✅*.
7. Real test: swipe the app away completely; from another phone/browser do something that notifies you (a friend adds an expense with you, an admin edits your entry). The notification should arrive within about **2 minutes**.
If alerts are late — Xiaomi/Redmi/Poco: Settings ▸ Apps ▸ iFiNeX ▸ **Autostart ON**, Battery saver ▸ **No restrictions**. Oppo/Realme/OnePlus: App info ▸ Battery ▸ **Allow background activity**, **Auto launch ON**. Vivo/iQOO: Battery ▸ Background power consumption ▸ **Allow**. Samsung: Battery ▸ Background usage limits ▸ **Never sleeping apps ▸ add iFiNeX**. Huawei/Honor: App launch ▸ iFiNeX ▸ **Manage manually**, allow all. More: dontkillmyapp.com.

## PART 9 — Final acceptance checklist (tick each)
| # | Do this | You should see |
|---|---|---|
| 1 | Website login as **admin** → Squad Split → add an expense, edit it, delete it | all three work |
| 2 | Login as a **normal squad member** → add an expense | works; there are no edit/delete buttons for others' items |
| 3 | Login as a **general (non-squad) user** → Bill Tracker | works; Squad Split shows nothing |
| 4 | Admin → Users → add a test user, remove it | works |
| 5 | Phone: Bill Tracker → Plans → open a plan → Payments | the table swipes sideways, Pay buttons reachable, header stays on top while scrolling |
| 6 | Party ledger → delete a party | it asks for a **reason**; the entries appear in *Deleted history*; the other person gets a notification |
| 7 | Alerts screen → Test on this phone | banner + sound |
| 8 | Alerts screen → Test via server | *Server → phone works ✅* |
| 9 | Close the app, trigger a change from another account | notification within ~2 minutes |
| 10 | Part 3 verify SQL | `false`, `24`, 7 functions |

## PART 10 — Troubleshooting
| You see | Do this |
|---|---|
| Squad Split empty / "new row violates row-level security" after the upgrade | Your user is not in the Squad group. Run `select email, group_type, is_admin from app_users where lower(email)=lower('YOUR@EMAIL');` — `group_type` must be `squad_split` (or you must be admin). Fix in the app: Admin → Users → Edit → Group = Squad Split |
| "Could not remove: function … delete_payee_with_reason does not exist" | The UPGRADE SQL (Part 3) was not run on this project |
| "Could not turn background alerts on … function does not exist" | Same — run the UPGRADE SQL |
| Notifications "blocked" | In the Alerts screen press **Allow** — it opens Android's settings |
| Test on this phone works, nothing arrives when the app is closed | Battery ▸ Fix, then the brand settings in Part 8; check **Last check** shows a recent time |
| **Last check** shows red text | Send me the exact text (HTTP 404 = UPGRADE SQL missing) |
| Old look / old behaviour on the website | Ctrl+Shift+R; on phone clear site data; check the login screen says v8.1 |
| "App not installed" | Uninstall the old app first (Part 7 step 7) |
| Alerts stopped after a cleaner app / force stop | Open iFiNeX once — it re-arms itself |

## PART 11 — Building a brand-new Supabase project (clone)
1. New Supabase project → SQL Editor → open **`... Database FULL (no data).sql`** (or **(with data)** to copy everything) → find the text `__PUSH_SECRET__` and replace it with your own long random secret → Run.
2. Deploy the Edge Functions `send-push` and `send-report` (with the same secret) and set their secrets in the dashboard.
3. In **both** `index.html` and `bill-tracker.html` replace the Supabase URL and anon key at the top of the script (search `SUPABASE_URL`), and in `capacitor.config.ts`/Android nothing else changes.
4. Authentication → URL Configuration: Site URL = your GitHub Pages address.
5. Add yourself as the first admin: SQL Editor → `insert into app_users(email,name,is_admin,group_type) values ('you@email','Your name',true,'squad_split');` and `insert into members_config(id,name,email,is_admin,sort_order) values ('you','Your name','you@email',true,0);`

## PART 12 — Naming and Claude memory
Claude's memory is switched OFF in your account, so I cannot save anything to it from chat. Open the **Claude Reference** file, section 0 — it holds the new project name, the file-naming rule and a 5-line block you can paste once into Settings → Profile so every chat knows "iFiNeX". Give the Claude Reference file to Claude at the start of every new session.
