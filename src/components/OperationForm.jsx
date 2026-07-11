import React, { useState, useEffect } from "react";
import { X, Check, TrendingUp, TrendingDown, Coins } from "lucide-react";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fenêtre modale flottante de saisie manuelle d'une opération
 * (achat / vente / dividende). Reste volontairement à l'écart de la liste
 * historique : l'utilisateur ne voit le formulaire que lorsqu'il clique sur
 * "Nouvelle Opération" (ou via la passerelle "Déclarer une opération" depuis
 * une thèse).
 */
export default function OperationForm({ open, onClose, onSubmit, positions = [], preset }) {
  const blank = {
    type: "ACHAT",
    asset: "",
    isNewAsset: false,
    quantity: "",
    price: "",
    fees: "",
    amount: "",
    date: todayIso(),
  };
  const [values, setValues] = useState(blank);

  useEffect(() => {
    if (open) {
      setValues({
        ...blank,
        type: preset?.type || "ACHAT",
        asset: preset?.asset || "",
        quantity: preset?.quantity != null ? String(preset.quantity) : "",
        price: preset?.price != null ? String(preset.price) : "",
        fees: preset?.fees != null ? String(preset.fees) : "",
        amount: preset?.amount != null ? String(preset.amount) : "",
        date: preset?.date || todayIso(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);

  if (!open) return null;

  const isDividende = values.type === "DIVIDENDE";

  const submit = (e) => {
    e.preventDefault();
    if (!values.asset.trim()) return;
    if (isDividende) {
      if (!values.amount) return;
      onSubmit({
        ...(preset?.id ? { id: preset.id } : {}),
        type: "DIVIDENDE",
        asset: values.asset.trim(),
        amount: parseFloat(values.amount),
        date: values.date,
        broker: preset?.broker || "Saisie manuelle",
        transactionId: preset?.transactionId ?? null,
      });
      return;
    }
    if (!values.quantity || !values.price) return;
    onSubmit({
      ...(preset?.id ? { id: preset.id } : {}),
      type: values.type,
      asset: values.asset.trim(),
      quantity: parseFloat(values.quantity),
      price: parseFloat(values.price),
      fees: values.fees === "" ? 0 : parseFloat(values.fees),
      date: values.date,
      broker: preset?.broker || "Saisie manuelle",
      transactionId: preset?.transactionId ?? null,
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
          <h3 className="font-display text-lg text-slate-50">{preset?.id ? "Modifier l'opération" : "Nouvelle opération"}</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
            <X size={16} />
          </button>
        </div>

        {/* Toggle ACHAT / VENTE / DIVIDENDE */}
        <div className="grid grid-cols-3 gap-2">
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
          <button
            type="button"
            onClick={() => setValues((v) => ({ ...v, type: "DIVIDENDE" }))}
            className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold transition-colors ${
              values.type === "DIVIDENDE"
                ? "bg-cyan-500/15 border-cyan-500/50 text-cyan-300"
                : "border-slate-700 text-slate-500 hover:text-slate-300"
            }`}
          >
            <Coins size={15} /> Dividende
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

        {isDividende ? (
          <div>
            <label className="text-[11px] text-slate-500">Montant du dividende reçu (€)</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={values.amount}
              onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
            />
          </div>
        ) : (
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
        )}

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
            <Check size={14} /> {preset?.id ? "Enregistrer les modifications" : "Valider l'opération"}
          </button>
        </div>
      </form>
    </div>
  );
}
