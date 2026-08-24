import { useMemo, useState, useId } from "react";
import {
  Target, AlertTriangle, Wallet, TrendingDown, Info, Landmark, Coins, Shield, SlidersHorizontal,
  Save,
  Sparkles} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { Card, CardLabel, SliderField, PageGlow, SectionRepliable, CARD_THEMES } from "./ui";
import { eur, pctPlain, compact } from "../lib/finance";
import {
  coutTotalPossession, simulerCredit, coutOpportunite, projeterPatrimoine,
  impactObjectif, estimerRendements, anneesJusqua,
  COUTS_POSSESSION_REFERENCE, INFLATION_DEFAUT,
} from "../../shared/horizon";
import { construireContexteAnonymise } from "../../shared/anonymiser";
import PanneauTransparence from "./PanneauTransparence";
import AssistantHorizon from "./AssistantHorizon";
import ReglagesHorizon, { BandeauModeReel } from "./ReglagesHorizon";
import ScenariosProjet from "./ScenariosProjet";
import BilanMensuel from "./BilanMensuel";

/**
 * Sous-onglet « Projet » — Horizon, version formulaires.
 *
 * Répond à « et si j'achetais X ? » en chiffrant les trois coûts qu'une
 * comparaison intuitive oublie : le coût de possession sur la durée, le coût du
 * crédit, et le manque à gagner du capital immobilisé. Puis traduit le tout en
 * retard sur un objectif daté — la seule unité qui parle vraiment.
 *
 * Aucune IA ici : le jalon 4 ajoutera une couche conversationnelle par-dessus
 * ce même moteur (`src/lib/horizon.js`). Les chiffres, eux, ne changeront pas —
 * ils viennent déjà tous de fonctions déterministes testées.
 *
 * Voir HORIZON_SPEC.md, jalon 2.
 */

const CATEGORIES = [
  { id: "voiture", label: "Véhicule" },
  { id: "immobilier", label: "Bien immobilier" },
  { id: "generique", label: "Autre bien durable" },
];

// Même graine pour les deux scénarios : comparer deux projections tirées sur
// des aléas différents mesurerait du bruit, pas l'effet du projet.
const GRAINE_COMPARAISON = 2026;

export default function Projet({
  livretsTotal = 0, bourseTotal = 0, historyPast = [],
  // État brut, uniquement consommé par l'anonymiseur pour construire le
  // contexte que le panneau de transparence affiche. Rien n'en sort d'ici.
  profile, livrets, bourse, dettes, cash, enveloppes, immo, patrimoineNet,
  // Jalons 7 à 9 : réglages de confidentialité, projets mis de côté, bilan mensuel.
  horizonReglages = { montantsReels: false },
  setHorizonReglages = () => {},
  horizonScenarios = [],
  setHorizonScenarios = () => {},
  horizonDernierBilan = null,
  setHorizonDernierBilan = () => {},
}) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  const [libelle, setLibelle] = useState("Voiture");
  const [categorie, setCategorie] = useState("voiture");
  const [prix, setPrix] = useState(28000);
  const [dureeDetention, setDureeDetention] = useState(8);

  const [financement, setFinancement] = useState("comptant"); // "comptant" | "credit"
  const [apport, setApport] = useState(5000);
  const [tauxCredit, setTauxCredit] = useState(4.2);
  const [dureeCredit, setDureeCredit] = useState(60);

  const [objectifMontant, setObjectifMontant] = useState(60000);
  const [objectifDate, setObjectifDate] = useState("2032-06-30");
  const [versementMensuel, setVersementMensuel] = useState(400);
  const [vueReelle, setVueReelle] = useState(false);

  const patrimoineActuel = livretsTotal + bourseTotal;
  const horizonProjection = Math.max(1, Math.ceil(anneesJusqua(objectifDate)) || 1);

  // Contexte anonymisé — construit dès maintenant, alors que rien n'est encore
  // envoyé. Le rendre visible avant qu'un réseau soit en jeu est justement ce
  // qui permet de le vérifier à froid.
  const montantsReels = Boolean(horizonReglages?.montantsReels);
  const { contexte, facteurBase100 } = useMemo(
    () =>
      construireContexteAnonymise({
        profile, livrets, bourse, dettes, cash, enveloppes, historyPast, immo,
        patrimoineNet: patrimoineNet ?? patrimoineActuel,
        montantsReels,
      }),
    [profile, livrets, bourse, dettes, cash, enveloppes, historyPast, immo, patrimoineNet, patrimoineActuel, montantsReels]
  );

  // ─── Fiabilité des rendements (§3.10) ──────────────────────────────────────
  const estimation = useMemo(
    () => estimerRendements((historyPast || []).map((h) => ({ date: h.date, valeur: h.value }))),
    [historyPast]
  );

  // Allocation déduite de la répartition réelle du patrimoine.
  const allocation = useMemo(() => {
    if (patrimoineActuel <= 0) return { monetaire: 1 };
    return {
      monetaire: livretsTotal / patrimoineActuel,
      actions: bourseTotal / patrimoineActuel,
    };
  }, [livretsTotal, bourseTotal, patrimoineActuel]);

  // ─── Coût de possession, crédit, coût d'opportunité ────────────────────────
  const tco = useMemo(
    () => coutTotalPossession({ prixAchat: prix, horizonAnnees: dureeDetention, categorie }),
    [prix, dureeDetention, categorie]
  );

  const aCredit = financement === "credit";
  const montantEmprunte = Math.max(0, prix - apport);

  const credit = useMemo(
    () =>
      aCredit && montantEmprunte > 0
        ? simulerCredit({ montant: montantEmprunte, tauxAnnuel: tauxCredit, dureeMois: dureeCredit })
        : null,
    [aCredit, montantEmprunte, tauxCredit, dureeCredit]
  );

  // Sortie de trésorerie immédiate : le prix entier au comptant, l'apport seul à crédit.
  const sortieImmediate = aCredit ? Math.min(apport, prix) : prix;

  const rendementMoyen = useMemo(() => {
    const r = estimation.rendements;
    if (r.global) return r.global.rendement;
    return Object.keys(allocation).reduce(
      (somme, classe) => somme + (allocation[classe] || 0) * (r[classe]?.rendement ?? 0),
      0
    );
  }, [estimation, allocation]);

  const opportunite = useMemo(
    () =>
      coutOpportunite({
        montant: sortieImmediate,
        rendementAnnuelPct: rendementMoyen,
        horizonAnnees: dureeDetention,
      }),
    [sortieImmediate, rendementMoyen, dureeDetention]
  );

  // ─── Deux projections, mêmes aléas ─────────────────────────────────────────
  // Le projet ponctionne le patrimoine (sortie immédiate) puis l'effort mensuel
  // (mensualité de crédit + charges courantes du bien).
  const chargesMensuelles = tco.chargesTotales / Math.max(1, dureeDetention * 12);
  const effortMensuel = (credit?.mensualite ?? 0) + chargesMensuelles;

  const paramsCommuns = {
    allocation,
    horizonAnnees: horizonProjection,
    tirages: 600,
    graine: GRAINE_COMPARAISON,
    rendements: estimation.rendements.global ? undefined : estimation.rendements,
    objectifMontant,
  };

  const projSans = useMemo(
    () =>
      projeterPatrimoine({
        ...paramsCommuns,
        patrimoineInitial: patrimoineActuel,
        versementMensuel,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patrimoineActuel, versementMensuel, horizonProjection, allocation, objectifMontant, estimation]
  );

  const projAvec = useMemo(
    () =>
      projeterPatrimoine({
        ...paramsCommuns,
        patrimoineInitial: Math.max(0, patrimoineActuel - sortieImmediate),
        versementMensuel: Math.max(0, versementMensuel - effortMensuel),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patrimoineActuel, sortieImmediate, versementMensuel, effortMensuel, horizonProjection, allocation, objectifMontant, estimation]
  );

  const impact = useMemo(
    () =>
      impactObjectif({
        objectif: { nom: libelle, montantCible: objectifMontant, dateCible: objectifDate },
        scenarioAvant: projSans,
        scenarioApres: projAvec,
      }),
    [libelle, objectifMontant, objectifDate, projSans, projAvec]
  );

  const donneesGraphique = useMemo(
    () =>
      projSans.percentiles.map((p, i) => ({
        annee: p.annee,
        sans: Math.round(vueReelle ? p.reel.p50 : p.p50),
        avec: Math.round(vueReelle ? projAvec.percentiles[i].reel.p50 : projAvec.percentiles[i].p50),
      })),
    [projSans, projAvec, vueReelle]
  );

  const coutGlobal = tco.coutTotal + (credit?.coutTotalCredit ?? 0) + opportunite.manqueAGagner;
  const moisRetard = impact.retardMois;

  return (
    <div className="relative space-y-6">
      <PageGlow color="violet" />

      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-display text-2xl text-slate-50">
            Impact d&apos;un <span className="text-violet-400">projet</span> sur ton patrimoine
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Coût de possession, crédit et manque à gagner réunis, traduits en retard sur un objectif.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPanneauOuvert(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-emerald-500/60 transition-colors"
          >
            <Shield size={13} /> Voir ce qui est envoyé
          </button>
          <button
            onClick={() => setReglagesOuverts(true)}
            aria-label="Réglages de confidentialité"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors"
          >
            <SlidersHorizontal size={13} />
          </button>
          <button
            onClick={() => setVueReelle((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-violet-500/60 transition-colors"
          >
            {vueReelle ? `Euros constants (inflation ${INFLATION_DEFAUT} %)` : "Euros courants"}
          </button>
        </div>
      </div>

      {panneauOuvert && (
        <PanneauTransparence
          contexte={contexte}
          montantsReels={montantsReels}
          onClose={() => setPanneauOuvert(false)}
        />
      )}

      {reglagesOuverts && (
        <ReglagesHorizon
          reglages={horizonReglages}
          onChange={setHorizonReglages}
          onClose={() => setReglagesOuverts(false)}
        />
      )}

      {/* Le mode B ne doit jamais être actif sans que ça se voie. */}
      {montantsReels && <BandeauModeReel onOuvrirReglages={() => setReglagesOuverts(true)} />}

      <BilanMensuel
        patrimoineNet={patrimoineNet ?? patrimoineActuel}
        historyPast={historyPast}
        tauxEpargnePct={contexte.flux?.tauxEpargnePct ?? 0}
        epargneSecuriteMois={contexte.reserves?.epargneSecuriteMois ?? null}
        dernierBilan={horizonDernierBilan}
        onVu={setHorizonDernierBilan}
      />

      {estimation.avertissement && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90">
            <div className="font-medium mb-0.5">Hypothèses de rendement non dérivées de tes données</div>
            {estimation.avertissement}
          </div>
        </div>
      )}

      {/* ─── Paramètres du projet ─────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card accent={CARD_THEMES.violet}>
          <CardLabel icon={Wallet}>Le projet</CardLabel>
          <div className="space-y-4">
            <div>
              <label htmlFor={`${idsChamps}-libelle`} className="text-xs text-slate-400 block mb-1.5">Libellé</label>
              <input id={`${idsChamps}-libelle`}
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-sm text-slate-100"
              />
            </div>
            <div>
              <label htmlFor={`${idsChamps}-categorie`} className="text-xs text-slate-400 block mb-1.5">Catégorie</label>
              <select id={`${idsChamps}-categorie`}
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-sm text-slate-100"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <SliderField
              label="Prix d'achat" value={prix} onChange={setPrix}
              min={1000} max={400000} step={1000} format={eur}
            />
            <SliderField
              label="Durée de détention" value={dureeDetention} onChange={setDureeDetention}
              min={1} max={30} step={1} unit=" ans"
            />
          </div>
        </Card>

        <Card accent={CARD_THEMES.violet}>
          <CardLabel icon={Landmark}>Financement</CardLabel>
          <div className="space-y-4">
            <div className="flex gap-2">
              {[
                { id: "comptant", label: "Comptant" },
                { id: "credit", label: "À crédit" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setFinancement(m.id)}
                  className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                    financement === m.id
                      ? "border-violet-500 text-violet-300 bg-violet-950/30"
                      : "border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {aCredit ? (
              <>
                <SliderField
                  label="Apport" value={apport} onChange={setApport}
                  min={0} max={prix} step={500} format={eur}
                />
                <SliderField
                  label="Taux du crédit" value={tauxCredit} onChange={setTauxCredit}
                  min={0} max={10} step={0.1} unit=" %"
                />
                <SliderField
                  label="Durée du crédit" value={dureeCredit} onChange={setDureeCredit}
                  min={12} max={300} step={12} unit=" mois"
                />
              </>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed py-2">
                Le prix entier sort de ton patrimoine aujourd&apos;hui. Le coût du crédit est nul,
                mais le manque à gagner porte sur la totalité du montant.
              </p>
            )}
          </div>
        </Card>

        <Card accent={CARD_THEMES.violet}>
          <CardLabel icon={Target}>Objectif de référence</CardLabel>
          <div className="space-y-4">
            <SliderField
              label="Montant cible" value={objectifMontant} onChange={setObjectifMontant}
              min={5000} max={500000} step={5000} format={eur}
            />
            <div>
              <label htmlFor={`${idsChamps}-date-cible`} className="text-xs text-slate-400 block mb-1.5">Date cible</label>
              <input id={`${idsChamps}-date-cible`}
                type="date"
                value={objectifDate}
                onChange={(e) => setObjectifDate(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-sm text-slate-100"
              />
            </div>
            <SliderField
              label="Épargne mensuelle actuelle" value={versementMensuel} onChange={setVersementMensuel}
              min={0} max={5000} step={50} format={eur}
            />
          </div>
        </Card>
      </div>

      {/* ─── Verdict ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card accent={CARD_THEMES.rose}>
          <CardLabel icon={TrendingDown}>Coût global sur {dureeDetention} ans</CardLabel>
          <div className="text-2xl font-display text-rose-300">{eur(coutGlobal)}</div>
          <p className="text-xs text-slate-500 mt-1">
            soit {eur(coutGlobal / (dureeDetention * 12))} par mois
          </p>
        </Card>

        <Card accent={CARD_THEMES.amber}>
          <CardLabel icon={Coins}>Manque à gagner</CardLabel>
          <div className="text-2xl font-display text-amber-300">{eur(opportunite.manqueAGagner)}</div>
          <p className="text-xs text-slate-500 mt-1">
            {eur(sortieImmediate)} immobilisés à {pctPlain(rendementMoyen)}
          </p>
        </Card>

        <Card accent={CARD_THEMES.indigo}>
          <CardLabel icon={Wallet}>Effort mensuel</CardLabel>
          <div className="text-2xl font-display text-indigo-300">{eur(effortMensuel)}</div>
          <p className="text-xs text-slate-500 mt-1">
            {credit ? `dont ${eur(credit.mensualite)} de mensualité` : "charges courantes du bien"}
          </p>
        </Card>

        <Card accent={CARD_THEMES.violet}>
          <CardLabel icon={Target}>Impact sur l&apos;objectif</CardLabel>
          {moisRetard != null ? (
            <>
              <div className="text-2xl font-display text-violet-300">
                {moisRetard > 0 ? `+${Math.round(moisRetard)} mois` : `${Math.round(moisRetard)} mois`}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                pour atteindre {compact(objectifMontant)}
              </p>
            </>
          ) : (
            <>
              <div className="text-lg font-display text-slate-400">Non atteint</div>
              <p className="text-xs text-slate-500 mt-1">
                objectif hors de portée sur {horizonProjection} ans dans au moins un scénario
              </p>
            </>
          )}
        </Card>
      </div>

      {/* ─── Trajectoires comparées ───────────────────────────────────────── */}
      <SectionRepliable
        titre="Trajectoire médiane, avec et sans le projet"
        icon={Target}
        defautOuvert
      >
      <Card accent={CARD_THEMES.violet}>
        <CardLabel icon={Target}>
          Trajectoire médiane — avec et sans « {libelle} » {vueReelle ? "(euros constants)" : ""}
        </CardLabel>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={donneesGraphique} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-slate-800))" />
              <XAxis dataKey="annee" stroke="rgb(var(--c-slate-500))" fontSize={11} tickFormatter={(a) => `${a} an${a > 1 ? "s" : ""}`} />
              <YAxis stroke="rgb(var(--c-slate-500))" fontSize={11} tickFormatter={compact} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => eur(v)}
                labelFormatter={(a) => `Année ${a}`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={objectifMontant} stroke="#a78bfa" strokeDasharray="4 4" label={{ value: "Objectif", fill: "#a78bfa", fontSize: 11, position: "insideTopRight" }} />
              <Line type="monotone" dataKey="sans" name="Sans le projet" stroke="#34d399" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="avec" name={`Avec « ${libelle} »`} stroke="#f472b6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Médiane de {projSans.parametres.tirages} simulations, mêmes aléas pour les deux scénarios.
          Probabilité d&apos;atteindre l&apos;objectif :{" "}
          <span className="text-emerald-400">{pctPlain(projSans.probabiliteObjectif ?? 0)}</span> sans le projet,{" "}
          <span className="text-rose-400">{pctPlain(projAvec.probabiliteObjectif ?? 0)}</span> avec.
        </p>
      </Card>

      </SectionRepliable>

      {/* ─── Détail des coûts ─────────────────────────────────────────────── */}
      <SectionRepliable
        titre="Détail des coûts et hypothèses"
        icon={Info}
        resume="où part l'argent, et sous quelles hypothèses"
      >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card accent={CARD_THEMES.rose}>
          <CardLabel icon={TrendingDown}>Où part l&apos;argent</CardLabel>
          <div className="space-y-2">
            {tco.ventilation.map((poste) => (
              <div key={poste.poste} className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{poste.poste}</span>
                <span className="text-slate-200 tabular-nums">
                  {eur(poste.montant)}
                  <span className="text-slate-600 text-xs ml-2">{pctPlain(poste.partPct)}</span>
                </span>
              </div>
            ))}
            {credit && (
              <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-800">
                <span className="text-slate-400">Coût du crédit</span>
                <span className="text-slate-200 tabular-nums">{eur(credit.coutTotalCredit)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Manque à gagner</span>
              <span className="text-slate-200 tabular-nums">{eur(opportunite.manqueAGagner)}</span>
            </div>
          </div>
          {credit && (
            <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-800">
              Emprunt de {eur(montantEmprunte)} sur {dureeCredit} mois — mensualité {eur(credit.mensualite)},
              TAEG {pctPlain(credit.taeg)}, valeur résiduelle du bien {eur(tco.valeurResiduelle)}.
            </p>
          )}
        </Card>

        <Card accent={CARD_THEMES.amber}>
          <CardLabel icon={Info}>Hypothèses appliquées</CardLabel>
          <p className="text-xs text-slate-500 mb-3">
            Aucune valeur n&apos;est appliquée en silence. Celles marquées « référence » proviennent
            de la table par défaut de la catégorie « {COUTS_POSSESSION_REFERENCE[categorie]?.libelle} ».
          </p>
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {[...tco.hypothesesAppliquees, ...projSans.hypothesesAppliquees].map((h, i) => (
              <div key={`${h.cle}-${i}`} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-slate-400">{h.libelle}</span>
                <span className="text-slate-500 text-right shrink-0">
                  {h.detail}
                  {h.aVerifier && <span className="text-amber-500/80 ml-1.5">à vérifier</span>}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      </SectionRepliable>

      <SectionRepliable
        titre="Projets mis de côté et comparaison"
        icon={Save}
        resume={horizonScenarios.length > 0 ? `${horizonScenarios.length} scénario(s) enregistré(s)` : "aucun scénario enregistré"}
      >
      <ScenariosProjet
        scenarios={horizonScenarios}
        onChange={setHorizonScenarios}
        courant={{
          config: {
            libelle, categorie, prix, dureeDetention, financement,
            apport, tauxCredit, dureeCredit, objectifMontant, objectifDate, versementMensuel,
          },
          resultats: {
            coutGlobal,
            effortMensuel,
            retardMois: moisRetard,
            medianeSans: projSans.valeurFinale.p50,
            medianeAvec: projAvec.valeurFinale.p50,
          },
        }}
      />

      </SectionRepliable>

      {/* L'assistant vient en complément des formulaires, jamais à leur place :
          si aucun fournisseur gratuit n'est joignable, il s'efface et tout ce
          qui précède continue de fonctionner. */}
      <SectionRepliable titre="Poser une question à l'assistant" icon={Sparkles}>
      <AssistantHorizon
        contexte={contexte}
        facteurBase100={facteurBase100}
        montantsReels={montantsReels}
      />
      </SectionRepliable>

      <p className="text-xs text-slate-600 text-center pb-2">
        Simulations sous hypothèses explicites, à titre indicatif. Ce n&apos;est pas un conseil en investissement.
      </p>
    </div>
  );
}
