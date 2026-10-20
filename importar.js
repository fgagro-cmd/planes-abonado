'use strict';
/* Planes de abonado · FG Agro — importación de los Excels «Gestion Fertirrigacion v5*.xlsm».
   Recibe el libro ya leído con SheetJS (valores guardados por Excel) y devuelve el plan y sus analíticas.
   Sin DOM: se puede probar fuera del navegador. */
(function (root) {
  const C = (typeof module !== 'undefined' && module.exports) ? require('./calc.js') : root.CALC;
  const HOJAS = ['1. ANALITICAS', '2. CALCULADORA DE NITRÓGENO', '3. RIEGO', '4. FERTIRRIGACION', 'INFORME CON RESUMEN'];

  const serialAFecha = (n) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000)); return d.toISOString().slice(0, 10); };
  function celda(ws, ref) { const c = ws && ws[ref]; return c ? c.v : null; }
  const num = (v) => C.num(v);
  const txt = (v) => (v == null ? '' : String(v).trim());
  function fecha(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return serialAFecha(v);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const m = String(v).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return null;
  }
  const horas = (v) => { const n = num(v); return n == null ? 0 : Math.round(n * 24 * 100) / 100; };

  /* Tipo de cultivo a partir del texto del Excel, solo si no hay duda */
  function adivinarCultivo(t) {
    const k = C.norm(t);
    const hay = [];
    if (/\bfinos?\b/.test(k) || /limon\w* fino/.test(k)) hay.push('Limonero Fino');
    if (/vernas?\b|berna/.test(k)) hay.push('Limonero Verna');
    if (/pomelo/.test(k)) hay.push('Pomelo');
    if (/mandarin/.test(k)) hay.push('Mandarino');
    if (/nectarin/.test(k)) hay.push('Nectarina');
    if (/melocot|paraguay/.test(k)) hay.push('Melocotón');
    if (/olivo/.test(k)) hay.push('Olivo');
    if (/almendr/.test(k)) hay.push('Almendro');
    if (/naranj|sanguinel|valencia/.test(k)) hay.push('Naranjo');
    if (/albaric/.test(k)) hay.push('Albaricoque');
    const unico = [...new Set(hay)];
    if (unico.length !== 1) return '';
    return ['Naranjo', 'Albaricoque'].includes(unico[0]) ? '' : unico[0];
  }

  /* Id estable a partir de la ruta, para reconocer el mismo Excel al volver a importar */
  function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  /* ruta = «Cliente/Finca/archivo.xlsm» relativa a la carpeta Clientes */
  function leerLibro(wb, ruta) {
    const S = (n) => wb.Sheets[n];
    const a = S('1. ANALITICAS'), n = S('2. CALCULADORA DE NITRÓGENO'), r = S('3. RIEGO'), f = S('4. FERTIRRIGACION'), inf = S('INFORME CON RESUMEN');
    if (!a || !r || !f) throw new Error('No parece un plan v5 (faltan pestañas)');
    const partes = ruta.split('/');
    const archivo = partes.pop();
    const carpeta = partes.join('/');
    const [cliente, finca] = [partes[0] || '', partes.slice(1).join('/') || ''];
    const grupo = txt(celda(a, 'F4')).toUpperCase() || 'CITRICOS';
    const anioInf = num(celda(inf, 'J2'));
    const campKey = String(anioInf || num(celda(a, 'C3')) || new Date().getFullYear());

    const sueloA = {
      tipo: 'suelo', fecha: fecha(celda(a, 'C14')), ref: txt(celda(a, 'C15')),
      v: { ce: num(celda(a, 'F14')), ph: num(celda(a, 'F15')), textura: txt(celda(a, 'C16')), densidad: num(celda(a, 'C17')), k: num(celda(a, 'C18')), ca: num(celda(a, 'C19')), mg: num(celda(a, 'C20')), na: num(celda(a, 'C21')), mo: num(celda(a, 'C22')), no3: num(celda(a, 'C23')) },
      u: { k: txt(celda(a, 'D18')) === 'meq/100 gr' ? 'meq/100 g' : 'mg/kg', ca: txt(celda(a, 'D19')) === 'meq/100 gr' ? 'meq/100 g' : 'mg/kg', mg: txt(celda(a, 'D20')) === 'meq/100 gr' ? 'meq/100 g' : 'mg/kg', na: txt(celda(a, 'D21')) === 'meq/100 gr' ? 'meq/100 g' : 'mg/kg' }
    };
    const aguaA = {
      tipo: 'agua', fecha: fecha(celda(a, 'C39')), ref: txt(celda(a, 'C40')),
      v: { ce: num(celda(a, 'C42')), ph: num(celda(a, 'C43')), no3: num(celda(a, 'C44')), p: num(celda(a, 'C45')), k: num(celda(a, 'C46')), ca: num(celda(a, 'C47')), mg: num(celda(a, 'C48')), na: num(celda(a, 'C49')), so4: num(celda(a, 'C50')), hco3: num(celda(a, 'F44')), b: num(celda(a, 'F49')), cl: num(celda(a, 'F50')) },
      u: {}
    };
    const vacia = (x) => Object.values(x.v).every((v) => v == null || v === '');
    // Estiércoles (hasta 3 bloques en el Excel)
    const estiercoles = [];
    for (const [fT, fD, fMs, fN, fP, fK, fCa, fMg, fAnio, fF, fR] of [
      ['F25', 'G26', 'C28', 'C30', 'C31', 'C32', 'C33', 'C34', 'G34', 'C25', 'C26'],
      ['F53', 'G54', 'C56', 'C58', 'C59', 'C60', 'C61', 'C62', 'G62', 'C53', 'C54'],
      ['F68', 'G69', 'C71', 'C73', 'C74', 'C75', 'C76', 'C77', 'G77', 'C68', 'C69']]) {
      const tipo = txt(celda(a, fT));
      if (!tipo || C.norm(tipo) === 'no aplica') continue;
      const anioTxt = txt(celda(a, fAnio));
      estiercoles.push({
        anal: { tipo: 'estiercol', fecha: fecha(celda(a, fF)), ref: txt(celda(a, fR)), v: { tipo, ms: num(celda(a, fMs)), n: num(celda(a, fN)), p2o5: num(celda(a, fP)), k2o: num(celda(a, fK)), cao: num(celda(a, fCa)), mgo: num(celda(a, fMg)) }, u: {} },
        dosis: num(celda(a, fD)) || 0, anio: anioTxt.startsWith('3') ? 3 : anioTxt.startsWith('2') ? 2 : 1
      });
    }

    const riego = [], kc = [], ufAplicadas = [], meses = [];
    for (let i = 0; i < 12; i++) {
      const fila = 16 + i;
      riego.push({ h: horas(celda(r, 'N' + fila)), n: num(celda(r, 'O' + fila)) || 0 });
      kc.push(num(celda(r, 'E' + fila)));
      const r0 = 32 + 14 * i;
      ufAplicadas.push(['L', 'M', 'N', 'O', 'P'].map((col) => Math.round((num(celda(f, col + (r0 + 8))) || 0) * 1000) / 1000));
      const prods = [];
      for (let rr = r0; rr < r0 + 8; rr++) {
        const nombre = txt(celda(f, 'B' + rr));
        if (!nombre) continue;
        prods.push({ producto: nombre, dosis: num(celda(f, 'J' + rr)), formato: txt(celda(f, 'K' + rr)), riegos: num(celda(f, 'R' + rr)), periodo: txt(celda(f, 'U' + rr)), tanque: txt(celda(f, 'V' + rr)) });
      }
      meses.push(prods);
    }
    const necesidades = [4, 5, 6, 7, 8].map((fi) => num(celda(f, 'K' + fi)));
    const factores = [4, 5, 6, 7, 8].map((fi) => num(celda(f, 'Q' + fi)));
    const reparto = [];
    for (let i = 0; i < 12; i++) reparto.push(['C', 'D', 'E', 'F', 'G'].map((col) => num(celda(f, col + (13 + i))) || 0));

    const prodEst = num(celda(a, 'F84')), coef = num(celda(a, 'C84'));
    const plan = {
      id: 'p' + hash(ruta),
      origen: { ruta, archivo, importado: new Date().toISOString() },
      nombre: txt(celda(inf, 'R1')) || archivo.replace(/\.xlsm$/i, ''),
      cliente, finca, carpeta,
      mxCli: null, mxFin: null,
      titular: txt(celda(a, 'C2')),
      cultivo: txt(celda(a, 'C4')),
      tipoCultivo: adivinarCultivo(txt(celda(a, 'C4')) + ' ' + archivo),
      grupo,
      superficie: num(celda(a, 'E7')),
      arboles: num(celda(a, 'E8')),
      recintos: txt(celda(a, 'C5')).replace(/^Esta unidad de producción incluye los siguientes recintos:\s*/i, '').replace(/\.\s*$/, '').trim(),
      vulnerable: C.norm(celda(a, 'E9')) === 'vulnerable',
      campoCartagena: false,
      marco: { filas: num(celda(r, 'D8')), arboles: num(celda(r, 'E8')) },
      copa: num(celda(r, 'D9')),
      caudal: num(celda(r, 'D11')),
      emisores: num(celda(r, 'D12')),
      lineas: 1,
      textura: C.texturaRiego(celda(r, 'D13')),
      kc: kc.every((x) => x != null) ? kc : null,
      analSuelo: null, analAgua: null,
      campanaActual: campKey,
      campanas: {
        [campKey]: {
          produccionEst: prodEst, produccionReal: num(celda(a, 'F86')), coefExtraccion: coef,
          plantillaProd: prodEst === 20 && coef === 6,
          dosisRealM3: num(celda(a, 'F41')),
          estiercoles: [],
          riego, ufAplicadas,
          ajustes: {},
          excel: {
            campana: num(celda(a, 'C3')), nBalance: num(celda(n, 'F31')), nAgua: num(celda(n, 'F25')), dosisRiego: num(celda(a, 'F39')),
            necesidades, factores, reparto, meses
          },
          pdf: {}
        }
      }
    };
    return { plan, suelo: vacia(sueloA) ? null : sueloA, agua: vacia(aguaA) ? null : aguaA, estiercoles };
  }

  /* Clave para reconocer la misma analítica copiada en varios Excels */
  function claveAnal(a) { return a.tipo + '|' + (a.fecha || '') + '|' + (a.ref || '') + '|' + JSON.stringify(a.v); }

  /* Junta lo leído de varios Excels con lo que ya hay. Analíticas iguales se guardan una sola vez.
     Las de suelo repetidas en varias fincas, y las de agua repetidas en muchos clientes, se marcan «de plantilla». */
  function juntar(db, leidos, { sustituir = false, uid } = {}) {
    const nuevoId = uid || ((p) => p + Math.random().toString(36).slice(2, 9));
    const porClave = new Map(db.analiticas.map((a) => [a.clave || claveAnal(a), a]));
    const res = { nuevos: 0, sustituidos: 0, saltados: 0, analNuevas: 0 };
    const usoSuelo = new Map(), usoAgua = new Map();
    const analDe = (x, nombreDef) => {
      if (!x) return null;
      const k = claveAnal(x);
      let a = porClave.get(k);
      if (!a) {
        a = { id: nuevoId('a'), ...x, clave: k, nombre: nombreDef, lab: '', notas: '', plantilla: false };
        db.analiticas.push(a); porClave.set(k, a); res.analNuevas++;
      }
      return a;
    };
    for (const l of leidos) {
      const p = l.plan;
      const i = db.planes.findIndex((q) => q.id === p.id);
      if (i >= 0 && !sustituir) { res.saltados++; continue; }
      const s = analDe(l.suelo, 'Suelo ' + (p.finca || p.cliente));
      const w = analDe(l.agua, 'Agua ' + (p.finca || p.cliente));
      p.analSuelo = s ? s.id : null; p.analAgua = w ? w.id : null;
      const camp = p.campanas[p.campanaActual];
      camp.estiercoles = l.estiercoles.map((e) => ({ analId: analDe(e.anal, 'Estiércol ' + (p.finca || p.cliente)).id, dosis: e.dosis, anio: e.anio }));
      if (i >= 0) {
        const viejo = db.planes[i];
        p.mxCli = viejo.mxCli; p.mxFin = viejo.mxFin; p.tipoCultivo = viejo.tipoCultivo; p.lineas = viejo.lineas; p.campoCartagena = viejo.campoCartagena;
        p.campanas = { ...viejo.campanas, ...p.campanas };
        db.planes[i] = p; res.sustituidos++;
      } else { db.planes.push(p); res.nuevos++; }
    }
    for (const p of db.planes) {
      if (p.analSuelo) { if (!usoSuelo.has(p.analSuelo)) usoSuelo.set(p.analSuelo, new Set()); usoSuelo.get(p.analSuelo).add(p.carpeta); }
      if (p.analAgua) { if (!usoAgua.has(p.analAgua)) usoAgua.set(p.analAgua, new Set()); usoAgua.get(p.analAgua).add(p.cliente); }
    }
    for (const a of db.analiticas) {
      if (a.plantillaRevisada) continue;
      if (a.tipo === 'suelo' && (usoSuelo.get(a.id) || new Set()).size > 1) a.plantilla = true;
      if (a.tipo === 'agua' && (usoAgua.get(a.id) || new Set()).size > 5) a.plantilla = true;
      if (a.plantilla && !/plantilla/i.test(a.nombre)) a.nombre = (a.tipo === 'suelo' ? 'Suelo' : 'Agua') + ' de la plantilla' + (a.ref ? ' · ' + a.ref : '');
    }
    return res;
  }

  const api = { HOJAS, leerLibro, adivinarCultivo, juntar, claveAnal, hash, fecha };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.IMP = api;
})(typeof window !== 'undefined' ? window : globalThis);
