import React, { useEffect } from "react";
import { X, Maximize2 } from "lucide-react";

export function FocusToggleButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      title="Mode Focus (touche F)"
      className="btn-flash flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-violet-300 border border-slate-700 hover:border-violet-500/50 rounded-lg px-2.5 py-1.5"
    >
      <Maximize2 size={13} /> Focus
    </button>
  );
}

/** Portail plein écran : assombrit tout, ne laisse que `children` visible. */
export function FocusOverlay({ active, onClose, children }) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active, onClose]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/97 backdrop-blur-sm flex flex-col p-4 sm:p-8 animate-[fadeIn_0.15s_ease-out]">
      <button
        onClick={onClose}
        className="btn-flash absolute top-4 right-4 z-10 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5"
      >
        <X size={14} /> Quitter (Échap)
      </button>
      <div className="flex-1 min-h-0 max-w-6xl mx-auto w-full">{children}</div>
    </div>
  );
}

/** Raccourci clavier global F — à monter une fois par écran concerné. */
export function useFocusHotkey(onToggle) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== "f") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      onToggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onToggle]);
}