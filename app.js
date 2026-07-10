"use strict";
/* ================= utilities ================= */
const DAYNAMES=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYSHORT=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
function parseHM(s){const p=String(s||"0:0").split(":");return (Number(p[0])||0)*60+(Number(p[1])||0);}
function fmtHM(mins){mins=((mins%1440)+1440)%1440;const h=Math.floor(mins/60),m=mins%60;
  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");}
function dateKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function keyToDate(k){const p=k.split("-").map(Number);return new Date(p[0],p[1]-1,p[2]);}
function dowOf(k){return keyToDate(k).getDay();}
function addDays(k,n){const d=keyToDate(k);d.setDate(d.getDate()+n);return dateKey(d);}
function addRecur(k,n,unit){const d=keyToDate(k);
  if(unit==="day")d.setDate(d.getDate()+n);
  else if(unit==="week")d.setDate(d.getDate()+7*n);
  else d.setMonth(d.getMonth()+n);
  return dateKey(d);}
function weekKeyOf(k){const d=keyToDate(k);const off=(d.getDay()+6)%7;d.setDate(d.getDate()-off);return dateKey(d);}
function uid(){return "t"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function clampInt(v,lo,hi,def){v=parseInt(v,10);if(isNaN(v))return def;return Math.min(hi,Math.max(lo,v));}
function validHM(s){return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(s||""));}
function deviceTimeZone(){
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"device local time";}
  catch(e){return "device local time";}
}

/* ================= personal day ================= */
function personalDayKey(now){
  const reset=parseHM(state.profile.dayReset);
  const d=new Date(now.getTime());
  const nowMin=d.getHours()*60+d.getMinutes();
  if(nowMin<reset)d.setDate(d.getDate()-1);
  return dateKey(d);
}
function workTimes(p){
  const shift=parseHM(p.shiftStart);
  const arrive=shift-p.arrivalMargin;
  const leave=arrive-p.parkingWalk-p.commuteNormal;
  const leaveSlow=arrive-p.parkingWalk-p.commuteSlow;
  const prep=leave-p.prepDuration;
  const bed=prep-5;
  return {bed:fmtHM(bed),prep:fmtHM(prep),leave:fmtHM(leave),leaveSlow:fmtHM(leaveSlow),arrive:fmtHM(arrive)};
}

/* ================= task template library ================= */
/* Home / storage recovery templates. threshold = completions before the app
   gently asks whether the problem is resolved (null = never ask). */
const RECOVERY=[
 {id:"rubbish",area:"home",title:"Fill one bag with obvious rubbish",smaller:"Throw away ten obvious rubbish items",min:15,threshold:4,
  maint:{title:"Do a ten-minute rubbish check",n:1,unit:"week",dow:null}},
 {id:"carrybag",area:"home",title:"Carry one prepared bag out",smaller:null,min:5,threshold:null,tiny:true,maint:null},
 {id:"boxes",area:"home",title:"Flatten three empty delivery boxes",smaller:"Flatten one delivery box",min:10,threshold:4,
  maint:{title:"Check for empty delivery boxes and remove them",n:1,unit:"month",dow:null}},
 {id:"cables",area:"home",title:"Collect loose cables from one section of the floor",smaller:"Put loose cables from one small area into a container",min:10,threshold:5,
  maint:{title:"Check that no loose cables are lying on the floor",n:2,unit:"week",dow:null}},
 {id:"floor",area:"home",title:"Clear one small section of floor",smaller:"Pick up five items from the floor",min:15,threshold:6,
  maint:{title:"Check that cleared walking paths remain open",n:2,unit:"week",dow:null}},
 {id:"movefive",area:"home",title:"Move five objects into the correct room",smaller:"Move two objects into the correct room",min:10,threshold:6,maint:null},
 {id:"vacuum",area:"home",title:"Vacuum one cleared section of floor",smaller:"Vacuum one small patch of floor",min:10,threshold:10,
  maint:{title:"Vacuum the whole apartment",n:1,unit:"month",dow:6}},
 {id:"storage",area:"storage",title:"Spend ten minutes sorting one small storage-room category",smaller:"Sort one small group of items for five minutes",min:10,threshold:8,
  maint:{title:"Do a ten-minute storage-room check",n:1,unit:"month",dow:null}}
];
const RECOVERY_BY_ID={};RECOVERY.forEach(t=>RECOVERY_BY_ID[t.id]=t);

/* One-time life-improvement sequences (one visible step at a time). */
const SEQUENCES={
 dentist:{area:"dentist",label:"Dental examination",steps:[
   "Find or choose a dentist",
   "Find the dentist's contact information",
   "Book a dental examination",
   "Attend the dental examination"]},
 glasses:{area:"glasses",label:"New glasses",steps:[
   "Choose an optician",
   "Book an eye examination",
   "Attend the eye examination",
   "Look for suitable frames",
   "Order the new glasses",
   "Collect and adjust the new glasses"]},
 posture_setup:{area:"posture",label:"Posture assessment",steps:[
   "Arrange a professional posture or physiotherapy assessment"]}
};

/* ================= state ================= */
/* Built-in timed routines, created as normal editable "my own tasks". */
const SEED_ROUTINES=[
  {id:"seed_shower",title:"Shower",freq:"daily",days:[],date:null,time:"04:00",min:20},
  {id:"seed_washing",title:"Washing machine",freq:"weekly",days:[6,0],date:null,time:"15:50",min:null},
  {id:"seed_dishwasher",title:"Dishwasher",freq:"weekly",days:[0],date:null,time:"23:30",min:null}
];
function ensureSeedRoutines(){
  if(state.settings.seededRoutines)return false;
  if(!state.custom)state.custom=[];
  let added=false;
  SEED_ROUTINES.forEach(sd=>{
    if(state.custom.some(c=>c.id===sd.id))return;
    state.custom.push(Object.assign({finished:false,notBefore:null},sd));
    added=true;
  });
  state.settings.seededRoutines=true;
  return added;
}
function defaultProjects(){
  return [
   {id:uid(),name:"Synthesizer build",type:"Electronics",status:"Stored",next:"Decide which module to start with",notes:""},
   {id:uid(),name:"Headphone design",type:"Audio design",status:"Stored",next:"Sketch the driver and enclosure concept",notes:""},
   {id:uid(),name:"Music production",type:"Music",status:"Stored",next:"Pick one track idea to develop",notes:""},
   {id:uid(),name:"Speaker design",type:"Audio design",status:"Stored",next:"List candidate drivers",notes:""}
  ];
}
function defaultState(){
  const seq={};for(const k in SEQUENCES)seq[k]={step:0,finished:false,notBefore:null};
  const tmpl={};RECOVERY.forEach(t=>tmpl[t.id]={status:"active",count:0,skips:0,lastPrompt:0,notBefore:null});
  return {
    schemaVersion:1,
    profile:{
      setupComplete:false,timezone:"Europe/Stockholm",
      workdays:[1,2,3,4,5],shiftStart:"15:18",shiftEnd:"23:54",
      commuteNormal:12,commuteSlow:20,parkingWalk:5,prepDuration:30,arrivalMargin:5,
      dayReset:"14:00",sleepTime:"05:00",wakeTime:"14:00",
      taskLoad:"normal",gymDays:[2,4,6,0],gymTime:"",gymDuration:60,groceriesTime:"22:00",
      postureRoutine:"",theme:"dark",sound:false,showTomorrow:true
    },
    areas:{
      work:{on:true,prio:"urgent",label:"Work punctuality"},
      sleep:{on:true,prio:"normal",label:"Sleep schedule"},
      oral:{on:true,prio:"urgent",label:"Oral care"},
      dentist:{on:true,prio:"urgent",label:"Dentist"},
      exercise:{on:true,prio:"important",label:"Exercise"},
      posture:{on:true,prio:"important",label:"Posture"},
      home:{on:true,prio:"important",label:"Home clutter"},
      storage:{on:true,prio:"normal",label:"Storage-room clutter"},
      glasses:{on:true,prio:"important",label:"New glasses"},
      cooking:{on:true,prio:"normal",label:"Monday cooking"},
      groceries:{on:true,prio:"normal",label:"Sunday groceries"},
      projects:{on:true,prio:"normal",label:"Creative projects"},
      leisure:{on:true,prio:"normal",label:"Leisure"}
    },
    templates: (function(){const o={};RECOVERY.forEach(t=>o[t.id]={status:"active",count:0,skips:0,lastPrompt:0,notBefore:null});return o;})(),
    sequences:seq,
    maintenance:{},   /* id -> {title,n,unit,dow,nextDue} */
    custom:[],        /* user-added tasks: {id,title,freq,days,time,min,finished,notBefore} */
    resolved:[],      /* [{id,title,date}] */
    projects:defaultProjects(),
    day:null,         /* {key, tasks:[], gen} */
    gymWeeks:{},      /* weekKey -> {done:0, moves:[{from,to}], missed:[]} */
    history:[],       /* [{key, done:[templateIds]}] */
    rotation:{home:0,opt:0},
    settings:{firstDay:null,lastExport:null,backupSnooze:null,seededRoutines:false}
  };
}
const LS_KEY="dailyTaskManagerV1";
/* Keep in step with CACHE_VERSION in sw.js when shipping an update. */
const APP_VERSION="1.2.2";
/* Bump only with a migration in validateState(). Also the guard used by import. */
const SCHEMA_VERSION=1;
let state=null;
function loadState(){
  let s=null;
  try{
    if(typeof localStorage!=="undefined"){
      const raw=localStorage.getItem(LS_KEY);
      if(raw)s=validateState(JSON.parse(raw));
    }
  }catch(e){s=null;}
  return s||defaultState();
}
function saveState(){
  try{if(typeof localStorage!=="undefined")localStorage.setItem(LS_KEY,JSON.stringify(state));}catch(e){}
}
/* Merge unknown data over defaults; keeps the app safe against bad imports. */
function validateState(obj){
  if(!obj||typeof obj!=="object"||obj.schemaVersion!==1||!obj.profile)return null;
  const d=defaultState();
  const s=defaultState();
  const p=obj.profile||{};
  for(const k in d.profile){
    if(p[k]===undefined)continue;
    const dv=d.profile[k];
    if(typeof dv==="number")s.profile[k]=clampInt(p[k],0,600,dv);
    else if(typeof dv==="boolean")s.profile[k]=!!p[k];
    else if(Array.isArray(dv))s.profile[k]=Array.isArray(p[k])?p[k].map(Number).filter(n=>n>=0&&n<=6):dv;
    else s.profile[k]=String(p[k]).slice(0,600); /* longest legit string field is postureRoutine (600) */
  }
  ["shiftStart","shiftEnd","dayReset","sleepTime","wakeTime","groceriesTime"].forEach(k=>{
    if(!validHM(s.profile[k]))s.profile[k]=d.profile[k];});
  if(!["light","normal","active"].includes(s.profile.taskLoad))s.profile.taskLoad="normal";
  if(!["dark","light"].includes(s.profile.theme))s.profile.theme="dark";
  if(obj.areas&&typeof obj.areas==="object"){
    for(const k in s.areas){ const a=obj.areas[k];
      if(a&&typeof a==="object"){ s.areas[k].on=!!a.on;
        if(["normal","important","urgent"].includes(a.prio))s.areas[k].prio=a.prio; } }
  }
  if(obj.templates&&typeof obj.templates==="object"){
    for(const k in s.templates){ const t=obj.templates[k];
      if(t&&typeof t==="object"){
        if(["active","resolved","disabled"].includes(t.status))s.templates[k].status=t.status;
        s.templates[k].count=clampInt(t.count,0,100000,0);
        s.templates[k].skips=clampInt(t.skips,0,100000,0);
        s.templates[k].lastPrompt=clampInt(t.lastPrompt,0,100000,0);
        s.templates[k].notBefore=typeof t.notBefore==="string"?t.notBefore:null; } }
  }
  if(obj.sequences&&typeof obj.sequences==="object"){
    for(const k in s.sequences){ const q=obj.sequences[k];
      if(q&&typeof q==="object"){
        s.sequences[k].step=clampInt(q.step,0,SEQUENCES[k].steps.length,0);
        s.sequences[k].finished=!!q.finished;
        s.sequences[k].notBefore=typeof q.notBefore==="string"?q.notBefore:null; } }
  }
  if(obj.maintenance&&typeof obj.maintenance==="object"){
    for(const k in obj.maintenance){ const m=obj.maintenance[k];
      if(m&&typeof m==="object"&&typeof m.title==="string"){
        s.maintenance[k]={title:m.title.slice(0,200),
          n:clampInt(m.n,1,24,1),
          unit:["day","week","month"].includes(m.unit)?m.unit:"week",
          dow:(m.dow===null||m.dow===undefined)?null:clampInt(m.dow,0,6,null),
          nextDue:typeof m.nextDue==="string"?m.nextDue:null,
          lastDone:typeof m.lastDone==="string"?m.lastDone:null}; } }
  }
  if(Array.isArray(obj.resolved))
    s.resolved=obj.resolved.filter(r=>r&&typeof r.id==="string").map(r=>({id:r.id,title:String(r.title||"").slice(0,200),date:String(r.date||"")}));
  if(Array.isArray(obj.projects))
    s.projects=obj.projects.filter(pr=>pr&&typeof pr==="object").map(pr=>({
      id:typeof pr.id==="string"?pr.id:uid(),
      name:String(pr.name||"Untitled").slice(0,120),
      type:String(pr.type||"").slice(0,80),
      status:["Primary","Secondary","Stored","Paused","Completed"].includes(pr.status)?pr.status:"Stored",
      next:String(pr.next||"").slice(0,300),
      notes:String(pr.notes||"").slice(0,2000)}));
  if(obj.day&&typeof obj.day==="object"&&typeof obj.day.key==="string"&&Array.isArray(obj.day.tasks))
    s.day={key:obj.day.key,tasks:obj.day.tasks.filter(t=>t&&typeof t==="object").map(sanitizeTask),
      note:String(obj.day.note||"").slice(0,2000)};
  if(obj.gymWeeks&&typeof obj.gymWeeks==="object"){
    for(const k in obj.gymWeeks){const g=obj.gymWeeks[k];
      if(g&&typeof g==="object")s.gymWeeks[k]={done:clampInt(g.done,0,14,0),
        moves:Array.isArray(g.moves)?g.moves.filter(m=>m&&typeof m.from==="string"&&typeof m.to==="string"):[],
        missed:Array.isArray(g.missed)?g.missed.filter(x=>typeof x==="string"):[]};}
  }
  if(Array.isArray(obj.history))
    s.history=obj.history.filter(h=>h&&typeof h.key==="string").map(h=>({key:h.key,
      done:Array.isArray(h.done)?h.done.filter(x=>typeof x==="string"):[],
      note:String(h.note||"").slice(0,500)})).slice(-120);
  if(obj.rotation&&typeof obj.rotation==="object")
    s.rotation={home:clampInt(obj.rotation.home,0,9999,0),opt:clampInt(obj.rotation.opt,0,9999,0)};
  if(Array.isArray(obj.custom))
    s.custom=obj.custom.filter(c=>c&&typeof c==="object"&&typeof c.title==="string").map(c=>({
      id:typeof c.id==="string"?c.id:uid(),
      title:c.title.slice(0,200),
      freq:["daily","weekly","once","date"].includes(c.freq)?c.freq:"daily",
      days:Array.isArray(c.days)?c.days.map(Number).filter(n=>n>=0&&n<=6):[],
      date:/^\d{4}-\d{2}-\d{2}$/.test(String(c.date||""))?c.date:null,
      time:validHM(c.time)?c.time:"",
      min:c.min?clampInt(c.min,1,600,null):null,
      finished:!!c.finished,
      notBefore:typeof c.notBefore==="string"?c.notBefore:null}));
  s.custom=s.custom.filter(c=>c.freq!=="date"||c.date); /* a dated task needs its date */
  if(obj.settings&&typeof obj.settings==="object"){
    ["firstDay","lastExport","backupSnooze"].forEach(k=>{
      s.settings[k]=typeof obj.settings[k]==="string"?obj.settings[k]:null;});
    s.settings.seededRoutines=!!obj.settings.seededRoutines;
  }
  return s;
}
function sanitizeTask(t){
  return {
    id:typeof t.id==="string"?t.id:uid(),
    tpl:typeof t.tpl==="string"?t.tpl:"",
    title:String(t.title||"").slice(0,300),
    desc:String(t.desc||"").slice(0,500),
    time:validHM(t.time)?t.time:null,
    min:t.min?clampInt(t.min,1,600,null):null,
    type:String(t.type||"task").slice(0,20),
    status:["active","done","missed","skipped"].includes(t.status)?t.status:"active",
    doneAt:typeof t.doneAt==="string"?t.doneAt:null,
    recovery:!!t.recovery,
    finishable:!!t.finishable,
    seq:typeof t.seq==="string"?t.seq:null,
    stepIndex:Number.isInteger(t.stepIndex)?t.stepIndex:null,
    maintId:typeof t.maintId==="string"?t.maintId:null,
    projId:typeof t.projId==="string"?t.projId:null,
    customId:typeof t.customId==="string"?t.customId:null,
    alerted:!!t.alerted
  };
}

/* ================= gym helpers ================= */
function gymWeek(k){const wk=weekKeyOf(k);
  if(!state.gymWeeks[wk])state.gymWeeks[wk]={done:0,moves:[],missed:[]};
  return state.gymWeeks[wk];}
function isGymDay(k){
  const dow=dowOf(k);
  let on=state.profile.gymDays.includes(dow);
  const g=gymWeek(k);
  for(const m of g.moves){ if(m.from===k)on=false; if(m.to===k)on=true; }
  return on;
}

/* ================= maintenance helpers ================= */
function maintDueOn(m,k){
  if(!m.nextDue)return false;
  if(k<m.nextDue)return false;
  if(m.dow!==null&&m.dow!==undefined&&dowOf(k)!==m.dow)return false;
  return true;
}

/* ================= custom (user-added) tasks ================= */
function customDueOn(c,k){
  if(c.finished)return false;
  if(c.notBefore){
    if(k<c.notBefore)return false;
    if(k===c.notBefore)return true; /* moved here on purpose */
  }
  if(c.freq==="weekly")return (c.days||[]).includes(dowOf(k));
  if(c.freq==="date")return !!c.date&&k>=c.date; /* shows on its day, stays until done */
  return true; /* daily and once */
}
function customInstance(c){
  let d=null;
  if(c.freq==="once")d="One-time task";
  if(c.freq==="date")d="Planned for "+c.date;
  return mkTask({tpl:"custom_"+c.id,type:"custom",customId:c.id,title:c.title,
    min:c.min||null,time:validHM(c.time)?c.time:null,desc:d});
}
function customIsOneTime(c){return c.freq==="once"||c.freq==="date";}
function findCustom(id){return (state.custom||[]).find(c=>c.id===id);}

/* ================= daily generation ================= */
function mkTask(o){return sanitizeTask(Object.assign({id:uid(),status:"active"},o));}
function areaOn(k){return state.areas[k]&&state.areas[k].on;}

function pickSequence(k){
  const order=["dentist","glasses","posture_setup"];
  /* posture assessment is optional; only offer it while no routine is set */
  for(const sid of order){
    const st=state.sequences[sid],def=SEQUENCES[sid];
    if(st.finished)continue;
    if(!areaOn(def.area))continue;
    if(st.step>=def.steps.length)continue;
    if(st.notBefore&&k<st.notBefore)continue;
    if(sid==="posture_setup"&&state.profile.postureRoutine.trim())continue;
    return mkTask({tpl:"seq_"+sid,seq:sid,stepIndex:st.step,type:"seq",finishable:true,
      title:def.steps[st.step],desc:def.label+" — step "+(st.step+1)+" of "+def.steps.length,min:15});
  }
  return null;
}
function activeRecoveryIds(){
  return RECOVERY.filter(t=>areaOn(t.area)&&state.templates[t.id].status==="active").map(t=>t.id);
}
function recoveryTask(id){
  const def=RECOVERY_BY_ID[id],ts=state.templates[id];
  const useSmaller=def.smaller&&ts.skips>=3;
  return mkTask({tpl:id,type:"home",recovery:true,finishable:true,
    title:useSmaller?def.smaller:def.title,
    min:useSmaller?Math.max(5,Math.round(def.min/2)):def.min,
    desc:useSmaller?"A smaller version, since the full task has been hard to fit in.":""});
}
function pickHome(k){
  /* due maintenance first */
  for(const id in state.maintenance){const m=state.maintenance[id];
    if(maintDueOn(m,k)&&areaOn((RECOVERY_BY_ID[id]||{area:"home"}).area))
      return mkTask({tpl:"maint_"+id,maintId:id,type:"home",title:m.title,min:10,desc:"Maintenance check"});}
  const ids=activeRecoveryIds();
  if(!ids.length)return null;
  /* a recovery task deferred to today gets picked first */
  for(const id of ids){if(state.templates[id].notBefore===k)return recoveryTask(id);}
  const eligible=ids.filter(id=>!state.templates[id].notBefore||state.templates[id].notBefore<=k);
  if(!eligible.length)return null;
  const pick=eligible[state.rotation.home%eligible.length];
  state.rotation.home++;
  return recoveryTask(pick);
}
function pickTinyHome(k){
  const ids=activeRecoveryIds().filter(id=>RECOVERY_BY_ID[id].tiny);
  if(!ids.length)return null;
  return recoveryTask(ids[0]);
}
function postureTask(){
  if(!areaOn("posture")||!state.profile.postureRoutine.trim())return null;
  return mkTask({tpl:"posture",type:"care",title:"Do your posture routine",min:10,
    desc:state.profile.postureRoutine.trim().slice(0,300)});
}
function projectTask(){
  if(!areaOn("projects"))return null;
  const p=state.projects.find(x=>x.status==="Primary");
  if(!p)return null;
  return mkTask({tpl:"project",projId:p.id,type:"project",finishable:true,min:30,
    title:"Work on \u201C"+p.name+"\u201D for 30 minutes",
    desc:p.next?("Next action: "+p.next):""});
}
function generateDay(k){
  const p=state.profile,dow=dowOf(k);
  const isWork=areaOn("work")&&p.workdays.includes(dow);
  const cap={light:4,normal:6,active:8}[p.taskLoad]||6;
  const wt=workTimes(p);
  const tasks=[];
  /* timed work tasks sit outside the daily cap */
  if(isWork){
    tasks.push(mkTask({tpl:"work_bed",type:"work",time:wt.bed,title:"Be fully out of bed"}));
    tasks.push(mkTask({tpl:"work_prep",type:"work",time:wt.prep,title:"Begin getting ready for work"}));
    tasks.push(mkTask({tpl:"work_leave",type:"work",time:wt.leave,title:"Leave home",
      desc:"Target arrival "+wt.arrive+" \u00B7 shift starts "+p.shiftStart+" \u00B7 in slow traffic leave by "+wt.leaveSlow}));
  }
  let used=0;
  const add=t=>{if(t){tasks.push(t);used++;}};
  if(areaOn("oral"))add(mkTask({tpl:"brush_am",type:"care",title:"Brush teeth after waking",min:3}));
  const gymToday=areaOn("exercise")&&isGymDay(k);
  if(gymToday)add(mkTask({tpl:"gym",type:"gym",title:"Go to the gym",min:p.gymDuration||60,
    time:validHM(p.gymTime)?p.gymTime:null,desc:"Required session \u00B7 4 per week"}));
  if(areaOn("groceries")&&dow===0)add(mkTask({tpl:"groceries",type:"routine",time:validHM(p.groceriesTime)?p.groceriesTime:"22:00",title:"Grocery shopping",min:60}));
  if(areaOn("cooking")&&dow===1)add(mkTask({tpl:"cooking",type:"routine",title:"Cook after work",min:60,
    desc:"May happen after midnight \u2014 it still counts as Monday."}));
  /* user-added tasks always appear on their days; they use up daily slots */
  (state.custom||[]).filter(c=>customDueOn(c,k)).forEach(c=>add(customInstance(c)));
  /* reserve one slot for evening oral care */
  const pmTask=areaOn("oral")?mkTask({tpl:"brush_pm",type:"care",title:"Brush teeth before sleeping",min:3}):null;
  const reserve=pmTask?1:0;

  /* optional candidates in priority order */
  const seqT=pickSequence(k);
  const homeT=pickHome(k);
  const postT=postureTask();
  const projT=projectTask();
  const checkT=(dow===0)?mkTask({tpl:"profile_check",type:"routine",min:5,
      title:"Weekly profile check",desc:"Do schedule, gym days, and projects still look right?"}):null;

  if(isWork){
    if(gymToday){
      /* gym workday: at most one tiny (~5 min) home action */
      const tiny=pickTinyHome(k);
      if(tiny&&used+reserve<cap)add(tiny);
    }else{
      /* one optional task, rotated between categories */
      const opts=[seqT,homeT,postT,projT].filter(Boolean);
      if(opts.length&&used+reserve<cap){
        add(opts[state.rotation.opt%opts.length]);
        state.rotation.opt++;
      }
    }
  }else{
    const opts=[seqT,homeT,postT,projT,checkT].filter(Boolean);
    for(const t of opts){ if(used+reserve>=cap)break; add(t); }
  }
  if(pmTask)tasks.push(pmTask);
  return tasks;
}
function archiveDay(){
  if(!state.day)return;
  const done=state.day.tasks.filter(t=>t.status==="done").map(t=>t.tpl);
  state.history.push({key:state.day.key,done:done,note:(state.day.note||"").slice(0,500)});
  if(state.history.length>120)state.history=state.history.slice(-120);
}
function ensureDay(now){
  const k=personalDayKey(now||new Date());
  if(!state.day||state.day.key!==k){
    archiveDay();
    state.day={key:k,tasks:generateDay(k),note:""};
    saveState();
    return true;
  }
  return false;
}
function regenerateToday(){
  const k=state.day.key;
  const done=state.day.tasks.filter(t=>t.status!=="active");
  const doneTpls=new Set(done.map(t=>t.tpl));
  const fresh=generateDay(k).filter(t=>!doneTpls.has(t.tpl));
  state.day.tasks=done.concat(fresh);
  saveState();
}

/* ================= task lifecycle ================= */
function findTask(id){return state.day.tasks.find(t=>t.id===id);}

function markDone(id){
  const t=findTask(id);if(!t||t.status!=="active")return;
  t.status="done";t.doneAt=new Date().toISOString();
  if(t.tpl==="gym"){gymWeek(state.day.key).done++;}
  if(t.recovery&&state.templates[t.tpl]){
    const ts=state.templates[t.tpl];
    ts.count++;ts.notBefore=null;
    saveState();
    maybeRecoveryPrompt(t.tpl);
  }else if(t.seq){
    advanceSequence(t.seq);
  }else if(t.maintId&&state.maintenance[t.maintId]){
    const m=state.maintenance[t.maintId];
    m.lastDone=state.day.key;
    m.nextDue=addRecur(state.day.key,m.n,m.unit);
  }else if(t.customId){
    const c=findCustom(t.customId);
    if(c){c.notBefore=null;if(customIsOneTime(c))c.finished=true;}
  }
  saveState();
}
function undoDone(id){
  const t=findTask(id);if(!t)return;
  if(t.status==="done"){
    if(t.tpl==="gym"){const g=gymWeek(state.day.key);g.done=Math.max(0,g.done-1);}
    if(t.recovery&&state.templates[t.tpl])state.templates[t.tpl].count=Math.max(0,state.templates[t.tpl].count-1);
    if(t.seq){const st=state.sequences[t.seq];st.step=Math.max(0,st.step-1);st.finished=false;}
    if(t.maintId&&state.maintenance[t.maintId]){const m=state.maintenance[t.maintId];m.lastDone=null;m.nextDue=state.day.key;}
    if(t.customId){const c=findCustom(t.customId);if(c&&customIsOneTime(c))c.finished=false;}
  }
  t.status="active";t.doneAt=null;
  saveState();renderToday();
}
function skipToday(id){
  const t=findTask(id);if(!t)return;
  t.status="skipped";
  if(t.recovery&&state.templates[t.tpl])state.templates[t.tpl].skips++;
  saveState();renderToday();
}
function moveTask(id){
  const t=findTask(id);if(!t)return;
  const days=[];
  for(let i=1;i<=7;i++){const k=addDays(state.day.key,i);
    days.push({k:k,label:DAYNAMES[dowOf(k)]+" ("+k.slice(5)+")"});}
  const body=el("div",{});
  body.append(el("p",{text:"Choose a day for \u201C"+t.title+"\u201D."}));
  days.forEach(d=>{
    body.append(el("button",{class:"btn wide",style:"margin-bottom:8px",onclick:()=>{
      if(t.tpl==="gym"){
        const g=gymWeek(state.day.key);
        if(weekKeyOf(d.k)!==weekKeyOf(state.day.key)){toast("Gym sessions can only move within this week.");return;}
        g.moves.push({from:state.day.key,to:d.k});
      }else if(t.recovery&&state.templates[t.tpl]){
        state.templates[t.tpl].notBefore=d.k;
      }else if(t.seq){
        state.sequences[t.seq].notBefore=d.k;
      }else if(t.customId){
        const c=findCustom(t.customId);if(c)c.notBefore=d.k;
      }else if(t.maintId&&state.maintenance[t.maintId]){
        state.maintenance[t.maintId].nextDue=d.k;
      }else{
        toast("This recurring task cannot be moved; set it aside for today instead.");return;
      }
      t.status="skipped";t.desc="Moved to "+d.label;
      saveState();closeModal();renderToday();
    },text:d.label}));
  });
  body.append(el("button",{class:"btn quiet wide",onclick:closeModal,text:"Cancel"}));
  openModal("Move to another day",body);
}
function makeSmaller(id){
  const t=findTask(id);if(!t)return;
  const def=RECOVERY_BY_ID[t.tpl];
  if(def&&def.smaller){
    t.title=def.smaller;t.min=Math.max(5,Math.round(def.min/2));
    t.desc="A smaller version of the usual task.";
    saveState();renderToday();
  }
}
function markGymMissed(id){
  const t=findTask(id);if(!t)return;
  t.status="missed";
  gymWeek(state.day.key).missed.push(state.day.key);
  saveState();renderToday();
}

/* ---------- sequences ---------- */
function advanceSequence(sid){
  const st=state.sequences[sid],def=SEQUENCES[sid];
  st.step++;st.notBefore=null;
  if(st.step>=def.steps.length){
    /* all steps done: offer to finish the sequence */
    setTimeout(()=>{
      confirmBox("All steps of \u201C"+def.label+"\u201D are complete.",
        "If the real-world goal is achieved, you can mark the whole sequence as finished. It will stop appearing.",
        [
          {label:"Mark as finished",primary:true,fn:()=>{st.finished=true;saveState();renderAll();}},
          {label:"Not yet",fn:()=>{}}
        ]);
    },250);
  }
}
function finishSequence(sid){
  const def=SEQUENCES[sid];
  confirmBox("Mark \u201C"+def.label+"\u201D as finished?",
    "This whole sequence will stop appearing. You can restore it later from Profile.",
    [
      {label:"Finish permanently",primary:true,fn:()=>{
        state.sequences[sid].finished=true;
        const t=state.day.tasks.find(x=>x.seq===sid&&x.status==="active");
        if(t)t.status="skipped";
        saveState();renderAll();}},
      {label:"Cancel",fn:()=>{}}
    ]);
}

/* ---------- finished (recovery -> maintenance) ---------- */
function finishRecovery(tplId){
  const def=RECOVERY_BY_ID[tplId];if(!def)return;
  const opts=[];
  if(def.maint){
    opts.push({label:"Finish and add maintenance",primary:true,fn:()=>{applyFinish(tplId,true);}});
    opts.push({label:"Finish without maintenance",fn:()=>{applyFinish(tplId,false);}});
  }else{
    opts.push({label:"Finish permanently",primary:true,fn:()=>{applyFinish(tplId,false);}});
  }
  opts.push({label:"Cancel",fn:()=>{}});
  const extra=def.maint?(" A lighter maintenance check can replace it: \u201C"+def.maint.title+"\u201D."):"";
  confirmBox("Mark \u201C"+def.title+"\u201D as finished?",
    "This recovery task will stop appearing."+extra,opts);
}
function applyFinish(tplId,withMaint){
  const def=RECOVERY_BY_ID[tplId];
  state.templates[tplId].status="resolved";
  state.resolved.push({id:tplId,title:def.title,date:state.day?state.day.key:dateKey(new Date())});
  if(withMaint&&def.maint){
    const from=state.day?state.day.key:dateKey(new Date());
    state.maintenance[tplId]={title:def.maint.title,n:def.maint.n,unit:def.maint.unit,
      dow:def.maint.dow,lastDone:null,nextDue:addRecur(from,def.maint.n,def.maint.unit)};
  }
  if(state.day){const t=state.day.tasks.find(x=>x.tpl===tplId&&x.status==="active");if(t)t.status="skipped";}
  saveState();renderAll();
  toast("Moved to "+(withMaint?"maintenance.":"resolved goals."));
}
function restoreRecovery(tplId){
  state.templates[tplId].status="active";
  state.resolved=state.resolved.filter(r=>r.id!==tplId);
  if(state.maintenance[tplId])delete state.maintenance[tplId];
  saveState();renderProfile();
  toast("Recovery task restored.");
}
function maybeRecoveryPrompt(tplId){
  const def=RECOVERY_BY_ID[tplId],ts=state.templates[tplId];
  if(def.threshold===null||def.threshold===undefined)return;
  if(ts.count<def.threshold)return;
  if(ts.count-ts.lastPrompt<3&&ts.lastPrompt>0)return; /* do not ask every time */
  ts.lastPrompt=ts.count;saveState();
  setTimeout(()=>{
    confirmBox("You have completed \u201C"+def.title+"\u201D "+ts.count+" times.",
      "Is this problem now resolved? Only you can decide \u2014 nothing changes unless you choose it.",
      [
        {label:"Keep this recovery task",fn:()=>{}},
        def.maint?{label:"Move to maintenance",primary:true,fn:()=>applyFinish(tplId,true)}:null,
        {label:"Close without maintenance",fn:()=>applyFinish(tplId,false)}
      ].filter(Boolean));
  },400);
}

/* ---------- project finish ---------- */
function completeProjectFromTask(projId){
  const p=state.projects.find(x=>x.id===projId);if(!p)return;
  confirmBox("Complete \u201C"+p.name+"\u201D?",
    "The project moves to Completed and stops generating tasks. You can reactivate it later.",
    [
      {label:"Complete project",primary:true,fn:()=>{
        p.status="Completed";
        const t=state.day.tasks.find(x=>x.projId===projId&&x.status==="active");
        if(t)t.status="skipped";
        saveState();renderAll();}},
      {label:"Cancel",fn:()=>{}}
    ]);
}

/* ================= backup ================= */
/* Backup envelope, matching the GAINZ convention:
   { app, schemaVersion, exportedAt, data }. Restore checks the app tag and
   refuses a backup from a newer schema, exactly as GAINZ's restoreBackup does. */
function makeBackup(){
  return {app:"daily-task-manager",schemaVersion:SCHEMA_VERSION,exportedAt:Date.now(),data:state};
}
function exportData(){
  const blob=new Blob([JSON.stringify(makeBackup(),null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="daily-task-manager-backup-"+dateKey(new Date())+".json";
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},400);
  state.settings.lastExport=personalDayKey(new Date());
  state.settings.backupSnooze=null;
  saveState();
}
/* Returns {ok,state} or {ok:false,reason}. Accepts the enveloped format and,
   for backward compatibility, a raw state object from an older export. */
function readBackup(obj){
  if(!obj||typeof obj!=="object")return {ok:false,reason:"Could not read that file."};
  if(typeof obj.app==="string"){
    if(obj.app!=="daily-task-manager")return {ok:false,reason:"That backup is for a different app."};
    if(typeof obj.schemaVersion==="number"&&obj.schemaVersion>SCHEMA_VERSION)
      return {ok:false,reason:"That backup is from a newer version of Daily Task Manager."};
    const v=validateState(obj.data);
    return v?{ok:true,state:v}:{ok:false,reason:"That file is not a valid Daily Task Manager backup."};
  }
  /* legacy: the raw state object was the whole file */
  const v=validateState(obj);
  return v?{ok:true,state:v}:{ok:false,reason:"That file is not a valid Daily Task Manager backup."};
}
function importData(file){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const parsed=JSON.parse(String(r.result));
      const res=readBackup(parsed);
      if(!res.ok){toast(res.reason);return;}
      state=res.state;saveState();ensureDay(new Date());renderAll();
      toast("Backup restored.");
    }catch(e){toast("Could not read that file.");}
  };
  r.readAsText(file);
}
function resetApp(){
  confirmBox("Reset the application?",
    "All data in this browser will be erased. Export a backup first if you want to keep anything.",
    [
      {label:"Erase everything",danger:true,fn:()=>{
        try{localStorage.removeItem(LS_KEY);}catch(e){}
        state=defaultState();saveState();renderAll();showSetup();}},
      {label:"Cancel",fn:()=>{}}
    ]);
}

/* ================= sound (optional, page must be open) ================= */
let audioCtx=null;
function playChime(){
  try{
    audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    const now=audioCtx.currentTime;
    [880,1174.7].forEach((f,i)=>{
      const o=audioCtx.createOscillator(),g=audioCtx.createGain();
      o.type="sine";o.frequency.value=f;
      g.gain.setValueAtTime(0.0001,now+i*0.18);
      g.gain.exponentialRampToValueAtTime(0.25,now+i*0.18+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,now+i*0.18+0.6);
      o.connect(g).connect(audioCtx.destination);
      o.start(now+i*0.18);o.stop(now+i*0.18+0.7);
    });
  }catch(e){}
}
function checkOverdue(){
  if(!state.profile.sound||!state.day)return;
  const now=new Date();
  if(personalDayKey(now)!==state.day.key)return;
  const nowMin=now.getHours()*60+now.getMinutes();
  let changed=false;
  for(const t of state.day.tasks){
    if(t.status!=="active"||!t.time||t.alerted)continue;
    let tm=parseHM(t.time);
    /* tasks timed before the reset belong to the small hours of the next calendar day */
    const reset=parseHM(state.profile.dayReset);
    const nowAdj=nowMin<reset?nowMin+1440:nowMin;
    const tAdj=tm<reset?tm+1440:tm;
    if(nowAdj>=tAdj){t.alerted=true;changed=true;playChime();}
  }
  if(changed){saveState();renderToday();}
}

/* ================= DOM helpers ================= */
function el(tag,attrs,...kids){
  const n=document.createElement(tag);
  if(attrs)for(const k in attrs){
    const v=attrs[k];
    if(k==="class")n.className=v;
    else if(k==="text")n.textContent=v;
    else if(k.slice(0,2)==="on")n.addEventListener(k.slice(2),v);
    else if(v!==null&&v!==undefined)n.setAttribute(k,v);
  }
  for(const kid of kids){if(kid===null||kid===undefined)continue;
    n.append(kid.nodeType?kid:document.createTextNode(kid));}
  return n;
}
function clear(n){while(n.firstChild)n.removeChild(n.firstChild);return n;}
function openModal(title,bodyNode){
  const host=document.getElementById("modalHost"),box=host.querySelector(".box");
  clear(box);
  box.append(el("h3",{text:title}),bodyNode);
  host.classList.add("open");
}
function closeModal(){document.getElementById("modalHost").classList.remove("open");}
function confirmBox(title,text,buttons){
  const body=el("div",{});
  if(text)body.append(el("p",{text:text}));
  const row=el("div",{class:"btnrow"});
  buttons.forEach(b=>{
    row.append(el("button",{class:"btn"+(b.primary?" primary":"")+(b.danger?" danger":""),
      onclick:()=>{closeModal();if(b.fn)b.fn();},text:b.label}));
  });
  body.append(row);
  openModal(title,body);
}
let toastTimer=null;
function toast(msg){
  let t=document.getElementById("toast");
  if(!t){t=el("div",{id:"toast",style:"position:fixed;left:50%;bottom:100px;transform:translateX(-50%);"+
    "background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 20px;z-index:60;font-size:16px;"});
    document.body.appendChild(t);}
  t.textContent=msg;t.style.display="block";
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{t.style.display="none";},2600);
}

/* ================= header ================= */
function renderHeader(){
  const k=state.day?state.day.key:personalDayKey(new Date());
  const d=keyToDate(k),dow=d.getDay();
  const isWork=areaOn("work")&&state.profile.workdays.includes(dow);
  document.getElementById("dayTitle").textContent=DAYNAMES[dow]+" "+d.getDate()+" "+MONTHS[d.getMonth()];
  document.getElementById("dayMeta").textContent="Personal day \u00B7 "+(isWork?"Workday":"Free day")+
    (state.day&&personalDayKey(new Date())===k?"":" \u00B7 shown from an earlier session");
  const chips=clear(document.getElementById("dayChips"));
  const g=gymWeek(k);
  chips.append(el("span",{class:"chip"},el("b",{text:String(g.done)})," of 4 gym"));
  const doneCt=state.day?state.day.tasks.filter(t=>t.status==="done").length:0;
  chips.append(el("span",{class:"chip"},el("b",{text:String(doneCt)})," done"));
}

/* ================= Today page ================= */
function renderToday(){
  renderHeader();
  const root=clear(document.getElementById("page-today"));
  if(!state.day)return;
  const now=new Date();
  const isToday=personalDayKey(now)===state.day.key;
  const nowMin=now.getHours()*60+now.getMinutes();
  const active=state.day.tasks.filter(t=>t.status==="active");
  const doneList=state.day.tasks.filter(t=>t.status!=="active");
  const workTasks=active.filter(t=>t.type==="work");
  const rest=active.filter(t=>t.type!=="work");

  if(workTasks.length){
    root.append(el("h2",{class:"sect",text:"Getting to work"}));
    const board=el("div",{class:"card",id:"workBoard"});
    workTasks.forEach(t=>{
      const past=isToday&&nowMin>=parseHM(t.time)&&nowMin<parseHM(state.profile.shiftEnd);
      const row=el("div",{class:"brow"});
      row.append(el("div",{class:"btime mono"+(t.alerted||past?" past":""),text:t.time}));
      const tx=el("div",{class:"btxt"},el("div",{class:"t",text:t.title}));
      if(t.desc)tx.append(el("div",{class:"s",text:t.desc}));
      row.append(tx);
      const cb=el("input",{class:"chk bchk",type:"checkbox",onchange:()=>{completeWithAnimation(t.id,row);}});
      row.append(cb);
      board.append(row);
    });
    root.append(board);
  }
  root.append(el("h2",{class:"sect",text:"Today"}));
  if(!rest.length){
    root.append(el("div",{class:"card note",text:doneList.length?
      "Everything on today's list is handled. The rest of the day is yours.":
      "Nothing on the list yet."}));
  }
  rest.forEach(t=>root.append(taskCard(t)));

  const quick=el("button",{class:"btn quiet",text:"+ Add something for today",onclick:quickAddForm});
  const regen=el("button",{class:"btn quiet",text:"Regenerate today",onclick:()=>{
    confirmBox("Regenerate today's list?","Unfinished tasks are replaced with a fresh list. Completed tasks are kept.",
      [{label:"Regenerate",primary:true,fn:()=>{regenerateToday();renderToday();}},{label:"Cancel",fn:()=>{}}]);
  }});
  root.append(el("div",{style:"margin-top:14px;text-align:center"},quick," ",regen));

  if(doneList.length){
    const dl=el("details",{class:"donebox"});
    dl.append(el("summary",{text:"Completed today ("+doneList.length+")"}));
    doneList.forEach(t=>{
      const item=el("div",{class:"doneitem"});
      item.append(el("span",{class:"lbl",text:t.status==="done"?"done":(t.status==="missed"?"missed":"set aside")}));
      item.append(el("span",{text:t.title}));
      item.append(el("button",{class:"btn quiet undo",text:"Undo",onclick:()=>undoDone(t.id)}));
      dl.append(item);
    });
    root.append(dl);
  }

  /* tomorrow's work times, for an evening glance */
  const p=state.profile;
  const tk=addDays(state.day.key,1);
  if(p.showTomorrow&&areaOn("work")&&p.workdays.includes(dowOf(tk))){
    const wt2=workTimes(p);
    root.append(el("div",{class:"card",style:"margin-top:14px"},
      el("div",{class:"small",text:"Tomorrow \u00B7 "+DAYNAMES[dowOf(tk)]+" \u00B7 workday"}),
      el("div",{class:"note",text:"Out of bed "+wt2.bed+" \u00B7 start getting ready "+wt2.prep+" \u00B7 leave home "+wt2.leave+" (slow traffic "+wt2.leaveSlow+")"})));
  }

  /* one quiet note per day, never required */
  const noteTa=el("textarea",{placeholder:"A quiet note about today (optional)",
    onchange:e=>{state.day.note=String(e.target.value||"").slice(0,2000);saveState();}});
  noteTa.value=state.day.note||"";
  root.append(el("div",{class:"card",style:"margin-top:14px"},
    el("div",{class:"small",text:"Today's note"}),noteTa));

  /* soft backup reminder */
  if(backupReminderDue()){
    const bcard=el("div",{class:"card",style:"margin-top:14px"});
    bcard.append(el("div",{class:"note",text:"It has been a while since your last backup. Your data lives only in this browser \u2014 an export takes a few seconds."}));
    bcard.append(el("div",{class:"btnrow",style:"margin-top:10px"},
      el("button",{class:"btn",text:"Export backup now",onclick:()=>{exportData();renderToday();toast("Backup exported.");}}),
      el("button",{class:"btn quiet",text:"Remind me next week",onclick:()=>{
        state.settings.backupSnooze=addDays(state.day.key,7);saveState();renderToday();}})));
    root.append(bcard);
  }
}
function backupReminderDue(){
  if(!state.profile.setupComplete||!state.day)return false;
  const st=state.settings,today=state.day.key;
  if(st.backupSnooze&&today<st.backupSnooze)return false;
  const ref=st.lastExport||st.firstDay;
  if(!ref)return false;
  const days=Math.round((keyToDate(today)-keyToDate(ref))/86400000);
  return days>=14;
}
/* quick one-off task for today */
function quickAddForm(){
  const body=el("div",{});
  const title=el("input",{type:"text",class:"wide",placeholder:"What needs doing today?"});
  body.append(el("div",{style:"margin-bottom:12px"},title));
  const time=el("input",{type:"time",value:""});
  body.append(el("div",{class:"frow"},el("label",{text:"Time"},el("span",{class:"hint",text:"Optional"})),time));
  body.append(el("div",{class:"btnrow",style:"margin-top:16px"},
    el("button",{class:"btn primary",text:"Add for today",onclick:()=>{
      const t=title.value.trim();
      if(!t){toast("Give the task a short name first.");return;}
      const c={id:uid(),title:t.slice(0,200),freq:"once",days:[],date:null,
        time:validHM(time.value)?time.value:"",min:null,finished:false,notBefore:null};
      if(!state.custom)state.custom=[];
      state.custom.push(c);
      saveState();closeModal();
      maybeAddCustomToday(c);
    }}),
    el("button",{class:"btn quiet",text:"Cancel",onclick:closeModal})));
  openModal("Add something for today",body);
}
function completeWithAnimation(id,node){
  node.style.transition="opacity .3s";node.style.opacity="0.25";
  setTimeout(()=>{markDone(id);renderToday();},280);
}
function taskCard(t){
  const card=el("div",{class:"task"+(t.type==="gym"?" gym":"")});
  const row=el("div",{class:"trow"});
  const cb=el("input",{class:"chk",type:"checkbox","aria-label":"Done: "+t.title,
    onchange:()=>{card.classList.add("leaving");setTimeout(()=>{markDone(t.id);renderToday();},300);}});
  row.append(cb);
  const body=el("div",{class:"tbody",onclick:()=>{
    const a=card.querySelector(".tactions");a.classList.toggle("hidden");}});
  const titleLine=el("div",{class:"ttitle",text:t.title});
  body.append(titleLine);
  const bits=[];
  if(t.time)bits.push(t.time);
  if(t.min)bits.push("about "+t.min+" min");
  if(bits.length)body.append(el("div",{class:"tsub",text:bits.join(" \u00B7 ")}));
  if(t.desc)body.append(el("div",{class:"tsub",text:t.desc}));
  if(t.type==="gym")body.append(el("span",{class:"ttag",text:"Gym \u00B7 required"}));
  if(t.recovery)body.append(el("span",{class:"ttag",text:"Home recovery"}));
  if(t.maintId)body.append(el("span",{class:"ttag",text:"Maintenance"}));
  if(t.seq)body.append(el("span",{class:"ttag",text:"One-time step"}));
  if(t.customId)body.append(el("span",{class:"ttag",text:"My task"}));
  row.append(body);
  card.append(row);

  const acts=el("div",{class:"tactions hidden"});
  if(t.type==="gym"){
    acts.append(el("button",{class:"btn",text:"Mark as missed",onclick:()=>markGymMissed(t.id)}));
    acts.append(el("button",{class:"btn",text:"Move to another day this week",onclick:()=>moveTask(t.id)}));
  }else{
    acts.append(el("button",{class:"btn",text:"I cannot do this today",onclick:()=>skipToday(t.id)}));
    if(t.recovery||t.seq||t.customId||t.maintId)
      acts.append(el("button",{class:"btn",text:"Move to another day",onclick:()=>moveTask(t.id)}));
    const def=RECOVERY_BY_ID[t.tpl];
    if(def&&def.smaller&&t.title===def.title)
      acts.append(el("button",{class:"btn",text:"Make this task smaller",onclick:()=>makeSmaller(t.id)}));
  }
  if(t.recovery)
    acts.append(el("button",{class:"btn",text:"This problem is resolved",onclick:()=>finishRecovery(t.tpl)}));
  if(t.seq)
    acts.append(el("button",{class:"btn",text:"Finish this whole sequence",onclick:()=>finishSequence(t.seq)}));
  if(t.projId)
    acts.append(el("button",{class:"btn",text:"Complete this project",onclick:()=>completeProjectFromTask(t.projId)}));
  if(t.customId){
    const c=findCustom(t.customId);
    if(c&&!customIsOneTime(c))
      acts.append(el("button",{class:"btn",text:"I no longer need this task",onclick:()=>{
        confirmBox("Stop this task?","\u201C"+c.title+"\u201D will stop appearing. You can restore it from the Profile page.",
          [{label:"Stop this task",primary:true,fn:()=>{
              c.finished=true;
              const inst=findTask(t.id);if(inst&&inst.status==="active")inst.status="skipped";
              saveState();renderToday();toast("Task stopped. Restore it any time in Profile.");}},
           {label:"Cancel",fn:()=>{}}]);}}));
  }
  card.append(acts);
  return card;
}

/* ================= Alarms page ================= */
/* Every scheduled time in one place. In Version 2 (the wall device) these
   become real audible alarms; here they set the times shown on tasks. */
function renderAlarms(){
  const root=clear(document.getElementById("page-alarms"));
  const p=state.profile;
  root.append(el("h2",{class:"sect",text:"Alarms"}));
  root.append(el("div",{class:"card"},
    el("p",{class:"note",text:"Every scheduled time, in one place. On the future wall device these become real audible alarms. In this version they set the times shown on tasks, with an optional chime while the page is open."})));

  root.append(el("h2",{class:"sect",text:"Waking and sleeping"}));
  const ws=el("div",{class:"card"});
  ws.append(timeField("Wake up","wakeTime"));
  ws.append(timeField("Go to sleep","sleepTime"));
  root.append(ws);

  root.append(el("h2",{class:"sect",text:"Getting to work"}));
  const wk=el("div",{class:"card"});
  const wt=workTimes(p);
  [["Out of bed",wt.bed],["Start getting ready",wt.prep],["Leave home",wt.leave],["Leave in slow traffic",wt.leaveSlow]].forEach(([lab,tm])=>{
    wk.append(el("div",{class:"frow"},el("label",{text:lab}),el("span",{class:"mono",text:tm})));
  });
  wk.append(el("p",{class:"small",text:"Calculated from your shift and commute \u2014 change them under Profile \u2192 Fixed schedule."}));
  root.append(wk);

  root.append(el("h2",{class:"sect",text:"Timed routines"}));
  const tr=el("div",{class:"card"});
  const gymHint=p.gymDays.slice().sort((a,b)=>((a+6)%7)-((b+6)%7)).map(d=>DAYSHORT[d]).join(", ");
  const gInp=el("input",{type:"time",value:validHM(p.gymTime)?p.gymTime:"",
    onchange:e=>{p.gymTime=validHM(e.target.value)?e.target.value:"";saveState();syncCustomToday();}});
  tr.append(el("div",{class:"frow"},el("label",{text:"Gym"},el("span",{class:"hint",text:gymHint+" \u00B7 leave empty for no set time"})),gInp));
  const grInp=el("input",{type:"time",value:validHM(p.groceriesTime)?p.groceriesTime:"22:00",
    onchange:e=>{if(validHM(e.target.value)){p.groceriesTime=e.target.value;saveState();syncCustomToday();}}});
  tr.append(el("div",{class:"frow"},el("label",{text:"Grocery shopping"},el("span",{class:"hint",text:"Sundays"})),grInp));
  root.append(tr);

  root.append(el("h2",{class:"sect",text:"My timed tasks"}));
  const mt=el("div",{class:"card"});
  const timed=(state.custom||[]).filter(c=>!c.finished);
  if(!timed.length)mt.append(el("p",{class:"note",text:"None yet."}));
  timed.forEach(c=>{
    const tInp=el("input",{type:"time",value:validHM(c.time)?c.time:"",
      onchange:e=>{c.time=validHM(e.target.value)?e.target.value:"";saveState();syncCustomToday();}});
    mt.append(el("div",{class:"frow"},
      el("label",{text:c.title},el("span",{class:"hint",text:customFreqLabel(c)})),
      el("span",{},tInp," ",
        el("button",{class:"btn quiet",text:"Edit",onclick:()=>customForm(c)}))));
  });
  mt.append(el("div",{class:"btnrow",style:"margin-top:14px"},
    el("button",{class:"btn primary",text:"Add a task with a time",onclick:()=>customForm(null)})));
  root.append(mt);
}
/* Keep today's task instances in step with time edits made on the Alarms page. */
function syncCustomToday(){
  if(!state.day)return;
  const p=state.profile;
  state.day.tasks.forEach(t=>{
    if(t.status!=="active")return;
    if(t.customId){const c=findCustom(t.customId);if(c)t.time=validHM(c.time)?c.time:null;}
    if(t.tpl==="gym")t.time=validHM(p.gymTime)?p.gymTime:null;
    if(t.tpl==="groceries")t.time=validHM(p.groceriesTime)?p.groceriesTime:null;
  });
  saveState();renderToday();
}

/* ================= Profile page ================= */
function numField(label,key,hint){
  const inp=el("input",{type:"number",min:"0",max:"600",value:String(state.profile[key]),
    onchange:e=>{state.profile[key]=clampInt(e.target.value,0,600,state.profile[key]);saveState();renderHeader();}});
  const lab=el("label",{text:label});
  if(hint)lab.append(el("span",{class:"hint",text:hint}));
  return el("div",{class:"frow"},lab,inp);
}
function timeField(label,key){
  const inp=el("input",{type:"time",value:state.profile[key],
    onchange:e=>{if(validHM(e.target.value)){state.profile[key]=e.target.value;saveState();renderHeader();}}});
  return el("div",{class:"frow"},el("label",{text:label}),inp);
}
function daysPicker(selected,onchange,exact){
  const wrap=el("div",{class:"dayspick"});
  for(let d=1;d<=7;d++){
    const dow=d%7; /* Mon..Sun */
    const b=el("button",{class:"dbtn"+(selected.includes(dow)?" on":""),text:DAYSHORT[dow],onclick:()=>{
      const i=selected.indexOf(dow);
      if(i>=0)selected.splice(i,1);else selected.push(dow);
      b.classList.toggle("on");
      onchange(selected);
    }});
    wrap.append(b);
  }
  return wrap;
}
function switchRow(label,checked,onchange,hint){
  const inp=el("input",{type:"checkbox"});inp.checked=checked;
  inp.addEventListener("change",()=>onchange(inp.checked));
  const sw=el("label",{class:"switch"},inp,el("span",{class:"sl"}));
  const lab=el("label",{text:label});
  if(hint)lab.append(el("span",{class:"hint",text:hint}));
  return el("div",{class:"frow"},lab,sw);
}
function renderProfile(){
  const root=clear(document.getElementById("page-profile"));
  const p=state.profile;

  root.append(el("h2",{class:"sect",text:"Fixed schedule"}));
  const wt=workTimes(p);
  const sched=el("div",{class:"card"});
  sched.append(el("div",{class:"frow"},el("label",{text:"Time zone"}),
    el("span",{class:"note",text:deviceTimeZone()+" \u00B7 from this device"})));
  sched.append(el("div",{style:"padding:12px 0;border-bottom:1px solid var(--line)"},
    el("label",{text:"Workdays",style:"display:block;margin-bottom:8px"}),
    daysPicker(p.workdays,()=>{saveState();renderHeader();})));
  sched.append(timeField("Shift starts","shiftStart"));
  sched.append(timeField("Shift ends","shiftEnd"));
  sched.append(numField("Normal commute (min)","commuteNormal"));
  sched.append(numField("Slow-traffic commute (min)","commuteSlow"));
  sched.append(numField("Parking and walking (min)","parkingWalk"));
  sched.append(numField("Preparation time (min)","prepDuration"));
  sched.append(numField("Arrival margin (min)","arrivalMargin","Extra buffer before the shift starts"));
  sched.append(timeField("Personal day resets at","dayReset"));
  sched.append(timeField("Usual sleep time","sleepTime"));
  sched.append(timeField("Usual waking time","wakeTime"));
  sched.append(el("div",{class:"frow"},el("label",{text:"Calculated for workdays"}),
    el("span",{class:"note mono",text:"bed "+wt.bed+" \u00B7 prep "+wt.prep+" \u00B7 leave "+wt.leave})));
  sched.append(el("p",{class:"small",text:"Schedule and planning changes apply to newly generated lists. Use ‘Regenerate today’ on the Today page to apply them to the current day."}));
  root.append(sched);

  root.append(el("h2",{class:"sect",text:"Life areas"}));
  const areasCard=el("div",{class:"card"});
  for(const k in state.areas){
    const a=state.areas[k];
    const sel=el("select",{onchange:e=>{a.prio=e.target.value;saveState();}});
    ["normal","important","urgent"].forEach(v=>{
      const o=el("option",{value:v,text:v[0].toUpperCase()+v.slice(1)});
      if(a.prio===v)o.selected=true;sel.append(o);});
    const inp=el("input",{type:"checkbox"});inp.checked=a.on;
    inp.addEventListener("change",()=>{a.on=inp.checked;saveState();});
    const sw=el("label",{class:"switch"},inp,el("span",{class:"sl"}));
    areasCard.append(el("div",{class:"frow"},el("label",{text:a.label}),sel,sw));
  }
  root.append(areasCard);

  root.append(el("h2",{class:"sect",text:"Gym"}));
  const gymCard=el("div",{class:"card"});
  gymCard.append(el("p",{class:"note",text:"Four sessions per week are required. Pick your four preferred days."}));
  const gymHint=el("div",{class:"small",style:"margin-top:8px"});
  const setHint=()=>{const n=p.gymDays.length;
    gymHint.textContent=n===4?"Four days selected.":(n+" selected \u2014 the target is four days.");};
  gymCard.append(daysPicker(p.gymDays,()=>{saveState();setHint();}));
  gymCard.append(gymHint);setHint();
  gymCard.append(timeField("Preferred gym time","gymTime"));
  gymCard.append(numField("Session length (min)","gymDuration"));
  root.append(gymCard);

  root.append(el("h2",{class:"sect",text:"Posture routine"}));
  const post=el("div",{class:"card"});
  post.append(el("p",{class:"note",text:"Enter a routine from a physiotherapist or other qualified professional. The app shows it as a short daily task but does not prescribe exercises."}));
  const ta=el("textarea",{placeholder:"e.g. the routine your physiotherapist gave you"});
  ta.value=p.postureRoutine;
  ta.addEventListener("change",()=>{p.postureRoutine=ta.value.slice(0,600);saveState();});
  post.append(ta);
  root.append(post);

  root.append(el("h2",{class:"sect",text:"Daily task amount"}));
  const load=el("div",{class:"card"});
  const seg=el("div",{class:"seg"});
  [["light","Very light \u00B7 4"],["normal","Normal \u00B7 6"],["active","More active \u00B7 8"]].forEach(([v,lab])=>{
    seg.append(el("button",{class:p.taskLoad===v?"on":"",text:lab,onclick:e=>{
      p.taskLoad=v;saveState();renderProfile();}}));
  });
  load.append(seg);
  load.append(el("p",{class:"small",text:"Timed work tasks can appear in addition to this limit."}));
  root.append(load);

  root.append(el("h2",{class:"sect",text:"My own tasks"}));
  root.append(customManager());

  root.append(el("h2",{class:"sect",text:"Recovery and maintenance"}));
  root.append(recoveryManager());

  root.append(el("h2",{class:"sect",text:"Appearance and sound"}));
  const app2=el("div",{class:"card"});
  app2.append(switchRow("Light theme",p.theme==="light",v=>{p.theme=v?"light":"dark";applyTheme();saveState();}));
  app2.append(switchRow("Show tomorrow's work times in the evening",p.showTomorrow!==false,v=>{p.showTomorrow=v;saveState();},
    "A small line at the bottom of Today when tomorrow is a workday"));
  app2.append(switchRow("Sound when a timed task comes due",p.sound,v=>{p.sound=v;saveState();},
    "Only works while this page is open and active"));
  app2.append(el("div",{class:"btnrow"},el("button",{class:"btn",text:"Test sound",onclick:playChime})));
  root.append(app2);

  root.append(el("h2",{class:"sect",text:"Backup"}));
  const bk=el("div",{class:"card"});
  bk.append(el("p",{class:"note",text:"Everything is stored in this browser on this device. If Safari's website data is cleared, the data is lost \u2014 export a backup now and then."}));
  const file=el("input",{type:"file",accept:"application/json",style:"display:none",
    onchange:e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value="";}});
  bk.append(file);
  bk.append(el("div",{class:"btnrow"},
    el("button",{class:"btn primary",text:"Export backup",onclick:exportData}),
    el("button",{class:"btn",text:"Import backup",onclick:()=>file.click()}),
    el("button",{class:"btn danger",text:"Reset application",onclick:resetApp})));
  root.append(bk);

  const off=(typeof navigator!=="undefined"&&navigator.serviceWorker&&navigator.serviceWorker.controller)
    ? "installed \u00B7 works offline" : "not installed for offline use";
  root.append(el("p",{class:"small",style:"text-align:center;margin-top:26px",
    text:"Daily Task Manager \u00B7 version "+APP_VERSION+" \u00B7 "+off}));
}
function customFreqLabel(c){
  if(c.freq==="daily")return "Every day";
  if(c.freq==="once")return "One time";
  if(c.freq==="date")return "On "+c.date;
  const ds=(c.days||[]).slice().sort((a,b)=>((a+6)%7)-((b+6)%7)).map(d=>DAYSHORT[d]);
  return ds.length?ds.join(", "):"No days chosen yet";
}
function customManager(){
  const card=el("div",{class:"card"});
  card.append(el("p",{class:"note",text:"Your own tasks appear on Today just like any other task. They can be daily, on chosen weekdays, or one-time."}));
  const active=(state.custom||[]).filter(c=>!c.finished);
  if(!active.length)card.append(el("p",{class:"note",text:"None yet."}));
  active.forEach(c=>{
    const bits=[customFreqLabel(c)];
    if(c.time)bits.push(c.time);
    if(c.min)bits.push("about "+c.min+" min");
    card.append(el("div",{class:"frow"},
      el("label",{text:c.title},el("span",{class:"hint",text:bits.join(" \u00B7 ")})),
      el("span",{},
        el("button",{class:"btn quiet",text:"Edit",onclick:()=>customForm(c)}),
        el("button",{class:"btn quiet",text:"Delete",onclick:()=>{
          confirmBox("Delete this task?","\u201C"+c.title+"\u201D will be removed completely.",
            [{label:"Delete",danger:true,fn:()=>{
                state.custom=state.custom.filter(x=>x.id!==c.id);
                if(state.day)state.day.tasks=state.day.tasks.filter(t=>!(t.customId===c.id&&t.status==="active"));
                saveState();renderProfile();renderToday();}},
             {label:"Cancel",fn:()=>{}}]);}}))));
  });
  const stopped=(state.custom||[]).filter(c=>c.finished);
  if(stopped.length){
    card.append(el("div",{class:"small",style:"margin-top:18px",text:"Stopped tasks"}));
    stopped.forEach(c=>{
      card.append(el("div",{class:"frow"},
        el("label",{text:c.title},el("span",{class:"hint",text:customFreqLabel(c)})),
        el("span",{},
          el("button",{class:"btn quiet",text:"Restore",onclick:()=>{
            c.finished=false;saveState();renderProfile();maybeAddCustomToday(c);}}),
          el("button",{class:"btn quiet",text:"Delete",onclick:()=>{
            state.custom=state.custom.filter(x=>x.id!==c.id);saveState();renderProfile();}}))));
    });
  }
  card.append(el("div",{class:"btnrow",style:"margin-top:14px"},
    el("button",{class:"btn primary",text:"Add a task",onclick:()=>customForm(null)})));
  return card;
}
/* Put a newly added task on today's list right away if it belongs there. */
function maybeAddCustomToday(c){
  if(!state.day||!customDueOn(c,state.day.key))return;
  if(state.day.tasks.some(t=>t.customId===c.id&&t.status==="active"))return;
  const inst=customInstance(c);
  const pmIdx=state.day.tasks.findIndex(t=>t.tpl==="brush_pm"&&t.status==="active");
  if(pmIdx>=0)state.day.tasks.splice(pmIdx,0,inst);else state.day.tasks.push(inst);
  saveState();renderToday();
}
function customForm(existing){
  const c=existing||{id:uid(),title:"",freq:"daily",days:[],date:null,time:"",min:null,finished:false,notBefore:null};
  const body=el("div",{});
  const title=el("input",{type:"text",class:"wide",value:c.title,placeholder:"What should the task say?"});
  body.append(el("div",{style:"margin-bottom:12px"},title));
  const fSel=el("select",{});
  [["daily","Every day"],["weekly","Certain weekdays"],["once","One time"],["date","On a specific date"]].forEach(([v,lab])=>{
    const o=el("option",{value:v,text:lab});if(c.freq===v)o.selected=true;fSel.append(o);});
  /* Edit a copy of the weekday list; commit it on Save so Cancel changes nothing. */
  const daysDraft=(c.days||[]).slice();
  const daysWrap=el("div",{style:"margin:12px 0"+(c.freq==="weekly"?"":";display:none")},
    daysPicker(daysDraft,()=>{}));
  const dateInp=el("input",{type:"date",value:c.date||""});
  const dateWrap=el("div",{class:"frow",style:c.freq==="date"?"":"display:none"},
    el("label",{text:"Which date"}),dateInp);
  fSel.addEventListener("change",()=>{
    daysWrap.style.display=fSel.value==="weekly"?"":"none";
    dateWrap.style.display=fSel.value==="date"?"":"none";});
  body.append(el("div",{class:"frow"},el("label",{text:"How often"}),fSel));
  body.append(daysWrap);
  body.append(dateWrap);
  const time=el("input",{type:"time",value:validHM(c.time)?c.time:""});
  body.append(el("div",{class:"frow"},el("label",{text:"Time",},el("span",{class:"hint",text:"Optional"})),time));
  const mins=el("input",{type:"number",min:"1",max:"600",value:c.min?String(c.min):""});
  body.append(el("div",{class:"frow"},el("label",{text:"Minutes"},el("span",{class:"hint",text:"Optional \u00B7 rough estimate"})),mins));
  body.append(el("div",{class:"btnrow",style:"margin-top:16px"},
    el("button",{class:"btn primary",text:existing?"Save changes":"Add task",onclick:()=>{
      const t=title.value.trim();
      if(!t){toast("Give the task a short name first.");return;}
      if(fSel.value==="weekly"&&!daysDraft.length){toast("Choose at least one weekday.");return;}
      c.title=t.slice(0,200);
      c.freq=fSel.value;
      c.days=daysDraft.slice();
      if(c.freq==="date"){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(dateInp.value)){toast("Pick a date first.");return;}
        c.date=dateInp.value;
      }else c.date=null;
      c.time=validHM(time.value)?time.value:"";
      c.min=mins.value?clampInt(mins.value,1,600,null):null;
      if(!existing){if(!state.custom)state.custom=[];state.custom.push(c);}
      /* keep today's copy in sync with edits */
      if(state.day)state.day.tasks.forEach(x=>{
        if(x.customId===c.id&&x.status==="active"){
          x.title=c.title;x.min=c.min;x.time=validHM(c.time)?c.time:null;}});
      saveState();closeModal();renderProfile();renderAlarms();
      maybeAddCustomToday(c);
      if(!existing)toast("Added. It will appear on its matching days.");
    }}),
    el("button",{class:"btn quiet",text:"Cancel",onclick:closeModal})));
  openModal(existing?"Edit task":"Add your own task",body);
}
function recoveryManager(){
  const card=el("div",{class:"card"});
  card.append(el("div",{class:"small",text:"Active recovery tasks"}));
  const activeIds=RECOVERY.filter(t=>state.templates[t.id].status==="active");
  if(!activeIds.length)card.append(el("p",{class:"note",text:"None."}));
  activeIds.forEach(def=>{
    const ts=state.templates[def.id];
    card.append(el("div",{class:"frow"},
      el("label",{text:def.title},el("span",{class:"hint",text:"Completed "+ts.count+" times"})),
      el("button",{class:"btn quiet",text:"Disable",onclick:()=>{ts.status="disabled";saveState();renderProfile();}})));
  });
  card.append(el("div",{class:"small",style:"margin-top:18px",text:"Resolved recovery goals"}));
  if(!state.resolved.length)card.append(el("p",{class:"note",text:"None yet."}));
  state.resolved.forEach(r=>{
    card.append(el("div",{class:"frow"},
      el("label",{text:r.title},el("span",{class:"hint",text:"Resolved "+r.date})),
      el("button",{class:"btn quiet",text:"Restore",onclick:()=>restoreRecovery(r.id)})));
  });
  card.append(el("div",{class:"small",style:"margin-top:18px",text:"Maintenance routines"}));
  const mids=Object.keys(state.maintenance);
  if(!mids.length)card.append(el("p",{class:"note",text:"None yet. They appear when a recovery task is finished with maintenance."}));
  mids.forEach(id=>{
    const m=state.maintenance[id];
    const row=el("div",{style:"padding:12px 0;border-bottom:1px solid var(--line)"});
    const title=el("input",{type:"text",class:"wide",value:m.title,
      onchange:e=>{m.title=e.target.value.slice(0,200);saveState();}});
    row.append(title);
    const nInp=el("input",{type:"number",min:"1",max:"24",value:String(m.n),
      onchange:e=>{m.n=clampInt(e.target.value,1,24,m.n);saveState();}});
    const uSel=el("select",{onchange:e=>{m.unit=e.target.value;saveState();}});
    [["day","day(s)"],["week","week(s)"],["month","month(s)"]].forEach(([v,lab])=>{
      const o=el("option",{value:v,text:lab});if(m.unit===v)o.selected=true;uSel.append(o);});
    const dSel=el("select",{onchange:e=>{m.dow=e.target.value===""?null:Number(e.target.value);saveState();}});
    dSel.append(el("option",{value:"",text:"Any day"}));
    for(let d=0;d<7;d++){const o=el("option",{value:String(d),text:"On "+DAYNAMES[d]+"s"});
      if(m.dow===d)o.selected=true;dSel.append(o);}
    row.append(el("div",{class:"btnrow",style:"align-items:center"},"Every ",nInp,uSel,dSel,
      el("button",{class:"btn quiet",text:"Delete",onclick:()=>{
        confirmBox("Delete this maintenance routine?","\u201C"+m.title+"\u201D will stop appearing.",
          [{label:"Delete",danger:true,fn:()=>{delete state.maintenance[id];saveState();renderProfile();}},
           {label:"Cancel",fn:()=>{}}]);}})));
    row.append(el("div",{class:"small",text:"Next due: "+(m.nextDue||"\u2014")}));
    card.append(row);
  });
  card.append(el("div",{class:"small",style:"margin-top:18px",text:"Disabled task templates"}));
  const disabled=RECOVERY.filter(t=>state.templates[t.id].status==="disabled");
  if(!disabled.length)card.append(el("p",{class:"note",text:"None."}));
  disabled.forEach(def=>{
    card.append(el("div",{class:"frow"},el("label",{text:def.title}),
      el("button",{class:"btn quiet",text:"Enable",onclick:()=>{
        state.templates[def.id].status="active";saveState();renderProfile();}})));
  });
  card.append(el("div",{class:"small",style:"margin-top:18px",text:"One-time sequences"}));
  for(const sid in SEQUENCES){
    const st=state.sequences[sid],def=SEQUENCES[sid];
    const status=st.finished?"Finished":("Step "+Math.min(st.step+1,def.steps.length)+" of "+def.steps.length);
    card.append(el("div",{class:"frow"},
      el("label",{text:def.label},el("span",{class:"hint",text:status})),
      st.finished?el("button",{class:"btn quiet",text:"Restore",onclick:()=>{
        st.finished=false;st.step=Math.min(st.step,def.steps.length-1);saveState();renderProfile();}}):
      el("button",{class:"btn quiet",text:"Finish",onclick:()=>finishSequence(sid)})));
  }
  return card;
}

/* ================= Projects page ================= */
function renderProjects(){
  const root=clear(document.getElementById("page-projects"));
  root.append(el("h2",{class:"sect",text:"Creative projects"}));
  root.append(el("p",{class:"note",style:"margin:0 2px 12px",
    text:"One project is Primary and gets daily task suggestions. One may be Secondary. The rest wait quietly."}));
  const order={Primary:0,Secondary:1,Paused:2,Stored:3,Completed:4};
  const list=state.projects.slice().sort((a,b)=>(order[a.status]-order[b.status])||a.name.localeCompare(b.name));
  list.forEach(pr=>{
    const card=el("div",{class:"card proj"});
    card.append(el("div",{class:"pstat"+(pr.status==="Primary"?" primary":""),text:pr.status+(pr.type?" \u00B7 "+pr.type:"")}));
    card.append(el("div",{class:"pname",text:pr.name}));
    if(pr.next)card.append(el("div",{class:"pnext",text:"Next: "+pr.next}));
    if(pr.notes)card.append(el("div",{class:"small",text:pr.notes}));
    const row=el("div",{class:"btnrow"});
    if(pr.status!=="Primary"&&pr.status!=="Completed")
      row.append(el("button",{class:"btn",text:"Make Primary",onclick:()=>{setPrimary(pr.id);}}));
    if(pr.status!=="Completed"){
      if(pr.status!=="Secondary"&&pr.status!=="Primary")
        row.append(el("button",{class:"btn quiet",text:"Make Secondary",onclick:()=>{setSecondary(pr.id);}}));
      if(pr.status!=="Paused")
        row.append(el("button",{class:"btn quiet",text:"Pause",onclick:()=>{pr.status="Paused";saveState();renderProjects();}}));
      row.append(el("button",{class:"btn quiet",text:"Complete",onclick:()=>{
        confirmBox("Complete \u201C"+pr.name+"\u201D?","It stops generating tasks and moves to Completed. You can reactivate it later.",
          [{label:"Complete project",primary:true,fn:()=>{pr.status="Completed";saveState();renderProjects();}},
           {label:"Cancel",fn:()=>{}}]);}}));
    }else{
      row.append(el("button",{class:"btn",text:"Reactivate",onclick:()=>{pr.status="Stored";saveState();renderProjects();}}));
    }
    row.append(el("button",{class:"btn quiet",text:"Edit",onclick:()=>projectForm(pr)}));
    row.append(el("button",{class:"btn quiet danger",text:"Delete",onclick:()=>{
      confirmBox("Delete \u201C"+pr.name+"\u201D?","This cannot be undone.",
        [{label:"Delete",danger:true,fn:()=>{state.projects=state.projects.filter(x=>x.id!==pr.id);saveState();renderProjects();}},
         {label:"Cancel",fn:()=>{}}]);}}));
    card.append(row);
    root.append(card);
  });
  root.append(el("button",{class:"btn primary wide",text:"Add project",onclick:()=>projectForm(null)}));
}
function setPrimary(id){
  state.projects.forEach(p=>{if(p.status==="Primary")p.status="Secondary";});
  state.projects.forEach(p=>{if(p.status==="Secondary"&&p.id!==id){/* keep one secondary max */}});
  const secondaries=state.projects.filter(p=>p.status==="Secondary"&&p.id!==id);
  secondaries.slice(1).forEach(p=>p.status="Stored");
  const pr=state.projects.find(p=>p.id===id);
  if(pr)pr.status="Primary";
  saveState();renderProjects();
}
function setSecondary(id){
  state.projects.forEach(p=>{if(p.status==="Secondary")p.status="Stored";});
  const pr=state.projects.find(p=>p.id===id);
  if(pr)pr.status="Secondary";
  saveState();renderProjects();
}
function projectForm(pr){
  const isNew=!pr;
  const data=pr||{id:uid(),name:"",type:"",status:"Stored",next:"",notes:""};
  const body=el("div",{});
  const name=el("input",{type:"text",class:"wide",placeholder:"Project name",value:data.name});
  const type=el("input",{type:"text",class:"wide",placeholder:"Type (e.g. Electronics, Music)",value:data.type,style:"margin-top:10px"});
  const next=el("input",{type:"text",class:"wide",placeholder:"One next action",value:data.next,style:"margin-top:10px"});
  const notes=el("textarea",{placeholder:"Notes (optional)",style:"margin-top:10px"});notes.value=data.notes;
  body.append(name,type,next,notes);
  body.append(el("div",{class:"btnrow"},
    el("button",{class:"btn primary",text:isNew?"Add project":"Save",onclick:()=>{
      if(!name.value.trim()){toast("Give the project a name.");return;}
      data.name=name.value.trim().slice(0,120);
      data.type=type.value.trim().slice(0,80);
      data.next=next.value.trim().slice(0,300);
      data.notes=notes.value.slice(0,2000);
      if(isNew)state.projects.push(data);
      saveState();closeModal();renderProjects();}}),
    el("button",{class:"btn quiet",text:"Cancel",onclick:closeModal})));
  openModal(isNew?"Add project":"Edit project",body);
}

/* ================= first-run setup ================= */
function showSetup(){
  const p=state.profile;
  const body=el("div",{});
  body.append(el("p",{text:"Check these values once. The app plans each day from them. Everything can be changed later in Profile."}));
  function row(label,node){return el("div",{class:"frow"},el("label",{text:label}),node);}
  function num(key){return el("input",{type:"number",min:"0",max:"600",value:String(p[key]),
    onchange:e=>{p[key]=clampInt(e.target.value,0,600,p[key]);}});}
  function tim(key){return el("input",{type:"time",value:p[key],
    onchange:e=>{if(validHM(e.target.value))p[key]=e.target.value;}});}
  body.append(el("h2",{class:"sect",text:"Work"}));
  body.append(row("Shift starts",tim("shiftStart")));
  body.append(row("Shift ends",tim("shiftEnd")));
  body.append(row("Normal commute (min)",num("commuteNormal")));
  body.append(row("Slow-traffic commute (min)",num("commuteSlow")));
  body.append(row("Parking and walking (min)",num("parkingWalk")));
  body.append(row("Preparation time (min)",num("prepDuration")));
  body.append(row("Arrival margin (min)",num("arrivalMargin")));
  body.append(el("h2",{class:"sect",text:"Day and sleep"}));
  body.append(row("Personal day resets at",tim("dayReset")));
  body.append(row("Usual sleep time",tim("sleepTime")));
  body.append(row("Usual waking time",tim("wakeTime")));
  body.append(el("h2",{class:"sect",text:"Gym \u2014 pick exactly four days"}));
  body.append(daysPicker(p.gymDays,()=>{}));
  body.append(el("h2",{class:"sect",text:"How much per day?"}));
  const seg=el("div",{class:"seg"});
  [["light","Very light \u00B7 4"],["normal","Normal \u00B7 6"],["active","More active \u00B7 8"]].forEach(([v,lab])=>{
    const b=el("button",{class:p.taskLoad===v?"on":"",text:lab,onclick:()=>{
      p.taskLoad=v;seg.querySelectorAll("button").forEach(x=>x.classList.remove("on"));b.classList.add("on");}});
    seg.append(b);
  });
  body.append(seg);
  body.append(el("div",{class:"btnrow"},
    el("button",{class:"btn primary wide",text:"Start using Daily Task Manager",onclick:()=>{
      if(p.gymDays.length!==4){toast("Pick exactly four gym days ("+p.gymDays.length+" selected).");return;}
      p.setupComplete=true;state.day=null;saveState();closeModal();
      ensureDay(new Date());renderAll();}})));
  openModal("Welcome",body);
}

/* ================= tabs, theme, boot ================= */
function applyTheme(){document.documentElement.setAttribute("data-theme",state.profile.theme);}
function renderAll(){renderToday();renderAlarms();renderProfile();renderProjects();}
function showPage(name){
  document.querySelectorAll(".page").forEach(pg=>pg.classList.add("hidden"));
  document.getElementById("page-"+name).classList.remove("hidden");
  document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("on",b.dataset.page===name));
  if(name==="today")renderToday();
  if(name==="alarms")renderAlarms();
  if(name==="profile")renderProfile();
  if(name==="projects")renderProjects();
  window.scrollTo(0,0);
}
/* ================= progressive web app ================= */
/* The service worker only handles installation, offline start-up and updates.
   All application state stays in localStorage, untouched by any of this. */
function registerServiceWorker(){
  if(typeof navigator==="undefined"||!("serviceWorker" in navigator))return;
  if(typeof location==="undefined")return;
  if(location.protocol!=="http:"&&location.protocol!=="https:")return; /* file:// cannot host a worker */
  navigator.serviceWorker.addEventListener("message",ev=>{
    if(ev.data&&ev.data.type==="updated")showUpdateBar();
  });
  navigator.serviceWorker.register("sw.js").then(reg=>{
    /* A wall device may stay open for weeks; look for updates now and then. */
    setInterval(()=>{reg.update().catch(()=>{});},6*60*60*1000);
  }).catch(()=>{});
}
function showUpdateBar(){
  if(document.getElementById("updateBar"))return;
  const bar=el("div",{id:"updateBar",class:"updatebar"},
    el("span",{text:"A new version is ready."}),
    el("button",{class:"btn primary",text:"Reload",onclick:()=>location.reload()}),
    el("button",{class:"btn quiet",text:"Later",onclick:()=>{const b=document.getElementById("updateBar");if(b)b.remove();}}));
  document.body.appendChild(bar);
}
/* Home-screen shortcuts land on ./#alarms and similar. */
function pageFromHash(){
  if(typeof location==="undefined")return null;
  const h=(location.hash||"").replace("#","");
  return ["today","alarms","profile","projects"].includes(h)?h:null;
}

function boot(){
  state=loadState();
  if(!state.settings.firstDay){state.settings.firstDay=personalDayKey(new Date());saveState();}
  const hadFlag=state.settings.seededRoutines;
  if(ensureSeedRoutines()){
    saveState();
    if(state.day)state.custom.forEach(c=>{if(c.id.slice(0,5)==="seed_")maybeAddCustomToday(c);});
  }else if(!hadFlag)saveState();
  applyTheme();
  ensureDay(new Date());
  renderAll();
  document.querySelectorAll("#tabs button").forEach(b=>{
    b.addEventListener("click",()=>showPage(b.dataset.page));});
  document.querySelector("#modalHost .veil").addEventListener("click",closeModal);
  if(!state.profile.setupComplete)showSetup();
  const start=pageFromHash();
  if(start&&start!=="today"&&state.profile.setupComplete)showPage(start);
  if(typeof window!=="undefined"&&window.addEventListener)
    window.addEventListener("hashchange",()=>{const p=pageFromHash();if(p)showPage(p);});
  registerServiceWorker();
  setInterval(()=>{
    if(ensureDay(new Date()))renderAll();
    checkOverdue();
  },30000);
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden&&ensureDay(new Date()))renderAll();
  });
}
if(typeof document!=="undefined"&&typeof window!=="undefined"){
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
}
if(typeof module!=="undefined"&&module.exports){
  module.exports={_test:{defaultState:defaultState,setState:s=>{state=s;},getState:()=>state,
    generateDay,personalDayKey,workTimes,ensureDay,weekKeyOf,isGymDay,addRecur,maintDueOn,
    validateState,applyFinish,restoreRecovery,gymWeek,customDueOn,markDone,findTask,backupReminderDue,ensureSeedRoutines,pageFromHash,readBackup,makeBackup,
    renderToday:typeof renderToday==="function"?renderToday:null}};
}
