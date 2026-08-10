import { useState, useMemo, useCallback } from "react";
import {
  Filter, RefreshCw, Check, X, AlertTriangle, Search, Compass, Briefcase,
  ChevronDown, ChevronUp, Info, Plus,
} from "lucide-react";
import { Card, CardLabel, GhostButton, EmptyState, SkeletonTable, CARD_THEMES } from "./ui";
import { eur, pctPlain, uid, compact } from "../lib/finance";
import { fetchScreen } from "../lib/api";
import { INDEX_CONSTITUENTS, INDEX_TABS } from "../lib/indexConstituents";
import {
  RECETTES, CRITERES, SENS, recetteParId, appliquerRecette,
  auditerPortefeuille, suggererDiversification, poidsSectoriels,
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
      className={`inline-flex items-center gap-1 text-[10px] rounded-full border px-2 py-0.5 ${styles[detail.statut]}`}
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
              <span className="text-[11px] text-slate-500 font-data">{sens === SENS.MIN ? "≥" : "≤"}</span>
              <input
                id={`crit-${c.cle}`}
                type="number"
                step="0.5"
                value={c.seuil}
                onChange={(e) => {
                  const suivant = [...criteres];
                  suivant[i] = { ...c, seuil: parseFloat(e.target.value) || 0 };
                  onChange(suivant);
                }}
                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-data tabular-nums focus:outline-none focus:border-violet-400/60"
              />
              <span className="text-[11px] text-slate-600 w-4">{def.unite}</span>
            </div>
          </div>
        );
      })}
      <button onClick={onReinitialiser} className="text-[11px] text-slate-500 hover:text-slate-300">
        Rétablir les seuils de la recette
      </button>
    </div>
  );
}

/** Ligne de résultat commune aux trois modes. */
function LigneResultat({ symbole, nom, secteur, evaluation, complement, action }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        evaluation?.retenu ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800 bg-slate-950/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-data font-semibold text-slate-100">{symbole}</span>
            {evaluation?.retenu && (
              <span className="text-[10px] text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-1.5">
                retenu
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 truncate max-w-[22rem]">
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
        <p className="text-[10px] text-slate-600 mt-1.5">
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
  const [indexActif, setIndexActif] = useState("cac40");
  const [recetteId, setRecetteId] = useState("dividende-solide");
  const [criteres, setCriteres] = useState(() => recetteParId("dividende-solide").criteres);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);

  const [donnees, setDonnees] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [chargeLe, setChargeLe] = useState(null);

  const recette = recetteParId(recetteId);

  const choisirRecette = (id) => {
    setRecetteId(id);
    setCriteres(recetteParId(id).criteres);
  };

  /** Symboles à interroger selon le mode courant. */
  const symbolesCibles = useMemo(() => {
    if (mode === "portefeuille") return [...new Set(positions.map((p) => p.ticker).filter(Boolean))];
    return INDEX_CONSTITUENTS[indexActif] || [];
  }, [mode, indexActif, positions]);

  const charger = useCallback(async (symboles) => {
    if (symboles.length === 0) {
      setDonnees([]);
      return;
    }
    setChargement(true);
    setErreur("");
    try {
      const out = await fetchScreen(symboles);
      setDonnees(out);
      setChargeLe(new Date());
      const echecs = out.filter((t) => t.ok === false).length;
      if (echecs > 0) {
        setErreur(`${echecs} titre(s) sur ${out.length} sans données fondamentales — ils sont affichés à part.`);
      }
    } catch (e) {
      setErreur(e.message || "Chargement impossible.");
      setDonnees([]);
    } finally {
      setChargement(false);
    }
  }, []);

  // Chargement à la demande plutôt qu'au montage : une requête déclenche
  // jusqu'à vingt appels Yahoo, et ouvrir l'onglet ne signifie pas vouloir
  // screener tout de suite.
  const rafraichir = () => charger(symbolesCibles);

  const resultats = useMemo(() => appliquerRecette(donnees, criteres), [donnees, criteres]);
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
        ? suggererDiversification(donnees, poidsSecteurs, {
            exclure: positions.map((p) => p.ticker),
            limite: 8,
          })
        : [],
    [mode, donnees, poidsSecteurs, positions]
  );

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
      <span className="text-[10px] text-slate-600 px-2">déjà suivi</span>
    ) : (
      <button
        onClick={() => ajouterAWatchlist(titre)}
        className="flex items-center gap-1 text-[11px] text-violet-300 hover:text-violet-200 border border-violet-500/40 rounded-lg px-2 py-1"
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
          <GhostButton icon={RefreshCw} theme="violet" onClick={rafraichir} disabled={chargement}>
            {chargement ? "Chargement…" : donnees.length > 0 ? "Actualiser" : "Lancer l'analyse"}
          </GhostButton>
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
          <div className="flex gap-2 flex-wrap mt-3">
            {INDEX_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setIndexActif(t.key); setDonnees([]); }}
                aria-pressed={indexActif === t.key}
                className={`text-[11px] rounded-lg border px-2.5 py-1 ${
                  indexActif === t.key
                    ? "text-slate-100 border-slate-500 bg-slate-800/60"
                    : "text-slate-500 border-slate-800 hover:text-slate-300"
                }`}
              >
                {t.label}
              </button>
            ))}
            <span className="text-[11px] text-slate-600 self-center">
              {symbolesCibles.length} valeurs
            </span>
          </div>
        )}

        {mode === "portefeuille" && (
          <p className="text-[11px] text-slate-500 mt-3">
            Les critères sont appliqués à tes {positions.length} ligne(s). Ce qui décroche apparaît en premier.
          </p>
        )}

        {chargeLe && (
          <p className="text-[10px] text-slate-600 mt-2">
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
            className="flex items-center gap-1 text-[11px] text-violet-300/80 hover:text-violet-200"
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
            <p className="text-[11px] text-slate-500 mt-1">{recette.pourquoi}</p>
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
              {resultats.map(({ titre, evaluation }) => (
                <LigneResultat
                  key={titre.symbole}
                  symbole={titre.symbole}
                  nom={titre.nom}
                  secteur={titre.secteur}
                  evaluation={evaluation}
                  complement={
                    titre.cours != null && (
                      <span className="text-[11px] font-data text-slate-400">{eur(titre.cours, 2)}</span>
                    )
                  }
                  action={
                    <>
                      <BoutonSuivre titre={titre} />
                      {onOpenMarket && (
                        <button
                          onClick={() => onOpenMarket(titre.symbole)}
                          className="text-[11px] text-slate-500 hover:text-violet-300 px-2"
                        >
                          Fiche
                        </button>
                      )}
                    </>
                  }
                />
              ))}
            </div>
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
                  complement={
                    indisponible ? (
                      <span className="text-[10px] text-slate-600">fondamentaux indisponibles</span>
                    ) : (
                      <span className="text-[11px] font-data text-slate-400 ghost-blur">
                        {eur(position.quantity * position.current_price)}
                      </span>
                    )
                  }
                  action={
                    onOpenMarket && (
                      <button
                        onClick={() => onOpenMarket(position.ticker)}
                        className="text-[11px] text-slate-500 hover:text-violet-300 px-2"
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
                      className="text-[10px] text-slate-400 border border-slate-700 bg-slate-900/60 rounded-full px-2 py-0.5"
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
                      <span className="text-[10px] text-slate-500">
                        {poidsActuelPct === 0 ? "secteur absent" : `secteur à ${pctPlain(poidsActuelPct, 0)}`}
                      </span>
                    }
                    action={<BoutonSuivre titre={titre} />}
                  />
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-600 mt-3">
              Suggestions classées par rentabilité des capitaux propres à l'intérieur de chaque secteur. Ce
              n'est pas une recommandation d'achat : la diversification sectorielle est un critère parmi d'autres.
            </p>
          </>
        )}

        {indisponibles.length > 0 && mode === "marche" && (
          <p className="text-[11px] text-slate-600 mt-3 pt-3 border-t border-slate-800">
            Non évalués faute de données : {indisponibles.map((t) => t.symbole).join(", ")}. Un titre absent
            d'un filtre pour cause de panne réseau ressemblerait sinon à un titre qui ne passe pas le filtre.
          </p>
        )}
      </Card>
    </div>
  );
}
