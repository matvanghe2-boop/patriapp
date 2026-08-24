import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import {
  Filter, RefreshCw, Check, X, AlertTriangle, Search, Compass, Briefcase,
  ChevronDown, ChevronUp, Info, Plus, GitCompare,
} from "lucide-react";
import { Card, CardLabel, GhostButton, EmptyState, SkeletonTable, CARD_THEMES } from "./ui";
import { eur, pctPlain, uid, compact, lireNombre } from "../lib/finance";
import { fetchScreen } from "../lib/api";
import {
  UNIVERS, universParCle, chargerUnivers, appliquerPrefiltres,
  secteursDisponibles, TRANCHES_CAPITALISATION,
} from "../lib/univers";
import {
  RECETTES, CRITERES, SENS, recetteParId, appliquerRecette,
  auditerPortefeuille, suggererDiversification, poidsSectoriels,
  scoreComposite, qualifierScore, comparerTitres,
} from "../../shared/screener";

const MODES = [
  { cle: "marche", label: "Marché", icon: Search, aide: "Filtrer un univers de titres" },
  { cle: "portefeuille", label: "Mes lignes", icon: Briefcase, aide: "Tes positions passent-elles encore le filtre ?" },
  { cle: "diversifier", label: "Diversifier", icon: Compass, aide: "Secteurs où tu es sous-exposé" },
];

/** Valeur formatée selon l'unité du critère. */
function formaterValeur(valeur, unite) {
  if (valeur == null || !Number.isFinite(valeur)) return "—";
  if (unite === "%") return pctPlain(valeur, 1);
  if (unite === "€") return compact(valeur);
  if (unite === "×") return `${valeur.toFixed(1)} ×`;
  return valeur.toFixed(2);
}

/** Une pastille par critère : ce qui était attendu, ce qui a été constaté. */
function PastilleCritere({ detail }) {
  const styles = {
    ok: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
    echec: "text-rose-300 border-rose-500/30 bg-rose-500/10",
    indetermine: "text-slate-500 border-slate-700 bg-slate-900/60",
  };
  const attendu = `${detail.sens === SENS.MIN ? "≥" : "≤"} ${formaterValeur(detail.seuil, detail.unite)}`;

  return (
    <span
      className={`inline-flex items-center gap-1 text-micro rounded-full border px-2 py-0.5 ${styles[detail.statut]}`}
      title={`${detail.libelle} — attendu ${attendu}, constaté ${formaterValeur(detail.valeur, detail.unite)}`}
    >
      {detail.statut === "ok" && <Check size={9} aria-hidden="true" />}
      {detail.statut === "echec" && <X size={9} aria-hidden="true" />}
      {detail.libelle} {formaterValeur(detail.valeur, detail.unite)}
    </span>
  );
}

/** Réglage fin des seuils d'une recette. */
function ReglageCriteres({ criteres, onChange, onReinitialiser }) {
  return (
    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
      {criteres.map((c, i) => {
        const def = CRITERES[c.cle];
        if (!def) return null;
        const sens = c.sensInverse
          ? def.sens === SENS.MIN ? SENS.MAX : SENS.MIN
          : def.sens;
        return (
          <div key={c.cle} className="flex items-center justify-between gap-3 flex-wrap">
            <label htmlFor={`crit-${c.cle}`} className="text-xs text-slate-400 flex items-center gap-1.5 min-w-0">
              <span className="truncate">{def.libelle}</span>
              <span className="text-slate-600" title={def.aide}>
                <Info size={11} aria-hidden="true" />
              </span>
            </label>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-micro text-slate-500 font-data">{sens === SENS.MIN ? "≥" : "≤"}</span>
              <input
                id={`crit-${c.cle}`}
                type="number"
                step="0.5"
                value={c.seuil}
                onChange={(e) => {
                  const suivant = [...criteres];
                  suivant[i] = { ...c, seuil: lireNombre(e.target.value) ?? 0 };
                  onChange(suivant);
                }}
                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-data tabular-nums focus:outline-none focus:border-violet-400/60"
              />
              <span className="text-micro text-slate-600 w-4">{def.unite}</span>
            </div>
          </div>
        );
      })}
      <button onClick={onReinitialiser} className="text-micro text-slate-500 hover:text-slate-300">
        Rétablir les seuils de la recette
      </button>
    </div>
  );
}


const TONS_SCORE = {
  excellent: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  bon: "text-teal-300 border-teal-500/40 bg-teal-500/10",
  moyen: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  faible: "text-rose-300 border-rose-500/40 bg-rose-500/10",
  neutre: "text-slate-500 border-slate-700 bg-slate-900/60",
};

/**
 * Note globale d'un titre.
 *
 * Filtrer répond à « ce titre passe-t-il ? » ; noter répond à « lequel
 * d'abord ? ». Le détail du calcul est accessible au survol : un score qu'on
 * ne peut pas décomposer est un oracle, et un oracle n'aide pas à décider.
 */
function BadgeScore({ score, nbNotes, detail }) {
  if (!Number.isFinite(score)) {
    return <span className="text-micro text-slate-600 px-1.5">non noté</span>;
  }
  const q = qualifierScore(score);
  const explication = detail
    .filter((d) => Number.isFinite(d.note))
    .map((d) => `${d.libelle} : ${d.note.toFixed(0)}/100`)
    .join(String.fromCharCode(10));

  return (
    <span
      className={`inline-flex items-baseline gap-1 text-xs font-data font-bold rounded-lg border px-2 py-0.5 ${TONS_SCORE[q.ton]}`}
      title={[`${q.libelle} — noté sur ${nbNotes} critère(s)`, "", explication].join(String.fromCharCode(10))}
    >
      {score.toFixed(0)}
      <span className="text-[9px] font-normal opacity-70">/100</span>
    </span>
  );
}

/** Comparaison ratio par ratio de deux titres. */
function PanneauComparaison({ a, b, onFermer }) {
  const CLES = [
    "per", "perForward", "priceToBook", "evEbitda", "rendementPct", "payoutPct",
    "roePct", "margeNettePct", "margeOperationnellePct", "detteSurFondsPropresPct",
    "ratioLiquidite", "beta", "capitalisation",
  ];
  const { lignes, avantagesA, avantagesB } = comparerTitres(a, b, CLES);

  const cellule = (valeur, unite, gagne) => (
    <span className={`font-data tabular-nums text-xs ${gagne ? "text-emerald-400 font-semibold" : "text-slate-300"}`}>
      {formaterValeur(valeur, unite)}
    </span>
  );

  return (
    <Card accent={CARD_THEMES.violet}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <CardLabel icon={GitCompare}>Comparaison</CardLabel>
        <button onClick={onFermer} aria-label="Fermer la comparaison" className="text-slate-500 hover:text-slate-200">
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 mt-2">
        <div className="text-micro text-slate-500 uppercase tracking-wide">Critère</div>
        <div className="text-right text-xs font-data font-semibold text-slate-100">{a.symbole}</div>
        <div className="text-right text-xs font-data font-semibold text-slate-100">{b.symbole}</div>

        {lignes.map((l) => (
          <Fragment key={l.cle}>
            <div className="text-xs text-slate-400 truncate py-1 border-t border-slate-800/60">{l.libelle}</div>
            <div className="text-right py-1 border-t border-slate-800/60">{cellule(l.a, l.unite, l.gagnant === "a")}</div>
            <div className="text-right py-1 border-t border-slate-800/60">{cellule(l.b, l.unite, l.gagnant === "b")}</div>
          </Fragment>
        ))}
      </div>

      {/* Le décompte global ne tranche pas — il résume. Un titre peut gagner
          sur huit critères secondaires et perdre sur le seul qui compte. */}
      <p className="text-micro text-slate-500 mt-3">
        {a.symbole} l'emporte sur {avantagesA} critère(s), {b.symbole} sur {avantagesB}. Un décompte
        n'est pas un verdict : regarde lesquels.
      </p>
    </Card>
  );
}

/** Ligne de résultat commune aux trois modes. */
function LigneResultat({ symbole, nom, secteur, evaluation, complement, action, score, surComparer, compare }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        evaluation?.retenu ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800 bg-slate-950/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {surComparer && (
              <input
                type="checkbox"
                checked={compare}
                onChange={surComparer}
                aria-label={`Comparer ${symbole}`}
                title="Sélectionner pour comparer (deux titres)"
                className="accent-violet-400"
              />
            )}
            <span className="font-data font-semibold text-slate-100">{symbole}</span>
            {score}
            {evaluation?.retenu && (
              <span className="text-micro text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-1.5">
                retenu
              </span>
            )}
          </div>
          <div className="text-micro text-slate-500 truncate max-w-[22rem]">
            {nom}
            {secteur ? ` · ${secteur}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {complement}
          {action}
        </div>
      </div>

      {evaluation && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {evaluation.details.map((d) => (
            <PastilleCritere key={d.cle} detail={d} />
          ))}
        </div>
      )}

      {evaluation?.nbIndetermines > 0 && (
        <p className="text-micro text-slate-600 mt-1.5">
          {evaluation.nbIndetermines} critère(s) non publié(s) pour ce titre — jugé sur {evaluation.fiabilite}.
        </p>
      )}
    </div>
  );
}

/**
 * Screener fondamental.
 *
 * Trois usages du même moteur :
 *  - **Marché** : filtrer un univers avec des recettes assumées plutôt qu'une
 *    grille de curseurs vides.
 *  - **Mes lignes** : retourner le filtre contre ses propres positions. C'est
 *    la question qu'on ne se pose jamais spontanément — non pas « qu'est-ce
 *    que j'achète ? » mais « est-ce que ce que je détiens tient toujours ? ».
 *  - **Diversifier** : proposer des titres dans les secteurs sous-représentés,
 *    en s'appuyant sur la composition réelle du portefeuille.
 *
 * Les données arrivent de `/api/screen`, distinct de `/api/profile` : pas de
 * traduction, cache d'une heure, et un lot au lieu d'un titre.
 */
export default function Screener({ bourse, watchlist = [], setWatchlist, onOpenMarket }) {
  const positions = useMemo(() => bourse?.positions || [], [bourse]);

  const [mode, setMode] = useState("marche");
  const [universActif, setUniversActif] = useState("sbf120");
  const [recetteId, setRecetteId] = useState("dividende-solide");
  const [criteres, setCriteres] = useState(() => recetteParId("dividende-solide").criteres);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);

  // Pré-filtres, appliqués AVANT la recette. Sans eux, un univers de plusieurs
  // centaines de titres n'est qu'une liste : c'est la borne de capitalisation
  // qui transforme « dividende solide » en « small cap française à dividende
  // solide », c'est-à-dire en question à laquelle on cherchait une réponse.
  const [tranche, setTranche] = useState("toutes");
  const [secteurFiltre, setSecteurFiltre] = useState("");
  const [peaSeul, setPeaSeul] = useState(false);
  const [limite, setLimite] = useState(50);

  const [donnees, setDonnees] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [progression, setProgression] = useState(null);
  const [erreur, setErreur] = useState("");
  const [chargeLe, setChargeLe] = useState(null);
  const [genereLe, setGenereLe] = useState(null);
  // Deux titres au maximum : au-delà, une comparaison côte à côte cesse d'être
  // lisible et redevient un tableau.
  const [selection, setSelection] = useState([]);

  const recette = recetteParId(recetteId);

  const choisirRecette = (id) => {
    setRecetteId(id);
    setCriteres(recetteParId(id).criteres);
  };

  /** Tickers du portefeuille — seul mode qui interroge encore le réseau. */
  const symbolesCibles = useMemo(
    () => [...new Set(positions.map((p) => p.ticker).filter(Boolean))],
    [positions]
  );

  /**
   * Mode « Mes lignes » : les titres détenus ne sont pas forcément dans un
   * univers, et on les veut à jour. On garde donc l'appel direct — c'est une
   * poignée de symboles, exactement le dimensionnement pour lequel
   * `/api/market?action=screen` a été conçu.
   */
  const chargerPortefeuille = useCallback(async (symboles) => {
    if (symboles.length === 0) {
      setDonnees([]);
      return;
    }
    setChargement(true);
    setErreur("");
    setProgression({ faites: 0, total: Math.ceil(symboles.length / 20), titres: 0 });
    try {
      const out = await fetchScreen(symboles, { onProgression: setProgression });
      setDonnees(out);
      setChargeLe(new Date());
      setGenereLe(null);
      const echecs = out.filter((t) => t.ok === false).length;
      if (echecs > 0) {
        setErreur(`${echecs} titre(s) sur ${out.length} sans données fondamentales — ils sont affichés à part.`);
      }
    } catch (e) {
      setErreur(e.message || "Chargement impossible.");
      setDonnees([]);
    } finally {
      setChargement(false);
      setProgression(null);
    }
  }, []);

  /**
   * Modes « Marché » et « Diversifier » : l'instantané est un fichier statique
   * déjà en cache après le premier chargement. Aucun appel réseau, aucun
   * quota, et le screening redevient instantané quelle que soit la taille de
   * l'univers — ce que le chargement à la demande ne permettait pas au-delà de
   * quelques centaines de titres.
   */
  useEffect(() => {
    if (mode === "portefeuille") return undefined;
    const univers = universParCle(universActif);
    if (!univers?.disponible) {
      // Effet de CHARGEMENT : Chargement d'un univers : témoin levé avant la
      // requête, pour ne pas laisser les titres de l'univers précédent à l'écran
      // pendant l'attente.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDonnees([]);
      setGenereLe(null);
      setErreur(`${univers?.libelle ?? "Cet univers"} n'est pas encore disponible : sa composition n'a pas été fournie.`);
      return undefined;
    }

    let annule = false;
    setChargement(true);
    setErreur("");
    chargerUnivers(universActif)
      .then(({ titres, genereLe: date }) => {
        if (annule) return;
        setDonnees(titres);
        setGenereLe(date);
        setChargeLe(new Date());
      })
      .catch((e) => {
        if (annule) return;
        setDonnees([]);
        setErreur(e.message || "Univers indisponible.");
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });

    return () => {
      annule = true;
    };
  }, [mode, universActif]);

  // Revenir en haut de liste dès qu'un filtre change : garder 300 lignes
  // dépliées après avoir restreint la sélection n'a aucun sens.
  //
  // Ajustement pendant le rendu plutôt qu'effet : la liste était sinon peinte
  // une fois avec l'ancienne limite — jusqu'à 300 lignes rendues pour rien —
  // avant d'être immédiatement retaillée à 50.
  const filtres = `${universActif}|${recetteId}|${tranche}|${secteurFiltre}|${peaSeul}|${mode}`;
  const [filtresPrecedents, setFiltresPrecedents] = useState(filtres);
  if (filtres !== filtresPrecedents) {
    setFiltresPrecedents(filtres);
    setLimite(50);
  }

  const rafraichir = () => {
    if (mode === "portefeuille") chargerPortefeuille(symbolesCibles);
  };

  const secteurs = useMemo(() => secteursDisponibles(donnees), [donnees]);

  /** Univers réduit par les pré-filtres, avant application de la recette. */
  const universFiltre = useMemo(() => {
    if (mode === "portefeuille") return donnees;
    return appliquerPrefiltres(donnees, { tranche, secteur: secteurFiltre, peaSeul });
  }, [donnees, mode, tranche, secteurFiltre, peaSeul]);

  // Classement : les retenus d'abord (via appliquerRecette), puis par score
  // décroissant à l'intérieur de chaque groupe — c'est ce qui répond à
  // « lequel d'abord ? » une fois le filtre passé.
  const resultats = useMemo(() => {
    const base = appliquerRecette(universFiltre, criteres);
    return base
      .map((r) => ({ ...r, note: scoreComposite(r.titre, criteres) }))
      .sort((a, b) => {
        if (a.evaluation.retenu !== b.evaluation.retenu) return a.evaluation.retenu ? -1 : 1;
        return (b.note.score ?? -1) - (a.note.score ?? -1);
      });
  }, [universFiltre, criteres]);
  const indisponibles = useMemo(() => donnees.filter((t) => t.ok === false), [donnees]);

  const auditLignes = useMemo(
    () => (mode === "portefeuille" ? auditerPortefeuille(positions, donnees, criteres) : []),
    [mode, positions, donnees, criteres]
  );

  const poidsSecteurs = useMemo(
    () => (mode === "diversifier" ? poidsSectoriels(positions, donnees) : {}),
    [mode, positions, donnees]
  );

  const suggestions = useMemo(
    () =>
      mode === "diversifier"
        ? // Les pré-filtres s'appliquent aussi ici : suggérer une valeur que
          // l'enveloppe déclarée ne peut pas détenir, ou hors de la tranche de
          // capitalisation visée, serait une suggestion inutilisable.
          suggererDiversification(universFiltre, poidsSecteurs, {
            exclure: positions.map((p) => p.ticker),
            limite: 8,
          })
        : [],
    [mode, universFiltre, poidsSecteurs, positions]
  );

  const basculerComparaison = (symbole) =>
    setSelection((s) =>
      s.includes(symbole) ? s.filter((x) => x !== symbole) : s.length >= 2 ? [s[1], symbole] : [...s, symbole]
    );

  const titresCompares = selection
    .map((sym) => donnees.find((t) => t.symbole === sym))
    .filter(Boolean);

  const dejaSuivi = (symbole) => watchlist.some((w) => w.ticker?.toUpperCase() === symbole?.toUpperCase());

  const ajouterAWatchlist = (titre) => {
    if (!setWatchlist || dejaSuivi(titre.symbole)) return;
    setWatchlist((w) => [
      ...w,
      { id: uid(), ticker: titre.symbole, name: titre.nom || titre.symbole, type: "Action", target_price: 0 },
    ]);
  };

  const BoutonSuivre = ({ titre }) =>
    dejaSuivi(titre.symbole) ? (
      <span className="text-micro text-slate-600 px-2">déjà suivi</span>
    ) : (
      <button
        onClick={() => ajouterAWatchlist(titre)}
        className="flex items-center gap-1 text-micro text-violet-300 hover:text-violet-200 border border-violet-500/40 rounded-lg px-2 py-1"
      >
        <Plus size={11} aria-hidden="true" /> Suivre
      </button>
    );

  return (
    <div className="flex flex-col gap-4">
      {/* ─── Mode ─────────────────────────────────────────────────────────── */}
      <Card accent={CARD_THEMES.violet}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardLabel icon={Filter}>Screener fondamental</CardLabel>
          {/* Le bouton n'a plus de raison d'être hors du mode portefeuille :
              les univers sont chargés depuis un instantané statique, et
              filtrer ne coûte plus rien. */}
          {mode === "portefeuille" && (
            <GhostButton icon={RefreshCw} theme="violet" onClick={rafraichir} disabled={chargement}>
              {chargement
                ? progression?.total > 1
                  ? `Chargement ${progression.faites}/${progression.total}…`
                  : "Chargement…"
                : donnees.length > 0
                  ? "Actualiser"
                  : `Analyser ${symbolesCibles.length} valeurs`}
            </GhostButton>
          )}
        </div>

        <div className="flex gap-2 flex-wrap mt-1">
          {MODES.map((m) => (
            <button
              key={m.cle}
              onClick={() => { setMode(m.cle); setDonnees([]); setErreur(""); }}
              aria-pressed={mode === m.cle}
              title={m.aide}
              className={`flex items-center gap-1.5 text-xs rounded-lg border px-3 py-1.5 transition-colors ${
                mode === m.cle
                  ? "text-violet-300 border-violet-500/50 bg-violet-500/10"
                  : "text-slate-500 border-slate-700 hover:text-slate-300"
              }`}
            >
              <m.icon size={13} aria-hidden="true" /> {m.label}
            </button>
          ))}
        </div>

        {mode !== "portefeuille" && (
          <>
            <div className="flex gap-2 flex-wrap mt-3">
              {UNIVERS.map((u) => (
                <button
                  key={u.cle}
                  onClick={() => u.disponible && setUniversActif(u.cle)}
                  disabled={!u.disponible}
                  aria-pressed={universActif === u.cle}
                  title={u.disponible ? u.description : `${u.description} — composition non fournie.`}
                  className={`btn-flash text-micro rounded-lg border px-2.5 py-1 ${
                    !u.disponible
                      ? "text-slate-700 border-slate-800/60 cursor-not-allowed"
                      : universActif === u.cle
                      ? "text-slate-100 border-slate-500 bg-slate-800/60"
                      : "text-slate-500 border-slate-800 hover:text-slate-300"
                  }`}
                >
                  {u.libelle}
                  {!u.disponible && " ·"}
                </button>
              ))}
            </div>

            {/* Pré-filtres — appliqués avant la recette. C'est ce qui rend un
                univers de plusieurs centaines de titres exploitable. */}
            <div className="flex gap-2 flex-wrap items-center mt-3">
              <select
                value={tranche}
                onChange={(e) => setTranche(e.target.value)}
                aria-label="Tranche de capitalisation"
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-micro text-slate-200 focus:outline-none focus:border-violet-400/60"
              >
                {TRANCHES_CAPITALISATION.map((t) => (
                  <option key={t.cle} value={t.cle}>
                    {t.cle === "toutes" ? "Toutes tailles" : t.libelle}
                  </option>
                ))}
              </select>

              <select
                value={secteurFiltre}
                onChange={(e) => setSecteurFiltre(e.target.value)}
                aria-label="Secteur"
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-micro text-slate-200 focus:outline-none focus:border-violet-400/60 max-w-[12rem]"
              >
                <option value="">Tous secteurs</option>
                {secteurs.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <label
                className="flex items-center gap-1.5 text-micro text-slate-400 cursor-pointer"
                title="Siège social dans l'Espace économique européen. Attention : une société éligible mais cotée uniquement hors d'Europe (cas de quelques valeurs du Russell) reste inatteignable depuis un PEA, faute de place de cotation européenne."
              >
                <input
                  type="checkbox"
                  checked={peaSeul}
                  onChange={(e) => setPeaSeul(e.target.checked)}
                  className="accent-violet-400"
                />
                Éligible PEA
              </label>

              <span className="text-micro text-slate-600">
                {universFiltre.length} sur {donnees.length} valeurs
              </span>
            </div>
          </>
        )}

        {mode === "portefeuille" && (
          <p className="text-micro text-slate-500 mt-3">
            Les critères sont appliqués à tes {positions.length} ligne(s). Ce qui décroche apparaît en premier.
          </p>
        )}

        {/* La date de génération est affichée sans exception : un instantané
            servi par un job silencieusement cassé serait indiscernable d'un
            instantané frais. */}
        {genereLe && mode !== "portefeuille" && (
          <p className="text-micro text-slate-600 mt-2">
            Fondamentaux du{" "}
            {new Date(genereLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}, filtrés
            localement — aucun appel réseau.{" "}
            {universParCle(universActif)?.rafraichiALaDemande
              ? "Cet univers est rafraîchi à la demande : cette date peut être ancienne."
              : "Rafraîchis chaque semaine."}
          </p>
        )}
        {chargeLe && mode === "portefeuille" && (
          <p className="text-micro text-slate-600 mt-2">
            Fondamentaux chargés à {chargeLe.toLocaleTimeString("fr-FR")} · mis en cache une heure côté serveur.
          </p>
        )}
      </Card>

      {/* ─── Recette ──────────────────────────────────────────────────────── */}
      <Card accent={CARD_THEMES.violet}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardLabel icon={Filter}>Recette</CardLabel>
          <button
            onClick={() => setReglagesOuverts((o) => !o)}
            aria-expanded={reglagesOuverts}
            className="flex items-center gap-1 text-micro text-violet-300/80 hover:text-violet-200"
          >
            {reglagesOuverts ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
            Ajuster les seuils
          </button>
        </div>

        <div className="flex gap-2 flex-wrap mt-1">
          {RECETTES.map((r) => (
            <button
              key={r.id}
              onClick={() => choisirRecette(r.id)}
              aria-pressed={recetteId === r.id}
              className={`text-xs rounded-lg border px-3 py-1.5 transition-colors ${
                recetteId === r.id
                  ? "text-violet-300 border-violet-500/50 bg-violet-500/10"
                  : "text-slate-500 border-slate-700 hover:text-slate-300"
              }`}
            >
              {r.nom}
            </button>
          ))}
        </div>

        {recette && (
          <div className="mt-3">
            <p className="text-sm text-slate-300">{recette.resume}</p>
            {/* Une recette sans doctrine énoncée est une grille de curseurs
                qu'on applique sans savoir ce qu'elle cherche. */}
            <p className="text-micro text-slate-500 mt-1">{recette.pourquoi}</p>
          </div>
        )}

        {reglagesOuverts && (
          <ReglageCriteres
            criteres={criteres}
            onChange={setCriteres}
            onReinitialiser={() => setCriteres(recette.criteres)}
          />
        )}
      </Card>

      {erreur && (
        <div className="flex items-start gap-2 text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{erreur}</span>
        </div>
      )}

      {titresCompares.length === 2 && (
        <PanneauComparaison a={titresCompares[0]} b={titresCompares[1]} onFermer={() => setSelection([])} />
      )}
      {titresCompares.length === 1 && (
        <p className="text-micro text-slate-500">
          Sélectionne un second titre pour afficher la comparaison.
        </p>
      )}

      {/* ─── Résultats ────────────────────────────────────────────────────── */}
      <Card accent={CARD_THEMES.violet}>
        {chargement ? (
          <SkeletonTable rows={6} columns={4} />
        ) : donnees.length === 0 ? (
          <EmptyState>
            {mode === "portefeuille" && positions.length === 0
              ? "Aucune position à analyser — ajoute des lignes dans ton portefeuille."
              : "Lance l'analyse pour récupérer les fondamentaux. Ils sont ensuite mis en cache une heure."}
          </EmptyState>
        ) : mode === "marche" ? (
          <>
            <CardLabel icon={Search}>
              {resultats.filter((r) => r.evaluation.retenu).length} retenu(s) sur {resultats.length} analysé(s)
            </CardLabel>
            <div className="flex flex-col gap-2 mt-1">
              {/* Rendu borné : un univers de plusieurs centaines de titres ne
                  se rend pas d'un bloc. Le tri place les retenus et les
                  meilleurs scores en tête, donc la coupure tombe toujours sur
                  ce qui intéresse le moins. */}
              {resultats.slice(0, limite).map(({ titre, evaluation }) => (
                <LigneResultat
                  key={titre.symbole}
                  symbole={titre.symbole}
                  nom={titre.nom}
                  secteur={titre.secteur}
                  evaluation={evaluation}
                  score={(() => { const r = scoreComposite(titre, criteres); return <BadgeScore score={r.score} nbNotes={r.nbNotes} detail={r.detail} />; })()}
                  compare={selection.includes(titre.symbole)}
                  surComparer={() => basculerComparaison(titre.symbole)}
                  complement={
                    titre.cours != null && (
                      <span className="text-micro font-data text-slate-400">{eur(titre.cours, 2)}</span>
                    )
                  }
                  action={
                    <>
                      <BoutonSuivre titre={titre} />
                      {onOpenMarket && (
                        <button
                          onClick={() => onOpenMarket(titre.symbole)}
                          className="text-micro text-slate-500 hover:text-violet-300 px-2"
                        >
                          Fiche
                        </button>
                      )}
                    </>
                  }
                />
              ))}
            </div>
            {resultats.length > limite && (
              <button
                onClick={() => setLimite((l) => l + 100)}
                className="btn-flash w-full mt-3 text-xs text-violet-300 hover:text-violet-100 border border-violet-500/30 hover:border-violet-400/60 rounded-lg py-2 transition-colors"
              >
                Afficher 100 de plus — {resultats.length - limite} valeurs restantes
              </button>
            )}
          </>
        ) : mode === "portefeuille" ? (
          <>
            <CardLabel icon={Briefcase}>
              {auditLignes.filter((l) => l.evaluation && !l.evaluation.retenu).length} ligne(s) ne passent plus le filtre
            </CardLabel>
            <div className="flex flex-col gap-2 mt-1">
              {auditLignes.map(({ position, titre, evaluation, indisponible }) => (
                <LigneResultat
                  key={position.id || position.ticker}
                  symbole={position.ticker}
                  nom={titre?.nom || position.name}
                  secteur={titre?.secteur}
                  evaluation={evaluation}
                  score={titre ? (() => { const r = scoreComposite(titre, criteres); return <BadgeScore score={r.score} nbNotes={r.nbNotes} detail={r.detail} />; })() : null}
                  complement={
                    indisponible ? (
                      <span className="text-micro text-slate-600">fondamentaux indisponibles</span>
                    ) : (
                      <span className="text-micro font-data text-slate-400 ghost-blur">
                        {eur(position.quantity * position.current_price)}
                      </span>
                    )
                  }
                  action={
                    onOpenMarket && (
                      <button
                        onClick={() => onOpenMarket(position.ticker)}
                        className="text-micro text-slate-500 hover:text-violet-300 px-2"
                      >
                        Fiche
                      </button>
                    )
                  }
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <CardLabel icon={Compass}>Secteurs sous-représentés dans ton portefeuille</CardLabel>
            {Object.keys(poidsSecteurs).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1 mb-3">
                {Object.entries(poidsSecteurs)
                  .sort((a, b) => b[1] - a[1])
                  .map(([secteur, poids]) => (
                    <span
                      key={secteur}
                      className="text-micro text-slate-400 border border-slate-700 bg-slate-900/60 rounded-full px-2 py-0.5"
                    >
                      {secteur} {pctPlain(poids, 0)}
                    </span>
                  ))}
              </div>
            )}
            {suggestions.length === 0 ? (
              <EmptyState>
                Aucune suggestion — charge d'abord les fondamentaux d'un indice, et vérifie que ton portefeuille contient des lignes.
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-2">
                {suggestions.map(({ titre, secteur, poidsActuelPct }) => (
                  <LigneResultat
                    key={titre.symbole}
                    symbole={titre.symbole}
                    nom={titre.nom}
                    secteur={secteur}
                    complement={
                      <span className="text-micro text-slate-500">
                        {poidsActuelPct === 0 ? "secteur absent" : `secteur à ${pctPlain(poidsActuelPct, 0)}`}
                      </span>
                    }
                    action={<BoutonSuivre titre={titre} />}
                  />
                ))}
              </div>
            )}
            <p className="text-micro text-slate-600 mt-3">
              Suggestions classées par rentabilité des capitaux propres à l'intérieur de chaque secteur. Ce
              n'est pas une recommandation d'achat : la diversification sectorielle est un critère parmi d'autres.
            </p>
          </>
        )}

        {indisponibles.length > 0 && mode === "marche" && (
          <p className="text-micro text-slate-600 mt-3 pt-3 border-t border-slate-800">
            Non évalués faute de données : {indisponibles.map((t) => t.symbole).join(", ")}. Un titre absent
            d'un filtre pour cause de panne réseau ressemblerait sinon à un titre qui ne passe pas le filtre.
          </p>
        )}
      </Card>
    </div>
  );
}
