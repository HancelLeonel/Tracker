// Capa mínima sobre IndexedDB. Stores:
//   habits    -> { id, name, color, dates: { 'YYYY-MM-DD': 1 } }
//   accounts  -> { id, name, type: 'normal'|'credit', limit?, cats: [{ id, name, balance }] }
//   moves     -> { id, t, date, type: 'expense'|'income'|'transfer', title?, note, kind?, total, parts, to?, files? }
//   plan      -> { id, name, amount, key: 'acc|cat', when: 'both'|'q1'|'q2' }
//   bills     -> { id, title, amount, freq, day, dueDate, start, card?, paid: { [due]: {...} } }
//   purchases -> { id, name, date, price, store, tag, warrantyMonths, notes, files }
//   files     -> { id, blob, mime, name, size }
//   meta      -> { k: 'settings', v: {...} }
// El nombre interno se conserva tras el cambio de nombre a Tracker para no perder los datos ya guardados en el teléfono.
const DB_NAME = 'mi-quincena';
const STORES = ['habits', 'accounts', 'moves', 'plan', 'bills', 'purchases', 'files', 'meta'];
let opened;

function open() {
  opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'meta' ? 'k' : 'id' });
      }
      if (db.objectStoreNames.contains('quincenas')) db.deleteObjectStore('quincenas');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opened;
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const req = fn(tx);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export const getAll = store => run(store, 'readonly', tx => tx.objectStore(store).getAll());
export const get = (store, key) => run(store, 'readonly', tx => tx.objectStore(store).get(key));

// Varias escrituras en una sola transacción: { put: { store: [valores] }, remove: { store: [claves] } }
export function commit({ put = {}, remove = {} }) {
  const stores = [...new Set([...Object.keys(put), ...Object.keys(remove)])];
  return run(stores, 'readwrite', tx => {
    for (const [s, vals] of Object.entries(put)) vals.forEach(v => tx.objectStore(s).put(v));
    for (const [s, keys] of Object.entries(remove)) keys.forEach(k => tx.objectStore(s).delete(k));
  });
}

// Reemplaza todo en una sola transacción (si algo falla, no se pierde nada).
// Si `files` es undefined se conservan los archivos que ya hay (respaldo sin adjuntos).
export function replaceAll(data) {
  const { settings, files } = data;
  const clear = files ? STORES : STORES.filter(s => s !== 'files');
  return run(STORES, 'readwrite', tx => {
    clear.forEach(s => tx.objectStore(s).clear());
    for (const s of ['habits', 'accounts', 'moves', 'plan', 'bills', 'purchases']) data[s].forEach(v => tx.objectStore(s).put(v));
    files?.forEach(v => tx.objectStore('files').put(v));
    tx.objectStore('meta').put({ k: 'settings', v: settings });
  });
}
