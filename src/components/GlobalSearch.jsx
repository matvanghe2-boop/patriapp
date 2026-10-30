import { useMemo, useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { sansAccent } from "./PaletteCommandes";

// ─── Recherche globale ─────────────────────────────────────────────────────
// Cherche dans l'index de toutes les sections de l'app (le même que la
// palette de commandes, voir `construireIndex`) et saute directement au bon
// onglet — et au bon sous-onglet. Ne fait aucun appel réseau : tout est local.
export default function GlobalSearch({ index = [], onNavigate }) {
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

  const results = useMemo(() => {
    const q = sansAccent(query.trim());
    if (!q) return [];
    return index.filter((it) => it.cle.includes(q)).slice(0, 12);
  }, [query, index]);

  const go = (item) => {
    onNavigate(item.onglet, item.sous);
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
          placeholder="Rechercher…  Ctrl K"
          aria-label="Rechercher dans tout Patrium"
          className="bg-transparent text-xs text-slate-200 placeholder-slate-600 focus:outline-none w-full"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Effacer la recherche" className="text-slate-500 hover:text-slate-300">
            <X size={12} />
          </button>
        )}
      </div>

      {open && query && (
        <div className="pop-in absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 shadow-xl">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500">Aucun résultat pour « {query} ».</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => go(r)}
                className="btn-flash w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-xs hover:bg-slate-900 border-b border-slate-900 last:border-b-0"
              >
                <span className="flex flex-col">
                  <span className="text-slate-200">{r.libelle}</span>
                  <span className="text-micro text-slate-500">{r.categorie}</span>
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
