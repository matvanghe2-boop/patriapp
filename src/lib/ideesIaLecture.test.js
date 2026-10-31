import { describe, it, expect } from "vitest";
import { enrichir } from "./compteCourant";
import { resultatsARelire } from "./theses";
import { elementsAFaire } from "./aFaire";
import { aClasser, suggestionLocale, contexteCategories, lireReponseCategories } from "./categorisationAssistee";
import { construireContexteDonnees, rendreReponse } from "./contexteDonnees";
import { REGISTRE_DONNEES, construirePromptDonnees, questionCategories } from "../../shared/assistantsDonnees";
import { executerOutil } from "../../shared/horizonOutils";
import { auditerContexte } from "../../shared/anonymiser";
import { inflationCharges, enEurosConstants, inflationOfficielle } from "./inflation";
import { moisDeReference, noterMois, evolutionSante, scoreSante } from "./santeFinanciere";

const AUJ = "2026-10-30";
const op = (id, date, libelle, montant) => ({ id, date, libelle, montant });

describe("relire sa thèse après les résultats", () => {
  const note = { id: "n", ticker: "AI.PA", statut: "intacte", date: "2026-02-01T10:00:00.000Z" };
  const ev = (date, extra = {}) => ({ ticker: "AI.PA", type: "Résultats", date, statut: "confirme", ...extra });

  it("propose une relecture après une publication récente, pas encore relue", () => {
    const r = resultatsARelire({ notes: [note], evenements: [ev("2026-10-20"), ev("2026-07-25")], aujourdhui: AUJ });
    expect(r).toHaveLength(1);
    expect(r[0].evenement.date).toBe("2026-10-20");
  });

  it("se tait si la thèse a été relue depuis, si la date est estimée ou trop ancienne", () => {
    const relue = { ...note, revues: [{ date: "2026-10-22T09:00:00.000Z", statut: "intacte" }] };
    expect(resultatsARelire({ notes: [relue], evenements: [ev("2026-10-20")], aujourdhui: AUJ })).toEqual([]);
    expect(resultatsARelire({ notes: [note], evenements: [ev("2026-10-20", { statut: "estime" })], aujourdhui: AUJ })).toEqual([]);
    expect(resultatsARelire({ notes: [note], evenements: [ev("2026-09-01")], aujourdhui: AUJ })).toEqual([]);
    expect(resultatsARelire({ notes: [note], evenements: [ev("2026-11-05")], aujourdhui: AUJ })).toEqual([]);
  });

  it("remonte dans le centre « À faire »", () => {
    const e = elementsAFaire({ aujourdhui: AUJ, strategyNotes: [note], evenements: [ev("2026-10-20")] });
    expect(e.find((x) => x.id.startsWith("resultats-"))).toMatchObject({ urgence: "attention", lien: { onglet: "strategie", sous: "theses" } });
  });
});

describe("catégorisation assistée", () => {
  const releve = enrichir([
    op("1", "2026-09-02", "CARTE 02/09/26 LE FOURNIL WAZEMMES CB*1234", -450),
    op("2", "2026-10-02", "CARTE 02/10/26 LE FOURNIL LILLE CB*1234", -380),
    op("3", "2026-10-05", "CARTE 05/10/26 CABINET KINE DUPONT CB*1234", -3000),
    op("4", "2026-10-07", "CARTE 07/10/26 ZXQW SARL CB*1234", -1290),
    op("5", "2026-10-09", "VIR SEPA JEAN MARTIN", -2000),
  ]).map((o) => (o.id === "1" ? { ...o, categorie: "restauration" } : o));

  it("regroupe les marchands restés en « Autres », sans les virements", () => {
    const g = aClasser(releve);
    const titres = g.map((x) => x.titre);
    expect(titres).not.toContain("Jean Martin");
    expect(g[0].total).toBeGreaterThan(g[g.length - 1].total);
  });

  it("suggère d'après un marchand voisin déjà classé, puis d'après un indice du nom", () => {
    const groupes = aClasser(releve);
    const fournil = groupes.find((x) => /Lille/.test(x.titre));
    expect(suggestionLocale(fournil, releve)).toMatchObject({ categorie: "restauration", source: "similaire" });
    const kine = groupes.find((x) => /Kine/i.test(x.titre));
    expect(suggestionLocale(kine, releve)).toMatchObject({ categorie: "sante", source: "indice" });
    const inconnu = groupes.find((x) => /Zxqw/i.test(x.titre));
    expect(suggestionLocale(inconnu, releve)).toBeNull();
  });

  it("n'envoie à l'IA que des noms de marchands, et ne garde que des codes valides", () => {
    const groupes = aClasser(releve);
    const { contexte, references } = contexteCategories(groupes);
    expect(auditerContexte(contexte).sain).toBe(true);
    expect(JSON.stringify(contexte)).not.toMatch(/\d{3,}/);
    const lu = lireReponseCategories('Voici : {"m1": "sante", "m2": "pas-une-categorie", "m99": "courses"}', references);
    expect(Object.values(lu)).toEqual(["sante"]);
    expect(questionCategories(contexte)).toContain('"marchands"');
  });
});

describe("question à ses données", () => {
  const etat = {
    patrimoineNet: 26000, livretsTotal: 22900, bourseTotal: 2800, cash: 300, dettesTotal: 0,
    profile: { monthly_income: 1200, monthly_expenses: 400 }, tauxEpargne: 66, matelasMois: 57,
    compteEnrichies: enrichir([op("1", "2026-09-03", "PRLV SEPA NETFLIX.COM", -1349), op("2", "2026-10-03", "CARTE 03/10/26 BURGER KING CB*1234", -1250)]),
    bourse: {
      positions: [{ ticker: "AI.PA", name: "Air Liquide", quantity: 10, pru: 150, current_price: 171, annual_dividend: 3.3 }],
      operations: [{ type: "DIVIDENDE", asset: "AI.PA", amount: 33 }],
    },
    subs: [{ id: "s", label: "Netflix", category: "Streaming", montant: 13.49 }],
    strategyNotes: [{ id: "n", statut: "intacte" }],
    objectifs: [{ id: "o", libelle: "Voiture", cible: 30000, echeance: "2028-06-30" }],
  };

  it("ne laisse partir ni nom ni euro en mode A, et passe l'audit", () => {
    const { contexte, alias, facteur, audit } = construireContexteDonnees(etat);
    expect(audit.sain).toBe(true);
    const texte = JSON.stringify(contexte);
    expect(texte).not.toMatch(/AI\.PA|Air Liquide|Netflix|Voiture/);
    expect(alias).toMatchObject({ ligne_1: "AI.PA (Air Liquide)", abonnement_1: "Netflix", objectif_1: "Voiture" });
    expect(contexte.patrimoine.net).toBe(100);
    expect(facteur).toBe(260);
  });

  it("garde les euros en mode B, toujours sans nom", () => {
    const { contexte, audit } = construireContexteDonnees(etat, { montantsReels: true });
    expect(audit.sain).toBe(true);
    expect(contexte.patrimoine.net).toBe(26000);
  });

  it("remet les noms et les euros dans la réponse", () => {
    const r = rendreReponse("ligne_1 t'a versé 0,127 points ; abonnement_1 coûte 0.052 point par mois.", {
      alias: { ligne_1: "AI.PA", abonnement_1: "Netflix" },
      facteur: 260,
    });
    expect(r).toMatch(/^AI\.PA t'a versé 33,02/);
    expect(r).toMatch(/Netflix coûte 13,52/);
    expect(r).not.toMatch(/points?/);
  });

  it("additionne pour le modèle, et lui interdit les euros en mode A", () => {
    expect(executerOutil("additionner", { valeurs: [1.5, 2, 3.25] }, {}, REGISTRE_DONNEES)).toMatchObject({ total: 6.75, nombre: 3 });
    expect(executerOutil("lire_donnees", {}, { a: 1 }, REGISTRE_DONNEES)).toEqual({ a: 1 });
    expect(construirePromptDonnees()).toMatch(/N'écris jamais « euros »/);
    expect(construirePromptDonnees({ montantsReels: true })).toMatch(/EUROS réels/);
  });
});

describe("inflation", () => {
  it("mesure la hausse de prix des charges récurrentes", () => {
    const releve = enrichir([
      op("1", "2026-06-03", "PRLV SEPA NETFLIX.COM", -1349),
      op("2", "2026-07-03", "PRLV SEPA NETFLIX.COM", -1349),
      op("3", "2026-08-03", "PRLV SEPA NETFLIX.COM", -1499),
      op("4", "2026-09-03", "PRLV SEPA NETFLIX.COM", -1499),
      op("5", "2026-06-15", "PRLV SEPA FREE MOBILE", -1999),
      op("6", "2026-07-15", "PRLV SEPA FREE MOBILE", -1999),
      op("7", "2026-08-15", "PRLV SEPA FREE MOBILE", -1999),
      op("8", "2026-09-15", "PRLV SEPA FREE MOBILE", -1999),
    ]);
    const m = inflationCharges(releve);
    expect(m.lignes).toHaveLength(2);
    expect(m.lignes[0].variationPct).toBeCloseTo(11.12, 1);
    expect(m.variationPct).toBeCloseTo((150 / 3348) * 100, 2);
    expect(m.moisObserves).toBe(3);
    expect(m.hausses).toBe(1);
  });

  it("ramène un montant passé en euros d'aujourd'hui, et un montant futur dans l'autre sens", () => {
    expect(enEurosConstants(1000, "2025-10-30", { tauxPct: 2, aujourdhui: AUJ })).toBeCloseTo(1020, 0);
    expect(enEurosConstants(1000, "2027-10-30", { tauxPct: 2, aujourdhui: AUJ })).toBeCloseTo(980.4, 0);
    expect(inflationOfficielle().source).toBe("INSEE");
  });
});

describe("santé financière", () => {
  it("prend comme mois de référence la moyenne des mois les plus chers", () => {
    const ops = [];
    const depenses = { "2026-05": 800, "2026-06": 400, "2026-07": 1200, "2026-08": 500, "2026-09": 1000 };
    let i = 0;
    for (const [m, euros] of Object.entries(depenses)) ops.push(op(String(++i), `${m}-10`, "CARTE 10/05/26 MAGASIN TEST CB*1", -euros * 100));
    const ref = moisDeReference(enrichir(ops));
    expect(ref.centimes).toBe(100000);
    expect(moisDeReference(enrichir(ops.slice(0, 2)))).toBeNull();
  });

  it("annonce un matelas compté sur les mois les plus chers", () => {
    const s = scoreSante({ matelasMois: 2, matelasPrudent: true });
    expect(s.criteres[0].valeur).toMatch(/tes mois les plus chers/);
  });

  it("note un point par mois et explique l'évolution", () => {
    const sante = (score, matelas) => ({ score, criteres: [{ id: "matelas", score: matelas }, { id: "epargne", score: 50 }] });
    let h = noterMois([], sante(60, 40), "2026-09");
    h = noterMois(h, sante(70, 60), "2026-10");
    h = noterMois(h, sante(72, 64), "2026-10");
    expect(h).toHaveLength(2);
    expect(noterMois(h, sante(72, 64), "2026-10")).toBe(h);
    expect(evolutionSante(h)).toEqual({ precedent: "2026-09", delta: 12, principal: { id: "matelas", libelle: "matelas", delta: 24 } });
  });
});
