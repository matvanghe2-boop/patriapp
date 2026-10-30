import { useMemo, useState } from "react";
import { ListChecks, NotebookPen, FileText, Repeat, PiggyBank, Wallet, ChevronRight, CircleCheck } from "lucide-react";
import { Card, CardLabel, PastilleEtat, CARD_THEMES } from "./ui";
import { elementsAFaire } from "../lib/aFaire";
import { allerVers } from "../lib/useHashRoute";
import { usePersistentState } from "../lib/storage";

/**
 * Centre « À faire » — tout ce qui demande une action, tous onglets
 * confondus, trié par urgence. Chaque ligne mène à l'onglet et au
 * sous-onglet où l'on agit (voir `allerVers`).
 *
 * Il remplace le panneau d'actions prioritaires, qui ne connaissait que trois
 * signaux (livret plein, cash dormant, matelas faible) : thèses, contrats,
 * essais et prélèvements du relevé restaient invisibles depuis l'accueil.
 */

const ICONES = { these: NotebookPen, contrat: FileText, abonnement: Repeat, epargne: PiggyBank, bourse: Wallet };
const LIBELLES_URGENCE = { critique: "Urgent", attention: "Bientôt", info: "À voir" };
const ETAT = { critique: "critique", attention: "attention", info: "neutre" };
const VISIBLES = 5;

export default function CentreAFaire({
  livrets, bourse, matelasMois, tauxReference, strategyNotes, subs, contracts, compteEnrichies,
}) {
  // Lus ici plutôt que reçus : ces deux clés appartiennent aux onglets Bourse
  // et Abonnements, et le Dashboard n'a aucune raison de les connaître.
  const [series] = usePersistentState("bourseSeriesCours", {});
  const [ignores] = usePersistentState("abonnementsIgnores", []);
  const [tout, setTout] = useState(false);

  const elements = useMemo(
    () =>
      elementsAFaire({
        livrets, bourse, matelasMois, tauxReference, strategyNotes, subs, contracts, compteEnrichies, series, ignores,
      }),
    [livrets, bourse, matelasMois, tauxReference, strategyNotes, subs, contracts, compteEnrichies, series, ignores]
  );
  const affiches = tout ? elements : elements.slice(0, VISIBLES);
  const urgents = elements.filter((e) => e.urgence === "critique").length;

  if (elements.length === 0) {
    return (
      <Card role="ambiant" accent={CARD_THEMES.emerald}>
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <CircleCheck size={15} className="etat-ok shrink-0" aria-hidden="true" />
          Rien ne demande ton attention aujourd'hui : thèses, contrats, abonnements et épargne sont à jour.
        </p>
      </Card>
    );
  }

  return (
    <Card accent={CARD_THEMES.emerald}>
      <div className="flex items-center justify-between gap-3">
        <CardLabel icon={ListChecks}>À faire</CardLabel>
        <span className="text-micro text-slate-500">
          {elements.length} élément{elements.length > 1 ? "s" : ""}
          {urgents > 0 && <> · <span className="etat-critique">{urgents} urgent{urgents > 1 ? "s" : ""}</span></>}
        </span>
      </div>

      <ul className="flex flex-col gap-1.5 mt-3">
        {affiches.map((e) => {
          const Icone = ICONES[e.type] || ListChecks;
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => allerVers(e.lien.onglet, e.lien.sous)}
                className="btn-flash w-full flex items-center gap-3 text-left rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 hover:border-slate-700 hover:bg-slate-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
              >
                <Icone size={15} className={`shrink-0 etat-${ETAT[e.urgence]}`} aria-hidden="true" />
                <span className={`flex-1 min-w-0 text-sm text-slate-300 ${e.sensible ? "ghost-blur" : ""}`}>{e.texte}</span>
                <PastilleEtat etat={ETAT[e.urgence]} className="hidden sm:inline-flex shrink-0">
                  {LIBELLES_URGENCE[e.urgence]}
                </PastilleEtat>
                <ChevronRight size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      {elements.length > VISIBLES && (
        <button
          type="button"
          onClick={() => setTout((t) => !t)}
          className="btn-flash text-mini text-slate-500 hover:text-slate-200 mt-3"
        >
          {tout ? "Réduire" : `Voir les ${elements.length - VISIBLES} autres`}
        </button>
      )}
    </Card>
  );
}
