'use strict';
/* Planes de abonado · FG Agro — app de escritorio (Edge o Chrome en Windows).
   Fase 1: planes (fincas), analíticas compartidas, riego y balance de N con PDF estimado y cerrado.
   Los datos viven en OneDrive (carpeta «_App planes de abonado»), no en el código. */
const APP_VERSION = '1.8.2';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 1) => (v == null || !Number.isFinite(+v) ? '–' : (+v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtIn = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fechaEs = (iso) => { if (!iso) return '–'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : iso; };
const hhmm = (h) => { h = +h || 0; if (!h) return ''; let H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return `${H}:${String(M).padStart(2, '0')}`; };
function parseHora(t) {
  t = String(t || '').trim(); if (!t) return 0;
  const m = t.match(/^(\d+)\s*[:h.]\s*(\d{1,2})$/); if (m && t.includes(':')) return +m[1] + +m[2] / 60;
  const n = CALC.num(t); return n == null ? 0 : n;
}
const compacto = () => window.matchMedia('(max-width: 1366px)').matches;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
function haceTxt(iso) {
  if (!iso) return 'nunca'; const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'ahora'; if (s < 3600) return `hace ${Math.round(s / 60)} min`; if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return fechaEs(iso);
}

/* ---------- Estado ---------- */
let db = null;
let ui = { vista: 'planes', planId: null, tab: 'finca', q: '', filtro: 'todos', camp: null, analTipo: 'todas', infMes: null, infQ: '', infFiltro: 'todos', txtMes: null, verLista: true };
let local = { equipo: '' };
let conn = 'iniciando'; // sin-nube | error | listo
let dirty = false, guardando = false, saveTimer = null, ultimoGuardado = null, errorGuardar = '';
let versionNube = 0, offline = false, od = 'no-disponible'; // od: estado de la carpeta de OneDrive en este equipo
let logoCache = null;
let mxData = null, IX = null;

const TEXTO_PIE = 'Este programa de cálculo ha sido diseñado íntegramente para el cálculo de la necesidad mensual de riego y nutrición del cultivo. Para ello, tiene en cuenta los siguientes factores: características del sistema de riego, características del cultivo, producción estimada, extracciones nutricionales, analíticas (agua de riego, suelo y hoja) en caso de estar disponibles, condiciones climáticas locales, limitaciones de la legislación vigente, necesidades del mercado, etc.';
function dbVacia() {
  return {
    version: 1, creado: new Date().toISOString(), guardado: null,
    config: { eto: CALC.ETO_MULA.slice(), kc: structuredClone(CALC.KC), antiguedad: { ...CALC.TABLAS.antiguedad }, limiteNOrganico: CALC.TABLAS.limiteNOrganico, autor: 'Francis Gabarrón · Gestión Agrícola', mx: { url: '', clave: '' }, pie: { texto: TEXTO_PIE, telefono: '', email: '' }, planAnual: { aplicacion: '', medidas: '' }, rd: { precipitacion: '', lluvia: '', asesor: '', registro: '', objetivoMO: '', prohibiciones: '', almacenamiento: '', proteccion: '', asesoramiento: '', cuaderno: '' } },
    planes: [], analiticas: [], textos: {}, titulares: {}, programas: []
  };
}
function migrar(d) {
  const v = dbVacia();
  d.config = { ...v.config, ...(d.config || {}) };
  d.config.kc = { ...v.config.kc, ...(d.config.kc || {}) };
  d.config.antiguedad = { ...v.config.antiguedad, ...(d.config.antiguedad || {}) };
  d.config.mx = d.config.mx || { url: '', clave: '' };
  d.config.pie = { ...v.config.pie, ...(d.config.pie || {}) };
  d.config.planAnual = { ...v.config.planAnual, ...(d.config.planAnual || {}) };
  d.config.rd = { ...v.config.rd, ...(d.config.rd || {}) };
  d.textos = d.textos || {}; d.titulares = d.titulares || {}; d.programas = d.programas || [];
  d.planes = d.planes || []; d.analiticas = d.analiticas || []; d.repartos = d.repartos || []; d.productos = d.productos || [];
  return d;
}
let ixCache = { ref: null, ix: null };
function ixProd() { if (!db) return FERT.indice([]); if (ixCache.ref !== db.productos || ixCache.n !== db.productos.length) ixCache = { ref: db.productos, n: db.productos.length, ix: FERT.indice(db.productos) }; return ixCache.ix; }
const cfg = () => ({ ufDe: (p, c) => FERT.ufCampana(p, c, ixProd()), eto: db.config.eto, kc: db.config.kc, tablas: { ...CALC.TABLAS, antiguedad: db.config.antiguedad, limiteNOrganico: +db.config.limiteNOrganico || 170 } });
const planSel = () => db && db.planes.find((p) => p.id === ui.planId) || null;
const anal = (id) => (id ? db.analiticas.find((a) => a.id === id) || null : null);
const campDe = (p) => (p && p.campanas ? p.campanas[ui.camp] : null);
function analDePlan(p) {
  return { suelo: anal(p.analSuelo), agua: anal(p.analAgua), estiercoles: Object.fromEntries(db.analiticas.filter((a) => a.tipo === 'estiercol').map((a) => [a.id, a])) };
}
/* Campaña con la que se abre la app: la elegida en Ajustes o, si no hay, la más reciente */
function campanaInicio() {
  const cs = campanas(), ini = db && db.config && db.config.campanaInicio;
  return (ini && cs.includes(ini)) ? ini : (cs.slice(-1)[0] || String(new Date().getFullYear()));
}
function campanas() {
  const s = new Set(); for (const p of db.planes) for (const k of Object.keys(p.campanas || {})) s.add(k);
  return [...s].sort();
}

/* ---------- Guardar (Drive, con copia local) ---------- */
function commit(fn, { render = true } = {}) {
  fn(db);
  dirty = true; errorGuardar = '';
  NUBE.guardarLocal({ db, version: versionNube, dirty: true });
  clearTimeout(saveTimer); saveTimer = setTimeout(guardarAhora, 1500);
  if (render) renderAll(); else renderEstado();
}
async function guardarAhora(forzar = false) {
  if (!dirty || guardando || conn !== 'listo') return;
  guardando = true; renderEstado();
  try {
    db.guardado = { fecha: new Date().toISOString(), equipo: local.equipo || 'Este equipo', version: APP_VERSION };
    versionNube = await NUBE.guardar(db, versionNube, local.equipo || 'Este equipo', forzar);
    dirty = false; offline = false; ultimoGuardado = db.guardado.fecha;
    await NUBE.guardarLocal({ db, version: versionNube, dirty: false });
    ocultarBanner();
  } catch (e) {
    if (e.code === 'conflicto') mostrarConflicto(e.guardado);
    else if (e.code === 'offline') offline = true;
    else { errorGuardar = e.message || String(e); toast('No se pudo guardar en Drive: ' + errorGuardar, true); }
  } finally { guardando = false; renderEstado(); }
}
function mostrarConflicto(g) {
  const quien = g && g.equipo ? `<b>${esc(g.equipo)}</b>` : 'otro equipo';
  banner(`<b>Cambios en otro equipo:</b>&nbsp;${quien} guardó${g && g.fecha ? ' ' + haceTxt(g.fecha) : ''} mientras tú tenías cambios sin subir. <span class="muted">Si guardas lo tuyo, se pierde lo que hizo el otro.</span>
    <span class="spacer"></span><button class="btn peq" id="bnRecargar">Cargar lo del otro (pierdo lo último mío)</button><button class="btn peq rojo" id="bnForzar">Guardar lo mío encima</button>`, true);
  $('#bnRecargar').onclick = async () => { dirty = false; await recargar(); ocultarBanner(); toast('Datos cargados del otro equipo'); };
  $('#bnForzar').onclick = async () => { await guardarAhora(true); };
}
async function recargar() {
  const r = await NUBE.leer();
  if (r.datos) db = migrar(r.datos);
  versionNube = r.version; dirty = false; offline = false;
  ultimoGuardado = r.guardado && r.guardado.fecha;
  await NUBE.guardarLocal({ db, version: versionNube, dirty: false });
  postCarga(); prepararVista(); renderAll();
}
async function comprobarCambios() {
  if (conn !== 'listo' || guardando) return;
  if (dirty) { guardarAhora(); return; }
  try { const v = await NUBE.version(); offline = false; if (v !== versionNube) { await recargar(); toast('Datos actualizados desde otro equipo'); } }
  catch (e) { if (e.code === 'offline') offline = true; }
  renderEstado();
}
window.addEventListener('beforeunload', (e) => { if (dirty) { guardarAhora(); e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('online', () => { offline = false; comprobarCambios(); procesarPendientes(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { comprobarCambios(); procesarPendientes(); traerTextosPendientes(); } });

/* ---------- Avisos, toast, banner, modal ---------- */
let toastT = null;
function toast(msg, mal = false) { const t = $('#toast'); t.textContent = msg; t.className = 'on' + (mal ? ' mal' : ''); clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, mal ? 6000 : 3000); }
function banner(html, rojo = false) { const b = $('#banner'); b.innerHTML = html; b.className = 'banner' + (rojo ? ' rojo' : ''); b.hidden = false; }
function ocultarBanner() { $('#banner').hidden = true; }
function modal(titulo, cuerpo, { pie = '', ancho = false } = {}) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-bg"><div class="modal${ancho ? ' ancho' : ''}" role="dialog" aria-modal="true"><header><h2>${esc(titulo)}</h2><button class="x" data-cerrar aria-label="Cerrar">×</button></header><div class="cuerpo">${cuerpo}</div>${pie ? `<footer>${pie}</footer>` : ''}</div></div>`;
  $$('[data-cerrar]', root).forEach((b) => { b.onclick = cerrarModal; });
  $('.modal-bg', root).addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-bg')) cerrarModal(); });
  return $('.modal', root);
}
function cerrarModal() { $('#modalRoot').innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modalRoot').innerHTML) cerrarModal(); });

const avisoCache = new Map();
function avisosDe(p) { return CALC.avisos(p, ui.camp, db, cfg()); }
function nivelPlan(av) { return av.some((a) => a.nivel === 'alto') ? 'alto' : av.some((a) => a.nivel === 'medio') ? 'medio' : av.length ? 'bajo' : 'ok'; }

/* ---------- Arranque ---------- */
async function arrancar() {
  $('#version').textContent = 'Versión ' + APP_VERSION;
  local.equipo = (await ALM.kvGet('equipo').catch(() => '')) || '';
  mxData = await ALM.kvGet('mxData').catch(() => null);
  if (mxData) IX = MX.indexar(mxData);
  await NUBE.cargarCfg();
  od = ALM.soportado() ? await ALM.iniciar() : 'no-disponible';
  if (od === 'no-soportado') od = 'no-disponible';
  if (!NUBE.conectada()) { conn = 'sin-nube'; renderAll(); }
  else await abrir();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  // Cada 90 s: trae los cambios de otros equipos y, si este ordenador tiene OneDrive, pasa los PDF hechos en la tablet
  if (!window.__reloj) window.__reloj = setInterval(async () => { await comprobarCambios(); if (od === 'listo' && pendientesOneDrive()) procesarPendientes(); }, 90000);
}
function asegurarFert(d) {
  let cambio = false;
  const ix = FERT.indice(d.productos);
  for (const p of d.planes) for (const c of Object.values(p.campanas || {})) {
    if (!c.fert && c.excel && c.excel.meses) { c.fert = FERT.fertDesdeExcel(c.excel.meses); cambio = true; }
    for (const m of Object.values(c.fert || {})) for (const l of (m && m.lineas) || []) if (!l.prodId) { const pr = ix.nom.get(CALC.norm(l.nombre)); if (pr) { l.prodId = pr.id; cambio = true; } }
  }
  return cambio;
}
function postCarga() {
  if (!db || conn !== 'listo') return;
  const a = IMP.asegurarRepartos(db), b = asegurarFert(db);
  if (a || b) commit(() => {}, { render: false });
}
function prepararVista() {
  if (!db) return;
  if (!ui.camp || !campanas().includes(ui.camp)) ui.camp = campanaInicio();
  logoCache = db.config.logo || logoCache;
}
async function abrir() {
  const loc = await NUBE.local();
  if (loc && loc.db) { db = migrar(loc.db); versionNube = loc.version || 0; dirty = !!loc.dirty; conn = 'listo'; prepararVista(); renderAll(); }
  try {
    const r = await NUBE.leer(); offline = false;
    if (dirty && db) {
      if (r.version === versionNube) await guardarAhora(); else mostrarConflicto(r.guardado);
    } else {
      db = migrar(r.datos || (db && !r.datos && versionNube === 0 ? db : dbVacia()));
      versionNube = r.version; ultimoGuardado = r.guardado && r.guardado.fecha;
      await NUBE.guardarLocal({ db, version: versionNube, dirty: false });
      conn = 'listo'; postCarga();
    }
    conn = 'listo';
  } catch (e) {
    if (e.code === 'offline' && db) { offline = true; toast('Sin conexión: trabajas con la copia de este equipo y se subirá al volver'); }
    else if (!db) { conn = 'error'; errorGuardar = e.message || String(e); }
    else toast(e.message || String(e), true);
  }
  if (!logoCache && od === 'listo') logoCache = await ALM.logo();
  if (logoCache && db && conn === 'listo' && !db.config.logo) commit((d) => { d.config.logo = logoCache; }, { render: false });
  prepararVista(); renderAll();
  procesarPendientes();
  traerTextosPendientes();
}

/* ---------- OneDrive (solo en el ordenador): Excels y PDF ---------- */
async function conectarOneDrive() {
  try {
    if (od === 'pedir-permiso') { if (!(await ALM.reconectar())) { toast('Sin permiso no se puede usar OneDrive', true); return false; } }
    else if (od === 'sin-carpeta' || od === 'listo') {
      const r = await ALM.elegirCarpeta();
      if (!r.tieneClientes && !confirm(`La carpeta «${r.nombre}» no tiene dentro una carpeta «Clientes». ¿Usarla igualmente?`)) return false;
    } else { toast('En este equipo no se puede usar la carpeta de OneDrive', true); return false; }
    od = 'listo'; ocultarBanner();
    if (!logoCache) logoCache = await ALM.logo();
    renderAll(); procesarPendientes();
    return true;
  } catch (e) { if (e.name !== 'AbortError') toast(e.message || String(e), true); return false; }
}
async function asegurarOneDrive() { return od === 'listo' ? true : conectarOneDrive(); }
/* Registros de PDF hechos en la tablet que esperan a pasar a OneDrive */
function regsPendientes(d = db) {
  const out = [];
  for (const p of (d && d.planes) || []) for (const [ck, c] of Object.entries(p.campanas || {})) {
    for (const [k, x] of Object.entries(c.pdf || {})) if (x && x.pendiente) out.push({ p, camp: ck, reg: x, txt: `Balance N ${k} · ${ck}` });
    for (const [k, x] of Object.entries(c.informes || {})) if (x && x.pendiente) out.push({ p, camp: ck, reg: x, txt: `Informe de ${CALC.MESES[+k].toLowerCase()} ${ck}` });
  }
  return out;
}
function pendientesOneDrive() { return regsPendientes().length; }
function bannerOneDrive() {
  const n = pendientesOneDrive();
  banner(`Hay ${plural(n, 'PDF hecho', 'PDF hechos')} en la tablet pendientes de pasar a OneDrive.<span class="spacer"></span><button class="btn peq" id="bnOd">Conectar OneDrive y pasarlos</button>`);
  $('#bnOd').onclick = () => conectarOneDrive();
}
let pasandoPdf = false;
const ESPERA_PDF = 15 * 60 * 1000; // un PDF recién subido espera a que lleguen también los datos de la tablet
async function procesarPendientes() {
  if (od !== 'listo' || conn !== 'listo' || pasandoPdf || offline) return;
  pasandoPdf = true;
  try {
    const lista = await NUBE.pdfs();
    const ahora = Date.now();
    let n = 0;
    for (const x of lista) {
      const m = x.meta || {};
      // ¿Ya han llegado los datos de la tablet con este PDF marcado como pendiente?
      const p = db.planes.find((q) => q.id === m.planId), c = p && p.campanas && p.campanas[m.camp];
      const reg = c && (m.tipo === 'informe' ? c.informes && c.informes[m.mes] : c.pdf && c.pdf[m.modo]);
      const esperado = !!(reg && reg.pendiente && (!reg.pdfId || reg.pdfId === x.id));
      const reciente = x.fecha && ahora - new Date(x.fecha).getTime() < ESPERA_PDF;
      if (m.planId && !esperado && reciente) continue; // los datos aún no han llegado: se pasa en la siguiente vuelta
      const blob = await NUBE.leerPdf(x.id);
      const ruta = m.tipo === 'raiz' ? await ALM.guardarEnRaiz(m.carpeta || CARPETA_INFORMES, x.nombre, blob) : await ALM.guardarPDF(m.carpeta || 'Sin carpeta', x.nombre, blob);
      if (m.tipo === 'informe') await ALM.guardarEnRaiz(CARPETA_INFORMES, x.nombre, blob);
      await NUBE.borrarPdf(x.id);
      commit((d) => {
        d.pdfsPasados = d.pdfsPasados || {};
        d.pdfsPasados[x.id] = { ruta, fecha: new Date().toISOString() };
        const ks = Object.keys(d.pdfsPasados); if (ks.length > 300) ks.sort((a, b) => (d.pdfsPasados[a].fecha || '').localeCompare(d.pdfsPasados[b].fecha || '')).slice(0, ks.length - 300).forEach((k) => delete d.pdfsPasados[k]);
        const pp = d.planes.find((q) => q.id === m.planId), cc = pp && pp.campanas && pp.campanas[m.camp];
        const rr = cc && (m.tipo === 'informe' ? cc.informes && cc.informes[m.mes] : cc.pdf && cc.pdf[m.modo]);
        if (rr && rr.pendiente && (!rr.pdfId || rr.pdfId === x.id)) { rr.pendiente = false; rr.ruta = ruta; }
      }, { render: false });
      n++;
    }
    // Marcas que se quedaron colgadas: el PDF ya no está en Drive (se pasó antes de que llegaran los datos de la tablet)
    const enDrive = new Set(lista.map((x) => x.id));
    const colgados = regsPendientes().filter(({ reg }) => !(reg.pdfId && enDrive.has(reg.pdfId)) && (!reg.fecha || ahora - new Date(reg.fecha).getTime() > ESPERA_PDF));
    if (colgados.length) commit((d) => {
      for (const { reg } of regsPendientes(d)) {
        if (reg.pdfId && enDrive.has(reg.pdfId)) continue;
        if (reg.fecha && ahora - new Date(reg.fecha).getTime() <= ESPERA_PDF) continue;
        const ya = reg.pdfId && d.pdfsPasados && d.pdfsPasados[reg.pdfId];
        reg.pendiente = false; reg.ruta = ya ? ya.ruta : 'Pasado a OneDrive (sin confirmar la ruta)';
      }
    }, { render: false });
    if (n || colgados.length) { if (n) toast(`${plural(n, 'PDF pasado', 'PDF pasados')} a OneDrive`); renderAll(); }
  } catch (e) { if (e.code !== 'offline') toast('No se pudieron pasar los PDF a OneDrive: ' + (e.message || e), true); }
  finally { pasandoPdf = false; }
}

/* ---------- Pintar ---------- */
function renderEstado() {
  const b = $('#estado');
  if (conn !== 'listo') { b.textContent = conn === 'error' ? 'Sin acceso a Drive' : 'Sin conectar'; b.className = 'estado mal'; return; }
  let t = 'Drive';
  if (guardando) t += ' · guardando…';
  else if (offline) t += dirty ? ' · SIN CONEXIÓN · cambios pendientes de subir' : ' · sin conexión';
  else if (errorGuardar) t += ' · ERROR al guardar';
  else if (dirty) t += ' · cambios sin guardar';
  else if (ultimoGuardado) t += ` · guardado ${haceTxt(ultimoGuardado)}`;
  if (od === 'listo') t += ' · OneDrive ✓'; else if (od === 'pedir-permiso' || od === 'sin-carpeta') t += ' · OneDrive sin conectar';
  const pend = pendientesOneDrive(); if (pend) t += ` · ${pend} PDF pendientes`;
  if (local.equipo) t += ` · ${local.equipo}`;
  b.textContent = t; b.className = 'estado' + (errorGuardar || (offline && dirty) ? ' mal' : '');
  b.onclick = () => { ui.vista = 'ajustes'; renderAll(); };
}
function renderAll() {
  renderEstado();
  const listo = conn === 'listo' && db;
  $('#campBox').hidden = !listo;
  if (listo) {
    const cs = campanas(); if (!cs.includes(ui.camp)) cs.push(ui.camp); cs.sort();
    const sel = $('#campSel');
    sel.innerHTML = cs.map((c) => `<option ${c === ui.camp ? 'selected' : ''}>${esc(c)}</option>`).join('');
    sel.onchange = () => { ui.camp = sel.value; renderAll(); };
    $('#nPlanes').textContent = db.planes.length || '';
    $('#nAnal').textContent = db.analiticas.length || '';
    $('#nProd').textContent = db.productos.length || '';
    const conAlto = db.planes.filter((p) => avisosDe(p).some((a) => a.nivel === 'alto')).length;
    $('#nAvisos').textContent = conAlto || '';
    $('#nInf').textContent = contarInformes().pendientes || '';
  }
  $$('.nav').forEach((b) => { b.setAttribute('aria-current', b.dataset.vista === ui.vista ? 'page' : 'false'); b.onclick = () => { ui.vista = b.dataset.vista; renderAll(); }; });
  const v = $('#view');
  if (!listo) { v.innerHTML = pantallaConexion(); enlazarConexion(); return; }
  if (ui.vista !== 'ajustes' && od === 'pedir-permiso' && pendientesOneDrive() && $('#banner').hidden) bannerOneDrive();
  if (ui.vista === 'planes') renderPlanes(v);
  else if (ui.vista === 'informes') renderInformes(v);
  else if (ui.vista === 'textos') renderTextos(v);
  else if (ui.vista === 'registros') renderRegistros(v);
  else if (ui.vista === 'analiticas') renderAnaliticas(v);
  else if (ui.vista === 'avisos') renderAvisos(v);
  else if (ui.vista === 'repartos') renderRepartos(v);
  else if (ui.vista === 'productos') renderProductos(v);
  else renderAjustes(v);
}

/* ---------- Conexión con Drive ---------- */
function pantallaConexion() {
  const c = NUBE.config();
  const err = conn === 'error' ? `<div class="aviso alto" style="margin-bottom:12px;text-align:left">No se pudo leer Drive: ${esc(errorGuardar)}</div>` : '';
  return `<div class="card vacio" style="max-width:640px;margin:20px auto;text-align:left"><h2>Conectar con Google Drive</h2>
    <p style="margin:0 0 14px">Los datos se guardan en Drive › Apps › Planes de abonado, para usarlos igual en los ordenadores y en la tablet. Pega la dirección del script de la hoja «Planes de abonado» (termina en <code>/exec</code>) y su clave.</p>${err}
    <div class="grid2"><label class="fld" style="grid-column:span 2"><span>Dirección del script</span><input id="cxUrl" value="${esc(c.url)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
    <label class="fld"><span>Clave</span><input id="cxClave" type="password" value="${esc(c.clave)}"></label>
    <label class="fld"><span>Nombre de este equipo</span><input id="cxEquipo" placeholder="Oficina, Casa, Tablet…" value="${esc(local.equipo)}"></label></div>
    <div class="row" style="margin-top:16px"><button class="btn p" id="cxOk">Conectar</button></div></div>`;
}
function enlazarConexion() {
  const ok = $('#cxOk'); if (!ok) return;
  ok.onclick = async () => {
    const url = $('#cxUrl').value.trim(), clave = $('#cxClave').value.trim();
    local.equipo = $('#cxEquipo').value.trim(); await ALM.kvSet('equipo', local.equipo);
    if (!/^https:\/\/script\.google\.com\//.test(url)) { toast('La dirección debe empezar por https://script.google.com/', true); return; }
    if (!clave) { toast('Escribe la clave', true); return; }
    ok.disabled = true; ok.textContent = 'Conectando…';
    try {
      const r = await NUBE.probar({ url, clave });
      if (!r.ok) throw new Error(r.error || 'El script no responde');
      await NUBE.guardarCfg({ url, clave });
      await abrir();
      toast('Conectado con Drive');
    } catch (e) { toast(e.message || String(e), true); ok.disabled = false; ok.textContent = 'Conectar'; }
  };
}

/* ---------- PLANES ---------- */
function renderPlanes(v) {
  if (!db.planes.length) {
    const pc = od !== 'no-disponible';
    v.innerHTML = `<div class="card vacio"><h2>Todavía no hay planes</h2>
      ${pc ? `<p>Importa tus Excels «Gestion Fertirrigacion v5» de la carpeta Clientes de OneDrive. La app lee las analíticas, el riego y el balance de N de cada uno, sin tocarlos.</p>
      <div class="row" style="justify-content:center"><button class="btn p" id="vImp">Importar mis Excels</button><button class="btn" id="vV10">Traer los datos de la versión 1.0</button><button class="btn" id="vNuevo">Crear un plan a mano</button></div>`
      : `<p>Importa los Excels desde el ordenador (Ajustes → Importar los Excels). En cuanto termine, los planes aparecerán aquí.</p><div class="row" style="justify-content:center"><button class="btn" id="vRec">Volver a mirar</button><button class="btn" id="vNuevo">Crear un plan a mano</button></div>`}</div>`;
    if (pc) { $('#vImp').onclick = abrirImportar; $('#vV10').onclick = traerV10; } else $('#vRec').onclick = () => recargar();
    $('#vNuevo').onclick = nuevoPlan; return;
  }
  const q = CALC.norm(ui.q);
  const conAv = db.planes.map((p) => ({ p, av: avisosDe(p) }));
  const lista = conAv.filter(({ p, av }) => {
    if (q && !CALC.norm([p.nombre, p.cliente, p.finca, p.cultivo, p.tipoCultivo].join(' ')).includes(q)) return false;
    if (ui.filtro === 'avisos' && !av.some((a) => a.nivel === 'alto')) return false;
    if (ui.filtro === 'vulnerable' && !p.vulnerable) return false;
    if (ui.filtro === 'sincamp' && campDe(p)) return false;
    if (ui.filtro === 'sinenlace' && p.mxFin) return false;
    return true;
  }).sort((a, b) => (a.p.cliente || '').localeCompare(b.p.cliente || '', 'es') || (a.p.nombre || '').localeCompare(b.p.nombre || '', 'es'));
  if (!ui.planId || !db.planes.some((p) => p.id === ui.planId)) ui.planId = (lista[0] || conAv[0]).p.id;
  let html = '', cli = null;
  for (const { p, av } of lista) {
    if (p.cliente !== cli) { cli = p.cliente; html += `<div class="grupo-cli">${esc(cli || 'Sin cliente')}</div>`; }
    html += `<button class="item" data-plan="${p.id}" aria-current="${p.id === ui.planId}"><span class="dot ${nivelPlan(av)}"></span><span class="t"><b>${esc(p.nombre)}</b><span>${esc(p.finca)} · ${esc(p.tipoCultivo || p.cultivo)}</span></span>${p.vulnerable ? '<span class="chip amb" title="Zona vulnerable">ZV</span>' : ''}</button>`;
  }
  const filtros = [['todos', 'Todos'], ['avisos', 'Con avisos'], ['vulnerable', 'Zona vulnerable'], ['sincamp', 'Sin campaña ' + ui.camp], ...(IX ? [['sinenlace', `Sin enlazar (${db.planes.filter((x) => !x.mxFin).length})`]] : [])];
  v.innerHTML = `<div class="planes pv ${ui.verLista ? 'ver-lista' : 'ver-detalle'}">
    <div class="card lista"><div class="busca"><div class="row"><input id="pq" type="search" placeholder="Buscar plan, cliente, finca…" value="${esc(ui.q)}" style="flex:1"><button class="btn peq" id="pNuevo" title="Nuevo plan">+ Nuevo</button></div>
      <div class="filtros">${filtros.map(([k, t]) => `<button data-f="${k}" aria-pressed="${ui.filtro === k}">${esc(t)}</button>`).join('')}</div>
      <div class="small muted">${plural(lista.length, 'plan', 'planes')}</div></div>
      <div class="items">${html || '<p class="muted small" style="padding:14px">Ningún plan con ese filtro.</p>'}</div></div>
    <div id="detalle"></div></div>`;
  const pq = $('#pq'); pq.oninput = () => { ui.q = pq.value; const pos = pq.selectionStart; renderPlanes(v); const n = $('#pq'); n.focus(); n.setSelectionRange(pos, pos); };
  $$('[data-f]', v).forEach((b) => { b.onclick = () => { ui.filtro = b.dataset.f; renderPlanes(v); }; });
  $$('[data-plan]', v).forEach((b) => { b.onclick = () => { ui.planId = b.dataset.plan; const cambia = ui.verLista; ui.verLista = false; renderPlanes(v); if (cambia && compacto()) window.scrollTo(0, 0); }; });
  $('#pNuevo').onclick = nuevoPlan;
  renderDetalle($('#detalle'));
  const act = $('.item[aria-current="true"]', v); if (act) act.scrollIntoView({ block: 'nearest' });
}

function renderDetalle(el) {
  cerrarCombo();
  const p = planSel(); if (!p) { el.innerHTML = ''; return; }
  const camp = campDe(p);
  const av = avisosDe(p);
  let kp = '';
  if (camp) {
    const b = CALC.balanceN(p, camp, analDePlan(p), 'estimado', cfg());
    kp = `<div class="kpis">
      <div class="kpi"><span>N permitido (balance)</span><strong>${fmt(b.aporte, 1)} <small>kg/ha</small></strong></div>
      <div class="kpi ${b.excede ? 'rojo' : ''}"><span>N en el plan</span><strong>${fmt(b.nAplicado, 1)} <small>kg/ha</small></strong></div>
      <div class="kpi"><span>Riego programado</span><strong>${fmt(b.dosisRiegoAuto, 0)} <small>m³/ha</small></strong></div>
      <div class="kpi ${av.some((a) => a.nivel === 'alto') ? 'rojo' : ''}"><span>Avisos</span><strong>${av.length}</strong></div></div>`;
  }
  const nAv = (d) => av.filter((a) => a.donde === d).length;
  // Otros planes del mismo cliente, para pasar de uno a otro sin volver a la lista
  const herm = db.planes.filter((x) => (x.cliente || '') === (p.cliente || '')).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  let hermHtml = '';
  if (herm.length > 1) {
    const pal = herm.map((x) => x.nombre.split(/\s+/));
    let comun = 0; while (pal.every((w) => w.length > comun + 1 && CALC.norm(w[comun]) === CALC.norm(pal[0][comun]))) comun++;
    const corto = (x, k) => pal[k].slice(comun).join(' ') || x.nombre;
    const k0 = herm.findIndex((x) => x.id === p.id);
    hermHtml = `<div class="hermanos" aria-label="Planes de ${esc(p.cliente)}">
      <button class="btn peq" data-herm="${herm[(k0 - 1 + herm.length) % herm.length].id}" title="Plan anterior de ${esc(p.cliente)}">‹</button>
      ${herm.map((x, k) => `<button class="hp" data-herm="${x.id}" aria-current="${x.id === p.id}" title="${esc(x.nombre)} · ${esc(x.finca)}"><span class="dot ${nivelPlan(avisosDe(x))}"></span>${esc(corto(x, k))}</button>`).join('')}
      <button class="btn peq" data-herm="${herm[(k0 + 1) % herm.length].id}" title="Plan siguiente de ${esc(p.cliente)}">›</button></div>`;
  }
  const tabs = [['finca', 'Finca'], ['analiticas', 'Analíticas'], ['riego', 'Riego'], ['balance', 'Balance N'], ['necesidades', 'Necesidades y reparto'], ['fert', 'Fertirrigación']];
  el.innerHTML = `<div class="card ${ui.tab === 'fert' ? 'card-fert' : ''}"><div class="cab"><button class="btn peq solo-compacto" id="dLista" title="Volver a la lista de planes">‹ Planes</button><div class="t"><h2>${esc(p.nombre)}</h2>
      <div class="muted">${esc(p.cliente)} › ${esc(p.finca)} · ${esc(p.cultivo)} · ${fmt(p.superficie, 2)} ha · ${fmt(p.arboles, 0)} árboles</div>
      ${hermHtml}<div class="row" style="margin-top:6px">${p.vulnerable ? '<span class="chip amb">Zona vulnerable</span>' : '<span class="chip">No vulnerable</span>'}<span class="chip">${esc(p.grupo)}</span>${p.tipoCultivo ? `<span class="chip v">${esc(p.tipoCultivo)}</span>` : '<span class="chip amb">Sin tipo de cultivo</span>'}${p.mxFin ? `<span class="chip v" title="Enlazado con el maestro de fincas">${esc(p.mxFin)}</span>` : ''}</div></div></div>
    ${camp ? kp : `<div class="aviso alto" style="margin-top:12px"><span>Este plan no tiene datos de la campaña <b>${esc(ui.camp)}</b>.</span><span class="spacer"></span>${Object.keys(p.campanas || {}).length ? `<button class="btn peq" id="dCrear">Crearla copiando de ${esc(Object.keys(p.campanas).sort().slice(-1)[0])}</button>` : `<button class="btn peq" id="dCrear">Crearla vacía</button>`}</div>`}
    ${av.length ? `<details style="margin-top:12px" ${av.some((a) => a.nivel === 'alto') && !compacto() ? 'open' : ''}><summary class="small muted" style="cursor:pointer">Ver avisos (${av.length})</summary><div style="margin-top:8px">${av.map((a) => `<div class="aviso ${a.nivel}"><span class="dot ${a.nivel}" style="margin-top:6px"></span><span>${esc(a.txt)}</span></div>`).join('')}</div></details>` : ''}
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${t}${nAv(k) ? `<span class="c">${nAv(k)}</span>` : ''}</button>`).join('')}</div>
    <div id="tabBody"></div></div>`;
  $$('[data-tab]', el).forEach((b) => { b.onclick = () => { ui.tab = b.dataset.tab; renderDetalle(el); }; });
  $$('[data-herm]', el).forEach((b) => { b.onclick = () => {
    if (b.dataset.herm === p.id) return;
    const ws = window.scrollY, sc = $('#view') ? $('#view').scrollTop : 0;
    ui.planId = b.dataset.herm; renderAll();
    window.scrollTo(0, ws); if ($('#view')) $('#view').scrollTop = sc;
    const it = $(`.item[data-plan="${ui.planId}"]`); if (it && it.scrollIntoView) it.scrollIntoView({ block: 'nearest' });
    const act = $('.hermanos .hp[aria-current="true"]'); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }; });
  $('#dLista', el).onclick = () => { ui.verLista = true; renderAll(); window.scrollTo(0, 0); };
  const dc = $('#dCrear', el); if (dc) dc.onclick = () => { commit(() => crearCampana(p, ui.camp)); toast('Campaña ' + ui.camp + ' creada'); };
  const body = $('#tabBody', el);
  if (ui.tab === 'finca') tabFinca(body, p);
  else if (ui.tab === 'analiticas') tabAnaliticas(body, p, camp);
  else if (ui.tab === 'riego') tabRiego(body, p, camp);
  else if (ui.tab === 'necesidades') tabNecesidades(body, p, camp);
  else if (ui.tab === 'fert') tabFert(body, p, camp);
  else tabBalance(body, p, camp);
}

function crearCampana(p, key) {
  p.campanas = p.campanas || {};
  if (p.campanas[key]) return false;
  const prevKey = Object.keys(p.campanas).filter((k) => k < key).sort().slice(-1)[0] || Object.keys(p.campanas).sort().slice(-1)[0];
  const prev = prevKey ? p.campanas[prevKey] : null;
  p.campanas[key] = {
    produccionEst: prev ? prev.produccionEst : null, produccionReal: null, coefExtraccion: prev ? prev.coefExtraccion : null, plantillaProd: prev ? !!prev.plantillaProd : false,
    dosisEstM3: null, dosisRealM3: null, estiercoles: [],
    riego: prev ? structuredClone(prev.riego) : CALC.MESES.map(() => ({ h: 0, n: 0 })),
    ufAplicadas: CALC.MESES.map(() => [0, 0, 0, 0, 0]),
    ajustes: prev ? structuredClone(prev.ajustes || {}) : {}, pdf: {}, desde: prevKey || null,
    necesidades: prev && prev.necesidades ? prev.necesidades.slice() : null, factores: prev && prev.factores ? prev.factores.slice() : null
  };
  p.campanaActual = key;
  return true;
}

/* Campos editables: data-k="ruta" sobre el plan (p.) o la campaña (c.) */
function campo(label, ruta, valor, { tipo = 'num', auto = '', ph = '', opciones = null, ancho = '' } = {}) {
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  let input;
  if (opciones) input = `<select id="${id}" data-k="${ruta}" data-t="${tipo}">${opciones.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(valor ?? '') ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select>`;
  else input = `<input id="${id}" data-k="${ruta}" data-t="${tipo}" value="${esc(tipo === 'num' ? fmtIn(valor) : tipo === 'hora' ? hhmm(valor) : (valor ?? ''))}" placeholder="${esc(ph)}" ${tipo === 'num' ? 'inputmode="decimal"' : ''}>`;
  return `<label class="fld" for="${id}" ${ancho ? `style="grid-column:span ${ancho}"` : ''}><span>${esc(label)}</span>${input}${auto ? `<span class="auto">${auto}</span>` : ''}</label>`;
}
function setRuta(obj, ruta, val) {
  const ps = ruta.split('.'); let o = obj;
  for (let i = 0; i < ps.length - 1; i++) { if (o[ps[i]] == null) o[ps[i]] = /^\d+$/.test(ps[i + 1]) ? [] : {}; o = o[ps[i]]; }
  o[ps[ps.length - 1]] = val;
}
function leerValor(el) {
  const t = el.dataset.t;
  if (el.type === 'checkbox') return el.checked;
  if (t === 'num') { const s = el.value.trim(); return s === '' ? null : CALC.num(s); }
  if (t === 'hora') return parseHora(el.value);
  return el.value.trim();
}
function enlazarCampos(el, p, onCambio) {
  $$('[data-k]', el).forEach((inp) => {
    inp.addEventListener('change', () => {
      const ruta = inp.dataset.k, val = leerValor(inp);
      commit(() => {
        if (ruta.startsWith('c.')) { const c = campDe(p); if (c) setRuta(c, ruta.slice(2), val); }
        else setRuta(p, ruta.replace(/^p\./, ''), val);
        if (onCambio) onCambio(ruta, val);
      }, { render: false });
      renderDetalleSoloCuerpo();
    });
  });
}
function renderDetalleSoloCuerpo() {
  const d = $('#detalle'); if (!d) return renderAll();
  const sc = $('#view').scrollTop, ws = window.scrollY;
  const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;
  renderDetalle(d);
  // refrescar la lista (avisos) sin perder el sitio
  const it = $(`.item[data-plan="${ui.planId}"] .dot`);
  if (it) { const p = planSel(); it.className = 'dot ' + nivelPlan(avisosDe(p)); }
  window.scrollTo(0, ws); $('#view').scrollTop = sc;
  if (foco) { const n = $(`[data-k="${foco}"]`); if (n) n.focus(); }
  renderEstadoContadores();
}
function renderEstadoContadores() {
  const conAlto = db.planes.filter((p) => avisosDe(p).some((a) => a.nivel === 'alto')).length;
  $('#nAvisos').textContent = conAlto || '';
}

/* ----- Pestaña Finca ----- */
function tabFinca(el, p) {
  const cultOps = [['', '— Elegir —'], ...CALC.CULTIVOS.map((c) => c.nombre), 'Mixto (varios cultivos)'];
  const kc = p.kc || db.config.kc[p.grupo] || CALC.KC.CITRICOS;
  let mx = '';
  if (IX) {
    const clis = mxData.clientes.filter((c) => !/^baja$/i.test(c.estado || '')).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const fins = mxData.fincas.filter((f) => !p.mxCli || f.clienteId === p.mxCli).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    mx = `<div class="card" style="margin-top:14px;box-shadow:none"><h3>Enlace con los maestros</h3><div class="grid3">
      ${campo('Cliente del maestro', 'p.mxCli', p.mxCli || '', { tipo: 'txt', opciones: [['', '— Sin enlazar —'], ...clis.map((c) => [c.id, `${c.nombre} (${c.id})`])] })}
      ${campo('Finca del maestro', 'p.mxFin', p.mxFin || '', { tipo: 'txt', opciones: [['', '— Sin enlazar —'], ...fins.map((f) => [f.id, `${f.nombre} (${f.id})`])] })}
      <div class="fld"><span>&nbsp;</span><button class="btn" id="fAuto">Buscar por nombre</button></div></div></div>`;
  }
  el.innerHTML = `<div class="grid4">
      ${campo('Nombre del plan (y del PDF)', 'p.nombre', p.nombre, { tipo: 'txt', ancho: 2 })}
      ${campo('Titular', 'p.titular', p.titular, { tipo: 'txt', ancho: 2 })}
      ${campo('Cliente', 'p.cliente', p.cliente, { tipo: 'txt' })}
      ${campo('Finca', 'p.finca', p.finca, { tipo: 'txt' })}
      ${campo('Carpeta en Clientes', 'p.carpeta', p.carpeta, { tipo: 'txt', ancho: 2, auto: '<span id="fCarp">Los PDF se guardan en <code>Clientes/' + esc(p.carpeta) + '/Planes de abonado</code></span>' })}
      ${campo('Cultivo (texto del informe)', 'p.cultivo', p.cultivo, { tipo: 'txt' })}
      ${campo('Tipo de cultivo', 'p.tipoCultivo', p.tipoCultivo, { tipo: 'txt', opciones: cultOps })}
      ${campo('Grupo (Kc y tablas)', 'p.grupo', p.grupo, { tipo: 'txt', opciones: CALC.GRUPOS })}
      ${campo('Recintos SIGPAC', 'p.recintos', p.recintos, { tipo: 'txt' })}
      ${campo('Año de plantación', 'p.anioPlantacion', p.anioPlantacion, { ph: 'p. ej. 2016', auto: CALC.edad(p, ui.camp) != null ? `${CALC.edad(p, ui.camp)} años en ${esc(ui.camp)}` : 'Para calcular la edad de cada campaña' })}
      ${campo('Superficie (ha)', 'p.superficie', p.superficie)}
      ${campo('Nº de árboles', 'p.arboles', p.arboles, { auto: p.superficie && p.arboles ? fmt(p.arboles / p.superficie, 0) + ' árboles/ha reales' : '' })}
      <label class="fld"><span>Zona vulnerable</span><span class="chk"><input type="checkbox" data-k="p.vulnerable" ${p.vulnerable ? 'checked' : ''}> Sí, en zona vulnerable</span></label>
      <label class="fld"><span>Campo de Cartagena</span><span class="chk"><input type="checkbox" data-k="p.campoCartagena" ${p.campoCartagena ? 'checked' : ''}> Sí (fA 40 % si NO3 &gt; 100)</span></label>
    </div>
    <h3 style="margin-top:18px">Riego y marco</h3>
    <div class="grid4">
      ${campo('Marco: entre filas (m)', 'p.marco.filas', p.marco && p.marco.filas)}
      ${campo('Marco: entre árboles (m)', 'p.marco.arboles', p.marco && p.marco.arboles, { auto: p.marco && p.marco.filas && p.marco.arboles ? fmt(10000 / (p.marco.filas * p.marco.arboles), 0) + ' árboles/ha por marco' : '' })}
      ${campo('Diámetro de copa (m)', 'p.copa', p.copa)}
      ${campo('Caudal del emisor (L/h)', 'p.caudal', p.caudal)}
      ${campo('Emisores por árbol', 'p.emisores', p.emisores)}
      ${campo('Líneas de emisores', 'p.lineas', p.lineas || 1, { opciones: [[1, '1 línea'], [2, '2 líneas']] })}
      ${campo('Textura (eficiencia del riego)', 'p.textura', p.textura, { tipo: 'txt', opciones: CALC.TEXTURAS })}
    </div>
    <h3 style="margin-top:18px">Kc mensual <span class="muted small" style="font-weight:400">${p.kc ? '(propio de este plan)' : '(el del grupo ' + esc(p.grupo) + ')'}</span></h3>
    <div class="scroll-x"><table class="t"><tr>${CALC.MESES.map((m) => `<th class="n">${m.slice(0, 3)}</th>`).join('')}<th></th></tr>
      <tr>${kc.map((k, i) => `<td><input class="cell" data-kc="${i}" value="${fmtIn(k)}"></td>`).join('')}<td><button class="btn peq" id="fKcGrupo" title="Volver al Kc del grupo">Usar el del grupo</button></td></tr></table></div>
    ${mx}
    ${htmlRD(p)}
    <div class="row" style="margin-top:18px"><span class="small muted">Importado de <code>${esc((p.origen && p.origen.ruta) || '—')}</code> ${p.origen ? fechaEs(p.origen.importado) : ''}</span><span class="spacer"></span><button class="btn peq" id="fDup">Duplicar plan</button><button class="btn peq rojo" id="fDel">Borrar plan</button></div>`;
  enlazarCampos(el, p, (ruta, val) => {
    if (ruta === 'p.tipoCultivo') { const c = CALC.CULTIVOS.find((x) => x.nombre === val); if (c) p.grupo = c.grupo; }
    if (ruta === 'p.mxCli') { p.mxFin = null; }
    if (ruta === 'p.lineas') p.lineas = +val || 1;
  });
  $$('[data-kc]', el).forEach((inp) => inp.addEventListener('change', () => {
    commit(() => { const base = (p.kc || db.config.kc[p.grupo] || CALC.KC.CITRICOS).slice(); base[+inp.dataset.kc] = CALC.num(inp.value) ?? 0; p.kc = base; }, { render: false });
    renderDetalleSoloCuerpo();
  }));
  $('#fKcGrupo', el).onclick = () => { commit(() => { p.kc = null; }, { render: false }); renderDetalleSoloCuerpo(); };
  $('#fDup', el).onclick = () => {
    const c = structuredClone(p); c.id = uid('p'); c.nombre = p.nombre + ' (copia)'; c.origen = null;
    commit((d) => { d.planes.push(c); ui.planId = c.id; }); toast('Plan duplicado');
  };
  $('#fDel', el).onclick = () => {
    if (!confirm(`¿Borrar el plan «${p.nombre}»? Se borran sus campañas. Las analíticas no se borran.`)) return;
    commit((d) => { d.planes = d.planes.filter((x) => x.id !== p.id); ui.planId = null; ui.verLista = true; }); toast('Plan borrado');
  };
  const fa = $('#fAuto', el);
  if (fa) fa.onclick = () => { const r = enlazarPlan(p, true); commit(() => {}, { render: false }); renderDetalleSoloCuerpo(); toast(r ? 'Enlazado con ' + r : 'No se encontró por nombre: elígelo en la lista', !r); };
  enlazarRD(el, p);
  if (od === 'listo') ALM.existeCarpetaCliente(p.carpeta).then((ok) => { const s = $('#fCarp'); if (s && !ok) s.innerHTML += ' <span class="chip amb">esa carpeta no existe: se creará con el primer PDF</span>'; });
}

/* ----- Pestaña Analíticas del plan ----- */
const RANGOS = { pctK: [0.025, 0.05], pctCa: [0.7, 0.75], pctMg: [0.08, 0.15] };
function opcionesAnal(tipo, sel) {
  const l = db.analiticas.filter((a) => a.tipo === tipo).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return `<option value="">— Sin analítica —</option>` + l.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.nombre)} · ${fechaEs(a.fecha)}${a.ref ? ' · ' + esc(a.ref) : ''}${a.plantilla ? ' · PLANTILLA' : ''}${a.origen === 'cartografia' ? ' · CARTOGRAFÍA' : ''}</option>`).join('');
}
function usos(a) { return db.planes.filter((p) => p.analSuelo === a.id || p.analAgua === a.id || Object.values(p.campanas || {}).some((c) => (c.estiercoles || []).some((e) => e.analId === a.id))); }
function resumenSuelo(a) {
  if (!a) return '<p class="muted small">Sin analítica de suelo.</p>';
  const r = CALC.suelo(a), v = a.v || {};
  const pc = (x, rg) => (x == null ? '–' : `<span class="${x < rg[0] || x > rg[1] ? 'chip amb' : 'chip v'}">${fmt(x * 100, 1)} %</span>`);
  return `${a.plantilla ? '<div class="aviso alto">Es la analítica de la plantilla, copiada en muchos Excels: no es de esta finca.</div>' : ''}${a.origen === 'cartografia' ? '<div class="aviso bajo">Datos de la cartografía de suelos (IMIDA), mientras no haya analítica de esta finca.</div>' : ''}
    <div class="scroll-x"><table class="t" style="margin-top:8px"><tr><th>Fecha</th><th>Ref.</th><th>Textura</th><th class="n">CE</th><th class="n">pH</th><th class="n">MO %</th><th class="n">N total %</th><th class="n">C/N</th><th class="n">NO3 mg/kg</th><th class="n">P Olsen</th><th class="n">Carbon. %</th><th class="n">Caliza act. %</th></tr>
    <tr><td>${fechaEs(a.fecha)}</td><td>${esc(a.ref || '–')}</td><td>${esc(v.textura || '–')}${v.arcilla != null ? ` <span class="muted small">${fmt(v.arena, 0)}/${fmt(v.limo, 0)}/${fmt(v.arcilla, 0)}</span>` : ''}</td><td class="n">${fmt(v.ce, 2)}</td><td class="n">${fmt(v.ph, 1)}</td><td class="n">${fmt(v.mo, 2)}</td><td class="n">${fmt(v.ntotal, 3)}</td><td class="n">${fmt(CALC.relCN(v), 1)}</td><td class="n">${fmt(v.no3, 0)}</td><td class="n">${fmt(v.p, 1)}</td><td class="n">${fmt(v.caliza, 1)}</td><td class="n">${fmt(v.calizaActiva, 1)}</td></tr></table></div>
    ${['fe', 'mn', 'cu', 'zn', 'b', 'cl', 'so4'].some((k) => v[k] != null) ? `<div class="row small" style="margin-top:6px">${[['Fe', 'fe', 'mg/kg'], ['Mn', 'mn', 'mg/kg'], ['Cu', 'cu', 'mg/kg'], ['Zn', 'zn', 'mg/kg'], ['B', 'b', 'mg/kg'], ['Cl', 'cl', 'meq/100 g'], ['SO4', 'so4', 'meq/100 g']].filter(([, k]) => v[k] != null).map(([t, k, u]) => `<span class="chip">${t} ${fmt(v[k], 2)} <span class="muted">${u}</span></span>`).join('')}</div>` : ''}
    <table class="t" style="margin-top:8px"><tr><th></th><th class="n">mg/kg</th><th class="n">meq/100 g</th><th class="n">% bases</th><th>Ideal</th></tr>
    ${[['K', 'k', 'pctK', '2,5-5 %'], ['Ca', 'ca', 'pctCa', '70-75 %'], ['Mg', 'mg', 'pctMg', '8-15 %'], ['Na', 'na', null, '']].map(([t, k, pk, id]) => `<tr><td><b>${t}</b></td><td class="n">${fmt((a.u || {})[k] === 'meq/100 g' ? (r.meq[k] == null ? null : r.meq[k] * { k: 391, ca: 200.4, mg: 121.6, na: 230 }[k]) : v[k], 0)}</td><td class="n">${fmt(r.meq[k], 2)}</td><td class="n">${pk ? pc(r[pk], RANGOS[pk]) : ''}</td><td class="muted small">${id}</td></tr>`).join('')}</table>
    <div class="row small" style="margin-top:8px"><span class="chip">K/Mg ${fmt(r.kMg, 2)} <span class="muted">(0,3 ideal)</span></span><span class="chip">Ca/Mg ${fmt(r.caMg, 2)} <span class="muted">(2-5)</span></span><span class="chip">Ca/K ${fmt(r.caK, 1)} <span class="muted">(&lt; 30)</span></span></div>`;
}
function resumenAgua(a) {
  if (!a) return '<p class="muted small">Sin analítica de agua.</p>';
  const r = CALC.agua(a), v = a.v || {};
  const n = usos(a).length;
  return `${a.plantilla ? '<div class="aviso alto">Es la analítica de la plantilla, copiada en muchos Excels.</div>' : ''}
    <div class="row small" style="margin:6px 0">${a.nombre ? `<b>${esc(a.nombre)}</b>` : ''}<span class="chip ${n > 1 ? 'azul' : ''}">Usada en ${plural(n, 'plan', 'planes')}</span></div>
    <table class="t"><tr><th>Fecha ${fechaEs(a.fecha)}${a.ref ? ' · ' + esc(a.ref) : ''}</th><th class="n">mg/L</th><th class="n">meq/L</th><th>&nbsp;</th><th class="n"></th></tr>
    <tr><td>CE (dS/m)</td><td class="n">${fmt(v.ce, 2)}</td><td></td><td>pH</td><td class="n">${fmt(v.ph, 1)}</td></tr>
    ${[['Nitratos NO3', 'no3', 1], ['Potasio K', 'k', 1], ['Calcio Ca', 'ca', 0], ['Magnesio Mg', 'mg', 0], ['Sodio Na', 'na', 0], ['Sulfatos SO4', 'so4', 0], ['Cloruros Cl', 'cl', 0]].map(([t, k, d]) => `<tr><td>${t}</td><td class="n">${fmt(v[k], d)}</td><td class="n muted">${fmt(r.meq[k], 2)}</td><td></td><td></td></tr>`).join('')}
    <tr><td>Bicarbonatos HCO3</td><td></td><td class="n">${fmt(v.hco3, 2)}</td><td>Boro (mg/L)</td><td class="n">${fmt(v.b, 2)}</td></tr>
    ${v.co3 != null ? `<tr><td>Carbonatos CO3</td><td></td><td class="n">${fmt(v.co3, 2)}</td><td></td><td></td></tr>` : ''}</table>
    <div class="row small" style="margin-top:6px"><span class="chip">SAR ${fmt(r.sar, 2)}</span><span class="chip">Dureza ${fmt(r.dureza, 1)} ºf</span>${r.balance != null ? `<span class="chip ${Math.abs(r.balance) > 10 ? 'amb' : ''}">Cationes ${fmt(r.cat, 1)} / aniones ${fmt(r.an, 1)} meq/L</span>` : ''}</div>`;
}
function tabAnaliticas(el, p, camp) {
  const s = anal(p.analSuelo), w = anal(p.analAgua);
  const ests = db.analiticas.filter((a) => a.tipo === 'estiercol');
  el.innerHTML = `<div class="grid2">
    <div><h3>Suelo</h3><div class="row"><select class="cell izq" id="aSuelo" style="flex:1">${opcionesAnal('suelo', p.analSuelo)}</select>
      ${s ? '<button class="btn peq" id="aSueloEd">Editar</button>' : ''}<button class="btn peq" id="aSueloN">+ Nueva</button></div>${resumenSuelo(s)}</div>
    <div><h3>Agua de riego</h3><div class="row"><select class="cell izq" id="aAgua" style="flex:1">${opcionesAnal('agua', p.analAgua)}</select>
      ${w ? '<button class="btn peq" id="aAguaEd">Editar</button>' : ''}<button class="btn peq" id="aAguaN">+ Nueva</button></div>${resumenAgua(w)}</div></div>
    <h3 style="margin-top:20px">Estiércoles y enmiendas orgánicas · campaña ${esc(ui.camp)}</h3>
    ${camp ? `<p class="small muted">Restan N, P, K, Ca y Mg siempre, sea o no zona vulnerable. El año de aplicación marca el % de N que se mineraliza (tabla 4).</p>
    <table class="t"><tr><th>Analítica de estiércol</th><th class="n">Dosis (kg/ha)</th><th>Año</th><th class="n">N total (kg/ha)</th><th class="n">N mineralizado</th><th></th></tr>
    ${(camp.estiercoles || []).map((e, i) => { const b = CALC.balanceN(p, { ...camp, estiercoles: [e] }, analDePlan(p), 'estimado', cfg()).est[0] || {}; return `<tr><td><select class="cell izq" data-est="${i}" data-c="analId">${ests.map((a) => `<option value="${a.id}" ${a.id === e.analId ? 'selected' : ''}>${esc(a.nombre)} · ${esc((a.v && a.v.tipo) || '')} · ${fechaEs(a.fecha)}</option>`).join('')}</select></td>
      <td class="w"><input class="cell" data-est="${i}" data-c="dosis" value="${fmtIn(e.dosis)}"></td>
      <td><select class="cell izq" data-est="${i}" data-c="anio">${[1, 2, 3].map((n) => `<option value="${n}" ${+e.anio === n ? 'selected' : ''}>${n}º año</option>`).join('')}</select></td>
      <td class="n">${fmt(b.nTotal, 1)}</td><td class="n">${fmt(b.nMin, 1)}</td><td><button class="btn peq rojo" data-estdel="${i}">Quitar</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">No se aplica estiércol esta campaña.</td></tr>'}
    </table><div class="row" style="margin-top:8px"><button class="btn peq" id="aEstAdd" ${ests.length ? '' : 'disabled'}>+ Añadir estiércol</button><button class="btn peq" id="aEstN">+ Nueva analítica de estiércol</button></div>` : '<p class="muted">Crea antes la campaña.</p>'}`;
  $('#aSuelo', el).onchange = (e) => { commit(() => { p.analSuelo = e.target.value || null; }, { render: false }); renderDetalleSoloCuerpo(); };
  $('#aAgua', el).onchange = (e) => { commit(() => { p.analAgua = e.target.value || null; }, { render: false }); renderDetalleSoloCuerpo(); };
  if (s) $('#aSueloEd', el).onclick = () => editarAnalitica(s);
  if (w) $('#aAguaEd', el).onclick = () => editarAnalitica(w);
  $('#aSueloN', el).onclick = () => editarAnalitica({ tipo: 'suelo', v: {}, u: {} }, p);
  $('#aAguaN', el).onclick = () => editarAnalitica({ tipo: 'agua', v: {}, u: {} }, p);
  if (!camp) return;
  $$('[data-est]', el).forEach((inp) => inp.addEventListener('change', () => {
    const i = +inp.dataset.est, c = inp.dataset.c;
    commit(() => { const e = camp.estiercoles[i]; e[c] = c === 'analId' ? inp.value : (CALC.num(inp.value) ?? 0); }, { render: false });
    renderDetalleSoloCuerpo();
  }));
  $$('[data-estdel]', el).forEach((b) => { b.onclick = () => { commit(() => { camp.estiercoles.splice(+b.dataset.estdel, 1); }, { render: false }); renderDetalleSoloCuerpo(); }; });
  $('#aEstAdd', el).onclick = () => { commit(() => { camp.estiercoles = camp.estiercoles || []; camp.estiercoles.push({ analId: ests[0].id, dosis: 0, anio: 1 }); }, { render: false }); renderDetalleSoloCuerpo(); };
  $('#aEstN', el).onclick = () => editarAnalitica({ tipo: 'estiercol', v: { tipo: CALC.TABLAS.estiercol[0].tipo }, u: {} }, p);
}

/* Editor de una analítica (nueva o existente). paraPlan: se enlaza al plan al crearla. */
function editarAnalitica(a, paraPlan = null) {
  const nueva = !a.id;
  const v = a.v || {}, u = a.u || {};
  const titulo = { suelo: 'Analítica de suelo', agua: 'Analítica de agua de riego', estiercol: 'Analítica de estiércol' }[a.tipo];
  const f = (label, k, val, extra = '') => `<label class="fld"><span>${label}</span><input data-av="${k}" value="${esc(fmtIn(val))}" ${extra}></label>`;
  const unidad = (k) => `<select data-au="${k}" class="cell izq" style="width:auto"><option ${u[k] !== 'meq/100 g' ? 'selected' : ''}>mg/kg</option><option ${u[k] === 'meq/100 g' ? 'selected' : ''}>meq/100 g</option></select>`;
  let campos = '';
  if (a.tipo === 'suelo') {
    const txt = v.textura && !CALC.CLASES_TEXTURA.includes(v.textura) ? [...CALC.CLASES_TEXTURA, v.textura] : CALC.CLASES_TEXTURA;
    campos = `<h3>Análisis físico</h3><div class="grid4">
      ${f('Arena (%)', 'arena', v.arena, 'data-gran')}${f('Limo (%)', 'limo', v.limo, 'data-gran')}${f('Arcilla (%)', 'arcilla', v.arcilla, 'data-gran')}
      <label class="fld"><span>Textura</span><select data-avt="textura" id="aTex"><option value="">—</option>${txt.map((t) => `<option ${t === v.textura ? 'selected' : ''}>${t}</option>`).join('')}</select><span class="auto" id="aTexAuto"></span></label>
      ${f('Densidad aparente (g/cm³)', 'densidad', v.densidad)}</div>
      <h3 style="margin-top:14px">Físico-químico</h3><div class="grid4">
      ${f('pH (1:2,5 en agua)', 'ph', v.ph)}${f('CE (dS/m)', 'ce', v.ce)}
      <label class="fld"><span>Extracto de la CE</span><select data-avt="ceExtracto"><option value="1:5" ${v.ceExtracto !== 'pasta' ? 'selected' : ''}>1:5 en agua</option><option value="pasta" ${v.ceExtracto === 'pasta' ? 'selected' : ''}>Pasta saturada</option></select></label></div>
      <h3 style="margin-top:14px">Materia orgánica y nitrógeno</h3><div class="grid4">
      ${f('MO oxidable (%) · la del cálculo', 'mo', v.mo)}${f('MO total (%)', 'moTotal', v.moTotal)}${f('Carbono orgánico total (%)', 'cot', v.cot)}${f('Nitrógeno total Kjeldahl (%)', 'ntotal', v.ntotal)}
      ${f('Nitratos NO3 (mg/kg)', 'no3', v.no3)}<label class="fld"><span>Relación C/N</span><input id="aCN" disabled value=""></label></div>
      <h3 style="margin-top:14px">Carbonatos, fósforo y boro</h3><div class="grid4">
      ${f('Carbonatos totales (%)', 'caliza', v.caliza)}${f('Caliza activa (%)', 'calizaActiva', v.calizaActiva)}${f('Fósforo P Olsen (mg/kg)', 'p', v.p)}${f('Boro asimilable (mg/kg)', 'b', v.b)}</div>
      <h3 style="margin-top:14px">Cationes asimilables</h3><div class="grid4">${['k', 'ca', 'mg', 'na'].map((k) => `<label class="fld"><span>${{ k: 'Potasio (K)', ca: 'Calcio (Ca)', mg: 'Magnesio (Mg)', na: 'Sodio (Na)' }[k]} ${unidad(k)}</span><input data-av="${k}" value="${esc(fmtIn(v[k]))}"></label>`).join('')}</div>
      <h3 style="margin-top:14px">Microelementos asimilables (mg/kg)</h3><div class="grid4">${f('Hierro (Fe)', 'fe', v.fe)}${f('Manganeso (Mn)', 'mn', v.mn)}${f('Cobre (Cu)', 'cu', v.cu)}${f('Zinc (Zn)', 'zn', v.zn)}</div>
      <h3 style="margin-top:14px">Aniones solubles, extracto 1:5 (meq/100 g)</h3><div class="grid4">${f('Cloruros (Cl)', 'cl', v.cl)}${f('Sulfatos (SO4)', 'so4', v.so4)}</div>`;
  } else if (a.tipo === 'agua') {
    campos = `<div class="grid4">${f('CE (dS/m)', 'ce', v.ce)}${f('pH', 'ph', v.ph)}${f('Nitratos NO3 (mg/L)', 'no3', v.no3)}${f('Fósforo P (mg/L)', 'p', v.p)}
      ${f('Potasio K (mg/L)', 'k', v.k)}${f('Calcio Ca (mg/L)', 'ca', v.ca)}${f('Magnesio Mg (mg/L)', 'mg', v.mg)}${f('Sodio Na (mg/L)', 'na', v.na)}
      ${f('Sulfatos SO4 (mg/L)', 'so4', v.so4)}${f('Cloruros Cl (mg/L)', 'cl', v.cl)}${f('Bicarbonatos HCO3 (meq/L)', 'hco3', v.hco3)}${f('Carbonatos CO3 (meq/L)', 'co3', v.co3)}
      ${f('Boro B (mg/L)', 'b', v.b)}</div>`;
  } else {
    campos = `<div class="grid4"><label class="fld" style="grid-column:span 2"><span>Tipo (tabla 4)</span><select data-avt="tipo">${CALC.TABLAS.estiercol.map((t) => `<option ${CALC.norm(t.tipo) === CALC.norm(v.tipo) ? 'selected' : ''}>${t.tipo}</option>`).join('')}</select></label>
      ${f('Materia seca (%)', 'ms', v.ms, 'placeholder="60 si no hay dato"')}${f('Nitrógeno total (% s.m.s.)', 'n', v.n, 'placeholder="riqueza de la tabla 4"')}
      ${f('P2O5 (% s.m.s.)', 'p2o5', v.p2o5)}${f('K2O (% s.m.s.)', 'k2o', v.k2o)}${f('CaO (% s.m.s.)', 'cao', v.cao)}${f('MgO (% s.m.s.)', 'mgo', v.mgo)}</div>`;
  }
  // Planes que la usan (suelo y agua): se puede enlazar a varios a la vez (agua de una comunidad de regantes)
  let enlaces = '';
  if (a.tipo !== 'estiercol') {
    const campoPlan = a.tipo === 'suelo' ? 'analSuelo' : 'analAgua';
    const porCli = {};
    for (const p of [...db.planes].sort((x, y) => (x.cliente || '').localeCompare(y.cliente || '', 'es') || x.nombre.localeCompare(y.nombre, 'es'))) (porCli[p.cliente] = porCli[p.cliente] || []).push(p);
    enlaces = `<h3 style="margin-top:16px">Planes que usan esta analítica</h3>
      <p class="small muted">${a.tipo === 'agua' ? 'Marca todas las fincas de la misma comunidad de regantes.' : 'Normalmente, los planes de la misma finca.'}</p>
      <div class="lista-imp" style="max-height:220px">${Object.entries(porCli).map(([c, ps]) => `<div class="grupo-cli">${esc(c)}</div>${ps.map((p) => {
        const marcado = a.id ? p[campoPlan] === a.id : (paraPlan && paraPlan.id === p.id);
        const otra = !marcado && p[campoPlan] ? anal(p[campoPlan]) : null;
        return `<label><input type="checkbox" data-usa="${p.id}" ${marcado ? 'checked' : ''}> ${esc(p.nombre)} <span class="muted small">${esc(p.finca)}${otra ? ' · ahora: ' + esc(otra.nombre) : ''}</span></label>`; }).join('')}`).join('')}</div>`;
  }
  const m = modal(nueva ? 'Nueva ' + titulo.toLowerCase() : titulo, `
    <div class="grid4">
      <label class="fld" style="grid-column:span 2"><span>Nombre ${a.tipo === 'agua' ? '(p. ej. comunidad de regantes)' : ''}</span><input data-am="nombre" value="${esc(a.nombre || '')}"></label>
      <label class="fld"><span>Fecha</span><input type="date" data-am="fecha" value="${esc(a.fecha || '')}"></label>
      <label class="fld"><span>Referencia</span><input data-am="ref" value="${esc(a.ref || '')}"></label>
      ${a.tipo === 'suelo' ? `<label class="fld"><span>Origen de los datos</span><select data-am="origen"><option value="" ${a.origen !== 'cartografia' ? 'selected' : ''}>Analítica de laboratorio</option><option value="cartografia" ${a.origen === 'cartografia' ? 'selected' : ''}>Cartografía de suelos (IMIDA)</option></select></label>` : ''}
      <label class="fld" style="grid-column:span ${a.tipo === 'suelo' ? 1 : 2}"><span>Laboratorio</span><input data-am="lab" value="${esc(a.lab || '')}"></label>
      <label class="fld" style="grid-column:span 2"><span>Notas</span><input data-am="notas" value="${esc(a.notas || '')}"></label>
    </div><div style="margin-top:12px">${campos}</div>
    ${a.tipo !== 'estiercol' ? `<label class="chk" style="margin-top:12px"><input type="checkbox" data-am="plantilla" ${a.plantilla ? 'checked' : ''}> Es de plantilla (no es real de ninguna finca)</label>` : ''}
    ${enlaces}`,
  { pie: `${!nueva ? '<button class="btn rojo" id="mDel">Borrar</button><span class="spacer"></span>' : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn p" id="mOk">Guardar</button>`, ancho: true });
  $$('[data-cerrar]', m).forEach((b) => { b.onclick = cerrarModal; });
  if (a.tipo === 'suelo') {
    const val = (k) => { const i = $(`[data-av="${k}"]`, m); return i ? CALC.num(i.value) : null; };
    const vivo = (inicio) => {
      const cl = CALC.claseTextura(val('arena'), val('limo'), val('arcilla')), sel = $('#aTex', m);
      $('#aTexAuto', m).textContent = cl ? `Por granulometría: ${cl}` : '';
      if (cl && !(inicio && sel.value)) { if (![...sel.options].some((o) => o.value === cl)) sel.add(new Option(cl, cl)); sel.value = cl; }
      const cot = val('cot') ?? (val('moTotal') != null ? val('moTotal') / 1.724 : null), n = val('ntotal');
      $('#aCN', m).value = cot != null && n ? fmtIn(Math.round(cot / n * 10) / 10) : '';
    };
    $$('[data-av]', m).forEach((i) => i.addEventListener('input', () => vivo(false)));
    vivo(true);
  }
  $('#mOk', m).onclick = () => {
    const obj = nueva ? { id: uid('a'), tipo: a.tipo, v: {}, u: {} } : a;
    commit((d) => {
      $$('[data-am]', m).forEach((i) => { obj[i.dataset.am] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
      if (obj.tipo !== 'estiercol') obj.plantillaRevisada = true;
      obj.v = obj.v || {}; obj.u = obj.u || {};
      $$('[data-av]', m).forEach((i) => { obj.v[i.dataset.av] = CALC.num(i.value); });
      $$('[data-avt]', m).forEach((i) => { obj.v[i.dataset.avt] = i.value; });
      $$('[data-au]', m).forEach((i) => { obj.u[i.dataset.au] = i.value; });
      if (!obj.nombre) obj.nombre = (obj.tipo === 'suelo' ? 'Suelo ' : obj.tipo === 'agua' ? 'Agua ' : 'Estiércol ') + (paraPlan ? paraPlan.finca : fechaEs(obj.fecha));
      delete obj.clave;
      if (nueva) d.analiticas.push(obj);
      if (obj.tipo !== 'estiercol') {
        const campoPlan = obj.tipo === 'suelo' ? 'analSuelo' : 'analAgua';
        $$('[data-usa]', m).forEach((c) => { const p = d.planes.find((x) => x.id === c.dataset.usa); if (!p) return; if (c.checked) p[campoPlan] = obj.id; else if (p[campoPlan] === obj.id) p[campoPlan] = null; });
      } else if (nueva && paraPlan) {
        const c = paraPlan.campanas && paraPlan.campanas[ui.camp];
        if (c) { c.estiercoles = c.estiercoles || []; c.estiercoles.push({ analId: obj.id, dosis: 0, anio: 1 }); }
      }
    });
    cerrarModal(); toast('Analítica guardada');
  };
  const del = $('#mDel', m);
  if (del) del.onclick = () => {
    const n = usos(a).length;
    if (!confirm(n ? `La usan ${plural(n, 'plan', 'planes')}: se quedarán sin esta analítica. ¿Borrarla?` : '¿Borrar esta analítica?')) return;
    commit((d) => {
      d.analiticas = d.analiticas.filter((x) => x.id !== a.id);
      for (const p of d.planes) { if (p.analSuelo === a.id) p.analSuelo = null; if (p.analAgua === a.id) p.analAgua = null; for (const c of Object.values(p.campanas || {})) c.estiercoles = (c.estiercoles || []).filter((e) => e.analId !== a.id); }
    });
    cerrarModal(); toast('Analítica borrada');
  };
}

/* ----- Pestaña Riego ----- */
function tabRiego(el, p, camp) {
  if (!camp) { el.innerHTML = '<p class="muted">Crea antes la campaña.</p>'; return; }
  const r = CALC.riego(p, camp, cfg());
  el.innerHTML = `<div class="row small muted" style="margin-bottom:10px">
      <span class="chip">KL ${fmt(r.kl, 3)}${r.klRaw > 1 ? ' (tope 1)' : ''}</span><span class="chip">Eficiencia ${fmt(r.efic, 2)} × uniformidad 0,90</span>
      <span class="chip">${fmt(r.arbHa, 0)} árboles/ha</span><span class="chip">${fmt(r.caudalHa, 2)} m³/ha por hora</span><span class="chip">Consumo finca ${fmt(r.consumoHora, 2)} m³/h</span>
      <span class="spacer"></span><button class="btn peq" id="rHoras" title="Con los riegos puestos, calcula las horas (redondeo a 15 min)">Ajustar horas a lo teórico</button><button class="btn peq" id="rRiegos" title="Con las horas puestas, calcula el nº de riegos">Ajustar riegos a lo teórico</button></div>
    <div class="scroll-x"><table class="t"><tr><th>Mes</th><th class="n">ETo mm</th><th class="n">Kc</th><th class="n">ETc mm</th><th class="n">Necesidad m³/ha</th><th class="n">Horas teóricas</th><th class="n">Horas/riego</th><th class="n">Nº riegos</th><th class="n">Riegos teóricos</th><th class="n">Aplicado m³/ha</th><th class="n">m³ finca</th><th class="n">% nec.</th></tr>
    ${r.filas.map((f, i) => `<tr><td>${f.mes}</td><td class="n">${fmt(f.eto, 1)}</td><td class="n">${fmt(f.kc, 2)}</td><td class="n">${fmt(f.etc, 1)}</td><td class="n">${fmt(f.vTeo, 0)}</td><td class="n muted">${hhmm(f.horasTeo)}</td>
      <td class="w"><input class="cell" data-rh="${i}" value="${hhmm(f.h)}" placeholder="0:00"></td><td class="w"><input class="cell" data-rn="${i}" value="${f.n || ''}" placeholder="0"></td>
      <td class="n muted">${f.riegosEst ?? '–'}</td><td class="n"><b>${fmt(f.vApl, 0)}</b></td><td class="n">${fmt(f.vFinca, 0)}</td>
      <td class="n"><span class="${f.vTeo && (f.vApl / f.vTeo < 0.8 || f.vApl / f.vTeo > 1.2) ? 'chip amb' : ''}">${f.vTeo ? fmt(f.vApl / f.vTeo * 100, 0) + ' %' : '–'}</span></td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td class="n">${fmt(r.filas.reduce((t, f) => t + f.eto, 0), 0)}</td><td></td><td class="n">${fmt(r.filas.reduce((t, f) => t + f.etc, 0), 0)}</td><td class="n">${fmt(r.totTeo, 0)}</td><td></td><td></td><td class="n">${r.filas.reduce((t, f) => t + (f.n || 0), 0)}</td><td></td><td class="n">${fmt(r.totApl, 0)}</td><td class="n">${fmt(r.totFinca, 0)}</td><td class="n">${r.totTeo ? fmt(r.totApl / r.totTeo * 100, 0) + ' %' : ''}</td></tr></table></div>
    <p class="small muted">ETo de la zona de Mula (Ajustes). Sin lluvia efectiva. Horas en formato 2:30. En ámbar, los meses con menos del 80 % o más del 120 % de la necesidad. El total aplicado es la dosis de riego del balance de N.</p>`;
  const guardarMes = (i, k, val) => { commit(() => { camp.riego = camp.riego || CALC.MESES.map(() => ({ h: 0, n: 0 })); camp.riego[i] = { ...(camp.riego[i] || { h: 0, n: 0 }), [k]: val }; }, { render: false }); renderDetalleSoloCuerpo(); };
  $$('[data-rh]', el).forEach((inp) => inp.addEventListener('change', () => guardarMes(+inp.dataset.rh, 'h', parseHora(inp.value))));
  $$('[data-rn]', el).forEach((inp) => inp.addEventListener('change', () => guardarMes(+inp.dataset.rn, 'n', Math.max(0, Math.round(CALC.num(inp.value) || 0)))));
  $('#rHoras', el).onclick = () => {
    commit(() => { r.filas.forEach((f, i) => { const m = camp.riego[i]; if (m && m.n > 0 && r.caudalHa > 0) m.h = Math.max(0.25, Math.round(f.vTeo / m.n / r.caudalHa * 4) / 4); }); }, { render: false });
    renderDetalleSoloCuerpo(); toast('Horas ajustadas a la necesidad de cada mes');
  };
  $('#rRiegos', el).onclick = () => {
    commit(() => { r.filas.forEach((f, i) => { const m = camp.riego[i]; if (m && m.h > 0 && f.riegosEst != null) m.n = f.riegosEst; }); }, { render: false });
    renderDetalleSoloCuerpo(); toast('Nº de riegos ajustado a la necesidad de cada mes');
  };
}

/* ----- Pestaña Balance N ----- */
function filaBal(t, d, v, clase = '') { return `<tr class="${clase}"><td>${t}</td><td class="small muted">${d}</td><td class="n"><b>${fmt(v, 1)}</b></td></tr>`; }
function tablaBalance(b) {
  if (b.modo === 'cerrado' && !b.prod) return '<div class="aviso bajo" style="margin-top:6px">Para cerrar la campaña, pon la producción real (y, si quieres, la dosis de riego real de los contadores).</div>';
  return `<table class="t"><tr><th>Concepto</th><th>Cálculo</th><th class="n">kg N/ha</th></tr>
    ${filaBal('E1. N mineral del suelo', `NO3 ${fmt(b.no3s, 0)} × fA ${fmt(b.fa && b.fa.valor, 1)} % × fB ${fmt(b.fb && b.fb.valor, 3)} × 5 × 0,226`, b.E1)}
    ${filaBal('E2. Humus del suelo', `${fmt(b.hum && b.hum.valor, 1)} kg/ha × fB`, b.E2)}
    ${filaBal('E3. Estiércol', b.est.length ? b.est.map((e) => `${esc(e.tipo || e.nombre)} ${fmt(e.dosis, 0)} kg/ha`).join(' · ') : 'No aplica', b.E3)}
    ${filaBal('E4. Agua de riego', `${fmt(b.dosisRiego, 0)} m³/ha × NO3 ${fmt(b.no3w, 1)} mg/L`, b.E4)}
    ${filaBal('Total entradas', '', b.entradas, 'tot')}
    ${filaBal('S1. Extracciones', `${fmt(b.prod, 1)} t/ha × ${fmt(b.coef, 2)} kg N/t`, b.S1, 'tot')}</table>
    <div class="res ${b.excede ? 'rojo' : ''}"><span>Aporte de N mineral permitido</span><strong>${fmt(b.aporte, 1)} kg N/ha</strong></div>`;
}
function tabBalance(el, p, camp) {
  if (!camp) { el.innerHTML = '<p class="muted">Crea antes la campaña.</p>'; return; }
  const A = analDePlan(p);
  const bE = CALC.balanceN(p, camp, A, 'estimado', cfg());
  const bC = CALC.balanceN(p, camp, A, 'cerrado', cfg());
  const ext = CALC.TABLAS.extraccion;
  const cult = CALC.CULTIVOS.find((c) => c.nombre === p.tipoCultivo);
  const sug = cult ? ext.find((e) => e.cultivo === cult.extraccion) : null;
  const ex = camp.excel;
  const pdfE = camp.pdf && camp.pdf.estimado, pdfC = camp.pdf && camp.pdf.cerrado;
  const ufCalc = FERT.ufCampana(p, camp, ixProd());
  const uf = ufCalc || camp.ufAplicadas || CALC.MESES.map(() => [0, 0, 0, 0, 0]);
  const autoTxt = (o) => (o ? `${o.manual ? 'Puesto a mano' : 'Automático'}: ${fmt(o.valor, 3)} · ${esc(o.txt || '')}` : 'Falta la analítica de suelo');
  el.innerHTML = `<div class="grid4">
      ${campo('Producción estimada (t/ha)', 'c.produccionEst', camp.produccionEst)}
      ${campo('Coef. de extracción (kg N/t)', 'c.coefExtraccion', camp.coefExtraccion, { auto: sug ? `${esc(sug.cultivo)}: ${fmt(sug.r[0], 1)}-${fmt(sug.r[1], 1)} (tabla 5)` : 'Elige el tipo de cultivo para ver la tabla 5' })}
      ${campo('Dosis de riego estimada (m³/ha)', 'c.dosisEstM3', camp.dosisEstM3, { ph: fmt(bE.dosisRiegoAuto, 0), auto: 'Vacío = lo programado en Riego' })}
      <div></div>
      ${campo('Producción real (t/ha)', 'c.produccionReal', camp.produccionReal, { auto: 'Para el balance cerrado' })}
      ${campo('Dosis de riego real (m³/ha)', 'c.dosisRealM3', camp.dosisRealM3, { ph: fmt(bC.dosisRiegoAuto, 0), auto: 'Vacío = lo programado en Riego' })}
    </div>
    <details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">Factores fA, fB y humus (automáticos de las tablas de la pestaña 1)</summary>
      <div class="grid3" style="margin-top:8px">
        ${campo('fA: agotamiento de nitratos (%)', 'c.ajustes.fA', camp.ajustes && camp.ajustes.fA, { ph: 'auto', auto: autoTxt(bE.fa) })}
        ${campo('fB: suelo humectado', 'c.ajustes.fB', camp.ajustes && camp.ajustes.fB, { ph: 'auto', auto: autoTxt(bE.fb) })}
        ${campo('N del humus (kg N/ha)', 'c.ajustes.humus', camp.ajustes && camp.ajustes.humus, { ph: 'auto', auto: autoTxt(bE.hum) })}
      </div><p class="small muted">Déjalos vacíos para que se calculen solos. fB sale del marco (filas a más o menos de 5 m) y de las líneas de emisores (pestaña Finca).</p></details>
    <div class="grid2" style="margin-top:14px">
      <div><h3>Estimado · inicio de campaña</h3>${tablaBalance(bE)}
        <div class="row" style="margin-top:10px"><button class="btn p" id="bPdfE">PDF estimado</button><span class="small muted">${pdfE ? `Último: ${fechaEs(pdfE.fecha)} · ${fmt(pdfE.aporte, 1)} kg N/ha${pdfE.pendiente ? ' · pendiente de pasar a OneDrive' : ''}` : 'Aún sin PDF'}</span></div></div>
      <div><h3>Cerrado · fin de campaña</h3>${tablaBalance(bC)}
        <div class="row" style="margin-top:10px"><button class="btn p" id="bPdfC">PDF cerrado</button><span class="small muted">${pdfC ? `Último: ${fechaEs(pdfC.fecha)}${pdfC.pendiente ? ' · pendiente de pasar a OneDrive' : ''}` : 'Aún sin PDF'}</span></div></div>
    </div>
    ${p.vulnerable ? `<div class="aviso ${bE.excedeOrg ? 'alto' : 'bajo'}" style="margin-top:12px">Zona vulnerable · N orgánico total aplicado: <b>${fmt(bE.nOrgTotal, 1)} kg N/ha</b> (límite ${fmt(cfg().tablas.limiteNOrganico, 0)}).</div>` : ''}
    <h3 style="margin-top:20px">N del plan de fertirrigación (kg UF/ha)</h3>
    <p class="small muted">${ufCalc ? 'Calculado con los productos y dosis de cada mes (pestaña Fertirrigación).' : 'Sin productos en la pestaña Fertirrigación: puedes escribirlo a mano.'}</p>
    <div class="scroll-x"><table class="t"><tr><th></th>${CALC.MESES.map((m) => `<th class="n">${m.slice(0, 3)}</th>`).join('')}<th class="n">Total</th></tr>
      ${['N', 'P2O5', 'K2O', 'CaO', 'MgO'].map((nu, j) => `<tr><td><b>${nu}</b></td>${uf.map((m, i) => (ufCalc ? `<td class="n">${m[j] ? fmt(m[j], 1) : '<span class="muted">–</span>'}</td>` : `<td><input class="cell" data-uf="${i}.${j}" value="${fmtIn(m && m[j] ? Math.round(m[j] * 10) / 10 : '')}"></td>`)).join('')}<td class="n"><b>${fmt(uf.reduce((t, m) => t + (+(m && m[j]) || 0), 0), 1)}</b></td></tr>`).join('')}</table></div>
    <div class="res ${bE.excede ? 'rojo' : ''}" style="margin-top:10px"><span>N del plan frente al permitido (estimado)</span><strong>${fmt(bE.nAplicado, 1)} / ${fmt(bE.aporte, 1)} kg N/ha</strong></div>
    ${ex && ex.nBalance != null ? `<p class="small muted" style="margin-top:10px">En el Excel salía ${fmt(ex.nBalance, 1)} kg N/ha (sin fA, fB ni humus, y con ${fmt(ex.dosisRiego, 0)} m³/ha de riego escritos a mano).</p>` : ''}`;
  enlazarCampos(el, p);
  $$('[data-uf]', el).forEach((inp) => inp.addEventListener('change', () => {
    const [i, j] = inp.dataset.uf.split('.').map(Number);
    commit(() => { camp.ufAplicadas = camp.ufAplicadas || CALC.MESES.map(() => [0, 0, 0, 0, 0]); camp.ufAplicadas[i][j] = CALC.num(inp.value) ?? 0; }, { render: false });
    renderDetalleSoloCuerpo();
  }));
  $('#bPdfE', el).onclick = () => generarPDF(p, 'estimado');
  $('#bPdfC', el).onclick = () => generarPDF(p, 'cerrado');
}

async function generarPDF(p, modo) {
  const camp = campDe(p); if (!camp) return;
  const A = analDePlan(p);
  const b = CALC.balanceN(p, camp, A, modo, cfg());
  if (modo === 'cerrado' && !CALC.num(camp.produccionReal)) { toast('Pon antes la producción real', true); return; }
  if (!b.prod || !b.coef) { toast('Faltan la producción o el coeficiente de extracción', true); return; }
  if (!A.suelo && !confirm('El plan no tiene analítica de suelo. ¿Sacar el PDF igualmente?')) return;
  if ((A.suelo && A.suelo.plantilla || A.agua && A.agua.plantilla) && !confirm('El plan usa una analítica de plantilla (no es de esta finca). ¿Sacar el PDF igualmente?')) return;
  const est = camp.estiercoles || [];
  const ests = est.map((e) => A.estiercoles[e.analId]).filter(Boolean);
  const bEst = modo === 'cerrado' ? (camp.pdf && camp.pdf.estimado) || { ...CALC.balanceN(p, camp, A, 'estimado', cfg()), fecha: null } : null;
  const campKey = ui.camp;
  try {
    const blob = PDF.balance({ plan: p, campKey, b, bEst, anal: { suelo: A.suelo, agua: A.agua, estiercoles: ests }, logo: logoCache, autor: db.config.autor });
    const nombre = `Balance N ${p.nombre} ${campKey} ${modo === 'cerrado' ? 'Cerrado' : 'Estimado'}.pdf`;
    const carpeta = p.carpeta || ((p.cliente || 'Sin cliente') + '/' + (p.finca || 'Sin finca'));
    const reg = { fecha: new Date().toISOString(), ruta: null, pendiente: false, aporte: b.aporte, dosisRiego: b.dosisRiego, prod: b.prod, entradas: b.entradas, nAplicado: b.nAplicado };
    if (od === 'listo' || (od === 'pedir-permiso' && await ALM.reconectar().catch(() => false))) {
      od = 'listo';
      reg.ruta = await ALM.guardarPDF(carpeta, nombre, blob);
      verPdf(blob, nombre);
      toast('PDF guardado en ' + reg.ruta);
    } else {
      // Tablet (o sin OneDrive): se ve o se comparte ya, y queda en Drive hasta que el ordenador lo pase a OneDrive
      verPdf(blob, nombre);
      if (offline) { toast('Sin conexión: el PDF no se ha guardado en Drive. Vuelve a sacarlo con conexión.', true); return; }
      reg.pendiente = true;
      reg.pdfId = await NUBE.subirPdf(nombre, blob, { carpeta, planId: p.id, camp: campKey, modo });
      toast('PDF listo. Se guardará en OneDrive la próxima vez que abras la app en el ordenador');
    }
    commit(() => { camp.pdf = camp.pdf || {}; camp.pdf[modo] = reg; }, { render: false });
    renderDetalleSoloCuerpo();
  } catch (e) { toast('No se pudo crear el PDF: ' + (e.message || e), true); }
}

function verPdf(blob, nombre) {
  try {
    const file = new File([blob], nombre, { type: 'application/pdf' });
    if (od === 'no-disponible' && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: nombre }).catch(() => {}); return; }
  } catch (_) { /* sin compartir */ }
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) { const a = document.createElement('a'); a.href = url; a.download = nombre; a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/* Datos de la versión 1.0 (guardados en OneDrive) → Drive */
async function traerV10() {
  if (!(await asegurarOneDrive())) return;
  let d;
  try { d = await ALM.cargar(); } catch (e) { toast(e.message || String(e), true); return; }
  if (!d || !d.planes) { toast('No hay datos de la versión 1.0 en esta carpeta', true); return; }
  if (db.planes.length && !confirm(`Drive ya tiene ${db.planes.length} planes. ¿Sustituirlos por los ${d.planes.length} de la versión 1.0?`)) return;
  const logo = await ALM.logo();
  commit(() => { db = migrar(d); if (logo && !db.config.logo) db.config.logo = logo; IMP.asegurarRepartos(db); asegurarFert(db); });
  prepararVista(); renderAll();
  toast(`${plural(d.planes.length, 'plan traído', 'planes traídos')} de la versión 1.0`);
}

/* ---------- Gráfica de barras por mes (kg UF/ha o %) ---------- */
const NUT_TXT = ['N', 'P2O5', 'K2O', 'CaO', 'MgO'];
/* series: [{ nombre, valores[12] }] (un color por nutriente, siempre en el mismo orden); marcas: [{ nombre, valores[12] }] trazos sobre la serie 0 */
function grafica(series, { unidad = 'kg UF/ha', marcas = null, alto = 230, decimales = 1 } = {}) {
  const W = 960, H = alto, ml = 46, mr = 10, mt = 12, mb = 26;
  const iw = W - ml - mr, ih = H - mt - mb;
  const vis = series.map((s, j) => ({ ...s, j })).filter((s) => !(ui.ocultas || []).includes(s.j));
  let max = 0;
  for (const s of vis) for (const v of s.valores) max = Math.max(max, +v || 0);
  if (marcas) for (const m of marcas) for (const v of m.valores) max = Math.max(max, +v || 0);
  const paso = (() => { const r = max / 4 || 1; const e = 10 ** Math.floor(Math.log10(r)); return [1, 2, 2.5, 5, 10].map((k) => k * e).find((k) => k >= r) || r; })();
  const top = Math.max(paso * Math.ceil(max / paso), paso);
  const y = (v) => mt + ih - (v / top) * ih;
  const gw = iw / 12, n = Math.max(vis.length, 1), gap = 2, pad = gw * 0.16;
  const bw = Math.max(3, (gw - 2 * pad - gap * (n - 1)) / n);
  let g = '';
  for (let t = 0; t <= top + 1e-9; t += paso) g += `<line x1="${ml}" x2="${W - mr}" y1="${y(t)}" y2="${y(t)}" class="gr-grid"/><text x="${ml - 6}" y="${y(t) + 4}" class="gr-eje" text-anchor="end">${fmt(t, paso < 1 ? 1 : 0)}</text>`;
  CALC.MESES.forEach((m, i) => { g += `<text x="${ml + gw * i + gw / 2}" y="${H - 8}" class="gr-eje" text-anchor="middle">${m.slice(0, 3)}</text>`; });
  vis.forEach((s, k) => {
    s.valores.forEach((v, i) => {
      v = +v || 0; if (v <= 0) return;
      const x = ml + gw * i + pad + k * (bw + gap), yy = y(v), h = mt + ih - yy, r = Math.min(4, bw / 2, h);
      g += `<path class="gr-bar s${s.j + 1}" data-t="${esc(CALC.MESES[i])} · ${esc(s.nombre)}: ${fmt(v, decimales)} ${esc(unidad)}" d="M${x},${mt + ih} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${mt + ih} Z"/>`;
    });
  });
  if (marcas) marcas.forEach((m) => m.valores.forEach((v, i) => {
    v = +v || 0; if (v <= 0) return;
    const x0 = ml + gw * i + pad - 2, x1 = ml + gw * (i + 1) - pad + 2;
    g += `<line x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}" class="gr-marca" data-t="${esc(CALC.MESES[i])} · ${esc(m.nombre)}: ${fmt(v, decimales)} ${esc(unidad)}"/>`;
  }));
  g += `<line x1="${ml}" x2="${W - mr}" y1="${mt + ih}" y2="${mt + ih}" class="gr-base"/>`;
  const leyenda = series.map((s, j) => `<button class="gr-ley" data-oc="${j}" aria-pressed="${!(ui.ocultas || []).includes(j)}"><i class="s${j + 1}"></i>${esc(s.nombre)}</button>`).join('') +
    (marcas ? marcas.map((m) => `<span class="gr-ley"><i class="gr-ley-marca"></i>${esc(m.nombre)}</span>`).join('') : '');
  return `<div class="grafica"><div class="row gr-leyenda">${leyenda}<span class="spacer"></span><span class="small muted">${esc(unidad)} por mes</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reparto mensual en ${esc(unidad)}">${g}</svg><div class="gr-tip" hidden></div></div>`;
}
function enlazarGrafica(el, repintar) {
  $$('.grafica', el).forEach((gr) => {
    const tip = $('.gr-tip', gr);
    gr.addEventListener('mousemove', (e) => {
      const t = e.target.closest('[data-t]');
      if (!t) { tip.hidden = true; return; }
      const r = gr.getBoundingClientRect();
      tip.textContent = t.dataset.t; tip.hidden = false;
      tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 200) + 'px'; tip.style.top = (e.clientY - r.top - 34) + 'px';
    });
    gr.addEventListener('mouseleave', () => { tip.hidden = true; });
    $$('[data-oc]', gr).forEach((b) => { b.onclick = () => { const j = +b.dataset.oc; ui.ocultas = ui.ocultas || []; ui.ocultas = ui.ocultas.includes(j) ? ui.ocultas.filter((x) => x !== j) : [...ui.ocultas, j]; repintar(); }; });
  });
}

/* ----- Pestaña Necesidades y reparto ----- */
function tabNecesidades(el, p, camp) {
  if (!camp) { el.innerHTML = '<p class="muted">Crea antes la campaña.</p>'; return; }
  const rep = db.repartos.find((r) => r.id === p.reparto) || null;
  const nc = CALC.necesidades(p, camp, analDePlan(p), cfg(), rep);
  const edad = CALC.edad(p, ui.camp);
  const tiposGrupo = [...db.repartos].sort((a, b) => (a.grupo === p.grupo ? 0 : 1) - (b.grupo === p.grupo ? 0 : 1) || a.nombre.localeCompare(b.nombre, 'es'));
  const filas = NUT_TXT.map((nu, j) => `<tr><td><b>${nu}</b></td>
      <td class="w"><input class="cell" data-nec="${j}" value="${fmtIn(camp.necesidades && camp.necesidades[j])}"></td>
      <td class="n">${fmt(nc.estiercol[j], 1)}</td><td class="n">${fmt(nc.agua[j], 1)}</td>
      <td class="w"><input class="cell" data-fac="${j}" value="${fmtIn(nc.factor[j])}"></td>
      <td class="n">${fmt(nc.neto[j], 1)}</td>
      <td class="n"><b>${fmt(nc.objetivo[j], 1)}</b>${j === 0 && nc.limitadoN ? ' <span class="chip amb" title="Limitado por el balance de N">límite balance</span>' : ''}</td></tr>`).join('');
  const sumaMal = rep ? NUT_TXT.filter((_, j) => nc.suma[j] > 0 && Math.abs(nc.suma[j] - 100) >= 0.05).map((nu, j0) => `${nu} ${fmt(nc.suma[NUT_TXT.indexOf(nu)], 1)} %`) : [];
  let mes = '';
  if (nc.mensual) {
    const tot = NUT_TXT.map((_, j) => nc.mensual.reduce((t, m) => t + m[j], 0));
    const plan = nc.plan12.length ? nc.plan12 : null;
    mes = grafica(NUT_TXT.map((nu, j) => ({ nombre: nu, valores: nc.mensual.map((m) => m[j]) })), { marcas: plan ? [{ nombre: 'N en el plan del mes', valores: plan.map((m) => m[0]) }] : null }) +
      `<div class="scroll-x" style="margin-top:10px"><table class="t"><tr><th>kg UF/ha</th>${CALC.MESES.map((m) => `<th class="n">${m.slice(0, 3)}</th>`).join('')}<th class="n">Total</th></tr>
      ${NUT_TXT.map((nu, j) => `<tr><td><b>${nu}</b></td>${nc.mensual.map((m) => `<td class="n">${m[j] ? fmt(m[j], 1) : '<span class="muted">–</span>'}</td>`).join('')}<td class="n"><b>${fmt(tot[j], 1)}</b></td></tr>`).join('')}
      ${plan ? `<tr class="muted"><td>N en el plan</td>${plan.map((m) => `<td class="n">${m[0] ? fmt(m[0], 1) : '–'}</td>`).join('')}<td class="n">${fmt(plan.reduce((t, m) => t + m[0], 0), 1)}</td></tr>` : ''}</table></div>`;
  }
  el.innerHTML = `<div class="row" style="margin-bottom:10px">${edad != null ? `<span class="chip">Edad: ${edad} años en ${esc(ui.camp)}</span>` : '<span class="chip amb">Sin año de plantación (pestaña Finca)</span>'}<span class="chip">${esc(p.tipoCultivo || p.cultivo)}</span></div>
    <h3>Necesidades anuales (UF/ha)</h3>
    <div class="scroll-x"><table class="t"><tr><th></th><th class="n">Necesidad teórica</th><th class="n">− Estiércol</th><th class="n">− Agua de riego</th><th class="n">× Factor</th><th class="n">A aportar</th><th class="n">Objetivo</th></tr>${filas}</table></div>
    <p class="small muted">Necesidad teórica: la del Excel por ahora (las tablas por cultivo y edad según bibliografía llegarán más adelante). Agua: con ${fmt(nc.b.dosisRiego, 0)} m³/ha de riego. El N objetivo no pasa del balance (${fmt(nc.nBalance, 1)} kg N/ha).</p>
    <h3 style="margin-top:18px">Reparto mensual</h3>
    <div class="row"><select class="cell izq" id="nRep" style="max-width:360px"><option value="">— Elegir tipo de reparto —</option>${tiposGrupo.map((r) => `<option value="${r.id}" ${r.id === p.reparto ? 'selected' : ''}>${esc(r.nombre)} (${esc(r.grupo.toLowerCase())})</option>`).join('')}</select>
      <button class="btn peq" id="nEdit" ${rep ? '' : 'disabled'}>Editar este tipo</button><button class="btn peq" id="nTipos">Ver todos los tipos</button></div>
    ${sumaMal.length ? `<div class="aviso" style="margin-top:8px">El tipo «${esc(rep.nombre)}» no suma 100 %: ${sumaMal.join(', ')}. Corrígelo en Repartos.</div>` : ''}
    <div style="margin-top:12px">${mes || '<p class="muted">Elige un tipo de reparto para ver las UF de cada mes.</p>'}</div>`;
  $$('[data-nec]', el).forEach((i) => i.addEventListener('change', () => { commit(() => { camp.necesidades = camp.necesidades || [null, null, null, null, null]; camp.necesidades[+i.dataset.nec] = CALC.num(i.value); }, { render: false }); renderDetalleSoloCuerpo(); }));
  $$('[data-fac]', el).forEach((i) => i.addEventListener('change', () => { commit(() => { camp.factores = camp.factores || [1, 1, 1, 1, 1]; camp.factores[+i.dataset.fac] = CALC.num(i.value) ?? 1; }, { render: false }); renderDetalleSoloCuerpo(); }));
  $('#nRep', el).onchange = (e) => { commit(() => { p.reparto = e.target.value || null; }, { render: false }); renderDetalleSoloCuerpo(); };
  $('#nEdit', el).onclick = () => { ui.vista = 'repartos'; ui.repId = p.reparto; renderAll(); };
  $('#nTipos', el).onclick = () => { ui.vista = 'repartos'; renderAll(); };
  enlazarGrafica(el, () => renderDetalleSoloCuerpo());
}

/* ---------- REPARTOS (tipos de reparto mensual) ---------- */
function renderRepartos(v) {
  const lista = [...db.repartos].sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre, 'es'));
  if (!ui.repId || !db.repartos.some((r) => r.id === ui.repId)) ui.repId = lista[0] ? lista[0].id : null;
  const r = db.repartos.find((x) => x.id === ui.repId);
  const usosR = (x) => db.planes.filter((p) => p.reparto === x.id);
  let det = '<div class="card vacio"><p>Crea el primer tipo de reparto.</p></div>';
  if (r) {
    const su = CALC.sumaReparto(r);
    const ps = usosR(r);
    det = `<div class="card"><div class="grid3">
        <label class="fld" style="grid-column:span 2"><span>Nombre</span><input id="rNom" value="${esc(r.nombre)}"></label>
        <label class="fld"><span>Grupo</span><select id="rGru">${CALC.GRUPOS.map((g) => `<option ${g === r.grupo ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="fld" style="grid-column:span 3"><span>Notas</span><input id="rNot" value="${esc(r.notas || '')}" placeholder="p. ej. árboles jóvenes, más N en primavera…"></label></div>
      <h3 style="margin-top:14px">% de la necesidad anual en cada mes</h3>
      <div class="scroll-x"><table class="t"><tr><th>Mes</th>${NUT_TXT.map((n) => `<th class="n">${n}</th>`).join('')}</tr>
      ${CALC.MESES.map((m, i) => `<tr><td>${m}</td>${NUT_TXT.map((_, j) => `<td class="w"><input class="cell" data-pct="${i}.${j}" value="${fmtIn(r.pct[i][j] || '')}" placeholder="0"></td>`).join('')}</tr>`).join('')}
      <tr class="tot"><td>Total</td>${su.map((x) => `<td class="n"><span class="${Math.abs(x - 100) < 0.05 ? 'chip v' : 'chip rojo'}">${fmt(x, 1)} %</span></td>`).join('')}</tr></table></div>
      <div style="margin-top:14px">${grafica(NUT_TXT.map((nu, j) => ({ nombre: nu, valores: r.pct.map((m) => m[j]) })), { unidad: '%', decimales: 1, alto: 200 })}</div>
      <p class="small muted" style="margin-top:10px">Lo usan ${plural(ps.length, 'plan', 'planes')}${ps.length ? ': ' + ps.slice(0, 12).map((p) => esc(p.nombre)).join(', ') + (ps.length > 12 ? '…' : '') : ''}. Un cambio aquí cambia el reparto de todos ellos.</p>
      <div class="row" style="margin-top:8px"><button class="btn peq" id="rDup">Duplicar</button><button class="btn peq rojo" id="rDel" ${ps.length ? 'disabled title="Lo usan planes"' : ''}>Borrar</button></div></div>`;
  }
  v.innerHTML = `<div class="planes"><div class="card lista"><div class="busca"><div class="row"><b style="flex:1">Tipos de reparto</b><button class="btn peq" id="rNuevo">+ Nuevo</button></div>
      <div class="small muted">El % de la necesidad anual de cada nutriente que va a cada mes.</div></div>
      <div class="items">${lista.map((x) => { const ok = CALC.sumaReparto(x).every((s) => s === 0 || Math.abs(s - 100) < 0.05); return `<button class="item" data-rep="${x.id}" aria-current="${x.id === ui.repId}"><span class="dot ${ok ? 'ok' : 'medio'}"></span><span class="t"><b>${esc(x.nombre)}</b><span>${esc(x.grupo.toLowerCase())} · ${plural(usosR(x).length, 'plan', 'planes')}</span></span></button>`; }).join('')}</div></div>
    <div>${det}</div></div>`;
  $$('[data-rep]', v).forEach((b) => { b.onclick = () => { ui.repId = b.dataset.rep; renderRepartos(v); }; });
  $('#rNuevo', v).onclick = () => { const n = { id: uid('r'), nombre: 'Nuevo tipo', grupo: 'CITRICOS', pct: CALC.MESES.map(() => [0, 0, 0, 0, 0]), notas: '' }; commit((d) => { d.repartos.push(n); ui.repId = n.id; }); };
  if (!r) return;
  $('#rNom', v).onchange = (e) => commit(() => { r.nombre = e.target.value.trim() || r.nombre; });
  $('#rGru', v).onchange = (e) => commit(() => { r.grupo = e.target.value; });
  $('#rNot', v).onchange = (e) => commit(() => { r.notas = e.target.value.trim(); }, { render: false });
  $$('[data-pct]', v).forEach((i) => i.addEventListener('change', () => {
    const [m, j] = i.dataset.pct.split('.').map(Number);
    const pos = window.scrollY;
    commit(() => { r.pct[m][j] = CALC.num(i.value) ?? 0; });
    window.scrollTo(0, pos);
    const sig = $(`[data-pct="${m + 1}.${j}"]`); if (sig) sig.focus();
  }));
  $('#rDup', v).onclick = () => { const n = { ...structuredClone(r), id: uid('r'), nombre: r.nombre + ' (copia)' }; commit((d) => { d.repartos.push(n); ui.repId = n.id; }); };
  $('#rDel', v).onclick = () => { if (!confirm(`¿Borrar el tipo «${r.nombre}»?`)) return; commit((d) => { d.repartos = d.repartos.filter((x) => x.id !== r.id); ui.repId = null; }); };
  enlazarGrafica(v, () => renderRepartos(v));
}

/* ---------- FERTIRRIGACIÓN del mes ---------- */
const TANQUES = ['1', '2', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6'];
function mesInicial() { const hoy = new Date(); return String(hoy.getFullYear()) === String(ui.camp) ? hoy.getMonth() : 0; }
function campAnteriorCon(p, i) {
  return Object.keys(p.campanas || {}).filter((k) => k < ui.camp).sort().reverse().find((k) => { const f = p.campanas[k].fert; return f && f[i] && f[i].lineas && f[i].lineas.length; }) || null;
}
function tabFert(el, p, camp) {
  if (!camp) { el.innerHTML = '<p class="muted">Crea antes la campaña.</p>'; return; }
  if (ui.mes == null) ui.mes = mesInicial();
  const i = ui.mes;
  const ix = ixProd();
  const fm = (camp.fert && camp.fert[i]) || { lineas: [] };
  const m = FERT.mes(p, camp, i, ix);
  const rep = db.repartos.find((r) => r.id === p.reparto) || null;
  const nc = CALC.necesidades(p, camp, analDePlan(p), cfg(), rep);
  const obj = nc.mensual ? nc.mensual[i] : null;
  const rg = CALC.riego(p, camp, cfg()).filas[i];
  const ant = campAnteriorCon(p, i);
  const conLineas = (k) => camp.fert && camp.fert[k] && camp.fert[k].lineas && camp.fert[k].lineas.length;
  const chips = CALC.MESES.map((mm, k) => `<button class="mes-chip ${k === i ? 'on' : ''}" data-mes="${k}">${mm.slice(0, 3)}${conLineas(k) ? '<i></i>' : ''}</button>`).join('');
  const celObj = (j) => { const o = obj ? obj[j] : null, a = m.uf[j]; const pc = o ? a / o * 100 : null; const ok = o == null || (!o && !a) ? '' : (o && Math.abs(a - o) / o <= 0.1) || (!o && a < 0.5) ? 'v' : 'amb'; return { o, a, pc, ok }; };
  const comp = `<table class="t obj"><tr><th>kg UF/ha</th>${NUT_TXT.map((nu) => `<th class="n">${nu}</th>`).join('')}</tr>
    <tr><td class="muted">Objetivo</td>${NUT_TXT.map((_, j) => { const c = celObj(j); return `<td class="n">${c.o == null ? '–' : fmt(c.o, 1)}</td>`; }).join('')}</tr>
    <tr><td><b>Plan</b></td>${NUT_TXT.map((_, j) => { const c = celObj(j); return `<td class="n"><b>${fmt(c.a, 1)}</b>${c.pc == null ? '' : ` <span class="chip ${c.ok}">${fmt(c.pc, 0)} %</span>`}</td>`; }).join('')}</tr></table>`;
  // Totales por producto: del mes y de la campaña
  const sup = +p.superficie || 0;
  const totCamp = new Map();
  for (let k = 0; k < 12; k++) for (const l of FERT.mes(p, camp, k, ix).lineas) {
    const nom = l.prod ? l.prod.nombre : l.nombre; if (!nom) continue;
    const t = totCamp.get(nom) || { nom, liq: l.liquido, meses: new Set(), total: 0, hasta: 0 };
    t.meses.add(k); t.total += l.w * sup; if (k <= i) t.hasta += l.w * sup; totCamp.set(nom, t);
  }
  const listaCamp = [...totCamp.values()].sort((a, b) => b.total - a.total);
  const filas = m.lineas.map((l, k) => `<tr>
      <td><input class="cell izq combo-in" data-cb="prod" data-k2="${k}" value="${esc(l.prod ? l.prod.nombre : l.nombre || '')}" placeholder="Escribe para buscar…" autocomplete="off" ${l.prod || !l.nombre ? '' : 'title="No está en Productos"'}>${!l.prod && l.nombre ? '<div class="small" style="color:var(--warn)">No está en Productos</div>' : ''}</td>
      <td class="w"><input class="cell" data-fl="${k}" data-c="dosis" value="${fmtIn(l.dosis)}"></td>
      <td><select class="cell izq" data-fl="${k}" data-c="formato"><option value="pie" ${l.formato !== 'ha' ? 'selected' : ''}>${l.liquido ? 'cc' : 'g'}/pie</option><option value="ha" ${l.formato === 'ha' ? 'selected' : ''}>${l.liquido ? 'L' : 'kg'}/ha</option></select></td>
      <td class="w" style="width:60px"><input class="cell" data-fl="${k}" data-c="riegos" value="${fmtIn(l.riegos)}"></td>
      <td><input class="cell izq combo-in" data-cb="per" data-k2="${k}" value="${esc(l.periodo || '')}" placeholder="Periodo" autocomplete="off"></td>
      <td><select class="cell izq" data-fl="${k}" data-c="tanque"><option value="">Auto (${esc(l.tanqueAuto ? l.tanqueFinal : (l.prod ? (l.prod.tanque === 'E' ? 'E' : l.prod.tanque) : '1'))})</option>${TANQUES.map((t) => `<option ${!l.tanqueAuto && l.tanqueFinal === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td class="n">${fmt(l.porRiegoFinca, 2)} ${l.liquido ? 'L' : 'kg'}</td>
      <td class="n">${fmt(l.porPie, 1)} ${l.liquido ? 'cc' : 'g'}</td>
      <td class="n tot-mes"><b>${fmt(l.w * sup, 1)} ${l.liquido ? 'L' : 'kg'}</b></td>
      <td class="n">${fmt(l.uf.n, 1)}</td><td class="n">${fmt(l.uf.p2o5, 1)}</td><td class="n">${fmt(l.uf.k2o, 1)}</td>
      <td><button class="btn peq rojo" data-fdel="${k}" title="Quitar">×</button></td></tr>`).join('');
  // Resumen por tanque
  const porT = {};
  for (const l of m.lineas) (porT[l.tanqueFinal] = porT[l.tanqueFinal] || []).push(l);
  const resumenT = Object.keys(porT).sort((a, b) => (a[0] === 'E') - (b[0] === 'E') || a.localeCompare(b, 'es', { numeric: true })).map((t) => `<div class="tanque"><b>${t === '1' || t === '2' ? 'Tanque ' + t : t}</b>${porT[t].map((l) => `<span>${esc(l.prod ? l.prod.nombre : l.nombre)} · ${fmt(l.porRiegoFinca, 2)} ${l.liquido ? 'L' : 'kg'}/riego${l.periodo ? ' · ' + esc(l.periodo) : ''}</span>`).join('')}</div>`).join('');
  const sol = FERT.solucion(p, camp, i, m, anal(p.analAgua), cfg());
  const cal = FERT.calendario(p, camp, ui.camp, i);
  const inf = camp.informes && camp.informes[i];
  const rango = (x, r) => (x == null ? '–' : `<span class="${x < r[0] || x > r[1] ? 'chip amb' : 'chip v'}">${fmt(x, 0)} %</span> <span class="muted small">${r[0]}-${r[1]}</span>`);
  el.innerHTML = `<div class="meses">${chips}</div>
    <div class="obj-fijo"><h3>${CALC.MESES[i]} · objetivo y plan</h3>${comp}
      ${!obj ? '<p class="small muted" style="margin:4px 0 0">Sin objetivo: elige el tipo de reparto y las necesidades en «Necesidades y reparto».</p>' : ''}</div>
    <h3 style="margin-top:12px">Productos</h3>
    <div class="scroll-x"><table class="t fert"><tr><th>Producto</th><th class="n">Dosis/riego</th><th>Unidad</th><th class="n">Riegos</th><th>Periodo</th><th>Tanque</th><th class="n">Por riego finca</th><th class="n">Por pie</th><th class="n">Total mes</th><th class="n">N</th><th class="n">P2O5</th><th class="n">K2O</th><th></th></tr>
      ${filas || '<tr><td colspan="13" class="muted">Sin productos este mes.</td></tr>'}</table></div>
    ${m.sinProducto ? `<div class="aviso" style="margin-top:8px">${plural(m.sinProducto, 'producto no está', 'productos no están')} en la base de datos de Productos: no suman UF. ${db.productos.length ? 'Elígelos en la lista o dalos de alta en Productos.' : 'Importa antes tus productos (sección Productos).'}</div>` : ''}
    <div class="row" style="margin-top:10px">
      <button class="btn peq" id="fAdd">+ Añadir producto</button>
      ${ant ? `<button class="btn peq" id="fAnt">Copiar ${CALC.MESES[i].toLowerCase()} de ${esc(ant)}</button>` : ''}
      ${i > 0 && conLineas(i - 1) ? `<button class="btn peq" id="fPrev">Copiar de ${CALC.MESES[i - 1].toLowerCase()}</button>` : ''}
      <button class="btn peq" id="fOtro" title="Copiar productos y dosis de ${CALC.MESES[i].toLowerCase()} de otro plan">Copiar de otro plan</button>
      <button class="btn peq" id="fProg" title="Cargar un programa tipo (productos, riegos, horas y calendario) o guardar este plan como programa">Programa tipo</button>
      <button class="btn peq p" id="fAjus" ${obj && m.lineas.length ? '' : 'disabled'}>Ajustar al objetivo</button>
      <button class="btn peq" id="fTq" ${m.lineas.some((l) => !l.tanqueAuto) ? '' : 'disabled'}>Tanques automáticos</button>
      <span class="spacer"></span><button class="btn peq rojo" id="fVac" ${m.lineas.length ? '' : 'disabled'}>Vaciar mes</button></div>
    <div class="grid2" style="margin-top:16px">
      <div><h3>Riego de ${CALC.MESES[i].toLowerCase()}</h3>
        <div class="row small"><span class="chip">${rg.n || 0} riegos de ${hhmm(rg.h) || '0:00'} h</span><span class="chip">${fmt(rg.vApl, 0)} m³/ha</span><span class="chip">${fmt(rg.vFinca, 0)} m³ en la finca</span></div>
        ${htmlCalendario(p, cal, rg)}</div>
      <div><h3>Por depósito</h3><div class="tanques">${resumenT || '<p class="muted small">Sin productos este mes.</p>'}</div>
        <details style="margin-top:14px" ${ui.verCamp !== false ? 'open' : ''} id="fCampD"><summary style="cursor:pointer"><b class="small">Productos de la campaña ${esc(ui.camp)}</b> <span class="small muted">(total en la finca)</span></summary>
          ${listaCamp.length ? `<table class="t small" style="margin-top:6px"><tr><th>Producto</th><th class="n">Meses</th><th class="n">Hasta ${CALC.MESES[i].slice(0, 3).toLowerCase()}</th><th class="n">Campaña</th></tr>${listaCamp.map((t) => `<tr><td>${esc(t.nom)}</td><td class="n">${t.meses.size}</td><td class="n">${fmt(t.hasta, 1)} ${t.liq ? 'L' : 'kg'}</td><td class="n"><b>${fmt(t.total, 1)} ${t.liq ? 'L' : 'kg'}</b></td></tr>`).join('')}</table>` : '<p class="muted small">Sin productos en la campaña.</p>'}</details></div></div>
    <label class="fld" style="margin-top:14px"><span>Observaciones de ${CALC.MESES[i].toLowerCase()} (salen en el informe, antes del ácido de limpieza y los recintos)</span><textarea id="fObs" rows="2" placeholder="p. ej. Revisar filtros antes del primer riego">${esc(fm.obs || '')}</textarea></label>
    <div class="row" style="margin-top:12px"><button class="btn" id="fInf">Informe PDF de ${CALC.MESES[i].toLowerCase()}</button>
      <label class="chk small"><input type="checkbox" id="fRev" ${inf && inf.revisado ? 'checked' : ''}> Revisado</label>
      <span class="small muted">${inf && inf.fecha ? `Último PDF: ${fechaEs(inf.fecha)}${inf.pendiente ? ' · pendiente de pasar a OneDrive' : ''}` : 'Aún sin PDF de este mes'}</span></div>
    <details style="margin-top:16px" ${ui.verSol ? 'open' : ''} id="fSolD"><summary class="small" style="cursor:pointer"><b>Solución nutritiva de ${CALC.MESES[i].toLowerCase()}</b> <span class="muted">(solo para ti, para ajustar la nutrición)</span></summary>
      ${sol ? `<div class="grid2" style="margin-top:10px">
        <div><table class="t"><tr><th>Ion</th><th class="n">meq/L</th></tr>${[['NO3-', 'no3'], ['NH4+', 'nh4'], ['H2PO4-', 'h2po4'], ['K+', 'k'], ['Ca2+', 'ca'], ['Mg2+', 'mg'], ['SO4 2-', 'so4'], ['Na+', 'na'], ['Cl-', 'cl'], ['HCO3-', 'hco3']].map(([t, k]) => `<tr><td>${t}</td><td class="n">${fmt(sol.meq[k], 2)}</td></tr>`).join('')}
          <tr class="tot"><td>CE estimada</td><td class="n">${fmt(sol.ce, 2)} dS/m</td></tr></table></div>
        <div><table class="t"><tr><th>Cationes</th><th>% (ideal)</th></tr>${sol.cationes.map(([t, x, r]) => `<tr><td>${t}</td><td>${rango(x, r)}</td></tr>`).join('')}</table>
          <table class="t" style="margin-top:8px"><tr><th>Aniones</th><th>% (ideal)</th></tr>${sol.aniones.map(([t, x, r]) => `<tr><td>${t}</td><td>${rango(x, r)}</td></tr>`).join('')}</table>
          <div class="row small" style="margin-top:8px"><span class="chip">NH4 ${fmt(sol.nh4pct, 0)} % del N</span><span class="chip">Fe ${fmt(sol.micro.fe, 2)} mg/L</span><span class="chip">Zn ${fmt(sol.micro.zn, 2)}</span><span class="chip">Mn ${fmt(sol.micro.mn, 2)}</span><span class="chip">B ${fmt(sol.micro.b, 2)}</span></div>
          <p class="small" style="margin-top:8px">Para bajar los bicarbonatos a 0,5 meq/L: <b>${fmt(sol.acidoNitrico, 1)} L/ha</b> de ácido nítrico o <b>${fmt(sol.acidoFosforico, 1)} L/ha</b> de fosfórico en el mes (${fmt(sol.acidoNitrico * (p.superficie || 0), 1)} o ${fmt(sol.acidoFosforico * (p.superficie || 0), 1)} L en la finca).</p></div></div>`
      : '<p class="muted small">Sin riego programado este mes: no se puede calcular la concentración.</p>'}</details>`;
  const guardarLineas = (fn) => { commit(() => { camp.fert = camp.fert || {}; camp.fert[i] = camp.fert[i] || { lineas: [] }; fn(camp.fert[i].lineas); }, { render: false }); renderDetalleSoloCuerpo(); };
  $$('[data-mes]', el).forEach((b) => { b.onclick = () => { ui.mes = +b.dataset.mes; renderDetalleSoloCuerpo(); }; });
  $$('[data-fl]', el).forEach((inp) => inp.addEventListener('change', () => {
    const k = +inp.dataset.fl, c = inp.dataset.c;
    guardarLineas((ls) => {
      const l = ls[k];
      if (c === 'prodId') { const pr = ix.id.get(inp.value); if (pr) { l.prodId = pr.id; l.nombre = pr.nombre; } }
      else if (c === 'dosis' || c === 'riegos') l[c] = CALC.num(inp.value) ?? 0;
      else if (c === 'tanque') l.tanque = inp.value || null;
      else l[c] = inp.value;
    });
  }));
  $$('[data-fdel]', el).forEach((b) => { b.onclick = () => guardarLineas((ls) => ls.splice(+b.dataset.fdel, 1)); });
  $('#fSolD', el).ontoggle = (e) => { ui.verSol = e.target.open; };
  $('#fCampD', el).ontoggle = (e) => { ui.verCamp = e.target.open; };
  enlazarCalendario(el, p, camp, i, cal);
  $('#fObs', el).onchange = (e) => { commit(() => { camp.fert = camp.fert || {}; camp.fert[i] = camp.fert[i] || { lineas: [] }; camp.fert[i].obs = e.target.value.trim(); }, { render: false }); };
  $('#fRev', el).onchange = (e) => { commit(() => { marcarRevisado(camp, i, e.target.checked); }, { render: false }); renderEstado(); };
  $('#fInf', el).onclick = async (e) => { e.target.disabled = true; await generarInforme(p, ui.camp, i); renderDetalleSoloCuerpo(); };
  $('#fAdd', el).onclick = () => { const n = fm.lineas.length; guardarLineas((ls) => ls.push({ prodId: null, nombre: '', dosis: 0, formato: 'pie', riegos: rg.n || 0, periodo: 'Resto mes', tanque: null })); enfocar(`[data-cb="prod"][data-k2="${n}"]`); };
  // Producto y periodo: desplegables que se filtran al escribir
  const opsProd = db.productos.filter((x) => x.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((pr) => ({ v: pr.id, t: pr.nombre, sub: (pr.tanque === 'E' ? 'E' : 'T' + pr.tanque) + ['n', 'p2o5', 'k2o'].filter((r) => pr.riq && +pr.riq[r]).map((r) => ` · ${{ n: 'N', p2o5: 'P', k2o: 'K' }[r]} ${fmt(pr.riq[r], pr.riq[r] % 1 ? 1 : 0)}`).join('') }));
  const usados = [...new Set(Object.values(camp.fert || {}).flatMap((x) => ((x && x.lineas) || []).map((l) => l.periodo)).filter(Boolean))];
  const opsPer = [...new Set([...FERT.PERIODOS, ...usados])].map((x) => ({ v: x, t: x }));
  $$('[data-cb="prod"]', el).forEach((inp) => combo(inp, { opciones: opsProd, vacio: db.productos.length ? 'Ningún producto con ese nombre' : 'Importa antes tus productos (sección Productos)', alElegir: (v) => {
    const k = +inp.dataset.k2; guardarLineas((ls) => { const pr = ix.id.get(v); if (pr) { ls[k].prodId = pr.id; ls[k].nombre = pr.nombre; } }); enfocar(`[data-fl="${k}"][data-c="dosis"]`);
  } }));
  $$('[data-cb="per"]', el).forEach((inp) => combo(inp, { opciones: opsPer, libre: true, alElegir: (v, t) => { const k = +inp.dataset.k2; guardarLineas((ls) => { ls[k].periodo = (t || '').trim(); }); } }));
  if ($('#fAnt', el)) $('#fAnt', el).onclick = () => { if (fm.lineas.length && !confirm('¿Sustituir los productos de este mes?')) return; guardarLineas((ls) => { ls.splice(0, ls.length, ...structuredClone(p.campanas[ant].fert[i].lineas)); }); toast(`Copiado ${CALC.MESES[i].toLowerCase()} de ${ant}`); };
  if ($('#fPrev', el)) $('#fPrev', el).onclick = () => { if (fm.lineas.length && !confirm('¿Sustituir los productos de este mes?')) return; guardarLineas((ls) => { ls.splice(0, ls.length, ...structuredClone(camp.fert[i - 1].lineas).map((l) => ({ ...l, riegos: /resto/i.test(l.periodo || '') ? (rg.n || l.riegos) : l.riegos }))); }); };
  $('#fTq', el).onclick = () => guardarLineas((ls) => ls.forEach((l) => { l.tanque = null; }));
  $('#fOtro', el).onclick = () => copiarDeOtroPlan(p, i, rg.n || 0, fm.lineas.length, guardarLineas);
  $('#fProg', el).onclick = () => cargarPrograma(p, i);
  $('#fVac', el).onclick = () => { if (confirm(`¿Quitar todos los productos de ${CALC.MESES[i].toLowerCase()}?`)) guardarLineas((ls) => ls.splice(0, ls.length)); };
  $('#fAjus', el).onclick = () => {
    const r = FERT.ajustar(p, camp, i, ix, obj);
    if (!r.nVars) { toast('No hay abonos de los tanques 1 y 2 con dosis para ajustar', true); return; }
    const cambios = Object.entries(r.dosis).map(([k, d]) => { const l = m.lineas[+k]; return `<tr><td>${esc(l.prod ? l.prod.nombre : l.nombre)}</td><td class="n">${fmt(l.dosis, 1)}</td><td class="n"><b>${fmt(d, 1)}</b></td><td>${l.formato === 'ha' ? (l.liquido ? 'L' : 'kg') + '/ha' : (l.liquido ? 'cc' : 'g') + '/pie'}</td></tr>`; }).join('');
    const md = modal('Ajustar al objetivo', `<p class="small">Cambia las dosis de los abonos de los tanques 1 y 2 para acercar N, P2O5 y K2O al objetivo de ${CALC.MESES[i].toLowerCase()}, cambiando lo menos posible la mezcla. Los especiales (E) no se tocan.</p>
      <table class="t"><tr><th>Producto</th><th class="n">Ahora</th><th class="n">Propuesta</th><th></th></tr>${cambios}</table>
      <table class="t" style="margin-top:10px"><tr><th></th><th class="n">Objetivo</th><th class="n">Queda</th></tr>${['N', 'P2O5', 'K2O'].map((nu, j) => `<tr><td>${nu}</td><td class="n">${fmt(obj[j], 1)}</td><td class="n">${fmt(r.resultado[j], 1)}</td></tr>`).join('')}</table>
      ${r.lejos.length ? `<div class="aviso" style="margin-top:10px">${r.lejos.map((x) => `${x.nutriente} se queda en ${fmt(x.queda, 1)} de ${fmt(x.objetivo, 1)}`).join('; ')}. Con estos productos no se llega: añade o cambia algún abono.</div>` : ''}`,
    { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn p" id="ajOk">Aplicar</button>' });
    $$('[data-cerrar]', md).forEach((b) => { b.onclick = cerrarModal; });
    $('#ajOk', md).onclick = () => { cerrarModal(); guardarLineas((ls) => { for (const [k, d] of Object.entries(r.dosis)) ls[+k].dosis = d; }); toast('Dosis ajustadas'); };
  };
}

/* ----- Copiar los productos del mismo mes de otro plan (de cualquier cliente) ----- */
function copiarDeOtroPlan(p, i, nRiegos, nActual, guardarLineas) {
  const ix = ixProd(), mesTxt = CALC.MESES[i].toLowerCase();
  const cands = db.planes.filter((x) => x.id !== p.id).map((x) => { const c = x.campanas && x.campanas[ui.camp]; const ls = c && c.fert && c.fert[i] && c.fert[i].lineas; return ls && ls.length ? { x, c } : null; }).filter(Boolean)
    .sort((a, b) => (a.x.cliente || '').localeCompare(b.x.cliente || '', 'es') || a.x.nombre.localeCompare(b.x.nombre, 'es'));
  let elegido = null;
  const md = modal(`Copiar ${mesTxt} de otro plan`, `<p class="small" style="margin-top:0">Elige el plan del que copiar los productos y dosis de <b>${esc(mesTxt)} ${esc(ui.camp)}</b>. Solo salen los planes que ya tienen productos ese mes.</p>
    <input class="cell izq" id="coQ" type="search" placeholder="Buscar cliente o plan…" autocomplete="off">
    <div class="lista-imp" id="coL" style="margin-top:8px;max-height:34vh"></div>
    <div id="coP" style="margin-top:12px"></div>`,
  { pie: `<label class="chk small"><input type="radio" name="coM" value="sust" checked> Sustituir los ${plural(nActual, 'producto', 'productos')} de este mes</label><label class="chk small"><input type="radio" name="coM" value="add"> Añadirlos a los que hay</label><span class="spacer"></span><button class="btn" data-cerrar>Cancelar</button><button class="btn p" id="coOk" disabled>Copiar</button>`, ancho: true });
  $$('[data-cerrar]', md).forEach((b) => { b.onclick = cerrarModal; });
  if (!nActual) md.querySelectorAll('[name="coM"]').forEach((r) => { r.closest('label').hidden = true; });
  const pintarLista = () => {
    const q = CALC.norm($('#coQ', md).value).split(/\s+/).filter(Boolean);
    const vis = cands.filter(({ x }) => { const h = CALC.norm([x.cliente, x.nombre, x.finca, x.cultivo].join(' ')); return q.every((w) => h.includes(w)); });
    let cli = null, html = '';
    for (const { x, c } of vis) {
      if (x.cliente !== cli) { cli = x.cliente; html += `<div class="grupo-cli">${esc(cli || 'Sin cliente')}</div>`; }
      html += `<label><input type="radio" name="coPl" value="${x.id}" ${elegido && elegido.x.id === x.id ? 'checked' : ''}> ${esc(x.nombre)} <span class="muted small">${esc(x.finca)} · ${plural(c.fert[i].lineas.length, 'producto', 'productos')}</span></label>`;
    }
    $('#coL', md).innerHTML = html || `<p class="muted small" style="padding:8px">${cands.length ? 'Ningún plan con esa búsqueda.' : `Ningún otro plan tiene productos en ${esc(mesTxt)}.`}</p>`;
    $$('[name="coPl"]', md).forEach((r) => { r.onchange = () => { elegido = cands.find((y) => y.x.id === r.value); pintarPrev(); }; });
  };
  const pintarPrev = () => {
    if (!elegido) { $('#coP', md).innerHTML = ''; $('#coOk', md).disabled = true; return; }
    const m = FERT.mes(elegido.x, elegido.c, i, ix);
    $('#coP', md).innerHTML = `<h3 style="margin:0 0 6px">${esc(elegido.x.nombre)} · ${esc(mesTxt)}</h3><table class="t small"><tr><th></th><th>Producto</th><th class="n">Dosis/riego</th><th class="n">Riegos</th><th>Periodo</th><th>Tanque</th></tr>
      ${m.lineas.map((l, k) => `<tr><td><input type="checkbox" data-coL="${k}" checked></td><td><b>${esc(l.prod ? l.prod.nombre : l.nombre)}</b></td><td class="n">${fmt(l.dosis, 1)} ${l.formato === 'ha' ? (l.liquido ? 'L' : 'kg') + '/ha' : (l.liquido ? 'cc' : 'g') + '/pie'}</td><td class="n">${/resto/i.test(l.periodo || '') && nRiegos ? `${nRiegos} <span class="muted">(${fmtIn(l.riegos)})</span>` : fmtIn(l.riegos)}</td><td>${esc(l.periodo || '')}</td><td>${esc(l.tanqueFinal || '')}</td></tr>`).join('')}</table>
      <p class="small muted">Se copian producto, dosis, unidad, riegos, periodo y tanque. Los de «Resto mes» toman los ${plural(nRiegos, 'riego', 'riegos')} de este plan.</p>`;
    $('#coOk', md).disabled = false;
  };
  $('#coQ', md).oninput = pintarLista;
  pintarLista(); setTimeout(() => $('#coQ', md).focus(), 50);
  $('#coOk', md).onclick = () => {
    if (!elegido) return;
    const orig = elegido.c.fert[i].lineas;
    const sel = $$('[data-coL]', md).filter((c) => c.checked).map((c) => +c.dataset.col);
    if (!sel.length) { toast('Marca algún producto', true); return; }
    const nuevas = sel.map((k) => { const l = structuredClone(orig[k]); if (/resto/i.test(l.periodo || '') && nRiegos) l.riegos = nRiegos; return l; });
    const modo = ($('[name="coM"]:checked', md) || {}).value || 'sust';
    cerrarModal();
    guardarLineas((ls) => { if (modo === 'add') ls.push(...nuevas); else ls.splice(0, ls.length, ...nuevas); });
    toast(`${plural(nuevas.length, 'producto copiado', 'productos copiados')} de ${elegido.x.nombre}`);
  };
}

/* ----- Calendario de riego del mes (en la pestaña Fertirrigación) ----- */
const DIAS_SEM = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
function htmlCalendario(p, cal, rg) {
  const pt = p.patron || { modo: 'auto', dias: [], quincena: 'ambas' };
  const set = new Set(cal.dias);
  let celdas = DIAS_SEM.map((d, k) => `<span class="cal-h ${k >= 5 ? 'fin' : ''}">${d}</span>`).join('');
  for (let k = 0; k < cal.primerDia; k++) celdas += '<span></span>';
  for (let d = 1; d <= cal.total; d++) { const dw = (cal.primerDia + d - 1) % 7; celdas += `<button class="cal-d ${set.has(d) ? 'on' : ''} ${dw >= 5 ? 'fin' : ''}" data-dia="${d}" title="Pulsa para poner o quitar el riego">${d}</button>`; }
  const n = rg.n || 0;
  return `<div class="cal-box">
    <div class="cal">${celdas}</div>
    <div class="cal-ctl">
      <label class="fld"><span>Patrón de esta finca</span><select id="cPat">${[['auto', 'Repartir los riegos del mes'], ['semana', 'Días fijos de la semana'], ['todos', 'Todos los días'], ['ninguno', 'Ninguno']].map(([v, t]) => `<option value="${v}" ${(pt.modo || 'auto') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${pt.modo === 'semana' ? `<div class="dsem">${DIAS_SEM.map((d, k) => `<button data-ds="${k}" aria-pressed="${(pt.dias || []).includes(k)}">${d}</button>`).join('')}</div>` : ''}
      <label class="fld"><span>Quincena</span><select id="cQ">${[['ambas', 'Todo el mes'], ['1', 'Solo la 1ª quincena'], ['2', 'Solo la 2ª quincena']].map(([v, t]) => `<option value="${v}" ${(pt.quincena || 'ambas') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="qrow"><span>1ª quincena</span><button class="btn peq" data-q="1" data-dd="-1">−1</button><button class="btn peq" data-q="1" data-dd="1">+1</button></div>
      <div class="qrow"><span>2ª quincena</span><button class="btn peq" data-q="2" data-dd="-1">−1</button><button class="btn peq" data-q="2" data-dd="1">+1</button></div>
      ${cal.manual ? '<button class="btn peq" id="cRes" title="Quita los cambios a mano de este mes">Volver al patrón</button>' : ''}
    </div></div>
    ${cal.dias.length !== n ? `<div class="aviso" style="margin-top:8px"><span>Marcados ${plural(cal.dias.length, 'día', 'días')} y el mes tiene ${plural(n, 'riego', 'riegos')}.</span><span class="spacer"></span><button class="btn peq" id="cAjN">Poner ${cal.dias.length} riegos</button></div>` : ''}`;
}
function enlazarCalendario(el, p, camp, i, cal) {
  const setCal = (dias) => { commit(() => { camp.cal = camp.cal || {}; camp.cal[i] = dias; }, { render: false }); renderDetalleSoloCuerpo(); };
  const setPat = (fn) => { commit(() => { p.patron = { modo: 'auto', dias: [], quincena: 'ambas', ...(p.patron || {}) }; fn(p.patron); }, { render: false }); renderDetalleSoloCuerpo(); };
  $$('[data-dia]', el).forEach((b) => { b.onclick = () => { const d = +b.dataset.dia; setCal(cal.dias.includes(d) ? cal.dias.filter((x) => x !== d) : [...cal.dias, d].sort((a, c) => a - c)); }; });
  $$('[data-dd]', el).forEach((b) => { b.onclick = () => setCal(+b.dataset.dd > 0 ? FERT.masDia(cal.dias, ui.camp, i, b.dataset.q) : FERT.menosDia(cal.dias, ui.camp, i, b.dataset.q)); });
  $$('[data-ds]', el).forEach((b) => { b.onclick = () => setPat((pt) => { const k = +b.dataset.ds; pt.dias = pt.dias.includes(k) ? pt.dias.filter((x) => x !== k) : [...pt.dias, k].sort(); }); });
  $('#cPat', el).onchange = (e) => setPat((pt) => { pt.modo = e.target.value; });
  $('#cQ', el).onchange = (e) => setPat((pt) => { pt.quincena = e.target.value; });
  if ($('#cRes', el)) $('#cRes', el).onclick = () => { commit(() => { delete camp.cal[i]; }, { render: false }); renderDetalleSoloCuerpo(); };
  if ($('#cAjN', el)) $('#cAjN', el).onclick = () => { commit(() => { camp.riego = camp.riego || CALC.MESES.map(() => ({ h: 0, n: 0 })); camp.riego[i] = { ...(camp.riego[i] || { h: 0, n: 0 }), n: cal.dias.length }; }, { render: false }); renderDetalleSoloCuerpo(); toast('Nº de riegos cambiado: revisa los riegos de cada producto'); };
}

/* ---------- INFORME MENSUAL ---------- */
const CARPETA_INFORMES = 'Planes de abonado';
const claveMes = (camp, i) => `${camp}-${String(i + 1).padStart(2, '0')}`;
function marcarRevisado(camp, i, si) { camp.informes = camp.informes || {}; camp.informes[i] = { ...(camp.informes[i] || {}), revisado: !!si }; }
/* Recomendaciones de analítica para el informe (mismo criterio que los avisos: Ajustes › Avisos y normativa) */
function analiticasInforme(p, camp) {
  const A = analDePlan(p), T = db.config.antiguedad || {}, marcas = [], recs = [];
  const mesAnio = (iso) => { const [y, m] = String(iso || '').slice(0, 7).split('-'); return m ? `${m}/${y}` : ''; };
  const mesLargo = (iso) => { const [y, m] = String(iso || '').slice(0, 7).split('-'); return m ? `${CALC.MESES[+m - 1].toLowerCase()} de ${y}` : ''; };
  const porque = { suelo: 'Con ella ajustamos mejor el nitrógeno que aporta el suelo, la materia orgánica y el equilibrio de nutrientes.', agua: 'Con una analítica al día ajustamos mejor lo que aporta el agua, las sales y el ácido para los goteros.', estiercol: 'Conocer su riqueza real permite descontarlo bien del abonado.' };
  const nom = { suelo: 'suelo', agua: 'agua', estiercol: 'estiércol' };
  const revisar = (tipo, a) => {
    const max = CALC.maxAntiguedad(p, tipo, { antiguedad: T });
    if (a && a.origen === 'cartografia') { recs.push({ titulo: `Recomendación: hacer una analítica de ${nom[tipo]}`, texto: `Los datos de ${nom[tipo]} de esta finca son de la cartografía oficial de suelos, no de una analítica. ${porque[tipo]}` }); return; }
    if (!a || a.plantilla || !a.fecha) { recs.push({ titulo: `Recomendación: hacer una analítica de ${nom[tipo]}`, texto: `No tenemos una analítica de ${nom[tipo]} de esta finca. ${porque[tipo]}` }); return; }
    const e = CALC.edadAnios(a.fecha);
    if (e != null && e > max) recs.push({ titulo: `Recomendación: hacer una analítica de ${nom[tipo]}`, texto: `La última es de ${mesLargo(a.fecha)} y tiene más de ${plural(max, 'año', 'años')}. ${porque[tipo]}` });
    else marcas.push(`Analítica de ${nom[tipo]} ${mesAnio(a.fecha)} al día`);
  };
  revisar('suelo', A.suelo); revisar('agua', A.agua);
  for (const e of (camp && camp.estiercoles) || []) { const a = A.estiercoles[e.analId]; if (+e.dosis > 0) revisar('estiercol', a); }
  return { marcas, recs, A };
}
function datosInforme(p, campKey, i) {
  const camp = p.campanas[campKey];
  const ix = ixProd();
  const m = FERT.mes(p, camp, i, ix);
  const r = CALC.riego(p, camp, cfg()), rg = r.filas[i];
  const A = analDePlan(p);
  const b = CALC.balanceN(p, camp, A, 'estimado', cfg());
  const uf12 = CALC.MESES.map((_, k) => FERT.mes(p, camp, k, ix).uf);
  const sup = +p.superficie || 0;
  const lineas = m.lineas.map((l) => ({ nombre: l.prod ? l.prod.nombre : l.nombre, porPie: `${fmt(l.porPie, 1)} ${l.liquido ? 'cc' : 'g'}`, porRiego: `${fmt(l.porRiegoFinca, l.porRiegoFinca < 10 ? 2 : 1)} ${l.liquido ? 'L' : 'kg'}`, riegos: l.riegos, periodo: l.periodo, tanque: l.tanqueFinal, liquido: l.liquido, total: l.w * sup }));
  const tot = new Map();
  for (const l of lineas) { const k = l.nombre; const t = tot.get(k) || { nombre: k, total: 0, u: l.liquido ? 'L' : 'kg' }; t.total += l.total; tot.set(k, t); }
  const t = db.textos[claveMes(campKey, i)] || {};
  const acum = [0, 1, 2].map((j) => uf12.slice(0, i + 1).reduce((s, x) => s + (+x[j] || 0), 0));
  const total = [0, 1, 2].map((j) => uf12.reduce((s, x) => s + (+x[j] || 0), 0));
  const pie = db.config.pie || {};
  const an = analiticasInforme(p, camp);
  const marcas = ['Riego ajustado al clima de la zona', ...an.marcas];
  if (p.vulnerable && !b.excede && !b.excedeOrg) marcas.push('Zona vulnerable: dentro del límite de nitrógeno');
  const aguaOk = A.agua && !A.agua.plantilla;
  return {
    plan: p, anio: campKey, mes: i, logo: logoCache, cliente: p.titular || p.cliente, cultivo: p.cultivo || p.tipoCultivo,
    riego: { n: rg.n || 0, h: rg.h || 0 }, cal: FERT.calendario(p, camp, campKey, i), arboles: p.arboles, superficie: p.superficie, vulnerable: !!p.vulnerable,
    lineas, totales: [...tot.values()], ufMes: m.uf, aguaMes: rg.vFinca, aguaAnio: r.totFinca,
    obs: (camp.fert && camp.fert[i] && camp.fert[i].obs) || '', acido: FERT.acidoLimpieza(p, A.agua), recintos: p.recintos || '',
    textos: { fito: (t.fito || {})[p.grupo] || '', general: t.general || '' },
    vistazo: {
      uf12, agua12: r.filas.map((f) => f.vApl || 0), nAcum: acum, nTotal: total,
      origenN: { suelo: (b.E1 || 0) + (b.E2 || 0), agua: b.E4 || 0, estiercol: b.E3 || 0, abono: Math.max(0, b.aporte || 0) },
      dentroLimite: !b.excede && !b.excedeOrg
    },
    aguaAporta: aguaOk ? { dosis: b.dosisRiego, uf: CALC.aportesAgua(A.agua, b.dosisRiego) } : null,
    marcas, recomendaciones: an.recs, autor: db.config.autor || '',
    pie: { texto: pie.texto || '', telefono: pie.telefono || '', email: pie.email || '' }
  };
}
const nombreInforme = (p, campKey, i) => `${p.nombre} ${CALC.MESES[i]} ${campKey}.pdf`;
/* Crea el PDF del mes. En el ordenador: carpeta del cliente + copia en «Planes de abonado». En la tablet: queda en Drive hasta que el ordenador lo pase. */
async function generarInforme(p, campKey, i, { abrir = true, silencio = false } = {}) {
  const camp = p.campanas && p.campanas[campKey]; if (!camp) return false;
  try {
    const blob = PDF.informe(datosInforme(p, campKey, i));
    const nombre = nombreInforme(p, campKey, i);
    const carpeta = p.carpeta || ((p.cliente || 'Sin cliente') + '/' + (p.finca || 'Sin finca'));
    const reg = { fecha: new Date().toISOString(), ruta: null, pendiente: false, pdfId: null };
    if (od === 'listo' || (od === 'pedir-permiso' && await ALM.reconectar().catch(() => false))) {
      od = 'listo';
      reg.ruta = await ALM.guardarPDF(carpeta, nombre, blob);
      await ALM.guardarEnRaiz(CARPETA_INFORMES, nombre, blob);
      if (!silencio) toast('Informe guardado en ' + reg.ruta + ' y en ' + CARPETA_INFORMES);
    } else {
      if (offline) { if (abrir) verPdf(blob, nombre); if (!silencio) toast('Sin conexión: el informe no se ha guardado en Drive. Vuelve a sacarlo con conexión.', true); return false; }
      reg.pendiente = true;
      reg.pdfId = await NUBE.subirPdf(nombre, blob, { tipo: 'informe', carpeta, planId: p.id, camp: campKey, mes: i });
      if (!silencio) toast('Informe listo. Se guardará en OneDrive la próxima vez que abras la app en el ordenador');
    }
    if (abrir) verPdf(blob, nombre);
    commit(() => { camp.informes = camp.informes || {}; camp.informes[i] = { ...(camp.informes[i] || {}), ...reg, revisado: true }; }, { render: false });
    return true;
  } catch (e) { if (!silencio) toast('No se pudo crear el informe: ' + (e.message || e), true); else throw e; return false; }
}
function mesInforme() {
  const hoy = new Date();
  if (String(hoy.getFullYear()) !== String(ui.camp)) return 0;
  return hoy.getDate() >= 15 ? Math.min(11, hoy.getMonth() + 1) : hoy.getMonth();
}
/* Estado de cada plan para el informe del mes */
function estadoInforme(p, i) {
  const camp = campDe(p);
  if (!camp) return { sinCamp: true, avisos: ['Sin campaña ' + ui.camp], nivel: 'alto' };
  const ix = ixProd();
  const m = FERT.mes(p, camp, i, ix);
  const rg = CALC.riego(p, camp, cfg()).filas[i];
  const cal = FERT.calendario(p, camp, ui.camp, i);
  const rep = db.repartos.find((r) => r.id === p.reparto) || null;
  const nc = CALC.necesidades(p, camp, analDePlan(p), cfg(), rep);
  const obj = nc.mensual ? nc.mensual[i][0] : null;
  const inf = (camp.informes && camp.informes[i]) || {};
  const av = [];
  if (!m.lineas.length) av.push('Sin productos');
  if (m.sinProducto) av.push(plural(m.sinProducto, 'producto sin dar de alta', 'productos sin dar de alta'));
  if (!(rg.n > 0)) av.push('Sin riegos');
  if (rg.n > 0 && cal.dias.length !== rg.n) av.push(`Calendario: ${cal.dias.length} días para ${rg.n} riegos`);
  if (obj && m.lineas.length && Math.abs(m.uf[0] - obj) / obj > 0.15) av.push(`N ${fmt(m.uf[0] / obj * 100, 0)} % del objetivo`);
  if (!p.mxCli) av.push('Sin enlazar con el maestro');
  return { camp, m, rg, cal, obj, inf, avisos: av, nivel: !m.lineas.length || !(rg.n > 0) ? 'alto' : av.length ? 'medio' : 'ok' };
}
function contarInformes() {
  if (!db) return { pendientes: 0 };
  const i = ui.infMes == null ? mesInforme() : ui.infMes;
  let pendientes = 0;
  for (const p of db.planes) { const c = campDe(p); const inf = c && c.informes && c.informes[i]; if (c && inf && inf.revisado && !inf.fecha) pendientes++; }
  return { pendientes };
}
function prepararMes(i) {
  let deAnt = 0, dePrev = 0, nada = 0;
  commit((d) => {
    for (const p of d.planes) {
      const camp = p.campanas && p.campanas[ui.camp]; if (!camp) continue;
      if (camp.fert && camp.fert[i] && camp.fert[i].lineas && camp.fert[i].lineas.length) continue;
      const ant = campAnteriorCon(p, i);
      const rgN = (camp.riego && camp.riego[i] && camp.riego[i].n) || 0;
      camp.fert = camp.fert || {};
      if (ant) { camp.fert[i] = { ...(camp.fert[i] || {}), lineas: structuredClone(p.campanas[ant].fert[i].lineas) }; deAnt++; }
      else if (i > 0 && camp.fert[i - 1] && camp.fert[i - 1].lineas && camp.fert[i - 1].lineas.length) {
        camp.fert[i] = { ...(camp.fert[i] || {}), lineas: structuredClone(camp.fert[i - 1].lineas).map((l) => ({ ...l, riegos: /resto/i.test(l.periodo || '') ? (rgN || l.riegos) : l.riegos })) }; dePrev++;
      } else nada++;
    }
  });
  return { deAnt, dePrev, nada };
}

/* ---------- INFORMES (lista del mes) ---------- */
function renderInformes(v) {
  if (ui.infMes == null) ui.infMes = mesInforme();
  const i = ui.infMes, mesTxt = CALC.MESES[i].toLowerCase();
  const filas = db.planes.map((p) => ({ p, e: estadoInforme(p, i) }));
  const conCamp = filas.filter((x) => !x.e.sinCamp);
  const nRev = conCamp.filter((x) => x.e.inf.revisado).length, nPdf = conCamp.filter((x) => x.e.inf.fecha).length;
  const nProd = conCamp.filter((x) => x.e.m.lineas.length).length;
  const t = db.textos[claveMes(ui.camp, i)] || {};
  const gruposUsados = [...new Set(conCamp.map((x) => x.p.grupo))];
  const faltanTxt = [!(t.general || '').trim() ? 'situación actual' : null, ...gruposUsados.filter((g) => !((t.fito || {})[g] || '').trim()).map((g) => 'fitosanitaria de ' + g.toLowerCase())].filter(Boolean);
  const q = CALC.norm(ui.infQ);
  const lista = filas.filter(({ p, e }) => {
    if (q && !CALC.norm([p.nombre, p.cliente, p.finca].join(' ')).includes(q)) return false;
    if (ui.infFiltro === 'pend' && e.inf && e.inf.revisado) return false;
    if (ui.infFiltro === 'rev' && !(e.inf && e.inf.revisado && !e.inf.fecha)) return false;
    if (ui.infFiltro === 'avisos' && (e.sinCamp || e.nivel === 'ok')) return false;
    if (ui.infFiltro === 'sinpdf' && (e.sinCamp || (e.inf && e.inf.fecha))) return false;
    return true;
  }).sort((a, b) => (a.p.cliente || '').localeCompare(b.p.cliente || '', 'es') || (a.p.nombre || '').localeCompare(b.p.nombre || '', 'es'));
  const chips = CALC.MESES.map((mm, k) => `<button class="mes-chip ${k === i ? 'on' : ''}" data-im="${k}">${mm.slice(0, 3)}</button>`).join('');
  const estadoPdf = (inf) => (inf.fecha ? `<span class="chip ${inf.pendiente ? 'amb' : 'v'}" title="${esc(inf.ruta || 'Pendiente de pasar a OneDrive')}">${fechaEs(inf.fecha)}${inf.pendiente ? ' · en Drive' : ''}</span>` : '<span class="muted small">–</span>');
  const filtros = [['todos', 'Todos'], ['pend', 'Sin revisar'], ['rev', 'Revisados sin PDF'], ['sinpdf', 'Sin PDF'], ['avisos', 'Con avisos']];
  v.innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">Informes de ${esc(mesTxt)} ${esc(ui.camp)}</h2><span class="spacer"></span>
      <button class="btn" id="iPrep" title="Copia el mismo mes de la campaña anterior (o el mes anterior) en los planes que aún no tienen productos este mes">Preparar ${esc(mesTxt)}</button>
      <button class="btn" id="iTxt">Textos del mes</button>
      <button class="btn p" id="iGen" ${filas.some((x) => !x.e.sinCamp && x.e.inf.revisado) ? '' : 'disabled'}>Generar PDF de los revisados</button></div>
    <div class="meses" style="margin-top:12px">${chips}</div>
    <div class="kpis" style="margin-top:12px">
      <div class="kpi"><span>Con productos</span><strong>${nProd} <small>de ${conCamp.length}</small></strong></div>
      <div class="kpi"><span>Revisados</span><strong>${nRev} <small>de ${conCamp.length}</small></strong></div>
      <div class="kpi"><span>PDF hechos</span><strong>${nPdf}</strong></div>
      <div class="kpi ${faltanTxt.length ? 'amb' : ''}"><span>Textos del mes</span><strong>${faltanTxt.length ? 'Faltan' : 'Listos'}</strong></div></div>
    ${faltanTxt.length ? `<div class="aviso" style="margin-top:10px">Faltan los textos de ${esc(mesTxt)}: ${esc(faltanTxt.join(', '))}. Sin ellos, la página 2 sale sin ese bloque.</div>` : ''}
    <div class="row" style="margin-top:14px"><input id="iq" type="search" placeholder="Buscar plan, cliente, finca…" value="${esc(ui.infQ)}" style="flex:1;max-width:340px" class="cell izq">
      <div class="filtros">${filtros.map(([k, tt]) => `<button data-if="${k}" aria-pressed="${ui.infFiltro === k}">${tt}</button>`).join('')}</div>
      <span class="spacer"></span><button class="btn peq" id="iRevT" title="Marca como revisados los que se ven y no tienen avisos graves">Marcar revisados los de la lista</button></div>
    <div class="scroll-x" style="margin-top:10px"><table class="t inf"><tr><th></th><th>Plan</th><th class="n">Productos</th><th class="n">N mes</th><th>Riego</th><th>Avisos</th><th>Revisado</th><th>PDF</th><th></th></tr>
    ${lista.map(({ p, e }) => e.sinCamp ? `<tr class="muted"><td><span class="dot alto"></span></td><td><b>${esc(p.nombre)}</b><div class="small">${esc(p.cliente)}</div></td><td colspan="7" class="small">Sin campaña ${esc(ui.camp)}</td></tr>`
      : `<tr><td><span class="dot ${e.nivel}"></span></td><td><b>${esc(p.nombre)}</b><div class="small muted">${esc(p.cliente)} · ${esc(p.finca)}</div></td>
        <td class="n">${e.m.lineas.length || '<span class="muted">0</span>'}</td>
        <td class="n">${fmt(e.m.uf[0], 1)}${e.obj ? `<div class="small muted">obj. ${fmt(e.obj, 1)}</div>` : ''}</td>
        <td class="small">${e.rg.n || 0} × ${hhmm(e.rg.h) || '0:00'} h</td>
        <td class="small">${e.avisos.map(esc).join('<br>') || '<span class="muted">–</span>'}</td>
        <td><input type="checkbox" data-irev="${p.id}" ${e.inf.revisado ? 'checked' : ''} aria-label="Revisado"></td>
        <td>${estadoPdf(e.inf)}</td>
        <td class="nw"><button class="btn peq" data-iab="${p.id}">Abrir</button> <button class="btn peq" data-ipdf="${p.id}">PDF</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Ningún plan con ese filtro.</td></tr>'}</table></div>
    <p class="small muted" style="margin-top:10px">Los PDF se guardan como <code>Clientes/&lt;carpeta&gt;/Planes de abonado/&lt;plan&gt; ${esc(CALC.MESES[i])} ${esc(ui.camp)}.pdf</code> y una copia en <code>${esc(CARPETA_INFORMES)}</code>. En la tablet quedan en Drive y el ordenador los pasa solos. Asesor marca como enviado el mes de los clientes con todos sus planes generados.</p></div>`;
  $$('[data-im]', v).forEach((b) => { b.onclick = () => { ui.infMes = +b.dataset.im; renderAll(); }; });
  const iq = $('#iq', v); iq.oninput = () => { ui.infQ = iq.value; const pos = iq.selectionStart; renderInformes(v); const n = $('#iq'); n.focus(); n.setSelectionRange(pos, pos); };
  $$('[data-if]', v).forEach((b) => { b.onclick = () => { ui.infFiltro = b.dataset.if; renderInformes(v); }; });
  $('#iTxt', v).onclick = () => { ui.vista = 'textos'; ui.txtMes = i; renderAll(); };
  $('#iPrep', v).onclick = () => {
    if (!confirm(`¿Rellenar ${mesTxt} en los planes que aún no tienen productos este mes? Se copian del mismo mes de la campaña anterior o, si no hay, del mes anterior. No se toca ningún plan que ya tenga productos.`)) return;
    const r = prepararMes(i);
    toast(`${r.deAnt} copiados de la campaña anterior, ${r.dePrev} del mes anterior${r.nada ? `, ${r.nada} sin nada que copiar` : ''}`);
  };
  $$('[data-irev]', v).forEach((c) => { c.onchange = () => { const p = db.planes.find((x) => x.id === c.dataset.irev); commit(() => marcarRevisado(campDe(p), i, c.checked)); }; });
  $('#iRevT', v).onclick = () => {
    const ok = lista.filter(({ e }) => !e.sinCamp && e.nivel !== 'alto' && !e.inf.revisado);
    if (!ok.length) { toast('No hay ninguno sin revisar sin avisos graves en la lista'); return; }
    if (!confirm(`¿Marcar como revisados ${plural(ok.length, 'plan', 'planes')}?`)) return;
    commit(() => { for (const { p } of ok) marcarRevisado(campDe(p), i, true); });
  };
  $$('[data-iab]', v).forEach((b) => { b.onclick = () => { ui.planId = b.dataset.iab; ui.verLista = false; ui.tab = 'fert'; ui.mes = i; ui.vista = 'planes'; renderAll(); }; });
  $$('[data-ipdf]', v).forEach((b) => { b.onclick = async () => { b.disabled = true; await generarInforme(db.planes.find((x) => x.id === b.dataset.ipdf), ui.camp, i); renderAll(); }; });
  $('#iGen', v).onclick = async () => {
    const rev = filas.filter((x) => !x.e.sinCamp && x.e.inf.revisado);
    const nuevos = rev.filter((x) => !x.e.inf.fecha);
    let lote = nuevos;
    if (!nuevos.length) { if (!confirm(`Todos los revisados ya tienen PDF. ¿Volver a generar los ${rev.length}?`)) return; lote = rev; }
    else if (nuevos.length < rev.length && confirm(`${rev.length - nuevos.length} revisados ya tienen PDF. ¿Volver a generarlos también? (Aceptar = todos; Cancelar = solo los ${nuevos.length} nuevos)`)) lote = rev;
    if (od === 'pedir-permiso') { if (await ALM.reconectar().catch(() => false)) od = 'listo'; }
    if (od !== 'listo' && offline) { toast('Sin conexión: no se pueden guardar los PDF', true); return; }
    const md = modal('Generando informes', `<div class="prog"><i></i></div><p class="small muted" id="gTxt"></p>`);
    const errores = [];
    for (let k = 0; k < lote.length; k++) {
      const { p } = lote[k];
      $('#gTxt', md).textContent = `${k + 1}/${lote.length} · ${p.nombre}`; $('.prog i', md).style.width = ((k + 1) / lote.length * 100) + '%';
      try { await generarInforme(p, ui.camp, i, { abrir: false, silencio: true }); } catch (e) { errores.push(`${p.nombre}: ${e.message || e}`); }
      await new Promise((r) => setTimeout(r, 0));
    }
    $('.cuerpo', md).innerHTML = `<p><b>${plural(lote.length - errores.length, 'informe generado', 'informes generados')}</b> ${od === 'listo' ? `en la carpeta de cada cliente y en <code>${esc(CARPETA_INFORMES)}</code>` : 'en Drive: el ordenador los pasará a OneDrive'}.</p>${errores.length ? `<p class="rojo small">${errores.map(esc).join('<br>')}</p>` : ''}`;
    const pie = document.createElement('footer'); pie.innerHTML = '<button class="btn p" data-cerrar>Cerrar</button>'; md.appendChild(pie);
    $$('[data-cerrar]', md).forEach((b) => { b.onclick = cerrarModal; });
    renderAll();
  };
}

/* ---------- TEXTOS de la página 2 (por mes) ---------- */
const MAX_TEXTO = 450; // caracteres por cuadro para que el informe quepa en 2 páginas
function renderTextos(v) {
  if (ui.txtMes == null) ui.txtMes = ui.infMes == null ? mesInforme() : ui.infMes;
  const i = ui.txtMes, k = claveMes(ui.camp, i);
  const t = db.textos[k] || {};
  const prevK = i > 0 ? claveMes(ui.camp, i - 1) : claveMes(String(+ui.camp - 1), 11);
  const prev = db.textos[prevK];
  const nPorGrupo = Object.fromEntries(CALC.GRUPOS.map((g) => [g, db.planes.filter((p) => p.grupo === g && campDe(p)).length]));
  const nombreG = { CITRICOS: 'Cítricos', FRUTALES: 'Frutales', ALMENDRO: 'Almendro', OLIVOS: 'Olivos' };
  const chips = CALC.MESES.map((mm, j) => { const tt = db.textos[claveMes(ui.camp, j)]; const lleno = tt && ((tt.general || '').trim() || Object.values(tt.fito || {}).some((x) => (x || '').trim())); return `<button class="mes-chip ${j === i ? 'on' : ''}" data-tm="${j}">${mm.slice(0, 3)}${lleno ? '<i></i>' : ''}</button>`; }).join('');
  v.innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">Textos del informe · ${esc(CALC.MESES[i].toLowerCase())} ${esc(ui.camp)}</h2><span class="spacer"></span>
      ${prev ? `<button class="btn peq" id="tCop">Copiar los de ${esc(CALC.MESES[i > 0 ? i - 1 : 11].toLowerCase())}</button>` : ''}<button class="btn peq" id="tClaude" title="Carga los textos que hayas preparado con Claude y confirmado">Buscar textos de Claude</button><button class="btn peq" id="tInf">Ver informes del mes</button></div>
    ${t.claude ? `<p class="small muted">Preparados con Claude el ${fechaEs(t.claude)}. Revísalos antes de generar los informes.</p>` : ''}
    <p class="small muted">Salen en la página 2 del informe de cada plan: la información fitosanitaria según el grupo de cultivo del plan y la situación actual para todos. Se guardan solos al salir de cada cuadro.</p>
    <div class="meses">${chips}</div>
    <label class="fld" style="margin-top:14px"><span><b>Situación actual y novedades</b> · para todos los planes</span><textarea data-tx="general" rows="6" placeholder="Cómo viene la campaña, el tiempo, novedades del sector, cambios de normativa…">${esc(t.general || '')}</textarea><span class="contador" data-cont="general"></span></label>
    <h3 style="margin-top:18px">Información fitosanitaria</h3>
    <div class="grid2">${CALC.GRUPOS.map((g) => `<label class="fld"><span><b>${nombreG[g] || g}</b> · ${plural(nPorGrupo[g], 'plan', 'planes')}</span><textarea data-tx="fito.${g}" rows="6" placeholder="${nPorGrupo[g] ? 'Plagas y enfermedades del momento, umbrales, tratamientos recomendados…' : 'Ningún plan de este grupo'}">${esc((t.fito || {})[g] || '')}</textarea><span class="contador" data-cont="fito.${g}"></span></label>`).join('')}</div></div>`;
  $$('[data-tm]', v).forEach((b) => { b.onclick = () => { ui.txtMes = +b.dataset.tm; renderTextos(v); }; });
  const contar = (ta) => { const n = ta.value.trim().length, c = $(`[data-cont="${ta.dataset.tx}"]`, v); if (!c) return; c.textContent = n ? `${n} / ${MAX_TEXTO} caracteres${n > MAX_TEXTO ? ' · largo: el informe puede pasar a 3 páginas' : ''}` : ''; c.className = 'contador' + (n > MAX_TEXTO ? ' largo' : ''); };
  $$('[data-tx]', v).forEach((ta) => { contar(ta); ta.addEventListener('input', () => contar(ta)); });
  $$('[data-tx]', v).forEach((ta) => { ta.onchange = () => { commit((d) => { const o = d.textos[k] = d.textos[k] || { general: '', fito: {} }; o.fito = o.fito || {}; const r = ta.dataset.tx; if (r === 'general') o.general = ta.value.trim(); else o.fito[r.split('.')[1]] = ta.value.trim(); }, { render: false }); renderTextosChips(v); }; });
  $('#tInf', v).onclick = () => { ui.vista = 'informes'; ui.infMes = i; renderAll(); };
  $('#tClaude', v).onclick = () => traerTextosPendientes(true);
  if ($('#tCop', v)) $('#tCop', v).onclick = () => {
    const lleno = (t.general || '').trim() || Object.values(t.fito || {}).some((x) => (x || '').trim());
    if (lleno && !confirm('¿Sustituir los textos de este mes por los del mes anterior?')) return;
    commit((d) => { d.textos[k] = structuredClone(prev); }); toast('Textos copiados: revísalos y cambia lo que haga falta');
  };
}
/* Textos redactados con Claude (tarea del día 20): Claude deja textos-pendientes.json en Drive y la app los carga aquí */
let ultTextos = 0;
async function traerTextosPendientes(forzar = false) {
  if (conn !== 'listo' || offline || !db) return;
  if (!forzar && Date.now() - ultTextos < 5 * 60000) return;
  ultTextos = Date.now();
  let r;
  try { r = await NUBE.llamar('textosPendientes', {}, 30000); } catch (e) { if (forzar) toast(e.message || String(e), true); return; }
  if (!r || !r.ok || !r.textos) { if (forzar) toast(r && r.error === 'acción desconocida' ? 'Falta actualizar el script de la hoja «Planes de abonado» (versión 1.5)' : 'No hay textos nuevos de Claude', !!(r && r.error)); return; }
  let t; try { t = JSON.parse(r.textos); } catch (_) { toast('El archivo de textos de Claude no es válido', true); return; }
  if (!/^\d{4}-\d{2}$/.test(String(t.mes || ''))) { toast('El archivo de textos de Claude no dice de qué mes es', true); return; }
  const limpio = (x) => String(x || '').trim();
  commit((d) => {
    const o = d.textos[t.mes] = d.textos[t.mes] || { general: '', fito: {} };
    o.fito = o.fito || {};
    if (limpio(t.general)) o.general = limpio(t.general);
    for (const g of CALC.GRUPOS) if (t.fito && limpio(t.fito[g])) o.fito[g] = limpio(t.fito[g]);
    o.claude = t.creado || new Date().toISOString();
  }, { render: false });
  try { await NUBE.llamar('textosAplicados', { id: r.id }, 30000); } catch (_) { /* se volverá a cargar igual: no pasa nada */ }
  const [y, m] = t.mes.split('-');
  toast(`Textos de ${CALC.MESES[+m - 1].toLowerCase()} ${y} cargados (preparados con Claude). Revísalos en Textos.`);
  renderAll();
}
function renderTextosChips(v) { const i = ui.txtMes, tt = db.textos[claveMes(ui.camp, i)]; const b = $(`[data-tm="${i}"]`, v); if (b) b.innerHTML = CALC.MESES[i].slice(0, 3) + (tt && ((tt.general || '').trim() || Object.values(tt.fito || {}).some((x) => (x || '').trim())) ? '<i></i>' : ''); }

/* ---------- Desplegable con búsqueda (ordenador y tablet) ----------
   opciones: [{ v, t, sub }] · libre: se puede dejar un texto que no está en la lista (periodo) · alElegir(v, t) */
let comboAbierto = null;
function cerrarCombo() { if (comboAbierto) { comboAbierto.lista.remove(); comboAbierto = null; } }
function enfocar(sel) { setTimeout(() => { const n = $(sel); if (n) { n.focus(); if (n.select) n.select(); } }, 30); }
function combo(inp, { opciones, libre = false, vacio = 'Sin resultados', alElegir }) {
  const original = inp.value;
  let filtradas = [], activo = -1, lista = null, hecho = false;
  const colocar = () => {
    if (!lista) return;
    const r = inp.getBoundingClientRect(), vv = window.visualViewport;
    const alto = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const abajo = alto - r.bottom - 8, arriba = r.top - (vv ? vv.offsetTop : 0) - 8;
    const sube = abajo < 180 && arriba > abajo;
    lista.style.left = Math.max(4, Math.min(r.left, window.innerWidth - Math.max(r.width, 260) - 4)) + 'px';
    lista.style.width = Math.max(r.width, 260) + 'px';
    lista.style.maxHeight = Math.max(120, Math.min(300, sube ? arriba : abajo)) + 'px';
    if (sube) { lista.style.top = ''; lista.style.bottom = (window.innerHeight - r.top + 4) + 'px'; } else { lista.style.bottom = ''; lista.style.top = (r.bottom + 4) + 'px'; }
  };
  const pintar = () => {
    lista.innerHTML = filtradas.length ? filtradas.map((o, k) => `<div class="combo-op ${k === activo ? 'on' : ''}" data-ci="${k}"><span>${esc(o.t)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>`).join('')
      : `<div class="combo-vacio">${libre && inp.value.trim() ? 'Se quedará: «' + esc(inp.value.trim()) + '»' : esc(vacio)}</div>`;
    const a = $('.combo-op.on', lista); if (a) a.scrollIntoView({ block: 'nearest' });
  };
  const filtrar = (todo) => {
    const q = todo ? [] : CALC.norm(inp.value).split(/\s+/).filter(Boolean);
    filtradas = opciones.filter((o) => { const h = CALC.norm(o.t + ' ' + (o.sub || '')); return q.every((w) => h.includes(w)); });
    activo = libre ? -1 : (filtradas.length ? 0 : -1);
    if (todo && !libre) { const k = filtradas.findIndex((o) => o.t === inp.value); if (k >= 0) activo = k; }
    pintar();
  };
  const abrir = () => {
    cerrarCombo();
    lista = document.createElement('div'); lista.className = 'combo-lista'; document.body.appendChild(lista);
    comboAbierto = { lista, inp };
    lista.addEventListener('pointerdown', (e) => { e.preventDefault(); const it = e.target.closest('[data-ci]'); if (it) elegir(filtradas[+it.dataset.ci]); });
    filtrar(true); colocar();
  };
  const elegir = (o) => { hecho = true; inp.value = o.t; cerrarCombo(); lista = null; alElegir(o.v, o.t); };
  const fin = () => { // al salir sin elegir de la lista
    if (hecho) return; hecho = true; cerrarCombo(); lista = null;
    const t = inp.value.trim();
    if (libre) { if (t !== original.trim()) alElegir(null, t); return; }
    const exacto = opciones.find((o) => CALC.norm(o.t) === CALC.norm(t));
    if (exacto && exacto.t !== original) alElegir(exacto.v, exacto.t); else inp.value = original;
  };
  inp.addEventListener('focus', () => { hecho = false; if (inp.select) inp.select(); abrir(); });
  inp.addEventListener('click', () => { if (!lista) { hecho = false; abrir(); } });
  inp.addEventListener('input', () => { if (!lista) abrir(); filtrar(false); colocar(); });
  inp.addEventListener('blur', () => setTimeout(fin, 120));
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!lista) abrir(); if (!filtradas.length) return; activo = e.key === 'ArrowDown' ? Math.min(filtradas.length - 1, activo + 1) : Math.max(libre ? -1 : 0, activo - 1); pintar(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (lista && activo >= 0 && filtradas[activo]) elegir(filtradas[activo]); else { fin(); inp.blur(); } }
    else if (e.key === 'Escape') { e.stopPropagation(); inp.value = original; hecho = true; cerrarCombo(); lista = null; inp.blur(); }
    else if (e.key === 'Tab' && lista && !libre && activo >= 0 && filtradas[activo] && CALC.norm(inp.value) !== CALC.norm(original)) { elegir(filtradas[activo]); }
  });
}
window.addEventListener('resize', () => { if (comboAbierto) comboAbierto.inp.dispatchEvent(new Event('input')); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (comboAbierto && document.activeElement === comboAbierto.inp) comboAbierto.inp.dispatchEvent(new Event('input')); });
document.addEventListener('scroll', (e) => { if (comboAbierto && !(e.target && e.target.classList && e.target.classList.contains('combo-lista'))) { const r = comboAbierto.inp.getBoundingClientRect(); const l = comboAbierto.lista; l.style.top = l.style.top ? (r.bottom + 4) + 'px' : ''; if (l.style.bottom) l.style.bottom = (window.innerHeight - r.top + 4) + 'px'; } }, true);

/* ---------- PRODUCTOS ---------- */
const RUTA_PRODUCTOS = 'Cuaderno de campo/Calculadoras Excel/Base de datos/Productos Gestion fertirrigacion.xlsx';
function usosProducto(pr) {
  let n = 0;
  for (const p of db.planes) for (const c of Object.values(p.campanas || {})) for (const m of Object.values(c.fert || {})) for (const l of (m && m.lineas) || []) if (l.prodId === pr.id) n++;
  return n;
}
function renderProductos(v) {
  const q = CALC.norm(ui.qProd || '');
  const lista = db.productos.filter((x) => !q || CALC.norm(x.nombre).includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const fam = { micro: 'Quelatos y micro', organico: 'Orgánicos', bio: 'Bioestimulantes y otros' };
  v.innerHTML = `<div class="card"><div class="row"><h2>Productos</h2><span class="spacer"></span>
      <input id="prQ" type="search" placeholder="Buscar…" value="${esc(ui.qProd || '')}" style="background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:6px 10px">
      ${od !== 'no-disponible' ? '<button class="btn peq" id="prImp">Importar de mi Excel de productos</button>' : ''}<button class="btn peq p" id="prNuevo">+ Nuevo</button></div>
    <p class="small muted">Riquezas en %. Tanque habitual: 1, 2 o especial (E). Los especiales que van en el mismo momento del mes comparten E; los orgánicos van en un E aparte.</p>
    ${db.productos.length ? `<div class="scroll-x"><table class="t"><tr><th>Producto</th><th class="n">N</th><th class="n">P2O5</th><th class="n">K2O</th><th class="n">CaO</th><th class="n">MgO</th><th class="n">S</th><th class="n">Fe</th><th class="n">Zn</th><th class="n">Mn</th><th class="n">Dens.</th><th>Tanque</th><th class="n">Usos</th><th>Maestro</th></tr>
    ${lista.map((x) => `<tr class="click" data-pr="${x.id}"><td><b>${esc(x.nombre)}</b>${x.activo === false ? ' <span class="chip">inactivo</span>' : ''}</td>${['n', 'p2o5', 'k2o', 'cao', 'mgo', 's', 'fe', 'zn', 'mn'].map((r) => `<td class="n">${x.riq[r] ? fmt(x.riq[r], x.riq[r] % 1 ? 1 : 0) : '<span class="muted">·</span>'}</td>`).join('')}<td class="n">${fmt(x.densidad, 2)}</td><td>${x.tanque === 'E' ? `<span class="chip azul">E · ${esc(fam[x.familia] || '')}</span>` : `<span class="chip">Tanque ${x.tanque}</span>`}</td><td class="n">${usosProducto(x)}</td><td class="small">${x.mxId ? esc(x.mxId) : '<span class="muted">–</span>'}</td></tr>`).join('')}</table></div>`
    : `<div class="vacio"><p>Aún no hay productos. ${od !== 'no-disponible' ? 'Impórtalos de tu Excel <code>Productos Gestion fertirrigacion.xlsx</code>.' : 'Impórtalos desde el ordenador.'}</p></div>`}</div>`;
  const qi = $('#prQ', v); qi.oninput = () => { ui.qProd = qi.value; const pos = qi.selectionStart; renderProductos(v); const n = $('#prQ'); n.focus(); n.setSelectionRange(pos, pos); };
  if ($('#prImp', v)) $('#prImp', v).onclick = importarProductos;
  $('#prNuevo', v).onclick = () => editarProducto(null);
  $$('[data-pr]', v).forEach((r) => { r.onclick = () => editarProducto(db.productos.find((x) => x.id === r.dataset.pr)); });
}
async function importarProductos() {
  if (!(await asegurarOneDrive())) return;
  let filas;
  try {
    const buf = await ALM.leerRuta(RUTA_PRODUCTOS);
    const wb = XLSX.read(buf, { type: 'array' });
    filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  } catch (e) { toast('No encuentro ' + RUTA_PRODUCTOS + ' dentro de ' + ALM.nombreRaiz() + ': ' + (e.message || e), true); return; }
  const nuevos = FERT.productosDesdeFilas(filas, uid);
  const hab = FERT.tanquesHabituales(db);
  let alta = 0, act = 0;
  commit((d) => {
    const porNom = new Map(d.productos.map((x) => [CALC.norm(x.nombre), x]));
    for (const n of nuevos) {
      const ya = porNom.get(CALC.norm(n.nombre));
      if (ya) { ya.riq = n.riq; ya.densidad = n.densidad; if (n.notas && !ya.notas) ya.notas = n.notas; act++; continue; }
      const t = hab.get(CALC.norm(n.nombre)); if (t) n.tanque = t;
      if (IX) { const r = MX.buscarProducto(IX, n.nombre); if (r) n.mxId = r.p.id; }
      d.productos.push(n); alta++;
    }
    asegurarFert(d);
  });
  toast(`${plural(alta, 'producto nuevo', 'productos nuevos')}${act ? `, ${act} actualizados` : ''}`);
}
function editarProducto(pr) {
  const nuevo = !pr;
  const x = pr ? structuredClone(pr) : { id: uid('pr'), nombre: '', riq: Object.fromEntries(FERT.RIQ.map((r) => [r, 0])), densidad: 1, tanque: '1', familia: 'bio', notas: '', mxId: null, activo: true };
  const etiq = { n: 'N', p2o5: 'P2O5', k2o: 'K2O', cao: 'CaO', mgo: 'MgO', s: 'S (SO3)', fe: 'Fe', zn: 'Zn', mn: 'Mn', no3: 'N nítrico', nh4: 'N amoniacal' };
  const mxOps = IX ? `<label class="fld" style="grid-column:span 2"><span>Maestro de productos</span><select data-pm="mxId"><option value="">— Sin enlazar —</option>${mxData.productos.filter((p) => /fertiliz|bioestim/i.test(p.categoria || '')).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((p) => `<option value="${p.id}" ${p.id === x.mxId ? 'selected' : ''}>${esc(p.nombre)} (${p.id})</option>`).join('')}</select></label>` : '';
  const m = modal(nuevo ? 'Nuevo producto' : x.nombre, `<div class="grid4">
      <label class="fld" style="grid-column:span 2"><span>Nombre</span><input data-pm="nombre" value="${esc(x.nombre)}"></label>
      <label class="fld"><span>Densidad (kg/L)</span><input data-pr="densidad" value="${fmtIn(x.densidad)}"></label>
      <label class="fld"><span>Tanque habitual</span><select data-pm="tanque">${[['1', 'Tanque 1'], ['2', 'Tanque 2'], ['E', 'Especial (E)']].map(([v2, t]) => `<option value="${v2}" ${x.tanque === v2 ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="fld"><span>Familia (para los E)</span><select data-pm="familia">${[['micro', 'Quelatos y micro'], ['organico', 'Orgánicos'], ['bio', 'Bioestimulantes y otros']].map(([v2, t]) => `<option value="${v2}" ${x.familia === v2 ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${mxOps}
      <label class="fld"><span>Activo</span><span class="chk"><input type="checkbox" data-pm="activo" ${x.activo !== false ? 'checked' : ''}> Sale en las listas</span></label></div>
    <h3 style="margin-top:14px">Riquezas (%)</h3><div class="grid4">${FERT.RIQ.map((r) => `<label class="fld"><span>${etiq[r]}</span><input data-pq="${r}" value="${fmtIn(x.riq[r] || '')}" placeholder="0"></label>`).join('')}</div>
    <label class="fld" style="margin-top:12px"><span>Notas (modo de uso)</span><input data-pm="notas" value="${esc(x.notas || '')}"></label>
    ${nuevo ? '' : `<p class="small muted" style="margin-top:10px">Se usa en ${plural(usosProducto(pr), 'línea', 'líneas')} de los planes.</p>`}`,
  { pie: `${!nuevo ? '<button class="btn rojo" id="pmDel">Borrar</button><span class="spacer"></span>' : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn p" id="pmOk">Guardar</button>` });
  $$('[data-cerrar]', m).forEach((b) => { b.onclick = cerrarModal; });
  $('#pmOk', m).onclick = () => {
    $$('[data-pm]', m).forEach((i) => { x[i.dataset.pm] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
    x.mxId = x.mxId || null; x.densidad = CALC.num($('[data-pr="densidad"]', m).value) || 1;
    $$('[data-pq]', m).forEach((i) => { x.riq[i.dataset.pq] = CALC.num(i.value) || 0; });
    if (!x.nombre) { toast('Pon el nombre', true); return; }
    commit((d) => { const k = d.productos.findIndex((y) => y.id === x.id); if (k >= 0) d.productos[k] = x; else d.productos.push(x); asegurarFert(d); });
    cerrarModal(); toast('Producto guardado');
  };
  const del = $('#pmDel', m);
  if (del) del.onclick = () => {
    const n = usosProducto(pr);
    if (n && !confirm(`Se usa en ${plural(n, 'línea', 'líneas')}: se quedarán sin producto. Mejor márcalo como inactivo. ¿Borrarlo igualmente?`)) return;
    if (!n && !confirm('¿Borrar este producto?')) return;
    commit((d) => { d.productos = d.productos.filter((y) => y.id !== pr.id); for (const p of d.planes) for (const c of Object.values(p.campanas || {})) for (const mm of Object.values(c.fert || {})) for (const l of (mm && mm.lineas) || []) if (l.prodId === pr.id) l.prodId = null; });
    cerrarModal();
  };
}

/* ---------- Nuevo plan ---------- */
function nuevoPlan() {
  const opsCopiar = [['', '— Plan vacío —'], ...db.planes.map((p) => [p.id, `${p.cliente} · ${p.nombre}`])];
  const clis = IX ? mxData.clientes.filter((c) => !/^baja$/i.test(c.estado || '')).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) : [];
  const m = modal('Nuevo plan', `<div class="grid2">
    <label class="fld"><span>Cliente</span><input id="nCli" list="nCliL"><datalist id="nCliL">${[...new Set([...db.planes.map((p) => p.cliente), ...clis.map((c) => c.nombre)])].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="fld"><span>Finca</span><input id="nFin" list="nFinL"><datalist id="nFinL">${[...new Set(db.planes.map((p) => p.finca))].map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="fld"><span>Tipo de cultivo</span><select id="nTipo">${CALC.CULTIVOS.map((c) => `<option>${c.nombre}</option>`).join('')}<option>Mixto (varios cultivos)</option></select></label>
    <label class="fld"><span>Nombre del plan (y del PDF)</span><input id="nNom" placeholder="p. ej. Juan Limón Verna Finca X"></label>
    <label class="fld" style="grid-column:span 2"><span>Copiar marco, riego y analíticas de otro plan</span><select id="nCop">${opsCopiar.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label></div>
    <p class="small muted">Los PDF irán a <code>Clientes/&lt;cliente&gt;/&lt;finca&gt;/Planes de abonado</code>. Se puede cambiar luego en la pestaña Finca.</p>`,
  { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn p" id="nOk">Crear</button>' });
  $$('[data-cerrar]', m).forEach((b) => { b.onclick = cerrarModal; });
  $('#nOk', m).onclick = () => {
    const cliente = $('#nCli', m).value.trim(), finca = $('#nFin', m).value.trim();
    if (!cliente || !finca) { toast('Pon cliente y finca', true); return; }
    const tipo = $('#nTipo', m).value, cult = CALC.CULTIVOS.find((c) => c.nombre === tipo);
    const base = db.planes.find((p) => p.id === $('#nCop', m).value);
    const p = base ? structuredClone(base) : { marco: { filas: null, arboles: null }, copa: null, caudal: null, emisores: null, lineas: 1, textura: 'Franco', kc: null, analSuelo: null, analAgua: null, superficie: null, arboles: null, recintos: '', vulnerable: false, campoCartagena: false, titular: cliente, campanas: {} };
    Object.assign(p, { id: uid('p'), origen: null, cliente, finca, carpeta: cliente + '/' + finca, tipoCultivo: tipo, grupo: cult ? cult.grupo : (base ? base.grupo : 'CITRICOS'), cultivo: tipo, nombre: $('#nNom', m).value.trim() || `${cliente} ${tipo} ${finca}`, mxCli: null, mxFin: null });
    if (base) { const k = Object.keys(base.campanas || {}).sort().slice(-1)[0]; p.campanas = {}; if (k) { p.campanas[ui.camp] = structuredClone(base.campanas[k]); Object.assign(p.campanas[ui.camp], { ufAplicadas: CALC.MESES.map(() => [0, 0, 0, 0, 0]), estiercoles: [], pdf: {}, informes: {}, cal: {}, excel: null, produccionReal: null, dosisRealM3: null }); } }
    if (!p.campanas[ui.camp]) crearCampana(p, ui.camp);
    if (!p.reparto) { const r = db.repartos.find((x) => x.grupo === p.grupo); if (r) p.reparto = r.id; }
    p.campanaActual = ui.camp;
    if (IX) enlazarPlan(p, false);
    commit((d) => { d.planes.push(p); ui.planId = p.id; ui.verLista = false; ui.tab = 'finca'; ui.vista = 'planes'; });
    cerrarModal(); toast('Plan creado');
  };
}

/* ---------- ANALÍTICAS (todas) ---------- */
function renderAnaliticas(v) {
  const tipos = [['todas', 'Todas'], ['suelo', 'Suelo'], ['agua', 'Agua'], ['estiercol', 'Estiércol']];
  const l = db.analiticas.filter((a) => ui.analTipo === 'todas' || a.tipo === ui.analTipo).sort((a, b) => a.tipo.localeCompare(b.tipo) || (b.fecha || '').localeCompare(a.fecha || ''));
  const T = cfg().tablas;
  v.innerHTML = `<div class="card"><div class="row"><h2>Analíticas</h2><span class="spacer"></span>
      <div class="filtros">${tipos.map(([k, t]) => `<button data-at="${k}" aria-pressed="${ui.analTipo === k}">${t}</button>`).join('')}</div>
      <button class="btn peq" data-na="suelo">+ Suelo</button><button class="btn peq" data-na="agua">+ Agua</button><button class="btn peq" data-na="estiercol">+ Estiércol</button></div>
    <p class="small muted">Una misma analítica puede servir a varios planes (por ejemplo, el agua de una comunidad de regantes). Pulsa una fila para editarla y marcar los planes que la usan.</p>
    <table class="t"><tr><th>Tipo</th><th>Nombre</th><th>Fecha</th><th>Ref.</th><th class="n">Antigüedad</th><th class="n">Planes</th><th></th></tr>
    ${l.map((a) => { const e = CALC.edadAnios(a.fecha); const max = T.antiguedad[a.tipo] || 4; const n = usos(a).length; return `<tr class="click" data-ae="${a.id}"><td>${{ suelo: 'Suelo', agua: 'Agua', estiercol: 'Estiércol' }[a.tipo]}</td><td><b>${esc(a.nombre)}</b>${a.lab ? ` <span class="muted small">${esc(a.lab)}</span>` : ''}</td><td>${fechaEs(a.fecha)}</td><td>${esc(a.ref || '–')}</td><td class="n">${e == null ? '–' : `<span class="${e > max ? 'chip amb' : ''}">${fmt(e, 1)} años</span>`}</td><td class="n">${n}</td><td>${a.plantilla ? '<span class="chip rojo">Plantilla</span>' : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Sin analíticas.</td></tr>'}
    </table></div>`;
  $$('[data-at]', v).forEach((b) => { b.onclick = () => { ui.analTipo = b.dataset.at; renderAnaliticas(v); }; });
  $$('[data-na]', v).forEach((b) => { b.onclick = () => editarAnalitica({ tipo: b.dataset.na, v: b.dataset.na === 'estiercol' ? { tipo: CALC.TABLAS.estiercol[0].tipo } : {}, u: {} }); });
  $$('[data-ae]', v).forEach((r) => { r.onclick = () => editarAnalitica(anal(r.dataset.ae)); });
}

/* ---------- AVISOS ---------- */
function renderAvisos(v) {
  const filas = db.planes.map((p) => ({ p, av: avisosDe(p) })).filter((x) => x.av.length)
    .sort((a, b) => b.av.filter((x) => x.nivel === 'alto').length - a.av.filter((x) => x.nivel === 'alto').length || a.p.cliente.localeCompare(b.p.cliente, 'es'));
  const cuenta = {};
  for (const { av } of filas) for (const a of av) { const k = a.txt.replace(/[\d.,]+/g, '#').replace(/\(.*\)/, '').trim(); cuenta[k] = (cuenta[k] || 0) + 1; }
  v.innerHTML = `<div class="card"><h2>Avisos · campaña ${esc(ui.camp)}</h2>
    <div class="row small" style="margin:8px 0 14px">${Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `<span class="chip">${esc(k.replace(/#/g, 'X'))}: <b>${n}</b></span>`).join('')}</div>
    <table class="t"><tr><th></th><th>Plan</th><th>Cliente</th><th>Avisos</th></tr>
    ${filas.map(({ p, av }) => `<tr class="click" data-ap="${p.id}"><td><span class="dot ${nivelPlan(av)}"></span></td><td><b>${esc(p.nombre)}</b>${p.vulnerable ? ' <span class="chip amb">ZV</span>' : ''}</td><td>${esc(p.cliente)}</td><td class="small">${av.map((a) => `<div>${a.nivel === 'alto' ? '● ' : '○ '}${esc(a.txt)}</div>`).join('')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin avisos.</td></tr>'}</table></div>`;
  $$('[data-ap]', v).forEach((r) => { r.onclick = () => { const p = db.planes.find((x) => x.id === r.dataset.ap); const a = avisosDe(p)[0]; ui.planId = p.id; ui.verLista = false; ui.tab = a ? a.donde : 'finca'; ui.vista = 'planes'; renderAll(); }; });
}

/* ---------- AJUSTES ---------- */
function renderAjustes(v) {
  const c = db.config;
  const T = CALC.TABLAS;
  const cs = campanas();
  const sig = String((+cs.slice(-1)[0] || new Date().getFullYear()) + 1);
  const mxCfg = c.mx || {};
  const sinEnlace = db.planes.filter((p) => !p.mxFin).length;
  v.innerHTML = `<div class="grid2" style="align-items:start">
  <div>
    <div class="card"><h3>Datos en Google Drive</h3>
      <p class="small">Drive › Apps › Planes de abonado → <code>datos.json</code> (copia diaria en <code>Copias</code>). ${offline ? '<span class="chip rojo">Sin conexión</span>' : '<span class="chip v">Conectado</span>'} ${dirty ? '<span class="chip amb">Cambios sin subir</span>' : ''}</p>
      <div class="grid2"><label class="fld"><span>Nombre de este equipo</span><input id="aEq" value="${esc(local.equipo)}" placeholder="Oficina, Casa, Tablet…"></label>
      <div class="fld"><span>&nbsp;</span><div class="row"><button class="btn" id="aRec">Recargar de Drive</button><button class="btn" id="aNube">Cambiar dirección o clave</button></div></div></div>
      <p class="small muted">Último guardado: ${db.guardado ? `${fechaEs(db.guardado.fecha)} ${new Date(db.guardado.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} desde ${esc(db.guardado.equipo)}` : 'aún no'} · versión ${versionNube}.</p></div>
    <div class="card"><h3>OneDrive (solo en el ordenador)</h3>
      ${pendientesOneDrive() ? `<div class="aviso" style="display:block;margin-bottom:8px"><b>PDF pendientes de pasar a OneDrive:</b><ul style="margin:4px 0 0 18px;padding:0">${regsPendientes().map((x) => `<li>${esc(x.p.nombre)} · ${esc(x.txt)} · hecho el ${fechaEs(x.reg.fecha)}</li>`).join('')}</ul><span class="small muted">Se pasan solos cuando el ordenador tiene la app abierta con OneDrive conectado.</span></div>` : ''}
      ${od === 'no-disponible' ? `<p class="small">En este equipo no se puede usar la carpeta de OneDrive. Los PDF que hagas aquí quedan en Drive y el ordenador los pasa solo a la carpeta de cada cliente. ${pendientesOneDrive() ? `<b>Pendientes ahora: ${pendientesOneDrive()}.</b>` : ''}</p>`
      : `<p class="small">Carpeta <b>${esc(ALM.nombreRaiz() || '—')}</b> ${od === 'listo' ? '<span class="chip v">Conectada</span>' : '<span class="chip amb">Sin conectar</span>'}. Se usa para importar los Excels de <b>Clientes</b> y guardar los PDF en la carpeta de cada cliente y finca. ${pendientesOneDrive() ? `<b>PDF de la tablet pendientes: ${pendientesOneDrive()}.</b>` : ''}</p>
      <div class="row"><button class="btn" id="aOd">${od === 'listo' ? 'Cambiar de carpeta' : od === 'pedir-permiso' ? 'Conectar' : 'Elegir carpeta Asesoramiento agrícola'}</button><button class="btn p" id="aImp">Importar los Excels</button><button class="btn" id="aV10">Traer datos de la versión 1.0</button></div>`}</div>
    <div class="card"><h3>Campañas</h3>
      <p class="small">Campañas con datos: ${cs.map(esc).join(', ') || '–'}. Al crear una nueva se copian de la anterior el riego, la producción y los ajustes; el N del plan y los estiércoles empiezan vacíos.</p>
      <label class="fld" style="margin:10px 0"><span>Campaña al abrir la app</span><select id="aCampIni" style="max-width:260px"><option value="">La más reciente${cs.length ? ' (' + esc(cs.slice(-1)[0]) + ')' : ''}</option>${cs.map((k) => `<option value="${esc(k)}" ${c.campanaInicio === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
      <button class="btn" id="aCamp">Crear la campaña ${sig} en todos los planes</button></div>
    <div class="card"><h3>Maestros (Drive › Apps › Maestros)</h3>
      <p class="small muted">La misma dirección y clave que en Ventas o Asesor. Sirve para enlazar cada plan con su cliente y finca del maestro (lo usará la marca de «enviado» en Asesor).</p>
      <div class="grid2"><label class="fld"><span>Dirección del script (…/exec)</span><input id="aMxU" value="${esc(mxCfg.url || '')}"></label><label class="fld"><span>Clave</span><input id="aMxK" type="password" value="${esc(mxCfg.clave || '')}"></label></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="aMxOk">Probar y leer</button>${IX ? `<button class="btn" id="aMxEnl">Enlazar planes por nombre</button>${sinEnlace ? '<button class="btn" id="aMxVer">Ver los planes sin enlazar</button>' : ''}<span class="small muted">${mxData.clientes.length} clientes · ${mxData.fincas.length} fincas · ${sinEnlace} planes sin enlazar</span>` : ''}</div></div>
    <div class="card"><h3>Informe PDF</h3>
      <div class="row">${logoCache ? `<img src="${logoCache}" alt="Logo" style="height:42px;border:1px solid var(--line);border-radius:6px;padding:3px;background:#fff">` : '<span class="small muted">Sin logo (se toma del primer Excel al importar).</span>'}<label class="btn peq">Cambiar logo<input type="file" id="aLogo" accept="image/png,image/jpeg" hidden></label></div>
      <label class="fld" style="margin-top:10px"><span>Pie del PDF del balance de N</span><input id="aAutor" value="${esc(c.autor || '')}"></label>
      <label class="fld" style="margin-top:10px"><span>Texto del pie del informe mensual (página 2)</span><textarea id="aPieT" rows="4">${esc((c.pie || {}).texto || '')}</textarea></label>
      <div class="grid2" style="margin-top:10px"><label class="fld"><span>Teléfono</span><input id="aPieTel" value="${esc((c.pie || {}).telefono || '')}" inputmode="tel"></label><label class="fld"><span>Email</span><input id="aPieMail" value="${esc((c.pie || {}).email || '')}" inputmode="email"></label></div>
      <p class="small muted">Se guardan en tus datos de Drive, no en el código de la app.</p></div>
    <div class="card"><h3>Plan de abonado anual (Registros)</h3>
      <label class="fld"><span>Forma de aplicación y maquinaria</span><textarea id="aPaApl" rows="3" placeholder="${esc(TEXTO_APLICACION)}">${esc((c.planAnual || {}).aplicacion || '')}</textarea></label>
      <label class="fld" style="margin-top:10px"><span>Medidas para reducir emisiones de amoniaco y gases de efecto invernadero</span><textarea id="aPaMed" rows="4" placeholder="${esc(TEXTO_MEDIDAS)}">${esc((c.planAnual || {}).medidas || '')}</textarea></label>
      <p class="small muted">Vacío = el texto de ejemplo que se ve en gris.</p></div>
    <div class="card"><h3>Plan de abonado RD 1051/2022 (Registros)</h3>
      <div class="grid2"><label class="fld"><span>Asesor (nombre que firma)</span><input data-rd="asesor" value="${esc((c.rd || {}).asesor || '')}" placeholder="${esc(c.autor || '')}"></label><label class="fld"><span>Nº de registro del asesor</span><input data-rd="registro" value="${esc((c.rd || {}).registro || '')}"></label>
      <label class="fld"><span>Precipitación media anual (mm)</span><input data-rd="precipitacion" value="${esc((c.rd || {}).precipitacion || '')}" inputmode="decimal" placeholder="Zona de Mula"></label></div>
      ${[['lluvia', 'Reparto de la lluvia en el año'], ['objetivoMO', 'Objetivo de materia orgánica'], ['prohibiciones', 'Prohibiciones y precauciones'], ['almacenamiento', 'Almacenamiento'], ['proteccion', 'Protección de aguas y suelos'], ['asesoramiento', 'Asesoramiento técnico'], ['cuaderno', 'Cuaderno de explotación']].map(([k, l]) => `<label class="fld" style="margin-top:10px"><span>${l}</span><textarea data-rd="${k}" rows="3" placeholder="${esc(RD_TXT[k])}">${esc((c.rd || {})[k] || '')}</textarea></label>`).join('')}
      <p class="small muted">Forma de aplicación y medidas de emisiones: las del plan anual (arriba). Vacío = el texto de ejemplo en gris.</p></div>
    ${htmlProgramasAjustes()}
    <div class="card"><h3>Copia de seguridad</h3><div class="row"><button class="btn" id="aExp">Descargar copia (.json)</button><label class="btn">Restaurar copia…<input type="file" id="aRes" accept=".json,application/json" hidden></label></div></div>
  </div>
  <div>
    <div class="card"><h3>Clima de la zona de Mula y Kc por grupo</h3>
      <table class="t"><tr><th>Mes</th><th class="n">ETo (mm)</th>${CALC.GRUPOS.map((g) => `<th class="n">Kc ${g.toLowerCase()}</th>`).join('')}</tr>
      ${CALC.MESES.map((m, i) => `<tr><td>${m}</td><td class="w"><input class="cell" data-eto="${i}" value="${fmtIn(c.eto[i])}"></td>${CALC.GRUPOS.map((g) => `<td class="w"><input class="cell" data-kcg="${g}.${i}" value="${fmtIn((c.kc[g] || CALC.KC[g])[i])}"></td>`).join('')}</tr>`).join('')}</table>
      <p class="small muted">Una sola ETo para todas las fincas y sin lluvia efectiva (versión 1). Kc de cítricos y frutales: los de tus Excels; almendro y olivo: orientativos, revísalos. Un plan puede tener su propio Kc (pestaña Finca).</p></div>
    <div class="card"><h3>Avisos y normativa</h3><div class="grid4">
      <label class="fld"><span>Límite N orgánico (kg/ha)</span><input data-cfg="limiteNOrganico" value="${fmtIn(c.limiteNOrganico)}"></label>
      <label class="fld"><span>Suelo: máx. años</span><input data-cfga="suelo" value="${fmtIn(c.antiguedad.suelo)}"></label>
      <label class="fld"><span>Agua: máx. años</span><input data-cfga="agua" value="${fmtIn(c.antiguedad.agua)}"></label>
      <label class="fld"><span>Estiércol: máx. años</span><input data-cfga="estiercol" value="${fmtIn(c.antiguedad.estiercol)}"></label></div>
      <p class="small muted">Antigüedad máxima para avisar de una analítica vieja. Pon las que exija el programa de actuación que apliques.</p></div>
    <div class="card"><h3>Tablas de la pestaña 1 (se usa el valor medio)</h3>
      <table class="t small"><tr><th>fA · NO3 suelo</th><th class="n">%</th></tr><tr><td>0-40 mg/kg</td><td class="n">10-15</td></tr><tr><td>&gt; 40 mg/kg</td><td class="n">15-20</td></tr><tr><td>&gt; 100 mg/kg en Campo de Cartagena</td><td class="n">40</td></tr></table>
      <table class="t small" style="margin-top:8px"><tr><th>fB · leñosos</th><th class="n">1 línea</th><th class="n">2 líneas</th></tr><tr><td>Filas &lt; 5 m</td><td class="n">0,20-0,25</td><td class="n">0,40-0,50</td></tr><tr><td>Filas ≥ 5 m</td><td class="n">0,12-0,17</td><td class="n">0,24-0,34</td></tr></table>
      <table class="t small" style="margin-top:8px"><tr><th>Humus · MO %</th>${T.mo.puntos.map((x) => `<th class="n">${fmtIn(x)}</th>`).join('')}</tr>${['Arenoso', 'Franco', 'Arcilloso'].map((t) => `<tr><td>${t}</td>${T.mo[t].map((r) => `<td class="n">${r[0]}-${r[1]}</td>`).join('')}</tr>`).join('')}</table>
      <table class="t small" style="margin-top:8px"><tr><th>Estiércol</th><th class="n">N % s.m.s.</th><th class="n">Año 1</th><th class="n">Año 2</th><th class="n">Año 3</th></tr>${T.estiercol.map((e) => `<tr><td>${e.tipo}</td><td class="n">${fmtIn(e.n[0])}-${fmtIn(e.n[1])}</td>${e.min.map((x) => `<td class="n">${x} %</td>`).join('')}</tr>`).join('')}</table>
      <table class="t small" style="margin-top:8px"><tr><th>Extracción</th><th class="n">kg N/t</th></tr>${T.extraccion.map((e) => `<tr><td>${e.cultivo}</td><td class="n">${fmtIn(e.r[0])}-${fmtIn(e.r[1])}</td></tr>`).join('')}</table></div>
  </div></div>`;
  $('#aEq').onchange = (e) => { local.equipo = e.target.value.trim(); ALM.kvSet('equipo', local.equipo); renderEstado(); };
  $('#aRec').onclick = async () => { if (dirty && !confirm('Tienes cambios sin subir. ¿Recargar igualmente y perderlos?')) return; try { await recargar(); toast('Datos recargados de Drive'); } catch (e) { toast(e.message || String(e), true); } };
  $('#aNube').onclick = () => { conn = 'sin-nube'; renderAll(); };
  if ($('#aOd')) { $('#aOd').onclick = async () => { if (od === 'listo') { od = 'sin-carpeta'; } await conectarOneDrive(); renderAll(); }; $('#aImp').onclick = abrirImportar; $('#aV10').onclick = traerV10; }
  $('#aCamp').onclick = () => {
    if (!confirm(`¿Crear la campaña ${sig} en los ${db.planes.length} planes?`)) return;
    let n = 0; commit(() => { for (const p of db.planes) if (crearCampana(p, sig)) n++; }); ui.camp = sig; renderAll(); toast(`Campaña ${sig} creada en ${plural(n, 'plan', 'planes')}`);
  };
  $('#aMxOk').onclick = async () => {
    const url = $('#aMxU').value.trim(), clave = $('#aMxK').value.trim();
    if (!/^https:\/\/script\.google\.com\//.test(url)) { toast('La dirección debe empezar por https://script.google.com/', true); return; }
    try {
      const r = await postScript(url, clave, 'leer');
      if (!r.ok) throw new Error(r.error === 'clave' ? 'La clave no coincide con la del script' : (r.error || 'Error del script'));
      mxData = { clientes: r.clientes || [], fincas: r.fincas || [], productos: r.productos || [], fecha: r.fecha };
      IX = MX.indexar(mxData); await ALM.kvSet('mxData', mxData);
      commit((d) => { d.config.mx = { url, clave }; });
      toast(`Maestros leídos: ${mxData.clientes.length} clientes y ${mxData.fincas.length} fincas`);
    } catch (e) { toast(e.message || String(e), true); }
  };
  const enl = $('#aMxEnl');
  if ($('#aMxVer')) $('#aMxVer').onclick = () => { ui.vista = 'planes'; ui.filtro = 'sinenlace'; ui.q = ''; ui.tab = 'finca'; ui.planId = null; ui.verLista = true; renderAll(); };
  if (enl) enl.onclick = () => { let n = 0; commit((d) => { for (const p of d.planes) if (!p.mxFin && enlazarPlan(p, false)) n++; }); toast(`Enlazados ${plural(n, 'plan', 'planes')} más`); };
  $('#aLogo').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const url = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); }); logoCache = url; commit((d) => { d.config.logo = url; }); toast('Logo guardado'); };
  $('#aAutor').onchange = (e) => commit((d) => { d.config.autor = e.target.value.trim(); }, { render: false });
  $('#aPaApl').onchange = (e) => commit((d) => { d.config.planAnual.aplicacion = e.target.value.trim(); }, { render: false });
  enlazarProgramasAjustes(v);
  $('#aCampIni').onchange = (e) => { commit((d) => { d.config.campanaInicio = e.target.value; }, { render: false }); toast(e.target.value ? `La app se abrirá en la campaña ${e.target.value}` : 'La app se abrirá en la campaña más reciente'); };
  $$('[data-rd]', v).forEach((i) => i.onchange = () => commit((d) => { d.config.rd = d.config.rd || {}; d.config.rd[i.dataset.rd] = i.value.trim(); }, { render: false }));
  $('#aPaMed').onchange = (e) => commit((d) => { d.config.planAnual.medidas = e.target.value.trim(); }, { render: false });
  $('#aPieT').onchange = (e) => commit((d) => { d.config.pie.texto = e.target.value.trim(); }, { render: false });
  $('#aPieTel').onchange = (e) => commit((d) => { d.config.pie.telefono = e.target.value.trim(); }, { render: false });
  $('#aPieMail').onchange = (e) => commit((d) => { d.config.pie.email = e.target.value.trim(); }, { render: false });
  $('#aExp').onclick = () => { const b = new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `planes-abonado-copia-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  $('#aRes').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!d.planes || !d.analiticas) throw new Error('No es una copia de esta app');
      if (!confirm(`¿Sustituir todos los datos por la copia (${d.planes.length} planes)? Lo actual queda en la copia del día.`)) return;
      db = migrar(d); commit(() => {}); toast('Copia restaurada'); } catch (err) { toast(err.message, true); }
  };
  $$('[data-eto]', v).forEach((i) => i.onchange = () => commit((d) => { d.config.eto[+i.dataset.eto] = CALC.num(i.value) ?? 0; }, { render: false }));
  $$('[data-kcg]', v).forEach((i) => i.onchange = () => commit((d) => { const [g, k] = i.dataset.kcg.split('.'); d.config.kc[g] = (d.config.kc[g] || CALC.KC[g]).slice(); d.config.kc[g][+k] = CALC.num(i.value) ?? 0; }, { render: false }));
  $$('[data-cfg]', v).forEach((i) => i.onchange = () => commit((d) => { d.config[i.dataset.cfg] = CALC.num(i.value); }, { render: false }));
  $$('[data-cfga]', v).forEach((i) => i.onchange = () => commit((d) => { d.config.antiguedad[i.dataset.cfga] = CALC.num(i.value); }, { render: false }));
}

/* ---------- Maestros ---------- */
async function postScript(url, clave, accion, extra = {}, ms = 45000) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ accion, clave, ...extra }), signal: ctrl.signal });
    const txt = await res.text();
    try { return JSON.parse(txt); } catch (_) { throw new Error('La dirección no responde como el script (revisa que esté publicado para «Cualquier usuario»)'); }
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('Tiempo de espera agotado');
    if (e instanceof TypeError) throw new Error('Sin conexión con Google');
    throw e;
  } finally { clearTimeout(t); }
}
/* Busca cliente y finca del maestro por el nombre de las carpetas. Devuelve el texto enlazado o null. */
function enlazarPlan(p, forzar) {
  if (!IX) return null;
  let cli = p.mxCli && !forzar ? IX.cli.get(p.mxCli) : null;
  if (!cli) cli = MX.buscarCliente(IX, p.cliente) || MX.buscarCliente(IX, p.titular);
  if (!cli) return null;
  p.mxCli = cli.id;
  const fin = MX.buscarFinca(IX, p.finca, (f) => f.clienteId === cli.id);
  if (fin) p.mxFin = fin.id;
  return cli.nombre + (fin ? ' · ' + fin.nombre : '');
}

/* ---------- Importar Excels ---------- */
async function abrirImportar() {
  if (od === 'no-disponible') { toast('Los Excels se importan desde el ordenador', true); return; }
  if (!(await asegurarOneDrive())) return;
  const m = modal('Importar Excels de planes', '<p>Buscando Excels en <b>Clientes</b>… <span id="iCnt">0</span></p>', { ancho: true });
  let lista;
  try { lista = await ALM.listarExcels((n) => { const c = $('#iCnt'); if (c) c.textContent = n; }); }
  catch (e) { $('.cuerpo', m).innerHTML = `<p class="aviso alto">No se pudo leer la carpeta Clientes: ${esc(e.message || e)}</p>`; return; }
  const ids = new Set(db.planes.map((p) => p.origen && p.origen.ruta));
  const porCli = {};
  for (const x of lista) (porCli[x.ruta.split('/')[0]] = porCli[x.ruta.split('/')[0]] || []).push(x);
  $('.cuerpo', m).innerHTML = `<p>${plural(lista.length, 'Excel encontrado', 'Excels encontrados')}. Solo se leen: no se cambia nada en ellos.</p>
    <div class="row" style="margin-bottom:8px"><button class="btn peq" id="iTodos">Marcar todos</button><button class="btn peq" id="iNinguno">Ninguno</button><span class="spacer"></span>
    <label class="chk small"><input type="checkbox" id="iSust"> Volver a importar los ya importados (sustituye riego, analíticas y N del plan de esa campaña)</label></div>
    <div class="lista-imp">${Object.entries(porCli).map(([c, xs]) => `<div class="grupo-cli">${esc(c)}</div>${xs.map((x) => `<label><input type="checkbox" data-ruta="${esc(x.ruta)}" ${ids.has(x.ruta) ? '' : 'checked'}> ${esc(x.ruta.split('/').slice(1).join(' › '))} ${ids.has(x.ruta) ? '<span class="chip v">ya importado</span>' : ''}</label>`).join('')}`).join('')}</div>
    <div id="iProg" style="margin-top:12px" hidden><div class="prog"><i></i></div><p class="small muted" id="iTxt"></p></div>`;
  const pie = document.createElement('footer'); pie.innerHTML = '<button class="btn" data-cerrar>Cerrar</button><button class="btn p" id="iOk">Importar</button>'; m.appendChild(pie);
  $$('[data-cerrar]', m).forEach((b) => { b.onclick = cerrarModal; });
  $('#iTodos', m).onclick = () => $$('[data-ruta]', m).forEach((c) => { c.checked = true; });
  $('#iNinguno', m).onclick = () => $$('[data-ruta]', m).forEach((c) => { c.checked = false; });
  $('#iSust', m).onchange = (e) => { if (e.target.checked) $$('[data-ruta]', m).forEach((c) => { c.checked = true; }); };
  $('#iOk', m).onclick = async () => {
    const elegidos = $$('[data-ruta]:checked', m).map((c) => lista.find((x) => x.ruta === c.dataset.ruta));
    if (!elegidos.length) { toast('No hay ninguno marcado', true); return; }
    $('#iOk', m).disabled = true; $('#iProg', m).hidden = false;
    const leidos = [], errores = [];
    let logoPend = !logoCache;
    for (let i = 0; i < elegidos.length; i++) {
      const x = elegidos[i];
      $('#iTxt', m).textContent = `${i + 1}/${elegidos.length} · ${x.ruta}`; $('.prog i', m).style.width = ((i + 1) / elegidos.length * 100) + '%';
      try {
        const { buf } = await ALM.leerArchivo(x.h);
        const wb = XLSX.read(buf, { type: 'array', sheets: IMP.HOJAS, bookFiles: logoPend });
        if (logoPend && wb.files) {
          const jpgs = Object.keys(wb.files).filter((k) => /xl\/media\/.*\.jpe?g$/i.test(k)).sort((a, b) => wb.files[b].content.length - wb.files[a].content.length);
          if (jpgs.length) { try { const bl = new Blob([wb.files[jpgs[0]].content], { type: 'image/jpeg' }); logoCache = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(bl); }); } catch (_) { /* sin logo */ } }
          logoPend = false;
        }
        leidos.push(IMP.leerLibro(wb, x.ruta));
      } catch (e) { errores.push(`${x.ruta}: ${e.message || e}`); }
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    let res;
    commit((d) => { res = IMP.juntar(d, leidos, { sustituir: $('#iSust', m).checked, uid }); if (IX) for (const p of d.planes) if (!p.mxFin) enlazarPlan(p, false); if (logoCache && !d.config.logo) d.config.logo = logoCache; IMP.asegurarRepartos(d); asegurarFert(d); });
    const camps = campanas(); if (!camps.includes(ui.camp)) ui.camp = campanaInicio();
    const plantillas = db.analiticas.filter((a) => a.plantilla);
    $('.cuerpo', m).innerHTML = `<h3>Importación terminada</h3><ul>
      <li>${plural(res.nuevos, 'plan nuevo', 'planes nuevos')}${res.sustituidos ? `, ${res.sustituidos} sustituidos` : ''}${res.saltados ? `, ${res.saltados} ya estaban (no se tocan)` : ''}.</li>
      <li>${plural(res.analNuevas, 'analítica distinta', 'analíticas distintas')} (las copias iguales se guardan una sola vez).</li>
      ${plantillas.length ? `<li><b>${plural(plantillas.length, 'analítica marcada', 'analíticas marcadas')} como «de plantilla»</b>: la misma copiada en muchos planes. Revisa la sección Avisos.</li>` : ''}
      ${errores.length ? `<li class="rojo">${plural(errores.length, 'Excel no se pudo leer', 'Excels no se pudieron leer')}:<br><span class="small">${errores.map(esc).join('<br>')}</span></li>` : ''}</ul>`;
    pie.innerHTML = '<button class="btn p" data-cerrar>Ver los planes</button>';
    $$('[data-cerrar]', m).forEach((b) => { b.onclick = () => { cerrarModal(); ui.vista = 'planes'; renderAll(); }; });
    renderAll();
  };
}

arrancar();
