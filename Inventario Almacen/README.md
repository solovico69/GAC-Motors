# GAC Motors - Sistema de Control y Chequeo de Inventario (PWA)

Aplicación web corporativa, responsiva e instalable (PWA) diseñada para el chequeo exhaustivo, conteo físico y actualización de repuestos en almacén para **GAC Motors**, sincronizada en tiempo real con Google Sheets y Google Drive mediante Google Apps Script.

---

## 🛠️ Arquitectura y Tecnologías

- **Frontend:** HTML5 semántico, CSS3 Vanilla con sistema de diseño automotriz (Dark/Light mode), JavaScript ES6+.
- **PWA:** `manifest.json` y `sw.js` para instalación como aplicación nativa en Android, iOS, iPadOS y PC.
- **Backend:** Google Apps Script Web App (`doGet` / `doPost`).
- **Base de Datos:** Google Sheets (`Repuestos` y `Base_Datos`).
- **Almacenamiento de Fotos:** Google Drive (Carpeta ID: `14HOPxz0tFZlNAxCOv0eu7cub0qqHvpsu`).
- **Optimización de Fotos:** Compresión en el cliente con HTML5 Canvas (JPEG 1600px máx, calidad 0.80) para subidas ultrarrápidas de ~150KB-250KB por imagen.

---

## 📋 Guía de Implementación Paso a Paso

### 1. Configuración de Google Apps Script

1. Abra su hoja de Google Sheets del inventario:
   `https://docs.google.com/spreadsheets/d/127o9T9u2r3BVVR-S9kq74FiGsxXCkifErOthQM0pv0k/edit`
2. En el menú superior, haga clic en **Extensiones** > **Apps Script**.
3. En el editor de Apps Script, reemplace todo el contenido del archivo `Código.gs` con el código ubicado en:
   [`apps-script/Code.gs`](./apps-script/Code.gs).
4. Guarde el proyecto con el botón 💾 (Guardar).
5. En la esquina superior derecha, haga clic en **Implementar** > **Nueva implementación**:
   - **Tipo de implementación (engranaje ⚙️):** Seleccione `Aplicación web`.
   - **Descripción:** `GAC Motors Inventario v1`.
   - **Ejecutar como:** `Yo (tu_cuenta@gmail.com)`.
   - **Quién tiene acceso:** `Cualquier usuario` (*Anyone*).
6. Haga clic en **Implementar**, conceda los permisos de Google Drive y Sheets solicitados.
7. Copie la **URL de la aplicación web** generada (termina en `/exec`).

---

### 2. Conexión de la Aplicación Web (Ya Preconfigurada)

La aplicación ya cuenta con la URL de producción preconfigurada de fábrica en el código:
`https://script.google.com/macros/s/AKfycbwMoaiBbM5dCNo-iwD1XzuxOCvqTAFx5hsGEuL_y71lfitdzDf1dDkNJdBeRm-TUL-z/exec`

Por lo tanto, **cualquier dispositivo (celular, tablet o PC) que abra el enlace de Vercel o instale la PWA se conectará y sincronizará de forma automática e inmediata sin solicitar nada al usuario**. El botón de configuración ⚙️ permanece disponible por si en el futuro se desea cambiar la URL manualmente.

---

### 3. Despliegue en GitHub y Vercel

1. **Subir a GitHub:**
   ```bash
   git init
   git add .
   git commit -m "feat: GAC Motors Inventario PWA completa"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
   git push -u origin main
   ```

2. **Desplegar en Vercel:**
   - Inicie sesión en [Vercel](https://vercel.com).
   - Haga clic en **"Add New..."** > **"Project"**.
   - Seleccione su repositorio de GitHub.
   - Vercel detectará automáticamente que es un proyecto HTML estático.
   - Haga clic en **Deploy**.
   - Vercel le proporcionará una URL pública segura `https://tu-proyecto.vercel.app`.

3. **Instalación como App (PWA):**
   - **En Android / Chrome:** Abra el enlace de Vercel > Toque el menú de 3 puntos > **"Instalar aplicación"** o **"Añadir a pantalla de inicio"**.
   - **En iPhone / iPad (Safari):** Abra el enlace > Toque el botón de **Compartir** (icono cuadrado con flecha arriba) > **"Añadir a la pantalla de inicio"**.
   - **En PC / Mac (Chrome o Edge):** Haga clic en el icono de instalación en la barra de direcciones para usarla en una ventana independiente.

---

## 🔒 Protección de Fórmulas en Google Sheets

El backend en `Code.gs` respeta estrictamente las fórmulas nativas de Google Sheets:
- Antes de escribir cualquier actualización, inspecciona la fila mediante `getFormulas()`.
- Si una columna contiene una fórmula (por ejemplo `MARCA`, `SERIE` o `VERSION` calculadas por `XLOOKUP`/`VLOOKUP` a partir de `MODELO`), **el código nunca la sobrescribe**, garantizando que Sheets conserve su cálculo automático.
- Las columnas `EXIST_VIRTUAL` y `N# PARTE archivo` permanecen como solo lectura.

---

## 🏷️ Nomenclatura de Fotografías en Drive

Las fotos capturadas o adjuntadas se suben directamente a la carpeta de Google Drive configurada con la nomenclatura:
`ARTICULO-MARCA-MODELO-N#.jpg` (ejemplo: `215-DFSK-C37-1.jpg`).
Los enlaces públicos de visualización quedan almacenados y separados por coma (`, `) en la columna `FOTOS` de la hoja `Repuestos`.
