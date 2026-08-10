import { describe, it, expect } from "vitest";
import {
  tauxPosition,
  valeurPosition,
  coutPosition,
  devisesDuPortefeuille,
  positionsSansTaux,
} from "./finance";
import { parseDevises } from "../../api/fx.js";

const euro = { ticker: "CW8.PA", quantity: 10, pru: 400, current_price: 460, currency: "EUR" };
const dollar = { ticker: "AAPL", quantity: 10, pru: 150, current_price: 200, currency: "USD", fxRate: 0.9 };
const dollarSansTaux = { ticker: "MSFT", quantity: 5, pru: 300, current_price: 400, currency: "USD" };

describe("tauxPosition", () => {
  it("vaut 1 pour l'euro", () => {
    expect(tauxPosition(euro)).toBe(1);
    expect(tauxPosition({ quantity: 1, current_price: 10 })).toBe(1);
  });

  it("utilise fxRate pour une devise étrangère", () => {
    expect(tauxPosition(dollar)).toBe(0.9);
  });

  it("retombe sur 1 quand le taux est absent ou aberrant", () => {
    // Comportement historique conservé volontairement : mieux vaut un total
    // approximatif accompagné d'un avertissement qu'une position à zéro.
    expect(tauxPosition(dollarSansTaux)).toBe(1);
    expect(tauxPosition({ ...dollar, fxRate: 0 })).toBe(1);
    expect(tauxPosition({ ...dollar, fxRate: -2 })).toBe(1);
    expect(tauxPosition({ ...dollar, fxRate: NaN })).toBe(1);
  });
});

describe("valeurPosition / coutPosition", () => {
  it("n'altère pas une position en euros", () => {
    expect(valeurPosition(euro)).toBe(4600);
    expect(coutPosition(euro)).toBe(4000);
  });

  it("convertit une position en devise", () => {
    // 10 × 200 USD × 0,9 € = 1 800 €, et non 2 000 € comme avant.
    expect(valeurPosition(dollar)).toBe(1800);
    expect(coutPosition(dollar)).toBe(1350);
  });

  it("rend 0 sur une position vide plutôt que NaN", () => {
    expect(valeurPosition({})).toBe(0);
    expect(coutPosition(null)).toBe(0);
  });
});

describe("devisesDuPortefeuille", () => {
  it("liste les devises étrangères sans doublon et sans l'euro", () => {
    expect(devisesDuPortefeuille([euro, dollar, dollarSansTaux, { currency: "GBP" }]))
      .toEqual(["USD", "GBP"]);
  });

  it("rend un tableau vide sur un portefeuille en euros", () => {
    expect(devisesDuPortefeuille([euro])).toEqual([]);
  });
});

describe("positionsSansTaux", () => {
  it("ne retient que les positions étrangères sans taux exploitable", () => {
    const out = positionsSansTaux([euro, dollar, dollarSansTaux]);
    expect(out.map((p) => p.ticker)).toEqual(["MSFT"]);
  });
});

describe("parseDevises (endpoint /api/fx)", () => {
  it("normalise, déduplique et écarte l'euro", () => {
    expect(parseDevises("usd, USD ,gbp,EUR")).toEqual(["USD", "GBP"]);
  });

  it("rejette ce qui n'est pas un code ISO à trois lettres", () => {
    expect(parseDevises("US,DOLLAR,U$D,123")).toEqual([]);
  });

  it("borne le nombre de devises demandées", () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) => `A${String.fromCharCode(65 + (i % 26))}X`).join(",");
    expect(parseDevises(beaucoup).length).toBeLessThanOrEqual(12);
  });

  it("tolère une entrée absente", () => {
    expect(parseDevises(undefined)).toEqual([]);
  });
});
