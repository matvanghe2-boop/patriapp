import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, X, RefreshCw, Percent, TrendingUp, TrendingDown,
  Landmark, PiggyBank, LineChart, ScrollText, CalendarClock, WifiOff, BadgeCheck,
} from "lucide-react";
import { Card, CardLabel, EmptyState, CARD_THEMES, SkeletonCard } from "./ui";
import { fetchRates } from "../lib/api";
import {
  RATES_CATALOG, RATE_CATEGORIES, searchRates, groupByCategory,
  bestSavingsRate, nextUpcomingReview, findOfficialRateFor,
} from "../lib/ratesCatalog";

// Chaque catégorie de taux reprend une teinte de carte déjà utilisée
// ailleurs dans l'app, pour ne pas introduire de nouvelle palette.
const CATEGORY_THEME = {
  epargne: "emerald",
  credit: "rose",
  marche: "violet",
  inflation: "amber",
  fiscalite: "cyan",
};

const CATEGORY_ICON = {
  epargne: PiggyBank,
  credit: Landmark,
  marche: LineChart,
  inflation: TrendingUp,
  fiscalite: ScrollText,
};

// Tailwind ne génère que les classes qu'il peut repérer statiquement dans le
// code source : une classe reconstruite par interpolation (`bg-${theme}-400`)
// n'est jamais détectée par son analyseur et disparaît silencieusement du CSS
// final. On passe donc par une table de classes complètes et littérales,
// comme le fait déjà NAV_THEMES/GHOST_THEMES dans ui.jsx.
const THEME_CLASSES = {
  emerald: { iconWrap: "bg-emerald-400/10 text-emerald-300", value: "text-emerald-300" },
  indigo: { iconWrap: "bg-indigo-400/10 text-indigo-300", value: "text-indigo-300" },
  violet: { iconWrap: "bg-violet-400/10 text-violet-300", value: "text-violet-300" },
  amber: { iconWrap: "bg-amber-400/10 text-amber-300", value: "text-amber-300" },
  rose: { iconWrap: "bg-rose-400/10 text-rose-300", value: "text-rose-300" },
  cyan: { iconWrap: "bg-cyan-400/10 text-cyan-300", value: "text-cyan-300" },
};

function formatDateFr(iso) {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatValue(rate) {
  const digits = Math.abs(rate.value) >= 10 ? 2 : 2;
  return `${rate.value.toFixed(digits)}`.replace(/\.00$/, "").replace(".", ",");
}

/** Nombre de jours jusqu'à une date ISO, ou null. */
function daysUntil(iso, from = new Date()) {
  if (!iso) return null;
  const d = Math.ceil((new Date(`${iso}T00:00:00`) - from) / 86_400_000);
  return d >= 0 ? d : null;
}

// ─── Carte KPI compacte ──────────────────────────────────────────────────────
function KpiCard({ icon: Icon, theme, label, value, sub }) {
  const t = THEME_CLASSES[theme] || THEME_CLASSES.indigo;
  return (
    <Card accent={CARD_THEMES[theme]} className="flex items-center gap-3">
      <div className={`rounded-full p-2.5 shrink-0 ${t.iconWrap}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
        <div className="font-display text-lg text-slate-50 truncate">{value}</div>
        {sub && <div className="text-[11px] text-slate-600 truncate">{sub}</div>}
      </div>
    </Card>
  );
}

// ─── Comparaison avec les livrets de l'utilisateur ──────────────────────────
/**
 * Pour chaque livret réel de l'utilisateur, retrouve le taux officiel
 * correspondant (si c'est un support réglementé identifiable) et signale un
 * écart — utile si l'utilisateur a oublié de mettre à jour son taux après
 * une révision officielle, ou si sa banque propose une offre boostée.
 */
function useLivretComparisons(livrets, catalog) {
  return useMemo(() => {
    return (livrets || [])
      .map((l) => {
        const official = findOfficialRateFor(l.name, catalog);
        if (!official) return null;
        const userRatePct = l.rate * 100;
        const diff = userRatePct - official.value;
        return { livret: l, official, userRatePct, diff };
      })
      .filter(Boolean);
  }, [livrets, catalog]);
}

function ComparisonBadge({ diff }) {
  if (Math.abs(diff) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-400/10 border border-emerald-400/25 rounded-full px-2 py-0.5">
        <BadgeCheck size={10} /> À jour
      </span>
    );
  }
  const up = diff > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 border ${
        up ? "text-amber-300 bg-amber-400/10 border-amber-400/25" : "text-rose-300 bg-rose-400/10 border-rose-400/25"
      }`}
    >
      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {up ? "+" : ""}
      {diff.toFixed(2)} pt vs officiel
    </span>
  );
}

// ─── Carte de taux ───────────────────────────────────────────────────────────
function RateCard({ rate, matches }) {
  const theme = CATEGORY_THEME[rate.category] || "indigo";
  const t = THEME_CLASSES[theme] || THEME_CLASSES.indigo;
  const days = daysUntil(rate.nextReview);

  return (
    <Card accent={CARD_THEMES[theme]} className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100 leading-snug">{rate.label}</div>
          {rate.condition && <div className="text-[11px] text-slate-500 mt-0.5">{rate.condition}</div>}
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border ${
            rate.live
              ? "text-emerald-300 bg-emerald-400/10 border-emerald-400/30"
              : "text-slate-500 bg-slate-800/60 border-slate-700"
          }`}
          title={rate.live ? "Valeur récupérée en direct depuis Webstat" : "Valeur de référence maintenue manuellement"}
        >
          {rate.live ? <RefreshCw size={9} /> : <WifiOff size={9} />}
          {rate.live ? "Live" : "Référence"}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`font-display text-2xl ${t.value}`}>{formatValue(rate)}</span>
        <span className="text-xs text-slate-500">{rate.unit}</span>
      </div>
      {rate.netValue != null && (
        <div className="text-[11px] text-slate-500 -mt-1.5">soit ≈ {rate.netValue.toFixed(2)} % net après flat tax</div>
      )}

      {matches.map((m) => (
        <div key={m.livret.id} className="flex items-center justify-between text-xs bg-slate-950/50 border border-slate-800 rounded-lg px-2.5 py-1.5">
          <span className="text-slate-400 truncate">
            Ton « {m.livret.name} » : <span className="font-data tabular-nums text-slate-200">{m.userRatePct.toFixed(2)} %</span>
          </span>
          <ComparisonBadge diff={m.diff} />
        </div>
      ))}

      <p className="text-[11px] text-slate-500 leading-relaxed">{rate.description}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600 pt-1 border-t border-slate-800/70">
        <span>Au {formatDateFr(rate.effectiveDate)}</span>
        {rate.plafond && <span>Plafond {rate.plafond.toLocaleString("fr-FR")} €</span>}
        {days != null && (
          <span className="flex items-center gap-1">
            <CalendarClock size={10} />
            Révision dans {days} j
          </span>
        )}
        <span className="ml-auto italic truncate max-w-[50%]" title={rate.source}>
          {rate.source}
        </span>
      </div>
    </Card>
  );
}

// ─── Filtres par catégorie ───────────────────────────────────────────────────
function CategoryFilters({ active, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(RATE_CATEGORIES).map(([key, cat]) => {
        const Icon = CATEGORY_ICON[key];
        const isActive = active[key] !== false;
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            aria-pressed={isActive}
            className="flex items-center gap-1.5 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 border transition-colors"
            style={{
              color: isActive ? cat.color : "#64748b",
              borderColor: isActive ? `${cat.color}55` : "#1e293b",
              background: isActive ? `${cat.color}14` : "transparent",
            }}
          >
            <Icon size={12} />
            {cat.short}
          </button>
        );
      })}
    </div>
  );
}

// ─── Composant principal ────────────────────────────────────────────────────
/**
 * Sous-onglet "Taux" de Livrets & Épargne : barème centralisé des taux
 * réglementés, de crédit, de marché et de fiscalité, avec recherche et
 * comparaison directe aux livrets réellement détenus par l'utilisateur.
 *
 * La source de vérité est le catalogue de référence embarqué
 * (src/lib/ratesCatalog.js), maintenu à la main avec dates et sources
 * citées. `/api/rates` tente de le rafraîchir en direct pour les quelques
 * séries Webstat confirmées si une clé serveur est configurée ; en cas
 * d'échec réseau total (API indisponible), ce composant retombe sur le
 * catalogue local importé directement — jamais d'onglet vide.
 */
export default function RatesHub({ livrets = [] }) {
  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState({});
  const [rates, setRates] = useState(RATES_CATALOG.map((r) => ({ ...r, live: false })));
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRates();
      setRates(data.rates);
      setLiveEnabled(!!data.liveEnabled);
      setUsingFallback(false);
      setLastSync(new Date());
    } catch {
      // L'API est inaccessible (hors-ligne, fonction serverless non démarrée
      // en dev sans `vercel dev`...) : le catalogue de référence local reste
      // affiché plutôt que de vider l'onglet.
      setRates(RATES_CATALOG.map((r) => ({ ...r, live: false })));
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleCategory = (key) => setActiveCategories((s) => ({ ...s, [key]: s[key] === false ? true : false }));

  const comparisons = useLivretComparisons(livrets, rates);
  const comparisonsByRateId = useMemo(() => {
    const map = {};
    comparisons.forEach((c) => {
      (map[c.official.id] ||= []).push(c);
    });
    return map;
  }, [comparisons]);

  const filtered = useMemo(() => {
    const bySearch = searchRates(query, rates);
    return bySearch.filter((r) => activeCategories[r.category] !== false);
  }, [query, rates, activeCategories]);

  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);

  const best = useMemo(() => bestSavingsRate(rates), [rates]);
  const livretA = rates.find((r) => r.id === "livret-a");
  const upcoming = useMemo(() => nextUpcomingReview(rates), [rates]);
  const mismatches = comparisons.filter((c) => Math.abs(c.diff) >= 0.05);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-xl text-slate-50">
            Baromètre des <span className="text-indigo-400">taux</span>
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Épargne réglementée, crédit, banques centrales, inflation et fiscalité — au même endroit.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-indigo-300 disabled:opacity-40 border border-slate-700 hover:border-indigo-400/40 rounded-lg px-3 py-1.5 transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      {usingFallback && (
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-400/5 border border-amber-400/25 rounded-xl px-3 py-2">
          <WifiOff size={13} className="shrink-0" />
          Catalogue de référence hors-ligne affiché (API indisponible) — les valeurs restent celles maintenues manuellement, sans rafraîchissement en direct.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {best && (
          <KpiCard
            icon={PiggyBank}
            theme="emerald"
            label="Meilleur taux réglementé"
            value={`${formatValue(best)} %`}
            sub={best.label}
          />
        )}
        {livretA && (
          <KpiCard
            icon={Percent}
            theme="indigo"
            label="Livret A en vigueur"
            value={`${formatValue(livretA)} %`}
            sub={`Depuis le ${formatDateFr(livretA.effectiveDate)}`}
          />
        )}
        <KpiCard
          icon={mismatches.length > 0 ? TrendingDown : BadgeCheck}
          theme={mismatches.length > 0 ? "amber" : "emerald"}
          label="Écart avec mes livrets"
          value={livrets.length === 0 ? "—" : mismatches.length === 0 ? "Tout est à jour" : `${mismatches.length} à vérifier`}
          sub={livrets.length === 0 ? "Aucun livret enregistré" : `${comparisons.length} support(s) reconnu(s)`}
        />
        {upcoming && (
          <KpiCard
            icon={CalendarClock}
            theme="violet"
            label="Prochaine révision connue"
            value={`Dans ${upcoming.daysUntil} j`}
            sub={upcoming.label}
          />
        )}
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un taux : Livret A, taux d'usure, inflation, BCE..."
          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-400/60"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Effacer la recherche"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Filtres catégorie */}
      <CategoryFilters active={activeCategories} onToggle={toggleCategory} />

      {/* Résultats */}
      {loading && rates.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState>Aucun taux ne correspond à « {query} ». Essaie un autre mot-clé ou une autre catégorie.</EmptyState>
      ) : (
        <div className="space-y-6">
          {grouped.map(([key, items]) => {
            const cat = RATE_CATEGORIES[key];
            const Icon = CATEGORY_ICON[key];
            return (
              <div key={key}>
                <CardLabel icon={Icon}>{cat.label}</CardLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((rate) => (
                    <RateCard key={rate.id} rate={rate} matches={comparisonsByRateId[rate.id] || []} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lastSync && (
        <p className="text-[10px] text-slate-600">
          Dernière synchronisation : {lastSync.toLocaleTimeString("fr-FR")}
          {liveEnabled ? " · rafraîchissement live actif pour les séries disponibles" : " · rafraîchissement live non configuré (voir README)"}.
        </p>
      )}
    </div>
  );
}
