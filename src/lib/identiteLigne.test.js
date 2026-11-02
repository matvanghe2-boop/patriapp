import { describe, it, expect } from "vitest";
import { identiteDepuisCotation } from "./identiteLigne";

// Ligne telle que la crée le rejeu du journal d'ordres (replayLedger).
const neeDuJournal = (ticker) => ({ id: "x", ticker, name: ticker, type: "Action", quantity: 10, pru: 6.5 });
const cotation = (extra = {}) => ({ symbol: "PNAS.PA", ok: true, price: 6.72, name: "Amundi PEA Nasdaq-100 UCITS ETF", instrumentType: "ETF", ...extra });

describe("identité d'une ligne d'après sa cotation", () => {
  it("reconnaît un ETF né du journal d'ordres et lui rend son nom", () => {
    expect(identiteDepuisCotation(neeDuJournal("PNAS.PA"), cotation())).toEqual({
      type: "ETF",
      name: "Amundi PEA Nasdaq-100 UCITS ETF",
    });
  });

  it("range un fonds commun en « Fonds / OPCVM »", () => {
    expect(identiteDepuisCotation(neeDuJournal("0P0000.F"), cotation({ instrumentType: "MUTUALFUND" })).type).toBe("Fonds / OPCVM");
  });

  it("laisse une action en action", () => {
    const ai = { ...neeDuJournal("AI.PA"), name: "Air Liquide" };
    expect(identiteDepuisCotation(ai, cotation({ instrumentType: "EQUITY", name: "AIR LIQUIDE" }))).toBeNull();
  });

  it("ne rétrograde jamais une ligne déjà rangée en fonds", () => {
    const fonds = { ...neeDuJournal("XYZ.PA"), name: "Mon fonds", type: "Fonds / OPCVM" };
    expect(identiteDepuisCotation(fonds, cotation({ instrumentType: "EQUITY" }))).toBeNull();
    expect(identiteDepuisCotation({ ...fonds, type: "ETF" }, cotation())).toBeNull();
  });

  it("n'écrase jamais un nom saisi", () => {
    const nommee = { ...neeDuJournal("PNAS.PA"), name: "Mon Nasdaq" };
    expect(identiteDepuisCotation(nommee, cotation())).toEqual({ type: "ETF" });
  });

  it("ne remplace pas le ticker par lui-même quand la source n'a pas de nom", () => {
    expect(identiteDepuisCotation(neeDuJournal("PNAS.PA"), cotation({ name: "PNAS.PA" }))).toEqual({ type: "ETF" });
  });

  it("ignore une cotation en échec ou absente", () => {
    expect(identiteDepuisCotation(neeDuJournal("PNAS.PA"), { symbol: "PNAS.PA", ok: false })).toBeNull();
    expect(identiteDepuisCotation(neeDuJournal("PNAS.PA"), undefined)).toBeNull();
  });
});
