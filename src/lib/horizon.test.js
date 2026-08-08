import { describe, it, expect } from "vitest";
import {
  creerGenerateur,
  tirageNormal,
  simulerCredit,
  calculerTaeg,
  coutTotalPossession,
  coutOpportunite,
  estimerRendements,
  mesurerProfondeurMois,
  cholesky,
  percentile,
  projeterPatrimoine,
  comparerScenarios,
  impactObjectif,
  anneesJusqua,
  fiscaliteEnveloppe,
  RENDEMENTS_REFERENCE,
  CORRELATIONS_REFERENCE,
  SEUIL_ESTIMATION_INDICATIVE,
} from "./horizon";

// Ces calculs pilotent des décisions financières réelles (mensualité, coût de
// possession, projection à dix ans) : chaque formule est vérifiée contre une
// valeur calculée à la main, jamais contre sa propre implémentation.

// ─── ALÉATOIRE REPRODUCTIBLE ─────────────────────────────────────────────────

describe("creerGenerateur", () => {
  it("produit la même séquence pour une même graine", () => {
    const a = creerGenerateur(42);
    const b = creerGenerateur(42);
    const suiteA = [a(), a(), a(), a(), a()];
    const suiteB = [b(), b(), b(), b(), b()];
    expect(suiteA).toEqual(suiteB);
  });

  it("produit des séquences différentes pour des graines différentes", () => {
    const a = creerGenerateur(1);
    const b = creerGenerateur(2);
    expect(a()).not.toBe(b());
  });

  it("reste dans [0, 1[", () => {
    const next = creerGenerateur(7);
    for (let i = 0; i < 500; i++) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("tirageNormal", () => {
  it("a une moyenne proche de 0 et un écart-type proche de 1", () => {
    const next = creerGenerateur(2026);
    const echantillon = Array.from({ length: 20000 }, () => tirageNormal(next));
    const moyenne = echantillon.reduce((s, v) => s + v, 0) / echantillon.length;
    const ecartType = Math.sqrt(
      echantillon.reduce((s, v) => s + (v - moyenne) ** 2, 0) / echantillon.length
    );
    expect(moyenne).toBeCloseTo(0, 1);
    expect(ecartType).toBeCloseTo(1, 1);
  });
});

// ─── 3.1 CRÉDIT ──────────────────────────────────────────────────────────────

describe("simulerCredit", () => {
  // Calcul manuel : C = 28 000, r = 4,2 %/12 = 0,0035, n = 60.
  // (1,0035)^60 = 1,233234 → (1,0035)^-60 = 0,810876
  // mensualité = 28 000 × 0,0035 / (1 − 0,810876) = 98 / 0,189124 = 518,18 €
  it("calcule la mensualité d'un prêt amortissable", () => {
    const r = simulerCredit({ montant: 28000, tauxAnnuel: 4.2, dureeMois: 60 });
    expect(r.mensualite).toBeCloseTo(518.18, 1);
  });

  it("calcule le coût total du crédit", () => {
    // 518,18 × 60 = 31 090,8 → intérêts ≈ 3 090,8 €
    const r = simulerCredit({ montant: 28000, tauxAnnuel: 4.2, dureeMois: 60 });
    expect(r.totalInterets).toBeCloseTo(3091, -1);
    expect(r.montantTotalRembourse).toBeCloseTo(31091, -1);
  });

  it("gère un taux nul sans division par zéro", () => {
    const r = simulerCredit({ montant: 12000, tauxAnnuel: 0, dureeMois: 24 });
    expect(r.mensualite).toBe(500);
    expect(r.totalInterets).toBeCloseTo(0, 6);
  });

  it("solde exactement le capital à la dernière échéance", () => {
    const r = simulerCredit({ montant: 28000, tauxAnnuel: 4.2, dureeMois: 60 });
    const dernier = r.tableauAmortissement[r.tableauAmortissement.length - 1];
    expect(dernier.restantDu).toBeCloseTo(0, 6);
    const capitalRembourse = r.tableauAmortissement.reduce((s, l) => s + l.capital, 0);
    expect(capitalRembourse).toBeCloseTo(28000, 6);
  });

  it("produit une échéance par mois", () => {
    const r = simulerCredit({ montant: 10000, tauxAnnuel: 3, dureeMois: 36 });
    expect(r.tableauAmortissement).toHaveLength(36);
  });

  it("répercute l'assurance sur la mensualité et le coût total", () => {
    const sans = simulerCredit({ montant: 28000, tauxAnnuel: 4.2, dureeMois: 60 });
    const avec = simulerCredit({
      montant: 28000,
      tauxAnnuel: 4.2,
      dureeMois: 60,
      assuranceMensuelle: 15,
    });
    expect(avec.mensualite).toBeCloseTo(sans.mensualite + 15, 6);
    expect(avec.coutAssurance).toBe(900); // 15 × 60
    expect(avec.coutTotalCredit).toBeCloseTo(sans.coutTotalCredit + 900, 6);
  });

  it("laisse le capital amorti inchangé quand seule l'assurance varie", () => {
    const avec = simulerCredit({
      montant: 28000,
      tauxAnnuel: 4.2,
      dureeMois: 60,
      assuranceMensuelle: 15,
    });
    expect(avec.totalInterets).toBeCloseTo(3091, -1);
  });
});

describe("calculerTaeg", () => {
  it("retrouve le taux effectif d'un prêt sans frais", () => {
    // Sans frais ni assurance, le TAEG est le taux nominal capitalisé :
    // (1 + 0,0035)^12 − 1 = 4,28 %
    const { mensualite } = simulerCredit({ montant: 28000, tauxAnnuel: 4.2, dureeMois: 60 });
    const taeg = calculerTaeg({ montant: 28000, fraisDossier: 0, mensualite, dureeMois: 60 });
    expect(taeg).toBeCloseTo(4.28, 1);
  });

  it("augmente avec les frais de dossier", () => {
    const { mensualite } = simulerCredit({ montant: 28000, tauxAnnuel: 4.2, dureeMois: 60 });
    const sans = calculerTaeg({ montant: 28000, fraisDossier: 0, mensualite, dureeMois: 60 });
    const avec = calculerTaeg({ montant: 28000, fraisDossier: 500, mensualite, dureeMois: 60 });
    expect(avec).toBeGreaterThan(sans);
  });

  it("renvoie 0 sur des entrées dégénérées", () => {
    expect(calculerTaeg({ montant: 0, fraisDossier: 0, mensualite: 0, dureeMois: 0 })).toBe(0);
  });
});

// ─── 3.2 COÛT TOTAL DE POSSESSION ────────────────────────────────────────────

describe("coutTotalPossession", () => {
  // Calcul manuel, voiture 28 000 € sur 5 ans :
  // charges = (2,5 + 2 + 4 + 0,3) % × 28 000 = 2 464 €/an → 12 320 € sur 5 ans
  // valeur résiduelle = 28 000 × 0,85^5 = 28 000 × 0,4437053 = 12 423,75 €
  // perte de valeur = 15 576,25 € → coût total = 27 896,25 €
  it("chiffre le coût réel d'un véhicule sur 5 ans", () => {
    const r = coutTotalPossession({ prixAchat: 28000, horizonAnnees: 5, categorie: "voiture" });
    expect(r.chargesTotales).toBeCloseTo(12320, 2);
    expect(r.valeurResiduelle).toBeCloseTo(12423.75, 2);
    expect(r.perteValeur).toBeCloseTo(15576.25, 2);
    expect(r.coutTotal).toBeCloseTo(27896.25, 2);
  });

  it("dérive les moyennes annuelle et mensuelle du coût total", () => {
    const r = coutTotalPossession({ prixAchat: 28000, horizonAnnees: 5, categorie: "voiture" });
    expect(r.coutAnnuelMoyen).toBeCloseTo(r.coutTotal / 5, 6);
    expect(r.coutMensuelMoyen).toBeCloseTo(r.coutTotal / 60, 6);
  });

  it("signale chaque valeur de référence appliquée", () => {
    const r = coutTotalPossession({ prixAchat: 28000, horizonAnnees: 5, categorie: "voiture" });
    // Aucune hypothèse ne doit être appliquée en silence.
    expect(r.hypothesesAppliquees.length).toBeGreaterThanOrEqual(5);
    expect(r.hypothesesAppliquees.every((h) => h.origine === "reference")).toBe(true);
    expect(r.hypothesesAppliquees.map((h) => h.cle)).toContain("decoteAnnuellePct");
  });

  it("n'inscrit pas d'hypothèse pour un poste fourni par l'utilisateur", () => {
    const r = coutTotalPossession({
      prixAchat: 28000,
      horizonAnnees: 5,
      categorie: "voiture",
      overrides: { assuranceAnnuelle: 900 },
    });
    expect(r.hypothesesAppliquees.map((h) => h.cle)).not.toContain("assuranceAnnuelle");
    // 900 au lieu de 700 → 200 €/an de plus, soit 1 000 € sur 5 ans.
    const ref = coutTotalPossession({ prixAchat: 28000, horizonAnnees: 5, categorie: "voiture" });
    expect(r.coutTotal).toBeCloseTo(ref.coutTotal + 1000, 2);
  });

  it("traite une décote négative comme une appréciation", () => {
    const r = coutTotalPossession({ prixAchat: 200000, horizonAnnees: 10, categorie: "immobilier" });
    expect(r.valeurResiduelle).toBeGreaterThan(200000);
    expect(r.perteValeur).toBeLessThan(0);
  });

  it("répartit le coût total à 100 % dans la ventilation", () => {
    const r = coutTotalPossession({ prixAchat: 28000, horizonAnnees: 5, categorie: "voiture" });
    const somme = r.ventilation.reduce((s, p) => s + p.partPct, 0);
    expect(somme).toBeCloseTo(100, 6);
  });

  it("retombe sur la catégorie générique si elle est inconnue", () => {
    const r = coutTotalPossession({ prixAchat: 1000, horizonAnnees: 1, categorie: "inexistante" });
    expect(r.coutTotal).toBeGreaterThan(0);
  });
});

// ─── 3.3 COÛT D'OPPORTUNITÉ ──────────────────────────────────────────────────

describe("coutOpportunite", () => {
  // 28 000 € à 8 % sur 10 ans : 28 000 × 1,08^10 = 28 000 × 2,158925 = 60 449,9 €
  it("capitalise le montant au rendement demandé", () => {
    const r = coutOpportunite({ montant: 28000, rendementAnnuelPct: 8, horizonAnnees: 10 });
    expect(r.valeurFutureNominale).toBeCloseTo(60449.9, 0);
    expect(r.manqueAGagner).toBeCloseTo(32449.9, 0);
  });

  it("déflate la valeur réelle par l'inflation", () => {
    // 28 000 × 1,08^10 = 60 449,8999 ; 1,02^10 = 1,21899442
    // 60 449,8999 / 1,21899442 = 49 589,97 €
    const r = coutOpportunite({ montant: 28000, rendementAnnuelPct: 8, horizonAnnees: 10 });
    expect(r.valeurFutureReelle).toBeCloseTo(49589.97, 1);
  });

  it("distingue une inflation par défaut d'une inflation choisie", () => {
    const defaut = coutOpportunite({ montant: 1000, rendementAnnuelPct: 5, horizonAnnees: 5 });
    const choisie = coutOpportunite({
      montant: 1000,
      rendementAnnuelPct: 5,
      horizonAnnees: 5,
      inflationPct: 3,
    });
    expect(defaut.hypothesesAppliquees[0].origine).toBe("defaut");
    expect(choisie.hypothesesAppliquees[0].origine).toBe("utilisateur");
  });

  it("ne fait rien sur un horizon nul", () => {
    const r = coutOpportunite({ montant: 5000, rendementAnnuelPct: 8, horizonAnnees: 0 });
    expect(r.valeurFutureNominale).toBe(5000);
    expect(r.manqueAGagner).toBe(0);
  });
});

// ─── 3.10 ESTIMATION DES RENDEMENTS ──────────────────────────────────────────

describe("mesurerProfondeurMois", () => {
  it("mesure l'écart entre le premier et le dernier relevé", () => {
    const points = [{ date: "2026-01-01", valeur: 1 }, { date: "2027-01-01", valeur: 1 }];
    expect(mesurerProfondeurMois(points)).toBe(11); // 365 / 30,44 = 11,99
  });

  it("renvoie 0 sur un historique trop court ou absent", () => {
    expect(mesurerProfondeurMois([])).toBe(0);
    expect(mesurerProfondeurMois([{ date: "2026-01-01", valeur: 1 }])).toBe(0);
    expect(mesurerProfondeurMois(null)).toBe(0);
  });
});

describe("estimerRendements", () => {
  it("refuse d'estimer sous 24 mois et bascule sur la table de référence", () => {
    // Situation réelle d'août 2026 : ~1 mois de relevés.
    const historique = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      valeur: 100000 + i * 50,
    }));
    const r = estimerRendements(historique);
    expect(r.fiabilite).toBe("insuffisante");
    expect(r.source).toBe("reference");
    expect(r.rendements.actions.rendement).toBe(8);
    expect(r.avertissement).toContain("insuffisant");
  });

  it("qualifie d'indicative une estimation entre 24 et 60 mois", () => {
    const historique = construireHistorique("2023-01-01", 900, 0.0002);
    const r = estimerRendements(historique);
    expect(r.profondeurMois).toBeGreaterThanOrEqual(SEUIL_ESTIMATION_INDICATIVE);
    expect(r.fiabilite).toBe("indicative");
    expect(r.source).toBe("historique");
    expect(r.avertissement).toBeTruthy();
  });

  it("qualifie d'exploitable une estimation au-delà de 60 mois", () => {
    const historique = construireHistorique("2019-01-01", 2200, 0.0002);
    const r = estimerRendements(historique);
    expect(r.fiabilite).toBe("exploitable");
    expect(r.avertissement).toBeNull();
  });

  it("retrouve un rendement annualisé cohérent sur une croissance régulière", () => {
    // +0,03 % par séance sur 252 séances : (1,0003)^252 − 1 = 7,85 %
    const historique = construireHistorique("2019-01-01", 2200, 0.0003);
    const r = estimerRendements(historique);
    expect(r.rendements.global.rendement).toBeCloseTo(7.85, 0);
    // Croissance parfaitement régulière : volatilité quasi nulle.
    expect(r.rendements.global.volatilite).toBeCloseTo(0, 3);
  });

  it("ignore les relevés invalides", () => {
    const r = estimerRendements([
      { date: "2026-01-01", valeur: 0 },
      { date: "2026-02-01", valeur: null },
      { date: "2026-03-01", valeur: 1000 },
    ]);
    expect(r.fiabilite).toBe("insuffisante");
  });
});

/** Historique synthétique à croissance géométrique régulière. */
function construireHistorique(debut, nbJours, tauxQuotidien) {
  const base = new Date(debut).getTime();
  return Array.from({ length: nbJours }, (_, i) => ({
    date: new Date(base + i * 86400000).toISOString().slice(0, 10),
    valeur: 100000 * Math.pow(1 + tauxQuotidien, i),
  }));
}

// ─── OUTILS DE PROJECTION ────────────────────────────────────────────────────

describe("cholesky", () => {
  it("renvoie l'identité pour une matrice identité", () => {
    const L = cholesky([[1, 0], [0, 1]]);
    expect(L).toEqual([[1, 0], [0, 1]]);
  });

  it("décompose une corrélation 2×2", () => {
    // [[1, 0.5], [0.5, 1]] → L = [[1, 0], [0.5, sqrt(0.75)]]
    const L = cholesky([[1, 0.5], [0.5, 1]]);
    expect(L[0][0]).toBeCloseTo(1, 10);
    expect(L[1][0]).toBeCloseTo(0.5, 10);
    expect(L[1][1]).toBeCloseTo(Math.sqrt(0.75), 10);
  });

  it("vérifie L·Lᵀ = matrice d'origine", () => {
    const M = [
      [1, 0.2, 0.4],
      [0.2, 1, 0.2],
      [0.4, 0.2, 1],
    ];
    const L = cholesky(M);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const produit = L[i].reduce((s, v, k) => s + v * L[j][k], 0);
        expect(produit).toBeCloseTo(M[i][j], 10);
      }
    }
  });
});

describe("percentile", () => {
  it("trouve la médiane d'une série impaire", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it("interpole entre deux valeurs", () => {
    // rang = 0,10 × 4 = 0,4 → 1 + 0,4 × (2 − 1) = 1,4
    expect(percentile([1, 2, 3, 4, 5], 10)).toBeCloseTo(1.4, 10);
  });

  it("renvoie les bornes pour p0 et p100", () => {
    expect(percentile([1, 2, 3], 0)).toBe(1);
    expect(percentile([1, 2, 3], 100)).toBe(3);
  });

  it("renvoie 0 sur une série vide", () => {
    expect(percentile([], 50)).toBe(0);
  });
});

// ─── 3.4 PROJECTION MONTE-CARLO ──────────────────────────────────────────────

describe("projeterPatrimoine", () => {
  const allocationActions = { actions: 1 };

  it("retrouve la capitalisation déterministe à volatilité nulle", () => {
    // Sans aléa, 10 000 € à 8 % sur 10 ans = 10 000 × 1,08^10 = 21 589,25 €
    const r = projeterPatrimoine({
      patrimoineInitial: 10000,
      allocation: allocationActions,
      horizonAnnees: 10,
      tirages: 50,
      rendements: { actions: { rendement: 8, volatilite: 0, libelle: "Actions" } },
      correlations: { actions: { actions: 1 } },
    });
    expect(r.valeurFinale.p50).toBeCloseTo(21589.25, 0);
    expect(r.valeurFinale.p10).toBeCloseTo(r.valeurFinale.p90, 6);
  });

  it("intègre les versements mensuels", () => {
    // Rendement nul : 10 000 + 100 × 12 × 10 = 22 000 €
    const r = projeterPatrimoine({
      patrimoineInitial: 10000,
      versementMensuel: 100,
      allocation: allocationActions,
      horizonAnnees: 10,
      tirages: 20,
      rendements: { actions: { rendement: 0, volatilite: 0, libelle: "Actions" } },
      correlations: { actions: { actions: 1 } },
    });
    expect(r.valeurFinale.p50).toBeCloseTo(22000, 6);
  });

  it("est reproductible à graine identique", () => {
    const params = {
      patrimoineInitial: 50000,
      allocation: { actions: 0.7, obligations: 0.3 },
      horizonAnnees: 10,
      tirages: 200,
      graine: 123,
    };
    const a = projeterPatrimoine(params);
    const b = projeterPatrimoine(params);
    expect(a.valeurFinale.p50).toBe(b.valeurFinale.p50);
    expect(a.valeurFinale.p10).toBe(b.valeurFinale.p10);
  });

  it("produit un résultat différent à graine différente", () => {
    const base = {
      patrimoineInitial: 50000,
      allocation: allocationActions,
      horizonAnnees: 10,
      tirages: 200,
    };
    const a = projeterPatrimoine({ ...base, graine: 1 });
    const b = projeterPatrimoine({ ...base, graine: 2 });
    expect(a.valeurFinale.p50).not.toBe(b.valeurFinale.p50);
  });

  it("ordonne les percentiles", () => {
    const r = projeterPatrimoine({
      patrimoineInitial: 50000,
      allocation: allocationActions,
      horizonAnnees: 10,
      tirages: 500,
    });
    const f = r.valeurFinale;
    expect(f.p10).toBeLessThanOrEqual(f.p25);
    expect(f.p25).toBeLessThanOrEqual(f.p50);
    expect(f.p50).toBeLessThanOrEqual(f.p75);
    expect(f.p75).toBeLessThanOrEqual(f.p90);
  });

  it("ouvre la fourchette quand la volatilité augmente", () => {
    const base = {
      patrimoineInitial: 50000,
      allocation: allocationActions,
      horizonAnnees: 10,
      tirages: 800,
      graine: 7,
      correlations: { actions: { actions: 1 } },
    };
    const calme = projeterPatrimoine({
      ...base,
      rendements: { actions: { rendement: 8, volatilite: 5, libelle: "Actions" } },
    });
    const agitee = projeterPatrimoine({
      ...base,
      rendements: { actions: { rendement: 8, volatilite: 25, libelle: "Actions" } },
    });
    const etendue = (r) => r.valeurFinale.p90 - r.valeurFinale.p10;
    expect(etendue(agitee)).toBeGreaterThan(etendue(calme));
  });

  it("retrouve en moyenne le rendement arithmétique visé", () => {
    // Le paramétrage log-normal doit préserver la moyenne, pas la décaler.
    const r = projeterPatrimoine({
      patrimoineInitial: 10000,
      allocation: allocationActions,
      horizonAnnees: 1,
      tirages: 20000,
      graine: 99,
      rendements: { actions: { rendement: 8, volatilite: 15, libelle: "Actions" } },
      correlations: { actions: { actions: 1 } },
    });
    // Médiane d'une log-normale < moyenne : on vérifie l'ordre de grandeur.
    expect(r.valeurFinale.p50).toBeGreaterThan(10400);
    expect(r.valeurFinale.p50).toBeLessThan(11200);
  });

  it("expose la vue réelle déflatée de l'inflation", () => {
    const r = projeterPatrimoine({
      patrimoineInitial: 10000,
      allocation: allocationActions,
      horizonAnnees: 10,
      tirages: 20,
      inflationPct: 2,
      rendements: { actions: { rendement: 8, volatilite: 0, libelle: "Actions" } },
      correlations: { actions: { actions: 1 } },
    });
    // 21 589,25 / 1,02^10 = 17 710,6 €
    expect(r.valeurFinale.reel.p50).toBeCloseTo(17710.6, 0);
    expect(r.valeurFinale.reel.p50).toBeLessThan(r.valeurFinale.p50);
  });

  it("commence la trajectoire au patrimoine initial", () => {
    const r = projeterPatrimoine({
      patrimoineInitial: 33000,
      allocation: allocationActions,
      horizonAnnees: 5,
      tirages: 10,
    });
    expect(r.percentiles[0].p50).toBe(33000);
    expect(r.percentiles).toHaveLength(6); // année 0 incluse
  });

  it("calcule la probabilité d'atteindre un objectif", () => {
    const r = projeterPatrimoine({
      patrimoineInitial: 50000,
      allocation: allocationActions,
      horizonAnnees: 10,
      tirages: 500,
      graine: 5,
      objectifMontant: 80000,
    });
    expect(r.probabiliteObjectif).toBeGreaterThan(0);
    expect(r.probabiliteObjectif).toBeLessThanOrEqual(100);
  });

  it("laisse la probabilité à null sans objectif", () => {
    const r = projeterPatrimoine({
      patrimoineInitial: 50000,
      allocation: allocationActions,
      horizonAnnees: 5,
      tirages: 10,
    });
    expect(r.probabiliteObjectif).toBeNull();
  });

  it("normalise une allocation dont la somme n'est pas 1", () => {
    const normalisee = projeterPatrimoine({
      patrimoineInitial: 10000,
      allocation: { actions: 0.5, obligations: 0.5 },
      horizonAnnees: 5,
      tirages: 100,
      graine: 3,
    });
    const brute = projeterPatrimoine({
      patrimoineInitial: 10000,
      allocation: { actions: 50, obligations: 50 },
      horizonAnnees: 5,
      tirages: 100,
      graine: 3,
    });
    expect(brute.valeurFinale.p50).toBeCloseTo(normalisee.valeurFinale.p50, 6);
  });

  it("documente les rendements employés", () => {
    const r = projeterPatrimoine({
      patrimoineInitial: 10000,
      allocation: { actions: 1 },
      horizonAnnees: 5,
      tirages: 10,
    });
    expect(r.hypothesesAppliquees[0].origine).toBe("reference");
    expect(r.hypothesesAppliquees[0].valeur).toBe(8);
  });
});

// ─── 3.5 COMPARAISON DE SCÉNARIOS ────────────────────────────────────────────

describe("comparerScenarios", () => {
  const faireScenario = (nom, mediane, reference = false) => ({
    nom,
    reference,
    projection: { valeurFinale: { p50: mediane, p10: mediane * 0.7, p90: mediane * 1.4, reel: { p50: mediane * 0.8 } } },
  });

  it("prend le premier scénario comme référence par défaut", () => {
    const r = comparerScenarios([faireScenario("A", 100000), faireScenario("B", 90000)]);
    expect(r.reference).toBe("A");
    expect(r.tableau[0].estReference).toBe(true);
  });

  it("respecte une référence explicite", () => {
    const r = comparerScenarios([faireScenario("A", 100000), faireScenario("B", 90000, true)]);
    expect(r.reference).toBe("B");
  });

  it("chiffre les écarts par rapport à la référence", () => {
    const r = comparerScenarios([faireScenario("A", 100000), faireScenario("B", 90000)]);
    expect(r.ecarts).toHaveLength(1);
    expect(r.ecarts[0].ecartAbsolu).toBe(-10000);
    expect(r.ecarts[0].ecartRelatifPct).toBeCloseTo(-10, 6);
  });

  it("gère une liste vide", () => {
    const r = comparerScenarios([]);
    expect(r.tableau).toEqual([]);
    expect(r.reference).toBeNull();
  });
});

// ─── 3.6 IMPACT SUR UN OBJECTIF ──────────────────────────────────────────────

describe("anneesJusqua", () => {
  it("mesure l'écart en années décimales", () => {
    const aujourdhui = new Date("2026-08-08");
    expect(anneesJusqua("2032-08-08", aujourdhui)).toBeCloseTo(6, 1);
  });

  it("ne renvoie jamais de valeur négative", () => {
    expect(anneesJusqua("2020-01-01", new Date("2026-08-08"))).toBe(0);
  });

  it("renvoie 0 sur une date absente ou invalide", () => {
    expect(anneesJusqua(null)).toBe(0);
    expect(anneesJusqua("pas une date")).toBe(0);
  });
});

describe("impactObjectif", () => {
  /** Projection linéaire synthétique : +10 000 €/an à partir de `depart`. */
  const projectionLineaire = (depart, pas, annees) => ({
    percentiles: Array.from({ length: annees + 1 }, (_, i) => ({
      annee: i,
      p50: depart + pas * i,
      reel: { p50: depart + pas * i },
    })),
  });

  it("mesure le retard induit par une dépense", () => {
    // Avant : atteint 100 000 € à l'année 5. Après : à l'année 7 (départ plus bas).
    const avant = projectionLineaire(50000, 10000, 10);
    const apres = projectionLineaire(30000, 10000, 10);
    const r = impactObjectif({
      objectif: { nom: "Apport immo", montantCible: 100000, dateCible: "2036-08-08" },
      scenarioAvant: avant,
      scenarioApres: apres,
    });
    expect(r.moisAvant).toBeCloseTo(60, 0); // 5 ans
    expect(r.moisApres).toBeCloseTo(84, 0); // 7 ans
    expect(r.retardMois).toBeCloseTo(24, 0);
  });

  it("chiffre l'écart de patrimoine à la date cible", () => {
    const avant = projectionLineaire(50000, 10000, 10);
    const apres = projectionLineaire(30000, 10000, 10);
    const r = impactObjectif({
      objectif: { nom: "Apport immo", montantCible: 100000, dateCible: "2032-08-08" },
      scenarioAvant: avant,
      scenarioApres: apres,
    });
    expect(r.ecartMontant).toBeCloseTo(-20000, 0);
    expect(r.effortMensuelCorrectif).toBeGreaterThan(0);
  });

  it("signale un objectif jamais atteint sur l'horizon", () => {
    const r = impactObjectif({
      objectif: { nom: "Trop haut", montantCible: 10000000, dateCible: "2032-08-08" },
      scenarioAvant: projectionLineaire(50000, 10000, 10),
      scenarioApres: projectionLineaire(30000, 10000, 10),
    });
    expect(r.atteintAvant).toBe(false);
    expect(r.moisApres).toBeNull();
    expect(r.retardMois).toBeNull();
  });

  it("n'exige aucun effort correctif si le scénario améliore la situation", () => {
    const r = impactObjectif({
      objectif: { nom: "Apport", montantCible: 100000, dateCible: "2032-08-08" },
      scenarioAvant: projectionLineaire(30000, 10000, 10),
      scenarioApres: projectionLineaire(50000, 10000, 10),
    });
    expect(r.ecartMontant).toBeGreaterThan(0);
    expect(r.effortMensuelCorrectif).toBe(0);
  });
});

// ─── 3.7 FISCALITÉ ───────────────────────────────────────────────────────────

describe("fiscaliteEnveloppe", () => {
  it("exonère d'impôt un PEA de plus de 5 ans mais pas de prélèvements sociaux", () => {
    const r = fiscaliteEnveloppe({
      enveloppe: "PEA",
      montant: 30000,
      plusValue: 10000,
      dureeDetentionAnnees: 7,
    });
    expect(r.impotDu).toBe(0);
    expect(r.prelevementsSociaux).toBeCloseTo(1720, 6); // 10 000 × 17,2 %
    expect(r.totalPrelevements).toBeCloseTo(1720, 6);
  });

  it("applique le PFU à un PEA de moins de 5 ans", () => {
    const r = fiscaliteEnveloppe({
      enveloppe: "PEA",
      montant: 30000,
      plusValue: 10000,
      dureeDetentionAnnees: 3,
    });
    expect(r.impotDu).toBeCloseTo(1280, 6);
    expect(r.totalPrelevements).toBeCloseTo(3000, 6); // 30 % au total
  });

  it("applique 30 % au compte-titres ordinaire", () => {
    const r = fiscaliteEnveloppe({ enveloppe: "CTO", montant: 30000, plusValue: 10000 });
    expect(r.totalPrelevements).toBeCloseTo(3000, 6);
    expect(r.tauxEffectifPct).toBeCloseTo(30, 6);
  });

  it("applique l'abattement d'assurance-vie après 8 ans", () => {
    // 10 000 − 4 600 = 5 400 imposables à 7,5 % = 405 €
    const r = fiscaliteEnveloppe({
      enveloppe: "AV",
      montant: 30000,
      plusValue: 10000,
      dureeDetentionAnnees: 9,
    });
    expect(r.impotDu).toBeCloseTo(405, 6);
  });

  it("double l'abattement d'assurance-vie pour un couple", () => {
    // 10 000 − 9 200 = 800 imposables à 7,5 % = 60 €
    const r = fiscaliteEnveloppe({
      enveloppe: "AV",
      montant: 30000,
      plusValue: 10000,
      dureeDetentionAnnees: 9,
      couple: true,
    });
    expect(r.impotDu).toBeCloseTo(60, 6);
  });

  it("calcule le net après impôt", () => {
    const r = fiscaliteEnveloppe({ enveloppe: "CTO", montant: 30000, plusValue: 10000 });
    expect(r.netApresImpot).toBeCloseTo(27000, 6);
  });

  it("expose sa source pour affichage", () => {
    const r = fiscaliteEnveloppe({ enveloppe: "CTO", montant: 1000, plusValue: 100 });
    expect(r.source.url).toContain("impots.gouv.fr");
    expect(r.source.aVerifier).toBe(true);
  });

  it("ne renvoie aucun prélèvement sans plus-value", () => {
    const r = fiscaliteEnveloppe({ enveloppe: "CTO", montant: 10000, plusValue: 0 });
    expect(r.totalPrelevements).toBe(0);
    expect(r.tauxEffectifPct).toBe(0);
  });
});

// ─── TABLES DE RÉFÉRENCE ─────────────────────────────────────────────────────

describe("tables de référence", () => {
  it("fixe les actions à 8 % / σ 15 %", () => {
    expect(RENDEMENTS_REFERENCE.actions.rendement).toBe(8);
    expect(RENDEMENTS_REFERENCE.actions.volatilite).toBe(15);
  });

  it("couvre les quatre classes d'actifs retenues", () => {
    expect(Object.keys(RENDEMENTS_REFERENCE).sort()).toEqual([
      "actions",
      "immobilier",
      "monetaire",
      "obligations",
    ]);
  });

  it("expose une matrice de corrélation symétrique à diagonale unitaire", () => {
    const classes = Object.keys(CORRELATIONS_REFERENCE);
    for (const a of classes) {
      expect(CORRELATIONS_REFERENCE[a][a]).toBe(1);
      for (const b of classes) {
        expect(CORRELATIONS_REFERENCE[a][b]).toBe(CORRELATIONS_REFERENCE[b][a]);
      }
    }
  });

  it("produit une matrice de corrélation décomposable (semi-définie positive)", () => {
    const classes = Object.keys(CORRELATIONS_REFERENCE);
    const M = classes.map((a) => classes.map((b) => CORRELATIONS_REFERENCE[a][b]));
    const L = cholesky(M);
    // Une diagonale nulle trahirait une matrice non décomposable.
    for (let i = 0; i < L.length; i++) expect(L[i][i]).toBeGreaterThan(0);
  });
});
