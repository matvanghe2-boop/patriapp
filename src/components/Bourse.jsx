import React, { useState, useEffect, useRef } from "react";
import { TrendingUp, Wallet, RefreshCw } from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, EmptyState } from "./ui";
import { eur, pctPlain, pct, uid } from "../lib/finance";
import { searchSecurity, fetchQuotes } from "../lib/api";

export default function Bourse({ bourse, setBourse, bourseTotal, bourseGainAbs, bourseGainPct }) {
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");

  const addPosition = (v) =>
    setBourse((b) => ({
      ...b,
      positions: [
        ...b.positions,
        { id: uid(), ticker: v.ticker, name: v.name, quantity: v.quantity, pru: v.pru, current_price: v.current_price, type: v.type },
      ],
    }));
  const removePosition = (id) => setBourse((b) => ({ ...b, positions: b.positions.filter((x) => x.id !== id) }));

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
                  const value = p.quantity * p.current_price;
                  const gainAbs = (p.current_price - p.pru) * p.quantity;
                  const gainPct = p.pru > 0 ? ((p.current_price - p.pru) / p.pru) * 100 : 0;
                  const weight = bourseTotal > 0 ? (value / bourseTotal) * 100 : 0;
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
                        <IconTrash onClick={() => removePosition(p.id)} />
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
