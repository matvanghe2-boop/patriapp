import { describe, it, expect } from "vitest";
import {
  computeCumulativeContributions,
  contributionsAsOf,
  computeInvestedCapital,
  investedCapitalAsOf,
  rebuildPositionsFromOperations,
  operationsAfterBaseline,
  applyOperationsToBourse,
  operationCashDelta,
  buildCashAdjustment,
  todayIso,
} from "./finance";

// Le journal d'opérations est la source de vérité : positions, PRU et poche de
// cash en sont redéduits. Ces tests verrouillent les invariants qui manquaient
// et qui laissaient l'affichage mentir — la courbe « Capital investi » ne peut
// pas descendre sans retrait, et supprimer une opération annule bien son effet.

describe("todayIso", () => {
  it("utilise le fuseau local, pas UTC", () => {
    // 1er mars à 00 h 30 en France : en UTC on est encore le 28 février.
    // C'est ce décalage qui faisait écraser le relevé de la veille.
    expect(todayIso(new Date(2026, 2, 1, 0, 30, 0))).toBe("2026-03-01");
  });
});

describe("operationCashDelta", () => {
  it("un achat sort de l'argent, une vente en fait rentrer", () => {
    expect(operationCashDelta({ type: "ACHAT", quantity: 10, price: 100, fees: 5 })).toBe(-1005);
    expect(operationCashDelta({ type: "VENTE", quantity: 10, price: 100, fees: 5 })).toBe(995);
  });

  it("dividendes et versements creditent, les retraits debitent", () => {
    expect(operationCashDelta({ type: "DIVIDENDE", amount: 42 })).toBe(42);
    expect(operationCashDelta({ type: "VERSEMENT", amount: 500 })).toBe(500);
    expect(operationCashDelta({ type: "RETRAIT", amount: 500 })).toBe(-500);
  });
});

describe("computeCumulativeContributions", () => {
  // Le journal est stocke du plus recent au plus ancien (chaque ordre est
  // ajoute en tete) : le cumul doit le retrier avant de sommer.
  const journal = [
    { id: "5", date: "2026-04-01", type: "VENTE", quantity: 5, price: 130, fees: 3 },
    { id: "4", date: "2026-03-01", type: "DIVIDENDE", amount: 42 },
    { id: "3", date: "2026-02-15", type: "ACHAT", quantity: 10, price: 100, fees: 5 },
    { id: "2", date: "2026-02-01", type: "VERSEMENT", amount: 1000 },
    { id: "1", date: "2026-01-01", type: "VERSEMENT", amount: 500 },
  ];

  it("est monotone non-decroissante malgre ventes, achats et ordre anti-chronologique", () => {
    const series = computeCumulativeContributions(journal);
    expect(series.length).toBeGreaterThan(0);
    for (let i = 1; i < series.length; i++) {
      expect(series[i].capital).toBeGreaterThanOrEqual(series[i - 1].capital);
    }
  });

  it("ne compte QUE les mouvements avec l'exterieur", () => {
    const series = computeCumulativeContributions(journal);
    // 500 + 1000 : l'achat, la vente et le dividende n'ajoutent rien.
    expect(series.at(-1).capital).toBe(1500);
    expect(series.map((p) => p.date)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("ne descend que sur un retrait explicite", () => {
    const series = computeCumulativeContributions([
      { id: "b", date: "2026-05-01", type: "RETRAIT", amount: 300 },
      { id: "a", date: "2026-01-01", type: "VERSEMENT", amount: 1000 },
    ]);
    expect(series.map((p) => p.capital)).toEqual([1000, 700]);
  });

  it("un arbitrage (vente puis rachat le meme jour) laisse le cumul plat", () => {
    const series = computeCumulativeContributions([
      { id: "c", date: "2026-06-01", type: "ACHAT", quantity: 8, price: 125, fees: 2 },
      { id: "b", date: "2026-06-01", type: "VENTE", quantity: 10, price: 100, fees: 2 },
      { id: "a", date: "2026-01-01", type: "VERSEMENT", amount: 1000 },
    ]);
    expect(series.at(-1).capital).toBe(1000);
  });

  it("contributionsAsOf renvoie le dernier palier atteint", () => {
    const series = computeCumulativeContributions(journal);
    expect(contributionsAsOf(series, "2025-12-31")).toBe(0);
    expect(contributionsAsOf(series, "2026-01-15")).toBe(500);
    expect(contributionsAsOf(series, "2026-12-31")).toBe(1500);
  });
});

describe("rebuildPositionsFromOperations", () => {
  it("rejoue achats et ventes dans l'ordre chronologique", () => {
    const ops = [
      { id: "2", date: "2026-02-01", type: "VENTE", asset: "AI.PA", quantity: 4, price: 180, fees: 0 },
      { id: "1", date: "2026-01-01", type: "ACHAT", asset: "AI.PA", quantity: 10, price: 160, fees: 0 },
    ];
    const [pos] = rebuildPositionsFromOperations(ops, [], {});
    expect(pos.ticker).toBe("AI.PA");
    expect(pos.quantity).toBe(6);
    expect(pos.pru).toBeCloseTo(160, 10); // une vente ne change pas le PRU
  });

  it("rejoue dans le bon ordre deux operations du meme jour", () => {
    // Stockees en tete de liste : la vente est la plus recente. Rejouee a
    // l'envers, elle serait rejetee faute de titres au compteur.
    const ops = [
      { id: "2", date: "2026-01-01", type: "VENTE", asset: "CW8.PA", quantity: 5, price: 470, fees: 0 },
      { id: "1", date: "2026-01-01", type: "ACHAT", asset: "CW8.PA", quantity: 10, price: 420, fees: 0 },
    ];
    const [pos] = rebuildPositionsFromOperations(ops, [], {});
    expect(pos.quantity).toBe(5);
  });

  it("preserve les metadonnees saisies a la main", () => {
    const current = [
      {
        id: "p1", ticker: "AI.PA", name: "Air Liquide", type: "Action",
        current_price: 175.2, annual_dividend: 3.2, quantity: 10, pru: 160,
      },
    ];
    const ops = [{ id: "1", date: "2026-01-01", type: "ACHAT", asset: "AI.PA", quantity: 5, price: 200, fees: 0 }];
    const [pos] = rebuildPositionsFromOperations(ops, current, { "AI.PA": { quantity: 10, pru: 160, totalBuyFees: 0 } });
    expect(pos.name).toBe("Air Liquide");
    expect(pos.current_price).toBe(175.2);
    expect(pos.annual_dividend).toBe(3.2);
    expect(pos.id).toBe("p1");
    expect(pos.quantity).toBe(15);
    expect(pos.pru).toBeCloseTo((10 * 160 + 5 * 200) / 15, 10);
  });

  it("laisse intacte une position qu'aucune operation ne concerne", () => {
    const current = [{ id: "p1", ticker: "CW8.PA", name: "Amundi MSCI World", quantity: 30, pru: 420 }];
    expect(rebuildPositionsFromOperations([], current, {})).toEqual(current);
  });

  it("supprime une position integralement soldee", () => {
    const current = [{ id: "p1", ticker: "AI.PA", quantity: 10, pru: 160 }];
    const ops = [{ id: "1", date: "2026-01-01", type: "VENTE", asset: "AI.PA", quantity: 10, price: 180, fees: 0 }];
    expect(rebuildPositionsFromOperations(ops, current, { "AI.PA": { quantity: 10, pru: 160, totalBuyFees: 0 } })).toEqual([]);
  });

  it("ignore une vente sans titres au compteur plutot que d'aller en negatif", () => {
    const ops = [{ id: "1", date: "2026-01-01", type: "VENTE", asset: "XXX", quantity: 10, price: 50, fees: 0 }];
    expect(rebuildPositionsFromOperations(ops, [], {})).toEqual([]);
  });
});

describe("applyOperationsToBourse", () => {
  const bourse = {
    cash_pocket: 500,
    positions: [{ id: "p1", ticker: "AI.PA", name: "Air Liquide", quantity: 10, pru: 160, current_price: 175 }],
    operations: [],
  };

  it("cree une ligne de base qui fige l'existant", () => {
    const next = applyOperationsToBourse(bourse, []);
    expect(next.ledgerBaseline.cashOpening).toBe(500);
    // Pas de total verse declare : on retombe sur l'estimation titres + cash.
    expect(next.ledgerBaseline.investedOpening).toBe(10 * 160 + 500);
    expect(next.positions).toHaveLength(1);
    expect(next.positions[0]).toMatchObject({
      id: "p1", ticker: "AI.PA", name: "Air Liquide", quantity: 10, pru: 160, current_price: 175,
    });
    expect(next.cash_pocket).toBe(500);
  });

  it("un achat debite la poche de cash", () => {
    const op = { id: "o1", date: "2026-01-05", type: "ACHAT", asset: "AI.PA", quantity: 1, price: 100, fees: 2 };
    const next = applyOperationsToBourse(bourse, [op]);
    expect(next.cash_pocket).toBe(500 - 102);
    expect(next.positions[0].quantity).toBe(11);
  });

  it("une vente recredite la poche de cash au lieu de faire disparaitre l'argent", () => {
    const op = { id: "o1", date: "2026-01-05", type: "VENTE", asset: "AI.PA", quantity: 5, price: 200, fees: 1 };
    const next = applyOperationsToBourse(bourse, [op]);
    expect(next.cash_pocket).toBe(500 + 999);
    expect(next.positions[0].quantity).toBe(5);
  });

  it("supprimer une operation annule integralement son effet comptable", () => {
    const op = { id: "o1", date: "2026-01-05", type: "ACHAT", asset: "AI.PA", quantity: 1, price: 100, fees: 2 };
    const withOp = applyOperationsToBourse(bourse, [op]);
    const without = applyOperationsToBourse(withOp, []);
    expect(without.cash_pocket).toBe(500);
    expect(without.positions[0].quantity).toBe(10);
    expect(without.positions[0].pru).toBeCloseTo(160, 10);
  });

  it("est idempotent : reappliquer le meme journal ne cumule pas les effets", () => {
    const op = { id: "o1", date: "2026-01-05", type: "ACHAT", asset: "AI.PA", quantity: 1, price: 100, fees: 2 };
    const once = applyOperationsToBourse(bourse, [op]);
    const twice = applyOperationsToBourse(once, [op]);
    expect(twice.cash_pocket).toBe(once.cash_pocket);
    expect(twice.positions[0].quantity).toBe(once.positions[0].quantity);
  });

  it("ne reinterprete jamais les operations anterieures a la ligne de base", () => {
    const legacy = { id: "old", date: "2025-06-01", type: "ACHAT", asset: "AI.PA", quantity: 99, price: 10, fees: 0 };
    const withHistory = { ...bourse, operations: [legacy] };
    const next = applyOperationsToBourse(withHistory, [legacy]);
    // Le portefeuille et le cash restent ceux que l'utilisateur voyait.
    expect(next.positions[0].quantity).toBe(10);
    expect(next.cash_pocket).toBe(500);
    expect(operationsAfterBaseline([legacy], next.ledgerBaseline)).toEqual([]);
  });
});

describe("buildCashAdjustment", () => {
  it("transforme une hausse manuelle du cash en versement date", () => {
    const mv = buildCashAdjustment(500, 1500, "2026-02-01");
    expect(mv.type).toBe("VERSEMENT");
    expect(mv.amount).toBe(1000);
    expect(mv.date).toBe("2026-02-01");
  });

  it("transforme une baisse en retrait", () => {
    expect(buildCashAdjustment(1500, 500).type).toBe("RETRAIT");
  });

  it("ignore un non-changement", () => {
    expect(buildCashAdjustment(500, 500)).toBeNull();
  });
});

describe("ancrage sur le total verse PEA saisi a la main", () => {
  // Le portefeuille vaut 1600 EUR de titres + 500 de cash, mais l'utilisateur
  // sait qu'il a reellement verse 12 000 EUR (le reste est de la plus-value,
  // ou des titres revendus). C'est SON chiffre qui fait foi.
  const bourse = {
    cash_pocket: 500,
    peaVersements: 12000,
    positions: [{ id: "p1", ticker: "AI.PA", quantity: 10, pru: 160, current_price: 175 }],
    operations: [],
  };

  it("ancre la courbe sur peaVersements plutot que sur une reconstitution", () => {
    expect(computeInvestedCapital(bourse).opening).toBe(12000);
    const next = applyOperationsToBourse(bourse, []);
    expect(next.ledgerBaseline.investedOpening).toBe(12000);
    expect(next.peaVersements).toBe(12000);
  });

  it("la courbe est correcte des le premier affichage, sans ligne de base", () => {
    expect(investedCapitalAsOf(computeInvestedCapital(bourse), "2026-01-01")).toBe(12000);
  });

  it("le total verse monte avec un apport de cash et descend avec un retrait", () => {
    const base = applyOperationsToBourse(bourse, []);
    const versement = { id: "v", date: "2026-02-01", type: "VERSEMENT", amount: 1000 };
    const apres = applyOperationsToBourse(base, [versement]);
    expect(apres.peaVersements).toBe(13000);
    expect(apres.cash_pocket).toBe(1500);

    const retrait = { id: "r", date: "2026-03-01", type: "RETRAIT", amount: 400 };
    const apres2 = applyOperationsToBourse(apres, [retrait, versement]);
    expect(apres2.peaVersements).toBe(12600);
    expect(apres2.cash_pocket).toBe(1100);
  });

  it("un achat ne gonfle pas le total verse : l'argent etait deja la", () => {
    const base = applyOperationsToBourse(bourse, []);
    const achat = { id: "a", date: "2026-02-01", type: "ACHAT", asset: "AI.PA", quantity: 2, price: 150, fees: 1 };
    const apres = applyOperationsToBourse(base, [achat]);
    expect(apres.peaVersements).toBe(12000);
    expect(apres.cash_pocket).toBe(500 - 301);
  });

  it("une vente ne fait pas descendre le total verse", () => {
    const base = applyOperationsToBourse(bourse, []);
    const vente = { id: "s", date: "2026-02-01", type: "VENTE", asset: "AI.PA", quantity: 10, price: 200, fees: 0 };
    const apres = applyOperationsToBourse(base, [vente]);
    expect(apres.peaVersements).toBe(12000);
    expect(apres.positions).toEqual([]);
    expect(apres.cash_pocket).toBe(2500);
  });
});

describe("computeInvestedCapital", () => {
  it("ne descend jamais apres une vente", () => {
    const start = {
      cash_pocket: 1000,
      positions: [{ id: "p1", ticker: "AI.PA", quantity: 10, pru: 100, current_price: 100 }],
      operations: [],
    };
    const sell = { id: "o1", date: "2026-03-01", type: "VENTE", asset: "AI.PA", quantity: 10, price: 120, fees: 0 };
    const after = applyOperationsToBourse(start, [sell]);

    const invested = computeInvestedCapital(after);
    const before = investedCapitalAsOf(invested, "2026-02-01");
    const afterSale = investedCapitalAsOf(invested, "2026-03-02");
    expect(afterSale).toBeGreaterThanOrEqual(before);
    expect(afterSale).toBe(2000); // 10*100 de titres + 1000 de cash, inchange
  });

  it("monte d'un versement et descend d'un retrait", () => {
    const start = { cash_pocket: 0, positions: [], operations: [] };
    const base = applyOperationsToBourse(start, []);
    const versement = { id: "v", date: "2026-01-01", type: "VERSEMENT", amount: 1000 };
    const retrait = { id: "r", date: "2026-06-01", type: "RETRAIT", amount: 400 };
    const after = applyOperationsToBourse(base, [retrait, versement]);

    const invested = computeInvestedCapital(after);
    expect(investedCapitalAsOf(invested, "2026-03-01")).toBe(1000);
    expect(investedCapitalAsOf(invested, "2026-07-01")).toBe(600);
    expect(after.cash_pocket).toBe(600);
  });
});
