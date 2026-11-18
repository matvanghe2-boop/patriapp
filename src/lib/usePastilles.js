import { useEffect, useMemo } from "react";
import { usePatrimoine } from "./PatrimoineContext";
import { usePersistentState } from "./storage";
import { nouveautesParOnglet, ongletsAvecPastille, marquerVues } from "./pastilles";

/**
 * Pastilles des onglets (voir lib/pastilles.js).
 *
 * L'onglet ouvert voit ses nouveautés au fur et à mesure qu'elles arrivent :
 * il ne porte jamais de pastille. Les « vues » sont synchronisées, si bien
 * qu'un dividende regardé sur le téléphone n'allume plus rien sur l'ordinateur.
 *
 * @returns {Set<string>} identifiants des onglets à signaler.
 */
export function usePastilles({ onglet, badges }) {
  const p = usePatrimoine();
  // Écrit par le calendrier financier à chaque actualisation (publications).
  const [evenements] = usePersistentState("calendrierEvenements", []);
  const [vues, setVues] = usePersistentState("pastillesVues", {});

  const nouveautes = useMemo(
    () =>
      nouveautesParOnglet({
        badges,
        bourse: p.bourse,
        evenements,
        compteEnrichies: p.compteEnrichies,
        subs: p.subs,
        contracts: p.contracts,
        strategyNotes: p.strategyNotes,
      }),
    [badges, p.bourse, evenements, p.compteEnrichies, p.subs, p.contracts, p.strategyNotes]
  );

  useEffect(() => {
    const ids = nouveautes[onglet];
    if (ids) setVues((v) => marquerVues(v, onglet, ids));
  }, [onglet, nouveautes, setVues]);

  return useMemo(() => {
    const avec = ongletsAvecPastille(nouveautes, vues);
    avec.delete(onglet);
    return avec;
  }, [nouveautes, vues, onglet]);
}
