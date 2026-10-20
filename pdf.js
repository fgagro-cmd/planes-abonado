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

  root.PDF = { balance };
})(typeof window !== 'undefined' ? window : globalThis);
