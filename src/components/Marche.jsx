import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search, Building2, Globe, Users, TrendingUp, TrendingDown, RefreshCw, Clock,
  BarChart3, Target, Percent, Scale, Info, ExternalLink, Star, PieChart as PieIcon, AlertCircle,
  Maximize2,
} from "lucide-react";
import { Card, CardLabel, EmptyState, CARD_THEMES, SkeletonChart } from "./ui";
import FicheFinanciere from "./FicheFinanciere";
import AssetLogo from "./AssetLogo";
import IndicesWidget from "./IndicesWidget";
import ChartFocusModal from "./ChartFocusModal";
import ProChart from "./ProChart";
import { pct, pctPlain } from "../lib/finance";
import { searchSecurity, fetchHistory, fetchCompanyProfile, fetchQuotes } from "../lib/api";
import { usePersistentState } from "../lib/storage";

const AUTO_REFRESH_MS = 15 * 60 * 1000;

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

const RECO_LABELS = {
  strong_buy: { label: "Achat fort", tone: "text-emerald-400" },
  buy: { label: "Achat", tone: "text-emerald-400" },
  hold: { label: "Conserver", tone: "text-amber-300" },
  underperform: { label: "Sous-performance attendue", tone: "text-rose-400" },
  sell: { label: "Vente", tone: "text-rose-400" },
};

export default function Marche({ watchlist, setWatchlist, openRequest }) {
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
  const [, forceTick] = useState(0);

  const [hoverPoint, setHoverPoint] = useState(null);
  // Style de tracé conservé d'une session à l'autre — un habitué des bougies
  // ne veut pas les ré-activer à chaque visite.
  const [chartStyle, setChartStyle] = usePersistentState("marcheChartStyle", "candle");

  const [focusOpen, setFocusOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setShowResults(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Le témoin « recherche en cours » part AVEC la requête, à l'expiration du
  // délai — et non à chaque caractère tapé, pour une recherche qui allait de
  // toute façon être annulée par la frappe suivante. La liste de résultats,
  // elle, n'est plus vidée par cet effet : sa visibilité est dérivée de la
  // requête courante au rendu (voir plus bas).
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) return undefined;
    debounceRef.current = setTimeout(async () => {
      setSearching(true); setSearchError("");
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
    setHoverPoint(null);
  };

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
      // silencieux
    } finally {
      setLastUpdated(Date.now());
    }
  }, []);

  /**
   * Demande d'ouverture venue du parent (clic sur une ligne du portefeuille ou
   * de la watchlist), prise en compte PENDANT LE RENDU.
   *
   * C'était auparavant un effet qui appelait `setSymbol` puis relançait les
   * chargements, avec un `eslint-disable react-hooks/exhaustive-deps` pour
   * masquer le fait qu'il utilisait `loadProfile` et `loadHistory` déclarés
   * plus bas dans le fichier. Deux conséquences : le compilateur React
   * refusait de traiter tout ce fichier (« Existing memoization could not be
   * preserved »), et un rendu intermédiaire s'affichait avec l'ancien titre
   * avant que l'effet ne corrige l'état.
   *
   * L'ajustement d'état pendant le rendu est le motif documenté par React pour
   * « réagir au changement d'une prop » : React relance le rendu immédiatement,
   * sans rien peindre entre les deux.
   *
   * `rechargements` compte les demandes plutôt que de comparer les symboles :
   * c'est ce qui permet de recharger quand on reclique DEUX FOIS sur la même
   * valeur, cas où `symbol` ne change pas et où aucun effet ne se
   * redéclencherait.
   */
  const [tsDemandeTraitee, setTsDemandeTraitee] = useState(null);
  const [rechargements, setRechargements] = useState(0);
  if (openRequest && openRequest.ts !== tsDemandeTraitee) {
    setTsDemandeTraitee(openRequest.ts);
    setSymbol(openRequest.symbol.toUpperCase());
    setQuery("");
    setResults([]);
    setShowResults(false);
    setRechargements((n) => n + 1);
  }

  // Fiche entreprise : rechargée quand le titre change, ou sur une nouvelle
  // demande d'ouverture portant sur le même titre.
  useEffect(() => {
    if (!symbol) return;
    // Effet de CHARGEMENT : Chargement de la fiche entreprise : voir
    // FicheFinanciere, même motif.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile(symbol);
  }, [symbol, rechargements, loadProfile]);

  // Historique : même déclencheurs, plus la période. Il était chargé par deux
  // effets distincts — un pour le titre, un pour la période — qui pouvaient
  // tirer la même série deux fois lors d'une ouverture depuis le portefeuille.
  useEffect(() => {
    if (!symbol) return;
    // Effet de CHARGEMENT : Chargement de l'historique : idem.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory(symbol, range);
  }, [symbol, range, rechargements, loadHistory]);

  useEffect(() => {
    if (!symbol) return;
    const id = setInterval(() => refreshQuote(symbol), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [symbol, refreshQuote]);

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

  // Performance sur toute la période chargée. La performance de la seule
  // fenêtre zoomée est affichée en direct par le graphique lui-même.
  const totalReturnOnRange = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].close;
    const last = chartData[chartData.length - 1].close;
    if (!first) return null;
    return ((last - first) / first) * 100;
  }, [chartData]);

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

  const headlinePrice = hoverPoint?.close ?? profile?.currentPrice;
  const headlineIsHover = hoverPoint != null;

  // Repères tracés sur le graphique : bornes des 52 dernières semaines et
  // objectif de cours moyen des analystes quand il est connu.
  const priceLines = useMemo(() => {
    const lines = [];
    if (profile?.fiftyTwoWeekHigh != null) lines.push({ price: profile.fiftyTwoWeekHigh, color: "#34d399", label: "+ haut 52 s." });
    if (profile?.fiftyTwoWeekLow != null) lines.push({ price: profile.fiftyTwoWeekLow, color: "#fb7185", label: "+ bas 52 s." });
    if (profile?.targetMeanPrice != null) lines.push({ price: profile.targetMeanPrice, color: "#fbbf24", label: "objectif analystes" });
    return lines;
  }, [profile]);

  return (
    <div className="relative space-y-6">
      <IndicesWidget />

      <Card accent={CARD_THEMES.violet}>
        <div className="relative" ref={searchBoxRef}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => query.trim().length >= 2 && results.length > 0 && setShowResults(true)}
                placeholder="Rechercher une action, un ETF, une obligation... (ticker, ISIN ou nom)"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-violet-400/60 focus-visible:ring-2 focus-visible:ring-violet-400/30"
              />
            </div>
          </div>
          {searching && <p className="text-xs text-slate-500 mt-2">Recherche en cours…</p>}
          {searchError && <p className="text-xs text-amber-400/90 mt-2">{searchError}</p>}

          {/* Voir Watchlist : visibilité dérivée de la requête courante. */}
          {showResults && query.trim().length >= 2 && results.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl divide-y divide-slate-800 max-h-72 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.symbol}
                  onClick={() => pickSymbol(r.symbol)}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-800 transition-colors flex items-center gap-2.5"
                >
                  <AssetLogo ticker={r.symbol} size="xs" />
                  <div className="min-w-0">
                    <div className="text-sm text-slate-100 font-medium">{r.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{r.symbol} {r.exchange ? `· ${r.exchange}` : ""}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

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
                    className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 disabled:text-slate-600 disabled:cursor-not-allowed border border-slate-700 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <Star size={13} /> {isInWatchlist ? "Dans la watchlist" : "Ajouter à la watchlist"}
                  </button>
                )}
                <button
                  onClick={() => { loadProfile(symbol); refreshQuote(symbol); }}
                  disabled={profileLoading}
                  className="flex items-center gap-1.5 text-xs font-medium text-violet-300 hover:text-violet-200 disabled:opacity-40 border border-slate-700 hover:border-violet-400/50 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <RefreshCw size={13} className={profileLoading ? "animate-spin" : ""} /> Actualiser
                </button>
              </div>
            </div>
          </Card>

          {/* ─── Graphique historique (bougies + volume achat/vente) ─── */}
          <Card accent={CARD_THEMES.violet}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <CardLabel icon={BarChart3}>Graphique historique</CardLabel>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 rounded-lg border border-slate-800 p-0.5 bg-slate-950/60 flex-wrap">
                  {RANGE_OPTIONS.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRange(r.key)}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                        range === r.key ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setFocusOpen(true)}
                  disabled={chartData.length < 2}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-violet-300 hover:text-violet-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-violet-500/50 rounded-lg px-2.5 py-1"
                >
                  <Maximize2 size={12} /> Plein écran &amp; outils de tracé
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 mb-2 flex items-center gap-1.5 flex-wrap">
              {seriesMeta?.firstTradeDate && <span>Première cotation connue : {formatFullDateTime(seriesMeta.firstTradeDate, false)}</span>}
              {totalReturnOnRange != null && (
                <span>
                  {seriesMeta?.firstTradeDate && "· "}Performance sur la période chargée :{" "}
                  <span className={totalReturnOnRange >= 0 ? "text-emerald-400" : "text-rose-400"}>{pct(totalReturnOnRange)}</span>
                </span>
              )}
              {isIntraday && (
                <span className="flex items-center gap-1 text-violet-300/80">
                  <Info size={11} /> Données intraday ({seriesMeta.interval}) — précision maximale sur cette échelle.
                </span>
              )}
            </p>

            {historyLoading ? (
              <div className="mt-2 flex flex-col gap-3">
                <SkeletonChart height={320} />
                <SkeletonChart height={80} />
              </div>
            ) : historyError ? (
              <EmptyState>{historyError}</EmptyState>
            ) : chartData.length < 2 ? (
              <EmptyState>Historique insuffisant pour cette valeur sur la période sélectionnée.</EmptyState>
            ) : (
              <>
                <ProChart
                  data={chartData}
                  currency={profile?.currency}
                  isIntraday={isIntraday}
                  range={range}
                  height={420}
                  formatPrice={formatPrice}
                  formatX={formatAxisTick}
                  formatXFull={formatFullDateTime}
                  chartStyle={chartStyle}
                  onChartStyleChange={setChartStyle}
                  priceLines={priceLines}
                  onHoverBar={setHoverPoint}
                />
                <p className="text-[10px] text-slate-600 mt-2 flex items-center gap-1.5 flex-wrap">
                  <Info size={10} />
                  Molette = zoom sur le curseur · clic-glisser = déplacement dans le temps · double-clic = vue complète.
                  Volume coloré : <span className="text-emerald-400">vert</span> = clôture en hausse,{" "}
                  <span className="text-rose-400">rouge</span> = en baisse.
                </p>
              </>
            )}
          </Card>

          {profile && (profile.fiftyTwoWeekLow != null || profile.fiftyTwoWeekHigh != null) && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={Target}>Position dans la fourchette annuelle</CardLabel>
              <div className="mt-3">
                <FiftyTwoWeekGauge low={profile.fiftyTwoWeekLow} high={profile.fiftyTwoWeekHigh} current={profile.currentPrice} currency={profile.currency} />
              </div>
            </Card>
          )}

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

          {/* États financiers détaillés : ratios complets, quatre exercices
              publiés et consensus d'analystes. Chargés à part de la fiche
              entreprise, qui vient d'un endpoint distinct. */}
          <FicheFinanciere symbole={symbol} devise={profile?.currency} />

          <Card accent={CARD_THEMES.violet}>
            <CardLabel icon={Building2}>Fiche entreprise &amp; activité</CardLabel>
            {profileLoading ? (
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex gap-6">
                  <div className="skeleton" style={{ width: 140, height: 12, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 100, height: 12, borderRadius: 4 }} />
                </div>
                <div className="skeleton" style={{ width: "100%", height: 12, borderRadius: 4, marginTop: 8 }} />
                <div className="skeleton" style={{ width: "95%", height: 12, borderRadius: 4 }} />
                <div className="skeleton" style={{ width: "80%", height: 12, borderRadius: 4 }} />
              </div>
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

      <ChartFocusModal
        open={focusOpen}
        onClose={() => setFocusOpen(false)}
        chartData={chartData}
        title={profile?.name ? `${profile.name} · ${symbol}` : symbol}
        currency={profile?.currency}
        formatPrice={formatPrice}
        formatAxisTick={formatAxisTick}
        formatFullDateTime={formatFullDateTime}
        isIntraday={isIntraday}
        range={range}
        priceLines={priceLines}
        chartStyle={chartStyle}
        onChartStyleChange={setChartStyle}
      />
    </div>
  );
}
