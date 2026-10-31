import { useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { positionsSansTaux } from "../lib/finance";
import { verifierEligibilite } from "../../shared/eligibilitePea";

/**
 * Avertissements du portefeuille : lignes en devise sans taux de change,
 * titres inéligibles au PEA. Sortis de Bourse.jsx.
 */

/**
 * Avertit quand des positions sont cotées dans une autre devise que l'euro.
 *
 * Toute l'application additionne les `current_price` comme des euros et ne
 * convertit jamais : sans ce signal, un titre coté en dollars était compté à
 * parité 1:1 et faussait silencieusement la valeur du portefeuille, la
 * plus-value et la répartition. Mieux vaut le dire que de laisser croire à un
 * chiffre juste.
 */
export function ForeignCurrencyWarning({ positions }) {
  const sansTaux = positionsSansTaux(positions);
  const converties = (positions || []).filter(
    (p) => p.currency && p.currency !== "EUR" && Number.isFinite(p.fxRate) && p.fxRate > 0
  );

  // Cas nominal désormais : les lignes en devise sont converties au taux du
  // jour, récupéré en même temps que les cours. On l'indique sans alarmer.
  if (sansTaux.length === 0) {
    if (converties.length === 0) return null;
    const devises = [...new Set(converties.map((p) => p.currency))].join(", ");
    return (
      <div className="flex items-start gap-2 text-xs rounded-lg border border-slate-700 bg-slate-900/60 text-slate-400 px-3 py-2">
        <Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          {converties.length} position(s) cotée(s) en {devises}, converties en euros au taux du jour.
          Le prix de revient est converti à ce même taux : la plus-value affichée inclut donc l'effet
          de change, sans le distinguer de la performance du titre.
        </span>
      </div>
    );
  }

  const devises = [...new Set(sansTaux.map((p) => p.currency))].join(", ");
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 px-3 py-2">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        {sansTaux.length} position(s) en {devises} ({sansTaux.map((p) => p.ticker).join(", ")}) sans
        taux de change connu : elles sont comptées à parité 1:1. Actualise les cours pour récupérer
        les taux et corriger la valeur totale, la plus-value et la répartition.
      </span>
    </div>
  );
}

/**
 * Lignes incompatibles avec l'enveloppe déclarée.
 *
 * Un PEA ne peut détenir que des sociétés dont le siège est dans l'UE ou
 * l'EEE. Rien ne l'empêchait : on pouvait ajouter `AAPL` à un portefeuille
 * déclaré PEA, et toute la fiscalité calculée derrière — exonération après
 * cinq ans, plus-value nette — devenait fausse sans qu'aucun signal
 * n'apparaisse.
 *
 * L'avertissement reste informatif : on ne bloque pas la saisie. Le suffixe du
 * ticker est une heuristique, et une ligne peut être détenue sur un CTO
 * pendant que l'enveloppe principale est un PEA.
 */
export function EligibilitePeaWarning({ positions, enveloppe }) {
  const inelegibles = useMemo(
    () =>
      (positions || [])
        .map((p) => ({ position: p, verdict: verifierEligibilite(p.ticker, enveloppe) }))
        .filter(({ verdict }) => verdict.eligible === false),
    [positions, enveloppe]
  );

  if (inelegibles.length === 0) return null;

  const pays = [...new Set(inelegibles.map(({ verdict }) => verdict.pays))].join(", ");
  return (
    <div className="flex items-start gap-2 text-xs rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-200 px-3 py-2">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        {inelegibles.length} ligne(s) hors Espace économique européen ({pays}) :{" "}
        <span className="font-medium">{inelegibles.map(({ position }) => position.ticker).join(", ")}</span>.
        Un {enveloppe} ne peut pas les détenir — si elles sont sur un compte-titres, déclare-le dans
        l&apos;enveloppe de ce portefeuille, sinon la fiscalité affichée ici est fausse.
      </span>
    </div>
  );
}
