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
  get parentElement() { return this.parent && this.parent.nodeType === 1 ? this.parent : null; }
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

  /* --- layout: rows stack in order, each as tall as it says it is, plus any
     transform. Heights can differ (_h), because real task rows do: one with a
     repeat line and a step count is taller than a bare one, and that is exactly
     where a sortable goes wrong. --- */
  getBoundingClientRect() {
    let top = 0;
    const h = this._h || ROW;
    if (this.parent) {
      for (const s of this.parent.elementChildren) {
        if (s === this) break;
        top += (s._h || ROW);
      }
    }
    const m = /translateY\((-?[\d.]+)px\)/.exec(this.style.transform || "");
    if (m) top += parseFloat(m[1]);
    return { top: top, height: h, bottom: top + h, left: 0, width: 300 };
  }

  /* --- events --- */
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener(t, f) {
    if (this.listeners[t]) this.listeners[t] = this.listeners[t].filter(x => x !== f);
  }
  /* Fires on this node and then up the tree, like a bubbling event, finishing
     at the document -- where the drag and the tap-outside handlers listen. */
  fire(type, props) {
    const ev = Object.assign({
      target: this, cancelable: true,
      preventDefault() { }, stopPropagation() { this._stop = true; },
      pointerId: 1
    }, props || {});
    let n = this;
    while (n) {
      (n.listeners[type] || []).slice().forEach(f => f(ev));
      if (ev._stop) break;
      n = n.parent;
    }
    if (!ev._stop) (doc.listeners[type] || []).slice().forEach(f => f(ev));
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
  /* Icons are real SVG nodes, so the namespace form has to exist too. */
  createElementNS: (ns, t) => { const n = new N(t); n.namespaceURI = ns; return n; },
  createTextNode: t => ({ nodeType: 3, text: String(t) }),
  getElementById: id => ids[id] || null,
  querySelector: s => body.querySelector(s),
  querySelectorAll: s => body.querySelectorAll(s),
  listeners: {},
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
  removeEventListener(t, f) {
    if (this.listeners[t]) this.listeners[t] = this.listeners[t].filter(x => x !== f);
  }
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
    build("section", { id: "page-calendar", class: "page hidden" }),
    build("section", { id: "page-settings", class: "page hidden" }))),
  build("nav", { id: "tabs" },
    build("button", { "data-page": "today", class: "on" }, "Today"),
    build("button", { "data-page": "tasks" }, "Tasks"),
    build("button", { "data-page": "projects" }, "Projects"),
    build("button", { "data-page": "calendar" }, "Calendar")),
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

  /* --- notes stay out of the way until asked for --- */
  ok(!ed.querySelector("textarea"), "an empty task shows no notes box");
  btn(ed, "+ Add a note").fire("click");
  const noteBox = rowFor("page-today", "Brush teeth properly").querySelector("textarea");
  ok(!!noteBox, "asking for a note reveals the box");
  noteBox.value = "floss too";
  noteBox.fire("input");
  eq(task.title === "Brush teeth properly" && task.notes, "floss too", "which writes to the task");

  /* --- when: a repeating task is offered frequencies, never a single date --- */
  const ed2 = () => rowFor("page-today", "Brush teeth properly").querySelector(".editor");
  ok(ed2().textContent.includes("How often"), "a repeating task asks how often");
  ok(!btn(ed2(), "Once"), "and is not offered a one-off date option");
  ok(!ed2().querySelectorAll("input").some(i => i.getAttribute("type") === "date"),
    "so there is no date field on it at all");
  btn(ed2(), "Weekly").fire("click");
  eq(task.repeat.kind, "weekly", "the frequency can be changed in the task");
  ok(ed2().querySelector(".pills"), "weekly reveals the day picker");
  const pills = ed2().querySelectorAll(".pill");
  const before = task.repeat.days.slice();
  pills[3].fire("click");
  ok(task.repeat.days.length !== before.length, "tapping a day changes the schedule");
  ok(ed2().textContent.includes("Times a week"), "a weekly task can carry a weekly target");
  btn(ed2(), "Monthly").fire("click");
  eq(task.repeat.kind, "monthly", "monthly is offered");
  ok(ed2().textContent.includes("Day of the month"), "with the day of the month");
  ok(!ed2().textContent.includes("Times a week"),
    "but a monthly task is not asked for a weekly target");

  /* --- "the first Saturday every month", which a date cannot express --- */
  ok(btn(ed2(), "On a weekday"), "monthly offers a weekday rule as well as a date");
  btn(ed2(), "On a weekday").fire("click");
  ok(task.repeat.nth !== null, "choosing it sets an occurrence");
  ok(!ed2().textContent.includes("Day of the month"),
    "and the day-of-the-month field steps aside");
  const sels = ed2().querySelectorAll("select");
  ok(sels.length >= 2, "an occurrence and a weekday to pick");
  const nthSel = sels[0], dowSel = sels[1];
  nthSel.value = "1"; nthSel.fire("change");
  dowSel.value = "6"; dowSel.fire("change");
  eq(task.repeat.nth, 1, "first");
  eq(task.repeat.dow, 6, "Saturday");
  eq(T.repeatLabel(task), "First Saturday of the month", "reads back plainly");
  ok(T.dueOn(task, "2026-08-01") && !T.dueOn(task, "2026-08-08"),
    "and lands on the first Saturday only");
  ok(/Next: /.test(ed2().textContent), "the next few dates are shown to confirm it");
  /* last-of-month is reachable too */
  nthSel.value = "-1"; nthSel.fire("change");
  eq(T.repeatLabel(task), "Last Saturday of the month", "Last is offered as well");
  /* and back to a plain date */
  btn(ed2(), "On a date").fire("click");
  eq(task.repeat.nth, null, "switching back clears the weekday rule");
  ok(ed2().textContent.includes("Day of the month"), "and the date field returns");
  btn(ed2(), "Every day").fire("click");
  eq(task.repeat.kind, "daily", "and back to daily");

  /* --- a repeating task can still become a one-off, and back --- */
  btn(ed2(), "Make it a one-off instead").fire("click");
  eq(task.repeat.kind, "once", "a repeating task can be turned into a one-off");
  ok(ed2().querySelectorAll("input").some(i => i.getAttribute("type") === "date"),
    "which then has a date field");
  ok(!ed2().textContent.includes("How often"), "and no frequency chooser");
  btn(ed2(), "Make it repeat instead").fire("click");
  eq(task.repeat.kind, "weekly", "and it can be turned back into a repeating task");
  btn(ed2(), "Every day").fire("click");

  /* --- time and alarm: the old Alarms page, now inside the task ---
     The native picker is a popover anchored to its input. Rebuilding the
     editor mid-scroll destroys that input and dismisses the wheel, which is
     why setting the hour used to close it before the minutes could be set. */
  ok(!ed2().querySelector(".switch"), "no alarm switch until there is a time to ring at");
  const timeField = () => ed2().querySelectorAll("input").find(i => i.getAttribute("type") === "time");
  const timeInp = timeField();
  timeInp.value = "07:00";                       /* the hour wheel */
  timeInp.fire("input");
  ok(timeField() === timeInp, "the field survives spinning the hour");
  timeInp.value = "07:30";                       /* then the minute wheel */
  timeInp.fire("change");
  ok(timeField() === timeInp, "and survives spinning the minutes");
  eq(task.time, "07:30", "the time is kept as it is chosen");
  ok(!ed2().querySelector(".switch"),
    "nothing is rebuilt while the picker is still open");
  timeInp.fire("blur");                          /* Done */
  const sw = ed2().querySelector(".switch input");
  ok(!!sw, "the alarm switch appears once the picker is finished with");
  sw.checked = true;
  sw.fire("change");
  eq(task.alarm, true, "and can be armed");
  ok(rowFor("page-today", "Brush teeth properly").querySelector(".bell"),
    "the row shows an alarm marker");
  ok(rowFor("page-today", "Brush teeth properly").textContent.includes("07:30"),
    "and the time");

  /* --- urgency: the old priority table, now inside the task --- */
  btn(ed2(), "Urgent").fire("click");
  eq(task.urgency, "urgent", "urgency is set on the task");
  ok(rowFor("page-today", "Brush teeth properly").classList.contains("u-urgent"),
    "and shows on the row");

  /* --- steps --- */
  btn(ed2(), "+ Break it into steps").fire("click");
  eq(task.steps.length, 1, "a step can be added");
  const stepInp = ed2().querySelector(".step").querySelector("input");
  stepInp.value = "Floss first";
  stepInp.fire("input");
  eq(task.steps[0].title, "Floss first", "and named");
  ed2().querySelector(".step").querySelector(".check").fire("click");
  ok(task.steps[0].done, "and ticked off");
  ok(btn(ed2(), "+ Add step"), "further steps can follow");

  /* closing */
  btn(ed2(), "Close").fire("click");
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

  /* --- a shelved task is offered nothing that needs a day --- */
  const shelfEd = () => rowFor("page-tasks", "Dental examination").querySelector(".editor");
  ok(shelfEd().textContent.includes("Not on a day"), "a shelved task says it has no day");
  ok(!shelfEd().textContent.includes("How often"), "and is not asked how often it repeats");
  ok(!shelfEd().querySelectorAll("input").some(i => i.getAttribute("type") === "date"),
    "nor given a date field");
  ok(!shelfEd().querySelectorAll("input").some(i => i.getAttribute("type") === "time"),
    "nor a clock time, which would have nothing to attach to");
  ok(!shelfEd().querySelector(".switch"), "nor an alarm");
  ok(!shelfEd().textContent.includes("Times a week"), "nor a weekly target");
  ok(shelfEd().textContent.includes("Urgency"), "but urgency still applies");
  ok(!btn(shelfEd(), "Not today"), "and it cannot be skipped from a day it is not on");
  ok(!btn(shelfEd(), "Tomorrow"), "or pushed to tomorrow");
  ok(btn(shelfEd(), "Pick a day"), "it can be given a day");

  btn(shelfEd(), "Put it on today").fire("click");
  eq(dentT.bucket, "active", "and can be moved to today in one tap");
  ok($("page-today").textContent.includes("Dental examination"), "landing on Today");
  /* now that it has a day, the timing controls are there */
  const nowEd = () => rowFor("page-today", "Dental examination").querySelector(".editor");
  rowFor("page-today", "Dental examination").querySelector(".tmid").fire("click");
  ok(nowEd().querySelectorAll("input").some(i => i.getAttribute("type") === "time"),
    "a task on a day can be given a clock time");
  ok(btn(nowEd(), "Tomorrow"), "and pushed to tomorrow");
  ok(btn(nowEd(), "Not today"), "or skipped");
  ok(btn(nowEd(), "Someday"), "or put back on the shelf");
  btn(nowEd(), "Close").fire("click");

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
  $("page-settings").querySelector(".back").fire("click");
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

  /* ================= tapping outside closes the open task ================= */
  tab("today").fire("click");
  const anyTask = $("page-today").querySelector(".task");
  const anyId = anyTask.getAttribute("data-row");
  anyTask.querySelector(".tmid").fire("click");
  ok(T.ui.open === anyId, "a task is open");
  /* the tap that opened it must not also close it */
  ok(!!$("page-today").querySelector(".editor"), "and stays open after the tap that opened it");
  /* a tap inside the editor keeps it open */
  $("page-today").querySelector(".editor").querySelector("input").fire("click");
  ok(T.ui.open === anyId, "tapping inside the editor keeps it open");
  /* the empty page beside the column closes it */
  $("wrap").fire("click");
  eq(T.ui.open, null, "tapping the page outside closes it");
  ok(!$("page-today").querySelector(".editor"), "and the editor is gone");
  /* adding a task opens it and it must survive its own tap */
  btn($("page-today"), "+  Add a task for today").fire("click");
  ok(T.ui.open !== null && !!$("page-today").querySelector(".editor"),
    "a newly added task stays open");
  const strayId = T.ui.open;
  $("wrap").fire("click");
  eq(T.ui.open, null, "and closes on an outside tap like any other");
  T.deleteTask(strayId);

  /* ================= dragging quickly must still settle ================= */
  tab("projects").fire("click");
  {
    const list = $("page-projects").querySelector(".list");
    const names = () => [...list.children].filter(c => c.hasAttribute("data-row"))
      .map(c => c.querySelector(".ttitle").textContent);
    const before = names();
    const row = list.children[0];
    const g = row.querySelector(".grip");
    /* a flick: one big jump from the top of the list to past the bottom row */
    g.fire("pointerdown", { clientY: ROW * 0 + ROW / 2 });
    g.fire("pointermove", { clientY: ROW * 3 + ROW - 2 });
    g.fire("pointerup", { clientY: ROW * 3 + ROW - 2 });
    const after = names();
    eq(after[after.length - 1], before[0], "a fast flick lands the row at the far end");
    eq(after.length, before.length, "and nothing is lost on the way");
    ok([...list.children].every(c => !c.style.transform),
      "no row is left stranded with an offset");
    ok(!row.className.includes("dragging"), "and the drag state is cleared");
    ok(before.slice(1).every((n, i) => after[i] === n), "the others keep their order");

    /* and back again, in several small steps */
    const list2 = $("page-projects").querySelector(".list");
    const last = list2.children[list2.children.length - 1];
    const g2 = last.querySelector(".grip");
    const startY = ROW * 3 + ROW / 2;
    g2.fire("pointerdown", { clientY: startY });
    for (let s = 1; s <= 8; s++) g2.fire("pointermove", { clientY: startY - s * 24 });
    g2.fire("pointerup", { clientY: startY - 8 * 24 });
    eq(names()[0], before[0], "and a slow drag returns it to the top");
    ok([...list2.children].every(c => !c.style.transform), "again leaving nothing offset");
  }

  /* --- rows of different heights, flicked hard both ways --- */
  {
    tab("projects").fire("click");
    const list = $("page-projects").querySelector(".list");
    const rows = [...list.children].filter(c => c.hasAttribute("data-row"));
    [96, 48, 132, 60].forEach((h, i) => { rows[i]._h = h; });
    const names = () => [...list.children].filter(c => c.hasAttribute("data-row"))
      .map(c => c.querySelector(".ttitle").textContent);
    const before = names();
    const top = () => rows.map(r => r.getBoundingClientRect().top);

    /* grab the short second row and fling it well past the tall third one */
    const row = list.children[1];
    const g = row.querySelector(".grip");
    const r = row.getBoundingClientRect();
    g.fire("pointerdown", { clientY: r.top + r.height / 2 });
    g.fire("pointermove", { clientY: 400 });
    g.fire("pointerup", { clientY: 400 });
    let after = names();
    eq(after[after.length - 1], before[1], "an uneven list still lands it at the end");
    eq(after.length, 4, "with every row still present");
    ok([...list.children].every(c => !c.style.transform), "and none left stranded");

    /* now fling it back to the very top */
    const list3 = $("page-projects").querySelector(".list");
    const moved = list3.children[list3.children.length - 1];
    const g3 = moved.querySelector(".grip");
    const rr = moved.getBoundingClientRect();
    g3.fire("pointerdown", { clientY: rr.top + rr.height / 2 });
    g3.fire("pointermove", { clientY: -200 });
    g3.fire("pointerup", { clientY: -200 });
    after = names();
    eq(after[0], before[1], "and back to the very top");
    ok([...list3.children].every(c => !c.style.transform), "still nothing stranded");
    ok(new Set(after).size === 4, "no duplicates and nothing dropped");
    rows.forEach(r => { delete r._h; });
  }

  /* ================= the calendar ================= */
  tab("today").fire("click");
  /* something dated, so a square is certain to be lit */
  const dated = T.addTask({ title: "See the dentist", date: T.addDays(state.today, 3),
    start: state.today });
  T.setState(state);
  tab("calendar").fire("click");
  const cal = $("page-calendar");
  ok(!cal.classList.contains("hidden"), "the fourth tab opens the calendar");
  eq([...$("tabs").querySelectorAll("button")].pop().getAttribute("data-page"), "calendar",
    "and it sits all the way to the right");
  eq(cal.querySelectorAll(".caldow").length, 7, "seven weekday headings");
  const cells = () => $("page-calendar").querySelectorAll(".calcell");
  ok(cells().length % 7 === 0 && cells().length >= 28, "a whole number of weeks of squares");
  ok(cal.querySelector(".calmonth").textContent.length > 6, "the month is named");
  ok(cells().some(c => c.className.includes("today")), "today is marked");
  const litNow = cells().filter(c => /lit/.test(c.className));
  ok(litNow.length > 0, "days with something on them are lit");
  ok(litNow.every(c => c.querySelector(".calcount")), "and carry a count");
  /* the daily routine alone must not light a square */
  const plainDay = cells().find(c => !/lit|out/.test(c.className));
  ok(!!plainDay, "a day of routine only is left unlit");

  /* stepping months */
  const monthName = () => $("page-calendar").querySelector(".calmonth").textContent;
  const thisMonth = monthName();
  const navs = cal.querySelectorAll(".calnav");
  eq(navs.length, 2, "a way back and a way forward");
  navs[1].fire("click");
  ok(monthName() !== thisMonth, "forward moves to another month");
  $("page-calendar").querySelectorAll(".calnav")[0].fire("click");
  eq(monthName(), thisMonth, "and back again");
  /* twelve steps forward lands a year on */
  for (let i = 0; i < 12; i++) $("page-calendar").querySelectorAll(".calnav")[1].fire("click");
  const yr = parseInt(thisMonth.split(" ")[1], 10);
  eq(monthName(), thisMonth.split(" ")[0] + " " + (yr + 1), "twelve months on is the next year");
  ok(btnHas($("page-calendar"), "Back to this month"), "with a way back to now");
  btnHas($("page-calendar"), "Back to this month").fire("click");
  eq(monthName(), thisMonth, "which returns to the current month");

  /* tapping a day */
  const litCell = $("page-calendar").querySelectorAll(".calcell").find(c => /lit/.test(c.className));
  litCell.fire("click");
  ok($("modalHost").classList.contains("open"), "tapping a day opens a popup");
  const rowsInPopup = $("modalHost").querySelectorAll(".dayrow");
  ok(rowsInPopup.length > 0, "listing what is on that day");
  ok($("modalHost").textContent.length > 10, "under the date as its title");
  /* and the popup shows the routine too, even though it did not light the square */
  const anyDay = $("modalHost").textContent;
  ok(/Brush teeth|See the dentist|gym/i.test(anyDay), "with real task names in it");

  /* tapping a task goes to its editor */
  const target = rowsInPopup[0];
  const wantedTitle = target.querySelector(".ttitle").textContent;
  target.fire("click");
  ok(!$("modalHost").classList.contains("open"), "which closes the popup");
  ok(!$("page-tasks").classList.contains("hidden"), "and lands on the task list");
  const openRow = $("page-tasks").querySelectorAll(".task").find(r => r.querySelector(".editor"));
  ok(!!openRow, "with an editor open");
  eq(openRow.querySelector(".titleInput").value, wantedTitle, "on the task that was tapped");
  T.deleteTask(dated.id);

  /* adding straight onto a day */
  tab("calendar").fire("click");
  const before2 = state.tasks.length;
  $("page-calendar").querySelectorAll(".calcell")[8].fire("click");
  btnHas($("modalHost"), "Add a task on this day").fire("click");
  eq(state.tasks.length, before2 + 1, "a day popup can start a task on that day");
  const made = state.tasks[state.tasks.length - 1];
  ok(!!made.date, "dated to the day that was tapped");
  ok(!$("page-tasks").classList.contains("hidden") && T.ui.open === made.id,
    "and opens it ready to name");
  T.deleteTask(made.id);

  /* ================= it must look drawn, not typed =================
     Characters like U+2699 GEAR and U+23F0 ALARM CLOCK come out as colour
     emoji on iOS, in a different visual language and off-centre in a button.
     The static markup is pwatest's job; these are the icons built in script. */
  tab("today").fire("click");
  const svgIn = node => !!node && node.querySelectorAll("svg").length > 0;
  ok(svgIn($("page-today").querySelector(".grip")), "the drag grips are drawn icons");
  const undone = $("page-today").querySelectorAll(".task").find(r => !r.className.includes("done"));
  undone.querySelector(".check").fire("click");
  await sleep(300);
  let tickRow = $("page-today").querySelectorAll(".task").find(r => r.className.includes("done"));
  if (!tickRow) {
    btnHas($("page-today"), "Completed today").fire("click");
    tickRow = $("page-today").querySelectorAll(".task").find(r => r.className.includes("done"));
  }
  ok(svgIn(tickRow.querySelector(".check")), "so is the completion tick");
  tickRow.querySelector(".check").fire("click");

  const EMOJI = /[←-⇿⌀-⏿■-➿⬀-⯿️]/;
  ["today", "tasks", "projects", "settings"].forEach(page => {
    if (page === "settings") $("gear").fire("click"); else tab(page).fire("click");
    const hit = EMOJI.exec($("page-" + page).textContent);
    ok(!hit, "no symbol characters rendered on " + page + (hit ? " (found U+" +
      hit[0].codePointAt(0).toString(16).toUpperCase() + ")" : ""));
  });

  /* ================= the header describes the page it is on ================= */
  tab("today").fire("click");
  ok(/Workday|Day off/.test($("dayMeta").textContent), "Today says what kind of day it is");
  tab("tasks").fire("click");
  ok(/on the shelf/.test($("dayMeta").textContent), "Tasks counts the shelf instead");
  tab("projects").fire("click");
  ok(/project/.test($("dayMeta").textContent), "Projects counts projects");
  $("gear").fire("click");
  eq($("dayMeta").textContent, "Settings", "and Settings just says so");

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
