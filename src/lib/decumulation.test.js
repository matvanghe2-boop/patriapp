import { describe, it, expect } from "vitest";
import { projeterDecumulation, retraitPerpetuel, formaterDuree } from "./decumulation";

describe("projeterDecumulation", () => {
  it("épuise un capital sans rendement à la mensualité près", () => {
    // 12 000 € retirés 1 000 € par mois, sans intérêts : douze mois pile.
    const p = projeterDecumulation({ capital: 12000, retraitMensuel: 1000 });
    expect(p.epuiseApresMois).toBe(12);
    expect(p.perpetuel).toBe(false);
  });

  it("déclare perpétuel un retrait couvert par les intérêts", () => {
    // 4 % sur 300 000 € = 1 000 € par mois. En retirer 900 laisse le capital
    // croître.
    const p = projeterDecumulation({ capital: 300000, retraitMensuel: 900, tauxAnnuelPct: 4 });
    expect(p.perpetuel).toBe(true);
    expect(p.epuiseApresMois).toBeNull();
    expect(p.annees.at(-1).capital).toBeGreaterThan(300000);
  });

  it("prélève APRÈS avoir crédité les intérêts du mois", () => {
    // L'ordre inverse offrirait un mois de rendement gratuit à chaque
    // itération : sur 1 an, l'écart doit être visible et positif.
    const p = projeterDecumulation({ capital: 12000, retraitMensuel: 1000, tauxAnnuelPct: 12 });
    expect(p.epuiseApresMois).toBeGreaterThan(12);
  });

  it("indexe le retrait une fois par an, pas douze", () => {
    const sans = projeterDecumulation({ capital: 200000, retraitMensuel: 1000, tauxAnnuelPct: 3 });
    const avec = projeterDecumulation({
      capital: 200000, retraitMensuel: 1000, tauxAnnuelPct: 3, inflationPct: 3,
    });
    expect(avec.epuiseApresMois).toBeLessThan(sans.epuiseApresMois ?? Infinity);
    // `annees[n]` porte ce qui a été retiré PENDANT l'année n : la 1re année
    // au montant initial, la 2e revalorisée une seule fois — 1000 × 1,03 × 12,
    // et non 1000 × 1,03^12 qu'une indexation mensuelle produirait.
    expect(avec.annees[1].retraitAnnuel).toBeCloseTo(12000, 0);
    expect(avec.annees[2].retraitAnnuel).toBeCloseTo(12360, 0);
  });

  it("expose l'année 0 comme point de départ intact", () => {
    const p = projeterDecumulation({ capital: 50000, retraitMensuel: 500 });
    expect(p.annees[0]).toEqual({ annee: 0, capital: 50000, retraitAnnuel: 6000 });
  });

  it("ne descend jamais sous zéro dans la série affichée", () => {
    const p = projeterDecumulation({ capital: 5000, retraitMensuel: 1000 });
    expect(p.annees.every((a) => a.capital >= 0)).toBe(true);
  });

  it("survit à des entrées vides ou textuelles", () => {
    // Un patrimoine vide n'a pas une durée de vie d'un mois : il n'a rien à
    // projeter, et c'est ce que dit `vide`.
    expect(projeterDecumulation()).toMatchObject({ epuiseApresMois: 0, vide: true });
    const p = projeterDecumulation({ capital: "12000", retraitMensuel: "1000" });
    expect(p.epuiseApresMois).toBe(12);
  });
});

describe("retraitPerpetuel", () => {
  it("vaut les intérêts mensuels quand le retrait n'est pas indexé", () => {
    expect(retraitPerpetuel({ capital: 300000, tauxAnnuelPct: 4 })).toBeCloseTo(1000, 6);
  });

  it("descend sous ce seuil dès que le retrait est indexé", () => {
    const plat = retraitPerpetuel({ capital: 300000, tauxAnnuelPct: 4 });
    const indexe = retraitPerpetuel({ capital: 300000, tauxAnnuelPct: 4, inflationPct: 2 });
    expect(indexe).toBeGreaterThan(0);
    expect(indexe).toBeLessThan(plat);
  });

  it("rend un seuil effectivement tenable", () => {
    // La dichotomie doit converger par le bas : le seuil renvoyé tient
    // l'horizon, ce qui est la propriété qu'on lui demande.
    const seuil = retraitPerpetuel({ capital: 250000, tauxAnnuelPct: 5, inflationPct: 2 });
    const p = projeterDecumulation({
      capital: 250000, retraitMensuel: seuil, tauxAnnuelPct: 5, inflationPct: 2,
    });
    expect(p.perpetuel).toBe(true);
  });

  it("rend zéro sans capital ni rendement", () => {
    expect(retraitPerpetuel({ capital: 0, tauxAnnuelPct: 4 })).toBe(0);
    expect(retraitPerpetuel({ capital: 100000, tauxAnnuelPct: 0 })).toBe(0);
    expect(retraitPerpetuel()).toBe(0);
  });
});

describe("formaterDuree", () => {
  it("compose années et mois", () => {
    expect(formaterDuree(284)).toBe("23 ans et 8 mois");
    expect(formaterDuree(12)).toBe("1 an");
    expect(formaterDuree(24)).toBe("2 ans");
    expect(formaterDuree(7)).toBe("7 mois");
  });

  it("rend null quand la durée n'existe pas", () => {
    expect(formaterDuree(null)).toBeNull();
  });
});
