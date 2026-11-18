import { describe, it, expect } from "vitest";
import { nouveautesParOnglet, ongletsAvecPastille, marquerVues } from "./pastilles";

const AUJ = "2026-11-17";

describe("nouveautés par onglet", () => {
  it("un identifiant par niveau de badge obtenu", () => {
    const n = nouveautesParOnglet({
      badges: { obtenus: { matelas: { niveau: 2 }, "premier-pas": { niveau: 1 } } },
      aujourdhui: AUJ,
    });
    expect(n.badges).toEqual(["premier-pas:1", "matelas:1", "matelas:2"]);
  });

  it("bourse : un dividende du dernier mois, les résultats publiés d'une valeur détenue", () => {
    const n = nouveautesParOnglet({
      bourse: {
        positions: [{ ticker: "AI.PA", quantity: 3 }],
        operations: [
          { id: "d1", type: "DIVIDENDE", date: "2026-11-10" },
          { id: "d0", type: "DIVIDENDE", date: "2026-08-10" },
          { id: "a1", type: "ACHAT", date: "2026-11-10" },
        ],
      },
      evenements: [
        { ticker: "AI.PA", type: "Résultats", date: "2026-11-12" },
        { ticker: "MC.PA", type: "Résultats", date: "2026-11-12" },
        { ticker: "AI.PA", type: "Résultats", date: "2026-11-30" },
      ],
      aujourdhui: AUJ,
    });
    expect(n.bourse).toEqual(["dividende:d1", "resultats:AI.PA:2026-11-12"]);
  });

  it("abonnements : un essai qui finit dans la semaine, un préavis qui approche", () => {
    const n = nouveautesParOnglet({
      subs: [
        { id: "e", statut: "essai", fin_essai: "2026-11-20" },
        { id: "loin", statut: "essai", fin_essai: "2026-12-20" },
      ],
      contracts: [{ id: "c", date_fin: "2026-12-31", preavis_jours: 30 }],
      aujourdhui: AUJ,
    });
    expect(n.abonnements).toEqual(["essai:e:2026-11-20", "preavis:c:2026-12-01"]);
  });

  it("stratégie : une thèse pas relue depuis six mois", () => {
    const n = nouveautesParOnglet({
      strategyNotes: [
        { id: "vieille", date: "2026-01-01T10:00:00Z" },
        { id: "fraiche", date: "2026-10-01T10:00:00Z" },
      ],
      aujourdhui: AUJ,
    });
    expect(n.strategie).toEqual(["relire:vieille:2026-01-01"]);
  });
});

describe("pastilles et vues", () => {
  it("allume un onglet tant qu'une nouveauté n'a pas été vue", () => {
    const nouveautes = { badges: ["matelas:1"], bourse: ["dividende:d1"], compte: [] };
    expect([...ongletsAvecPastille(nouveautes, {})].sort()).toEqual(["badges", "bourse"]);
    expect([...ongletsAvecPastille(nouveautes, { badges: ["matelas:1"] })]).toEqual(["bourse"]);
  });

  it("marquer comme vu ne garde que les nouveautés en cours, et ne réécrit rien d'inchangé", () => {
    const v1 = marquerVues({}, "badges", ["matelas:2", "matelas:1"]);
    expect(v1).toEqual({ badges: ["matelas:1", "matelas:2"] });
    expect(marquerVues(v1, "badges", ["matelas:1", "matelas:2"])).toBe(v1);
    expect(marquerVues(v1, "badges", ["matelas:3"])).toEqual({ badges: ["matelas:3"] });
  });
});
