import { useState, useSyncExternalStore } from "react";
import { Bug, Copy, Trash2, Check } from "lucide-react";
import Modal from "./Modal";
import EtatVide from "./EtatVide";
import { lireJournal, abonnerJournal, viderJournal, rapportTexte } from "../lib/journalErreurs";

/**
 * Journal d'erreurs de l'appareil : les dernières erreurs, et un bouton pour
 * copier le rapport. Rien ne part tout seul.
 */
let instantane = null;
const lire = () => {
  const brut = JSON.stringify(lireJournal());
  if (!instantane || instantane.brut !== brut) instantane = { brut, liste: JSON.parse(brut) };
  return instantane.liste;
};

export function useJournalErreurs() {
  return useSyncExternalStore(abonnerJournal, lire, lire);
}

export default function JournalErreurs({ ouvert, onFermer }) {
  const liste = useJournalErreurs();
  const [copie, setCopie] = useState(false);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(rapportTexte(liste));
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      setCopie(false);
    }
  };

  return (
    <Modal open={ouvert} onClose={onFermer} label="Journal d'erreurs" showClose>
      <div className="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg text-slate-50">
            <Bug size={18} className="text-rose-300" aria-hidden="true" /> Journal d'erreurs
          </h2>
          <p className="text-micro text-slate-500 mt-1">
            Gardé sur cet appareil seulement, hors synchronisation et sauvegardes. Rien n'est envoyé : copie le
            rapport pour le transmettre.
          </p>
        </div>

        {liste.length === 0 ? (
          <EtatVide picto="recherche" titre="Aucune erreur">Rien n'a planté sur cet appareil.</EtatVide>
        ) : (
          <ol className="flex flex-col gap-2">
            {[...liste].reverse().map((e, i) => (
              <li key={`${e.date}-${i}`} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-micro text-slate-500">
                  <span>
                    {new Date(e.date).toLocaleString("fr-FR")} · {e.source} · {e.onglet}
                  </span>
                  {e.occurrences > 1 && <span>×{e.occurrences}</span>}
                </div>
                <p className="text-xs text-slate-200 mt-1 break-words">{e.message}</p>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={viderJournal}
            disabled={liste.length === 0}
            className="btn-flash inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100 disabled:opacity-40"
          >
            <Trash2 size={13} aria-hidden="true" /> Vider
          </button>
          <button
            type="button"
            onClick={copier}
            disabled={liste.length === 0}
            className="btn-flash inline-flex items-center gap-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-40"
          >
            {copie ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
            {copie ? "Copié" : "Copier le rapport"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
