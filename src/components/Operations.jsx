import React, { useMemo, useRef, useState } from "react";
import { UploadCloud, Plus, Loader2, AlertTriangle, CheckCircle2, Wallet, Percent, TrendingUp, Sparkles } from "lucide-react";
import { Card, CardLabel, GhostButton, EmptyState } from "./ui";
import { eur, pctPlain, computeBuyOperation, computeSellOperation, generateOperationHash } from "../lib/finance";
import { parseOperationPdf } from "../lib/api";
import OperationForm from "./OperationForm";
import OperationList from "./OperationList";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Sous-onglet "Opérations" — le cœur comptable de Stratégie & Logs.
 *
 * Toute opération validée (import PDF ou saisie manuelle) met à jour de
 * façon atomique deux choses dans l'état `bourse` :
 *  - la position correspondante (quantité + PRU, via finance.js) ;
 *  - l'historique `bourse.operations` (source de vérité de la comptabilité).
 *
 * Anti-doublons : un `transactionId` déjà présent dans l'historique (ou un
 * hash généré à partir des données de l'ordre si l'ID est absent) rejette
 * l'import silencieusement — le fichier n'est jamais comptabilisé deux fois.
 */
export default function Operations({ bourse, setBourse, presetOperation, onConsumePreset, onOpenThesis }) {
  const positions = bourse?.positions || [];
  const operations = bourse?.operations || [];

  const [formOpen, setFormOpen] = useState(false);
  const [formPreset, setFormPreset] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: "success"|"error", message }
  const fileInputRef = useRef(null);

  // Ouverture externe de la modale (passerelle Thèse ➔ Ordre).
  React.useEffect(() => {
    if (presetOperation) {
      setFormPreset({ asset: presetOperation.asset, type: presetOperation.type || "ACHAT" });
      setFormOpen(true);
      onConsumePreset?.();
    }
  }, [presetOperation, onConsumePreset]);

  // ─── Comptabilisation d'un ordre (commune import PDF / saisie manuelle) ──
  const commitOperation = (order) => {
    const dedupeKey = order.transactionId || generateOperationHash(order);
    const alreadyExists = operations.some((op) => (op.transactionId || generateOperationHash(op)) === dedupeKey);
    if (alreadyExists) {
      setFeedback({ type: "error", message: `Ordre déjà comptabilisé (${order.asset}, ${order.date}) — import ignoré.` });
      return false;
    }

    const tickerKey = order.asset.toUpperCase();
    const existingPosition = positions.find((p) => p.ticker?.toUpperCase() === tickerKey);

    let montantNet, plusValueRealisee = null;
    let newPositions;

    if (order.type === "ACHAT") {
      const { montantNet: m, newQuantity, newPru, newTotalBuyFees } = computeBuyOperation(existingPosition, order);
      montantNet = m;
      if (existingPosition) {
        newPositions = positions.map((p) =>
          p.id === existingPosition.id ? { ...p, quantity: newQuantity, pru: newPru, totalBuyFees: newTotalBuyFees } : p
        );
      } else {
        newPositions = [
          ...positions,
          {
            id: uid(),
            ticker: order.asset,
            name: order.asset,
            quantity: newQuantity,
            pru: newPru,
            current_price: order.price,
            type: "Action",
            annual_dividend: 0,
            totalBuyFees: newTotalBuyFees,
          },
        ];
      }
    } else {
      if (!existingPosition || existingPosition.quantity < order.quantity) {
        setFeedback({ type: "error", message: `Vente rejetée : quantité détenue insuffisante pour ${order.asset}.` });
        return false;
      }
      const { montantNet: m, newQuantity, plusValueRealisee: pv, newTotalBuyFees } = computeSellOperation(existingPosition, order);
      montantNet = m;
      plusValueRealisee = pv;
      newPositions =
        newQuantity <= 0
          ? positions.filter((p) => p.id !== existingPosition.id)
          : positions.map((p) => (p.id === existingPosition.id ? { ...p, quantity: newQuantity, totalBuyFees: newTotalBuyFees } : p));
    }

    const newOperation = { id: uid(), ...order, montantNet, plusValueRealisee };

    setBourse((b) => ({ ...b, positions: newPositions, operations: [newOperation, ...(b.operations || [])] }));
    setFeedback({ type: "success", message: `Opération enregistrée : ${order.type} ${order.quantity} ${order.asset}.` });
    return true;
  };

  // ─── Import PDF ────────────────────────────────────────────────────────────
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type === "application/pdf");
    if (files.length === 0) return;
    setImporting(true);
    setFeedback(null);
    for (const file of files) {
      try {
        const order = await parseOperationPdf(file);
        commitOperation(order);
      } catch (err) {
        setFeedback({ type: "error", message: `${file.name} : ${err.message}` });
      }
    }
    setImporting(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // ─── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalFees = operations.reduce((s, op) => s + (op.fees || 0), 0);
    const totalVerse = operations
      .filter((op) => op.type === "ACHAT")
      .reduce((s, op) => s + op.quantity * op.price + (op.fees || 0), 0);
    const tauxEffort = totalVerse > 0 ? (totalFees / totalVerse) * 100 : 0;
    const plusValuesRealisees = operations.reduce((s, op) => s + (op.plusValueRealisee || 0), 0);
    const plusValuesLatentes = positions.reduce((s, p) => s + (p.current_price - p.pru) * p.quantity, 0);
    return { totalFees, tauxEffort, plusValuesRealisees, plusValuesLatentes };
  }, [operations, positions]);

  return (
    <div className="flex flex-col gap-5">
      {/* En-tête d'action & import */}
      <Card>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <CardLabel icon={UploadCloud}>Import & saisie</CardLabel>
          <GhostButton onClick={() => { setFormPreset(null); setFormOpen(true); }} theme="cyan">
            Nouvelle Opération
          </GhostButton>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            dragOver ? "border-cyan-400/70 bg-cyan-500/5" : "border-slate-700 hover:border-slate-600"
          }`}
        >
          {importing ? (
            <Loader2 size={26} className="text-cyan-300 animate-spin" />
          ) : (
            <UploadCloud size={26} className="text-slate-500" />
          )}
          <p className="text-sm text-slate-300">
            Glisse-dépose tes avis d'opérés PDF ici (Boursorama, Fortuneo, Bourse Direct)
          </p>
          <p className="text-xs text-slate-600">ou clique pour sélectionner un fichier</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        {feedback && (
          <div
            className={`mt-3 flex items-center gap-2 text-xs rounded-lg border px-3 py-2 ${
              feedback.type === "success"
                ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                : "text-amber-300 border-amber-500/30 bg-amber-500/10"
            }`}
          >
            {feedback.type === "success" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {feedback.message}
          </div>
        )}
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardLabel icon={Wallet}>Frais totaux</CardLabel>
          <div className="font-data text-xl font-bold text-slate-100">{eur(kpis.totalFees, 2)}</div>
        </Card>
        <Card>
          <CardLabel icon={Percent}>Taux d'effort des frais</CardLabel>
          <div className={`font-data text-xl font-bold ${kpis.tauxEffort < 0.5 ? "text-emerald-400" : "text-amber-400"}`}>
            {pctPlain(kpis.tauxEffort, 2)}
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">Objectif pro : &lt; 0,5 %</p>
        </Card>
        <Card>
          <CardLabel icon={Sparkles}>Plus-values réalisées</CardLabel>
          <div className={`font-data text-xl font-bold ${kpis.plusValuesRealisees >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {eur(kpis.plusValuesRealisees, 2)}
          </div>
        </Card>
        <Card>
          <CardLabel icon={TrendingUp}>Plus-values latentes</CardLabel>
          <div className={`font-data text-xl font-bold ${kpis.plusValuesLatentes >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {eur(kpis.plusValuesLatentes, 2)}
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">Rappel virtuel — onglet Bourse</p>
        </Card>
      </div>

      {/* Historique */}
      <Card>
        <CardLabel icon={UploadCloud}>Historique des opérations</CardLabel>
        <OperationList operations={operations} onRowClick={(op) => onOpenThesis?.(op.asset)} />
      </Card>

      <OperationForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={(order) => {
          const ok = commitOperation(order);
          if (ok) setFormOpen(false);
        }}
        positions={positions}
        preset={formPreset}
      />
    </div>
  );
}
