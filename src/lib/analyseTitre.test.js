import { describe, it, expect } from "vitest";
import { dividendesParAnnee, lireHistoriqueDividendes } from "./historiqueDividendes";
import { evolutionNombreActions, rendementActionnaire } from "./actionnariat";
import { notePiotroski, lectureNote } from "./piotroski";
import { facteurConversion, devisesNecessaires } from "./deviseComptes";

const annuel = (montants, debut = 2014, jour = "05-10") =>
  montants.map((m, i) => ({ date: `${debut + i}-${jour}`, montant: m }));

describe("historique du dividende", () => {
  it("rattache un acompte de début janvier à l'année précédente chez un payeur trimestriel", () => {
    // Quatre versements par an, le dernier détaché début janvier suivant.
    const d = [];
    for (let a = 2019; a <= 2025; a++) {
      d.push({ date: `${a}-03-20`, montant: 0.7 }, { date: `${a}-06-20`, montant: 0.7 }, { date: `${a}-09-20`, montant: 0.7 }, { date: `${a + 1}-01-03`, montant: 0.7 });
    }
    const { annees, frequence } = dividendesParAnnee(d, { aujourdhui: "2026-10-21" });
    expect(frequence).toBe(4);
    const complet = annees.filter((e) => !e.enCours);
    expect(complet.every((e) => e.versements === 4)).toBe(true);
    expect(complet.at(-1).montant).toBeCloseTo(2.8);
  });

  it("met à part un dividende exceptionnel au lieu d'en tirer une baisse l'année suivante", () => {
    const d = [];
    for (let a = 2020; a <= 2025; a++) {
      for (const m of ["03", "06", "09", "11"]) d.push({ date: `${a}-${m}-15`, montant: 0.7 });
    }
    d.push({ date: "2022-12-06", montant: 1 });
    const { annees } = dividendesParAnnee(d, { aujourdhui: "2026-10-21" });
    const a2022 = annees.find((e) => e.annee === 2022);
    expect(a2022.exceptionnel).toBe(1);
    expect(a2022.montant).toBeCloseTo(2.8);
    expect(lireHistoriqueDividendes(annees).baisses).toEqual([]);
  });

  it("signale une année incohérente de la source et la sort des calculs", () => {
    // Le cas Schneider 2018 : 0,19 € entre 2,04 € et 2,35 €.
    const d = annuel([1.87, 1.92, 2.0, 2.04, 0.19, 2.35, 2.55, 2.6, 2.9, 3.15, 3.5, 3.9]);
    const { annees } = dividendesParAnnee(d, { aujourdhui: "2026-10-21" });
    expect(annees.find((e) => e.annee === 2018).atypique).toBe("bas");
    const l = lireHistoriqueDividendes(annees);
    expect(l.atypiques).toEqual([2018]);
    expect(l.baisses).toEqual([]);
    expect(l.sansBaisseDepuisLeDebut).toBe(true);
  });

  it("calcule la croissance sur 5 et 10 ans et ne compte jamais l'année en cours", () => {
    const d = [...annuel([1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2], 2015), { date: "2026-05-10", montant: 9 }];
    const { annees } = dividendesParAnnee(d, { aujourdhui: "2026-10-21" });
    const l = lireHistoriqueDividendes(annees);
    expect(l.derniere.annee).toBe(2025);
    expect(l.croissance10ansPct).toBeCloseTo((2 ** 0.1 - 1) * 100);
    expect(l.croissance5ansPct).toBeCloseTo(((2 / 1.5) ** 0.2 - 1) * 100);
  });

  it("repère une vraie baisse et arrête là le compte des années sans baisse", () => {
    const d = annuel([3.3, 3.6, 4.2, 5.4, 6.2, 4.6, 7, 12, 12.5, 13, 13], 2015);
    const l = lireHistoriqueDividendes(dividendesParAnnee(d, { aujourdhui: "2026-10-21" }).annees);
    expect(l.baisses.map((b) => b.annee)).toEqual([2020]);
    expect(l.anneesSansBaisse).toBe(5);
  });
});

describe("rachats d'actions", () => {
  const historique = [
    { exercice: "2022-12-31", OrdinarySharesNumber: 2482e6, CashDividendsPaid: -9986e6, RepurchaseOfCapitalStock: -7711e6 },
    { exercice: "2025-12-31", OrdinarySharesNumber: 2143e6, CashDividendsPaid: -8121e6, RepurchaseOfCapitalStock: -7714e6 },
  ];

  it("mesure la baisse du nombre d'actions par an", () => {
    const e = evolutionNombreActions(historique);
    expect(e.sens).toBe("rachats");
    expect(e.variationAnnuellePct).toBeCloseTo(((2143 / 2482) ** (1 / 3) - 1) * 100);
  });

  it("rapporte dividendes et rachats à la capitalisation, devise des comptes convertie", () => {
    const r = rendementActionnaire(historique, 100e9, 0.9);
    expect(r.exercice).toBe("2025");
    expect(r.dividendesPct).toBeCloseTo(8121e6 * 0.9 / 1e9);
    expect(r.totalPct).toBeCloseTo((8121e6 + 7714e6) * 0.9 / 1e9);
  });

  it("refuse de rapporter deux monnaies quand le taux manque", () => {
    expect(rendementActionnaire(historique, 100e9, null)).toBeNull();
  });
});

describe("note de Piotroski", () => {
  const ex = (annee, v) => ({
    exercice: `${annee}-12-31`,
    TotalAssets: 100,
    NetIncome: 5,
    OperatingCashFlow: 8,
    LongTermDebt: 30,
    CurrentAssets: 40,
    CurrentLiabilities: 30,
    OrdinarySharesNumber: 10,
    GrossProfit: 40,
    TotalRevenue: 100,
    ...v,
  });

  it("donne 9 sur 9 à une société qui progresse partout", () => {
    const n = notePiotroski([
      ex(2023, {}),
      ex(2024, {}),
      ex(2025, { NetIncome: 7, OperatingCashFlow: 9, LongTermDebt: 20, CurrentAssets: 45, OrdinarySharesNumber: 9, GrossProfit: 45, TotalRevenue: 110 }),
    ]);
    expect(n.actuelle.exercice).toBe("2025");
    expect(n.actuelle.score).toBe(9);
    expect(n.actuelle.evalues).toBe(9);
    expect(lectureNote(n.actuelle).ton).toBe("favorable");
  });

  it("laisse non évaluable un critère sans donnée, sans le compter raté", () => {
    const n = notePiotroski([ex(2024, { CurrentAssets: null }), ex(2025, { CurrentAssets: null })]);
    const liquidite = n.actuelle.criteres.find((c) => c.cle === "liquidite");
    expect(liquidite.ok).toBeNull();
    // Sans l'exercice d'avant, la rentabilité de 2024 n'a pas d'actifs de début.
    expect(n.actuelle.criteres.find((c) => c.cle === "deltaRoa").ok).toBeNull();
    expect(lectureNote(n.actuelle).libelle).toMatch(/données manquantes/);
  });

  it("fait échouer « pas d'actions nouvelles » au moindre plan salarié", () => {
    const n = notePiotroski([ex(2024, {}), ex(2025, { OrdinarySharesNumber: 10.02 })]);
    expect(n.actuelle.criteres.find((c) => c.cle === "actions").ok).toBe(false);
  });
});

describe("devise des comptes", () => {
  it("convertit des dollars en euros au taux donné", () => {
    expect(facteurConversion("USD", "EUR", { USD: 0.9 })).toBeCloseTo(0.9);
    expect(devisesNecessaires("USD", "EUR")).toEqual(["USD"]);
  });

  it("passe des livres aux pence sans taux de change", () => {
    expect(facteurConversion("GBP", "GBp")).toBe(100);
    expect(devisesNecessaires("GBP", "GBp")).toEqual([]);
  });

  it("renvoie null quand un taux nécessaire manque, 1 quand la devise des comptes est inconnue", () => {
    expect(facteurConversion("USD", "EUR", {})).toBeNull();
    expect(facteurConversion(null, "EUR")).toBe(1);
  });
});
