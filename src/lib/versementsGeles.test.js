import { describe, it, expect } from "vitest";
import {
  applyOperationsToBourse, rebaselineLedger, computeInvestedCapital, investedCapitalAsOf,
  socleAuJour, operationsGeleesApres, computeBestWorst, computeTWR, avecIndicePerformance,
  computeMaxDrawdown, rebaseTo100, computeDailyReturns,
} from "./finance";
import { reconstituer } from "./rattrapage";

/*
 * Scénario rapporté, rejoué pas à pas :
 *
 *   1. un portefeuille de 12 800 € dont 12 000 € versés ;
 *   2. versement de 2 000 € le 20/10, saisi dans Opérations ;
 *   3. achat de 10 titres à 150 € le même jour ;
 *   4. une ligne retouchée à la main — ce qui REPOSE la ligne de base et gèle
 *      le versement et l'achat dans le socle.
 *
 * Avant correctif, l'étape 4 rendait la courbe « Capital investi » plate :
 * le versement était lu comme +2 000 € de performance le 20/10.
 */
function scenario() {
  let bourse = {
    positions: [{ id: "a", ticker: "AAA", quantity: 100, pru: 110, current_price: 120 }],
    operations: [],
    cash_pocket: 800,
    peaVersements: 12000,
  };
  bourse = applyOperationsToBourse(bourse, [
    { id: "v1", date: "2026-10-20", type: "VERSEMENT", amount: 2000, montantNet: 2000, origine: "saisie" },
  ]);
  bourse = applyOperationsToBourse(bourse, [
    { id: "b1", date: "2026-10-20", type: "ACHAT", asset: "BBB", quantity: 10, price: 150, fees: 0 },
    ...bourse.operations,
  ]);
  // Retouche manuelle d'une position : la ligne de base est reposée.
  bourse = rebaselineLedger({
    ...bourse,
    positions: bourse.positions.map((p) => (p.ticker === "AAA" ? { ...p, current_price: 121 } : p)),
  });
  return bourse;
}

describe("versements gelés dans la ligne de base", () => {
  it("le scénario gèle bien le versement (sinon le test ne prouverait rien)", () => {
    const bourse = scenario();
    expect(bourse.ledgerBaseline.operationIds).toContain("v1");
    expect(bourse.cash_pocket).toBe(1300);
  });

  it("la courbe Capital investi monte LE JOUR du versement, pas avant", () => {
    const capital = computeInvestedCapital(scenario());
    expect(investedCapitalAsOf(capital, "2026-10-19")).toBe(12000);
    expect(investedCapitalAsOf(capital, "2026-10-20")).toBe(14000);
  });

  it("le versement n'est plus compté comme performance", () => {
    const capital = computeInvestedCapital(scenario());
    // 19/10 : 100 × 120 + 800 de cash. 20/10 : 100 × 121 + 10 × 150 + 1 300.
    const history = [
      { date: "2026-09-19", valeur: 12700 },
      { date: "2026-10-19", valeur: 12800 },
      { date: "2026-10-20", valeur: 14900 },
    ].map((h) => ({ ...h, capital: investedCapitalAsOf(capital, h.date) }));

    const jour = computeDailyReturns(history).find((d) => d.date === "2026-10-20");
    // +100 € de marché sur 12 800 € : +0,78 %, et non +16,4 %.
    expect(jour.r).toBeCloseTo((100 / 12800) * 100, 6);
    expect(computeBestWorst(history).bestDay.r).toBeLessThan(1);
    expect(computeTWR(history).totalReturnPct).toBeLessThan(2);
  });

  it("le socle ramené au 19/10 n'a ni le versement ni l'achat", () => {
    const bourse = scenario();
    expect(operationsGeleesApres(bourse, "2026-10-19").map((o) => o.id).sort()).toEqual(["b1", "v1"]);
    const { lots, cash } = socleAuJour(bourse, "2026-10-19");
    expect(cash).toBe(800);
    expect(lots.BBB.quantity).toBe(0);
    expect(lots.AAA.quantity).toBe(100);
    // Le jour même, rien à défaire.
    expect(socleAuJour(bourse, "2026-10-20").cash).toBe(1300);
  });

  it("le recalcul d'un relevé antérieur n'y ajoute plus les 2 000 € versés après", () => {
    const [releve] = reconstituer({
      bourse: scenario(),
      dates: ["2026-10-19"],
      clotures: { AAA: { "2026-10-19": 120 }, BBB: { "2026-10-19": 150 } },
    });
    expect(releve.valeur).toBe(12800);
    expect(releve.capital).toBe(12000);
  });
});

describe("avecIndicePerformance", () => {
  const HISTO = [
    { date: "2026-10-16", valeur: 12000, capital: 12000 },
    { date: "2026-10-19", valeur: 11000, capital: 12000 },
    // Versement de 2 000 € : la valeur passe à 13 000 sans gain de marché.
    { date: "2026-10-20", valeur: 13000, capital: 14000 },
  ];

  it("ignore le versement : l'indice ne bouge qu'avec le marché", () => {
    const res = avecIndicePerformance(HISTO);
    expect(res.map((h) => h.indice)).toEqual([100, expect.closeTo(91.667, 2), expect.closeTo(91.667, 2)]);
  });

  it("un versement ne met plus fin à un drawdown", () => {
    const perf = avecIndicePerformance(HISTO).map((h) => ({ ...h, valeur: h.indice }));
    expect(computeMaxDrawdown(perf).stillInDrawdown).toBe(true);
    // Sur la valeur brute, 13 000 > 12 000 aurait clos le drawdown.
    expect(computeMaxDrawdown(HISTO).stillInDrawdown).toBe(false);
  });

  it("la base 100 du portefeuille ne bondit plus le jour du versement", () => {
    const perf = avecIndicePerformance(HISTO).map((h) => ({ ...h, valeur: h.indice }));
    const base = rebaseTo100(perf, ["valeur"]);
    expect(base.at(-1).valeur).toBeCloseTo(base.at(-2).valeur, 6);
  });

  it("garde l'indice précédent sur un relevé sans valeur", () => {
    const res = avecIndicePerformance([
      { date: "2026-01-01", valeur: 100, capital: 100 },
      { date: "2026-01-02", valeur: 0, capital: 100 },
      { date: "2026-01-03", valeur: 110, capital: 100 },
    ]);
    expect(res[1].indice).toBe(100);
  });
});
