import { describe, it, expect, afterEach, vi } from "vitest";
import { fetchRates } from "./api";

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
