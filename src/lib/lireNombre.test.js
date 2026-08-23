import { describe, it, expect } from "vitest";
import { lireNombre } from "./finance";

describe("lireNombre", () => {
  it("lit un nombre ordinaire", () => {
    expect(lireNombre("42")).toBe(42);
    expect(lireNombre("3.5")).toBe(3.5);
    expect(lireNombre("-12.75")).toBe(-12.75);
    expect(lireNombre(7)).toBe(7);
  });

  it("accepte la virgule décimale française", () => {
    // `parseFloat("3,5")` valait 3 : la saisie d'un taux à « 3,5 % » était
    // silencieusement ramenée à 3 %.
    expect(lireNombre("3,5")).toBe(3.5);
    expect(lireNombre("1234,56")).toBe(1234.56);
    expect(lireNombre("-0,25")).toBe(-0.25);
  });

  it("distingue « vide » de « zéro »", () => {
    // C'est tout l'objet du null : un champ effacé pour être resaisi ne doit
    // pas écrire 0 dans l'état persistant, donc dans le cloud.
    expect(lireNombre("")).toBeNull();
    expect(lireNombre("   ")).toBeNull();
    expect(lireNombre("0")).toBe(0);
    expect(lireNombre("0,0")).toBe(0);
  });

  it("tolère les saisies intermédiaires d'un champ en cours de frappe", () => {
    expect(lireNombre("-")).toBeNull();
    expect(lireNombre(".")).toBeNull();
    expect(lireNombre("-.")).toBeNull();
  });

  it("refuse une chaîne partiellement numérique au lieu de la deviner", () => {
    // `parseFloat("12abc")` valait 12 ; `parseFloat("abc")` valait NaN, que le
    // `|| 0` transformait ensuite en 0.
    expect(lireNombre("12abc")).toBeNull();
    expect(lireNombre("abc")).toBeNull();
    expect(lireNombre("1 234")).toBeNull();
  });

  it("refuse ce qui n'est ni un nombre ni une chaîne", () => {
    expect(lireNombre(null)).toBeNull();
    expect(lireNombre(undefined)).toBeNull();
    expect(lireNombre({})).toBeNull();
    expect(lireNombre([])).toBeNull();
    expect(lireNombre(NaN)).toBeNull();
    expect(lireNombre(Infinity)).toBeNull();
  });
});
