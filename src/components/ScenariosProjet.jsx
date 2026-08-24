import { useState } from "react";
import { Save, GitCompare, Trash2, Trophy } from "lucide-react";
import { Card, CardLabel, EmptyState, CARD_THEMES } from "./ui";
import { eur, uid, todayIso } from "../lib/finance";

/**
 * Scénarios de projet sauvegardés (jalon 8 de HORIZON_SPEC.md).
 *
 * Un arbitrage se décide rarement en une session : on chiffre une voiture
 * aujourd'hui, une autre la semaine prochaine, et c'est la comparaison qui
 * tranche. Sans mise de côté, chaque nouveau calcul écrase le précédent.
 *
 * Ce qui est enregistré, ce sont les **paramètres** et les résultats clés, pas
 * la projection complète : rejouer le moteur sur les paramètres redonne les
 * mêmes chiffres — il est déterministe et prend une graine fixe.
 */
/** Cellule d'un tableau comparatif, mise en valeur si elle porte le meilleur chiffre. */
function CelluleComparee({ libelle, valeur, meilleur, format }) {
  const gagnante = Number.isFinite(valeur) && valeur === meilleur;
  return (
    <td
      data-label={libelle}
      className={`py-1.5 px-2 text-right tabular-nums ${gagnante ? "text-emerald-400 font-semibold" : "text-slate-200"}`}
      title={gagnante ? "Meilleur de la comparaison" : undefined}
    >
      {format(valeur)}
    </td>
  );
}

export default function ScenariosProjet({ scenarios = [], onChange, courant }) {
  const [nom, setNom] = useState("");
  const [selection, setSelection] = useState([]);

  const enregistrer = (e) => {
    e.preventDefault();
    const libelle = nom.trim() || courant?.config?.libelle || "Scénario";
    onChange([...scenarios, { id: uid(), nom: libelle, date: todayIso(), ...courant }]);
    setNom("");
  };

  const supprimer = (id) => {
    onChange(scenarios.filter((s) => s.id !== id));
    setSelection((ids) => ids.filter((x) => x !== id));
  };

  const basculerComparaison = (id) =>
    setSelection((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 3 ? ids : [...ids, id]
    );

  const compares = scenarios.filter((s) => selection.includes(s.id));

  // Pour ces trois critères, plus bas vaut mieux. `null` (objectif jamais
  // atteint) n'est pas un minimum : c'est le pire cas, on l'écarte.
  const minimum = (cle) => {
    const valeurs = compares.map((s) => s.resultats?.[cle]).filter((v) => Number.isFinite(v));
    return valeurs.length > 0 ? Math.min(...valeurs) : null;
  };
  const meilleurs = {
    coutGlobal: minimum("coutGlobal"),
    effortMensuel: minimum("effortMensuel"),
    retardMois: minimum("retardMois"),
  };

  // Verdict : le scénario le moins cher globalement, sauf si un autre gagne
  // sur les trois critères à la fois — auquel cas il n'y a plus de compromis.
  const verdict = (() => {
    if (compares.length < 2 || meilleurs.coutGlobal == null) return null;
    const gagnantCout = compares.find((s) => s.resultats?.coutGlobal === meilleurs.coutGlobal);
    if (!gagnantCout) return null;
    const rafle =
      gagnantCout.resultats?.effortMensuel === meilleurs.effortMensuel &&
      gagnantCout.resultats?.retardMois === meilleurs.retardMois;
    return rafle
      ? `« ${gagnantCout.nom} » est meilleur sur les trois critères : aucun arbitrage à faire.`
      : `« ${gagnantCout.nom} » coûte le moins cher au total, mais pas sur tous les critères — regarde l'effort mensuel et le retard.`;
  })();

  return (
    <Card accent={CARD_THEMES.indigo}>
      <CardLabel icon={Save}>Projets mis de côté</CardLabel>

      <form onSubmit={enregistrer} className="flex gap-2 mb-4">
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder={`Nom du scénario (défaut : « ${courant?.config?.libelle ?? "Projet"} »)`}
          aria-label="Nom du scénario"
          className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-sm text-slate-100"
        />
        <button
          type="submit"
          className="text-xs px-3 py-1.5 rounded-lg border border-indigo-500/50 text-indigo-300 hover:bg-indigo-950/30 transition-colors"
        >
          Enregistrer
        </button>
      </form>

      {scenarios.length === 0 ? (
        <EmptyState>
          Aucun projet mis de côté. Enregistre une configuration pour la comparer plus tard.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {scenarios.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-200 truncate">{s.nom}</p>
                <p className="text-xs text-slate-500">
                  {eur(s.config?.prix)} · {s.config?.dureeDetention} ans ·{" "}
                  {s.config?.financement === "credit" ? "à crédit" : "comptant"} · {s.date}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => basculerComparaison(s.id)}
                  aria-label={`Comparer ${s.nom}`}
                  aria-pressed={selection.includes(s.id)}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    selection.includes(s.id)
                      ? "border-indigo-500 text-indigo-300"
                      : "border-slate-700 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <GitCompare size={13} />
                </button>
                <button
                  onClick={() => supprimer(s.id)}
                  aria-label={`Supprimer ${s.nom}`}
                  className="p-1.5 rounded-lg border border-slate-700 text-slate-500 hover:text-rose-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {compares.length >= 2 && (
        <div className="mt-4 pt-3 border-t border-slate-800">
          {/* Un tableau de chiffres bruts n'aide pas à trancher : le meilleur
              de chaque colonne est mis en évidence, et un verdict résume le
              tout. « Meilleur » = coût global le plus bas, effort mensuel le
              plus faible, retard sur objectif le plus court. */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs table-cards table-donnees">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-medium py-1.5 pr-3">Scénario</th>
                  <th className="text-right font-medium py-1.5 px-2">Coût global</th>
                  <th className="text-right font-medium py-1.5 px-2">Effort / mois</th>
                  <th className="text-right font-medium py-1.5 pl-2">Retard objectif</th>
                </tr>
              </thead>
              <tbody>
                {compares.map((s) => (
                  <tr key={s.id} className="border-t border-slate-800">
                    <td data-label="Scénario" className="py-1.5 pr-3 text-slate-300">{s.nom}</td>
                    <CelluleComparee
                      libelle="Coût global"
                      valeur={s.resultats?.coutGlobal}
                      meilleur={meilleurs.coutGlobal}
                      format={eur}
                    />
                    <CelluleComparee
                      libelle="Effort / mois"
                      valeur={s.resultats?.effortMensuel}
                      meilleur={meilleurs.effortMensuel}
                      format={eur}
                    />
                    <CelluleComparee
                      libelle="Retard objectif"
                      valeur={s.resultats?.retardMois}
                      meilleur={meilleurs.retardMois}
                      format={(v) => (v == null ? "non atteint" : `${Math.round(v)} mois`)}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {verdict && (
            <p className="text-xs text-emerald-300/90 mt-2.5 flex items-start gap-1.5">
              <Trophy size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>{verdict}</span>
            </p>
          )}

          <p className="text-xs text-slate-600 mt-2">
            Comparaison à hypothèses figées : les scénarios enregistrés à des dates différentes
            reposent sur le patrimoine du jour de leur enregistrement.
          </p>
        </div>
      )}

      {selection.length === 1 && (
        <p className="text-xs text-slate-600 mt-3">
          Sélectionne un second scénario pour afficher la comparaison.
        </p>
      )}
    </Card>
  );
}
