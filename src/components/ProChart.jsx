import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickChart, LineChart as LineIcon, AreaChart as AreaIcon,
  ZoomIn, ZoomOut, RotateCcw, BarChart3, Activity,
} from "lucide-react";

/**
 * Graphique de cours "façon TradingView", dessiné en SVG à la main plutôt
 * qu'avec Recharts : c'est le seul moyen d'obtenir un zoom/pan réellement
 * fluide (la molette et le glisser recalculent une fenêtre de visualisation,
 * pas tout un arbre de composants) et un rendu en bougies japonaises, que
 * Recharts ne sait pas tracer nativement.
 *
 * Toute la série est dessinée en quelques `<path>` agrégés (une passe pour les
 * mèches haussières, une pour les corps haussiers, idem en baissier) : même
 * avec plusieurs milliers de bougies, le navigateur n'a qu'une poignée de
 * nœuds SVG à repeindre à chaque frame.
 */

const C_UP = "#22c55e";
const C_DOWN = "#f43f5e";
const C_LINE = "#a78bfa";
const C_GRID = "#1b2434";
const C_AXIS = "#64748b";
const C_CROSS = "#94a3b8";

const MA_CONFIG = [
  { period: 20, color: "#facc15", label: "MM20" },
  { period: 50, color: "#38bdf8", label: "MM50" },
  { period: 200, color: "#f472b6", label: "MM200" },
];

const CHART_STYLES = [
  { key: "candle", label: "Bougies", icon: CandlestickChart },
  { key: "line", label: "Ligne", icon: LineIcon },
  { key: "area", label: "Aire", icon: AreaIcon },
];

const MIN_BARS = 8;
const PAD = { left: 6, right: 66, top: 12, bottom: 24 };
const VOL_SHARE = 0.2; // part de la hauteur réservée au volume quand il est affiché

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Fenêtre de visualisation valide : jamais moins de MIN_BARS, jamais hors des données. */
function clampView(start, end, n) {
  if (n <= 0) return { start: 0, end: 0 };
  let span = clamp(end - start, Math.min(MIN_BARS, n), n);
  if (span >= n) return { start: 0, end: n };
  let s = start;
  if (s < 0) s = 0;
  if (s + span > n) s = n - span;
  return { start: s, end: s + span };
}

/** Graduations "rondes" (1, 2, 5 × 10ⁿ) dans un intervalle. */
function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(v);
  return out;
}

/** Arrondi "lisible" d'un prix, utilisé pour les graduations en échelle log. */
function roundNice(v) {
  if (!Number.isFinite(v) || v === 0) return v;
  const mag = 10 ** Math.floor(Math.log10(Math.abs(v)));
  const step = mag / 10;
  return Math.round(v / step) * step;
}

function movingAverage(bars, period) {
  const out = new Array(bars.length).fill(null);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function compactNum(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)} T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)} Md`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)} k`;
  return n.toFixed(0);
}

function defaultFormatPrice(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const digits = abs === 0 ? 2 : abs < 1 ? 4 : abs < 20 ? 3 : 2;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function defaultFormatX(iso, intraday, range) {
  if (!iso) return "";
  const d = new Date(iso);
  if (intraday && range === "1d") return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (intraday) return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  if (["5y", "10y", "max"].includes(range)) return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}

function ToolButton({ active, onClick, title, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors disabled:opacity-40 ${
        active
          ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
          : "border-slate-800 text-slate-500 hover:text-slate-200 hover:border-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

export default function ProChart({
  data = [],
  currency,
  isIntraday = false,
  range = "1y",
  height = 420,
  formatPrice,
  formatX,
  formatXFull,
  chartStyle,
  onChartStyleChange,
  priceLines = [],
  showToolbar = true,
  panEnabled = true,
  onHoverBar,
  renderOverlay,
  onPlotMouseDown,
  onPlotMouseMove,
  onPlotMouseUp,
  className = "",
}) {
  const fmtPrice = useCallback(
    (v) => (formatPrice ? formatPrice(v, currency) : defaultFormatPrice(v)),
    [formatPrice, currency]
  );
  const fmtX = useCallback(
    (d) => (formatX ? formatX(d, isIntraday, range) : defaultFormatX(d, isIntraday, range)),
    [formatX, isIntraday, range]
  );
  const fmtXFull = useCallback(
    (d) => (formatXFull ? formatXFull(d, isIntraday) : new Date(d).toLocaleString("fr-FR")),
    [formatXFull, isIntraday]
  );

  const [innerStyle, setInnerStyle] = useState("candle");
  const style = chartStyle ?? innerStyle;
  const setStyle = onChartStyleChange ?? setInnerStyle;

  const [showVolume, setShowVolume] = useState(true);
  const [logScale, setLogScale] = useState(false);
  const [activeMAs, setActiveMAs] = useState({ 20: true, 50: false, 200: false });

  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [width, setWidth] = useState(0);

  // ─── Normalisation des barres ────────────────────────────────────────────
  // Yahoo peut renvoyer un OHLC partiel (surtout en intraday) : on retombe
  // proprement sur la clôture plutôt que de trouer le tracé.
  const bars = useMemo(() => {
    const out = [];
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d?.close == null || !Number.isFinite(d.close)) continue;
      const prevClose = out.length > 0 ? out[out.length - 1].close : null;
      const open = Number.isFinite(d.open) ? d.open : prevClose ?? d.close;
      const high = Number.isFinite(d.high) ? d.high : Math.max(open, d.close);
      const low = Number.isFinite(d.low) ? d.low : Math.min(open, d.close);
      out.push({
        date: d.date,
        open, high, low,
        close: d.close,
        volume: Number.isFinite(d.volume) ? d.volume : null,
        up: d.close >= open,
        volUp: prevClose == null ? d.close >= open : d.close >= prevClose,
      });
    }
    return out;
  }, [data]);

  const n = bars.length;
  const mas = useMemo(
    () => MA_CONFIG.map((m) => ({ ...m, values: n >= m.period ? movingAverage(bars, m.period) : null })),
    [bars, n]
  );

  const [view, setView] = useState({ start: 0, end: 0 });
  const [crosshair, setCrosshair] = useState(null); // { x, y, i }

  // Nouvelle série (changement de valeur ou de période) → on repart sur la vue complète.
  useEffect(() => {
    setView({ start: 0, end: bars.length });
    setCrosshair(null);
  }, [bars]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Géométrie ───────────────────────────────────────────────────────────
  const geom = useMemo(() => {
    const w = Math.max(0, width);
    const plotLeft = PAD.left;
    const plotRight = Math.max(plotLeft + 1, w - PAD.right);
    const plotW = plotRight - plotLeft;
    const plotTop = PAD.top;
    const plotBottom = Math.max(plotTop + 1, height - PAD.bottom);
    const plotH = plotBottom - plotTop;
    const volH = showVolume ? plotH * VOL_SHARE : 0;
    const priceTop = plotTop;
    const priceH = Math.max(1, plotH - volH - (showVolume ? 10 : 0));
    const volTop = priceTop + priceH + 10;
    const span = Math.max(1e-6, view.end - view.start);
    const barW = plotW / span;
    const xOf = (i) => plotLeft + (i - view.start + 0.5) * barW;
    const iOf = (x) => (x - plotLeft) / barW + view.start - 0.5;
    return { w, plotLeft, plotRight, plotW, plotTop, plotBottom, plotH, priceTop, priceH, volTop, volH, barW, xOf, iOf };
  }, [width, height, showVolume, view]);

  const i0 = Math.max(0, Math.floor(view.start));
  const i1 = Math.min(n - 1, Math.ceil(view.end));

  // ─── Domaine de prix visible ─────────────────────────────────────────────
  const scale = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    let volMax = 0;
    const useOHLC = style === "candle";
    for (let i = i0; i <= i1; i++) {
      const b = bars[i];
      if (!b) continue;
      lo = Math.min(lo, useOHLC ? b.low : b.close);
      hi = Math.max(hi, useOHLC ? b.high : b.close);
      if (b.volume) volMax = Math.max(volMax, b.volume);
    }
    for (const m of mas) {
      if (!m.values || !activeMAs[m.period]) continue;
      for (let i = i0; i <= i1; i++) {
        const v = m.values[i];
        if (v == null) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    const canLog = logScale && lo > 0;
    const t = (p) => (canLog ? Math.log(Math.max(p, 1e-9)) : p);
    const inv = (v) => (canLog ? Math.exp(v) : v);
    let tLo = t(lo);
    let tHi = t(hi);
    const pad = tHi === tLo ? Math.abs(tHi) * 0.02 + 1e-6 : (tHi - tLo) * 0.08;
    tLo -= pad;
    tHi += pad;
    const yOf = (p) => geom.priceTop + ((tHi - t(p)) / (tHi - tLo)) * geom.priceH;
    const priceOf = (y) => inv(tHi - ((y - geom.priceTop) / geom.priceH) * (tHi - tLo));
    const volOf = (v) => geom.volTop + geom.volH - (volMax > 0 ? (v / volMax) * geom.volH : 0);
    return { lo, hi, tLo, tHi, canLog, inv, yOf, priceOf, volOf, volMax };
  }, [bars, i0, i1, style, mas, activeMAs, logScale, geom]);

  // ─── Interactions (molette, glisser, tactile) ────────────────────────────
  // Les handlers sont natifs (et non React) pour pouvoir `preventDefault` sur
  // la molette et le tactile, que React enregistre en mode passif.
  const stateRef = useRef({});
  useEffect(() => {
    stateRef.current = { view, n, geom, panEnabled, bars, scale, onPlotMouseDown, onPlotMouseMove, onPlotMouseUp, onHoverBar };
  });

  const dragRef = useRef(null);
  const pinchRef = useRef(null);

  const localPoint = (clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const toDataCoords = useCallback((pt) => {
    const s = stateRef.current;
    if (!pt || !s.scale) return null;
    return { index: s.geom.iOf(pt.x), price: s.scale.priceOf(pt.y), x: pt.x, y: pt.y };
  }, []);

  const zoomBy = useCallback((factor, anchorIndex) => {
    const s = stateRef.current;
    if (!s.n) return;
    const cur = s.view;
    const span = clamp((cur.end - cur.start) * factor, Math.min(MIN_BARS, s.n), s.n);
    const a = clamp(anchorIndex ?? (cur.start + cur.end) / 2, 0, s.n);
    const ratio = (a - cur.start) / Math.max(1e-6, cur.end - cur.start);
    const start = a - ratio * span;
    setView(clampView(start, start + span, s.n));
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;

    const onWheel = (e) => {
      const s = stateRef.current;
      if (!s.n) return;
      e.preventDefault();
      const pt = localPoint(e.clientX, e.clientY);
      const anchor = pt ? s.geom.iOf(pt.x) : null;
      zoomBy(Math.exp(e.deltaY * 0.0016), anchor);
    };

    // Le glisser continue même quand le curseur sort du graphique : les
    // écouteurs vivent sur la fenêtre le temps du geste.
    const endGesture = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onWindowMove);
      window.removeEventListener("mouseup", onWindowUp);
    };
    const onWindowMove = (e) => {
      const s = stateRef.current;
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.clientX;
      const barW = s.geom.plotW / Math.max(1e-6, drag.view.end - drag.view.start);
      const delta = -dx / barW;
      setView(clampView(drag.view.start + delta, drag.view.end + delta, s.n));
    };
    const onWindowUp = (e) => {
      const s = stateRef.current;
      s.onPlotMouseUp?.(toDataCoords(localPoint(e.clientX, e.clientY)), e);
      endGesture();
    };

    const onMouseDown = (e) => {
      const s = stateRef.current;
      if (e.button !== 0) return;
      const pt = localPoint(e.clientX, e.clientY);
      s.onPlotMouseDown?.(toDataCoords(pt), e);
      if (!s.n) return;
      if (s.panEnabled) dragRef.current = { clientX: e.clientX, view: s.view };
      window.addEventListener("mousemove", onWindowMove);
      window.addEventListener("mouseup", onWindowUp);
    };

    const onMouseMove = (e) => {
      const s = stateRef.current;
      const pt = localPoint(e.clientX, e.clientY);
      s.onPlotMouseMove?.(toDataCoords(pt), e);
      if (!pt || !s.n || !s.scale) return;
      const i = clamp(Math.round(s.geom.iOf(pt.x)), 0, s.n - 1);
      setCrosshair({ x: pt.x, y: pt.y, i });
      s.onHoverBar?.(s.bars[i] ?? null);
    };

    const onMouseLeave = () => {
      setCrosshair(null);
      stateRef.current.onHoverBar?.(null);
    };

    const onDblClick = () => {
      const s = stateRef.current;
      setView({ start: 0, end: s.n });
    };

    const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e) => {
      const s = stateRef.current;
      if (!s.n) return;
      if (e.touches.length === 2) {
        pinchRef.current = { dist: touchDist(e.touches), view: s.view };
        dragRef.current = null;
      } else if (e.touches.length === 1) {
        const pt = localPoint(e.touches[0].clientX, e.touches[0].clientY);
        if (pt && s.scale) {
          const i = clamp(Math.round(s.geom.iOf(pt.x)), 0, s.n - 1);
          setCrosshair({ x: pt.x, y: pt.y, i });
          s.onHoverBar?.(s.bars[i] ?? null);
        }
        if (s.panEnabled) dragRef.current = { clientX: e.touches[0].clientX, view: s.view };
      }
    };

    const onTouchMove = (e) => {
      const s = stateRef.current;
      if (!s.n) return;
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = touchDist(e.touches);
        const factor = clamp(pinchRef.current.dist / Math.max(1, d), 0.2, 5);
        const base = pinchRef.current.view;
        const span = clamp((base.end - base.start) * factor, Math.min(MIN_BARS, s.n), s.n);
        const center = (base.start + base.end) / 2;
        setView(clampView(center - span / 2, center + span / 2, s.n));
        return;
      }
      const drag = dragRef.current;
      const pt = localPoint(e.touches[0].clientX, e.touches[0].clientY);
      if (pt && s.scale) {
        const i = clamp(Math.round(s.geom.iOf(pt.x)), 0, s.n - 1);
        setCrosshair({ x: pt.x, y: pt.y, i });
        s.onHoverBar?.(s.bars[i] ?? null);
      }
      if (!drag) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - drag.clientX;
      const barW = s.geom.plotW / Math.max(1e-6, drag.view.end - drag.view.start);
      setView(clampView(drag.view.start - dx / barW, drag.view.end - dx / barW, s.n));
    };

    const onTouchEnd = () => {
      dragRef.current = null;
      pinchRef.current = null;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseleave", onMouseLeave);
    el.addEventListener("dblclick", onDblClick);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mouseleave", onMouseLeave);
      el.removeEventListener("dblclick", onDblClick);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      endGesture();
    };
  }, [zoomBy, toDataCoords]);

  // ─── Tracés ──────────────────────────────────────────────────────────────
  const paths = useMemo(() => {
    if (!scale || n === 0 || geom.plotW <= 0) return null;
    const { xOf, barW } = geom;
    const bodyW = clamp(barW * 0.68, 1, 22);
    const thin = barW < 2.2;

    const wickUp = [];
    const wickDown = [];
    const bodyUp = [];
    const bodyDown = [];
    const volUp = [];
    const volDown = [];
    let linePath = "";

    for (let i = i0; i <= i1; i++) {
      const b = bars[i];
      if (!b) continue;
      const x = xOf(i);
      if (style === "candle") {
        const wick = `M ${x.toFixed(2)} ${scale.yOf(b.high).toFixed(2)} L ${x.toFixed(2)} ${scale.yOf(b.low).toFixed(2)} `;
        (b.up ? wickUp : wickDown).push(wick);
        if (!thin) {
          const yO = scale.yOf(b.open);
          const yC = scale.yOf(b.close);
          const top = Math.min(yO, yC);
          const h = Math.max(1, Math.abs(yC - yO));
          const x0 = x - bodyW / 2;
          (b.up ? bodyUp : bodyDown).push(
            `M ${x0.toFixed(2)} ${top.toFixed(2)} h ${bodyW.toFixed(2)} v ${h.toFixed(2)} h ${(-bodyW).toFixed(2)} Z `
          );
        }
      } else {
        linePath += `${linePath ? "L" : "M"} ${x.toFixed(2)} ${scale.yOf(b.close).toFixed(2)} `;
      }
      if (showVolume && b.volume) {
        const yv = scale.volOf(b.volume);
        const h = Math.max(0.6, geom.volTop + geom.volH - yv);
        const w = Math.max(0.6, Math.min(bodyW, barW * 0.72));
        (b.volUp ? volUp : volDown).push(
          `M ${(x - w / 2).toFixed(2)} ${yv.toFixed(2)} h ${w.toFixed(2)} v ${h.toFixed(2)} h ${(-w).toFixed(2)} Z `
        );
      }
    }

    let areaPath = "";
    if (style === "area" && linePath) {
      const xStart = xOf(i0);
      const xEnd = xOf(i1);
      const yBase = geom.priceTop + geom.priceH;
      areaPath = `${linePath} L ${xEnd.toFixed(2)} ${yBase.toFixed(2)} L ${xStart.toFixed(2)} ${yBase.toFixed(2)} Z`;
    }

    const maPaths = mas
      .filter((m) => m.values && activeMAs[m.period])
      .map((m) => {
        let d = "";
        for (let i = i0; i <= i1; i++) {
          const v = m.values[i];
          if (v == null) continue;
          d += `${d ? "L" : "M"} ${xOf(i).toFixed(2)} ${scale.yOf(v).toFixed(2)} `;
        }
        return { ...m, d };
      })
      .filter((m) => m.d);

    return {
      wickUp: wickUp.join(""), wickDown: wickDown.join(""),
      bodyUp: bodyUp.join(""), bodyDown: bodyDown.join(""),
      volUp: volUp.join(""), volDown: volDown.join(""),
      linePath, areaPath, maPaths,
    };
  }, [bars, i0, i1, style, scale, geom, mas, activeMAs, showVolume, n]);

  const priceTicks = useMemo(() => {
    if (!scale) return [];
    if (scale.canLog) {
      const out = [];
      for (let k = 0; k <= 5; k++) {
        const v = roundNice(scale.inv(scale.tLo + ((scale.tHi - scale.tLo) * k) / 5));
        if (v > 0 && !out.includes(v)) out.push(v);
      }
      return out;
    }
    return niceTicks(scale.tLo, scale.tHi, 5);
  }, [scale]);

  const timeTicks = useMemo(() => {
    if (n === 0 || geom.plotW <= 0) return [];
    const visible = i1 - i0 + 1;
    const approx = Math.max(1, Math.round(geom.plotW / 110));
    const step = Math.max(1, Math.ceil(visible / approx));
    const out = [];
    for (let i = i0; i <= i1; i += step) out.push(i);
    return out;
  }, [i0, i1, n, geom.plotW]);

  const hovered = crosshair ? bars[crosshair.i] : null;
  const lastBar = bars[n - 1] ?? null;
  const readoutIndex = hovered ? crosshair.i : n - 1;
  const readout = bars[readoutIndex] ?? null;
  const readoutPrev = readoutIndex > 0 ? bars[readoutIndex - 1] : null;
  const readoutChange =
    readout && readoutPrev && readoutPrev.close
      ? { abs: readout.close - readoutPrev.close, pct: ((readout.close - readoutPrev.close) / readoutPrev.close) * 100 }
      : null;

  const windowChange = useMemo(() => {
    const a = bars[i0]?.close;
    const b = bars[i1]?.close;
    if (!a || !b) return null;
    return ((b - a) / a) * 100;
  }, [bars, i0, i1]);

  const overlayApi = useMemo(
    () =>
      scale
        ? {
            toPx: ({ index, price }) => ({ x: geom.xOf(index), y: scale.yOf(price) }),
            toData: ({ x, y }) => ({ index: geom.iOf(x), price: scale.priceOf(y) }),
            plot: { left: geom.plotLeft, top: geom.plotTop, width: geom.plotW, height: geom.plotH, right: geom.plotRight, bottom: geom.plotBottom },
            size: { width: geom.w, height },
          }
        : null,
    [geom, scale, height]
  );

  const toggleMA = (period) => setActiveMAs((m) => ({ ...m, [period]: !m[period] }));

  return (
    <div className={`select-none ${className}`}>
      {showToolbar && (
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-0.5">
            {CHART_STYLES.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStyle(s.key)}
                  title={`Affichage en ${s.label.toLowerCase()}`}
                  className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                    style === s.key ? "bg-violet-500/20 text-violet-200 border border-violet-500/40" : "text-slate-500 hover:text-slate-200"
                  }`}
                >
                  <Icon size={12} /> {s.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <ToolButton active={showVolume} onClick={() => setShowVolume((v) => !v)} title="Afficher / masquer le volume">
              <BarChart3 size={12} /> Volume
            </ToolButton>
            {MA_CONFIG.map((m) => (
              <ToolButton
                key={m.period}
                active={!!activeMAs[m.period]}
                onClick={() => toggleMA(m.period)}
                disabled={n < m.period}
                title={n < m.period ? `Historique trop court pour une moyenne ${m.period} périodes` : `Moyenne mobile ${m.period} périodes`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: activeMAs[m.period] ? m.color : "#334155" }} />
                {m.label}
              </ToolButton>
            ))}
            <ToolButton active={logScale} onClick={() => setLogScale((v) => !v)} title="Échelle logarithmique — compare les variations en pourcentage">
              <Activity size={12} /> Log
            </ToolButton>
            <div className="flex items-center gap-0.5 rounded-md border border-slate-800 p-0.5">
              <button type="button" onClick={() => zoomBy(0.7)} title="Zoomer" className="p-1 text-slate-500 hover:text-violet-300">
                <ZoomIn size={13} />
              </button>
              <button type="button" onClick={() => zoomBy(1.4)} title="Dézoomer" className="p-1 text-slate-500 hover:text-violet-300">
                <ZoomOut size={13} />
              </button>
              <button type="button" onClick={() => setView({ start: 0, end: n })} title="Réinitialiser la vue" className="p-1 text-slate-500 hover:text-violet-300">
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={wrapRef} className="relative" style={{ height }}>
        {/* Bandeau O/H/L/C façon TradingView */}
        {readout && (
          <div className="absolute left-2 top-1 z-10 pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] sm:text-[11px] font-data tabular-nums">
            <span className="text-slate-500">{fmtXFull(readout.date)}</span>
            <span className="text-slate-500">O <span className="text-slate-300">{fmtPrice(readout.open)}</span></span>
            <span className="text-slate-500">H <span className="text-emerald-300">{fmtPrice(readout.high)}</span></span>
            <span className="text-slate-500">B <span className="text-rose-300">{fmtPrice(readout.low)}</span></span>
            <span className="text-slate-500">C <span className="text-slate-100 font-semibold">{fmtPrice(readout.close)}</span></span>
            {readoutChange && (
              <span style={{ color: readoutChange.abs >= 0 ? C_UP : C_DOWN }}>
                {readoutChange.abs >= 0 ? "+" : ""}{fmtPrice(readoutChange.abs)} ({readoutChange.pct >= 0 ? "+" : ""}{readoutChange.pct.toFixed(2)} %)
              </span>
            )}
            {readout.volume != null && <span className="text-slate-500">Vol <span className="text-slate-300">{compactNum(readout.volume)}</span></span>}
            {windowChange != null && (
              <span className="text-slate-600">
                · vue : <span style={{ color: windowChange >= 0 ? C_UP : C_DOWN }}>{windowChange >= 0 ? "+" : ""}{windowChange.toFixed(2)} %</span>
              </span>
            )}
          </div>
        )}

        {n === 0 || !scale || !paths ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-600">
            Aucune donnée de cours à afficher sur cette période.
          </div>
        ) : (
          <svg
            ref={svgRef}
            width="100%"
            height={height}
            className="cursor-crosshair"
            style={{ touchAction: "pan-y", display: "block" }}
          >
            <defs>
              <linearGradient id="proChartArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C_LINE} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C_LINE} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Grille horizontale + graduations de prix */}
            {priceTicks.map((t) => {
              const y = scale.yOf(t);
              if (!Number.isFinite(y) || y < geom.priceTop - 1 || y > geom.priceTop + geom.priceH + 1) return null;
              return (
                <g key={`p${t}`}>
                  <line x1={geom.plotLeft} y1={y} x2={geom.plotRight} y2={y} stroke={C_GRID} strokeWidth={1} />
                  <text x={geom.plotRight + 6} y={y + 3.5} fill={C_AXIS} fontSize={10} className="font-data">
                    {fmtPrice(t)}
                  </text>
                </g>
              );
            })}

            {/* Grille verticale + graduations de temps */}
            {timeTicks.map((i) => {
              const x = geom.xOf(i);
              if (x < geom.plotLeft || x > geom.plotRight) return null;
              return (
                <g key={`t${i}`}>
                  <line x1={x} y1={geom.plotTop} x2={x} y2={geom.plotBottom} stroke={C_GRID} strokeWidth={1} />
                  <text x={x} y={height - 8} fill={C_AXIS} fontSize={10} textAnchor="middle" className="font-data">
                    {fmtX(bars[i]?.date)}
                  </text>
                </g>
              );
            })}

            {/* Volume */}
            {showVolume && (
              <g opacity={0.5}>
                <path d={paths.volUp} fill={C_UP} />
                <path d={paths.volDown} fill={C_DOWN} />
              </g>
            )}

            {/* Cours */}
            {style === "candle" ? (
              <g>
                <path d={paths.wickUp} stroke={C_UP} strokeWidth={1} fill="none" shapeRendering="crispEdges" />
                <path d={paths.wickDown} stroke={C_DOWN} strokeWidth={1} fill="none" shapeRendering="crispEdges" />
                <path d={paths.bodyUp} fill={C_UP} />
                <path d={paths.bodyDown} fill={C_DOWN} />
              </g>
            ) : (
              <g>
                {style === "area" && <path d={paths.areaPath} fill="url(#proChartArea)" />}
                <path d={paths.linePath} stroke={C_LINE} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            )}

            {/* Moyennes mobiles */}
            {paths.maPaths.map((m) => (
              <path key={m.period} d={m.d} stroke={m.color} strokeWidth={1.25} fill="none" strokeLinejoin="round" opacity={0.9} />
            ))}

            {/* Repères de prix (plus haut / plus bas 52 semaines, objectifs…) */}
            {priceLines.map((pl) => {
              if (pl?.price == null || !Number.isFinite(pl.price)) return null;
              const y = scale.yOf(pl.price);
              if (!Number.isFinite(y) || y < geom.priceTop || y > geom.priceTop + geom.priceH) return null;
              return (
                <g key={pl.label || pl.price}>
                  <line x1={geom.plotLeft} y1={y} x2={geom.plotRight} y2={y} stroke={pl.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.45} />
                  {pl.label && (
                    <text x={geom.plotLeft + 4} y={y - 4} fill={pl.color} fontSize={9} opacity={0.85} className="font-data">
                      {pl.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Dernier cours : ligne pointillée + étiquette sur l'axe */}
            {lastBar && (() => {
              const y = scale.yOf(lastBar.close);
              if (!Number.isFinite(y) || y < geom.priceTop || y > geom.priceTop + geom.priceH) return null;
              const col = lastBar.up ? C_UP : C_DOWN;
              return (
                <g>
                  <line x1={geom.plotLeft} y1={y} x2={geom.plotRight} y2={y} stroke={col} strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
                  <rect x={geom.plotRight + 2} y={y - 8} width={PAD.right - 6} height={16} rx={3} fill={col} />
                  <text x={geom.plotRight + 5} y={y + 3.5} fill="#0b1120" fontSize={10} fontWeight="700" className="font-data">
                    {fmtPrice(lastBar.close)}
                  </text>
                </g>
              );
            })()}

            {/* Réticule */}
            {crosshair && hovered && (
              <g pointerEvents="none">
                <line x1={geom.plotLeft} y1={crosshair.y} x2={geom.plotRight} y2={crosshair.y} stroke={C_CROSS} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
                <line x1={geom.xOf(crosshair.i)} y1={geom.plotTop} x2={geom.xOf(crosshair.i)} y2={geom.plotBottom} stroke={C_CROSS} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
                <circle cx={geom.xOf(crosshair.i)} cy={scale.yOf(hovered.close)} r={3} fill={C_LINE} stroke="#0b1120" strokeWidth={1.5} />
                <rect x={geom.plotRight + 2} y={crosshair.y - 8} width={PAD.right - 6} height={16} rx={3} fill="#334155" />
                <text x={geom.plotRight + 5} y={crosshair.y + 3.5} fill="#e2e8f0" fontSize={10} className="font-data">
                  {fmtPrice(scale.priceOf(crosshair.y))}
                </text>
                <rect x={clamp(geom.xOf(crosshair.i) - 45, 0, Math.max(0, geom.w - 90))} y={geom.plotBottom + 2} width={90} height={16} rx={3} fill="#334155" />
                <text
                  x={clamp(geom.xOf(crosshair.i), 45, Math.max(45, geom.w - 45))}
                  y={geom.plotBottom + 13.5}
                  fill="#e2e8f0"
                  fontSize={10}
                  textAnchor="middle"
                  className="font-data"
                >
                  {fmtX(hovered.date)}
                </text>
              </g>
            )}

            {/* Séparateur du panneau volume */}
            {showVolume && (
              <line x1={geom.plotLeft} y1={geom.volTop - 5} x2={geom.plotRight} y2={geom.volTop - 5} stroke="#1e293b" strokeWidth={1} />
            )}
          </svg>
        )}

        {/* Calque libre (outils de tracé du plein écran) */}
        {renderOverlay && overlayApi && (
          <div className="absolute inset-0 pointer-events-none">{renderOverlay(overlayApi)}</div>
        )}
      </div>
    </div>
  );
}
