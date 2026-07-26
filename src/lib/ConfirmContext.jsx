import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

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
  const panelRef = useRef(null);
  const confirmRef = useRef(null);

  // Le focus part sur le bouton de confirmation, Échap annule, et Tab reste
  // enfermé dans la boîte : sans ça, un lecteur d'écran continue de lire la
  // page en arrière-plan comme si de rien n'était.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    confirmRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll("button, [href], input, select, textarea");
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const tone = danger
    ? "bg-rose-400 hover:bg-rose-300 text-slate-950"
    : "bg-amber-400 hover:bg-amber-300 text-slate-950";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-4 animate-[fadeIn_0.15s_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-5"
      >
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
            className="text-sm text-slate-400 hover:text-slate-100 rounded-lg px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onClose(true)}
            className={`text-sm font-semibold rounded-lg px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:ring-amber-400 ${tone}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm doit être utilisé à l'intérieur de <ConfirmProvider>");
  return ctx.confirm;
}
