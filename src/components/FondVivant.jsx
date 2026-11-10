import { appareilEconome } from "../lib/mouvement";

/**
 * Fond vivant : la teinte de l'onglet dérive lentement derrière le contenu.
 *
 * Trois nappes de couleur, de simples dégradés qui se déplacent (aucun flou ni
 * canvas : le compositeur s'en charge sans repeindre). Les deux premières
 * prennent les teintes du domaine ; la troisième dit l'HUMEUR de la séance —
 * un vert à peine plus chaud quand le portefeuille monte, un rose retenu quand
 * il baisse. Le chiffre de la variation reste écrit dans l'en-tête : la couleur
 * n'ajoute qu'une impression, elle n'informe jamais seule.
 *
 * Le calque est collant (`position: sticky`) et de hauteur nulle : il accompagne
 * le défilement sans occuper de place, et reste confiné à la zone de contenu au
 * lieu de déborder sur la barre latérale. Effets sobres : il disparaît ;
 * mouvement réduit ou appareil économe : il reste, immobile.
 */
export default function FondVivant({ humeur = "neutre" }) {
  return (
    <div className="fond-vivant" data-humeur={humeur} data-econome={appareilEconome() ? "" : undefined} aria-hidden="true">
      <div className="fond-vivant-scene">
        <span className="fond-vivant-nappe fond-vivant-a" />
        <span className="fond-vivant-nappe fond-vivant-b" />
        <span className="fond-vivant-nappe fond-vivant-c" />
      </div>
    </div>
  );
}
