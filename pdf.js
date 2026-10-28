'use strict';
/* Planes de abonado · FG Agro — PDF del balance de nitrógeno (Estimado / Cerrado) con jsPDF + autoTable. */
(function (root) {
  const VERDE = [31, 95, 59], GRIS = [102, 122, 110], SUAVE = [224, 242, 231];
  const f = (v, d = 1) => (v == null || !Number.isFinite(+v) ? '-' : (+v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const fecha = (iso) => { if (!iso) return '-'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : iso; };

  /* datos = { plan, campKey, b (balance del modo), bEst (snapshot estimado, solo cerrado), anal:{suelo,agua,estiercoles[]}, logo, autor } */
  function balance(datos) {
    const { jsPDF } = root.jspdf;
    const { plan, campKey, b, bEst, anal, logo, autor } = datos;
    const cerrado = b.modo === 'cerrado';
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14;
    let y = 14;

    if (logo) { try { const p = doc.getImageProperties(logo); const h = 16, w = Math.min(70, h * p.width / p.height); doc.addImage(logo, M, y - 2, w, h); } catch (_) { /* logo no válido */ } }
    doc.setTextColor(...VERDE); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('BALANCE DE NITRÓGENO', W - M, y + 3, { align: 'right' });
    doc.setFontSize(11); doc.setTextColor(...GRIS);
    doc.text(`${cerrado ? 'Cerrado' : 'Estimado'} · Campaña ${campKey}`, W - M, y + 9, { align: 'right' });
    y += 20;
    doc.setDrawColor(...VERDE); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); y += 4;

    const tablaBase = { theme: 'grid', styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, textColor: [24, 36, 29], lineColor: [210, 220, 212], lineWidth: 0.2 }, headStyles: { fillColor: VERDE, textColor: 255, fontStyle: 'bold' }, margin: { left: M, right: M } };
    const seccion = (t) => { y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 6 : y; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...VERDE); doc.text(t, M, y); y += 2; };

    const s = anal.suelo, w = anal.agua;
    const refAn = (a) => (a ? (a.origen === 'cartografia' ? `Cartografía de suelos (IMIDA)${a.ref ? ' · ' + a.ref : ''}` : `${a.ref || 's/ref'} (${fecha(a.fecha)})${a.plantilla ? ' · DE PLANTILLA' : ''}`) : 'Sin analítica');
    doc.autoTable({
      ...tablaBase, startY: y, theme: 'plain', styles: { ...tablaBase.styles, cellPadding: 1.2 },
      columnStyles: { 0: { fontStyle: 'bold', textColor: GRIS, cellWidth: 38 }, 2: { fontStyle: 'bold', textColor: GRIS, cellWidth: 38 } },
      body: [
        ['Titular', plan.titular || plan.cliente || '-', 'Campaña', String(campKey)],
        ['Finca', plan.finca || '-', 'Cultivo', plan.cultivo || '-'],
        ['Superficie', `${f(plan.superficie, 2)} ha`, 'Nº de árboles', f(plan.arboles, 0)],
        ['Zona vulnerable', plan.vulnerable ? 'Sí' : 'No', 'Recintos', plan.recintos || '-'],
        ['Análisis de suelo', refAn(s), 'Análisis de agua', refAn(w)],
        ['Análisis de estiércol', (anal.estiercoles || []).length ? anal.estiercoles.map(refAn).join('; ') : 'No aplica', cerrado ? 'Fecha de cierre' : 'Fecha', fecha(new Date().toISOString())]
      ]
    });

    seccion('1. ENTRADAS DE NITRÓGENO (kg N/ha)');
    const fila = (c, d, v) => [c, d, { content: f(v, 2), styles: { halign: 'right', fontStyle: 'bold' } }];
    const body = [
      fila('E1. N mineral inicial del suelo (Nmini)', `NO3 ${f(b.no3s, 1)} mg/kg × fA ${f(b.fa && b.fa.valor, 1)} % × fB ${f(b.fb && b.fb.valor, 3)} × 5 × 0,226`, b.E1),
      fila('E2. Mineralización de la materia orgánica', `${f(b.hum && b.hum.valor, 1)} kg N/ha (${(b.hum && b.hum.txt) || '-'}) × fB ${f(b.fb && b.fb.valor, 3)}`, b.E2)
    ];
    if (b.est.length) for (const e of b.est) body.push(fila(`E3. ${e.nombre}`, `${f(e.dosis, 0)} kg/ha × MS ${f(e.ms, 0)} % × N ${f(e.nPct, 2)} % × ${f(e.minPct, 0)} % (año ${e.anio})`, e.nMin));
    else body.push(fila('E3. Enmiendas orgánicas', 'No aplica', 0));
    body.push(fila('E4. Agua de riego', `${f(b.dosisRiego, 0)} m3/ha × NO3 ${f(b.no3w, 1)} mg/L × 0,226 / 1000 × 0,9`, b.E4));
    body.push([{ content: 'Total entradas', colSpan: 2, styles: { fontStyle: 'bold', fillColor: SUAVE } }, { content: f(b.entradas, 2), styles: { halign: 'right', fontStyle: 'bold', fillColor: SUAVE } }]);
    doc.autoTable({ ...tablaBase, startY: y, head: [['Concepto', 'Cálculo', 'kg N/ha']], body, columnStyles: { 0: { cellWidth: 62 }, 2: { cellWidth: 24 } } });

    seccion('2. SALIDAS DE NITRÓGENO (kg N/ha)');
    doc.autoTable({ ...tablaBase, startY: y, head: [['Concepto', 'Cálculo', 'kg N/ha']], columnStyles: { 0: { cellWidth: 62 }, 2: { cellWidth: 24 } },
      body: [fila(`S1. Extracciones del cultivo (producción ${cerrado ? 'real' : 'estimada'})`, `${f(b.prod, 1)} t/ha × ${f(b.coef, 2)} kg N/t`, b.S1)] });

    seccion('3. RESULTADO');
    const res = [
      [{ content: 'Aporte de N mineral = Salidas - Entradas', styles: { fontStyle: 'bold' } }, { content: `${f(b.aporte, 1)} kg N/ha`, styles: { halign: 'right', fontStyle: 'bold', textColor: VERDE } }],
      ['En la superficie de la finca', { content: `${f(b.aporte * (plan.superficie || 0), 1)} kg N`, styles: { halign: 'right' } }]
    ];
    if (plan.vulnerable) res.push(['N orgánico total aplicado (límite 170 kg N/ha)', { content: `${f(b.nOrgTotal, 1)} kg N/ha · ${b.nOrgTotal <= 170 ? 'Cumple' : 'NO CUMPLE'}`, styles: { halign: 'right' } }]);
    doc.autoTable({ ...tablaBase, startY: y, body: res, columnStyles: { 1: { cellWidth: 60 } } });

    if (cerrado) {
      seccion('4. CIERRE DE CAMPAÑA');
      const cmp = [
        ['Dosis de riego (m3/ha)', f(bEst && bEst.dosisRiego, 0), f(b.dosisRiego, 0)],
        ['Producción (t/ha)', f(bEst && bEst.prod, 1), f(b.prod, 1)],
        ['Aporte de N mineral permitido (kg N/ha)', f(bEst && bEst.aporte, 1), f(b.aporte, 1)],
        ['N aplicado en fertirrigación (kg N/ha)', '', f(b.nAplicado, 1)],
        [{ content: 'Diferencia (permitido - aplicado)', styles: { fontStyle: 'bold' } }, '', { content: f(b.aporte - b.nAplicado, 1), styles: { fontStyle: 'bold', textColor: b.nAplicado > b.aporte ? [179, 38, 30] : VERDE } }]
      ];
      doc.autoTable({ ...tablaBase, startY: y, head: [['', bEst ? `Estimado (${fecha(bEst.fecha)})` : 'Estimado', 'Cerrado']], body: cmp, columnStyles: { 1: { halign: 'right', cellWidth: 38 }, 2: { halign: 'right', cellWidth: 38 } } });
    }

    y = doc.lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    const notas = [
      'fA: factor de agotamiento de nitratos según el NO3 del suelo. fB: minoración por suelo humectado según el marco y las líneas de emisores.',
      'E2: N anual disponible del humus según la materia orgánica y la textura del suelo. E4: el 90 % del N del agua de riego.',
      cerrado ? 'Balance cerrado con la dosis de riego y la producción reales de la campaña.' : 'Balance estimado al inicio de la campaña con la dosis de riego programada y la producción esperada.'
    ];
    doc.text(doc.splitTextToSize(notas.join(' '), W - 2 * M), M, y);

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...GRIS);
      doc.text(autor || 'Francis Gabarrón · Gestión Agrícola', M, 290);
      doc.text(`${plan.nombre} · ${i}/${n}`, W - M, 290, { align: 'right' });
    }
    return doc.output('blob');
  }


  /* ================= INFORME MENSUAL · diseño 1.6 (verde campo) =================
     d = { anio, mes, logo, cliente, cultivo, riego:{n,h}, cal:{dias,total,primerDia}, arboles, superficie, vulnerable,
           lineas:[{nombre, porPie, uPie, porRiego, uRiego, riegos, periodo, tanque}], totales:[{nombre,total,u}], ufMes[5],
           aguaMes, aguaAnio (m3 finca), obs, acido, recintos, textos:{fito, general},
           vistazo:{uf12, agua12, nAcum, nTotal, origenN, dentroLimite}, aguaAporta:{dosis, uf[5]}|null,
           marcas:[texto], recomendaciones:[{titulo, texto}], autor, pie:{texto, telefono, email} } */
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const C = {
    verde: [31, 95, 59], verde2: [63, 154, 100], verde3: [168, 213, 184], claro: [241, 247, 243], claro2: [246, 250, 247], borde: [219, 232, 223],
    gris: [93, 122, 104], gris2: [138, 165, 150], tinta: [29, 43, 34], rojo: [192, 57, 43], azulD: [42, 120, 214], azulF: [230, 239, 247], azulT: [36, 78, 117], azulT2: [74, 107, 138],
    agua: [63, 182, 200], aguaF: [234, 246, 248], aguaT: [29, 74, 85], ambar: [255, 244, 214], ambarT: [122, 82, 0], morado: [233, 226, 247], moradoT: [90, 61, 153],
    t1: [223, 240, 229], nutr: [[42, 120, 214], [235, 104, 52], [27, 175, 122], [237, 161, 0], [232, 123, 164]], pista: [232, 239, 233]
  };
  const NUTR = ['N', 'P₂O₅', 'K₂O', 'CaO', 'MgO'];
  const W = 210, M = 12, D = W - M, AN = D - M;
  const num = (v, dd = 1) => (v == null || !Number.isFinite(+v) ? '–' : (+v).toLocaleString('es-ES', { minimumFractionDigits: dd, maximumFractionDigits: dd }));
  const hm = (h) => { h = +h || 0; if (!h) return '0:00'; let H = Math.floor(h), Mi = Math.round((h - H) * 60); if (Mi === 60) { H++; Mi = 0; } return `${H}:${String(Mi).padStart(2, '0')}`; };
  const tinte = (c, k) => c.map((v) => Math.round(v + (255 - v) * k));

  function fuentes(doc) {
    const F = root.FUENTES;
    if (!F) return false;
    doc.addFileToVFS('Inter-Regular.ttf', F.regular); doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
    doc.addFileToVFS('Inter-Bold.ttf', F.bold); doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');
    doc.addFileToVFS('Inter-SemiBold.ttf', F.semibold); doc.addFont('Inter-SemiBold.ttf', 'InterSB', 'normal');
    return true;
  }
  function mk(doc) {
    const hay = fuentes(doc);
    const fam = { n: hay ? ['Inter', 'normal'] : ['helvetica', 'normal'], b: hay ? ['Inter', 'bold'] : ['helvetica', 'bold'], s: hay ? ['InterSB', 'normal'] : ['helvetica', 'bold'] };
    const t = (txt, x, y, { f = 'n', s = 9, c = C.tinta, al = 'left', cs = 0, mw = 0 } = {}) => {
      doc.setFont(...fam[f]); doc.setFontSize(s); doc.setTextColor(...c);
      const o = {}; if (cs) o.charSpace = cs; if (mw) o.maxWidth = mw;
      const arr = Array.isArray(txt);
      if (!arr && cs && al !== 'left') { const w = doc.getTextWidth(String(txt)) + cs * Math.max(0, String(txt).length - 1); doc.text(String(txt), al === 'right' ? x - w : x - w / 2, y, o); return; }
      o.align = al; o.lineHeightFactor = 1.4;
      doc.text(arr ? txt : String(txt), x, y, o);
    };
    const ancho = (txt, f = 'n', s = 9, cs = 0) => { doc.setFont(...fam[f]); doc.setFontSize(s); return doc.getTextWidth(String(txt)) + cs * Math.max(0, String(txt).length - 1); };
    const lineas = (txt, w, f = 'n', s = 9) => { doc.setFont(...fam[f]); doc.setFontSize(s); return doc.splitTextToSize(String(txt), w); };
    const caja = (x, y, w, h, fill, r = 2.6, borde = null) => { if (fill) doc.setFillColor(...fill); if (borde) { doc.setDrawColor(...borde); doc.setLineWidth(0.3); } doc.roundedRect(x, y, w, h, r, r, fill && borde ? 'FD' : fill ? 'F' : 'S'); };
    const titulo = (txt, x, y) => t(txt.toUpperCase(), x, y, { f: 'b', s: 8.2, c: C.verde, cs: 0.35 });
    return { t, ancho, lineas, caja, titulo, fam };
  }
  function banda(doc, y) {
    const n = 60;
    for (let k = 0; k < n; k++) {
      const a = k / (n - 1);
      const c = a < 0.6 ? C.verde.map((v, j) => Math.round(v + (C.verde2[j] - v) * (a / 0.6))) : C.verde2.map((v, j) => Math.round(v + (C.verde3[j] - v) * ((a - 0.6) / 0.4)));
      doc.setFillColor(...c); doc.rect(M + AN * k / n, y, AN / n + 0.2, 1.6, 'F');
    }
  }
  function logoEn(doc, logo, x, y, h, maxW) {
    if (!logo) return 0;
    try { const p = doc.getImageProperties(logo); const w = Math.min(maxW, h * p.width / p.height); doc.addImage(logo, x, y + (h - Math.min(h, w * p.height / p.width)) / 2, w, Math.min(h, w * p.height / p.width)); return w; } catch (_) { return 0; }
  }
  function sector(doc, cx, cy, r0, r1, a0, a1, color) {
    if (a1 - a0 < 0.002) return;
    const pts = [], n = Math.max(8, Math.ceil((a1 - a0) / 0.06));
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push([cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]); }
    for (let k = n; k >= 0; k--) { const a = a0 + (a1 - a0) * k / n; pts.push([cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)]); }
    const rel = []; for (let k = 1; k < pts.length; k++) rel.push([pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]]);
    doc.setFillColor(...color); doc.lines(rel, pts[0][0], pts[0][1], [1, 1], 'F', true);
  }
  function rosca(doc, cx, cy, r, frac, color, pista) {
    const g = r * 0.24;
    sector(doc, cx, cy, r - g, r, 0, 2 * Math.PI, pista);
    if (frac > 0) {
      const a0 = -Math.PI / 2, a1 = a0 + 2 * Math.PI * Math.min(1, frac);
      sector(doc, cx, cy, r - g, r, a0, a1, color);
      doc.setFillColor(...color); // extremos redondeados
      for (const a of [a0, a1]) doc.circle(cx + (r - g / 2) * Math.cos(a), cy + (r - g / 2) * Math.sin(a), g / 2, 'F');
    }
  }
  function check(doc, x, y, s, color) { doc.setDrawColor(...color); doc.setLineWidth(0.55); doc.setLineCap('round'); doc.line(x, y, x + s * 0.38, y + s * 0.38); doc.line(x + s * 0.38, y + s * 0.38, x + s, y - s * 0.42); doc.setLineCap('butt'); }
  function gota(doc, x, y, s, color) { doc.setFillColor(...color); doc.circle(x, y + s * 0.18, s * 0.42, 'F'); doc.triangle(x - s * 0.4, y + s * 0.05, x + s * 0.4, y + s * 0.05, x, y - s * 0.6, 'F'); }
  function aviso(doc, x, y, s, color) { doc.setDrawColor(...color); doc.setLineWidth(0.45); doc.setLineJoin('round'); doc.triangle(x, y - s * 0.5, x - s * 0.55, y + s * 0.45, x + s * 0.55, y + s * 0.45, 'S'); doc.line(x, y - s * 0.12, x, y + s * 0.15); doc.circle(x, y + s * 0.3, 0.12, 'F'); }

  function informe(d) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const K = mk(doc), { t, ancho, lineas, caja, titulo } = K;
    const mesTxt = `${MESES[d.mes]} ${d.anio}`;
    const pieIzq = d.autor || 'FG Agro · Gestión agrícola';
    const piePag = () => { t(pieIzq, M, 290, { s: 7.2, c: C.gris2 }); t(`Página ${doc.getNumberOfPages()}`, D, 290, { s: 7.2, c: C.gris2, al: 'right' }); };

    /* ---------- PÁGINA 1 ---------- */
    logoEn(doc, d.logo, M, 8, 15, 55);
    t('RECOMENDACIÓN DE FERTIRRIGACIÓN', D, 12.5, { f: 's', s: 7.6, c: C.gris, al: 'right', cs: 0.45 });
    t(mesTxt, D, 22, { f: 'b', s: 22, c: C.verde, al: 'right' });
    banda(doc, 27);
    let y = 31.5;
    const anchos = [1.5, 1.4, 0.7, 0.7], gap = 2.6, tot = anchos.reduce((a, b) => a + b, 0), wu = (AN - gap * 3) / tot;
    const info = [['Cliente', d.cliente || '–'], ['Cultivo y sector', d.cultivo || '–'], ['Árboles', num(d.arboles, 0)], ['Superficie', `${num(d.superficie, 2)} ha`]];
    let x = M;
    info.forEach(([l, v], k) => {
      const w = anchos[k] * wu; caja(x, y, w, 12.5, C.claro, 2.6);
      t(l.toUpperCase(), x + 3, y + 4.6, { f: 's', s: 6.6, c: C.gris, cs: 0.25 });
      t(lineas(v, w - 6, 's', 10)[0] || '', x + 3, y + 9.6, { f: 's', s: 10 });
      x += w + gap;
    });
    y += 15.5;
    if (d.vulnerable) {
      const tx = 'Zona vulnerable a nitratos', w = ancho(tx, 's', 8.6) + 11;
      caja(M, y, w, 6.2, C.ambar, 3.1);
      aviso(doc, M + 4.2, y + 3.1, 3, C.ambarT);
      t(tx, M + 7.6, y + 4.3, { f: 's', s: 8.6, c: C.ambarT });
      y += 9;
    }
    // Riego del mes + calendario
    y += 3;
    const colL = AN * 0.465, colR0 = M + colL + 6, colR = D - colR0;
    titulo('Riego del mes', M, y); titulo('Días de riego', colR0, y);
    y += 3;
    const kw = (colL - 2.6) / 2;
    const kpi = (xx, yy, l, v, u, bg, cl, cv) => {
      if (bg) caja(xx, yy, kw, 14.5, bg, 3); else caja(xx, yy, kw, 14.5, null, 3, C.borde);
      t(l, xx + 3.2, yy + 5, { s: 7.8, c: cl });
      t(v, xx + 3.2, yy + 11.6, { f: 'b', s: 15, c: cv });
      if (u) t(u, xx + 3.2 + ancho(v, 'b', 15) + 1.2, yy + 11.6, { s: 8.5, c: cl });
    };
    kpi(M, y, 'Días de riego', String(d.riego.n || 0), '', null, C.gris, C.verde);
    kpi(M + kw + 2.6, y, 'Tiempo por riego', hm(d.riego.h), 'h', null, C.gris, C.verde);
    kpi(M, y + 17, 'Agua este mes', num(d.aguaMes, 0), 'm³', C.azulF, C.azulT2, C.azulT);
    kpi(M + kw + 2.6, y + 17, 'Agua en la campaña', num(d.aguaAnio, 0), 'm³', C.azulF, C.azulT2, C.azulT);
    // calendario con círculos
    const cal = d.cal, filas = Math.ceil((cal.primerDia + cal.total) / 7), cw = (colR - 6) / 7, rh = 7.4;
    const ch = 9 + filas * rh + 1;
    caja(colR0, y, colR, ch, null, 3.4, C.borde);
    'LMXJVSD'.split('').forEach((l, k) => t(l, colR0 + 3 + cw * k + cw / 2, y + 6, { f: 'b', s: 7.2, c: k >= 5 ? C.rojo : C.gris, al: 'center' }));
    const set = new Set(cal.dias);
    for (let dd = 1; dd <= cal.total; dd++) {
      const c = cal.primerDia + dd - 1, fi = Math.floor(c / 7), co = c % 7;
      const cx = colR0 + 3 + cw * co + cw / 2, cy = y + 9 + fi * rh + rh / 2;
      if (set.has(dd)) { doc.setFillColor(...C.azulD); doc.circle(cx, cy, 3.1, 'F'); t(String(dd), cx, cy + 1.15, { f: 'b', s: 8, c: [255, 255, 255], al: 'center' }); }
      else t(String(dd), cx, cy + 1.15, { s: 8, c: co >= 5 ? C.rojo : C.tinta, al: 'center' });
    }
    doc.setFillColor(...C.azulD); doc.circle(colR0 + 1.6, y + ch + 3.4, 1.3, 'F');
    t('día de riego', colR0 + 4.2, y + ch + 4.4, { s: 7.2, c: C.gris });
    y = Math.max(y + 31.5, y + ch + 6) + 6;

    // Fertirrigación
    titulo('Fertirrigación', M, y); y += 2;
    const filasT = d.lineas.map((l) => ['', l.nombre, l.porPie, l.porRiego, String(l.riegos ?? ''), l.periodo || '', l.tanque || '']);
    if (!filasT.length) filasT.push(['', 'Sin productos este mes', '', '', '', '', '']);
    const fn = K.fam;
    doc.autoTable({
      startY: y, margin: { left: M, right: M }, theme: 'plain',
      head: [['', 'PRODUCTO', 'POR PLANTA', 'POR RIEGO', 'RIEGOS', 'PERIODO', 'TANQUE']], body: filasT,
      styles: { font: fn.n[0], fontStyle: fn.n[1], fontSize: 9.2, textColor: C.tinta, cellPadding: { top: 2.1, bottom: 2.1, left: 2, right: 2 }, valign: 'middle', fillColor: C.claro2, lineWidth: 0 },
      headStyles: { font: fn.b[0], fontStyle: fn.b[1], fontSize: 7, textColor: C.gris, fillColor: [255, 255, 255], cellPadding: { top: 1, bottom: 1.6, left: 2, right: 2 } },
      columnStyles: { 0: { cellWidth: 7 }, 1: { font: fn.b[0], fontStyle: fn.b[1] }, 2: { halign: 'right', cellWidth: 24 }, 3: { halign: 'right', cellWidth: 24, font: fn.b[0], fontStyle: fn.b[1] }, 4: { halign: 'right', cellWidth: 16 }, 5: { cellWidth: 30 }, 6: { cellWidth: 26 } },
      didParseCell: (h) => { if (h.section === 'head' && [2, 3, 4].includes(h.column.index)) h.cell.styles.halign = 'right'; if (h.section === 'body' && h.column.index === 6) h.cell.styles.textColor = h.cell.styles.fillColor; },
      willDrawCell: (h) => { if (h.section === 'body') { h.cell.styles.lineWidth = 0; } },
      didDrawCell: (h) => {
        if (h.section !== 'body') return;
        // separación blanca entre filas
        doc.setFillColor(255, 255, 255); doc.rect(h.cell.x, h.cell.y + h.cell.height - 0.6, h.cell.width, 0.6, 'F');
        if (h.column.index === 0 && d.lineas.length) { doc.setDrawColor(...C.gris); doc.setLineWidth(0.35); doc.roundedRect(h.cell.x + 2, h.cell.y + h.cell.height / 2 - 2.1, 3.6, 3.6, 0.7, 0.7, 'S'); }
        if (h.column.index === 6 && h.cell.raw) {
          const tq = h.cell.raw, e = /^E/i.test(tq), txt = e ? tq : 'Tanque ' + tq, w = ancho(txt, 'b', 7.6) + 5;
          caja(h.cell.x + 2, h.cell.y + h.cell.height / 2 - 2.6, w, 4.8, e ? C.morado : C.t1, 2.4);
          t(txt, h.cell.x + 4.5, h.cell.y + h.cell.height / 2 + 0.9, { f: 'b', s: 7.6, c: e ? C.moradoT : C.verde });
        }
      }
    });
    y = doc.lastAutoTable.finalY + 2.5;
    const notaDep = lineas('Depósito 1: fertilizantes sin calcio · Depósito 2: sin sulfatos ni fosfatos · Depósito E: aportes especiales. Con menos depósitos, vaciar y limpiar bien antes de cada mezcla.', AN, 'n', 6.6);
    t(notaDep, M, y + 1, { s: 6.6, c: C.gris });
    y += 1 + notaDep.length * 3.3 + 6;

    // Abono total + unidades fertilizantes
    const nTot = Math.max(d.totales.length, 1), hTot = 7 + nTot * 6.1, hUF = 7 + 26;
    if (y + Math.max(hTot, hUF) + 30 > 284) { piePag(); doc.addPage(); y = 16; }
    const cL = AN * 0.45, cR0 = M + cL + 8, cR = D - cR0;
    titulo('Abono total del mes', M, y); titulo('Unidades fertilizantes del mes', cR0, y);
    let yy = y + 4;
    (d.totales.length ? d.totales : [{ nombre: 'Sin productos', total: null, u: '' }]).forEach((p) => {
      t(p.nombre, M, yy + 3.6, { s: 9 });
      if (p.total != null) t(`${num(p.total, 1)} ${p.u}`, M + cL, yy + 3.6, { f: 'b', s: 9, al: 'right' });
      doc.setDrawColor(227, 236, 230); doc.setLineWidth(0.25); doc.line(M, yy + 6, M + cL, yy + 6);
      yy += 6.1;
    });
    caja(cR0, y + 3, cR, 25, null, 3.4, C.borde);
    const mx = Math.max(...d.ufMes.map((v) => +v || 0), 0.01), dw = cR / 5;
    NUTR.forEach((n, j) => {
      const v = +d.ufMes[j] || 0, cx = cR0 + dw * j + dw / 2, cy = y + 13.3;
      rosca(doc, cx, cy, 7.2, v / mx, C.nutr[j], C.pista);
      t(v ? num(v, 1) : '–', cx, cy + 1.3, { f: 'b', s: 8.2, al: 'center' });
      t(n, cx, cy + 11.5, { f: 's', s: 7.6, c: C.gris, al: 'center' });
    });
    t('kg de unidades fertilizantes por hectárea', cR0, y + 31.5, { s: 6.8, c: C.gris2 });
    y = Math.max(yy, y + 33) + 6;

    // Observaciones
    const obs = [];
    if (d.obs) obs.push(d.obs);
    if (d.acido) obs.push(`En caso de necesidad, la dosis de ácido nítrico/ácido fosfórico para limpieza de goteros es de ${num(d.acido.nitrico, 1)} L de nítrico o ${num(d.acido.fosforico, 1)} L de fosfórico. Inyectar durante 1 hora. Después abrir las mangueras. Se recomienda una vez al mes.`);
    if (d.recintos) obs.push(`Esta unidad de producción incluye los siguientes recintos: ${d.recintos}`);
    if (obs.length) {
      const ls = obs.map((o) => lineas(o, AN - 12, 'n', 9));
      const h = ls.reduce((s, l) => s + l.length * 4.45 + 1.6, 0) + 5;
      if (y + 6 + h > 284) { piePag(); doc.addPage(); y = 16; }
      titulo('Observaciones', M, y); y += 3;
      doc.setFillColor(...C.claro2); doc.roundedRect(M, y, AN, h, 2.6, 2.6, 'F');
      doc.setFillColor(...C.verde2); doc.rect(M, y, 1.4, h, 'F');
      let oy = y + 6;
      for (const l of ls) { t(l, M + 6, oy, { s: 9 }); oy += l.length * 4.45 + 1.6; }
      y += h;
    }
    piePag();

    /* ---------- PÁGINA 2 (y 3 si no cabe) ---------- */
    const cabecera = () => {
      logoEn(doc, d.logo, M, 8, 11, 45);
      t(`${(d.cliente || '').toUpperCase()} · ${(d.cultivo || '').toUpperCase()}`, D, 11.5, { f: 's', s: 6.8, c: C.gris, al: 'right', cs: 0.35 });
      t(mesTxt, D, 18.5, { f: 'b', s: 15, c: C.verde, al: 'right' });
      banda(doc, 22); return 28;
    };
    const LIM = 257; // por debajo va el pie del programa
    doc.addPage(); y = cabecera();
    const bloque = (h, fn) => { if (y + h > LIM) { piePag(); doc.addPage(); y = cabecera(); } fn(y); y += h; };
    const texto = (tit, txt) => {
      if (!txt || !String(txt).trim()) return;
      const ls = lineas(String(txt).trim(), AN - 12, 'n', 9.3), h = ls.length * 4.6 + 6;
      bloque(h + 9, (y0) => { titulo(tit, M, y0 + 4); caja(M, y0 + 6.5, AN, h, C.claro, 3); t(ls, M + 6, y0 + 11.8, { s: 9.3 }); });
    };
    texto('Información fitosanitaria', d.textos.fito);
    texto('Situación actual y novedades', d.textos.general);

    // Tu plan de un vistazo
    const v = d.vistazo;
    if (v) bloque(88, (y0) => {
      titulo('Tu plan de un vistazo', M, y0 + 4);
      const by = y0 + 6.5; caja(M, by, AN, 78, null, 3.4, C.borde);
      t('Tu campaña mes a mes', M + 6, by + 7, { f: 's', s: 9 });
      const ley = [['N', C.nutr[0]], ['P₂O₅', C.nutr[1]], ['K₂O', C.nutr[2]], ['Agua', C.agua]];
      let lx = D - 6; for (const [n, c] of [...ley].reverse()) { const w = ancho(n, 'n', 7.6); lx -= w; t(n, lx, by + 7, { s: 7.6, c: C.gris }); lx -= 4.2; doc.setFillColor(...c); doc.roundedRect(lx, by + 4.5, 2.8, 2.8, 0.5, 0.5, 'F'); lx -= 5; }
      const gx = M + 18, gw = D - 6 - gx, colW = gw / 12, base = by + 31, hUp = 20, hDn = 9;
      const tots = v.uf12.map((m) => (+m[0] || 0) + (+m[1] || 0) + (+m[2] || 0));
      const maxU = Math.max(...tots, 0.01), maxA = Math.max(...v.agua12, 0.01);
      t('Abono ↑', M + 6, base - 1.5, { f: 's', s: 7, c: C.gris });
      t('Agua ↓', M + 6, base + 4.5, { f: 's', s: 7, c: C.gris });
      for (let i = 0; i < 12; i++) {
        const act = i === d.mes, k = act ? 0 : 0.62, bw = colW * 0.42, bx = gx + colW * i + (colW - bw) / 2;
        if (act) caja(gx + colW * i + 0.8, base - hUp - 3, colW - 1.6, hUp + hDn + 11, [238, 246, 240], 2.4);
        let yb = base;
        [0, 1, 2].forEach((j) => { const h = hUp * (+v.uf12[i][j] || 0) / maxU; if (h < 0.05) return; doc.setFillColor(...tinte(C.nutr[j], k)); doc.rect(bx, yb - h, bw, h, 'F'); yb -= h; });
        const ha = hDn * (+v.agua12[i] || 0) / maxA;
        if (ha > 0.05) { doc.setFillColor(...tinte(C.agua, act ? 0 : 0.62)); doc.rect(bx, base + 0.8, bw, ha, 'F'); }
        t(MESES[i].slice(0, 3), gx + colW * i + colW / 2, base + hDn + 5.5, { f: act ? 'b' : 'n', s: 7.4, c: act ? C.verde : C.gris, al: 'center' });
      }
      doc.setDrawColor(201, 214, 205); doc.setLineWidth(0.3); doc.line(gx, base + 0.4, gx + gw, base + 0.4);
      // aplicado hasta el mes
      const sy = by + 53, cw2 = (AN - 12 - 10) / 2;
      t(`Campaña aplicada hasta ${MESES[d.mes].toLowerCase()}`, M + 6, sy, { f: 's', s: 8.6 });
      ['Nitrógeno', 'Fósforo', 'Potasio'].forEach((n, j) => {
        const yy2 = sy + 4 + j * 6.2, fr = v.nTotal[j] ? Math.min(1, v.nAcum[j] / v.nTotal[j]) : 0, bx = M + 26, bw = cw2 - 34;
        t(n, M + 6, yy2 + 2.8, { s: 8.4 });
        caja(bx, yy2, bw, 3.6, C.pista, 1.8);
        if (fr > 0) caja(bx, yy2, Math.max(3.6, bw * fr), 3.6, C.nutr[j], 1.8);
        t(v.nTotal[j] ? `${Math.round(fr * 100)} %` : '–', M + 6 + cw2, yy2 + 2.9, { f: 's', s: 8.2, c: C.gris, al: 'right' });
      });
      // de dónde sale el nitrógeno
      const ox = M + 6 + cw2 + 10, ow = cw2;
      t('De dónde sale el nitrógeno que necesita', ox, sy, { f: 's', s: 8.6 });
      const o = v.origenN || {};
      const partes = [['Suelo', o.suelo, [140, 106, 70]], ['Agua de riego', o.agua, [91, 155, 213]], ['Estiércol', o.estiercol, [176, 138, 60]], ['Abono', o.abono, C.verde]].filter((p) => (+p[1] || 0) > 0.05);
      const tt = partes.reduce((s, p) => s + p[1], 0);
      if (tt > 0) {
        let xx = ox; const yb = sy + 3.2;
        doc.saveGraphicsState && doc.saveGraphicsState();
        caja(ox, yb, ow, 6.4, [255, 255, 255], 2);
        partes.forEach(([, val, c], k) => {
          const w = ow * val / tt; doc.setFillColor(...c);
          if (k === 0) doc.roundedRect(xx, yb, w + 2, 6.4, 2, 2, 'F'); else if (k === partes.length - 1) doc.roundedRect(xx - 2, yb, w + 2, 6.4, 2, 2, 'F');
          doc.rect(xx + (k === 0 ? 2 : 0), yb, Math.max(0, w - (k === 0 ? 2 : 0) - (k === partes.length - 1 ? 2 : 0)), 6.4, 'F');
          if (w > 8) t(`${Math.round(val / tt * 100)} %`, xx + w / 2, yb + 4.4, { f: 'b', s: 7.4, c: [255, 255, 255], al: 'center' });
          xx += w;
        });
        let lx2 = ox; partes.forEach(([n, , c]) => { doc.setFillColor(...c); doc.roundedRect(lx2, yb + 9, 2.6, 2.6, 0.5, 0.5, 'F'); t(n, lx2 + 3.8, yb + 11.2, { s: 7.4, c: C.gris }); lx2 += ancho(n, 'n', 7.4) + 8; });
        t(lineas('El abono solo pone lo que no aportan ya el suelo, el agua y la materia orgánica.', ow, 'n', 7)[0], ox, yb + 16.5, { s: 7, c: C.gris2 });
      }
    });

    // Lo que aporta tu agua de riego
    if (d.aguaAporta && d.aguaAporta.uf.some((x) => x > 0.05)) bloque(33, (y0) => {
      titulo('Lo que aporta tu agua de riego', M, y0 + 4);
      const by = y0 + 6.5, h = 25; caja(M, by, AN, h, C.aguaF, 3.4);
      gota(doc, M + 6, by + 6.2, 4.2, C.agua);
      const tw = AN * 0.53 - 12;
      t('Tu agua también abona', M + 11, by + 6.2, { f: 'b', s: 9, c: C.aguaT });
      const txt = `Con los ${num(d.aguaAporta.dosis, 0)} m³/ha de riego de la campaña y la analítica de tu agua, estos nutrientes ya llegan a la planta y están descontados de tu abonado: no pagas por lo que el agua ya pone.`;
      t(lineas(txt, tw, 'n', 8.2), M + 11, by + 10.6, { s: 8.2, c: [47, 74, 82] });
      const sel = [[0, 'Nitrógeno (N)'], [2, 'Potasio (K₂O)'], [3, 'Calcio (CaO)'], [4, 'Magnesio (MgO)']];
      const tx0 = M + AN * 0.55, tW = (D - 4 - tx0 - 3 * 2) / 4;
      sel.forEach(([j, n], k) => {
        const xx = tx0 + k * (tW + 2), val = d.aguaAporta.uf[j];
        caja(xx, by + 3.5, tW, h - 7, [255, 255, 255], 2.4);
        t(val >= 10 ? num(val, 0) : num(val, 1), xx + tW / 2, by + 10.2, { f: 'b', s: 12, c: C.aguaT, al: 'center' });
        t('kg/ha', xx + tW / 2, by + 13.4, { s: 6.4, c: [93, 122, 128], al: 'center' });
        t(lineas(n, tW - 2, 'n', 6.6), xx + tW / 2, by + 16.6, { s: 6.6, c: [47, 74, 82], al: 'center' });
      });
    });

    // Marcas de lo comprobado
    if (d.marcas && d.marcas.length) {
      const chips = d.marcas.map((m) => ({ m, w: ancho(m, 'n', 8.2) + 11 }));
      let filas = 1, cx = M; for (const c of chips) { if (cx + c.w > D) { filas++; cx = M; } cx += c.w + 2.5; }
      bloque(filas * 8.2 + 3, (y0) => {
        let xx = M, yy2 = y0 + 2;
        for (const c of chips) {
          if (xx + c.w > D) { xx = M; yy2 += 8.2; }
          caja(xx, yy2, c.w, 6.6, [227, 241, 232], 3.3); check(doc, xx + 3, yy2 + 3.4, 2.6, C.verde); t(c.m, xx + 7.4, yy2 + 4.5, { s: 8.2 });
          xx += c.w + 2.5;
        }
      });
    }
    // Recomendaciones (analíticas)
    for (const r of d.recomendaciones || []) {
      const ls = lineas(r.texto, AN - 16, 'n', 8.6), h = ls.length * 4.2 + 10;
      bloque(h + 3, (y0) => {
        caja(M, y0 + 1, AN, h, C.ambar, 3);
        aviso(doc, M + 5.6, y0 + 6.2, 3.6, C.ambarT);
        t(r.titulo, M + 10.5, y0 + 6.6, { f: 'b', s: 9, c: C.ambarT });
        t(ls, M + 10.5, y0 + 11, { s: 8.6, c: [92, 67, 0] });
      });
    }
    // Pie del programa (última página)
    const pie = d.pie || {};
    if (pie.texto) t(lineas(pie.texto, AN - 6, 'n', 6.8), W / 2, 262, { s: 6.8, c: C.gris, al: 'center' });
    const tel = pie.telefono ? `Telf: ${pie.telefono}` : '', mail = pie.email ? `E-mail: ${pie.email}` : '';
    if (tel) t(tel, W / 2 - 30, 279, { s: 8.6, al: 'center' });
    if (mail) t(mail, W / 2 + 30, 279, { s: 8.6, al: 'center' });
    piePag();
    return doc.output('blob');
  }


  /* ================= REGISTROS (1.6): fertilización, riego, plan de abonado anual, productos para pedidos ================= */
  function docReg(horizontal) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: horizontal ? 'landscape' : 'portrait' });
    const K = mk(doc);
    const PW = horizontal ? 297 : 210, PH = horizontal ? 210 : 297, R = PW - M;
    return { doc, K, PW, PH, R, AW: R - M };
  }
  function cabReg(o, titulo, sub, logo) {
    const { doc, K, R } = o;
    logoEn(doc, logo, M, 8, 13, 50);
    K.t(titulo.toUpperCase(), R, 12, { f: 's', s: 7.6, c: C.gris, al: 'right', cs: 0.45 });
    K.t(sub, R, 20, { f: 'b', s: 15, c: C.verde, al: 'right' });
    const n = 60, a0 = C.verde, a1 = C.verde3;
    for (let k = 0; k < n; k++) { const f = k / (n - 1); doc.setFillColor(...a0.map((v, j) => Math.round(v + (a1[j] - v) * f))); doc.rect(M + o.AW * k / n, 24, o.AW / n + 0.2, 1.4, 'F'); }
    return 30;
  }
  function datosReg(o, pares, y, cols = 4) {
    const { K } = o, gap = 2.4, w = (o.AW - gap * (cols - 1)) / cols;
    let x = M, fila = 0;
    pares.forEach(([l, v], k) => {
      const c = k % cols; if (c === 0 && k) { fila++; }
      x = M + c * (w + gap); const yy = y + fila * 13;
      K.caja(x, yy, w, 11.2, C.claro, 2.2);
      K.t(String(l).toUpperCase(), x + 2.6, yy + 4, { f: 's', s: 6.2, c: C.gris, cs: 0.2 });
      K.t(K.lineas(v == null || v === '' ? '–' : String(v), w - 5, 's', 8.6)[0], x + 2.6, yy + 8.6, { f: 's', s: 8.6 });
    });
    return y + (fila + 1) * 13 + 2;
  }
  function tablaReg(o, { y, head, body, cols = {}, sub = [], pie = null, fs = 8.2 }) {
    const { doc, K } = o, fn = K.fam;
    doc.autoTable({
      startY: y, margin: { left: M, right: M, top: 30, bottom: 16 }, theme: 'plain', head: [head], body, foot: pie ? [pie] : undefined, showFoot: 'lastPage',
      styles: { font: fn.n[0], fontStyle: fn.n[1], fontSize: fs, textColor: C.tinta, cellPadding: { top: 1.6, bottom: 1.6, left: 1.8, right: 1.8 }, valign: 'middle', lineWidth: 0 },
      headStyles: { font: fn.b[0], fontStyle: fn.b[1], fontSize: 6.8, textColor: C.gris, fillColor: [255, 255, 255] },
      footStyles: { font: fn.b[0], fontStyle: fn.b[1], fontSize: fs, textColor: C.verde, fillColor: C.claro },
      columnStyles: cols,
      didParseCell: (h) => {
        if (h.section === 'head' && cols[h.column.index] && cols[h.column.index].halign) h.cell.styles.halign = cols[h.column.index].halign;
        if (h.section === 'body') { h.cell.styles.fillColor = h.row.index % 2 ? [255, 255, 255] : C.claro2; if (sub.includes(h.row.index)) { h.cell.styles.fillColor = C.claro; h.cell.styles.font = fn.s[0]; h.cell.styles.fontStyle = fn.s[1]; h.cell.styles.textColor = C.verde; } }
      },
      didDrawPage: () => { doc.setDrawColor(...C.borde); }
    });
    return doc.lastAutoTable.finalY;
  }
  function pieReg(o, texto) {
    const { doc, K, PW, PH } = o, n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); K.t(texto, M, PH - 7, { s: 6.8, c: C.gris2 }); K.t(`Página ${i} de ${n}`, PW - M, PH - 7, { s: 6.8, c: C.gris2, al: 'right' }); }
  }
  function firmas(o, y, autor) {
    const { doc, K, PH } = o;
    if (y + 26 > PH - 16) { doc.addPage(); y = 20; }
    const w = (o.AW - 20) / 2;
    [[`El asesor${autor ? ': ' + autor : ''}`, M], ['El titular de la explotación', M + w + 20]].forEach(([t, x]) => { doc.setDrawColor(...C.borde); doc.setLineWidth(0.3); doc.line(x, y + 18, x + w, y + 18); K.t(t, x, y + 22.5, { s: 7.6, c: C.gris }); });
    return y + 26;
  }
  const n1 = (v) => num(v, 1), n0_ = (v) => num(v, 0);

  /* d = { titulo, intervalo, logo, autor, planes: [{ cab:[[l,v]], meses:[{ etiqueta, lineas:[{fecha, producto, tipo, riqueza, dosis, total}], uf[3], acum[3], obj[3]|null }], tot[3], permitido, campanas }] } */
  function registroFert(d) {
    const o = docReg(true), { doc, K } = o;
    d.planes.forEach((p, k) => {
      if (k) doc.addPage();
      let y = cabReg(o, 'Registro de fertilización · RD 1051/2022', d.intervalo, d.logo);
      y = datosReg(o, p.cab, y, 5);
      const body = [], sub = [];
      for (const m of p.meses) {
        for (const l of m.lineas) body.push([l.fecha, l.producto, l.tipo, l.riqueza, l.dosis, l.total, n1(l.uf[0]), n1(l.uf[1]), n1(l.uf[2]), 'Fertirrigación']);
        sub.push(body.length);
        body.push([`Total ${m.etiqueta}`, m.obj ? `Recomendado (plan): N ${n1(m.obj[0])} · P₂O₅ ${n1(m.obj[1])} · K₂O ${n1(m.obj[2])}` : '', '', '', '', `Acumulado: ${n1(m.acum[0])} · ${n1(m.acum[1])} · ${n1(m.acum[2])}`, n1(m.uf[0]), n1(m.uf[1]), n1(m.uf[2]), '']);
      }
      if (!body.length) body.push(['', 'Sin aportes de fertilizantes en el intervalo', '', '', '', '', '', '', '', '']);
      y = tablaReg(o, {
        y, body, sub, fs: 7.8,
        head: ['FECHA', 'PRODUCTO', 'TIPO', 'RIQUEZA N-P₂O₅-K₂O (%)', 'DOSIS', 'CANTIDAD FINCA', 'N kg/ha', 'P₂O₅ kg/ha', 'K₂O kg/ha', 'MÉTODO'],
        cols: { 0: { cellWidth: 26 }, 1: { cellWidth: 58 }, 2: { cellWidth: 30 }, 3: { cellWidth: 30, halign: 'center' }, 4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 28, halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { cellWidth: 24 } },
        pie: ['Total del intervalo', '', '', '', '', '', n1(p.tot[0]), n1(p.tot[1]), n1(p.tot[2]), '']
      });
      y += 5;
      const nota = `Unidades fertilizantes en kg/ha. Aporte de N mineral permitido por el balance de la campaña ${p.campanas}: ${n1(p.permitido)} kg N/ha. Registro elaborado a partir del plan de fertirrigación; las fechas corresponden a los días de riego programados para cada producto.`;
      K.t(K.lineas(nota, o.AW, 'n', 7.4), M, y + 2, { s: 7.4, c: C.gris });
      firmas(o, y + 8, d.autor);
    });
    pieReg(o, `${d.titulo} · ${d.intervalo}`);
    return doc.output('blob');
  }

  /* d = { titulo, intervalo, logo, autor, planes: [{ cab, filas:[{mes, dias, n, h, m3ha, m3finca, acum, nec}], tot:{n, m3ha, m3finca, nec}, sistema, agua }] } */
  function registroRiego(d) {
    const o = docReg(false), { doc, K } = o;
    d.planes.forEach((p, k) => {
      if (k) doc.addPage();
      let y = cabReg(o, 'Registro de riego', d.intervalo, d.logo);
      y = datosReg(o, p.cab, y, 3);
      const body = p.filas.map((f) => [f.mes, f.dias, String(f.n || 0), f.h, n0_(f.m3ha), n0_(f.m3finca), n0_(f.acum), n0_(f.nec), f.nec ? `${n0_(f.m3ha / f.nec * 100)} %` : '–']);
      y = tablaReg(o, {
        y, body, fs: 8,
        head: ['MES', 'DÍAS DE RIEGO', 'Nº RIEGOS', 'HORAS/RIEGO', 'm³/ha', 'm³ FINCA', 'ACUM. m³/ha', 'NECESIDAD m³/ha', '% NEC.'],
        cols: { 0: { cellWidth: 26 }, 1: { cellWidth: 46 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
        pie: ['Total', '', String(p.tot.n), '', n0_(p.tot.m3ha), n0_(p.tot.m3finca), '', n0_(p.tot.nec), p.tot.nec ? `${n0_(p.tot.m3ha / p.tot.nec * 100)} %` : '']
      });
      K.t(K.lineas(`Sistema de riego: ${p.sistema}. ${p.agua}. Necesidad calculada con la ETo de la zona y el Kc del cultivo, sin lluvia efectiva.`, o.AW, 'n', 7.4), M, y + 6, { s: 7.4, c: C.gris });
      firmas(o, y + 12, d.autor);
    });
    pieReg(o, `${d.titulo} · ${d.intervalo}`);
    return doc.output('blob');
  }

  /* d = { campana, logo, autor, planes: [{ cab, suelo:[[l,v]], agua:[[l,v]], balance:[[concepto, valor]], necesidades:{filas:[[nut, teor, est, agua, fac, obj]]}, reparto:[{mes, obj[3], plan[3]}], productos:[[mes, producto, tipo, momento, dosis, n, p, k]], aplicacion, medidas, riego }] } */
  function planAnual(d) {
    const o = docReg(false), { doc, K } = o;
    const sec = (t, y) => { if (y > o.PH - 40) { doc.addPage(); y = 20; } K.titulo(t, M, y + 4); return y + 6.5; };
    d.planes.forEach((p, k) => {
      if (k) doc.addPage();
      let y = cabReg(o, 'Plan de abonado · RD 1051/2022', `Campaña ${d.campana}`, d.logo);
      y = datosReg(o, p.cab, y, 4);
      y = sec('1 · Analíticas', y);
      y = datosReg(o, [...p.suelo, ...p.agua], y, 4);
      y = sec('2 · Balance de nitrógeno (estimado)', y);
      y = tablaReg(o, { y, head: ['CONCEPTO', 'kg N/ha'], body: p.balance, cols: { 1: { halign: 'right', cellWidth: 30 } } }) + 4;
      y = sec('3 · Necesidades anuales (kg UF/ha)', y);
      y = tablaReg(o, { y, head: ['NUTRIENTE', 'NECESIDAD', '− ESTIÉRCOL', '− AGUA DE RIEGO', '× FACTOR', 'OBJETIVO'], body: p.necesidades, cols: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } }) + 4;
      y = sec('4 · Reparto mensual: objetivo y plan (kg UF/ha)', y);
      y = tablaReg(o, { y, head: ['MES', 'N OBJ.', 'N PLAN', 'P₂O₅ OBJ.', 'P₂O₅ PLAN', 'K₂O OBJ.', 'K₂O PLAN'], body: p.reparto.map((r) => [r.mes, n1(r.obj[0]), n1(r.plan[0]), n1(r.obj[1]), n1(r.plan[1]), n1(r.obj[2]), n1(r.plan[2])]), cols: Object.fromEntries([1, 2, 3, 4, 5, 6].map((c) => [c, { halign: 'right' }])), fs: 7.8 }) + 4;
      y = sec('5 · Fertilizantes previstos', y);
      y = tablaReg(o, { y, head: ['MES', 'PRODUCTO', 'TIPO', 'MOMENTO', 'DOSIS MES', 'N', 'P₂O₅', 'K₂O'], body: p.productos.length ? p.productos : [['', 'Sin productos', '', '', '', '', '', '']], cols: { 0: { cellWidth: 20 }, 1: { cellWidth: 50 }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } }, fs: 7.6 }) + 4;
      y = sec('6 · Forma de aplicación, maquinaria y medidas', y);
      const txt = [`Aplicación: ${p.aplicacion}`, `Riego: ${p.riego}`, `Medidas para reducir emisiones de amoniaco y gases de efecto invernadero: ${p.medidas}`];
      for (const t of txt) { const ls = K.lineas(t, o.AW, 'n', 8.4); if (y + ls.length * 4.2 > o.PH - 20) { doc.addPage(); y = 20; } K.t(ls, M, y + 3, { s: 8.4 }); y += ls.length * 4.2 + 2.5; }
      firmas(o, y + 2, d.autor);
    });
    pieReg(o, `Plan de abonado · campaña ${d.campana}`);
    return doc.output('blob');
  }

  /* d = { intervalo, logo, meses:[etiq], porProducto:[{nombre, u, total, porMes[]}], porCliente:[{cliente, planes, productos:[{nombre, u, total, porMes[]}]}] } */
  function pedidos(d) {
    const o = docReg(true), { doc, K } = o;
    const conMeses = d.meses.length > 1 && d.meses.length <= 6;
    let y = cabReg(o, 'Productos para pedidos', d.intervalo, d.logo);
    const fila = (p) => [p.nombre, ...(conMeses ? p.porMes.map((v) => (v ? n1(v) : '–')) : []), `${n1(p.total)} ${p.u}`];
    const cols = { 0: { cellWidth: 70 }, ...Object.fromEntries((conMeses ? d.meses : []).map((_, k) => [k + 1, { halign: 'right' }])), [(conMeses ? d.meses.length : 0) + 1]: { halign: 'right', fontStyle: 'bold' } };
    const head = ['PRODUCTO', ...(conMeses ? d.meses.map((m) => m.toUpperCase()) : []), 'TOTAL'];
    K.titulo('Total de todos los clientes', M, y + 2); y += 4;
    y = tablaReg(o, { y, head, body: d.porProducto.map(fila), cols }) + 8;
    for (const c of d.porCliente) {
      if (y > o.PH - 40) { doc.addPage(); y = 20; }
      K.titulo(`${c.cliente} · ${c.planes}`, M, y + 2); y += 4;
      y = tablaReg(o, { y, head, body: c.productos.map(fila), cols }) + 7;
    }
    pieReg(o, `Productos para pedidos · ${d.intervalo}`);
    return doc.output('blob');
  }


  /* Plan de abonado RD 1051/2022 por unidad de producción (estructura del modelo oficial).
     d = { campana, cliente, logo, general:[[l,v]], cultivos, supT, hojas:[…], regimen, rotacion, precipitacion, lluvia, metodo, aplicacion,
           totUP[3], estKg, estMS, moKg, objetivoMO, medidas, prohibiciones, almacenamiento, proteccion, asesoramiento, cuaderno, autor, recintos:[…] } */
  function planRD(d) {
    const o = docReg(false), { doc, K } = o, FIN = o.PH - 18;
    const nuevaPag = () => { doc.addPage(); return 20; };
    const sec = (t, y) => { if (y > o.PH - 45) y = nuevaPag(); K.titulo(t, M, y + 4); return y + 7; };
    const sub = (t, y) => { if (y > o.PH - 35) y = nuevaPag(); K.t(t, M, y + 3, { f: 's', s: 8.4, c: C.verde }); return y + 5.5; };
    const para = (etq, txt, y) => {
      const ls = K.lineas(txt == null || txt === '' ? '–' : String(txt), o.AW, 'n', 8.4);
      const alto = (etq ? 4.4 : 0) + ls.length * 4.1;
      if (y + Math.min(alto, 14) > FIN) y = nuevaPag();
      if (etq) { K.t(etq, M, y + 3, { f: 's', s: 8.2 }); y += 4.4; }
      for (const l of ls) { if (y + 4.1 > FIN) y = nuevaPag(); K.t(l, M, y + 3, { s: 8.4 }); y += 4.1; }
      return y + 2.2;
    };
    const R = { halign: 'right' }, cols = (ks, extra = {}) => ({ ...Object.fromEntries(ks.map((k) => [k, R])), ...extra });
    const kg = (v) => `${n0_(v)} kg`;
    let y = cabReg(o, 'Planificación nutricional · RD 1051/2022', `Plan de abonado · Campaña ${d.campana}`, d.logo);
    K.t(K.lineas('Elaborado conforme al Real Decreto 1051/2022, de 27 de diciembre, por el que se establecen normas para la nutrición sostenible en los suelos agrarios.', o.AW, 'n', 7.6), M, y + 1, { s: 7.6, c: C.gris }); y += 9;

    y = sec('1 · Datos generales de la explotación y del titular', y);
    y = datosReg(o, d.general, y, 2);

    y = sec('2 · Identificación de recintos y características del cultivo', y);
    y = para('Cultivos', d.cultivos, y);
    y = para('Régimen hídrico', d.regimen, y);
    y = para('Unidad de producción y hojas de cultivo', `Superficie total: ${num(d.supT, 2)} ha en ${d.hojas.length} ${d.hojas.length === 1 ? 'hoja' : 'hojas'} de cultivo. Relación completa de recintos SIGPAC en el Anexo I.`, y);
    y = tablaReg(o, { y, head: ['HOJA', 'CULTIVO', 'FINCA', 'SUP. (ha)', 'ÁRBOLES', 'PLANTACIÓN', 'ZONA VULN.', 'RENDIMIENTO ESPERADO'],
      body: d.hojas.map((h) => [h.corto, h.cultivo || '–', h.finca || '–', num(h.sup, 2), h.arboles ? n0_(h.arboles) : '–', h.anio || '–', h.vulnerable ? 'Sí' : 'No', h.prod ? `${num(h.prod, 1)} t/ha (${n0_(h.prod * 1000)} kg/ha)` : '–']),
      cols: cols([3, 4], { 0: { cellWidth: 16 }, 7: { halign: 'right', cellWidth: 38 } }), fs: 7.8, pie: ['Total', '', '', num(d.supT, 2), '', '', '', ''] }) + 3;
    y = para('Cultivo precedente / rotación', d.rotacion, y);

    y = sec('3 · Características del suelo y disponibilidad hídrica', y);
    y = para('Precipitación media anual', `${d.precipitacion || 'Pendiente de completar'}. ${d.lluvia}`, y);
    y = para('Datos del suelo (art. 6.2)', 'Un recinto representativo por hoja de cultivo.', y);
    y = tablaReg(o, { y, head: ['HOJA', 'ORIGEN DEL DATO', 'MO %', 'pH', 'CE', 'N TOTAL %', 'NO₃ mg/kg', 'P₂O₅ mg/kg', 'K₂O mg/kg', 'CARBON. %', 'TEXTURA'],
      body: d.hojas.map((h) => { const s = h.suelo; return [h.corto, s.origen, num(s.mo, 2), num(s.ph, 1), num(s.ce, 2), num(s.ntotal, 3), n0_(s.no3), n0_(s.p2o5), n0_(s.k2o), n0_(s.caliza), s.textura || '–']; }),
      cols: cols([2, 3, 4, 5, 6, 7, 8, 9], { 0: { cellWidth: 14 }, 1: { cellWidth: 40 } }), fs: 7.4 }) + 2;
    const notas = ['P₂O₅ y K₂O asimilables calculados a partir del P Olsen y del K de cambio (× 2,29 y × 1,20).'];
    if (d.hojas.some((h) => h.suelo.carto)) notas.push('Las hojas con «Cartografía de suelos» toman los datos de la Cartografía de Suelos de la Región de Murcia (Proyecto LUCDEME), consultada en el Geoportal del IMIDA (geoportal.imida.es), mientras no haya analítica propia.');
    for (const n of notas) { const ls = K.lineas(n, o.AW, 'n', 7.2); K.t(ls, M, y + 2.5, { s: 7.2, c: C.gris }); y += ls.length * 3.6 + 1; }
    y += 2;
    y = para('Disponibilidad de agua de riego y nutrientes del agua', 'Volumen previsto en la campaña y nutrientes que aporta el agua de riego (kg/ha), descontados del abonado.', y);
    y = tablaReg(o, { y, head: ['HOJA', 'AGUA DE RIEGO', 'RIEGOS', 'm³/ha', 'N', 'K₂O', 'CaO', 'MgO'],
      body: d.hojas.map((h) => [h.corto, h.agua.nombre, n0_(h.agua.riegos), n0_(h.agua.m3), n1(h.agua.aporte[0]), n1(h.agua.aporte[2]), n1(h.agua.aporte[3]), n1(h.agua.aporte[4])]),
      cols: cols([2, 3, 4, 5, 6, 7], { 0: { cellWidth: 14 }, 1: { cellWidth: 60 } }), fs: 7.8 }) + 4;

    y = sec('4 · Cálculo de necesidades y planificación de aportes', y);
    y = para('Método', d.metodo, y);
    y = sub('Balance de nitrógeno (kg N/ha)', y);
    y = tablaReg(o, { y, head: ['HOJA', 'EXTRACCIÓN', '− N SUELO', '− MAT. ORGÁNICA', '− ESTIÉRCOL', '− AGUA', 'N A APORTAR'],
      body: d.hojas.map((h) => { const b = h.balance; return [h.corto, n1(b.S1), n1(b.E1), n1(b.E2), n1(b.E3), n1(b.E4), n1(b.aporte)]; }), cols: cols([1, 2, 3, 4, 5, 6], { 0: { cellWidth: 16 } }), fs: 7.8 }) + 3;
    y = sub('Dosis recomendadas de nutrientes (kg/ha)', y);
    y = tablaReg(o, { y, head: ['HOJA DE CULTIVO', 'N', 'P₂O₅', 'K₂O'], body: d.hojas.map((h) => [h.nombre, n1(h.rec[0]), n1(h.rec[1]), n1(h.rec[2])]), cols: cols([1, 2, 3], { 1: { halign: 'right', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 24 }, 3: { halign: 'right', cellWidth: 24 } }), fs: 7.8 }) + 3;
    for (const h of d.hojas) {
      y = sub(`Dosis programadas · ${h.nombre}`, y);
      y = tablaReg(o, { y, head: ['PRODUCTO', 'TIPO', 'N-P₂O₅-K₂O', 'DOSIS', 'TOTAL HOJA', 'CUÁNDO', 'N', 'P₂O₅', 'K₂O'],
        body: h.productos.length ? h.productos.map((x) => [x.nombre, x.tipo, x.riq, `${n1(x.dosis)} ${x.u}/ha`, `${n0_(x.total)} ${x.u}`, x.cuando, n1(x.uf[0]), n1(x.uf[1]), n1(x.uf[2])]) : [['Sin fertilizantes programados', '', '', '', '', '', '', '', '']],
        cols: cols([3, 4, 6, 7, 8], { 0: { cellWidth: 42 }, 2: { halign: 'center' }, 5: { cellWidth: 28 } }), fs: 7.2,
        pie: ['Aporte programado (kg/ha)', '', '', '', '', '', n1(h.anual[0]), n1(h.anual[1]), n1(h.anual[2])] }) + 3;
    }
    y = para('Calendario, forma de aplicación y maquinaria (art. 6.4)', `${d.aplicacion} Calendario: el que figura en la columna «Cuándo», fraccionado en los riegos de cada mes según el plan mensual.`, y);
    y = sub('Verificación de límites legales (Anexo III, parte I)', y);
    const vb = [];
    for (const h of d.hojas) for (const v of h.verif) vb.push([h.corto, v.nu, n1(v.rec), v.lim == null ? '–' : `≤ ${n1(v.lim)} (${v.txtLim})`, n1(v.aport), v.ok == null ? 'SIN CÁLCULO' : v.ok ? 'CUMPLE' : 'NO CUMPLE']);
    y = tablaReg(o, { y, head: ['HOJA', 'NUTRIENTE', 'NECESIDAD', 'LÍMITE LEGAL (kg/ha)', 'APORTADO', 'RESULTADO'], body: vb, cols: cols([2, 4], { 0: { cellWidth: 16 }, 3: { halign: 'right' }, 5: { halign: 'center', cellWidth: 26 } }), fs: 7.8 }) + 3;
    const moTxt = [d.estKg > 0 ? `estiércoles y enmiendas ${kg(d.estKg)}${d.estMS > 0 ? ` (${kg(d.estMS)} de materia seca)` : ''}` : '', d.moKg > 0 ? `fertilizantes orgánicos sólidos ${kg(d.moKg)}` : ''].filter(Boolean).join('; ');
    y = para('Aportes totales a la unidad de producción', `Fertilizantes: N ${kg(d.totUP[0])}; P₂O₅ ${kg(d.totUP[1])}; K₂O ${kg(d.totUP[2])}. Materia orgánica aportada: ${moTxt || '0 kg'}.`, y);
    y = para('Objetivo de materia orgánica (art. 4)', d.objetivoMO, y);

    y = sec('5 · Prácticas de gestión del suelo y reducción de emisiones', y);
    y = para('Medidas para disminuir las emisiones de amoniaco y gases de efecto invernadero (art. 6.5 y Anexo V)', d.medidas, y);
    y = para('Prohibiciones y precauciones en la aplicación (art. 4 y Anexo II)', d.prohibiciones, y);
    y = para('Almacenamiento (art. 4.7)', d.almacenamiento, y);
    y = para('Protección de aguas y suelos', d.proteccion, y);

    y = sec('6 · Asesoramiento técnico y firmas', y);
    y = para('Asesoramiento técnico en fertilización', d.asesoramiento, y);
    y = para('Cuaderno de explotación (art. 4.1 y 5; Anexo I)', d.cuaderno, y);
    firmas(o, y + 2, d.autor);

    doc.addPage(); y = 20;
    K.titulo('Anexo I · Relación de recintos SIGPAC', M, y); y += 4;
    const totSup = d.recintos.reduce((t, r) => t + (+r.sup || 0), 0);
    tablaReg(o, { y, head: ['ID', 'PROV.', 'MUNICIPIO', 'AGR.', 'ZONA', 'POL.', 'PARC.', 'REC.', 'USO', 'CULTIVO', 'SUP. (ha)', 'HOJA'],
      body: d.recintos.length ? d.recintos.map((r, k) => [k + 1, r.prov, [r.mun, r.municipio].filter(Boolean).join(' '), r.agr, r.zona, r.pol, r.par, r.rec, r.uso, r.cultivo, num(r.sup, 4), r.hoja]) : [['', '', 'Sin recintos SIGPAC en los planes', '', '', '', '', '', '', '', '', '']],
      cols: cols([10], { 0: { cellWidth: 9 } }), fs: 7.4, pie: ['', '', 'TOTAL', '', '', '', '', '', '', '', num(totSup, 4), ''] });
    pieReg(o, `Planificación nutricional · campaña ${d.campana} · ${d.cliente}`);
    return doc.output('blob');
  }

  root.PDF = { balance, informe, registroFert, registroRiego, planAnual, pedidos, planRD };
})(typeof window !== 'undefined' ? window : globalThis);
