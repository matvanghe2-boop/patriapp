import { describe, it, expect } from "vitest";
import { compact } from "./finance";

describe("compact", () => {
  it("choisit le milliard au-delà de 1e9", () => {
    // Le cas qui a motivé la correction : un chiffre d'affaires de 26,9 Md€
    // s'affichait « 26940200 k€ », soit huit chiffres à compter à l'œil.
    expect(compact(26_940_200_000)).toBe("26,9 Md€");
    expect(compact(1_000_000_000)).toBe("1 Md€");
  });

  it("choisit le million entre 1e6 et 1e9", () => {
    expect(compact(7_528_700_000 / 1000)).toBe("7,5 M€");
    expect(compact(234_000_000)).toBe("234 M€");
  });

  it("choisit le millier entre 1e3 et 1e6", () => {
    expect(compact(45_600)).toBe("45,6 k€");
    expect(compact(1_234_500)).toBe("1,2 M€");
  });

  it("reste en euros sous mille", () => {
    expect(compact(850)).toBe("850 €");
    expect(compact(42.5)).toBe("42,5 €");
  });

  it("n'affiche pas de décimale au-delà de cent", () => {
    // « 269,4 M€ » se lit ; « 1234,5 k€ » n'apporte rien de plus que « 1235 k€ ».
    expect(compact(269_400_000)).toBe("269 M€");
    expect(compact(1_234_500_000)).toBe("1,2 Md€");
  });

  it("supprime la décimale inutile", () => {
    expect(compact(5_000_000)).toBe("5 M€");
    expect(compact(12_000)).toBe("12 k€");
  });

  it("préserve le signe des montants négatifs", () => {
    // Le capex est publié en négatif.
    expect(compact(-3_843_400_000)).toBe("-3,8 Md€");
    expect(compact(-45_600)).toBe("-45,6 k€");
  });

  it("utilise la virgule décimale française", () => {
    expect(compact(26_940_200_000)).toContain(",");
    expect(compact(26_940_200_000)).not.toContain(".");
  });

  it("rend zéro lisible", () => {
    expect(compact(0)).toBe("0 €");
  });

  it("rend un tiret plutôt que NaN sur une valeur absente", () => {
    // Utilisé comme tickFormatter d'axe : un « NaN k€ » sur une graduation
    // serait à la fois faux et impossible à interpréter.
    expect(compact(null)).toBe("—");
    expect(compact(undefined)).toBe("—");
    expect(compact(NaN)).toBe("—");
    expect(compact(Infinity)).toBe("—");
  });
});
