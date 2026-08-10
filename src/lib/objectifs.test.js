import { describe, it, expect } from "vitest";
import { moisEntre, creerObjectif, trajectoireAttendue, evaluerObjectif, formaterDuree } from "./objectifs";

const OBJ = {
  id: "o1",
  libelle: "Apport",
  cible: 100000,
  echeance: "2030-01-01",
  departDate: "2026-01-01",
  departValeur: 20000,
};

describe("moisEntre", () => {
  it("compte les mois pleins", () => {
    expect(moisEntre("2026-01-01", "2026-07-01")).toBe(6);
    expect(moisEntre("2026-01-01", "2030-01-01")).toBe(48);
  });

  it("est négatif quand la cible est passée", () => {
    expect(moisEntre("2026-08-01", "2026-02-01")).toBe(-6);
  });

  it("tolère une date invalide", () => {
    expect(moisEntre("n'importe quoi", "2026-01-01")).toBe(0);
  });
});

describe("trajectoireAttendue", () => {
  it("part du point de départ", () => {
    expect(trajectoireAttendue(OBJ, "2026-01-01")).toBe(20000);
  });

  it("interpole linéairement à mi-parcours", () => {
    // 24 mois sur 48 → la moitié du chemin entre 20 000 et 100 000.
    expect(trajectoireAttendue(OBJ, "2028-01-01")).toBe(60000);
  });

  it("plafonne à la cible une fois l'échéance passée", () => {
    expect(trajectoireAttendue(OBJ, "2031-01-01")).toBe(100000);
  });
});

describe("evaluerObjectif", () => {
  it("détecte l'avance", () => {
    const e = evaluerObjectif(OBJ, { patrimoineActuel: 70000, aujourdhui: "2028-01-01" });
    expect(e.enAvance).toBe(true);
    expect(e.ecart).toBe(10000);
  });

  it("détecte le retard", () => {
    const e = evaluerObjectif(OBJ, { patrimoineActuel: 50000, aujourdhui: "2028-01-01" });
    expect(e.enAvance).toBe(false);
    expect(e.ecart).toBe(-10000);
  });

  it("signale un objectif atteint", () => {
    const e = evaluerObjectif(OBJ, { patrimoineActuel: 120000, aujourdhui: "2028-01-01" });
    expect(e.atteint).toBe(true);
    expect(e.progressionPct).toBe(100);
    expect(e.effortMensuelRequis).toBeNull();
  });

  it("calcule l'effort mensuel requis, rendement nul", () => {
    // 24 mois restants, il manque 40 000 € → 1 666,67 €/mois.
    const e = evaluerObjectif(OBJ, { patrimoineActuel: 60000, aujourdhui: "2028-01-01", tauxAnnuelPct: 0 });
    expect(e.effortMensuelRequis).toBeCloseTo(40000 / 24, 2);
  });

  it("réduit l'effort requis quand le rendement est positif", () => {
    const sansRendement = evaluerObjectif(OBJ, { patrimoineActuel: 60000, aujourdhui: "2028-01-01", tauxAnnuelPct: 0 });
    const avecRendement = evaluerObjectif(OBJ, { patrimoineActuel: 60000, aujourdhui: "2028-01-01", tauxAnnuelPct: 6 });
    expect(avecRendement.effortMensuelRequis).toBeLessThan(sansRendement.effortMensuelRequis);
  });

  it("estime le retard au rythme d'épargne courant", () => {
    const e = evaluerObjectif(OBJ, {
      patrimoineActuel: 60000,
      aujourdhui: "2028-01-01",
      epargneMensuelle: 500,
      tauxAnnuelPct: 0,
    });
    // 40 000 € à 500 €/mois = 80 mois, pour 24 mois disponibles.
    expect(e.moisJusquAtteinte).toBe(80);
    expect(e.retardEstimeMois).toBe(56);
  });

  it("n'estime aucune date d'atteinte sans épargne ni rendement", () => {
    const e = evaluerObjectif(OBJ, { patrimoineActuel: 60000, aujourdhui: "2028-01-01", epargneMensuelle: 0 });
    expect(e.moisJusquAtteinte).toBeNull();
  });

  it("marque l'échéance dépassée", () => {
    const e = evaluerObjectif(OBJ, { patrimoineActuel: 60000, aujourdhui: "2031-01-01" });
    expect(e.echu).toBe(true);
  });
});

describe("creerObjectif", () => {
  it("fige le patrimoine de départ", () => {
    const o = creerObjectif({ id: "x", libelle: " Voyage ", cible: "5000", echeance: "2028-06-01", patrimoineActuel: 1234 });
    expect(o.departValeur).toBe(1234);
    expect(o.libelle).toBe("Voyage");
    expect(o.cible).toBe(5000);
  });

  it("refuse une cible négative", () => {
    expect(creerObjectif({ cible: -10 }).cible).toBe(0);
  });
});

describe("formaterDuree", () => {
  it("formate en années et mois", () => {
    expect(formaterDuree(38)).toBe("3 ans et 2 mois");
    expect(formaterDuree(24)).toBe("2 ans");
    expect(formaterDuree(7)).toBe("7 mois");
    expect(formaterDuree(0)).toBe("échu");
    expect(formaterDuree(null)).toBe("—");
  });
});
