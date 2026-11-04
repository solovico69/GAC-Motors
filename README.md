# Ecosistema Digital GAC Motors (Inventario & Mostrador Ventas-Almacén)

- **PROYECTO:** Ecosistema PWA Inventario & Mostrador Digital Ventas-Almacén - GAC Motors
- **DESARROLLO & ARQUITECTURA:** Victor Solorzano
- **ASISTENCIA TÉCNICA:** OpenCode for Obsidian & Antigravity IDE
- **ROL:** Índice General del Repositorio Multi-Aplicación

---

Este repositorio contiene **tres Aplicaciones Web Progresivas (PWA) independientes** conectadas en tiempo real a un mismo archivo maestro de Google Sheets (`Inventario Almacen` - ID: `127o9T9u2r3BVVR-S9kq74FiGsxXCkifErOthQM0pv0k`):

1. 📦 **[App 1: Control y Chequeo de Inventario (`./Inventario Almacen`)](./Inventario%20Almacen/README.md)**
   - Auditoría de almacén, conteo físico (`EXIST_FISICA`), clasificación automotriz en cascada (`Marca -> Serie -> Modelo -> Versión`), asignación de ubicación y captura/compresión de fotografías hacia Google Drive.

2. 🚀 **[App 2: Mostrador Digital Ventas-Almacén (`./App Ventas-Almacen`)](./App%20Ventas-Almacen/README.md)**
   - Comunicación en tiempo real entre **Vendedores** y **Almacenistas**:
   - Buscador inteligente multi-campo + filtros específicos por **MODELO** y **APLICA A**.
   - Consulta de stock según **`EXIST_VIRTUAL`**, visor de fotografías de Google Drive y ubicación física destacada.
   - Carrito ágil (hasta 20 ítems) con **observación específica por cada artículo (`Observacion_Vendedor`)** y nivel de prioridad (**Normal** / **Urgente**).
   - Tablero de despacho para Almacén con alertas sonoras (**Web Audio API**) y visuales cada 30 segundos, registro de respuesta (`Despachado` / `No Procesar`) y observaciones de almacén (`Observacion_Almacen`).

3. 🌐 **[App 3: Catálogo General IMB Movilidad (`./Catalogo IMB Movilidad`)](./Catalogo%20IMB%20Movilidad/README.md)**
   - Portal web corporativo y PWA instalable de **consulta pública abierta (sin usuarios ni contraseñas)**.
   - Identidad principal **IMB Movilidad** acompañada del cintillo interactivo y footer con los logos oficiales de **GAC**, **DFSK** y **Shineray**.
   - Buscador inteligente multi-campo, filtros por **MARCA**, **MODELO** y **APLICA A**, disponibilidad conectada a **`EXIST_VIRTUAL`**, ficha técnica modal con galería de fotos y **ocultamiento total de la ubicación interna de almacén**.

