import { useEffect, useRef, useState } from "react";
import { X, Minus, TrendingUp as DiagIcon, Eraser, Pencil, Undo2, Move } from "lucide-react";
import ProChart from "./ProChart";

/**
 * Plein écran d'analyse : le même graphique professionnel que dans l'onglet
 * Marché, avec par-dessus des outils de tracé en glisser-déposer.
 *
 * Les tracés sont mémorisés en coordonnées de données (index de bougie +
 * prix), pas en pixels : ils restent donc collés aux cours quand on zoome ou
 * qu'on se déplace dans le temps, comme sur TradingView. Une droite posée sur
 * un support le reste, quelle que soit l'échelle.
 *
 * - "nav"        : navigation seule (zoom/déplacement), aucun tracé.
 * - "trend"      : droite libre (tendance / tangente).
 * - "horizontal" : support ou résistance, posé au clic à un prix donné.
 * - "freehand"   : tracé à main levée.
 */
export default function ChartFocusModal({
  open, onClose, chartData, title, currency, formatPrice, formatAxisTick, formatFullDateTime,
  isIntraday, range, priceLines, chartStyle, onChartStyleChange,
}) {
  const [tool, setTool] = useState("nav");
  const [lines, setLines] = useState([]);
  const [drawing, setDrawing] = useState(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const drawingMode = tool !== "nav";

  const handleDown = (coords) => {
    if (!drawingMode || !coords) return;
    if (tool === "horizontal") {
      setLines((l) => [...l, { type: "horizontal", price: coords.price }]);
      return;
    }
    isDragging.current = true;
    if (tool === "freehand") setDrawing({ type: "freehand", points: [coords] });
    else setDrawing({ type: "trend", from: coords, to: coords });
  };

  const handleMove = (coords) => {
    if (!isDragging.current || !drawing || !coords) return;
    if (drawing.type === "freehand") setDrawing((d) => ({ ...d, points: [...d.points, coords] }));
    else setDrawing((d) => ({ ...d, to: coords }));
  };

  const handleUp = () => {
    if (isDragging.current && drawing) setLines((l) => [...l, drawing]);
    isDragging.current = false;
    setDrawing(null);
  };

  const undoLast = () => setLines((l) => l.slice(0, -1));
  const clearLines = () => { setLines([]); setDrawing(null); };

  const renderLine = (l, key, api, live = false) => {
    const color = live ? "#fbbf24" : l.type === "horizontal" ? "#fbbf24" : l.type === "freehand" ? "#38bdf8" : "#34d399";
    if (l.type === "horizontal") {
      const { y } = api.toPx({ index: 0, price: l.price });
      if (!Number.isFinite(y)) return null;
      return (
        <g key={key}>
          <line x1={api.plot.left} y1={y} x2={api.plot.right} y2={y} stroke={color} strokeWidth={1.2} strokeDasharray="5 3" />
          <text x={api.plot.left + 6} y={y - 5} fill={color} fontSize={10} className="font-data">
            {formatPrice ? formatPrice(l.price, currency) : l.price.toFixed(2)}
          </text>
        </g>
      );
    }
    if (l.type === "freehand") {
      const d = l.points
        .map((p, i) => {
          const { x, y } = api.toPx(p);
          return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");
      return <path key={key} d={d} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    }
    const a = api.toPx(l.from);
    const b = api.toPx(l.to);
    return <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={1.4} />;
  };

  const toolButton = (key, Icon, label, activeClass) => (
    <button
      onClick={() => setTool(key)}
      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
        tool === key ? activeClass : "border-slate-700 text-slate-400 hover:text-slate-200"
      }`}
    >
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <div
        className="w-full max-w-6xl h-[86vh] rounded-2xl border border-violet-500/30 bg-slate-950 flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {title && <span className="font-display text-sm text-slate-200 mr-1">{title}</span>}
            {toolButton("nav", Move, "Navigation", "border-violet-500/50 bg-violet-500/10 text-violet-300")}
            {toolButton("trend", DiagIcon, "Tendance / tangente", "border-emerald-500/50 bg-emerald-500/10 text-emerald-300")}
            {toolButton("horizontal", Minus, "Support / résistance", "border-amber-500/50 bg-amber-500/10 text-amber-300")}
            {toolButton("freehand", Pencil, "Dessin libre", "border-sky-500/50 bg-sky-500/10 text-sky-300")}
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
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className={`flex-1 min-h-0 px-4 py-3 ${drawingMode ? "cursor-crosshair" : ""}`}>
          <ProChart
            data={chartData}
            currency={currency}
            isIntraday={isIntraday}
            range={range}
            height={Math.max(280, Math.round(window.innerHeight * 0.86) - 150)}
            formatPrice={formatPrice}
            formatX={formatAxisTick}
            formatXFull={formatFullDateTime}
            chartStyle={chartStyle}
            onChartStyleChange={onChartStyleChange}
            priceLines={priceLines}
            panEnabled={!drawingMode}
            onPlotMouseDown={handleDown}
            onPlotMouseMove={handleMove}
            onPlotMouseUp={handleUp}
            renderOverlay={(api) => (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" width={api.size.width} height={api.size.height}>
                {lines.map((l, i) => renderLine(l, i, api))}
                {drawing && renderLine(drawing, "live", api, true)}
              </svg>
            )}
          />
          <p className="text-[11px] text-slate-500 mt-2">
            {drawingMode
              ? "Clique-glisse sur le graphique pour tracer, relâche pour valider. Les tracés restent accrochés aux cours quand tu zoomes."
              : "Molette pour zoomer, clic-glisser pour te déplacer, double-clic pour revenir à la vue complète. Choisis un outil pour dessiner."}
          </p>
        </div>
      </div>
    </div>
  );
}
