import { uid, todayIso } from "./finance";

/**
 * Historique des publications résumées, par entreprise.
 *
 * POURQUOI CONSERVER PLUTÔT QUE RÉSUMER À LA DEMANDE
 *
 * Un résumé isolé dit ce que l'entreprise annonce. Il ne dit pas si elle
 * change d'avis, ni si elle tient parole — et c'est précisément là que se
 * trouve l'information utile. En gardant chaque publication, on peut :
 *
 *   - comparer la guidance du jour à la précédente, donc savoir si elle est
 *     relevée, maintenue ou abaissée ;
 *   - confronter ce qui avait été promis à ce qui a été réalisé, donc mesurer
 *     la crédibilité de l'entreprise sur la durée.
 *
 * Le résumé lui-même sert aussi de cache : un appel au fournisseur de modèle
 * coûte du quota, et le texte d'un communiqué publié ne change plus.
 *
 * Tout vit dans le navigateur, comme le reste des données patrimoniales.
 */

/** Clé d'une publication : une par société et par document. */
export function clePublication(ticker, lienOuTexte = "") {
  const empreinte = String(lienOuTexte).slice(0, 160);
  return `${String(ticker).toUpperCase()}::${empreinte}`;
}

/**
 * Ajoute une publication, ou remplace celle qui porte la même clé.
 * Les plus récentes d'abord : c'est l'ordre dans lequel on les lit.
 */
export function enregistrerPublication(liste = [], publication) {
  if (!publication?.ticker || !publication?.date) return liste;
  const cle = publication.cle || clePublication(publication.ticker, publication.lien || publication.resume);
  const entree = { id: publication.id || uid(), ...publication, cle };
  return [entree, ...liste.filter((p) => p.cle !== cle)].sort((a, b) =>
    a.date === b.date ? 0 : a.date > b.date ? -1 : 1
  );
}

/** Publications d'une société, de la plus récente à la plus ancienne. */
export function publicationsDe(liste = [], ticker) {
  const t = String(ticker || "").toUpperCase();
  return liste.filter((p) => String(p.ticker).toUpperCase() === t);
}

/**
 * Guidance en vigueur AVANT une date donnée, pour pouvoir comparer la
 * nouvelle à celle qu'elle remplace.
 *
 * On remonte à la publication précédente qui en portait une : toutes n'en
 * contiennent pas, et sauter celles qui n'en ont pas évite de conclure
 * « initiale » à chaque communiqué muet sur les perspectives.
 */
export function guidancePrecedente(liste = [], ticker, avantDate = todayIso()) {
  return (
    publicationsDe(liste, ticker)
      .filter((p) => p.date < avantDate && p.guidance)
      .map((p) => p.guidance)[0] || null
  );
}

/**
 * Historique exploitable par `tenueDesGuidances` : ce qui avait été annoncé,
 * et ce qui a été réalisé ensuite.
 *
 * Le réalisé est renseigné à la main sur une publication passée (« voici le
 * chiffre final »). Sans lui, l'exercice est ignoré du calcul plutôt que
 * compté comme manqué — on ne sait pas, et le dire vaut mieux que de trancher.
 */
export function historiqueGuidances(liste = [], ticker) {
  return publicationsDe(liste, ticker)
    .filter((p) => p.guidance)
    .map((p) => ({
      periode: p.periode || p.date,
      guidance: p.guidance,
      realise: p.realise ?? null,
    }));
}

/** Libellé lisible d'une évolution de guidance. */
export function libelleEvolution(sens) {
  return (
    {
      relevee: "Guidance relevée",
      abaissee: "Guidance abaissée",
      maintenue: "Guidance maintenue",
      initiale: "Première guidance",
      inconnue: "Pas de guidance",
    }[sens] || "Pas de guidance"
  );
}

/** Teinte associée, pour que le sens se lise sans avoir à lire le mot. */
export function tonEvolution(sens) {
  if (sens === "relevee") return "text-emerald-400";
  if (sens === "abaissee") return "text-rose-400";
  if (sens === "maintenue") return "text-slate-300";
  return "text-slate-500";
}

/** Retire une publication de l'historique. */
export function retirerPublication(liste = [], id) {
  return liste.filter((p) => p.id !== id);
}
