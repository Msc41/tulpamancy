const DB_NAME = 'chat-diary-pwa';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const STATE_KEY = 'diary-state';
const LOCAL_STORAGE_KEY = 'chat-diary-pwa-state';

export async function loadPersistedState() {
  try {
    const db = await openDatabase();
    return await readValue(db, STATE_KEY);
  } catch (error) {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}

export async function savePersistedState(state) {
  try {
    const db = await openDatabase();
    await writeValue(db, STATE_KEY, state);
  } catch (error) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  }
}

export async function clearPersistedState() {
  try {
    const db = await openDatabase();
    await deleteValue(db, STATE_KEY);
  } catch (error) {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
}

function openDatabase() {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('IndexedDB is not available.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readValue(db, key) {
  return withStore(db, 'readonly', (store) => store.get(key));
}

function writeValue(db, key, value) {
  return withStore(db, 'readwrite', (store) => store.put(value, key));
}

function deleteValue(db, key) {
  return withStore(db, 'readwrite', (store) => store.delete(key));
}

function withStore(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
