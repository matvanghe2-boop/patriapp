import { describe, it, expect } from "vitest";
import {
  TYPES, CATEGORIES, typeDe, verifierFichier, TAILLE_MAX_FICHIER, ajouterAns, ajouterJours, prochaineEcheance,
  delaiRappel, statutDocument, echeanceEnClair, garantieParDefaut, filtrerDocuments, organiserDocuments,
  espaceUtilise, normaliserSaisie, nouveauDocument, normaliserCoffre, COFFRE_VIDE,
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
