import { useState, useMemo } from "react";
import { useSousOnglet } from "../lib/useHashRoute";
import { TrendingUp, RefreshCw, Pencil, Check, X as XIcon, PieChart as PieIcon, Activity, ArrowUp, ArrowDown, Coins, BookOpen, Briefcase, Search, CalendarDays, Filter, Gauge, Trash2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardLabel, CarteRepliable, GhostButton, EmptyState, PageGlow, CARD_THEMES, ChiffreCompteur } from "./ui";
import MenuActions from "./MenuActions";
import AssetLogo from "./AssetLogo";
import SectorHeatmap from "./SectorHeatmap";
import CorrelationsLignes from "./CorrelationsLignes";
import FicheLigne from "./FicheLigne";
import { Sparkline } from "./graphiques";
import { serieSparkline } from "../lib/marqueursCourbe";
import OngletsGlissants from "./OngletsGlissants";
import EtatVide from "./EtatVide";
import { useTirerPourRafraichir, IndicateurRafraichissement } from "./gestes";
import { eur, pctPlain, pct, uid, rebaseTo100, computeDividendSummary, rebaselineLedger, valeurPosition, lireNombre, variationDuJour } from "../lib/finance";

import { usePersistentState } from "../lib/storage";
import { useToast } from "../lib/ToastContext";
import { usePatrimoine } from "../lib/PatrimoineContext";
import { useSuiviBourse } from "../lib/useSuiviBourse";
import Watchlist from "./Watchlist";
import FinancialCalendar from "./FinancialCalendar";
import Marche from "./Marche";
import Reequilibrage from "./Reequilibrage";
import PerformanceTab from "./BoursePerformance";
import FiscaliteSortie from "./FiscaliteSortie";
import Screener from "./Screener";
import SantePortefeuille from "./SantePortefeuille";
import { SortButton, LignePosition, tendance, DailyVariation } from "./TableauPositionsOutils";
import AntiPanicModal, { PANIC_THRESHOLD_PCT } from "./AntiPanicModal";
import PeaFiscalWidget from "./PeaFiscalWidget";
import { ForeignCurrencyWarning, EligibilitePeaWarning } from "./AvertissementsPortefeuille";
import CashPocketCard from "./CashPocketCard";
import AddPositionPanel from "./AddPositionPanel";

// `cle` est le nom sous lequel l'indice est rangé dans `bourseHistory`. Il
// vivait jusqu'ici en dur dans `captureSnapshot` ; le rattrapage en a besoin
// aussi, et deux listes qui doivent rester d'accord sans que rien ne le
// vérifie finissent toujours par diverger.
// La liste vit désormais dans `src/lib/benchmarks.js`, importée plus haut :
// elle était dupliquée ici et dans BoursePerformance.jsx, et les deux copies
// avaient divergé — trois indices proposés à la sélection n'étaient jamais
// collectés, ce qui vidait le graphique au lieu d'afficher une courbe en moins.
const PIE_PALETTE = ["#a78bfa", "#d946ef", "#818cf8", "#c084fc", "#22d3ee", "#f472b6", "#8b5cf6", "#e879f9"];

const SOUS_ONGLETS_BOURSE = ["portefeuille", "analyse", "performance", "marche", "screener", "calendrier"];

/**
 * Onglet PEA & Bourse. Il lit l'état patrimonial dans le contexte
 * (`usePatrimoine`) au lieu de recevoir l'état complet de l'application en
 * props : ce dont il dépend se lit ici, d'un coup d'œil.
 */
export default function Bourse() {
  const {
    bourse, setBourse, bourseTotal, bourseGainAbs, bourseGainPct,
    alertesWatchlist, setAlertesWatchlist,
    bourseHistory, setBourseHistory, watchlist, setWatchlist, strategyNotes = [],
    // Composition de l'écran : quels blocs sont repliés. Persisté, donc
    // retrouvé tel quel au rechargement et sur les autres appareils.
    widgetsReplies = {}, basculerWidget,
    // Secteurs choisis à la main, partagés par Analyse et le Screener.
    secteursManuels = {}, setSecteursManuels,
  } = usePatrimoine();
  const { showToast } = useToast();
  const replie = (id) => Boolean(widgetsReplies?.[id]);
  const basculer = (id) => () => basculerWidget?.(id);
  // Actualisation des cours, relevés quotidiens et rattrapage : voir le hook.
  const {
    refreshing, refreshMsg, refreshPrices, completerDividendes,
    dailyData, seriesCours,
    trackLoading, trackError, captureSnapshot,
    apercuRecalcul, setApercuRecalcul, recalculEnCours, preparerRecalcul, validerRecalcul,
  } = useSuiviBourse({ bourse, setBourse, bourseHistory, setBourseHistory });
  const [showAdd, setShowAdd] = useState(false);
  const [panicPosition, setPanicPosition] = useState(null);
  // Fiche par ligne : l'identifiant de la position ouverte, ou null.
  const [ficheOuverte, setFicheOuverte] = useState(null);
  const [subTab, setSubTab] = useSousOnglet(SOUS_ONGLETS_BOURSE, "portefeuille");
  // Requête d'ouverture d'une fiche dans l'onglet Marché depuis le tableau de
  // positions ou la watchlist. Le "ts" force le rechargement dans <Marche>
  // même si on reclique deux fois de suite sur la même valeur.
  //
  // C'est un COMPTEUR et non `Date.now()`. L'horodatage avait deux défauts :
  // il rendait ce composant impur aux yeux du compilateur React, et surtout
  // deux clics dans la même milliseconde produisaient le même « ts » — le
  // second était alors pris pour une demande déjà traitée et ne rechargeait
  // rien. Un compteur ne peut pas collisionner.
  const [marcheRequest, setMarcheRequest] = useState(null);
  /**
   * Ouvre la fiche d'un titre dans le sous-onglet Marché.
   *
   * Passe par `startViewTransition` quand le navigateur l'expose : le ticker
   * VOYAGE alors de la ligne du tableau vers l'en-tête de la fiche, au lieu
   * d'être remplacé d'un écran à l'autre. Sans ça, il faut retrouver des yeux
   * le titre qu'on venait pourtant de désigner du doigt.
   *
   * `document.startViewTransition` n'existe pas partout, et la fonction rendue
   * doit rester synchrone dans tous les cas : le repli exécute simplement la
   * mise à jour, et le changement d'écran redevient ce qu'il était.
   */
  const openInMarche = (ticker) => {
    const appliquer = () => {
      setMarcheRequest((precedent) => ({
        symbol: ticker.toUpperCase(),
        ts: (precedent?.ts ?? 0) + 1,
      }));
      setSubTab("marche");
    };
    if (typeof document !== "undefined" && document.startViewTransition) {
      document.startViewTransition(appliquer);
    } else {
      appliquer();
    }
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

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ quantity: "", pru: "", current_price: "", annual_dividend: "" });

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
          {
            id: uid(), ticker: v.ticker, name: v.name, quantity: v.quantity, pru: v.pru, current_price: v.current_price, type: v.type, annual_dividend: v.annual_dividend || 0, currency: v.currency || "EUR",
            // Un dividende saisi à l'ajout est un choix : la valeur automatique
            // ne le remplacera pas. Laissé vide, il sera rempli au prochain
            // « Actualiser les cours ».
            ...(v.annual_dividend > 0 ? { dividendeSource: "manuel" } : {}),
          },
        ],
      })
    );
  /**
   * Suppression d'une ligne, annulable.
   *
   * La position est l'objet le plus coûteux à ressaisir de toute
   * l'application — quantité, PRU, devise, dividende, et surtout le
   * rattachement au journal d'opérations. Elle se supprimait pourtant en un
   * clic, sans confirmation ni retour en arrière, et la suppression se
   * propageait à tous les appareils via Supabase avant qu'on ait pu s'en
   * apercevoir.
   *
   * C'est l'état COMPLET de `bourse` qui est capturé, pas la seule liste de
   * positions : `rebaselineLedger` réécrit aussi la ligne de base du grand
   * livre, et restaurer les positions sans elle laisserait le journal
   * désaccordé.
   *
   * L'annulation est préférable à une confirmation : elle ne coûte rien à
   * l'usage normal, là où une modale à chaque suppression finit par être
   * cliquée sans être lue.
   */
  const removePosition = (id) => {
    const precedent = bourse;
    const cible = bourse.positions.find((p) => p.id === id);
    setBourse((b) => rebaselineLedger({ ...b, positions: b.positions.filter((x) => x.id !== id) }));
    showToast({
      message: `${cible?.name || cible?.ticker || "Position"} supprimée du portefeuille.`,
      onUndo: () => setBourse(precedent),
    });
  };

  const startEdit = (p) => { setEditingId(p.id); setEditValues({ quantity: String(p.quantity), pru: String(p.pru), current_price: String(p.current_price), annual_dividend: String(p.annual_dividend || 0) }); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = (id) => {
    setBourse((b) =>
      rebaselineLedger({
        ...b,
        positions: b.positions.map((p) =>
          p.id === id
            ? {
                ...p,
                quantity: lireNombre(editValues.quantity) ?? 0,
                pru: lireNombre(editValues.pru) ?? 0,
                current_price: lireNombre(editValues.current_price) ?? 0,
                annual_dividend: lireNombre(editValues.annual_dividend) ?? 0,
                // Corriger le dividende à la main le soustrait au remplissage
                // automatique ; le laisser tel quel ne change pas sa source ;
                // VIDER le champ le rend au marché, qui le remplira à la
                // prochaine vérification.
                ...(String(editValues.annual_dividend ?? "").trim() === ""
                  ? { dividendeSource: "auto", dividendeVerifieLe: null }
                  : (lireNombre(editValues.annual_dividend) ?? 0) !== (Number(p.annual_dividend) || 0)
                    ? { dividendeSource: "manuel" }
                    : {}),
              }
            : p
        ),
      })
    );
    setEditingId(null);
    // Champ vidé : la valeur du marché est récupérée tout de suite, plutôt
    // qu'à la prochaine vérification hebdomadaire.
    if (String(editValues.annual_dividend ?? "").trim() === "") {
      const cible = bourse.positions.find((p) => p.id === id);
      if (cible?.ticker) completerDividendes([cible.ticker]);
    }
  };

  /**
   * Tirer vers le bas pour actualiser les cours.
   *
   * Le bouton d'actualisation est en haut de l'onglet, hors de portée du pouce
   * sur un grand téléphone — exactement le problème que la barre de navigation
   * basse avait résolu pour la navigation. Restreint au sous-onglet
   * Portefeuille : c'est le seul où « rafraîchir » a un sens évident, et un
   * geste qui fait autre chose selon l'écran est pire que pas de geste.
   */
  const tirage = useTirerPourRafraichir(refreshPrices, {
    actif: subTab === "portefeuille" && bourse.positions.length > 0,
  });

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

  const base100Data = useMemo(() => rebaseTo100(bourseHistory, ["valeur", "sp500", "cac40", "msciWorld"]), [bourseHistory]);
  const hasEnoughHistory = bourseHistory.length >= 2;
  const hasEnoughBase100 = base100Data.length >= 2;

  /*
   * Mini-courbe de la carte « Valeur du portefeuille ».
   *
   * `valeur` du relevé quotidien est la même grandeur que `bourseTotal`
   * (positions + poche cash) : la courbe prolonge bien le chiffre affiché.
   *
   * Les deux autres cartes de synthèse n'en ont PAS, faute de série qui leur
   * corresponde. La plus-value latente affichée se mesure contre le prix de
   * revient (PRU) ; l'historique ne connaît que le capital VERSÉ, qui n'est
   * pas la même base — en tirer une courbe aurait montré l'évolution d'un
   * autre chiffre que celui écrit au-dessus. La poche cash, elle, n'est pas
   * historisée du tout.
   */
  const serieValeur = useMemo(() => serieSparkline(bourseHistory, "valeur"), [bourseHistory]);

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

  /**
   * Variation du portefeuille sur la séance.
   *
   * Calculée par `variationDuJour`, à partir de la clôture de la veille de
   * chaque ligne. L'ancienne version sommait `changeAbs × quantité` SANS
   * convertir les devises : une ligne en dollars pesait son montant brut en
   * euros dans le total. Elle n'affichait pas non plus de pourcentage, alors
   * que c'est lui qui se lit d'un coup d'œil.
   */
  const variationJour = useMemo(
    () => variationDuJour(bourse.positions, bourse.cash_pocket || 0),
    [bourse.positions, bourse.cash_pocket]
  );

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

      <IndicateurRafraichissement {...tirage} />

      <ForeignCurrencyWarning positions={bourse.positions} />
      <EligibilitePeaWarning positions={bourse.positions} enveloppe={bourse.envelope} />

      {/*
        Sous-onglets à curseur glissant.

        Les cinq boutons changeaient de couleur d'un coup, sans que rien
        n'indique d'où l'on venait. Le trait qui se DÉPLACE le dit, et le
        composant apporte au passage ce qui manquait : le motif ARIA
        « tablist », la navigation aux flèches, et un seul onglet dans l'ordre
        de tabulation au lieu de cinq.
      */}
      <OngletsGlissants
        className="teinte-violet"
        ariaLabel="Sections de PEA & Bourse"
        actif={subTab}
        onChange={setSubTab}
        onglets={[
          { id: "portefeuille", libelle: "Portefeuille", icone: Briefcase },
          { id: "analyse", libelle: "Analyse", icone: Gauge },
          { id: "performance", libelle: "Performance", icone: Activity },
          { id: "marche", libelle: "Marché", icone: Search },
          { id: "screener", libelle: "Screener", icone: Filter },
          { id: "calendrier", libelle: "Calendrier", icone: CalendarDays },
        ]}
      />

      {subTab === "portefeuille" && (
      <>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Le halo reprend le SENS de la séance, que le pourcentage écrit
            juste en dessous donne déjà : la couleur ajoute un coup d'œil,
            elle ne porte jamais l'information à elle seule. */}
        <Card accent={CARD_THEMES.violet} tendance={variationJour.exploitable ? Math.sign(variationJour.montant) : 0}>
          <CardLabel>Valeur du portefeuille</CardLabel>
          <div className="flex items-end justify-between gap-3">
            <div className="font-display text-xl text-slate-100 ghost-blur">
              <ChiffreCompteur valeur={bourseTotal} format={(v) => eur(v)} />
            </div>
            {/* La couleur suit le sens de la PÉRIODE, pas celui de la séance
                donné juste en dessous : les deux peuvent diverger, et c'est
                justement ce que la courbe apprend en plus. */}
            {serieValeur.length > 0 && (
              <Sparkline
                valeurs={serieValeur}
                className={`w-20 h-7 shrink-0 ghost-blur ${
                  serieValeur.at(-1) >= serieValeur[0] ? "text-emerald-400/70" : "text-rose-400/70"
                }`}
              />
            )}
          </div>
          {/* Le POURCENTAGE d'abord, le montant à côté : c'est l'ordre de
              lecture naturel d'une variation de séance, et le pourcentage est
              le seul des deux qui soit comparable d'un jour à l'autre. */}
          {variationJour.exploitable && (
            <div
              className={`flex items-center gap-1.5 text-xs mt-1 font-data tabular-nums ghost-blur ${
                variationJour.montant >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {variationJour.montant >= 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
              <span className="font-semibold">
                {variationJour.montant >= 0 ? "+" : "−"}
                {pctPlain(Math.abs(variationJour.pourcentage))}
              </span>
              <span className="text-slate-400">
                {variationJour.montant >= 0 ? "+" : "−"}
                {eur(Math.abs(variationJour.montant))}
              </span>
              <span className="text-slate-500">aujourd&apos;hui</span>
            </div>
          )}
          {/* Une ligne sans cours de veille est exclue des deux termes du
              calcul, pas comptée à zéro : la variation affichée porte alors
              sur une partie seulement du portefeuille, et le dire vaut mieux
              que de laisser croire à un total. */}
          {variationJour.exploitable && variationJour.lignesIgnorees > 0 && (
            <div className="text-micro text-amber-300/70 mt-0.5">
              {variationJour.lignesIgnorees} ligne(s) sans cours de veille, hors de ce calcul
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
      {/* Deux colonnes au-delà de 1 280 px : les blocs de contexte tiennent à
          côté du flux principal au lieu de rallonger le défilement. */}
      {/* Pas de `grille-cartes` ici : son `align-items: start` vise une
          GRILLE (hauteur propre de chaque carte). Sous 1 280 px ce conteneur
          est une colonne flex, où la même règle porte sur la LARGEUR — les
          deux cartes, repliées, se réduisaient à la largeur de leur titre.
          Au-delà, `colonnes-larges` applique déjà `align-items: start`. */}
      <div className="mt-6 flex flex-col gap-4 colonnes-larges">
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
          <EmptyState picto="dividendes">
            Le dividende de chaque ligne se remplit au prochain « Actualiser les cours », depuis la source de marché. Une ligne qui ne verse rien (ETF capitalisant, société sans dividende) reste à zéro ; le crayon permet de corriger une valeur.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-1">
            <div>
              <div className="text-micro text-slate-500 mb-0.5">
                {dividendSummary.totalRetenueSource > 0 ? "Dividendes nets encaissés" : "Dividendes annuels"}
              </div>
              <div className="font-display text-lg text-emerald-400 ghost-blur">
                {eur(dividendSummary.totalAnnualDividendNet, 2)}
              </div>
              {dividendSummary.totalRetenueSource > 0 && (
                <div className="text-micro text-amber-300/90 mt-0.5 ghost-blur">
                  {eur(dividendSummary.totalAnnualDividend, 2)} bruts − {eur(dividendSummary.totalRetenueSource, 2)} de
                  retenue étrangère
                </div>
              )}
            </div>
            <div>
              <div className="text-micro text-slate-500 mb-0.5">Moyenne mensuelle</div>
              <div className="font-display text-lg text-slate-100 ghost-blur">{eur(dividendSummary.monthlyAverage, 2)}</div>
            </div>
            <div>
              <div className="text-micro text-slate-500 mb-0.5">Rendement / valeur actuelle</div>
              <div className="font-display text-lg text-violet-300">{pctPlain(dividendSummary.portfolioYieldOnValue, 2)}</div>
            </div>
            <div>
              <div className="text-micro text-slate-500 mb-0.5">Rendement / capital investi</div>
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

        {refreshMsg && <p className="text-micro text-amber-300/80 mb-3">{refreshMsg}</p>}

        {bourse.positions.length === 0 ? (
          <EtatVide
                picto="bourse"
                titre="Ton portefeuille est vide"
                action={<GhostButton onClick={() => setShowAdd(true)} theme="violet">Ajouter une position</GhostButton>}
              >
                Une ligne suffit pour commencer — ticker, quantité, prix de revient. Patrium suit
                ensuite sa valeur, sa plus-value nette d'impôt et ses dividendes attendus.
              </EtatVide>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-cards table-donnees">
              <thead>
                <tr className="text-left text-micro uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Actif</th>
                  <th className="py-2 pr-3">Qté</th>
                  <th className="py-2 pr-3">PRU</th>
                  <th className="py-2 pr-3">Cours</th>
                  <th className="py-2 pr-3">
                    <span className="flex items-center gap-1">
                      Var. J
                      <span className="text-[9px] text-slate-500 normal-case tracking-normal">(vs clôt. veille)</span>
                    </span>
                  </th>
                  <th className="py-2 pr-3">Valeur</th>
                  <th className="py-2 pr-3">+/− value</th>
                  <th className="py-2 pr-3">Poids</th>
                  <th className="py-2 pr-3">
                    <span className="flex items-center gap-1">
                      Div. annuel
                      <span className="text-[9px] text-slate-500 normal-case tracking-normal">(rdt · YoC)</span>
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
                              <div className="text-micro text-slate-500">{p.name} · {p.type}</div>
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
                        <td className="py-3 pr-3 text-slate-500 text-xs" colSpan={3}>Aperçu après enregistrement</td>
                        <td className="py-2 pr-3">
                          <input type="number" step="0.01" placeholder="vide = auto" title="Dividende annuel par action. Vide : la valeur du marché, mise à jour chaque semaine." value={editValues.annual_dividend} onChange={(e) => setEditValues((v) => ({ ...v, annual_dividend: e.target.value }))} className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data focus:outline-none focus:border-amber-400/60" />
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
                    <LignePosition key={p.id} onSupprimer={() => removePosition(p.id)}>
                      <td data-label="Actif" className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => setFicheOuverte(p.id)}
                          data-voyageur={marcheRequest?.symbol === p.ticker.toUpperCase() ? "" : undefined}
                          title="Ouvrir la fiche de la ligne : courbe, dividendes, thèse, opérations"
                          className="flex items-center gap-2 text-left group/ticker"
                        >
                          <AssetLogo ticker={p.ticker} size="xs" />
                          <div>
                            <div className="text-slate-200 font-medium group-hover/ticker:text-violet-300 transition-colors">{p.ticker}</div>
                            <div className="text-micro text-slate-500">{p.name} · {p.type}</div>
                          </div>
                        </button>
                      </td>
                      <td data-label="Qté" className="py-3 pr-3 font-data tabular-nums">{p.quantity}</td>
                      <td data-label="PRU" className="py-3 pr-3 font-data tabular-nums ghost-blur">{eur(p.pru, 2)}</td>
                      <td data-label="Cours" className="py-3 pr-3 font-data tabular-nums ghost-blur">{eur(p.current_price, 2)}</td>
                      <td data-label="Variation du jour" className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <DailyVariation position={p} dailyData={dailyData} />
                          {/* La variation du jour donne un CHIFFRE ; la
                              sparkline donne la FORME. Une hausse de 2 % après
                              trois semaines de baisse n'a rien à voir avec la
                              même hausse au bout d'une pente régulière, et le
                              chiffre seul ne permet pas de les distinguer. */}
                          <Sparkline
                            valeurs={(seriesCours?.[p.ticker] || []).map((pt) => pt.p)}
                            className={`w-14 h-5 shrink-0 hidden sm:block ${
                              tendance(seriesCours?.[p.ticker]) >= 0 ? "text-emerald-400/70" : "text-rose-400/70"
                            }`}
                          />
                        </div>
                        {(dailyData?.[p.ticker]?.changePct ?? 0) <= PANIC_THRESHOLD_PCT && (
                          <button
                            onClick={() => setPanicPosition(p)}
                            className="flex items-center gap-1 text-micro font-semibold text-rose-300 hover:text-rose-200 mt-1 animate-pulse"
                          >
                            <BookOpen size={11} /> Lire ma thèse
                          </button>
                        )}
                      </td>
                      <td data-label="Valeur" className="py-3 pr-3 font-data tabular-nums ghost-blur">{eur(value)}</td>
                      <td data-label="+/− value" className={`py-3 pr-3 font-data tabular-nums ghost-blur ${gainAbs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {eur(gainAbs)} <span className="text-micro opacity-80">({pct(gainPct)})</span>
                      </td>
                      <td data-label="Poids" className="py-3 pr-3 font-data tabular-nums text-slate-400">{pctPlain(weight)}</td>
                      <td data-label="Dividendes" className="py-3 pr-3">
                        {p.annual_dividend > 0 ? (
                          <div className="font-data tabular-nums">
                            <div
                              className="text-emerald-400 ghost-blur"
                              title={
                                p.dividendeSource === "auto"
                                  ? `Dividende annoncé par la source de marché, vérifié le ${p.dividendeMajLe || "—"}. Le crayon permet de le corriger.`
                                  : "Dividende saisi à la main."
                              }
                            >
                              {eur(p.annual_dividend * p.quantity, 2)}
                              {p.dividendeSource === "auto" && (
                                <span className="ml-1 text-[9px] uppercase tracking-wide text-slate-500">auto</span>
                              )}
                            </div>
                            <div className="text-micro text-slate-500 flex items-center gap-1">
                              <span>{pctPlain(p.current_price > 0 ? (p.annual_dividend / p.current_price) * 100 : 0, 2)} rdt</span>
                              {p.pru > 0 && (
                                <span className="text-amber-300/90" title="Rendement sur ton PRU (Yield on Cost)">
                                  · <span className="font-semibold">{pctPlain((p.annual_dividend / p.pru) * 100, 2)}</span> YoC
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <MenuActions
                          className="flex justify-end"
                          libelle={`Actions sur ${p.ticker || p.name}`}
                          actions={[
                            { libelle: "Modifier", icone: Pencil, onClick: () => startEdit(p) },
                            { libelle: "Fiche de la ligne", icone: BookOpen, onClick: () => setFicheOuverte(p.id) },
                            p.ticker && { libelle: "Ouvrir dans Marché", icone: Search, onClick: () => openInMarche(p.ticker) },
                            { libelle: "Supprimer", icone: Trash2, onClick: () => removePosition(p.id), danger: true },
                          ]}
                        />
                      </td>
                    </LignePosition>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <AddPositionPanel open={showAdd} onClose={() => setShowAdd(false)} onSubmit={addPosition} />

        <p className="text-micro text-slate-500 mt-4">
          La variation journalière est calculée par rapport au cours de clôture de la veille, récupéré lors du dernier « Actualiser les cours ».
        </p>
      </CarteRepliable>

      <Watchlist
        watchlist={watchlist}
        setWatchlist={setWatchlist}
        onOpenMarket={openInMarche}
        alertes={alertesWatchlist}
        setAlertes={setAlertesWatchlist}
        replie={replie("watchlist")}
        onBasculer={basculer("watchlist")}
      />
      </>
      )}

      {/*
        Analyse : tout ce qui JUGE le portefeuille, séparé de ce qui le
        décrit. L'onglet Portefeuille enchaînait indicateurs, positions,
        watchlist, rééquilibrage, deux répartitions et la santé — une dizaine
        d'écrans sur téléphone, où l'on cherchait ses lignes entre deux
        graphiques. On lit d'abord ce qu'on détient ; on vient ici quand on
        veut savoir si c'est bien réparti, et quoi faire si ce ne l'est pas.

        Ordre : le diagnostic (santé, avec l'exposition par pays), puis ce
        qu'il implique (rééquilibrage), puis le détail qui le fonde (les
        deux répartitions). Ces mesures portent sur les LIGNES, pas sur le
        patrimoine : leur place est ici et non au Dashboard, où un score de
        robustesse se lirait comme un jugement global alors qu'il ne dit
        rien des livrets ni de l'immobilier.
      */}
      {subTab === "analyse" && (
      <>
      <SantePortefeuille positions={bourse.positions} secteursManuels={secteursManuels} />

      {/* Remplace le simulateur d'ordre : celui-ci ne traitait qu'une ligne à
          la fois, alors que vendre une position modifie le poids de toutes les
          autres. */}
      <Reequilibrage
        bourse={bourse}
        setBourse={setBourse}
        replie={replie("reequilibrage")}
        onBasculer={basculer("reequilibrage")}
      />

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
          <EmptyState picto="graphique">Ajoute une position pour voir sa répartition.</EmptyState>
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

      <SectorHeatmap
        positions={bourse.positions}
        secteursManuels={secteursManuels}
        setSecteursManuels={setSecteursManuels}
        replie={replie("heatmap")}
        onBasculer={basculer("heatmap")}
      />

      {/* Après la répartition par secteur, ce qui la nuance : deux secteurs
          différents peuvent quand même bouger ensemble. Un seul appel pour
          tout le portefeuille, et aucun tant que la carte est repliée. */}
      <CorrelationsLignes
        positions={bourse.positions}
        replie={replie("correlations")}
        onBasculer={basculer("correlations")}
      />

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
        apercuRecalcul={apercuRecalcul}
        recalculEnCours={recalculEnCours}
        onPreparerRecalcul={preparerRecalcul}
        onValiderRecalcul={validerRecalcul}
        onAnnulerRecalcul={() => setApercuRecalcul(null)}
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
          secteursManuels={secteursManuels}
          watchlist={watchlist}
          setWatchlist={setWatchlist}
          onOpenMarket={openInMarche}
        />
      )}

      {subTab === "calendrier" && (
        <FinancialCalendar positions={bourse.positions} watchlist={watchlist} />
      )}

      {ficheOuverte && bourse.positions.some((p) => p.id === ficheOuverte) && (
        <FicheLigne
          position={bourse.positions.find((p) => p.id === ficheOuverte)}
          onClose={() => setFicheOuverte(null)}
          bourse={bourse}
          strategyNotes={strategyNotes}
          secteursManuels={secteursManuels}
          onOuvrirMarche={(ticker) => {
            setFicheOuverte(null);
            openInMarche(ticker);
          }}
        />
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
