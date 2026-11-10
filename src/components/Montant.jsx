import { useEffect, useRef, useState } from "react";
import { useValeurAnimee, RouleauChiffre, mouvementReduit } from "./ui";

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
    /**
     * La partie entière découpée en fragments, pour pouvoir atténuer les seuls
     * SÉPARATEURS de milliers.
     *
     * Les centimes sont déjà en retrait ; le même traitement appliqué aux
     * espaces de groupement rend un grand nombre lisible d'un coup d'œil — on
     * compte les paquets de trois au lieu de compter les chiffres. Atténuer les
     * chiffres eux-mêmes serait une faute : ils portent l'information.
     *
     * L'espace insécable vient d'`Intl`, pas de nous : le séparateur français
     * en est un, et le remplacer par une espace ordinaire autoriserait un
     * retour à la ligne au milieu d'un montant.
     */
    fragments: parties
      .filter((p) => ["minusSign", "plusSign", "integer", "group"].includes(p.type))
      .map((p) => ({ texte: p.value, separateur: p.type === "group" })),
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
 * @param {boolean} rouleaux   Chiffres en rouleaux d'odomètre (implique `anime`).
 * @param {number}  depart     Valeur d'où le montant part à l'apparition, au
 *                             lieu d'être simplement là : la dernière visite,
 *                             par exemple. Le trajet dit alors de combien il a
 *                             bougé entre-temps.
 */
export default function Montant({
  valeur,
  decimales = 0,
  anime = false,
  pulse = false,
  sensible = true,
  rouleaux = false,
  depart,
  className = "",
  ...rest
}) {
  const brut = Number.isFinite(valeur) ? valeur : 0;
  const anim = anime || rouleaux;

  // La cible commence à `depart` quand il y en a un, puis rejoint la vraie
  // valeur peu après l'apparition : c'est ce changement de cible que
  // `useValeurAnimee` fait filer. Ensuite, la cible suit la valeur.
  const avecDepart = anim && Number.isFinite(depart) && depart !== brut && !mouvementReduit();
  const [parti, setParti] = useState(!avecDepart);
  const [trajetLong, setTrajetLong] = useState(avecDepart);
  const noeud = useRef(null);
  useEffect(() => {
    if (parti) return undefined;
    // Le trajet attend que le montant soit À L'ÉCRAN, puis le temps que sa
    // carte finisse d'entrer : partir avant, c'est rouler pendant que
    // personne ne regarde — le patrimoine net est sous la ligne de flottaison
    // sur un téléphone.
    let t;
    const partir = () => {
      t = setTimeout(() => setParti(true), 520);
    };
    if (typeof IntersectionObserver === "undefined" || !noeud.current) {
      partir();
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entrees) => {
        if (!entrees.some((e) => e.isIntersecting)) return;
        io.disconnect();
        partir();
      },
      { threshold: 0.6 }
    );
    io.observe(noeud.current);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, [parti]);
  useEffect(() => {
    if (!trajetLong || !parti) return undefined;
    const t = setTimeout(() => setTrajetLong(false), DUREE_TRAJET_MS);
    return () => clearTimeout(t);
  }, [trajetLong, parti]);
  const cible = parti ? brut : depart;

  const affichee = useValeurAnimee(anim ? cible : 0, { duree: trajetLong ? DUREE_TRAJET_MS : undefined });
  const valeurRendue = anim ? affichee : brut;

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

  const { fragments, fraction, devise } = decouperMontant(valeurRendue, decimales);

  if (rouleaux) {
    // Le texte entier reste lisible par les lecteurs d'écran et copiable ; les
    // rouleaux, dix chiffres empilés par colonne, ne sont qu'un dessin.
    const { fragments: vrais, fraction: vraieFraction, devise: vraieDevise } = decouperMontant(brut, decimales);
    const texteComplet = `${vrais.map((f) => f.texte).join("")}${decimales > 0 ? `,${vraieFraction}` : ""} ${vraieDevise}`;
    const roule = !mouvementReduit();
    let rang = 0;
    const rouler = (texte, cle) =>
      [...texte].map((c, i) =>
        /\d/.test(c) ? (
          <RouleauChiffre key={`${cle}${i}`} chiffre={c} anime={roule} index={rang++} />
        ) : (
          <span key={`${cle}${i}`}>{c}</span>
        )
      );
    return (
      <span
        {...rest}
        ref={noeud}
        data-sens={sens || undefined}
        className={`font-data tabular-nums ${sensible ? "ghost-blur" : ""} ${pulse ? "valeur-pulsante" : ""} ${className}`}
      >
        <span className="sr-only">{texteComplet}</span>
        <span aria-hidden="true" className="select-none inline-flex items-baseline">
          {fragments.map((f, i) =>
            f.separateur ? (
              <span key={`g${i}`} className="montant-groupe">{f.texte}</span>
            ) : (
              <span key={`e${i}`} className="inline-flex items-baseline">{rouler(f.texte, `e${i}-`)}</span>
            )
          )}
          {decimales > 0 && <span className="montant-centimes inline-flex items-baseline">,{rouler(fraction, "c")}</span>}
          <span className="montant-devise">&nbsp;{devise}</span>
        </span>
      </span>
    );
  }

  return (
    <span
      {...rest}
      ref={noeud}
      data-sens={sens || undefined}
      className={`font-data tabular-nums ${sensible ? "ghost-blur" : ""} ${pulse ? "valeur-pulsante" : ""} ${className}`}
    >
      {fragments.map((f, i) =>
        f.separateur ? (
          <span key={i} className="montant-groupe">{f.texte}</span>
        ) : (
          f.texte
        )
      )}
      {decimales > 0 && <span className="montant-centimes">,{fraction}</span>}
      <span className="montant-devise">&nbsp;{devise}</span>
    </span>
  );
}

/** Durée du trajet depuis la valeur de départ : plus long qu'une simple mise à jour. */
const DUREE_TRAJET_MS = 1500;
