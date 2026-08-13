import { useState, useEffect, useRef, useMemo } from "react";
import { TrendingUp, Wallet, RefreshCw, Pencil, Check, X as XIcon, PieChart as PieIcon, Activity, ArrowUpDown, ArrowUp, ArrowDown, Coins, AlertTriangle, BookOpen, Briefcase, Info, Search, CalendarDays, Filter } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardLabel, CarteRepliable, GhostButton, IconTrash, EmptyState, PageGlow, CARD_THEMES } from "./ui";
import AssetLogo from "./AssetLogo";
import SectorHeatmap from "./SectorHeatmap";
import { eur, pctPlain, pct, uid, rebaseTo100, upsertByDate, computeDividendSummary, computeInvestedCapital, investedCapitalAsOf, todayIso, applyOperationsToBourse, buildCashAdjustment, rebaselineLedger, valeurPosition, positionsSansTaux } from "../lib/finance";
import { searchSecurity, fetchQuotes, fetchTauxChange } from "../lib/api";
import { usePersistentState } from "../lib/storage";

import Watchlist from "./Watchlist";
import FinancialCalendar from "./FinancialCalendar";
import Marche from "./Marche";
import Reequilibrage from "./Reequilibrage";
import PerformanceTab from "./BoursePerformance";
import FiscaliteSortie from "./FiscaliteSortie";
import Screener from "./Screener";
import { verifierEligibilite } from "../../shared/eligibilitePea";

// Reprend le même code couleur que le module Stratégie & Logs pour que le
// statut d'une thèse se reconnaisse d'un coup d'œil, qu'on le voie dans le
// journal de bord ou dans le widget Anti-Panique du tableau de positions.
const STRATEGY_STATUS = {
  intacte: { label: "intacte", dot: "bg-emerald-400", text: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30" },
  surveiller: { label: "à surveiller", dot: "bg-amber-400", text: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/30" },
  invalidee: { label: "invalidée", dot: "bg-rose-400", text: "text-rose-300", bg: "bg-rose-500/10 border-rose-500/30" },
};

function formatDateFrShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const BENCHMARKS = [
  { symbol: "^GSPC", name: "S&P 500", color: "#38bdf8" },
  { symbol: "^FCHI", name: "CAC 40", color: "#a78bfa" },
  { symbol: "URTH", name: "MSCI World", color: "#34d399" },
];
const PIE_PALETTE = ["#a78bfa", "#d946ef", "#818cf8", "#c084fc", "#22d3ee", "#f472b6", "#8b5cf6", "#e879f9"];

const today = () => todayIso();
// ─── Sort config ──────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: "none", label: "Ordre d'ajout" },
  { key: "value_desc", label: "Valeur ↓" },
  { key: "value_asc", label: "Valeur ↑" },
  { key: "pnl_desc", label: "Plus-value ↓" },
  { key: "pnl_asc", label: "Plus-value ↑" },
  { key: "daily_desc", label: "Variation du jour ↓" },
  { key: "daily_asc", label: "Variation du jour ↑" },
  { key: "weight_desc", label: "Poids ↓" },
];

function SortButton({ sort, setSort }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const current = SORT_OPTIONS.find((o) => o.key === sort) || SORT_OPTIONS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-violet-300 border border-slate-700 hover:border-violet-500/50 rounded-lg px-3 py-1.5 transition-colors"
      >
        <ArrowUpDown size={13} />
        Trier : {current.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[200px]">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => { setSort(o.key); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${sort === o.key ? "text-amber-300 bg-slate-800" : "text-slate-300"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Daily variation cell ─────────────────────────────────────────────────────
function DailyVariation({ position, dailyData }) {
  const d = dailyData?.[position.ticker];
  if (!d) {
    return <span className="text-slate-600 text-xs font-data">—</span>;
  }
  const { changeAbs, changePct } = d;
  const pos = changeAbs >= 0;
  return (
    <div className={`flex items-center gap-1 font-data tabular-nums text-xs ${pos ? "text-emerald-400" : "text-rose-400"}`}>
      {pos ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      <span>
        {pos ? "+" : ""}{eur(changeAbs * position.quantity, 2)}
        <span className="opacity-70 ml-1">({pos ? "+" : ""}{changePct.toFixed(2)}%)</span>
      </span>
    </div>
  );
}

// ─── Widget Anti-Panique ─────────────────────────────────────────────────────
// Seuil de baisse journalière au-delà duquel le bouton "Lire ma thèse"
// apparaît sur la ligne — au-delà de ce seuil, c'est typiquement le moment où
// une décision impulsive est la plus tentante.
const PANIC_THRESHOLD_PCT = -5;

function AntiPanicModal({ position, note, onClose }) {
  if (!position) return null;
  const st = STRATEGY_STATUS[note?.statut] || STRATEGY_STATUS.intacte;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-slate-950 p-5 shadow-[0_0_40px_rgba(244,63,94,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-rose-300">
            <AlertTriangle size={20} />
            <span className="text-xs font-bold uppercase tracking-wide">Secousse détectée</span>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-white transition-colors" aria-label="Fermer">
            <XIcon size={18} />
          </button>
        </div>

        <h3 className="text-lg font-bold text-slate-50 mb-0.5 flex items-center gap-2">
          <AssetLogo ticker={position.ticker} size="sm" />
          {position.ticker}
        </h3>
        <p className="text-sm text-slate-500 mb-4">{position.name}</p>

        {note ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${st.bg} ${st.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                Thèse {st.label}
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 mb-3">
              <p className="text-sm text-slate-300 leading-relaxed italic">
                💡 Rappel à toi-même (rédigé le {formatDateFrShort(note.date)}) :
              </p>
              {note.these && <p className="text-sm text-slate-200 mt-2 whitespace-pre-wrap">{note.these}</p>}
            </div>

            {note.conditions_vente && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mb-3">
                <div className="text-[11px] text-amber-300/80 font-semibold uppercase tracking-wide mb-1">
                  Tu ne vends que si...
                </div>
                <p className="text-sm text-slate-200 whitespace-pre-wrap">{note.conditions_vente}</p>
              </div>
            )}

            <p className="text-sm text-slate-400 leading-relaxed">
              Est-ce que l'une de ces conditions est vraie aujourd'hui ? Si non, cette baisse est probablement du bruit de marché. Respire, et laisse la thèse jouer.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
            Aucune thèse enregistrée pour {position.ticker}. Sans repère écrit à froid, c'est le moment idéal pour ne prendre aucune décision impulsive — attends d'avoir de quoi te relire la prochaine fois.
          </div>
        )}
      </div>
    </div>
  );
}

import { computePeaAge, PEA_PLAFONDS, plafondPea } from "../lib/finance";
// ... imports existants inchangés ...

function PeaFiscalWidget({ bourse, setBourse, replie, onBasculer }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ peaOuverture: bourse.peaOuverture || "", peaVersements: bourse.peaVersements || 0 });

  const versements = bourse.peaVersements || 0;
  const plafond = plafondPea(bourse);
  const typeCourant = PEA_PLAFONDS[bourse.peaType] ? bourse.peaType : "classique";
  const pctPlafond = Math.min(100, (versements / plafond) * 100);
  const age = computePeaAge(bourse.peaOuverture);

  // Le total versé saisi ici est l'ancrage de la courbe « Capital investi » :
  // on refixe donc la ligne de base pour qu'il devienne le nouveau point de
  // départ. Sans ça, le chiffre serait immédiatement recalculé à partir de
  // l'ancien ancrage et la correction manuelle serait perdue.
  const save = () => {
    setBourse((b) =>
      rebaselineLedger({ ...b, peaOuverture: draft.peaOuverture, peaVersements: parseFloat(draft.peaVersements) || 0 })
    );
    setEditing(false);
  };

  return (
    <CarteRepliable
      titre="Plafond de versements PEA"
      accent={CARD_THEMES.violet}
      replie={replie}
      onBasculer={onBasculer}
      resume={`${pctPlafond.toFixed(0)} % de ${eur(plafond, 0)}`}
      actions={
        <button
          onClick={() => { setDraft({ peaOuverture: bourse.peaOuverture || "", peaVersements: versements }); setEditing((e) => !e); }}
          className="btn-flash text-[11px] text-violet-300/80 hover:text-violet-200"
        >
          {editing ? "Fermer" : "Modifier"}
        </button>
      }
    >

      {editing ? (
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Date d'ouverture du PEA</label>
            <input type="date" value={draft.peaOuverture} onChange={(e) => setDraft((d) => ({ ...d, peaOuverture: e.target.value }))} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-violet-400/60" />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Total versé (€)</label>
            <input type="number" step="100" value={draft.peaVersements} onChange={(e) => setDraft((d) => ({ ...d, peaVersements: e.target.value }))} className="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-violet-400/60" />
            <p className="text-[10px] text-slate-600 mt-1 max-w-[13rem]">
              Point de départ de la courbe « Capital investi ». Il évoluera ensuite tout seul à chaque versement ou retrait de cash.
            </p>
          </div>
          {/* Le plafond ne vaut 150 000 € que pour un PEA classique. Entre 18 et
              25 ans, tant que le titulaire est rattaché au foyer fiscal de ses
              parents, il est de 20 000 € — sept fois moins. */}
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Type de PEA</label>
            <select
              value={typeCourant}
              onChange={(e) => setBourse((b) => ({ ...b, peaType: e.target.value }))}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-violet-400/60"
            >
              {Object.entries(PEA_PLAFONDS).map(([cle, v]) => (
                <option key={cle} value={cle}>{v.label}</option>
              ))}
            </select>
          </div>
          <button onClick={save} className="btn-solid text-xs font-semibold bg-violet-400 hover:bg-violet-300 text-slate-950 rounded-lg px-3 py-1.5">Enregistrer</button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400 font-data ghost-blur">{eur(versements, 0)} versés</span>
            <span className="text-slate-500 font-data">{eur(plafond, 0)} plafond</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pctPlafond >= 90 ? "bg-rose-400" : pctPlafond >= 70 ? "bg-amber-400" : "bg-violet-400"}`} style={{ width: `${pctPlafond}%` }} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{pctPlafond.toFixed(1)} % du plafond — reste <span className="ghost-blur">{eur(plafond - versements, 0)}</span> de marge de versement</div>
          {typeCourant === "jeune" && (
            <p className="text-[11px] text-violet-300/80 mt-1.5 leading-relaxed">
              {PEA_PLAFONDS.jeune.detail}
            </p>
          )}
        </>
      )}

      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-3">
        {age ? (
          <>
            <span className="text-2xl">{age.eligible ? "🟢" : "🔴"}</span>
            <div>
              <div className="text-sm text-slate-200 font-medium">
                {age.eligible ? "PEA de plus de 5 ans" : "PEA de moins de 5 ans"}
              </div>
              <div className="text-[11px] text-slate-500">
                {age.eligible
                  ? "Exonération d'impôt sur les plus-values — seuls 17,2 % de prélèvements sociaux restent dus."
                  : `Clôture entraînerait imposition spécifique — encore ${age.monthsRemaining} mois avant l'exonération.`}
              </div>
              <div className="text-[10px] text-slate-600 font-data mt-0.5">Ouvert depuis {age.years} an(s) {age.months} mois</div>
            </div>
          </>
        ) : (
          <span className="text-[11px] text-slate-600">Renseigne la date d'ouverture pour voir le décompte fiscal.</span>
        )}
      </div>
    </CarteRepliable>
  );
}


/**
 * Avertit quand des positions sont cotées dans une autre devise que l'euro.
 *
 * Toute l'application additionne les `current_price` comme des euros et ne
 * convertit jamais : sans ce signal, un titre coté en dollars était compté à
 * parité 1:1 et faussait silencieusement la valeur du portefeuille, la
 * plus-value et la répartition. Mieux vaut le dire que de laisser croire à un
 * chiffre juste.
 */
function ForeignCurrencyWarning({ positions }) {
  const sansTaux = positionsSansTaux(positions);
  const converties = (positions || []).filter(
    (p) => p.currency && p.currency !== "EUR" && Number.isFinite(p.fxRate) && p.fxRate > 0
  );

  // Cas nominal désormais : les lignes en devise sont converties au taux du
  // jour, récupéré en même temps que les cours. On l'indique sans alarmer.
  if (sansTaux.length === 0) {
    if (converties.length === 0) return null;
    const devises = [...new Set(converties.map((p) => p.currency))].join(", ");
    return (
      <div className="flex items-start gap-2 text-xs rounded-lg border border-slate-700 bg-slate-900/60 text-slate-400 px-3 py-2">
        <Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          {converties.length} position(s) cotée(s) en {devises}, converties en euros au taux du jour.
          Le prix de revient est converti à ce même taux : la plus-value affichée inclut donc l'effet
          de change, sans le distinguer de la performance du titre.
        </span>
      </div>
    );
  }

  const devises = [...new Set(sansTaux.map((p) => p.currency))].join(", ");
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 px-3 py-2">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        {sansTaux.length} position(s) en {devises} ({sansTaux.map((p) => p.ticker).join(", ")}) sans
        taux de change connu : elles sont comptées à parité 1:1. Actualise les cours pour récupérer
        les taux et corriger la valeur totale, la plus-value et la répartition.
      </span>
    </div>
  );
}

/**
 * Lignes incompatibles avec l'enveloppe déclarée.
 *
 * Un PEA ne peut détenir que des sociétés dont le siège est dans l'UE ou
 * l'EEE. Rien ne l'empêchait : on pouvait ajouter `AAPL` à un portefeuille
 * déclaré PEA, et toute la fiscalité calculée derrière — exonération après
 * cinq ans, plus-value nette — devenait fausse sans qu'aucun signal
 * n'apparaisse.
 *
 * L'avertissement reste informatif : on ne bloque pas la saisie. Le suffixe du
 * ticker est une heuristique, et une ligne peut être détenue sur un CTO
 * pendant que l'enveloppe principale est un PEA.
 */
function EligibilitePeaWarning({ positions, enveloppe }) {
  const inelegibles = useMemo(
    () =>
      (positions || [])
        .map((p) => ({ position: p, verdict: verifierEligibilite(p.ticker, enveloppe) }))
        .filter(({ verdict }) => verdict.eligible === false),
    [positions, enveloppe]
  );

  if (inelegibles.length === 0) return null;

  const pays = [...new Set(inelegibles.map(({ verdict }) => verdict.pays))].join(", ");
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-200 px-3 py-2">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        {inelegibles.length} ligne(s) hors Espace économique européen ({pays}) :{" "}
        <span className="font-medium">{inelegibles.map(({ position }) => position.ticker).join(", ")}</span>.
        Un {enveloppe} ne peut pas les détenir — si elles sont sur un compte-titres, déclare-le dans
        l&apos;enveloppe de ce portefeuille, sinon la fiscalité affichée ici est fausse.
      </span>
    </div>
  );
}

/**
 * Poche de cash — modifiable à la main, mais tout écart est enregistré comme
 * un mouvement daté (VERSEMENT ou RETRAIT) dans le journal d'opérations.
 *
 * Sans cette trace, l'application n'a aucun moyen de distinguer « j'ai
 * alimenté mon PEA » d'« un gain de marché » : le versement serait compté
 * comme de la performance dans le TWR, et la courbe Capital investi ne
 * bougerait pas alors que de l'argent vient d'entrer.
 *
 * La saisie n'est validée qu'à la sortie du champ (ou sur Entrée) : sinon
 * chaque frappe créerait sa propre écriture.
 */
function CashPocketCard({ bourse, setBourse }) {
  const current = bourse.cash_pocket || 0;
  const [draft, setDraft] = useState(String(current));

  useEffect(() => {
    setDraft(String(current));
  }, [current]);

  const commit = () => {
    const target = parseFloat(draft);
    if (!Number.isFinite(target)) {
      setDraft(String(current));
      return;
    }
    const movement = buildCashAdjustment(current, target);
    if (!movement) return;
    setBourse((b) => applyOperationsToBourse(b, [movement, ...(b.operations || [])]));
  };

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={Wallet}>Poche cash disponible</CardLabel>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          title="Un changement est enregistré comme versement ou retrait daté dans le journal d'opérations."
          className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums ghost-blur focus:outline-none focus:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/30"
        />
        <span className="text-xs text-slate-600">€</span>
      </div>
      <p className="text-[11px] text-slate-600 mt-1">Versement ou retrait enregistré dans le journal</p>
    </Card>
  );
}

export default function Bourse({
  bourse, setBourse, bourseTotal, bourseGainAbs, bourseGainPct,
  alertesWatchlist, setAlertesWatchlist,
  bourseHistory, setBourseHistory, watchlist, setWatchlist, strategyNotes = [],
  // Composition de l'écran : quels blocs sont repliés. Persisté, donc retrouvé
  // tel quel au rechargement et sur les autres appareils.
  widgetsReplies = {}, basculerWidget,
}) {
  const replie = (id) => Boolean(widgetsReplies?.[id]);
  const basculer = (id) => () => basculerWidget?.(id);
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");
  const [panicPosition, setPanicPosition] = useState(null);
  const [subTab, setSubTab] = useState("portefeuille"); // "portefeuille" | "performance" | "marche"
  // Requête d'ouverture d'une fiche dans l'onglet Marché depuis le tableau de
  // positions ou la watchlist. Le "ts" force le re-déclenchement de l'effet
  // dans <Marche> même si on reclique deux fois de suite sur la même valeur.
  const [marcheRequest, setMarcheRequest] = useState(null);
  const openInMarche = (ticker) => {
    setMarcheRequest({ symbol: ticker.toUpperCase(), ts: Date.now() });
    setSubTab("marche");
  };

  // ─── État de l'onglet Performance ────────────────────────────────────────
  const [perfRange, setPerfRange] = useState("MAX"); // "1M" | "3M" | "YTD" | "1A" | "MAX"
  const [selectedBenchmarks, setSelectedBenchmarks] = useState(["^GSPC", "^FCHI", "URTH"]);
  const [showDividendsReinvested, setShowDividendsReinvested] = useState(false);

  // Retrouve la note de thèse la plus pertinente pour un ticker : priorité à
  // une note active (non clôturée), sinon la plus récente toutes confondues.
  const findNoteForTicker = (ticker) => {
    const matches = strategyNotes.filter((n) => n.ticker?.toUpperCase() === ticker?.toUpperCase());
    if (matches.length === 0) return null;
    const active = matches.filter((n) => !n.archivee).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (active.length > 0) return active[0];
    return matches.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  };

  // ─── Persistance du tri et des données de variation ──────────────────────
  const [sort, setSort] = usePersistentState("bourseSort", "none");
  const [dailyData, setDailyData] = usePersistentState("bourseDailyData", {});

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ quantity: "", pru: "", current_price: "", annual_dividend: "" });
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");

  // Toute retouche MANUELLE des positions refixe la ligne de base : la saisie
  // de l'utilisateur devient le nouveau point de départ du grand livre. Sans
  // ça, le prochain rejeu du journal repartirait de l'ancien socle et
  // écraserait la correction qui vient d'être faite.
  const addPosition = (v) =>
    setBourse((b) =>
      rebaselineLedger({
        ...b,
        positions: [
          ...b.positions,
          { id: uid(), ticker: v.ticker, name: v.name, quantity: v.quantity, pru: v.pru, current_price: v.current_price, type: v.type, annual_dividend: v.annual_dividend || 0, currency: v.currency || "EUR" },
        ],
      })
    );
  const removePosition = (id) =>
    setBourse((b) => rebaselineLedger({ ...b, positions: b.positions.filter((x) => x.id !== id) }));

  const startEdit = (p) => { setEditingId(p.id); setEditValues({ quantity: String(p.quantity), pru: String(p.pru), current_price: String(p.current_price), annual_dividend: String(p.annual_dividend || 0) }); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = (id) => {
    setBourse((b) =>
      rebaselineLedger({
        ...b,
        positions: b.positions.map((p) =>
          p.id === id ? { ...p, quantity: parseFloat(editValues.quantity) || 0, pru: parseFloat(editValues.pru) || 0, current_price: parseFloat(editValues.current_price) || 0, annual_dividend: parseFloat(editValues.annual_dividend) || 0 } : p
        ),
      })
    );
    setEditingId(null);
  };

  const refreshPrices = async () => {
    if (bourse.positions.length === 0) return;
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const symbols = bourse.positions.map((p) => p.ticker);
      const quotes = await fetchQuotes(symbols);
      const newDailyData = {};
      const refreshedAt = new Date().toISOString();

      // Taux de change des devises effectivement rencontrées dans les cours
      // qu'on vient de recevoir — la devise d'une position peut changer au
      // premier rafraîchissement, quand elle n'était pas encore connue.
      const devises = [...new Set(
        quotes.filter((q) => q.ok && q.currency && q.currency !== "EUR").map((q) => q.currency)
      )];
      let tauxParDevise = {};
      if (devises.length > 0) {
        try {
          const taux = await fetchTauxChange(devises);
          tauxParDevise = Object.fromEntries(
            taux.filter((t) => t.ok).map((t) => [t.devise, t.versEuro])
          );
        } catch {
          // Échec des taux : les cours restent à jour, les positions étrangères
          // gardent leur ancien taux (ou aucun) et l'avertissement subsiste.
          tauxParDevise = {};
        }
      }

      setBourse((b) => ({
        ...b,
        // Date de dernière actualisation des cours — c'est elle qui mesure la
        // fraîcheur réelle des données affichées. Le Dashboard s'appuyait
        // auparavant sur l'historique de patrimoine, alimenté automatiquement
        // chaque jour, et affichait donc toujours « actualisé aujourd'hui »
        // même quand les cours dataient de plusieurs semaines.
        pricesUpdatedAt: refreshedAt,
        positions: b.positions.map((p) => {
          const q = quotes.find((x) => x.symbol === p.ticker);
          if (q?.ok) {
            // Compute daily variation
            if (q.previousClose && q.price) {
              newDailyData[p.ticker] = {
                changeAbs: q.price - q.previousClose,
                changePct: ((q.price - q.previousClose) / q.previousClose) * 100,
              };
            }
            // Devise de cotation ET taux de conversion vers l'euro. Sans ce
            // taux, un titre coté en dollars était compté à parité 1:1 dans la
            // valeur du portefeuille, la plus-value et la répartition.
            const devise = q.currency || p.currency || "EUR";
            const taux = devise === "EUR" ? 1 : tauxParDevise[devise] ?? p.fxRate ?? null;
            return {
              ...p,
              current_price: q.price,
              currency: devise,
              fxRate: taux,
              fxUpdatedAt: taux != null && devise !== "EUR" ? refreshedAt : p.fxUpdatedAt ?? null,
            };
          }
          return p;
        }),
      }));
      // Mettre à jour les données persistées (fusionner avec les existantes)
      setDailyData((prev) => ({ ...prev, ...newDailyData }));
      const failed = quotes.filter((q) => !q.ok).length;
      setRefreshMsg(failed > 0 ? `${failed} cours sur ${quotes.length} n'ont pas pu être actualisés.` : "Tous les cours ont été actualisés.");
    } catch {
      setRefreshMsg("Actualisation impossible — vérifiez votre connexion internet.");
    } finally {
      setRefreshing(false);
    }
  };

  const pieData = useMemo(
    () => bourse.positions.map((p, i) => ({ name: p.ticker, value: valeurPosition(p), color: PIE_PALETTE[i % PIE_PALETTE.length] })).filter((d) => d.value > 0),
    [bourse.positions]
  );

  // L'enveloppe compte : la retenue à la source étrangère est perdue dans un
  // PEA, récupérable via crédit d'impôt sur un compte-titres ordinaire.
  const dividendSummary = useMemo(
    () => computeDividendSummary(bourse.positions, bourse.envelope),
    [bourse.positions, bourse.envelope]
  );

  const captureSnapshot = async (silent = false) => {
    if (!silent) { setTrackLoading(true); setTrackError(""); }
    try {
      const tickers = [...new Set(bourse.positions.map((p) => p.ticker))];
      const allSymbols = [...tickers, ...BENCHMARKS.map((b) => b.symbol)];
      const quotes = allSymbols.length > 0 ? await fetchQuotes(allSymbols) : [];
      const priceMap = {};
      quotes.forEach((q) => { if (q.ok) priceMap[q.symbol] = q.price; });

      const valeur = bourse.positions.reduce((sum, p) => sum + (priceMap[p.ticker] ?? p.current_price) * p.quantity, 0) + bourse.cash_pocket;
      // Cumul des versements, dérivé du journal d'opérations — et non plus
      // `Σ quantité × PRU + cash`, qui chutait à chaque vente alors qu'aucun
      // argent n'était sorti du compte.
      const capital = investedCapitalAsOf(computeInvestedCapital(bourse), today());

      const entry = {
        date: today(),
        valeur: Math.round(valeur),
        capital: Math.round(capital),
        sp500: priceMap["^GSPC"] ?? null,
        cac40: priceMap["^FCHI"] ?? null,
        msciWorld: priceMap["URTH"] ?? null,
      };
      setBourseHistory((h) => upsertByDate(h, entry));

      const failed = quotes.filter((q) => !q.ok).length;
      if (failed > 0) setTrackError(`${failed} cotation(s) sur ${quotes.length} indisponible(s).`);
    } catch {
      setTrackError("Mise à jour du suivi impossible — vérifie ta connexion internet.");
    } finally {
      if (!silent) setTrackLoading(false);
    }
  };

  useEffect(() => {
    const hasToday = bourseHistory.some((e) => e.date === today());
    if (!hasToday) captureSnapshot(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base100Data = useMemo(() => rebaseTo100(bourseHistory, ["valeur", "sp500", "cac40", "msciWorld"]), [bourseHistory]);
  const hasEnoughHistory = bourseHistory.length >= 2;
  const hasEnoughBase100 = base100Data.length >= 2;

  // ─── Sorted positions ───────────────────────────────────────────────────────
  const sortedPositions = useMemo(() => {
    const positions = [...bourse.positions];
    const getVal = (p) => valeurPosition(p);
    const getPnl = (p) => (p.current_price - p.pru) * p.quantity;
    const getDaily = (p) => {
      const d = dailyData[p.ticker];
      return d ? d.changePct : 0;
    };
    const getWeight = (p) => bourseTotal > 0 ? (getVal(p) / bourseTotal) * 100 : 0;

    switch (sort) {
      case "value_desc": return positions.sort((a, b) => getVal(b) - getVal(a));
      case "value_asc": return positions.sort((a, b) => getVal(a) - getVal(b));
      case "pnl_desc": return positions.sort((a, b) => getPnl(b) - getPnl(a));
      case "pnl_asc": return positions.sort((a, b) => getPnl(a) - getPnl(b));
      case "daily_desc": return positions.sort((a, b) => getDaily(b) - getDaily(a));
      case "daily_asc": return positions.sort((a, b) => getDaily(a) - getDaily(b));
      case "weight_desc": return positions.sort((a, b) => getWeight(b) - getWeight(a));
      default: return positions;
    }
  }, [bourse.positions, sort, dailyData, bourseTotal]);

  // ─── Portfolio daily total variation ───────────────────────────────────────
  const portfolioDailyChange = useMemo(() => {
    let total = 0;
    let hasData = false;
    bourse.positions.forEach((p) => {
      const d = dailyData[p.ticker];
      if (d) { total += d.changeAbs * p.quantity; hasData = true; }
    });
    return hasData ? total : null;
  }, [bourse.positions, dailyData]);

  return (
    <div className="relative space-y-6">
      <PageGlow color="violet" />
      <div className="relative">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="font-display text-2xl text-slate-50">
            PEA &amp; <span className="text-violet-400">Bourse</span>
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Enveloppe fiscale
            <select
              value={bourse.envelope || "PEA"}
              onChange={(e) => setBourse((b) => ({ ...b, envelope: e.target.value }))}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-violet-400/60"
            >
              <option value="PEA">PEA</option>
              <option value="CTO">CTO</option>
              <option value="PER">PER</option>
            </select>
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-1">Positions actions / ETF — analyse de portefeuille.</p>
      </div>

      <ForeignCurrencyWarning positions={bourse.positions} />
      <EligibilitePeaWarning positions={bourse.positions} enveloppe={bourse.envelope} />

      {/* Sous-onglets */}
      <div className="relative flex items-center gap-2 border-b border-slate-800 pb-1">
        <button
          onClick={() => setSubTab("portefeuille")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "portefeuille" ? "text-violet-300 border-b-2 border-violet-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Briefcase size={14} /> Portefeuille
        </button>
        <button
          onClick={() => setSubTab("performance")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "performance" ? "text-violet-300 border-b-2 border-violet-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Activity size={14} /> Performance
        </button>
        <button
          onClick={() => setSubTab("marche")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "marche" ? "text-violet-300 border-b-2 border-violet-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Search size={14} /> Marché
        </button>
        <button
          onClick={() => setSubTab("screener")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "screener" ? "text-violet-300 border-b-2 border-violet-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Filter size={14} /> Screener
        </button>
        <button
          onClick={() => setSubTab("calendrier")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "calendrier" ? "text-violet-300 border-b-2 border-violet-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <CalendarDays size={14} /> Calendrier
        </button>
      </div>

      {subTab === "portefeuille" && (
      <>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card accent={CARD_THEMES.violet}>
          <CardLabel>Valeur du portefeuille</CardLabel>
          <div className="font-display text-xl text-slate-100 ghost-blur">{eur(bourseTotal)}</div>
          {portfolioDailyChange !== null && (
            <div className={`flex items-center gap-1 text-xs mt-1 font-data ghost-blur ${portfolioDailyChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {portfolioDailyChange >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {portfolioDailyChange >= 0 ? "+" : ""}{eur(portfolioDailyChange)} aujourd'hui
            </div>
          )}
        </Card>
        <Card accent={CARD_THEMES.violet}>
          <CardLabel>Plus/moins-value latente</CardLabel>
          <div className={`font-display text-xl ghost-blur ${bourseGainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{eur(bourseGainAbs)}</div>
          <div className={`text-xs mt-1 ${bourseGainAbs >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>{pct(bourseGainPct)}</div>
        </Card>
        <CashPocketCard bourse={bourse} setBourse={setBourse} />
      </div>
      <div className="mt-6 flex flex-col gap-4">
        <PeaFiscalWidget
          bourse={bourse}
          setBourse={setBourse}
          replie={replie("plafondPea")}
          onBasculer={basculer("plafondPea")}
        />
        {/* La plus-value affichée partout ailleurs est brute. Celle-ci est
            celle qu'on encaisserait réellement. */}
        <FiscaliteSortie
          bourse={bourse}
          bourseGainAbs={bourseGainAbs}
          bourseTotal={bourseTotal}
          replie={replie("fiscalite")}
          onBasculer={basculer("fiscalite")}
        />
      </div>

      {/* Dividendes */}
      <CarteRepliable
        titre="Revenus de dividendes estimés"
        icon={Coins}
        accent={CARD_THEMES.violet}
        replie={replie("dividendes")}
        onBasculer={basculer("dividendes")}
        resume={
          dividendSummary.totalAnnualDividendNet > 0
            ? `${eur(dividendSummary.totalAnnualDividendNet, 0)} par an`
            : null
        }
      >
        {bourse.positions.length === 0 || dividendSummary.totalAnnualDividend === 0 ? (
          <EmptyState>
            Renseigne le dividende annuel par action de tes lignes (via le crayon d'édition) pour voir ton rendement et tes revenus estimés.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-1">
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">
                {dividendSummary.totalRetenueSource > 0 ? "Dividendes nets encaissés" : "Dividendes annuels"}
              </div>
              <div className="font-display text-lg text-emerald-400 ghost-blur">
                {eur(dividendSummary.totalAnnualDividendNet, 2)}
              </div>
              {dividendSummary.totalRetenueSource > 0 && (
                <div className="text-[11px] text-amber-300/90 mt-0.5 ghost-blur">
                  {eur(dividendSummary.totalAnnualDividend, 2)} bruts − {eur(dividendSummary.totalRetenueSource, 2)} de
                  retenue étrangère
                </div>
              )}
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Moyenne mensuelle</div>
              <div className="font-display text-lg text-slate-100 ghost-blur">{eur(dividendSummary.monthlyAverage, 2)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Rendement / valeur actuelle</div>
              <div className="font-display text-lg text-violet-300">{pctPlain(dividendSummary.portfolioYieldOnValue, 2)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 mb-0.5">Rendement / capital investi</div>
              <div className="font-display text-lg text-violet-300">{pctPlain(dividendSummary.portfolioYieldOnCost, 2)}</div>
            </div>
          </div>
        )}
      </CarteRepliable>

      {/* ─── Positions Table ─── */}
      <CarteRepliable
        titre="Positions"
        icon={TrendingUp}
        accent={CARD_THEMES.violet}
        replie={replie("positions")}
        onBasculer={basculer("positions")}
        resume={`${bourse.positions.length} ligne(s)`}
      >
        <div className="flex items-center justify-end mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <SortButton sort={sort} setSort={setSort} />
            <button
              onClick={refreshPrices}
              disabled={refreshing || bourse.positions.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition-colors"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Actualisation..." : "Actualiser les cours"}
            </button>
            <GhostButton theme="violet" onClick={() => setShowAdd((s) => !s)}>Ajouter une position</GhostButton>
          </div>
        </div>

        {refreshMsg && <p className="text-[11px] text-amber-300/80 mb-3">{refreshMsg}</p>}

        {bourse.positions.length === 0 ? (
          <EmptyState>Aucune position pour le moment — ajoute ta première ligne via le bouton ci-dessus.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-cards">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Actif</th>
                  <th className="py-2 pr-3">Qté</th>
                  <th className="py-2 pr-3">PRU</th>
                  <th className="py-2 pr-3">Cours</th>
                  <th className="py-2 pr-3">
                    <span className="flex items-center gap-1">
                      Var. J
                      <span className="text-[9px] text-slate-600 normal-case tracking-normal">(vs clôt. veille)</span>
                    </span>
                  </th>
                  <th className="py-2 pr-3">Valeur</th>
                  <th className="py-2 pr-3">+/− value</th>
                  <th className="py-2 pr-3">Poids</th>
                  <th className="py-2 pr-3">
                    <span className="flex items-center gap-1">
                      Div. annuel
                      <span className="text-[9px] text-slate-600 normal-case tracking-normal">(rdt · YoC)</span>
                    </span>
                  </th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {sortedPositions.map((p) => {
                  const isEditing = editingId === p.id;
                  const value = valeurPosition(p);
                  const gainAbs = (p.current_price - p.pru) * p.quantity;
                  const gainPct = p.pru > 0 ? ((p.current_price - p.pru) / p.pru) * 100 : 0;
                  const weight = bourseTotal > 0 ? (value / bourseTotal) * 100 : 0;

                  if (isEditing) {
                    return (
                      <tr key={p.id} className="bg-slate-950/60">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <AssetLogo ticker={p.ticker} size="xs" />
                            <div>
                              <div className="text-slate-200 font-medium">{p.ticker}</div>
                              <div className="text-[11px] text-slate-500">{p.name} · {p.type}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          <input type="number" step="0.0001" value={editValues.quantity} onChange={(e) => setEditValues((v) => ({ ...v, quantity: e.target.value }))} className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60" />
                        </td>
                        <td className="py-2 pr-3">
                          <input type="number" step="0.01" value={editValues.pru} onChange={(e) => setEditValues((v) => ({ ...v, pru: e.target.value }))} className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60" />
                        </td>
                        <td className="py-2 pr-3">
                          <input type="number" step="0.01" value={editValues.current_price} onChange={(e) => setEditValues((v) => ({ ...v, current_price: e.target.value }))} className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60" />
                        </td>
                        <td className="py-3 pr-3 text-slate-600 text-xs" colSpan={3}>Aperçu après enregistrement</td>
                        <td className="py-2 pr-3">
                          <input type="number" step="0.01" placeholder="€ / action" value={editValues.annual_dividend} onChange={(e) => setEditValues((v) => ({ ...v, annual_dividend: e.target.value }))} className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60" />
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => saveEdit(p.id)} className="text-emerald-400 hover:text-emerald-300 p-1"><Check size={15} /></button>
                            <button onClick={cancelEdit} className="text-slate-500 hover:text-rose-400 p-1"><XIcon size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={p.id} className="group hover:bg-slate-800/30 transition-colors">
                      <td data-label="Actif" className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => openInMarche(p.ticker)}
                          title="Voir la fiche complète dans l'onglet Marché"
                          className="flex items-center gap-2 text-left group/ticker"
                        >
                          <AssetLogo ticker={p.ticker} size="xs" />
                          <div>
                            <div className="text-slate-200 font-medium group-hover/ticker:text-violet-300 transition-colors">{p.ticker}</div>
                            <div className="text-[11px] text-slate-500">{p.name} · {p.type}</div>
                          </div>
                        </button>
                      </td>
                      <td data-label="Qté" className="py-3 pr-3 font-data tabular-nums">{p.quantity}</td>
                      <td data-label="PRU" className="py-3 pr-3 font-data tabular-nums ghost-blur">{eur(p.pru, 2)}</td>
                      <td data-label="Cours" className="py-3 pr-3 font-data tabular-nums ghost-blur">{eur(p.current_price, 2)}</td>
                      <td data-label="Variation du jour" className="py-3 pr-3">
                        <DailyVariation position={p} dailyData={dailyData} />
                        {(dailyData?.[p.ticker]?.changePct ?? 0) <= PANIC_THRESHOLD_PCT && (
                          <button
                            onClick={() => setPanicPosition(p)}
                            className="flex items-center gap-1 text-[10px] font-semibold text-rose-300 hover:text-rose-200 mt-1 animate-pulse"
                          >
                            <BookOpen size={11} /> Lire ma thèse
                          </button>
                        )}
                      </td>
                      <td data-label="Valeur" className="py-3 pr-3 font-data tabular-nums ghost-blur">{eur(value)}</td>
                      <td data-label="+/− value" className={`py-3 pr-3 font-data tabular-nums ghost-blur ${gainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {eur(gainAbs)} <span className="text-[11px] opacity-80">({pct(gainPct)})</span>
                      </td>
                      <td data-label="Poids" className="py-3 pr-3 font-data tabular-nums text-slate-400">{pctPlain(weight)}</td>
                      <td data-label="Dividendes" className="py-3 pr-3">
                        {p.annual_dividend > 0 ? (
                          <div className="font-data tabular-nums">
                            <div className="text-emerald-400 ghost-blur">{eur(p.annual_dividend * p.quantity, 2)}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <span>{pctPlain(p.current_price > 0 ? (p.annual_dividend / p.current_price) * 100 : 0, 2)} rdt</span>
                              {p.pru > 0 && (
                                <span className="text-amber-300/90" title="Rendement sur ton PRU (Yield on Cost)">
                                  · <span className="font-semibold">{pctPlain((p.annual_dividend / p.pru) * 100, 2)}</span> YoC
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(p)} className="text-slate-600 hover:text-amber-300 p-1"><Pencil size={14} /></button>
                          <IconTrash onClick={() => removePosition(p.id)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <AddPositionPanel open={showAdd} onClose={() => setShowAdd(false)} onSubmit={addPosition} />

        <p className="text-[11px] text-slate-600 mt-4">
          La variation journalière est calculée par rapport au cours de clôture de la veille, récupéré lors du dernier « Actualiser les cours ».
        </p>
      </CarteRepliable>

      {/* Remplace le simulateur d'ordre : celui-ci ne traitait qu'une ligne à
          la fois, alors que vendre une position modifie le poids de toutes les
          autres. */}
      <Reequilibrage bourse={bourse} setBourse={setBourse} />

      <Watchlist watchlist={watchlist} setWatchlist={setWatchlist} onOpenMarket={openInMarche} alertes={alertesWatchlist} setAlertes={setAlertesWatchlist} />

      {/* Pie */}
      <CarteRepliable
        titre="Répartition par ligne"
        icon={PieIcon}
        accent={CARD_THEMES.violet}
        replie={replie("repartition")}
        onBasculer={basculer("repartition")}
        resume={`${pieData.length} ligne(s)`}
      >
        {pieData.length === 0 ? (
          <EmptyState>Ajoute une position pour voir sa répartition.</EmptyState>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6 mt-2">
            <div className="h-64 w-full sm:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={100} paddingAngle={2} stroke="none">
                    {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
                        <span className="text-slate-100 font-data">{payload[0].name}</span>
                        <div className="text-slate-400">{eur(payload[0].value)}</div>
                      </div>
                    ) : null
                  } />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-1/2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-data tabular-nums text-slate-300">{pctPlain((d.value / bourseTotal) * 100)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CarteRepliable>

      <SectorHeatmap positions={bourse.positions} />
      </>
      )}

      {subTab === "performance" && (
      <PerformanceTab
        bourse={bourse}
        bourseHistory={bourseHistory}
	setBourseHistory={setBourseHistory}
        bourseGainAbs={bourseGainAbs}
        trackLoading={trackLoading}
        trackError={trackError}
        captureSnapshot={captureSnapshot}
        hasEnoughHistory={hasEnoughHistory}
        hasEnoughBase100={hasEnoughBase100}
        perfRange={perfRange}
        setPerfRange={setPerfRange}
        selectedBenchmarks={selectedBenchmarks}
        setSelectedBenchmarks={setSelectedBenchmarks}
        showDividendsReinvested={showDividendsReinvested}
        setShowDividendsReinvested={setShowDividendsReinvested}
      />
      )}

      {subTab === "marche" && <Marche watchlist={watchlist} setWatchlist={setWatchlist} openRequest={marcheRequest} positions={bourse.positions} />}

      {/* Le calendrier a désormais son propre sous-onglet. Il était auparavant
          accroché en bas de l'onglet Performance, où on ne le trouvait pas, et
          il déclenchait ses appels réseau même quand on venait consulter la
          performance. Il couvre maintenant le portefeuille ET la watchlist. */}
      {subTab === "screener" && (
        <Screener
          bourse={bourse}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          onOpenMarket={openInMarche}
        />
      )}

      {subTab === "calendrier" && (
        <FinancialCalendar positions={bourse.positions} watchlist={watchlist} />
      )}

      {panicPosition && (
        <AntiPanicModal
          position={panicPosition}
          note={findNoteForTicker(panicPosition.ticker)}
          onClose={() => setPanicPosition(null)}
        />
      )}
    </div>
  );
}

function AddPositionPanel({ open, onClose, onSubmit }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [pru, setPru] = useState("");
  const [annualDividend, setAnnualDividend] = useState("");
  const [manual, setManual] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); setSelected(null); setQuantity(""); setPru(""); setAnnualDividend(""); setManual(false); setError(""); }
  }, [open]);

  useEffect(() => {
    if (manual || selected) return;
    if (query.trim().length < 2) { setResults([]); return; }
    setLoading(true); setError("");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try { const r = await searchSecurity(query.trim()); setResults(r); }
      catch { setError("Recherche indisponible pour le moment."); }
      finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query, manual, selected]);

  if (!open) return null;

  const pickResult = async (r) => {
    setSelected({ ...r, current_price: null, currency: "" });
    setResults([]); setLoading(true); setError("");
    try {
      const quotes = await fetchQuotes([r.symbol]);
      const q = quotes[0];
      if (q?.ok) setSelected((s) => ({ ...s, current_price: q.price, currency: q.currency }));
      else { setError("Cours indisponible — tu peux le saisir manuellement."); setSelected((s) => ({ ...s, current_price: 0 })); }
    } catch { setError("Cours indisponible — tu peux le saisir manuellement."); setSelected((s) => ({ ...s, current_price: 0 })); }
    finally { setLoading(false); }
  };

  const ready = manual ? query.trim().length > 0 : !!selected;

  const submit = (e) => {
    e.preventDefault();
    if (!quantity || !pru || !ready) return;
    if (manual) {
      onSubmit({ ticker: query.toUpperCase(), name: query, type: "Autre", quantity: parseFloat(quantity), pru: parseFloat(pru), current_price: parseFloat(pru), annual_dividend: parseFloat(annualDividend) || 0 });
    } else {
      onSubmit({ ticker: selected.symbol, name: selected.name, type: selected.type || "Autre", quantity: parseFloat(quantity), pru: parseFloat(pru), current_price: selected.current_price || 0, annual_dividend: parseFloat(annualDividend) || 0, currency: selected.currency || "EUR" });
    }
    onClose();
  };

  return (
    <form onSubmit={submit} className="mt-3 p-4 rounded-xl border border-amber-400/20 bg-slate-950 space-y-3">
      {!manual ? (
        <>
          <label className="text-[11px] text-slate-500">Ticker, ISIN ou nom du produit</label>
          <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Ex : CW8, FR0011550185, Air Liquide..." className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400/60" />
          {loading && <p className="text-xs text-slate-500">Recherche en cours…</p>}
          {error && <p className="text-xs text-amber-400/90">{error}</p>}
          {!selected && results.length > 0 && (
            <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 max-h-44 overflow-y-auto">
              {results.map((r) => (
                <button type="button" key={r.symbol} onClick={() => pickResult(r)} className="w-full text-left px-3 py-2 hover:bg-slate-800 text-sm">
                  <span className="text-slate-100 font-medium">{r.symbol}</span>
                  <span className="text-slate-500"> — {r.name} {r.exchange ? `(${r.exchange})` : ""}</span>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 px-3 py-2">
              <div>
                <div className="text-sm text-slate-100 font-medium">{selected.symbol} — {selected.name}</div>
                <div className="text-xs text-slate-500">Cours actuel : {selected.current_price != null ? `${selected.current_price} ${selected.currency || ""}` : "…"}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-slate-500 hover:text-rose-400">Changer</button>
            </div>
          )}
          <button type="button" onClick={() => setManual(true)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">Le produit n'est pas trouvé ? Saisie manuelle</button>
        </>
      ) : (
        <>
          <label className="text-[11px] text-slate-500">Nom / ticker (saisie libre)</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400/60" placeholder="Ex : Plan Épargne Entreprise" />
          <button type="button" onClick={() => setManual(false)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">Revenir à la recherche</button>
        </>
      )}
      {ready && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-500">Quantité</label>
            <input required type="number" step="0.0001" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
          </div>
          <div>
            <label className="text-[11px] text-slate-500">Prix de revient unitaire (€)</label>
            <input required type="number" step="0.01" value={pru} onChange={(e) => setPru(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] text-slate-500">Dividende annuel par action (€) — optionnel</label>
            <input type="number" step="0.01" placeholder="Ex : 1.20" value={annualDividend} onChange={(e) => setAnnualDividend(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
          </div>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">Annuler</button>
        <button type="submit" disabled={!ready || !quantity || !pru} className="text-xs font-semibold bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-lg px-4 py-1.5">Ajouter au portefeuille</button>
      </div>
    </form>
  );
}