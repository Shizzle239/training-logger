/* db.js — thin promise wrapper around IndexedDB.
   Stores:
     kv         { key, value }        — program JSON, misc
     sessions   { id, week, day, date, notes }   id = `${week}|${dayId}`
     sets       { id, week, day, ex, set, reps, wt, rpe, done, ts }  id = `${week}|${dayId}|${exId}|${setIdx}`
     maxes      { id, oneRM }         id = lift id
     bodyweight { week, kg }
     exercises  { id, name, lastReps, lastRpe, lastWeight, programs[], firstSeen, lastSeen }
                — library of every exercise ever introduced via an imported program
*/
'use strict';

const DB_NAME = 'workout-logger';
const DB_VERSION = 2;
const STORES = ['kv', 'sessions', 'sets', 'maxes', 'bodyweight', 'exercises'];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sets')) db.createObjectStore('sets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('maxes')) db.createObjectStore('maxes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('bodyweight')) db.createObjectStore('bodyweight', { keyPath: 'week' });
      if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function _tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    let result;
    try { result = fn(os); } catch (e) { reject(e); return; }
    tx.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('tx aborted'));
  }));
}

function dbGet(store, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function dbGetAll(store) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  }));
}

function dbPut(store, value) {
  return _tx(store, 'readwrite', os => { os.put(value); });
}

function dbBulkPut(store, values) {
  return _tx(store, 'readwrite', os => { values.forEach(v => os.put(v)); });
}

function dbDelete(store, key) {
  return _tx(store, 'readwrite', os => { os.delete(key); });
}

function dbClear(store) {
  return _tx(store, 'readwrite', os => { os.clear(); });
}

function dbClearAll() {
  return Promise.all(STORES.map(s => dbClear(s)));
}
