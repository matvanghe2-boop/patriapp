import React, { useState, useEffect, useMemo, useCallback } from "react";
import { CalendarDays, List, ChevronLeft, ChevronRight, RefreshCw, CircleDollarSign, FileBarChart, Users } from "lucide-react";
import { fetchCalendarEvents } from "../lib/api";

// ─── Types d'événements : couleurs très vives et saturées pour un contraste maximal sur fond noir ───
const EVENT_TYPES = {
  Dividende: { color: "#00FF6A", glow: "rgba(0,255,106,0.35)", icon: CircleDollarSign },
  Résultats: { color: "#FF2ED1", glow: "rgba(255,46,209,0.35)", icon: FileBarChart },
  "Assemblée Générale": { color: "#00D1FF", glow: "rgba(0,209,255,0.35)", icon: Users },
};

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const isoToday = () => new Date().toISOString().slice(0, 10);

function formatDateFr(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
  const t = EVENT_TYPES[type] || EVENT_TYPES.Dividende;
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ background: t.color, boxShadow: `0 0 6px ${t.glow}` }}
    />
  );
}

function EventBadge({ ev }) {
  const t = EVENT_TYPES[ev.type] || EVENT_TYPES.Dividende;
  const Icon = t.icon;
  return (
    <div
      className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold truncate"
      style={{ background: `${t.color}1A`, border: `1px solid ${t.color}66`, color: t.color }}
      title={`${ev.ticker} — ${ev.label}`}
    >
      <Icon size={10} strokeWidth={2.5} />
      <span className="truncate">{ev.ticker}</span>
    </div>
  );
}

// ─── Vue grille mensuelle ───────────────────────────────────────────────────
function MonthGrid({ year, month, eventsByDate, onMonthChange }) {
  const total = daysInMonth(year, month);
  const offset = firstWeekdayOffset(year, month);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = isoToday();

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
          if (d === null) return <div key={i} className="aspect-square" />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dayEvents = eventsByDate[iso] || [];
          const isToday = iso === today;
          return (
            <div
              key={i}
              className={`aspect-square rounded-lg p-1 flex flex-col border ${
                isToday ? "border-white bg-white/[0.06]" : "border-[#1a1a1a] bg-[#0a0a0a]"
              } overflow-hidden`}
            >
              <div className={`text-[11px] font-data ${isToday ? "text-white font-bold" : "text-[#999]"}`}>{d}</div>
              <div className="flex flex-wrap gap-0.5 mt-auto">
                {dayEvents.slice(0, 3).map((ev, idx) => (
                  <EventDot key={idx} type={ev.type} />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[9px] text-[#888] font-data">+{dayEvents.length - 3}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Vue Timeline : 5 prochains événements ─────────────────────────────────
function TimelineView({ events }) {
  const today = isoToday();
  const upcoming = useMemo(
    () =>
      events
        .filter((e) => e.date >= today)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(0, 5),
    [events, today]
  );

  if (upcoming.length === 0) {
    return (
      <p className="text-sm text-[#888] py-8 text-center border border-dashed border-[#2a2a2a] rounded-xl">
        Aucun événement à venir détecté pour les lignes de ton portefeuille.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {upcoming.map((ev, idx) => {
        const t = EVENT_TYPES[ev.type] || EVENT_TYPES.Dividende;
        const Icon = t.icon;
        const d = new Date(`${ev.date}T00:00:00`);
        const todayD = new Date(`${today}T00:00:00`);
        const daysLeft = Math.round((d - todayD) / (1000 * 60 * 60 * 24));
        return (
          <div
            key={idx}
            className="flex items-center gap-3 rounded-xl border p-3 bg-[#0a0a0a]"
            style={{ borderColor: `${t.color}44` }}
          >
            <div
              className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
              style={{ background: `${t.color}1A`, border: `1.5px solid ${t.color}` }}
            >
              <Icon size={18} style={{ color: t.color }} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-white text-sm">{ev.ticker}</span>
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ background: `${t.color}22`, color: t.color }}
                >
                  {ev.type}
                </span>
              </div>
              <div className="text-xs text-[#999] truncate">{ev.name} · {ev.label}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-data text-sm text-white font-bold">{formatDateFr(ev.date)}</div>
              <div className="text-[10px] text-[#888] font-data">
                {daysLeft === 0 ? "Aujourd'hui" : daysLeft === 1 ? "Demain" : `Dans ${daysLeft} j`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Composant principal ────────────────────────────────────────────────────
/**
 * Calendrier financier mode sombre. Les événements sont dérivés automatiquement
 * des tickers présents dans `positions` (lignes du portefeuille) via l'API
 * Yahoo Finance (calendarEvents). Se ré-actualise dès que la liste de tickers
 * change (ajout / suppression d'une ligne).
 *
 * positions attendu : [{ ticker, name }, ...] — un simple sous-ensemble des
 * positions du portefeuille suffit.
 */
export default function FinancialCalendar({ positions = [] }) {
  const [view, setView] = useState("grid"); // "grid" | "timeline"
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState(null);

  const tickers = useMemo(
    () => [...new Set(positions.map((p) => p.ticker).filter(Boolean))],
    [positions]
  );
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
      const merged = results.flatMap((r) => (r.ok ? r.events : []));
      setEvents(merged);
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) setError(`${failed} ligne(s) sur ${results.length} sans calendrier disponible.`);
      setLastSync(new Date());
    } catch {
      setError("Calendrier indisponible — vérifie ta connexion internet.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  // Se relance automatiquement dès que la composition du portefeuille change.
  useEffect(() => {
    load();
  }, [load]);

  const eventsByDate = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    });
    return map;
  }, [events]);

  const changeMonth = (delta) => {
    setCursor((c) => {
      let month = c.month + delta;
      let year = c.year;
      if (month < 0) { month = 11; year -= 1; }
      if (month > 11) { month = 0; year += 1; }
      return { year, month };
    });
  };

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

      {/* Légende types d'événements */}
      <div className="flex flex-wrap gap-3 mb-4">
        {Object.entries(EVENT_TYPES).map(([type, t]) => (
          <span key={type} className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: t.color }}>
            <EventDot type={type} />
            {type}
          </span>
        ))}
      </div>

      {tickers.length === 0 ? (
        <p className="text-sm text-[#888] py-8 text-center border border-dashed border-[#2a2a2a] rounded-xl">
          Ajoute des positions à ton portefeuille pour voir apparaître leurs événements.
        </p>
      ) : error && events.length === 0 ? (
        <p className="text-sm text-[#ff5c5c] py-8 text-center border border-dashed border-[#2a2a2a] rounded-xl">
          {error}
        </p>
      ) : view === "grid" ? (
        <MonthGrid year={cursor.year} month={cursor.month} eventsByDate={eventsByDate} onMonthChange={changeMonth} />
      ) : (
        <TimelineView events={events} />
      )}

      {error && events.length > 0 && <p className="text-[11px] text-[#ffb020] mt-3">{error}</p>}
      {lastSync && (
        <p className="text-[10px] text-[#666] mt-3">
          Dernière synchro : {lastSync.toLocaleTimeString("fr-FR")} · {tickers.length} ligne(s) suivie(s) automatiquement
        </p>
      )}
    </div>
  );
}
