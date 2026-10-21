import { useMemo } from "react";
import { CalendarRange } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { eur, compact } from "../lib/finance";
import { calendrierRevenus } from "../lib/revenusPassifs";
import { todayIso } from "../lib/finance";

/**
 * Ce qui tombera sur le compte, mois par mois, sur les douze prochains mois.
 *
 * Le suivi des dividendes projetait déjà sur cinq ou dix ans ; il ne disait
 * pas ce qui arrive en mars. Or c'est la question pratique : quand les
 * revenus tombent-ils, et quels mois sont creux ?
 */

function Infobulle({ active, payload }) {
  if (!active || !payload?.length) return null;
  const m = payload[0]?.payload;
  if (!m) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-2 text-micro shadow-xl min-w-[9rem]">
      <div className="text-slate-300 capitalize">{m.libelleLong}</div>
      {m.details.map((d) => (
        <div key={d.ticker} className="flex justify-between gap-3 text-slate-400">
          <span>{d.ticker}</span>
          <span className="font-data tabular-nums ghost-blur">{eur(d.montant, 2)}</span>
        </div>
      ))}
      {m.interets > 0 && (
        <div className="flex justify-between gap-3 text-slate-400">
          <span>Intérêts des livrets</span>
          <span className="font-data tabular-nums ghost-blur">{eur(m.interets, 2)}</span>
        </div>
      )}
      <div className="flex justify-between gap-3 text-slate-100 border-t border-slate-800 mt-1 pt-1">
        <span>Total</span>
        <span className="font-data tabular-nums ghost-blur">{eur(m.dividendes + m.interets, 2)}</span>
      </div>
    </div>
  );
}

export default function CalendrierRevenus({ bourse, livrets = [] }) {
  const calendrier = useMemo(
    () =>
      calendrierRevenus({
        positions: bourse?.positions || [],
        enveloppe: bourse?.envelope || "PEA",
        livrets,
        aujourdhui: todayIso(),
      }),
    [bourse, livrets]
  );

  const donnees = calendrier.mois.map((m) => ({
    ...m,
    libelleLong: new Date(`${m.cle}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
  }));
  const plusCreux = calendrier.total > 0 ? donnees.filter((m) => m.dividendes + m.interets === 0).length : null;

  return (
    <Card accent={CARD_THEMES.emerald}>
      <CardLabel icon={CalendarRange}>Revenus des 12 prochains mois</CardLabel>

      {calendrier.total <= 0 && calendrier.inconnu <= 0 ? (
        <p className="text-micro text-slate-500 mt-1">
          Aucun revenu attendu : actualise les cours pour récupérer le dividende et le calendrier de tes
          actions, et renseigne le taux de tes livrets.
        </p>
      ) : (
        <>
          <p className="text-micro text-slate-500 mt-1">
            <span className="font-data tabular-nums text-slate-200 ghost-blur">{eur(calendrier.total)}</span>{" "}
            attendus
            {plusCreux > 0 && <> · {plusCreux} mois sans aucun revenu</>}
          </p>
          <div style={{ height: 170 }} className="mt-2 ghost-blur">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={donnees} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="libelle"
                  tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                  tickFormatter={(v) => compact(v)}
                />
                <Bar dataKey="dividendes" stackId="r" fill="#34d399" radius={[0, 0, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="interets" stackId="r" fill="#818cf8" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Tooltip content={<Infobulle />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            <span className="flex items-center gap-1.5 text-micro text-slate-500">
              <span className="w-2 h-2 rounded-sm bg-emerald-400" /> Dividendes nets
            </span>
            <span className="flex items-center gap-1.5 text-micro text-slate-500">
              <span className="w-2 h-2 rounded-sm bg-indigo-400" /> Intérêts des livrets (crédités au 31 décembre)
            </span>
          </div>
          <p className="text-micro text-slate-500 mt-2">
            Mois de détachement observés l&apos;an dernier ; le versement suit de quelques jours. Une projection,
            pas une promesse : un dividende peut être réduit ou décalé.
          </p>
          {calendrier.inconnu > 0 && (
            <p className="text-micro text-amber-300/90 mt-1">
              <span className="ghost-blur">{eur(calendrier.inconnu)}</span> de dividendes sans calendrier connu (
              {calendrier.lignesInconnues.join(", ")}) : actualise les cours pour le récupérer. Ils ne sont pas
              répartis au jugé.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
