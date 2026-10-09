(function iniciarCacheGeocodificacao(global) {
  'use strict';

  const DB_NAME = 'pacote_e_mato_geocache_v1';
  const DB_VERSION = 1;
  const STORE_NAME = 'geocodes';
  const memoria = new Map();
  let dbPromise = null;

  function normalizarChave(valor) {
    return String(valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function criarChave(provider, endereco) {
    return `${normalizarChave(provider)}::${normalizarChave(endereco)}`;
  }

  function abrirDB() {
    if (!('indexedDB' in global)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
      try {
        const req = global.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
            store.createIndex('expiresAt', 'expiresAt', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });

    return dbPromise;
  }

  async function obter(provider, endereco) {
    const cacheKey = criarChave(provider, endereco);
    const agora = Date.now();
    const emMemoria = memoria.get(cacheKey);

    if (emMemoria) {
      if (!emMemoria.expiresAt || emMemoria.expiresAt > agora) return emMemoria;
      memoria.delete(cacheKey);
    }

    const db = await abrirDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(cacheKey);
        req.onsuccess = () => {
          const registro = req.result || null;
          if (!registro) return resolve(null);
          if (registro.expiresAt && registro.expiresAt <= agora) {
            try { store.delete(cacheKey); } catch (_) {}
            memoria.delete(cacheKey);
            return resolve(null);
          }
          memoria.set(cacheKey, registro);
          resolve(registro);
        };
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function salvar(provider, endereco, payload, ttlMs) {
    const cacheKey = criarChave(provider, endereco);
    const agora = Date.now();
    const registro = {
      cacheKey,
      provider: String(provider || ''),
      endereco: String(endereco || ''),
      payload,
      savedAt: agora,
      expiresAt: agora + Math.max(60_000, Number(ttlMs || 0))
    };

    memoria.set(cacheKey, registro);
    const db = await abrirDB();
    if (!db) return registro;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(registro);
        tx.oncomplete = () => resolve(registro);
        tx.onerror = () => resolve(registro);
        tx.onabort = () => resolve(registro);
      } catch (_) {
        resolve(registro);
      }
    });
  }

  async function remover(provider, endereco) {
    const cacheKey = criarChave(provider, endereco);
    memoria.delete(cacheKey);
    const db = await abrirDB();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(cacheKey);
    } catch (_) {}
  }

  global.PacoteEMatoGeoCache = Object.freeze({
    criarChave,
    obter,
    salvar,
    remover
  });
})(window);
