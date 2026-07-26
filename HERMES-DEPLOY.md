# Hermes deployment task — Daily Task Manager

> **Historical.** This described the original version 1 deployment. The app is now at
> version 2 and lives on the `prod` branch at
> <https://zankae.github.io/daily-task-manager/>. The deployment procedure below still
> applies, except that Pages deploys from **`prod`**, not `main`. For anything about how
> the app itself works, read `HANDOFF.md` — it supersedes this file.

Do not migrate frameworks, add a backend, or change storage.

## Goal

Publish this folder as a GitHub Pages project site and verify that it installs and starts offline on an iPad.

## Required procedure

1. Read `HANDOFF.md` and `PWA-CONVENTIONS.md`.
2. Run:
   ```bash
   node test.js && node domtest.js && node swtest.js && node pwatest.js
   ```
   Stop if any test fails.
3. Create or use a repository named `daily-task-manager`.
4. Put the **contents of this folder** in the repository root. Do not create `daily-task-manager/daily-task-manager/` nesting.
5. Commit and push to `main`.
6. Configure GitHub Pages to deploy from `main` and `/(root)`.
7. Wait for the Pages deployment to succeed.
8. Verify these live URLs return HTTP 200:
   - `/daily-task-manager/`
   - `/daily-task-manager/manifest.webmanifest`
   - `/daily-task-manager/sw.js`
   - all three PNG icons
9. Confirm the page registers a service worker with scope ending in `/daily-task-manager/`.
10. Reload once, switch the test browser offline, and confirm the app shell still opens.
11. Report the exact Pages URL and any GitHub setting that required manual approval.

## Do not do

- Do not upload only `index.html`.
- Do not use absolute `/` asset paths; the app intentionally uses relative paths for a GitHub Pages subdirectory.
- Do not add React, Vite, npm dependencies, analytics, CDNs, remote fonts, or a server.
- Do not rename the runtime files without updating the manifest, HTML, service worker, and tests.
- Do not claim the optional chime is a reliable background alarm.
