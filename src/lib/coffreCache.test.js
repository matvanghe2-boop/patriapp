/**
 * Fichiers gardés sur l'appareil : on vérifie le chemin réel sur un faux
 * IndexedDB minimal (jsdom n'en a pas), puis le repli sans IndexedDB.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/** IndexedDB réduit à ce que coffreCache.js utilise, en mémoire. */
function fauxIndexedDB() {
  const bases = new Map();
  const demande = (executer) => {
    const d = {};
    queueMicrotask(() => {
      try {
        d.result = executer();
        d.onsuccess?.();
      } catch (e) {
        d.error = e;
        d.onerror?.();
      }
    });
    return d;
  };
  return {
    open(nom) {
      const d = {};
      queueMicrotask(() => {
        let db = bases.get(nom);
        const nouvelle = !db;
        if (!db) {
          const magasins = new Map();
          db = {
            createObjectStore: (n) => magasins.set(n, new Map()),
            transaction: (n) => {
              const m = magasins.get(n);
              return {
                objectStore: () => ({
                  get: (k) => demande(() => m.get(k)),
                  put: (v, k) => demande(() => m.set(k, v)),
                  delete: (k) => demande(() => m.delete(k)),
                  getAll: () => demande(() => [...m.values()]),
                  getAllKeys: () => demande(() => [...m.keys()]),
                  clear: () => demande(() => m.clear()),
                }),
              };
            },
          };
          bases.set(nom, db);
        }
        d.result = db;
        if (nouvelle) d.onupgradeneeded?.();
        d.onsuccess?.();
      });
      return d;
    },
  };
}

let cache;

beforeAll(async () => {
  vi.stubGlobal("indexedDB", fauxIndexedDB());
  cache = await import("./coffreCache");
});

beforeEach(async () => {
  localStorage.clear();
  await cache.viderCache();
});

describe("coffreCache", () => {
  it("garde, relit et retire des octets chiffrés", async () => {
    await cache.mettreEnCache("f_1", new Uint8Array([1, 2, 3]));
    await cache.mettreEnCache("f_2", new Uint8Array([4, 5]));
    expect(await cache.lireEnCache("f_1")).toEqual(new Uint8Array([1, 2, 3]));
    expect(await cache.contenuCache()).toEqual([
      { id: "f_1", taille: 3 },
      { id: "f_2", taille: 2 },
    ]);

    await cache.retirerDuCache(["f_1"]);
    expect(await cache.lireEnCache("f_1")).toBeNull();
    await cache.viderCache();
    expect(await cache.contenuCache()).toEqual([]);
  });

  it("ne garde rien quand le réglage de l'appareil le refuse", async () => {
    expect(cache.horsLigneActif()).toBe(true);
    cache.reglerHorsLigne(false);
    expect(cache.horsLigneActif()).toBe(false);
    await cache.mettreEnCache("f_3", new Uint8Array([9]));
    expect(await cache.lireEnCache("f_3")).toBeNull();
    cache.reglerHorsLigne(true);
    expect(localStorage.getItem("patrimoine:__coffreHorsLigne")).toBe("oui");
  });
});

describe("coffreCache sans IndexedDB", () => {
  it("devient sans effet au lieu d'échouer", async () => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", undefined);
    const sans = await import("./coffreCache");
    await sans.mettreEnCache("f_1", new Uint8Array([1]));
    expect(await sans.lireEnCache("f_1")).toBeNull();
    expect(await sans.contenuCache()).toEqual([]);
    await expect(sans.viderCache()).resolves.toBeUndefined();
  });
});
