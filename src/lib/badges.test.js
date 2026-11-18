import { describe, it, expect } from "vitest";
import {
  CATALOGUE, BADGE_PAR_ID, RARETES, FAMILLES, TOTAL_MEDAILLES, NIVEAU_MAX, estANiveaux, rareteDe,
  evaluerBadge, evaluerBadges, integrerEvaluation, leverDrapeau, resumeVitrine, libelleSeuil, formaterValeur,
  annoncerBadges, ecouterBadges, ETAT_BADGES_VIDE,
} from "./badges";

const AUJ = "2026-11-17";
const ev = (id, contexte) => evaluerBadge(BADGE_PAR_ID[id], { aujourdhui: AUJ, ...contexte });
const releves = (valeurs, debut = "2026-01-01") =>
  valeurs.map((value, i) => {
    const d = new Date(`${debut}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), value };
  });

describe("catalogue", () => {
  it("compte 52 badges numérotés, dont 20 à cinq niveaux, soit 132 médailles", () => {
    expect(CATALOGUE).toHaveLength(52);
    expect(CATALOGUE.map((b) => b.numero)).toEqual(Array.from({ length: 52 }, (_, i) => i + 1));
    expect(new Set(CATALOGUE.map((b) => b.id)).size).toBe(52);
    expect(CATALOGUE.filter(estANiveaux)).toHaveLength(20);
    expect(TOTAL_MEDAILLES).toBe(20 * 5 + 32);
  });

  it("donne cinq seuils croissants aux badges à niveaux, une rareté connue aux autres", () => {
    const familles = new Set(FAMILLES.map((f) => f.id));
    for (const b of CATALOGUE) {
      expect(familles.has(b.famille)).toBe(true);
      expect(typeof b.mesure).toBe("function");
      if (estANiveaux(b)) {
        expect(b.seuils).toHaveLength(NIVEAU_MAX);
        b.seuils.slice(1).forEach((s, i) => expect(s).toBeGreaterThan(b.seuils[i]));
      } else {
        expect(RARETES.map((r) => r.id)).toContain(b.rarete);
      }
    }
  });

  it("garde les secrets dans leur famille", () => {
    expect(CATALOGUE.filter((b) => b.secret).every((b) => b.famille === "secrets")).toBe(true);
  });
});

describe("rareté = matière", () => {
  it("fait monter un badge à niveaux du bronze au diamant", () => {
    const matelas = BADGE_PAR_ID.matelas;
    expect([1, 2, 3, 4, 5].map((n) => rareteDe(matelas, n).matiere)).toEqual(["Bronze", "Argent", "Or", "Platine", "Diamant"]);
  });

  it("donne sa rareté fixe à un badge unique", () => {
    expect(rareteDe(BADGE_PAR_ID["livret-a-plein"]).matiere).toBe("Or");
    expect(rareteDe(BADGE_PAR_ID["le-million"]).libelle).toBe("Légendaire");
  });
});

describe("évaluation", () => {
  it("matelas : 1 k€ en bronze, 5 k€ en argent", () => {
    expect(ev("matelas", { matelasEuros: 999 }).niveau).toBe(0);
    expect(ev("matelas", { matelasEuros: 1000 }).niveau).toBe(1);
    const e = ev("matelas", { matelasEuros: 6000 });
    expect(e.niveau).toBe(2);
    expect(e.seuilSuivant).toBe(10000);
    expect(e.progression).toBeCloseTo(0.6);
  });

  it("une condition qui lève une erreur rend simplement « pas obtenu »", () => {
    expect(evaluerBadge({ id: "x", rarete: "commun", mesure: () => { throw new Error("abîmé"); } }, {}).niveau).toBe(0);
  });

  it("évalue tout le catalogue sur une application vide sans rien débloquer", () => {
    const e = evaluerBadges({ aujourdhui: AUJ, isEmpty: true });
    expect(Object.keys(e)).toHaveLength(52);
    expect(Object.values(e).every((x) => x.niveau === 0)).toBe(true);
  });

  it("compte les records précédés d'au moins sept relevés", () => {
    expect(ev("recordman", { historique: releves([1, 2, 3, 4, 5, 6, 7, 8, 9, 5, 10]) }).valeur).toBe(3);
  });

  it("remontada : le record retrouvé après une baisse de 10 %", () => {
    expect(ev("remontada", { historique: releves([10000, 8900, 9500, 10000]) }).niveau).toBe(1);
    expect(ev("remontada", { historique: releves([10000, 9500, 10000]) }).niveau).toBe(0);
  });

  it("boule de neige : le patrimoine doublé depuis un départ d'au moins 1 000 €", () => {
    expect(ev("boule-de-neige", { historique: releves([2000, 3000]), patrimoineNet: 4000 }).niveau).toBe(1);
    expect(ev("boule-de-neige", { historique: releves([500, 3000]), patrimoineNet: 3000 }).niveau).toBe(0);
  });

  it("livret A plein et grand chelem", () => {
    const livrets = [{ name: "Livret A", balance: 22950 }, { name: "LDDS", balance: 11000 }];
    expect(ev("livret-a-plein", { livrets }).niveau).toBe(1);
    expect(ev("grand-chelem", { livrets }).niveau).toBe(0);
    expect(ev("grand-chelem", { livrets: [livrets[0], { name: "LDDS", balance: 12000 }] }).niveau).toBe(1);
  });

  it("âge du PEA depuis sa date d'ouverture", () => {
    expect(ev("age-pea", { bourse: { peaOuverture: "2021-11-01" } }).niveau).toBe(3);
    expect(ev("age-pea", { bourse: { peaOuverture: "2026-10-01" } }).niveau).toBe(0);
  });

  it("métronome : la plus longue suite de mois avec un achat ou un versement", () => {
    const operations = ["2026-01-05", "2026-02-05", "2026-03-05", "2026-05-05"].map((date, i) => ({
      id: `o${i}`, date, type: i === 1 ? "ACHAT" : "VERSEMENT", amount: 100,
    }));
    expect(ev("metronome", { bourse: { operations } }).valeur).toBe(3);
  });

  it("patience : une ligne gardée depuis son premier achat, remise à zéro par une vente", () => {
    const positions = [{ ticker: "CW8.PA", quantity: 3 }];
    const achat = { type: "ACHAT", asset: "CW8.PA", date: "2023-11-01" };
    expect(ev("patience", { bourse: { positions, operations: [achat] } }).niveau).toBe(3);
    const vente = { type: "VENTE", asset: "CW8.PA", date: "2025-01-01" };
    const rachat = { type: "ACHAT", asset: "CW8.PA", date: "2025-06-01" };
    // Le compteur repart du rachat de juin 2025 : un an et demi, plus trois ans.
    expect(ev("patience", { bourse: { positions, operations: [achat, vente, rachat] } }).niveau).toBe(1);
  });

  it("dividendes : cumul, premier, et douze mois d'une même année", () => {
    const operations = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`, type: "DIVIDENDE", date: `2025-${String(i + 1).padStart(2, "0")}-10`, montantNet: 10,
    }));
    expect(ev("dividendes", { bourse: { operations } }).niveau).toBe(2);
    expect(ev("premier-dividende", { bourse: { operations } }).niveau).toBe(1);
    expect(ev("douze-sur-douze", { bourse: { operations } }).niveau).toBe(1);
    expect(ev("douze-sur-douze", { bourse: { operations: operations.slice(1) } }).niveau).toBe(0);
  });

  it("liberté financière : les intérêts couvrent les dépenses du mois", () => {
    const livrets = [{ name: "Livret A", balance: 1_000_000, rate: 0.03 }];
    expect(ev("liberte-financiere", { livrets, depensesMensuelles: 2000 }).niveau).toBe(1);
    expect(ev("liberte-financiere", { livrets, depensesMensuelles: 3000 }).niveau).toBe(0);
  });

  it("essai déjoué : résilié avant la fin de l'essai", () => {
    const subs = [{ id: "s", statut: "resilie", fin_essai: "2026-03-10", resilie_le: "2026-03-08" }];
    expect(ev("essai-dejoue", { subs }).niveau).toBe(1);
    expect(ev("essai-dejoue", { subs: [{ ...subs[0], resilie_le: "2026-04-01" }] }).niveau).toBe(0);
  });

  it("secrets : vendredi 13, pile poil, fantôme", () => {
    expect(ev("vendredi-13", { bourse: { operations: [{ type: "ACHAT", date: "2026-02-13" }] } }).niveau).toBe(1);
    expect(ev("vendredi-13", { bourse: { operations: [{ type: "ACHAT", date: "2026-02-12" }] } }).niveau).toBe(0);
    expect(ev("pile-poil", { patrimoineNet: 21000.4 }).niveau).toBe(1);
    expect(ev("pile-poil", { patrimoineNet: 21001 }).niveau).toBe(0);
    expect(ev("fantome", { drapeaux: { fantome: AUJ } }).niveau).toBe(1);
  });

  it("taux d'épargne : le meilleur mois terminé, jamais le mois en cours", () => {
    const op = (date, montant, famille) => ({ id: `${date}${montant}`, date, montant, famille, categorie: famille === "revenu" ? "salaire" : "courses", analyse: { cle: "X", titre: "X" } });
    const compteEnrichies = [
      op("2026-09-02", 200000, "revenu"), op("2026-09-10", -150000, "depense"),
      op("2026-11-02", 200000, "revenu"), op("2026-11-10", -10000, "depense"),
    ];
    expect(ev("taux-epargne", { compteEnrichies }).valeur).toBeCloseTo(25);
  });
});

describe("état : ce qui monte reste acquis", () => {
  const evals = (niveaux) =>
    Object.fromEntries(CATALOGUE.map((b) => [b.id, { niveau: niveaux[b.id] || 0 }]));

  it("le premier passage débloque tout l'acquis d'un coup", () => {
    const r = integrerEvaluation(ETAT_BADGES_VIDE, evals({ matelas: 2, "premier-pas": 1 }), AUJ);
    expect(r.premierPassage).toBe(true);
    expect(r.etat.initialise).toBe(AUJ);
    expect(r.nouveautes).toEqual([
      { id: "premier-pas", niveau: 1, depuis: 0 },
      { id: "matelas", niveau: 2, depuis: 0 },
    ]);
    expect(r.etat.obtenus.matelas.dates).toEqual({ 1: AUJ, 2: AUJ });
  });

  it("un premier passage sans rien d'acquis s'initialise sans annonce", () => {
    const r = integrerEvaluation(null, evals({}), AUJ);
    expect(r.premierPassage).toBe(true);
    expect(r.nouveautes).toEqual([]);
    expect(r.etat.initialise).toBe(AUJ);
  });

  it("rend l'état d'origine quand rien ne monte, même si les données baissent", () => {
    const { etat } = integrerEvaluation(null, evals({ matelas: 3 }), AUJ);
    const r = integrerEvaluation(etat, evals({ matelas: 1 }), "2026-12-01");
    expect(r.etat).toBe(etat);
    expect(r.nouveautes).toEqual([]);
  });

  it("une montée de niveau date chaque niveau franchi", () => {
    const { etat } = integrerEvaluation(null, evals({ matelas: 1 }), AUJ);
    const r = integrerEvaluation(etat, evals({ matelas: 3 }), "2026-12-01");
    expect(r.premierPassage).toBe(false);
    expect(r.nouveautes).toEqual([{ id: "matelas", niveau: 3, depuis: 1 }]);
    expect(r.etat.obtenus.matelas.dates).toEqual({ 1: AUJ, 2: "2026-12-01", 3: "2026-12-01" });
  });

  it("un drapeau ne se lève qu'une fois", () => {
    const e1 = leverDrapeau(ETAT_BADGES_VIDE, "fantome", AUJ);
    expect(e1.drapeaux.fantome).toBe(AUJ);
    expect(leverDrapeau(e1, "fantome", "2027-01-01")).toBe(e1);
  });

  it("résume la vitrine par rareté", () => {
    const { etat } = integrerEvaluation(null, evals({ matelas: 2, "livret-a-plein": 1 }), AUJ);
    const r = resumeVitrine(etat);
    expect(r).toMatchObject({ badges: 2, medailles: 3, totalBadges: 52, totalMedailles: 132 });
    expect(r.parRarete).toMatchObject({ commun: 1, "peu-commun": 1, rare: 1, epique: 0, legendaire: 0 });
  });
});

describe("affichage", () => {
  it("écrit les seuils dans leur unité", () => {
    expect(libelleSeuil(BADGE_PAR_ID.matelas, 1)).toBe("1 k€");
    expect(libelleSeuil(BADGE_PAR_ID.matelas, 5)).toBe("35 k€");
    expect(libelleSeuil(BADGE_PAR_ID["plus-value"], 3)).toBe("+25 %");
    expect(libelleSeuil(BADGE_PAR_ID.fidele, 4)).toBe("1 an");
    expect(libelleSeuil(BADGE_PAR_ID["age-pea"], 3)).toBe("5 ans");
    expect(formaterValeur(BADGE_PAR_ID["revenus-passifs"], 50)).toBe("50 €/mois");
  });
});

describe("annonces", () => {
  it("répond false quand personne n'écoute, et prévient l'écouteur sinon", () => {
    expect(annoncerBadges({ nouveautes: [] })).toBe(false);
    const recues = [];
    const arreter = ecouterBadges((a) => recues.push(a));
    expect(annoncerBadges({ nouveautes: [{ id: "matelas", niveau: 1, depuis: 0 }] })).toBe(true);
    arreter();
    expect(recues).toHaveLength(1);
  });
});
