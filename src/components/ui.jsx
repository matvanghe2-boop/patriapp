import React, { useState } from "react";
import { Plus, Trash2, X, Lock } from "lucide-react";
import { eur } from "../lib/finance";

export function NavButton({ active, onClick, icon: Icon, label, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40
        ${disabled ? "text-slate-600 cursor-not-allowed" : active ? "bg-slate-800 text-amber-300" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"}`}
    >
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-amber-400 hidden md:block" />}
      <Icon size={17} strokeWidth={2} />
      <span className="font-medium">{label}</span>
      {disabled && <Lock size={12} className="ml-auto opacity-60" />}
    </button>
  );
}

export function EmptyState({ children }) {
  return (
    <p className="text-sm text-slate-600 py-6 text-center border border-dashed border-slate-800 rounded-xl">
      {children}
    </p>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`rounded-2xl border border-slate-800 bg-slate-900 p-5 ${className}`}>{children}</div>;
}

export function CardLabel({ children, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 mb-2">
      {Icon && <Icon size={13} />}
      <span>{children}</span>
    </div>
  );
}

export function ProgressBar({ value, accent = "bg-teal-400" }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
      <div className={`h-full rounded-full ${accent}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function GhostButton({ onClick, children, icon: Icon = Plus, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
    >
      <Icon size={14} />
      {children}
    </button>
  );
}

export function IconTrash({ onClick }) {
  return (
    <button onClick={onClick} className="text-slate-600 hover:text-rose-400 transition-colors p-1">
      <Trash2 size={14} />
    </button>
  );
}

export function SliderField({ label, value, onChange, min, max, step, unit = "", format }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-slate-400">{label}</label>
        <span className="font-data tabular-nums text-sm text-amber-300">
          {format ? format(value) : value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 font-data tabular-nums">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name} :</span>
          <span className="text-slate-100">{eur(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Formulaire d'ajout générique en ligne — utilisé pour saisir des livrets,
 * des passifs, des relevés d'historique, etc. Tout reste local, aucune
 * source externe n'est interrogée ici.
 */
export function AddPanel({ open, onClose, fields, onSubmit }) {
  const blank = () => Object.fromEntries(fields.map((f) => [f.key, f.default ?? ""]));
  const [values, setValues] = useState(blank());

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    const parsed = {};
    fields.forEach((f) => {
      const raw = values[f.key];
      parsed[f.key] = f.type === "number" ? parseFloat(raw === "" ? f.default ?? 0 : raw) : raw;
    });
    onSubmit(parsed);
    setValues(blank());
    onClose();
  };

  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-amber-400/20 bg-slate-950">
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1 col-span-1">
          <label className="text-[11px] text-slate-500">{f.label}</label>
          {f.type === "select" ? (
            <select
              required={f.required}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400/60"
            >
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              required={f.required}
              type={f.type || "text"}
              step={f.step}
              placeholder={f.placeholder}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-400/60 font-data tabular-nums"
            />
          )}
        </div>
      ))}
      <div className="col-span-2 sm:col-span-4 flex gap-2 justify-end mt-1">
        <button type="button" onClick={onClose} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
          <X size={13} /> Annuler
        </button>
        <button type="submit" className="text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-4 py-1.5 transition-colors">
          Enregistrer
        </button>
      </div>
    </form>
  );
}
