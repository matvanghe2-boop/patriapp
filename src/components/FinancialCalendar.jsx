import { useState, useEffect, useMemo, useCallback } from "react";
import {
  CalendarDays, List, ChevronLeft, ChevronRight, RefreshCw, CircleDollarSign,
  FileBarChart, Users, X, Briefcase, Eye, Megaphone, BarChart3,
} from "lucide-react";
import { fetchCalendarEvents, estCommuniqueDepose } from "../lib/api";
import { todayIso, nombre } from "../lib/finance";
import { usePersistentState } from "../lib/storage";
import { evenementsManuels, creerDateManuelle, retirerDateManuelle, TYPES_MANUELS } from "../lib/calendrierManuel";
import { evenementsReference, VERIFIE_LE, CALENDRIER_REFERENCE } from "../../shared/calendrierReference.js";
import { SkeletonChart } from "./ui";
import Modal from "./Modal";
import ResumePublications from "./ResumePublications";
import CommuniqueDepose from "./CommuniqueDepose";

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

// Provenance affichée sous l'événement. Tout ce qui n'était pas EDGAR
// s'affichait « Yahoo Finance » — y compris les dates relevées sur l'agenda
// des sociétés ou saisies à la main, qui n'en viennent justement pas.
const NOMS_FOURNISSEURS = {
  yahoo: "Yahoo Finance",
  "sec-edgar": "SEC EDGAR",
  "info-financiere": "info-financiere.gouv.fr",
  reference: "Agenda de la société",
  manuel: "Saisie manuelle",
};

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
  if (abs >= 1e9) return `${nombre((n / 1e9), 2)} Md€`;
  if (abs >= 1e6) return `${nombre((n / 1e6), 1)} M€`;
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
      className={`w-full flex items-center gap-1 rounded px-1 py-0.5 text-left text-[9px] sm:text-micro leading-tight truncate transition-transform hover:scale-[1.04] ${
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
        size === "sm" ? "text-[9px] px-1.5 py-0.5" : "text-micro px-2 py-0.5"
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
    <div className="flex flex-wrap items-center gap-3 text-micro text-[#777] mb-4">
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
  // Lien d'un communiqué TROUVÉ par recherche, quand l'événement n'en portait
  // pas : le résumé doit partir du document qu'on vient de lire.
  const [lienTrouve, setLienTrouve] = useState(null);
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
            className="inline-block text-micro font-bold uppercase tracking-wide px-2 py-0.5 rounded"
            style={{ background: `${t.color}22`, color: t.color }}
          >
            {ev.type}
          </span>
          <SourceBadge source={ev.source} size="md" />
        </div>

        <h3 className="text-xl font-bold text-white mb-0.5">{ev.ticker}</h3>
        <p className="text-sm text-[#999] mb-4">{ev.name}</p>

        <div className="rounded-xl border border-[#222] bg-[#0a0a0a] p-3 mb-2">
          <div className="text-micro text-[#888] mb-0.5">Événement</div>
          <div className="text-sm text-white font-semibold">{ev.label}</div>

          {/* Provenance et fiabilité.

              Une date de résultats annoncée par la société et une date
              extrapolée du rythme des trimestres précédents s'affichaient
              exactement pareil. Impossible de savoir laquelle on regardait,
              donc impossible de savoir s'il fallait y croire. */}
          <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-[#222]">
            <span
              className={`text-micro font-semibold px-1.5 py-0.5 rounded border ${
                ev.statut === "confirme"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-300"
              }`}
              title={
                ev.statut === "confirme"
                  ? "Date communiquée par la société ou attestée par un dépôt réglementaire."
                  : "Date extrapolée du rythme des publications précédentes : elle peut bouger."
              }
            >
              {ev.statut === "confirme" ? "Confirmé" : "Estimé"}
            </span>
            <span className="text-micro text-[#777]">
              {(ev.fournisseurs || [ev.fournisseur])
                .filter(Boolean)
                .map((f) => NOMS_FOURNISSEURS[f] || "Yahoo Finance")
                .join(" + ") || "Yahoo Finance"}
            </span>
            {ev.majLe && (
              <span className="text-micro text-[#555]">
                relu {new Date(ev.majLe).toLocaleString("fr-FR", {
                  timeZone: "Europe/Paris",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {ev.annonceLe && (
            <p className="text-micro text-emerald-300/80 mt-1.5">
              Date annoncée par la société dans son communiqué du {formatDateFr(ev.annonceLe)}.
            </p>
          )}

          {ev.fourchette && (
            <p className="text-micro text-amber-300/80 mt-1.5">
              La société n&apos;a pas encore communiqué sa date : attendue entre le{" "}
              {ev.fourchette.debut} et le {ev.fourchette.fin}.
            </p>
          )}

          {/* Un communiqué déposé s'affiche plus bas, avec son propre lien ;
              les autres documents (SEC, agenda d'une société) gardent le leur. */}
          {ev.lien && !estCommuniqueDepose(ev.lien) && (
            <a
              href={ev.lien}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-micro text-sky-400 hover:text-sky-300 underline underline-offset-2 mt-1.5"
            >
              Lire le document déposé
            </a>
          )}
        </div>

        {(ca || bnpa) && (
          <div className="rounded-xl border border-[#222] bg-[#0a0a0a] p-3 mb-2">
            <div className="text-micro text-[#888] mb-1.5">Attentes du consensus</div>
            <div className="flex items-center justify-between gap-3">
              {ca && (
                <div>
                  <div className="text-micro text-[#777]">Chiffre d'affaires</div>
                  <div className="font-data text-sm text-white font-bold">{ca}</div>
                </div>
              )}
              {bnpa && (
                <div className="text-right">
                  <div className="text-micro text-[#777]">Bénéfice par action</div>
                  <div className="font-data text-sm text-white font-bold">{bnpa}</div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border border-[#222] bg-[#0a0a0a] p-3">
          <div>
            <div className="text-micro text-[#888] mb-0.5">Date</div>
            <div className="font-data text-base text-white font-bold">{formatDateFr(ev.date)}</div>
          </div>
          <div className="text-right">
            <div className="text-micro text-[#888] mb-0.5">Échéance</div>
            <div className="font-data text-sm font-bold" style={{ color: t.color }}>
              {daysLeft === 0 ? "Aujourd'hui" : daysLeft === 1 ? "Demain" : daysLeft > 0 ? `Dans ${daysLeft} j` : `Il y a ${-daysLeft} j`}
            </div>
          </div>
        </div>

        {/* Le communiqué lui-même, chargé à l'ouverture : on lit ce que la
            société a annoncé sans quitter la fiche, puis on le résume. Sans
            document attaché, il est CHERCHÉ dans le registre pour une
            publication passée d'une société française — une date de résultats
            venue de Yahoo, une date relevée sur l'agenda de la société. */}
        {estCommuniqueDepose(ev.lien) ? (
          <div className="mt-2">
            <CommuniqueDepose url={ev.lien} date={ev.date} annonceLe={ev.annonceLe} />
          </div>
        ) : (
          /\.PA$/i.test(ev.ticker) &&
          ev.date <= today &&
          ["Résultats", "Chiffre d'affaires", "Communication"].includes(ev.type) && (
            <div className="mt-2">
              <CommuniqueDepose symbole={ev.ticker} date={ev.date} type={ev.type} onTrouve={setLienTrouve} />
            </div>
          )
        )}

        {/* Résumé de la publication, accessible depuis l'événement lui-même —
            c'est là qu'on se pose la question « qu'est-ce qu'ils ont annoncé ? ».
            N'apparaît que pour les événements qui PORTENT un contenu : une
            date ex-dividende n'a rien à résumer, sauf si un communiqué déposé
            l'accompagne. */}
        {(["Résultats", "Communication", "Chiffre d'affaires"].includes(ev.type) || estCommuniqueDepose(ev.lien)) && (
          <div className="mt-3">
            <ResumePublications
              ticker={ev.ticker}
              nom={ev.name}
              lienDocument={estCommuniqueDepose(ev.lien) ? ev.lien : lienTrouve || ev.lien || null}
            />
          </div>
        )}
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
          <div key={d} className="text-center text-micro uppercase tracking-wider text-[#888] font-semibold py-1">
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
              <div className={`text-micro font-data ${isToday ? "text-white font-bold" : hasPortfolio ? "text-[#ddd] font-semibold" : "text-[#999]"}`}>{d}</div>
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

  /**
   * Derniers événements passés, affichés quand il n'y a rien devant.
   *
   * Un cadre vide laissait croire à une panne. Le plus souvent il n'en est
   * rien : la source ne publie simplement pas encore la prochaine date pour
   * ces valeurs — c'est très courant hors États-Unis, où une société n'annonce
   * son agenda qu'à quelques semaines. Montrer la dernière publication connue
   * dit à la fois que la ligne est bien suivie et à quand elle remonte.
   */
  const recents = useMemo(
    () =>
      events
        .filter((e) => e.date < today)
        .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0))
        .slice(0, 6),
    [events, today]
  );

  if (upcoming.length === 0) {
    return (
      <div className="border border-dashed border-[#2a2a2a] rounded-xl p-5">
        <p className="text-sm text-[#888] text-center">
          Aucune date à venir publiée pour ces valeurs.
        </p>
        <p className="text-micro text-[#666] text-center mt-1.5 max-w-lg mx-auto">
          Ce n&apos;est pas une erreur : hors États-Unis, une société n&apos;annonce souvent son
          agenda qu&apos;à quelques semaines, et la source ne le relaie qu&apos;ensuite. Les dates
          apparaîtront d&apos;elles-mêmes.
        </p>

        {recents.length > 0 && (
          <>
            <p className="text-micro uppercase tracking-wide text-[#666] mt-5 mb-2">
              Derniers événements connus
            </p>
            <div className="space-y-1.5">
              {recents.map((ev, idx) => (
                <button
                  key={`${ev.ticker}-${ev.type}-${ev.date}-${idx}`}
                  onClick={() => onEventClick?.(ev)}
                  className="w-full flex items-center justify-between gap-3 text-left rounded-lg border border-[#222] bg-[#0a0a0a] px-3 py-2 hover:border-[#333] transition-colors"
                >
                  <span className="min-w-0">
                    <span className="text-xs text-[#ccc]">{ev.ticker}</span>
                    <span className="block text-micro text-[#666] truncate">{ev.label || ev.type}</span>
                  </span>
                  <span className="text-micro font-data text-[#777] shrink-0">{ev.date}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
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
                  className="text-micro uppercase tracking-wide px-1.5 py-0.5 rounded"
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
              <div className={`text-micro font-data ${isPortfolio ? "text-[#aaa]" : "text-[#6f6f6f]"}`}>
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
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-micro font-semibold transition-colors ${
        active ? activeClass : "border-[#2a2a2a] text-[#666] hover:text-[#999]"
      }`}
    >
      <Icon size={11} strokeWidth={2.5} />
      {s.label}
      <span className="font-data opacity-70">{count}</span>
    </button>
  );
}

/**
 * Saisie d'une date d'agenda relevée à la main.
 *
 * Repliée par défaut : c'est un recours, pas le mode de fonctionnement
 * normal. Elle ne s'ouvre que quand on en a besoin, et le compteur annonce
 * combien de dates sont déjà tenues ainsi.
 */
function SaisieDateManuelle({ tickers = [], dates = [], onAjouter, onRetirer }) {
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState({
    ticker: tickers[0] || "",
    type: "Résultats",
    date: "",
    label: "",
    source: "",
  });
  const [erreur, setErreur] = useState("");

  const valider = (e) => {
    e.preventDefault();
    if (!onAjouter(brouillon)) {
      setErreur("Il manque un titre, un type ou une date valide.");
      return;
    }
    setErreur("");
    setBrouillon((b) => ({ ...b, date: "", label: "", source: "" }));
  };

  return (
    <div className="mb-3">
      <button
        onClick={() => setOuvert((o) => !o)}
        className="text-micro text-[#888] hover:text-[#ccc] underline underline-offset-2"
      >
        {ouvert ? "Masquer" : "Ajouter une date à la main"}
        {dates.length > 0 && <span className="text-[#666]"> · {dates.length} enregistrée(s)</span>}
      </button>

      {ouvert && (
        <div className="mt-2 rounded-xl border border-[#222] bg-[#0a0a0a] p-3">
          <p className="text-micro text-[#777] mb-2.5">
            Aucune API gratuite ne publie l&apos;agenda à venir des valeurs d&apos;Euronext. Relève
            la date sur l&apos;agenda financier de la société : elle primera sur toutes les sources
            automatiques et ne sera jamais écrasée par un rafraîchissement.
          </p>

          <form onSubmit={valider} className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <select
              value={brouillon.ticker}
              onChange={(e) => setBrouillon((b) => ({ ...b, ticker: e.target.value }))}
              className="bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#ddd]"
              aria-label="Titre"
            >
              {tickers.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={brouillon.type}
              onChange={(e) => setBrouillon((b) => ({ ...b, type: e.target.value }))}
              className="bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#ddd]"
              aria-label="Type d'événement"
            >
              {TYPES_MANUELS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="date"
              required
              value={brouillon.date}
              onChange={(e) => setBrouillon((b) => ({ ...b, date: e.target.value }))}
              className="bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#ddd]"
              aria-label="Date"
            />
            <input
              type="url"
              placeholder="Lien agenda (optionnel)"
              value={brouillon.source}
              onChange={(e) => setBrouillon((b) => ({ ...b, source: e.target.value }))}
              className="bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1.5 text-xs text-[#ddd]"
              aria-label="Lien vers la source"
            />
            <button
              type="submit"
              className="btn-flash rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-300 px-2 py-1.5 text-xs font-medium"
            >
              Ajouter
            </button>
          </form>
          {erreur && <p className="text-micro text-rose-400 mt-1.5">{erreur}</p>}

          {dates.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {dates.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 text-micro text-[#999] border-b border-[#1c1c1c] pb-1 last:border-0"
                >
                  <span className="font-data">
                    {d.date} · {d.ticker} · {d.type}
                    {d.source && (
                      <a
                        href={d.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1.5 text-sky-400 hover:text-sky-300 underline underline-offset-2"
                      >
                        source
                      </a>
                    )}
                  </span>
                  <button
                    onClick={() => onRetirer(d.id)}
                    className="text-[#666] hover:text-rose-400 shrink-0"
                    aria-label={`Supprimer la date du ${d.date} pour ${d.ticker}`}
                  >
                    retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
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
export default function FinancialCalendar({
  positions = [],
  watchlist = [],
  // Le catalogue de référence est injectable pour que les tests puissent
  // exercer le filtrage sur leurs seules données. Sans cela, ajouter une
  // valeur au catalogue ferait tomber des tests qui n'ont rien à voir avec
  // lui, simplement parce qu'ils utilisent le même ticker en exemple.
  catalogueReference = CALENDRIER_REFERENCE,
}) {
  const [view, setView] = useState("grid"); // "grid" | "timeline"
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  // Événements de la DERNIÈRE synchronisation réussie, gardés d'une visite à
  // l'autre. Sans eux, chaque rechargement repartait de rien : on ne voyait
  // que le catalogue et les saisies manuelles (8 événements) pendant toute la
  // synchronisation, avant que les 52 autres ne reviennent.
  const [cacheApi, setCacheApi] = usePersistentState("calendrierCacheApi", { majLe: null, evenements: [] });
  // `null` tant que la synchronisation de cette visite n'a pas abouti : c'est
  // alors le cache qui s'affiche.
  const [events, setEvents] = useState(null);
  // Persistés pour que le rappel « c'est demain » fonctionne depuis n'importe
  // quel onglet : le hook d'application lit cette clé plutôt que de refaire un
  // appel réseau que le cache serveur servirait à l'identique.
  const [, setEvenementsPersistes] = usePersistentState("calendrierEvenements", []);
  const [notifVeille, setNotifVeille] = usePersistentState("calendrierNotifVeille", false);
  const [datesManuelles, setDatesManuelles] = usePersistentState("calendrierDatesManuelles", []);
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

  /**
   * Événements des API à afficher : ceux de cette visite une fois synchronisés,
   * sinon ceux gardés de la précédente. Seules les valeurs encore suivies sont
   * reprises du cache, et leur origine (portefeuille ou watchlist) est
   * recalculée : elle a pu changer depuis.
   */
  const evenementsApi = useMemo(() => {
    const base = events ?? (Array.isArray(cacheApi?.evenements) ? cacheApi.evenements : []);
    return base
      .filter((e) => sourceByTicker[e.ticker])
      .map((e) => ({ ...e, source: sourceByTicker[e.ticker] }));
  }, [events, cacheApi, sourceByTicker]);

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
      // Une réponse amputée par une panne de Yahoo ne remplace pas le cache :
      // on garderait sinon, jusqu'à la synchronisation suivante, un calendrier
      // sans dividendes ni estimations.
      if (!results.some((r) => r.partiel)) {
        setCacheApi({ majLe: new Date().toISOString(), evenements: merged });
      }
      const failed = results.filter((r) => !r.ok).length;
      // Quand Yahoo ne répond pas, le serveur rend quand même les communiqués
      // français : la ligne est « ok », mais sans dividendes ni estimations.
      // Sans ce message, le calendrier paraissait complet alors qu'il ne
      // l'était pas.
      const partiels = results.filter((r) => r.ok && r.partiel).length;
      const messages = [];
      if (failed > 0) messages.push(`${failed} valeur(s) sur ${results.length} sans calendrier disponible.`);
      if (partiels > 0) {
        messages.push(
          `Yahoo n'a pas répondu : dividendes et dates de résultats estimées manquent pour ${partiels} valeur(s). Réessaie « Actualiser » dans quelques minutes.`
        );
      }
      if (messages.length > 0) setError(messages.join(" "));
      setLastSync(new Date());
    } catch {
      setError(
        cacheApi?.majLe
          ? `Synchronisation impossible — affichage de la dernière, du ${new Date(cacheApi.majLe).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`
          : "Calendrier indisponible — vérifie ta connexion internet."
      );
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

  /**
   * Les dates saisies à la main rejoignent celles des API.
   *
   * Elles sont ajoutées ICI plutôt qu'envoyées au serveur : elles vivent dans
   * le navigateur, comme le reste des données patrimoniales, et n'ont donc
   * aucune raison de faire l'aller-retour. Elles priment sur les sources
   * automatiques — un rafraîchissement ne les écrase jamais.
   */
  const tousEvenements = useMemo(() => {
    const marquerOrigine = (e) => ({ ...e, source: sourceByTicker[e.ticker] || "watchlist" });

    // Ordre de priorité croissant : les API d'abord, puis le catalogue de
    // référence relevé sur les communiqués des sociétés, puis les saisies de
    // l'utilisateur — qui connaît ses lignes mieux que n'importe quelle liste.
    const reference = evenementsReference(tickers, catalogueReference).map(marquerOrigine);
    const manuels = evenementsManuels(datesManuelles, tickers).map(marquerOrigine);
    if (reference.length === 0 && manuels.length === 0) return evenementsApi;

    // Même clé d'identité que la fusion côté serveur : une date plus sûre qui
    // tombe le même jour qu'une date d'API la remplace au lieu de doubler.
    const cle = (e) => `${e.ticker}|${e.type}|${e.date}`;
    const clesReference = new Set(reference.map(cle));
    const clesManuelles = new Set(manuels.map(cle));
    const apiParCle = new Map(evenementsApi.map((e) => [cle(e), e]));

    /**
     * La date sûre l'emporte, mais le communiqué DÉPOSÉ reste attaché.
     *
     * Le remplacement pur jetait l'événement d'API, et avec lui le PDF de
     * l'information réglementée : la fiche du chiffre d'affaires de Vinci du
     * 22 octobre ne proposait que la page « agenda » du site de la société,
     * et donc ni lecture du communiqué ni résumé. L'agenda dit la date, le
     * dépôt donne le texte.
     */
    const fusionner = (prioritaire) => {
      const api = apiParCle.get(cle(prioritaire));
      if (!api) return prioritaire;
      return {
        ...api,
        ...prioritaire,
        lien: estCommuniqueDepose(api.lien) ? api.lien : (prioritaire.lien ?? api.lien),
        estimates: prioritaire.estimates ?? api.estimates,
        fournisseurs: [
          ...new Set([prioritaire.fournisseur, ...(api.fournisseurs || [api.fournisseur])].filter(Boolean)),
        ],
      };
    };

    return [
      ...evenementsApi.filter((e) => !clesReference.has(cle(e)) && !clesManuelles.has(cle(e))),
      ...reference.filter((e) => !clesManuelles.has(cle(e))).map(fusionner),
      ...manuels.map(fusionner),
    ];
  }, [evenementsApi, datesManuelles, tickers, sourceByTicker, catalogueReference]);

  // La liste PERSISTÉE est celle qui inclut les saisies manuelles : sans
  // cela, le rappel « c'est demain » ignorerait précisément les dates les
  // plus sûres, celles relevées sur l'agenda officiel de la société.
  //
  // Elle n'est réécrite qu'une fois les événements d'API connus — de cette
  // visite ou de la précédente. À l'ouverture, elle était écrasée par la
  // seule partie calculée dans le navigateur (catalogue et saisies) : le temps
  // de la synchronisation, ou pour de bon si elle échouait, les rappels
  // perdaient tous les dividendes et résultats venus des API.
  const apiConnus = events !== null || (cacheApi?.evenements?.length ?? 0) > 0;
  useEffect(() => {
    if (apiConnus) setEvenementsPersistes(tousEvenements);
  }, [apiConnus, tousEvenements, setEvenementsPersistes]);

  const counts = useMemo(
    () => ({
      portefeuille: tousEvenements.filter((e) => e.source === "portefeuille").length,
      watchlist: tousEvenements.filter((e) => e.source === "watchlist").length,
    }),
    [tousEvenements]
  );

  const filteredEvents = useMemo(
    () => tousEvenements.filter((e) => visibleSources[e.source] !== false && visibleTypes[e.type] !== false),
    [tousEvenements, visibleSources, visibleTypes]
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
  const isInitialLoad = loading && evenementsApi.length === 0 && tickers.length > 0;

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

      {/* Rappel la veille — OPTIONNEL et désactivé par défaut. Une
          notification qu'on n'a pas demandée est une nuisance ; et seules les
          dates confirmées la déclenchent, prévenir la veille d'une date
          estimée reviendrait à annoncer un rendez-vous que personne n'a fixé. */}
      <label className="flex items-center gap-2 mb-3 text-micro text-[#888] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={notifVeille}
          onChange={(e) => setNotifVeille(e.target.checked)}
          className="accent-sky-400"
        />
        <span>
          Me rappeler la veille des événements confirmés
          {notifVeille && (
            <span className="text-[#555]">
              {" "}
              — les dates estimées restent silencieuses
            </span>
          )}
        </span>
      </label>

      {/* Un catalogue tenu à la main vieillit : dire quand il a été vérifié
          évite de le croire éternellement à jour. */}
      <p className="text-micro text-[#666] mb-3">
        Certaines dates viennent d&apos;un catalogue relevé sur les communiqués des sociétés,
        vérifié le {VERIFIE_LE}. Les dates que tu saisis priment toujours dessus.
      </p>

      {/* ─── Dates saisies à la main ───────────────────────────────────────
          Aucune source gratuite ne publie l'agenda à venir des valeurs
          d'Euronext : Yahoo n'avait une date de résultats encore à venir que
          pour quatre valeurs du CAC sur douze, Twelve Data refuse les
          symboles Euronext sur son offre gratuite, et Euronext chiffre les
          réponses de son propre site. Ces dates existent pourtant, sur
          l'agenda financier de chaque société. On permet donc de les saisir,
          et elles priment sur toutes les sources automatiques. */}
      <SaisieDateManuelle
        tickers={tickers}
        dates={datesManuelles}
        onAjouter={(saisie) => {
          const d = creerDateManuelle(saisie);
          if (d) setDatesManuelles((liste) => [...liste, d]);
          return Boolean(d);
        }}
        onRetirer={(id) => setDatesManuelles((liste) => retirerDateManuelle(liste, id))}
      />

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
            className="flex items-center gap-1.5 text-micro font-semibold rounded-lg px-2 py-1 border transition-colors"
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
      ) : error && tousEvenements.length === 0 ? (
        <p className="text-sm text-[#ff5c5c] py-8 text-center border border-dashed border-[#2a2a2a] rounded-xl">
          {error}
        </p>
      ) : view === "grid" ? (
        <MonthGrid year={cursor.year} month={cursor.month} eventsByDate={eventsByDate} onMonthChange={changeMonth} onEventClick={setSelectedEvent} />
      ) : (
        <TimelineView events={filteredEvents} onEventClick={setSelectedEvent} />
      )}

      {error && tousEvenements.length > 0 && <p className="text-micro text-[#ffb020] mt-3">{error}</p>}
      {lastSync ? (
        <p className="text-micro text-[#666] mt-3">
          Dernière synchro : {lastSync.toLocaleTimeString("fr-FR")} · {positions.length} ligne(s) en
          portefeuille et {watchlist.length} valeur(s) surveillée(s) suivies automatiquement.
        </p>
      ) : (
        // Calendrier de la visite précédente, en attendant la synchronisation :
        // on dit de quand il date plutôt que de le faire passer pour frais.
        cacheApi?.majLe &&
        evenementsApi.length > 0 && (
          <p className="text-micro text-[#666] mt-3">
            Affichage de la synchro du{" "}
            {new Date(cacheApi.majLe).toLocaleString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {loading ? " — actualisation en cours…" : "."}
          </p>
        )
      )}
      <p className="text-micro text-[#555] mt-1">
        Sources : Yahoo Finance, info-financiere.gouv.fr pour les sociétés françaises (communiqués
        déposés, et dates qu'elles y annoncent) et SEC EDGAR pour les américaines. Une date
        n'apparaît que si une source la donne : aucune n'est inventée. Le chiffre d'affaires attendu
        apparaît comme estimation rattachée à la publication des résultats.
      </p>

      {/* Une fiche par événement : le communiqué trouvé pour l'un ne doit
          jamais rester affiché pour le suivant. */}
      <EventModal
        key={selectedEvent ? `${selectedEvent.ticker}|${selectedEvent.type}|${selectedEvent.date}` : "aucun"}
        ev={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
