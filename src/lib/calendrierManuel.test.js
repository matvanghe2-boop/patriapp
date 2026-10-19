import { describe, it, expect } from "vitest";
import {
  creerDateManuelle,
  evenementsManuels,
  retirerDateManuelle,
  TYPES_MANUELS,
} from "./calendrierManuel";

describe("creerDateManuelle", () => {
  it("normalise une saisie correcte", () => {
    const d = creerDateManuelle({
      ticker: " su.pa ",
      type: "Résultats",
      date: "2026-10-30",
      label: "CA du 3e trimestre",
      source: "https://www.se.com/investors",
    });
    expect(d).toMatchObject({
      ticker: "SU.PA",
      type: "Résultats",
      date: "2026-10-30",
      label: "CA du 3e trimestre",
      source: "https://www.se.com/investors",
    });
    expect(d.id).toBeTruthy();
  });

  it("retombe sur le type comme libellé quand il n'y en a pas", () => {
    expect(creerDateManuelle({ ticker: "VIE.PA", type: "Dividende", date: "2026-12-01" }).label)
      .toBe("Dividende");
  });

  it("refuse une date mal formée plutôt que de l'enregistrer", () => {
    // Une ligne sans date exploitable s'afficherait sans repère dans le
    // calendrier : mieux vaut refuser la saisie.
    expect(creerDateManuelle({ ticker: "SU.PA", type: "Résultats", date: "30/10/2026" })).toBeNull();
    expect(creerDateManuelle({ ticker: "SU.PA", type: "Résultats", date: "" })).toBeNull();
  });

  it("refuse un titre vide ou un type inconnu", () => {
    expect(creerDateManuelle({ ticker: "", type: "Résultats", date: "2026-10-30" })).toBeNull();
    expect(creerDateManuelle({ ticker: "SU.PA", type: "Rumeur", date: "2026-10-30" })).toBeNull();
  });

  it("propose les types réellement affichés par le calendrier", () => {
    expect(TYPES_MANUELS).toContain("Assemblée Générale");
    expect(TYPES_MANUELS).toContain("Dividende");
  });
});

describe("evenementsManuels", () => {
  const saisies = [
    { id: "1", ticker: "SU.PA", type: "Résultats", date: "2026-10-30", label: "CA T3" },
    { id: "2", ticker: "XXX.PA", type: "Dividende", date: "2026-11-05", label: "Ex-div" },
  ];

  it("prime sur les sources automatiques et se déclare confirmée", () => {
    const [e] = evenementsManuels(saisies, ["SU.PA"]);
    expect(e.fournisseur).toBe("manuel");
    // Relevée sur l'agenda officiel : c'est un fait, pas une extrapolation.
    expect(e.statut).toBe("confirme");
  });

  it("écarte les titres qui ne sont plus suivis", () => {
    // Une ligne vendue ne doit pas continuer à peupler l'agenda.
    const out = evenementsManuels(saisies, ["SU.PA"]);
    expect(out).toHaveLength(1);
    expect(out[0].ticker).toBe("SU.PA");
  });

  it("compare les tickers sans tenir compte de la casse", () => {
    expect(evenementsManuels(saisies, ["su.pa"])).toHaveLength(1);
  });

  it("reporte le lien vers la source", () => {
    const avecSource = [{ ...saisies[0], source: "https://exemple.fr/agenda" }];
    expect(evenementsManuels(avecSource, ["SU.PA"])[0].lien).toBe("https://exemple.fr/agenda");
  });
});

describe("retirerDateManuelle", () => {
  it("ne retire que la saisie visée", () => {
    const liste = [{ id: "a" }, { id: "b" }];
    expect(retirerDateManuelle(liste, "a")).toEqual([{ id: "b" }]);
  });
});
