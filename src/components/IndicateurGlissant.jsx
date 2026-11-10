import { useLayoutEffect, useRef } from "react";

/**
 * Un seul repère d'onglet actif, qui GLISSE d'un onglet à l'autre.
 *
 * Chaque bouton de navigation dessinait son propre repère : changer d'onglet
 * en éteignait un et en allumait un autre, sans lien entre les deux. Un repère
 * unique qui se déplace dit d'où l'on vient et où l'on va — et, comme sa
 * teinte suit celle de l'onglet, il passe du vert du Dashboard au violet de la
 * Bourse en chemin.
 *
 * Le repère se place sur l'élément `selecteur` (par défaut
 * `[aria-current="page"]`) de son conteneur, qui doit être positionné. `cle` déclenche la mesure ; le premier
 * placement se fait sans transition.
 *
 * @param {"vertical"|"horizontal"} axe  Barre latérale ou barre basse.
 */
export default function IndicateurGlissant({ cle, axe = "vertical", selecteur = '[aria-current="page"]', className = "" }) {
  const soi = useRef(null);
  const place = useRef(false);

  useLayoutEffect(() => {
    const el = soi.current;
    const conteneur = el?.parentElement;
    if (!el || !conteneur) return undefined;

    const placer = () => {
      const actif = conteneur.querySelector(selecteur);
      if (!actif || actif.offsetParent === null) {
        el.style.opacity = "0";
        return;
      }
      if (!place.current) el.style.transition = "none";
      el.style.opacity = "1";
      if (axe === "vertical") {
        el.style.transform = `translateY(${actif.offsetTop}px)`;
        el.style.height = `${actif.offsetHeight}px`;
        el.style.width = `${actif.offsetWidth}px`;
        el.style.left = `${actif.offsetLeft}px`;
      } else {
        el.style.transform = `translateX(${actif.offsetLeft + actif.offsetWidth / 2}px)`;
      }
      if (!place.current) {
        void el.offsetWidth;
        el.style.transition = "";
        place.current = true;
      }
    };

    placer();
    window.addEventListener("resize", placer);
    return () => window.removeEventListener("resize", placer);
  }, [cle, axe, selecteur]);

  return <span ref={soi} aria-hidden="true" className={`indicateur-glissant indicateur-${axe} ${className}`} />;
}
