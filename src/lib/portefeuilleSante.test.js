import { describe, it, expect } from "vitest";
import { scoreRepartition, santePortefeuille, expositionGeographique } from "./portefeuilleSante";

/** Position minimale valorisable par `valeurPosition`. */
const pos = (ticker, quantity, price, extra = {}) => ({
  ticker, name: ticker, quantity, current_price: price, currency: "EUR", ...extra,
});

describe("scoreRepartition", () => {
  it("note 0 une ligne unique et 100 des parts égales", () => {
    expect(scoreRepartition([1000])).toBe(0);
    expect(scoreRepartition([500, 500])).toBeCloseTo(100, 6);
    expect(scoreRepartition([250, 250, 250, 250])).toBeCloseTo(100, 6);
  });

  it("est comparable entre portefeuilles de tailles différentes", () => {
    // C'est tout l'intérêt de la normalisation : trois lignes équilibrées ne
    // valent pas moins que trente lignes équilibrées.
    expect(scoreRepartition([1, 1, 1])).toBeCloseTo(scoreRepartition(Array(30).fill(1)), 6);
  });

  it("descend quand une ligne domine", () => {
    expect(scoreRepartition([900, 50, 50])).toBeLessThan(scoreRepartition([400, 300, 300]));
  });

  it("ignore les parts nulles ou négatives", () => {
    expect(scoreRepartition([500, 500, 0])).toBeCloseTo(100, 6);
    expect(scoreRepartition([])).toBeNull();
    expect(scoreRepartition([0, 0])).toBeNull();
  });
});

describe("santePortefeuille", () => {
  it("rend un score absent sur un portefeuille vide", () => {
    expect(santePortefeuille([])).toEqual({ score: null, composantes: [] });
    expect(santePortefeuille().score).toBeNull();
  });

  it("nomme la ligne dominante et gradue son seuil", () => {
    const { composantes } = santePortefeuille([
      pos("AAA", 10, 100),  // 1000 → 50 %
      pos("BBB", 10, 50),   // 500  → 25 %
      pos("CCC", 10, 50),   // 500  → 25 %
    ]);
    const c = composantes.find((x) => x.cle === "concentration");
    expect(c.constat).toContain("AAA");
    expect(c.constat).toContain("50 %");
    expect(c.seuil).toBe("critique");
  });

  it("laisse la composante frais ABSENTE plutôt que neutre", () => {
    // Une note inventée pèserait sur le score global comme une vraie.
    const { composantes, score } = santePortefeuille([pos("AAA", 10, 100), pos("BBB", 10, 100)]);
    const frais = composantes.find((x) => x.cle === "frais");
    expect(frais.note).toBeNull();
    expect(frais.seuil).toBe("neutre");
    // Le score ne moyenne que les composantes mesurées.
    const mesurees = composantes.filter((c) => Number.isFinite(c.note));
    expect(score).toBeCloseTo(mesurees.reduce((s, c) => s + c.note, 0) / mesurees.length, 6);
  });

  it("prend les frais en compte quand ils sont mesurés", () => {
    const sans = santePortefeuille([pos("A", 1, 100), pos("B", 1, 100)], { fraisAnnuelsPct: 0.1 });
    const avec = santePortefeuille([pos("A", 1, 100), pos("B", 1, 100)], { fraisAnnuelsPct: 1.5 });
    const note = (r) => r.composantes.find((c) => c.cle === "frais").note;
    expect(note(sans)).toBeGreaterThan(note(avec));
    expect(note(avec)).toBe(40);
  });

  it("note les devises à 100 quand tout est en euros", () => {
    const { composantes } = santePortefeuille([pos("A", 1, 100), pos("B", 1, 100)]);
    const d = composantes.find((x) => x.cle === "devises");
    expect(d.note).toBe(100);
    expect(d.constat).toBe("Tout est libellé en euros.");
  });

  it("signale en critique une ligne étrangère comptée à parité", () => {
    // Une valorisation à parité faute de taux est fausse sans le dire : c'est
    // le seul cas où la composante devises passe au rouge.
    const { composantes } = santePortefeuille([
      pos("A", 1, 100),
      pos("US", 1, 100, { currency: "USD" }),
    ]);
    const d = composantes.find((x) => x.cle === "devises");
    expect(d.seuil).toBe("critique");
    expect(d.constat).toContain("parité");
  });
});

describe("expositionGeographique", () => {
  it("classe les pays par poids décroissant", () => {
    const e = expositionGeographique([
      pos("FR1", 1, 100, { pays: "France" }),
      pos("DE1", 1, 300, { pays: "Allemagne" }),
      pos("FR2", 1, 100, { pays: "France" }),
    ]);
    expect(e.pays.map((p) => p.nom)).toEqual(["Allemagne", "France"]);
    expect(e.pays[0].part).toBeCloseTo(60, 6);
  });

  it("compte l'inconnu à part et ne le répartit JAMAIS au prorata", () => {
    const e = expositionGeographique([
      pos("FR1", 1, 100, { pays: "France" }),
      pos("???", 1, 100),
    ]);
    expect(e.partInconnue).toBeCloseTo(50, 6);
    expect(e.pays).toHaveLength(1);
    expect(e.pays[0].part).toBeCloseTo(50, 6);
  });

  it("rend une carte vide sans position valorisable", () => {
    expect(expositionGeographique([])).toEqual({ pays: [], inconnu: 0, total: 0 });
  });
});
