import { useState, useEffect, useRef, useId } from "react";
import { lireNombre } from "../lib/finance";
import { searchSecurity, fetchQuotes } from "../lib/api";

/**
 * Panneau d'ajout d'une position (recherche de titre ou saisie libre).
 * Sorti de Bourse.jsx.
 */

export default function AddPositionPanel({ open, onClose, onSubmit }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
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

  // Remise à zéro à la FERMETURE, décidée pendant le rendu plutôt que dans un
  // effet : sinon le panneau se rouvrait brièvement avec la saisie précédente
  // encore affichée, le temps que l'effet s'exécute.
  const [ouvertPrecedent, setOuvertPrecedent] = useState(open);
  if (open !== ouvertPrecedent) {
    setOuvertPrecedent(open);
    if (!open) {
      setQuery(""); setResults([]); setSelected(null); setQuantity("");
      setPru(""); setAnnualDividend(""); setManual(false); setError("");
    }
  }

  useEffect(() => {
    if (manual || selected) return undefined;
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) return undefined;
    // `setLoading(true)` était appelé ici, synchroniquement : chaque caractère
    // tapé allumait donc le témoin de chargement pour une recherche qui, neuf
    // fois sur dix, allait être annulée par la frappe suivante. Il part
    // désormais avec la requête, à l'expiration du délai.
    debounceRef.current = setTimeout(async () => {
      setLoading(true); setError("");
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
      onSubmit({ ticker: query.toUpperCase(), name: query, type: "Autre", quantity: lireNombre(quantity), pru: lireNombre(pru), current_price: lireNombre(pru), annual_dividend: lireNombre(annualDividend) ?? 0 });
    } else {
      onSubmit({ ticker: selected.symbol, name: selected.name, type: selected.type || "Autre", quantity: lireNombre(quantity), pru: lireNombre(pru), current_price: selected.current_price || 0, annual_dividend: lireNombre(annualDividend) ?? 0, currency: selected.currency || "EUR" });
    }
    onClose();
  };

  return (
    <form onSubmit={submit} className="mt-3 p-4 rounded-xl border border-amber-400/20 bg-slate-950 space-y-3">
      {!manual ? (
        <>
          <label htmlFor={`${idsChamps}-ticker-isin-ou`} className="text-micro text-slate-500">Ticker, ISIN ou nom du produit</label>
          <input id={`${idsChamps}-ticker-isin-ou`} autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Ex : CW8, FR0011550185, Air Liquide..." className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400/60" />
          {loading && <p className="text-xs text-slate-500">Recherche en cours…</p>}
          {error && <p className="text-xs text-amber-400/90">{error}</p>}
          {/* La liste est DÉRIVÉE de la requête courante, elle n'est plus vidée
              par un effet. L'ancien code appelait `setResults([])` dès que la
              saisie repassait sous deux caractères ; en dériver l'affichage
              évite à la fois ce rendu supplémentaire et le risque d'afficher
              des résultats qui ne correspondent plus à ce qui est tapé. */}
          {!selected && query.trim().length >= 2 && results.length > 0 && (
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
          <button type="button" onClick={() => setManual(true)} className="text-micro text-slate-500 hover:text-slate-300 underline">Le produit n'est pas trouvé ? Saisie manuelle</button>
        </>
      ) : (
        <>
          <label htmlFor={`${idsChamps}-nom-ticker-saisie`} className="text-micro text-slate-500">Nom / ticker (saisie libre)</label>
          <input id={`${idsChamps}-nom-ticker-saisie`} value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400/60" placeholder="Ex : Plan Épargne Entreprise" />
          <button type="button" onClick={() => setManual(false)} className="text-micro text-slate-500 hover:text-slate-300 underline">Revenir à la recherche</button>
        </>
      )}
      {ready && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${idsChamps}-quantite`} className="text-micro text-slate-500">Quantité</label>
            <input id={`${idsChamps}-quantite`} required type="number" step="0.0001" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
          </div>
          <div>
            <label htmlFor={`${idsChamps}-prix-de-revient`} className="text-micro text-slate-500">Prix de revient unitaire (€)</label>
            <input id={`${idsChamps}-prix-de-revient`} required type="number" step="0.01" value={pru} onChange={(e) => setPru(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
          </div>
          <div className="col-span-2">
            <label htmlFor={`${idsChamps}-dividende-annuel-par`} className="text-micro text-slate-500">Dividende annuel par action (€) — optionnel</label>
            <input id={`${idsChamps}-dividende-annuel-par`} type="number" step="0.01" placeholder="Ex : 1.20" value={annualDividend} onChange={(e) => setAnnualDividend(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
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
