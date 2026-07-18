import React, { useRef, useState } from "react";
import { X, Minus, TrendingUp as DiagIcon, Eraser, Pencil, Undo2 } from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

/**
 * Outils de tracé simplifiés, tous en glisser-déposer (mousedown → drag →
 * mouseup), sans séquence de clics à retenir :
 * - "trend"      : ligne droite libre (tendance/tangente), suit la souris.
 * - "horizontal" : support/résistance horizontal, posé au clic.
 * - "freehand"   : tracé à main levée, liberté totale.
 */
export default function ChartFocusModal({ open, onClose, chartData, currency, formatPrice, formatAxisTick, isIntraday, range }) {
  const [tool, setTool] = useState("trend"); // "trend" | "horizontal" | "freehand"
  const [lines, setLines] = useState([]);
  const [drawing, setDrawing] = useState(null); // ligne en cours de tracé
  const containerRef = useRef(null);
  const isDragging = useRef(false);

  if (!open) return null;

  const getRelCoords = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
  };

  const handleMouseDown = (e) => {
    const { x, y } = getRelCoords(e);
    if (tool === "horizontal") {
      setLines((l) => [...l, { type: "horizontal", y }]);
      return;
    }
    isDragging.current = true;
    if (tool === "freehand") {
      setDrawing({ type: "freehand", points: [{ x, y }] });
    } else {
      setDrawing({ type: "trend", x1: x, y1: y, x2: x, y2: y });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current || !drawing) return;
    const { x, y } = getRelCoords(e);
    if (drawing.type === "freehand") {
      setDrawing((d) => ({ ...d, points: [...d.points, { x, y }] }));
    } else {
      setDrawing((d) => ({ ...d, x2: x, y2: y }));
    }
  };

  const handleMouseUp = () => {
    if (isDragging.current && drawing) {
      setLines((l) => [...l, drawing]);
    }
    isDragging.current = false;
    setDrawing(null);
  };

  const undoLast = () => setLines((l) => l.slice(0, -1));
  const clearLines = () => { setLines([]); setDrawing(null); };

  const renderLine = (l, key, live = false) => {
    const color = live ? "#fbbf24" : l.type === "horizontal" ? "#fbbf24" : l.type === "freehand" ? "#38bdf8" : "#34d399";
    if (l.type === "horizontal") {
      return <line key={key} x1={0} y1={l.y} x2={100} y2={l.y} stroke={color} strokeWidth={0.3} strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke" />;
    }
    if (l.type === "freehand") {
      const d = l.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      return <path key={key} d={d} stroke={color} strokeWidth={0.35} fill="none" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />;
    }
    return <line key={key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={color} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <div
        className="w-full max-w-6xl h-[80vh] rounded-2xl border border-violet-500/30 bg-slate-950 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setTool("trend")}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${
                tool === "trend" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-400"
              }`}
            >
              <DiagIcon size={13} /> Tendance / tangente
            </button>
            <button
              onClick={() => setTool("horizontal")}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${
                tool === "horizontal" ? "border-amber-500/50 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-400"
              }`}
            >
              <Minus size={13} /> Support / résistance
            </button>
            <button
              onClick={() => setTool("freehand")}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border ${
                tool === "freehand" ? "border-sky-500/50 bg-sky-500/10 text-sky-300" : "border-slate-700 text-slate-400"
              }`}
            >
              <Pencil size={13} /> Dessin libre
            </button>
            <button
              onClick={undoLast}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-amber-300 hover:border-amber-500/40"
            >
              <Undo2 size={13} /> Annuler
            </button>
            <button
              onClick={clearLines}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300 hover:border-rose-500/40"
            >
              <Eraser size={13} /> Effacer tout
            </button>
            <span className="text-[11px] text-slate-500">Clique-glisse pour tracer, relâche pour valider.</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="relative flex-1 cursor-crosshair select-none"
        >
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

          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {lines.map((l, i) => renderLine(l, i))}
            {drawing && renderLine(drawing, "live", true)}
          </svg>
        </div>
      </div>
    </div>
  );
}
