import { describe, it, expect } from "vitest";
import { seriePerMensuelle, lirePerHistorique, serieCoursBenefices } from "./perHistorique.js";

const HISTORIQUE = [
  { exercice: "2023-12-31", DilutedEPS: 5 },
  { exercice: "2024-12-31", DilutedEPS: 6 },
];

describe("seriePerMensuelle", () => {
  it("applique le bénéfice du dernier exercice clos à chaque mois", () => {
    const serie = seriePerMensuelle(
      [
        { date: "2023-11-01", close: 90 }, // avant tout exercice clos : ignoré
        { date: "2024-06-01", close: 100 }, // exercice 2023 → 100 / 5
        { date: "2025-03-01", close: 120 }, // exercice 2024 → 120 / 6
      ],
      HISTORIQUE
    );
    expect(serie).toEqual([
      { date: "2024-06-01", cours: 100, per: 20, bpa: 5, exercice: "2023-12-31" },
      { date: "2025-03-01", cours: 120, per: 20, bpa: 6, exercice: "2024-12-31" },
    ]);
  });

  it("laisse vide un mois rapporté à un exercice en perte", () => {
    const serie = seriePerMensuelle([{ date: "2024-06-01", close: 100 }], [{ exercice: "2023-12-31", DilutedEPS: -2 }]);
    expect(serie[0].per).toBeNull();
  });

  it("ne produit rien sans exercice publié", () => {
    expect(seriePerMensuelle([{ date: "2024-06-01", close: 100 }], [])).toEqual([]);
  });
});

describe("lirePerHistorique", () => {
  const serie = [10, 12, 14, 16, 18, 20, 22, 24].map((per, i) => ({ date: `2024-0${i + 1}-01`, per }));

  it("situe le dernier point dans l'historique", () => {
    const l = lirePerHistorique(serie);
    expect(l.moyenne).toBe(17);
    expect(l.actuel).toBe(24);
    expect(l.min).toBe(10);
    expect(l.max).toBe(24);
    // 7 mois sur 8 étaient moins chers.
    expect(l.rangActuelPct).toBeCloseTo(87.5, 6);
  });

  it("refuse de conclure sur moins de six mois", () => {
    expect(lirePerHistorique(serie.slice(0, 5))).toBeNull();
  });
});

describe("serieCoursBenefices", () => {
  const serie = [
    { date: "2025-06-01", cours: 100, bpa: 5 },
    { date: "2026-09-01", cours: 130, bpa: 6 },
  ];

  it("trace la valeur justifiée par les bénéfices au PER moyen", () => {
    const s = serieCoursBenefices(serie, 20);
    expect(s.map((p) => p.justifiee)).toEqual([100, 120]);
  });

  it("prolonge avec le consensus à partir du présent, et seulement les exercices futurs", () => {
    const s = serieCoursBenefices(serie, 20, [
      { exercice: "2026-12-31", bpaEstime: 6.5 },
      { exercice: "2027-12-31", bpaEstime: 7 },
      { exercice: "2025-12-31", bpaEstime: 99 },
    ]);
    expect(s.at(-3)).toMatchObject({ date: "2026-09-01", attendue: 120 });
    expect(s.slice(-2)).toEqual([
      { date: "2026-12-31", attendue: 130 },
      { date: "2027-12-31", attendue: 140 },
    ]);
  });

  it("ne trace rien sans PER moyen", () => {
    expect(serieCoursBenefices(serie, null)).toEqual([]);
  });
});
