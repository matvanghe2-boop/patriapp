import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search, Building2, Globe, Users, TrendingUp, TrendingDown, RefreshCw, Clock,
  BarChart3, Target, Percent, Scale, Info, ExternalLink, Star, PieChart as PieIcon, AlertCircle,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Area, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Brush,
} from "recharts";
import { Card, CardLabel, EmptyState, CARD_THEMES } from "./ui";
import AssetLogo from "./AssetLogo";
import { pct, pctPlain } from "../lib/finance";
import { searchSecurity, fetchHistory, fetchCompanyProfile, fetchQuotes } from "../lib/api";
import { usePersistentState } from "../lib/storage";
import { FocusToggleButton, FocusOverlay, useFocusHotkey } from "./FocusChart";

// ─── Config ───────────────────────────────────────────────────────────────
// Le "différé léger" réglementaire des places boursières se situe en général
// autour de 15 minutes pour les flux gratuits — on affiche donc ce délai et on
// ré-interroge automatiquement à la même cadence, sans jamais prétendre à du
// temps réel strict (ce serait faux pour une source gratuite).
const AUTO_REFRESH_MS = 15 * 60 * 1000;

// Échelles de temps : les trois premières descendent en intraday (bougies de
// quelques minutes) pour un tracé fin ; les suivantes remontent en quotidien
// puis en hebdomadaire sur les très longues périodes.
const RANGE_OPTIONS = [
  { key: "1d", label: "1 J", intraday: true },
  { key: "5d", label: "1 S", intraday: true },
  { key: "1mo", label: "1 M", intraday: true },
  { key: "6mo", label: "6 M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1 A" },
  { key: "5y", label: "5 A" },
  { key: "10y", label: "10 A" },
  { key: "max", label: "Historique complet" },
];

// Quelques valeurs connues pour un accès direct sans avoir à taper de recherche.
const QUICK_PICKS = [
  { symbol: "AI.PA", label: "Air Liquide" },
  { symbol: "MC.PA", label: "LVMH" },
  { symbol: "OR.PA", label: "L'Oréal" },
  { symbol: "CW8.PA", label: "Amundi MSCI World" },
  { symbol: "AAPL", label: "Apple" },
  { symbol: "MSFT", label: "Microsoft" },
];

const SECTOR_LABELS_FR = {
  realestate: "Immobilier", consumer_cyclical: "Consommation cyclique", basic_materials: "Matériaux de base",
  consumer_defensive: "Consommation défensive", technology: "Technologie", communication_services: "Communication",
  financial_services: "Services financiers", utilities: "Services publics", industrials: "Industrie",
  energy: "Énergie", healthcare: "Santé",
};

// Précision adaptée à l'ordre de grandeur du cours : un ETF à 480 € n'a pas
// besoin de 4 décimales, mais un titre à 0,85 € en perd tout son sens arrondi
// à 2 décimales seulement — c'était la cause du rendu "arrondi" signalé.
function priceDigits(n) {
  const abs = Math.abs(n ?? 0);
  if (abs === 0) return 2;
  if (abs < 1) return 4;
  if (abs < 20) return 3;
  return 2;
}

function formatPrice(n, currency) {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = priceDigits(n);
  try {
    return n.toLocaleString("fr-FR", { style: "currency", currency: currency || "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits });
  } catch {
    return `${n.toFixed(digits)} ${currency || ""}`;
  }
}

function formatCompact(n, currency) {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  let out;
  if (abs >= 1e12) out = `${(n / 1e12).toFixed(2)} T`;
  else if (abs >= 1e9) out = `${(n / 1e9).toFixed(2)} Md`;
  else if (abs >= 1e6) out = `${(n / 1e6).toFixed(2)} M`;
  else if (abs >= 1e3) out = `${(n / 1e3).toFixed(0)} k`;
  else out = n.toFixed(0);
  return currency ? `${out} ${currency}` : out;
}

function formatAxisTick(d, isIntraday, range) {
  if (!d) return "";
  const date = new Date(d);
  if (isIntraday && range === "1d") return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (isIntraday) return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  if (["5y", "10y", "max"].includes(range)) return date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}

function formatFullDateTime(d, isIntraday) {
  if (!d) return "";
  const date = new Date(d);
  if (isIntraday) {
    return date.toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function timeAgo(ts) {
  if (!ts) return null;
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return `il y a ${h} h`;
}

// Couleur du volume selon le sens de la bougie (clôture vs ouverture) — vert
// = volume plutôt acheteur, rouge = plutôt vendeur. Gris si l'OHLC n'est pas
// disponible sur ce point (certains agrégats intraday très longue période).
function volumeColor(point) {
  if (point?.open == null || point?.close == null) return "#475569";
  return point.close >= point.open ? "#34d399" : "#fb7185";
}

// ─── Petite jauge 52 semaines ────────────────────────────────────────────
function FiftyTwoWeekGauge({ low, high, current, currency }) {
  if (low == null || high == null || current == null || high <= low) return null;
  const posPct = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
        <span className="font-data tabular-nums">{formatPrice(low, currency)}</span>
        <span className="text-slate-600">Plus bas / plus haut sur 52 semaines</span>
        <span className="font-data tabular-nums">{formatPrice(high, currency)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-slate-800">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-400/60 via-amber-400/60 to-emerald-400/60" style={{ width: "100%" }} />
        <div
          className="absolute -top-1 w-3 h-3 rounded-full bg-slate-50 border-2 border-violet-500 shadow"
          style={{ left: `calc(${posPct}% - 6px)` }}
          title={`Cours actuel : ${formatPrice(current, currency)}`}
        />
      </div>
    </div>
  );
}

function StatCell({ icon: Icon, label, value, sub }) {
  if (value == null || value === "—") return null;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 mb-1">
        {Icon && <Icon size={11} />} {label}
      </div>
      <div className="font-display text-base text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label, currency, isIntraday }) {
  if (!active || !payload?.length) return null;
  const close = payload.find((p) => p.dataKey === "close")?.value;
  const volume = payload.find((p) => p.dataKey === "volume")?.value;
  const point = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl space-y-1">
      <div className="text-slate-400">{formatFullDateTime(label, isIntraday)}</div>
      {close != null && <div className="text-violet-300 font-data tabular-nums">Clôture : {formatPrice(close, currency)}</div>}
      {point?.open != null && point?.close != null && (
        <div className="text-slate-500 font-data tabular-nums">
          O {formatPrice(point.open, currency)} · H {formatPrice(point.high, currency)} · B {formatPrice(point.low, currency)}
          {point.high > point.low && (
            <span className="ml-1 text-[10px] text-slate-600">
              (amplitude {(((point.high - point.low) / point.low) * 100).toFixed(2)}%)
            </span>
          )}
        </div>
      )}
      {volume != null && (
        <div className="text-slate-500 font-data tabular-nums flex items-center gap-1.5">
          Volume : {formatCompact(volume)}
          {point?.open != null && point?.close != null && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: volumeColor(point) }}
              title={point.close >= point.open ? "Volume plutôt acheteur" : "Volume plutôt vendeur"}
            />
          )}
        </div>
      )}
    </div>
  );
}

const RECO_LABELS = {
  strong_buy: { label: "Achat fort", tone: "text-emerald-400" },
  buy: { label: "Achat", tone: "text-emerald-400" },
  hold: { label: "Conserver", tone: "text-amber-300" },
  underperform: { label: "Sous-performance attendue", tone: "text-rose-400" },
  sell: { label: "Vente", tone: "text-rose-400" },
};

export default function Marche({ watchlist, setWatchlist, openRequest, positions = [] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef(null);
  const searchBoxRef = useRef(null);

  const [symbol, setSymbol] = usePersistentState("marcheLastSymbol", null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [range, setRange] = useState("1y");
  const [series, setSeries] = useState([]);
  const [seriesMeta, setSeriesMeta] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [lastUpdated, setLastUpdated] = useState(null);
  const [, forceTick] = useState(0); // pour rafraîchir l'affichage "il y a N min"

  // Point survolé/sélectionné sur le graphique — permet de se déplacer sur
  // toute l'échelle et de voir le cours exact à n'importe quelle date.
  const [hoverPoint, setHoverPoint] = useState(null);
  const [brushRange, setBrushRange] = useState(null); // [startIndex, endIndex]

  // ─── Mode Focus (plein écran, touche F) ────────────────────────────────
  const [focusMode, setFocusMode] = useState(false);
  useFocusHotkey(() => setFocusMode((f) => !f));

  // ─── Zoom molette fin, en plus du Brush existant (navigation macro) ────
  // zoomDomain = [startIdx, endIdx] sur chartData, ou null = vue complète.
  const [zoomDomain, setZoomDomain] = useState(null);
  const resetZoom = () => setZoomDomain(null);

  // Ferme la liste de résultats au clic extérieur.
  useEffect(() => {
    const handler = (e) => { if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setShowResults(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Recherche instantanée avec anti-rebond, sur le même modèle que l'ajout de position.
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true); setSearchError("");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchSecurity(query.trim());
        setResults(r);
        setShowResults(true);
      } catch {
        setSearchError("Recherche indisponible pour le moment.");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const pickSymbol = (s) => {
    setSymbol(s.toUpperCase());
    setQuery("");
    setResults([]);
    setShowResults(false);
    setBrushRange(null);
    setHoverPoint(null);
    setZoomDomain(null);
  };

  // Ouverture directe depuis un clic sur une position (Portefeuille) ou une
  // ligne de la watchlist : on charge la fiche de la valeur demandée, même si
  // c'est déjà la valeur affichée (le "ts" garantit le redéclenchement).
  //
  // Ce chargement et celui déclenché par un changement de `symbol` sont
  // fusionnés dans UN SEUL effet : avoir deux effets séparés (un sur
  // `openRequest`, un sur `symbol`) provoquait une redirection "en retard" —
  // au premier montage de <Marche>, l'effet `[symbol]` se déclenchait avec
  // l'ANCIENNE valeur de `symbol` (celle encore en mémoire depuis la dernière
  // visite), pendant que l'effet `[openRequest]` planifiait seulement un
  // `setSymbol(nouvelleValeur)` pour le rendu suivant. Les deux requêtes
  // réseau partaient donc en parallèle (ancienne puis nouvelle valeur), et
  // selon l'ordre de réponse du réseau, la fiche/graphique pouvaient rester
  // bloqués sur l'ancienne valeur jusqu'au clic suivant.
  const lastHandledRequestTs = useRef(null);
  const loadedSymbolRef = useRef(null);
  useEffect(() => {
    let effectiveSymbol = symbol;
    let forceReload = false;

    if (openRequest && openRequest.ts !== lastHandledRequestTs.current) {
      lastHandledRequestTs.current = openRequest.ts;
      effectiveSymbol = openRequest.symbol.toUpperCase();
      forceReload = true;
      if (effectiveSymbol !== symbol) {
        setSymbol(effectiveSymbol);
        setQuery("");
        setResults([]);
        setShowResults(false);
      }
    }

    if (!effectiveSymbol) return;
    // Évite un second fetch redondant quand ce même effet vient de déclencher
    // le setSymbol ci-dessus (le rendu suivant repassera ici avec le nouveau
    // symbole déjà chargé).
    if (!forceReload && loadedSymbolRef.current === effectiveSymbol) return;
    loadedSymbolRef.current = effectiveSymbol;

    setBrushRange(null);
    setHoverPoint(null);
    setZoomDomain(null);
    loadProfile(effectiveSymbol);
    loadHistory(effectiveSymbol, range);
    setLastUpdated(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, openRequest]);

  const loadProfile = useCallback(async (sym) => {
    setProfileLoading(true); setProfileError("");
    try {
      const p = await fetchCompanyProfile(sym);
      if (!p.ok) throw new Error(p.error || "Fiche indisponible");
      setProfile(p);
    } catch (err) {
      setProfile(null);
      setProfileError(err.message || "Fiche entreprise indisponible.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (sym, r) => {
    setHistoryLoading(true); setHistoryError("");
    setBrushRange(null);
    setZoomDomain(null);
    try {
      const [res] = await fetchHistory([sym], r);
      if (!res?.ok) throw new Error(res?.error || "Historique indisponible");
      setSeries(res.series);
      setSeriesMeta(res);
    } catch (err) {
      setSeries([]);
      setSeriesMeta(null);
      setHistoryError(err.message || "Historique indisponible.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const refreshQuote = useCallback(async (sym) => {
    try {
      const [q] = await fetchQuotes([sym]);
      if (q?.ok) {
        setProfile((p) => (p ? { ...p, currentPrice: q.price, previousClose: q.previousClose ?? p.previousClose } : p));
      }
    } catch {
      // Silencieux : l'échec d'une actualisation en tâche de fond n'a pas besoin d'interrompre l'utilisateur.
    } finally {
      setLastUpdated(Date.now());
    }
  }, []);

  // Changement de plage : on ne recharge que l'historique.
  useEffect(() => {
    if (!symbol) return;
    loadHistory(symbol, range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Actualisation automatique du cours toutes les 15 minutes (différé léger des flux gratuits).
  useEffect(() => {
    if (!symbol) return;
    const id = setInterval(() => refreshQuote(symbol), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [symbol, refreshQuote]);

  // Petit ticker pour rafraîchir le texte "il y a N min" sans re-fetcher.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const dayChange = useMemo(() => {
    if (!profile || profile.currentPrice == null || profile.previousClose == null) return null;
    const abs = profile.currentPrice - profile.previousClose;
    const p = profile.previousClose !== 0 ? (abs / profile.previousClose) * 100 : 0;
    return { abs, pct: p };
  }, [profile]);

  const isIntraday = !!seriesMeta?.isIntraday;
  const chartData = series;

  // Vue actuellement affichée : recadrée par le zoom molette si actif.
  const visibleData = useMemo(() => {
    if (!zoomDomain) return chartData;
    const [start, end] = zoomDomain;
    return chartData.slice(start, end + 1);
  }, [chartData, zoomDomain]);

  // Zoom à la molette : centré sur le curseur/le centre de la vue actuelle,
  // zoom avant sur défilement vers le haut, arrière sur défilement vers le bas.
  const handleWheelZoom = useCallback((e) => {
    if (!chartData || chartData.length < 20) return; // pas utile sur un historique trop court
    e.preventDefault();
    setZoomDomain((current) => {
      const [start, end] = current || [0, chartData.length - 1];
      const range = end - start;
      const factor = e.deltaY < 0 ? 0.85 : 1.18; // molette haut = zoom in, bas = zoom out
      const center = start + range / 2;
      const newRange = Math.max(10, Math.min(chartData.length - 1, range * factor));
      const newStart = Math.max(0, Math.round(center - newRange / 2));
      const newEnd = Math.min(chartData.length - 1, Math.round(center + newRange / 2));
      if (newEnd - newStart >= chartData.length - 1) return null; // retour à la vue complète
      return [newStart, newEnd];
    });
  }, [chartData]);

  const totalReturnOnBrush = useMemo(() => {
    const data = brushRange ? chartData.slice(brushRange[0], brushRange[1] + 1) : visibleData;
    if (data.length < 2) return null;
    const first = data[0].close;
    const last = data[data.length - 1].close;
    if (!first) return null;
    return ((last - first) / first) * 100;
  }, [chartData, visibleData, brushRange]);

  const isInWatchlist = useMemo(
    () => (watchlist || []).some((w) => w.ticker?.toUpperCase() === symbol?.toUpperCase()),
    [watchlist, symbol]
  );

  const addToWatchlist = () => {
    if (!symbol || !setWatchlist) return;
    setWatchlist((wl) => (wl.some((w) => w.ticker?.toUpperCase() === symbol.toUpperCase())
      ? wl
      : [...wl, { id: `${symbol}-${Date.now()}`, ticker: symbol, name: profile?.name || symbol, target_price: null, note: "" }]));
  };

  const reco = profile?.recommendationKey ? RECO_LABELS[profile.recommendationKey] : null;
  const upsidePct = profile?.targetMeanPrice && profile?.currentPrice
    ? ((profile.targetMeanPrice - profile.currentPrice) / profile.currentPrice) * 100
    : null;

  const isFund = ["ETF", "MUTUALFUND", "INDEX"].includes(profile?.instrumentType);

  // Prix affiché en tête de fiche : celui survolé sur le graphique si l'on
  // est en train de s'y déplacer, sinon le dernier cours connu (différé ~15 min).
  const headlinePrice = hoverPoint?.close ?? profile?.currentPrice;
  const headlineIsHover = hoverPoint != null;

  const handleChartMouseMove = (state) => {
    if (state?.activePayload?.length) setHoverPoint(state.activePayload[0].payload);
  };
  const handleChartMouseLeave = () => setHoverPoint(null);
  const handleBrushChange = (r) => {
    if (r && r.startIndex != null && r.endIndex != null) setBrushRange([r.startIndex, r.endIndex]);
  };

  return (
    <div className="relative space-y-6">
      {/* ─── Barre de recherche ─── */}
      <Card accent={CARD_THEMES.violet}>
        <div className="relative" ref={searchBoxRef}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => results.length > 0 && setShowResults(true)}
                placeholder="Rechercher une action, un ETF, une obligation... (ticker, ISIN ou nom)"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-violet-400/60 focus-visible:ring-2 focus-visible:ring-violet-400/30"
              />
            </div>
          </div>
          {searching && <p className="text-xs text-slate-500 mt-2">Recherche en cours…</p>}
          {searchError && <p className="text-xs text-amber-400/90 mt-2">{searchError}</p>}

          {showResults && results.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-800 max-h-72 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.symbol}
                  onClick={() => pickSymbol(r.symbol)}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-800 transition-colors flex items-center gap-2.5"
                >
                  <AssetLogo ticker={r.symbol} size="xs" />
                  <div className="min-w-0">
                    <div className="text-sm text-slate-100 font-medium">{r.symbol}</div>
                    <div className="text-[11px] text-slate-500 truncate">{r.name} {r.exchange ? `· ${r.exchange}` : ""}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Accès rapides */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {QUICK_PICKS.map((q) => (
            <button
              key={q.symbol}
              onClick={() => pickSymbol(q.symbol)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
                symbol === q.symbol ? "text-violet-300 border-violet-500/50 bg-violet-500/10" : "text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700"
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>
      </Card>

      {!symbol ? (
        <Card accent={CARD_THEMES.violet}>
          <EmptyState>
            Recherche une entreprise ou choisis un accès rapide ci-dessus pour afficher sa fiche complète et son historique de cours depuis son introduction en bourse.
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* ─── En-tête valeur sélectionnée ─── */}
          <Card accent={CARD_THEMES.violet}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <AssetLogo ticker={symbol} name={profile?.name} size="md" />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl text-slate-50">{profile?.name || symbol}</h2>
                    <span className="text-xs text-slate-500 font-data">{symbol}</span>
                    {profile?.instrumentLabel && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-300 bg-violet-500/10 border border-violet-500/30 rounded px-1.5 py-0.5">
                        {profile.instrumentLabel}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    {profile?.exchange && <span>{profile.exchange}</span>}
                    {profile?.sector && <span className="text-slate-700">·</span>}
                    {profile?.sector && <span>{profile.sector}</span>}
                    {profile?.industry && <span className="text-slate-700">·</span>}
                    {profile?.industry && <span>{profile.industry}</span>}
                    {isFund && profile?.fundCategory && <span>{profile.fundCategory}</span>}
                    {isFund && profile?.fundFamily && <span className="text-slate-700">· {profile.fundFamily}</span>}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className={`font-display text-2xl ${headlineIsHover ? "text-violet-300" : "text-slate-100"}`}>
                  {profileLoading ? "…" : formatPrice(headlinePrice, profile?.currency)}
                </div>
                {headlineIsHover ? (
                  <div className="text-[11px] text-violet-300/80 mt-0.5">au {formatFullDateTime(hoverPoint.date, isIntraday)}</div>
                ) : dayChange ? (
                  <div className={`flex items-center justify-end gap-1 text-sm font-data mt-0.5 ${dayChange.abs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {dayChange.abs >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {dayChange.abs >= 0 ? "+" : ""}{formatPrice(dayChange.abs, profile?.currency)} ({pct(dayChange.pct)})
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2 mt-4 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Clock size={12} />
                  Cours différé d'environ 15 min · {lastUpdated ? `dernière actualisation ${timeAgo(lastUpdated)}` : "…"}
                </span>
                {profile?.website && (
                  <a href={profile.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-violet-300 hover:text-violet-200">
                    <ExternalLink size={11} /> Site officiel
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                {setWatchlist && (
                  <button
                    onClick={addToWatchlist}
                    disabled={isInWatchlist}
                    className="btn-press btn-border-flash flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 disabled:text-slate-600 disabled:cursor-not-allowed border border-slate-700 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <Star size={13} /> {isInWatchlist ? "Dans la watchlist" : "Ajouter à la watchlist"}
                  </button>
                )}
                <button
                  onClick={() => { loadProfile(symbol); refreshQuote(symbol); }}
                  disabled={profileLoading}
                  className="btn-press btn-border-flash flex items-center gap-1.5 text-xs font-medium text-violet-300 hover:text-violet-200 disabled:opacity-40 border border-slate-700 hover:border-violet-400/50 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <RefreshCw size={13} className={profileLoading ? "animate-spin" : ""} /> Actualiser
                </button>
              </div>
            </div>
          </Card>

          {/* ─── Graphique historique ─── */}
          <Card accent={CARD_THEMES.violet}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <CardLabel icon={BarChart3}>Graphique historique</CardLabel>
              <div className="flex items-center gap-2 flex-wrap">
                <FocusToggleButton onClick={() => setFocusMode(true)} />
                {zoomDomain && (
                  <button onClick={resetZoom} className="btn-flash text-[11px] font-medium text-violet-300 hover:text-violet-200 border border-violet-500/40 rounded-lg px-2.5 py-1">
                    Réinitialiser le zoom
                  </button>
                )}
                <div className="flex items-center gap-1 rounded-lg border border-slate-800 p-0.5 bg-slate-950/60 flex-wrap">
                  {RANGE_OPTIONS.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRange(r.key)}
                      className={`btn-hard-switch text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                        range === r.key ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 mb-2 flex items-center gap-1.5 flex-wrap">
              {seriesMeta?.firstTradeDate && <span>Première cotation connue : {formatFullDateTime(seriesMeta.firstTradeDate, false)}</span>}
              {totalReturnOnBrush != null && (
                <span>
                  {seriesMeta?.firstTradeDate && "· "}Performance {brushRange ? "sur la zone sélectionnée" : zoomDomain ? "sur la zone zoomée" : "sur la période affichée"} :{" "}
                  <span className={totalReturnOnBrush >= 0 ? "text-emerald-400" : "text-rose-400"}>{pct(totalReturnOnBrush)}</span>
                </span>
              )}
              {isIntraday && (
                <span className="flex items-center gap-1 text-violet-300/80">
                  <Info size={11} /> Données intraday ({seriesMeta.interval}) — précision maximale sur cette échelle.
                </span>
              )}
              <span className="flex items-center gap-1 text-slate-700">
                <Info size={11} /> Molette de la souris = zoom fin sur le graphique.
              </span>
            </p>

            {historyLoading ? (
              <div className="h-96 flex items-center justify-center text-sm text-slate-500">Chargement de l'historique…</div>
            ) : historyError ? (
              <EmptyState>{historyError}</EmptyState>
            ) : chartData.length < 2 ? (
              <EmptyState>Historique insuffisant pour cette valeur sur la période sélectionnée.</EmptyState>
            ) : (
              <>
                <div className="h-80 mt-2" onWheel={handleWheelZoom}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={visibleData} margin={{ left: 0, right: 10, top: 10 }} onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                      <defs>
                        <linearGradient id="marcheCloseFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => formatAxisTick(d, isIntraday, range)} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={60} />
                      <YAxis domain={["auto", "auto"]} tickFormatter={(v) => formatCompact(v)} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                      <Tooltip content={<ChartTooltip currency={profile?.currency} isIntraday={isIntraday} />} cursor={{ stroke: "#a78bfa", strokeDasharray: "3 3", strokeWidth: 1 }} />
                      {profile?.fiftyTwoWeekHigh != null && (
                        <ReferenceLine y={profile.fiftyTwoWeekHigh} stroke="#34d399" strokeDasharray="3 3" strokeOpacity={0.4} />
                      )}
                      {profile?.fiftyTwoWeekLow != null && (
                        <ReferenceLine y={profile.fiftyTwoWeekLow} stroke="#fb7185" strokeDasharray="3 3" strokeOpacity={0.4} />
                      )}
                      {hoverPoint && <ReferenceLine x={hoverPoint.date} stroke="#a78bfa" strokeOpacity={0.5} />}
                      <Area type="monotone" dataKey="close" name="Cours de clôture" stroke="#a78bfa" strokeWidth={2} fill="url(#marcheCloseFill)" isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: "#a78bfa", stroke: "#0f172a", strokeWidth: 2 }} />
                      <Brush
                        dataKey="date"
                        height={28}
                        stroke="#7c3aed"
                        fill="#1e1b3a"
                        travellerWidth={9}
                        tickFormatter={(i) => formatAxisTick(chartData[i]?.date, isIntraday, range)}
                        onChange={handleBrushChange}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-600 mt-1 flex items-center gap-1.5">
                  <Info size={10} /> Survole le graphique pour voir le cours exact à une date, utilise la molette pour zoomer finement, ou fais glisser les poignées du bandeau du bas pour naviguer sur toute la période.
                </p>

                {/* Volume — coloré selon le sens de la bougie (achat/vente) */}
                <div className="h-20 mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={visibleData} margin={{ left: 0, right: 10, top: 0 }} onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={[0, "auto"]} />
                      <Tooltip content={<ChartTooltip currency={profile?.currency} isIntraday={isIntraday} />} cursor={{ fill: "#a78bfa", fillOpacity: 0.08 }} />
                      <Bar dataKey="volume" name="Volume" radius={[1, 1, 0, 0]} isAnimationActive={false}>
                        {visibleData.map((d, i) => (
                          <Cell key={i} fill={volumeColor(d)} fillOpacity={0.75} />
                        ))}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-600 mt-1 flex items-center gap-3">
                  <span>Volume échangé par période</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400/75" /> Plutôt acheteur</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-400/75" /> Plutôt vendeur</span>
                </p>
              </>
            )}
          </Card>

          {/* ─── Repère 52 semaines ─── */}
          {profile && (profile.fiftyTwoWeekLow != null || profile.fiftyTwoWeekHigh != null) && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={Target}>Position dans la fourchette annuelle</CardLabel>
              <div className="mt-3">
                <FiftyTwoWeekGauge low={profile.fiftyTwoWeekLow} high={profile.fiftyTwoWeekHigh} current={profile.currentPrice} currency={profile.currency} />
              </div>
            </Card>
          )}

          {/* ─── Ratios clés (actions) ─── */}
          {profile && !isFund && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={Scale}>Valorisation &amp; rentabilité</CardLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
                <StatCell icon={BarChart3} label="Capitalisation" value={profile.marketCap != null ? formatCompact(profile.marketCap, profile.currency) : null} />
                <StatCell icon={Percent} label="PER (résultats passés)" value={profile.peRatio != null ? profile.peRatio.toFixed(1) : null} />
                <StatCell icon={Percent} label="PER prévisionnel" value={profile.forwardPE != null ? profile.forwardPE.toFixed(1) : null} />
                <StatCell icon={Scale} label="Bêta" value={profile.beta != null ? profile.beta.toFixed(2) : null} sub="Sensibilité au marché" />
                <StatCell icon={Percent} label="Rendement du dividende" value={profile.dividendYield != null ? pctPlain(profile.dividendYield * 100, 2) : null} />
                <StatCell icon={Percent} label="Marge nette" value={profile.profitMargin != null ? pctPlain(profile.profitMargin * 100, 1) : null} />
                <StatCell icon={TrendingUp} label="Croissance du CA" value={profile.revenueGrowth != null ? pct(profile.revenueGrowth * 100, 1) : null} />
                <StatCell icon={Percent} label="Rentabilité des capitaux (ROE)" value={profile.returnOnEquity != null ? pctPlain(profile.returnOnEquity * 100, 1) : null} />
              </div>

              {(reco || upsidePct != null) && (
                <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-4">
                  {reco && (
                    <div className="text-xs">
                      <span className="text-slate-500">Avis moyen des analystes : </span>
                      <span className={`font-semibold ${reco.tone}`}>{reco.label}</span>
                      {profile.numberOfAnalystOpinions ? <span className="text-slate-600"> ({profile.numberOfAnalystOpinions} avis)</span> : null}
                    </div>
                  )}
                  {upsidePct != null && (
                    <div className="text-xs">
                      <span className="text-slate-500">Objectif de cours moyen : </span>
                      <span className="text-slate-200 font-data">{formatPrice(profile.targetMeanPrice, profile.currency)}</span>
                      <span className={`ml-1 font-data ${upsidePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>({pct(upsidePct)})</span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* ─── Composition (ETF / fonds) ─── */}
          {profile && isFund && (profile.holdings?.length > 0 || profile.sectorWeightings?.length > 0 || profile.expenseRatio != null) && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={PieIcon}>Composition du fonds</CardLabel>
              <div className="grid sm:grid-cols-2 gap-6 mt-2">
                {profile.holdings?.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Principales positions</div>
                    <div className="space-y-1.5">
                      {profile.holdings.map((h) => (
                        <div key={h.symbol || h.name} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 truncate pr-2">{h.name || h.symbol}</span>
                          <span className="font-data tabular-nums text-slate-400 shrink-0">{h.weightPct != null ? pctPlain(h.weightPct, 1) : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {profile.sectorWeightings?.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Répartition sectorielle</div>
                    <div className="space-y-1.5">
                      {profile.sectorWeightings.slice(0, 8).map((s) => (
                        <div key={s.key} className="flex items-center gap-2">
                          <span className="text-xs text-slate-300 w-32 truncate">{SECTOR_LABELS_FR[s.key] || s.key}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.min(100, s.weightPct)}%` }} />
                          </div>
                          <span className="text-[11px] font-data tabular-nums text-slate-400 w-10 text-right">{s.weightPct.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {profile.expenseRatio != null && (
                <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800">
                  Frais annuels du fonds : <span className="text-slate-300 font-data">{pctPlain(profile.expenseRatio * 100, 2)}</span>
                </p>
              )}
            </Card>
          )}

          {/* ─── Fiche entreprise / activité ─── */}
          <Card accent={CARD_THEMES.violet}>
            <CardLabel icon={Building2}>Fiche entreprise &amp; activité</CardLabel>
            {profileLoading ? (
              <p className="text-sm text-slate-500 mt-2">Chargement…</p>
            ) : profileError ? (
              <EmptyState>{profileError}</EmptyState>
            ) : profile ? (
              <div className="mt-2 space-y-4">
                {profile.limited && (
                  <div className="flex items-start gap-2 text-[11px] text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                    <AlertCircle size={13} className="shrink-0 mt-0.5" />
                    Fiche simplifiée : les données étendues (description détaillée, ratios complets) ne sont pas disponibles pour cette valeur pour le moment. Les cours et repères ci-dessus restent fiables.
                  </div>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                  {profile.country && (
                    <span className="flex items-center gap-1.5"><Globe size={12} /> {profile.city ? `${profile.city}, ` : ""}{profile.country}</span>
                  )}
                  {profile.employees && (
                    <span className="flex items-center gap-1.5"><Users size={12} /> {profile.employees.toLocaleString("fr-FR")} employés</span>
                  )}
                </div>

                {profile.description ? (
                  <p className="text-sm text-slate-300 leading-relaxed">{profile.description}</p>
                ) : isFund ? (
                  <p className="text-sm text-slate-600 italic">
                    Pas de description longue disponible pour ce fonds — voir sa composition ci-dessus{profile.fundFamily ? ` (société de gestion : ${profile.fundFamily})` : ""}.
                  </p>
                ) : (
                  <p className="text-sm text-slate-600 italic">Aucune description disponible pour cette valeur.</p>
                )}

                {profile.officers?.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">Direction</div>
                    <div className="flex flex-wrap gap-2">
                      {profile.officers.map((o, i) => (
                        <span key={i} className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1">
                          {o.name}{o.title ? <span className="text-slate-500"> · {o.title}</span> : null}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-slate-600 flex items-start gap-1.5 pt-2 border-t border-slate-800">
                  <Info size={12} className="shrink-0 mt-0.5" />
                  Données fournies à titre informatif (source : flux de marché grand public), avec un différé d'environ 15 minutes.
                  Elles ne constituent pas un conseil en investissement.
                </p>
              </div>
            ) : (
              <EmptyState>Aucune donnée disponible pour cette valeur.</EmptyState>
            )}
          </Card>
        </>
      )}

      {/* ─── Mode Focus : graphique seul, plein écran, sans distraction ─── */}
      <FocusOverlay active={focusMode} onClose={() => setFocusMode(false)}>
        {symbol && chartData.length >= 2 && (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h2 className="font-display text-xl text-slate-50 flex items-center gap-2">
                {profile?.name || symbol} <span className="text-sm text-slate-500 font-data">{symbol}</span>
              </h2>
              <div className="flex items-center gap-2">
                {zoomDomain && (
                  <button onClick={resetZoom} className="btn-flash text-[11px] font-medium text-violet-300 hover:text-violet-200 border border-violet-500/40 rounded-lg px-2.5 py-1">
                    Réinitialiser le zoom
                  </button>
                )}
                <span className="font-data text-lg text-slate-100">{formatPrice(headlinePrice, profile?.currency)}</span>
              </div>
            </div>
            <div className="flex-1 min-h-0" onWheel={handleWheelZoom}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleData} margin={{ left: 0, right: 10, top: 10 }} onMouseMove={handleChartMouseMove} onMouseLeave={handleChartMouseLeave}>
                  <defs>
                    <linearGradient id="marcheCloseFillFocus" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => formatAxisTick(d, isIntraday, range)} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={60} />
                  <YAxis domain={["auto", "auto"]} tickFormatter={(v) => formatCompact(v)} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip content={<ChartTooltip currency={profile?.currency} isIntraday={isIntraday} />} cursor={{ stroke: "#a78bfa", strokeDasharray: "3 3" }} />
                  {hoverPoint && <ReferenceLine x={hoverPoint.date} stroke="#a78bfa" strokeOpacity={0.5} />}
                  <Area type="monotone" dataKey="close" stroke="#a78bfa" strokeWidth={2} fill="url(#marcheCloseFillFocus)" isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: "#a78bfa", stroke: "#0f172a", strokeWidth: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="h-16 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleData} margin={{ left: 0, right: 10, top: 0 }}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={[0, "auto"]} />
                  <Bar dataKey="volume" radius={[1, 1, 0, 0]} isAnimationActive={false}>
                    {visibleData.map((d, i) => (
                      <Cell key={i} fill={volumeColor(d)} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-600 mt-2">Molette = zoom · Échap ou bouton en haut à droite pour quitter.</p>
          </div>
        )}
      </FocusOverlay>
    </div>
  );
}
