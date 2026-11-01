import { useId } from "react";
import { Card } from "../ui";
import { CATEGORIES, TYPES, dureeEnClair } from "../../lib/coffre";

/**
 * Sous-onglet « Réglages » du coffre : délais de rappel par type de document,
 * et titre neutre pour les rappels posés dans l'agenda.
 *
 * Un délai laissé vide garde celui que le coffre propose (§7 de la spec) ; un
 * délai réglé dans la fiche d'un document l'emporte sur les deux.
 */

const CHAMP =
  "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 font-data focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40";

/** Types qui ont une échéance et un délai par défaut, groupés par catégorie. */
const GROUPES = CATEGORIES.map((c) => ({
  categorie: c,
  types: TYPES.filter((t) => t.categorie === c.id && t.echeance && t.rappelJours != null),
})).filter((g) => g.types.length > 0);

export default function ReglagesCoffre({ reglages, onChange }) {
  const ids = useId();
  const delais = reglages?.delais || {};

  const changerDelai = (typeId, saisie) =>
    onChange((r) => {
      const suivants = { ...(r.delais || {}) };
      const n = Math.round(Number(saisie));
      if (saisie === "" || !Number.isFinite(n) || n < 0) delete suivants[typeId];
      else suivants[typeId] = n;
      return { ...r, delais: suivants };
    });

  return (
    <>
      <Card>
        <h2 className="text-lead text-slate-100">Délais de rappel</h2>
        <p className="mt-1 text-sm text-slate-400">
          Combien de jours avant l'échéance un papier passe « à prévoir ». Laisse vide pour garder le délai
          proposé. Un délai réglé dans la fiche d'un document l'emporte.
        </p>
        <div className="mt-4 space-y-4">
          {GROUPES.map((g) => (
            <fieldset key={g.categorie.id}>
              <legend className="text-micro uppercase tracking-wider text-slate-500 mb-2">
                {g.categorie.libelle}
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.types.map((t) => (
                  <div key={t.id} className="flex items-center gap-3">
                    <label htmlFor={`${ids}-${t.id}`} className="flex-1 text-sm text-slate-300">
                      {t.libelle}
                      <span className="block text-micro text-slate-500">
                        Proposé : {t.rappelJours} jours, soit {dureeEnClair(t.rappelJours)}
                      </span>
                    </label>
                    <input
                      id={`${ids}-${t.id}`}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={delais[t.id] ?? ""}
                      placeholder={String(t.rappelJours)}
                      onChange={(e) => changerDelai(t.id, e.target.value)}
                      className={`${CHAMP} w-24`}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </Card>

      <Card>
        <label className="flex items-start gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={!!reglages?.titreAgendaNeutre}
            onChange={(e) => onChange((r) => ({ ...r, titreAgendaNeutre: e.target.checked }))}
            className="mt-1 accent-fuchsia-400"
          />
          <span>
            Titre neutre dans l'agenda
            <span className="block text-micro text-slate-500">
              « Papier à renouveler — voir le coffre Patrium » au lieu de « Passeport — lancer le
              renouvellement (…) » : ton agenda ne saura pas de quel papier il s'agit. Les rappels déjà posés
              seront signalés « à mettre à jour ».
            </span>
          </span>
        </label>
      </Card>
    </>
  );
}
