import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { nombre, pctPlain, pct } from "../lib/finance";
import { fetchHistory } from "../lib/api";
import { seriePerMensuelle, lirePerHistorique, serieCoursBenefices } from "../../shared/perHistorique.js";

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

function InfobulleCours({ active, payload, devise }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-2 text-micro shadow-xl">
      <div className="text-slate-300">{moisCourt(p.date)}</div>
      {p.cours != null && <div className="font-data tabular-nums text-cyan-300">Cours {nombre(p.cours, 2)} {devise}</div>}
      {p.justifiee != null && <div className="font-data tabular-nums text-violet-300">Justifié par les bénéfices {nombre(p.justifiee, 2)} {devise}</div>}
      {p.cours == null && p.attendue != null && (
        <div className="font-data tabular-nums text-amber-300">Selon le consensus {nombre(p.attendue, 2)} {devise}</div>
      )}
    </div>
  );
}

/**
 * `consensus` : exercices chiffrés par les analystes, BPA déjà ramené dans la
 * monnaie de cotation par la fiche. `devise` : celle du cours.
 */
export default function PerHistorique({ symbole, historique = [], consensus = [], devise = "" }) {
  const [clotures, setClotures] = useState(null);
  const [erreur, setErreur] = useState("");
  // « per » : le PER mois par mois ; « cours » : le cours face à ce que ses
  // bénéfices justifient au PER moyen. Même donnée, deux questions.
  const [vue, setVue] = useState("per");

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
  // Horodatage numérique : les points du consensus tombent à des fins
  // d'exercice, à deux et quatorze mois du dernier cours. Sur un axe par
  // catégories, ils s'espaçaient comme deux mois consécutifs.
  const serieCours = useMemo(
    () => serieCoursBenefices(serie, lecture?.moyenne, consensus).map((p) => ({ ...p, t: Date.parse(`${p.date}T12:00:00Z`) })),
    [serie, lecture, consensus]
  );
  const dernierCours = [...serieCours].reverse().find((p) => p.cours != null);
  const dernierAttendu = serieCours.at(-1)?.cours == null ? serieCours.at(-1) : null;

  if (!avecBpa) return null;

  return (
    <Card accent={CARD_THEMES.violet}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <CardLabel icon={History}>{vue === "per" ? "PER dans le temps" : "Cours et bénéfices"}</CardLabel>
        {lecture && (
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 p-0.5 bg-slate-950/60" role="group" aria-label="Vue du graphique">
            {[
              { cle: "per", libelle: "PER" },
              { cle: "cours", libelle: "Cours et bénéfices" },
            ].map((v) => (
              <button
                key={v.cle}
                type="button"
                onClick={() => setVue(v.cle)}
                aria-pressed={vue === v.cle}
                className={`text-micro font-medium px-2.5 py-1 rounded-md transition-colors ${
                  vue === v.cle ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {v.libelle}
              </button>
            ))}
          </div>
        )}
      </div>

      {erreur ? (
        <p className="text-micro text-amber-300/90 mt-1">{erreur}</p>
      ) : clotures == null ? (
        <p className="text-micro text-slate-500 mt-1">Chargement des cours mensuels…</p>
      ) : !lecture ? (
        <p className="text-micro text-slate-500 mt-1">
          Pas assez de mois couverts par un exercice bénéficiaire pour tracer un historique.
        </p>
      ) : vue === "cours" ? (
        <>
          {dernierCours?.justifiee != null && (
            <p className="text-sm text-slate-300 mt-1">
              Au PER moyen de <span className="font-data">{nombre(lecture.moyenne, 1)}</span>, les bénéfices justifient un cours de{" "}
              <span className="font-data text-violet-300">
                {nombre(dernierCours.justifiee, 2)} {devise}
              </span>{" "}
              ; le titre cote{" "}
              <span className="font-data text-cyan-300">
                {nombre(dernierCours.cours, 2)} {devise}
              </span>{" "}
              (
              <span className={`font-data ${dernierCours.cours > dernierCours.justifiee ? "text-rose-400" : "text-emerald-400"}`}>
                {pct((dernierCours.cours / dernierCours.justifiee - 1) * 100, 0)}
              </span>
              ).
            </p>
          )}
          {dernierAttendu && (
            <p className="text-micro text-slate-500 mt-0.5">
              Avec le bénéfice attendu par les analystes pour l&apos;exercice {dernierAttendu.date.slice(0, 4)}, ce même PER donnerait{" "}
              <span className="font-data text-amber-300">
                {nombre(dernierAttendu.attendue, 2)} {devise}
              </span>
              .
            </p>
          )}

          <div style={{ height: 220 }} className="mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serieCours} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgb(var(--c-slate-800))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t) => moisCourt(new Date(t).toISOString().slice(0, 10))}
                  tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(v) => nombre(v, 0)}
                  domain={["auto", "auto"]}
                />
                <Line type="monotone" dataKey="cours" name="Cours" stroke="#22d3ee" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                {/* En escalier : le bénéfice change une fois par exercice. */}
                <Line type="stepAfter" dataKey="justifiee" name="Justifié" stroke="#a78bfa" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line
                  type="linear"
                  dataKey="attendue"
                  name="Consensus"
                  stroke="#fbbf24"
                  strokeWidth={1.8}
                  strokeDasharray="5 4"
                  dot={{ r: 3 }}
                  connectNulls
                  isAnimationActive={false}
                />
                <Tooltip content={<InfobulleCours devise={devise} />} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="text-micro text-slate-500 mt-2">
            <span className="text-cyan-300">Cours</span> de clôture du mois ;{" "}
            <span className="text-violet-300">valeur justifiée</span> = bénéfice par action du dernier exercice clos × PER
            moyen du titre ; <span className="text-amber-300">pointillés</span> = le même calcul avec le bénéfice attendu par
            le consensus, sur les deux exercices qu&apos;il chiffre et pas au-delà.
          </p>
        </>
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
