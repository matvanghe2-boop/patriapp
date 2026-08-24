import {
  PiggyBank, TrendingUp, NotebookPen, Repeat, Target, Wallet, Search, CalendarDays,
} from "lucide-react";

/**
 * État vide, avec de quoi en sortir.
 *
 * `EmptyState` affichait une phrase grise dans un cadre pointillé. Or
 * l'application démarre VIDE, volontairement — c'est une décision assumée et
 * documentée, pour ne pas mélanger des chiffres inventés aux vrais. Le premier
 * écran que voit un nouvel arrivant est donc un état vide, et c'était le moins
 * soigné de tous.
 *
 * Trois éléments, et pas un de plus : un pictogramme au trait qui donne le
 * sujet, la phrase qui explique, et l'action qui débloque. C'est ce troisième
 * qui transforme un cul-de-sac en point de départ — un état vide sans issue
 * n'informe que d'une chose, c'est qu'on ne sait pas quoi faire.
 *
 * Le pictogramme est purement décoratif (`aria-hidden`) : il redit ce que la
 * phrase énonce déjà, et l'annoncer deux fois n'aide personne.
 */

const PICTOS = {
  epargne: PiggyBank,
  bourse: TrendingUp,
  notes: NotebookPen,
  abonnements: Repeat,
  objectifs: Target,
  liquidites: Wallet,
  recherche: Search,
  calendrier: CalendarDays,
};

export default function EtatVide({
  picto = "recherche",
  titre,
  children,
  action,
  className = "",
}) {
  const Icone = PICTOS[picto] || Search;
  return (
    <div className={`etat-vide ${className}`}>
      <span className="etat-vide-picto" aria-hidden="true">
        <Icone size={22} strokeWidth={1.5} />
      </span>
      {titre && <p className="etat-vide-titre">{titre}</p>}
      <p className="etat-vide-texte">{children}</p>
      {action && <div className="etat-vide-action">{action}</div>}
    </div>
  );
}
