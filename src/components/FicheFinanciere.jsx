import { useState, useEffect, useMemo } from "react";
import {
  BarChart3, Scale, Coins, ShieldCheck, TrendingUp, Users, Info, AlertTriangle, History,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Card, CardLabel, EmptyState, SkeletonCard, CARD_THEMES } from "./ui";
import { pctPlain, compact, pct, nombre } from "../lib/finance";
import { fetchFundamentals, fetchTauxChange } from "../lib/api";
import { syntheseRatios } from "../../shared/ratiosHistoriques";
import { devisesNecessaires, facteurConversion } from "../lib/deviseComptes";
import { deviseCapitalisation } from "../lib/pairs";
import PerHistorique from "./PerHistorique";
import DividendesLongTerme from "./DividendesLongTerme";
import { RachatsActions, NotePiotroski, SurprisesResultats } from "./SanteComptes";

/**
 * Fiche financière d'un titre : ratios complets, historique annuel et
 * consensus d'analystes.
 *
 * **Ce que la fiche ne fera pas, et pourquoi.** Yahoo publie un consensus de
 * bénéfice pour l'exercice en cours et le suivant — pas au-delà. Une
 * projection sur trois ans supposerait d'extrapoler nous-mêmes une croissance
 * et de l'afficher à côté de vrais consensus, où rien ne distinguerait plus la
 * donnée de l'invention. On affiche donc deux exercices estimés, avec le
 * nombre d'analystes derrière chacun : un consensus à 1 analyste et un
 * consensus à 18 ne se lisent pas de la même façon.
 */

const NON_RENSEIGNE = "—";

function fmtRatio(v, suffixe = "×") {
  return v == null || !Number.isFinite(v) ? NON_RENSEIGNE : `${nombre(v, 2)} ${suffixe}`.trim();
}
function fmtPct(v, d = 1) {
  return v == null || !Number.isFinite(v) ? NON_RENSEIGNE : pctPlain(v, d);
}
function fmtMontant(v) {
  return v == null || !Number.isFinite(v) ? NON_RENSEIGNE : compact(v);
}
function anneeDe(iso) {
  return iso ? String(iso).slice(0, 4) : "?";
}

function Ligne({ label, valeur, aide }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-xs text-slate-400 flex items-center gap-1.5 min-w-0">
        <span className="truncate">{label}</span>
        {aide && (
          <span className="text-slate-500 shrink-0" title={aide}>
            <Info size={10} aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="text-xs font-data tabular-nums text-slate-200 shrink-0">{valeur}</span>
    </div>
  );
}

function BlocRatios({ titre, icon, lignes }) {
  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={icon}>{titre}</CardLabel>
      <div className="mt-1">
        {lignes.map((l) => (
          <Ligne key={l.label} {...l} />
        ))}
      </div>
    </Card>
  );
}


const TONS_JUGEMENT = {
  favorable: { classe: "text-emerald-400", mot: "mieux que sa moyenne" },
  defavorable: { classe: "text-rose-400", mot: "moins bien que sa moyenne" },
  conforme: { classe: "text-slate-400", mot: "conforme à sa moyenne" },
  inconnu: { classe: "text-slate-500", mot: "sans historique" },
};

/**
 * Ratios d'aujourd'hui replacés dans leur historique.
 *
 * « PER 30,9 » ne veut rien dire seul. « PER 30,9 contre 24,1 de moyenne sur
 * quatre exercices » est un jugement. C'est toute la différence entre une
 * donnée et une information.
 */
function HistoriqueRatios({ historique, valeursCourantes }) {
  const { lignes, synthese } = syntheseRatios(historique, { valeursCourantes });
  if (lignes.length < 2) return null;

  const notes = synthese.filter((r) => r.courant != null && r.moyenne != null);
  if (notes.length === 0) return null;

  return (
    <Card accent={CARD_THEMES.amber}>
      <CardLabel icon={History}>Aujourd'hui comparé aux {lignes.length} derniers exercices</CardLabel>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
        {notes.map((r) => {
          const ton = TONS_JUGEMENT[r.jugement] || TONS_JUGEMENT.inconnu;
          const fmt = (v) => (r.unite === "%" ? fmtPct(v) : fmtRatio(v, r.unite));
          return (
            <div
              key={r.cle}
              className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-0"
              title={`${r.libelle} : ${fmt(r.courant)} aujourd'hui, ${fmt(r.moyenne)} en moyenne sur ${r.nbExercices} exercice(s) — ${ton.mot}`}
            >
              <span className="text-xs text-slate-400 truncate">{r.libelle}</span>
              <span className="flex items-baseline gap-2 shrink-0">
                <span className={`text-xs font-data tabular-nums font-semibold ${ton.classe}`}>{fmt(r.courant)}</span>
                <span className="text-micro text-slate-500 font-data tabular-nums">moy. {fmt(r.moyenne)}</span>
                {r.ecartPct != null && Math.abs(r.ecartPct) >= 5 && (
                  <span className={`text-micro font-data ${ton.classe}`}>
                    {pct(r.ecartPct, 0)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-micro text-slate-500 mt-3">
        Le PER historique est calculé exercice par exercice, à partir du cours de clôture de l'époque
        et du bénéfice par action dilué publié — pas du nombre d'actions d'aujourd'hui, qui fausserait
        toute société ayant racheté ses titres.
      </p>
    </Card>
  );
}

/** Historique annuel : barres de chiffre d'affaires et courbe de marge nette. */
function GraphiqueHistorique({ historique }) {
  const donnees = historique
    .filter((e) => e.TotalRevenue != null)
    .map((e) => ({
      exercice: anneeDe(e.exercice),
      chiffreAffaires: e.TotalRevenue,
      resultatNet: e.NetIncome ?? null,
      margeNette: e.TotalRevenue > 0 && e.NetIncome != null ? (e.NetIncome / e.TotalRevenue) * 100 : null,
    }));

  if (donnees.length < 2) return null;

  return (
    <div className="h-56 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={donnees} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-slate-800))" vertical={false} />
          <XAxis dataKey="exercice" stroke="rgb(var(--c-slate-500))" fontSize={11} axisLine={false} tickLine={false} />
          <YAxis yAxisId="gauche" stroke="rgb(var(--c-slate-500))" fontSize={10} tickFormatter={compact} width={52} axisLine={false} tickLine={false} />
          <YAxis yAxisId="droite" orientation="right" stroke="rgb(var(--c-slate-500))" fontSize={10} tickFormatter={(v) => `${pctPlain(v, 0)}`} width={38} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
            formatter={(v, nom) => (nom === "Marge nette" ? (v == null ? "—" : pctPlain(v, 1)) : compact(v))}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="gauche" dataKey="chiffreAffaires" name="Chiffre d'affaires" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="gauche" dataKey="resultatNet" name="Résultat net" fill="#34d399" radius={[3, 3, 0, 0]} />
          <Line yAxisId="droite" type="monotone" dataKey="margeNette" name="Marge nette" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tableau des exercices publiés. */
function TableauExercices({ historique }) {
  if (historique.length === 0) return null;
  const recents = [...historique].reverse();

  const lignes = [
    { cle: "TotalRevenue", label: "Chiffre d'affaires" },
    { cle: "EBITDA", label: "EBITDA" },
    { cle: "NetIncome", label: "Résultat net" },
    { cle: "CapitalExpenditure", label: "Investissements (capex)" },
    { cle: "FreeCashFlow", label: "Flux de trésorerie disponible" },
    { cle: "TotalDebt", label: "Dette totale" },
    { cle: "StockholdersEquity", label: "Capitaux propres" },
  ];

  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs table-cards table-donnees">
        <thead>
          <tr className="text-left text-micro uppercase tracking-wider text-slate-500 border-b border-slate-800">
            <th className="py-2 pr-3">Poste</th>
            {recents.map((e) => (
              <th key={e.exercice} className="py-2 pr-3 text-right">{anneeDe(e.exercice)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {lignes.map((l) => (
            <tr key={l.cle}>
              <td data-label="Poste" className="py-2 pr-3 text-slate-400">{l.label}</td>
              {recents.map((e) => (
                <td
                  key={e.exercice}
                  data-label={anneeDe(e.exercice)}
                  className="py-2 pr-3 text-right font-data tabular-nums text-slate-200"
                >
                  {fmtMontant(e[l.cle])}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td data-label="Poste" className="py-2 pr-3 text-slate-400">Marge nette</td>
            {recents.map((e) => (
              <td
                key={e.exercice}
                data-label={anneeDe(e.exercice)}
                className="py-2 pr-3 text-right font-data tabular-nums text-amber-300"
              >
                {e.TotalRevenue > 0 && e.NetIncome != null
                  ? fmtPct((e.NetIncome / e.TotalRevenue) * 100)
                  : NON_RENSEIGNE}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Consensus d'analystes et PER estimés qui en découlent. */
function BlocConsensus({ consensus, cours, devise, sansSurprises }) {
  const exercices = [consensus?.anneeEnCours, consensus?.anneeSuivante].filter(Boolean);
  if (exercices.length === 0) return null;

  return (
    <Card accent={CARD_THEMES.amber}>
      <CardLabel icon={Users}>Consensus d'analystes</CardLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
        {exercices.map((e) => {
          // Le PER estimé se déduit du cours actuel et du bénéfice attendu :
          // c'est le « PER 2027 » qu'on cherche, calculé plutôt que récupéré.
          const perEstime = cours != null && e.bpaEstime > 0 ? cours / e.bpaEstime : null;
          return (
            <div key={e.exercice} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-micro text-slate-500 uppercase tracking-wide">
                Exercice {anneeDe(e.exercice)}
              </div>
              <div className="font-display text-lg text-amber-300 mt-0.5">
                PER {perEstime != null ? nombre(perEstime, 1) : NON_RENSEIGNE} ×
              </div>
              <div className="text-micro text-slate-400 mt-1">
                BPA attendu {nombre(e.bpaEstime, 2)} {devise || ""}
              </div>
              {e.croissanceEstimeePct != null && (
                <div className="text-micro text-slate-500">
                  Croissance attendue {fmtPct(e.croissanceEstimeePct)}
                </div>
              )}
              <div className="text-micro text-slate-500 mt-1.5">
                {e.numAnalystes ? `${e.numAnalystes} analyste(s)` : "nombre d'analystes non publié"}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-micro text-slate-500 mt-3">
        Le consensus s'arrête à l'exercice suivant : la source ne publie pas au-delà. Une troisième
        année ne pourrait qu'être extrapolée, ce qui reviendrait à afficher une invention à côté de
        données réelles.
        {sansSurprises &&
          " L'écart entre prévisions et résultats publiés n'est pas suivi par la source pour cette société — c'est le cas de la plupart des sociétés françaises, qui publient par semestre."}
      </p>
    </Card>
  );
}

/**
 * `onFiche` remonte la fiche chargée : l'analyse de valorisation, plus bas
 * dans Marché, en tire le PER moyen historique. Elle recevait `null` faute
 * d'y avoir accès, et sa méthode la plus solide — le retour au PER moyen du
 * titre — restait éteinte alors que la fiche le calculait déjà.
 */
export default function FicheFinanciere({ symbole, devise, onFiche }) {
  const [fiche, setFiche] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  // Taux de change du titre chargé, quand ses comptes ne sont pas publiés dans
  // sa monnaie de cotation. Rattachés au symbole : ceux du titre précédent ne
  // doivent jamais servir au suivant.
  const [taux, setTaux] = useState(null);

  useEffect(() => {
    if (!symbole) return;
    let annule = false;
    // Effet de CHARGEMENT : Chargement des fondamentaux : le témoin doit être
    // levé AVANT l'appel, sinon la fiche affiche les chiffres du titre précédent
    // pendant la requête.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChargement(true);
    setErreur("");
    fetchFundamentals(symbole)
      .then((f) => {
        if (annule) return;
        // Le symbole voyage AVEC la fiche : c'est ce qui permet de ne jamais
        // présenter la fiche d'un titre sous le nom du suivant.
        setFiche(f ? { ...f, symbole } : null);
      })
      .catch((e) => { if (!annule) { setErreur(e.message || "Fiche indisponible."); setFiche(null); } })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, [symbole]);

  const devisesTaux = useMemo(
    () => [
      ...new Set([
        ...devisesNecessaires(fiche?.deviseComptes, fiche?.devise),
        ...devisesNecessaires(fiche?.deviseComptes, deviseCapitalisation(fiche?.devise)),
      ]),
    ],
    [fiche]
  );

  useEffect(() => {
    if (!fiche || devisesTaux.length === 0) return undefined;
    let annule = false;
    fetchTauxChange(devisesTaux)
      .then((liste) => {
        if (!annule) setTaux({ symbole: fiche.symbole, versEuro: Object.fromEntries(liste.filter((t) => t.ok).map((t) => [t.devise, t.versEuro])) });
      })
      .catch(() => {
        if (!annule) setTaux({ symbole: fiche.symbole, versEuro: {} });
      });
    return () => {
      annule = true;
    };
  }, [fiche, devisesTaux]);

  // `undefined` : taux attendus ; `null` : conversion nécessaire mais
  // impossible ; un nombre : facteur à appliquer.
  const tauxDuTitre = devisesTaux.length === 0 ? {} : taux?.symbole === fiche?.symbole ? taux.versEuro : undefined;
  const facteurBpa = tauxDuTitre === undefined ? undefined : facteurConversion(fiche?.deviseComptes, fiche?.devise, tauxDuTitre);
  const facteurCap =
    tauxDuTitre === undefined ? undefined : facteurConversion(fiche?.deviseComptes, deviseCapitalisation(fiche?.devise), tauxDuTitre);

  /*
   * Historique et consensus ramenés dans la monnaie de COTATION.
   *
   * Le PER divise un cours par un bénéfice par action : les deux doivent être
   * dans la même monnaie. Tant que le taux n'est pas connu — ou s'il ne peut
   * pas l'être —, le BPA est retiré plutôt que laissé faux : les cartes qui en
   * dépendent disparaissent au lieu d'afficher un PER en euros par dollar.
   */
  const historiqueCote = useMemo(
    () =>
      (fiche?.historique || []).map((e) => {
        if (!Number.isFinite(e.DilutedEPS)) return e;
        if (facteurBpa == null) return { ...e, DilutedEPS: null };
        return { ...e, DilutedEPS: e.DilutedEPS * facteurBpa };
      }),
    [fiche, facteurBpa]
  );
  const consensusCote = useMemo(() => {
    const c = fiche?.consensus;
    if (!c) return c;
    const conv = (e) => (e && facteurBpa != null ? { ...e, bpaEstime: e.bpaEstime * facteurBpa } : null);
    return { anneeEnCours: conv(c.anneeEnCours), anneeSuivante: conv(c.anneeSuivante) };
  }, [fiche, facteurBpa]);

  // Remontée vers Marché, une fois l'historique converti : l'analyse de
  // valorisation en tire le PER moyen, qui doit être le même qu'ici.
  useEffect(() => {
    if (facteurBpa === undefined && fiche) return;
    onFiche?.(fiche ? { ...fiche, historique: historiqueCote, consensus: consensusCote } : null);
  }, [fiche, historiqueCote, consensusCote, facteurBpa, onFiche]);

  if (chargement) return <SkeletonCard lines={6} />;

  if (erreur) {
    return (
      <Card accent={CARD_THEMES.violet}>
        <CardLabel icon={BarChart3}>Données financières</CardLabel>
        <div className="flex items-start gap-2 text-xs text-amber-200 mt-1">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{erreur}</span>
        </div>
      </Card>
    );
  }

  if (!fiche) return null;

  const historique = historiqueCote;
  const dev = fiche.devise || devise;
  const conversionImpossible = facteurBpa === null && fiche.deviseComptes;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BlocRatios
          titre="Valorisation"
          icon={Scale}
          lignes={[
            { label: "PER", valeur: fmtRatio(fiche.per), aide: "Cours rapporté au bénéfice des douze derniers mois." },
            { label: "PER estimé", valeur: fmtRatio(fiche.perForward), aide: "Cours rapporté au bénéfice attendu." },
            { label: "PEG", valeur: fmtRatio(fiche.peg, ""), aide: "PER divisé par la croissance attendue." },
            { label: "Cours / actif net", valeur: fmtRatio(fiche.priceToBook) },
            { label: "VE / EBITDA", valeur: fmtRatio(fiche.evEbitda), aide: "Insensible à la structure de dette." },
            { label: "Capitalisation", valeur: fmtMontant(fiche.capitalisation) },
          ]}
        />

        <BlocRatios
          titre="Rentabilité"
          icon={TrendingUp}
          lignes={[
            { label: "Marge brute", valeur: fmtPct(fiche.margeBrutePct) },
            { label: "Marge opérationnelle", valeur: fmtPct(fiche.margeOperationnellePct) },
            { label: "Marge nette", valeur: fmtPct(fiche.margeNettePct) },
            { label: "Rentabilité des capitaux propres", valeur: fmtPct(fiche.roePct) },
            { label: "Rentabilité des actifs", valeur: fmtPct(fiche.roaPct) },
            { label: "EBITDA", valeur: fmtMontant(fiche.ebitda) },
          ]}
        />

        <BlocRatios
          titre="Dividende"
          icon={Coins}
          lignes={[
            { label: "Rendement", valeur: fmtPct(fiche.rendementPct, 2) },
            { label: "Dividende par action", valeur: fiche.dividendeParAction != null ? `${nombre(fiche.dividendeParAction, 2)} ${dev || ""}` : NON_RENSEIGNE },
            {
              label: "Taux de distribution",
              valeur: fmtPct(fiche.payoutPct),
              aide: "Part du bénéfice versée en dividende. Au-delà de 80 %, la marge de sécurité est mince.",
            },
          ]}
        />

        <BlocRatios
          titre="Solidité financière"
          icon={ShieldCheck}
          lignes={[
            { label: "Dette / capitaux propres", valeur: fmtPct(fiche.detteSurFondsPropresPct) },
            { label: "Dette totale", valeur: fmtMontant(fiche.detteTotale) },
            { label: "Ratio de liquidité", valeur: fmtRatio(fiche.ratioLiquidite, ""), aide: "Sous 1, le court terme est tendu." },
            { label: "Flux de trésorerie d'exploitation", valeur: fmtMontant(fiche.fluxOperationnel) },
            { label: "Flux de trésorerie disponible", valeur: fmtMontant(fiche.freeCashFlow) },
            { label: "Bêta", valeur: fmtRatio(fiche.beta, ""), aide: "Sous 1, le titre bouge moins que son marché." },
          ]}
        />

        <BlocRatios
          titre="Objectif de place"
          icon={Users}
          lignes={[
            { label: "Objectif de cours moyen", valeur: fiche.objectifCoursMoyen != null ? `${nombre(fiche.objectifCoursMoyen, 2)} ${dev || ""}` : NON_RENSEIGNE },
            {
              label: "Potentiel",
              valeur:
                fiche.objectifCoursMoyen != null && fiche.cours > 0
                  ? fmtPct(((fiche.objectifCoursMoyen - fiche.cours) / fiche.cours) * 100)
                  : NON_RENSEIGNE,
            },
            { label: "Recommandation", valeur: fiche.recommandation ?? NON_RENSEIGNE },
            { label: "Analystes suivant la valeur", valeur: fiche.nbAnalystes ?? NON_RENSEIGNE },
          ]}
        />
      </div>

      <HistoriqueRatios
        historique={historique}
        valeursCourantes={{
          per: fiche.per,
          roePct: fiche.roePct,
          margeNettePct: fiche.margeNettePct,
          detteSurFondsPropresPct: fiche.detteSurFondsPropresPct,
        }}
      />

      {conversionImpossible && (
        <p className="text-micro text-amber-300/90 flex items-start gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
          Comptes publiés en {fiche.deviseComptes}, cours en {dev} : le taux de change est indisponible, les PER calculés
          sur l&apos;historique sont masqués plutôt que faussés.
        </p>
      )}

      <PerHistorique
        symbole={symbole}
        historique={historique}
        devise={dev}
        consensus={[consensusCote?.anneeEnCours, consensusCote?.anneeSuivante].filter(Boolean)}
      />

      <DividendesLongTerme symbole={symbole} devise={dev} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RachatsActions
          historique={historique}
          capitalisation={fiche.capitalisation}
          facteurComptes={facteurCap}
          deviseComptes={fiche.deviseComptes}
        />
        <NotePiotroski historique={historique} secteur={fiche.secteur} />
      </div>

      <BlocConsensus
        consensus={consensusCote}
        cours={fiche.cours}
        devise={dev}
        sansSurprises={!fiche.surprises?.length}
      />

      <SurprisesResultats surprises={fiche.surprises} deviseComptes={fiche.deviseComptes || dev} />

      <Card accent={CARD_THEMES.violet}>
        <CardLabel icon={BarChart3}>
          Comptes annuels publiés{historique.length > 0 ? ` — ${historique.length} exercices` : ""}
        </CardLabel>
        {historique.length === 0 ? (
          <EmptyState picto="graphique">Aucun compte annuel publié pour ce support (fréquent sur les ETF et les fonds).</EmptyState>
        ) : (
          <>
            <GraphiqueHistorique historique={historique} />
            <TableauExercices historique={historique} />
          </>
        )}
      </Card>
    </div>
  );
}
