/**
 * Conversion des tickers iShares vers les symboles Yahoo.
 *
 * C'est la pièce la plus fragile de l'import : trois conventions de place s'y
 * télescopent, et une conversion fausse ne provoque aucune erreur — le symbole
 * se contente de ne rien renvoyer, et le titre disparaît de l'univers sans
 * qu'on sache pourquoi. Tous les cas ci-dessous viennent des fichiers réels.
 */
import { describe, it, expect } from "vitest";
import { versSymboleYahoo } from "./importer-ishares.mjs";

describe("versSymboleYahoo", () => {
  it("laisse les valeurs américaines sans suffixe", () => {
    expect(versSymboleYahoo("MOGA", "NASDAQ")).toBe("MOGA");
    expect(versSymboleYahoo("UMBF", "NYSE")).toBe("UMBF");
    expect(versSymboleYahoo("ABC", "Nyse Mkt Llc")).toBe("ABC");
  });

  it("applique le suffixe de place européen", () => {
    expect(versSymboleYahoo("ASML", "Euronext Amsterdam")).toBe("ASML.AS");
    expect(versSymboleYahoo("HSBA", "London Stock Exchange")).toBe("HSBA.L");
    expect(versSymboleYahoo("SAP", "Xetra")).toBe("SAP.DE");
    expect(versSymboleYahoo("NOVN", "SIX Swiss Exchange")).toBe("NOVN.SW");
    expect(versSymboleYahoo("ENI", "Borsa Italiana")).toBe("ENI.MI");
    expect(versSymboleYahoo("SAN", "Bolsa De Madrid")).toBe("SAN.MC");
    expect(versSymboleYahoo("KER", "Nyse Euronext - Euronext Paris")).toBe("KER.PA");
  });

  it("retire le point final de la convention londonienne", () => {
    // Sans ça on obtiendrait « RR..L », qui ne correspond à rien.
    expect(versSymboleYahoo("RR.", "London Stock Exchange")).toBe("RR.L");
    expect(versSymboleYahoo("BP.", "London Stock Exchange")).toBe("BP.L");
    expect(versSymboleYahoo("AV.", "London Stock Exchange")).toBe("AV.L");
  });

  it("convertit les classes d'actions nordiques en tiret", () => {
    expect(versSymboleYahoo("VOLV B", "Nasdaq Omx Nordic")).toBe("VOLV-B.ST");
    expect(versSymboleYahoo("ERIC B", "Nasdaq Omx Nordic")).toBe("ERIC-B.ST");
    expect(versSymboleYahoo("NOVO B", "Omx Nordic Exchange Copenhagen A/S")).toBe("NOVO-B.CO");
    expect(versSymboleYahoo("NDA FI", "Nasdaq Omx Helsinki Ltd.")).toBe("NDA-FI.HE");
  });

  it("convertit aussi le point interne, qui marque une classe à Londres", () => {
    expect(versSymboleYahoo("BT.A", "London Stock Exchange")).toBe("BT-A.L");
  });

  it("écarte les lignes non cotées plutôt que d'inventer un symbole", () => {
    expect(versSymboleYahoo("--", "NO MARKET (E.G. UNLISTED)")).toBeNull();
    expect(versSymboleYahoo("INH", "NO MARKET (E.G. UNLISTED)")).toBeNull();
    expect(versSymboleYahoo("", "NASDAQ")).toBeNull();
  });

  it("refuse une place inconnue au lieu de deviner", () => {
    // Une place non cartographiée doit remonter dans le rapport d'import, pas
    // produire un symbole sans suffixe qui serait silencieusement pris pour
    // une valeur américaine.
    expect(versSymboleYahoo("XYZ", "Bourse De Nulle Part")).toBeNull();
  });

  it("normalise la casse et les espaces superflus", () => {
    expect(versSymboleYahoo("  asml  ", "euronext amsterdam")).toBe("ASML.AS");
  });
});
