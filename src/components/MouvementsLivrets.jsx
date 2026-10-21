import { useMemo, useState, useId } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Card, CardLabel, IconTrash, CARD_THEMES } from "./ui";
import { eur, lireNombre, todayIso } from "../lib/finance";
import { NATURES_MOUVEMENT, interetsQuinzaines, montantSigne } from "../lib/livretsMouvements";

/**
 * Mouvements d'un livret et intérêts calculés à la quinzaine.
 *
 * Le solde du jour reste la référence ; chaque dépôt, retrait ou intérêt
 * crédité enregistré ici permet de remonter le temps à partir de lui. Les
 * boutons +50 / −50 et la correction du solde, dans le tableau, en créent
 * aussi : l'historique se construit sans effort de saisie.
 */
const dateCourte = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export default function MouvementsLivrets({ livrets = [], onMouvement, onRetirerMouvement }) {
  const ids = useId();
  const [choisi, setChoisi] = useState(livrets[0]?.id ?? null);
  const livret = livrets.find((l) => l.id === choisi) || livrets[0];
  const [brouillon, setBrouillon] = useState({ date: todayIso(), nature: "depot", montant: "" });

  const aujourdhui = todayIso();
  const annee = Number(aujourdhui.slice(0, 4));
  const interets = useMemo(
    () => (livret ? interetsQuinzaines(livret, annee, { aujourdhui }) : null),
    [livret, annee, aujourdhui]
  );
  const anneePrecedente = useMemo(
    () => (livret && (livret.mouvements || []).some((m) => m.date < `${annee}-01-01`) ? interetsQuinzaines(livret, annee - 1) : null),
    [livret, annee]
  );

  if (!livret) return null;

  const enregistrer = (e) => {
    e.preventDefault();
    const montant = lireNombre(brouillon.montant);
    if (!Number.isFinite(montant) || montant === 0 || !brouillon.date) return;
    onMouvement(livret.id, { date: brouillon.date, nature: brouillon.nature, montant: brouillon.nature === "ajustement" ? montant : Math.abs(montant) });
    setBrouillon((b) => ({ ...b, montant: "" }));
  };

  const mouvements = [...(livret.mouvements || [])].reverse();
  const simple = (Number(livret.balance) || 0) * (Number(livret.rate) || 0);

  return (
    <Card accent={CARD_THEMES.indigo}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel icon={ArrowLeftRight}>Mouvements et intérêts</CardLabel>
        {livrets.length > 1 && (
          <select
            value={livret.id}
            onChange={(e) => setChoisi(e.target.value)}
            aria-label="Livret affiché"
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-400/60"
          >
            {livrets.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {interets && (
        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-micro text-slate-500 uppercase tracking-wide">Intérêts {annee}, à la quinzaine</div>
          <div className="font-data tabular-nums text-lg text-emerald-400 ghost-blur">{eur(interets.total, 2)}</div>
          <p className="text-micro text-slate-500 mt-0.5">
            {interets.estime ? (
              <>
                Dont <span className="ghost-blur">{eur(interets.acquis, 2)}</span> déjà courus ; la suite suppose le
                solde actuel jusqu&apos;au 31 décembre, date du crédit.{" "}
              </>
            ) : null}
            {interets.methode === "taux officiels"
              ? "Calculés aux taux officiels successifs de l'année."
              : "Calculés au taux saisi pour ce support."}{" "}
            Solde × taux donnerait <span className="ghost-blur">{eur(simple, 2)}</span>
            {Math.abs(simple - interets.total) >= 1 && " : l'écart vient des dates de valeur et des changements de taux"}.
          </p>
          {anneePrecedente && (
            <p className="text-micro text-slate-500 mt-1">
              {annee - 1} : <span className="ghost-blur">{eur(anneePrecedente.total, 2)}</span> d&apos;après tes mouvements —
              à comparer aux intérêts réellement crédités au 31 décembre.
            </p>
          )}
        </div>
      )}

      <form onSubmit={enregistrer} className="flex flex-wrap items-end gap-2 mt-3">
        <div>
          <label htmlFor={`${ids}-date`} className="block text-micro text-slate-500 mb-1">Date</label>
          <input
            id={`${ids}-date`}
            type="date"
            value={brouillon.date}
            onChange={(e) => setBrouillon((b) => ({ ...b, date: e.target.value }))}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-data focus:outline-none focus:border-indigo-400/60"
          />
        </div>
        <div>
          <label htmlFor={`${ids}-nature`} className="block text-micro text-slate-500 mb-1">Nature</label>
          <select
            id={`${ids}-nature`}
            value={brouillon.nature}
            onChange={(e) => setBrouillon((b) => ({ ...b, nature: e.target.value }))}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-400/60"
          >
            {Object.entries(NATURES_MOUVEMENT).map(([cle, n]) => (
              <option key={cle} value={cle}>
                {n.libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-montant`} className="block text-micro text-slate-500 mb-1">
            {brouillon.nature === "ajustement" ? "Écart (€, signé)" : "Montant (€)"}
          </label>
          <input
            id={`${ids}-montant`}
            type="number"
            step="0.01"
            value={brouillon.montant}
            onChange={(e) => setBrouillon((b) => ({ ...b, montant: e.target.value }))}
            className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-data focus:outline-none focus:border-indigo-400/60"
          />
        </div>
        <button
          type="submit"
          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
        >
          Enregistrer
        </button>
      </form>

      {mouvements.length === 0 ? (
        <p className="text-micro text-slate-500 mt-3">
          Aucun mouvement pour l&apos;instant. Les boutons +50 / −50 et la correction du solde, dans le tableau,
          en enregistrent automatiquement ; l&apos;historique se construit à partir d&apos;aujourd&apos;hui.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-800 border-t border-slate-800">
          {mouvements.slice(0, 12).map((m) => {
            const montant = montantSigne(m);
            return (
              <li key={m.id} className="flex items-center gap-3 py-1.5 text-xs">
                <span className="w-24 text-slate-500 font-data">{dateCourte(m.date)}</span>
                <span className="flex-1 text-slate-300">{NATURES_MOUVEMENT[m.nature]?.libelle || m.nature}</span>
                <span className={`font-data tabular-nums ghost-blur ${montant >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {montant >= 0 ? "+" : "−"}
                  {eur(Math.abs(montant), 2)}
                </span>
                <IconTrash onClick={() => onRetirerMouvement(livret.id, m.id)} label="Supprimer ce mouvement" />
              </li>
            );
          })}
          {mouvements.length > 12 && (
            <li className="py-1.5 text-micro text-slate-500">… et {mouvements.length - 12} plus anciens.</li>
          )}
        </ul>
      )}
    </Card>
  );
}
