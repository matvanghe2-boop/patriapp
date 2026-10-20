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
    expect(c.constat).toContain("50\u202f%");
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

describe("santePortefeuille — ETF et non classé", () => {
  const etf = (valeur) => pos("CW8.PA", 1, valeur, { name: "Amundi MSCI World", type: "ETF" });
  const note = (r, cle) => r.composantes.find((c) => c.cle === cle);

  it("ne compte pas un ETF monde comme une concentration", () => {
    // 84 % sur un ETF monde était signalé « critique », comme une seule action.
    const r = santePortefeuille([etf(8400), pos("AI.PA", 1, 1600, { type: "Action" })]);
    const c = note(r, "concentration");
    expect(c.seuil).toBe("ok");
    expect(c.constat).toMatch(/Air Liquide|AI\.PA/);
    expect(c.constat).toMatch(/ETF diversifiés/);
    // La pénalité de la ligne directe unique est ramenée à son poids (16 %).
    expect(c.note).toBeCloseTo(84, 6);
  });

  it("rend la même note qu'avant sans aucun ETF", () => {
    const lignes = [pos("A", 10, 100), pos("B", 10, 50), pos("C", 10, 50)];
    expect(note(santePortefeuille(lignes), "concentration").note).toBeCloseTo(
      scoreRepartition([1000, 500, 500]),
      6
    );
  });

  it("décompose l'ETF dans les secteurs au lieu d'un « Non classé » dominant", () => {
    const r = santePortefeuille([etf(8400), pos("AI.PA", 1, 1600, { type: "Action" })]);
    const s = note(r, "secteurs");
    expect(s.constat).not.toMatch(/Non classé/);
    expect(s.constat).toMatch(/^Technologie/);
    expect(s.note).toBeGreaterThan(80);
  });

  it("met le non classé à part, sans le noter comme un secteur", () => {
    const r = santePortefeuille([
      pos("XYZ.PA", 1, 800, { type: "ETF" }), // fonds hors catalogue
      pos("AI.PA", 1, 100, { type: "Action" }),
      pos("SAN.PA", 1, 100, { type: "Action" }),
    ]);
    const s = note(r, "secteurs");
    // Deux secteurs égaux dans la part classée : répartition parfaite.
    expect(s.note).toBeCloseTo(100, 6);
    expect(s.constat).toMatch(/80\u202f% non classé, hors de ce calcul/);
    expect(r.partNonClassee).toBeCloseTo(80, 6);
  });

  it("applique le secteur choisi à la main", () => {
    const r = santePortefeuille([pos("AI.PA", 1, 100), pos("SU.PA", 1, 100)], {
      secteursManuels: { "AI.PA": "Industrie" },
    });
    // Les deux lignes tombent dans le même secteur : concentration totale.
    expect(note(r, "secteurs").note).toBe(0);
    expect(note(r, "secteurs").constat).toMatch(/^Industrie représente 100/);
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
    // Un fonds hors catalogue : ni décomposable, ni rangeable d'après sa place
    // de cotation — un ETF coté à Paris n'est pas un placement français.
    const e = expositionGeographique([
      pos("FR1", 1, 100, { pays: "France" }),
      pos("XYZ.PA", 1, 100, { type: "ETF" }),
    ]);
    expect(e.partInconnue).toBeCloseTo(50, 6);
    expect(e.pays).toHaveLength(1);
    expect(e.pays[0].part).toBeCloseTo(50, 6);
  });

  it("déduit le pays d'une action de sa place de cotation, et le dit", () => {
    // La carte restait toujours vide : rien n'enregistrait jamais le pays.
    const e = expositionGeographique([
      pos("AI.PA", 1, 300, { type: "Action" }),
      pos("SAP.DE", 1, 100, { type: "Action" }),
    ]);
    expect(e.pays.map((p) => p.nom)).toEqual(["France", "Allemagne"]);
    expect(e.partCotation).toBeCloseTo(100, 6);
    expect(e.partInconnue).toBe(0);
  });

  it("décompose un ETF monde selon la fiche de son indice", () => {
    const e = expositionGeographique([pos("CW8.PA", 1, 1000, { type: "ETF" })]);
    const etatsUnis = e.pays.find((p) => p.nom === "États-Unis");
    expect(etatsUnis.part).toBeCloseTo(72.94, 1);
    // Le bloc que la fiche ne détaille pas reste en bloc, signalé comme tel.
    expect(e.pays.find((p) => p.agrege).nom).toBe("Autres pays développés");
    expect(e.partIndice).toBeCloseTo(100, 6);
    expect(e.partCotation).toBe(0);
  });

  it("rend une carte vide sans position valorisable", () => {
    expect(expositionGeographique([])).toEqual({ pays: [], inconnu: 0, total: 0 });
  });
});
