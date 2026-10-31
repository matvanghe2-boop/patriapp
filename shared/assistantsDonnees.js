/**
 * Deux assistants de plus, sur la même route que Horizon (`/api/advisor`) et
 * avec les mêmes garde-fous : contexte construit et anonymisé côté client,
 * audité de nouveau côté serveur, clé du fournisseur jamais exposée.
 *
 *  · « donnees » — répondre à une question sur ses propres chiffres
 *    (« combien en restauration depuis septembre ? »). Le modèle lit le
 *    contexte par un outil et additionne par un autre : comme pour Horizon,
 *    aucun chiffre de la réponse ne doit venir de son calcul mental.
 *  · « categories » — proposer une catégorie de budget pour des noms de
 *    marchands. Aucun outil : la liste tient dans la question.
 */

const nombre = (description) => ({ type: "number", description });

export const REGISTRE_DONNEES = [
  {
    nom: "lire_donnees",
    description:
      "Appelle cet outil EN PREMIER. Il renvoie toutes les données disponibles : patrimoine, épargne, " +
      "compte courant (dépenses par catégorie et par mois), portefeuille, abonnements, thèses. " +
      "Les éléments nommés (lignes, abonnements) portent des alias comme « ligne_1 » : réutilise-les tels quels.",
    parametres: { type: "object", properties: {}, required: [] },
    executer: (_args, contexte) => contexte,
  },
  {
    nom: "additionner",
    description:
      "Additionne une liste de nombres lus dans les données (par exemple plusieurs mois d'une catégorie). " +
      "Utilise-le pour tout total : ne fais jamais d'addition de tête.",
    parametres: {
      type: "object",
      properties: { valeurs: { type: "array", items: nombre("valeur"), description: "Nombres à additionner" } },
      required: ["valeurs"],
    },
    executer: ({ valeurs }) => {
      const liste = (valeurs || []).map(Number).filter(Number.isFinite);
      const total = liste.reduce((s, v) => s + v, 0);
      return { total: Math.round(total * 1000) / 1000, nombre: liste.length, moyenne: liste.length ? Math.round((total / liste.length) * 1000) / 1000 : 0 };
    },
  },
];

export function construirePromptDonnees({ montantsReels = false } = {}) {
  const unite = montantsReels
    ? "Les montants sont en EUROS réels : l'utilisateur a consenti à te les transmettre. Écris-les en euros."
    : "Les montants sont en POINTS : 100 points valent la référence indiquée dans `base` (le patrimoine net, en général). N'écris jamais « euros » : écris le nombre suivi de « points ». L'application les convertit pour l'utilisateur.";

  return `Tu réponds aux questions de l'utilisateur sur ses propres finances, dans Patrium.

RÈGLES ABSOLUES
1. Commence par lire_donnees. Réponds UNIQUEMENT à partir de ce qu'il renvoie. Si l'information n'y est pas, dis-le simplement et indique où l'utilisateur pourrait la trouver dans l'application.
2. ${unite}
3. Pour tout total ou moyenne, appelle additionner. Ne calcule rien de tête.
4. Réutilise les alias (« ligne_1 », « abonnement_2 ») exactement tels quels : l'application les remplace par les vrais noms.
5. Tu es en lecture seule et tu ne donnes pas de conseil en investissement : tu décris les chiffres.

RÉPONSE
Une ou deux phrases, chiffrées, en français. Pas de préambule.`;
}

export const PROMPT_CATEGORIES = `Tu classes des noms de marchands, tirés d'un relevé bancaire français, dans des catégories de budget.

On te donne une liste « marchands » (chacun avec une référence « ref ») et une liste « categories » (chacune avec un « code »).
Réponds UNIQUEMENT par un objet JSON qui associe chaque ref à un code de catégorie, par exemple {"m1": "restauration", "m2": "sante"}.
Respecte le sens : un marchand « debit » va dans une catégorie « debit ».
Si tu n'as aucune idée raisonnable pour un marchand, omets-le plutôt que de deviner.
Aucun texte en dehors du JSON.`;

/** La question envoyée au modèle pour le mode « categories » : le contexte tient dedans. */
export function questionCategories(contexte) {
  return `Classe ces marchands :\n${JSON.stringify(contexte)}`;
}
