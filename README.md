# Daily Task Manager

A quiet daily task manager that plans a small list of tasks for you each day. You open it once after waking, do the tasks, check them off, and that's it. It knows your work schedule, your gym days, your fixed routines, and the things you're working to fix — and it decides what belongs on today's list so you don't have to.

The application is a small static PWA with no framework, package manager, account, subscription, or cloud backend. There is no build step. `index.html` contains the interface and application logic; the manifest, service worker, and icons must be hosted beside it for installation and offline use.

---

## How to use it

**First time.** When you open the app it asks you to check a short list of values: your shift times, commute times, preparation time, your four gym days, and how many tasks you want per day. Everything is pre-filled — just adjust what's wrong and tap **Start using Daily Task Manager**.

**Every day after that:**

1. Open the app once after waking. Today's list is already there.
2. On workdays, the top of the page shows your calculated times: when to be out of bed, when to start getting ready, and when to leave home. These are computed from your shift start, commute, parking, preparation time, and arrival margin.
3. Do the tasks. Tap the checkbox when one is done — it moves into the collapsed "Completed today" section.
4. Tap a task's text (not the checkbox) to see more options: *I cannot do this today*, *Move to another day*, *Make this task smaller*, and — for recovery tasks — *This problem is resolved*.
5. Optionally glance at it once more before sleeping (the "Brush teeth before sleeping" task lives at the bottom of the list).

A new list is created automatically when your **personal day** begins.

**The personal day.** Because your schedule crosses midnight, the day does not reset at 00:00. By default it resets at **14:00**. Cooking after your Monday shift at 00:30 still counts as Monday, and a gym session after midnight still belongs to the day it was planned for. You can change the reset time in Profile.

**Gym.** Four sessions per week are required. On a gym day the gym task appears prominently and is never replaced by a creative-project task. You can mark it completed, mark it missed, or move it to another day *in the same week*. The header always shows your weekly count, e.g. "2 of 4 gym".

**Projects.** On the Projects page, exactly one project can be **Primary** — that's the only one the app suggests work on. One more can be Secondary; the rest are Paused or Stored. Completing a project stops its tasks; you can reactivate it later.

**Profile changes and today’s list.** Changes to workdays, gym days, task amount, enabled life areas, or fixed schedule values are used for newly generated days. To apply those changes immediately, use **Regenerate today** on the Today page; completed items are kept.

---

## Done vs. Finished

This is the most important idea in the app.

**Done** (the checkbox) means: *I did this today.* The task leaves today's list. If it's recurring — brushing teeth, gym, groceries — it will come back on the right day. If it's a recovery task, it will come back later, because the underlying problem still exists.

**Finished** (the "This problem is resolved" button inside a task's details) means: *this problem no longer exists.* The app permanently stops generating that task. You always get a confirmation first, with three choices:

- **Finish and add maintenance** — the recovery task stops, and a lighter recurring check replaces it.
- **Finish without maintenance** — the task simply stops.
- **Cancel.**

Only you decide when something is finished. After you've completed a recovery task several times, the app may gently ask whether the problem is resolved — but it never finishes anything on its own.

**Recovery → maintenance examples**

| Recovery task | Maintenance replacement | Suggested rhythm |
|---|---|---|
| Collect loose cables from one section of the floor | Check that no loose cables are lying on the floor | Every 2 weeks |
| Vacuum one cleared section of floor | Vacuum the whole apartment | Monthly, on a Saturday |
| Fill one bag with obvious rubbish | Do a ten-minute rubbish check | Weekly |
| Flatten three delivery boxes | Check for empty delivery boxes | Monthly |

Maintenance wording, frequency, and preferred weekday are all editable in **Profile → Recovery and maintenance**. That section also lets you restore a resolved goal, disable or re-enable any task template, and delete maintenance routines.

One-time sequences (dental examination, new glasses, posture assessment) show one step at a time. Completing a step makes the next one eligible for a future day. When the real-world goal is achieved — you're wearing the new glasses — mark the whole sequence as Finished.

---

## Where your data lives

Everything is stored in the browser's **local storage on this device**. Nothing is sent anywhere.

> **Important:** if Safari's website data is cleared (manually, or by clearing browsing data), your Daily Task Manager data is erased with it. Export a backup now and then.

- **Export a backup:** Profile → Backup → **Export backup**. A file named `daily-task-manager-backup-YYYY-MM-DD.json` is downloaded. Keep it somewhere safe (Files app, cloud drive, email to yourself).
- **Restore a backup:** Profile → Backup → **Import backup**, then pick the JSON file. Everything — including resolved goals and maintenance routines — is restored.
- **Reset:** Profile → Backup → **Reset application** erases everything after a confirmation.

Data survives normal page reloads and browser restarts automatically; saving happens on every change.

---

## Putting it on the web with GitHub Pages

This is a static PWA. Publish the **runtime files together at the root of the repository**:

- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`
- `icon-maskable-512.png`

The Markdown files, tests, `app.js`, and `make_icons.py` may remain in the repository, but they are not required by the running app. Do **not** upload only `index.html`, and do **not** put the runtime files inside an extra nested `daily-task-manager/` directory when the repository itself is already named `daily-task-manager`.

A simple GitHub Pages deployment:

1. Create a public repository named `daily-task-manager`.
2. Put the contents of this project folder in the repository root and commit them to `main`.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main**, folder **/(root)**, then save.
6. Wait for GitHub to show the live address, normally `https://YOURNAME.github.io/daily-task-manager/`.
7. Open that exact HTTPS address once while online. Reload it once, then test Airplane Mode to confirm the cached app still opens.

### Install it on the iPad from Safari

1. Open the live GitHub Pages address in **Safari**.
2. Tap **Share**.
3. Tap **Add to Home Screen**. If shown, keep **Open as Web App** enabled.
4. Tap **Add**.
5. Launch **Daily Task Manager** from its new Home Screen icon and complete setup there.

This is an “Add to Home Screen” installation, not an App Store download. Data is tied to that website address and stored locally on the device, so keep the repository name and Pages URL stable and export backups periodically.

---

## Alarm limitations (please read)

Version 1 is **not an alarm clock** and never claims to be. It can:

- show the calculated times for waking, preparation, and departure,
- strike through timed tasks once their time has passed,
- optionally play a soft chime when a timed task comes due — **but only while the page is open and active** (enable it in Profile → Appearance and sound, and use "Test sound" to check the volume).

It cannot wake you or alert you when the Home Screen app is closed, the iPad is locked, or Safari has suspended it. Do not rely on it for waking up or leaving for work — keep using a real alarm for that until Version 2 exists.

---

## Version 2 (future direction — not built yet)

Version 2 will run as an always-on wall device: a Raspberry Pi 4 Model B (2 GB) with Raspberry Pi OS, a touchscreen, and an amplified speaker, showing this same app fullscreen in browser kiosk mode with automatic startup. Because it never sleeps, it can add a small local alarm service for reliable audible alarms: waking, work departure, bedtime, appointments, and task reminders. Version 2 reuses the Version 1 interface and task-generation logic unchanged — which is why Version 1 keeps everything in one self-contained file.
