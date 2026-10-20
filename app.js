'use strict';
/* Planes de abonado · FG Agro — app de escritorio (Edge o Chrome en Windows).
   Fase 1: planes (fincas), analíticas compartidas, riego y balance de N con PDF estimado y cerrado.
   Los datos viven en OneDrive (carpeta «_App planes de abonado»), no en el código. */
const APP_VERSION = '1.0.0';
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
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
function haceTxt(iso) {
  if (!iso) return 'nunca'; const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'ahora'; if (s < 3600) return `hace ${Math.round(s / 60)} min`; if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return fechaEs(iso);
}

/* ---------- Estado ---------- */
let db = null;
let ui = { vista: 'planes', planId: null, tab: 'finca', q: '', filtro: 'todos', camp: null, analTipo: 'todas' };
let local = { equipo: '' };
let conn = 'iniciando'; // no-soportado | sin-carpeta | pedir-permiso | listo
let dirty = false, guardando = false, saveTimer = null, ultimoGuardado = null, errorGuardar = '';
let logoCache = null;
let mxData = null, IX = null;

function dbVacia() {
  return {
    version: 1, creado: new Date().toISOString(), guardado: null,
    config: { eto: CALC.ETO_MULA.slice(), kc: structuredClone(CALC.KC), antiguedad: { ...CALC.TABLAS.antiguedad }, limiteNOrganico: CALC.TABLAS.limiteNOrganico, autor: 'Francis Gabarrón · Gestión Agrícola', mx: { url: '', clave: '' } },
    planes: [], analiticas: []
  };
}
function migrar(d) {
  const v = dbVacia();
  d.config = { ...v.config, ...(d.config || {}) };
  d.config.kc = { ...v.config.kc, ...(d.config.kc || {}) };
  d.config.antiguedad = { ...v.config.antiguedad, ...(d.config.antiguedad || {}) };
  d.config.mx = d.config.mx || { url: '', clave: '' };
  d.planes = d.planes || []; d.analiticas = d.analiticas || [];
  return d;
}
const cfg = () => ({ eto: db.config.eto, kc: db.config.kc, tablas: { ...CALC.TABLAS, antiguedad: db.config.antiguedad, limiteNOrganico: +db.config.limiteNOrganico || 170 } });
const planSel = () => db && db.planes.find((p) => p.id === ui.planId) || null;
const anal = (id) => (id ? db.analiticas.find((a) => a.id === id) || null : null);
const campDe = (p) => (p && p.campanas ? p.campanas[ui.camp] : null);
function analDePlan(p) {
  return { suelo: anal(p.analSuelo), agua: anal(p.analAgua), estiercoles: Object.fromEntries(db.analiticas.filter((a) => a.tipo === 'estiercol').map((a) => [a.id, a])) };
}
function campanas() {
  const s = new Set(); for (const p of db.planes) for (const k of Object.keys(p.campanas || {})) s.add(k);
  return [...s].sort();
}

/* ---------- Guardar ---------- */
function commit(fn, { render = true } = {}) {
  fn(db);
  dirty = true; errorGuardar = '';
  clearTimeout(saveTimer); saveTimer = setTimeout(guardarAhora, 1200);
  if (render) renderAll(); else renderEstado();
}
async function guardarAhora(forzar = false) {
  if (!dirty || guardando || conn !== 'listo') return;
  guardando = true; renderEstado();
  try {
    db.guardado = { fecha: new Date().toISOString(), equipo: local.equipo || 'Este ordenador', version: APP_VERSION };
    await ALM.guardar(db, { forzar });
    dirty = false; ultimoGuardado = db.guardado.fecha; ocultarBanner();
  } catch (e) {
    if (e.code === 'conflicto') mostrarConflicto();
    else { errorGuardar = e.message || String(e); toast('No se pudo guardar: ' + errorGuardar, true); }
  } finally { guardando = false; renderEstado(); }
}
function mostrarConflicto() {
  banner(`<b>El otro ordenador ha guardado cambios</b> mientras tenías la app abierta. <span class="muted">Si guardas lo tuyo, se pierde lo que hizo el otro.</span>
    <span class="spacer"></span><button class="btn peq" id="bnRecargar">Cargar lo del otro (pierdo lo último mío)</button><button class="btn peq rojo" id="bnForzar">Guardar lo mío encima</button>`, true);
  $('#bnRecargar').onclick = async () => { dirty = false; await recargar(); ocultarBanner(); toast('Datos cargados del otro ordenador'); };
  $('#bnForzar').onclick = async () => { await guardarAhora(true); };
}
async function recargar() {
  const d = await ALM.cargar();
  db = migrar(d || dbVacia());
  if (!ui.camp || !campanas().includes(ui.camp)) ui.camp = campanas().slice(-1)[0] || String(new Date().getFullYear());
  renderAll();
}
window.addEventListener('beforeunload', (e) => { if (dirty) { guardarAhora(); e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || conn !== 'listo') return;
  try {
    if (await ALM.cambiadoFuera()) { if (dirty) mostrarConflicto(); else { await recargar(); toast('Datos actualizados desde el otro ordenador'); } }
  } catch (_) { /* sin acceso */ }
});

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
  conn = await ALM.iniciar();
  if (conn === 'listo') await abrir(); else renderAll();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
async function abrir() {
  try {
    const d = await ALM.cargar();
    db = migrar(d || dbVacia());
    ultimoGuardado = db.guardado && db.guardado.fecha;
    conn = 'listo';
    ui.camp = campanas().slice(-1)[0] || String(new Date().getFullYear());
    if (mxData) IX = MX.indexar(mxData);
    logoCache = await ALM.logo();
    const otro = await ALM.usoOtro(local.equipo);
    if (otro) banner(`<b>Ojo:</b> la app parece abierta en <b>${esc(otro.equipo)}</b> (${haceTxt(otro.latido)}). Trabaja en un solo ordenador a la vez para no pisar cambios.`);
    ALM.marcarUso(local.equipo || 'Este ordenador');
    if (!window.__latido) window.__latido = setInterval(() => { if (conn === 'listo') ALM.marcarUso(local.equipo || 'Este ordenador'); }, 60000);
  } catch (e) {
    conn = 'error'; errorGuardar = e.message || String(e);
  }
  renderAll();
}

/* ---------- Pintar ---------- */
function renderEstado() {
  const b = $('#estado');
  if (conn !== 'listo') { b.textContent = conn === 'no-soportado' ? 'Navegador no compatible' : 'Sin carpeta de datos'; b.className = 'estado mal'; return; }
  let t = `OneDrive · ${ALM.nombreRaiz()}`;
  if (guardando) t += ' · guardando…';
  else if (errorGuardar) t += ' · ERROR al guardar';
  else if (dirty) t += ' · cambios sin guardar';
  else if (ultimoGuardado) t += ` · guardado ${haceTxt(ultimoGuardado)}`;
  if (local.equipo) t += ` · ${local.equipo}`;
  b.textContent = t; b.className = 'estado' + (errorGuardar ? ' mal' : '');
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
    const conAlto = db.planes.filter((p) => avisosDe(p).some((a) => a.nivel === 'alto')).length;
    $('#nAvisos').textContent = conAlto || '';
  }
  $$('.nav').forEach((b) => { b.setAttribute('aria-current', b.dataset.vista === ui.vista ? 'page' : 'false'); b.onclick = () => { ui.vista = b.dataset.vista; renderAll(); }; });
  const v = $('#view');
  if (!listo) { v.innerHTML = pantallaConexion(); enlazarConexion(); return; }
  if (ui.vista === 'planes') renderPlanes(v);
  else if (ui.vista === 'analiticas') renderAnaliticas(v);
  else if (ui.vista === 'avisos') renderAvisos(v);
  else renderAjustes(v);
}

/* ---------- Conexión con la carpeta ---------- */
function pantallaConexion() {
  if (conn === 'no-soportado') return `<div class="card vacio"><h2>Abre la app con Edge o Chrome</h2><p>Para guardar los datos y los PDF en tu OneDrive, la app necesita Microsoft Edge o Google Chrome en el ordenador.</p></div>`;
  if (conn === 'error') return `<div class="card vacio"><h2>No se pudo leer la carpeta de datos</h2><p>${esc(errorGuardar)}</p><button class="btn p" id="cxElegir">Elegir otra vez la carpeta</button></div>`;
  if (conn === 'pedir-permiso') return `<div class="card vacio"><h2>Conectar con OneDrive</h2><p>Por seguridad, el navegador pide permiso cada vez que abres la app para usar la carpeta <b>${esc(ALM.nombreRaiz())}</b>.</p><button class="btn p" id="cxPermiso">Permitir el acceso</button><p class="small" style="margin-top:14px"><button class="link" id="cxElegir">Usar otra carpeta</button></p></div>`;
  return `<div class="card vacio"><h2>Elige tu carpeta «Asesoramiento agrícola»</h2>
    <p>Es la carpeta de OneDrive que tiene dentro <b>Clientes</b>. La app guardará sus datos en una subcarpeta nueva <code>${ALM.CARPETA_APP}</code> y los PDF en la carpeta de cada cliente y finca. Así los dos ordenadores ven lo mismo.</p>
    <label class="fld" style="max-width:320px;margin:0 auto 16px;text-align:left"><span>Nombre de este ordenador</span><input id="cxEquipo" placeholder="p. ej. Oficina o Casa" value="${esc(local.equipo)}"></label>
    <button class="btn p" id="cxElegir">Elegir carpeta</button></div>`;
}
function enlazarConexion() {
  const eq = $('#cxEquipo'); if (eq) eq.onchange = () => { local.equipo = eq.value.trim(); ALM.kvSet('equipo', local.equipo); };
  const el = $('#cxElegir');
  if (el) el.onclick = async () => {
    if (eq) { local.equipo = eq.value.trim(); await ALM.kvSet('equipo', local.equipo); }
    try {
      const r = await ALM.elegirCarpeta();
      if (!r.tieneClientes && !confirm(`La carpeta «${r.nombre}» no tiene dentro una carpeta «Clientes». ¿Usarla igualmente?`)) return;
      await abrir();
    } catch (e) { if (e.name !== 'AbortError') toast(e.message || String(e), true); }
  };
  const pe = $('#cxPermiso');
  if (pe) pe.onclick = async () => { if (await ALM.reconectar()) await abrir(); else toast('Sin permiso no se pueden leer los datos', true); };
}

/* ---------- PLANES ---------- */
function renderPlanes(v) {
  if (!db.planes.length) {
    v.innerHTML = `<div class="card vacio"><h2>Todavía no hay planes</h2><p>Importa tus Excels «Gestion Fertirrigacion v5» de la carpeta Clientes. La app lee las analíticas, el riego y el balance de N de cada uno, sin tocarlos.</p>
      <div class="row" style="justify-content:center"><button class="btn p" id="vImp">Importar mis Excels</button><button class="btn" id="vNuevo">Crear un plan a mano</button></div></div>`;
    $('#vImp').onclick = abrirImportar; $('#vNuevo').onclick = nuevoPlan; return;
  }
  const q = CALC.norm(ui.q);
  const conAv = db.planes.map((p) => ({ p, av: avisosDe(p) }));
  const lista = conAv.filter(({ p, av }) => {
    if (q && !CALC.norm([p.nombre, p.cliente, p.finca, p.cultivo, p.tipoCultivo].join(' ')).includes(q)) return false;
    if (ui.filtro === 'avisos' && !av.some((a) => a.nivel === 'alto')) return false;
    if (ui.filtro === 'vulnerable' && !p.vulnerable) return false;
    if (ui.filtro === 'sincamp' && campDe(p)) return false;
    return true;
  }).sort((a, b) => (a.p.cliente || '').localeCompare(b.p.cliente || '', 'es') || (a.p.nombre || '').localeCompare(b.p.nombre || '', 'es'));
  if (!ui.planId || !db.planes.some((p) => p.id === ui.planId)) ui.planId = (lista[0] || conAv[0]).p.id;
  let html = '', cli = null;
  for (const { p, av } of lista) {
    if (p.cliente !== cli) { cli = p.cliente; html += `<div class="grupo-cli">${esc(cli || 'Sin cliente')}</div>`; }
    html += `<button class="item" data-plan="${p.id}" aria-current="${p.id === ui.planId}"><span class="dot ${nivelPlan(av)}"></span><span class="t"><b>${esc(p.nombre)}</b><span>${esc(p.finca)} · ${esc(p.tipoCultivo || p.cultivo)}</span></span>${p.vulnerable ? '<span class="chip amb" title="Zona vulnerable">ZV</span>' : ''}</button>`;
  }
  const filtros = [['todos', 'Todos'], ['avisos', 'Con avisos'], ['vulnerable', 'Zona vulnerable'], ['sincamp', 'Sin campaña ' + ui.camp]];
  v.innerHTML = `<div class="planes">
    <div class="card lista"><div class="busca"><div class="row"><input id="pq" type="search" placeholder="Buscar plan, cliente, finca…" value="${esc(ui.q)}" style="flex:1"><button class="btn peq" id="pNuevo" title="Nuevo plan">+ Nuevo</button></div>
      <div class="filtros">${filtros.map(([k, t]) => `<button data-f="${k}" aria-pressed="${ui.filtro === k}">${esc(t)}</button>`).join('')}</div>
      <div class="small muted">${plural(lista.length, 'plan', 'planes')}</div></div>
      <div class="items">${html || '<p class="muted small" style="padding:14px">Ningún plan con ese filtro.</p>'}</div></div>
    <div id="detalle"></div></div>`;
  const pq = $('#pq'); pq.oninput = () => { ui.q = pq.value; const pos = pq.selectionStart; renderPlanes(v); const n = $('#pq'); n.focus(); n.setSelectionRange(pos, pos); };
  $$('[data-f]', v).forEach((b) => { b.onclick = () => { ui.filtro = b.dataset.f; renderPlanes(v); }; });
  $$('[data-plan]', v).forEach((b) => { b.onclick = () => { ui.planId = b.dataset.plan; renderPlanes(v); }; });
  $('#pNuevo').onclick = nuevoPlan;
  renderDetalle($('#detalle'));
  const act = $('.item[aria-current="true"]', v); if (act) act.scrollIntoView({ block: 'nearest' });
}

function renderDetalle(el) {
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
  const tabs = [['finca', 'Finca'], ['analiticas', 'Analíticas'], ['riego', 'Riego'], ['balance', 'Balance N']];
  el.innerHTML = `<div class="card"><div class="cab"><div class="t"><h2>${esc(p.nombre)}</h2>
      <div class="muted">${esc(p.cliente)} › ${esc(p.finca)} · ${esc(p.cultivo)} · ${fmt(p.superficie, 2)} ha · ${fmt(p.arboles, 0)} árboles</div>
      <div class="row" style="margin-top:6px">${p.vulnerable ? '<span class="chip amb">Zona vulnerable</span>' : '<span class="chip">No vulnerable</span>'}<span class="chip">${esc(p.grupo)}</span>${p.tipoCultivo ? `<span class="chip v">${esc(p.tipoCultivo)}</span>` : '<span class="chip amb">Sin tipo de cultivo</span>'}${p.mxFin ? `<span class="chip v" title="Enlazado con el maestro de fincas">${esc(p.mxFin)}</span>` : ''}</div></div></div>
    ${camp ? kp : `<div class="aviso alto" style="margin-top:12px"><span>Este plan no tiene datos de la campaña <b>${esc(ui.camp)}</b>.</span><span class="spacer"></span>${Object.keys(p.campanas || {}).length ? `<button class="btn peq" id="dCrear">Crearla copiando de ${esc(Object.keys(p.campanas).sort().slice(-1)[0])}</button>` : `<button class="btn peq" id="dCrear">Crearla vacía</button>`}</div>`}
    ${av.length ? `<details style="margin-top:12px" ${av.some((a) => a.nivel === 'alto') ? 'open' : ''}><summary class="small muted" style="cursor:pointer">Ver avisos (${av.length})</summary><div style="margin-top:8px">${av.map((a) => `<div class="aviso ${a.nivel}"><span class="dot ${a.nivel}" style="margin-top:6px"></span><span>${esc(a.txt)}</span></div>`).join('')}</div></details>` : ''}
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${t}${nAv(k) ? `<span class="c">${nAv(k)}</span>` : ''}</button>`).join('')}</div>
    <div id="tabBody"></div></div>`;
  $$('[data-tab]', el).forEach((b) => { b.onclick = () => { ui.tab = b.dataset.tab; renderDetalle(el); }; });
  const dc = $('#dCrear', el); if (dc) dc.onclick = () => { commit(() => crearCampana(p, ui.camp)); toast('Campaña ' + ui.camp + ' creada'); };
  const body = $('#tabBody', el);
  if (ui.tab === 'finca') tabFinca(body, p);
  else if (ui.tab === 'analiticas') tabAnaliticas(body, p, camp);
  else if (ui.tab === 'riego') tabRiego(body, p, camp);
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
    ajustes: prev ? structuredClone(prev.ajustes || {}) : {}, pdf: {}, desde: prevKey || null
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
    commit((d) => { d.planes = d.planes.filter((x) => x.id !== p.id); ui.planId = null; }); toast('Plan borrado');
  };
  const fa = $('#fAuto', el);
  if (fa) fa.onclick = () => { const r = enlazarPlan(p, true); commit(() => {}, { render: false }); renderDetalleSoloCuerpo(); toast(r ? 'Enlazado con ' + r : 'No se encontró por nombre: elígelo en la lista', !r); };
  ALM.existeCarpetaCliente(p.carpeta).then((ok) => { const s = $('#fCarp'); if (s && !ok) s.innerHTML += ' <span class="chip amb">esa carpeta no existe: se creará con el primer PDF</span>'; });
}

/* ----- Pestaña Analíticas del plan ----- */
const RANGOS = { pctK: [0.025, 0.05], pctCa: [0.7, 0.75], pctMg: [0.08, 0.15] };
function opcionesAnal(tipo, sel) {
  const l = db.analiticas.filter((a) => a.tipo === tipo).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return `<option value="">— Sin analítica —</option>` + l.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.nombre)} · ${fechaEs(a.fecha)}${a.ref ? ' · ' + esc(a.ref) : ''}${a.plantilla ? ' · PLANTILLA' : ''}</option>`).join('');
}
function usos(a) { return db.planes.filter((p) => p.analSuelo === a.id || p.analAgua === a.id || Object.values(p.campanas || {}).some((c) => (c.estiercoles || []).some((e) => e.analId === a.id))); }
function resumenSuelo(a) {
  if (!a) return '<p class="muted small">Sin analítica de suelo.</p>';
  const r = CALC.suelo(a), v = a.v || {};
  const pc = (x, rg) => (x == null ? '–' : `<span class="${x < rg[0] || x > rg[1] ? 'chip amb' : 'chip v'}">${fmt(x * 100, 1)} %</span>`);
  return `${a.plantilla ? '<div class="aviso alto">Es la analítica de la plantilla, copiada en muchos Excels: no es de esta finca.</div>' : ''}
    <table class="t" style="margin-top:8px"><tr><th>Fecha</th><th>Ref.</th><th>Textura</th><th class="n">CE</th><th class="n">pH</th><th class="n">MO %</th><th class="n">NO3 mg/kg</th></tr>
    <tr><td>${fechaEs(a.fecha)}</td><td>${esc(a.ref || '–')}</td><td>${esc(v.textura || '–')}</td><td class="n">${fmt(v.ce, 2)}</td><td class="n">${fmt(v.ph, 1)}</td><td class="n">${fmt(v.mo, 2)}</td><td class="n">${fmt(v.no3, 0)}</td></tr></table>
    <table class="t" style="margin-top:8px"><tr><th></th><th class="n">mg/kg</th><th class="n">meq/100 g</th><th class="n">% bases</th><th>Ideal</th></tr>
    ${[['K', 'k', 'pctK', '2,5-5 %'], ['Ca', 'ca', 'pctCa', '70-75 %'], ['Mg', 'mg', 'pctMg', '8-15 %'], ['Na', 'na', null, '']].map(([t, k, pk, id]) => `<tr><td><b>${t}</b></td><td class="n">${fmt(v[k], 0)}</td><td class="n">${fmt(r.meq[k], 2)}</td><td class="n">${pk ? pc(r[pk], RANGOS[pk]) : ''}</td><td class="muted small">${id}</td></tr>`).join('')}</table>
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
    <tr><td>Bicarbonatos HCO3</td><td></td><td class="n">${fmt(v.hco3, 2)}</td><td>Boro (mg/L)</td><td class="n">${fmt(v.b, 2)}</td></tr></table>`;
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
    campos = `<div class="grid4">
      <label class="fld"><span>Textura</span><select data-avt="textura">${['Arenosa', 'Franca', 'Arcillosa'].map((t) => `<option ${CALC.texturaTabla(v.textura) === CALC.texturaTabla(t) && v.textura ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${f('Densidad (g/cm³)', 'densidad', v.densidad)}${f('CE (mS/cm)', 'ce', v.ce)}${f('pH', 'ph', v.ph)}
      ${f('Materia orgánica (%)', 'mo', v.mo)}${f('Nitratos NO3 (mg/kg)', 'no3', v.no3)}</div>
      <h3 style="margin-top:14px">Cationes</h3><div class="grid4">${['k', 'ca', 'mg', 'na'].map((k) => `<label class="fld"><span>${{ k: 'Potasio (K)', ca: 'Calcio (Ca)', mg: 'Magnesio (Mg)', na: 'Sodio (Na)' }[k]} ${unidad(k)}</span><input data-av="${k}" value="${esc(fmtIn(v[k]))}"></label>`).join('')}</div>`;
  } else if (a.tipo === 'agua') {
    campos = `<div class="grid4">${f('CE (dS/m)', 'ce', v.ce)}${f('pH', 'ph', v.ph)}${f('Nitratos NO3 (mg/L)', 'no3', v.no3)}${f('Fósforo P (mg/L)', 'p', v.p)}
      ${f('Potasio K (mg/L)', 'k', v.k)}${f('Calcio Ca (mg/L)', 'ca', v.ca)}${f('Magnesio Mg (mg/L)', 'mg', v.mg)}${f('Sodio Na (mg/L)', 'na', v.na)}
      ${f('Sulfatos SO4 (mg/L)', 'so4', v.so4)}${f('Cloruros Cl (mg/L)', 'cl', v.cl)}${f('Bicarbonatos HCO3 (meq/L)', 'hco3', v.hco3)}${f('Boro B (mg/L)', 'b', v.b)}</div>`;
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
      <label class="fld" style="grid-column:span 2"><span>Laboratorio</span><input data-am="lab" value="${esc(a.lab || '')}"></label>
      <label class="fld" style="grid-column:span 2"><span>Notas</span><input data-am="notas" value="${esc(a.notas || '')}"></label>
    </div><div style="margin-top:12px">${campos}</div>
    ${a.tipo !== 'estiercol' ? `<label class="chk" style="margin-top:12px"><input type="checkbox" data-am="plantilla" ${a.plantilla ? 'checked' : ''}> Es de plantilla (no es real de ninguna finca)</label>` : ''}
    ${enlaces}`,
  { pie: `${!nueva ? '<button class="btn rojo" id="mDel">Borrar</button><span class="spacer"></span>' : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn p" id="mOk">Guardar</button>`, ancho: true });
  $$('[data-cerrar]', m).forEach((b) => { b.onclick = cerrarModal; });
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
  const uf = camp.ufAplicadas || CALC.MESES.map(() => [0, 0, 0, 0, 0]);
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
        <div class="row" style="margin-top:10px"><button class="btn p" id="bPdfE">PDF estimado</button><span class="small muted">${pdfE ? `Último: ${fechaEs(pdfE.fecha)} · ${fmt(pdfE.aporte, 1)} kg N/ha` : 'Aún sin PDF'}</span></div></div>
      <div><h3>Cerrado · fin de campaña</h3>${tablaBalance(bC)}
        <div class="row" style="margin-top:10px"><button class="btn p" id="bPdfC">PDF cerrado</button><span class="small muted">${pdfC ? `Último: ${fechaEs(pdfC.fecha)}` : 'Aún sin PDF'}</span></div></div>
    </div>
    ${p.vulnerable ? `<div class="aviso ${bE.excedeOrg ? 'alto' : 'bajo'}" style="margin-top:12px">Zona vulnerable · N orgánico total aplicado: <b>${fmt(bE.nOrgTotal, 1)} kg N/ha</b> (límite ${fmt(cfg().tablas.limiteNOrganico, 0)}).</div>` : ''}
    <h3 style="margin-top:20px">N del plan de fertirrigación (kg UF/ha)</h3>
    <p class="small muted">${ex ? 'Importado del Excel. En la fase 3 se calculará solo con los productos de cada mes.' : 'Se calculará con los productos de cada mes en la fase 3. Mientras, puedes escribirlo.'}</p>
    <div class="scroll-x"><table class="t"><tr><th></th>${CALC.MESES.map((m) => `<th class="n">${m.slice(0, 3)}</th>`).join('')}<th class="n">Total</th></tr>
      ${['N', 'P2O5', 'K2O', 'CaO', 'MgO'].map((nu, j) => `<tr><td><b>${nu}</b></td>${uf.map((m, i) => `<td><input class="cell" data-uf="${i}.${j}" value="${fmtIn(m && m[j] ? Math.round(m[j] * 10) / 10 : '')}"></td>`).join('')}<td class="n"><b>${fmt(uf.reduce((t, m) => t + (+(m && m[j]) || 0), 0), 1)}</b></td></tr>`).join('')}</table></div>
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
  try {
    const blob = PDF.balance({ plan: p, campKey: ui.camp, b, bEst, anal: { suelo: A.suelo, agua: A.agua, estiercoles: ests }, logo: logoCache, autor: db.config.autor });
    const nombre = `Balance N ${p.nombre} ${ui.camp} ${modo === 'cerrado' ? 'Cerrado' : 'Estimado'}.pdf`;
    const ruta = await ALM.guardarPDF(p.carpeta || ((p.cliente || 'Sin cliente') + '/' + (p.finca || 'Sin finca')), nombre, blob);
    commit(() => {
      camp.pdf = camp.pdf || {};
      camp.pdf[modo] = { fecha: new Date().toISOString(), ruta, aporte: b.aporte, dosisRiego: b.dosisRiego, prod: b.prod, entradas: b.entradas, nAplicado: b.nAplicado };
    }, { render: false });
    renderDetalleSoloCuerpo();
    const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('PDF guardado en ' + ruta);
  } catch (e) { toast('No se pudo crear el PDF: ' + (e.message || e), true); }
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
    if (base) { const k = Object.keys(base.campanas || {}).sort().slice(-1)[0]; p.campanas = {}; if (k) { p.campanas[ui.camp] = structuredClone(base.campanas[k]); Object.assign(p.campanas[ui.camp], { ufAplicadas: CALC.MESES.map(() => [0, 0, 0, 0, 0]), estiercoles: [], pdf: {}, excel: null, produccionReal: null, dosisRealM3: null }); } }
    if (!p.campanas[ui.camp]) crearCampana(p, ui.camp);
    p.campanaActual = ui.camp;
    if (IX) enlazarPlan(p, false);
    commit((d) => { d.planes.push(p); ui.planId = p.id; ui.tab = 'finca'; ui.vista = 'planes'; });
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
  $$('[data-ap]', v).forEach((r) => { r.onclick = () => { const p = db.planes.find((x) => x.id === r.dataset.ap); const a = avisosDe(p)[0]; ui.planId = p.id; ui.tab = a ? a.donde : 'finca'; ui.vista = 'planes'; renderAll(); }; });
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
    <div class="card"><h3>Carpeta de datos</h3>
      <p class="small">Carpeta: <b>${esc(ALM.nombreRaiz())}</b> → <code>${ALM.CARPETA_APP}/datos.json</code> (copia diaria en <code>copias</code>).</p>
      <div class="grid2"><label class="fld"><span>Nombre de este ordenador</span><input id="aEq" value="${esc(local.equipo)}" placeholder="Oficina, Casa…"></label>
      <div class="fld"><span>&nbsp;</span><button class="btn" id="aCarp">Cambiar de carpeta</button></div></div>
      <p class="small muted">Guardado: ${db.guardado ? `${fechaEs(db.guardado.fecha)} ${new Date(db.guardado.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} desde ${esc(db.guardado.equipo)}` : 'aún no'}.</p></div>
    <div class="card"><h3>Importar los Excels</h3>
      <p class="small">Busca los <code>Gestion Fertirrigacion v5*.xlsm</code> en <b>Clientes</b> (sin ZZ_PAPELERA ni ZZ_Plantillas). Solo los lee: no cambia nada en ellos.</p>
      <button class="btn p" id="aImp">Buscar e importar</button></div>
    <div class="card"><h3>Campañas</h3>
      <p class="small">Campañas con datos: ${cs.map(esc).join(', ') || '–'}. Al crear una nueva se copian de la anterior el riego, la producción y los ajustes; el N del plan y los estiércoles empiezan vacíos.</p>
      <button class="btn" id="aCamp">Crear la campaña ${sig} en todos los planes</button></div>
    <div class="card"><h3>Maestros (Drive › Apps › Maestros)</h3>
      <p class="small muted">La misma dirección y clave que en Ventas o Asesor. Sirve para enlazar cada plan con su cliente y finca del maestro (lo usará la marca de «enviado» en Asesor).</p>
      <div class="grid2"><label class="fld"><span>Dirección del script (…/exec)</span><input id="aMxU" value="${esc(mxCfg.url || '')}"></label><label class="fld"><span>Clave</span><input id="aMxK" type="password" value="${esc(mxCfg.clave || '')}"></label></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="aMxOk">Probar y leer</button>${IX ? `<button class="btn" id="aMxEnl">Enlazar planes por nombre</button><span class="small muted">${mxData.clientes.length} clientes · ${mxData.fincas.length} fincas · ${sinEnlace} planes sin enlazar</span>` : ''}</div></div>
    <div class="card"><h3>Informe PDF</h3>
      <div class="row">${logoCache ? `<img src="${logoCache}" alt="Logo" style="height:42px;border:1px solid var(--line);border-radius:6px;padding:3px;background:#fff">` : '<span class="small muted">Sin logo (se toma del primer Excel al importar).</span>'}<label class="btn peq">Cambiar logo<input type="file" id="aLogo" accept="image/png,image/jpeg" hidden></label></div>
      <label class="fld" style="margin-top:10px"><span>Pie del informe</span><input id="aAutor" value="${esc(c.autor || '')}"></label></div>
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
  $('#aCarp').onclick = async () => { try { await guardarAhora(); await ALM.elegirCarpeta(); await abrir(); } catch (e) { if (e.name !== 'AbortError') toast(e.message, true); } };
  $('#aImp').onclick = abrirImportar;
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
  if (enl) enl.onclick = () => { let n = 0; commit((d) => { for (const p of d.planes) if (!p.mxFin && enlazarPlan(p, false)) n++; }); toast(`Enlazados ${plural(n, 'plan', 'planes')} más`); };
  $('#aLogo').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; await ALM.guardarLogo(f, /png$/i.test(f.type) ? 'png' : 'jpg'); logoCache = await ALM.logo(); renderAll(); toast('Logo guardado'); };
  $('#aAutor').onchange = (e) => commit((d) => { d.config.autor = e.target.value.trim(); }, { render: false });
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
          if (jpgs.length) { try { await ALM.guardarLogo(new Blob([wb.files[jpgs[0]].content], { type: 'image/jpeg' }), 'jpg'); logoCache = await ALM.logo(); } catch (_) { /* sin logo */ } }
          logoPend = false;
        }
        leidos.push(IMP.leerLibro(wb, x.ruta));
      } catch (e) { errores.push(`${x.ruta}: ${e.message || e}`); }
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    let res;
    commit((d) => { res = IMP.juntar(d, leidos, { sustituir: $('#iSust', m).checked, uid }); if (IX) for (const p of d.planes) if (!p.mxFin) enlazarPlan(p, false); });
    const camps = campanas(); if (!camps.includes(ui.camp)) ui.camp = camps.slice(-1)[0];
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
