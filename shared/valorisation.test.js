import { describe, it, expect } from "vitest";
import { prixImplique, prixParRendement, fourchetteValorisation } from "./valorisation.js";

describe("prixImplique", () => {
  it("applique un multiple à un agrégat par action", () => {
    expect(prixImplique(5, 20)).toBe(100);
  });

  it("refuse un bénéfice négatif", () => {
    // Un PER applique a une perte donne un prix negatif, qui n'a aucun sens.
    expect(prixImplique(-2, 20)).toBeNull();
  });

  it("refuse un multiple nul ou négatif", () => {
    expect(prixImplique(5, 0)).toBeNull();
    expect(prixImplique(5, -12)).toBeNull();
  });

  it("refuse une entrée non numérique", () => {
    expect(prixImplique(null, 20)).toBeNull();
    expect(prixImplique(5, undefined)).toBeNull();
  });
});

describe("prixParRendement", () => {
  it("calcule le prix qui ramène le rendement à sa cible", () => {
    // 3 € de dividende à 4 % de rendement → 75 €.
    expect(prixParRendement(3, 4)).toBe(75);
  });

  it("refuse un dividende ou un rendement nul", () => {
    expect(prixParRendement(0, 4)).toBeNull();
    expect(prixParRendement(3, 0)).toBeNull();
  });
});

describe("fourchetteValorisation", () => {
  const base = {
    cours: 100,
    per: 20, // BPA déduit = 5
    perMoyenHistorique: 16,
    perAttendu: 18, // BPA attendu = 5.56
    rendementPct: 3,
    rendementMoyenPct: 4,
    dividendeParAction: 3,
    consensusAnalystes: 118,
  };

  it("calcule les trois méthodes", () => {
    const f = fourchetteValorisation(base);
    expect(f.exploitable).toBe(true);
    expect(f.methodes).toHaveLength(3);
    // PER historique : 5 × 16 = 80
    expect(f.methodes.find((m) => m.cle === "perHistorique").prix).toBe(80);
    // Rendement : 3 / 4 % = 75
    expect(f.methodes.find((m) => m.cle === "rendement").prix).toBe(75);
  });

  it("exprime l'écart au cours en pourcentage", () => {
    const f = fourchetteValorisation(base);
    // 80 contre 100 → -20 %.
    expect(f.methodes.find((m) => m.cle === "perHistorique").ecartPct).toBe(-20);
  });

  it("borne la fourchette sans fusionner les méthodes", () => {
    // Un titre dont les methodes donnent 75 et 88 n'a pas un juste prix a
    // 81,50 : la dispersion est l'information.
    const f = fourchetteValorisation(base);
    expect(f.bas).toBe(75);
    expect(f.haut).toBeGreaterThan(f.bas);
    expect(f.dispersionPct).toBeGreaterThan(0);
  });

  it("sépare le consensus des méthodes de calcul", () => {
    // L'avis d'un groupe n'est pas une valorisation : il ne doit pas entrer
    // dans la fourchette.
    const f = fourchetteValorisation(base);
    expect(f.consensus.prix).toBe(118);
    expect(f.consensus.ecartPct).toBe(18);
    expect(f.methodes.some((m) => m.prix === 118)).toBe(false);
  });

  it("marque le bénéfice attendu comme une prévision", () => {
    const f = fourchetteValorisation(base);
    expect(f.methodes.find((m) => m.cle === "perAttendu").fiabilite).toBe("prevision");
    expect(f.methodes.find((m) => m.cle === "perHistorique").fiabilite).toBe("mesuree");
  });

  it("se déclare inexploitable sur un titre sans fondamentaux", () => {
    // Cas d'un ETF ou d'une société en perte : mieux vaut le dire que de
    // laisser croire à un calcul.
    const f = fourchetteValorisation({ cours: 50 });
    expect(f.exploitable).toBe(false);
    expect(f.methodes).toEqual([]);
    expect(f.bas).toBeNull();
  });

  it("ignore une société en perte plutôt que de produire un prix négatif", () => {
    const f = fourchetteValorisation({ cours: 100, per: -8, perMoyenHistorique: 16 });
    expect(f.methodes.some((m) => m.cle === "perHistorique")).toBe(false);
  });

  it("ne lève pas sans aucune donnée", () => {
    const f = fourchetteValorisation();
    expect(f.exploitable).toBe(false);
    expect(f.consensus).toBeNull();
  });
});

describe("repli quand aucun PER historique n'est disponible", () => {
  // C'est le cas GENERAL dans l'application : les ratios historiques portent
  // sur les comptes (marges, ROE, dette), pas sur le cours — aucun PER passe
  // n'y figure.
  const sansHistorique = {
    cours: 100,
    per: 20, // BPA = 5
    perAttendu: 16, // BPA attendu = 6.25
    perMoyenHistorique: null,
    rendementMoyenPct: null,
  };

  it("applique au bénéfice attendu le multiple payé aujourd'hui", () => {
    const f = fourchetteValorisation(sansHistorique);
    const m = f.methodes.find((x) => x.cle === "perMaintenu");
    expect(m).toBeDefined();
    // 6.25 × 20 = 125
    expect(m.prix).toBe(125);
    expect(m.ecartPct).toBe(25);
  });

  it("annonce l'hypothèse comme une prévision", () => {
    const f = fourchetteValorisation(sansHistorique);
    expect(f.methodes.find((x) => x.cle === "perMaintenu").fiabilite).toBe("prevision");
  });

  it("n'utilise PAS le repli quand la moyenne historique existe", () => {
    // La comparaison du titre a lui-meme reste preferable des qu'elle est
    // possible : le repli ne doit pas la doubler.
    const f = fourchetteValorisation({ ...sansHistorique, perMoyenHistorique: 14 });
    expect(f.methodes.some((x) => x.cle === "perMaintenu")).toBe(false);
    expect(f.methodes.some((x) => x.cle === "perAttendu")).toBe(true);
  });

  it("reste inexploitable si même le PER courant manque", () => {
    expect(fourchetteValorisation({ cours: 100 }).exploitable).toBe(false);
  });
});
