import { describe, it, expect } from "vitest";
import { pct, pctPlain } from "./finance";

// Espace fine insécable, celle qu'emploie `Intl` en français.
const F = "\u202f";

describe("pourcentages à la française", () => {
  it("écrit la décimale avec une virgule", () => {
    // « +10.6 % » s'affichait à côté de « 420,00 € » sur la même carte.
    expect(pct(10.6)).toBe(`+10,6${F}%`);
    expect(pctPlain(2.11, 2)).toBe(`2,11${F}%`);
  });

  it("signe les variations, sauf zéro", () => {
    expect(pct(-1.4)).toBe(`-1,4${F}%`);
    expect(pct(0)).toBe(`0,0${F}%`);
    // Arrondie à zéro, une baisse infime n'a pas de sens à afficher.
    expect(pct(-0.04)).toBe(`0,0${F}%`);
  });

  it("ne signe jamais un taux", () => {
    expect(pctPlain(17.2)).toBe(`17,2${F}%`);
    expect(pctPlain(-3, 0)).toBe(`-3${F}%`);
  });

  it("ramène une valeur invalide à zéro plutôt que d'afficher NaN", () => {
    expect(pct(NaN)).toBe(`0,0${F}%`);
    expect(pctPlain(undefined, 0)).toBe(`0${F}%`);
  });

  it("ne coupe jamais le signe % de son nombre en fin de ligne", () => {
    expect(pctPlain(1234.5)).not.toMatch(/ %/);
  });
});
