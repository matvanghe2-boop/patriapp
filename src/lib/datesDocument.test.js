import { describe, it, expect } from "vitest";
import { suggererDates } from "./datesDocument";

const AUJOURDHUI = "2026-11-02";

describe("suggererDates", () => {
  it("distingue l'expiration de la délivrance grâce au mot qui précède", () => {
    const texte = "PASSEPORT — Délivré le 12/03/2021 à Lyon. Date d'expiration : 11.03.2031";
    const { echeances, documents } = suggererDates(texte, { aujourdhui: AUJOURDHUI });
    expect(echeances[0]).toMatchObject({ date: "2031-03-11", indice: true });
    expect(echeances[0].contexte).toContain("Date d'expiration : 11.03.2031");
    expect(documents[0]).toMatchObject({ date: "2021-03-12", indice: true });
  });

  it("garde l'indice le plus proche quand deux mots précèdent la date", () => {
    const { echeances, documents } = suggererDates("délivrée le 01/02/2020, valable jusqu'au 01/02/2030", {
      aujourdhui: AUJOURDHUI,
    });
    expect(echeances.map((s) => s.date)).toEqual(["2030-02-01"]);
    expect(documents.map((s) => s.date)).toEqual(["2020-02-01"]);
  });

  it("lit les dates en toutes lettres, avec ou sans accent ni abréviation", () => {
    const texte = "Facture du 1er septembre 2026. Garantie jusqu'au 1 sept. 2028. Échéance : 15 février 2027";
    const { echeances, documents } = suggererDates(texte, { aujourdhui: AUJOURDHUI });
    expect(documents[0].date).toBe("2026-09-01");
    expect(echeances.map((s) => s.date)).toEqual(["2027-02-15", "2028-09-01"]);
  });

  it("lit le format ISO et les années sur deux chiffres", () => {
    const { echeances } = suggererDates("valid until 2029-06-30 ; fin de validité 30/06/29", {
      aujourdhui: AUJOURDHUI,
    });
    expect(echeances.map((s) => s.date)).toEqual(["2029-06-30"]);
  });

  it("sans indice, range une date future en échéance et une date passée en date du document", () => {
    const { echeances, documents } = suggererDates("Réf. 04/05/2025 — 04/05/2030", { aujourdhui: AUJOURDHUI });
    expect(echeances).toEqual([expect.objectContaining({ date: "2030-05-04", indice: false })]);
    expect(documents).toEqual([expect.objectContaining({ date: "2025-05-04", indice: false })]);
  });

  it("écarte ce qui n'est pas une date réelle", () => {
    const { echeances, documents } = suggererDates("31/02/2027, 12/13/2027, 3.14.15, n° 1234-56-78", {
      aujourdhui: AUJOURDHUI,
    });
    expect([...echeances, ...documents]).toEqual([]);
  });

  it("ne rend rien sans texte", () => {
    expect(suggererDates("", { aujourdhui: AUJOURDHUI })).toEqual({ echeances: [], documents: [] });
    expect(suggererDates(undefined)).toEqual({ echeances: [], documents: [] });
  });
});
