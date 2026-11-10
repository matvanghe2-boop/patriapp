import { flushSync } from "react-dom";
import { mouvementReduit } from "./mouvement";

/**
 * Passage d'une ligne à sa fiche : le logo et le nom s'envolent de la ligne
 * cliquée vers l'en-tête de la fiche, et y retournent à la fermeture.
 *
 * Passe par l'API View Transitions : le navigateur photographie l'avant et
 * l'après, et anime d'une photo à l'autre les éléments qui portent le même
 * `view-transition-name`. Deux éléments ne peuvent pas porter le même nom au
 * même instant : les noms sont donc posés sur la LIGNE seulement le temps de
 * la photo, alors que l'en-tête de la fiche les porte en permanence (une seule
 * fiche est ouverte à la fois).
 *
 * Sans l'API, ou en mouvement réduit, la mise à jour se fait simplement.
 */
const NOMS = { logo: "ligne-logo", nom: "ligne-nom" };

function nommer(source, actif) {
  if (!source) return;
  for (const [role, nom] of Object.entries(NOMS)) {
    const el = source.querySelector(`[data-morph="${role}"]`);
    if (el) el.style.viewTransitionName = actif ? nom : "";
  }
}

function possible() {
  return typeof document !== "undefined" && typeof document.startViewTransition === "function" && !mouvementReduit();
}

/** Ouvre la fiche depuis `source` (l'élément de la ligne cliquée). */
export function ouvrirDepuis(source, maj) {
  if (!possible() || !source) {
    maj();
    return;
  }
  nommer(source, true);
  document.documentElement.classList.add("morph-fiche");
  const t = document.startViewTransition(() => {
    nommer(source, false);
    flushSync(maj);
  });
  t.finished.finally(() => document.documentElement.classList.remove("morph-fiche"));
}

/** Ferme la fiche en renvoyant logo et nom vers `trouverSource()` (la ligne d'origine). */
export function fermerVers(trouverSource, maj) {
  if (!possible()) {
    maj();
    return;
  }
  document.documentElement.classList.add("morph-fiche");
  let source = null;
  const t = document.startViewTransition(() => {
    flushSync(maj);
    source = trouverSource?.();
    nommer(source, true);
  });
  t.finished.finally(() => {
    nommer(source, false);
    document.documentElement.classList.remove("morph-fiche");
  });
}
