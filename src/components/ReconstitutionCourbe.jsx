import { useMemo } from "react";
import { History } from "lucide-react";
import { Card, CardLabel } from "./ui";
import { useToast } from "../lib/ToastContext";
import { todayIso } from "../lib/finance";
import { reconstituerPatrimoine, appliquerReconstitution } from "../lib/reconstitutionPatrimoine";

/**
 * Propose de recalculer la courbe du patrimoine sur la période des relevés.
 *
 * L'aperçu dit combien de jours seraient ajoutés ou corrigés AVANT d'écrire,
 * et la notification qui suit permet d'annuler : c'est l'historique affiché
 * sur le Dashboard, il ne doit pas changer sans qu'on l'ait voulu.
 */
export default function ReconstitutionCourbe({
  serie,
  bourse,
  bourseHistory = [],
  livrets = [],
  dettesTotal = 0,
  historyPast = [],
  setHistoryPast,
}) {
  const { showToast } = useToast();
  const hier = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return todayIso(d);
  }, []);
  const portefeuilleVide = !(bourse?.positions?.length > 0) && !(bourse?.cash_pocket > 0);
  const { changements, sansPortefeuille } = useMemo(
    () =>
      reconstituerPatrimoine({
        serie,
        bourseHistory,
        portefeuilleVide,
        livrets,
        dettesTotal,
        historique: historyPast,
        jusquA: hier,
      }),
    [serie, bourseHistory, portefeuilleVide, livrets, dettesTotal, historyPast, hier]
  );
  if (!setHistoryPast || serie.length === 0) return null;

  const ajouts = changements.filter((c) => c.avant == null).length;
  const corrections = changements.length - ajouts;
  const debut = serie[0].date.split("-").reverse().join("/");

  const reconstituer = () => {
    const avant = historyPast;
    setHistoryPast((h) => appliquerReconstitution(h, changements));
    showToast({
      message: `Courbe du patrimoine reconstituée : ${ajouts} jour${ajouts > 1 ? "s" : ""} ajouté${ajouts > 1 ? "s" : ""}, ${corrections} corrigé${corrections > 1 ? "s" : ""}.`,
      onUndo: () => setHistoryPast(avant),
    });
  };

  return (
    <Card>
      <CardLabel icon={History}>Courbe du patrimoine</CardLabel>
      {changements.length === 0 ? (
        <p className="text-sm text-slate-400">La courbe du patrimoine est à jour avec tes relevés.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-300 flex-1 min-w-[14rem]">
            Tes relevés donnent le solde du compte courant chaque soir depuis le {debut}. De quoi recalculer ton
            patrimoine de ces jours-là : {ajouts} jour{ajouts > 1 ? "s" : ""} à ajouter à la courbe
            {corrections > 0 && <>, {corrections} point{corrections > 1 ? "s" : ""} à corriger</>}.
          </p>
          <button
            type="button"
            onClick={reconstituer}
            className="rounded-lg border border-lime-400/40 bg-lime-400/10 px-3 py-1.5 text-xs text-lime-100 hover:bg-lime-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
          >
            Reconstituer la courbe
          </button>
        </div>
      )}
      {sansPortefeuille > 0 && (
        <p className="text-micro text-slate-500 mt-2">
          {sansPortefeuille} jour{sansPortefeuille > 1 ? "s restent" : " reste"} sans point : la valeur de ton
          portefeuille n'y est pas connue, et elle n'est pas devinée.
        </p>
      )}
      <p className="text-micro text-slate-500 mt-2">
        Les points saisis à la main ne sont jamais modifiés. Au-delà de quatre mois, la courbe garde un point par mois.
      </p>
    </Card>
  );
}
