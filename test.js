"use strict";
/* Core logic tests. Run: node test.js
   No dependencies, no DOM. The app only boots when document and window exist,
   so requiring it here just hands back the test seam. */
const T = require("./app.js")._test;

let pass = 0, fail = 0;
function ok(cond, msg) { cond ? pass++ : (fail++, console.log("FAIL: " + msg)); }
function eq(a, b, msg) { ok(a === b, msg + "  (got " + JSON.stringify(a) + ", wanted " + JSON.stringify(b) + ")"); }

const SUN = "2026-07-26";   /* Sunday */
const MON = "2026-07-27";
const TUE = "2026-07-28";
const SAT = "2026-08-01";

/* A clean state with no seed content, so every test says what it means. */
function base(today) {
  const s = T.defaultState();
  s.tasks = [];
  s.projects = [];
  s.days = {};
  T.setState(s);
  s.today = today || SUN;
  return s;
}
function add(s, o) {
  const t = T.newTask(o);
  s.tasks.push(t);
  return t;
}
const daily = () => ({ kind: "daily", days: [], dom: 1, every: 2, unit: "week" });
const weekly = d => ({ kind: "weekly", days: d, dom: 1, every: 2, unit: "week" });
const monthly = d => ({ kind: "monthly", days: [], dom: d, every: 2, unit: "week" });
const every = (n, u) => ({ kind: "every", days: [], dom: 1, every: n, unit: u });

/* ================= the personal day ================= */
{
  const s = base();
  s.profile.dayReset = "14:00";
  eq(T.personalDayKey(new Date(2026, 6, 26, 13, 59)), "2026-07-25",
    "13:59 still belongs to the day before");
  eq(T.personalDayKey(new Date(2026, 6, 26, 14, 0)), "2026-07-26",
    "14:00 starts the new personal day");
  eq(T.personalDayKey(new Date(2026, 6, 27, 0, 30)), "2026-07-26",
    "00:30 after a late shift still counts as the day before");

  /* Ordering inside a day that begins at 14:00. */
  eq(T.dayMinutes("14:00"), 0, "the reset time is minute zero");
  ok(T.dayMinutes("15:50") < T.dayMinutes("23:30"), "evening runs in order");
  ok(T.dayMinutes("23:30") < T.dayMinutes("04:00"), "04:00 is late in the day, not early");
  ok(T.dayMinutes("04:00") < T.dayMinutes("13:00"), "13:00 is the very end of the day");
}

/* ================= work times ================= */
{
  const s = base();
  Object.assign(s.profile, {
    shiftStart: "15:18", arrivalMargin: 5, parkingWalk: 5,
    commuteNormal: 12, commuteSlow: 20, prepDuration: 30
  });
  const wt = T.workTimes(s.profile);
  eq(wt.arrive, "15:13", "arrival is the shift start minus the margin");
  eq(wt.leave, "14:56", "leaving allows for parking and a normal commute");
  eq(wt.leaveSlow, "14:48", "slow traffic means leaving earlier");
  eq(wt.prep, "14:26", "getting ready starts before leaving");
  eq(wt.bed, "14:21", "out of bed five minutes before that");
  s.profile.workdays = [1, 2, 3, 4, 5];
  ok(T.isWorkday(MON) && !T.isWorkday(SUN), "workdays come from the profile");
}

/* ================= when a task is due ================= */
{
  const s = base();
  const d = add(s, { title: "Brush teeth", repeat: daily(), start: SUN });
  ok(T.dueOn(d, SUN) && T.dueOn(d, MON), "a daily task is due every day");
  ok(!T.dueOn(d, "2026-07-25"), "but never before it existed");

  const w = add(s, { title: "Washing", repeat: weekly([6, 0]), start: SUN });
  ok(T.dueOn(w, SUN), "weekly matches Sunday");
  ok(T.dueOn(w, SAT), "weekly matches Saturday");
  ok(!T.dueOn(w, MON), "weekly skips Monday");

  const m = add(s, { title: "Vacuum", repeat: monthly(31), start: SUN });
  ok(T.dueOn(m, "2026-07-31"), "day 31 lands in a 31-day month");
  ok(T.dueOn(m, "2026-09-30"), "day 31 falls back to the last day of a short month");
  ok(!T.dueOn(m, "2026-09-29"), "and not the day before that");

  const e = add(s, { title: "Cables", repeat: every(2, "week"), start: SUN });
  ok(T.dueOn(e, SUN), "an interval task that has never been done is due now");
  e.lastDone = SUN;
  ok(!T.dueOn(e, T.addDays(SUN, 13)), "not due after thirteen days");
  ok(T.dueOn(e, T.addDays(SUN, 14)), "due again after two weeks");

  const o = add(s, { title: "Call the dentist", date: MON, start: SUN });
  ok(T.dueOn(o, MON) && !T.dueOn(o, SUN), "a one-off is due on its date only");
  o.date = null;
  ok(!T.dueOn(o, MON), "a one-off with no date is never due by itself");

  const sd = add(s, { title: "Someday thing", repeat: daily(), bucket: "someday", start: SUN });
  ok(!T.dueOn(sd, SUN), "nothing in Someday reaches a day on its own");
  const arch = add(s, { title: "Old thing", repeat: daily(), archived: true, start: SUN });
  ok(!T.dueOn(arch, SUN), "a finished task stops appearing");

  eq(T.repeatLabel(d), "Every day", "daily reads plainly");
  eq(T.repeatLabel(add(s, { repeat: every(1, "month"), start: SUN })), "Every month",
    "an interval of one is not written as 1");
}

/* ================= building a day ================= */
{
  const s = base();
  s.profile.dayReset = "14:00";
  const shower = add(s, { title: "Shower", repeat: daily(), time: "04:00", start: SUN });
  const wash = add(s, { title: "Washing", repeat: weekly([0]), time: "15:50", start: SUN });
  const plain = add(s, { title: "Tidy", repeat: daily(), start: SUN, order: 50 });

  const list = T.tasksFor(SUN).map(t => t.title);
  eq(list.join(","), "Washing,Shower,Tidy",
    "clock times first in personal-day order, then untimed");

  /* skipping */
  T.skipToday(shower.id);
  ok(T.tasksFor(SUN).map(t => t.id).indexOf(shower.id) < 0, "a skipped task leaves the day");
  ok(T.dueOn(shower, MON), "and comes back tomorrow");

  /* completing keeps it on the record */
  T.completeTask(wash.id, SUN);
  ok(T.tasksFor(SUN).map(t => t.id).indexOf(wash.id) >= 0, "a completed task stays visible today");
  eq(wash.lastDone, SUN, "completing records the day");
  ok(wash.doneDates.indexOf(SUN) >= 0, "and keeps it in the history");
  ok(!wash.archived, "a repeating task is not finished by being done once");

  T.uncompleteTask(wash.id, SUN);
  eq(wash.lastDone, null, "undoing clears the last-done day");
  eq(wash.doneDates.length, 0, "and the history entry");

  /* a one-off is finished for good */
  const once = add(s, { title: "Post the letter", date: SUN, start: SUN });
  T.completeTask(once.id, SUN);
  ok(once.archived, "a completed one-off archives itself");

  /* manual order wins */
  const ids = T.tasksFor(SUN).map(t => t.id);
  s.days[SUN].order = [plain.id].concat(ids.filter(i => i !== plain.id));
  eq(T.tasksFor(SUN)[0].id, plain.id, "a hand-made order overrides the clock");
}

/* ================= moving tasks between days ================= */
{
  const s = base();
  const one = add(s, { title: "Ring the optician", date: SUN, start: SUN });
  T.putOnDay(one.id, TUE);
  eq(one.date, TUE, "a one-off simply changes its date");
  ok(!T.dueOn(one, SUN), "so it leaves today");

  const rep = add(s, { title: "Gym", repeat: weekly([2]), start: SUN });
  s.today = TUE;
  T.putOnDay(rep.id, MON);
  ok(T.tasksFor(MON).map(t => t.id).indexOf(rep.id) >= 0,
    "a repeating task can be pulled onto another day");
  ok(T.tasksFor(TUE).map(t => t.id).indexOf(rep.id) < 0,
    "and is skipped on the day it moved from");
  ok(T.dueOn(rep, "2026-08-04"), "its own rule is untouched");

  const sd = add(s, { title: "Flatten boxes", bucket: "someday", start: SUN });
  T.putOnDay(sd.id, TUE);
  eq(sd.bucket, "active", "pulling something out of Someday activates it");
  ok(T.tasksFor(TUE).map(t => t.id).indexOf(sd.id) >= 0, "and puts it on the day");

  T.toSomeday(sd.id);
  eq(sd.bucket, "someday", "and it can go back on the shelf");
  ok(T.tasksFor(TUE).map(t => t.id).indexOf(sd.id) < 0, "leaving the day behind");
}

/* ================= deleting ================= */
{
  const s = base();
  const t = add(s, { title: "Temporary", repeat: daily(), start: SUN });
  T.completeTask(t.id, SUN);
  s.days[SUN].order = [t.id];
  T.deleteTask(t.id);
  eq(s.tasks.length, 0, "the task is gone");
  eq(Object.keys(s.days[SUN].done).length, 0, "and so is its completion record");
  eq(s.days[SUN].order.length, 0, "and its place in the order");
}

/* ================= weekly targets ================= */
{
  const s = base(SAT);                        /* Saturday 1 August */
  const gym = add(s, { title: "Gym", repeat: weekly([2, 4, 6, 0]), weeklyTarget: 4, start: "2026-07-01" });
  T.completeTask(gym.id, "2026-07-28");       /* Tuesday of that week */
  T.completeTask(gym.id, "2026-07-30");       /* Thursday */
  eq(T.doneThisWeek(gym, SAT), 2, "two sessions counted in the current week");
  eq(T.doneThisWeek(gym, "2026-08-04"), 0, "the count resets with the week");
  eq(T.weekKeyOf(SAT), "2026-07-27", "weeks start on Monday");
  eq(T.weekKeyOf("2026-08-02"), "2026-07-27", "and Sunday belongs to the week that began Monday");
}

/* ================= hostile input ================= */
{
  const bad = T.validateState({
    profile: { workdays: "monday", shiftStart: "99:99", commuteNormal: "abc", theme: "neon", dayReset: null },
    tasks: [
      { title: 42, urgency: "extreme", repeat: { kind: "fortnightly", days: [9, -1, 3] }, time: "25:00", minutes: "-5" },
      null,
      "not a task"
    ],
    projects: [{ name: { evil: true }, steps: "none", status: "amazing" }],
    days: { "not-a-date": { done: 1 }, "2026-07-26": { done: { a: "x" }, skip: "no", order: 7 } },
    settings: { firstDay: "yesterday" }
  });
  eq(bad.profile.shiftStart, "15:18", "an invalid time falls back to the default");
  eq(bad.profile.commuteNormal, 12, "a non-numeric duration falls back");
  eq(bad.profile.theme, "dark", "an unknown theme falls back to dark");
  eq(bad.profile.dayReset, "14:00", "a null reset time falls back");
  eq(bad.tasks.length, 3, "every entry is repaired rather than dropped");
  eq(bad.tasks[0].urgency, "normal", "an unknown urgency becomes normal");
  eq(bad.tasks[0].repeat.kind, "once", "an unknown repeat becomes a one-off");
  eq(bad.tasks[0].repeat.days.length, 1, "out-of-range weekdays are discarded");
  eq(bad.tasks[0].time, null, "an impossible clock time is dropped");
  eq(bad.tasks[0].minutes, 1, "a negative duration is clamped");
  eq(bad.projects[0].steps.length, 0, "a broken step list becomes empty");
  eq(bad.projects[0].status, "active", "an unknown project status becomes active");
  ok(!("not-a-date" in bad.days), "a key that is not a date is thrown away");
  ok(Array.isArray(bad.days["2026-07-26"].skip), "a broken skip list becomes an array");
  eq(bad.days["2026-07-26"].order, null, "a broken order becomes null");
  eq(bad.settings.firstDay, null, "an invalid first day becomes null");
  /* A corrupt store should become a fresh usable install, not an empty app. */
  ok(T.validateState(null).tasks.length > 0, "null falls back to a fresh install");
  eq(T.validateState("nonsense").profile.theme, "dark", "so does a string");
  eq(T.validateState({ tasks: [] }).tasks.length, 0,
    "but a real state with no tasks stays empty");

  /* the day store is capped */
  const many = { days: {} };
  for (let i = 0; i < 400; i++) many.days[T.addDays("2025-01-01", i)] = { done: {} };
  ok(Object.keys(T.validateState(many).days).length <= 160, "the day history is capped");
}

/* ================= backups ================= */
{
  const s = base();
  add(s, { title: "Keep me", repeat: daily(), start: SUN });
  const b = T.makeBackup();
  eq(b.app, "daily-task-manager", "the envelope names the app");
  eq(b.schemaVersion, 2, "and its schema version");
  ok(typeof b.exportedAt === "number", "and when it was made");
  ok(b.data && b.data.tasks.length === 1, "the payload sits under data");

  ok(!T.readBackup({ app: "gainz", schemaVersion: 1, data: {} }).ok, "a foreign backup is refused");
  ok(!T.readBackup({ app: "daily-task-manager", schemaVersion: 99, data: {} }).ok,
    "a newer schema is refused");
  ok(!T.readBackup(null).ok, "rubbish is refused");
  ok(!T.readBackup(42).ok, "a number is refused");
  ok(!T.readBackup({ nothing: true }).ok, "a file with no app data is refused");
  const good = T.readBackup(JSON.parse(JSON.stringify(b)));
  ok(good.ok && good.state.tasks.length === 1, "our own backup round-trips");
  const raw = T.readBackup({ profile: { shiftStart: "10:00" }, tasks: [] });
  ok(raw.ok && raw.state.profile.shiftStart === "10:00", "a bare state file is still accepted");
}

/* ================= migration from version 1 ================= */
{
  const v1 = {
    schemaVersion: 1,
    profile: {
      setupComplete: true, workdays: [1, 2, 3, 4, 5], shiftStart: "15:18", shiftEnd: "23:54",
      commuteNormal: 14, commuteSlow: 22, parkingWalk: 6, prepDuration: 35, arrivalMargin: 5,
      dayReset: "14:00", sleepTime: "05:00", wakeTime: "14:00",
      gymDays: [2, 4, 6, 0], gymTime: "18:30", gymDuration: 75,
      postureRoutine: "text that version 2 has no box for", theme: "dark", sound: true
    },
    areas: { home: { on: true, prio: "urgent", label: "Home clutter" } },
    templates: {
      rubbish: { status: "active", count: 3 },
      vacuum: { status: "finished", count: 12 }
    },
    sequences: {
      dentist: { step: 2, finished: false },
      glasses: { step: 0, finished: true }
    },
    maintenance: { m1: { title: "Do a ten-minute rubbish check", n: 1, unit: "week", dow: null } },
    custom: [
      { id: "seed_shower", title: "Shower", freq: "daily", days: [], time: "04:00", min: 20, finished: false },
      { id: "c1", title: "Water the plants", freq: "weekly", days: [3], time: null, min: 5, finished: false },
      { id: "c2", title: "Renew the parking permit", freq: "date", date: "2026-08-15", time: "09:00", finished: false }
    ],
    projects: [
      { id: "p1", name: "Music production", type: "Music", status: "Stored", next: "Pick one track", notes: "n" },
      { id: "p2", name: "Synthesizer build", type: "Electronics", status: "Primary", next: "Choose a module", notes: "" },
      { id: "p3", name: "Old finished thing", type: "x", status: "Completed", next: "", notes: "" }
    ],
    gymWeeks: {},
    settings: { firstDay: "2026-01-05", seededRoutines: true }
  };
  const today = T.dateKey(new Date());
  v1.gymWeeks[T.weekKeyOf(today)] = { done: 2, moves: [], missed: [] };

  const m = T.migrateV1(v1);
  ok(m, "a version 1 state migrates");
  T.setState(m);
  eq(m.schemaVersion, 2, "to schema 2");
  eq(m.settings.migratedFrom, "1", "and says where it came from");

  eq(m.profile.prepDuration, 35, "personal schedule values carry over");
  eq(m.profile.commuteSlow, 22, "including the slow commute");
  eq(m.profile.gymDuration, 75, "and the gym session length");
  eq(m.profile.gymTime, "18:30", "and the preferred gym time");
  eq(m.profile.setupComplete, true, "setup is not asked for again");
  ok(!("postureRoutine" in m.profile), "the posture text box is gone");
  ok(!("areas" in m), "the life-area priority table is gone");
  ok(!("templates" in m) && !("rotation" in m), "and the generator machinery with it");

  const byTitle = t => m.tasks.filter(x => x.title === t);
  eq(byTitle("Shower").length, 1, "a seeded routine is updated, not duplicated");
  eq(byTitle("Shower")[0].time, "04:00", "and keeps its clock time");
  eq(byTitle("Water the plants").length, 1, "the user's own task came across");
  eq(byTitle("Water the plants")[0].repeat.kind, "weekly", "as a weekly task");
  eq(byTitle("Water the plants")[0].repeat.days.join(","), "3", "on the right day");
  eq(byTitle("Renew the parking permit")[0].date, "2026-08-15", "a dated task keeps its date");
  eq(byTitle("Renew the parking permit")[0].repeat.kind, "once", "as a one-off");

  const rubbish = byTitle("Fill one bag with obvious rubbish")[0];
  ok(rubbish && rubbish.bucket === "someday", "cleanup work lands in Someday");
  ok(/3 times/.test(rubbish.notes), "with a note of what was already done");
  eq(byTitle("Do a ten-minute rubbish check")[0].repeat.kind, "every",
    "a maintenance routine becomes an interval task");
  eq(byTitle("Do a ten-minute rubbish check")[0].repeat.unit, "week", "with its own unit");

  const dentist = byTitle("Dental examination")[0];
  eq(dentist.steps.filter(s => s.done).length, 2, "an unfinished sequence keeps its progress");
  ok(byTitle("New glasses")[0].archived, "a finished sequence is archived");

  eq(m.projects.length, 3, "every project came across");
  eq(m.projects[0].name, "Synthesizer build", "the primary project is first in the order");
  eq(m.projects[0].steps[0].title, "Choose a module", "its next action became its first step");
  eq(m.projects.filter(p => p.status === "done").length, 1, "a completed project stays completed");
  ok(m.projects[0].order < m.projects[1].order, "the order is explicit");

  const gym = byTitle("Go to the gym")[0];
  eq(gym.repeat.days.join(","), "2,4,6,0", "gym days carry over");
  eq(gym.weeklyTarget, 4, "with the four-a-week target");
  eq(T.doneThisWeek(gym, today), 2, "and this week's count is not lost");

  /* a version 1 backup file goes through the same path */
  const r = T.readBackup({ app: "daily-task-manager", schemaVersion: 1, data: v1 });
  ok(r.ok && r.state.tasks.length > 0, "a version 1 backup imports");
  ok(/version 1/.test(r.note || ""), "and says it was upgraded");
  ok(!T.migrateV1({}), "a state with no profile is not treated as version 1");
}

/* ================= a fresh install is usable ================= */
{
  const s = T.defaultState();
  T.setState(s);
  s.today = SUN;
  ok(s.tasks.length > 10, "a new install has content");
  ok(s.tasks.some(t => t.title === "Go to the gym"), "including the gym");
  ok(s.tasks.filter(t => t.bucket === "someday").length >= 8, "and a stocked Someday shelf");
  ok(s.tasks.filter(t => t.bucket === "active").length >= 6, "and some active routines");
  ok(T.tasksFor(SUN).length > 0, "and today already has a list");
  ok(s.tasks.every(t => t.title.length > 0), "nothing ships untitled");
  ok(s.projects.length === 4 && s.projects.every(p => p.status === "active"),
    "projects start as a plain ordered list, with no primary or secondary");
  const orders = s.projects.map(p => p.order);
  ok(new Set(orders).size === orders.length, "each project has its own place in the order");
}

/* ================= the alarm schedule (the wall-device seam) ================= */
{
  const s = base();
  s.profile.dayReset = "14:00";
  s.profile.workdays = [1, 2, 3, 4, 5];
  add(s, { title: "Washing", repeat: weekly([0]), time: "15:50", alarm: true, start: SUN });
  add(s, { title: "Shower", repeat: daily(), time: "04:00", alarm: false, start: SUN });
  add(s, { title: "No clock time", repeat: daily(), start: SUN });
  add(s, { title: "Shelved", bucket: "someday", time: "12:00", start: SUN });
  const sch = T.alarmSchedule();
  const labels = sch.alarms.map(a => a.label);
  ok(labels.indexOf("Leave home") >= 0, "the work departure is in the schedule");
  ok(labels.indexOf("Washing") >= 0, "so is a timed task");
  ok(labels.indexOf("No clock time") < 0, "a task with no time is not");
  ok(labels.indexOf("Shelved") < 0, "and nothing from Someday is");
  eq(sch.dayReset, "14:00", "the reader is told when the day starts");
  ok(sch.timezone && sch.version, "the file identifies itself");
  const mins = sch.alarms.map(a => T.dayMinutes(a.time));
  ok(mins.every((v, i) => i === 0 || mins[i - 1] <= v), "sorted in personal-day order");
  ok(sch.alarms.every(a => !("id" in a)), "no app internals leak into the file");
}

/* ================= backup reminder ================= */
{
  const s = base();
  s.settings.firstDay = SUN;
  s.settings.lastExport = null;
  s.today = T.addDays(SUN, 10);
  ok(!T.backupDue(), "no nagging in the first two weeks");
  s.today = T.addDays(SUN, 20);
  ok(T.backupDue(), "a quiet reminder after that");
  s.settings.lastExport = s.today;
  ok(!T.backupDue(), "and none once a backup exists");
}

/* ================= hash routing ================= */
{
  global.location = { hash: "#projects" };
  eq(T.pageFromHash(), "projects", "a home-screen shortcut lands on its page");
  global.location = { hash: "#alarms" };
  eq(T.pageFromHash(), null, "a page that no longer exists is ignored");
  global.location = { hash: "" };
  eq(T.pageFromHash(), null, "an empty hash is ignored");
  delete global.location;
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
