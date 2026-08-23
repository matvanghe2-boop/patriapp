import { useState, useMemo, useId } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  TrendingUp, PiggyBank, Landmark, Wallet, ArrowUpRight, ArrowDownRight,
  Target, AlertCircle, Clock, ChevronDown, ChevronUp, Zap, ListChecks, ArrowRight, Scale, Sparkles,
} from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, AddPanel, CustomTooltip, EmptyState, PageGlow, ChampNumerique, CARD_THEMES } from "./ui";
import {
  eur, pct, pctPlain, compact, uid, guessEnvelope, ENVELOPE_META, computeDiversificationScore,
  computeInvestedCapital, investedCapitalAsOf, todayIso, netWorthDelta, projectMonthly, valeurPosition, lireNombre } from "../lib/finance";
import { usePersistentState } from "../lib/storage";
import { useMaintenant, joursDepuis } from "../lib/useMaintenant";
import { useToast } from "../lib/ToastContext";
import { exportToExcel, exportToPDF } from "../lib/exportReport";
import Objectifs from "./Objectifs";
import { FileDown, FileSpreadsheet, PieChart as PieIcon } from "lucide-react";

function formatDateFr(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Time filter config ────────────────────────────────────────────────────────
const TIME_FILTERS = [
  { key: "1M", label: "1M", months: 1 },
  { key: "6M", label: "6M", months: 6 },
  { key: "1Y", label: "1Y", months: 12 },
  { key: "ALL", label: "ALL", months: null },
];

function getMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

// ─── Plafonds légaux connus (réutilisé ici pour détecter les livrets pleins) ──
const LEGAL_CEILINGS = {
  "livret a": 22950, "ldds": 12000, "lep": 10000, "livret jeune": 1600,
  "pel": 61200, "cel": 15300,
};
function guessLegalLimit(name) {
  const key = (name || "").toLowerCase().trim();
  for (const [k, v] of Object.entries(LEGAL_CEILINGS)) {
    if (key.includes(k)) return v;
  }
  return null;
}

// ─── Panneau d'actions prioritaires ────────────────────────────────────────────
// Consolide des signaux qui n'existent nulle part ailleurs dans l'app (pas de
// doublon avec la StagnationBadge ni avec les alertes déjà présentes dans
// Bourse/Livrets) : plafonds de livrets saturés, cash PEA dormant, matelas de
// sécurité insuffisant.
function PriorityActions({ livrets, bourse, matelasMois }) {
  const actions = useMemo(() => {
    const list = [];

    (livrets || []).forEach((l) => {
      const limit = l.limit || guessLegalLimit(l.name);
      if (limit && l.balance / limit >= 0.95) {
        list.push({
          id: `livret-${l.id}`,
          icon: AlertCircle,
          tone: "amber",
          text: `${l.name} est proche ou au plafond — orienter les prochains versements ailleurs.`,
        });
      }
    });

    const cashPocket = bourse?.cash_pocket || 0;
    const bourseValue = (bourse?.positions || []).reduce((s, p) => s + valeurPosition(p), 0);
    if (cashPocket > 500 && bourseValue > 0 && cashPocket / (cashPocket + bourseValue) > 0.15) {
      list.push({
        id: "cash-dormant",
        icon: Wallet,
        tone: "violet",
        text: `${eur(cashPocket, 0)} de cash dorment sur ton PEA — envisage de les investir.`,
        sensitive: true,
      });
    }

    if (matelasMois != null && matelasMois < 3) {
      list.push({
        id: "matelas-faible",
        icon: PiggyBank,
        tone: "rose",
        text: `Matelas de sécurité de ${matelasMois.toFixed(1)} mois seulement — viser au moins 3 mois de dépenses.`,
      });
    }

    return list;
  }, [livrets, bourse, matelasMois]);

  if (actions.length === 0) return null;

  const toneClass = { amber: "text-amber-300 bg-amber-400/10", violet: "text-violet-300 bg-violet-400/10", rose: "text-rose-300 bg-rose-400/10" };

  return (
    <Card accent={CARD_THEMES.emerald}>
      <CardLabel icon={ListChecks}>À faire</CardLabel>
      <div className="space-y-1.5 mt-2">
        {actions.map((a) => (
          <div key={a.id} className="flex items-center gap-3 text-sm rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
            <span className={`rounded-full p-1.5 shrink-0 ${toneClass[a.tone]}`}>
              <a.icon size={14} />
            </span>
            <span className={`text-slate-300 flex-1 ${a.sensitive ? "ghost-blur" : ""}`}>{a.text}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Accueil d'un patrimoine encore vierge ────────────────────────────────────
// L'app démarrait sur un patrimoine de démonstration (Livret A à 7 000 €,
// 30 parts de CW8) que rien ne signalait comme fictif. Elle démarre désormais
// vide, et cette carte explique quoi faire — avec le jeu d'exemple accessible,
// mais nommé pour ce qu'il est.
function OnboardingCard({ onLoadDemo }) {
  return (
    <Card accent={CARD_THEMES.emerald}>
      <CardLabel icon={Sparkles}>Bienvenue</CardLabel>
      <p className="text-sm text-slate-300 mt-1">
        Ton patrimoine est encore vide. Commence par renseigner tes supports d'épargne dans
        « Livrets &amp; Épargne », puis tes positions dans « PEA &amp; Bourse » — ce tableau de bord
        se remplit tout seul ensuite.
      </p>
      <button
        onClick={onLoadDemo}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-100 border border-slate-700 hover:border-slate-500 rounded-lg px-3.5 py-2 transition-colors mt-4"
      >
        <ArrowRight size={14} aria-hidden="true" /> Charger un jeu d'exemple
      </button>
      <p className="text-[11px] text-slate-600 mt-3">
        Le jeu d'exemple contient des chiffres inventés, à des fins de démonstration uniquement.
        Tu pourras tout effacer depuis « Réinitialiser », dans le menu.
      </p>
    </Card>
  );
}

// ─── Fraîcheur du profil mensuel ──────────────────────────────────────────────
const PROFILE_STALE_DAYS = 120;

function ProfileFreshness({ updatedAt, history = [] }) {
  const [showHistory, setShowHistory] = useState(false);
  // Instant figé pour ce rendu (voir useMaintenant) : `Date.now()` appelé ici
  // rendait le composant impur et laissait le badge périmé indéfiniment.
  const maintenant = useMaintenant();

  if (!updatedAt) {
    return (
      <p className="text-[11px] text-slate-600 mt-3">
        Renseigne ton revenu et tes dépenses : le taux d'épargne et le matelas de sécurité en
        dépendent.
      </p>
    );
  }

  const days = joursDepuis(updatedAt, maintenant);
  const stale = days >= PROFILE_STALE_DAYS;
  const previous = history.slice(0, -1).slice(-6).reverse();

  return (
    <div className="mt-3 pt-3 border-t border-slate-800">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className={`flex items-center gap-1.5 text-[11px] ${stale ? "text-amber-300" : "text-slate-600"}`}>
          {stale ? <AlertCircle size={11} aria-hidden="true" /> : <Clock size={11} aria-hidden="true" />}
          {days === 0
            ? "Mis à jour aujourd'hui"
            : stale
              ? `Inchangé depuis ${days} jours — vérifie que c'est toujours d'actualité`
              : `Mis à jour il y a ${days} jour${days > 1 ? "s" : ""}`}
        </span>
        {previous.length > 0 && (
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="flex items-center gap-1 text-[11px] text-emerald-300/70 hover:text-emerald-300"
          >
            {showHistory ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
            Historique
          </button>
        )}
      </div>

      {showHistory && previous.length > 0 && (
        <ul className="mt-2 space-y-1">
          {previous.map((h) => (
            <li key={h.date} className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-data tabular-nums">{formatDateFr(h.date)}</span>
              <span className="font-data tabular-nums ghost-blur">
                {eur(h.monthly_income)} − {eur(h.monthly_expenses)} ={" "}
                <span className="text-slate-300">{eur(h.monthly_income - h.monthly_expenses)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Badge de fraîcheur des cours ─────────────────────────────────────────────
// Mesure la date de dernière actualisation des COURS (bourse.pricesUpdatedAt),
// et non celle de l'historique de patrimoine : ce dernier étant alimenté
// automatiquement à chaque ouverture de l'app, le badge affichait
// invariablement « Actualisé aujourd'hui » et ses autres états étaient
// inatteignables.
function StagnationBadge({ pricesUpdatedAt, hasPositions }) {
  // Même raison que dans ProfileFreshness : ce badge annonce la fraîcheur des
  // cours, il ne peut pas se contenter d'un instant lu pendant le rendu.
  const maintenant = useMaintenant();
  if (!hasPositions) return null;
  if (!pricesUpdatedAt) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] border rounded-full px-2.5 py-1 text-slate-500 border-slate-700 bg-slate-900/50">
        <Clock size={10} aria-hidden="true" />
        Cours jamais actualisés
      </span>
    );
  }
  const diffDays = joursDepuis(pricesUpdatedAt, maintenant);
  const color =
    diffDays === 0 ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/5"
    : diffDays <= 3 ? "text-amber-300 border-amber-400/30 bg-amber-400/5"
    : "text-rose-400 border-rose-400/30 bg-rose-400/5";
  const label =
    diffDays === 0 ? "Cours actualisés aujourd'hui"
    : diffDays === 1 ? "Cours actualisés hier"
    : `Cours vieux de ${diffDays} jours`;
  return (
    <span className={`flex items-center gap-1.5 text-[11px] border rounded-full px-2.5 py-1 ${color}`}>
      <Clock size={10} aria-hidden="true" />
      {label}
    </span>
  );
}

// ─── Time filter buttons ──────────────────────────────────────────────────────
function TimeFilterBar({ active, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {TIME_FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors ${
            active === f.key
              ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
              : "text-slate-500 hover:text-slate-300 border border-transparent"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// ─── Allocation target panel ──────────────────────────────────────────────────
function AllocationTarget({ target, setTarget, livretsTotal, bourseTotal }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(target);
  const total = livretsTotal + bourseTotal;
  if (total === 0) return null;

  const currentBoursePct = total > 0 ? (bourseTotal / total) * 100 : 0;
  const currentLivretsPct = 100 - currentBoursePct;
  const targetBoursePct = target.bourse;
  const targetLivretsPct = 100 - targetBoursePct;

  const gapBourse = currentBoursePct - targetBoursePct;
  const absGap = Math.abs(gapBourse);

  // Compute next investment suggestion
  const nextAmount = 500;
  let suggestion = null;
  if (absGap > 2) {
    if (gapBourse < 0) {
      suggestion = `Pour te rapprocher de ta cible, oriente tes prochains ${eur(nextAmount)} vers ton PEA/Bourse.`;
    } else {
      suggestion = `Pour te rapprocher de ta cible, oriente tes prochains ${eur(nextAmount)} vers tes livrets.`;
    }
  }

  const save = () => {
    setTarget(draft);
    setEditing(false);
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-800">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider">
          <Target size={11} />
          Allocation cible
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className="flex items-center gap-1 text-[11px] text-amber-300/70 hover:text-amber-300"
        >
          {editing ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {editing ? "Fermer" : "Définir ma cible"}
        </button>
      </div>

      {/* Bars: Current vs Target */}
      <div className="space-y-2.5">
        {/* Épargne sécurisée */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>Épargne sécurisée</span>
            <span>
              <span className="text-slate-300 font-data">{currentLivretsPct.toFixed(0)}%</span>
              <span className="text-slate-600 mx-1">→</span>
              <span className="text-teal-400 font-data">{targetLivretsPct.toFixed(0)}%</span>
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-800 overflow-visible">
            <div
              className="absolute top-0 left-0 h-2 rounded-full bg-teal-400/50 transition-all"
              style={{ width: `${currentLivretsPct}%` }}
            />
            <div
              className="absolute top-0 left-0 h-2 rounded-full border-2 border-teal-400 bg-transparent transition-all"
              style={{ width: `${targetLivretsPct}%` }}
            />
          </div>
        </div>
        {/* Bourse */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 mb-1">
            <span>Bourse (PEA)</span>
            <span>
              <span className="text-slate-300 font-data">{currentBoursePct.toFixed(0)}%</span>
              <span className="text-slate-600 mx-1">→</span>
              <span className="text-amber-400 font-data">{targetBoursePct.toFixed(0)}%</span>
            </span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-800 overflow-visible">
            <div
              className="absolute top-0 left-0 h-2 rounded-full bg-amber-400/50 transition-all"
              style={{ width: `${currentBoursePct}%` }}
            />
            <div
              className="absolute top-0 left-0 h-2 rounded-full border-2 border-amber-400 bg-transparent transition-all"
              style={{ width: `${targetBoursePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Ecart */}
      {absGap > 2 && (
        <div className="flex items-start gap-2 mt-3 text-[11px] text-amber-300/80 bg-amber-400/5 border border-amber-400/15 rounded-lg px-3 py-2">
          <Zap size={11} className="mt-0.5 shrink-0" />
          <span>{suggestion}</span>
        </div>
      )}
      {absGap <= 2 && absGap >= 0 && (
        <div className="flex items-center gap-2 mt-3 text-[11px] text-emerald-400/80 bg-emerald-400/5 border border-emerald-400/15 rounded-lg px-3 py-2">
          <Target size={11} />
          Ton allocation est conforme à ta cible. ✓
        </div>
      )}

      {/* Edit slider */}
      {editing && (
        <div className="mt-4 p-3 rounded-xl border border-slate-700 bg-slate-950">
          <label htmlFor={`${idsChamps}-part-bourse-cible`} className="text-[11px] text-slate-500 block mb-2">
            Part Bourse cible : <span className="text-amber-300 font-data">{draft.bourse}%</span>
          </label>
          <input id={`${idsChamps}-part-bourse-cible`}
            type="range"
            min={0}
            max={100}
            step={5}
            value={draft.bourse}
            onChange={(e) => setDraft({ bourse: parseInt(e.target.value) })}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>100% Livrets</span>
            <span>100% Bourse</span>
          </div>
          <button
            onClick={save}
            className="mt-3 w-full text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-4 py-1.5 transition-colors"
          >
            Enregistrer la cible
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Custom tooltip for chart with projection ─────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 font-data tabular-nums">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.stroke }} />
          <span className="text-slate-400">{p.name} :</span>
          <span className={`ghost-blur ${p.name?.includes("Projection") ? "text-amber-300/70" : "text-slate-100"}`}>
            {eur(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// Le relevé quotidien du patrimoine net a été remonté au niveau de <App>
// (voir src/lib/useDailySnapshot.js) : ici, il ne se déclenchait que si
// l'utilisateur ouvrait cet onglet-là dans la journée.

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard({
  profile, setProfile, patrimoineBrut, patrimoineNet, bourseGainAbs, bourseGainPct,
  epargneMensuelle, tauxEpargne, dettes, setDettes, dettesTotal,
  historyPast, setHistoryPast, livretsTotal, bourseTotal,
  livrets, bourse, matelasMois, setLastSnapshotDate,
  cash, livretsAvgRate, sim, isEmpty, loadDemoData, profileHistory,
  objectifs, setObjectifs,
}) {
  const [showAddDette, setShowAddDette] = useState(false);
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [timeFilter, setTimeFilter] = useState("ALL");
  const { showToast } = useToast();

  // Allocation cible — passe par l'état persistant, et donc par la
  // synchronisation cloud. Elle était écrite en direct dans le localStorage :
  // c'était la seule donnée de l'app à ne jamais suivre d'un appareil à
  // l'autre, sans que rien ne le signale.
  const [allocationTarget, saveAllocationTarget] = usePersistentState("allocationTarget", { bourse: 60 });

  const addDette = (v) => setDettes((d) => [...d, { id: uid(), name: v.name, amount: v.amount }]);

  // Suppressions annulables. Elles étaient jusqu'ici immédiates et sans filet :
  // un clic sur la corbeille effaçait un passif ou un relevé d'historique sans
  // confirmation ni retour en arrière possible.
  const removeDette = (id) => {
    const previous = dettes;
    const dette = dettes.find((d) => d.id === id);
    setDettes((d) => d.filter((x) => x.id !== id));
    showToast({
      message: `Passif « ${dette?.name || "sans nom"} » supprimé.`,
      onUndo: () => setDettes(previous),
    });
  };

  const addHistoryPoint = (v) => {
    const today = todayIso();
    // Tri chronologique à l'insertion : un point saisi avec une date passée
    // atterrissait en fin de tableau, ce qui faisait faire des allers-retours
    // dans le temps à la courbe et désignait le dernier point SAISI (et non le
    // plus récent) comme référence du delta mensuel.
    // `manual: true` protège ce point du compactage automatique de
    // l'historique : c'est un jalon voulu, pas un relevé quotidien.
    setHistoryPast((h) =>
      [...h, { id: uid(), label: v.label, value: lireNombre(v.value), date: v.date || today, manual: true }].sort(
        (a, b) => ((a.date || "") < (b.date || "") ? -1 : 1)
      )
    );
    // Un point saisi à la main pour aujourd'hui tient lieu de relevé du jour :
    // sans ça, le relevé automatique en ajouterait un second en doublon.
    setLastSnapshotDate(v.date || today);
  };
  // Écart sur 30 jours glissants. La référence est le relevé le plus proche de
  // J-30 (voir netWorthDelta) : prendre le point le PLUS RÉCENT, comme avant,
  // revenait à se comparer au relevé automatique du jour même, donc à afficher
  // un écart nul en permanence.
  const delta30j = useMemo(
    () => netWorthDelta(historyPast, patrimoineNet, 30),
    [historyPast, patrimoineNet]
  );

  // Effort d'épargne vs gains de marché. `versementsCumules` se lit désormais
  // sur le journal d'opérations : `bourseInvested` (Σ quantité × PRU) est le
  // prix de revient des titres DÉTENUS, qui chute à chaque vente et ne mesure
  // donc pas ce qui a été versé.
  const versementsCumules = useMemo(
    () => investedCapitalAsOf(computeInvestedCapital(bourse), todayIso()),
    [bourse]
  );
  const gainsMarcheReels = bourseGainAbs || 0;

  // Taux annuel moyen pondéré du patrimoine : taux réels des livrets pour la
  // poche sécurisée, hypothèse de rendement de l'onglet Simulation pour la
  // poche bourse. C'est ce que l'app sait de mieux sur le rendement attendu.
  const blendedRatePct = useMemo(() => {
    const base = livretsTotal + bourseTotal;
    if (base <= 0) return 0;
    const bourseRate = sim?.bourse?.rate ?? 0;
    return (livretsTotal * (livretsAvgRate || 0) + bourseTotal * bourseRate) / base;
  }, [livretsTotal, bourseTotal, livretsAvgRate, sim]);

  // Build chart data with time filter + projection
  const chartData = useMemo(() => {
    // Le relevé quotidien crée déjà un point daté d'aujourd'hui (libellé
    // « 3 août »). Ajouter systématiquement un point « Aujourd'hui » par-dessus
    // donnait deux points pour la même journée, et donc deux graduations
    // côte à côte sur l'axe des abscisses. On relabellise le point existant
    // plutôt que d'en créer un second.
    const today = todayIso();
    const allPoints = historyPast.some((h) => h.date === today)
      ? historyPast.map((h) =>
          h.date === today
            ? { label: "Aujourd'hui", value: Math.round(patrimoineNet), date: h.date }
            : { label: h.label, value: h.value, date: h.date }
        )
      : [
          ...historyPast.map((h) => ({ label: h.label, value: h.value, date: h.date })),
          { label: "Aujourd'hui", value: Math.round(patrimoineNet), date: today },
        ];

    // Apply time filter
    let filtered = allPoints;
    const filterConfig = TIME_FILTERS.find((f) => f.key === timeFilter);
    if (filterConfig?.months) {
      const cutoff = getMonthsAgo(filterConfig.months);
      filtered = allPoints.filter((p) => {
        if (!p.date) return true;
        return new Date(p.date) >= cutoff;
      });
      if (filtered.length === 0) filtered = allPoints.slice(-2);
    }

    // Projection à 6 mois. Elle était strictement linéaire
    // (patrimoineNet + épargne × mois), donc à rendement nul : elle ignorait à
    // la fois le taux des livrets et celui de la poche bourse, alors que
    // l'application connaît les deux. On capitalise désormais au taux moyen
    // pondéré du patrimoine réel.
    const projectionMonths = 6;
    const projectionPoints = [];
    const now = new Date();
    for (let i = 1; i <= projectionMonths; i++) {
      const futureDate = new Date(now);
      futureDate.setMonth(futureDate.getMonth() + i);
      const label = futureDate.toLocaleDateString("fr-FR", { month: "short" });
      projectionPoints.push({
        label,
        projection: Math.round(projectMonthly(patrimoineNet, blendedRatePct, epargneMensuelle, i)),
        date: futureDate.toISOString().slice(0, 10),
      });
    }

    // Merge: last real point ties into first projection
    const histData = filtered.map((p) => ({ ...p, projection: undefined }));
    // Connect real line to first projection point
    if (histData.length > 0) {
      histData[histData.length - 1].projection = Math.round(patrimoineNet);
    }

    return [...histData, ...projectionPoints];
  }, [historyPast, patrimoineNet, epargneMensuelle, timeFilter, blendedRatePct]);

  // Allocation data — répartition par enveloppe fiscale (PEA/CTO/AV/PER/Livret/Cash)
  const allocationData = useMemo(() => {
    const byEnvelope = {};
    (livrets || []).forEach((l) => {
      const key = l.envelope || guessEnvelope(l.name);
      byEnvelope[key] = (byEnvelope[key] || 0) + (l.balance || 0);
    });
    if (bourseTotal > 0) {
      const key = bourse?.envelope || "PEA";
      byEnvelope[key] = (byEnvelope[key] || 0) + bourseTotal;
    }
    return Object.entries(byEnvelope)
      .map(([key, value]) => ({
        name: ENVELOPE_META[key]?.label || key,
        value,
        color: ENVELOPE_META[key]?.color || "#94a3b8",
      }))
      .filter((d) => d.value > 0);
  }, [livrets, bourseTotal, bourse]);
  const totalAlloc = allocationData.reduce((s, d) => s + d.value, 0);

  // Score de diversification globale — concentration par classe d'actif
  // (types de positions bourse + épargne sécurisée regroupée).
  const diversification = useMemo(() => {
    const classes = {};
    (bourse?.positions || []).forEach((p) => {
      const key = p.type || "Autre";
      classes[key] = (classes[key] || 0) + valeurPosition(p);
    });
    if (bourse?.cash_pocket > 0) classes["Cash PEA"] = (classes["Cash PEA"] || 0) + bourse.cash_pocket;
    if (livretsTotal > 0) classes["Épargne sécurisée"] = (classes["Épargne sécurisée"] || 0) + livretsTotal;
    const list = Object.entries(classes).map(([name, value]) => ({ name, value }));
    return computeDiversificationScore(list);
  }, [bourse, livretsTotal]);

  return (
    <div className="relative space-y-6">
      <PageGlow color="emerald" />
      <div className="flex items-start justify-between relative">
        <div>
          <h1 className="font-display text-2xl text-slate-50">
            Dashboard <span className="text-emerald-400">global</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">La photographie consolidée de ton patrimoine, à date.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              exportToExcel({
                patrimoineBrut, patrimoineNet, dettesTotal, livretsTotal, bourseTotal, cash,
                livrets, bourse, envelopeBreakdown: allocationData,
              })
            }
            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-400/40 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <FileSpreadsheet size={13} /> Excel
          </button>
          <button
            onClick={() =>
              exportToPDF({
                patrimoineBrut, patrimoineNet, dettesTotal, envelopeBreakdown: allocationData,
                livrets, bourse, cash, diversification,
              })
            }
            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-400/40 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <FileDown size={13} /> PDF
          </button>
          <StagnationBadge
            pricesUpdatedAt={bourse?.pricesUpdatedAt}
            hasPositions={(bourse?.positions || []).length > 0}
          />
        </div>
      </div>

      {isEmpty && <OnboardingCard onLoadDemo={loadDemoData} />}

      {/* Actions prioritaires cross-onglets */}
      <PriorityActions livrets={livrets} bourse={bourse} matelasMois={matelasMois} />

      {/* Profil mensuel */}
      <Card accent={CARD_THEMES.emerald}>
        <div className="flex flex-wrap items-center gap-6">
          <CardLabel icon={Wallet}>Profil mensuel</CardLabel>
          <div className="flex items-center gap-2">
            <label htmlFor="profil-revenu" className="text-xs text-slate-500">Revenu net</label>
            {/* Validé à la sortie du champ, pas à chaque caractère : voir
                ChampNumerique. Chaque frappe écrivait sinon une entrée datée
                dans l'historique du profil et re-rendait tout l'onglet. */}
            <ChampNumerique
              id="profil-revenu"
              type="number"
              value={profile.monthly_income}
              onCommit={(v) => setProfile((p) => ({ ...p, monthly_income: v }))}
              className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums ghost-blur focus:outline-none focus:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/30"
            />
            <span className="text-xs text-slate-600">€/mois</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="profil-depenses" className="text-xs text-slate-500">Dépenses</label>
            <ChampNumerique
              id="profil-depenses"
              type="number"
              value={profile.monthly_expenses}
              onCommit={(v) => setProfile((p) => ({ ...p, monthly_expenses: v }))}
              className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums ghost-blur focus:outline-none focus:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/30"
            />
            <span className="text-xs text-slate-600">€/mois</span>
          </div>
        </div>

        {/* Ces deux nombres déterminent le taux d'épargne, le matelas de
            sécurité et l'alerte associée. Sans repère d'ancienneté, une saisie
            oubliée les rendait faux tous les trois, en silence. */}
        <ProfileFreshness updatedAt={profile.updatedAt} history={profileHistory} />
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4">
        <div
          className="flex flex-col items-center justify-center text-center rounded-full mx-auto p-6 aspect-square w-[190px]"
          style={{
            background: "radial-gradient(circle at 32% 30%, rgba(16,185,129,0.12), transparent 65%)",
            border: "1.5px solid rgba(16,185,129,0.35)",
          }}
        >
          <span className="text-[11px] uppercase tracking-widest text-emerald-300/80 font-medium">Patrimoine net</span>
          <span className="font-display text-[26px] text-slate-50 mt-1.5 leading-tight ghost-blur">{eur(patrimoineNet)}</span>
          {delta30j.hasReference ? (
            <span
              title={`Référence : relevé du ${formatDateFr(delta30j.refDate)}`}
              className={`text-xs mt-1.5 flex items-center gap-1 ghost-blur ${delta30j.abs >= 0 ? "text-emerald-400" : "text-rose-400"}`}
            >
              {delta30j.abs >= 0 ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}
              {eur(Math.abs(delta30j.abs))} sur 30 jours
            </span>
          ) : (
            <span className="text-xs mt-1.5 text-slate-600">Pas encore d'historique</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card accent={CARD_THEMES.emerald}>
            <CardLabel icon={Landmark}>Patrimoine brut</CardLabel>
            <div className="font-display text-xl text-slate-100 ghost-blur">{eur(patrimoineBrut)}</div>
            {dettesTotal > 0 && <div className="text-xs text-slate-500 mt-1 ghost-blur">dont −{eur(dettesTotal)} de passifs</div>}
          </Card>

          {/* Enhanced performance card: effort vs gains */}
          <Card accent={CARD_THEMES.emerald}>
            <CardLabel icon={TrendingUp}>Performance bourse</CardLabel>
            <div className={`font-display text-xl ghost-blur ${bourseGainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {eur(bourseGainAbs)}
            </div>
            <div className={`text-xs mt-1 ${bourseGainAbs >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
              {pct(bourseGainPct)}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                  Versements cumulés
                </span>
                <span className="font-data tabular-nums text-slate-300 ghost-blur">{eur(versementsCumules)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className={`flex items-center gap-1 ${gainsMarcheReels >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${gainsMarcheReels >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
                  Gains marché réels
                </span>
                <span className={`font-data tabular-nums ghost-blur ${gainsMarcheReels >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {eur(gainsMarcheReels)}
                </span>
              </div>
            </div>
          </Card>

          <Card accent={CARD_THEMES.emerald}>
            <CardLabel icon={PiggyBank}>Taux d'épargne mensuel</CardLabel>
            <div className="font-display text-xl text-slate-100 ghost-blur">{eur(epargneMensuelle)}</div>
            <div className="text-xs text-emerald-300/80 mt-1">{pct(tauxEpargne)} du revenu</div>
            {epargneMensuelle > 0 && (
              <div className="text-[11px] text-slate-600 mt-1 ghost-blur">
                Projection +{eur(epargneMensuelle * 6)} / 6 mois
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Allocation + historique */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Allocation card */}
        <Card accent={CARD_THEMES.emerald}>
          <CardLabel>Allocation d'actifs globale</CardLabel>
          {allocationData.length === 0 ? (
            <EmptyState>Ajoute un livret ou une position pour voir ta répartition.</EmptyState>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={72} paddingAngle={3} stroke="none">
                      {allocationData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                {allocationData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-400">
                      <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      {d.name}
                    </span>
                    {/* Le pourcentage était lisible alors que le montant était
                        flouté : combiné à l'échelle du graphique, il suffisait
                        à reconstituer les valeurs masquées. */}
                    <span className="font-data tabular-nums text-slate-300 ghost-blur">
                      {eur(d.value)} · {totalAlloc > 0 ? ((d.value / totalAlloc) * 100).toFixed(0) : 0} %
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {/* Score de diversification globale */}
          {diversification.n > 1 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wider">
                  <PieIcon size={11} />
                  Score de diversification
                </div>
                <span
                  className={`font-data text-sm font-semibold ${
                    diversification.score >= 66 ? "text-emerald-400" : diversification.score >= 33 ? "text-amber-300" : "text-rose-400"
                  }`}
                >
                  {Math.round(diversification.score)} / 100
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    diversification.score >= 66 ? "bg-emerald-400" : diversification.score >= 33 ? "bg-amber-400" : "bg-rose-400"
                  }`}
                  style={{ width: `${diversification.score}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5">
                {diversification.score >= 66
                  ? "Bonne répartition entre tes classes d'actifs."
                  : diversification.score >= 33
                  ? "Concentration modérée — surveille le poids de ta plus grosse classe d'actifs."
                  : "Patrimoine fortement concentré sur une seule classe d'actifs."}
              </p>
            </div>
          )}
          {/* Allocation target section */}
          <AllocationTarget
            target={allocationTarget}
            setTarget={saveAllocationTarget}
            livretsTotal={livretsTotal}
            bourseTotal={bourseTotal}
          />
          <p className="text-[11px] text-slate-600 mt-3">
            Le sous-onglet « Immobilier &amp; Crédit » de Simulation te permet de planifier un futur
            achat sans modifier cette répartition.
          </p>
        </Card>

        {/* History chart card */}
        <Card accent={CARD_THEMES.emerald}>
          <div className="flex items-center justify-between mb-1">
            <CardLabel>Évolution du patrimoine net</CardLabel>
            <div className="flex items-center gap-2">
              <TimeFilterBar active={timeFilter} onChange={setTimeFilter} />
              <GhostButton theme="emerald" onClick={() => setShowAddHistory((s) => !s)}>Ajouter</GhostButton>
            </div>
          </div>

          {/* Legend for projection */}
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <div className="w-6 h-0.5 bg-emerald-400 rounded" />
              Historique
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <div className="w-6 h-0.5 border-t-2 border-dashed border-emerald-400/50" />
              <span>
                Projection (<span className="ghost-blur">{eur(epargneMensuelle)}</span>/mois à{" "}
                {pctPlain(blendedRatePct, 1)})
              </span>
            </div>
          </div>

          <div className="h-52 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ left: -10, right: 5, top: 5 }}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="projFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={compact} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<ChartTooltip />} />
                {/* Vertical reference line at "Aujourd'hui" */}
                <ReferenceLine x="Aujourd'hui" stroke="#475569" strokeDasharray="3 3" label={{ value: "Auj.", fill: "#475569", fontSize: 10 }} />
                {/* Historical area */}
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Patrimoine net"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#netWorthFill)"
                  connectNulls={false}
                />
                {/* Projection dashed line */}
                <Line
                  type="monotone"
                  dataKey="projection"
                  name="Projection"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  strokeOpacity={0.55}
                  connectNulls={true}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <AddPanel
            open={showAddHistory}
            onClose={() => setShowAddHistory(false)}
            onSubmit={addHistoryPoint}
            fields={[
              { key: "label", label: "Libellé (ex: Juin)", type: "text", required: true },
              { key: "date", label: "Date (AAAA-MM-JJ)", type: "date", required: false },
              { key: "value", label: "Patrimoine net (€)", type: "number", step: "100", required: true },
            ]}
          />

          {/* Les valeurs détaillées de l'historique jour par jour ne sont plus
              affichées ici (données conservées en mémoire / stockage local,
              utilisées par le graphique et les calculs, simplement non listées). */}
        </Card>
      </div>

      {/* Objectifs datés — la seule chose qui transforme la courbe de
          patrimoine en réponse à « suis-je en avance ou en retard ? ». */}
      <Objectifs
        objectifs={objectifs}
        setObjectifs={setObjectifs}
        patrimoineNet={patrimoineNet}
        epargneMensuelle={epargneMensuelle}
        tauxAnnuelPct={blendedRatePct}
      />

      {/* Passifs */}
      <Card accent={CARD_THEMES.emerald}>
        <div className="flex items-center justify-between">
          <CardLabel>Passifs / Dettes</CardLabel>
          <GhostButton theme="emerald" onClick={() => setShowAddDette((s) => !s)}>Ajouter un passif</GhostButton>
        </div>
        {dettesTotal > 0 && patrimoineBrut > 0 && (
          <div className="flex items-center gap-2 mt-2 text-xs">
            <Scale size={12} className="text-slate-500" />
            <span className="text-slate-500">Ratio d'endettement (dette / patrimoine brut)</span>
            <span className={`font-data tabular-nums font-semibold ${dettesTotal / patrimoineBrut > 0.5 ? "text-rose-400" : dettesTotal / patrimoineBrut > 0.3 ? "text-amber-300" : "text-emerald-400"}`}>
              {pctPlain((dettesTotal / patrimoineBrut) * 100, 1)}
            </span>
          </div>
        )}
        {dettes.length === 0 ? (
          <EmptyState>Aucun passif déclaré — le patrimoine net est égal au patrimoine brut.</EmptyState>
        ) : (
          <div className="mt-2 divide-y divide-slate-800">
            {dettes.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-300">{d.name}</span>
                <div className="flex items-center gap-3">
                  <span className="font-data tabular-nums text-rose-400 ghost-blur">−{eur(d.amount)}</span>
                  <IconTrash onClick={() => removeDette(d.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
        <AddPanel
          open={showAddDette}
          onClose={() => setShowAddDette(false)}
          onSubmit={addDette}
          fields={[
            { key: "name", label: "Nom du passif", type: "text", placeholder: "Crédit conso, etc.", required: true },
            { key: "amount", label: "Montant restant (€)", type: "number", step: "100", required: true },
          ]}
        />
      </Card>
    </div>
  );
}
