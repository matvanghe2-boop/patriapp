import React, { useMemo, useRef, useState } from "react";
import { UploadCloud, Plus, Loader2, AlertTriangle, CheckCircle2, Wallet, Percent, TrendingUp, Sparkles, Trash2, Coins } from "lucide-react";
import { Card, CardLabel, GhostButton, EmptyState } from "./ui";
import { eur, pctPlain, computeBuyOperation, computeSellOperation, generateOperationHash, sanitizeOperation } from "../lib/finance";
import { parseOperationPdf } from "../lib/api";
import OperationForm from "./OperationForm";
import OperationList from "./OperationList";
import OrderSimulator from "./OrderSimulator";
import { useToast } from "../lib/ToastContext";

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
 *
 * Toutes les suppressions (opération, purge complète) passent par le Toast
 * Manager avec un bouton "Annuler" (5 secondes) plutôt qu'un window.confirm
 * bloquant — l'état précédent est capturé avant la mutation et restauré tel
 * quel si l'utilisateur clique sur Annuler.
 */
export default function Operations({ bourse, setBourse, presetOperation, onConsumePreset, onOpenThesis }) {
  const positions = bourse?.positions || [];
  const operations = bourse?.operations || [];
  const { showToast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [formPreset, setFormPreset] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: "success"|"error", message }
  const fileInputRef = useRef(null);

  // Valeur totale du portefeuille (positions + cash) — utilisée par le
  // simulateur d'ordre pour calculer les poids cibles.
  const bourseTotalForSim = useMemo(
    () => positions.reduce((s, p) => s + p.quantity * p.current_price, 0) + (bourse?.cash_pocket || 0),
    [positions, bourse]
  );

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

    // Dividende / coupon perçu : vient créditer la poche de cash, ne touche
    // à aucune position ni PRU.
    if (order.type === "DIVIDENDE") {
      const newOperation = sanitizeOperation({ id: uid(), ...order, montantNet: order.amount, plusValueRealisee: null });
      setBourse((b) => ({
        ...b,
        cash_pocket: (b.cash_pocket || 0) + (order.amount || 0),
        operations: [newOperation, ...(b.operations || [])],
      }));
      setFeedback({ type: "success", message: `Dividende enregistré : +${eur(order.amount, 2)} (${order.asset || "n/c"}).` });
      return true;
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

    const newOperation = sanitizeOperation({ id: uid(), ...order, montantNet, plusValueRealisee });

    setBourse((b) => ({ ...b, positions: newPositions, operations: [newOperation, ...(b.operations || [])] }));
    setFeedback({ type: "success", message: `Opération enregistrée : ${order.type} ${order.quantity} ${order.asset}.` });
    return true;
  };

  const [reviewQueue, setReviewQueue] = useState([]); // ordres incomplets à finaliser manuellement, un par un

  // ─── Import PDF ────────────────────────────────────────────────────────────
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type === "application/pdf");
    if (files.length === 0) return;
    setImporting(true);
    setFeedback(null);
    const pendingReview = [];
    for (const file of files) {
      try {
        // `rawExcerpt` (extrait du texte brut du PDF, renvoyé uniquement en
        // cas d'échec d'extraction pour du debug ponctuel) n'est ici utilisé
        // que pour une vérification booléenne locale — il n'est jamais
        // affecté à un state React, donc jamais écrit en localStorage, et il
        // sort de portée (garbage collecté) dès la fin de cette itération.
        // Le fichier PDF lui-même (`file`) n'est jamais chargé via
        // URL.createObjectURL — il est lu en mémoire le temps de l'encodage
        // base64 (voir lib/api.js) puis relâché sans laisser de référence.
        const { orders = [], rawExcerpt } = await parseOperationPdf(file);
        if (orders.length === 0) {
          setFeedback({ type: "error", message: `${file.name} : aucun mouvement reconnu dans ce document.` });
          continue;
        }
        let committedCount = 0;
        for (const order of orders) {
          if (order.complete) {
            if (commitOperation(order)) committedCount += 1;
          } else {
            pendingReview.push(order);
          }
        }
        if (committedCount > 0) {
          setFeedback({ type: "success", message: `${file.name} : ${committedCount} mouvement(s) importé(s).` });
        } else if (!rawExcerpt && orders.length === 0) {
          setFeedback({ type: "error", message: `${file.name} : format non reconnu.` });
        }
      } catch (err) {
        setFeedback({ type: "error", message: `${file.name} : ${err.message}` });
      }
    }
    setImporting(false);
    if (pendingReview.length > 0) {
      const [first, ...rest] = pendingReview;
      setReviewQueue(rest);
      setFormPreset({ asset: first.asset || "", type: first.type === "DIVIDENDE" ? "ACHAT" : (first.type || "ACHAT"), ...first });
      setFormOpen(true);
      setFeedback({
        type: "error",
        message: `${pendingReview.length} ligne(s) incomplète(s) à compléter manuellement (formulaire pré-rempli).`,
      });
    }
  };

  // Après validation/annulation d'une révision manuelle, on enchaîne sur la
  // ligne incomplète suivante s'il en reste dans la file.
  const advanceReviewQueue = () => {
    if (reviewQueue.length === 0) return;
    const [next, ...rest] = reviewQueue;
    setReviewQueue(rest);
    setFormPreset({ asset: next.asset || "", type: next.type === "DIVIDENDE" ? "ACHAT" : (next.type || "ACHAT"), ...next });
    setFormOpen(true);
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
    const dividendesTotal = operations
      .filter((op) => op.type === "DIVIDENDE")
      .reduce((s, op) => s + (op.amount ?? op.montantNet ?? 0), 0);
    return { totalFees, tauxEffort, plusValuesRealisees, plusValuesLatentes, dividendesTotal };
  }, [operations, positions]);

  const editOperation = (order) => {
    const original = operations.find((op) => op.id === order.id);
    if (!original) return false;

    let updated;
    if (order.type === "DIVIDENDE") {
      updated = sanitizeOperation({ ...order, montantNet: order.amount, plusValueRealisee: null });
    } else {
      const montantNet =
        order.type === "ACHAT" ? order.quantity * order.price + (order.fees || 0) : order.quantity * order.price - (order.fees || 0);
      // La plus-value réalisée d'une vente dépend du PRU au moment de l'ordre ;
      // on la conserve telle quelle plutôt que de la recalculer à l'aveugle.
      updated = sanitizeOperation({ ...order, montantNet, plusValueRealisee: order.type === "VENTE" ? original.plusValueRealisee : null });
    }

    setBourse((b) => ({ ...b, operations: (b.operations || []).map((op) => (op.id === order.id ? updated : op)) }));
    setFeedback({ type: "success", message: "Opération modifiée. Les positions/PRU actuels n'ont pas été recalculés automatiquement." });
    return true;
  };

  const handleEditClick = (op) => {
    setFormPreset(op);
    setFormOpen(true);
  };

  // Suppression d'une opération — capture l'état précédent et propose un
  // Undo via le Toast Manager (5 secondes) plutôt qu'une confirmation
  // bloquante. Les positions/PRU actuels ne sont pas recalculés (comme avant).
  const deleteOperation = (id) => {
    const removed = operations.find((op) => op.id === id);
    if (!removed) return;
    setBourse((b) => ({ ...b, operations: (b.operations || []).filter((op) => op.id !== id) }));
    showToast({
      message: `Opération supprimée : ${removed.type} ${removed.asset || ""}.`.trim(),
      onUndo: () => setBourse((b) => ({ ...b, operations: [removed, ...(b.operations || [])] })),
    });
  };

  // Purge complète de l'historique — même logique d'Undo, on restaure le
  // tableau entier tel quel si l'utilisateur annule.
  const clearAllOperations = () => {
    if (operations.length === 0) return;
    const previousOperations = operations;
    setBourse((b) => ({ ...b, operations: [] }));
    showToast({
      message: `Historique effacé (${previousOperations.length} opération(s)).`,
      onUndo: () => setBourse((b) => ({ ...b, operations: previousOperations })),
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Simulateur d'ordre — calculs instantanés avant de passer un ordre */}
      <OrderSimulator bourse={bourse} bourseTotal={bourseTotalForSim} />

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
            Glisse-dépose tes documents PDF ici (avis d'opéré, relevé de titres, relevé d'espèces, relevé de coupons/dividendes — Boursorama, Fortuneo, Bourse Direct)
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardLabel icon={Wallet}>Frais totaux</CardLabel>
          <div className="font-data text-xl font-bold text-slate-100 ghost-blur">{eur(kpis.totalFees, 2)}</div>
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
          <div className={`font-data text-xl font-bold ghost-blur ${kpis.plusValuesRealisees >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {eur(kpis.plusValuesRealisees, 2)}
          </div>
        </Card>
        <Card>
          <CardLabel icon={TrendingUp}>Plus-values latentes</CardLabel>
          <div className={`font-data text-xl font-bold ghost-blur ${kpis.plusValuesLatentes >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {eur(kpis.plusValuesLatentes, 2)}
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">Rappel virtuel — onglet Bourse</p>
        </Card>
        <Card>
          <CardLabel icon={Coins}>Dividendes totaux</CardLabel>
          <div className="font-data text-xl font-bold text-cyan-300 ghost-blur">{eur(kpis.dividendesTotal, 2)}</div>
        </Card>
      </div>

      {/* Historique */}
      <Card>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <CardLabel icon={UploadCloud}>Historique des opérations</CardLabel>
          {operations.length > 0 && (
            <button onClick={clearAllOperations} className="btn-flash flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-400 transition-colors">
              <Trash2 size={13} /> Tout effacer
            </button>
          )}
        </div>
        <OperationList operations={operations} onRowClick={(op) => onOpenThesis?.(op.asset)} onDelete={deleteOperation} onEdit={handleEditClick} />
      </Card>

      <OperationForm
        open={formOpen}
        onClose={() => { setFormOpen(false); advanceReviewQueue(); }}
        onSubmit={(order) => {
          const ok = order.id ? editOperation(order) : commitOperation(order);
          if (ok) { setFormOpen(false); advanceReviewQueue(); }
        }}
        positions={positions}
        preset={formPreset}
      />
    </div>
  );
}
