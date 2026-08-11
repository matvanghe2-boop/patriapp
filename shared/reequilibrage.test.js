import { describe, it, expect } from "vitest";
import {
  poidsActuels,
  ciblesEquiponderees,
  ciblesActuelles,
  normaliserCibles,
  construirePlan,
} from "./reequilibrage.js";

const pos = (id, quantite, cours, pru = cours, extra = {}) => ({
  id, ticker: id, name: id, quantity: quantite, current_price: cours, pru, ...extra,
});

// 6 000 € + 4 000 € = 10 000 € investis, soit 60 / 40.
const PORTEFEUILLE = [pos("A", 60, 100, 80), pos("B", 40, 100, 100)];

describe("poidsActuels", () => {
  it("répartit en pourcentage de la valeur investie", () => {
    expect(poidsActuels(PORTEFEUILLE)).toEqual({ A: 60, B: 40 });
  });

  it("tient compte de la devise", () => {
    const p = [pos("A", 10, 100, 100, { currency: "USD", fxRate: 0.5 }), pos("B", 10, 50)];
    // 10 × 100 × 0,5 = 500 € contre 500 € : moitié-moitié.
    expect(poidsActuels(p)).toEqual({ A: 50, B: 50 });
  });

  it("rend un objet vide sur un portefeuille sans valeur", () => {
    expect(poidsActuels([])).toEqual({});
  });
});

describe("préréglages de cibles", () => {
  it("équipondère", () => {
    expect(ciblesEquiponderees(PORTEFEUILLE)).toEqual({ A: 50, B: 50 });
  });

  it("fige les poids actuels", () => {
    expect(ciblesActuelles(PORTEFEUILLE)).toEqual({ A: 60, B: 40 });
  });
});

describe("normaliserCibles", () => {
  it("laisse intactes des cibles qui totalisent 100", () => {
    const r = normaliserCibles({ A: 60, B: 40 });
    expect(r.normalise).toBe(false);
    expect(r.cibles).toEqual({ A: 60, B: 40 });
  });

  it("ramène proportionnellement à 100 et le signale", () => {
    // Une saisie manuelle ne tombe jamais juste : mieux vaut corriger et le
    // dire que refuser le plan pour 90 %.
    const r = normaliserCibles({ A: 60, B: 30 });
    expect(r.normalise).toBe(true);
    expect(r.sommeInitiale).toBe(90);
    expect(r.cibles.A).toBeCloseTo(66.67, 1);
    expect(r.cibles.A + r.cibles.B).toBeCloseTo(100, 6);
  });

  it("écarte les valeurs négatives ou absentes", () => {
    expect(normaliserCibles({ A: 100, B: -5, C: null }).cibles).toEqual({ A: 100 });
  });
});

describe("construirePlan", () => {
  it("produit les ordres qui ramènent à la cible", () => {
    const plan = construirePlan(PORTEFEUILLE, { A: 50, B: 50 });
    const a = plan.ordres.find((o) => o.id === "A");
    const b = plan.ordres.find((o) => o.id === "B");
    expect(a.sens).toBe("vente");
    expect(a.ecartEuros).toBeCloseTo(-1000, 6);
    expect(b.sens).toBe("achat");
    expect(b.ecartEuros).toBeCloseTo(1000, 6);
  });

  it("convertit l'écart en quantité de titres", () => {
    const plan = construirePlan(PORTEFEUILLE, { A: 50, B: 50 });
    expect(plan.ordres.find((o) => o.id === "B").quantite).toBeCloseTo(10, 6);
  });

  it("ne bouge pas sous le seuil de tolérance", () => {
    // Un rééquilibrage à 0,5 % coûte des frais et de l'impôt pour un effet nul.
    const plan = construirePlan(PORTEFEUILLE, { A: 60.5, B: 39.5 }, { seuilTolerancePct: 1 });
    expect(plan.aExecuter).toHaveLength(0);
    expect(plan.ordres.every((o) => o.negligeable)).toBe(true);
  });

  it("n'achète que ce qui manque en mode sans vente", () => {
    const plan = construirePlan(PORTEFEUILLE, { A: 50, B: 50 }, { sansVente: true, apport: 2000 });
    expect(plan.ordres.find((o) => o.id === "A").sens).toBe("aucun");
    expect(plan.ordres.find((o) => o.id === "B").sens).toBe("achat");
    expect(plan.totalVentes).toBe(0);
  });

  it("intègre l'apport dans la base de calcul", () => {
    const plan = construirePlan(PORTEFEUILLE, { A: 50, B: 50 }, { apport: 10000 });
    // Base 20 000 € : la cible de B passe à 10 000 €, soit 6 000 € à acheter.
    expect(plan.ordres.find((o) => o.id === "B").ecartEuros).toBeCloseTo(6000, 6);
  });

  it("calcule le besoin de liquidités", () => {
    const plan = construirePlan(PORTEFEUILLE, { A: 50, B: 50 });
    // 1 000 € d'achat financés par 1 000 € de vente : rien à apporter.
    expect(plan.besoinLiquidites).toBeCloseTo(0, 6);
  });

  it("estime la plus-value cédée sur les ventes", () => {
    // A vaut 6 000 € pour un prix de revient de 4 800 € : 1 200 € de
    // plus-value latente. En céder un sixième expose 200 €.
    const plan = construirePlan(PORTEFEUILLE, { A: 50, B: 50 });
    expect(plan.plusValueCedeeTotale).toBeCloseTo(200, 6);
  });

  it("ne compte aucune plus-value quand rien n'est vendu", () => {
    const plan = construirePlan(PORTEFEUILLE, { A: 50, B: 50 }, { sansVente: true, apport: 2000 });
    expect(plan.plusValueCedeeTotale).toBe(0);
  });

  it("chiffre les frais au nombre d'ordres réellement passés", () => {
    const plan = construirePlan(PORTEFEUILLE, { A: 50, B: 50 }, { fraisParOrdre: 2.5 });
    expect(plan.aExecuter).toHaveLength(2);
    expect(plan.fraisEstimes).toBeCloseTo(5, 6);
  });

  it("mesure la dérive moyenne à la cible", () => {
    const plan = construirePlan(PORTEFEUILLE, { A: 50, B: 50 });
    expect(plan.deriveMoyennePct).toBeCloseTo(10, 6);
  });

  it("conserve les poids actuels pour une ligne sans cible", () => {
    const plan = construirePlan(PORTEFEUILLE, { A: 60 });
    expect(plan.ordres.find((o) => o.id === "B").sens).toBe("aucun");
  });

  it("ne transforme pas une cible partielle en 100 %", () => {
    // Régression : la normalisation ne voyait que les cibles explicitement
    // saisies. Fixer 70 % sur une seule ligne la ramenait donc à 100 % du
    // portefeuille — exactement l'inverse de ce que l'utilisateur demande.
    const plan = construirePlan(PORTEFEUILLE, { A: 70 });
    const a = plan.ordres.find((o) => o.id === "A");
    const b = plan.ordres.find((o) => o.id === "B");
    // 70 pour A, 40 (poids actuel) pour B, soit 110 -> 63,6 % et 36,4 %.
    expect(a.poidsCiblePct).toBeCloseTo(63.6, 1);
    expect(b.poidsCiblePct).toBeCloseTo(36.4, 1);
    expect(a.poidsCiblePct + b.poidsCiblePct).toBeCloseTo(100, 6);
  });

  it("respecte exactement des cibles qui totalisent déjà 100", () => {
    const plan = construirePlan(PORTEFEUILLE, { A: 30, B: 70 });
    expect(plan.ordres.find((o) => o.id === "A").poidsCiblePct).toBeCloseTo(30, 6);
    expect(plan.ordres.find((o) => o.id === "B").poidsCiblePct).toBeCloseTo(70, 6);
    expect(plan.ciblesNormalisees).toBe(false);
  });

  it("tolère un portefeuille vide", () => {
    const plan = construirePlan([], {});
    expect(plan.aExecuter).toEqual([]);
    expect(plan.deriveMoyennePct).toBe(0);
  });
});
