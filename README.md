# Planes de abonado · FG Agro

App de **escritorio** (Edge o Chrome en Windows) para los planes de fertirrigación. Sustituye poco a poco a los Excels `Gestion Fertirrigacion v5*.xlsm`.

**Fase 1 (esta versión):**
- **Planes**: uno por cada Excel (cliente › finca › cultivo), con marco, riego, zona vulnerable y recintos.
- **Analíticas** de suelo, agua y estiércol **compartidas**: una analítica de agua puede servir a todas las fincas de una comunidad de regantes. Avisa de las analíticas de plantilla, viejas o si hay una más nueva.
- **Riego**: ETo de la zona de Mula, Kc por grupo o por plan, KL por la copa y eficiencia por textura (igual que la pestaña 3 del Excel).
- **Balance de N** (pestaña 2 del Excel) con fA, fB y humus automáticos, estiércoles que restan siempre y **PDF «Estimado» y «Cerrado»** guardados en la carpeta del cliente.
- **Avisos**: N del plan por encima del balance, N orgánico > 170 kg/ha en zona vulnerable, falta de datos…

**Fase 2 (versión 1.2, en marcha):**
- **Repartos**: tipos de reparto mensual (% de la necesidad anual de cada nutriente por mes), creados a partir de los Excels y editables. Avisa si un tipo no suma 100 %.
- **Necesidades y reparto** en cada plan: necesidad teórica − estiércol − agua de riego × factor de corrección = UF/ha a aportar; el N no pasa del balance. Reparto de cada mes en kg UF/ha con gráfica, comparado con el N del plan.
- Año de plantación de cada plan (edad por campaña).
- Pendiente: necesidades por cultivo y edad según bibliografía.

**Fase 3 (versión 1.3):**
- **Productos**: base de datos con riquezas (N, P2O5, K2O, CaO, MgO, S, Fe, Zn, Mn, N nítrico y amoniacal), densidad, tanque habitual (1, 2 o E) y familia de los E; se importa del Excel `Cuaderno de campo/Calculadoras Excel/Base de datos/Productos Gestion fertirrigacion.xlsx` y se enlaza con el maestro de productos.
- **Fertirrigación** de cada mes: productos, dosis por riego (g o cc/pie, kg o L/ha), riegos, periodo y tanque (automático: los E del mismo momento del mes van juntos y los orgánicos aparte; se puede cambiar a mano). Cantidad por riego en la finca y por pie, UF y comparación con el objetivo del mes.
- Copiar el mismo mes de la campaña anterior o el mes anterior; **Ajustar al objetivo** (cambia las dosis de los tanques 1 y 2 para acercar N, P2O5 y K2O cambiando lo menos posible la mezcla).
- **Solución nutritiva** (solo para el técnico): iones en meq/L, CE estimada, % de cationes y aniones con rangos y ácido para bajar los bicarbonatos.
- El N del plan del balance sale ya de estas líneas (igual que en el Excel: 899 de 912 meses idénticos; el resto por cambios de riqueza en la tabla de productos).

**Fase 4 (versión 1.4):**
- **Calendario de riego** de cada mes (pestaña Fertirrigación): patrón por finca (repartir los riegos, días fijos L-M-X…, todos o ninguno; todo el mes o una quincena), +1/−1 día por quincena y pulsar un día para ponerlo o quitarlo. Avisa si los días marcados no coinciden con el nº de riegos.
- **Observaciones** por mes, que salen en el informe.
- **Informe mensual en PDF** con el mismo diseño del Excel (página 1) y una página 2 con la información fitosanitaria del grupo de cultivo, la situación actual y «Tu plan de un vistazo» (campaña mes a mes, cuánto se lleva aplicado, de dónde sale el nitrógeno y lo comprobado).
- **Textos**: información fitosanitaria por grupo (cítricos, frutales, almendro, olivos) y situación actual, por mes.
- **Informes**: lista del mes con el estado de cada plan, «Preparar mes» (copia el mismo mes de la campaña anterior o el mes anterior en los planes vacíos), marcar revisados y generar los PDF de los revisados en `Clientes/<carpeta>/Planes de abonado/` y una copia en `Planes de abonado/` (raíz de Asesoramiento agrícola). En la tablet quedan en Drive y el ordenador los pasa.
- El pie del informe (texto, teléfono y email) se escribe en Ajustes y se guarda en Drive, no en el código.
**Versión 1.6:**
- **Informe mensual con diseño nuevo** (fuente Inter incluida en `vendor/fuentes-inter.js`, licencia OFL): calendario con círculos, roscas de unidades fertilizantes, agua del mes y de la campaña; página 2 con lo que aporta el agua de riego, marcas de lo comprobado y recomendación de analítica (suelo > 4 años, agua > 2, estiércol > 1, o sin analítica; se cambia en Ajustes). Si los textos son largos, los bloques pasan a una página 3 sin cortarse. Contador de caracteres en Textos.
- **Fertirrigación**: objetivo y plan del mes fijo arriba mientras se ajustan las dosis, columna «Total mes» y totales por producto de la campaña.
- **Informes**: filtro «Sin PDF».
- **Registros** (sección nueva): registro de fertilización, registro de riego, plan de abonado anual (RD 1051/2022) y productos para pedidos, por intervalo de meses, un PDF por plan o por cliente. Textos de aplicación y medidas del plan anual en Ajustes.

**Versión 1.5:** los textos del mes se pueden preparar con Claude (tarea programada del día 20). Tras confirmarlos, Claude deja `textos-pendientes.json` en Drive › Apps › Planes de abonado y la app los carga sola en Textos al abrirse (o con «Buscar textos de Claude»); después el archivo pasa a `Copias`.
- El script tiene la acción `enviados`, que usa la app Asesor para marcar «Enviado» los meses con todos los informes generados.

## Dónde están los datos (desde la versión 1.1)
En **Google Drive**, no en este repositorio (es público: aquí no hay datos de clientes).
- Drive › Apps › Planes de abonado → hoja «Planes de abonado» con su script (`google-sheets/Codigo.gs`), `datos.json` con todos los datos y copia diaria en `Copias`. La pestaña «Registro» anota cada guardado.
- Cada equipo guarda además una copia local para abrir al momento y trabajar sin conexión; lo cambiado sin conexión se sube al volver.
- Si otro equipo guardó antes, la app avisa y deja elegir (cargar lo del otro o guardar lo propio encima).

**OneDrive, solo en el ordenador** (Edge o Chrome en Windows): sirve para importar los Excels de `Clientes` y guardar los PDF en `Clientes/<cliente>/<finca>/Planes de abonado/`.
**En la tablet** (Android o iPad) se trabaja igual; los PDF se ven o se comparten al momento y quedan en Drive › Apps › Planes de abonado › «PDF pendientes de OneDrive» hasta que el ordenador los pasa solo a la carpeta del cliente.

## Puesta en marcha del script
1. Abre la hoja **Planes de abonado** (Drive › Apps › Planes de abonado) → **Extensiones → Apps Script**.
2. Borra lo que haya, pega `google-sheets/Codigo.gs` y cambia `CAMBIA-ESTA-CLAVE` por una clave tuya. Guarda.
3. Arriba elige la función **autorizar** → **Ejecutar** → acepta los permisos.
4. **Implementar → Nueva implementación** → tipo **Aplicación web** → Ejecutar como **Yo** → Quién tiene acceso **Cualquier usuario** → **Implementar**. Copia la dirección que termina en `/exec`.
5. En la app: pega la dirección y la clave en «Conectar con Google Drive».
6. Al cambiar el script (p. ej. versión 1.4, acción `enviados`): pega el código nuevo y haz **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar**. La dirección no cambia.

## Archivos
| Archivo | Para qué |
|---|---|
| `index.html`, `style.css`, `app.js` | La app |
| `calc.js` | Cálculos: riego, balance de N, avisos y tablas de la pestaña 1 |
| `importar.js` | Lectura de los Excels v5 |
| `nube.js` | Datos en Google Drive (con copia local y sin conexión) |
| `almacen.js` | Carpeta de OneDrive en el ordenador: Excels, PDF y datos de la versión 1.0 |
| `google-sheets/Codigo.gs` | Script de la hoja «Planes de abonado» |
| `pdf.js` | PDF del balance de N |
| `maestros.js` | Enlace con los maestros (el mismo que en las otras apps) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalación y apertura sin conexión |
| `vendor/` | SheetJS (leer Excel) y jsPDF + autoTable (PDF) |

## Actualizar la app
Al cambiar cualquier archivo, sube `VERSION` en `sw.js` y `APP_VERSION` en `app.js`. Los datos están en Drive y no se tocan.
