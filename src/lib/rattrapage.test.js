import { describe, it, expect } from "vitest";
import {
  plagePour,
  joursManquants,
  premierJourFiable,
  reconstituer,
  indexerClotures,
  datesCotees,
  ABSENCE_MAX_JOURS,
} from "./rattrapage";

const INDICES = { "^GSPC": "sp500", "^FCHI": "cac40", URTH: "msciWorld" };

/*
 * Les journaux de test portent TOUJOURS le versement qui finance les achats.
 * Sans lui la poche de cash part en négatif — arithmétiquement juste, puisque
 * `totalCashDelta` sort l'argent du compte à chaque achat, mais impossible en
 * vrai : on ne peut pas acheter avec un compte vide. Une fixture qui l'oublie
 * teste un état que l'application ne produit jamais.
 */

/** État `bourse` minimal : une ligne, un journal daté, pas de socle. */
const bourseSimple = (operations, positions) => ({
  positions,
  operations,
  cash_pocket: 0,
  ledgerBaseline: { at: "2026-01-01", lots: {}, cashOpening: 0 },
});

describe("plagePour", () => {
  it("prend la plage la plus courte qui couvre encore l'absence", () => {
    expect(plagePour(7)).toBe("1mo");
    expect(plagePour(25)).toBe("1mo");
    expect(plagePour(26)).toBe("3mo");
    expect(plagePour(200)).toBe("1y");
  });
});

describe("joursManquants", () => {
  const COTEES = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"];

  it("ne retient que les jours de cotation absents de l'historique", () => {
    const historique = [{ date: "2026-06-01" }, { date: "2026-06-03" }];
    expect(joursManquants(historique, COTEES, "2026-06-05")).toEqual(["2026-06-04"]);
  });

  it("ne remonte jamais avant le dernier relevé connu", () => {
    // Un trou antérieur ne vient pas d'une absence : soit l'historique
    // commençait plus tard, soit l'entrée a été supprimée à la main.
    const historique = [{ date: "2026-06-03" }];
    expect(joursManquants(historique, COTEES, "2026-06-05")).toEqual(["2026-06-04"]);
  });

  it("laisse le jour même au relevé, qui sait le prendre en direct", () => {
    const historique = [{ date: "2026-06-01" }];
    expect(joursManquants(historique, COTEES, "2026-06-04")).toEqual([
      "2026-06-02",
      "2026-06-03",
    ]);
  });

  it("ne fabrique aucun jour que la bourse n'a pas coté", () => {
    // Le 1er mai est un jour ouvré au calendrier mais absent de la série : il
    // ne doit pas apparaître comme un trou à combler, puisque rien ne pourra
    // jamais le remplir.
    const historique = [{ date: "2026-04-30" }];
    const cotees = ["2026-04-30", "2026-05-04"];
    expect(joursManquants(historique, cotees, "2026-05-05")).toEqual(["2026-05-04"]);
  });

  it("plafonne l'absence rattrapable", () => {
    const vieux = "2020-01-02";
    expect(joursManquants([], [vieux], "2026-06-05")).toEqual([]);
    expect(ABSENCE_MAX_JOURS).toBe(365);
  });

  it("part de zéro quand l'historique est vide", () => {
    expect(joursManquants([], COTEES, "2026-06-05")).toEqual(COTEES.slice(0, 4));
  });
});

describe("premierJourFiable", () => {
  it("rend la borne demandée en l'absence de division", () => {
    const ops = [{ type: "ACHAT", date: "2026-06-02", asset: "AAA" }];
    expect(premierJourFiable(ops, "2026-06-01")).toBe("2026-06-01");
  });

  it("recule la borne à la dernière division de la fenêtre", () => {
    const ops = [
      { type: "SPLIT", date: "2026-06-02", asset: "AAA" },
      { type: "SPLIT", date: "2026-06-04", asset: "BBB" },
    ];
    expect(premierJourFiable(ops, "2026-06-01")).toBe("2026-06-04");
  });

  it("ignore une division antérieure à la fenêtre", () => {
    const ops = [{ type: "SPLIT", date: "2025-01-10", asset: "AAA" }];
    expect(premierJourFiable(ops, "2026-06-01")).toBe("2026-06-01");
  });
});

describe("indexerClotures et datesCotees", () => {
  it("indexe par symbole puis par date, en ignorant les séries en échec", () => {
    const c = indexerClotures([
      { symbol: "AAA", ok: true, series: [{ date: "2026-06-02", close: 12 }] },
      { symbol: "BBB", ok: false, error: "HTTP 404", series: [] },
    ]);
    expect(c).toEqual({ AAA: { "2026-06-02": 12 } });
  });

  it("ramène un horodatage intraday à sa date, dernier point gagnant", () => {
    const c = indexerClotures([
      {
        symbol: "AAA",
        ok: true,
        series: [
          { date: "2026-06-02T09:00:00.000Z", close: 10 },
          { date: "2026-06-02T17:30:00.000Z", close: 11 },
        ],
      },
    ]);
    expect(c.AAA["2026-06-02"]).toBe(11);
  });

  it("réunit les dates de toutes les séries, triées et sans doublon", () => {
    expect(
      datesCotees({
        AAA: { "2026-06-03": 1, "2026-06-01": 1 },
        BBB: { "2026-06-02": 1, "2026-06-01": 1 },
      })
    ).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });
});

describe("reconstituer", () => {
  it("valorise chaque jour manquant à la clôture réelle", () => {
    const bourse = bourseSimple(
      [
        { id: "0", type: "VERSEMENT", date: "2026-05-01", amount: 1000 },
        { id: "1", type: "ACHAT", date: "2026-05-02", asset: "AAA", quantity: 10, price: 100, fees: 0 },
      ],
      [{ id: "p", ticker: "AAA", name: "AAA", quantity: 10, pru: 100, current_price: 130, currency: "EUR" }]
    );

    const releves = reconstituer({
      bourse,
      dates: ["2026-06-02", "2026-06-03"],
      clotures: {
        AAA: { "2026-06-02": 110, "2026-06-03": 120 },
        "^FCHI": { "2026-06-02": 8000, "2026-06-03": 8100 },
      },
      indices: INDICES,
    });

    expect(releves).toHaveLength(2);
    expect(releves[0]).toMatchObject({ date: "2026-06-02", valeur: 1100, cac40: 8000 });
    expect(releves[1]).toMatchObject({ date: "2026-06-03", valeur: 1200, cac40: 8100 });
  });

  it("marque chaque entrée comme reconstituée", () => {
    const bourse = bourseSimple(
      [],
      [{ id: "p", ticker: "AAA", quantity: 10, pru: 100, current_price: 130, currency: "EUR" }]
    );
    const releves = reconstituer({
      bourse,
      dates: ["2026-06-02"],
      clotures: { AAA: { "2026-06-02": 110 } },
    });
    expect(releves[0].reconstitue).toBe(true);
  });

  it("tient compte de l'état du portefeuille CE JOUR-LÀ, pas d'aujourd'hui", () => {
    // L'achat du 3 juin ne doit peser ni sur les titres ni sur la poche de
    // cash du 2 juin : les deux se rejouent à la date.
    const bourse = bourseSimple(
      [
        { id: "0", type: "VERSEMENT", date: "2026-06-01", amount: 2000 },
        { id: "1", type: "ACHAT", date: "2026-06-01", asset: "AAA", quantity: 10, price: 100, fees: 0 },
        { id: "2", type: "ACHAT", date: "2026-06-03", asset: "AAA", quantity: 10, price: 100, fees: 0 },
      ],
      [{ id: "p", ticker: "AAA", quantity: 20, pru: 100, current_price: 110, currency: "EUR" }]
    );

    const releves = reconstituer({
      bourse,
      dates: ["2026-06-02", "2026-06-03"],
      clotures: { AAA: { "2026-06-02": 110, "2026-06-03": 110 } },
    });

    expect(releves[0].valeur).toBe(2100); // 10 titres à 110 + 1000 encore en cash
    expect(releves[1].valeur).toBe(2200); // 20 titres à 110, poche vidée
  });

  it("suit le capital versé à la date, et non le cumul final", () => {
    const bourse = bourseSimple(
      [
        { id: "1", type: "VERSEMENT", date: "2026-06-01", amount: 1000 },
        { id: "2", type: "VERSEMENT", date: "2026-06-03", amount: 500 },
      ],
      []
    );
    const releves = reconstituer({
      bourse,
      dates: ["2026-06-02", "2026-06-03"],
      clotures: { AAA: {} },
    });
    expect(releves.map((r) => r.capital)).toEqual([1000, 1500]);
  });

  it("saute une journée dont un cours manque, plutôt que de la valoriser à moitié", () => {
    const bourse = bourseSimple(
      [],
      [
        { id: "p1", ticker: "AAA", quantity: 10, pru: 100, current_price: 110, currency: "EUR" },
        { id: "p2", ticker: "BBB", quantity: 5, pru: 50, current_price: 60, currency: "EUR" },
      ]
    );
    const releves = reconstituer({
      bourse,
      dates: ["2026-06-02", "2026-06-03"],
      clotures: {
        AAA: { "2026-06-02": 110, "2026-06-03": 120 },
        BBB: { "2026-06-03": 60 }, // le 2 manque
      },
    });
    expect(releves.map((r) => r.date)).toEqual(["2026-06-03"]);
  });

  it("renonce aux jours antérieurs à une division plutôt que de les diviser à tort", () => {
    // Les cours Yahoo sont ajustés des splits ; la quantité du journal ne l'est
    // qu'à partir de la date du split. Les jours d'avant sont incalculables.
    const bourse = bourseSimple(
      [
        { id: "1", type: "ACHAT", date: "2026-05-01", asset: "AAA", quantity: 10, price: 200, fees: 0 },
        { id: "2", type: "SPLIT", date: "2026-06-03", asset: "AAA", ratio: 2 },
      ],
      [{ id: "p", ticker: "AAA", quantity: 20, pru: 100, current_price: 110, currency: "EUR" }]
    );
    const releves = reconstituer({
      bourse,
      dates: ["2026-06-02", "2026-06-03", "2026-06-04"],
      clotures: { AAA: { "2026-06-02": 100, "2026-06-03": 100, "2026-06-04": 100 } },
    });
    expect(releves.map((r) => r.date)).toEqual(["2026-06-03", "2026-06-04"]);
  });

  it("porte les indices à null quand leur cours manque, sans perdre la journée", () => {
    // Un indice indisponible n'invalide pas le relevé du portefeuille : c'est
    // une colonne de comparaison, pas la mesure elle-même.
    const bourse = bourseSimple(
      [],
      [{ id: "p", ticker: "AAA", quantity: 10, pru: 100, current_price: 110, currency: "EUR" }]
    );
    const releves = reconstituer({
      bourse,
      dates: ["2026-06-02"],
      clotures: { AAA: { "2026-06-02": 110 } },
      indices: INDICES,
    });
    expect(releves[0]).toMatchObject({ valeur: 1100, sp500: null, cac40: null, msciWorld: null });
  });

  it("ne rend rien sans jour à combler ni sans état bourse", () => {
    expect(reconstituer({ bourse: bourseSimple([], []), dates: [] })).toEqual([]);
    expect(reconstituer({ bourse: null, dates: ["2026-06-02"] })).toEqual([]);
  });
});
