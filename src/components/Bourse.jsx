import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  TrendingUp, Wallet, RefreshCw, Pencil, Check, X as XIcon,
  PieChart as PieIcon, Activity, ArrowUpDown, ArrowUp, ArrowDown, Coins, AlertTriangle, BookOpen, LayoutGrid, Briefcase,
  Info, TrendingDown, Target, Percent, Scale, Search,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, ComposedChart, Area, XAxis, YAxis, CartesianGrid, ReferenceArea,
} from "recharts";
import { Card, CardLabel, GhostButton, IconTrash, EmptyState, PageGlow, CARD_THEMES } from "./ui";
import AssetLogo from "./AssetLogo";
import SectorHeatmap from "./SectorHeatmap";
import {
  eur, pctPlain, pct, uid, compact, rebaseTo100, upsertByDate, computeDividendSummary,
  MARKET_BENCHMARKS, computeTWR, computeXIRR, computeVolatility, computeMaxDrawdown,
  computeDrawdownSeries, computeSharpeRatio, computeBestWorst, computeAlphaBeta,
  computeContribution, computeRollingPerformance, computeFeeEfficiency, computeTSR,
  filterHistoryByRange, MIN_DAYS_FOR_ANNUALIZATION, MIN_POINTS_FOR_STATS,
} from "../lib/finance";
import { searchSecurity, fetchQuotes } from "../lib/api";
import { usePersistentState } from "../lib/storage";
import Watchlist from "./Watchlist";
import FinancialCalendar from "./FinancialCalendar";
import Marche from "./Marche";

// Reprend le même code couleur que le module Stratégie & Logs pour que le
// statut d'une thèse se reconnaisse d'un coup d'œil, qu'on le voie dans le
// journal de bord ou dans le widget Anti-Panique du tableau de positions.
const STRATEGY_STATUS = {
  intacte: { label: "intacte", dot: "bg-emerald-400", text: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30" },
  surveiller: { label: "à surveiller", dot: "bg-amber-400", text: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/30" },
  invalidee: { label: "invalidée", dot: "bg-rose-400", text: "text-rose-300", bg: "bg-rose-500/10 border-rose-500/30" },
};

function formatDateFrShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const BENCHMARKS = [
  { symbol: "^GSPC", name: "S&P 500", color: "#38bdf8" },
  { symbol: "^FCHI", name: "CAC 40", color: "#a78bfa" },
  { symbol: "URTH", name: "MSCI World", color: "#34d399" },
];
const BENCHMARK_KEYS = { "^GSPC": "sp500", "^FCHI": "cac40", URTH: "msciWorld" };
const PIE_PALETTE = ["#a78bfa", "#d946ef", "#818cf8", "#c084fc", "#22d3ee", "#f472b6", "#8b5cf6", "#e879f9"];

const today = () => new Date().toISOString().slice(0, 10);
const formatDateShort = (d) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
};

// ─── Sort config ──────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: "none", label: "Ordre d'ajout" },
  { key: "value_desc", label: "Valeur ↓" },
  { key: "value_asc", label: "Valeur ↑" },
  { key: "pnl_desc", label: "Plus-value ↓" },
  { key: "pnl_asc", label: "Plus-value ↑" },
  { key: "daily_desc", label: "Variation du jour ↓" },
  { key: "daily_asc", label: "Variation du jour ↑" },
  { key: "weight_desc", label: "Poids ↓" },
];

function SortButton({ sort, setSort }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const current = SORT_OPTIONS.find((o) => o.key === sort) || SORT_OPTIONS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-violet-300 border border-slate-700 hover:border-violet-500/50 rounded-lg px-3 py-1.5 transition-colors"
      >
        <ArrowUpDown size={13} />
        Trier : {current.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[200px]">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => { setSort(o.key); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${sort === o.key ? "text-amber-300 bg-slate-800" : "text-slate-300"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Daily variation cell ─────────────────────────────────────────────────────
function DailyVariation({ position, dailyData }) {
  const d = dailyData?.[position.ticker];
  if (!d) {
    return <span className="text-slate-600 text-xs font-data">—</span>;
  }
  const { changeAbs, changePct } = d;
  const pos = changeAbs >= 0;
  return (
    <div className={`flex items-center gap-1 font-data tabular-nums text-xs ${pos ? "text-emerald-400" : "text-rose-400"}`}>
      {pos ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      <span>
        {pos ? "+" : ""}{eur(changeAbs * position.quantity, 2)}
        <span className="opacity-70 ml-1">({pos ? "+" : ""}{changePct.toFixed(2)}%)</span>
      </span>
    </div>
  );
}

// ─── Widget Anti-Panique ─────────────────────────────────────────────────────
// Seuil de baisse journalière au-delà duquel le bouton "Lire ma thèse"
// apparaît sur la ligne — au-delà de ce seuil, c'est typiquement le moment où
// une décision impulsive est la plus tentante.
const PANIC_THRESHOLD_PCT = -5;

function AntiPanicModal({ position, note, onClose }) {
  if (!position) return null;
  const st = STRATEGY_STATUS[note?.statut] || STRATEGY_STATUS.intacte;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-950 p-5 shadow-[0_0_40px_rgba(244,63,94,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-rose-300">
            <AlertTriangle size={20} />
            <span className="text-xs font-bold uppercase tracking-wide">Secousse détectée</span>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-white transition-colors" aria-label="Fermer">
            <XIcon size={18} />
          </button>
        </div>

        <h3 className="text-lg font-bold text-slate-50 mb-0.5 flex items-center gap-2">
          <AssetLogo ticker={position.ticker} size="sm" />
          {position.ticker}
        </h3>
        <p className="text-sm text-slate-500 mb-4">{position.name}</p>

        {note ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${st.bg} ${st.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                Thèse {st.label}
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 mb-3">
              <p className="text-sm text-slate-300 leading-relaxed italic">
                💡 Rappel à toi-même (rédigé le {formatDateFrShort(note.date)}) :
              </p>
              {note.these && <p className="text-sm text-slate-200 mt-2 whitespace-pre-wrap">{note.these}</p>}
            </div>

            {note.conditions_vente && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-3">
                <div className="text-[11px] text-amber-300/80 font-semibold uppercase tracking-wide mb-1">
                  Tu ne vends que si...
                </div>
                <p className="text-sm text-slate-200 whitespace-pre-wrap">{note.conditions_vente}</p>
              </div>
            )}

            <p className="text-sm text-slate-400 leading-relaxed">
              Est-ce que l'une de ces conditions est vraie aujourd'hui ? Si non, cette baisse est probablement du bruit de marché. Respire, et laisse la thèse jouer.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
            Aucune thèse enregistrée pour {position.ticker}. Sans repère écrit à froid, c'est le moment idéal pour ne prendre aucune décision impulsive — attends d'avoir de quoi te relire la prochaine fois.
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryTooltip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{formatDateShort(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 font-data tabular-nums">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name} :</span>
          <span className="text-slate-100">{mode === "base100" ? p.value.toFixed(1) : eur(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Bourse({
  bourse, setBourse, bourseTotal, bourseInvested, bourseGainAbs, bourseGainPct,
  bourseHistory, setBourseHistory, watchlist, setWatchlist, strategyNotes = [],
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [panicPosition, setPanicPosition] = useState(null);
  const [subTab, setSubTab] = useState("portefeuille"); // "portefeuille" | "performance" | "marche"
  // Requête d'ouverture d'une fiche dans l'onglet Marché depuis le tableau de
  // positions ou la watchlist. Le "ts" force le re-déclenchement de l'effet
  // dans <Marche> même si on reclique deux fois de suite sur la même valeur.
  const [marcheRequest, setMarcheRequest] = useState(null);
  const openInMarche = (ticker) => {
    setMarcheRequest({ symbol: ticker.toUpperCase(), ts: Date.now() });
    setSubTab("marche");
  };

  // ─── État de l'onglet Performance ────────────────────────────────────────
  const [perfRange, setPerfRange] = useState("MAX"); // "1M" | "3M" | "YTD" | "1A" | "MAX"
  const [selectedBenchmarks, setSelectedBenchmarks] = useState(["^GSPC", "^FCHI", "URTH"]);
  const [showDividendsReinvested, setShowDividendsReinvested] = useState(false);

  // Retrouve la note de thèse la plus pertinente pour un ticker : priorité à
  // une note active (non clôturée), sinon la plus récente toutes confondues.
  const findNoteForTicker = (ticker) => {
    const matches = strategyNotes.filter((n) => n.ticker?.toUpperCase() === ticker?.toUpperCase());
    if (matches.length === 0) return null;
    const active = matches.filter((n) => !n.archivee).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (active.length > 0) return active[0];
    return matches.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  };

  // ─── Persistance du tri et des données de variation ──────────────────────
  const [sort, setSort] = usePersistentState("bourseSort", "none");
  const [dailyData, setDailyData] = usePersistentState("bourseDailyData", {});

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ quantity: "", pru: "", current_price: "", annual_dividend: "" });
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");

  const addPosition = (v) =>
    setBourse((b) => ({
      ...b,
      positions: [
        ...b.positions,
        { id: uid(), ticker: v.ticker, name: v.name, quantity: v.quantity, pru: v.pru, current_price: v.current_price, type: v.type, annual_dividend: v.annual_dividend || 0 },
      ],
    }));
  const removePosition = (id) => setBourse((b) => ({ ...b, positions: b.positions.filter((x) => x.id !== id) }));

  const startEdit = (p) => { setEditingId(p.id); setEditValues({ quantity: String(p.quantity), pru: String(p.pru), current_price: String(p.current_price), annual_dividend: String(p.annual_dividend || 0) }); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = (id) => {
    setBourse((b) => ({
      ...b,
      positions: b.positions.map((p) =>
        p.id === id ? { ...p, quantity: parseFloat(editValues.quantity) || 0, pru: parseFloat(editValues.pru) || 0, current_price: parseFloat(editValues.current_price) || 0, annual_dividend: parseFloat(editValues.annual_dividend) || 0 } : p
      ),
    }));
    setEditingId(null);
  };

  const refreshPrices = async () => {
    if (bourse.positions.length === 0) return;
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const symbols = bourse.positions.map((p) => p.ticker);
      const quotes = await fetchQuotes(symbols);
      const newDailyData = {};
      setBourse((b) => ({
        ...b,
        positions: b.positions.map((p) => {
          const q = quotes.find((x) => x.symbol === p.ticker);
          if (q?.ok) {
            // Compute daily variation
            if (q.previousClose && q.price) {
              newDailyData[p.ticker] = {
                changeAbs: q.price - q.previousClose,
                changePct: ((q.price - q.previousClose) / q.previousClose) * 100,
              };
            }
            return { ...p, current_price: q.price };
          }
          return p;
        }),
      }));
      // Mettre à jour les données persistées (fusionner avec les existantes)
      setDailyData((prev) => ({ ...prev, ...newDailyData }));
      const failed = quotes.filter((q) => !q.ok).length;
      setRefreshMsg(failed > 0 ? `${failed} cours sur ${quotes.length} n'ont pas pu être actualisés.` : "Tous les cours ont été actualisés.");
    } catch {
      setRefreshMsg("Actualisation impossible — vérifiez votre connexion internet.");
    } finally {
      setRefreshing(false);
    }
  };

  const pieData = useMemo(
    () => bourse.positions.map((p, i) => ({ name: p.ticker, value: p.quantity * p.current_price, color: PIE_PALETTE[i % PIE_PALETTE.length] })).filter((d) => d.value > 0),
    [bourse.positions]
  );

  const dividendSummary = useMemo(() => computeDividendSummary(bourse.positions), [bourse.positions]);

  const captureSnapshot = async (silent = false) => {
    if (!silent) { setTrackLoading(true); setTrackError(""); }
    try {
      const tickers = [...new Set(bourse.positions.map((p) => p.ticker))];
      const allSymbols = [...tickers, ...BENCHMARKS.map((b) => b.symbol)];
      const quotes = allSymbols.length > 0 ? await fetchQuotes(allSymbols) : [];
      const priceMap = {};
      quotes.forEach((q) => { if (q.ok) priceMap[q.symbol] = q.price; });

      const valeur = bourse.positions.reduce((sum, p) => sum + (priceMap[p.ticker] ?? p.current_price) * p.quantity, 0) + bourse.cash_pocket;
      const capital = bourseInvested + bourse.cash_pocket;

      const entry = {
        date: today(),
        valeur: Math.round(valeur),
        capital: Math.round(capital),
        sp500: priceMap["^GSPC"] ?? null,
        cac40: priceMap["^FCHI"] ?? null,
        msciWorld: priceMap["URTH"] ?? null,
      };
      setBourseHistory((h) => upsertByDate(h, entry));

      const failed = quotes.filter((q) => !q.ok).length;
      if (failed > 0) setTrackError(`${failed} cotation(s) sur ${quotes.length} indisponible(s).`);
    } catch {
      setTrackError("Mise à jour du suivi impossible — vérifie ta connexion internet.");
    } finally {
      if (!silent) setTrackLoading(false);
    }
  };

  useEffect(() => {
    const hasToday = bourseHistory.some((e) => e.date === today());
    if (!hasToday) captureSnapshot(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base100Data = useMemo(() => rebaseTo100(bourseHistory, ["valeur", "sp500", "cac40", "msciWorld"]), [bourseHistory]);
  const hasEnoughHistory = bourseHistory.length >= 2;
  const hasEnoughBase100 = base100Data.length >= 2;

  // ─── Sorted positions ───────────────────────────────────────────────────────
  const sortedPositions = useMemo(() => {
    const positions = [...bourse.positions];
    const getVal = (p) => p.quantity * p.current_price;
    const getPnl = (p) => (p.current_price - p.pru) * p.quantity;
    const getDaily = (p) => {
      const d = dailyData[p.ticker];
      return d ? d.changePct : 0;
    };
    const getWeight = (p) => bourseTotal > 0 ? (getVal(p) / bourseTotal) * 100 : 0;

    switch (sort) {
      case "value_desc": return positions.sort((a, b) => getVal(b) - getVal(a));
      case "value_asc": return positions.sort((a, b) => getVal(a) - getVal(b));
      case "pnl_desc": return positions.sort((a, b) => getPnl(b) - getPnl(a));
      case "pnl_asc": return positions.sort((a, b) => getPnl(a) - getPnl(b));
      case "daily_desc": return positions.sort((a, b) => getDaily(b) - getDaily(a));
      case "daily_asc": return positions.sort((a, b) => getDaily(a) - getDaily(b));
      case "weight_desc": return positions.sort((a, b) => getWeight(b) - getWeight(a));
      default: return positions;
    }
  }, [bourse.positions, sort, dailyData, bourseTotal]);

  // ─── Portfolio daily total variation ───────────────────────────────────────
  const portfolioDailyChange = useMemo(() => {
    let total = 0;
    let hasData = false;
    bourse.positions.forEach((p) => {
      const d = dailyData[p.ticker];
      if (d) { total += d.changeAbs * p.quantity; hasData = true; }
    });
    return hasData ? total : null;
  }, [bourse.positions, dailyData]);

  return (
    <div className="relative space-y-6">
      <PageGlow color="violet" />
      <div className="relative">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="font-display text-2xl text-slate-50">
            PEA &amp; <span className="text-violet-400">Bourse</span>
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Enveloppe fiscale
            <select
              value={bourse.envelope || "PEA"}
              onChange={(e) => setBourse((b) => ({ ...b, envelope: e.target.value }))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-violet-400/60"
            >
              <option value="PEA">PEA</option>
              <option value="CTO">CTO</option>
              <option value="PER">PER</option>
            </select>
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-1">Positions actions / ETF — analyse de portefeuille.</p>
      </div>

      {/* Sous-onglets */}
      <div className="relative flex items-center gap-2 border-b border-slate-800 pb-1">
        <button
          onClick={() => setSubTab("portefeuille")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "portefeuille" ? "text-violet-300 border-b-2 border-violet-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Briefcase size={14} /> Portefeuille
        </button>
        <button
          onClick={() => setSubTab("performance")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "performance" ? "text-violet-300 border-b-2 border-violet-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Activity size={14} /> Performance
        </button>
        <button
          onClick={() => setSubTab("marche")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "marche" ? "text-violet-300 border-b-2 border-violet-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Search size={14} /> Marché
        </button>
      </div>

      {subTab === "portefeuille" && (
      <>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card accent={CARD_THEMES.violet}>
          <CardLabel>Valeur du portefeuille</CardLabel>
          <div className="font-display text-xl text-slate-100 ghost-blur">{eur(bourseTotal)}</div>
          {portfolioDailyChange !== null && (
            <div className={`flex items-center gap-1 text-xs mt-1 font-data ghost-blur ${portfolioDailyChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {portfolioDailyChange >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {portfolioDailyChange >= 0 ? "+" : ""}{eur(portfolioDailyChange)} aujourd'hui
            </div>
          )}
        </Card>
        <Card accent={CARD_THEMES.violet}>
          <CardLabel>Plus/moins-value latente</CardLabel>
          <div className={`font-display text-xl ghost-blur ${bourseGainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{eur(bourseGainAbs)}</div>
          <div className={`text-xs mt-1 ${bourseGainAbs >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>{pct(bourseGainPct)}</div>
        </Card>
        <Card accent={CARD_THEMES.violet}>
          <CardLabel icon={Wallet}>Poche cash disponible</CardLabel>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              value={bourse.cash_pocket}
              onChange={(e) => setBourse((b) => ({ ...b, cash_pocket: parseFloat(e.target.value) || 0 }))}
              className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums ghost-blur focus:outline-none focus:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/30"
            />
            <span className="text-xs text-slate-600">€</span>
          </div>
        </Card>
      </div>

      {/* Dividendes */}
      <Card accent={CARD_THEMES.violet}>
        <CardLabel icon={Coins}>Revenus de dividendes estimés</CardLabel>
        {bourse.positions.length === 0 || dividendSummary.totalAnnualDividend === 0 ? (
          <EmptyState>
            Renseigne le dividende annuel par action de tes lignes (via le crayon d'édition) pour voir ton rendement et tes revenus estimés.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-1">
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Dividendes annuels</div>
              <div className="font-display text-lg text-emerald-400 ghost-blur">{eur(dividendSummary.totalAnnualDividend, 2)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Moyenne mensuelle</div>
              <div className="font-display text-lg text-slate-100 ghost-blur">{eur(dividendSummary.monthlyAverage, 2)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Rendement / valeur actuelle</div>
              <div className="font-display text-lg text-violet-300">{pctPlain(dividendSummary.portfolioYieldOnValue, 2)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Rendement / capital investi</div>
              <div className="font-display text-lg text-violet-300">{pctPlain(dividendSummary.portfolioYieldOnCost, 2)}</div>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Positions Table ─── */}
      <Card accent={CARD_THEMES.violet}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <CardLabel icon={TrendingUp}>Positions</CardLabel>
          <div className="flex items-center gap-2 flex-wrap">
            <SortButton sort={sort} setSort={setSort} />
            <button
              onClick={refreshPrices}
              disabled={refreshing || bourse.positions.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition-colors"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Actualisation..." : "Actualiser les cours"}
            </button>
            <GhostButton theme="violet" onClick={() => setShowAdd((s) => !s)}>Ajouter une position</GhostButton>
          </div>
        </div>

        {refreshMsg && <p className="text-[11px] text-amber-300/80 mb-3">{refreshMsg}</p>}

        {bourse.positions.length === 0 ? (
          <EmptyState>Aucune position pour le moment — ajoute ta première ligne via le bouton ci-dessus.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Actif</th>
                  <th className="py-2 pr-3">Qté</th>
                  <th className="py-2 pr-3">PRU</th>
                  <th className="py-2 pr-3">Cours</th>
                  <th className="py-2 pr-3">
                    <span className="flex items-center gap-1">
                      Var. J
                      <span className="text-[9px] text-slate-600 normal-case tracking-normal">(vs clôt. veille)</span>
                    </span>
                  </th>
                  <th className="py-2 pr-3">Valeur</th>
                  <th className="py-2 pr-3">+/− value</th>
                  <th className="py-2 pr-3">Poids</th>
                  <th className="py-2 pr-3">
                    <span className="flex items-center gap-1">
                      Div. annuel
                      <span className="text-[9px] text-slate-600 normal-case tracking-normal">(rdt · YoC)</span>
                    </span>
                  </th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {sortedPositions.map((p) => {
                  const isEditing = editingId === p.id;
                  const value = p.quantity * p.current_price;
                  const gainAbs = (p.current_price - p.pru) * p.quantity;
                  const gainPct = p.pru > 0 ? ((p.current_price - p.pru) / p.pru) * 100 : 0;
                  const weight = bourseTotal > 0 ? (value / bourseTotal) * 100 : 0;

                  if (isEditing) {
                    return (
                      <tr key={p.id} className="bg-slate-950/60">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <AssetLogo ticker={p.ticker} size="xs" />
                            <div>
                              <div className="text-slate-200 font-medium">{p.ticker}</div>
                              <div className="text-[11px] text-slate-500">{p.name} · {p.type}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          <input type="number" step="0.0001" value={editValues.quantity} onChange={(e) => setEditValues((v) => ({ ...v, quantity: e.target.value }))} className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60" />
                        </td>
                        <td className="py-2 pr-3">
                          <input type="number" step="0.01" value={editValues.pru} onChange={(e) => setEditValues((v) => ({ ...v, pru: e.target.value }))} className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60" />
                        </td>
                        <td className="py-2 pr-3">
                          <input type="number" step="0.01" value={editValues.current_price} onChange={(e) => setEditValues((v) => ({ ...v, current_price: e.target.value }))} className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60" />
                        </td>
                        <td className="py-3 pr-3 text-slate-600 text-xs" colSpan={3}>Aperçu après enregistrement</td>
                        <td className="py-2 pr-3">
                          <input type="number" step="0.01" placeholder="€ / action" value={editValues.annual_dividend} onChange={(e) => setEditValues((v) => ({ ...v, annual_dividend: e.target.value }))} className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60" />
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => saveEdit(p.id)} className="text-emerald-400 hover:text-emerald-300 p-1"><Check size={15} /></button>
                            <button onClick={cancelEdit} className="text-slate-500 hover:text-rose-400 p-1"><XIcon size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={p.id} className="group hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => openInMarche(p.ticker)}
                          title="Voir la fiche complète dans l'onglet Marché"
                          className="flex items-center gap-2 text-left group/ticker"
                        >
                          <AssetLogo ticker={p.ticker} size="xs" />
                          <div>
                            <div className="text-slate-200 font-medium group-hover/ticker:text-violet-300 transition-colors">{p.ticker}</div>
                            <div className="text-[11px] text-slate-500">{p.name} · {p.type}</div>
                          </div>
                        </button>
                      </td>
                      <td className="py-3 pr-3 font-data tabular-nums">{p.quantity}</td>
                      <td className="py-3 pr-3 font-data tabular-nums ghost-blur">{eur(p.pru, 2)}</td>
                      <td className="py-3 pr-3 font-data tabular-nums ghost-blur">{eur(p.current_price, 2)}</td>
                      <td className="py-3 pr-3">
                        <DailyVariation position={p} dailyData={dailyData} />
                        {(dailyData?.[p.ticker]?.changePct ?? 0) <= PANIC_THRESHOLD_PCT && (
                          <button
                            onClick={() => setPanicPosition(p)}
                            className="flex items-center gap-1 text-[10px] font-semibold text-rose-300 hover:text-rose-200 mt-1 animate-pulse"
                          >
                            <BookOpen size={11} /> Lire ma thèse
                          </button>
                        )}
                      </td>
                      <td className="py-3 pr-3 font-data tabular-nums ghost-blur">{eur(value)}</td>
                      <td className={`py-3 pr-3 font-data tabular-nums ghost-blur ${gainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {eur(gainAbs)} <span className="text-[11px] opacity-80">({pct(gainPct)})</span>
                      </td>
                      <td className="py-3 pr-3 font-data tabular-nums text-slate-400">{pctPlain(weight)}</td>
                      <td className="py-3 pr-3">
                        {p.annual_dividend > 0 ? (
                          <div className="font-data tabular-nums">
                            <div className="text-emerald-400 ghost-blur">{eur(p.annual_dividend * p.quantity, 2)}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <span>{pctPlain(p.current_price > 0 ? (p.annual_dividend / p.current_price) * 100 : 0, 2)} rdt</span>
                              {p.pru > 0 && (
                                <span className="text-amber-300/90" title="Rendement sur ton PRU (Yield on Cost)">
                                  · <span className="font-semibold">{pctPlain((p.annual_dividend / p.pru) * 100, 2)}</span> YoC
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(p)} className="text-slate-600 hover:text-amber-300 p-1"><Pencil size={14} /></button>
                          <IconTrash onClick={() => removePosition(p.id)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <AddPositionPanel open={showAdd} onClose={() => setShowAdd(false)} onSubmit={addPosition} />

        <p className="text-[11px] text-slate-600 mt-4">
          La variation journalière est calculée par rapport au cours de clôture de la veille, récupéré lors du dernier « Actualiser les cours ».
        </p>
      </Card>

      <Watchlist watchlist={watchlist} setWatchlist={setWatchlist} onOpenMarket={openInMarche} />

      {/* Pie */}
      <Card accent={CARD_THEMES.violet}>
        <CardLabel icon={PieIcon}>Répartition par ligne</CardLabel>
        {pieData.length === 0 ? (
          <EmptyState>Ajoute une position pour voir sa répartition.</EmptyState>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6 mt-2">
            <div className="h-64 w-full sm:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={100} paddingAngle={2} stroke="none">
                    {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
                        <span className="text-slate-100 font-data">{payload[0].name}</span>
                        <div className="text-slate-400">{eur(payload[0].value)}</div>
                      </div>
                    ) : null
                  } />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-1/2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-data tabular-nums text-slate-300">{pctPlain((d.value / bourseTotal) * 100)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <SectorHeatmap positions={bourse.positions} />
      </>
      )}

      {subTab === "performance" && (
      <PerformanceTab
        bourse={bourse}
        bourseHistory={bourseHistory}
        bourseGainAbs={bourseGainAbs}
        trackLoading={trackLoading}
        trackError={trackError}
        captureSnapshot={captureSnapshot}
        hasEnoughHistory={hasEnoughHistory}
        hasEnoughBase100={hasEnoughBase100}
        perfRange={perfRange}
        setPerfRange={setPerfRange}
        selectedBenchmarks={selectedBenchmarks}
        setSelectedBenchmarks={setSelectedBenchmarks}
        showDividendsReinvested={showDividendsReinvested}
        setShowDividendsReinvested={setShowDividendsReinvested}
      />
      )}

      {subTab === "marche" && <Marche watchlist={watchlist} setWatchlist={setWatchlist} openRequest={marcheRequest} />}

      {panicPosition && (
        <AntiPanicModal
          position={panicPosition}
          note={findNoteForTicker(panicPosition.ticker)}
          onClose={() => setPanicPosition(null)}
        />
      )}
    </div>
  );
}

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
    <div className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-slate-800/60 last:border-0">
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
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 mb-1">
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className={`font-display text-lg ${toneClass} ${valueSensitive ? "ghost-blur" : ""}`}>{value}</div>
      {sub && <div className={`text-[11px] text-slate-500 mt-0.5 ${subSensitive ? "ghost-blur" : ""}`}>{sub}</div>}
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
          className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
            range === r ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function EnrichedHistoryTooltip({ active, payload, label, drawdownByDate }) {
  if (!active || !payload?.length) return null;
  const valeur = payload.find((p) => p.dataKey === "valeur")?.value;
  const capital = payload.find((p) => p.dataKey === "capital")?.value;
  const dd = drawdownByDate?.[label];
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl space-y-1">
      <div className="text-slate-400">{formatDateShort(label)}</div>
      {valeur != null && <div className="text-violet-300 font-data tabular-nums ghost-blur">Valeur : {eur(valeur)}</div>}
      {capital != null && <div className="text-slate-400 font-data tabular-nums ghost-blur">Capital investi : {eur(capital)}</div>}
      {valeur != null && capital > 0 && (
        <div className={`font-data tabular-nums ${valeur >= capital ? "text-emerald-400" : "text-rose-400"}`}>
          {pct(((valeur - capital) / capital) * 100)}
        </div>
      )}
      {dd != null && dd < -0.05 && (
        <div className="text-rose-400/90 font-data tabular-nums">Drawdown : {dd.toFixed(1)} %</div>
      )}
    </div>
  );
}

function BenchmarkCompareTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl space-y-1">
      <div className="text-slate-400 mb-1">{formatDateShort(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 font-data tabular-nums">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name} :</span>
          <span className="text-slate-100">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function PerformanceTab({
  bourse, bourseHistory, bourseGainAbs, trackLoading, trackError, captureSnapshot,
  hasEnoughHistory, hasEnoughBase100, perfRange, setPerfRange,
  selectedBenchmarks, setSelectedBenchmarks, showDividendsReinvested, setShowDividendsReinvested,
}) {
  const operations = bourse.operations || [];

  const rangedHistory = useMemo(() => filterHistoryByRange(bourseHistory, perfRange), [bourseHistory, perfRange]);

  const twr = useMemo(() => computeTWR(bourseHistory), [bourseHistory]);
  const xirr = useMemo(() => computeXIRR(bourseHistory), [bourseHistory]);
  const volatility = useMemo(() => computeVolatility(bourseHistory), [bourseHistory]);
  const maxDD = useMemo(() => computeMaxDrawdown(bourseHistory), [bourseHistory]);
  const drawdownSeries = useMemo(() => computeDrawdownSeries(rangedHistory), [rangedHistory]);
  const drawdownByDate = useMemo(() => Object.fromEntries(drawdownSeries.map((d) => [d.date, d.ddPct])), [drawdownSeries]);
  const sharpe = useMemo(() => computeSharpeRatio(bourseHistory), [bourseHistory]);
  const bestWorst = useMemo(() => computeBestWorst(bourseHistory), [bourseHistory]);
  const alphaBeta = useMemo(() => computeAlphaBeta(bourseHistory, "sp500"), [bourseHistory]);
  const contribution = useMemo(() => computeContribution(bourse.positions), [bourse.positions]);
  const rolling = useMemo(() => computeRollingPerformance(bourseHistory), [bourseHistory]);
  const feeEfficiency = useMemo(() => computeFeeEfficiency(operations, bourseGainAbs), [operations, bourseGainAbs]);
  const tsr = useMemo(() => computeTSR(bourseHistory, operations), [bourseHistory, operations]);

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

  // Points cliquables : achats/ventes sur la courbe de capital investi
  const opsByDate = useMemo(() => {
    const map = {};
    operations.filter((op) => op.type === "ACHAT" || op.type === "VENTE").forEach((op) => {
      if (!map[op.date]) map[op.date] = [];
      map[op.date].push(op);
    });
    return map;
  }, [operations]);

  const OperationDot = (props) => {
    const { cx, cy, payload } = props;
    const ops = opsByDate[payload.date];
    if (!ops || cx == null || cy == null) return null;
    const isBuy = ops.some((o) => o.type === "ACHAT");
    return (
      <circle
        cx={cx} cy={cy} r={4}
        fill={isBuy ? "#34d399" : "#fb7185"}
        stroke="#0f172a" strokeWidth={1.5}
        style={{ cursor: "pointer" }}
      >
        <title>{ops.map((o) => `${o.type} ${o.asset} x${o.quantity}`).join(" · ")}</title>
      </circle>
    );
  };

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
      {trackError && <p className="text-[11px] text-amber-300/80">{trackError}</p>}

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
              <p className="text-[11px] text-amber-300/80 -mt-1 mb-2 flex items-center gap-1.5">
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
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 mb-1">
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
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
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
            <div className="h-80 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rangedHistory} margin={{ left: 0, right: 10, top: 10 }}>
                  <defs>
                    <linearGradient id="bourseValeurFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={50} />
                  <YAxis tickFormatter={compact} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip content={<EnrichedHistoryTooltip drawdownByDate={drawdownByDate} />} />
                  {/* Zones grisées de drawdown */}
                  {drawdownSeries.map((d, i) => {
                    if (d.ddPct >= -0.3) return null;
                    const next = drawdownSeries[i + 1];
                    if (!next) return null;
                    return (
                      <ReferenceArea key={d.date} x1={d.date} x2={next.date} fill="#64748b" fillOpacity={0.12} strokeOpacity={0} />
                    );
                  })}
                  <Area type="monotone" dataKey="valeur" name="Valeur du portefeuille" stroke="#a78bfa" strokeWidth={2.5} fill="url(#bourseValeurFill)" dot={<OperationDot />} />
                  <Line type="monotone" dataKey="capital" name="Capital investi" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Achat</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400" /> Vente</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-slate-500/30" /> Zone de drawdown</span>
            </div>
          </Card>

          {/* ─── Comparaison aux indices ─── */}
          <Card accent={CARD_THEMES.violet}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <CardLabel>Comparaison aux indices (base 100)</CardLabel>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDividendsReinvested((v) => !v)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
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
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 ${
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
              <div className="h-80 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={base100Data} margin={{ left: 0, right: 10, top: 10 }}>
                    <CartesianGrid stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={50} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<BenchmarkCompareTooltip />} />
                    <Line type="monotone" dataKey="valeur" name="Mon portefeuille" stroke="#fbbf24" strokeWidth={2.5} dot={false} />
                    {ALL_BENCHMARKS.filter((b) => selectedBenchmarks.includes(b.symbol)).map((b) => (
                      <Line key={b.symbol} type="monotone" dataKey={ALL_BENCHMARK_KEYS[b.symbol]} name={b.name} stroke={b.color} strokeWidth={1.5} dot={false} />
                    ))}
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
              <div className="h-56 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={spreadData} margin={{ left: 0, right: 10, top: 10 }}>
                    <defs>
                      <linearGradient id="spreadFillPos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="spreadFillNeg" x1="0" y1="1" x2="0" y2="0">
                        <stop offset="0%" stopColor="#fb7185" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#fb7185" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={50} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip
                      formatter={(v) => [`${v >= 0 ? "+" : ""}${v.toFixed(1)} pts`, "Écart"]}
                      labelFormatter={formatDateShort}
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="spread" name="Écart (pts base 100)" stroke="#a78bfa" strokeWidth={1.5} fill="url(#spreadFillPos)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Zone au-dessus de zéro = surperformance de ton portefeuille vs l'indice ; en-dessous = sous-performance.
              </p>
            </Card>
          )}
        </>
      )}

      <FinancialCalendar positions={bourse.positions} />
    </>
  );
}

function Legend2({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function AddPositionPanel({ open, onClose, onSubmit }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [pru, setPru] = useState("");
  const [annualDividend, setAnnualDividend] = useState("");
  const [manual, setManual] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); setSelected(null); setQuantity(""); setPru(""); setAnnualDividend(""); setManual(false); setError(""); }
  }, [open]);

  useEffect(() => {
    if (manual || selected) return;
    if (query.trim().length < 2) { setResults([]); return; }
    setLoading(true); setError("");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try { const r = await searchSecurity(query.trim()); setResults(r); }
      catch { setError("Recherche indisponible pour le moment."); }
      finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, manual, selected]);

  if (!open) return null;

  const pickResult = async (r) => {
    setSelected({ ...r, current_price: null, currency: "" });
    setResults([]); setLoading(true); setError("");
    try {
      const quotes = await fetchQuotes([r.symbol]);
      const q = quotes[0];
      if (q?.ok) setSelected((s) => ({ ...s, current_price: q.price, currency: q.currency }));
      else { setError("Cours indisponible — tu peux le saisir manuellement."); setSelected((s) => ({ ...s, current_price: 0 })); }
    } catch { setError("Cours indisponible — tu peux le saisir manuellement."); setSelected((s) => ({ ...s, current_price: 0 })); }
    finally { setLoading(false); }
  };

  const ready = manual ? query.trim().length > 0 : !!selected;

  const submit = (e) => {
    e.preventDefault();
    if (!quantity || !pru || !ready) return;
    if (manual) {
      onSubmit({ ticker: query.toUpperCase(), name: query, type: "Autre", quantity: parseFloat(quantity), pru: parseFloat(pru), current_price: parseFloat(pru), annual_dividend: parseFloat(annualDividend) || 0 });
    } else {
      onSubmit({ ticker: selected.symbol, name: selected.name, type: selected.type || "Autre", quantity: parseFloat(quantity), pru: parseFloat(pru), current_price: selected.current_price || 0, annual_dividend: parseFloat(annualDividend) || 0 });
    }
    onClose();
  };

  return (
    <form onSubmit={submit} className="mt-3 p-4 rounded-xl border border-amber-400/20 bg-slate-950 space-y-3">
      {!manual ? (
        <>
          <label className="text-[11px] text-slate-500">Ticker, ISIN ou nom du produit</label>
          <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Ex : CW8, FR0011550185, Air Liquide..." className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400/60" />
          {loading && <p className="text-xs text-slate-500">Recherche en cours…</p>}
          {error && <p className="text-xs text-amber-400/90">{error}</p>}
          {!selected && results.length > 0 && (
            <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 max-h-44 overflow-y-auto">
              {results.map((r) => (
                <button type="button" key={r.symbol} onClick={() => pickResult(r)} className="w-full text-left px-3 py-2 hover:bg-slate-800 text-sm">
                  <span className="text-slate-100 font-medium">{r.symbol}</span>
                  <span className="text-slate-500"> — {r.name} {r.exchange ? `(${r.exchange})` : ""}</span>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 px-3 py-2">
              <div>
                <div className="text-sm text-slate-100 font-medium">{selected.symbol} — {selected.name}</div>
                <div className="text-xs text-slate-500">Cours actuel : {selected.current_price != null ? `${selected.current_price} ${selected.currency || ""}` : "…"}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-slate-500 hover:text-rose-400">Changer</button>
            </div>
          )}
          <button type="button" onClick={() => setManual(true)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">Le produit n'est pas trouvé ? Saisie manuelle</button>
        </>
      ) : (
        <>
          <label className="text-[11px] text-slate-500">Nom / ticker (saisie libre)</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400/60" placeholder="Ex : Plan Épargne Entreprise" />
          <button type="button" onClick={() => setManual(false)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">Revenir à la recherche</button>
        </>
      )}
      {ready && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500">Quantité</label>
            <input required type="number" step="0.0001" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
          </div>
          <div>
            <label className="text-[11px] text-slate-500">Prix de revient unitaire (€)</label>
            <input required type="number" step="0.01" value={pru} onChange={(e) => setPru(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] text-slate-500">Dividende annuel par action (€) — optionnel</label>
            <input type="number" step="0.01" placeholder="Ex : 1.20" value={annualDividend} onChange={(e) => setAnnualDividend(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
          </div>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">Annuler</button>
        <button type="submit" disabled={!ready || !quantity || !pru} className="text-xs font-semibold bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-lg px-4 py-1.5">Ajouter au portefeuille</button>
      </div>
    </form>
  );
}