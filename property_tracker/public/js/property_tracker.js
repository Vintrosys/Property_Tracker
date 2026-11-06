const getTheme=()=>{try{return localStorage.getItem("theme")||"auto"}catch(e){return "auto"}};const thm=getTheme();if(thm!=="auto")document.documentElement.setAttribute("data-theme",thm);
const ST=["New","Visited","Shortlisted","Follow-up","Negotiating","Revisit Required","Document Verification","Final Discussion","Purchased","Rejected","On Hold"];
const SC={New:[210,10],Visited:[210,60],Shortlisted:[45,90],"Follow-up":[280,50],Negotiating:[25,85],"Revisit Required":[330,60],"Document Verification":[190,70],"Final Discussion":[260,50],Purchased:[145,60],Rejected:[0,70],"On Hold":[0,0]};
const SI={New:"○",Visited:"●",Shortlisted:"★",Purchased:"✔",Rejected:"✖",Negotiating:"₹","On Hold":"⏸"};
const col=s=>{const c=SC[s]||[0,0];return `hsl(${c[0]} ${c[1]}% 38%)`};
const pill=s=>`<span class="pill" style="--c:${col(s)}">${SI[s]||"•"} ${s}</span>`;
const U={"Sq.ft":1,Cent:435.6,Acre:43560,Ground:2400,"Sq.m":10.764};
let db={props:[],rem:[]},view="home",flt="",q="",mq="",cmp=[],sync="Loading…",busy=0;
// ---- Frappe API -------------------------------------------------------------
async function api(m,args={},quiet){busy++;loadBar();
 try{let r;try{r=await fetch("/api/method/property_tracker.api."+m,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Accept:"application/json","X-Frappe-CSRF-Token":window.csrf_token||""},body:JSON.stringify(args)})}catch(e){throw offlineErr()}
  if([0,502,503,504].includes(r.status))throw offlineErr();
  if(typeof isOffline!="undefined"&&isOffline){isOffline=false;setTimeout(()=>{netBanner();flush()},0)}
  const j=await r.json().catch(()=>({}));if(r.status==401||(r.status==403&&(j.exc_type=="CSRFTokenError"||/(^|; )user_id=Guest/.test(document.cookie)))){location.reload();return new Promise(()=>{})}if(!r.ok)throw new Error(serverErr(r.status,j)||r.statusText||"Request failed");return j.message}
 catch(e){if(e.offline){if(!isOffline){isOffline=true;netBanner()}}if(!quiet)toast(e.message||"Request failed");throw e}finally{busy--;loadBar()}}
// Readable message; a bare Python error right after an update almost always means the site wasn't migrated.
function serverErr(status,j){const m=errMsg(j);if(j&&j._server_messages)return m;
 if(status>=500||(status==404&&/DoesNotExist/.test(j&&j.exc_type||"")))return `Server error${j&&j.exc_type?` (${j.exc_type})`:""}. If the app was just updated, run "bench --site <site> migrate" on the server.`;return m}
function errMsg(j){try{return JSON.parse(j._server_messages).map(m=>JSON.parse(m).message).join("\n").replace(/<[^>]+>/g,"")}catch(e){return j.exc_type||""}}
function loadBar(){const e=document.getElementById("ld");if(e)e.className=busy?"loading":""}
function toast(t){const e=document.getElementById("toast");e.textContent=t;e.hidden=false;clearTimeout(window.tt);window.tt=setTimeout(()=>e.hidden=true,4000)}
function put(p){const i=db.props.findIndex(x=>x.id==p.id);if(i<0)db.props.push(p);else db.props[i]=p;return p}
let restored=false;
async function load(fromFlush){if(!restored){restored=true;const at=await restoreLocal();if(at){sync="Saved copy";if(!st().s)render()}/* show the copy on the phone at once, then refresh */netBanner()}
 if(!fromFlush&&outbox.length&&!isOffline){await flush();if(outbox.length)return finishLoad()}
 try{const d=await api("get_data",{},true);db={props:d.props,rem:d.rem};prof=d.me||prof;team=d.team||team;sync="Synced at "+new Date().toLocaleTimeString([],{timeStyle:"short"});await saveLocal()}
 catch(e){const s=await store.get(ukey("snap"));sync=e.offline?(s?`Offline · saved copy from ${new Date(s.at).toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}`:"Offline"):"Could not reach server";if(!e.offline)toast(e.message)}
 finishLoad()}
function finishLoad(){
 const s=st().s;if(!s)render();else if(s.t=="d")redraw();
 if(startHash!==null){const h=startHash;startHash=null;route(h)}
 netBanner();refreshAlerts();if(!window._wnChecked&&sync.startsWith("Synced")){window._wnChecked=1;setTimeout(maybeWhatsNew,400)}}
// ---- offline: keep a copy of the data on the phone and queue changes until online ----------
// Snapshot of the last data + an outbox of pending writes, both in IndexedDB (per user).
const store=(()=>{let dbp=null;const open=()=>dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open("property-tracker",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
 const run=(mode,fn)=>open().then(d=>new Promise((res,rej)=>{const t=d.transaction("kv",mode),q=fn(t.objectStore("kv"));t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error)}));
 return {get:k=>run("readonly",s=>s.get(k)).catch(()=>undefined),set:(k,v)=>run("readwrite",s=>s.put(v,k)).catch(()=>{})}})();
const ukey=k=>`${k}:${window.pt_user||"me"}`;
let outbox=[],failedOps=[],syncing=false,isOffline=!navigator.onLine;
const OFFLINE_OK=new Set(["save_property","log_visit","set_status","update_deal","add_price","add_reminder","set_reminder_done"]);
const tmpId=()=>"L"+Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase();
const isTmp=id=>typeof id=="string"&&/^L[0-9A-Z]{6,}$/.test(id);
async function saveLocal(){await store.set(ukey("snap"),{props:db.props,rem:db.rem,me:prof,team,at:Date.now()});await store.set(ukey("outbox"),outbox);await store.set(ukey("failed"),failedOps)}
async function restoreLocal(){const s=await store.get(ukey("snap"));outbox=(await store.get(ukey("outbox")))||[];failedOps=(await store.get(ukey("failed")))||[];
 if(s){db={props:s.props||[],rem:s.rem||[]};prof=s.me||prof;team=s.team||team;return s.at}return 0}
function netBanner(){const e=$("net");if(!e)return;const n=outbox.length,f=failedOps.length;
 e.className="net"+(isOffline?" off":syncing?" sync":f?" err":"");e.hidden=!(isOffline||n||f);
 e.innerHTML=isOffline?`${ic("info",15)} Offline${n?` · ${n} change${n>1?"s":""} saved on this phone`:" · showing saved data"}`:syncing?`${ic("refresh",15)} Uploading ${n} change${n>1?"s":""}…`:f?`${ic("info",15)} ${f} change${f>1?"s":""} couldn't upload <button class="linkchip" onclick="nav('more')">Review</button>`:n?`${ic("upload",15)} ${n} change${n>1?"s":""} waiting to upload`:""}
// Apply a change to the local copy right away (so the app works offline). Returns the updated property.
function applyLocal(m,a){const P2=id=>db.props.find(p=>p.id==id),now=new Date().toISOString();
 if(m=="save_property"){const d={...a.data};let p=a.name?P2(a.name):null;const num=k=>d[k]!==undefined&&d[k]!==""&&d[k]!=null?+d[k]:"";
  if(!p){p={id:a._tmp,_local:true,status:d.status||"Visited",created:now,by:prof.user,visits:[],history:[{at:now,from:"",to:d.status||"Visited",note:"Created"}],prices:[],docs:[],photos:[],boundary:null,barea:""};db.props.push(p)}
  for(const k of Object.keys(d))if(k!="photos"&&k!="status")p[k]=["lat","lng","area","len","wid","road","price","neg","acc"].includes(k)?num(k):d[k];
  if(d.photos)p.photos=d.photos.map(x=>({d:x.d,at:x.at,c:x.c||""}));
  if(!+p.area&&p.len&&p.wid)p.area=Math.round(p.len*p.wid/(U[p.unit]||1)*100)/100;
  if(p.price&&!p.prices.some(x=>x.kind=="Asking"&&x.amount==Math.round(total(p))))p.prices.push({at:now,kind:"Asking",amount:Math.round(total(p)),note:"Asking price",by:prof.user});
  p._pending=true;return p}
 if(m=="log_visit"){const p=P2(a.name);p.visits.push({at:now,note:a.note});p._pending=true;return p}
 if(m=="set_status"){const p=P2(a.name);p.history.push({at:now,from:p.status,to:a.status,note:a.note||""});p.status=a.status;p._pending=true;return p}
 if(m=="update_deal"){const p=P2(a.name);if(a.rating!==undefined)p.rating=a.rating;p._pending=true;return p}
 if(m=="add_price"){const p=P2(a.name);p.prices.push({at:now,kind:a.kind,amount:+a.amount,note:a.note||"",by:prof.user});if(a.kind=="Negotiated"||a.kind=="Final")p.neg=+a.amount;p._pending=true;return p}
 if(m=="add_reminder"){const r={k:a._tmp,t:a.reminder,due:a.due_on,p:a.property||"",done:false,_local:true};db.rem.push(r);return r}
 if(m=="set_reminder_done"){const r=db.rem.find(x=>x.k==a.name);r.done=!!+a.done;return r}}
// Write through the server when online; otherwise (or if earlier changes are still queued) save locally and queue.
async function write(m,args){if(!outbox.length&&!isOffline){try{return await api(m,args)}catch(e){if(!e.offline)throw e}}
 if(!OFFLINE_OK.has(m))throw offlineErr();
 const a={...args};if((m=="save_property"&&!a.name)||m=="add_reminder")a._tmp=tmpId();
 // editing something that is itself still waiting to upload: fold the change into the queued create
 const pend=m=="save_property"&&a.name&&outbox.find(o=>o.m=="save_property"&&o.a._tmp==a.name);
 if(pend)pend.a.data={...pend.a.data,...a.data};else outbox.push({m,a,t:Date.now()});
 const r=applyLocal(m,a);await saveLocal();netBanner();toast(isOffline?"Saved on this phone. It will upload when you're online.":"Saved. Uploading…");if(!isOffline)setTimeout(flush,300);return r}
const offlineErr=()=>Object.assign(new Error("You're offline. This needs a connection."),{offline:true});
async function flush(){if(syncing||!outbox.length||isOffline)return;syncing=true;netBanner();const ids={};let done=0;
 const fix=a=>{for(const k of["name","property"])if(a[k]&&ids[a[k]])a[k]=ids[a[k]];return a};
 try{while(outbox.length){const op=outbox[0],a=fix({...op.a});const tmp=a._tmp;delete a._tmp;
   try{const r=await api(op.m,a,true);if(tmp)ids[tmp]=op.m=="add_reminder"?r.k:r.id;done++}
   catch(e){if(e.offline){isOffline=true;break}failedOps.push({...op,err:e.message,at:Date.now()});toast(`Couldn't upload a change: ${e.message}`)}
   outbox.shift();await saveLocal()}}
 finally{syncing=false}
 if(!outbox.length&&done){const cur=st().s;await load(true);if(cur&&ids[cur.id]){setState({...st(),s:{...cur,id:ids[cur.id]}},true);redraw()}toast(`${done} change${done>1?"s":""} uploaded`)}
 netBanner()}
window.addEventListener("online",()=>{isOffline=false;netBanner();flush().then(()=>{if(!outbox.length)load(true)})});
window.addEventListener("offline",()=>{isOffline=true;netBanner()});
setInterval(()=>{if(outbox.length&&!isOffline)flush()},30000);
function failedCard(){if(!failedOps.length)return "";return `<h2>Changes that couldn't upload</h2><section class="card">${failedOps.map((f,i)=>`<div class="rem"><div style="flex:1;min-width:0"><div class="t">${esc(f.m.replace(/_/g," "))}${f.a.name?` · ${esc(f.a.name)}`:""}</div><div class="mut">${esc(f.err)}</div></div><button class="btn sm" onclick="retryFailed(${i})">Retry</button><button class="iconbtn sm" onclick="dropFailed(${i})" aria-label="Discard">${ic("trash",15)}</button></div>`).join("")}</section>`}
async function retryFailed(i){const f=failedOps.splice(i,1)[0];outbox.push({m:f.m,a:f.a,t:Date.now()});await saveLocal();render();flush()}
async function dropFailed(i){if(!confirm("Discard this change?"))return;failedOps.splice(i,1);await saveLocal();render();netBanner()}

document.addEventListener("visibilitychange",()=>{if(!document.hidden&&!document.getElementById("sh").innerHTML)load()});
const $=id=>document.getElementById(id),P=id=>db.props.find(p=>p.id==id);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const inr=n=>n?"₹"+Math.round(n).toLocaleString("en-IN"):"—";
const sqft=p=>p.area?p.area*(U[p.unit]||1):(p.len&&p.wid?p.len*p.wid:0);
const total=p=>{if(!p.price)return 0;if(p.punit=="Total")return +p.price;const f={"Per Cent":435.6,"Per Sq.ft":1,"Per Acre":43560,"Per Ground":2400}[p.punit];return p.price*sqft(p)/f};
const psf=p=>sqft(p)&&total(p)?total(p)/sqft(p):0,pc=p=>psf(p)*435.6;
const gm=p=>`https://www.google.com/maps?q=${p.lat},${p.lng}`;
const now=()=>new Date().toISOString();const dt=s=>s?new Date(s).toLocaleString([],{dateStyle:"medium",timeStyle:"short"}):"—";
const same=(s,d)=>s&&new Date(s).toDateString()==d.toDateString();
// ---- UI helpers ------------------------------------------------------------------
const I={video:"M23 7l-7 5 7 5zM1 5h15v14H1z",check:"M20 6L9 17l-5-5",home:"M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",list:"M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
 map:"M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",bell:"M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
 user:"M20 21a8 8 0 1 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",plus:"M12 5v14M5 12h14",search:"M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
 pin:"M12 22s7-7.6 7-13a7 7 0 1 0-14 0c0 5.4 7 13 7 13zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",go:"M3 11l19-9-9 19-2-8-8-2z",
 phone:"M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
 chat:"M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z",share:"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
 copy:"M9 9h11v11H9zM5 15H4V4h11v1",edit:"M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",trash:"M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
 back:"M15 18l-6-6 6-6",gps:"M12 2v3M12 19v3M2 12h3M19 12h3M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
 camera:"M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
 compare:"M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7",refresh:"M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",download:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
 upload:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",logout:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
 ext:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",sun:"M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
 moon:"M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",monitor:"M2 3h20v14H2zM8 21h8M12 17v4",image:"M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
 ruler:"M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2",rupee:"M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10",note:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8",
 info:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",gear:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"};
const ic=(n,s=20)=>`<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${I[n]}"/></svg>`;
const TYPES=["Vacant Land","Agricultural Land","Residential Land","House","Apartment","Commercial Property","Industrial Property","Farm Property","Other"];
const FACES=["North","South","East","West","North East","North West","South East","South West"];
const PUNITS=["Total","Per Cent","Per Sq.ft","Per Acre","Per Ground"];
const fmt=n=>(+n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
const dims=p=>p.len&&p.wid?`${fmt(p.len)} × ${fmt(p.wid)} ft`:"";
const areaTxt=p=>p.area?`${fmt(p.area)} ${p.unit}`:"";
const thumb=(p,s=84)=>p.photos&&p.photos[0]?`<img class="thumb" src="${esc(p.photos[0].d)}" alt="" loading="lazy">`:`<div class="thumb">${ic("image",28)}</div>`;
const opts=(arr,v)=>arr.map(t=>`<option ${v==t?"selected":""}>${t}</option>`).join("");
let prof={};
// a usable location: both numbers, in range, and not the "0, 0" placeholder
const hasLoc=p=>{if(!p||p.lat===""||p.lat==null||p.lng===""||p.lng==null)return false;const a=+p.lat,b=+p.lng;return isFinite(a)&&isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180&&!(a==0&&b==0)};
let myPos=null; // last known position of this device {lat,lng,acc,at}
const kmTxt=k=>k<1?`${Math.round(k*1000)} m`:`${k<10?k.toFixed(1):Math.round(k)} km`;
const distTo=p=>myPos&&hasLoc(p)?hav(myPos.lat,myPos.lng,+p.lat,+p.lng):null;
const setMy=g=>{myPos={lat:g.coords.latitude,lng:g.coords.longitude,acc:g.coords.accuracy,at:Date.now()}};
const initials=()=>{const n=(prof.full_name||prof.email||"?").trim().split(/\s+/);return esc(((n[0]||"?")[0]+(n.length>1?n[n.length-1][0]:"")).toUpperCase())};
const avatar=(s=36)=>prof.image?`<img class="av" src="${esc(prof.image)}" width="${s}" height="${s}" alt="" style="width:${s}px;height:${s}px">`:`<span class="av" style="width:${s}px;height:${s}px;font-size:${Math.round(s*.4)}px">${initials()}</span>`;
const dueCount=()=>db.rem.filter(r=>!r.done&&new Date(r.due)<=new Date(Date.now()+864e5)).length;
const head=(t,sub="")=>`<header class="top"><div><h1>${t}</h1>${sub?`<p>${sub}</p>`:""}</div><button class="avbtn" onclick="nav('more')" aria-label="Account">${avatar(36)}</button></header>`;
const sheetHead=(t,sub="",right="")=>`<div class="shead"><button class="iconbtn" onclick="closeS()" aria-label="Back">${ic("back")}</button><div><h1>${t}</h1>${sub?`<div class="mut ell">${sub}</div>`:""}</div>${right}</div>`;
const greet=()=>{const h=new Date().getHours();return h<12?"Good morning":h<17?"Good afternoon":"Good evening"};
// ---- navigation: every screen is a history entry, so phone/browser Back works ----
// state = {v: tab, f: status filter, s: open sheet {t:"d"|"e"|"a"|"c", id}, d: depth from Home}
let startHash=location.hash;
const st=()=>history.state||{v:"home",d:0};
function urlFor(s){const x=s.s;if(x)return x.t=="w"?"#whats-new":x.t=="v"?`#p/${x.id}/photos`:x.t=="b"?`#p/${x.id}/boundary`:x.t=="d"?`#p/${x.id}`:x.t=="e"?`#p/${x.id}/edit`:x.t=="a"?"#add":"#compare";return s.v=="home"?location.pathname:`#${s.v}`}
function setState(s,replace){history[replace?"replaceState":"pushState"](s,"",urlFor(s))}
// ---- location ------------------------------------------------------------------
// Phones answer first with a rough network fix, then GPS improves it. Keep watching and
// keep the most accurate reading until it is good enough (goal metres) or time runs out.
let gpsWatch=null,gpsTimer=null,gpsTok=null; // gpsTok identifies the active request; callbacks from stopped ones are ignored
// Inside the Android app, use the phone's native GPS (Capacitor Geolocation plugin). It works even when
// the Frappe site is opened over http:// on the local network, where browsers block location.
const nativeGeo=()=>{try{const C=window.Capacitor;return C&&C.isNativePlatform&&C.isNativePlatform()&&C.Plugins&&C.Plugins.Geolocation||null}catch(e){return null}};
function stopGps(){if(gpsWatch!=null){const w=gpsWatch,N=nativeGeo();if(typeof w=="string"){N&&N.clearWatch({id:w}).catch(()=>{})}else if(w&&w.then){/* cleared when its id arrives */}else navigator.geolocation.clearWatch(w)}clearTimeout(gpsTimer);gpsWatch=gpsTimer=gpsTok=null}
function gpsError(e){
 if(!nativeGeo()&&!window.isSecureContext)return "Location is blocked because this site is opened over http://"+(location.hostname?" ("+location.hostname+")":"")+". Use https://, open it at http://localhost on this computer, the Property Tracker Android app, or allow this address in Chrome (see README).";
 if(!navigator.geolocation)return "This browser does not support location.";
 if(e&&e.code==1)return "Location permission is off. Allow Location for this site (or the Property Tracker app) in your phone settings, then try again.";
 if(e&&e.code==2)return "Location unavailable. Turn on Location (GPS) on your phone and try again.";
 return "Could not get a GPS fix. Move to open sky and try again.";
}
function locate({onFix,onDone,onFail,goal=20,wait=30000}){
 stopGps();const N=nativeGeo();
 if(!N&&(!window.isSecureContext||!navigator.geolocation))return onFail(gpsError());
 let best=null,lastErr={code:3};const tok=gpsTok={};
 const finish=()=>{stopGps();best?onDone(best):onFail(gpsError(lastErr))};
 const onPos=r=>{if(gpsTok!==tok||!r||!r.coords)return;
   if(!best||r.coords.accuracy<best.coords.accuracy){best=r;onFix&&onFix(r)}
   if(r.coords.accuracy<=goal)finish()};
 const onErr=e=>{if(gpsTok!==tok)return;lastErr=e;if(e.code==1&&!best){stopGps();onFail(gpsError(e))}}; // other errors are often transient: keep waiting, the timer decides
 if(N){ // native plugin reports errors as text
   const nErr=err=>{const m=String(err&&(err.message||err)||"");onErr({code:/denied|permission/i.test(m)?1:/not enabled|disabled|services/i.test(m)?2:3})};
   const pr=Promise.resolve(N.watchPosition({enableHighAccuracy:true,maximumAge:0,timeout:wait},(r,err)=>{if(err)nErr(err);else onPos(r)}));
   gpsWatch=pr;
   pr.then(id=>{if(gpsTok===tok)gpsWatch=id;else N.clearWatch({id}).catch(()=>{})}).catch(nErr);
 }else gpsWatch=navigator.geolocation.watchPosition(onPos,onErr,{enableHighAccuracy:true,maximumAge:0,timeout:wait});
 gpsTimer=setTimeout(finish,wait);
}
const accTxt=a=>a>1000?`±${(a/1000).toFixed(1)} km`:`±${Math.round(a)} m`;
// GPS capture for the add/edit form. Phones often answer first (or only) with an approximate
// position from mobile towers / Wi-Fi; keep waiting for real GPS and say clearly how good the fix is.
const GOOD=30,OK=200; // metres
const isAndroid=()=>/Android/i.test(navigator.userAgent);
function preciseHelp(){return LN()||nativeGeo()?`Android is giving the app only an approximate location. Open <b>Settings → Apps → Property Tracker → Permissions → Location</b> and turn on <b>Use precise location</b>. Also check <b>Settings → Location → Location services → Google Location Accuracy</b> is on.`
 :isAndroid()?`Android is giving Chrome only an approximate location. Open <b>Settings → Apps → Chrome → Permissions → Location</b> and turn on <b>Use precise location</b>. Also check <b>Settings → Location → Location services → Google Location Accuracy</b> is on.`
 :`This device is estimating its position from the network (computers usually have no GPS). Capture the location on your phone at the site, or place the pin on the map.`}
function gps(){const g=$("gps");if(!g)return;let lastFix=null;const t0=Date.now();
 const quality=a=>a<=GOOD?"good":a<=OK?"weak":"bad";
 const put=(r,final)=>{const la=$("lat"),ln=$("lng"),st=$("gps");if(!la||!st)return stopGps();const c=r.coords,a=c.accuracy,q=quality(a);
  la.value=c.latitude.toFixed(6);ln.value=c.longitude.toFixed(6);draft.acc=Math.round(a*10)/10;draft.lsrc="GPS";pickTo(c.latitude,c.longitude,false,a);if(a<=1000)setMy(r);
  lastFix=r;const stuck=q=="bad"&&a>=1000&&(final||Date.now()-t0>15000); // still only an approximate position after 15 s
  st.className=`gps ${q}`;
  st.innerHTML=(final?(q=="good"?`${ic("check",16)} <b>GPS location captured</b> · ${accTxt(a)}`:q=="weak"?`${ic("info",16)} <b>Weak GPS</b> · ${accTxt(a)}. Usable, but move to open sky and tap Try again for better accuracy.`
     :`${ic("info",16)} <b>Not accurate</b> · ${accTxt(a)}. This is an approximate position, not real GPS.`)
    :q=="good"?`${ic("check",16)} GPS ${accTxt(a)}…`:`${ic("gps",16)} Waiting for GPS… now ${accTxt(a)}${a>OK?" (approximate)":""} · ${Math.round((Date.now()-t0)/1000)} s`)
   +(stuck?`<div class="mut" style="margin-top:6px">${preciseHelp()}</div>`:"")
   +`<div class="gpsbtns">${final?`<button type="button" class="btn sm" onclick="gps()">${ic("refresh",14)} Try again</button>`:q!="good"?`<button type="button" class="btn sm" onclick="stopGps();gpsDone()">Use this</button>`:""}${q!="good"?`<button type="button" class="btn sm" onclick="pinHelp()">${ic("pin",14)} Place pin on map</button>`:""}</div>`};
 window.gpsDone=()=>{const st=$("gps");if(st&&$("lat").value){st.className=`gps ${quality(draft.acc||9999)}`;st.innerHTML=`${ic("check",16)} Location kept · ${accTxt(draft.acc||0)}`}};
 g.className="gps";g.innerHTML=`${ic("gps",16)} Getting GPS… (allow location if asked; works best outdoors)`;
 // accept a good fix straight away; otherwise keep listening up to 60 s for GPS to lock on
 locate({goal:GOOD,wait:60000,onFix:r=>put(r,false),onDone:r=>put(r,true),onFail:m=>{const st=$("gps");if(st){st.className="gps bad";st.innerHTML=`<b>${esc(m)}</b> You can place the pin on the map or type the coordinates.<div class="gpsbtns"><button type="button" class="btn sm" onclick="gps()">${ic("refresh",14)} Try again</button></div>`}}});
 // phones often go quiet instead of repeating an unchanged position: refresh the status every second while waiting
 const tok=gpsTok,tick=setInterval(()=>{if(gpsTok!==tok||!$("gps")){clearInterval(tick);return}if(lastFix)put(lastFix,false)},1000)}
function pinHelp(){stopGps();const m=$("pmap");if(m)m.scrollIntoView({behavior:"smooth",block:"center"});if(mapLayer!="sat")setLayer("sat");toast("Zoom in and tap the exact spot, or drag the pin")}
function near(){toast("Finding your location…");locate({goal:100,wait:15000,onDone:g=>{setMy(g);db.props.sort((a,b)=>(distTo(a)??1e9)-(distTo(b)??1e9));render();toast("Sorted nearest first")},onFail:m=>alert(m)})}
function me(silent){if(!silent)toast("Finding your location…");locate({goal:50,wait:15000,
 onFix:g=>{setMy(g);showMe(window.ptMap,g.coords,false);drawLinks()},
 onDone:g=>{setMy(g);showMe(window.ptMap,g.coords,false);drawLinks();if(!silent){fitPins(true);toast(`You are here (${accTxt(g.coords.accuracy)})`)}},
 onFail:m=>{if(!silent)alert(m)}})}
// Show this device on the map without asking: only if location permission was already given.
async function locPermitted(){try{const N=nativeGeo();if(N){const s=await N.checkPermissions();return s.location=="granted"||s.coarseLocation=="granted"}if(!window.isSecureContext||!navigator.permissions)return false;return (await navigator.permissions.query({name:"geolocation"})).state=="granted"}catch(e){return false}}
async function autoLocate(m){if(myPos){showMe(m,{latitude:myPos.lat,longitude:myPos.lng,accuracy:myPos.acc},false);drawLinks()}if((!myPos||Date.now()-myPos.at>120000)&&await locPermitted())me(true)}
function nav(v,f=""){const s=st();view=v;flt=f;
 if(v=="home"){if(s.d>0)return history.go(-s.d);setState({v,f,d:0},true)}
 else setState({v,f,d:1},s.d>0); // Home→tab adds an entry; tab→tab replaces it, so Back always returns Home
 render()}
function setF(f){flt=f;setState({...st(),f},true);render()}
function openS(x){const s=st();setState({v:s.v,f:s.f,s:x,d:s.d+1});drawS(x)}
function drawS(x){stopGps();dropSheetMaps();if(!x)return;if(x.t=="w")return drawWhatsNew();if(x.t=="v")return drawViewer(x.id,x.i||0);if(x.t=="b")return drawBoundary(x.id);if(x.t=="d")drawDetail(x.id);else if(x.t=="e")drawEdit(x.id);else if(x.t=="a")drawAdd();else drawCompare()}
function redraw(){drawS(st().s)}
function dropSheetMaps(){["ptMini","ptPick"].forEach(k=>{if(window[k]){window[k].remove();window[k]=null}})}
function closeS(){if(st().s)history.back();else{$("sh").innerHTML="";render()}}
function route(h){h=decodeURIComponent((h||"").replace(/^#/,""));let m;
 if(["list","map","rem","more"].includes(h))nav(h);
 else if((m=h.match(/^(?:p\/)?(P\d+)(\/edit|\/boundary)?$/))&&P(m[1])){openS({t:"d",id:m[1]});if(m[2]=="/edit")openS({t:"e",id:m[1]});else if(m[2])openS({t:"b",id:m[1]})}
 else if(h=="add")openS({t:"a"});else if(h=="whats-new")openS({t:"w"})}
window.addEventListener("popstate",e=>{
 if(!e.state&&location.hash){const h=location.hash;history.replaceState({v:"home",d:0},"",location.pathname);view="home";flt="";$("sh").innerHTML="";render();return route(h)} // link to #p/P0001 etc.
 const s=e.state||{v:"home",d:0},x=s.s;view=s.v||"home";flt=s.f||"";
 if(x&&x.id&&!P(x.id))return history.back(); // property was deleted
 if(x&&x.t=="c"&&cmp.length<2)return history.back();
 if(x)drawS(x);else{stopGps();dropSheetMaps();$("sh").innerHTML="";render()}});
// Android APK: hardware Back walks the in-app history and only leaves the app from Home.
try{const C=window.Capacitor,A=C&&C.Plugins&&C.Plugins.App;if(A&&C.isNativePlatform&&C.isNativePlatform())A.addListener("backButton",()=>{if(st().d>0)history.back();else A.exitApp()})}catch(e){}
function render(){
 const due=dueCount();
 $("nav").innerHTML=`<div class="brand"><img src="/assets/property_tracker/images/logo.svg" alt="">Property Tracker</div>`
  +[["home","home","Home"],["list","list","Properties"],["map","map","Map"],["rem","bell","Reminders"],["more","user","Account"]].map(([v,i,t])=>
   `<button class="${view==v?"on":""}" onclick="nav('${v}')" aria-label="${t}"${view==v?' aria-current="page"':""}>${v=="more"&&prof.user?avatar(view==v?24:22):ic(i)}<span>${t}</span>${v=="rem"&&due?`<i class="badge">${due}</i>`:""}</button>`).join("")
  +`<button class="chip" onclick="nav('more')">${avatar(32)}<div class="ell"><b class="ell">${esc(prof.full_name||"")}</b><span class="ell">${esc(prof.email||"")}</span></div></button>`;
 if(window.ptMap){window.ptMap.remove();window.ptMap=null}
 $("m").innerHTML=({home,list,map,rem,more})[view]()+(view=="more"?"":`<button class="fab" onclick="edit()">${ic("plus")}<span>Add property</span></button>`);
 if(view=='map')setTimeout(initMap,0);
 if(view=='rem')setTimeout(updateAlertsCard,0);
}
function home(){const t=new Date(),wk=new Date(Date.now()-6048e5),c=f=>db.props.filter(f).length,s=x=>c(p=>p.status==x),due=dueCount();
 const tile=(n,l,f,k)=>`<button class="card stat" style="--c:${k?col(k):"var(--ac)"}" onclick="nav('list','${f}')"><b>${n}</b><span>${l}</span></button>`;
 const pr=db.props.filter(p=>total(p)),avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
 const loc={};db.props.forEach(p=>{const k=p.locality||p.district||"Unknown";loc[k]=(loc[k]||0)+1});
 return head(`${greet()}${prof.first_name?", "+esc(prof.first_name):""}`,`${db.props.length} propert${db.props.length==1?"y":"ies"} · ${esc(sync)}`)
 +(due?`<button class="card alert" onclick="nav('rem')">${ic("bell",24)}<div><b>${due} follow-up${due>1?"s":""} due</b><span>Overdue or due in the next 24 hours</span></div></button>`:"")
 +`<div class="grid">${tile(c(p=>same(p.created,t)),"Visited today","")}${tile(c(p=>new Date(p.created)>wk),"This week","")}${tile(s("Shortlisted"),"Shortlisted","Shortlisted","Shortlisted")}${tile(s("Negotiating"),"Negotiating","Negotiating","Negotiating")}${tile(s("Document Verification"),"Document check","Document Verification","Document Verification")}${tile(s("Revisit Required"),"Site revisit","Revisit Required","Revisit Required")}${tile(s("Purchased"),"Purchased","Purchased","Purchased")}${tile(s("Rejected"),"Rejected","Rejected","Rejected")}${tile(db.props.length,"Total","","")}<button class="card stat" style="--c:var(--warn)" onclick="nav('rem')"><b>${due}</b><span>Follow-ups due</span></button></div>
 <h2>Average prices</h2><div class="card kpis"><div><span>Total</span><b>${inr(avg(pr.map(total)))}</b></div><div><span>Per cent</span><b>${inr(avg(pr.map(pc).filter(x=>x)))}</b></div><div><span>Per sq.ft</span><b>${inr(avg(pr.map(psf).filter(x=>x)))}</b></div></div>
 <h2>By location</h2>${Object.keys(loc).length?`<div class="chips">${Object.entries(loc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span class="chip">${ic("pin",14)} ${esc(k)} <small>${v}</small></span>`).join("")}</div>`:'<div class="card mut">No data yet</div>'}
 <h2>Recent visits</h2><div class="items">${db.props.slice(-6).reverse().map(item).join("")||`<div class="card empty">${ic("pin",32)}<div>Tap <b>Add property</b> at your first site.</div></div>`}</div>`}
function item(p){const sub=[p.name?p.id:"",p.locality||p.type].filter(Boolean).map(esc).join(" · ");
 return `<div class="card item${p._local||p._pending?" pend":""}" onclick="detail('${p.id}')">${thumb(p)}<div class="it"><div class="t1">${esc(p.name||p.id)}</div><div class="t2">${pill(p.status)}<span class="mut ell">${sub}</span></div>${p.addr?`<div class="mut ell">${ic("pin",13)} ${esc(p.addr)}</div>`:""}<div class="t3"><b>${inr(total(p))}</b><span class="mut">${[areaTxt(p),dims(p),distTo(p)!=null?`${kmTxt(distTo(p))} away`:""].filter(Boolean).join(" · ")}</span></div></div></div>`}
let mine=false;const isMine=p=>p.assign?p.assign==prof.user:p.by==prof.user;
const matchQ=(p,s)=>!s||JSON.stringify([p.id,p.name,p.locality,p.district,p.addr,p.owner,p.phone,p.type,p.broker,p.source]).toLowerCase().includes(s.toLowerCase());
function listItems(){const r=db.props.filter(p=>(!flt||p.status==flt)&&(!mine||isMine(p))&&matchQ(p,q)).reverse();
 return r.map(p=>cmpMode?`<div class="selrow"><input type="checkbox" aria-label="Select ${p.id} to compare" ${cmp.includes(p.id)?"checked":""} onchange="tgl('${p.id}')">${item(p)}</div>`:item(p)).join("")||`<div class="card empty">${ic("search",28)}<div>No properties match.</div></div>`}
function list(){const n={};db.props.forEach(p=>n[p.status]=(n[p.status]||0)+1);
 return head("Properties",`${db.props.length} total`)
 +`<div class="search">${ic("search",18)}<input type="search" placeholder="Search name, address, owner, ID…" value="${esc(q)}" oninput="q=this.value;$('results').innerHTML=listItems()"></div>
 <div class="chips"><button class="chip ${mine?"on":""}" onclick="mine=!mine;render()">${ic("user",14)} Mine <small>${db.props.filter(isMine).length}</small></button><button class="chip ${!flt?"on":""}" onclick="setF('')">All <small>${db.props.length}</small></button>${ST.filter(s=>n[s]||s==flt).map(s=>`<button class="chip ${s==flt?"on":""}" style="--c:${col(s)}" onclick="setF('${s}')"><i class="dot"></i>${s} <small>${n[s]||0}</small></button>`).join("")}</div>
 <div class="toolbar"><button class="btn sm ${cmpMode?"on":""}" onclick="cmpMode=!cmpMode;if(!cmpMode)cmp=[];render()">${ic("compare",16)} ${cmpMode?"Cancel":"Select to compare"}</button>${cmpMode?`<button class="btn sm p" id="cmpbtn" onclick="compare()">Compare (${cmp.length})</button>`:""}<button class="btn sm" onclick="near()">${ic("gps",16)} Nearest first</button></div>
 <div id="results">${listItems()}</div>`}
let cmpMode=false;
function tgl(id){cmp=cmp.includes(id)?cmp.filter(x=>x!=id):[...cmp,id].slice(-5);const b=$("cmpbtn");if(b)b.textContent=`Compare (${cmp.length})`}
function hav(a,b,c,d){if(c==null||c==="")return 1e9;const r=x=>x*Math.PI/180,h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 12742*Math.asin(Math.sqrt(h))}
function map(){const ps=db.props.filter(hasLoc);
 if(!ps.length)return head("Map")+`<div class="card empty">${ic("map",32)}<div>No located properties yet. Capture GPS when you add a property.</div></div>`;
 const f=flt;return head("Map",`${ps.length} located`)+`<div class="search">${ic("search",18)}<input type="search" placeholder="Search pins…" value="${esc(mq)}" oninput="mq=this.value;updateMap()"></div>
 <div class="chips"><button class="chip ${!f?"on":""}" onclick="setF('')">All</button>${["Visited","Shortlisted","Negotiating","Purchased","Rejected"].map(s=>`<button class="chip ${f==s?"on":""}" style="--c:${col(s)}" onclick="setF('${s}')"><i class="dot"></i>${s}</button>`).join("")}</div>
 ${layerSeg()}<div class="card mapcard"><div id="lmap"></div><div class="mapbtns"><button class="iconbtn" onclick="me()" aria-label="My location" title="My location">${ic("gps")}</button><button class="iconbtn" onclick="fitAll()" aria-label="Show all pins" title="Show all pins">${ic("compare")}</button></div></div><div class="mut" style="margin-top:8px">Tap a pin for details, directions or Street View.</div>`}


// ---- maps ------------------------------------------------------------------------
// Free base maps (no API keys): OpenStreetMap, CARTO, Esri satellite imagery and OpenTopoMap.
const isDark=()=>{const t=document.documentElement.getAttribute("data-theme");return t?t=="dark":matchMedia("(prefers-color-scheme: dark)").matches};
const ESRI="https://server.arcgisonline.com/ArcGIS/rest/services/";
const LAYERS={
 street:{name:"Street",icon:"map",tiles:()=>[["https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,className:"inv",attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'}]]},
 clean:{name:"Clean",icon:"list",tiles:()=>[[`https://{s}.basemaps.cartocdn.com/${isDark()?"dark_all":"rastertiles/voyager"}/{z}/{x}/{y}{r}.png`,{maxZoom:20,subdomains:"abcd",attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank">CARTO</a>'}]]},
 sat:{name:"Satellite",icon:"image",tiles:()=>[[ESRI+"World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,maxNativeZoom:19,attribution:'Imagery © <a href="https://www.esri.com" target="_blank">Esri</a>, Maxar, Earthstar Geographics'}],
  [ESRI+"Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,maxNativeZoom:19,opacity:.85}],[ESRI+"Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,maxNativeZoom:19}]]},
 topo:{name:"Terrain",icon:"ruler",tiles:()=>[["https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",{maxZoom:17,subdomains:"abc",className:"inv",attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>, SRTM | © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)'}]]}};
let mapLayer=(()=>{try{return localStorage.getItem("mapLayer")||"street"}catch(e){return "street"}})();
if(!LAYERS[mapLayer])mapLayer="street";
const liveMaps=()=>[window.ptMap,window.ptMini,window.ptPick].filter(Boolean);
function setBase(m){if(m._base)m.removeLayer(m._base);m._base=L.layerGroup(LAYERS[mapLayer].tiles().map(([u,o])=>L.tileLayer(u,o))).addTo(m);m.setMaxZoom(mapLayer=="topo"?17:20)}
function setLayer(k){mapLayer=k;try{localStorage.setItem("mapLayer",k)}catch(e){}liveMaps().forEach(setBase);document.querySelectorAll(".layerseg button").forEach(b=>b.classList.toggle("on",b.dataset.k==k))}
const layerSeg=()=>`<div class="seg layerseg" role="group" aria-label="Map style">${Object.entries(LAYERS).map(([k,l])=>`<button type="button" data-k="${k}" class="${k==mapLayer?"on":""}" onclick="setLayer('${k}')">${ic(l.icon,15)} ${l.name}</button>`).join("")}</div>`;
function newMap(id,o={}){const m=L.map(id,{zoomControl:true,attributionControl:true,...o});m.attributionControl.setPrefix(false);setBase(m);setTimeout(()=>{if(m._mapPane&&m.getContainer().isConnected)m.invalidateSize()},250);return m} // the map may be gone if the user navigated away
const pinIcon=(c,big)=>L.divIcon({className:"",html:`<span class="mk${big?" big":""}" style="--c:${c}"></span>`,iconSize:big?[34,34]:[28,28],iconAnchor:big?[17,34]:[14,28],popupAnchor:[0,big?-32:-26]});
const svUrl=p=>`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}`;
const navUrl=p=>`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
function popup(p){return `<div class="pop">${p.photos&&p.photos[0]?`<img src="${esc(p.photos[0].d)}" alt="">`:""}<b>${esc(p.name||p.id)}</b><div class="pmeta">${pill(p.status)}<span class="mut">${p.id}</span></div>${p.addr?`<div class="mut">${esc(p.addr)}</div>`:""}${distTo(p)!=null?`<div class="pdist">${ic("go",13)} <b>${kmTxt(distTo(p))}</b> from you</div>`:""}<div class="pprice"><b>${inr(total(p))}</b> <span class="mut">${[areaTxt(p),dims(p)].filter(Boolean).join(" · ")}</span></div>
 <div class="pact"><button class="btn sm p" onclick="detail('${p.id}')">Details</button><a class="btn sm" href="${navUrl(p)}" target="_blank" rel="noopener">${ic("go",14)} Go</a><a class="btn sm" href="${svUrl(p)}" target="_blank" rel="noopener">${ic("user",14)} Street View</a></div></div>`}
// "You are here" dot with accuracy circle
function showMe(m,c,fly){if(!m)return;const ll=[c.latitude,c.longitude];if(m._me){m._me.setLatLng(ll);m._acc.setLatLng(ll).setRadius(c.accuracy)}else{m._acc=L.circle(ll,{radius:c.accuracy,color:"#2b7cff",weight:1,fillOpacity:.12,interactive:false}).addTo(m);m._me=L.marker(ll,{icon:L.divIcon({className:"",html:'<span class="me"></span>',iconSize:[18,18],iconAnchor:[9,9]}),interactive:false,zIndexOffset:1000}).addTo(m)}if(fly)m.flyTo(ll,Math.max(m.getZoom()||0,16),{duration:.8})}
function initMap(){const m=$("lmap");if(!m)return;if(window.ptMap){window.ptMap.remove();window.ptMap=null}window.ptMap=newMap('lmap');window.ptMap.setView([20.6,78.9],5);updateMap(true);autoLocate(window.ptMap)}
function updateMap(fit){const M=window.ptMap;if(!M)return;if(window.ptMarkers)M.removeLayer(window.ptMarkers);
 const ps=db.props.filter(p=>hasLoc(p)&&(!flt||p.status==flt)&&matchQ(p,mq));
 window.ptMarkers=L.featureGroup(ps.map(p=>{const mk=L.marker([+p.lat,+p.lng],{icon:pinIcon(col(p.status)),title:p.name||p.id,riseOnHover:true}).bindPopup(()=>popup(p),{maxWidth:280,minWidth:230});
  mk._pid=p.id;mk.on("popupopen",()=>{M._sel=p.id;drawLinks()});mk.on("popupclose",()=>{if(M._sel==p.id){M._sel=null;drawLinks()}});return mk})).addTo(M);
 if(M._bounds)M.removeLayer(M._bounds);M._bounds=L.layerGroup(ps.filter(p=>p.boundary).map(p=>{const r=ringOf(p.boundary);return r?L.polygon(r,{color:col(p.status),weight:2,fillOpacity:.12,interactive:false}):null}).filter(Boolean)).addTo(M);
 if(fit)fitPins(false);drawLinks()}
// Zoom straight to the pins (street level for one pin); optionally include this device.
function fitPins(withMe){const M=window.ptMap;if(!M)return;const pts=window.ptMarkers?window.ptMarkers.getLayers().map(m=>m.getLatLng()):[];
 if(withMe&&myPos)pts.push(L.latLng(myPos.lat,myPos.lng));if(!pts.length)return;
 if(pts.length==1)M.setView(pts[0],17);else M.fitBounds(L.latLngBounds(pts),{padding:[50,50],maxZoom:17})}
// Lines from this device to the pins, labelled with the distance. All pins when there are few, else the selected one.
function drawLinks(){const M=window.ptMap;if(!M)return;if(M._links){M.removeLayer(M._links);M._links=null}
 if(!myPos||!window.ptMarkers)return;const ms=window.ptMarkers.getLayers(),few=ms.length<=10;
 const show=ms.filter(m=>few||m._pid==M._sel);if(!show.length)return;
 M._links=L.layerGroup(show.map(m=>{const ll=m.getLatLng(),on=m._pid==M._sel,d=hav(myPos.lat,myPos.lng,ll.lat,ll.lng);
  return L.polyline([[myPos.lat,myPos.lng],ll],{color:"#2b7cff",weight:on?4:2.5,opacity:on?.95:.55,dashArray:on?null:"6 8",interactive:false})
   .bindTooltip(kmTxt(d),{permanent:true,direction:"center",className:"dist"+(on?" on":"")})})).addTo(M)}
function fitAll(){fitPins(!!myPos)}
// Property page: small map of the site
function miniMap(p){if(window.ptMini){window.ptMini.remove();window.ptMini=null}if(!$("dmap")||!hasLoc(p))return;
 const ll=[+p.lat,+p.lng],m=window.ptMini=newMap("dmap",{scrollWheelZoom:false,dragging:!L.Browser.mobile,tap:false});m.setView(ll,17);L.marker(ll,{icon:pinIcon(col(p.status),true)}).addTo(m);
 const bl=drawBoundaryOn(m,p);if(bl)m.fitBounds(bl.getBounds().extend(ll),{padding:[24,24],maxZoom:19});
 const link=()=>{if(!myPos||window.ptMini!==m)return;const d=distTo(p);showMe(m,{latitude:myPos.lat,longitude:myPos.lng,accuracy:myPos.acc},false);
  if(m._line)m.removeLayer(m._line);m._line=L.polyline([[myPos.lat,myPos.lng],ll],{color:"#2b7cff",weight:3,opacity:.8,dashArray:"6 8",interactive:false}).bindTooltip(kmTxt(d),{permanent:true,direction:"center",className:"dist"}).addTo(m);
  if(d<=5&&!p.boundary)m.fitBounds(L.latLngBounds([ll,[myPos.lat,myPos.lng]]),{padding:[30,30],maxZoom:17});const e=$("ddist");if(e)e.innerHTML=`${ic("go",14)} <b>${kmTxt(d)}</b> from you`};
 link();if(!myPos||Date.now()-myPos.at>120000)locPermitted().then(ok=>ok&&locate({goal:100,wait:12000,onFix:g=>{setMy(g);link()},onDone:g=>{setMy(g);link()},onFail:()=>{}}))}
// Add/edit form: draggable pin to fine-tune the GPS position (or tap the map to place it)
function pickMap(){if(window.ptPick){window.ptPick.remove();window.ptPick=null}if(!$("pmap"))return;
 const la=parseFloat($("lat").value),ln=parseFloat($("lng").value),has=isFinite(la)&&isFinite(ln);
 const ref=db.props.find(hasLoc);const m=window.ptPick=newMap("pmap",{scrollWheelZoom:false,tap:false});
 m.setView(has?[la,ln]:ref?[ref.lat,ref.lng]:[20.6,78.9],has?18:ref?13:5);
 if(has)pickTo(la,ln);
 m.on("click",e=>{stopGps();pickTo(e.latlng.lat,e.latlng.lng,true);pinSet("Pin placed on the map")})}
function pinSet(t){if(draft){draft.lsrc="Map pin";draft.acc=""}const e=$("gps");if(e){e.className="gps good";e.innerHTML=`${ic("pin",16)} ${t}`}}
function pickTo(la,ln,fromMap,acc){const m=window.ptPick;if(!m)return;
 if(!m._pin){m._pin=L.marker([la,ln],{draggable:true,icon:pinIcon("var(--ac)",true),autoPan:true}).addTo(m);
  m._pin.on("dragend",()=>{stopGps();const q=m._pin.getLatLng();setLL(q.lat,q.lng);pinSet("Pin moved by hand")})}
 else m._pin.setLatLng([la,ln]);
 if(fromMap)setLL(la,ln);else m.setView([la,ln],Math.max(m.getZoom(),acc&&acc>200?15:18));
 if(m._acc)m.removeLayer(m._acc);m._acc=acc?L.circle([la,ln],{radius:acc,color:"#2b7cff",weight:1,fillOpacity:.1,interactive:false}).addTo(m):null}
function setLL(la,ln){if($("lat"))$("lat").value=la.toFixed(6);if($("lng"))$("lng").value=ln.toFixed(6)}
function gpsMsg(t){const e=$("gps");if(e)e.textContent=t}
function typedLL(){if(draft){draft.lsrc="Typed";draft.acc=""}pickFromInputs()}
function pickFromInputs(){const la=parseFloat($("lat").value),ln=parseFloat($("lng").value);if(isFinite(la)&&isFinite(ln))pickTo(la,ln)}
// ---- reminder alerts -----------------------------------------------------------
// Android app: native alarms scheduled on the phone (ring at the due time, even offline / app closed).
// Browser or installed web app: Web Push sent by the Frappe scheduler (needs https:// or localhost).
const LN=()=>{try{const C=window.Capacitor;return C&&C.isNativePlatform&&C.isNativePlatform()&&C.Plugins&&C.Plugins.LocalNotifications||null}catch(e){return null}};
const pushSupported=()=>!LN()&&window.isSecureContext&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
let alertsOn=false,alertsRefreshed=false,chanMade=false;
const nid=k=>{let h=0;for(const c of String(k))h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)%2147483000+1};
const remUrl=r=>r.p?`/property-tracker#p/${r.p}`:"/property-tracker#rem";
const b64uBytes=t=>{t=t.replace(/-/g,"+").replace(/_/g,"/");t+="=".repeat((4-t.length%4)%4);return Uint8Array.from(atob(t),c=>c.charCodeAt(0))};
const sameKey=(a,b)=>{if(!a)return false;a=new Uint8Array(a);return a.length==b.length&&a.every((x,i)=>x==b[i])};
const swReg=()=>navigator.serviceWorker.getRegistration("/property-tracker");
function pushHelp(){return !window.isSecureContext?"Alerts need https:// (or localhost). On this http:// address, use the Property Tracker Android app, which rings its own alarms.":"This browser can't receive push alerts. On iPhone, add Property Tracker to the Home Screen first (iOS 16.4 or later)."}
async function alertsState(){ // "on" | "off" | "blocked" | "unsupported"
 const N=LN();if(N){const p=await N.checkPermissions();return p.display=="granted"?"on":p.display=="denied"?"blocked":"off"}
 if(!pushSupported())return "unsupported";
 if(Notification.permission=="denied")return "blocked";
 const reg=await swReg(),sub=reg&&await reg.pushManager.getSubscription();
 return sub&&Notification.permission=="granted"?"on":"off"}
let pushDelay=0;
async function updateAlertsCard(){const el=$("alerts");if(!el)return;const s=await alertsState().catch(()=>"off"),n=!!LN();alertsOn=s=="on";
 if(s=="on"&&!n&&!pushDelay){try{pushDelay=(await api("get_push_config")).delay_minutes||1}catch(e){pushDelay=1}}
 if(!$("alerts"))return;
 const txt={on:n?"🔔 <b>Alarms are on.</b> Reminders ring on this phone at their due time, even when the app is closed.":"🔔 <b>Alerts are on for this device.</b> You'll get a notification when a reminder is due, even when the app is closed.",
  off:n?"🔕 Turn on alarms so reminders ring on this phone at their due time.":"🔕 Turn on alerts to get a notification on this device when a reminder is due.",
  blocked:n?"🚫 Notifications are blocked. Allow them in Android Settings → Apps → Property Tracker → Notifications.":"🚫 Notifications are blocked for this site. Allow them in the browser's site settings, then reload.",
  unsupported:esc(pushHelp())}[s];
 const late=s=="on"&&!n&&pushDelay>1?`<div class="mut" style="margin-top:6px">${ic("info",13)} Alerts arrive within about ${pushDelay} minutes of the due time (server setting <code>scheduler_tick_interval</code>).</div>`:"";
 el.innerHTML=`<div>${txt}</div>${late}<div class="row wrap" style="margin-top:8px">${s=="off"||(s=="blocked"&&n)?`<button class="btn p" onclick="enableAlerts()">Turn on</button>`:""}${s=="on"?`<button class="btn" onclick="testAlert()">Send test</button>${n?"":`<button class="btn" onclick="disableAlerts()">Turn off</button>`}`:""}</div>`}
async function enableAlerts(){try{const N=LN();
 if(N){let p=await N.checkPermissions();if(p.display!="granted")p=await N.requestPermissions();
  if(p.display!="granted")toast("Notifications are blocked. Allow them for Property Tracker in Android settings.");else{await syncAlarms();toast("Reminder alarms are on")}}
 else{if(!pushSupported())return alert(pushHelp());
  if(await Notification.requestPermission()!="granted"){toast("Notifications were not allowed");return updateAlertsCard()}
  const {public_key}=await api("get_push_config"),key=b64uBytes(public_key);
  await navigator.serviceWorker.register("/property-tracker-sw.js",{scope:"/property-tracker"});const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(sub&&!sameKey(sub.options.applicationServerKey,key)){await sub.unsubscribe();sub=null} // server keys changed
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  await api("save_push_subscription",{subscription:sub.toJSON(),user_agent:navigator.userAgent});toast("Reminder alerts are on for this device")}
 }catch(e){console.error(e);toast("Could not turn on alerts: "+(e.message||e))}
 updateAlertsCard()}
async function disableAlerts(){try{const reg=await swReg(),sub=reg&&await reg.pushManager.getSubscription();
 if(sub){await api("delete_push_subscription",{endpoint:sub.endpoint});await sub.unsubscribe()}toast("Alerts are off for this device")}catch(e){}updateAlertsCard()}
async function testAlert(){const N=LN();
 if(N){await N.schedule({notifications:[{id:999999,title:"🔔 Property Tracker",body:"Reminder alarms are working on this phone.",schedule:{at:new Date(Date.now()+3000),allowWhileIdle:true},channelId:"reminders"}]});return toast("Test alarm in 3 seconds…")}
 const r=await api("send_test_push");
 toast(r.sent?"Test alert sent. It should appear in a moment.":r.removed?"This device's alert registration expired. Turn alerts on again.":"Could not send the test alert. See Error Log in Desk.");if(r.removed)updateAlertsCard()}
// Android: (re)schedule a native alarm for every open reminder. Called after data loads or reminders change.
async function syncAlarms(){const N=LN();if(!N)return;try{
 if((await N.checkPermissions()).display!="granted")return;
 if(!chanMade){await N.createChannel({id:"reminders",name:"Reminders",description:"Property reminder alarms",importance:5,visibility:1,vibration:true});chanMade=true}
 const pend=((await N.getPending()).notifications||[]).filter(n=>n.id!=999999);if(pend.length)await N.cancel({notifications:pend.map(n=>({id:n.id}))});
 const now=Date.now(),list=db.rem.filter(r=>!r.done&&new Date(r.due).getTime()>now+1000).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,60)
  .map(r=>({id:nid(r.k),title:"⏰ Reminder",body:r.t+(r.p?" · "+r.p:""),schedule:{at:new Date(r.due),allowWhileIdle:true},channelId:"reminders",autoCancel:true,extra:{url:remUrl(r)}}));
 if(list.length)await N.schedule({notifications:list})}catch(e){console.error("alarms",e)}}
// After loading: keep this browser's push registration current on the server, or the phone's alarms in sync.
async function refreshAlerts(){try{if(LN())return syncAlarms();if(alertsRefreshed||!pushSupported()||Notification.permission!="granted")return;alertsRefreshed=true;
 const reg=await swReg(),sub=reg&&await reg.pushManager.getSubscription();alertsOn=!!sub;
 if(sub)await api("save_push_subscription",{subscription:sub.toJSON(),user_agent:navigator.userAgent},true)}catch(e){}}
// Tapping a notification opens the reminder's property (or the Reminders screen).
function openHash(h){if(!h)return;if(h=="#rem"){if(st().s)history.go(-st().d);setTimeout(()=>nav("rem"),50)}else route(h)}
try{const N=LN();if(N)N.addListener("localNotificationActionPerformed",a=>{const u=a&&a.notification&&a.notification.extra&&a.notification.extra.url;if(u)openHash(new URL(u,location.origin).hash)})}catch(e){}
if("serviceWorker" in navigator)navigator.serviceWorker.addEventListener("message",e=>{if(e.data&&e.data.type=="pt-open")openHash(e.data.hash)});
// ---- plot boundary ---------------------------------------------------------------------
// Geodesic polygon area (same formula as the server / Leaflet.draw). pts: [[lat,lng],...]
function areaSqm(pts){if(pts.length<3)return 0;let a=0;const R=6378137,rad=Math.PI/180;
 for(let i=0;i<pts.length;i++){const [y1,x1]=pts[i],[y2,x2]=pts[(i+1)%pts.length];a+=(x2-x1)*rad*(2+Math.sin(y1*rad)+Math.sin(y2*rad))}return Math.abs(a*R*R/2)}
const ringOf=b=>{try{const f=b&&(b.type=="FeatureCollection"?b.features[0]?.geometry:b.type=="Feature"?b.geometry:b);return f&&f.type=="Polygon"?f.coordinates[0].slice(0,-1).map(([x,y])=>[y,x]):null}catch(e){return null}};
const toGeo=pts=>({type:"FeatureCollection",features:[{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[[...pts,pts[0]].map(([y,x])=>[x,y])]}}]});
function drawBoundaryOn(m,p,style){const r=ringOf(p.boundary);if(!r)return null;return L.polygon(r,{color:style?.color||"#f5c518",weight:style?.weight||3,fillOpacity:style?.fill??.15,interactive:false}).addTo(m)}
let bpts=[],bmap=null;
function drawBoundary(id){const p=P(id);if(!p)return;bpts=ringOf(p.boundary)||[];
 const prevLayer=mapLayer;
 sheet(sheetHead(`Boundary · ${p.id}`,esc(p.name||""))+`<div class="mut" style="margin-bottom:8px">Tap the map at each corner of the plot, or stand at a corner and tap <b>Add my position</b>. Drag a corner to adjust it.</div>
 <div class="card mapcard"><div id="bmap"></div></div>${layerSeg()}
 <div class="card barea" id="barea"></div>
 <div class="row wrap" style="margin-top:10px;gap:8px"><button class="btn" onclick="bAddMe()">${ic("gps",16)} Add my position</button><button class="btn" onclick="bpts.pop();bRedraw()">Undo</button><button class="btn d" onclick="if(confirm('Remove all corners?')){bpts=[];bRedraw()}">Clear</button></div>
 <div class="savebar"><button class="btn" onclick="closeS()">Cancel</button><button class="btn p" onclick="bSave('${id}')">Save boundary</button></div>`);
 setTimeout(()=>{if(window.ptPick){window.ptPick.remove()}const m=window.ptPick=bmap=newMap("bmap",{tap:false});if(mapLayer=="street"&&!localStorage.getItem("mapLayer"))setLayer("sat");
  const ctr=bpts.length?bpts[0]:hasLoc(p)?[+p.lat,+p.lng]:[20.6,78.9];m.setView(ctr,bpts.length||hasLoc(p)?18:5);
  if(hasLoc(p))L.marker([+p.lat,+p.lng],{icon:pinIcon(col(p.status)),interactive:false}).addTo(m);
  m.on("click",e=>{bpts.push([e.latlng.lat,e.latlng.lng]);bRedraw()});bRedraw(true)},0)}
function bRedraw(fit){const m=bmap;if(!m||!$("bmap"))return;if(m._b)m.removeLayer(m._b);
 const g=m._b=L.layerGroup().addTo(m);if(bpts.length>1)L.polygon(bpts,{color:"#f5c518",weight:3,fillOpacity:.2,interactive:false}).addTo(g);
 bpts.forEach((pt,i)=>{const mk=L.marker(pt,{draggable:true,icon:L.divIcon({className:"",html:`<span class="vtx">${i+1}</span>`,iconSize:[26,26],iconAnchor:[13,13]})}).addTo(g);
  mk.on("drag",e=>{bpts[i]=[e.latlng.lat,e.latlng.lng];if(m._b){const poly=m._b.getLayers().find(l=>l instanceof L.Polygon);if(poly)poly.setLatLngs(bpts)}bArea()});mk.on("dragend",()=>bRedraw())});
 if(fit&&bpts.length>2)m.fitBounds(L.latLngBounds(bpts),{padding:[40,40],maxZoom:20});bArea()}
function bArea(){const e=$("barea");if(!e)return;const sq=areaSqm(bpts)*10.7639;
 e.innerHTML=bpts.length<3?`<span class="mut">${bpts.length} corner${bpts.length==1?"":"s"} · add at least 3</span>`:`<b>${fmt(sq/435.6)} cent</b> · ${fmt(Math.round(sq))} sq.ft · ${fmt(sq/43560)} acre · ${fmt(sq/2400)} ground <span class="mut">(${bpts.length} corners)</span>`}
function bAddMe(){toast("Getting your position…");locate({goal:10,wait:20000,onDone:g=>{setMy(g);bpts.push([g.coords.latitude,g.coords.longitude]);bRedraw();bmap&&bmap.setView([g.coords.latitude,g.coords.longitude],Math.max(bmap.getZoom(),18));toast(`Corner added (${accTxt(g.coords.accuracy)})`)},onFail:m=>alert(m)})}
async function bSave(id){if(bpts.length&&bpts.length<3)return toast("Add at least 3 corners, or Clear to remove the boundary");
 put(await api("save_property",{name:id,data:{boundary:bpts.length?toGeo(bpts):null}}));toast(bpts.length?"Boundary saved":"Boundary removed");closeS()}
// extra form sections: source & broker, assignment; caption per photo
const formExtra=p=>{p=p||{};const V=k=>esc(p[k]??"");return `<section class="card fs"><h3>${ic("user",18)} Source & broker</h3>
 <div class="row"><div><label for="src">Source</label><select id="src"><option value="">—</option>${opts(SOURCES,p.source)}</select></div><div><label for="asn">Assigned to</label><select id="asn"><option value="">—</option>${team.map(t=>`<option value="${esc(t.user)}" ${p.assign==t.user?"selected":""}>${esc(t.name)}</option>`).join("")}</select></div></div>
 <div class="row"><div><label for="brk">Broker name</label><input id="brk" value="${V("broker")}"></div><div><label for="bph">Broker phone</label><input id="bph" type="tel" inputmode="tel" value="${V("bphone")}"></div></div>
 <label for="cmm">Commission</label><input id="cmm" value="${V("comm")}" placeholder="e.g. 2% or ₹50,000"></section>`};
function rem(){const rs=[...db.rem].sort((a,b)=>a.due.localeCompare(b.due)),nowD=new Date();
 const row=r=>{const od=!r.done&&new Date(r.due)<nowD;return `<div class="rem ${r.done?"done":""}"><input type="checkbox" aria-label="Done" ${r.done?"checked":""} onchange="remDone('${r.k}',this.checked)"><div style="flex:1;min-width:0"><div class="t">${esc(r.t)}</div><div class="mut">${ic("bell",13)} ${dt(r.due)}${od?` · <span class="overdue">Overdue</span>`:""} ${r.p?`<button class="linkchip" onclick="detail('${r.p}')">${r.p}</button>`:""}</div></div><button class="iconbtn sm" onclick="delRem('${r.k}')" aria-label="Delete reminder" title="Delete">${ic("trash",16)}</button></div>`};
 const open=rs.filter(r=>!r.done),done=rs.filter(r=>r.done).reverse();
 return head("Reminders",`${open.length} open`)+`<div class="card" id="alerts">…</div>
 <section class="card"><h3>${ic("plus",18)} New reminder</h3><label for="rt">What</label><input id="rt" placeholder="Call owner, check EC, revisit…"><div class="row"><div><label for="rd">When</label><input id="rd" type="datetime-local"></div><div><label for="rp">Property</label><select id="rp"><option value="">—</option>${db.props.map(p=>`<option value="${p.id}">${p.id}${p.name?" · "+esc(p.name):""}</option>`).join("")}</select></div></div><button class="btn p" style="margin-top:12px;width:100%" onclick="addRem()">Add reminder</button></section>
 <h2>Upcoming</h2>${open.length?`<div class="card">${open.map(row).join("")}</div>`:`<div class="card empty">${ic("bell",28)}<div>No open reminders.</div></div>`}
 ${done.length?`<div class="sechead"><h2>Done (${done.length})</h2><button class="btn sm" onclick="clearDone()">${ic("trash",15)} Clear done</button></div><div class="card">${done.slice(0,30).map(row).join("")}${done.length>30?`<div class="mut" style="margin-top:10px">and ${done.length-30} more</div>`:""}</div>`:""}`}
async function delRem(k){const r=db.rem.find(x=>x.k==k);if(!r||!confirm(`Delete reminder "${r.t}"?`))return;await api("delete_reminder",{name:k});db.rem=db.rem.filter(x=>x.k!=k);render();syncAlarms();toast("Reminder deleted")}
async function clearDone(){const n=db.rem.filter(r=>r.done).length;if(!n||!confirm(`Clear ${n} done reminder${n>1?"s":""}? This can't be undone.`))return;
 const r=await api("clear_done_reminders");db.rem=db.rem.filter(x=>!x.done);render();toast(`Cleared ${r.deleted} done reminder${r.deleted==1?"":"s"}`)}
async function addRem(){const t=$("rt").value.trim(),d=$("rd").value;if(!t||!d)return alert("Enter text and date");
 const nr=await write("add_reminder",{reminder:t,due_on:new Date(d).toISOString(),property:$("rp").value});if(!db.rem.includes(nr))db.rem.push(nr);render();syncAlarms();if((await alertsState().catch(()=>""))=="off")enableAlerts()}
async function remDone(k,d){const r=await write("set_reminder_done",{name:k,done:d?1:0});db.rem=db.rem.map(x=>x.k==k?r:x);render();syncAlarms()}
const shown=new Set();
setInterval(()=>{try{if(LN()||alertsOn||!("Notification" in window)||Notification.permission!="granted")return; // page-open fallback when push is off
 db.rem.filter(r=>!r.done&&!shown.has(r.k)&&new Date(r.due)<=new Date()&&new Date(r.due)>new Date(Date.now()-864e5)).forEach(r=>{shown.add(r.k);swReg().then(reg=>reg?reg.showNotification("⏰ Reminder",{body:r.t,tag:r.k,data:{url:remUrl(r)}}):new Notification("⏰ Reminder",{body:r.t,tag:r.k}))})}catch(e){}},30000);
// ---- install as an app (PWA) -----------------------------------------------------
let installPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;if(view=="more"&&!st().s)render()});
window.addEventListener("appinstalled",()=>{installPrompt=null;toast("Property Tracker is installed");if(view=="more"&&!st().s)render()});
const isInstalled=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true||!!LN();
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent);
async function installApp(){if(!installPrompt)return;installPrompt.prompt();const r=await installPrompt.userChoice.catch(()=>({}));installPrompt=null;if(r.outcome!="accepted")toast("Install cancelled");render()}
function installCard(){if(isInstalled())return "";
 let body;
 if(installPrompt)body=`<div>Install Property Tracker on this device. It opens full screen with its own icon, like a regular app.</div><button class="btn p" style="margin-top:10px;width:100%" onclick="installApp()">${ic("download",18)} Install app</button>`;
 else if(!window.isSecureContext)body=`<div>Installing needs a secure page. This one is opened over <b>http://${esc(location.host)}</b>, so the browser only offers a shortcut.</div>
  <ol class="steps"><li><b>Android app (APK)</b>: works on a local http:// address, with GPS and alarms.</li><li>Open the site over <b>https://</b> (for example Frappe Cloud or your own domain).</li><li>For testing in Chrome: open <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>, add <code>${esc(location.origin)}</code>, relaunch, then come back here.</li></ol>
  <div class="mut">Meanwhile, Chrome's menu → <b>Add to Home screen → Create shortcut</b> puts an icon on your home screen (it opens in Chrome).</div>`;
 else if(isIOS())body=`<div>In Safari, tap <b>Share</b> → <b>Add to Home Screen</b>.</div>`;
 else body=`<div>Use the browser menu → <b>Install app</b> (or <b>Add to Home screen</b>). If you don't see it, reload this page once.</div>`;
 return `<h2>Install app</h2><section class="card">${body}</section>`}
function more(){const thm=getTheme(),p=prof,mine=db.props.filter(x=>x.by==p.user).length,openRem=db.rem.filter(r=>!r.done).length;
 return head("Account")+`<section class="card"><div class="profile">${avatar(64)}<div style="min-width:0"><h3 class="ell">${esc(p.full_name||"…")}</h3><div class="mut ell">${esc(p.email||"")}</div><div class="roles">${(p.roles||[]).map(r=>`<span class="role">${esc(r)}</span>`).join("")}</div></div></div>
 <div class="pstats"><div><b>${p.added??mine}</b><span>Added by you</span></div><div><b>${db.props.length}</b><span>All properties</span></div><div><b>${openRem}</b><span>Open reminders</span></div></div>
 <div class="mut" style="margin-top:12px">${p.last_login?`Last sign-in ${dt(p.last_login)}`:""}${p.member_since?` · Member since ${new Date(p.member_since).toLocaleDateString([],{month:"short",year:"numeric"})}`:""}</div>
 <div class="list" style="margin-top:8px">${p.desk?`<a href="/app/property">${ic("ext",18)} Open in Desk</a><a href="/app/user/${encodeURIComponent(p.user||"")}">${ic("gear",18)} Profile & password</a>`:`<a href="/update-password">${ic("gear",18)} Change password</a>`}<button onclick="openS({t:'w'})">${ic("info",18)} What's new <span class="mut" style="margin-left:auto">v${esc(window.pt_version||"")}</span></button><button class="d" onclick="logout()">${ic("logout",18)} Log out</button></div></section>
 ${failedCard()}${installCard()}
 <h2>Appearance</h2><div class="seg" role="group" aria-label="Theme"><button class="${thm=='light'?'on':''}" onclick="setTheme('light')">${ic("sun",16)} Light</button><button class="${thm=='dark'?'on':''}" onclick="setTheme('dark')">${ic("moon",16)} Dark</button><button class="${thm=='auto'?'on':''}" onclick="setTheme('auto')">${ic("monitor",16)} System</button></div>
 <h2>Data</h2><section class="card"><div class="mut">${ic("info",14)} ${esc(sync)}. Data is stored on your Frappe site and shared with your team.</div>
 <div class="list" style="margin-top:6px"><button onclick="load()">${ic("refresh",18)} Refresh</button><button onclick="csv()">${ic("download",18)} Export CSV (Excel)</button><button onclick="bak()">${ic("download",18)} Backup JSON</button><label>${ic("upload",18)} Import backup<input type="file" accept=".json" hidden onchange="rest(this)"></label></div></section>
 <h2>Status colours</h2><div class="card" style="display:flex;gap:6px;flex-wrap:wrap">${ST.map(pill).join("")}</div>`}
async function logout(){if(!confirm("Log out of Property Tracker?"))return;try{await fetch("/api/method/logout",{method:"POST",credentials:"same-origin",headers:{"X-Frappe-CSRF-Token":window.csrf_token||""}})}catch(e){}location.href="/login?redirect-to=/property-tracker"}
function setTheme(t){try{localStorage.setItem("theme",t)}catch(e){}if(t==="auto")document.documentElement.removeAttribute("data-theme");else document.documentElement.setAttribute("data-theme",t);render()}
function dl(n,t,m){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([t],{type:m}));a.download=n;a.click()}
function bak(){dl("backup.json",JSON.stringify(db),"application/json")}
function rest(i){const f=i.files[0];if(!f)return;i.value="";f.text().then(async t=>{let d;try{d=JSON.parse(t)}catch(e){return alert("Invalid file")}
 if(!confirm(`Import ${(d.props||[]).length} properties and ${(d.rem||[]).length} reminders as new records?`))return;
 const r=await api("import_backup",{data:d});toast(`Imported ${r.properties} properties and ${r.reminders} reminders`);load()})}
function csv(){const h=["ID","Name","Type","Address / Landmark","Locality","District","Status","Area","Unit","Length (ft)","Width (ft)","Road width (ft)","Facing","Owner","Phone","Source","Broker","Broker phone","Commission","Assigned to","Measured area (sq.ft)","Docs verified","Price","PriceUnit","TotalPrice","PerCent","PerSqft","Lat","Lng","Map","Notes"];
 const r=db.props.map(p=>[p.id,p.name,p.type,p.addr,p.locality,p.district,p.status,p.area,p.unit,p.len,p.wid,p.road,p.facing,p.owner,p.phone,p.source,p.broker,p.bphone,p.comm,p.assign,p.barea?Math.round(p.barea):"",(p.docs||[]).filter(d=>d.status=="Verified").length,p.price,p.punit,Math.round(total(p)),Math.round(pc(p)),Math.round(psf(p)),p.lat,p.lng,gm(p),p.notes]);
 dl("properties.csv","﻿"+[h,...r].map(a=>a.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n"),"text/csv")}
function compare(){if(cmp.length<2)return alert("Select 2–5 properties");openS({t:"c"})}
function drawCompare(){const ps=cmp.map(P).filter(Boolean);
 const rows=[["Name",p=>p.name],["Address / Landmark",p=>p.addr],["Location",p=>p.locality],["Type",p=>p.type],["Area",p=>areaTxt(p)],["Length (ft)",p=>p.len],["Width (ft)",p=>p.wid],["Road width (ft)",p=>p.road],["Facing",p=>p.facing],["Price",p=>inr(total(p))],["Per cent",p=>inr(pc(p))],["Per sq.ft",p=>inr(psf(p))],["Owner",p=>p.owner],["Source",p=>p.source],["Broker",p=>p.broker],["Measured area",p=>p.barea?`${fmt(p.barea/435.6)} cent`:""],["Docs verified",p=>`${(p.docs||[]).filter(d=>d.status=="Verified").length}/8`],["Negotiated",p=>p.neg?inr(p.neg):""],["Rating",p=>p.rating?"★".repeat(p.rating):""],["Status",p=>p.status],["Notes",p=>p.notes]];
 sheet(sheetHead("Compare",`${ps.length} properties`)+`<div class="scroll"><table><tr><th></th>${ps.map(p=>`<th>${p.id}</th>`).join("")}</tr>${rows.map(([l,f])=>{const v=ps.map(f),d=new Set(v.map(String)).size>1;return `<tr><td>${l}</td>${v.map(x=>`<td class="${d?"diff":""}">${esc(x)}</td>`).join("")}</tr>`}).join("")}</table></div><p class="mut">Highlighted rows differ between properties.</p>`)}
function sheet(h){$("sh").innerHTML=`<div class="sheet"><div class="in">${h}</div></div>`}
let draft;
function propForm(p){p=p||{};const V=k=>esc(p[k]??"");
 return `<section class="card fs"><h3>${ic("pin",18)} Location</h3>
 <div id="gps" class="gps mut">${p.id?`Saved: ${p.lat||"—"}, ${p.lng||"—"}`:"Getting GPS…"}</div>
 <div class="pmapwrap"><div id="pmap" class="pmap"></div></div><div class="mut" style="margin:6px 0 2px">Drag the pin or tap the map to adjust the position.</div>${layerSeg()}
 <div class="row"><div><label for="lat">Latitude</label><input id="lat" type="number" step="any" inputmode="decimal" value="${V("lat")}" oninput="stopGps();typedLL()"></div><div><label for="lng">Longitude</label><input id="lng" type="number" step="any" inputmode="decimal" value="${V("lng")}" oninput="stopGps();typedLL()"></div></div>
 <button class="btn sm" type="button" style="margin-top:10px" onclick="gps()">${ic("gps",16)} ${p.id?"Capture GPS here":"Recapture GPS"}</button>
 <label for="addr">Address / Landmark</label><textarea id="addr" rows="2" placeholder="Door no., street, near temple / school / bus stop…">${V("addr")}</textarea>
 <div class="row"><div><label for="loc">Locality / village</label><input id="loc" value="${V("locality")}"></div><div><label for="dist">District</label><input id="dist" value="${V("district")}"></div></div></section>
 <section class="card fs"><h3>${ic("home",18)} Basics</h3><label for="stitle">Site title / name</label><input id="stitle" value="${V("name")}" placeholder="e.g. Anna Nagar corner plot"><label for="type">Property type</label><select id="type">${opts(TYPES,p.type)}</select></section>
 <section class="card fs"><h3>${ic("camera",18)} Photos & videos</h3><div id="pv" class="ph2"></div><div class="mut" style="margin-top:6px">Videos up to ${MAX_VIDEO_MB} MB each. They upload after you save (needs a connection).</div></section>
 <section class="card fs"><h3>${ic("ruler",18)} Size</h3>
 <div class="row"><div><label for="len">Length (ft)</label><input id="len" type="number" step="any" inputmode="decimal" value="${V("len")}" oninput="sizeHint()"></div><div><label for="wid">Width (ft)</label><input id="wid" type="number" step="any" inputmode="decimal" value="${V("wid")}" oninput="sizeHint()"></div><div><label for="road">Road width (ft)</label><input id="road" type="number" step="any" inputmode="decimal" value="${V("road")}"></div></div>
 <div class="row"><div><label for="area">Area</label><input id="area" type="number" step="any" inputmode="decimal" value="${V("area")}" placeholder="Auto from L × W" oninput="sizeHint()"></div><div><label for="unit">Unit</label><select id="unit" onchange="sizeHint()">${opts(Object.keys(U),p.unit||"Sq.ft")}</select></div></div>
 <div id="szh" class="hint"></div>
 <label for="face">Facing</label><select id="face"><option value="">—</option>${opts(FACES,p.facing)}</select></section>
 <section class="card fs"><h3>${ic("user",18)} Owner</h3><div class="row"><div><label for="own">Owner name</label><input id="own" value="${V("owner")}" autocomplete="off"></div><div><label for="tel">Phone</label><input id="tel" type="tel" inputmode="tel" value="${V("phone")}"></div></div></section>
 ${formExtra(p)}
 <section class="card fs"><h3>${ic("rupee",18)} Price</h3><div class="row"><div><label for="pr">Expected price (₹)</label><input id="pr" type="number" step="any" inputmode="decimal" value="${V("price")}" oninput="sizeHint()"></div><div><label for="pu">Price unit</label><select id="pu" onchange="sizeHint()">${opts(PUNITS,p.punit||"Total")}</select></div></div></section>
 <section class="card fs"><h3>${ic("note",18)} Notes</h3><textarea id="nt" rows="3" placeholder="Water, EB, approvals, neighbourhood…">${V("notes")}</textarea></section>`}
function formVals(){const v=i=>(($(i)||{}).value||"").trim();return {name:v("stitle"),type:v("type"),addr:v("addr"),locality:v("loc"),district:v("dist"),lat:v("lat"),lng:v("lng"),area:v("area"),unit:v("unit"),len:v("len"),wid:v("wid"),road:v("road"),facing:v("face"),owner:v("own"),phone:v("tel"),price:v("pr"),punit:v("pu"),notes:v("nt"),source:v("src"),broker:v("brk"),bphone:v("bph"),comm:v("cmm"),assign:v("asn"),...(draft.lsrc!==undefined?{acc:draft.acc,lsrc:draft.lsrc}:{}),photos:draft.photos}}
// Live summary: area from length × width (feet), conversions and the total price.
function sizeHint(){const e=$("szh");if(!e)return;const f=formVals(),x={...f,len:+f.len||0,wid:+f.wid||0,price:+f.price||0};
 const auto=!(+f.area)&&x.len&&x.wid;x.area=+f.area||(auto?x.len*x.wid/(U[f.unit]||1):0);const s=sqft(x);
 e.innerHTML=s?`${auto?`${fmt(x.len)} × ${fmt(x.wid)} ft = `:""}<b>${fmt(Math.round(s))} sq.ft</b> · ${fmt(s/435.6)} cent${s>=43560?` · ${fmt(s/43560)} acre`:""}${total(x)?` · total <b>${inr(total(x))}</b>`:""}`:""}
function drawPh(){const e=$("pv");if(!e)return;e.innerHTML=draft.photos.map((x,i)=>`<div class="phw"><img src="${esc(x.d)}" alt=""><button type="button" class="phx" onclick="rmPh(${i})" aria-label="Remove photo">×</button><input class="cap" value="${esc(x.c||"")}" placeholder="Caption" aria-label="Photo caption" oninput="draft.photos[${i}].c=this.value"></div>`).join("")+(draft.oldVids||[]).map(v=>`<div class="phw"><div class="vtile">${ic("video",26)}<small>${v.mb?v.mb+" MB":"video"}</small></div><div class="cap ro" title="Manage on the property page">${esc(v.c||"Saved video")}</div></div>`).join("")
 +(draft.vids||[]).map((v,i)=>`<div class="phw"><div class="vtile new">${ic("video",26)}<small>${(v.file.size/1048576).toFixed(1)} MB</small></div><button type="button" class="phx" onclick="rmVid(${i})" aria-label="Remove video">×</button><input class="cap" value="${esc(v.c)}" placeholder="Caption" aria-label="Video caption" oninput="draft.vids[${i}].c=this.value"></div>`).join("")
 +`<label class="addph">${ic("camera",24)}<span>Add photo</span><input id="ph" type="file" accept="image/*" capture="environment" multiple hidden onchange="photos(this)"></label>`
 +`<label class="addph">${ic("video",24)}<span>Add video</span><input id="vf" type="file" accept="video/*" multiple hidden onchange="pickVideos(this)"></label>`}
// videos chosen in the form wait here and upload once the property is saved
function pickVideos(input){const fs=[...input.files];input.value="";draft.vids=draft.vids||[];
 for(const f of fs){if(!/^video\//.test(f.type)&&!/\.(mp4|mov|webm|3gpp?|m4v|mkv|avi)$/i.test(f.name)){toast(`${f.name} is not a video`);continue}
  const mb=f.size/1048576;if(mb>MAX_VIDEO_MB){alert(`${f.name} is ${mb.toFixed(1)} MB. The limit is ${MAX_VIDEO_MB} MB.\n\nRecord a shorter clip, use 720p, or trim it first.`);continue}
  draft.vids.push({file:f,c:""})}drawPh()}
function rmVid(i){draft.vids.splice(i,1);drawPh()}
async function uploadDraftVideos(id,vids){if(!vids||!vids.length)return;
 if(isTmp(id)||isOffline){toast("Saved without the videos: videos need a connection. Add them from the property page when you're online.");return}
 const e=$("net"),show=t=>{if(e){e.hidden=false;e.className="net sync";e.innerHTML=`${ic("upload",15)} ${t}`}};let ok=0;
 for(let i=0;i<vids.length;i++){const v=vids[i],mb=(v.file.size/1048576).toFixed(1);
  try{const url=await uploadWithProgress(v.file,id,f=>show(`Uploading video ${i+1} of ${vids.length} · ${Math.round(f*100)}% of ${mb} MB`));show(`Saving video ${i+1} of ${vids.length}…`);
   put(await api("add_video",{name:id,file_url:url,caption:v.c.trim()},true));ok++}
  catch(err){toast(`Video ${i+1} not uploaded: ${err.message}`)}}
 netBanner();if(ok)toast(`${ok} video${ok>1?"s":""} uploaded`);const s=st().s;if(s&&s.id==id&&s.t=="d")redraw()}
function rmPh(i){draft.photos.splice(i,1);drawPh()}
function edit(){openS({t:"a"})}
function drawAdd(){draft={photos:[],lat:"",lng:"",vids:[]};
 sheet(sheetHead("Add property","GPS is captured automatically")+propForm()+`<div class="savebar"><button class="btn" onclick="closeS()">Cancel</button><button class="btn p" onclick="saveP()">Save property</button></div>`);drawPh();sizeHint();pickMap();gps()}
function photos(i){[...i.files].forEach(f=>{const im=new Image(),u=URL.createObjectURL(f);im.onload=()=>{const s=Math.min(1,800/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=im.width*s;c.height=im.height*s;c.getContext("2d").drawImage(im,0,0,c.width,c.height);draft.photos.push({d:c.toDataURL("image/jpeg",.6),at:f.lastModified?new Date(f.lastModified).toISOString():now()});URL.revokeObjectURL(u);drawPh()};im.src=u})}
function llOk(){const f=formVals();if(!f.lat&&!f.lng)return true;
 if(hasLoc(f)&&f.lsrc=="GPS"&&+f.acc>OK&&!confirm(`The location is only accurate to ${accTxt(+f.acc)}, so the pin may be far from the real site.\n\nSave anyway? (Cancel to try GPS again or place the pin on the map.)`))return false;
 if((+f.lat==0&&+f.lng==0)||hasLoc(f))return true;toast("Location is not valid: latitude must be −90…90 and longitude −180…180. Capture GPS or move the pin.");return false}
async function saveP(){if(busy)return;stopGps();if(!llOk())return;const vids=draft.vids||[];const r=put(await write("save_property",{data:{...formVals(),status:"Visited"}}));if(!outbox.length&&!vids.length)toast("Property saved");closeS();uploadDraftVideos(r.id,vids)}
function editP(id){if(P(id))openS({t:"e",id})}
function drawEdit(id){const p=P(id);if(!p)return;draft={photos:[...p.photos],lat:p.lat,lng:p.lng,vids:[],oldVids:p.videos||[]};
 sheet(sheetHead(`Edit ${p.id}`,esc(p.name||""))+propForm(p)+`<div class="savebar"><button class="btn" onclick="history.back()">Cancel</button><button class="btn p" onclick="saveEdit('${id}')">Save changes</button></div>`);drawPh();sizeHint();pickMap();if(!hasLoc(p))gps();else{const e=$("gps");if(e)e.innerHTML=`${ic("pin",16)} Saved location${p.acc?` · ${accTxt(+p.acc)}`:""}${p.lsrc?` · ${esc(p.lsrc)}`:""}. Tap <b>Capture GPS here</b> to replace it.`}}
async function saveEdit(id){if(busy||!P(id))return;stopGps();if(!llOk())return;const vids=draft.vids||[];put(await write("save_property",{name:id,data:formVals()}));if(!outbox.length&&!vids.length)toast("Changes saved");history.back();uploadDraftVideos(id,vids)}
function detail(id){if(P(id))openS({t:"d",id})}
// ---- videos (up to 20 MB each; online only) ----------------------------------------------
const MAX_VIDEO_MB=20;
function videoSection(p){const vs=p.videos||[];
 return `<div class="sechead"><h2>Videos (${vs.length})</h2></div><section class="card">${vs.map(v=>`<div class="vid"><video src="${esc(v.d)}" controls preload="metadata" playsinline></video>
  <div class="vmeta"><input class="cap" value="${esc(v.c)}" placeholder="Caption" aria-label="Video caption" onchange="videoCaption('${p.id}',${v.i},this.value)"><span class="mut">${v.mb?`${v.mb} MB · `:""}${dt(v.at)}</span><button class="iconbtn sm" onclick="videoRemove('${p.id}',${v.i})" aria-label="Delete video">${ic("trash",15)}</button></div></div>`).join("")}
  <div id="vup" class="vup" hidden><div class="bar"><i id="vbar"></i></div><span id="vpct" class="mut"></span></div>
  <label class="btn" style="margin-top:${vs.length?10:0}px">${ic("camera",16)} Add video<input type="file" accept="video/*" hidden onchange="videoAdd('${p.id}',this)"></label>
  <div class="mut" style="margin-top:6px">Up to ${MAX_VIDEO_MB} MB each, which is about 30–40 seconds at 720p. Record short clips or trim long ones first.</div></section>`}
function uploadWithProgress(file,id,onp){return new Promise((res,rej)=>{if(isOffline||!navigator.onLine)return rej(new Error("You're offline. Add videos when you're back online."));
 const f=new FormData();f.append("file",file,file.name||"video.mp4");f.append("is_private","1");f.append("doctype","Property");f.append("docname",id);f.append("folder","Home/Attachments");f.append("optimize","0");
 const x=new XMLHttpRequest();x.open("POST","/api/method/upload_file");x.setRequestHeader("X-Frappe-CSRF-Token",window.csrf_token||"");x.setRequestHeader("Accept","application/json");
 x.upload.onprogress=e=>{if(e.lengthComputable)onp(e.loaded/e.total)};x.onerror=()=>rej(new Error("Upload failed. Check the connection and try again."));
 x.onload=()=>{let j={};try{j=JSON.parse(x.responseText)}catch(e){}if(x.status>=200&&x.status<300&&j.message)res(j.message.file_url);else rej(new Error(x.status==413?`The file is too large for the server. Ask the admin to raise the upload limit (Frappe "Max File Size").`:serverErr(x.status,j)||"Upload failed"))};x.send(f)})}
async function videoAdd(id,input){const file=input.files[0];input.value="";if(!file)return;
 if(!/^video\//.test(file.type)&&!/\.(mp4|mov|webm|3gpp?|m4v|mkv|avi)$/i.test(file.name))return toast("That file is not a video");
 const mb=file.size/1048576;if(mb>MAX_VIDEO_MB)return alert(`This video is ${mb.toFixed(1)} MB. The limit is ${MAX_VIDEO_MB} MB.\n\nRecord a shorter clip, use a lower camera resolution (720p), or trim it first.`);
 const box=$("vup"),bar=$("vbar"),pct=$("vpct");if(box)box.hidden=false;
 try{const url=await uploadWithProgress(file,id,f=>{if(bar)bar.style.width=Math.round(f*100)+"%";if(pct)pct.textContent=`Uploading ${Math.round(f*100)}% of ${mb.toFixed(1)} MB…`});
  if(pct)pct.textContent="Saving…";put(await api("add_video",{name:id,file_url:url}));toast("Video added");redraw()}
 catch(e){toast(e.message);if(box)box.hidden=true}}
async function videoCaption(id,row,c){put(await api("update_video",{name:id,row,caption:c.trim()}));toast("Caption saved")}
async function videoRemove(id,row){if(!confirm("Delete this video?"))return;put(await api("remove_video",{name:id,row}));redraw()}
// ---- What's new: shown once per phone after each update; Account → What's new reopens it -------
// [icon, title, text, optional "Show me" action]
const RELEASES=[
 {v:"1.2.0",date:"November 2026",title:"Videos and accurate GPS",items:[
  ["video","Videos","Attach videos up to 20 MB next to photos, or on the property page. They play right in the app.","edit()"],
  ["gps","Accurate GPS","The app waits for a real GPS fix, shows how accurate it is, and warns you before saving an approximate location. If your phone only gives an approximate location, it tells you which setting to turn on.",""],
  ["pin","Place the pin yourself","Tap Place pin on map to put the location exactly on the plot using the satellite view.",""]]},
 {v:"1.1.0",date:"November 2026",title:"Work at the site",items:[
  ["upload","Works offline","No signal at the site? Keep saving properties, photos, visits and reminders. Everything uploads by itself when you're back online.",""],
  ["ruler","Plot boundary","Draw the plot on the satellite map, or walk the corners with GPS, and get the measured area in cents, sq.ft and acres.",""],
  ["note","Documents checklist","Track EC, Patta / Chitta, FMB sketch, sale deed and approvals, each with a status and an attached photo or PDF.",""],
  ["rupee","Price history","The asking price is recorded automatically, and you can add offers, counters and the final price.",""],
  ["user","Team","Assign properties, filter to Mine, and comment with @mentions to notify colleagues.","nav('list')"],
  ["image","Share card and brochure","Share a picture card on WhatsApp or print a brochure. Owner details are never included.",""],
  ["bell","Reminder alarms","Alarms on the phone and push notifications when a reminder is due. Clear done reminders in one tap.","nav('rem')"],
  ["map","Better maps","Satellite and terrain views, Street View links, your position and the distance to each property.","nav('map')"],
  ["list","Reports","A Property Tracker workspace in Desk with charts and a weekly visits report.","window.open('/app/property-tracker','_blank')"]]},
 {v:"1.0.0",date:"November 2026",title:"Property Tracker on Frappe",items:[
  ["home","Your data on the server","Properties, visits and reminders are saved on your Frappe site and shared with your team, not just on one phone.",""],
  ["download","Install on your phone","Install it as an app from the browser, or use the Android app.","nav('more')"]]}];
const seenKey=()=>`pt_seen_version:${window.pt_user||""}`;
function maybeWhatsNew(){const v=window.pt_version;if(!v||!RELEASES.some(r=>r.v==v))return;let seen=null;try{seen=localStorage.getItem(seenKey())}catch(e){}
 if(seen==v||st().s||startHash)return;try{localStorage.setItem(seenKey(),v)}catch(e){}openS({t:"w"})}
function drawWhatsNew(){const cur=RELEASES.find(r=>r.v==window.pt_version)||RELEASES[0],older=RELEASES.filter(r=>r!==cur);
 const card=([icn,t,txt,act])=>`<div class="wn"><span class="wni">${ic(icn,22)}</span><div><b>${t}</b><p>${txt}</p>${act?`<button class="linkchip" onclick="closeS();setTimeout(()=>{${act}},120)">Show me</button>`:""}</div></div>`;
 sheet(sheetHead("What's new",`Version ${cur.v} · ${cur.date}`)+`<div class="wnhero">${ic("info",18)} <b>${cur.title}</b></div><section class="card">${cur.items.map(card).join("")}</section>
 ${older.map(r=>`<details class="wnold"><summary>Version ${r.v} · ${r.title}</summary><section class="card">${r.items.map(card).join("")}</section></details>`).join("")}
 <div class="savebar"><button class="btn p" onclick="closeS()">Got it</button></div>`)}
// ---- property page ------------------------------------------------------------------
const DOC_TYPES=["EC (Encumbrance Certificate)","Patta / Chitta","FMB Sketch","Sale Deed","Parent Documents","Approval (DTCP / CMDA)","Tax Receipt","EB / Water"];
const DOC_COL={Pending:"#8a948f",Received:"#2b6cb0",Verified:"#1f7a4d",Issue:"#c0392b"};
const PRICE_KINDS=["Asking","Offered","Counter","Negotiated","Final"];
const SOURCES=["Direct Owner","Broker","Online Listing","Referral","Newspaper / Board","Other"];
let team=[];
const who=u=>{const t=team.find(x=>x.user==u);return t?t.name:(u==prof.user?(prof.full_name||u):u||"")};
const telBtns=(ph)=>ph?`<a class="btn sm" href="tel:${esc(ph)}">${ic("phone",14)} Call</a><a class="btn sm" href="https://wa.me/${esc(ph.replace(/\D/g,""))}" target="_blank" rel="noopener">${ic("chat",14)} WhatsApp</a>`:"";
function drawDetail(id){const p=P(id);if(!p)return;const ph=p.photos||[];
 const fact=(l,v,s="")=>`<div><span>${l}</span><b>${v||"—"}</b>${s?`<small>${s}</small>`:""}</div>`;
 const act=(icn,l,on)=>`<button class="act" onclick="${on}">${ic(icn)}${l}</button>`;
 const docsDone=(p.docs||[]).filter(d=>d.status=="Verified"||d.status=="Received").length;
 sheet(sheetHead(`<span class="pid">${p.id}</span> ${esc(p.name||"")}`,esc([p.type,p.locality].filter(Boolean).join(" · ")),`<button class="iconbtn" onclick="editP('${id}')" aria-label="Edit">${ic("edit")}</button>`)
 +(p._local||p._pending?`<div class="card pending">${ic("upload",16)} ${p._local?"Saved on this phone.":"Changes saved on this phone."} ${isOffline?"They will upload when you're back online.":"Uploading…"}</div>`:"")
 +(ph.length?`<div class="gallery">${ph.map((x,i)=>`<figure class="${ph.length==1?"one":""}" onclick="viewPh('${id}',${i})"><img src="${esc(x.d)}" alt="${esc(x.c||"")}" loading="lazy">${x.c?`<figcaption>${esc(x.c)}</figcaption>`:""}</figure>`).join("")}</div>`:`<div class="hero-ph">${ic("image",40)}</div>`)
 +`<div class="meta">${pill(p.status)}<span class="mut">Added ${dt(p.created)}</span>${p.rating?`<span class="mut">· ${"★".repeat(p.rating)}</span>`:""}${p.assign?`<span class="chip sm">${ic("user",12)} ${esc(who(p.assign))}</span>`:""}</div>
 ${p.addr?`<div class="addr">${ic("pin",16)}<span>${esc(p.addr)}${p.locality?`, ${esc(p.locality)}`:""}${p.district?`, ${esc(p.district)}`:""}</span></div>`:""}
 <div class="actions">${hasLoc(p)?act("map","Maps",`window.open('${gm(p)}','_blank')`)+act("user","Street View",`window.open('${svUrl(p)}','_blank')`)+act("go","Navigate",`window.open('${navUrl(p)}','_blank')`):""}${p.phone?act("phone","Call",`window.location.href='tel:${esc(p.phone)}'`)+act("chat","WhatsApp",`window.open('https://wa.me/${esc(p.phone.replace(/\D/g,""))}','_blank')`):""}${act("image","Share card",`shareCard('${id}')`)}${p._local?"":act("note","Brochure",`window.open('/property-brochure?name=${encodeURIComponent(id)}','_blank')`)}${act("share","Share text",`share('${id}')`)}</div>
 ${hasLoc(p)?`<div class="card mapcard minimap"><div id="dmap"></div></div><div class="row tight" style="margin-top:8px;align-items:center"><div style="flex:1"><div id="ddist" class="mut">${distTo(p)!=null?`${ic("go",14)} <b>${kmTxt(distTo(p))}</b> from you`:""}</div>${p.lsrc||p.acc?`<div class="mut ${+p.acc>OK?"overdue":""}">${ic("gps",13)} ${esc(p.lsrc||"GPS")}${p.acc?` · ${accTxt(+p.acc)}`:""}${+p.acc>OK?" · approximate, check the pin":""}</div>`:""}</div>${p._local?"":`<button class="btn sm" onclick="openS({t:'b',id:'${id}'})">${ic("ruler",15)} ${p.boundary?"Edit":"Draw"} boundary</button>`}</div>${layerSeg()}`:(p.lat!==""&&p.lat!=null?`<div class="card" style="border-color:var(--danger)">${ic("info",14)} The saved location (${esc(p.lat)}, ${esc(p.lng)}) is not valid. Tap <b>Edit</b> and capture GPS again.</div>`:"")}
 <div class="facts" style="margin-top:12px">${fact("Area",areaTxt(p),sqft(p)?`${fmt(Math.round(sqft(p)))} sq.ft · ${fmt(sqft(p)/435.6)} cent`:"")}${fact("Length × width",dims(p))}${fact("Road width",p.road?`${fmt(p.road)} ft`:"")}${fact("Facing",esc(p.facing))}${fact("Price",inr(total(p)),p.price&&p.punit!="Total"?`${inr(p.price)} ${(p.punit||"").toLowerCase()}`:"")}${fact("Per cent",inr(pc(p)),psf(p)?`${inr(psf(p))} per sq.ft`:"")}${p.barea?fact("Measured (boundary)",`${fmt(p.barea/435.6)} cent`,`${fmt(Math.round(p.barea))} sq.ft · ${fmt(p.barea/43560)} acre`):""}</div>
 ${p.barea&&!p._local?`<button class="btn sm" style="margin-top:8px" onclick="useMeasured('${id}')">${ic("ruler",14)} Use measured area as the area</button>`:""}
 ${p.owner||p.phone?`<h2>Owner</h2><div class="card"><b>${esc(p.owner||"—")}</b>${p.phone?` <span class="mut">· ${esc(p.phone)}</span>`:""}</div>`:""}
 ${p.source||p.broker?`<h2>Source & broker</h2><div class="card">${p.source?`<div class="mut">Source: <b style="color:var(--ink)">${esc(p.source)}</b></div>`:""}${p.broker||p.bphone?`<div style="margin-top:6px"><b>${esc(p.broker||"Broker")}</b>${p.bphone?` <span class="mut">· ${esc(p.bphone)}</span>`:""}${p.comm?` <span class="mut">· commission ${esc(p.comm)}</span>`:""}</div><div class="row tight wrap" style="margin-top:8px;gap:8px">${telBtns(p.bphone)}</div>`:""}</div>`:""}
 ${p.notes?`<h2>Notes</h2><div class="card" style="white-space:pre-wrap">${esc(p.notes)}</div>`:""}
 ${p._local?"":videoSection(p)}
 ${p._local?"":`<h2>Team</h2><section class="card"><label for="asg" style="margin-top:0">Assigned to</label><select id="asg" onchange="assignTo('${id}',this.value)"><option value="">— Not assigned —</option>${team.map(t=>`<option value="${esc(t.user)}" ${p.assign==t.user?"selected":""}>${esc(t.name)}${t.user==prof.user?" (you)":""}</option>`).join("")}</select></section>`}
 ${p._local?"":`<div class="sechead"><h2>Documents (${docsDone}/${DOC_TYPES.length})</h2></div><section class="card docs">${docRows(p)}</section>`}
 <div class="sechead"><h2>Price history</h2>${`<select id="rt2" class="mini" aria-label="Rating" onchange="deal('${id}')"><option value="">Rating —</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${p.rating==n?"selected":""}>${"★".repeat(n)}</option>`).join("")}</select>`}</div>
 <section class="card">${(p.prices||[]).length?`<ul class="tl prices">${[...p.prices].reverse().map(x=>`<li><time>${dt(x.at)}${x.by?` · ${esc(who(x.by))}`:""}</time><span class="kind k-${x.kind}">${x.kind}</span> <b>${inr(x.amount)}</b>${x.note?` <span class="mut">· ${esc(x.note)}</span>`:""}</li>`).join("")}</ul>`:`<div class="mut">No prices yet. The asking price is recorded automatically.</div>`}
 ${`<div class="row" style="margin-top:12px"><select id="pk" aria-label="Type">${opts(PRICE_KINDS,"Offered")}</select><input id="pa" type="number" inputmode="decimal" placeholder="Amount ₹"></div><div class="row" style="margin-top:8px"><input id="pn" placeholder="Note (optional)"><button class="btn p" style="flex:none" onclick="addPrice('${id}')">Add</button></div>`}</section>
 <h2>Status</h2><section class="card"><div class="row"><select id="ns" aria-label="New status">${opts(ST,p.status)}</select><button class="btn p" style="flex:none" onclick="setS('${id}')">Update</button></div><input id="sn" placeholder="Note (optional)" style="margin-top:8px">
 <ul class="tl">${[...p.history].reverse().map(h=>`<li><time>${dt(h.at)}</time>${h.from?`${esc(h.from)} → `:""}<b>${esc(h.to)}</b>${h.note?` · ${esc(h.note)}`:""}</li>`).join("")}</ul></section>
 <h2>Visits (${p.visits.length})</h2><section class="card"><textarea id="vn" rows="2" placeholder="What was discussed, new price, follow-up…"></textarea><button class="btn" style="margin-top:8px" onclick="visit('${id}')">${ic("plus",16)} Log visit</button>
 ${p.visits.length?`<ul class="tl">${[...p.visits].reverse().map(v=>`<li><time>${dt(v.at)}</time>${esc(v.note)}</li>`).join("")}</ul>`:""}</section>
 ${p._local?"":`<h2>Comments</h2><section class="card" id="cmts"><div class="mut">Loading…</div></section>`}
 <div class="danger"><button class="btn" onclick="editP('${id}')">${ic("edit",16)} Edit details</button><button class="btn d" onclick="delP('${id}')">${ic("trash",16)} Delete</button></div>`);
 setTimeout(()=>miniMap(p),0);if(!p._local)loadComments(id)}
async function useMeasured(id){const p=P(id);if(!p||!p.barea)return;const u=p.unit||"Cent";const v=Math.round(p.barea/(U[u]||1)*100)/100;
 if(!confirm(`Set the area to ${fmt(v)} ${u} (measured from the boundary)?`))return;put(await api("save_property",{name:id,data:{area:v,unit:u}}));redraw()}
async function assignTo(id,user){put(await api("assign",{name:id,user}));toast(user?`Assigned to ${who(user)}`:"Unassigned");redraw()}
async function addPrice(id){const a=+$("pa").value;if(!a)return toast("Enter an amount");put(await write("add_price",{name:id,kind:$("pk").value,amount:a,note:$("pn").value.trim()}));redraw()}

// documents checklist
function docRows(p){const ds=p.docs||[],rows=DOC_TYPES.map(t=>({t,d:ds.find(x=>x.type==t)})).concat(ds.filter(x=>x.type=="Other").map(d=>({t:"Other",d})));
 return rows.map(({t,d},n)=>{const st=d?d.status:"Pending",key=d?`r${d.i}`:`t${n}`;
  return `<div class="docrow" id="doc-${key}"><button class="docmain" onclick="docEdit('${p.id}','${key}')"><i class="dot" style="--c:${DOC_COL[st]}"></i><span class="dt">${esc(t=="Other"&&d&&d.note?d.note:t)}</span><span class="dstat" style="color:${DOC_COL[st]}">${st}</span></button>${d&&d.file?`<a class="iconbtn sm" href="${esc(d.file)}" target="_blank" rel="noopener" aria-label="Open file">${ic("ext",16)}</a>`:""}</div>`}).join("")
  +`<button class="btn sm" style="margin-top:10px" onclick="docEdit('${p.id}','new')">${ic("plus",14)} Other document</button>`}
function docEdit(id,key){const p=P(id);document.querySelectorAll(".docedit").forEach(e=>e.remove());const ds=p.docs||[];
 let d=null,t="Other";if(key[0]=="r")d=ds.find(x=>x.i==+key.slice(1)),t=d.type;else if(key[0]=="t")t=DOC_TYPES[+key.slice(1)]||"Other";
 const html=`<div class="docedit"><label>Status</label><div class="seg">${["Pending","Received","Verified","Issue"].map(s=>`<button type="button" class="${(d?d.status:"Pending")==s?"on":""}" onclick="this.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('on'));this.classList.add('on')">${s}</button>`).join("")}</div>
  <label>Note</label><input class="dnote" value="${esc(d?d.note:"")}" placeholder="${t=="Other"?"What document is this?":"Survey no., date, remarks…"}">
  <label>File (photo or PDF)</label><input class="dfile" type="file" accept="image/*,application/pdf">${d&&d.file?`<div class="mut">Current: <a href="${esc(d.file)}" target="_blank" rel="noopener">${esc(d.file.split("/").pop())}</a></div>`:""}
  <div class="row" style="margin-top:10px">${d?`<button class="btn d" onclick="docRemove('${id}',${d.i})">Remove</button>`:""}<button class="btn" onclick="this.closest('.docedit').remove()">Cancel</button><button class="btn p" onclick="docSave('${id}','${esc(t)}',${d?d.i:0},this)">Save</button></div></div>`;
 const anchor=key=="new"?document.querySelector(".docs > .btn"):$(`doc-${key}`);anchor.insertAdjacentHTML(key=="new"?"beforebegin":"afterend",html)}
async function uploadFile(file,id){if(!navigator.onLine)throw new Error("You're offline. Attach the file when you're back online.");
 const f=new FormData();f.append("file",file,file.name);f.append("is_private","1");f.append("doctype","Property");f.append("docname",id);f.append("folder","Home/Attachments");
 busy++;loadBar();try{const r=await fetch("/api/method/upload_file",{method:"POST",credentials:"same-origin",headers:{"X-Frappe-CSRF-Token":window.csrf_token||"",Accept:"application/json"},body:f});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(errMsg(j)||"Upload failed");return j.message.file_url}finally{busy--;loadBar()}}
async function docSave(id,type,row,btn){const box=btn.closest(".docedit"),status=box.querySelector(".seg .on").textContent,note=box.querySelector(".dnote").value.trim(),fi=box.querySelector(".dfile").files[0];
 if(type=="Other"&&!row&&!note)return toast("Say what the document is in the note");
 let file;try{if(fi){if(fi.size>15e6)return toast("File is larger than 15 MB");file=await uploadFile(fi,id)}}catch(e){return toast(e.message)}
 put(await api("set_document",{name:id,doc_type:type,status,note,...(file?{file}:{}),...(row?{row}:{})}));toast("Document saved");redraw()}
async function docRemove(id,row){if(!confirm("Remove this document from the checklist?"))return;put(await api("remove_document",{name:id,row}));redraw()}

// comments with @mentions
let mentionSel=new Set();
function cleanComment(html){const d=new DOMParser().parseFromString(`<div>${html||""}</div>`,"text/html"),out=[];
 const walk=n=>{for(const c of n.childNodes){if(c.nodeType==3)out.push(esc(c.textContent));else if(c.nodeType==1){if(c.classList.contains("mention"))out.push(`<b class="mention">${esc(c.textContent)}</b>`);else if(c.tagName=="BR")out.push("<br>");else{if(/^(P|DIV)$/.test(c.tagName)&&out.length)out.push("<br>");walk(c)}}}};walk(d.body);return out.join("")}
async function loadComments(id){const box=$("cmts");if(!box)return;let cs=[];try{cs=await api("get_comments",{name:id},true)}catch(e){box.innerHTML=`<div class="mut">Comments are not available offline.</div>`;return}
 if(!$("cmts")||st().s?.id!=id)return;mentionSel=new Set();
 box.innerHTML=(cs.length?`<ul class="cmts">${cs.map(c=>`<li><div class="chead"><b>${esc(c.who)}</b><time>${dt(c.at)}</time>${c.by==prof.user?`<button class="iconbtn sm" onclick="delComment('${id}','${c.k}')" aria-label="Delete comment">${ic("trash",14)}</button>`:""}</div><div>${cleanComment(c.html)}</div></li>`).join("")}</ul>`:`<div class="mut">No comments yet. Type @ to mention someone.</div>`)
  +`<div class="cbox"><textarea id="ctext" rows="2" placeholder="Write a comment… type @ to mention" oninput="mentionAuto(this)"></textarea><div id="mlist" class="mlist" hidden></div><button class="btn p" style="margin-top:8px" onclick="postComment('${id}')">Post comment</button></div>`}
function mentionAuto(t){const m=t.value.slice(0,t.selectionStart).match(/@([\w.]*)$/),box=$("mlist");if(!m){box.hidden=true;return}
 const q=m[1].toLowerCase(),hits=team.filter(x=>x.name.toLowerCase().includes(q)||x.user.toLowerCase().includes(q)).slice(0,6);
 if(!hits.length){box.hidden=true;return}box.hidden=false;box.innerHTML=hits.map(h=>`<button type="button" onmousedown="event.preventDefault()" onclick="mentionPick('${esc(h.user)}')">${esc(h.name)} <span class="mut">${esc(h.user)}</span></button>`).join("")}
function mentionPick(user){const t=$("ctext"),h=team.find(x=>x.user==user),pos=t.selectionStart,before=t.value.slice(0,pos).replace(/@([\w.]*)$/,`@${h.name} `);
 t.value=before+t.value.slice(pos);t.focus();t.selectionStart=t.selectionEnd=before.length;mentionSel.add(user);$("mlist").hidden=true}
async function postComment(id){const t=$("ctext"),text=t.value.trim();if(!text)return;const mentions=[...mentionSel].filter(u=>text.includes("@"+who(u)));
 await api("add_comment",{name:id,text,mentions});toast(mentions.length?`Comment posted · ${mentions.length} notified`:"Comment posted");loadComments(id)}
async function delComment(id,k){if(!confirm("Delete this comment?"))return;await api("delete_comment",{name:id,comment:k});loadComments(id)}

// full-screen photo viewer (swipe; double-tap to zoom)
function viewPh(id,i){openS({t:"v",id,i})}
function drawViewer(id,i){const p=P(id);if(!p)return;const ph=p.photos||[];
 $("sh").innerHTML=`<div class="viewer" role="dialog" aria-label="Photos"><div class="vtop"><button class="iconbtn" onclick="closeS()" aria-label="Close">${ic("back")}</button><span id="vcount">${i+1} / ${ph.length}</span></div>
  <div class="vtrack" id="vtrack">${ph.map(x=>`<div class="vslide"><div class="vzoom" ondblclick="vzoom(this,event)"><img src="${esc(x.d)}" alt="${esc(x.c||"")}"></div><div class="vcap">${x.c?`<b>${esc(x.c)}</b>`:""}${x.at?`<span>${dt(x.at)}</span>`:""}</div></div>`).join("")}</div></div>`;
 const tr=$("vtrack");tr.scrollLeft=i*tr.clientWidth;tr.onscroll=()=>{const n=Math.round(tr.scrollLeft/tr.clientWidth);const c=$("vcount");if(c)c.textContent=`${n+1} / ${ph.length}`};
 let last=0;tr.addEventListener("touchend",e=>{const t=Date.now();if(t-last<300){const z=e.target.closest(".vzoom");if(z)vzoom(z,e.changedTouches[0])}last=t})}
function vzoom(z,e){const on=z.classList.toggle("zoomed");if(on){const r=z.getBoundingClientRect(),fx=((e.clientX||r.width/2)-r.left)/r.width,fy=((e.clientY||r.height/2)-r.top)/r.height;requestAnimationFrame(()=>{z.scrollLeft=fx*z.scrollWidth-r.width/2;z.scrollTop=fy*z.scrollHeight-r.height/2})}}

// share card: an image with photo, facts and price (no owner details)
async function shareCard(id){const p=P(id);if(!p)return;toast("Preparing card…");const W=1080,H=1350,c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");
 g.fillStyle="#f4f3ef";g.fillRect(0,0,W,H);
 const img=p.photos&&p.photos[0]?await new Promise(r=>{const im=new Image();im.onload=()=>r(im);im.onerror=()=>r(null);im.src=p.photos[0].d}):null;
 if(img){const s=Math.max(W/img.width,640/img.height),w=img.width*s,h=img.height*s;g.drawImage(img,(W-w)/2,(640-h)/2,w,h)}else{g.fillStyle="#e3f1ea";g.fillRect(0,0,W,640);g.fillStyle="#1f6f50";g.font="bold 120px system-ui";g.textAlign="center";g.fillText("📍",W/2,360);g.textAlign="left"}
 g.fillStyle=col(p.status);g.beginPath();g.roundRect?g.roundRect(48,590,40+g.measureText(p.status).width*2.2,64,32):g.rect(48,590,300,64);g.fill();g.fillStyle="#fff";g.font="bold 34px system-ui";g.fillText(p.status,70,634);
 const wrap=(t,x,y,max,lh,font,color,lines=2)=>{g.font=font;g.fillStyle=color;const ws=String(t).split(" ");let line="",n=0;for(const w of ws){const tst=line?line+" "+w:w;if(g.measureText(tst).width>max&&line){g.fillText(line,x,y);y+=lh;line=w;if(++n>=lines-1){break}}else line=tst}g.fillText(line,x,y);return y+lh};
 let y=wrap(p.name||p.id,56,730,W-112,70,"bold 60px system-ui","#1b221f");
 y=wrap([p.addr,p.locality,p.district].filter(Boolean).join(", ")||p.type,56,y,W-112,48,"38px system-ui","#66706a");
 g.fillStyle="#1f6f50";g.font="bold 76px system-ui";g.fillText(inr(total(p)),56,y+60);y+=100;
 const facts=[["Area",areaTxt(p)||"—"],["Size",dims(p)||"—"],["Road",p.road?fmt(p.road)+" ft":"—"],["Facing",p.facing||"—"],["Per cent",pc(p)?inr(pc(p)):"—"],["Type",p.type||"—"]];
 facts.forEach(([l,v],k)=>{const x=56+(k%3)*330,yy=y+Math.floor(k/3)*120;g.fillStyle="#66706a";g.font="30px system-ui";g.fillText(l.toUpperCase(),x,yy);g.fillStyle="#1b221f";g.font="bold 40px system-ui";g.fillText(String(v).slice(0,16),x,yy+48)});
 g.fillStyle="#1f6f50";g.fillRect(0,H-110,W,110);g.fillStyle="#fff";g.font="bold 34px system-ui";g.fillText(`${prof.full_name||"Property Tracker"}${prof.phone?" · "+prof.phone:""}`,56,H-45);
 if(hasLoc(p)){g.font="28px system-ui";g.textAlign="right";g.fillText(`${(+p.lat).toFixed(5)}, ${(+p.lng).toFixed(5)}`,W-56,H-45);g.textAlign="left"}
 const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.9)),file=new File([blob],`${p.id}.jpg`,{type:"image/jpeg"});
 const text=`${p.name||p.id} · ${inr(total(p))}${hasLoc(p)?"\n"+gm(p):""}`;
 if(navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],text})}catch(e){}}
 else{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=file.name;a.click();toast("Card saved as an image")}}
async function setS(id){const p=P(id),to=$("ns").value;if(to!=p.status)put(await write("set_status",{name:id,status:to,note:$("sn").value}));redraw()}
async function deal(id){put(await write("update_deal",{name:id,rating:$("rt2").value}));if(!outbox.length)toast("Rating saved")}
async function delP(id){if(!confirm(`Delete ${id}?`))return;await api("delete_property",{name:id});db.props=db.props.filter(x=>x.id!=id);db.rem.forEach(r=>{if(r.p==id)r.p=""});cmp=cmp.filter(x=>x!=id);closeS()}
async function visit(id){const n=$("vn").value.trim();if(!n)return;put(await write("log_visit",{name:id,note:n}));redraw()}
function share(id){const p=P(id),t=`${p.name?p.name+" ("+p.id+")":p.id} · ${p.type}${p.locality?" · "+p.locality:""}${p.addr?"\n"+p.addr:""}\n${[areaTxt(p),dims(p),p.road?"road "+fmt(p.road)+" ft":"",p.facing?p.facing+" facing":""].filter(Boolean).join(", ")||"—"}\nPrice ${inr(total(p))} · ${p.status}${p.lat?"\n"+gm(p):""}${p.notes?"\n"+p.notes:""}`;navigator.share?navigator.share({text:t}).catch(()=>{}):navigator.clipboard?.writeText(t).then(()=>toast("Summary copied (owner details excluded)"))}
history.replaceState({v:"home",d:0},"",location.pathname);render();load();
