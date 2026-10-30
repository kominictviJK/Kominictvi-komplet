// Databáze v iPadu (IndexedDB). Všechna data aplikace žijí tady a fungují offline.
const DB_NAME = 'kominictvi';
const DB_VERSION = 1;

// Úložiště (tabulky) a jejich indexy
export const STORES = {
  settings: { keyPath: 'key' },                  // nastavení (klíč → hodnota)
  counters: { keyPath: 'key' },                  // číselné řady
  customers: { keyPath: 'id', indexes: ['name', 'archived'] }, // zákazníci vč. objektů, komínů, spotřebičů
  appointments: { keyPath: 'id', indexes: ['date', 'customerId', 'status'] }, // domluvené návštěvy (plán dne, výjezdy)
  documents: { keyPath: 'id', indexes: ['customerId', 'date', 'kind'] },      // zprávy, protokoly, doklady
  invoices: { keyPath: 'id', indexes: ['customerId', 'date'] },
  offers: { keyPath: 'id', indexes: ['customerId', 'date'] },
  expenses: { keyPath: 'id', indexes: ['date', 'category'] },
  events: { keyPath: 'id', indexes: ['date'] },   // kalendář: osobní události a úkoly
  inquiries: { keyPath: 'id', indexes: ['stage'] }, // poptávky
  trash: { keyPath: 'id', indexes: ['deletedAt'] }, // koš (30 dní)
  queue: { keyPath: 'id', indexes: ['createdAt'] }, // fronta úkolů čekajících na internet
};

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const idx of def.indexes || []) store.createIndex(idx, idx);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store, key) {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(key));
}

export async function all(store) {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAll());
}

export async function byIndex(store, index, value) {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).index(index).getAll(value));
}

export async function put(store, value) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await done(tx);
  return value;
}

export async function putMany(store, values) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await done(tx);
}

export async function del(store, key) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
}

export async function clear(store) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await done(tx);
}

// Atomická úprava jednoho záznamu (např. navýšení číselné řady) v jedné transakci
export async function update(store, key, fn) {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  const current = await wrap(os.get(key));
  const next = fn(current);
  os.put(next);
  await done(tx);
  return next;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Smazání do koše – položku jde 30 dní obnovit
export async function moveToTrash(store, key, label) {
  const item = await get(store, key);
  if (!item) return;
  await put('trash', { id: `${store}:${key}`, store, item, label, deletedAt: new Date().toISOString() });
  await del(store, key);
}

export async function restoreFromTrash(id) {
  const t = await get('trash', id);
  if (!t) return;
  await put(t.store, t.item);
  await del('trash', id);
}

export async function purgeTrash(days = 30) {
  const limit = Date.now() - days * 86400000;
  for (const t of await all('trash')) {
    if (new Date(t.deletedAt).getTime() < limit) await del('trash', t.id);
  }
}

// Požádá iPad, aby data aplikace nikdy sám nemazal
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* nepodporováno */ }
  return false;
}

export function uid(prefix = '') {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + r[0].toString(36) + r[1].toString(36).slice(0, 4);
}
