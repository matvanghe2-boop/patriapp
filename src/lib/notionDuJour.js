import {
  eur,
  pct,
  pctPlain,
  nombre,
  valeurPosition,
  coutPosition,
  tauxPosition,
  computePeaAge,
  plafondPea,
  computeDividendSummary,
  computeMaxDrawdown,
  computeVolatility,
  avecIndicePerformance,
  MIN_POINTS_FOR_STATS,
} from "./finance";
import { inflationOfficielle } from "./inflation";
import { compositionDe } from "./compositionEtf";
import { THEMES_NOTIONS } from "./notionsCatalogue";

/**
 * Notion du jour : un concept de finance par jour, expliqué en quelques
 * phrases, avec un exemple tiré du patrimoine quand les données le permettent.
 *
 * Le texte des notions vit dans `notionsCatalogue.js` ; ce module calcule les
 * exemples personnels et choisit la notion du jour.
 *
 * Même règle que le briefing : un exemple « perso » n'est écrit que sur des
 * données présentes et exploitables. Sinon, la notion garde son exemple
 * générique, aux chiffres ronds — annoncé comme tel, pour qu'on ne le prenne
 * jamais pour un calcul sur ses propres comptes.
 *
 * La notion change chaque jour et suit l'ordre du catalogue : tout le monde
 * voit la même ce jour-là, sur tous ses appareils, sans rien enregistrer.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

const JOUR_MS = 86400000;
const nomCourt = (p) => (p?.name || p?.ticker || "").replace(/\s+(S\.?A\.?|SE|SA|plc|N\.V\.)$/i, "");
const dateFr = (iso) =>
  new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .replace(/^1 /, "1er ");
const pluriel = (n, mot) => `${mot}${n > 1 ? "s" : ""}`;

/** Lignes détenues avec un cours exploitable, de la plus lourde à la plus légère. */
const lignesValorisees = (positions = []) =>
  (positions || [])
    .filter((p) => Number(p?.quantity) > 0 && Number(p?.current_price) > 0)
    .map((p) => ({ p, valeur: valeurPosition(p) }))
    .sort((a, b) => b.valeur - a.valeur);

const livretsRemuneres = (livrets = []) =>
  (livrets || []).filter((l) => Number(l?.balance) > 0 && Number(l?.rate) > 0);

const plusGrosLivret = (livrets = []) => [...livretsRemuneres(livrets)].sort((a, b) => b.balance - a.balance)[0];

/**
 * Exemples calculés, par identifiant de notion. Chacun renvoie une phrase,
 * ou `null` quand les données ne suffisent pas : l'exemple générique du
 * catalogue prend alors le relais.
 */
const EXEMPLES = {
  pru: ({ positions }) => {
    const ligne = lignesValorisees(positions).find(({ p }) => Number(p.pru) > 0);
    if (!ligne) return null;
    const { p } = ligne;
    const ecart = p.current_price - p.pru;
    return `Tu détiens ${nombre(p.quantity, 0)} ${nomCourt(p)} à un PRU de ${eur(p.pru, 2)}. Au cours de ${eur(p.current_price, 2)}, chaque titre est en ${ecart >= 0 ? "plus" : "moins"}-value de ${eur(Math.abs(ecart), 2)} (${pct((ecart / p.pru) * 100)}).`;
  },

  "plus-value-latente": ({ positions, envelope, operations }) => {
    const lignes = lignesValorisees(positions).filter(({ p }) => Number(p.pru) > 0);
    if (lignes.length === 0) return null;
    const valeur = lignes.reduce((s, l) => s + l.valeur, 0);
    const cout = lignes.reduce((s, l) => s + coutPosition(l.p), 0);
    if (!(cout > 0)) return null;
    const latente = valeur - cout;
    const realisee = (operations || []).reduce((s, op) => s + (Number(op?.plusValueRealisee) || 0), 0);
    return (
      `Ton portefeuille affiche ${eur(latente)} de ${latente >= 0 ? "plus" : "moins"}-value latente (${pct((latente / cout) * 100)})` +
      (realisee ? `, et tes ventes ont déjà réalisé ${eur(realisee)}.` : ".") +
      (envelope === "PEA" ? " Dans un PEA, même une plus-value réalisée n'est imposée qu'au moment où tu retires l'argent du plan." : "")
    );
  },

  "rendement-dividende": ({ positions }) => {
    const ligne = lignesValorisees(positions).find(({ p }) => Number(p.annual_dividend) > 0);
    if (!ligne) return null;
    const { p } = ligne;
    const surCours = (p.annual_dividend / p.current_price) * 100;
    return (
      `${nomCourt(p)} verse ${eur(p.annual_dividend, 2)} par action et par an. Au cours de ${eur(p.current_price, 2)}, ça fait un rendement de ${pctPlain(surCours)}` +
      (Number(p.pru) > 0 ? ` ; sur ton PRU de ${eur(p.pru, 2)}, ${pctPlain((p.annual_dividend / p.pru) * 100)}.` : ".")
    );
  },

  "poids-ligne": ({ positions }) => {
    const lignes = lignesValorisees(positions);
    const total = lignes.reduce((s, l) => s + l.valeur, 0);
    if (!(total > 0)) return null;
    const { p, valeur } = lignes[0];
    return `${nomCourt(p)} pèse ${pctPlain((valeur / total) * 100, 0)} de tes titres (${eur(valeur)}). Une baisse de 10 % sur cette seule ligne te coûterait ${eur(valeur * 0.1)}.`;
  },

  diversification: ({ positions }) => {
    const lignes = lignesValorisees(positions);
    if (lignes.length === 0) return null;
    const etf = lignes.filter(({ p }) => p.type === "ETF" || compositionDe(p.ticker)).length;
    return (
      `Ton portefeuille compte ${lignes.length} ${pluriel(lignes.length, "ligne")}` +
      (etf > 0 ? `, dont ${etf} ${pluriel(etf, "ETF")} qui ${etf > 1 ? "répartissent" : "répartit"} déjà le risque sur de nombreuses sociétés.` : ", sans ETF : chaque société y pèse de tout son poids.")
    );
  },

  "etf-indice": ({ positions }) => {
    const lignes = lignesValorisees(positions);
    const avecIndice = lignes.map(({ p }) => ({ p, compo: compositionDe(p.ticker) })).find((l) => l.compo);
    if (avecIndice) {
      const { p, compo } = avecIndice;
      const us = compo.pays?.["États-Unis"];
      return (
        `${nomCourt(p)} suit le ${compo.indice} : ${nombre(compo.constituants, 0)} sociétés en une seule ligne` +
        (us ? `, dont ${pctPlain(us, 0)} aux États-Unis` : "") +
        ` (fiche de l'indice au ${dateFr(compo.date)}).`
      );
    }
    const etf = lignes.find(({ p }) => p.type === "ETF");
    return etf ? `${nomCourt(etf.p)} est un ETF : avec cette seule ligne, tu détiens une part de chacune des sociétés de son indice.` : null;
  },

  "interets-composes": ({ livrets }) => {
    const l = plusGrosLivret(livrets);
    if (!l) return null;
    const dans20ans = l.balance * Math.pow(1 + l.rate, 20);
    return `Sur ton ${l.name}, ${eur(l.balance)} à ${pctPlain(l.rate * 100, 2)} deviendraient ${eur(dans20ans)} en 20 ans sans y toucher, dont ${eur(dans20ans - l.balance)} d'intérêts — si le taux ne changeait pas.`;
  },

  "regle-72": ({ livrets }) => {
    const l = plusGrosLivret(livrets);
    if (!l) return null;
    return `À ${pctPlain(l.rate * 100, 2)}, ton ${l.name} doublerait en environ ${nombre(72 / (l.rate * 100), 0)} ans, si son taux ne changeait pas.`;
  },

  "livret-a": ({ livrets }) => {
    const l = (livrets || []).find((x) => /livret a\b/i.test(x?.name || "") && Number(x?.balance) >= 0);
    if (!l) return null;
    const plafond = Number(l.limit) > 0 ? Number(l.limit) : 22950;
    return `Ton Livret A contient ${eur(l.balance)}, soit ${pctPlain((l.balance / plafond) * 100, 0)} de son plafond de ${eur(plafond)}.`;
  },

  "rendement-reel": ({ livrets, inflation }) => {
    const l = plusGrosLivret(livrets);
    if (!l || !Number.isFinite(inflation?.tauxPct)) return null;
    const reel = ((1 + l.rate) / (1 + inflation.tauxPct / 100) - 1) * 100;
    return (
      `Ton ${l.name} rapporte ${pctPlain(l.rate * 100, 2)} ; l'inflation officielle est de ${pctPlain(inflation.tauxPct)} sur un an` +
      (inflation.date ? ` (chiffre du ${dateFr(inflation.date)})` : "") +
      `. Ton rendement réel est donc d'environ ${pct(reel)}.`
    );
  },

  inflation: ({ livretsTotal, inflation }) => {
    if (!(livretsTotal > 0) || !(inflation?.tauxPct > 0)) return null;
    const perte = livretsTotal - livretsTotal / (1 + inflation.tauxPct / 100);
    return `Au rythme officiel actuel (${pctPlain(inflation.tauxPct)} sur un an), tes ${eur(livretsTotal)} d'épargne perdraient environ ${eur(perte)} de pouvoir d'achat en un an, avant intérêts.`;
  },

  "revenus-passifs": ({ livrets, positions, envelope }) => {
    const interets = livretsRemuneres(livrets).reduce((s, l) => s + l.balance * l.rate, 0);
    const lignes = lignesValorisees(positions).map(({ p }) => p);
    const dividendes = lignes.some((p) => Number(p.annual_dividend) > 0) ? computeDividendSummary(lignes, envelope).totalAnnualDividendNet : 0;
    const total = interets + dividendes;
    if (!(total > 0)) return null;
    return `Tes intérêts et dividendes représentent environ ${eur(total)} par an, soit ${eur(total / 12)} par mois.`;
  },

  "risque-change": ({ positions }) => {
    const lignes = lignesValorisees(positions);
    const enDevise = lignes.find(({ p }) => p.currency && p.currency !== "EUR" && tauxPosition(p) !== 1);
    if (enDevise) {
      return `${nomCourt(enDevise.p)} est coté en ${enDevise.p.currency} : une baisse de 10 % de cette devise face à l'euro ferait perdre ${eur(enDevise.valeur * 0.1)} à la ligne, cours inchangé.`;
    }
    const etf = lignes.map(({ p }) => ({ p, compo: compositionDe(p.ticker) })).find((l) => l.compo?.pays?.["États-Unis"]);
    return etf
      ? `${nomCourt(etf.p)} est coté en euros, mais ${pctPlain(etf.compo.pays["États-Unis"], 0)} de son indice est aux États-Unis : une bonne partie de sa valeur suit le dollar.`
      : null;
  },

  "retenue-source": ({ positions, envelope }) => {
    const lignes = lignesValorisees(positions).map(({ p }) => p);
    if (!lignes.some((p) => Number(p.annual_dividend) > 0)) return null;
    const resume = computeDividendSummary(lignes, envelope);
    if (!(resume.totalRetenueSource > 0)) return null;
    return `Sur ${eur(resume.totalAnnualDividend)} de dividendes attendus par an, environ ${eur(resume.totalRetenueSource)} partent en retenue à la source étrangère.`;
  },

  "pea-cinq-ans": ({ envelope, peaOuverture }) => {
    if (envelope !== "PEA" || !peaOuverture) return null;
    const age = computePeaAge(peaOuverture);
    if (!age || age.years < 0) return null;
    if (age.eligible) return `Ton PEA a ${age.years} ans : il a passé le cap des 5 ans.`;
    const duree = age.years > 0 ? `${age.years} ${pluriel(age.years, "an")} et ${age.months} mois` : `${age.months} mois`;
    return `Ton PEA a ${duree} : encore ${age.monthsRemaining} mois avant le cap des 5 ans.`;
  },

  "plafond-pea": ({ envelope, bourse }) => {
    const verse = Number(bourse?.peaVersements);
    if (envelope !== "PEA" || !(verse > 0)) return null;
    const plafond = plafondPea(bourse);
    return `Tu as versé ${eur(verse)} sur ton PEA, pour un plafond de ${eur(plafond)} : il te reste ${eur(Math.max(0, plafond - verse))} de versements possibles.`;
  },

  "liquidites-pea": ({ envelope, bourse }) => {
    const liquidites = Number(bourse?.cash_pocket);
    if (envelope !== "PEA" || !(liquidites > 0)) return null;
    return `Tu as ${eur(liquidites)} de liquidités non investies dans ton PEA.`;
  },

  "frais-courtage": ({ operations }) => {
    const ordres = (operations || []).filter((op) => (op?.type === "ACHAT" || op?.type === "VENTE") && Number(op?.quantity) > 0 && Number(op?.price) > 0);
    const frais = ordres.reduce((s, op) => s + (Number(op.fees) || 0), 0);
    if (ordres.length === 0 || !(frais > 0)) return null;
    const montants = ordres.reduce((s, op) => s + op.quantity * op.price, 0);
    return `Tu as payé ${eur(frais, 2)} de frais sur ${ordres.length} ${pluriel(ordres.length, "ordre")}, soit ${pctPlain((frais / montants) * 100, 2)} des montants échangés.`;
  },

  drawdown: ({ bourseHistory }) => {
    if (!Array.isArray(bourseHistory) || bourseHistory.length < MIN_POINTS_FOR_STATS) return null;
    // Sur l'indice de performance, comme l'onglet Bourse : un retrait n'est pas une baisse du marché.
    const dd = computeMaxDrawdown(avecIndicePerformance(bourseHistory).map((h) => ({ ...h, valeur: h.indice })));
    if (!dd || !(dd.maxDrawdownPct < 0) || !dd.peakDate || !dd.troughDate) return null;
    return (
      `Ta plus forte baisse depuis un plus haut : ${pct(dd.maxDrawdownPct)}, entre le ${dateFr(dd.peakDate)} et le ${dateFr(dd.troughDate)}.` +
      (dd.stillInDrawdown
        ? " Ton portefeuille n'a pas encore retrouvé ce plus haut."
        : dd.recoveryDays != null
          ? ` Il l'a retrouvé ${dd.recoveryDays} jours plus tard.`
          : "")
    );
  },

  volatilite: ({ bourseHistory }) => {
    if (!Array.isArray(bourseHistory) || bourseHistory.length <= MIN_POINTS_FOR_STATS) return null;
    // Rendements quotidiens déjà neutralisés des versements, et annualisés, en %.
    const vol = computeVolatility(bourseHistory);
    if (!Number.isFinite(vol) || !(vol > 0)) return null;
    return `La volatilité de ton portefeuille est d'environ ${pctPlain(vol, 0)} par an, d'après ses variations quotidiennes.`;
  },

  "epargne-precaution": ({ matelasMois }) =>
    Number.isFinite(matelasMois) && matelasMois > 0 ? `Ton épargne disponible couvre environ ${nombre(matelasMois)} mois de dépenses.` : null,

  "taux-epargne": ({ epargneMensuelle, tauxEpargne }) =>
    epargneMensuelle > 0 && tauxEpargne > 0 ? `Tu mets de côté ${eur(epargneMensuelle)} par mois, soit ${pctPlain(tauxEpargne, 0)} de tes revenus.` : null,

  dca: ({ operations, envelope, aujourdhui }) => {
    const debut = new Date(Date.parse(`${aujourdhui}T12:00:00Z`) - 365 * JOUR_MS).toISOString().slice(0, 10);
    const versements = (operations || []).filter((op) => op?.type === "VERSEMENT" && op.date > debut && op.date <= aujourdhui && Number(op.amount) > 0);
    if (versements.length < 2) return null;
    const total = versements.reduce((s, op) => s + Number(op.amount), 0);
    return `Sur les 12 derniers mois, tu as fait ${versements.length} versements sur ton ${envelope || "portefeuille"}, pour ${eur(total)} (${eur(total / versements.length)} en moyenne).`;
  },

  allocation: ({ livretsTotal, bourseTotal }) => {
    const total = (livretsTotal || 0) + (bourseTotal || 0);
    if (!(livretsTotal > 0) || !(bourseTotal > 0)) return null;
    return `Entre bourse et livrets (${eur(total)}), tu as ${pctPlain((bourseTotal / total) * 100, 0)} en bourse et ${pctPlain((livretsTotal / total) * 100, 0)} sur des livrets.`;
  },
};

/**
 * Ordre du catalogue : les thèmes sont répartis régulièrement sur le cycle,
 * pour ne pas enchaîner dix jours de fiscalité puis dix jours d'obligations.
 * Chaque notion reçoit une place proportionnelle à son rang dans son thème.
 */
function repartirThemes(themes) {
  return themes
    .flatMap((theme, t) =>
      theme.notions.map((n, i) => ({ ...n, theme: theme.libelle, cle: (i + 0.5) / theme.notions.length, t }))
    )
    .sort((a, b) => a.cle - b.cle || a.t - b.t)
    .map(({ cle: _cle, t: _t, ...n }) => ({ ...n, exemple: EXEMPLES[n.id] || null }));
}

export const NOTIONS = repartirThemes(THEMES_NOTIONS);

/** Identifiants des exemples calculés, pour vérifier qu'aucun ne vise une notion absente. */
export const IDS_EXEMPLES = Object.keys(EXEMPLES);

/** Rang de la notion d'un jour donné ; `decalage` permet de feuilleter. */
export function indexNotion(aujourdhui, decalage = 0, nombreNotions = NOTIONS.length) {
  const jour = Math.floor(Date.parse(`${aujourdhui}T12:00:00Z`) / JOUR_MS);
  const i = (jour + decalage) % nombreNotions;
  return i < 0 ? i + nombreNotions : i;
}

/**
 * @returns {{id: string, titre: string, theme: string, definition: string, exemple: string, perso: boolean, rang: number, total: number}}
 */
export function construireNotion({
  aujourdhui,
  decalage = 0,
  bourse = null,
  livrets = [],
  bourseHistory = [],
  matelasMois = null,
  epargneMensuelle = 0,
  tauxEpargne = 0,
  livretsTotal = 0,
  bourseTotal = 0,
  inflation = inflationOfficielle(),
} = {}) {
  const rang = indexNotion(aujourdhui, decalage);
  const notion = NOTIONS[rang];
  const donnees = {
    aujourdhui,
    bourse,
    positions: bourse?.positions || [],
    envelope: bourse?.envelope || "PEA",
    operations: bourse?.operations || [],
    peaOuverture: bourse?.peaOuverture || null,
    livrets,
    bourseHistory,
    matelasMois,
    epargneMensuelle,
    tauxEpargne,
    livretsTotal,
    bourseTotal,
    inflation,
  };
  let perso = null;
  try {
    perso = notion.exemple ? notion.exemple(donnees) : null;
  } catch {
    // Une donnée inattendue ne doit pas faire tomber l'en-tête : on garde l'exemple générique.
    perso = null;
  }
  return {
    id: notion.id,
    titre: notion.titre,
    theme: notion.theme,
    definition: notion.definition,
    exemple: perso || notion.generique,
    perso: Boolean(perso),
    rang,
    total: NOTIONS.length,
  };
}
