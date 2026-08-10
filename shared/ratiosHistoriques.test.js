import { describe, it, expect } from "vitest";
import {
  RATIOS_HISTORIQUES,
  croissance,
  ratiosParExercice,
  moyenneRatio,
  situerParRapportALaMoyenne,
  syntheseRatios,
} from "./ratiosHistoriques.js";

// Chiffres réels d'Air Liquide, arrondis, tels que renvoyés par l'API.
const HISTORIQUE = [
  { exercice: "2022-12-31", TotalRevenue: 29_934_000_000, NetIncome: 2_758_800_000, EBITDA: 6_415_800_000,
    CapitalExpenditure: -3_273_000_000, FreeCashFlow: 2_537_100_000, TotalDebt: 13_375_700_000,
    StockholdersEquity: 23_736_400_000, DilutedEPS: 4.36, coursCloture: 120.71 },
  { exercice: "2023-12-31", TotalRevenue: 27_607_600_000, NetIncome: 3_078_000_000, EBITDA: 6_710_400_000,
    CapitalExpenditure: -3_393_400_000, FreeCashFlow: 2_869_600_000, TotalDebt: 12_037_600_000,
    StockholdersEquity: 24_321_500_000, DilutedEPS: 4.85, coursCloture: 143.54 },
  { exercice: "2024-12-31", TotalRevenue: 27_057_800_000, NetIncome: 3_306_100_000, EBITDA: 7_111_200_000,
    CapitalExpenditure: -3_525_100_000, FreeCashFlow: 2_797_100_000, TotalDebt: 12_393_600_000,
    StockholdersEquity: 26_860_000_000, DilutedEPS: 5.20, coursCloture: 153.27 },
  { exercice: "2025-12-31", TotalRevenue: 26_940_200_000, NetIncome: 3_517_900_000, EBITDA: 7_528_700_000,
    CapitalExpenditure: -3_843_400_000, FreeCashFlow: 2_675_000_000, TotalDebt: 13_595_900_000,
    StockholdersEquity: 26_213_900_000, DilutedEPS: 6.08, coursCloture: 143.58 },
];

describe("croissance", () => {
  it("mesure une progression", () => {
    expect(croissance(100, 110)).toBeCloseTo(10, 6);
  });
  it("mesure un recul", () => {
    expect(croissance(100, 90)).toBeCloseTo(-10, 6);
  });
  it("rend null sur une base nulle ou absente", () => {
    expect(croissance(0, 10)).toBeNull();
    expect(croissance(null, 10)).toBeNull();
  });
});

describe("ratiosParExercice", () => {
  const lignes = ratiosParExercice(HISTORIQUE);

  it("produit une ligne par exercice, du plus ancien au plus récent", () => {
    expect(lignes).toHaveLength(4);
    expect(lignes[0].exercice).toBe("2022-12-31");
    expect(lignes[3].exercice).toBe("2025-12-31");
  });

  it("calcule la marge nette", () => {
    expect(lignes[3].margeNettePct).toBeCloseTo(13.06, 1);
  });

  it("calcule le PER à partir du cours de l'époque et du BPA de l'exercice", () => {
    // 143,58 / 6,08 = 23,6. Exact, pas approché : c'est le BPA publié, pas le
    // résultat net divisé par le nombre d'actions d'aujourd'hui.
    expect(lignes[3].per).toBeCloseTo(23.6, 1);
    expect(lignes[0].per).toBeCloseTo(27.7, 1);
  });

  it("prend la valeur absolue du capex, publié en négatif", () => {
    expect(lignes[3].capexSurCaPct).toBeGreaterThan(0);
    expect(lignes[3].capexSurCaPct).toBeCloseTo(14.3, 1);
  });

  it("calcule la croissance d'un exercice à l'autre", () => {
    expect(lignes[0].croissanceCaPct).toBeNull();
    expect(lignes[3].croissanceBpaPct).toBeCloseTo(16.9, 1);
  });

  it("rend null plutôt que d'inventer quand une donnée manque", () => {
    const partiel = ratiosParExercice([{ exercice: "2024-12-31", TotalRevenue: 100 }]);
    expect(partiel[0].margeNettePct).toBeNull();
    expect(partiel[0].per).toBeNull();
  });

  it("ne calcule pas de PER sur un bénéfice par action négatif", () => {
    // Un PER négatif n'a pas de sens : une société en perte n'a pas de
    // multiple de bénéfice.
    const perte = ratiosParExercice([{ exercice: "2024-12-31", DilutedEPS: -2, coursCloture: 50 }]);
    expect(perte[0].per).toBeNull();
  });
});

describe("moyenneRatio", () => {
  it("moyenne les exercices renseignés", () => {
    const lignes = ratiosParExercice(HISTORIQUE);
    expect(moyenneRatio(lignes, "per")).toBeCloseTo(27.6, 1);
  });

  it("ignore les exercices sans valeur", () => {
    expect(moyenneRatio([{ x: 10 }, { x: null }, { x: 20 }], "x")).toBe(15);
  });

  it("rend null quand rien n'est renseigné", () => {
    expect(moyenneRatio([{ x: null }], "x")).toBeNull();
  });
});

describe("situerParRapportALaMoyenne", () => {
  it("juge favorable un ratio de maximum sous sa moyenne", () => {
    // Un PER inférieur à sa moyenne est favorable : le titre est moins cher
    // que d'habitude.
    const r = situerParRapportALaMoyenne(20, 28, "bas");
    expect(r.jugement).toBe("favorable");
    expect(r.ecartPct).toBeCloseTo(-28.6, 1);
  });

  it("juge défavorable un ratio de maximum au-dessus de sa moyenne", () => {
    expect(situerParRapportALaMoyenne(31, 28, "bas").jugement).toBe("defavorable");
  });

  it("inverse la lecture pour un ratio de minimum", () => {
    expect(situerParRapportALaMoyenne(14, 12, "haut").jugement).toBe("favorable");
    expect(situerParRapportALaMoyenne(10, 12, "haut").jugement).toBe("defavorable");
  });

  it("qualifie de conforme un écart faible", () => {
    expect(situerParRapportALaMoyenne(28.5, 28, "bas").jugement).toBe("conforme");
  });

  it("rend « inconnu » sans point de comparaison", () => {
    expect(situerParRapportALaMoyenne(28, null, "bas").jugement).toBe("inconnu");
    expect(situerParRapportALaMoyenne(null, 28, "bas").jugement).toBe("inconnu");
  });
});

describe("syntheseRatios", () => {
  it("compare la valeur du jour à la moyenne historique", () => {
    const { synthese } = syntheseRatios(HISTORIQUE, { valeursCourantes: { per: 30.9 } });
    const per = synthese.find((r) => r.cle === "per");
    expect(per.courant).toBe(30.9);
    expect(per.moyenne).toBeCloseTo(27.6, 1);
    expect(per.jugement).toBe("defavorable");
    expect(per.nbExercices).toBe(4);
  });

  it("retombe sur le dernier exercice quand la valeur du jour manque", () => {
    const { synthese } = syntheseRatios(HISTORIQUE);
    expect(synthese.find((r) => r.cle === "per").courant).toBeCloseTo(23.6, 1);
  });

  it("couvre tous les ratios du catalogue", () => {
    const { synthese } = syntheseRatios(HISTORIQUE);
    expect(synthese.map((r) => r.cle).sort()).toEqual(Object.keys(RATIOS_HISTORIQUES).sort());
  });

  it("tolère un historique vide", () => {
    expect(syntheseRatios([])).toEqual({ lignes: [], synthese: [] });
  });
});
