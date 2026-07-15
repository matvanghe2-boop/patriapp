import React, { useMemo, useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { eur } from "../lib/finance";

// ─── Recherche globale ─────────────────────────────────────────────────────
// Indexe les actifs / opérations / lignes de toutes les sections de l'app et
// permet de sauter directement au bon onglet depuis une seule barre de
// recherche. Ne fait aucun appel réseau : tout est local.
export default function GlobalSearch({
  livrets = [], bourse = { positions: [], operations: [] }, dettes = [],
  watchlist = [], strategyNotes = [], enveloppes = [], onNavigate,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const index = useMemo(() => {
    const items = [];
    livrets.forEach((l) =>
      items.push({ id: `livret-${l.id}`, tab: "livrets", type: "Livret", label: l.name, detail: eur(l.balance) })
    );
    (bourse.positions || []).forEach((p) =>
      items.push({
        id: `pos-${p.id}`, tab: "bourse", type: "Position",
        label: `${p.name} (${p.ticker})`, detail: eur(p.quantity * p.current_price),
      })
    );
    (bourse.operations || []).forEach((op) =>
      items.push({
        id: `op-${op.id}`, tab: "strategie", type: "Opération",
        label: `${op.type} ${op.ticker || ""}`.trim(), detail: op.date || "",
      })
    );
    dettes.forEach((d) =>
      items.push({ id: `dette-${d.id}`, tab: "dashboard", type: "Passif", label: d.name, detail: eur(d.amount) })
    );
    watchlist.forEach((w) =>
      items.push({ id: `watch-${w.id}`, tab: "bourse", type: "Watchlist", label: w.name || w.ticker, detail: w.ticker })
    );
    strategyNotes.forEach((n) =>
      items.push({ id: `note-${n.id}`, tab: "strategie", type: "Note de thèse", label: n.ticker || n.title || "Note", detail: n.date || "" })
    );
    enveloppes.forEach((e) =>
      items.push({ id: `env-${e.id}`, tab: "livrets", type: "Enveloppe", label: e.label, detail: eur(e.amount) })
    );
    return items;
  }, [livrets, bourse, dettes, watchlist, strategyNotes, enveloppes]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index.filter((it) => it.label?.toLowerCase().includes(q) || it.type.toLowerCase().includes(q)).slice(0, 12);
  }, [query, index]);

  const go = (item) => {
    onNavigate(item.tab);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative w-full max-w-xs">
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 focus-within:border-amber-400/50 rounded-lg px-2.5 py-1.5">
        <Search size={13} className="text-slate-500 shrink-0" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un actif, une opération..."
          className="bg-transparent text-xs text-slate-200 placeholder-slate-600 focus:outline-none w-full"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-slate-600 hover:text-slate-300">
            <X size={12} />
          </button>
        )}
      </div>

      {open && query && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 shadow-xl">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500">Aucun résultat pour « {query} ».</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => go(r)}
                className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-xs hover:bg-slate-900 border-b border-slate-900 last:border-b-0"
              >
                <span className="flex flex-col">
                  <span className="text-slate-200">{r.label}</span>
                  <span className="text-[10px] text-slate-500">{r.type}</span>
                </span>
                <span className="text-slate-500 font-data tabular-nums shrink-0">{r.detail}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
