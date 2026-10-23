'use strict';
/* Planes de abonado · FG Agro — sección Registros (1.6): registro de fertilización y de riego, plan de abonado anual
   (RD 1051/2022 de nutrición sostenible) y productos para pedidos, para un intervalo de meses.
   Usa lo que define app.js (db, ui, CALC, FERT, PDF, ALM, NUBE, cfg, ixProd, analDePlan…): se llama solo cuando la app ya ha arrancado. */
const TIPOS_REG = [
  ['fert', 'Registro de fertilización', 'Cada aporte de fertilizante: fecha, producto, tipo, riqueza, dosis y UF, con el acumulado y lo recomendado por el plan (cuaderno de explotación).'],
  ['riego', 'Registro de riego', 'Días, nº de riegos, horas y m³/ha de cada mes, con el acumulado y la necesidad calculada.'],
  ['plan', 'Plan de abonado anual', 'El plan de la campaña: analíticas, balance de N, necesidades, reparto mensual, fertilizantes, forma de aplicación y medidas (RD 1051/2022).'],
  ['pedidos', 'Productos para pedidos', 'Cantidad de cada producto en el intervalo, en total y por cliente.']
];
const TEXTO_APLICACION = 'Fertirrigación por riego localizado (goteo), con equipo de inyección en el cabezal de riego y depósitos separados según la compatibilidad de los productos.';
const TEXTO_MEDIDAS = 'Aplicación localizada y fraccionada a lo largo de la campaña según las necesidades del cultivo; fertilizantes disueltos en el agua de riego, sin aplicación sobre la superficie del suelo; dosis ajustadas al balance de nitrógeno y a las analíticas de suelo y agua; uso preferente de formas nítricas frente a la urea y las formas amoniacales.';

function rangosDias(dias) {
  if (!dias.length) return '–';
  const out = []; let a = dias[0], b = dias[0];
  for (const d of dias.slice(1).concat([null])) { if (d === b + 1) { b = d; continue; } out.push(a === b ? String(a) : b === a + 1 ? `${a}, ${b}` : `${a}–${b}`); a = b = d; }
  return out.join(', ');
}
function fechaLinea(cal, periodo, riegos, i) {
  const mm = String(i + 1).padStart(2, '0'), f = (d) => `${String(d).padStart(2, '0')}/${mm}`;
  const dias = cal.dias;
  if (!dias.length) return `${f(1)}–${f(cal.total)}`;
  const p = CALC.norm(periodo || '');
  let sel = dias;
  if (/inicio|principio/.test(p)) sel = [dias[0]];
  else if (/mitad|medi/.test(p)) sel = [dias.reduce((a, d) => (Math.abs(d - 15) < Math.abs(a - 15) ? d : a), dias[0])];
  else if (/final|fin de/.test(p)) sel = [dias[dias.length - 1]];
  else if (/(1|primera).*quincena/.test(p)) sel = dias.filter((d) => d <= 15);
  else if (/(2|segunda).*quincena/.test(p)) sel = dias.filter((d) => d > 15);
  if (!sel.length) sel = dias;
  if ((+riegos || 0) <= 1 && sel.length > 1) sel = [sel[0]];
  return sel.length === 1 ? f(sel[0]) : `${f(sel[0])}–${f(sel[sel.length - 1])}`;
}
function tipoProducto(pr) {
  if (!pr) return '–';
  if (pr.tanque !== 'E') return 'Mineral';
  return { organico: 'Orgánico', micro: 'Corrector de carencias', bio: 'Bioestimulante' }[pr.familia] || 'Especial';
}
function mesesIntervalo(r) {
  const out = []; let c = +r.desdeC, i = +r.desdeM; const hc = +r.hastaC, hi = +r.hastaM;
  for (let n = 0; n < 60 && (c < hc || (c === hc && i <= hi)); n++) { out.push({ camp: String(c), i }); i++; if (i > 11) { i = 0; c++; } }
  return out;
}
const etiquetaMes = (x) => `${CALC.MESES[x.i]} ${x.camp}`;
const textoIntervalo = (ms) => (ms.length ? (ms.length === 1 ? etiquetaMes(ms[0]) : `${etiquetaMes(ms[0])} – ${etiquetaMes(ms[ms.length - 1])}`) : '');
const cabPlan = (p, camps) => [['Titular', p.titular || p.cliente], ['Unidad de producción', p.nombre], ['Finca', p.finca], ['Recintos SIGPAC', p.recintos || '–'], ['Superficie', `${fmt(p.superficie, 2)} ha`],
  ['Cultivo', p.cultivo || p.tipoCultivo], ['Nº de árboles', fmt(p.arboles, 0)], ['Zona vulnerable', p.vulnerable ? 'Sí' : 'No'], ['Sistema de riego', 'Localizado (goteo)'], ['Campaña', camps]];

function datosRegFert(p, meses) {
  const ix = ixProd(), sup = +p.superficie || 0, out = [];
  let tot = [0, 0, 0];
  const acumCamp = {};
  for (const x of meses) {
    const camp = p.campanas && p.campanas[x.camp]; if (!camp) continue;
    if (!acumCamp[x.camp]) { acumCamp[x.camp] = [0, 0, 0]; for (let k = 0; k < x.i; k++) { const u = FERT.mes(p, camp, k, ix).uf; for (let j = 0; j < 3; j++) acumCamp[x.camp][j] += +u[j] || 0; } }
    const m = FERT.mes(p, camp, x.i, ix), cal = FERT.calendario(p, camp, x.camp, x.i);
    const rep = db.repartos.find((r) => r.id === p.reparto) || null;
    const nc = CALC.necesidades(p, camp, analDePlan(p), cfg(), rep);
    const lineas = m.lineas.filter((l) => l.w > 0).map((l) => {
      const pr = l.prod, riq = pr ? `${fmt(pr.riq.n, pr.riq.n % 1 ? 1 : 0)}-${fmt(pr.riq.p2o5, pr.riq.p2o5 % 1 ? 1 : 0)}-${fmt(pr.riq.k2o, pr.riq.k2o % 1 ? 1 : 0)}` : '–';
      return { fecha: fechaLinea(cal, l.periodo, l.riegos, x.i), producto: pr ? pr.nombre : l.nombre, tipo: tipoProducto(pr), riqueza: riq, dosis: `${fmt(l.w, 1)} ${l.liquido ? 'L' : 'kg'}/ha`, total: `${fmt(l.w * sup, 1)} ${l.liquido ? 'L' : 'kg'}`, uf: [l.uf.n, l.uf.p2o5, l.uf.k2o] };
    });
    const uf = [0, 1, 2].map((j) => +m.uf[j] || 0);
    for (let j = 0; j < 3; j++) { acumCamp[x.camp][j] += uf[j]; tot[j] += uf[j]; }
    if (lineas.length) out.push({ etiqueta: etiquetaMes(x), lineas, uf, acum: acumCamp[x.camp].slice(), obj: nc.mensual ? nc.mensual[x.i].slice(0, 3) : null });
  }
  const ultima = [...meses].reverse().find((x) => p.campanas && p.campanas[x.camp]);
  const b = ultima ? CALC.balanceN(p, p.campanas[ultima.camp], analDePlan(p), 'estimado', cfg()) : null;
  const camps = [...new Set(meses.map((x) => x.camp))].join(', ');
  return { cab: cabPlan(p, camps), meses: out, tot, permitido: b ? b.aporte : null, campanas: camps };
}
function datosRegRiego(p, meses) {
  const filas = []; let acum = 0; const tot = { n: 0, m3ha: 0, m3finca: 0, nec: 0 };
  for (const x of meses) {
    const camp = p.campanas && p.campanas[x.camp]; if (!camp) continue;
    const f = CALC.riego(p, camp, cfg()).filas[x.i], cal = FERT.calendario(p, camp, x.camp, x.i);
    acum += f.vApl || 0; tot.n += f.n || 0; tot.m3ha += f.vApl || 0; tot.m3finca += f.vFinca || 0; tot.nec += f.vTeo || 0;
    filas.push({ mes: etiquetaMes(x), dias: rangosDias(cal.dias), n: f.n || 0, h: f.h ? `${hhmm(f.h)} h` : '–', m3ha: f.vApl, m3finca: f.vFinca, acum, nec: f.vTeo });
  }
  const ag = anal(p.analAgua);
  return { cab: cabPlan(p, [...new Set(meses.map((x) => x.camp))].join(', ')).slice(0, 9), filas, tot,
    sistema: `goteo, ${fmt(p.emisores, 0)} emisores por árbol de ${fmt(p.caudal, 1)} L/h, ${p.lineas || 1} línea${(p.lineas || 1) > 1 ? 's' : ''}`,
    agua: ag && !ag.plantilla ? `Analítica de agua: ${ag.nombre || ''} ${fechaEs(ag.fecha)}${ag.ref ? ' (ref. ' + ag.ref + ')' : ''}` : 'Sin analítica de agua de esta finca' };
}
function datosPlanAnual(p, campKey) {
  const camp = p.campanas && p.campanas[campKey]; if (!camp) return null;
  const ix = ixProd(), A = analDePlan(p), b = CALC.balanceN(p, camp, A, 'estimado', cfg());
  const rep = db.repartos.find((r) => r.id === p.reparto) || null;
  const nc = CALC.necesidades(p, camp, A, cfg(), rep);
  const s = A.suelo && !A.suelo.plantilla ? A.suelo : null, w = A.agua && !A.agua.plantilla ? A.agua : null;
  const sv = (s && s.v) || {}, wv = (w && w.v) || {};
  const r = CALC.riego(p, camp, cfg());
  const uf12 = CALC.MESES.map((_, k) => FERT.mes(p, camp, k, ix).uf);
  const productos = [];
  CALC.MESES.forEach((mm, k) => { for (const l of FERT.mes(p, camp, k, ix).lineas) if (l.w > 0) productos.push([mm, l.prod ? l.prod.nombre : l.nombre, tipoProducto(l.prod), l.periodo || '', `${fmt(l.w, 1)} ${l.liquido ? 'L' : 'kg'}/ha`, fmt(l.uf.n, 1), fmt(l.uf.p2o5, 1), fmt(l.uf.k2o, 1)]); });
  const cab = cabPlan(p, campKey);
  cab.splice(7, 0, ['Año de plantación', p.anioPlantacion || '–']);
  const conf = db.config.planAnual || {};
  return {
    cab,
    suelo: [['Analítica de suelo', s ? `${fechaEs(s.fecha)}${s.ref ? ' · ' + s.ref : ''}` : 'Sin analítica'], ['Materia orgánica', sv.mo != null ? `${fmt(sv.mo, 2)} %` : '–'], ['Nitratos (NO₃)', sv.no3 != null ? `${fmt(sv.no3, 0)} mg/kg` : '–'], ['Fósforo (P)', sv.p != null ? `${fmt(sv.p, 0)} mg/kg` : '–'], ['Potasio (K)', sv.k != null ? `${fmt(sv.k, 0)} mg/kg` : '–'], ['Textura', sv.textura || '–']],
    agua: [['Analítica de agua', w ? `${fechaEs(w.fecha)}${w.ref ? ' · ' + w.ref : ''}` : 'Sin analítica'], ['Nitratos (NO₃)', wv.no3 != null ? `${fmt(wv.no3, 1)} mg/L` : '–']],
    balance: [['E1. N mineral del suelo', fmt(b.E1, 1)], ['E2. Mineralización de la materia orgánica', fmt(b.E2, 1)], ['E3. Estiércoles y enmiendas', fmt(b.E3, 1)], ['E4. Agua de riego', fmt(b.E4, 1)], ['Total entradas', fmt(b.entradas, 1)], [`S1. Extracciones (${fmt(b.prod, 1)} t/ha × ${fmt(b.coef, 2)} kg N/t)`, fmt(b.S1, 1)], ['Aporte de N mineral permitido', fmt(b.aporte, 1)], ['N previsto en el plan', fmt(b.nAplicado, 1)], ...(p.vulnerable ? [['N orgánico total (límite 170 kg N/ha)', fmt(b.nOrgTotal, 1)]] : [])],
    necesidades: NUT_TXT.map((nu, j) => [nu, fmt(nc.teor[j], 1), fmt(nc.estiercol[j], 1), fmt(nc.agua[j], 1), fmt(nc.factor[j], 2), fmt(nc.objetivo[j], 1)]),
    reparto: CALC.MESES.map((mm, k) => ({ mes: mm, obj: nc.mensual ? nc.mensual[k] : [0, 0, 0], plan: uf12[k] })),
    productos,
    aplicacion: conf.aplicacion || TEXTO_APLICACION, medidas: conf.medidas || TEXTO_MEDIDAS,
    riego: `${fmt(r.totApl, 0)} m³/ha previstos en la campaña (${r.filas.reduce((t, f) => t + (f.n || 0), 0)} riegos), riego localizado por goteo; la necesidad se calcula con la ETo de la zona y el Kc del cultivo.`
  };
}
function datosPedidos(planes, meses) {
  const ix = ixProd(), porProd = new Map(), porCli = new Map();
  const suma = (map, nom, u, k, v) => { const t = map.get(nom) || { nombre: nom, u, total: 0, porMes: meses.map(() => 0) }; t.total += v; t.porMes[k] += v; map.set(nom, t); };
  for (const p of planes) {
    const sup = +p.superficie || 0, cli = p.cliente || 'Sin cliente';
    if (!porCli.has(cli)) porCli.set(cli, { cliente: cli, planes: new Set(), prods: new Map() });
    const c = porCli.get(cli);
    meses.forEach((x, k) => {
      const camp = p.campanas && p.campanas[x.camp]; if (!camp) return;
      for (const l of FERT.mes(p, camp, x.i, ix).lineas) { const v = l.w * sup; if (!(v > 0)) continue; const nom = l.prod ? l.prod.nombre : l.nombre, u = l.liquido ? 'L' : 'kg'; suma(porProd, nom, u, k, v); suma(c.prods, nom, u, k, v); c.planes.add(p.nombre); }
    });
  }
  const ord = (m) => [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { meses: meses.map((x) => `${CALC.MESES[x.i].slice(0, 3)} ${String(x.camp).slice(2)}`), porProducto: ord(porProd),
    porCliente: [...porCli.values()].filter((c) => c.prods.size).sort((a, b) => a.cliente.localeCompare(b.cliente, 'es')).map((c) => ({ cliente: c.cliente, planes: plural(c.planes.size, 'plan', 'planes'), productos: ord(c.prods) })) };
}

/* ---------- Pantalla ---------- */
let regResultados = [];
function renderRegistros(v) {
  const hoy = new Date(), cs = campanas();
  if (!ui.reg) {
    const c = cs.includes(String(hoy.getFullYear())) ? String(hoy.getFullYear()) : (cs.slice(-1)[0] || String(hoy.getFullYear()));
    ui.reg = { tipo: 'fert', desdeM: 0, desdeC: c, hastaM: String(hoy.getFullYear()) === c ? hoy.getMonth() : 11, hastaC: c, cli: '', sel: {}, agrupar: 'plan', guardar: true };
  }
  const r = ui.reg;
  const clientes = [...new Set(db.planes.map((p) => p.cliente || 'Sin cliente'))].sort((a, b) => a.localeCompare(b, 'es'));
  const planes = db.planes.filter((p) => !r.cli || (p.cliente || 'Sin cliente') === r.cli).sort((a, b) => (a.cliente || '').localeCompare(b.cliente || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  const elegidos = planes.filter((p) => r.sel[p.id]);
  const meses = mesesIntervalo(r);
  const selMes = (id, val) => `<select class="cell izq" id="${id}" style="width:auto">${CALC.MESES.map((m, k) => `<option value="${k}" ${+val === k ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
  const selCamp = (id, val) => `<select class="cell izq" id="${id}" style="width:auto">${(cs.length ? cs : [val]).map((c) => `<option ${String(val) === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
  const t = TIPOS_REG.find((x) => x[0] === r.tipo);
  v.innerHTML = `<div class="card"><h2>Registros e informes de la campaña</h2>
    <p class="small muted" style="margin:2px 0 12px">Documentos para el cuaderno de explotación y el RD 1051/2022 de nutrición sostenible, a partir de lo planificado en cada plan.</p>
    <div class="tipos-reg">${TIPOS_REG.map(([k, n]) => `<button data-rt="${k}" aria-pressed="${r.tipo === k}">${n}</button>`).join('')}</div>
    <p class="small" style="margin:10px 0 0">${esc(t[2])}</p>
    <div class="grid2" style="margin-top:14px;align-items:start">
      <div><h3>${r.tipo === 'plan' ? 'Campaña' : 'Intervalo de meses'}</h3>
        ${r.tipo === 'plan' ? `<div class="row">${selCamp('rDC', r.desdeC)}</div>` : `<div class="row"><span class="small muted">Desde</span>${selMes('rDM', r.desdeM)}${selCamp('rDC', r.desdeC)}<span class="small muted">hasta</span>${selMes('rHM', r.hastaM)}${selCamp('rHC', r.hastaC)}</div>
        <p class="small muted">${meses.length ? plural(meses.length, 'mes', 'meses') + ': ' + esc(textoIntervalo(meses)) : '<span style="color:var(--danger)">El final es anterior al inicio</span>'}</p>`}
        ${r.tipo === 'fert' || r.tipo === 'riego' || r.tipo === 'plan' ? `<h3 style="margin-top:14px">Agrupar</h3><div class="filtros"><button data-ra="plan" aria-pressed="${r.agrupar === 'plan'}">Un PDF por plan</button><button data-ra="cliente" aria-pressed="${r.agrupar === 'cliente'}">Un PDF por cliente</button></div>` : ''}
        ${od !== 'no-disponible' ? `<label class="chk small" style="margin-top:12px"><input type="checkbox" id="rGu" ${r.guardar ? 'checked' : ''}> Guardar en OneDrive (${r.tipo === 'pedidos' ? 'carpeta Planes de abonado' : 'carpeta de cada cliente'})</label>` : '<p class="small muted" style="margin-top:12px">En la tablet los PDF se abren aquí y quedan en Drive; el ordenador los pasa a OneDrive.</p>'}
        <div class="row" style="margin-top:14px"><button class="btn p" id="rGen" ${elegidos.length && (meses.length || r.tipo === 'plan') ? '' : 'disabled'}>Generar ${r.tipo === 'pedidos' ? 'PDF' : 'PDF' + (r.agrupar === 'cliente' ? ' por cliente' : ' por plan')}</button><span class="small muted">${plural(elegidos.length, 'plan elegido', 'planes elegidos')}</span></div>
        <div id="rRes" style="margin-top:12px">${regResultados.length ? `<h3>Generados</h3>${regResultados.map((x, k) => `<div class="row small" style="margin:4px 0"><span style="flex:1">${esc(x.nombre)}${x.ruta ? ` <span class="chip v">${esc(x.ruta)}</span>` : x.pendiente ? ' <span class="chip amb">en Drive</span>' : ''}</span><button class="btn peq" data-rver="${k}">Ver</button></div>`).join('')}` : ''}</div></div>
      <div><h3>Planes</h3>
        <div class="row"><select class="cell izq" id="rCli" style="flex:1"><option value="">Todos los clientes</option>${clientes.map((c) => `<option ${r.cli === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><button class="btn peq" id="rTodos">Marcar todos</button><button class="btn peq" id="rNing">Ninguno</button></div>
        <div class="lista-imp" style="margin-top:8px;max-height:52vh">${planes.map((p) => `<label><input type="checkbox" data-rp="${p.id}" ${r.sel[p.id] ? 'checked' : ''}> ${esc(p.nombre)} <span class="muted small">${esc(p.cliente)} · ${esc(p.finca)}</span></label>`).join('') || '<p class="muted small" style="padding:8px">Sin planes.</p>'}</div></div></div></div>`;
  const re = () => renderRegistros(v);
  $$('[data-rt]', v).forEach((b) => { b.onclick = () => { r.tipo = b.dataset.rt; re(); }; });
  $$('[data-ra]', v).forEach((b) => { b.onclick = () => { r.agrupar = b.dataset.ra; re(); }; });
  [['rDM', 'desdeM'], ['rDC', 'desdeC'], ['rHM', 'hastaM'], ['rHC', 'hastaC']].forEach(([id, k]) => { const e = $('#' + id, v); if (e) e.onchange = () => { r[k] = e.value; re(); }; });
  if ($('#rGu', v)) $('#rGu', v).onchange = (e) => { r.guardar = e.target.checked; };
  $('#rCli', v).onchange = (e) => { r.cli = e.target.value; r.sel = {}; for (const p of db.planes) if (r.cli && (p.cliente || 'Sin cliente') === r.cli) r.sel[p.id] = true; re(); };
  $('#rTodos', v).onclick = () => { for (const p of planes) r.sel[p.id] = true; re(); };
  $('#rNing', v).onclick = () => { r.sel = {}; re(); };
  $$('[data-rp]', v).forEach((c) => { c.onchange = () => { if (c.checked) r.sel[c.dataset.rp] = true; else delete r.sel[c.dataset.rp]; const b = $('#rGen', v); const n = planes.filter((p) => r.sel[p.id]).length; b.disabled = !n || !(meses.length || r.tipo === 'plan'); b.nextElementSibling.textContent = plural(n, 'plan elegido', 'planes elegidos'); }; });
  $$('[data-rver]', v).forEach((b) => { b.onclick = () => { const x = regResultados[+b.dataset.rver]; verPdf(x.blob, x.nombre); }; });
  $('#rGen', v).onclick = async () => { $('#rGen', v).disabled = true; try { await generarRegistros(planes.filter((p) => r.sel[p.id]), meses); } catch (e) { toast('No se pudo generar: ' + (e.message || e), true); } re(); };
}

async function generarRegistros(planes, meses) {
  const r = ui.reg, base = { logo: logoCache, autor: db.config.autor || '' };
  const interv = textoIntervalo(meses), docs = [];
  const carpetaDe = (p) => p.carpeta || ((p.cliente || 'Sin cliente') + '/' + (p.finca || 'Sin finca'));
  const grupos = r.agrupar === 'cliente' && r.tipo !== 'pedidos'
    ? [...planes.reduce((m, p) => { const k = p.cliente || 'Sin cliente'; (m.get(k) || m.set(k, []).get(k)).push(p); return m; }, new Map()).entries()].map(([cli, ps]) => ({ nombre: cli, planes: ps, carpeta: carpetaDe(ps[0]).split('/')[0] }))
    : planes.map((p) => ({ nombre: p.nombre, planes: [p], carpeta: carpetaDe(p) }));
  const sufijo = meses.length > 1 ? `${CALC.MESES[meses[0].i].slice(0, 3)} ${meses[0].camp}-${CALC.MESES[meses[meses.length - 1].i].slice(0, 3)} ${meses[meses.length - 1].camp}` : meses.length ? `${CALC.MESES[meses[0].i]} ${meses[0].camp}` : '';
  if (r.tipo === 'fert') for (const g of grupos) docs.push({ nombre: `Registro fertilización ${g.nombre} ${sufijo}.pdf`, carpeta: g.carpeta, blob: PDF.registroFert({ ...base, titulo: `Registro de fertilización · ${g.nombre}`, intervalo: interv, planes: g.planes.map((p) => datosRegFert(p, meses)) }) });
  if (r.tipo === 'riego') for (const g of grupos) docs.push({ nombre: `Registro riego ${g.nombre} ${sufijo}.pdf`, carpeta: g.carpeta, blob: PDF.registroRiego({ ...base, titulo: `Registro de riego · ${g.nombre}`, intervalo: interv, planes: g.planes.map((p) => datosRegRiego(p, meses)) }) });
  if (r.tipo === 'plan') for (const g of grupos) { const ds = g.planes.map((p) => datosPlanAnual(p, r.desdeC)).filter(Boolean); if (ds.length) docs.push({ nombre: `Plan de abonado ${g.nombre} ${r.desdeC}.pdf`, carpeta: g.carpeta, blob: PDF.planAnual({ ...base, campana: r.desdeC, planes: ds }) }); }
  if (r.tipo === 'pedidos') docs.push({ nombre: `Productos para pedidos ${sufijo}.pdf`, raiz: CARPETA_INFORMES, blob: PDF.pedidos({ ...base, intervalo: interv, ...datosPedidos(planes, meses) }) });
  if (!docs.length) { toast('No hay datos para ese intervalo', true); return; }
  if (od === 'pedir-permiso' && r.guardar) { if (await ALM.reconectar().catch(() => false)) od = 'listo'; }
  regResultados = [];
  for (const x of docs) {
    const res = { nombre: x.nombre, blob: x.blob, ruta: null, pendiente: false };
    try {
      if (od === 'listo' && r.guardar) res.ruta = x.raiz ? await ALM.guardarEnRaiz(x.raiz, x.nombre, x.blob) : await ALM.guardarPDF(x.carpeta, x.nombre, x.blob);
      else if (od === 'no-disponible' && !offline) { await NUBE.subirPdf(x.nombre, x.blob, x.raiz ? { tipo: 'raiz', carpeta: x.raiz } : { tipo: 'registro', carpeta: x.carpeta }); res.pendiente = true; }
    } catch (e) { toast(`${x.nombre}: ${e.message || e}`, true); }
    regResultados.push(res);
  }
  if (docs.length === 1) verPdf(docs[0].blob, docs[0].nombre);
  toast(`${plural(docs.length, 'PDF generado', 'PDF generados')}${regResultados.some((x) => x.ruta) ? ' y guardados en OneDrive' : regResultados.some((x) => x.pendiente) ? ': el ordenador los pasará a OneDrive' : ''}`);
}
