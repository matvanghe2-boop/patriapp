import React, { useRef, useState } from "react";
import { X, Minus, TrendingUp as DiagIcon, Eraser } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

/**
 * Fenêtre flottante sombre plein écran pour analyser le graphique sans
 * superposition de tooltip. Outil de tracé : lignes de tendance (2 clics)
 * et supports/résistances horizontaux (1 clic), stockés en coordonnées %
 * relatives au conteneur pour rester alignés au redimensionnement.
 */
export default function ChartFocusModal({ open, onClose, chartData, currency, formatPrice, formatAxisTick, isIntraday, range }) {
  const [tool, setTool] = useState("trend"); // "trend" | "horizontal"
  const [lines, setLines] = useState([]);
  const [pending, setPending] = useState(null); // premier point d'une ligne de tendance
  const containerRef = useRef(null);

  if (!open) return null;

  const getRelCoords = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
  };

  const handleClick = (e) => {
    const { x, y } = getRelCoords(e);
    if (tool === "horizontal") {
      setLines((l) => [...l, { type: "horizontal", y }]);
      return;
    }
    if (!pending) {
      setPending({ x, y });
    } else {
      setLines((l) => [...l, { type: "trend", x1: pending.x, y1: pending.y, x2: x, y2: y }]);
      setPending(null);
    }
  };

  const clearLines = () => { setLines([]); setPending(null); };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <div
        className="w-full max-w-6xl h-[80vh] rounded-2xl border border-violet-500/30 bg-slate-950 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setTool("trend"); setPending(null); }}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${
                tool === "trend" ? "border-violet-500/50 bg-violet-500/10 text-violet-300" : "border-slate-700 text-slate-400"
              }`}
            >
              <DiagIcon size={13} /> Diagonale
            </button>
            <button
              onClick={() => { setTool("horizontal"); setPending(null); }}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${
                tool === "horizontal" ? "border-violet-500/50 bg-violet-500/10 text-violet-300" : "border-slate-700 text-slate-400"
              }`}
            >
              <Minus size={13} /> Support / résistance
            </button>
            <button
              onClick={clearLines}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-500/40"
            >
              <Eraser size={13} /> Effacer
            </button>
            {tool === "trend" && (
              <span className="text-[11px] text-slate-500">
                {pending ? "Clique le second point…" : "Clique un premier point sur le graphique"}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <div ref={containerRef} onClick={handleClick} className="relative flex-1 cursor-crosshair select-none">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ left: 0, right: 20, top: 20, bottom: 10 }}>
              <defs>
                <linearGradient id="focusFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => formatAxisTick(d, isIntraday, range)} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={70} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => formatPrice(v, currency)} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [formatPrice(v, currency), "Clôture"]}
              />
              <Area type="monotone" dataKey="close" stroke="#a78bfa" strokeWidth={2} fill="url(#focusFill)" isAnimationActive={false} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Overlay de dessin */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {lines.map((l, i) =>
              l.type === "horizontal" ? (
                <line key={i} x1={0} y1={l.y} x2={100} y2={l.y} stroke="#fbbf24" strokeWidth={0.3} strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke" />
              ) : (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#34d399" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
              )
            )}
            {pending && (
              <circle cx={pending.x} cy={pending.y} r={0.6} fill="#34d399" />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
