/**
 * Où en est le mouvement, tous réglages confondus ?
 *
 * Deux réglages décident, et ils sont posés sur `<html>` par ApparenceContext :
 *
 *  · `data-mouvement` — « reduit » ou « complet ». Il suit le système par
 *    défaut, mais l'utilisateur peut le forcer dans un sens comme dans l'autre.
 *    Tant qu'il n'est pas posé (tout premier rendu, tests), c'est la media
 *    query du système qui tranche.
 *  · `data-effets` — « vivant » ou « sobre ». L'intensité, une fois le
 *    mouvement permis : « sobre » garde ce qui informe (une courbe qui se
 *    trace, un compteur qui défile) et retire ce qui n'est qu'ambiance (fond
 *    qui dérive, reflets, relief, célébrations).
 *
 * Les modules d'animation qui vivent HORS de React (révélations, tracés, fond)
 * ne peuvent pas lire un contexte : ils interrogent ces attributs au moment
 * d'agir, ce qui suit aussi un changement de réglage sans rien réinstaller.
 */

function racine() {
  return typeof document !== "undefined" ? document.documentElement : null;
}

/** Le système demande-t-il la suppression des animations ? */
export function systemeSansMouvement() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Le mouvement est-il réduit, réglage de l'application compris ? */
export function mouvementReduit() {
  const r = racine();
  const pose = r?.getAttribute("data-mouvement");
  if (pose) return pose === "reduit";
  return systemeSansMouvement();
}

/**
 * Niveau d'effets effectif : « aucun » quand le mouvement est réduit, sinon
 * « sobre » ou « vivant ». « vivant » est la valeur par défaut.
 */
export function niveauEffets() {
  if (mouvementReduit()) return "aucun";
  return racine()?.getAttribute("data-effets") === "sobre" ? "sobre" : "vivant";
}

/** Les effets d'ambiance (fond, reflets, relief, célébrations) sont-ils permis ? */
export function effetsVivants() {
  return niveauEffets() === "vivant";
}

/**
 * Économie de données ou appareil modeste : on renonce à ce qui tourne en
 * continu. Rien d'autre ne dépend de cette réponse.
 */
export function appareilEconome() {
  if (typeof navigator === "undefined") return false;
  const c = navigator.connection;
  if (c?.saveData) return true;
  return typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2;
}

/** Le pointeur est-il une souris (survol réel), et non un doigt ? */
export function pointeurFin() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}
