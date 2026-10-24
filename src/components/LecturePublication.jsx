import { AlertTriangle, ListChecks, Sparkles } from "lucide-react";
import { bilanCriteres } from "../../shared/interpretationResultats.js";

/**
 * Lecture d'une publication : la grille de critères, puis l'interprétation.
 *
 * L'ordre n'est pas décoratif. La grille vient d'abord parce qu'elle est
 * CALCULÉE — chaque verdict compare un chiffre recopié du communiqué à
 * l'historique de la société, selon un seuil écrit — et que la phrase qui
 * la justifie peut être refaite à la main. L'interprétation, rédigée par le
 * modèle à partir de cette grille, vient ensuite : elle explique, elle ne
 * juge pas.
 *
 * Un verdict « favorable » dit qu'un indicateur est meilleur que l'habitude
 * de la société, pas qu'il faut acheter le titre.
 */

const VERDICTS = {
  favorable: {
    libelle: "Favorable",
    classe: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    point: "bg-emerald-400",
  },
  neutre: {
    libelle: "Neutre",
    classe: "border-slate-600 bg-slate-800/60 text-slate-300",
    point: "bg-slate-400",
  },
  defavorable: {
    libelle: "Défavorable",
    classe: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    point: "bg-rose-400",
  },
};

function LigneCritere({ critere }) {
  const v = VERDICTS[critere.verdict] || VERDICTS.neutre;
  return (
    <li className="py-1.5 border-b border-slate-800/60 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-micro text-slate-200 font-medium">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.point}`} aria-hidden="true" />
          {critere.libelle}
        </span>
        <span className={`text-micro px-1.5 py-0.5 rounded border shrink-0 ${v.classe}`}>{v.libelle}</span>
      </div>
      <p className="text-micro text-slate-400 mt-0.5">{critere.constat}</p>
    </li>
  );
}

function Liste({ titre, elements, couleur }) {
  if (!elements?.length) return null;
  return (
    <div className="mt-2">
      <div className={`text-micro font-medium ${couleur}`}>{titre}</div>
      <ul className="mt-0.5 flex flex-col gap-0.5">
        {elements.map((e, i) => (
          <li key={i} className="text-micro text-slate-300">
            • {e}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LecturePublication({
  criteres = [],
  interpretation = null,
  contexte = null,
  precaution = null,
}) {
  if (!criteres.length && !interpretation) return null;

  const evalues = criteres.filter((c) => c.verdict !== "non_evaluable");
  const manquants = criteres.filter((c) => c.verdict === "non_evaluable");
  const bilan = bilanCriteres(criteres);

  return (
    <div className="mt-3 flex flex-col gap-3">
      {criteres.length > 0 && (
        <section aria-label="Lecture selon des critères financiers">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-micro uppercase tracking-wider text-slate-500">
              <ListChecks size={12} aria-hidden="true" /> Critères financiers
            </span>
            <span className="text-micro text-slate-500 font-data">
              <span className="text-emerald-300">{bilan.favorable}</span> ·{" "}
              <span className="text-slate-300">{bilan.neutre}</span> ·{" "}
              <span className="text-rose-300">{bilan.defavorable}</span>
            </span>
          </div>

          {/* Une seule fois, pour toute la grille : un semestre comparé à des
              exercices complets. */}
          {precaution && <p className="text-micro text-amber-300/80 mt-1">{precaution}</p>}

          {evalues.length > 0 && (
            <ul className="mt-1">
              {evalues.map((c) => (
                <LigneCritere key={c.cle} critere={c} />
              ))}
            </ul>
          )}

          {/* Ce qui n'a pas pu être jugé est dit, pas caché : un verdict
              absent n'est pas un verdict neutre. */}
          {manquants.length > 0 && (
            <details className="mt-1.5">
              <summary className="text-micro text-slate-500 cursor-pointer">
                Non évaluables : {manquants.map((c) => c.libelle).join(", ")}
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {manquants.map((c) => (
                  <li key={c.cle} className="text-micro text-slate-500">
                    {c.libelle} — {c.constat}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-micro text-slate-600 mt-1.5">
            {contexte?.nbExercices
              ? `Comparé à ${contexte.nbExercices} exercice(s) publiés (${contexte.periode}), ceux de la fiche Marché.`
              : "Historique de la société indisponible : les critères qui en dépendent ne sont pas évalués."}
          </p>
        </section>
      )}

      {interpretation && (
        <section aria-label="Interprétation">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-micro uppercase tracking-wider text-slate-500">
              <Sparkles size={12} aria-hidden="true" /> Interprétation
            </span>
            {interpretation.fiable === false && (
              <span
                className="flex items-center gap-1 text-micro text-amber-300"
                title="Le modèle a cité au moins un chiffre absent du communiqué et de l'historique : à lire avec prudence."
              >
                <AlertTriangle size={11} aria-hidden="true" /> incertaine
              </span>
            )}
          </div>
          {interpretation.lecture && <p className="text-sm text-slate-300 mt-1">{interpretation.lecture}</p>}
          <Liste titre="Points solides" elements={interpretation.forces} couleur="text-emerald-300/90" />
          <Liste
            titre="Points de vigilance"
            elements={interpretation.vigilance}
            couleur="text-amber-300/90"
          />
          <Liste titre="À surveiller" elements={interpretation.aSurveiller} couleur="text-slate-400" />
        </section>
      )}
    </div>
  );
}
