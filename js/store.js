/* ───────────────────────────────────────────────────────────────
   Custom-frame storage.

   Artwork is far too large for localStorage (5 MB total), so frames
   live in IndexedDB, which easily holds 60+ designs. If IndexedDB is
   unavailable (some private-mode browsers) everything still works via
   a small localStorage fallback.
   ─────────────────────────────────────────────────────────────── */

const DB_NAME = 'snapstyle';
const STORE = 'frames';
const LS_KEY = 'snapstyle.frames'; // legacy location, migrated once

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('indexedDB failed'));
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  });
  return dbPromise;
}

async function run(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    const req = action(store);
    if (req) req.onsuccess = () => {
      result = req.result;
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function valid(f) {
  return (
    f &&
    typeof f.id === 'string' &&
    (typeof f.bg === 'string' || typeof f.art === 'string') &&
    Array.isArray(f.slots) &&
    f.slots.length > 0 &&
    Array.isArray(f.ratio)
  );
}

export async function listFrames() {
  try {
    const rows = await run('readonly', (s) => s.getAll());
    return (rows || []).filter(valid);
  } catch {
    return lsRead();
  }
}

export async function putFrame(frame) {
  try {
    await run('readwrite', (s) => s.put(frame));
    return true;
  } catch {
    return lsWrite(frame);
  }
}

export async function removeFrame(id) {
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch {
    /* ignore — fallback below still runs */
  }
  lsDelete(id);
}

/** Import frames saved by older builds in localStorage. */
export async function migrateFrames() {
  let legacy;
  try {
    legacy = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return 0;
  }
  if (!Array.isArray(legacy) || !legacy.length) return 0;

  const existing = await listFrames();
  const ids = new Set(existing.map((f) => f.id));
  let moved = 0;
  for (const f of legacy) {
    if (!valid(f) || ids.has(f.id)) continue;
    if (await putFrame(f)) moved++;
  }
  localStorage.removeItem(LS_KEY);
  return moved;
}

/* ── localStorage fallback ───────────────────────────────────── */
function lsRead() {
  try {
    const rows = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter(valid) : [];
  } catch {
    return [];
  }
}

function lsWrite(frame) {
  try {
    const all = lsRead().filter((f) => f.id !== frame.id);
    all.push(frame);
    localStorage.setItem(LS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

function lsDelete(id) {
  try {
    const all = lsRead().filter((f) => f.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
