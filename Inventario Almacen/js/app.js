/**
 * PROYECTO: Sistema de Chequeo de Inventario y Almacen - GAC Motors
 * DESARROLLO & ARQUITECTURA: Victor Solorzano
 * ASISTENCIA TECNICA: OpenCode for Obsidian & Antigravity IDE
 * ROL: Logica del Frontend, Sincronizacion Apps Script, PWA, Camara y Compresion
 */

// ==========================================
// CONFIGURACION GENERAL Y URL PERMANENTE
// ==========================================
// Esta URL queda fija y predeterminada en el codigo.
// Al abrir la App en cualquier dispositivo nuevo (celular, tablet o PC),
// se conectara y sincronizara de inmediato sin solicitar la URL.
const PERMANENT_GAS_URL = "https://script.google.com/macros/s/AKfycbwMoaiBbM5dCNo-iwD1XzuxOCvqTAFx5hsGEuL_y71lfitdzDf1dDkNJdBeRm-TUL-z/exec";

// ==========================================
// ESTADO GLOBAL DE LA APLICACION
// ==========================================
const AppState = {
  appsScriptUrl: localStorage.getItem("gac_apps_script_url") || PERMANENT_GAS_URL,
  theme: localStorage.getItem("gac_theme") || "dark",
  filterData: {
    categorias: [],
    metricas: [],
    aplicaA: [],
    cascade: {}
  },
  currentItem: null,
  currentRowIndex: null,
  formulaFields: [],
  selectedAplicaATags: [],
  existingPhotos: [],
  pendingNewPhotos: [], // Array de { base64, previewUrl, index }
  mediaStream: null,
  cameraFacingMode: "environment", // "environment" o "user"
  cameraTarget: "main" // "main" o "newItem"
};

// ==========================================
// INICIALIZACION AL CARGAR EL DOM
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initServiceWorker();
  initEventListeners();
  loadSavedSettings();

  if (AppState.appsScriptUrl && AppState.appsScriptUrl.trim() !== "") {
    fetchCatalogFilters();
  } else {
    showToast("Por favor configure la URL de Apps Script en ⚙️ para comenzar.", "info");
    openModal("settingsModal");
  }
});

// ==========================================
// TEMA DARK / LIGHT
// ==========================================
function initTheme() {
  document.documentElement.setAttribute("data-theme", AppState.theme);
  updateThemeIcon();

  const themeBtn = document.getElementById("themeToggleBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      AppState.theme = AppState.theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", AppState.theme);
      localStorage.setItem("gac_theme", AppState.theme);
      updateThemeIcon();
    });
  }
}

function updateThemeIcon() {
  const icon = document.getElementById("themeIcon");
  if (icon) {
    icon.textContent = AppState.theme === "dark" ? "☀️" : "🌙";
  }
}

// ==========================================
// REGISTRO DE SERVICE WORKER (PWA)
// ==========================================
function initServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("GAC PWA Service Worker registrado:", reg.scope))
      .catch((err) => console.warn("Error registrando Service Worker:", err));
  }
}

// ==========================================
// CONFIGURACION Y URL APPS SCRIPT
// ==========================================
function loadSavedSettings() {
  const input = document.getElementById("appsScriptUrlInput");
  if (input) {
    input.value = AppState.appsScriptUrl || PERMANENT_GAS_URL || "";
  }
}

function saveSettings() {
  const input = document.getElementById("appsScriptUrlInput");
  const url = input.value.trim();

  if (!url || !url.startsWith("https://script.google.com/")) {
    showToast("Ingrese una URL valida de Google Apps Script.", "error");
    return;
  }

  AppState.appsScriptUrl = url;
  localStorage.setItem("gac_apps_script_url", url);
  showToast("Configuración guardada exitosamente.", "success");
  closeModal("settingsModal");
  fetchCatalogFilters();
}

async function testConnection() {
  const input = document.getElementById("appsScriptUrlInput");
  const url = input.value.trim();
  if (!url) {
    showToast("Ingrese una URL antes de probar.", "error");
    return;
  }

  const btn = document.getElementById("btnTestConnection");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Probando...`;

  try {
    const res = await fetch(url + "?action=test");
    const data = await res.json();
    if (data && data.success) {
      showToast("¡Conexión exitosa con Google Apps Script!", "success");
    } else {
      showToast("Respuesta recibida pero con error: " + (data.error || "Desconocido"), "error");
    }
  } catch (err) {
    showToast("Fallo al conectar con la URL: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Probar Conexión";
  }
}

// ==========================================
// CARGA DE FILTROS DESDE "BASE_DATOS"
// ==========================================
async function fetchCatalogFilters() {
  if (!AppState.appsScriptUrl) return;

  try {
    const res = await fetch(`${AppState.appsScriptUrl}?action=getFilters`);
    const result = await res.json();

    if (result && result.success) {
      AppState.filterData = {
        categorias: result.categorias || [],
        metricas: result.metricas || [],
        aplicaA: result.aplicaA || [],
        cascade: result.cascade || {}
      };

      populateInitialDropdowns();
      console.log("Filtros de Base_Datos cargados exitosamente.");
    } else {
      console.warn("No se pudieron cargar los filtros:", result.error);
    }
  } catch (err) {
    console.error("Error al cargar filtros:", err);
  }
}

function populateInitialDropdowns() {
  // Categorias
  const catSelect = document.getElementById("field_CATEGORIA");
  const newCatSelect = document.getElementById("new_CATEGORIA");
  populateSelect(catSelect, AppState.filterData.categorias);
  populateSelect(newCatSelect, AppState.filterData.categorias);

  // Metricas
  const metSelect = document.getElementById("field_METRICA");
  const newMetSelect = document.getElementById("new_METRICA");
  populateSelect(metSelect, AppState.filterData.metricas);
  populateSelect(newMetSelect, AppState.filterData.metricas);

  // Marcas
  const marcas = Object.keys(AppState.filterData.cascade).sort();
  const marcaSelect = document.getElementById("field_MARCA");
  const newMarcaSelect = document.getElementById("new_MARCA");
  populateSelect(marcaSelect, marcas);
  populateSelect(newMarcaSelect, marcas);

  // Aplica A selector dropdown
  const aplicaSelect = document.getElementById("aplicaASelectDropdown");
  populateSelect(aplicaSelect, AppState.filterData.aplicaA);
}

function populateSelect(selectElement, optionsArray, selectedVal = "") {
  if (!selectElement) return;
  const firstOption = selectElement.options[0] ? selectElement.options[0].text : "-- Seleccione --";
  selectElement.innerHTML = `<option value="">${firstOption}</option>`;

  optionsArray.forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt;
    el.textContent = opt;
    if (opt === selectedVal) el.selected = true;
    selectElement.appendChild(el);
  });
}

// ==========================================
// CASCADA REACTIVA: MARCA -> SERIE -> MODELO -> VERSION
// ==========================================
function setupCascadingListeners(prefix = "field_") {
  const marcaEl = document.getElementById(`${prefix}MARCA`);
  const serieEl = document.getElementById(`${prefix}SERIE`);
  const modeloEl = document.getElementById(`${prefix}MODELO`);
  const versionEl = document.getElementById(`${prefix}VERSION`);

  if (!marcaEl) return;

  // Al cambiar MARCA
  marcaEl.addEventListener("change", () => {
    const marca = marcaEl.value;
    const seriesObj = AppState.filterData.cascade[marca] || {};
    const series = Object.keys(seriesObj).sort();

    populateSelect(serieEl, series);
    serieEl.disabled = series.length === 0;

    // Resetear inferiores
    populateSelect(modeloEl, []);
    modeloEl.disabled = true;
    populateSelect(versionEl, []);
    versionEl.disabled = true;
  });

  // Al cambiar SERIE
  serieEl.addEventListener("change", () => {
    const marca = marcaEl.value;
    const serie = serieEl.value;
    const modelosObj = (AppState.filterData.cascade[marca] && AppState.filterData.cascade[marca][serie]) || {};
    const modelos = Object.keys(modelosObj).sort();

    populateSelect(modeloEl, modelos);
    modeloEl.disabled = modelos.length === 0;

    // Resetear inferior
    populateSelect(versionEl, []);
    versionEl.disabled = true;
  });

  // Al cambiar MODELO
  modeloEl.addEventListener("change", () => {
    const marca = marcaEl.value;
    const serie = serieEl.value;
    const modelo = modeloEl.value;
    const versiones = (AppState.filterData.cascade[marca] &&
      AppState.filterData.cascade[marca][serie] &&
      AppState.filterData.cascade[marca][serie][modelo]) || [];

    populateSelect(versionEl, versiones);
    versionEl.disabled = versiones.length === 0;
  });
}

// Sincroniza en cascada un conjunto de valores cargados desde el servidor
function setCascadingValues(marca, serie, modelo, version, prefix = "field_") {
  const marcaEl = document.getElementById(`${prefix}MARCA`);
  const serieEl = document.getElementById(`${prefix}SERIE`);
  const modeloEl = document.getElementById(`${prefix}MODELO`);
  const versionEl = document.getElementById(`${prefix}VERSION`);

  // Marcas
  if (marca) {
    marcaEl.value = marca;
    const seriesObj = AppState.filterData.cascade[marca] || {};
    const series = Object.keys(seriesObj).sort();
    populateSelect(serieEl, series, serie);
    serieEl.disabled = false;
  }

  // Serie
  if (serie && marca) {
    serieEl.value = serie;
    const modelosObj = (AppState.filterData.cascade[marca] && AppState.filterData.cascade[marca][serie]) || {};
    const modelos = Object.keys(modelosObj).sort();
    populateSelect(modeloEl, modelos, modelo);
    modeloEl.disabled = false;
  }

  // Modelo
  if (modelo && serie && marca) {
    modeloEl.value = modelo;
    const versiones = (AppState.filterData.cascade[marca] &&
      AppState.filterData.cascade[marca][serie] &&
      AppState.filterData.cascade[marca][serie][modelo]) || [];
    populateSelect(versionEl, versiones, version);
    versionEl.disabled = false;
  }

  // Version
  if (version) {
    versionEl.value = version;
  }
}

// ==========================================
// BUSQUEDA DE ARTICULO
// ==========================================
async function searchItem() {
  const input = document.getElementById("searchArticuloInput");
  const query = input.value.trim();

  if (!query) {
    showToast("Ingrese un código de ARTICULO a buscar.", "info");
    return;
  }

  if (!AppState.appsScriptUrl) {
    showToast("Configure la URL de Apps Script en ⚙️.", "error");
    openModal("settingsModal");
    return;
  }

  const btnSearch = document.getElementById("btnSearch");
  const syncBadge = document.getElementById("syncStatusBadge");

  btnSearch.disabled = true;
  btnSearch.innerHTML = `<span class="spinner"></span> Buscando...`;
  syncBadge.className = "status-badge";
  syncBadge.textContent = "⏳ Conectando...";

  try {
    const res = await fetch(`${AppState.appsScriptUrl}?action=search&query=${encodeURIComponent(query)}`);
    const result = await res.json();

    if (result && result.success && result.found) {
      loadItemIntoForm(result);
      showToast(`Artículo '${query}' cargado correctamente.`, "success");
      syncBadge.className = "status-badge status-sync";
      syncBadge.textContent = "✅ Sincronizado";
    } else {
      syncBadge.className = "status-badge";
      syncBadge.style.background = "rgba(248,81,73,0.2)";
      syncBadge.style.color = "#f85149";
      syncBadge.textContent = "❌ No encontrado";

      const createConfirm = confirm(`El artículo "${query}" no existe en el inventario.\n\n¿Desea registrarlo como un NUEVO artículo?`);
      if (createConfirm) {
        openNewItemModalWithCode(query);
      }
    }
  } catch (err) {
    showToast("Error en la búsqueda: " + err.message, "error");
    syncBadge.textContent = "⚠️ Error de red";
  } finally {
    btnSearch.disabled = false;
    btnSearch.innerHTML = `<span>Buscar</span>`;
  }
}

function loadItemIntoForm(result) {
  const d = result.data;
  AppState.currentItem = d;
  AppState.currentRowIndex = result.rowIndex;
  AppState.formulaFields = result.formulaFields || [];
  AppState.pendingNewPhotos = [];

  // Encabezado
  document.getElementById("displayArticuloBadge").textContent = `ART: ${d["ARTICULO"] || "---"}`;
  document.getElementById("displayArticuloTitle").textContent = d["DESCRIPCION"] || "(Sin Descripción)";

  // Campos Solo Lectura
  document.getElementById("field_EXIST_VIRTUAL").value = d["EXIST_VIRTUAL"] !== undefined ? d["EXIST_VIRTUAL"] : "0";
  document.getElementById("field_N_PARTE_archivo").value = d["N# PARTE archivo"] || "";

  // Campos Editables Principales
  document.getElementById("field_EXIST_FISICA").value = d["EXIST_FISICA"] !== undefined ? d["EXIST_FISICA"] : "0";
  document.getElementById("field_UBICACION").value = d["UBICACION"] || "";
  document.getElementById("field_DESCRIPCION").value = d["DESCRIPCION"] || "";
  document.getElementById("field_N_PARTE_2_descripcion").value = d["N# PARTE 2 descripcion"] || "";
  document.getElementById("field_CATEGORIA").value = d["CATEGORIA"] || "";
  document.getElementById("field_METRICA").value = d["METRICA"] || "";

  // Cascada: MARCA, SERIE, MODELO, VERSION
  setCascadingValues(d["MARCA"] || "", d["SERIE"] || "", d["MODELO"] || "", d["VERSION"] || "");

  // APLICA A (Tags múltiples)
  AppState.selectedAplicaATags = [];
  if (d["APLICA A"]) {
    AppState.selectedAplicaATags = d["APLICA A"]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  renderAplicaATags();

  // FOTOS
  AppState.existingPhotos = [];
  if (d["FOTOS"]) {
    AppState.existingPhotos = d["FOTOS"]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  renderPhotosGrid();

  // Habilitar boton de guardar
  document.getElementById("btnSaveItem").disabled = false;
}

// ==========================================
// GESTION DE CHIPS / MULTI-SELECT "APLICA A"
// ==========================================
function renderAplicaATags() {
  const box = document.getElementById("aplicaATagsBox");
  box.innerHTML = "";

  if (AppState.selectedAplicaATags.length === 0) {
    box.innerHTML = `<span style="color:var(--text-muted); font-size:0.85rem; padding:4px 6px;">Sin aplicaciones asignadas. Seleccione abajo para añadir.</span>`;
    return;
  }

  AppState.selectedAplicaATags.forEach((tag, idx) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.innerHTML = `
      <span>${escapeHtml(tag)}</span>
      <button type="button" class="tag-remove-btn" data-index="${idx}" title="Eliminar">&times;</button>
    `;
    box.appendChild(chip);
  });

  box.querySelectorAll(".tag-remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.getAttribute("data-index"), 10);
      AppState.selectedAplicaATags.splice(idx, 1);
      renderAplicaATags();
    });
  });
}

function addAplicaATag() {
  const dropdown = document.getElementById("aplicaASelectDropdown");
  const val = dropdown.value.trim();
  if (!val) return;

  if (!AppState.selectedAplicaATags.includes(val)) {
    AppState.selectedAplicaATags.push(val);
    renderAplicaATags();
  }
  dropdown.value = "";
}

// ==========================================
// COMPRESION Y OPTIMIZACION DE IMAGENES
// ==========================================
/**
 * Comprime cualquier archivo de imagen en el cliente usando HTML5 Canvas.
 * Limita dimensiones a max 1600px y convierte a JPEG con calidad 0.80.
 * Reduce fotos de 8-10MB a 150-250KB manteniendo nitidez en etiquetas y números de pieza.
 */
function compressImageFile(file, maxDimension = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({
          dataUrl: dataUrl,
          base64: dataUrl.split(",")[1],
          mimeType: "image/jpeg"
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ==========================================
// ==========================================
// HELPERS PARA FOTOS DE GOOGLE DRIVE
// ==========================================
function extractDriveFileId(url) {
  if (!url) return "";
  const match = url.toString().match(/(?:id=|\/d\/|export=view&id=)([a-zA-Z0-9_-]{25,})/);
  return match ? match[1] : "";
}

function formatDriveImageUrl(url) {
  if (!url) return "";
  const trimmed = url.toString().trim();
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  const fileId = extractDriveFileId(trimmed);
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  }
  return trimmed;
}

// ==========================================
// GESTION DE FOTOS (RENDER, CAMARA Y GALERIA)
// ==========================================
function renderPhotosGrid() {
  const grid = document.getElementById("photosGrid");
  grid.innerHTML = "";

  const totalPhotos = AppState.existingPhotos.length + AppState.pendingNewPhotos.length;

  if (totalPhotos === 0) {
    grid.innerHTML = `<div class="no-photos-msg">No hay fotografías registradas para este artículo.</div>`;
    return;
  }

  // Fotos ya existentes en Google Drive
  AppState.existingPhotos.forEach((url, idx) => {
    const card = document.createElement("div");
    card.className = "photo-card";
    const displayUrl = formatDriveImageUrl(url);
    card.innerHTML = `
      <img src="${displayUrl}" alt="Foto ${idx + 1}" loading="lazy" />
      <span class="photo-badge-idx">#${idx + 1}</span>
      <button type="button" class="photo-delete-btn" title="Eliminar foto" data-type="existing" data-idx="${idx}">&times;</button>
    `;
    const imgEl = card.querySelector("img");
    imgEl.onerror = function () {
      const fileId = extractDriveFileId(url);
      if (fileId && !this.src.includes("googleusercontent")) {
        this.src = `https://lh3.googleusercontent.com/d/${fileId}`;
      }
    };
    imgEl.addEventListener("click", () => openPhotoViewer(displayUrl, `Foto #${idx + 1}`));
    grid.appendChild(card);
  });

  // Fotos nuevas pendientes por subir
  AppState.pendingNewPhotos.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "photo-card";
    const overallIdx = AppState.existingPhotos.length + idx + 1;
    card.innerHTML = `
      <img src="${item.previewUrl}" alt="Nueva foto ${overallIdx}" />
      <span class="photo-badge-idx" style="background:#238636;">+ #${overallIdx} (Nueva)</span>
      <button type="button" class="photo-delete-btn" title="Eliminar" data-type="pending" data-idx="${idx}">&times;</button>
    `;
    card.querySelector("img").addEventListener("click", () => openPhotoViewer(item.previewUrl, `Nueva Foto #${overallIdx}`));
    grid.appendChild(card);
  });

  // Eventos de borrado
  grid.querySelectorAll(".photo-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const type = e.target.getAttribute("data-type");
      const idx = parseInt(e.target.getAttribute("data-idx"), 10);
      if (type === "existing") {
        if (confirm("¿Desea remover el enlace de esta fotografía existente?")) {
          AppState.existingPhotos.splice(idx, 1);
          renderPhotosGrid();
        }
      } else {
        AppState.pendingNewPhotos.splice(idx, 1);
        renderPhotosGrid();
      }
    });
  });
}

function openPhotoViewer(src, title) {
  document.getElementById("photoViewerImg").src = src;
  document.getElementById("photoViewerTitle").textContent = title;
  openModal("photoViewerModal");
}

// Manejo de archivos desde el input Galeria/PC
async function handleGalleryFiles(e) {
  const files = Array.from(e.target.files);
  if (!files || files.length === 0) return;

  showToast(`Procesando y comprimiendo ${files.length} imagen(es)...`, "info");

  for (let i = 0; i < files.length; i++) {
    try {
      const compressed = await compressImageFile(files[i]);
      const nextIndex = AppState.existingPhotos.length + AppState.pendingNewPhotos.length + 1;
      AppState.pendingNewPhotos.push({
        base64: compressed.base64,
        previewUrl: compressed.dataUrl,
        index: nextIndex
      });
    } catch (err) {
      console.error("Error comprimiendo imagen:", err);
      showToast("Error al procesar una imagen: " + err.message, "error");
    }
  }

  renderPhotosGrid();
  e.target.value = ""; // Limpiar input
  showToast("Fotografías listas para ser subidas al guardar.", "success");
}

// ==========================================
// MODULO DE CAMARA (Móviles / Tablets / PC)
// ==========================================
async function openCameraModal(target = "main") {
  AppState.cameraTarget = typeof target === "string" ? target : "main";
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (AppState.cameraTarget === "newItem") {
      document.getElementById("newFileGalleryInput").click();
    } else {
      document.getElementById("fileGalleryInput").click();
    }
    return;
  }

  openModal("cameraModal");
  startCameraStream();
}

async function startCameraStream() {
  stopCameraStream();
  const video = document.getElementById("cameraVideo");

  try {
    const constraints = {
      video: {
        facingMode: { ideal: AppState.cameraFacingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    AppState.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = AppState.mediaStream;
    video.onloadedmetadata = () => {
      video.play().catch((e) => console.warn("Video play:", e));
    };
  } catch (err) {
    console.warn("No se pudo iniciar camara ideal, intentando modo estandar:", err);
    try {
      AppState.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = AppState.mediaStream;
      video.onloadedmetadata = () => {
        video.play().catch((e) => console.warn("Video play:", e));
      };
    } catch (finalErr) {
      showToast("No se pudo acceder a la cámara: " + finalErr.message, "error");
      closeModal("cameraModal");
    }
  }
}

function stopCameraStream() {
  if (AppState.mediaStream) {
    AppState.mediaStream.getTracks().forEach((track) => track.stop());
    AppState.mediaStream = null;
  }
}

function takeCameraSnapshot() {
  const video = document.getElementById("cameraVideo");
  if (!video || !video.videoWidth || video.readyState < 2) {
    showToast("Por favor espere a que la cámara inicialice el video.", "info");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Comprimir a JPEG 1600px max, 0.8 de calidad
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

  if (AppState.cameraTarget === "newItem") {
    const nextIndex = pendingNewModalPhotos.length + 1;
    pendingNewModalPhotos.push({
      base64: dataUrl.split(",")[1],
      previewUrl: dataUrl,
      index: nextIndex
    });
    renderNewItemPhotosGrid();
  } else {
    const nextIndex = AppState.existingPhotos.length + AppState.pendingNewPhotos.length + 1;
    AppState.pendingNewPhotos.push({
      base64: dataUrl.split(",")[1],
      previewUrl: dataUrl,
      index: nextIndex
    });
    renderPhotosGrid();
  }

  stopCameraStream();
  closeModal("cameraModal");
  showToast("Foto capturada con éxito.", "success");
}

function switchCameraFacing() {
  AppState.cameraFacingMode = AppState.cameraFacingMode === "environment" ? "user" : "environment";
  startCameraStream();
}

// ==========================================
// GUARDAR CAMBIOS (BOTON "GUARDAR")
// ==========================================
async function saveCurrentItem() {
  if (!AppState.currentItem || !AppState.currentRowIndex) {
    showToast("No hay artículo activo para guardar.", "error");
    return;
  }

  const btnSave = document.getElementById("btnSaveItem");
  btnSave.disabled = true;
  btnSave.innerHTML = `<span class="spinner"></span> Guardando en Google Sheets...`;

  // Construir objeto de datos
  const payloadData = {
    ARTICULO: AppState.currentItem["ARTICULO"],
    DESCRIPCION: document.getElementById("field_DESCRIPCION").value.trim(),
    CATEGORIA: document.getElementById("field_CATEGORIA").value,
    "N# PARTE 2 descripcion": document.getElementById("field_N_PARTE_2_descripcion").value.trim(),
    UBICACION: document.getElementById("field_UBICACION").value.trim(),
    MARCA: document.getElementById("field_MARCA").value,
    SERIE: document.getElementById("field_SERIE").value,
    MODELO: document.getElementById("field_MODELO").value,
    VERSION: document.getElementById("field_VERSION").value,
    "APLICA A": AppState.selectedAplicaATags.join(", "),
    METRICA: document.getElementById("field_METRICA").value,
    EXIST_FISICA: document.getElementById("field_EXIST_FISICA").value,
    FOTOS: AppState.existingPhotos.join(", ")
  };

  const payload = {
    action: "saveItem",
    rowIndex: AppState.currentRowIndex,
    data: payloadData,
    newPhotos: AppState.pendingNewPhotos.map((p, idx) => ({
      base64: p.base64,
      index: AppState.existingPhotos.length + idx + 1
    }))
  };

  try {
    const res = await fetch(AppState.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" }, // text/plain previene preflight CORS innecesario en Apps Script
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (result && result.success) {
      // Animacion de destello y exito
      btnSave.classList.add("save-success-animation");
      showToast("¡Inventario actualizado y guardado exitosamente!", "success");

      // Refrescar estado de sincronización
      document.getElementById("syncStatusBadge").className = "status-badge status-sync";
      document.getElementById("syncStatusBadge").textContent = "✅ Guardado";

      // Limpiar formulario y enfocar buscador tras 1.2 segundos para nueva consulta
      setTimeout(() => {
        btnSave.classList.remove("save-success-animation");
        resetForm();
        showToast("Listo para consultar el siguiente artículo.", "info");
      }, 1200);
    } else {
      showToast("Error al guardar: " + (result.error || "Desconocido"), "error");
    }
  } catch (err) {
    showToast("Error de comunicación: " + err.message, "error");
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = `<span>💾 GUARDAR CAMBIOS</span>`;
  }
}

// ==========================================
// REINICIAR Y LIMPIAR FORMULARIO
// ==========================================
function resetForm() {
  AppState.currentItem = null;
  AppState.currentRowIndex = null;
  AppState.formulaFields = [];
  AppState.selectedAplicaATags = [];
  AppState.existingPhotos = [];
  AppState.pendingNewPhotos = [];

  // Limpiar buscador y enfocar para el siguiente escaneo
  const searchInput = document.getElementById("searchArticuloInput");
  if (searchInput) {
    searchInput.value = "";
    searchInput.focus();
  }

  // Restablecer encabezado
  document.getElementById("displayArticuloBadge").textContent = "ARTICULO";
  document.getElementById("displayArticuloTitle").textContent = "Consulte un artículo para comenzar";
  document.getElementById("syncStatusBadge").className = "status-badge status-sync";
  document.getElementById("syncStatusBadge").textContent = "⚡ Listo para chequear";

  // Limpiar campos de texto y numeros
  document.getElementById("field_EXIST_VIRTUAL").value = "";
  document.getElementById("field_EXIST_FISICA").value = "";
  document.getElementById("field_UBICACION").value = "";
  document.getElementById("field_DESCRIPCION").value = "";
  document.getElementById("field_N_PARTE_archivo").value = "";
  document.getElementById("field_N_PARTE_2_descripcion").value = "";
  document.getElementById("field_CATEGORIA").value = "";
  document.getElementById("field_METRICA").value = "";
  document.getElementById("field_MARCA").value = "";

  // Reset selectores en cascada
  populateSelect(document.getElementById("field_SERIE"), []);
  document.getElementById("field_SERIE").disabled = true;
  populateSelect(document.getElementById("field_MODELO"), []);
  document.getElementById("field_MODELO").disabled = true;
  populateSelect(document.getElementById("field_VERSION"), []);
  document.getElementById("field_VERSION").disabled = true;

  // Renderizar vacios
  renderAplicaATags();
  renderPhotosGrid();

  // Deshabilitar boton guardar hasta que se consulte un articulo
  document.getElementById("btnSaveItem").disabled = true;
}

// ==========================================
// MODAL: NUEVO ARTICULO
// ==========================================
let pendingNewModalPhotos = [];

function openNewItemModalWithCode(code = "") {
  document.getElementById("new_ARTICULO").value = code;
  document.getElementById("new_DESCRIPCION").value = "";
  document.getElementById("new_N_PARTE_2_descripcion").value = "";
  document.getElementById("new_UBICACION").value = "";
  document.getElementById("new_EXIST_FISICA").value = "0";
  pendingNewModalPhotos = [];
  renderNewItemPhotosGrid();

  openModal("newItemModal");
}

function renderNewItemPhotosGrid() {
  const grid = document.getElementById("newPhotosGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (pendingNewModalPhotos.length === 0) {
    grid.innerHTML = `<div class="no-photos-msg">No hay fotografías seleccionadas para este nuevo artículo.</div>`;
    return;
  }

  pendingNewModalPhotos.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "photo-card";
    card.innerHTML = `
      <img src="${item.previewUrl}" alt="Foto ${idx + 1}" />
      <span class="photo-badge-idx" style="background:#238636;">#${idx + 1}</span>
      <button type="button" class="photo-delete-btn" title="Eliminar" data-idx="${idx}">&times;</button>
    `;
    card.querySelector("img").addEventListener("click", () => openPhotoViewer(item.previewUrl, `Foto #${idx + 1} (Nuevo Artículo)`));
    grid.appendChild(card);
  });

  grid.querySelectorAll(".photo-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.getAttribute("data-idx"), 10);
      pendingNewModalPhotos.splice(idx, 1);
      pendingNewModalPhotos.forEach((p, i) => (p.index = i + 1));
      renderNewItemPhotosGrid();
    });
  });
}

async function handleNewItemGalleryFiles(e) {
  const files = Array.from(e.target.files);
  if (!files || files.length === 0) return;

  showToast(`Procesando y comprimiendo ${files.length} imagen(es)...`, "info");

  for (let i = 0; i < files.length; i++) {
    try {
      const comp = await compressImageFile(files[i]);
      pendingNewModalPhotos.push({
        base64: comp.base64,
        previewUrl: comp.dataUrl,
        index: pendingNewModalPhotos.length + 1
      });
    } catch (err) {
      console.warn("Error comprimiendo foto nuevo item:", err);
    }
  }

  renderNewItemPhotosGrid();
  e.target.value = "";
  showToast("Fotografías listas para ser registradas.", "success");
}

async function saveNewItem() {
  const artCode = document.getElementById("new_ARTICULO").value.trim();
  const desc = document.getElementById("new_DESCRIPCION").value.trim();

  if (!artCode || !desc) {
    showToast("El código de ARTÍCULO y la DESCRIPCIÓN son obligatorios.", "error");
    return;
  }

  const btn = document.getElementById("btnSaveNewItem");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Registrando...`;

  const data = {
    ARTICULO: artCode,
    DESCRIPCION: desc,
    CATEGORIA: document.getElementById("new_CATEGORIA").value,
    "N# PARTE archivo": "",
    "N# PARTE 2 descripcion": document.getElementById("new_N_PARTE_2_descripcion").value.trim(),
    UBICACION: document.getElementById("new_UBICACION").value.trim(),
    MARCA: document.getElementById("new_MARCA").value,
    SERIE: document.getElementById("new_SERIE").value,
    MODELO: document.getElementById("new_MODELO").value,
    VERSION: document.getElementById("new_VERSION").value,
    METRICA: document.getElementById("new_METRICA").value,
    EXIST_VIRTUAL: "0",
    EXIST_FISICA: document.getElementById("new_EXIST_FISICA").value,
    "APLICA A": "",
    FOTOS: ""
  };

  const payload = {
    action: "createItem",
    data: data,
    newPhotos: pendingNewModalPhotos
  };

  try {
    const res = await fetch(AppState.appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result && result.success) {
      showToast("¡Nuevo repuesto registrado correctamente!", "success");
      closeModal("newItemModal");
      document.getElementById("searchArticuloInput").value = artCode;
      searchItem();
    } else {
      showToast("Error al registrar: " + (result.error || "Desconocido"), "error");
    }
  } catch (err) {
    showToast("Error de comunicación: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Registrar en Inventario";
  }
}

// ==========================================
// ASIGNACION DE EVENTOS DOM
// ==========================================
function initEventListeners() {
  // Busqueda
  document.getElementById("btnSearch").addEventListener("click", searchItem);
  document.getElementById("searchArticuloInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchItem();
    }
  });

  // Modal Settings
  document.getElementById("settingsBtn").addEventListener("click", () => openModal("settingsModal"));
  document.getElementById("closeSettingsModal").addEventListener("click", () => closeModal("settingsModal"));
  document.getElementById("btnSaveSettings").addEventListener("click", saveSettings);
  document.getElementById("btnTestConnection").addEventListener("click", testConnection);

  // Guardar Cambios
  document.getElementById("btnSaveItem").addEventListener("click", saveCurrentItem);

  // Aplica A
  document.getElementById("btnAddAplicaA").addEventListener("click", addAplicaATag);

  // Camara y Fotos (Articulo Principal)
  document.getElementById("btnCaptureCamera").addEventListener("click", () => openCameraModal("main"));
  document.getElementById("closeCameraModal").addEventListener("click", () => {
    stopCameraStream();
    closeModal("cameraModal");
  });
  document.getElementById("btnTakeSnap").addEventListener("click", takeCameraSnapshot);
  document.getElementById("btnSwitchCamera").addEventListener("click", switchCameraFacing);
  document.getElementById("fileGalleryInput").addEventListener("change", handleGalleryFiles);

  // Visor de Foto Completa
  document.getElementById("closePhotoViewerModal").addEventListener("click", () => closeModal("photoViewerModal"));

  // Modal Nuevo Articulo
  document.getElementById("btnOpenNewModal").addEventListener("click", () => openNewItemModalWithCode(""));
  document.getElementById("closeNewItemModal").addEventListener("click", () => closeModal("newItemModal"));
  document.getElementById("btnCancelNewItem").addEventListener("click", () => closeModal("newItemModal"));
  document.getElementById("btnSaveNewItem").addEventListener("click", saveNewItem);
  document.getElementById("btnCaptureCameraNewItem").addEventListener("click", () => openCameraModal("newItem"));
  document.getElementById("newFileGalleryInput").addEventListener("change", handleNewItemGalleryFiles);

  // Cascadas
  setupCascadingListeners("field_");
  setupCascadingListeners("new_");

  // Cerrar modales haciendo click fuera del contenedor
  document.querySelectorAll(".modal-backdrop").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        if (modal.id === "cameraModal") stopCameraStream();
        closeModal(modal.id);
      }
    });
  });
}

// ==========================================
// HELPERS MODALES Y TOASTS
// ==========================================
function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add("active");
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove("active");
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: "✅",
    error: "❌",
    info: "ℹ️"
  };

  toast.innerHTML = `
    <span>${iconMap[type] || "ℹ️"}</span>
    <span style="flex:1;">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return "";
  return str.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
