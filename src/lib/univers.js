/**
 * Univers du screener — manifeste et chargement des instantanés.
 *
 * Les fondamentaux ne sont plus récupérés à la demande titre par titre. Ils
 * sont générés hors ligne une fois par semaine
 * (`scripts/rafraichir-univers.mjs`), servis comme actifs statiques depuis
 * `public/univers/`, et filtrés dans le navigateur.
 *
 * Ce que ça change, concrètement : screener 200 titres prenait plusieurs
 * secondes et une vingtaine d'appels réseau ; c'est désormais instantané et
 * sans aucun appel. Et surtout, l'échelle cesse d'être un problème — le seul
 * quota de `/api/market?action=screen` (20 requêtes/minute) rendait tout
 * univers de plus de quelques centaines de titres structurellement
 * inatteignable.
 *
 * `indexConstituents.js` continue d'exister à côté : `IndicesWidget` y lit les
 * composants d'un indice pour en tirer les meilleures et pires performances du
 * jour, ce qui demande des cours en direct et non des fondamentaux figés.
 */

import { decoderInstantane } from "../../shared/universSnapshot";

/**
 * Univers déclarés.
 *
 * `disponible: false` = le fichier de composition n'a pas encore été fourni.
 * L'entrée reste visible dans l'interface, désactivée et expliquée, plutôt que
 * masquée : c'est une fonctionnalité en attente d'une donnée, pas une absence.
 */
export const UNIVERS = [
  {
    cle: "sbf120",
    libelle: "SBF 120",
    zone: "France",
    description: "Les 120 premières capitalisations françaises — CAC 40, Next 20 et Mid 60.",
    disponible: true,
  },
  {
    cle: "fr-small",
    libelle: "Small caps FR",
    zone: "France",
    description:
      "Petites et moyennes valeurs françaises hors SBF 120. Couverture de données plus lacunaire, mais c'est là que le marché regarde le moins.",
    disponible: true,
  },
  {
    cle: "stoxx600",
    libelle: "STOXX Europe 600",
    zone: "Europe",
    description:
      "Les 600 principales valeurs européennes. Environ deux tiers sont éligibles au PEA — le Royaume-Uni et la Suisse n'en font plus partie.",
    disponible: true,
  },
  {
    cle: "russell2000",
    libelle: "Russell 2000",
    zone: "États-Unis",
    description:
      "Près de 2 000 small caps américaines. Aucune n'est éligible au PEA : à réserver à un compte-titres ordinaire. Rafraîchi à la demande et non chaque semaine — ses données peuvent donc dater de plusieurs mois.",
    disponible: true,
    // Hors du lot hebdomadaire (voir .github/workflows/univers.yml) : c'est
    // l'univers le plus lourd et le moins consulté. La date de génération
    // affichée sous le sélecteur reste la source de vérité sur sa fraîcheur.
    rafraichiALaDemande: true,
  },
];

export function universParCle(cle) {
  return UNIVERS.find((u) => u.cle === cle) ?? null;
}

// Un instantané chargé le reste pour la durée de la session : c'est un fichier
// statique versionné par le déploiement, il ne peut pas changer sous nos pieds.
const cache = new Map();

/**
 * Charge un instantané d'univers.
 *
 * @returns {Promise<{titres: Array, genereLe: string|null, libelle: string}>}
 * @throws  si le fichier est absent — cas normal pour un univers dont la
 *          composition n'a pas encore été déposée.
 */
export async function chargerUnivers(cle) {
  if (cache.has(cle)) return cache.get(cle);

  const promesse = (async () => {
    const reponse = await fetch(`/univers/${cle}.json`);
    // En développement sans build, une route inconnue renvoie l'index HTML
    // avec un statut 200 : vérifier `res.ok` ne suffit pas, il faut contrôler
    // la forme de ce qu'on a reçu (même piège que pour /api/rates).
    const corps = await reponse.json().catch(() => null);
    if (!reponse.ok || !corps?.colonnes) {
      throw new Error(
        "Univers indisponible. Lance `npm run univers` pour générer les instantanés."
      );
    }
    return {
      titres: decoderInstantane(corps),
      genereLe: corps.genereLe ?? null,
      libelle: corps.libelle ?? cle,
    };
  })();

  cache.set(cle, promesse);
  // Un échec ne doit pas être mémorisé : le prochain essai doit pouvoir
  // retenter, sans quoi une coupure réseau condamnerait l'univers pour toute
  // la session.
  promesse.catch(() => cache.delete(cle));
  return promesse;
}

/**
 * Tranches de capitalisation, pour le pré-filtrage.
 *
 * Indispensable dès qu'un univers dépasse quelques centaines de titres : c'est
 * le filtre qui transforme une liste en question précise. « Small caps
 * françaises, rentables, peu chères » n'a de sens qu'avec une borne haute de
 * capitalisation.
 */
export const TRANCHES_CAPITALISATION = [
  { cle: "toutes", libelle: "Toutes", min: null, max: null },
  { cle: "micro", libelle: "< 300 M€", min: null, max: 300e6 },
  { cle: "small", libelle: "300 M€ – 2 Md€", min: 300e6, max: 2e9 },
  { cle: "mid", libelle: "2 – 10 Md€", min: 2e9, max: 10e9 },
  { cle: "large", libelle: "> 10 Md€", min: 10e9, max: null },
];

/** Applique les pré-filtres à un univers décodé. */
export function appliquerPrefiltres(titres, { tranche = "toutes", secteur = "", peaSeul = false } = {}) {
  const bornes = TRANCHES_CAPITALISATION.find((t) => t.cle === tranche) ?? TRANCHES_CAPITALISATION[0];

  return (titres || []).filter((t) => {
    if (peaSeul && !t.eee) return false;
    if (secteur && t.secteur !== secteur) return false;
    if (bornes.min != null || bornes.max != null) {
      // Une capitalisation non publiée ne peut pas être classée : l'exclure
      // d'un filtre de taille est le seul comportement honnête, puisqu'on ne
      // sait pas de quel côté de la borne elle tombe.
      if (!Number.isFinite(t.capitalisation)) return false;
      if (bornes.min != null && t.capitalisation < bornes.min) return false;
      if (bornes.max != null && t.capitalisation >= bornes.max) return false;
    }
    return true;
  });
}

/** Secteurs présents dans un univers, triés, pour alimenter le filtre. */
export function secteursDisponibles(titres) {
  return [...new Set((titres || []).map((t) => t.secteur).filter(Boolean))].sort();
}
