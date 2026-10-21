import { useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { eur, pct, compact } from "../lib/finance";
import { fetchHistory } from "../lib/api";
import { memeArgentDansUnIndice } from "../lib/performanceComparee";
import { usePersistentState } from "../lib/storage";

/**
 * « Mes choix valent-ils mieux qu'un ETF ? »
 *
 * Tous les ETF proposés sont cotés en euros et CAPITALISANTS : ils
 * réinvestissent leurs dividendes, comme ton portefeuille compte les tiens
 * dans sa valeur. Un ETF distribuant — ou un indice de prix — perdrait ses
 * dividendes en chemin et avantagerait le portefeuille sans rien prouver.
 * C'est pourquoi le CAC 40 proposé est la version ESG (C40) : l'ETF CAC 40
 * classique d'Amundi (CAC) distribue.
 *
 * Noms et caractère capitalisant vérifiés sur la source de marché le
 * 2026-10-21.
 */
export const ETFS_COMPARAISON = [
  { symbole: "CW8.PA", nom: "MSCI World", detail: "Amundi MSCI World Swap (CW8)" },
  { symbole: "PSP5.PA", nom: "S&P 500", detail: "Amundi PEA S&P 500 (PSP5)" },
  { symbole: "PUST.PA", nom: "Nasdaq-100", detail: "Amundi PEA Nasdaq-100 (PUST)" },
  { symbole: "MEUD.PA", nom: "Stoxx Europe 600", detail: "Amundi Core Stoxx Europe 600 (MEUD)" },
  { symbole: "C40.PA", nom: "CAC 40 ESG", detail: "Amundi CAC 40 ESG (C40)" },
  { symbole: "PAEEM.PA", nom: "Pays émergents", detail: "Amundi PEA Émergent MSCI EM (PAEEM)" },
];

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
  // Le repère est un choix personnel : un investisseur européen ne se compare
  // pas forcément au monde entier. Retenu d'une visite à l'autre.
  const [choix, setChoix] = usePersistentState("etfComparaison", ETFS_COMPARAISON[0].symbole);
  const ETF = ETFS_COMPARAISON.find((e) => e.symbole === choix) || ETFS_COMPARAISON[0];
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
    setClotures(null);
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
  }, [premiereDate, ETF.symbole]);

  const resultat = useMemo(
    () => (clotures ? memeArgentDansUnIndice(history, clotures) : null),
    [history, clotures]
  );

  if (!premiereDate) return null;

  return (
    <Card accent={CARD_THEMES.violet}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel icon={Scale}>Le même argent, aux mêmes dates, dans un ETF</CardLabel>
        <label className="flex items-center gap-2 text-micro text-slate-500">
          Comparer à
          <select
            value={ETF.symbole}
            onChange={(e) => setChoix(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-violet-400/60"
          >
            {ETFS_COMPARAISON.map((e) => (
              <option key={e.symbole} value={e.symbole}>
                {e.nom}
              </option>
            ))}
          </select>
        </label>
      </div>

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
            {resultat.ecart >= 0 ? "de mieux" : "de moins"} qu&apos;un {ETF.detail} acheté avec le même argent
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
                <Line type="monotone" dataKey="indice" name={ETF.detail} stroke="#34d399" strokeWidth={1.6} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
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
              <span className="w-3 h-0.5 bg-emerald-400" /> {ETF.detail}
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
