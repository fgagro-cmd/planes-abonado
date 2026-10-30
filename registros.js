'use strict';
/* Planes de abonado · FG Agro — sección Registros (1.6): registro de fertilización y de riego, plan de abonado anual
   (RD 1051/2022 de nutrición sostenible) y productos para pedidos, para un intervalo de meses.
   Usa lo que define app.js (db, ui, CALC, FERT, PDF, ALM, NUBE, cfg, ixProd, analDePlan…): se llama solo cuando la app ya ha arrancado. */
const TIPOS_REG = [
  ['fert', 'Registro de fertilización', 'Cada aporte de fertilizante: fecha, producto, tipo, riqueza, dosis y UF, con el acumulado y lo recomendado por el plan (cuaderno de explotación).'],
  ['riego', 'Registro de riego', 'Días, nº de riegos, horas y m³/ha de cada mes, con el acumulado y la necesidad calculada.'],
  ['rd', 'Plan de abonado RD 1051', 'El plan oficial de cada unidad de producción, como el modelo del RD 1051/2022: un documento por cliente, con sus planes como hojas de cultivo, recintos SIGPAC, suelo, lluvia y riego, necesidades, productos, verificación de límites, medidas y firmas.'],
  ['plan', 'Plan de abonado anual (técnico)', 'El plan de la campaña: analíticas, balance de N, necesidades, reparto mensual, fertilizantes, forma de aplicación y medidas (RD 1051/2022).'],
  ['pedidos', 'Productos para pedidos', 'Un PDF por cliente con la cantidad de cada producto: por finca, cada sector (plan) con el subtotal de la finca, y el total del cliente. Por defecto, el mes siguiente (desde el día 15).']
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
    suelo: [['Analítica de suelo', s ? (s.origen === 'cartografia' ? `Cartografía de suelos (IMIDA)${s.ref ? ' · ' + s.ref : ''}` : `${fechaEs(s.fecha)}${s.ref ? ' · ' + s.ref : ''}`) : 'Sin analítica'], ['Materia orgánica', sv.mo != null ? `${fmt(sv.mo, 2)} %` : '–'], ['Nitratos (NO₃)', sv.no3 != null ? `${fmt(sv.no3, 0)} mg/kg` : '–'], ['Fósforo (P)', sv.p != null ? `${fmt(sv.p, 0)} mg/kg` : '–'], ['Potasio (K)', sv.k != null ? `${fmt(sv.k, 0)} mg/kg` : '–'], ['Textura', sv.textura || '–']],
    agua: [['Analítica de agua', w ? `${fechaEs(w.fecha)}${w.ref ? ' · ' + w.ref : ''}` : 'Sin analítica'], ['Nitratos (NO₃)', wv.no3 != null ? `${fmt(wv.no3, 1)} mg/L` : '–']],
    balance: [['E1. N mineral del suelo', fmt(b.E1, 1)], ['E2. Mineralización de la materia orgánica', fmt(b.E2, 1)], ['E3. Estiércoles y enmiendas', fmt(b.E3, 1)], ['E4. Agua de riego', fmt(b.E4, 1)], ['Total entradas', fmt(b.entradas, 1)], [`S1. Extracciones (${fmt(b.prod, 1)} t/ha × ${fmt(b.coef, 2)} kg N/t)`, fmt(b.S1, 1)], ['Aporte de N mineral permitido', fmt(b.aporte, 1)], ['N previsto en el plan', fmt(b.nAplicado, 1)], ...(p.vulnerable ? [['N orgánico total (límite 170 kg N/ha)', fmt(b.nOrgTotal, 1)]] : [])],
    necesidades: NUT_TXT.map((nu, j) => [nu, fmt(nc.teor[j], 1), fmt(nc.estiercol[j], 1), fmt(nc.agua[j], 1), fmt(nc.factor[j], 2), fmt(nc.objetivo[j], 1)]),
    reparto: CALC.MESES.map((mm, k) => ({ mes: mm, obj: nc.mensual ? nc.mensual[k] : [0, 0, 0], plan: uf12[k] })),
    productos,
    aplicacion: conf.aplicacion || TEXTO_APLICACION, medidas: conf.medidas || TEXTO_MEDIDAS,
    riego: `${fmt(r.totApl, 0)} m³/ha previstos en la campaña (${r.filas.reduce((t, f) => t + (f.n || 0), 0)} riegos), riego localizado por goteo; la necesidad se calcula con la ETo de la zona y el Kc del cultivo.`
  };
}
/* Productos para pedidos de UN cliente: por finca, cada plan es un sector, con subtotal por finca y total del cliente */
function datosPedidosCliente(cliente, planes, meses) {
  const ix = ixProd();
  // Nombre corto del sector: sin las palabras que se repiten en todos los planes del cliente
  const pal = planes.map((p) => p.nombre.split(/\s+/));
  let comun = 0; while (pal.length > 1 && pal.every((w) => w.length > comun + 1 && CALC.norm(w[comun]) === CALC.norm(pal[0][comun]))) comun++;
  const corto = (k) => pal[k].slice(comun).join(' ') || planes[k].nombre;
  const fincas = new Map();
  planes.forEach((p, k) => {
    const fk = p.finca || 'Sin finca';
    if (!fincas.has(fk)) fincas.set(fk, { finca: fk, sectores: [], prods: new Map(), sup: 0 });
    const f = fincas.get(fk), s = f.sectores.length, sup = +p.superficie || 0;
    f.sectores.push({ nombre: corto(k), plan: p.nombre, sup, cultivo: p.cultivo || p.tipoCultivo || '' }); f.sup += sup;
    for (const x of meses) {
      const camp = p.campanas && p.campanas[x.camp]; if (!camp) continue;
      for (const l of FERT.mes(p, camp, x.i, ix).lineas) {
        const v = l.w * sup; if (!(v > 0)) continue;
        const nom = l.prod ? l.prod.nombre : l.nombre, u = l.liquido ? 'L' : 'kg', key = nom + '|' + u;
        const t = f.prods.get(key) || { nombre: nom, u, porSector: [], subtotal: 0 };
        t.porSector[s] = (t.porSector[s] || 0) + v; t.subtotal += v; f.prods.set(key, t);
      }
    }
  });
  const ord = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const lista = [...fincas.values()].sort((a, b) => a.finca.localeCompare(b.finca, 'es')).map((f) => ({ finca: f.finca, sup: f.sup, sectores: f.sectores, productos: [...f.prods.values()].map((t) => ({ ...t, porSector: f.sectores.map((_, s) => t.porSector[s] || 0) })).sort(ord) }));
  const tot = new Map();
  lista.forEach((f, fi) => { for (const t of f.productos) { const key = t.nombre + '|' + t.u; const x = tot.get(key) || { nombre: t.nombre, u: t.u, porFinca: lista.map(() => 0), total: 0 }; x.porFinca[fi] += t.subtotal; x.total += t.subtotal; tot.set(key, x); } });
  return { cliente, fincas: lista, total: [...tot.values()].sort(ord), nPlanes: planes.length };
}
/* Mes por defecto del pedido: el siguiente a partir del día 15; antes, el mes en curso */
function mesPedidoDefecto(hoy = new Date()) {
  let m = hoy.getMonth(), a = hoy.getFullYear();
  if (hoy.getDate() >= 15) { m++; if (m > 11) { m = 0; a++; } }
  return { m, c: String(a) };
}

/* ---------- Pantalla ---------- */
function faltasHtml(planes, campKey) {
  if (!planes.length) return '';
  const porCli = planes.reduce((m, p) => { const k = claveTitular(p); (m.get(k) || m.set(k, []).get(k)).push(p); return m; }, new Map());
  const filas = [...porCli.entries()].map(([cli, ps]) => [cli, faltasRD(cli, ps, campKey)]).filter(([, f]) => f.length);
  if (!filas.length) return '<p class="small" style="margin-top:8px"><span class="chip v">Datos completos</span></p>';
  return `<div class="aviso" style="display:block;margin-top:8px"><b>Faltan datos</b> (el PDF sale igual, con esos huecos en blanco):<ul style="margin:4px 0 0 18px;padding:0">${filas.map(([cli, f]) => `<li><b>${esc(cli)}</b>: ${esc(f.join('; '))}</li>`).join('')}</ul></div>`;
}
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
  const selCamp = (id, val) => `<select class="cell izq" id="${id}" style="width:auto">${(cs.includes(String(val)) ? cs : [...cs, String(val)].sort()).map((c) => `<option ${String(val) === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
  const t = TIPOS_REG.find((x) => x[0] === r.tipo);
  v.innerHTML = `<div class="card"><h2>Registros e informes de la campaña</h2>
    <p class="small muted" style="margin:2px 0 12px">Documentos para el cuaderno de explotación y el RD 1051/2022 de nutrición sostenible, a partir de lo planificado en cada plan.</p>
    <div class="tipos-reg">${TIPOS_REG.map(([k, n]) => `<button data-rt="${k}" aria-pressed="${r.tipo === k}">${n}</button>`).join('')}</div>
    <p class="small" style="margin:10px 0 0">${esc(t[2])}</p>
    <div class="grid2" style="margin-top:14px;align-items:start">
      <div><h3>${r.tipo === 'plan' || r.tipo === 'rd' ? 'Campaña' : 'Intervalo de meses'}</h3>
        ${r.tipo === 'plan' || r.tipo === 'rd' ? `<div class="row">${selCamp('rDC', r.desdeC)}</div>` : `<div class="row"><span class="small muted">Desde</span>${selMes('rDM', r.desdeM)}${selCamp('rDC', r.desdeC)}<span class="small muted">hasta</span>${selMes('rHM', r.hastaM)}${selCamp('rHC', r.hastaC)}</div>
        <p class="small muted">${meses.length ? plural(meses.length, 'mes', 'meses') + ': ' + esc(textoIntervalo(meses)) : '<span style="color:var(--danger)">El final es anterior al inicio</span>'}</p>`}
        ${r.tipo === 'fert' || r.tipo === 'riego' || r.tipo === 'plan' ? `<h3 style="margin-top:14px">Agrupar</h3><div class="filtros"><button data-ra="plan" aria-pressed="${r.agrupar === 'plan'}">Un PDF por plan</button><button data-ra="cliente" aria-pressed="${r.agrupar === 'cliente'}">Un PDF por cliente</button></div>` : ''}
        ${od !== 'no-disponible' ? `<label class="chk small" style="margin-top:12px"><input type="checkbox" id="rGu" ${r.guardar ? 'checked' : ''}> Guardar en OneDrive (${r.tipo === 'pedidos' ? 'carpeta Planes de abonado' : 'carpeta de cada cliente'})</label>` : '<p class="small muted" style="margin-top:12px">En la tablet los PDF se abren aquí y quedan en Drive; el ordenador los pasa a OneDrive.</p>'}
        ${r.tipo === 'rd' ? `<p class="small muted" style="margin-top:10px">Un PDF por cliente (unidad de producción); cada plan elegido es una hoja de cultivo.</p>${faltasHtml(elegidos, r.desdeC)}` : ''}
        <div class="row" style="margin-top:14px"><button class="btn p" id="rGen" ${elegidos.length && (meses.length || r.tipo === 'plan' || r.tipo === 'rd') ? '' : 'disabled'}>Generar ${r.tipo === 'pedidos' ? 'PDF por cliente' : r.tipo === 'rd' ? 'PDF por cliente' : 'PDF' + (r.agrupar === 'cliente' ? ' por cliente' : ' por plan')}</button><span class="small muted">${plural(elegidos.length, 'plan elegido', 'planes elegidos')}</span></div>
        <div id="rRes" style="margin-top:12px">${regResultados.length ? `<h3>Generados</h3>${regResultados.map((x, k) => `<div class="row small" style="margin:4px 0"><span style="flex:1">${esc(x.nombre)}${x.ruta ? ` <span class="chip v">${esc(x.ruta)}</span>` : x.pendiente ? ' <span class="chip amb">en Drive</span>' : ''}</span><button class="btn peq" data-rver="${k}">Ver</button></div>`).join('')}` : ''}</div></div>
      <div><h3>Planes</h3>
        <div class="row"><select class="cell izq" id="rCli" style="flex:1"><option value="">Todos los clientes</option>${clientes.map((c) => `<option ${r.cli === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><button class="btn peq" id="rTodos">Marcar todos</button><button class="btn peq" id="rNing">Ninguno</button></div>
        <div class="lista-imp" style="margin-top:8px;max-height:52vh">${planes.map((p) => `<label><input type="checkbox" data-rp="${p.id}" ${r.sel[p.id] ? 'checked' : ''}> ${esc(p.nombre)} <span class="muted small">${esc(p.cliente)} · ${esc(p.finca)}</span></label>`).join('') || '<p class="muted small" style="padding:8px">Sin planes.</p>'}</div></div></div></div>`;
  const re = () => renderRegistros(v);
  $$('[data-rt]', v).forEach((b) => { b.onclick = () => {
    if (b.dataset.rt === 'pedidos' && r.tipo !== 'pedidos') { const d = mesPedidoDefecto(); r.desdeM = r.hastaM = d.m; r.desdeC = r.hastaC = d.c; }
    r.tipo = b.dataset.rt; re(); }; });
  $$('[data-ra]', v).forEach((b) => { b.onclick = () => { r.agrupar = b.dataset.ra; re(); }; });
  [['rDM', 'desdeM'], ['rDC', 'desdeC'], ['rHM', 'hastaM'], ['rHC', 'hastaC']].forEach(([id, k]) => { const e = $('#' + id, v); if (e) e.onchange = () => { r[k] = e.value; re(); }; });
  if ($('#rGu', v)) $('#rGu', v).onchange = (e) => { r.guardar = e.target.checked; };
  $('#rCli', v).onchange = (e) => { r.cli = e.target.value; r.sel = {}; for (const p of db.planes) if (r.cli && (p.cliente || 'Sin cliente') === r.cli) r.sel[p.id] = true; re(); };
  $('#rTodos', v).onclick = () => { for (const p of planes) r.sel[p.id] = true; re(); };
  $('#rNing', v).onclick = () => { r.sel = {}; re(); };
  $$('[data-rp]', v).forEach((c) => { c.onchange = () => { if (c.checked) r.sel[c.dataset.rp] = true; else delete r.sel[c.dataset.rp]; const b = $('#rGen', v); const n = planes.filter((p) => r.sel[p.id]).length; b.disabled = !n || !(meses.length || r.tipo === 'plan' || r.tipo === 'rd'); b.nextElementSibling.textContent = plural(n, 'plan elegido', 'planes elegidos'); if (r.tipo === 'rd') re(); }; });
  $$('[data-rver]', v).forEach((b) => { b.onclick = () => { const x = regResultados[+b.dataset.rver]; verPdf(x.blob, x.nombre); }; });
  $('#rGen', v).onclick = async () => { $('#rGen', v).disabled = true; try { await generarRegistros(planes.filter((p) => r.sel[p.id]), meses); } catch (e) { toast('No se pudo generar: ' + (e.message || e), true); } re(); };
}

async function generarRegistros(planes, meses) {
  const r = ui.reg, base = { logo: logoCache, autor: db.config.autor || '' };
  const interv = textoIntervalo(meses), docs = [];
  const carpetaDe = (p) => p.carpeta || ((p.cliente || 'Sin cliente') + '/' + (p.finca || 'Sin finca'));
  const grupos = (r.agrupar === 'cliente' || r.tipo === 'rd') && r.tipo !== 'pedidos'
    ? [...planes.reduce((m, p) => { const k = p.cliente || 'Sin cliente'; (m.get(k) || m.set(k, []).get(k)).push(p); return m; }, new Map()).entries()].map(([cli, ps]) => ({ nombre: cli, planes: ps, carpeta: carpetaDe(ps[0]).split('/')[0] }))
    : planes.map((p) => ({ nombre: p.nombre, planes: [p], carpeta: carpetaDe(p) }));
  const sufijo = meses.length > 1 ? `${CALC.MESES[meses[0].i].slice(0, 3)} ${meses[0].camp}-${CALC.MESES[meses[meses.length - 1].i].slice(0, 3)} ${meses[meses.length - 1].camp}` : meses.length ? `${CALC.MESES[meses[0].i]} ${meses[0].camp}` : '';
  if (r.tipo === 'fert') for (const g of grupos) docs.push({ nombre: `Registro fertilización ${g.nombre} ${sufijo}.pdf`, carpeta: g.carpeta, blob: PDF.registroFert({ ...base, titulo: `Registro de fertilización · ${g.nombre}`, intervalo: interv, planes: g.planes.map((p) => datosRegFert(p, meses)) }) });
  if (r.tipo === 'riego') for (const g of grupos) docs.push({ nombre: `Registro riego ${g.nombre} ${sufijo}.pdf`, carpeta: g.carpeta, blob: PDF.registroRiego({ ...base, titulo: `Registro de riego · ${g.nombre}`, intervalo: interv, planes: g.planes.map((p) => datosRegRiego(p, meses)) }) });
  if (r.tipo === 'plan') for (const g of grupos) { const ds = g.planes.map((p) => datosPlanAnual(p, r.desdeC)).filter(Boolean); if (ds.length) docs.push({ nombre: `Plan de abonado ${g.nombre} ${r.desdeC}.pdf`, carpeta: g.carpeta, blob: PDF.planAnual({ ...base, campana: r.desdeC, planes: ds }) }); }
  if (r.tipo === 'rd') for (const g of grupos) { const d = datosRD(g.nombre, g.planes, r.desdeC); if (d) docs.push({ nombre: `Plan de abonado RD 1051 ${g.nombre} ${r.desdeC}.pdf`, carpeta: g.carpeta, blob: PDF.planRD({ ...base, ...d }) }); }
  if (r.tipo === 'pedidos') {
    const porCli = planes.reduce((m, p) => { const k = p.cliente || 'Sin cliente'; (m.get(k) || m.set(k, []).get(k)).push(p); return m; }, new Map());
    for (const [cli, ps] of [...porCli.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
      const d = datosPedidosCliente(cli, ps.sort((a, b) => (a.finca || '').localeCompare(b.finca || '', 'es') || a.nombre.localeCompare(b.nombre, 'es')), meses);
      if (!d.total.length) continue;
      docs.push({ nombre: `Pedido ${cli} ${sufijo}.pdf`, raiz: CARPETA_INFORMES, blob: PDF.pedidos({ ...base, intervalo: interv, ...d }) });
    }
  }
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

/* ======================================================================
   Plan de abonado RD 1051/2022 por unidad de producción (1.7)
   Un documento por cliente; cada plan suyo es una hoja de cultivo. Estructura del modelo oficial:
   1 datos generales · 2 recintos y cultivo · 3 suelo y agua · 4 necesidades, aportes y límites ·
   5 suelo y emisiones · 6 asesoramiento y firmas · Anexo I recintos SIGPAC.
   ====================================================================== */
const RD_TXT = {
  lluvia: 'Clima semiárido mediterráneo, con las lluvias concentradas en otoño y primavera y veranos secos. La lluvia no se descuenta del riego; se tiene en cuenta para no fertilizar antes de episodios de lluvia intensa.',
  objetivoMO: 'Mantener o aumentar la materia orgánica del suelo. Se priorizará el uso de fertilizantes y enmiendas orgánicas cuando la analítica lo aconseje, y se favorecerá la incorporación de restos de poda y la cubierta vegetal en calles cuando sea posible.',
  prohibiciones: 'No se aplicarán fertilizantes sobre suelo inundado o encharcado ni con aviso rojo de lluvias de AEMET. Al disponer de riego localizado, con los fertilizantes disueltos en el agua de riego y fraccionados según las necesidades del cultivo, no son de aplicación los periodos de prohibición de fertilización nitrogenada del Anexo II (art. 4).',
  almacenamiento: 'Fertilizantes almacenados en lugar cubierto, seco y ventilado, fuera de zonas inundables y alejados de cauces, pozos y captaciones; abonos líquidos en depósitos en buen estado y protegidos frente a derrames. Sin apilamiento de estiércoles ni fertilizantes orgánicos en las parcelas.',
  proteccion: 'Riego ajustado a las necesidades del cultivo para evitar drenajes y el lavado de nitratos; revisión periódica del sistema de riego (uniformidad, fugas y presiones) para evitar escorrentías; sin aplicación de fertilizantes junto a cauces, pozos y captaciones.',
  asesoramiento: 'Plan elaborado con asesoramiento técnico en fertilización (art. 6.6 del RD 1051/2022). Se podrá modificar a lo largo de la campaña según la evolución del cultivo y del clima, respetando los principios de las partes I y II del Anexo III.',
  cuaderno: 'Cada aplicación de fertilizantes se anotará en la sección de fertilización del cuaderno de explotación en el plazo máximo de un mes (fecha, recinto, producto, valor agronómico, dosis, forma de aplicación y maquinaria).',
  metodo: 'Balance de nutrientes (Anexo III, parte I): necesidades según la cosecha prevista y la extracción del cultivo, descontando el nitrógeno mineral del suelo, la mineralización de la materia orgánica, los estiércoles y enmiendas aportados y los nutrientes del agua de riego.'
};
const rdTxt = (k) => ((db.config.rd || {})[k] || '').trim() || RD_TXT[k];
const claveTitular = (p) => p.cliente || 'Sin cliente';
const titularDe = (p) => (db.titulares && db.titulares[claveTitular(p)]) || {};
const esCarto = (a) => !!(a && a.origen === 'cartografia');

/* ---------- Recintos SIGPAC: pegar una lista ---------- */
const USOS_SIGPAC = ['CI', 'FY', 'FS', 'FL', 'OV', 'OF', 'OC', 'VI', 'VF', 'VO', 'FV', 'TA', 'TH', 'PS', 'PR', 'PA', 'IV', 'CA', 'ED', 'IM', 'ZU', 'ZV', 'AG', 'FO', 'MT', 'CO', 'ZC'];
function supHa(txt) {
  if (txt == null || txt === '') return null;
  let s = String(txt).trim().replace(/\s/g, '');
  if (/,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,5678
  let v = parseFloat(s); if (!Number.isFinite(v)) return null;
  if (v > 1000) v = v / 10000; // venía en m²
  return Math.round(v * 10000) / 10000;
}
function parsearRecintos(texto) {
  const out = [], t = String(texto || '').replace(/\r/g, '');
  const rec = (o) => { if (o.pol != null && o.par != null) out.push({ prov: o.prov ?? '', mun: o.mun ?? '', municipio: o.municipio || '', agr: o.agr ?? '', zona: o.zona ?? '', pol: o.pol, par: o.par, rec: o.rec ?? '', uso: o.uso || '', sup: o.sup ?? null }); };
  // a) Texto con etiquetas (copiado del visor SIGPAC): un bloque por «Provincia»
  if (/parcela/i.test(t) && /pol[ií]gono/i.test(t)) {
    const bloques = t.split(/(?=provincia\s*[:=]?\s*\d)/i).filter((b) => /parcela/i.test(b));
    for (const b of bloques) {
      const g = (re) => { const m = b.match(re); return m ? m[1].trim() : null; };
      rec({ prov: g(/provincia\s*[:=]?\s*(\d+)/i), mun: g(/municipio\s*[:=]?\s*(\d+)/i), municipio: g(/municipio\s*[:=]?\s*\d*\s*[-–(]?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ .'-]+?)\s*\)?\s*(?:\n|$|agregado|zona|pol)/i), agr: g(/agregado\s*[:=]?\s*(\d+)/i), zona: g(/zona\s*[:=]?\s*(\d+)/i), pol: g(/pol[ií]gono\s*[:=]?\s*(\d+)/i), par: g(/parcela\s*[:=]?\s*(\d+)/i), rec: g(/recinto\s*[:=]?\s*(\d+)/i), uso: (g(/\b[Uu][Ss][Oo](?:\s*SIGPAC|\s*sigpac)?\s*[:=]?\s*([A-Z]{2})\b/) || ''), sup: supHa(g(/superficie[^\d]*([\d.,]+)/i)) });
    }
    if (out.length) return out;
  }
  for (const linea of t.split('\n')) {
    const l = linea.trim(); if (!l || /provincia|pol[ií]gono|parcela/i.test(l) && !/\d/.test(l)) continue;
    // b) Código SIGPAC de 7 partes: 30:29:0:0:12:45:1
    const m = l.match(/(\d{1,2})\s*[:\-/]\s*(\d{1,3})\s*[:\-/]\s*(\d{1,3})\s*[:\-/]\s*(\d{1,3})\s*[:\-/]\s*(\d{1,4})\s*[:\-/]\s*(\d{1,5})\s*[:\-/]\s*(\d{1,5})/);
    let resto = l, o = null;
    if (m) { o = { prov: m[1], mun: m[2], agr: m[3], zona: m[4], pol: m[5], par: m[6], rec: m[7] }; resto = l.replace(m[0], ' '); }
    const celdas = resto.split(/\t|;|\||\s{2,}|\s+/).map((c) => c.trim()).filter(Boolean);
    const enteros = [], decimales = []; let uso = '', municipio = '';
    for (const c of celdas) {
      if (/^\d+$/.test(c)) enteros.push(c);
      else if (/^\d+[.,]\d+$/.test(c) || /^\d{1,3}(\.\d{3})+,\d+$/.test(c)) decimales.push(c);
      else if (USOS_SIGPAC.includes(c.toUpperCase()) && c.length === 2) uso = c.toUpperCase();
      else if (/^[A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ'-]{2,}$/.test(c) && !municipio && !/^(ha|has|m2)$/i.test(c)) municipio = c;
    }
    if (!o) {
      if (enteros.length >= 7) o = { prov: enteros[0], mun: enteros[1], agr: enteros[2], zona: enteros[3], pol: enteros[4], par: enteros[5], rec: enteros[6] };
      else if (enteros.length >= 5) o = { prov: enteros[0], mun: enteros[1], pol: enteros[2], par: enteros[3], rec: enteros[4] };
      else if (enteros.length >= 3) o = { pol: enteros[0], par: enteros[1], rec: enteros[2] };
      else continue;
    }
    rec({ ...o, uso, municipio, sup: supHa(decimales[0]) });
  }
  return out;
}

/* ---------- Ficha: titular y recintos (pestaña Finca) ---------- */
function htmlRD(p) {
  const t = titularDe(p), rs = p.sigpac || [];
  const tot = rs.reduce((s, r) => s + (+r.sup || 0), 0);
  const dif = rs.length && p.superficie && Math.abs(tot - p.superficie) > 0.005;
  const c = (i, k, v, w) => `<td${w ? ` style="width:${w}"` : ''}><input class="cell${k === 'municipio' ? ' izq' : ''}" data-sg="${i}" data-sgk="${k}" value="${esc(k === 'sup' ? fmtIn(v) : (v ?? ''))}"></td>`;
  return `<div class="card" style="margin-top:14px;box-shadow:none"><h3>Plan de abonado RD 1051 · titular y recintos SIGPAC</h3>
    <p class="small muted">Titular, NIF, código REA y unidad de producción son comunes a todos los planes de <b>${esc(claveTitular(p))}</b>.</p>
    <div class="grid4">
      <label class="fld"><span>NIF del titular</span><input data-tit="nif" value="${esc(t.nif || '')}"></label>
      <label class="fld"><span>Código REA / SIEX</span><input data-tit="rea" value="${esc(t.rea || '')}"></label>
      <label class="fld" style="grid-column:span 2"><span>Unidad de producción</span><input data-tit="up" value="${esc(t.up || '')}" placeholder="UP-01 – Explotación de ${esc(claveTitular(p))}"></label>
    </div>
    <h3 style="margin-top:14px">Recintos SIGPAC de este plan <span class="small muted" style="font-weight:400">${rs.length ? `${plural(rs.length, 'recinto', 'recintos')} · ${fmt(tot, 4)} ha` : ''}</span> ${dif ? `<span class="chip amb">no coincide con la superficie del plan (${fmt(p.superficie, 2)} ha)</span>` : ''}</h3>
    ${rs.length ? `<div class="scroll-x"><table class="t"><tr><th>Prov.</th><th>Mun.</th><th>Municipio</th><th>Agr.</th><th>Zona</th><th>Pol.</th><th>Parc.</th><th>Rec.</th><th>Uso</th><th class="n">Sup. (ha)</th><th></th></tr>
      ${rs.map((r, i) => `<tr>${c(i, 'prov', r.prov, '44px')}${c(i, 'mun', r.mun, '50px')}${c(i, 'municipio', r.municipio)}${c(i, 'agr', r.agr, '40px')}${c(i, 'zona', r.zona, '40px')}${c(i, 'pol', r.pol, '50px')}${c(i, 'par', r.par, '56px')}${c(i, 'rec', r.rec, '46px')}${c(i, 'uso', r.uso, '44px')}${c(i, 'sup', r.sup, '80px')}<td><button class="btn peq rojo" data-sgdel="${i}">Quitar</button></td></tr>`).join('')}</table></div>` : '<p class="small muted">Sin recintos. Pega la lista de la PAC o del visor SIGPAC.</p>'}
    <div class="row" style="margin-top:8px"><button class="btn peq p" id="sgPegar">Pegar una lista…</button><button class="btn peq" id="sgAdd">+ Recinto</button>${rs.length && !p.superficie ? '<button class="btn peq" id="sgSup">Usar la suma como superficie</button>' : ''}</div></div>`;
}
function enlazarRD(el, p) {
  const re = () => renderDetalleSoloCuerpo();
  $$('[data-tit]', el).forEach((i) => i.addEventListener('change', () => commit((d) => { d.titulares = d.titulares || {}; const k = claveTitular(p); d.titulares[k] = { ...(d.titulares[k] || {}), [i.dataset.tit]: i.value.trim() }; }, { render: false })));
  $$('[data-sg]', el).forEach((i) => i.addEventListener('change', () => { commit(() => { const r = p.sigpac[+i.dataset.sg]; const k = i.dataset.sgk; r[k] = k === 'sup' ? supHa(i.value) : k === 'uso' ? i.value.trim().toUpperCase() : i.value.trim(); }, { render: false }); re(); }));
  $$('[data-sgdel]', el).forEach((b) => { b.onclick = () => { commit(() => { p.sigpac.splice(+b.dataset.sgdel, 1); }, { render: false }); re(); }; });
  $('#sgAdd', el).onclick = () => { commit(() => { const u = (p.sigpac || []).slice(-1)[0] || {}; p.sigpac = p.sigpac || []; p.sigpac.push({ prov: u.prov || '30', mun: u.mun || '', municipio: u.municipio || '', agr: u.agr || '0', zona: u.zona || '0', pol: '', par: '', rec: '', uso: u.uso || '', sup: null }); }, { render: false }); re(); };
  const bs = $('#sgSup', el); if (bs) bs.onclick = () => { commit(() => { p.superficie = Math.round(p.sigpac.reduce((s, r) => s + (+r.sup || 0), 0) * 10000) / 10000; }, { render: false }); re(); };
  $('#sgPegar', el).onclick = () => {
    const m = modal('Pegar recintos SIGPAC', `<p class="small">Copia los recintos de la declaración de la PAC, de una hoja de cálculo o del visor SIGPAC y pégalos aquí. Vale una línea por recinto con el código (30:29:0:0:12:45:1) o con provincia, municipio, polígono, parcela y recinto en columnas; la superficie en ha y el uso (CI, FY…) se recogen si aparecen.</p>
      <textarea id="sgTxt" rows="7" style="width:100%" placeholder="30:29:0:0:12:45:1  CI  1,2345"></textarea>
      <div id="sgPrev" class="small" style="margin-top:8px"></div>
      <label class="chk small" style="margin-top:8px"><input type="checkbox" id="sgSust" ${(p.sigpac || []).length ? '' : 'checked'}> Sustituir los recintos que ya tiene el plan</label>`,
    { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn p" id="sgOk" disabled>Añadir</button>', ancho: true });
    $$('[data-cerrar]', m).forEach((b) => { b.onclick = cerrarModal; });
    let lista = [];
    $('#sgTxt', m).oninput = (e) => {
      lista = parsearRecintos(e.target.value);
      $('#sgOk', m).disabled = !lista.length;
      $('#sgPrev', m).innerHTML = lista.length ? `<b>${plural(lista.length, 'recinto encontrado', 'recintos encontrados')}</b> · ${fmt(lista.reduce((s, r) => s + (+r.sup || 0), 0), 4)} ha
        <table class="t" style="margin-top:6px"><tr><th>Prov.</th><th>Mun.</th><th>Pol.</th><th>Parc.</th><th>Rec.</th><th>Uso</th><th class="n">ha</th></tr>${lista.slice(0, 40).map((r) => `<tr><td>${esc(r.prov)}</td><td>${esc(r.mun)}${r.municipio ? ' ' + esc(r.municipio) : ''}</td><td>${esc(r.pol)}</td><td>${esc(r.par)}</td><td>${esc(r.rec)}</td><td>${esc(r.uso)}</td><td class="n">${fmt(r.sup, 4)}</td></tr>`).join('')}</table>` : (e.target.value.trim() ? '<span style="color:var(--danger)">No reconozco ningún recinto: revisa que haya polígono, parcela y recinto.</span>' : '');
    };
    $('#sgOk', m).onclick = () => {
      const sust = $('#sgSust', m).checked;
      commit(() => { p.sigpac = (sust ? [] : (p.sigpac || [])).concat(lista); if (!p.superficie) p.superficie = Math.round(p.sigpac.reduce((s, r) => s + (+r.sup || 0), 0) * 10000) / 10000 || null; }, { render: false });
      cerrarModal(); re(); toast(`${plural(lista.length, 'recinto añadido', 'recintos añadidos')}`);
    };
    enfocar('#sgTxt');
  };
}

/* ---------- Datos del documento ---------- */
const P_A_P2O5 = 2.2914, K_A_K2O = 1.2046;
function datosHojaRD(p, campKey, n) {
  const camp = p.campanas && p.campanas[campKey]; if (!camp) return null;
  const ix = ixProd(), A = analDePlan(p), b = CALC.balanceN(p, camp, A, 'estimado', cfg());
  const rep = db.repartos.find((r) => r.id === p.reparto) || null;
  const nc = CALC.necesidades(p, camp, A, cfg(), rep);
  const sup = +p.superficie || 0;
  const s = A.suelo && !A.suelo.plantilla ? A.suelo : null, sv = (s && s.v) || {};
  const w = A.agua && !A.agua.plantilla ? A.agua : null;
  const anual = [0, 1, 2].map((j) => nc.plan12.reduce((t, m) => t + (+m[j] || 0), 0));
  // Productos de la campaña, sumados por producto
  const prods = new Map(); let mo = 0;
  CALC.MESES.forEach((mm, k) => {
    for (const l of FERT.mes(p, camp, k, ix).lineas) {
      if (!(l.w > 0)) continue;
      const nom = l.prod ? l.prod.nombre : l.nombre, u = l.liquido ? 'L' : 'kg';
      const x = prods.get(nom) || { nombre: nom, u, tipo: tipoProducto(l.prod), riq: l.prod ? `${fmt(l.prod.riq.n, l.prod.riq.n % 1 ? 1 : 0)}-${fmt(l.prod.riq.p2o5, l.prod.riq.p2o5 % 1 ? 1 : 0)}-${fmt(l.prod.riq.k2o, l.prod.riq.k2o % 1 ? 1 : 0)}` : '–', dosis: 0, meses: [], uf: [0, 0, 0] };
      x.dosis += l.w; if (!x.meses.includes(k)) x.meses.push(k);
      x.uf[0] += +l.uf.n || 0; x.uf[1] += +l.uf.p2o5 || 0; x.uf[2] += +l.uf.k2o || 0;
      prods.set(nom, x);
      if (x.tipo === 'Orgánico' && !l.liquido) mo += l.w * sup;
    }
  });
  const textoMeses = (ms) => { ms.sort((a, b2) => a - b2); const r = []; let a = ms[0], z = ms[0]; for (const m of ms.slice(1).concat([null])) { if (m === z + 1) { z = m; continue; } r.push(a === z ? CALC.MESES[a].slice(0, 3) : `${CALC.MESES[a].slice(0, 3)}–${CALC.MESES[z].slice(0, 3)}`); a = z = m; } return r.join(', ').toLowerCase(); };
  const estKg = b.est.reduce((t, e) => t + e.dosis * sup, 0), estMS = b.est.reduce((t, e) => { const tp = CALC.TABLAS.estiercol.find((x) => CALC.norm(x.tipo) === CALC.norm(e.tipo)); return t + (tp && tp.humedo ? 0 : e.dosis * e.ms / 100 * sup); }, 0);
  const rec = [0, 1, 2].map((j) => nc.objetivo[j]);
  const lim = [rec[0] != null ? rec[0] * 1.2 : null, rec[1] != null ? rec[1] * 5 * 1.3 : null, rec[2] != null ? rec[2] * 5 * 1.2 : null];
  const verif = ['N', 'P₂O₅', 'K₂O'].map((nu, j) => ({ nu, rec: rec[j], lim: lim[j], txtLim: j === 0 ? 'necesidad + 20 %' : `5 años + ${j === 1 ? 30 : 20} %`, aport: anual[j], ok: lim[j] == null ? null : anual[j] <= lim[j] + 0.05 }));
  if (p.vulnerable) { const lo = +db.config.limiteNOrganico || 170; verif.push({ nu: 'N orgánico', rec: null, lim: lo, txtLim: 'zona vulnerable', aport: b.nOrgTotal, ok: b.nOrgTotal <= lo + 0.05 }); }
  const nombreHoja = `Hoja ${n}: ${p.cultivo || p.tipoCultivo || 'cultivo'}${p.finca ? ' · ' + p.finca : ''}`;
  return {
    n, nombre: nombreHoja, corto: `Hoja ${n}`, plan: p.nombre, finca: p.finca || '', cultivo: p.cultivo || p.tipoCultivo || '', tipoCultivo: p.tipoCultivo || '', sup, arboles: p.arboles, anio: p.anioPlantacion,
    vulnerable: !!p.vulnerable, prod: b.prod, coef: b.coef,
    suelo: { origen: s ? (esCarto(s) ? `Cartografía de suelos${s.ref ? ' (' + s.ref + ')' : ''}` : `Analítica ${fechaEs(s.fecha)}${s.ref ? ' · ' + s.ref : ''}`) : 'Sin datos', carto: esCarto(s), mo: sv.mo, ph: sv.ph, ce: sv.ce, ntotal: sv.ntotal, no3: sv.no3, p2o5: sv.p != null ? sv.p * P_A_P2O5 : null, k2o: sv.k != null ? ((s.u || {}).k === 'meq/100 g' ? sv.k * 391 : sv.k) * K_A_K2O : null, caliza: sv.caliza, textura: sv.textura || p.textura || '' },
    agua: { nombre: w ? (w.nombre || 'Analítica de agua') + (w.fecha ? ' · ' + fechaEs(w.fecha) : '') : 'Sin analítica de agua', m3: b.dosisRiego, riegos: CALC.riego(p, camp, cfg()).filas.reduce((t, f) => t + (f.n || 0), 0), aporte: nc.agua.slice(0, 5) },
    balance: { S1: b.S1, E1: b.E1, E2: b.E2, E3: b.E3, E4: b.E4, aporte: b.aporte },
    rec, anual, verif,
    productos: [...prods.values()].sort((a, b2) => a.meses[0] - b2.meses[0] || a.nombre.localeCompare(b2.nombre, 'es')).map((x) => ({ ...x, total: x.dosis * sup, cuando: textoMeses(x.meses.slice()) })),
    totUP: anual.map((v) => v * sup), estKg, estMS, moKg: mo, recintos: (p.sigpac || []).map((r) => ({ ...r, cultivo: p.cultivo || p.tipoCultivo || '' }))
  };
}
/* Programa de actuación de zonas vulnerables en vigor (Orden de 16 de junio de 2016, BORM nº 140) */
function textoVulnerable(planes) {
  const vs = planes.filter((p) => p.vulnerable); if (!vs.length) return '';
  const ex = [...new Set(vs.map((p) => CALC.TABLAS.exclusion[p.grupo]).filter(Boolean).map((e) => e.txt))];
  return ` En ${vs.length === planes.length ? 'la unidad de producción, situada' : 'las hojas situadas'} en zona vulnerable se aplica además el programa de actuación de la Región de Murcia (Orden de 16 de junio de 2016): no se aportará nitrógeno en los periodos de exclusión de su tabla 1${ex.length ? ' (' + ex.join('; ') + ')' : ''}; se fertirrigará al menos una vez por semana; los riegos no superarán 5 horas seguidas; ante previsión de lluvias de más de 15 mm/día se reajustarán riego y fertilización; el nitrógeno de origen orgánico no superará 170 kg N/ha y año; se dejarán 3 m sin abonar junto a cursos de agua y 50 m alrededor de pozos, fuentes y aljibes para consumo humano, y se hará una analítica de suelo al inicio de cada campaña (pH, CE, textura, materia orgánica, N total, nitratos y fósforo) y una de agua al menos cada dos años.`;
}
function faltasRD(cliente, planes, campKey) {
  const t = db.titulares[cliente] || {}, c = db.config.rd || {}, f = [];
  if (!t.nif) f.push('NIF del titular'); if (!t.rea) f.push('código REA/SIEX');
  if (!c.registro) f.push('nº de registro del asesor (Ajustes)'); if (!c.precipitacion) f.push('precipitación media (Ajustes)');
  for (const p of planes) {
    const q = [], camp = p.campanas && p.campanas[campKey], s = anal(p.analSuelo);
    if (!camp) q.push(`sin campaña ${campKey}`);
    if (!(p.sigpac || []).length) q.push('recintos SIGPAC');
    else { const st = p.sigpac.reduce((t, r) => t + (+r.sup || 0), 0); if (p.superficie && Math.abs(st - p.superficie) > 0.01) q.push(`los recintos suman ${fmt(st, 2)} ha y el plan tiene ${fmt(p.superficie, 2)} ha`); }
    if (!s || s.plantilla) q.push('datos de suelo');
    if (camp && !CALC.num(camp.produccionEst)) q.push('producción estimada');
    if (camp && !(camp.necesidades || []).some((x) => CALC.num(x))) q.push('necesidades');
    if (q.length) f.push(`${p.nombre}: ${q.join(', ')}`);
  }
  return f;
}
function datosRD(cliente, planes, campKey) {
  const t = db.titulares[cliente] || {}, c = db.config.rd || {};
  const hojas = planes.map((p) => p).sort((a, b) => (a.tipoCultivo || '').localeCompare(b.tipoCultivo || '', 'es') || a.nombre.localeCompare(b.nombre, 'es'))
    .map((p, k) => datosHojaRD(p, campKey, k + 1)).filter(Boolean).map((h, k) => ({ ...h, n: k + 1, nombre: h.nombre.replace(/^Hoja \d+/, `Hoja ${k + 1}`), corto: `Hoja ${k + 1}` }));
  if (!hojas.length) return null;
  const titular = planes.map((p) => p.titular).find(Boolean) || cliente;
  const supT = hojas.reduce((s, h) => s + h.sup, 0);
  const cultivos = [...new Set(hojas.map((h) => h.cultivo).filter(Boolean))];
  const conf = db.config.planAnual || {};
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    campana: campKey, cliente,
    general: [['Titular de la explotación', titular], ['NIF', t.nif || ''], ['Código SIEX / REA', t.rea || ''], ['Unidad de producción', t.up || `UP-01 – Explotación de ${titular}`], ['Campaña agrícola', campKey], ['Fecha de elaboración', fechaEs(hoy)], ['Plan elaborado por', c.asesor || db.config.autor || ''], ['Técnico asesor (nº de registro)', c.registro || '']],
    cultivos: cultivos.join(', '), supT, hojas,
    regimen: 'Regadío, riego localizado por goteo con fertirrigación',
    rotacion: 'Cultivo leñoso permanente, sin rotación (Anexo III, parte I.1.b: el plan cubre los cálculos de un año).',
    precipitacion: c.precipitacion ? `${c.precipitacion} mm/año de media` : '', lluvia: rdTxt('lluvia'),
    metodo: RD_TXT.metodo, aplicacion: conf.aplicacion || TEXTO_APLICACION,
    totUP: [0, 1, 2].map((j) => hojas.reduce((s, h) => s + h.totUP[j], 0)), estKg: hojas.reduce((s, h) => s + h.estKg, 0), estMS: hojas.reduce((s, h) => s + h.estMS, 0), moKg: hojas.reduce((s, h) => s + h.moKg, 0),
    objetivoMO: rdTxt('objetivoMO'), medidas: conf.medidas || TEXTO_MEDIDAS, prohibiciones: rdTxt('prohibiciones') + textoVulnerable(planes), almacenamiento: rdTxt('almacenamiento'), proteccion: rdTxt('proteccion'), asesoramiento: rdTxt('asesoramiento'), cuaderno: rdTxt('cuaderno'),
    autor: c.asesor || db.config.autor || '', recintos: hojas.flatMap((h) => h.recintos.map((r) => ({ ...r, hoja: h.corto })))
  };
}
