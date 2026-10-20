'use strict';
/* Planes de abonado · FG Agro — datos en Google Drive a través del script de la hoja «Planes de abonado».
   Copia local en el navegador (IndexedDB) para abrir al momento y seguir trabajando sin conexión:
   lo que se cambie sin conexión se sube al volver. */
(function (root) {
  let cfg = { url: '', clave: '' };

  async function cargarCfg() { cfg = (await ALM.kvGet('nube').catch(() => null)) || { url: '', clave: '' }; return cfg; }
  async function guardarCfg(c) { cfg = { url: c.url, clave: c.clave }; await ALM.kvSet('nube', cfg); }
  const conectada = () => !!(cfg.url && cfg.clave);
  const config = () => ({ ...cfg });

  async function llamar(accion, extra = {}, ms = 60000, c = cfg) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
    try {
      // Sin cabeceras propias: petición simple (text/plain), Google no exige comprobación previa.
      const res = await fetch(c.url, { method: 'POST', body: JSON.stringify({ accion, clave: c.clave, ...extra }), signal: ctrl.signal });
      const txt = await res.text();
      let r; try { r = JSON.parse(txt); } catch (_) { throw new Error('La dirección no responde como el script (revisa que esté implementado para «Cualquier usuario»)'); }
      if (!r.ok && r.error === 'clave') throw new Error('La clave no coincide con la del script');
      return r;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Google tarda demasiado en responder');
      if (e instanceof TypeError) { const x = new Error('Sin conexión con Google'); x.code = 'offline'; throw x; }
      throw e;
    } finally { clearTimeout(t); }
  }

  const probar = (c) => llamar('ping', {}, 30000, c);
  async function leer() { const r = await llamar('leer'); if (!r.ok) throw new Error(r.error || 'No se pudieron leer los datos'); return { datos: r.datos ? JSON.parse(r.datos) : null, version: r.version, guardado: r.guardado ? JSON.parse(r.guardado) : null }; }
  async function version() { const r = await llamar('version', {}, 20000); if (!r.ok) throw new Error(r.error || 'Error'); return r.version; }
  async function guardar(datos, base, equipo, forzar = false) {
    const r = await llamar('guardar', { datos: JSON.stringify(datos), base, equipo, forzar }, 90000);
    if (!r.ok && r.error === 'conflicto') { const e = new Error('Otro equipo guardó cambios'); e.code = 'conflicto'; e.version = r.version; e.guardado = r.guardado ? JSON.parse(r.guardado) : null; throw e; }
    if (!r.ok) throw new Error(r.error || 'No se pudo guardar');
    return r.version;
  }

  /* PDF hechos sin OneDrive (tablet): se dejan en Drive hasta que el ordenador los pasa */
  function blobABase64(blob) { return new Promise((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = () => ko(fr.error); fr.readAsDataURL(blob); }); }
  async function subirPdf(nombre, blob, meta) { const r = await llamar('subirPdf', { nombre, base64: await blobABase64(blob), meta }, 90000); if (!r.ok) throw new Error(r.error || 'No se pudo subir el PDF'); return r.id; }
  async function pdfs() { const r = await llamar('pdfs'); if (!r.ok) throw new Error(r.error || 'Error'); return r.pdfs || []; }
  async function leerPdf(id) {
    const r = await llamar('leerPdf', { id }, 90000); if (!r.ok) throw new Error(r.error || 'Error');
    const bin = atob(r.base64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type: 'application/pdf' });
  }
  async function borrarPdf(id) { const r = await llamar('borrarPdf', { id }); if (!r.ok) throw new Error(r.error || 'Error'); }

  /* Copia local */
  const local = () => ALM.kvGet('local').catch(() => null);
  const guardarLocal = (o) => ALM.kvSet('local', o).catch(() => {});

  root.NUBE = { cargarCfg, guardarCfg, conectada, config, llamar, probar, leer, version, guardar, subirPdf, pdfs, leerPdf, borrarPdf, local, guardarLocal };
})(typeof window !== 'undefined' ? window : globalThis);
