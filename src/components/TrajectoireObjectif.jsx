import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { compact, eur, formatDateShort } from "../lib/finance";

/**
 * Objectif tracé en TRAJECTOIRE.
 *
 * Une barre de progression dit « 64 % » et s'arrête là. Elle ne dit pas si
 * ces 64 % arrivent en avance ou avec six mois de retard — or c'est la seule
 * chose qui décide si l'objectif tiendra.
 *
 * Trois éléments, et aucun de plus :
 *  - la **ligne cible fantôme**, en pointillés : où il faudrait être ;
 *  - la **courbe réelle**, qui s'arrête aujourd'hui ;
 *  - la **zone entre les deux**, verte en avance, rouge en retard.
 *
 * La zone est dessinée à partir de l'écart plutôt que par superposition de
 * deux aires : une aire « réel » posée sur une aire « attendu » se lirait
 * mal dès que les courbes se croisent, et elles se croisent précisément aux
 * moments intéressants.
 */
function InfobulleTrajectoire({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-2 text-micro shadow-xl">
      <div className="text-slate-400 mb-1">{formatDateShort(p.date)}</div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-500">Cible</span>
        <span className="font-data tabular-nums text-slate-300">{eur(p.attendu)}</span>
      </div>
      {p.reel != null && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">Réel</span>
            <span className="font-data tabular-nums text-slate-100">{eur(p.reel)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 mt-0.5 pt-0.5 border-t border-slate-800">
            <span className="text-slate-500">{p.ecart >= 0 ? "Avance" : "Retard"}</span>
            <span className={`font-data tabular-nums ${p.ecart >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {eur(Math.abs(p.ecart))}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function TrajectoireObjectif({ serie = [], cible = 0, hauteur = 92 }) {
  // Deux points suffisent à tracer une droite, mais pas à dire quoi que ce
  // soit d'une trajectoire : en dessous, la barre de progression reste plus
  // honnête que trois pixels de courbe.
  const exploitable = serie.length >= 3;

  /**
   * La zone colorée est une AIRE EN BANDE, bornée par les deux courbes.
   *
   * Une aire ordinaire descend jusqu'à l'axe : elle colorierait tout le
   * patrimoine au lieu du seul écart, et la bande — la seule chose qu'on
   * veut voir — disparaîtrait dans un aplat. Recharts accepte un couple
   * `[bas, haut]` comme valeur, ce qui donne exactement la bande voulue.
   *
   * Deux séries disjointes, et non une seule colorée par signe : un dégradé
   * calculé à la position du zéro devient illisible dès que la courbe
   * repasse plusieurs fois au-dessus et au-dessous de la cible.
   */
  const donnees = useMemo(
    () =>
      serie.map((p) => {
        if (p.reel == null) return { ...p, avance: null, retard: null };
        const bande = [Math.min(p.reel, p.attendu), Math.max(p.reel, p.attendu)];
        return {
          ...p,
          avance: p.ecart > 0 ? bande : null,
          retard: p.ecart < 0 ? bande : null,
        };
      }),
    [serie]
  );

  if (!exploitable) return null;

  return (
    <div style={{ height: hauteur }} className="mt-2.5 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={donnees} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="zoneAvance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="zoneRetard" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#fb7185" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <XAxis dataKey="date" hide />
          <YAxis hide domain={["dataMin", (max) => Math.max(max, cible) * 1.04]} />

          {/* La cible elle-même, horizontale : le but ne bouge pas. */}
          <ReferenceLine
            y={cible}
            stroke="#fbbf24"
            strokeDasharray="2 4"
            strokeWidth={1}
            ifOverflow="extendDomain"
          />

          <Area
            type="monotone"
            dataKey="avance"
            stroke="none"
            fill="url(#zoneAvance)"
            connectNulls={false}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="retard"
            stroke="none"
            fill="url(#zoneRetard)"
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Ligne cible « fantôme » : discrète, en pointillés, elle sert de
              repère sans prétendre être une donnée observée. */}
          <Line
            type="monotone"
            dataKey="attendu"
            stroke="#64748b"
            strokeWidth={1.2}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="reel"
            stroke="#e2e8f0"
            strokeWidth={1.8}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          <Tooltip content={<InfobulleTrajectoire />} cursor={{ stroke: "#475569", strokeDasharray: "3 3" }} />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-micro text-slate-600 mt-1 px-1">
        Ligne pointillée : où il faudrait être. Zone colorée : {compact(cible)} visé à l&apos;échéance.
      </p>
    </div>
  );
}
