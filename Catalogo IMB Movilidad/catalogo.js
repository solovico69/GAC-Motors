/**
 * PROYECTO: Catálogo General IMB Movilidad
 * DESARROLLO & ARQUITECTURA: Victor Solorzano
 * ASISTENCIA TÉCNICA: OpenCode for Obsidian & Antigravity IDE
 * ROL: Controlador Frontend ES6 (Buscador Multi-Campo, Filtros por Marca/Modelo/Aplica, Stock EXIST_VIRTUAL y Ficha Técnica)
 */

// ==========================================
// CONFIGURACIÓN Y URL DE GOOGLE APPS SCRIPT
// ==========================================
const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwMoaiBbM5dCNo-iwD1XzuxOCvqTAFx5hsGEuL_y71lfitdzDf1dDkNJdBeRm-TUL-z/exec";

const PAGE_STEP = 120;

// ==========================================
// ESTADO REACTIVO DEL CATÁLOGO
// ==========================================
const CatalogoState = {
  gasUrl: localStorage.getItem("imb_catalogo_gas_url") || DEFAULT_GAS_URL,
  deferredInstallPrompt: null,

  // Datos crudos y filtrados de la pestaña Repuestos
  catalog: [],
  filteredCatalog: [],
  visibleLimit: PAGE_STEP,

  // Galería y repuesto activo en el Modal de Ficha Técnica
  activeItem: null,
  previewGallery: [],
  previewIndex: 0
};

// ==========================================
// INICIALIZACIÓN AL CARGAR EL DOM
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initServiceWorkerAndInstall();
  bindUIEvents();
  fetchCatalog(false);
});

// ==========================================
// PWA: SERVICE WORKER E INSTALACIÓN NATIVA
// ==========================================
function initServiceWorkerAndInstall() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("PWA Catálogo IMB Service Worker registrado:", reg.scope))
      .catch((err) => console.warn("Error al registrar Service Worker:", err));
  }

  const btnInstall = document.getElementById("btnInstallPwa");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    CatalogoState.deferredInstallPrompt = e;
    if (btnInstall) {
      btnInstall.classList.remove("hidden");
      btnInstall.classList.add("flex");
    }
  });

  if (btnInstall) {
    btnInstall.addEventListener("click", async () => {
      if (!CatalogoState.deferredInstallPrompt) return;
      CatalogoState.deferredInstallPrompt.prompt();
      const { outcome } = await CatalogoState.deferredInstallPrompt.userChoice;
      if (outcome === "accepted") {
        btnInstall.classList.add("hidden");
      }
      CatalogoState.deferredInstallPrompt = null;
    });
  }
}

// ==========================================
// EVENTOS DE INTERFAZ Y NAVEGACIÓN
// ==========================================
function bindUIEvents() {
  // Click en el logo/título principal limpia filtros y vuelve al tope
  document.getElementById("btnHeaderReset")?.addEventListener("click", (e) => {
    e.preventDefault();
    resetAllFilters();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Botón Actualizar Catálogo
  document.getElementById("btnRefreshCatalog")?.addEventListener("click", () => {
    fetchCatalog(true);
  });

  // Cintillo Superior de Marcas Oficiales (Todas, GAC, DFSK, SHINERAY)
  document.querySelectorAll("[data-brand-card]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const brand = btn.getAttribute("data-brand-card") || "";
      selectOfficialBrandFilter(brand);
    });
  });

  // Logos de Marcas en el Footer Corporativo
  document.querySelectorAll("[data-footer-brand]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const brand = btn.getAttribute("data-footer-brand") || "";
      selectOfficialBrandFilter(brand);
      document.getElementById("topCatalogo")?.scrollIntoView({ behavior: "smooth" });
    });
  });

  // Subir al buscador desde el Footer
  document.getElementById("btnFooterTop")?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Buscador Inteligente Multi-Campo
  const searchInput = document.getElementById("multiSearchInput");
  const btnClearSearch = document.getElementById("btnClearSearch");

  searchInput?.addEventListener("input", () => {
    const val = searchInput.value;
    if (btnClearSearch) {
      btnClearSearch.classList.toggle("hidden", val.length === 0);
    }
    CatalogoState.visibleLimit = PAGE_STEP;
    applyMultiFieldCatalogFilter();
  });

  btnClearSearch?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    btnClearSearch.classList.add("hidden");
    CatalogoState.visibleLimit = PAGE_STEP;
    applyMultiFieldCatalogFilter();
    searchInput?.focus();
  });

  // Switch Solo con Stock (EXIST_VIRTUAL > 0)
  document.getElementById("chkOnlyStock")?.addEventListener("change", () => {
    CatalogoState.visibleLimit = PAGE_STEP;
    applyMultiFieldCatalogFilter();
  });

  // Selectores desplegables: MARCA, MODELO y APLICA A
  document.getElementById("filterMarcaSelect")?.addEventListener("change", (e) => {
    const selectedMarca = e.target.value || "";
    syncBrandShowcaseHighlight(selectedMarca);
    CatalogoState.visibleLimit = PAGE_STEP;
    applyMultiFieldCatalogFilter();
  });

  document.getElementById("filterModeloSelect")?.addEventListener("change", () => {
    CatalogoState.visibleLimit = PAGE_STEP;
    applyMultiFieldCatalogFilter();
  });

  document.getElementById("filterAplicaASelect")?.addEventListener("change", () => {
    CatalogoState.visibleLimit = PAGE_STEP;
    applyMultiFieldCatalogFilter();
  });

  // Botón Limpiar Todos los Filtros
  document.getElementById("btnResetAllFilters")?.addEventListener("click", () => {
    resetAllFilters();
  });

  // Chips de Búsqueda Rápida
  document.querySelectorAll(".quick-filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const term = chip.getAttribute("data-quick-filter") || "";
      if (!searchInput) return;
      if (searchInput.value.trim().toUpperCase() === term.toUpperCase()) {
        searchInput.value = "";
        btnClearSearch?.classList.add("hidden");
      } else {
        searchInput.value = term;
        btnClearSearch?.classList.remove("hidden");
      }
      CatalogoState.visibleLimit = PAGE_STEP;
      applyMultiFieldCatalogFilter();
    });
  });

  // Botón Mostrar Más Repuestos
  document.getElementById("btnLoadMore")?.addEventListener("click", () => {
    CatalogoState.visibleLimit += PAGE_STEP;
    renderCatalogGrid();
  });

  // Controles del Modal de Ficha Técnica y Galería
  document.getElementById("btnClosePartModal")?.addEventListener("click", closePartDetailModal);
  document.getElementById("btnClosePartModalBottom")?.addEventListener("click", closePartDetailModal);
  document.getElementById("partDetailModal")?.addEventListener("click", (e) => {
    if (e.target.id === "partDetailModal") {
      closePartDetailModal();
    }
  });

  document.getElementById("btnPrevModalImg")?.addEventListener("click", () => {
    stepModalGallery(-1);
  });
  document.getElementById("btnNextModalImg")?.addEventListener("click", () => {
    stepModalGallery(1);
  });

  // Copiar Código SKU en el Modal
  document.getElementById("btnCopySku")?.addEventListener("click", () => {
    if (!CatalogoState.activeItem) return;
    const sku = CatalogoState.activeItem.Codigo || CatalogoState.activeItem.SKU_Articulo || "";
    if (!sku) return;
    navigator.clipboard
      ?.writeText(String(sku))
      .then(() => showToast(`Código ${sku} copiado al portapapeles`, "success"))
      .catch(() => showToast(`Código: ${sku}`, "info"));
  });

  // Navegación por teclado cuando el Modal está abierto
  document.addEventListener("keydown", (e) => {
    const modal = document.getElementById("partDetailModal");
    if (!modal || modal.classList.contains("hidden")) return;
    if (e.key === "Escape") {
      closePartDetailModal();
    } else if (e.key === "ArrowLeft") {
      stepModalGallery(-1);
    } else if (e.key === "ArrowRight") {
      stepModalGallery(1);
    }
  });

  // Modal de Configuración de URL Apps Script
  document.getElementById("btnOpenSettings")?.addEventListener("click", () => {
    const input = document.getElementById("gasUrlInput");
    if (input) input.value = CatalogoState.gasUrl;
    document.getElementById("settingsModal")?.classList.remove("hidden");
  });

  document.getElementById("btnCloseSettings")?.addEventListener("click", () => {
    document.getElementById("settingsModal")?.classList.add("hidden");
  });

  document.getElementById("btnResetDefaultUrl")?.addEventListener("click", () => {
    const input = document.getElementById("gasUrlInput");
    if (input) input.value = DEFAULT_GAS_URL;
  });

  document.getElementById("btnSaveSettings")?.addEventListener("click", () => {
    const input = document.getElementById("gasUrlInput");
    const newUrl = input ? input.value.trim() : "";
    if (!newUrl) {
      showToast("Ingresa una URL válida de Google Apps Script", "error");
      return;
    }
    CatalogoState.gasUrl = newUrl;
    localStorage.setItem("imb_catalogo_gas_url", newUrl);
    document.getElementById("settingsModal")?.classList.add("hidden");
    showToast("Conexión guardada. Actualizando catálogo...", "success");
    fetchCatalog(true);
  });
}

// ==========================================
// CARGA DE DATOS DESDE GOOGLE SHEETS (SOLO LECTURA)
// ==========================================
async function fetchCatalog(showNotification = false) {
  const grid = document.getElementById("catalogGrid");
  const refreshIcon = document.getElementById("refreshIcon");
  if (refreshIcon) refreshIcon.classList.add("animate-spin");

  if (grid && CatalogoState.catalog.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
        <div class="inline-block w-10 h-10 border-4 border-imb-red border-t-transparent rounded-full animate-spin mb-3"></div>
        <p class="text-base font-extrabold text-white">Cargando Catálogo General IMB Movilidad...</p>
        <p class="text-xs text-slate-400 mt-1">Sincronizando repuestos y stock en tiempo real</p>
      </div>
    `;
  }

  try {
    const res = await fetch(`${CatalogoState.gasUrl}?action=getCatalog`);
    const data = await res.json();

    if (data && data.success && Array.isArray(data.items)) {
      CatalogoState.catalog = data.items;

      const headerTotal = document.getElementById("headerTotalCount");
      if (headerTotal) headerTotal.textContent = String(data.items.length);

      updateOfficialBrandCounters();
      populateCatalogSpecificFilters();
      applyMultiFieldCatalogFilter();

      if (showNotification) {
        showToast(`Catálogo actualizado (${data.items.length} repuestos en línea)`, "success");
      }
    } else {
      throw new Error(data.error || "Respuesta inválida en getCatalog");
    }
  } catch (err) {
    console.error("Error cargando catálogo:", err);
    if (grid && CatalogoState.catalog.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full bg-slate-900 border border-red-900/60 rounded-3xl p-10 text-center space-y-3">
          <p class="text-lg font-black text-red-400">⚠️ No se pudo conectar con el catálogo en línea</p>
          <p class="text-xs text-slate-400 max-w-md mx-auto">
            Verifica tu conexión a internet o presiona el botón Actualizar para reintentar.
          </p>
          <button
            type="button"
            onclick="fetchCatalog(true)"
            class="px-5 py-2.5 rounded-xl bg-imb-red hover:bg-imb-redDark text-white text-xs font-black uppercase tracking-wider transition"
          >
            🔄 Reintentar Conexión
          </button>
        </div>
      `;
    } else if (showNotification) {
      showToast("No se pudo actualizar el catálogo en este momento", "error");
    }
  } finally {
    if (refreshIcon) refreshIcon.classList.remove("animate-spin");
  }
}

// ==========================================
// LECTURA DE STOCK ESTRICTAMENTE DESDE EXIST_VIRTUAL
// ==========================================
function getVirtualStock(item) {
  if (item.Stock_Virtual !== undefined && item.Stock_Virtual !== null && item.Stock_Virtual !== "") {
    return Number(item.Stock_Virtual) || 0;
  }
  return Number(item.Stock) || 0;
}

// ==========================================
// GESTIÓN DE MARCAS OFICIALES (GAC, DFSK, SHINERAY)
// ==========================================
function normalizeSearchText(str) {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function itemMatchesBrandKey(item, brandKey) {
  if (!brandKey) return true;
  const normKey = normalizeSearchText(brandKey);
  const normMarca = normalizeSearchText(item.Marca || "");
  const normModelo = normalizeSearchText(item.Modelo || "");
  const normAplica = normalizeSearchText(item.Aplica_A || "");

  if (normMarca === normKey || normMarca.includes(normKey)) return true;
  // Respaldo si la marca fue anotada en Modelo o Aplica_A
  if (normKey === "gac" || normKey === "dfsk" || normKey === "shineray") {
    return normModelo.includes(normKey) || normAplica.includes(normKey);
  }
  return false;
}

function updateOfficialBrandCounters() {
  const total = CatalogoState.catalog.length;
  let gacCount = 0;
  let dfskCount = 0;
  let shinerayCount = 0;

  CatalogoState.catalog.forEach((item) => {
    if (itemMatchesBrandKey(item, "GAC")) gacCount++;
    if (itemMatchesBrandKey(item, "DFSK")) dfskCount++;
    if (itemMatchesBrandKey(item, "SHINERAY")) shinerayCount++;
  });

  const elAll = document.getElementById("countBrandAll");
  const elGac = document.getElementById("countBrandGAC");
  const elDfsk = document.getElementById("countBrandDFSK");
  const elShin = document.getElementById("countBrandSHINERAY");

  if (elAll) elAll.textContent = String(total);
  if (elGac) elGac.textContent = String(gacCount);
  if (elDfsk) elDfsk.textContent = String(dfskCount);
  if (elShin) elShin.textContent = String(shinerayCount);
}

function selectOfficialBrandFilter(brandKey) {
  const marcaSelect = document.getElementById("filterMarcaSelect");
  if (marcaSelect) {
    // Si existe la opción exacta o equivalente en el select, seleccionarla; si no, agregarla temporalmente
    const targetNorm = normalizeSearchText(brandKey);
    let matchedValue = "";

    if (targetNorm) {
      Array.from(marcaSelect.options).forEach((opt) => {
        if (normalizeSearchText(opt.value) === targetNorm) {
          matchedValue = opt.value;
        }
      });
      if (!matchedValue) {
        const newOpt = document.createElement("option");
        newOpt.value = brandKey;
        newOpt.textContent = brandKey;
        marcaSelect.appendChild(newOpt);
        matchedValue = brandKey;
      }
    }

    marcaSelect.value = matchedValue;
  }

  syncBrandShowcaseHighlight(brandKey);
  CatalogoState.visibleLimit = PAGE_STEP;
  applyMultiFieldCatalogFilter();
}

function syncBrandShowcaseHighlight(selectedBrand) {
  const normSelected = normalizeSearchText(selectedBrand);
  const mobileIndicator = document.getElementById("activeBrandIndicator");

  if (mobileIndicator) {
    mobileIndicator.textContent = selectedBrand ? selectedBrand.toUpperCase() : "Todas";
  }

  document.querySelectorAll("[data-brand-card]").forEach((btn) => {
    const cardBrand = normalizeSearchText(btn.getAttribute("data-brand-card") || "");
    const isMatch =
      (!normSelected && !cardBrand) ||
      (normSelected && cardBrand && (normSelected === cardBrand || normSelected.includes(cardBrand)));

    btn.classList.toggle("brand-active", Boolean(isMatch));
  });
}

function getBrandLogoAsset(marcaRaw, modeloRaw = "", aplicaRaw = "") {
  const composite = normalizeSearchText(`${marcaRaw} ${modeloRaw} ${aplicaRaw}`);
  if (composite.includes("dfsk")) {
    return { src: "./assets/logo-dfsk.png", alt: "DFSK" };
  }
  if (composite.includes("shineray")) {
    return { src: "./assets/logo-shineray.png", alt: "Shineray" };
  }
  if (composite.includes("gac") || composite.includes("gs3") || composite.includes("gs4") || composite.includes("gs8") || composite.includes("emzoom")) {
    return { src: "./assets/logo-gac.png", alt: "GAC Motors" };
  }
  return { src: "./assets/logo-imb.jpg", alt: "IMB Movilidad" };
}

// ==========================================
// FILTROS ESPECÍFICOS Y BUSCADOR MULTI-CAMPO (SIN UBICACIÓN)
// ==========================================
function populateCatalogSpecificFilters() {
  const marcaSelect = document.getElementById("filterMarcaSelect");
  const modeloSelect = document.getElementById("filterModeloSelect");
  const aplicaSelect = document.getElementById("filterAplicaASelect");
  if (!marcaSelect || !modeloSelect || !aplicaSelect) return;

  const prevMarca = marcaSelect.value;
  const prevModelo = modeloSelect.value;
  const prevAplica = aplicaSelect.value;

  const marcasSet = new Set(["GAC", "DFSK", "SHINERAY"]);
  const modelosSet = new Set();
  const aplicaSet = new Set();

  CatalogoState.catalog.forEach((item) => {
    const mar = (item.Marca || "").toString().trim();
    if (mar) marcasSet.add(mar.toUpperCase());

    const mod = (item.Modelo || "").toString().trim();
    if (mod) modelosSet.add(mod);

    const rawAplica = (item.Aplica_A || "").toString().trim();
    if (rawAplica) {
      rawAplica
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((tag) => aplicaSet.add(tag));
    }
  });

  const sortedMarcas = Array.from(marcasSet).sort((a, b) => a.localeCompare(b));
  const sortedModelos = Array.from(modelosSet).sort((a, b) => a.localeCompare(b));
  const sortedAplica = Array.from(aplicaSet).sort((a, b) => a.localeCompare(b));

  marcaSelect.innerHTML = `<option value="">Todas las Marcas (${sortedMarcas.length})</option>`;
  sortedMarcas.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    if (normalizeSearchText(m) === normalizeSearchText(prevMarca) && prevMarca) {
      opt.selected = true;
    }
    marcaSelect.appendChild(opt);
  });

  modeloSelect.innerHTML = `<option value="">Todos los Modelos (${sortedModelos.length})</option>`;
  sortedModelos.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    if (m === prevModelo) opt.selected = true;
    modeloSelect.appendChild(opt);
  });

  aplicaSelect.innerHTML = `<option value="">Todas las Aplicaciones - Aplica A (${sortedAplica.length})</option>`;
  sortedAplica.forEach((ap) => {
    const opt = document.createElement("option");
    opt.value = ap;
    opt.textContent = ap;
    if (ap === prevAplica) opt.selected = true;
    aplicaSelect.appendChild(opt);
  });
}

function resetAllFilters() {
  const searchInput = document.getElementById("multiSearchInput");
  const btnClearSearch = document.getElementById("btnClearSearch");
  const chkOnlyStock = document.getElementById("chkOnlyStock");
  const marcaSelect = document.getElementById("filterMarcaSelect");
  const modeloSelect = document.getElementById("filterModeloSelect");
  const aplicaSelect = document.getElementById("filterAplicaASelect");

  if (searchInput) searchInput.value = "";
  if (btnClearSearch) btnClearSearch.classList.add("hidden");
  if (chkOnlyStock) chkOnlyStock.checked = false;
  if (marcaSelect) marcaSelect.value = "";
  if (modeloSelect) modeloSelect.value = "";
  if (aplicaSelect) aplicaSelect.value = "";

  syncBrandShowcaseHighlight("");
  CatalogoState.visibleLimit = PAGE_STEP;
  applyMultiFieldCatalogFilter();
}

function applyMultiFieldCatalogFilter() {
  const queryRaw = document.getElementById("multiSearchInput")?.value || "";
  const selectedMarca = (document.getElementById("filterMarcaSelect")?.value || "").trim();
  const selectedModelo = (document.getElementById("filterModeloSelect")?.value || "").trim();
  const selectedAplica = (document.getElementById("filterAplicaASelect")?.value || "").trim();
  const onlyWithStock = document.getElementById("chkOnlyStock")?.checked || false;

  const tokens = normalizeSearchText(queryRaw)
    .split(/\s+/)
    .filter(Boolean);

  const normSelectedModelo = normalizeSearchText(selectedModelo);
  const normSelectedAplica = normalizeSearchText(selectedAplica);

  // Actualizar indicador de filtro activo
  const activeFilterBadge = document.getElementById("activeFilterBadge");
  const hasAnyFilter = Boolean(
    tokens.length > 0 || selectedMarca || selectedModelo || selectedAplica || onlyWithStock
  );
  if (activeFilterBadge) {
    activeFilterBadge.classList.toggle("hidden", !hasAnyFilter);
  }

  CatalogoState.filteredCatalog = CatalogoState.catalog.filter((item) => {
    const virtualStock = getVirtualStock(item);
    if (onlyWithStock && virtualStock <= 0) {
      return false;
    }

    // Filtro por MARCA
    if (selectedMarca && !itemMatchesBrandKey(item, selectedMarca)) {
      return false;
    }

    // Filtro específico por MODELO
    if (normSelectedModelo) {
      const itemModelo = normalizeSearchText(item.Modelo || "");
      if (itemModelo !== normSelectedModelo && !itemModelo.includes(normSelectedModelo)) {
        return false;
      }
    }

    // Filtro específico por APLICA A
    if (normSelectedAplica) {
      const itemAplicaTokens = (item.Aplica_A || "")
        .toString()
        .split(",")
        .map((s) => normalizeSearchText(s.trim()))
        .filter(Boolean);
      const itemAplicaFull = normalizeSearchText(item.Aplica_A || "");
      if (
        !itemAplicaTokens.includes(normSelectedAplica) &&
        !itemAplicaFull.includes(normSelectedAplica)
      ) {
        return false;
      }
    }

    if (tokens.length === 0) return true;

    // Búsqueda multi-campo excluyendo estrictamente Ubicacion_Almacen
    const searchableComposite = normalizeSearchText(
      [
        item.Codigo,
        item.N_Parte,
        item.N_Parte_2,
        item.Descripcion,
        item.Marca,
        item.Serie,
        item.Modelo,
        item.Version,
        item.Aplica_A,
        item.Categoria
      ].join(" ")
    );

    return tokens.every((token) => searchableComposite.includes(token));
  });

  renderCatalogGrid();
}

// ==========================================
// HELPERS PARA FOTOS DE GOOGLE DRIVE Y FALLBACKS
// ==========================================
function extractDriveFileId(url) {
  if (!url) return "";
  const str = url.toString().trim();
  const match =
    str.match(/(?:id=|\/d\/|export=view&id=|thumbnail\?id=)([a-zA-Z0-9_-]{20,})/) ||
    str.match(/^([a-zA-Z0-9_-]{25,45})$/);
  return match ? match[1] : "";
}

function formatDriveImageUrl(url) {
  if (!url) return "";
  const trimmed = url.toString().trim();
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  const fileId = extractDriveFileId(trimmed);
  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
  }
  return trimmed;
}

function getItemPhotoList(item) {
  let rawList = [];
  if (Array.isArray(item.Fotos_Galeria) && item.Fotos_Galeria.length > 0) {
    rawList = item.Fotos_Galeria;
  } else if (item.Imagen_URL) {
    rawList = item.Imagen_URL.toString().split(",");
  }
  return rawList
    .map((u) => u.toString().trim())
    .filter(Boolean);
}

/**
 * Fallback en cascada si Google Drive bloquea un endpoint de imagen:
 * 1) lh3.googleusercontent.com/d/{id}=w1000
 * 2) drive.google.com/thumbnail?id={id}&sz=w1000
 * 3) lh3.googleusercontent.com/d/{id}
 * 4) Logo de la marca correspondiente o Logo IMB Movilidad
 */
window.handleCatalogDriveImgError = function (imgEl, rawUrl, fallbackLogoSrc) {
  if (!imgEl) return;
  const fileId = extractDriveFileId(rawUrl || imgEl.src);
  const step = parseInt(imgEl.getAttribute("data-fallback-step") || "0", 10);

  if (fileId && step === 0) {
    imgEl.setAttribute("data-fallback-step", "1");
    imgEl.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    return;
  }
  if (fileId && step === 1) {
    imgEl.setAttribute("data-fallback-step", "2");
    imgEl.src = `https://lh3.googleusercontent.com/d/${fileId}`;
    return;
  }

  imgEl.onerror = null;
  imgEl.src = fallbackLogoSrc || "./assets/logo-imb.jpg";
  imgEl.className = "h-14 w-auto object-contain bg-white px-3.5 py-2 rounded-2xl shadow";
};

// ==========================================
// RENDERIZADO DEL GRID DE TARJETAS (SOLO CONSULTA, SIN UBICACIÓN)
// ==========================================
function renderCatalogGrid() {
  const grid = document.getElementById("catalogGrid");
  const countEl = document.getElementById("catalogResultCount");
  const loadMoreBox = document.getElementById("loadMoreContainer");
  const btnLoadMore = document.getElementById("btnLoadMore");
  if (!grid) return;

  const totalFiltered = CatalogoState.filteredCatalog.length;
  if (countEl) {
    countEl.textContent = String(totalFiltered);
  }

  if (totalFiltered === 0) {
    if (loadMoreBox) loadMoreBox.classList.add("hidden");
    grid.innerHTML = `
      <div class="col-span-full bg-slate-900/90 border border-slate-800 rounded-3xl p-12 text-center space-y-3">
        <p class="text-4xl">🔍</p>
        <p class="text-base sm:text-lg font-extrabold text-white">
          No se encontraron repuestos con esos criterios de búsqueda
        </p>
        <p class="text-xs text-slate-400 max-w-md mx-auto">
          Prueba buscando con otra palabra clave, código o limpia los filtros activos para explorar todo el catálogo.
        </p>
        <button
          type="button"
          onclick="resetAllFilters()"
          class="mt-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-extrabold uppercase tracking-wider text-white transition"
        >
          ✕ Mostrar todos los repuestos
        </button>
      </div>
    `;
    return;
  }

  const itemsToShow = CatalogoState.filteredCatalog.slice(0, CatalogoState.visibleLimit);

  if (loadMoreBox && btnLoadMore) {
    if (totalFiltered > CatalogoState.visibleLimit) {
      const remaining = totalFiltered - CatalogoState.visibleLimit;
      loadMoreBox.classList.remove("hidden");
      btnLoadMore.textContent = `Mostrar más repuestos (${remaining} restantes) ↓`;
    } else {
      loadMoreBox.classList.add("hidden");
    }
  }

  grid.innerHTML = itemsToShow
    .map((item) => {
      const sku = escapeHtml(item.Codigo || item.SKU_Articulo || "S/C");
      const nParte = escapeHtml(item.N_Parte || "");
      const desc = escapeHtml(item.Descripcion || "Sin descripción");
      const marca = escapeHtml(item.Marca || "MULTIMARCA");
      const modelo = escapeHtml(item.Modelo || "");
      const aplica = escapeHtml(item.Aplica_A || "");
      const categoria = escapeHtml(item.Categoria || "");
      const stock = getVirtualStock(item);

      const brandLogo = getBrandLogoAsset(item.Marca, item.Modelo, item.Aplica_A);
      const photoList = getItemPhotoList(item);
      const rawMainUrl = photoList.length > 0 ? photoList[0] : "";
      const displayImgUrl = rawMainUrl ? escapeHtml(formatDriveImageUrl(rawMainUrl)) : "";
      const escapedRawUrl = escapeHtml(rawMainUrl);

      const stockBadgeClass =
        stock > 0
          ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
          : "bg-red-500/20 border-red-500/40 text-red-300";

      const stockText = stock > 0 ? `Disponible: ${stock}` : "Sin Stock (0)";

      return `
        <article
          data-open-sku="${sku}"
          class="part-card cursor-pointer bg-slate-900 border border-slate-800 hover:border-red-500/60 rounded-2xl overflow-hidden flex flex-col justify-between shadow-lg"
        >
          <div>
            <!-- Cabecera Fotográfica + SKU + Stock EXIST_VIRTUAL -->
            <div class="relative h-48 bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800/80">
              ${
                displayImgUrl
                  ? `<img
                      src="${displayImgUrl}"
                      alt="${desc}"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                      data-fallback-step="0"
                      class="w-full h-full object-contain bg-slate-950 p-1.5 hover:scale-105 transition duration-300"
                      onerror="window.handleCatalogDriveImgError(this, '${escapedRawUrl}', '${brandLogo.src}')"
                    />`
                  : `<div class="flex flex-col items-center justify-center text-slate-400 p-4">
                      <div class="bg-white px-3.5 py-2 rounded-2xl mb-2 shadow">
                        <img src="${brandLogo.src}" alt="${brandLogo.alt}" class="h-9 w-auto object-contain" />
                      </div>
                      <span class="text-[11px] font-semibold text-slate-500">Sin foto registrada</span>
                    </div>`
              }

              <!-- Badge SKU -->
              <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-slate-950/90 backdrop-blur border border-slate-700 text-[11px] font-black text-white">
                SKU: ${sku}
              </span>

              <!-- Badge Stock (EXIST_VIRTUAL) -->
              <span class="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg border backdrop-blur text-xs font-black ${stockBadgeClass}">
                ${stockText}
              </span>

              ${
                photoList.length > 1
                  ? `<span class="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-700 text-[10px] font-extrabold text-slate-200">
                      📷 ${photoList.length} fotos
                    </span>`
                  : ""
              }
            </div>

            <!-- Cuerpo de la Tarjeta (Sin Ubicación) -->
            <div class="p-4 space-y-2.5">
              <!-- Fila de Marca con Mini-Logo y Modelo -->
              <div class="flex items-center justify-between gap-2">
                <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700/80 text-[11px] font-extrabold text-slate-200 max-w-full truncate">
                  <span class="w-4 h-4 rounded bg-white flex items-center justify-center p-0.5 shrink-0">
                    <img src="${brandLogo.src}" alt="${brandLogo.alt}" class="max-h-full max-w-full object-contain" />
                  </span>
                  <span class="truncate">${marca}${modelo ? " • " + modelo : ""}</span>
                </div>

                ${
                  categoria
                    ? `<span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                        ${categoria}
                      </span>`
                    : ""
                }
              </div>

              <!-- Descripción Principal del Repuesto -->
              <h3 class="text-sm sm:text-base font-extrabold text-white leading-snug line-clamp-2" title="${desc}">
                ${desc}
              </h3>

              ${
                nParte
                  ? `<p class="text-[11px] text-slate-400 font-semibold truncate">
                      N# Parte: <span class="text-slate-200 font-bold">${nParte}</span>
                    </p>`
                  : ""
              }

              <!-- Compatibilidad APLICA A -->
              ${
                aplica
                  ? `<div class="pt-0.5">
                      <span class="inline-block px-2.5 py-1 rounded-lg bg-blue-950/70 border border-blue-800/60 text-blue-300 text-[11px] font-semibold truncate max-w-full" title="Aplica a: ${aplica}">
                        🔧 Aplica a: ${aplica}
                      </span>
                    </div>`
                  : ""
              }
            </div>
          </div>

          <!-- Pie de Tarjeta: Botón de Consulta de Ficha y Fotos -->
          <div class="px-4 pb-4 pt-1">
            <button
              type="button"
              data-open-sku="${sku}"
              class="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-imb-red border border-slate-700 hover:border-red-500 text-slate-200 hover:text-white font-extrabold text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5"
            >
              <span>🔍 Ver Ficha y Fotos</span>
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  // Evento para abrir la Ficha Técnica al hacer clic en cualquier tarjeta o botón
  grid.querySelectorAll("article[data-open-sku]").forEach((card) => {
    card.addEventListener("click", () => {
      const sku = card.getAttribute("data-open-sku");
      openPartDetailModal(sku);
    });
  });
}

// ==========================================
// MODAL DE FICHA TÉCNICA COMPLETA Y GALERÍA (SIN UBICACIÓN)
// ==========================================
function openPartDetailModal(sku) {
  const item = CatalogoState.catalog.find(
    (it) => String(it.Codigo || it.SKU_Articulo) === String(sku)
  );
  if (!item) return;

  CatalogoState.activeItem = item;
  CatalogoState.previewGallery = getItemPhotoList(item);
  CatalogoState.previewIndex = 0;

  const stock = getVirtualStock(item);
  const brandLogo = getBrandLogoAsset(item.Marca, item.Modelo, item.Aplica_A);

  // Poblar textos de especificaciones
  const titleEl = document.getElementById("modalPartTitle");
  const descEl = document.getElementById("modalFullDescription");
  const skuEl = document.getElementById("modalSkuCode");
  const stockBadge = document.getElementById("modalStockBadge");
  const brandLogoImg = document.getElementById("modalBrandLogoImg");
  const specMarca = document.getElementById("modalSpecMarca");
  const specModelo = document.getElementById("modalSpecModelo");
  const specNParte = document.getElementById("modalSpecNParte");
  const specCategoria = document.getElementById("modalSpecCategoria");
  const specAplica = document.getElementById("modalSpecAplicaA");

  if (titleEl) titleEl.textContent = item.Descripcion || "Detalle del Repuesto";
  if (descEl) descEl.textContent = item.Descripcion || "Sin descripción";
  if (skuEl) skuEl.textContent = item.Codigo || item.SKU_Articulo || "S/C";

  if (stockBadge) {
    stockBadge.textContent =
      stock > 0 ? `✓ Disponible en Stock: ${stock} und(s)` : "Agotado temporalmente (0)";
    stockBadge.className =
      stock > 0
        ? "px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-black bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
        : "px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-black bg-red-500/20 border-red-500/40 text-red-300";
  }

  if (brandLogoImg) {
    brandLogoImg.src = brandLogo.src;
    brandLogoImg.alt = brandLogo.alt;
  }

  if (specMarca) specMarca.textContent = item.Marca || "Multimarca";

  const modeloComposite = [item.Serie, item.Modelo, item.Version]
    .map((v) => (v || "").toString().trim())
    .filter(Boolean)
    .join(" • ");
  if (specModelo) specModelo.textContent = modeloComposite || "General";

  const nParteComposite = [item.N_Parte, item.N_Parte_2]
    .map((v) => (v || "").toString().trim())
    .filter(Boolean)
    .join(" / ");
  if (specNParte) specNParte.textContent = nParteComposite || "No especificado";

  if (specCategoria) specCategoria.textContent = item.Categoria || "Repuesto General";
  if (specAplica) specAplica.textContent = item.Aplica_A || "Compatible según modelo/código";

  renderModalGalleryView();
  document.getElementById("partDetailModal")?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closePartDetailModal() {
  document.getElementById("partDetailModal")?.classList.add("hidden");
  document.body.style.overflow = "";
}

function stepModalGallery(delta) {
  const total = CatalogoState.previewGallery.length;
  if (total <= 1) return;
  CatalogoState.previewIndex = (CatalogoState.previewIndex + delta + total) % total;
  renderModalGalleryView();
}

function renderModalGalleryView() {
  const imgEl = document.getElementById("modalMainImage");
  const counterEl = document.getElementById("modalPhotoCounter");
  const btnPrev = document.getElementById("btnPrevModalImg");
  const btnNext = document.getElementById("btnNextModalImg");
  const thumbsBox = document.getElementById("modalThumbnails");

  if (!imgEl || !CatalogoState.activeItem) return;

  const item = CatalogoState.activeItem;
  const brandLogo = getBrandLogoAsset(item.Marca, item.Modelo, item.Aplica_A);
  const total = CatalogoState.previewGallery.length;

  if (total === 0) {
    imgEl.onerror = null;
    imgEl.src = brandLogo.src;
    imgEl.className = "h-24 w-auto object-contain bg-white px-5 py-3 rounded-2xl shadow-lg";
    if (counterEl) counterEl.textContent = "Sin fotografías adjuntas";
    btnPrev?.classList.add("hidden");
    btnNext?.classList.add("hidden");
    thumbsBox?.classList.add("hidden");
    return;
  }

  const rawUrl = CatalogoState.previewGallery[CatalogoState.previewIndex] || "";
  const formattedUrl = formatDriveImageUrl(rawUrl);

  if (counterEl) {
    counterEl.textContent = `Fotografía ${CatalogoState.previewIndex + 1} de ${total}`;
  }

  imgEl.setAttribute("data-fallback-step", "0");
  imgEl.className = "max-h-[48vh] lg:max-h-[55vh] w-auto object-contain rounded-xl transition";
  imgEl.onerror = function () {
    window.handleCatalogDriveImgError(this, rawUrl, brandLogo.src);
  };
  imgEl.src = formattedUrl;

  if (btnPrev && btnNext) {
    const showNav = total > 1;
    btnPrev.classList.toggle("hidden", !showNav);
    btnNext.classList.toggle("hidden", !showNav);
  }

  if (thumbsBox) {
    if (total > 1) {
      thumbsBox.classList.remove("hidden");
      thumbsBox.innerHTML = CatalogoState.previewGallery
        .map((u, idx) => {
          const thumbUrl = escapeHtml(formatDriveImageUrl(u));
          const activeClass =
            idx === CatalogoState.previewIndex
              ? "ring-2 ring-imb-red opacity-100 scale-105"
              : "opacity-60 hover:opacity-100";
          return `
            <button
              type="button"
              data-modal-thumb="${idx}"
              class="w-14 h-14 rounded-xl overflow-hidden bg-slate-950 border border-slate-700 shrink-0 transition ${activeClass}"
            >
              <img
                src="${thumbUrl}"
                alt="Miniatura ${idx + 1}"
                referrerpolicy="no-referrer"
                class="w-full h-full object-cover"
                onerror="window.handleCatalogDriveImgError(this, '${escapeHtml(u)}', '${brandLogo.src}')"
              />
            </button>
          `;
        })
        .join("");

      thumbsBox.querySelectorAll("[data-modal-thumb]").forEach((btn) => {
        btn.addEventListener("click", () => {
          CatalogoState.previewIndex = parseInt(btn.getAttribute("data-modal-thumb"), 10) || 0;
          renderModalGalleryView();
        });
      });
    } else {
      thumbsBox.classList.add("hidden");
    }
  }
}

// ==========================================
// UTILIDADES GENERALES (ESCAPE HTML Y TOASTS)
// ==========================================
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const colors = {
    success: "bg-emerald-950/95 border-emerald-500/50 text-emerald-200",
    error: "bg-red-950/95 border-red-500/50 text-red-200",
    info: "bg-slate-900/95 border-slate-700 text-slate-100"
  };

  const toast = document.createElement("div");
  toast.className = `px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-md text-xs sm:text-sm font-bold flex items-center gap-2 transition duration-300 ${
    colors[type] || colors.info
  }`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

