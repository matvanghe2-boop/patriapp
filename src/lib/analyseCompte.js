/**
 * Analyses du compte courant, au-delà du bilan du mois.
 *
 * Comme `compteCourant.js`, dont il lit les opérations ENRICHIES (`enrichir`),
 * ce module raisonne en centimes entiers. Ses règles communes :
 *  · les mouvements entre ses propres comptes ne sont ni des dépenses ni des
 *    revenus ;
 *  · une opération mise à part du budget (`horsBudget`) n'entre dans aucune
 *    moyenne : elle est ponctuelle par définition ;
 *  · une dépense se lit en NET — un remboursement par carte vient en
 *    déduction de sa catégorie.
 */
import { moisDe, parMois, categorie } from "./compteCourant";

const mediane = (valeurs) => {
  const t = [...valeurs].sort((a, b) => a - b);
  if (t.length === 0) return null;
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};

const moyenne = (valeurs) => (valeurs.length ? valeurs.reduce((s, v) => s + v, 0) / valeurs.length : null);

/** Nombre de jours d'un mois « 2026-09 ». */
export function joursDuMois(mois) {
  const [a, m] = mois.split("-").map(Number);
  return new Date(a, m, 0).getDate();
}

/** « 2026-09-30 » + n jours, sans passer par l'UTC. */
function decalerJour(iso, n) {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(a, m - 1, j + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Même jour le mois suivant, ramené au dernier jour quand il n'existe pas (31 → 30). */
function moisSuivant(iso, jour) {
  const [a, m] = iso.split("-").map(Number);
  const suivant = new Date(a, m, 1);
  const cle = `${suivant.getFullYear()}-${String(suivant.getMonth() + 1).padStart(2, "0")}`;
  return `${cle}-${String(Math.min(jour, joursDuMois(cle))).padStart(2, "0")}`;
}

/**
 * Filtre « appartient à la période » : un mois (« 2026-09 ») ou une liste de
 * mois (une année, douze mois glissants). Toutes les analyses qui portaient
 * sur un mois acceptent ainsi une période plus longue, sans être réécrites.
 */
function dansPeriode(periode) {
  const mois = new Set(Array.isArray(periode) ? periode : [periode]);
  return (iso) => mois.has(moisDe(iso));
}

/** Mois calendaires d'une période, du plus ancien au plus récent. */
export function moisDePeriode(vue, { mois, annee, moisConnus = [] } = {}) {
  if (vue === "annee") return moisConnus.filter((m) => m.startsWith(`${annee}-`));
  if (vue === "glissant") {
    const fin = moisConnus[moisConnus.length - 1];
    if (!fin) return [];
    const [a, m] = fin.split("-").map(Number);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(a, m - 12 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }
  return mois ? [mois] : [];
}

/** Même période, un an plus tôt. */
export function periodeUnAnAvant(periode) {
  return periode.map((m) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`);
}

/**
 * Catégories d'une période longue (année, douze mois) : total, moyenne par
 * mois couvert, et la même période un an plus tôt quand elle est connue.
 */
export function categoriesPeriode(enrichies, periode) {
  const dedans = dansPeriode(periode);
  const avant = dansPeriode(periodeUnAnAvant(periode));
  const connus = new Set((enrichies || []).map((o) => moisDe(o.date)));
  const nbMois = periode.filter((m) => connus.has(m)).length || 1;
  const anPasseConnu = periodeUnAnAvant(periode).some((m) => connus.has(m));
  const totaux = new Map();
  const precedents = new Map();
  for (const o of enrichies || []) {
    if (!estDepenseBudget(o)) continue;
    if (dedans(o.date)) totaux.set(o.categorie, (totaux.get(o.categorie) || 0) - o.montant);
    else if (avant(o.date)) precedents.set(o.categorie, (precedents.get(o.categorie) || 0) - o.montant);
  }
  const total = [...totaux.values()].reduce((a, v) => a + Math.max(0, v), 0);
  return [...totaux.entries()]
    .filter(([, v]) => v > 0)
    .map(([id, montant]) => ({
      id,
      libelle: categorie(id).libelle,
      montant,
      moyenneMensuelle: Math.round(montant / nbMois),
      part: total > 0 ? montant / total : 0,
      anPasse: anPasseConnu ? Math.max(0, precedents.get(id) || 0) : null,
    }))
    .sort((a, b) => b.montant - a.montant);
}

/** Dépense nette d'une opération : positive quand l'argent sort. */
const estDepenseBudget = (op) => op.famille === "depense" && !op.horsBudget;

// ─── Budget moyen (Dashboard) ────────────────────────────────────────────────

/**
 * Revenus et dépenses mensuels moyens sur les derniers mois connus.
 *
 * C'est ce qui remplace, sur le Dashboard, le profil saisi à la main : le
 * taux d'épargne et le matelas de sécurité reposaient sur deux nombres dont
 * rien ne garantissait qu'ils étaient encore vrais. Trois mois plutôt qu'un :
 * un mois isolé est trop heurté pour servir de référence.
 */
export function budgetMoyen(enrichies, { nbMois = 3 } = {}) {
  const flux = parMois(enrichies);
  if (flux.length === 0) return null;
  const retenus = flux.slice(-nbMois);
  return {
    revenus: moyenne(retenus.map((l) => l.entrees)),
    depenses: moyenne(retenus.map((l) => l.sorties)),
    mois: retenus.map((l) => l.mois),
  };
}

// ─── Argent qui dort ─────────────────────────────────────────────────────────

/**
 * Ce que rapporterait, sur un livret, l'argent qui dépasse les besoins
 * courants du compte.
 *
 * Tout le solde n'est pas « en trop » : il faut de quoi payer le mois. La
 * réserve retenue est un mois de dépenses moyennes ; seul ce qui la dépasse
 * est compté, dans la limite du plafond du livret.
 *
 * Le manque à gagner passé est calculé jour par jour sur le solde du soir,
 * au taux actuel : c'est un ordre de grandeur, pas un calcul d'intérêts par
 * quinzaine.
 */
export function argentQuiDort({ serie = [], solde, reserve = 0, tauxPct, plafond = Infinity }) {
  if (solde == null || !Number.isFinite(tauxPct)) return null;
  const taux = tauxPct / 100;
  const excedent = Math.min(Math.max(0, solde - reserve), plafond);

  let manqueAGagner = 0;
  let jours = 0;
  if (serie.length > 0) {
    let i = 0;
    let courant = serie[0].solde;
    const fin = serie[serie.length - 1].date;
    for (let jour = serie[0].date; jour <= fin; jour = decalerJour(jour, 1)) {
      while (i < serie.length && serie[i].date <= jour) courant = serie[i++].solde;
      manqueAGagner += (Math.min(Math.max(0, courant - reserve), plafond) * taux) / 365;
      jours += 1;
    }
  }

  return {
    reserve,
    excedent,
    gainAnnuel: excedent * taux,
    gainMensuel: (excedent * taux) / 12,
    manqueAGagner: Math.round(manqueAGagner),
    jours,
    depuis: serie[0]?.date || null,
  };
}

// ─── Opérations récurrentes ──────────────────────────────────────────────────

/**
 * Charges fixes et revenus réguliers.
 *
 * Une opération est RÉCURRENTE quand le même marchand ou la même personne
 * revient, pour un montant comparable (à 15 % près), plusieurs mois
 * différents (deux pour un prélèvement, trois sinon, au même moment du mois),
 * au plus une fois et demie par mois en moyenne, et encore récemment (l'un des
 * deux derniers mois connus). Les courses chez le même supermarché reviennent
 * aussi, mais plusieurs fois par mois : ce ne sont pas des charges fixes.
 *
 * Les montants d'une même personne sont séparés en groupes : l'aide mensuelle
 * d'un parent (120 €) n'est pas noyée dans ses autres virements ponctuels.
 */
export function recurrences(enrichies) {
  const moisConnus = [...new Set((enrichies || []).map((o) => moisDe(o.date)))].sort();
  if (moisConnus.length < 2) return { charges: [], revenus: [] };
  const recents = new Set(moisConnus.slice(-2));
  const indexMois = new Map(moisConnus.map((m, i) => [m, i]));
  const finDonnees = (enrichies || []).reduce((max, o) => (o.date > max ? o.date : max), "");

  const groupes = new Map();
  for (const op of enrichies || []) {
    if (op.famille === "interne" || op.horsBudget) continue;
    const cle = `${op.montant < 0 ? "D" : "C"}|${op.analyse.cle}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(op);
  }

  const trouvees = [];
  for (const [cleGroupe, ops] of groupes) {
    // Un marchand payé plusieurs fois par mois n'est pas une charge fixe, même
    // si ses montants se répètent : deux passages mensuels au supermarché
    // formeraient sinon deux « charges » à 25 et 41 €. Côté revenus, la règle
    // ne s'applique pas — l'aide mensuelle d'un parent reste reconnue même
    // s'il fait d'autres virements à côté.
    if (cleGroupe.startsWith("D|")) {
      const moisGroupe = [...new Set(ops.map((o) => moisDe(o.date)))].sort();
      const etendueGroupe = indexMois.get(moisGroupe[moisGroupe.length - 1]) - indexMois.get(moisGroupe[0]) + 1;
      if (ops.length / etendueGroupe > 1.5) continue;
    }
    // Regroupement par montants voisins.
    const tries = [...ops].sort((a, b) => Math.abs(a.montant) - Math.abs(b.montant));
    const paquets = [];
    for (const op of tries) {
      const dernier = paquets[paquets.length - 1];
      const reference = dernier ? mediane(dernier.map((o) => Math.abs(o.montant))) : null;
      if (dernier && Math.abs(op.montant) <= reference * 1.15) dernier.push(op);
      else paquets.push([op]);
    }

    for (const paquet of paquets) {
      const mois = [...new Set(paquet.map((o) => moisDe(o.date)))].sort();
      const parDate = [...paquet].sort((a, b) => a.date.localeCompare(b.date));
      const derniere = parDate[parDate.length - 1];
      // Un prélèvement repose sur un mandat : deux mois suffisent. Un paiement
      // par carte ou un virement peuvent se ressembler deux mois de suite par
      // pur hasard (un fast-food le 7 août et le 7 septembre) : il en faut
      // trois, à un jour du mois stable (à une semaine près).
      const mandat = derniere.analyse.type === "prelevement";
      if (mois.length < (mandat ? 2 : 3)) continue;
      const joursOps = paquet.map((o) => Number(o.date.slice(8, 10)));
      const jour = Math.round(mediane(joursOps));
      // Un écart isolé est toléré (un virement fait plus tôt un mois), pas un
      // calendrier dispersé : les trois quarts au moins à cinq jours près.
      const groupes = joursOps.filter((j) => Math.abs(j - jour) <= 5).length;
      if (!mandat && groupes / joursOps.length < 0.75) continue;
      if (!mois.some((m) => recents.has(m))) continue;
      const etendue = indexMois.get(mois[mois.length - 1]) - indexMois.get(mois[0]) + 1;
      if (paquet.length / etendue > 1.5) continue;

      // La prochaine échéance tombe APRÈS le dernier relevé : une date déjà
      // couverte par les relevés n'est pas « à venir ».
      let prochaine = moisSuivant(derniere.date, jour);
      while (prochaine <= finDonnees) prochaine = moisSuivant(prochaine, jour);
      trouvees.push({
        cle: derniere.analyse.cle,
        titre: derniere.analyse.titre,
        categorie: derniere.categorie,
        type: derniere.analyse.type,
        sens: derniere.montant < 0 ? "debit" : "credit",
        montant: Math.round(mediane(paquet.map((o) => Math.abs(o.montant)))),
        jour,
        nombreMois: mois.length,
        derniere: derniere.date,
        prochaine,
        ids: paquet.map((o) => o.id),
      });
    }
  }

  const parMontant = (a, b) => b.montant - a.montant;
  return {
    charges: trouvees.filter((r) => r.sens === "debit").sort(parMontant),
    revenus: trouvees.filter((r) => r.sens === "credit").sort(parMontant),
  };
}

// ─── Rythme et calendrier ────────────────────────────────────────────────────

/** Dépenses nettes d'un mois, jour par jour du mois (index 1 à 31). */
function depensesJournalieres(enrichies, mois) {
  const jours = new Array(joursDuMois(mois) + 1).fill(0);
  for (const op of enrichies || []) {
    if (moisDe(op.date) !== mois || !estDepenseBudget(op)) continue;
    jours[Number(op.date.slice(8, 10))] -= op.montant;
  }
  return jours;
}

/**
 * Dépenses cumulées du mois, jour par jour, face à la moyenne des autres
 * mois au même jour. La moyenne est prise jour pour jour : « au 15 » se
 * compare à ce qui était dépensé le 15 des autres mois, pas à un prorata.
 */
export function rythmeMois(enrichies, mois) {
  const autres = [...new Set((enrichies || []).map((o) => moisDe(o.date)))].filter((m) => m !== mois);
  const cumul = (jours) => jours.reduce((acc, v, i) => (i === 0 ? [0] : [...acc, acc[i - 1] + v]), []);
  const courant = cumul(depensesJournalieres(enrichies, mois));
  const references = autres.map((m) => cumul(depensesJournalieres(enrichies, m)));
  const n = joursDuMois(mois);
  const points = [];
  for (let j = 1; j <= n; j += 1) {
    const valeurs = references.map((r) => r[Math.min(j, r.length - 1)]);
    points.push({ jour: j, mois: courant[j], moyenne: valeurs.length ? Math.round(moyenne(valeurs)) : null });
  }
  return points;
}

/** Dépenses du mois par jour, pour le calendrier : `{ date, montant }`. */
export function calendrierMois(enrichies, mois) {
  const jours = depensesJournalieres(enrichies, mois);
  return jours.slice(1).map((montant, i) => ({
    date: `${mois}-${String(i + 1).padStart(2, "0")}`,
    montant: Math.max(0, montant),
  }));
}

const NOMS_JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/**
 * Dépense moyenne par jour de la semaine, sur toute la période couverte.
 *
 * La moyenne divise par le nombre de lundis (de mardis…) de la période, et
 * non par le nombre de lundis où l'on a dépensé : un jour sans dépense compte,
 * sinon le jour le plus économe paraîtrait aussi cher que les autres.
 */
export function depensesParJourSemaine(enrichies) {
  const dates = (enrichies || []).map((o) => o.date).sort();
  if (dates.length === 0) return [];
  const debut = `${dates[0].slice(0, 7)}-01`;
  const dernierMois = dates[dates.length - 1].slice(0, 7);
  const fin = `${dernierMois}-${String(joursDuMois(dernierMois)).padStart(2, "0")}`;
  const totaux = new Array(7).fill(0);
  const nombres = new Array(7).fill(0);
  const indice = (iso) => {
    const [a, m, j] = iso.split("-").map(Number);
    return (new Date(a, m - 1, j).getDay() + 6) % 7;
  };
  for (let jour = debut; jour <= fin; jour = decalerJour(jour, 1)) nombres[indice(jour)] += 1;
  for (const op of enrichies) if (estDepenseBudget(op)) totaux[indice(op.date)] -= op.montant;
  return NOMS_JOURS.map((nom, i) => ({
    jour: nom,
    court: nom.slice(0, 3),
    total: totaux[i],
    moyenne: nombres[i] ? Math.round(totaux[i] / nombres[i]) : 0,
  }));
}

// ─── Catégories ──────────────────────────────────────────────────────────────

/** Dépenses nettes par catégorie et par mois : `Map(mois → Map(catégorie → centimes))`. */
function depensesParMoisEtCategorie(enrichies) {
  const parMoisCat = new Map();
  for (const op of enrichies || []) {
    if (!estDepenseBudget(op)) continue;
    const m = moisDe(op.date);
    if (!parMoisCat.has(m)) parMoisCat.set(m, new Map());
    const cats = parMoisCat.get(m);
    cats.set(op.categorie, (cats.get(op.categorie) || 0) - op.montant);
  }
  return parMoisCat;
}

/**
 * Chaque catégorie du mois face au mois précédent et à la moyenne des trois
 * mois qui le précèdent. Un mois connu sans dépense dans une catégorie y
 * compte pour zéro — sinon la moyenne serait gonflée par les seuls mois où
 * l'on a dépensé.
 */
export function comparaisonCategories(enrichies, mois) {
  const connus = [...new Set((enrichies || []).map((o) => moisDe(o.date)))].sort();
  const avant = connus.filter((m) => m < mois).slice(-3);
  const precedent = avant[avant.length - 1] || null;
  const tableau = depensesParMoisEtCategorie(enrichies);
  const ids = new Set([mois, ...avant].flatMap((m) => [...(tableau.get(m)?.keys() || [])]));
  const lire = (m, id) => Math.max(0, tableau.get(m)?.get(id) || 0);

  return [...ids]
    .map((id) => {
      const montant = lire(mois, id);
      const moyenne3 = avant.length ? Math.round(avant.reduce((s, m) => s + lire(m, id), 0) / avant.length) : null;
      return {
        id,
        libelle: categorie(id).libelle,
        montant,
        precedent: precedent ? lire(precedent, id) : null,
        moyenne3,
        ecart: moyenne3 == null ? null : montant - moyenne3,
      };
    })
    .filter((l) => l.montant > 0 || (l.moyenne3 || 0) > 0)
    .sort((a, b) => Math.abs(b.ecart ?? b.montant) - Math.abs(a.ecart ?? a.montant));
}

/** Détail d'une catégorie : le mois choisi, mois par mois, et ses marchands. */
export function zoomCategorie(enrichies, id, mois) {
  const ops = (enrichies || []).filter((o) => o.categorie === id && estDepenseBudget(o));
  const dedans = dansPeriode(mois);
  const duMois = ops.filter((o) => dedans(o.date));
  const achats = duMois.filter((o) => o.montant < 0);
  const total = duMois.reduce((s, o) => s - o.montant, 0);

  const parMoisMap = new Map();
  for (const o of ops) {
    const m = moisDe(o.date);
    const l = parMoisMap.get(m) || { mois: m, total: 0, nombre: 0 };
    l.total -= o.montant;
    if (o.montant < 0) l.nombre += 1;
    parMoisMap.set(m, l);
  }
  const marchands = new Map();
  for (const o of achats) {
    const t = marchands.get(o.analyse.titre) || { titre: o.analyse.titre, total: 0, nombre: 0 };
    t.total -= o.montant;
    t.nombre += 1;
    marchands.set(o.analyse.titre, t);
  }

  return {
    id,
    libelle: categorie(id).libelle,
    nombre: achats.length,
    total,
    panierMoyen: achats.length ? Math.round(total / achats.length) : null,
    parMois: [...parMoisMap.values()].sort((a, b) => a.mois.localeCompare(b.mois)),
    marchands: [...marchands.values()].sort((a, b) => b.total - a.total).slice(0, 5),
  };
}

/**
 * Les petites dépenses — moins de 10 € — qu'on ne voit pas passer une à une
 * et dont on ne connaît jamais le total.
 */
export function petitesDepenses(enrichies, mois, seuil = 1000) {
  const petites = (enrichies || []).filter((o) => estDepenseBudget(o) && o.montant < 0 && -o.montant < seuil);
  const dedans = dansPeriode(mois);
  const duMois = petites.filter((o) => dedans(o.date));
  const nbMois = new Set((enrichies || []).map((o) => moisDe(o.date))).size || 1;
  const toutesDuMois = (enrichies || []).filter((o) => dedans(o.date) && estDepenseBudget(o));
  const depensesMois = toutesDuMois.reduce((s, o) => s - o.montant, 0);
  const total = duMois.reduce((s, o) => s - o.montant, 0);
  return {
    seuil,
    nombre: duMois.length,
    total,
    part: depensesMois > 0 ? total / depensesMois : null,
    moyenneMensuelle: Math.round(petites.reduce((s, o) => s - o.montant, 0) / nbMois),
  };
}

/**
 * Jeux d'argent, mois par mois : ce qui est parti vers les sites de paris et
 * ce qui en est revenu. Rien d'autre — ni seuil, ni jugement.
 */
export function jeuxParMois(enrichies) {
  const mois = new Map();
  for (const o of enrichies || []) {
    if (o.categorie !== "jeux") continue;
    const m = moisDe(o.date);
    const l = mois.get(m) || { mois: m, mises: 0, gains: 0 };
    if (o.montant < 0) l.mises -= o.montant;
    else l.gains += o.montant;
    mois.set(m, l);
  }
  return [...mois.values()].sort((a, b) => a.mois.localeCompare(b.mois)).map((l) => ({ ...l, net: l.mises - l.gains }));
}

// ─── Flux ────────────────────────────────────────────────────────────────────

/**
 * Ce qui est réellement mis de côté, mois par mois : l'argent parti vers ses
 * autres comptes, moins celui qui en est revenu. C'est l'épargne effective,
 * distincte du « reste du mois », qui peut rester sur le compte courant.
 */
export function misDeCoteParMois(enrichies) {
  const mois = new Map();
  for (const o of enrichies || []) {
    if (o.famille !== "interne") continue;
    const m = moisDe(o.date);
    const l = mois.get(m) || { mois: m, sortant: 0, entrant: 0 };
    if (o.montant < 0) l.sortant -= o.montant;
    else l.entrant += o.montant;
    mois.set(m, l);
  }
  return [...mois.values()].sort((a, b) => a.mois.localeCompare(b.mois)).map((l) => ({ ...l, net: l.sortant - l.entrant }));
}

/**
 * D'où vient l'argent du mois, et où il va, pour le diagramme de flux.
 *
 * Les deux côtés s'équilibrent toujours : quand il sort plus qu'il n'entre,
 * la différence est « prise sur le solde » ; quand il entre plus qu'il ne
 * sort, elle « reste sur le compte ». Au-delà de `maxDestinations`, les plus
 * petites catégories de dépense sont regroupées.
 */
export function fluxDuMois(enrichies, mois, { maxDestinations = 6 } = {}) {
  const sources = new Map();
  const destinations = new Map();
  const ajouter = (map, cle, libelle, montant) => {
    const l = map.get(cle) || { id: cle, libelle, montant: 0 };
    l.montant += montant;
    map.set(cle, l);
  };

  const dedans = dansPeriode(mois);
  for (const o of enrichies || []) {
    if (!dedans(o.date)) continue;
    if (o.famille === "interne") {
      if (o.montant > 0) ajouter(sources, "interne", "Depuis mes comptes", o.montant);
      else ajouter(destinations, "interne", "Vers mes comptes", -o.montant);
    } else if (o.horsBudget) {
      if (o.montant > 0) ajouter(sources, "ponctuel", "Ponctuel", o.montant);
      else ajouter(destinations, "ponctuel", "Ponctuel", -o.montant);
    } else if (o.famille === "depense") {
      // Net : un remboursement par carte réduit sa catégorie.
      ajouter(destinations, o.categorie, categorie(o.categorie).libelle, -o.montant);
    } else {
      ajouter(sources, o.categorie, categorie(o.categorie).libelle, o.montant);
    }
  }

  let dest = [...destinations.values()].filter((d) => d.montant > 0).sort((a, b) => b.montant - a.montant);
  if (dest.length > maxDestinations) {
    const gardees = dest.slice(0, maxDestinations - 1);
    const reste = dest.slice(maxDestinations - 1).reduce((s, d) => s + d.montant, 0);
    dest = [...gardees, { id: "autres", libelle: "Autres dépenses", montant: reste }];
  }
  const src = [...sources.values()].filter((s) => s.montant > 0).sort((a, b) => b.montant - a.montant);

  const totalSources = src.reduce((s, x) => s + x.montant, 0);
  const totalDest = dest.reduce((s, x) => s + x.montant, 0);
  if (totalDest > totalSources) src.push({ id: "solde", libelle: "Pris sur le solde", montant: totalDest - totalSources });
  else if (totalSources > totalDest) dest.push({ id: "reste", libelle: "Reste sur le compte", montant: totalSources - totalDest });

  return { sources: src, destinations: dest, total: Math.max(totalSources, totalDest) };
}

// ─── Coût des habitudes ──────────────────────────────────────────────────────

/**
 * Ce que coûte une catégorie de dépense à l'année, et ce que la même somme
 * deviendrait si elle était placée chaque mois.
 *
 * La moyenne mensuelle porte sur TOUS les mois connus, y compris ceux sans
 * dépense dans la catégorie : une habitude se mesure à son rythme réel, pas
 * aux seuls mois où elle s'est manifestée. Le placement est un versement
 * mensuel capitalisé au taux donné — une hypothèse, que l'écran présente
 * comme telle.
 */
export function coutHabitude(enrichies, id, { taux = [], annees = [5, 10] } = {}) {
  const mois = new Set((enrichies || []).map((o) => moisDe(o.date)));
  if (mois.size === 0) return null;
  const total = (enrichies || [])
    .filter((o) => o.categorie === id && estDepenseBudget(o))
    .reduce((s, o) => s - o.montant, 0);
  const mensuel = Math.max(0, total) / mois.size;
  const placer = (tauxPct, n) => {
    const r = tauxPct / 100 / 12;
    const periodes = 12 * n;
    return r > 0 ? mensuel * ((Math.pow(1 + r, periodes) - 1) / r) : mensuel * periodes;
  };
  return {
    id,
    libelle: categorie(id).libelle,
    mensuel: Math.round(mensuel),
    annuel: Math.round(mensuel * 12),
    projections: annees.map((n) => ({
      annees: n,
      verse: Math.round(mensuel * 12 * n),
      placements: taux.map(({ libelle, tauxPct }) => ({ libelle, tauxPct, valeur: Math.round(placer(tauxPct, n)) })),
    })),
  };
}
