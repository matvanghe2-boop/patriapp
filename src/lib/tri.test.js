import { describe, it, expect } from "vitest";
import { triPosition, tauxRendementInterne, createLedgerBaseline, todayIso } from "./finance";

const POSITION = { ticker: "CW8.PA", quantity: 30, pru: 420, current_price: 465 };

describe("tauxRendementInterne", () => {
  it("annualise un doublement en trois ans", () => {
    const t = tauxRendementInterne([
      { date: "2022-01-01", montant: -1000 },
      { date: "2025-01-01", montant: 2000 },
    ]);
    expect(t).toBeCloseTo(26, 0);
  });

  it("rend null sans flux dans les deux sens", () => {
    // Sans décaissement, aucun taux ne peut annuler la valeur actuelle nette.
    expect(tauxRendementInterne([
      { date: "2022-01-01", montant: 100 },
      { date: "2025-01-01", montant: 200 },
    ])).toBeNull();
  });

  it("rend null sur une période trop courte pour être annualisée", () => {
    expect(tauxRendementInterne([
      { date: "2025-01-01", montant: -100 },
      { date: "2025-01-10", montant: 110 },
    ])).toBeNull();
  });

  it("gère une perte", () => {
    const t = tauxRendementInterne([
      { date: "2023-01-01", montant: -1000 },
      { date: "2025-01-01", montant: 810 },
    ]);
    expect(t).toBeCloseTo(-10, 0);
  });
});

describe("triPosition — journal incomplet", () => {
  it("ne rend aucun taux quand le journal ne couvre pas la position", () => {
    // C'est le cas qui produisait des TRI de plusieurs centaines de pourcents :
    // une seule petite opération récente, puis la valeur TOTALE d'aujourd'hui.
    const partiel = [{ date: "2026-06-01", asset: "CW8.PA", type: "ACHAT", quantity: 1, price: 460, fees: 2 }];
    const r = triPosition(POSITION, partiel, { aujourdhui: "2026-08-10" });
    expect(r.complet).toBe(false);
    expect(r.tri).toBeNull();
    expect(r.quantiteJournal).toBe(1);
    expect(r.quantitePosition).toBe(30);
  });

  it("ne rend aucun taux sans aucune opération", () => {
    expect(triPosition(POSITION, []).complet).toBe(false);
  });

  it("ne rend aucun taux sur une position sans ticker", () => {
    expect(triPosition({ quantity: 10 }, []).tri).toBeNull();
  });
});

describe("triPosition — journal complet", () => {
  it("calcule un taux plausible quand tous les ordres sont saisis", () => {
    const complet = [{ date: "2023-01-15", asset: "CW8.PA", type: "ACHAT", quantity: 30, price: 420, fees: 5 }];
    const r = triPosition(POSITION, complet, { aujourdhui: "2026-08-10" });
    expect(r.complet).toBe(true);
    // 12 600 € investis, 13 950 € aujourd'hui, sur 3 ans et demi : ~3 %/an.
    expect(r.tri).toBeGreaterThan(1);
    expect(r.tri).toBeLessThan(5);
  });

  it("intègre les dividendes encaissés", () => {
    const base = [{ date: "2023-01-15", asset: "CW8.PA", type: "ACHAT", quantity: 30, price: 420, fees: 5 }];
    const avecDiv = [...base, { date: "2024-06-01", asset: "CW8.PA", type: "DIVIDENDE", amount: 400 }];
    const sans = triPosition(POSITION, base, { aujourdhui: "2026-08-10" }).tri;
    const avec = triPosition(POSITION, avecDiv, { aujourdhui: "2026-08-10" }).tri;
    expect(avec).toBeGreaterThan(sans);
  });

  it("tient compte des ventes partielles", () => {
    const position = { ticker: "CW8.PA", quantity: 20, pru: 420, current_price: 465 };
    const ops = [
      { date: "2023-01-15", asset: "CW8.PA", type: "ACHAT", quantity: 30, price: 420, fees: 5 },
      { date: "2025-01-15", asset: "CW8.PA", type: "VENTE", quantity: 10, price: 450, fees: 5 },
    ];
    const r = triPosition(position, ops, { aujourdhui: "2026-08-10" });
    expect(r.complet).toBe(true);
    expect(r.quantiteJournal).toBe(20);
  });

  it("ignore les opérations d'un autre actif", () => {
    const ops = [
      { date: "2023-01-15", asset: "CW8.PA", type: "ACHAT", quantity: 30, price: 420, fees: 5 },
      { date: "2023-02-15", asset: "AI.PA", type: "ACHAT", quantity: 100, price: 150, fees: 5 },
    ];
    expect(triPosition(POSITION, ops, { aujourdhui: "2026-08-10" }).quantiteJournal).toBe(30);
  });
});

describe("triPosition — ligne de base du journal", () => {
  const baseline = { at: "2023-01-15", lots: { "CW8.PA": { quantity: 29, pru: 419, totalBuyFees: 5 } } };

  it("réinjecte l'ouverture figée par la ligne de base", () => {
    // Le journal ne contient qu'un achat d'un titre, mais la ligne de base
    // porte les 29 autres : ensemble, ils reconstituent la position.
    const partiel = [{ date: "2026-06-01", asset: "CW8.PA", type: "ACHAT", quantity: 1, price: 460, fees: 2 }];
    const r = triPosition(POSITION, partiel, { baseline, aujourdhui: "2026-08-10" });
    expect(r.complet).toBe(true);
    expect(r.quantiteJournal).toBe(30);
    expect(r.tri).toBeGreaterThan(0);
    expect(r.tri).toBeLessThan(10);
  });

  it("reste incomplet si la ligne de base ne suffit pas", () => {
    const insuffisante = { at: "2023-01-15", lots: { "CW8.PA": { quantity: 5, pru: 419 } } };
    const r = triPosition(POSITION, [], { baseline: insuffisante, aujourdhui: "2026-08-10" });
    expect(r.complet).toBe(false);
  });

  it("tolère un écart d'arrondi sur les fractions de titre", () => {
    const position = { ticker: "X", quantity: 10.004, pru: 100, current_price: 120 };
    const ops = [{ date: "2023-01-15", asset: "X", type: "ACHAT", quantity: 10, price: 100, fees: 0 }];
    expect(triPosition(position, ops, { aujourdhui: "2026-08-10" }).complet).toBe(true);
  });
});

describe("triPosition — régressions du calcul par ligne", () => {
  it("ne compte pas deux fois les opérations déjà figées dans la ligne de base", () => {
    // C'est LE bug qui masquait le TRI de presque toutes les lignes.
    //
    // `createLedgerBaseline` fige les opérations déjà absorbées en mémorisant
    // leurs identifiants dans `operationIds` ; tout le reste de l'application
    // les écarte ensuite via `operationsAfterBaseline`. `triPosition` était le
    // seul endroit à rejouer le journal ENTIER par-dessus la ligne de base :
    // la quantité ressortait doublée, la réconciliation échouait, et la ligne
    // était rangée parmi les « journaux incomplets » alors qu'elle était
    // parfaitement complète.
    const ops = [{ id: "o1", date: "2023-01-15", asset: "CW8.PA", type: "ACHAT", quantity: 30, price: 420, fees: 5 }];
    const baseline = {
      at: "2023-01-15",
      operationIds: ["o1"],
      lots: { "CW8.PA": { quantity: 30, pru: 420, totalBuyFees: 5, at: "2023-01-15" } },
    };
    const r = triPosition(POSITION, ops, { baseline, aujourdhui: "2026-08-10" });
    expect(r.quantiteJournal).toBe(30);
    expect(r.complet).toBe(true);
    expect(r.tri).toBeGreaterThan(0);
  });

  it("date l'ouverture à l'ancre de la ligne, pas au jour de sa création", () => {
    // Second bug : `createLedgerBaseline` posait `at: todayIso()`, et le solde
    // fictif de clôture est daté d'aujourd'hui lui aussi. La série couvrait
    // donc ZÉRO jour, et `tauxRendementInterne` refusait — à juste titre —
    // d'annualiser. Résultat : aucune ligne n'affichait de TRI.
    const baseline = {
      at: "2026-08-10",
      operationIds: [],
      lots: { "CW8.PA": { quantity: 30, pru: 420, totalBuyFees: 0, at: "2023-01-15" } },
    };
    const r = triPosition(POSITION, [], { baseline, aujourdhui: "2026-08-10" });
    expect(r.complet).toBe(true);
    expect(r.tri).not.toBeNull();
    expect(r.tri).toBeGreaterThan(0);
  });

  it("signale que le taux repose sur une ancre et non sur un achat daté", () => {
    // Une position saisie à la main n'a pas de date d'acquisition connue :
    // l'ancre est une approximation, et l'interface doit pouvoir le dire au
    // lieu de présenter un chiffre qui a l'air exact.
    const baseline = {
      at: "2023-01-15",
      operationIds: [],
      lots: { "CW8.PA": { quantity: 30, pru: 420, totalBuyFees: 0, at: "2023-01-15" } },
    };
    const ancre = triPosition(POSITION, [], { baseline, aujourdhui: "2026-08-10" });
    expect(ancre.approxime).toBe(true);

    const journal = [{ date: "2023-01-15", asset: "CW8.PA", type: "ACHAT", quantity: 30, price: 420, fees: 5 }];
    const exact = triPosition(POSITION, journal, { aujourdhui: "2026-08-10" });
    expect(exact.approxime).toBe(false);
  });
});

describe("createLedgerBaseline — ancrage des lots", () => {
  it("préserve la date d'ancrage d'un lot déjà connu", () => {
    // `rebaselineLedger` est appelé à CHAQUE retouche manuelle d'une position.
    // Si l'ancre repartait à aujourd'hui, corriger un cours suffisait à
    // effacer l'ancienneté de la ligne et donc son TRI.
    const precedente = {
      at: "2023-01-15",
      lots: { "CW8.PA": { quantity: 29, pru: 419, totalBuyFees: 5, at: "2023-01-15" } },
    };
    const bourse = {
      positions: [{ ticker: "CW8.PA", quantity: 30, pru: 420 }],
      operations: [],
      ledgerBaseline: precedente,
    };
    const suivante = createLedgerBaseline(bourse);
    expect(suivante.lots["CW8.PA"].at).toBe("2023-01-15");
    expect(suivante.lots["CW8.PA"].quantity).toBe(30);
  });

  it("ancre un lot inconnu sur sa plus ancienne opération", () => {
    const bourse = {
      positions: [{ ticker: "AI.PA", quantity: 10, pru: 150 }],
      operations: [
        { id: "a", date: "2024-05-02", asset: "AI.PA", type: "ACHAT", quantity: 4, price: 150 },
        { id: "b", date: "2022-09-30", asset: "AI.PA", type: "ACHAT", quantity: 6, price: 140 },
      ],
    };
    expect(createLedgerBaseline(bourse).lots["AI.PA"].at).toBe("2022-09-30");
  });

  it("retombe sur aujourd'hui pour une ligne sans passé connu", () => {
    const bourse = { positions: [{ ticker: "NEW.PA", quantity: 1, pru: 10 }], operations: [] };
    expect(createLedgerBaseline(bourse).lots["NEW.PA"].at).toBe(todayIso());
  });
});
