import { describe, it, expect } from "vitest";
import {
  RATES_CATALOG,
  RATE_CATEGORIES,
  searchRates,
  groupByCategory,
  bestSavingsRate,
  nextUpcomingReview,
  findOfficialRateFor,
} from "./ratesCatalog";

describe("RATES_CATALOG", () => {
  it("n'a que des catégories connues", () => {
    RATES_CATALOG.forEach((r) => expect(RATE_CATEGORIES).toHaveProperty(r.category));
  });

  it("n'a pas d'identifiant dupliqué", () => {
    const ids = RATES_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque taux cite une source", () => {
    RATES_CATALOG.forEach((r) => expect(r.source).toBeTruthy());
  });
});

describe("searchRates", () => {
  it("renvoie tout le catalogue sur une requête vide", () => {
    expect(searchRates("")).toHaveLength(RATES_CATALOG.length);
    expect(searchRates(undefined)).toHaveLength(RATES_CATALOG.length);
  });

  it("trouve le Livret A par son nom exact", () => {
    const results = searchRates("Livret A");
    expect(results.some((r) => r.id === "livret-a")).toBe(true);
  });

  it("ignore la casse et les accents", () => {
    expect(searchRates("epargne populaire").some((r) => r.id === "lep")).toBe(true);
    expect(searchRates("ÉPARGNE POPULAIRE").some((r) => r.id === "lep")).toBe(true);
  });

  it("cherche aussi dans la description", () => {
    // "flat tax" n'apparaît que dans le libellé du PFU, mais "défiscalisée"
    // n'apparaît que dans la description du Livret A.
    expect(searchRates("défiscalisée").some((r) => r.id === "livret-a")).toBe(true);
  });

  it("cherche par nom de catégorie", () => {
    const results = searchRates("banques centrales");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.category === "marche")).toBe(true);
  });

  it("renvoie un tableau vide sur une requête sans correspondance", () => {
    expect(searchRates("xyzabc123introuvable")).toEqual([]);
  });
});

describe("groupByCategory", () => {
  it("respecte l'ordre des catégories déclarées", () => {
    const groups = groupByCategory(RATES_CATALOG);
    const order = groups.map(([key]) => key);
    const expectedOrder = Object.keys(RATE_CATEGORIES).filter((k) => order.includes(k));
    expect(order).toEqual(expectedOrder);
  });

  it("omet les catégories sans résultat", () => {
    const onlyEpargne = RATES_CATALOG.filter((r) => r.category === "epargne");
    const groups = groupByCategory(onlyEpargne);
    expect(groups).toHaveLength(1);
    expect(groups[0][0]).toBe("epargne");
  });
});

describe("bestSavingsRate", () => {
  it("trouve le LEP comme meilleur taux d'épargne réglementée sans risque", () => {
    // Vrai au moment où ce test est écrit (LEP à 2,5 %, au-dessus du Livret A
    // à 1,7 %) — le test échouera si le catalogue change d'ordre de grandeur,
    // ce qui est le comportement voulu : un rendement soudainement aberrant
    // (ex: valeur saisie en points de base au lieu de %) doit être visible.
    expect(bestSavingsRate().id).toBe("lep");
  });

  it("renvoie null sur un catalogue sans épargne", () => {
    expect(bestSavingsRate([{ id: "x", category: "credit", value: 1 }])).toBeNull();
  });
});

describe("nextUpcomingReview", () => {
  it("ignore les révisions déjà passées", () => {
    const catalog = [
      { id: "passe", nextReview: "2020-01-01" },
      { id: "futur", nextReview: "2099-01-01" },
    ];
    expect(nextUpcomingReview(catalog, new Date("2026-01-01")).id).toBe("futur");
  });

  it("trie par échéance la plus proche", () => {
    const catalog = [
      { id: "loin", nextReview: "2099-01-01" },
      { id: "proche", nextReview: "2026-02-01" },
    ];
    const result = nextUpcomingReview(catalog, new Date("2026-01-01"));
    expect(result.id).toBe("proche");
    expect(result.daysUntil).toBeGreaterThan(0);
  });

  it("renvoie null quand aucune révision n'est planifiée", () => {
    expect(nextUpcomingReview([{ id: "x", nextReview: null }])).toBeNull();
  });
});

describe("findOfficialRateFor", () => {
  it("retrouve le Livret A à partir du nom saisi par l'utilisateur", () => {
    expect(findOfficialRateFor("Livret A")?.id).toBe("livret-a");
    expect(findOfficialRateFor("Mon livret A Boursorama")?.id).toBe("livret-a");
  });

  it("retrouve le LDDS malgré un nom abrégé différemment", () => {
    expect(findOfficialRateFor("LDDS")?.id).toBe("ldds");
  });

  it("renvoie undefined pour un support non réglementé", () => {
    expect(findOfficialRateFor("Assurance-Vie Fonds Euro")).toBeUndefined();
  });
});
