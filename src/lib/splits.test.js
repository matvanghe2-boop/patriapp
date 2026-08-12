/**
 * Opérations sur titres (splits et regroupements).
 *
 * Le grand livre ne connaissait que ACHAT, VENTE, DIVIDENDE, VERSEMENT et
 * RETRAIT. Le jour où une ligne détenue en direct fait un split, la quantité et
 * le PRU rejoués devenaient faux en silence : l'ancienne quantité restait
 * appliquée à un cours divisé par le ratio, et la position affichait une perte
 * massive et purement comptable.
 */
import { describe, it, expect } from "vitest";
import {
  rebuildPositionsFromOperations,
  operationCashDelta,
  ratioSplit,
  triPosition,
  totalCashDelta,
} from "./finance";

const achat = (id, date, asset, quantity, price, fees = 0) => ({
  id, date, asset, type: "ACHAT", quantity, price, fees,
});
const split = (id, date, asset, ratio) => ({ id, date, asset, type: "SPLIT", ratio });

describe("ratioSplit", () => {
  it("lit le ratio, et retombe sur 1 quand il est absurde", () => {
    expect(ratioSplit({ ratio: 10 })).toBe(10);
    expect(ratioSplit({ ratio: 0.1 })).toBeCloseTo(0.1, 10);
    expect(ratioSplit({ ratio: 0 })).toBe(1);
    expect(ratioSplit({ ratio: -5 })).toBe(1);
    expect(ratioSplit({})).toBe(1);
  });
});

describe("un split ne déplace aucun argent", () => {
  it("laisse la trésorerie inchangée", () => {
    expect(operationCashDelta(split("s1", "2026-03-01", "AI.PA", 10))).toBe(0);
    const journal = [achat("a1", "2026-01-05", "AI.PA", 10, 160), split("s1", "2026-03-01", "AI.PA", 10)];
    expect(totalCashDelta(journal)).toBeCloseTo(-1600, 6);
  });
});

describe("rebuildPositionsFromOperations avec split", () => {
  it("multiplie la quantité et divise le PRU, à valeur totale constante", () => {
    // Air Liquide : 10 titres à 160 €, puis attribution 1 pour 1 (ratio 2).
    const journal = [split("s1", "2026-03-01", "AI.PA", 2), achat("a1", "2026-01-05", "AI.PA", 10, 160)];
    const [pos] = rebuildPositionsFromOperations(journal, [
      { id: "p1", ticker: "AI.PA", name: "Air Liquide", quantity: 10, pru: 160 },
    ]);

    expect(pos.quantity).toBeCloseTo(20, 6);
    expect(pos.pru).toBeCloseTo(80, 6);
    // Le prix de revient total est rigoureusement conservé.
    expect(pos.quantity * pos.pru).toBeCloseTo(10 * 160, 6);
  });

  it("gère un regroupement (ratio inférieur à 1)", () => {
    const journal = [split("s1", "2026-03-01", "XX.PA", 0.1), achat("a1", "2026-01-05", "XX.PA", 100, 2)];
    const [pos] = rebuildPositionsFromOperations(journal, [
      { id: "p1", ticker: "XX.PA", quantity: 100, pru: 2 },
    ]);
    expect(pos.quantity).toBeCloseTo(10, 6);
    expect(pos.pru).toBeCloseTo(20, 6);
  });

  it("n'applique le split qu'aux titres détenus au moment où il survient", () => {
    // Achat AVANT le split (10 titres → 20), puis achat APRÈS (5 titres au
    // nouveau cours). Le second ne doit pas être dédoublé.
    const journal = [
      achat("a2", "2026-06-01", "AI.PA", 5, 80),
      split("s1", "2026-03-01", "AI.PA", 2),
      achat("a1", "2026-01-05", "AI.PA", 10, 160),
    ];
    const [pos] = rebuildPositionsFromOperations(journal, [{ id: "p1", ticker: "AI.PA", quantity: 0, pru: 0 }]);

    expect(pos.quantity).toBeCloseTo(25, 6);
    // 20 titres à 80 € + 5 titres à 80 € ⟹ PRU inchangé à 80 €.
    expect(pos.pru).toBeCloseTo(80, 6);
  });

  it("ignore un split sur une ligne sans titre plutôt que de produire un PRU infini", () => {
    const journal = [split("s1", "2026-03-01", "AI.PA", 10)];
    expect(rebuildPositionsFromOperations(journal, [])).toEqual([]);
  });

  it("ne touche pas aux autres lignes", () => {
    const journal = [split("s1", "2026-03-01", "AI.PA", 2), achat("a1", "2026-01-05", "MC.PA", 2, 600)];
    const positions = rebuildPositionsFromOperations(journal, [
      { id: "p1", ticker: "MC.PA", quantity: 2, pru: 600 },
    ]);
    const mc = positions.find((p) => p.ticker === "MC.PA");
    expect(mc.quantity).toBeCloseTo(2, 6);
    expect(mc.pru).toBeCloseTo(600, 6);
  });
});

describe("triPosition avec split", () => {
  it("réconcilie la quantité et reste calculable après un split", () => {
    // Sans prise en compte du split, le journal compterait 10 titres face à une
    // position de 20 : la ligne serait déclarée incomplète et aucun TRI ne
    // s'afficherait, alors que l'historique est parfaitement connu.
    const operations = [
      split("s1", "2026-03-01", "AI.PA", 2),
      achat("a1", "2025-01-05", "AI.PA", 10, 160),
    ];
    const position = { ticker: "AI.PA", quantity: 20, pru: 80, current_price: 95 };

    const r = triPosition(position, operations, { aujourdhui: "2026-08-12" });

    expect(r.quantiteJournal).toBeCloseTo(20, 6);
    expect(r.complet).toBe(true);
    expect(r.tri).not.toBeNull();
    // 1 600 € investis, 1 900 € de valeur après ~19 mois : rendement positif.
    expect(r.tri).toBeGreaterThan(0);
  });
});
