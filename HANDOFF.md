# Daily Task Manager — handoff notes

For whoever continues this, human or agent. Read this before editing. Short on purpose.

**Also read `PWA-CONVENTIONS.md`** in this folder. It is shared with the GAINZ project and
is the common standard for both: theme tokens, base CSS, no blocking dialogs, the backup
envelope, versioning, installability. This file covers only Daily Task Manager.

Version 2 is a deliberate rewrite. Version 1's structure — a hidden day generator, a
template library with recovery counters, a life-area priority table, a separate Alarms
page and a nine-section Profile — was the source of the complexity that made the app
unpleasant to use. Do not reintroduce it.

## Files

| File | What it is |
|---|---|
| `index.html` | The entire application. All CSS and JS embedded. No frameworks, no build, no external requests. |
| `app.js` | The editable copy of the embedded script. Edit this, then splice it in (below). |
| `sw.js` | Service worker. Precaches the shell, serves it offline, announces updates. |
| `manifest.webmanifest` | Makes the app installable. |
| `icon-*.png` | Icon set. Regenerate with `make_icons.py` (Pillow). |
| `test.js`, `domtest.js`, `swtest.js`, `pwatest.js` | Test suites. Node only, no dependencies. |

## The build step (there is only one)

`index.html` contains exactly one `<script>` block, byte-identical to `app.js`.
`app.js` is kept pure ASCII, with `\uXXXX` escapes for symbols, so that no editor or host
guessing an encoding can corrupt it. After editing `app.js`:

```bash
python3 - <<'EOF'
import io, re
src = io.open('app.js', encoding='utf-8').read()
io.open('app.js', 'w', encoding='ascii', newline='\n').write(
    ''.join(c if ord(c) < 128 else '\\u%04X' % ord(c) for c in src))
html = io.open('index.html', encoding='utf-8').read()
js = io.open('app.js', encoding='utf-8').read()
m = re.search(r'<script>\n.*?\n</script>', html, re.S)
io.open('index.html', 'w', encoding='utf-8', newline='\n').write(
    html[:m.start()] + '<script>\n' + js.rstrip('\n') + '\n</script>' + html[m.end():])
EOF
node test.js && node domtest.js && node swtest.js && node pwatest.js
```

All four suites must pass. `pwatest.js` also fails if the versions drift apart.

## Shipping an update

1. Edit `app.js`, splice into `index.html`.
2. Bump `APP_VERSION` in `app.js` **and** `CACHE_VERSION` in `sw.js` to the same number.
   The core shell files must stay mandatory during service-worker installation; never
   swallow a failure for `index.html` or the manifest.
3. Push. Open pages get a "new version is ready" bar; a reload picks it up. Note that a
   page still running the old version shows that bar in the *old* interface — the new one
   appears after the reload.

Without a version bump, browsers keep serving the cached old app.

## Rules that must not be broken

- **Never assign raw HTML.** All DOM is built with `el(tag, attrs, ...children)`, which
  only ever sets `textContent`. Task titles and notes are user input. `pwatest.js` fails
  if the property name appears anywhere in the output at all, including in a comment.
- **No blocking dialogs.** `confirm`, `alert` and `prompt` are no-ops in an installed
  PWA — `confirm()` silently returns `false`, so every button depending on one looks dead
  while its source reads perfectly. Use `confirmBox()`. `domtest.js` throws if a native
  one is called.
- **No external requests.** No CDNs, fonts, analytics. It must work with the network off.
- **No streaks, points, scores, guilt or red warnings.** A deliberate constraint, not an
  oversight. Urgency is a quiet amber bar, never a red alert.
- **It must feel like an app, not a page.** Three things keep it that way, and all three
  are needed because iOS honours different ones in Safari and in an installed web app:
  `user-scalable=no` with the scale pinned in the viewport meta, `touch-action:pan-y` in
  CSS, and `lockDownGestures()` for Safari's own pinch gesture events, the long-press
  callout, and double-tap zoom. Body text is `user-select:none` with
  `-webkit-touch-callout:none`; `input` and `textarea` opt back in, because selecting
  text there is the point. `pwatest.js` guards every one of these.
- **Icons are drawn, never typed.** iOS renders characters like U+2699 GEAR and U+23F0
  ALARM CLOCK as full-colour emoji from an entirely different design language, sitting
  off-centre in their box. Every icon is inline SVG: `ICONS` plus `icon(name)` in script,
  and literal `<svg>` in the shell for the gear and the three tabs. Both test suites fail
  if a symbol character reappears in the markup or on a rendered page.
- **Buttons need `-webkit-appearance:none`.** iOS draws its own push-button box with its
  own padding and ignores `width`/`height`, which is what turned the completion circles
  into ellipses. `.check` additionally pins `min`/`max` width and height and
  `aspect-ratio:1/1`.
- **Every page must stay scrollable** — `body{min-height:calc(100vh + 1px)}`. With
  `viewport-fit=cover`, iOS anchors a `position:fixed; bottom:0` bar to the bottom of the
  *safe area* on a page that cannot scroll, and to the bottom of the *screen* on one that
  can. Projects was the only page short enough to fit the screen, so the tab bar jumped up
  by the home-indicator inset on that one tab and sat correctly on every other. Do not
  "fix" a short page by letting it stop scrolling. `#tabs::after` paints the strip below
  the bar in the bar's own colour as a second line of defence.
- **The editor shows only what applies.** A shelved task has no day, so it is offered no
  date, no clock time, no alarm and no weekly target. A repeating task has no single
  date; a one-off has no frequency; a weekly target only appears on a weekly or interval
  repeat. Every kind still carries an explicit "make it a one-off / make it repeat"
  escape hatch, so narrowing the surface never takes control away. Derive this from the
  task itself (`bucket`, `repeat.kind`), never from which tab happens to be open.
- **Never re-render while a native picker is open.** `<input type="time">` and
  `type="date"` open a popover anchored to that element; rebuilding the editor on `change`
  destroys the input and dismisses the popover, so setting the hour closed the wheel
  before the minutes could be set. `pickerInput()` takes the value on `input`/`change`
  and saves it, but only calls back to re-render on `blur`. A test asserts the input is
  the *same element* after spinning both wheels.
- **A task being edited stays in the list.** Changing a rule can make a task no longer
  due today, or move it between Tasks groups. `renderToday()` and `renderTasks()` both
  keep `ui.open` on screen regardless, so the thing being edited never vanishes
  mid-sentence; it drops off once closed.
- **The background is two pseudo-elements, never one.** `body::after` carries the light
  (`--wash`, several gradients, `cover`/`no-repeat`); `body::before` carries the grain
  (`--grain`, one tiled SVG). They must not share a declaration: `background-size` and
  `background-repeat` take a list and CSS **cycles a short list across the layers**, so a
  single tiled grain over several gradients made the gradients tile too — a radial
  gradient repeating every tile, drawn as lines across the screen. The grain's SVG filter
  also pins `x/y/width/height`, because the default region is 120% of the box and the
  stitched unit then does not match the tile.
- **The calendar lights what is worth seeing.** `litBy()` decides: never the everyday
  routine, since a daily task falls on every square and would light the whole month; and
  an interval chore only on the day it comes due plus today while it is still outstanding,
  because `dueOn` keeps it due every day until it is actually done. That stickiness is
  right for Today and would otherwise paint every remaining day. The day popup still shows
  the full truth for that day.
- **Editor sections are boxes, not divider lines.** Each is an `.esec` a step lighter than
  the row behind it (`--panel2` on `--panel`), with its controls a step lighter again
  (`--panel3`) so they lift off it. Never render an `.esec` with no title or no content —
  a box around nothing reads as a mistake and costs a chunk of a 1024px-tall screen. A
  typical editor is ~920px and fits without scrolling; keep it that way.
- **Opening a task goes through `openTask()`.** The tap that opens one bubbles on to the
  close-on-outside-tap handler, which would otherwise shut it again the instant it
  appeared. That handler walks up from the event target by hand rather than using
  `closest()`, because a tap inside the editor may already have rebuilt the page and left
  the target detached — the walk still finds the task it belonged to.
- **Never claim to be a reliable alarm.** It can chime only while the page is open.
- **`localStorage` is the only store**, key `dailyTaskManagerV2`, `schemaVersion: 2`. Any
  new field needs a default in `defaultState()` *and* sanitising in `validateState()`,
  which is what import runs through. Bump `schemaVersion` only with a migration.
- **Leave `dailyTaskManagerV1` alone.** It is never written to, so a bad upgrade can be
  recovered from.
- **Backups use the shared envelope** `{ app:"daily-task-manager", schemaVersion, exportedAt, data }`
  (`makeBackup` / `readBackup`). Restore rejects a foreign `app` and any newer schema,
  accepts a legacy raw-state file, and upgrades a version 1 payload through `migrateV1`.

## Architecture in one screen

- `state` — one object, saved to `localStorage` on every change via `saveState()`.
- **The task is the unit.** `{id,title,notes,urgency,repeat,date,time,alarm,minutes,
  weeklyTarget,steps[],projectId,bucket,order,start,archived,lastDone,doneDates[]}`.
  `bucket` is `"active"` or `"someday"`. There are no task types and no templates; the
  gym is an ordinary weekly task with `weeklyTarget: 4`.
- **`repeat.kind`** is `once | daily | weekly | monthly | every`. `dueOn(task, key)` is the
  only place that decides whether a task belongs to a day. `every` counts from `lastDone`,
  so an interval chore is due immediately if it has never been done.
- **The personal day.** `personalDayKey(now)` rolls the day over at `profile.dayReset`
  (14:00), not midnight. `dayMinutes(hm)` measures from that reset, which is what puts
  `15:50 → 23:30 → 04:00` in the right order. Never use raw clock minutes for ordering,
  and never `dateKey(new Date())` for day logic.
- **Days record, they do not own.** `state.days[key] = {done:{id:iso}, skip:[id], add:[id],
  order:[id]|null, note}`. `tasksFor(key)` composes the list: what the rules put there,
  plus manual additions, minus skips, plus anything already completed. `order` is written
  only once the user drags something, and then it wins over the clock.
- **Rendering** is full-redraw per page (`render()`), which is cheap at this size. The one
  rule: never rebuild a list while a task is open, or the keyboard is taken away
  mid-sentence — see the interval in `boot()`.
- **The target is one device**: a 3rd-generation iPad Pro 12.9", usually in landscape, so
  1366x1024. Check work there. The whole editor fits on screen in that space and should
  stay that way; it was 1089px tall before it became contextual, which meant scrolling to
  reach the buttons.
- **`makeSortable(list, onDrop)`** is pointer-event based, because HTML5 drag-and-drop does
  not work with a finger on iOS. **Measure once, at `pointerdown`, and never again.**
  Every later decision comes from that snapshot plus how far the finger has moved; the
  dragged row is translated, the rows it passes are translated out of its way, and the DOM
  is reordered exactly once, on release. Two earlier versions got this wrong: one animated
  the dragged row's `transform`, so reading its position back gave the mid-animation value
  and the reorder never fired at all; the next moved rows in the DOM and read their
  positions back in the same breath, which is a feedback loop that oscillates on rows of
  differing heights and strands one on top of another during a fast flick. Related rules:
  the dragged row keeps `transition:none` (`.task.dragging`), the grip keeps
  `touch-action:none`, move and up are listened for on the **document** so a finger that
  outruns the row cannot leave the drag stuck, and only the list that directly owns a row
  may claim the drag — which is how a sortable step list works inside a sortable task.

## The wall device (version 3, Raspberry Pi)

Pi 4, touchscreen, amplified speaker, browser in kiosk mode, this same app unchanged. A
small local service reads the schedule and fires real audible alarms, which a browser
cannot do while closed.

The seam is `alarmSchedule()` and the **Export alarm schedule** button in Settings. It
returns one flat, self-describing list — `{app, version, dayReset, timezone, generatedAt,
alarms:[{time,label,kind,days,date,alarm}]}` — with no app internals in it. Teach the Pi
service to read that shape, not `localStorage`. Keeping that function's output stable is
the whole contract.

Do not add push notifications or background sync to fake this on the iPad. It cannot work
reliably on a sleeping device, and pretending otherwise is worse than an honest limit.

## Hosting

Contents of this folder at the **repository root** — no nested `daily-task-manager/`
inside a repository already named that. Runtime set: `index.html`,
`manifest.webmanifest`, `sw.js` and the three icons. Uploading only `index.html` gives a
web page, not an installable offline PWA.

Pages is configured as **Deploy from a branch → `prod` → /(root)**. After GitHub reports
the site live, check the manifest and worker return 200, reload once, then confirm an
offline launch. On iPad: Safari → Share → Add to Home Screen.

Data is tied to the origin. Moving the app to a different address leaves the old data
behind.
