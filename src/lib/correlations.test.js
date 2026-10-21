import { describe, it, expect } from "vitest";
import { rendementsQuotidiens, correlation, matriceCorrelations } from "./correlations";

/** Série de clôtures à partir d'une liste de rendements quotidiens. */
function serie(rendements, debut = 100) {
  const points = [{ date: "2026-01-01", close: debut }];
  rendements.forEach((r, i) => {
    const d = new Date(Date.UTC(2026, 0, 2 + i)).toISOString().slice(0, 10);
    points.push({ date: d, close: points[points.length - 1].close * (1 + r) });
  });
  return points;
}

// Rendements pseudo-aléatoires mais déterministes.
const base = Array.from({ length: 80 }, (_, i) => Math.sin(i * 1.7) * 0.01);
const inverse = base.map((r) => -r);
const sansLien = Array.from({ length: 80 }, (_, i) => Math.cos(i * 0.9 + 1) * 0.01);

describe("correlation", () => {
  it("vaut 1 pour deux titres qui bougent ensemble, −1 en sens inverse", () => {
    const a = rendementsQuotidiens(serie(base));
    expect(correlation(a, rendementsQuotidiens(serie(base, 50))).rho).toBeCloseTo(1, 6);
    expect(correlation(a, rendementsQuotidiens(serie(inverse))).rho).toBeCloseTo(-1, 6);
  });

  it("refuse de conclure sur moins de soixante séances communes", () => {
    const court = rendementsQuotidiens(serie(base.slice(0, 30)));
    expect(correlation(court, court)).toBeNull();
  });

  it("ne compare que les dates communes aux deux titres", () => {
    const a = new Map([["d1", 0.01], ["d2", 0.02], ["d3", -0.01]]);
    const b = new Map([["d2", 0.02], ["d3", -0.01], ["d4", 0.5]]);
    expect(correlation(a, b, 2).n).toBe(2);
  });
});

describe("matriceCorrelations", () => {
  it("classe les paires de la plus liée à la plus indépendante", () => {
    const m = matriceCorrelations({ AAA: serie(base), BBB: serie(base, 30), CCC: serie(sansLien) });
    expect(m.tickers).toEqual(["AAA", "BBB", "CCC"]);
    expect(m.matrice[0][0]).toBe(1);
    expect(m.paires[0]).toEqual(expect.objectContaining({ a: "AAA", b: "BBB" }));
    expect(m.paires[0].rho).toBeCloseTo(1, 6);
    expect(Math.abs(m.paires.at(-1).rho)).toBeLessThan(0.5);
  });
});
