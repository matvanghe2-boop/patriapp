import { Children, isValidElement } from "react";
import { ArrowUp, ArrowDown, Eye, EyeOff, RotateCcw } from "lucide-react";
import Modal from "./Modal";
import {
  BLOCS_DASHBOARD,
  DISPOSITION_DEFAUT,
  ordreEffectif,
  blocsVisibles,
  estMasque,
  deplacer,
  basculerMasque,
  estParDefaut,
} from "../lib/dispositionDashboard";

/**
 * Un bloc du Dashboard, repéré par son identifiant. Il ne rend que son
 * contenu : c'est `Disposition` qui décide s'il apparaît, et où.
 */
export function Bloc({ children }) {
  return <>{children}</>;
}

/**
 * Remet les blocs dans l'ordre choisi et retire les blocs masqués.
 *
 * Le DOM est réellement réordonné — pas seulement l'affichage, comme le
 * ferait la propriété CSS `order`. Avec `order`, la touche Tab et les
 * lecteurs d'écran suivaient l'ordre du code, plus celui de l'écran : on
 * aurait sauté d'un bloc du bas à un bloc du haut sans comprendre pourquoi.
 *
 * Les clés que pose `Children.toArray` dépendent de la place d'un bloc dans
 * le CODE, pas à l'écran : un bloc déplacé garde donc son état (champ en
 * cours de saisie, panneau ouvert).
 */
export function Disposition({ disposition, children }) {
  const parId = new Map();
  for (const enfant of Children.toArray(children)) {
    if (isValidElement(enfant) && enfant.props.id) parId.set(enfant.props.id, enfant);
  }
  return blocsVisibles(disposition)
    .map((id) => parId.get(id))
    .filter(Boolean);
}

/** Fenêtre de personnalisation : monter, descendre, masquer. */
export function PersonnaliserDashboard({ open, onClose, disposition, setDisposition }) {
  const ordre = ordreEffectif(disposition);
  const libelles = Object.fromEntries(BLOCS_DASHBOARD.map((b) => [b.id, b.libelle]));
  const changer = (fn) => setDisposition((d) => fn(d || DISPOSITION_DEFAUT));

  return (
    <Modal open={open} onClose={onClose} label="Personnaliser le Dashboard" showClose>
      <div className="p-5">
        <h2 className="font-display text-lg text-slate-50">Personnaliser le Dashboard</h2>
        <p className="text-micro text-slate-500 mt-1">
          Monte ce que tu consultes chaque jour, masque ce qui ne te sert pas. Un bloc masqué se
          réaffiche d&apos;un clic ; rien n&apos;est supprimé.
        </p>

        <ol className="mt-4 divide-y divide-slate-800 rounded-xl border border-slate-800">
          {ordre.map((id, i) => {
            const masque = estMasque(disposition, id);
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-2">
                <span className={`flex-1 text-sm ${masque ? "text-slate-500 line-through" : "text-slate-200"}`}>
                  {libelles[id]}
                </span>
                <button
                  onClick={() => changer((d) => deplacer(d, id, -1))}
                  disabled={i === 0}
                  aria-label={`Monter « ${libelles[id]} »`}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  onClick={() => changer((d) => deplacer(d, id, +1))}
                  disabled={i === ordre.length - 1}
                  aria-label={`Descendre « ${libelles[id]} »`}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
                <button
                  onClick={() => changer((d) => basculerMasque(d, id))}
                  aria-pressed={!masque}
                  aria-label={`${masque ? "Afficher" : "Masquer"} « ${libelles[id]} »`}
                  className={`p-1.5 rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 ${
                    masque ? "text-slate-500" : "text-emerald-300"
                  }`}
                >
                  {masque ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setDisposition(DISPOSITION_DEFAUT)}
            disabled={estParDefaut(disposition)}
            className="flex items-center gap-1.5 text-micro text-slate-400 hover:text-slate-100 disabled:opacity-40 disabled:pointer-events-none"
          >
            <RotateCcw size={12} aria-hidden="true" /> Disposition d&apos;origine
          </button>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
          >
            Terminé
          </button>
        </div>
      </div>
    </Modal>
  );
}
