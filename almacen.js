'use strict';
/* Planes de abonado · FG Agro — carpeta de OneDrive en el ordenador (desde la versión 1.1 los datos van a Drive: ver nube.js).
   Aquí: importar los Excels, guardar los PDF en la carpeta de cada cliente y leer los datos de la versión 1.0.
   Versión 1.0 (antigua): almacén de datos en una carpeta de OneDrive.
   El usuario elige una vez la carpeta «Asesoramiento agrícola». Dentro, la app usa:
     _App planes de abonado/datos.json        → todos los datos (la fuente de verdad)
     _App planes de abonado/copias/…json      → una copia por día
     _App planes de abonado/en-uso.json       → qué ordenador la tiene abierta
     Clientes/<cliente>/<finca>/…              → Excels (lectura) y PDF (escritura)
   El permiso de la carpeta se guarda en el navegador (IndexedDB) y se pide de nuevo con un clic. */
(function (root) {
  const CARPETA_APP = '_App planes de abonado';
  const IDB = 'planes-abonado', STORE = 'kv';

  function idb() {
    return new Promise((ok, ko) => {
      const r = indexedDB.open(IDB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
    });
  }
  async function kvGet(k) { const d = await idb(); return new Promise((ok, ko) => { const t = d.transaction(STORE).objectStore(STORE).get(k); t.onsuccess = () => ok(t.result); t.onerror = () => ko(t.error); }); }
  async function kvSet(k, v) { const d = await idb(); return new Promise((ok, ko) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => ok(); t.onerror = () => ko(t.error); }); }

  // Solo en el ordenador: en tablets y móviles OneDrive no tiene una carpeta sincronizada que se pueda elegir
  const movil = () => typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
  const soportado = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window && !movil();

  let raiz = null;        // handle de «Asesoramiento agrícola»
  let ultimaLectura = 0;  // lastModified de datos.json cuando lo leímos o escribimos

  async function permiso(h, pedir) {
    const o = { mode: 'readwrite' };
    if ((await h.queryPermission(o)) === 'granted') return true;
    if (!pedir) return false;
    return (await h.requestPermission(o)) === 'granted';
  }

  /* Estado al abrir: 'sin-carpeta' | 'pedir-permiso' | 'listo' */
  async function iniciar() {
    if (!soportado()) return 'no-soportado';
    const h = await kvGet('raiz').catch(() => null);
    if (!h) return 'sin-carpeta';
    raiz = h;
    return (await permiso(h, false)) ? 'listo' : 'pedir-permiso';
  }
  async function reconectar() { if (!raiz) return false; return permiso(raiz, true); }
  async function elegirCarpeta() {
    const h = await window.showDirectoryPicker({ id: 'asesoramiento', mode: 'readwrite', startIn: 'documents' });
    let tieneClientes = false;
    try { await h.getDirectoryHandle('Clientes'); tieneClientes = true; } catch (_) { /* sin Clientes */ }
    raiz = h; await kvSet('raiz', h);
    return { nombre: h.name, tieneClientes };
  }
  const nombreRaiz = () => (raiz ? raiz.name : '');

  async function dirApp(crear = true) { return raiz.getDirectoryHandle(CARPETA_APP, { create: crear }); }
  async function subdir(dir, ruta, crear) {
    let d = dir;
    for (const p of ruta.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create: crear });
    return d;
  }

  async function leerJSON(dir, nombre) {
    try { const fh = await dir.getFileHandle(nombre); const f = await fh.getFile(); return { datos: JSON.parse(await f.text()), mod: f.lastModified }; }
    catch (e) { if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return null; throw e; }
  }
  async function escribir(dir, nombre, contenido) {
    const fh = await dir.getFileHandle(nombre, { create: true });
    const w = await fh.createWritable();
    await w.write(contenido); await w.close();
    return (await fh.getFile()).lastModified;
  }

  /* ---------- datos.json ---------- */
  async function cargar() {
    const d = await dirApp(true);
    const r = await leerJSON(d, 'datos.json');
    if (!r) { ultimaLectura = 0; return null; }
    ultimaLectura = r.mod;
    await kvSet('cache', r.datos).catch(() => {});
    return r.datos;
  }
  /* ¿Ha guardado el otro ordenador desde que leímos? */
  async function cambiadoFuera() {
    const d = await dirApp(true);
    try { const f = await (await d.getFileHandle('datos.json')).getFile(); return ultimaLectura && f.lastModified > ultimaLectura + 1000 ? f.lastModified : 0; }
    catch (_) { return 0; }
  }
  async function guardar(datos, { forzar = false } = {}) {
    const d = await dirApp(true);
    if (!forzar && await cambiadoFuera()) { const e = new Error('El otro ordenador ha guardado cambios después de abrir la app'); e.code = 'conflicto'; throw e; }
    const txt = JSON.stringify(datos);
    // Copia del día: la primera vez que se guarda cada día se copia el fichero anterior
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      const copias = await d.getDirectoryHandle('copias', { create: true });
      let existe = true; try { await copias.getFileHandle('datos-' + hoy + '.json'); } catch (_) { existe = false; }
      if (!existe) { const prev = await leerJSON(d, 'datos.json'); if (prev) await escribir(copias, 'datos-' + hoy + '.json', JSON.stringify(prev.datos)); }
    } catch (_) { /* la copia no debe impedir guardar */ }
    ultimaLectura = await escribir(d, 'datos.json', txt);
    await kvSet('cache', datos).catch(() => {});
    return ultimaLectura;
  }
  const cache = () => kvGet('cache').catch(() => null);

  /* ---------- Ordenador que la tiene abierta ---------- */
  async function marcarUso(equipo) { try { const d = await dirApp(true); await escribir(d, 'en-uso.json', JSON.stringify({ equipo, latido: new Date().toISOString() })); } catch (_) { /* nada */ } }
  async function usoOtro(equipo) {
    try {
      const d = await dirApp(true); const r = await leerJSON(d, 'en-uso.json');
      if (!r || !r.datos || r.datos.equipo === equipo) return null;
      const min = (Date.now() - new Date(r.datos.latido).getTime()) / 60000;
      return min < 4 ? r.datos : null;
    } catch (_) { return null; }
  }

  /* ---------- Excels y PDF en Clientes ---------- */
  async function listarExcels(progreso) {
    const cli = await raiz.getDirectoryHandle('Clientes');
    const out = [];
    async function rec(dir, ruta, prof) {
      for await (const [nombre, h] of dir.entries()) {
        if (h.kind === 'directory') {
          if (prof === 0 && /^ZZ_/i.test(nombre)) continue;
          if (prof < 4) await rec(h, ruta ? ruta + '/' + nombre : nombre, prof + 1);
        } else if (/\.xlsm$/i.test(nombre) && !/^lanzador/i.test(nombre) && !/^~\$/.test(nombre) && ruta) {
          out.push({ ruta: ruta + '/' + nombre, h });
          if (progreso) progreso(out.length);
        }
      }
    }
    await rec(cli, '', 0);
    out.sort((a, b) => a.ruta.localeCompare(b.ruta, 'es'));
    return out;
  }
  /* Lee un archivo por su ruta dentro de la carpeta elegida («Cuaderno de campo/…/x.xlsx») */
  async function leerRuta(ruta) {
    const ps = ruta.split('/'); const nombre = ps.pop();
    const d = await subdir(raiz, ps.join('/'), false);
    const f = await (await d.getFileHandle(nombre)).getFile();
    return f.arrayBuffer();
  }
  async function leerArchivo(h) { const f = await h.getFile(); return { buf: await f.arrayBuffer(), mod: f.lastModified }; }

  /* Guarda un PDF en Clientes/<carpeta>/Planes de abonado/<nombre>. Devuelve la ruta. */
  async function guardarPDF(carpeta, nombre, blob) {
    const cli = await raiz.getDirectoryHandle('Clientes');
    const d = await subdir(cli, carpeta + '/Planes de abonado', true);
    const limpio = nombre.replace(/[\\/:*?"<>|]/g, '-');
    await escribir(d, limpio, blob);
    return 'Clientes/' + carpeta + '/Planes de abonado/' + limpio;
  }
  /* Copia en una carpeta de la raíz (Asesoramiento agrícola/<ruta>), p. ej. «Planes de abonado» */
  async function guardarEnRaiz(ruta, nombre, blob) {
    const d = await subdir(raiz, ruta, true);
    const limpio = nombre.replace(/[\\/:*?"<>|]/g, '-');
    await escribir(d, limpio, blob);
    return ruta + '/' + limpio;
  }
  async function existeCarpetaCliente(carpeta) {
    try { const cli = await raiz.getDirectoryHandle('Clientes'); await subdir(cli, carpeta, false); return true; } catch (_) { return false; }
  }

  /* Logo del informe (opcional): _App planes de abonado/logo.png */
  async function logo() {
    let d; try { d = await dirApp(false); } catch (_) { return null; }
    for (const n of ['logo.png', 'logo.jpg']) {
      try {
        const f = await (await d.getFileHandle(n)).getFile();
        const tipo = n.endsWith('.png') ? 'image/png' : 'image/jpeg';
        const b = new Blob([await f.arrayBuffer()], { type: tipo });
        return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
      } catch (_) { /* siguiente */ }
    }
    return null;
  }
  async function guardarLogo(blob, ext) {
    const d = await dirApp(true);
    const otro = ext === 'png' ? 'logo.jpg' : 'logo.png';
    try { await d.removeEntry(otro); } catch (_) { /* no estaba */ }
    await escribir(d, ext === 'png' ? 'logo.png' : 'logo.jpg', blob);
  }

  root.ALM = { CARPETA_APP, soportado, iniciar, reconectar, elegirCarpeta, nombreRaiz, cargar, guardar, cambiadoFuera, cache, marcarUso, usoOtro, listarExcels, leerArchivo, leerRuta, guardarPDF, guardarEnRaiz, existeCarpetaCliente, logo, guardarLogo, kvGet, kvSet };
})(typeof window !== 'undefined' ? window : globalThis);
