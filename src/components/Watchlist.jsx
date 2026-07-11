import React, { useState, useEffect, useRef, useMemo } from "react";
import { Star, RefreshCw, Target, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, EmptyState } from "./ui";
import AssetLogo from "./AssetLogo";
import { eur, pct, uid, computeReturnMetrics } from "../lib/finance";
import { searchSecurity, fetchHistory, fetchQuotes } from "../lib/api";
import { usePersistentState } from "../lib/storage";

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return "—";
  return pct(v);
}
function cellClass(v) {
  if (v == null) return "py-3 pr-3 font-data tabular-nums text-slate-600 text-xs";
  return `py-3 pr-3 font-data tabular-nums text-xs ${v >= 0 ? "text-emerald-400" : "text-rose-400"}`;
}

// ─── Sort config ──────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: "none", label: "Ordre d'ajout" },
  { key: "name_asc", label: "Nom A→Z" },
  { key: "name_desc", label: "Nom Z→A" },
  { key: "price_desc", label: "Cours ↓" },
  { key: "price_asc", label: "Cours ↑" },
  { key: "gap_desc", label: "Écart ↓" },
  { key: "gap_asc", label: "Écart ↑" },
  { key: "ytd_desc", label: "YTD ↓" },
  { key: "ytd_asc", label: "YTD ↑" },
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
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
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
function DailyVariation({ ticker, dailyData }) {
  const d = dailyData?.[ticker];
  if (!d) {
    return <span className="text-slate-600 text-xs font-data">—</span>;
  }
  const { changeAbs, changePct } = d;
  const pos = changeAbs >= 0;
  return (
    <div className={`flex items-center gap-1 font-data tabular-nums text-xs ${pos ? "text-emerald-400" : "text-rose-400"}`}>
      {pos ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      <span>
        {pos ? "+" : ""}{eur(changeAbs, 2)}
        <span className="opacity-70 ml-1">({pos ? "+" : ""}{changePct.toFixed(2)}%)</span>
      </span>
    </div>
  );
}

/**
 * Watchlist : produits suivis en vue d'un achat (distincts du portefeuille).
 * Les pourcentages YTD / 1 mois / 6 mois / 1 an / 5 ans sont calculés à
 * partir des cours RÉELS et passés du titre lui-même (aucune simulation :
 * c'est l'historique constaté de cet instrument, pas une projection).
 */
export default function Watchlist({ watchlist, setWatchlist }) {
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [metricsBySymbol, setMetricsBySymbol] = useState({});
  
  // ─── Persistance du tri et des données de variation ──────────────────────
  const [sort, setSort] = usePersistentState("watchlistSort", "none");
  const [dailyData, setDailyData] = usePersistentState("watchlistDailyData", {});
  
  const [refreshingQuotes, setRefreshingQuotes] = useState(false);

  const tickers = useMemo(() => [...new Set(watchlist.map((w) => w.ticker))], [watchlist]);

  // Récupère l'historique pour les performances (YTD, 1 mois, etc.)
  const refreshHistory = async () => {
    if (tickers.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const histories = await fetchHistory(tickers, "5y");
      const map = {};
      histories.forEach((h) => {
        if (h.ok) map[h.symbol] = computeReturnMetrics(h.series);
      });
      setMetricsBySymbol(map);
      const failed = histories.filter((h) => !h.ok).length;
      setError(failed > 0 ? `${failed} ligne(s) sur ${histories.length} indisponible(s) pour le moment.` : "");
    } catch {
      setError("Actualisation impossible — vérifie ta connexion internet.");
    } finally {
      setLoading(false);
    }
  };

  // Récupère les cours actuels + variation journalière
  const refreshQuotes = async () => {
    if (tickers.length === 0) return;
    setRefreshingQuotes(true);
    try {
      const quotes = await fetchQuotes(tickers);
      const newDailyData = {};
      quotes.forEach((q) => {
        if (q.ok && q.previousClose && q.price) {
          newDailyData[q.symbol] = {
            changeAbs: q.price - q.previousClose,
            changePct: ((q.price - q.previousClose) / q.previousClose) * 100,
          };
        }
      });
      setDailyData((prev) => ({ ...prev, ...newDailyData }));
    } catch {
      // Silencieux, on garde les données précédentes
    } finally {
      setRefreshingQuotes(false);
    }
  };

  const refreshAll = async () => {
    await refreshHistory();
    await refreshQuotes();
  };

  useEffect(() => {
    if (tickers.length > 0) {
      refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(",")]);

  const addItem = (v) =>
    setWatchlist((w) => [...w, { id: uid(), ticker: v.ticker, name: v.name, type: v.type, target_price: v.target_price }]);
  const removeItem = (id) => setWatchlist((w) => w.filter((x) => x.id !== id));
  const updateTarget = (id, value) => setWatchlist((w) => w.map((x) => (x.id === id ? { ...x, target_price: value } : x)));

  // ─── Sorted watchlist ──────────────────────────────────────────────────────
  const sortedWatchlist = useMemo(() => {
    const items = [...watchlist];
    const getPrice = (w) => metricsBySymbol[w.ticker]?.latestClose ?? 0;
    const getGap = (w) => {
      const current = metricsBySymbol[w.ticker]?.latestClose;
      if (current == null || !w.target_price || w.target_price <= 0) return null;
      return ((current - w.target_price) / w.target_price) * 100;
    };
    const getYtd = (w) => metricsBySymbol[w.ticker]?.ytd ?? null;

    switch (sort) {
      case "name_asc": return items.sort((a, b) => a.name.localeCompare(b.name));
      case "name_desc": return items.sort((a, b) => b.name.localeCompare(a.name));
      case "price_desc": return items.sort((a, b) => getPrice(b) - getPrice(a));
      case "price_asc": return items.sort((a, b) => getPrice(a) - getPrice(b));
      case "gap_desc": return items.sort((a, b) => (getGap(b) ?? -Infinity) - (getGap(a) ?? -Infinity));
      case "gap_asc": return items.sort((a, b) => (getGap(a) ?? Infinity) - (getGap(b) ?? Infinity));
      case "ytd_desc": return items.sort((a, b) => (getYtd(b) ?? -Infinity) - (getYtd(a) ?? -Infinity));
      case "ytd_asc": return items.sort((a, b) => (getYtd(a) ?? Infinity) - (getYtd(b) ?? Infinity));
      default: return items;
    }
  }, [watchlist, sort, metricsBySymbol]);

  // ─── Total daily variation ────────────────────────────────────────────────
  const totalDailyChange = useMemo(() => {
    let total = 0;
    let hasData = false;
    watchlist.forEach((w) => {
      const d = dailyData[w.ticker];
      if (d) { total += d.changeAbs; hasData = true; }
    });
    return hasData ? total : null;
  }, [watchlist, dailyData]);

  const isLoading = loading || refreshingQuotes;

  return (
    <Card accent="border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-950/40 via-slate-900 to-slate-900 hover:border-fuchsia-400/60">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <CardLabel icon={Star}>Watchlist — produits à suivre</CardLabel>
        <div className="flex items-center gap-2 flex-wrap">
          <SortButton sort={sort} setSort={setSort} />
          <button
            onClick={refreshAll}
            disabled={isLoading || tickers.length === 0}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            {isLoading ? "Actualisation..." : "Actualiser"}
          </button>
          <GhostButton theme="violet" onClick={() => setShowAdd((s) => !s)}>Suivre un produit</GhostButton>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-3">
        Des valeurs que tu envisages d'acheter — distinctes de ton portefeuille réel.
      </p>

      {/* Variation totale du jour */}
      {totalDailyChange !== null && (
        <div className={`flex items-center gap-1 text-xs mb-3 font-data ${totalDailyChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {totalDailyChange >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          Variation totale : {totalDailyChange >= 0 ? "+" : ""}{eur(totalDailyChange)} aujourd'hui
        </div>
      )}

      {error && <p className="text-[11px] text-amber-300/80 mb-3">{error}</p>}

      {watchlist.length === 0 ? (
        <EmptyState>Aucun produit suivi — ajoute une valeur que tu envisages d'acheter.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-3">Actif</th>
                <th className="py-2 pr-3">Cours actuel</th>
                <th className="py-2 pr-3">
                  <span className="flex items-center gap-1">
                    Var. J
                    <span className="text-[9px] text-slate-600 normal-case tracking-normal">(vs clôt. veille)</span>
                  </span>
                </th>
                <th className="py-2 pr-3">Objectif d'achat</th>
                <th className="py-2 pr-3">Écart</th>
                <th className="py-2 pr-3">YTD</th>
                <th className="py-2 pr-3">1 mois</th>
                <th className="py-2 pr-3">6 mois</th>
                <th className="py-2 pr-3">1 an</th>
                <th className="py-2 pr-3">5 ans</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedWatchlist.map((w) => {
                const m = metricsBySymbol[w.ticker];
                const current = m?.latestClose;
                const hasTarget = w.target_price > 0;
                const gap = current != null && hasTarget ? ((current - w.target_price) / w.target_price) * 100 : null;
                const reached = gap != null && gap <= 0;
                return (
                  <tr key={w.id} className="group hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <AssetLogo ticker={w.ticker} size="xs" />
                        <div>
                          <div className="text-slate-200 font-medium">{w.ticker}</div>
                          <div className="text-[11px] text-slate-500">{w.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-data tabular-nums">{current != null ? eur(current, 2) : "—"}</td>
                    <td className="py-3 pr-3">
                      <DailyVariation ticker={w.ticker} dailyData={dailyData} />
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        type="number"
                        step="0.01"
                        value={w.target_price}
                        onChange={(e) => updateTarget(w.id, parseFloat(e.target.value) || 0)}
                        placeholder="—"
                        className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-data tabular-nums focus:outline-none focus:border-amber-400/60"
                      />
                    </td>
                    <td className="py-3 pr-3">
                      {!hasTarget || gap == null ? (
                        <span className="text-xs text-slate-600">—</span>
                      ) : reached ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                          <Target size={12} /> Atteint
                        </span>
                      ) : (
                        <span className="font-data tabular-nums text-slate-400 text-xs">+{gap.toFixed(1)} %</span>
                      )}
                    </td>
                    <td className={cellClass(m?.ytd)}>{fmtPct(m?.ytd)}</td>
                    <td className={cellClass(m?.m1)}>{fmtPct(m?.m1)}</td>
                    <td className={cellClass(m?.m6)}>{fmtPct(m?.m6)}</td>
                    <td className={cellClass(m?.y1)}>{fmtPct(m?.y1)}</td>
                    <td className={cellClass(m?.y5)}>{fmtPct(m?.y5)}</td>
                    <td className="py-3 text-right">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <IconTrash onClick={() => removeItem(w.id)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddWatchlistPanel open={showAdd} onClose={() => setShowAdd(false)} onSubmit={addItem} />

      <p className="text-[11px] text-slate-600 mt-4">
        YTD / 1 mois / 6 mois / 1 an / 5 ans sont calculés à partir des cours réels déjà constatés de chaque titre —
        aucune projection, uniquement de l'historique factuel. La variation journalière est calculée par rapport au
        cours de clôture de la veille.
      </p>
    </Card>
  );
}

function AddWatchlistPanel({ open, onClose, onSubmit }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [manual, setManual] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setTargetPrice("");
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
        setResults(await searchSecurity(query.trim()));
      } catch {
        setError("Recherche indisponible pour le moment.");
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, manual, selected]);

  if (!open) return null;

  const ready = manual ? query.trim().length > 0 : !!selected;

  const submit = (e) => {
    e.preventDefault();
    if (!ready) return;
    if (manual) {
      onSubmit({ ticker: query.toUpperCase(), name: query, type: "Autre", target_price: parseFloat(targetPrice) || 0 });
    } else {
      onSubmit({ ticker: selected.symbol, name: selected.name, type: selected.type || "Autre", target_price: parseFloat(targetPrice) || 0 });
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
            placeholder="Ex : MC, FR0000121014, LVMH..."
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
                  onClick={() => setSelected(r)}
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
              <div className="text-sm text-slate-100 font-medium">
                {selected.symbol} — {selected.name}
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
            placeholder="Ex : LVMH"
          />
          <button type="button" onClick={() => setManual(false)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">
            Revenir à la recherche
          </button>
        </>
      )}

      {ready && (
        <div>
          <label className="text-[11px] text-slate-500">Objectif de prix d'achat (€, optionnel)</label>
          <input
            type="number"
            step="0.01"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="Laisse vide si tu n'as pas encore d'objectif précis"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60 mt-1"
          />
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
          Annuler
        </button>
        <button
          type="submit"
          disabled={!ready}
          className="text-xs font-semibold bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-lg px-4 py-1.5"
        >
          Ajouter à la watchlist
        </button>
      </div>
    </form>
  );
}