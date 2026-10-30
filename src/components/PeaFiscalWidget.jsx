import { useState, useId } from "react";
import { CarteRepliable, CARD_THEMES } from "./ui";
import { eur, pctPlain, rebaselineLedger, lireNombre, computePeaAge, PEA_PLAFONDS, plafondPea } from "../lib/finance";

/**
 * Suivi fiscal du PEA : date d'ouverture, versements, plafond. Sorti de
 * Bourse.jsx.
 */

export default function PeaFiscalWidget({ bourse, setBourse, replie, onBasculer }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ peaOuverture: bourse.peaOuverture || "", peaVersements: bourse.peaVersements || 0 });

  const versements = bourse.peaVersements || 0;
  const plafond = plafondPea(bourse);
  const typeCourant = PEA_PLAFONDS[bourse.peaType] ? bourse.peaType : "classique";
  const pctPlafond = Math.min(100, (versements / plafond) * 100);
  const age = computePeaAge(bourse.peaOuverture);

  // Le total versé saisi ici est l'ancrage de la courbe « Capital investi » :
  // on refixe donc la ligne de base pour qu'il devienne le nouveau point de
  // départ. Sans ça, le chiffre serait immédiatement recalculé à partir de
  // l'ancien ancrage et la correction manuelle serait perdue.
  const save = () => {
    setBourse((b) =>
      rebaselineLedger({ ...b, peaOuverture: draft.peaOuverture, peaVersements: lireNombre(draft.peaVersements) ?? 0 })
    );
    setEditing(false);
  };

  return (
    <CarteRepliable
      titre="Plafond de versements PEA"
      accent={CARD_THEMES.violet}
      replie={replie}
      onBasculer={onBasculer}
      resume={`${pctPlain(pctPlafond, 0)} de ${eur(plafond, 0)}`}
      actions={
        <button
          onClick={() => { setDraft({ peaOuverture: bourse.peaOuverture || "", peaVersements: versements }); setEditing((e) => !e); }}
          className="btn-flash text-micro text-violet-300/80 hover:text-violet-200"
        >
          {editing ? "Fermer" : "Modifier"}
        </button>
      }
    >

      {editing ? (
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label htmlFor={`${idsChamps}-date-d-ouverture`} className="text-micro text-slate-500 block mb-1">Date d'ouverture du PEA</label>
            <input id={`${idsChamps}-date-d-ouverture`} type="date" value={draft.peaOuverture} onChange={(e) => setDraft((d) => ({ ...d, peaOuverture: e.target.value }))} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-violet-400/60" />
          </div>
          <div>
            <label htmlFor={`${idsChamps}-total-verse`} className="text-micro text-slate-500 block mb-1">Total versé (€)</label>
            <input id={`${idsChamps}-total-verse`} type="number" step="100" value={draft.peaVersements} onChange={(e) => setDraft((d) => ({ ...d, peaVersements: e.target.value }))} className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-violet-400/60" />
            <p className="text-micro text-slate-500 mt-1 max-w-[13rem]">
              Point de départ de la courbe « Capital investi ». Il évoluera ensuite tout seul à chaque versement ou retrait de cash.
            </p>
          </div>
          {/* Le plafond ne vaut 150 000 € que pour un PEA classique. Entre 18 et
              25 ans, tant que le titulaire est rattaché au foyer fiscal de ses
              parents, il est de 20 000 € — sept fois moins. */}
          <div>
            <label htmlFor={`${idsChamps}-type-de-pea`} className="text-micro text-slate-500 block mb-1">Type de PEA</label>
            <select id={`${idsChamps}-type-de-pea`}
              value={typeCourant}
              onChange={(e) => setBourse((b) => ({ ...b, peaType: e.target.value }))}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-violet-400/60"
            >
              {Object.entries(PEA_PLAFONDS).map(([cle, v]) => (
                <option key={cle} value={cle}>{v.label}</option>
              ))}
            </select>
          </div>
          <button onClick={save} className="btn-solid text-xs font-semibold bg-violet-400 hover:bg-violet-300 text-slate-950 rounded-lg px-3 py-1.5">Enregistrer</button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400 font-data ghost-blur">{eur(versements, 0)} versés</span>
            <span className="text-slate-500 font-data">{eur(plafond, 0)} plafond</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pctPlafond >= 90 ? "bg-rose-400" : pctPlafond >= 70 ? "bg-amber-400" : "bg-violet-400"}`} style={{ width: `${pctPlafond}%` }} />
          </div>
          <div className="text-micro text-slate-500 mt-1">{pctPlain(pctPlafond, 1)} du plafond — reste <span className="ghost-blur">{eur(plafond - versements, 0)}</span> de marge de versement</div>
          {typeCourant === "jeune" && (
            <p className="text-micro text-violet-300/80 mt-1.5 leading-relaxed">
              {PEA_PLAFONDS.jeune.detail}
            </p>
          )}
        </>
      )}

      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-3">
        {age ? (
          <>
            <span className="text-2xl">{age.eligible ? "🟢" : "🔴"}</span>
            <div>
              <div className="text-sm text-slate-200 font-medium">
                {age.eligible ? "PEA de plus de 5 ans" : "PEA de moins de 5 ans"}
              </div>
              <div className="text-micro text-slate-500">
                {age.eligible
                  ? "Exonération d'impôt sur les plus-values — seuls 17,2 % de prélèvements sociaux restent dus."
                  : `Clôture entraînerait imposition spécifique — encore ${age.monthsRemaining} mois avant l'exonération.`}
              </div>
              <div className="text-micro text-slate-500 font-data mt-0.5">Ouvert depuis {age.years} an(s) {age.months} mois</div>
            </div>
          </>
        ) : (
          <span className="text-micro text-slate-500">Renseigne la date d'ouverture pour voir le décompte fiscal.</span>
        )}
      </div>
    </CarteRepliable>
  );
}
