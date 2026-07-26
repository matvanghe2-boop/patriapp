import { describe, it, expect } from "vitest";
import {
  projectCompound,
  monthlyPayment,
  weightedAverageRate,
  upsertByDate,
  rebaseTo100,
  solveMonthlyForTarget,
  assuranceMensuelle,
  applyInflation,
  dividendYieldOnPrice,
  dividendYieldOnCost,
  computeBuyOperation,
  computeSellOperation,
  computeDividendSummary,
  generateOperationHash,
  sanitizeOperation,
  computeDailyReturns,
  computeTWR,
  computeXIRR,
  computeVolatility,
  computeMaxDrawdown,
  computeDrawdownSeries,
  computeBestWorst,
  computeAlphaBeta,
  computeContribution,
  computeRollingPerformance,
  computeFeeEfficiency,
  computeTSR,
  computeDiversificationScore,
  filterHistoryByRange,
  guessEnvelope,
  computePeaAge,
  computeSharpeRatio,
  MIN_DAYS_FOR_ANNUALIZATION,
} from "./finance";

// Ces calculs pilotent des décisions financières réelles (mensualité de crédit,
// PRU, plus-value imposable) : chaque formule est vérifiée contre une valeur
// calculée à la main, pas contre sa propre implémentation.

describe("projectCompound", () => {
  it("renvoie années 0..n incluses", () => {
    expect(projectCompound(1000, 5, 0, 3)).toHaveLength(4);
  });

  it("capitalise sans versement : 1000 à 5 % sur 2 ans = 1102,50", () => {
    const data = projectCompound(1000, 5, 0, 2);
    expect(data[2].total).toBeCloseTo(1102.5, 2);
    expect(data[2].versed).toBe(1000);
    expect(data[2].interets).toBeCloseTo(102.5, 2);
  });

  it("gère un taux nul sans division par zéro", () => {
    const data = projectCompound(1000, 0, 100, 2);
    expect(data[2].total).toBe(1000 + 2400);
    expect(data[2].interets).toBe(0);
  });

  it("ajoute les versements annualisés : 100 €/mois à 10 % sur 2 ans", () => {
    // P = 1200/an ; Vf = 0 + 1200 * ((1,1^2 - 1)/0,1) = 1200 * 2,1 = 2520
    const data = projectCompound(0, 10, 100, 2);
    expect(data[2].total).toBeCloseTo(2520, 6);
  });

  it("traite les entrées absentes comme des zéros", () => {
    const data = projectCompound(undefined, undefined, undefined, undefined);
    expect(data).toEqual([{ year: 0, total: 0, versed: 0, interets: 0 }]);
  });
});

describe("monthlyPayment", () => {
  it("calcule une mensualité de prêt classique (200 000 € à 3,5 % sur 20 ans)", () => {
    // Valeur de référence : 1159,92 €/mois
    expect(monthlyPayment(200000, 3.5, 20)).toBeCloseTo(1159.92, 1);
  });

  it("à taux nul, répartit le capital linéairement", () => {
    expect(monthlyPayment(12000, 0, 1)).toBe(1000);
  });

  it("renvoie 0 pour un capital nul ou négatif", () => {
    expect(monthlyPayment(0, 3, 20)).toBe(0);
    expect(monthlyPayment(-5000, 3, 20)).toBe(0);
  });

  it("la somme des mensualités dépasse le capital emprunté", () => {
    const m = monthlyPayment(100000, 4, 15);
    expect(m * 15 * 12).toBeGreaterThan(100000);
  });
});

describe("weightedAverageRate", () => {
  it("pondère par le capital, pas par le nombre de lignes", () => {
    const items = [
      { balance: 9000, rate: 0.01 },
      { balance: 1000, rate: 0.05 },
    ];
    // (9000*0,01 + 1000*0,05) / 10000 = 0,014
    expect(weightedAverageRate(items)).toBeCloseTo(0.014, 10);
  });

  it("renvoie 0 sur un total nul plutôt que NaN", () => {
    expect(weightedAverageRate([{ balance: 0, rate: 0.03 }])).toBe(0);
    expect(weightedAverageRate([])).toBe(0);
  });
});

describe("upsertByDate", () => {
  it("remplace l'entrée du même jour au lieu d'en créer une seconde", () => {
    const arr = [{ date: "2026-01-01", v: 1 }];
    const out = upsertByDate(arr, { date: "2026-01-01", v: 2 });
    expect(out).toHaveLength(1);
    expect(out[0].v).toBe(2);
  });

  it("insère et retrie une date antérieure", () => {
    const arr = [{ date: "2026-01-02", v: 2 }];
    const out = upsertByDate(arr, { date: "2026-01-01", v: 1 });
    expect(out.map((e) => e.date)).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("ne mute pas le tableau d'origine", () => {
    const arr = [{ date: "2026-01-01", v: 1 }];
    upsertByDate(arr, { date: "2026-01-01", v: 2 });
    expect(arr[0].v).toBe(1);
  });
});

describe("rebaseTo100", () => {
  it("démarre à la première date où TOUTES les séries sont disponibles", () => {
    const merged = [
      { date: "2026-01-01", a: 10, b: null },
      { date: "2026-01-02", a: 20, b: 50 },
      { date: "2026-01-03", a: 30, b: 100 },
    ];
    const out = rebaseTo100(merged, ["a", "b"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ date: "2026-01-02", a: 100, b: 100 });
    expect(out[1].a).toBeCloseTo(150, 6);
    expect(out[1].b).toBeCloseTo(200, 6);
  });

  it("renvoie un tableau vide si aucune date commune", () => {
    expect(rebaseTo100([{ date: "2026-01-01", a: 1, b: null }], ["a", "b"])).toEqual([]);
  });
});

describe("opérations boursières", () => {
  it("ACHAT : les frais sont amortis dans le nouveau PRU", () => {
    const r = computeBuyOperation(null, { quantity: 10, price: 100, fees: 5 });
    expect(r.newQuantity).toBe(10);
    expect(r.newPru).toBeCloseTo(100.5, 10); // (1000 + 5) / 10
    expect(r.montantNet).toBe(1005);
    expect(r.newTotalBuyFees).toBe(5);
  });

  it("ACHAT sur position existante : moyenne pondérée des PRU", () => {
    const pos = { quantity: 10, pru: 100, totalBuyFees: 0 };
    const r = computeBuyOperation(pos, { quantity: 10, price: 200, fees: 0 });
    expect(r.newQuantity).toBe(20);
    expect(r.newPru).toBe(150);
  });

  it("VENTE : ne modifie pas le PRU et déduit les frais du montant reçu", () => {
    const pos = { quantity: 10, pru: 100, totalBuyFees: 10 };
    const r = computeSellOperation(pos, { quantity: 5, price: 120, fees: 3 });
    expect(r.montantNet).toBe(597); // 5*120 - 3
    expect(r.newQuantity).toBe(5);
    // PV = (120-100)*5 - frais achat alloués (10/10*5=5) - frais vente 3 = 92
    expect(r.plusValueRealisee).toBeCloseTo(92, 10);
    expect(r.newTotalBuyFees).toBeCloseTo(5, 10);
  });

  it("VENTE à perte : plus-value négative", () => {
    const pos = { quantity: 10, pru: 100, totalBuyFees: 0 };
    expect(computeSellOperation(pos, { quantity: 10, price: 80 }).plusValueRealisee).toBe(-200);
  });

  it("VENTE totale : le stock de frais d'achat retombe à 0 sans passer négatif", () => {
    const pos = { quantity: 10, pru: 100, totalBuyFees: 10 };
    expect(computeSellOperation(pos, { quantity: 10, price: 100 }).newTotalBuyFees).toBe(0);
  });

  it("tolère des valeurs texte issues d'un formulaire", () => {
    const r = computeBuyOperation(null, { quantity: "10", price: "100", fees: "5" });
    expect(r.newPru).toBeCloseTo(100.5, 10);
  });
});

describe("generateOperationHash / sanitizeOperation", () => {
  it("normalise casse et espaces pour détecter les doublons", () => {
    const a = generateOperationHash({ date: "2026-01-01", asset: "Air Liquide", type: "achat", quantity: 10, price: 175.2 });
    const b = generateOperationHash({ date: "2026-01-01", asset: "AIRLIQUIDE", type: "ACHAT", quantity: 10, price: 175.2 });
    expect(a).toBe(b);
  });

  it("distingue deux ordres différents", () => {
    const a = generateOperationHash({ date: "2026-01-01", asset: "AI", type: "ACHAT", quantity: 10, price: 175 });
    const b = generateOperationHash({ date: "2026-01-01", asset: "AI", type: "VENTE", quantity: 10, price: 175 });
    expect(a).not.toBe(b);
  });

  it("ne persiste pas le nom du courtier", () => {
    const clean = sanitizeOperation({
      id: "1", date: "2026-01-01", asset: "AI", type: "ACHAT", quantity: 1, price: 10,
      fees: 0, broker: "Boursorama", accountNumber: "12345678",
    });
    expect(clean).not.toHaveProperty("broker");
    expect(clean).not.toHaveProperty("accountNumber");
    expect(clean.asset).toBe("AI");
  });
});

describe("dividendes", () => {
  it("rendement sur cours et sur prix de revient", () => {
    expect(dividendYieldOnPrice(5, 100)).toBe(5);
    expect(dividendYieldOnCost(5, 50)).toBe(10);
  });

  it("renvoie 0 plutôt qu'Infinity sur un dénominateur nul", () => {
    expect(dividendYieldOnPrice(5, 0)).toBe(0);
    expect(dividendYieldOnCost(5, 0)).toBe(0);
  });

  it("agrège le portefeuille", () => {
    const s = computeDividendSummary([
      { ticker: "A", quantity: 10, pru: 100, current_price: 200, annual_dividend: 5 },
    ]);
    expect(s.totalAnnualDividend).toBe(50);
    expect(s.monthlyAverage).toBeCloseTo(50 / 12, 10);
    expect(s.portfolioYieldOnValue).toBeCloseTo(2.5, 10);
    expect(s.portfolioYieldOnCost).toBeCloseTo(5, 10);
  });
});

// ─── Métriques de performance ────────────────────────────────────────────────

/** Historique synthétique : `days` jours consécutifs à partir de 2026-01-01. */
function makeHistory(values, { capital = null, startDay = 1 } = {}) {
  return values.map((valeur, i) => ({
    date: `2026-01-${String(startDay + i).padStart(2, "0")}`,
    valeur,
    ...(capital ? { capital: capital[i] } : {}),
  }));
}

describe("computeDailyReturns", () => {
  it("neutralise un apport de capital pour ne pas le compter en performance", () => {
    const history = [
      { date: "2026-01-01", valeur: 1000, capital: 1000 },
      { date: "2026-01-02", valeur: 2000, capital: 2000 }, // +1000 versés, 0 % de perf
    ];
    expect(computeDailyReturns(history)[0].r).toBeCloseTo(0, 10);
  });

  it("mesure la vraie performance hors flux", () => {
    const history = [
      { date: "2026-01-01", valeur: 1000, capital: 1000 },
      { date: "2026-01-02", valeur: 1100, capital: 1000 },
    ];
    expect(computeDailyReturns(history)[0].r).toBeCloseTo(10, 10);
  });

  it("renvoie un tableau vide en dessous de 2 points", () => {
    expect(computeDailyReturns([{ date: "2026-01-01", valeur: 1 }])).toEqual([]);
    expect(computeDailyReturns(null)).toEqual([]);
  });
});

describe("computeTWR", () => {
  it("refuse d'annualiser sur un historique trop court", () => {
    const twr = computeTWR(makeHistory([100, 102]));
    expect(twr.annualizedPct).toBeNull();
    expect(twr.reliable).toBe(false);
    expect(twr.totalReturnPct).toBeCloseTo(2, 6);
  });

  it("annualise au-delà du seuil", () => {
    const values = Array.from({ length: MIN_DAYS_FOR_ANNUALIZATION + 10 }, (_, i) => 100 + i);
    const history = values.map((valeur, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      valeur,
    }));
    const twr = computeTWR(history);
    expect(twr.reliable).toBe(true);
    expect(twr.annualizedPct).toBeGreaterThan(0);
  });

  it("renvoie null sans données", () => {
    expect(computeTWR([])).toBeNull();
  });
});

describe("computeVolatility", () => {
  it("renvoie null en dessous du seuil d'échantillon", () => {
    expect(computeVolatility(makeHistory([100, 101, 102]))).toBeNull();
  });

  it("renvoie 0 sur une série parfaitement stable", () => {
    const history = Array.from({ length: 40 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      valeur: 100,
    }));
    expect(computeVolatility(history)).toBeCloseTo(0, 10);
  });
});

describe("computeMaxDrawdown", () => {
  it("mesure la pire baisse depuis un plus haut", () => {
    const dd = computeMaxDrawdown(makeHistory([100, 120, 90, 130]));
    expect(dd.maxDrawdownPct).toBeCloseTo(-25, 6); // 120 -> 90
    expect(dd.troughDate).toBe("2026-01-03");
  });

  it("signale une baisse non encore récupérée", () => {
    const dd = computeMaxDrawdown(makeHistory([100, 120, 90]));
    expect(dd.stillInDrawdown).toBe(true);
    expect(dd.recoveryDays).toBeNull();
  });

  it("renvoie 0 sur une série qui ne fait que monter", () => {
    expect(computeMaxDrawdown(makeHistory([100, 110, 120])).maxDrawdownPct).toBe(0);
  });

  it("renvoie null en dessous de 2 points", () => {
    expect(computeMaxDrawdown([{ date: "2026-01-01", valeur: 100 }])).toBeNull();
  });
});

describe("computeDrawdownSeries", () => {
  it("est à 0 sur les nouveaux plus hauts et négatif en dessous", () => {
    const s = computeDrawdownSeries(makeHistory([100, 120, 90]));
    expect(s[1].ddPct).toBe(0);
    expect(s[2].ddPct).toBeCloseTo(-25, 6);
    expect(s[2].peak).toBe(120);
  });
});

describe("computeBestWorst", () => {
  it("identifie le meilleur et le pire jour", () => {
    const r = computeBestWorst(makeHistory([100, 110, 99]));
    expect(r.bestDay.r).toBeCloseTo(10, 6);
    expect(r.worstDay.r).toBeCloseTo(-10, 6);
  });
});

describe("computeAlphaBeta", () => {
  /** Historique portefeuille + indice dont les variations quotidiennes oscillent. */
  const makeIndexed = (leverage) => {
    let valeur = 100;
    let index = 3000;
    return Array.from({ length: 30 }, (_, i) => {
      const rb = i % 2 === 0 ? 0.01 : -0.005;
      const row = {
        date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
        valeur,
        sp500: index,
      };
      valeur *= 1 + rb * leverage;
      index *= 1 + rb;
      return row;
    });
  };

  it("trouve un bêta de 1 quand le portefeuille réplique l'indice", () => {
    const r = computeAlphaBeta(makeIndexed(1), "sp500");
    expect(r.beta).toBeCloseTo(1, 6);
    expect(r.alphaAnnualizedPct).toBeCloseTo(0, 4);
  });

  it("trouve un bêta de 2 sur un portefeuille deux fois plus volatil", () => {
    expect(computeAlphaBeta(makeIndexed(2), "sp500").beta).toBeCloseTo(2, 6);
  });

  it("renvoie null si l'indice de référence est figé (régression indéterminée)", () => {
    const plat = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      valeur: 100 + i,
      sp500: 3000,
    }));
    expect(computeAlphaBeta(plat, "sp500")).toBeNull();
  });

  it("renvoie null sur un échantillon trop petit", () => {
    expect(computeAlphaBeta(makeHistory([100, 101]), "sp500")).toBeNull();
  });
});

describe("computeXIRR", () => {
  it("renvoie null sur une période trop courte pour être annualisée", () => {
    expect(computeXIRR(makeHistory([100, 110], { capital: [100, 100] }))).toBeNull();
  });

  it("approche le taux réel sur un investissement unique doublé en un an", () => {
    const history = [
      { date: "2025-01-01", valeur: 1000, capital: 1000 },
      { date: "2026-01-01", valeur: 2000, capital: 1000 },
    ];
    expect(computeXIRR(history)).toBeCloseTo(100, 0);
  });
});

describe("computeSharpeRatio", () => {
  it("renvoie null quand l'historique ne permet pas d'annualiser", () => {
    expect(computeSharpeRatio(makeHistory([100, 101]))).toBeNull();
  });
});

describe("computeContribution", () => {
  it("classe les lignes par gain décroissant et répartit 100 %", () => {
    const c = computeContribution([
      { ticker: "A", name: "A", quantity: 10, pru: 100, current_price: 110 }, // +100
      { ticker: "B", name: "B", quantity: 10, pru: 100, current_price: 90 }, // -100
    ]);
    expect(c[0].ticker).toBe("A");
    expect(c[0].sharePct).toBeCloseTo(50, 6);
    expect(c[1].sharePct).toBeCloseTo(50, 6);
  });
});

describe("computeRollingPerformance", () => {
  it("renvoie null sur les fenêtres non couvertes par l'historique", () => {
    const r = computeRollingPerformance(makeHistory([100, 110]));
    expect(r.y1).toBeNull();
    expect(r.sinceOrigin).toBeCloseTo(10, 6);
  });
});

describe("computeFeeEfficiency", () => {
  it("rapporte les frais au gain total", () => {
    const r = computeFeeEfficiency([{ fees: 10, plusValueRealisee: 90 }], 10);
    expect(r.totalFees).toBe(10);
    expect(r.totalGain).toBe(100);
    expect(r.ratioPct).toBeCloseTo(10, 6);
  });

  it("renvoie null plutôt qu'une division par zéro", () => {
    expect(computeFeeEfficiency([], 0).ratioPct).toBeNull();
  });
});

describe("computeTSR", () => {
  it("le rendement dividendes inclus dépasse celui hors dividendes", () => {
    const history = [
      { date: "2026-01-01", valeur: 1000, capital: 1000 },
      { date: "2026-06-01", valeur: 1100, capital: 1000 },
    ];
    const r = computeTSR(history, [{ type: "DIVIDENDE", date: "2026-03-01", amount: 50 }]);
    expect(r.withoutDividends).toBeCloseTo(10, 6);
    expect(r.withDividends).toBeCloseTo(15, 6);
    expect(r.dividendsInPeriod).toBe(50);
  });

  it("ignore les dividendes hors période", () => {
    const history = [
      { date: "2026-01-01", valeur: 1000, capital: 1000 },
      { date: "2026-06-01", valeur: 1100, capital: 1000 },
    ];
    expect(computeTSR(history, [{ type: "DIVIDENDE", date: "2025-01-01", amount: 50 }]).dividendsInPeriod).toBe(0);
  });
});

describe("computeDiversificationScore", () => {
  it("donne 100 à une répartition parfaitement égale", () => {
    const r = computeDiversificationScore([
      { name: "a", value: 100 },
      { name: "b", value: 100 },
    ]);
    expect(r.score).toBeCloseTo(100, 6);
  });

  it("donne 0 sur une classe unique", () => {
    expect(computeDiversificationScore([{ name: "a", value: 100 }]).score).toBe(0);
  });

  it("gère un patrimoine vide sans NaN", () => {
    expect(computeDiversificationScore([]).score).toBe(0);
    expect(computeDiversificationScore(null).score).toBe(0);
  });

  it("pénalise une répartition déséquilibrée", () => {
    const desequilibre = computeDiversificationScore([
      { name: "a", value: 990 },
      { name: "b", value: 10 },
    ]);
    expect(desequilibre.score).toBeLessThan(20);
  });
});

describe("filterHistoryByRange", () => {
  const history = [
    { date: "2025-01-15", valeur: 1 },
    { date: "2026-01-15", valeur: 2 },
    { date: "2026-03-15", valeur: 3 },
  ];

  it("MAX ne filtre rien", () => {
    expect(filterHistoryByRange(history, "MAX")).toHaveLength(3);
  });

  it("YTD part du 1er janvier de la dernière date", () => {
    expect(filterHistoryByRange(history, "YTD").map((h) => h.date)).toEqual(["2026-01-15", "2026-03-15"]);
  });

  it("1M ne garde que le dernier mois", () => {
    expect(filterHistoryByRange(history, "1M")).toHaveLength(1);
  });
});

describe("guessEnvelope", () => {
  it.each([
    ["Assurance-Vie Linxea", "AV"],
    ["PEA Bourso", "PEA"],
    ["Mon PER", "PER"],
    ["Compte-titres ordinaire", "CTO"],
    ["Livret A", "Livret"],
    ["", "Livret"],
  ])("%s -> %s", (name, expected) => {
    expect(guessEnvelope(name)).toBe(expected);
  });

  it("ne confond pas « perso » avec un PER", () => {
    expect(guessEnvelope("Livret perso")).not.toBe("PER");
  });
});

describe("computePeaAge", () => {
  it("renvoie null sans date d'ouverture", () => {
    expect(computePeaAge(null)).toBeNull();
  });

  it("marque un PEA de plus de 5 ans comme fiscalement mûr", () => {
    const old = new Date();
    old.setFullYear(old.getFullYear() - 7);
    const r = computePeaAge(old.toISOString().slice(0, 10));
    expect(r.eligible).toBe(true);
    expect(r.monthsRemaining).toBe(0);
    expect(r.years).toBeGreaterThanOrEqual(6);
  });

  it("compte les mois restants pour un PEA récent", () => {
    const recent = new Date();
    recent.setFullYear(recent.getFullYear() - 1);
    const r = computePeaAge(recent.toISOString().slice(0, 10));
    expect(r.eligible).toBe(false);
    expect(r.monthsRemaining).toBeGreaterThan(0);
  });
});

describe("simulation", () => {
  it("solveMonthlyForTarget renvoie 0 si l'objectif est déjà atteint sans effort", () => {
    expect(
      solveMonthlyForTarget({ target: 1000, currentTotal: 5000, livretsRate: 0.02, bourseRate: 0.06, years: 5 })
    ).toBe(0);
  });

  it("solveMonthlyForTarget : le versement trouvé permet bien d'atteindre la cible", () => {
    const params = { target: 100000, currentTotal: 10000, livretsRate: 0.02, bourseRate: 0.06, years: 10 };
    const monthly = solveMonthlyForTarget(params);
    const t = (params.livretsRate + params.bourseRate) / 2;
    const growth = (1 + t) ** params.years;
    const projected = params.currentTotal * growth + (monthly * 12 * (growth - 1)) / t;
    expect(projected).toBeCloseTo(params.target, 4);
  });

  it("assuranceMensuelle : 200 000 € à 0,20 %/an = 33,33 €/mois", () => {
    expect(assuranceMensuelle(200000, 0.2)).toBeCloseTo(33.33, 2);
  });

  it("applyInflation érode le pouvoir d'achat des années futures", () => {
    const out = applyInflation([100, 100, 100], 10);
    expect(out[0]).toBe(100);
    expect(out[1]).toBeCloseTo(90.909, 3);
    expect(out[2]).toBeCloseTo(82.645, 3);
  });
});
