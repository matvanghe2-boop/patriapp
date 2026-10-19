/**
 * Tests de l'ENVELOPPE `withApi` — les protections communes à toutes les
 * routes. Les helpers purs (`rateLimit`, `isOriginAllowed`, `cached`…) sont
 * couverts à part dans `http.test.js` ; ici on vérifie leur assemblage, qui
 * est précisément l'endroit où deux défauts sont passés inaperçus :
 *
 *  1. le compartiment de débit était déduit du CHEMIN, identique pour les dix
 *     actions de `/api/market` — les quotas par route ne s'appliquaient donc
 *     jamais, seule la plus basse des dix limites existait réellement ;
 *  2. `Vary: Origin` n'était écrit que lorsqu'un en-tête `Origin` était
 *     présent, si bien que le CDN servait à n'importe quelle origine la
 *     réponse mise en cache pour une requête same-origin — le contrôle
 *     d'origine était contourné sans jamais être exécuté.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { withApi, cached, isOriginAllowed, _resetRateLimit, _resetCache } from "./http.js";

beforeEach(() => {
  _resetRateLimit();
  _resetCache();
});

/** Réponse minimale compatible avec ce que `withApi` manipule. */
function fausseReponse() {
  const entetes = {};
  let code = 0;
  let corps = null;
  const res = {
    headersSent: false,
    setHeader(n, v) {
      entetes[n] = v;
    },
    status(c) {
      code = c;
      return res;
    },
    json(b) {
      corps = b;
      return res;
    },
    end() {
      return res;
    },
  };
  return { res, lire: () => ({ code, corps, entetes }) };
}

const requete = (action, { origin, ip = "203.0.113.7" } = {}) => ({
  method: "GET",
  url: `/api/market?action=${action}`,
  headers: { "x-vercel-forwarded-for": ip, ...(origin ? { origin } : {}) },
  query: { action },
});

const ok = async (_req, res) => res.status(200).json({ ok: true });

describe("withApi — compartiments de débit", () => {
  it("ne mélange pas les quotas de deux routes partageant un chemin", async () => {
    // Reproduit la situation réelle : `quote` est large (120/min), `screen`
    // est serré (20/min), et les deux vivent sous /api/market. Consulter ses
    // cours ne doit pas consommer le quota du screener.
    const quote = withApi(ok, { limit: 120, windowMs: 60_000, portee: "market:quote" });
    const screen = withApi(ok, { limit: 20, windowMs: 60_000, portee: "market:screen" });

    for (let i = 0; i < 25; i++) {
      const { res } = fausseReponse();
      await quote(requete("quote"), res);
    }

    const { res, lire } = fausseReponse();
    await screen(requete("screen"), res);
    expect(lire().code).toBe(200);
  });

  it("applique bien la limite propre à chaque route", async () => {
    const screen = withApi(ok, { limit: 3, windowMs: 60_000, portee: "market:screen" });
    for (let i = 0; i < 3; i++) {
      const { res } = fausseReponse();
      await screen(requete("screen"), res);
    }
    const { res, lire } = fausseReponse();
    await screen(requete("screen"), res);
    expect(lire().code).toBe(429);
  });

  it("sépare toujours les appelants", async () => {
    const route = withApi(ok, { limit: 1, windowMs: 60_000, portee: "market:quote" });
    const a = fausseReponse();
    await route(requete("quote", { ip: "198.51.100.1" }), a.res);
    const b = fausseReponse();
    await route(requete("quote", { ip: "198.51.100.2" }), b.res);
    expect(a.lire().code).toBe(200);
    expect(b.lire().code).toBe(200);
  });

  it("retombe sur le chemin quand aucune portée n'est déclarée", async () => {
    // Les routes hors routeur (advisor, parse-pdf) n'ont pas besoin de portée :
    // leur chemin les distingue déjà.
    const route = withApi(ok, { limit: 1, windowMs: 60_000 });
    const premier = fausseReponse();
    await route({ method: "GET", url: "/api/parse-pdf", headers: {}, query: {} }, premier.res);
    const second = fausseReponse();
    await route({ method: "GET", url: "/api/parse-pdf", headers: {}, query: {} }, second.res);
    expect(premier.lire().code).toBe(200);
    expect(second.lire().code).toBe(429);
  });
});

describe("withApi — Vary: Origin", () => {
  const route = () => withApi(ok, { limit: 50, windowMs: 60_000, sMaxAge: 60, portee: "market:health" });

  it("écrit Vary: Origin même SANS en-tête Origin", async () => {
    // Le cas critique : c'est cette réponse-là que le CDN met en cache, et
    // sans `Vary` il la ressert ensuite à toutes les origines.
    const { res, lire } = fausseReponse();
    await route()(requete("health"), res);
    const { code, entetes } = lire();
    expect(code).toBe(200);
    expect(entetes.Vary).toBe("Origin");
    expect(entetes["Cache-Control"]).toContain("s-maxage=60");
  });

  it("écrit Vary: Origin sur une réponse autorisée", async () => {
    const { res, lire } = fausseReponse();
    await route()(requete("health", { origin: "http://localhost:5173" }), res);
    expect(lire().entetes.Vary).toBe("Origin");
  });

  it("écrit Vary: Origin sur un refus d'origine", async () => {
    const { res, lire } = fausseReponse();
    await route()(requete("health", { origin: "https://evil.example" }), res);
    const { code, entetes } = lire();
    expect(code).toBe(403);
    expect(entetes.Vary).toBe("Origin");
  });
});

describe("isOriginAllowed — origines Vercel", () => {
  const avec = (env) => {
    const sauvegarde = { ...process.env };
    Object.assign(process.env, env);
    return () => {
      for (const cle of Object.keys(process.env)) delete process.env[cle];
      Object.assign(process.env, sauvegarde);
    };
  };

  it("accepte le domaine de production, pas seulement l'URL du déploiement", () => {
    // Le cas qui cassait l'import PDF et l'assistant en production : seule
    // VERCEL_URL était acceptée, or elle désigne le déploiement et non
    // l'adresse à laquelle les utilisateurs arrivent.
    const restaurer = avec({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "",
      VERCEL_PROJECT_PRODUCTION_URL: "patriapp.vercel.app",
      VERCEL_URL: "patriapp-m6h8f0z1a-exemple.vercel.app",
    });
    try {
      expect(isOriginAllowed("https://patriapp.vercel.app")).toBe(true);
      expect(isOriginAllowed("https://patriapp-m6h8f0z1a-exemple.vercel.app")).toBe(true);
      expect(isOriginAllowed("https://evil.example")).toBe(false);
    } finally {
      restaurer();
    }
  });

  it("accepte toujours une origine listée explicitement", () => {
    const restaurer = avec({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://patrium.fr",
      VERCEL_PROJECT_PRODUCTION_URL: "patriapp.vercel.app",
      VERCEL_URL: "",
    });
    try {
      expect(isOriginAllowed("https://patrium.fr")).toBe(true);
      expect(isOriginAllowed("https://patriapp.vercel.app")).toBe(true);
    } finally {
      restaurer();
    }
  });
});

describe("cached — requêtes simultanées", () => {
  it("mutualise les appels concurrents sur une même clé", async () => {
    // Le cache ne couvre que ce qui arrive APRÈS une première réponse. Sans
    // registre des requêtes en vol, quatre appels concurrents sur une instance
    // froide exécutent quatre fois le producteur — donc quatre négociations
    // Yahoo au moment précis où il répond par des 429.
    let appels = 0;
    const producteur = async () => {
      appels += 1;
      await new Promise((r) => setTimeout(r, 10));
      return "valeur";
    };
    const resultats = await Promise.all([
      cached("concurrent", 1000, producteur),
      cached("concurrent", 1000, producteur),
      cached("concurrent", 1000, producteur),
      cached("concurrent", 1000, producteur),
    ]);
    expect(resultats).toEqual(["valeur", "valeur", "valeur", "valeur"]);
    expect(appels).toBe(1);
  });

  it("retente après un échec au lieu de condamner la clé", async () => {
    // La promesse en vol doit être oubliée même quand elle échoue : sinon tous
    // les appels suivants attendent une promesse déjà rejetée, et une panne
    // d'une seconde devient définitive pour la durée de vie de l'instance.
    let appels = 0;
    const producteur = async () => {
      appels += 1;
      if (appels === 1) throw new Error("panne passagère");
      return "ok";
    };
    await expect(cached("fragile", 1000, producteur)).rejects.toThrow("panne passagère");
    expect(await cached("fragile", 1000, producteur)).toBe("ok");
    expect(appels).toBe(2);
  });
});
