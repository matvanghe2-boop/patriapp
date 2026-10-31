import { describe, it, expect } from "vitest";
import { construireNotion, indexNotion, NOTIONS, IDS_EXEMPLES } from "./notionDuJour";
import { DEMO_DATASET } from "./PatrimoineContext";
import { operationsExemple } from "./jeuExemple";

const AUJ = "2026-10-26";

/** La notion `id`, quel que soit le jour : on feuillette jusqu'à elle. */
const notion = (id, donnees = {}) =>
  construireNotion({ aujourdhui: AUJ, decalage: NOTIONS.findIndex((n) => n.id === id) - indexNotion(AUJ), ...donnees });

const demo = {
  bourse: { ...DEMO_DATASET.bourse, operations: operationsExemple(AUJ) },
  livrets: DEMO_DATASET.livrets,
  livretsTotal: 22000,
  bourseTotal: 17093,
  matelasMois: 22000 / 1200,
  epargneMensuelle: 900,
  tauxEpargne: (900 / 2100) * 100,
  inflation: { tauxPct: 1, date: null },
};

const ilIsoAvant = (mois) => {
  const d = new Date();
  d.setMonth(d.getMonth() - mois);
  return d.toISOString().slice(0, 10);
};

describe("indexNotion", () => {
  it("passe à la notion suivante chaque jour et reboucle sur le catalogue", () => {
    const i = indexNotion(AUJ);
    expect(indexNotion("2026-10-27")).toBe((i + 1) % NOTIONS.length);
    expect(indexNotion(AUJ, NOTIONS.length)).toBe(i);
    expect(indexNotion(AUJ, -1)).toBe((i - 1 + NOTIONS.length) % NOTIONS.length);
  });

  it("donne la même notion toute la journée", () => {
    expect(construireNotion({ aujourdhui: AUJ }).id).toBe(construireNotion({ aujourdhui: AUJ }).id);
  });
});

describe("catalogue", () => {
  it("compte plus d'une centaine de notions, aux identifiants uniques", () => {
    expect(NOTIONS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(NOTIONS.map((n) => n.id)).size).toBe(NOTIONS.length);
  });

  it("donne à chaque notion un thème, une définition et un exemple générique", () => {
    for (const n of NOTIONS) {
      expect(n.theme, n.id).toBeTruthy();
      expect(n.titre, n.id).toBeTruthy();
      expect(n.definition.length, n.id).toBeGreaterThan(60);
      expect(n.generique.length, n.id).toBeGreaterThan(20);
    }
  });

  it("n'a aucun exemple calculé qui vise une notion absente", () => {
    const ids = new Set(NOTIONS.map((n) => n.id));
    for (const id of IDS_EXEMPLES) expect(ids.has(id), id).toBe(true);
  });

  it("n'enchaîne jamais deux notions du même thème", () => {
    for (let i = 0; i < NOTIONS.length; i++) {
      const suivante = NOTIONS[(i + 1) % NOTIONS.length];
      expect(suivante.theme, `${NOTIONS[i].id} → ${suivante.id}`).not.toBe(NOTIONS[i].theme);
    }
  });
});

describe("construireNotion", () => {

  it("garde l'exemple générique sans données", () => {
    for (const n of NOTIONS) {
      const r = notion(n.id);
      expect(r.perso).toBe(false);
      expect(r.exemple).toBe(n.generique);
    }
  });

  it("n'écrit jamais NaN ni undefined, données d'exemple ou incohérentes", () => {
    const bancal = {
      bourse: { positions: [null, { quantity: "abc", current_price: 0 }, { quantity: 2, current_price: 10, pru: 0 }], operations: [null] },
      livrets: [null, { balance: 100 }],
      bourseHistory: [{}, null],
    };
    for (const n of NOTIONS) {
      for (const donnees of [demo, bancal]) {
        const r = notion(n.id, donnees);
        expect(r.exemple).not.toMatch(/NaN|undefined|Infinity|null/);
      }
    }
  });

  it("PRU : la ligne la plus lourde, et son écart au cours", () => {
    const r = notion("pru", demo);
    expect(r.perso).toBe(true);
    expect(r.exemple).toMatch(/^Tu détiens 30 Amundi MSCI World à un PRU de 420,00\s€/);
    expect(r.exemple).toMatch(/plus-value de 45,50\s€ \(\+10,8\s%\)/);
  });

  it("rendement du dividende : sur le cours et sur le PRU", () => {
    const r = notion("rendement-dividende", demo);
    expect(r.exemple).toMatch(/^Air Liquide verse 3,30\s€/);
    expect(r.exemple).toMatch(/rendement de 1,9\s% ; sur ton PRU de 160,00\s€, 2,1\s%/);
  });

  it("intérêts composés : le plus gros livret rémunéré", () => {
    expect(notion("interets-composes", demo).exemple).toMatch(
      /^Sur ton Assurance-Vie \(Fonds Euro\), 15\s000\s€ à 2,50\s% deviendraient 24\s579\s€ en 20 ans/
    );
  });

  it("rendement réel : taux du livret corrigé de l'inflation", () => {
    expect(notion("rendement-reel", demo).exemple).toMatch(/rendement réel est donc d'environ \+1,5\s%/);
    const date = notion("rendement-reel", { ...demo, inflation: { tauxPct: 1, date: "2026-06-01" } });
    expect(date.exemple).toMatch(/\(chiffre du 1er juin 2026\)/);
  });

  it("règle des 5 ans : avant et après le cap", () => {
    const avant = notion("pea-cinq-ans", { bourse: { envelope: "PEA", peaOuverture: ilIsoAvant(14) } });
    expect(avant.exemple).toMatch(/^Ton PEA a 1 an et 2 mois : encore 46 mois/);
    const apres = notion("pea-cinq-ans", { bourse: { envelope: "PEA", peaOuverture: "2015-01-15" } });
    expect(apres.exemple).toMatch(/il a passé le cap des 5 ans/);
    expect(notion("pea-cinq-ans", { bourse: { envelope: "CTO", peaOuverture: "2015-01-15" } }).perso).toBe(false);
  });

  it("Livret A : remplissage du plafond", () => {
    expect(notion("livret-a", demo).exemple).toMatch(/^Ton Livret A contient 7\s000\s€, soit 31\s% de son plafond de 22\s950\s€\.$/);
  });

  it("règle de 72 : le plus gros livret rémunéré", () => {
    expect(notion("regle-72", demo).exemple).toMatch(/^À 2,50\s%, ton Assurance-Vie \(Fonds Euro\) doublerait en environ 29 ans/);
  });

  it("revenus passifs : intérêts des livrets et dividendes nets", () => {
    // 7 000 × 1,7 % + 15 000 × 2,5 % + 15 × 3,30 € = 543,50 €
    expect(notion("revenus-passifs", demo).exemple).toMatch(/environ 544\s€ par an, soit 45\s€ par mois/);
  });

  it("inflation : pouvoir d'achat perdu par l'épargne", () => {
    expect(notion("inflation", demo).exemple).toMatch(/tes 22\s000\s€ d'épargne perdraient environ 218\s€/);
  });

  it("diversification et liquidités du PEA", () => {
    expect(notion("diversification", demo).exemple).toMatch(/^Ton portefeuille compte 2 lignes, dont 1 ETF qui répartit/);
    expect(notion("liquidites-pea", demo).exemple).toMatch(/^Tu as 500\s€ de liquidités non investies/);
  });

  it("plafond du PEA : ce qu'il reste à verser", () => {
    expect(notion("plafond-pea", demo).exemple).toMatch(/il te reste 134\s500\s€ de versements possibles/);
  });

  it("frais : rapportés aux montants échangés", () => {
    expect(notion("frais-courtage", demo).exemple).toMatch(/^Tu as payé 2,00\s€ de frais sur 1 ordre, soit 0,09\s%/);
  });

  it("DCA : les versements des 12 derniers mois", () => {
    expect(notion("dca", demo).exemple).toMatch(/12 versements sur ton PEA, pour 3\s600\s€ \(300\s€ en moyenne\)/);
  });

  it("drawdown : mesuré sur la performance, pas sur les versements", () => {
    const valeurs = [100, 102, 104, 106, 108, 110, 104, 98, 92, 88, 90, 92, 94, 95, 95, 95, 95, 95, 95, 95, 95];
    const bourseHistory = valeurs.map((valeur, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      valeur: valeur + (i >= 15 ? 50 : 0), // un versement de 50 € n'est pas une remontée
      capital: 100 + (i >= 15 ? 50 : 0),
    }));
    const r = notion("drawdown", { bourseHistory });
    expect(r.exemple).toMatch(/^Ta plus forte baisse depuis un plus haut : [-−]20,0\s%, entre le 6 septembre 2026 et le 10 septembre 2026/);
    expect(r.exemple).toMatch(/pas encore retrouvé ce plus haut/);
  });
});
