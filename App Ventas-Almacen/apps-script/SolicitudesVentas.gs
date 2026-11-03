/**
 * PROYECTO: Mostrador Digital Ventas-Almacén - GAC Motors
 * DESARROLLO & ARQUITECTURA: Victor Solorzano
 * ASISTENCIA TÉCNICA: OpenCode for Obsidian & Antigravity IDE
 * ROL: Controlador de APIs y Lógica de Base de Datos (Módulo Solicitudes Ventas-Almacén)
 */

// ==========================================
// CONFIGURACION DE HOJA Y PESTAÑAS
// ==========================================
var SPREADSHEET_ID_VENTAS = typeof SPREADSHEET_ID !== "undefined"
  ? SPREADSHEET_ID
  : "127o9T9u2r3BVVR-S9kq74FiGsxXCkifErOthQM0pv0k";

var SHEET_SOLICITUDES_VENTAS = "Solicitudes_Ventas";
var SHEET_REPUESTOS_VENTAS = "Repuestos";
var SHEET_BASE_DATOS_VENTAS = "Base_Datos";

// Encabezados oficiales confirmados para la pestaña Solicitudes_Ventas
var SOLICITUDES_HEADERS = [
  "N# Solicitud",
  "Fecha_Hora",
  "Vendedor",
  "SKU_Articulo",
  "Descripcion_Repuesto",
  "Ubicacion_Almacen",
  "Cantidad",
  "Prioridad",
  "Status",
  "Observacion_Vendedor",
  "Almacenista",
  "Observacion_Almacen",
  "Fecha_Hora_Repuesta"
];

/**
 * ==========================================
 * ROUTER UNIFICADO (doGet / doPost)
 * ==========================================
 * Atiende tanto las acciones de la App 1 (Inventario) como las de la App 2 (Mostrador Ventas-Almacén).
 */
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || "";

    // --- Endpoints App 1: Inventario Almacén (Preservados intactos) ---
    if (action === "getFilters" && typeof getFilterData === "function") {
      return jsonResponseVentas(getFilterData());
    } else if (action === "search" && typeof searchRepuesto === "function") {
      var query = params.query ? params.query.toString().trim() : "";
      return jsonResponseVentas(searchRepuesto(query));
    }

    // --- Endpoints App 2: Mostrador Digital Ventas-Almacén ---
    else if (action === "getUsuarios") {
      return jsonResponseVentas(getUsuarios());
    } else if (action === "getCatalog") {
      return jsonResponseVentas(getCatalog());
    } else if (action === "getSolicitudes") {
      return jsonResponseVentas(getSolicitudes());
    } else {
      return jsonResponseVentas({
        success: true,
        message: "API Unificada GAC Motors (Inventario + Mostrador Ventas-Almacén) activa.",
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    return jsonResponseVentas({
      success: false,
      error: error.toString()
    });
  }
}

function doPost(e) {
  try {
    var postData = {};
    if (e && e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else {
      return jsonResponseVentas({
        success: false,
        error: "Cuerpo de solicitud vacío."
      });
    }

    var action = postData.action || "";

    // --- Endpoints App 1: Inventario Almacén (Preservados intactos) ---
    if (action === "saveItem" && typeof saveRepuesto === "function") {
      return jsonResponseVentas(saveRepuesto(postData));
    } else if (action === "createItem" && typeof createRepuesto === "function") {
      return jsonResponseVentas(createRepuesto(postData));
    } else if (action === "uploadPhotos" && typeof uploadPhotosStandalone === "function") {
      return jsonResponseVentas(uploadPhotosStandalone(postData));
    }

    // --- Endpoints App 2: Mostrador Digital Ventas-Almacén ---
    else if (action === "crearSolicitud") {
      return jsonResponseVentas(crearSolicitud(postData));
    } else if (action === "actualizarEstadoSolicitud") {
      return jsonResponseVentas(
        actualizarEstadoSolicitud(
          postData.idSolicitud,
          postData.nuevoEstado,
          postData.nombreAlmacenista,
          postData.observacion
        )
      );
    } else {
      return jsonResponseVentas({
        success: false,
        error: "Acción no reconocida: " + action
      });
    }
  } catch (error) {
    return jsonResponseVentas({
      success: false,
      error: error.toString()
    });
  }
}

/**
 * Helper para estructurar respuestas JSON
 */
function jsonResponseVentas(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Helper para normalizar encabezados (ignora tildes, mayúsculas y espacios extra)
 */
function normalizeHeaderKey(str) {
  if (!str) return "";
  return str
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Busca el índice de una columna probando varios posibles nombres de encabezado
 */
function findColumnIndex(headers, possibleNames) {
  var normalizedHeaders = headers.map(function (h) {
    return normalizeHeaderKey(h);
  });

  for (var i = 0; i < possibleNames.length; i++) {
    var candidate = normalizeHeaderKey(possibleNames[i]);
    var idx = normalizedHeaders.indexOf(candidate);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * 1. getUsuarios()
 * Lee las columnas "Vendedores" y "Almacenistas" desde la pestaña Base_Datos.
 * REGLA DE LECTURA: Solo lectura de valores, jamás modifica Base_Datos.
 */
function getUsuarios() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_VENTAS);
  var sheet = ss.getSheetByName(SHEET_BASE_DATOS_VENTAS);
  if (!sheet) {
    return {
      success: false,
      error: "No se encontró la pestaña '" + SHEET_BASE_DATOS_VENTAS + "'."
    };
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return {
      success: true,
      vendedores: [],
      almacenistas: []
    };
  }

  var headers = data[0];
  var colVendedores = findColumnIndex(headers, [
    "VENDEDORES",
    "VENDEDOR",
    "ASESOR",
    "ASESORES"
  ]);
  var colAlmacenistas = findColumnIndex(headers, [
    "ALMACENISTAS",
    "ALMACENISTA",
    "ALMACEN",
    "DESPACHADORES"
  ]);

  var vendedoresSet = {};
  var almacenistasSet = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    if (colVendedores !== -1 && row[colVendedores] !== undefined && row[colVendedores] !== null) {
      var vend = row[colVendedores].toString().trim();
      if (vend !== "") {
        vendedoresSet[vend] = true;
      }
    }

    if (colAlmacenistas !== -1 && row[colAlmacenistas] !== undefined && row[colAlmacenistas] !== null) {
      var alm = row[colAlmacenistas].toString().trim();
      if (alm !== "") {
        almacenistasSet[alm] = true;
      }
    }
  }

  return {
    success: true,
    vendedores: Object.keys(vendedoresSet),
    almacenistas: Object.keys(almacenistasSet)
  };
}

/**
 * 2. getCatalog()
 * Obtiene repuestos (Código, Descripción, Marca, Modelo, Aplica_A, Stock según EXIST_VIRTUAL, Ubicacion_Almacen, Imagen_URL)
 * desde la pestaña Repuestos.
 * REGLA DE PROTECCIÓN DE FÓRMULAS: Lectura exclusiva de valores calculados (getValues()),
 * nunca modifica ni sobrescribe ninguna columna o fórmula de Repuestos.
 */
function getCatalog() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_VENTAS);
  var sheet = ss.getSheetByName(SHEET_REPUESTOS_VENTAS);
  if (!sheet) {
    return {
      success: false,
      error: "No se encontró la pestaña '" + SHEET_REPUESTOS_VENTAS + "'."
    };
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return {
      success: true,
      items: []
    };
  }

  var headers = data[0];

  var idxCodigo = findColumnIndex(headers, ["ARTICULO", "CODIGO", "SKU", "SKU_ARTICULO"]);
  var idxNParte = findColumnIndex(headers, ["N# PARTE archivo", "N# PARTE ARCHIVO", "N_PARTE"]);
  var idxNParte2 = findColumnIndex(headers, ["N# PARTE 2 descripcion", "N# PARTE 2 DESCRIPCION"]);
  var idxDescripcion = findColumnIndex(headers, ["DESCRIPCION", "DESCRIPCION_REPUESTO"]);
  var idxCategoria = findColumnIndex(headers, ["CATEGORIA"]);
  var idxMarca = findColumnIndex(headers, ["MARCA"]);
  var idxSerie = findColumnIndex(headers, ["SERIE"]);
  var idxModelo = findColumnIndex(headers, ["MODELO"]);
  var idxVersion = findColumnIndex(headers, ["VERSION"]);
  var idxAplicaA = findColumnIndex(headers, ["APLICA A", "APLICA_A", "COMPATIBILIDAD"]);
  var idxStockFisico = findColumnIndex(headers, ["EXIST_FISICA", "STOCK_FISICO"]);
  var idxStockVirtual = findColumnIndex(headers, ["EXIST_VIRTUAL", "STOCK_VIRTUAL", "STOCK"]);
  var idxUbicacion = findColumnIndex(headers, ["UBICACION", "UBICACION_ALMACEN"]);
  var idxImagen = findColumnIndex(headers, ["FOTOS", "IMAGEN_URL", "FOTO", "IMAGEN"]);

  var catalog = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var codigo = idxCodigo !== -1 && row[idxCodigo] !== null && row[idxCodigo] !== undefined
      ? row[idxCodigo].toString().trim()
      : "";

    var descripcion = idxDescripcion !== -1 && row[idxDescripcion] !== null && row[idxDescripcion] !== undefined
      ? row[idxDescripcion].toString().trim()
      : "";

    // Ignorar filas completamente vacías
    if (!codigo && !descripcion) continue;

    // Determinar Stock estrictamente según EXIST_VIRTUAL
    var rawVirtual = idxStockVirtual !== -1 ? row[idxStockVirtual] : "";
    var rawFisico = idxStockFisico !== -1 ? row[idxStockFisico] : "";
    var stockVirtualVal =
      rawVirtual !== "" && rawVirtual !== null && rawVirtual !== undefined && !isNaN(Number(rawVirtual))
        ? Number(rawVirtual)
        : 0;
    var stockFisicoVal =
      rawFisico !== "" && rawFisico !== null && rawFisico !== undefined && !isNaN(Number(rawFisico))
        ? Number(rawFisico)
        : 0;

    // Procesar URLs de fotos (puede haber varias separadas por coma)
    var rawFotos = idxImagen !== -1 && row[idxImagen] ? row[idxImagen].toString().trim() : "";
    var fotosList = rawFotos
      ? rawFotos.split(",").map(function (u) { return u.trim(); }).filter(Boolean)
      : [];
    var mainImageUrl = fotosList.length > 0 ? fotosList[0] : "";

    var marca = idxMarca !== -1 && row[idxMarca] ? row[idxMarca].toString().trim() : "";
    var serie = idxSerie !== -1 && row[idxSerie] ? row[idxSerie].toString().trim() : "";
    var modelo = idxModelo !== -1 && row[idxModelo] ? row[idxModelo].toString().trim() : "";
    var version = idxVersion !== -1 && row[idxVersion] ? row[idxVersion].toString().trim() : "";
    var aplicaA = idxAplicaA !== -1 && row[idxAplicaA] ? row[idxAplicaA].toString().trim() : "";
    var ubicacion = idxUbicacion !== -1 && row[idxUbicacion] ? row[idxUbicacion].toString().trim() : "SIN UBICACIÓN";
    var nParte = idxNParte !== -1 && row[idxNParte] ? row[idxNParte].toString().trim() : "";
    var nParte2 = idxNParte2 !== -1 && row[idxNParte2] ? row[idxNParte2].toString().trim() : "";
    var categoria = idxCategoria !== -1 && row[idxCategoria] ? row[idxCategoria].toString().trim() : "";

    catalog.push({
      Codigo: codigo,
      SKU_Articulo: codigo,
      N_Parte: nParte,
      N_Parte_2: nParte2,
      Descripcion: descripcion,
      Categoria: categoria,
      Marca: marca,
      Serie: serie,
      Modelo: modelo,
      Version: version,
      Aplica_A: aplicaA,
      Stock: stockVirtualVal,
      Stock_Virtual: stockVirtualVal,
      Stock_Fisico: stockFisicoVal,
      Ubicacion_Almacen: ubicacion || "SIN UBICACIÓN",
      Imagen_URL: mainImageUrl,
      Fotos_Galeria: fotosList
    });
  }

  return {
    success: true,
    count: catalog.length,
    items: catalog
  };
}

/**
 * Obtiene o inicializa la pestaña "Solicitudes_Ventas" con sus encabezados
 */
function getOrCreateSolicitudesSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_VENTAS);
  var sheet = ss.getSheetByName(SHEET_SOLICITUDES_VENTAS);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_SOLICITUDES_VENTAS);
    sheet.getRange(1, 1, 1, SOLICITUDES_HEADERS.length).setValues([SOLICITUDES_HEADERS]);
    sheet.getRange(1, 1, 1, SOLICITUDES_HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#b31217")
      .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, SOLICITUDES_HEADERS.length).setValues([SOLICITUDES_HEADERS]);
    sheet.getRange(1, 1, 1, SOLICITUDES_HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#b31217")
      .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * 3. crearSolicitud(payload)
 * Registra solicitudes en Solicitudes_Ventas mapeando dinámicamente por nombre de encabezado.
 * Encabezados en hoja: N# Solicitud, Fecha_Hora, Vendedor, SKU_Articulo, Descripcion_Repuesto,
 * Ubicacion_Almacen, Cantidad, Prioridad, Status, Observacion_Vendedor, Almacenista,
 * Observacion_Almacen, Fecha_Hora_Repuesta.
 */
function crearSolicitud(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var vendedor = payload.vendedor ? payload.vendedor.toString().trim() : "";
    var prioridad = payload.prioridad ? payload.prioridad.toString().trim() : "Normal";
    var items = payload.items || [];

    if (!vendedor) {
      return { success: false, error: "Debe indicar el nombre del Vendedor." };
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, error: "La solicitud no contiene artículos." };
    }
    if (items.length > 20) {
      return { success: false, error: "Límite máximo excedido: máximo 20 artículos por solicitud." };
    }

    var sheet = getOrCreateSolicitudesSheet();
    var lastRow = sheet.getLastRow();
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    var idxNumSol = findColumnIndex(headers, ["N# Solicitud", "N# SOLICITUD", "ID_SOLICITUD"]);
    if (idxNumSol === -1) idxNumSol = 0;

    // Calcular siguiente correlativo SOL-XXXX
    var maxConsecutivo = 0;
    if (lastRow >= 2) {
      var existingIds = sheet.getRange(2, idxNumSol + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < existingIds.length; i++) {
        var val = existingIds[i][0] ? existingIds[i][0].toString().trim() : "";
        var match = val.match(/SOL-(\d+)/i);
        if (match && match[1]) {
          var num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxConsecutivo) {
            maxConsecutivo = num;
          }
        }
      }
    }

    var nextNum = maxConsecutivo + 1;
    var paddedNum = ("0000" + nextNum).slice(-4);
    if (nextNum > 9999) paddedNum = nextNum.toString();
    var idSolicitud = "SOL-" + paddedNum;

    var tz = Session.getScriptTimeZone() || "America/Caracas";
    var fechaHora = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");

    // Mapear índices de columnas estrictamente por nombre de encabezado en la Fila 1
    var colIdxMap = {
      numSolicitud: findColumnIndex(headers, ["N# Solicitud", "N# SOLICITUD"]),
      fechaHora: findColumnIndex(headers, ["Fecha_Hora", "FECHA_HORA", "FECHA"]),
      vendedor: findColumnIndex(headers, ["Vendedor", "VENDEDOR"]),
      sku: findColumnIndex(headers, ["SKU_Articulo", "SKU_ARTICULO", "ARTICULO", "CODIGO"]),
      descripcion: findColumnIndex(headers, ["Descripcion_Repuesto", "DESCRIPCION_REPUESTO", "DESCRIPCION"]),
      ubicacion: findColumnIndex(headers, ["Ubicacion_Almacen", "UBICACION_ALMACEN", "UBICACION"]),
      cantidad: findColumnIndex(headers, ["Cantidad", "CANTIDAD"]),
      prioridad: findColumnIndex(headers, ["Prioridad", "PRIORIDAD"]),
      status: findColumnIndex(headers, ["Status", "STATUS", "ESTADO"]),
      obsVendedor: findColumnIndex(headers, [
        "Observacion_Vendedor",
        "OBSERVACION_VENDEDOR",
        "Observaciones_Vendedor",
        "Nota_Vendedor"
      ])
    };

    var rowsToAppend = [];

    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var sku = (item.SKU_Articulo || item.Codigo || "").toString().trim();
      var desc = (item.Descripcion_Repuesto || item.Descripcion || "").toString().trim();
      var ubic = (item.Ubicacion_Almacen || item.Ubicacion || "SIN UBICACIÓN").toString().trim();
      var cant = Number(item.Cantidad) > 0 ? Number(item.Cantidad) : 1;
      var obsVend = (item.Observacion_Vendedor || item.Observacion || "").toString().trim();

      var newRow = new Array(lastCol).fill("");

      if (colIdxMap.numSolicitud !== -1) newRow[colIdxMap.numSolicitud] = idSolicitud;
      if (colIdxMap.fechaHora !== -1) newRow[colIdxMap.fechaHora] = fechaHora;
      if (colIdxMap.vendedor !== -1) newRow[colIdxMap.vendedor] = vendedor;
      if (colIdxMap.sku !== -1) newRow[colIdxMap.sku] = sku;
      if (colIdxMap.descripcion !== -1) newRow[colIdxMap.descripcion] = desc;
      if (colIdxMap.ubicacion !== -1) newRow[colIdxMap.ubicacion] = ubic;
      if (colIdxMap.cantidad !== -1) newRow[colIdxMap.cantidad] = cant;
      if (colIdxMap.prioridad !== -1) newRow[colIdxMap.prioridad] = prioridad;
      if (colIdxMap.status !== -1) newRow[colIdxMap.status] = "Pendiente";
      if (colIdxMap.obsVendedor !== -1) newRow[colIdxMap.obsVendedor] = obsVend;

      rowsToAppend.push(newRow);
    }

    var startWriteRow = lastRow + 1;
    sheet.getRange(startWriteRow, 1, rowsToAppend.length, lastCol).setValues(rowsToAppend);
    SpreadsheetApp.flush();

    return {
      success: true,
      idSolicitud: idSolicitud,
      fechaHora: fechaHora,
      vendedor: vendedor,
      prioridad: prioridad,
      status: "Pendiente",
      totalLineas: rowsToAppend.length,
      message: "Solicitud " + idSolicitud + " creada exitosamente."
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 4. getSolicitudes()
 * Retorna el historial de solicitudes agrupadas por N# Solicitud con sus artículos,
 * observaciones del vendedor por ítem, estados, prioridad y observaciones de despacho de almacén.
 */
function getSolicitudes() {
  var sheet = getOrCreateSolicitudesSheet();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return {
      success: true,
      solicitudes: [],
      rows: []
    };
  }

  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0];

  var colIdx = {
    numSolicitud: findColumnIndex(headers, ["N# Solicitud", "N# SOLICITUD"]),
    fechaHora: findColumnIndex(headers, ["Fecha_Hora", "FECHA_HORA", "FECHA"]),
    vendedor: findColumnIndex(headers, ["Vendedor", "VENDEDOR"]),
    sku: findColumnIndex(headers, ["SKU_Articulo", "SKU_ARTICULO", "ARTICULO", "CODIGO"]),
    descripcion: findColumnIndex(headers, ["Descripcion_Repuesto", "DESCRIPCION_REPUESTO", "DESCRIPCION"]),
    ubicacion: findColumnIndex(headers, ["Ubicacion_Almacen", "UBICACION_ALMACEN", "UBICACION"]),
    cantidad: findColumnIndex(headers, ["Cantidad", "CANTIDAD"]),
    prioridad: findColumnIndex(headers, ["Prioridad", "PRIORIDAD"]),
    status: findColumnIndex(headers, ["Status", "STATUS", "ESTADO"]),
    obsVendedor: findColumnIndex(headers, [
      "Observacion_Vendedor",
      "OBSERVACION_VENDEDOR",
      "Observaciones_Vendedor",
      "Nota_Vendedor"
    ]),
    almacenista: findColumnIndex(headers, ["Almacenista", "ALMACENISTA"]),
    obsAlmacen: findColumnIndex(headers, [
      "Observacion_Almacen",
      "OBSERVACION_ALMACEN",
      "Observacion",
      "OBSERVACION",
      "NOTAS"
    ]),
    fechaRespuesta: findColumnIndex(headers, [
      "Fecha_Hora_Repuesta",
      "FECHA_HORA_REPUESTA",
      "Fecha_Hora_Respuesta",
      "FECHA_HORA_RESPUESTA",
      "Fecha_Respuesta",
      "FECHA_RESPUESTA"
    ])
  };

  var groupedMap = {};
  var orderKeys = [];
  var flatRows = [];
  var tz = Session.getScriptTimeZone() || "America/Caracas";

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var idSol = colIdx.numSolicitud !== -1 && row[colIdx.numSolicitud]
      ? row[colIdx.numSolicitud].toString().trim()
      : "";

    if (!idSol) continue;

    var rawFecha = colIdx.fechaHora !== -1 ? row[colIdx.fechaHora] : "";
    var fechaStr = "";
    if (rawFecha instanceof Date) {
      fechaStr = Utilities.formatDate(rawFecha, tz, "yyyy-MM-dd HH:mm:ss");
    } else if (rawFecha) {
      fechaStr = rawFecha.toString().trim();
    }

    var vendedor = colIdx.vendedor !== -1 && row[colIdx.vendedor] ? row[colIdx.vendedor].toString().trim() : "";
    var sku = colIdx.sku !== -1 && row[colIdx.sku] ? row[colIdx.sku].toString().trim() : "";
    var descripcion = colIdx.descripcion !== -1 && row[colIdx.descripcion] ? row[colIdx.descripcion].toString().trim() : "";
    var ubicacion = colIdx.ubicacion !== -1 && row[colIdx.ubicacion] ? row[colIdx.ubicacion].toString().trim() : "SIN UBICACIÓN";
    var cantidad = colIdx.cantidad !== -1 && row[colIdx.cantidad] !== "" ? Number(row[colIdx.cantidad]) || 1 : 1;
    var prioridad = colIdx.prioridad !== -1 && row[colIdx.prioridad] ? row[colIdx.prioridad].toString().trim() : "Normal";
    var status = colIdx.status !== -1 && row[colIdx.status] ? row[colIdx.status].toString().trim() : "Pendiente";
    var obsVendedor = colIdx.obsVendedor !== -1 && row[colIdx.obsVendedor] ? row[colIdx.obsVendedor].toString().trim() : "";
    var almacenista = colIdx.almacenista !== -1 && row[colIdx.almacenista] ? row[colIdx.almacenista].toString().trim() : "";
    var obsAlmacen = colIdx.obsAlmacen !== -1 && row[colIdx.obsAlmacen] ? row[colIdx.obsAlmacen].toString().trim() : "";

    var rawFechaResp = colIdx.fechaRespuesta !== -1 ? row[colIdx.fechaRespuesta] : "";
    var fechaRespStr = "";
    if (rawFechaResp instanceof Date) {
      fechaRespStr = Utilities.formatDate(rawFechaResp, tz, "yyyy-MM-dd HH:mm:ss");
    } else if (rawFechaResp) {
      fechaRespStr = rawFechaResp.toString().trim();
    }

    var itemObj = {
      SKU_Articulo: sku,
      Descripcion_Repuesto: descripcion,
      Ubicacion_Almacen: ubicacion,
      Cantidad: cantidad,
      Observacion_Vendedor: obsVendedor
    };

    flatRows.push({
      idSolicitud: idSol,
      fechaHora: fechaStr,
      vendedor: vendedor,
      SKU_Articulo: sku,
      Descripcion_Repuesto: descripcion,
      Ubicacion_Almacen: ubicacion,
      Cantidad: cantidad,
      Observacion_Vendedor: obsVendedor,
      prioridad: prioridad,
      status: status,
      almacenista: almacenista,
      observacion: obsAlmacen,
      observacionAlmacen: obsAlmacen,
      fechaRespuesta: fechaRespStr
    });

    if (!groupedMap[idSol]) {
      groupedMap[idSol] = {
        idSolicitud: idSol,
        fechaHora: fechaStr,
        vendedor: vendedor,
        prioridad: prioridad,
        status: status,
        almacenista: almacenista,
        observacion: obsAlmacen,
        observacionAlmacen: obsAlmacen,
        fechaRespuesta: fechaRespStr,
        items: []
      };
      orderKeys.push(idSol);
    }

    groupedMap[idSol].items.push(itemObj);

    if (status && status !== "Pendiente") {
      groupedMap[idSol].status = status;
    }
    if (almacenista) {
      groupedMap[idSol].almacenista = almacenista;
    }
    if (obsAlmacen) {
      groupedMap[idSol].observacion = obsAlmacen;
      groupedMap[idSol].observacionAlmacen = obsAlmacen;
    }
    if (fechaRespStr) {
      groupedMap[idSol].fechaRespuesta = fechaRespStr;
    }
  }

  var solicitudesList = orderKeys.map(function (k) {
    return groupedMap[k];
  });

  return {
    success: true,
    solicitudes: solicitudesList,
    rows: flatRows
  };
}

/**
 * 5. actualizarEstadoSolicitud(idSolicitud, nuevoEstado, nombreAlmacenista, observacion)
 * Cambia el estado de todas las filas de un N# Solicitud a "Despachado" o "No Procesar"
 * y guarda Almacenista, Observacion_Almacen y Fecha_Hora_Repuesta buscando por nombre de encabezado.
 * REGLA DE PROTECCIÓN DE FÓRMULAS: Verifica getFormulas() en la fila antes de escribir.
 */
function actualizarEstadoSolicitud(idSolicitud, nuevoEstado, nombreAlmacenista, observacion) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    if (!idSolicitud) {
      return { success: false, error: "Falta el identificador de la solicitud (idSolicitud)." };
    }
    if (!nuevoEstado) {
      return { success: false, error: "Debe indicar el nuevo estado ('Despachado' o 'No Procesar')." };
    }

    var sheet = getOrCreateSolicitudesSheet();
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();

    if (lastRow < 2) {
      return { success: false, error: "No existen solicitudes registradas." };
    }

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    var idxNumSol = findColumnIndex(headers, ["N# Solicitud", "N# SOLICITUD"]);
    var idxStatus = findColumnIndex(headers, ["Status", "STATUS", "ESTADO"]);
    var idxAlmacenista = findColumnIndex(headers, ["Almacenista", "ALMACENISTA"]);
    var idxObsAlmacen = findColumnIndex(headers, [
      "Observacion_Almacen",
      "OBSERVACION_ALMACEN",
      "Observacion",
      "OBSERVACION",
      "NOTAS"
    ]);
    var idxFechaResp = findColumnIndex(headers, [
      "Fecha_Hora_Repuesta",
      "FECHA_HORA_REPUESTA",
      "Fecha_Hora_Respuesta",
      "FECHA_HORA_RESPUESTA",
      "Fecha_Respuesta",
      "FECHA_RESPUESTA"
    ]);

    var solValues = sheet.getRange(2, idxNumSol + 1, lastRow - 1, 1).getValues();
    var formulasRange = sheet.getRange(2, 1, lastRow - 1, lastCol).getFormulas();

    var normalizedTarget = idSolicitud.toString().trim().toUpperCase();
    var tz = Session.getScriptTimeZone() || "America/Caracas";
    var fechaResp = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
    var updatedRows = 0;

    for (var i = 0; i < solValues.length; i++) {
      var cellVal = solValues[i][0] ? solValues[i][0].toString().trim().toUpperCase() : "";
      if (cellVal === normalizedTarget) {
        var rowNumber = i + 2;
        var rowFormulas = formulasRange[i];

        // Solo escribir si la celda destino existe y NO contiene fórmula
        if (idxStatus !== -1 && !rowFormulas[idxStatus]) {
          sheet.getRange(rowNumber, idxStatus + 1).setValue(nuevoEstado);
        }
        if (idxAlmacenista !== -1 && !rowFormulas[idxAlmacenista]) {
          sheet.getRange(rowNumber, idxAlmacenista + 1).setValue(nombreAlmacenista || "");
        }
        if (idxObsAlmacen !== -1 && !rowFormulas[idxObsAlmacen]) {
          sheet.getRange(rowNumber, idxObsAlmacen + 1).setValue(observacion || "");
        }
        if (idxFechaResp !== -1 && !rowFormulas[idxFechaResp]) {
          sheet.getRange(rowNumber, idxFechaResp + 1).setValue(fechaResp);
        }

        updatedRows++;
      }
    }

    if (updatedRows === 0) {
      return {
        success: false,
        error: "No se encontró ninguna solicitud con el número: " + idSolicitud
      };
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      idSolicitud: idSolicitud,
      nuevoEstado: nuevoEstado,
      almacenista: nombreAlmacenista || "",
      observacion: observacion || "",
      fechaRespuesta: fechaResp,
      updatedRows: updatedRows,
      message: "Solicitud " + idSolicitud + " actualizada a '" + nuevoEstado + "'."
    };
  } finally {
    lock.releaseLock();
  }
}
