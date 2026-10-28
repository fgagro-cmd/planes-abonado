'use strict';
/* Planes de abonado · FG Agro — cálculos (sin DOM, se puede probar fuera del navegador).
   Replica las pestañas 1. ANALITICAS, 2. CALCULADORA DE NITRÓGENO y 3. RIEGO del Excel
   Gestion Fertirrigacion v5, rellenando solos fA, fB y la mineralización de la materia orgánica.
   No lleva datos de clientes: solo tablas de bibliografía que se pueden cambiar en Ajustes. */
(function (root) {
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const GRUPOS = ['CITRICOS', 'FRUTALES', 'ALMENDRO', 'OLIVOS'];
  const TEXTURAS = ['Muy arenoso', 'Arenoso', 'Franco', 'Arcilloso'];
  // Tipos de cultivo de los planes (se irán añadiendo más). grupo = columna del Kc y de las tablas.
  const CULTIVOS = [
    { nombre: 'Limonero Fino', grupo: 'CITRICOS', extraccion: 'Limonero' }, { nombre: 'Limonero Verna', grupo: 'CITRICOS', extraccion: 'Limonero' },
    { nombre: 'Pomelo', grupo: 'CITRICOS', extraccion: 'Naranjo' }, { nombre: 'Naranjo temprano', grupo: 'CITRICOS', extraccion: 'Naranjo' },
    { nombre: 'Naranjo media estación', grupo: 'CITRICOS', extraccion: 'Naranjo' }, { nombre: 'Naranjo tardío', grupo: 'CITRICOS', extraccion: 'Naranjo' },
    { nombre: 'Mandarino', grupo: 'CITRICOS', extraccion: 'Mandarino' }, { nombre: 'Albaricoque temprano', grupo: 'FRUTALES', extraccion: 'Albaricoque' },
    { nombre: 'Albaricoque media estación', grupo: 'FRUTALES', extraccion: 'Albaricoque' }, { nombre: 'Melocotón', grupo: 'FRUTALES', extraccion: 'Melocotonero' },
    { nombre: 'Nectarina', grupo: 'FRUTALES', extraccion: 'Melocotonero' }, { nombre: 'Olivo', grupo: 'OLIVOS', extraccion: 'Olivar' },
    { nombre: 'Almendro', grupo: 'ALMENDRO', extraccion: 'Almendro (en cáscara)' }
  ];

  /* Tablas por defecto (pestaña 1 del Excel y Bibliografía). Rangos como [mín, máx]: se usa el valor medio. */
  const TABLAS = {
    fA: [ // Tabla 1. Factor de agotamiento de nitratos (%) según NO3 del suelo (mg/kg)
      { hasta: 40, r: [10, 15] },
      { hasta: Infinity, r: [15, 20] }
    ],
    fACartagena: 40, // NO3 > 100 mg/kg en el Campo de Cartagena
    fB: { // Tabla 2. Minoración por suelo humectado
      lenosos: { menos5: { 1: [0.2, 0.25], 2: [0.4, 0.5] }, mas5: { 1: [0.12, 0.17], 2: [0.24, 0.34] } },
      resto: 1
    },
    mo: { // Tabla 3. N anual del humus (kg N/ha) según MO (%) y textura
      puntos: [0.5, 1, 1.5, 2, 2.5, 3],
      Arenoso: [[10, 15], [20, 30], [30, 45], [45, 60], [55, 80], [75, 90]],
      Franco: [[7, 12], [15, 25], [22, 37], [30, 50], [37, 62], [60, 70]],
      Arcilloso: [[5, 10], [10, 20], [15, 30], [20, 40], [25, 50], [30, 60]]
    },
    estiercol: [ // Tabla 4. Riqueza de N (% s.m.s.) y % de N orgánico mineralizado años 1-3
      { tipo: 'Estiércol bovino', n: [1, 2], min: [50, 30, 20] },
      { tipo: 'Estiércol de oveja y cabra', n: [2, 2.5], min: [45, 25, 30] },
      { tipo: 'Estiércol porcino', n: [1.5, 2], min: [65, 20, 15] },
      { tipo: 'Purines de porcino', n: [0.42, 0.42], min: [75, 15, 10], humedo: true },
      { tipo: 'Gallinaza', n: [2, 5], min: [70, 15, 15] },
      { tipo: 'Estiércol conejo', n: [1.5, 2], min: [60, 30, 10] },
      { tipo: 'Lodos depuradora', n: [2, 7], min: [35, 35, 30] },
      { tipo: 'Compost sólidos urbanos', n: [1, 1.8], min: [40, 30, 30] }
    ],
    msDefecto: 60, // % de materia seca si no hay dato
    // Orden de 16/06/2016 (programa de actuación de zonas vulnerables de la Región de Murcia), tabla 1: meses (0 = enero) sin abonado nitrogenado
    exclusion: {
      CITRICOS: { meses: [10, 11, 0], txt: 'cítricos, de noviembre a enero, salvo variedades sin recolectar con prescripción técnica' },
      ALMENDRO: { meses: [10, 11, 0], txt: 'almendro, de noviembre a enero' },
      OLIVOS: { meses: [10, 11, 0], txt: 'olivar, de noviembre a enero' },
      FRUTALES: { meses: [11, 0], txt: 'frutales de hueso y pepita, de la caída de hoja al inicio de la brotación', aproximado: 'la app avisa en diciembre y enero' }
    },
    horasMaxRiego: 5, // riegos ininterrumpidos de más de 5 h prohibidos en zona vulnerable
    sueloObligatorio: [['ph', 'pH'], ['ce', 'CE'], ['textura', 'textura'], ['mo', 'materia orgánica'], ['ntotal', 'N total'], ['no3', 'nitratos'], ['p', 'fósforo']],
    extraccion: [ // Tabla 5. Coeficiente de extracción (kg N/t)
      { cultivo: 'Albaricoque', r: [3.5, 5] }, { cultivo: 'Ciruelo', r: [3.5, 5] }, { cultivo: 'Melocotonero', r: [3, 4.5] },
      { cultivo: 'Frutal de pepita', r: [3, 4] }, { cultivo: 'Almendro (en cáscara)', r: [35, 45] }, { cultivo: 'Limonero', r: [4.8, 6] },
      { cultivo: 'Naranjo', r: [4.8, 7] }, { cultivo: 'Mandarino', r: [4.8, 7.5] }, { cultivo: 'Vid vinificación', r: [7, 8.5] },
      { cultivo: 'Vid mesa', r: [2, 3.5] }, { cultivo: 'Olivar', r: [11, 20] }
    ],
    eficiencia: { 'Muy arenoso': 0.87, Arenoso: 0.9, Franco: 0.95, Arcilloso: 1 },
    uniformidad: 0.9,
    limiteNOrganico: 170,
    antiguedad: { suelo: 4, agua: 2, estiercol: 1 } // años; se pueden cambiar en Ajustes
  };
  // ETo media mensual (mm) de la zona de Mula, la misma en los 76 Excels
  const ETO_MULA = [54.17, 84.05, 120.22, 155.54, 181.53, 217.63, 225.65, 188.81, 146.89, 95.8, 72.87, 62.72];
  const KC = {
    CITRICOS: [0.66, 0.65, 0.66, 0.62, 0.55, 0.62, 0.68, 0.79, 0.74, 0.84, 0.73, 0.63],
    FRUTALES: [0.2, 0.25, 0.3, 0.6, 0.75, 0.9, 0.9, 0.75, 0.7, 0.55, 0.45, 0.45],
    ALMENDRO: [0.2, 0.25, 0.4, 0.6, 0.75, 0.9, 0.9, 0.75, 0.65, 0.5, 0.4, 0.3],
    OLIVOS: [0.5, 0.5, 0.65, 0.6, 0.55, 0.5, 0.45, 0.45, 0.55, 0.6, 0.65, 0.5]
  };
  const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const n0 = (v) => num(v) ?? 0;
  const medio = (r) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : r);
  const r2 = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  /* Clase textural USDA a partir de arena, limo y arcilla (%) */
  const CLASES_TEXTURA = ['Arenosa', 'Arenosa franca', 'Franco arenosa', 'Franca', 'Franco limosa', 'Limosa', 'Franco arcillo arenosa', 'Franco arcillosa', 'Franco arcillo limosa', 'Arcillo arenosa', 'Arcillo limosa', 'Arcillosa'];
  function claseTextura(arena, limo, arcilla) {
    let s = num(arena), l = num(limo), c = num(arcilla);
    if ([s, l, c].filter((x) => x != null).length < 2) return null;
    if (s == null) s = 100 - l - c; if (l == null) l = 100 - s - c; if (c == null) c = 100 - s - l;
    const t = s + l + c; if (t < 90 || t > 110) return null;
    s = s * 100 / t; l = l * 100 / t; c = c * 100 / t;
    if (l + 1.5 * c < 15) return 'Arenosa';
    if (l + 2 * c < 30) return 'Arenosa franca';
    if ((c >= 7 && c < 20 && s > 52) || (c < 7 && l < 50)) return 'Franco arenosa';
    if (c >= 7 && c < 27 && l >= 28 && l < 50 && s <= 52) return 'Franca';
    if (l >= 80 && c < 12) return 'Limosa';
    if ((l >= 50 && c >= 12 && c < 27) || (l >= 50 && l < 80 && c < 12)) return 'Franco limosa';
    if (c >= 20 && c < 35 && l < 28 && s > 45) return 'Franco arcillo arenosa';
    if (c >= 27 && c < 40 && s > 20 && s <= 45) return 'Franco arcillosa';
    if (c >= 27 && c < 40 && s <= 20) return 'Franco arcillo limosa';
    if (c >= 35 && s > 45) return 'Arcillo arenosa';
    if (c >= 40 && l >= 40) return 'Arcillo limosa';
    if (c >= 40) return 'Arcillosa';
    return 'Franca';
  }
  /* Relación C/N del suelo: carbono orgánico (o MO total / 1,724) entre N total */
  function relCN(v) {
    v = v || {}; const n = num(v.ntotal); if (!n) return null;
    const c = num(v.cot) ?? (num(v.moTotal) != null ? num(v.moTotal) / 1.724 : null);
    return c != null ? c / n : null;
  }
  function texturaTabla(t) {
    const k = norm(t);
    if (k.startsWith('arcill')) return 'Arcilloso';
    if (k.startsWith('arenos') || k.startsWith('muy aren')) return 'Arenoso';
    return 'Franco';
  }
  function texturaRiego(t) {
    const k = norm(t);
    if (k.startsWith('muy')) return 'Muy arenoso';
    if (k.startsWith('arenos')) return 'Arenoso';
    if (k.startsWith('arcill')) return 'Arcilloso';
    return 'Franco';
  }

  /* ---------- Factores automáticos ---------- */
  function fA(no3, cartagena, T = TABLAS) {
    no3 = num(no3);
    if (no3 == null) return null;
    if (cartagena && no3 > 100) return { valor: T.fACartagena, rango: null, txt: 'NO3 > 100 mg/kg en el Campo de Cartagena' };
    const fila = T.fA.find((f) => no3 <= f.hasta) || T.fA[T.fA.length - 1];
    return { valor: medio(fila.r), rango: fila.r, txt: (no3 <= 40 ? 'NO3 0-40 mg/kg' : 'NO3 > 40 mg/kg') };
  }
  function fB(plan, T = TABLAS) {
    if (!GRUPOS.includes(plan.grupo)) return { valor: T.fB.resto, rango: null, txt: 'Resto de cultivos' };
    const sep = n0(plan.marco && plan.marco.filas) || n0(plan.marco && plan.marco.arboles); // separación entre filas de árboles (tabla 3 de la Orden)
    const lineas = n0(plan.lineas) >= 2 ? 2 : 1;
    const tramo = sep > 0 && sep < 5 ? 'menos5' : 'mas5';
    const r = T.fB.lenosos[tramo][lineas];
    return { valor: medio(r), rango: r, txt: `${lineas} línea${lineas > 1 ? 's' : ''} de emisores · filas ${tramo === 'menos5' ? '< 5 m' : '≥ 5 m'}` };
  }
  function nHumus(mo, textura, T = TABLAS) {
    mo = num(mo);
    if (mo == null) return null;
    const col = texturaTabla(textura);
    const pts = T.mo.puntos, vals = T.mo[col].map(medio);
    let v;
    if (mo <= pts[0]) v = vals[0] * mo / pts[0];
    else if (mo >= pts[pts.length - 1]) v = vals[vals.length - 1];
    else {
      let i = 0; while (mo > pts[i + 1]) i++;
      v = vals[i] + (vals[i + 1] - vals[i]) * (mo - pts[i]) / (pts[i + 1] - pts[i]);
    }
    return { valor: v, txt: `MO ${String(mo).replace('.', ',')} % · ${col.toLowerCase()}` };
  }

  /* ---------- Analíticas: conversión a meq y ratios ---------- */
  const PESO = { k: 39.1, ca: 40.08, mg: 24.3, na: 23 }, VAL = { k: 1, ca: 2, mg: 2, na: 1 };
  function suelo(a) {
    if (!a) return null;
    const v = a.v || {};
    const meq = (x) => (num(v[x]) == null ? null : (a.u && a.u[x] === 'meq/100 g' ? num(v[x]) : num(v[x]) * VAL[x] / (10 * PESO[x])));
    const mgkg = (x) => (num(v[x]) == null ? null : (a.u && a.u[x] === 'meq/100 g' ? num(v[x]) * 10 * PESO[x] / VAL[x] : num(v[x])));
    const r = { k: meq('k'), ca: meq('ca'), mg: meq('mg'), na: meq('na') };
    const sumMg = ['k', 'ca', 'mg', 'na'].reduce((t, x) => t + (mgkg(x) || 0), 0);
    const pct = (x) => (sumMg ? (mgkg(x) || 0) / sumMg : null);
    return {
      meq: r,
      pctK: pct('k'), pctCa: pct('ca'), pctMg: pct('mg'),
      kMg: r.k != null && r.mg ? r.k / r.mg : null,
      caMg: r.ca != null && r.mg ? r.ca / r.mg : null,
      caK: r.ca != null && r.k ? r.ca / r.k : null
    };
  }
  function agua(a) {
    if (!a) return null;
    const v = a.v || {};
    const m = (x, peso, val) => (num(v[x]) == null ? null : (a.u && a.u[x] === 'meq/L' ? num(v[x]) : num(v[x]) * val / peso));
    const r = {
      no3: m('no3', 62, 1), k: m('k', 39.1, 1), ca: m('ca', 40.08, 2), mg: m('mg', 24.3, 2), na: m('na', 23, 1),
      so4: m('so4', 96, 2), cl: m('cl', 35.5, 1), hco3: num(v.hco3)
    };
    const cat = ['k', 'ca', 'mg', 'na'].reduce((t, x) => t + (r[x] || 0), 0), an = ['no3', 'so4', 'cl', 'hco3'].reduce((t, x) => t + (r[x] || 0), 0) + (num(v.co3) || 0);
    const sar = r.na != null && r.ca != null && r.mg != null && r.ca + r.mg > 0 ? r.na / Math.sqrt((r.ca + r.mg) / 2) : null;
    const dureza = num(v.ca) != null && num(v.mg) != null ? (num(v.ca) * 2.497 + num(v.mg) * 4.118) / 10 : null;
    return { meq: r, sar, dureza, cat, an, balance: cat && an ? (cat - an) / (cat + an) * 100 : null, kMg: r.k != null && r.mg ? r.k / r.mg : null, caMg: r.ca != null && r.mg ? r.ca / r.mg : null, caK: r.ca != null && r.k ? r.ca / r.k : null };
  }

  /* ---------- Riego (pestaña 3) ---------- */
  function riego(plan, camp, cfg = {}) {
    const eto = (cfg.eto && cfg.eto.length === 12) ? cfg.eto : ETO_MULA;
    const kc = (plan.kc && plan.kc.length === 12) ? plan.kc : (cfg.kc && cfg.kc[plan.grupo]) || KC[plan.grupo] || KC.CITRICOS;
    const T = cfg.tablas || TABLAS;
    const a = n0(plan.marco && plan.marco.filas), b = n0(plan.marco && plan.marco.arboles);
    const arbHa = a && b ? 10000 / (a * b) : 0;
    const copa = n0(plan.copa);
    const klRaw = a && b ? 1.34 * (Math.PI * copa * copa / 4) / (a * b) : 0;
    const kl = Math.min(1, klRaw);
    const efic = T.eficiencia[texturaRiego(plan.textura)] ?? 0.95;
    const caudalHa = n0(plan.caudal) * n0(plan.emisores) * arbHa / 1000; // m3/ha por hora de riego
    const sup = n0(plan.superficie);
    const meses = (camp && camp.riego) || [];
    let totTeo = 0, totApl = 0, acum = 0;
    const filas = MESES.map((mes, i) => {
      const etc = n0(eto[i]) * n0(kc[i]) * kl;
      const nt = etc / (T.uniformidad * efic);
      const vTeo = nt * 10; // m3/ha
      const h = n0(meses[i] && meses[i].h), n = n0(meses[i] && meses[i].n);
      const porRiego = h * caudalHa;
      const riegosEst = porRiego > 0 ? Math.ceil(vTeo / porRiego) : null;
      const horasTeo = riegosEst ? vTeo / riegosEst / caudalHa : (caudalHa ? vTeo / caudalHa : null);
      const vApl = porRiego * n;
      totTeo += vTeo; totApl += vApl; acum += vApl * sup;
      return { mes, dias: DIAS[i], eto: n0(eto[i]), kc: n0(kc[i]), kl, etc, nt, vTeo, riegosEst, horasTeo, h, n, vApl, vFinca: vApl * sup, acum, porRiego };
    });
    return { filas, kl, klRaw, arbHa, efic, caudalHa, totTeo, totApl, totFinca: totApl * sup, consumoHora: n0(plan.caudal) * n0(plan.emisores) * n0(plan.arboles) / 1000 };
  }

  /* ---------- Balance de nitrógeno (pestaña 2) ---------- */
  function balanceN(plan, camp, anal, modo = 'estimado', cfg = {}) {
    const T = cfg.tablas || TABLAS;
    camp = camp || {};
    const s = anal.suelo, w = anal.agua;
    const sv = (s && s.v) || {}, wv = (w && w.v) || {};
    const no3s = num(sv.no3);
    const ov = camp.ajustes || {};
    const fa = ov.fA != null ? { valor: ov.fA, manual: true, txt: 'Puesto a mano' } : fA(no3s, plan.campoCartagena, T);
    const fb = ov.fB != null ? { valor: ov.fB, manual: true, txt: 'Puesto a mano' } : fB(plan, T);
    const hum = ov.humus != null ? { valor: ov.humus, manual: true, txt: 'Puesto a mano' } : nHumus(sv.mo, sv.textura, T);
    const E1 = no3s != null && fa && fb ? no3s * fa.valor / 100 * fb.valor * 5 * 0.226 : 0;
    const E2 = hum && fb ? hum.valor * fb.valor : 0;
    const est = (camp.estiercoles || []).map((e) => {
      const a = anal.estiercoles && anal.estiercoles[e.analId];
      const v = (a && a.v) || {};
      const tipo = T.estiercol.find((t) => norm(t.tipo) === norm(v.tipo)) || null;
      const ms = num(v.ms) ?? (tipo && tipo.humedo ? 100 : T.msDefecto);
      const nPct = num(v.n) ?? (tipo ? medio(tipo.n) : 0);
      const anio = Math.min(3, Math.max(1, n0(e.anio) || 1));
      const minPct = tipo ? tipo.min[anio - 1] : 0;
      const dosis = n0(e.dosis);
      const nTotal = dosis * nPct / 100 * ms / 100;
      return { nombre: (a && (a.nombre || v.tipo)) || 'Estiércol', tipo: v.tipo || '', dosis, ms, nPct, anio, minPct, nTotal, nMin: nTotal * minPct / 100, p2o5: dosis * n0(v.p2o5) / 100 * ms / 100, k2o: dosis * n0(v.k2o) / 100 * ms / 100, cao: dosis * n0(v.cao) / 100 * ms / 100, mgo: dosis * n0(v.mgo) / 100 * ms / 100, analId: e.analId };
    });
    const E3 = est.reduce((t, e) => t + e.nMin, 0);
    const rg = riego(plan, camp, cfg);
    const dosisRiego = modo === 'cerrado'
      ? (num(camp.dosisRealM3) ?? rg.totApl)
      : (num(camp.dosisEstM3) ?? rg.totApl);
    const no3w = num(wv.no3);
    const E4 = no3w != null ? no3w * dosisRiego * 0.226 / 1000 * 0.9 : 0;
    const prod = modo === 'cerrado' ? num(camp.produccionReal) : num(camp.produccionEst);
    const coef = num(camp.coefExtraccion);
    const S1 = n0(prod) * n0(coef);
    const entradas = E1 + E2 + E3 + E4;
    const aporte = Math.max(0, S1 - entradas);
    const nOrgTotal = est.reduce((t, e) => t + e.nTotal, 0);
    const ufs = (cfg.ufDe && cfg.ufDe(plan, camp)) || camp.ufAplicadas || [];
    const nAplicado = ufs.reduce((t, m) => t + n0(m && m[0]), 0);
    return {
      modo, no3s, fa, fb, hum, E1, E2, E3, E4, est, dosisRiego, dosisRiegoAuto: rg.totApl, no3w, prod, coef, S1, entradas, aporte, aporteBruto: S1 - entradas,
      nOrgTotal, nAplicado, excede: nAplicado > aporte + 0.05 && nAplicado > 0, excedeOrg: plan.vulnerable && nOrgTotal > T.limiteNOrganico
    };
  }

  /* Aportes del estiércol a P, K, Ca y Mg (resta siempre, sea o no zona vulnerable) */
  function aportesEstiercol(b) {
    return b.est.reduce((t, e) => ({ n: t.n + e.nMin, p2o5: t.p2o5 + e.p2o5, k2o: t.k2o + e.k2o, cao: t.cao + e.cao, mgo: t.mgo + e.mgo }), { n: 0, p2o5: 0, k2o: 0, cao: 0, mgo: 0 });
  }


  /* ---------- Necesidades anuales y reparto mensual (fase 2) ---------- */
  const NUTRIENTES = ['N', 'P2O5', 'K2O', 'CaO', 'MgO'];
  /* Aportes del agua de riego en UF/ha, como la cabecera de la pestaña 4 del Excel */
  function aportesAgua(agua, dosis) {
    const v = (agua && agua.v) || {};
    const d = n0(dosis);
    return [
      n0(v.no3) * d * 0.226 / 1000 * 0.9,
      0,
      n0(v.k) * d * 1.205 / 1000 * 0.9,
      n0(v.ca) * d * 1.39 / 1000 * 0.6 * 0.5,
      n0(v.mg) * d * 1.65 / 1000 * 0.6 * 0.5
    ];
  }
  function edad(plan, campKey) {
    const a = num(plan.anioPlantacion), c = num(campKey);
    return a && c ? Math.max(0, c - a) : null;
  }
  function sumaReparto(rep) {
    return NUTRIENTES.map((_, j) => (rep && rep.pct ? rep.pct.reduce((t, m) => t + n0(m && m[j]), 0) : 0));
  }
  /* Necesidad teórica − estiércol − agua, por el factor de corrección. El N, además, no pasa del balance. */
  function necesidades(plan, camp, anal, cfg = {}, rep = null) {
    camp = camp || {};
    const b = balanceN(plan, camp, anal, 'estimado', cfg);
    const est = aportesEstiercol(b);
    const estA = [est.n, est.p2o5, est.k2o, est.cao, est.mgo];
    const agua = aportesAgua(anal.agua, b.dosisRiego);
    const teor = NUTRIENTES.map((_, j) => num(camp.necesidades && camp.necesidades[j]));
    const factor = NUTRIENTES.map((_, j) => num(camp.factores && camp.factores[j]) ?? 1);
    const neto = teor.map((t, j) => (t == null ? null : Math.max(0, (t - estA[j] - agua[j]) * factor[j])));
    const objetivo = neto.slice();
    let limitadoN = false;
    if (objetivo[0] != null && b.prod && b.coef && objetivo[0] > b.aporte) { objetivo[0] = b.aporte; limitadoN = true; }
    const suma = sumaReparto(rep);
    const mensual = rep && rep.pct ? MESES.map((_, i) => NUTRIENTES.map((__, j) => (objetivo[j] == null ? 0 : objetivo[j] * n0(rep.pct[i] && rep.pct[i][j]) / 100))) : null;
    const plan12 = ((cfg.ufDe && cfg.ufDe(plan, camp)) || camp.ufAplicadas || []).map((m) => NUTRIENTES.map((_, j) => n0(m && m[j])));
    return { b, teor, estiercol: estA, agua, factor, neto, objetivo, limitadoN, nBalance: b.aporte, suma, repartoOk: !!rep && suma.every((x) => Math.abs(x - 100) < 0.05), mensual, plan12 };
  }

  /* ---------- Avisos de un plan ---------- */
  function edadAnios(fecha, hoy = new Date()) {
    if (!fecha) return null;
    const d = new Date(fecha);
    if (isNaN(d)) return null;
    return (hoy - d) / (365.25 * 24 * 3600 * 1000);
  }
  /* Años máximos de una analítica: en zona vulnerable, la de suelo es de cada campaña (Orden 16/06/2016) */
  function maxAntiguedad(plan, tipo, T = TABLAS) {
    const max = +((T.antiguedad && T.antiguedad[tipo]) || (tipo === 'suelo' ? 4 : tipo === 'agua' ? 2 : 1));
    return plan && plan.vulnerable && tipo === 'suelo' ? Math.min(max, 1) : plan && plan.vulnerable && tipo === 'agua' ? Math.min(max, 2) : max;
  }
  function avisos(plan, campKey, db, cfg = {}, hoy = new Date()) {
    const T = cfg.tablas || TABLAS;
    const out = [];
    const camp = plan.campanas && plan.campanas[campKey];
    const an = (id) => db.analiticas.find((a) => a.id === id) || null;
    const s = an(plan.analSuelo), w = an(plan.analAgua);
    const add = (nivel, txt, donde) => out.push({ nivel, txt, donde });
    for (const [a, tipo, nombre] of [[s, 'suelo', 'suelo'], [w, 'agua', 'agua de riego']]) {
      if (!a) { add('alto', `Sin analítica de ${nombre}`, 'analiticas'); continue; }
      if (a.plantilla) { add('alto', `Analítica de ${nombre} de plantilla (no es de esta finca)`, 'analiticas'); continue; }
      if (a.origen === 'cartografia') { add('bajo', `Suelo de cartografía (IMIDA): conviene una analítica de la finca`, 'analiticas'); continue; }
      const e = edadAnios(a.fecha, hoy);
      const max = maxAntiguedad(plan, tipo, T);
      if (e != null && e > max) add('medio', `Analítica de ${nombre} de hace ${String(Math.round(e * 10) / 10).replace('.', ',')} años (máx. ${max}${plan.vulnerable && tipo === 'suelo' ? ': en zona vulnerable, una al inicio de cada campaña' : ''})`, 'analiticas');
      if (tipo === 'suelo' && plan.vulnerable) { const f = T.sueloObligatorio.filter(([k]) => (a.v || {})[k] == null || (a.v || {})[k] === '').map(([, t]) => t); if (f.length) add('bajo', `A la analítica de suelo le falta, para zona vulnerable: ${f.join(', ')}`, 'analiticas'); }
      const nueva = db.analiticas.find((x) => x.tipo === tipo && x.id !== a.id && !x.plantilla && x.origen !== 'cartografia' && x.fecha && a.fecha && x.fecha > a.fecha &&
        db.planes.some((p) => (tipo === 'suelo' ? p.analSuelo : p.analAgua) === x.id && p.id !== plan.id && p.carpeta && p.carpeta === plan.carpeta));
      if (nueva) add('medio', `Hay una analítica de ${nombre} más nueva en esta finca (${nueva.fecha})`, 'analiticas');
    }
    if (!camp) { add('alto', `Sin datos de la campaña ${campKey}`, 'finca'); return out; }
    const anal = { suelo: s, agua: w, estiercoles: Object.fromEntries(db.analiticas.filter((a) => a.tipo === 'estiercol').map((a) => [a.id, a])) };
    const b = balanceN(plan, camp, anal, 'estimado', cfg);
    if (b.excede) add('alto', `N del plan ${r2(b.nAplicado, 1)} kg/ha supera el balance (${r2(b.aporte, 1)} kg/ha)`, 'balance');
    if (b.excedeOrg) add('alto', `N orgánico ${r2(b.nOrgTotal, 0)} kg/ha supera el límite de ${T.limiteNOrganico} kg/ha`, 'balance');
    if (plan.vulnerable) {
      const ex = T.exclusion && T.exclusion[plan.grupo];
      const ufs = (cfg.ufDe && cfg.ufDe(plan, camp)) || camp.ufAplicadas || [];
      const malM = ex ? ex.meses.filter((i) => n0(ufs[i] && ufs[i][0]) > 0.05) : [];
      if (malM.length) add('alto', `N en periodo de exclusión (${malM.map((i) => MESES[i].toLowerCase()).join(', ')}): ${ex.txt}${ex.aproximado ? ' (' + ex.aproximado + ')' : ''}`, 'fert');
      const largos = (camp.riego || []).map((m, i) => (m && n0(m.n) && n0(m.h) > (T.horasMaxRiego || 5) ? MESES[i].slice(0, 3).toLowerCase() : null)).filter(Boolean);
      if (largos.length) add('medio', `Riegos de más de ${T.horasMaxRiego || 5} h seguidas (${largos.join(', ')}): prohibidos en zona vulnerable; pártelos en dos`, 'riego');
    }
    if (!num(camp.produccionEst)) add('medio', 'Falta la producción estimada', 'balance');
    if (!num(camp.coefExtraccion)) add('medio', 'Falta el coeficiente de extracción', 'balance');
    if (camp.plantillaProd) add('bajo', 'Producción y coeficiente de plantilla (20 t/ha · 6 kg N/t): revísalos', 'balance');
    if (!(camp.riego || []).some((m) => m && m.h && m.n)) add('medio', 'Sin horas ni riegos programados', 'riego');
    if (s && !s.plantilla && s.v && s.v.textura && plan.textura && texturaTabla(s.v.textura) !== texturaTabla(plan.textura)) add('bajo', `Textura distinta en el riego (${plan.textura}) y en la analítica (${s.v.textura})`, 'riego');
    if (!plan.marco || !n0(plan.marco.filas) || !n0(plan.marco.arboles)) add('medio', 'Falta el marco de plantación', 'finca');
    const rep = plan.reparto && db.repartos ? db.repartos.find((r) => r.id === plan.reparto) : null;
    if (!rep) add('medio', 'Sin tipo de reparto mensual', 'necesidades');
    else { const su = sumaReparto(rep); const mal = NUTRIENTES.filter((_, j) => su[j] > 0 && Math.abs(su[j] - 100) >= 0.05); if (mal.length) add('medio', `El reparto «${rep.nombre}» no suma 100 % en ${mal.join(', ')}`, 'necesidades'); }
    if (!(camp.necesidades || []).some((x) => num(x))) add('medio', 'Faltan las necesidades anuales', 'necesidades');
    if (!num(plan.anioPlantacion)) add('bajo', 'Falta el año de plantación', 'finca');
    return out;
  }

  const api = { maxAntiguedad, CLASES_TEXTURA, claseTextura, relCN, MESES, GRUPOS, TEXTURAS, CULTIVOS, NUTRIENTES, aportesAgua, edad, sumaReparto, necesidades, TABLAS, ETO_MULA, KC, DIAS, num, n0, medio, r2, norm, texturaTabla, texturaRiego, fA, fB, nHumus, suelo, agua, riego, balanceN, aportesEstiercol, avisos, edadAnios };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CALC = api;
})(typeof window !== 'undefined' ? window : globalThis);
