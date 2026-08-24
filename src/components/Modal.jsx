import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Modale unique de l'application.
 *
 * Il existait six superpositions en `fixed inset-0`, chacune réimplémentant sa
 * propre moitié du travail :
 *
 *   composant             role  aria-modal  Échap  focus  animation
 *   ConfirmDialog          ✓        ✓         ✓      ✓         ✓
 *   PanneauTransparence    ✓        ✓         ✗      ✗         ✗
 *   ReglagesHorizon        ✓        ✓         ✗      ✗         ✗
 *   FinancialCalendar      ✓        ✓         ✗      ✗         ✗
 *   ChartFocusModal        ✗        ✗         ✓      ✗         ✗
 *   OperationForm          ✗        ✗         ✗      ✗         ✗
 *
 * Aucune n'utilisait de portail ni ne bloquait le défilement : la page
 * continuait de défiler derrière la fenêtre ouverte, et l'empilement dépendait
 * du `z-index` du parent — un conteneur en `transform` ou `overflow-hidden`
 * suffisait à rogner une modale.
 *
 * Ce composant rassemble ce que `ConfirmDialog` faisait déjà correctement :
 *
 *  - **Portail** vers `document.body` : la modale échappe à tout contexte
 *    d'empilement local, condition nécessaire pour qu'un `z-index` élevé
 *    signifie réellement « au-dessus de tout ».
 *  - **Verrou de défilement**, restauré à la fermeture, avec compensation de
 *    la largeur de la barre de défilement pour éviter le sursaut horizontal.
 *  - **Piège de focus** : Tab tourne en boucle à l'intérieur, et le focus
 *    revient à son point de départ à la fermeture.
 *  - **Échap** et clic sur le fond.
 *  - **Animation d'entrée**, neutralisée par `prefers-reduced-motion`.
 */
export default function Modal({
  open,
  onClose,
  label,
  labelledBy,
  children,
  /** Classes du panneau : c'est là que chaque appelant garde son identité. */
  panelClassName = "w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl",
  /** Opacité du fond. Le graphique plein écran veut un noir plus dense. */
  overlayClassName = "bg-slate-950/80 backdrop-blur-sm",
  /** `alertdialog` pour une confirmation bloquante, `dialog` sinon. */
  role = "dialog",
  /** Bouton de fermeture flottant en haut à droite du panneau. */
  showClose = false,
  /** Fermeture au clic sur le fond. À désactiver pour une saisie en cours. */
  closeOnOverlayClick = true,
  className = "",
  /** Styles en ligne du panneau, pour les couleurs calculées à l'exécution
   *  (le calendrier financier colore sa bordure selon le type d'événement). */
  style,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const dejaFocalise = document.activeElement;

    // Le focus entre dans la modale : sur le premier élément focalisable, ou à
    // défaut sur le panneau lui-même (rendu focalisable par `tabIndex={-1}`),
    // pour que les lecteurs d'écran annoncent son contenu.
    const focalisables = () =>
      panelRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || [];
    const premier = focalisables()[0];
    (premier || panelRef.current)?.focus?.();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;
      const liste = focalisables();
      if (liste.length === 0) return;
      const debut = liste[0];
      const fin = liste[liste.length - 1];
      if (e.shiftKey && document.activeElement === debut) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && document.activeElement === fin) {
        e.preventDefault();
        debut.focus();
      }
    };

    // Verrou de défilement. La compensation de largeur évite que le contenu
    // ne se décale de quelques pixels au moment où la barre disparaît.
    const overflowInitial = document.body.style.overflow;
    const paddingInitial = document.body.style.paddingRight;
    const largeurBarre = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (largeurBarre > 0) document.body.style.paddingRight = `${largeurBarre}px`;

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowInitial;
      document.body.style.paddingRight = paddingInitial;
      dejaFocalise?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 ${overlayClassName}`}
      onMouseDown={(e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={style}
        className={`modal-panel relative outline-none flex flex-col ${panelClassName} ${className}`}
      >
        {showClose && (
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="btn-flash absolute top-3 right-3 z-10 text-slate-500 hover:text-slate-100 p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
        {/*
          LE CONTENU DÉFILE, PAS LA FENÊTRE.

          Le panneau était centré sans hauteur maximale : dès qu'il dépassait
          l'écran — un téléphone en paysage, un portable à 768 px de haut, ou
          simplement la rétrospective annuelle qui est longue par nature — le
          débordement partait hors cadre EN HAUT ET EN BAS, et rien ne pouvait
          le ramener : le défilement de la page est verrouillé pendant qu'une
          modale est ouverte, précisément pour éviter que le fond ne bouge.

          Le panneau est donc plafonné à la hauteur visible et c'est cette zone
          qui défile. Le bouton de fermeture reste ainsi à sa place, puisque le
          panneau lui-même ne bouge pas.

          `min-h-0` n'est pas décoratif : sans lui, un enfant de conteneur flex
          refuse de rétrécir sous sa taille de contenu, la hauteur maximale
          n'aurait aucun effet et le débordement reviendrait à l'identique.

          `100dvh` et non `100vh` : sur mobile, `vh` ignore la barre d'adresse
          rétractable et surestime la hauteur réellement disponible.
        */}
        <div className="overflow-y-auto overscroll-contain min-h-0 rounded-[inherit]">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
