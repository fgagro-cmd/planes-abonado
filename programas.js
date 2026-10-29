'use strict';
/* Planes de abonado · FG Agro — programas tipo (1.8.0).
   Un programa tipo guarda los 12 meses de un plan bien hecho: productos (producto, dosis, formato, riegos, periodo, tanque),
   nº de riegos, horas por riego y el patrón de días de la semana del calendario. Se carga en otro plan desde Fertirrigación
   (este mes o toda la campaña) y luego se pulsa «Ajustar al objetivo». Usa lo que define app.js (db, ui, CALC, FERT, commit…). */

const NOMBRE_PROGRAMA = { CITRICOS: 'Cítricos adultos', FRUTALES: 'Frutales', ALMENDRO: 'Almendro', OLIVOS: 'Olivo' };
const DSEM_TXT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/* Copia de los 12 meses de la campaña de un plan */
function mesesDePlan(p, campKey) {
  const camp = p.campanas && p.campanas[campKey]; if (!camp) return null;
  return CALC.MESES.map((_, i) => {
    const lineas = structuredClone((camp.fert && camp.fert[i] && camp.fert[i].lineas) || [])
      .map(({ prodId, nombre, dosis, formato, riegos, periodo, tanque }) => ({ prodId: prodId || null, nombre: nombre || '', dosis: +dosis || 0, formato: formato || 'pie', riegos: +riegos || 0, periodo: periodo || '', tanque: tanque || null }));
    const rg = (camp.riego && camp.riego[i]) || {};
    const dias = FERT.calendario(p, camp, campKey, i).dias;
    const dsem = [...new Set(dias.map((d) => FERT.diaSemana(campKey, i, d)))].sort((a, b) => a - b);
    const q = dias.length && dias.every((d) => d <= 15) ? '1' : dias.length && dias.every((d) => d > 15) ? '2' : 'ambas';
    return { lineas, riego: { h: +rg.h || 0, n: +rg.n || 0 }, dsem, q };
  });
}

/* Días del mes de destino con el mismo patrón de días de la semana, ajustados al nº de riegos */
function diasPorPatron(mes, campKey, i) {
  const n = mes.riego.n || 0; if (!n) return [];
  const D = FERT.diasDelMes(campKey, i);
  const enQ = (d) => mes.q === '1' ? d <= 15 : mes.q === '2' ? d > 15 : true;
  let dias = [];
  for (let d = 1; d <= D; d++) if (enQ(d) && mes.dsem.includes(FERT.diaSemana(campKey, i, d))) dias.push(d);
  if (dias.length > n) dias = dias.slice(0, n); // sobran: se quitan los últimos del mes, como el patrón automático
  for (let k = 0; dias.length < n && k < 31; k++) { // faltan: se añaden donde más hueco hay
    const qs = mes.q === 'ambas' ? (dias.filter((d) => d <= 15).length <= dias.filter((d) => d > 15).length ? '1' : '2') : mes.q;
    const otro = FERT.masDia(dias, campKey, i, qs);
    if (otro.length === dias.length) { const alt = FERT.masDia(dias, campKey, i, qs === '1' ? '2' : '1'); if (alt.length === dias.length) break; dias = alt; } else dias = otro;
  }
  return dias.sort((a, b) => a - b);
}

const resumenMes = (mes) => mes.lineas.length ? `${plural(mes.lineas.length, 'producto', 'productos')} · ${mes.riego.n || 0} riegos de ${hhmm(mes.riego.h) || '0:00'} h${mes.dsem.length ? ' · ' + mes.dsem.map((k) => DSEM_TXT[k]).join('') : ''}` : (mes.riego.n ? `sin productos · ${mes.riego.n} riegos de ${hhmm(mes.riego.h) || '0:00'} h` : 'vacío');

/* ---------- Guardar el plan como programa tipo ---------- */
function guardarComoPrograma(p) {
  const meses = mesesDePlan(p, ui.camp);
  if (!meses || !meses.some((m) => m.lineas.length)) { toast(`El plan no tiene productos en la campaña ${ui.camp}`, true); return; }
  const progs = db.programas || [];
  const sug = NOMBRE_PROGRAMA[p.grupo] || p.tipoCultivo || 'Programa';
  const mismo = progs.find((x) => x.grupo === p.grupo) || null;
  const m = modal('Guardar como programa tipo', `
    <p class="small">Guarda los 12 meses de <b>${esc(p.nombre)}</b> (campaña ${esc(ui.camp)}): productos y dosis, nº de riegos, horas y los días de la semana del calendario.</p>
    <div class="grid2">
      <label class="fld"><span>Guardar en</span><select id="pgDest"><option value="">Programa nuevo</option>${progs.map((x) => `<option value="${x.id}" ${mismo && mismo.id === x.id ? 'selected' : ''}>Sustituir «${esc(x.nombre)}»</option>`).join('')}</select></label>
      <label class="fld"><span>Nombre</span><input id="pgNom" value="${esc(mismo ? mismo.nombre : sug)}"></label>
      <label class="fld"><span>Grupo (sale elegido en estos planes)</span><select id="pgGru">${CALC.GRUPOS.map((g) => `<option ${g === (mismo ? mismo.grupo : p.grupo) ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    </div>
    <div class="scroll-x" style="margin-top:10px"><table class="t"><tr><th>Mes</th><th>Contenido</th></tr>${meses.map((x, i) => `<tr><td>${CALC.MESES[i]}</td><td class="small">${esc(resumenMes(x))}</td></tr>`).join('')}</table></div>`,
  { pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn p" id="pgOk">Guardar</button>', ancho: true });
  $$('[data-cerrar]', m).forEach((b) => { b.onclick = cerrarModal; });
  $('#pgDest', m).onchange = (e) => { const x = progs.find((y) => y.id === e.target.value); $('#pgNom', m).value = x ? x.nombre : sug; if (x) $('#pgGru', m).value = x.grupo; };
  $('#pgOk', m).onclick = () => {
    const dest = $('#pgDest', m).value, nombre = $('#pgNom', m).value.trim() || sug, grupo = $('#pgGru', m).value;
    if (dest && !confirm(`¿Sustituir el programa «${progs.find((x) => x.id === dest).nombre}» por los meses de ${p.nombre}?`)) return;
    commit((d) => {
      d.programas = d.programas || [];
      const obj = { id: dest || uid('pg'), nombre, grupo, origen: { planId: p.id, plan: p.nombre, campana: ui.camp }, guardado: new Date().toISOString(), meses };
      const k = d.programas.findIndex((x) => x.id === dest);
      if (k >= 0) d.programas[k] = obj; else d.programas.push(obj);
    }, { render: false });
    cerrarModal(); toast(`Programa «${nombre}» guardado`);
  };
}

/* ---------- Cargar un programa tipo en el plan ---------- */
function cargarPrograma(p, i) {
  const progs = (db.programas || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (!progs.length) {
    const m = modal('Programa tipo', `<p>Aún no hay programas tipo. Abre un plan bien hecho y pulsa <b>«Guardar como programa tipo»</b>.</p>`, { pie: `<button class="btn" data-cerrar>Cerrar</button><button class="btn p" id="pgG">Guardar este plan como programa tipo</button>` });
    $$('[data-cerrar]', m).forEach((b) => { b.onclick = cerrarModal; });
    $('#pgG', m).onclick = () => { cerrarModal(); guardarComoPrograma(p); };
    return;
  }
  const camp = p.campanas[ui.camp];
  const conLineas = (k) => !!(camp.fert && camp.fert[k] && camp.fert[k].lineas && camp.fert[k].lineas.length);
  const st = { id: (progs.find((x) => x.grupo === p.grupo) || progs[0]).id, todo: false, modo: 'sust' };
  const m = modal('Cargar programa tipo', '<div id="pgCuerpo"></div>', { pie: '<button class="btn" id="pgGuardar" style="margin-right:auto">Guardar este plan como programa…</button><button class="btn" data-cerrar>Cancelar</button><button class="btn p" id="pgOk">Cargar</button>', ancho: true });
  const pinta = () => {
    const pg = progs.find((x) => x.id === st.id);
    const meses = st.todo ? CALC.MESES.map((_, k) => k) : [i];
    const ocupados = meses.filter(conLineas);
    $('#pgCuerpo', m).innerHTML = `
      <div class="grid2">
        <label class="fld"><span>Programa</span><select id="pgSel">${progs.map((x) => `<option value="${x.id}" ${x.id === st.id ? 'selected' : ''}>${esc(x.nombre)} · ${esc(x.grupo)}</option>`).join('')}</select>
          <span class="auto">De ${esc(pg.origen.plan)} · ${esc(pg.origen.campana)} · guardado el ${fechaEs(pg.guardado)}</span></label>
        <div class="fld"><span>Qué meses</span><div class="filtros"><button data-pgt="0" aria-pressed="${!st.todo}">Solo ${CALC.MESES[i].toLowerCase()}</button><button data-pgt="1" aria-pressed="${st.todo}">Toda la campaña ${esc(ui.camp)}</button></div></div>
      </div>
      ${ocupados.length ? `<div class="aviso" style="display:block;margin-top:10px"><b>${ocupados.length === 1 && !st.todo ? 'Este mes ya tiene productos.' : `${plural(ocupados.length, 'mes ya tiene', 'meses ya tienen')} productos (${ocupados.map((k) => CALC.MESES[k].slice(0, 3).toLowerCase()).join(', ')}).`}</b>
        <div class="filtros" style="margin-top:6px"><button data-pgm="sust" aria-pressed="${st.modo === 'sust'}">Sustituir sus productos</button><button data-pgm="add" aria-pressed="${st.modo === 'add'}">Añadirlos a los que hay</button></div></div>` : ''}
      <p class="small muted" style="margin-top:10px">Se copian también el nº de riegos, las horas de riego y el calendario (mismos días de la semana). ${p.caudal && pg.origen.planId !== p.id ? 'Si esta finca tiene otro caudal o marco, cambian los m³/ha y el N del agua: revisa el balance.' : ''} Después pulsa <b>«Ajustar al objetivo»</b> en cada mes.</p>
      <div class="scroll-x"><table class="t"><tr><th>Mes</th><th>Programa</th><th>Ahora en este plan</th></tr>${meses.map((k) => { const ah = mesesDePlan(p, ui.camp)[k]; return `<tr><td>${CALC.MESES[k]}</td><td class="small">${esc(resumenMes(pg.meses[k]))}</td><td class="small muted">${esc(resumenMes(ah))}</td></tr>`; }).join('')}</table></div>
      ${!st.todo && pg.meses[i].lineas.length ? `<table class="t" style="margin-top:8px"><tr><th>Producto</th><th class="n">Dosis</th><th>Formato</th><th class="n">Riegos</th><th>Periodo</th></tr>${pg.meses[i].lineas.map((l) => `<tr><td>${esc(l.nombre)}</td><td class="n">${fmt(l.dosis, 2)}</td><td>${l.formato === 'ha' ? 'por ha y riego' : 'por árbol y riego'}</td><td class="n">${l.riegos}</td><td>${esc(l.periodo || '')}</td></tr>`).join('')}</table>` : ''}`;
    $('#pgSel', m).onchange = (e) => { st.id = e.target.value; pinta(); };
    $$('[data-pgt]', m).forEach((b) => { b.onclick = () => { st.todo = b.dataset.pgt === '1'; pinta(); }; });
    $$('[data-pgm]', m).forEach((b) => { b.onclick = () => { st.modo = b.dataset.pgm; pinta(); }; });
  };
  pinta();
  $$('[data-cerrar]', m).forEach((b) => { b.onclick = cerrarModal; });
  $('#pgGuardar', m).onclick = () => { cerrarModal(); guardarComoPrograma(p); };
  $('#pgOk', m).onclick = () => {
    const pg = progs.find((x) => x.id === st.id), meses = st.todo ? CALC.MESES.map((_, k) => k) : [i];
    let nProd = 0;
    commit(() => {
      const c = p.campanas[ui.camp];
      c.fert = c.fert || {}; c.riego = c.riego || CALC.MESES.map(() => ({ h: 0, n: 0 })); c.cal = c.cal || {};
      for (const k of meses) {
        const mes = pg.meses[k]; if (!mes) continue;
        const nuevas = structuredClone(mes.lineas); nProd += nuevas.length;
        c.fert[k] = c.fert[k] || { lineas: [] };
        if (st.modo === 'add' && conLineas(k)) c.fert[k].lineas.push(...nuevas); else c.fert[k].lineas = nuevas;
        c.riego[k] = { ...(c.riego[k] || {}), h: mes.riego.h || 0, n: mes.riego.n || 0 };
        if (mes.riego.n && mes.dsem.length) c.cal[k] = diasPorPatron(mes, ui.camp, k); else delete c.cal[k];
      }
    }, { render: false });
    cerrarModal(); renderDetalleSoloCuerpo();
    toast(`«${pg.nombre}» cargado en ${st.todo ? 'toda la campaña' : CALC.MESES[i].toLowerCase()} (${plural(nProd, 'producto', 'productos')}). Pulsa «Ajustar al objetivo».`);
  };
}

/* ---------- Ajustes: lista de programas ---------- */
function htmlProgramasAjustes() {
  const progs = db.programas || [];
  return `<div class="card"><h3>Programas tipo</h3>
    <p class="small muted">Se crean desde Fertirrigación › «Programa tipo» › «Guardar este plan como programa…». Para cambiar uno, vuelve a guardarlo desde un plan y elige sustituirlo.</p>
    ${progs.length ? `<table class="t"><tr><th>Nombre</th><th>Grupo</th><th>Creado desde</th><th class="n">Meses con productos</th><th></th></tr>${progs.map((x) => `<tr>
      <td><input class="cell izq" data-pgn="${x.id}" value="${esc(x.nombre)}" style="min-width:170px"></td>
      <td><select class="cell izq" data-pgg="${x.id}" style="width:auto">${CALC.GRUPOS.map((g) => `<option ${g === x.grupo ? 'selected' : ''}>${g}</option>`).join('')}</select></td>
      <td class="small">${esc(x.origen.plan)} · ${esc(x.origen.campana)} · ${fechaEs(x.guardado)}</td>
      <td class="n">${x.meses.filter((mm) => mm.lineas.length).length}</td>
      <td><button class="btn peq rojo" data-pgdel="${x.id}">Borrar</button></td></tr>`).join('')}</table>` : '<p class="small muted">Aún no hay programas tipo.</p>'}</div>`;
}
function enlazarProgramasAjustes(v) {
  $$('[data-pgn]', v).forEach((i) => { i.onchange = () => commit((d) => { const x = d.programas.find((y) => y.id === i.dataset.pgn); if (x) x.nombre = i.value.trim() || x.nombre; }, { render: false }); });
  $$('[data-pgg]', v).forEach((i) => { i.onchange = () => commit((d) => { const x = d.programas.find((y) => y.id === i.dataset.pgg); if (x) x.grupo = i.value; }, { render: false }); });
  $$('[data-pgdel]', v).forEach((b) => { b.onclick = () => { const x = db.programas.find((y) => y.id === b.dataset.pgdel); if (!x || !confirm(`¿Borrar el programa «${x.nombre}»? Los planes no cambian.`)) return; commit((d) => { d.programas = d.programas.filter((y) => y.id !== x.id); }); }; });
}
