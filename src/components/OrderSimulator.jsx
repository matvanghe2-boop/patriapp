import React, { useState, useMemo } from "react";
import { Calculator, TrendingUp, Coins, AlertTriangle, Wallet, Target } from "lucide-react";
import { Card, CardLabel } from "./ui";
import { eur, pctPlain } from "../lib/finance";
import AssetLogo from "./AssetLogo";

const CASH_ALERT_THRESHOLD = 50;

export default function OrderSimulator({ bourse, bourseTotal }) {
  const positions = bourse?.positions || [];
  const [assetId, setAssetId] = useState(positions[0]?.id || "");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(positions[0]?.current_price || 0);
  const [targetPct, setTargetPct] = useState("");
  const [courtage, setCourtage] = useState(2);
  const [ttfApplicable, setTtfApplicable] = useState(false);

  const position = positions.find((p) => p.id === assetId) || null;

  // Change d'actif : réinitialise le cours au dernier cours connu.
  const onSelectAsset = (id) => {
    setAssetId(id);
    const p = positions.find((x) => x.id === id);
    if (p) setPrice(p.current_price);
  };

  const currentQty = position?.quantity || 0;
  const currentPru = position?.pru || 0;
  const currentValue = currentQty * (position?.current_price || 0);

  // ─── Poids cible → quantité suggérée ───────────────────────────────────
  // n = (pct·V - valeurActuelle) / (P·(1 - pct))
  const suggestedQty = useMemo(() => {
    const pct = parseFloat(targetPct) / 100;
    if (!pct || !price || pct >= 1) return null;
    const n = (pct * bourseTotal - currentValue) / (price * (1 - pct));
    return n > 0 ? Math.round(n) : 0;
  }, [targetPct, bourseTotal, currentValue, price]);

  const applySuggestion = () => {
    if (suggestedQty != null) setQuantity(suggestedQty);
  };

  // ─── Calculs de l'ordre ──────────────────────────────────────────────
  const qty = parseFloat(quantity) || 0;
  const montantBrut = qty * price;
  const ttf = ttfApplicable ? montantBrut * 0.003 : 0;
  const fraisAchat = (parseFloat(courtage) || 0) + ttf;
  const coutTotal = montantBrut + fraisAchat;

  const newQty = currentQty + qty;
  const newPru = newQty > 0 ? (currentQty * currentPru + coutTotal) / newQty : 0;

  const newValue = currentValue + montantBrut;
  const newTotal = bourseTotal + montantBrut;
  const currentWeight = bourseTotal > 0 ? (currentValue / bourseTotal) * 100 : 0;
  const newWeight = newTotal > 0 ? (newValue / newTotal) * 100 : 0;

  // Breakeven : approx en ajoutant une seconde couche de frais de vente au même barème
  const fraisVenteEstimes = (parseFloat(courtage) || 0) + (ttfApplicable ? montantBrut * 0.003 : 0);
  const breakeven = qty > 0 ? (coutTotal + fraisVenteEstimes) / qty : 0;

  const dividendeAnnuelSupp = qty * (position?.annual_dividend || 0);

  const cashActuel = bourse?.cash_pocket || 0;
  const cashRestant = cashActuel - coutTotal;
  const cashInsuffisant = cashRestant < 0;
  const cashBas = !cashInsuffisant && cashRestant < CASH_ALERT_THRESHOLD;

  if (positions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardLabel icon={Calculator}>Simulateur d'ordre — avant de valider</CardLabel>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mt-2">
        {/* ─── Colonne gauche : formulaire (60%) ─── */}
        <div className="lg:col-span-3 space-y-3">
          <div>
            <label className="text-[11px] text-slate-500">Actif ciblé</label>
            <select
              value={assetId}
              onChange={(e) => onSelectAsset(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60"
            >
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.ticker} — {p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500">Quantité</label>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setQuantity((q) => Math.max(0, (parseFloat(q) || 0) - 1))} className="w-7 h-7 shrink-0 rounded-lg border border-slate-700 text-slate-400 hover:text-cyan-300">−</button>
                <input
                  type="number" min="0" value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full text-center bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
                />
                <button type="button" onClick={() => setQuantity((q) => (parseFloat(q) || 0) + 1)} className="w-7 h-7 shrink-0 rounded-lg border border-slate-700 text-slate-400 hover:text-cyan-300">+</button>
              </div>
            </div>
            <div>
              <label className="text-[11px] text-slate-500">Cours d'achat (€)</label>
              <input
                type="number" step="0.01" value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
              />
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-slate-500 flex items-center gap-1"><Target size={11} /> Poids cible visé (%)</label>
              <input
                type="number" step="0.5" placeholder="Ex : 15"
                value={targetPct}
                onChange={(e) => setTargetPct(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
              />
            </div>
            {suggestedQty != null && (
              <button type="button" onClick={applySuggestion} className="text-[11px] font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg px-3 py-1.5 shrink-0">
                Appliquer {suggestedQty} actions
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800 space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Calculs complémentaires</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500">Frais de courtage (€)</label>
                <input
                  type="number" step="0.01" value={courtage}
                  onChange={(e) => setCourtage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400 mt-5">
                <input type="checkbox" checked={ttfApplicable} onChange={(e) => setTtfApplicable(e.target.checked)} />
                TTF 0,3 % (grandes valeurs FR)
              </label>
            </div>
            <p className="text-xs text-slate-400">
              Seuil de rentabilité (breakeven) : <span className="font-data text-slate-200">{eur(breakeven, 2)}</span>
              <span className="text-[11px] text-slate-600"> (frais d'achat + vente estimés inclus)</span>
            </p>
            <p className="text-xs text-slate-400">
              Coût total de l'ordre : <span className="font-data text-slate-200">{eur(coutTotal, 2)}</span>
            </p>
          </div>
        </div>

        {/* ─── Colonne droite : impact (40%) ─── */}
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              <TrendingUp size={11} /> Impact portefeuille
            </div>
            <div className="text-[11px] text-slate-500">PRU actuel : <span className="font-data ghost-blur">{currentPru ? eur(currentPru, 2) : "—"}</span></div>
            <div className={`font-display text-xl mt-0.5 ghost-blur ${newPru < currentPru ? "text-emerald-400" : "text-slate-100"}`}>
              {eur(newPru, 2)}
              <span className="text-xs font-sans text-slate-500 ml-1">nouveau PRU</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-2">
              Poids de la ligne : <span className="font-data text-slate-300">{pctPlain(currentWeight, 1)}</span>
              <span className="text-slate-600"> ➔ </span>
              <span className="font-data text-cyan-300">{pctPlain(newWeight, 1)}</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              <Coins size={11} /> Plus-value passive
            </div>
            {dividendeAnnuelSupp > 0 ? (
              <div className="font-data text-lg font-bold text-emerald-400">+{eur(dividendeAnnuelSupp, 2)} / an</div>
            ) : (
              <div className="text-xs text-slate-600">Aucun dividende renseigné pour cette ligne.</div>
            )}
          </div>

          <div className={`rounded-xl border p-3 ${cashInsuffisant ? "border-rose-500/40 bg-rose-500/10" : cashBas ? "border-amber-500/40 bg-amber-500/10" : "border-slate-800 bg-slate-950/60"}`}>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 mb-1">
              <Wallet size={11} /> Alerte cash
            </div>
            {cashInsuffisant ? (
              <p className="text-sm text-rose-300 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Solde insuffisant : il manque <span className="font-data">{eur(Math.abs(cashRestant), 2)}</span>.
              </p>
            ) : (
              <p className={`text-sm ${cashBas ? "text-amber-300" : "text-slate-300"}`}>
                Il restera <span className="font-data ghost-blur">{eur(cashRestant, 2)}</span> de cash après cet ordre.
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}


import React, { useMemo, useState } from "react";
import { Sliders, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardLabel, EmptyState } from "./ui";
import { eur, pctPlain } from "../lib/finance";

export default function OrderSimulator({ positions = [], cashPocket = 0 }) {
  const [tickerId, setTickerId] = useState(positions[0]?.id || "");
  const [mode, setMode] = useState("vente"); // "vente" | "achat"
  const [targetWeight, setTargetWeight] = useState(10);

  const totalValue = useMemo(
    () => positions.reduce((s, p) => s + p.quantity * p.current_price, 0) + cashPocket,
    [positions, cashPocket]
  );

  const pos = positions.find((p) => p.id === tickerId);

  const result = useMemo(() => {
    if (!pos || totalValue <= 0) return null;
    const price = pos.current_price;
    const w = targetWeight / 100;
    const currentValue = pos.quantity * price;
    const currentWeight = (currentValue / totalValue) * 100;

    // x = variation de quantité (positif = vendre, négatif = acheter) pour atteindre w
    // (currentValue - x*price) / (totalValue - x*price) = w
    const denom = price * (1 - w);
    if (Math.abs(denom) < 1e-9) return null;
    const x = (currentValue - w * totalValue) / denom;

    const isSell = x > 0;
    if (mode === "vente" && !isSell) return { impossible: true, currentWeight };
    if (mode === "achat" && isSell) return { impossible: true, currentWeight };

    const qty = Math.min(Math.abs(x), mode === "vente" ? pos.quantity : Infinity);
    const montant = qty * price;
    const gainRealise = mode === "vente" ? (price - pos.pru) * qty : null;
    const newWeight = totalValue > 0
      ? (mode === "vente" ? (currentValue - montant) / (totalValue - montant) : (currentValue + montant) / (totalValue + montant)) * 100
      : 0;

    return { qty, montant, gainRealise, currentWeight, newWeight, impossible: false };
  }, [pos, totalValue, targetWeight, mode]);

  if (positions.length === 0) return null;

  return (
    <Card>
      <CardLabel icon={Sliders}>Simulateur d'ordre — atteindre un poids cible</CardLabel>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
        <div>
          <label className="text-[11px] text-slate-500">Actif</label>
          <select
            value={tickerId}
            onChange={(e) => setTickerId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-violet-400/60"
          >
            {positions.map((p) => <option key={p.id} value={p.id}>{p.ticker}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-slate-500">Sens</label>
          <div className="flex rounded-lg border border-slate-700 overflow-hidden mt-0.5">
            <button
              onClick={() => setMode("vente")}
              className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 ${mode === "vente" ? "bg-rose-500/20 text-rose-300" : "text-slate-500"}`}
            >
              <TrendingDown size={13} /> Vente
            </button>
            <button
              onClick={() => setMode("achat")}
              className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 ${mode === "achat" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-500"}`}
            >
              <TrendingUp size={13} /> Achat
            </button>
          </div>
        </div>
        <div>
          <label className="text-[11px] text-slate-500">Poids cible (%)</label>
          <input
            type="number" step="0.5" min="0" max="100"
            value={targetWeight}
            onChange={(e) => setTargetWeight(parseFloat(e.target.value) || 0)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-violet-400/60"
          />
        </div>
      </div>

      {!result ? (
        <EmptyState>Sélectionne un actif et un poids cible.</EmptyState>
      ) : result.impossible ? (
        <p className="text-sm text-amber-300/90 mt-3">
          Poids déjà {result.currentWeight < targetWeight ? "inférieur" : "supérieur"} à la cible pour ce sens d'opération — change de sens ou de cible.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[11px] text-slate-500">Poids actuel</p>
            <p className="font-data font-bold text-slate-100">{pctPlain(result.currentWeight, 1)}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[11px] text-slate-500">Titres à {mode === "vente" ? "vendre" : "acheter"}</p>
            <p className="font-data font-bold text-violet-300">{result.qty.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[11px] text-slate-500">Montant {mode === "vente" ? "récupéré" : "à investir"}</p>
            <p className="font-data font-bold text-slate-100">{eur(result.montant, 2)}</p>
          </div>
          {mode === "vente" && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[11px] text-slate-500">Gain réalisé estimé</p>
              <p className={`font-data font-bold ${result.gainRealise >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {eur(result.gainRealise, 2)}
              </p>
            </div>
          )}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 col-span-2 sm:col-span-1">
            <p className="text-[11px] text-slate-500">Nouveau poids</p>
            <p className="font-data font-bold text-violet-300">{pctPlain(result.newWeight, 1)}</p>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-600 mt-3">
        Simulation indicative (frais non inclus). Le gain réalisé est calculé sur le PRU actuel de la ligne.
      </p>
    </Card>
  );
}