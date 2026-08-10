import { useMemo } from "react";
import { todayIso } from "./finance";
import { bilanEstDu, construireBilan } from "../components/BilanMensuel";

/**
 * Remonte le bilan mensuel dans le panneau de notifications.
 *
 * Le bilan existait déjà, mais il ne s'affichait que dans le sous-onglet
 * « Projet » de Simulation — trois niveaux de navigation sous l'accueil. Un
 * bilan proactif qu'il faut aller chercher n'est plus proactif : c'est un
 * écran de plus.
 *
 * Il ne consomme aucun quota et ne sort aucune donnée : tout est calculé dans
 * le navigateur (voir BilanMensuel).
 */
export function useBilanRappel({
  patrimoineNet,
  historyPast,
  tauxEpargne,
  matelasMois,
  dernierBilan,
  setDernierBilan,
}) {
  const rappels = useMemo(() => {
    if (!bilanEstDu(dernierBilan)) return [];
    const bilan = construireBilan({
      patrimoineNet,
      historyPast,
      tauxEpargnePct: tauxEpargne,
      epargneSecuriteMois: matelasMois,
    });
    const marquant = bilan.constats.find((c) => c.ton === "negatif") || bilan.constats[0];
    if (!marquant) return [];
    return [
      {
        id: "bilan-mensuel",
        // Le constat le plus saillant sert de titre : une notification qui dit
        // seulement « ton bilan est disponible » n'apprend rien.
        label: `Bilan du mois — ${marquant.texte}`,
        type: "bilan",
      },
    ];
  }, [dernierBilan, patrimoineNet, historyPast, tauxEpargne, matelasMois]);

  const acquitterBilan = () => setDernierBilan(todayIso());

  return { rappels, acquitterBilan };
}
