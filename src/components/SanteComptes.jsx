import { Repeat, ShieldCheck, Crosshair, Check, X, Minus } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { nombre, pct, pctPlain } from "../lib/finance";
import { evolutionNombreActions, rendementActionnaire } from "../lib/actionnariat";
import { notePiotroski, lectureNote } from "../lib/piotroski";

/**
 * Trois lectures des comptes publiés, affichées dans la fiche financière :
 * ce que la société rend à ses actionnaires, sa note de solidité, et ses
 * résultats face aux prévisions. Chacune disparaît quand la source ne la
 * permet pas, plutôt que d'afficher une carte vide.
 */

const TONS = { favorable: "text-emerald-400", defavorable: "text-rose-400", neutre: "text-slate-300" };

/** Un nombre d'actions, pas un montant : « 2,48 milliards », « 16,4 millions ». */
const nombreActions = (n) =>
  n >= 1e9 ? `${nombre(n / 1e9, 2)} milliards` : n >= 1e6 ? `${nombre(n / 1e6, n < 1e8 ? 1 : 0)} millions` : nombre(n, 0);

// ─── Rachats d'actions et dilution ─────────────────────────────────────────

export function RachatsActions({ historique = [], capitalisation, facteurComptes, deviseComptes }) {
  const evolution = evolutionNombreActions(historique);
  const rendement = rendementActionnaire(historique, capitalisation, facteurComptes);
  if (!evolution && !rendement?.totalPct) return null;

  const max = evolution ? Math.max(...evolution.points.map((p) => p.nombre)) : 0;
  const phrase = !evolution
    ? null
    : evolution.sens === "rachats"
      ? "La société rachète ses titres : chaque action détient une part plus grosse de l'entreprise."
      : evolution.sens === "dilution"
        ? "La société émet des actions nouvelles : la part de chaque action se dilue."
        : "Nombre d'actions quasi stable : ni rachat massif, ni dilution.";

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={Repeat}>Rachats d&apos;actions et dilution</CardLabel>

      {evolution && (
        <>
          <p className="text-sm text-slate-300 mt-1">
            {nombreActions(evolution.debut.nombre)} → {nombreActions(evolution.fin.nombre)} d&apos;actions entre {evolution.debut.exercice} et{" "}
            {evolution.fin.exercice} :{" "}
            <span className={`font-data ${evolution.sens === "rachats" ? "text-emerald-400" : evolution.sens === "dilution" ? "text-rose-400" : "text-slate-200"}`}>
              {pct(evolution.variationPct, 1)}
            </span>
            {evolution.variationAnnuellePct != null && (
              <span className="text-slate-500"> ({pct(evolution.variationAnnuellePct, 1)} par an)</span>
            )}
            .
          </p>
          <p className="text-micro text-slate-500 mt-0.5">{phrase}</p>
          <div className="flex items-end gap-2 h-16 mt-3" aria-hidden="true">
            {evolution.points.map((p) => (
              <div key={p.exercice} className="flex-1 flex flex-col items-center gap-1">
                {/* Échelle resserrée : sur quatre ans, l'écart se compte en
                    pour cent, invisible sur une échelle partant de zéro. */}
                <div
                  className="w-full rounded-t bg-violet-400/70"
                  style={{ height: `${Math.max(8, 30 + 70 * (1 - (max - p.nombre) / (max * 0.2)))}%` }}
                />
                <span className="text-micro text-slate-500 font-data">{p.exercice}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {rendement?.totalPct != null && (
        <div className="mt-4 pt-3 border-t border-slate-800">
          <div className="text-micro uppercase tracking-wide text-slate-500 mb-1">
            Rendu aux actionnaires en {rendement.exercice}, rapporté à la capitalisation actuelle
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
            <span>
              <span className="text-slate-500">Dividendes </span>
              <span className="font-data text-slate-200">{rendement.dividendesPct != null ? pctPlain(rendement.dividendesPct, 1) : "non publié"}</span>
            </span>
            <span>
              <span className="text-slate-500">+ rachats </span>
              <span className="font-data text-slate-200">{rendement.rachatsPct != null ? pctPlain(rendement.rachatsPct, 1) : "non publié"}</span>
            </span>
            <span>
              <span className="text-slate-500">= </span>
              <span className="font-data font-semibold text-emerald-300">{pctPlain(rendement.totalPct, 1)}</span>
            </span>
          </div>
          {deviseComptes && facteurComptes !== 1 && (
            <p className="text-micro text-slate-500 mt-1">Comptes publiés en {deviseComptes}, convertis au taux du jour.</p>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Note de Piotroski ─────────────────────────────────────────────────────

const GROUPES = [
  { cle: "rentabilite", libelle: "Rentabilité" },
  { cle: "structure", libelle: "Structure financière" },
  { cle: "efficacite", libelle: "Efficacité" },
];

const SECTEURS_FINANCIERS = ["Financial Services"];

export function NotePiotroski({ historique = [], secteur }) {
  const note = notePiotroski(historique);
  if (!note) return null;
  const { actuelle, precedente } = note;
  const lecture = lectureNote(actuelle);

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={ShieldCheck}>Note de solidité (Piotroski)</CardLabel>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1">
        <span className={`font-display text-3xl font-data ${TONS[lecture.ton]}`}>
          {actuelle.score}
          <span className="text-base text-slate-500"> / {actuelle.evalues}</span>
        </span>
        <span className="text-sm text-slate-300">
          exercice {actuelle.exercice} — {lecture.libelle}
        </span>
        {precedente && (
          <span className="text-micro text-slate-500">
            ({precedente.score} / {precedente.evalues} en {precedente.exercice})
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        {GROUPES.map((g) => (
          <div key={g.cle}>
            <div className="text-micro uppercase tracking-wide text-slate-500 mb-1">{g.libelle}</div>
            <ul className="flex flex-col gap-1">
              {actuelle.criteres
                .filter((c) => c.groupe === g.cle)
                .map((c) => (
                  <li key={c.cle} className="flex items-start gap-1.5 text-xs">
                    {c.ok == null ? (
                      <Minus size={13} className="text-slate-500 shrink-0 mt-0.5" aria-label="non évaluable" />
                    ) : c.ok ? (
                      <Check size={13} className="text-emerald-400 shrink-0 mt-0.5" aria-label="rempli" />
                    ) : (
                      <X size={13} className="text-rose-400 shrink-0 mt-0.5" aria-label="non rempli" />
                    )}
                    <span className={c.ok == null ? "text-slate-500" : "text-slate-300"}>{c.libelle}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-micro text-slate-500 mt-3">
        Neuf critères comparant l&apos;exercice {actuelle.exercice} au précédent ; un point par critère rempli. Un tiret signale
        une donnée absente de la source : le critère n&apos;est compté ni réussi ni raté.
        {SECTEURS_FINANCIERS.includes(secteur) &&
          " Pour une banque ou un assureur, cette note se lit mal : ni stocks, ni marge brute, ni liquidité au sens industriel."}
      </p>
    </Card>
  );
}

// ─── Résultats face aux prévisions ─────────────────────────────────────────

export function SurprisesResultats({ surprises = [], deviseComptes }) {
  if (!surprises?.length) return null;
  const battus = surprises.filter((s) => s.bpaPublie > s.bpaEstime).length;
  const avecEcart = surprises.filter((s) => s.surprisePct != null);
  const moyenne = avecEcart.length ? avecEcart.reduce((s, x) => s + x.surprisePct, 0) / avecEcart.length : null;
  const max = Math.max(...surprises.flatMap((s) => [Math.abs(s.bpaEstime), Math.abs(s.bpaPublie)]));

  return (
    <Card accent={CARD_THEMES.amber}>
      <CardLabel icon={Crosshair}>Résultats publiés face aux prévisions</CardLabel>
      <p className="text-sm text-slate-300 mt-1">
        Au-dessus des attentes {battus} fois sur {surprises.length}
        {moyenne != null && (
          <>
            {" "}— écart moyen <span className={`font-data ${moyenne >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pct(moyenne, 1)}</span>
          </>
        )}
        .
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        {surprises.map((s) => (
          <div key={s.finTrimestre} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-micro text-slate-500">
              Trimestre clos le {new Date(`${s.finTrimestre}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
            </div>
            <div className="flex items-end gap-1.5 h-14 mt-2" aria-hidden="true">
              <div className="flex-1 rounded-t bg-slate-600" style={{ height: `${(Math.abs(s.bpaEstime) / max) * 100}%` }} title="Attendu" />
              <div
                className={`flex-1 rounded-t ${s.bpaPublie >= s.bpaEstime ? "bg-emerald-400" : "bg-rose-400"}`}
                style={{ height: `${(Math.abs(s.bpaPublie) / max) * 100}%` }}
                title="Publié"
              />
            </div>
            <div className="text-micro text-slate-400 mt-1.5 font-data tabular-nums">
              {nombre(s.bpaEstime, 2)} attendu · {nombre(s.bpaPublie, 2)} publié
            </div>
            {s.surprisePct != null && (
              <div className={`text-micro font-data ${s.surprisePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pct(s.surprisePct, 1)}</div>
            )}
          </div>
        ))}
      </div>

      <p className="text-micro text-slate-500 mt-3">
        Bénéfice par action du trimestre{deviseComptes ? `, en ${deviseComptes}` : ""}, attendu par le consensus puis publié. La
        source ne donne pas la date de publication : la réaction du cours à l&apos;annonce n&apos;est donc pas mesurée.
      </p>
    </Card>
  );
}
