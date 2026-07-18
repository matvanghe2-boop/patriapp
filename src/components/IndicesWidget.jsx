import React, { useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { fetchQuotes } from "../lib/api";
import { INDEX_TABS, INDEX_CONSTITUENTS } from "../lib/indexConstituents";

function pctChange(q) {
  if (!q?.ok || !q.previousClose || !q.price) return null;
  return ((q.price - q.previousClose) / q.previousClose) * 100;
}

function shortLabel(name, symbol) {
  if (!name) return symbol;
  return name.length > 22 ? `${name.slice(0, 20)}…` : name;
}

export default function IndicesWidget() {
  const [active, setActive] = useState("cac40");
  const [indexQuotes, setIndexQuotes] = useState({});
  const [moversByIndex, setMoversByIndex] = useState({});
  const [moversLoading, setMoversLoading] = useState(false);
  const [openPanel, setOpenPanel] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const quotes = await fetchQuotes(INDEX_TABS.map((t) => t.symbol));
        if (stop) return;
        const map = {};
        quotes.forEach((q) => { map[q.symbol] = q; });
        setIndexQuotes(map);
      } catch {}
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  const loadMovers = async (key) => {
    if (moversByIndex[key] || moversLoading) return;
    setMoversLoading(true);
    try {
      const tickers = INDEX_CONSTITUENTS[key];
      const quotes = await fetchQuotes(tickers);
      const rows = quotes
        .map((q) => ({ symbol: q.symbol, name: shortLabel(q.name, q.symbol), pct: pctChange(q) }))
        .filter((r) => r.pct != null)
        .sort((a, b) => b.pct - a.pct);
      setMoversByIndex((m) => ({ ...m, [key]: { best: rows.slice(0, 3), worst: rows.slice(-3).reverse() } }));
    } catch {
      setMoversByIndex((m) => ({ ...m, [key]: { best: [], worst: [] } }));
    } finally {
      setMoversLoading(false);
    }
  };

  const openTab = (key) => {
    setActive(key);
    setOpenPanel(true);
    loadMovers(key);
  };

  const movers = moversByIndex[active];

  return (
    <div className="relative rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <div className="grid grid-cols-3 gap-2">
        {INDEX_TABS.map((t) => {
          const q = indexQuotes[t.symbol];
          const pct = pctChange(q);
          const up = pct != null && pct >= 0;
          return (
            <button
              key={t.key}
              onClick={() => (active === t.key && openPanel ? setOpenPanel(false) : openTab(t.key))}
              onMouseEnter={() => openTab(t.key)}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-2 transition-colors ${
                active === t.key && openPanel ? "border-violet-500/50 bg-violet-500/10" : "border-slate-800 hover:border-slate-700"
              }`}
            >
              <span className="text-xs font-medium text-slate-300">{t.label}</span>
              {pct == null ? (
                <span className="text-[11px] text-slate-600">—</span>
              ) : (
                <span className={`flex items-center gap-1 font-data text-sm font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>
                  {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                  {up ? "+" : ""}{pct.toFixed(2)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {openPanel && (
        <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-emerald-400/80 mb-1.5">Meilleures perfs — {INDEX_TABS.find((t) => t.key === active)?.label}</div>
            {moversLoading && !movers ? (
              <p className="text-[11px] text-slate-600">Chargement…</p>
            ) : (
              <div className="space-y-1">
                {(movers?.best || []).map((r) => (
                  <div key={r.symbol} className="flex items-center justify-between text-xs gap-2">
                    <span className="text-slate-300 truncate">{r.name}</span>
                    <span className="text-emerald-400 font-data shrink-0">+{r.pct.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-rose-400/80 mb-1.5">Pires perfs — {INDEX_TABS.find((t) => t.key === active)?.label}</div>
            {moversLoading && !movers ? (
              <p className="text-[11px] text-slate-600">Chargement…</p>
            ) : (
              <div className="space-y-1">
                {(movers?.worst || []).map((r) => (
                  <div key={r.symbol} className="flex items-center justify-between text-xs gap-2">
                    <span className="text-slate-300 truncate">{r.name}</span>
                    <span className="text-rose-400 font-data shrink-0">{r.pct.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="col-span-2 text-[10px] text-slate-600">
            Échantillon indicatif de grandes capitalisations de l'indice, pas la totalité des composants.
          </p>
        </div>
      )}
    </div>
  );
}
