/**
 * PROYECTO: Mostrador Digital Ventas-Almacén - GAC Motors
 * DESARROLLO & ARQUITECTURA: Victor Solorzano
 * ASISTENCIA TÉCNICA: OpenCode for Obsidian & Antigravity IDE
 * ROL: Controlador Frontend ES6 (Roles, Buscador Multi-Campo, Carrito Ágil, Tablero Almacén, Polling 30s y Web Audio API)
 */

// ==========================================
// CONFIGURACIÓN Y URL PERMANENTE DE APPS SCRIPT
// ==========================================
const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwMoaiBbM5dCNo-iwD1XzuxOCvqTAFx5hsGEuL_y71lfitdzDf1dDkNJdBeRm-TUL-z/exec";

const POLLING_INTERVAL_MS = 30000; // 30 segundos exactos
const MAX_CART_ITEMS = 20;

// ==========================================
// ESTADO REACTIVO DE LA APLICACIÓN
// ==========================================
const VentasState = {
  gasUrl: localStorage.getItem("gac_ventas_gas_url") || DEFAULT_GAS_URL,
  soundEnabled: localStorage.getItem("gac_ventas_sound") !== "false",
  audioCtx: null,
  deferredInstallPrompt: null,

  // Usuarios cargados desde Base_Datos
  usuarios: {
    vendedores: [],
    almacenistas: []
  },

  // Sesión actual (sin clave)
  selectedRole: localStorage.getItem("gac_ventas_role") || "", // "Vendedor" | "Almacenista"
  selectedUser: localStorage.getItem("gac_ventas_user") || "",

  // Catálogo de Repuestos
  catalog: [],
  filteredCatalog: [],
  activeVentasTab: "catalogo", // "catalogo" | "misSolicitudes"

  // Carrito Ultra-Ágil (máx 20 artículos)
  cart: [], // [{ SKU_Articulo, Descripcion_Repuesto, Ubicacion_Almacen, Cantidad, Stock, Imagen_URL, Marca, Modelo }]
  cartPriority: "Normal", // "Normal" | "Urgente"

  // Solicitudes y Control de Alertas en Vivo
  solicitudes: [],
  almacenFilter: "Pendiente", // "Pendiente" | "Todas"
  pollingTimer: null,
  initialSnapshotLoaded: false,
  knownSellerStatusMap: {}, // { "SOL-0001": "Pendiente" }
  knownWarehousePendingIds: new Set(), // Set de IDs "SOL-XXXX" pendientes ya conocidos

  // Galería activa en el Modal de Vista Ampliada
  previewGallery: [],
  previewIndex: 0,
  previewTitle: ""
};

// ==========================================
// INICIALIZACIÓN AL CARGAR EL DOM
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  initServiceWorkerAndInstall();
  bindUIEvents();
  updateSoundButtonUI();

  // Cargar lista de usuarios desde Base_Datos
  fetchUsuarios().then(() => {
    if (VentasState.selectedRole && VentasState.selectedUser) {
      enterActiveRoleModule();
    }
  });
});

// ==========================================
// PWA: SERVICE WORKER E INSTALACIÓN NATIVA
// ==========================================
function initServiceWorkerAndInstall() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("PWA Service Worker registrado:", reg.scope))
      .catch((err) => console.warn("Error al registrar Service Worker:", err));
  }

  const btnInstall = document.getElementById("btnInstallPwa");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    VentasState.deferredInstallPrompt = e;
    if (btnInstall) {
      btnInstall.classList.remove("hidden");
      btnInstall.classList.add("flex");
    }
  });

  if (btnInstall) {
    btnInstall.addEventListener("click", async () => {
      if (!VentasState.deferredInstallPrompt) return;
      VentasState.deferredInstallPrompt.prompt();
      const { outcome } = await VentasState.deferredInstallPrompt.userChoice;
      if (outcome === "accepted") {
        btnInstall.classList.add("hidden");
      }
      VentasState.deferredInstallPrompt = null;
    });
  }
}

// ==========================================
// SINTETIZADOR DE SONIDOS (WEB AUDIO API NATIVA)
// ==========================================
function getAudioContext() {
  if (!VentasState.audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      VentasState.audioCtx = new AudioContextClass();
    }
  }
  if (VentasState.audioCtx && VentasState.audioCtx.state === "suspended") {
    VentasState.audioCtx.resume().catch(() => {});
  }
  return VentasState.audioCtx;
}

/**
 * 1. Sonido/Chime suave para VENDEDOR cuando Almacén responde su solicitud
 */
function playSellerNotificationChime() {
  if (!VentasState.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // Acorde Do Mayor ascendente (C5, E5, G5, C6)

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.11 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.48);
    });
  } catch (e) {
    console.warn("Web Audio API (Chime Vendedor):", e);
  }
}

/**
 * 2. Alarma/Campana clara para ALMACÉN al recibir NUEVA solicitud pendiente
 */
function playWarehouseAlertBell() {
  if (!VentasState.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Doble campana de mostrador de alta visibilidad auditiva
    const pulses = [
      { start: 0.0, freq1: 880, freq2: 1318.5 },
      { start: 0.28, freq1: 987.77, freq2: 1479.98 },
      { start: 0.62, freq1: 880, freq2: 1318.5 }
    ];

    pulses.forEach((p) => {
      [p.freq1, p.freq2].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + p.start);

        gain.gain.setValueAtTime(0.001, now + p.start);
        gain.gain.exponentialRampToValueAtTime(0.3, now + p.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + p.start + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + p.start);
        osc.stop(now + p.start + 0.27);
      });
    });
  } catch (e) {
    console.warn("Web Audio API (Campana Almacén):", e);
  }
}

function updateSoundButtonUI() {
  const icon = document.getElementById("soundStatusIcon");
  if (icon) {
    icon.textContent = VentasState.soundEnabled ? "🔊" : "🔇";
  }
}

// ==========================================
// BANNER FLOTANTE DE ALERTAS EN VIVO
// ==========================================
let liveBannerTimeout = null;

function showLiveBanner({ type, title, subtitle }) {
  const banner = document.getElementById("liveAlertBanner");
  const inner = document.getElementById("liveAlertInner");
  const iconEl = document.getElementById("liveAlertIcon");
  const titleEl = document.getElementById("liveAlertTitle");
  const subEl = document.getElementById("liveAlertSubtitle");

  if (!banner || !inner) return;

  if (type === "seller-success") {
    inner.className =
      "flex items-start justify-between gap-3 px-4 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md bg-emerald-950/95 border-emerald-500 text-emerald-50 live-banner-enter";
    iconEl.textContent = "✅";
  } else {
    inner.className =
      "flex items-start justify-between gap-3 px-4 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md bg-red-950/95 border-red-500 text-red-50 live-banner-enter";
    iconEl.textContent = "🚨";
  }

  titleEl.textContent = title || "";
  subEl.textContent = subtitle || "";

  banner.classList.remove("hidden");

  if (liveBannerTimeout) clearTimeout(liveBannerTimeout);
  liveBannerTimeout = setTimeout(() => {
    banner.classList.add("hidden");
  }, 14000);
}

// ==========================================
// EVENTOS DE INTERFAZ Y NAVEGACIÓN
// ==========================================
function bindUIEvents() {
  // Cerrar banner en vivo
  document.getElementById("btnCloseLiveAlert")?.addEventListener("click", () => {
    document.getElementById("liveAlertBanner")?.classList.add("hidden");
  });

  // Botón Sonido (desbloquea AudioContext y permite probar sonido)
  document.getElementById("btnToggleSound")?.addEventListener("click", () => {
    VentasState.soundEnabled = !VentasState.soundEnabled;
    localStorage.setItem("gac_ventas_sound", String(VentasState.soundEnabled));
    updateSoundButtonUI();
    if (VentasState.soundEnabled) {
      if (VentasState.selectedRole === "Almacenista") {
        playWarehouseAlertBell();
      } else {
        playSellerNotificationChime();
      }
      showToast("Alertas de sonido activadas", "success");
    } else {
      showToast("Alertas de sonido silenciadas", "info");
    }
  });

  // Selector de Rol: Vendedor o Almacenista
  document.getElementById("btnSelectRoleVendedor")?.addEventListener("click", () => {
    getAudioContext();
    selectRoleOption("Vendedor");
  });

  document.getElementById("btnSelectRoleAlmacenista")?.addEventListener("click", () => {
    getAudioContext();
    selectRoleOption("Almacenista");
  });

  document.getElementById("btnReloadUsers")?.addEventListener("click", () => {
    fetchUsuarios(true);
  });

  document.getElementById("userSelectDropdown")?.addEventListener("change", (e) => {
    const val = e.target.value.trim();
    const btnEnter = document.getElementById("btnEnterApp");
    if (btnEnter) btnEnter.disabled = !val;
  });

  document.getElementById("btnEnterApp")?.addEventListener("click", () => {
    getAudioContext();
    const userVal = document.getElementById("userSelectDropdown")?.value.trim();
    if (!VentasState.selectedRole || !userVal) {
      showToast("Selecciona tu rol y tu nombre para continuar", "error");
      return;
    }
    VentasState.selectedUser = userVal;
    localStorage.setItem("gac_ventas_role", VentasState.selectedRole);
    localStorage.setItem("gac_ventas_user", VentasState.selectedUser);
    enterActiveRoleModule();
  });

  // Cambiar de Usuario / Rol
  document.getElementById("btnSwitchUser")?.addEventListener("click", () => {
    stopPolling();
    VentasState.initialSnapshotLoaded = false;
    document.getElementById("activeSessionBadge")?.classList.add("hidden");
    document.getElementById("ventasModuleView")?.classList.add("hidden");
    document.getElementById("almacenModuleView")?.classList.add("hidden");
    document.getElementById("cartFloatingBar")?.classList.add("hidden");
    document.getElementById("roleSelectionView")?.classList.remove("hidden");
    if (VentasState.selectedRole) {
      selectRoleOption(VentasState.selectedRole);
    }
  });

  // Pestañas Módulo Ventas
  document.getElementById("tabVentasCatalogo")?.addEventListener("click", () => {
    switchVentasTab("catalogo");
  });
  document.getElementById("tabVentasMisSolicitudes")?.addEventListener("click", () => {
    switchVentasTab("misSolicitudes");
  });

  // Buscador Inteligente Multi-Campo en Tiempo Real
  const searchInput = document.getElementById("multiSearchInput");
  const btnClearSearch = document.getElementById("btnClearSearch");

  searchInput?.addEventListener("input", () => {
    const val = searchInput.value;
    if (btnClearSearch) {
      btnClearSearch.classList.toggle("hidden", val.length === 0);
    }
    applyMultiFieldCatalogFilter();
  });

  btnClearSearch?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    btnClearSearch.classList.add("hidden");
    applyMultiFieldCatalogFilter();
    searchInput?.focus();
  });

  document.getElementById("chkOnlyStock")?.addEventListener("change", () => {
    applyMultiFieldCatalogFilter();
  });

  // Filtros específicos adicionales: MODELO y APLICA A
  document.getElementById("filterModeloSelect")?.addEventListener("change", () => {
    applyMultiFieldCatalogFilter();
  });
  document.getElementById("filterAplicaASelect")?.addEventListener("change", () => {
    applyMultiFieldCatalogFilter();
  });
  document.getElementById("btnResetSpecificFilters")?.addEventListener("click", () => {
    const modSelect = document.getElementById("filterModeloSelect");
    const aplSelect = document.getElementById("filterAplicaASelect");
    const chkStock = document.getElementById("chkOnlyStock");
    if (modSelect) modSelect.value = "";
    if (aplSelect) aplSelect.value = "";
    if (chkStock) chkStock.checked = false;
    if (searchInput) searchInput.value = "";
    btnClearSearch?.classList.add("hidden");
    applyMultiFieldCatalogFilter();
  });

  // Chips de filtro rápido (GS3, GS4, GS8, etc.)
  document.querySelectorAll(".quick-filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const term = chip.getAttribute("data-quick-filter") || "";
      if (searchInput) {
        searchInput.value = searchInput.value.trim() === term ? "" : term;
        btnClearSearch?.classList.toggle("hidden", searchInput.value.length === 0);
        applyMultiFieldCatalogFilter();
      }
    });
  });

  // Botones refrescar catálogo y solicitudes
  document.getElementById("btnRefreshCatalog")?.addEventListener("click", () => {
    fetchCatalog(true);
    fetchSolicitudes(false);
  });
  document.getElementById("btnRefreshCatalogMobile")?.addEventListener("click", () => {
    fetchCatalog(true);
  });
  document.getElementById("btnRefreshMisSolicitudes")?.addEventListener("click", () => {
    fetchSolicitudes(false, true);
  });

  // Carrito Ultra-Ágil Drawer
  document.getElementById("btnOpenCartDrawer")?.addEventListener("click", () => {
    renderCartDrawerItems();
    document.getElementById("cartDrawerModal")?.classList.remove("hidden");
  });
  document.getElementById("btnCloseCartDrawer")?.addEventListener("click", () => {
    document.getElementById("cartDrawerModal")?.classList.add("hidden");
  });
  document.getElementById("btnClearCart")?.addEventListener("click", () => {
    VentasState.cart = [];
    updateCartUI();
    renderCartDrawerItems();
    renderCatalogGrid();
    document.getElementById("cartDrawerModal")?.classList.add("hidden");
    showToast("Carrito vaciado", "info");
  });

  // Selector de Prioridad en Carrito ("Normal" en azul / "Urgente" en rojo)
  document.getElementById("btnPriorityNormal")?.addEventListener("click", () => {
    setCartPriority("Normal");
  });
  document.getElementById("btnPriorityUrgente")?.addEventListener("click", () => {
    setCartPriority("Urgente");
  });

  // Enviar Solicitud a Almacén
  document.getElementById("btnSubmitSolicitud")?.addEventListener("click", () => {
    submitCartSolicitud();
  });

  // Controles Módulo Almacén
  document.querySelectorAll(".almacen-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      VentasState.almacenFilter = btn.getAttribute("data-almacen-filter") || "Pendiente";
      updateAlmacenFilterButtons();
      renderAlmacenBoard();
    });
  });

  document.getElementById("btnRefreshAlmacen")?.addEventListener("click", () => {
    fetchSolicitudes(false, true);
  });

  // Modal Vista Previa de Imagen / Galería
  document.getElementById("btnCloseImagePreview")?.addEventListener("click", () => {
    document.getElementById("imagePreviewModal")?.classList.add("hidden");
  });
  document.getElementById("imagePreviewModal")?.addEventListener("click", (e) => {
    if (e.target.id === "imagePreviewModal") {
      document.getElementById("imagePreviewModal")?.classList.add("hidden");
    }
  });
  document.getElementById("btnPrevPreviewImg")?.addEventListener("click", () => {
    stepPreviewGallery(-1);
  });
  document.getElementById("btnNextPreviewImg")?.addEventListener("click", () => {
    stepPreviewGallery(1);
  });

  // Modal Configuración URL
  document.getElementById("btnOpenSettings")?.addEventListener("click", () => {
    const input = document.getElementById("gasUrlInput");
    if (input) input.value = VentasState.gasUrl;
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
    VentasState.gasUrl = newUrl;
    localStorage.setItem("gac_ventas_gas_url", newUrl);
    document.getElementById("settingsModal")?.classList.add("hidden");
    showToast("URL guardada. Sincronizando datos...", "success");
    fetchUsuarios(true);
    if (VentasState.selectedRole === "Vendedor") fetchCatalog(true);
    if (VentasState.selectedRole) fetchSolicitudes(true);
  });
}

// ==========================================
// 1. GESTIÓN DE USUARIOS Y ROLES (Base_Datos)
// ==========================================
async function fetchUsuarios(showNotification = false) {
  const hint = document.getElementById("usersLoadingHint");
  if (hint) hint.textContent = "⏳ Cargando lista de personal desde Base_Datos...";

  try {
    const res = await fetch(`${VentasState.gasUrl}?action=getUsuarios`);
    const data = await res.json();

    if (data && data.success) {
      VentasState.usuarios.vendedores = Array.isArray(data.vendedores) ? data.vendedores : [];
      VentasState.usuarios.almacenistas = Array.isArray(data.almacenistas) ? data.almacenistas : [];

      if (hint) {
        hint.textContent = `✅ Personal sincronizado (${VentasState.usuarios.vendedores.length} vendedores, ${VentasState.usuarios.almacenistas.length} almacenistas).`;
      }
      if (showNotification) {
        showToast("Lista de personal actualizada desde Base_Datos", "success");
      }
    } else {
      if (hint) {
        hint.textContent =
          "⚠️ Asegúrate de haber publicado SolicitudesVentas.gs en Apps Script y tener las columnas Vendedores y Almacenistas en Base_Datos.";
      }
    }
  } catch (err) {
    console.warn("Error al consultar getUsuarios:", err);
    if (hint) {
      hint.textContent = "⚠️ No se pudo conectar con Google Apps Script. Verifica tu conexión o la URL en ⚙️.";
    }
  }

  if (VentasState.selectedRole) {
    populateRoleUsersDropdown(VentasState.selectedRole);
  }
}

function selectRoleOption(role) {
  VentasState.selectedRole = role;

  const btnVend = document.getElementById("btnSelectRoleVendedor");
  const btnAlm = document.getElementById("btnSelectRoleAlmacenista");
  const container = document.getElementById("userDropdownContainer");
  const label = document.getElementById("userSelectLabel");

  if (role === "Vendedor") {
    btnVend.className =
      "group relative flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-red-500 bg-red-950/30 text-center shadow-lg shadow-red-950/40 transition";
    btnAlm.className =
      "group relative flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-slate-700 bg-slate-800/60 hover:border-amber-500 transition text-center";
    if (label) label.textContent = "Selecciona tu nombre de Vendedor (Base_Datos)";
  } else {
    btnAlm.className =
      "group relative flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-amber-500 bg-amber-950/30 text-center shadow-lg shadow-amber-950/40 transition";
    btnVend.className =
      "group relative flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-slate-700 bg-slate-800/60 hover:border-red-500 transition text-center";
    if (label) label.textContent = "Selecciona tu nombre de Almacenista (Base_Datos)";
  }

  container?.classList.remove("hidden");
  populateRoleUsersDropdown(role);
}

function populateRoleUsersDropdown(role) {
  const select = document.getElementById("userSelectDropdown");
  const btnEnter = document.getElementById("btnEnterApp");
  if (!select) return;

  const list =
    role === "Vendedor" ? VentasState.usuarios.vendedores : VentasState.usuarios.almacenistas;

  select.innerHTML = `<option value="">-- Selecciona tu nombre (${role}) --</option>`;

  list.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === VentasState.selectedUser) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  if (btnEnter) {
    btnEnter.disabled = !select.value;
  }
}

function enterActiveRoleModule() {
  document.getElementById("roleSelectionView")?.classList.add("hidden");

  const sessionBadge = document.getElementById("activeSessionBadge");
  const roleBadge = document.getElementById("activeRoleBadge");
  const userName = document.getElementById("activeUserName");

  if (sessionBadge && roleBadge && userName) {
    sessionBadge.classList.remove("hidden");
    sessionBadge.classList.add("flex");
    roleBadge.textContent = VentasState.selectedRole === "Vendedor" ? "💼 VENDEDOR" : "📦 ALMACÉN";
    roleBadge.className =
      VentasState.selectedRole === "Vendedor"
        ? "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-600 text-white"
        : "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950";
    userName.textContent = VentasState.selectedUser;
  }

  VentasState.initialSnapshotLoaded = false;

  if (VentasState.selectedRole === "Vendedor") {
    document.getElementById("almacenModuleView")?.classList.add("hidden");
    document.getElementById("ventasModuleView")?.classList.remove("hidden");
    updateCartUI();
    fetchCatalog(false);
    fetchSolicitudes(true);
    startPolling();
  } else {
    document.getElementById("ventasModuleView")?.classList.add("hidden");
    document.getElementById("cartFloatingBar")?.classList.add("hidden");
    document.getElementById("almacenModuleView")?.classList.remove("hidden");
    updateAlmacenFilterButtons();
    fetchSolicitudes(true);
    startPolling();
  }
}

// ==========================================
// 2. MÓDULO DE VENTAS: CATÁLOGO Y BUSCADOR MULTI-CAMPO
// ==========================================
function switchVentasTab(tabName) {
  VentasState.activeVentasTab = tabName;
  const tabCat = document.getElementById("tabVentasCatalogo");
  const tabSol = document.getElementById("tabVentasMisSolicitudes");
  const secCat = document.getElementById("ventasCatalogoSection");
  const secSol = document.getElementById("ventasMisSolicitudesSection");

  if (tabName === "catalogo") {
    tabCat.className =
      "flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition bg-gac-red text-white shadow";
    tabSol.className =
      "relative flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition text-slate-300 hover:text-white hover:bg-slate-800";
    secCat?.classList.remove("hidden");
    secSol?.classList.add("hidden");
  } else {
    tabSol.className =
      "relative flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition bg-gac-red text-white shadow";
    tabCat.className =
      "flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition text-slate-300 hover:text-white hover:bg-slate-800";
    secCat?.classList.add("hidden");
    secSol?.classList.remove("hidden");
    renderMisSolicitudesSeller();
  }
}

async function fetchCatalog(showNotification = false) {
  const grid = document.getElementById("catalogGrid");
  if (grid && VentasState.catalog.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
        <div class="inline-block w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p class="text-sm font-bold text-slate-200">Cargando catálogo de repuestos desde Google Sheets...</p>
      </div>
    `;
  }

  try {
    const res = await fetch(`${VentasState.gasUrl}?action=getCatalog`);
    const data = await res.json();

    if (data && data.success && Array.isArray(data.items)) {
      VentasState.catalog = data.items;
      populateCatalogSpecificFilters();
      applyMultiFieldCatalogFilter();
      if (showNotification) {
        showToast(`Catálogo actualizado (${data.items.length} repuestos)`, "success");
      }
    } else {
      throw new Error(data.error || "Respuesta inválida en getCatalog");
    }
  } catch (err) {
    console.error("Error cargando catálogo:", err);
    if (grid && VentasState.catalog.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full bg-slate-900 border border-red-900/60 rounded-2xl p-8 text-center space-y-2">
          <p class="text-base font-extrabold text-red-400">⚠️ No se pudo obtener el catálogo</p>
          <p class="text-xs text-slate-400">Verifica que SolicitudesVentas.gs esté desplegado en Google Apps Script.</p>
        </div>
      `;
    }
  }
}

/**
 * Obtiene el Stock estrictamente desde EXIST_VIRTUAL (Stock_Virtual)
 */
function getVirtualStock(item) {
  if (item.Stock_Virtual !== undefined && item.Stock_Virtual !== null && item.Stock_Virtual !== "") {
    return Number(item.Stock_Virtual) || 0;
  }
  return Number(item.Stock) || 0;
}

/**
 * Pobla dinámicamente los selectores específicos de MODELO y APLICA A a partir del catálogo cargado
 */
function populateCatalogSpecificFilters() {
  const modeloSelect = document.getElementById("filterModeloSelect");
  const aplicaSelect = document.getElementById("filterAplicaASelect");
  if (!modeloSelect || !aplicaSelect) return;

  const prevModelo = modeloSelect.value;
  const prevAplica = aplicaSelect.value;

  const modelosSet = new Set();
  const aplicaSet = new Set();

  VentasState.catalog.forEach((item) => {
    const mod = (item.Modelo || "").toString().trim();
    if (mod) modelosSet.add(mod);

    const rawAplica = (item.Aplica_A || "").toString().trim();
    if (rawAplica) {
      // Soportar tanto valores individuales como etiquetas separadas por coma en APLICA A
      rawAplica
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((tag) => aplicaSet.add(tag));
    }
  });

  const sortedModelos = Array.from(modelosSet).sort((a, b) => a.localeCompare(b));
  const sortedAplica = Array.from(aplicaSet).sort((a, b) => a.localeCompare(b));

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

/**
 * Buscador Inteligente Multi-Campo en Tiempo Real + Filtros Específicos (MODELO y APLICA A):
 * Permite combinar la búsqueda libre con el selector de MODELO, el selector de APLICA A y Stock Virtual.
 */
function normalizeSearchText(str) {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function applyMultiFieldCatalogFilter() {
  const queryRaw = document.getElementById("multiSearchInput")?.value || "";
  const selectedModelo = (document.getElementById("filterModeloSelect")?.value || "").trim();
  const selectedAplica = (document.getElementById("filterAplicaASelect")?.value || "").trim();
  const onlyWithStock = document.getElementById("chkOnlyStock")?.checked || false;

  const tokens = normalizeSearchText(queryRaw)
    .split(/\s+/)
    .filter(Boolean);

  const normSelectedModelo = normalizeSearchText(selectedModelo);
  const normSelectedAplica = normalizeSearchText(selectedAplica);

  VentasState.filteredCatalog = VentasState.catalog.filter((item) => {
    const virtualStock = getVirtualStock(item);
    if (onlyWithStock && virtualStock <= 0) {
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
        item.Categoria,
        item.Ubicacion_Almacen
      ].join(" ")
    );

    // Todos los tokens escritos deben coincidir en al menos uno de los campos del repuesto
    return tokens.every((token) => searchableComposite.includes(token));
  });

  renderCatalogGrid();
}

// ==========================================
// HELPERS PARA FOTOS DE GOOGLE DRIVE Y GALERÍA
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
 * 4) Placeholder visual limpio de GAC Motors
 */
window.handleDriveImgError = function (imgEl, rawUrl) {
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

  // Fallback final: insignia limpia con buen contraste
  imgEl.onerror = null;
  imgEl.src = "./assets/logo-gac.png";
  imgEl.className = "h-12 w-auto object-contain bg-white/90 px-3 py-1.5 rounded-xl shadow";
};

function renderCatalogGrid() {
  const grid = document.getElementById("catalogGrid");
  const countEl = document.getElementById("catalogResultCount");
  if (!grid) return;

  if (countEl) {
    countEl.textContent = String(VentasState.filteredCatalog.length);
  }

  if (VentasState.filteredCatalog.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full bg-slate-900/80 border border-slate-800 rounded-2xl p-10 text-center">
        <p class="text-3xl mb-2">🔍</p>
        <p class="text-base font-bold text-white">No se encontraron repuestos con ese criterio</p>
        <p class="text-xs text-slate-400 mt-1">Prueba buscando por Descripción, Marca, Modelo o Compatibilidad (ej: "Filtro GS3", "DFSK").</p>
      </div>
    `;
    return;
  }

  // Renderizar hasta 120 tarjetas para mantener fluidez instantánea en móviles
  const itemsToShow = VentasState.filteredCatalog.slice(0, 120);

  grid.innerHTML = itemsToShow
    .map((item) => {
      const sku = escapeHtml(item.Codigo || item.SKU_Articulo || "S/C");
      const desc = escapeHtml(item.Descripcion || "Sin descripción");
      const marca = escapeHtml(item.Marca || "GAC");
      const modelo = escapeHtml(item.Modelo || "");
      const aplica = escapeHtml(item.Aplica_A || "");
      const ubicacion = escapeHtml(item.Ubicacion_Almacen || "SIN UBICACIÓN");
      const stock = getVirtualStock(item);

      const photoList = getItemPhotoList(item);
      const rawMainUrl = photoList.length > 0 ? photoList[0] : "";
      const displayImgUrl = rawMainUrl ? escapeHtml(formatDriveImageUrl(rawMainUrl)) : "";
      const escapedRawUrl = escapeHtml(rawMainUrl);

      const inCartItem = VentasState.cart.find(
        (c) => String(c.SKU_Articulo) === String(item.Codigo || item.SKU_Articulo)
      );
      const inCartQty = inCartItem ? inCartItem.Cantidad : 0;

      const stockBadgeClass =
        stock > 0
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
          : "bg-red-500/15 border-red-500/40 text-red-300";

      return `
        <article class="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden flex flex-col justify-between shadow-lg transition">
          <div>
            <!-- Cabecera: Imagen + Stock + SKU -->
            <div class="relative h-48 bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800/80">
              ${
                displayImgUrl
                  ? `<img
                      src="${displayImgUrl}"
                      alt="${desc}"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                      data-preview-sku="${sku}"
                      data-fallback-step="0"
                      class="btn-preview-img w-full h-full object-contain bg-slate-950 p-1 cursor-zoom-in hover:scale-105 transition duration-300"
                      onerror="window.handleDriveImgError(this, '${escapedRawUrl}')"
                    />`
                  : `<div class="flex flex-col items-center justify-center text-slate-400">
                      <div class="bg-white/90 px-3 py-1.5 rounded-xl mb-1.5 shadow">
                        <img src="./assets/logo-gac.png" alt="GAC" class="h-6 w-auto object-contain" />
                      </div>
                      <span class="text-[11px] font-semibold text-slate-500">Sin fotografía</span>
                    </div>`
              }

              <!-- Badge SKU -->
              <span class="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-slate-950/90 backdrop-blur border border-slate-700 text-[11px] font-black text-white">
                SKU: ${sku}
              </span>

              <!-- Badge Stock Actual -->
              <span class="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg border backdrop-blur text-xs font-black ${stockBadgeClass}">
                Stock: ${stock}
              </span>

              ${
                photoList.length > 0
                  ? `<button
                      type="button"
                      data-preview-sku="${sku}"
                      class="btn-preview-img absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-slate-950/90 hover:bg-gac-red border border-slate-700 text-[11px] font-extrabold text-white shadow transition"
                    >
                      🔍 Ver ${photoList.length > 1 ? `(${photoList.length} fotos)` : "foto"}
                    </button>`
                  : ""
              }
            </div>

            <!-- Cuerpo de la Tarjeta -->
            <div class="p-4 space-y-3">
              <!-- Destacado en grande de Ubicacion_Almacen -->
              <div class="bg-amber-500/10 border-2 border-amber-500/40 rounded-xl px-3 py-2 flex items-center justify-between">
                <span class="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                  📍 UBICACIÓN
                </span>
                <span class="text-sm sm:text-base font-black text-amber-300 tracking-tight truncate max-w-[180px]" title="${ubicacion}">
                  ${ubicacion}
                </span>
              </div>

              <!-- Descripción del Repuesto -->
              <h3 class="text-sm sm:text-base font-extrabold text-white leading-snug line-clamp-2" title="${desc}">
                ${desc}
              </h3>

              <!-- Marca, Modelo y Aplica A (Compatibilidad) -->
              <div class="flex flex-wrap gap-1.5 text-[11px]">
                <span class="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 font-bold">
                  🚗 ${marca}${modelo ? " • " + modelo : ""}
                </span>
                ${
                  aplica
                    ? `<span class="px-2 py-0.5 rounded-md bg-blue-950/80 border border-blue-800/60 text-blue-300 font-semibold truncate max-w-full" title="Aplica a: ${aplica}">
                        🔧 Aplica: ${aplica}
                      </span>`
                    : ""
                }
              </div>
            </div>
          </div>

          <!-- Pie de Tarjeta: Controles de Cantidad y Añadir al Carrito -->
          <div class="p-3.5 pt-0">
            <div class="flex items-center gap-2 pt-2.5 border-t border-slate-800/80">
              <div class="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden">
                <button
                  type="button"
                  data-qty-minus="${sku}"
                  class="px-2.5 py-2 text-slate-300 hover:bg-slate-800 font-black text-sm"
                >−</button>
                <input
                  type="number"
                  id="qty_input_${sku}"
                  value="1"
                  min="1"
                  max="99"
                  class="w-11 text-center bg-transparent text-white font-extrabold text-sm focus:outline-none"
                />
                <button
                  type="button"
                  data-qty-plus="${sku}"
                  class="px-2.5 py-2 text-slate-300 hover:bg-slate-800 font-black text-sm"
                >+</button>
              </div>

              <button
                type="button"
                data-add-sku="${sku}"
                class="btn-add-to-cart flex-1 py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${
                  inCartQty > 0
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                    : "bg-gac-red hover:bg-gac-redHover text-white"
                }"
              >
                <span>${inCartQty > 0 ? `✓ En Carrito (${inCartQty})` : "+ Solicitar"}</span>
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  // Eventos de los botones dentro del Grid
  grid.querySelectorAll("[data-qty-minus]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sku = btn.getAttribute("data-qty-minus");
      const input = document.getElementById(`qty_input_${sku}`);
      if (input) {
        const current = parseInt(input.value, 10) || 1;
        input.value = String(Math.max(1, current - 1));
      }
    });
  });

  grid.querySelectorAll("[data-qty-plus]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sku = btn.getAttribute("data-qty-plus");
      const input = document.getElementById(`qty_input_${sku}`);
      if (input) {
        const current = parseInt(input.value, 10) || 1;
        input.value = String(Math.min(99, current + 1));
      }
    });
  });

  grid.querySelectorAll(".btn-add-to-cart").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sku = btn.getAttribute("data-add-sku");
      const input = document.getElementById(`qty_input_${sku}`);
      const qty = input ? Math.max(1, parseInt(input.value, 10) || 1) : 1;
      addItemToCart(sku, qty);
    });
  });

  grid.querySelectorAll(".btn-preview-img").forEach((el) => {
    el.addEventListener("click", () => {
      const sku = el.getAttribute("data-preview-sku");
      openItemGalleryModal(sku);
    });
  });
}

function openItemGalleryModal(sku) {
  const item = VentasState.catalog.find(
    (it) => String(it.Codigo || it.SKU_Articulo) === String(sku)
  );
  if (!item) return;

  const photoList = getItemPhotoList(item);
  if (photoList.length === 0) {
    showToast("Este repuesto no tiene fotografías registradas.", "info");
    return;
  }

  VentasState.previewGallery = photoList;
  VentasState.previewIndex = 0;
  VentasState.previewTitle = `${item.Descripcion || "Repuesto"} (SKU: ${item.Codigo || item.SKU_Articulo})`;

  renderActivePreviewModal();
  document.getElementById("imagePreviewModal")?.classList.remove("hidden");
}

function stepPreviewGallery(delta) {
  const total = VentasState.previewGallery.length;
  if (total <= 1) return;
  VentasState.previewIndex = (VentasState.previewIndex + delta + total) % total;
  renderActivePreviewModal();
}

function renderActivePreviewModal() {
  const imgEl = document.getElementById("imagePreviewElement");
  const titleEl = document.getElementById("imagePreviewTitle");
  const counterEl = document.getElementById("imagePreviewCounter");
  const btnPrev = document.getElementById("btnPrevPreviewImg");
  const btnNext = document.getElementById("btnNextPreviewImg");
  const thumbsBox = document.getElementById("imagePreviewThumbs");

  if (!imgEl) return;

  const total = VentasState.previewGallery.length;
  const rawUrl = VentasState.previewGallery[VentasState.previewIndex] || "";
  const formattedUrl = formatDriveImageUrl(rawUrl);

  if (titleEl) titleEl.textContent = VentasState.previewTitle;
  if (counterEl) {
    counterEl.textContent = `Fotografía ${VentasState.previewIndex + 1} de ${total}`;
  }

  imgEl.setAttribute("data-fallback-step", "0");
  imgEl.className = "max-h-[64vh] w-auto object-contain rounded-xl transition";
  imgEl.onerror = function () {
    window.handleDriveImgError(this, rawUrl);
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
      thumbsBox.innerHTML = VentasState.previewGallery
        .map((u, idx) => {
          const thumbUrl = escapeHtml(formatDriveImageUrl(u));
          const activeClass =
            idx === VentasState.previewIndex
              ? "ring-2 ring-red-500 opacity-100 scale-105"
              : "opacity-60 hover:opacity-100";
          return `
            <button
              type="button"
              data-thumb-idx="${idx}"
              class="w-14 h-14 rounded-xl overflow-hidden bg-slate-950 border border-slate-700 shrink-0 transition ${activeClass}"
            >
              <img
                src="${thumbUrl}"
                alt="Miniatura ${idx + 1}"
                referrerpolicy="no-referrer"
                class="w-full h-full object-cover"
                onerror="window.handleDriveImgError(this, '${escapeHtml(u)}')"
              />
            </button>
          `;
        })
        .join("");

      thumbsBox.querySelectorAll("[data-thumb-idx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          VentasState.previewIndex = parseInt(btn.getAttribute("data-thumb-idx"), 10) || 0;
          renderActivePreviewModal();
        });
      });
    } else {
      thumbsBox.classList.add("hidden");
      thumbsBox.innerHTML = "";
    }
  }
}

// ==========================================
// 3. CARRITO ULTRA-ÁGIL (MÁX. 20 ARTÍCULOS, PRIORIDAD Y ENVÍO)
// ==========================================
function addItemToCart(sku, quantityToAdd = 1) {
  const catalogItem = VentasState.catalog.find(
    (it) => String(it.Codigo || it.SKU_Articulo) === String(sku)
  );
  if (!catalogItem) return;

  const existingIndex = VentasState.cart.findIndex((c) => String(c.SKU_Articulo) === String(sku));

  if (existingIndex !== -1) {
    VentasState.cart[existingIndex].Cantidad += quantityToAdd;
    showToast(`Cantidad actualizada (${VentasState.cart[existingIndex].Cantidad})`, "success");
  } else {
    if (VentasState.cart.length >= MAX_CART_ITEMS) {
      showToast(`Límite máximo alcanzado: ${MAX_CART_ITEMS} artículos por solicitud.`, "error");
      return;
    }
    VentasState.cart.push({
      SKU_Articulo: String(catalogItem.Codigo || catalogItem.SKU_Articulo),
      Descripcion_Repuesto: catalogItem.Descripcion || "Sin descripción",
      Ubicacion_Almacen: catalogItem.Ubicacion_Almacen || "SIN UBICACIÓN",
      Cantidad: quantityToAdd,
      Observacion_Vendedor: "",
      Stock: getVirtualStock(catalogItem),
      Imagen_URL: catalogItem.Imagen_URL || ""
    });
    showToast("Repuesto añadido al pedido", "success");
  }

  updateCartUI();
  renderCatalogGrid();
}

function updateCartUI() {
  const bar = document.getElementById("cartFloatingBar");
  const bubble = document.getElementById("cartCountBubble");
  const totalText = document.getElementById("cartTotalItemsText");

  const distinctItems = VentasState.cart.length;

  if (bubble) bubble.textContent = String(distinctItems);
  if (totalText) totalText.textContent = String(distinctItems);

  if (bar) {
    if (VentasState.selectedRole === "Vendedor" && distinctItems > 0) {
      bar.classList.remove("hidden");
    } else {
      bar.classList.add("hidden");
    }
  }
}

function setCartPriority(priority) {
  VentasState.cartPriority = priority;
  const btnNorm = document.getElementById("btnPriorityNormal");
  const btnUrg = document.getElementById("btnPriorityUrgente");

  if (!btnNorm || !btnUrg) return;

  if (priority === "Urgente") {
    btnUrg.className =
      "py-3 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider border-2 transition flex items-center justify-center gap-2 bg-red-600 border-red-400 text-white shadow-lg shadow-red-950/60";
    btnNorm.className =
      "py-3 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider border-2 transition flex items-center justify-center gap-2 bg-slate-900 border-slate-700 text-slate-300 hover:border-blue-500";
  } else {
    btnNorm.className =
      "py-3 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider border-2 transition flex items-center justify-center gap-2 bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-950/50";
    btnUrg.className =
      "py-3 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider border-2 transition flex items-center justify-center gap-2 bg-slate-900 border-slate-700 text-slate-300 hover:border-red-500";
  }
}

function renderCartDrawerItems() {
  const container = document.getElementById("cartItemsContainer");
  if (!container) return;

  if (VentasState.cart.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-400">
        <p class="text-2xl mb-1">🛒</p>
        <p class="text-sm font-bold">Tu carrito está vacío</p>
      </div>
    `;
    return;
  }

  container.innerHTML = VentasState.cart
    .map((item, idx) => {
      return `
        <div class="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-black text-slate-200">
                  SKU: ${escapeHtml(item.SKU_Articulo)}
                </span>
                <span class="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] font-extrabold text-amber-300">
                  📍 ${escapeHtml(item.Ubicacion_Almacen)}
                </span>
              </div>
              <p class="text-xs sm:text-sm font-bold text-white truncate mt-1">
                ${escapeHtml(item.Descripcion_Repuesto)}
              </p>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-cart-dec="${idx}"
                class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-black text-xs"
              >−</button>
              <span class="w-8 text-center font-black text-sm text-white">${item.Cantidad}</span>
              <button
                type="button"
                data-cart-inc="${idx}"
                class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-black text-xs"
              >+</button>
              <button
                type="button"
                data-cart-del="${idx}"
                class="w-7 h-7 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 font-bold text-xs ml-1"
                title="Quitar artículo"
              >✕</button>
            </div>
          </div>

          <!-- Campo de Observación específica del Vendedor para este artículo -->
          <div>
            <input
              type="text"
              data-cart-obs="${idx}"
              value="${escapeHtml(item.Observacion_Vendedor || "")}"
              placeholder="✏️ Observación para este artículo (ej: Lado derecho, verificar muestra, urgente cliente...)"
              class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-red-500 transition"
            />
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll("[data-cart-obs]").forEach((input) => {
    input.addEventListener("input", (e) => {
      const idx = parseInt(input.getAttribute("data-cart-obs"), 10);
      if (VentasState.cart[idx]) {
        VentasState.cart[idx].Observacion_Vendedor = e.target.value;
      }
    });
  });

  container.querySelectorAll("[data-cart-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-cart-dec"), 10);
      if (VentasState.cart[idx]) {
        if (VentasState.cart[idx].Cantidad > 1) {
          VentasState.cart[idx].Cantidad--;
        } else {
          VentasState.cart.splice(idx, 1);
        }
        updateCartUI();
        renderCartDrawerItems();
        renderCatalogGrid();
      }
    });
  });

  container.querySelectorAll("[data-cart-inc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-cart-inc"), 10);
      if (VentasState.cart[idx]) {
        VentasState.cart[idx].Cantidad++;
        updateCartUI();
        renderCartDrawerItems();
      }
    });
  });

  container.querySelectorAll("[data-cart-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-cart-del"), 10);
      VentasState.cart.splice(idx, 1);
      updateCartUI();
      renderCartDrawerItems();
      renderCatalogGrid();
    });
  });
}

async function submitCartSolicitud() {
  if (VentasState.cart.length === 0) {
    showToast("Agrega al menos un repuesto al carrito", "error");
    return;
  }
  if (VentasState.cart.length > MAX_CART_ITEMS) {
    showToast(`Máximo permitido: ${MAX_CART_ITEMS} artículos por pedido`, "error");
    return;
  }

  const btnSubmit = document.getElementById("btnSubmitSolicitud");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Enviando...`;
  }

  const payload = {
    action: "crearSolicitud",
    vendedor: VentasState.selectedUser,
    prioridad: VentasState.cartPriority,
    items: VentasState.cart.map((it) => ({
      SKU_Articulo: it.SKU_Articulo,
      Descripcion_Repuesto: it.Descripcion_Repuesto,
      Ubicacion_Almacen: it.Ubicacion_Almacen,
      Cantidad: it.Cantidad,
      Observacion_Vendedor: (it.Observacion_Vendedor || "").trim()
    }))
  };

  try {
    const res = await fetch(VentasState.gasUrl, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data && data.success) {
      const createdId = data.idSolicitud || "SOL-XXXX";
      // Registrar como Pendiente en el mapa del vendedor para detectar cuando Almacén responda luego
      VentasState.knownSellerStatusMap[createdId] = "Pendiente";

      VentasState.cart = [];
      setCartPriority("Normal");
      updateCartUI();
      renderCatalogGrid();
      document.getElementById("cartDrawerModal")?.classList.add("hidden");

      showToast(`¡Solicitud ${createdId} enviada a Almacén!`, "success");
      await fetchSolicitudes(false);
      switchVentasTab("misSolicitudes");
    } else {
      showToast("Error al crear solicitud: " + (data.error || "Desconocido"), "error");
    }
  } catch (err) {
    showToast("Error de red al enviar solicitud: " + err.message, "error");
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<span>🚀 Enviar Solicitud</span>`;
    }
  }
}

// ==========================================
// 4. POLLING CADA 30 SEGUNDOS Y SISTEMA DE ALERTAS EN VIVO
// ==========================================
function startPolling() {
  stopPolling();
  VentasState.pollingTimer = setInterval(() => {
    fetchSolicitudes(false);
  }, POLLING_INTERVAL_MS);
}

function stopPolling() {
  if (VentasState.pollingTimer) {
    clearInterval(VentasState.pollingTimer);
    VentasState.pollingTimer = null;
  }
}

async function fetchSolicitudes(isInitialLoad = false, manualNotify = false) {
  try {
    const res = await fetch(`${VentasState.gasUrl}?action=getSolicitudes`);
    const data = await res.json();

    if (!data || !data.success || !Array.isArray(data.solicitudes)) {
      return;
    }

    const incomingList = data.solicitudes;
    processLiveAlerts(incomingList, isInitialLoad || !VentasState.initialSnapshotLoaded);

    VentasState.solicitudes = incomingList;
    VentasState.initialSnapshotLoaded = true;

    if (VentasState.selectedRole === "Vendedor") {
      renderMisSolicitudesSeller();
    } else if (VentasState.selectedRole === "Almacenista") {
      renderAlmacenBoard();
    }

    if (manualNotify) {
      showToast("Solicitudes sincronizadas en tiempo real", "success");
    }
  } catch (err) {
    console.warn("Error en polling getSolicitudes():", err);
  }
}

/**
 * Evalúa cambios entre el estado previo y el nuevo para disparar:
 * - VENDEDOR: Chime suave + Banner verde "✅ Solicitud #SOL-XXXX respondida por [Almacenista]: [Estado/Notas]"
 * - ALMACÉN: Campana clara + Banner rojo "🚨 ¡NUEVA SOLICITUD #SOL-XXXX DE [VENDEDOR]!"
 */
function processLiveAlerts(incomingList, isFirstSnapshot) {
  const currentSeller = (VentasState.selectedUser || "").toLowerCase().trim();

  if (isFirstSnapshot) {
    VentasState.knownSellerStatusMap = {};
    VentasState.knownWarehousePendingIds = new Set();

    incomingList.forEach((sol) => {
      if ((sol.vendedor || "").toLowerCase().trim() === currentSeller) {
        VentasState.knownSellerStatusMap[sol.idSolicitud] = sol.status || "Pendiente";
      }
      if ((sol.status || "Pendiente") === "Pendiente") {
        VentasState.knownWarehousePendingIds.add(sol.idSolicitud);
      }
    });
    return;
  }

  // A. Alertas para el VENDEDOR activo
  if (VentasState.selectedRole === "Vendedor") {
    incomingList.forEach((sol) => {
      if ((sol.vendedor || "").toLowerCase().trim() !== currentSeller) return;

      const prevStatus = VentasState.knownSellerStatusMap[sol.idSolicitud];
      const newStatus = sol.status || "Pendiente";

      if (prevStatus && prevStatus !== newStatus && newStatus !== "Pendiente") {
        playSellerNotificationChime();
        const almName = sol.almacenista || "Almacén";
        const notaText = sol.observacion ? ` — "${sol.observacion}"` : "";
        showLiveBanner({
          type: "seller-success",
          title: `✅ Solicitud #${sol.idSolicitud} respondida por ${almName}: ${newStatus}${notaText}`,
          subtitle: `Actualizado a las ${sol.fechaRespuesta || sol.fechaHora}`
        });
      }

      VentasState.knownSellerStatusMap[sol.idSolicitud] = newStatus;
    });
  }

  // B. Alertas para el ALMACENISTA activo
  if (VentasState.selectedRole === "Almacenista") {
    incomingList.forEach((sol) => {
      const status = sol.status || "Pendiente";
      if (status === "Pendiente" && !VentasState.knownWarehousePendingIds.has(sol.idSolicitud)) {
        VentasState.knownWarehousePendingIds.add(sol.idSolicitud);
        playWarehouseAlertBell();
        showLiveBanner({
          type: "warehouse-urgent",
          title: `🚨 ¡NUEVA SOLICITUD #${sol.idSolicitud} DE ${(sol.vendedor || "VENDEDOR").toUpperCase()}!`,
          subtitle: `Prioridad: ${sol.prioridad || "Normal"} • ${sol.items?.length || 1} artículo(s) requerido(s)`
        });
      }
    });
  }
}

// ==========================================
// 5. VISTA "MIS SOLICITUDES" (VENDEDOR)
// ==========================================
function renderMisSolicitudesSeller() {
  const container = document.getElementById("misSolicitudesList");
  const badgeCount = document.getElementById("badgeMisSolicitudesCount");
  if (!container) return;

  const currentSeller = (VentasState.selectedUser || "").toLowerCase().trim();
  const myRequests = VentasState.solicitudes
    .filter((s) => (s.vendedor || "").toLowerCase().trim() === currentSeller)
    .slice()
    .reverse();

  if (badgeCount) {
    badgeCount.textContent = String(myRequests.length);
  }

  if (myRequests.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
        <p class="text-3xl mb-2">📋</p>
        <p class="text-base font-bold text-white">Aún no has enviado solicitudes</p>
        <p class="text-xs text-slate-400 mt-1">Selecciona repuestos en el Catálogo y envíalos al mostrador de almacén.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = myRequests
    .map((sol) => {
      const status = sol.status || "Pendiente";
      const isUrgent = (sol.prioridad || "").toLowerCase() === "urgente";

      let statusBadge =
        `<span class="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black uppercase">⏳ Pendiente en Almacén</span>`;
      if (status === "Despachado") {
        statusBadge =
          `<span class="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black uppercase">✅ Despachado</span>`;
      } else if (status === "No Procesar") {
        statusBadge =
          `<span class="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-black uppercase">⛔ No Procesar</span>`;
      }

      const priorityBadge = isUrgent
        ? `<span class="px-2.5 py-0.5 rounded-md bg-red-600 text-white text-[11px] font-black uppercase">🚨 Urgente</span>`
        : `<span class="px-2.5 py-0.5 rounded-md bg-blue-600 text-white text-[11px] font-black uppercase">🔵 Normal</span>`;

      const itemsHtml = (sol.items || [])
        .map(
          (it) => `
            <div class="py-2.5 px-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs space-y-1">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <span class="font-black text-slate-300">[${escapeHtml(it.SKU_Articulo)}]</span>
                  <span class="font-semibold text-white ml-1">${escapeHtml(it.Descripcion_Repuesto)}</span>
                  <span class="ml-2 text-amber-300 font-bold">📍 ${escapeHtml(it.Ubicacion_Almacen)}</span>
                </div>
                <span class="px-2.5 py-1 rounded-lg bg-slate-800 text-white font-black shrink-0">
                  Cant: ${it.Cantidad}
                </span>
              </div>
              ${
                it.Observacion_Vendedor
                  ? `<p class="text-[11px] text-blue-300 font-semibold pl-1">
                      📝 Nota Vendedor: "${escapeHtml(it.Observacion_Vendedor)}"
                    </p>`
                  : ""
              }
            </div>
          `
        )
        .join("");

      const obsAlmacenTexto = sol.observacionAlmacen || sol.observacion || "";
      const responseBox =
        status !== "Pendiente" || obsAlmacenTexto || sol.almacenista
          ? `
            <div class="mt-3 p-3 rounded-xl border ${
              status === "Despachado"
                ? "bg-emerald-950/40 border-emerald-700/50 text-emerald-200"
                : "bg-red-950/40 border-red-700/50 text-red-200"
            } text-xs">
              <p class="font-extrabold">
                👤 Atendido por: <span class="underline">${escapeHtml(sol.almacenista || "Almacén")}</span>
                ${sol.fechaRespuesta ? ` • <span class="opacity-80">${escapeHtml(sol.fechaRespuesta)}</span>` : ""}
              </p>
              ${
                obsAlmacenTexto
                  ? `<p class="mt-1 font-semibold">💬 Observación Almacén: "${escapeHtml(obsAlmacenTexto)}"</p>`
                  : ""
              }
            </div>
          `
          : "";

      return `
        <article class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div class="flex items-center gap-2">
              <span class="text-base sm:text-lg font-black text-white">#${escapeHtml(sol.idSolicitud)}</span>
              ${priorityBadge}
              <span class="text-xs text-slate-400">${escapeHtml(sol.fechaHora || "")}</span>
            </div>
            ${statusBadge}
          </div>

          <div class="mt-3 space-y-1.5">
            ${itemsHtml}
          </div>

          ${responseBox}
        </article>
      `;
    })
    .join("");
}

// ==========================================
// 6. MÓDULO DE ALMACÉN: TABLERO DE RECOLECCIÓN Y DESPACHO
// ==========================================
function updateAlmacenFilterButtons() {
  document.querySelectorAll(".almacen-filter-btn").forEach((btn) => {
    const filterVal = btn.getAttribute("data-almacen-filter");
    if (filterVal === VentasState.almacenFilter) {
      btn.className =
        "almacen-filter-btn px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider bg-amber-500 text-slate-950 shadow transition";
    } else {
      btn.className =
        "almacen-filter-btn px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider bg-slate-800 text-slate-300 hover:bg-slate-700 transition";
    }
  });
}

function renderAlmacenBoard() {
  const board = document.getElementById("almacenBoardGrid");
  const countPendEl = document.getElementById("countAlmacenPendientes");
  const countAllEl = document.getElementById("countAlmacenTodas");
  if (!board) return;

  const allSolicitudes = VentasState.solicitudes.slice();
  const pendingCount = allSolicitudes.filter((s) => (s.status || "Pendiente") === "Pendiente").length;

  if (countPendEl) countPendEl.textContent = String(pendingCount);
  if (countAllEl) countAllEl.textContent = String(allSolicitudes.length);

  // Ordenar por Estado "Pendiente" primero y Prioridad "Urgente" primero
  allSolicitudes.sort((a, b) => {
    const aPend = (a.status || "Pendiente") === "Pendiente" ? 0 : 1;
    const bPend = (b.status || "Pendiente") === "Pendiente" ? 0 : 1;
    if (aPend !== bPend) return aPend - bPend;

    const aUrg = (a.prioridad || "").toLowerCase() === "urgente" ? 0 : 1;
    const bUrg = (b.prioridad || "").toLowerCase() === "urgente" ? 0 : 1;
    if (aUrg !== bUrg) return aUrg - bUrg;

    return String(b.idSolicitud).localeCompare(String(a.idSolicitud));
  });

  const filtered =
    VentasState.almacenFilter === "Pendiente"
      ? allSolicitudes.filter((s) => (s.status || "Pendiente") === "Pendiente")
      : allSolicitudes;

  if (filtered.length === 0) {
    board.innerHTML = `
      <div class="col-span-full bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
        <p class="text-4xl mb-2">✅</p>
        <p class="text-lg font-black text-white">No hay solicitudes pendientes por despachar</p>
        <p class="text-xs text-slate-400 mt-1">El radar sigue activo cada 30s. Sonará una campana al ingresar un nuevo pedido.</p>
      </div>
    `;
    return;
  }

  board.innerHTML = filtered
    .map((sol) => {
      const idSol = escapeHtml(sol.idSolicitud);
      const isPending = (sol.status || "Pendiente") === "Pendiente";
      const isUrgent = (sol.prioridad || "").toLowerCase() === "urgente";

      const cardBorder =
        isPending && isUrgent
          ? "border-2 border-red-500 urgent-card-glow"
          : isPending
          ? "border-2 border-amber-500/70"
          : "border border-slate-800 opacity-85";

      const priorityTag = isUrgent
        ? `<span class="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-black uppercase tracking-wider shadow">🚨 URGENTE</span>`
        : `<span class="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-wider">🔵 NORMAL</span>`;

      let statusTag = `<span class="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black uppercase">⏳ Pendiente</span>`;
      if (sol.status === "Despachado") {
        statusTag = `<span class="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black uppercase">✅ Despachado</span>`;
      } else if (sol.status === "No Procesar") {
        statusTag = `<span class="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-black uppercase">⛔ No Procesar</span>`;
      }

      const itemsListHtml = (sol.items || [])
        .map(
          (item) => `
            <div class="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="space-y-1.5 min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-slate-800 text-xs font-black text-white">
                    SKU: ${escapeHtml(item.SKU_Articulo)}
                  </span>
                  <span class="px-2.5 py-0.5 rounded-md bg-red-600/20 border border-red-500/40 text-red-300 text-xs font-black">
                    CANTIDAD: ${item.Cantidad}
                  </span>
                </div>
                <p class="text-sm sm:text-base font-extrabold text-white leading-snug">
                  ${escapeHtml(item.Descripcion_Repuesto)}
                </p>
                ${
                  item.Observacion_Vendedor
                    ? `<div class="px-2.5 py-1.5 rounded-xl bg-blue-950/70 border border-blue-700/60 text-blue-200 text-xs font-bold">
                        📝 Nota del Vendedor: "${escapeHtml(item.Observacion_Vendedor)}"
                      </div>`
                    : ""
                }
              </div>

              <!-- UBICACIÓN FÍSICA EN GRANDE Y NEGRITA PARA RECOLECCIÓN INMEDIATA -->
              <div class="shrink-0 bg-amber-500/15 border-2 border-amber-400 rounded-2xl px-4 py-2.5 text-center sm:text-right">
                <span class="block text-[10px] font-black uppercase tracking-widest text-amber-300">
                  📍 UBICACIÓN FÍSICA
                </span>
                <span class="block text-lg sm:text-xl font-black text-amber-300 tracking-tight">
                  ${escapeHtml(item.Ubicacion_Almacen || "SIN UBICACIÓN")}
                </span>
              </div>
            </div>
          `
        )
        .join("");

      const actionSectionHtml = isPending
        ? `
          <div class="pt-3 border-t border-slate-800 space-y-3">
            <div>
              <label for="obs_${idSol}" class="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Observaciones rápidas de Almacén (Opcional)
              </label>
              <input
                type="text"
                id="obs_${idSol}"
                placeholder="Ej: Entregado en mostrador / Stock incompleto / Pieza dañada..."
                class="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-400"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                data-dispatch-id="${idSol}"
                data-dispatch-state="Despachado"
                class="btn-warehouse-action py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-1.5"
              >
                <span>✅ Despachar</span>
              </button>

              <button
                type="button"
                data-dispatch-id="${idSol}"
                data-dispatch-state="No Procesar"
                class="btn-warehouse-action py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg transition flex items-center justify-center gap-1.5"
              >
                <span>⛔ No Procesar</span>
              </button>
            </div>
          </div>
        `
        : `
          <div class="pt-3 border-t border-slate-800 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
            <span>
              Procesado por: <strong class="text-white">${escapeHtml(sol.almacenista || "Almacén")}</strong>
              ${sol.observacion ? ` • Nota: <em>"${escapeHtml(sol.observacion)}"</em>` : ""}
            </span>
            <span class="text-slate-500">${escapeHtml(sol.fechaRespuesta || "")}</span>
          </div>
        `;

      return `
        <article class="bg-slate-900 ${cardBorder} rounded-3xl p-4 sm:p-5 shadow-xl flex flex-col justify-between space-y-4">
          <div class="space-y-3">
            <!-- Cabecera de la Solicitud -->
            <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xl sm:text-2xl font-black text-white">#${idSol}</span>
                  ${priorityTag}
                  ${statusTag}
                </div>
                <p class="text-xs sm:text-sm font-bold text-slate-300 mt-1">
                  💼 Vendedor: <span class="text-white font-black">${escapeHtml(sol.vendedor)}</span>
                  <span class="text-slate-500 ml-2">🕒 ${escapeHtml(sol.fechaHora)}</span>
                </p>
              </div>
            </div>

            <!-- Lista de Repuestos y Ubicaciones -->
            <div class="space-y-2.5">
              ${itemsListHtml}
            </div>
          </div>

          ${actionSectionHtml}
        </article>
      `;
    })
    .join("");

  // Eventos para botones "Despachar" y "No Procesar"
  board.querySelectorAll(".btn-warehouse-action").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idSolicitud = btn.getAttribute("data-dispatch-id");
      const nuevoEstado = btn.getAttribute("data-dispatch-state");
      const obsInput = document.getElementById(`obs_${idSolicitud}`);
      const observacion = obsInput ? obsInput.value.trim() : "";

      await handleWarehouseStatusUpdate(idSolicitud, nuevoEstado, observacion, btn);
    });
  });
}

async function handleWarehouseStatusUpdate(idSolicitud, nuevoEstado, observacion, buttonEl) {
  if (!idSolicitud || !nuevoEstado) return;

  const originalHtml = buttonEl.innerHTML;
  buttonEl.disabled = true;
  buttonEl.innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Procesando...`;

  try {
    const payload = {
      action: "actualizarEstadoSolicitud",
      idSolicitud: idSolicitud,
      nuevoEstado: nuevoEstado,
      nombreAlmacenista: VentasState.selectedUser,
      observacion: observacion
    };

    const res = await fetch(VentasState.gasUrl, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data && data.success) {
      showToast(`Solicitud #${idSolicitud} marcada como "${nuevoEstado}"`, "success");
      await fetchSolicitudes(false);
    } else {
      showToast("Error al actualizar: " + (data.error || "Desconocido"), "error");
      buttonEl.disabled = false;
      buttonEl.innerHTML = originalHtml;
    }
  } catch (err) {
    showToast("Error de red: " + err.message, "error");
    buttonEl.disabled = false;
    buttonEl.innerHTML = originalHtml;
  }
}

// ==========================================
// UTILIDADES GENERALES (TOAST & ESCAPE HTML)
// ==========================================
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  let colorClasses = "bg-slate-900 border-slate-700 text-white";
  if (type === "success") {
    colorClasses = "bg-emerald-950/95 border-emerald-500 text-emerald-100";
  } else if (type === "error") {
    colorClasses = "bg-red-950/95 border-red-500 text-red-100";
  }

  toast.className = `pointer-events-auto px-4 py-3 rounded-xl border shadow-xl text-xs sm:text-sm font-bold transition transform duration-300 ${colorClasses}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

