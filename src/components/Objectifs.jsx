import { useState } from "react";
import { Target, TrendingUp, TrendingDown, CheckCircle2, CalendarClock } from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, EmptyState, AddPanel, ProgressBar, CARD_THEMES } from "./ui";
import { eur, uid, todayIso } from "../lib/finance";
import { creerObjectif, evaluerObjectif, formaterDuree } from "../lib/objectifs";
import { useToast } from "../lib/ToastContext";

function formatEcheance(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function LigneObjectif({ objectif, etat, onSupprimer }) {
  const { atteint, enAvance, ecart, progressionPct, moisRestants, effortMensuelRequis, retardEstimeMois } = etat;

  const ton = atteint
    ? { texte: "text-emerald-400", fond: "bg-emerald-400" }
    : enAvance
      ? { texte: "text-emerald-400", fond: "bg-emerald-400" }
      : { texte: "text-amber-300", fond: "bg-amber-400" };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-slate-100 font-medium truncate">{objectif.libelle || "Objectif"}</div>
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
            <CalendarClock size={11} aria-hidden="true" />
            <span className="ghost-blur">{eur(objectif.cible)}</span>
            <span>pour {formatEcheance(objectif.echeance)}</span>
            {moisRestants > 0 && <span className="text-slate-600">· dans {formaterDuree(moisRestants)}</span>}
          </div>
        </div>
        <IconTrash onClick={onSupprimer} label={`Supprimer l'objectif ${objectif.libelle}`} />
      </div>

      <div className="mt-3">
        <ProgressBar value={progressionPct} accent={ton.fond} />
        <div className="flex items-center justify-between mt-1.5 text-[11px]">
          <span className="text-slate-500 font-data tabular-nums">{progressionPct.toFixed(0)} %</span>
          {atteint ? (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <CheckCircle2 size={11} aria-hidden="true" /> Objectif atteint
            </span>
          ) : (
            <span className={`flex items-center gap-1 ${ton.texte}`}>
              {enAvance ? <TrendingUp size={11} aria-hidden="true" /> : <TrendingDown size={11} aria-hidden="true" />}
              <span className="ghost-blur">{eur(Math.abs(ecart))}</span>
              {enAvance ? " d'avance" : " de retard"}
            </span>
          )}
        </div>
      </div>

      {!atteint && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-800/70 text-[11px] text-slate-500 space-y-1">
          {effortMensuelRequis != null && (
            <p>
              Pour tenir l'échéance :{" "}
              <span className="font-data tabular-nums text-slate-300 ghost-blur">
                {eur(effortMensuelRequis)}
              </span>{" "}
              par mois à partir de maintenant.
            </p>
          )}
          {retardEstimeMois != null && retardEstimeMois > 0 && (
            <p className="text-amber-300/90">
              Au rythme d'épargne actuel, l'objectif serait atteint avec{" "}
              {formaterDuree(retardEstimeMois)} de retard.
            </p>
          )}
          {retardEstimeMois != null && retardEstimeMois <= 0 && (
            <p className="text-emerald-400/90">
              Au rythme actuel, l'objectif sera atteint en avance.
            </p>
          )}
          {etat.moisJusquAtteinte == null && (
            <p>Sans épargne mensuelle ni rendement, l'objectif ne progresse plus.</p>
          )}
          {etat.echu && <p className="text-rose-400/90">Échéance dépassée.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Objectifs de patrimoine datés.
 *
 * L'application projetait et mesurait, mais sans cible à laquelle se comparer :
 * la courbe de patrimoine ne répondait pas à « suis-je en avance ou en
 * retard ? ». Chaque objectif fige son point de départ à la création, ce qui
 * rend l'avance ou le retard mesurable plutôt que déclaratif.
 */
export default function Objectifs({ objectifs = [], setObjectifs, patrimoineNet, epargneMensuelle, tauxAnnuelPct }) {
  const [ouvert, setOuvert] = useState(false);
  const { showToast } = useToast();

  const ajouter = (v) => {
    if (!v.echeance) return;
    setObjectifs((liste) => [
      ...liste,
      creerObjectif({
        id: uid(),
        libelle: v.libelle,
        cible: v.cible,
        echeance: v.echeance,
        patrimoineActuel: patrimoineNet,
      }),
    ]);
  };

  const supprimer = (id) => {
    const precedent = objectifs;
    const cible = objectifs.find((o) => o.id === id);
    setObjectifs((liste) => liste.filter((o) => o.id !== id));
    showToast({
      message: `Objectif « ${cible?.libelle || "sans nom"} » supprimé.`,
      onUndo: () => setObjectifs(precedent),
    });
  };

  const tries = [...objectifs].sort((a, b) => ((a.echeance || "9999") < (b.echeance || "9999") ? -1 : 1));

  return (
    <Card accent={CARD_THEMES.emerald}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <CardLabel icon={Target}>Objectifs de patrimoine</CardLabel>
        <GhostButton theme="emerald" onClick={() => setOuvert((o) => !o)}>
          Ajouter un objectif
        </GhostButton>
      </div>

      <AddPanel
        open={ouvert}
        onClose={() => setOuvert(false)}
        onSubmit={ajouter}
        fields={[
          { key: "libelle", label: "Libellé", type: "text", placeholder: "Apport résidence principale", required: true },
          { key: "cible", label: "Montant cible (€)", type: "number", step: "1000", required: true },
          { key: "echeance", label: "Échéance", type: "date", required: true, default: "" },
        ]}
      />

      {tries.length === 0 ? (
        <EmptyState>
          Aucun objectif — fixe une cible datée pour savoir si ta trajectoire est en avance ou en retard.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          {tries.map((o) => (
            <LigneObjectif
              key={o.id}
              objectif={o}
              etat={evaluerObjectif(o, {
                patrimoineActuel: patrimoineNet,
                epargneMensuelle,
                tauxAnnuelPct,
                aujourdhui: todayIso(),
              })}
              onSupprimer={() => supprimer(o.id)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
