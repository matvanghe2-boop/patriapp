import { describe, it, expect } from "vitest";
import { scoreSante, joursADecouvert } from "./santeFinanciere";

describe("scoreSante", () => {
  it("note chaque critère et en fait la moyenne", () => {
    const s = scoreSante({ matelasMois: 3, tauxEpargnePct: 20, partChargesFixes: 0.2, joursDecouvert: 0 });
    expect(s.score).toBe(100);
    expect(s.etat).toBe("ok");
    expect(s.criteres.map((c) => c.id)).toEqual(["matelas", "epargne", "charges", "decouvert"]);
  });

  it("baisse avec un matelas mince et des jours à découvert", () => {
    const s = scoreSante({ matelasMois: 1.5, tauxEpargnePct: 10, partChargesFixes: 0.5, joursDecouvert: 4 });
    expect(s.criteres.find((c) => c.id === "matelas").score).toBe(50);
    expect(s.criteres.find((c) => c.id === "decouvert").score).toBe(60);
    expect(s.score).toBeLessThan(75);
  });

  it("écarte un critère inconnu au lieu de le compter zéro", () => {
    const s = scoreSante({ tauxEpargnePct: 30 });
    expect(s.criteres).toHaveLength(1);
    expect(s.score).toBe(100);
    expect(scoreSante({})).toBeNull();
  });
});

describe("joursADecouvert", () => {
  it("compte les fins de journée sous zéro sur la fenêtre", () => {
    const serie = [
      { date: "2026-09-01", solde: 10000 },
      { date: "2026-09-10", solde: -500 },
      { date: "2026-09-13", solde: 2000 },
      { date: "2026-09-30", solde: 2500 },
    ];
    expect(joursADecouvert(serie, 30)).toBe(3);
    expect(joursADecouvert([])).toBeNull();
  });
});
