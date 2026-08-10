import { todayIso } from "./finance";

/**
 * Alertes de seuil sur la watchlist.
 *
 * La watchlist portait déjà un prix cible par ligne, et l'application savait
 * déjà envoyer des notifications système — mais rien ne reliait les deux : le
 * dépassement d'un seuil n'était visible qu'en ouvrant l'onglet, c'est-à-dire
 * au moment où l'on n'a plus besoin d'être prévenu.
 *
 * Ces fonctions sont pures : elles comparent un cours à un seuil et décident
 * s'il faut notifier. L'envoi lui-même reste au composant Notifications, qui
 * possède déjà la permission et la déduplication par session.
 */

/** Sens du franchissement surveillé. */
export const SENS = {
  SOUS: "sous",
  AU_DESSUS: "au_dessus",
};

export function libelleSens(sens) {
  return sens === SENS.AU_DESSUS ? "monte au-dessus de" : "descend sous";
}

/**
 * Une alerte est déclenchée si le cours a franchi le seuil dans le sens
 * surveillé, et qu'elle n'a pas déjà été acquittée pour ce même franchissement.
 */
export function alerteDeclenchee(alerte, cours) {
  if (!alerte || alerte.active === false) return false;
  if (!Number.isFinite(cours) || !Number.isFinite(alerte.seuil)) return false;
  const franchi = alerte.sens === SENS.AU_DESSUS ? cours >= alerte.seuil : cours <= alerte.seuil;
  if (!franchi) return false;
  // Réarmement : une alerte acquittée ne se redéclenche que si le cours est
  // repassé de l'autre côté du seuil entre-temps (voir `rearmer`). Sans cela,
  // un cours qui stagne sous le seuil notifierait à chaque ouverture de l'app.
  return !alerte.acquittee;
}

/**
 * Réarme les alertes dont le cours est repassé du bon côté du seuil.
 * À appeler à chaque rafraîchissement de cours, avant l'évaluation.
 */
export function rearmer(alertes = [], coursParTicker = {}) {
  return alertes.map((a) => {
    if (!a.acquittee) return a;
    const cours = coursParTicker[a.ticker];
    if (!Number.isFinite(cours)) return a;
    const revenu = a.sens === SENS.AU_DESSUS ? cours < a.seuil : cours > a.seuil;
    return revenu ? { ...a, acquittee: false, acquitteeLe: null } : a;
  });
}

/** Alertes actuellement déclenchées, enrichies du cours constaté. */
export function alertesDeclenchees(alertes = [], coursParTicker = {}) {
  return alertes
    .filter((a) => alerteDeclenchee(a, coursParTicker[a.ticker]))
    .map((a) => ({ ...a, cours: coursParTicker[a.ticker] }));
}

export function creerAlerte({ id, ticker, nom, seuil, sens = SENS.SOUS }) {
  return {
    id,
    ticker,
    nom: nom || ticker,
    seuil: Math.max(0, Number(seuil) || 0),
    sens,
    active: true,
    acquittee: false,
    acquitteeLe: null,
    creeeLe: todayIso(),
  };
}

export function acquitter(alertes = [], id) {
  return alertes.map((a) => (a.id === id ? { ...a, acquittee: true, acquitteeLe: todayIso() } : a));
}

/**
 * Traduit une alerte déclenchée en rappel affichable par le panneau de
 * notifications, qui ne connaît qu'une forme : { id, label }.
 */
export function versRappel(alerte) {
  const sens = libelleSens(alerte.sens);
  const cours = Number.isFinite(alerte.cours) ? ` (cours : ${alerte.cours.toFixed(2)})` : "";
  return {
    id: `alerte-${alerte.id}`,
    label: `${alerte.nom} ${sens} ${alerte.seuil}${cours}`,
    type: "alerte",
    source: "watchlist",
    alerteId: alerte.id,
  };
}
