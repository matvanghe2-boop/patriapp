import { describe, it, expect } from "vitest";
import { historiqueExemple, operationsExemple, objectifExemple } from "./jeuExemple";
import { cascadeMensuelle } from "./cascade";
import { serieTrajectoire } from "./objectifs";
import { applyOperationsToBourse, rebaselineLedger } from "./finance";

const AUJOURDHUI = "2026-10-20";

describe("jeu d'exemple", () => {
  it("couvre l'année écoulée, sans dépasser aujourd'hui", () => {
    const h = historiqueExemple(AUJOURDHUI);
    expect(h).toHaveLength(52);
    expect(h[0].date).toBe("2025-10-21");
    expect(h.at(-1).date < AUJOURDHUI).toBe(true);
    // La forme exacte qu'écrit l'application.
    expect(Object.keys(h[0]).sort()).toEqual(["date", "id", "label", "value"]);
  });

  it("donne deux fois la même courbe : rien n'est tiré au hasard", () => {
    expect(historiqueExemple(AUJOURDHUI)).toEqual(historiqueExemple(AUJOURDHUI));
  });

  it("nourrit la cascade et la trajectoire, qui restaient vides", () => {
    const historique = historiqueExemple(AUJOURDHUI);
    const operations = operationsExemple(AUJOURDHUI);
    const mois = cascadeMensuelle({ historique, operations, mois: 6 });
    expect(mois.length).toBeGreaterThanOrEqual(5);
    // Chaque mois porte son versement de 300 € : la cascade le sépare bien
    // de la performance.
    expect(mois.every((m) => m.versements === 300)).toBe(true);

    const serie = serieTrajectoire(objectifExemple(AUJOURDHUI), {
      historique,
      patrimoineActuel: 39000,
      aujourdhui: AUJOURDHUI,
    });
    expect(serie.filter((p) => p.reel != null).length).toBeGreaterThan(10);
  });

  it("ne touche ni aux positions ni à la poche cash une fois gelé", () => {
    // Les opérations d'exemple sont un PASSÉ : rejouées, elles écraseraient
    // les positions du jeu.
    const bourse = {
      cash_pocket: 500,
      positions: [{ id: "ai", ticker: "AI.PA", quantity: 15, pru: 160, current_price: 175 }],
    };
    const gele = rebaselineLedger({ ...bourse, operations: operationsExemple(AUJOURDHUI) });
    const rejoue = applyOperationsToBourse(gele, gele.operations);
    expect(rejoue.cash_pocket).toBe(500);
    expect(rejoue.positions.find((p) => p.ticker === "AI.PA").quantity).toBe(15);
  });
});
