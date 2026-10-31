import { eur } from "../lib/finance";
import { decrireOperation, NATURES_MARQUEUR } from "../lib/marqueursCourbe";
import { formatDateFr } from "./ProfilMensuelOutils";

/**
 * Briques de la courbe du patrimoine du Dashboard : filtre de période, point
 * final, infobulle et pastilles d'opérations. Sorties de Dashboard.jsx.
 */

// ─── Time filter config ────────────────────────────────────────────────────────
export const TIME_FILTERS = [
  { key: "1M", label: "1M", months: 1 },
  { key: "6M", label: "6M", months: 6 },
  { key: "1Y", label: "1Y", months: 12 },
  { key: "ALL", label: "ALL", months: null },
];

export function getMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}


/**
 * Marqueur du dernier point mesuré d'une série recharts.
 *
 * recharts appelle ce composant pour CHAQUE point ; on ne rend quelque chose
 * que sur le dernier qui porte une valeur. Retourner `null` ailleurs est la
 * façon prévue de ne rien dessiner — un `dot={false}` global empêcherait de
 * distinguer ce point-là.
 */
export function PointFinal({ cx, cy, index, serie }) {
  const dernier = serie ? serie.map((d) => d.value).lastIndexOf(serie.filter((d) => d.value != null).slice(-1)[0]?.value) : -1;
  if (index !== dernier || cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="#10b981" opacity={0.18} />
      <circle cx={cx} cy={cy} r={4} fill="#10b981" />
    </g>
  );
}

// ─── Time filter buttons ──────────────────────────────────────────────────────
export function TimeFilterBar({ active, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {TIME_FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`text-micro font-medium px-2.5 py-1 rounded-lg transition-colors ${
            active === f.key
              ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
              : "text-slate-500 hover:text-slate-300 border border-transparent"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── Custom tooltip for chart with projection ─────────────────────────────────
// L'abscisse de la courbe est une clé d'indice (voir `chartData`) : le libellé
// lisible se relit donc sur le point lui-même, pas sur `label`.
export function ChartTooltip({ active, payload, marqueursParCle, annotationsParCle }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const marqueur = marqueursParCle?.[point?.cle];
  const notes = annotationsParCle?.[point?.cle];
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{point?.label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 font-data tabular-nums">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke }} />
          <span className="text-slate-400">{p.name} :</span>
          <span className={`ghost-blur ${p.name?.includes("Projection") ? "text-amber-300/70" : "text-slate-100"}`}>
            {eur(p.value)}
          </span>
        </div>
      ))}
      {marqueur && (
        <div className="pt-1.5 mt-1.5 border-t border-slate-800 space-y-0.5">
          {marqueur.natures.map(({ nature, ops }) =>
            ops.map((op, i) => (
              <div key={`${nature}-${i}`} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NATURES_MARQUEUR[nature].couleur }} />
                <span className="text-slate-300 ghost-blur">{decrireOperation(op)}</span>
              </div>
            ))
          )}
        </div>
      )}
      {notes && (
        <div className="pt-1.5 mt-1.5 border-t border-slate-800 space-y-0.5">
          {notes.annotations.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5 text-sky-200">
              <span aria-hidden="true">◆</span>
              <span>{a.texte}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Repère d'annotation sur la courbe : un losange, pour ne pas le confondre avec une opération. */
export function RepereAnnotation({ cx, cy, groupe }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const y = cy + 12;
  return (
    <g>
      <title>{groupe.annotations.map((a) => a.texte).join(" · ")}</title>
      <line x1={cx} y1={cy} x2={cx} y2={y - 4} stroke="#7dd3fc" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
      <rect x={cx - 4} y={y - 4} width={8} height={8} transform={`rotate(45 ${cx} ${y})`} fill="#7dd3fc" stroke="rgb(var(--c-slate-950))" strokeWidth={1.5} />
    </g>
  );
}

/**
 * Pastilles d'opérations posées sur la courbe du patrimoine net.
 *
 * Même dessin que sur la courbe du portefeuille (onglet Performance) : une
 * pastille par nature, EMPILÉES vers le haut quand un même relevé en reçoit
 * plusieurs — un versement suivi d'un achat le même jour est le cas le plus
 * courant, et deux pastilles superposées n'en laisseraient voir qu'une.
 *
 * Le `<title>` donne l'infobulle native au survol de la pastille elle-même ;
 * l'infobulle du graphique reprend le même détail pour qui survole la courbe.
 */
export function PastilleOperations({ cx, cy, marqueur }) {
  if (cx == null || cy == null || !marqueur) return null;
  return (
    <g>
      {marqueur.natures.map(({ nature, ops }, i) => {
        const { couleur } = NATURES_MARQUEUR[nature];
        const y = cy - i * 11;
        return (
          <g key={nature}>
            <circle cx={cx} cy={y} r={6} fill={couleur} fillOpacity={0.22} />
            <circle cx={cx} cy={y} r={3.4} fill={couleur} stroke="#020617" strokeWidth={1.4} />
            <title>{`${formatDateFr(marqueur.date)} — ${ops.map(decrireOperation).join(" · ")}`}</title>
          </g>
        );
      })}
    </g>
  );
}

// Le relevé quotidien du patrimoine net a été remonté au niveau de <App>
// (voir src/lib/useDailySnapshot.js) : ici, il ne se déclenchait que si
// l'utilisateur ouvrait cet onglet-là dans la journée.
