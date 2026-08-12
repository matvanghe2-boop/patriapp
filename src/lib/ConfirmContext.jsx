import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "../components/Modal";

// Remplace `window.confirm()`. Au-delà du look — une boîte système grise au
// milieu d'une interface sombre —, `confirm()` bloque le thread principal,
// n'est pas stylable, n'est pas testable, et est purement et simplement
// ignoré par certains navigateurs dans une iframe ou après navigation.

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolver = useRef(null);

  /**
   * confirm({ title, message, confirmLabel, cancelLabel, danger })
   * -> Promise<boolean>
   */
  const confirm = useCallback((options) => {
    setRequest(typeof options === "string" ? { message: options } : options);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((result) => {
    setRequest(null);
    resolver.current?.(result);
    resolver.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {request && <ConfirmDialog request={request} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ request, onClose }) {
  const {
    title = "Confirmation",
    message,
    confirmLabel = "Confirmer",
    cancelLabel = "Annuler",
    danger = false,
  } = request;
  const confirmRef = useRef(null);

  // <Modal> place le focus sur le premier élément focalisable — ici « Annuler ».
  // Sur une confirmation, c'est le bouton d'ACTION qu'on veut sous la main, et
  // d'autant plus quand elle est destructrice : l'utilisateur a déjà décidé en
  // arrivant ici.
  useEffect(() => {
    const t = setTimeout(() => confirmRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const tone = danger
    ? "bg-rose-400 hover:bg-rose-300 text-slate-950"
    : "bg-amber-400 hover:bg-amber-300 text-slate-950";

  return (
    <Modal
      open
      onClose={() => onClose(false)}
      role="alertdialog"
      labelledBy="confirm-title"
      overlayClassName="bg-slate-950/80 backdrop-blur-sm"
      panelClassName="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 rounded-lg p-2 ${danger ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>
            <AlertTriangle size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-slate-100">
              {title}
            </h2>
            <p id="confirm-message" className="text-sm text-slate-400 mt-1 leading-relaxed">
              {message}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => onClose(false)}
            className="btn-flash text-sm text-slate-400 hover:text-slate-100 rounded-lg px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onClose(true)}
            className={`btn-solid text-sm font-semibold rounded-lg px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:ring-amber-400 ${tone}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm doit être utilisé à l'intérieur de <ConfirmProvider>");
  return ctx.confirm;
}
