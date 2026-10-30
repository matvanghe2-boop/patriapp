import { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

/**
 * Menu d'actions « ⋯ ».
 *
 * Les actions d'une note de stratégie n'apparaissaient qu'au SURVOL : au
 * doigt, il n'y a pas de survol, et modifier ou clôturer une thèse était
 * quasi introuvable sur téléphone. Un bouton toujours visible, qui ouvre la
 * liste des actions, marche partout et ne charge pas la carte.
 *
 * Motif ARIA « menu button » : Entrée ou flèche bas ouvre, Échap ferme et
 * rend le focus au bouton, les flèches circulent entre les entrées.
 *
 * @param {{libelle: string, icone?: Function, onClick: Function, danger?: boolean}[]} actions
 */
export default function MenuActions({ actions = [], libelle = "Actions", className = "" }) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef(null);
  const bouton = useRef(null);
  const idMenu = useId();
  const visibles = actions.filter(Boolean);

  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => {
      if (racine.current && !racine.current.contains(e.target)) setOuvert(false);
    };
    document.addEventListener("pointerdown", dehors);
    // Le focus va à la première entrée : c'est ce qu'attend un lecteur
    // d'écran qui vient d'ouvrir un menu.
    racine.current?.querySelector('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);

  const fermer = () => {
    setOuvert(false);
    bouton.current?.focus();
  };

  const auClavier = (e) => {
    const entrees = [...(racine.current?.querySelectorAll('[role="menuitem"]') || [])];
    const i = entrees.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      fermer();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      entrees[(i + 1) % entrees.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      entrees[(i - 1 + entrees.length) % entrees.length]?.focus();
    } else if (e.key === "Tab") {
      setOuvert(false);
    }
  };

  if (visibles.length === 0) return null;

  return (
    <div ref={racine} className={`relative ${className}`} onKeyDown={ouvert ? auClavier : undefined}>
      <button
        ref={bouton}
        type="button"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={ouvert ? idMenu : undefined}
        aria-label={libelle}
        title={libelle}
        onClick={() => setOuvert((o) => !o)}
        onKeyDown={(e) => {
          if (!ouvert && e.key === "ArrowDown") {
            e.preventDefault();
            setOuvert(true);
          }
        }}
        className="btn-flash flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {ouvert && (
        <ul
          id={idMenu}
          role="menu"
          aria-label={libelle}
          className="pop-in absolute right-0 top-9 z-30 min-w-[13rem] rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-xl"
        >
          {visibles.map((a) => {
            const Icone = a.icone;
            return (
              <li key={a.libelle} role="none">
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    setOuvert(false);
                    a.onClick?.();
                  }}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-corps focus-visible:outline-none ${
                    a.danger
                      ? "text-rose-300 hover:bg-rose-500/10 focus:bg-rose-500/10"
                      : "text-slate-200 hover:bg-slate-800 focus:bg-slate-800"
                  }`}
                >
                  {Icone && <Icone size={14} aria-hidden="true" className="shrink-0 opacity-80" />}
                  {a.libelle}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
