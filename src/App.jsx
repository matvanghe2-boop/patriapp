import React, { useEffect, useMemo, Suspense, lazy } from "react";
import {
  LayoutDashboard, PiggyBank, TrendingUp, Calculator, NotebookPen,
  Repeat, Download, Upload, RotateCcw, Eye, EyeOff, LogOut,
} from "lucide-react";
import {
  exportAllData, importAllData, clearAllData, clearCloudData, markBackupDone,
} from "./lib/storage";
import { usePatrimoine, STORAGE_KEYS } from "./lib/PatrimoineContext";
import { todayIso, netWorthDelta } from "./lib/finance";
import { useDailySnapshot } from "./lib/useDailySnapshot";
import { useAlertesWatchlist } from "./lib/useAlertesWatchlist";
import { useBilanRappel } from "./lib/useBilanRappel";
import { useHashRoute } from "./lib/useHashRoute";
import { useToast } from "./lib/ToastContext";
import { useConfirm } from "./lib/ConfirmContext";
import { NavButton, SkeletonCard } from "./components/ui";
import GlobalSearch from "./components/GlobalSearch";
import Notifications from "./components/Notifications";
import SyncIndicator from "./components/SyncIndicator";
import BackupReminder from "./components/BackupReminder";
import BottomNav from "./components/BottomNav";
import StickySummaryHeader from "./components/StickySummaryHeader";
import { useAuth } from "./lib/AuthContext";

// Chaque onglet est chargé à la demande. Le bundle initial ne contient plus
// que le Dashboard : les 1 500 lignes de « PEA & Bourse », les graphiques
// recharts de « Marché » et le simulateur ne sont téléchargés que si
// l'utilisateur ouvre effectivement l'onglet correspondant.
const Dashboard = lazy(() => import("./components/Dashboard"));
const Livrets = lazy(() => import("./components/Livrets"));
const Bourse = lazy(() => import("./components/Bourse"));
const Simulation = lazy(() => import("./components/Simulation"));
const StrategieLogs = lazy(() => import("./components/StrategieLogs"));
const Abonnements = lazy(() => import("./components/Abonnements"));

// « Immobilier & Crédit » n'est plus une entrée de menu : c'est un sous-onglet
// de Simulation (voir Simulation.jsx). Les deux modules répondent à la même
// question — projeter une décision financière dans le temps — et le
// simulateur de crédit se consultait presque toujours dans la foulée d'une
// projection d'épargne.
// `shortLabel` sert à la barre de navigation basse du mobile, où « Livrets &
// Épargne » ne tient pas sous une icône de 22 px.
// Stratégie passe du cyan au rose : les deux derniers onglets partageaient
// exactement la même teinte, ce qui rendait la navigation et les fonds de page
// indistinguables entre eux. Le rose n'était plus utilisé par aucun onglet
// depuis la fusion d'Immobilier dans Simulation.
const TABS = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Accueil", icon: LayoutDashboard, theme: "emerald", Page: Dashboard },
  { id: "livrets", label: "Livrets & Épargne", shortLabel: "Épargne", icon: PiggyBank, theme: "indigo", Page: Livrets },
  { id: "bourse", label: "PEA & Bourse", shortLabel: "Bourse", icon: TrendingUp, theme: "violet", Page: Bourse },
  { id: "simulation", label: "Simulation", shortLabel: "Simuler", icon: Calculator, theme: "amber", Page: Simulation },
  { id: "strategie", label: "Stratégie & Logs", shortLabel: "Stratégie", icon: NotebookPen, theme: "rose", Page: StrategieLogs },
  { id: "abonnements", label: "Abonnements", shortLabel: "Abos", icon: Repeat, theme: "cyan", Page: Abonnements },
];

const TAB_IDS = TABS.map((t) => t.id);

// BottomNav raisonne en `key` là où le routage raisonne en `id`.
const BOTTOM_NAV_TABS = TABS.map((t) => ({
  key: t.id,
  label: t.label,
  shortLabel: t.shortLabel,
  icon: t.icon,
  theme: t.theme,
}));

// Un lien ou un favori vers #/immobilier doit continuer à mener quelque part
// de sensé plutôt que de retomber silencieusement sur le Dashboard.
const TAB_ALIASES = { immobilier: "simulation" };

// Fond de page teinté par domaine — même esprit que le bouton de nav actif :
// un fond dégradé bien visible derrière les cartes, pas juste un glow discret.
const TAB_BG = {
  dashboard: "bg-gradient-to-br from-emerald-950/70 via-slate-950 to-slate-950",
  livrets: "bg-gradient-to-br from-indigo-950/70 via-slate-950 to-slate-950",
  bourse: "bg-gradient-to-br from-violet-950/70 via-slate-950 to-slate-950",
  simulation: "bg-gradient-to-br from-amber-950/70 via-slate-950 to-slate-950",
  strategie: "bg-gradient-to-br from-rose-950/70 via-slate-950 to-slate-950",
  abonnements: "bg-gradient-to-br from-cyan-950/70 via-slate-950 to-slate-950",
};

export default function App() {
  const [tab, setTab] = useHashRoute(TAB_IDS, "dashboard", TAB_ALIASES);
  const [ghostMode, setGhostMode] = React.useState(false);
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const patrimoine = usePatrimoine();

  const activeTab = TABS.find((t) => t.id === tab) || TABS[0];

  // Variation sur 30 jours glissants, partagée par l'en-tête collant et le
  // Dashboard pour qu'ils ne puissent pas diverger.
  // Alertes de seuil de la watchlist : évaluées quel que soit l'onglet ouvert,
  // comme le relevé quotidien — une alerte visible seulement depuis l'onglet
  // Watchlist n'aurait aucun intérêt.
  const { rappels: alertesDues, acquitterAlerte } = useAlertesWatchlist({
    alertesWatchlist: patrimoine.alertesWatchlist,
    setAlertesWatchlist: patrimoine.setAlertesWatchlist,
  });

  // Le bilan mensuel ne s'affichait que dans Simulation → Projet, trois
  // niveaux sous l'accueil : un bilan proactif qu'il faut aller chercher n'en
  // est plus un.
  const { rappels: bilanDu, acquitterBilan } = useBilanRappel({
    patrimoineNet: patrimoine.patrimoineNet,
    historyPast: patrimoine.historyPast,
    tauxEpargne: patrimoine.tauxEpargne,
    matelasMois: patrimoine.matelasMois,
    dernierBilan: patrimoine.horizonDernierBilan,
    setDernierBilan: patrimoine.setHorizonDernierBilan,
  });

  const delta30j = useMemo(
    () => netWorthDelta(patrimoine.historyPast, patrimoine.patrimoineNet, 30),
    [patrimoine.historyPast, patrimoine.patrimoineNet]
  );

  useEffect(() => {
    document.title = `${activeTab.label} · Patrium`;
  }, [activeTab.label]);

  // Relevé quotidien du patrimoine net, quel que soit l'onglet ouvert.
  useDailySnapshot({
    patrimoineNet: patrimoine.patrimoineNet,
    historyPast: patrimoine.historyPast,
    setHistoryPast: patrimoine.setHistoryPast,
    lastSnapshotDate: patrimoine.lastSnapshotDate,
    setLastSnapshotDate: patrimoine.setLastSnapshotDate,
  });

  const handleExport = () => {
    const dump = exportAllData(STORAGE_KEYS);
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patrimoine-sauvegarde-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    markBackupDone();
    showToast({ message: "Sauvegarde exportée." });
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    let dump;
    try {
      dump = JSON.parse(await file.text());
    } catch {
      showToast({ type: "error", message: "Fichier de sauvegarde illisible (JSON invalide)." });
      return;
    }
    // Un JSON valide n'est pas forcément une sauvegarde Patrium : sans ce
    // contrôle, importer n'importe quel fichier .json écrasait les données
    // avec des clés qui n'ont aucun sens pour l'app.
    const keys = Object.keys(dump || {});
    const known = keys.filter((k) => STORAGE_KEYS.includes(k));
    if (!dump || typeof dump !== "object" || Array.isArray(dump) || known.length === 0) {
      showToast({ type: "error", message: "Ce fichier ne ressemble pas à une sauvegarde Patrium." });
      return;
    }

    const ok = await confirm({
      title: "Restaurer cette sauvegarde ?",
      message: `${known.length} section(s) seront remplacées par le contenu du fichier. Les données actuelles de cet appareil seront écrasées.`,
      confirmLabel: "Restaurer",
      danger: true,
    });
    if (!ok) return;

    importAllData(Object.fromEntries(known.map((k) => [k, dump[k]])));
    window.location.reload();
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: "Tout réinitialiser ?",
      message: user
        ? "Toutes tes données seront effacées : livrets, portefeuille, historique, abonnements — sur cet appareil ET sur ton compte, donc sur tous tes appareils. Cette action est irréversible : pense à exporter une sauvegarde avant."
        : "Toutes les données de cet appareil seront effacées : livrets, portefeuille, historique, abonnements. Cette action est irréversible — pense à exporter une sauvegarde avant.",
      confirmLabel: "Effacer définitivement",
      danger: true,
    });
    if (!ok) return;
    // L'effacement cloud doit précéder l'effacement local : sans lui, le
    // rechargement qui suit reprenait les données depuis Supabase (le local
    // n'ayant plus d'horodatage, la version cloud gagnait l'arbitrage) et la
    // réinitialisation n'avait aucun effet visible pour un compte connecté.
    try {
      await clearCloudData(STORAGE_KEYS);
    } catch {
      showToast({ type: "error", message: "Effacement cloud impossible — données locales conservées." });
      return;
    }
    clearAllData(STORAGE_KEYS);
    window.location.reload();
  };

  return (
    <div className={`flex flex-col md:flex-row min-h-screen bg-slate-950 text-slate-100 ${ghostMode ? "ghost-mode" : ""}`}>
      <a
        href="#contenu-principal"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-amber-400 focus:text-slate-950 focus:px-3 focus:py-2 focus:rounded-lg focus:text-sm focus:font-semibold"
      >
        Aller au contenu principal
      </a>

      <aside className="md:w-60 md:h-screen md:sticky md:top-0 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950 flex md:flex-col items-center md:items-stretch px-4 md:px-0 py-2 md:py-0">
        <div className="md:px-5 md:pt-6 md:pb-4 flex-1 md:flex-none">
          <div className="flex items-center justify-between">
            <div className="font-display text-lg text-slate-50">Patrium</div>
            <span className="hidden md:block">
              <GhostToggle ghostMode={ghostMode} setGhostMode={setGhostMode} />
            </span>
          </div>
          <div className="hidden md:block text-xs text-slate-500 mt-0.5">Vision consolidée &amp; simulation</div>
        </div>

        {/* Sur mobile, la navigation passe par la barre basse (BottomNav) :
            atteignable au pouce, elle remplace cette liste qui obligeait à
            faire défiler une rangée d'onglets horizontalement. */}
        <nav
          aria-label="Navigation principale"
          className="hidden md:flex md:flex-col gap-1 p-3 flex-1"
        >
          {TABS.map((t) => (
            <NavButton
              key={t.id}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
              icon={t.icon}
              label={t.label}
              theme={t.theme}
              current={tab === t.id}
            />
          ))}
        </nav>

        <div className="flex md:flex-col items-center md:items-stretch gap-3 md:gap-2 md:px-4 md:py-4 md:border-t border-slate-800">
          <button
            onClick={handleExport}
            aria-label="Exporter mes données"
            title="Exporter mes données"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 rounded"
          >
            <Download size={15} aria-hidden="true" />
            <span className="hidden md:inline">Exporter mes données</span>
          </button>
          <label
            title="Importer une sauvegarde"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-100 cursor-pointer focus-within:ring-2 focus-within:ring-amber-400/40 rounded"
          >
            <Upload size={15} aria-hidden="true" />
            <span className="hidden md:inline">Importer une sauvegarde</span>
            <span className="sr-only md:hidden">Importer une sauvegarde</span>
            <input type="file" accept="application/json" onChange={handleImport} className="sr-only" />
          </label>
          <button
            onClick={handleReset}
            aria-label="Réinitialiser toutes les données"
            title="Réinitialiser"
            className="flex items-center gap-2 text-xs text-slate-600 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 rounded"
          >
            <RotateCcw size={15} aria-hidden="true" />
            <span className="hidden md:inline">Réinitialiser</span>
          </button>
          <span className="md:hidden">
            <GhostToggle ghostMode={ghostMode} setGhostMode={setGhostMode} />
          </span>
          <p className="hidden md:block text-[11px] text-slate-600 leading-relaxed mt-1">
            Données stockées sur cet appareil et synchronisées sur ton compte. Les cours de bourse
            sont récupérés via un service externe.
          </p>
        </div>
      </aside>

      <main
        id="contenu-principal"
        className={`flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-6xl transition-colors duration-500 ${TAB_BG[tab] || ""}`}
      >
        {/* L'en-tête se condense au défilement pour garder le patrimoine net et
            sa variation visibles en permanence, sans immobiliser de la hauteur
            d'écran au repos. */}
        <StickySummaryHeader
          patrimoineNet={patrimoine.patrimoineNet}
          deltaPct={delta30j.hasReference ? delta30j.pct : null}
          ghostMode={ghostMode}
          onToggleGhost={() => setGhostMode((g) => !g)}
        >
          <GlobalSearch
            livrets={patrimoine.livrets}
            bourse={patrimoine.bourse}
            dettes={patrimoine.dettes}
            watchlist={patrimoine.watchlist}
            strategyNotes={patrimoine.strategyNotes}
            enveloppes={patrimoine.enveloppes}
            onNavigate={setTab}
          />
          <SyncIndicator />
          <Notifications
            reminders={patrimoine.reminders}
            setReminders={patrimoine.setReminders}
            alertes={[...bilanDu, ...alertesDues]}
            onAcquitterAlerte={acquitterAlerte}
            onAcquitterBilan={acquitterBilan}
          />
          {/* En mode local (sans compte), il n'y a rien à déconnecter. */}
          {user && (
            <button
              onClick={() => signOut()}
              aria-label={`Se déconnecter (${user.email})`}
              title={`Déconnecter ${user.email}`}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-300 border border-transparent hover:border-rose-500/30 rounded-lg px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          )}
        </StickySummaryHeader>

        <BackupReminder onExport={handleExport} />

        {/* La clé force le remontage — et donc l'animation d'entrée — à chaque
            changement d'onglet. aria-live annonce le changement de section aux
            lecteurs d'écran, qui n'ont sinon aucun repère de navigation. */}
        <div key={tab} className="animate-[fadeIn_0.3s_ease-out]">
          <h1 className="sr-only">{activeTab.label}</h1>
          <Suspense fallback={<TabSkeleton />}>
            <activeTab.Page {...patrimoine} />
          </Suspense>
        </div>
      </main>

      <BottomNav tabs={BOTTOM_NAV_TABS} active={tab} onChange={setTab} />
    </div>
  );
}

function GhostToggle({ ghostMode, setGhostMode }) {
  return (
    <button
      onClick={() => setGhostMode((g) => !g)}
      aria-pressed={ghostMode}
      aria-label={ghostMode ? "Afficher les montants" : "Masquer les montants (mode ghost)"}
      title="Mode Ghost (flouter les montants)"
      className="text-slate-500 hover:text-slate-200 p-1 md:p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
    >
      {ghostMode ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
    </button>
  );
}

function TabSkeleton() {
  return (
    <div role="status" aria-label="Chargement de la section" className="grid gap-4 sm:grid-cols-2">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard lines={5} className="sm:col-span-2" />
    </div>
  );
}
