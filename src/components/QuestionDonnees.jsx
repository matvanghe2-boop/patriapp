import { useMemo, useRef, useState } from "react";
import { MessageCircleQuestion, Send, Loader2, ShieldCheck, ChevronDown } from "lucide-react";
import Modal from "./Modal";
import { usePatrimoine } from "../lib/PatrimoineContext";
import { construireContexteDonnees, rendreReponse } from "../lib/contexteDonnees";
import { poserQuestion } from "../lib/horizonClient";

/**
 * « Poser une question à mes données » — depuis n'importe quel onglet.
 *
 * Les écrans répondent aux questions qu'on a prévues pour eux ; celle-ci
 * répond aux autres : « combien en restauration depuis septembre ? », « quelle
 * ligne m'a versé le plus de dividendes ? ».
 *
 * Même route et mêmes garde-fous que l'assistant Horizon : contexte construit
 * et audité ici, sans aucun nom (alias) et, par défaut, sans aucun euro
 * (points). Ce qui part est affichable tel quel, d'un clic.
 */

const SUGGESTIONS = [
  "Combien ai-je dépensé en restauration ces trois derniers mois ?",
  "Quelle ligne de mon portefeuille m'a versé le plus de dividendes ?",
  "Quel abonnement me coûte le plus cher ?",
  "Mon taux d'épargne progresse-t-il ?",
];

export default function QuestionDonnees({ ouvert, onFermer }) {
  const patrimoine = usePatrimoine();
  const montantsReels = patrimoine.horizonReglages?.montantsReels === true;
  const [saisie, setSaisie] = useState("");
  const [echanges, setEchanges] = useState([]);
  const [enCours, setEnCours] = useState(false);
  const [voirContexte, setVoirContexte] = useState(false);
  const champRef = useRef(null);

  // Recalculé à chaque ouverture seulement : il dépend de tout l'état, et rien
  // ne sert de le reconstruire pendant qu'on tape.
  const donnees = useMemo(
    () => (ouvert ? construireContexteDonnees(patrimoine, { montantsReels }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ouvert, montantsReels]
  );

  const envoyer = async (texte) => {
    const question = (texte ?? saisie).trim();
    if (!question || enCours || !donnees) return;
    setSaisie("");
    if (!donnees.audit.sain) {
      setEchanges((e) => [...e, { question, erreur: "Le contexte n'a pas passé le contrôle d'anonymisation : rien n'a été envoyé." }]);
      return;
    }
    setEnCours(true);
    const reponse = await poserQuestion({ mode: "donnees", question, contexte: donnees.contexte, montantsReels });
    setEnCours(false);
    if (reponse.modeDegrade || reponse.erreur) {
      setEchanges((e) => [...e, { question, erreur: reponse.erreur || "L'assistant n'a pas pu répondre." }]);
      return;
    }
    setEchanges((e) => [
      ...e,
      { question, reponse: rendreReponse(reponse.contenu, { alias: donnees.alias, facteur: donnees.facteur, montantsReels }) },
    ]);
    champRef.current?.focus();
  };

  return (
    <Modal
      open={ouvert}
      onClose={onFermer}
      label="Poser une question à mes données"
      showClose
      panelClassName="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      <div className="p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg text-slate-50">
            <MessageCircleQuestion size={18} className="text-emerald-300" aria-hidden="true" />
            Poser une question à mes données
          </h2>
          <p className="flex items-start gap-1.5 text-micro text-slate-500 mt-1">
            <ShieldCheck size={12} className="mt-0.5 shrink-0 etat-ok" aria-hidden="true" />
            <span>
              Aucun nom ne part : tes lignes et abonnements deviennent des alias.{" "}
              {montantsReels
                ? "Les montants partent en euros réels (réglage choisi dans Simulation › Projet)."
                : "Aucun euro non plus : les montants sont convertis en points, puis reconvertis ici."}
            </span>
          </p>
        </div>

        {echanges.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => envoyer(s)}
                className="btn-flash rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:text-slate-100 hover:border-slate-500"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {echanges.length > 0 && (
          <ol className="flex flex-col gap-3" aria-live="polite">
            {echanges.map((e, i) => (
              <li key={i} className="flex flex-col gap-1.5">
                <p className="self-end max-w-[85%] rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-100">{e.question}</p>
                <p
                  className={`max-w-[95%] rounded-xl border px-3 py-2 text-sm whitespace-pre-wrap ${
                    e.erreur ? "border-amber-500/30 bg-amber-500/5 text-amber-200" : "border-slate-800 bg-slate-950/60 text-slate-200 ghost-blur"
                  }`}
                >
                  {e.erreur || e.reponse}
                </p>
              </li>
            ))}
          </ol>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); envoyer(); }}
          className="flex items-end gap-2"
        >
          <label htmlFor="question-donnees" className="sr-only">Ta question</label>
          <textarea
            id="question-donnees"
            ref={champRef}
            rows={2}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                envoyer();
              }
            }}
            placeholder="Ex : combien m'ont coûté mes abonnements cette année ?"
            className="flex-1 resize-none bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400/60"
          />
          <button
            type="submit"
            disabled={enCours || !saisie.trim()}
            aria-label="Envoyer la question"
            className="btn-flash flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-400 text-slate-950 hover:bg-emerald-300 disabled:opacity-40"
          >
            {enCours ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
          </button>
        </form>

        {donnees && (
          <div>
            <button
              type="button"
              onClick={() => setVoirContexte((v) => !v)}
              aria-expanded={voirContexte}
              className="btn-flash flex items-center gap-1 text-micro text-slate-500 hover:text-slate-300"
            >
              Voir exactement ce qui est envoyé
              <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${voirContexte ? "rotate-180" : ""}`} />
            </button>
            {voirContexte && (
              <pre className="mt-2 max-h-60 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-micro text-slate-400 whitespace-pre-wrap">
                {JSON.stringify(donnees.contexte, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
