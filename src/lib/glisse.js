import { mouvementReduit, pointeurFin } from "./mouvement";

/**
 * Surlignage qui glisse d'une ligne à l'autre dans les tableaux de données.
 *
 * Le survol de ligne existait (`.table-donnees tbody tr:hover`), mais il
 * sautait : chaque ligne s'allumait et s'éteignait sur place. Un seul repère
 * qui se DÉPLACE d'une ligne à la suivante se suit de l'œil quand on parcourt
 * un tableau de positions ou un journal d'opérations.
 *
 * Réservé à la souris, au-dessus de 768 px (en dessous, les lignes deviennent
 * des cartes) et au mouvement permis ; sinon le survol d'origine reste seul.
 * Le repère vit dans le conteneur du tableau, hors de React.
 */
export function surveillerGlisse() {
  if (typeof document === "undefined" || !pointeurFin()) return () => {};
  const etroit = window.matchMedia?.("(max-width: 767px)");

  let table = null;
  let repere = null;

  const retirer = () => {
    if (repere) {
      const r = repere;
      r.style.opacity = "0";
      setTimeout(() => r.remove(), 180);
    }
    table?.removeAttribute("data-glisse");
    table = null;
    repere = null;
  };

  const placer = (ligne) => {
    const conteneur = table.parentElement;
    const rc = conteneur.getBoundingClientRect();
    const rl = ligne.getBoundingClientRect();
    const premier = repere.style.opacity !== "1";
    if (premier) repere.style.transition = "none";
    repere.style.width = `${table.getBoundingClientRect().width}px`;
    repere.style.height = `${rl.height}px`;
    repere.style.transform = `translate(${table.getBoundingClientRect().left - rc.left + conteneur.scrollLeft}px, ${rl.top - rc.top + conteneur.scrollTop}px)`;
    if (premier) {
      void repere.offsetWidth;
      repere.style.transition = "";
      repere.style.opacity = "1";
    }
  };

  const surSurvol = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const ligne = e.target?.closest?.(".table-donnees tbody tr");
    if (!ligne || mouvementReduit() || etroit?.matches) {
      if (!e.target?.closest?.(".table-donnees")) retirer();
      return;
    }
    const t = ligne.closest(".table-donnees");
    if (t !== table) {
      retirer();
      table = t;
      const conteneur = t.parentElement;
      if (getComputedStyle(conteneur).position === "static") conteneur.style.position = "relative";
      repere = document.createElement("div");
      repere.className = "surlignage-glissant";
      repere.setAttribute("aria-hidden", "true");
      conteneur.appendChild(repere);
      t.setAttribute("data-glisse", "");
    }
    placer(ligne);
  };

  document.addEventListener("pointerover", surSurvol, { passive: true });
  return () => {
    document.removeEventListener("pointerover", surSurvol);
    retirer();
  };
}
