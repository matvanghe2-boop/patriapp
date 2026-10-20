import { describe, it, expect } from "vitest";
import { cascadeMensuelle, barresCascade } from "./cascade";

// La forme EXACTE qu'écrit l'application (useDailySnapshot) : `value`, et non
// `valeur`. Ces tests fabriquaient leurs relevés avec la clé que le code
// attendait ; ils passaient pendant que la cascade ignorait tous les vrais
// relevés et restait bloquée sur « il faut deux relevés mensuels ».
const HISTORIQUE = [
  { id: "a", label: "30 juin", date: "2026-06-30", value: 50000 },
  { id: "b", label: "31 juil.", date: "2026-07-31", value: 56000 },
];

describe("cascadeMensuelle", () => {
  it("décompose l'écart du mois en versements, dividendes, frais et marché", () => {
    const [m] = cascadeMensuelle({
      historique: HISTORIQUE,
      operations: [
        { date: "2026-07-05", type: "VERSEMENT", amount: 3000 },
        { date: "2026-07-12", type: "DIVIDENDE", amount: 400 },
        { date: "2026-07-20", type: "ACHAT", quantity: 10, price: 100, fees: 12 },
      ],
    });

    expect(m.debut).toBe(50000);
    expect(m.fin).toBe(56000);
    expect(m.versements).toBe(3000);
    expect(m.dividendes).toBe(400);
    expect(m.frais).toBe(-12);
    // Résidu : 56 000 − 50 000 − 3 000 − 400 + 12 = 2 612
    expect(m.plusValues).toBe(2612);
  });

  it("BOUCLE toujours : début + tous les mouvements = fin", () => {
    // C'est la garantie qui justifie de traiter les plus-values en résidu :
    // aucune cascade ne doit laisser d'écart inexpliqué.
    const [m] = cascadeMensuelle({
      historique: HISTORIQUE,
      operations: [
        { date: "2026-07-05", type: "VERSEMENT", amount: 1234 },
        { date: "2026-07-09", type: "DIVIDENDE", amount: 56 },
        { date: "2026-07-11", type: "VENTE", quantity: 5, price: 200, fees: 7.5 },
      ],
    });
    const somme = m.debut + m.versements + m.dividendes + m.frais + m.plusValues;
    expect(somme).toBe(m.fin);
  });

  it("compte un retrait en négatif", () => {
    const [m] = cascadeMensuelle({
      historique: HISTORIQUE,
      operations: [{ date: "2026-07-05", type: "RETRAIT", amount: 2000 }],
    });
    expect(m.versements).toBe(-2000);
  });

  it("ne compte PAS un ajustement de solde comme un versement", () => {
    // Un ajustement corrige une saisie, il n'apporte pas d'argent : il doit
    // retomber dans le résidu, pas gonfler les versements.
    const [m] = cascadeMensuelle({
      historique: HISTORIQUE,
      operations: [{ date: "2026-07-05", type: "AJUSTEMENT", amount: 800 }],
    });
    expect(m.versements).toBe(0);
    expect(m.plusValues).toBe(6000);
  });

  it("ignore les opérations des autres mois", () => {
    const [m] = cascadeMensuelle({
      historique: HISTORIQUE,
      operations: [{ date: "2026-06-15", type: "VERSEMENT", amount: 9999 }],
    });
    expect(m.versements).toBe(0);
  });

  it("n'invente pas de mois sans point de départ", () => {
    // Sans relevé précédent, on ignore d'où l'on part : il n'y a pas d'écart
    // à décomposer.
    expect(cascadeMensuelle({ historique: [{ date: "2026-07-31", value: 50000 }] })).toEqual([]);
    expect(cascadeMensuelle({ historique: [] })).toEqual([]);
  });

  it("borne le nombre de mois renvoyés", () => {
    const longue = [];
    for (let i = 0; i < 12; i++) {
      longue.push({ date: `2026-${String(i + 1).padStart(2, "0")}-28`, value: 10000 + i * 500 });
    }
    expect(cascadeMensuelle({ historique: longue, mois: 3 })).toHaveLength(3);
  });
});

describe("barresCascade", () => {
  const mois = {
    debut: 50000,
    versements: 3000,
    plusValues: 2612,
    dividendes: 400,
    frais: -12,
    fin: 56000,
  };

  it("empile chaque barre là où la précédente s'arrête", () => {
    const barres = barresCascade(mois);
    const versements = barres.find((b) => b.cle === "versements");
    expect(versements.base).toBe(50000);
    expect(versements.hauteur).toBe(3000);

    const plusValues = barres.find((b) => b.cle === "plusValues");
    expect(plusValues.base).toBe(53000);
  });

  it("fait descendre une barre négative sous le curseur", () => {
    const barres = barresCascade(mois);
    const frais = barres.find((b) => b.cle === "frais");
    // Le curseur vaut 56 012 avant les frais ; la barre descend de 12.
    expect(frais.base).toBe(56000);
    expect(frais.hauteur).toBe(12);
  });

  it("pose les totaux à partir de zéro", () => {
    const barres = barresCascade(mois);
    expect(barres.find((b) => b.cle === "debut").base).toBe(0);
    expect(barres.find((b) => b.cle === "fin").base).toBe(0);
    expect(barres.find((b) => b.cle === "fin").hauteur).toBe(56000);
  });

  it("ne lève pas sans données", () => {
    expect(barresCascade(null)).toEqual([]);
  });
});
