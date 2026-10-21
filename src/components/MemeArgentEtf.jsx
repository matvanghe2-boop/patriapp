import { useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { eur, pct, compact } from "../lib/finance";
import { fetchHistory } from "../lib/api";
import { memeArgentDansUnIndice } from "../lib/performanceComparee";

/**
 * « Mes choix valent-ils mieux qu'un ETF ? »
 *
 * L'ETF de référence est un MSCI World coté en euros et CAPITALISANT : il
 * réinvestit ses dividendes, comme ton portefeuille compte les tiens dans sa
 * valeur. Un indice de prix (le CAC 40 hors dividendes, par exemple) aurait
 * avantagé le portefeuille de trois points par an sans rien prouver.
 */

const ETF = { symbole: "CW8.PA", nom: "Amundi MSCI World (CW8)" };

/** Plage d'historique couvrant le premier relevé. */
function plagePour(dateIso) {
  const jours = (Date.now() - new Date(`${dateIso}T12:00:00Z`).getTime()) / 86400000;
  if (jours <= 360) return "1y";
  if (jours <= 725) return "2y";
  if (jours <= 1820) return "5y";
  return "10y";
}

const dateCourte = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });

export default function MemeArgentEtf({ history = [] }) {
  const premiereDate = useMemo(
    () => [...history].filter((h) => h?.date && h.valeur > 0).map((h) => h.date).sort()[0] || null,
    [history]
  );
  const [clotures, setClotures] = useState(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (!premiereDate) return undefined;
    let annule = false;
    // Effet de CHARGEMENT : témoin levé avant la requête.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErreur("");
    fetchHistory([ETF.symbole], plagePour(premiereDate), "1d")
      .then((r) => {
        if (annule) return;
        const s = r?.[0]?.ok ? r[0].series : [];
        setClotures(s.map((p) => ({ date: p.date, close: p.close })));
      })
      .catch(() => {
        if (!annule) setErreur("Les cours de l'ETF sont indisponibles pour le moment : réessaie plus tard.");
      });
    return () => {
      annule = true;
    };
  }, [premiereDate]);

  const resultat = useMemo(
    () => (clotures ? memeArgentDansUnIndice(history, clotures) : null),
    [history, clotures]
  );

  if (!premiereDate) return null;

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={Scale}>Le même argent, aux mêmes dates, dans un ETF</CardLabel>

      {erreur ? (
        <p className="text-micro text-amber-300/90 mt-1">{erreur}</p>
      ) : !clotures ? (
        <p className="text-micro text-slate-500 mt-1">Chargement des cours de l&apos;ETF…</p>
      ) : !resultat ? (
        <p className="text-micro text-slate-500 mt-1">
          Pas assez de relevés du portefeuille pour comparer : actualise les cours de temps en temps.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-200 mt-1">
            Depuis le {dateCourte(resultat.depuis)}, tes choix ont fait{" "}
            <span
              className={`font-data tabular-nums ghost-blur ${resultat.ecart >= 0 ? "text-emerald-300" : "text-rose-300"}`}
            >
              {resultat.ecart >= 0 ? "+" : "−"}
              {eur(Math.abs(resultat.ecart))}
            </span>{" "}
            {resultat.ecart >= 0 ? "de mieux" : "de moins"} qu&apos;un {ETF.nom} acheté avec le même argent
            {resultat.ecartPct != null && <> ({pct(resultat.ecartPct)})</>}.
          </p>

          <div style={{ height: 180 }} className="mt-3 ghost-blur">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={resultat.serie} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={dateCourte}
                  tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(v) => compact(v)}
                  domain={["auto", "auto"]}
                />
                <Line type="monotone" dataKey="reel" name="Ton portefeuille" stroke="#a78bfa" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="indice" name={ETF.nom} stroke="#34d399" strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                <Tooltip
                  formatter={(v, nom) => [eur(v), nom]}
                  labelFormatter={dateCourte}
                  contentStyle={{ background: "rgb(var(--c-slate-950))", border: "1px solid rgb(var(--c-slate-700))", borderRadius: 8, fontSize: 11 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-3 mt-1">
            <span className="flex items-center gap-1.5 text-micro text-slate-500">
              <span className="w-3 h-0.5 bg-violet-400" /> Ton portefeuille
            </span>
            <span className="flex items-center gap-1.5 text-micro text-slate-500">
              <span className="w-3 h-0.5 bg-emerald-400" /> {ETF.nom}
            </span>
          </div>

          <p className="text-micro text-slate-500 mt-2">
            Au premier relevé, toute la valeur du portefeuille est placée dans l&apos;ETF ; chaque versement
            suivant y est investi le jour même, chaque retrait en revend des parts. L&apos;ETF est
            capitalisant : il réinvestit ses dividendes comme ton portefeuille compte les tiens. Ses frais de
            gestion sont déjà dans son cours ; les frais de courtage de l&apos;achat ne sont pas comptés.
          </p>
        </>
      )}
    </Card>
  );
}
