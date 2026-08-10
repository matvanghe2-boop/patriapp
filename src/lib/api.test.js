import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchRates, fetchScreen } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRates", () => {
  it("renvoie le corps quand la réponse est un catalogue de taux valide", async () => {
    const payload = { rates: [{ id: "livret-a", value: 1.7 }], liveEnabled: false, generatedAt: "2026-07-26T00:00:00Z" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    expect(await fetchRates()).toEqual(payload);
  });

  it("échoue proprement sur un statut d'erreur avec message explicite", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Panne serveur" }) }));
    await expect(fetchRates()).rejects.toThrow("Panne serveur");
  });

  /**
   * Régression : en développement sans `vercel dev` (simple `npm run dev`),
   * une route /api/* inconnue reçoit le fallback SPA de Vite — un document
   * HTML servi avec le statut 200, PAS une vraie erreur HTTP. `res.ok` vaut
   * donc `true` alors que le corps n'est pas du JSON exploitable. Avant
   * correction, ce cas renvoyait silencieusement `{}` : `RatesHub` appelait
   * ensuite `.find()` sur `data.rates` (undefined) et l'écran entier
   * plantait au lieu d'afficher le message de repli habituel de l'app.
   */
  it("échoue explicitement sur un 200 dont le corps n'est pas un catalogue de taux (fallback SPA HTML)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token '<'");
        },
      })
    );
    await expect(fetchRates()).rejects.toThrow("Catalogue des taux indisponible");
  });

  it("échoue aussi si le JSON est valide mais ne contient pas de tableau `rates`", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ notRates: true }) }));
    await expect(fetchRates()).rejects.toThrow();
  });
});

describe("fetchScreen", () => {
  const faireTitres = (symboles) => symboles.map((s) => ({ symbole: s, ok: true }));

  it("découpe les gros univers en requêtes de vingt symboles", async () => {
    // L'endpoint borne chaque requête à 40 symboles, et une fonction
    // serverless a un temps d'exécution limité : un univers de 60 titres doit
    // partir en plusieurs appels, sinon il est silencieusement tronqué.
    const soixante = Array.from({ length: 60 }, (_, i) => `T${i}`);
    const appels = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const symboles = decodeURIComponent(String(url).match(/symbols=([^&]*)/)[1]).split(",");
      appels.push(symboles.length);
      return { ok: true, json: async () => faireTitres(symboles) };
    }));

    const out = await fetchScreen(soixante);
    expect(appels).toEqual([20, 20, 20]);
    expect(out).toHaveLength(60);
    expect(out.map((t) => t.symbole)).toEqual(soixante);
  });

  it("n'émet qu'une requête sous vingt symboles", async () => {
    const appels = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      appels.push(url);
      return { ok: true, json: async () => faireTitres(["A", "B"]) };
    }));
    await fetchScreen(["A", "B"]);
    expect(appels).toHaveLength(1);
  });

  it("cible le routeur avec l'action attendue", async () => {
    let vue = "";
    vi.stubGlobal("fetch", vi.fn(async (url) => { vue = String(url); return { ok: true, json: async () => [] }; }));
    await fetchScreen(["AI.PA"]);
    expect(vue).toContain("/api/market?action=screen");
  });

  it("déduplique les symboles", async () => {
    let symboles = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      symboles = decodeURIComponent(String(url).match(/symbols=([^&]*)/)[1]).split(",");
      return { ok: true, json: async () => [] };
    }));
    await fetchScreen(["A", "A", "B"]);
    expect(symboles).toEqual(["A", "B"]);
  });

  it("signale la progression tranche par tranche", async () => {
    const etapes = [];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
    await fetchScreen(Array.from({ length: 45 }, (_, i) => `T${i}`), {
      onProgression: (p) => etapes.push(`${p.faites}/${p.total}`),
    });
    expect(etapes).toEqual(["1/3", "2/3", "3/3"]);
  });

  it("ne fait aucun appel sur une liste vide", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await fetchScreen([])).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("remonte l'erreur d'une tranche plutôt que de rendre un résultat partiel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "Quota dépassé" }) })));
    await expect(fetchScreen(["A"])).rejects.toThrow("Quota dépassé");
  });
});
