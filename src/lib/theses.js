import { todayIso, lireNombre } from "./finance";
import { notePiotroski } from "./piotroski";

/**
 * Thèses d'investissement — le journal de l'onglet Stratégie & Logs.
 *
 * Une note n'était qu'un bloc figé écrit à l'achat. Elle devient un FIL : la
 * thèse d'origine, puis chaque relecture datée (statut + une ligne), puis la
 * clôture. C'est ce fil qui fait le « Logs » du nom de l'onglet, et c'est lui
 * qui permet, des mois plus tard, de savoir si l'on a tenu sa ligne ou réagi
 * dans l'émotion.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

export const STATUTS_THESE = {
  intacte: { libelle: "Intacte", etat: "ok" },
  surveiller: { libelle: "À surveiller", etat: "attention" },
  invalidee: { libelle: "Invalidée", etat: "critique" },
};

export const DECISIONS = {
  bonne_decision: { libelle: "Bonne décision", etat: "ok" },
  a_ameliorer: { libelle: "À améliorer", etat: "attention" },
  erreur_emotion: { libelle: "Erreur d'émotion", etat: "critique" },
};

const JOUR_MS = 86400000;
const jourDe = (iso) => String(iso || "").slice(0, 10);
const joursEntre = (debut, fin) =>
  Math.round((new Date(`${jourDe(fin)}T00:00:00`) - new Date(`${jourDe(debut)}T00:00:00`)) / JOUR_MS);

const normaliser = (t) => String(t || "").trim().toUpperCase();

// ─── Revues ──────────────────────────────────────────────────────────────────

/** Date de la dernière relecture — la date d'écriture si la thèse n'a jamais été relue. */
export function derniereRevue(note) {
  const dates = [(note?.date || ""), ...(note?.revues || []).map((r) => r.date)].filter(Boolean);
  return dates.sort().pop() || null;
}

/** Une thèse active qui n'a pas été relue depuis `mois` mois. */
export function aRelire(note, aujourdhui = todayIso(), { mois = 6 } = {}) {
  if (!note || note.archivee) return false;
  const derniere = derniereRevue(note);
  return !!derniere && joursEntre(derniere, aujourdhui) > mois * 30.44;
}

/**
 * Ajoute une relecture datée et aligne le statut de la note sur elle.
 * Le statut courant reste le champ `statut` : tout le reste de l'application
 * (fiche de ligne, rappel avant vente) le lit déjà.
 */
export function ajouterRevue(note, { id, statut, commentaire = "", date = new Date().toISOString(), contexte = null }) {
  const revue = { id, date, statut: STATUTS_THESE[statut] ? statut : note.statut, commentaire: commentaire.trim() };
  if (contexte) revue.contexte = contexte;
  return { ...note, statut: revue.statut, revues: [...(note.revues || []), revue] };
}

/**
 * Le fil d'une thèse, du plus ancien au plus récent : écriture, relectures,
 * clôture. Une note antérieure aux relectures datées n'a que son écriture.
 */
export function filThese(note) {
  if (!note) return [];
  const fil = [];
  if (note.date) fil.push({ id: `${note.id}-ecrite`, type: "ecrite", date: note.date, statut: note.statutInitial || null });
  for (const r of note.revues || []) fil.push({ ...r, type: "revue" });
  if (note.postmortem?.date) {
    fil.push({ id: `${note.id}-cloture`, type: "cloture", date: note.postmortem.date, decision: note.postmortem.decision });
  }
  return fil.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Tous les événements de toutes les thèses, pour la frise de l'onglet. */
export function evenementsTheses(notes = []) {
  const liste = [];
  for (const n of notes || []) {
    const nom = n.ticker || n.titre || "Thèse";
    for (const e of filThese(n)) {
      liste.push({
        id: `these-${e.id}`,
        date: jourDe(e.date),
        type: e.type === "ecrite" ? "THESE" : e.type === "revue" ? "REVUE" : "CLOTURE",
        libelle:
          e.type === "ecrite" ? `Thèse écrite · ${nom}`
          : e.type === "revue" ? `Thèse relue · ${nom} — ${STATUTS_THESE[e.statut]?.libelle?.toLowerCase() || "statut inchangé"}`
          : `Thèse clôturée · ${nom}`,
        detail: e.type === "revue" ? e.commentaire || "" : e.type === "cloture" ? DECISIONS[e.decision]?.libelle || "" : n.titre || "",
      });
    }
  }
  return liste;
}

// ─── Lecture face au marché ──────────────────────────────────────────────────

/**
 * Où en est le cours sur le chemin qui va du prix de revient à l'objectif.
 * 0 % = au prix de revient, 100 % = objectif atteint ; au-dessous de zéro, la
 * ligne est en perte. Sans objectif au-dessus du PRU, il n'y a pas de chemin.
 */
export function progressionObjectif({ pru, cours, objectif }) {
  const p = lireNombre(pru);
  const c = lireNombre(cours);
  const o = lireNombre(objectif);
  if (!(p > 0) || !(c > 0) || !(o > p)) return null;
  return {
    pct: ((c - p) / (o - p)) * 100,
    atteint: c >= o,
    ecartObjectifPct: ((c - o) / o) * 100,
  };
}

/**
 * Variation sur environ un mois, à partir de la série de cours accumulée par
 * l'onglet Bourse (`bourseSeriesCours` : `[{ d, p }]`). Le point de départ est
 * le plus récent qui ait au moins `minJours` jours ; sans lui, la série est
 * trop courte pour parler d'un mois.
 */
export function variationRecente(serie = [], { aujourdhui = todayIso(), jours = 30, minJours = 20 } = {}) {
  const points = (serie || []).filter((x) => x?.d && x.p > 0).sort((a, b) => a.d.localeCompare(b.d));
  if (points.length < 2) return null;
  const dernier = points[points.length - 1];
  const candidats = points.filter((x) => joursEntre(x.d, aujourdhui) >= minJours);
  if (candidats.length === 0) return null;
  // Le plus proche de `jours` jours en arrière, parmi ceux assez anciens.
  const depart = candidats.reduce((meilleur, x) =>
    Math.abs(joursEntre(x.d, aujourdhui) - jours) < Math.abs(joursEntre(meilleur.d, aujourdhui) - jours) ? x : meilleur
  );
  return { pct: ((dernier.p - depart.p) / depart.p) * 100, depuis: depart.d, jours: joursEntre(depart.d, dernier.d) };
}

/**
 * Le mode anti-panique : les thèses à relire MAINTENANT, parce que leur ligne
 * vient de baisser fortement. C'est exactement le moment pour lequel la thèse
 * a été écrite — la relire avant de vendre, pas après.
 *
 * Deux déclencheurs : une baisse d'au moins `seuilMoisPct` sur un mois (si la
 * série de cours le permet), ou un cours passé `seuilPruPct` sous le prix de
 * revient. Une thèse relue depuis moins de `silenceJours` jours ne revient
 * pas : on vient de la confronter, la redemander chaque jour l'userait.
 */
export function alertesPanique({
  notes = [], positions = [], series = {}, aujourdhui = todayIso(),
  seuilMoisPct = -10, seuilPruPct = -15, silenceJours = 14,
} = {}) {
  const alertes = [];
  for (const note of notes || []) {
    if (note.archivee || !note.ticker) continue;
    const ticker = normaliser(note.ticker);
    const position = (positions || []).find((p) => normaliser(p.ticker) === ticker && Number(p.quantity) > 0);
    if (!position) continue;
    const derniere = derniereRevue(note);
    if (derniere && joursEntre(derniere, aujourdhui) < silenceJours) continue;

    const serie = series?.[position.ticker] || series?.[ticker] || [];
    const mois = variationRecente(serie, { aujourdhui });
    const pru = lireNombre(position.pru);
    const cours = lireNombre(position.current_price);
    const sousPru = pru > 0 && cours > 0 ? ((cours - pru) / pru) * 100 : null;

    if (mois && mois.pct <= seuilMoisPct) {
      alertes.push({ note, position, variationPct: mois.pct, base: "mois", depuis: mois.depuis });
    } else if (sousPru != null && sousPru <= seuilPruPct) {
      alertes.push({ note, position, variationPct: sousPru, base: "pru" });
    }
  }
  return alertes.sort((a, b) => a.variationPct - b.variationPct);
}

/**
 * Les thèses à relire parce que la société vient de PUBLIER.
 *
 * L'anti-panique réagit au cours ; ceci réagit aux faits. Une publication de
 * résultats est précisément ce que les conditions de vente décrivent (marge,
 * dividende, croissance) : c'est le moment de confronter la thèse aux chiffres,
 * que le cours ait bougé ou non.
 *
 * Retenues : les publications de résultats passées depuis moins de
 * `fenetreJours` jours, postérieures à la dernière relecture. Une date
 * seulement ESTIMÉE est écartée — demander de relire après une publication
 * qui n'a peut-être pas eu lieu ferait perdre confiance dans le rappel.
 *
 * @param {object[]} evenements  Événements du calendrier (`calendrierEvenements`).
 * @returns {{note, evenement}[]}
 */
export function resultatsARelire({ notes = [], evenements = [], aujourdhui = todayIso(), fenetreJours = 21 } = {}) {
  const sortie = [];
  for (const note of notes || []) {
    if (note.archivee || !note.ticker) continue;
    const ticker = normaliser(note.ticker);
    const derniere = jourDe(derniereRevue(note));
    const publications = (evenements || [])
      .filter(
        (e) =>
          e?.type === "Résultats" &&
          e.statut !== "estime" &&
          normaliser(e.ticker) === ticker &&
          e.date <= aujourdhui &&
          joursEntre(e.date, aujourdhui) <= fenetreJours &&
          (!derniere || e.date > derniere)
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    if (publications[0]) sortie.push({ note, evenement: publications[0] });
  }
  return sortie.sort((a, b) => b.evenement.date.localeCompare(a.evenement.date));
}

/** Part du portefeuille couverte par une thèse active. */
export function couverture(notes = [], positions = []) {
  const actives = new Set((notes || []).filter((n) => !n.archivee && n.ticker).map((n) => normaliser(n.ticker)));
  const lignes = (positions || []).filter((p) => Number(p.quantity) > 0 && p.ticker);
  const sansThese = lignes.filter((p) => !actives.has(normaliser(p.ticker))).map((p) => p.ticker);
  return { lignes: lignes.length, couvertes: lignes.length - sansThese.length, sansThese };
}

// ─── Photo à l'écriture ──────────────────────────────────────────────────────

/**
 * Ce que le marché disait du titre au moment où la thèse a été écrite. Sans
 * cette photo, « le titre est-il plus cher qu'à l'achat ? » n'a pas de
 * réponse : le PER du jour se lit partout, celui d'il y a huit mois nulle part.
 */
export function photoDepuisFiche(fiche, date = new Date().toISOString()) {
  if (!fiche) return null;
  const note = notePiotroski(fiche.historique || []);
  const photo = {
    date,
    cours: Number.isFinite(fiche.cours) ? fiche.cours : null,
    devise: fiche.devise || null,
    per: Number.isFinite(fiche.per) ? fiche.per : null,
    rendementPct: Number.isFinite(fiche.rendementPct) ? fiche.rendementPct : null,
    piotroski: note ? { score: note.actuelle.score, evalues: note.actuelle.evalues } : null,
  };
  return photo.cours == null && photo.per == null && photo.rendementPct == null && !photo.piotroski ? null : photo;
}

// ─── Clôture et bilan ────────────────────────────────────────────────────────

/** Dernière vente d'un titre dans le journal, et ce que le titre a fait depuis. */
export function depuisVente(operations = [], ticker, coursActuel) {
  const t = normaliser(ticker);
  const ventes = (operations || [])
    .filter((o) => o?.type === "VENTE" && normaliser(o.asset) === t && lireNombre(o.price) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const derniere = ventes[ventes.length - 1];
  if (!derniere) return null;
  const prix = lireNombre(derniere.price);
  const cours = lireNombre(coursActuel);
  const ecartPct = cours > 0 ? ((cours - prix) / prix) * 100 : null;
  // Un écart d'un facteur cinq trahit une division d'actions que le journal
  // ignore, pas un mouvement de marché : mieux vaut ne rien dire.
  if (ecartPct != null && (cours / prix > 5 || cours / prix < 0.2)) return { date: derniere.date, prix, ecartPct: null };
  return { date: derniere.date, prix, ecartPct };
}

/**
 * Bilan des décisions clôturées : ce que le journal apprend, une fois assez
 * de thèses refermées pour qu'une tendance se dessine.
 */
export function bilanDecisions(notes = []) {
  const closes = (notes || []).filter((n) => n.archivee && n.postmortem);
  const parDecision = {};
  for (const cle of Object.keys(DECISIONS)) parDecision[cle] = { nombre: 0, resultats: [] };
  const durees = [];
  for (const n of closes) {
    const d = parDecision[n.postmortem.decision] || parDecision.bonne_decision;
    d.nombre += 1;
    const r = lireNombre(n.postmortem.resultat_pct);
    if (r != null) d.resultats.push(r);
    if (n.date && n.postmortem.date) durees.push(joursEntre(n.date, n.postmortem.date));
  }
  const moyenne = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
  const resultats = closes
    .map((n) => ({ note: n, resultat: lireNombre(n.postmortem.resultat_pct) }))
    .filter((x) => x.resultat != null)
    .sort((a, b) => b.resultat - a.resultat);
  return {
    total: closes.length,
    parDecision: Object.fromEntries(
      Object.entries(parDecision).map(([k, v]) => [k, { nombre: v.nombre, resultatMoyen: moyenne(v.resultats) }])
    ),
    tauxBonnes: closes.length ? (parDecision.bonne_decision.nombre / closes.length) * 100 : null,
    resultatMoyen: moyenne(resultats.map((x) => x.resultat)),
    dureeMoyenneJours: moyenne(durees),
    meilleure: resultats[0] || null,
    pire: resultats.length > 1 ? resultats[resultats.length - 1] : null,
  };
}
