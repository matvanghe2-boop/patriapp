import { createContext, useContext, useMemo, useCallback } from "react";
import { usePersistentState } from "./storage";
import { weightedAverageRate, upsertByDate, todayIso, valeurPosition, coutPosition, rebaselineLedger } from "./finance";
import { enrichir } from "./compteCourant";
import { mouvementsAutresComptes, estimerSolde } from "./liensComptes";
import { budgetMoyen } from "./analyseCompte";
import { moisDeReference } from "./santeFinanciere";
import { historiqueExemple, portefeuilleExemple, operationsExemple, objectifExemple } from "./jeuExemple";

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
  // Ordre et visibilité des blocs du Dashboard (voir dispositionDashboard.js).
  "dispositionDashboard",
  // Secteur choisi à la main pour une ligne, qui prime sur le classement
  // par défaut (voir sectors.js, secteurDe).
  "secteursManuels",
  // ETF de référence de la comparaison « le même argent » (Performance).
  "etfComparaison",
  // Dernier record de patrimoine annoncé et objectifs déjà salués.
  "recordsAnnonces",
  // Préférences d'affichage (thème, accent, densité, retours) — voir
  // ApparenceContext. Persistées comme le reste : un réglage d'affichage suit
  // d'un appareil à l'autre.
  "apparence",
  // Séries de cours par ticker, pour les sparklines du tableau de positions.
  "bourseSeriesCours",
  // Onglet Compte courant : opérations importées des relevés, relevés
  // eux-mêmes (période, soldes, contrôle) et règles de classement choisies
  // par l'utilisateur (voir compteCourant.js).
  "compteOperations", "compteReleves", "compteRegles",
  // Mouvements saisis à la main depuis le dernier relevé, en attendant le
  // suivant : ils corrigent le solde estimé, jamais les statistiques.
  "compteProvisoires",
  // Prélèvements récurrents du relevé que l'utilisateur a choisi de ne pas
  // suivre comme abonnements (clés de marchand, voir abonnements.js).
  "abonnementsIgnores",
  // Note de santé financière, un point par mois (voir santeFinanciere.js).
  "historiqueSante",
  // Événements de vie posés sur la courbe du patrimoine (voir annotations.js).
  "annotationsPatrimoine",
  // Avances faites pour d'autres, remboursées par virement (voir avances.js).
  "avances",
  // Agenda financier : département (zone de la déclaration de revenus) et
  // rappels déjà vus (voir agendaFinancier.js).
  "agendaReglages", "agendaVus",
  // Comparateur rattachement / déclaration séparée (voir rattachementFiscal.js).
  "rattachementReglages",
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
    // Total versé, cohérent avec les « Versements cumulés » du Dashboard :
    // sans lui, la jauge de plafond affichait « 0 € versés » à côté d'un
    // journal de douze versements.
    peaVersements: 15500,
    positions: [
      { id: "cw8", ticker: "CW8.PA", name: "Amundi MSCI World", quantity: 30, pru: 420.0, current_price: 465.5, type: "ETF" },
      // Un dividende et son mois de détachement, pour que le calendrier des
      // revenus et la couverture des dépenses aient quelque chose à montrer.
      { id: "ai", ticker: "AI.PA", name: "Air Liquide", quantity: 15, pru: 160.0, current_price: 175.2, type: "Action", annual_dividend: 3.3, dividendeMois: { 5: 1 } },
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

  // Secteurs choisis à la main, par ticker : { "AI.PA": "Industrie" }. Une
  // seule clé pour toute l'app — Analyse et Screener lisent la même.
  const [secteursManuels, setSecteursManuels] = usePersistentState("secteursManuels", {});

  // ─── Compte courant ────────────────────────────────────────────────────────
  // Trois clés plutôt qu'une : la liste des opérations est la seule qui
  // grossit, et une correction de catégorie ne doit pas réécrire les relevés.
  // Montants en centimes entiers (voir compteCourant.js).
  const [compteOperations, setCompteOperations] = usePersistentState("compteOperations", []);
  const [compteReleves, setCompteReleves] = usePersistentState("compteReleves", []);
  const [compteRegles, setCompteRegles] = usePersistentState("compteRegles", []);
  const [compteProvisoires, setCompteProvisoires] = usePersistentState("compteProvisoires", []);

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

  // ─── Compte courant → patrimoine réel ──────────────────────────────────────
  // Dès qu'un relevé est importé, le compte courant du patrimoine est le solde
  // du dernier relevé, et le profil mensuel la moyenne des trois derniers mois
  // réels. Les deux valeurs saisies à la main (`cash`, `profile`) restent
  // stockées : elles reprennent la main si tous les relevés sont retirés.
  const compteEnrichies = useMemo(() => {
    const dernierReleve = [...compteReleves].sort((a, b) => String(a.fin).localeCompare(String(b.fin))).pop();
    return enrichir(compteOperations, { regles: compteRegles, titulaire: dernierReleve?.titulaire || null });
  }, [compteOperations, compteRegles, compteReleves]);
  // Versements PEA et mouvements de livrets : ils passent par le compte
  // courant, et ceux postérieurs au dernier relevé corrigent son solde.
  const compteMouvements = useMemo(() => mouvementsAutresComptes({ bourse, livrets }), [bourse, livrets]);
  // Solde ESTIMÉ : le dernier relevé, corrigé de tout ce qui s'est passé
  // depuis, sans jamais compter deux fois le même virement.
  const compteSolde = useMemo(
    () =>
      estimerSolde({
        releves: compteReleves,
        provisoires: compteProvisoires,
        mouvements: compteMouvements,
        operations: compteEnrichies,
      }),
    [compteReleves, compteProvisoires, compteMouvements, compteEnrichies]
  );
  const budgetReel = useMemo(() => budgetMoyen(compteEnrichies), [compteEnrichies]);
  // Le mois qui sert d'unité au matelas « prudent » : la moyenne des mois les
  // plus chers, plutôt qu'un mois moyen (voir moisDeReference).
  const moisReference = useMemo(() => moisDeReference(compteEnrichies), [compteEnrichies]);
  const cashEffectif = compteSolde ? compteSolde.solde / 100 : (cash ?? 0);
  const profilEffectif = useMemo(
    () =>
      budgetReel
        ? {
            ...profile,
            monthly_income: Math.round(budgetReel.revenus) / 100,
            monthly_expenses: Math.round(budgetReel.depenses) / 100,
            source: "releves",
            periode: budgetReel.mois,
          }
        : profile,
    [profile, budgetReel]
  );

  const derived = useMemo(() => {
    const bourseTotal = bourse.cash_pocket + bourseValuePositions;
    const bourseGainAbs = bourseValuePositions - bourseInvested;
    const patrimoineBrut = livretsTotal + bourseTotal + cashEffectif;
    const profile = profilEffectif;
    const epargneMensuelle = profile.monthly_income - profile.monthly_expenses;
    // Matelas de sécurité : les livrets, plus ce qui dépasse un mois de
    // dépenses sur le compte courant quand celui-ci est suivi par ses relevés.
    // Sans ça, 5 000 € mis de côté en attendant l'ouverture d'un Livret A
    // donnaient un matelas de « 0 mois ». Le premier mois de dépenses reste
    // exclu : c'est l'argent du mois, pas une réserve.
    const matelasCompteCourant =
      compteSolde && profile.monthly_expenses > 0 ? Math.max(0, cashEffectif - profile.monthly_expenses) : 0;
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
      matelasMois:
        profile.monthly_expenses > 0 ? (livretsTotal + matelasCompteCourant) / profile.monthly_expenses : null,
      matelasCompteCourant,
      // Le même matelas, compté en mois « les plus chers ». `null` tant que
      // les relevés ne couvrent pas trois mois.
      depensesMoisReference: moisReference ? moisReference.centimes / 100 : null,
      matelasMoisPrudent: moisReference
        ? (livretsTotal + matelasCompteCourant) / (moisReference.centimes / 100)
        : null,
    };
  }, [
    bourse.cash_pocket, bourseValuePositions, bourseInvested, livretsTotal, cashEffectif, dettesTotal, profilEffectif,
    compteSolde, moisReference,
  ]);

  // Patrimoine encore vierge : aucun support d'épargne, aucune position, aucun
  // cash. Sert à proposer un accueil explicite plutôt qu'un tableau de bord à
  // zéro qu'on pourrait prendre pour un bug.
  const isEmpty =
    livrets.length === 0 && bourse.positions.length === 0 && cashEffectif === 0 && dettes.length === 0;

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
    const aujourdhui = todayIso();
    setProfile(DEMO_DATASET.profile);
    setLivrets(DEMO_DATASET.livrets);
    // Le journal d'exemple est GELÉ dans la ligne de base : positions et poche
    // cash restent celles du jeu, et les opérations ne servent que de passé
    // daté — versements pour la cascade, marqueurs pour la courbe. Sans ce
    // gel, le rejeu du journal recalculerait les positions à partir de zéro.
    setBourse(rebaselineLedger({ ...DEMO_DATASET.bourse, operations: operationsExemple(aujourdhui) }));
    setEnveloppes(DEMO_DATASET.enveloppes);
    // Un an de relevés : sans eux, la courbe, la cascade mensuelle et la
    // trajectoire des objectifs restaient vides dans la démonstration.
    setHistoryPast(historiqueExemple(aujourdhui));
    // Historique du portefeuille aux mêmes dates : c'est lui qui sépare le
    // marché de l'épargne dans la cascade, et qui nourrit l'onglet Performance.
    setBourseHistory(portefeuilleExemple(aujourdhui));
    // N'écrase pas un objectif déjà saisi.
    setObjectifs((o) => (Array.isArray(o) && o.length ? o : [objectifExemple(aujourdhui)]));
  }, [setProfile, setLivrets, setBourse, setEnveloppes, setHistoryPast, setBourseHistory, setObjectifs]);

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
      profile: profilEffectif, profileSaisi: profile, setProfile, livrets, setLivrets, dettes, setDettes, bourse, setBourse,
      historyPast, setHistoryPast, sim, setSim, immo, setImmo,
      bourseHistory, setBourseHistory, watchlist, setWatchlist,
      cash: cashEffectif, setCash, compteSolde, budgetReel, compteEnrichies, compteMouvements, enveloppes, setEnveloppes,
      strategyNotes, setStrategyNotes,
      simScenarios, setSimScenarios, immoTravaux, setImmoTravaux,
      reminders, setReminders,
      contracts, setContracts, subs, setSubs,
      lastSnapshotDate, setLastSnapshotDate,
      objectifs, setObjectifs, alertesWatchlist, setAlertesWatchlist,
      widgetsReplies, setWidgetsReplies, basculerWidget,
      secteursManuels, setSecteursManuels,
      compteOperations, setCompteOperations, compteReleves, setCompteReleves,
      compteRegles, setCompteRegles, compteProvisoires, setCompteProvisoires,
      horizonScenarios, setHorizonScenarios,
      horizonReglages, setHorizonReglages,
      horizonDernierBilan, setHorizonDernierBilan,
      livretsTotal, livretsAvgRate, dettesTotal, bourseInvested, bourseValuePositions,
      ...derived,
    }),
    [
      isEmpty, loadDemoData, profileHistory,
      profilEffectif, profile, setProfile, livrets, setLivrets, dettes, setDettes, bourse, setBourse,
      historyPast, setHistoryPast, sim, setSim, immo, setImmo,
      bourseHistory, setBourseHistory, watchlist, setWatchlist,
      cashEffectif, setCash, compteSolde, budgetReel, compteEnrichies, compteMouvements, enveloppes, setEnveloppes,
      strategyNotes, setStrategyNotes,
      simScenarios, setSimScenarios, immoTravaux, setImmoTravaux,
      reminders, setReminders,
      contracts, setContracts, subs, setSubs,
      lastSnapshotDate, setLastSnapshotDate,
      objectifs, setObjectifs, alertesWatchlist, setAlertesWatchlist,
      widgetsReplies, setWidgetsReplies, basculerWidget,
      secteursManuels, setSecteursManuels,
      compteOperations, setCompteOperations, compteReleves, setCompteReleves,
      compteRegles, setCompteRegles, compteProvisoires, setCompteProvisoires,
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
