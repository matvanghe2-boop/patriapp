import { useState, useMemo, useEffect } from "react";
import { ResponsiveContainer, Tooltip, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceDot } from "recharts";
import { TrendingUp, PiggyBank, Landmark, Wallet, ArrowUpRight, ArrowDownRight, Scale } from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, AddPanel, EmptyState, PageGlow, ChampNumerique, CARD_THEMES } from "./ui";
import { eur, pct, pctPlain, compact, uid, guessEnvelope, ENVELOPE_META, computeDiversificationScore, computeInvestedCapital, investedCapitalAsOf, todayIso, netWorthDelta, projectMonthly, valeurPosition, lireNombre } from "../lib/finance";
import { usePersistentState } from "../lib/storage";
import { joursDeLAnnee, semainesAgitees } from "../lib/retrospective";
import { useToast } from "../lib/ToastContext";
import { exportToExcel, exportToPDF } from "../lib/exportReport";
import Objectifs from "./Objectifs";
import CascadeMensuelle from "./CascadeMensuelle";
import RevenusPassifs from "./RevenusPassifs";
import CalendrierRevenus from "./CalendrierRevenus";
import OriginePatrimoine from "./OriginePatrimoine";
import BriefingDuJour from "./BriefingDuJour";
import ProchainesEcheances from "./ProchainesEcheances";
import EtatVide from "./EtatVide";
import Montant from "./Montant";
import { AnneauRepartition, CalendrierAnnuel, CourbeEvolution } from "./graphiques";
import { serieSparkline, marqueursOperations, NATURES_MARQUEUR } from "../lib/marqueursCourbe";
import { FileDown, FileSpreadsheet, PieChart as PieIcon, SlidersHorizontal } from "lucide-react";
import { Disposition, Bloc, PersonnaliserDashboard } from "./DispositionDashboard";
import { ResumeCompteCourant, SanteFinanciere } from "./BlocsCompteDashboard";
import { DISPOSITION_DEFAUT } from "../lib/dispositionDashboard";
import { decouperParPoche, COULEURS_POCHES } from "../lib/patrimoineParPoche";
import { recordAAnnoncer, objectifsAAnnoncer, plusHautHistorique } from "../lib/records";
import CentreAFaire from "./CentreAFaire";
import AgendaFinancier from "./AgendaFinancier";
import { enEurosConstants, inflationOfficielle } from "../lib/inflation";
import { usePatrimoine } from "../lib/PatrimoineContext";
import { TIME_FILTERS, getMonthsAgo, PointFinal, TimeFilterBar, ChartTooltip, PastilleOperations, RepereAnnotation } from "./CourbePatrimoineOutils";
import { creerAnnotation, placerAnnotations, LONGUEUR_MAX } from "../lib/annotations";
import OnboardingCard from "./CarteBienvenue";
import { ProfilReel, ProfileFreshness, formatDateFr } from "./ProfilMensuelOutils";
import StagnationBadge from "./BadgeFraicheurCours";
import AllocationTarget from "./AllocationCible";

// ─── Main Dashboard ───────────────────────────────────────────────────────────
/**
 * Tableau de bord. Il lit l'état patrimonial dans le contexte
 * (`usePatrimoine`) au lieu de recevoir l'état complet de l'application en
 * props : ce dont il dépend se lit ici, d'un coup d'œil.
 */
export default function Dashboard() {
  const {
    profile, setProfile, patrimoineBrut, patrimoineNet, bourseGainAbs, bourseGainPct,
    epargneMensuelle, tauxEpargne, dettes, setDettes, dettesTotal,
    historyPast, setHistoryPast, livretsTotal, bourseTotal,
    livrets, bourse, matelasMois, setLastSnapshotDate,
    cash, livretsAvgRate, sim, isEmpty, loadDemoData, profileHistory,
    objectifs, setObjectifs, bourseHistory = [], contracts = [], evenementsMarche = [],
    compteSolde = null, matelasCompteCourant = 0, compteEnrichies = [], compteOperations = [], compteReleves = [],
    budgetReel = null, strategyNotes = [], subs = [], matelasMoisPrudent = null, enveloppes = [],
  } = usePatrimoine();
  const [showAddDette, setShowAddDette] = useState(false);
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [timeFilter, setTimeFilter] = useState("ALL");
  // « total » : la courbe du patrimoine net ; « poches » : la même, découpée
  // en bourse, livrets suivis et reste.
  const [vueCourbe, setVueCourbe] = useState("total");
  // Courbe en euros d'aujourd'hui (corrigée de l'inflation officielle).
  const [eurosConstants, setEurosConstants] = useState(false);
  const { showToast } = useToast();

  // Allocation cible — passe par l'état persistant, et donc par la
  // synchronisation cloud. Elle était écrite en direct dans le localStorage :
  // c'était la seule donnée de l'app à ne jamais suivre d'un appareil à
  // l'autre, sans que rien ne le signale.
  const [allocationTarget, saveAllocationTarget] = usePersistentState("allocationTarget", { bourse: 60 });

  // Ordre et visibilité des blocs. Persistés comme le reste : la disposition
  // choisie sur l'ordinateur se retrouve sur le téléphone.
  const [disposition, setDisposition] = usePersistentState("dispositionDashboard", DISPOSITION_DEFAUT);
  const [personnalisation, setPersonnalisation] = useState(false);

  /*
   * Records et objectifs atteints, annoncés au moment où ils arrivent.
   * Le dernier record annoncé et les objectifs déjà salués sont gardés : un
   * même événement n'est dit qu'une fois, sur tous les appareils.
   *
   * Au tout premier passage, ce qui est DÉJÀ acquis est enregistré sans
   * message : sinon, la mise en ligne de cette fonction aurait salué d'un
   * coup des objectifs atteints depuis des mois.
   */
  const [recordsAnnonces, setRecordsAnnonces] = usePersistentState("recordsAnnonces", null);
  useEffect(() => {
    if (isEmpty || !Number.isFinite(patrimoineNet) || patrimoineNet <= 0) return;
    const aujourdhui = todayIso();
    if (!recordsAnnonces) {
      const haut = plusHautHistorique(historyPast, aujourdhui);
      // Initialise la mémoire des annonces à partir des données déjà chargées ;
      // aucune boucle possible : l'état n'est plus nul ensuite.
      setRecordsAnnonces({
        // `silencieux` : enregistré sans être annoncé, le briefing ne le
        // présente donc pas comme un record du jour.
        record: { valeur: Math.round(Math.max(patrimoineNet, haut?.valeur ?? 0)), date: aujourdhui, silencieux: true },
        objectifs: objectifsAAnnoncer(objectifs, patrimoineNet, []).map((o) => o.id),
      });
      return;
    }
    const record = recordAAnnoncer({
      historique: historyPast,
      patrimoineActuel: patrimoineNet,
      dernierAnnonce: recordsAnnonces.record,
      aujourdhui,
    });
    const atteints = objectifsAAnnoncer(objectifs, patrimoineNet, recordsAnnonces.objectifs);
    if (!record && atteints.length === 0) return;
    if (record) {
      showToast({
        message: `Nouveau record de patrimoine : ${eur(record.valeur)}. Le précédent, ${eur(record.precedent.valeur)}, datait du ${new Date(`${record.precedent.date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.`,
      });
    }
    for (const o of atteints) {
      showToast({ message: `Objectif « ${o.libelle || "sans nom"} » atteint : ${eur(o.cible)}.` });
    }
    setRecordsAnnonces((r) => ({
      record: record ? { valeur: Math.round(record.valeur), date: aujourdhui } : r?.record ?? null,
      objectifs: [...(r?.objectifs || []), ...atteints.map((o) => o.id)],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patrimoineNet, historyPast, objectifs, isEmpty]);

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

    // En euros d'aujourd'hui : chaque point est ramené au pouvoir d'achat du
    // jour au taux d'inflation officiel — une hypothèse simple, annoncée
    // dans la légende. Les projections futures sont ramenées dans l'autre sens.
    if (eurosConstants) {
      filtered = filtered.map((p) => ({ ...p, value: Math.round(enEurosConstants(p.value, p.date)) }));
      projectionPoints.forEach((p) => {
        p.projection = Math.round(enEurosConstants(p.projection, p.date));
      });
    }

    // Merge: last real point ties into first projection
    const histData = filtered.map((p) => ({ ...p, projection: undefined }));
    // Connect real line to first projection point
    if (histData.length > 0) {
      histData[histData.length - 1].projection = Math.round(patrimoineNet);
    }

    // Clé d'abscisse UNIQUE par point. Les libellés du relevé quotidien
    // (« 5 mars ») n'ont pas d'année : sur la vue ALL, deux points finissent
    // par porter le même, et recharts ne sait alors plus sur lequel poser un
    // repère — une pastille d'achat de cette année atterrissait sur le
    // relevé de l'an dernier. L'axe affiche toujours le libellé.
    return [...histData, ...projectionPoints].map((p, i) => ({ ...p, cle: `p${i}` }));
  }, [historyPast, patrimoineNet, epargneMensuelle, timeFilter, blendedRatePct, eurosConstants]);

  const libelleParCle = useMemo(
    () => Object.fromEntries(chartData.map((p) => [p.cle, p.label])),
    [chartData]
  );
  const cleAujourdhui = chartData.find((p) => p.label === "Aujourd'hui")?.cle;

  /**
   * Achats, ventes, dividendes, versements et retraits posés sur la courbe.
   *
   * Ils viennent du journal de la poche bourse, mais se lisent ici sur le
   * patrimoine NET : c'est là qu'un versement se voit le mieux — la courbe
   * monte sans que le marché y soit pour rien. Le rattachement au dernier
   * relevé connu et l'exclusion des ajustements de solde sont dans
   * `marqueursOperations`.
   */
  const marqueurs = useMemo(
    () => marqueursOperations(bourse?.operations || [], chartData, "value"),
    [bourse?.operations, chartData]
  );
  const marqueursParCle = useMemo(
    () => Object.fromEntries(marqueurs.map((m) => [m.point.cle, m])),
    [marqueurs]
  );

  // Événements de vie posés sur la courbe — ce que les chiffres ne disent pas.
  const [annotations, setAnnotations] = usePersistentState("annotationsPatrimoine", []);
  const [annotationOuverte, setAnnotationOuverte] = useState(false);
  const [brouillonAnnotation, setBrouillonAnnotation] = useState({ date: todayIso(), texte: "" });
  const groupesAnnotations = useMemo(
    () => (eurosConstants ? [] : placerAnnotations(annotations, chartData, "value")),
    [annotations, chartData, eurosConstants]
  );
  const annotationsParCle = useMemo(
    () => Object.fromEntries(groupesAnnotations.map((g) => [g.point.cle, g])),
    [groupesAnnotations]
  );
  const ajouterAnnotation = (e) => {
    e.preventDefault();
    const a = creerAnnotation({ id: uid(), ...brouillonAnnotation });
    if (!a) return;
    setAnnotations((l) => [...(Array.isArray(l) ? l : []), a]);
    setBrouillonAnnotation({ date: todayIso(), texte: "" });
    setAnnotationOuverte(false);
  };

  const decoupage = useMemo(
    () =>
      vueCourbe === "poches"
        ? decouperParPoche(chartData, {
            bourseHistory,
            livrets,
            aDesPositions: (bourse?.positions || []).length > 0,
          })
        : null,
    [vueCourbe, chartData, bourseHistory, livrets, bourse?.positions]
  );
  const enPoches = vueCourbe === "poches" && decoupage != null;
  const pointRecord = useMemo(() => {
    const reels = chartData.filter((p) => Number.isFinite(p.value));
    if (reels.length < 7) return null;
    return reels.reduce((m, p) => (p.value > m.value ? p : m), reels[0]);
  }, [chartData]);
  const donneesCourbe = enPoches ? decoupage.points : chartData;

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

  /**
   * Objectifs à porter en jalons sur la courbe.
   *
   * Limités à trois, et aux plus proches de la situation actuelle : au-delà,
   * les traits se chevauchent et la courbe devient illisible — ce qui est
   * l'inverse du but.
   */
  const jalonsObjectifs = useMemo(
    () =>
      (objectifs || [])
        .filter((o) => Number.isFinite(o?.cible) && o.cible > 0)
        .map((o) => ({ id: o.id, libelle: o.libelle || "Objectif", cible: o.cible, atteint: patrimoineNet >= o.cible }))
        .sort((a, b) => Math.abs(a.cible - patrimoineNet) - Math.abs(b.cible - patrimoineNet))
        .slice(0, 3),
    [objectifs, patrimoineNet]
  );

  // Cases du calendrier annuel. Le seuil de 14 relevés évite d'afficher une
  // grille presque entièrement vide dans les deux premières semaines d'usage,
  // qui donnerait l'impression que la fonctionnalité est cassée.
  /**
   * Série de l'année, pour la courbe de fond du bandeau d'ouverture.
   *
   * Volontairement brute — une valeur par relevé, sans lissage ni comblement
   * des trous. Elle donne la DIRECTION d'un coup d'œil ; la lecture précise
   * revient au graphique complet, plus bas sur la page.
   */
  // C'est la mini-courbe de la carte du patrimoine net : elle y était déjà, en
  // fond. Une seconde sparkline à côté du montant aurait redit la même chose.
  // Elle suit désormais la règle commune des trois points (`serieSparkline`) :
  // à deux relevés, en janvier, elle traçait un segment qui passait pour une
  // tendance. Les relevés sans valeur ne sont plus comptés à zéro.
  const serieAnnee = useMemo(
    () =>
      serieSparkline(
        (historyPast || []).filter((p) => String(p.date || "").startsWith(String(new Date().getFullYear()))),
        "value"
      ),
    [historyPast]
  );

  const joursAnnee = useMemo(() => {
    const jours = joursDeLAnnee(historyPast, new Date().getFullYear());
    return {
      jours,
      releves: jours.filter((j) => j.variation != null).length,
      // Repère de contexte : une semaine où le marché entier s'est agité
      // n'appelle pas la même conclusion qu'une baisse propre au portefeuille.
      agitees: semainesAgitees(bourseHistory),
    };
  }, [historyPast, bourseHistory]);

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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={() => setPersonnalisation(true)}
            aria-haspopup="dialog"
            className="flex items-center gap-1.5 text-micro font-medium text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-400/40 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <SlidersHorizontal size={13} aria-hidden="true" /> Personnaliser
          </button>
          <button
            onClick={() =>
              exportToExcel({
                patrimoineBrut, patrimoineNet, dettesTotal, livretsTotal, bourseTotal, cash,
                livrets, bourse, envelopeBreakdown: allocationData,
              })
            }
            className="flex items-center gap-1.5 text-micro font-medium text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-400/40 rounded-lg px-2.5 py-1.5 transition-colors"
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
            className="flex items-center gap-1.5 text-micro font-medium text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-400/40 rounded-lg px-2.5 py-1.5 transition-colors"
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

      {/* Ordre et visibilité des blocs, choisis dans « Personnaliser ». Le
          message d'accueil reste hors de la disposition : il disparaît de
          lui-même dès la première saisie. */}
      <Disposition disposition={disposition}>
      <Bloc id="briefing">
        <BriefingDuJour
          bourse={bourse}
          objectifs={objectifs}
          patrimoineNet={patrimoineNet}
          epargneMensuelle={epargneMensuelle}
          tauxAnnuelPct={blendedRatePct}
          recordDuJour={
            recordsAnnonces?.record?.date === todayIso() && !recordsAnnonces.record.silencieux
              ? recordsAnnonces.record.valeur
              : null
          }
        />
      </Bloc>

      {/* Tout ce qui demande une action, tous onglets confondus */}
      <Bloc id="actions">
      <CentreAFaire
        livrets={livrets}
        bourse={bourse}
        matelasMois={matelasMoisPrudent ?? matelasMois}
        tauxReference={bourseGainPct}
        strategyNotes={strategyNotes}
        subs={subs}
        contracts={contracts}
        compteEnrichies={compteEnrichies}
        enveloppes={enveloppes}
        objectifs={objectifs}
        compteReleves={compteReleves}
        patrimoineNet={patrimoineNet}
      />
      </Bloc>

      <Bloc id="profil">
      {/* Profil mensuel */}
      <Card accent={CARD_THEMES.emerald}>
        {profile.source === "releves" ? (
          <ProfilReel profile={profile} />
        ) : (
        <>
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
            <span className="text-xs text-slate-500">€/mois</span>
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
            <span className="text-xs text-slate-500">€/mois</span>
          </div>
        </div>

        {/* Ces deux nombres déterminent le taux d'épargne, le matelas de
            sécurité et l'alerte associée. Sans repère d'ancienneté, une saisie
            oubliée les rendait faux tous les trois, en silence. */}
        <ProfileFreshness updatedAt={profile.updatedAt} history={profileHistory} />
        </>
        )}
      </Card>
      </Bloc>

      {/*
        BANDEAU D'OUVERTURE.
        ═══════════════════

        Le Dashboard était une pile verticale de cartes de même poids : on le
        parcourait, on ne le CONSULTAIT pas. Un tableau de bord a besoin d'un
        point d'entrée — le chiffre qui compte, sa trajectoire, et deux ou trois
        repères — avant de dérouler le détail.

        Le contenu ne change pas ; sa hiérarchie, si. La pastille ronde qui
        tenait le patrimoine net était contrainte à 190 px de côté : le montant
        y était plus petit que les titres de section qui l'entouraient, alors
        que c'est le seul chiffre pour lequel on ouvre l'application.

        La courbe passe EN FOND et non à côté : elle est là pour donner la
        direction d'un coup d'œil, pas pour être lue point par point — c'est le
        rôle du graphique complet, plus bas sur la page.
      */}
      <Bloc id="vedette">
      <Card role="vedette" accent="teinte-emerald" className="relative overflow-hidden">
        {serieAnnee.length > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-3/5 opacity-60 pointer-events-none" aria-hidden="true">
            <CourbeEvolution
              valeurs={serieAnnee}
              largeur={640}
              hauteur={80}
              className="w-full h-full text-emerald-400 ghost-blur"
            />
          </div>
        )}
        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <CardLabel icon={Landmark}>Patrimoine net</CardLabel>
            <Montant valeur={patrimoineNet} decimales={2} anime pulse className="block text-vedette text-slate-50" />
            {delta30j.hasReference ? (
              <span
                title={`Référence : relevé du ${formatDateFr(delta30j.refDate)}`}
                className={`text-corps mt-1.5 flex items-center gap-1.5 ghost-blur ${delta30j.abs >= 0 ? "etat-ok" : "etat-critique"}`}
              >
                {delta30j.abs >= 0 ? <ArrowUpRight size={15} aria-hidden="true" /> : <ArrowDownRight size={15} aria-hidden="true" />}
                {eur(Math.abs(delta30j.abs))} sur 30 jours
              </span>
            ) : (
              <span className="text-corps mt-1.5 text-slate-500 block">Pas encore d'historique</span>
            )}
          </div>

          <dl className="flex gap-6 sm:gap-9">
            <div>
              <dt className="text-micro uppercase tracking-wider text-slate-500">Taux d'épargne</dt>
              <dd className="font-data tabular-nums text-chiffre text-slate-100 ghost-blur">
                {Number.isFinite(tauxEpargne) ? `${pctPlain(tauxEpargne, 0)}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-micro uppercase tracking-wider text-slate-500">Matelas</dt>
              <dd className="font-data tabular-nums text-chiffre text-slate-100 ghost-blur">
                {matelasMois != null
                  ? `${matelasMois.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mois`
                  : "—"}
              </dd>
              {matelasMoisPrudent != null && matelasMois != null && Math.abs(matelasMoisPrudent - matelasMois) >= 0.1 && (
                <dd className="text-micro text-slate-500 mt-0.5 max-w-[11rem]">
                  soit{" "}
                  <span className="ghost-blur">
                    {matelasMoisPrudent.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mois
                  </span>{" "}
                  de tes mois les plus chers
                </dd>
              )}
              {matelasCompteCourant > 0 && (
                <dd className="text-micro text-slate-500 mt-0.5 max-w-[11rem]">
                  dont <span className="ghost-blur">{eur(matelasCompteCourant)}</span> du compte courant, au-delà d'un mois
                  de dépenses
                </dd>
              )}
            </div>
          </dl>
        </div>
      </Card>
      </Bloc>

      <Bloc id="kpis">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card accent={CARD_THEMES.emerald}>
            <CardLabel icon={Landmark}>Patrimoine brut</CardLabel>
            <div className="font-display text-xl text-slate-100 ghost-blur">{eur(patrimoineBrut)}</div>
            {dettesTotal > 0 && <div className="text-xs text-slate-500 mt-1 ghost-blur">dont −{eur(dettesTotal)} de passifs</div>}
            {compteSolde && (
              <div className="text-xs text-slate-500 mt-1">
                dont <span className="ghost-blur">{eur(compteSolde.solde / 100)}</span> sur le compte courant
                {compteSolde.ajustement
                  ? ` (relevé du ${formatDateFr(compteSolde.date)}, corrigé de ${compteSolde.provisoires.length} mouvement${
                      compteSolde.provisoires.length > 1 ? "s" : ""
                    } depuis)`
                  : `, au ${formatDateFr(compteSolde.date)}`}
              </div>
            )}
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
              <div className="flex justify-between items-center text-micro">
                <span className="text-slate-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                  Versements cumulés
                </span>
                <span className="font-data tabular-nums text-slate-300 ghost-blur">{eur(versementsCumules)}</span>
              </div>
              <div className="flex justify-between items-center text-micro">
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
              <div className="text-micro text-slate-500 mt-1 ghost-blur">
                Projection +{eur(epargneMensuelle * 6)} / 6 mois
              </div>
            )}
          </Card>
        </div>
      </div>
      </Bloc>

      <Bloc id="compte">
        <ResumeCompteCourant compteSolde={compteSolde} compteEnrichies={compteEnrichies} budgetReel={budgetReel} />
      </Bloc>

      <Bloc id="sante">
        <SanteFinanciere
          matelasMois={matelasMois}
          matelasMoisPrudent={matelasMoisPrudent}
          tauxEpargne={tauxEpargne}
          profile={profile}
          compteEnrichies={compteEnrichies}
          compteOperations={compteOperations}
          compteReleves={compteReleves}
          budgetReel={budgetReel}
        />
      </Bloc>

      <Bloc id="independance">
        <RevenusPassifs
          bourse={bourse}
          livrets={livrets}
          profile={profile}
          livretsTotal={livretsTotal}
          bourseTotal={bourseTotal}
          epargneMensuelle={epargneMensuelle}
          tauxAnnuelPct={blendedRatePct}
        />
      </Bloc>
      <Bloc id="allocation">
      {/* Allocation + historique */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Allocation card */}
        <Card accent={CARD_THEMES.emerald}>
          <CardLabel>Allocation d'actifs globale</CardLabel>
          {allocationData.length === 0 ? (
            <EtatVide picto="liquidites" titre="Rien à répartir pour l'instant">
              Ajoute un livret ou une position : la répartition se dessine dès la première ligne.
            </EtatVide>
          ) : (
            <>
              {/*
                Anneau plutôt que camembert, et total au centre.

                Le camembert obligeait à aller chercher le total ailleurs sur
                l'écran, alors que le creux de l'anneau est exactement la place
                où ce chiffre est attendu. Écrit à la main plutôt que tiré de
                recharts : c'est un arc de cercle, et cette carte est dans le
                bundle initial.
              */}
              <div className="flex justify-center py-2">
                <AnneauRepartition
                  parts={allocationData.map((d) => ({ id: d.name, libelle: d.name, valeur: d.value, couleur: d.color }))}
                  taille={168}
                  epaisseur={20}
                  libelle="Répartition du patrimoine par enveloppe"
                  centre={
                    <>
                      <text
                        x="50%" y="46%" textAnchor="middle" dominantBaseline="central"
                        className="font-data ghost-blur"
                        style={{ fill: "rgb(var(--c-slate-50))", fontSize: 21 }}
                      >
                        {compact(totalAlloc)}
                      </text>
                      <text
                        x="50%" y="60%" textAnchor="middle" dominantBaseline="central"
                        style={{ fill: "rgb(var(--c-slate-500))", fontSize: 9.5 }}
                      >
                        {allocationData.length} enveloppes
                      </text>
                    </>
                  }
                />
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
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Montant valeur={d.value} decimales={0} />
                      <span className="text-slate-500 font-data ghost-blur">
                        · {pctPlain(totalAlloc > 0 ? (d.value / totalAlloc) * 100 : 0, 0)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {/*
            L'année jour par jour.

            `useDailySnapshot` pose un point de patrimoine net par jour, et
            personne ne les regardait autrement qu'en courbe. Cette grille
            répond à une question que la courbe ne sait pas poser — à quoi
            ressemble une année ? — et surtout elle rend visibles les JOURS
            SANS RELEVÉ, ceux où l'application n'a pas été ouverte. Une courbe
            les relie en silence et laisse croire à une continuité qui n'existe
            pas.
          */}
          {joursAnnee.releves >= 14 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2 text-xs text-slate-500 uppercase tracking-wider">
                <span>{new Date().getFullYear()} jour par jour</span>
                <span className="font-data normal-case tracking-normal text-slate-500">
                  {joursAnnee.releves} relevés
                </span>
              </div>
              <CalendrierAnnuel
                jours={joursAnnee.jours}
                semainesAgitees={joursAnnee.agitees}
                formatVariation={(n) => `${n > 0 ? "+" : ""}${eur(n, 0)}`}
              />
            </div>
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
              <p className="text-micro text-slate-500 mt-1.5">
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
          <p className="text-micro text-slate-500 mt-3">
            Le sous-onglet « Immobilier &amp; Crédit » de Simulation te permet de planifier un futur
            achat sans modifier cette répartition.
          </p>
        </Card>

        {/* History chart card */}
        <Card accent={CARD_THEMES.emerald}>
          <div className="flex items-center justify-between mb-1">
            <CardLabel>Évolution du patrimoine net</CardLabel>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <div className="flex rounded-lg border border-slate-800 overflow-hidden" role="group" aria-label="Affichage de la courbe">
                {[
                  ["total", "Total"],
                  ["poches", "Par poche"],
                ].map(([cle, libelle]) => (
                  <button
                    key={cle}
                    onClick={() => setVueCourbe(cle)}
                    aria-pressed={vueCourbe === cle}
                    className={`text-micro px-2 py-1 transition-colors ${
                      vueCourbe === cle ? "bg-emerald-500/15 text-emerald-300" : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {libelle}
                  </button>
                ))}
              </div>
              {vueCourbe === "total" && (
                <button
                  type="button"
                  onClick={() => setEurosConstants((v) => !v)}
                  aria-pressed={eurosConstants}
                  title="Corriger la courbe de l'inflation : chaque point en euros d'aujourd'hui"
                  className={`text-micro px-2 py-1 rounded-lg border transition-colors ${
                    eurosConstants ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-slate-800 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  € constants
                </button>
              )}
              <TimeFilterBar active={timeFilter} onChange={setTimeFilter} />
              <button
                type="button"
                onClick={() => setAnnotationOuverte((o) => !o)}
                aria-expanded={annotationOuverte}
                className="text-micro px-2 py-1 rounded-lg border border-slate-800 text-sky-300/90 hover:border-sky-400/40"
              >
                ◆ Annoter
              </button>
              <GhostButton theme="emerald" onClick={() => setShowAddHistory((s) => !s)}>Ajouter</GhostButton>
            </div>
          </div>

          {/* Legend for projection */}
          <div className="flex items-center gap-x-4 gap-y-1 mb-2 flex-wrap">
            {enPoches ? (
              [
                ["Bourse", COULEURS_POCHES.bourse],
                ...decoupage.poches.map((p) => [p.libelle, p.couleur]),
                ["Autres", COULEURS_POCHES.autres],
              ].map(([libelle, couleur]) => (
                <div key={libelle} className="flex items-center gap-1.5 text-micro text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: couleur }} />
                  {libelle}
                </div>
              ))
            ) : (
              <div className="flex items-center gap-1.5 text-micro text-slate-500">
                <div className="w-6 h-0.5 bg-emerald-400 rounded" />
                Historique
              </div>
            )}
            {eurosConstants && vueCourbe === "total" && (
              <span className="text-micro text-emerald-300/80">
                En euros d'aujourd'hui · inflation {pctPlain(inflationOfficielle().tauxPct, 1)}/an ({inflationOfficielle().source})
              </span>
            )}
            <div className="flex items-center gap-1.5 text-micro text-slate-500">
              <div className="w-6 h-0.5 border-t-2 border-dashed border-emerald-400/50" />
              <span>
                Projection (<span className="ghost-blur">{eur(epargneMensuelle)}</span>/mois à{" "}
                {pctPlain(blendedRatePct, 1)})
              </span>
            </div>
          </div>

          <div className="h-52 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={donneesCourbe} margin={{ left: -10, right: 5, top: 5 }}>
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
                <CartesianGrid stroke="rgb(var(--c-slate-800))" vertical={false} />
                <XAxis
                  dataKey="cle" tickFormatter={(c) => libelleParCle[c] ?? ""}
                  tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd"
                />
                <YAxis tickFormatter={compact} tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }} axisLine={false} tickLine={false} width={46} />
                <Tooltip content={<ChartTooltip marqueursParCle={marqueursParCle} annotationsParCle={annotationsParCle} />} />
                {/* Vertical reference line at "Aujourd'hui" */}
                {cleAujourdhui && (
                  <ReferenceLine x={cleAujourdhui} stroke="#475569" strokeDasharray="3 3" label={{ value: "Auj.", fill: "#475569", fontSize: 10 }} />
                )}
                {/*
                  JALONS. La courbe montrait une trajectoire sans destination :
                  on voyait monter, sans savoir vers quoi. Chaque objectif daté
                  pose désormais son trait, et l'écart au trait se lit
                  directement — c'est la question que l'écran Objectifs répond
                  en chiffres, ici en un coup d'œil.
                */}
                {jalonsObjectifs.map((j) => (
                  <ReferenceLine
                    key={j.id}
                    y={j.cible}
                    stroke={j.atteint ? "#34d399" : "#fbbf24"}
                    strokeDasharray="4 4"
                    strokeOpacity={0.55}
                    label={{ value: j.libelle, fill: j.atteint ? "#34d399" : "#fbbf24", fontSize: 9, position: "insideTopLeft" }}
                  />
                ))}
                {/* Par poche : aires EMPILÉES, dont le sommet est le total. */}
                {enPoches &&
                  [
                    ["poche_bourse", "Bourse", COULEURS_POCHES.bourse],
                    ...decoupage.poches.map((p) => [p.cle, p.libelle, p.couleur]),
                    ["poche_autres", "Autres", COULEURS_POCHES.autres],
                  ].map(([cle, nom, couleur]) => (
                    <Area
                      key={cle}
                      type="monotone"
                      dataKey={cle}
                      name={nom}
                      stackId="poches"
                      stroke={couleur}
                      fill={couleur}
                      fillOpacity={0.35}
                      strokeWidth={1}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  ))}
                {/* Historical area */}
                {!enPoches && <Area
                  type="monotone"
                  dataKey="value"
                  name="Patrimoine net"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#netWorthFill)"
                  connectNulls={false}
                  // Un seul point dessiné, le dernier : il dit « c'est ici
                  // qu'on en est ». Sans lui, l'œil doit chercher où la partie
                  // mesurée s'arrête et où la projection commence.
                  dot={<PointFinal serie={chartData} />}
                  activeDot={{ r: 4 }}
                />}
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
                {/* Le plus haut de la période affichée : un repère, pas une
                    fanfare. Il n'apparaît qu'avec assez de relevés pour qu'un
                    « record » veuille dire quelque chose. */}
                {pointRecord && (
                  <ReferenceDot
                    x={pointRecord.cle}
                    y={pointRecord.value}
                    r={4}
                    fill="#fbbf24"
                    stroke="rgb(var(--c-slate-950))"
                    strokeWidth={1.5}
                    isFront
                    label={{ value: "Record", position: "top", fill: "#fbbf24", fontSize: 9 }}
                  />
                )}
                {marqueurs.map((m) => (
                  <ReferenceDot
                    key={m.point.cle}
                    x={m.point.cle}
                    y={m.valeur}
                    isFront
                    shape={<PastilleOperations marqueur={m} />}
                  />
                ))}
                {groupesAnnotations.map((g) => (
                  <ReferenceDot
                    key={`note-${g.point.cle}`}
                    x={g.point.cle}
                    y={g.valeur}
                    isFront
                    shape={<RepereAnnotation groupe={g} />}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {vueCourbe === "poches" && !decoupage && (
            <p className="text-micro text-amber-300/90 mt-2">
              La bourse ne peut pas être isolée : il manque l&apos;historique du portefeuille. Actualise les cours de
              temps en temps pour qu&apos;il se construise.
            </p>
          )}
          {enPoches && (
            <p className="text-micro text-slate-500 mt-2">
              Bourse mesurée par l&apos;historique du portefeuille ; livrets tracés à partir de leur premier mouvement
              enregistré ; « Autres » regroupe le reste (livrets non suivis, compte courant, moins les dettes).
              {decoupage.residuNegatif && " Sur quelques relevés anciens, les poches mesurées dépassent le total : « Autres » y est ramené à zéro."}
            </p>
          )}
          {/* Légende limitée aux natures présentes sur la période : cinq
              pastilles dont trois sans objet encombreraient la carte. */}
          {marqueurs.length > 0 && (
            <div className="flex items-center gap-3 mt-2 flex-wrap text-micro text-slate-500">
              {Object.entries(NATURES_MARQUEUR)
                .filter(([nature]) => marqueurs.some((m) => m.natures.some((n) => n.nature === nature)))
                .map(([nature, { couleur, libelle }]) => (
                  <span key={nature} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: couleur }} />
                    {libelle}
                  </span>
                ))}
            </div>
          )}

          {annotationOuverte && (
            <form onSubmit={ajouterAnnotation} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-sky-400/20 bg-slate-950 p-3">
              <div>
                <label htmlFor="annotation-date" className="text-micro text-slate-500 block">Date</label>
                <input
                  id="annotation-date"
                  type="date"
                  required
                  value={brouillonAnnotation.date}
                  onChange={(e) => setBrouillonAnnotation((b) => ({ ...b, date: e.target.value }))}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-sky-400/60"
                />
              </div>
              <div className="flex-1 min-w-[12rem]">
                <label htmlFor="annotation-texte" className="text-micro text-slate-500 block">Ce qui s'est passé</label>
                <input
                  id="annotation-texte"
                  type="text"
                  required
                  maxLength={LONGUEUR_MAX}
                  placeholder="Premier salaire, déménagement, aide des parents…"
                  value={brouillonAnnotation.texte}
                  onChange={(e) => setBrouillonAnnotation((b) => ({ ...b, texte: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-sky-400/60"
                />
              </div>
              <button type="submit" className="text-xs font-semibold bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-lg px-3 py-1.5">Annoter</button>
            </form>
          )}
          {Array.isArray(annotations) && annotations.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Annotations de la courbe">
              {[...annotations].sort((a, b) => a.date.localeCompare(b.date)).map((a) => (
                <li key={a.id} className="flex items-center gap-1 rounded-full border border-sky-400/25 bg-sky-500/5 pl-2.5 pr-1 py-0.5 text-micro text-sky-200">
                  <span aria-hidden="true">◆</span>
                  <span>{new Date(`${a.date}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} — {a.texte}</span>
                  <button
                    type="button"
                    onClick={() => setAnnotations((l) => l.filter((x) => x.id !== a.id))}
                    aria-label={`Retirer l'annotation « ${a.texte} »`}
                    className="ml-0.5 rounded-full px-1 text-sky-300/70 hover:text-sky-100"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

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
      </Bloc>

      {/* Objectifs datés — la seule chose qui transforme la courbe de
          patrimoine en réponse à « suis-je en avance ou en retard ? ». */}
      {/* Décomposition du mois : versements, marché, dividendes, frais.
          Placée avant les objectifs, parce qu'elle explique la variation que
          les objectifs se contentent de mesurer. */}
      <Bloc id="origine">
        <OriginePatrimoine historique={historyPast} bourseHistory={bourseHistory} bourse={bourse} livrets={livrets} />
      </Bloc>
      <Bloc id="cascade">
      <CascadeMensuelle
        historique={historyPast}
        operations={bourse?.operations || []}
        bourseHistory={bourseHistory}
        aDesPositions={(bourse?.positions || []).length > 0}
      />
      </Bloc>

      <Bloc id="revenus">
        <CalendrierRevenus bourse={bourse} livrets={livrets} />
      </Bloc>
      <Bloc id="objectifs">
      <Objectifs
        objectifs={objectifs}
        setObjectifs={setObjectifs}
        patrimoineNet={patrimoineNet}
        epargneMensuelle={epargneMensuelle}
        tauxAnnuelPct={blendedRatePct}
        // L'historique de patrimoine nourrit la courbe réelle de la
        // trajectoire : sans lui, il ne resterait que la ligne cible, et
        // l'écart — la seule chose qui compte — serait invisible.
        historique={historyPast}
        rythmeReel={profile.source === "releves" ? profile.periode : null}
      />
      </Bloc>

      <Bloc id="passifs">
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
          <EmptyState picto="liquidites">Aucun passif déclaré — le patrimoine net est égal au patrimoine brut.</EmptyState>
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
      </Bloc>

      {/*
        Les échéances ferment la page au lieu de l'ouvrir.
        Le haut du Dashboard répond à « où j'en suis » : patrimoine, répartition,
        actions prioritaires. Une liste de dates à venir n'appartient pas à cette
        question et cassait la progression du regard ; en pied de page, elle
        répond à « et ensuite », qui vient bien après.
      */}
      <Bloc id="agenda">
      <AgendaFinancier livrets={livrets} bourse={bourse} contracts={contracts} objectifs={objectifs} />
      </Bloc>

      <Bloc id="echeances">
      <ProchainesEcheances
        evenements={evenementsMarche}
        contracts={contracts}
        objectifs={objectifs}
        patrimoineNet={patrimoineNet}
      />
      </Bloc>
      </Disposition>

      <PersonnaliserDashboard
        open={personnalisation}
        onClose={() => setPersonnalisation(false)}
        disposition={disposition}
        setDisposition={setDisposition}
      />
    </div>
  );
}
