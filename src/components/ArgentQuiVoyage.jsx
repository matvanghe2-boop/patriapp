import { useEffect } from "react";
import { CreditCard, TrendingUp, PiggyBank } from "lucide-react";
import Montant from "./Montant";
import { nombreDePiecesEnVol } from "../lib/voyage";
import "./ArgentQuiVoyage.css";

/**
 * La scène d'un versement (voir lib/voyage.js) : deux petites cartes — d'où
 * part l'argent, où il arrive — et des pièces qui volent en arc de l'une à
 * l'autre. Trois secondes, puis elle repart seule.
 *
 * Les cartes du compte courant, du PEA et des livrets ne sont jamais sur le
 * même écran au moment où l'on enregistre un versement : la scène les réunit
 * le temps du trajet. Elle ne bloque rien (aucun clic ne lui est destiné) et
 * ne dit rien que le message de confirmation n'ait déjà dit : elle est donc
 * masquée aux lecteurs d'écran, et n'existe qu'en effets vivants.
 *
 * Chargée à la demande, avec sa feuille de style : la première pièce ne pèse
 * rien tant qu'aucun versement n'a été enregistré.
 */
const DUREE_MS = 3300;

export default function ArgentQuiVoyage({ voyage, onFin }) {
  useEffect(() => {
    const t = setTimeout(onFin, DUREE_MS);
    return () => clearTimeout(t);
  }, [onFin]);

  const pieces = nombreDePiecesEnVol(voyage.montant);
  const Arrivee = voyage.genre === "livret" ? PiggyBank : TrendingUp;

  return (
    <div className="voyage" data-genre={voyage.genre || "bourse"} aria-hidden="true" style={{ "--duree": `${DUREE_MS}ms` }}>
      <div className="voyage-carte voyage-depart">
        <span className="voyage-picto">
          <CreditCard size={16} />
        </span>
        <span className="voyage-nom">{voyage.de}</span>
      </div>

      <div className="voyage-piste">
        {Array.from({ length: pieces }, (_, i) => (
          <span key={i} className="voyage-piece" style={{ "--i": i, "--arc": `${46 + ((i * 37) % 44)}px` }}>
            <span className="voyage-piece-arc">
              <span className="voyage-piece-disque" />
            </span>
          </span>
        ))}
      </div>

      <div className="voyage-carte voyage-arrivee" style={{ "--n": pieces }}>
        <span className="voyage-picto">
          <Arrivee size={16} />
        </span>
        <span className="voyage-nom">{voyage.vers}</span>
        <span className="voyage-montant">
          +<Montant valeur={voyage.montant} decimales={0} />
        </span>
      </div>
    </div>
  );
}
