import React, { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { Card, CardLabel, EmptyState } from "./ui";
import { eur, pctPlain } from "../lib/finance";
import { getSector, SECTOR_COLORS } from "../lib/sectors";
import AssetLogo from "./AssetLogo";

/**
 * Heatmap de type treemap simplifié : les positions actuelles sont
 * regroupées par secteur (déduit automatiquement du ticker), les secteurs
 * sont classés par poids décroissant dans le portefeuille, et à l'intérieur
 * de chaque secteur, la largeur de chaque case est proportionnelle au poids
 * de la ligne — les plus grosses convictions sautent immédiatement aux yeux.
 */
export default function SectorHeatmap({ positions = [] }) {
  const { sectors, total } = useMemo(() => {
    const withValue = positions
      .map((p) => ({ ...p, value: (p.quantity || 0) * (p.current_price || 0), sector: getSector(p.ticker) }))
      .filter((p) => p.value > 0);

    const total = withValue.reduce((s, p) => s + p.value, 0);

    const groups = new Map();
    for (const p of withValue) {
      if (!groups.has(p.sector)) groups.set(p.sector, []);
      groups.get(p.sector).push(p);
    }

    const sectors = [...groups.entries()]
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => b.value - a.value),
        value: items.reduce((s, i) => s + i.value, 0),
      }))
      .sort((a, b) => b.value - a.value);

    return { sectors, total };
  }, [positions]);

  return (
    <Card>
      <CardLabel icon={LayoutGrid}>Répartition sectorielle</CardLabel>
      {sectors.length === 0 ? (
        <EmptyState>Ajoute une position pour voir sa répartition sectorielle.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          {sectors.map((sector) => {
            const colors = SECTOR_COLORS[sector.name] || SECTOR_COLORS.Autre;
            const sectorPct = total > 0 ? (sector.value / total) * 100 : 0;
            return (
              <div key={sector.name}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className={`text-xs font-semibold ${colors.text}`}>{sector.name}</span>
                  <span className="text-[11px] text-slate-500 font-data">{pctPlain(sectorPct, 1)} du portefeuille</span>
                </div>
                <div className="flex gap-1 rounded-lg overflow-hidden">
                  {sector.items.map((p) => {
                    const widthPct = (p.value / sector.value) * 100;
                    return (
                      <div
                        key={p.id}
                        title={`${p.ticker} — ${eur(p.value, 0)} (${pctPlain((p.value / total) * 100, 1)} du portefeuille)`}
                        style={{ flexBasis: `${widthPct}%` }}
                        className={`flex flex-col items-center justify-center gap-1 py-3 px-1 border ${colors.bg} ${colors.border} min-w-[64px]`}
                      >
                        <AssetLogo ticker={p.ticker} size="xs" />
                        <span className={`font-data text-[10px] font-semibold ${colors.text} truncate max-w-full`}>{p.ticker}</span>
                        <span className="text-[10px] text-slate-400 font-data">{pctPlain((p.value / total) * 100, 1)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
