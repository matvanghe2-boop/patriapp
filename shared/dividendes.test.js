import { describe, it, expect } from "vitest";
import {
  dividendeAttendu,
  totalAttendu,
  percusParAnnee,
  percusParActif,
  serieAnnuelle,
  comparerAttenduPercu,
  rendementSurPrixDeRevient,
} from "./dividendes.js";

const POSITIONS = [
  { ticker: "AI.PA", quantity: 10, pru: 150, current_price: 180, annual_dividend: 3.2 },
  { ticker: "TTE.PA", quantity: 20, pru: 50, current_price: 60, annual_dividend: 3 },
];

const OPS = [
  { date: "2024-05-20", asset: "AI.PA", type: "DIVIDENDE", amount: 30 },
  { date: "2024-10-01", asset: "TTE.PA", type: "DIVIDENDE", amount: 28 },
  { date: "2025-05-20", asset: "AI.PA", type: "DIVIDENDE", amount: 32 },
  { date: "2025-10-01", asset: "TTE.PA", type: "DIVIDENDE", amount: 32 },
  { date: "2025-03-01", asset: "AI.PA", type: "ACHAT", quantity: 5, price: 170 },
];

describe("dividendeAttendu", () => {
  it("multiplie le dividende par action par la quantité", () => {
    expect(dividendeAttendu(POSITIONS[0])).toBeCloseTo(32, 6);
  });

  it("convertit les lignes en devise", () => {
    const p = { quantity: 10, annual_dividend: 2, currency: "USD", fxRate: 0.9 };
    expect(dividendeAttendu(p)).toBeCloseTo(18, 6);
  });

  it("rend zéro sans dividende annoncé", () => {
    expect(dividendeAttendu({ quantity: 10 })).toBe(0);
  });

  it("totalise le portefeuille", () => {
    expect(totalAttendu(POSITIONS)).toBeCloseTo(92, 6);
  });
});

describe("percusParAnnee", () => {
  it("regroupe les encaissements par année civile", () => {
    expect(percusParAnnee(OPS)).toEqual([
      { annee: "2024", montant: 58, nbVersements: 2 },
      { annee: "2025", montant: 64, nbVersements: 2 },
    ]);
  });

  it("ignore les opérations qui ne sont pas des dividendes", () => {
    // L'achat de 2025 ne doit pas gonfler le total.
    expect(percusParAnnee(OPS).find((a) => a.annee === "2025").nbVersements).toBe(2);
  });

  it("tolère un journal vide", () => {
    expect(percusParAnnee([])).toEqual([]);
  });
});

describe("percusParActif", () => {
  it("classe les actifs par montant décroissant", () => {
    expect(percusParActif(OPS)).toEqual([
      { actif: "AI.PA", montant: 62 },
      { actif: "TTE.PA", montant: 60 },
    ]);
  });
});

describe("serieAnnuelle", () => {
  it("calcule la croissance d'une année pleine sur l'autre", () => {
    const serie = serieAnnuelle(OPS, { anneeCourante: "2026" });
    const a2025 = serie.find((s) => s.annee === "2025");
    // 58 -> 64, soit +10,3 %.
    expect(a2025.croissancePct).toBeCloseTo(10.34, 1);
  });

  it("marque l'année en cours comme partielle et n'en calcule pas la croissance", () => {
    // Sans cela, chaque mois de janvier ferait croire à un effondrement.
    const serie = serieAnnuelle(OPS, { anneeCourante: "2025" });
    const a2025 = serie.find((s) => s.annee === "2025");
    expect(a2025.partielle).toBe(true);
    expect(a2025.croissancePct).toBeNull();
  });

  it("ajoute l'année en cours quand rien n'a encore été perçu", () => {
    const serie = serieAnnuelle(OPS, { attenduAnnuel: 92, anneeCourante: "2026" });
    const a2026 = serie.find((s) => s.annee === "2026");
    expect(a2026).toBeDefined();
    expect(a2026.montant).toBe(0);
    expect(a2026.attendu).toBe(92);
  });
});

describe("comparerAttenduPercu", () => {
  it("rapporte le perçu à l'attendu et à l'avancement de l'année", () => {
    // Au 1er juillet, avoir encaissé la moitié de l'attendu est conforme.
    const r = comparerAttenduPercu(OPS, POSITIONS, new Date("2025-07-01T12:00:00"));
    expect(r.attendu).toBeCloseTo(92, 6);
    expect(r.percu).toBeCloseTo(32, 6);
    expect(r.avancementAnneePct).toBeGreaterThan(45);
    expect(r.avancementAnneePct).toBeLessThan(55);
    expect(r.realisationPct).toBeCloseTo(34.8, 1);
  });

  it("rend une réalisation nulle sans dividende attendu", () => {
    const r = comparerAttenduPercu([], [{ quantity: 1, pru: 10, current_price: 10 }]);
    expect(r.realisationPct).toBeNull();
  });
});

describe("rendementSurPrixDeRevient", () => {
  it("rapporte le dividende attendu au capital réellement investi", () => {
    // Coût : 10 × 150 + 20 × 50 = 2 500 €. Dividende attendu : 92 €.
    expect(rendementSurPrixDeRevient(POSITIONS)).toBeCloseTo(3.68, 2);
  });

  it("ne dépend pas du cours, contrairement au rendement courant", () => {
    const cher = POSITIONS.map((p) => ({ ...p, current_price: p.current_price * 3 }));
    expect(rendementSurPrixDeRevient(cher)).toBeCloseTo(rendementSurPrixDeRevient(POSITIONS), 6);
  });

  it("rend null sans capital investi", () => {
    expect(rendementSurPrixDeRevient([])).toBeNull();
  });
});
