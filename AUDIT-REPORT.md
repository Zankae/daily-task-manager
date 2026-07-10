# Daily Task Manager PWA audit

## Verdict

This copy is ready for Hermes to deploy to GitHub Pages as a static PWA. The application has no build step, framework, package installation, backend, remote assets, or runtime API dependency.

A real iPad Safari installation still needs the final post-deployment smoke test because this audit environment cannot reproduce Apple’s Home Screen web-app container exactly.

## Automated verification

All checks pass:

- `node --check app.js`
- `node --check sw.js`
- `node test.js` — 102 passed
- `node domtest.js` — 62 passed
- `node swtest.js` — 18 passed
- `node pwatest.js` — 54 passed
- Embedded script in `index.html` is byte-identical to `app.js`
- Manifest parses as valid JSON
- All declared icons exist and have the declared dimensions
- Local HTTP smoke test returns HTTP 200 for the page, manifest, worker, and all icons
- Runtime paths are relative, so a project URL such as `/daily-task-manager/` is supported

Total project checks: **236 passed, 0 failed**.

## Problems found and corrected

1. **The old README told the deployer to upload only `index.html`.** That would have removed the manifest, service worker, and icons, leaving a normal webpage rather than an installable/offline PWA. The deployment instructions now list the complete runtime set.
2. **The old iPad instructions used Microsoft Edge rather than Safari.** They now describe Safari → Share → Add to Home Screen → Open as Web App.
3. **The service worker treated every precache failure as optional.** A failed `index.html` download could therefore activate a broken update and delete the last good offline cache. Core shell caching is now mandatory and tested; icon failures remain non-fatal.
4. **Several fixed recurring tasks displayed “Move to another day” even though the code did not store a destination.** The fake action is now hidden for those tasks. Recovery, sequence, custom, gym, and maintenance tasks retain real move behavior; maintenance now updates `nextDue`.
5. **Restoring a recovery goal could leave its lighter maintenance routine active too.** Restore now removes the duplicate maintenance routine.
6. **The hard-coded profile time-zone label implied that the app used an explicit time-zone engine.** The UI now reports the device’s actual local time zone, which matches the date logic.
7. **Handoff documentation contained an incorrect file location and ambiguous repository layout.** It now tells Hermes to put this folder’s contents at the repository root and avoid `daily-task-manager/daily-task-manager/` nesting.
8. Version numbers were advanced together to **1.2.1**.

## Second audit pass (v1.2.2)

A follow-up audit re-verified all 236 automated checks and re-reviewed the full application source. Three further corrections were made:

1. **Editing weekdays of an existing task leaked through Cancel.** The weekday picker in the task edit dialog mutated the saved task directly, so toggling days and then pressing Cancel still changed the task (and the change persisted on the next save). The dialog now edits a draft copy that is committed only on Save.
2. **Imported string profile fields were not length-limited.** A hand-crafted backup could smuggle arbitrarily large strings into profile text fields. Import now clamps them to the same 600-character limit the UI enforces.
3. Removed one piece of dead code in the Profile renderer.

`APP_VERSION` and `CACHE_VERSION` were advanced together to **1.2.2** and the embedded script was re-spliced and re-verified byte-identical.

## Expected limitations, not deployment defects

- Data lives only in `localStorage` at the deployed origin. Changing the GitHub Pages URL creates a separate data store.
- Clearing Safari website data can erase the app’s state; periodic JSON backups remain important.
- The optional chime only works while the app is open and active. It is not a background alarm.
- Planning-setting changes apply to newly generated lists. Use **Regenerate today** to apply them to the current day while preserving completed items.
- There is no automatic cloud sync between devices.

## Final iPad smoke test after Hermes deploys

1. Open the exact HTTPS Pages URL in Safari.
2. Complete a small setup change, reload, and verify it persists.
3. Reload the site once while online.
4. Enable Airplane Mode and verify the page still opens.
5. Return online, choose Share → Add to Home Screen, keep Open as Web App enabled, and launch it from the icon.
6. Add and complete a test task, close and reopen the Home Screen app, and verify the change remains.
7. Export a backup and confirm the JSON file appears in Files/Downloads or the Safari download interface.
8. Import that same backup and confirm it is accepted.
