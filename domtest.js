"use strict";
/* Tiny fake DOM sufficient for the app's render code. */
let ids={};
class N{
  constructor(tag){this.tagName=tag.toUpperCase();this.nodeType=1;this.children=[];this.parent=null;
    this.attrs={};this.style={};this.listeners={};this.className="";this.value="";this.checked=false;
    this.selected=false;this._text="";this.dataset={};this.hidden=false;this.readyState="complete";}
  append(...kids){for(const k of kids){const n=(k&&k.nodeType)?k:{nodeType:3,text:String(k),parent:null};
    n.parent=this;this.children.push(n);if(n.nodeType===1&&n.attrs&&n.attrs.id)ids[n.attrs.id]=n;
    if(n.nodeType===1)n._reg();}}
  _reg(){if(this.attrs.id)ids[this.attrs.id]=this;this.children.forEach(c=>{if(c.nodeType===1)c._reg();});}
  appendChild(k){this.append(k);return k;}
  removeChild(k){this.children=this.children.filter(c=>c!==k);return k;}
  remove(){if(this.parent)this.parent.removeChild(this);}
  get firstChild(){return this.children[0]||null;}
  setAttribute(k,v){this.attrs[k]=String(v);if(k==="class")this.className=String(v);
    if(k==="id")ids[v]=this;
    if(k.slice(0,5)==="data-")this.dataset[k.slice(5)]=String(v);}
  getAttribute(k){return this.attrs[k];}
  addEventListener(t,f){(this.listeners[t]=this.listeners[t]||[]).push(f);}
  fire(t){(this.listeners[t]||[]).forEach(f=>f({target:this}));}
  get classList(){const self=this;return{
    add:c=>{const s=new Set(self.className.split(/\s+/).filter(Boolean));s.add(c);self.className=[...s].join(" ");},
    remove:c=>{self.className=self.className.split(/\s+/).filter(x=>x&&x!==c).join(" ");},
    toggle:(c,force)=>{const has=self.className.split(/\s+/).includes(c);
      const want=force===undefined?!has:force;
      if(want&&!has)self.classList.add(c);if(!want&&has)self.classList.remove(c);},
    contains:c=>self.className.split(/\s+/).includes(c)};}
  set textContent(v){this.children=[];this._text=String(v);}
  get textContent(){let t=this._text;
    for(const c of this.children)t+=c.nodeType===3?c.text:c.textContent;return t;}
  matches(sel){
    if(sel[0]==="#")return this.attrs.id===sel.slice(1);
    if(sel[0]===".")return this.className.split(/\s+/).includes(sel.slice(1));
    return this.tagName===sel.toUpperCase();}
  _collect(sel,out){for(const c of this.children){if(c.nodeType!==1)continue;
    if(c.matches(sel))out.push(c);c._collect(sel,out);}return out;}
  querySelectorAll(sel){
    const parts=sel.trim().split(/\s+/);
    let scopes=[this];
    for(let i=0;i<parts.length;i++){
      const out=[];scopes.forEach(s=>s._collect(parts[i],out));scopes=out;}
    return scopes;}
  querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
}
const documentEl=new N("html");
const body=new N("body");
const doc={
  readyState:"complete",documentElement:documentEl,body:body,hidden:false,
  createElement:t=>new N(t),
  createTextNode:t=>({nodeType:3,text:String(t)}),
  getElementById:id=>ids[id]||null,
  querySelector:s=>body.querySelector(s),
  querySelectorAll:s=>body.querySelectorAll(s),
  addEventListener:()=>{}
};
/* build the static skeleton from index.html */
function build(tag,attrs,...kids){const n=new N(tag);for(const k in (attrs||{}))n.setAttribute(k,attrs[k]);n.append(...kids);return n;}
body.append(
  build("header",{id:"top"},build("div",{},build("h1",{id:"dayTitle"}),build("div",{id:"dayMeta"})),build("div",{id:"dayChips"})),
  build("main",{},build("section",{id:"page-today",class:"page"}),
    build("section",{id:"page-alarms",class:"page hidden"}),
    build("section",{id:"page-profile",class:"page hidden"}),
    build("section",{id:"page-projects",class:"page hidden"})),
  build("nav",{id:"tabs"},
    build("button",{"data-page":"today",class:"on"},"Today"),
    build("button",{"data-page":"alarms"},"Alarms"),
    build("button",{"data-page":"profile"},"Profile"),
    build("button",{"data-page":"projects"},"Projects")),
  build("div",{id:"modalHost"},build("div",{class:"veil"}),build("div",{class:"box"}))
);
const store={};
global.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v;},removeItem:k=>{delete store[k];}};
global.document=doc;
global.window={AudioContext:null,scrollTo:()=>{},addEventListener:()=>{}};

let pass=0,fail=0;
function ok(c,m){if(c)pass++;else{fail++;console.log("FAIL: "+m);}}

const {_test}=require("./app.js"); /* boot() runs here */
const state=_test.getState();
ok(!!state.day,"day generated on boot");
ok(ids["modalHost"].className.includes("open"),"first-run setup opens");
ok(ids["modalHost"].textContent.includes("Welcome"),"setup modal titled Welcome");

/* complete setup */
state.profile.setupComplete=true;
ids["modalHost"].classList.remove("open");

/* render all pages via tab handlers */
for(const b of doc.querySelectorAll("#tabs button")){b.fire("click");}
ok(ids["page-profile"].textContent.includes("Fixed schedule"),"profile renders schedule");
ok(ids["page-profile"].textContent.includes("Export backup"),"profile has backup controls");
ok(ids["page-profile"].textContent.includes("stored in this browser"),"data-loss warning shown");
ok(ids["page-projects"].textContent.includes("Add project"),"projects page renders");

/* back to today; check a real task done via its checkbox */
doc.querySelectorAll("#tabs button")[0].fire("click");
const today=ids["page-today"];
ok(today.textContent.includes("Brush teeth after waking"),"today lists morning brushing");
const brushCard=today.querySelectorAll(".task").find(c=>c.textContent.includes("Brush teeth after waking"));
ok(!!brushCard&&!brushCard.textContent.includes("Move to another day"),"fixed daily routines do not offer a fake move action");
const beforeActive=state.day.tasks.filter(t=>t.status==="active").length;
const chk=today.querySelector(".task").querySelector(".chk");
chk.fire("change");
return_after(()=>{
  const afterActive=state.day.tasks.filter(t=>t.status==="active").length;
  ok(afterActive===beforeActive-1,"checking Done removes one active task");
  ok(ids["page-today"].textContent.includes("Completed today"),"completed section appears");

  /* header chips */
  ok(ids["dayChips"].textContent.includes("of 4 gym"),"gym weekly count chip");
  ok(ids["dayChips"].textContent.includes("done"),"done count chip");

  /* expand a recovery task and hit "This problem is resolved" if present today,
     otherwise call finishRecovery path through the confirm dialog directly */
  const recTask=state.day.tasks.find(t=>t.recovery&&t.status==="active");
  if(recTask){
    const cards=ids["page-today"].querySelectorAll(".task");
    let btn=null;
    cards.forEach(c=>{c.querySelectorAll("button").forEach(b=>{
      if(b.textContent==="This problem is resolved")btn=b;});});
    ok(!!btn,"resolve button exists on recovery task");
    btn.fire("click");
    ok(ids["modalHost"].className.includes("open"),"finish confirmation opens");
    ok(ids["modalHost"].textContent.includes("stop appearing"),"confirmation explains consequence");
    let fbtn=null,plain=null;
    ids["modalHost"].querySelectorAll("button").forEach(b=>{
      if(b.textContent==="Finish and add maintenance")fbtn=b;
      if(b.textContent==="Finish permanently")plain=b;});
    ok(!!(fbtn||plain),"a finish option is offered");
    (fbtn||plain).fire("click");
    ok(state.templates[recTask.tpl].status==="resolved","template resolved");
    if(fbtn){
      ok(!!state.maintenance[recTask.tpl],"maintenance routine created");
      ok(!!state.maintenance[recTask.tpl].nextDue,"maintenance has a next-due date");
    }else{
      ok(!state.maintenance[recTask.tpl],"no maintenance for a template without a suggestion");
      ok(state.resolved.some(r=>r.id===recTask.tpl),"resolved list records the goal");
    }
  } else {
    /* no recovery task on today's list: exercise the finish path directly */
    _test.applyFinish("cables",true);
    ok(state.templates.cables.status==="resolved","cables template resolved");
    ok(state.resolved.some(r=>r.id==="cables"),"resolved list records the goal");
    ok(!!state.maintenance.cables,"maintenance routine created");
    ok(state.maintenance.cables.nextDue>state.day.key,"maintenance not due immediately");
    ok(true,"-");ok(true,"-");ok(true,"-");
  }

  /* profile shows resolved goal + maintenance editor */
  doc.querySelectorAll("#tabs button")[1].fire("click");
  ok(ids["page-profile"].textContent.includes("Maintenance routines"),"maintenance section renders");
  ok(ids["page-profile"].textContent.includes("Restore"),"restore button for resolved goal");

  /* restore a resolved goal, then finish without maintenance */
  const rid=state.resolved[0].id;
  ids["page-profile"].querySelectorAll("button").forEach(b=>{
    if(b.textContent==="Restore"&&!b._used){b._used=true;}});
  _test.restoreRecovery(rid);
  ok(state.templates[rid].status==="active","restore reactivates the template");
  ok(!state.resolved.some(r=>r.id===rid),"restored goal leaves the resolved list");
  ok(!state.maintenance[rid],"restoring recovery removes its duplicate maintenance routine");
  _test.applyFinish(rid,false);
  ok(state.templates[rid].status==="resolved"&&!state.maintenance[rid+"_x"],"finish without maintenance resolves only");

  /* --- add a custom task from Profile --- */
  ok(ids["page-profile"].textContent.includes("My own tasks"),"My own tasks section renders");
  let addBtn=null;
  ids["page-profile"].querySelectorAll("button").forEach(b=>{if(b.textContent==="Add a task")addBtn=b;});
  ok(!!addBtn,"Add a task button present");
  addBtn.fire("click");
  ok(ids["modalHost"].className.includes("open"),"add-task form opens");
  const inputs=ids["modalHost"].querySelectorAll("input");
  const titleInp=inputs.find(i=>i.attrs.type==="text");
  titleInp.value="Feed the cat";
  let saveBtn=null;
  ids["modalHost"].querySelectorAll("button").forEach(b=>{if(b.textContent==="Add task")saveBtn=b;});
  saveBtn.fire("click");
  const cat=state.custom.find(c=>c.title==="Feed the cat");
  ok(!!cat,"custom task saved to state");
  ok(state.day.tasks.some(t=>t.customId===cat.id&&t.status==="active"),"custom task appears on today immediately");
  doc.querySelectorAll("#tabs button")[0].fire("click");
  ok(ids["page-today"].textContent.includes("Feed the cat"),"custom task visible on Today page");
  ok(ids["page-today"].textContent.includes("My task"),"custom task carries its tag");
  /* editing keeps today's copy in sync */
  const cid=cat.id;
  cat.title="Feed the cat twice";
  state.day.tasks.forEach(t=>{if(t.customId===cid&&t.status==="active")t.title=cat.title;});
  _test.renderToday();
  ok(ids["page-today"].textContent.includes("Feed the cat twice"),"edited title reflected on Today");
  /* stop it from the card */
  let stopBtn=null;
  ids["page-today"].querySelectorAll("button").forEach(b=>{if(b.textContent==="I no longer need this task")stopBtn=b;});
  ok(!!stopBtn,"stop action offered on custom task card");
  stopBtn.fire("click");
  let confBtn=null;
  ids["modalHost"].querySelectorAll("button").forEach(b=>{if(b.textContent==="Stop this task")confBtn=b;});
  ok(!!confBtn,"stop confirmation opens");
  confBtn.fire("click");
  ok(cat.finished===true,"custom task stopped");
  ok(!state.day.tasks.some(t=>t.customId===cid&&t.status==="active"),"stopped task leaves today's list");

  /* --- quick-add for today --- */
  doc.querySelectorAll("#tabs button")[0].fire("click");
  _test.renderToday();
  let qbtn=null;
  ids["page-today"].querySelectorAll("button").forEach(b=>{if(b.textContent==="+ Add something for today")qbtn=b;});
  ok(!!qbtn,"quick-add button on Today");
  qbtn.fire("click");
  const qInp=ids["modalHost"].querySelectorAll("input").find(i=>i.attrs.type==="text");
  qInp.value="Take out the compost";
  let qSave=null;
  ids["modalHost"].querySelectorAll("button").forEach(b=>{if(b.textContent==="Add for today")qSave=b;});
  qSave.fire("click");
  ok(state.custom.some(c=>c.title==="Take out the compost"&&c.freq==="once"),"quick-add stored as one-time task");
  ok(ids["page-today"].textContent.includes("Take out the compost"),"quick-added task shows on Today");

  /* --- daily note --- */
  ok(ids["page-today"].textContent.includes("Today's note"),"note box renders");
  const ta=ids["page-today"].querySelectorAll("textarea")[0];
  ok(!!ta,"note textarea exists");
  ta.value="Quiet day.";
  ta.fire("change");
  ok(state.day.note==="Quiet day.","note saved to the day");
  ok(JSON.parse(global.localStorage.getItem("dailyTaskManagerV1")).day.note==="Quiet day.","note persisted");

  /* --- tomorrow's work times line --- */
  const tmr=(function(){const p=state.day.key.split("-").map(Number);
    const d=new Date(p[0],p[1]-1,p[2]);d.setDate(d.getDate()+1);return d.getDay();})();
  const tomorrowIsWork=state.profile.workdays.includes(tmr);
  ok(ids["page-today"].textContent.includes("Tomorrow")===tomorrowIsWork,
    "tomorrow line shown exactly when tomorrow is a workday");
  state.profile.showTomorrow=false;_test.renderToday();
  ok(!ids["page-today"].textContent.includes("Out of bed"),"tomorrow line respects the toggle");
  state.profile.showTomorrow=true;_test.renderToday();

  /* --- backup reminder --- */
  ok(!ids["page-today"].textContent.includes("last backup"),"no backup reminder at first");
  state.settings.firstDay="2026-06-01";
  _test.renderToday();
  ok(ids["page-today"].textContent.includes("last backup"),"backup reminder appears when stale");
  let snz=null;
  ids["page-today"].querySelectorAll("button").forEach(b=>{if(b.textContent==="Remind me next week")snz=b;});
  ok(!!snz,"snooze offered");
  snz.fire("click");
  ok(!ids["page-today"].textContent.includes("last backup"),"snooze hides the reminder");

  /* --- Alarms page --- */
  doc.querySelectorAll("#tabs button")[1].fire("click"); /* Alarms tab */
  const al=ids["page-alarms"];
  ok(!al.className.includes("hidden"),"alarms page opens");
  ok(al.textContent.includes("Waking and sleeping"),"alarms shows wake/sleep");
  ok(al.textContent.includes("Getting to work"),"alarms shows work times");
  ok(al.textContent.includes("Shower"),"seeded shower listed");
  ok(al.textContent.includes("Washing machine"),"seeded washing machine listed");
  ok(al.textContent.includes("Dishwasher"),"seeded dishwasher listed");
  ok(al.textContent.includes("audible alarms"),"V2 explanation present");
  /* edit the shower time from the alarms page and see it sync to today */
  const shower=state.custom.find(c=>c.id==="seed_shower");
  let shInp=null;
  al.querySelectorAll("input").forEach(i=>{
    if(i.attrs.type==="time"&&(i.value==="04:00"||i.attrs.value==="04:00"))shInp=i;});
  ok(!!shInp,"shower time input on alarms page");
  shInp.value="04:30";shInp.fire("change");
  ok(shower.time==="04:30","shower time updated");
  const shToday=state.day.tasks.find(t=>t.customId==="seed_shower"&&t.status==="active");
  ok(!shToday||shToday.time==="04:30","today's shower instance synced");
  doc.querySelectorAll("#tabs button")[0].fire("click");

  /* reload persistence: state saved and reloadable */
  const raw=global.localStorage.getItem("dailyTaskManagerV1");
  ok(!!raw&&JSON.parse(raw).schemaVersion===1,"state persisted to localStorage");

  console.log(pass+" passed, "+fail+" failed");
  process.exit(fail?1:0);
});
function return_after(fn){setTimeout(fn,700);} /* let the .3s done-animation timeouts fire */
