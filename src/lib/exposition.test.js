import { describe, it, expect } from "vitest";
import { partsSectorielles, poidsParSecteur, partsGeographiques, partsParZone, estFonds, BLOC_INDICE } from "./exposition";
import { INDICES, ETF_INDICE, SECTEUR_GICS, compositionDe } from "./compositionEtf";
import { secteurDe, SECTEUR_YAHOO, SECTOR_HEX, NON_CLASSE } from "./sectors";

const pos = (ticker, valeur, extra = {}) => ({
  ticker, name: ticker, quantity: 1, current_price: valeur, currency: "EUR", ...extra,
});

describe("catalogue des indices", () => {
  it("porte sa source et sa date, pour que son âge se voie", () => {
    for (const indice of Object.values(INDICES)) {
      expect(indice.source).toBeTruthy();
      expect(indice.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("recopie des poids qui somment à 100, aux arrondis de la fiche près", () => {
    for (const indice of Object.values(INDICES)) {
      const somme = (o) => Object.values(o).reduce((s, v) => s + v, 0);
      expect(Math.abs(somme(indice.secteurs) - 100)).toBeLessThan(0.1);
      expect(Math.abs(somme(indice.pays) - 100)).toBeLessThan(0.1);
    }
  });

  it("traduit chaque secteur de la source vers un secteur existant de l'application", () => {
    for (const indice of Object.values(INDICES)) {
      for (const gics of Object.keys(indice.secteurs)) {
        expect(SECTOR_HEX[SECTEUR_GICS[gics]]).toBeDefined();
      }
    }
  });

  it("ne rattache un ETF qu'à un indice réellement au catalogue", () => {
    for (const indice of Object.values(ETF_INDICE)) expect(INDICES[indice]).toBeDefined();
    expect(compositionDe("cw8.pa").indice).toBe("MSCI World");
    expect(compositionDe("PNAS.PA").indice).toBe("Nasdaq-100");
    expect(compositionDe("PUST.PA").indice).toBe("Nasdaq-100");
    expect(compositionDe("XYZ.PA")).toBeNull();
  });
});

describe("parts sectorielles", () => {
  it("découpe un ETF sans créer ni perdre de valeur", () => {
    // La fiche somme à 100,02 % : sans renormalisation, l'ETF pèserait plus
    // que sa propre valeur.
    const parts = partsSectorielles([pos("CW8.PA", 1000, { type: "ETF" })]);
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.reduce((s, p) => s + p.valeur, 0)).toBeCloseTo(1000, 6);
    expect(parts.every((p) => p.etf?.indice === "MSCI World")).toBe(true);
  });

  it("additionne consommation discrétionnaire et de base dans un seul secteur", () => {
    const poids = poidsParSecteur([pos("CW8.PA", 1000, { type: "ETF" })]);
    const attendu = ((8.36 + 4.77) / 100.02) * 100;
    expect(poids["Biens de consommation"]).toBeCloseTo(attendu, 6);
  });

  it("garde une action entière dans son secteur", () => {
    const parts = partsSectorielles([pos("AI.PA", 500, { type: "Action" })]);
    expect(parts).toEqual([
      expect.objectContaining({ ticker: "AI.PA", secteur: "Matériaux", valeur: 500, etf: null }),
    ]);
  });

  it("décompose un ETF Nasdaq-100 selon son indice, même encore typé « Action »", () => {
    // Ligne née du journal d'ordres : la décomposition dépend du ticker, pas
    // du type, et vaut donc avant même que la cotation l'ait reclassée.
    const parts = partsSectorielles([pos("PNAS.PA", 1000, { type: "Action" })]);
    expect(parts.every((p) => p.etf?.indice === "Nasdaq-100")).toBe(true);
    expect(parts.reduce((s, p) => s + p.valeur, 0)).toBeCloseTo(1000, 6);
    const poids = poidsParSecteur([pos("PNAS.PA", 1000, { type: "ETF" })]);
    expect(poids.Technologie).toBeCloseTo((59.65 / 100.01) * 100, 6);
    expect(poids["Télécoms & médias"]).toBeCloseTo((15.08 / 100.01) * 100, 6);
    expect(poids["Biens de consommation"]).toBeCloseTo(((10.03 + 5.67) / 100.01) * 100, 6);
    expect(poids[NON_CLASSE]).toBeUndefined();
  });

  it("exprime les poids en pourcentage du total", () => {
    const poids = poidsParSecteur([pos("CW8.PA", 800, { type: "ETF" }), pos("AI.PA", 200)]);
    const somme = Object.values(poids).reduce((s, v) => s + v, 0);
    expect(somme).toBeCloseTo(100, 6);
  });
});

describe("secteurDe", () => {
  it("donne la priorité au choix manuel, puis au classement maison, puis à Yahoo", () => {
    expect(secteurDe({ ticker: "DG.PA", secteurYahoo: "Industrials" })).toBe("Utilities & infrastructures");
    expect(secteurDe({ ticker: "DG.PA" }, { "DG.PA": "Industrie" })).toBe("Industrie");
    expect(secteurDe({ ticker: "INCONNU.PA", secteurYahoo: "Basic Materials" })).toBe("Matériaux");
    expect(secteurDe({ ticker: "INCONNU.PA" })).toBe(NON_CLASSE);
  });

  it("traduit chaque secteur Yahoo vers un secteur existant", () => {
    for (const secteur of Object.values(SECTEUR_YAHOO)) expect(SECTOR_HEX[secteur]).toBeDefined();
  });
});

describe("parts géographiques", () => {
  it("ne range jamais un fonds d'après sa place de cotation", () => {
    expect(estFonds({ type: "ETF" })).toBe(true);
    expect(estFonds({ type: "Fonds / OPCVM" })).toBe(true);
    expect(estFonds({ type: "Action" })).toBe(false);
    const { parts, inconnu } = partsGeographiques([pos("XYZ.PA", 100, { type: "ETF" })]);
    expect(parts).toEqual([]);
    expect(inconnu).toBe(100);
  });

  it("situe un ETF Nasdaq-100 coté à Paris aux États-Unis, pas en France", () => {
    // Typé « Action », la ligne était rangée en France d'après son suffixe .PA.
    const { parts, inconnu } = partsGeographiques([pos("PNAS.PA", 1000, { type: "Action" })]);
    expect(inconnu).toBe(0);
    expect(parts.every((p) => p.origine === "indice")).toBe(true);
    expect(parts.find((p) => p.pays === "France")).toBeUndefined();
    expect(parts.find((p) => p.pays === "États-Unis").valeur).toBeCloseTo((94.81 / 100.01) * 1000, 6);
  });

  it("préfère le pays enregistré à la place de cotation", () => {
    // Stellantis, société néerlandaise, se négocie à Paris.
    const { parts } = partsGeographiques([pos("STLAP.PA", 100, { pays: "Pays-Bas" })]);
    expect(parts[0]).toEqual(expect.objectContaining({ pays: "Pays-Bas", origine: "fiche" }));
  });
});

describe("parts par zone", () => {
  const somme = (parts) => parts.reduce((s, p) => s + p.valeur, 0);

  it("ne range plus Vusion en France : ses deux blocs publiés, rien au jugé", () => {
    const { parts } = partsParZone([pos("VU.PA", 1000, { type: "Action" })]);
    expect(parts.every((p) => p.origine === "chiffre d'affaires" && p.bloc && !p.zone)).toBe(true);
    expect(parts.find((p) => p.bloc === "Amériques + Asie-Pacifique").valeur).toBeCloseTo((1057.4 / 1472.0) * 1000, 6);
    expect(somme(parts)).toBeCloseTo(1000, 6);
  });

  it("répartit Vinci selon son tableau par zone", () => {
    const { parts } = partsParZone([pos("DG.PA", 1000)]);
    const zone = (z) => somme(parts.filter((p) => p.zone === z));
    expect(zone("France")).toBeCloseTo((30787 / 74599) * 1000, 6);
    expect(zone("Europe hors France")).toBeCloseTo(((7362 + 6485 + 3780 + 3297 + 7587) / 74599) * 1000, 6);
    expect(somme(parts.filter((p) => p.bloc === "Reste du monde"))).toBeCloseTo((3805 / 74599) * 1000, 6);
  });

  it("situe un ETF d'après le siège des sociétés de son indice", () => {
    const { parts } = partsParZone([pos("PNAS.PA", 1000, { type: "ETF" }), pos("CW8.PA", 1000, { type: "ETF" })]);
    expect(parts.every((p) => p.origine === "siège")).toBe(true);
    const nasdaq = parts.filter((p) => p.ticker === "PNAS.PA");
    expect(somme(nasdaq.filter((p) => p.zone === "Amériques"))).toBeCloseTo(((94.81 + 0.91) / 100.01) * 1000, 6);
    // Le reste non détaillé d'une fiche reste un bloc.
    expect(parts.filter((p) => p.bloc === BLOC_INDICE).map((p) => p.ticker)).toEqual(["PNAS.PA", "CW8.PA"]);
  });

  it("garde la place de cotation pour une action hors catalogue, et ne perd rien", () => {
    const { parts, inconnu, total } = partsParZone([pos("SAP.DE", 100), pos("XYZ.PA", 50, { type: "ETF" })]);
    expect(parts).toEqual([expect.objectContaining({ ticker: "SAP.DE", zone: "Europe hors France", origine: "cotation" })]);
    expect(inconnu).toBe(50);
    expect(total).toBe(150);
  });
});
