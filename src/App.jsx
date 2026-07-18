import React, { useMemo, useState, useEffect } from "react";
import { LayoutDashboard, PiggyBank, TrendingUp, Calculator, Landmark, NotebookPen, Download, Upload, RotateCcw, Eye, EyeOff, LogOut } from "lucide-react";
import { usePersistentState, exportAllData, importAllData, clearAllData, clearCloudData, pushAllToCloud } from "./lib/storage";
import { weightedAverageRate } from "./lib/finance";
import { NavButton } from "./components/ui";
import BottomNav from "./components/BottomNav";
import Dashboard from "./components/Dashboard";
import Livrets from "./components/Livrets";
import Bourse from "./components/Bourse";
import Simulation from "./components/Simulation";
import Immobilier from "./components/Immobilier";
import StrategieLogs from "./components/StrategieLogs";
import GlobalSearch from "./components/GlobalSearch";
import Notifications from "./components/Notifications";
import { useAuth } from "./lib/AuthContext";

const STORAGE_KEYS = ["profile", "livrets", "dettes", "bourse", "historyPast", "sim", "immo", "bourseHistory", "watchlist", "cash", "enveloppes", "bourseSort", "watchlistSort", "bourseDailyData", "watchlistDailyData", "strategyNotes", "simScenarios", "immoTravaux", "reminders"];

const INITIAL_PROFILE = { monthly_income: 2100, monthly_expenses: 1200 };

const INITIAL_LIVRETS = [
  { id: "la", name: "Livret A", balance: 7000, rate: 0.017, limit: 22950, envelope: "Livret" },
  { id: "av_euro", name: "Assurance-Vie (Fonds Euro)", balance: 15000, rate: 0.025, limit: null, envelope: "AV" },
];

const INITIAL_BOURSE = {
  envelope: "PEA",
  cash_pocket: 500,
  positions: [
    { id: "cw8", ticker: "CW8.PA", name: "Amundi MSCI World", quantity: 30, pru: 420.0, current_price: 465.5, type: "ETF" },
    { id: "ai", ticker: "AI.PA", name: "Air Liquide", quantity: 15, pru: 160.0, current_price: 175.2, type: "Action" },
  ],
  operations: [],
};

const INITIAL_HISTORY_PAST = [
  { id: "h1", label: "Janv.", value: 34800 },
  { id: "h2", label: "Févr.", value: 35400 },
  { id: "h3", label: "Mars", value: 36500 },
  { id: "h4", label: "Avr.", value: 37200 },
  { id: "h5", label: "Mai", value: 38100 },
];

const INITIAL_SIM = {
  years: 7,
  livrets: { capital: null, rate: null, monthly: 200 },
  bourse: { capital: null, rate: 6, monthly: 300 },
};

const INITIAL_IMMO = {
  prix_achat: 250000,
  frais_notaire_pct: 8,
  revenus_foyer: 2100,
  taux_interet: 3.5,
  inclure_livrets: true,
  inclure_bourse: false,
  apport_manuel: null,
  assurance_rate: 0.20,
};

const TAB_LABELS = {
  dashboard: "Dashboard",
  livrets: "Livrets & Épargne",
  bourse: "PEA & Bourse",
  simulation: "Simulation",
  immobilier: "Immobilier & Crédit",
  strategie: "Stratégie & Logs",
};

const TAB_BG = {
  dashboard: "bg-gradient-to-br from-emerald-950/70 via-slate-950 to-slate-950",
  livrets: "bg-gradient-to-br from-indigo-950/70 via-slate-950 to-slate-950",
  bourse: "bg-gradient-to-br from-violet-950/70 via-slate-950 to-slate-950",
  simulation: "bg-gradient-to-br from-amber-950/70 via-slate-950 to-slate-950",
  immobilier: "bg-gradient-to-br from-rose-950/70 via-slate-950 to-slate-950",
  strategie: "bg-gradient-to-br from-cyan-950/70 via-slate-950 to-slate-950",
};

// Config partagée sidebar desktop + bottom nav mobile (mêmes clés/icônes,
// labels courts dédiés pour la barre basse où l'espace est réduit).
const NAV_ITEMS = [
  { key: "dashboard", icon: LayoutDashboard, label: "Dashboard", shortLabel: "Accueil", theme: "emerald" },
  { key: "livrets", icon: PiggyBank, label: "Livrets & Épargne", shortLabel: "Épargne", theme: "indigo" },
  { key: "bourse", icon: TrendingUp, label: "PEA & Bourse", shortLabel: "Bourse", theme: "violet" },
  { key: "simulation", icon: Calculator, label: "Simulation", shortLabel: "Simu", theme: "amber" },
  { key: "immobilier", icon: Landmark, label: "Immobilier & Crédit", shortLabel: "Immo", theme: "rose" },
  { key: "strategie", icon: NotebookPen, label: "Stratégie & Logs", shortLabel: "Stratégie", theme: "cyan" },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [ghostMode, setGhostMode] = useState(false);
  const { user, signOut } = useAuth();

  useEffect(() => {
    document.title = `${TAB_LABELS[tab] || ""} · Patrium`;
  }, [tab]);


  const [profile, setProfile] = usePersistentState("profile", INITIAL_PROFILE);
  const [livrets, setLivrets] = usePersistentState("livrets", INITIAL_LIVRETS);
  const [dettes, setDettes] = usePersistentState("dettes", []);
  const [bourse, setBourse] = usePersistentState("bourse", INITIAL_BOURSE);
  const [historyPast, setHistoryPast] = usePersistentState("historyPast", INITIAL_HISTORY_PAST);
  const [sim, setSim] = usePersistentState("sim", INITIAL_SIM);
  const [immo, setImmo] = usePersistentState("immo", INITIAL_IMMO);
  const [bourseHistory, setBourseHistory] = usePersistentState("bourseHistory", []);
  const [cash, setCash] = usePersistentState("cash", 0);
  const [enveloppes, setEnveloppes] = usePersistentState("enveloppes", [
    { id: "env1", label: "Matelas d'urgence", amount: 3000, colorIdx: 0 },
    { id: "env2", label: "Projet Immo", amount: 3000, colorIdx: 1 },
    { id: "env3", label: "Plaisir / Voyage", amount: 950, colorIdx: 2 },
  ]);
  const [watchlist, setWatchlist] = usePersistentState("watchlist", []);
  const [strategyNotes, setStrategyNotes] = usePersistentState("strategyNotes", []);
  const [simScenarios, setSimScenarios] = usePersistentState("simScenarios", []);
  const [immoTravaux, setImmoTravaux] = usePersistentState("immoTravaux", []);
  const [reminders, setReminders] = usePersistentState("reminders", []);

  const livretsTotal = useMemo(() => livrets.reduce((s, l) => s + l.balance, 0), [livrets]);
  const livretsAvgRate = useMemo(() => weightedAverageRate(livrets) * 100, [livrets]);
  const dettesTotal = useMemo(() => dettes.reduce((s, d) => s + d.amount, 0), [dettes]);

  const bourseInvested = useMemo(() => bourse.positions.reduce((s, p) => s + p.quantity * p.pru, 0), [bourse]);
  const bourseValuePositions = useMemo(() => bourse.positions.reduce((s, p) => s + p.quantity * p.current_price, 0), [bourse]);
  const bourseTotal = bourse.cash_pocket + bourseValuePositions;
  const bourseGainAbs = bourseValuePositions - bourseInvested;
  const bourseGainPct = bourseInvested > 0 ? (bourseGainAbs / bourseInvested) * 100 : 0;

  const patrimoineBrut = livretsTotal + bourseTotal + (cash ?? 0);
  const patrimoineNet = patrimoineBrut - dettesTotal;

  const epargneMensuelle = profile.monthly_income - profile.monthly_expenses;
  const tauxEpargne = profile.monthly_income > 0 ? (epargneMensuelle / profile.monthly_income) * 100 : 0;
  const matelasMois = profile.monthly_expenses > 0 ? livretsTotal / profile.monthly_expenses : 0;

  const shared = {
    profile, setProfile, livrets, setLivrets, dettes, setDettes, bourse, setBourse,
    historyPast, setHistoryPast, sim, setSim, immo, setImmo,
    bourseHistory, setBourseHistory, watchlist, setWatchlist,
    cash, setCash, enveloppes, setEnveloppes,
    strategyNotes, setStrategyNotes,
    simScenarios, setSimScenarios, immoTravaux, setImmoTravaux,
    livretsTotal, livretsAvgRate, dettesTotal, bourseInvested, bourseValuePositions,
    bourseTotal, bourseGainAbs, bourseGainPct, patrimoineBrut, patrimoineNet,
    epargneMensuelle, tauxEpargne, matelasMois,
  };

  const handleExport = () => {
    const dump = exportAllData(STORAGE_KEYS);
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patrimoine-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dump = JSON.parse(reader.result);
        importAllData(dump);
        await pushAllToCloud(dump);
        window.location.reload();
      } catch {
        alert("Fichier de sauvegarde invalide.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleReset = async () => {
    if (window.confirm("Réinitialiser toutes les données (navigateur ET compte) ? Cette action est irréversible.")) {
      clearAllData(STORAGE_KEYS);
      await clearCloudData(STORAGE_KEYS);
      window.location.reload();
    }
  };

  return (
    <div className={`flex flex-col md:flex-row min-h-screen bg-slate-950 text-slate-100 ${ghostMode ? "ghost-mode" : ""}`}>
      {/* Sidebar desktop — inchangée, masquée sur mobile (bottom nav prend le relais) */}
      <aside className="hidden md:flex md:w-60 md:h-screen md:sticky md:top-0 border-r border-slate-800 bg-slate-950 flex-col">
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div className="font-display text-lg text-slate-50">Patrium</div>
            <button onClick={() => setGhostMode((g) => !g)} title="Mode Ghost (flouter les montants)" className="text-slate-500 hover:text-slate-200 p-1">
              {ghostMode ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Vision consolidée &amp; simulation</div>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.key}
              active={tab === item.key}
              onClick={() => setTab(item.key)}
              icon={item.icon}
              label={item.label}
              theme={item.theme}
            />
          ))}
        </nav>
        <div className="flex flex-col gap-2 px-4 py-4 border-t border-slate-800">
          <button onClick={handleExport} className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 rounded">
            <Download size={13} /> Exporter mes données
          </button>
          <label className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-100 cursor-pointer">
            <Upload size={13} /> Importer une sauvegarde
            <input type="file" accept="application/json" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={handleReset} className="flex items-center gap-2 text-xs text-slate-600 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 rounded">
            <RotateCcw size={13} /> Réinitialiser
          </button>
          <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
            Données stockées localement dans ce navigateur, et synchronisées avec ton compte si connecté.
          </p>
        </div>
      </aside>

      {/* Header mobile — logo + ghost toggle, remplace l'ancienne nav horizontale en haut */}
      <header className="md:hidden flex items-center justify-between px-4 pt-4 pb-2">
        <div className="font-display text-lg text-slate-50">Patrium</div>
        <button
          onClick={() => setGhostMode((g) => !g)}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-400"
        >
          {ghostMode ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </header>

      <main
        className={`flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl transition-colors duration-500 pb-24 md:pb-8 text-base md:text-sm ${TAB_BG[tab] || ""}`}
      >
        <div className="flex items-center justify-between gap-3 mb-5">
          <GlobalSearch
            livrets={livrets} bourse={bourse} dettes={dettes} watchlist={watchlist}
            strategyNotes={strategyNotes} enveloppes={enveloppes} onNavigate={setTab}
          />
          <div className="flex items-center gap-1">
            <Notifications reminders={reminders} setReminders={setReminders} />
            <button
              onClick={() => signOut()}
              title={user?.email ? `Déconnecter ${user.email}` : "Se déconnecter"}
              className="min-h-[48px] min-w-[48px] md:min-h-0 md:min-w-0 flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-rose-300 border border-transparent hover:border-rose-500/30 rounded-lg md:px-2 md:py-1.5"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <div key={tab} className="animate-[fadeIn_0.3s_cubic-bezier(0.4,0,0.2,1)] stagger-children">
          {tab === "dashboard" && <Dashboard {...shared} />}
          {tab === "livrets" && <Livrets {...shared} />}
          {tab === "bourse" && <Bourse {...shared} />}
          {tab === "simulation" && <Simulation {...shared} />}
          {tab === "immobilier" && <Immobilier {...shared} />}
          {tab === "strategie" && <StrategieLogs {...shared} />}
        </div>
      </main>

      <BottomNav tabs={NAV_ITEMS} active={tab} onChange={setTab} />
    </div>
  );
}
