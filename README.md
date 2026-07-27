# Daily Task Manager

A quiet daily task manager for one person on one iPad. It shows what is on today,
lets you change anything by tapping it, and stays out of the way otherwise.

The application is a small static PWA: no framework, no package manager, no account,
no cloud, no build step beyond splicing one file into another. `index.html` contains
the whole interface and all the logic; the manifest, service worker and icons must be
hosted beside it for installation and offline use.

---

## The one idea

**Everything about a task lives in the task.** Its clock time, its alarm, its urgency,
how often it repeats, how long it takes, its steps — all of it is edited by tapping the
task and typing, right where it sits in the list. There is no separate page for alarms,
no page for priorities, and no hidden planner deciding things on your behalf.

A day does not own copies of tasks. It records what happened to them: what was
completed, what was skipped, what was pulled in, and what order you put them in. So the
task you edit on Today is the same object you edit anywhere else.

---

## The three tabs

**Today** — what is on today, in personal-day order: anything with a clock time first,
then the rest. On a workday a strip at the top shows when to be out of bed, when to
start getting ready and when to leave. Tap a task to open it. Tick the circle to
complete it. Drag the grip to reorder. `+ Add a task for today` creates one and opens it
ready to type into.

**Tasks** — every task in three groups:

- *Repeating* — things that come back on their own. Drag to set their order.
- *Scheduled* — one-off tasks with a date. They finish for good when completed.
- *Someday* — a shelf, not a list. Nothing here appears on a day until you move it
  there. The cleanup jobs and the dentist and glasses checklists live here.

Anything finished shows under **Finished** at the bottom and can be restored.

**Projects** — a plain drag-to-order list of what you want to work on. No primary, no
secondary, no paused or stored. Tap one to open it: name, notes, and a checklist of
steps with a progress bar. Any step can be pushed onto today with its **Today** button,
which creates a task linked back to the project.

**Calendar** — the month as a grid of days, with arrows to step through months. A day
lights up when something is on it, and gets brighter the more there is; the number in the
corner says how many. Everyday routines are not counted, or every square would be lit and
the colour would tell you nothing. Tap a day to see everything on it, including the
routine, and tap any task there to land in its editor. You can also start a task straight
onto a day from that popup.

**Settings** is the gear in the top corner, not a tab: work and commute times, when the
day rolls over, gym, theme and sound, backup, and the wall-device export.

---

## Editing a task

Tapping a task opens it in place, and **it only offers what applies to that task**:

| | |
|---|---|
| **Title, notes** | Typed straight in, saved as you type. The notes box stays hidden until you ask for it. |
| **How often** *(repeating)* | Every day, Weekly (pick days), Monthly, or Interval (every *n* days/weeks/months, counted from the last time you did it). No date field — a repeating task hasn't got one. |
| **Monthly** | Either a date — day 15 of the month — or a weekday: *the first Saturday*, *the last Friday*. The second is the one a date cannot express, and it shows you the next three dates it lands on so you can see it is right. |
| **When** *(one-off)* | A date. No frequency chooser. |
| **Not on a day** *(Someday)* | No date, no time, no alarm, no target. A shelved task has no day for any of that to attach to. |
| **Time and alarm** | A clock time; the alarm switch appears once there is a time for it to ring at. |
| **Urgency** | Normal, Important or Urgent — a quiet bar down the left edge of the row. |
| **Takes about** | Minutes, if you want the estimate. |
| **Times a week** | Only on a weekly or interval task. The row then reads e.g. *2 of 4 this week* — this is how the gym works, with no special machinery behind it. |
| **Steps** | A checklist inside the task, draggable. |
| **Project** | Which project it belongs to, if any. |
| **Actions** | Only the moves that make sense from where you are: a shelved task offers *Put it on today*, not *Not today*. |

Narrowing the surface never takes away control: a repeating task always offers **Make it a
one-off instead**, and a one-off offers **Make it repeat instead**.

Nothing is ever finished on your behalf. A repeating task stays; a one-off archives
itself when completed and can be restored.

---

## The personal day

Because the schedule crosses midnight, the day does not reset at 00:00. By default it
rolls over at **14:00**, so cooking after a shift at 00:30 still counts as the day
before. That time is also what orders the list: with a 14:00 reset, `15:50` comes before
`23:30`, which comes before `04:00`. Change it in Settings → The day.

---

## Alarms, honestly

An alarm chimes **only while the app is open and awake**. An installed PWA on a locked
iPad cannot be woken up, and this app does not pretend otherwise — keep a real alarm for
work. What the alarm switch does give you is a single place where every timed thing is
recorded, which is what the wall device below reads.

Settings → Wall device → **Export alarm schedule** writes one flat JSON file: wake and
sleep, the calculated work departures, and every task with a clock time, sorted in
personal-day order. No app internals are in it.

---

## Where your data lives

In this browser, on this device, under the key `dailyTaskManagerV2`. Nothing is sent
anywhere.

> **If Safari's website data is cleared, the data goes with it.** Export a backup now
> and then.

- **Export:** Settings → Backup → *Export backup* → `daily-task-manager-backup-YYYY-MM-DD.json`
- **Import:** Settings → Backup → *Import backup*. Version 1 backups are accepted and
  upgraded on the way in.
- **Erase:** Settings → Backup → *Erase everything*, after a confirmation.

Saving happens on every change.

### Upgrading from version 1

The first launch of version 2 reads the old data once and carries across what was yours:
your own tasks with their days and times, your projects in their old on-screen order
(the primary one first), your work and commute times, the day-reset, sleep and waking
times, your gym days with this week's count, and the remaining steps of the dentist and
glasses sequences. Active cleanup jobs land in Someday; old maintenance routines become
interval tasks.

What version 2 does not have is dropped: the life-area priority table, the posture text
box, the daily task cap, recovery counters and the generated day copies.

The old `dailyTaskManagerV1` key is **left untouched** as a safety net.

---

## Hosting

Publish these files together at the root of the repository:

`index.html` · `manifest.webmanifest` · `sw.js` · `icon-192.png` · `icon-512.png` · `icon-maskable-512.png`

The Markdown files, the tests and `app.js` may stay in the repository; the running app
does not need them. `start_url` and `scope` are relative, so a subpath such as
`https://name.github.io/daily-task-manager/` works. Service workers need `https://` or
`localhost`; on `file://` the app still runs, just without offline install.

### Install on the iPad

1. Open the live address in **Safari**.
2. **Share** → **Add to Home Screen** → keep *Open as Web App* → **Add**.
3. Launch it from the new icon.

Data is tied to the address, so keep the repository name and URL stable.

---

## Development

`app.js` is the editable copy of the script that `index.html` embeds. After editing it,
splice it in and run the four suites — see `HANDOFF.md`.

```bash
node test.js && node domtest.js && node swtest.js && node pwatest.js
```
