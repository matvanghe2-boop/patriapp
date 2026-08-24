import { useEffect } from "react";
import { uid, todayIso, compactHistory } from "./finance";

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
export function useDailySnapshot({ patrimoineNet, setHistoryPast, lastSnapshotDate, setLastSnapshotDate }) {
  useEffect(() => {
    const today = todayIso();
    // Un patrimoine à 0 signifie presque toujours « données pas encore
    // chargées » plutôt qu'un patrimoine réellement nul : on ne fige pas ça
    // dans l'historique.
    if (!Number.isFinite(patrimoineNet) || patrimoineNet <= 0) return;

    const valeur = Math.round(patrimoineNet);
    const label = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

    setHistoryPast((h) => {
      const existant = h.find((p) => p.date === today);

      /*
       * LE POINT DU JOUR SUIT LA VALEUR, IL N'EST PAS FIGÉ À LA PREMIÈRE
       * OUVERTURE.
       *
       * L'ancienne version sortait dès que la journée avait son relevé. Le
       * point gardait donc la valeur qu'avait le patrimoine au moment précis
       * où l'application avait été ouverte — c'est-à-dire avec les cours
       * ENCORE EN CACHE, parfois vieux de plusieurs jours. Actualiser les
       * cours dix minutes plus tard ne le corrigeait pas.
       *
       * Conséquence visible, et c'est le bug rapporté : ouvrir l'app un samedi
       * enregistrait les cours de jeudi ; le dimanche, après une actualisation
       * faite entre-temps, enregistrait la clôture de vendredi. Le calendrier
       * affichait donc une variation le DIMANCHE, jour où les marchés sont
       * fermés et où rien n'avait bougé — l'écart était en réalité celui de
       * vendredi, arrivé avec un jour de retard.
       *
       * Un point daté du jour J doit porter la meilleure valeur connue pour
       * J, pas la première.
       */
      if (existant) {
        if (existant.value === valeur) return h;
        return h.map((p) => (p.date === today ? { ...p, value: valeur } : p));
      }

      // Le compactage s'applique une fois par jour à TOUT l'historique, et non
      // seulement au point qu'on vient d'ajouter : un historique déjà long
      // (restauré depuis une sauvegarde, ou accumulé avant l'introduction du
      // compactage) n'aurait jamais été réduit autrement.
      return compactHistory([...h, { id: uid(), label, value: valeur, date: today }]);
    });

    if (lastSnapshotDate !== today) setLastSnapshotDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patrimoineNet, lastSnapshotDate]);
}
