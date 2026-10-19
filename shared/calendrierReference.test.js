import { describe, it, expect } from "vitest";
import {
  CALENDRIER_REFERENCE,
  evenementsReference,
  tickersCouverts,
  VERIFIE_LE,
} from "./calendrierReference.js";

describe("catalogue de référence", () => {
  it("ne contient que des entrées complètes et bien formées", () => {
    // Une date mal formée s'afficherait sans repère dans le calendrier, et
    // une entrée sans source serait invérifiable plus tard.
    for (const [ticker, fiche] of Object.entries(CALENDRIER_REFERENCE)) {
      expect(fiche.nom, `${ticker} sans nom`).toBeTruthy();
      expect(fiche.source, `${ticker} sans source`).toMatch(/^https:\/\//);
      expect(fiche.evenements.length, `${ticker} sans événement`).toBeGreaterThan(0);

      for (const e of fiche.evenements) {
        expect(e.date, `${ticker} : date mal formée`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(e.date)), `${ticker} : date impossible`).toBe(false);
        expect(e.label, `${ticker} : libellé manquant`).toBeTruthy();
        expect(
          ["Résultats", "Chiffre d'affaires", "Dividende", "Assemblée Générale", "Communication"],
          `${ticker} : type inconnu du calendrier`
        ).toContain(e.type);
      }
    }
  });

  it("porte une date de vérification", () => {
    expect(VERIFIE_LE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("couvre les valeurs nommées", () => {
    const couverts = tickersCouverts();
    expect(couverts).toEqual(expect.arrayContaining(["SU.PA", "VIE.PA", "DG.PA"]));
  });
});

describe("evenementsReference", () => {
  it("ne renvoie que les valeurs réellement suivies", () => {
    // Le catalogue peut grossir sans encombrer l'agenda de quelqu'un qui ne
    // détient aucune de ces valeurs.
    const out = evenementsReference(["SU.PA"]);
    expect(out.length).toBeGreaterThan(0);
    expect(new Set(out.map((e) => e.ticker))).toEqual(new Set(["SU.PA"]));
  });

  it("renvoie une liste vide quand rien n'est suivi", () => {
    expect(evenementsReference([])).toEqual([]);
    expect(evenementsReference(["ZZZZ.PA"])).toEqual([]);
  });

  it("compare les tickers sans tenir compte de la casse", () => {
    expect(evenementsReference(["su.pa"]).length).toBeGreaterThan(0);
  });

  it("marque chaque événement comme confirmé et sourcé", () => {
    const [e] = evenementsReference(["VIE.PA"]);
    expect(e.fournisseur).toBe("reference");
    // Relevée dans le communiqué de la société : un fait publié.
    expect(e.statut).toBe("confirme");
    expect(e.lien).toMatch(/^https:\/\//);
    expect(e.verifieLe).toBe(VERIFIE_LE);
  });

  it("accepte un catalogue injecté, pour pouvoir être testé isolément", () => {
    const faux = {
      "XX.PA": { nom: "Test", source: "https://exemple.fr", evenements: [{ date: "2027-01-01", type: "Résultats", label: "L" }] },
    };
    expect(evenementsReference(["XX.PA"], faux)).toHaveLength(1);
  });
});
