/* PWA consistency checks. Run: node pwatest.js
   These guard the parts no logic test can see: the manifest, the icon set,
   the service worker precache list, and the version numbers staying in step. */
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
function ok(cond, msg) { cond ? (pass++) : (fail++, console.log("FAIL: " + msg)); }
const read = f => fs.readFileSync(path.join(__dirname, f), "utf8");

const html = read("index.html");
const sw = read("sw.js");
const manifest = JSON.parse(read("manifest.webmanifest"));

/* --- head --- */
ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(html), "manifest linked from index.html");
ok(/name="theme-color"[^>]*prefers-color-scheme: dark/.test(html), "dark theme-color declared");
ok(/name="theme-color"[^>]*prefers-color-scheme: light/.test(html), "light theme-color declared");
ok(/apple-mobile-web-app-capable"\s+content="yes"/.test(html), "iOS standalone flag present");
ok(/rel="apple-touch-icon"/.test(html), "apple-touch-icon present");
ok(/viewport-fit=cover/.test(html), "viewport-fit=cover kept for safe areas");
ok(/env\(safe-area-inset-top\)/.test(html), "header clears the status bar in standalone");
ok(/env\(safe-area-inset-bottom\)/.test(html), "tab bar clears the home indicator");
ok(/overscroll-behavior:\s*none/.test(html), "overscroll-behavior:none (no pull-to-refresh in standalone)");

/* --- it must behave like an app, not a web page --- */
ok(/user-scalable=no/.test(html), "viewport forbids user scaling (no pinch-zoom)");
ok(/maximum-scale=1\.0/.test(html) && /minimum-scale=1\.0/.test(html), "scale is pinned");
ok(/touch-action:\s*pan-y/.test(html), "touch-action:pan-y (no pinch or double-tap zoom)");
ok(/-webkit-touch-callout:\s*none/.test(html), "no long-press callout menu");
ok(/-webkit-user-select:\s*none/.test(html), "text is not selectable");
ok(/input,textarea\{[^}]*-webkit-user-select:\s*text/.test(html.replace(/\s*\n\s*/g, "")),
  "except inside fields, where selecting text is the point");
ok(/gesturestart/.test(html), "Safari pinch gestures are prevented in script too");
ok(!/lastTap/.test(html), "no blanket second-tap suppression (it would eat quick taps)");
ok(/contextmenu/.test(html), "and the long-press menu");
ok(/button\{-webkit-appearance:none/.test(html.replace(/\s*\n\s*/g, "")),
  "buttons opt out of the iOS push-button box (which drew ellipses, not circles)");

/* --- icons are drawn, never emoji ---
   U+2699 GEAR, U+23F0 ALARM CLOCK and friends render as colour emoji on iOS. */
const body = html.slice(html.indexOf("<body"));
const emoji = /[←-⇿⌀-⏿■-➿⬀-⯿️]/.exec(body);
ok(!emoji, "no symbol characters in the markup" +
  (emoji ? " (found U+" + emoji[0].codePointAt(0).toString(16).toUpperCase() + ")" : ""));
ok(/<svg viewBox="0 0 24 24"[^>]*>/.test(html), "icons are inline SVG");
ok(/id="gear"[\s\S]{0,120}<svg/.test(html), "the settings control is a drawn icon");
ok((html.match(/<button data-page="[a-z]+"[^>]*>\s*<svg/g) || []).length === 3,
  "each tab has a drawn icon");
ok(/#gear\{[^}]*align-items:center/.test(html.replace(/\s*\n\s*/g, "")),
  "the settings icon is centred in its button");
ok(/\.check\{[^}]*aspect-ratio:1\/1/.test(html.replace(/\s*\n\s*/g, "")),
  "the completion circle is pinned square");
ok(/html\[data-theme="dark"\]\{[^}]*--bg:/.test(html), "dark colour tokens live in the theme block, not :root");
ok(/html\[data-theme="light"\]\{[^}]*--bg:/.test(html), "light colour tokens defined");
ok(!/:root\{[^}]*--bg:/.test(html), "no colour token leaks onto :root");
ok(html.indexOf("innerHTML") === -1, "no innerHTML anywhere");

/* --- manifest --- */
["name", "short_name", "start_url", "scope", "display", "icons", "theme_color", "background_color"]
  .forEach(k => ok(k in manifest, "manifest has " + k));
ok(manifest.display === "standalone", "manifest display is standalone");
ok(manifest.start_url === "./" && manifest.scope === "./", "relative start_url and scope (works under a subpath)");
const sizes = manifest.icons.map(i => i.sizes);
ok(sizes.includes("192x192"), "manifest declares a 192px icon");
ok(sizes.includes("512x512"), "manifest declares a 512px icon");
ok(manifest.icons.some(i => i.purpose === "maskable"), "manifest declares a maskable icon");
manifest.icons.forEach(i => ok(fs.existsSync(path.join(__dirname, i.src)), "icon file exists: " + i.src));
(manifest.shortcuts || []).forEach(s =>
  ok(/^\.\/#(today|tasks|projects|settings)$/.test(s.url), "shortcut points at a real page: " + s.url));

/* --- icons on disk --- */
const png = f => {
  const b = fs.readFileSync(path.join(__dirname, f));
  ok(b.slice(1, 4).toString() === "PNG", f + " is a real PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
let d = png("icon-192.png"); ok(d.w === 192 && d.h === 192, "icon-192 is 192x192");
d = png("icon-512.png"); ok(d.w === 512 && d.h === 512, "icon-512 is 512x512");
d = png("icon-maskable-512.png"); ok(d.w === 512 && d.h === 512, "maskable icon is 512x512");

/* --- service worker --- */
ok(/addEventListener\("fetch"/.test(sw), "service worker has a fetch handler (required to install)");
ok(/addEventListener\("install"/.test(sw) && /addEventListener\("activate"/.test(sw), "install and activate handlers");
ok(/skipWaiting/.test(sw) && /clients\.claim/.test(sw), "new worker takes over promptly");
ok(/caches\.delete/.test(sw), "old caches are cleaned up");
ok(/postMessage\(\{ type: "updated"/.test(sw), "page is told when an update lands");
ok(/if \(stale\.length\)/.test(sw), "first install does not announce an update");

const precache = (sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].match(/"([^"]+)"/g) || [])
  .map(s => s.replace(/"/g, ""));
["./", "./index.html", "./manifest.webmanifest"].forEach(f => ok(precache.includes(f), "precached: " + f));
precache.filter(f => f !== "./").forEach(f =>
  ok(fs.existsSync(path.join(__dirname, f.replace("./", ""))), "precached file exists: " + f));

/* --- versions in step --- */
const swVer = sw.match(/CACHE_VERSION = "daily-task-manager-v([\d.]+)"/)[1];
const appVer = html.match(/const APP_VERSION="([\d.]+)"/)[1];
ok(swVer === appVer, "sw CACHE_VERSION (" + swVer + ") matches APP_VERSION (" + appVer + ")");

/* --- registration is safe outside a server --- */
ok(/location\.protocol!=="http:"&&location\.protocol!=="https:"/.test(html),
  "service worker registration skipped on file://");
ok(/registerServiceWorker\(\)/.test(html), "registration called from boot");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
