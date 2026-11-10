import { useCallback, useLayoutEffect, useRef } from "react";
import { mouvementReduit } from "./mouvement";

/**
 * Les lignes rejoignent leur nouvelle place au lieu de sauter.
 *
 * Trier un tableau de positions réordonnait tout d'un coup : impossible de
 * suivre où était passée la ligne qu'on regardait. La technique FLIP — First,
 * Last, Invert, Play — mesure chaque élément avant le changement, le laisse se
 * produire, puis anime chacun depuis son ancienne position.
 *
 * Usage : `const capturer = useFlip(refConteneur, cle)` ; appeler `capturer()`
 * juste AVANT le changement d'ordre (dans le gestionnaire du tri), et donner
 * aux éléments un `data-flip` stable. Le jeu se déclenche quand `cle` change ;
 * une mise à jour qui n'est pas passée par `capturer()` (un cours qui arrive)
 * ne déplace rien.
 */
export function useFlip(ref, cle) {
  const avant = useRef(null);

  const capturer = useCallback(() => {
    const el = ref.current;
    if (!el || mouvementReduit()) return;
    const positions = new Map();
    el.querySelectorAll("[data-flip]").forEach((n) => positions.set(n.dataset.flip, n.getBoundingClientRect()));
    avant.current = positions;
  }, [ref]);

  useLayoutEffect(() => {
    const positions = avant.current;
    avant.current = null;
    const el = ref.current;
    if (!positions || !el) return;
    let rang = 0;
    el.querySelectorAll("[data-flip]").forEach((n) => {
      const r0 = positions.get(n.dataset.flip);
      if (!r0 || typeof n.animate !== "function") return;
      const r1 = n.getBoundingClientRect();
      const dx = r0.left - r1.left;
      const dy = r0.top - r1.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: 460,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        delay: Math.min(rang++, 16) * 12,
        fill: "backwards",
      });
    });
  }, [cle, ref]);

  return capturer;
}
