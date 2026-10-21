import { describe, it, expect } from "vitest";
import { groupeDePairs, comparerAuxPairs, plusProchesParTaille, deviseCapitalisation, fusionnerUnivers } from "./pairs";

const chimie = (symbole, per, extra = {}) => ({
  symbole,
  secteur: "Basic Materials",
  industrie: "Specialty Chemicals",
  devise: "EUR",
  capitalisation: 10e9,
  per,
  ...extra,
});

describe("groupeDePairs", () => {
  it("prend l'industrie quand elle compte assez de sociétés", () => {
    const titres = [chimie("AI.PA", 25), chimie("A", 10), chimie("B", 12), chimie("C", 15), chimie("D", 30)];
    const g = groupeDePairs(titres[0], titres);
    expect(g.niveau).toBe("industrie");
    expect(g.pairs).toHaveLength(4);
    expect(g.pairs.some((p) => p.symbole === "AI.PA")).toBe(false);
  });

  it("se rabat sur le secteur quand l'industrie est trop petite, et le dit", () => {
    const titres = [
      chimie("AI.PA", 25),
      chimie("A", 10),
      { symbole: "B", secteur: "Basic Materials", industrie: "Gold" },
      { symbole: "C", secteur: "Basic Materials", industrie: "Steel" },
      { symbole: "D", secteur: "Basic Materials", industrie: "Steel" },
    ];
    const g = groupeDePairs(titres[0], titres);
    expect(g.niveau).toBe("secteur");
    expect(g.pairs).toHaveLength(4);
  });
});

describe("comparerAuxPairs", () => {
  it("classe le PER et juge un titre cher défavorablement", () => {
    const pairs = [chimie("A", 10), chimie("B", 12), chimie("C", 15), chimie("D", 30)];
    const per = comparerAuxPairs(chimie("AI.PA", 25), pairs).find((l) => l.cle === "per");
    // Trois des quatre pairs ont un PER plus bas.
    expect(per.rangPct).toBe(75);
    expect(per.mediane).toBe(13.5);
    expect(per.ton).toBe("defavorable");
  });

  it("écarte les PER négatifs du classement au lieu de les compter « moins chers »", () => {
    const pairs = [chimie("A", -5), chimie("B", 12), chimie("C", 15), chimie("D", 30), chimie("E", 18)];
    const per = comparerAuxPairs(chimie("AI.PA", 14), pairs).find((l) => l.cle === "per");
    expect(per.nbPairs).toBe(4);
    expect(per.rangPct).toBe(25);
  });

  it("ne classe pas avec moins de quatre concurrents renseignés", () => {
    const pairs = [chimie("A", 10), chimie("B", null), chimie("C", 15)];
    const per = comparerAuxPairs(chimie("AI.PA", 25), pairs).find((l) => l.cle === "per");
    expect(per.rangPct).toBeNull();
  });
});

describe("plusProchesParTaille", () => {
  it("convertit les capitalisations en euros, livres comprises", () => {
    const sujet = chimie("AI.PA", 25, { capitalisation: 100e9 });
    const pairs = [
      chimie("SEK", 10, { devise: "SEK", capitalisation: 1000e9 }), // ≈ 90 Md€ au taux donné
      chimie("LON", 10, { devise: "GBp", capitalisation: 40e9 }), // en LIVRES : ≈ 46 Md€
      chimie("PETIT", 10, { capitalisation: 2e9 }),
      chimie("CHF", 10, { devise: "CHF", capitalisation: 50e9 }), // pas de taux : écarté
    ];
    const proches = plusProchesParTaille(sujet, pairs, { SEK: 0.09, GBP: 1.15 });
    expect(proches.map((p) => p.symbole)).toEqual(["SEK", "LON", "PETIT"]);
    expect(proches[1].capitalisationEuro).toBeCloseTo(46e9);
  });

  it("traduit les pence en livres pour la capitalisation", () => {
    expect(deviseCapitalisation("GBp")).toBe("GBP");
    expect(deviseCapitalisation("EUR")).toBe("EUR");
  });
});

it("fusionne les univers sans doublon", () => {
  expect(fusionnerUnivers([[{ symbole: "A" }], [{ symbole: "A" }, { symbole: "B" }]])).toHaveLength(2);
});
