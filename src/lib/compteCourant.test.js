import { describe, it, expect } from "vitest";
import {
  analyserOperation, categoriser, estEntreMesComptes, empreintes, preparerImport, preparerLots, appliquerImport,
  retirerReleve, soldesApres, soldeActuel, serieSolde, raccordsReleves, enrichir, bilan, parMois, nomLisible,
  operationsInhabituelles,
} from "./compteCourant";
import { lireReleveBourso } from "./releveBourso";
import { pagesReleveFactice } from "../test/releveFactice";

const op = (libelle, montant, complements = [], extra = {}) => ({
  id: libelle,
  date: "2026-05-10",
  montant,
  libelle,
  complements,
  ...extra,
});

describe("analyserOperation", () => {
  it("lit un paiement par carte : marchand, date d'achat", () => {
    const a = analyserOperation(op("CARTE 05/05/26 CARREFOUR CITY CB*1234", -1250));
    expect(a).toMatchObject({ type: "carte", titre: "Carrefour City", dateAchat: "2026-05-05" });
  });

  it("retire les numéros de magasin et nomme les enseignes illisibles", () => {
    expect(analyserOperation(op("CARTE 05/05/26 BK K0123 VILLENEUVE 2 CB*1234", -1390)).titre).toBe("Burger King Villeneuve");
    expect(nomLisible("MC DONALD'S")).toBe("McDonald's");
    expect(nomLisible("SNCF -VOYAGEURS")).toBe("SNCF Voyageurs");
  });

  it("lit un prélèvement sans prendre la période ou le mandat pour un motif", () => {
    const a = analyserOperation(
      op("PRLV SEPA BASIC FIT FRANCE", -3592, ["19-05-2026 / 15-06-2026", "GT025046302441720AE", "RUM 210006499"])
    );
    expect(a).toMatchObject({ type: "prelevement", titre: "Basic Fit France", motif: null });
  });

  it("lit un virement reçu : contrepartie sans civilité, motif, référence", () => {
    const a = analyserOperation(
      op("VIR SEPA MME CLAIRE PETIT", 10000, ["aide week end", "Vir. de MME CLAIRE PETIT", "Rèf ABC123"])
    );
    expect(a).toMatchObject({
      type: "virement",
      titre: "Claire Petit",
      contrepartie: "Claire Petit",
      motif: "aide week end",
      reference: "ABC123",
    });
  });

  it("prend le bénéficiaire d'un « Virement depuis BoursoBank » sur la ligne suivante", () => {
    const a = analyserOperation(op("VIR Virement depuis BoursoBank", -100000, ["MARTIN PAUL", "Rèf : SCT4061820260505"]));
    expect(a.contrepartie).toBe("Martin Paul");
    expect(a.motif).toBeNull();
  });

  it("ne prend pas un identifiant technique pour un motif", () => {
    expect(analyserOperation(op("VIR INST WINAMAX", -2000, ["S0IA1GPGAI2ENF4O9A"])).motif).toBeNull();
    expect(analyserOperation(op("VIR M MARTIN PAUL", -1000000, ["10765094"])).motif).toBeNull();
  });

  it("regroupe sous le nom de la personne les virements dont le motif précède le nom", () => {
    const pel = analyserOperation(op("VIR Vir PEL de Jean MARTIN", 1000000, ["MARTIN"]));
    const train = analyserOperation(op("VIR Virement train Jean MARTIN", 2000, ["MARTIN"]));
    const deux = analyserOperation(op("VIR Virement 2 Jean MARTIN", 1000000));
    expect(pel).toMatchObject({ titre: "Jean Martin", motif: "PEL" });
    expect(train).toMatchObject({ titre: "Jean Martin", motif: "train" });
    expect(deux).toMatchObject({ titre: "Jean Martin", motif: "2" });
    expect(new Set([pel.cle, train.cle, deux.cle]).size).toBe(1);
  });

  it("ne prend pas un motif en minuscules pour un nom", () => {
    const a = analyserOperation(op("VIR Virement loyer de juin", -50000));
    expect(a.contrepartie).toBeNull();
    expect(a.titre).toBe("Virement Loyer De Juin");
  });
});

describe("categoriser", () => {
  it("classe par mots-clés", () => {
    expect(categoriser(op("CARTE 05/05/26 CARREFOUR CITY CB*1234", -1250))).toBe("courses");
    expect(categoriser(op("PRLV SEPA BASIC FIT FRANCE", -3592))).toBe("sport");
    expect(categoriser(op("VIR INST WINAMAX", -2000))).toBe("jeux");
    expect(categoriser(op("VIR SEPA MME CLAIRE PETIT", 5000, ["Rbst courses"]))).toBe("remboursements");
  });

  it("reconnaît un virement entre ses propres comptes, mais pas vers un parent qui porte le même nom", () => {
    const titulaire = "MARTIN PAUL";
    expect(categoriser(op("VIR INST MR MARTIN PAUL", 97000), { titulaire })).toBe("entre-mes-comptes");
    expect(categoriser(op("VIR Virement de Jean MARTIN", 12000), { titulaire })).toBe("virements-recus");
    expect(estEntreMesComptes(analyserOperation(op("VIR INST MARTIN PAUL", -5500)), "PAUL")).toBe(false);
  });

  it("ne range pas en épargne interne l'argent qu'une autre personne envoie depuis son PEL", () => {
    expect(categoriser(op("VIR Vir PEL de Jean MARTIN", 1000000), { titulaire: "MARTIN PAUL" })).toBe("virements-recus");
    expect(categoriser(op("VIR SEPA LIVRET A", -20000))).toBe("epargne");
  });

  it("classe l'aide d'un parent par une règle sur la personne, quel que soit le motif", () => {
    const cle = analyserOperation(op("VIR Virement de Jean MARTIN", 12000)).cle;
    const regles = [{ cle, categorie: "aide-familiale" }];
    expect(categoriser(op("VIR Virement train Jean MARTIN", 2000), { regles })).toBe("aide-familiale");
    expect(categoriser(op("VIR Vir PEL de Jean MARTIN", 1000000), { regles })).toBe("aide-familiale");
  });

  it("ne transforme pas une sortie en revenu sur un mot-clé de revenu", () => {
    expect(categoriser(op("VIR SEPA BANQUE X", -20000, ["remboursement pret"]))).toBe("virements-emis");
  });

  it("fait primer le choix manuel sur la règle, et la règle sur le classement automatique", () => {
    const carte = op("CARTE 18/05/26 SARLDIS CB*1234", -5097);
    const cle = analyserOperation(carte).cle;
    expect(categoriser(carte)).toBe("autres-depenses");
    const regles = [{ cle, categorie: "courses" }];
    expect(categoriser(carte, { regles })).toBe("courses");
    expect(categoriser({ ...carte, categorieManuelle: "shopping" }, { regles })).toBe("shopping");
  });
});

describe("import d'un relevé", () => {
  const lu = lireReleveBourso(pagesReleveFactice());

  it("distingue deux opérations identiques le même jour", () => {
    const deux = [op("CARTE 10/05/26 CAFE CB*1234", -250), op("CARTE 10/05/26 CAFE CB*1234", -250)];
    const [a, b] = empreintes(deux);
    expect(a).not.toBe(b);
  });

  it("importe tout la première fois, puis rien quand on réimporte le même relevé", () => {
    const premier = preparerImport(lu, {});
    expect(premier.nouvelles).toHaveLength(8);
    expect(premier.doublons).toBe(0);
    expect(premier.releve).toMatchObject({ soldeDebut: 200000, soldeFin: -8298, controleOk: true, nbOperations: 8 });

    const etat = appliquerImport(premier, {});
    const second = preparerImport(lu, etat);
    expect(second.nouvelles).toHaveLength(0);
    expect(second.doublons).toBe(8);
    expect(second.releveDejaImporte).toBe(true);
  });

  it("ne double rien quand le même fichier est choisi deux fois dans la même sélection", () => {
    const lots = preparerLots([
      { fichier: "mai.pdf", releve: lu },
      { fichier: "mai (1).pdf", releve: lu },
      { fichier: "facture.pdf", erreur: "illisible" },
    ]);
    expect(lots[0].lot.nouvelles).toHaveLength(8);
    expect(lots[1].lot.nouvelles).toHaveLength(0);
    expect(lots[2].erreur).toBe("illisible");
  });

  it("retire un relevé et toutes ses opérations", () => {
    const etat = appliquerImport(preparerImport(lu, {}), {});
    expect(retirerReleve(etat.releves[0].id, etat)).toEqual({ operations: [], releves: [] });
  });
});

describe("soldes", () => {
  const lu = lireReleveBourso(pagesReleveFactice());
  const { operations, releves } = appliquerImport(preparerImport(lu, {}), {});

  it("recalcule le solde après chaque opération, jusqu'au solde de la banque", () => {
    const soldes = soldesApres(operations, releves);
    expect(soldes.get(operations[0].id)).toBe(202000);
    expect(soldes.get(operations[operations.length - 1].id)).toBe(-8298);
  });

  it("donne le dernier solde connu et sa date", () => {
    expect(soldeActuel(releves)).toMatchObject({ solde: -8298, date: "2026-05-29" });
  });

  it("trace un point par jour, au solde du soir", () => {
    const serie = serieSolde(operations, releves);
    expect(serie[0]).toEqual({ date: "2026-05-01", solde: 200000 });
    expect(serie.find((p) => p.date === "2026-05-18")).toEqual({ date: "2026-05-18", solde: 117158 });
    expect(serie[serie.length - 1]).toEqual({ date: "2026-05-27", solde: -8298 });
  });

  it("signale deux relevés qui ne se raccordent pas", () => {
    const juin = { id: "j", debut: "2026-07-01", fin: "2026-07-31", soldeDebut: 50000, soldeFin: 40000 };
    expect(raccordsReleves([...releves, juin])).toEqual([{ apres: "2026-05-29", avant: "2026-07-01", ecart: 58298 }]);
    expect(raccordsReleves([...releves, { ...juin, soldeDebut: -8298 }])).toEqual([]);
  });
});

describe("bilan", () => {
  const lu = lireReleveBourso(pagesReleveFactice());
  const { operations } = appliquerImport(preparerImport(lu, {}), {});
  const enrichies = enrichir(operations, { titulaire: lu.titulaire });

  it("sépare entrées, sorties et mouvements entre ses comptes", () => {
    const b = bilan(enrichies);
    expect(b.interneSortant).toBe(100000);
    expect(b.entrees).toBe(2000 + 10000 + 10000);
    expect(b.sorties).toBe(1250 + 3592 + 2000 + 123456);
    expect(b.net).toBe(b.entrees - b.sorties);
  });

  it("classe les dépenses par catégorie, de la plus grosse à la plus petite", () => {
    expect(bilan(enrichies).depensesParCategorie.map((d) => d.id)).toEqual(["sante", "sport", "jeux", "courses"]);
  });

  it("déduit un remboursement par carte de sa catégorie au lieu de le compter en revenu", () => {
    const avecAvoir = enrichir([
      op("CARTE 05/05/26 CARREFOUR CITY CB*1234", -5000),
      op("CARTE 06/05/26 CARREFOUR CITY CB*1234", 1000),
    ]);
    const b = bilan(avecAvoir);
    expect(b.depensesParCategorie).toEqual([{ id: "courses", libelle: "Courses", montant: 4000 }]);
    expect(b.entrees).toBe(0);
    expect(b.sorties).toBe(4000);
    expect(parMois(avecAvoir)).toEqual([{ mois: "2026-05", entrees: 0, sorties: 4000, net: -4000 }]);
  });
});

describe("opérations ponctuelles", () => {
  // Trois mois de petites entrées, puis un don de 10 000 € le troisième.
  const mois = (m, libelle, montant, extra = {}) =>
    op(libelle, montant, [], { id: `${m}-${libelle}-${montant}`, date: `2026-0${m}-10`, ...extra });
  const base = [
    mois(5, "VIR SEPA MME CLAIRE PETIT", 50000),
    mois(5, "CARTE 05/05/26 CARREFOUR CITY CB*1234", -20000),
    mois(6, "VIR SEPA MME CLAIRE PETIT", 50000),
    mois(6, "CARTE 05/06/26 CARREFOUR CITY CB*1234", -20000),
    mois(7, "VIR SEPA MME CLAIRE PETIT", 50000),
    mois(7, "CARTE 05/07/26 CARREFOUR CITY CB*1234", -20000),
  ];
  const don = mois(7, "VIR Virement de Jean MARTIN", 1000000);

  it("propose de mettre à part une opération qui dépasse à elle seule un mois habituel", () => {
    const enrichies = enrichir([...base, don]);
    expect(operationsInhabituelles(enrichies, "2026-07").map((o) => o.id)).toEqual([don.id]);
    expect(operationsInhabituelles(enrichies, "2026-06")).toEqual([]);
  });

  it("ne propose plus une opération sur laquelle on s'est prononcé, dans un sens ou dans l'autre", () => {
    expect(operationsInhabituelles(enrichir([...base, { ...don, horsBudget: true }]), "2026-07")).toEqual([]);
    expect(operationsInhabituelles(enrichir([...base, { ...don, horsBudget: false }]), "2026-07")).toEqual([]);
  });

  it("ne propose rien sur un seul mois, ni sous 1 000 €", () => {
    expect(operationsInhabituelles(enrichir([base[4], base[5], don]), "2026-07")).toEqual([]);
    const petit = mois(7, "VIR Virement de Jean MARTIN", 90000);
    expect(operationsInhabituelles(enrichir([...base, petit]), "2026-07")).toEqual([]);
  });

  it("sort du budget une opération mise à part, sans la perdre de vue", () => {
    const juillet = enrichir([base[4], base[5], { ...don, horsBudget: true }]);
    const b = bilan(juillet);
    expect(b.entrees).toBe(50000);
    expect(b.sorties).toBe(20000);
    expect(b.tauxEpargne).toBeCloseTo(0.6);
    expect(b).toMatchObject({ horsBudgetEntrant: 1000000, horsBudgetSortant: 0, horsBudgetNombre: 1 });
    expect(parMois(juillet)).toEqual([{ mois: "2026-07", entrees: 50000, sorties: 20000, net: 30000 }]);
  });
});
