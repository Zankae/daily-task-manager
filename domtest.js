"use strict";
/* Interface tests. Run: node domtest.js
   A fake DOM just large enough for the app's render code, including layout
   rectangles and pointer events so drag-to-reorder is genuinely exercised
   rather than assumed. */

const ROW = 60;          /* every element is pretended to be this tall */
let ids = {};

class N {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.nodeType = 1;
    this.children = []; this.parent = null;
    this.attrs = {}; this.style = {}; this.listeners = {};
    this.className = ""; this.value = ""; this.checked = false; this.selected = false;
    this._text = ""; this.dataset = {}; this._focused = false;
  }
  /* --- tree --- */
  append(...kids) {
    for (const k of kids) {
      const n = (k && k.nodeType) ? k : { nodeType: 3, text: String(k), parent: null };
      if (n.parent) n.parent.removeChild(n);
      n.parent = this; this.children.push(n);
      if (n.nodeType === 1) n._reg();
    }
  }
  _reg() { if (this.attrs.id) ids[this.attrs.id] = this; this.children.forEach(c => { if (c.nodeType === 1) c._reg(); }); }
  appendChild(k) { this.append(k); return k; }
  insertBefore(node, ref) {
    if (node.parent) node.parent.removeChild(node);
    const i = this.children.indexOf(ref);
    this.children.splice(i < 0 ? this.children.length : i, 0, node);
    node.parent = this;
    if (node.nodeType === 1) node._reg();
    return node;
  }
  removeChild(k) { this.children = this.children.filter(c => c !== k); k.parent = null; return k; }
  remove() { if (this.parent) this.parent.removeChild(this); }
  get parentNode() { return this.parent; }
  get firstChild() { return this.children[0] || null; }
  get elementChildren() { return this.children.filter(c => c.nodeType === 1); }
  _sib(step) {
    if (!this.parent) return null;
    const els = this.parent.elementChildren;
    return els[els.indexOf(this) + step] || null;
  }
  get previousElementSibling() { return this._sib(-1); }
  get nextElementSibling() { return this._sib(1); }
  contains(n) { let p = n; while (p) { if (p === this) return true; p = p.parent; } return false; }

  /* --- attributes --- */
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === "class") this.className = String(v);
    if (k === "id") ids[v] = this;
    if (k.slice(0, 5) === "data-") this.dataset[k.slice(5)] = String(v);
  }
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
  hasAttribute(k) { return this.attrs[k] !== undefined; }
  get classList() {
    const self = this;
    const parts = () => self.className.split(/\s+/).filter(Boolean);
    return {
      add: c => { const s = parts(); if (!s.includes(c)) { s.push(c); self.className = s.join(" "); } },
      remove: c => { self.className = parts().filter(x => x !== c).join(" "); },
      toggle: (c, force) => {
        const has = parts().includes(c);
        const want = force === undefined ? !has : force;
        if (want && !has) self.classList.add(c);
        if (!want && has) self.classList.remove(c);
      },
      contains: c => parts().includes(c)
    };
  }

  /* --- text --- */
  set textContent(v) { this.children = []; this._text = String(v); }
  get textContent() {
    let t = this._text;
    for (const c of this.children) t += c.nodeType === 3 ? c.text : c.textContent;
    return t;
  }

  /* --- selectors --- */
  /* Handles tag, #id, .a.b compounds and [attr="value"], which is all the app uses. */
  matches(sel) {
    const m = /^([a-zA-Z]*)((?:[.#][\w-]+|\[[^\]]*\])*)$/.exec(sel.trim());
    if (!m) return false;
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    const classes = this.className.split(/\s+/);
    for (const p of (m[2].match(/[.#][\w-]+|\[[^\]]*\]/g) || [])) {
      if (p[0] === ".") { if (!classes.includes(p.slice(1))) return false; }
      else if (p[0] === "#") { if (this.attrs.id !== p.slice(1)) return false; }
      else {
        const a = /^\[([^=\]]+)(?:=\"?([^\"\]]*)\"?)?\]$/.exec(p);
        if (!a) return false;
        if (a[2] === undefined) { if (!this.hasAttribute(a[1])) return false; }
        else if (this.getAttribute(a[1]) !== a[2]) return false;
      }
    }
    return true;
  }
  closest(sel) {
    let n = this;
    while (n) { if (n.nodeType === 1 && n.matches(sel)) return n; n = n.parent; }
    return null;
  }
  _collect(sel, out) {
    for (const c of this.children) {
      if (c.nodeType !== 1) continue;
      if (c.matches(sel)) out.push(c);
      c._collect(sel, out);
    }
    return out;
  }
  querySelectorAll(sel) {
    let scopes = [this];
    sel.trim().split(/\s+/).forEach(part => {
      const out = [];
      scopes.forEach(s => s._collect(part, out));
      scopes = out;
    });
    return scopes;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }

  /* --- layout: position by index among element siblings, plus any transform --- */
  getBoundingClientRect() {
    let top = 0;
    if (this.parent) top = this.parent.elementChildren.indexOf(this) * ROW;
    const m = /translateY\((-?[\d.]+)px\)/.exec(this.style.transform || "");
    if (m) top += parseFloat(m[1]);
    return { top: top, height: ROW, bottom: top + ROW, left: 0, width: 300 };
  }

  /* --- events --- */
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener(t, f) {
    if (this.listeners[t]) this.listeners[t] = this.listeners[t].filter(x => x !== f);
  }
  /* Fires on this node and then up the tree, like a bubbling event. */
  fire(type, props) {
    const ev = Object.assign({
      target: this, preventDefault() { }, stopPropagation() { this._stop = true; },
      pointerId: 1
    }, props || {});
    let n = this;
    while (n) {
      (n.listeners[type] || []).slice().forEach(f => f(ev));
      if (ev._stop) break;
      n = n.parent;
    }
    return ev;
  }
  setPointerCapture() { }
  releasePointerCapture() { }
  focus() { this._focused = true; }
  blur() { this._focused = false; }
  scrollIntoView() { }
}

/* ---------- document ---------- */
const documentEl = new N("html");
const body = new N("body");
const doc = {
  readyState: "complete", documentElement: documentEl, body: body, hidden: false,
  createElement: t => new N(t),
  createTextNode: t => ({ nodeType: 3, text: String(t) }),
  getElementById: id => ids[id] || null,
  querySelector: s => body.querySelector(s),
  querySelectorAll: s => body.querySelectorAll(s),
  addEventListener: () => { }
};
function build(tag, attrs, ...kids) {
  const n = new N(tag);
  for (const k in (attrs || {})) n.setAttribute(k, attrs[k]);
  n.append(...kids);
  return n;
}
/* The static skeleton, matching index.html. */
body.append(
  build("header", { id: "top" },
    build("div", { id: "headtext" }, build("h1", { id: "dayTitle" }), build("div", { id: "dayMeta" })),
    build("button", { id: "gear" })),
  build("div", { id: "wrap" }, build("main", {},
    build("section", { id: "page-today", class: "page" }),
    build("section", { id: "page-tasks", class: "page hidden" }),
    build("section", { id: "page-projects", class: "page hidden" }),
    build("section", { id: "page-settings", class: "page hidden" }))),
  build("nav", { id: "tabs" },
    build("button", { "data-page": "today", class: "on" }, "Today"),
    build("button", { "data-page": "tasks" }, "Tasks"),
    build("button", { "data-page": "projects" }, "Projects")),
  build("div", { id: "modalHost" }, build("div", { class: "veil" }), build("div", { id: "modalBox" })),
  build("div", { id: "toast" })
);

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.document = doc;
global.window = { AudioContext: null, scrollTo: () => { }, addEventListener: () => { } };
/* Blocking dialogs are no-ops inside an installed PWA. Using one is a bug. */
["confirm", "alert", "prompt"].forEach(n => {
  global[n] = () => { throw new Error("blocking dialog used: " + n); };
  global.window[n] = global[n];
});

let pass = 0, fail = 0;
function ok(c, m) { c ? pass++ : (fail++, console.log("FAIL: " + m)); }
function eq(a, b, m) { ok(a === b, m + "  (got " + JSON.stringify(a) + ", wanted " + JSON.stringify(b) + ")"); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const T = require("./app.js")._test;    /* boot() runs here */
const state = T.getState();
const $ = id => ids[id];
const tab = name => doc.querySelectorAll("#tabs button").find(b => b.getAttribute("data-page") === name);
const rows = page => $(page).querySelectorAll(".task");
const rowFor = (page, text) => rows(page).find(r => r.textContent.includes(text));
const btn = (root, text) => root.querySelectorAll("button").find(b => b.textContent.trim() === text);
const btnHas = (root, text) => root.querySelectorAll("button").find(b => b.textContent.includes(text));

(async () => {

  /* ================= first run ================= */
  ok(state.tasks.length > 0, "a fresh install has tasks");
  ok($("modalHost").classList.contains("open"), "the setup sheet opens on first run");
  ok($("modalHost").textContent.includes("Daily Task Manager"), "and names the app");
  ok(!$("modalHost").textContent.toLowerCase().includes("posture"),
    "setup does not ask about a posture routine");
  btn($("modalHost"), "Start").fire("click");
  ok(!$("modalHost").classList.contains("open"), "and closes when started");
  ok(state.profile.setupComplete, "setup is not asked for twice");

  /* Make every day a workday so the rest is not sensitive to today's weekday. */
  state.profile.workdays = [0, 1, 2, 3, 4, 5, 6];
  T.render();

  /* ================= today ================= */
  ok($("dayTitle").textContent.length > 6, "the day is named in the header");
  ok(/left|all done/.test($("dayMeta").textContent), "the header says what is outstanding");
  ok($("page-today").textContent.includes("Leave home"), "a workday shows when to leave");
  ok($("page-today").querySelector(".card.work"), "in its own strip, not as fake tasks");
  const brush = rowFor("page-today", "Brush teeth after waking");
  ok(!!brush, "a daily routine is on the list");
  ok(!!brush.getAttribute("data-row"), "every row is addressable for dragging");
  ok(!!brush.querySelector(".grip"), "and has a grip to drag it by");

  /* ================= opening a task edits it in place ================= */
  ok(!brush.querySelector(".editor"), "a row starts collapsed");
  brush.querySelector(".tmid").fire("click");
  let open = rowFor("page-today", "Brush teeth after waking");
  const ed = open.querySelector(".editor");
  ok(!!ed, "tapping a task opens the editor inside the row");
  ok(open.classList.contains("open"), "and marks the row as open");
  ok(!$("modalHost").classList.contains("open"), "without opening a dialog or leaving the page");

  const id = open.getAttribute("data-row");
  const task = state.tasks.find(t => t.id === id);
  const title = ed.querySelector(".titleInput");
  eq(title.value, "Brush teeth after waking", "the title is there to edit");
  title.value = "Brush teeth properly";
  title.fire("input");
  eq(task.title, "Brush teeth properly", "typing edits the real task at once");

  /* when */
  ok(ed.textContent.includes("When"), "the editor covers when it happens");
  btn(ed, "Weekly").fire("click");
  eq(task.repeat.kind, "weekly", "the repeat can be changed in the task");
  open = rowFor("page-today", "Brush teeth properly");
  ok(open.querySelector(".pills"), "weekly reveals the day picker");
  const pills = open.querySelectorAll(".pill");
  const before = task.repeat.days.slice();
  pills[3].fire("click");
  ok(task.repeat.days.length !== before.length, "tapping a day changes the schedule");
  btn(open.querySelector(".editor"), "Every day").fire("click");
  eq(task.repeat.kind, "daily", "and back again");

  /* time and alarm -- the old Alarms page, now inside the task */
  open = rowFor("page-today", "Brush teeth properly");
  let e2 = open.querySelector(".editor");
  ok(e2.textContent.includes("Alarm"), "the alarm lives in the task");
  const sw = e2.querySelector(".switch input");
  sw.checked = true;
  sw.fire("change");
  eq(task.alarm, false, "an alarm is refused until there is a clock time");
  ok($("toast").textContent.includes("clock time"), "and says why");
  const timeInp = e2.querySelectorAll("input").find(i => i.getAttribute("type") === "time");
  timeInp.value = "07:30";
  timeInp.fire("change");
  eq(task.time, "07:30", "a clock time can be set in the task");
  e2 = rowFor("page-today", "Brush teeth properly").querySelector(".editor");
  const sw2 = e2.querySelector(".switch input");
  sw2.checked = true;
  sw2.fire("change");
  eq(task.alarm, true, "then the alarm can be armed");
  ok(rowFor("page-today", "Brush teeth properly").textContent.includes("07:30"),
    "and the row shows the time");

  /* urgency -- the old priority page, now inside the task */
  e2 = rowFor("page-today", "Brush teeth properly").querySelector(".editor");
  btn(e2, "Urgent").fire("click");
  eq(task.urgency, "urgent", "urgency is set on the task");
  ok(rowFor("page-today", "Brush teeth properly").classList.contains("u-urgent"),
    "and shows on the row");

  /* steps */
  e2 = rowFor("page-today", "Brush teeth properly").querySelector(".editor");
  btn(e2, "+ Add step").fire("click");
  eq(task.steps.length, 1, "a step can be added");
  e2 = rowFor("page-today", "Brush teeth properly").querySelector(".editor");
  const stepInp = e2.querySelector(".step").querySelector("input");
  stepInp.value = "Floss first";
  stepInp.fire("input");
  eq(task.steps[0].title, "Floss first", "and named");
  e2.querySelector(".step").querySelector(".check").fire("click");
  ok(task.steps[0].done, "and ticked off");

  /* closing */
  e2 = rowFor("page-today", "Brush teeth properly").querySelector(".editor");
  btn(e2, "Close").fire("click");
  ok(!rowFor("page-today", "Brush teeth properly").querySelector(".editor"),
    "Close collapses the row again");

  /* ================= completing ================= */
  const activeBefore = T.tasksFor(state.today).filter(t => !state.days[state.today] || !state.days[state.today].done[t.id]).length;
  rowFor("page-today", "Brush teeth properly").querySelector(".check").fire("click");
  await sleep(300);
  ok(state.days[state.today].done[id], "the checkbox completes the task");
  ok($("page-today").textContent.includes("Completed today"), "a completed section appears");
  const openCount = T.tasksFor(state.today).filter(t => !state.days[state.today].done[t.id]).length;
  eq(openCount, activeBefore - 1, "one fewer task is outstanding");
  btnHas($("page-today"), "Completed today").fire("click");
  ok(rowFor("page-today", "Brush teeth properly"), "completed tasks can be looked at");
  const doneRow = rowFor("page-today", "Brush teeth properly");
  ok(doneRow.classList.contains("done"), "and are marked as done");
  doneRow.querySelector(".check").fire("click");
  ok(!state.days[state.today].done[id], "ticking again undoes it");

  /* ================= adding ================= */
  const n0 = state.tasks.length;
  btn($("page-today"), "+  Add a task for today").fire("click");
  eq(state.tasks.length, n0 + 1, "a task can be added straight from Today");
  const fresh = state.tasks[state.tasks.length - 1];
  eq(fresh.date, state.today, "dated for today");
  const freshRow = $("page-today").querySelectorAll(".task").find(r => r.getAttribute("data-row") === fresh.id);
  ok(freshRow && freshRow.querySelector(".editor"), "and opens ready to be typed into");
  ok(freshRow.querySelector(".titleInput")._focused, "with the keyboard in the title");
  const ft = freshRow.querySelector(".titleInput");
  ft.value = "Ring the optician";
  ft.fire("input");
  eq(fresh.title, "Ring the optician", "the new task takes its title");

  /* move it to another day */
  let fr = $("page-today").querySelectorAll(".task").find(r => r.getAttribute("data-row") === fresh.id);
  btn(fr.querySelector(".editor"), "Tomorrow").fire("click");
  eq(fresh.date, T.addDays(state.today, 1), "and can be pushed to tomorrow");
  ok(!$("page-today").textContent.includes("Ring the optician"), "leaving today's list");

  /* ================= tasks page ================= */
  tab("tasks").fire("click");
  const tp = $("page-tasks");
  ok(tp.textContent.includes("Repeating"), "the Tasks page groups repeating work");
  ok(tp.textContent.includes("Scheduled"), "dated one-offs");
  ok(tp.textContent.includes("Someday"), "and a Someday shelf");
  ok(tp.textContent.includes("Every day") || tp.textContent.includes("Mon"),
    "each row says when it repeats");

  btn(tp, "Someday " + state.tasks.filter(t => t.bucket === "someday" && !t.archived).length).fire("click");
  const shelf = $("page-tasks");
  ok(shelf.textContent.includes("Flatten three empty delivery boxes"),
    "the old cleanup list is on the shelf");
  ok(shelf.textContent.includes("Dental examination"), "so is the dentist sequence");
  const dent = rowFor("page-tasks", "Dental examination");
  dent.querySelector(".tmid").fire("click");
  const dentT = state.tasks.find(t => t.title === "Dental examination");
  eq(dentT.steps.length, 4, "which kept its steps as an ordinary checklist");
  btn(rowFor("page-tasks", "Dental examination").querySelector(".editor"), "Move to today").fire("click");
  eq(dentT.bucket, "active", "and can be moved to today in one tap");
  ok($("page-today").textContent.includes("Dental examination"), "landing on Today");

  /* ================= projects ================= */
  tab("projects").fire("click");
  const pp = $("page-projects");
  ok(!pp.textContent.includes("Primary"), "projects have no primary");
  ok(!pp.textContent.includes("Secondary"), "and no secondary");
  ok(!pp.textContent.includes("Paused"), "and no paused or stored states");
  const plist = pp.querySelectorAll(".task");
  ok(plist.length === 4, "every project is simply listed");
  ok(plist.every(r => r.querySelector(".grip")), "each with a grip to drag it by");

  /* --- a real drag: move the second project above the first --- */
  const orderBefore = state.projects.slice().sort((a, b) => a.order - b.order).map(p => p.name);
  const holder = plist[0].parent;
  const second = holder.elementChildren[1];
  const g = second.querySelector(".grip");
  g.fire("pointerdown", { clientY: ROW * 1 + ROW / 2 });   /* grab its middle */
  g.fire("pointermove", { clientY: 20 });                   /* drag above the first */
  g.fire("pointerup", { clientY: 20 });
  const orderAfter = state.projects.slice().sort((a, b) => a.order - b.order).map(p => p.name);
  eq(orderAfter[0], orderBefore[1], "dragging a project up reorders the list");
  eq(orderAfter[1], orderBefore[0], "and pushes the other one down");
  ok(state.projects.every(p => typeof p.order === "number"), "the new order is saved");

  /* --- opening a project --- */
  tab("projects").fire("click");
  const first = $("page-projects").querySelectorAll(".task")[0];
  const pname = first.textContent;
  first.querySelector(".tmid").fire("click");
  const det = $("page-projects");
  ok(det.querySelector(".titleInput"), "a project opens with its name editable");
  ok(det.textContent.includes("Steps"), "and shows its steps");
  ok(btn(det, "+  Add step"), "steps can be added");
  const proj = state.projects.find(p => pname.includes(p.name));
  btn(det, "+  Add step").fire("click");
  const nSteps = proj.steps.length;
  ok(nSteps >= 2, "a step is added to the project");
  const si = $("page-projects").querySelectorAll(".stepInput")[nSteps - 1];
  si.value = "Order the panel";
  si.fire("input");
  eq(proj.steps[nSteps - 1].title, "Order the panel", "and named in place");

  /* pushing a project step onto today */
  const taskCount = state.tasks.length;
  btn($("page-projects").querySelectorAll(".step-row")[0], "Today").fire("click");
  eq(state.tasks.length, taskCount + 1, "a project step can be sent to Today");
  const pushed = state.tasks[state.tasks.length - 1];
  eq(pushed.projectId, proj.id, "and stays linked to its project");
  eq(pushed.date, state.today, "dated today");
  ok($("page-today").textContent.includes(pushed.title), "and visible on Today");

  /* ================= settings ================= */
  $("gear").fire("click");
  const st = $("page-settings");
  ok(!$("page-settings").classList.contains("hidden"), "the gear opens settings");
  ok(st.textContent.includes("Work"), "settings covers work");
  ok(st.textContent.includes("Backup"), "and backup");
  ok(/this browser/.test(st.textContent) && /website data/.test(st.textContent),
    "with the data-loss warning kept");
  ok(st.textContent.includes("version " + T.APP_VERSION), "and states its version");
  ok(!/posture/i.test(st.textContent), "the posture routine box is gone");
  ok(!/life area/i.test(st.textContent), "the life-area priority table is gone");
  ok(!/task load|how much per day/i.test(st.textContent), "and the daily task cap");
  ok(/only while the app is open/i.test(st.textContent), "the alarm limitation is stated plainly");
  ok(st.querySelectorAll(".card").length <= 7, "settings is short");

  btn(st, "Light").fire("click");
  eq(documentEl.attrs["data-theme"], "light", "the theme switches");
  btn($("page-settings"), "Dark").fire("click");
  eq(documentEl.attrs["data-theme"], "dark", "and back");
  btn($("page-settings"), "‹  Done").fire("click");
  ok(!$("page-today").classList.contains("hidden"), "Done returns to Today");

  /* ================= destructive actions ask first ================= */
  tab("tasks").fire("click");
  const victim = $("page-tasks").querySelectorAll(".task")[0];
  const vid = victim.getAttribute("data-row");
  victim.querySelector(".tmid").fire("click");
  btn($("page-tasks").querySelectorAll(".task").find(r => r.getAttribute("data-row") === vid).querySelector(".editor"),
    "Delete").fire("click");
  ok($("modalHost").classList.contains("open"), "deleting asks first, in an in-app sheet");
  btn($("modalHost"), "Cancel").fire("click");
  ok(state.tasks.some(t => t.id === vid), "cancelling keeps the task");
  victim.querySelector(".tmid").fire("click");
  const again = $("page-tasks").querySelectorAll(".task").find(r => r.getAttribute("data-row") === vid);
  btn(again.querySelector(".editor"), "Delete").fire("click");
  btn($("modalHost"), "Delete").fire("click");
  ok(!state.tasks.some(t => t.id === vid), "confirming deletes it");

  /* ================= nothing was lost to storage ================= */
  ok(store[T.LS_KEY], "state is written to localStorage");
  const saved = JSON.parse(store[T.LS_KEY]);
  ok(saved.tasks.length === state.tasks.length, "with every task");
  ok(saved.projects.length === 4, "and every project");
  ok(saved.schemaVersion === T.SCHEMA_VERSION, "under the current schema version");
  ok(!store["dailyTaskManagerV1"], "the old key is never written to");

  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.log("FAIL: threw " + (e && e.stack ? e.stack : e));
  console.log(pass + " passed, " + (fail + 1) + " failed");
  process.exit(1);
});
