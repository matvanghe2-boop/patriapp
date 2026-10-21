import { useEffect, useMemo, useState } from "react";
import { Users2 } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import AssetLogo from "./AssetLogo";
import { nombre, pctPlain, compact } from "../lib/finance";
import { chargerUnivers } from "../lib/univers";
import { fetchTauxChange } from "../lib/api";
import {
  UNIVERS_PAIRS, fusionnerUnivers, groupeDePairs, comparerAuxPairs, plusProchesParTaille, deviseCapitalisation,
} from "../lib/pairs";

/**
 * Le titre affiché dans Marché, face aux sociétés de son industrie.
 *
 * Les chiffres du titre viennent de sa fiche financière, en direct ; ceux des
 * concurrents, de l'instantané hebdomadaire du Screener — dont la date est
 * affichée, puisque c'est elle qui borne la fraîcheur de la comparaison.
 */

const TONS = {
  favorable: "text-emerald-400",
  defavorable: "text-rose-400",
  neutre: "text-slate-300",
};

const fmt = (v, unite) => (v == null ? "—" : unite === "%" ? pctPlain(v, 1) : `${nombre(v, 1)} ×`);
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null);

export default function ComparaisonPairs({ symbole, fiche, onOuvrir }) {
  const [univers, setUnivers] = useState(null);
  const [versEuro, setVersEuro] = useState({ EUR: 1 });

  useEffect(() => {
    let annule = false;
    Promise.allSettled(UNIVERS_PAIRS.map((cle) => chargerUnivers(cle))).then((resultats) => {
      if (annule) return;
      const charges = resultats.filter((r) => r.status === "fulfilled").map((r) => r.value);
      setUnivers({
        titres: fusionnerUnivers(charges.map((u) => u.titres)),
        // La date la plus ANCIENNE des instantanés chargés : c'est elle qui
        // dit jusqu'où la comparaison peut dater.
        genereLe: charges.map((u) => u.genereLe).filter(Boolean).sort()[0] ?? null,
      });
    });
    return () => {
      annule = true;
    };
  }, []);

  // Le sujet : la fiche en direct quand elle est celle du titre affiché, sinon
  // sa ligne dans l'instantané.
  const sujet = useMemo(() => {
    if (!univers) return null;
    const ligne = univers.titres.find((t) => t.symbole === symbole);
    if (fiche?.symbole === symbole && (fiche.industrie || fiche.secteur)) return { ...ligne, ...fiche, symbole };
    return ligne ?? null;
  }, [univers, fiche, symbole]);

  const groupe = useMemo(() => (sujet && univers ? groupeDePairs(sujet, univers.titres) : null), [sujet, univers]);
  const lignes = useMemo(() => (groupe ? comparerAuxPairs(sujet, groupe.pairs) : []), [sujet, groupe]);

  const devisesManquantes = useMemo(() => {
    if (!groupe) return [];
    const devises = new Set([sujet, ...groupe.pairs].map((t) => deviseCapitalisation(t?.devise)).filter(Boolean));
    return [...devises].filter((d) => d !== "EUR" && versEuro[d] === undefined);
  }, [groupe, sujet, versEuro]);

  useEffect(() => {
    if (devisesManquantes.length === 0) return undefined;
    let annule = false;
    fetchTauxChange(devisesManquantes)
      .then((taux) => {
        if (annule) return;
        setVersEuro((v) => {
          const suivant = { ...v };
          // Une devise sans taux est notée `null` : elle n'est plus redemandée,
          // et ses titres restent hors du classement par taille.
          for (const d of devisesManquantes) suivant[d] = null;
          for (const t of taux) if (t.ok) suivant[t.devise] = t.versEuro;
          return suivant;
        });
      })
      .catch(() => {
        if (!annule) setVersEuro((v) => Object.fromEntries([...Object.entries(v), ...devisesManquantes.map((d) => [d, null])]));
      });
    return () => {
      annule = true;
    };
  }, [devisesManquantes]);

  const proches = useMemo(() => (groupe ? plusProchesParTaille(sujet, groupe.pairs, versEuro) : []), [groupe, sujet, versEuro]);

  if (!groupe) return null;
  const affichables = lignes.filter((l) => l.valeur != null || l.mediane != null);
  if (affichables.length === 0) return null;
  const horsUnivers = !univers.titres.some((t) => t.symbole === symbole);

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={Users2}>Face à ses concurrents</CardLabel>
      <p className="text-xs text-slate-400 mt-1">
        {groupe.pairs.length} société(s) {groupe.niveau === "industrie" ? "de l'industrie" : "du secteur"}{" "}
        <span className="text-slate-200">« {groupe.libelle} »</span>
        {groupe.niveau === "secteur" && " — l'industrie seule comptait trop peu de titres pour un classement"}
        {horsUnivers && ", parmi les valeurs européennes : ce titre n'est pas lui-même dans l'univers du Screener"}.
      </p>

      <div className="mt-3 flex flex-col">
        {affichables.map((l) => (
          <div key={l.cle} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,12rem)_5rem_7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-2 border-b border-slate-800/60 last:border-0">
            <span className="text-xs text-slate-400 truncate">{l.libelle}</span>
            <span className={`text-xs font-data tabular-nums text-right font-semibold ${TONS[l.ton]}`}>{fmt(l.valeur, l.unite)}</span>
            <span className="text-micro text-slate-500 font-data tabular-nums sm:text-right">médiane {fmt(l.mediane, l.unite)}</span>
            {l.rangPct != null ? (
              <span className="flex items-center gap-2 min-w-0" title={`${l.libelle} ${l.lecture} ${Math.round(l.rangPct)} % des ${l.nbPairs} concurrents renseignés`}>
                <span className="relative h-1.5 flex-1 rounded-full bg-slate-800">
                  <span
                    className="absolute -top-[3px] w-2.5 h-2.5 rounded-full bg-violet-400 border border-slate-950"
                    style={{ left: `calc(${l.rangPct}% - 5px)` }}
                  />
                </span>
                <span className="text-micro text-slate-500 shrink-0">
                  {l.lecture} {Math.round(l.rangPct)} %
                </span>
              </span>
            ) : (
              <span className="text-micro text-slate-500">
                {l.valeur == null ? "non publié pour ce titre" : l.nbPairs < 4 ? "trop peu de concurrents renseignés" : "non classable (valeur négative)"}
              </span>
            )}
          </div>
        ))}
      </div>

      {proches.length > 0 && (
        <div className="mt-4">
          <div className="text-micro uppercase tracking-wide text-slate-500 mb-2">Les plus proches par la taille</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {proches.map((p) => (
              <button
                key={p.symbole}
                type="button"
                onClick={() => onOuvrir?.(p.symbole)}
                className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left hover:border-violet-500/40 transition-colors"
                title={`Ouvrir ${p.nom || p.symbole} dans Marché`}
              >
                <AssetLogo ticker={p.symbole} name={p.nom} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-slate-200 truncate">{p.nom || p.symbole}</span>
                  <span className="block text-micro text-slate-500 font-data">
                    {compact(p.capitalisationEuro)} · PER {fmt(p.per > 0 ? p.per : null, "×")} · marge op. {fmt(p.margeOperationnellePct, "%")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-micro text-slate-500 mt-3">
        Rang = part des concurrents dont la valeur est plus basse. Chiffres du titre en direct ; ceux des concurrents
        viennent de l&apos;instantané du Screener{univers.genereLe ? ` du ${dateCourte(univers.genereLe)}` : ""}.
        Capitalisations converties en euros au taux du jour.
      </p>
    </Card>
  );
}
