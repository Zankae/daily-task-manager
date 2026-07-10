"use strict";
const {_test}=require("./app.js");
let pass=0,fail=0;
function ok(cond,msg){if(cond){pass++;}else{fail++;console.log("FAIL: "+msg);}}

const S=_test.defaultState();
_test.setState(S);

/* --- work time calculation (defaults: shift 15:18, margin 5, park 5, commute 12, prep 30) --- */
const wt=_test.workTimes(S.profile);
ok(wt.arrive==="15:13","arrive 15:13, got "+wt.arrive);
ok(wt.leave==="14:56","leave 14:56, got "+wt.leave);
ok(wt.prep==="14:26","prep 14:26, got "+wt.prep);
ok(wt.bed==="14:21","bed 14:21, got "+wt.bed);
ok(wt.leaveSlow==="14:48","slow leave 14:48, got "+wt.leaveSlow);

/* --- personal day crosses midnight --- */
ok(_test.personalDayKey(new Date(2026,6,7,2,30))==="2026-07-06","02:30 Tue belongs to Mon personal day");
ok(_test.personalDayKey(new Date(2026,6,7,14,0))==="2026-07-07","14:00 Tue starts Tue personal day");
ok(_test.personalDayKey(new Date(2026,6,7,13,59))==="2026-07-06","13:59 Tue still Mon");

/* --- Monday workday generation (2026-07-06 is a Monday) --- */
let tasks=_test.generateDay("2026-07-06");
const tpls=tasks.map(t=>t.tpl);
ok(tpls.includes("work_bed")&&tpls.includes("work_prep")&&tpls.includes("work_leave"),"Mon has 3 work tasks");
ok(tpls.includes("brush_am")&&tpls.includes("brush_pm"),"Mon has oral care am+pm");
ok(tpls.includes("cooking"),"Mon has cooking");
ok(!tpls.includes("groceries"),"Mon has no groceries");
ok(tasks.find(t=>t.tpl==="work_leave").time==="14:56","leave task uses calculated time");

/* --- Sunday (gym day + groceries) --- */
tasks=_test.generateDay("2026-07-05");
let s=tasks.map(t=>t.tpl);
ok(s.includes("groceries"),"Sun has groceries at 22:00: "+tasks.find(t=>t.tpl==="groceries").time);
ok(s.includes("gym"),"Sun default gym day has gym");
ok(!s.includes("work_leave"),"Sun is not a workday");

/* --- Tuesday gym workday: gym present, no big optional --- */
tasks=_test.generateDay("2026-07-07");
s=tasks.map(t=>t.tpl);
ok(s.includes("gym"),"Tue has gym");
const optionals=tasks.filter(t=>["home","seq","project"].includes(t.type)&&!RECOVERYTINY(t.tpl));
function RECOVERYTINY(id){return id==="carrybag";}
ok(optionals.length===0,"gym workday has no substantial optional, got "+optionals.map(t=>t.tpl).join(","));

/* --- Wednesday non-gym workday: exactly one optional --- */
tasks=_test.generateDay("2026-07-08");
const opts=tasks.filter(t=>["home","seq","project"].includes(t.type)||t.tpl==="posture");
ok(opts.length===1,"non-gym workday has exactly one optional, got "+opts.length);

/* --- task cap: very light on a free day --- */
S.profile.taskLoad="light";
tasks=_test.generateDay("2026-07-11"); /* Saturday, gym day */
const nonWork=tasks.filter(t=>t.type!=="work");
ok(nonWork.length<=4,"light cap respected on free day, got "+nonWork.length);
S.profile.taskLoad="normal";

/* --- gym week counting and move --- */
const g=_test.gymWeek("2026-07-07");
g.moves.push({from:"2026-07-07",to:"2026-07-08"});
ok(_test.isGymDay("2026-07-07")===false,"gym moved away from Tue");
ok(_test.isGymDay("2026-07-08")===true,"gym moved onto Wed");
g.moves.length=0;

/* --- sequences: one step at a time, dentist first (urgent) --- */
const S2=_test.defaultState();_test.setState(S2);
tasks=_test.generateDay("2026-07-08"); /* Wed non-gym workday, rotation.opt=0 -> seq first */
const seqTask=tasks.find(t=>t.type==="seq");
ok(seqTask&&seqTask.seq==="dentist"&&seqTask.stepIndex===0,"dentist step 1 offered first");
ok(tasks.filter(t=>t.type==="seq").length<=1,"only one sequence step per day");

/* --- finished recovery template is never generated --- */
S2.templates.cables.status="resolved";
let found=false;
for(let i=0;i<40;i++){const ts=_test.generateDay("2026-07-05");
  if(ts.some(t=>t.tpl==="cables"))found=true;}
ok(!found,"resolved cables recovery never generated");

/* --- disabled template never generated --- */
S2.templates.rubbish.status="disabled";
found=false;
for(let i=0;i<40;i++){const ts=_test.generateDay("2026-07-05");
  if(ts.some(t=>t.tpl==="rubbish"))found=true;}
ok(!found,"disabled rubbish template never generated");

/* --- maintenance due logic --- */
const m={title:"Vacuum the whole apartment",n:1,unit:"month",dow:6,nextDue:"2026-08-01",lastDone:null};
ok(!_test.maintDueOn(m,"2026-07-25"),"maintenance not due before nextDue");
ok(!_test.maintDueOn(m,"2026-08-03"),"monthly vacuum waits for Saturday (Aug 3 is Monday)");
ok(_test.maintDueOn(m,"2026-08-08"),"monthly vacuum due on the Saturday after nextDue");
ok(_test.addRecur("2026-07-06",1,"month")==="2026-08-06","addRecur month");
ok(_test.addRecur("2026-07-06",2,"week")==="2026-07-20","addRecur weeks");

/* --- maintenance appears in home slot when due --- */
S2.maintenance.vacuum={title:"Vacuum the whole apartment",n:1,unit:"month",dow:null,nextDue:"2026-07-01",lastDone:null};
tasks=_test.generateDay("2026-07-05");
ok(tasks.some(t=>t.maintId==="vacuum"),"due maintenance takes the home slot");
delete S2.maintenance.vacuum;

/* --- primary project generates a task; paused/completed do not --- */
S2.projects[0].status="Primary";
tasks=_test.generateDay("2026-07-11");
ok(tasks.some(t=>t.type==="project"),"primary project task generated on free day");
S2.projects[0].status="Completed";
found=false;
for(let i=0;i<10;i++){if(_test.generateDay("2026-07-11").some(t=>t.type==="project"))found=true;}
ok(!found,"completed project generates nothing");

/* --- ensureDay archives + regenerates on rollover --- */
const S3=_test.defaultState();S3.profile.setupComplete=true;_test.setState(S3);
_test.ensureDay(new Date(2026,6,6,15,0));
ok(_test.getState().day.key==="2026-07-06","day created for Mon");
_test.getState().day.tasks[0].status="done";
_test.ensureDay(new Date(2026,6,7,15,0));
ok(_test.getState().day.key==="2026-07-07","rolled to Tue at 15:00");
ok(_test.getState().history.length===1&&_test.getState().history[0].key==="2026-07-06","Mon archived to history");
_test.ensureDay(new Date(2026,6,8,2,0));
ok(_test.getState().day.key==="2026-07-07","02:00 Wed still Tue personal day");

/* --- import validation --- */
ok(_test.validateState({foo:1})===null,"garbage import rejected");
ok(_test.validateState({schemaVersion:1,profile:{shiftStart:"bogus",commuteNormal:"999999"}})!==null,"partial import repaired");
const rep=_test.validateState({schemaVersion:1,profile:{shiftStart:"bogus"}});
ok(rep.profile.shiftStart==="15:18","bad time replaced with default");
const rep2=_test.validateState({schemaVersion:1,profile:{},templates:{cables:{status:"resolved",count:7}},
  maintenance:{cables:{title:"Check floors",n:2,unit:"week",nextDue:"2026-07-20"}}});
ok(rep2.templates.cables.status==="resolved"&&rep2.templates.cables.count===7,"resolved state survives import");
ok(rep2.maintenance.cables&&rep2.maintenance.cables.n===2,"maintenance survives import");

/* --- weekKey --- */
ok(_test.weekKeyOf("2026-07-05")==="2026-06-29","Sunday belongs to week starting Mon Jun 29");
ok(_test.weekKeyOf("2026-07-06")==="2026-07-06","Monday starts its own week");

/* --- custom (user-added) tasks --- */
(function(){
  const s=_test.defaultState();s.profile.setupComplete=true;
  s.custom=[
    {id:"c1",title:"Water the plants",freq:"daily",days:[],time:"",min:5,finished:false,notBefore:null},
    {id:"c2",title:"Call mother",freq:"weekly",days:[3],time:"",min:null,finished:false,notBefore:null}, /* Wednesdays */
    {id:"c3",title:"Return the parcel",freq:"once",days:[],time:"",min:null,finished:false,notBefore:null},
    {id:"c4",title:"Old habit",freq:"daily",days:[],time:"",min:null,finished:true,notBefore:null}
  ];
  _test.setState(s);
  const wed=_test.generateDay("2026-07-08"); /* Wednesday, workday */
  ok(wed.some(t=>t.customId==="c1"),"daily custom task appears");
  ok(wed.some(t=>t.customId==="c2"),"weekly custom task appears on its weekday");
  ok(wed.some(t=>t.customId==="c3"),"one-time custom task appears until done");
  ok(!wed.some(t=>t.customId==="c4"),"stopped custom task never appears");
  const thu=_test.generateDay("2026-07-09"); /* Thursday */
  ok(!thu.some(t=>t.customId==="c2"),"weekly custom task absent on other days");
  /* one-time completion stops it */
  s.day={key:"2026-07-08",tasks:wed};
  const inst=wed.find(t=>t.customId==="c3");
  _test.markDone(inst.id);
  ok(s.custom.find(c=>c.id==="c3").finished===true,"one-time custom task finishes on Done");
  ok(!_test.generateDay("2026-07-09").some(t=>t.customId==="c3"),"finished one-time task not regenerated");
  /* moved custom task appears on the moved day even off-pattern */
  const c2=s.custom.find(c=>c.id==="c2");c2.notBefore="2026-07-10"; /* Friday */
  ok(!_test.customDueOn(c2,"2026-07-08"),"moved task hidden before its new day");
  ok(_test.customDueOn(c2,"2026-07-10"),"moved task shows on the chosen day");
  ok(!_test.customDueOn(c2,"2026-07-11"),"after the move, weekly pattern resumes");
  ok(_test.customDueOn(c2,"2026-07-15"),"next Wednesday matches again");
  /* import validation */
  const rep=_test.validateState({schemaVersion:1,profile:{},custom:[
    {id:"x",title:"Imported task",freq:"weekly",days:[2,9,-1],min:"20"},
    {bad:true},{id:"y",title:12345}]});
  ok(rep.custom.length===1,"invalid custom entries dropped on import");
  ok(rep.custom[0].days.length===1&&rep.custom[0].days[0]===2,"weekday list sanitized");
  ok(rep.custom[0].min===20,"minutes coerced");
})();

/* --- dated one-time tasks --- */
(function(){
  const s=_test.defaultState();s.profile.setupComplete=true;
  s.custom=[{id:"d1",title:"Return the parcel",freq:"date",days:[],date:"2026-07-10",time:"",min:null,finished:false,notBefore:null}];
  _test.setState(s);
  ok(!s.custom.some(c=>_test.customDueOn(c,"2026-07-09")),"dated task hidden before its date");
  ok(_test.customDueOn(s.custom[0],"2026-07-10"),"dated task appears on its date");
  ok(_test.customDueOn(s.custom[0],"2026-07-12"),"missed dated task stays until done");
  const day=_test.generateDay("2026-07-10");
  const inst=day.find(t=>t.customId==="d1");
  ok(!!inst&&inst.desc==="Planned for 2026-07-10","dated instance labels its date");
  s.day={key:"2026-07-10",tasks:day,note:""};
  _test.markDone(inst.id);
  ok(s.custom[0].finished===true,"dated task finishes on Done");
  /* import: dated task without a date is dropped */
  const rep=_test.validateState({schemaVersion:1,profile:{},custom:[
    {id:"a",title:"Good",freq:"date",date:"2026-08-01"},
    {id:"b",title:"Broken",freq:"date"}]});
  ok(rep.custom.length===1&&rep.custom[0].id==="a","dated task without a date dropped on import");
})();

/* --- backup reminder --- */
(function(){
  const s=_test.defaultState();s.profile.setupComplete=true;
  s.day={key:"2026-07-20",tasks:[],note:""};
  s.settings.firstDay="2026-07-19";
  _test.setState(s);
  ok(_test.backupReminderDue()===false,"no reminder in the first two weeks");
  s.settings.firstDay="2026-07-01";
  ok(_test.backupReminderDue()===true,"reminder after 14 days without export");
  s.settings.lastExport="2026-07-15";
  ok(_test.backupReminderDue()===false,"recent export silences the reminder");
  s.settings.lastExport="2026-07-01";
  ok(_test.backupReminderDue()===true,"old export triggers again");
  s.settings.backupSnooze="2026-07-25";
  ok(_test.backupReminderDue()===false,"snooze silences it");
  s.settings.backupSnooze="2026-07-20";
  ok(_test.backupReminderDue()===true,"snooze day itself reminds again");
})();

/* --- daily note archives with the day --- */
(function(){
  const s=_test.defaultState();s.profile.setupComplete=true;
  _test.setState(s);
  _test.ensureDay(new Date(2026,6,15,16,0)); /* Wed afternoon */
  s.day.note="Slept badly, still got the gym done.";
  _test.ensureDay(new Date(2026,6,16,16,0)); /* Thu */
  const h=s.history[s.history.length-1];
  ok(h.key==="2026-07-15"&&h.note==="Slept badly, still got the gym done.","note archived to history");
  ok(s.day.note==="","new day starts with an empty note");
  /* note survives import */
  s.day.note="tonight's thought";
  const rep=_test.validateState(JSON.parse(JSON.stringify(s)));
  ok(rep.day.note==="tonight's thought","day note survives import");
  ok(rep.history.some(x=>x.note==="Slept badly, still got the gym done."),"history notes survive import");
  ok(rep.settings.firstDay===s.settings.firstDay,"settings survive import");
})();

/* --- seeded routines (shower, washing machine, dishwasher) --- */
(function(){
  const s=_test.defaultState();s.profile.setupComplete=true;
  _test.setState(s);
  _test.ensureSeedRoutines();
  const sh=s.custom.find(c=>c.id==="seed_shower");
  const wa=s.custom.find(c=>c.id==="seed_washing");
  const di=s.custom.find(c=>c.id==="seed_dishwasher");
  ok(sh&&sh.time==="04:00"&&sh.min===20&&sh.freq==="daily","shower seeded daily 04:00, 20 min");
  ok(wa&&wa.time==="15:50"&&wa.days.includes(6)&&wa.days.includes(0),"washing machine seeded Sat+Sun 15:50");
  ok(di&&di.time==="23:30"&&di.days.length===1&&di.days[0]===0,"dishwasher seeded Sundays 23:30");
  const tue=_test.generateDay("2026-07-07");
  ok(tue.some(t=>t.customId==="seed_shower"&&t.time==="04:00"),"shower on a Tuesday");
  ok(!tue.some(t=>t.customId==="seed_washing"),"no washing machine midweek");
  const sun=_test.generateDay("2026-07-12");
  ok(sun.some(t=>t.customId==="seed_washing"),"washing machine on Sunday");
  ok(sun.some(t=>t.customId==="seed_dishwasher"&&t.time==="23:30"),"dishwasher on Sunday");
  const sat=_test.generateDay("2026-07-11");
  ok(sat.some(t=>t.customId==="seed_washing"),"washing machine on Saturday");
  ok(!sat.some(t=>t.customId==="seed_dishwasher"),"no dishwasher on Saturday");
  /* seeding is one-shot: deleting a seed must not resurrect it */
  s.custom=s.custom.filter(c=>c.id!=="seed_dishwasher");
  _test.ensureSeedRoutines();
  ok(!s.custom.some(c=>c.id==="seed_dishwasher"),"deleted seed stays deleted");
  /* migration for a legacy state without the flag */
  const legacy=_test.validateState({schemaVersion:1,profile:{},custom:[{id:"mine",title:"Old task",freq:"daily"}]});
  _test.setState(legacy);
  _test.ensureSeedRoutines();
  ok(legacy.custom.some(c=>c.id==="seed_shower")&&legacy.custom.some(c=>c.id==="mine"),
    "legacy data gains seeds without losing existing tasks");
})();

/* --- editable groceries time --- */
(function(){
  const s=_test.defaultState();s.profile.setupComplete=true;
  s.profile.groceriesTime="20:15";
  _test.setState(s);
  const sun=_test.generateDay("2026-07-12");
  const g=sun.find(t=>t.tpl==="groceries");
  ok(g&&g.time==="20:15","groceries uses the edited time");
  const rep=_test.validateState({schemaVersion:1,profile:{groceriesTime:"nonsense"}});
  ok(rep.profile.groceriesTime==="22:00","bad groceries time falls back to default");
})();

/* --- home-screen shortcut routing --- */
(function(){
  const saved=global.location;
  global.location={hash:"#alarms"};
  ok(_test.pageFromHash()==="alarms","#alarms opens the Alarms page");
  global.location={hash:"#projects"};
  ok(_test.pageFromHash()==="projects","#projects opens the Projects page");
  global.location={hash:"#nonsense"};
  ok(_test.pageFromHash()===null,"unknown hash is ignored");
  global.location={hash:""};
  ok(_test.pageFromHash()===null,"empty hash is ignored");
  if(saved===undefined)delete global.location;else global.location=saved;
})();

/* --- backup envelope (aligned with GAINZ) --- */
(function(){
  const s=_test.defaultState();s.profile.setupComplete=true;s.profile.taskLoad="active";
  _test.setState(s);
  const b=_test.makeBackup();
  ok(b.app==="daily-task-manager","backup carries the app tag");
  ok(b.schemaVersion===1&&typeof b.exportedAt==="number","backup carries schema version and timestamp");
  ok(b.data&&b.data.profile.taskLoad==="active","backup wraps the state under data");
  /* round trip */
  const round=_test.readBackup(JSON.parse(JSON.stringify(b)));
  ok(round.ok&&round.state.profile.taskLoad==="active","enveloped backup restores");
  /* legacy raw-state file still restores */
  const legacy=_test.readBackup(JSON.parse(JSON.stringify(s)));
  ok(legacy.ok&&legacy.state.profile.setupComplete,"legacy raw-state backup still restores");
  /* wrong app rejected */
  const wrong=_test.readBackup({app:"gainz",schemaVersion:1,exportedAt:1,data:{}});
  ok(!wrong.ok&&/different app/.test(wrong.reason),"a GAINZ backup is rejected clearly");
  /* newer schema rejected */
  const newer=_test.readBackup({app:"daily-task-manager",schemaVersion:99,exportedAt:1,data:s});
  ok(!newer.ok&&/newer version/.test(newer.reason),"a newer-schema backup is refused");
  /* junk rejected */
  ok(!_test.readBackup(42).ok,"a non-object file is rejected");
  ok(!_test.readBackup({app:"daily-task-manager",schemaVersion:1,data:{nope:true}}).ok,"garbage data is rejected");
})();

console.log(pass+" passed, "+fail+" failed");
process.exit(fail?1:0);
