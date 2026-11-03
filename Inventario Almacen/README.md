# GAC Motors - Sistema de Control y Chequeo de Inventario (PWA)

- **PROYECTO:** Sistema de Chequeo de Inventario y Almacén - GAC Motors
- **DESARROLLO & ARQUITECTURA:** Victor Solorzano
- **ASISTENCIA TÉCNICA:** OpenCode for Obsidian & Antigravity IDE
- **ROL:** Documentación Técnica de la App 1 (Auditoría de Inventario) e Integración con App 2 (Mostrador Ventas-Almacén)

---

Aplicación web corporativa, responsiva e instalable (PWA) diseñada para el chequeo exhaustivo, conteo físico y actualización de repuestos en almacén para **GAC Motors**, sincronizada en tiempo real con Google Sheets y Google Drive mediante Google Apps Script.

> 💡 **Ecosistema Dual GAC Motors:** Este proyecto comparte su base de datos en Google Sheets y su backend de Apps Script con la segunda aplicación independiente **[Mostrador Digital Ventas-Almacén](../App%20Ventas-Almacen/README.md)** ubicada en la carpeta `App Ventas-Almacen/`.

---

## 🛠️ Arquitectura y Tecnologías

- **Frontend:** HTML5 semántico, CSS3 Vanilla con sistema de diseño automotriz (Dark/Light mode), JavaScript ES6+.
- **PWA:** `manifest.json` y `sw.js` para instalación como aplicación nativa en Android, iOS, iPadOS y PC.
- **Backend Unificado:** Google Apps Script Web App (`Code.gs` + `SolicitudesVentas.gs`).
- **Base de Datos:** Google Sheets (`Repuestos`, `Base_Datos` y `Solicitudes_Ventas`).
- **Almacenamiento de Fotos:** Google Drive (Carpeta ID: `14HOPxz0tFZlNAxCOv0eu7cub0qqHvpsu`).
- **Optimización de Fotos:** Compresión en el cliente con HTML5 Canvas (JPEG 1600px máx, calidad 0.80) para subidas ultrarrápidas de ~150KB-250KB por imagen.

---

## 📋 Guía de Implementación Paso a Paso

### 1. Configuración de Google Apps Script (Backend Unificado)

1. Abra su hoja de Google Sheets del inventario:
   `https://docs.google.com/spreadsheets/d/127o9T9u2r3BVVR-S9kq74FiGsxXCkifErOthQM0pv0k/edit`
2. En el menú superior, haga clic en **Extensiones** > **Apps Script**.
3. El proyecto de Apps Script consta de dos archivos que trabajan en conjunto:
   - [`apps-script/Code.gs`](./apps-script/Code.gs): Funciones de inventario, filtros en cascada, creación/edición de repuestos y subida de fotografías a Drive (`getFilterData`, `searchRepuesto`, `saveRepuesto`, `createRepuesto`).
   - [`apps-script/SolicitudesVentas.gs`](./apps-script/SolicitudesVentas.gs): Router unificado `doGet`/`doPost` y endpoints para el **Mostrador Digital Ventas-Almacén** (`getUsuarios`, `getCatalog`, `crearSolicitud`, `getSolicitudes`, `actualizarEstadoSolicitud`).
   - *(Importante)*: Deje activo únicamente el `doGet` y `doPost` de `SolicitudesVentas.gs`, ya que redirige automáticamente todas las acciones de ambas aplicaciones.
4. Guarde el proyecto con el botón 💾 (Guardar).
5. En la esquina superior derecha, haga clic en **Implementar** > **Nueva implementación** (o **Administrar implementaciones > Editar > Nueva versión**):
   - **Tipo de implementación (engranaje ⚙️):** Seleccione `Aplicación web`.
   - **Ejecutar como:** `Yo (tu_cuenta@gmail.com)`.
   - **Quién tiene acceso:** `Cualquier usuario` (*Anyone*).
6. Copie la **URL de la aplicación web** generada (termina en `/exec`).

---

### 2. Conexión de la Aplicación Web (Ya Preconfigurada)

La aplicación ya cuenta con la URL de producción preconfigurada de fábrica en el código:
`https://script.google.com/macros/s/AKfycbwMoaiBbM5dCNo-iwD1XzuxOCvqTAFx5hsGEuL_y71lfitdzDf1dDkNJdBeRm-TUL-z/exec`

Por lo tanto, **cualquier dispositivo (celular, tablet o PC) que abra el enlace de Vercel o instale la PWA se conectará y sincronizará de forma automática e inmediata sin solicitar nada al usuario**. El botón de configuración ⚙️ permanece disponible por si en el futuro se desea cambiar la URL manualmente.

---

### 3. Despliegue en GitHub y Vercel

1. **Subir a GitHub:**
   ```bash
   git add .
   git commit -m "feat: ecosistema PWA GAC Motors (Inventario + Ventas-Almacen)"
   git push origin main
   ```

2. **Desplegar en Vercel:**
   - Puede desplegar `Inventario Almacen` y `App Ventas-Almacen` como dos proyectos independientes en Vercel configurando el **Root Directory** de cada proyecto en Vercel (`Inventario Almacen` para la App 1 y `App Ventas-Almacen` para la App 2).

3. **Instalación como App (PWA):**
   - **En Android / Chrome:** Abra el enlace de Vercel > Toque el menú de 3 puntos o el botón `📲 Instalar App` > **"Instalar aplicación"**.
   - **En iPhone / iPad (Safari):** Abra el enlace > Toque el botón de **Compartir** > **"Añadir a la pantalla de inicio"**.
   - **En PC / Mac (Chrome o Edge):** Haga clic en el icono de instalación en la barra de direcciones para usarla en una ventana independiente.

---

## 🔒 Protección de Fórmulas en Google Sheets

El backend en `Code.gs` y `SolicitudesVentas.gs` respeta estrictamente las fórmulas nativas de Google Sheets:
- Antes de escribir cualquier actualización, se inspeccionan las celdas mediante `getFormulas()` y se mapean las columnas por **nombre de encabezado** (nunca por orden fijo).
- Si una columna contiene una fórmula, **el código nunca la sobrescribe**, garantizando que Google Sheets conserve su cálculo automático.
- Las columnas `EXIST_VIRTUAL` y `N# PARTE archivo` permanecen como solo lectura en el inventario, mientras que el catálogo de Ventas consulta `EXIST_VIRTUAL` como referencia de disponibilidad.

---

## 🏷️ Nomenclatura de Fotografías en Drive

Las fotos capturadas o adjuntadas se suben directamente a la carpeta de Google Drive configurada con la nomenclatura:
`ARTICULO-MARCA-MODELO-N#.jpg` (ejemplo: `215-DFSK-C37-1.jpg`).
Los enlaces públicos de visualización quedan almacenados y separados por coma (`, `) en la columna `FOTOS` de la hoja `Repuestos`.
