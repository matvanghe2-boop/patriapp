import { useMemo, useState } from "react";
import { Tags, Sparkles, Check, Loader2 } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { MontantSigne } from "./OperationsCompte";
import { CATEGORIES, categorie } from "../lib/compteCourant";
import { aClasser, suggestionLocale, contexteCategories, lireReponseCategories } from "../lib/categorisationAssistee";
import { poserQuestion } from "../lib/horizonClient";

/**
 * « À classer » — les marchands restés en « Autres », avec une catégorie
 * proposée quand on en a une.
 *
 * La suggestion locale ne quitte jamais l'appareil. L'IA n'est appelée que sur
 * demande, pour les marchands sans suggestion, et ne reçoit que leurs noms.
 * Classer crée une RÈGLE : toutes les opérations de ce marchand, passées et à
 * venir, suivent.
 */

const VISIBLES = 6;

export default function ClasserOperations({ enrichies = [], onClasser }) {
  const groupes = useMemo(() => aClasser(enrichies), [enrichies]);
  const locales = useMemo(
    () => new Map(groupes.map((g) => [g.cle, suggestionLocale(g, enrichies)])),
    [groupes, enrichies]
  );
  const [ia, setIa] = useState({});
  const [choix, setChoix] = useState({});
  const [etatIa, setEtatIa] = useState({ enCours: false, message: "" });
  const [tout, setTout] = useState(false);

  if (groupes.length === 0) return null;

  const sansSuggestion = groupes.filter((g) => !locales.get(g.cle) && !ia[g.cle]);
  const affiches = tout ? groupes : groupes.slice(0, VISIBLES);

  const demanderIa = async () => {
    const { contexte, references } = contexteCategories(sansSuggestion.slice(0, 40));
    if (contexte.marchands.length === 0) return;
    setEtatIa({ enCours: true, message: "" });
    const reponse = await poserQuestion({ mode: "categories", question: "Classe ces marchands.", contexte });
    if (reponse.modeDegrade || reponse.erreur) {
      setEtatIa({ enCours: false, message: reponse.erreur || "L'IA n'a pas pu répondre." });
      return;
    }
    const lues = lireReponseCategories(reponse.contenu, references);
    setIa((x) => ({ ...x, ...lues }));
    const n = Object.keys(lues).length;
    setEtatIa({
      enCours: false,
      message: n ? `${n} suggestion${n > 1 ? "s" : ""} de l'IA, à vérifier avant de classer.` : "L'IA n'a rien proposé de sûr pour ces marchands.",
    });
  };

  return (
    <Card accent={CARD_THEMES.lime}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel icon={Tags}>À classer</CardLabel>
        <span className="text-micro text-slate-500">
          {groupes.length} marchand{groupes.length > 1 ? "s" : ""} en « Autres »
        </span>
      </div>
      <p className="text-mini text-slate-500 mt-1">
        Classer un marchand crée une règle : toutes ses opérations, passées et futures, suivent.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {affiches.map((g) => {
          const locale = locales.get(g.cle);
          const propose = choix[g.cle] || locale?.categorie || ia[g.cle] || "";
          const origine = choix[g.cle] ? null : locale ? locale.detail : ia[g.cle] ? "suggestion de l'IA" : null;
          const familles = g.sens === "debit" ? ["depense"] : ["revenu"];
          return (
            <li key={g.cle} className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-corps text-slate-100 truncate">{g.titre}</span>
                  <span className="block text-micro text-slate-500">
                    {g.nombre} opération{g.nombre > 1 ? "s" : ""} · dernière le{" "}
                    {new Date(`${g.derniere}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                <MontantSigne centimes={g.sens === "debit" ? -g.total : g.total} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`classer-${g.cle}`}>Catégorie pour {g.titre}</label>
                <select
                  id={`classer-${g.cle}`}
                  value={propose}
                  onChange={(e) => setChoix((c) => ({ ...c, [g.cle]: e.target.value }))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-lime-400/60"
                >
                  <option value="">Choisir une catégorie…</option>
                  {CATEGORIES.filter((c) => familles.includes(c.famille)).map((c) => (
                    <option key={c.id} value={c.id}>{c.libelle}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!propose}
                  onClick={() => onClasser?.(g, propose)}
                  className="btn-flash inline-flex items-center gap-1 rounded-lg border border-lime-500/40 bg-lime-500/10 px-2.5 py-1 text-xs text-lime-200 hover:bg-lime-500/20 disabled:opacity-40 disabled:cursor-default"
                >
                  <Check size={12} aria-hidden="true" /> Classer
                </button>
                {origine && propose && (
                  <span className="text-micro text-slate-500">
                    {categorie(propose).libelle} — {origine}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {groupes.length > VISIBLES && (
          <button type="button" onClick={() => setTout((t) => !t)} className="btn-flash text-mini text-slate-500 hover:text-slate-200">
            {tout ? "Réduire" : `Voir les ${groupes.length - VISIBLES} autres`}
          </button>
        )}
        {sansSuggestion.length > 0 && (
          <button
            type="button"
            onClick={demanderIa}
            disabled={etatIa.enCours}
            className="btn-flash inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:text-slate-100 disabled:opacity-60"
          >
            {etatIa.enCours ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}
            Suggérer avec l'IA ({sansSuggestion.length})
          </button>
        )}
      </div>
      {sansSuggestion.length > 0 && (
        <p className="text-micro text-slate-500 mt-2">
          Seuls les noms des marchands sont envoyés à l'IA : ni montant, ni date, ni virement vers une personne.
        </p>
      )}
      {etatIa.message && <p className="text-micro text-slate-400 mt-1" role="status">{etatIa.message}</p>}
    </Card>
  );
}
