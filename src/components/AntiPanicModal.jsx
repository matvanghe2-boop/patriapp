import { X as XIcon, AlertTriangle } from "lucide-react";
import { PastilleEtat } from "./ui";
import { STATUTS_THESE } from "../lib/theses";
import AssetLogo from "./AssetLogo";

/**
 * Rappel de thèse (« anti-panique ») ouvert depuis le tableau de positions
 * quand une ligne chute dans la journée. Sorti de Bourse.jsx.
 */

function formatDateFrShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Widget Anti-Panique ─────────────────────────────────────────────────────
// Seuil de baisse journalière au-delà duquel le bouton "Lire ma thèse"
// apparaît sur la ligne — au-delà de ce seuil, c'est typiquement le moment où
// une décision impulsive est la plus tentante.
export const PANIC_THRESHOLD_PCT = -5;

export default function AntiPanicModal({ position, note, onClose }) {
  if (!position) return null;
  const st = STATUTS_THESE[note?.statut] || STATUTS_THESE.intacte;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-950 p-5 shadow-[0_0_40px_rgba(244,63,94,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-rose-300">
            <AlertTriangle size={20} />
            <span className="text-xs font-bold uppercase tracking-wide">Secousse détectée</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors" aria-label="Fermer">
            <XIcon size={18} />
          </button>
        </div>

        <h3 className="text-lg font-bold text-slate-50 mb-0.5 flex items-center gap-2">
          <AssetLogo ticker={position.ticker} size="sm" />
          {position.ticker}
        </h3>
        <p className="text-sm text-slate-500 mb-4">{position.name}</p>

        {note ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <PastilleEtat etat={st.etat}>Thèse {st.libelle.toLowerCase()}</PastilleEtat>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 mb-3">
              <p className="text-sm text-slate-300 leading-relaxed italic">
                💡 Rappel à toi-même (rédigé le {formatDateFrShort(note.date)}) :
              </p>
              {note.these && <p className="text-sm text-slate-200 mt-2 whitespace-pre-wrap">{note.these}</p>}
            </div>

            {note.conditions_vente && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-3">
                <div className="text-micro text-amber-300/80 font-semibold uppercase tracking-wide mb-1">
                  Tu ne vends que si...
                </div>
                <p className="text-sm text-slate-200 whitespace-pre-wrap">{note.conditions_vente}</p>
              </div>
            )}

            <p className="text-sm text-slate-400 leading-relaxed">
              Est-ce que l'une de ces conditions est vraie aujourd'hui ? Si non, cette baisse est probablement du bruit de marché. Respire, et laisse la thèse jouer.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
            Aucune thèse enregistrée pour {position.ticker}. Sans repère écrit à froid, c'est le moment idéal pour ne prendre aucune décision impulsive — attends d'avoir de quoi te relire la prochaine fois.
          </div>
        )}
      </div>
    </div>
  );
}
