import { useId, useState } from "react";
import { X, Check } from "lucide-react";
import { lireNombre, pctPlain } from "../lib/finance";
import { flatTaxPct, tauxNetDepuisBrut } from "../lib/epargne";

/**
 * Réglages d'un livret : ce que le tableau ne montre pas mais qui change les
 * calculs — fiscalité, taux promotionnel, virement automatique, date
 * d'ouverture. Tout est facultatif ; un champ vide retire le réglage.
 *
 * Les taux se saisissent comme la banque les affiche : en BRUT pour un livret
 * fiscalisé (l'application déduit la flat tax), en net sinon. `rate` reste
 * toujours le taux net en vigueur, le seul que lisent les autres calculs.
 */

const CHAMP =
  "w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400/60";

// Arrondi au millième de point : 2,8 / 100 donnerait 0,027999… en virgule flottante.
const versDecimal = (pct) => Math.round(pct * 1000) / 100000;
const versPct = (decimal) => (Number.isFinite(Number(decimal)) ? Math.round(Number(decimal) * 100000) / 1000 : "");

export default function ReglagesLivret({ livret, onEnregistrer, onAnnuler }) {
  const ids = useId();
  const flatTax = flatTaxPct();
  const [v, setV] = useState(() => ({
    fiscalise: Boolean(livret.fiscalise),
    taux: livret.fiscalise && livret.tauxBrut != null ? livret.tauxBrut : versPct(livret.rate),
    boost: Boolean(livret.boost?.fin),
    boostFin: livret.boost?.fin || "",
    boostApres: livret.boost
      ? livret.fiscalise && livret.boost.tauxApresBrut != null
        ? livret.boost.tauxApresBrut
        : versPct(livret.boost.tauxApres)
      : "",
    virementMontant: livret.virement?.montant ?? "",
    virementJour: livret.virement?.jour ?? 5,
    ouverture: livret.ouverture || "",
  }));
  const champ = (cle) => (e) => setV((s) => ({ ...s, [cle]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  // Saisi brut si le livret est fiscalisé : le net s'en déduit.
  const net = (saisi) => (v.fiscalise ? tauxNetDepuisBrut(saisi, flatTax) : lireNombre(saisi));
  const tauxNet = net(v.taux);
  const apresNet = net(v.boostApres);

  const enregistrer = (e) => {
    e.preventDefault();
    const montant = lireNombre(v.virementMontant);
    onEnregistrer({
      rate: tauxNet != null ? versDecimal(tauxNet) : livret.rate,
      fiscalise: v.fiscalise,
      tauxBrut: v.fiscalise ? lireNombre(v.taux) : null,
      boost:
        v.boost && v.boostFin && apresNet != null
          ? { fin: v.boostFin, tauxApres: versDecimal(apresNet), tauxApresBrut: v.fiscalise ? lireNombre(v.boostApres) : null }
          : null,
      virement: montant > 0 ? { montant, jour: Math.min(28, Math.max(1, Math.round(lireNombre(v.virementJour) || 1))) } : null,
      ouverture: v.ouverture || null,
    });
  };

  return (
    <form onSubmit={enregistrer} className="rounded-xl border border-indigo-400/20 bg-slate-950 p-4 flex flex-col gap-4">
      <fieldset className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <legend className="col-span-full text-micro uppercase tracking-wide text-slate-500 mb-1">Taux</legend>
        <label className="col-span-2 flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={v.fiscalise} onChange={champ("fiscalise")} className="accent-indigo-400" />
          Livret fiscalisé (flat tax {pctPlain(flatTax, 0)}) — je saisis le taux brut affiché par la banque
        </label>
        <div>
          <label htmlFor={`${ids}-taux`} className="text-micro text-slate-500">Taux {v.fiscalise ? "brut" : "net"} (%)</label>
          <input id={`${ids}-taux`} type="number" step="0.01" value={v.taux} onChange={champ("taux")} className={`${CHAMP} font-data`} />
        </div>
        <div className="flex flex-col justify-end text-micro text-slate-500 pb-2">
          {v.fiscalise && tauxNet != null && <span>soit {pctPlain(tauxNet, 2)} net</span>}
        </div>
        <label className="col-span-full flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={v.boost} onChange={champ("boost")} className="accent-indigo-400" />
          Ce taux est promotionnel (taux boosté)
        </label>
        {v.boost && (
          <>
            <div className="col-span-1">
              <label htmlFor={`${ids}-boost-fin`} className="text-micro text-slate-500">Jusqu'au</label>
              <input id={`${ids}-boost-fin`} type="date" required value={v.boostFin} onChange={champ("boostFin")} className={`${CHAMP} font-data`} />
            </div>
            <div className="col-span-1">
              <label htmlFor={`${ids}-boost-apres`} className="text-micro text-slate-500">Taux ensuite, {v.fiscalise ? "brut" : "net"} (%)</label>
              <input id={`${ids}-boost-apres`} type="number" step="0.01" required value={v.boostApres} onChange={champ("boostApres")} className={`${CHAMP} font-data`} />
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <legend className="col-span-full text-micro uppercase tracking-wide text-slate-500 mb-1">Virement automatique</legend>
        <div>
          <label htmlFor={`${ids}-vir-montant`} className="text-micro text-slate-500">Montant mensuel (€)</label>
          <input id={`${ids}-vir-montant`} type="number" step="10" min="0" placeholder="Aucun" value={v.virementMontant} onChange={champ("virementMontant")} className={`${CHAMP} font-data`} />
        </div>
        <div>
          <label htmlFor={`${ids}-vir-jour`} className="text-micro text-slate-500">Le … du mois</label>
          <input id={`${ids}-vir-jour`} type="number" min="1" max="28" value={v.virementJour} onChange={champ("virementJour")} className={`${CHAMP} font-data`} />
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <legend className="col-span-full text-micro uppercase tracking-wide text-slate-500 mb-1">Ouverture</legend>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`${ids}-ouverture`} className="text-micro text-slate-500">Date d'ouverture</label>
          <input id={`${ids}-ouverture`} type="date" value={v.ouverture} onChange={champ("ouverture")} className={`${CHAMP} font-data`} />
        </div>
        <p className="col-span-2 sm:col-span-3 self-end text-micro text-slate-500 pb-2">
          Utile pour une assurance-vie (cap des 8 ans) ou un PEL (2, 4, 10 et 15 ans).
        </p>
      </fieldset>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onAnnuler} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
          <X size={13} aria-hidden="true" /> Annuler
        </button>
        <button type="submit" className="flex items-center gap-1.5 text-xs font-semibold bg-indigo-400 hover:bg-indigo-300 text-slate-950 rounded-lg px-4 py-1.5">
          <Check size={14} aria-hidden="true" /> Enregistrer
        </button>
      </div>
    </form>
  );
}
