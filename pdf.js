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
    const refAn = (a) => (a ? `${a.ref || 's/ref'} (${fecha(a.fecha)})${a.plantilla ? ' · DE PLANTILLA' : ''}` : 'Sin analítica');
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


  /* ================= INFORME MENSUAL (fase 4) =================
     d = { plan, anio, mes (0-11), logo, cliente, cultivo, riego:{n,h}, cal:{dias,total,primerDia}, arboles, superficie, vulnerable,
           lineas:[{nombre, porPie, uPie, porRiego, uRiego, riegos, periodo, tanque}], totales:[{nombre, total, u}],
           ufMes:[N,P2O5,K2O,CaO,MgO] kg UF/ha, aguaMes, aguaAnio (m3 finca), obs, acido:{nitrico,fosforico}|null, recintos,
           textos:{fito, general}, vistazo:{ uf12:[[5]x12], agua12:[m3/ha x12], nAcum:[3], nTotal:[3],
             origenN:{suelo, agua, estiercol, abono, extraccion}, nPlan, analSuelo, analAgua, eto:true }, pie:{texto, telefono, email} } */
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const OSCURO = [33, 87, 50], CLARO = [226, 239, 218], TINTA = [24, 36, 29], LINEA = [170, 190, 175];
  const AZUL = [91, 155, 213], AZUL_CL = [189, 215, 238], ROJO = [200, 30, 30];
  const COL = [[42, 120, 214], [235, 104, 52], [27, 175, 122], [237, 161, 0], [232, 123, 164]];
  const tinte = (c, k) => c.map((v) => Math.round(v + (255 - v) * k));
  const hm = (h) => { h = +h || 0; if (!h) return '0:00'; let H = Math.floor(h), M = Math.round((h - H) * 60); if (M === 60) { H++; M = 0; } return `${H}:${String(M).padStart(2, '0')}`; };
  const mesAnio = (iso) => { if (!iso) return 'sin fecha'; const [y, m] = String(iso).slice(0, 7).split('-'); return m ? `${m}/${y}` : y; };

  function logoEn(doc, logo, x, y, h, maxW, centro = false) {
    if (!logo) return 0;
    try { const p = doc.getImageProperties(logo); const w = Math.min(maxW, h * p.width / p.height); doc.addImage(logo, centro ? x - w / 2 : x, y, w, h); return w; } catch (_) { return 0; }
  }
  function etiqueta(doc, t, x, y) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TINTA); doc.text(t, x, y); }
  function seccionLinea(doc, t, x, y, w) { etiqueta(doc, t, x, y); doc.setDrawColor(...OSCURO); doc.setLineWidth(0.6); doc.line(x - 2, y + 3, x + w, y + 3); }
  /* Sector de anillo (para la rosca del agua) */
  function sector(doc, cx, cy, r0, r1, a0, a1, color) {
    if (a1 - a0 < 0.002) return;
    const pts = [], n = Math.max(6, Math.ceil((a1 - a0) / 0.08));
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push([cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]); }
    for (let k = n; k >= 0; k--) { const a = a0 + (a1 - a0) * k / n; pts.push([cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)]); }
    const rel = []; for (let k = 1; k < pts.length; k++) rel.push([pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]]);
    doc.setFillColor(...color); doc.lines(rel, pts[0][0], pts[0][1], [1, 1], 'F', true);
  }
  function check(doc, x, y, s, color) { doc.setDrawColor(...color); doc.setLineWidth(0.7); doc.line(x, y, x + s * 0.35, y + s * 0.35); doc.line(x + s * 0.35, y + s * 0.35, x + s, y - s * 0.45); }
  function pagina(doc, n) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...TINTA); doc.text(`Página ${n}`, 105, 290, { align: 'center' }); }

  function informe(d) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14, D = W - M;
    const p = d.plan;
    doc.setLineHeightFactor(1.25);

    /* ---------- PÁGINA 1 ---------- */
    logoEn(doc, d.logo, M, 9, 20, 80);
    doc.setFillColor(...OSCURO); doc.rect(150, 13, 20, 7, 'F');
    doc.setDrawColor(...OSCURO); doc.setLineWidth(0.3); doc.rect(170, 13, D - 170, 7, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255); doc.text('AÑO', 160, 17.9, { align: 'center' });
    doc.setTextColor(...TINTA); doc.text(String(d.anio), (170 + D) / 2, 17.9, { align: 'center' });

    let y = 34;
    doc.setFillColor(...OSCURO); doc.rect(M, y, 128, 10, 'F');
    doc.setFillColor(...CLARO); doc.rect(M + 128, y, D - M - 128, 10, 'F');
    doc.setDrawColor(...OSCURO); doc.rect(M, y, D - M, 10, 'S');
    doc.setTextColor(255); doc.setFontSize(10.5); doc.text('RECOMENDACIÓN DE FERTIRRIGACIÓN', M + 64, y + 6.5, { align: 'center' });
    doc.setTextColor(...TINTA); doc.setFontSize(11); doc.text(MESES[d.mes], (M + 128 + D) / 2, y + 6.6, { align: 'center' });

    y = 52;
    etiqueta(doc, 'CLIENTE:', M + 2, y); etiqueta(doc, 'CULTIVO Y SECTOR:', 116, y);
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.3);
    doc.roundedRect(M, y + 3, 92, 9, 2, 2, 'S'); doc.roundedRect(114, y + 3, D - 114, 9, 2, 2, 'S');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(doc.splitTextToSize(d.cliente || '', 86)[0] || '', M + 46, y + 8.8, { align: 'center' });
    doc.text(doc.splitTextToSize(d.cultivo || '', D - 120)[0] || '', (114 + D) / 2, y + 8.8, { align: 'center' });

    // Necesidades de riego
    y = 75;
    etiqueta(doc, 'NECESIDADES DE RIEGO:', M + 2, y);
    doc.autoTable({
      startY: y + 3, margin: { left: M + 10 }, tableWidth: 62, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.1, halign: 'center', lineColor: [255, 255, 255], lineWidth: 0.4, textColor: TINTA },
      columnStyles: { 0: { fillColor: OSCURO, textColor: 255, fontStyle: 'bold', cellWidth: 36 }, 1: { fillColor: CLARO } },
      body: [['Días de riego:', String(d.riego.n || 0)], ['Tiempo de riego:', `${hm(d.riego.h)} h`]]
    });
    if (d.vulnerable) {
      const ty = y + 22;
      doc.setFillColor(255, 205, 40); doc.setDrawColor(120, 90, 0); doc.setLineWidth(0.3);
      doc.triangle(M + 4, ty + 4, M + 8, ty - 3, M + 12, ty + 4, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(60, 40, 0); doc.text('!', M + 8, ty + 3, { align: 'center' });
      doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(9); doc.setTextColor(...TINTA);
      doc.text('Zona Vulnerable por Nitratos', M + 16, ty + 2.5);
      doc.setLineWidth(0.25); doc.setDrawColor(...TINTA); doc.line(M + 16, ty + 3.3, M + 16 + doc.getTextWidth('Zona Vulnerable por Nitratos'), ty + 3.3);
    }
    // árboles y superficie
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TINTA);
    doc.text(f(d.arboles, 0), 104, y + 12, { align: 'right' });
    doc.text(`${f(d.superficie, 2)}`, 104, y + 22, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
    doc.text('árboles', 106, y + 12); doc.text('ha', 106, y + 22);

    // Calendario
    const cx0 = 128, cw = (D - cx0) / 7, ch = 5.6, cy0 = y - 4;
    doc.setFillColor(...OSCURO); doc.rect(cx0, cy0, D - cx0, ch, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255);
    'LMXJVSD'.split('').forEach((t, k) => doc.text(t, cx0 + cw * k + cw / 2, cy0 + 4, { align: 'center' }));
    const cal = d.cal, riegoSet = new Set(cal.dias);
    const ant = new Date(Number(d.anio), d.mes, 0).getDate();
    doc.setFont('helvetica', 'normal');
    for (let c = 0; c < 42; c++) {
      const fila = Math.floor(c / 7), col = c % 7, x = cx0 + cw * col, yy = cy0 + ch * (fila + 1);
      const dia = c - cal.primerDia + 1;
      if (fila === 5 && dia > cal.total && c % 7 === 0) break;
      const dentro = dia >= 1 && dia <= cal.total;
      const num = dentro ? dia : dia < 1 ? ant + dia : dia - cal.total;
      if (dentro && riegoSet.has(dia)) { doc.setFillColor(...AZUL_CL); doc.rect(x + 0.4, yy + 0.4, cw - 0.8, ch - 0.8, 'F'); }
      doc.setFontSize(8.5);
      doc.setTextColor(...(!dentro ? [185, 185, 185] : col >= 5 ? ROJO : TINTA));
      doc.text(String(num).padStart(2, '0'), x + cw / 2, yy + 4, { align: 'center' });
    }
    doc.setDrawColor(...OSCURO); doc.setLineWidth(0.3); doc.rect(cx0, cy0, D - cx0, ch * (Math.ceil((cal.primerDia + cal.total) / 7) + 1), 'S');

    // Fertirrigación
    y = Math.max(doc.lastAutoTable.finalY + 14, cy0 + ch * (Math.ceil((cal.primerDia + cal.total) / 7) + 1) + 9, 118);
    etiqueta(doc, 'FERTIRRIGACIÓN:', M + 2, y);
    const filas = d.lineas.map((l) => ['', l.nombre, `${f(l.porPie, 1)}`, `${f(l.porRiego, l.porRiego < 10 ? 2 : 1)}`, String(l.riegos ?? ''), l.periodo || '', l.tanque || '']);
    while (filas.length < 6) filas.push(['', '', '', '', '', '', '']);
    doc.autoTable({
      startY: y + 3, margin: { left: M, right: M }, theme: 'grid',
      head: [['', 'Producto', 'Dosis por planta\n(g o cc/planta)', 'Dosis por riego\n(kg o L)', 'Nº\nriegos', 'Periodo', 'Tanque']],
      body: filas,
      styles: { font: 'helvetica', fontSize: 8.8, cellPadding: 1.1, halign: 'center', valign: 'middle', lineColor: [255, 255, 255], lineWidth: 0.4, textColor: TINTA, fillColor: CLARO, minCellHeight: 5.2 },
      headStyles: { fillColor: OSCURO, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 7, fillColor: [255, 255, 255] }, 1: { cellWidth: 52, fontStyle: 'bold' }, 2: { cellWidth: 26 }, 3: { cellWidth: 26 }, 4: { cellWidth: 14 }, 5: { cellWidth: 35 } },
      didParseCell: (h) => { if (h.section === 'head' && h.column.index === 0) h.cell.styles.fillColor = [255, 255, 255]; },
      didDrawCell: (h) => { if (h.section === 'body' && h.column.index === 0) { doc.setDrawColor(...TINTA); doc.setLineWidth(0.3); doc.rect(h.cell.x + 1.6, h.cell.y + h.cell.height / 2 - 1.8, 3.6, 3.6, 'S'); } }
    });
    y = doc.lastAutoTable.finalY + 3;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...TINTA);
    doc.text(doc.splitTextToSize('Depósito 1 para fertilizantes sin calcio. Depósito 2 para fertilizantes sin sulfatos y fosfatos. Depósito E para aportes especiales. En caso de disponer de menos depósitos, vaciar y limpiar bien antes de una nueva mezcla.', D - M - 20), W / 2, y, { align: 'center' });

    // Abono total del mes + UF del mes + agua
    y += 12;
    if (y > 205) { pagina(doc, doc.getNumberOfPages()); doc.addPage(); y = 20; }
    etiqueta(doc, 'ABONO TOTAL/MES:', M + 2, y);
    const tot = d.totales.map((t) => [t.nombre, `${f(t.total, 1)} ${t.u}`]);
    while (tot.length < 5) tot.push(['', '']);
    doc.autoTable({
      startY: y + 3, margin: { left: M }, tableWidth: 84, theme: 'grid',
      head: [['', 'Total kg o L/mes']], body: tot,
      styles: { font: 'helvetica', fontSize: 8.8, cellPadding: 1.1, halign: 'center', lineColor: [255, 255, 255], lineWidth: 0.4, textColor: TINTA, fillColor: CLARO, minCellHeight: 5.2 },
      headStyles: { fillColor: OSCURO, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' } },
      didParseCell: (h) => { if (h.section === 'head' && h.column.index === 0) h.cell.styles.fillColor = [255, 255, 255]; }
    });
    const yTabla = doc.lastAutoTable.finalY;
    // UF del mes (barras)
    const bx = 106, by = y + 4, bw = 44;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...TINTA); doc.text('Unidades fertilizantes del mes', bx, by);
    const maxUf = Math.max(...d.ufMes, 1);
    ['N', 'P2O5', 'K2O', 'CaO', 'MgO'].forEach((nu, j) => {
      const yy = by + 4 + j * 5.6, v = +d.ufMes[j] || 0;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(...TINTA); doc.text(nu, bx, yy + 3);
      doc.setFillColor(238, 242, 239); doc.roundedRect(bx + 10, yy, bw, 3.8, 1, 1, 'F');
      if (v > 0) { doc.setFillColor(...COL[j]); doc.roundedRect(bx + 10, yy, Math.max(2, bw * v / maxUf), 3.8, 1, 1, 'F'); }
      doc.setTextColor(...GRIS); doc.text(v > 0 ? f(v, 1) : '–', bx + 12 + bw, yy + 3);
    });
    doc.setFontSize(6.8); doc.setTextColor(...GRIS); doc.text('kg UF/ha', bx + 10, by + 4 + 5 * 5.6 + 1.5);
    // Agua: rosca mes / año
    const rx = 180, ry = y + 17, r1 = 13, r0 = 9;
    const frac = d.aguaAnio ? Math.min(1, d.aguaMes / d.aguaAnio) : 0;
    sector(doc, rx, ry, r0, r1, -Math.PI / 2, 1.5 * Math.PI, AZUL_CL);
    sector(doc, rx, ry, r0, r1, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * frac, AZUL);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...TINTA);
    doc.text('Mes', rx, ry - 3.6, { align: 'center' }); doc.setFont('helvetica', 'normal'); doc.text(`${f(d.aguaMes, 0)} m3`, rx, ry - 0.6, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.text('Año', rx, ry + 2.8, { align: 'center' }); doc.setFont('helvetica', 'normal'); doc.text(`${f(d.aguaAnio, 0)} m3`, rx, ry + 5.8, { align: 'center' });
    doc.setFontSize(6.8); doc.setTextColor(...GRIS);
    doc.setFillColor(...AZUL); doc.rect(rx - 15, ry + 16, 2, 2, 'F'); doc.text('Agua del mes', rx - 12, ry + 17.7);
    doc.setFillColor(...AZUL_CL); doc.rect(rx - 15, ry + 20, 2, 2, 'F'); doc.text('Agua del año (finca)', rx - 12, ry + 21.7);

    // Observaciones
    y = Math.max(yTabla, ry + 23) + 9;
    const obs = [];
    if (d.obs) obs.push(d.obs);
    if (d.acido) obs.push(`Dosis de ácido nítrico/ácido fosfórico para limpieza de goteros: ${f(d.acido.nitrico, 1)} L de nítrico o ${f(d.acido.fosforico, 1)} L de fosfórico. Inyectar durante 1 hora. Después abrir las mangueras. Se recomienda una vez al mes.`);
    if (d.recintos) obs.push(`Esta unidad de producción incluye los siguientes recintos: ${d.recintos}`);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6);
    const lineasObs = obs.flatMap((t, k) => [...doc.splitTextToSize(t, D - M - 12), ...(k < obs.length - 1 ? [''] : [])]);
    const hObs = Math.max(16, lineasObs.length * 4 + 8);
    if (y + hObs + 8 > 282) { pagina(doc, doc.getNumberOfPages()); doc.addPage(); y = 20; }
    seccionLinea(doc, 'OBSERVACIONES:', M + 2, y, 130);
    doc.setFillColor(...CLARO); doc.rect(M, y + 6, D - M, hObs, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(...TINTA);
    doc.text(lineasObs, W / 2, y + 12, { align: 'center' });
    pagina(doc, doc.getNumberOfPages());

    /* ---------- PÁGINA 2 ---------- */
    doc.addPage();
    logoEn(doc, d.logo, W / 2, 8, 18, 80, true);
    y = 34;
    const bloqueTexto = (titulo, texto) => {
      if (!texto || !String(texto).trim()) return;
      seccionLinea(doc, titulo, M + 2, y, 130);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.2);
      const ls = doc.splitTextToSize(String(texto).trim(), D - M - 12);
      const h = Math.max(18, ls.length * 4.4 + 8);
      doc.setFillColor(...CLARO); doc.rect(M, y + 6, D - M, h, 'F');
      doc.setTextColor(...TINTA); doc.text(ls, M + 6, y + 12.5);
      y += h + 15;
    };
    bloqueTexto('INFORMACIÓN FITOSANITARIA:', d.textos.fito);
    bloqueTexto('SITUACIÓN ACTUAL Y NOVEDADES:', d.textos.general);
    vistazo(doc, d, M, Math.min(y, 196), D);

    // Pie del programa
    const pie = d.pie || {};
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...TINTA);
    if (pie.texto) doc.text(doc.splitTextToSize(pie.texto, D - M - 10), W / 2, 266, { align: 'center' });
    doc.setFontSize(9);
    const tel = pie.telefono ? `Telf: ${pie.telefono}` : '', mail = pie.email ? `E-Mail: ${pie.email}` : '';
    if (tel) doc.text(tel, 60, 281, { align: 'center' });
    if (mail) doc.text(mail, 150, 281, { align: 'center' });
    pagina(doc, doc.getNumberOfPages());
    return doc.output('blob');
  }

  /* Bloque visual de la página 2: el plan de un vistazo (pocos números) */
  function vistazo(doc, d, M, y0, D) {
    const v = d.vistazo; if (!v) return;
    const W = D - M;
    seccionLinea(doc, 'TU PLAN DE UN VISTAZO:', M + 2, y0, 130);
    let y = y0 + 9;
    // 1) Campaña mes a mes: abono arriba (N, P, K apilados) y agua abajo
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...TINTA);
    doc.text('Tu campaña mes a mes', M, y + 2);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRIS);
    const ley = [['N', COL[0]], ['P2O5', COL[1]], ['K2O', COL[2]], ['Agua', AZUL]];
    let lx = D - 70; for (const [t, c] of ley) { doc.setFillColor(...c); doc.rect(lx, y - 0.2, 2.4, 2.4, 'F'); doc.text(t, lx + 3.4, y + 1.9); lx += 17; }
    const gx = M + 4, gw = W - 8, colW = gw / 12, base = y + 30, hUp = 24, hDn = 13;
    const tot = v.uf12.map((m) => (+m[0] || 0) + (+m[1] || 0) + (+m[2] || 0));
    const maxUp = Math.max(...tot, 0.001), maxDn = Math.max(...v.agua12, 0.001);
    for (let i = 0; i < 12; i++) {
      const actual = i === d.mes, k = actual ? 0 : 0.55, x = gx + colW * i + colW * 0.2, bw = colW * 0.6;
      if (actual) { doc.setFillColor(243, 248, 240); doc.roundedRect(gx + colW * i + 0.6, base - hUp - 3, colW - 1.2, hUp + hDn + 10, 2, 2, 'F'); }
      let yy = base;
      for (let j = 0; j < 3; j++) {
        const h = hUp * (+v.uf12[i][j] || 0) / maxUp; if (h <= 0.05) continue;
        doc.setFillColor(...tinte(COL[j], k)); doc.rect(x, yy - h, bw, h, 'F'); yy -= h;
      }
      const ha = hDn * (+v.agua12[i] || 0) / maxDn;
      if (ha > 0.05) { doc.setFillColor(...tinte(AZUL, actual ? 0 : 0.5)); doc.rect(x, base + 1, bw, ha, 'F'); }
      doc.setFont('helvetica', actual ? 'bold' : 'normal'); doc.setFontSize(7.5); doc.setTextColor(...(actual ? OSCURO : GRIS));
      doc.text(MESES[i].slice(0, 3), gx + colW * i + colW / 2, base + hDn + 5, { align: 'center' });
    }
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.3); doc.line(gx, base + 0.5, gx + gw, base + 0.5);
    y = base + hDn + 12;

    // 2) Cuánto llevamos de campaña  ·  3) De dónde sale el N
    const cW = (W - 8) / 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...TINTA);
    doc.text(`Campaña aplicada hasta ${MESES[d.mes].toLowerCase()}`, M, y);
    ['Nitrógeno', 'Fósforo', 'Potasio'].forEach((t, j) => {
      const yy = y + 4 + j * 7, frac = v.nTotal[j] ? Math.min(1, v.nAcum[j] / v.nTotal[j]) : 0;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(...TINTA); doc.text(t, M, yy + 3.2);
      doc.setFillColor(238, 242, 239); doc.roundedRect(M + 18, yy, cW - 30, 4.4, 2.2, 2.2, 'F');
      if (frac > 0) { doc.setFillColor(...COL[j]); doc.roundedRect(M + 18, yy, Math.max(4.4, (cW - 30) * frac), 4.4, 2.2, 2.2, 'F'); }
      doc.setTextColor(...GRIS); doc.text(v.nTotal[j] ? `${Math.round(frac * 100)} %` : '–', M + cW - 10, yy + 3.2);
    });
    const ox = M + cW + 8, ow = cW;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...TINTA);
    doc.text('De dónde sale el nitrógeno que necesita', ox, y);
    const o = v.origenN || {};
    const partes = [['Suelo', o.suelo, [140, 106, 70]], ['Agua', o.agua, AZUL], ['Estiércol', o.estiercol, [170, 140, 60]], ['Abono', o.abono, COL[0]]].filter((x) => (+x[1] || 0) > 0.05);
    const total = partes.reduce((t, x) => t + x[1], 0);
    if (total > 0) {
      let xx = ox; const by = y + 4, bh = 7;
      partes.forEach(([t, val, c], k) => {
        const w = ow * val / total;
        doc.setFillColor(...c);
        if (k === 0 || k === partes.length - 1) doc.roundedRect(xx, by, w, bh, 1.5, 1.5, 'F');
        doc.rect(xx + (k === 0 ? 2 : 0), by, w - (k === 0 ? 2 : 0) - (k === partes.length - 1 ? 2 : 0), bh, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255);
        if (w > 9) doc.text(`${Math.round(val / total * 100)} %`, xx + w / 2, by + 4.7, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setTextColor(...TINTA);
        xx += w;
      });
      // leyenda con todas las partes (las pequeñas no caben dentro de la barra)
      let lx2 = ox; doc.setFontSize(7);
      partes.forEach(([t, , c]) => { doc.setFillColor(...c); doc.rect(lx2, y + 17.2, 2.4, 2.4, 'F'); doc.setTextColor(...TINTA); doc.text(t, lx2 + 3.4, y + 19.2); lx2 += doc.getTextWidth(t) + 9; });
      doc.setTextColor(...GRIS);
      doc.text(doc.splitTextToSize('El abono solo pone lo que no aportan ya el suelo, el agua y la materia orgánica.', ow), ox, y + 24);
    }
    y += 33;

    // 4) Comprobado: chips con una marca
    const chips = [];
    chips.push(['Riego ajustado al clima de la zona', true]);
    if (v.analSuelo) chips.push([`Analítica de suelo ${mesAnio(v.analSuelo)}`, true]);
    if (v.analAgua) chips.push([`Analítica de agua ${mesAnio(v.analAgua)}`, true]);
    if (d.vulnerable && v.dentroLimite) chips.push(['Zona vulnerable: dentro del límite de nitrógeno', true]);
    let cx = M; doc.setFontSize(7.6);
    for (const [t, ok] of chips) {
      doc.setFont('helvetica', 'normal');
      const w = doc.getTextWidth(t) + 11;
      if (cx + w > D) { cx = M; y += 8; }
      doc.setFillColor(...(ok ? CLARO : [253, 236, 200])); doc.roundedRect(cx, y, w, 6, 3, 3, 'F');
      if (ok) check(doc, cx + 2.4, y + 3, 2.6, OSCURO); else { doc.setFont('helvetica', 'bold'); doc.setTextColor(150, 90, 0); doc.text('!', cx + 3.4, y + 4.2); }
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...TINTA); doc.text(t, cx + 7.5, y + 4.2);
      cx += w + 3;
    }
  }

  root.PDF = { balance, informe };
})(typeof window !== 'undefined' ? window : globalThis);
