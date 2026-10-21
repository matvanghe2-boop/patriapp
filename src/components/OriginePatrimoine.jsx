import { useMemo } from "react";
import { Layers } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { eur, pctPlain, todayIso } from "../lib/finance";
import { origineDuPatrimoine, regulariteVersements } from "../lib/cascade";

/**
 * D'où vient ton patrimoine : ton épargne, ou le marché ?
 *
 * La cascade le dit mois par mois ; ce bloc fait le compte depuis le début.
 * C'est souvent la réponse la plus utile à un épargnant qui débute : les
 * premières années, presque tout vient de ce qu'on met de côté — et c'est
 * normal, le marché ne travaille qu'avec ce qu'on lui confie.
 */

const dateLongue = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default function OriginePatrimoine({ historique = [], bourseHistory = [], bourse }) {
  const aDesPositions = (bourse?.positions || []).length > 0;
  const origine = useMemo(
    () => origineDuPatrimoine({ historique, bourseHistory, aDesPositions }),
    [historique, bourseHistory, aDesPositions]
  );
  const regularite = useMemo(
    () => regulariteVersements(bourse?.operations || [], todayIso()),
    [bourse?.operations]
  );

  const positifs = origine ? Math.max(0, origine.epargne) + Math.max(0, origine.marche) : 0;
  const partEpargne = positifs > 0 ? (Math.max(0, origine.epargne) / positifs) * 100 : 0;

  return (
    <Card accent={CARD_THEMES.emerald}>
      <CardLabel icon={Layers}>D&apos;où vient ton patrimoine</CardLabel>

      {!origine ? (
        <p className="text-micro text-slate-500 mt-1">
          Il faut quelques relevés du patrimoine ET du portefeuille — actualise les cours de temps en temps
          — pour séparer ton épargne de ce qu&apos;a fait le marché.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-200 mt-1">
            Depuis le {dateLongue(origine.depuis)}, ton patrimoine a{" "}
            {origine.variation >= 0 ? "augmenté" : "baissé"} de{" "}
            <span className="font-data tabular-nums ghost-blur">{eur(Math.abs(origine.variation))}</span>.
          </p>

          {positifs > 0 && (
            <div className="mt-3">
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-800" aria-hidden="true">
                <span className="bg-sky-400" style={{ width: `${partEpargne}%` }} />
                <span className="bg-emerald-400" style={{ width: `${100 - partEpargne}%` }} />
              </div>
              <div className="flex justify-between gap-3 mt-1.5 text-micro">
                <span className="text-sky-300">
                  Ton épargne <span className="font-data tabular-nums ghost-blur">{eur(origine.epargne)}</span>
                  {origine.epargne > 0 && origine.marche > 0 && <> · {pctPlain(partEpargne, 0)}</>}
                </span>
                <span className={origine.marche >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  Le marché <span className="font-data tabular-nums ghost-blur">{eur(origine.marche)}</span>
                  {origine.epargne > 0 && origine.marche > 0 && <> · {pctPlain(100 - partEpargne, 0)}</>}
                </span>
              </div>
              {origine.marche < 0 && (
                <p className="text-micro text-slate-500 mt-1">
                  Le marché t&apos;a coûté de l&apos;argent sur la période : ton épargne a fait plus que compenser.
                </p>
              )}
            </div>
          )}

          <p className="text-micro text-slate-500 mt-2">
            Le marché est mesuré sur ton portefeuille (plus-values, dividendes, frais) ; l&apos;épargne est
            tout le reste — versements, dépôts sur les livrets et leurs intérêts.
          </p>
        </>
      )}

      <div className="mt-3 pt-3 border-t border-slate-800">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-micro text-slate-400">
            Versements sur le PEA :{" "}
            <span className="font-data tabular-nums text-slate-200">{regularite.nbSurDouze} mois sur 12</span>
            {regularite.plusLongueSerie > 1 && <> · plus longue série : {regularite.plusLongueSerie} mois d&apos;affilée</>}
          </span>
          <div className="flex gap-1" role="img" aria-label={`${regularite.nbSurDouze} mois avec un versement sur les douze derniers`}>
            {regularite.douzeMois.map((m) => (
              <span
                key={m.cle}
                title={`${new Date(`${m.cle}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} : ${m.verse ? "versement" : "aucun versement"}`}
                className={`w-2.5 h-2.5 rounded-full ${m.verse ? "bg-sky-400" : "bg-slate-700"}`}
              />
            ))}
          </div>
        </div>
        <p className="text-micro text-slate-500 mt-1">
          D&apos;après le journal du PEA : un virement vers un livret n&apos;y figure pas.
        </p>
      </div>
    </Card>
  );
}
