import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { nombre, pctPlain } from "../lib/finance";
import { fetchHistory } from "../lib/api";
import { seriePerMensuelle, lirePerHistorique } from "../../shared/perHistorique.js";

/**
 * PER mois par mois, sur l'historique des exercices publiés.
 *
 * Les quatre PER annuels de la fiche disaient où le titre se situait chaque
 * fin d'exercice ; la courbe dit par où il est passé entre les deux, et
 * surtout où il se trouve AUJOURD'HUI dans cet historique — la question
 * qu'on se pose avant d'acheter.
 */

const moisCourt = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

function Infobulle({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-2 text-micro shadow-xl">
      <div className="text-slate-300">{moisCourt(p.date)}</div>
      <div className="font-data tabular-nums text-slate-100">PER {nombre(p.per, 1)}</div>
      <div className="text-slate-500">BPA de l&apos;exercice {p.exercice.slice(0, 4)} : {nombre(p.bpa, 2)}</div>
    </div>
  );
}

export default function PerHistorique({ symbole, historique = [] }) {
  const [clotures, setClotures] = useState(null);
  const [erreur, setErreur] = useState("");

  const avecBpa = historique.some((e) => Number.isFinite(e?.DilutedEPS));

  useEffect(() => {
    if (!symbole || !avecBpa) return undefined;
    let annule = false;
    // Effet de CHARGEMENT : les clôtures du titre précédent ne doivent pas
    // rester affichées pendant la requête.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClotures(null);
    setErreur("");
    fetchHistory([symbole], "10y", "1mo")
      .then((r) => {
        if (annule) return;
        const serie = r?.[0]?.ok ? r[0].series : [];
        setClotures(serie.map((p) => ({ date: p.date, close: p.close })));
      })
      .catch(() => {
        if (!annule) setErreur("Les cours mensuels sont indisponibles pour le moment : réessaie plus tard.");
      });
    return () => {
      annule = true;
    };
  }, [symbole, avecBpa]);

  const serie = useMemo(() => seriePerMensuelle(clotures || [], historique), [clotures, historique]);
  const lecture = useMemo(() => lirePerHistorique(serie), [serie]);

  if (!avecBpa) return null;

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={History}>PER dans le temps</CardLabel>

      {erreur ? (
        <p className="text-micro text-amber-300/90 mt-1">{erreur}</p>
      ) : clotures == null ? (
        <p className="text-micro text-slate-500 mt-1">Chargement des cours mensuels…</p>
      ) : !lecture ? (
        <p className="text-micro text-slate-500 mt-1">
          Pas assez de mois couverts par un exercice bénéficiaire pour tracer un historique.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-300 mt-1">
            PER d&apos;aujourd&apos;hui :{" "}
            <span className="font-data tabular-nums text-slate-50">{nombre(lecture.actuel, 1)}</span> —{" "}
            plus cher que <span className="font-data">{pctPlain(lecture.rangActuelPct, 0)}</span> des{" "}
            {lecture.nbMois} mois observés.
          </p>
          <p className="text-micro text-slate-500 mt-0.5">
            Moyenne {nombre(lecture.moyenne, 1)} · plus bas {nombre(lecture.min, 1)} · plus haut{" "}
            {nombre(lecture.max, 1)}
          </p>

          <div style={{ height: 200 }} className="mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgb(var(--c-slate-800))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={moisCourt}
                  tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  tickFormatter={(v) => nombre(v, 0)}
                />
                <ReferenceLine
                  y={lecture.moyenne}
                  stroke="#a78bfa"
                  strokeDasharray="4 4"
                  label={{ value: "moyenne", fill: "#a78bfa", fontSize: 10, position: "insideTopLeft" }}
                />
                <Line type="monotone" dataKey="per" stroke="#22d3ee" strokeWidth={1.8} dot={false} connectNulls={false} isAnimationActive={false} />
                <Tooltip content={<Infobulle />} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="text-micro text-slate-500 mt-2">
            Cours de clôture du mois ÷ bénéfice par action dilué du dernier exercice clos. Le
            bénéfice d&apos;un exercice est appliqué dès sa clôture, quelques semaines avant sa
            publication. Un exercice en perte n&apos;a pas de PER : ses mois restent vides.
          </p>
        </>
      )}
    </Card>
  );
}
