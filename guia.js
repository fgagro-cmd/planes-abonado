'use strict';
/* Planes de abonado · FG Agro — necesidades anuales y repartos mensuales de la
   «Guía práctica de la fertilización racional de los cultivos en España» (MARM, ~2010).
   Cap. 24 Cítricos (IVIA), 25 Frutales caducifolios y almendro, 27 Olivar; tablas 10.1 y 11.1 (Parte I).
   Solo riego por goteo. Sin DOM ni datos de clientes: se puede probar fuera del navegador. */
(function (root) {
  const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const NUT = ['N', 'P2O5', 'K2O', 'CaO', 'MgO'];

  /* Cítricos, tabla 24.3: dosis anual (g/árbol) = a·x² + b·x + c, x = diámetro de copa (cm), riego por goteo.
     El P2O5 de la fórmula da los valores de inundación; en goteo la tabla 24.4 da 8/7 de ellos (80 kg/ha frente a 70). */
  const CITRICOS = {
    naranjos: { nombre: 'Naranjos', N: [0.0013, 0.7943, 4.3767], P: [0.0004, 0.2158, 2.2483], K: [0.0012, 0.2172, 9.1551], Mg: [0.001, 0.5694, 4.7232] },
    clementinos: { nombre: 'Clementinos', N: [0.0014, 0.7211, 7.3706], P: [0.0004, 0.1901, 4.0699], K: [0.0012, 0.2844, 5.3427], Mg: [0.0011, 0.5528, 4.6713] },
    limones: { nombre: 'Limones y pomelos', N: [0.0018, 0.6445, 9.2788], P: [0.0005, 0.1831, 3.3384], K: [0.0011, 0.3137, 5.5544], Mg: [0.0013, 0.4883, 8.0239] }
  };
  const P_GOTEO = 8 / 7;
  const MAX_CITRICOS = [240, 80, 140, null, 180]; // kg/ha con las copas tocándose (tabla 24.4, goteo), igual para todos los grupos

  /* Frutales, almendro y olivo: exportación por tonelada (tablas 25.4, 25.6, 25.7, 25.8, 27.8) */
  const PRODUCCION = {
    melocotonero: { nombre: 'Melocotonero y nectarina', nNeto: 3.5, nForm: 1.3, p: 1.71, k: 3.84 },
    albaricoque: { nombre: 'Albaricoquero', nNeto: 3.7, nForm: 1.2, p: 1.32, k: 5.68 },
    almendro: { nombre: 'Almendro (en cáscara)', nNeto: 33.7, nForm: 34, p: 12, k: 47 },
    olivo: { nombre: 'Olivo (fertirriego)', nNeto: 130 / 8, p: 35 / 8, k: 180 / 8 } // 130-35-180 kg/ha con 8 t/ha
  };
  const FORMACION = { 1: { n: 20, p: 10, k: 20 }, 2: { n: 35, p: 15, k: 40 } }; // tabla 25.6 y fase de formación (P y K máximos)
  const CUBIERTA = [
    ['', 'Sin cubierta (suelo desnudo)', 0],
    ['nueva-poca', 'Cubierta nueva, < 10 % leguminosas (2 primeros años)', 45],
    ['nueva-media', 'Cubierta nueva, 10-20 % leguminosas (2 primeros años)', 35],
    ['nueva-mucha', 'Cubierta nueva, > 20 % leguminosas (2 primeros años)', 25],
    ['establecida', 'Cubierta establecida (desde el 3.er año)', 35]
  ];

  /* Niveles de P Olsen y K del suelo según textura (tablas 10.1 y 11.1): límite superior de muy bajo, bajo, medio y alto */
  const NIVELES = {
    p: { Arenoso: [4, 8, 12, 20], Franco: [6, 12, 18, 30], Arcilloso: [8, 16, 24, 40] },
    k: { Arenoso: [60, 120, 180, 300], Franco: [80, 160, 235, 390], Arcilloso: [100, 200, 300, 490] }
  };
  const NOMBRE_NIVEL = ['muy bajo', 'bajo', 'medio', 'alto', 'muy alto'];
  const FACTOR_NIVEL = [1.5, 1.5, 1, 0.5, 0]; // tabla 25.5

  /* Repartos mensuales (% de la dosis anual, columnas N, P2O5, K2O, CaO, MgO). CaO sigue al N (la guía no lo da). */
  const filas = (n, p, k, mg, ca) => Array.from({ length: 12 }, (_, i) => [n[i] || 0, p[i] || 0, k[i] || 0, (ca || n)[i] || 0, (mg || n)[i] || 0]);
  const m12 = (desdeMes, vals) => { const a = new Array(12).fill(0); vals.forEach((v, i) => { a[desdeMes + i] = v; }); return a; };
  const REPARTOS = [
    { id: 'guia-citricos-plantones', nombre: 'Cítricos plantones (guía MAPA)', grupo: 'CITRICOS', notas: 'Guía MAPA, tabla 24.9 (goteo). CaO como el N.',
      pct: filas(m12(2, [5, 5, 10, 15, 20, 20, 15, 10]), m12(2, [5, 10, 15, 15, 15, 15, 15, 10]), m12(2, [5, 5, 10, 15, 20, 20, 15, 10]), m12(2, [10, 0, 20, 0, 40, 0, 30])) },
    { id: 'guia-citricos-tempranos', nombre: 'Cítricos tempranos (guía MAPA)', grupo: 'CITRICOS', notas: 'Guía MAPA, tabla 24.10 (goteo). CaO como el N.',
      pct: filas(m12(2, [5, 10, 15, 22, 18, 15, 10, 5]), m12(2, [5, 10, 15, 15, 15, 15, 15, 10]), m12(2, [5, 10, 10, 10, 20, 20, 20, 5]), m12(2, [10, 0, 30, 0, 40, 0, 20])) },
    { id: 'guia-citricos-tardios', nombre: 'Cítricos tardíos (guía MAPA)', grupo: 'CITRICOS', notas: 'Guía MAPA, tabla 24.11 (goteo). El 5 % de N de noviembre pasa a octubre (exclusión de zona vulnerable de noviembre a enero). CaO como el N.',
      pct: filas(m12(2, [5, 10, 15, 15, 20, 15, 10, 10, 0]), m12(2, [5, 10, 15, 15, 15, 15, 15, 5, 5]), m12(2, [5, 10, 10, 10, 15, 15, 15, 10, 10]), m12(2, [10, 0, 25, 0, 35, 0, 30]), m12(2, [5, 10, 15, 15, 20, 15, 10, 10, 0])) },
    { id: 'guia-frutales-febrero', nombre: 'Frutales floración febrero (guía MAPA)', grupo: 'FRUTALES', notas: 'Guía MAPA, tabla 25.9 por fases: brotación-cuajado feb-mar, crecimiento abr-jun, poscosecha jul-oct (N 20/55/25 %, P2O5 30/57/13 %, K2O 10/77/13 %). CaO y MgO como el N.',
      pct: filas(m12(1, [5, 15, 15, 20, 20, 10, 7, 5, 3]), m12(1, [10, 20, 19, 19, 19, 5, 4, 2, 2]), m12(1, [3, 7, 22, 30, 25, 5, 4, 2, 2])) },
    { id: 'guia-frutales-marzo', nombre: 'Frutales floración marzo (guía MAPA)', grupo: 'FRUTALES', notas: 'Guía MAPA, tabla 25.9 por fases: brotación-cuajado mar-abr, crecimiento may-jul, poscosecha ago-oct (N 20/55/25 %, P2O5 30/57/13 %, K2O 10/77/13 %). CaO y MgO como el N.',
      pct: filas(m12(2, [8, 12, 18, 20, 17, 10, 10, 5]), m12(2, [12, 18, 19, 19, 19, 5, 5, 3]), m12(2, [3, 7, 22, 28, 27, 6, 4, 3])) },
    { id: 'guia-olivo', nombre: 'Olivo fertirriego (guía MAPA)', grupo: 'OLIVOS', notas: 'Guía MAPA, tabla 27.9. CaO y MgO como el N.',
      pct: filas(m12(2, [4.5, 4.5, 22, 22, 21, 11, 10, 5]), m12(2, [4, 4, 17, 17, 17, 17, 17, 7]), m12(2, [2, 2, 10, 10, 21, 22, 22, 11])) }
  ];

  const AJUSTES = { plantonHasta: 3, plena: { FRUTALES: 5, ALMENDRO: 7 } }; // años de cultivo; editables en Ajustes

  /* Tipo de cultivo de la app → grupo de la guía */
  function tipoGuia(plan) {
    const t = norm(plan.tipoCultivo || plan.cultivo);
    if (plan.grupo === 'CITRICOS') {
      if (t.includes('limon') || t.includes('pomelo')) return 'limones';
      if (t.includes('mandarin') || t.includes('clementin')) return 'clementinos';
      if (t.includes('naranj')) return 'naranjos';
      return null;
    }
    if (plan.grupo === 'FRUTALES') {
      if (t.includes('albaric')) return 'albaricoque';
      if (t.includes('melocot') || t.includes('nectarin')) return 'melocotonero';
      return null;
    }
    if (plan.grupo === 'ALMENDRO') return 'almendro';
    if (plan.grupo === 'OLIVOS') return 'olivo';
    return null;
  }
  /* Año de cultivo: el año de plantación es el año 1 */
  function anioCultivo(plan, campKey) {
    const a = num(plan.anioPlantacion), c = num(campKey);
    return a && c ? Math.max(1, c - a + 1) : null;
  }
  function repartoSugerido(plan, campKey, aj = AJUSTES) {
    const t = norm(plan.tipoCultivo || plan.cultivo);
    if (plan.grupo === 'CITRICOS') {
      const an = anioCultivo(plan, campKey);
      if (an != null && an <= (num(aj.plantonHasta) ?? 3)) return 'guia-citricos-plantones';
      if (t.includes('verna') || t.includes('tardi')) return 'guia-citricos-tardios';
      return 'guia-citricos-tempranos';
    }
    if (plan.grupo === 'FRUTALES') return t.includes('albaric') && t.includes('tempran') ? 'guia-frutales-febrero' : 'guia-frutales-marzo';
    if (plan.grupo === 'ALMENDRO') return 'guia-frutales-marzo';
    if (plan.grupo === 'OLIVOS') return 'guia-olivo';
    return null;
  }

  /* Nivel de P y K del suelo con la analítica (o «medio» si no hay dato válido) */
  function nivelSuelo(suelo, textura) {
    const v = (suelo && suelo.v) || {};
    const valida = suelo && !suelo.plantilla;
    const tx = (() => { const k = norm((v.textura) || textura); if (k.startsWith('arcill')) return 'Arcilloso'; if (k.startsWith('arenos') || k.startsWith('muy aren')) return 'Arenoso'; return 'Franco'; })();
    const nivel = (x, val) => { if (!valida || val == null) return null; const lim = NIVELES[x][tx]; let i = 0; while (i < lim.length && val > lim[i]) i++; return i; };
    const p = num(v.p);
    const kRaw = num(v.k);
    const k = kRaw == null ? null : (suelo && suelo.u && suelo.u.k === 'meq/100 g' ? kRaw * 391 : kRaw);
    const np = nivel('p', p), nk = nivel('k', k);
    return { textura: tx, p, k, nivelP: np, nivelK: nk, fP: np == null ? 1 : FACTOR_NIVEL[np], fK: nk == null ? 1 : FACTOR_NIVEL[nk], sinDato: !valida ? (suelo ? 'analítica de plantilla' : 'sin analítica de suelo') : null };
  }

  /* Necesidad anual según la guía (kg UF/ha). vals = [N, P2O5, K2O, CaO, MgO]; null = la guía no lo da. */
  function necesidades(plan, campKey, camp, anal, aj = AJUSTES) {
    aj = { ...AJUSTES, ...(aj || {}), plena: { ...AJUSTES.plena, ...((aj && aj.plena) || {}) } };
    camp = camp || {};
    const vals = [null, null, null, null, null];
    const lineas = [], avisos = [];
    const tipo = tipoGuia(plan);
    const reparto = repartoSugerido(plan, campKey, aj);
    if (!tipo) return { vals, metodo: null, lineas: ['La guía no tiene datos para este tipo de cultivo.'], avisos: ['Elige el tipo de cultivo en la pestaña Finca'], reparto, tipo };

    if (plan.grupo === 'CITRICOS') {
      const g = CITRICOS[tipo];
      const copa = num(plan.copa);
      const a = num(plan.marco && plan.marco.filas), b = num(plan.marco && plan.marco.arboles);
      const arbHa = a && b ? 10000 / (a * b) : null;
      if (!copa) avisos.push('Falta el diámetro de copa (pestaña Finca)');
      if (!arbHa) avisos.push('Falta el marco de plantación (pestaña Finca)');
      if (!copa || !arbHa) return { vals, metodo: 'copa', lineas: [`Cítricos: dosis por árbol según el diámetro de copa (grupo ${g.nombre}).`], avisos, reparto, tipo };
      const x = copa * 100;
      const f = (c) => Math.max(0, c[0] * x * x + c[1] * x + c[2]);
      const gArb = [f(g.N), f(g.P) * P_GOTEO, f(g.K), null, f(g.Mg)];
      const topados = [];
      gArb.forEach((gr, j) => {
        if (gr == null) return;
        const kg = gr * arbHa / 1000;
        const max = MAX_CITRICOS[j];
        vals[j] = max != null && kg > max ? max : kg;
        if (max != null && kg > max) topados.push(NUT[j]);
      });
      lineas.push(`Cítricos (${g.nombre}), goteo: copa ${String(copa).replace('.', ',')} m y ${Math.round(arbHa)} árboles/ha.`);
      lineas.push(`Por árbol: ${Math.round(gArb[0])} g N, ${Math.round(gArb[1])} g P2O5, ${Math.round(gArb[2])} g K2O y ${Math.round(gArb[4])} g MgO.`);
      if (topados.length) lineas.push(`Copa cerrada: ${topados.join(', ')} en el máximo de la guía (240 N, 80 P2O5, 140 K2O y 180 MgO kg/ha).`);
      lineas.push('Para producción media y hoja normal; el N sigue limitado por el balance. La guía no da CaO.');
      return { vals, metodo: 'copa', lineas, avisos, reparto, tipo };
    }

    // Frutales, almendro y olivo: por producción
    const c = PRODUCCION[tipo];
    const t = num(camp.produccionEst);
    const an = anioCultivo(plan, campKey);
    const plena = plan.grupo === 'OLIVOS' ? 1 : (num(aj.plena[plan.grupo]) ?? 5);
    const sue = nivelSuelo(anal && anal.suelo, plan.textura);
    const cub = plan.grupo === 'OLIVOS' ? null : (CUBIERTA.find((x) => x[0] === (plan.cubierta || '')) || CUBIERTA[0]);
    const nCub = cub ? cub[2] : 0;
    if (an == null && plan.grupo !== 'OLIVOS') avisos.push('Falta el año de plantación: se calcula como árbol adulto');
    const formacion = plan.grupo !== 'OLIVOS' && an != null && an < plena;
    if (formacion && an <= 2) {
      const fm = FORMACION[an];
      vals[0] = fm.n + nCub; vals[1] = fm.p; vals[2] = fm.k;
      lineas.push(`${c.nombre} en formación, año ${an}: ${fm.n} kg N/ha${nCub ? ` + ${nCub} de la cubierta` : ''}; P2O5 y K2O como máximo ${fm.p} y ${fm.k} kg/ha.`);
    } else if (formacion) {
      const tt = t ?? 0;
      if (t == null) avisos.push('Falta la producción estimada (pestaña Balance N)');
      vals[0] = 50 + c.nForm * tt + nCub; vals[1] = FORMACION[2].p; vals[2] = FORMACION[2].k;
      lineas.push(`${c.nombre} en formación, año ${an} (plena producción desde el año ${plena}): 50 + ${String(c.nForm).replace('.', ',')} × ${String(tt).replace('.', ',')} t = ${Math.round(50 + c.nForm * tt)} kg N/ha${nCub ? ` + ${nCub} de la cubierta` : ''}; P2O5 y K2O, los máximos del año 2 (${FORMACION[2].p} y ${FORMACION[2].k} kg/ha).`);
    } else {
      if (t == null) { avisos.push('Falta la producción estimada (pestaña Balance N)'); return { vals, metodo: 'produccion', lineas: [`${c.nombre}: necesidades según la producción esperada.`], avisos, reparto, tipo, suelo: sue }; }
      vals[0] = c.nNeto * t + nCub;
      if (plan.grupo === 'OLIVOS') { vals[1] = c.p * t; vals[2] = c.k * t; }
      else { vals[1] = c.p * t * sue.fP; vals[2] = c.k * t * sue.fK; }
      const fx = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
      lineas.push(`${c.nombre} con ${fx(t)} t/ha: N ${fx(c.nNeto)} kg/t${nCub ? ` + ${nCub} kg/ha de la cubierta` : ''}; P2O5 ${fx(c.p)} y K2O ${fx(c.k)} kg/t.`);
      if (plan.grupo !== 'OLIVOS') {
        if (sue.sinDato) lineas.push(`Suelo: ${sue.sinDato}, se toma nivel medio de P y K (factor 1).`);
        else lineas.push(`Suelo ${sue.textura.toLowerCase()}: P Olsen ${sue.p ?? '–'} mg/kg (${sue.nivelP == null ? 'sin dato, medio' : NOMBRE_NIVEL[sue.nivelP]}, ×${String(sue.fP).replace('.', ',')}); K ${sue.k == null ? '–' : Math.round(sue.k)} mg/kg (${sue.nivelK == null ? 'sin dato, medio' : NOMBRE_NIVEL[sue.nivelK]}, ×${String(sue.fK).replace('.', ',')}).`);
      }
    }
    if (cub && cub[0]) lineas.push(`Cubierta: ${cub[1].toLowerCase()}.`);
    lineas.push('La guía no da CaO ni MgO para este cultivo: si los necesitas, escríbelos a mano.');
    return { vals, metodo: formacion ? 'formacion' : 'produccion', lineas, avisos, reparto, tipo, suelo: sue };
  }

  const api = { NUT, CITRICOS, MAX_CITRICOS, P_GOTEO, PRODUCCION, FORMACION, CUBIERTA, NIVELES, NOMBRE_NIVEL, FACTOR_NIVEL, REPARTOS, AJUSTES, tipoGuia, anioCultivo, repartoSugerido, nivelSuelo, necesidades };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GUIA = api;
})(typeof window !== 'undefined' ? window : globalThis);
