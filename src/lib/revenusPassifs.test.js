import { describe, it, expect } from "vitest";
import {
  interetsLivrets,
  revenusPassifsAnnuels,
  moisPourAtteindre,
  independanceFinanciere,
  calendrierRevenus,
} from "./revenusPassifs";

const LIVRETS = [
  { name: "Livret A", balance: 10000, rate: 0.017 },
  { name: "LDDS", balance: 5000, rate: 0.017 },
];

describe("revenus passifs", () => {
  it("additionne dividendes attendus et intérêts des livrets", () => {
    expect(interetsLivrets(LIVRETS)).toBeCloseTo(255, 6);
    const r = revenusPassifsAnnuels({
      positions: [{ ticker: "AI.PA", quantity: 10, annual_dividend: 3.3 }],
      enveloppe: "PEA",
      livrets: LIVRETS,
    });
    expect(r.dividendes).toBeCloseTo(33, 6); // action française : pas de retenue
    expect(r.total).toBeCloseTo(288, 6);
  });
});

describe("moisPourAtteindre", () => {
  it("compte les mois jusqu'à la cible", () => {
    expect(moisPourAtteindre(0, 100, 0, 1000)).toBe(10);
    expect(moisPourAtteindre(2000, 0, 0, 1000)).toBe(0);
  });

  it("renonce au-delà de cinquante ans plutôt que d'afficher une date absurde", () => {
    expect(moisPourAtteindre(0, 1, 0, 1e9)).toBeNull();
  });
});

describe("independanceFinanciere", () => {
  it("mesure la couverture et la règle des 4 %", () => {
    const i = independanceFinanciere({
      revenusPassifs: 1200,
      depensesMensuelles: 1000,
      capitalFinancier: 150000,
      epargneMensuelle: 0,
      tauxAnnuelPct: 0,
    });
    expect(i.couverturePct).toBeCloseTo(10, 6); // 1 200 / 12 000
    expect(i.regleRetraitPct).toBeCloseTo(50, 6); // 6 000 / 12 000
    expect(i.cible).toBe(300000); // 25 × 12 000
    expect(i.moisAvantCible).toBeNull(); // sans épargne ni rendement, jamais
  });

  it("n'invente aucun ratio sans dépenses renseignées", () => {
    expect(independanceFinanciere({ revenusPassifs: 500, depensesMensuelles: 0 })).toBeNull();
  });
});

describe("calendrierRevenus", () => {
  const AUJ = "2026-10-21";

  it("répartit chaque dividende selon ses mois de détachement", () => {
    const c = calendrierRevenus({
      positions: [{ ticker: "AI.PA", quantity: 10, annual_dividend: 3, dividendeMois: { 5: 1 } }],
      aujourdhui: AUJ,
    });
    expect(c.mois[0].cle).toBe("2026-10");
    expect(c.mois).toHaveLength(12);
    expect(c.mois.find((m) => m.numero === 5).dividendes).toBeCloseTo(30, 6);
    expect(c.total).toBeCloseTo(30, 6);
  });

  it("met les intérêts des livrets au 31 décembre", () => {
    const c = calendrierRevenus({ livrets: LIVRETS, aujourdhui: AUJ });
    expect(c.mois.find((m) => m.numero === 12).interets).toBeCloseTo(255, 6);
    expect(c.mois.filter((m) => m.interets > 0)).toHaveLength(1);
  });

  it("ne répartit pas au jugé une ligne sans calendrier connu", () => {
    const c = calendrierRevenus({
      positions: [{ ticker: "XX.PA", quantity: 10, annual_dividend: 2 }],
      aujourdhui: AUJ,
    });
    expect(c.inconnu).toBeCloseTo(20, 6);
    expect(c.lignesInconnues).toEqual(["XX.PA"]);
    expect(c.total).toBe(0);
  });
});
