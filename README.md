# BentaLog

Sales recording and monitoring for small shops. Owners and staff sign in with email or Google (Firebase Authentication); all data lives in Cloud Firestore and syncs live between devices.

## 1. Set up Firebase (once)

1. Create a free project at [console.firebase.google.com](https://console.firebase.google.com). Google Analytics is optional.
2. **Build → Authentication → Get started → Sign-in method**:
   - Turn on **Email/Password**.
   - Turn on **Google**, pick a support email, and save. Firebase creates the Google sign-in client for you, so there's nothing to set up in Google Cloud.
3. **Authentication → Settings → Authorized domains**: `localhost` is there already. Add your real address later (e.g. `yourshop.netlify.app`).
4. **Build → Firestore Database → Create database**. Pick a location near your users and start in **production mode**.
5. **Firestore → Rules**: replace everything with [firebase/firestore.rules](firebase/firestore.rules) and click **Publish**.
6. **Firestore → Indexes → Single field → Add exemption**: collection ID `members`, field path `uid`, tick **Collection group** (ascending), save.
   The app uses it to find which shops a person belongs to. Until it's built (a minute or two) the app shows "The database is missing an index".

   Steps 5 and 6 can be done in one go with the [Firebase CLI](https://firebase.google.com/docs/cli): `firebase login`, `firebase use --add`, then `firebase deploy --only firestore`.
7. **Project settings (gear icon) → General → Your apps → Web (`</>`)**: register an app (no hosting needed), then copy the `firebaseConfig` values.
8. Copy [js/config.example.js](js/config.example.js) to `js/config.js` (if it isn't there yet) and paste those values into `firebase: {…}`.

   These values only identify your project and are fine to load in the browser. The security rules protect the data. `js/config.js` is git-ignored anyway.

## 2. Run it

The app must be opened through a web address, not by double-clicking `index.html`, because sign-in needs one.

- **VS Code**: install the *Live Server* extension, right-click `index.html`, and choose **Open with Live Server**. It runs at `http://localhost:5500`.
- **Or** in a terminal in this folder: `npm start`, then open `http://localhost:5500`.

To put it online, upload the folder to any static host (Firebase Hosting, Netlify, Vercel, GitHub Pages, Cloudflare Pages), then add that domain under **Authentication → Settings → Authorized domains**.

## How people get in

- **Owner**: create an account, then **Set up a new shop**. You become its owner, with one business tab and four payment methods (Cash, E-wallet, Card, Pay later).
- **Staff**: create an account (or use Google), then **Join a shop** with the owner's 6-character invite code. Opening the owner's invite link fills the code in. The owner approves them under **Users**.
- Owners can change roles, deactivate or remove people, and make a new invite code. Staff can sell and view reports; only owners can void sales, save closings, or change products, businesses, settings and users. The Firestore security rules enforce this, not just the screens.

## Managing users

- **In the app** (owners): **Users** shows join requests, roles and access for your shop.
- **In Firebase**: **Authentication → Users** lists every account and lets you disable or delete one, or send a password reset.
  **Firestore → Data** shows each person's profile under `users/{uid}` and their shop access under `workspaces/{shop}/members/{uid}`.
- Forgot password: the app sends Firebase's reset email; the link opens a Firebase page where the new password is set.

## Moving data from the old version

The earlier single-file app is in [legacy/BentaLog.html](legacy/BentaLog.html). It saved everything in the browser.

1. Open it in the same browser you used before, and sign in.
2. Go to **Settings → Download backup**.
3. In the new app, as an owner, go to **Settings → Restore from backup** and pick that file.

Businesses, payment methods, products, sales and closings are added to your shop. Anything that already exists is skipped, so restoring twice does no harm.

## Project layout

```
index.html              page shell; loads Firebase and the scripts below in order
css/styles.css          all styles
js/config.js            your Firebase web app config (git-ignored; copy from config.example.js)
js/core/
  constants.js          fixed lists: payment types, units, number formats, roles
  utils.js              money/date/number formatting, toast, error messages, attempt()
  state.js              db (loaded shop data), me (signed-in user), state (screen state), selectors
js/data/
  api.js                every Firebase call (sign-in, Firestore reads/writes, transactions, live updates)
  sample.js             sample sales, backup download and restore
js/features/            one file per screen: its view and its actions
  auth.js  onboarding.js  sell.js  dashboard.js  history.js  close.js
  products.js  users.js  settings.js  account.js
js/app/
  render.js             draws the current screen
  events.js             ACTIONS table: data-act="name" on a button -> the function that runs
  main.js               startup, sign-in/out flow, opening a shop, live updates
firebase/
  firestore.rules       who can read and write what
  firestore.indexes.json  the members.uid collection-group index
firebase.json           lets the Firebase CLI deploy the two files above
legacy/BentaLog.html    the old browser-only version (for exporting old data)
```

## Data layout (Firestore)

```
users/{uid}                     name, email, avatar, provider, lastLogin
joinCodes/{code}                workspaceId, name
workspaces/{shop}               name, settings, joinCode, createdBy
  members/{uid}                 uid, role, status, name, email, avatar, lastSeen
  stores/{id}                   name, prefix, seq (last receipt number)
  methods/{id}                  name, kind, active
  products/{id}                 storeId, name, category, sku, price, unit, step, stock, active
  sales/{receiptNo}             storeId, ts, items, total, methodId, …, unpaid
  closings/{storeId_day}        storeId, day, expected, counted, diff
```

## Debugging tips

- **What does this button do?** Find its `data-act` value in [js/app/events.js](js/app/events.js). The `ACTIONS` table names the function it runs.
- **What's loaded?** In the browser DevTools console, type `db`, `me` or `state`.
- **A save failed?** The error shows on screen in plain words, and the full error is in the console (`console.error`).
- **"You don't have permission"** means the rules refused the write: the user isn't an active member or owner of that shop, or the rules weren't published. Try the request in **Firestore → Rules → Rules Playground**.
- **Receipt numbers and stock** are handled in one Firestore transaction (`recordSale` and `voidSale` in [js/data/api.js](js/data/api.js)), so two phones can't use the same receipt number or sell stock that isn't there. Recording a sale needs an internet connection.
- **Sales loaded at start**: the last 180 days (`salesDays` in [js/config.js](js/config.js)) plus all unpaid pay-later sales. Older days load when you pick them in Transaction history.
