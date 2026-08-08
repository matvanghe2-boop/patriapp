import { useState, useRef } from "react";
import { Sparkles, Send, ChevronDown, ChevronUp, AlertTriangle, HelpCircle, Loader2 } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { poserQuestion } from "../lib/horizonClient";
import { eur } from "../lib/finance";

/**
 * Assistant conversationnel d'Horizon (jalon 5 de HORIZON_SPEC.md).
 *
 * Pose une question en langage naturel ; l'orchestrateur serveur enchaîne les
 * appels d'outils et renvoie une réponse chiffrée accompagnée du journal des
 * calculs. Aucun chiffre affiché ici n'est produit par le modèle : ils viennent
 * tous de `horizon.js` et sont visibles ligne à ligne dans le journal.
 *
 * Le modèle raisonne en base 100 ; le taux de conversion est rappelé en
 * permanence pour que la réponse reste lisible en euros.
 *
 * Le mode dégradé n'est pas une panne : quand aucun fournisseur gratuit n'est
 * joignable, l'assistant s'efface et les formulaires au-dessus suffisent.
 */

const SUGGESTIONS = [
  "Quel serait l'impact d'une voiture à 28 000 € sur mon apport ?",
  "Vaut-il mieux acheter comptant ou à crédit ?",
  "Combien dois-je épargner par mois pour tenir mon objectif ?",
];

export default function AssistantHorizon({ contexte, facteurBase100 = 0 }) {
  const [messages, setMessages] = useState([]);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [degrade, setDegrade] = useState(null);
  const [question, setQuestion] = useState(null);
  const [journalOuvert, setJournalOuvert] = useState(false);
  const historiqueRef = useRef([]);

  const envoyer = async (texte) => {
    const contenu = (texte ?? saisie).trim();
    if (!contenu || enCours) return;

    setSaisie("");
    setQuestion(null);
    setEnCours(true);
    setMessages((m) => [...m, { role: "utilisateur", contenu }]);

    const reponse = await poserQuestion({
      question: contenu,
      contexte,
      historique: historiqueRef.current,
    });

    setEnCours(false);

    if (reponse.modeDegrade) {
      setDegrade(reponse.erreur);
      return;
    }
    if (reponse.erreur) {
      setMessages((m) => [...m, { role: "assistant", contenu: reponse.erreur, estErreur: true }]);
      return;
    }

    if (reponse.type === "question") {
      historiqueRef.current = reponse.historique ?? historiqueRef.current;
      setQuestion(reponse.question);
      setMessages((m) => [...m, { role: "assistant", contenu: reponse.question?.question, estQuestion: true }]);
      return;
    }

    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        contenu: reponse.contenu,
        journal: reponse.journal ?? [],
        fournisseur: reponse.fournisseur,
        plafondAtteint: reponse.plafondAtteint,
      },
    ]);
  };

  if (degrade) {
    return (
      <Card accent={CARD_THEMES.amber}>
        <CardLabel icon={AlertTriangle}>Assistant indisponible</CardLabel>
        <p className="text-sm text-slate-400">{degrade}</p>
        <p className="text-xs text-slate-500 mt-2">
          Les formulaires ci-dessus produisent exactement les mêmes calculs : seule la question en
          langage naturel est momentanément hors service.
        </p>
      </Card>
    );
  }

  const dernier = [...messages].reverse().find((m) => m.journal?.length);

  return (
    <Card accent={CARD_THEMES.violet}>
      <div className="flex items-center justify-between mb-3">
        <CardLabel icon={Sparkles}>Demander à l&apos;assistant</CardLabel>
        {facteurBase100 > 0 && (
          <span className="text-xs text-slate-600">1 point = {eur(facteurBase100)}</span>
        )}
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => envoyer(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-400 hover:border-violet-500/60 hover:text-slate-200 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3 mb-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl px-4 py-3 text-sm ${
              m.role === "utilisateur"
                ? "bg-slate-800/60 text-slate-200 ml-8"
                : m.estErreur
                  ? "bg-rose-950/30 border border-rose-500/40 text-rose-200"
                  : m.estQuestion
                    ? "bg-amber-950/20 border border-amber-500/40 text-amber-100"
                    : "bg-slate-950/60 border border-slate-800 text-slate-300 mr-8"
            }`}
          >
            {m.estQuestion && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-1">
                <HelpCircle size={13} /> Information manquante
              </div>
            )}
            <p className="whitespace-pre-wrap">{m.contenu}</p>
            {m.plafondAtteint && (
              <p className="text-xs text-amber-500/80 mt-2">
                Raisonnement interrompu : nombre d&apos;étapes maximal atteint.
              </p>
            )}
            {m.fournisseur && (
              <p className="text-xs text-slate-600 mt-2">Réponse générée par {m.fournisseur}</p>
            )}
          </div>
        ))}

        {enCours && (
          <div className="flex items-center gap-2 text-xs text-slate-500 px-4">
            <Loader2 size={13} className="animate-spin" />
            Calculs en cours…
          </div>
        )}
      </div>

      {question?.options?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {question.options.map((o) => (
            <button
              key={o}
              onClick={() => envoyer(o)}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/50 text-amber-200 hover:bg-amber-950/30 transition-colors"
            >
              {o}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          envoyer();
        }}
        className="flex gap-2"
      >
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Pose ta question…"
          aria-label="Question à l'assistant"
          disabled={enCours}
          className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={enCours || !saisie.trim()}
          aria-label="Envoyer"
          className="px-3 rounded-lg border border-violet-500/50 text-violet-300 hover:bg-violet-950/30 disabled:opacity-40 transition-colors"
        >
          <Send size={15} />
        </button>
      </form>

      {/* Journal des calculs — ce qui rend la réponse auditable. */}
      {dernier && (
        <div className="mt-4 pt-3 border-t border-slate-800">
          <button
            onClick={() => setJournalOuvert((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {journalOuvert ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Journal des calculs ({dernier.journal.length} appel{dernier.journal.length > 1 ? "s" : ""})
          </button>
          {journalOuvert && (
            <div className="mt-2 space-y-2">
              {dernier.journal.map((appel, i) => (
                <details key={i} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <summary className="text-xs text-slate-400 cursor-pointer">{appel.outil}</summary>
                  <pre className="mt-2 text-[11px] text-slate-500 overflow-x-auto">
                    {JSON.stringify({ entrees: appel.entrees, sorties: appel.sorties }, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-slate-600 mt-3">
        Tous les chiffres proviennent du moteur de calcul, jamais du modèle. Le journal ci-dessus
        détaille chaque opération.
      </p>
    </Card>
  );
}
