import React, { useState, useEffect } from "react";
import { X, Check, TrendingUp, TrendingDown } from "lucide-react";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fenêtre modale flottante de saisie manuelle d'une opération (achat/vente).
 * Reste volontairement à l'écart de la liste historique : l'utilisateur ne
 * voit le formulaire que lorsqu'il clique sur "Nouvelle Opération" (ou via
 * la passerelle "Déclarer une opération" depuis une thèse).
 */
export default function OperationForm({ open, onClose, onSubmit, positions = [], preset }) {
  const blank = {
    type: "ACHAT",
    asset: "",
    isNewAsset: false,
    quantity: "",
    price: "",
    fees: "",
    date: todayIso(),
  };
  const [values, setValues] = useState(blank);

  useEffect(() => {
    if (open) {
      setValues({
        ...blank,
        type: preset?.type || "ACHAT",
        asset: preset?.asset || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!values.asset.trim() || !values.quantity || !values.price) return;
    onSubmit({
      type: values.type,
      asset: values.asset.trim(),
      quantity: parseFloat(values.quantity),
      price: parseFloat(values.price),
      fees: values.fees === "" ? 0 : parseFloat(values.fees),
      date: values.date,
      broker: "Saisie manuelle",
      transactionId: null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-cyan-500/30 bg-slate-900 p-5 flex flex-col gap-4 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-slate-50">Nouvelle opération</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
            <X size={16} />
          </button>
        </div>

        {/* Toggle ACHAT / VENTE */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setValues((v) => ({ ...v, type: "ACHAT" }))}
            className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold transition-colors ${
              values.type === "ACHAT"
                ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                : "border-slate-700 text-slate-500 hover:text-slate-300"
            }`}
          >
            <TrendingUp size={15} /> Achat
          </button>
          <button
            type="button"
            onClick={() => setValues((v) => ({ ...v, type: "VENTE" }))}
            className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold transition-colors ${
              values.type === "VENTE"
                ? "bg-rose-500/15 border-rose-500/50 text-rose-300"
                : "border-slate-700 text-slate-500 hover:text-slate-300"
            }`}
          >
            <TrendingDown size={15} /> Vente
          </button>
        </div>

        {/* Actif */}
        <div>
          <label className="text-[11px] text-slate-500">Actif</label>
          <input
            list="operation-assets"
            required
            type="text"
            placeholder="Ticker ou nom (ex : AI.PA, Air Liquide)"
            value={values.asset}
            onChange={(e) => setValues((v) => ({ ...v, asset: e.target.value }))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60"
          />
          <datalist id="operation-assets">
            {positions.map((p) => (
              <option key={p.id} value={p.ticker} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-slate-500">Quantité</label>
            <input
              required
              type="number"
              step="1"
              min="0"
              value={values.quantity}
              onChange={(e) => setValues((v) => ({ ...v, quantity: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500">Prix unitaire (€)</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={values.price}
              onChange={(e) => setValues((v) => ({ ...v, price: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500">Frais (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={values.fees}
              onChange={(e) => setValues((v) => ({ ...v, fees: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-slate-500">Date</label>
          <input
            required
            type="date"
            value={values.date}
            onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
          />
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
            Annuler
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg px-4 py-1.5 transition-colors"
          >
            <Check size={14} /> Valider l'opération
          </button>
        </div>
      </form>
    </div>
  );
}
