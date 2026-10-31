import { todayIso, lireNombre } from "./finance";
import { plafondLegal } from "./plafondsLivrets";
import { soldeAu, depotsNets, interetsQuinzaines, serieTauxPour } from "./livretsMouvements";
import { RATES_CATALOG } from "../../shared/ratesCatalog";

/**
 * Livrets & Épargne — ce que l'onglet calcule au-delà du solde.
 *
 * Champs facultatifs d'un livret, tous ajoutés par les réglages de la ligne :
 *  · `fiscalise`, `tauxBrut` (en %) — livret bancaire soumis à la flat tax ;
 *  · `boost` : `{ fin, tauxApres }` — taux promotionnel jusqu'à `fin`, puis
 *    `tauxApres` (décimal, net). `rate` reste le taux EN VIGUEUR aujourd'hui ;
 *  · `virement` : `{ montant, jour }` — virement automatique mensuel ;
 *  · `ouverture` (date) — pour l'âge fiscal d'une assurance-vie ou d'un PEL.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

const JOUR_MS = 86400000;

/** « de mars », mais « d'octobre » : l'élision devant une voyelle. */
export const deMot = (mot) => (/^[aeiouyéèêh]/i.test(String(mot)) ? `d'${mot}` : `de ${mot}`);
const joursEntre = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / JOUR_MS);
const pad = (n) => String(n).padStart(2, "0");

/** « 2026-10-30 » + n mois, jour borné à la fin du mois. */
export function ajouterMois(iso, n) {
  const [a, m, j] = iso.split("-").map(Number);
  const total = m - 1 + n;
  const annee = a + Math.floor(total / 12);
  const mois = ((total % 12) + 12) % 12;
  const fin = new Date(annee, mois + 1, 0).getDate();
  return `${annee}-${pad(mois + 1)}-${pad(Math.min(j, fin))}`;
}

const valeurCatalogue = (id) => RATES_CATALOG.find((r) => r.id === id) || null;

/** Flat tax en vigueur, lue dans le catalogue des taux (source unique). */
export function flatTaxPct() {
  return valeurCatalogue("flat-tax")?.value ?? 30;
}

/** Taux net (%) d'un taux brut (%) soumis à la flat tax. */
export function tauxNetDepuisBrut(brutPct, flatTax = flatTaxPct()) {
  const b = lireNombre(brutPct);
  return b == null ? null : Math.round(b * (1 - flatTax / 100) * 1000) / 1000;
}

// ─── Virement programmé ──────────────────────────────────────────────────────

/** Le plafond d'un livret : saisi, ou légal d'après son nom. */
export const plafondDe = (livret) => livret?.limit || plafondLegal(livret?.name);

/**
 * Où mène le virement automatique : le mois où le plafond sera atteint, s'il
 * y en a un. C'est la date à laquelle il faudra rediriger le virement — passé
 * le plafond, la banque le refuse ou le laisse sur le compte courant.
 */
export function projectionVirement(livret, { aujourdhui = todayIso() } = {}) {
  const montant = lireNombre(livret?.virement?.montant);
  if (!(montant > 0)) return null;
  const plafond = plafondDe(livret);
  const solde = Number(livret.balance) || 0;
  if (!plafond) return { montant, plafond: null, datePlafond: null, moisRestants: null };
  const reste = plafond - solde;
  if (reste <= 0) return { montant, plafond, datePlafond: aujourdhui, moisRestants: 0, atteint: true };
  const moisRestants = Math.ceil(reste / montant);
  const jour = Math.min(Math.max(1, Number(livret.virement.jour) || 1), 28);
  const premier = Number(aujourdhui.slice(8, 10)) < jour ? `${aujourdhui.slice(0, 8)}${pad(jour)}` : ajouterMois(`${aujourdhui.slice(0, 8)}${pad(jour)}`, 1);
  return { montant, plafond, moisRestants, datePlafond: ajouterMois(premier, moisRestants - 1) };
}

/**
 * Le virement est-il bien parti ? On cherche, sur le relevé du compte courant,
 * une sortie vers ses propres comptes du même montant (à 1 % près), autour du
 * jour prévu, dans le dernier mois que les relevés couvrent entièrement.
 *
 * @returns {{statut: "vu"|"absent"|"inconnu", date?: string, mois?: string}}
 */
export function verifierVirement(livret, enrichies = [], { tolerance = 5 } = {}) {
  const montant = lireNombre(livret?.virement?.montant);
  if (!(montant > 0) || !(enrichies || []).length) return { statut: "inconnu" };
  const jour = Math.min(Math.max(1, Number(livret.virement.jour) || 1), 28);
  const fin = (enrichies || []).reduce((max, o) => (o.date > max ? o.date : max), "");
  // Dernier mois dont la fenêtre (jour + tolérance) est couverte par les relevés.
  let mois = fin.slice(0, 7);
  if (`${mois}-${pad(Math.min(jour + tolerance, 28))}` > fin) mois = ajouterMois(`${mois}-01`, -1).slice(0, 7);
  const debut = `${mois}-${pad(Math.max(1, jour - tolerance))}`;
  const finFenetre = `${mois}-${pad(Math.min(jour + tolerance, 28))}`;
  const cible = Math.round(montant * 100);
  const trouve = (enrichies || []).find(
    (o) =>
      o.montant < 0 &&
      o.famille === "interne" &&
      o.date >= debut &&
      o.date <= finFenetre &&
      Math.abs(Math.abs(o.montant) - cible) <= Math.max(1, cible * 0.01)
  );
  return trouve ? { statut: "vu", date: trouve.date, mois } : { statut: "absent", mois };
}

// ─── Objectif et historique ──────────────────────────────────────────────────

/**
 * Date d'atteinte de l'objectif d'un livret, au rythme réel des dépôts des
 * `mois` derniers mois — ou, à défaut d'historique, à celui du virement
 * programmé. `null` si aucun rythme n'est connu : on ne devine pas.
 */
export function dateObjectif(livret, { aujourdhui = todayIso(), mois = 6 } = {}) {
  const objectif = lireNombre(livret?.goal);
  if (!(objectif > 0)) return null;
  const solde = Number(livret.balance) || 0;
  if (solde >= objectif) return { atteint: true };
  const depuis = ajouterMois(aujourdhui, -mois);
  let rythme = depotsNets([livret], depuis, aujourdhui) / mois;
  let source = "depots";
  if (!(rythme > 0) && lireNombre(livret?.virement?.montant) > 0) {
    rythme = lireNombre(livret.virement.montant);
    source = "virement";
  }
  if (!(rythme > 0)) return null;
  const moisRestants = Math.ceil((objectif - solde) / rythme);
  return { atteint: false, date: ajouterMois(aujourdhui, moisRestants), moisRestants, rythme, source };
}

/** Solde en fin de chaque mois sur `mois` mois, reconstitué depuis les mouvements datés. */
export function serieSoldeLivret(livret, { mois = 12, aujourdhui = todayIso() } = {}) {
  const points = [];
  for (let k = mois - 1; k >= 0; k--) {
    const m = ajouterMois(`${aujourdhui.slice(0, 7)}-01`, -k).slice(0, 7);
    const finMois = k === 0 ? aujourdhui : `${m}-${pad(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate())}`;
    points.push({ mois: m, solde: soldeAu(livret, finMois) });
  }
  return points;
}

/** La série a-t-elle bougé ? Une courbe plate n'apprend rien. */
export const serieVarie = (serie) => serie.some((p) => Math.abs(p.solde - serie[0].solde) > 0.5);

// ─── Intérêts de fin d'année ─────────────────────────────────────────────────

/**
 * Les intérêts de l'année écoulée, versés au 31 décembre, à enregistrer —
 * proposés de janvier à mars, avec l'estimation à la quinzaine et, s'ils sont
 * déjà enregistrés, l'écart avec ce que la banque a versé.
 */
export function interetsFinAnnee(livrets = [], { aujourdhui = todayIso() } = {}) {
  const mois = Number(aujourdhui.slice(5, 7));
  if (mois > 3) return [];
  const annee = Number(aujourdhui.slice(0, 4)) - 1;
  return (livrets || [])
    .filter((l) => (Number(l.rate) > 0 || serieTauxPour(l)) && (Number(l.balance) > 0 || (l.mouvements || []).length))
    .map((l) => {
      const estime = Math.round(interetsQuinzaines(l, annee).total * 100) / 100;
      const verses = (l.mouvements || []).filter(
        (m) => m.nature === "interets" && m.date >= `${annee}-12-01` && m.date <= `${annee + 1}-03-31`
      );
      const verse = verses.length ? verses.reduce((s, m) => s + (Number(m.montant) || 0), 0) : null;
      return { livret: l, annee, estime, verse, ecart: verse == null ? null : Math.round((verse - estime) * 100) / 100 };
    })
    .filter((x) => x.estime > 0.01 || x.verse != null);
}

// ─── Taux boostés ────────────────────────────────────────────────────────────

/**
 * Taux promotionnels qui se terminent dans `jours` jours ou sont déjà finis
 * sans que le taux ait été remis à jour.
 */
export function boostsAFinir(livrets = [], { aujourdhui = todayIso(), jours = 14 } = {}) {
  return (livrets || [])
    .filter((l) => l.boost?.fin)
    .map((l) => ({ livret: l, fin: l.boost.fin, tauxApres: Number(l.boost.tauxApres) || 0, jours: joursEntre(aujourdhui, l.boost.fin) }))
    .filter((b) => b.jours <= jours)
    .sort((a, b) => a.jours - b.jours);
}

// ─── Lectures de l'ensemble ──────────────────────────────────────────────────

/** Rendement réel : taux moyen moins inflation, et ce que cela représente par an. */
export function rendementReel({ tauxMoyenPct = 0, inflationPct = 0, total = 0 } = {}) {
  const reelPct = tauxMoyenPct - inflationPct;
  return { reelPct, euros: (total * reelPct) / 100 };
}

/** Ce qui manque pour un matelas de `cible` mois, comptés en mois « les plus chers ». */
export function manqueMatelas({ depensesMoisReference = null, disponible = 0, cible = 3 } = {}) {
  if (!(depensesMoisReference > 0)) return null;
  const objectif = depensesMoisReference * cible;
  return { objectif, manque: Math.max(0, objectif - disponible), mois: disponible / depensesMoisReference };
}

/** Enveloppes rattachées à un livret dont elles dépassent le solde. */
export function enveloppesEnDepassement(enveloppes = [], livrets = []) {
  const parLivret = new Map();
  for (const e of enveloppes || []) {
    if (!e?.livretId) continue;
    parLivret.set(e.livretId, (parLivret.get(e.livretId) || 0) + (Number(e.amount) || 0));
  }
  return [...parLivret.entries()]
    .map(([id, total]) => ({ livret: (livrets || []).find((l) => l.id === id), total }))
    .filter((x) => x.livret && x.total > (Number(x.livret.balance) || 0) + 0.5)
    .map((x) => ({ ...x, depassement: x.total - (Number(x.livret.balance) || 0) }));
}

// ─── Réglementés : ce qu'on a, ce qui manque, la prochaine révision ──────────

const REGLEMENTES = [
  { id: "livret-a", motif: /livret a\b/i, libelle: "Livret A" },
  { id: "ldds", motif: /\bldds?\b|développement durable/i, libelle: "LDDS" },
  { id: "lep", motif: /\blep\b|épargne populaire/i, libelle: "LEP" },
];

/** Livret A, LDDS et LEP : détenus ou non, avec taux, plafond et prochaine révision. */
export function livretsReglementes(livrets = []) {
  return REGLEMENTES.map((r) => {
    const fiche = valeurCatalogue(r.id);
    const detenu = (livrets || []).find((l) => r.motif.test(String(l.name || ""))) || null;
    return {
      ...r,
      detenu,
      tauxPct: fiche?.value ?? null,
      plafond: plafondLegal(r.libelle),
      prochaineRevision: fiche?.nextReview ?? null,
    };
  });
}

/**
 * Plafonds de revenu fiscal de référence pour ouvrir un LEP en 2026
 * (métropole) : 23 028 € pour une part, plus 6 149 € par demi-part
 * supplémentaire. Revalorisés chaque année : à mettre à jour avec la loi de
 * finances, comme les taux du catalogue.
 */
export const PLAFONDS_LEP = { annee: 2026, unePart: 23028, demiPart: 6149 };

export function eligibiliteLep({ rfr, parts = 1 } = {}, plafonds = PLAFONDS_LEP) {
  const revenu = lireNombre(rfr);
  const nbParts = Math.max(1, lireNombre(parts) ?? 1);
  if (revenu == null) return null;
  const plafond = plafonds.unePart + Math.round((nbParts - 1) * 2) * plafonds.demiPart;
  return { eligible: revenu <= plafond, plafond, marge: plafond - revenu };
}

/**
 * Impact d'une révision de taux sur les intérêts annuels d'un livret
 * réglementé, pour quelques taux possibles. L'application ne dispose pas des
 * séries (inflation, €STR) qu'utilise la formule officielle : elle chiffre
 * donc des scénarios plutôt que de prétendre prévoir le taux.
 */
export function scenariosRevision(livret, tauxActuelPct, ecarts = [-0.5, -0.2, 0.2]) {
  const solde = Number(livret?.balance) || 0;
  const actuel = (solde * tauxActuelPct) / 100;
  return ecarts
    .map((e) => Math.max(0.5, Math.round((tauxActuelPct + e) * 10) / 10))
    .filter((t, i, tous) => tous.indexOf(t) === i && t !== tauxActuelPct)
    .map((t) => ({ tauxPct: t, interets: (solde * t) / 100, ecart: (solde * t) / 100 - actuel }));
}

// ─── Âge fiscal ──────────────────────────────────────────────────────────────

const estAssuranceVie = (l) => l?.envelope === "AV" || /assurance[- ]vie/i.test(String(l?.name || ""));
const estPel = (l) => /\bpel\b|plan d'épargne logement/i.test(String(l?.name || ""));

/**
 * Jalons fiscaux d'une assurance-vie (8 ans) ou d'un PEL (2, 4, 10, 15 ans),
 * à partir de la date d'ouverture. Le prochain jalon est mis en avant.
 */
export function ageFiscal(livret, { aujourdhui = todayIso() } = {}) {
  const ouverture = livret?.ouverture;
  if (!ouverture) return null;
  const anniversaire = (ans) => ajouterMois(ouverture, ans * 12);
  let jalons = null;
  if (estAssuranceVie(livret)) {
    jalons = [{ ans: 8, date: anniversaire(8), texte: "abattement annuel sur les gains retirés (4 600 € seul, 9 200 € en couple)" }];
  } else if (estPel(livret)) {
    jalons = [
      { ans: 2, date: anniversaire(2), texte: "avant : une clôture fait recalculer les intérêts au taux du CEL" },
      { ans: 4, date: anniversaire(4), texte: "durée minimale du plan" },
      { ans: 10, date: anniversaire(10), texte: "plus aucun versement possible" },
      { ans: 15, date: anniversaire(15), texte: "le plan devient un compte sur livret ordinaire" },
    ];
  }
  if (!jalons) return null;
  const prochain = jalons.find((j) => j.date > aujourdhui) || null;
  const ans = Math.floor(joursEntre(ouverture, aujourdhui) / 365.25);
  return { type: estAssuranceVie(livret) ? "AV" : "PEL", ans, jalons, prochain };
}
