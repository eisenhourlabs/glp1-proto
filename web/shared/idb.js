// A tiny promise wrapper around one IndexedDB database: the saved copies of reads (backlog C4). The name carries
// CONFIG.STORAGE_PREFIX because this origin is shared with other apps. Every call degrades to "nothing stored" when
// IndexedDB is unavailable (private mode, old browser), so the app still works online.
import { CONFIG } from '../config.js';

const NAME = `${CONFIG.STORAGE_PREFIX}-offline`;
let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(NAME, 1); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('reads')) d.createObjectStore('reads');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return opening;
}

function tx(store, mode, fn) {
  return open().then((d) => (!d ? undefined : new Promise((resolve) => {
    let out;
    try {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      out = fn(s);
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  })));
}

export const idbGet = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const idbPut = (store, value, key) => tx(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));
export const idbClear = (store) => tx(store, 'readwrite', (s) => s.clear());

