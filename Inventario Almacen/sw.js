/**
 * PROYECTO: Sistema de Chequeo de Inventario y Almacen - GAC Motors
 * DESARROLLO & ARQUITECTURA: Victor Solorzano
 * ASISTENCIA TECNICA: OpenCode for Obsidian & Antigravity IDE
 * ROL: Service Worker para Instalabilidad PWA y Cache Offline
 */

const CACHE_NAME = "gac-inventario-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./manifest.json",
  "./assets/logo-gac.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

// Instalacion y precache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activacion y limpieza de caches antiguas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estrategia Network First con fallback a cache para archivos estaticos
self.addEventListener("fetch", (event) => {
  // Ignorar llamadas a Apps Script o externas
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
