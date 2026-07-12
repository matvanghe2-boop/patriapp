import React, { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardLabel, EmptyState } from "./ui";
import { eur, pctPlain } from "../lib/finance";
import { getSector, SECTOR_HEX, SECTOR_COLORS } from "../lib/sectors";
import AssetLogo from "./AssetLogo";

/**
 * Heatmap sectorielle façon TradingView : un vrai treemap, cellules
 * jointives (aucun espacement), dimensionnées selon le poids réel de chaque
 * ligne dans le portefeuille. La couleur code le secteur (pas la
 * performance) — chaque case garde le nom du secteur affiché à l'intérieur.
 */
export default function SectorHeatmap({ positions = [] }) {
  const { data, total, sectorTotals } = useMemo(() => {
    const withValue = positions
      .map((p) => ({ ...p, value: (p.quantity || 0) * (p.current_price || 0), sector: getSector(p.ticker) }))
      .filter((p) => p.value > 0);

    const total = withValue.reduce((s, p) => s + p.value, 0);

    const sectorTotals = new Map();
    for (const p of withValue) sectorTotals.set(p.sector, (sectorTotals.get(p.sector) || 0) + p.value);

    // Trié par secteur (les plus gros secteurs d'abord) puis par ligne, pour
    // que l'algorithme de treemap regroupe naturellement les cases d'un même
    // secteur les unes à côté des autres.
    const data = withValue
      .sort((a, b) => (sectorTotals.get(b.sector) - sectorTotals.get(a.sector)) || b.value - a.value)
      .map((p) => ({
        name: p.ticker,
        value: p.value,
        ticker: p.ticker,
        sector: p.sector,
        pct: total > 0 ? (p.value / total) * 100 : 0,
      }));

    return { data, total, sectorTotals };
  }, [positions]);

  const sectorLegend = useMemo(
    () =>
      [...sectorTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 })),
    [sectorTotals, total]
  );

  return (
    <Card>
      <CardLabel icon={LayoutGrid}>Répartition sectorielle</CardLabel>
      {data.length === 0 ? (
        <EmptyState>Ajoute une position pour voir sa répartition sectorielle.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <Treemap
                data={data}
                dataKey="value"
                stroke="#0f172a"
                isAnimationActive={false}
                content={<TreemapTile />}
              >
                <Tooltip content={<TreemapTooltip total={total} />} />
              </Treemap>
            </ResponsiveContainer>
          </div>

          {/* Légende des secteurs */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {sectorLegend.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SECTOR_HEX[s.name] || SECTOR_HEX.Autre }} />
                <span className="text-slate-400">{s.name}</span>
                <span className="text-slate-600 font-data">{pctPlain(s.pct, 1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function TreemapTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
      <p className="font-data font-semibold text-slate-100">{d.ticker}</p>
      <p className="text-slate-500">{d.sector}</p>
      <p className="text-slate-300 mt-1">{eur(d.value, 0)}</p>
      <p className="text-slate-500">{pctPlain((d.value / total) * 100, 1)} du portefeuille</p>
    </div>
  );
}

// Rendu custom d'une case du treemap : fond plein coloré par secteur (pas de
// séparation par espacement, uniquement par la couleur/le liseré), avec le
// logo, le ticker, le poids et le nom du secteur à l'intérieur de la case
// quand elle est assez grande pour l'accueillir.
function TreemapTile(props) {
  const { x, y, width, height, ticker, sector, pct } = props;
  if (!width || !height || width <= 0 || height <= 0) return null;

  const fill = SECTOR_HEX[sector] || SECTOR_HEX.Autre;
  const showFull = width > 70 && height > 55;
  const showCompact = !showFull && width > 34 && height > 24;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0f172a" strokeWidth={1.5} />
      {showFull && (
        <foreignObject x={x} y={y} width={width} height={height}>
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1 overflow-hidden">
            <AssetLogo ticker={ticker} size="sm" />
            <span className="font-data text-[12px] font-bold text-white truncate max-w-full">{ticker}</span>
            <span className="text-[10px] text-white/75 font-data">{pctPlain(pct, 1)}</span>
            <span className="text-[9px] text-white/50 truncate max-w-full leading-none">{sector}</span>
          </div>
        </foreignObject>
      )}
      {showCompact && (
        <foreignObject x={x} y={y} width={width} height={height}>
          <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 p-0.5 overflow-hidden">
            <span className="font-data text-[10px] font-bold text-white truncate max-w-full">{ticker}</span>
            <span className="text-[9px] text-white/70 font-data">{pctPlain(pct, 1)}</span>
          </div>
        </foreignObject>
      )}
    </g>
  );
}
