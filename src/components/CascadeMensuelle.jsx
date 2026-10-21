import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { eur, compact } from "../lib/finance";
import { cascadeMensuelle, barresCascade } from "../lib/cascade";

/**
 * Décomposition mensuelle du patrimoine, en cascade.
 *
 * « Mon patrimoine a monté de 4 200 € ce mois-ci » ne dit pas l'essentiel :
 * est-ce parce qu'on a épargné 4 000 €, ou parce que le marché a travaillé ?
 * Les deux produisent exactement la même courbe et n'ont rien à voir — l'un
 * est de l'épargne, l'autre de la performance.
 *
 * Le marché est mesuré sur l'historique du portefeuille, l'épargne est le
 * reste (voir cascade.js) : un dépôt sur un livret n'est plus pris pour une
 * plus-value.
 *
 * Les barres sont empilées sur une base invisible, de sorte que chacune
 * démarre là où la précédente s'arrête. Les deux totaux — début et fin —
 * partent du sol, parce qu'ils SONT le niveau du patrimoine, pas un
 * mouvement.
 */

const COULEURS = {
  total: "#64748b",
  flux: "#38bdf8",
  marche: "#34d399",
  cout: "#fb7185",
  neutre: "#94a3b8",
};

function Infobulle({ active, payload }) {
  if (!active || !payload?.length) return null;
  const b = payload[0]?.payload;
  if (!b) return null;
  const signe = b.type === "total" || b.valeur === 0 ? "" : b.valeur > 0 ? "+" : "−";
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-2 text-micro shadow-xl">
      <div className="text-slate-300">{b.libelle}</div>
      <div className="font-data tabular-nums text-slate-100">
        {signe}
        {eur(Math.abs(b.valeur))}
      </div>
    </div>
  );
}

export default function CascadeMensuelle({
  historique = [],
  operations = [],
  bourseHistory = [],
  aDesPositions = true,
  hauteur = 220,
}) {
  const mois = useMemo(
    () => cascadeMensuelle({ historique, operations, bourseHistory, aDesPositions, mois: 6 }),
    [historique, operations, bourseHistory, aDesPositions]
  );
  const [index, setIndex] = useState(null);

  // Le dernier mois par défaut : c'est celui dont on se souvient.
  const choisi = mois.length ? mois[index == null ? mois.length - 1 : index] : null;
  const barres = useMemo(() => barresCascade(choisi), [choisi]);

  if (!choisi) {
    return (
      <Card accent={CARD_THEMES.indigo}>
        <CardLabel>Ce qui a fait bouger le patrimoine</CardLabel>
        <p className="text-micro text-slate-500 mt-1">
          Il faut deux relevés mensuels pour décomposer une variation. Reviens dans quelques
          semaines.
        </p>
      </Card>
    );
  }

  const libelleMois = (m) =>
    new Date(`${m}-01T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

  return (
    <Card accent={CARD_THEMES.indigo}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel>Ce qui a fait bouger le patrimoine</CardLabel>
        <div className="flex items-center gap-1">
          {mois.map((m, i) => {
            const actif = m.mois === choisi.mois;
            return (
              <button
                key={m.mois}
                onClick={() => setIndex(i)}
                className={`text-micro px-1.5 py-0.5 rounded transition-colors ${
                  actif ? "bg-indigo-500/20 text-indigo-300" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {libelleMois(m.mois)}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-micro text-slate-500 mt-1">
        {choisi.variation >= 0 ? "Hausse" : "Baisse"} de{" "}
        <span className="font-data text-slate-300 ghost-blur">{eur(Math.abs(choisi.variation))}</span> sur le
        mois
        {choisi.complet ? (
          <>
            {" "}: <span className="font-data text-sky-300 ghost-blur">{eur(choisi.epargne)}</span> d&apos;épargne
            nette,{" "}
            {choisi.marche >= 0 ? (
              <>
                et <span className="font-data text-emerald-300 ghost-blur">{eur(choisi.marche)}</span> venus du marché.
              </>
            ) : (
              <>
                et un marché qui en a repris{" "}
                <span className="font-data text-rose-300 ghost-blur">{eur(Math.abs(choisi.marche))}</span>.
              </>
            )}
          </>
        ) : (
          <>
            . L&apos;historique du portefeuille ne couvre pas ce mois : la part du marché ne peut pas être
            isolée. Actualiser les cours régulièrement la rend mesurable.
          </>
        )}
      </p>

      <div style={{ height: hauteur }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barres} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
            <XAxis
              dataKey="court"
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fill: "#475569", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => compact(v)}
            />
            {/* La base est transparente : c'est elle qui fait "flotter" chaque
                barre au niveau atteint par la précédente. */}
            <Bar dataKey="base" stackId="cascade" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="hauteur" stackId="cascade" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {barres.map((b) => (
                <Cell key={b.cle} fill={COULEURS[b.type]} />
              ))}
            </Bar>
            <Tooltip content={<Infobulle />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {[
          ["flux", "Épargne nette (versements, livrets…)"],
          ["marche", "Marché et dividendes"],
          ["cout", "Frais"],
        ].map(([type, libelle]) => (
          <span key={type} className="flex items-center gap-1.5 text-micro text-slate-500">
            <span className="w-2 h-2 rounded-sm" style={{ background: COULEURS[type] }} />
            {libelle}
          </span>
        ))}
      </div>
    </Card>
  );
}
