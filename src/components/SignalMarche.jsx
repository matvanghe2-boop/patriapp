import { useEffect, useState } from "react";
import { etatSeance } from "../lib/seance";

/**
 * Pastille « Marché ouvert » : un point qui respire pendant la séance
 * parisienne, éteint en dehors.
 *
 * Elle répond à la question qu'on se pose en ouvrant l'application un soir ou
 * un samedi : la variation affichée est-elle en train de bouger, ou figée
 * depuis la clôture ? Réévaluée chaque minute.
 */
const LIBELLES = {
  seance: "Marché ouvert",
  avant: "Ouverture à 9 h",
  apres: "Marché fermé",
  "week-end": "Marché fermé",
  ferie: "Férié boursier",
};

export function useSeance() {
  const [etat, setEtat] = useState(() => etatSeance());
  useEffect(() => {
    const t = setInterval(() => setEtat(etatSeance()), 60_000);
    return () => clearInterval(t);
  }, []);
  return etat;
}

export default function SignalMarche({ etat }) {
  return (
    <span
      className="signal-marche"
      data-ouvert={etat.ouvert ? "" : undefined}
      title={`Euronext Paris — ${LIBELLES[etat.raison]} (séance de 9 h à 17 h 30, heure de Paris)`}
    >
      <span className="signal-point" aria-hidden="true" />
      <span className="hidden lg:inline">{LIBELLES[etat.raison]}</span>
      <span className="sr-only lg:hidden">{LIBELLES[etat.raison]}</span>
    </span>
  );
}
