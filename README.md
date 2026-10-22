# BentaLog

Sales recording and monitoring for small shops. Owners and staff sign in with email or Google; all data lives in Supabase and syncs live between devices.

## 1. Set up Supabase (once)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste all of [supabase/schema.sql](supabase/schema.sql), and click **Run**.
   It creates the tables, the security rules (row-level security) and the server functions. Running it again is safe.
3. Open **Project Settings → API** and copy:
   - **Project URL** → `supabaseUrl` in [js/config.js](js/config.js)
   - **anon public** key → `supabaseAnonKey` in [js/config.js](js/config.js)

   The anon key is meant to be public. Never put the `service_role` key in the app.
4. Open **Authentication → URL Configuration**:
   - **Site URL**: where the app runs, e.g. `http://localhost:5500` while testing.
   - **Redirect URLs**: add `http://localhost:5500/**`, plus your real address later (e.g. `https://yourshop.netlify.app/**`).
5. Optional: **Authentication → Providers → Email**. "Confirm email" is on by default, so new users must click a link before they can sign in. Turn it off while testing if you prefer.

## 2. Turn on "Continue with Google"

1. In [Google Cloud Console](https://console.cloud.google.com/), create or pick a project.
2. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name and your email, and save.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: `http://localhost:5500` (and your real address later)
   - **Authorized redirect URIs**: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`

     You'll find this exact URL in Supabase under Authentication → Providers → Google.
4. Copy the **Client ID** and **Client secret** into Supabase under **Authentication → Providers → Google**, turn it on, and save.

## 3. Run it

The app must be opened through a web address, not by double-clicking `index.html`, because Google sign-in and email links need one.

- **VS Code**: install the *Live Server* extension, right-click `index.html`, and choose **Open with Live Server**. It runs at `http://localhost:5500`.
- **Or** in a terminal in this folder: `npm start`, then open `http://localhost:5500`.

To put it online, upload the folder to any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages), then add that address to the Supabase redirect URLs and the Google origins.

## How people get in

- **Owner**: create an account, then **Set up a new shop**. You become its owner, with one business tab and four payment methods (Cash, E-wallet, Card, Pay later).
- **Staff**: create an account (or use Google), then **Join a shop** with the owner's 6-character invite code. Opening the owner's invite link fills the code in. The owner approves them under **Users**.
- Owners can change roles, deactivate or remove people, and make a new invite code. Staff can sell and view reports; only owners can void sales, save closings, or change products, businesses, settings and users. The database enforces these rules, not just the screens.

## Moving data from the old version

The earlier single-file app is in [legacy/BentaLog.html](legacy/BentaLog.html). It saved everything in the browser.

1. Open it in the same browser you used before, and sign in.
2. Go to **Settings → Download backup**.
3. In the new app, as an owner, go to **Settings → Restore from backup** and pick that file.

Businesses, payment methods, products, sales and closings are added to your shop. Anything that already exists is skipped, so restoring twice does no harm.

## Project layout

```
index.html              page shell; loads the scripts below in order
css/styles.css          all styles
js/config.js            your Supabase URL and anon key
js/core/
  constants.js          fixed lists: payment types, units, number formats, roles
  utils.js              money/date/number formatting, toast, error messages, attempt()
  state.js              db (loaded shop data), me (signed-in user), state (screen state), selectors
js/data/
  api.js                every Supabase call (auth, tables, server functions, live updates)
  sample.js             sample sales, backup download and restore
js/features/            one file per screen: its view and its actions
  auth.js  onboarding.js  sell.js  dashboard.js  history.js  close.js
  products.js  users.js  settings.js  account.js
js/app/
  render.js             draws the current screen
  events.js             ACTIONS table: data-act="name" on a button -> the function that runs
  main.js               startup, sign-in/out flow, loading a shop, live reload
supabase/schema.sql     database: tables, security rules, server functions
legacy/BentaLog.html    the old browser-only version (for exporting old data)
```

## Debugging tips

- **What does this button do?** Find its `data-act` value in [js/app/events.js](js/app/events.js). The `ACTIONS` table names the function it runs.
- **What's loaded?** In the browser DevTools console, type `db`, `me` or `state`.
- **A save failed?** The error shows on screen in plain words, and the full error is in the console (`console.error`).
- **Database side**: Supabase → **Logs** (API and Postgres) shows rejected requests. "row-level security" errors mean the user isn't an active member or owner of that shop.
- **Receipt numbers and stock** are handled by `record_sale` and `void_sale` in [supabase/schema.sql](supabase/schema.sql), so two phones can't use the same receipt number or sell stock that isn't there.
- **Sales loaded at start**: the last 180 days (`salesDays` in [js/config.js](js/config.js)) plus all unpaid pay-later sales. Older days load when you pick them in Transaction history.
