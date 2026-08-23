import { useState, useId } from "react";
import { X, Check, TrendingUp, TrendingDown, Coins, Split } from "lucide-react";
import { todayIso, lireNombre } from "../lib/finance";
import Modal from "./Modal";

/**
 * Fenêtre modale flottante de saisie manuelle d'une opération
 * (achat / vente / dividende). Reste volontairement à l'écart de la liste
 * historique : l'utilisateur ne voit le formulaire que lorsqu'il clique sur
 * "Nouvelle Opération" (ou via la passerelle "Déclarer une opération" depuis
 * une thèse).
 */
export default function OperationForm({ open, onClose, onSubmit, positions = [], preset }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const blank = {
    type: "ACHAT",
    asset: "",
    isNewAsset: false,
    quantity: "",
    price: "",
    fees: "",
    amount: "",
    // Nombre de titres obtenus pour un titre détenu : 10 pour un split 1:10,
    // 0,1 pour un regroupement 10:1.
    ratio: "",
    date: todayIso(),
  };
  const [values, setValues] = useState(blank);

  /**
   * Pré-remplissage à l'ouverture, décidé PENDANT LE RENDU.
   *
   * C'était un effet, avec un `eslint-disable exhaustive-deps` pour masquer
   * que `blank` est recréé à chaque rendu. Conséquence visible : le formulaire
   * s'affichait un instant avec les valeurs de la saisie PRÉCÉDENTE avant que
   * l'effet ne les remplace — d'autant plus voyant que la modale s'ouvre avec
   * une animation.
   *
   * La signature couvre l'ouverture ET le préréglage : rouvrir le formulaire
   * sur une autre thèse doit le re-remplir, même si `open` n'a pas changé
   * entre-temps.
   */
  const signature = `${open}|${preset ? JSON.stringify(preset) : ""}`;
  const [signaturePrecedente, setSignaturePrecedente] = useState(signature);
  if (signature !== signaturePrecedente) {
    setSignaturePrecedente(signature);
    if (open) {
      setValues({
        ...blank,
        type: preset?.type || "ACHAT",
        asset: preset?.asset || "",
        quantity: preset?.quantity != null ? String(preset.quantity) : "",
        price: preset?.price != null ? String(preset.price) : "",
        fees: preset?.fees != null ? String(preset.fees) : "",
        amount: preset?.amount != null ? String(preset.amount) : "",
        ratio: preset?.ratio != null ? String(preset.ratio) : "",
        date: preset?.date || todayIso(),
      });
    }
  }

  if (!open) return null;

  const isDividende = values.type === "DIVIDENDE";
  const isSplit = values.type === "SPLIT";

  const submit = (e) => {
    e.preventDefault();
    if (!values.asset.trim()) return;
    if (isSplit) {
      const ratio = lireNombre(values.ratio);
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      onSubmit({
        ...(preset?.id ? { id: preset.id } : {}),
        type: "SPLIT",
        asset: values.asset.trim(),
        ratio,
        date: values.date,
        broker: preset?.broker || "Saisie manuelle",
        transactionId: preset?.transactionId ?? null,
      });
      return;
    }
    if (isDividende) {
      if (!values.amount) return;
      onSubmit({
        ...(preset?.id ? { id: preset.id } : {}),
        type: "DIVIDENDE",
        asset: values.asset.trim(),
        amount: lireNombre(values.amount),
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
      quantity: lireNombre(values.quantity),
      price: lireNombre(values.price),
      fees: values.fees === "" ? 0 : lireNombre(values.fees),
      date: values.date,
      broker: preset?.broker || "Saisie manuelle",
      transactionId: preset?.transactionId ?? null,
    });
  };

  return (
    // Fermeture au clic sur le fond volontairement désactivée : un clic à côté
    // pendant la saisie d'un ordre faisait perdre le formulaire entier sans
    // confirmation. Échap et la croix restent disponibles.
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="titre-operation"
      closeOnOverlayClick={false}
      overlayClassName="bg-slate-950/70 backdrop-blur-sm"
      panelClassName="w-full max-w-lg rounded-2xl border border-cyan-500/30 bg-slate-900 shadow-2xl"
    >
      <form onSubmit={submit} className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 id="titre-operation" className="font-display text-lg text-slate-50">
            {preset?.id ? "Modifier l'opération" : "Nouvelle opération"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="btn-flash text-slate-500 hover:text-slate-200 p-1">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Toggle ACHAT / VENTE / DIVIDENDE / SPLIT */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
          <button
            type="button"
            onClick={() => setValues((v) => ({ ...v, type: "SPLIT" }))}
            className={`btn-flash flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold transition-colors ${
              values.type === "SPLIT"
                ? "bg-violet-500/15 border-violet-500/50 text-violet-300"
                : "border-slate-700 text-slate-500 hover:text-slate-300"
            }`}
          >
            <Split size={15} /> Split
          </button>
        </div>

        {/* Actif */}
        <div>
          <label htmlFor={`${idsChamps}-actif`} className="text-[11px] text-slate-500">Actif</label>
          <input id={`${idsChamps}-actif`}
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

        {isSplit ? (
          <div>
            <label htmlFor={`${idsChamps}-nombre-de-titres`} className="text-[11px] text-slate-500">
              Nombre de titres obtenus pour 1 titre détenu
            </label>
            <input id={`${idsChamps}-nombre-de-titres`}
              required
              type="number"
              step="0.0001"
              min="0"
              placeholder="10 pour un split 1:10, 0,1 pour un regroupement 10:1"
              value={values.ratio}
              onChange={(e) => setValues((v) => ({ ...v, ratio: e.target.value }))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-violet-400/60"
            />
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              Ta quantité est multipliée par ce ratio et ton prix de revient divisé par lui : la
              valeur totale de la ligne ne change pas d&apos;un centime, et aucun argent ne bouge.
              Sans cette écriture, la position resterait comptée à l&apos;ancienne quantité face à
              un cours divisé — la ligne afficherait une perte qui n&apos;existe pas.
            </p>
          </div>
        ) : isDividende ? (
          <div>
            <label htmlFor={`${idsChamps}-montant-du-dividende`} className="text-[11px] text-slate-500">Montant du dividende reçu (€)</label>
            <input id={`${idsChamps}-montant-du-dividende`}
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
            <label htmlFor={`${idsChamps}-quantite`} className="text-[11px] text-slate-500">Quantité</label>
            <input id={`${idsChamps}-quantite`}
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
            <label htmlFor={`${idsChamps}-prix-unitaire`} className="text-[11px] text-slate-500">Prix unitaire (€)</label>
            <input id={`${idsChamps}-prix-unitaire`}
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
            <label htmlFor={`${idsChamps}-frais`} className="text-[11px] text-slate-500">Frais (€)</label>
            <input id={`${idsChamps}-frais`}
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
          <label htmlFor={`${idsChamps}-date`} className="text-[11px] text-slate-500">Date</label>
          <input id={`${idsChamps}-date`}
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
    </Modal>
  );
}
