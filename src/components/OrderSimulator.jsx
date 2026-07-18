import React, { useMemo, useState } from "react";
import { Sliders, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardLabel, EmptyState } from "./ui";
import { eur, pctPlain } from "../lib/finance";

function computeSimulation(pos, totalValue, targetWeightPct, mode) {
  if (!pos || totalValue <= 0) return null;

  const price = pos.current_price;
  if (!price || price <= 0) return null;

  const w = targetWeightPct / 100;
  const currentValue = pos.quantity * price;
  const currentWeight = (currentValue / totalValue) * 100;

  // Résolution de x (variation de quantité) telle que :
  // (currentValue - x*price) / (totalValue - x*price) = w
  // x > 0 => vente, x < 0 => achat
  const denom = price * (1 - w);
  if (Math.abs(denom) < 1e-9) return { impossible: true, currentWeight };

  const x = (currentValue - w * totalValue) / denom;
  const isSell = x > 0;

  if (mode === "vente" && !isSell) return { impossible: true, currentWeight };
  if (mode === "achat" && isSell) return { impossible: true, currentWeight };

  const rawQty = Math.abs(x);
  const qty = mode === "vente" ? Math.min(rawQty, pos.quantity) : rawQty;
  const montant = qty * price;
  const gainRealise = mode === "vente" ? (price - pos.pru) * qty : null;

  const newValue = mode === "vente" ? currentValue - montant : currentValue + montant;
  const newTotal = mode === "vente" ? totalValue - montant : totalValue + montant;
  const newWeight = newTotal > 0 ? (newValue / newTotal) * 100 : 0;

  return { qty, montant, gainRealise, currentWeight, newWeight, impossible: false };
}

export default function OrderSimulator({ positions = [], cashPocket = 0 }) {
  const [tickerId, setTickerId] = useState(positions[0]?.id || "");
  const [mode, setMode] = useState("vente"); // "vente" | "achat"
  const [targetWeight, setTargetWeight] = useState(10);

  const totalValue = useMemo(
    () => positions.reduce((s, p) => s + p.quantity * p.current_price, 0) + cashPocket,
    [positions, cashPocket]
  );

  const pos = positions.find((p) => p.id === tickerId) || null;

  const result = useMemo(
    () => computeSimulation(pos, totalValue, targetWeight, mode),
    [pos, totalValue, targetWeight, mode]
  );

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
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.ticker}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] text-slate-500">Sens</label>
          <div className="flex rounded-lg border border-slate-700 overflow-hidden mt-0.5">
            <button
              type="button"
              onClick={() => setMode("vente")}
              className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 ${
                mode === "vente" ? "bg-rose-500/20 text-rose-300" : "text-slate-500"
              }`}
            >
              <TrendingDown size={13} /> Vente
            </button>
            <button
              type="button"
              onClick={() => setMode("achat")}
              className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 ${
                mode === "achat" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-500"
              }`}
            >
              <TrendingUp size={13} /> Achat
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-slate-500">Poids cible (%)</label>
          <input
            type="number"
            step="0.5"
            min="0"
            max="100"
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
          Poids déjà {result.currentWeight < targetWeight ? "inférieur" : "supérieur"} à la cible pour ce sens
          d'opération — change de sens ou de cible.
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
          {mode === "vente" ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[11px] text-slate-500">Gain réalisé estimé</p>
              <p className={`font-data font-bold ${result.gainRealise >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {eur(result.gainRealise, 2)}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[11px] text-slate-500">Nouveau poids</p>
              <p className="font-data font-bold text-violet-300">{pctPlain(result.newWeight, 1)}</p>
            </div>
          )}
          {mode === "vente" && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 col-span-2 sm:col-span-1">
              <p className="text-[11px] text-slate-500">Nouveau poids</p>
              <p className="font-data font-bold text-violet-300">{pctPlain(result.newWeight, 1)}</p>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-600 mt-3">
        Simulation indicative (frais non inclus). Le gain réalisé est calculé sur le PRU actuel de la ligne.
      </p>
    </Card>
  );
}
