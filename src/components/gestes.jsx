import { useEffect, useRef, useState } from "react";
import { Trash2, RefreshCw } from "lucide-react";
import { useApparence } from "../lib/ApparenceContext";
import { vibrer } from "../lib/haptique";

/**
 * Gestes tactiles.
 *
 * L'application est installable et pensée pour le pouce — barre de navigation
 * basse, tableaux transformés en cartes empilées sous 768 px — mais elle ne
 * répondait qu'au clic. Deux gestes manquaient, et les deux portent sur les
 * actions les plus répétées : supprimer une ligne, actualiser les cours.
 *
 * Les deux sont réservés au POINTEUR GROSSIER (`pointer: coarse`). Un geste de
 * balayage à la souris n'existe pas, et intercepter le glissement sur un
 * bureau casserait la sélection de texte pour rien.
 */

/** Le pointeur principal est-il un doigt ? */
function surTactile() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

const SEUIL_SUPPRESSION = 96; // px de glissement avant déclenchement
const LARGEUR_MAX = 140;

/**
 * Enveloppe une ligne pour la rendre supprimable par balayage vers la gauche.
 *
 * Le filet est déjà en place ailleurs : les six suppressions de l'application
 * passent par un toast « Annuler ». Le geste peut donc être direct sans être
 * risqué — c'est même la condition qui le rend acceptable, car un balayage se
 * déclenche parfois par accident en défilant.
 *
 * Le contenu reste inchangé au clavier et à la souris : ce composant n'ajoute
 * rien à l'arbre d'accessibilité, et le bouton de suppression d'origine
 * demeure le chemin principal.
 */
/**
 * Version HOOK du balayage, applicable à n'importe quel élément — y compris un
 * `<tr>`.
 *
 * Le composant enveloppant ne convient pas aux tableaux : glisser un `<div>`
 * entre un `<tbody>` et un `<tr>` produit un balisage invalide, que les
 * navigateurs « réparent » en sortant le div de la table. D'où ce hook, qui
 * rend des gestionnaires et un style à poser directement sur la ligne.
 *
 * @returns {{handlers: object, style: object, offset: number}}
 */
export function useBalayageSuppression(onSupprimer) {
  const { haptique } = useApparence();
  const [offset, setOffset] = useState(0);
  const [actif, setActif] = useState(false);
  const depart = useRef(null);
  const seuilFranchi = useRef(false);
  const tactile = useRef(false);

  useEffect(() => {
    tactile.current = surTactile();
  }, []);

  const onTouchStart = (e) => {
    if (!tactile.current || !onSupprimer) return;
    depart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    seuilFranchi.current = false;
  };

  const onTouchMove = (e) => {
    if (!depart.current) return;
    const dx = e.touches[0].clientX - depart.current.x;
    const dy = e.touches[0].clientY - depart.current.y;
    if (Math.abs(dy) > Math.abs(dx)) {
      depart.current = null;
      setOffset(0);
      setActif(false);
      return;
    }
    if (dx > 0) return;
    setActif(true);
    const glisse = Math.max(-LARGEUR_MAX, dx);
    setOffset(glisse);
    if (!seuilFranchi.current && Math.abs(glisse) >= SEUIL_SUPPRESSION) {
      seuilFranchi.current = true;
      vibrer("seuil", haptique);
    }
  };

  const onTouchEnd = () => {
    if (!depart.current) return;
    const declenche = Math.abs(offset) >= SEUIL_SUPPRESSION;
    depart.current = null;
    setActif(false);
    setOffset(0);
    if (declenche) {
      vibrer("suppression", haptique);
      onSupprimer?.();
    }
  };

  return {
    offset,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    style: {
      transform: offset ? `translateX(${offset}px)` : undefined,
      transition: actif ? "none" : "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
      // Le fond rouge n'apparaît que pendant le geste : une ligne au repos ne
      // doit pas porter d'indice visuel de suppression.
      backgroundImage: offset
        ? "linear-gradient(to left, rgb(var(--c-rose-500) / 0.2), transparent 55%)"
        : undefined,
    },
  };
}

export function BalayerPourSupprimer({ onSupprimer, libelle = "Supprimer", children }) {
  const { haptique } = useApparence();
  const [offset, setOffset] = useState(0);
  const [actif, setActif] = useState(false);
  const depart = useRef(null);
  const seuilFranchi = useRef(false);
  const tactile = useRef(false);

  useEffect(() => {
    tactile.current = surTactile();
  }, []);

  const debut = (e) => {
    if (!tactile.current) return;
    depart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    seuilFranchi.current = false;
  };

  const bouge = (e) => {
    if (!depart.current) return;
    const dx = e.touches[0].clientX - depart.current.x;
    const dy = e.touches[0].clientY - depart.current.y;
    // Geste vertical : c'est un défilement, on lâche prise immédiatement.
    // Sans ce test, faire défiler une longue liste déclencherait des
    // suppressions au moindre écart latéral du doigt.
    if (Math.abs(dy) > Math.abs(dx)) {
      depart.current = null;
      setOffset(0);
      setActif(false);
      return;
    }
    if (dx > 0) return; // vers la droite : rien à révéler de ce côté
    setActif(true);
    const glisse = Math.max(-LARGEUR_MAX, dx);
    setOffset(glisse);
    if (!seuilFranchi.current && Math.abs(glisse) >= SEUIL_SUPPRESSION) {
      seuilFranchi.current = true;
      vibrer("seuil", haptique);
    }
  };

  const fin = () => {
    if (!depart.current) return;
    const declenche = Math.abs(offset) >= SEUIL_SUPPRESSION;
    depart.current = null;
    setActif(false);
    setOffset(0);
    if (declenche) {
      vibrer("suppression", haptique);
      onSupprimer?.();
    }
  };

  return (
    <div className="balayage">
      <div className="balayage-fond" aria-hidden="true">
        <Trash2 size={16} />
        <span>{libelle}</span>
      </div>
      <div
        className="balayage-contenu"
        style={{
          transform: `translateX(${offset}px)`,
          transition: actif ? "none" : "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        onTouchStart={debut}
        onTouchMove={bouge}
        onTouchEnd={fin}
        onTouchCancel={fin}
      >
        {children}
      </div>
    </div>
  );
}

const SEUIL_RAFRAICHIR = 72;
const RESISTANCE = 0.45;

/**
 * Tirer vers le bas pour rafraîchir.
 *
 * Le bouton d'actualisation des cours est en haut de l'onglet Bourse, hors de
 * portée du pouce sur un grand téléphone — exactement le problème que la barre
 * de navigation basse avait résolu pour la navigation.
 *
 * Le geste n'est capté QUE si la page est déjà tout en haut, sinon il entrerait
 * en concurrence avec le défilement normal. La résistance (0,45) fait que le
 * doigt parcourt plus de distance que l'indicateur : c'est ce qui donne la
 * sensation d'élasticité, et ce qui évite les déclenchements accidentels.
 */
export function useTirerPourRafraichir(onRafraichir, { actif = true } = {}) {
  const { haptique } = useApparence();
  const [tire, setTire] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const depart = useRef(null);
  const seuilFranchi = useRef(false);

  useEffect(() => {
    if (!actif || !surTactile()) return undefined;

    const debut = (e) => {
      if (window.scrollY > 0 || enCours) return;
      depart.current = e.touches[0].clientY;
      seuilFranchi.current = false;
    };

    const bouge = (e) => {
      if (depart.current == null) return;
      const dy = e.touches[0].clientY - depart.current;
      if (dy <= 0) {
        depart.current = null;
        setTire(0);
        return;
      }
      const distance = Math.min(SEUIL_RAFRAICHIR * 1.6, dy * RESISTANCE);
      setTire(distance);
      if (!seuilFranchi.current && distance >= SEUIL_RAFRAICHIR) {
        seuilFranchi.current = true;
        vibrer("seuil", haptique);
      }
    };

    const fin = async () => {
      if (depart.current == null) return;
      const declenche = tire >= SEUIL_RAFRAICHIR;
      depart.current = null;
      setTire(0);
      if (!declenche) return;
      setEnCours(true);
      vibrer("validation", haptique);
      try {
        await onRafraichir?.();
      } finally {
        setEnCours(false);
      }
    };

    // `passive: true` : on n'appelle jamais preventDefault, et le signaler
    // laisse le navigateur défiler sans attendre notre écouteur.
    document.addEventListener("touchstart", debut, { passive: true });
    document.addEventListener("touchmove", bouge, { passive: true });
    document.addEventListener("touchend", fin, { passive: true });
    document.addEventListener("touchcancel", fin, { passive: true });
    return () => {
      document.removeEventListener("touchstart", debut);
      document.removeEventListener("touchmove", bouge);
      document.removeEventListener("touchend", fin);
      document.removeEventListener("touchcancel", fin);
    };
  }, [actif, enCours, tire, onRafraichir, haptique]);

  return { tire, enCours, pret: tire >= SEUIL_RAFRAICHIR };
}

/** Indicateur visuel du geste de rafraîchissement. */
export function IndicateurRafraichissement({ tire, enCours, pret }) {
  if (!tire && !enCours) return null;
  return (
    <div
      className="indicateur-tirage"
      style={{ transform: `translateY(${enCours ? SEUIL_RAFRAICHIR : tire}px)` }}
      aria-hidden="true"
    >
      <RefreshCw
        size={16}
        className={enCours ? "animate-spin" : ""}
        style={{ transform: enCours ? undefined : `rotate(${(tire / SEUIL_RAFRAICHIR) * 270}deg)` }}
      />
      <span>{enCours ? "Actualisation…" : pret ? "Relâche pour actualiser" : "Tire pour actualiser"}</span>
    </div>
  );
}
