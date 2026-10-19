import { useMemo } from "react";
import { usePersistentState } from "./storage";
import { todayIso } from "./finance";

/**
 * Rappels « c'est demain » pour les événements du calendrier financier.
 *
 * Monté au niveau de l'application, comme `useAlertesWatchlist` : un rappel
 * de résultats n'a aucun intérêt s'il ne se déclenche que lorsqu'on a déjà
 * ouvert l'onglet Calendrier — c'est-à-dire lorsqu'on a déjà vu la date.
 *
 * Les événements viennent de `calendrierEvenements`, écrit par l'onglet
 * Calendrier à chaque actualisation. On ne refait donc AUCUN appel réseau
 * ici : le calendrier est rafraîchi au plus une fois par heure côté serveur,
 * et redemander la même chose depuis un second endroit ne ferait que
 * consommer du quota pour une information déjà en mémoire.
 *
 * Conséquence assumée : sans ouverture de l'onglet Calendrier, il n'y a rien
 * à rappeler. C'est le même compromis que les alertes de watchlist, qui
 * s'appuient sur le dernier rafraîchissement de cours persisté.
 */

/** Lendemain d'une date ISO, en évitant les pièges de fin de mois. */
export function demain(iso = todayIso()) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Transforme en rappels les événements qui tombent demain.
 *
 * Les événements ESTIMÉS sont écartés : prévenir la veille d'une date qui
 * n'est qu'extrapolée reviendrait à annoncer un rendez-vous que personne n'a
 * fixé. Seules les dates confirmées — communiquées par la société ou
 * attestées par un dépôt réglementaire — déclenchent un rappel.
 */
export function rappelsPourDemain(evenements = [], aujourdhui = todayIso()) {
  const cible = demain(aujourdhui);
  return evenements
    .filter((e) => e?.date === cible && e?.statut === "confirme")
    .map((e) => ({
      id: `calendrier-${e.ticker}-${e.type}-${e.date}`,
      label: `Demain — ${e.ticker} : ${e.label || e.type}`,
      type: "calendrier",
      source: e.source || "portefeuille",
    }));
}

export function useRappelsCalendrier() {
  const [evenements] = usePersistentState("calendrierEvenements", []);
  const [actif] = usePersistentState("calendrierNotifVeille", false);

  return useMemo(() => {
    if (!actif || !Array.isArray(evenements)) return [];
    return rappelsPourDemain(evenements);
  }, [actif, evenements]);
}
