import { describe, it, expect } from "vitest";
import {
  toNumber,
  toIsoDate,
  detectBroker,
  detectDocumentType,
  extractBoursoramaOrder,
  extractSingleOrder,
  extractStatementOrders,
  extractDividendLines,
  generatePseudoId,
  parseStatementText,
} from "./pdfParsing.js";

// L'extraction de relevés repose sur des expressions régulières calées à la
// main sur des mises en page réelles : c'est le code le plus fragile du projet
// (un changement de layout côté courtier le casse silencieusement). Ces tests
// figent les formats connus pour que toute régression soit visible.

describe("toNumber", () => {
  it.each([
    ["1 234,56", 1234.56],
    ["1234.56", 1234.56],
    ["1 752,00 €", 1752],
    ["-42,5", -42.5],
    ["10", 10],
  ])("%s -> %s", (input, expected) => {
    expect(toNumber(input)).toBe(expected);
  });

  it("renvoie null sur une valeur non numérique", () => {
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber("")).toBeNull();
  });
});

describe("toIsoDate", () => {
  it.each([
    ["12/03/2026", "2026-03-12"],
    ["12-03-2026", "2026-03-12"],
    ["12.03.2026", "2026-03-12"],
    ["2026-03-12", "2026-03-12"],
  ])("%s -> %s", (input, expected) => {
    expect(toIsoDate(input)).toBe(expected);
  });

  it("renvoie null sur une entrée vide ou non datée", () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate("pas une date")).toBeNull();
  });
});

describe("detectBroker", () => {
  it.each([
    ["Relevé BoursoBank du mois", "Boursorama"],
    ["FORTUNEO BANQUE", "Fortuneo"],
    ["Bourse Direct SA", "Bourse Direct"],
    ["Un courtier inconnu", "Inconnu"],
  ])("%s -> %s", (text, expected) => {
    expect(detectBroker(text)).toBe(expected);
  });
});

describe("detectDocumentType", () => {
  it("reconnaît un avis d'opéré", () => {
    expect(detectDocumentType("AVIS D'OPERE du jour")).toBe("avis_operation");
    expect(detectDocumentType("OPERATION DE BOURSE")).toBe("avis_operation");
  });

  it("reconnaît un relevé de dividendes en priorité", () => {
    expect(detectDocumentType("Relevé de compte — dividende versé")).toBe("releve_dividendes");
  });

  it("reconnaît un relevé de titres et un relevé d'espèces", () => {
    expect(detectDocumentType("PORTEFEUILLE TITRES au 31/12")).toBe("releve_titres");
    expect(detectDocumentType("Relevé espèces")).toBe("releve_especes");
  });

  it("renvoie inconnu par défaut", () => {
    expect(detectDocumentType("Facture EDF")).toBe("inconnu");
  });
});

describe("extractBoursoramaOrder", () => {
  const avis = [
    "BoursoBank",
    "OPERATION DE BOURSE",
    "Paris, le 12/03/2026",
    "ACHAT COMPTANT",
    "4 BNPP EASY S&P 500 UC.EUR ETF Référence : 010114511851",
    "Code ISIN : LU0980610952",
    "Cours exécuté : 22,50 EUR",
    "Montant brut Commission Frais Montant net au débit de votre compte",
    "90,00 EUR 1,99 EUR 0,30 EUR 92,29 EUR",
  ].join("\n");

  it("extrait un avis d'achat complet", () => {
    const o = extractBoursoramaOrder(avis, "Boursorama");
    expect(o.complete).toBe(true);
    expect(o.date).toBe("2026-03-12");
    expect(o.type).toBe("ACHAT");
    expect(o.quantity).toBe(4);
    expect(o.asset).toBe("BNPP EASY S&P 500 UC.EUR ETF");
    expect(o.price).toBe(22.5);
    expect(o.transactionId).toBe("010114511851");
  });

  it("additionne commission et taxe sur transactions financières", () => {
    expect(extractBoursoramaOrder(avis, "Boursorama").fees).toBeCloseTo(2.29, 6);
  });

  it("ne compte que la commission quand la colonne frais est absente", () => {
    const sansTtf = avis.replace("90,00 EUR 1,99 EUR 0,30 EUR 92,29 EUR", "90,00 EUR 1,99 EUR 91,99 EUR");
    expect(extractBoursoramaOrder(sansTtf, "Boursorama").fees).toBeCloseTo(1.99, 6);
  });

  it("reconnaît une vente", () => {
    const vente = avis.replace("ACHAT COMPTANT", "VENTE COMPTANT");
    expect(extractBoursoramaOrder(vente, "Boursorama").type).toBe("VENTE");
  });

  it("ne confond pas les secondes d'un horodatage avec une quantité", () => {
    // Régression : "15:33:06" ne doit pas être capté comme quantité.
    const avecHeure = avis.replace("ACHAT COMPTANT", "ACHAT COMPTANT\nExécuté à 15:33:06");
    expect(extractBoursoramaOrder(avecHeure, "Boursorama").quantity).toBe(4);
  });

  it("se replie sur l'ISIN si le libellé est illisible", () => {
    const sansLibelle = avis.replace("4 BNPP EASY S&P 500 UC.EUR ETF Référence : 010114511851", "");
    expect(extractBoursoramaOrder(sansLibelle, "Boursorama").asset).toBe("LU0980610952");
  });

  it("marque incomplet un document vide", () => {
    expect(extractBoursoramaOrder("", "Boursorama").complete).toBe(false);
  });
});

describe("extractSingleOrder", () => {
  it("extrait un avis générique champ par champ", () => {
    const text = [
      "Avis d'exécution",
      "Date d'exécution : 05/02/2026",
      "Achat",
      "Libellé de la valeur : AIR LIQUIDE",
      "Quantité exécutée : 15",
      "Cours unitaire : 175,20",
      "Frais de courtage : 2,50",
      "Référence de l'ordre : ORD12345",
    ].join("\n");
    const o = extractSingleOrder(text, "Fortuneo");
    expect(o).toMatchObject({
      complete: true,
      date: "2026-02-05",
      type: "ACHAT",
      quantity: 15,
      price: 175.2,
      fees: 2.5,
      transactionId: "ORD12345",
    });
    expect(o.asset).toContain("AIR LIQUIDE");
  });

  it("traduit « souscription » en ACHAT et « rachat » en VENTE", () => {
    expect(extractSingleOrder("Souscription valeur : X quantité : 1 cours : 1", "X").type).toBe("ACHAT");
    expect(extractSingleOrder("Rachat valeur : X quantité : 1 cours : 1", "X").type).toBe("VENTE");
  });

  it("met les frais à 0 quand aucun n'est mentionné", () => {
    expect(extractSingleOrder("Achat valeur : X quantité : 1 cours : 1 le 01/01/2026", "X").fees).toBe(0);
  });

  it("marque incomplet quand des champs manquent", () => {
    expect(extractSingleOrder("Achat de titres", "X").complete).toBe(false);
  });
});

describe("extractStatementOrders", () => {
  it("extrait plusieurs mouvements d'un relevé", () => {
    const text = [
      "Relevé de compte",
      "12/03/2026  ACHAT AIR LIQUIDE  10  175,20  1 752,00",
      "15/03/2026  VENTE TOTALENERGIES  5  60,10  300,50",
      "Ligne sans date à ignorer",
    ].join("\n");
    const orders = extractStatementOrders(text, "Fortuneo");
    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({ date: "2026-03-12", type: "ACHAT", quantity: 10, price: 175.2 });
    expect(orders[1]).toMatchObject({ date: "2026-03-15", type: "VENTE", quantity: 5, price: 60.1 });
  });

  it("ignore les lignes sans type d'opération ou sans assez de nombres", () => {
    expect(extractStatementOrders("12/03/2026 VIREMENT RECU 500,00", "X")).toEqual([]);
    expect(extractStatementOrders("12/03/2026 ACHAT X 10", "X")).toEqual([]);
  });

  it("génère un identifiant de déduplication par ligne", () => {
    const orders = extractStatementOrders("12/03/2026  ACHAT AIR LIQUIDE  10  175,20  1 752,00", "X");
    expect(orders[0].transactionId).toBe(generatePseudoId("12/03/2026", "AIR LIQUIDE", "ACHAT", 10, 175.2));
  });

  it("lit un séparateur de milliers sans le confondre avec deux colonnes", () => {
    // « 1 752,00 » est un seul nombre ; « 10   175,20 » en est deux.
    const orders = extractStatementOrders("12/03/2026  ACHAT X  1 200  1 752,00  2 102 400,00", "X");
    expect(orders[0].quantity).toBe(1200);
    expect(orders[0].price).toBe(1752);
  });

  it("classe « rachat » comme une VENTE et non comme un achat", () => {
    // Régression : « rachat » contient « achat » — un test de sous-chaîne
    // enregistrait la sortie de parts comme une entrée.
    const orders = extractStatementOrders("12/03/2026  RACHAT FONDS EURO  10  100,00", "X");
    expect(orders[0].type).toBe("VENTE");
  });

  it("renvoie un tableau vide sur un texte sans mouvement", () => {
    expect(extractStatementOrders("", "X")).toEqual([]);
  });
});

describe("extractDividendLines", () => {
  it("extrait un coupon avec son montant", () => {
    const text = "20/05/2026  Dividende AIR LIQUIDE  3,20";
    const [d] = extractDividendLines(text, "Boursorama");
    expect(d.type).toBe("DIVIDENDE");
    expect(d.date).toBe("2026-05-20");
    expect(d.amount).toBe(3.2);
    expect(d.complete).toBe(true);
  });

  it("ignore les lignes qui ne parlent pas de dividende", () => {
    expect(extractDividendLines("20/05/2026 ACHAT AIR LIQUIDE 10 175,20", "X")).toEqual([]);
  });
});

describe("parseStatementText (orchestration)", () => {
  it("route un relevé de dividendes vers le bon extracteur", () => {
    const r = parseStatementText("20/05/2026  Dividende AIR LIQUIDE  3,20");
    expect(r.documentType).toBe("releve_dividendes");
    expect(r.orders[0].type).toBe("DIVIDENDE");
  });

  it("route un avis Boursorama vers le parseur dédié", () => {
    const r = parseStatementText(
      [
        "BoursoBank",
        "OPERATION DE BOURSE",
        "le 12/03/2026",
        "ACHAT COMPTANT",
        "4 BNPP EASY ETF Référence : 010114511851",
        "Cours exécuté : 22,50 EUR",
      ].join("\n")
    );
    expect(r.broker).toBe("Boursorama");
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0].complete).toBe(true);
    expect(r.rawExcerpt).toBeUndefined();
  });

  it("joint un extrait du texte brut quand rien n'est exploitable", () => {
    const r = parseStatementText("Document totalement illisible pour le parseur");
    expect(r.orders.some((o) => o.complete)).toBe(false);
    expect(r.rawExcerpt).toContain("Document totalement illisible");
  });

  it("tolère une entrée vide sans planter", () => {
    expect(() => parseStatementText("")).not.toThrow();
    expect(() => parseStatementText(null)).not.toThrow();
  });

  it("complète un avis Boursorama partiel avec le parseur générique", () => {
    // Layout Boursorama reconnu pour le type/la date, mais quantité et cours
    // seulement exprimés au format générique.
    const r = parseStatementText(
      [
        "Boursorama",
        "AVIS D'OPERE",
        "le 12/03/2026",
        "Achat",
        "Valeur : AIR LIQUIDE",
        "Quantité : 10",
        "Cours : 175,20",
      ].join("\n")
    );
    expect(r.orders[0].date).toBe("2026-03-12");
    expect(r.orders[0].quantity).toBe(10);
    expect(r.orders[0].complete).toBe(true);
  });
});
