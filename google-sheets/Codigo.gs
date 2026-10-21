/* Planes de abonado · FG Agro — script de la hoja «Planes de abonado» (Drive › Apps › Planes de abonado).
   Guarda los datos de la app en datos.json, en la misma carpeta que esta hoja, con una copia por día en «Copias».
   Cada guardado sube un número de versión: si otro equipo guardó antes, avisa en vez de pisar sus cambios.
   También guarda los PDF hechos en la tablet hasta que el ordenador los pasa a OneDrive,
   y le dice a Asesor qué informes mensuales se han generado (acción «enviados»).

   Puesta en marcha:
   1. Extensiones → Apps Script → borra lo que haya y pega este código.
   2. Cambia CAMBIA-ESTA-CLAVE por una clave tuya y guarda (icono del disquete).
   3. Arriba elige la función «autorizar» → Ejecutar → acepta los permisos.
   4. Implementar → Nueva implementación → tipo «Aplicación web» → Ejecutar como: Yo → Quién tiene acceso: Cualquier usuario → Implementar.
   5. Copia la dirección que termina en /exec y pégala en la app con la clave. */

const CLAVE = 'CAMBIA-ESTA-CLAVE';
const DATOS = 'datos.json';
const COPIAS = 'Copias';
const PDFS = 'PDF pendientes de OneDrive';
const TEXTOS = 'textos-pendientes.json';

function autorizar() {
  carpeta(); SpreadsheetApp.getActive().getName();
  Logger.log('Permisos correctos. Carpeta: ' + carpeta().getName());
}

function doGet() { return salida({ ok: true, app: 'Planes de abonado' }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return salida({ ok: false, error: 'json' }); }
  if (!req || req.clave !== CLAVE) return salida({ ok: false, error: 'clave' });
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return salida({ ok: false, error: 'ocupado' }); }
  try {
    switch (req.accion) {
      case 'ping': return salida({ ok: true, version: version(), carpeta: carpeta().getName() });
      case 'version': return salida({ ok: true, version: version(), guardado: props().getProperty('guardado') || null });
      case 'leer': return salida(leer());
      case 'guardar': return salida(guardar(req));
      case 'subirPdf': return salida(subirPdf(req));
      case 'pdfs': return salida(listarPdfs());
      case 'leerPdf': return salida(leerPdf(req));
      case 'borrarPdf': return salida(borrarPdf(req));
      case 'enviados': return salida(enviados(req));
      case 'textosPendientes': return salida(textosPendientes());
      case 'textosAplicados': return salida(textosAplicados(req));
      default: return salida({ ok: false, error: 'acción desconocida' });
    }
  } catch (err) {
    return salida({ ok: false, error: String(err && err.message || err) });
  } finally { lock.releaseLock(); }
}

function salida(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function props() { return PropertiesService.getScriptProperties(); }
function version() { return Number(props().getProperty('version') || 0); }
function carpeta() {
  const it = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents();
  return it.hasNext() ? it.next() : DriveApp.getRootFolder();
}
function sub(nombre) { const c = carpeta(); const it = c.getFoldersByName(nombre); return it.hasNext() ? it.next() : c.createFolder(nombre); }
function archivo(nombre) { const it = carpeta().getFilesByName(nombre); return it.hasNext() ? it.next() : null; }
function hoy() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

function leer() {
  const f = archivo(DATOS);
  return { ok: true, version: version(), guardado: props().getProperty('guardado') || null, datos: f ? f.getBlob().getDataAsString('UTF-8') : null };
}

/* req.datos: texto JSON con todos los datos · req.base: versión sobre la que se hicieron los cambios */
function guardar(req) {
  const v = version();
  if (!req.forzar && Number(req.base) !== v) return { ok: false, error: 'conflicto', version: v, guardado: props().getProperty('guardado') || null };
  if (typeof req.datos !== 'string' || req.datos.length < 10) return { ok: false, error: 'sin datos' };
  JSON.parse(req.datos); // comprobar que es JSON válido antes de escribir
  let f = archivo(DATOS);
  // Copia del día: la primera vez que se guarda cada día se copia lo que había
  if (f) {
    const copias = sub(COPIAS), nombre = 'datos-' + hoy() + '.json';
    if (!copias.getFilesByName(nombre).hasNext()) copias.createFile(nombre, f.getBlob().getDataAsString('UTF-8'), 'application/json');
  }
  if (f) f.setContent(req.datos); else f = carpeta().createFile(DATOS, req.datos, 'application/json');
  const nv = v + 1;
  const guardado = JSON.stringify({ fecha: new Date().toISOString(), equipo: req.equipo || '', version: nv });
  props().setProperties({ version: String(nv), guardado: guardado });
  registro([new Date(), req.equipo || '', nv, Math.round(req.datos.length / 1024) + ' KB', req.forzar ? 'forzado' : '']);
  return { ok: true, version: nv, guardado: guardado };
}

function registro(fila) {
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName('Registro') || ss.insertSheet('Registro');
    if (sh.getLastRow() === 0) sh.appendRow(['Fecha', 'Equipo', 'Versión', 'Tamaño', 'Nota']);
    sh.appendRow(fila);
    if (sh.getLastRow() > 1000) sh.deleteRows(2, sh.getLastRow() - 1000);
  } catch (err) { /* el registro no debe impedir guardar */ }
}

/* ---------- PDF hechos en la tablet, pendientes de pasar a OneDrive ---------- */
function subirPdf(req) {
  const blob = Utilities.newBlob(Utilities.base64Decode(req.base64), 'application/pdf', req.nombre);
  const f = sub(PDFS).createFile(blob);
  f.setDescription(JSON.stringify(req.meta || {}));
  return { ok: true, id: f.getId() };
}
function listarPdfs() {
  const out = [], it = sub(PDFS).getFiles();
  while (it.hasNext()) {
    const f = it.next();
    let meta = {}; try { meta = JSON.parse(f.getDescription() || '{}'); } catch (err) { meta = {}; }
    out.push({ id: f.getId(), nombre: f.getName(), meta: meta, fecha: f.getDateCreated().toISOString() });
  }
  return { ok: true, pdfs: out };
}
function leerPdf(req) { const f = DriveApp.getFileById(req.id); return { ok: true, nombre: f.getName(), base64: Utilities.base64Encode(f.getBlob().getBytes()) }; }
function borrarPdf(req) { DriveApp.getFileById(req.id).setTrashed(true); return { ok: true }; }

/* ---------- Informes generados (para que Asesor marque «enviado») ----------
   req.anio (opcional): solo esa campaña. Devuelve una fila por plan y mes con informe generado. */
function enviados(req) {
  const f = archivo(DATOS);
  if (!f) return { ok: true, enviados: [] };
  const d = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
  const out = [];
  (d.planes || []).forEach(function (p) {
    Object.keys(p.campanas || {}).forEach(function (anio) {
      if (req.anio && String(req.anio) !== String(anio)) return;
      const inf = p.campanas[anio].informes || {};
      Object.keys(inf).forEach(function (mes) {
        if (inf[mes] && inf[mes].fecha) out.push({ anio: Number(anio), mes: Number(mes), mxCli: p.mxCli || null, cliente: p.cliente || '', plan: p.nombre || '', fecha: inf[mes].fecha });
      });
    });
  });
  return { ok: true, enviados: out, planes: (d.planes || []).map(function (p) { return { mxCli: p.mxCli || null, cliente: p.cliente || '', plan: p.nombre || '', campanas: Object.keys(p.campanas || {}) }; }) };
}

/* ---------- Textos del informe preparados con Claude ----------
   Claude deja «textos-pendientes.json» en esta carpeta (tras confirmarlo Francis). La app lo lee al abrirse,
   lo carga en Textos y lo pasa a «Copias» con otro nombre para no cargarlo dos veces. */
function textosPendientes() {
  const it = carpeta().getFilesByName(TEXTOS);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) return { ok: true, id: f.getId(), textos: f.getBlob().getDataAsString('UTF-8') }; }
  return { ok: true, textos: null };
}
function textosAplicados(req) {
  const f = DriveApp.getFileById(req.id);
  f.setName('textos-aplicados-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd-HHmm') + '.json');
  f.moveTo(sub(COPIAS));
  return { ok: true };
}
