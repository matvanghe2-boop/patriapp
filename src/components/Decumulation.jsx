import { useMemo, useState } from "react";
import { TrendingDown, Infinity as InfinityIcon, AlertTriangle } from "lucide-react";
import { Card, CardLabel, SliderField } from "./ui";
import Montant from "./Montant";
import { CourbeEvolution } from "./graphiques";
import { projeterDecumulation, retraitPerpetuel, formaterDuree } from "../lib/decumulation";

/**
 * Décumulation — onglet Simulation.
 *
 * PLACÉ ICI ET PAS AILLEURS : c'est une projection, exactement comme le moteur
 * d'intérêts composés qui occupe déjà cet onglet. L'un accumule, l'autre
 * retire ; les mettre côte à côte rend visible qu'ils décrivent les deux
 * moitiés du même mouvement.
 *
 * C'EST LE PREMIER CALCUL DE PATRIUM QUI TOUCHE À UNE DÉCISION DE VIE, et
 * l'application n'a jamais émis d'avis jusqu'ici. Trois précautions en
 * découlent, visibles à l'écran et pas seulement dans le code :
 *
 *  · le rendement supposé constant est annoncé comme tel ;
 *  · le risque de séquence — une mauvaise série en début de retrait épuise un
 *    capital bien plus vite que la même moyenne étalée — est chiffré à côté du
 *    résultat principal, pas relégué en note ;
 *  · l'indexation du retrait est un réglage explicite, sans valeur par défaut
 *    cachée. Retirer 1 400 € par mois pendant vingt ans ne veut rien dire sans
 *    préciser si ce montant suit l'inflation.
 */
export default function Decumulation({ patrimoineNet = 0, livretsAvgRate = 0 }) {
  const [retrait, setRetrait] = useState(() => Math.max(200, Math.round((patrimoineNet * 0.04) / 12 / 50) * 50));
  const [taux, setTaux] = useState(() => Math.max(2, Math.round(livretsAvgRate || 4)));
  const [inflation, setInflation] = useState(2);

  const base = useMemo(
    () => projeterDecumulation({ capital: patrimoineNet, retraitMensuel: retrait, tauxAnnuelPct: taux, inflationPct: inflation }),
    [patrimoineNet, retrait, taux, inflation]
  );

  // Variante dégradée : le même plan, avec deux points de rendement en moins.
  // C'est l'approximation la plus simple du risque de séquence, et elle suffit
  // à montrer que la marge n'est pas symétrique.
  const degrade = useMemo(
    () => projeterDecumulation({ capital: patrimoineNet, retraitMensuel: retrait, tauxAnnuelPct: Math.max(0, taux - 2), inflationPct: inflation }),
    [patrimoineNet, retrait, taux, inflation]
  );

  const seuil = useMemo(
    () => retraitPerpetuel({ capital: patrimoineNet, tauxAnnuelPct: taux, inflationPct: inflation }),
    [patrimoineNet, taux, inflation]
  );

  const serie = base.annees.map((a) => a.capital);

  return (
    <Card accent="teinte-amber carte-domaine">
      <CardLabel icon={TrendingDown}>Décumulation — combien puis-je retirer ?</CardLabel>
      <p className="text-mini text-slate-500 mt-1">
        Le moteur ci-dessus projette l'accumulation. Celui-ci fait le chemin inverse : à partir de
        ton patrimoine actuel, combien retirer chaque mois, et jusqu'à quand.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <SliderField
          label="Retrait mensuel"
          value={retrait}
          onChange={setRetrait}
          min={100}
          max={Math.max(500, Math.round((patrimoineNet * 0.12) / 12))}
          step={50}
          unit=" €"
        />
        <SliderField label="Rendement net" value={taux} onChange={setTaux} min={0} max={10} step={0.5} unit=" %" />
        <SliderField label="Indexation" value={inflation} onChange={setInflation} min={0} max={5} step={0.5} unit=" %" />
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <CourbeEvolution
          valeurs={serie}
          largeur={520}
          hauteur={90}
          libelle="Capital restant au fil des années"
          className={`w-full h-auto ghost-blur ${base.perpetuel ? "text-emerald-400" : "text-amber-400"}`}
        />

        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mt-3">
          <span className="flex items-baseline gap-2">
            {base.perpetuel ? (
              <>
                <InfinityIcon size={16} className="etat-ok shrink-0" aria-hidden="true" />
                <span className="text-corps etat-ok">Le capital n'est pas entamé sur 50 ans</span>
              </>
            ) : (
              <>
                <span className="text-corps text-slate-400">Épuisé après</span>
                <b className="font-data text-lead text-slate-100">{formaterDuree(base.epuiseApresMois)}</b>
              </>
            )}
          </span>

          <span className="flex items-baseline gap-2">
            <span className="text-corps text-slate-400">Perpétuel dès</span>
            <Montant valeur={seuil} decimales={0} className="text-lead etat-ok" />
            <span className="text-micro text-slate-500">par mois</span>
          </span>
        </div>
      </div>

      {/* Le risque de séquence, chiffré à côté du résultat et non relégué. */}
      {!base.perpetuel && degrade.epuiseApresMois != null && (
        <p className="flex items-start gap-2 text-mini text-amber-300/90 mt-3">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Avec deux points de rendement en moins — une mauvaise série en début de retrait — le
            capital tient <b className="font-data">{formaterDuree(degrade.epuiseApresMois)}</b>, soit{" "}
            <b className="font-data">
              {Math.round((base.epuiseApresMois - degrade.epuiseApresMois) / 12)} ans
            </b>{" "}
            de moins. L'écart n'est pas symétrique : c'est ce qu'on appelle le risque de séquence.
          </span>
        </p>
      )}

      <p className="text-micro text-slate-600 mt-3">
        Le rendement est supposé <strong>constant</strong>, ce qu'aucun marché ne fait. Cette
        projection donne un ordre de grandeur et une comparaison entre réglages, pas une prévision.
      </p>
    </Card>
  );
}
