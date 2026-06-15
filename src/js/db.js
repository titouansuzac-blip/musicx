// Stockage persistant des fichiers audio importés (IndexedDB).
// On garde le Blob complet : il survit aux rechargements et fonctionne
// hors-ligne. Les URLs d'objet sont recréées à chaque session.

const DB_NAME = "pulse-db";
const STORE = "files";
const VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB indisponible"));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function store(mode) {
  const db = await open();
  return db.transaction(STORE, mode).objectStore(STORE);
}

function asPromise(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function putFile(record) {
  return asPromise((await store("readwrite")).put(record));
}

export async function getAllFiles() {
  return (await asPromise((await store("readonly")).getAll())) || [];
}

export async function deleteFile(id) {
  return asPromise((await store("readwrite")).delete(id));
}
