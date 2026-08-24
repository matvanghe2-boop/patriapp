import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApparence } from "../lib/ApparenceContext";
import { vibrer } from "../lib/haptique";

/**
 * Barre de sous-onglets avec curseur glissant.
 *
 * Les sous-onglets — Portefeuille, Performance, Marché, Screener — changeaient
 * de couleur d'un coup. Un trait qui SE DÉPLACE d'un onglet à l'autre indique
 * d'où l'on vient, ce qu'une substitution de couleur ne fait pas : on sait
 * qu'on a changé, pas dans quel sens.
 *
 * La position est mesurée dans le DOM plutôt que calculée : les libellés ont
 * des largeurs différentes, et cette largeur dépend de la police effectivement
 * chargée. D'où `useLayoutEffect` (avant la peinture, pour éviter un curseur
 * qui saute au montage) et une remesure quand les polices web arrivent.
 */
export default function OngletsGlissants({
  onglets = [],
  actif,
  onChange,
  className = "",
  ariaLabel = "Sous-navigation",
  /** Reste visible au défilement. Voir `.onglets-colles` dans index.css. */
  colle = true,
}) {
  const { haptique } = useApparence();
  const barreRef = useRef(null);
  const [curseur, setCurseur] = useState(null);

  const placer = useCallback(() => {
    const barre = barreRef.current;
    if (!barre) return;
    const el = barre.querySelector('[aria-selected="true"]');
    if (!el) return;
    setCurseur({ x: el.offsetLeft, largeur: el.offsetWidth });
  }, []);

  useLayoutEffect(() => {
    placer();
  }, [placer, actif, onglets]);

  useEffect(() => {
    // Trois sources de décalage : le chargement des polices, le
    // redimensionnement, et le passage en densité compacte.
    const surRedim = () => placer();
    window.addEventListener("resize", surRedim);
    if (document.fonts?.ready) document.fonts.ready.then(placer).catch(() => {});
    return () => window.removeEventListener("resize", surRedim);
  }, [placer]);

  /**
   * Navigation aux flèches, exigée par le motif ARIA « tablist » : dans un
   * groupe d'onglets, Tab entre et sort du groupe, les flèches circulent à
   * l'intérieur.
   */
  const auClavier = (e, i) => {
    const suivant =
      e.key === "ArrowRight" ? (i + 1) % onglets.length
      : e.key === "ArrowLeft" ? (i - 1 + onglets.length) % onglets.length
      : e.key === "Home" ? 0
      : e.key === "End" ? onglets.length - 1
      : null;
    if (suivant == null) return;
    e.preventDefault();
    onChange?.(onglets[suivant].id);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      ref={barreRef}
      className={`onglets-glissants ${colle ? "onglets-colles" : ""} ${className}`}
    >
      {onglets.map((o, i) => (
        <button
          key={o.id}
          role="tab"
          id={`onglet-${o.id}`}
          aria-selected={actif === o.id}
          aria-controls={`panneau-${o.id}`}
          // Un seul onglet dans l'ordre de tabulation : c'est la convention du
          // motif, et elle évite d'imposer six tabulations pour traverser une
          // barre de navigation.
          tabIndex={actif === o.id ? 0 : -1}
          onClick={() => {
            vibrer("navigation", haptique);
            onChange?.(o.id);
          }}
          onKeyDown={(e) => auClavier(e, i)}
          className="onglet-glissant"
        >
          {o.icone && <o.icone size={14} aria-hidden="true" />}
          {o.libelle}
          {o.badge != null && <span className="onglet-badge">{o.badge}</span>}
        </button>
      ))}
      {curseur && (
        <span
          aria-hidden="true"
          className="onglets-curseur"
          style={{ transform: `translateX(${curseur.x}px)`, width: `${curseur.largeur}px` }}
        />
      )}
    </div>
  );
}
