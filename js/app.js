/* =====================================================================
   Comparador de Preparación Profesional
   ---------------------------------------------------------------------
   Archivos del proyecto:
     index.html          estructura de la página
     css/estilos.css     estilos
     js/app.js           este archivo (toda la lógica)
     js/xlsx.full.min.js librería SheetJS para leer/escribir Excel
     usuarios.json       lista de usuarios (la genera el administrador)

     datos.json          clases publicadas, CIFRADAS (las genera el administrador)

   CÓMO FUNCIONA
   GitHub Pages solo sirve archivos: no hay servidor ni base de datos.
   - El administrador carga los Excel en su navegador, pone nombre a
     cada clase y la asigna a maestros/decanos.
   - Luego descarga usuarios.json y datos.json y los sube al repositorio.
   - Cada maestro/decano entra con su contraseña desde cualquier equipo
     y ve SOLO las clases que tiene asignadas.
   Cada clase va cifrada (AES-256) con una llave que solo se entrega a
   sus usuarios asignados y a los administradores (RSA-OAEP). La llave
   privada de cada usuario está cifrada con su contraseña (PBKDF2).
   Por eso, aunque el repositorio sea público, las notas no se pueden
   leer sin una contraseña autorizada. Usa contraseñas no triviales.
   El listado de estudiantes (ADM535) nunca se publica.
   ===================================================================== */

/* =====================================================================
   1. Utilidades
   ===================================================================== */
function sha256(ascii){
  function rr(v,a){ return (v>>>a)|(v<<(32-a)); }
  var maxWord=Math.pow(2,32), result="", words=[], bitLen=ascii.length*8, i, j;
  var hash=sha256.h=sha256.h||[], k=sha256.k=sha256.k||[], pc=k.length, isComp={};
  for(var cand=2; pc<64; cand++){
    if(!isComp[cand]){
      for(i=0;i<313;i+=cand) isComp[i]=cand;
      hash[pc]=(Math.pow(cand,.5)*maxWord)|0;
      k[pc++]=(Math.pow(cand,1/3)*maxWord)|0;
    }
  }
  ascii+="\x80";
  while(ascii.length%64-56) ascii+="\x00";
  for(i=0;i<ascii.length;i++){ j=ascii.charCodeAt(i); words[i>>2]|=j<<((3-i)%4)*8; }
  words[words.length]=((bitLen/maxWord)|0);
  words[words.length]=(bitLen);
  for(j=0;j<words.length;){
    var w=words.slice(j,j+=16), old=hash;
    hash=hash.slice(0,8);
    for(i=0;i<64;i++){
      var w15=w[i-15], w2=w[i-2], a=hash[0], e=hash[4];
      var t1=hash[7]+(rr(e,6)^rr(e,11)^rr(e,25))+((e&hash[5])^((~e)&hash[6]))+k[i]
        +(w[i]=(i<16)?w[i]:(w[i-16]+(rr(w15,7)^rr(w15,18)^(w15>>>3))+w[i-7]+(rr(w2,17)^rr(w2,19)^(w2>>>10)))|0);
      var t2=(rr(a,2)^rr(a,13)^rr(a,22))+((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));
      hash=[(t1+t2)|0].concat(hash);
      hash[4]=(hash[4]+t1)|0;
    }
    for(i=0;i<8;i++) hash[i]=(hash[i]+old[i])|0;
  }
  for(i=0;i<8;i++) for(j=3;j+1;j--){ var b=(hash[i]>>(j*8))&255; result+=((b<16)?0:"")+b.toString(16); }
  return result;
}
function hashPass(usuario, pass){
  return sha256(unescape(encodeURIComponent(String(usuario).toLowerCase()+":"+pass)));
}

const store = {
  get(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
const $ = (id)=>document.getElementById(id);
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function normText(s){ return String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g," ").trim(); }
const NAME_STOP = new Set(["DE","LA","LOS","LAS","DEL","Y"]);
function nameTokens(s){ return normText(s).split(" ").filter(t=>t.length>1 && !NAME_STOP.has(t)); }
function nameKey(s){ return nameTokens(s).sort().join(" "); }
function cleanCode(v){
  if(v===undefined || v===null) return "";
  if(typeof v==="number") return String(Math.round(v));
  return String(v).trim();
}
function distinct(arr){ return [...new Set(arr)].sort((a,b)=>String(a).localeCompare(String(b),"es",{numeric:true})); }
function mean(arr){
  const v = arr.filter(x=>typeof x==="number" && !isNaN(x));
  return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null;
}
function fmt(n){ return n===null || n===undefined || isNaN(n) ? "—" : n.toFixed(1); }
function fmtDiff(n){ return n===null || n===undefined ? "" : (n>=0?"+":"")+n.toFixed(1); }
function plural(n, one, many){ return n+" "+(n===1?one:many); }
function optionsHtml(values, selected, allLabel){
  let h = allLabel ? `<option value="all">${esc(allLabel)}</option>` : "";
  values.forEach(v=>{
    const val = typeof v==="object" ? v.value : v;
    const lab = typeof v==="object" ? v.label : v;
    h += `<option value="${esc(val)}"${val===selected?" selected":""}>${esc(lab)}</option>`;
  });
  return h;
}
function downloadBlob(content, filename, type){
  const blob = new Blob([content], {type});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function toast(msg, kind){
  const el = document.createElement("div");
  el.className = "toast "+(kind||"");
  el.textContent = msg;
  $("toasts").appendChild(el);
  const ms = kind==="error" ? 7000 : 4000;
  setTimeout(()=>el.classList.add("out"), ms);
  setTimeout(()=>el.remove(), ms+450);
}
const byName = (a,b)=>a.st.nombre.localeCompare(b.st.nombre,"es");
function fmtVal(v){ return v===null || v===undefined ? "—" : String(Math.round(v*100)/100); }
function round2(v){ return typeof v==="number" ? Math.round(v*100)/100 : v; }
function setSeg(id, v){ const el = $(id); if(el) el.querySelectorAll("button").forEach(b=>b.classList.toggle("active", b.dataset.v===v)); }

/* =====================================================================
   2. Cifrado
   ---------------------------------------------------------------------
   Cada usuario tiene un par de llaves (RSA). La llave pública se publica
   en usuarios.json; la privada también, pero cifrada con SU contraseña.
   Cada clase publicada en datos.json va cifrada con una llave propia, y
   esa llave se entrega (cifrada) solo a los usuarios asignados y a los
   administradores. Así, aunque el repositorio sea público, nadie puede
   leer una clase sin la contraseña de un usuario autorizado.
   ===================================================================== */
const hasCrypto = !!(window.crypto && window.crypto.subtle);
const te = new TextEncoder(), td = new TextDecoder();
const KDF_ITER = 150000;
const RSA_GEN = { name:"RSA-OAEP", modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:"SHA-256" };
const RSA_IMP = { name:"RSA-OAEP", hash:"SHA-256" };

function b64(buf){
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for(let i=0;i<bytes.length;i+=0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i+0x8000));
  return btoa(s);
}
function unb64(s){ const bin = atob(s); const out = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i); return out; }
function toHex(bytes){ return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join(""); }
function randomBytes(n){ return crypto.getRandomValues(new Uint8Array(n)); }

async function pbkdf2(pass, salt, iter){
  const base = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2", salt, iterations:iter, hash:"SHA-256"}, base, 512));
}
/* Pone contraseña a un usuario y le genera llaves nuevas */
async function setUserPassword(u, pass){
  const salt = randomBytes(16);
  const bits = await pbkdf2(pass, salt, KDF_ITER);
  const aes = await crypto.subtle.importKey("raw", bits.slice(32), "AES-GCM", false, ["encrypt"]);
  const kp = await crypto.subtle.generateKey(RSA_GEN, true, ["wrapKey","unwrapKey"]);
  const iv = randomBytes(12);
  const encPriv = await crypto.subtle.encrypt({name:"AES-GCM", iv}, aes, await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  u.auth = { salt:b64(salt), iter:KDF_ITER, v:toHex(bits.slice(0,32)) };
  u.pub = b64(await crypto.subtle.exportKey("spki", kp.publicKey));
  u.priv = { iv:b64(iv), data:b64(encPriv) };
  delete u.hash;
}
/* Verifica la contraseña. Devuelve {ok, privateKey, legacy} */
async function verifyPassword(u, pass){
  if(u.auth && u.priv){
    const bits = await pbkdf2(pass, unb64(u.auth.salt), u.auth.iter || KDF_ITER);
    if(toHex(bits.slice(0,32)) !== u.auth.v) return { ok:false };
    const aes = await crypto.subtle.importKey("raw", bits.slice(32), "AES-GCM", false, ["decrypt"]);
    const pkcs8 = await crypto.subtle.decrypt({name:"AES-GCM", iv:unb64(u.priv.iv)}, aes, unb64(u.priv.data));
    return { ok:true, privateKey: await crypto.subtle.importKey("pkcs8", pkcs8, RSA_IMP, true, ["unwrapKey"]) };
  }
  if(u.hash && u.hash === hashPass(u.usuario, pass)) return { ok:true, privateKey:null, legacy:true };   // formato antiguo
  return { ok:false };
}
/* Comprime antes de cifrar (datos.json ocupa ~5 veces menos). Si el navegador no puede, va sin comprimir. */
async function gzip(bytes){
  if(typeof CompressionStream==="undefined") return null;
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}
async function gunzip(bytes){
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}
async function encryptFor(obj, recipients, keyCache){   // recipients: {usuario: llavePublicaB64}
  const ck = await crypto.subtle.generateKey({name:"AES-GCM", length:256}, true, ["encrypt","decrypt"]);
  const iv = randomBytes(12);
  const plain = te.encode(JSON.stringify(obj));
  const packed = await gzip(plain);
  const data = await crypto.subtle.encrypt({name:"AES-GCM", iv}, ck, packed || plain);
  const keys = {};
  for(const [usuario, pub] of Object.entries(recipients)){
    let pk = keyCache && keyCache.get(pub);
    if(!pk){ pk = await crypto.subtle.importKey("spki", unb64(pub), RSA_IMP, false, ["wrapKey"]); if(keyCache) keyCache.set(pub, pk); }
    keys[usuario] = b64(await crypto.subtle.wrapKey("raw", ck, pk, {name:"RSA-OAEP"}));
  }
  const out = { iv:b64(iv), data:b64(data), keys };
  if(packed) out.z = 1;
  return out;
}
async function decryptFor(entry, usuario, privateKey){
  const wrapped = entry.keys && entry.keys[usuario];
  if(!wrapped || !privateKey) return null;
  const ck = await crypto.subtle.unwrapKey("raw", unb64(wrapped), privateKey, {name:"RSA-OAEP"}, {name:"AES-GCM"}, false, ["decrypt"]);
  let plain = new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM", iv:unb64(entry.iv)}, ck, unb64(entry.data)));
  if(entry.z) plain = await gunzip(plain);
  return JSON.parse(td.decode(plain));
}

/* =====================================================================
   3. Usuarios, roles y sesión
   ===================================================================== */
const ROLES = { admin:"Administrador", decano:"Decano", maestro:"Maestro" };
const USERS_KEY = "pp_users";
const SESSION_KEY = "pp_session";
const SESSION_PK = "pp_session_key";

/* Respaldo: se usa solo si no se puede leer usuarios.json (p.ej. al abrir con doble clic) */
const DEFAULT_USERS = [
  { usuario:"admin", nombre:"Administrador", rol:"admin", activo:true, pass:"admin123" }
];

let userDb = null;          // { updatedAt, users:[{usuario,nombre,rol,activo,auth,pub,priv}] }
let remoteUpdatedAt = null; // fecha del usuarios.json publicado (null = no se pudo leer)
let currentUser = null;
let sessionKey = null;      // llave privada del usuario en esta sesión

function validDb(db){ return db && Array.isArray(db.users) && db.users.length>0; }
/* En "vista previa" el administrador ve la app como otro usuario */
function effUser(){ return previewUser || currentUser; }
function isAdmin(){ const u = effUser(); return !!u && u.rol==="admin"; }

async function loadUsers(){
  let remote = null;
  try{
    const r = await fetch("usuarios.json?t="+Date.now(), {cache:"no-store"});
    if(r.ok){ const j = await r.json(); if(validDb(j)) remote = j; }
  }catch(e){ /* sin usuarios.json */ }
  const local = store.get(USERS_KEY, null);
  remoteUpdatedAt = remote ? (remote.updatedAt||0) : null;
  if(validDb(local) && (!remote || (local.updatedAt||0) > (remote.updatedAt||0))){
    userDb = local;                                  // cambios locales aún sin publicar
  } else if(remote){
    userDb = remote; store.del(USERS_KEY);           // lo publicado es lo más nuevo
  } else {
    userDb = { updatedAt:0, users: DEFAULT_USERS.map(u=>({
      usuario:u.usuario, nombre:u.nombre, rol:u.rol, activo:u.activo, hash:hashPass(u.usuario,u.pass)
    })) };
  }
}
function saveUsers(){ userDb.updatedAt = Date.now(); store.set(USERS_KEY, userDb); }
function hasUnpublishedUsers(){ return !!store.get(USERS_KEY, null) && (remoteUpdatedAt===null || userDb.updatedAt > remoteUpdatedAt); }
function findUser(u){ const n = String(u||"").trim().toLowerCase(); return userDb.users.find(x=>x.usuario.toLowerCase()===n); }
function activeAdmins(){ return userDb.users.filter(u=>u.rol==="admin" && u.activo); }
function hasKeys(u){ return !!(u && u.pub && u.priv && u.auth); }

function gateError(msg){
  $("gateErr").textContent = msg;
  const gate = $("gate");
  gate.classList.remove("shake"); void gate.offsetWidth; gate.classList.add("shake");
  $("gatePassword").value = ""; $("gatePassword").focus();
}
let unlocking = false;
async function attemptUnlock(ev){
  if(ev) ev.preventDefault();
  if(!userDb || unlocking) return;
  if(!hasCrypto) return gateError("Este navegador no permite el cifrado. Abre la página desde su dirección https de GitHub Pages.");
  const u = findUser($("gateUser").value);
  const pass = $("gatePassword").value;
  if(!u || !pass) return gateError("Usuario o contraseña incorrectos.");
  unlocking = true;
  const btn = $("gateSubmit"); btn.disabled = true; btn.textContent = "Verificando…";
  try{
    let res = await verifyPassword(u, pass);
    if(!res.ok) return gateError("Usuario o contraseña incorrectos.");
    if(!u.activo) return gateError("Este usuario está desactivado. Contacta al administrador.");
    if(res.legacy && u.rol==="admin"){
      // un administrador con formato antiguo: se le generan sus llaves en este momento
      await setUserPassword(u, pass);
      saveUsers();
      res = await verifyPassword(u, pass);
      setTimeout(()=>toast("Se actualizó la seguridad de tu usuario. Publica usuarios.json para que aplique en todos los equipos."), 600);
    }
    btn.textContent = "Abriendo tus clases…";
    sessionKey = res.privateKey;
    try{
      sessionStorage.setItem(SESSION_KEY, u.usuario);
      if(sessionKey) sessionStorage.setItem(SESSION_PK, JSON.stringify(await crypto.subtle.exportKey("jwk", sessionKey)));
    }catch(e){}
    await startSession(u);
  }catch(err){
    console.error(err);
    gateError("No se pudo iniciar sesión: "+err.message);
  }finally{
    unlocking = false; btn.disabled = false; btn.textContent = "Entrar";
  }
}
async function startSession(u){
  currentUser = u;
  await prepareData();
  $("gate").style.display = "none";
  $("appHeader").classList.remove("gated");
  $("appMain").classList.remove("gated");
  document.body.classList.toggle("readonly", !isAdmin());
  updateUserBox();
  buildTabs();
  render();
}
function updateUserBox(){
  const u = effUser();
  $("userName").textContent = u.nombre || u.usuario;
  const badge = $("userRole");
  badge.textContent = ROLES[u.rol] || u.rol;
  badge.className = "role-badge "+u.rol;
}
function logout(){
  try{ sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_PK); }catch(e){}
  location.reload();
}

/* ---------------- Pestañas por rol ----------------
   maestro : Resumen, Por carrera, Comparar estudiantes, Perfil, Tabla   (solo sus clases, gráficos de barras)
   decano  : lo mismo + gráfico araña y comparación entre carreras        (solo sus clases)
   admin   : todo, todas las clases + Administración                 */
const TAB_DEFS = [
  { id:"resumen",  label:"Resumen",              roles:["admin","decano","maestro"] },
  { id:"carreras", label:"Por carrera",          roles:["admin","decano","maestro"] },
  { id:"comparar", label:"Comparar estudiantes", roles:["admin","decano","maestro"] },
  { id:"perfil",   label:"Perfil",               roles:["admin","decano","maestro"] },
  { id:"tabla",    label:"Tabla",                roles:["admin","decano","maestro"] },
  { id:"usuarios", label:"Administración",       roles:["admin"] }
];
let activeTab = null;
function myTabs(){ const u = effUser(); return u ? TAB_DEFS.filter(t=>t.roles.includes(u.rol)) : []; }
function canRadar(){ const u = effUser(); return !!u && u.rol!=="maestro"; }   // el maestro no usa gráfico araña
function canSee(id){ return myTabs().some(t=>t.id===id); }
function buildTabs(){
  const tabs = myTabs();
  $("tabs").innerHTML = tabs.map(t=>`<button class="tab" role="tab" data-tab="${t.id}">${esc(t.label)}</button>`).join("");
  $("tabs").querySelectorAll(".tab").forEach(btn=>{ btn.onclick = ()=>showTab(btn.dataset.tab); });
  const saved = store.get("pp_ui_"+effUser().usuario, {}).tab;   // recordar la última pestaña
  if(!activeTab) activeTab = saved;
  if(!activeTab || !tabs.some(t=>t.id===activeTab)) activeTab = tabs[0].id;
  showTab(activeTab);
}
function showTab(id){
  activeTab = id;
  document.querySelectorAll("#tabs .tab").forEach(b=>{
    const on = b.dataset.tab===id;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active", p.id==="panel-"+id));
  if(currentUser) store.set("pp_ui_"+effUser().usuario, {tab:id});
  renderActive();   // solo se dibuja la pestaña visible, y solo si cambió algo
}
/* =====================================================================
   4. Datos
   ===================================================================== */
const METRICS_FALLBACK = [
  "Pensamiento Crítico","Resolución de problemas","Esfuerzo - Actividades","Esfuerzo - Tiempo Invertido",
  "Razonamiento Inductivo","Razonamiento Deductivo","Agilidad de Aprendizaje","Evaluación estratégica",
  "Analítica","Evaluación","Innovación","Tenacidad","Perseverancia","Iniciativa","Orientación a Resultados",
  "Excelencia Sostenida","Margen de mejora","Oportunidad Perdida","Falta de Previsión","Luchado",
  "Insuficiente","Retrasar","Resiliencia","Fénix"
];
/* Competencias "de riesgo": un valor ALTO es MALO. No entran en el índice general
   y en los colores de la tabla se interpretan al revés. */
const RISK_METRICS = new Set(["MARGEN DE MEJORA","OPORTUNIDAD PERDIDA","FALTA DE PREVISION","LUCHADO","INSUFICIENTE","RETRASAR"]);

const INK = "#22261F", CLAY = "#B45737", AVGCOLOR = "#8C8674", GLOBALCOLOR = "#C9C2AC", CARCOLOR = "#4A6270", GRIDCOLOR = "#DAD3C2";
const PALETTE = ["#B45737","#4A6270","#8A8A4A","#A5566B","#565785","#C79A3C","#6E7A55","#7A4B3A","#3B6E64","#8B5FA8"];
const SIN_CARRERA = "Sin carrera";
const SIN_GRUPO = "Sin grupo";
const GENERAL = "__general__";
const DATA_KEY = "pp_data";

let classes = [];      // [{id,name,grupo,color,fileName,metrics,students:[{nombre,empresa,valores,carrera,grupo,matricula}]}]
let roster = [];       // [{id,nombre,carrera,grupo,docente,asignatura,periodo}]
let rosterFiles = [];
let overrides = {};    // nameKey -> {carrera, grupo}  (asignados a mano en la tabla)
let carreraNames = {}; // código -> nombre visible     (ej. ISO -> "Ing. de Software")
let nextColor = 0;

function colorFor(i){ return PALETTE[((i%PALETTE.length)+PALETTE.length)%PALETTE.length]; }

const ROSTER_KEY = "pp_roster";   // el listado se guarda aparte: cambia poco y es lo más pesado
let dataUpdatedAt = 0;   // última modificación del espacio de trabajo del administrador
let published = null;    // contenido de datos.json (cifrado)
let undecryptable = 0;   // clases publicadas que este administrador no pudo abrir

/* Solo el administrador guarda: los demás ven lo publicado, en modo lectura */
function saveData(){
  rowsCache = null;
  if(!isAdmin()) return;
  dataUpdatedAt = Date.now();
  const ok = store.set(DATA_KEY, { updatedAt:dataUpdatedAt, classes, overrides, carreraNames, nextColor });
  if(!ok) toast("No se pudo guardar en este navegador (almacenamiento lleno o bloqueado).", "error");
}
function saveRoster(){
  if(!isAdmin()) return;
  if(!store.set(ROSTER_KEY, { roster, rosterFiles })) toast("No se pudo guardar el listado en este navegador.", "error");
}
/* Solo los campos que el programa usa: sin duplicados ni datos personales de más */
function minRoster(r){ return { id:r.id||"", nombre:r.nombre, carrera:r.carrera||"", grupo:r.grupo||"" }; }
function minStudent(s){
  const o = { nombre:s.nombre, valores:s.valores };
  if(s.empresa) o.empresa = s.empresa;
  if(s.carrera) o.carrera = s.carrera;
  if(s.grupo) o.grupo = s.grupo;
  if(s.matricula) o.matricula = s.matricula;
  return o;
}
function applyWorkspace(d){
  classes = (d.classes || []).map(c=>{
    const { avgRow, ...rest } = c;             // "avgRow" de versiones anteriores: ya no se usa
    return { ...rest, students: (c.students || []).map(minStudent), asignados: c.asignados || [] };
  });
  const r = store.get(ROSTER_KEY, null);
  roster = ((r && r.roster) || d.roster || []).map(minRoster);
  rosterFiles = (r && r.rosterFiles) || d.rosterFiles || [];
  if(!r && roster.length) store.set(ROSTER_KEY, { roster, rosterFiles });   // migrar desde la versión anterior
  overrides = d.overrides || {};
  carreraNames = d.carreraNames || {};
  nextColor = d.nextColor || classes.length;
  dataUpdatedAt = d.updatedAt || 0;
  rebuildRosterIndex();
}
let publishedStatus = "none";   // ok | none (no existe) | error (no se pudo leer)
async function loadPublished(){
  try{
    const r = await fetch("datos.json?t="+Date.now(), {cache:"no-store"});   // ?t= evita copias viejas en caché
    if(r.ok){ const j = await r.json(); if(j && j.tipo==="pp-publicado" && Array.isArray(j.classes)){ published = j; publishedStatus = "ok"; } }
    else publishedStatus = r.status===404 ? "none" : "error";
  }catch(e){ publishedStatus = "error"; }
}
let lockedForMe = 0;   // clases asignadas a mí que no pude abrir (se publicaron antes de mi contraseña actual)
async function decryptPublishedClasses(){
  undecryptable = 0; lockedForMe = 0;
  const entries = published ? published.classes : [];
  const res = await Promise.all(entries.map(async entry=>{        // todas a la vez
    try{
      const c = await decryptFor(entry, currentUser.usuario, sessionKey);
      if(!c){ if(isAdmin()) undecryptable++; if((entry.asignados||[]).includes(currentUser.usuario)) lockedForMe++; return null; }
      return { ...c, id:entry.id, asignados: entry.asignados || [], students: (c.students||[]).map(minStudent) };
    }catch(e){ console.error(e); undecryptable++; if((entry.asignados||[]).includes(currentUser.usuario)) lockedForMe++; return null; }
  }));
  return res.filter(Boolean);
}
/* Decide qué datos ve el usuario al entrar */
async function prepareData(){
  classes = []; roster = []; rosterFiles = []; overrides = {}; carreraNames = {}; nextColor = 0; dataUpdatedAt = 0;
  if(isAdmin()){
    const local = store.get(DATA_KEY, null);
    const pubAt = published ? (published.updatedAt||0) : -1;
    if(local && (local.updatedAt||0) >= pubAt){
      applyWorkspace(local);                       // el trabajo local es igual o más nuevo
    } else if(published){
      const list = await decryptPublishedClasses(); // lo publicado es más nuevo
      applyWorkspace({ classes:list,
        carreraNames: published.carreraNames || {}, nextColor: list.length, updatedAt: published.updatedAt });
      store.set(DATA_KEY, { updatedAt:dataUpdatedAt, classes, overrides, carreraNames, nextColor });
      if(undecryptable) setTimeout(()=>toast(undecryptable+" clases publicadas no se pudieron abrir con tu usuario. Otro administrador debe volver a publicar los datos.", "error"), 800);
    }
  } else {
    classes = await decryptPublishedClasses();
    carreraNames = (published && published.carreraNames) || {};
    rebuildRosterIndex();
  }
  rowsCache = null;
}
function hasUnpublishedData(){
  if(!isAdmin()) return false;
  const pubAt = published ? (published.updatedAt||0) : 0;
  return dataUpdatedAt > pubAt && (classes.length>0 || !!published);
}
function recipientsFor(c){
  const r = {};
  userDb.users.forEach(u=>{
    if(!hasKeys(u)) return;
    if(u.rol==="admin" || (c.asignados||[]).includes(u.usuario)) r[u.usuario] = u.pub;
  });
  return r;
}
/* Genera datos.json: cada clase cifrada solo para sus usuarios + administradores */
async function buildPublished(){
  const out = { tipo:"pp-publicado", version:2, updatedAt: dataUpdatedAt || Date.now(), carreraNames, classes:[] };
  const keyCache = new Map();
  // solo se publica lo necesario; el listado completo y los nombres de archivo no salen de tu navegador
  out.classes = await Promise.all(classes.map(async c=>{
    const payload = {
      name:c.name, grupo:c.grupo||"", color:c.color, metrics:c.metrics,
      students: c.students.map(s=>{
        const info = studentInfo(c, s);
        return minStudent({ nombre:s.nombre, empresa:s.empresa, valores:s.valores.map(round2),
          carrera:info.carrera, grupo: info.grupo!==c.grupo ? info.grupo : "", matricula:info.matricula });
      })
    };
    const entry = await encryptFor(payload, recipientsFor(c), keyCache);
    return { id:c.id, asignados:(c.asignados||[]).slice(), ...entry };
  }));
  return out;
}
async function exportPublished(){
  try{
    const out = await buildPublished();
    downloadBlob(JSON.stringify(out), "datos.json", "application/json");
  }catch(err){ console.error(err); toast("No se pudo generar datos.json: "+err.message, "error"); }
}
function assignedUsersMissingKeys(){
  const names = new Set();
  classes.forEach(c=>(c.asignados||[]).forEach(n=>{ const u = findUser(n); if(u && !hasKeys(u)) names.add(u.usuario); }));
  return [...names];
}

function clearData(){
  if(!classes.length && !roster.length) return;
  if(!confirm("¿Borrar todas las clases, el listado de estudiantes y las carreras asignadas en este navegador?\n\nLo que ya está publicado en GitHub no se borra hasta que publiques de nuevo.")) return;
  classes = []; roster = []; rosterFiles = []; overrides = {}; carreraNames = {}; nextColor = 0;
  rebuildRosterIndex();
  saveRoster();
  saveData();
  render();
  toast("Datos borrados de este navegador.");
}

/* ---------------- Respaldo del espacio de trabajo (solo administrador) ---------------- */
function exportBackup(){
  if(!classes.length && !roster.length) return toast("No hay datos para exportar.", "error");
  const data = { tipo:"pp-datos", version:2, exportado:new Date().toISOString(),
    exportadoPor: currentUser.usuario, classes, roster, rosterFiles, overrides, carreraNames };
  const d = new Date(), stamp = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  downloadBlob(JSON.stringify(data), "respaldo-comparador-"+stamp+".json", "application/json");
}
function importBackup(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const j = JSON.parse(reader.result);
      if(!j || j.tipo!=="pp-datos" || !Array.isArray(j.classes)) throw new Error("no es un respaldo de este programa");
      let added = 0, skipped = 0;
      j.classes.forEach(c=>{
        if(!c || !c.id || !Array.isArray(c.students) || !Array.isArray(c.metrics)) return;
        if(classes.some(x=>x.id===c.id)){ skipped++; return; }
        classes.push({ ...c, asignados: c.asignados || [], color: c.color || colorFor(nextColor++) });
        added++;
      });
      if(Array.isArray(j.roster) && j.roster.length) mergeRoster(j.roster, (j.rosterFiles||[]).join(", ") || "respaldo");
      Object.entries(j.overrides||{}).forEach(([k,v])=>{ overrides[k] = { ...v, ...(overrides[k]||{}) }; });
      Object.entries(j.carreraNames||{}).forEach(([k,v])=>{ if(!carreraNames[k]) carreraNames[k] = v; });
      saveData(); render();
      toast("Respaldo importado: "+plural(added,"clase nueva","clases nuevas")+(skipped?" ("+skipped+" ya estaban)":"")+".");
    }catch(err){ toast("No se pudo importar el respaldo: "+err.message, "error"); }
  };
  reader.readAsText(file);
}

/* ---------------- Métricas ---------------- */
function isRisk(m){ return RISK_METRICS.has(normText(m)); }
function mLabel(m){ return m===GENERAL ? "Índice general" : (isRisk(m) ? m+" ↓" : m); }
function generalIndex(metrics, valores){ return mean(metrics.map((m,i)=> isRisk(m) ? null : valores[i])); }
function allMetrics(){
  const out = [];
  classes.forEach(c=>c.metrics.forEach(m=>{ if(!out.includes(m)) out.push(m); }));
  return out;
}
function metricValue(cls, st, m){
  if(m===GENERAL) return generalIndex(cls.metrics, st.valores);
  const i = cls.metrics.indexOf(m);
  return i>=0 ? st.valores[i] : null;
}
function avgOf(rows, m){ return mean(rows.map(r=>metricValue(r.cls, r.st, m))); }
function heatClass(m, v){
  if(v===null || v===undefined || m===GENERAL && v===null) return "";
  const g = isRisk(m) ? 100-v : v;
  return g>=66 ? "hi" : g<=33 ? "lo" : "";
}
function metricHelp(m){
  if(m===GENERAL) return "Índice general: promedio de las competencias positivas (más alto es mejor).";
  return isRisk(m) ? m+": área de riesgo. Un valor más bajo es mejor; no cuenta en el índice general."
                   : m+": competencia positiva. Un valor más alto es mejor.";
}
function metricOptions(){
  return [{value:GENERAL, label:"Índice general"}].concat(allMetrics().map(m=>({value:m, label:mLabel(m)})));
}
const METRIC_NOTE = "Índice general = promedio de las competencias positivas. Las marcadas con ↓ son áreas de riesgo: un valor más bajo es mejor, y no entran en el índice.";

/* ---------------- Emparejar informe ↔ listado ----------------
   El informe trae "APELLIDOS, NOMBRES" y el listado "NOMBRES APELLIDOS".
   Se comparan las palabras del nombre sin acentos ni orden.           */
let rosterIdx = [];
let matchCache = new Map();
function rebuildRosterIndex(){
  rosterIdx = roster.map(r=>({ r, toks:new Set(nameTokens(r.nombre)) }));
  matchCache = new Map();
  rowsCache = null;
}
function matchRoster(nombre){
  const key = nameKey(nombre);
  if(matchCache.has(key)) return matchCache.get(key);
  const t = new Set(nameTokens(nombre));
  let best = null, bestScore = 0, tie = false;
  if(t.size >= 2){
    for(const e of rosterIdx){
      let inter = 0;
      t.forEach(x=>{ if(e.toks.has(x)) inter++; });
      const minSize = Math.min(t.size, e.toks.size);
      if(!(inter>=3 || (inter>=2 && inter===minSize))) continue;
      const score = inter / (t.size + e.toks.size - inter);
      if(score > bestScore){ best = e.r; bestScore = score; tie = false; }
      else if(score === bestScore && e.r !== best) tie = true;
    }
  }
  const res = (best && !tie) ? best : null;
  matchCache.set(key, res);
  return res;
}

/* Carrera y grupo finales. Prioridad:
   escrito a mano > columna en el informe > listado > grupo de la clase */
function studentInfo(cls, st){
  const ov = overrides[nameKey(st.nombre)] || {};
  const m = matchRoster(st.nombre);
  const autoCarrera = st.carrera || (m && m.carrera) || "";
  const autoGrupo = st.grupo || (m && m.grupo) || cls.grupo || "";
  return {
    carrera: ov.carrera || autoCarrera,
    grupo: ov.grupo || autoGrupo,
    matricula: st.matricula || (m && m.id) || "",
    manualCarrera: !!ov.carrera, manualGrupo: !!ov.grupo,
    autoCarrera, autoGrupo, enListado: !!m
  };
}
function carreraLabel(code){
  if(!code) return SIN_CARRERA;
  const n = String(carreraNames[code]||"").trim();
  return n || code;
}
let rowsCache = null;
function allRows(){
  if(rowsCache) return rowsCache;
  const out = [];
  classes.forEach(c=>c.students.forEach((s,i)=>{
    const info = studentInfo(c, s);
    out.push({
      key: c.id+"|"+i, cls:c, st:s, info,
      carrera: carreraLabel(info.carrera),
      grupo: info.grupo || SIN_GRUPO,
      indice: generalIndex(c.metrics, s.valores),
      q: normText(s.nombre+" "+(s.empresa||"")+" "+info.matricula)     // texto de búsqueda, una sola vez
    });
  }));
  rowsCache = out;
  rowMap = new Map(out.map(r=>[r.key, r]));
  carColorMap = new Map(distinct(out.map(r=>r.carrera).filter(c=>c!==SIN_CARRERA)).map((l,i)=>[l, colorFor(i)]));
  clsAvgCache = new Map();
  return out;
}
let rowMap = new Map(), carColorMap = new Map(), clsAvgCache = new Map();
function rowByKey(k){ allRows(); return rowMap.get(k); }
function classAverages(cls){
  allRows();
  if(!clsAvgCache.has(cls.id)){ const rr = rowsCache.filter(r=>r.cls===cls); clsAvgCache.set(cls.id, cls.metrics.map(m=>avgOf(rr,m))); }
  return clsAvgCache.get(cls.id);
}
function carreraColor(label){
  if(label===SIN_CARRERA) return GLOBALCOLOR;
  allRows();
  return carColorMap.get(label) || GLOBALCOLOR;
}

/* =====================================================================
   5. Lectura de archivos
   ===================================================================== */
function findRosterHeader(rows){
  for(let i=0;i<Math.min(rows.length,40);i++){
    const r = rows[i]; if(!r) continue;
    const n = r.map(v=>normText(v));
    if(n.includes("CARRERA") && n.some(v=>["NOMBRE","NOMBRES","NOMBRE COMPLETO","ESTUDIANTE"].includes(v))) return i;
  }
  return -1;
}
function parseRoster(rows, headerIdx){
  const h = rows[headerIdx].map(v=>normText(v));
  const col = (...names)=>{ for(const n of names){ const i=h.indexOf(n); if(i>=0) return i; } return -1; };
  const cNombre = col("NOMBRE","NOMBRES","NOMBRE COMPLETO","ESTUDIANTE");
  const cCarrera = col("CARRERA");
  const cId = col("ID","MATRICULA","ID ESTUDIANTE");
  const cGrupo = col("GRUPO","RNC","NRC","SECCION");
  const get = (r,c)=> c>=0 ? cleanCode(r[c]) : "";
  const out = [];
  for(let i=headerIdx+1;i<rows.length;i++){
    const r = rows[i]; if(!r) continue;
    const nombre = String(r[cNombre]==null?"":r[cNombre]).replace(/\s+/g," ").trim();
    if(!nombre) continue;
    // Solo se guardan los 4 campos que se usan (no teléfonos, correos ni docente)
    out.push(minRoster({ id: get(r,cId), nombre, carrera: get(r,cCarrera).toUpperCase(), grupo: get(r,cGrupo) }));
  }
  return out;
}
function mergeRoster(list, fileName){
  const keyOf = r => r.id ? "id:"+r.id : "n:"+nameKey(r.nombre);
  const map = new Map(roster.map(r=>[keyOf(r), r]));
  list.forEach(r=>map.set(keyOf(r), r));
  roster = [...map.values()];
  if(fileName && !rosterFiles.includes(fileName)) rosterFiles.push(fileName);
  rebuildRosterIndex();
  saveRoster();
}

function parseReport(rows, fallbackName){
  let headerIdx = -1;
  for(let i=0;i<rows.length;i++){
    const r = rows[i];
    if(r && normText(r[0]) === "ESTUDIANTE"){ headerIdx = i; break; }
  }
  if(headerIdx === -1) return null;

  const header = rows[headerIdx];
  let metricCols = [];
  let cCarrera = -1, cGrupo = -1, cMat = -1;
  for(let c=2;c<header.length;c++){
    const raw = header[c];
    if(raw===undefined || raw===null || String(raw).trim()==="") continue;
    const n = normText(raw);
    if(n==="CARRERA") cCarrera = c;
    else if(["GRUPO","SECCION","NRC","RNC"].includes(n)) cGrupo = c;
    else if(["ID","MATRICULA"].includes(n)) cMat = c;
    else metricCols.push({ name:String(raw).trim(), c });
  }
  if(metricCols.length===0) metricCols = METRICS_FALLBACK.map((m,i)=>({name:m, c:2+i}));

  const students = [];
  for(let i=headerIdx+1;i<rows.length;i++){
    const r = rows[i];
    if(!r || r.every(v=>v===undefined||v===null||String(v).trim()==="")) continue;
    const col0 = String(r[0]==null?"":r[0]).trim();
    const col1 = String(r[1]==null?"":r[1]).trim();
    if(/fin de la hoja/i.test(col0)) break;
    if(/promedios del juego/i.test(col1) || /^informe/i.test(col0)) continue;   // fila de promedios: se recalcula
    if(!col0) continue;
    students.push(minStudent({
      nombre: col0.replace(/\s+/g," "), empresa: col1,
      valores: metricCols.map(m=>{ const v = r[m.c]; const n = (v===undefined||v===null||v==="") ? 0 : Number(v); return isNaN(n) ? 0 : round2(n); }),
      carrera: cCarrera>=0 ? cleanCode(r[cCarrera]).toUpperCase() : "",
      grupo: cGrupo>=0 ? cleanCode(r[cGrupo]) : "",
      matricula: cMat>=0 ? cleanCode(r[cMat]) : ""
    }));
  }
  if(students.length===0) return null;
  return { name: fallbackName, metrics: metricCols.map(m=>m.name), students };
}

function guessClassGroup(students){
  const counts = {};
  students.forEach(s=>{
    const m = matchRoster(s.nombre);
    const g = s.grupo || (m && m.grupo);
    if(g) counts[g] = (counts[g]||0)+1;
  });
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  return top && top[1] >= students.length/2 ? top[0] : "";
}

let lastAddedClassId = null;
async function handleFiles(fileList){
  if(!isAdmin()) return;
  const files = Array.from(fileList);
  dropzone.classList.add("busy");
  $("dropMain").textContent = "Leyendo "+plural(files.length,"archivo","archivos")+"…";
  try{ await processFiles(files); }
  finally{ dropzone.classList.remove("busy"); $("dropMain").textContent = "Cargar archivos"; }
}
async function processFiles(files){
  // los listados primero, para que los informes del mismo lote ya encuentren la carrera
  const parsed = [];
  for(const file of files){
    try{
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:"array"});
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:null, raw:true});
      parsed.push({ file, rows, rosterHeader: findRosterHeader(rows) });
    }catch(err){
      console.error(err);
      toast('No pude leer "'+file.name+'": '+err.message, "error");
    }
  }
  parsed.sort((a,b)=>(b.rosterHeader>=0) - (a.rosterHeader>=0));

  let changed = false, rosterChanged = false;
  for(const p of parsed){
    const { file, rows } = p;
    if(p.rosterHeader >= 0){
      const list = parseRoster(rows, p.rosterHeader);
      if(!list.length){ toast('El listado "'+file.name+'" no tiene estudiantes.', "error"); continue; }
      mergeRoster(list, file.name);
      rosterChanged = changed = true;
      toast('Listado cargado: '+plural(list.length,"estudiante","estudiantes")+' de '+distinct(list.map(r=>r.carrera).filter(Boolean)).length+' carreras.');
      continue;
    }
    const baseName = file.name.replace(/\.(xlsx|xls|csv)$/i,"");
    const rep = parseReport(rows, baseName);
    if(!rep){
      toast('No reconocí "'+file.name+'". Debe ser un informe del juego (columna "Estudiante") o un listado de estudiantes (columnas "NOMBRE" y "CARRERA").', "error");
      continue;
    }
    if(classes.some(c=>c.fileName===file.name) && !confirm('"'+file.name+'" ya está cargado. ¿Cargarlo otra vez como una clase nueva?')) continue;
    const id = "c"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    classes.push({ id, name: rep.name, fileName: file.name, grupo: guessClassGroup(rep.students),
      color: colorFor(nextColor++), metrics: rep.metrics, students: rep.students, asignados: [] });
    lastAddedClassId = id;
    changed = true;
    const found = rep.students.filter(s=>matchRoster(s.nombre)).length;
    toast('Clase cargada con '+plural(rep.students.length,"estudiante","estudiantes")+
      (roster.length ? ' ('+found+' encontrados en el listado)' : '')+'. Ponle nombre y asígnala en la barra lateral.');
  }
  if(rosterChanged) classes.forEach(c=>{ if(!c.grupo) c.grupo = guessClassGroup(c.students); });
  if(changed){ saveData(); render(); }
}

function removeClass(id){
  const c = classes.find(x=>x.id===id);
  if(!c || !confirm('¿Quitar "'+c.name+'"?')) return;
  classes = classes.filter(x=>x.id!==id);
  saveData(); render();
}
function removeRoster(){
  if(!confirm("¿Quitar el listado de estudiantes? Las carreras escritas a mano se conservan.")) return;
  roster = []; rosterFiles = [];
  rebuildRosterIndex(); saveRoster(); saveData(); render();
}

/* =====================================================================
   6. Barra lateral
   ===================================================================== */
const onClassNameTyped = debounce(()=>{ saveData(); renderPanels(); renderPublishBanner(); }, 300);

function assignableUsers(){ return userDb.users.filter(u=>u.rol!=="admin").sort((a,b)=>a.rol.localeCompare(b.rol)||a.usuario.localeCompare(b.usuario)); }
function asignadosTxt(c){
  const list = (c.asignados||[]).map(n=>findUser(n)).filter(Boolean);
  return list.length ? list.map(u=>u.nombre||u.usuario).join(", ") : "";
}

function renderSidebar(){
  const admin = isAdmin();
  $("dropzone").classList.toggle("hidden", !admin);
  $("dataTools").classList.toggle("hidden", !admin);
  const rows = allRows();

  // listado de estudiantes (solo administrador)
  const rb = $("rosterBox");
  if(!admin){
    rb.innerHTML = "";
  } else if(roster.length){
    const carreras = distinct(roster.map(r=>r.carrera).filter(Boolean));
    const grupos = distinct(roster.map(r=>r.grupo).filter(Boolean));
    const found = rows.filter(r=>r.info.enListado).length;
    rb.innerHTML = `
      <div class="card roster">
        <button class="remove" title="Quitar listado" aria-label="Quitar listado">&times;</button>
        <div class="kicker">Listado de estudiantes</div>
        <div class="big">${roster.length} estudiantes</div>
        <div class="meta">${plural(carreras.length,"carrera","carreras")} &middot; ${plural(grupos.length,"grupo","grupos")}</div>
        ${rows.length ? `<div class="meta">${found} de ${rows.length} estudiantes de los informes aparecen aquí</div>` : ""}
        <div class="file">${esc(rosterFiles.join(", "))} &middot; no se publica</div>
      </div>`;
    rb.querySelector(".remove").onclick = removeRoster;
  } else {
    rb.innerHTML = `
      <div class="card muted">
        <div class="kicker">Listado de estudiantes</div>
        <div class="meta">Aún no cargado. Súbelo (ej. ADM535) para asignar carrera y grupo automáticamente.</div>
      </div>`;
  }

  const list = $("classList");
  list.innerHTML = "";
  $("classesLabel").textContent = (admin ? "Juegos / clases" : "Mis clases") + (classes.length ? " ("+classes.length+")" : "");
  if(!classes.length){
    list.innerHTML = `<div class="card muted"><div class="meta">${admin ? "Ningún informe cargado todavía." : "Aún no tienes clases asignadas."}</div></div>`;
  }
  classes.forEach(c=>{
    const mine = rows.filter(r=>r.cls===c);
    const sinCarrera = mine.filter(r=>r.carrera===SIN_CARRERA).length;
    const el = document.createElement("div");
    el.className = "card";
    el.style.setProperty("--swatch", c.color);
    if(!admin){
      el.innerHTML = `
        <div class="kicker">Juego / clase</div>
        <div class="big">${esc(c.name)}</div>
        <div class="meta">${plural(c.students.length,"estudiante","estudiantes")}${c.grupo?" &middot; grupo "+esc(c.grupo):""}</div>`;
      list.appendChild(el);
      return;
    }
    const who = asignadosTxt(c);
    el.innerHTML = `
      <button class="remove" title="Quitar clase" aria-label="Quitar clase">&times;</button>
      <label class="kicker" for="nm-${c.id}">Nombre del juego / clase</label>
      <input class="name" id="nm-${c.id}" value="${esc(c.name)}" placeholder="Escribe un nombre" autocomplete="off">
      <div class="inline">
        <label for="gr-${c.id}">Grupo</label>
        <input id="gr-${c.id}" class="grp" value="${esc(c.grupo||"")}" placeholder="ej. 1593" title="Se usa para los estudiantes que no aparecen en el listado">
      </div>
      <div class="meta">${plural(c.students.length,"estudiante","estudiantes")}${sinCarrera ? ` &middot; <span class="warn-txt">${sinCarrera} sin carrera</span>` : " &middot; todos con carrera"}</div>
      <div class="assign-sum">${who ? "Visible para: <b>"+esc(who)+"</b>" : '<span class="warn-txt">Sin asignar</span>'}
        <button class="link" type="button" data-assign="${esc(c.id)}">${who ? "Cambiar" : "Asignar"}</button></div>
      ${c.fileName ? `<div class="file" title="Archivo original">${esc(c.fileName)}</div>` : ""}
    `;
    el.querySelector(".remove").onclick = ()=>removeClass(c.id);
    el.querySelector(".name").oninput = (e)=>{ c.name = e.target.value; onClassNameTyped(); };
    el.querySelector(".name").onblur = (e)=>{ if(!e.target.value.trim()){ c.name = (c.fileName||"Clase").replace(/\.(xlsx|xls|csv)$/i,""); e.target.value = c.name; saveData(); renderPanels(); } };
    el.querySelector(".grp").onchange = (e)=>{ c.grupo = e.target.value.trim(); saveData(); render(); };
    list.appendChild(el);
    if(c.id===lastAddedClassId){
      const inp = el.querySelector(".name");
      setTimeout(()=>{ inp.focus(); inp.select(); }, 50);
    }
  });
  lastAddedClassId = null;
  $("backupExport").disabled = !classes.length && !roster.length;
  $("clearDataBtn").disabled = !classes.length && !roster.length;
}

/* Aviso fijo arriba cuando el administrador tiene cambios sin publicar */
function renderPublishBanner(){
  const el = $("publishBanner");
  if(!isAdmin()){ el.innerHTML = ""; return; }
  const u = hasUnpublishedUsers(), d = hasUnpublishedData();
  if(!u && !d){ el.innerHTML = ""; return; }
  const what = u && d ? "usuarios y clases" : u ? "usuarios" : "clases";
  const gh = ghConfig();
  el.innerHTML = `<div class="notice warn" style="margin:0 0 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;justify-content:space-between;">
      <span><b>Cambios sin publicar (${what}).</b> Los maestros y decanos todavía no los ven.</span>
      ${gh ? `<button class="btn small" type="button" data-publish-now>Publicar ahora</button>` : `<button class="btn small" type="button" data-admin-tab="publicar">Cómo publicar</button>`}</div>`;
}

/* =====================================================================
   7. Gráficos SVG (sin dependencias)
   ===================================================================== */
function svgEl(tag, attrs, title){
  let s = "<"+tag;
  for(const k in attrs){ if(attrs[k]!==undefined && attrs[k]!==null && attrs[k]!=="") s += " "+k+'="'+attrs[k]+'"'; }
  return title ? s+"><title>"+esc(title)+"</title></"+tag+">" : s+"/>";   // <title> = aviso al pasar el cursor
}
function svgWrap(W, H, inner, label){
  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="'+esc(label||"Gráfico")+'" style="display:block;max-width:100%;height:auto;">'+inner+'</svg>';
}
function radarChartSVG(labels, series, opts){
  opts = opts||{};
  const W = opts.width||700, H = opts.height||620;
  const cx = W/2, cy = H/2, R = Math.min(W,H)/2 - 95;
  const N = labels.length, max = 100;
  const angle = (i)=> -Math.PI/2 + i*(2*Math.PI/N);
  const pt = (i,val)=>{ const r = Math.max(0,Math.min(val||0,max))/max*R; return [cx+r*Math.cos(angle(i)), cy+r*Math.sin(angle(i))]; };
  let svg = "";
  [0.25,0.5,0.75,1].forEach(f=>{
    svg += svgEl("polygon", {points: labels.map((_,i)=>(cx+R*f*Math.cos(angle(i))).toFixed(1)+","+(cy+R*f*Math.sin(angle(i))).toFixed(1)).join(" "), fill:"none", stroke:GRIDCOLOR, "stroke-width":1});
    svg += '<text x="'+(cx+3)+'" y="'+(cy-R*f+10).toFixed(1)+'" font-size="8.5" fill="#9A9380">'+(f*100)+'</text>';
  });
  labels.forEach((_,i)=>{ const [x,y] = pt(i,max); svg += svgEl("line", {x1:cx,y1:cy,x2:x.toFixed(1),y2:y.toFixed(1), stroke:GRIDCOLOR, "stroke-width":1}); });
  series.forEach(s=>{
    svg += svgEl("polygon", {points: labels.map((_,i)=>pt(i,s.values[i]).map(n=>n.toFixed(1)).join(",")).join(" "),
      fill:s.color, "fill-opacity":s.fillOpacity!==undefined?s.fillOpacity:0.2, stroke:s.color, "stroke-width":s.strokeWidth||2, "stroke-dasharray":s.dash||"", "pointer-events":"none"});
  });
  // puntos (con aviso) al final, para que queden encima
  series.forEach(s=>{
    labels.forEach((lab,i)=>{
      const [x,y] = pt(i,s.values[i]);
      const tip = (s.name ? s.name+" · " : "")+lab+": "+fmt(s.values[i]);
      svg += s.points===false
        ? svgEl("circle", {cx:x.toFixed(1), cy:y.toFixed(1), r:5, fill:"transparent"}, tip)
        : svgEl("circle", {cx:x.toFixed(1), cy:y.toFixed(1), r:3.2, fill:s.color, stroke:"#fff", "stroke-width":0.8, class:"pt"}, tip);
    });
  });
  labels.forEach((lab,i)=>{
    const a = angle(i), lx = cx+(R+16)*Math.cos(a), ly = cy+(R+16)*Math.sin(a);
    const anchor = Math.cos(a)>0.15 ? "start" : Math.cos(a)<-0.15 ? "end" : "middle";
    const dy = Math.sin(a)>0.5 ? 9 : (Math.sin(a)<-0.5 ? -3 : 3);
    const risk = /↓$/.test(lab);
    svg += '<text x="'+lx.toFixed(1)+'" y="'+(ly+dy).toFixed(1)+'" text-anchor="'+anchor+'" font-size="10" fill="'+(risk?"#8A3A2A":INK)+'">'+esc(lab)+'</text>';
  });
  return svgWrap(W, H, svg, opts.label);
}
function barChartHorizontalSVG(labels, series, opts){
  opts = opts||{};
  const max = 100, labelW = opts.labelWidth||180, plotW = opts.plotWidth||420;
  const rowH = opts.rowHeight || Math.max(22, series.length*7+8), pad = 3;
  const barH = (rowH - pad*2) / series.length;
  const W = labelW + plotW + 20, H = labels.length*rowH + 30;
  let svg = "";
  [0,25,50,75,100].forEach(g=>{
    const x = labelW + g/max*plotW;
    svg += svgEl("line", {x1:x.toFixed(1), y1:16, x2:x.toFixed(1), y2:H-6, stroke:GRIDCOLOR, "stroke-width":1});
    svg += '<text x="'+x.toFixed(1)+'" y="11" text-anchor="middle" font-size="9" fill="#9A9380">'+g+'</text>';
  });
  labels.forEach((lab,li)=>{
    const rowY = 20 + li*rowH;
    if(li%2===1) svg += svgEl("rect", {x:0, y:rowY, width:labelW-4, height:rowH, fill:"#F4F1E8", "fill-opacity":0.6});
    const risk = /↓$/.test(lab);
    svg += '<text x="'+(labelW-8)+'" y="'+(rowY+rowH/2+3.5)+'" text-anchor="end" font-size="10.5" fill="'+(risk?"#8A3A2A":INK)+'">'+esc(lab)+'</text>';
    series.forEach((s,si)=>{
      const v = s.values[li];
      const val = Math.max(0,Math.min(v||0,max));
      svg += svgEl("rect", {x:labelW, y:(rowY+pad+si*barH).toFixed(1), width:Math.max(1,val/max*plotW).toFixed(1), height:Math.max(1,barH-1.5).toFixed(1), fill:s.color, rx:1, class:"bar"},
        (s.name ? s.name+" · " : "")+lab+": "+fmt(v));
    });
  });
  svg += svgEl("line", {x1:labelW, y1:16, x2:labelW, y2:H-6, stroke:INK, "stroke-width":1.2});
  return svgWrap(W, H, svg, opts.label);
}
/* Barras horizontales con valor y n (ranking). item.filter = "campo:valor" para abrir la tabla filtrada */
function rankBarsSVG(items, opts){
  opts = opts||{};
  const labelW = 190, plotW = 430, rowH = 26, W = labelW+plotW+90, H = items.length*rowH+26;
  let svg = "";
  [0,25,50,75,100].forEach(g=>{
    const x = labelW + g/100*plotW;
    svg += svgEl("line", {x1:x.toFixed(1), y1:16, x2:x.toFixed(1), y2:H-4, stroke:GRIDCOLOR, "stroke-width":1});
    svg += '<text x="'+x.toFixed(1)+'" y="11" text-anchor="middle" font-size="9" fill="#9A9380">'+g+'</text>';
  });
  items.forEach((it,i)=>{
    const y = 20 + i*rowH, v = it.value===null ? 0 : Math.max(0,Math.min(it.value,100)), w = v/100*plotW;
    const lab = it.label.length>28 ? it.label.slice(0,27)+"…" : it.label;
    svg += '<g class="'+(it.filter?"clickable":"")+'"'+(it.filter?' data-filter="'+esc(it.filter)+'"':"")+'>';
    svg += svgEl("rect", {x:0, y:y, width:W, height:rowH, fill:"transparent"});
    svg += '<text x="'+(labelW-8)+'" y="'+(y+rowH/2+3.5)+'" text-anchor="end" font-size="11" fill="'+INK+'">'+esc(lab)+'</text>';
    svg += svgEl("rect", {x:labelW, y:y+4, width:Math.max(1,w).toFixed(1), height:rowH-8, fill:it.color, rx:1.5, class:"bar"},
      it.label+": "+fmt(it.value)+" (n="+it.n+")"+(it.filter?" · clic para ver estudiantes":""));
    svg += '<text x="'+(labelW+w+6).toFixed(1)+'" y="'+(y+rowH/2+3.5)+'" font-size="10.5" font-weight="700" fill="'+INK+'">'+fmt(it.value)+
      '<tspan font-weight="400" fill="#9A9380">  n='+it.n+'</tspan></text></g>';
  });
  svg += svgEl("line", {x1:labelW, y1:16, x2:labelW, y2:H-4, stroke:INK, "stroke-width":1.2});
  return svgWrap(W, H, svg, opts.label);
}
function legendRow(items){
  return '<div class="legend-row">'+items.map(it=>
    '<div class="legend-item"><span class="legend-swatch'+(it.dash?" dash":"")+'" style="background:'+it.color+';color:'+it.color+'"></span>'+esc(it.label)+'</div>'
  ).join("")+'</div>';
}

/* =====================================================================
   8. Filtros comunes
   ===================================================================== */
function filterRows(rows, f){
  const q = f.q ? normText(f.q) : "";
  return rows.filter(r=>
    (!f.clase   || f.clase==="all"   || r.cls.id===f.clase) &&
    (!f.carrera || f.carrera==="all" || r.carrera===f.carrera) &&
    (!f.grupo   || f.grupo==="all"   || r.grupo===f.grupo) &&
    (!q || r.q.includes(q))
  );
}
/* Dibuja los selectores pedidos y corrige valores que ya no existen */
function filterFieldsHtml(prefix, f, rows, show){
  let h = "";
  if(show.includes("clase")){
    if(f.clase!=="all" && !classes.some(c=>c.id===f.clase)) f.clase = "all";
    h += `<div class="field"><label for="${prefix}Clase">Clase</label><select id="${prefix}Clase">${optionsHtml(classes.map(c=>({value:c.id,label:c.name||"(sin nombre)"})), f.clase, "Todas las clases")}</select></div>`;
  }
  if(show.includes("carrera")){
    const vals = distinct(rows.map(r=>r.carrera));
    if(f.carrera!=="all" && !vals.includes(f.carrera)) f.carrera = "all";
    h += `<div class="field"><label for="${prefix}Carrera">Carrera</label><select id="${prefix}Carrera">${optionsHtml(vals, f.carrera, "Todas las carreras")}</select></div>`;
  }
  if(show.includes("grupo")){
    const vals = distinct(rows.map(r=>r.grupo));
    if(f.grupo!=="all" && !vals.includes(f.grupo)) f.grupo = "all";
    h += `<div class="field"><label for="${prefix}Grupo">Grupo</label><select id="${prefix}Grupo">${optionsHtml(vals, f.grupo, "Todos los grupos")}</select></div>`;
  }
  return h;
}
function wireFilters(prefix, f, onChange){
  ["Clase","Carrera","Grupo"].forEach(k=>{
    const el = $(prefix+k);
    if(el) el.onchange = ()=>{ f[k.toLowerCase()] = el.value; onChange(); };
  });
}
function segHtml(id, options, value){
  return `<div class="seg" id="${id}">${options.map(o=>`<button type="button" data-v="${o.value}" class="${o.value===value?"active":""}">${esc(o.label)}</button>`).join("")}</div>`;
}
function wireSeg(id, onPick){ $(id).querySelectorAll("button").forEach(b=>{ b.onclick = ()=>onPick(b.dataset.v); }); }

function emptyReason(){
  const u = effUser();
  if(previewUser) return hasKeys(u)
    ? "No tiene ninguna clase asignada. Asígnaselas en Administración → Asignar clases, y luego publica."
    : "Además, su usuario no tiene llave: ponle una contraseña nueva en Administración → Usuarios.";
  if(!sessionKey) return "Tu usuario necesita una contraseña nueva para poder abrir las clases. Pídesela al administrador.";
  if(publishedStatus==="error") return location.protocol==="file:"
    ? "Abriste el programa como archivo desde la computadora, y así el navegador no puede leer las clases publicadas. Entra por la dirección web (GitHub Pages)."
    : "No se pudieron leer las clases publicadas. Revisa tu conexión a internet y pulsa \"Volver a comprobar\".";
  if(lockedForMe) return "Tienes "+plural(lockedForMe,"clase asignada","clases asignadas")+", pero se publicaron antes de tu contraseña actual. Pide al administrador que publique de nuevo.";
  const local = store.get(DATA_KEY, null);
  if(local && (local.updatedAt||0) > ((published && published.updatedAt)||0) && (local.classes||[]).some(c=>(c.asignados||[]).includes(u.usuario)))
    return "En esta computadora hay clases asignadas a ti que el administrador todavía no ha publicado. Aparecerán cuando las publique.";
  if(!published || !published.classes.length) return "El administrador todavía no ha publicado ninguna clase. Cuando lo haga, aparecerán aquí.";
  return "Hay clases publicadas, pero ninguna está asignada a ti. Pide al administrador que te las asigne y publique.";
}
function emptyState(){
  if(!isAdmin()) return `
    <div class="onboard">
      <h2>${previewUser ? esc(previewUser.nombre||previewUser.usuario)+" no tiene clases" : "Aún no tienes clases"}</h2>
      <p>${emptyReason()}</p>
      ${previewUser ? `<button class="btn" type="button" data-end-preview data-admin-tab="asignar">Asignarle clases</button>` : `<button class="btn ghost" type="button" onclick="location.reload()">Volver a comprobar</button>`}
    </div>`;
  return `
    <div class="onboard">
      <h2>Empieza aquí</h2>
      <p>Los Excel se procesan dentro de este navegador. Solo se publica lo que tú decidas, y va cifrado.</p>
      <ol>
        <li><b>Sube el listado de estudiantes</b> (ej. ADM535).
          <span>Opcional, pero aporta la carrera, el grupo y la matrícula de cada estudiante.</span></li>
        <li><b>Sube los informes del juego</b> (icompetencyreport), uno por clase.
          <span>Puedes soltar varios archivos a la vez; el programa distingue cuál es cuál.</span></li>
        <li><b>Ponle nombre a cada juego o clase y asígnala</b> a sus maestros o decanos en la barra lateral.
          <span>Si a algún estudiante le falta la carrera, escríbela en la pestaña Tabla.</span></li>
        <li><b>Publica</b> desde la pestaña Administración.
          <span>Cada usuario verá solo las clases que le asignaste.</span></li>
      </ol>
      <button class="btn" type="button" data-pick>Elegir archivos</button>
    </div>`;
}

/* =====================================================================
   9. Paneles
   ===================================================================== */

/* ---------- Resumen (todos) ----------
   Responde lo importante: ¿cómo está el grupo?, ¿quién necesita atención?,
   ¿en qué es fuerte o débil?  Niveles según el índice general:
   bajo < 34 · medio 34–65 · alto ≥ 66 (los mismos cortes que los colores de la tabla). */
const stRes = { clase:"all", carrera:"all", grupo:"all" };
const LEVELS = [
  { id:"bajo",  label:"Bajo",  test:v=>v<34,          color:"#C98F7A" },
  { id:"medio", label:"Medio", test:v=>v>=34 && v<66, color:"#D9CFB4" },
  { id:"alto",  label:"Alto",  test:v=>v>=66,         color:"#7FA487" }
];
function levelOf(v){ return v===null || v===undefined ? null : LEVELS.find(l=>l.test(v)); }

/* Barras apiladas: una fila por grupo, segmentos = cantidad de estudiantes por nivel */
function stackedBarsSVG(items){
  const labelW = 170, plotW = 470, rowH = 30, W = labelW+plotW+60, H = items.length*rowH+8;
  let svg = "";
  items.forEach((it,i)=>{
    const y = 4 + i*rowH, total = it.parts.reduce((s,p)=>s+p.n,0) || 1;
    const lab = it.label.length>24 ? it.label.slice(0,23)+"…" : it.label;
    svg += '<g class="'+(it.filter?"clickable":"")+'"'+(it.filter?' data-filter="'+esc(it.filter)+'"':"")+'>';
    svg += svgEl("rect", {x:0, y, width:W, height:rowH, fill:"transparent"});
    svg += '<text x="'+(labelW-8)+'" y="'+(y+rowH/2+4)+'" text-anchor="end" font-size="11.5" font-weight="'+(it.bold?700:400)+'" fill="'+INK+'">'+esc(lab)+'</text>';
    let x = labelW;
    it.parts.forEach(p=>{
      if(!p.n) return;
      const w = p.n/total*plotW;
      svg += svgEl("rect", {x:x.toFixed(1), y:y+5, width:Math.max(1,w-1).toFixed(1), height:rowH-10, fill:p.color, class:"bar"},
        it.label+" · nivel "+p.label.toLowerCase()+": "+plural(p.n,"estudiante","estudiantes")+" ("+Math.round(p.n/total*100)+"%)"+(it.filter?" · clic para ver":""));
      if(w>22) svg += '<text x="'+(x+w/2).toFixed(1)+'" y="'+(y+rowH/2+4)+'" text-anchor="middle" font-size="11" font-weight="700" fill="'+INK+'" pointer-events="none">'+p.n+'</text>';
      x += w;
    });
    svg += '<text x="'+(labelW+plotW+8)+'" y="'+(y+rowH/2+4)+'" font-size="10.5" fill="#9A9380">n='+it.parts.reduce((s,p)=>s+p.n,0)+'</text></g>';
  });
  return svgWrap(W, H, svg, "Estudiantes por nivel");
}

function renderPanelResumen(){
  const panel = $("panel-resumen");
  if(!classes.length){ panel.innerHTML = emptyState(); return; }
  const rowsAll = allRows();
  const rows = filterRows(rowsAll, stRes);
  const scopeCls = stRes.clase==="all" ? classes : classes.filter(c=>c.id===stRes.clase);
  const valid = rows.filter(r=>r.indice!==null);
  const counts = LEVELS.map(l=>valid.filter(r=>l.test(r.indice)).length);
  const idx = avgOf(rows, GENERAL);

  // quién necesita atención: nivel bajo, del índice más bajo al más alto
  const attention = valid.filter(r=>r.indice<34).sort((a,b)=>a.indice-b.indice);
  const weakestOf = (r)=>{
    const avg = classAverages(r.cls);
    return r.cls.metrics.map((m,i)=>({ m, v:r.st.valores[i], d: avg[i]===null ? 0 : r.st.valores[i]-avg[i] }))
      .filter(x=>!isRisk(x.m)).sort((a,b)=>a.d-b.d)[0];
  };

  // competencias del grupo filtrado frente a todos tus estudiantes
  const metrics = allMetrics();
  // competencias que casi nadie activa (p.ej. "Fénix": 0 en la mayoría) no dicen nada como fortaleza o debilidad
  const sparse = new Set(metrics.filter(m=>{ const v = rowsAll.map(r=>metricValue(r.cls,r.st,m)).filter(x=>x!==null); return v.length && v.filter(x=>x===0).length/v.length >= 0.7; }));
  const comp = metrics.filter(m=>!sparse.has(m)).map(m=>({ m, v:avgOf(rows,m), all:avgOf(rowsAll,m) })).filter(x=>x.v!==null);
  const pos = comp.filter(x=>!isRisk(x.m)).sort((a,b)=>b.v-a.v);
  const strong = pos.slice(0,4), weak = pos.slice(-4).reverse();
  const risk = comp.filter(x=>isRisk(x.m)).sort((a,b)=>b.v-a.v).slice(0,3);
  const narrowed = rows.length !== rowsAll.length;
  const compLi = (x, good)=>`<li><span title="${esc(metricHelp(x.m))}">${esc(x.m)}</span><span class="v">${fmt(x.v)}${narrowed && x.all!==null ? `<span class="d ${((x.v-x.all)>=0)===good?"pos":"neg"}">${fmtDiff(x.v-x.all)} vs todos</span>` : ""}</span></li>`;

  // distribución: una fila por clase (+ total si hay varias)
  const dist = scopeCls.map(c=>{
    const rr = rows.filter(r=>r.cls===c && r.indice!==null);
    return { label:c.name, filter:"clase:"+c.id, parts: LEVELS.map(l=>({ label:l.label, color:l.color, n: rr.filter(r=>l.test(r.indice)).length })) };
  }).filter(d=>d.parts.some(p=>p.n));
  if(dist.length>1) dist.push({ label:"Total", bold:true, parts: LEVELS.map((l,i)=>({ label:l.label, color:l.color, n:counts[i] })) });

  panel.innerHTML = `
    <div class="row">
      ${filterFieldsHtml("rs", stRes, rowsAll, ["clase","carrera","grupo"])}
    </div>
    <div class="stat-row">
      <div class="stat"><div class="label">Estudiantes</div><div class="val">${rows.length}</div><div class="sub">${plural(scopeCls.length,"clase","clases")}</div></div>
      <div class="stat" title="${esc(metricHelp(GENERAL))}"><div class="label">Índice promedio</div><div class="val">${fmt(idx)}</div><div class="sub">de 0 a 100</div></div>
      <div class="stat"><div class="label">Nivel alto</div><div class="val" style="color:var(--good-ink)">${counts[2]}</div><div class="sub">${valid.length ? Math.round(counts[2]/valid.length*100)+"% · índice 66 o más" : "—"}</div></div>
      <div class="stat"><div class="label">Necesitan atención</div><div class="val" style="color:var(--bad-ink)">${counts[0]}</div><div class="sub">${valid.length ? Math.round(counts[0]/valid.length*100)+"% · índice menor de 34" : "—"}</div></div>
    </div>

    <div class="box">
      <h3>¿Cómo se reparten los estudiantes?</h3>
      ${dist.length ? stackedBarsSVG(dist) : '<div class="placeholder">No hay estudiantes con ese filtro.</div>'}
      ${legendRow(LEVELS.map(l=>({color:l.color, label:l.label+(l.id==="bajo"?" (menos de 34)":l.id==="medio"?" (34 a 65)":" (66 o más)")})))}
      ${dist.length>1 ? '<div class="legend-note">Haz clic en una clase para ver sus estudiantes en la Tabla.</div>' : ""}
    </div>

    <div class="two-col">
      <div class="box">
        <h3>Necesitan atención <span class="count">(${attention.length})</span></h3>
        ${attention.length ? `<ul class="insight-list attention">${attention.slice(0,12).map(r=>{ const w = weakestOf(r); return `<li>
            <span><button class="name-link" type="button" data-profile="${esc(r.key)}">${esc(r.st.nombre)}</button>
              <small class="muted">${esc(r.carrera)}${scopeCls.length>1?" · "+esc(r.cls.name):""}${w?" · más bajo en "+esc(w.m):""}</small></span>
            <span class="v neg">${fmt(r.indice)}</span></li>`; }).join("")}</ul>
          ${attention.length>12 ? `<button class="link" type="button" data-attention>Ver los ${attention.length} en la Tabla</button>` : ""}`
          : '<p class="legend-note">Nadie con índice menor de 34. 👍</p>'}
      </div>
      <div class="box">
        <h3>Fortalezas del grupo</h3>
        <ul class="insight-list">${strong.map(x=>compLi(x,true)).join("")}</ul>
        <h3 class="sub-h">Debilidades del grupo</h3>
        <ul class="insight-list">${weak.map(x=>compLi(x,true)).join("")}</ul>
        ${risk.length ? `<h3 class="sub-h">Riesgos más altos (↓)</h3><ul class="insight-list">${risk.map(x=>compLi(x,false)).join("")}</ul>` : ""}
      </div>
    </div>

    ${scopeCls.length>1 ? `
    <h3 class="section-title mt">Por clase</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Clase</th><th>Grupo</th><th class="num">Estudiantes</th><th class="num">Índice</th><th class="num">Nivel bajo</th><th>Su punto más fuerte</th><th>Su punto más débil</th></tr></thead>
      <tbody>${scopeCls.map(c=>{
        const rr = rows.filter(r=>r.cls===c);
        if(!rr.length) return "";
        const av = metrics.filter(m=>!isRisk(m) && !sparse.has(m)).map(m=>({m, v:avgOf(rr,m)})).filter(a=>a.v!==null).sort((a,b)=>b.v-a.v);
        const ci = avgOf(rr, GENERAL), low = rr.filter(r=>r.indice!==null && r.indice<34).length;
        return `<tr class="click-row" data-filter="clase:${esc(c.id)}" title="Ver sus estudiantes">
          <td><span class="legend-swatch" style="background:${c.color}"></span> ${esc(c.name)}</td>
          <td>${esc(c.grupo||"—")}</td><td class="num">${rr.length}</td>
          <td class="num ${heatClass(GENERAL,ci)}"><b>${fmt(ci)}</b></td>
          <td class="num">${low ? `<span class="neg">${low}</span>` : "0"}</td>
          <td>${av[0] ? esc(av[0].m)+` <span class="count">${fmt(av[0].v)}</span>` : "—"}</td>
          <td>${av.length ? esc(av[av.length-1].m)+` <span class="count">${fmt(av[av.length-1].v)}</span>` : "—"}</td></tr>`;
      }).join("")}</tbody></table></div>` : ""}
    <div class="legend-note">${METRIC_NOTE}</div>
  `;
  wireFilters("rs", stRes, renderPanelResumen);
  const more = panel.querySelector("[data-attention]");
  if(more) more.onclick = ()=>{
    Object.assign(stTbl, { clase:stRes.clase, carrera:stRes.carrera, grupo:stRes.grupo, q:"", soloSin:false, sortCol:"Índice", sortDir:1, limit:TBL_PAGE });
    dirty.add("tabla"); showTab("tabla");
  };
}

/* ---------- Por carrera (decano / admin) ---------- */
const stCar = { metric:GENERAL, clase:"all", grupo:"all", sel:[], touched:false, view:"radar", vsAll:true };
const CAR_MAX = 6;

function renderPanelCarreras(){
  const panel = $("panel-carreras");
  if(!classes.length){ panel.innerHTML = emptyState(); return; }
  const opts = metricOptions();
  if(!opts.some(o=>o.value===stCar.metric)) stCar.metric = GENERAL;
  const rowsAll = allRows();
  const rows = filterRows(rowsAll, stCar);
  const carreras = distinct(rows.map(r=>r.carrera));
  const stats = carreras.map(k=>{
    const rr = rows.filter(r=>r.carrera===k);
    return { carrera:k, rows:rr, n:rr.length, avg:avgOf(rr, stCar.metric) };
  }).sort((a,b)=>{
    if(a.carrera===SIN_CARRERA) return 1;
    if(b.carrera===SIN_CARRERA) return -1;
    return (b.avg??-1)-(a.avg??-1);
  });
  const sin = stats.find(s=>s.carrera===SIN_CARRERA);

  panel.innerHTML = `
    <p class="panel-intro">Promedio de cada carrera, ordenado de mayor a menor. Puedes limitarlo a una clase o a un grupo. Haz clic en una carrera para ver sus estudiantes.</p>
    <div class="row">
      <div class="field"><label for="carMetric">Competencia</label><select id="carMetric">${optionsHtml(opts, stCar.metric)}</select></div>
      ${filterFieldsHtml("car", stCar, rowsAll, ["clase","grupo"])}
    </div>
    ${sin ? `<div class="notice">${plural(sin.n,"estudiante no tiene","estudiantes no tienen")} carrera asignada. ${isAdmin() ? `Carga el listado de estudiantes o escríbela en la <button class="link" type="button" data-goto="tabla">Tabla</button>.` : "El administrador puede asignarla."}</div>` : ""}
    <div class="box" id="carChart"></div>
    <div class="legend-note">${METRIC_NOTE}</div>
    ${canRadar() ? `
    <h3 class="section-title mt">Comparar carreras</h3>
    <div class="legend-note" style="margin:-6px 0 10px;">Elige hasta ${CAR_MAX} carreras para ver todas sus competencias lado a lado (promedio de sus estudiantes${stCar.clase!=="all"||stCar.grupo!=="all"?", con los filtros de arriba":""}).</div>
    <div class="box">
      <div class="car-pick" id="carPick"></div>
      <div class="row" style="margin:12px 0 0;align-items:center;">
        <div class="field"><label>Vista</label>${segHtml("carView",[{value:"radar",label:"Araña"},{value:"barras",label:"Barras"}], stCar.view)}</div>
        <label class="checks" style="padding-top:18px;"><input type="checkbox" id="carVsAll" ${stCar.vsAll?"checked":""}> Mostrar el promedio de todos</label>
      </div>
      <div id="carCmp"></div>
    </div>` : ""}
    <h3 class="section-title mt">Carrera por clase</h3>
    <div class="legend-note" style="margin:-6px 0 10px;">Promedio de <b>${esc(mLabel(stCar.metric))}</b> de cada carrera en cada clase. Entre paréntesis, la cantidad de estudiantes.</div>
    <div class="table-wrap" id="carTable"></div>
    <details class="box mt ${isAdmin()?"":"hidden"}" id="carNames">
      <summary>Nombres de las carreras</summary>
      <div class="legend-note" style="margin:0 0 12px;">Escribe el nombre completo de cada código. Si das el mismo nombre a dos códigos (por ejemplo ISO e ISOR), se cuentan como una sola carrera. Se guarda en este navegador y viaja en el respaldo.</div>
      <div class="table-wrap" style="max-height:360px;" id="carNamesTable"></div>
    </details>
  `;
  $("carMetric").onchange = (e)=>{ stCar.metric = e.target.value; renderPanelCarreras(); };
  wireFilters("car", stCar, renderPanelCarreras);

  const real = stats.filter(s=>s.carrera!==SIN_CARRERA || s.n);
  $("carChart").innerHTML = real.length
    ? rankBarsSVG(real.map(s=>({label:s.carrera, value:s.avg, n:s.n, color:carreraColor(s.carrera), filter:"carrera:"+s.carrera})), {label:"Promedio por carrera"})
    : '<div class="placeholder">No hay estudiantes con ese filtro.</div>';

  if(canRadar()){
    const reales = stats.filter(s=>s.carrera!==SIN_CARRERA && s.n);
    stCar.sel = stCar.sel.filter(k=>reales.some(s=>s.carrera===k));
    if(!stCar.touched && !stCar.sel.length) stCar.sel = reales.slice().sort((a,b)=>b.n-a.n).slice(0,3).map(s=>s.carrera);
    $("carPick").innerHTML = reales.length ? reales.map(s=>`<button type="button" class="pick ${stCar.sel.includes(s.carrera)?"on":""}" data-car="${esc(s.carrera)}" style="--swatch:${carreraColor(s.carrera)}" aria-pressed="${stCar.sel.includes(s.carrera)}">${esc(s.carrera)} <span class="count">${s.n}</span></button>`).join("")
      : '<span class="legend-note">No hay estudiantes con carrera asignada.</span>';
    $("carPick").onclick = (e)=>{
      const b = e.target.closest("button[data-car]"); if(!b) return;
      const k = b.dataset.car; stCar.touched = true;
      if(stCar.sel.includes(k)) stCar.sel = stCar.sel.filter(x=>x!==k);
      else if(stCar.sel.length>=CAR_MAX) return toast("Puedes comparar hasta "+CAR_MAX+" carreras a la vez.", "error");
      else stCar.sel.push(k);
      b.classList.toggle("on"); b.setAttribute("aria-pressed", stCar.sel.includes(k));
      drawCarCompare(rows);
    };
    wireSeg("carView", v=>{ stCar.view = v; setSeg("carView", v); drawCarCompare(rows); });
    $("carVsAll").onchange = (e)=>{ stCar.vsAll = e.target.checked; drawCarCompare(rows); };
    drawCarCompare(rows);
  }

  // matriz carrera × clase
  const cls = stCar.clase==="all" ? classes : classes.filter(c=>c.id===stCar.clase);
  $("carTable").innerHTML = `<table><thead><tr><th>Carrera</th><th class="num">Estudiantes</th><th class="num">${stCar.clase==="all"?"Todas las clases":"Promedio"}</th>
      ${stCar.clase==="all" ? cls.map(c=>`<th class="num">${esc(c.name)}</th>`).join("") : ""}</tr></thead>
    <tbody>${stats.map(s=>`<tr>
      <td><span class="legend-swatch" style="background:${carreraColor(s.carrera)}"></span> <b>${esc(s.carrera)}</b></td>
      <td class="num">${s.n}</td>
      <td class="num ${heatClass(stCar.metric, s.avg)}"><b>${fmt(s.avg)}</b></td>
      ${stCar.clase==="all" ? cls.map(c=>{ const rr = s.rows.filter(r=>r.cls===c);
        return rr.length ? `<td class="num">${fmt(avgOf(rr, stCar.metric))} <span class="count">(${rr.length})</span></td>` : '<td class="num muted">—</td>'; }).join("") : ""}
    </tr>`).join("")}</tbody></table>`;

  // editor de nombres
  const codes = distinct(roster.map(r=>r.carrera).concat(rowsAll.map(r=>r.info.carrera)).filter(Boolean));
  $("carNamesTable").innerHTML = codes.length ? `<table><thead><tr><th>Código</th><th>Nombre de la carrera</th><th class="num">En informes</th></tr></thead><tbody>${
    codes.map(code=>`<tr><td><b>${esc(code)}</b></td>
      <td><input class="cell-input" style="width:260px" data-code="${esc(code)}" value="${esc(carreraNames[code]||"")}" placeholder="${esc(code)}"></td>
      <td class="num">${rowsAll.filter(r=>r.info.carrera===code).length}</td></tr>`).join("")
  }</tbody></table>` : '<div class="placeholder">Todavía no hay carreras.</div>';
  $("carNamesTable").querySelectorAll("input[data-code]").forEach(inp=>{
    inp.onchange = ()=>{
      const v = inp.value.trim();
      if(v) carreraNames[inp.dataset.code] = v; else delete carreraNames[inp.dataset.code];
      saveData(); render();
      $("carNames").open = true;
    };
  });
}

function drawCarCompare(rows){
  const box = $("carCmp"); if(!box) return;
  if(!stCar.sel.length){ box.innerHTML = '<div class="placeholder" style="margin-top:12px;">Elige una o más carreras arriba.</div>'; return; }
  const metrics = allMetrics();
  const groups = stCar.sel.map(k=>({ k, rows: rows.filter(r=>r.carrera===k) }));
  const series = groups.map(g=>({ name:g.k+" (n="+g.rows.length+")", color:carreraColor(g.k), values: metrics.map(m=>avgOf(g.rows,m)) }));
  const ref = { name:"Promedio de todos", color:INK, values: metrics.map(m=>avgOf(rows,m)), fillOpacity:0, strokeWidth:1.3, dash:"3,3", points:false };
  const labels = metrics.map(mLabel);
  const chart = stCar.view==="radar"
    ? radarChartSVG(labels, (stCar.vsAll ? [ref] : []).concat(series.map(s=>({...s, fillOpacity:0.1, strokeWidth:2}))), {label:"Comparación de carreras"})
    : barChartHorizontalSVG(labels, series.concat(stCar.vsAll ? [{...ref, color:"#9A9380"}] : []), {label:"Comparación de carreras"});
  const legend = legendRow(series.map(s=>({color:s.color, label:s.name})).concat(stCar.vsAll ? [{color:stCar.view==="radar"?INK:"#9A9380", label:"Promedio de todos", dash:stCar.view==="radar"}] : []));
  box.innerHTML = `${chart}${legend}
    <div class="table-wrap mt"><table>
      <thead><tr><th class="sticky">Carrera</th><th class="num">Estudiantes</th><th class="num" title="${esc(metricHelp(GENERAL))}">Índice</th>${metrics.map(m=>`<th class="num" title="${esc(metricHelp(m))}">${esc(mLabel(m))}</th>`).join("")}</tr></thead>
      <tbody>${groups.map((g,i)=>{ const idx = avgOf(g.rows, GENERAL); return `<tr class="click-row" data-filter="carrera:${esc(g.k)}" title="Ver sus estudiantes">
        <td class="sticky"><span class="legend-swatch" style="background:${series[i].color}"></span> <b>${esc(g.k)}</b></td>
        <td class="num">${g.rows.length}</td><td class="num ${heatClass(GENERAL,idx)}"><b>${fmt(idx)}</b></td>
        ${series[i].values.map((v,j)=>`<td class="num ${heatClass(metrics[j],v)}">${fmt(v)}</td>`).join("")}</tr>`; }).join("")}
      ${stCar.vsAll ? `<tr><td class="sticky muted">Promedio de todos</td><td class="num muted">${rows.length}</td><td class="num muted">${fmt(avgOf(rows,GENERAL))}</td>${ref.values.map(v=>`<td class="num muted">${fmt(v)}</td>`).join("")}</tr>` : ""}
      </tbody></table></div>`;
}

/* ---------- Comparar estudiantes (todos; araña solo decano/admin) ----------
   renderPanelComparar dibuja los controles; syncComparar solo actualiza
   la lista, los seleccionados y el gráfico (búsqueda fluida).          */
const stCmp = { clase:"all", carrera:"all", grupo:"all", q:"", sel:[], view:"radar" };
const CMP_MAX = 6;

function renderPanelComparar(){
  const panel = $("panel-comparar");
  if(!classes.length){ panel.innerHTML = emptyState(); return; }
  const rowsAll = allRows();
  panel.innerHTML = `
    <p class="panel-intro">Elige hasta ${CMP_MAX} estudiantes de cualquier clase o carrera para ver sus competencias lado a lado.</p>
    <div class="row">
      ${filterFieldsHtml("cmp", stCmp, rowsAll, ["clase","carrera","grupo"])}
      <div class="field"><label for="cmpQ">Buscar</label><input class="input" id="cmpQ" type="search" placeholder="Nombre o matrícula" value="${esc(stCmp.q)}"></div>
    </div>
    <div class="row">
      <div class="field grow"><label for="cmpStudent">Estudiante (<span id="cmpCount">0</span> disponibles)</label><select id="cmpStudent"></select></div>
      <button class="btn" type="button" id="cmpAdd">Agregar</button>
      <button class="btn ghost" type="button" id="cmpClear">Quitar todos</button>
      ${canRadar() ? `<div class="field"><label>Vista</label>${segHtml("cmpView",[{value:"radar",label:"Araña"},{value:"barras",label:"Barras"}], stCmp.view)}</div>` : ""}
    </div>
    <div class="chips" id="cmpChips"></div>
    <div id="cmpBody"></div>
  `;
  wireFilters("cmp", stCmp, syncComparar);
  $("cmpQ").oninput = debounce((e)=>{ stCmp.q = $("cmpQ").value; syncComparar(); }, 150);
  $("cmpAdd").onclick = ()=>{ const v = $("cmpStudent").value; if(v && stCmp.sel.length<CMP_MAX && !stCmp.sel.includes(v)){ stCmp.sel.push(v); syncComparar(); } };
  $("cmpStudent").ondblclick = ()=>$("cmpAdd").click();
  $("cmpClear").onclick = ()=>{ stCmp.sel = []; syncComparar(); };
  if($("cmpView")) wireSeg("cmpView", v=>{ stCmp.view = v; setSeg("cmpView", v); drawComparar(); });
  syncComparar();
}
function syncComparar(){
  const rowsAll = allRows();
  stCmp.sel = stCmp.sel.filter(k=>rowByKey(k));
  const avail = filterRows(rowsAll, stCmp).filter(r=>!stCmp.sel.includes(r.key)).sort(byName);
  const full = stCmp.sel.length >= CMP_MAX;
  const sel = $("cmpStudent");
  sel.innerHTML = avail.length ? optionsHtml(avail.map(r=>({value:r.key,label:r.st.nombre+"  ·  "+r.carrera+"  ·  "+r.cls.name})), null) : '<option value="">Ningún estudiante con ese filtro</option>';
  sel.disabled = !avail.length;
  $("cmpCount").textContent = avail.length;
  $("cmpAdd").disabled = !avail.length || full;
  $("cmpAdd").textContent = full ? "Máximo "+CMP_MAX : "Agregar";
  $("cmpClear").classList.toggle("hidden", !stCmp.sel.length);
  drawComparar();
}
function drawComparar(){
  const sel = stCmp.sel.map(rowByKey).filter(Boolean);
  $("cmpChips").innerHTML = sel.map((r,i)=>`<div class="chip" style="--swatch:${colorFor(i)}"><button class="name-link" type="button" data-profile="${esc(r.key)}" title="Ver perfil">${esc(r.st.nombre)}</button> <button type="button" data-k="${esc(r.key)}" title="Quitar" aria-label="Quitar">&times;</button></div>`).join("");
  $("cmpChips").querySelectorAll("button[data-k]").forEach(b=>{ b.onclick = ()=>{ stCmp.sel = stCmp.sel.filter(k=>k!==b.dataset.k); syncComparar(); }; });

  const body = $("cmpBody");
  if(!sel.length){ body.innerHTML = '<div class="placeholder">Todavía no has elegido estudiantes.<br>Usa los filtros, elige un estudiante y pulsa "Agregar" (o haz doble clic en la lista).</div>'; return; }
  const metrics = allMetrics();
  const series = sel.map((r,i)=>({ name:r.st.nombre, color:colorFor(i), values: metrics.map(m=>metricValue(r.cls,r.st,m)) }));
  const chart = stCmp.view==="radar" && canRadar()
    ? radarChartSVG(metrics.map(mLabel), series.map(s=>({...s, fillOpacity:0.1, strokeWidth:2})), {label:"Comparación de estudiantes"})
    : barChartHorizontalSVG(metrics.map(mLabel), series, {label:"Comparación de estudiantes"});
  body.innerHTML = `
    <div class="box">${chart}${legendRow(sel.map((r,i)=>({color:colorFor(i), label:r.st.nombre})))}
      <div class="legend-note">${METRIC_NOTE} Pasa el cursor sobre ${canRadar()?"un punto o ":""}una barra para ver su valor.</div></div>
    <div class="table-wrap mt"><table>
      <thead><tr><th class="sticky">Estudiante</th><th>Clase</th><th>Carrera</th><th>Grupo</th><th class="num">Índice</th>${metrics.map(m=>`<th class="num" title="${esc(metricHelp(m))}">${esc(mLabel(m))}</th>`).join("")}</tr></thead>
      <tbody>${sel.map((r,i)=>`<tr>
        <td class="sticky"><span class="legend-swatch" style="background:${colorFor(i)}"></span> <button class="name-link" type="button" data-profile="${esc(r.key)}">${esc(r.st.nombre)}</button></td>
        <td>${esc(r.cls.name)}</td><td>${esc(r.carrera)}</td><td>${esc(r.grupo)}</td>
        <td class="num ${heatClass(GENERAL,r.indice)}"><b>${fmt(r.indice)}</b></td>
        ${metrics.map(m=>{ const v = metricValue(r.cls,r.st,m); return `<td class="num ${heatClass(m,v)}">${fmtVal(v)}</td>`; }).join("")}
      </tr>`).join("")}</tbody>
    </table></div>`;
}

/* ---------- Perfil del estudiante (todos) ----------
   renderPanelPerfil dibuja los controles; syncPerfil actualiza la lista
   y el perfil. Flechas ← → del teclado: estudiante anterior/siguiente. */
const stPer = { clase:null, key:null, carrera:"all", grupo:"all", q:"", view:"radar", vsClase:true, vsCarrera:true, vsGlobal:false };

function openProfile(key){
  const r = rowByKey(key);
  if(!r || !canSee("perfil")) return;
  Object.assign(stPer, { clase:r.cls.id, key, carrera:"all", grupo:"all", q:"" });
  dirty.add("perfil");
  showTab("perfil");
  window.scrollTo({top:0, behavior:"smooth"});
}
function perfilContext(){
  if(!stPer.clase || !classes.some(c=>c.id===stPer.clase)) stPer.clase = classes[0].id;
  const cls = classes.find(c=>c.id===stPer.clase);
  const rowsCls = allRows().filter(r=>r.cls===cls);
  const list = filterRows(rowsCls, stPer).sort(byName);
  if(!list.some(r=>r.key===stPer.key)) stPer.key = list.length ? list[0].key : null;
  return { cls, rowsCls, list, idx: list.findIndex(r=>r.key===stPer.key) };
}
function renderPanelPerfil(){
  const panel = $("panel-perfil");
  if(!classes.length){ panel.innerHTML = emptyState(); return; }
  const { rowsCls } = perfilContext();
  panel.innerHTML = `
    <div class="row">
      <div class="field"><label for="pfClase">Clase</label><select id="pfClase">${optionsHtml(classes.map(c=>({value:c.id,label:c.name||"(sin nombre)"})), stPer.clase)}</select></div>
      ${filterFieldsHtml("pf", stPer, rowsCls, ["carrera","grupo"])}
      <div class="field"><label for="pfQ">Buscar</label><input class="input" id="pfQ" type="search" placeholder="Nombre o matrícula" value="${esc(stPer.q)}"></div>
    </div>
    <div class="row">
      <div class="field grow"><label for="pfStudent">Estudiante (<span id="pfCount">0</span>)</label><select id="pfStudent"></select></div>
      <button class="btn ghost" type="button" id="pfPrev" title="Anterior (tecla ←)" aria-label="Estudiante anterior">&#8592;</button>
      <button class="btn ghost" type="button" id="pfNext" title="Siguiente (tecla →)" aria-label="Estudiante siguiente">&#8594;</button>
      ${canRadar() ? `<div class="field"><label>Vista</label>${segHtml("pfView",[{value:"radar",label:"Araña"},{value:"barras",label:"Barras"}], stPer.view)}</div>` : ""}
      <button class="btn ghost" type="button" id="pfPrint" title="Imprimir o guardar como PDF">Imprimir</button>
    </div>
    <div id="pfBody"></div>
  `;
  $("pfClase").onchange = (e)=>{ Object.assign(stPer, {clase:e.target.value, key:null, carrera:"all", grupo:"all"}); renderPanelPerfil(); };
  wireFilters("pf", stPer, syncPerfil);
  $("pfQ").oninput = debounce(()=>{ stPer.q = $("pfQ").value; syncPerfil(); }, 150);
  $("pfStudent").onchange = (e)=>{ stPer.key = e.target.value; syncPerfil(); };
  $("pfPrev").onclick = ()=>stepPerfil(-1);
  $("pfNext").onclick = ()=>stepPerfil(1);
  $("pfPrint").onclick = ()=>window.print();
  if($("pfView")) wireSeg("pfView", v=>{ stPer.view = v; setSeg("pfView", v); syncPerfil(); });
  syncPerfil();
}
function stepPerfil(d){
  if(!classes.length) return;
  const { list, idx } = perfilContext();
  const n = idx + d;
  if(n<0 || n>=list.length) return;
  stPer.key = list[n].key;
  syncPerfil();
}
function syncPerfil(){
  const { cls, rowsCls, list, idx } = perfilContext();
  const sel = $("pfStudent");
  sel.innerHTML = list.length ? optionsHtml(list.map(r=>({value:r.key, label:r.st.nombre+(r.st.empresa?"  —  "+r.st.empresa:"")})), stPer.key) : '<option value="">Ningún estudiante con ese filtro</option>';
  sel.disabled = !list.length;
  $("pfCount").textContent = list.length;
  $("pfPrev").disabled = idx<=0;
  $("pfNext").disabled = idx<0 || idx>=list.length-1;
  $("pfPrint").disabled = idx<0;
  drawPerfil(cls, rowsCls, list[idx]);
}
function drawPerfil(cls, rowsCls, row){
  const body = $("pfBody");
  if(!row){ body.innerHTML = '<div class="placeholder">Ningún estudiante coincide con el filtro.</div>'; return; }
  const rowsAll = allRows();
  const metrics = cls.metrics;
  const vals = row.st.valores;
  const carRows = row.carrera!==SIN_CARRERA ? rowsAll.filter(r=>r.carrera===row.carrera) : [];
  const clsAvg = classAverages(cls);
  const carAvg = metrics.map(m=>avgOf(carRows,m));
  const globAvg = metrics.map(m=>avgOf(rowsAll,m));
  const ranking = rowsCls.slice().sort((a,b)=>(b.indice??-1)-(a.indice??-1));
  const pos = ranking.findIndex(r=>r.key===row.key)+1;
  const idxCls = avgOf(rowsCls, GENERAL), idxCar = carRows.length ? avgOf(carRows, GENERAL) : null;

  // Comparado con su clase: dónde destaca y dónde está por debajo (competencias positivas)
  const items = metrics.map((m,i)=>({ m, v:vals[i], d: clsAvg[i]===null ? null : vals[i]-clsAvg[i] }));
  const positives = items.filter(x=>!isRisk(x.m) && x.d!==null).sort((a,b)=>b.d-a.d);
  const strengths = positives.filter(x=>x.d>0).slice(0,4);
  const weak = positives.filter(x=>x.d<0).slice(-4).reverse();
  const risks = items.filter(x=>isRisk(x.m) && x.v>=60).sort((a,b)=>b.v-a.v);
  const li = (x, good)=>`<li><span title="${esc(metricHelp(x.m))}">${esc(x.m)}</span><span class="v">${fmt(x.v)}<span class="d ${x.d===null?"":(x.d>=0)===good?"pos":"neg"}">${x.d===null?"":fmtDiff(x.d)+" vs clase"}</span></span></li>`;

  const series = [], legend = [];
  if(stPer.vsGlobal){ series.push({name:"Promedio de todos", values:globAvg, color:GLOBALCOLOR, fillOpacity:0, strokeWidth:1.3, dash:"2,3", points:false}); legend.push({color:GLOBALCOLOR, label:"Promedio de todos", dash:true}); }
  if(stPer.vsCarrera && carRows.length){ series.push({name:"Promedio de "+row.carrera, values:carAvg, color:CARCOLOR, fillOpacity:0, strokeWidth:1.5, dash:"6,3", points:false}); legend.push({color:CARCOLOR, label:"Promedio de "+row.carrera, dash:true}); }
  if(stPer.vsClase){ series.push({name:"Promedio de "+cls.name, values:clsAvg, color:AVGCOLOR, fillOpacity:0.12, strokeWidth:1.4, dash:"4,3", points:false}); legend.push({color:AVGCOLOR, label:"Promedio de "+cls.name, dash:true}); }
  series.push({name:row.st.nombre, values:vals, color:cls.color, fillOpacity:0.28, strokeWidth:2.4});
  legend.push({color:cls.color, label:row.st.nombre});
  const labels = metrics.map(mLabel);
  const chart = stPer.view==="radar" && canRadar()
    ? radarChartSVG(labels, series, {label:"Perfil de "+row.st.nombre})
    : barChartHorizontalSVG(labels, series.slice().reverse(), {label:"Perfil de "+row.st.nombre});

  body.innerHTML = `
    <h2 class="print-only">${esc(row.st.nombre)} · ${esc(cls.name)}</h2>
    <div class="stat-row">
      <div class="stat" title="Promedio de sus competencias positivas"><div class="label">Índice del estudiante</div><div class="val" style="color:${cls.color}">${fmt(row.indice)}</div><div class="sub">Puesto ${pos} de ${ranking.length} en la clase</div></div>
      <div class="stat"><div class="label">Índice de la clase</div><div class="val" style="color:${AVGCOLOR}">${fmt(idxCls)}</div><div class="sub">${esc(cls.name)}</div></div>
      <div class="stat"><div class="label">Índice de su carrera</div><div class="val" style="color:${CARCOLOR}">${fmt(idxCar)}</div><div class="sub">${carRows.length ? plural(carRows.length,"estudiante","estudiantes")+(classes.length>1?" en tus clases":"") : "Carrera sin asignar"}</div></div>
      <div class="stat"><div class="label">Datos</div><div class="val" style="font-size:16px;padding-top:3px;">${esc(row.carrera)}</div><div class="sub">Grupo ${esc(row.grupo)}${row.info.matricula?" · "+esc(row.info.matricula):""}${row.st.empresa?" · "+esc(row.st.empresa):""}</div></div>
    </div>
    <div class="box">
      <div class="checks no-print" id="pfVs">
        <span class="muted">Comparar con:</span>
        <label><input type="checkbox" data-k="vsClase" ${stPer.vsClase?"checked":""}> su clase</label>
        <label><input type="checkbox" data-k="vsCarrera" ${stPer.vsCarrera?"checked":""} ${carRows.length?"":"disabled"}> su carrera</label>
        <label><input type="checkbox" data-k="vsGlobal" ${stPer.vsGlobal?"checked":""}> todos los estudiantes</label>
      </div>
      ${chart}${legendRow(legend)}
      <div class="legend-note">${METRIC_NOTE}</div>
    </div>
    <div class="two-col">
      <div class="box"><h3>Por encima de su clase</h3>${strengths.length ? `<ul class="insight-list">${strengths.map(x=>li(x,true)).join("")}</ul>` : '<p class="legend-note">Ninguna competencia por encima del promedio de la clase.</p>'}</div>
      <div class="box"><h3>Por debajo de su clase</h3>${weak.length ? `<ul class="insight-list">${weak.map(x=>li(x,true)).join("")}</ul>` : '<p class="legend-note">Ninguna competencia por debajo del promedio de la clase.</p>'}
        ${risks.length ? `<h3 class="sub-h">Alertas de riesgo (↓ valor alto)</h3><ul class="insight-list">${risks.map(x=>li(x,false)).join("")}</ul>` : ""}
      </div>
    </div>`;
  $("pfVs").querySelectorAll("input").forEach(cb=>{ cb.onchange = ()=>{ stPer[cb.dataset.k] = cb.checked; syncPerfil(); }; });
}

/* ---------- Tabla de estudiantes (todos) ----------
   El administrador escribe aquí la carrera y el grupo de cada estudiante.
   Se muestran 150 filas y se cargan más a pedido, para que sea ágil.  */
const stTbl = { clase:"all", carrera:"all", grupo:"all", q:"", sortCol:null, sortDir:1, soloSin:false, cols:"todas", limit:150 };
const TBL_PAGE = 150;

function renderPanelTabla(){
  const panel = $("panel-tabla");
  if(!classes.length){ panel.innerHTML = emptyState(); return; }
  const rowsAll = allRows();
  const sinCount = rowsAll.filter(r=>r.carrera===SIN_CARRERA).length;
  if(!sinCount || !isAdmin()) stTbl.soloSin = false;
  panel.innerHTML = `
    <div class="row">
      ${filterFieldsHtml("tbl", stTbl, rowsAll, ["clase","carrera","grupo"])}
      <div class="field"><label for="tblQ">Buscar</label><input class="input" id="tblQ" type="search" placeholder="Nombre, empresa o matrícula" value="${esc(stTbl.q)}"></div>
      <div class="field"><label>Columnas</label>${segHtml("tblCols",[{value:"todas",label:"Todas"},{value:"indice",label:"Solo índice"}], stTbl.cols)}</div>
      <button class="btn ghost" type="button" id="tblExport" title="Descarga lo que ves (con los filtros aplicados)">Exportar a Excel</button>
    </div>
    <div class="legend-note" style="margin:-6px 0 10px;">
      ${isAdmin() ? "Escribe la <b>carrera</b> o el <b>grupo</b> directamente en la tabla (Enter para guardar). Lo escrito a mano se ve en color y tiene prioridad sobre el listado; bórralo para volver al valor del listado.<br>" : ""}
      Colores: <span class="status on">alto</span> <span class="status off">bajo</span> (en las competencias ↓ es al revés). Clic en un encabezado para ordenar; clic en un nombre para ver su perfil.
      ${sinCount && isAdmin() ? `<br><label class="checks" style="display:inline-flex;padding:4px 0 0;"><input type="checkbox" id="tblSoloSin" ${stTbl.soloSin?"checked":""}> Mostrar solo los ${sinCount} estudiantes sin carrera</label>` : ""}
    </div>
    <div class="table-wrap" id="tblWrap"></div>
    <div class="row" style="margin-top:8px;align-items:center;">
      <span class="legend-note" id="tblCount" style="margin:0;"></span>
      <button class="btn ghost small hidden" type="button" id="tblMore"></button>
    </div>
    ${isAdmin() ? `<datalist id="dlCarreras">${distinct(rowsAll.map(r=>r.info.carrera).concat(roster.map(r=>r.carrera)).filter(Boolean)).map(c=>`<option value="${esc(c)}">${esc(carreraNames[c]||"")}</option>`).join("")}</datalist>
    <datalist id="dlGrupos">${distinct(rowsAll.map(r=>r.info.grupo).concat(roster.map(r=>r.grupo)).filter(Boolean)).map(c=>`<option value="${esc(c)}">`).join("")}</datalist>` : ""}
  `;
  const reset = ()=>{ stTbl.limit = TBL_PAGE; drawTabla(); };
  wireFilters("tbl", stTbl, reset);
  $("tblQ").oninput = debounce(()=>{ stTbl.q = $("tblQ").value; reset(); }, 150);
  wireSeg("tblCols", v=>{ stTbl.cols = v; setSeg("tblCols", v); drawTabla(); });
  $("tblExport").onclick = exportTabla;
  $("tblMore").onclick = ()=>{ stTbl.limit += TBL_PAGE*2; drawTabla(); };
  if($("tblSoloSin")) $("tblSoloSin").onchange = (e)=>{ stTbl.soloSin = e.target.checked; reset(); };

  // eventos delegados (un solo manejador para toda la tabla)
  const wrap = $("tblWrap");
  wrap.addEventListener("click", (e)=>{
    const th = e.target.closest("th.sortable"); if(!th) return;
    const c = th.dataset.col;
    if(stTbl.sortCol===c) stTbl.sortDir *= -1; else { stTbl.sortCol = c; stTbl.sortDir = th.classList.contains("num") ? -1 : 1; }
    drawTabla();
  });
  wrap.addEventListener("change", (e)=>{
    const inp = e.target.closest(".cell-input"); if(!inp) return;
    const r = rowByKey(inp.closest("tr").dataset.k);
    if(r) setOverride(r, inp.dataset.f, inp.value, inp);
  });
  wrap.addEventListener("keydown", (e)=>{ if(e.key==="Enter" && e.target.classList.contains("cell-input")) e.target.blur(); });
  drawTabla();
}
const SORT_GETTERS = {
  "Clase": r=>r.cls.name, "Estudiante": r=>r.st.nombre, "Matrícula": r=>r.info.matricula,
  "Carrera": r=>r.carrera, "Grupo": r=>r.grupo, "Empresa": r=>r.st.empresa||"", "Índice": r=>r.indice
};
function tablaRows(){
  const metrics = allMetrics();
  let rows = filterRows(allRows(), stTbl);
  if(stTbl.soloSin) rows = rows.filter(r=>r.carrera===SIN_CARRERA);
  const c = stTbl.sortCol, dir = stTbl.sortDir;
  if(c){
    const g = SORT_GETTERS[c] || (r=>metricValue(r.cls,r.st,c));
    rows = rows.slice().sort((a,b)=>{
      const va = g(a), vb = g(b);
      if(typeof va==="number" || typeof vb==="number") return ((va??-1)-(vb??-1))*dir;
      return String(va).localeCompare(String(vb),"es",{numeric:true})*dir;
    });
  }
  return { rows, metrics };
}
function drawTabla(){
  const { rows, metrics } = tablaRows();
  const shownMetrics = stTbl.cols==="todas" ? metrics : [];
  const cols = ["Estudiante","Clase","Matrícula","Carrera","Grupo","Empresa","Índice", ...shownMetrics];
  const numCols = new Set(["Índice", ...metrics]);
  const admin = isAdmin();
  const head = cols.map(c=>{
    const lab = metrics.includes(c) ? mLabel(c) : c;
    const sorted = stTbl.sortCol===c;
    const tip = c==="Índice" ? metricHelp(GENERAL) : metrics.includes(c) ? metricHelp(c) : "Ordenar por "+c.toLowerCase();
    return `<th class="sortable ${numCols.has(c)?"num":""} ${sorted?"sorted":""} ${c==="Estudiante"?"sticky":""}" data-col="${esc(c)}" title="${esc(tip)}">${esc(lab)}${sorted?(stTbl.sortDir>0?" ▲":" ▼"):""}</th>`;
  }).join("");
  const visible = rows.slice(0, stTbl.limit);
  const body = visible.map(r=>{
    const i = r.info;
    const carreraCell = admin
      ? `<td><input class="cell-input ${i.manualCarrera?"manual":""}" data-f="carrera" list="dlCarreras" value="${esc(i.carrera)}" placeholder="${esc(i.autoCarrera||"escribir…")}" title="${i.manualCarrera?"Escrita a mano":(i.enListado?"Tomada del listado":"Sin carrera")}${i.carrera&&carreraNames[i.carrera]?" · "+esc(carreraNames[i.carrera]):""}" aria-label="Carrera"></td>
         <td><input class="cell-input ${i.manualGrupo?"manual":""}" data-f="grupo" list="dlGrupos" value="${esc(i.grupo)}" placeholder="${esc(i.autoGrupo||"escribir…")}" aria-label="Grupo"></td>`
      : `<td title="${esc(carreraNames[i.carrera]||"")}">${esc(r.carrera)}</td><td>${esc(r.grupo)}</td>`;
    return `<tr data-k="${esc(r.key)}">
      <td class="sticky"><button class="name-link" type="button" data-profile="${esc(r.key)}">${esc(r.st.nombre)}</button></td>
      <td><span class="class-tag" style="background:${r.cls.color}" title="${esc(r.cls.name)}">${esc(r.cls.name)}</span></td>
      <td>${esc(i.matricula)}</td>
      ${carreraCell}
      <td>${esc(r.st.empresa||"")}</td>
      <td class="num ${heatClass(GENERAL,r.indice)}"><b>${fmt(r.indice)}</b></td>
      ${shownMetrics.map(m=>{ const v = metricValue(r.cls,r.st,m); return `<td class="num ${heatClass(m,v)}">${fmtVal(v)}</td>`; }).join("")}
    </tr>`;
  }).join("");
  $("tblWrap").innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted" style="padding:20px;">Ningún estudiante coincide con el filtro.</td></tr>`}</tbody></table>`;
  $("tblCount").textContent = rows.length > visible.length
    ? "Mostrando "+visible.length+" de "+plural(rows.length,"estudiante","estudiantes")+"."
    : "Mostrando "+plural(rows.length,"estudiante","estudiantes")+".";
  const more = $("tblMore");
  more.classList.toggle("hidden", rows.length <= visible.length);
  more.textContent = "Mostrar "+Math.min(TBL_PAGE*2, rows.length-visible.length)+" más";
}
function setOverride(r, field, value, inp){
  const key = nameKey(r.st.nombre);
  let v = value.trim();
  if(field==="carrera") v = v.toUpperCase();
  const auto = field==="carrera" ? r.info.autoCarrera : r.info.autoGrupo;
  const ov = { ...(overrides[key] || {}) };
  if(!v || v===auto) delete ov[field]; else ov[field] = v;
  if(Object.keys(ov).length) overrides[key] = ov; else delete overrides[key];
  saveData();
  if(inp){ inp.value = v || auto; inp.classList.toggle("manual", !!ov[field]); }
  // el resto se actualiza al abrir cada pestaña; la tabla no se redibuja para no perder el foco
  renderSidebar();
  renderPublishBanner();
  renderPanels("tabla");
}
function exportTabla(){
  const { rows, metrics } = tablaRows();
  const aoa = [["Estudiante","Clase","Matrícula","Carrera","Nombre de la carrera","Grupo","Empresa","Índice general", ...metrics]];
  rows.forEach(r=> aoa.push([r.st.nombre, r.cls.name, r.info.matricula, r.info.carrera, carreraNames[r.info.carrera]||"", r.info.grupo, r.st.empresa||"",
    r.indice===null?null:+r.indice.toFixed(2), ...metrics.map(m=>metricValue(r.cls,r.st,m))]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = aoa[0].map((h,i)=>({ wch: i===0 ? 34 : i<8 ? Math.max(10, String(h).length+2) : 12 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Estudiantes");
  XLSX.writeFile(wb, "estudiantes-comparador.xlsx");
  toast("Excel descargado con "+plural(rows.length,"estudiante","estudiantes")+".");
}

/* ---------- Administración (solo admin) ----------
   Tres pasos:  1 Usuarios  →  2 Asignar clases  →  3 Publicar           */
let adminTab = "usuarios";     // usuarios | asignar | publicar
let editingUser = null;        // null = formulario cerrado · "" = nuevo · "usuario" = editar
let createdInfo = null;        // {usuario, pass} para mostrar la contraseña recién creada
let highlightClass = null;     // clase a resaltar en "Asignar clases"

function classesOf(usuario){ return classes.filter(c=>(c.asignados||[]).includes(usuario)); }
function adminStatus(){
  const users = assignableUsers();
  const sinAsignar = classes.filter(c=>!(c.asignados||[]).length).length;
  const pendU = hasUnpublishedUsers(), pendD = hasUnpublishedData();
  return {
    usuarios: { txt: plural(userDb.users.length,"usuario","usuarios"), warn: userDb.users.some(u=>!hasKeys(u)) },
    asignar:  { txt: !classes.length ? "Sin clases cargadas" : sinAsignar ? sinAsignar+" sin asignar" : "Todas asignadas", warn: !!sinAsignar && !!users.length },
    publicar: { txt: pendU||pendD ? "Cambios pendientes" : "Todo publicado", warn: pendU||pendD }
  };
}
function stepsHtml(){
  const st = adminStatus();
  const step = (n,id,title)=>`<button type="button" class="step ${adminTab===id?"active":""} ${st[id].warn?"warn":""}" data-admin-tab="${id}">
      <span class="n">${n}</span><span><b>${title}</b><small>${esc(st[id].txt)}</small></span></button>`;
  return step(1,"usuarios","Usuarios") + step(2,"asignar","Asignar clases") + step(3,"publicar","Publicar");
}
function refreshAdminChrome(){
  if($("adminSteps")) $("adminSteps").innerHTML = stepsHtml();
  renderPublishBanner();
}
function renderPanelUsuarios(){
  const panel = $("panel-usuarios");
  panel.innerHTML = `<div class="steps" id="adminSteps">${stepsHtml()}</div><div id="adminBody"></div>`;
  if(adminTab==="asignar") drawAdminAsignar();
  else if(adminTab==="publicar") drawAdminPublicar();
  else drawAdminUsuarios();
}
function goAdmin(tab){
  adminTab = tab;
  dirty.add("usuarios");
  if(activeTab==="usuarios") renderActive(); else showTab("usuarios");
  window.scrollTo({top:0, behavior:"smooth"});
}

/* ----- Paso 1: usuarios ----- */
function genPassword(){
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";      // sin letras que se confunden (l, 1, o, 0, i)
  const r = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(r, b=>abc[b % abc.length]).join("");
  return s.slice(0,4)+"-"+s.slice(4,8)+"-"+s.slice(8,12);
}
function drawAdminUsuarios(){
  const u = editingUser ? findUser(editingUser) : null;
  const formOpen = editingUser !== null;
  const formRol = u ? u.rol : "maestro";
  const assigned = new Set(u ? classesOf(u.usuario).map(c=>c.id) : []);
  $("adminBody").innerHTML = `
    ${createdInfo ? `<div class="notice ok">
        <b>Contraseña de ${esc(createdInfo.usuario)}:</b> <code class="pass" id="createdPass">${esc(createdInfo.pass)}</code>
        <button class="btn ghost small" type="button" id="copyPass">Copiar</button>
        <button class="link" type="button" id="closeCreated" style="float:right">Cerrar</button>
        <div class="legend-note" style="margin-top:4px;">Entrégasela a la persona ahora: por seguridad no se guarda y no se puede volver a ver. Si la pierde, genera otra.</div>
      </div>` : ""}
    <div class="row">
      <button class="btn" type="button" id="uNew">+ Nuevo usuario</button>
      <div class="field grow" style="min-width:180px;"><input class="input" type="search" id="uFilter" placeholder="Buscar usuario…" aria-label="Buscar usuario"></div>
    </div>
    ${formOpen ? `
    <div class="box" id="uFormBox">
      <h3>${u ? "Editar a "+esc(u.nombre||u.usuario) : "Nuevo usuario"}</h3>
      <form id="uForm" class="form-grid" autocomplete="off">
        <div class="field"><label for="uNombre">Nombre completo</label><input class="input" type="text" id="uNombre" value="${u?esc(u.nombre||""):""}" placeholder="ej. Juan Pérez"></div>
        <div class="field"><label for="uUsuario">Usuario (para entrar)</label><input class="input" type="text" id="uUsuario" value="${u?esc(u.usuario):""}" ${u?"disabled":""} placeholder="ej. jperez" autocapitalize="none" spellcheck="false"></div>
        <div class="field"><label for="uRol">Rol</label><select id="uRol">${optionsHtml(Object.keys(ROLES).map(k=>({value:k,label:ROLES[k]})), formRol)}</select></div>
        <div class="field"><label for="uPass">${u?"Nueva contraseña (opcional)":"Contraseña"}</label>
          <div class="pass-row">
            <input class="input" type="password" id="uPass" autocomplete="new-password" placeholder="${u?(hasKeys(u)?"Vacío = no cambiar":"Obligatoria: aún no tiene llave"):"Mínimo 6 caracteres"}">
            <button class="btn ghost small" type="button" id="uShow" title="Mostrar / ocultar">👁</button>
            <button class="btn ghost small" type="button" id="uGen" title="Crear una contraseña segura">Generar</button>
          </div>
        </div>
      </form>
      <label class="check"><input type="checkbox" id="uActivo" ${!u||u.activo?"checked":""}> Activo (puede entrar)</label>
      <div class="field ${formRol==="admin"?"hidden":""}" id="uClassesBox" style="margin-top:6px;">
        <label>Clases que puede ver</label>
        ${classes.length ? `<div class="assign-list cols">${classes.map(c=>`
          <label><input type="checkbox" data-c="${esc(c.id)}" ${assigned.has(c.id)?"checked":""}>
            <span class="legend-swatch" style="background:${c.color}"></span> ${esc(c.name)} <span class="count">${c.students.length}</span></label>`).join("")}</div>`
          : '<div class="legend-note" style="margin:0;">Aún no hay clases cargadas. Podrás asignarlas después en el paso 2.</div>'}
      </div>
      <div class="legend-note ${formRol==="admin"?"":"hidden"}" id="uAdminNote">Los administradores ven todas las clases.</div>
      <div class="row" style="margin:14px 0 0;">
        <button class="btn" type="button" id="uSave">${u?"Guardar cambios":"Crear usuario"}</button>
        <button class="btn ghost" type="button" id="uCancel">Cancelar</button>
      </div>
      <div class="err-inline" id="uErr" role="alert"></div>
    </div>` : ""}

    <div class="table-wrap">
      <table id="uTable">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Ve estas clases</th><th>Activo</th><th></th></tr></thead>
        <tbody>${userDb.users.map(x=>{
          const cl = classesOf(x.usuario), me = x.usuario===currentUser.usuario;
          return `<tr data-q="${esc(normText(x.nombre+" "+x.usuario))}">
            <td><b>${esc(x.nombre||x.usuario)}</b>${me?' <span class="muted">(tú)</span>':""}${hasKeys(x)?"":` <button class="status off as-btn" type="button" data-edit-user="${esc(x.usuario)}" title="Creado con una versión anterior: ponle una contraseña nueva para que pueda abrir sus clases">Sin llave · arreglar</button>`}</td>
            <td>${esc(x.usuario)}</td>
            <td><span class="role-badge ${x.rol}">${esc(ROLES[x.rol]||x.rol)}</span></td>
            <td style="white-space:normal;max-width:260px;">${x.rol==="admin" ? '<span class="muted">Todas</span>'
                : cl.length ? cl.map(c=>`<span class="class-tag" style="background:${c.color}">${esc(c.name)}</span>`).join(" ")
                : `<button class="link" type="button" data-admin-tab="asignar">Asignar clases</button>`}</td>
            <td><label class="switch" title="${me?"No puedes desactivarte a ti mismo":(x.activo?"Activo: puede entrar":"Inactivo: no puede entrar")}"><input type="checkbox" data-act="toggle" data-u="${esc(x.usuario)}" ${x.activo?"checked":""} ${me?"disabled":""}><span></span></label></td>
            <td class="actions">
              <button class="btn ghost small" type="button" data-act="edit" data-u="${esc(x.usuario)}">Editar</button>
              ${x.rol!=="admin" ? `<button class="btn ghost small" type="button" data-act="preview" data-u="${esc(x.usuario)}" title="Ver la aplicación como la ve esta persona">Ver como</button>` : ""}
              ${me ? "" : `<button class="btn danger small" type="button" data-act="del" data-u="${esc(x.usuario)}" title="Eliminar">&times;</button>`}
            </td>
          </tr>`; }).join("")}
        </tbody>
      </table>
    </div>
    <div class="legend-note">
      <b>Maestro:</b> resumen, carreras, comparar estudiantes, perfil y tabla de sus clases (gráficos de barras). &nbsp; <b>Decano:</b> lo mismo, más gráfico araña y comparación entre carreras. &nbsp; <b>Administrador:</b> todo.
      &nbsp;·&nbsp; <button class="link" type="button" id="uImport">Importar usuarios.json</button><input type="file" id="uImportFile" accept=".json,application/json">
    </div>
  `;
  $("uNew").onclick = ()=>{ editingUser = ""; createdInfo = null; drawAdminUsuarios(); $("uNombre").focus(); };
  $("uFilter").oninput = ()=>{ const q = normText($("uFilter").value); $("uTable").querySelectorAll("tbody tr").forEach(tr=>tr.classList.toggle("hidden", !!q && !tr.dataset.q.includes(q))); };
  $("uImport").onclick = ()=>$("uImportFile").click();
  $("uImportFile").onchange = (e)=>{ if(e.target.files[0]) importUsers(e.target.files[0]); e.target.value=""; };
  if(createdInfo){
    $("copyPass").onclick = async()=>{ try{ await navigator.clipboard.writeText(createdInfo.pass); toast("Contraseña copiada."); }catch(e){ const r = document.createRange(); r.selectNodeContents($("createdPass")); getSelection().removeAllRanges(); getSelection().addRange(r); } };
    $("closeCreated").onclick = ()=>{ createdInfo = null; drawAdminUsuarios(); };
  }
  if(formOpen){
    $("uForm").onsubmit = (e)=>{ e.preventDefault(); saveUserForm(); };
    $("uFormBox").querySelectorAll("input").forEach(i=>i.onkeydown = (e)=>{ if(e.key==="Enter" && i.type!=="checkbox"){ e.preventDefault(); saveUserForm(); } });
    $("uSave").onclick = saveUserForm;
    $("uCancel").onclick = ()=>{ editingUser = null; drawAdminUsuarios(); };
    $("uRol").onchange = ()=>{ const a = $("uRol").value==="admin"; $("uClassesBox").classList.toggle("hidden", a); $("uAdminNote").classList.toggle("hidden", !a); };
    $("uShow").onclick = ()=>{ const p = $("uPass"); p.type = p.type==="password" ? "text" : "password"; };
    $("uGen").onclick = ()=>{ const p = $("uPass"); p.value = genPassword(); p.type = "text"; p.select(); };
    $("uNombre").oninput = ()=>{      // sugerir usuario a partir del nombre: "Juan Pérez" -> "jperez"
      if(u || $("uUsuario").dataset.touched) return;
      const t = normText($("uNombre").value).toLowerCase().split(" ").filter(Boolean);
      $("uUsuario").value = t.length>1 ? t[0][0]+t[t.length-1] : (t[0]||"");
    };
    $("uUsuario").oninput = ()=>{ $("uUsuario").dataset.touched = "1"; };
  }
  $("uTable").addEventListener("click", (e)=>{
    const b = e.target.closest("button[data-act]"); if(!b) return;
    const name = b.dataset.u;
    if(b.dataset.act==="edit"){ editingUser = name; createdInfo = null; drawAdminUsuarios(); $("uFormBox").scrollIntoView({behavior:"smooth", block:"center"}); }
    else if(b.dataset.act==="preview") startPreview(name);
    else if(b.dataset.act==="del") deleteUser(name);
  });
  $("uTable").addEventListener("change", (e)=>{ const cb = e.target.closest('input[data-act="toggle"]'); if(cb) toggleUser(cb.dataset.u, cb); });
}
function userError(msg){ $("uErr").textContent = msg; }
function wouldLeaveNoAdmin(target, newRol, newActivo){
  if(target.rol!=="admin" || !target.activo) return false;
  if(newRol==="admin" && newActivo) return false;
  return activeAdmins().length <= 1;
}
function setAssignments(usuario, ids){
  let changed = false;
  classes.forEach(c=>{
    const set = new Set(c.asignados||[]);
    const want = ids.has(c.id), has = set.has(usuario);
    if(want && !has){ set.add(usuario); changed = true; }
    if(!want && has){ set.delete(usuario); changed = true; }
    c.asignados = [...set];
  });
  return changed;
}
let savingUser = false;
async function saveUserForm(){
  if(savingUser) return;
  const isNew = editingUser === "";
  const usuario = $("uUsuario").value.trim();
  const nombre = $("uNombre").value.trim();
  const rol = $("uRol").value;
  const pass = $("uPass").value;
  const activo = $("uActivo").checked;
  const ids = new Set([...document.querySelectorAll("#uClassesBox input[data-c]:checked")].map(i=>i.dataset.c));
  let target;
  if(!isNew){
    target = findUser(editingUser);
    if(!target){ editingUser = null; return drawAdminUsuarios(); }
    if(pass && pass.length<6) return userError("La contraseña debe tener al menos 6 caracteres.");
    if(!pass && !hasKeys(target)) return userError("Este usuario aún no tiene llave: ponle una contraseña nueva (puedes usar Generar).");
    if(target.usuario===currentUser.usuario && (!activo || rol!=="admin")) return userError("No puedes quitarte el rol de administrador ni desactivarte a ti mismo.");
    if(wouldLeaveNoAdmin(target, rol, activo)) return userError("Debe quedar al menos un administrador activo.");
  } else {
    if(!nombre) return userError("Escribe el nombre de la persona.");
    if(!/^[A-Za-z0-9._-]{3,30}$/.test(usuario)) return userError("El usuario debe tener de 3 a 30 caracteres, sin espacios ni acentos (ej. jperez).");
    if(findUser(usuario)) return userError('Ya existe el usuario "'+usuario+'". Elige otro.');
    if(!pass || pass.length<6) return userError("Escribe una contraseña de al menos 6 caracteres, o pulsa Generar.");
    target = { usuario, nombre, rol, activo };
  }
  savingUser = true;
  $("uSave").disabled = true; $("uSave").textContent = "Guardando…";
  try{
    if(pass) await setUserPassword(target, pass);
    target.nombre = nombre; target.rol = rol; target.activo = activo;
    if(isNew) userDb.users.push(target);
    if(target.usuario===currentUser.usuario){ currentUser = target; updateUserBox(); }
    const assignChanged = setAssignments(target.usuario, rol==="admin" ? new Set() : ids);
    saveUsers();
    if(assignChanged || pass) saveData();          // llaves o asignaciones nuevas: hay que volver a publicar las clases
    createdInfo = pass ? { usuario: target.usuario, pass } : null;
    editingUser = null;
    renderSidebar(); refreshAdminChrome(); drawAdminUsuarios();
    toast((isNew ? "Usuario creado." : "Cambios guardados.")+" Publica para que surta efecto.");
  }catch(err){
    console.error(err); userError("No se pudo guardar: "+err.message);
    $("uSave").disabled = false; $("uSave").textContent = isNew ? "Crear usuario" : "Guardar cambios";
  }finally{ savingUser = false; }
}
function toggleUser(name, cb){
  const u = findUser(name); if(!u) return;
  if(u.usuario===currentUser.usuario || wouldLeaveNoAdmin(u, u.rol, !u.activo)){
    if(cb) cb.checked = u.activo;
    return toast(u.usuario===currentUser.usuario ? "No puedes desactivarte a ti mismo." : "Debe quedar al menos un administrador activo.", "error");
  }
  u.activo = !u.activo;
  saveUsers(); refreshAdminChrome();
  if(cb) cb.parentElement.title = u.activo ? "Activo: puede entrar" : "Inactivo: no puede entrar";
  toast((u.nombre||u.usuario)+(u.activo?" activado.":" desactivado.")+" Publica para que surta efecto.");
}
function deleteUser(name){
  const u = findUser(name); if(!u) return;
  if(u.usuario===currentUser.usuario) return toast("No puedes eliminar tu propio usuario.", "error");
  if(wouldLeaveNoAdmin(u, null, false)) return toast("Debe quedar al menos un administrador activo.", "error");
  if(!confirm('¿Eliminar a "'+(u.nombre||u.usuario)+'"? Dejará de poder entrar cuando publiques.')) return;
  userDb.users = userDb.users.filter(x=>x!==u);
  if(setAssignments(u.usuario, new Set())) saveData();
  if(editingUser===u.usuario) editingUser = null;
  saveUsers(); renderSidebar(); refreshAdminChrome(); drawAdminUsuarios();
  toast('Usuario eliminado. Publica para que surta efecto.');
}

/* ----- Paso 2: asignar clases (cuadro clase × persona) ----- */
function drawAdminAsignar(){
  const users = assignableUsers();
  const body = $("adminBody");
  if(!classes.length){ body.innerHTML = `<div class="placeholder">Aún no hay clases. Súbelas con "Cargar archivos" en la barra lateral.</div>`; return; }
  if(!users.length){ body.innerHTML = `<div class="placeholder">No hay maestros ni decanos todavía.<br><br><button class="btn" type="button" data-admin-tab="usuarios" data-new-user>Crear el primero</button></div>`; return; }
  body.innerHTML = `
    <p class="panel-intro">Marca qué clases ve cada persona. Los administradores ven todas. Los cambios se guardan al instante; luego publícalos en el paso 3.</p>
    <div class="table-wrap matrix-wrap">
      <table class="matrix" id="mxTable">
        <thead><tr><th class="sticky">Clase</th>${users.map(u=>`<th class="center" title="${esc(ROLES[u.rol])}${u.activo?"":" · inactivo"}">
          <div>${esc(u.nombre||u.usuario)}</div><span class="role-badge ${u.rol}">${esc(ROLES[u.rol])}</span>
          ${hasKeys(u) ? "" : `<button class="status off as-btn" type="button" data-edit-user="${esc(u.usuario)}" title="No podrá abrir sus clases hasta que le pongas una contraseña nueva">sin llave</button>`}
          <button class="link tiny" type="button" data-col="${esc(u.usuario)}">todas / ninguna</button></th>`).join("")}</tr></thead>
        <tbody>${classes.map(c=>`<tr class="${c.id===highlightClass?"flash":""}">
          <td class="sticky"><span class="legend-swatch" style="background:${c.color}"></span> <b>${esc(c.name)}</b> <span class="count">${c.students.length} est.</span>
            ${(c.asignados||[]).length ? "" : ' <span class="status off">sin asignar</span>'}</td>
          ${users.map(u=>`<td class="center"><input type="checkbox" class="big-check" data-c="${esc(c.id)}" data-u="${esc(u.usuario)}" ${(c.asignados||[]).includes(u.usuario)?"checked":""} aria-label="${esc(c.name)} para ${esc(u.nombre||u.usuario)}"></td>`).join("")}
        </tr>`).join("")}</tbody>
      </table>
    </div>
    <div class="row mt"><button class="btn" type="button" data-admin-tab="publicar">Siguiente: publicar →</button></div>
  `;
  highlightClass = null;
  const mx = $("mxTable");
  mx.addEventListener("change", (e)=>{
    const cb = e.target.closest("input[data-c]"); if(!cb) return;
    const c = classes.find(x=>x.id===cb.dataset.c); if(!c) return;
    const set = new Set(c.asignados||[]);
    if(cb.checked) set.add(cb.dataset.u); else set.delete(cb.dataset.u);
    c.asignados = [...set];
    const who = findUser(cb.dataset.u);
    if(cb.checked && who && !hasKeys(who)) toast((who.nombre||who.usuario)+" no podrá abrir esta clase hasta que le pongas una contraseña nueva (Usuarios → Sin llave · arreglar).", "error");
    const tag = cb.closest("tr").querySelector("td .status.off");
    if(tag && set.size) tag.remove();
    saveData(); renderSidebar(); refreshAdminChrome();
  });
  mx.addEventListener("click", (e)=>{
    const b = e.target.closest("button[data-col]"); if(!b) return;
    const boxes = [...mx.querySelectorAll(`input[data-u="${CSS.escape(b.dataset.col)}"]`)];
    const on = !boxes.every(x=>x.checked);
    boxes.forEach(x=>{ if(x.checked!==on){ x.checked = on; x.dispatchEvent(new Event("change", {bubbles:true})); } });
  });
}

/* ----- Paso 3: publicar (directo a GitHub o a mano) ----- */
const GH_KEY = "pp_github";
function ghConfig(){ return store.get(GH_KEY, null); }
function ghGuess(){
  // en GitHub Pages la dirección es  https://USUARIO.github.io/REPOSITORIO/
  const h = location.hostname, seg = location.pathname.split("/").filter(Boolean);
  if(/\.github\.io$/i.test(h)) return { owner: h.split(".")[0], repo: seg[0] && !/\.html?$/i.test(seg[0]) ? seg[0] : h };
  return { owner:"", repo:"" };
}
function ghHeaders(token){ return { "Authorization":"Bearer "+token, "Accept":"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28" }; }
async function ghConnect(owner, repo, token){
  const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers: ghHeaders(token) });
  if(r.status===401) throw new Error("el token no es válido o expiró");
  if(r.status===404) throw new Error("no encontré el repositorio, o el token no tiene acceso a él");
  if(!r.ok) throw new Error("GitHub respondió "+r.status);
  const j = await r.json();
  if(j.permissions && !j.permissions.push) throw new Error("el token no tiene permiso de escritura (Contents: Read and write)");
  const cfg = { owner:j.owner.login, repo:j.name, branch:j.default_branch || "main", token };
  store.set(GH_KEY, cfg);
  return cfg;
}
async function ghPut(cfg, path, text, message){
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path}`;
  let sha;
  const g = await fetch(url+"?ref="+encodeURIComponent(cfg.branch)+"&t="+Date.now(), { headers: ghHeaders(cfg.token), cache:"no-store" });
  if(g.ok) sha = (await g.json()).sha;
  else if(g.status!==404) throw new Error("no pude leer "+path+" ("+g.status+")");
  const body = { message, content: b64(te.encode(text)), branch: cfg.branch };
  if(sha) body.sha = sha;
  const r = await fetch(url, { method:"PUT", headers: { ...ghHeaders(cfg.token), "Content-Type":"application/json" }, body: JSON.stringify(body) });
  if(!r.ok){
    const t = await r.json().catch(()=>({}));
    throw new Error("no pude guardar "+path+" ("+r.status+(t.message?": "+t.message:"")+")");
  }
}
function usersExport(){
  return { updatedAt: userDb.updatedAt || Date.now(), users: userDb.users.map(u=>{
    const o = { usuario:u.usuario, nombre:u.nombre||"", rol:u.rol, activo:!!u.activo };
    if(u.auth){ o.auth = u.auth; o.pub = u.pub; o.priv = u.priv; } else if(u.hash) o.hash = u.hash;
    return o; }) };
}
let publishing = false;
async function publishNow(btn){
  const cfg = ghConfig();
  if(!cfg) return goAdmin("publicar");
  if(publishing) return;
  publishing = true;
  const label = btn ? btn.textContent : "";
  if(btn){ btn.disabled = true; btn.textContent = "Publicando…"; }
  try{
    const who = currentUser.nombre || currentUser.usuario;
    const datos = await buildPublished();
    const users = usersExport();
    await ghPut(cfg, "usuarios.json", JSON.stringify(users, null, 2), "Actualizar usuarios ("+who+")");
    await ghPut(cfg, "datos.json", JSON.stringify(datos), "Actualizar clases ("+who+")");
    published = datos; publishedStatus = "ok";
    remoteUpdatedAt = userDb.updatedAt;
    store.set("pp_lastpub", { at: Date.now(), by: who });
    refreshAdminChrome(); renderSidebar();
    if(activeTab==="usuarios" && adminTab==="publicar") drawAdminPublicar();
    toast("¡Publicado! En uno o dos minutos los maestros y decanos verán los cambios al recargar la página.");
  }catch(err){
    console.error(err);
    toast("No se pudo publicar: "+err.message, "error");
    if(btn){ btn.disabled = false; btn.textContent = label; }
  }finally{ publishing = false; }
}
function drawAdminPublicar(){
  const cfg = ghConfig(), guess = ghGuess();
  const pendU = hasUnpublishedUsers(), pendD = hasUnpublishedData();
  const pending = pendU || pendD;
  const noKeys = assignedUsersMissingKeys();
  const sinAsignar = classes.filter(c=>!(c.asignados||[]).length);
  const last = store.get("pp_lastpub", null);
  const issues = [];
  noKeys.forEach(n=>{ const x = findUser(n);
    issues.push(`<b>${esc(x.nombre||x.usuario)}</b> tiene clases asignadas pero no podrá abrirlas: su usuario se creó con una versión anterior y no tiene llave. <button class="link" type="button" data-edit-user="${esc(x.usuario)}">Ponerle una contraseña nueva</button>`); });
  if(sinAsignar.length && assignableUsers().length) issues.push(`${plural(sinAsignar.length,"clase no está asignada","clases no están asignadas")} a nadie (${sinAsignar.map(c=>esc(c.name)).join(", ")}). <button class="link" type="button" data-admin-tab="asignar">Asignar</button>.`);
  $("adminBody").innerHTML = `
    <div class="box pub-status ${pending?"pending":"done"}">
      <div class="big">${pending ? "Tienes cambios sin publicar" : "Todo está publicado"}</div>
      <div class="legend-note" style="margin:4px 0 0;">${pending
        ? "Los maestros y decanos solo ven lo publicado. Pendiente: "+[pendU?"usuarios":"", pendD?"clases y asignaciones":""].filter(Boolean).join(" y ")+"."
        : "Los maestros y decanos ven la versión actual."}${last ? " Última publicación desde este equipo: "+new Date(last.at).toLocaleString("es")+"." : ""}</div>
      ${issues.length ? `<ul class="issues">${issues.map(i=>`<li>${i}</li>`).join("")}</ul>` : ""}
      ${cfg ? `<div class="row" style="margin:14px 0 0;"><button class="btn" type="button" id="pubNow" ${pending?"":""}>${pending?"Publicar ahora":"Publicar de nuevo"}</button></div>` : ""}
    </div>

    <div class="box mt">
      <h3>Publicación directa en GitHub ${cfg ? '<span class="status on">conectado</span>' : ""}</h3>
      ${cfg ? `
        <p class="legend-note" style="margin:0 0 10px;">Publicando en <b>${esc(cfg.owner)}/${esc(cfg.repo)}</b> (rama ${esc(cfg.branch)}). Con un clic se actualizan usuarios.json y datos.json.</p>
        <button class="btn ghost small" type="button" id="ghOff">Desconectar este equipo</button>`
      : `
        <p class="legend-note" style="margin:0 0 12px;">Conéctalo una sola vez y publicarás con un clic, sin descargar ni subir archivos. El token queda guardado solo en este navegador.</p>
        <div class="form-grid">
          <div class="field"><label for="ghOwner">Usuario de GitHub</label><input class="input" id="ghOwner" value="${esc(guess.owner)}" placeholder="ej. JrJoseLs" autocapitalize="none" spellcheck="false"></div>
          <div class="field"><label for="ghRepo">Repositorio</label><input class="input" id="ghRepo" value="${esc(guess.repo)}" placeholder="ej. PP" autocapitalize="none" spellcheck="false"></div>
          <div class="field"><label for="ghToken">Token</label><input class="input" type="password" id="ghToken" placeholder="github_pat_…" autocomplete="off"></div>
        </div>
        <div class="row" style="margin:12px 0 0;"><button class="btn" type="button" id="ghConnect">Conectar</button></div>
        <div class="err-inline" id="ghErr" role="alert"></div>
        <details class="mt"><summary class="legend-note" style="cursor:pointer;margin:0;"><b>¿Cómo consigo el token?</b> (2 minutos, una sola vez)</summary>
          <ol class="legend-note" style="font-size:12.5px;padding-left:18px;margin:8px 0 0;">
            <li>En github.com abre tu foto → <b>Settings</b> → <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
            <li>Nombre: "Comparador". Caducidad: la que prefieras (por ejemplo, 1 año).</li>
            <li><b>Repository access</b>: <i>Only select repositories</i> → elige solo este repositorio.</li>
            <li><b>Permissions → Repository permissions → Contents</b>: <i>Read and write</i>.</li>
            <li>Pulsa <b>Generate token</b>, cópialo y pégalo aquí arriba.</li>
          </ol>
          <p class="legend-note">Ese token solo puede modificar este repositorio. Si alguna vez usas una computadora ajena, pulsa "Desconectar" al terminar.</p>
        </details>`}
    </div>

    <details class="box mt">
      <summary>Publicar a mano (sin conectar)</summary>
      <ol class="legend-note" style="font-size:12.5px;padding-left:18px;margin:8px 0 12px;">
        <li>Descarga los dos archivos.</li>
        <li>En github.com abre el repositorio → <b>Add file → Upload files</b>, suéltalos y pulsa <b>Commit changes</b>.</li>
        <li>Espera uno o dos minutos. Los usuarios verán los cambios al recargar.</li>
      </ol>
      <div class="row" style="margin:0;">
        <button class="btn ghost small" type="button" id="pubUsers">Descargar usuarios.json</button>
        <button class="btn ghost small" type="button" id="pubData" ${classes.length||published?"":"disabled"}>Descargar datos.json</button>
      </div>
    </details>
  `;
  if($("pubNow")) $("pubNow").onclick = (e)=>publishNow(e.currentTarget);
  if($("ghOff")) $("ghOff").onclick = ()=>{ if(confirm("¿Olvidar el token en este navegador?")){ store.del(GH_KEY); drawAdminPublicar(); renderPublishBanner(); } };
  if($("ghConnect")) $("ghConnect").onclick = async()=>{
    const b = $("ghConnect");
    const owner = $("ghOwner").value.trim(), repo = $("ghRepo").value.trim(), token = $("ghToken").value.trim();
    if(!owner || !repo || !token){ $("ghErr").textContent = "Completa los tres campos."; return; }
    b.disabled = true; b.textContent = "Comprobando…"; $("ghErr").textContent = "";
    try{ await ghConnect(owner, repo, token); toast("Conectado a GitHub."); drawAdminPublicar(); renderPublishBanner(); }
    catch(err){ $("ghErr").textContent = "No se pudo conectar: "+err.message+"."; b.disabled = false; b.textContent = "Conectar"; }
  };
  $("pubUsers").onclick = ()=>downloadBlob(JSON.stringify(usersExport(), null, 2), "usuarios.json", "application/json");
  $("pubData").onclick = exportPublished;
}
function exportUsers(){ downloadBlob(JSON.stringify(usersExport(), null, 2), "usuarios.json", "application/json"); }
function importUsers(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const j = JSON.parse(reader.result);
      if(!validDb(j) || !j.users.every(u=>u.usuario && (u.hash || u.auth) && ROLES[u.rol])) throw new Error("formato no válido");
      if(!j.users.some(u=>u.rol==="admin" && u.activo)) throw new Error("no tiene ningún administrador activo");
      if(!confirm("Esto reemplaza la lista de usuarios de este navegador. ¿Continuar?")) return;
      userDb = { updatedAt: j.updatedAt||0, users: j.users };
      saveUsers();
      const me = findUser(currentUser.usuario);
      if(!me || !me.activo || me.rol!=="admin"){ alert("Tu usuario ya no es administrador activo en la lista importada. Se cerrará la sesión."); return logout(); }
      currentUser = me; updateUserBox(); render();
      toast("Usuarios importados.");
    }catch(err){ toast("No se pudo importar: "+err.message, "error"); }
  };
  reader.readAsText(file);
}

/* ----- Vista previa: ver la aplicación como un maestro o decano ----- */
let previewUser = null, adminClasses = null;
function startPreview(usuario){
  const u = findUser(usuario);
  if(!u || u.rol==="admin" || previewUser) return;
  adminClasses = classes;
  previewUser = u;
  classes = adminClasses.filter(c=>(c.asignados||[]).includes(u.usuario));
  rowsCache = null; activeTab = null;
  document.body.classList.add("readonly");
  $("previewBar").innerHTML = `<div class="preview-bar"><span>👁 <b>Vista previa:</b> así ve la aplicación <b>${esc(u.nombre||u.usuario)}</b> (${esc(ROLES[u.rol])}) · ${plural(classes.length,"clase","clases")}${hasUnpublishedData()||hasUnpublishedUsers()?" · incluye cambios aún no publicados":""}</span>
    <button class="btn small" type="button" id="endPreview">Volver a administración</button></div>`;
  $("endPreview").onclick = endPreview;
  updateUserBox(); buildTabs(); render();
  window.scrollTo({top:0, behavior:"smooth"});
}
function endPreview(){
  if(!previewUser) return;
  classes = adminClasses; adminClasses = null; previewUser = null;
  rowsCache = null;
  document.body.classList.remove("readonly");
  $("previewBar").innerHTML = "";
  activeTab = "usuarios"; adminTab = "usuarios";
  updateUserBox(); buildTabs(); render();
}

/* =====================================================================
   10. Orquestación e inicio
   ===================================================================== */
const PANEL_RENDER = {
  resumen: renderPanelResumen, carreras: renderPanelCarreras, comparar: renderPanelComparar,
  perfil: renderPanelPerfil, tabla: renderPanelTabla, usuarios: renderPanelUsuarios
};
/* Las pestañas ocultas no se dibujan: se marcan como pendientes y se
   dibujan al abrirlas. Así un cambio cuesta una pestaña, no seis.     */
const DATA_PANELS = ["resumen","carreras","comparar","perfil","tabla"];
const dirty = new Set([...DATA_PANELS, "usuarios"]);
function renderActive(){
  if(!currentUser || !activeTab || !dirty.has(activeTab) || !canSee(activeTab)) return;
  dirty.delete(activeTab);
  PANEL_RENDER[activeTab]();
}
function renderPanels(except){
  DATA_PANELS.forEach(id=>{ if(id!==except) dirty.add(id); });
  renderActive();
}
function render(){
  if(!currentUser) return;
  rowsCache = null;
  renderSidebar();
  renderPublishBanner();
  dirty.add("usuarios");
  renderPanels();
}

// acceso
$("gateForm").addEventListener("submit", attemptUnlock);
$("logoutBtn").addEventListener("click", logout);

// carga de archivos
const dropzone = $("dropzone"), fileInput = $("fileInput");
dropzone.onclick = ()=> fileInput.click();
dropzone.onkeydown = (e)=>{ if(e.key==="Enter" || e.key===" "){ e.preventDefault(); fileInput.click(); } };
fileInput.onclick = (e)=> e.stopPropagation();
fileInput.onchange = (e)=>{ handleFiles(e.target.files); fileInput.value=""; };
["dragenter","dragover"].forEach(evt=> dropzone.addEventListener(evt, e=>{ e.preventDefault(); dropzone.classList.add("drag"); }));
["dragleave","drop"].forEach(evt=> dropzone.addEventListener(evt, e=>{ e.preventDefault(); dropzone.classList.remove("drag"); }));
dropzone.addEventListener("drop", e=>{ if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
// evitar que el navegador abra el archivo si se suelta fuera de la zona
["dragover","drop"].forEach(evt=> window.addEventListener(evt, e=>{ if(!dropzone.contains(e.target)) e.preventDefault(); }));

// respaldo
$("backupExport").onclick = exportBackup;
$("backupImport").onclick = ()=>$("backupFile").click();
$("backupFile").onchange = (e)=>{ if(e.target.files[0]) importBackup(e.target.files[0]); e.target.value=""; };
$("clearDataBtn").onclick = clearData;

// acciones delegadas: abrir perfil, ir a pestaña, elegir archivos
document.addEventListener("click", (e)=>{
  const p = e.target.closest("[data-profile]");
  if(p){ openProfile(p.dataset.profile); return; }
  const g = e.target.closest("[data-goto]");
  if(g){ showTab(g.dataset.goto); return; }
  if(e.target.closest("[data-end-preview]")) endPreview();
  const at = e.target.closest("[data-admin-tab]");
  if(at){ if(at.hasAttribute("data-new-user")){ editingUser = ""; createdInfo = null; } goAdmin(at.dataset.adminTab); return; }
  const eu = e.target.closest("[data-edit-user]");
  if(eu){ if(previewUser) endPreview(); editingUser = eu.dataset.editUser; createdInfo = null; goAdmin("usuarios");
    setTimeout(()=>{ const b = $("uFormBox"); if(b){ b.scrollIntoView({behavior:"smooth", block:"center"}); $("uPass").focus(); } }, 60); return; }
  const as = e.target.closest("[data-assign]");
  if(as){ highlightClass = as.dataset.assign; goAdmin("asignar"); return; }
  const pn = e.target.closest("[data-publish-now]");
  if(pn){ publishNow(pn); return; }
  const f = e.target.closest("[data-filter]");            // clic en una barra: tabla filtrada
  if(f && canSee("tabla")){
    const [k, ...v] = f.getAttribute("data-filter").split(":");
    Object.assign(stTbl, { clase:"all", carrera:"all", grupo:"all", q:"", soloSin:false, limit:TBL_PAGE });
    stTbl[k] = v.join(":");
    dirty.add("tabla"); showTab("tabla");
    window.scrollTo({top:0, behavior:"smooth"});
    return;
  }
  if(e.target.closest("[data-pick]")) fileInput.click();
});

// teclado: ← → cambia de estudiante en el Perfil
document.addEventListener("keydown", (e)=>{
  if(activeTab!=="perfil" || e.altKey || e.ctrlKey || e.metaKey) return;
  if(e.target.closest && e.target.closest("input, select, textarea")) return;
  if(e.key==="ArrowLeft"){ e.preventDefault(); stepPerfil(-1); }
  if(e.key==="ArrowRight"){ e.preventDefault(); stepPerfil(1); }
});

(async function init(){
  if(location.protocol==="file:") $("gateNote").innerHTML = "Estás abriendo el programa como archivo. Así solo funciona el usuario administrador de respaldo y no se ven las clases publicadas. Para usarlo de verdad entra por su dirección de GitHub Pages.";
  await Promise.all([loadUsers(), loadPublished()]);
  // reanudar sesión tras recargar la página
  let s = null, jwk = null;
  try{ s = sessionStorage.getItem(SESSION_KEY); jwk = JSON.parse(sessionStorage.getItem(SESSION_PK)||"null"); }catch(e){}
  const u = s ? findUser(s) : null;
  if(u && u.activo && hasCrypto){
    try{
      if(jwk) sessionKey = await crypto.subtle.importKey("jwk", jwk, RSA_IMP, true, ["unwrapKey"]);
      return await startSession(u);
    }catch(e){ console.error(e); }
  }
  $("gateUser").focus();
})();
