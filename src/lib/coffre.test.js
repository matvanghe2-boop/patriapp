import { describe, it, expect } from "vitest";
import {
  TYPES, CATEGORIES, typeDe, verifierFichier, TAILLE_MAX_FICHIER, ajouterAns, ajouterJours, prochaineEcheance,
  delaiRappel, statutDocument, echeanceEnClair, garantieParDefaut, filtrerDocuments, organiserDocuments,
  espaceUtilise, normaliserSaisie, nouveauDocument, normaliserCoffre, COFFRE_VIDE, contratLie,
  echeancesDuCoffre, aFaireDuCoffre, rappelsCoffreDus, acquitterRappelCoffre,
} from "./coffre";
import { migrer, VERSION_DONNEES } from "./migrations";

const AUJOURDHUI = "2026-11-02";
const doc = (champs) => ({ id: "d", type: "autre", titre: "Doc", fichiers: [], notes: "", recurrence: null, ...champs });

describe("types de documents", () => {
  it("chaque type appartient à une catégorie connue", () => {
    const ids = new Set(CATEGORIES.map((c) => c.id));
    for (const t of TYPES) expect(ids.has(t.categorie)).toBe(true);
  });

  it("un type inconnu se lit « Autre »", () => {
    expect(typeDe("type_futur").id).toBe("autre");
    expect(typeDe(undefined).id).toBe("autre");
  });
});

describe("verifierFichier", () => {
  const fichier = (type, size) => ({ name: "x", type, size });

  it("accepte un PDF ou une image raisonnable", () => {
    expect(verifierFichier(fichier("application/pdf", 400_000))).toBeNull();
    expect(verifierFichier(fichier("image/jpeg", 2_000_000))).toBeNull();
  });

  it("refuse un format inconnu, un fichier vide ou trop lourd", () => {
    expect(verifierFichier(fichier("application/zip", 10))).toMatch(/Format/);
    expect(verifierFichier(fichier("application/pdf", 0))).toMatch(/vide/);
    expect(verifierFichier(fichier("application/pdf", TAILLE_MAX_FICHIER + 1))).toMatch(/20 Mo/);
    expect(verifierFichier(null)).toMatch(/Choisis/);
  });
});

describe("dates", () => {
  it("ajoute des années en gardant le 29 février quand il existe", () => {
    expect(ajouterAns("2028-02-29", 1)).toBe("2029-02-28");
    expect(ajouterAns("2028-02-29", 4)).toBe("2032-02-29");
    expect(ajouterAns("2026-11-02", 2)).toBe("2028-11-02");
  });

  it("ajoute ou retire des jours en passant les fins de mois", () => {
    expect(ajouterJours("2026-03-01", -1)).toBe("2026-02-28");
    expect(ajouterJours("2031-03-11", -120)).toBe("2030-11-11");
  });

  it("fait avancer l'échéance passée d'un contrat annuel, depuis la date saisie", () => {
    expect(prochaineEcheance(doc({ echeance: "2024-01-01", recurrence: "annuelle" }), AUJOURDHUI)).toBe("2027-01-01");
    expect(prochaineEcheance(doc({ echeance: "2024-02-29", recurrence: "annuelle" }), "2028-01-10")).toBe("2028-02-29");
    expect(prochaineEcheance(doc({ echeance: "2024-01-01" }), AUJOURDHUI)).toBe("2024-01-01");
    expect(prochaineEcheance(doc({ echeance: null }), AUJOURDHUI)).toBeNull();
    expect(prochaineEcheance(doc({ echeance: "pas une date" }), AUJOURDHUI)).toBeNull();
  });
});

describe("délai de rappel", () => {
  it("prend le délai du document, sinon des réglages, sinon du type", () => {
    expect(delaiRappel(doc({ type: "passeport" }))).toBe(120);
    expect(delaiRappel(doc({ type: "passeport" }), { delais: { passeport: 150 } })).toBe(150);
    expect(delaiRappel(doc({ type: "passeport", rappelJours: 30 }), { delais: { passeport: 150 } })).toBe(30);
    expect(delaiRappel(doc({ type: "diplome" }))).toBeNull();
  });

  it("accepte un délai nul (prévenir le jour même)", () => {
    expect(delaiRappel(doc({ type: "passeport", rappelJours: 0 }))).toBe(0);
  });
});

describe("statutDocument", () => {
  it("sans échéance, le document n'a rien à signaler", () => {
    expect(statutDocument(doc({ type: "diplome" }), {}, AUJOURDHUI).statut).toBe("aucune");
  });

  it("un passeport passe « à prévoir » quatre mois avant d'expirer, pas la veille", () => {
    const passeport = doc({ type: "passeport", echeance: "2027-03-11" });
    expect(statutDocument(passeport, {}, "2026-11-10").statut).toBe("a_jour");
    const s = statutDocument(passeport, {}, "2026-11-11");
    expect(s.statut).toBe("a_prevoir");
    expect(s.rappel).toBe("2026-11-11");
    expect(s.jours).toBe(120);
  });

  it("le jour de l'échéance est encore « à prévoir », le lendemain c'est échu", () => {
    const attestation = doc({ type: "attestation_assurance", echeance: AUJOURDHUI });
    expect(statutDocument(attestation, {}, AUJOURDHUI).statut).toBe("a_prevoir");
    expect(statutDocument(attestation, {}, "2026-11-03").statut).toBe("expire");
  });

  it("une échéance sans délai de rappel n'est jamais « à prévoir », seulement échue", () => {
    const quittance = doc({ type: "quittance", echeance: "2026-11-05" });
    expect(statutDocument(quittance, {}, AUJOURDHUI).statut).toBe("a_jour");
    expect(statutDocument(quittance, {}, "2026-11-06").statut).toBe("expire");
  });

  it("un contrat annuel n'est jamais échu : son échéance avance", () => {
    const contrat = doc({ type: "contrat_assurance", echeance: "2025-01-01", recurrence: "annuelle" });
    const s = statutDocument(contrat, {}, AUJOURDHUI);
    expect(s.echeance).toBe("2027-01-01");
    expect(s.statut).toBe("a_prevoir");
  });
});

describe("echeanceEnClair", () => {
  it("donne l'ordre de grandeur qui parle", () => {
    expect(echeanceEnClair({ statut: "a_prevoir", echeance: "2027-03-11", jours: 120 })).toBe("échéance dans 4 mois");
    expect(echeanceEnClair({ statut: "a_prevoir", echeance: AUJOURDHUI, jours: 0 })).toBe("échéance aujourd'hui");
    expect(echeanceEnClair({ statut: "expire", echeance: "2026-10-21", jours: -12 })).toBe("échu depuis 12 jours");
    expect(echeanceEnClair({ statut: "a_jour", echeance: "2033-04-04", jours: 2345 })).toBe("jusqu'au 04/04/2033");
    expect(echeanceEnClair({ statut: "aucune" })).toBe("");
  });
});

describe("garantieParDefaut", () => {
  it("propose la date d'achat + 2 ans pour une facture, rien pour un autre type", () => {
    expect(garantieParDefaut("facture", "2026-09-15")).toBe("2028-09-15");
    expect(garantieParDefaut("passeport", "2026-09-15")).toBeNull();
    expect(garantieParDefaut("facture", "")).toBeNull();
  });
});

describe("liste", () => {
  const documents = [
    doc({ id: "a", type: "passeport", titre: "Passeport", echeance: "2027-01-15" }),
    doc({ id: "b", type: "cni", titre: "Carte d'identité", echeance: "2033-04-04" }),
    doc({ id: "c", type: "facture", titre: "Lave-linge", echeance: "2026-10-01", notes: "Darty, garantie 2 ans" }),
    doc({ id: "d", type: "diplome", titre: "Baccalauréat" }),
  ];

  it("met en tête ce qui demande d'agir, par échéance la plus proche, et groupe le reste par catégorie", () => {
    const { aTraiter, groupes } = organiserDocuments(documents, {}, AUJOURDHUI);
    expect(aTraiter.map((e) => e.doc.id)).toEqual(["c", "a"]);
    expect(groupes.map((g) => g.categorie.id)).toEqual(["identite", "etudes"]);
    expect(groupes[0].entrees.map((e) => e.doc.id)).toEqual(["b"]);
  });

  it("cherche sans accents dans le titre, le type, la catégorie et les notes", () => {
    expect(filtrerDocuments(documents, "darty").map((d) => d.id)).toEqual(["c"]);
    expect(filtrerDocuments(documents, "identite").map((d) => d.id)).toEqual(["a", "b"]);
    expect(filtrerDocuments(documents, "baccalaureat").map((d) => d.id)).toEqual(["d"]);
    expect(filtrerDocuments(documents, "  ")).toBe(documents);
  });

  it("additionne la taille des fichiers", () => {
    expect(espaceUtilise([doc({ fichiers: [{ taille: 1000 }, { taille: 500 }] }), doc({ fichiers: [{ taille: 24 }] })])).toBe(1524);
  });
});

describe("saisie", () => {
  it("ramène la saisie du formulaire à la forme stockée", () => {
    expect(
      normaliserSaisie({ type: "passeport", titre: "  ", dateDocument: "2021-03-12", echeance: "", rappelJours: "", notes: " n° 12AB " })
    ).toEqual({
      type: "passeport",
      titre: "Passeport",
      dateDocument: "2021-03-12",
      echeance: null,
      recurrence: null,
      rappelJours: null,
      notes: "n° 12AB",
      contratId: null,
    });
    expect(normaliserSaisie({ type: "inconnu", rappelJours: "45" })).toMatchObject({ type: "autre", rappelJours: 45 });
    expect(normaliserSaisie({ type: "cni", rappelJours: "-3" }).rappelJours).toBeNull();
  });

  it("crée un document daté, avec ses fichiers", () => {
    const d = nouveauDocument({ type: "cni" }, [{ id: "f1" }], "2026-11-02T10:00:00.000Z");
    expect(d.id).toMatch(/^doc_/);
    expect(d.fichiers).toEqual([{ id: "f1" }]);
    expect(d.creeLe).toBe("2026-11-02T10:00:00.000Z");
  });
});

describe("migration de la clé « coffre »", () => {
  it("rend la même référence quand tout est en ordre", () => {
    const coffre = { ...COFFRE_VIDE, documents: [doc({})] };
    expect(normaliserCoffre(coffre)).toBe(coffre);
    expect(migrer("coffre", coffre)).toBe(coffre);
  });

  it("complète ce qui manque sans rien retirer", () => {
    const abime = { documents: [{ id: "x", titre: "Vieux", champInconnu: 1 }], reglages: { delais: [] } };
    const migre = migrer("coffre", abime);
    expect(migre.version).toBe(1);
    expect(migre.documents[0]).toMatchObject({ id: "x", titre: "Vieux", champInconnu: 1, fichiers: [], notes: "", recurrence: null });
    expect(migre.reglages).toEqual({ delais: {}, titreAgendaNeutre: false });
    expect(normaliserCoffre(migre)).toBe(migre);
  });

  it("garde une récurrence inconnue, écrite par une version plus récente", () => {
    const futur = { ...COFFRE_VIDE, documents: [doc({ recurrence: "mensuelle" })] };
    expect(normaliserCoffre(futur)).toBe(futur);
  });

  it("fait passer la version des données à 3", () => {
    expect(VERSION_DONNEES).toBe(3);
  });
});

describe("contrats liés à Abonnements", () => {
  const contrat = { id: "c1", label: "Assurance habitation", date_fin: "2027-01-01", preavis_jours: 30 };

  it("ne lie que les types prévus pour, et seulement à un contrat qui existe encore", () => {
    expect(contratLie(doc({ type: "contrat_assurance", contratId: "c1" }), [contrat])).toBe(contrat);
    expect(contratLie(doc({ type: "bail", contratId: "c1" }), [contrat])).toBe(contrat);
    expect(contratLie(doc({ type: "passeport", contratId: "c1" }), [contrat])).toBeNull();
    expect(contratLie(doc({ type: "contrat_assurance", contratId: "supprime" }), [contrat])).toBeNull();
    expect(normaliserSaisie({ type: "passeport", contratId: "c1" }).contratId).toBeNull();
    expect(normaliserSaisie({ type: "contrat_assurance", contratId: "c1" }).contratId).toBe("c1");
  });

  it("prend la fin du contrat pour échéance et sa date limite de résiliation pour rappel", () => {
    const papier = doc({ type: "contrat_assurance", echeance: "2030-06-01", recurrence: "annuelle", contratId: "c1" });
    const s = statutDocument(papier, {}, "2026-12-05", contrat);
    expect(s).toMatchObject({ echeance: "2027-01-01", rappel: "2026-12-02", statut: "a_prevoir" });
  });
});

describe("rappels hors de l'onglet", () => {
  const coffre = {
    ...COFFRE_VIDE,
    documents: [
      doc({ id: "pass", type: "passeport", titre: "Passeport", echeance: "2027-02-01" }),
      doc({ id: "cni", type: "cni", titre: "Carte d'identité", echeance: "2026-12-01" }),
      doc({ id: "lave", type: "facture", titre: "Lave-linge", echeance: "2026-10-20" }),
      doc({ id: "vieux", type: "facture", titre: "Vieux grille-pain", echeance: "2025-01-01" }),
      doc({ id: "lie", type: "contrat_assurance", titre: "Habitation", echeance: "2026-11-20", contratId: "c1" }),
      doc({ id: "dip", type: "diplome", titre: "Bac" }),
    ],
  };
  const contracts = [{ id: "c1", label: "Habitation", date_fin: "2026-11-20", preavis_jours: 10 }];

  it("donne à « Prochaines échéances » la date où agir, puis l'échéance une fois le rappel passé", () => {
    const liste = echeancesDuCoffre(coffre, { contracts, aujourdhui: "2026-10-01" });
    const pass = liste.find((e) => e.id === "coffre-pass");
    expect(pass).toMatchObject({ date: "2026-10-04", jours: 3, type: "papier", libelle: "Lancer le renouvellement — Passeport" });
    expect(pass.detail).toBe("échéance le 01/02/2027");
    const lave = liste.find((e) => e.id === "coffre-lave");
    expect(lave).toMatchObject({ date: "2026-10-20", libelle: "Échéance — Lave-linge" });
    // La carte d'identité a passé son rappel et son échéance est à plus de six semaines : elle est dans
    // « À faire », pas ici. Le contrat lié est dans Abonnements, le diplôme n'a pas de date, la vieille
    // facture est passée.
    expect(liste.map((e) => e.id).sort()).toEqual(["coffre-lave", "coffre-pass"]);
  });

  it("alimente « À faire » : à prévoir, et échu depuis moins d'un mois", () => {
    const liste = aFaireDuCoffre(coffre, { contracts, aujourdhui: AUJOURDHUI });
    const parId = Object.fromEntries(liste.map((e) => [e.id, e]));
    expect(parId["coffre-cni"]).toMatchObject({ urgence: "attention", type: "papier", lien: { onglet: "coffre", sous: "echeances" } });
    expect(parId["coffre-cni"].texte).toMatch(/^Carte d'identité : lancer le renouvellement — échéance le 1 déc/);
    expect(parId["coffre-lave"]).toMatchObject({ urgence: "critique" });
    expect(parId["coffre-lave"].texte).toMatch(/échu depuis le 20 oct/);
    expect(parId["coffre-vieux"]).toBeUndefined();
    expect(parId["coffre-lie"]).toBeUndefined();
    // Le passeport expire le 1er février : son délai de quatre mois est entamé depuis le 4 octobre.
    expect(parId["coffre-pass"]).toMatchObject({ urgence: "attention" });
  });

  it("passe en urgent la dernière semaine", () => {
    const liste = aFaireDuCoffre(coffre, { contracts, aujourdhui: "2026-11-25" });
    expect(liste.find((e) => e.id === "coffre-cni").urgence).toBe("critique");
  });

  it("notifie une fois par date de rappel, jusqu'à l'acquittement", () => {
    const dus = rappelsCoffreDus(coffre, { contracts, aujourdhui: AUJOURDHUI });
    expect(dus.map((r) => r.docId)).toEqual(["pass", "cni"]);
    const cni = dus[1];
    expect(cni).toMatchObject({ id: "coffre-cni-2026-08-03", type: "coffre", rappel: "2026-08-03" });
    expect(cni.label).toBe("Carte d'identité : lancer le renouvellement (échéance le 01/12/2026)");

    const acquitte = acquitterRappelCoffre(coffre, "cni", "2026-08-03");
    expect(rappelsCoffreDus(acquitte, { contracts, aujourdhui: AUJOURDHUI }).map((r) => r.docId)).toEqual(["pass"]);
    expect(acquitte.documents.find((d) => d.id === "pass")).toBe(coffre.documents[0]);
  });

  it("ne plante pas sur un coffre absent ou abîmé", () => {
    expect(echeancesDuCoffre(null)).toEqual([]);
    expect(aFaireDuCoffre({ documents: "?" })).toEqual([]);
    expect(rappelsCoffreDus(undefined)).toEqual([]);
  });
});
