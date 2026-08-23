/**
 * Diagnostic de la source de marché.
 *
 * Le point délicat n'est pas le cas « Yahoo répond » mais le cas « Yahoo
 * répond 200 avec un corps vide » : c'est son mode d'échec le plus courant, et
 * celui qu'un simple contrôle de statut HTTP laisse passer. C'est précisément
 * ce que cette route existe pour attraper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifier, SYMBOLE_TEMOIN } from "./_lib/routes/health.js";
import { _resetCache } from "./_lib/http.js";

const reponse = (corps, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => corps,
});

describe("diagnostic de la source de marché", () => {
  beforeEach(() => {
    _resetCache();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rapporte la source disponible quand un cours revient", async () => {
    globalThis.fetch.mockResolvedValue(
      reponse({ chart: { result: [{ meta: { regularMarketPrice: 7612.4 } }] } })
    );
    const etat = await verifier();
    expect(etat.ok).toBe(true);
    expect(etat.source).toBe("yahoo");
    expect(etat.verifieLe).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("interroge un indice, pas une action", () => {
    // Une action peut être radiée, suspendue ou changer de place de cotation :
    // autant de fausses alertes. Un indice, non.
    expect(SYMBOLE_TEMOIN.startsWith("^")).toBe(true);
  });

  it("détecte une réponse 200 au corps vide", async () => {
    globalThis.fetch.mockResolvedValue(reponse({ chart: { result: [{ meta: {} }] } }));
    const etat = await verifier();
    expect(etat.ok).toBe(false);
    expect(etat.motif).toBe("reponse-vide");
  });

  it("détecte une réponse structurellement absente", async () => {
    globalThis.fetch.mockResolvedValue(reponse({}));
    const etat = await verifier();
    expect(etat.ok).toBe(false);
    expect(etat.motif).toBe("reponse-vide");
  });

  it("rapporte un échec réseau sans lever", async () => {
    globalThis.fetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const etat = await verifier();
    expect(etat.ok).toBe(false);
    expect(etat.motif).toBeTruthy();
  });

  it("rapporte un statut HTTP en erreur", async () => {
    globalThis.fetch.mockResolvedValue(reponse(null, false));
    const etat = await verifier();
    expect(etat.ok).toBe(false);
    expect(etat.motif).toContain("500");
  });

  it("mesure la latence", async () => {
    globalThis.fetch.mockResolvedValue(
      reponse({ chart: { result: [{ meta: { regularMarketPrice: 1 } }] } })
    );
    const etat = await verifier();
    expect(etat.latenceMs).toBeGreaterThanOrEqual(0);
  });
});
