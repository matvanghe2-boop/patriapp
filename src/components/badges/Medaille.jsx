import { createElement } from "react";
import { HelpCircle } from "lucide-react";
import { rareteDe } from "../../lib/badges";
import { iconeDe } from "./iconesBadges";
import "./Medaille.css";

/** Matière CSS de chaque rareté (voir Medaille.css). */
const MATIERES = { commun: "bronze", "peu-commun": "argent", rare: "or", epique: "platine", legendaire: "diamant" };
const TAILLES_ICONE = { sm: 18, md: 28, lg: 46, xl: 62 };
/** Couches de la tranche : assez pour qu'elle se voie de profil, pas plus. */
const COUCHES = [0, 1, 2, 3, 4, 5];

/**
 * Une médaille en 3D : deux faces et une tranche faite de disques empilés,
 * qui pivotent ensemble. Tout est en `transform` : le compositeur s'en charge
 * sans recalculer la page.
 *
 * `anime` :
 *  · « tour »       — un tour complet en boucle (la célébration) ;
 *  · « balancement » — un lent va-et-vient, la médaille posée dans sa vitrine ;
 *  · rien           — immobile, avec un léger angle.
 * Un tour complet se joue aussi au survol. Mouvement réduit : tout s'arrête.
 *
 * Fermée, la médaille est grise ; un badge secret fermé ne montre qu'un « ? ».
 */
export default function Medaille({ badge, niveau = 1, ouverte = true, secrete = false, taille = "md", anime = null, className = "" }) {
  const rarete = rareteDe(badge, niveau);
  // Icône choisie par son nom : créée par `createElement`, pas déclarée ici.
  const icone = secrete && !ouverte ? HelpCircle : iconeDe(badge?.icone);
  const tailleIcone = TAILLES_ICONE[taille] || TAILLES_ICONE.md;
  return (
    <span
      className={`medaille ${className}`}
      data-matiere={ouverte ? MATIERES[rarete.id] : "fermee"}
      data-taille={taille}
      data-anime={anime || undefined}
      aria-hidden="true"
    >
      <span className="medaille-piece">
        {COUCHES.map((i) => (
          <span key={i} className="medaille-couche" style={{ "--i": i }} />
        ))}
        <span className="medaille-face medaille-avant">
          <span className="medaille-anneau" />
          {createElement(icone, { size: tailleIcone, strokeWidth: 2.2, className: "medaille-icone" })}
          <span className="medaille-reflet" />
        </span>
        <span className="medaille-face medaille-arriere">
          <span className="medaille-anneau" />
          <span className="medaille-chiffre">{ouverte ? rarete.matiere.slice(0, 1) : "?"}</span>
        </span>
      </span>
      {ouverte && rarete.id === "legendaire" && (
        <span className="medaille-eclats">
          <span />
          <span />
          <span />
        </span>
      )}
      <span className="medaille-ombre" />
    </span>
  );
}
