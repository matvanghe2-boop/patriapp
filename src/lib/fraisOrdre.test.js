import { describe, it, expect } from "vitest";
import {
  fraisPourMontant,
  coutEnPourcent,
  montantMinimal,
  cadenceConseillee,
  fraisAnnuelsSelonCadence,
  BAREME_DEFAUT,
} from "./fraisOrdre";

describe("fraisPourMontant", () => {
  it("applique un forfait seul", () => {
    expect(fraisPourMontant(100, { fixe: 2.5, pourcent: 0, minimum: 0 })).toBe(2.5);
    expect(fraisPourMontant(5000, { fixe: 2.5, pourcent: 0, minimum: 0 })).toBe(2.5);
  });

  it("applique un pourcentage seul", () => {
    expect(fraisPourMontant(1000, { fixe: 0, pourcent: 0.5, minimum: 0 })).toBe(5);
  });

  it("retient le plancher quand le barème calculé lui est inférieur", () => {
    // 0,1 % de 1 000 € = 1 €, mais le courtier facture 5 € minimum.
    expect(fraisPourMontant(1000, { fixe: 0, pourcent: 0.1, minimum: 5 })).toBe(5);
    // À 10 000 €, le pourcentage (10 €) dépasse le plancher.
    expect(fraisPourMontant(10000, { fixe: 0, pourcent: 0.1, minimum: 5 })).toBe(10);
  });

  it("ne facture rien sur un montant nul", () => {
    expect(fraisPourMontant(0, BAREME_DEFAUT)).toBe(0);
  });
});

describe("coutEnPourcent", () => {
  it("chiffre ce que coûte vraiment un petit ordre", () => {
    // Le cas qui motive toute cette fonctionnalité : 2,50 € sur 100 € investis.
    expect(coutEnPourcent(100, { fixe: 2.5, pourcent: 0, minimum: 0 })).toBeCloseTo(2.5, 6);
    expect(coutEnPourcent(500, { fixe: 2.5, pourcent: 0, minimum: 0 })).toBeCloseTo(0.5, 6);
  });

  it("ne renvoie rien pour un montant nul, plutôt qu'une division par zéro", () => {
    expect(coutEnPourcent(0, BAREME_DEFAUT)).toBeNull();
  });
});

describe("montantMinimal", () => {
  it("résout le seuil d'un forfait", () => {
    // 2,50 € doivent peser au plus 0,5 % ⟹ 500 €.
    expect(montantMinimal({ fixe: 2.5, pourcent: 0, minimum: 0 }, 0.5)).toBeCloseTo(500, 6);
  });

  it("tient compte de la part proportionnelle", () => {
    // (2,5 + 0,2 % M) / M ≤ 0,5 %  ⟹  M ≥ 250 / 0,3 ≈ 833,33
    expect(montantMinimal({ fixe: 2.5, pourcent: 0.2, minimum: 0 }, 0.5)).toBeCloseTo(833.333, 2);
  });

  it("retient la contrainte la plus exigeante entre forfait et plancher", () => {
    // Forfait ⟹ 200 € ; plancher de 5 € ⟹ 1 000 €. C'est le plancher qui décide.
    const seuil = montantMinimal({ fixe: 1, pourcent: 0, minimum: 5 }, 0.5);
    expect(seuil).toBeCloseTo(1000, 6);
  });

  it("renvoie null quand la part proportionnelle dépasse déjà la cible", () => {
    // Attendre n'y changerait rien : l'information utile est qu'il n'y a pas
    // de seuil à atteindre.
    expect(montantMinimal({ fixe: 2.5, pourcent: 0.6, minimum: 0 }, 0.5)).toBeNull();
    expect(montantMinimal({ fixe: 0, pourcent: 0.6, minimum: 0 }, 0.5)).toBeNull();
  });

  it("n'impose aucun seuil quand le courtier ne prélève rien", () => {
    expect(montantMinimal({ fixe: 0, pourcent: 0, minimum: 0 }, 0.5)).toBe(0);
  });
});

describe("cadenceConseillee", () => {
  it("traduit le seuil en nombre de mois d'épargne", () => {
    const r = cadenceConseillee({
      bareme: { fixe: 2.5, pourcent: 0, minimum: 0 },
      versementMensuel: 200,
      coutCible: 0.5,
    });
    expect(r.montantMin).toBeCloseTo(500, 6);
    // 500 / 200 = 2,5 ⟹ il faut attendre 3 mois pleins.
    expect(r.moisAAccumuler).toBe(3);
    expect(r.coutSiMensuel).toBeCloseTo(1.25, 6); // 2,50 € sur 200 €
    expect(r.coutAuSeuil).toBeCloseTo(2.5 / 600 * 100, 6); // sur 600 € réellement accumulés
    expect(r.economiePct).toBeGreaterThan(0);
  });

  it("arrondit toujours à au moins un mois", () => {
    const r = cadenceConseillee({
      bareme: { fixe: 2.5, pourcent: 0, minimum: 0 },
      versementMensuel: 5000,
      coutCible: 0.5,
    });
    expect(r.moisAAccumuler).toBe(1);
  });

  it("reste exploitable sans versement mensuel renseigné", () => {
    const r = cadenceConseillee({ bareme: BAREME_DEFAUT, versementMensuel: 0 });
    expect(r.montantMin).toBeCloseTo(500, 6);
    expect(r.moisAAccumuler).toBeNull();
    expect(r.coutSiMensuel).toBeNull();
  });
});

describe("fraisAnnuelsSelonCadence", () => {
  it("montre l'écart entre douze petits ordres et quelques gros", () => {
    const lignes = fraisAnnuelsSelonCadence(200, { fixe: 2.5, pourcent: 0, minimum: 0 });
    const mensuel = lignes.find((l) => l.moisEntreOrdres === 1);
    const trimestriel = lignes.find((l) => l.moisEntreOrdres === 3);

    expect(mensuel.fraisAnnuels).toBeCloseTo(30, 6); // 12 × 2,50 €
    expect(trimestriel.fraisAnnuels).toBeCloseTo(10, 6); // 4 × 2,50 €
    expect(trimestriel.montantParOrdre).toBe(600);
    // Sur 2 400 € versés dans l'année.
    expect(mensuel.partDesVersementsPct).toBeCloseTo(1.25, 6);
  });

  it("ne renvoie rien sans versement", () => {
    expect(fraisAnnuelsSelonCadence(0, BAREME_DEFAUT)).toEqual([]);
  });
});
