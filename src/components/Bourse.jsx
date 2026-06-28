import React, { useState, useEffect, useRef, useMemo } from "react";
import { TrendingUp, Wallet, RefreshCw, Pencil, Check, X as XIcon, PieChart as PieIcon } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { Card, CardLabel, GhostButton, IconTrash, EmptyState } from "./ui";
import { eur, pctPlain, pct, uid, compact, mergeSeriesByDate, rebaseTo100, reconstructPortfolioValue } from "../lib/finance";
import { searchSecurity, fetchQuotes, fetchHistory } from "../lib/api";

const BENCHMARKS = [
  { symbol: "^GSPC", name: "S&P 500", color: "#38bdf8" },
  { symbol: "^FCHI", name: "CAC 40", color: "#a78bfa" },
  { symbol: "URTH", name: "MSCI World", color: "#34d399" },
];

const PERIODS = [
  { key: "3mo", label: "3 mois" },
  { key: "6mo", label: "6 mois" },
  { key: "1y", label: "1 an" },
  { key: "5y", label: "5 ans" },
];

const PIE_PALETTE = ["#fbbf24", "#2dd4bf", "#a78bfa", "#38bdf8", "#fb7185", "#34d399", "#f472b6", "#facc15"];

const formatDateShort = (d) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
};

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

export default function Bourse({ bourse, setBourse, bourseTotal, bourseInvested, bourseGainAbs, bourseGainPct }) {
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");

  // édition d'une ligne existante
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ quantity: "", pru: "", current_price: "" });

  // graphiques historiques
  const [period, setPeriod] = useState("6mo");
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState("");
  const [historyBySymbol, setHistoryBySymbol] = useState({});

  const addPosition = (v) =>
    setBourse((b) => ({
      ...b,
      positions: [
        ...b.positions,
        { id: uid(), ticker: v.ticker, name: v.name, quantity: v.quantity, pru: v.pru, current_price: v.current_price, type: v.type },
      ],
    }));
  const removePosition = (id) => setBourse((b) => ({ ...b, positions: b.positions.filter((x) => x.id !== id) }));

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditValues({ quantity: String(p.quantity), pru: String(p.pru), current_price: String(p.current_price) });
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = (id) => {
    setBourse((b) => ({
      ...b,
      positions: b.positions.map((p) =>
        p.id === id
          ? {
              ...p,
              quantity: parseFloat(editValues.quantity) || 0,
              pru: parseFloat(editValues.pru) || 0,
              current_price: parseFloat(editValues.current_price) || 0,
            }
          : p
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
      setBourse((b) => ({
        ...b,
        positions: b.positions.map((p) => {
          const q = quotes.find((x) => x.symbol === p.ticker);
          return q?.ok ? { ...p, current_price: q.price } : p;
        }),
      }));
      const failed = quotes.filter((q) => !q.ok).length;
      setRefreshMsg(failed > 0 ? `${failed} cours sur ${quotes.length} n'ont pas pu être actualisés.` : "Tous les cours ont été actualisés.");
    } catch {
      setRefreshMsg("Actualisation impossible — vérifiez votre connexion internet.");
    } finally {
      setRefreshing(false);
    }
  };

  // ---- répartition par ligne (camembert) ----
  const pieData = useMemo(
    () =>
      bourse.positions
        .map((p, i) => ({ name: p.ticker, value: p.quantity * p.current_price, color: PIE_PALETTE[i % PIE_PALETTE.length] }))
        .filter((d) => d.value > 0),
    [bourse.positions]
  );

  // ---- historique : reconstruction du portefeuille + indices de référence ----
  const tickers = useMemo(() => [...new Set(bourse.positions.map((p) => p.ticker))], [bourse.positions]);

  useEffect(() => {
    if (tickers.length === 0) {
      setHistoryBySymbol({});
      return;
    }
    let cancelled = false;
    setHistLoading(true);
    setHistError("");
    const allSymbols = [...tickers, ...BENCHMARKS.map((b) => b.symbol)];
    fetchHistory(allSymbols, period)
      .then((results) => {
        if (cancelled) return;
        const map = {};
        results.forEach((r) => {
          map[r.symbol] = r;
        });
        setHistoryBySymbol(map);
        const failed = results.filter((r) => !r.ok).length;
        if (failed > 0) setHistError(`${failed} série(s) sur ${results.length} indisponible(s) pour le moment.`);
      })
      .catch(() => {
        if (!cancelled) setHistError("Historique indisponible — vérifie ta connexion internet.");
      })
      .finally(() => {
        if (!cancelled) setHistLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(","), period]);

  const portfolioSeries = useMemo(
    () => reconstructPortfolioValue(bourse.positions, historyBySymbol, bourse.cash_pocket),
    [bourse.positions, historyBySymbol, bourse.cash_pocket]
  );

  const capitalInvesti = bourseInvested + bourse.cash_pocket;

  const comboChartData = useMemo(
    () => portfolioSeries.map((p) => ({ date: p.date, valeur: Math.round(p.value), capital: Math.round(capitalInvesti) })),
    [portfolioSeries, capitalInvesti]
  );

  const base100Data = useMemo(() => {
    const named = [
      { name: "Mon portefeuille", series: portfolioSeries.map((p) => ({ date: p.date, close: p.value })) },
      ...BENCHMARKS.map((b) => ({ name: b.name, series: historyBySymbol[b.symbol]?.ok ? historyBySymbol[b.symbol].series : [] })),
    ];
    const merged = mergeSeriesByDate(named);
    return rebaseTo100(merged, ["Mon portefeuille", ...BENCHMARKS.map((b) => b.name)]);
  }, [portfolioSeries, historyBySymbol]);

  const hasHistory = comboChartData.length > 0;
  const hasBase100 = base100Data.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-slate-50">PEA &amp; Bourse</h1>
        <p className="text-sm text-slate-500 mt-1">Positions actions / ETF — analyse de portefeuille.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardLabel>Valeur du portefeuille</CardLabel>
          <div className="font-display text-xl text-slate-100">{eur(bourseTotal)}</div>
        </Card>
        <Card>
          <CardLabel>Plus/moins-value latente</CardLabel>
          <div className={`font-display text-xl ${bourseGainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{eur(bourseGainAbs)}</div>
          <div className={`text-xs mt-1 ${bourseGainAbs >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>{pct(bourseGainPct)}</div>
        </Card>
        <Card>
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

      {/* Analyse visuelle : répartition, capital vs valeur, comparaison aux indices */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <CardLabel icon={PieIcon}>Analyse du portefeuille</CardLabel>
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                period === p.key ? "bg-slate-700 text-amber-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {histError && <p className="text-[11px] text-amber-300/80">{histError}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardLabel>Répartition par ligne</CardLabel>
          {pieData.length === 0 ? (
            <EmptyState>Ajoute une position pour voir sa répartition.</EmptyState>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2} stroke="none">
                      {pieData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
                            <span className="text-slate-100 font-data">{payload[0].name}</span>
                            <div className="text-slate-400">{eur(payload[0].value)}</div>
                          </div>
                        ) : null
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1 mt-1 max-h-28 overflow-y-auto">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.color }} />
                      {d.name}
                    </span>
                    <span className="font-data tabular-nums text-slate-300">{pctPlain((d.value / bourseTotal) * 100)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card>
          <CardLabel>Capital investi vs valeur actuelle</CardLabel>
          {histLoading && !hasHistory ? (
            <EmptyState>Chargement de l'historique…</EmptyState>
          ) : !hasHistory ? (
            <EmptyState>
              Historique indisponible pour le moment (les positions saisies manuellement n'ont pas de cours historique).
            </EmptyState>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={comboChartData} margin={{ left: -15, right: 5, top: 5 }}>
                  <defs>
                    <linearGradient id="bourseValeurFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={40} />
                  <YAxis tickFormatter={compact} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={42} />
                  <Tooltip content={<HistoryTooltip mode="eur" />} />
                  <Area type="monotone" dataKey="valeur" name="Valeur du portefeuille" stroke="#fbbf24" strokeWidth={2} fill="url(#bourseValeurFill)" />
                  <Line type="monotone" dataKey="capital" name="Capital investi" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[11px] text-slate-600 mt-2">
            Capital investi = coût de revient actuel (PRU × quantité) + cash, supposé constant sur la période.
          </p>
        </Card>

        <Card>
          <CardLabel>Comparaison aux indices (base 100)</CardLabel>
          {histLoading && !hasBase100 ? (
            <EmptyState>Chargement de l'historique…</EmptyState>
          ) : !hasBase100 ? (
            <EmptyState>Comparaison indisponible pour le moment.</EmptyState>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={base100Data} margin={{ left: -15, right: 5, top: 5 }}>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={40} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip content={<HistoryTooltip mode="base100" />} />
                  <Line type="monotone" dataKey="Mon portefeuille" stroke="#fbbf24" strokeWidth={2.5} dot={false} />
                  {BENCHMARKS.map((b) => (
                    <Line key={b.symbol} type="monotone" dataKey={b.name} stroke={b.color} strokeWidth={1.5} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-2">
            <Legend2 color="#fbbf24" label="Mon portefeuille" />
            {BENCHMARKS.map((b) => (
              <Legend2 key={b.symbol} color={b.color} label={b.name} />
            ))}
          </div>
          <p className="text-[11px] text-slate-600 mt-2">
            Performance recalculée en appliquant ta composition actuelle aux cours historiques de chaque ligne — une
            approximation si tu as acheté ou vendu récemment.
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <CardLabel icon={TrendingUp}>Positions</CardLabel>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshPrices}
              disabled={refreshing || bourse.positions.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Actualisation..." : "Actualiser les cours"}
            </button>
            <GhostButton onClick={() => setShowAdd((s) => !s)}>Ajouter une position</GhostButton>
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
                  <th className="py-2 pr-3">Valeur</th>
                  <th className="py-2 pr-3">+/− value</th>
                  <th className="py-2 pr-3">Poids</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {bourse.positions.map((p) => {
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
                          <div className="text-[11px] text-slate-500">
                            {p.name} · {p.type}
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            step="0.0001"
                            value={editValues.quantity}
                            onChange={(e) => setEditValues((v) => ({ ...v, quantity: e.target.value }))}
                            className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            step="0.01"
                            value={editValues.pru}
                            onChange={(e) => setEditValues((v) => ({ ...v, pru: e.target.value }))}
                            className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            step="0.01"
                            value={editValues.current_price}
                            onChange={(e) => setEditValues((v) => ({ ...v, current_price: e.target.value }))}
                            className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60"
                          />
                        </td>
                        <td className="py-3 pr-3 font-data tabular-nums text-slate-500" colSpan={3}>
                          Aperçu après enregistrement
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => saveEdit(p.id)} className="text-emerald-400 hover:text-emerald-300 p-1">
                              <Check size={15} />
                            </button>
                            <button onClick={cancelEdit} className="text-slate-500 hover:text-rose-400 p-1">
                              <XIcon size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={p.id}>
                      <td className="py-3 pr-3">
                        <div className="text-slate-200 font-medium">{p.ticker}</div>
                        <div className="text-[11px] text-slate-500">
                          {p.name} · {p.type}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-data tabular-nums">{p.quantity}</td>
                      <td className="py-3 pr-3 font-data tabular-nums">{eur(p.pru, 2)}</td>
                      <td className="py-3 pr-3 font-data tabular-nums">{eur(p.current_price, 2)}</td>
                      <td className="py-3 pr-3 font-data tabular-nums">{eur(value)}</td>
                      <td className={`py-3 pr-3 font-data tabular-nums ${gainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {eur(gainAbs)} <span className="text-[11px] opacity-80">({pct(gainPct)})</span>
                      </td>
                      <td className="py-3 pr-3 font-data tabular-nums text-slate-400">{pctPlain(weight)}</td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(p)} className="text-slate-600 hover:text-amber-300 transition-colors p-1">
                            <Pencil size={14} />
                          </button>
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
          Outil de rééquilibrage et diversification sectorielle/géographique : à venir dans une prochaine itération.
        </p>
      </Card>
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

/**
 * Formulaire d'ajout intelligent : recherche par ticker, ISIN ou nom,
 * sélection du résultat puis récupération automatique du cours actuel.
 * Une saisie manuelle reste possible si le produit n'est pas trouvé.
 */
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
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setQuantity("");
      setPru("");
      setManual(false);
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (manual || selected) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError("");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchSecurity(query.trim());
        setResults(r);
      } catch {
        setError("Recherche indisponible pour le moment.");
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, manual, selected]);

  if (!open) return null;

  const pickResult = async (r) => {
    setSelected({ ...r, current_price: null, currency: "" });
    setResults([]);
    setLoading(true);
    setError("");
    try {
      const quotes = await fetchQuotes([r.symbol]);
      const q = quotes[0];
      if (q?.ok) {
        setSelected((s) => ({ ...s, current_price: q.price, currency: q.currency }));
      } else {
        setError("Cours indisponible pour ce titre — tu peux le saisir manuellement.");
        setSelected((s) => ({ ...s, current_price: 0 }));
      }
    } catch {
      setError("Cours indisponible pour le moment — tu peux le saisir manuellement.");
      setSelected((s) => ({ ...s, current_price: 0 }));
    } finally {
      setLoading(false);
    }
  };

  const ready = manual ? query.trim().length > 0 : !!selected;

  const submit = (e) => {
    e.preventDefault();
    if (!quantity || !pru || !ready) return;
    if (manual) {
      onSubmit({
        ticker: query.toUpperCase(),
        name: query,
        type: "Autre",
        quantity: parseFloat(quantity),
        pru: parseFloat(pru),
        current_price: parseFloat(pru),
      });
    } else {
      onSubmit({
        ticker: selected.symbol,
        name: selected.name,
        type: selected.type || "Autre",
        quantity: parseFloat(quantity),
        pru: parseFloat(pru),
        current_price: selected.current_price || 0,
      });
    }
    onClose();
  };

  return (
    <form onSubmit={submit} className="mt-3 p-4 rounded-xl border border-amber-400/20 bg-slate-950 space-y-3">
      {!manual ? (
        <>
          <label className="text-[11px] text-slate-500">Ticker, ISIN ou nom du produit</label>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder="Ex : CW8, FR0011550185, Air Liquide..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/30"
          />
          {loading && <p className="text-xs text-slate-500">Recherche en cours…</p>}
          {error && <p className="text-xs text-amber-400/90">{error}</p>}

          {!selected && results.length > 0 && (
            <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 max-h-44 overflow-y-auto">
              {results.map((r) => (
                <button
                  type="button"
                  key={r.symbol}
                  onClick={() => pickResult(r)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800 text-sm focus-visible:outline-none focus-visible:bg-slate-800"
                >
                  <span className="text-slate-100 font-medium">{r.symbol}</span>
                  <span className="text-slate-500">
                    {" "}
                    — {r.name} {r.exchange ? `(${r.exchange})` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 px-3 py-2">
              <div>
                <div className="text-sm text-slate-100 font-medium">
                  {selected.symbol} — {selected.name}
                </div>
                <div className="text-xs text-slate-500">
                  Cours actuel : {selected.current_price != null ? `${selected.current_price} ${selected.currency || ""}` : "…"}
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-slate-500 hover:text-rose-400">
                Changer
              </button>
            </div>
          )}

          <button type="button" onClick={() => setManual(true)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">
            Le produit n'est pas trouvé ? Saisie manuelle
          </button>
        </>
      ) : (
        <>
          <label className="text-[11px] text-slate-500">Nom / ticker (saisie libre)</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400/60"
            placeholder="Ex : Plan Épargne Entreprise"
          />
          <button type="button" onClick={() => setManual(false)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">
            Revenir à la recherche
          </button>
        </>
      )}

      {ready && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500">Quantité</label>
            <input
              required
              type="number"
              step="0.0001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500">Prix de revient unitaire (€)</label>
            <input
              required
              type="number"
              step="0.01"
              value={pru}
              onChange={(e) => setPru(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
          Annuler
        </button>
        <button
          type="submit"
          disabled={!ready || !quantity || !pru}
          className="text-xs font-semibold bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-lg px-4 py-1.5"
        >
          Ajouter au portefeuille
        </button>
      </div>
    </form>
  );
}
