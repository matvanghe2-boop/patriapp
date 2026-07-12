import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search, Building2, Globe, Users, TrendingUp, TrendingDown, RefreshCw, Clock,
  BarChart3, Target, Percent, Scale, Activity, Info, ExternalLink, Star, X as XIcon,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine,
} from "recharts";
import { Card, CardLabel, EmptyState, PageGlow, CARD_THEMES } from "./ui";
import AssetLogo from "./AssetLogo";
import { pct, pctPlain } from "../lib/finance";
import { searchSecurity, fetchHistory, fetchCompanyProfile, fetchQuotes } from "../lib/api";
import { usePersistentState } from "../lib/storage";

// ─── Config ───────────────────────────────────────────────────────────────
// Le "différé léger" réglementaire des places boursières se situe en général
// autour de 15 minutes pour les flux gratuits — on affiche donc ce délai et on
// ré-interroge automatiquement à la même cadence, sans jamais prétendre à du
// temps réel strict (ce serait faux pour une source gratuite).
const AUTO_REFRESH_MS = 15 * 60 * 1000;

const RANGE_OPTIONS = [
  { key: "1mo", label: "1 M" },
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

function formatPrice(n, currency) {
  if (n == null || !Number.isFinite(n)) return "—";
  try {
    return n.toLocaleString("fr-FR", { style: "currency", currency: currency || "EUR", maximumFractionDigits: 2 });
  } catch {
    return `${n.toFixed(2)} ${currency || ""}`;
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

function formatDateForRange(d, range) {
  if (!d) return "";
  const date = new Date(d);
  if (["5y", "10y", "max"].includes(range)) {
    return date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  }
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}

function formatFullDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
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

function ChartTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  const close = payload.find((p) => p.dataKey === "close")?.value;
  const volume = payload.find((p) => p.dataKey === "volume")?.value;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl space-y-1">
      <div className="text-slate-400">{formatFullDate(label)}</div>
      {close != null && <div className="text-violet-300 font-data tabular-nums">Clôture : {formatPrice(close, currency)}</div>}
      {volume != null && <div className="text-slate-500 font-data tabular-nums">Volume : {formatCompact(volume)}</div>}
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

export default function Marche({ watchlist, setWatchlist }) {
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

  const [range, setRange] = useState("max");
  const [series, setSeries] = useState([]);
  const [seriesMeta, setSeriesMeta] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [lastUpdated, setLastUpdated] = useState(null);
  const [, forceTick] = useState(0); // pour rafraîchir l'affichage "il y a N min"

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
      // Silencieux : l'échec d'une actualisation en tâche de fond n'a pas besoin d'interrompre l'utilisateur.
    } finally {
      setLastUpdated(Date.now());
    }
  }, []);

  // Chargement initial / changement de valeur sélectionnée.
  useEffect(() => {
    if (!symbol) return;
    loadProfile(symbol);
    loadHistory(symbol, range);
    setLastUpdated(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

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

  const chartData = useMemo(() => series.map((p) => ({ ...p, dateLabel: formatDateForRange(p.date, range) })), [series, range]);

  const totalReturnSinceStart = useMemo(() => {
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
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    {profile?.exchange && <span>{profile.exchange}</span>}
                    {profile?.sector && <span className="text-slate-700">·</span>}
                    {profile?.sector && <span>{profile.sector}</span>}
                    {profile?.industry && <span className="text-slate-700">·</span>}
                    {profile?.industry && <span>{profile.industry}</span>}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-display text-2xl text-slate-100">
                  {profileLoading ? "…" : formatPrice(profile?.currentPrice, profile?.currency)}
                </div>
                {dayChange && (
                  <div className={`flex items-center justify-end gap-1 text-sm font-data mt-0.5 ${dayChange.abs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {dayChange.abs >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {dayChange.abs >= 0 ? "+" : ""}{formatPrice(dayChange.abs, profile?.currency)} ({pct(dayChange.pct)})
                  </div>
                )}
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

          {/* ─── Graphique historique ─── */}
          <Card accent={CARD_THEMES.violet}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <CardLabel icon={BarChart3}>Graphique historique</CardLabel>
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
            </div>

            {seriesMeta?.firstTradeDate && (
              <p className="text-[11px] text-slate-600 mb-2">
                Première cotation connue : {formatFullDate(seriesMeta.firstTradeDate)}
                {totalReturnSinceStart != null && (
                  <> · Performance sur la période affichée : <span className={totalReturnSinceStart >= 0 ? "text-emerald-400" : "text-rose-400"}>{pct(totalReturnSinceStart)}</span></>
                )}
              </p>
            )}

            {historyLoading ? (
              <div className="h-96 flex items-center justify-center text-sm text-slate-500">Chargement de l'historique…</div>
            ) : historyError ? (
              <EmptyState>{historyError}</EmptyState>
            ) : chartData.length < 2 ? (
              <EmptyState>Historique insuffisant pour cette valeur sur la période sélectionnée.</EmptyState>
            ) : (
              <>
                <div className="h-80 mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ left: 0, right: 10, top: 10 }}>
                      <defs>
                        <linearGradient id="marcheCloseFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => formatDateForRange(d, range)} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={60} />
                      <YAxis domain={["auto", "auto"]} tickFormatter={(v) => formatCompact(v)} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                      <Tooltip content={<ChartTooltip currency={profile?.currency} />} />
                      {profile?.fiftyTwoWeekHigh != null && (
                        <ReferenceLine y={profile.fiftyTwoWeekHigh} stroke="#34d399" strokeDasharray="3 3" strokeOpacity={0.4} />
                      )}
                      {profile?.fiftyTwoWeekLow != null && (
                        <ReferenceLine y={profile.fiftyTwoWeekLow} stroke="#fb7185" strokeDasharray="3 3" strokeOpacity={0.4} />
                      )}
                      <Area type="monotone" dataKey="close" name="Cours de clôture" stroke="#a78bfa" strokeWidth={2} fill="url(#marcheCloseFill)" isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Volume */}
                <div className="h-20 mt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ left: 0, right: 10, top: 0 }}>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={[0, "auto"]} />
                      <Tooltip content={<ChartTooltip currency={profile?.currency} />} />
                      <Bar dataKey="volume" name="Volume" fill="#475569" radius={[1, 1, 0, 0]} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-600 mt-1">Volume échangé par période</p>
              </>
            )}
          </Card>

          {/* ─── Repère 52 semaines ─── */}
          {profile && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={Target}>Position dans la fourchette annuelle</CardLabel>
              <div className="mt-3">
                <FiftyTwoWeekGauge low={profile.fiftyTwoWeekLow} high={profile.fiftyTwoWeekHigh} current={profile.currentPrice} currency={profile.currency} />
              </div>
            </Card>
          )}

          {/* ─── Ratios clés ─── */}
          {profile && (
            <Card accent={CARD_THEMES.violet}>
              <CardLabel icon={Scale}>Valorisation &amp; rentabilité</CardLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
                <StatCell icon={BarChart3} label="Capitalisation" value={formatCompact(profile.marketCap, profile.currency)} />
                <StatCell icon={Percent} label="PER (résultats passés)" value={profile.peRatio != null ? profile.peRatio.toFixed(1) : "—"} />
                <StatCell icon={Percent} label="PER prévisionnel" value={profile.forwardPE != null ? profile.forwardPE.toFixed(1) : "—"} />
                <StatCell icon={Scale} label="Bêta" value={profile.beta != null ? profile.beta.toFixed(2) : "—"} sub="Sensibilité au marché" />
                <StatCell icon={Percent} label="Rendement du dividende" value={profile.dividendYield != null ? pctPlain(profile.dividendYield * 100, 2) : "—"} />
                <StatCell icon={Percent} label="Marge nette" value={profile.profitMargin != null ? pctPlain(profile.profitMargin * 100, 1) : "—"} />
                <StatCell icon={TrendingUp} label="Croissance du CA" value={profile.revenueGrowth != null ? pct(profile.revenueGrowth * 100, 1) : "—"} />
                <StatCell icon={Percent} label="Rentabilité des capitaux (ROE)" value={profile.returnOnEquity != null ? pctPlain(profile.returnOnEquity * 100, 1) : "—"} />
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

          {/* ─── Fiche entreprise / activité ─── */}
          <Card accent={CARD_THEMES.violet}>
            <CardLabel icon={Building2}>Fiche entreprise &amp; activité</CardLabel>
            {profileLoading ? (
              <p className="text-sm text-slate-500 mt-2">Chargement…</p>
            ) : profileError ? (
              <EmptyState>{profileError}</EmptyState>
            ) : profile ? (
              <div className="mt-2 space-y-4">
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
    </div>
  );
}
