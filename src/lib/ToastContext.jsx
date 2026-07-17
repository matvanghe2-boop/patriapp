import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { Check, X, AlertTriangle } from "lucide-react";

const ToastContext = createContext(null);
const DURATION_MS = 5000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const showToast = useCallback(({ message, type = "success", onUndo }) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((t) => [...t, { id, message, type, onUndo }]);
    timers.current[id] = setTimeout(() => dismiss(id), DURATION_MS);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const Icon = toast.type === "error" ? AlertTriangle : Check;
  const tone = toast.type === "error" ? "border-rose-500/40 text-rose-300" : "border-emerald-500/40 text-emerald-300";
  return (
    <div className={`btn-press flex items-center gap-3 rounded-xl border bg-slate-900 shadow-2xl px-4 py-2.5 text-sm animate-[fadeIn_0.2s_ease-out] ${tone}`}>
      <Icon size={15} className="shrink-0" />
      <span className="text-slate-200">{toast.message}</span>
      {toast.onUndo && (
        <button
          onClick={() => { toast.onUndo(); onDismiss(); }}
          className="btn-flash text-xs font-semibold text-amber-300 hover:text-amber-200 border border-amber-400/40 rounded-lg px-2.5 py-1 ml-1"
        >
          Annuler
        </button>
      )}
      <button onClick={onDismiss} className="btn-flash text-slate-600 hover:text-slate-300 ml-1">
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé à l'intérieur de <ToastProvider>");
  return ctx;
}