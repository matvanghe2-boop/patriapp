import React, { createContext, useContext, useMemo } from "react";
import { usePersistentState } from "./storage";
import { weightedAverageRate } from "./finance";

/**
 * Propriétaire unique de l'état patrimonial.
 *
 * Avant, les ~20 tranches d'état et les ~15 valeurs dérivées vivaient
 * directement dans App.jsx, qui en faisait un gros objet `shared` déversé tel
 * quel dans chaque page (`<Bourse {...shared} />`). Chaque page recevait donc
 * l'intégralité de l'état de l'application, y compris ce dont elle n'avait
 * aucun usage, et App.jsx mêlait sur 260 lignes la définition du modèle de
 * données, les calculs et la mise en page.
 *
 * Ici, l'état et les calculs sont regroupés en un seul endroit lisible ; App
 * redevient une coquille de navigation. Les pages continuent de recevoir des
 * props (leur signature est inchangée), mais elles peuvent désormais lire
 * `usePatrimoine()` directement — c'est le chemin à privilégier au fur et à
 * mesure que les gros composants seront découpés.
 */

export const STORAGE_KEYS = [
  "profile", "livrets", "dettes", "bourse", "historyPast", "sim", "immo",
  "bourseHistory", "watchlist", "cash", "enveloppes", "bourseSort", "watchlistSort",
  "bourseDailyData", "watchlistDailyData", "strategyNotes", "simScenarios",
  "immoTravaux", "reminders", "contracts", "subs", "lastSnapshotDate",
];

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
  // Historique des opérations (achats/ventes) — alimenté par l'import PDF ou
  // la saisie manuelle depuis le sous-onglet "Opérations" de Stratégie & Logs.
  operations: [],
};

// L'historique de patrimoine démarre vide et se remplit tout seul, un point
// par jour (voir useDailySnapshot). Il contenait auparavant cinq mois de
// valeurs inventées (« Janv. 34 800 € »...) qui se mélangeaient aux relevés
// réels : la courbe du dashboard et les jalons de la Timeline partaient donc
// d'un passé fictif que rien ne signalait comme tel.
const INITIAL_HISTORY_PAST = [];

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
  assurance_rate: 0.2,
};

const INITIAL_ENVELOPPES = [
  { id: "env1", label: "Matelas d'urgence", amount: 3000, colorIdx: 0 },
  { id: "env2", label: "Projet Immo", amount: 3000, colorIdx: 1 },
  { id: "env3", label: "Plaisir / Voyage", amount: 950, colorIdx: 2 },
];

const PatrimoineContext = createContext(null);

export function PatrimoineProvider({ children }) {
  const [profile, setProfile] = usePersistentState("profile", INITIAL_PROFILE);
  const [livrets, setLivrets] = usePersistentState("livrets", INITIAL_LIVRETS);
  const [dettes, setDettes] = usePersistentState("dettes", []);
  const [bourse, setBourse] = usePersistentState("bourse", INITIAL_BOURSE);
  const [historyPast, setHistoryPast] = usePersistentState("historyPast", INITIAL_HISTORY_PAST);
  const [sim, setSim] = usePersistentState("sim", INITIAL_SIM);
  const [immo, setImmo] = usePersistentState("immo", INITIAL_IMMO);
  // Suivi quotidien réel du portefeuille (une entrée par jour, alimentée au fil
  // du temps — aucune donnée passée n'est reconstituée, aucune projection future).
  const [bourseHistory, setBourseHistory] = usePersistentState("bourseHistory", []);
  // Cash disponible sur compte courant
  const [cash, setCash] = usePersistentState("cash", 0);
  // Enveloppes de ventilation de l'épargne
  const [enveloppes, setEnveloppes] = usePersistentState("enveloppes", INITIAL_ENVELOPPES);
  // Watchlist : produits suivis en vue d'un achat (distincts des positions détenues).
  const [watchlist, setWatchlist] = usePersistentState("watchlist", []);
  // Journal de bord "Stratégie & Logs" : thèses d'investissement notées à l'achat.
  const [strategyNotes, setStrategyNotes] = usePersistentState("strategyNotes", []);
  // Scénarios de simulation sauvegardés, comparables côte à côte.
  const [simScenarios, setSimScenarios] = usePersistentState("simScenarios", []);
  // Suivi travaux/charges immobilier : budget prévisionnel vs réel.
  const [immoTravaux, setImmoTravaux] = usePersistentState("immoTravaux", []);
  // Rappels configurables (versement mensuel, échéance...).
  const [reminders, setReminders] = usePersistentState("reminders", []);
  // Contrats & échéances de résiliation (bail, assurances, garanties...).
  const [contracts, setContracts] = usePersistentState("contracts", []);
  // Dépenses récurrentes / abonnements (streaming, logiciels, sport...).
  const [subs, setSubs] = usePersistentState("subs", []);
  // Date du dernier relevé quotidien de patrimoine — persistée (donc
  // synchronisée) pour que deux appareils ne créent pas deux points le même jour.
  const [lastSnapshotDate, setLastSnapshotDate] = usePersistentState("lastSnapshotDate", null);

  const livretsTotal = useMemo(() => livrets.reduce((s, l) => s + l.balance, 0), [livrets]);
  const livretsAvgRate = useMemo(() => weightedAverageRate(livrets) * 100, [livrets]);
  const dettesTotal = useMemo(() => dettes.reduce((s, d) => s + d.amount, 0), [dettes]);

  const bourseInvested = useMemo(
    () => bourse.positions.reduce((s, p) => s + p.quantity * p.pru, 0),
    [bourse]
  );
  const bourseValuePositions = useMemo(
    () => bourse.positions.reduce((s, p) => s + p.quantity * p.current_price, 0),
    [bourse]
  );

  const derived = useMemo(() => {
    const bourseTotal = bourse.cash_pocket + bourseValuePositions;
    const bourseGainAbs = bourseValuePositions - bourseInvested;
    const patrimoineBrut = livretsTotal + bourseTotal + (cash ?? 0);
    const epargneMensuelle = profile.monthly_income - profile.monthly_expenses;
    return {
      bourseTotal,
      bourseGainAbs,
      bourseGainPct: bourseInvested > 0 ? (bourseGainAbs / bourseInvested) * 100 : 0,
      patrimoineBrut,
      patrimoineNet: patrimoineBrut - dettesTotal,
      epargneMensuelle,
      tauxEpargne: profile.monthly_income > 0 ? (epargneMensuelle / profile.monthly_income) * 100 : 0,
      matelasMois: profile.monthly_expenses > 0 ? livretsTotal / profile.monthly_expenses : 0,
    };
  }, [bourse.cash_pocket, bourseValuePositions, bourseInvested, livretsTotal, cash, dettesTotal, profile]);

  const value = {
    profile, setProfile, livrets, setLivrets, dettes, setDettes, bourse, setBourse,
    historyPast, setHistoryPast, sim, setSim, immo, setImmo,
    bourseHistory, setBourseHistory, watchlist, setWatchlist,
    cash, setCash, enveloppes, setEnveloppes,
    strategyNotes, setStrategyNotes,
    simScenarios, setSimScenarios, immoTravaux, setImmoTravaux,
    reminders, setReminders,
    contracts, setContracts, subs, setSubs,
    lastSnapshotDate, setLastSnapshotDate,
    livretsTotal, livretsAvgRate, dettesTotal, bourseInvested, bourseValuePositions,
    ...derived,
  };

  return <PatrimoineContext.Provider value={value}>{children}</PatrimoineContext.Provider>;
}

export function usePatrimoine() {
  const ctx = useContext(PatrimoineContext);
  if (!ctx) throw new Error("usePatrimoine doit être utilisé à l'intérieur de <PatrimoineProvider>");
  return ctx;
}
