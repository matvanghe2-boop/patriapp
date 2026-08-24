import { createContext, useContext, useMemo, useCallback } from "react";
import { usePersistentState } from "./storage";
import { weightedAverageRate, upsertByDate, todayIso, valeurPosition, coutPosition } from "./finance";

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
  "immoTravaux", "reminders", "contracts", "subs", "lastSnapshotDate", "allocationTarget",
  "profileHistory", "horizonScenarios", "horizonReglages", "horizonDernierBilan",
  "matelasHistory", "objectifs", "alertesWatchlist", "widgetsReplies",
  // Préférences d'affichage (thème, accent, densité, retours) — voir
  // ApparenceContext. Persistées comme le reste : un réglage d'affichage suit
  // d'un appareil à l'autre.
  "apparence",
  // Séries de cours par ticker, pour les sparklines du tableau de positions.
  "bourseSeriesCours",
];

/**
 * L'application démarre VIDE.
 *
 * Elle était auparavant préremplie d'un patrimoine inventé — un Livret A à
 * 7 000 €, une assurance-vie à 15 000 €, trente parts de CW8 — que rien ne
 * signalait comme fictif. Un patrimoine net de 45 000 € s'affichait donc au
 * premier lancement, et les chiffres faux se mélangeaient aux vrais au fur et
 * à mesure de la saisie. C'est exactement la raison pour laquelle
 * INITIAL_HISTORY_PAST avait déjà été vidé de ses cinq mois de valeurs
 * inventées ; la même logique s'applique aux livrets et aux positions.
 *
 * Le jeu d'exemple reste disponible, mais sur demande explicite et clairement
 * étiqueté comme tel (voir DEMO_DATASET et le bouton d'accueil du Dashboard).
 */
const INITIAL_PROFILE = { monthly_income: 0, monthly_expenses: 0 };

const INITIAL_LIVRETS = [];

const INITIAL_BOURSE = {
  envelope: "PEA",
  cash_pocket: 0,
  positions: [],
  // Historique des opérations (achats/ventes) — alimenté par l'import PDF ou
  // la saisie manuelle depuis le sous-onglet "Opérations" de Stratégie & Logs.
  operations: [],
};

/** Jeu de données d'exemple, chargé uniquement sur action de l'utilisateur. */
export const DEMO_DATASET = {
  profile: { monthly_income: 2100, monthly_expenses: 1200 },
  livrets: [
    { id: "la", name: "Livret A", balance: 7000, rate: 0.017, limit: 22950, envelope: "Livret" },
    { id: "av_euro", name: "Assurance-Vie (Fonds Euro)", balance: 15000, rate: 0.025, limit: null, envelope: "AV" },
  ],
  bourse: {
    envelope: "PEA",
    cash_pocket: 500,
    positions: [
      { id: "cw8", ticker: "CW8.PA", name: "Amundi MSCI World", quantity: 30, pru: 420.0, current_price: 465.5, type: "ETF" },
      { id: "ai", ticker: "AI.PA", name: "Air Liquide", quantity: 15, pru: 160.0, current_price: 175.2, type: "Action" },
    ],
    operations: [],
  },
  enveloppes: [
    { id: "env1", label: "Matelas d'urgence", amount: 3000, colorIdx: 0 },
    { id: "env2", label: "Projet Immo", amount: 3000, colorIdx: 1 },
    { id: "env3", label: "Plaisir / Voyage", amount: 950, colorIdx: 2 },
  ],
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

const INITIAL_ENVELOPPES = [];

const PatrimoineContext = createContext(null);

export function PatrimoineProvider({ children }) {
  const [profile, setProfileRaw] = usePersistentState("profile", INITIAL_PROFILE);
  // Historique daté du profil mensuel. Revenus et dépenses étaient deux
  // nombres écrasés en place, sans date : le taux d'épargne, le matelas de
  // sécurité et l'alerte « matelas faible » du Dashboard reposaient donc sur
  // une saisie dont rien n'indiquait l'ancienneté. Une valeur oubliée six mois
  // rendait ces trois indicateurs faux en silence.
  const [profileHistory, setProfileHistory] = usePersistentState("profileHistory", []);
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
  // Objectifs de patrimoine datés (cible + échéance), avec point de départ figé.
  const [objectifs, setObjectifs] = usePersistentState("objectifs", []);
  // Seuils de prix surveillés sur la watchlist.
  const [alertesWatchlist, setAlertesWatchlist] = usePersistentState("alertesWatchlist", []);
  /**
   * Widgets repliés, par identifiant — `{ dividendes: true, positions: false }`.
   *
   * Une seule clé pour tout l'écran plutôt qu'une par widget : `usePersistentState`
   * n'enregistre qu'un setter par clé de stockage (voir `activeSetters` dans
   * storage.js), donc plusieurs composants partageant la même clé se
   * neutraliseraient mutuellement à la synchronisation.
   *
   * Passe par l'état persistant, donc par le cloud : la composition de l'écran
   * suit d'un appareil à l'autre, au même titre que le reste.
   */
  const [widgetsReplies, setWidgetsReplies] = usePersistentState("widgetsReplies", {});

  /** Bascule le repli d'un widget, sans avoir à recomposer l'objet à l'appel. */
  const basculerWidget = useCallback(
    (id) => setWidgetsReplies((w) => ({ ...(w || {}), [id]: !w?.[id] })),
    [setWidgetsReplies]
  );
  // ─── Horizon (sous-onglet Projet) ──────────────────────────────────────────
  // Projets chiffrés et mis de côté, comparables plus tard.
  const [horizonScenarios, setHorizonScenarios] = usePersistentState("horizonScenarios", []);
  // Réglages de confidentialité de l'assistant. `montantsReels` est le mode B
  // de HORIZON_SPEC.md : désactivé par défaut, et il le reste tant que
  // l'utilisateur ne l'active pas explicitement.
  const [horizonReglages, setHorizonReglages] = usePersistentState("horizonReglages", {
    montantsReels: false,
  });
  // Date du dernier bilan mensuel présenté, pour ne pas le rejouer chaque jour.
  const [horizonDernierBilan, setHorizonDernierBilan] = usePersistentState("horizonDernierBilan", null);

  const livretsTotal = useMemo(() => livrets.reduce((s, l) => s + l.balance, 0), [livrets]);
  const livretsAvgRate = useMemo(() => weightedAverageRate(livrets) * 100, [livrets]);
  const dettesTotal = useMemo(() => dettes.reduce((s, d) => s + d.amount, 0), [dettes]);

  // Valorisation convertie en euros : une position cotée en dollars était
  // comptée à parité 1:1 dans tous les agrégats de l'application.
  const bourseInvested = useMemo(
    () => bourse.positions.reduce((s, p) => s + coutPosition(p), 0),
    [bourse]
  );
  const bourseValuePositions = useMemo(
    () => bourse.positions.reduce((s, p) => s + valeurPosition(p), 0),
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
      // `null` — et non 0 — quand les dépenses ne sont pas renseignées : le
      // matelas est alors INCONNU, pas nul. Retourner 0 déclenchait l'alerte
      // « matelas insuffisant » du Dashboard dès le premier lancement, sur une
      // application encore vide.
      matelasMois: profile.monthly_expenses > 0 ? livretsTotal / profile.monthly_expenses : null,
    };
  }, [bourse.cash_pocket, bourseValuePositions, bourseInvested, livretsTotal, cash, dettesTotal, profile]);

  // Patrimoine encore vierge : aucun support d'épargne, aucune position, aucun
  // cash. Sert à proposer un accueil explicite plutôt qu'un tableau de bord à
  // zéro qu'on pourrait prendre pour un bug.
  const isEmpty =
    livrets.length === 0 && bourse.positions.length === 0 && (cash ?? 0) === 0 && dettes.length === 0;

  /**
   * Enveloppe de `setProfile` qui horodate la saisie et en garde une trace
   * datée (une entrée par jour, la dernière du jour l'emportant). Les pages
   * continuent d'appeler `setProfile` exactement comme avant.
   */
  const setProfile = useCallback(
    (updater) => {
      setProfileRaw((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const stamped = { ...next, updatedAt: new Date().toISOString() };
        setProfileHistory((h) =>
          upsertByDate(h, {
            date: todayIso(),
            monthly_income: stamped.monthly_income,
            monthly_expenses: stamped.monthly_expenses,
          })
        );
        return stamped;
      });
    },
    [setProfileRaw, setProfileHistory]
  );

  const loadDemoData = useCallback(() => {
    setProfile(DEMO_DATASET.profile);
    setLivrets(DEMO_DATASET.livrets);
    setBourse(DEMO_DATASET.bourse);
    setEnveloppes(DEMO_DATASET.enveloppes);
  }, [setProfile, setLivrets, setBourse, setEnveloppes]);

  /**
   * L'objet de contexte doit garder son identité tant qu'aucune donnée n'a
   * bougé. Sans cette mémoïsation, il était reconstruit à chaque rendu du
   * provider : tous les consommateurs de `usePatrimoine()` se re-rendaient donc
   * systématiquement, et `App` déversant ce même objet dans la page active
   * (`<activeTab.Page {...patrimoine} />`), c'est l'onglet entier qui était
   * re-rendu à chaque frappe dans n'importe quel champ.
   *
   * Les setters issus de `useState` ont une identité stable ; ils figurent
   * quand même dans les dépendances, parce qu'une liste exhaustive est
   * vérifiable par l'outillage là où une liste choisie à la main ne l'est pas.
   */
  const value = useMemo(
    () => ({
      isEmpty, loadDemoData, profileHistory,
      profile, setProfile, livrets, setLivrets, dettes, setDettes, bourse, setBourse,
      historyPast, setHistoryPast, sim, setSim, immo, setImmo,
      bourseHistory, setBourseHistory, watchlist, setWatchlist,
      cash, setCash, enveloppes, setEnveloppes,
      strategyNotes, setStrategyNotes,
      simScenarios, setSimScenarios, immoTravaux, setImmoTravaux,
      reminders, setReminders,
      contracts, setContracts, subs, setSubs,
      lastSnapshotDate, setLastSnapshotDate,
      objectifs, setObjectifs, alertesWatchlist, setAlertesWatchlist,
      widgetsReplies, setWidgetsReplies, basculerWidget,
      horizonScenarios, setHorizonScenarios,
      horizonReglages, setHorizonReglages,
      horizonDernierBilan, setHorizonDernierBilan,
      livretsTotal, livretsAvgRate, dettesTotal, bourseInvested, bourseValuePositions,
      ...derived,
    }),
    [
      isEmpty, loadDemoData, profileHistory,
      profile, setProfile, livrets, setLivrets, dettes, setDettes, bourse, setBourse,
      historyPast, setHistoryPast, sim, setSim, immo, setImmo,
      bourseHistory, setBourseHistory, watchlist, setWatchlist,
      cash, setCash, enveloppes, setEnveloppes,
      strategyNotes, setStrategyNotes,
      simScenarios, setSimScenarios, immoTravaux, setImmoTravaux,
      reminders, setReminders,
      contracts, setContracts, subs, setSubs,
      lastSnapshotDate, setLastSnapshotDate,
      objectifs, setObjectifs, alertesWatchlist, setAlertesWatchlist,
      widgetsReplies, setWidgetsReplies, basculerWidget,
      horizonScenarios, setHorizonScenarios,
      horizonReglages, setHorizonReglages,
      horizonDernierBilan, setHorizonDernierBilan,
      livretsTotal, livretsAvgRate, dettesTotal, bourseInvested, bourseValuePositions,
      derived,
    ]
  );

  return <PatrimoineContext.Provider value={value}>{children}</PatrimoineContext.Provider>;
}

export function usePatrimoine() {
  const ctx = useContext(PatrimoineContext);
  if (!ctx) throw new Error("usePatrimoine doit être utilisé à l'intérieur de <PatrimoineProvider>");
  return ctx;
}
