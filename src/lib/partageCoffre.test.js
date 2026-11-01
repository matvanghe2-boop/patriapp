/**
 * File d'attente du partage Android : ce que le service worker range dans le
 * cache, l'onglet Coffre doit le relire tel quel, puis le vider.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CACHE_PARTAGE, fichiersPartages, oublierPartage } from "./partageCoffre";

/** Cache Storage minimal, en mémoire, avec la forme de l'API du navigateur. */
function fauxCaches() {
  const magasins = new Map();
  const ouvrir = (nom) => {
    if (!magasins.has(nom)) magasins.set(nom, new Map());
    const entrees = magasins.get(nom);
    return {
      put: async (url, reponse) => entrees.set(url, reponse),
      keys: async () => [...entrees.keys()].map((url) => ({ url: `https://patrium.test${url}` })),
      match: async (requete) => entrees.get(requete.url.replace("https://patrium.test", ""))?.clone(),
    };
  };
  return {
    magasins,
    has: async (nom) => magasins.has(nom),
    open: async (nom) => ouvrir(nom),
    delete: async (nom) => magasins.delete(nom),
  };
}

let caches;

beforeEach(() => {
  caches = fauxCaches();
  vi.stubGlobal("caches", caches);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ranger = async (cle, contenu, type, nom) => {
  const cache = await caches.open(CACHE_PARTAGE);
  await cache.put(
    `/__partage/${cle}`,
    // Corps en texte : sous jsdom, le Blob de la page et la Response de Node ne
    // viennent pas du même environnement, et la Response ne saurait pas le lire.
    new Response(contenu, {
      headers: { "Content-Type": type, "X-Nom-Fichier": encodeURIComponent(nom) },
    })
  );
};

describe("partage vers le coffre", () => {
  it("relit les fichiers dans leur ordre d'arrivée, avec leur nom et leur type", async () => {
    await ranger("1700000000000-10", "verso", "image/jpeg", "carte verso.jpg");
    await ranger("1700000000000-2", "recto", "image/jpeg", "carte recto.jpg");
    await ranger("1700000000000-0", "%PDF", "application/pdf", "attestation énergie.pdf");

    const fichiers = await fichiersPartages();
    expect(fichiers.map((f) => f.name)).toEqual(["attestation énergie.pdf", "carte recto.jpg", "carte verso.jpg"]);
    expect(fichiers[0].type).toBe("application/pdf");
    expect(await fichiers[1].text()).toBe("recto");
  });

  it("ne crée pas de cache quand rien n'attend, et vide la file sur demande", async () => {
    expect(await fichiersPartages()).toEqual([]);
    expect(caches.magasins.has(CACHE_PARTAGE)).toBe(false);

    await ranger("1-0", "x", "application/pdf", "a.pdf");
    await oublierPartage();
    expect(await fichiersPartages()).toEqual([]);
  });

  it("garde un nom par défaut quand celui reçu est mal encodé", async () => {
    const cache = await caches.open(CACHE_PARTAGE);
    await cache.put(
      "/__partage/1-0",
      new Response("x", { headers: { "Content-Type": "application/pdf", "X-Nom-Fichier": "%E0%A4%A" } })
    );
    const [fichier] = await fichiersPartages();
    expect(fichier.name).toBe("document partagé");
  });

  it("ne fait rien là où le navigateur n'a pas de Cache Storage", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await fichiersPartages()).toEqual([]);
    await expect(oublierPartage()).resolves.toBeUndefined();
  });
});
