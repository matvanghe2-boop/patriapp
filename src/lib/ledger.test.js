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
  buildCashMovement,
  versementsSuspects,
  convertirEnAjustements,
  totalCashDelta,
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

/**
 * Corriger la poche cash produisait un VERSEMENT ou un RETRAIT, c'est-à-dire
 * un mouvement d'argent entre le compte courant et le portefeuille. C'était
 * faux dans le cas le plus fréquent — on recale son solde parce qu'une vente
 * ou des frais ne tombaient pas juste — et cela faisait lire à la performance
 * une sortie d'argent qui n'avait jamais eu lieu.
 *
 * Ces tests décrivent le comportement voulu : la correction reste tracée,
 * parce que `cash_pocket` est rejoué depuis le journal, mais elle ne se fait
 * plus passer pour un flux externe.
 */
describe("buildCashAdjustment", () => {
  it("enregistre une hausse manuelle comme un ajustement, pas un versement", () => {
    const mv = buildCashAdjustment(500, 1500, "2026-02-01");
    expect(mv.type).toBe("AJUSTEMENT");
    expect(mv.amount).toBe(1000);
    expect(mv.date).toBe("2026-02-01");
    // La provenance est écrite : c'est elle qui permet de distinguer plus tard
    // cette écriture d'un versement réellement saisi.
    expect(mv.origine).toBe("ajustement-cash");
  });

  it("porte le sens de la correction dans un montant SIGNÉ", () => {
    const mv = buildCashAdjustment(1500, 500);
    expect(mv.type).toBe("AJUSTEMENT");
    // Un montant négatif, et non un second type : le solde descend de 1 000 €.
    expect(mv.amount).toBe(-1000);
  });

  it("ignore un non-changement", () => {
    expect(buildCashAdjustment(500, 500)).toBeNull();
  });

  it("déplace le solde sans compter comme capital investi", () => {
    const ajustement = buildCashAdjustment(0, 1000, "2026-02-01");
    // Il bouge bien la poche cash — sinon la correction ne tiendrait pas.
    expect(operationCashDelta(ajustement)).toBe(1000);
    // Mais il reste hors du capital investi, à la différence d'un versement.
    expect(computeCumulativeContributions([ajustement])).toEqual([]);
  });

  it("un vrai versement, lui, compte bien comme capital investi", () => {
    const versement = buildCashMovement({ type: "VERSEMENT", amount: 1000, date: "2026-02-01" });
    expect(versement.type).toBe("VERSEMENT");
    expect(operationCashDelta(versement)).toBe(1000);
    expect(computeCumulativeContributions([versement])).toEqual([
      { date: "2026-02-01", capital: 1000 },
    ]);
  });

  it("refuse de fabriquer un mouvement sans montant ni type valide", () => {
    expect(buildCashMovement({ type: "VERSEMENT", amount: 0 })).toBeNull();
    expect(buildCashMovement({ type: "AJUSTEMENT", amount: 100 })).toBeNull();
  });
});

/**
 * Réparation des écritures DÉJÀ enregistrées : c'est le pendant du correctif
 * ci-dessus pour les données existantes.
 */
describe("versementsSuspects / convertirEnAjustements", () => {
  it("reconnaît avec certitude une écriture marquée comme ajustement", () => {
    const ops = [
      { id: "a", date: "2026-08-29", type: "VERSEMENT", amount: 1000, montantNet: 1000, origine: "ajustement-cash" },
    ];
    const [suspect] = versementsSuspects(ops);
    expect(suspect.certitude).toBe("sure");
  });

  it("présume un ancien versement sans titre, ni prix, ni frais", () => {
    const ops = [
      { id: "b", date: "2026-08-29", type: "RETRAIT", asset: null, quantity: null, price: null, fees: 0, amount: 1000, montantNet: 1000 },
    ];
    const [suspect] = versementsSuspects(ops);
    expect(suspect.certitude).toBe("probable");
  });

  it("laisse tranquille un versement explicitement saisi", () => {
    const ops = [
      { id: "c", date: "2026-08-29", type: "VERSEMENT", amount: 1000, montantNet: 1000, origine: "saisie" },
    ];
    expect(versementsSuspects(ops)).toEqual([]);
  });

  it("ne touche ni aux achats ni aux ventes", () => {
    const ops = [{ id: "d", date: "2026-08-29", type: "VENTE", quantity: 10, price: 100, fees: 0 }];
    expect(versementsSuspects(ops)).toEqual([]);
  });

  it("convertit un RETRAIT en ajustement négatif, sans bouger le solde", () => {
    const ops = [
      { id: "e", date: "2026-08-29", type: "RETRAIT", asset: null, quantity: null, price: null, fees: 0, amount: 1000, montantNet: 1000 },
    ];
    const avant = totalCashDelta(ops);
    const apres = convertirEnAjustements(ops, ["e"]);
    expect(apres[0].type).toBe("AJUSTEMENT");
    expect(apres[0].amount).toBe(-1000);
    // Le solde est strictement identique : seule la NATURE de l'écriture
    // change. C'est ce qui rend la conversion sûre.
    expect(totalCashDelta(apres)).toBe(avant);
    // En revanche elle sort du capital investi, et c'est tout l'objectif.
    expect(computeCumulativeContributions(ops)).toHaveLength(1);
    expect(computeCumulativeContributions(apres)).toHaveLength(0);
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
