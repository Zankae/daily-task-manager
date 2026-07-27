"use strict";
/* ===========================================================================
   Daily Task Manager 2
   ---------------------------------------------------------------------------
   One idea runs through this file: a task is a single object, and everything
   about it -- when it repeats, its clock time, its alarm, its urgency, its
   steps -- is edited in the task itself. Nothing about a task lives on
   another page.

   A day does not own copies of tasks. It records what happened:
   what was completed, what was skipped, what was pulled in, what order they
   were put in. Every list on screen therefore edits the one real task.
   =========================================================================== */

/* ================= constants ================= */
const APP_VERSION="2.4.0";          /* keep in step with CACHE_VERSION in sw.js */
const SCHEMA_VERSION=2;
const LS_KEY="dailyTaskManagerV2";
const LS_KEY_V1="dailyTaskManagerV1";   /* read once for migration, never written */

const DAYNAMES=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYSHORT=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS=["January","February","March","April","May","June","July","August",
              "September","October","November","December"];
const URGENCIES=["normal","important","urgent"];
const DOT="\u00B7";
const ARROW="\u2192";

/* ================= small utilities ================= */
function parseHM(s){const p=String(s||"0:0").split(":");return (Number(p[0])||0)*60+(Number(p[1])||0);}
function fmtHM(mins){mins=((mins%1440)+1440)%1440;
  return String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");}
function dateKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function keyToDate(k){const p=String(k).split("-").map(Number);return new Date(p[0],p[1]-1,p[2]);}
function dowOf(k){return keyToDate(k).getDay();}
function addDays(k,n){const d=keyToDate(k);d.setDate(d.getDate()+n);return dateKey(d);}
function daysBetween(a,b){return Math.round((keyToDate(b)-keyToDate(a))/86400000);}
function weekKeyOf(k){const d=keyToDate(k);d.setDate(d.getDate()-((d.getDay()+6)%7));return dateKey(d);}
function uid(){return "t"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function clampInt(v,lo,hi,def){v=parseInt(v,10);if(isNaN(v))return def;return Math.min(hi,Math.max(lo,v));}
function validHM(s){return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(s||""));}
function validKey(s){return /^\d{4}-\d{2}-\d{2}$/.test(String(s||""));}
function str(v,max){return String(v===null||v===undefined?"":v).slice(0,max||200);}
function deviceTimeZone(){
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"device local time";}
  catch(e){return "device local time";}
}
function longDate(k){const d=keyToDate(k);
  return DAYNAMES[d.getDay()]+" "+d.getDate()+" "+MONTHS[d.getMonth()];}
function shortDate(k){const d=keyToDate(k);
  return DAYSHORT[d.getDay()]+" "+d.getDate()+" "+MONTHS[d.getMonth()].slice(0,3);}

/* ================= the personal day =================
   The day rolls over at profile.dayReset (14:00 by default), not midnight, so
   cooking at 00:30 after a late shift still belongs to the day before. Every
   piece of day logic goes through these two functions. */
function personalDayKey(now){
  const reset=parseHM(state.profile.dayReset);
  const d=new Date(now.getTime());
  if(d.getHours()*60+d.getMinutes()<reset)d.setDate(d.getDate()-1);
  return dateKey(d);
}
/* Minutes from the start of the personal day. 15:50 comes before 04:00 when
   the day begins at 14:00, and this is what puts the list in the right order. */
function dayMinutes(hm){
  const reset=parseHM(state.profile.dayReset);
  return ((parseHM(hm)-reset)+1440)%1440;
}
function nowDayMinutes(now){
  now=now||new Date();
  return dayMinutes(fmtHM(now.getHours()*60+now.getMinutes()));
}
function workTimes(p){
  const shift=parseHM(p.shiftStart);
  const arrive=shift-p.arrivalMargin;
  const leave=arrive-p.parkingWalk-p.commuteNormal;
  return {arrive:fmtHM(arrive),
          leave:fmtHM(leave),
          leaveSlow:fmtHM(arrive-p.parkingWalk-p.commuteSlow),
          prep:fmtHM(leave-p.prepDuration),
          bed:fmtHM(leave-p.prepDuration-5)};
}
function isWorkday(k){return (state.profile.workdays||[]).includes(dowOf(k));}

/* ================= the task ================= */
/* {id,title,notes,urgency,repeat:{kind,days,dom,every,unit},date,time,alarm,
    minutes,weeklyTarget,steps:[{id,title,done}],projectId,bucket,order,start,
    archived,lastDone,doneDates:[]}                                          */
function newTask(o){
  return sanitizeTask(Object.assign({
    id:uid(),title:"",notes:"",urgency:"normal",
    repeat:{kind:"once",days:[],dom:1,every:2,unit:"week"},
    date:null,time:null,alarm:false,minutes:null,weeklyTarget:null,
    steps:[],projectId:null,bucket:"active",order:nextOrder(),
    start:state&&state.today?state.today:dateKey(new Date()),
    archived:false,lastDone:null,doneDates:[]
  },o||{}));
}
function nextOrder(){
  if(!state||!state.tasks||!state.tasks.length)return 10;
  return Math.max.apply(null,state.tasks.map(t=>t.order||0))+10;
}
function sanitizeTask(t){
  t=t||{};
  const r=t.repeat||{};
  const kind=["once","daily","weekly","monthly","every"].includes(r.kind)?r.kind:"once";
  const out={
    id:typeof t.id==="string"&&t.id?t.id.slice(0,40):uid(),
    title:str(t.title,140),
    notes:str(t.notes,2000),
    urgency:URGENCIES.includes(t.urgency)?t.urgency:"normal",
    repeat:{
      kind:kind,
      days:Array.isArray(r.days)?r.days.map(Number).filter(n=>n>=0&&n<=6).slice(0,7):[],
      dom:clampInt(r.dom,1,31,1),
      /* A monthly task is either on a date (dom) or on the nth weekday of the
         month (nth + dow), which is how "first Saturday" is expressed. */
      nth:[1,2,3,4,-1].indexOf(Number(r.nth))>=0?Number(r.nth):null,
      dow:(r.dow===null||r.dow===undefined||isNaN(parseInt(r.dow,10)))?null:clampInt(r.dow,0,6,0),
      every:clampInt(r.every,1,365,2),
      unit:["day","week","month"].includes(r.unit)?r.unit:"week"
    },
    date:validKey(t.date)?t.date:null,
    time:validHM(t.time)?t.time:null,
    alarm:!!t.alarm,
    minutes:t.minutes===null||t.minutes===undefined||t.minutes===""?null:clampInt(t.minutes,1,1440,null),
    weeklyTarget:t.weeklyTarget?clampInt(t.weeklyTarget,1,14,null):null,
    steps:(Array.isArray(t.steps)?t.steps:[]).slice(0,60).map(sanitizeStep),
    projectId:typeof t.projectId==="string"?t.projectId.slice(0,40):null,
    bucket:t.bucket==="someday"?"someday":"active",
    order:clampInt(t.order,0,1e9,10),
    start:validKey(t.start)?t.start:dateKey(new Date()),
    archived:!!t.archived,
    lastDone:validKey(t.lastDone)?t.lastDone:null,
    doneDates:(Array.isArray(t.doneDates)?t.doneDates:[]).filter(validKey).slice(-80)
  };
  if(out.repeat.kind==="weekly"&&!out.repeat.days.length)out.repeat.days=[dowOf(out.start)];
  if(out.repeat.nth!==null&&out.repeat.dow===null)out.repeat.dow=dowOf(out.start);
  return out;
}
const NTH={"1":"First","2":"Second","3":"Third","4":"Fourth","-1":"Last"};
function sanitizeStep(s){
  s=s||{};
  return {id:typeof s.id==="string"&&s.id?s.id.slice(0,40):uid(),
          title:str(s.title,160),done:!!s.done};
}
function findTask(id){return (state.tasks||[]).find(t=>t.id===id)||null;}

/* Is this task on the list for day k by its own rules? Manual additions and
   completions are handled by tasksFor(), not here. */
function dueOn(t,k){
  if(!t||t.archived||t.bucket==="someday")return false;
  if(t.start&&daysBetween(t.start,k)<0)return false;
  const r=t.repeat||{};
  if(r.kind==="daily")return true;
  if(r.kind==="weekly")return (r.days||[]).includes(dowOf(k));
  if(r.kind==="monthly"){
    const d=keyToDate(k);
    const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    if(r.nth){
      if(d.getDay()!==r.dow)return false;
      /* Last of its kind: no further same weekday fits inside the month. */
      if(r.nth===-1)return d.getDate()+7>last;
      return Math.floor((d.getDate()-1)/7)+1===r.nth;
    }
    return d.getDate()===Math.min(r.dom||1,last);
  }
  if(r.kind==="every"){
    const n=Math.max(1,r.every||1);
    const span=r.unit==="week"?7*n:r.unit==="month"?30*n:n;
    if(!t.lastDone)return true;                  /* never done -- it is due */
    return daysBetween(t.lastDone,k)>=span;
  }
  return !!t.date&&t.date===k;                   /* once */
}
function repeatLabel(t){
  const r=t.repeat||{};
  if(r.kind==="daily")return "Every day";
  if(r.kind==="weekly"){
    const d=(r.days||[]).slice().sort((a,b)=>((a+6)%7)-((b+6)%7));
    if(d.length===7)return "Every day";
    return d.length?d.map(n=>DAYSHORT[n]).join(" "):"Weekly";
  }
  if(r.kind==="monthly"){
    if(r.nth)return NTH[String(r.nth)]+" "+DAYNAMES[r.dow]+" of the month";
    return "Day "+r.dom+" of the month";
  }
  if(r.kind==="every"){
    const n=r.every||1;
    return "Every "+(n===1?"":n+" ")+r.unit+(n===1?"":"s");
  }
  if(t.date)return shortDate(t.date);
  return "No date";
}
function isRepeating(t){return t.repeat&&t.repeat.kind!=="once";}
/* "First Saturday" lands on a different date every month, so show the next few
   it actually falls on rather than asking anyone to take it on trust. */
function nextMonthlyHint(r,from){
  const out=[];
  let k=from;
  for(let i=0;i<400&&out.length<3;i++){
    const d=keyToDate(k);
    if(d.getDay()===r.dow){
      const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
      const hit=r.nth===-1 ? d.getDate()+7>last
                           : Math.floor((d.getDate()-1)/7)+1===r.nth;
      if(hit)out.push(shortDate(k));
    }
    k=addDays(k,1);
  }
  return out.length?"Next: "+out.join(", "):null;
}
function doneThisWeek(t,k){
  const wk=weekKeyOf(k);
  return (t.doneDates||[]).filter(d=>weekKeyOf(d)===wk).length;
}
function stepsDone(t){return (t.steps||[]).filter(s=>s.done).length;}

/* ================= projects ================= */
function newProject(o){
  return sanitizeProject(Object.assign({id:uid(),name:"",notes:"",steps:[],
    order:(state&&state.projects&&state.projects.length
      ?Math.max.apply(null,state.projects.map(p=>p.order||0))+10:10),
    status:"active"},o||{}));
}
function sanitizeProject(p){
  p=p||{};
  return {id:typeof p.id==="string"&&p.id?p.id.slice(0,40):uid(),
          name:str(p.name,120),notes:str(p.notes,4000),
          steps:(Array.isArray(p.steps)?p.steps:[]).slice(0,120).map(sanitizeStep),
          order:clampInt(p.order,0,1e9,10),
          status:p.status==="done"?"done":"active"};
}
function findProject(id){return (state.projects||[]).find(p=>p.id===id)||null;}
function projectNext(p){const s=(p.steps||[]).find(x=>!x.done);return s?s.title:"";}

/* ================= starting content =================
   A new install is useful immediately: the routines the app was built around
   exist as ordinary, editable tasks, and the cleanup work sits in Someday
   until it is wanted. Nothing here is special-cased anywhere else. */
function seedTasks(profile){
  const today=dateKey(new Date());
  const mk=o=>newTask(Object.assign({start:today},o));
  const daily=()=>({kind:"daily",days:[],dom:1,every:2,unit:"week"});
  const weekly=d=>({kind:"weekly",days:d,dom:1,every:2,unit:"week"});
  const every=(n,u)=>({kind:"every",days:[],dom:1,every:n,unit:u});
  let n=0;
  const ord=()=>{n+=10;return n;};
  const active=[
    mk({title:"Brush teeth after waking",repeat:daily(),minutes:3,urgency:"important",order:ord()}),
    mk({title:"Go to the gym",repeat:weekly(profile.gymDays.slice()),minutes:profile.gymDuration||60,
        time:validHM(profile.gymTime)?profile.gymTime:null,weeklyTarget:4,urgency:"important",order:ord(),
        notes:"Four sessions a week. Move it to another day if one does not happen."}),
    mk({title:"Shower",repeat:daily(),time:"04:00",minutes:20,order:ord()}),
    mk({title:"Washing machine",repeat:weekly([6,0]),time:"15:50",order:ord()}),
    mk({title:"Dishwasher",repeat:weekly([0]),time:"23:30",order:ord()}),
    mk({title:"Grocery shopping",repeat:weekly([0]),time:"22:00",minutes:60,order:ord()}),
    mk({title:"Cook after work",repeat:weekly([1]),minutes:60,order:ord(),
        notes:"May happen after midnight. It still counts as Monday."}),
    mk({title:"Brush teeth before sleeping",repeat:daily(),minutes:3,urgency:"important",order:ord()}),
    /* Real recurring maintenance, so these belong on days rather than the shelf. */
    mk({title:"Check that no loose cables are on the floor",repeat:every(2,"week"),minutes:5,order:ord()}),
    mk({title:"Vacuum the whole apartment",repeat:every(1,"month"),minutes:45,order:ord()})
  ];
  const some=[
    mk({title:"Fill one bag with obvious rubbish",minutes:15,bucket:"someday",order:ord()}),
    mk({title:"Flatten three empty delivery boxes",minutes:10,bucket:"someday",order:ord()}),
    mk({title:"Collect loose cables from one section of the floor",minutes:10,bucket:"someday",order:ord()}),
    mk({title:"Clear one small section of floor",minutes:15,bucket:"someday",order:ord()}),
    mk({title:"Move five objects into the correct room",minutes:10,bucket:"someday",order:ord()}),
    mk({title:"Vacuum one cleared section of floor",minutes:10,bucket:"someday",order:ord()}),
    mk({title:"Sort one small storage-room category",minutes:10,bucket:"someday",order:ord()}),
    mk({title:"Dental examination",bucket:"someday",order:ord(),steps:[
        {id:uid(),title:"Choose a dentist",done:false},
        {id:uid(),title:"Find the contact information",done:false},
        {id:uid(),title:"Book the examination",done:false},
        {id:uid(),title:"Attend the examination",done:false}]}),
    mk({title:"New glasses",bucket:"someday",order:ord(),steps:[
        {id:uid(),title:"Choose an optician",done:false},
        {id:uid(),title:"Book an eye examination",done:false},
        {id:uid(),title:"Attend the eye examination",done:false},
        {id:uid(),title:"Look for suitable frames",done:false},
        {id:uid(),title:"Order the glasses",done:false},
        {id:uid(),title:"Collect and adjust them",done:false}]})
  ];
  return active.concat(some);
}
function seedProjects(){
  let n=0;const ord=()=>{n+=10;return n;};
  return [
    newProject({name:"Synthesizer build",order:ord(),
      steps:[{id:uid(),title:"Decide which module to start with",done:false}]}),
    newProject({name:"Headphone design",order:ord(),
      steps:[{id:uid(),title:"Sketch the driver and enclosure concept",done:false}]}),
    newProject({name:"Music production",order:ord(),
      steps:[{id:uid(),title:"Pick one track idea to develop",done:false}]}),
    newProject({name:"Speaker design",order:ord(),
      steps:[{id:uid(),title:"List candidate drivers",done:false}]})
  ];
}

/* ================= state ================= */
let state=null;
function defaultProfile(){
  return {
    setupComplete:false,
    workdays:[1,2,3,4,5],shiftStart:"15:18",shiftEnd:"23:54",
    commuteNormal:12,commuteSlow:20,parkingWalk:5,prepDuration:30,arrivalMargin:5,
    dayReset:"14:00",sleepTime:"05:00",wakeTime:"14:00",
    gymDays:[2,4,6,0],gymTime:"",gymDuration:60,
    theme:"dark",sound:true,showTomorrow:true
  };
}
function defaultState(){
  const profile=defaultProfile();
  return {
    schemaVersion:SCHEMA_VERSION,
    profile:profile,
    tasks:seedTasks(profile),
    projects:seedProjects(),
    days:{},                 /* key -> {done:{id:iso},skip:[id],add:[id],order:[id]|null,note} */
    settings:{firstDay:null,lastExport:null,migratedFrom:null}
  };
}
function loadState(){
  let raw=null;
  try{raw=localStorage.getItem(LS_KEY);}catch(e){raw=null;}
  if(raw){
    try{return validateState(JSON.parse(raw));}catch(e){/* fall through */}
  }
  /* First run of version 2: carry over what the old app held, if anything. */
  let old=null;
  try{old=localStorage.getItem(LS_KEY_V1);}catch(e){old=null;}
  if(old){
    try{
      const s=migrateV1(JSON.parse(old));
      if(s)return validateState(s);
    }catch(e){/* fall through to a clean state */}
  }
  return defaultState();
}
function saveState(){
  try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch(e){/* full or private mode */}
}
function validateState(obj){
  const d=defaultState();
  if(!obj||typeof obj!=="object")return d;
  const out={schemaVersion:SCHEMA_VERSION,profile:d.profile,tasks:[],projects:[],days:{},settings:d.settings};

  const p=obj.profile||{};const dp=d.profile;
  out.profile={
    setupComplete:!!p.setupComplete,
    workdays:Array.isArray(p.workdays)?p.workdays.map(Number).filter(n=>n>=0&&n<=6):dp.workdays,
    shiftStart:validHM(p.shiftStart)?p.shiftStart:dp.shiftStart,
    shiftEnd:validHM(p.shiftEnd)?p.shiftEnd:dp.shiftEnd,
    commuteNormal:clampInt(p.commuteNormal,0,600,dp.commuteNormal),
    commuteSlow:clampInt(p.commuteSlow,0,600,dp.commuteSlow),
    parkingWalk:clampInt(p.parkingWalk,0,600,dp.parkingWalk),
    prepDuration:clampInt(p.prepDuration,0,600,dp.prepDuration),
    arrivalMargin:clampInt(p.arrivalMargin,0,600,dp.arrivalMargin),
    dayReset:validHM(p.dayReset)?p.dayReset:dp.dayReset,
    sleepTime:validHM(p.sleepTime)?p.sleepTime:dp.sleepTime,
    wakeTime:validHM(p.wakeTime)?p.wakeTime:dp.wakeTime,
    gymDays:Array.isArray(p.gymDays)?p.gymDays.map(Number).filter(n=>n>=0&&n<=6):dp.gymDays,
    gymTime:validHM(p.gymTime)?p.gymTime:"",
    gymDuration:clampInt(p.gymDuration,0,600,dp.gymDuration),
    theme:p.theme==="light"?"light":"dark",
    sound:p.sound!==false,
    showTomorrow:p.showTomorrow!==false
  };
  out.tasks=(Array.isArray(obj.tasks)?obj.tasks:[]).slice(0,600).map(sanitizeTask);
  out.projects=(Array.isArray(obj.projects)?obj.projects:[]).slice(0,200).map(sanitizeProject);

  const days=obj.days&&typeof obj.days==="object"?obj.days:{};
  Object.keys(days).filter(validKey).sort().slice(-160).forEach(k=>{
    const r=days[k]||{};
    const done={};
    const rd=r.done&&typeof r.done==="object"?r.done:{};
    Object.keys(rd).slice(0,200).forEach(id=>{done[String(id).slice(0,40)]=str(rd[id],40);});
    out.days[k]={
      done:done,
      skip:(Array.isArray(r.skip)?r.skip:[]).slice(0,200).map(x=>String(x).slice(0,40)),
      add:(Array.isArray(r.add)?r.add:[]).slice(0,200).map(x=>String(x).slice(0,40)),
      order:Array.isArray(r.order)?r.order.slice(0,300).map(x=>String(x).slice(0,40)):null,
      note:str(r.note,1000)
    };
  });
  const s=obj.settings||{};
  out.settings={firstDay:validKey(s.firstDay)?s.firstDay:null,
                lastExport:validKey(s.lastExport)?s.lastExport:null,
                migratedFrom:str(s.migratedFrom,20)||null};
  return out;
}

/* ================= migration from version 1 =================
   Keeps what was the user's: their own tasks, their projects and their
   schedule. Drops the machinery that version 2 does not have -- the life-area
   priority table, recovery counters, rotation state and generated day copies.
   The old key is left untouched as a safety net. */
function migrateV1(old){
  if(!old||typeof old!=="object"||!old.profile)return null;
  const op=old.profile;
  const s=defaultState();
  const p=s.profile;
  const copyHM=k=>{if(validHM(op[k]))p[k]=op[k];};
  const copyN=k=>{if(op[k]!==undefined&&op[k]!==null)p[k]=clampInt(op[k],0,600,p[k]);};
  ["shiftStart","shiftEnd","dayReset","sleepTime","wakeTime"].forEach(copyHM);
  ["commuteNormal","commuteSlow","parkingWalk","prepDuration","arrivalMargin","gymDuration"].forEach(copyN);
  if(Array.isArray(op.workdays))p.workdays=op.workdays.map(Number).filter(n=>n>=0&&n<=6);
  if(Array.isArray(op.gymDays)&&op.gymDays.length)p.gymDays=op.gymDays.map(Number).filter(n=>n>=0&&n<=6);
  if(validHM(op.gymTime))p.gymTime=op.gymTime;
  if(op.theme==="light")p.theme="light";
  if(op.sound===false)p.sound=false;
  p.setupComplete=!!op.setupComplete;

  /* Seeds are rebuilt from the migrated profile so gym days and times match. */
  s.tasks=seedTasks(p);
  const today=dateKey(new Date());
  const byTitle={};
  s.tasks.forEach(t=>{byTitle[t.title.toLowerCase()]=t;});

  /* The user's own tasks. The three built-in routines the old app seeded have
     the same titles as our seeds -- update those instead of duplicating. */
  (Array.isArray(old.custom)?old.custom:[]).forEach(c=>{
    if(!c||!c.title)return;
    const repeat={kind:"once",days:[],dom:1,every:2,unit:"week"};
    if(c.freq==="daily")repeat.kind="daily";
    else if(c.freq==="weekly"){repeat.kind="weekly";
      repeat.days=Array.isArray(c.days)?c.days.map(Number).filter(n=>n>=0&&n<=6):[];
      if(!repeat.days.length)repeat.days=[dowOf(today)];}
    const existing=byTitle[String(c.title).toLowerCase()];
    if(existing){
      existing.repeat=repeat;
      if(validHM(c.time))existing.time=c.time;
      if(c.min)existing.minutes=clampInt(c.min,1,1440,existing.minutes);
      existing.archived=!!c.finished;
      return;
    }
    s.tasks.push(newTask({
      title:String(c.title),repeat:repeat,
      date:c.freq==="date"&&validKey(c.date)?c.date:(repeat.kind==="once"?today:null),
      time:validHM(c.time)?c.time:null,minutes:c.min?clampInt(c.min,1,1440,null):null,
      archived:!!c.finished,start:today,order:nextOrderIn(s.tasks)
    }));
  });

  /* Active cleanup templates become plain Someday tasks. */
  const T=old.templates&&typeof old.templates==="object"?old.templates:{};
  const RECOVERY_TITLES={
    rubbish:["Fill one bag with obvious rubbish",15],
    boxes:["Flatten three empty delivery boxes",10],
    cables:["Collect loose cables from one section of the floor",10],
    floor:["Clear one small section of floor",15],
    movefive:["Move five objects into the correct room",10],
    vacuum:["Vacuum one cleared section of floor",10],
    storage:["Sort one small storage-room category",10],
    carrybag:["Carry one prepared bag out",5]
  };
  Object.keys(RECOVERY_TITLES).forEach(id=>{
    const rec=T[id];
    if(rec&&rec.status&&rec.status!=="active")return;   /* finished or disabled */
    const t=byTitle[RECOVERY_TITLES[id][0].toLowerCase()];
    if(t&&rec&&rec.count)t.notes="Done "+rec.count+" time"+(rec.count===1?"":"s")+" before the rebuild.";
  });

  /* Old maintenance routines are simply interval tasks, and they are real
     recurring chores, so they stay on days rather than going to the shelf. */
  const M=old.maintenance&&typeof old.maintenance==="object"?old.maintenance:{};
  Object.keys(M).forEach(id=>{
    const m=M[id];if(!m||!m.title)return;
    s.tasks.push(newTask({title:String(m.title),start:today,
      repeat:{kind:"every",days:[],dom:1,
              every:clampInt(m.n,1,365,1),
              unit:["day","week","month"].includes(m.unit)?m.unit:"week"},
      order:nextOrderIn(s.tasks)}));
  });

  /* Unfinished one-time sequences keep their remaining steps. */
  const SEQ={dentist:"Dental examination",glasses:"New glasses",
             posture_setup:"Arrange a posture or physiotherapy assessment"};
  const oseq=old.sequences&&typeof old.sequences==="object"?old.sequences:{};
  Object.keys(SEQ).forEach(k=>{
    const os=oseq[k];if(!os)return;
    const t=byTitle[SEQ[k].toLowerCase()];
    if(t&&os.finished)t.archived=true;
    else if(t&&os.step)(t.steps||[]).forEach((st,i)=>{if(i<os.step)st.done=true;});
  });

  /* Projects keep their order, with Primary first as it was on screen. */
  const rank={Primary:0,Secondary:1,Active:2,Paused:3,Stored:4,Completed:5};
  const op2=(Array.isArray(old.projects)?old.projects:[]).slice();
  if(op2.length){
    op2.sort((a,b)=>(rank[a.status]===undefined?9:rank[a.status])-(rank[b.status]===undefined?9:rank[b.status]));
    s.projects=op2.map((pr,i)=>sanitizeProject({
      id:typeof pr.id==="string"?pr.id:uid(),
      name:str(pr.name,120),notes:str(pr.notes,4000),order:(i+1)*10,
      status:pr.status==="Completed"?"done":"active",
      steps:pr.next?[{id:uid(),title:str(pr.next,160),done:false}]:[]
    }));
  }

  /* This week's gym count, so the header does not read 0 of 4 mid-week. */
  const gym=s.tasks.find(t=>t.title==="Go to the gym");
  const wk=old.gymWeeks&&typeof old.gymWeeks==="object"?old.gymWeeks:{};
  const thisWeek=wk[weekKeyOf(today)];
  if(gym&&thisWeek&&thisWeek.done>0){
    const start=weekKeyOf(today);
    let placed=0;
    for(let i=0;i<7&&placed<Math.min(4,thisWeek.done);i++){
      const k=addDays(start,i);
      if(daysBetween(k,today)<0)break;
      if(!gym.repeat.days.includes(dowOf(k)))continue;
      gym.doneDates.push(k);gym.lastDone=k;placed++;
    }
  }
  s.settings.migratedFrom="1";
  s.settings.firstDay=validKey(old.settings&&old.settings.firstDay)?old.settings.firstDay:today;
  return s;
}
function nextOrderIn(list){
  return list.length?Math.max.apply(null,list.map(t=>t.order||0))+10:10;
}

/* ================= day records ================= */
function dayRec(k,create){
  if(!state.days[k]){
    if(!create)return {done:{},skip:[],add:[],order:null,note:""};
    state.days[k]={done:{},skip:[],add:[],order:null,note:""};
  }
  return state.days[k];
}
function isDone(k,id){return !!dayRec(k,false).done[id];}
/* The list for a day: what its rules put there, plus manual additions, minus
   skips, plus anything already completed (so finishing something never makes
   it vanish from the record). */
function tasksFor(k){
  const rec=dayRec(k,false);
  const ids=[];
  const seen={};
  const push=id=>{if(!seen[id]){seen[id]=1;ids.push(id);}};
  (state.tasks||[]).forEach(t=>{if(dueOn(t,k))push(t.id);});
  (rec.add||[]).forEach(push);
  Object.keys(rec.done||{}).forEach(push);
  const skip={};(rec.skip||[]).forEach(id=>{skip[id]=1;});
  let list=ids.filter(id=>!skip[id]||rec.done[id]).map(findTask).filter(Boolean);
  if(rec.order&&rec.order.length){
    const pos={};rec.order.forEach((id,i)=>{pos[id]=i;});
    list.sort((a,b)=>(pos[a.id]===undefined?1e6+(a.order||0):pos[a.id])
                    -(pos[b.id]===undefined?1e6+(b.order||0):pos[b.id]));
  }else{
    list.sort(defaultDaySort);
  }
  return list;
}
/* Clock times first, in personal-day order, then untimed by their own order. */
function defaultDaySort(a,b){
  const ta=a.time?dayMinutes(a.time):null,tb=b.time?dayMinutes(b.time):null;
  if(ta!==null&&tb!==null)return ta-tb;
  if(ta!==null)return -1;
  if(tb!==null)return 1;
  const ua=URGENCIES.indexOf(b.urgency)-URGENCIES.indexOf(a.urgency);
  if(ua)return ua;
  return (a.order||0)-(b.order||0);
}
function ensureToday(){
  const k=personalDayKey(new Date());
  if(state.today===k)return false;
  state.today=k;
  pruneDays();
  return true;
}
function pruneDays(){
  const keys=Object.keys(state.days).sort();
  if(keys.length>160)keys.slice(0,keys.length-160).forEach(k=>{delete state.days[k];});
}

/* ================= task actions ================= */
function completeTask(id,k){
  k=k||state.today;
  const t=findTask(id);if(!t)return;
  const rec=dayRec(k,true);
  if(rec.done[id])return;
  rec.done[id]=new Date().toISOString();
  t.lastDone=k;
  if(!t.doneDates.includes(k))t.doneDates.push(k);
  if(t.doneDates.length>80)t.doneDates=t.doneDates.slice(-80);
  if(!isRepeating(t))t.archived=true;      /* a one-off is finished for good */
  saveState();
}
function uncompleteTask(id,k){
  k=k||state.today;
  const t=findTask(id);if(!t)return;
  const rec=dayRec(k,true);
  if(!rec.done[id])return;
  delete rec.done[id];
  t.doneDates=(t.doneDates||[]).filter(d=>d!==k);
  t.lastDone=t.doneDates.length?t.doneDates[t.doneDates.length-1]:null;
  if(!isRepeating(t))t.archived=false;
  saveState();
}
function skipToday(id){
  const rec=dayRec(state.today,true);
  if(!rec.skip.includes(id))rec.skip.push(id);
  rec.add=rec.add.filter(x=>x!==id);
  if(rec.order)rec.order=rec.order.filter(x=>x!==id);
  saveState();
}
/* Put a task on a specific day. For a one-off this moves its date; for a
   repeating task it is a one-time extra appearance. */
function putOnDay(id,k){
  const t=findTask(id);if(!t)return;
  t.bucket="active";
  t.archived=false;
  if(!isRepeating(t)){
    t.date=k;
  }else{
    const rec=dayRec(k,true);
    if(!rec.add.includes(id))rec.add.push(id);
    rec.skip=rec.skip.filter(x=>x!==id);
  }
  if(k!==state.today){
    const rec=dayRec(state.today,true);
    if(dueOn(t,state.today)&&!rec.skip.includes(id))rec.skip.push(id);
    rec.add=rec.add.filter(x=>x!==id);
  }else{
    const rec=dayRec(k,true);
    rec.skip=rec.skip.filter(x=>x!==id);
  }
  saveState();
}
function toSomeday(id){
  const t=findTask(id);if(!t)return;
  t.bucket="someday";
  const rec=dayRec(state.today,true);
  rec.add=rec.add.filter(x=>x!==id);
  if(rec.order)rec.order=rec.order.filter(x=>x!==id);
  saveState();
}
function deleteTask(id){
  state.tasks=(state.tasks||[]).filter(t=>t.id!==id);
  Object.keys(state.days).forEach(k=>{
    const r=state.days[k];
    delete r.done[id];
    r.skip=r.skip.filter(x=>x!==id);
    r.add=r.add.filter(x=>x!==id);
    if(r.order)r.order=r.order.filter(x=>x!==id);
  });
  saveState();
}
function addTask(o){
  const t=newTask(o);
  state.tasks.push(t);
  saveState();
  return t;
}

/* ================= backup ================= */
function makeBackup(){
  return {app:"daily-task-manager",schemaVersion:SCHEMA_VERSION,
          exportedAt:Date.now(),data:state};
}
function readBackup(obj){
  if(!obj||typeof obj!=="object")return {ok:false,msg:"That file is not a backup."};
  if(obj.app&&obj.app!=="daily-task-manager")
    return {ok:false,msg:"That backup belongs to a different app ("+str(obj.app,30)+")."};
  const sv=obj.schemaVersion;
  if(typeof sv==="number"&&sv>SCHEMA_VERSION)
    return {ok:false,msg:"That backup was made by a newer version of the app."};
  if(obj.data&&typeof obj.data==="object"){
    /* A version 1 backup carries the old shape under the same envelope. */
    if(sv===1||obj.data.templates||obj.data.custom){
      const m=migrateV1(obj.data);
      return m?{ok:true,state:validateState(m),note:"Imported and upgraded from version 1."}
              :{ok:false,msg:"That version 1 backup could not be read."};
    }
    return {ok:true,state:validateState(obj.data)};
  }
  if(obj.profile)return {ok:true,state:validateState(obj)};   /* raw state file */
  return {ok:false,msg:"That file does not contain any app data."};
}
function exportData(){
  const blob=new Blob([JSON.stringify(makeBackup(),null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="daily-task-manager-backup-"+dateKey(new Date())+".json";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  state.settings.lastExport=state.today;saveState();
  toast("Backup exported.");
}
function importData(file){
  const fr=new FileReader();
  fr.onload=()=>{
    let parsed=null;
    try{parsed=JSON.parse(String(fr.result));}
    catch(e){toast("That file is not valid JSON.");return;}
    const r=readBackup(parsed);
    if(!r.ok){toast(r.msg);return;}
    confirmBox("Replace everything?",
      "Importing replaces all tasks, projects and settings on this device.",
      [{text:"Import",kind:"primary",fn:()=>{
          state=r.state;state.today=null;ensureToday();applyTheme();saveState();
          ui.open=null;ui.project=null;render();
          toast(r.note||"Backup imported.");}},
       {text:"Cancel",kind:"quiet"}]);
  };
  fr.onerror=()=>toast("That file could not be read.");
  fr.readAsText(file);
}
/* The seam for the Raspberry Pi build: everything with a clock time, in one
   flat list, with no app internals attached. */
function alarmSchedule(){
  const p=state.profile,out=[];
  if(validHM(p.wakeTime))out.push({time:p.wakeTime,label:"Wake up",kind:"routine",days:[0,1,2,3,4,5,6]});
  if(validHM(p.sleepTime))out.push({time:p.sleepTime,label:"Sleep",kind:"routine",days:[0,1,2,3,4,5,6]});
  const wt=workTimes(p);
  if(p.workdays.length){
    out.push({time:wt.bed,label:"Be out of bed",kind:"work",days:p.workdays.slice()});
    out.push({time:wt.prep,label:"Start getting ready",kind:"work",days:p.workdays.slice()});
    out.push({time:wt.leave,label:"Leave home",kind:"work",days:p.workdays.slice()});
  }
  (state.tasks||[]).forEach(t=>{
    if(t.archived||!t.time||t.bucket==="someday")return;
    out.push({time:t.time,label:t.title,kind:"task",alarm:!!t.alarm,
      days:t.repeat.kind==="daily"?[0,1,2,3,4,5,6]:
           t.repeat.kind==="weekly"?t.repeat.days.slice():[],
      date:t.repeat.kind==="once"?t.date:null});
  });
  out.sort((a,b)=>dayMinutes(a.time)-dayMinutes(b.time));
  return {app:"daily-task-manager",version:APP_VERSION,dayReset:p.dayReset,
          timezone:deviceTimeZone(),generatedAt:new Date().toISOString(),alarms:out};
}
function exportAlarms(){
  const blob=new Blob([JSON.stringify(alarmSchedule(),null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="alarm-schedule-"+dateKey(new Date())+".json";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast("Alarm schedule exported.");
}
function resetApp(){
  confirmBox("Erase everything?",
    "All tasks, projects and settings on this device are deleted. This cannot be undone.",
    [{text:"Erase",kind:"danger",fn:()=>{
        try{localStorage.removeItem(LS_KEY);}catch(e){}
        state=defaultState();state.today=null;ensureToday();
        state.settings.firstDay=state.today;
        applyTheme();saveState();ui.open=null;ui.project=null;render();
        showSetup();}},
     {text:"Cancel",kind:"quiet"}]);
}

/* ================= sound ================= */
let audioCtx=null;
const chimed={};
function playChime(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!audioCtx)audioCtx=new AC();
    if(audioCtx.state==="suspended")audioCtx.resume();
    const t0=audioCtx.currentTime;
    [880,1174.7].forEach((f,i)=>{
      const o=audioCtx.createOscillator(),g=audioCtx.createGain();
      o.type="sine";o.frequency.value=f;
      g.gain.setValueAtTime(0,t0+i*0.18);
      g.gain.linearRampToValueAtTime(0.12,t0+i*0.18+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t0+i*0.18+0.5);
      o.connect(g);g.connect(audioCtx.destination);
      o.start(t0+i*0.18);o.stop(t0+i*0.18+0.55);
    });
  }catch(e){/* sound is never essential */}
}
/* Alarms can only sound while the app is open. Nothing here pretends otherwise.
   Opening the app late in the day must not fire every alarm that has already
   passed, so anything more than half an hour old is marked and stays quiet. */
function checkAlarms(){
  const k=state.today,now=nowDayMinutes();
  tasksFor(k).forEach(t=>{
    if(!t.alarm||!t.time||isDone(k,t.id))return;
    const stamp=k+":"+t.id;
    if(chimed[stamp])return;
    const due=dayMinutes(t.time);
    if(due>now)return;
    chimed[stamp]=1;
    if(now-due>30)return;
    if(state.profile.sound)playChime();
    toast(t.title+" "+DOT+" "+t.time);
  });
}

/* ================= DOM helpers ================= */
/* el() only ever sets textContent, so user text can never be parsed as markup.
   pwatest.js fails if the word for assigning raw HTML appears anywhere at all. */
function el(tag,attrs,...kids){
  const n=document.createElement(tag);
  if(attrs)for(const k in attrs){
    const v=attrs[k];
    if(v===null||v===undefined||v===false)continue;
    if(k==="text")n.textContent=String(v);
    else if(k.slice(0,2)==="on"&&typeof v==="function")n.addEventListener(k.slice(2),v);
    else if(k==="checked"||k==="disabled"||k==="selected")n[k]=!!v;
    else if(k==="value")n.value=String(v);
    else n.setAttribute(k,String(v));
  }
  kids.forEach(function add(c){
    if(c===null||c===undefined||c===false||c==="")return;
    if(Array.isArray(c)){c.forEach(add);return;}
    n.appendChild(typeof c==="object"?c:document.createTextNode(String(c)));
  });
  return n;
}
function clear(n){while(n.firstChild)n.removeChild(n.firstChild);return n;}
function byId(id){return document.getElementById(id);}

/* ================= icons =================
   Drawn, not typed. iOS renders characters like U+2699 GEAR and U+23F0 ALARM
   CLOCK as full-colour emoji in a completely different visual language to the
   rest of the app, and their glyph metrics sit off-centre in a button. These
   are plain strokes that inherit currentColor and line up on the pixel grid. */
const SVGNS="http://www.w3.org/2000/svg";
const ICONS={
  tick:[["path",{d:"M6.6 12.4l3.5 3.5 7.3-8"}]],
  grip:[["path",{d:"M7 9h10M7 12.5h10M7 16h10"}]],
  chev:[["path",{d:"M10 7.5l4.6 4.5-4.6 4.5"}]],
  back:[["path",{d:"M14 7.5L9.4 12l4.6 4.5"}]],
  close:[["path",{d:"M7.5 7.5l9 9M16.5 7.5l-9 9"}]],
  bell:[["path",{d:"M12 5.2a4.3 4.3 0 00-4.3 4.3c0 3.5-1.4 4.8-1.4 4.8h11.4s-1.4-1.3-1.4-4.8A4.3 4.3 0 0012 5.2z"}],
        ["path",{d:"M10.3 17.1a1.8 1.8 0 003.4 0"}]]
};
function icon(name,cls){
  const s=document.createElementNS(SVGNS,"svg");
  s.setAttribute("viewBox","0 0 24 24");
  s.setAttribute("aria-hidden","true");
  s.setAttribute("focusable","false");
  s.setAttribute("class","icn"+(cls?" "+cls:""));
  (ICONS[name]||[]).forEach(pair=>{
    const n=document.createElementNS(SVGNS,pair[0]);
    for(const k in pair[1])n.setAttribute(k,pair[1][k]);
    s.appendChild(n);
  });
  return s;
}
function iconBtn(cls,label,onclick,name){
  return el("button",{class:cls,"aria-label":label,onclick:onclick},icon(name||"close"));
}

function openModal(title,body,wide){
  const host=byId("modalHost");
  const box=clear(byId("modalBox"));
  box.classList.toggle("wide",!!wide);
  box.append(el("div",{class:"mhead"},
    el("h2",{text:title}),
    iconBtn("x","Close",closeModal)));
  box.append(el("div",{class:"mbody"},body));
  host.classList.add("open");
}
function closeModal(){byId("modalHost").classList.remove("open");}
/* window.confirm is a no-op inside an installed PWA, so it is never used. */
function confirmBox(title,text,buttons){
  const body=el("div",{});
  if(text)body.append(el("p",{class:"note",text:text}));
  const row=el("div",{class:"btnrow"});
  (buttons||[]).forEach(b=>{
    row.append(el("button",{class:"btn "+(b.kind||""),text:b.text,onclick:()=>{
      closeModal();if(b.fn)b.fn();}}));
  });
  body.append(row);
  openModal(title,body);
}
let toastTimer=null;
function toast(msg){
  const t=byId("toast");
  t.textContent=String(msg);
  t.classList.add("show");
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"),2600);
}

/* Drag to reorder, on pointer events because HTML5 drag-and-drop does not work
   with a finger on iOS.

   Every position is measured once, when the drag starts, and every decision
   after that comes from that snapshot plus how far the finger has travelled.
   Nothing is measured from the live DOM mid-drag. An earlier version moved
   rows and read their positions back in the same breath, which is a feedback
   loop: with rows of different heights a quick flick made it oscillate and
   strand a row on top of its neighbour instead of dropping into place.

   So the dragged row follows the finger, the rows it passes slide out of the
   way by exactly the space it vacated, and the DOM is reordered once, on
   release. */
function makeSortable(list,onDrop){
  let st=null;
  function rowsIn(){
    const out=[];
    Array.prototype.forEach.call(list.children,c=>{
      if(c.hasAttribute&&c.hasAttribute("data-row"))out.push(c);});
    return out;
  }
  list.addEventListener("pointerdown",ev=>{
    if(st)return;
    const grip=ev.target.closest?ev.target.closest(".grip"):null;
    if(!grip||!list.contains(grip))return;
    const row=grip.closest("[data-row]");
    /* Steps are sortable inside a task that is itself sortable. Only the list
       that directly owns the row may claim the drag. */
    if(!row||row.parentNode!==list)return;
    const rows=rowsIn();
    const from=rows.indexOf(row);
    if(from<0||rows.length<2)return;
    ev.preventDefault();
    ev.stopPropagation();
    const rects=rows.map(r=>r.getBoundingClientRect());
    const gap=from<rows.length-1 ? rects[from+1].top-rects[from].bottom
                                 : rects[from].top-rects[from-1].bottom;
    st={row:row,grip:grip,rows:rows,rects:rects,from:from,to:from,
        y0:ev.clientY,pointerId:ev.pointerId,
        occupied:rects[from].height+Math.max(0,gap)};
    row.classList.add("dragging");
    try{grip.setPointerCapture(ev.pointerId);}catch(e){}
    /* Listen on the document, not the grip: if the finger outruns the row or
       pointer capture is refused, the drag must still finish rather than stick
       half-way with the row left floating. */
    document.addEventListener("pointermove",move,{passive:false});
    document.addEventListener("pointerup",up);
    document.addEventListener("pointercancel",up);
  });
  function move(ev){
    if(!st||ev.pointerId!==st.pointerId)return;
    if(ev.cancelable)ev.preventDefault();
    const dy=ev.clientY-st.y0;
    const centre=st.rects[st.from].top+dy+st.rects[st.from].height/2;
    /* Where would it land? Answered against the original positions, so the
       answer only ever moves in step with the finger. */
    let to=st.from;
    for(let i=st.from+1;i<st.rows.length;i++)
      if(centre>st.rects[i].top+st.rects[i].height/2)to=i;
    if(to===st.from)
      for(let i=st.from-1;i>=0;i--)
        if(centre<st.rects[i].top+st.rects[i].height/2)to=i;
    st.to=to;
    st.row.style.transform="translateY("+dy+"px)";
    st.rows.forEach((r,i)=>{
      if(i===st.from)return;
      let shift=0;
      if(to>st.from&&i>st.from&&i<=to)shift=-st.occupied;
      else if(to<st.from&&i>=to&&i<st.from)shift=st.occupied;
      r.style.transform=shift?"translateY("+shift+"px)":"";
    });
  }
  function up(){
    if(!st)return;
    document.removeEventListener("pointermove",move);
    document.removeEventListener("pointerup",up);
    document.removeEventListener("pointercancel",up);
    const rows=st.rows,from=st.from,to=st.to,row=st.row;
    st=null;
    rows.forEach(r=>{r.style.transform="";});
    if(to!==from){
      const order=rows.slice();
      order.splice(to,0,order.splice(from,1)[0]);
      order.forEach(r=>list.appendChild(r));    /* one reorder, at the end */
      if(onDrop)onDrop(order.map(r=>r.getAttribute("data-row")));
    }
    /* Drop the class a frame later so the row snaps into its new slot instead
       of animating there from wherever the finger left it. */
    const settle=()=>row.classList.remove("dragging");
    if(typeof requestAnimationFrame==="function")requestAnimationFrame(settle);
    else settle();
  }
  return list;
}
function grip(){return el("div",{class:"grip","aria-hidden":"true"},icon("grip"));}

/* ================= small form pieces ================= */
function segmented(options,value,onpick){
  const seg=el("div",{class:"seg"});
  options.forEach(o=>{
    seg.append(el("button",{class:value===o[0]?"on":"",text:o[1],
      onclick:()=>onpick(o[0])}));
  });
  return seg;
}
function dayPills(selected,onchange){
  const wrap=el("div",{class:"pills"});
  [1,2,3,4,5,6,0].forEach(d=>{
    const on=selected.includes(d);
    wrap.append(el("button",{class:"pill"+(on?" on":""),text:DAYSHORT[d],onclick:()=>{
      const i=selected.indexOf(d);
      if(i<0)selected.push(d);else selected.splice(i,1);
      onchange(selected);
    }}));
  });
  return wrap;
}
function field(label,node,hint){
  const f=el("div",{class:"frow"},el("label",{text:label}),node);
  if(!hint)return f;
  return el("div",{},f,el("p",{class:"hint",text:hint}));
}
/* One section of the task editor: a titled box, slightly lighter than the row
   behind it. Boxes group what belongs together far better than a scattering of
   divider lines did. */
function esec(title,...kids){
  const s=el("div",{class:"esec"});
  if(title)s.append(el("h3",{class:"esect",text:title}));
  kids.forEach(function add(c){
    if(c===null||c===undefined||c===false)return;
    if(Array.isArray(c)){c.forEach(add);return;}
    s.append(c);
  });
  return s;
}
function switchRow(label,checked,onchange,hint){
  const inp=el("input",{type:"checkbox"});
  inp.checked=!!checked;
  inp.addEventListener("change",()=>onchange(inp.checked));
  return field(label,el("label",{class:"switch"},inp,el("span",{class:"sl"})),hint);
}
function numInput(value,onchange,min,max){
  return el("input",{type:"number",inputmode:"numeric",min:String(min||0),max:String(max||600),
    value:value===null||value===undefined?"":String(value),
    onchange:e=>onchange(e.target.value)});
}
/* The native time and date pickers are popovers anchored to their input.
   Re-rendering while one is open destroys that input and dismisses the popover,
   which is why setting the hour used to close the wheel before the minutes
   could be set. So the value is taken as it changes but nothing is rebuilt
   until the field is finished with -- Done, or a tap elsewhere. */
function pickerInput(type,value,onValue,onDone){
  const inp=el("input",{type:type,value:value||""});
  const take=e=>{onValue(e.target.value);};
  inp.addEventListener("input",take);
  inp.addEventListener("change",take);
  inp.addEventListener("blur",()=>{if(onDone)onDone();});
  return inp;
}
function timeInput(value,onValue,onDone){return pickerInput("time",value,onValue,onDone);}
function dateInput(value,onValue,onDone){return pickerInput("date",value,onValue,onDone);}

/* ================= view state ================= */
const ui={page:"today",open:null,tab:"repeating",project:null,showDone:false,
          notes:null,month:null};

/* Opening a task is always done through here. The tap that opens one also
   bubbles on to the close-on-outside-tap handler, which would otherwise shut it
   again the instant it appeared. */
let openedByThisTap=false;
function openTask(id){ui.open=id;ui.notes=null;openedByThisTap=true;}

/* ================= header =================
   The date is the app's anchor, but the second line describes whatever page is
   actually on screen -- "8 left" while looking at Projects meant nothing. */
function renderHeader(){
  const k=state.today;
  byId("dayTitle").textContent=longDate(k);
  let meta;
  if(ui.page==="tasks"){
    const live=(state.tasks||[]).filter(t=>!t.archived);
    const shelf=live.filter(t=>t.bucket==="someday").length;
    meta=live.length-shelf+" task"+(live.length-shelf===1?"":"s")+" "+DOT+" "+shelf+" on the shelf";
  }else if(ui.page==="projects"){
    const n=(state.projects||[]).filter(p=>p.status==="active").length;
    meta=n?n+" project"+(n===1?"":"s"):"No projects yet";
  }else if(ui.page==="calendar"){
    const mk=ui.month||monthOf(state.today);
    const lit=calendarDays(mk).filter(c=>c.inMonth&&c.notable).length;
    meta=lit?lit+" day"+(lit===1?"":"s")+" with something on":"Nothing beyond the routine";
  }else if(ui.page==="settings"){
    meta="Settings";
  }else{
    const left=tasksFor(k).filter(t=>!isDone(k,t.id)).length;
    meta=(isWorkday(k)?"Workday":"Day off")+" "+DOT+" "+(left===0?"all done":left+" left");
  }
  byId("dayMeta").textContent=meta;
}

/* ================= today ================= */
function renderToday(){
  const root=clear(byId("page-today"));
  const k=state.today;

  if(isWorkday(k))root.append(workCard(k));

  const list=tasksFor(k);
  /* A task being edited stays on screen even if the edit just made it not due
     today. Retuning a schedule must not make the thing you are editing vanish
     out from under you; it drops off the list once you close it. */
  if(ui.open&&!list.some(t=>t.id===ui.open)){
    const held=findTask(ui.open);
    if(held)list.push(held);
  }
  const open=list.filter(t=>!isDone(k,t.id));
  const done=list.filter(t=>isDone(k,t.id));

  if(!open.length){
    root.append(el("div",{class:"card empty"},
      el("p",{text:done.length?"Everything on today's list is done.":"Nothing on today's list yet."}),
      el("p",{class:"hint",text:"Add something below, or pull one in from Someday."})));
  }else{
    const holder=el("div",{class:"list"});
    open.forEach(t=>holder.append(taskRow(t,{day:k,drag:true})));
    makeSortable(holder,ids=>{
      const rec=dayRec(k,true);
      const doneIds=done.map(d=>d.id);
      rec.order=ids.concat(doneIds.filter(id=>ids.indexOf(id)<0));
      saveState();
    });
    root.append(holder);
  }

  root.append(el("div",{class:"btnrow"},
    el("button",{class:"btn primary wide",text:"+  Add a task for today",onclick:()=>{
      const t=addTask({date:k,start:k,repeat:{kind:"once",days:[],dom:1,every:2,unit:"week"}});
      openTask(t.id);render();
      const inp=document.querySelector('[data-row="'+t.id+'"] .titleInput');
      if(inp)inp.focus();
    }}),
    el("button",{class:"btn",text:"From Someday",onclick:()=>{ui.page="tasks";ui.tab="someday";render();}})));

  if(done.length){
    const head=el("button",{class:"disclose",onclick:()=>{ui.showDone=!ui.showDone;renderToday();}},
      el("span",{class:"discIcon"+(ui.showDone?" open":"")},icon("chev")),
      el("span",{class:"discTxt",text:"Completed today"}),
      el("span",{class:"count",text:String(done.length)}));
    root.append(head);
    if(ui.showDone){
      const dl=el("div",{class:"list"});
      done.forEach(t=>dl.append(taskRow(t,{day:k})));
      root.append(dl);
    }
  }

  const tk=addDays(k,1);
  if(state.profile.showTomorrow){
    const bits=[];
    if(isWorkday(tk)){
      const wt=workTimes(state.profile);
      bits.push("out of bed "+wt.bed,"ready "+wt.prep,"leave "+wt.leave);
    }
    const n=tasksFor(tk).length;
    root.append(el("p",{class:"tomorrow",
      text:"Tomorrow "+DOT+" "+DAYNAMES[dowOf(tk)]+" "+DOT+" "+n+" task"+(n===1?"":"s")+
           (bits.length?" "+DOT+" "+bits.join(" "+DOT+" "):"")}));
  }
  if(backupDue())root.append(el("p",{class:"tomorrow",
    text:"No backup exported yet. Settings "+ARROW+" Backup keeps a copy safe."}));
}
function workCard(k){
  const wt=workTimes(state.profile),p=state.profile;
  const now=nowDayMinutes();
  const card=el("div",{class:"card work"});
  card.append(el("div",{class:"worktitle",text:"Work "+DOT+" shift "+p.shiftStart+" to "+p.shiftEnd}));
  [[wt.bed,"Be fully out of bed"],
   [wt.prep,"Start getting ready"],
   [wt.leave,"Leave home"]].forEach(([time,label])=>{
    const past=dayMinutes(time)<now;
    card.append(el("div",{class:"wrow"},
      el("span",{class:"wtime mono"+(past?" past":""),text:time}),
      el("span",{class:"wtxt",text:label})));
  });
  card.append(el("p",{class:"hint",
    text:"Arrive "+wt.arrive+" "+DOT+" in slow traffic leave by "+wt.leaveSlow}));
  return card;
}
function backupDue(){
  if(state.settings.lastExport)return daysBetween(state.settings.lastExport,state.today)>30;
  return state.settings.firstDay?daysBetween(state.settings.firstDay,state.today)>14:false;
}

/* ================= the task row =================
   Collapsed it is a checkbox, a title and a quiet summary line. Tapping the
   body expands the editor in place -- this is the whole point of version 2. */
function taskRow(t,opts){
  opts=opts||{};
  const k=opts.day||state.today;
  const done=opts.day?isDone(k,t.id):false;
  const expanded=ui.open===t.id;
  const row=el("div",{class:"task u-"+t.urgency+(done?" done":"")+(expanded?" open":""),
                      "data-row":t.id});

  const head=el("div",{class:"thead"});
  if(opts.day){
    const box=el("button",{class:"check"+(done?" on":""),"aria-label":done?"Mark not done":"Mark done",
      onclick:e=>{
        e.stopPropagation();
        if(done){uncompleteTask(t.id,k);render();}
        else{
          row.classList.add("completing");
          setTimeout(()=>{completeTask(t.id,k);render();},220);
        }
      }},done?icon("tick"):null);
    head.append(box);
  }else if(opts.drag!==false){
    head.append(grip());
  }

  const mid=el("div",{class:"tmid",onclick:()=>{
    if(expanded)ui.open=null;else openTask(t.id);
    render();
    if(!expanded){
      /* Bring the opened task to the top so as much of the editor as will fit
         is on screen, rather than leaving it half below the fold. */
      const node=document.querySelector('[data-row="'+t.id+'"]');
      if(node&&node.scrollIntoView)node.scrollIntoView({block:"start"});
    }
  }});
  mid.append(el("div",{class:"ttitle",text:t.title||"Untitled task"}));
  const sub=[];
  if(isRepeating(t))sub.push(repeatLabel(t));
  else if(t.date&&t.date!==k)sub.push(shortDate(t.date));
  if(t.minutes)sub.push("about "+t.minutes+" min");
  if(t.weeklyTarget)sub.push(doneThisWeek(t,k)+" of "+t.weeklyTarget+" this week");
  if((t.steps||[]).length)sub.push(stepsDone(t)+" of "+t.steps.length+" steps");
  if(t.bucket==="someday"&&opts.day)sub.push("Someday");
  if(sub.length)mid.append(el("div",{class:"tsub",text:sub.join("  "+DOT+"  ")}));
  head.append(mid);

  const right=el("div",{class:"tright"});
  if(t.time){
    const past=opts.day&&dayMinutes(t.time)<nowDayMinutes()&&!done;
    right.append(el("span",{class:"timechip mono"+(past?" past":""),text:t.time}));
  }
  if(t.alarm)right.append(el("span",{class:"bell","aria-label":"Alarm set"},icon("bell")));
  if(opts.day&&opts.drag)right.append(grip());
  head.append(right);
  row.append(head);

  if(expanded)row.append(taskEditor(t,k));
  return row;
}

/* ================= the inline editor =================
   What it offers depends on what the task actually is. A shelved task has no
   day, so it has no clock time or alarm to set. A repeating task has no single
   date. A one-off has no repeat rule. A weekly target only means anything on
   something that recurs. None of those controls appear where they would mean
   nothing -- but each kind can still be turned into another kind, so nothing
   is locked away. */
function taskEditor(t,k){
  const b=el("div",{class:"editor"});
  const save=()=>{saveState();};
  const redraw=()=>{saveState();render();};
  const shelved=t.bucket==="someday";
  const repeating=isRepeating(t);
  const finished=isDone(state.today,t.id);
  const onToday=!shelved&&tasksFor(state.today).some(x=>x.id===t.id);

  /* --- title --- */
  const title=el("input",{class:"titleInput",type:"text",value:t.title,placeholder:"What is it?",
    maxlength:"140"});
  title.addEventListener("input",()=>{t.title=title.value.slice(0,140);
    const node=document.querySelector('[data-row="'+t.id+'"] .ttitle');
    if(node)node.textContent=t.title||"Untitled task";save();});
  b.append(title);

  /* --- notes, kept out of the way until there is something to say --- */
  if(t.notes||ui.notes===t.id){
    const notes=el("textarea",{placeholder:"Notes",rows:"2"});
    notes.value=t.notes;
    notes.addEventListener("input",()=>{t.notes=notes.value.slice(0,2000);save();});
    b.append(notes);
  }else{
    b.append(el("button",{class:"btn quiet small",text:"+ Add a note",onclick:()=>{
      ui.notes=t.id;render();
      const n=document.querySelector('[data-row="'+t.id+'"] textarea');
      if(n)n.focus();
    }}));
  }

  /* --- when: one of three, never all of them --- */
  if(shelved){
    const bits=["It waits on the shelf until you put it on a day."];
    if(repeating)bits.push("Set to repeat "+repeatLabel(t).toLowerCase()+" from then on.");
    if(t.time)bits.push("Keeps its "+t.time+" time.");
    b.append(esec("Not on a day",el("p",{class:"hint tight",text:bits.join(" ")})));
  }else if(repeating){
    const parts=[];
    parts.push(segmented([["daily","Every day"],["weekly","Weekly"],
                          ["monthly","Monthly"],["every","Interval"]],
      t.repeat.kind,v=>{
        t.repeat.kind=v;
        if(v==="weekly"&&!t.repeat.days.length)t.repeat.days=[dowOf(k)];
        if(v==="monthly")t.repeat.dom=keyToDate(k).getDate();
        redraw();
      }));
    if(t.repeat.kind==="weekly")parts.push(dayPills(t.repeat.days,()=>redraw()));
    if(t.repeat.kind==="monthly"){
      /* Monthly means one of two things, and "first Saturday" is the one a
         date cannot express. Both fit on one line, and neither is visible
         unless Monthly is the chosen frequency. */
      parts.push(segmented([["date","On a date"],["weekday","On a weekday"]],
        t.repeat.nth?"weekday":"date",v=>{
          if(v==="weekday"){
            /* Default to the occurrence today actually is, so switching does
               not silently move the task off today's list. */
            if(!t.repeat.nth)t.repeat.nth=Math.floor((keyToDate(k).getDate()-1)/7)+1;
            if(t.repeat.dow===null||t.repeat.dow===undefined)t.repeat.dow=dowOf(k);
          }else t.repeat.nth=null;
          redraw();}));
      if(t.repeat.nth){
        const nthSel=el("select",{onchange:e=>{
            t.repeat.nth=parseInt(e.target.value,10);redraw();}},
          [1,2,3,4,-1].map(v=>el("option",{value:String(v),
            selected:t.repeat.nth===v,text:NTH[String(v)]})));
        const dowSel=el("select",{onchange:e=>{
            t.repeat.dow=parseInt(e.target.value,10);redraw();}},
          [1,2,3,4,5,6,0].map(d=>el("option",{value:String(d),
            selected:t.repeat.dow===d,text:DAYNAMES[d]})));
        parts.push(field("On the",el("div",{class:"inline"},nthSel,dowSel),
          nextMonthlyHint(t.repeat,k)));
      }else{
        parts.push(field("Day of the month",numInput(t.repeat.dom,v=>{
          t.repeat.dom=clampInt(v,1,31,1);redraw();},1,31)));
      }
    }
    if(t.repeat.kind==="every"){
      const n=numInput(t.repeat.every,v=>{t.repeat.every=clampInt(v,1,365,1);redraw();},1,365);
      const unit=el("select",{onchange:e=>{t.repeat.unit=e.target.value;redraw();}},
        ["day","week","month"].map(u=>el("option",{value:u,selected:t.repeat.unit===u,text:u+"s"})));
      parts.push(field("Every",el("div",{class:"inline"},n,unit),
        t.lastDone?"Last done "+shortDate(t.lastDone):"Never done yet, so it is due now"));
    }
    parts.push(el("button",{class:"btn quiet small",text:"Make it a one-off instead",onclick:()=>{
      t.repeat.kind="once";
      if(!t.date)t.date=state.today;
      t.weeklyTarget=null;
      redraw();}}));
    b.append(esec("How often",parts));
  }else{
    b.append(esec("When",
      field("Date",dateInput(t.date,v=>{t.date=validKey(v)?v:null;save();},redraw),
        t.date?null:"With no date it stays out of the way until you pick one."),
      el("button",{class:"btn quiet small",text:"Make it repeat instead",onclick:()=>{
        t.repeat.kind="weekly";
        if(!t.repeat.days.length)t.repeat.days=[dowOf(t.date||state.today)];
        redraw();}})));
  }

  /* --- time and alarm: only once it belongs to a day --- */
  if(!shelved)
    b.append(esec(t.time?"Time and alarm":"Time",
      field("Clock time",el("div",{class:"inline"},
        timeInput(t.time,v=>{t.time=validHM(v)?v:null;if(!t.time)t.alarm=false;save();},redraw),
        t.time?el("button",{class:"btn quiet small",text:"Clear",onclick:()=>{
          t.time=null;t.alarm=false;redraw();}}):null)),
      /* No dead switch: the alarm appears once there is a time for it to ring at. */
      t.time?switchRow("Alarm",t.alarm,v=>{t.alarm=v;redraw();},
        "Chimes at "+t.time+", but only while the app is open"):null));

  /* --- urgency and size --- */
  b.append(esec("Urgency",
    segmented([["normal","Normal"],["important","Important"],["urgent","Urgent"]],
      t.urgency,v=>{t.urgency=v;redraw();}),
    field("Takes about",el("div",{class:"inline"},
      numInput(t.minutes,v=>{t.minutes=v===""?null:clampInt(v,1,1440,null);save();},1,1440),
      el("span",{class:"unit",text:"minutes"}))),
    /* A weekly target only means something on something that recurs. */
    (!shelved&&(t.repeat.kind==="weekly"||t.repeat.kind==="every"))
      ? field("Times a week",el("div",{class:"inline"},
          numInput(t.weeklyTarget,v=>{t.weeklyTarget=v===""?null:clampInt(v,1,14,null);redraw();},1,14),
          el("span",{class:"unit",text:t.weeklyTarget?doneThisWeek(t,k)+" done this week":"optional"})))
      : null));

  /* --- steps --- */
  const hasSteps=(t.steps||[]).length>0;
  let stepList=null;
  if(hasSteps){
    stepList=el("div",{class:"steps"});
    t.steps.forEach(s=>{
      stepList.append(el("div",{class:"step","data-row":s.id},
        grip(),
        el("button",{class:"check tiny"+(s.done?" on":""),"aria-label":"Toggle step",
          onclick:()=>{s.done=!s.done;redraw();}},s.done?icon("tick"):null),
        el("input",{type:"text",value:s.title,placeholder:"Step",
          oninput:e=>{s.title=e.target.value.slice(0,160);save();}}),
        iconBtn("x","Remove step",()=>{
          t.steps=t.steps.filter(x=>x.id!==s.id);redraw();})));
    });
    makeSortable(stepList,ids=>{
      const pos={};ids.forEach((id,i)=>{pos[id]=i;});
      t.steps.sort((a,b2)=>(pos[a.id]===undefined?99:pos[a.id])-(pos[b2.id]===undefined?99:pos[b2.id]));
      saveState();
    });
  }
  const addStep=el("button",{class:"btn quiet small",
    text:hasSteps?"+ Add step":"+ Break it into steps",
    onclick:()=>{
      t.steps.push(sanitizeStep({title:""}));redraw();
      const inputs=document.querySelectorAll('[data-row="'+t.id+'"] .step input');
      if(inputs.length)inputs[inputs.length-1].focus();
    }});
  /* No steps yet means no section: an empty titled box would be a box around
     nothing, and it costs a chunk of the screen to say so. */
  b.append(hasSteps?esec("Steps",stepList,addStep):addStep);

  /* --- project link --- */
  const projects=(state.projects||[]).filter(p=>p.status==="active");
  if(projects.length){
    const sel=el("select",{onchange:e=>{t.projectId=e.target.value||null;redraw();}},
      el("option",{value:"",selected:!t.projectId,text:"None"}),
      projects.map(p=>el("option",{value:p.id,selected:t.projectId===p.id,text:p.name||"Untitled"})));
    b.append(esec("Project",field("Belongs to",sel)));
  }

  /* --- actions: only the moves that make sense from here --- */
  const acts=el("div",{class:"eactions"});
  if(finished){
    acts.append(el("span",{class:"hint",text:"Done today."}));
  }else if(shelved){
    acts.append(el("button",{class:"btn",text:"Put it on today",onclick:()=>{
      putOnDay(t.id,state.today);ui.open=null;ui.page="today";render();
      toast("On today's list.");}}));
    acts.append(el("button",{class:"btn",text:"Pick a day",onclick:()=>pickDay(t,k)}));
  }else{
    if(onToday)acts.append(el("button",{class:"btn",text:"Tomorrow",onclick:()=>{
      putOnDay(t.id,addDays(state.today,1));ui.open=null;render();toast("Moved to tomorrow.");}}));
    acts.append(el("button",{class:"btn",text:"Pick a day",onclick:()=>pickDay(t,k)}));
    if(onToday)acts.append(el("button",{class:"btn quiet",text:"Not today",onclick:()=>{
      skipToday(t.id);ui.open=null;render();}}));
    acts.append(el("button",{class:"btn",text:"Someday",onclick:()=>{
      toSomeday(t.id);ui.open=null;render();toast("Moved to Someday.");}}));
  }
  acts.append(el("button",{class:"btn danger",text:"Delete",onclick:()=>{
    confirmBox("Delete this task?",t.title||"Untitled task",
      [{text:"Delete",kind:"danger",fn:()=>{deleteTask(t.id);ui.open=null;render();}},
       {text:"Cancel",kind:"quiet"}]);}}));
  acts.append(el("button",{class:"btn primary",text:"Close",onclick:()=>{
    ui.open=null;render();}}));
  b.append(acts);
  return b;
}
function pickDay(t,k){
  const body=el("div",{});
  body.append(el("p",{class:"note",text:"Put \u201C"+(t.title||"this task")+"\u201D on:"}));
  const list=el("div",{class:"list"});
  for(let i=0;i<14;i++){
    const day=addDays(state.today,i);
    const n=tasksFor(day).length;
    list.append(el("button",{class:"dayopt",onclick:()=>{
      closeModal();putOnDay(t.id,day);ui.open=null;render();
      toast("Moved to "+shortDate(day)+".");}},
      el("span",{text:i===0?"Today":i===1?"Tomorrow":longDate(day)}),
      el("span",{class:"count",text:n+(isWorkday(day)?" "+DOT+" work":"")})));
  }
  body.append(list);
  openModal("Which day?",body);
}

/* ================= tasks page ================= */
function renderTasks(){
  const root=clear(byId("page-tasks"));
  const all=(state.tasks||[]).filter(t=>!t.archived);
  const groups={
    repeating:all.filter(t=>t.bucket==="active"&&isRepeating(t)),
    scheduled:all.filter(t=>t.bucket==="active"&&!isRepeating(t)),
    someday:all.filter(t=>t.bucket==="someday")
  };
  root.append(segmented([
      ["repeating","Repeating "+groups.repeating.length],
      ["scheduled","Scheduled "+groups.scheduled.length],
      ["someday","Someday "+groups.someday.length]],
    ui.tab,v=>{ui.tab=v;ui.open=null;render();}));

  const hints={
    repeating:"Tasks that come back on their own. Tap one to change its days, time or alarm.",
    scheduled:"One-off tasks with a date. They disappear once completed.",
    someday:"A shelf, not a list. Nothing here shows up on a day until you move it there."
  };
  root.append(el("p",{class:"hint pad",text:hints[ui.tab]}));

  const list=groups[ui.tab];
  /* Same again: turning a repeating task into a one-off moves it to another
     group, and it should not disappear mid-edit. */
  if(ui.open&&!list.some(t=>t.id===ui.open)){
    const held=findTask(ui.open);
    if(held&&!held.archived)list.push(held);
  }
  if(!list.length){
    root.append(el("div",{class:"card empty"},el("p",{text:"Nothing here."})));
  }else{
    if(ui.tab==="scheduled")list.sort((a,b)=>String(a.date||"9").localeCompare(String(b.date||"9")));
    else list.sort((a,b)=>(a.order||0)-(b.order||0));
    const holder=el("div",{class:"list"});
    list.forEach(t=>holder.append(taskRow(t,{drag:ui.tab!=="scheduled"})));
    if(ui.tab!=="scheduled")makeSortable(holder,ids=>{
      ids.forEach((id,i)=>{const t=findTask(id);if(t)t.order=(i+1)*10;});
      saveState();
    });
    root.append(holder);
  }
  root.append(el("div",{class:"btnrow"},
    el("button",{class:"btn primary wide",text:"+  New task",onclick:()=>{
      const o=ui.tab==="someday"?{bucket:"someday"}
             :ui.tab==="repeating"?{repeat:{kind:"weekly",days:[dowOf(state.today)],dom:1,every:2,unit:"week"}}
             :{date:state.today};
      const t=addTask(o);
      openTask(t.id);render();
      const inp=document.querySelector('[data-row="'+t.id+'"] .titleInput');
      if(inp)inp.focus();
    }})));

  const archived=(state.tasks||[]).filter(t=>t.archived);
  if(archived.length){
    root.append(el("h2",{class:"sect",text:"Finished"}));
    const box=el("div",{class:"card"});
    archived.slice(-25).reverse().forEach(t=>{
      box.append(el("div",{class:"arow"},
        el("span",{class:"atxt",text:t.title||"Untitled"}),
        el("span",{class:"small",text:t.lastDone?shortDate(t.lastDone):""}),
        el("button",{class:"btn quiet small",text:"Restore",onclick:()=>{
          t.archived=false;if(!isRepeating(t))t.date=state.today;saveState();render();}}),
        iconBtn("x","Delete",()=>{deleteTask(t.id);render();})));
    });
    root.append(box);
  }
}

/* ================= calendar =================
   A month at a glance. Every square is a day; a lit square has something on it
   beyond the everyday routine, because a daily task falls on all of them and
   lighting all thirty would say nothing at all. Tapping a day shows everything
   on it, including the routine. */
function monthOf(k){return k.slice(0,7);}
function addMonths(mk,n){
  const d=keyToDate(mk+"-01");
  d.setMonth(d.getMonth()+n);
  return monthOf(dateKey(d));
}
function isRoutine(t){return t.repeat&&t.repeat.kind==="daily";}
/* Does this task light up day k?

   Not the everyday routine: it falls on every square and so says nothing.

   And not an interval task on every day it is merely still outstanding. An
   interval chore stays due from the day it comes round until it is actually
   done -- which is what you want on Today, and what would otherwise paint every
   remaining day of the month. It lights the day it comes due, and today while
   it is still hanging over you. */
function litBy(t,k){
  if(isRoutine(t))return false;
  if(t.repeat&&t.repeat.kind==="every")
    return k===state.today||!dueOn(t,addDays(k,-1));
  return true;
}
function calendarDays(mk){
  const first=keyToDate(mk+"-01");
  const start=new Date(first);
  start.setDate(1-((first.getDay()+6)%7));       /* back to the Monday */
  const out=[];
  for(let i=0;i<42;i++){
    const d=new Date(start.getTime());
    d.setDate(start.getDate()+i);
    const k=dateKey(d);
    const all=tasksFor(k);
    out.push({key:k,day:d.getDate(),inMonth:d.getMonth()===first.getMonth(),
              total:all.length,notable:all.filter(t=>litBy(t,k)).length});
  }
  /* a trailing week made entirely of the next month is just an empty row */
  while(out.length>35&&out.slice(-7).every(c=>!c.inMonth))out.length-=7;
  return out;
}
function renderCalendar(){
  const root=clear(byId("page-calendar"));
  const mk=ui.month||monthOf(state.today);
  const d0=keyToDate(mk+"-01");

  root.append(el("div",{class:"calhead"},
    iconBtn("calnav","Previous month",()=>{ui.month=addMonths(mk,-1);render();},"back"),
    el("div",{class:"calmonth",text:MONTHS[d0.getMonth()]+" "+d0.getFullYear()}),
    iconBtn("calnav","Next month",()=>{ui.month=addMonths(mk,1);render();},"chev")));

  const grid=el("div",{class:"calgrid"});
  [1,2,3,4,5,6,0].forEach(dw=>grid.append(el("div",{class:"caldow",text:DAYSHORT[dw]})));
  calendarDays(mk).forEach(c=>{
    const cls=["calcell"];
    if(!c.inMonth)cls.push("out");
    if(c.key===state.today)cls.push("today");
    if(c.notable)cls.push(c.notable>=3?"lit3":c.notable===2?"lit2":"lit1");
    grid.append(el("button",{class:cls.join(" "),
      "aria-label":longDate(c.key)+", "+c.total+" tasks",
      onclick:()=>dayPopup(c.key)},
      el("span",{class:"caldate",text:String(c.day)}),
      c.notable?el("span",{class:"calcount",text:String(c.notable)}):null));
  });
  root.append(grid);

  root.append(el("div",{class:"callegend"},
    el("span",{class:"legendswatch",style:"background:var(--lit1)"}),
    el("span",{class:"legendswatch",style:"background:var(--lit2)"}),
    el("span",{class:"legendswatch",style:"background:var(--lit3)"}),
    el("span",{text:"more on the day"})));
  root.append(el("p",{class:"hint pad",
    text:"Everyday routines are not counted here, or every square would be lit. Tap a day to see all of it."}));

  if(mk!==monthOf(state.today))
    root.append(el("div",{class:"btnrow"},
      el("button",{class:"btn",text:"Back to this month",onclick:()=>{
        ui.month=monthOf(state.today);render();}})));
}
function dayPopup(k){
  const list=tasksFor(k);
  const body=el("div",{});
  if(!list.length)body.append(el("p",{class:"note",text:"Nothing on this day."}));
  else{
    const holder=el("div",{});
    list.forEach(t=>{
      const done=isDone(k,t.id);
      const bits=[];
      if(t.time)bits.push(t.time);
      if(isRepeating(t))bits.push(repeatLabel(t));
      if(t.minutes)bits.push("about "+t.minutes+" min");
      if(done)bits.push("done");
      holder.append(el("button",{class:"dayrow"+(done?" done":""),
        onclick:()=>{closeModal();goToTask(t);}},
        el("span",{class:"dayrowtxt"},
          el("span",{class:"ttitle",text:t.title||"Untitled task"}),
          bits.length?el("span",{class:"tsub",text:bits.join("  "+DOT+"  ")}):null),
        el("span",{class:"chev"},icon("chev"))));
    });
    body.append(holder);
  }
  body.append(el("div",{class:"btnrow"},
    el("button",{class:"btn",text:"+  Add a task on this day",onclick:()=>{
      closeModal();
      goToTask(addTask({date:k,start:k<state.today?k:state.today}));
    }})));
  openModal(longDate(k),body);
}
/* Open a task's editor wherever it lives. renderTasks keeps an open task on
   screen even when its group would filter it out, so this always lands. */
function goToTask(t){
  ui.page="tasks";
  ui.tab=t.bucket==="someday"?"someday":(isRepeating(t)?"repeating":"scheduled");
  openTask(t.id);
  render();
  const node=document.querySelector('[data-row="'+t.id+'"]');
  if(node&&node.scrollIntoView)node.scrollIntoView({block:"start"});
}

/* ================= projects ================= */
function renderProjects(){
  const root=clear(byId("page-projects"));
  if(ui.project){
    const p=findProject(ui.project);
    if(p){root.append(projectDetail(p));return;}
    ui.project=null;
  }
  const list=(state.projects||[]).filter(p=>p.status==="active")
    .sort((a,b)=>(a.order||0)-(b.order||0));
  root.append(el("p",{class:"hint pad",
    text:"Drag to put them in the order you want to work on them. Tap one to open it."}));
  if(!list.length){
    root.append(el("div",{class:"card empty"},el("p",{text:"No projects yet."})));
  }else{
    const holder=el("div",{class:"list"});
    list.forEach(p=>{
      const total=(p.steps||[]).length,done=(p.steps||[]).filter(s=>s.done).length;
      holder.append(el("div",{class:"task proj","data-row":p.id},
        el("div",{class:"thead"},
          grip(),
          el("div",{class:"tmid",onclick:()=>{ui.project=p.id;render();}},
            el("div",{class:"ttitle",text:p.name||"Untitled project"}),
            el("div",{class:"tsub",text:projectNext(p)?"Next: "+projectNext(p):"No steps yet"})),
          el("div",{class:"tright"},
            total?el("span",{class:"timechip mono",text:done+"/"+total}):null,
            el("span",{class:"chev"},icon("chev"))))));
    });
    makeSortable(holder,ids=>{
      ids.forEach((id,i)=>{const p=findProject(id);if(p)p.order=(i+1)*10;});
      saveState();
    });
    root.append(holder);
  }
  root.append(el("div",{class:"btnrow"},
    el("button",{class:"btn primary wide",text:"+  New project",onclick:()=>{
      const p=newProject({name:""});
      state.projects.push(p);saveState();ui.project=p.id;render();
      const inp=document.querySelector("#page-projects .titleInput");
      if(inp)inp.focus();
    }})));

  const done=(state.projects||[]).filter(p=>p.status==="done");
  if(done.length){
    root.append(el("h2",{class:"sect",text:"Completed"}));
    const box=el("div",{class:"card"});
    done.forEach(p=>{
      box.append(el("div",{class:"arow"},
        el("span",{class:"atxt",text:p.name||"Untitled"}),
        el("button",{class:"btn quiet small",text:"Reopen",onclick:()=>{
          p.status="active";saveState();render();}}),
        iconBtn("x","Delete",()=>{
          confirmBox("Delete this project?",p.name,[
            {text:"Delete",kind:"danger",fn:()=>{
              state.projects=state.projects.filter(x=>x.id!==p.id);saveState();render();}},
            {text:"Cancel",kind:"quiet"}]);})));
    });
    root.append(box);
  }
}
function projectDetail(p){
  const wrap=el("div",{});
  const save=()=>saveState();
  const redraw=()=>{saveState();render();};
  wrap.append(el("button",{class:"back",onclick:()=>{ui.project=null;render();}},
    icon("back"),el("span",{text:"All projects"})));

  const card=el("div",{class:"card"});
  const name=el("input",{class:"titleInput big",type:"text",value:p.name,
    placeholder:"Project name",maxlength:"120"});
  name.addEventListener("input",()=>{p.name=name.value.slice(0,120);save();});
  card.append(name);
  const notes=el("textarea",{placeholder:"What is this project, and what does finished look like?",rows:"3"});
  notes.value=p.notes;
  notes.addEventListener("input",()=>{p.notes=notes.value.slice(0,4000);save();});
  card.append(notes);
  wrap.append(card);

  const total=(p.steps||[]).length,done=(p.steps||[]).filter(s=>s.done).length;
  wrap.append(el("h2",{class:"sect",text:"Steps"+(total?"  "+done+" of "+total:"")}));
  if(total){
    const bar=el("div",{class:"bar"},el("div",{class:"fill",
      style:"width:"+Math.round(done/total*100)+"%"}));
    wrap.append(bar);
  }
  const steps=el("div",{class:"list"});
  (p.steps||[]).forEach(s=>{
    steps.append(el("div",{class:"task step-row"+(s.done?" done":""),"data-row":s.id},
      el("div",{class:"thead"},
        grip(),
        el("button",{class:"check"+(s.done?" on":""),"aria-label":"Toggle step",
          onclick:()=>{s.done=!s.done;redraw();}},el("span",{text:s.done?"\u2713":""})),
        el("input",{class:"stepInput",type:"text",value:s.title,placeholder:"What needs doing?",
          oninput:e=>{s.title=e.target.value.slice(0,160);save();}}),
        el("button",{class:"btn quiet small",text:"Today",onclick:()=>{
          const t=addTask({title:s.title||p.name,date:state.today,start:state.today,
            projectId:p.id,notes:"From project: "+p.name});
          ui.page="today";openTask(t.id);render();
          toast("Added to today.");}}),
        iconBtn("x","Remove step",()=>{
          p.steps=p.steps.filter(x=>x.id!==s.id);redraw();}))));
  });
  makeSortable(steps,ids=>{
    const pos={};ids.forEach((id,i)=>{pos[id]=i;});
    p.steps.sort((a,b)=>(pos[a.id]===undefined?999:pos[a.id])-(pos[b.id]===undefined?999:pos[b.id]));
    saveState();
  });
  wrap.append(steps);
  wrap.append(el("div",{class:"btnrow"},
    el("button",{class:"btn",text:"+  Add step",onclick:()=>{
      p.steps.push(sanitizeStep({title:""}));redraw();
      const inputs=document.querySelectorAll("#page-projects .stepInput");
      if(inputs.length)inputs[inputs.length-1].focus();
    }})));

  const linked=(state.tasks||[]).filter(t=>t.projectId===p.id&&!t.archived);
  if(linked.length){
    wrap.append(el("h2",{class:"sect",text:"Tasks in this project"}));
    const holder=el("div",{class:"list"});
    linked.forEach(t=>holder.append(taskRow(t,{drag:false})));
    wrap.append(holder);
  }

  wrap.append(el("div",{class:"btnrow spread"},
    el("button",{class:"btn",text:"Mark project complete",onclick:()=>{
      p.status="done";ui.project=null;redraw();toast("Project completed.");}}),
    el("button",{class:"btn danger",text:"Delete project",onclick:()=>{
      confirmBox("Delete this project?","Its steps go with it. Tasks stay.",[
        {text:"Delete",kind:"danger",fn:()=>{
          state.projects=state.projects.filter(x=>x.id!==p.id);
          (state.tasks||[]).forEach(t=>{if(t.projectId===p.id)t.projectId=null;});
          ui.project=null;redraw();}},
        {text:"Cancel",kind:"quiet"}]);}})));
  return wrap;
}

/* ================= settings ================= */
function renderSettings(){
  const root=clear(byId("page-settings"));
  const p=state.profile;
  const save=()=>saveState();
  const redraw=()=>{saveState();render();};

  root.append(el("button",{class:"back",onclick:()=>{ui.page="today";render();}},
    icon("back"),el("span",{text:"Done"})));

  /* --- work --- */
  root.append(el("h2",{class:"sect",text:"Work"}));
  const w=el("div",{class:"card"});
  w.append(el("label",{class:"blab",text:"Workdays"}));
  w.append(dayPills(p.workdays,()=>redraw()));
  w.append(field("Shift starts",timeInput(p.shiftStart,v=>{
    if(validHM(v))p.shiftStart=v;save();},redraw)));
  w.append(field("Shift ends",timeInput(p.shiftEnd,v=>{
    if(validHM(v))p.shiftEnd=v;save();},redraw)));
  w.append(field("Normal commute",minutesField(p,"commuteNormal",redraw)));
  w.append(field("Slow-traffic commute",minutesField(p,"commuteSlow",redraw)));
  w.append(field("Parking and walking",minutesField(p,"parkingWalk",redraw)));
  w.append(field("Getting ready takes",minutesField(p,"prepDuration",redraw)));
  w.append(field("Arrival margin",minutesField(p,"arrivalMargin",redraw)));
  const wt=workTimes(p);
  w.append(el("p",{class:"calc mono",
    text:"out of bed "+wt.bed+"   ready "+wt.prep+"   leave "+wt.leave+"   arrive "+wt.arrive}));
  root.append(w);

  /* --- the day --- */
  root.append(el("h2",{class:"sect",text:"The day"}));
  const d=el("div",{class:"card"});
  d.append(field("Day rolls over at",timeInput(p.dayReset,v=>{
    if(validHM(v))p.dayReset=v;save();},()=>{state.today=null;ensureToday();redraw();}),
    "Work after midnight still belongs to the day before. Everything is ordered from this time."));
  d.append(field("Usual waking time",timeInput(p.wakeTime,v=>{if(validHM(v))p.wakeTime=v;save();})));
  d.append(field("Usual sleep time",timeInput(p.sleepTime,v=>{if(validHM(v))p.sleepTime=v;save();})));
  d.append(el("p",{class:"hint",text:"Time zone: "+deviceTimeZone()+" "+DOT+" from this device"}));
  root.append(d);

  /* --- gym --- */
  root.append(el("h2",{class:"sect",text:"Gym"}));
  const g=el("div",{class:"card"});
  const gym=(state.tasks||[]).find(t=>t.title==="Go to the gym"&&!t.archived);
  if(gym){
    g.append(el("p",{class:"hint",
      text:"The gym is an ordinary task. Its days, time and weekly target live in the task itself."}));
    g.append(el("div",{class:"btnrow"},
      el("button",{class:"btn",text:"Open the gym task",onclick:()=>{
        ui.page="tasks";ui.tab=isRepeating(gym)?"repeating":"scheduled";openTask(gym.id);render();}})));
    g.append(el("p",{class:"calc",text:repeatLabel(gym)+
      (gym.weeklyTarget?"   "+doneThisWeek(gym,state.today)+" of "+gym.weeklyTarget+" this week":"")}));
  }else{
    g.append(el("p",{class:"hint",text:"No gym task right now."}));
    g.append(el("div",{class:"btnrow"},el("button",{class:"btn",text:"Create one",onclick:()=>{
      const t=addTask({title:"Go to the gym",minutes:p.gymDuration||60,weeklyTarget:4,
        urgency:"important",repeat:{kind:"weekly",days:p.gymDays.slice(),dom:1,every:2,unit:"week"}});
      ui.page="tasks";ui.tab="repeating";openTask(t.id);render();}})));
  }
  root.append(g);

  /* --- appearance --- */
  root.append(el("h2",{class:"sect",text:"Appearance and sound"}));
  const a=el("div",{class:"card"});
  a.append(field("Theme",segmented([["dark","Dark"],["light","Light"]],p.theme,v=>{
    p.theme=v;applyTheme();redraw();})));
  a.append(switchRow("Chime when an alarm comes due",p.sound,v=>{p.sound=v;redraw();},
    "Only while the app is open and awake. The iPad cannot wake it, so keep a real alarm for work."));
  a.append(switchRow("Show a line about tomorrow",p.showTomorrow,v=>{p.showTomorrow=v;redraw();}));
  a.append(el("div",{class:"btnrow"},
    el("button",{class:"btn",text:"Test the chime",onclick:playChime})));
  root.append(a);

  /* --- backup --- */
  root.append(el("h2",{class:"sect",text:"Backup"}));
  const b=el("div",{class:"card"});
  b.append(el("p",{class:"note",
    text:"Everything lives in this browser on this device. If Safari's website data is cleared it is gone, so export a copy now and then."}));
  if(state.settings.lastExport)
    b.append(el("p",{class:"hint",text:"Last export "+shortDate(state.settings.lastExport)}));
  const file=el("input",{type:"file",accept:"application/json",style:"display:none",
    onchange:e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value="";}});
  b.append(file);
  b.append(el("div",{class:"btnrow"},
    el("button",{class:"btn primary",text:"Export backup",onclick:exportData}),
    el("button",{class:"btn",text:"Import backup",onclick:()=>file.click()}),
    el("button",{class:"btn danger",text:"Erase everything",onclick:resetApp})));
  root.append(b);

  /* --- the wall device --- */
  root.append(el("h2",{class:"sect",text:"Wall device"}));
  const wd=el("div",{class:"card"});
  wd.append(el("p",{class:"note",
    text:"Every clock time in one flat file, for the Raspberry Pi build to read and sound properly."}));
  wd.append(el("div",{class:"btnrow"},
    el("button",{class:"btn",text:"Export alarm schedule",onclick:exportAlarms})));
  root.append(wd);

  const installed=(typeof navigator!=="undefined"&&navigator.serviceWorker&&navigator.serviceWorker.controller)
    ?"installed "+DOT+" works offline":"not installed for offline use";
  const mig=state.settings.migratedFrom?" "+DOT+" upgraded from version 1":"";
  root.append(el("p",{class:"version",
    text:"Daily Task Manager "+DOT+" version "+APP_VERSION+" "+DOT+" "+installed+mig}));
}
function minutesField(p,key,redraw){
  return el("div",{class:"inline"},
    numInput(p[key],v=>{p[key]=clampInt(v,0,600,p[key]);redraw();},0,600),
    el("span",{class:"unit",text:"min"}));
}

/* ================= first run ================= */
function showSetup(){
  const p=state.profile;
  const body=el("div",{});
  body.append(el("p",{class:"note",
    text:"Two things and you are done. Everything else is editable later, and every task can be changed by tapping it."}));
  body.append(el("h3",{class:"esect",text:"Which days do you work?"}));
  body.append(dayPills(p.workdays,()=>{}));
  body.append(el("h3",{class:"esect",text:"When does the shift start and end?"}));
  body.append(field("Shift starts",timeInput(p.shiftStart,v=>{if(validHM(v))p.shiftStart=v;})));
  body.append(field("Shift ends",timeInput(p.shiftEnd,v=>{if(validHM(v))p.shiftEnd=v;})));
  body.append(el("h3",{class:"esect",text:"Gym days"}));
  body.append(dayPills(p.gymDays,()=>{}));
  body.append(el("div",{class:"btnrow"},
    el("button",{class:"btn primary wide",text:"Start",onclick:()=>{
      p.setupComplete=true;
      const gym=(state.tasks||[]).find(t=>t.title==="Go to the gym");
      if(gym)gym.repeat.days=p.gymDays.slice();
      saveState();closeModal();render();
    }})));
  openModal("Daily Task Manager",body);
}

/* ================= shell ================= */
function applyTheme(){
  document.documentElement.setAttribute("data-theme",
    state.profile.theme==="light"?"light":"dark");
}
function render(){
  ensureToday();
  if(ui.notes&&ui.notes!==ui.open)ui.notes=null;
  renderHeader();
  ["today","tasks","projects","calendar","settings"].forEach(n=>{
    byId("page-"+n).classList.toggle("hidden",ui.page!==n);});
  if(ui.page==="today")renderToday();
  else if(ui.page==="tasks")renderTasks();
  else if(ui.page==="projects")renderProjects();
  else if(ui.page==="calendar")renderCalendar();
  else renderSettings();
  document.querySelectorAll("#tabs button").forEach(b=>{
    b.classList.toggle("on",b.getAttribute("data-page")===ui.page);});
  byId("gear").classList.toggle("on",ui.page==="settings");
  saveState();
}
function goto(page){
  if(ui.page===page&&page==="projects"&&ui.project){ui.project=null;render();return;}
  ui.page=page;ui.open=null;
  if(page!=="projects")ui.project=null;
  render();
  window.scrollTo(0,0);
}

/* ================= progressive web app ================= */
function registerServiceWorker(){
  if(typeof navigator==="undefined"||!("serviceWorker" in navigator))return;
  if(typeof location==="undefined")return;
  if(location.protocol!=="http:"&&location.protocol!=="https:")return;
  navigator.serviceWorker.addEventListener("message",ev=>{
    if(ev.data&&ev.data.type==="updated")showUpdateBar();});
  navigator.serviceWorker.register("sw.js").then(reg=>{
    setInterval(()=>{reg.update().catch(()=>{});},6*60*60*1000);
  }).catch(()=>{});
}
function showUpdateBar(){
  if(byId("updateBar"))return;
  document.body.appendChild(el("div",{id:"updateBar",class:"updatebar"},
    el("span",{text:"A new version is ready."}),
    el("button",{class:"btn primary",text:"Reload",onclick:()=>location.reload()}),
    el("button",{class:"btn quiet",text:"Later",onclick:()=>{
      const b=byId("updateBar");if(b)b.remove();}})));
}
function pageFromHash(){
  if(typeof location==="undefined")return null;
  const h=(location.hash||"").replace("#","");
  return ["today","tasks","projects","calendar","settings"].includes(h)?h:null;
}

/* Tapping anywhere outside an open task closes it, the same as its Close
   button -- the empty margins beside the column are the natural place to tap.
   Walking up from the target by hand rather than using closest() is deliberate:
   a tap inside the editor may have already rebuilt the page, leaving the target
   detached, and the walk still finds the task it belonged to. */
function closeOnOutsideTap(){
  /* Every fresh interaction starts with a clean slate, so the flag can never
     go stale and swallow a legitimate outside tap. */
  document.addEventListener("pointerdown",()=>{openedByThisTap=false;},true);
  document.addEventListener("click",ev=>{
    if(openedByThisTap){openedByThisTap=false;return;}
    if(!ui.open)return;
    let n=ev.target;
    if(!n||!n.closest)return;
    if(n.closest("#modalHost")||n.closest("#tabs")||n.closest("#gear"))return;
    while(n&&n.getAttribute){
      if(n.getAttribute("data-row")===ui.open)return;   /* inside the open task */
      n=n.parentElement;
    }
    ui.open=null;ui.notes=null;render();
  });
}

/* ================= behave like an app, not a page =================
   Three layers, because iOS honours different ones in Safari and in an
   installed web app: the viewport meta, touch-action in CSS, and these. Safari
   pinch-zoom arrives as its own gesture events, and the long-press callout
   ("Copy / Look Up / Translate") comes through contextmenu. */
function lockDownGestures(){
  const stop=e=>{e.preventDefault();};
  ["gesturestart","gesturechange","gestureend"].forEach(t=>{
    document.addEventListener(t,stop,{passive:false});
  });
  document.addEventListener("touchmove",e=>{
    if(e.touches&&e.touches.length>1)e.preventDefault();
  },{passive:false});
  document.addEventListener("contextmenu",e=>{
    /* Still allow it inside a field, where selecting text is the point. */
    const tag=e.target&&e.target.tagName;
    if(tag==="INPUT"||tag==="TEXTAREA")return;
    e.preventDefault();
  });
  /* Double-tap zoom is already gone via touch-action:pan-y. Do not also swallow
     the second of two quick taps here -- that breaks ticking two tasks off in a
     row, which is a far worse bug than the one it would guard against. */
}

/* ================= boot ================= */
function boot(){
  state=loadState();
  state.today=null;
  ensureToday();
  if(!state.settings.firstDay){state.settings.firstDay=state.today;}
  applyTheme();
  const start=pageFromHash();
  if(start)ui.page=start;
  render();
  document.querySelectorAll("#tabs button").forEach(b=>{
    b.addEventListener("click",()=>goto(b.getAttribute("data-page")));});
  byId("gear").addEventListener("click",()=>goto("settings"));
  document.querySelector("#modalHost .veil").addEventListener("click",closeModal);
  lockDownGestures();
  closeOnOutsideTap();
  if(!state.profile.setupComplete)showSetup();
  window.addEventListener("hashchange",()=>{const p=pageFromHash();if(p)goto(p);});
  registerServiceWorker();
  setInterval(()=>{
    if(ensureToday()){ui.open=null;render();checkAlarms();return;}
    renderHeader();
    /* Never rebuild the list while a task is open -- it would take the
       keyboard away mid-sentence. */
    if(ui.page==="today"&&!ui.open)renderToday();
    checkAlarms();
  },30000);
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden)return;
    if(ensureToday()){ui.open=null;render();}
    checkAlarms();
  });
  saveState();
}
if(typeof document!=="undefined"&&typeof window!=="undefined"){
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
}

/* ================= test seam ================= */
if(typeof module!=="undefined"&&module.exports){
  module.exports={_test:{
    APP_VERSION,SCHEMA_VERSION,LS_KEY,
    defaultState,validateState,migrateV1,
    setState:s=>{state=s;if(!state.today)state.today=personalDayKey(new Date());},
    getState:()=>state,
    newTask,sanitizeTask,newProject,sanitizeProject,seedTasks,
    dueOn,repeatLabel,isRepeating,tasksFor,dayRec,defaultDaySort,
    personalDayKey,dayMinutes,workTimes,isWorkday,ensureToday,
    completeTask,uncompleteTask,skipToday,putOnDay,toSomeday,deleteTask,addTask,
    doneThisWeek,alarmSchedule,makeBackup,readBackup,backupDue,icon,ICONS,ui,
    calendarDays,monthOf,addMonths,isRoutine,nextMonthlyHint,
    parseHM,fmtHM,dateKey,addDays,daysBetween,weekKeyOf,validHM,validKey,clampInt,
    pageFromHash,
    render:typeof render==="function"?render:null
  }};
}
