# Property Tracker

A [Frappe](https://frappeframework.com) app for tracking property and land site visits. Capture a
site's GPS location, photos, owner details and price on your phone, then move it through your buying
pipeline with visit notes, reminders, a map and side-by-side comparison.

- **Version:** 1.1.0
- **Requires:** Frappe v16 (`>=16.0.0,<17.0.0`), Python 3.14
- **License:** MIT

## Features

**Recording a site**
- GPS location captured automatically. The fix keeps improving until it's within about 15 m, shows live
  accuracy, and you can fine-tune it by dragging a pin on the map.
- Address / landmark, locality and district
- Photos (resized on the phone before upload, stored as private files)
- Length, width and road width in **feet**. If you leave Area empty, it's worked out from length × width
  in the unit you choose (sq.ft, cent, acre, ground, sq.m).
- Expected price as a total or per cent / sq.ft / acre / ground. Total, per-cent and per-sq.ft prices
  are calculated automatically.
- Owner name and phone, with one-tap **Call** and **WhatsApp**
- Source (direct owner, broker, online listing…) and broker name, phone and commission
- Photo captions, and a full-screen photo viewer (swipe, double-tap to zoom)
- **Plot boundary:** tap the corners on the satellite map, or stand at each corner and add your GPS
  position. The measured area is shown in cent / sq.ft / acre / ground, and can be used as the area.
- **Works offline:** save properties (with photos), visits, status changes, prices and reminders
  without signal. They upload by themselves when you're back online.

**Following up**
- Status pipeline: New, Visited, Shortlisted, Follow-up, Negotiating, Revisit Required, Document
  Verification, Final Discussion, Purchased, Rejected, On Hold. Every change is logged with a note.
- Visit log and a 1–5 rating
- **Price history:** the asking price is recorded automatically each time it changes, and you can add
  offers, counters, negotiated and final prices
- **Documents checklist:** EC, Patta / Chitta, FMB sketch, sale deed, parent documents, approval, tax
  receipt, EB / water and any others, each with a status (Pending / Received / Verified / Issue) and an
  attached photo or PDF
- **Team:** assign properties to agents, a **Mine** filter, and comments with **@mentions** (mentioned
  people are notified)
- Reminders with **alarms on the phone** (Android app), **push notifications** (browser / installed web
  app) and the Desk notification bell

**Finding and comparing**
- Home dashboard: counts by status, follow-ups due, average prices, properties by location
- Search by name, address, owner, phone or ID, and filter by status
- **Map** with Street (OpenStreetMap), Clean (CARTO), Satellite (Esri) and Terrain (OpenTopoMap) styles.
  Pin cards have **Directions** and Google **Street View** links, and **My location** shows where you are.
  No map API keys are needed.
- Compare 2–5 properties side by side (differences are highlighted)
- **Share card** (an image with photo, facts and price) and a printable **brochure** / PDF. Owner
  details are never included.
- Export to CSV (opens in Excel), back up as JSON and import a backup
- **Reports in Desk:** a Property Tracker workspace with number cards, charts (by status, by type, added
  per week, average price per cent by locality, site visits per week) and a weekly visits report

**Everywhere**
- Mobile-first design, light and dark themes, works on desktop too
- Install it on a phone as a home-screen app (PWA) or as an Android APK
- Account page with your profile, roles and sign-out
- All data is ordinary Frappe records, so it's also available in Desk, reports and the REST API

## Install

### On your own bench

```bash
cd ~/frappe-bench
bench get-app https://github.com/Vintrosys/Property_Tracker.git --branch main
bench --site <your-site> install-app property_tracker
bench --site <your-site> enable-scheduler      # needed for reminder notifications
bench set-config -g scheduler_tick_interval 60 # check due reminders every minute (Frappe v16 default: 4 min)
bench build --app property_tracker
```

Give users the **Property Manager** role (created on install), then open
`https://<your-site>/property-tracker`. It's also on the Frappe apps screen. System Managers have
access too.

### On Frappe Cloud

Add the app from GitHub (`Vintrosys/Property_Tracker`, branch **`main`**) to a **Frappe v16**
bench, deploy, and install it on your site. The scheduler is on by default.

### Updating

```bash
cd ~/frappe-bench/apps/property_tracker && git pull
cd ~/frappe-bench
bench --site <your-site> migrate
bench build --app property_tracker
```

Use `bench build --app property_tracker` rather than a plain `bench build`, so a build problem in
another app can't stop this one.

## Using it on a phone

The phone has to reach your Frappe site, ideally over **HTTPS**.

### Option 1: install from the browser (PWA)

Open `https://<your-site>/property-tracker` and sign in. Then:
- **Android (Chrome):** tap **⋮ → Install app** (or *Add to Home screen*).
- **iPhone (Safari):** tap **Share → Add to Home Screen** (iOS 16.4 or later for notifications).

It opens full screen with its own icon and picks up updates on its own.

### Option 2: Android APK

The [`mobile/`](mobile/) folder is a [Capacitor](https://capacitorjs.com) wrapper that opens
`/property-tracker` on your site. It adds native GPS, camera access, reminder alarms and proper
handling of the Back button.

1. On GitHub, open **Settings → Secrets and variables → Actions → Variables** and add `SITE_URL`
   (for example `https://erp.example.com`). Or enter the URL when you run the workflow.
2. Open **Actions → Build APK → Run workflow**.
3. Download the `property-tracker-apk` artifact, unzip it, copy the `.apk` to the phone and install it
   (allow installing from that source when asked).

**Signed release builds (recommended).** Without a signing key the workflow builds a debug APK, and
each debug build is signed with a different throwaway key, so a new build won't install over the old
one (you'd have to uninstall first). Create a key once and add it as repository **secrets**:

```bash
keytool -genkeypair -v -keystore property-tracker.keystore -alias property-tracker \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 property-tracker.keystore   # paste the output into ANDROID_KEYSTORE_BASE64
```

Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`
(`property-tracker`) and `ANDROID_KEY_PASSWORD`. Every build then gets a higher version number and
installs over the previous one. Keep the keystore file and passwords safe; you need the same key for
every update.

Good to know:
- The site address is built into the APK, so rebuild it if the address changes. Changes to the
  tracker itself come from the server and don't need a new APK.
- `SITE_URL` can be a local address such as `http://192.168.1.42:8000` while testing on the same
  Wi-Fi. GPS still works in the APK.
- With the signing secrets set, the APK is a signed release build, which is what Google Play needs.

<details>
<summary>Building the APK on your own computer</summary>

Needs Node 20, JDK 17 and the Android SDK.

```bash
cd mobile
npm install
SITE_URL=https://<your-site> npm run configure
npx cap add android
# then apply the "Allow GPS, camera and on-time reminder alarms" and "Notification icon"
# steps from .github/workflows/build-apk.yml (permissions + res/drawable/ic_stat_notify.xml)
npx capacitor-assets generate --android
npx cap sync android
cd android && ./gradlew assembleDebug
```
</details>

### GPS on a local `http://` site

Browsers only allow location on secure pages.

| How you open the tracker | GPS |
| --- | --- |
| `https://…` on any device | ✅ |
| `http://localhost:8000` (or `<site>.localhost`) on the same computer | ✅ localhost counts as secure |
| **Android APK**, even with `SITE_URL=http://192.168.x.x:8000` | ✅ uses the phone's own GPS |
| Phone browser at `http://192.168.x.x:8000` | ❌ unless allowed in Chrome (below) |

To allow a local address in Chrome on Android, for testing only:
1. Open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
2. Enable it and enter the exact address, for example `http://192.168.1.42:8000`.
3. Tap **Relaunch**, open the tracker again and allow location.

If location fails, the app tells you why: permission off, Location turned off, only approximate
location allowed, no fix, or an insecure page.

## Reminder alarms and notifications

On each device that should alert you, open **Reminders → Turn on**, then **Send test**.

| Where | How it alerts | Needs |
| --- | --- | --- |
| **Android APK** | A native alarm rings at the due time, even if the app is closed, the phone is offline or has restarted | Allow notifications when asked |
| **Browser / installed web app** | Web Push sent by the server when the reminder is due | `https://` (or localhost) and the scheduler |
| **Desk** | Notification bell | The scheduler |

- The reminder job is set to run every minute, but Frappe v16's scheduler only checks for due jobs
  every **4 minutes** by default, so browser alerts can arrive up to about 4 minutes late. On your own
  bench, run `bench set-config -g scheduler_tick_interval 60` and restart the bench for about 1-minute
  delivery. (Alarms in the Android app don't depend on this; they ring at the exact time.)
- Tapping a notification opens the property. A reminder that's ticked **done** before it's sent is not
  sent.
- Web Push is built in and needs no Firebase or other account. Its keys are generated automatically
  and kept in **Property Tracker Settings**.
- Each subscribed browser is listed under **Property Push Subscription**. Expired ones are removed
  automatically.

## Working offline

The app keeps a copy of your data on the phone. Without signal you can still open it, see everything,
and add or edit properties (with photos), log visits, change status, add prices and ratings, and
add or complete reminders. A banner shows how many changes are waiting. They upload in order as soon
as the connection is back, and a property created offline gets its real `P…` number.

- Opening the app with no connection at all needs the installed web app or a browser on `https://`
  (or localhost), which keep the app itself on the phone. The Android APK needs a connection to
  start, but keeps working if the signal drops later.
- Documents, comments, assigning, the plot boundary and deleting need a connection. The app says so.
- If the server rejects a queued change, it's listed under **Account → Changes that couldn't upload**,
  with **Retry** and **Discard**.

## Reports

In Desk, open the **Property Tracker** workspace. It has shortcuts, number cards (Total, Shortlisted,
Negotiating, Purchased, Open Reminders) and charts. The **Property Visits** report shows visits
logged, properties visited and new properties per week.

## Maps

Base maps come from free public services: OpenStreetMap, CARTO, Esri World Imagery and OpenTopoMap.
They're fine for a small team. For heavy or commercial use, follow each provider's usage policy (for
example a paid or self-hosted tile service).

Google Street View can't be embedded without a paid Google API key. The **Street View** buttons open
it at the property's location in the Google Maps app or website instead.

## Moving data from the old standalone app

The earlier version stored everything in the phone's browser. To bring that data in:
1. In the old app, open **More → Backup JSON**.
2. In this app, open **Account → Data → Import backup** and choose the file.

Properties, photos, visits, status history and reminders are imported as new records. The APK uses a
different app id, so it installs alongside the old app; export the data before removing the old one.

## Data model

| DocType | Purpose |
| --- | --- |
| **Property** | A site, named `P0001`, `P0002`, … Area, total and per-unit prices and the status history are maintained automatically. |
| Property Photo | Child table: photos (private files) with captions |
| Property Document | Child table: documents checklist (type, status, file, note) |
| Property Price Log | Child table: price history (asking / offered / counter / negotiated / final) |
| Property Visit | Child table: visit notes |
| Property Status Log | Child table: status changes |
| **Property Reminder** | A user's follow-up reminder, optionally linked to a property |
| Property Push Subscription | A browser registered for reminder notifications |
| Property Tracker Settings | Web Push keys and contact address |

Roles: **Property Manager** (created on install) and **System Manager**.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `bench build` fails in another app (for example helpdesk's posthog import) | Build only this app: `bench build --app property_tracker` |
| Frappe Cloud: "Could not find a compatible Frappe version" | Use the `main` branch on a Frappe v16 bench |
| No reminder notifications | `bench --site <site> enable-scheduler`; turn alerts on under **Reminders** on that device (then **Send test**); browsers need https. On Android, allow notifications for Chrome / the installed app in system settings. |
| Notifications arrive minutes late | Frappe v16's scheduler checks every 4 minutes by default: `bench set-config -g scheduler_tick_interval 60`, then restart the bench |
| GPS says the page is opened over http:// | Use https, localhost, the APK, or the Chrome flag above |
| Installing fails through an **ngrok** address | Fixed in the app (the manifest is fetched with cookies, past ngrok's warning page). Reload the page after updating. If Android still only offers a shortcut, use a tunnel without a warning page, for example `cloudflared tunnel --url http://localhost:8000`. Tunnel addresses change on restart, so the installed app stops working when they do. |
| Chrome says "This app cannot be installed" | Installing needs `https://` (or localhost). On a local `http://` address use the APK, or the Chrome flag above, or **Create shortcut** for now. **Account → Install app** explains the options. |
| A new APK won't install over the old one | It's a debug build. Uninstall the old one, or set up the signing secrets so updates install over it |
| Changes don't show on the phone | Run `bench build --app property_tracker`, then reopen the app twice (the installed app updates on the next launch) |

## Development

```
property_tracker/
├── api.py                    # whitelisted API used by the page (data, saves, reminders, push)
├── webpush.py                # Web Push sender (RFC 8291 encryption, VAPID), no extra packages
├── pwa.py                    # serves the web-app manifest and service worker
├── notify.py                 # Desk notification + push to a user (assignments)
├── www/property-brochure.*   # printable brochure page
├── www/property-tracker.html # the /property-tracker page (controller: www/property_tracker.py)
├── public/js|css/            # the tracker UI (plain JavaScript)
├── public/lib/leaflet/       # Leaflet 1.9.4 (served locally)
└── property_tracker/doctype/
mobile/                       # Capacitor Android wrapper (APK)
.github/workflows/            # CI tests, linters, APK build
```

Run the tests:

```bash
bench --site <site> set-config allow_tests true
bench --site <site> run-tests --app property_tracker
```

This app uses `pre-commit` for formatting and linting (ruff, eslint, prettier, pyupgrade):

```bash
cd apps/property_tracker
pre-commit install
```

### CI

- **CI** installs the app and runs the tests on every push to `main` and `develop`.
- **Linters** run [Frappe Semgrep Rules](https://github.com/frappe/semgrep-rules) and
  [pip-audit](https://pypi.org/project/pip-audit/) on pull requests.
- **Build APK** builds the Android app (manually, or on changes under `mobile/` when `SITE_URL` is set).

## License

MIT. See [license.txt](license.txt).
