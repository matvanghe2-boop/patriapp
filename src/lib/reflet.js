import { effetsVivants, pointeurFin } from "./mouvement";

/**
 * Reflet et relief au curseur.
 *
 * Une lumière douce suit la souris sur la carte survolée, et les cartes
 * vedettes (ou marquées `data-relief`) s'inclinent légèrement vers elle. C'est
 * de l'ambiance pure : réservé à la souris (un doigt ne « survole » rien), aux
 * effets vivants, et sans aucun rendu React — deux variables CSS par image.
 *
 * Une installation pour toute la visite (App), par délégation sur le document :
 * les cartes qui arrivent ensuite sont prises en charge sans rien faire.
 */
const SELECTEUR = ".revelable, [data-relief]";
const SELECTEUR_RELIEF = ".carte-vedette, [data-relief]";

export function surveillerReflets() {
  if (typeof document === "undefined" || !pointeurFin()) return () => {};

  let cible = null;
  let dernier = null;
  let image = 0;

  const quitter = (el) => {
    el.removeAttribute("data-reflet");
    el.style.removeProperty("--reflet-x");
    el.style.removeProperty("--reflet-y");
    el.style.removeProperty("--relief-x");
    el.style.removeProperty("--relief-y");
  };

  const appliquer = () => {
    image = 0;
    const e = dernier;
    if (!e) return;
    const el = effetsVivants() ? e.target?.closest?.(SELECTEUR) : null;
    if (el !== cible) {
      if (cible) quitter(cible);
      cible = el;
      if (el) el.setAttribute("data-reflet", "");
    }
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--reflet-x", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--reflet-y", `${(y * 100).toFixed(1)}%`);
    if (el.matches(SELECTEUR_RELIEF)) {
      // Une grande carte qui pivote de quelques degrés balaie des dizaines de
      // pixels sur ses bords : l'amplitude se règle sur la taille.
      const amplitude = r.width > 480 ? 1.4 : 5;
      el.style.setProperty("--relief-x", `${((0.5 - y) * 2 * amplitude).toFixed(2)}deg`);
      el.style.setProperty("--relief-y", `${((x - 0.5) * 2 * amplitude).toFixed(2)}deg`);
    }
  };

  const surMouvement = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    dernier = e;
    if (!image) image = requestAnimationFrame(appliquer);
  };
  const surSortie = (e) => {
    if (e.relatedTarget) return;
    dernier = null;
    if (cible) quitter(cible);
    cible = null;
  };

  document.addEventListener("pointermove", surMouvement, { passive: true });
  document.addEventListener("pointerout", surSortie, { passive: true });
  return () => {
    document.removeEventListener("pointermove", surMouvement);
    document.removeEventListener("pointerout", surSortie);
    cancelAnimationFrame(image);
    if (cible) quitter(cible);
  };
}
