# Frame Dashboard

A daily dashboard for a TV on the wall: a public-domain painting on one side,
your day on the other. Plan the week on Monday, then the screen shows each
day's focus, to-dos and meetings.

![By day: the painting fills the wall, the day is a museum placard](docs/day.jpg)

![After 7 pm: the salon wall, tomorrow's plan and a recap of today](docs/night.jpg)

Built for the Samsung **Frame** (Tizen). There's also an **Android TV** APK for
Google TV / Fire TV sticks, and it works in any browser.

- **Painting of the day.** Picked from 44 public-domain works (Monet,
  Hokusai, Hiroshige, Van Gogh, Homer, Sisley…). By day it fills the screen,
  never cropped: the whole work at full height, with a blurred copy of itself
  behind the placard. Your day is printed on a bone museum placard.
- **Today.** One focus line, up to five tasks, the meetings with what's on now
  and what's next, and a strip for the rest of the week.
- **Day and night.** After 7 pm the screen becomes a dark gallery wall: the
  painting hangs in a gilt frame (or a black frame with a mat for works on
  paper) under a picture lamp, and the wall text turns to tomorrow. It shows
  tomorrow's focus and meetings, today's unfinished tasks marked "From
  today", and a one-line recap of the day.
- **Design.** Pick it in Settings (`PUT /api/settings { "layout": … }`, from
  Daybook or an agent): `bleed` (the default) shows the painting by day and
  the salon at night, `salon` keeps the gallery wall all day, and `painting`
  keeps the painting full-screen day and night. `DASHBOARD_LAYOUT` sets the
  default.
- **Remote.** ← → browse the week; OK goes back to today.
- **No data in the repo.** Your plan is stored in Redis, and your calendar is
  read from its secret iCal address.

## How it works

```
 Monday: you + Claude ──PUT /api/plan──▶  Upstash Redis   (focus + tasks per day)
                                              │
 Google Calendar (secret iCal URL) ───────────┤
                                              ▼
 TV app (Tizen / Android) ──GET /api/week──▶  Vercel function  ──▶  the screen
```

The TV apps are thin shells around the hosted page, so a redeploy updates
every screen. You never reinstall.

| Path | What |
|------|------|
| `public/` | The screen. Plain HTML/CSS/JS with no build step. It targets Chromium 85 (2022 Frame). |
| `api/week.js` | The week: plan merged with the calendar, one entry per day |
| `api/plan.js` | Read and replace a week's plan (write key) |
| `lib/` | iCal expansion, plan validation, storage, art |
| `tizen/` | Samsung TV shell (`.wgt`) |
| `android/` | Android TV shell (`.apk`), launches on boot |
| `launcher/` | Samsung home-screen launcher: apps, HDMI inputs, this dashboard |
| `.claude/skills/plan-week/` | The Monday planning routine for Claude Code |

## Run it locally

```bash
npm install
cp .env.example .env.local     # the demo calendar is preconfigured
mkdir -p plan && cp examples/week.json plan/2026-10-12.json
npm run dev                    # http://localhost:4321
```

Preview variants with `?mode=night`, `?at=21:00` (pretend it's that time),
`?layout=salon`, `?lang=es` or `?date=2026-10-12`.

## Deploy (Vercel)

1. `vercel link`, then in the dashboard: *Storage → Create Database →
   Upstash for Redis* (the Free plan is plenty) and connect it to the project
   with the prefix **`KV`**, so it sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
   (`vercel integration add upstash` can't select the Redis product as of CLI 48.)
2. Set the environment variables listed in `.env.example`:
   - `ICS_URLS`: in Google Calendar go to *Settings → your calendar →
     Integrate calendar → Secret address in iCal format*. You can list
     several, comma-separated.
   - `DASHBOARD_READ_KEY`, `DASHBOARD_WRITE_KEY`: generate each with
     `openssl rand -hex 24`.
   - `DASHBOARD_TZ`, `DASHBOARD_LOCALE`.
3. `vercel deploy --prod`
4. In `.env.local`, set `DASHBOARD_API=https://<your-app>.vercel.app` and
   `DASHBOARD_URL=https://<your-app>.vercel.app/?k=<read key>`.

The secret iCal address gives read access to that calendar, so treat it like a
password. The read key is in the TV app's URL, so anyone holding the URL sees
your day. Keep the URL off public screens.

## Frame Desk (Mac menu bar app)

<img src="docs/desk.png" width="300" align="right" alt="Frame Desk popover" />

A remote for the wall, in your menu bar. It shows what's next with a
countdown, today's focus, your to-dos (add, tick, remove) and meetings, and
lets you click through the week. The menu bar itself shows the next meeting
("Standup in 12m") or how many to-dos are left.

It also reads this week's meetings from **every calendar on the Mac**
(iCloud, Google, Exchange: whatever Calendar.app has, minus birthdays and
subscribed calendars) and sends them to the dashboard. The TV shows meetings
without a secret iCal URL. They're as fresh as the last sync, so a sleeping
Mac means meetings go stale. `ICS_URLS` remains the always-on option, and
when both are set the two are merged.

```bash
open mac/FrameDesk.xcworkspace     # build & run the FrameDesk scheme (macOS 14+)
```

On first launch, click the frame icon in the menu bar, then enter your
dashboard URL and your **write key** (it reads too). The key is stored in
the Keychain. Allow Calendar access when asked, and turn on *Open at login*
in Settings.

<br clear="right" />

## Plan the week

In Claude Code, from this folder, say **"plan my week"**. The `plan-week`
skill reads your meetings, talks through priorities, writes
`plan/<monday>.json` and pushes it. Without Claude:

```bash
npm run plan:push -- plan/2026-10-12.json
```

See `examples/week.json` for the format.

## Install on a Samsung Frame (Tizen)

Tested target: 2022 Frame (`QN50LS03B`, Tizen 6.5). Any Samsung TV from 2017
or later should work.

**One time on the TV:**

1. Open **Apps**, then press `1` `2` `3` `4` `5` on the remote. In the
   Developer Mode dialog, turn it **On** and enter your Mac's IP address.
2. Restart the TV by holding the power button until it turns off and on.
3. Note the TV's IP address (*Settings → General → Network → Network Status → IP
   Settings*).

**One time on the Mac:**

1. Install [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download).
   The CLI-only package is enough. Then, in the Package Manager, install
   **Extras → Samsung Certificate Extension** and **TV Extensions**.
2. Open the Certificate Manager and create a **Samsung** certificate profile
   named `frame` (TV type). It signs you in with a Samsung account and asks
   for the TV's DUID: with the TV connected over `sdb`, it reads the DUID
   itself.

**Build and install:**

```bash
npm run tizen:build                       # writes tizen/FrameDashboard.wgt
TV_IP=192.168.1.50 npm run tizen:install   # TIZEN_PROFILE=<name> if your profile isn't "frame"
```

"Frame Dashboard" then shows up in the TV's app row. Samsung apps can't start
on boot, and the TV leaves the app when it drops into Art Mode, so open it from
the row in the morning. It stays on screen with the screensaver disabled.

## Install on Android TV / Google TV / Fire TV

```bash
npm run android:build        # android/app/build/outputs/apk/release/app-release.apk
adb connect <stick-ip>:5555  # enable Developer options → USB/Network debugging first
adb install -r android/app/build/outputs/apk/release/app-release.apk
# Let it open itself after a reboot (Android 10+):
adb shell appops set dev.framedashboard.tv SYSTEM_ALERT_WINDOW allow
```

It runs full screen with the screen kept awake, reloads itself when the network
comes back after boot, and refreshes every few hours to pick up new deploys.

## Launcher (a quieter home screen)

`launcher/` is a separate Tizen app: a clock, a row of apps (YouTube, Netflix,
HBO Max, Spotify, Disney+, Prime Video and this dashboard) and a row of HDMI
inputs, driven by the normal remote. It shares the dashboard's design: a
painting from the collection fills the screen (a new one each day, credited
bottom right), the time is set in Instrument Serif, and every app is the same
bone label card with its logo printed in ink. It is adapted from
[arn0-tv](https://github.com/NelsonEU/arn0-tv) by NelsonEU (MIT, see
`launcher/LICENSE.arn0`), minus its hidden game and its Home-button helpers.

```bash
npm run launcher:preview                  # http://localhost:8080, arrows + Enter, Esc = Back
npm run launcher:build                    # writes launcher/FrameLauncher.wgt (TIZEN_PROFILE as above)
TV_IP=192.168.1.50 npm run launcher:install
```

The paintings are 12 landscapes from `lib/art.json`, cropped to 16:9 with the
dark readability scrim baked in (the TV can't afford live gradients). To change
them, edit `PICKS` in `launcher/scripts/paintings.mjs` and run
`node launcher/scripts/paintings.mjs` on a Mac (it renders with Google Chrome
and converts with macOS `sips`). **Green** on the
remote hangs the next one.

**Hold OK** on an app to pick it up, move it with ◀ ▶, and press OK again to
drop it; the new order is saved on the TV.

Edit `launcher/src/js/config.js` for the apps and HDMI ports; Settings on the
TV can also reorder apps and rename, add or hide inputs. Apps are found by
name, so if one is missing press **Red** (All apps): the focused app's id is
shown bottom right, and you can pin it in `config.js` as `{ id: '…' }`.
**Blue** opens the Lab screen, which tests HDMI switching methods.

The launcher opens from the TV's app row like any other app. Making it the
Home button target needs undocumented changes on the TV; see arn0-tv's
[setup guide](https://github.com/NelsonEU/arn0-tv/blob/main/docs/setup-tv.md)
for the method and its risks.

## Art

Paintings come in **packs**, switched on and off in Frame Desk's Settings:

| Pack | Works | Source |
|---|---|---|
| Impressionists | 44 | Wikimedia Commons scans, self-hosted in `public/art/` |
| Japanese prints | 39 | Cleveland Museum of Art (CC0) |
| Cleveland highlights | 36 | Cleveland Museum of Art (CC0) |
| The Met: landscapes | 23 | The Metropolitan Museum of Art (CC0) |

Museum packs live in `art/packs/*.json` and are built by
`node scripts/build-packs.mjs`. Read the titles it prints before committing,
because automatic queries let sketches, nudes and near-duplicates through.
Their images reach the TV through Vercel's image optimizer on your own domain
(allowed hosts in `vercel.json`). If one fails, the TV hangs a self-hosted
painting instead.

Facts: Cleveland works use the curators' "Did you know" (CC0). The
Impressionists use one sentence from Wikipedia (`art/facts.json`, CC BY-SA,
credited on screen).

Every work is in the public domain. The images are scans from
[Wikimedia Commons](https://commons.wikimedia.org/), resized and served from
`public/art/` with the app. Museum image servers sit behind bot protection
that a TV can't pass, so the screen never loads them directly.

To change the rotation, edit `art/catalog.json` (artist, title, the Commons
file name) and run `node scripts/fetch-art.mjs`. That downloads any new
images (ImageMagick shrinks them if installed) and rewrites `lib/art.json`.
`lib/art.json` records each image's Commons page in `source`, for
attribution.

Note that the 44 paintings add about 29 MB to the repository.

## Fonts

[Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) and
[Geist](https://fonts.google.com/specimen/Geist), both under the SIL Open Font
License, are self-hosted in `public/fonts/` (Latin subset).

## License

MIT for the code. The paintings are public domain; the fonts are OFL.
