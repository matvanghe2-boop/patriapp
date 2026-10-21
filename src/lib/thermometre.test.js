import { describe, it, expect } from "vitest";
import { lectureVix, rangPct, ampleur, reculDepuisPlusHaut } from "./thermometre";
import { INDEX_CONSTITUENTS } from "./indexConstituents";

describe("thermomètre du marché", () => {
  it("lit le VIX selon les paliers d'usage", () => {
    expect(lectureVix(12).etat).toBe("calme");
    expect(lectureVix(17).etat).toBe("normal");
    expect(lectureVix(24).etat).toBe("nerveux");
    expect(lectureVix(41).etat).toBe("tension");
    expect(lectureVix(null)).toBeNull();
  });

  it("situe une valeur dans son historique", () => {
    expect(rangPct(15, [10, 12, 14, 16, 18])).toBe(60);
  });

  it("compte les valeurs au-dessus de leur moyenne mobile, et ignore les séries trop courtes", () => {
    const montante = { series: Array.from({ length: 40 }, (_, i) => ({ close: 100 + i })) };
    const descendante = { series: Array.from({ length: 40 }, (_, i) => ({ close: 200 - i })) };
    const courte = { series: [{ close: 1 }] };
    expect(ampleur([montante, descendante, courte])).toEqual({ auDessus: 1, total: 2, pct: 50 });
  });

  it("mesure le recul depuis le plus haut", () => {
    const r = reculDepuisPlusHaut([
      { date: "2026-01-05", close: 8000 },
      { date: "2026-08-03", close: 8715 },
      { date: "2026-10-19", close: 7920 },
    ]);
    expect(r.date).toBe("2026-08-03");
    expect(r.reculPct).toBeCloseTo((7920 / 8715 - 1) * 100);
  });

  it("tient le CAC 40 à quarante valeurs, la limite d'une requête de cours", () => {
    expect(new Set(INDEX_CONSTITUENTS.cac40).size).toBe(40);
  });
});
