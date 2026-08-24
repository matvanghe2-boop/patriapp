import { useEffect, useRef, useState } from "react";
import { useValeurAnimee } from "./ui";

/**
 * Affichage d'un montant en euros.
 *
 * Une seule primitive rassemble quatre traitements qui étaient jusqu'ici
 * absents ou éparpillés :
 *
 *  1. **Les centimes en retrait.** Sur un patrimoine à cinq chiffres, les
 *     centimes sont du bruit — mais les retirer serait mentir. Les composer
 *     plus petits et plus clairs les garde disponibles sans qu'ils disputent
 *     la lecture à l'ordre de grandeur.
 *  2. **Le compteur animé.** `useValeurAnimee` existait mais n'était branché
 *     que sur le patrimoine net de l'en-tête collant. Ailleurs, un ajout de
 *     150 € et une correction de 15 000 € produisaient exactement le même
 *     saut.
 *  3. **La pulsation.** Le compteur dit l'ampleur, pas le SENS. Un halo bref,
 *     vert ou rose, le dit en 400 ms.
 *  4. **Le mode Ghost.** Le caviardage remplace le floutage (voir
 *     `.ghost-blur` dans index.css) : le flou conservait la longueur du
 *     nombre, ce qui suffisait à en deviner l'ordre de grandeur.
 *
 * Aucune de ces quatre choses ne s'active par défaut au-delà du strict
 * formatage : un montant statique dans un tableau ne doit ni s'animer ni
 * pulser à chaque rendu.
 */

/**
 * Découpe un montant en ses trois parties affichables.
 *
 * Le formatage passe par `Intl` plutôt que par une découpe manuelle : c'est
 * lui qui connaît l'espace insécable des milliers en français, la virgule
 * décimale et la position du symbole.
 */
export function decouperMontant(valeur, decimales = 2) {
  const n = Number.isFinite(valeur) ? valeur : 0;
  const parties = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).formatToParts(n);

  const joindre = (...types) =>
    parties.filter((p) => types.includes(p.type)).map((p) => p.value).join("");

  return {
    // Signe, chiffres et séparateurs de milliers — sans le séparateur décimal,
    // qui est réinjecté à l'affichage avec les centimes.
    entier: joindre("minusSign", "plusSign", "integer", "group"),
    fraction: joindre("fraction"),
    devise: joindre("currency"),
  };
}

/**
 * @param {number} valeur      Montant en euros.
 * @param {number} decimales   Nombre de décimales affichées (0 = pas de centimes).
 * @param {boolean} anime      Interpole vers la nouvelle valeur.
 * @param {boolean} pulse      Halo coloré quand la valeur change.
 * @param {boolean} sensible   Masqué par le mode Ghost.
 */
export default function Montant({
  valeur,
  decimales = 0,
  anime = false,
  pulse = false,
  sensible = true,
  className = "",
  ...rest
}) {
  const brut = Number.isFinite(valeur) ? valeur : 0;
  const affichee = useValeurAnimee(anime ? brut : 0);
  const valeurRendue = anime ? affichee : brut;

  // Sens de la dernière variation, pour la pulsation. `null` au premier rendu :
  // une valeur qui apparaît n'a pas varié.
  const [sens, setSens] = useState(null);
  const precedente = useRef(brut);
  const minuterie = useRef(null);

  useEffect(() => {
    if (!pulse) return undefined;
    const avant = precedente.current;
    precedente.current = brut;
    if (avant === brut) return undefined;
    setSens(brut > avant ? "hausse" : "baisse");
    clearTimeout(minuterie.current);
    // Le halo doit s'éteindre, sinon une valeur qui ne bouge plus reste
    // colorée et le signal perd tout son sens.
    minuterie.current = setTimeout(() => setSens(null), 700);
    return () => clearTimeout(minuterie.current);
  }, [brut, pulse]);

  const { entier, fraction, devise } = decouperMontant(valeurRendue, decimales);

  return (
    <span
      {...rest}
      data-sens={sens || undefined}
      className={`font-data tabular-nums ${sensible ? "ghost-blur" : ""} ${pulse ? "valeur-pulsante" : ""} ${className}`}
    >
      {entier}
      {decimales > 0 && <span className="montant-centimes">,{fraction}</span>}
      <span className="montant-devise">&nbsp;{devise}</span>
    </span>
  );
}
