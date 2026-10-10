// web/src/services/mapCache.ts

/**
 * Web counterpart of mobile's sqflite `map_cache` table
 * (mobile/lib/helper/database_helper.dart) — the storage layer for the
 * cache-then-network offline pattern on the map (see skill:
 * trashvision-offline-first).
 *
 * Same guarantees as the mobile implementation:
 *  - get() returns null on a miss AND on any storage failure (private mode,
 *    quota, corruption) — the cache must never break the online path.
 *  - put()/trim()/clear() are best-effort and swallow failures.
 *  - trim() bounds the store to the newest `maxEntries` payloads plus an
 *    explicit `keep` set (mobile always keeps `areas_v1` alive).
 *
 * Payloads are stored as JSON of the API response shapes (mobile rule:
 * toJson symmetric with fromJson — on web the axios payloads ARE the model
 * shape, so JSON round-trips losslessly).
 */

const DB_NAME = "trashvision-map-cache";
const DB_VERSION = 1;
const STORE = "map_cache";

/** Areas list cache key — protected during trim, mirrors mobile. */
export const AREAS_CACHE_KEY = "areas_v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "cache_key" });
        store.createIndex("updated_at", "updated_at");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

interface CacheRecord {
  cache_key: string;
  payload: string;
  updated_at: number;
}

/** Returns the parsed payload or null on miss/failure. Never throws. */
export async function getMapCache<T>(cacheKey: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(cacheKey);
      req.onsuccess = () => {
        const record = req.result as CacheRecord | undefined;
        if (!record) return resolve(null);
        try {
          resolve(JSON.parse(record.payload) as T);
        } catch {
          // Corrupt entry — behave like a miss; the network path fixes it.
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Upserts a payload and refreshes updated_at. Best-effort, never throws. */
export async function putMapCache(cacheKey: string, payload: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const record: CacheRecord = {
        cache_key: cacheKey,
        payload: JSON.stringify(payload),
        updated_at: Date.now(),
      };
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    // Best-effort (quota exceeded, private browsing, etc.).
  }
}

/**
 * Bounds the cache to the newest `maxEntries` payloads, always preserving the
 * `keep` set — a direct mirror of mobile's trimMapCache SQL
 * (`DELETE ... WHERE cache_key NOT IN (keep) AND cache_key NOT IN
 * (SELECT ... ORDER BY updated_at DESC LIMIT maxEntries)`).
 */
export async function trimMapCache(
  maxEntries = 24,
  keep: Set<string> = new Set(),
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const records = (getAllReq.result as CacheRecord[]) || [];
        if (records.length <= maxEntries) return resolve();

        const survivors = new Set(keep);
        records
          .sort((a, b) => b.updated_at - a.updated_at)
          .slice(0, maxEntries)
          .forEach((r) => survivors.add(r.cache_key));

        records.forEach((r) => {
          if (!survivors.has(r.cache_key)) store.delete(r.cache_key);
        });
        resolve();
      };
      getAllReq.onerror = () => reject(getAllReq.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Best-effort.
  }
}

/** Wipes the cache (parity with mobile's clearMapCache for a reset action). */
export async function clearMapCache(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Best-effort.
  }
}
