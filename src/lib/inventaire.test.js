import { describe, it, expect } from "vitest";
import {
  CATEGORIES_OBJETS,
  categorieObjet,
  valeurObjet,
  garantieObjet,
  totauxInventaire,
  trierObjets,
  normaliserObjet,
  nouvelObjet,
  objetDepuisFacture,
} from "./inventaire";
import { normaliserCoffre, COFFRE_VIDE } from "./coffre";
import { fusionnerCoffres } from "./coffreArchive";

const AUJOURDHUI = "2026-11-02";
const objet = (champs) => ({ id: "o", nom: "Objet", categorie: "autre", prix: null, ...champs });

describe("valeurObjet", () => {
  it("applique la vétusté annuelle de la catégorie au prix d'achat", () => {
    // Ordinateur à 1 200 € acheté il y a deux ans : 1 200 × 0,75² = 675 €.
    const ordi = objet({ categorie: "informatique", prix: 1200, dateAchat: "2024-11-02" });
    expect(valeurObjet(ordi, AUJOURDHUI)).toEqual({ valeur: 675, estimee: true });
  });

  it("ne descend pas sous le plancher de la catégorie", () => {
    const vieux = objet({ categorie: "telephonie", prix: 900, dateAchat: "2010-01-01" });
    expect(valeurObjet(vieux, AUJOURDHUI).valeur).toBe(90);
  });

  it("ne déprécie pas un objet de valeur", () => {
    const montre = objet({ categorie: "valeur", prix: 2500, dateAchat: "2015-06-01" });
    expect(valeurObjet(montre, AUJOURDHUI).valeur).toBe(2500);
  });

  it("préfère la valeur saisie, et rend le prix sans date d'achat", () => {
    expect(valeurObjet(objet({ prix: 500, valeurManuelle: 320, dateAchat: "2020-01-01" }), AUJOURDHUI)).toEqual({
      valeur: 320,
      estimee: false,
    });
    expect(valeurObjet(objet({ prix: 500 }), AUJOURDHUI).valeur).toBe(500);
    expect(valeurObjet(objet({}), AUJOURDHUI).valeur).toBeNull();
  });

  it("n'augmente pas la valeur d'un achat daté dans le futur", () => {
    expect(valeurObjet(objet({ prix: 300, dateAchat: "2027-01-01" }), AUJOURDHUI).valeur).toBe(300);
  });
});

describe("garantieObjet", () => {
  const facture = { id: "f", type: "facture", titre: "Facture lave-linge", echeance: "2027-05-10" };

  it("prend la fin de garantie de la facture liée", () => {
    const g = garantieObjet(objet({ factureId: "f", dateAchat: "2025-05-10" }), [facture], AUJOURDHUI);
    expect(g).toEqual({ fin: "2027-05-10", source: "facture", active: true });
  });

  it("à défaut, la date saisie, puis la garantie légale de deux ans", () => {
    expect(garantieObjet(objet({ garantieFin: "2026-10-01" }), [], AUJOURDHUI)).toEqual({
      fin: "2026-10-01",
      source: "saisie",
      active: false,
    });
    expect(garantieObjet(objet({ dateAchat: "2025-03-15" }), [], AUJOURDHUI)).toEqual({
      fin: "2027-03-15",
      source: "legale",
      active: true,
    });
    expect(garantieObjet(objet({}), [], AUJOURDHUI)).toEqual({ fin: null, source: null, active: false });
  });

  it("ignore une facture supprimée ou un document qui n'est pas une facture", () => {
    const g = garantieObjet(objet({ factureId: "disparue", dateAchat: "2025-03-15" }), [facture], AUJOURDHUI);
    expect(g.source).toBe("legale");
    const bail = { id: "b", type: "bail", echeance: "2030-01-01" };
    expect(garantieObjet(objet({ factureId: "b", dateAchat: "2025-03-15" }), [bail], AUJOURDHUI).source).toBe("legale");
  });
});

describe("totaux et tri", () => {
  const objets = [
    objet({ id: "a", nom: "Vélo", categorie: "mobilite", prix: 800, dateAchat: "2025-11-02" }),
    objet({ id: "b", nom: "Canapé", categorie: "mobilier", prix: 1000, valeurManuelle: 400 }),
    objet({ id: "c", nom: "Lampe" }),
  ];

  it("additionne les prix d'achat et les valeurs du jour", () => {
    expect(totauxInventaire(objets, AUJOURDHUI)).toEqual({ nombre: 3, achat: 1800, valeur: 680 + 400 });
  });

  it("classe par valeur du jour, les objets sans valeur en dernier", () => {
    expect(trierObjets(objets, AUJOURDHUI).map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
});

describe("saisie", () => {
  it("ramène la saisie à la forme stockée", () => {
    expect(
      normaliserObjet({
        nom: "  MacBook ",
        categorie: "inconnue",
        prix: "1 299,99",
        valeurManuelle: "",
        dateAchat: "2025-09-01",
        garantieFin: "pas une date",
        factureId: "doc_1",
        numeroSerie: " C02XYZ ",
      })
    ).toEqual({
      nom: "MacBook",
      categorie: "autre",
      dateAchat: "2025-09-01",
      prix: 1299.99,
      valeurManuelle: null,
      garantieFin: null,
      factureId: "doc_1",
      numeroSerie: "C02XYZ",
      notes: "",
    });
    expect(normaliserObjet({ prix: "-5" }).prix).toBeNull();
    expect(nouvelObjet({ nom: "Vélo" }, "2026-11-02T10:00:00.000Z")).toMatchObject({
      nom: "Vélo",
      creeLe: "2026-11-02T10:00:00.000Z",
    });
  });

  it("préremplit un objet depuis sa facture", () => {
    expect(objetDepuisFacture({ id: "d", type: "facture", titre: "Lave-linge Bosch", dateDocument: "2025-05-10" })).toEqual({
      nom: "Lave-linge Bosch",
      dateAchat: "2025-05-10",
      factureId: "d",
    });
    expect(objetDepuisFacture({ id: "d", type: "facture", titre: "Facture" }).nom).toBe("");
  });

  it("chaque catégorie a un taux et un plancher cohérents", () => {
    for (const c of CATEGORIES_OBJETS) {
      expect(c.tauxAnnuel).toBeGreaterThanOrEqual(0);
      expect(c.tauxAnnuel).toBeLessThan(1);
      expect(c.plancher).toBeGreaterThan(0);
    }
    expect(categorieObjet("nimporte").id).toBe("autre");
  });
});

describe("objets dans la clé du coffre", () => {
  it("la migration ajoute une liste vide, sans toucher à un coffre déjà complet", () => {
    expect(normaliserCoffre({ documents: [], reglages: { delais: {}, titreAgendaNeutre: false } }).objets).toEqual([]);
    expect(normaliserCoffre(COFFRE_VIDE)).toBe(COFFRE_VIDE);
  });

  it("l'archive rend les objets manquants sans écraser les autres", () => {
    const actuel = { ...COFFRE_VIDE, objets: [{ id: "a", nom: "Vélo (réparé)" }] };
    const archive = { ...COFFRE_VIDE, objets: [{ id: "a", nom: "Vélo" }, { id: "b", nom: "Canapé" }] };
    const { coffre, objetsRestaures } = fusionnerCoffres(actuel, archive);
    expect(coffre.objets.map((o) => o.nom)).toEqual(["Vélo (réparé)", "Canapé"]);
    expect(objetsRestaures).toBe(1);
  });
});
