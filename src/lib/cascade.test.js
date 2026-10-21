import { describe, it, expect } from "vitest";
import {
  cascadeMensuelle,
  barresCascade,
  gainPortefeuilleAu,
  origineDuPatrimoine,
  regulariteVersements,
} from "./cascade";

// La forme EXACTE qu'écrit l'application (useDailySnapshot) : `value`, et non
// `valeur`. Les premiers tests fabriquaient leurs relevés avec la clé que le
// code attendait ; ils passaient pendant que la cascade ignorait tous les
// vrais relevés.
const HISTORIQUE = [
  { id: "a", label: "30 juin", date: "2026-06-30", value: 50000 },
  { id: "b", label: "31 juil.", date: "2026-07-31", value: 56000 },
];

// Historique du portefeuille : valeur et capital investi, comme l'écrit Bourse.
const PORTEFEUILLE = [
  { date: "2026-06-30", valeur: 20000, capital: 18000 }, // gain 2 000
  { date: "2026-07-31", valeur: 24500, capital: 21000 }, // gain 3 500
];

describe("cascadeMensuelle", () => {
  it("mesure le marché sur le portefeuille et met le reste en épargne", () => {
    const [m] = cascadeMensuelle({ historique: HISTORIQUE, bourseHistory: PORTEFEUILLE });
    expect(m.complet).toBe(true);
    expect(m.marche).toBe(1500); // 3 500 − 2 000
    expect(m.epargne).toBe(4500); // 6 000 − 1 500
  });

  it("compte un virement vers un livret comme de l'épargne, pas comme une plus-value", () => {
    // Le défaut de la première version : le journal du PEA ne voit pas le
    // livret, et ces 500 € ressortaient en « plus-values ».
    const [m] = cascadeMensuelle({
      historique: [
        { date: "2026-06-30", value: 30000 },
        { date: "2026-07-31", value: 30500 }, // +500 sur un livret, rien en bourse
      ],
      bourseHistory: [
        { date: "2026-06-30", valeur: 10000, capital: 9000 },
        { date: "2026-07-31", valeur: 10000, capital: 9000 },
      ],
    });
    expect(m.epargne).toBe(500);
    expect(m.marche).toBe(0);
    expect(m.plusValues).toBe(0);
  });

  it("détaille le marché en plus-values, dividendes et frais, et BOUCLE", () => {
    const [m] = cascadeMensuelle({
      historique: HISTORIQUE,
      bourseHistory: PORTEFEUILLE,
      operations: [
        { date: "2026-07-12", type: "DIVIDENDE", amount: 400 },
        { date: "2026-07-20", type: "ACHAT", quantity: 10, price: 100, fees: 7.5 },
      ],
    });
    expect(m.dividendes).toBe(400);
    expect(m.frais).toBe(Math.round(-7.5));
    expect(m.plusValues + m.dividendes + m.frais).toBe(m.marche);
    expect(m.debut + m.epargne + m.marche).toBe(m.fin);
  });

  it("refuse de décomposer un mois que l'historique du portefeuille ne couvre pas", () => {
    // Sans relevé du portefeuille, on ne sait pas ce que le marché a fait :
    // le dire vaut mieux que de tout mettre en épargne.
    const [m] = cascadeMensuelle({ historique: HISTORIQUE, bourseHistory: [] });
    expect(m.complet).toBe(false);
    expect(m.variation).toBe(6000);
  });

  it("met toute la variation en épargne quand il n'y a pas de portefeuille", () => {
    const [m] = cascadeMensuelle({ historique: HISTORIQUE, aDesPositions: false });
    expect(m.epargne).toBe(6000);
    expect(m.marche).toBe(0);
  });

  it("prend le dernier relevé du portefeuille connu à la date", () => {
    expect(gainPortefeuilleAu(PORTEFEUILLE, "2026-07-15")).toBe(2000);
    expect(gainPortefeuilleAu(PORTEFEUILLE, "2026-06-01")).toBeNull();
  });

  it("n'invente pas de mois sans point de départ", () => {
    expect(cascadeMensuelle({ historique: [{ date: "2026-07-31", value: 50000 }] })).toEqual([]);
    expect(cascadeMensuelle({ historique: [] })).toEqual([]);
  });

  it("borne le nombre de mois renvoyés", () => {
    const longue = [];
    for (let i = 0; i < 12; i++) {
      longue.push({ date: `2026-${String(i + 1).padStart(2, "0")}-28`, value: 10000 + i * 500 });
    }
    expect(cascadeMensuelle({ historique: longue, mois: 3, aDesPositions: false })).toHaveLength(3);
  });
});

describe("barresCascade", () => {
  const mois = { complet: true, debut: 50000, epargne: 4500, plusValues: 1112, dividendes: 400, frais: -12, fin: 56000 };

  it("empile chaque barre là où la précédente s'arrête", () => {
    const barres = barresCascade(mois);
    expect(barres.find((b) => b.cle === "epargne").base).toBe(50000);
    expect(barres.find((b) => b.cle === "plusValues").base).toBe(54500);
  });

  it("fait descendre une barre négative sous le curseur", () => {
    const frais = barresCascade(mois).find((b) => b.cle === "frais");
    expect(frais.base).toBe(56000);
    expect(frais.hauteur).toBe(12);
  });

  it("réduit un mois non décomposé à sa seule variation", () => {
    const barres = barresCascade({ complet: false, debut: 50000, variation: 6000, fin: 56000 });
    expect(barres.map((b) => b.cle)).toEqual(["debut", "variation", "fin"]);
  });

  it("ne lève pas sans données", () => {
    expect(barresCascade(null)).toEqual([]);
  });
});

describe("origineDuPatrimoine", () => {
  it("sépare l'épargne du marché depuis que les deux historiques existent", () => {
    const o = origineDuPatrimoine({
      historique: [
        { date: "2026-01-31", value: 20000 }, // avant le portefeuille : écarté
        { date: "2026-06-30", value: 50000 },
        { date: "2026-07-31", value: 56000 },
      ],
      bourseHistory: PORTEFEUILLE,
    });
    expect(o.depuis).toBe("2026-06-30");
    expect(o.marche).toBe(1500);
    expect(o.epargne).toBe(4500);
  });

  it("ne conclut pas sans historique du portefeuille", () => {
    expect(origineDuPatrimoine({ historique: HISTORIQUE, bourseHistory: [] })).toBeNull();
  });
});

describe("regulariteVersements", () => {
  it("compte les mois avec un versement et la plus longue série", () => {
    const ops = ["2025-11-05", "2025-12-05", "2026-01-05", "2026-03-05", "2026-10-05"].map((date) => ({
      date,
      type: "VERSEMENT",
      amount: 300,
    }));
    const r = regulariteVersements(ops, "2026-10-21");
    expect(r.nbSurDouze).toBe(5);
    expect(r.plusLongueSerie).toBe(3); // nov., déc., janv. — à cheval sur l'année
    expect(r.douzeMois.at(-1)).toEqual({ cle: "2026-10", verse: true });
  });
});
