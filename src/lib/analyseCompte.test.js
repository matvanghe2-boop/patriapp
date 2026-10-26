import { describe, it, expect } from "vitest";
import { enrichir } from "./compteCourant";
import {
  budgetMoyen, argentQuiDort, recurrences, rythmeMois, calendrierMois, depensesParJourSemaine,
  comparaisonCategories, zoomCategorie, petitesDepenses, jeuxParMois, misDeCoteParMois, fluxDuMois, joursDuMois,
} from "./analyseCompte";

let n = 0;
const op = (date, libelle, montant, extra = {}) => ({
  id: `op-${(n += 1)}`,
  date,
  montant,
  libelle,
  complements: [],
  ...extra,
});

// Trois mois (juillet à septembre 2026) d'un compte ordinaire : une aide
// mensuelle, un abonnement de sport, des courses plusieurs fois par mois, un
// virement vers son autre compte, et un don ponctuel en septembre.
const TITULAIRE = "MARTIN PAUL";
const brutes = [
  ...["07", "08", "09"].flatMap((m) => [
    op(`2026-${m}-04`, "VIR Virement de Jean MARTIN", 12000),
    op(`2026-${m}-18`, "PRLV SEPA BASIC FIT FRANCE", -3592),
    op(`2026-${m}-06`, "CARTE 05/07/26 CARREFOUR CITY CB*1234", -2500),
    op(`2026-${m}-20`, "CARTE 19/07/26 CARREFOUR CITY CB*1234", -4100),
    op(`2026-${m}-11`, "CARTE 10/07/26 BOULANGERIE DU COIN CB*1234", -350),
  ]),
  op("2026-08-12", "VIR Virement train Jean MARTIN", 2000),
  op("2026-09-07", "VIR INST MR MARTIN PAUL", -50000),
  op("2026-09-08", "VIR Virement 2 Jean MARTIN", 1000000, { horsBudget: true }),
  op("2026-09-25", "VIR INST WINAMAX", -2000),
  op("2026-09-26", "VIR INST WINAMAX", 500),
];
const enrichies = enrichir(brutes, { titulaire: TITULAIRE });

describe("budgetMoyen", () => {
  it("fait la moyenne des trois derniers mois, hors mouvements internes et opérations à part", () => {
    const b = budgetMoyen(enrichies);
    expect(b.mois).toEqual(["2026-07", "2026-08", "2026-09"]);
    // Entrées : 120 € par mois, plus 20 € en août et 5 € de gain en septembre (net dans « Jeux »).
    expect(b.revenus).toBeCloseTo((12000 * 3 + 2000) / 3);
    expect(b.depenses).toBeCloseTo((10542 * 3 + 2000 - 500) / 3);
  });

  it("ne renvoie rien sans opérations", () => {
    expect(budgetMoyen([])).toBeNull();
  });
});

describe("argentQuiDort", () => {
  const serie = [
    { date: "2026-09-01", solde: 100000 },
    { date: "2026-09-11", solde: 300000 },
  ];

  it("ne compte que ce qui dépasse un mois de dépenses, dans la limite du plafond", () => {
    const r = argentQuiDort({ serie, solde: 300000, reserve: 20000, tauxPct: 1.7 });
    expect(r.excedent).toBe(280000);
    expect(r.gainAnnuel).toBeCloseTo(4760);
    expect(argentQuiDort({ serie, solde: 300000, reserve: 20000, tauxPct: 1.7, plafond: 100000 }).excedent).toBe(100000);
    expect(argentQuiDort({ serie, solde: 10000, reserve: 20000, tauxPct: 1.7 }).excedent).toBe(0);
  });

  it("additionne jour par jour ce que l'argent dormant aurait rapporté", () => {
    const r = argentQuiDort({ serie, solde: 300000, reserve: 20000, tauxPct: 1.7 });
    // 10 jours à 800 € d'excédent, puis 1 jour à 2 800 €.
    expect(r.jours).toBe(11);
    expect(r.manqueAGagner).toBe(Math.round(((80000 * 10 + 280000) * 0.017) / 365));
    expect(r.depuis).toBe("2026-09-01");
  });
});

describe("recurrences", () => {
  const { charges, revenus } = recurrences(enrichies);

  it("reconnaît un prélèvement mensuel et prévoit le suivant", () => {
    const sport = charges.find((c) => c.titre === "Basic Fit France");
    expect(sport).toMatchObject({ montant: 3592, jour: 18, nombreMois: 3, categorie: "sport", prochaine: "2026-10-18" });
  });

  it("ne prend pas des courses répétées plusieurs fois par mois pour une charge fixe", () => {
    expect(charges.some((c) => c.titre === "Carrefour City")).toBe(false);
  });

  it("isole l'aide mensuelle d'une personne de ses autres virements", () => {
    expect(revenus).toEqual([expect.objectContaining({ titre: "Jean Martin", montant: 12000, jour: 4 })]);
  });

  it("ne garde pas une charge qui a cessé", () => {
    const ancienne = enrichir([
      op("2026-05-03", "PRLV SEPA NETFLIX", -1399),
      op("2026-06-03", "PRLV SEPA NETFLIX", -1399),
      op("2026-06-10", "CARTE 09/06/26 CAFE CB*1234", -300),
      op("2026-07-10", "CARTE 09/07/26 CAFE CB*1234", -300),
      op("2026-08-10", "CARTE 09/08/26 CAFE CB*1234", -300),
    ]);
    expect(recurrences(ancienne).charges.map((c) => c.titre)).toEqual(["Cafe"]);
  });

  it("exige trois mois à date stable pour un paiement par carte", () => {
    const hasard = enrichir([
      op("2026-08-07", "CARTE 06/08/26 MC DONALD'S CB*1234", -1450),
      op("2026-09-07", "CARTE 06/09/26 MC DONALD'S CB*1234", -1450),
      op("2026-07-02", "CARTE 01/07/26 KIOSQUE CB*1234", -500),
      op("2026-08-15", "CARTE 14/08/26 KIOSQUE CB*1234", -500),
      op("2026-09-28", "CARTE 27/09/26 KIOSQUE CB*1234", -500),
    ]);
    expect(recurrences(hasard).charges).toEqual([]);
  });

  it("place la prochaine échéance après le dernier relevé", () => {
    const enRetard = enrichir([
      op("2026-07-08", "PRLV SEPA FREE MOBILE", -999),
      op("2026-08-08", "PRLV SEPA FREE MOBILE", -999),
      op("2026-09-30", "CARTE 29/09/26 CAFE CB*1234", -300),
    ]);
    expect(recurrences(enRetard).charges[0].prochaine).toBe("2026-10-08");
  });
});

describe("rythme et calendrier", () => {
  it("cumule les dépenses du mois jour après jour et les compare aux autres mois", () => {
    const points = rythmeMois(enrichies, "2026-09");
    expect(points).toHaveLength(30);
    const au6 = points[5];
    expect(au6.mois).toBe(2500);
    expect(au6.moyenne).toBe(2500);
    // Fin septembre : dépenses courantes plus le solde net des jeux.
    expect(points[29].mois).toBe(10542 + 1500);
  });

  it("donne la dépense de chaque jour du mois", () => {
    const jours = calendrierMois(enrichies, "2026-09");
    expect(jours).toHaveLength(joursDuMois("2026-09"));
    expect(jours.find((j) => j.date === "2026-09-18").montant).toBe(3592);
    expect(jours.find((j) => j.date === "2026-09-07").montant).toBe(0);
  });

  it("divise par le nombre de jours de la semaine de la période, dépenses ou pas", () => {
    const semaine = depensesParJourSemaine(enrichir([op("2026-09-07", "CARTE 06/09/26 CAFE CB*1234", -900)]));
    const lundi = semaine.find((s) => s.jour === "Lundi");
    // Septembre 2026 compte quatre lundis (7, 14, 21 et 28).
    expect(lundi.total).toBe(900);
    expect(lundi.moyenne).toBe(225);
  });
});

describe("catégories", () => {
  it("compare chaque catégorie au mois précédent et à la moyenne des trois mois d'avant", () => {
    const lignes = comparaisonCategories(enrichies, "2026-09");
    const jeux = lignes.find((l) => l.id === "jeux");
    expect(jeux).toMatchObject({ montant: 1500, precedent: 0, moyenne3: 0, ecart: 1500 });
    const courses = lignes.find((l) => l.id === "courses");
    expect(courses.ecart).toBe(0);
  });

  it("détaille une catégorie : nombre, panier moyen, marchands", () => {
    const z = zoomCategorie(enrichies, "courses", "2026-09");
    expect(z).toMatchObject({ nombre: 2, total: 6600, panierMoyen: 3300 });
    expect(z.parMois).toHaveLength(3);
    expect(z.marchands[0]).toMatchObject({ titre: "Carrefour City", nombre: 2 });
  });

  it("totalise les petites dépenses de moins de 10 €", () => {
    const p = petitesDepenses(enrichies, "2026-09");
    expect(p).toMatchObject({ nombre: 1, total: 350 });
  });
});

describe("jeux, épargne et flux", () => {
  it("donne les jeux d'argent mois par mois, gains déduits", () => {
    expect(jeuxParMois(enrichies)).toEqual([{ mois: "2026-09", mises: 2000, gains: 500, net: 1500 }]);
  });

  it("mesure ce qui part réellement vers ses autres comptes", () => {
    expect(misDeCoteParMois(enrichies)).toEqual([{ mois: "2026-09", sortant: 50000, entrant: 0, net: 50000 }]);
  });

  it("équilibre les entrées et les sorties du mois, en prenant au besoin sur le solde", () => {
    const flux = fluxDuMois(enrichies, "2026-09");
    const total = (l) => l.reduce((s, x) => s + x.montant, 0);
    expect(total(flux.sources)).toBe(total(flux.destinations));
    expect(flux.sources.find((s) => s.id === "ponctuel").montant).toBe(1000000);
    expect(flux.destinations.find((d) => d.id === "interne").montant).toBe(50000);
    expect(flux.destinations.some((d) => d.id === "reste")).toBe(true);
  });

  it("regroupe les plus petites catégories au-delà du nombre de destinations voulu", () => {
    const flux = fluxDuMois(enrichies, "2026-09", { maxDestinations: 2 });
    expect(flux.destinations.map((d) => d.id)).toContain("autres");
  });
});

describe("revenus réguliers à date un peu variable", () => {
  it("tolère un virement isolé fait plus tôt que d'habitude", () => {
    const aide = enrichir(
      ["2026-05-18", "2026-06-16", "2026-07-16", "2026-08-17", "2026-09-07", "2026-09-16"].map((d) =>
        op(d, "VIR SEPA MME CLAIRE PETIT", 10000)
      )
    );
    expect(recurrences(aide).revenus).toEqual([expect.objectContaining({ titre: "Claire Petit", jour: 16 })]);
  });
});
