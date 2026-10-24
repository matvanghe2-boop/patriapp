import { describe, it, expect } from "vitest";
import { fusionnerEvenements, statutYahoo, ecarterEstimationsDementies } from "./fusion.js";
import { estSymboleAmericain, enTetesSec, estActive } from "./edgar.js";

const MAINTENANT = new Date("2026-10-19T10:00:00Z");

describe("statutYahoo", () => {
  it("tient une fourchette de dates pour une estimation", () => {
    // Yahoo ne dit jamais « estimé ». Renvoyer un intervalle plutôt qu'un
    // jour est le seul aveu disponible : la société n'a pas communiqué.
    const e = { type: "Résultats", date: "2026-11-12", fourchette: { debut: "2026-11-10", fin: "2026-11-14" } };
    expect(statutYahoo(e, "2026-10-19")).toBe("estime");
  });

  it("tient une date ponctuelle à venir pour une estimation", () => {
    expect(statutYahoo({ type: "Résultats", date: "2026-11-12" }, "2026-10-19")).toBe("estime");
  });

  it("considère un événement déjà passé comme acquis", () => {
    expect(statutYahoo({ type: "Résultats", date: "2026-09-01" }, "2026-10-19")).toBe("confirme");
  });

  it("tient une date de dividende pour ferme", () => {
    // Un dividende est voté avant d'être annoncé : sa date ex n'est pas une
    // extrapolation, contrairement à une date de résultats.
    expect(statutYahoo({ type: "Dividende", date: "2026-12-01" }, "2026-10-19")).toBe("confirme");
  });
});

describe("fusionnerEvenements", () => {
  it("ne crée pas de doublon quand deux sources décrivent le même fait", () => {
    const yahoo = [{ ticker: "AAPL", type: "Résultats", date: "2026-10-30", label: "Résultats", fournisseur: "yahoo", statut: "estime" }];
    const sec = [{ ticker: "AAPL", type: "Résultats", date: "2026-10-30", label: "Rapport trimestriel (10-Q)", fournisseur: "sec-edgar", statut: "confirme" }];
    const out = fusionnerEvenements([yahoo, sec], { maintenant: MAINTENANT });
    expect(out).toHaveLength(1);
  });

  it("fait primer le dépôt réglementaire sur l'annonce", () => {
    const yahoo = [{ ticker: "AAPL", type: "Résultats", date: "2026-10-30", label: "Résultats", fournisseur: "yahoo", statut: "estime" }];
    const sec = [{ ticker: "AAPL", type: "Résultats", date: "2026-10-30", label: "Rapport trimestriel (10-Q)", fournisseur: "sec-edgar", statut: "confirme", lien: "https://sec.gov/x" }];
    const [e] = fusionnerEvenements([yahoo, sec], { maintenant: MAINTENANT });
    expect(e.fournisseur).toBe("sec-edgar");
    expect(e.label).toContain("10-Q");
    expect(e.lien).toBe("https://sec.gov/x");
    // Deux sources concordantes valent confirmation.
    expect(e.statut).toBe("confirme");
    expect(e.fournisseurs).toEqual(expect.arrayContaining(["yahoo", "sec-edgar"]));
  });

  it("conserve les estimations d'analystes que seule Yahoo porte", () => {
    const yahoo = [{ ticker: "AAPL", type: "Résultats", date: "2026-10-30", fournisseur: "yahoo", statut: "estime", estimates: { beneficeAttendu: 1.5 } }];
    const sec = [{ ticker: "AAPL", type: "Résultats", date: "2026-10-30", fournisseur: "sec-edgar", statut: "confirme" }];
    const [e] = fusionnerEvenements([yahoo, sec], { maintenant: MAINTENANT });
    // Le gagnant est EDGAR, mais il ne doit rien effacer de ce que l'autre
    // source était seule à savoir.
    expect(e.estimates).toEqual({ beneficeAttendu: 1.5 });
  });

  it("garde distincts deux événements de types différents le même jour", () => {
    const ev = [
      { ticker: "AAPL", type: "Résultats", date: "2026-10-30", fournisseur: "yahoo" },
      { ticker: "AAPL", type: "Dividende", date: "2026-10-30", fournisseur: "yahoo" },
    ];
    expect(fusionnerEvenements([ev], { maintenant: MAINTENANT })).toHaveLength(2);
  });

  it("horodate la fraîcheur et trie par date", () => {
    const ev = [
      { ticker: "B", type: "Résultats", date: "2026-11-02", fournisseur: "yahoo" },
      { ticker: "A", type: "Résultats", date: "2026-10-30", fournisseur: "yahoo" },
    ];
    const out = fusionnerEvenements([ev], { maintenant: MAINTENANT });
    expect(out.map((e) => e.date)).toEqual(["2026-10-30", "2026-11-02"]);
    expect(out[0].majLe).toBe(MAINTENANT.toISOString());
  });

  it("écarte une entrée sans date plutôt que de l'afficher sans repère", () => {
    expect(fusionnerEvenements([[{ ticker: "AAPL", type: "Résultats" }]], { maintenant: MAINTENANT })).toEqual([]);
  });
});

describe("source SEC — garde-fous", () => {
  it("ne retient que les symboles américains", () => {
    // EDGAR ne couvre que les sociétés enregistrées aux Etats-Unis : un
    // suffixe de place signale d'emblée une valeur hors périmètre.
    expect(estSymboleAmericain("AAPL")).toBe(true);
    expect(estSymboleAmericain("BRK-B")).toBe(true);
    expect(estSymboleAmericain("AI.PA")).toBe(false);
    expect(estSymboleAmericain("ADYEN.AS")).toBe(false);
    expect(estSymboleAmericain("^GSPC")).toBe(false);
  });

  it("reste éteinte sans en-tête de contact", () => {
    // La SEC exige un User-Agent nominatif et répond 403 sans lui : mieux
    // vaut ne pas appeler du tout que collectionner des refus.
    expect(enTetesSec({})).toBeNull();
    expect(estActive({})).toBe(false);
    expect(estActive({ SEC_USER_AGENT: "Patrium contact@exemple.fr" })).toBe(true);
  });
});

describe("info-financiere dans la fusion", () => {
  it("fait primer le dépôt français sur l'estimation Yahoo du même jour", () => {
    const yahoo = [{ ticker: "SOI.PA", type: "Résultats", date: "2026-11-18", label: "Publication des résultats", fournisseur: "yahoo", statut: "estime", estimates: { beneficeAttendu: 0.4 } }];
    const dila = [{ ticker: "SOI.PA", type: "Résultats", date: "2026-11-18", label: "Résultats du S1'27", fournisseur: "info-financiere", statut: "confirme" }];
    const [e] = fusionnerEvenements([yahoo, dila], { maintenant: MAINTENANT });
    expect(e).toMatchObject({ label: "Résultats du S1'27", statut: "confirme", fournisseur: "info-financiere" });
    // L'estimation d'analystes, que seul Yahoo portait, n'est pas perdue.
    expect(e.estimates).toEqual({ beneficeAttendu: 0.4 });
  });
});

describe("ecarterEstimationsDementies", () => {
  const estimation = (date, type = "Résultats") => ({ ticker: "VU.PA", type, date, fournisseur: "yahoo", statut: "estime" });
  const annonce = (date, type = "Résultats") => ({ ticker: "VU.PA", type, date, fournisseur: "info-financiere", statut: "confirme" });

  it("retire l'estimation que la société a remplacée par sa propre date", () => {
    // Yahoo extrapole le 12, la société annonce le 18 : afficher les deux
    // laissait une fausse date à côté de la vraie.
    const out = ecarterEstimationsDementies([estimation("2027-02-12"), annonce("2027-02-18")]);
    expect(out.map((e) => e.date)).toEqual(["2027-02-18"]);
  });

  it("traite chiffre d'affaires et résultats comme une même échéance", () => {
    // Yahoo ne distingue pas les deux publications.
    const out = ecarterEstimationsDementies([estimation("2027-01-25"), annonce("2027-01-29", "Chiffre d'affaires")]);
    expect(out).toHaveLength(1);
  });

  it("garde une estimation éloignée, ou d'une autre valeur", () => {
    const autre = { ...annonce("2027-02-18"), ticker: "AI.PA" };
    expect(ecarterEstimationsDementies([estimation("2027-07-28"), annonce("2027-02-18")])).toHaveLength(2);
    expect(ecarterEstimationsDementies([estimation("2027-02-12"), autre])).toHaveLength(2);
  });

  it("ne touche ni aux dates confirmées par Yahoo, ni aux dividendes", () => {
    const yahooConfirme = { ...estimation("2027-02-12"), statut: "confirme" };
    const dividende = estimation("2027-02-12", "Dividende");
    expect(ecarterEstimationsDementies([yahooConfirme, dividende, annonce("2027-02-18")])).toHaveLength(3);
  });
});
