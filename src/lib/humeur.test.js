import { describe, it, expect } from "vitest";
import { estAuPlusHaut, humeurPingouin } from "./humeur";

const historique = (valeurs) =>
  valeurs.map((value, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, value }));

describe("estAuPlusHaut", () => {
  const huitJours = historique([10, 11, 12, 13, 14, 15, 16, 17]);

  it("vrai quand le patrimoine dépasse tous les relevés antérieurs", () => {
    expect(estAuPlusHaut({ historique: huitJours, patrimoineActuel: 18, aujourdhui: "2026-10-09" })).toBe(true);
  });

  it("faux à égalité ou en dessous du plus haut", () => {
    expect(estAuPlusHaut({ historique: huitJours, patrimoineActuel: 17, aujourdhui: "2026-10-09" })).toBe(false);
    expect(estAuPlusHaut({ historique: huitJours, patrimoineActuel: 12, aujourdhui: "2026-10-09" })).toBe(false);
  });

  it("ignore le relevé du jour : il ne se bat pas lui-même", () => {
    const avecAujourdhui = [...huitJours, { date: "2026-10-09", value: 99 }];
    expect(estAuPlusHaut({ historique: avecAujourdhui, patrimoineActuel: 18, aujourdhui: "2026-10-09" })).toBe(true);
  });

  it("faux tant qu'il n'y a pas sept relevés antérieurs", () => {
    expect(estAuPlusHaut({ historique: historique([10, 11, 12]), patrimoineActuel: 50, aujourdhui: "2026-10-09" })).toBe(false);
  });
});

describe("humeurPingouin", () => {
  const hausse = { exploitable: true, montant: 120 };
  const baisse = { exploitable: true, montant: -80 };

  it("sourit en hausse, transpire en baisse, reste neutre sinon", () => {
    expect(humeurPingouin({ variationJour: hausse })).toBe("hausse");
    expect(humeurPingouin({ variationJour: baisse })).toBe("baisse");
    expect(humeurPingouin({ variationJour: { exploitable: true, montant: 0 } })).toBe(null);
    expect(humeurPingouin({ variationJour: { exploitable: false, montant: 300 } })).toBe(null);
  });

  it("met les lunettes de soleil sur un record, sauf si la séance baisse", () => {
    expect(humeurPingouin({ auPlusHaut: true, variationJour: hausse })).toBe("record");
    expect(humeurPingouin({ auPlusHaut: true })).toBe("record");
    expect(humeurPingouin({ auPlusHaut: true, variationJour: baisse })).toBe("baisse");
  });

  it("se tait en mode Ghost et quand les effets ne sont pas vivants", () => {
    expect(humeurPingouin({ ghost: true, auPlusHaut: true, variationJour: hausse })).toBe(null);
    expect(humeurPingouin({ vivant: false, variationJour: baisse })).toBe(null);
  });
});
