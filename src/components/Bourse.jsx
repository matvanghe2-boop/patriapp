import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  TrendingUp, Wallet, RefreshCw, Pencil, Check, X as XIcon,
  PieChart as PieIcon, Activity, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, ComposedChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Card, CardLabel, GhostButton, IconTrash, EmptyState, PageGlow, CARD_THEMES } from "./ui";
import { eur, pctPlain, pct, uid, compact, rebaseTo100, upsertByDate } from "../lib/finance";
import { searchSecurity, fetchQuotes } from "../lib/api";
import { usePersistentState } from "../lib/storage";
import Watchlist from "./Watchlist";

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
  bourseHistory, setBourseHistory, watchlist, setWatchlist,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");

  // ─── Persistance du tri et des données de variation ──────────────────────
  const [sort, setSort] = usePersistentState("bourseSort", "none");
  const [dailyData, setDailyData] = usePersistentState("bourseDailyData", {});

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ quantity: "", pru: "", current_price: "" });
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");

  const addPosition = (v) =>
    setBourse((b) => ({
      ...b,
      positions: [
        ...b.positions,
        { id: uid(), ticker: v.ticker, name: v.name, quantity: v.quantity, pru: v.pru, current_price: v.current_price, type: v.type },
      ],
    }));
  const removePosition = (id) => setBourse((b) => ({ ...b, positions: b.positions.filter((x) => x.id !== id) }));

  const startEdit = (p) => { setEditingId(p.id); setEditValues({ quantity: String(p.quantity), pru: String(p.pru), current_price: String(p.current_price) }); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = (id) => {
    setBourse((b) => ({
      ...b,
      positions: b.positions.map((p) =>
        p.id === id ? { ...p, quantity: parseFloat(editValues.quantity) || 0, pru: parseFloat(editValues.pru) || 0, current_price: parseFloat(editValues.current_price) || 0 } : p
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
        <h1 className="font-display text-2xl text-slate-50">
          PEA &amp; <span className="text-violet-400">Bourse</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">Positions actions / ETF — analyse de portefeuille.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card accent={CARD_THEMES.violet}>
          <CardLabel>Valeur du portefeuille</CardLabel>
          <div className="font-display text-xl text-slate-100">{eur(bourseTotal)}</div>
          {portfolioDailyChange !== null && (
            <div className={`flex items-center gap-1 text-xs mt-1 font-data ${portfolioDailyChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {portfolioDailyChange >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {portfolioDailyChange >= 0 ? "+" : ""}{eur(portfolioDailyChange)} aujourd'hui
            </div>
          )}
        </Card>
        <Card accent={CARD_THEMES.violet}>
          <CardLabel>Plus/moins-value latente</CardLabel>
          <div className={`font-display text-xl ${bourseGainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{eur(bourseGainAbs)}</div>
          <div className={`text-xs mt-1 ${bourseGainAbs >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>{pct(bourseGainPct)}</div>
        </Card>
        <Card accent={CARD_THEMES.violet}>
          <CardLabel icon={Wallet}>Poche cash disponible</CardLabel>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              value={bourse.cash_pocket}
              onChange={(e) => setBourse((b) => ({ ...b, cash_pocket: parseFloat(e.target.value) || 0 }))}
              className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums focus:outline-none focus:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/30"
            />
            <span className="text-xs text-slate-600">€</span>
          </div>
        </Card>
      </div>

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

      <Card accent={CARD_THEMES.violet}>
        <CardLabel>Capital investi vs valeur actuelle</CardLabel>
        {!hasEnoughHistory ? (
          <EmptyState>
            {bourseHistory.length === 0
              ? "Aucun suivi encore — clique sur « Actualiser le suivi » pour démarrer."
              : `Suivi démarré le ${formatDateShort(bourseHistory[0].date)} — reviens dans les prochains jours.`}
          </EmptyState>
        ) : (
          <div className="h-80 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={bourseHistory} margin={{ left: 0, right: 10, top: 10 }}>
                <defs>
                  <linearGradient id="bourseValeurFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={50} />
                <YAxis tickFormatter={compact} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                <Tooltip content={<HistoryTooltip mode="eur" />} />
                <Area type="monotone" dataKey="valeur" name="Valeur du portefeuille" stroke="#a78bfa" strokeWidth={2.5} fill="url(#bourseValeurFill)" />
                <Line type="monotone" dataKey="capital" name="Capital investi" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card accent={CARD_THEMES.violet}>
        <CardLabel>Comparaison aux indices (base 100)</CardLabel>
        {!hasEnoughBase100 ? (
          <EmptyState>Comparaison disponible après plusieurs jours de suivi.</EmptyState>
        ) : (
          <div className="h-80 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={base100Data} margin={{ left: 0, right: 10, top: 10 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={50} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<HistoryTooltip mode="base100" />} />
                <Line type="monotone" dataKey="valeur" name="Mon portefeuille" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
                {BENCHMARKS.map((b) => (
                  <Line key={b.symbol} type="monotone" dataKey={BENCHMARK_KEYS[b.symbol]} name={b.name} stroke={b.color} strokeWidth={1.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex flex-wrap gap-3 mt-2">
          <Legend2 color="#fbbf24" label="Mon portefeuille" />
          {BENCHMARKS.map((b) => <Legend2 key={b.symbol} color={b.color} label={b.name} />)}
        </div>
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
                          <div className="text-slate-200 font-medium">{p.ticker}</div>
                          <div className="text-[11px] text-slate-500">{p.name} · {p.type}</div>
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
                        <td className="py-3 pr-3 text-slate-600 text-xs" colSpan={4}>Aperçu après enregistrement</td>
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
                        <div className="text-slate-200 font-medium">{p.ticker}</div>
                        <div className="text-[11px] text-slate-500">{p.name} · {p.type}</div>
                      </td>
                      <td className="py-3 pr-3 font-data tabular-nums">{p.quantity}</td>
                      <td className="py-3 pr-3 font-data tabular-nums">{eur(p.pru, 2)}</td>
                      <td className="py-3 pr-3 font-data tabular-nums">{eur(p.current_price, 2)}</td>
                      <td className="py-3 pr-3">
                        <DailyVariation position={p} dailyData={dailyData} />
                      </td>
                      <td className="py-3 pr-3 font-data tabular-nums">{eur(value)}</td>
                      <td className={`py-3 pr-3 font-data tabular-nums ${gainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {eur(gainAbs)} <span className="text-[11px] opacity-80">({pct(gainPct)})</span>
                      </td>
                      <td className="py-3 pr-3 font-data tabular-nums text-slate-400">{pctPlain(weight)}</td>
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

      <Watchlist watchlist={watchlist} setWatchlist={setWatchlist} />
    </div>
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
  const [manual, setManual] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); setSelected(null); setQuantity(""); setPru(""); setManual(false); setError(""); }
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
      onSubmit({ ticker: query.toUpperCase(), name: query, type: "Autre", quantity: parseFloat(quantity), pru: parseFloat(pru), current_price: parseFloat(pru) });
    } else {
      onSubmit({ ticker: selected.symbol, name: selected.name, type: selected.type || "Autre", quantity: parseFloat(quantity), pru: parseFloat(pru), current_price: selected.current_price || 0 });
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
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">Annuler</button>
        <button type="submit" disabled={!ready || !quantity || !pru} className="text-xs font-semibold bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-lg px-4 py-1.5">Ajouter au portefeuille</button>
      </div>
    </form>
  );
}