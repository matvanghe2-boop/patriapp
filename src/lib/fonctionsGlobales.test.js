/**
 * Tests des fonctions globales ajoutées ensemble : comparateur fiscal,
 * transfert par QR codes, agenda financier, avances, santé des données,
 * annotations, journal d'erreurs et sauvegarde automatique.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  impotParPart, nombreParts, salairesImposables, impotFoyer, rattachementPossible, comparerRattachement,
} from "./rattachementFiscal";
import { genererCode, normaliserCode, emballer, deballer, decouper, lireMorceau, creerReception } from "./transfertQr";
import { zoneDeclaration, memeJourAnSuivant, evenementsAgenda, rappelsAgenda } from "./agendaFinancier";
import { vientDe, creerAvance, rapprocherAvances, soldesParPersonne, aRelancer } from "./avances";
import { controlesDonnees } from "./qualiteDonnees";
import { creerAnnotation, placerAnnotations, annotationsDeLAnnee, LONGUEUR_MAX } from "./annotations";
import { consignerErreur, lireJournal, viderJournal, rapportTexte } from "./journalErreurs";
import { sauvegardeDue, nomFichier } from "./sauvegardeAuto";

describe("comparateur rattachement / déclaration séparée", () => {
  it("applique le barème par tranches", () => {
    expect(impotParPart(11600)).toBe(0);
    expect(impotParPart(30000)).toBeCloseTo((29579 - 11600) * 0.11 + (30000 - 29579) * 0.3, 2);
  });

  it("compte les parts : demi-part pour les deux premiers enfants, part entière ensuite, case T", () => {
    expect(nombreParts({ couple: true, enfants: 0 })).toBe(2);
    expect(nombreParts({ couple: true, enfants: 2 })).toBe(3);
    expect(nombreParts({ couple: true, enfants: 3 })).toBe(4);
    expect(nombreParts({ couple: false, enfants: 1 })).toBe(1.5);
    expect(nombreParts({ couple: false, parentIsole: true, enfants: 1 })).toBe(2);
  });

  it("déduit 10 % des salaires, avec le minimum légal", () => {
    expect(salairesImposables(0)).toBe(0);
    expect(salairesImposables(3000)).toBe(2491);
    expect(salairesImposables(20000)).toBe(18000);
    expect(salairesImposables(300)).toBe(0);
  });

  it("plafonne l'avantage du quotient familial", () => {
    const r = impotFoyer({ revenu: 300000, couple: true, enfants: 1 });
    const sansEnfant = impotFoyer({ revenu: 300000, couple: true, enfants: 0 });
    expect(r.plafonne).toBe(true);
    expect(sansEnfant.net - r.net).toBe(1807);
  });

  it("applique la décote et le seuil de recouvrement", () => {
    const petit = impotFoyer({ revenu: 13000, couple: false });
    expect(petit.net).toBe(0);
    const moyen = impotFoyer({ revenu: 25000, couple: false });
    expect(moyen.decote).toBeGreaterThan(0);
    expect(moyen.net).toBe(moyen.brut - moyen.decote);
  });

  it("ferme le rattachement après 21 ans, ou 25 ans pour un étudiant", () => {
    expect(rattachementPossible({ age: 20 }).possible).toBe(true);
    expect(rattachementPossible({ age: 23, etudiant: true }).possible).toBe(true);
    expect(rattachementPossible({ age: 23, etudiant: false }).possible).toBe(false);
    expect(rattachementPossible({ age: 25, etudiant: true }).possible).toBe(false);
  });

  it("compare les trois façons de déclarer et désigne la moins chère", () => {
    const r = comparerRattachement({
      parents: { revenu: 60000, couple: true, autresEnfants: 1 },
      jeune: { salaires: 3000, aide: 4075, age: 19, etudiant: true },
    });
    expect(r.scenarios.map((s) => s.id)).toEqual(["rattache", "pension", "separe"]);
    expect(r.meilleur).toBe("pension");
    expect(r.ecart).toBe(122);
    const rattache = r.scenarios.find((s) => s.id === "rattache");
    expect(rattache.parents.parts).toBe(3);
    expect(rattache.parents.revenu).toBe(62491);
  });

  it("plafonne la pension déduite et retire le rattachement si l'âge l'interdit", () => {
    const r = comparerRattachement({ parents: { revenu: 80000 }, jeune: { aide: 9000, age: 24, etudiant: false } });
    expect(r.aidePlafonnee).toBe(true);
    expect(r.scenarios.find((s) => s.id === "pension").pension).toBe(6855);
    expect(r.scenarios.some((s) => s.id === "rattache")).toBe(false);
  });
});

describe("transfert par QR codes", () => {
  it("génère un code lisible de 10 caractères, sans caractères ambigus", () => {
    const code = genererCode();
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(code).not.toMatch(/[ILO01]/);
    expect(normaliserCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
  });

  it("chiffre puis déchiffre les données avec le bon code", async () => {
    const donnees = { livrets: [{ id: "a", name: "Livret A", balance: 1234.5 }], note: "é€" };
    const code = "ABCDE-FGHJK";
    const paquet = await emballer(donnees, code);
    expect(paquet).not.toContain("Livret");
    expect(await deballer(paquet, "abcde fghjk")).toEqual(donnees);
    await expect(deballer(paquet, "ZZZZZ-ZZZZZ")).rejects.toMatchObject({ name: "CodeIncorrect" });
  }, 20000);

  it("découpe, lit dans le désordre et réassemble le paquet", () => {
    const paquet = "x".repeat(1234);
    const trames = decouper(paquet, { id: "abcd", taille: 500 });
    expect(trames).toHaveLength(3);
    expect(lireMorceau(trames[1])).toMatchObject({ id: "abcd", index: 1, total: 3 });
    expect(lireMorceau("https://exemple.fr")).toBeNull();

    const reception = creerReception();
    expect(reception.ajouter(trames[2])).toMatchObject({ recus: 1, total: 3, complet: false });
    expect(reception.ajouter(trames[2]).nouveau).toBe(false);
    reception.ajouter(trames[0]);
    expect(reception.assembler()).toBeNull();
    expect(reception.ajouter(trames[1]).complet).toBe(true);
    expect(reception.assembler()).toBe(paquet);
  });

  it("repart de zéro si un autre transfert apparaît", () => {
    const reception = creerReception();
    reception.ajouter(decouper("aaaa", { id: "un", taille: 2 })[0]);
    const r = reception.ajouter(decouper("bbbbbb", { id: "deux", taille: 2 })[0]);
    expect(r).toMatchObject({ recus: 1, total: 3 });
  });
});

describe("agenda financier", () => {
  it("place le département dans sa zone de déclaration", () => {
    expect(zoneDeclaration("13")).toBe(1);
    expect(zoneDeclaration("2A")).toBe(2);
    expect(zoneDeclaration("54")).toBe(2);
    expect(zoneDeclaration("75")).toBe(3);
    expect(zoneDeclaration("974")).toBe(3);
    expect(zoneDeclaration("")).toBeNull();
  });

  it("décale une date d'un an en gardant le jour de la semaine", () => {
    const d = memeJourAnSuivant("2026-05-21");
    expect(new Date(`${d}T12:00:00Z`).getUTCDay()).toBe(new Date("2026-05-21T12:00:00Z").getUTCDay());
    expect(d.startsWith("2027-05")).toBe(true);
  });

  it("liste les dates des douze prochains mois, estimées quand le calendrier n'est pas publié", () => {
    const evts = evenementsAgenda({
      aujourdhui: "2026-10-31",
      departement: "75",
      livrets: [{ id: "l", name: "Livret A" }],
      bourse: { peaOuverture: "2022-03-15" },
    });
    const ids = evts.map((e) => e.id);
    expect(ids).toContain("interets-2026");
    expect(ids).toContain("revision-2027-02");
    expect(ids).toContain("pea-5");
    const limite = evts.find((e) => e.id === "declaration-limite-2027");
    expect(limite.estimee).toBe(true);
    expect(limite.detail).toContain("Zone 3");
    expect(evts.every((e) => e.date >= "2026-10-31" && e.date <= "2027-10-31")).toBe(true);
    expect([...evts].sort((a, b) => a.date.localeCompare(b.date))).toEqual(evts);
  });

  it("rappelle la veille, sauf ce qui a déjà été vu", () => {
    const evts = [{ id: "interets-2026", date: "2026-12-31", titre: "Intérêts", estimee: false }];
    expect(rappelsAgenda(evts, { aujourdhui: "2026-12-30" })).toHaveLength(1);
    expect(rappelsAgenda(evts, { aujourdhui: "2026-12-29" })).toHaveLength(0);
    expect(rappelsAgenda(evts, { aujourdhui: "2026-12-30", vus: ["interets-2026"] })).toHaveLength(0);
  });
});

describe("qui me doit quoi", () => {
  const virement = (id, date, euros, contrepartie) => ({ id, date, montant: euros * 100, analyse: { type: "virement", contrepartie, titre: `VIR ${contrepartie}` } });

  it("reconnaît l'émetteur d'un virement par les mots de son nom", () => {
    expect(vientDe(virement("v", "2026-01-01", 10, "M LUCAS MARTIN"), "Lucas Martin")).toBe(true);
    expect(vientDe(virement("v", "2026-01-01", 10, "LUCAS DURAND"), "Lucas Martin")).toBe(false);
  });

  it("refuse une avance sans personne ou sans montant", () => {
    expect(creerAvance({ id: "a", personne: "", montant: "10" })).toBeNull();
    expect(creerAvance({ id: "a", personne: "Léa", montant: "0" })).toBeNull();
    expect(creerAvance({ id: "a", personne: "Léa", montant: "12,5", date: "2026-01-01" })).toMatchObject({ montant: 12.5 });
  });

  it("solde les avances dans l'ordre, partiellement s'il le faut", () => {
    const avances = [
      creerAvance({ id: "a1", personne: "Lucas Martin", montant: 30, date: "2026-01-05" }),
      creerAvance({ id: "a2", personne: "Lucas Martin", montant: 20, date: "2026-01-10" }),
      creerAvance({ id: "a3", personne: "Léa", montant: 15, date: "2026-01-02" }),
    ];
    const ops = [virement("v0", "2026-01-01", 50, "LUCAS MARTIN"), virement("v1", "2026-01-20", 40, "LUCAS MARTIN")];
    const r = rapprocherAvances(avances, ops);
    const parId = Object.fromEntries(r.map((x) => [x.avance.id, x]));
    // Le virement antérieur aux avances ne compte pas.
    expect(parId.a1).toMatchObject({ statut: "rembourse", reste: 0 });
    expect(parId.a2).toMatchObject({ statut: "partiel", reste: 10 });
    expect(parId.a3.statut).toBe("du");

    const soldes = soldesParPersonne(r);
    expect(soldes.map((s) => [s.personne, s.du])).toEqual([["Léa", 15], ["Lucas Martin", 10]]);
    expect(aRelancer(r, { aujourdhui: "2026-02-05" }).map((s) => s.personne)).toEqual(["Léa"]);
  });

  it("tient compte d'un remboursement marqué à la main", () => {
    const a = { ...creerAvance({ id: "a", personne: "Léa", montant: 15, date: "2026-01-02" }), rembourseManuel: { date: "2026-01-03" } };
    expect(rapprocherAvances([a], [])[0].statut).toBe("rembourse");
  });
});

describe("santé des données", () => {
  it("signale ce qui fausse un calcul", () => {
    const controles = controlesDonnees(
      {
        livrets: [
          { id: "1", name: "Livret A", balance: 100, rate: 0 },
          { id: "2", name: "Livret A", balance: 100, rate: 1.7 },
        ],
        enveloppes: [{ id: "e", label: "Vacances", livretId: "absent" }],
        bourse: { positions: [{ id: "p", ticker: "CW8", quantity: 2, current_price: 0, pru: 0 }], operations: [{ date: "2030-01-01" }] },
      },
      { aujourdhui: "2026-10-31" }
    );
    const ids = controles.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["livret-taux-1", "livret-doublon-livret a", "enveloppe-orpheline-e", "pos-cours-p", "pos-pru-p", "operations-futures"]));
    expect(controles.every((c) => ["attention", "info"].includes(c.gravite) && c.lien?.onglet)).toBe(true);
  });

  it("ne dit rien de données saines", () => {
    expect(controlesDonnees({ livrets: [{ id: "1", name: "Livret A", balance: 100, rate: 1.7 }] }, { aujourdhui: "2026-10-31" })).toEqual([]);
  });
});

describe("annotations de la courbe", () => {
  it("valide et tronque le texte", () => {
    expect(creerAnnotation({ id: "a", date: "2026-01-01", texte: "  " })).toBeNull();
    expect(creerAnnotation({ id: "a", date: "hier", texte: "Salaire" })).toBeNull();
    expect(creerAnnotation({ id: "a", date: "2026-01-01", texte: "x".repeat(200) }).texte).toHaveLength(LONGUEUR_MAX);
  });

  it("pose chaque annotation sur le dernier relevé connu à sa date", () => {
    const points = [
      { date: "2026-01-01", cle: "j1", value: 100 },
      { date: "2026-02-01", cle: "f1", value: 200 },
      { date: "2026-03-01", cle: "m1", value: 300 },
    ];
    const annotations = [
      { id: "a", date: "2026-02-15", texte: "Job d'été" },
      { id: "b", date: "2026-02-01", texte: "Aide" },
      { id: "c", date: "2025-12-01", texte: "Avant la courbe" },
    ];
    const groupes = placerAnnotations(annotations, points, "value");
    expect(groupes).toHaveLength(1);
    expect(groupes[0].point.cle).toBe("f1");
    expect(groupes[0].annotations.map((a) => a.id)).toEqual(["b", "a"]);
    expect(annotationsDeLAnnee(annotations, 2026).map((a) => a.id)).toEqual(["b", "a"]);
  });
});

describe("journal d'erreurs", () => {
  beforeEach(() => viderJournal());

  it("consigne, regroupe les répétitions et produit un rapport", () => {
    consignerErreur(new Error("Boum"), { source: "rendu" });
    consignerErreur(new Error("Boum"), { source: "rendu" });
    consignerErreur("Autre chose");
    const journal = lireJournal();
    expect(journal).toHaveLength(2);
    expect(journal[0].occurrences).toBe(2);
    expect(rapportTexte(journal, { navigateur: "Test" })).toContain("rendu ×2");
  });

  it("ne garde que les 50 dernières erreurs", () => {
    for (let i = 0; i < 60; i += 1) consignerErreur(`Erreur ${i}`);
    const journal = lireJournal();
    expect(journal).toHaveLength(50);
    expect(journal[49].message).toBe("Erreur 59");
  });
});

describe("sauvegarde automatique", () => {
  it("est due au bout de sept jours, ou si elle n'a jamais été faite", () => {
    expect(sauvegardeDue(null, "2026-10-31")).toBe(true);
    expect(sauvegardeDue("2026-10-25T08:00:00.000Z", "2026-10-31")).toBe(false);
    expect(sauvegardeDue("2026-10-24", "2026-10-31")).toBe(true);
    expect(nomFichier("2026-10-31")).toBe("patrium-sauvegarde-2026-10-31.json");
  });
});
