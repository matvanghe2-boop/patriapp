import { useMemo } from "react";
import { Grid3x3 } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { pct } from "../lib/finance";
import { rendementsMensuels } from "../lib/performanceComparee";

/**
 * Rendements mois par mois, une ligne par année.
 *
 * Le calendrier du Dashboard montre le patrimoine jour par jour, versements
 * compris ; cette grille montre la PERFORMANCE du portefeuille, versements
 * neutralisés. C'est la vue qui fait voir qu'une année « à +8 % » a pu
 * traverser trois mois rouges d'affilée.
 */

const MOIS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

/** Couleur d'une case : intensité proportionnelle, plafonnée à ±8 %. */
function fond(pctValeur) {
  if (!Number.isFinite(pctValeur)) return undefined;
  const intensite = Math.min(1, Math.abs(pctValeur) / 8) * 0.55 + 0.08;
  return pctValeur >= 0 ? `rgba(52, 211, 153, ${intensite})` : `rgba(251, 113, 133, ${intensite})`;
}

export default function RendementsMensuels({ history = [] }) {
  const annees = useMemo(() => rendementsMensuels(history), [history]);
  if (annees.length === 0) return null;

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={Grid3x3}>Rendements mois par mois</CardLabel>
      <div className="overflow-x-auto mt-2 -mx-1 px-1">
        <table className="w-full min-w-[40rem] border-separate border-spacing-[3px] text-micro">
          <thead>
            <tr>
              <th className="text-left font-normal text-slate-500 pr-2" scope="col">
                Année
              </th>
              {MOIS.map((m) => (
                <th key={m} className="font-normal text-slate-500" scope="col">
                  {m}
                </th>
              ))}
              <th className="font-normal text-slate-300" scope="col">
                Année
              </th>
            </tr>
          </thead>
          <tbody>
            {annees.map((a) => (
              <tr key={a.annee}>
                <th className="text-left font-data text-slate-400 pr-2" scope="row">
                  {a.annee}
                </th>
                {MOIS.map((_, i) => {
                  const c = a.mois[i + 1];
                  return (
                    <td
                      key={i}
                      className={`text-center font-data tabular-nums rounded px-1 py-1.5 ${
                        c ? "text-slate-100" : "text-slate-700"
                      } ${c?.partiel ? "italic opacity-70" : ""}`}
                      style={{ background: fond(c?.pct) }}
                      title={c?.partiel ? "Mois couvert en partie seulement par l'historique" : undefined}
                    >
                      {c ? pct(c.pct, 1) : "·"}
                    </td>
                  );
                })}
                <td
                  className="text-center font-data tabular-nums font-semibold rounded px-1 py-1.5 text-slate-50"
                  style={{ background: fond(a.total) }}
                >
                  {pct(a.total, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-micro text-slate-500 mt-2">
        Versements et retraits neutralisés : chaque case mesure ce que le marché a fait de l&apos;argent
        présent. En italique, un mois que l&apos;historique ne couvre qu&apos;en partie.
      </p>
    </Card>
  );
}
