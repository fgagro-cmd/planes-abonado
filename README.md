# Planes de abonado · FG Agro

App de **escritorio** (Edge o Chrome en Windows) para los planes de fertirrigación. Sustituye poco a poco a los Excels `Gestion Fertirrigacion v5*.xlsm`.

**Fase 1 (esta versión):**
- **Planes**: uno por cada Excel (cliente › finca › cultivo), con marco, riego, zona vulnerable y recintos.
- **Analíticas** de suelo, agua y estiércol **compartidas**: una analítica de agua puede servir a todas las fincas de una comunidad de regantes. Avisa de las analíticas de plantilla, viejas o si hay una más nueva.
- **Riego**: ETo de la zona de Mula, Kc por grupo o por plan, KL por la copa y eficiencia por textura (igual que la pestaña 3 del Excel).
- **Balance de N** (pestaña 2 del Excel) con fA, fB y humus automáticos, estiércoles que restan siempre y **PDF «Estimado» y «Cerrado»** guardados en la carpeta del cliente.
- **Avisos**: N del plan por encima del balance, N orgánico > 170 kg/ha en zona vulnerable, falta de datos…

Próximas fases: necesidades por cultivo y reparto mensual con gráfica (2), productos, dosis y tanques (3) e informe mensual por lotes (4).

## Dónde están los datos
En **OneDrive**, no en este repositorio (es público: aquí no hay datos de clientes).
- `Asesoramiento agrícola/_App planes de abonado/datos.json` → todos los datos. Copia diaria en `copias/`.
- `Asesoramiento agrícola/Clientes/<cliente>/<finca>/Planes de abonado/` → los PDF.
- El logo del informe está en `_App planes de abonado/logo.jpg` (se toma del primer Excel al importar).

Trabaja en un solo ordenador a la vez. Si el otro ordenador guardó cambios mientras tenías la app abierta, la app avisa y te deja elegir.

## Archivos
| Archivo | Para qué |
|---|---|
| `index.html`, `style.css`, `app.js` | La app |
| `calc.js` | Cálculos: riego, balance de N, avisos y tablas de la pestaña 1 |
| `importar.js` | Lectura de los Excels v5 |
| `almacen.js` | Lectura y escritura en la carpeta de OneDrive |
| `pdf.js` | PDF del balance de N |
| `maestros.js` | Enlace con los maestros (el mismo que en las otras apps) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalación y apertura sin conexión |
| `vendor/` | SheetJS (leer Excel) y jsPDF + autoTable (PDF) |

## Actualizar la app
Al cambiar cualquier archivo, sube `VERSION` en `sw.js` y `APP_VERSION` en `app.js`. Los datos están en OneDrive y no se tocan.
