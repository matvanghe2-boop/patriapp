import React, { useEffect, useMemo, Suspense, lazy } from "react";
import {
  LayoutDashboard, PiggyBank, TrendingUp, Calculator, NotebookPen,
  Repeat, Download, Upload, RotateCcw, Eye, EyeOff, LogOut, Palette, Sparkles,
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
import { theme } from "./lib/themes";
import GlobalSearch from "./components/GlobalSearch";
import Notifications from "./components/Notifications";
import SyncIndicator from "./components/SyncIndicator";
import BackupReminder from "./components/BackupReminder";
import EtatSourceMarche from "./components/EtatSourceMarche";
import BottomNav from "./components/BottomNav";
import StickySummaryHeader from "./components/StickySummaryHeader";
import { useAuth } from "./lib/AuthContext";
import { useApparence } from "./lib/ApparenceContext";
import { vibrer } from "./lib/haptique";
import PaletteCommandes, { construireIndex, useRaccourciPalette } from "./components/PaletteCommandes";
import ReglagesApparence from "./components/ReglagesApparence";
import Retrospective from "./components/Retrospective";

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
// La teinte se déduit du thème déclaré dans TABS : une septième table à tenir
// synchrone à la main était exactement ce qui avait laissé Stratégie et
// Abonnements partager la même couleur.
const TAB_BG = Object.fromEntries(TABS.map((t) => [t.id, theme(t.theme).pageBg]));

export default function App() {
  const [tab, setTab] = useHashRoute(TAB_IDS, "dashboard", TAB_ALIASES);
  const [ghostMode, setGhostMode] = React.useState(false);
  const [paletteOuverte, setPaletteOuverte] = React.useState(false);
  const [reglagesOuverts, setReglagesOuverts] = React.useState(false);
  const [retroOuverte, setRetroOuverte] = React.useState(false);
  const { haptique } = useApparence();
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

  /**
   * Changement d'onglet : mémorise le SENS du déplacement.
   *
   * Les onglets sont ordonnés ; faire entrer la page par le côté d'où elle
   * vient transforme une apparition en déplacement, et donne une carte mentale
   * de l'application au lieu d'une succession d'écrans sans rapport.
   */
  const [direction, setDirection] = React.useState("droite");
  const allerA = React.useCallback(
    (cible) => {
      setDirection(TAB_IDS.indexOf(cible) >= TAB_IDS.indexOf(tab) ? "droite" : "gauche");
      vibrer("navigation", haptique);
      setTab(cible);
    },
    [tab, setTab, haptique]
  );

  /**
   * Index et actions de la palette de commandes.
   *
   * Les actions viennent EN PREMIER dans les résultats : taper « export » doit
   * proposer la sauvegarde avant de proposer une ligne dont le nom contient
   * ces lettres.
   */
  const indexPalette = useMemo(
    () =>
      construireIndex({
        livrets: patrimoine.livrets,
        bourse: patrimoine.bourse,
        dettes: patrimoine.dettes,
        watchlist: patrimoine.watchlist,
        strategyNotes: patrimoine.strategyNotes,
        enveloppes: patrimoine.enveloppes,
        objectifs: patrimoine.objectifs,
      }),
    [
      patrimoine.livrets, patrimoine.bourse, patrimoine.dettes, patrimoine.watchlist,
      patrimoine.strategyNotes, patrimoine.enveloppes, patrimoine.objectifs,
    ]
  );

  useRaccourciPalette(React.useCallback(() => setPaletteOuverte(true), []));

  useEffect(() => {
    document.title = `${activeTab.label} · Patrium`;
  }, [activeTab.label]);

  /*
   * Teinte de la barre de défilement, accordée à l'onglet courant.
   *
   * Sur les écrans longs — Bourse en empile huit blocs — c'est un repère de
   * plus sur l'endroit où l'on se trouve, gratuit et périphérique.
   *
   * La variable est posée sur `<html>` parce qu'une barre de défilement de
   * document ne peut pas être stylée depuis un élément de la page : elle
   * appartient à la racine, quel que soit le conteneur qui déborde.
   */
  useEffect(() => {
    const teintes = {
      dashboard: "156 72%", livrets: "230 94%", bourse: "252 95%",
      simulation: "46 97%", strategie: "353 96%", abonnements: "187 92%",
    };
    const [h, s] = (teintes[tab] || teintes.simulation).split(" ");
    document.documentElement.style.setProperty("--teinte-page", `${h} ${s} 60%`);
  }, [tab]);

  // Relevé quotidien du patrimoine net, quel que soit l'onglet ouvert.
  useDailySnapshot({
    patrimoineNet: patrimoine.patrimoineNet,
    setHistoryPast: patrimoine.setHistoryPast,
    lastSnapshotDate: patrimoine.lastSnapshotDate,
    setLastSnapshotDate: patrimoine.setLastSnapshotDate,
  });

  // `useCallback` : `handleExport` alimente la liste d'actions de la palette,
  // qui est mémoïsée. Recréé à chaque rendu, il invalidait cette mémoïsation
  // en permanence — c'est-à-dire qu'il la supprimait.
  const handleExport = React.useCallback(() => {
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
  }, [showToast]);

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

  const actionsPalette = useMemo(
    () => [
      { id: "act-reglages", libelle: "Apparence : thème, accent, densité", motsCles: "theme clair sombre couleur densite reglages", icone: Palette, executer: () => setReglagesOuverts(true) },
      { id: "act-retro", libelle: "Rétrospective annuelle", motsCles: "bilan annee resume retrospective", icone: Sparkles, executer: () => setRetroOuverte(true) },
      { id: "act-ghost", libelle: ghostMode ? "Afficher les montants" : "Masquer les montants (mode Ghost)", motsCles: "ghost masquer flouter confidentialite", icone: ghostMode ? Eye : EyeOff, executer: () => setGhostMode((g) => !g) },
      { id: "act-export", libelle: "Exporter une sauvegarde", motsCles: "export sauvegarde json backup", icone: Download, executer: handleExport },
      ...TABS.map((t) => ({
        id: `act-onglet-${t.id}`,
        libelle: `Aller à « ${t.label} »`,
        motsCles: `${t.label} ${t.shortLabel}`,
        icone: t.icon,
        executer: () => allerA(t.id),
      })),
    ],
    [ghostMode, handleExport, allerA]
  );

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
              onClick={() => allerA(t.id)}
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
            onClick={() => setReglagesOuverts(true)}
            aria-label="Apparence"
            title="Apparence : thème, accent, densité"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 rounded"
          >
            <Palette size={15} aria-hidden="true" />
            <span className="hidden md:inline">Apparence</span>
          </button>
          <button
            onClick={() => setRetroOuverte(true)}
            aria-label="Rétrospective annuelle"
            title="Rétrospective annuelle"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 rounded"
          >
            <Sparkles size={15} aria-hidden="true" />
            <span className="hidden md:inline">Rétrospective</span>
          </button>
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
        {/* Fil de progression : neutralisé d'office là où
            `animation-timeline` n'existe pas (voir index.css). */}
        <span className="fil-progression teinte-accent" aria-hidden="true" />

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

        {/* Une panne de la source de marché se manifestait par une série
            d'échecs isolés dont rien ne donnait la cause commune. */}
        <EtatSourceMarche />

        <BackupReminder onExport={handleExport} />

        {/* La clé force le remontage — et donc l'animation d'entrée — à chaque
            changement d'onglet. aria-live annonce le changement de section aux
            lecteurs d'écran, qui n'ont sinon aucun repère de navigation. */}
        <div key={tab} className={direction === "droite" ? "page-entre-droite" : "page-entre-gauche"}>
          <h1 className="sr-only">{activeTab.label}</h1>
          <Suspense fallback={<TabSkeleton />}>
            <activeTab.Page {...patrimoine} />
          </Suspense>
        </div>
      </main>

      <BottomNav tabs={BOTTOM_NAV_TABS} active={tab} onChange={allerA} />

      <PaletteCommandes
        ouvert={paletteOuverte}
        onFermer={() => setPaletteOuverte(false)}
        index={indexPalette}
        actions={actionsPalette}
        onNaviguer={allerA}
      />
      <ReglagesApparence ouvert={reglagesOuverts} onFermer={() => setReglagesOuverts(false)} />
      <Retrospective
        ouvert={retroOuverte}
        onFermer={() => setRetroOuverte(false)}
        historyPast={patrimoine.historyPast}
        operations={patrimoine.bourse?.operations}
        positions={patrimoine.bourse?.positions}
        profileHistory={patrimoine.profileHistory}
        bourseHistory={patrimoine.bourseHistory}
      />
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
