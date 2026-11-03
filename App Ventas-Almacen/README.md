# GAC Motors - Mostrador Digital Ventas-Almacén (PWA)

- **PROYECTO:** Mostrador Digital Ventas-Almacén - GAC Motors
- **DESARROLLO & ARQUITECTURA:** Victor Solorzano
- **ASISTENCIA TÉCNICA:** OpenCode for Obsidian & Antigravity IDE
- **ROL:** Documentación Técnica y Operativa de la Segunda Aplicación Web Independiente (PWA)

---

Aplicación web progresiva (PWA) corporativa, instalable y en tiempo real diseñada para conectar el mostrador de **Ventas** con el equipo de **Almacén** de **GAC Motors**, operando sobre la misma base de datos maestra en Google Sheets (`Inventario Almacen`).

---

## 🚀 Características Principales

### 1. Acceso Rápido por Rol (Sin Contraseña)
- Selector de perfil al inicio: **¿Eres Vendedor o Almacenista?**
- Lista desplegable alimentada en vivo desde las columnas `Vendedores` y `Almacenistas` de la pestaña `Base_Datos`.

### 2. Módulo de Ventas
- **Buscador Inteligente Multi-Campo + Filtros Específicos:**
  - Búsqueda libre en tiempo real combinando palabras clave sobre Descripción, Marca, Modelo, Aplica A, Código (`ARTICULO`) y N# de Parte.
  - **Selectores dedicados:** Filtro específico por **MODELO** y filtro específico por **APLICA A** (compatibilidad), combinables con el check **Solo con Stock**.
- **Tarjetas de Repuesto con Galería de Google Drive:**
  - Visualización optimizada de fotografías alojadas en Google Drive con respaldo automático (`lh3.googleusercontent.com` / `thumbnail`) y visor modal con carrusel de miniaturas.
  - Indicador de **Stock** conectado estrictamente a la columna **`EXIST_VIRTUAL`**.
  - Resaltado en alto contraste de la **`Ubicacion_Almacen`**.
- **Carrito Ultra-Ágil (Máx. 20 artículos):**
  - Sin campos de Cliente ni Orden de Taller para máxima velocidad en mostrador.
  - **Observación individual por artículo (`Observacion_Vendedor`):** Cada repuesto del carrito cuenta con su propio campo de texto para especificar detalles al almacenista.
  - Selector de prioridad (**Normal** en azul / **Urgente** en rojo).
- **Seguimiento en Vivo ("Mis Solicitudes"):**
  - Polling automático cada **30 segundos**.
  - Cuando Almacén procesa una solicitud (`Despachado` o `No Procesar`), reproduce un **chime suave mediante Web Audio API nativa** y despliega un banner flotante verde con el nombre del almacenista, estado y observación de respuesta.

### 3. Módulo de Almacén (Tablero de Despacho)
- **Ordenamiento Inteligente:** Prioriza automáticamente las solicitudes con estado **Pendiente** y prioridad **Urgente** (con efecto visual de alerta).
- **Sistema de Alerta Sonora y Visual en Almacén:**
  - Polling automático cada **30 segundos**.
  - Al ingresar una nueva solicitud pendiente, reproduce una **campana doble de mostrador vía Web Audio API** y muestra el banner flotante rojo: `🚨 ¡NUEVA SOLICITUD #SOL-XXXX DE [VENDEDOR]!`.
- **Recolección Inmediata:**
  - Muestra cada repuesto solicitado con su SKU, Cantidad, la **Nota del Vendedor (`Observacion_Vendedor`)** y destaca en tamaño gigante la **Ubicación Física (Pasillo/Estante)**.
- **Despacho con Observaciones:**
  - Campo de texto para **Observaciones rápidas de Almacén (`Observacion_Almacen`)** y botones de acción directa: **✅ Despachar** / **⛔ No Procesar**.

---

## 🗂️ Estructura de Archivos

```text
App Ventas-Almacen/
├── index.html                  # Entrada principal PWA (raíz para despliegue directo en Vercel)
├── ventas.js                   # Lógica ES6+, Polling 30s, Web Audio API, Carrito y Filtros
├── manifest.json               # Manifiesto de instalación PWA
├── sw.js                       # Service Worker (Caché v3)
├── css/
│   └── ventas.css              # Animaciones y estilos corporativos GAC Motors
├── assets/
│   ├── logo-gac.png            # Logotipo oficial GAC Motors
│   ├── logo-gac.svg            # Logotipo vectorial
│   ├── icon-192.png            # Icono PWA 192x192
│   └── icon-512.png            # Icono PWA 512x512
├── app-ventas/                 # Espejo completo del frontend en subcarpeta dedicada
│   ├── index.html
│   ├── ventas.js
│   ├── manifest.json
│   ├── sw.js
│   ├── css/ventas.css
│   └── assets/...
└── apps-script/
    └── SolicitudesVentas.gs    # Backend Google Apps Script (Router Unificado App 1 + App 2)
```

---

## 📊 Estructura en Google Sheets (`Inventario Almacen`)

- **ID del Archivo:** `127o9T9u2r3BVVR-S9kq74FiGsxXCkifErOthQM0pv0k`
- **Pestañas utilizadas:**
  1. `Base_Datos`: Lectura de las columnas `Vendedores` y `Almacenistas`.
  2. `Repuestos`: Lectura del catálogo (`ARTICULO`, `DESCRIPCION`, `MARCA`, `MODELO`, `APLICA A`, `EXIST_VIRTUAL`, `UBICACION`, `FOTOS`) respetando estrictamente la **Regla de No Modificación de Fórmulas**.
  3. `Solicitudes_Ventas` (`gid=751091726`): Registro operativo de solicitudes mapeado dinámicamente **por nombre de encabezado** (sin importar el orden de columnas):
     - `N# Solicitud` (Correlativo automático `SOL-0001`, `SOL-0002`...)
     - `Fecha_Hora`
     - `Vendedor`
     - `SKU_Articulo`
     - `Descripcion_Repuesto`
     - `Ubicacion_Almacen`
     - `Cantidad`
     - `Prioridad` (`Normal` / `Urgente`)
     - `Status` (`Pendiente` / `Despachado` / `No Procesar`)
     - `Observacion_Vendedor` (Nota específica del vendedor por artículo)
     - `Almacenista` (Nombre de quien procesa en almacén)
     - `Observacion_Almacen` (Nota de respuesta del almacén)
     - `Fecha_Hora_Repuesta` (Marca de tiempo del despacho/respuesta)

---

## ⚙️ Configuración en Google Apps Script

1. Abra la hoja de cálculo `Inventario Almacen` en Google Sheets y vaya a **Extensiones > Apps Script**.
2. Agregue o actualice el archivo `SolicitudesVentas.gs` con el contenido de [`apps-script/SolicitudesVentas.gs`](./apps-script/SolicitudesVentas.gs).
3. Dado que `SolicitudesVentas.gs` incluye el router unificado `doGet(e)` y `doPost(e)` que atiende tanto la **App 1 (Inventario)** como la **App 2 (Ventas-Almacén)**, asegúrese de comentar o eliminar el `doGet`/`doPost` duplicado en `Code.gs`.
4. Haga clic en **Implementar > Administrar implementaciones > Editar (✏️) > Nueva versión > Implementar**.

