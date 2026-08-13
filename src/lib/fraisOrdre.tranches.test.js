/**
 * Barèmes de courtage par paliers.
 *
 * Le modèle initial ne connaissait qu'un forfait plat, et sous-estimait donc
 * tout ordre dépassant le premier palier. Les valeurs ci-dessous sont celles
 * de la brochure tarifaire BoursoBank (offre Découverte).
 */
import { describe, it, expect } from "vitest";
import { fraisPourMontant, coutEnPourcent, montantMinimal, cadenceConseillee } from "./fraisOrdre";
import { courtierParId, PLAFOND_LEGAL_PEA_PCT } from "./courtiers";

const euronext = courtierParId("boursorama-decouverte").baremes.euronext;
const europeAutres = courtierParId("boursorama-decouverte").baremes.europeAutres;
const classic = courtierParId("boursorama-classic").baremes.euronext;

describe("frais par paliers — BoursoBank Découverte, Euronext", () => {
  it("applique le forfait dans la première tranche", () => {
    expect(fraisPourMontant(100, euronext)).toBeCloseTo(1.99, 6);
    expect(fraisPourMontant(500, euronext)).toBeCloseTo(1.99, 6);
  });

  it("bascule sur le pourcentage du montant TOTAL au-delà du palier", () => {
    // Convention des brochures : 0,60 % de 600 €, et non 1,99 € + 0,60 % de 100 €.
    expect(fraisPourMontant(600, euronext)).toBeCloseTo(3.6, 6);
    expect(fraisPourMontant(1000, euronext)).toBeCloseTo(6, 6);
  });

  it("rend visible le saut de coût au passage du palier", () => {
    // 500 € coûte 0,40 %, 501 € coûte 0,60 % : plus cher en pourcentage pour
    // un euro de plus. C'est exactement ce qu'un seuil doit faire remonter.
    expect(coutEnPourcent(500, euronext)).toBeCloseTo(0.398, 2);
    expect(coutEnPourcent(501, euronext)).toBeCloseTo(0.6, 6);
  });

  it("respecte le plancher de l'offre Classic", () => {
    expect(fraisPourMontant(1000, classic)).toBeCloseTo(5.5, 6);
    // 0,48 % de 1 001 € = 4,80 €, sous le plancher de 8,95 €.
    expect(fraisPourMontant(1001, classic)).toBeCloseTo(8.95, 6);
    // Le plancher cesse de mordre vers 1 865 €.
    expect(fraisPourMontant(3000, classic)).toBeCloseTo(14.4, 6);
  });
});

describe("le marché d'exécution change tout", () => {
  it("facture six fois plus cher hors Euronext, à montant égal", () => {
    expect(fraisPourMontant(300, euronext)).toBeCloseTo(1.99, 6);
    expect(fraisPourMontant(300, europeAutres)).toBeCloseTo(11.95, 6);
    expect(coutEnPourcent(300, euronext)).toBeCloseTo(0.663, 2);
    expect(coutEnPourcent(300, europeAutres)).toBeCloseTo(3.983, 2);
  });
});

describe("montantMinimal avec paliers", () => {
  it("trouve le plus petit montant tenant la cible dans la première tranche", () => {
    // 1,99 € doit peser ≤ 0,5 % ⟹ 398 €, et 398 € reste sous le palier de 500 €.
    expect(montantMinimal(euronext, 0.5)).toBeCloseTo(398, 0);
  });

  it("renvoie null quand aucun palier ne peut atteindre la cible", () => {
    // Cible à 0,3 % : il faudrait 663 € pour amortir le forfait, mais au-delà
    // de 500 € le taux passe à 0,60 %, définitivement au-dessus de la cible.
    expect(montantMinimal(euronext, 0.3)).toBeNull();
  });

  it("gère un barème hors Euronext, où le seuil est bien plus haut", () => {
    // 11,95 € à 0,5 % ⟹ 2 390 €, sous le palier de 4 000 € : atteignable.
    expect(montantMinimal(europeAutres, 0.5)).toBeCloseTo(2390, 0);
  });
});

describe("cadence conseillée sur un versement de 300 €", () => {
  it("conseille d'attendre deux mois, mais de n'investir que 500 €", () => {
    // Le piège du barème par paliers : après deux mois on a 600 €, mais les
    // investir d'un coup coûterait 0,60 % alors qu'en placer 500 € n'en coûte
    // que 0,40 %. Les 100 € restants amorcent l'ordre suivant.
    const c = cadenceConseillee({ bareme: euronext, versementMensuel: 300, coutCible: 0.5 });
    expect(c.moisAAccumuler).toBe(2);
    expect(c.montantOrdreConseille).toBe(500);
    expect(c.resteApresOrdre).toBe(100);
    expect(c.coutSiMensuel).toBeCloseTo(0.663, 2);
    expect(c.coutAuSeuil).toBeCloseTo(0.398, 2);
  });

  it("investit tout quand aucun palier ne pénalise", () => {
    // Barème plat : pas de saut, donc aucune raison de garder quoi que ce soit.
    const plat = { fixe: 2.5, pourcent: 0, minimum: 0 };
    const c = cadenceConseillee({ bareme: plat, versementMensuel: 300, coutCible: 0.5 });
    expect(c.montantOrdreConseille).toBe(c.moisAAccumuler * 300);
    expect(c.resteApresOrdre).toBe(0);
  });

  it("conseille d'attendre bien plus longtemps hors Euronext", () => {
    const c = cadenceConseillee({ bareme: europeAutres, versementMensuel: 300, coutCible: 0.5 });
    expect(c.moisAAccumuler).toBe(8);
  });
});

describe("plafond légal du PEA", () => {
  it("borne ce qu'un courtier peut facturer sur un ordre en ligne", () => {
    expect(PLAFOND_LEGAL_PEA_PCT).toBe(0.5);
    // Au-delà du palier, le barème affiché (0,60 %) dépasse le plafond légal :
    // c'est un écart à vérifier sur un avis d'opéré réel.
    expect(coutEnPourcent(1000, euronext)).toBeGreaterThan(PLAFOND_LEGAL_PEA_PCT);
  });
});
