import { useEffect } from "react";
import { uid } from "./finance";

/**
 * Enregistre une fois par jour la valeur du patrimoine net dans l'historique.
 *
 * Ce relevé existait déjà, mais il vivait dans le composant Dashboard : il ne
 * se déclenchait donc que si l'utilisateur passait par cet onglet ce jour-là.
 * Quelqu'un qui ouvre l'app directement sur « PEA & Bourse » creusait un trou
 * dans sa propre courbe de patrimoine sans le savoir. Remonté au niveau de
 * l'app, le relevé est pris quel que soit l'onglet consulté.
 *
 * La date du dernier relevé passe aussi par l'état persistant (et donc par la
 * synchronisation cloud) plutôt que par un accès direct au localStorage :
 * sinon, chaque appareil re-crée son propre point pour la même journée.
 */
export function useDailySnapshot({ patrimoineNet, historyPast, setHistoryPast, lastSnapshotDate, setLastSnapshotDate }) {
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (lastSnapshotDate === today) return;
    // Un patrimoine à 0 signifie presque toujours « données pas encore
    // chargées » plutôt qu'un patrimoine réellement nul : on ne fige pas ça
    // dans l'historique.
    if (!Number.isFinite(patrimoineNet) || patrimoineNet <= 0) return;

    if (!historyPast.some((h) => h.date === today)) {
      const label = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      setHistoryPast((h) => [...h, { id: uid(), label, value: Math.round(patrimoineNet), date: today }]);
    }
    setLastSnapshotDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patrimoineNet, lastSnapshotDate]);
}
