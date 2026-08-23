import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CalendarDays, List, ChevronLeft, ChevronRight, RefreshCw, CircleDollarSign,
  FileBarChart, Users, X, Briefcase, Eye, Megaphone, BarChart3,
} from "lucide-react";
import { fetchCalendarEvents } from "../lib/api";
import { todayIso } from "../lib/finance";
import { SkeletonChart } from "./ui";
import Modal from "./Modal";

// ─── Types d'événements ─────────────────────────────────────────────────────
// Code couleur demandé : vert pour les dividendes, bleu pour tout ce qui
// touche aux résultats et au chiffre d'affaires, violet pour les assemblées
// générales. Les teintes restent très saturées pour garder le contraste du
// calendrier sur fond noir.
const EVENT_TYPES = {
  Dividende: { color: "#00FF6A", glow: "rgba(0,255,106,0.35)", icon: CircleDollarSign },
  Résultats: { color: "#2E9BFF", glow: "rgba(46,155,255,0.35)", icon: FileBarChart },
  "Chiffre d'affaires": { color: "#38D6FF", glow: "rgba(56,214,255,0.35)", icon: BarChart3 },
  "Assemblée Générale": { color: "#A855F7", glow: "rgba(168,85,247,0.38)", icon: Users },
  Communication: { color: "#94A3B8", glow: "rgba(148,163,184,0.30)", icon: Megaphone },
};

const typeOf = (type) => EVENT_TYPES[type] || EVENT_TYPES.Communication;

// ─── Origine d'un événement ─────────────────────────────────────────────────
// Une ligne réellement détenue et une simple valeur surveillée n'ont pas la
// même importance : le portefeuille est mis en surbrillance franche (fond
// coloré, bordure pleine, halo, texte blanc), la watchlist reste volontairement
// neutre (contour gris, aucun fond, aucun halo). L'écart doit se voir en un
// coup d'œil, sans avoir à lire les pastilles.
const SOURCES = {
  portefeuille: {
    label: "Portefeuille",
    icon: Briefcase,
    chipClass: "font-bold",
    cardClass: "bg-[#0a0a0a]",
  },
  watchlist: {
    label: "Watchlist",
    icon: Eye,
    chipClass: "font-medium opacity-80",
    cardClass: "bg-[#070707]",
  },
};

// Gris neutres réservés à la watchlist : aucune teinte du type d'événement ne
// vient les colorer, c'est ce qui crée le contraste avec le portefeuille.
const NEUTRAL = { border: "#2e2e2e", text: "#8a8a8a", bg: "#0d0d0d" };

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const isoToday = () => todayIso();

function formatDateFr(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Montants d'estimation : Yahoo renvoie des unités brutes (ex: 2.7e10). */
function formatEstimate(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)} Md€`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)} M€`;
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Lundi = premier jour de la grille (convention FR)
function firstWeekdayOffset(year, month) {
  const jsDay = new Date(year, month, 1).getDay(); // 0 = dimanche
  return (jsDay + 6) % 7; // 0 = lundi
}

function EventDot({ type }) {
  const t = typeOf(type);
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: t.color, boxShadow: `0 0 6px ${t.glow}` }}
    />
  );
}

// Badge affiché DANS une case du calendrier : montre le texte de l'événement
// (ticker + type abrégé), cliquable pour ouvrir le détail complet.
//   • Portefeuille : fond coloré, bordure pleine épaisse, halo, texte blanc gras.
//   • Watchlist    : aucun fond, contour gris neutre, texte gris — seule une
//                    micro-pastille rappelle la couleur du type d'événement.
function EventChip({ ev, onClick }) {
  const t = typeOf(ev.type);
  const Icon = t.icon;
  const isPortfolio = ev.source === "portefeuille";
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(ev); }}
      className={`w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-[9px] sm:text-[10px] leading-tight truncate transition-transform hover:scale-[1.04] ${
        isPortfolio ? "font-extrabold" : "font-medium"
      }`}
      style={
        isPortfolio
          ? {
              background: `linear-gradient(90deg, ${t.color}4D, ${t.color}1F)`,
              border: `1.5px solid ${t.color}`,
              color: "#ffffff",
              boxShadow: `0 0 10px ${t.glow}`,
            }
          : {
              background: "transparent",
              border: `1px solid ${NEUTRAL.border}`,
              color: NEUTRAL.text,
              boxShadow: "none",
            }
      }
      title={`${ev.ticker} — ${ev.label} (${SOURCES[ev.source]?.label ?? ""})`}
    >
      {isPortfolio ? (
        <Icon size={9} strokeWidth={3} className="shrink-0" style={{ color: t.color }} />
      ) : (
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: `${t.color}70` }} />
      )}
      <span className="truncate">{ev.ticker}</span>
    </button>
  );
}

/** Pastille « Portefeuille » / « Watchlist ». */
function SourceBadge({ source, size = "sm" }) {
  const s = SOURCES[source] || SOURCES.watchlist;
  const Icon = s.icon;
  const isPortfolio = source === "portefeuille";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded uppercase tracking-wide ${
        size === "sm" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"
      } ${isPortfolio ? "font-black text-black bg-white border border-white" : "font-medium text-[#8a8a8a] border border-[#2e2e2e]"}`}
    >
      <Icon size={size === "sm" ? 9 : 11} strokeWidth={2.5} />
      {s.label}
    </span>
  );
}

/** Rappel du code visuel des deux origines, sous les filtres. */
function SourceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#777] mb-4">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block w-6 h-3 rounded"
          style={{ background: "linear-gradient(90deg,#ffffff40,#ffffff14)", border: "1.5px solid #fff", boxShadow: "0 0 8px rgba(255,255,255,0.35)" }}
        />
        Détenu en portefeuille — surligné et coloré
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-6 h-3 rounded" style={{ border: `1px solid ${NEUTRAL.border}` }} />
        Simplement en watchlist — contour neutre
      </span>
    </div>
  );
}

// ─── Modal de détail d'un événement ─────────────────────────────────────────
function EventModal({ ev, onClose }) {
  if (!ev) return null;
  const t = typeOf(ev.type);
  const Icon = t.icon;
  const isPortfolio = ev.source === "portefeuille";
  const today = isoToday();
  const d = new Date(`${ev.date}T00:00:00`);
  const todayD = new Date(`${today}T00:00:00`);
  const daysLeft = Math.round((d - todayD) / (1000 * 60 * 60 * 24));
  const ca = formatEstimate(ev.estimates?.chiffreAffairesAttendu);
  const bnpa = formatEstimate(ev.estimates?.beneficeAttendu);

  return (
    <Modal
      open
      onClose={onClose}
      label={`${ev.ticker} — ${ev.label}`}
      overlayClassName="bg-black/80"
      panelClassName="w-full max-w-sm rounded-2xl border bg-black"
      style={
        isPortfolio
          ? { borderColor: t.color, borderWidth: 1.5, boxShadow: `0 0 40px ${t.glow}` }
          : { borderColor: NEUTRAL.border, boxShadow: "none" }
      }
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full shrink-0"
            style={{
              background: isPortfolio ? `${t.color}26` : NEUTRAL.bg,
              border: `1.5px solid ${isPortfolio ? t.color : NEUTRAL.border}`,
              boxShadow: isPortfolio ? `0 0 14px ${t.glow}` : "none",
            }}
          >
            <Icon size={22} style={{ color: isPortfolio ? t.color : NEUTRAL.text }} strokeWidth={2.5} />
          </div>
          <button onClick={onClose} className="text-[#888] hover:text-white transition-colors" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
            style={{ background: `${t.color}22`, color: t.color }}
          >
            {ev.type}
          </span>
          <SourceBadge source={ev.source} size="md" />
        </div>

        <h3 className="text-xl font-bold text-white mb-0.5">{ev.ticker}</h3>
        <p className="text-sm text-[#999] mb-4">{ev.name}</p>

        <div className="rounded-xl border border-[#222] bg-[#0a0a0a] p-3 mb-2">
          <div className="text-[11px] text-[#888] mb-0.5">Événement</div>
          <div className="text-sm text-white font-semibold">{ev.label}</div>
        </div>

        {(ca || bnpa) && (
          <div className="rounded-xl border border-[#222] bg-[#0a0a0a] p-3 mb-2">
            <div className="text-[11px] text-[#888] mb-1.5">Attentes du consensus</div>
            <div className="flex items-center justify-between gap-3">
              {ca && (
                <div>
                  <div className="text-[10px] text-[#777]">Chiffre d'affaires</div>
                  <div className="font-data text-sm text-white font-bold">{ca}</div>
                </div>
              )}
              {bnpa && (
                <div className="text-right">
                  <div className="text-[10px] text-[#777]">Bénéfice par action</div>
                  <div className="font-data text-sm text-white font-bold">{bnpa}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border border-[#222] bg-[#0a0a0a] p-3">
          <div>
            <div className="text-[11px] text-[#888] mb-0.5">Date</div>
            <div className="font-data text-base text-white font-bold">{formatDateFr(ev.date)}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-[#888] mb-0.5">Échéance</div>
            <div className="font-data text-sm font-bold" style={{ color: t.color }}>
              {daysLeft === 0 ? "Aujourd'hui" : daysLeft === 1 ? "Demain" : daysLeft > 0 ? `Dans ${daysLeft} j` : `Il y a ${-daysLeft} j`}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Vue grille mensuelle ───────────────────────────────────────────────────
function MonthGrid({ year, month, eventsByDate, onMonthChange, onEventClick }) {
  const total = daysInMonth(year, month);
  const offset = firstWeekdayOffset(year, month);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = isoToday();
  const MAX_VISIBLE = 3;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onMonthChange(-1)}
          className="p-1.5 rounded-lg border border-[#333] hover:border-white text-white transition-colors"
          aria-label="Mois précédent"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="font-bold text-base tracking-wide text-white">
          {MONTH_NAMES[month]} {year}
        </div>
        <button
          onClick={() => onMonthChange(1)}
          className="p-1.5 rounded-lg border border-[#333] hover:border-white text-white transition-colors"
          aria-label="Mois suivant"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] uppercase tracking-wider text-[#888] font-semibold py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="min-h-[64px] sm:min-h-[92px]" />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dayEvents = eventsByDate[iso] || [];
          const isToday = iso === today;
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const hiddenCount = dayEvents.length - visible.length;
          // Un jour qui contient au moins une ligne détenue est lui-même mis en
          // avant : on repère les échéances qui comptent vraiment sans lire
          // chaque pastille.
          const hasPortfolio = dayEvents.some((ev) => ev.source === "portefeuille");
          return (
            <div
              key={i}
              className={`min-h-[64px] sm:min-h-[92px] rounded-lg p-1 flex flex-col gap-0.5 border overflow-hidden ${
                isToday
                  ? "border-white bg-white/[0.06]"
                  : hasPortfolio
                  ? "border-[#3d3d3d] bg-[#131313]"
                  : "border-[#1a1a1a] bg-[#0a0a0a]"
              }`}
            >
              <div className={`text-[11px] font-data ${isToday ? "text-white font-bold" : hasPortfolio ? "text-[#ddd] font-semibold" : "text-[#999]"}`}>{d}</div>
              <div className="flex flex-col gap-0.5 flex-1 min-h-0">
                {visible.map((ev, idx) => (
                  <EventChip key={idx} ev={ev} onClick={onEventClick} />
                ))}
                {hiddenCount > 0 && (
                  <span className="text-[9px] text-[#888] font-data px-1">+{hiddenCount} autre{hiddenCount > 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Vue Timeline : prochains événements ────────────────────────────────────
function TimelineView({ events, onEventClick }) {
  const today = isoToday();
  const upcoming = useMemo(
    () =>
      events
        .filter((e) => e.date >= today)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(0, 12),
    [events, today]
  );

  if (upcoming.length === 0) {
    return (
      <p className="text-sm text-[#888] py-8 text-center border border-dashed border-[#2a2a2a] rounded-xl">
        Aucun événement à venir détecté pour les valeurs suivies.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {upcoming.map((ev, idx) => {
        const t = typeOf(ev.type);
        const Icon = t.icon;
        const isPortfolio = ev.source === "portefeuille";
        const d = new Date(`${ev.date}T00:00:00`);
        const todayD = new Date(`${today}T00:00:00`);
        const daysLeft = Math.round((d - todayD) / (1000 * 60 * 60 * 24));
        return (
          <button
            key={idx}
            onClick={() => onEventClick(ev)}
            className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-[#141414] ${
              SOURCES[ev.source]?.cardClass ?? "bg-[#0a0a0a]"
            }`}
            style={{
              // Ligne détenue : bordure pleine colorée, épaisse à gauche, fond
              // teinté et halo. Valeur surveillée : contour gris neutre, aucun
              // fond, aucun halo — elle ne doit pas rivaliser visuellement avec
              // une position réellement détenue.
              borderColor: isPortfolio ? t.color : NEUTRAL.border,
              borderWidth: isPortfolio ? 1.5 : 1,
              borderLeftWidth: isPortfolio ? 5 : 1,
              background: isPortfolio ? `linear-gradient(90deg, ${t.color}1F, transparent 55%)` : undefined,
              boxShadow: isPortfolio ? `0 0 18px ${t.glow}` : "none",
            }}
          >
            <div
              className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
              style={{
                background: isPortfolio ? `${t.color}26` : NEUTRAL.bg,
                border: `1.5px solid ${isPortfolio ? t.color : NEUTRAL.border}`,
                boxShadow: isPortfolio ? `0 0 12px ${t.glow}` : "none",
              }}
            >
              <Icon size={18} style={{ color: isPortfolio ? t.color : NEUTRAL.text }} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm ${isPortfolio ? "font-extrabold text-white" : "font-medium text-[#9a9a9a]"}`}>
                  {ev.ticker}
                </span>
                <span
                  className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={
                    isPortfolio
                      ? { background: `${t.color}2E`, color: t.color, border: `1px solid ${t.color}80`, fontWeight: 800 }
                      : { background: "transparent", color: NEUTRAL.text, border: `1px solid ${NEUTRAL.border}`, fontWeight: 500 }
                  }
                >
                  {ev.type}
                </span>
                <SourceBadge source={ev.source} />
              </div>
              <div className={`text-xs truncate ${isPortfolio ? "text-[#bbb]" : "text-[#6f6f6f]"}`}>{ev.name} · {ev.label}</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`font-data text-sm ${isPortfolio ? "text-white font-bold" : "text-[#9a9a9a] font-medium"}`}>
                {formatDateFr(ev.date)}
              </div>
              <div className={`text-[10px] font-data ${isPortfolio ? "text-[#aaa]" : "text-[#6f6f6f]"}`}>
                {daysLeft === 0 ? "Aujourd'hui" : daysLeft === 1 ? "Demain" : `Dans ${daysLeft} j`}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Bouton de filtre par origine (portefeuille / watchlist). */
function SourceFilter({ source, active, count, onToggle }) {
  const s = SOURCES[source];
  const Icon = s.icon;
  const isPortfolio = source === "portefeuille";
  const activeClass = isPortfolio
    ? "border-white bg-white text-black font-bold"
    : "border-[#4a4a4a] text-[#ddd] bg-transparent";
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
        active ? activeClass : "border-[#2a2a2a] text-[#666] hover:text-[#999]"
      }`}
    >
      <Icon size={11} strokeWidth={2.5} />
      {s.label}
      <span className="font-data opacity-70">{count}</span>
    </button>
  );
}

// ─── Composant principal ────────────────────────────────────────────────────
/**
 * Calendrier financier mode sombre, alimenté automatiquement par les tickers
 * du portefeuille ET ceux de la watchlist, via l'API Yahoo Finance
 * (v7/finance/quote + v10/quoteSummary, authentifiés côté serveur).
 * Se ré-actualise dès que la liste des tickers change.
 *
 * Deux niveaux de lecture volontairement distincts :
 *   - les lignes réellement détenues ressortent (bordure pleine + halo coloré) ;
 *   - les valeurs seulement surveillées restent sobres (bordure discontinue,
 *     couleurs atténuées), pour ne pas détourner l'attention des vrais actifs.
 *
 * positions : [{ ticker, name }, ...]  — lignes du portefeuille
 * watchlist : [{ ticker, name }, ...]  — valeurs surveillées
 */
export default function FinancialCalendar({ positions = [], watchlist = [] }) {
  const [view, setView] = useState("grid"); // "grid" | "timeline"
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [visibleSources, setVisibleSources] = useState({ portefeuille: true, watchlist: true });
  const [visibleTypes, setVisibleTypes] = useState(() =>
    Object.fromEntries(Object.keys(EVENT_TYPES).map((k) => [k, true]))
  );

  // Un même titre peut être à la fois détenu et surveillé : le portefeuille
  // l'emporte, sinon la ligne s'afficherait en sobre alors qu'elle est détenue.
  const sourceByTicker = useMemo(() => {
    const map = {};
    watchlist.forEach((w) => { if (w.ticker) map[w.ticker] = "watchlist"; });
    positions.forEach((p) => { if (p.ticker) map[p.ticker] = "portefeuille"; });
    return map;
  }, [positions, watchlist]);

  const tickers = useMemo(() => Object.keys(sourceByTicker), [sourceByTicker]);
  const tickersKey = tickers.join(",");

  const load = useCallback(async () => {
    if (tickers.length === 0) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const results = await fetchCalendarEvents(tickers);
      const merged = results.flatMap((r) =>
        r.ok ? r.events.map((ev) => ({ ...ev, source: sourceByTicker[ev.ticker] || "watchlist" })) : []
      );
      setEvents(merged);
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) setError(`${failed} valeur(s) sur ${results.length} sans calendrier disponible.`);
      setLastSync(new Date());
    } catch {
      setError("Calendrier indisponible — vérifie ta connexion internet.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  // Se relance automatiquement dès que la composition du portefeuille ou de
  // la watchlist change.
  useEffect(() => {
    // Effet de CHARGEMENT : `load` interroge le réseau et gère lui-même son
    // témoin de chargement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      portefeuille: events.filter((e) => e.source === "portefeuille").length,
      watchlist: events.filter((e) => e.source === "watchlist").length,
    }),
    [events]
  );

  const filteredEvents = useMemo(
    () => events.filter((e) => visibleSources[e.source] !== false && visibleTypes[e.type] !== false),
    [events, visibleSources, visibleTypes]
  );

  const eventsByDate = useMemo(() => {
    const map = {};
    // Les lignes détenues passent devant dans une case chargée : ce sont
    // elles qui doivent rester visibles quand le jour est tronqué à 3 chips.
    [...filteredEvents]
      .sort((a, b) => (a.source === b.source ? 0 : a.source === "portefeuille" ? -1 : 1))
      .forEach((ev) => {
        if (!map[ev.date]) map[ev.date] = [];
        map[ev.date].push(ev);
      });
    return map;
  }, [filteredEvents]);

  const changeMonth = (delta) => {
    setCursor((c) => {
      let month = c.month + delta;
      let year = c.year;
      if (month < 0) { month = 11; year -= 1; }
      if (month > 11) { month = 0; year += 1; }
      return { year, month };
    });
  };

  const toggleSource = (key) => setVisibleSources((s) => ({ ...s, [key]: !s[key] }));
  const toggleType = (key) => setVisibleTypes((t) => ({ ...t, [key]: !t[key] }));

  // Skeleton uniquement au tout premier chargement (aucun événement encore connu) —
  // les actualisations suivantes gardent l'affichage existant pendant le refetch.
  const isInitialLoad = loading && events.length === 0 && tickers.length > 0;

  return (
    <div className="rounded-2xl border border-[#1a1a1a] bg-black p-5 text-white">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-white" />
          <h2 className="font-bold text-base">Calendrier financier</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[#333] overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === "grid" ? "bg-white text-black" : "bg-black text-[#999] hover:text-white"
              }`}
            >
              <CalendarDays size={13} /> Mois
            </button>
            <button
              onClick={() => setView("timeline")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === "timeline" ? "bg-white text-black" : "bg-black text-[#999] hover:text-white"
              }`}
            >
              <List size={13} /> Timeline
            </button>
          </div>
          <button
            onClick={load}
            disabled={loading || tickers.length === 0}
            className="flex items-center gap-1.5 text-xs font-medium text-white disabled:opacity-30 disabled:cursor-not-allowed border border-[#333] hover:border-white rounded-lg px-3 py-1.5 transition-colors"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {loading ? "Sync..." : "Actualiser"}
          </button>
        </div>
      </div>

      {/* Filtres par origine — portefeuille mis en avant, watchlist en retrait */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <SourceFilter
          source="portefeuille"
          active={visibleSources.portefeuille}
          count={counts.portefeuille}
          onToggle={() => toggleSource("portefeuille")}
        />
        <SourceFilter
          source="watchlist"
          active={visibleSources.watchlist}
          count={counts.watchlist}
          onToggle={() => toggleSource("watchlist")}
        />
      </div>

      <SourceLegend />

      {/* Légende / filtres par type d'événement */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(EVENT_TYPES).map(([type, t]) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            aria-pressed={visibleTypes[type]}
            className="flex items-center gap-1.5 text-[11px] font-semibold rounded-lg px-2 py-1 border transition-colors"
            style={{
              color: visibleTypes[type] ? t.color : "#555",
              borderColor: visibleTypes[type] ? `${t.color}55` : "#222",
              background: visibleTypes[type] ? `${t.color}12` : "transparent",
            }}
          >
            <EventDot type={type} />
            {type}
          </button>
        ))}
      </div>

      {tickers.length === 0 ? (
        <p className="text-sm text-[#888] py-8 text-center border border-dashed border-[#2a2a2a] rounded-xl">
          Ajoute des positions à ton portefeuille ou des valeurs à ta watchlist pour voir apparaître
          leurs événements.
        </p>
      ) : isInitialLoad ? (
        <SkeletonChart height={280} />
      ) : error && events.length === 0 ? (
        <p className="text-sm text-[#ff5c5c] py-8 text-center border border-dashed border-[#2a2a2a] rounded-xl">
          {error}
        </p>
      ) : view === "grid" ? (
        <MonthGrid year={cursor.year} month={cursor.month} eventsByDate={eventsByDate} onMonthChange={changeMonth} onEventClick={setSelectedEvent} />
      ) : (
        <TimelineView events={filteredEvents} onEventClick={setSelectedEvent} />
      )}

      {error && events.length > 0 && <p className="text-[11px] text-[#ffb020] mt-3">{error}</p>}
      {lastSync && (
        <p className="text-[10px] text-[#666] mt-3">
          Dernière synchro : {lastSync.toLocaleTimeString("fr-FR")} · {positions.length} ligne(s) en
          portefeuille et {watchlist.length} valeur(s) surveillée(s) suivies automatiquement.
        </p>
      )}
      <p className="text-[10px] text-[#555] mt-1">
        Source : Yahoo Finance. Les dates d'assemblée générale ne sont publiées par aucun endpoint
        Yahoo public : aucune n'est donc inventée ici. Le chiffre d'affaires attendu apparaît comme
        estimation rattachée à la publication des résultats.
      </p>

      <EventModal ev={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
