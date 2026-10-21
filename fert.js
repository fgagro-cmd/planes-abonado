'use strict';
/* Planes de abonado · FG Agro — fertirrigación del mes (fase 3). Sin DOM: se puede probar fuera del navegador.
   Replica los bloques mensuales de la pestaña 4. FERTIRRIGACION del Excel: dosis por pie (g o cc) o por ha (kg o L)
   por riego × nº de riegos → kg/ha (× densidad) → UF; tanques; solución nutritiva y ácido. */
(function (root) {
  const C = (typeof module !== 'undefined' && module.exports) ? require('./calc.js') : root.CALC;
  const RIQ = ['n', 'p2o5', 'k2o', 'cao', 'mgo', 's', 'fe', 'zn', 'mn', 'no3', 'nh4'];
  const NUT = ['n', 'p2o5', 'k2o', 'cao', 'mgo'];
  const PERIODOS = ['Resto mes', 'Inicio mes', 'Mitad mes', 'Final mes', '1ª quincena', '2ª quincena', '1 x quincena', '2 x quincena', '1ª semana', '2ª semana', 'Última semana', '1 x semana'];
  const n0 = C.n0, norm = C.norm;

  /* ---------- Productos ---------- */
  function indice(productos) {
    const id = new Map(), nom = new Map();
    for (const p of productos || []) { id.set(p.id, p); for (const n of [p.nombre, ...(p.alias || [])]) { const k = norm(n); if (k && !nom.has(k)) nom.set(k, p); } }
    return { id, nom };
  }
  const prodDe = (ix, l) => (l.prodId && ix.id.get(l.prodId)) || ix.nom.get(norm(l.nombre)) || null;

  /* Familia de los especiales: los orgánicos van siempre en un E aparte de quelatos y bioestimulantes */
  function familiaPorNombre(nombre) {
    const k = norm(nombre);
    if (/pedrin|organ|amino|amifol|humic|evobacter|fort soil|mas raiz|ibermar/.test(k)) return 'organico';
    if (/quelato|rexolin|sequestrene|bolikel|hierro|vanguard|ambra|tarafol twist|citrus mg/.test(k)) return 'micro';
    return 'bio';
  }
  /* Lee la hoja del Excel de productos (filas como listas: cabecera + datos) */
  function productosDesdeFilas(filas, uid) {
    const cab = (filas[0] || []).map((c) => norm(c).replace(/[^a-z0-9]/g, ''));
    const col = (n) => cab.indexOf(n);
    const idx = { nombre: col('fertilizante'), n: col('n'), p2o5: col('p2o5'), k2o: col('k2o'), cao: col('cao'), mgo: col('mgo'), s: col('s'), fe: col('fe'), zn: col('zn'), mn: col('mn'), no3: col('no3'), nh4: col('nh4'), densidad: col('densidad'), obs: col('observaciones') };
    const out = [], vistos = new Set();
    for (const f of filas.slice(1)) {
      const nombre = String(f[idx.nombre] ?? '').trim();
      if (!nombre || vistos.has(norm(nombre))) continue;
      vistos.add(norm(nombre));
      const riq = {}; for (const r of RIQ) riq[r] = C.num(f[idx[r]]) || 0;
      const obs = String(f[idx.obs] ?? '').trim();
      out.push({ id: uid ? uid('pr') : 'pr' + out.length, nombre, riq, densidad: C.num(f[idx.densidad]) || 1, tanque: '1', familia: familiaPorNombre(nombre), notas: obs && obs !== 'Funciona' ? obs : '', mxId: null, activo: true });
    }
    return out;
  }
  /* Tanque habitual de cada producto según lo que Francis puso en los Excels (1, 2 o E) */
  function tanquesHabituales(db) {
    const cuenta = new Map();
    for (const p of db.planes) for (const c of Object.values(p.campanas || {})) for (const m of (c.excel && c.excel.meses) || []) for (const l of m) {
      const t = String(l.tanque || '').toUpperCase(); const k = norm(l.producto);
      const v = t.startsWith('E') ? 'E' : t === '2' ? '2' : t === '1' || t === '3' ? '1' : null;
      if (!v) continue;
      if (!cuenta.has(k)) cuenta.set(k, { 1: 0, 2: 0, E: 0 });
      cuenta.get(k)[v]++;
    }
    const out = new Map();
    for (const [k, c] of cuenta) out.set(k, Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]);
    return out;
  }

  /* ---------- Líneas del mes ---------- */
  const PERIODO_FIJO = (t) => { const k = norm(t).replace(/\s+/g, ' '); return k.replace(/^inico/, 'inicio').replace(/de mes|del mes/, 'mes').replace(/finales? de mes/, 'final mes'); };
  /* Tanque final de cada línea: el puesto a mano se respeta; los automáticos de E se agrupan por momento del mes y clase */
  function tanques(lineas, ix) {
    const usados = new Set(lineas.filter((l) => /^E\d+$/i.test(l.tanque || '')).map((l) => +String(l.tanque).slice(1)));
    const porClave = new Map();
    let sig = 1;
    return lineas.map((l) => {
      if (l.tanque) return String(l.tanque).toUpperCase();
      const p = prodDe(ix, l);
      const base = p ? p.tanque : '1';
      if (base !== 'E') return base;
      const k = PERIODO_FIJO(l.periodo) + '|' + (p && p.familia === 'organico' ? 'org' : 'otro');
      if (!porClave.has(k)) { while (usados.has(sig)) sig++; porClave.set(k, sig); usados.add(sig); }
      return 'E' + porClave.get(k);
    });
  }
  function arbHaReal(plan) { return n0(plan.superficie) ? n0(plan.arboles) / n0(plan.superficie) : 0; }
  /* Cantidad del mes por ha (kg o L) y en kg (× densidad), como las columnas W y X del Excel */
  function cantidad(plan, l, p) {
    const d = n0(l.dosis), r = n0(l.riegos);
    const w = l.formato === 'ha' ? d * r : d * arbHaReal(plan) * r / 1000;
    return { w, kg: w * (p ? n0(p.densidad) || 1 : 1) };
  }
  function mes(plan, camp, i, ix) {
    const fm = camp && camp.fert && camp.fert[i];
    const lineas = (fm && fm.lineas) || [];
    const tq = tanques(lineas, ix);
    const sup = n0(plan.superficie), arb = arbHaReal(plan);
    const tot = Object.fromEntries(RIQ.map((r) => [r, 0]));
    let sinProducto = 0;
    const res = lineas.map((l, k) => {
      const p = prodDe(ix, l);
      if (!p) sinProducto++;
      const c = cantidad(plan, l, p);
      const uf = Object.fromEntries(RIQ.map((r) => [r, p ? n0(p.riq[r]) / 100 * c.kg : 0]));
      for (const r of RIQ) tot[r] += uf[r];
      const porRiegoHa = n0(l.riegos) ? c.w / n0(l.riegos) : 0;
      return { ...l, prod: p, tanqueFinal: tq[k], tanqueAuto: !l.tanque, w: c.w, kg: c.kg, uf, porRiegoFinca: porRiegoHa * sup, porPie: l.formato === 'ha' ? (arb ? porRiegoHa * 1000 / arb : 0) : n0(l.dosis), liquido: p ? n0(p.densidad) > 1.001 : false };
    });
    return { lineas: res, uf: NUT.map((r) => tot[r]), micro: { s: tot.s, fe: tot.fe, zn: tot.zn, mn: tot.mn, no3: tot.no3, nh4: tot.nh4 }, sinProducto, tot };
  }
  const hayFert = (camp) => !!(camp && camp.fert && Object.values(camp.fert).some((m) => m && m.lineas && m.lineas.length));
  /* UF de los 12 meses: de las líneas si hay fertirrigación; si no, null */
  function ufCampana(plan, camp, ix) {
    if (!hayFert(camp) || !ix || !ix.id.size) return null; // sin productos todavía: vale lo importado del Excel
    return C.MESES.map((_, i) => mes(plan, camp, i, ix).uf);
  }

  /* ---------- Solución nutritiva del mes (para ajustar; columnas AB:AN y filas 40-43 del Excel) ---------- */
  function solucion(plan, camp, i, m, agua, cfg) {
    const rg = C.riego(plan, camp, cfg);
    const m3 = rg.filas[i].vApl; // m3/ha aplicados en el mes
    const v = (agua && agua.v) || {};
    if (!m3) return null;
    const conc = (kg) => kg * 1000 / m3; // g/m3 = mg/L
    const t = m.tot;
    const meq = {
      no3: 0, nh4: 0, // abajo, con las riquezas NO3 y NH4 de cada producto
      h2po4: conc(t.p2o5) / 70.97, k: conc(t.k2o) / 1000 * 100 * 0.213 + n0(v.k) / 39.1,
      ca: n0(v.ca) * 2 / 40.08 + conc(t.cao) * 0.715 / 40.1 * 2, mg: n0(v.mg) * 2 / 24.3 + conc(t.mgo) * 0.603 / 24.3 * 2,
      so4: n0(v.so4) / 48 + conc(t.s) * 1.242 * 2 / 96.1, na: n0(v.na) / 23, cl: n0(v.cl) / 35.5, hco3: n0(v.hco3)
    };
    // NO3 y NH4: las columnas NO3- y NH4+ de los productos son % de N en cada forma
    let no3 = 0, nh4 = 0;
    for (const l of m.lineas) if (l.prod) { no3 += n0(l.prod.riq.no3) / 100 * l.kg; nh4 += n0(l.prod.riq.nh4) / 100 * l.kg; }
    meq.no3 = n0(v.no3) / 62 + conc(no3) / 14;
    meq.nh4 = conc(nh4) / 14;
    const cat = meq.nh4 + meq.k + meq.ca + meq.mg + meq.na;
    const an = meq.no3 + meq.h2po4 + meq.so4 + meq.cl + meq.hco3;
    const baseCat = meq.k + meq.ca + meq.mg + meq.na, baseAn = meq.no3 + meq.h2po4 + meq.so4 + meq.cl;
    const pct = (x, b) => (b ? x / b * 100 : null);
    const acido = Math.max(0, meq.hco3 - 0.5);
    return {
      m3, meq, ce: (cat + an) / 20, cat, an,
      cationes: [['K', pct(meq.k, baseCat), [25, 45]], ['Ca', pct(meq.ca, baseCat), [35, 55]], ['Mg', pct(meq.mg, baseCat), [17, 23]], ['Na', pct(meq.na, baseCat), [0, 15]]],
      aniones: [['NO3', pct(meq.no3, baseAn), [35, 65]], ['H2PO4', pct(meq.h2po4, baseAn), [3, 12]], ['SO4', pct(meq.so4, baseAn), [25, 45]], ['Cl', pct(meq.cl, baseAn), [0, 20]]],
      nh4pct: pct(meq.nh4, meq.no3 + meq.nh4),
      micro: { fe: conc(t.fe), zn: conc(t.zn), mn: conc(t.mn), b: n0(v.b) },
      acidoNitrico: acido * 0.0865 * m3 * 0.75, acidoFosforico: acido * 0.1134 * m3 * 0.75
    };
  }

  /* ---------- Ajustar al objetivo: cambia las dosis de los abonos de los tanques 1 y 2 ---------- */
  function ajustar(plan, camp, i, ix, objetivo) {
    const m = mes(plan, camp, i, ix);
    const fijos = [0, 0, 0, 0, 0];
    const vars = [];
    m.lineas.forEach((l, k) => {
      const contrib = l.uf ? NUT.map((r) => l.uf[r]) : [0, 0, 0, 0, 0];
      const principal = l.prod && !/^E/i.test(l.tanqueFinal) && ['n', 'p2o5', 'k2o'].some((r) => n0(l.prod.riq[r]) > 0) && n0(l.riegos) > 0;
      if (!principal) { contrib.forEach((x, j) => { fijos[j] += x; }); return; }
      // Variable = multiplicador de la dosis actual (se prefiere cambiar poco el reparto entre abonos)
      if (!(n0(l.dosis) > 0)) { contrib.forEach((x, j) => { fijos[j] += x; }); return; }
      vars.push({ k, m: 1, d0: n0(l.dosis), a: contrib, formato: l.formato });
    });
    const t = objetivo.map((x) => n0(x));
    const activos = [0, 1, 2]; // se cuadran N, P2O5 y K2O; Ca y Mg no se tocan
    const w = t.map((x) => 1 / Math.max(x, 2) ** 2);
    const LAMBDA = 0.05;
    const suma = (j) => fijos[j] + vars.reduce((s, v) => s + v.m * v.a[j], 0);
    for (let it = 0; it < 400; it++) {
      for (const v of vars) {
        let num = LAMBDA, den = LAMBDA;
        for (const j of activos) { const resto = suma(j) - v.m * v.a[j]; num += w[j] * v.a[j] * (t[j] - resto); den += w[j] * v.a[j] * v.a[j]; }
        v.m = Math.max(0, num / den);
      }
    }
    for (const v of vars) v.x = v.m * v.d0;
    const redondeo = (x, f) => { const paso = f === 'ha' ? (x < 10 ? 0.5 : 1) : (x < 20 ? 0.5 : 1); return Math.round(x / paso) * paso; };
    const dosis = {}; for (const v of vars) dosis[v.k] = redondeo(v.x, v.formato);
    const faltan = NUT.slice(0, 3).map((r, j) => (t[j] > 0.5 && !vars.some((v) => v.a[j] > 0) && fijos[j] < t[j] * 0.5 ? C.NUTRIENTES[j] : null)).filter(Boolean);
    const resultado = [0, 1, 2].map((j) => fijos[j] + vars.reduce((s2, v) => s2 + (dosis[v.k] / (v.d0 || 1)) * v.a[j], 0));
    const lejos = [0, 1, 2].filter((j) => t[j] > 0.5 && Math.abs(resultado[j] - t[j]) / t[j] > 0.15).map((j) => ({ nutriente: C.NUTRIENTES[j], queda: resultado[j], objetivo: t[j] }));
    return { dosis, faltan, nVars: vars.length, resultado, lejos };
  }

  /* ---------- Importación desde los Excels: bloques mensuales → líneas ---------- */
  function fertDesdeExcel(meses) {
    const out = {};
    (meses || []).forEach((m, i) => {
      const lineas = [];
      for (const l of m || []) {
        const f = norm(l.formato);
        if (!l.producto || !(f === 'dosis pie' || f === 'por ha')) continue;
        const t = String(l.tanque || '').trim().toUpperCase();
        lineas.push({ prodId: null, nombre: l.producto, dosis: C.num(l.dosis) || 0, formato: f === 'por ha' ? 'ha' : 'pie', riegos: C.num(l.riegos) || 0, periodo: l.periodo || '', tanque: /^(1|2|3|E\d*)$/.test(t) ? (t === 'E' ? 'E1' : t === '3' ? '1' : t) : null });
      }
      if (lineas.length) out[i] = { lineas };
    });
    return out;
  }


  /* ---------- Calendario de riego del mes (fase 4) ----------
     plan.patron = { modo: 'auto' | 'semana' | 'todos' | 'ninguno', dias: [0..6] (0 = lunes), quincena: 'ambas' | '1' | '2' }
       auto: reparte el nº de riegos del mes · semana: días fijos (L, X, V…) · como los patrones del Lanzador (opción A)
     camp.cal[i] = días puestos a mano ese mes (al pulsar un día o con +1/−1 en una quincena). Sin él, sale del patrón. */
  const diasDelMes = (anio, i) => new Date(Number(anio), i + 1, 0).getDate();
  const diaSemana = (anio, i, d) => (new Date(Number(anio), i, d).getDay() + 6) % 7; // 0 = lunes
  const rangoQ = (anio, i, q) => { const D = diasDelMes(anio, i), a = q === '2' ? 16 : 1, b = q === '1' ? 15 : D, r = []; for (let d = a; d <= b; d++) r.push(d); return r; };
  function repartir(rango, n) {
    if (!n) return [];
    if (n >= rango.length) return rango.slice();
    const out = new Set();
    for (let k = 0; k < n; k++) out.add(rango[Math.min(rango.length - 1, Math.floor((k + 0.5) * rango.length / n))]);
    return [...out].sort((a, b) => a - b);
  }
  function calendarioAuto(plan, camp, anio, i) {
    const pt = plan.patron || { modo: 'auto', quincena: 'ambas' };
    const rango = rangoQ(anio, i, pt.quincena || 'ambas');
    if (pt.modo === 'ninguno') return [];
    if (pt.modo === 'todos') return rango;
    if (pt.modo === 'semana' && (pt.dias || []).length) return rango.filter((d) => pt.dias.includes(diaSemana(anio, i, d)));
    return repartir(rango, n0(camp && camp.riego && camp.riego[i] && camp.riego[i].n));
  }
  function calendario(plan, camp, anio, i) {
    const manual = camp && camp.cal && Array.isArray(camp.cal[i]) ? camp.cal[i] : null;
    const D = diasDelMes(anio, i);
    const dias = [...new Set(manual || calendarioAuto(plan, camp, anio, i))].filter((d) => d >= 1 && d <= D).sort((a, b) => a - b);
    return { dias, manual: !!manual, total: D, primerDia: diaSemana(anio, i, 1) };
  }
  /* +1: añade el día de la quincena más alejado de los ya marcados · −1: quita el que deja los riegos más repartidos */
  function masDia(dias, anio, i, q) {
    const r = rangoQ(anio, i, q);
    if (r.every((d) => dias.includes(d))) return dias.slice();
    // el centro del hueco más grande entre riegos (los bordes de la quincena cuentan como riego)
    const marcas = [r[0] - 1, ...dias.filter((d) => r.includes(d)), r[r.length - 1] + 1];
    let mejor = null, gap = 0;
    for (let k = 1; k < marcas.length; k++) { const g = marcas[k] - marcas[k - 1]; if (g > gap && g > 1) { gap = g; mejor = Math.floor((marcas[k] + marcas[k - 1]) / 2); } }
    if (mejor == null || dias.includes(mejor)) mejor = r.find((d) => !dias.includes(d));
    return [...dias, mejor].sort((a, b) => a - b);
  }
  function menosDia(dias, anio, i, q) {
    const en = dias.filter((d) => rangoQ(anio, i, q).includes(d));
    if (!en.length) return dias.slice();
    // quita el día con los vecinos más cerca (el hueco que deja es el más pequeño)
    const hueco = (d) => { const k = dias.indexOf(d), a = k > 0 ? dias[k - 1] : 0, b = k < dias.length - 1 ? dias[k + 1] : diasDelMes(anio, i) + 1; return b - a; };
    const peor = en.reduce((a, d) => (hueco(d) < hueco(a) ? d : a), en[0]);
    return dias.filter((d) => d !== peor);
  }
  /* Ácido para limpiar goteros (1 hora): tabla del Excel según los bicarbonatos del agua (cc por m3) × consumo de la finca por hora */
  const ACIDO_LIMPIEZA = { nitrico: [129, 214, 300, 386, 472, 558, 643, 729, 815, 901], fosforico: [123, 205, 286, 368, 450, 532, 614, 696, 778, 859] };
  function acidoLimpieza(plan, agua) {
    const h = n0(agua && agua.v && agua.v.hco3);
    if (!h) return null;
    const k = Math.min(10, Math.max(1, Math.ceil(h))) - 1;
    const consumo = n0(plan.caudal) * n0(plan.emisores) * n0(plan.arboles) / 1000;
    return { nitrico: ACIDO_LIMPIEZA.nitrico[k] / 1000 * consumo, fosforico: ACIDO_LIMPIEZA.fosforico[k] / 1000 * consumo, consumo };
  }

  const api = { diasDelMes, diaSemana, calendarioAuto, calendario, masDia, menosDia, acidoLimpieza, RIQ, NUT, PERIODOS, indice, prodDe, familiaPorNombre, productosDesdeFilas, tanquesHabituales, tanques, cantidad, mes, hayFert, ufCampana, solucion, ajustar, fertDesdeExcel, arbHaReal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FERT = api;
})(typeof window !== 'undefined' ? window : globalThis);
