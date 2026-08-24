import { useMemo } from "react";
import { RefreshCw, Activity, Info, TrendingDown, TrendingUp, Target, Percent, Scale, Coins, ArrowUp, ArrowDown, X as XIcon, PieChart as PieIcon } from "lucide-react";
import {
  ResponsiveContainer, Tooltip, LineChart, Line, ComposedChart, Area, XAxis, YAxis,
  CartesianGrid, ReferenceArea, ReferenceLine, ReferenceDot,
} from "recharts";
import { Card, CardLabel, EmptyState, CARD_THEMES } from "./ui";
import {
  eur, pctPlain, pct, compact, rebaseTo100, MARKET_BENCHMARKS,
  computeTWR, computeXIRR, computeVolatility, computeMaxDrawdown, computeDrawdownSeries,
  computeSharpeRatio, computeBestWorst, computeAlphaBeta, computeContribution,
  computeRollingPerformance, computeFeeEfficiency, computeTSR, filterHistoryByRange,
  MIN_DAYS_FOR_ANNUALIZATION, MIN_POINTS_FOR_STATS, computeInvestedCapital, investedCapitalAsOf,
  formatDateShort,
} from "../lib/finance";
import { useToast } from "../lib/ToastContext";
import SuiviDividendes from "./SuiviDividendes";

/**
 * Onglet « Performance » de PEA & Bourse.
 *
 * Extrait de Bourse.jsx, qui dépassait 1 800 lignes et regroupait quatre
 * sous-onglets, huit composants importés et une quinzaine de widgets. Ce
 * bloc-ci — les mesures de performance et leurs graphiques — n'a aucun lien
 * avec la gestion des positions : il ne partage que l'état `bourse`, reçu en
 * props.
 */

// ─── Onglet Performance ───────────────────────────────────────────────────
const RANGE_OPTIONS = ["1M", "3M", "YTD", "1A", "MAX"];
const ALL_BENCHMARKS = [
  { symbol: "^GSPC", name: "S&P 500", color: "#38bdf8" },
  { symbol: "^FCHI", name: "CAC 40", color: "#a78bfa" },
  { symbol: "URTH", name: "MSCI World", color: "#34d399" },
  { symbol: "^IXIC", name: "Nasdaq", color: "#f472b6" },
  { symbol: "EEM", name: "MSCI Emerging", color: "#fb923c" },
  { symbol: "GC=F", name: "Or", color: "#facc15" },
];
const ALL_BENCHMARK_KEYS = {
  "^GSPC": "sp500", "^FCHI": "cac40", URTH: "msciWorld",
  "^IXIC": "nasdaq", EEM: "msciEmerging", "GC=F": "or",
};

/** Petite pastille "où je me situe" par rapport à une valeur de référence marché. */
function BenchmarkGauge({ label, value, target, unit = "", higherIsBetter = true, digits = 2 }) {
  if (value == null || !Number.isFinite(value)) return null;
  const good = higherIsBetter ? value >= target : value <= target;
  return (
    <div className="flex items-center justify-between gap-2 text-micro py-1 border-b border-slate-800/60 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`font-data tabular-nums ${good ? "text-emerald-400" : "text-amber-300"}`}>
          {value.toFixed(digits)}{unit}
        </span>
        <span className="text-slate-600">vs {target}{unit} (marché)</span>
      </span>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, tone = "slate", valueSensitive = false, subSensitive = false }) {
  const toneClass = {
    emerald: "text-emerald-400", rose: "text-rose-400", violet: "text-violet-300",
    amber: "text-amber-300", slate: "text-slate-100",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center gap-1.5 text-micro uppercase tracking-wide text-slate-500 mb-1">
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className={`font-display text-lg ${toneClass} ${valueSensitive ? "ghost-blur" : ""}`}>{value}</div>
      {sub && <div className={`text-micro text-slate-500 mt-0.5 ${subSensitive ? "ghost-blur" : ""}`}>{sub}</div>}
    </div>
  );
}

function RangeSelector({ range, setRange }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-800 p-0.5 bg-slate-950/60">
      {RANGE_OPTIONS.map((r) => (
        <button
          key={r}
          onClick={() => setRange(r)}
          className={`text-micro font-medium px-2.5 py-1 rounded-md transition-colors ${
            range === r ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

// ─── Repères d'opérations sur la courbe de valeur ────────────────────────
// Code couleur demandé : achat en vert, vente en rouge, dividende en bleu.
const OP_MARKERS = {
  ACHAT: { color: "#22c55e", label: "Achat", verb: "Achat" },
  VENTE: { color: "#ef4444", label: "Vente", verb: "Vente" },
  DIVIDENDE: { color: "#3b82f6", label: "Dividende", verb: "Dividende" },
};
const OP_MARKER_ORDER = ["ACHAT", "VENTE", "DIVIDENDE"];

const describeOp = (kind, op) => {
  const cfg = OP_MARKERS[kind];
  if (kind === "DIVIDENDE") {
    const amount = op.amount ?? op.montantNet;
    return `${cfg.verb} ${op.asset || ""}${amount != null ? ` — ${eur(amount, 2)}` : ""}`.trim();
  }
  return `${cfg.verb} ${op.asset || ""}${op.quantity ? ` ×${op.quantity}` : ""}`.trim();
};

/**
 * Pastille posée sur la courbe de valeur. Quand plusieurs natures d'opérations
 * tombent le même jour, elles sont empilées verticalement pour rester toutes
 * lisibles plutôt que de se recouvrir.
 */
function OperationMarkerShape(props) {
  const { cx, cy, marker } = props;
  if (cx == null || cy == null || !marker) return null;
  return (
    <g>
      {marker.kinds.map(({ kind, ops }, i) => {
        const cfg = OP_MARKERS[kind];
        const y = cy - i * 11;
        return (
          <g key={kind}>
            <circle cx={cx} cy={y} r={6} fill={cfg.color} fillOpacity={0.22} />
            <circle cx={cx} cy={y} r={3.4} fill={cfg.color} stroke="#020617" strokeWidth={1.4} />
            <title>
              {`${formatDateShort(marker.date)} — ${ops.map((o) => describeOp(kind, o)).join(" · ")}`}
            </title>
          </g>
        );
      })}
    </g>
  );
}

function EnrichedHistoryTooltip({ active, payload, label, drawdownByDate, markersByDate }) {
  if (!active || !payload?.length) return null;
  const valeur = payload.find((p) => p.dataKey === "valeur")?.value;
  const capital = payload.find((p) => p.dataKey === "capital")?.value;
  const dd = drawdownByDate?.[label];
  const marker = markersByDate?.[label];
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-sm space-y-1">
      <div className="text-slate-400 font-medium">{formatDateShort(label)}</div>
      {valeur != null && (
        <div className="flex items-center justify-between gap-4 font-data tabular-nums">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-violet-400" /> Valeur
          </span>
          <span className="text-violet-200 ghost-blur">{eur(valeur)}</span>
        </div>
      )}
      {capital != null && (
        <div className="flex items-center justify-between gap-4 font-data tabular-nums">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-500" /> Capital investi
          </span>
          <span className="text-slate-300 ghost-blur">{eur(capital)}</span>
        </div>
      )}
      {valeur != null && capital > 0 && (
        <div className={`font-data tabular-nums text-right ${valeur >= capital ? "text-emerald-400" : "text-rose-400"}`}>
          {pct(((valeur - capital) / capital) * 100)}
        </div>
      )}
      {dd != null && dd < -0.05 && (
        <div className="text-rose-400/90 font-data tabular-nums">Drawdown : {dd.toFixed(1)} %</div>
      )}
      {marker && (
        <div className="pt-1.5 mt-1 border-t border-slate-800 space-y-0.5">
          {marker.kinds.map(({ kind, ops }) =>
            ops.map((op, i) => (
              <div key={`${kind}-${i}`} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: OP_MARKERS[kind].color }} />
                <span className="text-slate-300">{describeOp(kind, op)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BenchmarkCompareTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-sm space-y-1">
      <div className="text-slate-400 mb-1 font-medium">{formatDateShort(label)}</div>
      {sorted.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 font-data tabular-nums">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-slate-100">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
            {typeof p.value === "number" && (
              <span className={p.value >= 100 ? "text-emerald-400" : "text-rose-400"}>
                {p.value >= 100 ? "+" : ""}{(p.value - 100).toFixed(1)} %
              </span>
            )}
          </span>
        </div>
      ))}
      <div className="text-micro text-slate-600 pt-1">Base 100 au premier jour de la période affichée.</div>
    </div>
  );
}

/** Petite pastille de légende réutilisée sous les graphiques. */
function ChartLegendItem({ color, label, shape = "dot" }) {
  return (
    <span className="flex items-center gap-1.5 text-micro text-slate-400">
      {shape === "dot" ? (
        <span className="w-2.5 h-2.5 rounded-full border border-slate-950" style={{ background: color }} />
      ) : (
        <span className="w-3 h-2 rounded-sm" style={{ background: color }} />
      )}
      {label}
    </span>
  );
}

export default function PerformanceTab({
  bourse, bourseHistory, setBourseHistory, bourseGainAbs, trackLoading, trackError, captureSnapshot,
  hasEnoughHistory, hasEnoughBase100, perfRange, setPerfRange,
  selectedBenchmarks, setSelectedBenchmarks, showDividendsReinvested, setShowDividendsReinvested,
}) {
  // Mémoïsé : `|| []` produit un tableau neuf à chaque rendu et invalidait
  // les trois useMemo qui en dépendent plus bas.
  const operations = useMemo(() => bourse.operations || [], [bourse]);
  const { showToast } = useToast();

  // La courbe « Capital investi » est recalculée à l'affichage à partir du
  // journal d'opérations, pour TOUS les points de l'historique — y compris
  // ceux enregistrés avant le correctif, qui portent encore l'ancien
  // `Σ quantité × PRU + cash` et faisaient plonger la courbe à chaque vente.
  const history = useMemo(() => {
    const invested = computeInvestedCapital(bourse);
    return (bourseHistory || []).map((h) => ({ ...h, capital: Math.round(investedCapitalAsOf(invested, h.date)) }));
  }, [bourseHistory, bourse]);

  const rangedHistory = useMemo(() => filterHistoryByRange(history, perfRange), [history, perfRange]);
  // Suppression annulable, comme partout ailleurs dans l'app, plutôt qu'un
  // `window.confirm` natif : boîte système grise au milieu d'une interface
  // sombre, bloquante, et non testable.
  const deleteHistoryPoint = (date) => {
    const previous = bourseHistory || [];
    setBourseHistory((h) => h.filter((e) => e.date !== date));
    showToast({
      message: `Point du ${formatDateShort(date)} supprimé de l'historique.`,
      onUndo: () => setBourseHistory(previous),
    });
  };
  const twr = useMemo(() => computeTWR(history), [history]);
  const xirr = useMemo(() => computeXIRR(history), [history]);
  const volatility = useMemo(() => computeVolatility(history), [history]);
  const maxDD = useMemo(() => computeMaxDrawdown(history), [history]);
  const drawdownSeries = useMemo(() => computeDrawdownSeries(rangedHistory), [rangedHistory]);
  const drawdownByDate = useMemo(() => Object.fromEntries(drawdownSeries.map((d) => [d.date, d.ddPct])), [drawdownSeries]);
  const sharpe = useMemo(() => computeSharpeRatio(history), [history]);
  const bestWorst = useMemo(() => computeBestWorst(history), [history]);
  const alphaBeta = useMemo(() => computeAlphaBeta(history, "sp500"), [history]);
  const contribution = useMemo(() => computeContribution(bourse.positions), [bourse.positions]);
  const rolling = useMemo(() => computeRollingPerformance(history), [history]);
  const feeEfficiency = useMemo(() => computeFeeEfficiency(operations, bourseGainAbs), [operations, bourseGainAbs]);
  const tsr = useMemo(() => computeTSR(history, operations), [history, operations]);

  const base100Data = useMemo(() => rebaseTo100(rangedHistory, ["valeur", ...selectedBenchmarks.map((s) => ALL_BENCHMARK_KEYS[s])]), [rangedHistory, selectedBenchmarks]);

  // Écart de surperformance vs le premier indice sélectionné, pour l'affichage en zone colorée
  const primaryBenchKey = selectedBenchmarks[0] ? ALL_BENCHMARK_KEYS[selectedBenchmarks[0]] : null;
  const spreadData = useMemo(() => {
    if (!primaryBenchKey) return [];
    return base100Data
      .filter((d) => d.valeur != null && d[primaryBenchKey] != null)
      .map((d) => ({ ...d, spread: d.valeur - d[primaryBenchKey] }));
  }, [base100Data, primaryBenchKey]);

  const toggleBenchmark = (symbol) => {
    setSelectedBenchmarks((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  };

  // ─── Repères d'opérations sur la courbe de valeur ──────────────────────
  // Une opération ne tombe pas forcément un jour où un point de suivi existe
  // (week-end, jour sans relevé) : on la rattache alors au dernier point connu
  // avant elle, sinon la pastille ne s'afficherait tout simplement pas.
  const operationMarkers = useMemo(() => {
    if (rangedHistory.length === 0) return [];
    const dates = rangedHistory.map((h) => h.date);
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const valueByDate = Object.fromEntries(rangedHistory.map((h) => [h.date, h.valeur]));
    const grouped = new Map();

    operations.forEach((op) => {
      if (!OP_MARKERS[op.type] || !op.date || op.date < firstDate || op.date > lastDate) return;
      let snapped = firstDate;
      for (const d of dates) {
        if (d <= op.date) snapped = d;
        else break;
      }
      if (!grouped.has(snapped)) grouped.set(snapped, new Map());
      const kinds = grouped.get(snapped);
      if (!kinds.has(op.type)) kinds.set(op.type, []);
      kinds.get(op.type).push(op);
    });

    return [...grouped.entries()].map(([date, kinds]) => ({
      date,
      value: valueByDate[date],
      kinds: OP_MARKER_ORDER.filter((k) => kinds.has(k)).map((kind) => ({ kind, ops: kinds.get(kind) })),
    }));
  }, [operations, rangedHistory]);

  const markersByDate = useMemo(
    () => Object.fromEntries(operationMarkers.map((m) => [m.date, m])),
    [operationMarkers]
  );

  // Dégradé de l'écart de surperformance : vert au-dessus de zéro, rouge en
  // dessous, avec la bascule placée exactement sur la ligne du zéro.
  const spreadZeroOffset = useMemo(() => {
    if (spreadData.length === 0) return 1;
    const values = spreadData.map((d) => d.spread);
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    if (max <= 0) return 0;
    if (min >= 0) return 1;
    return max / (max - min);
  }, [spreadData]);

  return (
    <>
      {/* Suivi historique */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <CardLabel icon={Activity}>Suivi du portefeuille (à partir d'aujourd'hui)</CardLabel>
        <button
          onClick={() => captureSnapshot(false)}
          disabled={trackLoading}
          className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition-colors"
        >
          <RefreshCw size={14} className={trackLoading ? "animate-spin" : ""} />
          {trackLoading ? "Mise à jour..." : "Actualiser le suivi"}
        </button>
      </div>
      {trackError && <p className="text-micro text-amber-300/80">{trackError}</p>}
       
       {/* Gestion des points d'historique (suppression d'un jour aberrant) */}
      {bourseHistory.length > 0 && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer hover:text-slate-300 select-none">Gérer les points d'historique ({bourseHistory.length})</summary>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800">
            {[...bourseHistory].reverse().map((e) => (
              <div key={e.date} className="flex items-center justify-between px-3 py-1.5">
                <span className="font-data">{formatDateShort(e.date)}</span>
                <span className="font-data ghost-blur text-slate-400">{eur(e.valeur)}</span>
                <button onClick={() => deleteHistoryPoint(e.date)} className="text-slate-600 hover:text-rose-400 p-1">
                  <XIcon size={13} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {!hasEnoughHistory ? (
        <Card accent={CARD_THEMES.violet}>
          <EmptyState>
            {bourseHistory.length === 0
              ? "Aucun suivi encore — clique sur « Actualiser le suivi » pour démarrer."
              : `Suivi démarré le ${formatDateShort(bourseHistory[0].date)} — reviens dans les prochains jours.`}
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* ─── Indicateurs clés ─── */}
          <Card accent={CARD_THEMES.violet}>
            <CardLabel icon={Target}>Indicateurs de performance</CardLabel>
            {bourseHistory.length < MIN_POINTS_FOR_STATS && (
              <p className="text-micro text-amber-300/80 -mt-1 mb-2 flex items-center gap-1.5">
                <Info size={12} className="shrink-0" />
                Certains indicateurs (volatilité, Sharpe, alpha/bêta, rendement annualisé) ne s'affichent qu'à partir d'un historique
                suffisant ({bourseHistory.length} j sur {MIN_POINTS_FOR_STATS}-{MIN_DAYS_FOR_ANNUALIZATION} j requis) — sur trop peu de
                jours, ils donneraient des chiffres extrapolés absurdes.
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
              <MetricCard
                icon={TrendingUp} label={twr && !twr.reliable ? "Rendement sur période" : "Rendement annualisé (TWR)"}
                value={twr ? (twr.reliable ? pct(twr.annualizedPct) : pct(twr.totalReturnPct)) : "—"}
                sub={
                  !twr
                    ? "Historique insuffisant"
                    : twr.reliable
                    ? `Total sur période : ${pct(twr.totalReturnPct)}`
                    : `Annualisation dispo à partir de ${MIN_DAYS_FOR_ANNUALIZATION} j de suivi (${Math.round(twr.daysSpan)} j pour l'instant)`
                }
                tone={twr && (twr.reliable ? twr.annualizedPct >= 0 : twr.totalReturnPct >= 0) ? "emerald" : "rose"}
              />
              <MetricCard
                icon={Percent} label="XIRR (flux réels)"
                value={xirr != null ? pct(xirr) : "—"}
                sub={xirr != null ? "Taux tenant compte des dates de versement" : `Fiable à partir de ${MIN_DAYS_FOR_ANNUALIZATION} j de suivi`}
                tone={xirr != null && xirr >= 0 ? "emerald" : xirr == null ? "slate" : "rose"}
              />
              <MetricCard
                icon={Activity} label="Volatilité annualisée"
                value={volatility != null ? pctPlain(volatility) : "—"}
                sub={volatility != null ? `Marché actions ≈ ${MARKET_BENCHMARKS.volatility.market}%` : `Fiable à partir de ${MIN_POINTS_FOR_STATS} points`}
                tone="amber"
              />
              <MetricCard
                icon={TrendingDown} label="Max drawdown"
                value={maxDD ? pctPlain(maxDD.maxDrawdownPct) : "—"}
                sub={
                  maxDD
                    ? maxDD.recoveryDays != null
                      ? `Récupéré en ${maxDD.recoveryDays} j`
                      : maxDD.stillInDrawdown ? "Pas encore récupéré" : "—"
                    : "—"
                }
                tone="rose"
              />
              <MetricCard
                icon={Scale} label="Ratio de Sharpe"
                value={sharpe != null ? sharpe.toFixed(2) : "—"}
                sub={sharpe != null ? `Bon ≥ ${MARKET_BENCHMARKS.sharpe.good} · marché ≈ ${MARKET_BENCHMARKS.sharpe.market}` : `Fiable à partir de ${MIN_POINTS_FOR_STATS} points`}
                tone={sharpe != null && sharpe >= MARKET_BENCHMARKS.sharpe.good ? "emerald" : "amber"}
              />
              <MetricCard
                icon={Scale} label="Bêta (vs S&P 500)"
                value={alphaBeta ? alphaBeta.beta.toFixed(2) : "—"}
                sub={alphaBeta ? "Sensibilité au marché — 1 = comme le marché" : `Fiable à partir de ${MIN_POINTS_FOR_STATS} points`}
                tone="violet"
              />
              <MetricCard
                icon={Target} label="Alpha annualisé (vs S&P 500)"
                value={alphaBeta ? pct(alphaBeta.alphaAnnualizedPct) : "—"}
                sub={alphaBeta ? "Surperformance nette de la sensibilité au marché" : `Fiable à partir de ${MIN_POINTS_FOR_STATS} points`}
                tone={alphaBeta && alphaBeta.alphaAnnualizedPct >= 0 ? "emerald" : "rose"}
              />
              <MetricCard
                icon={Coins} label="Frais / performance"
                value={feeEfficiency.ratioPct != null ? pctPlain(Math.abs(feeEfficiency.ratioPct)) : "—"}
                sub={
                  feeEfficiency.ratioPct != null
                    ? `${eur(feeEfficiency.totalFees, 2)} de frais pour ${eur(feeEfficiency.totalGain, 2)} de gain — ratio élevé si le gain est encore faible`
                    : "Pas encore de gain pour calculer ce ratio"
                }
                subSensitive={feeEfficiency.ratioPct != null}
                tone="amber"
              />
            </div>

            {/* Repères marché */}
            <div className="mt-4 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-1.5 text-micro uppercase tracking-wide text-slate-500 mb-1">
                <Info size={11} /> Repères de marché (indicatif)
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6">
                {twr && twr.reliable && (
                  <BenchmarkGauge label="Rendement annualisé" value={twr.annualizedPct} target={MARKET_BENCHMARKS.annualReturn.market} unit="%" />
                )}
                {twr && twr.reliable && (
                  <BenchmarkGauge label="vs investisseur moyen (comportemental)" value={twr.annualizedPct} target={MARKET_BENCHMARKS.annualReturn.investorAvg} unit="%" />
                )}
                {volatility != null && (
                  <BenchmarkGauge label="Volatilité" value={volatility} target={MARKET_BENCHMARKS.volatility.market} unit="%" higherIsBetter={false} />
                )}
                {sharpe != null && (
                  <BenchmarkGauge label="Sharpe" value={sharpe} target={MARKET_BENCHMARKS.sharpe.good} digits={2} />
                )}
                {alphaBeta && (
                  <BenchmarkGauge label="Bêta" value={alphaBeta.beta} target={MARKET_BENCHMARKS.beta.market} digits={2} higherIsBetter={false} />
                )}
                {maxDD && (
                  <BenchmarkGauge label="Max drawdown" value={maxDD.maxDrawdownPct} target={MARKET_BENCHMARKS.maxDrawdown.market} unit="%" higherIsBetter={false} />
                )}
              </div>
            </div>
          </Card>

          {/* ─── Meilleur / pire jour & mois ─── */}
          {bestWorst && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={Activity}>Extrêmes de performance</CardLabel>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <MetricCard icon={ArrowUp} label="Meilleur jour" value={pct(bestWorst.bestDay.r)} sub={formatDateShort(bestWorst.bestDay.date)} tone="emerald" />
                <MetricCard icon={ArrowDown} label="Pire jour" value={pct(bestWorst.worstDay.r)} sub={formatDateShort(bestWorst.worstDay.date)} tone="rose" />
                {bestWorst.bestMonth && (
                  <MetricCard icon={ArrowUp} label="Meilleur mois" value={pct(bestWorst.bestMonth.r)} sub={bestWorst.bestMonth.month} tone="emerald" />
                )}
                {bestWorst.worstMonth && (
                  <MetricCard icon={ArrowDown} label="Pire mois" value={pct(bestWorst.worstMonth.r)} sub={bestWorst.worstMonth.month} tone="rose" />
                )}
              </div>
            </Card>
          )}

          {/* ─── Performance glissante ─── */}
          {rolling && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={TrendingUp}>Performance glissante</CardLabel>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-2">
                {[
                  ["1M", rolling.m1], ["3M", rolling.m3], ["6M", rolling.m6],
                  ["1A", rolling.y1], ["YTD", rolling.ytd], ["Origine", rolling.sinceOrigin],
                ].map(([label, val]) => (
                  <div key={label} className="text-center">
                    <div className="text-micro uppercase tracking-wide text-slate-500">{label}</div>
                    <div className={`font-data tabular-nums text-sm mt-0.5 ${val == null ? "text-slate-600" : val >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {val != null ? pct(val) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ─── Contribution par ligne ─── */}
          {contribution.length > 0 && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={PieIcon}>Contribution à la performance par ligne</CardLabel>
              <div className="space-y-2 mt-2">
                {contribution.map((c) => (
                  <div key={c.ticker} className="flex items-center gap-3">
                    <span className="text-xs text-slate-300 w-20 truncate">{c.ticker}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${c.gainAbs >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                        style={{ width: `${Math.max(2, c.sharePct)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-data tabular-nums w-20 text-right ghost-blur ${c.gainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {eur(c.gainAbs)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ─── TSR avec/sans dividendes ─── */}
          {tsr && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={Coins}>Rendement total avec dividendes réinvestis (TSR)</CardLabel>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <MetricCard label="Sans dividendes" value={pct(tsr.withoutDividends)} tone={tsr.withoutDividends >= 0 ? "emerald" : "rose"} />
                <MetricCard label="Avec dividendes réinvestis (TSR)" value={pct(tsr.withDividends)} sub={`${eur(tsr.dividendsInPeriod, 2)} de dividendes perçus`} subSensitive tone={tsr.withDividends >= 0 ? "emerald" : "rose"} />
              </div>
            </Card>
          )}

          {/* ─── Graphique capital vs valeur, avec drawdown et annotations d'ordres ─── */}
          <Card accent={CARD_THEMES.violet}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <CardLabel>Capital investi vs valeur actuelle</CardLabel>
              <RangeSelector range={perfRange} setRange={setPerfRange} />
            </div>
            <div className="h-96 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rangedHistory} margin={{ left: 0, right: 12, top: 14, bottom: 4 }}>
                  <defs>
                    <linearGradient id="bourseValeurFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgb(var(--c-slate-800))" strokeDasharray="0" vertical={false} />
                  <XAxis
                    dataKey="date" tickFormatter={formatDateShort}
                    tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 11 }} axisLine={false} tickLine={false}
                    minTickGap={60} tickMargin={10}
                  />
                  <YAxis
                    tickFormatter={compact} tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 11 }}
                    axisLine={false} tickLine={false} width={56} tickMargin={6} tickCount={6}
                    domain={[(min) => min * 0.97, (max) => max * 1.03]}
                  />
                  <Tooltip
                    content={<EnrichedHistoryTooltip drawdownByDate={drawdownByDate} markersByDate={markersByDate} />}
                    cursor={{ stroke: "#a78bfa", strokeWidth: 1, strokeDasharray: "3 4" }}
                  />
                  {/* Zones grisées de drawdown */}
                  {drawdownSeries.map((d, i) => {
                    if (d.ddPct >= -0.3) return null;
                    const next = drawdownSeries[i + 1];
                    if (!next) return null;
                    return (
                      <ReferenceArea key={d.date} x1={d.date} x2={next.date} fill="rgb(var(--c-slate-500))" fillOpacity={0.1} strokeOpacity={0} />
                    );
                  })}
                  <Area
                    type="monotone" dataKey="valeur" name="Valeur du portefeuille"
                    stroke="#a78bfa" strokeWidth={2.25} fill="url(#bourseValeurFill)" dot={false}
                    activeDot={{ r: 4, fill: "#a78bfa", stroke: "#020617", strokeWidth: 2 }}
                    animationDuration={450}
                  />
                  <Line
                    type="monotone" dataKey="capital" name="Capital investi"
                    stroke="#94a3b8" strokeWidth={1.75} strokeDasharray="5 4" dot={false}
                    activeDot={{ r: 3.5, fill: "rgb(var(--c-slate-400))", stroke: "#020617", strokeWidth: 2 }}
                    animationDuration={450}
                  />
                  {/* Achats (vert), ventes (rouge) et dividendes (bleu) posés sur la courbe */}
                  {operationMarkers.map((m) => (
                    <ReferenceDot
                      key={m.date}
                      x={m.date}
                      y={m.value}
                      isFront
                      shape={<OperationMarkerShape marker={m} />}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <ChartLegendItem color="#a78bfa" label="Valeur du portefeuille" shape="bar" />
              <ChartLegendItem color="#94a3b8" label="Capital investi" shape="bar" />
              <ChartLegendItem color={OP_MARKERS.ACHAT.color} label="Achat" />
              <ChartLegendItem color={OP_MARKERS.VENTE.color} label="Vente" />
              <ChartLegendItem color={OP_MARKERS.DIVIDENDE.color} label="Versement de dividende" />
              <ChartLegendItem color="rgba(100,116,139,0.3)" label="Zone de drawdown" shape="bar" />
            </div>
            {operations.length === 0 && (
              <p className="text-micro text-slate-600 mt-2">
                Les repères d'achat, de vente et de dividende apparaissent dès que des opérations sont
                enregistrées dans l'onglet Opérations.
              </p>
            )}
          </Card>

          {/* ─── Comparaison aux indices ─── */}
          <Card accent={CARD_THEMES.violet}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <CardLabel>Comparaison aux indices (base 100)</CardLabel>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDividendsReinvested((v) => !v)}
                  className={`text-micro font-medium px-2.5 py-1 rounded-md border transition-colors ${
                    showDividendsReinvested ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" : "text-slate-500 border-slate-800 hover:text-slate-300"
                  }`}
                  title="Inclure les dividendes réinvestis dans la courbe du portefeuille"
                >
                  {showDividendsReinvested ? "Avec dividendes" : "Sans dividendes"}
                </button>
              </div>
            </div>

            {/* Multi-select indices */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {ALL_BENCHMARKS.map((b) => (
                <button
                  key={b.symbol}
                  onClick={() => toggleBenchmark(b.symbol)}
                  className={`text-micro font-medium px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 ${
                    selectedBenchmarks.includes(b.symbol) ? "text-slate-100" : "text-slate-500 border-slate-800 hover:text-slate-300"
                  }`}
                  style={selectedBenchmarks.includes(b.symbol) ? { borderColor: b.color, background: `${b.color}22` } : {}}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.color }} />
                  {b.name}
                </button>
              ))}
            </div>

            {!hasEnoughBase100 ? (
              <EmptyState>Comparaison disponible après plusieurs jours de suivi.</EmptyState>
            ) : (
              <div className="h-96 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={base100Data} margin={{ left: 0, right: 12, top: 14, bottom: 4 }}>
                    <CartesianGrid stroke="rgb(var(--c-slate-800))" strokeDasharray="0" vertical={false} />
                    <XAxis
                      dataKey="date" tickFormatter={formatDateShort}
                      tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 11 }} axisLine={false} tickLine={false}
                      minTickGap={60} tickMargin={10}
                    />
                    <YAxis
                      tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 11 }} axisLine={false} tickLine={false}
                      width={44} tickMargin={6} tickCount={6}
                      domain={[(min) => Math.min(100, min) - 2, (max) => Math.max(100, max) + 2]}
                    />
                    <Tooltip content={<BenchmarkCompareTooltip />} cursor={{ stroke: "#fbbf24", strokeWidth: 1, strokeDasharray: "3 4" }} />
                    {/* Ligne du point de départ : au-dessus = gain, en dessous = perte */}
                    <ReferenceLine y={100} stroke="#475569" strokeDasharray="4 4" strokeWidth={1} />
                    {ALL_BENCHMARKS.filter((b) => selectedBenchmarks.includes(b.symbol)).map((b) => (
                      <Line
                        key={b.symbol} type="monotone" dataKey={ALL_BENCHMARK_KEYS[b.symbol]} name={b.name}
                        stroke={b.color} strokeWidth={1.5} strokeOpacity={0.85} dot={false}
                        activeDot={{ r: 3.5, stroke: "#020617", strokeWidth: 2 }} animationDuration={450}
                      />
                    ))}
                    {/* Le portefeuille est tracé en dernier pour rester au-dessus des indices */}
                    <Line
                      type="monotone" dataKey="valeur" name="Mon portefeuille" stroke="#fbbf24"
                      strokeWidth={2.75} dot={false}
                      activeDot={{ r: 4.5, fill: "#fbbf24", stroke: "#020617", strokeWidth: 2 }}
                      animationDuration={450}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-2">
              <Legend2 color="#fbbf24" label="Mon portefeuille" />
              {ALL_BENCHMARKS.filter((b) => selectedBenchmarks.includes(b.symbol)).map((b) => <Legend2 key={b.symbol} color={b.color} label={b.name} />)}
            </div>
          </Card>

          {/* ─── Écart de surperformance (zone colorée) ─── */}
          {primaryBenchKey && spreadData.length > 1 && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={Activity}>
                Surperformance vs {ALL_BENCHMARKS.find((b) => b.symbol === selectedBenchmarks[0])?.name}
              </CardLabel>
              <div className="h-60 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={spreadData} margin={{ left: 0, right: 12, top: 14, bottom: 4 }}>
                    <defs>
                      {/* Une seule aire, dont le dégradé bascule du vert au rouge
                          exactement à la hauteur du zéro. */}
                      <linearGradient id="spreadFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={0} stopColor="#34d399" stopOpacity={0.5} />
                        <stop offset={spreadZeroOffset} stopColor="#34d399" stopOpacity={0.04} />
                        <stop offset={spreadZeroOffset} stopColor="#fb7185" stopOpacity={0.04} />
                        <stop offset={1} stopColor="#fb7185" stopOpacity={0.5} />
                      </linearGradient>
                      <linearGradient id="spreadStroke" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={0} stopColor="#34d399" />
                        <stop offset={spreadZeroOffset} stopColor="#34d399" />
                        <stop offset={spreadZeroOffset} stopColor="#fb7185" />
                        <stop offset={1} stopColor="#fb7185" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgb(var(--c-slate-800))" strokeDasharray="0" vertical={false} />
                    <XAxis
                      dataKey="date" tickFormatter={formatDateShort}
                      tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 11 }} axisLine={false} tickLine={false}
                      minTickGap={60} tickMargin={10}
                    />
                    <YAxis
                      tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 11 }} axisLine={false} tickLine={false}
                      width={44} tickMargin={6} tickCount={5} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}`}
                    />
                    <Tooltip
                      formatter={(v) => [`${v >= 0 ? "+" : ""}${v.toFixed(1)} pts`, "Écart"]}
                      labelFormatter={formatDateShort}
                      cursor={{ stroke: "#a78bfa", strokeWidth: 1, strokeDasharray: "3 4" }}
                      contentStyle={{ background: "rgba(2,6,23,0.95)", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                    />
                    <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" strokeWidth={1} />
                    <Area
                      type="monotone" dataKey="spread" name="Écart (pts base 100)"
                      stroke="url(#spreadStroke)" strokeWidth={2} fill="url(#spreadFill)"
                      dot={false} activeDot={{ r: 4, stroke: "#020617", strokeWidth: 2 }}
                      animationDuration={450}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-micro text-slate-500 mt-2">
                Zone au-dessus de zéro = surperformance de ton portefeuille vs l'indice ; en-dessous = sous-performance.
              </p>
            </Card>
          )}
        </>
      )}

      {/* Dividendes réellement encaissés confrontés aux attendus, et TRI par
          ligne. Placé ici plutôt que dans Portefeuille : ce sont des mesures de
          performance, pas de composition. */}
      <SuiviDividendes bourse={bourse} />
    </>
  );
}

function Legend2({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-micro text-slate-400">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
