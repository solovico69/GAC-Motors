/**
 * PROYECTO: Sistema de Chequeo de Inventario y Almacen - GAC Motors
 * DESARROLLO & ARQUITECTURA: Victor Solorzano
 * ASISTENCIA TECNICA: OpenCode for Obsidian & Antigravity IDE
 * ROL: Backend API en Google Apps Script (Servicio Web doGet / doPost)
 */

// ==========================================
// CONFIGURACION GENERAL
// ==========================================
var SPREADSHEET_ID = "127o9T9u2r3BVVR-S9kq74FiGsxXCkifErOthQM0pv0k";
var DRIVE_FOLDER_ID = "14HOPxz0tFZlNAxCOv0eu7cub0qqHvpsu";
var SHEET_REPUESTOS = "Repuestos";
var SHEET_BASE_DATOS = "Base_Datos";

/**
 * Manejador de peticiones GET
 * Acciones:
 * 1. action="getFilters": Retorna listas unicas y arbol en cascada de Base_Datos.
 * 2. action="search" & query="...": Busca un repuesto por columna ARTICULO.
 */
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || "";

    if (action === "getFilters") {
      return jsonResponse(getFilterData());
    } else if (action === "search") {
      var query = params.query ? params.query.toString().trim() : "";
      return jsonResponse(searchRepuesto(query));
    } else {
      return jsonResponse({
        success: true,
        message: "API GAC Motors Inventario activa y lista para operar.",
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.toString()
    });
  }
}

/**
 * Manejador de peticiones POST
 * Acciones:
 * 1. action="saveItem": Actualiza un articulo existente.
 * 2. action="createItem": Inserta un nuevo articulo.
 * 3. action="uploadPhotos": Sube fotos a Drive y actualiza la celda FOTOS.
 */
function doPost(e) {
  try {
    var postData = "";
    if (e && e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else {
      return jsonResponse({ success: false, error: "Cuerpo de solicitud vacio." });
    }

    var action = postData.action || "";

    if (action === "saveItem") {
      return jsonResponse(saveRepuesto(postData));
    } else if (action === "createItem") {
      return jsonResponse(createRepuesto(postData));
    } else if (action === "uploadPhotos") {
      return jsonResponse(uploadPhotosStandalone(postData));
    } else {
      return jsonResponse({ success: false, error: "Accion no reconocida: " + action });
    }
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.toString()
    });
  }
}

/**
 * Helper para estructurar respuestas JSON con CORS habilitado
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Obtiene los catalogos de filtros y la jerarquia de dependencia desde "Base_Datos"
 */
function getFilterData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_BASE_DATOS);
  if (!sheet) {
    throw new Error("No se encontro la hoja: " + SHEET_BASE_DATOS);
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    return { success: true, categorias: [], metricas: [], cascade: {}, aplicaA: [] };
  }

  var headers = data[0];
  var colMap = {};
  headers.forEach(function(h, idx) {
    if (h) colMap[h.toString().trim()] = idx;
  });

  var categoriasSet = {};
  var metricasSet = {};
  var aplicaASet = {};
  var cascade = {}; // MARCA -> SERIE -> MODELO -> [VERSION]

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Categoria
    var cat = row[colMap["CATEGORIA"]];
    if (cat && cat.toString().trim() !== "") {
      categoriasSet[cat.toString().trim()] = true;
    }

    // Metrica
    var met = row[colMap["METRICA"]];
    if (met && met.toString().trim() !== "") {
      metricasSet[met.toString().trim()] = true;
    }

    // Aplica A (Modelo / Version)
    var modVer = row[colMap["MODELO / VERSION"]];
    if (modVer && modVer.toString().trim() !== "") {
      aplicaASet[modVer.toString().trim()] = true;
    }

    // Jerarquia Marca -> Serie -> Modelo -> Version
    var marca = row[colMap["MARCA"]] ? row[colMap["MARCA"]].toString().trim() : "";
    var serie = row[colMap["SERIE"]] ? row[colMap["SERIE"]].toString().trim() : "";
    var modelo = row[colMap["MODELO"]] ? row[colMap["MODELO"]].toString().trim() : "";
    var version = row[colMap["VERSION"]] ? row[colMap["VERSION"]].toString().trim() : "";

    if (marca) {
      if (!cascade[marca]) cascade[marca] = {};
      if (serie) {
        if (!cascade[marca][serie]) cascade[marca][serie] = {};
        if (modelo) {
          if (!cascade[marca][serie][modelo]) cascade[marca][serie][modelo] = [];
          if (version && cascade[marca][serie][modelo].indexOf(version) === -1) {
            cascade[marca][serie][modelo].push(version);
          }
        }
      }
    }
  }

  return {
    success: true,
    categorias: Object.keys(categoriasSet).sort(),
    metricas: Object.keys(metricasSet).sort(),
    aplicaA: Object.keys(aplicaASet).sort(),
    cascade: cascade
  };
}

/**
 * Busca un articulo en la hoja "Repuestos"
 */
function searchRepuesto(query) {
  if (!query) {
    return { success: false, error: "Termino de busqueda vacio." };
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_REPUESTOS);
  if (!sheet) {
    throw new Error("No se encontro la hoja: " + SHEET_REPUESTOS);
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) {
    return { success: true, found: false, message: "No hay registros en la base de datos." };
  }

  var headerRange = sheet.getRange(1, 1, 1, lastCol);
  var headers = headerRange.getValues()[0];
  var colMap = {};
  headers.forEach(function(h, idx) {
    if (h) colMap[h.toString().trim()] = idx;
  });

  var artColIdx = colMap["ARTICULO"];
  if (artColIdx === undefined) {
    throw new Error("No se encontro la columna 'ARTICULO' en la fila 1.");
  }

  // Leer valores de la columna ARTICULO
  var artValues = sheet.getRange(2, artColIdx + 1, lastRow - 1, 1).getValues();
  var targetRowIndex = -1;
  var normalizedQuery = query.toString().toLowerCase().trim();

  for (var i = 0; i < artValues.length; i++) {
    var cellVal = artValues[i][0];
    if (cellVal !== null && cellVal !== undefined) {
      if (cellVal.toString().toLowerCase().trim() === normalizedQuery) {
        targetRowIndex = i + 2; // Fila real en la hoja (1-indexed)
        break;
      }
    }
  }

  if (targetRowIndex === -1) {
    return {
      success: true,
      found: false,
      query: query,
      message: "El articulo no fue encontrado."
    };
  }

  // Leer fila completa de valores
  var rowRange = sheet.getRange(targetRowIndex, 1, 1, lastCol);
  var rowValues = rowRange.getValues()[0];

  var itemData = {};
  headers.forEach(function(h, idx) {
    if (h) {
      var headerName = h.toString().trim();
      itemData[headerName] = rowValues[idx] !== null && rowValues[idx] !== undefined ? rowValues[idx] : "";
    }
  });

  return {
    success: true,
    found: true,
    rowIndex: targetRowIndex,
    data: itemData
  };
}

/**
 * Guarda o actualiza un repuesto existente
 * MARCA, SERIE, VERSION son libres para editar y guardar
 * Solo EXIST_VIRTUAL y N# PARTE archivo son Solo Lectura
 */
function saveRepuesto(payload) {
  var data = payload.data;
  if (!data || !data["ARTICULO"]) {
    return { success: false, error: "Datos de articulo no validos." };
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_REPUESTOS);
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colMap = {};
  headers.forEach(function(h, idx) {
    if (h) colMap[h.toString().trim()] = idx;
  });

  // Localizar la fila
  var targetRow = payload.rowIndex;
  var artQuery = data["ARTICULO"].toString().toLowerCase().trim();

  if (!targetRow || targetRow < 2) {
    var artValues = sheet.getRange(2, colMap["ARTICULO"] + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < artValues.length; i++) {
      if (artValues[i][0] && artValues[i][0].toString().toLowerCase().trim() === artQuery) {
        targetRow = i + 2;
        break;
      }
    }
  }

  if (!targetRow || targetRow < 2) {
    return { success: false, error: "No se encontro la fila para el articulo especificado." };
  }

  // Gestionar fotos si se enviaron nuevas
  if (payload.newPhotos && payload.newPhotos.length > 0) {
    var uploadedUrls = uploadPhotosToDrive(
      payload.newPhotos,
      data["ARTICULO"] || "ART",
      data["MARCA"] || "GAC",
      data["MODELO"] || "MOD"
    );

    var currentPhotos = data["FOTOS"] || "";
    var existingList = currentPhotos.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
    var combinedPhotos = existingList.concat(uploadedUrls);
    data["FOTOS"] = combinedPhotos.join(", ");
  }

  // Columnas que NO se deben modificar (Solo Lectura)
  var readOnlyFields = {
    "EXIST_VIRTUAL": true,
    "N# PARTE archivo": true
  };

  // Escribir celda por celda unicamente en celdas permitidas
  headers.forEach(function(h, idx) {
    if (h) {
      var headerName = h.toString().trim();
      var isReadOnly = readOnlyFields[headerName] === true;

      if (!isReadOnly && data.hasOwnProperty(headerName)) {
        var cellVal = data[headerName];
        sheet.getRange(targetRow, idx + 1).setValue(cellVal);
      }
    }
  });

  SpreadsheetApp.flush();

  return {
    success: true,
    message: "Articulo guardado exitosamente.",
    rowIndex: targetRow,
    fotos: data["FOTOS"] || ""
  };
}

/**
 * Crea un nuevo articulo en la hoja "Repuestos"
 */
function createRepuesto(payload) {
  var data = payload.data;
  if (!data || !data["ARTICULO"]) {
    return { success: false, error: "Falta el campo ARTICULO obligatorio." };
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_REPUESTOS);
  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var colMap = {};
  headers.forEach(function(h, idx) {
    if (h) colMap[h.toString().trim()] = idx;
  });

  // Validar si el ARTICULO ya existe
  var artValues = sheet.getRange(2, colMap["ARTICULO"] + 1, lastRow - 1, 1).getValues();
  var newArtCode = data["ARTICULO"].toString().toLowerCase().trim();
  for (var i = 0; i < artValues.length; i++) {
    if (artValues[i][0] && artValues[i][0].toString().toLowerCase().trim() === newArtCode) {
      return { success: false, error: "El ARTICULO '" + data["ARTICULO"] + "' ya existe en la fila " + (i + 2) + "." };
    }
  }

  // Subir fotos a Drive si existen
  if (payload.newPhotos && payload.newPhotos.length > 0) {
    var uploadedUrls = uploadPhotosToDrive(
      payload.newPhotos,
      data["ARTICULO"] || "ART",
      data["MARCA"] || "GAC",
      data["MODELO"] || "MOD"
    );
    data["FOTOS"] = uploadedUrls.join(", ");
  }

  var newRowValues = [];
  for (var c = 0; c < lastCol; c++) {
    var colName = headers[c] ? headers[c].toString().trim() : "";
    var val = data[colName] !== undefined && data[colName] !== null ? data[colName] : "";
    newRowValues.push(val);
  }

  // Insertar la nueva fila directamente
  sheet.appendRow(newRowValues);
  SpreadsheetApp.flush();

  return {
    success: true,
    message: "Nuevo articulo registrado exitosamente.",
    rowIndex: lastRow + 1,
    fotos: data["FOTOS"] || ""
  };
}

/**
 * Sube una lista de fotos en Base64 a la carpeta especificada en Drive
 * Nomenclatura: ARTICULO-MARCA-MODELO-N#.jpg
 */
function uploadPhotosToDrive(photosArray, articulo, marca, modelo) {
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  if (!folder) {
    throw new Error("No se pudo acceder a la carpeta de Drive con ID: " + DRIVE_FOLDER_ID);
  }

  var cleanArt = sanitizeFileName(articulo);
  var cleanMarca = sanitizeFileName(marca);
  var cleanModelo = sanitizeFileName(modelo);

  var uploadedUrls = [];

  for (var i = 0; i < photosArray.length; i++) {
    var item = photosArray[i]; // { base64: "...", index: 1 }
    var nIndex = item.index || (i + 1);
    var fileName = cleanArt + "-" + cleanMarca + "-" + cleanModelo + "-" + nIndex + ".jpg";

    var base64Data = item.base64;
    if (base64Data.indexOf("base64,") !== -1) {
      base64Data = base64Data.split("base64,")[1];
    }

    var decodedBytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decodedBytes, "image/jpeg", fileName);
    var file = folder.createFile(blob);
    
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch(e) {}

    var directUrl = "https://drive.google.com/uc?id=" + file.getId() + "&export=view";
    uploadedUrls.push(directUrl);
  }

  return uploadedUrls;
}

/**
 * Limpia caracteres no permitidos en nombres de archivos
 */
function sanitizeFileName(str) {
  if (!str) return "NA";
  return str.toString()
    .replace(/[\/\\?%*:|"<>#]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}
