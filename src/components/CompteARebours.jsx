import { useEffect, useState } from "react";

/**
 * Compte à rebours en cases, qui se tend à l'approche de l'échéance.
 *
 * « Dans 3 jours » se lit sans se ressentir. Des cases qui défilent — jours,
 * heures, minutes, et les secondes le dernier jour — rendent une date limite
 * concrète : c'est le dernier jour utile d'un préavis, la veille d'un
 * détachement de dividende. La tension monte par paliers : neutre au-delà
 * d'une semaine, ambre dans la semaine, rose et battante le dernier jour.
 *
 * Le texte complet est donné aux lecteurs d'écran une fois pour toutes ; les
 * cases, qui changent chaque seconde, leur sont cachées.
 *
 * @param {Date} cible  L'instant visé.
 */
export default function CompteARebours({ cible }) {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const reste = Math.max(0, cible.getTime() - maintenant);
  const dernierJour = reste < 86_400_000;

  useEffect(() => {
    // Une fois par seconde le dernier jour, une fois par minute avant :
    // inutile de réveiller la page pour des secondes qu'on n'affiche pas.
    const t = setInterval(() => setMaintenant(Date.now()), dernierJour ? 1000 : 30_000);
    return () => clearInterval(t);
  }, [dernierJour]);

  const jours = Math.floor(reste / 86_400_000);
  const heures = Math.floor((reste % 86_400_000) / 3_600_000);
  const minutes = Math.floor((reste % 3_600_000) / 60_000);
  const secondes = Math.floor((reste % 60_000) / 1000);
  const tension = reste === 0 ? "echue" : dernierJour ? "imminente" : jours < 7 ? "proche" : "calme";

  const cases = dernierJour
    ? [
        [heures, "h"],
        [minutes, "min"],
        [secondes, "s"],
      ]
    : [
        [jours, jours > 1 ? "jours" : "jour"],
        [heures, "h"],
        [minutes, "min"],
      ];

  // Le libellé de l'échéance est déjà écrit à côté : le texte lu ne redit
  // que le temps restant.
  const texte =
    reste === 0
      ? "Échéance atteinte"
      : `Temps restant : ${jours > 0 ? `${jours} j ` : ""}${heures} h ${minutes} min`;

  return (
    <div className="compte-a-rebours" data-tension={tension}>
      <span className="sr-only">{texte}</span>
      <div className="flex items-end gap-1.5" aria-hidden="true">
        {cases.map(([n, unite], i) => (
          <span key={unite} className="flex items-end gap-1.5">
            {i > 0 && <span className="car-separateur">:</span>}
            <span className="car-case">
              <span key={n} className="car-chiffre">
                {String(n).padStart(2, "0")}
              </span>
              <span className="car-unite">{unite}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
