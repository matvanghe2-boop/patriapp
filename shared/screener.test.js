import { describe, it, expect } from "vitest";
import {
  CRITERES,
  RECETTES,
  recetteParId,
  evaluerCritere,
  evaluerTitre,
  appliquerRecette,
  auditerPortefeuille,
  suggererDiversification,
  poidsSectoriels,
} from "./screener.js";

const titre = (o = {}) => ({
  symbole: "AI.PA",
  ok: true,
  per: 20,
  rendementPct: 2.5,
  payoutPct: 55,
  roePct: 14,
  margeNettePct: 13,
  priceToBook: 4,
  beta: 0.9,
  secteur: "Industrials",
  ...o,
});

describe("catalogue", () => {
  it("chaque critère de chaque recette existe dans le catalogue", () => {
    for (const r of RECETTES) {
      for (const c of r.criteres) {
        expect(CRITERES[c.cle], `${r.id} → ${c.cle}`).toBeDefined();
      }
    }
  });

  it("chaque recette explique sa doctrine", () => {
    for (const r of RECETTES) {
      expect(r.pourquoi.length).toBeGreaterThan(30);
    }
  });

  it("retrouve une recette par identifiant", () => {
    expect(recetteParId("value").nom).toBe("Value");
    expect(recetteParId("inexistante")).toBeNull();
  });
});

describe("evaluerCritere", () => {
  it("valide un critère de maximum", () => {
    expect(evaluerCritere(titre({ per: 12 }), { cle: "per", seuil: 15 }).statut).toBe("ok");
    expect(evaluerCritere(titre({ per: 22 }), { cle: "per", seuil: 15 }).statut).toBe("echec");
  });

  it("valide un critère de minimum", () => {
    expect(evaluerCritere(titre({ roePct: 20 }), { cle: "roePct", seuil: 15 }).statut).toBe("ok");
    expect(evaluerCritere(titre({ roePct: 5 }), { cle: "roePct", seuil: 15 }).statut).toBe("echec");
  });

  it("accepte l'égalité au seuil", () => {
    expect(evaluerCritere(titre({ per: 15 }), { cle: "per", seuil: 15 }).statut).toBe("ok");
  });

  it("rend « indéterminé » sur une donnée absente, jamais un échec", () => {
    // Un payout absent (société qui ne distribue pas) ne doit pas disqualifier
    // le titre pour une raison étrangère au critère.
    const r = evaluerCritere(titre({ payoutPct: null }), { cle: "payoutPct", seuil: 70 });
    expect(r.statut).toBe("indetermine");
    expect(r.valeur).toBeNull();
  });

  it("inverse le sens quand on le demande", () => {
    // positionFourchettePct est un critère de minimum ; inversé, il cherche
    // les titres BAS dans leur fourchette.
    const bas = evaluerCritere(titre({ positionFourchettePct: 20 }), {
      cle: "positionFourchettePct", seuil: 35, sensInverse: true,
    });
    expect(bas.statut).toBe("ok");
    const haut = evaluerCritere(titre({ positionFourchettePct: 80 }), {
      cle: "positionFourchettePct", seuil: 35, sensInverse: true,
    });
    expect(haut.statut).toBe("echec");
  });

  it("ignore un critère inconnu", () => {
    expect(evaluerCritere(titre(), { cle: "inexistant", seuil: 1 })).toBeNull();
  });
});

describe("evaluerTitre", () => {
  const criteres = [
    { cle: "rendementPct", seuil: 3 },
    { cle: "payoutPct", seuil: 70 },
    { cle: "roePct", seuil: 10 },
  ];

  it("retient un titre qui passe tout", () => {
    const e = evaluerTitre(titre({ rendementPct: 4 }), criteres);
    expect(e.retenu).toBe(true);
    expect(e.nbReussis).toBe(3);
  });

  it("rejette dès un seul échec", () => {
    const e = evaluerTitre(titre({ rendementPct: 1 }), criteres);
    expect(e.retenu).toBe(false);
    expect(e.nbEchecs).toBe(1);
  });

  it("ne rejette pas sur des données manquantes, mais les compte", () => {
    const e = evaluerTitre(titre({ rendementPct: 4, payoutPct: null }), criteres);
    expect(e.retenu).toBe(true);
    expect(e.nbIndetermines).toBe(1);
    expect(e.fiabilite).toBe(2);
  });

  it("ne retient pas un titre dont aucun critère n'est évaluable", () => {
    const e = evaluerTitre(titre({ rendementPct: null, payoutPct: null, roePct: null }), criteres);
    expect(e.retenu).toBe(false);
  });

  it("détaille chaque critère pour pouvoir l'expliquer", () => {
    const e = evaluerTitre(titre(), criteres);
    expect(e.details).toHaveLength(3);
    expect(e.details[0]).toMatchObject({ cle: "rendementPct", seuil: 3, libelle: expect.any(String) });
  });
});

describe("appliquerRecette", () => {
  const univers = [
    titre({ symbole: "A", rendementPct: 5, payoutPct: 40, roePct: 20 }),
    titre({ symbole: "B", rendementPct: 1, payoutPct: 40, roePct: 20 }),
    titre({ symbole: "C", rendementPct: 1, payoutPct: 90, roePct: 5 }),
    { symbole: "D", ok: false, error: "réseau" },
  ];
  const criteres = recetteParId("dividende-solide").criteres;

  it("classe les retenus d'abord, puis par nombre d'échecs croissant", () => {
    const out = appliquerRecette(univers, criteres);
    expect(out.map((o) => o.titre.symbole)).toEqual(["A", "B", "C"]);
  });

  it("écarte les titres en échec de récupération", () => {
    const out = appliquerRecette(univers, criteres);
    expect(out.find((o) => o.titre.symbole === "D")).toBeUndefined();
  });
});

describe("auditerPortefeuille", () => {
  const positions = [
    { ticker: "A", quantity: 10, current_price: 100 },
    { ticker: "B", quantity: 5, current_price: 50 },
    { ticker: "INCONNU", quantity: 1, current_price: 10 },
  ];
  const fondamentaux = [
    titre({ symbole: "A", roePct: 20, margeNettePct: 15, per: 18 }),
    titre({ symbole: "B", roePct: 3, margeNettePct: 2, per: 40 }),
  ];
  const criteres = recetteParId("qualite").criteres;

  it("remonte en tête les lignes qui décrochent le plus", () => {
    const out = auditerPortefeuille(positions, fondamentaux, criteres);
    expect(out[0].position.ticker).toBe("B");
    expect(out[0].evaluation.nbEchecs).toBeGreaterThan(0);
  });

  it("signale les lignes sans fondamentaux plutôt que de les taire", () => {
    const out = auditerPortefeuille(positions, fondamentaux, criteres);
    const inconnu = out.find((o) => o.position.ticker === "INCONNU");
    expect(inconnu.indisponible).toBe(true);
    expect(inconnu.evaluation).toBeNull();
  });

  it("est insensible à la casse du ticker", () => {
    const out = auditerPortefeuille([{ ticker: "a", quantity: 1, current_price: 1 }], fondamentaux, criteres);
    expect(out[0].indisponible).toBe(false);
  });
});

describe("poidsSectoriels", () => {
  it("répartit la valeur du portefeuille par secteur", () => {
    const poids = poidsSectoriels(
      [{ ticker: "A", quantity: 10, current_price: 100 }, { ticker: "B", quantity: 10, current_price: 100 }],
      [titre({ symbole: "A", secteur: "Tech" }), titre({ symbole: "B", secteur: "Santé" })]
    );
    expect(poids).toEqual({ Tech: 50, Santé: 50 });
  });

  it("classe à part les titres sans secteur connu", () => {
    const poids = poidsSectoriels([{ ticker: "X", quantity: 1, current_price: 100 }], []);
    expect(poids["Non classé"]).toBe(100);
  });

  it("rend un objet vide sur un portefeuille sans valeur", () => {
    expect(poidsSectoriels([], [])).toEqual({});
  });
});

describe("suggererDiversification", () => {
  const univers = [
    titre({ symbole: "T1", secteur: "Tech", roePct: 30 }),
    titre({ symbole: "T2", secteur: "Tech", roePct: 20 }),
    titre({ symbole: "S1", secteur: "Santé", roePct: 25 }),
    titre({ symbole: "E1", secteur: "Énergie", roePct: 18 }),
  ];

  it("privilégie les secteurs les moins représentés", () => {
    const out = suggererDiversification(univers, { Tech: 80, Santé: 20 }, { limite: 2 });
    // Énergie pèse 0 % : c'est le secteur absent, il doit venir en premier.
    expect(out[0].secteur).toBe("Énergie");
  });

  it("exclut les titres déjà détenus", () => {
    const out = suggererDiversification(univers, {}, { exclure: ["T1", "S1"], limite: 5 });
    expect(out.map((o) => o.titre.symbole)).not.toContain("T1");
    expect(out.map((o) => o.titre.symbole)).not.toContain("S1");
  });

  it("alterne les secteurs plutôt que d'en laisser un monopoliser la liste", () => {
    const out = suggererDiversification(univers, {}, { limite: 3 });
    expect(new Set(out.map((o) => o.secteur)).size).toBeGreaterThan(1);
  });

  it("classe par rentabilité à l'intérieur d'un secteur", () => {
    const out = suggererDiversification(univers, { Santé: 99, "Énergie": 99 }, { limite: 4 });
    const tech = out.filter((o) => o.secteur === "Tech").map((o) => o.titre.symbole);
    expect(tech[0]).toBe("T1");
  });

  it("ignore les titres en échec de récupération", () => {
    const out = suggererDiversification([{ symbole: "X", ok: false, secteur: "Tech" }], {}, {});
    expect(out).toHaveLength(0);
  });
});
