import React, { useState } from "react";
import { Plus, Trash2, X, Lock } from "lucide-react";
import { eur } from "../lib/finance";

const NAV_THEMES = {

  emerald: { active: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30", bar: "bg-emerald-400" },
  indigo: { active: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30", bar: "bg-indigo-400" },
  violet: { active: "bg-violet-500/15 text-violet-300 border border-violet-500/30", bar: "bg-violet-400" },
  amber: { active: "bg-amber-500/15 text-amber-300 border border-amber-500/30", bar: "bg-amber-400" },
  rose: { active: "bg-rose-500/15 text-rose-300 border border-rose-500/30", bar: "bg-rose-400" },

  emerald: { active: "bg-slate-800 text-emerald-300", bar: "bg-emerald-400" },
  indigo: { active: "bg-slate-800 text-indigo-300", bar: "bg-indigo-400" },
  violet: { active: "bg-slate-800 text-violet-300", bar: "bg-violet-400" },
  amber: { active: "bg-slate-800 text-amber-300", bar: "bg-amber-400" },
  rose: { active: "bg-slate-800 text-rose-300", bar: "bg-rose-400" },
};

export function NavButton({ active, onClick, icon: Icon, label, disabled, theme = "amber" }) {
  const t = NAV_THEMES[theme] || NAV_THEMES.amber;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40
        ${disabled ? "text-slate-600 cursor-not-allowed" : active ? t.active : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"}`}
    >
      {active && <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full ${t.bar} hidden md:block`} />}
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

export function Card({ children, className = "", accent = "" }) {

  return <div className={`rounded-2xl border bg-slate-900 p-5 transition-colors duration-300 ${accent || "border-slate-800"} ${className}`}>{children}</div>;
}

/**
 * Préréglages de thème de carte par domaine — fond teinté + bordure marquée,
 * bien plus visibles qu'une simple bordure à faible opacité.
 */
export const CARD_THEMES = {
  emerald: "border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 hover:border-emerald-400/60",
  indigo: "border-indigo-500/40 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 hover:border-indigo-400/60",
  violet: "border-violet-500/40 bg-gradient-to-br from-violet-950/40 via-slate-900 to-slate-900 hover:border-violet-400/60",
  amber: "border-amber-500/40 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 hover:border-amber-400/60",
  rose: "border-rose-500/40 bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-900 hover:border-rose-400/60",
};

/**

  return <div className={`rounded-2xl border border-slate-800 bg-slate-900 p-5 transition-colors duration-300 ${accent} ${className}`}>{children}</div>;
}

/**

 * Lueur de fond ambiante thématique — à placer en position absolute/fixed
 * dans le conteneur racine de chaque page pour donner une identité visuelle
 * propre à chaque onglet sans dupliquer le layout.
 */
export function PageGlow({ color = "emerald" }) {
  const COLORS = {

    emerald: { a: "bg-emerald-500/25", b: "bg-cyan-500/15" },
    indigo: { a: "bg-indigo-500/25", b: "bg-blue-500/15" },
    violet: { a: "bg-violet-500/25", b: "bg-fuchsia-500/15" },
    amber: { a: "bg-amber-500/25", b: "bg-orange-500/15" },
    rose: { a: "bg-rose-500/25", b: "bg-orange-600/15" },
  };
  const c = COLORS[color] || COLORS.emerald;
  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed -top-24 left-1/4 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full ${c.a} blur-[110px] -z-10`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed top-1/3 -right-24 w-[28rem] h-[28rem] rounded-full ${c.b} blur-[100px] -z-10`}
      />
    </>

    emerald: "from-emerald-500/10 to-cyan-500/5",
    indigo: "bg-indigo-500/10",
    violet: "bg-violet-500/10",
    amber: "bg-amber-500/10",
    rose: "bg-rose-500/10",
  };
  if (color === "emerald") {
    return (
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] rounded-full bg-gradient-to-br ${COLORS.emerald} blur-[120px]`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute -top-10 -right-10 w-96 h-96 rounded-full ${COLORS[color] || COLORS.emerald} blur-[120px]`}
    />

  );
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

const GHOST_THEMES = {

  amber: "text-amber-300 hover:text-amber-100 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/40 hover:border-amber-400/70 focus-visible:ring-amber-400/40",
  emerald: "text-emerald-300 hover:text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/40 hover:border-emerald-400/70 focus-visible:ring-emerald-400/40",
  indigo: "text-indigo-300 hover:text-indigo-100 bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/40 hover:border-indigo-400/70 focus-visible:ring-indigo-400/40",
  violet: "text-violet-300 hover:text-violet-100 bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/40 hover:border-violet-400/70 focus-visible:ring-violet-400/40",
  rose: "text-rose-300 hover:text-rose-100 bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/40 hover:border-rose-400/70 focus-visible:ring-rose-400/40",

  amber: "text-amber-300 hover:text-amber-200 border-slate-700 hover:border-amber-400/50 focus-visible:ring-amber-400/40",
  emerald: "text-emerald-300 hover:text-emerald-200 border-slate-700 hover:border-emerald-400/50 focus-visible:ring-emerald-400/40",
  indigo: "text-indigo-300 hover:text-indigo-200 border-slate-700 hover:border-indigo-400/50 focus-visible:ring-indigo-400/40",
  violet: "text-violet-300 hover:text-violet-200 border-slate-700 hover:border-violet-400/50 focus-visible:ring-violet-400/40",
  rose: "text-rose-300 hover:text-rose-200 border-slate-700 hover:border-rose-400/50 focus-visible:ring-rose-400/40",

};

export function GhostButton({ onClick, children, icon: Icon = Plus, disabled, theme = "amber" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed border rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 ${GHOST_THEMES[theme] || GHOST_THEMES.amber}`}
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
