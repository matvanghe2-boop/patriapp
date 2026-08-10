import { useEffect, useMemo } from "react";
import { usePersistentState } from "./storage";
import { rearmer, alertesDeclenchees, versRappel, acquitter } from "./alertes";

/**
 * Évalue les alertes de seuil de la watchlist au niveau de l'application.
 *
 * Placé ici plutôt que dans le composant Watchlist : une alerte doit se
 * déclencher quel que soit l'onglet ouvert, exactement comme le relevé
 * quotidien de patrimoine. Les cours proviennent du dernier rafraîchissement
 * persisté (`watchlistDailyData`), ce qui évite d'interroger le réseau à
 * chaque rendu.
 */
export function useAlertesWatchlist({ alertesWatchlist = [], setAlertesWatchlist }) {
  const [dailyData] = usePersistentState("watchlistDailyData", {});

  const coursParTicker = useMemo(() => {
    const map = {};
    for (const [ticker, d] of Object.entries(dailyData || {})) {
      if (Number.isFinite(d?.price)) map[ticker] = d.price;
    }
    return map;
  }, [dailyData]);

  // Réarmement : une alerte acquittée redevient active dès que le cours est
  // repassé de l'autre côté de son seuil. Sans cela, elle ne servirait qu'une
  // fois dans sa vie.
  useEffect(() => {
    if (alertesWatchlist.length === 0) return;
    const rearmees = rearmer(alertesWatchlist, coursParTicker);
    const aChange = rearmees.some((a, i) => a.acquittee !== alertesWatchlist[i].acquittee);
    if (aChange) setAlertesWatchlist(rearmees);
  }, [alertesWatchlist, coursParTicker, setAlertesWatchlist]);

  const rappels = useMemo(
    () => alertesDeclenchees(alertesWatchlist, coursParTicker).map(versRappel),
    [alertesWatchlist, coursParTicker]
  );

  const acquitterAlerte = (id) => setAlertesWatchlist((liste) => acquitter(liste, id));

  return { rappels, acquitterAlerte };
}
