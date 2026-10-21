import { describe, it, expect } from "vitest";
import { ventesAvecRecul, qualiteAchats, facteurDivisions, periodeNecessaire } from "./decisions";

/** Cinquante-trois semaines de cours, du lundi 2025-01-06 au 2026-01-05. */
function semaines(prix) {
  return prix.map((close, i) => {
    const d = new Date(Date.UTC(2025, 0, 6 + 7 * i)).toISOString().slice(0, 10);
    return { date: d, close, high: close * 1.02, low: close * 0.98 };
  });
}

describe("ventesAvecRecul", () => {
  const series = semaines(Array.from({ length: 53 }, (_, i) => 100 + i)); // de 100 à 152

  it("chiffre ce que garder aurait rapporté, dividendes détachés depuis compris", () => {
    const r = ventesAvecRecul({
      operations: [{ id: "v", type: "VENTE", date: "2025-03-05", asset: "ai.pa", quantity: 10, price: 108 }],
      historiques: new Map([["AI.PA", { series, currency: "EUR", dividendes: [{ date: "2025-05-20", montant: 3 }, { date: "2025-01-10", montant: 9 }] }]]),
      coursActuels: new Map([["AI.PA", 150]]),
    });
    const v = r.ventes[0];
    expect(v.statut).toBe("ok");
    // (150 − 108) × 10 = 420, plus 3 € × 10 de dividende détaché APRÈS la vente.
    expect(v.ecartEuro).toBe(450);
    expect(r.manque).toBe(450);
    expect(r.bilan).toBe(450);
  });

  it("ramène une vente antérieure à une division d'actions à l'échelle d'aujourd'hui", () => {
    const r = ventesAvecRecul({
      operations: [
        { id: "s", type: "SPLIT", date: "2025-06-01", asset: "AI.PA", ratio: 2 },
        { id: "v", type: "VENTE", date: "2025-03-05", asset: "AI.PA", quantity: 10, price: 216 },
      ],
      historiques: new Map([["AI.PA", { series, currency: "EUR" }]]),
      coursActuels: new Map([["AI.PA", 100]]),
    });
    const v = r.ventes[0];
    expect(v.quantite).toBe(20);
    expect(v.prixVente).toBe(108);
    expect(v.ecartEuro).toBe(-160);
    expect(r.evite).toBe(160);
  });

  it("écarte un prix incohérent avec le cours de sa semaine au lieu de le compter", () => {
    const r = ventesAvecRecul({
      operations: [{ id: "v", type: "VENTE", date: "2025-03-05", asset: "AI.PA", quantity: 10, price: 540 }],
      historiques: new Map([["AI.PA", { series, currency: "EUR" }]]),
    });
    expect(r.ventes[0].statut).toBe("incoherent");
    expect(r.nbComptees).toBe(0);
  });

  it("convertit en euros une ligne cotée en dollars, et la laisse hors du total sans taux", () => {
    const historiques = new Map([["AAPL", { series, currency: "USD" }]]);
    const operations = [{ id: "v", type: "VENTE", date: "2025-03-05", asset: "AAPL", quantity: 1, price: 108 }];
    expect(ventesAvecRecul({ operations, historiques, versEuro: { USD: 0.5 } }).ventes[0].ecartEuro).toBe(22);
    expect(ventesAvecRecul({ operations, historiques }).nbComptees).toBe(0);
  });
});

describe("qualiteAchats", () => {
  it("place un achat dans la fourchette des 52 semaines qui l'ont précédé", () => {
    // Un an de cours entre 100 et 152, achat la dernière semaine à 102 : tout en bas.
    const series = semaines([...Array.from({ length: 52 }, (_, i) => 100 + i), 102]);
    const r = qualiteAchats({
      operations: [{ id: "a", type: "ACHAT", date: "2026-01-06", asset: "CW8.PA", quantity: 1, price: 102 }],
      historiques: new Map([["CW8.PA", { series }]]),
    });
    expect(r.achats[0].tiers).toBe("bas");
    expect(r.achats[0].positionPct).toBeLessThan(10);
    expect(r.repartition).toEqual({ bas: 1, milieu: 0, haut: 0 });
  });

  it("refuse de situer un achat sans six mois de cours avant lui", () => {
    const series = semaines(Array.from({ length: 53 }, () => 100));
    const r = qualiteAchats({
      operations: [{ id: "a", type: "ACHAT", date: "2025-02-01", asset: "X", quantity: 1, price: 100 }],
      historiques: new Map([["X", { series }]]),
    });
    expect(r.achats[0].statut).toBe("historique-court");
    expect(r.nbLus).toBe(0);
  });

  it("compare au cours moyen du mois et pondère par le montant", () => {
    const series = semaines(Array.from({ length: 53 }, (_, i) => (i < 40 ? 100 : 120)));
    const r = qualiteAchats({
      operations: [
        { id: "a", type: "ACHAT", date: "2025-12-29", asset: "X", quantity: 10, price: 114 },
        { id: "b", type: "ACHAT", date: "2025-12-01", asset: "X", quantity: 1, price: 126 },
      ],
      historiques: new Map([["X", { series }]]),
    });
    expect(r.nbLus).toBe(2);
    // Décembre 2025 : quatre semaines à 120 (et une au 29 décembre, à 120).
    expect(r.achats.find((a) => a.id === "a").ecartMoisPct).toBeCloseTo(-5);
    expect(r.ecartMoisMoyenPct).toBeCloseTo((-5 * 1140 + 5 * 126) / 1266);
  });
});

it("compose les divisions postérieures à une opération", () => {
  const ops = [
    { type: "SPLIT", date: "2024-01-01", asset: "X", ratio: 2 },
    { type: "SPLIT", date: "2026-01-01", asset: "X", ratio: 3 },
  ];
  expect(facteurDivisions(ops, "X", "2023-06-01")).toBe(6);
  expect(facteurDivisions(ops, "X", "2025-06-01")).toBe(3);
});

it("choisit une période d'historique qui couvre le journal et l'année d'avant", () => {
  expect(periodeNecessaire([{ type: "ACHAT", date: "2025-06-01" }], "2026-10-21")).toBe("5y");
  expect(periodeNecessaire([{ type: "ACHAT", date: "2026-03-01" }], "2026-10-21")).toBe("2y");
  expect(periodeNecessaire([], "2026-10-21")).toBeNull();
});
