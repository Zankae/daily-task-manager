# Daily Task Manager — handoff notes

For whoever continues this: a human, or an agent (Hermes / DeepSeek V4).
Read this before editing. It is short on purpose.

**Also read `PWA-CONVENTIONS.md`** in this same folder. It is shared with the GAINZ project. It is
the common standard for both apps — theme tokens, base CSS, no blocking dialogs, the
backup envelope, versioning, installability. This file covers only Daily Task Manager specifics.

## Files

| File | What it is |
|---|---|
| `index.html` | The entire application. All CSS and JS are embedded. No frameworks, no build step, no external requests. |
| `sw.js` | Service worker. Precaches the shell, serves it offline, announces updates. |
| `manifest.webmanifest` | Makes the app installable. |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Icon set. Regenerate with `make_icons.py` (Pillow). |
| `test.js`, `domtest.js`, `swtest.js`, `pwatest.js` | Test suites. Node only, no dependencies. |
| `app.js` | Development copy of the embedded script. Edit this, then splice it back (below). |

## The build step (there is only one)

`index.html` contains exactly one `<script>` block, byte-identical to `app.js`.
After editing `app.js`:

```bash
python3 - <<'EOF'
import re
html = open('index.html').read()
js = open('app.js').read()
m = re.search(r'<script>\n.*\n</script>', html, re.S)
open('index.html','w').write(html[:m.start()] + '<script>\n' + js + '\n</script>' + html[m.end():])
EOF
node test.js && node domtest.js && node swtest.js && node pwatest.js
```

All four suites must pass. `pwatest.js` also fails if the versions drift apart.

## Shipping an update

1. Edit `app.js`, splice into `index.html`.
2. Bump `APP_VERSION` in `app.js` **and** `CACHE_VERSION` in `sw.js` to the same number. Core shell files must remain mandatory during service-worker installation; never swallow failures for `index.html` or the manifest.
3. Upload. Open pages get a "new version is ready" bar; a reload picks it up.

Without a version bump, browsers keep serving the cached old app.

## Rules that must not be broken

- **No `innerHTML`, ever.** All DOM is built with `el(tag, attrs, ...children)`, which
  only ever sets `textContent`. Task titles and notes are user input. `pwatest.js` enforces this.
- **No external requests.** No CDNs, no fonts, no analytics. The app must work with the
  network cable pulled out.
- **No streaks, points, scores, guilt, or red warnings.** This is a deliberate design
  constraint from the original brief, not an oversight.
- **Version 1 must never claim to be a reliable alarm.** It can chime only while the page
  is open. See "Version 2" below.
- **`localStorage` is the only store**, key `dailyTaskManagerV1`, `schemaVersion: 1`.
  Any new field must be given a default in `defaultState()` *and* be sanitized in
  `validateState()`, which is what import runs through. Bump `schemaVersion` only with a migration.
- **Backups use the shared envelope** `{ app:"daily-task-manager", schemaVersion, exportedAt, data }`
  (`makeBackup` / `readBackup`). Restore rejects a foreign `app` and any newer schema, and
  still accepts a legacy raw-state file. Matches GAINZ's `gainz-db.ts` format — see conventions.

## Architecture in one screen

- `state` — one object, saved to `localStorage` on every change via `saveState()`.
- **Personal day.** The day rolls over at `profile.dayReset` (14:00), not midnight, so
  post-midnight activity belongs to the previous day. `personalDayKey(date)` is the
  single source of truth; never call `dateKey(new Date())` for day logic.
- `generateDay(key)` builds the task list for a day from: fixed routines, gym schedule,
  recovery templates, one-time sequences, maintenance routines, the primary project, and
  the user's own tasks. Task load caps how many optional tasks appear.
- **Done vs Finished.** `markDone` completes a task for today. `applyFinish` permanently
  stops a template and optionally creates a maintenance routine. Never finish anything
  automatically — only suggest.
- `state.custom[]` — the user's own tasks, and also the three built-in timed routines
  (`seed_shower`, `seed_washing`, `seed_dishwasher`). Seeded once, flagged by
  `settings.seededRoutines`, then owned by the user: editable and deletable, never re-added.
- **Alarms page** collects everything with a clock time: wake, sleep, calculated work
  departures, gym, groceries, and every timed task. This is the surface Version 2 reads.

## Version 2 (Raspberry Pi wall device)

The plan the current code is shaped for: Pi 4, touchscreen, amplified speaker, browser
in kiosk mode, this same app unchanged. A small local service reads the schedule and
fires real audible alarms, which the browser cannot do while closed.

The clean seam is the Alarms page. Everything with a time is already normalized there:
`state.profile` (wake, sleep, shift, commute) and `state.custom[]` (`time`, `freq`, `days`, `date`).
A sensible next step is a read-only export of that data — a JSON endpoint or a file the
Pi service polls — rather than teaching the alarm service to parse `localStorage`.

Do not add push notifications or background sync to Version 1 to fake this. It cannot work
reliably on a sleeping iPad, and pretending otherwise is worse than the honest limitation.

## Hosting and Hermes deployment

For GitHub Pages, the contents of this folder belong at the **repository root**. Do not commit an extra nested `daily-task-manager/` directory inside a repository that is already named `daily-task-manager`.

The required runtime set is: `index.html`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png`. Uploading only `index.html` produces a normal web page, not the intended installable/offline PWA.

Before deployment, run all four Node suites. Configure Pages as **Deploy from a branch → main → /(root)**. After GitHub reports the site live, verify the manifest and worker return HTTP 200, reload once, then verify an offline launch. On iPad, installation is Safari → Share → Add to Home Screen → Open as Web App.

Any static host. Relative `start_url` and `scope` mean it works from a subpath such as
`https://name.github.io/daily-task-manager/`. Service workers require `https://` (or `localhost`);
on `file://` the app still runs, just without offline install — registration is skipped.

Data is tied to the origin. Moving the app to a different address leaves the old data behind.
