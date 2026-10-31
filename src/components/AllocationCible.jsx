import { useState, useId } from "react";
import { Target, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { eur, pctPlain } from "../lib/finance";

/**
 * Allocation cible épargne / bourse et écart à la cible. Sortie de Dashboard.jsx.
 */

// ─── Allocation target panel ──────────────────────────────────────────────────
export default function AllocationTarget({ target, setTarget, livretsTotal, bourseTotal }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(target);
  const total = livretsTotal + bourseTotal;
  if (total === 0) return null;

  const currentBoursePct = total > 0 ? (bourseTotal / total) * 100 : 0;
  const currentLivretsPct = 100 - currentBoursePct;
  const targetBoursePct = target.bourse;
  const targetLivretsPct = 100 - targetBoursePct;

  const gapBourse = currentBoursePct - targetBoursePct;
  const absGap = Math.abs(gapBourse);

  // Compute next investment suggestion
  const nextAmount = 500;
  let suggestion = null;
  if (absGap > 2) {
    if (gapBourse < 0) {
      suggestion = `Pour te rapprocher de ta cible, oriente tes prochains ${eur(nextAmount)} vers ton PEA/Bourse.`;
    } else {
      suggestion = `Pour te rapprocher de ta cible, oriente tes prochains ${eur(nextAmount)} vers tes livrets.`;
    }
  }

  const save = () => {
    setTarget(draft);
    setEditing(false);
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider">
          <Target size={11} />
          Allocation cible
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className="flex items-center gap-1 text-micro text-amber-300/70 hover:text-amber-300"
        >
          {editing ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {editing ? "Fermer" : "Définir ma cible"}
        </button>
      </div>

      {/* Bars: Current vs Target */}
      <div className="space-y-2.5">
        {/* Épargne sécurisée */}
        <div>
          <div className="flex justify-between text-micro text-slate-500 mb-1">
            <span>Épargne sécurisée</span>
            <span>
              <span className="text-slate-300 font-data">{pctPlain(currentLivretsPct, 0)}</span>
              <span className="text-slate-500 mx-1">→</span>
              <span className="text-teal-400 font-data">{pctPlain(targetLivretsPct, 0)}</span>
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-800 overflow-visible">
            <div
              className="absolute top-0 left-0 h-2 rounded-full bg-teal-400/50 transition-all"
              style={{ width: `${currentLivretsPct}%` }}
            />
            <div
              className="absolute top-0 left-0 h-2 rounded-full border-2 border-teal-400 bg-transparent transition-all"
              style={{ width: `${targetLivretsPct}%` }}
            />
          </div>
        </div>
        {/* Bourse */}
        <div>
          <div className="flex justify-between text-micro text-slate-500 mb-1">
            <span>Bourse (PEA)</span>
            <span>
              <span className="text-slate-300 font-data">{pctPlain(currentBoursePct, 0)}</span>
              <span className="text-slate-500 mx-1">→</span>
              <span className="text-amber-400 font-data">{pctPlain(targetBoursePct, 0)}</span>
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-800 overflow-visible">
            <div
              className="absolute top-0 left-0 h-2 rounded-full bg-amber-400/50 transition-all"
              style={{ width: `${currentBoursePct}%` }}
            />
            <div
              className="absolute top-0 left-0 h-2 rounded-full border-2 border-amber-400 bg-transparent transition-all"
              style={{ width: `${targetBoursePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Ecart */}
      {absGap > 2 && (
        <div className="flex items-start gap-2 mt-3 text-micro text-amber-300/80 bg-amber-400/5 border border-amber-400/15 rounded-lg px-3 py-2">
          <Zap size={11} className="mt-0.5 shrink-0" />
          <span>{suggestion}</span>
        </div>
      )}
      {absGap <= 2 && absGap >= 0 && (
        <div className="flex items-center gap-2 mt-3 text-micro text-emerald-400/80 bg-emerald-400/5 border border-emerald-400/15 rounded-lg px-3 py-2">
          <Target size={11} />
          Ton allocation est conforme à ta cible. ✓
        </div>
      )}

      {/* Edit slider */}
      {editing && (
        <div className="mt-4 p-3 rounded-xl border border-slate-700 bg-slate-950">
          <label htmlFor={`${idsChamps}-part-bourse-cible`} className="text-micro text-slate-500 block mb-2">
            Part Bourse cible : <span className="text-amber-300 font-data">{draft.bourse}%</span>
          </label>
          <input id={`${idsChamps}-part-bourse-cible`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={draft.bourse}
            onChange={(e) => setDraft({ bourse: parseInt(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-micro text-slate-500 mt-1">
            <span>100% Livrets</span>
            <span>100% Bourse</span>
          </div>
          <button
            onClick={save}
            className="mt-3 w-full text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-4 py-1.5 transition-colors"
          >
            Enregistrer la cible
          </button>
        </div>
      )}
    </div>
  );
}
