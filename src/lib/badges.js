import { todayIso, valeurReleve } from "./finance";
import { plafondLegal, PLAFONDS_LEGAUX } from "./plafondsLivrets";
import { interetsQuinzaines } from "./livretsMouvements";
import { revenusPassifsAnnuels } from "./revenusPassifs";
import { poidsParSecteur } from "./exposition";
import { NON_CLASSE } from "./sectors";
import { parMois, moisDe, serieSolde } from "./compteCourant";
import { aClasser } from "./categorisationAssistee";
import { rapprocherAvances } from "./avances";
import { recurrences } from "./analyseCompte";
import { rapprocherCompte, statutDe, estPaye, annualiser, totaux, USAGES } from "./abonnements";

/**
 * Badges à débloquer.
 *
 * Cinquante-deux badges, en neuf familles. Certains ont CINQ NIVEAUX (un
 * matelas de 1 k€, puis 5 k€, 10 k€…), les autres s'obtiennent une fois.
 *
 * LA RARETÉ EST LA MATIÈRE. Cinq raretés, cinq matières : une médaille de
 * bronze est commune, une médaille de diamant légendaire. Un badge à niveaux
 * garde la même médaille et change de matière en montant ; un badge unique a
 * une rareté fixe, choisie selon le temps qu'il faut pour l'obtenir.
 *
 * UN BADGE NE SE PERD PAS. Le patrimoine baisse, un livret se vide : le niveau
 * atteint reste acquis, avec sa date. L'évaluation dit où en sont les données
 * AUJOURD'HUI ; `integrerEvaluation` ne retient que ce qui monte.
 *
 * Module pur : aucune requête, aucune dépendance React. Chaque condition lit
 * un « contexte » préparé par `useBadges.js` à partir des données de Patrium.
 */

// ─── Raretés ─────────────────────────────────────────────────────────────────

export const RARETES = [
  { id: "commun", libelle: "Commun", matiere: "Bronze", rang: 1 },
  { id: "peu-commun", libelle: "Peu commun", matiere: "Argent", rang: 2 },
  { id: "rare", libelle: "Rare", matiere: "Or", rang: 3 },
  { id: "epique", libelle: "Épique", matiere: "Platine", rang: 4 },
  { id: "legendaire", libelle: "Légendaire", matiere: "Diamant", rang: 5 },
];
const RARETE_PAR_ID = Object.fromEntries(RARETES.map((r) => [r.id, r]));

export const FAMILLES = [
  { id: "patrimoine", libelle: "Patrimoine" },
  { id: "epargne", libelle: "Matelas & livrets" },
  { id: "bourse", libelle: "PEA & Bourse" },
  { id: "dividendes", libelle: "Dividendes & revenus passifs" },
  { id: "compte", libelle: "Compte courant & budget" },
  { id: "abonnements", libelle: "Abonnements" },
  { id: "strategie", libelle: "Stratégie & discipline" },
  { id: "securite", libelle: "Sécurité & données" },
  { id: "secrets", libelle: "Secrets" },
];

// ─── Petits outils de calcul ─────────────────────────────────────────────────

const JOUR_MS = 86400000;
const jour = (iso) => String(iso || "").slice(0, 10);
const joursEntre = (a, b) => Math.round((new Date(`${jour(b)}T12:00:00Z`) - new Date(`${jour(a)}T12:00:00Z`)) / JOUR_MS);
const montantOp = (op) => Number(op?.montantNet ?? op?.amount ?? 0) || 0;
const ops = (c) => (Array.isArray(c.bourse?.operations) ? c.bourse.operations : []);
const opsDeType = (c, type) => ops(c).filter((o) => o?.type === type && o.date);
const positions = (c) => (Array.isArray(c.bourse?.positions) ? c.bourse.positions : []).filter((p) => Number(p?.quantity) > 0);

/** Relevés de patrimoine datés et chiffrés, du plus ancien au plus récent. */
function historique(c) {
  return (Array.isArray(c.historique) ? c.historique : [])
    .map((p) => ({ date: jour(p?.date), valeur: valeurReleve(p) }))
    .filter((p) => p.date && Number.isFinite(p.valeur))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Mois « AAAA-MM » suivant. */
function moisSuivant(m) {
  const [a, mm] = m.split("-").map(Number);
  return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`;
}

/** Plus longue suite de mois CONSÉCUTIFS (calendrier) dans un ensemble de mois. */
function plusLongueSuite(mois) {
  const tries = [...new Set(mois)].sort();
  let meilleure = 0;
  let courante = 0;
  let precedent = null;
  for (const m of tries) {
    courante = precedent && moisSuivant(precedent) === m ? courante + 1 : 1;
    meilleure = Math.max(meilleure, courante);
    precedent = m;
  }
  return meilleure;
}

/** Mois du compte courant terminés (le mois en cours est encore ouvert). */
const moisTermines = (c) => parMois(c.compteEnrichies || []).filter((l) => l.mois < moisDe(c.aujourdhui));

const estPlein = (livret) => {
  const plafond = plafondLegal(livret?.name);
  return !!plafond && (Number(livret?.balance) || 0) >= plafond - 0.5;
};
const livretPlein = (c, plafond) =>
  (c.livrets || []).some((l) => plafondLegal(l?.name) === plafond && estPlein(l));

const revenusPassifs = (c) =>
  revenusPassifsAnnuels({ positions: positions(c), enveloppe: c.bourse?.envelope || "PEA", livrets: c.livrets || [] });

// ─── Conditions ──────────────────────────────────────────────────────────────

/** Nombre de nouveaux plus-hauts, chacun précédé d'au moins sept relevés. */
function nombreRecords(c) {
  const h = historique(c);
  let max = -Infinity;
  let n = 0;
  h.forEach((p, i) => {
    if (i >= 7 && p.valeur > max) n += 1;
    max = Math.max(max, p.valeur);
  });
  return n;
}

/** Un plus-haut retrouvé après une baisse d'au moins 10 % depuis lui. */
function remontada(c) {
  let pic = -Infinity;
  let creux = false;
  for (const p of historique(c)) {
    if (p.valeur >= pic) {
      if (creux && pic >= 1000) return true;
      pic = p.valeur;
      creux = false;
    } else if (p.valeur <= pic * 0.9) {
      creux = true;
    }
  }
  return false;
}

/** Années de détention de la ligne la plus ancienne, sans vente depuis. */
function anneesDeDetention(c) {
  const parTicker = new Map();
  for (const op of ops(c)) {
    const t = String(op?.asset || op?.ticker || "").toUpperCase();
    if (!t || !op.date) continue;
    const l = parTicker.get(t) || { achats: [], derniereVente: null };
    if (op.type === "ACHAT") l.achats.push(jour(op.date));
    if (op.type === "VENTE" && (!l.derniereVente || op.date > l.derniereVente)) l.derniereVente = jour(op.date);
    parTicker.set(t, l);
  }
  let max = 0;
  for (const p of positions(c)) {
    const l = parTicker.get(String(p.ticker || "").toUpperCase());
    if (!l) continue;
    const debut = l.achats.filter((d) => !l.derniereVente || d > l.derniereVente).sort()[0];
    if (debut) max = Math.max(max, joursEntre(debut, c.aujourdhui) / 365.25);
  }
  return max;
}

/** Le portefeuille perd 10 % de sa performance en un mois, sans aucune vente. */
function sangFroid(c) {
  const points = (Array.isArray(c.bourseHistory) ? c.bourseHistory : [])
    .filter((p) => p?.date && Number(p.valeur) > 0 && Number(p.capital) > 0)
    .map((p) => ({ date: jour(p.date), r: Number(p.valeur) / Number(p.capital) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const ventes = opsDeType(c, "VENTE").map((o) => jour(o.date));
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length && joursEntre(points[i].date, points[j].date) <= 31; j++) {
      if (points[j].r <= points[i].r * 0.9 && !ventes.some((d) => d >= points[i].date && d <= points[j].date)) return true;
    }
  }
  return false;
}

/** Nombre de secteurs pesant au moins 1 % du portefeuille, ETF compris. */
function secteursCouverts(c) {
  const poids = poidsParSecteur(positions(c), c.secteursManuels || {});
  return Object.entries(poids).filter(([s, p]) => s !== NON_CLASSE && p >= 1).length;
}

/** Intérêts des livrets : crédités les années passées, acquis cette année. */
function interetsGagnes(c) {
  const annee = Number(c.aujourdhui.slice(0, 4));
  let total = 0;
  for (const l of c.livrets || []) {
    total += (l?.mouvements || [])
      .filter((m) => m?.nature === "interets" && jour(m.date) < `${annee}-01-01`)
      .reduce((s, m) => s + Math.abs(Number(m.montant) || 0), 0);
    try {
      total += interetsQuinzaines(l, annee, { aujourdhui: c.aujourdhui }).acquis || 0;
    } catch {
      /* livret trop abîmé pour une estimation : on passe */
    }
  }
  return total;
}

/** Plus long passage sans solde négatif sur le compte courant, en jours. */
function joursSansDecouvert(c) {
  const serie = serieSolde(c.compteEnrichies || [], c.compteReleves || []);
  if (serie.length < 2) return 0;
  let debut = serie[0].date;
  let meilleur = 0;
  for (const p of serie) {
    if (p.solde < 0) {
      meilleur = Math.max(meilleur, joursEntre(debut, p.date));
      debut = null;
    } else if (!debut) {
      debut = p.date;
    }
  }
  if (debut) meilleur = Math.max(meilleur, joursEntre(debut, serie[serie.length - 1].date));
  return meilleur;
}

/** Un mois terminé, d'au moins dix opérations, sans aucun marchand à classer. */
function moisToutClasse(c) {
  const enrichies = c.compteEnrichies || [];
  return moisTermines(c).some((l) => {
    const duMois = enrichies.filter((o) => moisDe(o.date) === l.mois);
    return duMois.length >= 10 && aClasser(duMois).length === 0;
  });
}

function rienNeMEchappe(c) {
  const enrichies = c.compteEnrichies || [];
  if (enrichies.length === 0) return false;
  const { charges } = recurrences(enrichies);
  if (!charges?.length) return false;
  return rapprocherCompte(c.subs || [], enrichies, { charges, ignores: c.ignores || [] }).detectes.length === 0;
}

const estVendredi13 = (iso) => {
  const d = new Date(`${jour(iso)}T12:00:00`);
  return d.getDate() === 13 && d.getDay() === 5;
};

const pileSurUnMillier = (v) => v >= 1000 && Math.abs(v - Math.round(v / 1000) * 1000) < 0.5;

function reveillonRecord(c) {
  const h = historique(c);
  let max = -Infinity;
  return h.some((p, i) => {
    const record = i >= 7 && p.valeur > max;
    max = Math.max(max, p.valeur);
    return record && /-(12-31|01-01)$/.test(p.date);
  });
}

// ─── Catalogue ───────────────────────────────────────────────────────────────

/**
 * Un badge à niveaux porte `seuils` (cinq valeurs croissantes, de bronze à
 * diamant) ; un badge unique porte `rarete`. `mesure` rend un nombre pour le
 * premier, un booléen pour le second. `libelles` remplace l'affichage
 * automatique des seuils quand l'unité ne s'y prête pas (des jours lus en
 * mois et en années).
 */
export const CATALOGUE = [
  // ── Patrimoine ──
  { id: "patrimoine-net", famille: "patrimoine", nom: "Patrimoine net", icone: "Mountain", condition: "Patrimoine net atteint", seuils: [10000, 25000, 50000, 100000, 250000], unite: "euros", mesure: (c) => c.patrimoineNet },
  { id: "recordman", famille: "patrimoine", nom: "Recordman", icone: "Crown", condition: "Nouveaux plus-hauts historiques", seuils: [1, 10, 25, 50, 100], unite: "nombre", mesure: nombreRecords },
  { id: "fidele", famille: "patrimoine", nom: "Fidèle", icone: "CalendarHeart", condition: "Ancienneté de ton suivi", seuils: [30, 91, 182, 365, 1095], libelles: ["1 mois", "3 mois", "6 mois", "1 an", "3 ans"], mesure: (c) => { const h = historique(c); return h.length ? joursEntre(h[0].date, c.aujourdhui) : 0; } },
  { id: "premier-pas", famille: "patrimoine", nom: "Premier pas", icone: "Footprints", rarete: "commun", condition: "Saisir ton premier actif", mesure: (c) => !c.isEmpty },
  { id: "remontada", famille: "patrimoine", nom: "Remontada", icone: "TrendingUp", rarete: "rare", condition: "Retrouver ton record après une baisse d'au moins 10 %", mesure: remontada },
  { id: "boule-de-neige", famille: "patrimoine", nom: "Boule de neige", icone: "Snowflake", rarete: "epique", condition: "Doubler ton patrimoine depuis ton premier relevé (1 000 € au moins au départ)", mesure: (c) => { const h = historique(c); if (!h.length || h[0].valeur < 1000) return false; return Math.max(c.patrimoineNet || 0, ...h.map((p) => p.valeur)) >= 2 * h[0].valeur; } },

  // ── Matelas & livrets ──
  { id: "matelas", famille: "epargne", nom: "Matelas", icone: "Shield", condition: "Épargne de précaution", seuils: [1000, 5000, 10000, 20000, 35000], unite: "euros", mesure: (c) => c.matelasEuros },
  { id: "matelas-mois", famille: "epargne", nom: "Matelas en mois", icone: "Umbrella", condition: "Mois de dépenses couverts par ton matelas", seuils: [1, 3, 6, 9, 12], unite: "mois", mesure: (c) => c.matelasMois || 0 },
  { id: "interets", famille: "epargne", nom: "Intérêts gagnés", icone: "Sprout", condition: "Intérêts cumulés de tes livrets (estimés pour l'année en cours)", seuils: [10, 100, 500, 1000, 5000], unite: "euros", mesure: interetsGagnes },
  { id: "premier-livret", famille: "epargne", nom: "Premier livret", icone: "PiggyBank", rarete: "commun", condition: "Ouvrir ton premier livret", mesure: (c) => (c.livrets || []).some((l) => Number(l?.balance) > 0) },
  { id: "livret-a-plein", famille: "epargne", nom: "Livret A plein", icone: "Landmark", rarete: "rare", condition: "Remplir ton Livret A jusqu'au plafond (22 950 €)", mesure: (c) => livretPlein(c, PLAFONDS_LEGAUX["livret a"]) },
  { id: "grand-chelem", famille: "epargne", nom: "Grand chelem", icone: "Trophy", rarete: "epique", condition: "Livret A et LDDS pleins en même temps", mesure: (c) => livretPlein(c, PLAFONDS_LEGAUX["livret a"]) && livretPlein(c, PLAFONDS_LEGAUX.ldds) },

  // ── PEA & Bourse ──
  { id: "age-pea", famille: "bourse", nom: "Âge du PEA", icone: "Hourglass", condition: "Ancienneté de ton PEA (l'or tombe aux 5 ans, le cap fiscal)", seuils: [1, 2, 5, 10, 15], unite: "ans", mesure: (c) => { const debut = c.bourse?.peaOuverture || ops(c).map((o) => jour(o.date)).filter(Boolean).sort()[0]; return debut ? joursEntre(debut, c.aujourdhui) / 365.25 : 0; } },
  { id: "versements-pea", famille: "bourse", nom: "Versements PEA", icone: "Banknote", condition: "Total versé sur ton PEA (diamant = plafond)", seuils: [1000, 10000, 25000, 75000, 150000], unite: "euros", mesure: (c) => Math.max(opsDeType(c, "VERSEMENT").reduce((s, o) => s + Math.abs(montantOp(o)), 0) - opsDeType(c, "RETRAIT").reduce((s, o) => s + Math.abs(montantOp(o)), 0), c.bourseInvested || 0) },
  { id: "metronome", famille: "bourse", nom: "Métronome", icone: "Repeat", condition: "Mois d'affilée avec un achat ou un versement", seuils: [3, 6, 12, 24, 60], unite: "mois", mesure: (c) => plusLongueSuite([...opsDeType(c, "ACHAT"), ...opsDeType(c, "VERSEMENT")].map((o) => moisDe(o.date))) },
  { id: "plus-value", famille: "bourse", nom: "Plus-value", icone: "Rocket", condition: "Plus-value latente de ton portefeuille", seuils: [5, 10, 25, 50, 100], unite: "pct", mesure: (c) => (positions(c).length && c.bourseInvested > 0 ? c.bourseGainPct || 0 : 0) },
  { id: "patience", famille: "bourse", nom: "Patience", icone: "Anchor", condition: "Garder une même ligne sans la vendre", seuils: [1, 2, 3, 5, 10], unite: "ans", mesure: anneesDeDetention },
  { id: "diversifie", famille: "bourse", nom: "Diversifié", icone: "ChartPie", condition: "Secteurs couverts par ton portefeuille, ETF compris", seuils: [3, 5, 7, 9, 11], unite: "nombre", mesure: secteursCouverts },
  { id: "premier-ordre", famille: "bourse", nom: "Premier ordre", icone: "ShoppingCart", rarete: "commun", condition: "Enregistrer ton premier achat", mesure: (c) => opsDeType(c, "ACHAT").length > 0 || positions(c).length > 0 },
  { id: "cap-sur-la-cible", famille: "bourse", nom: "Cap sur la cible", icone: "Crosshair", rarete: "peu-commun", condition: "Répartition livrets / bourse à 5 points au plus de ta cible", mesure: (c) => { const total = (c.livretsTotal || 0) + (c.bourseTotal || 0); if (!(c.livretsTotal > 0) || !(c.bourseTotal > 0)) return false; const cible = Number(c.allocationTarget?.bourse); return Number.isFinite(cible) && Math.abs((c.bourseTotal / total) * 100 - cible) <= 5; } },
  { id: "sang-froid", famille: "bourse", nom: "Sang-froid", icone: "Waves", rarete: "rare", condition: "Ton portefeuille perd 10 % en un mois et tu ne vends rien", mesure: sangFroid },
  { id: "doubleur", famille: "bourse", nom: "Doubleur", icone: "Zap", rarete: "epique", condition: "Une ligne à +100 % depuis l'achat", mesure: (c) => positions(c).some((p) => Number(p.pru) > 0 && Number(p.current_price) >= 2 * Number(p.pru)) },

  // ── Dividendes & revenus passifs ──
  { id: "dividendes", famille: "dividendes", nom: "Dividendes", icone: "Coins", condition: "Dividendes encaissés, au total", seuils: [10, 100, 500, 1000, 5000], unite: "euros", mesure: (c) => opsDeType(c, "DIVIDENDE").reduce((s, o) => s + Math.abs(montantOp(o)), 0) },
  { id: "revenus-passifs", famille: "dividendes", nom: "Revenus passifs", icone: "HandCoins", condition: "Dividendes et intérêts attendus, par mois", seuils: [10, 50, 100, 500, 1000], unite: "eurosMois", mesure: (c) => revenusPassifs(c).total / 12 },
  { id: "premier-dividende", famille: "dividendes", nom: "Premier dividende", icone: "CircleDollarSign", rarete: "commun", condition: "Encaisser ton premier dividende", mesure: (c) => opsDeType(c, "DIVIDENDE").length > 0 },
  { id: "abonnements-autofinances", famille: "dividendes", nom: "Abonnements autofinancés", icone: "Receipt", rarete: "epique", condition: "Revenus passifs au moins égaux au coût de tes abonnements", mesure: (c) => { const cout = totaux(c.subs || []).annuel; return cout > 0 && revenusPassifs(c).total >= cout; } },
  { id: "douze-sur-douze", famille: "dividendes", nom: "Douze sur douze", icone: "CalendarCheck", rarete: "epique", condition: "Un dividende chaque mois d'une même année", mesure: (c) => { const parAn = new Map(); for (const o of opsDeType(c, "DIVIDENDE")) { const a = jour(o.date).slice(0, 4); parAn.set(a, (parAn.get(a) || new Set()).add(jour(o.date).slice(5, 7))); } return [...parAn.values()].some((s) => s.size === 12); } },
  { id: "liberte-financiere", famille: "dividendes", nom: "Liberté financière", icone: "Infinity", rarete: "legendaire", condition: "Revenus passifs au moins égaux à tes dépenses mensuelles", mesure: (c) => c.depensesMensuelles > 0 && revenusPassifs(c).total / 12 >= c.depensesMensuelles },

  // ── Compte courant & budget ──
  { id: "taux-epargne", famille: "compte", nom: "Taux d'épargne", icone: "Percent", condition: "Part de tes revenus épargnée sur un mois", seuils: [10, 20, 30, 40, 50], unite: "pct", mesure: (c) => Math.max(0, ...moisTermines(c).filter((l) => l.entrees > 0).map((l) => (l.net / l.entrees) * 100)) },
  { id: "dans-le-vert", famille: "compte", nom: "Dans le vert", icone: "Leaf", condition: "Mois d'affilée avec plus de revenus que de dépenses", seuils: [1, 3, 6, 12, 24], unite: "mois", mesure: (c) => plusLongueSuite(moisTermines(c).filter((l) => l.net > 0).map((l) => l.mois)) },
  { id: "sante-financiere", famille: "compte", nom: "Santé financière", icone: "HeartPulse", condition: "Note de santé financière", seuils: [50, 60, 70, 80, 90], unite: "note", mesure: (c) => Math.max(0, ...(c.historiqueSante || []).map((e) => Number(e?.score) || 0)) },
  { id: "premier-releve", famille: "compte", nom: "Premier relevé", icone: "FileCheck", rarete: "commun", condition: "Importer ton premier relevé", mesure: (c) => (c.compteReleves || []).length > 0 },
  { id: "bon-compte", famille: "compte", nom: "Bon compte", icone: "Handshake", rarete: "commun", condition: "Une avance remboursée en entier", mesure: (c) => rapprocherAvances(c.avances || [], c.compteEnrichies || []).some((r) => r.statut === "rembourse") },
  { id: "tout-est-classe", famille: "compte", nom: "Tout est classé", icone: "ListChecks", rarete: "peu-commun", condition: "Un mois entier sans opération à classer", mesure: moisToutClasse },
  { id: "zero-decouvert", famille: "compte", nom: "Zéro découvert", icone: "BadgeCheck", rarete: "rare", condition: "Douze mois sans passer sous zéro", mesure: (c) => joursSansDecouvert(c) >= 365 },

  // ── Abonnements ──
  { id: "ciseaux", famille: "abonnements", nom: "Ciseaux", icone: "Scissors", condition: "Économies par an grâce à tes résiliations", seuils: [50, 150, 300, 600, 1000], unite: "eurosAn", mesure: (c) => (c.subs || []).filter((s) => statutDe(s) === "resilie").reduce((s, x) => s + annualiser(x), 0) },
  { id: "rien-ne-m-echappe", famille: "abonnements", nom: "Rien ne m'échappe", icone: "Radar", rarete: "commun", condition: "Tous les prélèvements détectés sur ton relevé sont suivis ou écartés", mesure: rienNeMEchappe },
  { id: "essai-dejoue", famille: "abonnements", nom: "Essai déjoué", icone: "Undo2", rarete: "peu-commun", condition: "Résilier un essai gratuit avant qu'il devienne payant", mesure: (c) => (c.subs || []).some((s) => statutDe(s) === "resilie" && s.fin_essai && s.resilie_le && jour(s.resilie_le) <= jour(s.fin_essai)) },
  { id: "inventaire-complet", famille: "abonnements", nom: "Inventaire complet", icone: "ClipboardCheck", rarete: "peu-commun", condition: "Usage renseigné pour chacun de tes abonnements (trois au moins)", mesure: (c) => { const payes = (c.subs || []).filter(estPaye); return payes.length >= 3 && payes.every((s) => USAGES[s.usage]); } },

  // ── Stratégie & discipline ──
  { id: "relectures", famille: "strategie", nom: "Relectures", icone: "BookOpen", condition: "Thèses relues", seuils: [1, 5, 10, 25, 50], unite: "nombre", mesure: (c) => (c.strategyNotes || []).reduce((s, n) => s + (Array.isArray(n?.revues) ? n.revues.length : 0), 0) },
  { id: "objectifs-atteints", famille: "strategie", nom: "Objectifs atteints", icone: "Target", condition: "Objectifs de patrimoine atteints", seuils: [1, 3, 5, 10, 20], unite: "nombre", mesure: (c) => { const ids = new Set(Array.isArray(c.objectifsSalues) ? c.objectifsSalues : []); for (const o of c.objectifs || []) if (Number(o?.cible) > 0 && (c.patrimoineNet || 0) >= Number(o.cible)) ids.add(o.id); return ids.size; } },
  { id: "premiere-these", famille: "strategie", nom: "Première thèse", icone: "NotebookPen", rarete: "commun", condition: "Écrire ta première thèse d'investissement", mesure: (c) => (c.strategyNotes || []).length > 0 },
  { id: "journal-de-bord", famille: "strategie", nom: "Journal de bord", icone: "Feather", rarete: "commun", condition: "Clore une thèse avec son bilan", mesure: (c) => (c.strategyNotes || []).some((n) => n?.archivee && n.postmortem) },
  { id: "voyant", famille: "strategie", nom: "Voyant", icone: "Telescope", rarete: "commun", condition: "Enregistrer un premier scénario de simulation", mesure: (c) => (c.scenarios || 0) > 0 },

  // ── Sécurité & données ──
  { id: "ceinture-et-bretelles", famille: "securite", nom: "Ceinture et bretelles", icone: "Archive", rarete: "commun", condition: "Exporter ta première sauvegarde", mesure: (c) => !!c.derniereSauvegarde },
  { id: "bouclier", famille: "securite", nom: "Bouclier", icone: "LockKeyhole", rarete: "peu-commun", condition: "Activer le chiffrement et créer ton code de secours", mesure: (c) => !!(c.chiffrement?.actif && c.chiffrement?.codeSecours) },
  { id: "donnees-au-propre", famille: "securite", nom: "Données au propre", icone: "Stethoscope", rarete: "peu-commun", condition: "Santé des données sans aucune alerte", mesure: (c) => !c.isEmpty && c.controlesDonnees === 0 },

  // ── Secrets ──
  { id: "fantome", famille: "secrets", secret: true, nom: "Fantôme", icone: "Ghost", rarete: "commun", condition: "Activer le mode Ghost", mesure: (c) => !!c.drapeaux?.fantome },
  { id: "vendredi-13", famille: "secrets", secret: true, nom: "Vendredi 13", icone: "Clover", rarete: "peu-commun", condition: "Acheter un vendredi 13", mesure: (c) => opsDeType(c, "ACHAT").some((o) => estVendredi13(o.date)) },
  { id: "pile-poil", famille: "secrets", secret: true, nom: "Pile poil", icone: "Scale", rarete: "rare", condition: "Un patrimoine net pile sur un millier, à l'euro près", mesure: (c) => pileSurUnMillier(c.patrimoineNet || 0) || historique(c).some((p) => pileSurUnMillier(p.valeur)) },
  { id: "reveillon-record", famille: "secrets", secret: true, nom: "Réveillon record", icone: "PartyPopper", rarete: "epique", condition: "Un nouveau record un 31 décembre ou un 1er janvier", mesure: reveillonRecord },
  { id: "le-million", famille: "secrets", secret: true, nom: "Le million", icone: "Gem", rarete: "legendaire", condition: "Un patrimoine net d'un million d'euros", mesure: (c) => Math.max(c.patrimoineNet || 0, ...historique(c).map((p) => p.valeur)) >= 1_000_000 },
].map((b, i) => ({ ...b, numero: i + 1 }));

export const BADGE_PAR_ID = Object.fromEntries(CATALOGUE.map((b) => [b.id, b]));
export const estANiveaux = (badge) => Array.isArray(badge?.seuils);
export const NIVEAU_MAX = 5;

/** Nombre total de médailles : cinq par badge à niveaux, une par badge unique. */
export const TOTAL_MEDAILLES = CATALOGUE.reduce((s, b) => s + (estANiveaux(b) ? NIVEAU_MAX : 1), 0);

/** Rareté d'un badge à un niveau donné (le premier niveau pour un badge à niveaux encore fermé). */
export function rareteDe(badge, niveau = 1) {
  if (estANiveaux(badge)) return RARETES[Math.min(Math.max(niveau, 1), NIVEAU_MAX) - 1];
  return RARETE_PAR_ID[badge?.rarete] || RARETES[0];
}

// ─── Affichage des seuils ────────────────────────────────────────────────────

const nf = (n, d = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: d });
const euros = (n) => (n >= 1_000_000 ? `${nf(n / 1_000_000, 1)} M€` : n >= 1000 ? `${nf(n / 1000, 1)} k€` : `${nf(n)} €`);

/** Libellé d'une valeur dans l'unité du badge (« 10 k€ », « 6 mois », « +25 % »). */
export function formaterValeur(badge, valeur, { arrondi = false } = {}) {
  const v = Number(valeur) || 0;
  switch (badge?.unite) {
    case "euros":
      return euros(arrondi ? Math.floor(v) : v);
    case "eurosMois":
      return `${nf(v)} €/mois`;
    case "eurosAn":
      return `${nf(v)} €/an`;
    case "mois":
      return `${nf(arrondi ? Math.floor(v) : v, arrondi ? 0 : 1)} mois`;
    case "ans": {
      const a = arrondi ? Math.floor(v * 10) / 10 : v;
      return `${nf(a, 1)} an${a >= 2 ? "s" : ""}`;
    }
    case "pct":
      return `${v >= 0 ? "+" : ""}${nf(v, 0)} %`;
    case "note":
      return `${nf(v)}/100`;
    default:
      return nf(v);
  }
}

/** Libellé du seuil d'un niveau (1 à 5). */
export function libelleSeuil(badge, niveau) {
  if (!estANiveaux(badge) || niveau < 1 || niveau > NIVEAU_MAX) return "";
  if (badge.libelles) return badge.libelles[niveau - 1];
  const s = badge.seuils[niveau - 1];
  return badge.unite === "pct" ? `+${nf(s)} %` : formaterValeur(badge, s);
}

/** Valeur courante lisible, pour la barre de progression. */
export function libelleValeur(badge, valeur) {
  if (badge.id === "fidele") {
    const j = Math.max(0, Math.floor(Number(valeur) || 0));
    return j >= 365 ? `${nf(Math.floor((j / 365.25) * 10) / 10, 1)} an${j >= 730 ? "s" : ""}` : `${Math.floor(j / 30.44)} mois`;
  }
  return formaterValeur(badge, valeur, { arrondi: true });
}

// ─── Évaluation ──────────────────────────────────────────────────────────────

/**
 * Où en est un badge AUJOURD'HUI.
 * @returns {{ niveau: number, valeur: number|boolean, seuilSuivant: number|null, progression: number }}
 *   `progression` va de 0 à 1 vers le niveau suivant (1 quand tout est obtenu).
 */
export function evaluerBadge(badge, contexte) {
  let brut;
  try {
    brut = badge.mesure(contexte);
  } catch {
    brut = estANiveaux(badge) ? 0 : false;
  }
  if (!estANiveaux(badge)) {
    const obtenu = !!brut;
    return { niveau: obtenu ? 1 : 0, valeur: obtenu, seuilSuivant: null, progression: obtenu ? 1 : 0 };
  }
  const valeur = Number.isFinite(Number(brut)) ? Number(brut) : 0;
  const niveau = badge.seuils.filter((s) => valeur >= s).length;
  const seuilSuivant = niveau < NIVEAU_MAX ? badge.seuils[niveau] : null;
  const progression = seuilSuivant == null ? 1 : Math.max(0, Math.min(1, valeur / seuilSuivant));
  return { niveau, valeur, seuilSuivant, progression };
}

/** Évalue tout le catalogue : `{ [id]: évaluation }`. */
export function evaluerBadges(contexte = {}) {
  const c = { aujourdhui: todayIso(), ...contexte };
  return Object.fromEntries(CATALOGUE.map((b) => [b.id, evaluerBadge(b, c)]));
}

// ─── État persistant ─────────────────────────────────────────────────────────

/**
 * Clé `badges` :
 *  · `obtenus[id] = { niveau, dates: { "1": "2026-11-17", … } }` — le plus
 *    haut niveau atteint et la date de chacun ;
 *  · `drapeaux` — gestes ponctuels qu'aucune donnée ne garde (le mode Ghost) ;
 *  · `initialise` — date du premier passage : tout ce qui est déjà acquis à
 *    ce moment-là est débloqué d'un coup, en une seule célébration.
 */
export const ETAT_BADGES_VIDE = { obtenus: {}, drapeaux: {}, initialise: null };

export const normaliserEtat = (etat) =>
  etat && typeof etat === "object"
    ? { obtenus: etat.obtenus || {}, drapeaux: etat.drapeaux || {}, initialise: etat.initialise || null }
    : ETAT_BADGES_VIDE;

/** Niveau acquis d'un badge, d'après l'état enregistré. */
export const niveauAcquis = (etat, id) => Number(normaliserEtat(etat).obtenus[id]?.niveau) || 0;

/**
 * Retient ce qui monte.
 *
 * @returns {{ etat, nouveautes: {id, niveau, depuis}[], premierPassage: boolean }}
 *   `etat` est l'objet d'origine s'il n'y a rien de nouveau : rien à réécrire.
 */
export function integrerEvaluation(etatBrut, evaluations, aujourdhui = todayIso()) {
  const etat = normaliserEtat(etatBrut);
  const premierPassage = !etat.initialise;
  const obtenus = { ...etat.obtenus };
  const nouveautes = [];
  for (const badge of CATALOGUE) {
    const niveau = evaluations?.[badge.id]?.niveau || 0;
    const depuis = Number(obtenus[badge.id]?.niveau) || 0;
    if (niveau <= depuis) continue;
    const dates = { ...(obtenus[badge.id]?.dates || {}) };
    for (let n = depuis + 1; n <= niveau; n++) dates[n] = aujourdhui;
    obtenus[badge.id] = { niveau, dates };
    nouveautes.push({ id: badge.id, niveau, depuis });
  }
  if (!premierPassage && nouveautes.length === 0) return { etat: etatBrut, nouveautes, premierPassage };
  return {
    etat: { ...etat, obtenus, initialise: etat.initialise || aujourdhui },
    nouveautes,
    premierPassage,
  };
}

/** Lève un drapeau (une seule fois : la première date fait foi). */
export function leverDrapeau(etatBrut, nom, date = todayIso()) {
  const etat = normaliserEtat(etatBrut);
  if (etat.drapeaux[nom]) return etatBrut;
  return { ...etat, drapeaux: { ...etat.drapeaux, [nom]: date } };
}

/** Résumé de la vitrine : badges et médailles obtenus, par rareté. */
export function resumeVitrine(etatBrut) {
  const etat = normaliserEtat(etatBrut);
  const parRarete = Object.fromEntries(RARETES.map((r) => [r.id, 0]));
  let badges = 0;
  let medailles = 0;
  for (const b of CATALOGUE) {
    const n = niveauAcquis(etat, b.id);
    if (!n) continue;
    badges += 1;
    medailles += n;
    if (estANiveaux(b)) for (let i = 1; i <= n; i++) parRarete[rareteDe(b, i).id] += 1;
    else parRarete[rareteDe(b).id] += 1;
  }
  return { badges, medailles, parRarete, totalBadges: CATALOGUE.length, totalMedailles: TOTAL_MEDAILLES };
}

// ─── Annonces ────────────────────────────────────────────────────────────────

const ecouteurs = new Set();

/** S'abonne aux déblocages (la scène de célébration). Rend la fonction de désabonnement. */
export function ecouterBadges(f) {
  ecouteurs.add(f);
  return () => ecouteurs.delete(f);
}

/**
 * Annonce des badges débloqués. `groupe` : plusieurs d'un coup — le premier
 * passage, ou un import qui en débloque plusieurs — en une seule célébration.
 * Rend `false` quand personne n'écoute.
 */
export function annoncerBadges(annonce) {
  if (ecouteurs.size === 0) return false;
  ecouteurs.forEach((f) => f(annonce));
  return true;
}
