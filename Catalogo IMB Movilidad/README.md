# IMB Movilidad - Catálogo General de Repuestos (Portal Web & PWA)

- **PROYECTO:** Catálogo General IMB Movilidad
- **DESARROLLO & ARQUITECTURA:** Victor Solorzano
- **ASISTENCIA TÉCNICA:** OpenCode for Obsidian & Antigravity IDE
- **ROL:** Documentación Técnica y Operativa de la Tercera Aplicación Web Independiente (Portal Web + PWA de Consulta Pública)

---

Portal web corporativo y aplicación web progresiva (PWA) instalable, de **acceso libre (sin usuarios ni contraseñas)**, conectada en tiempo real y en modo **solo lectura** a la pestaña `Repuestos` del archivo maestro de Google Sheets (`127o9T9u2r3BVVR-S9kq74FiGsxXCkifErOthQM0pv0k`).

---

## 🚀 Características Principales

1. **Identidad Corporativa IMB Movilidad + Vitrina Multimarca:**
   - **Cabecera Principal:** Logotipo oficial **IMB Movilidad** (`logo-imb.jpg`) y título **"CATÁLOGO GENERAL IMB MOVILIDAD"**.
   - **Cintillo Interactivo de Marcas (Segunda línea):** Tarjetas con los logos oficiales de **GAC**, **DFSK** y **Shineray** que muestran el conteo de ítems por marca y permiten filtrar el catálogo con un solo clic.
   - **Pie de Página Corporativo (Footer Web):** Cierre institucional con el respaldo de **IMB Movilidad** y las 3 marcas comercializadas.
2. **Buscador Inteligente Multi-Campo + Filtros Combinables:**
   - Búsqueda instantánea por Descripción, Código SKU (`ARTICULO`), N# de Parte, Marca, Serie, Modelo, Versión, Categoría y Compatibilidad (`APLICA A`).
   - Selectores desplegables dedicados para **MARCA**, **MODELO** y **APLICA A (Compatibilidad)** + interruptor **"Solo con Stock disponible"**.
3. **Stock Conectado a `EXIST_VIRTUAL` y Privacidad de Ubicación:**
   - Muestra estrictamente la disponibilidad de la columna **`EXIST_VIRTUAL`**.
   - **Oculta al 100% la columna `UBICACION`** (pasillo/estante) tanto en las tarjetas como en el buscador y en la ficha técnica.
4. **Modal de Ficha Técnica Completa y Galería de Google Drive:**
   - Al tocar cualquier repuesto se abre su ficha detallada con carrusel de fotografías de Google Drive (con fallback automático al logo de la marca o IMB Movilidad), botón para copiar el código SKU y tabla de especificaciones.

---

## 🗂️ Estructura de Archivos

```text
Catalogo IMB Movilidad/
├── index.html                  # Portal Web y entrada principal PWA
├── catalogo.js                 # Lógica ES6+, filtros por marca/modelo/aplica y visor de ficha
├── manifest.json               # Manifiesto PWA con nombre e ícono IMB Movilidad
├── sw.js                       # Service Worker independiente (imb-catalogo-general-v1)
├── css/
│   └── catalogo.css            # Estilos corporativos IMB Movilidad
└── assets/
    ├── logo-imb.jpg            # Logotipo principal IMB Movilidad
    ├── logo-gac.png            # Logotipo oficial GAC Motors
    ├── logo-dfsk.png           # Logotipo oficial DFSK
    ├── logo-shineray.png       # Logotipo oficial Shineray
    ├── icon-192.png            # Ícono PWA 192x192 (IMB Movilidad)
    └── icon-512.png            # Ícono PWA 512x512 (IMB Movilidad)
```

