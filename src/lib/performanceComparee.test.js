import { describe, it, expect } from "vitest";
import { memeArgentDansUnIndice, rendementsMensuels, coutDesFrais } from "./performanceComparee";

describe("memeArgentDansUnIndice", () => {
  const clotures = [
    { date: "2026-01-02", close: 100 },
    { date: "2026-02-02", close: 110 },
    { date: "2026-03-02", close: 120 },
  ];

  it("achète l'indice avec chaque apport, le jour même", () => {
    const r = memeArgentDansUnIndice(
      [
        { date: "2026-01-02", valeur: 1000, capital: 1000 }, // 10 parts à 100
        { date: "2026-02-02", valeur: 2150, capital: 2100 }, // +1 100 → 10 parts à 110
        { date: "2026-03-02", valeur: 2300, capital: 2100 }, // 20 parts à 120 = 2 400
      ],
      clotures
    );
    expect(r.indice).toBeCloseTo(2400, 6);
    expect(r.reel).toBe(2300);
    expect(r.ecart).toBeCloseTo(-100, 6);
    expect(r.depuis).toBe("2026-01-02");
  });

  it("revend des parts lors d'un retrait", () => {
    const r = memeArgentDansUnIndice(
      [
        { date: "2026-01-02", valeur: 1000, capital: 1000 },
        { date: "2026-02-02", valeur: 550, capital: 450 }, // retrait de 550 → −5 parts à 110
      ],
      clotures
    );
    expect(r.indice).toBeCloseTo(550, 6);
  });

  it("prend la dernière clôture connue un jour sans cotation", () => {
    const r = memeArgentDansUnIndice(
      [
        { date: "2026-01-03", valeur: 1000, capital: 1000 }, // samedi : clôture du 2
        { date: "2026-03-05", valeur: 1300, capital: 1000 },
      ],
      clotures
    );
    expect(r.indice).toBeCloseTo(1200, 6);
  });

  it("ne conclut pas sans données exploitables", () => {
    expect(memeArgentDansUnIndice([], clotures)).toBeNull();
    expect(memeArgentDansUnIndice([{ date: "2026-01-02", valeur: 1000, capital: 1000 }], clotures)).toBeNull();
    expect(memeArgentDansUnIndice([{ date: "2026-01-02", valeur: 1, capital: 1 }, { date: "2026-02-02", valeur: 1, capital: 1 }], [])).toBeNull();
  });
});

describe("rendementsMensuels", () => {
  it("compose les rendements de chaque mois en neutralisant les apports", () => {
    const lignes = rendementsMensuels([
      { date: "2026-01-30", valeur: 1000, capital: 1000 },
      { date: "2026-02-27", valeur: 1100, capital: 1000 }, // +10 %
      { date: "2026-03-31", valeur: 2210, capital: 2000 }, // +1 000 versés : (2 210 − 1 000) / 1 100 − 1 = +10 %
    ]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].annee).toBe(2026);
    expect(lignes[0].mois[2].pct).toBeCloseTo(10, 6);
    expect(lignes[0].mois[3].pct).toBeCloseTo(10, 6);
    expect(lignes[0].total).toBeCloseTo(21, 6);
    // Le dernier mois n'est couvert qu'en partie : il est signalé.
    expect(lignes[0].mois[3].partiel).toBe(true);
    expect(lignes[0].mois[2].partiel).toBe(false);
  });

  it("ne produit rien sans historique", () => {
    expect(rendementsMensuels([])).toEqual([]);
  });
});

describe("coutDesFrais", () => {
  const ops = [
    { type: "ACHAT", quantity: 10, price: 100, fees: 5 },
    { type: "VENTE", quantity: 5, price: 200, fees: 5 },
    { type: "VERSEMENT", amount: 1000 },
  ];

  it("additionne les frais et les rapporte aux montants échangés", () => {
    const c = coutDesFrais(ops, 7);
    expect(c.frais).toBe(10);
    expect(c.nbOrdres).toBe(2);
    expect(c.fraisMoyenParOrdre).toBe(5);
    expect(c.fraisSurVolumePct).toBeCloseTo(0.5, 6); // 10 / 2 000
  });

  it("projette les frais au rendement mesuré", () => {
    const c = coutDesFrais(ops, 7);
    expect(c.tauxMesure).toBe(true);
    expect(c.projections[0].valeur).toBeCloseTo(10 * 1.07 ** 10, 6);
  });

  it("se rabat sur une hypothèse de 5 %, signalée, sans rendement mesurable", () => {
    const c = coutDesFrais(ops, null);
    expect(c.tauxMesure).toBe(false);
    expect(c.taux).toBe(5);
  });
});
