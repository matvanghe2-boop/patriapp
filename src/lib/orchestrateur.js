/**
 * Horizon — boucle d'orchestration (§7 de HORIZON_SPEC.md).
 *
 * Enchaîne appel au modèle → exécution des outils → réinjection des résultats,
 * jusqu'à une réponse textuelle. Le modèle décide quoi appeler ; le calcul
 * reste dans `horizon.js`.
 *
 * Trois comportements méritent d'être connus :
 *
 *  - **Repli automatique.** Sur quota épuisé ou fournisseur indisponible, la
 *    boucle passe au suivant de la chaîne en conservant l'historique. Si tous
 *    échouent, elle lève `ErreurModeDegrade` : l'appelant retombe alors sur le
 *    simulateur à formulaires, qui n'a besoin d'aucun modèle.
 *  - **Suspension.** `demander_hypothese` interrompt la boucle et rend la main
 *    à l'interface, qui pose la question et relance avec l'historique intact.
 *  - **Journal.** Chaque appel est consigné avec ses entrées et ses sorties.
 *    C'est ce qui rend la réponse auditable plutôt que magique.
 */

// Extensions `.js` explicites : ces modules sont aussi chargés par la fonction
// serverless `api/advisor.js`, et Node n'infère pas l'extension en ESM là où
// Vite le fait. Sans elles, la route plante au démarrage en production.
import { ErreurQuota, ErreurFournisseur } from "./adaptateursLLM.js";
import { REGISTRE_OUTILS, schemasOutils, executerOutil, trouverOutil, PROMPT_SYSTEME } from "./horizonOutils.js";

/** Plus aucun fournisseur gratuit disponible : l'appelant doit dégrader. */
export class ErreurModeDegrade extends Error {
  constructor(echecs = []) {
    super("Aucun fournisseur gratuit disponible. Utilise le simulateur à formulaires.");
    this.name = "ErreurModeDegrade";
    this.echecs = echecs;
  }
}

export const MAX_ITERATIONS = 12;

/**
 * Exécute la boucle jusqu'à obtenir une réponse ou une question.
 *
 * @param {object}   options
 * @param {Array}    options.adaptateurs  Chaîne de repli, du préféré au dernier.
 * @param {object}   options.contexte     Contexte anonymisé (base 100).
 * @param {Array}    options.messages     Historique interne de la conversation.
 * @param {Function} options.onEtape      Rappel de progression (facultatif).
 * @returns {Promise<{type: "texte"|"question", contenu?, question?, journal, fournisseur, iterations}>}
 */
export async function executerBoucle({
  adaptateurs = [],
  contexte = {},
  messages = [],
  registre = REGISTRE_OUTILS,
  systeme = PROMPT_SYSTEME,
  maxIterations = MAX_ITERATIONS,
  onEtape = null,
} = {}) {
  if (!adaptateurs.length) throw new ErreurModeDegrade([]);

  const outils = schemasOutils(registre);
  const journal = [];
  const echecs = [];
  const historique = [...messages];

  let indexAdaptateur = 0;
  let adaptateur = adaptateurs[0];

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    let reponse;
    try {
      onEtape?.({ etape: "requete_modele", iteration, fournisseur: adaptateur.nom });
      reponse = await adaptateur.envoyer({ systeme, messages: historique, outils });
    } catch (err) {
      if (!(err instanceof ErreurQuota || err instanceof ErreurFournisseur)) throw err;

      echecs.push({ fournisseur: adaptateur.nom, motif: err.name, message: err.message });
      indexAdaptateur += 1;
      if (indexAdaptateur >= adaptateurs.length) throw new ErreurModeDegrade(echecs);

      adaptateur = adaptateurs[indexAdaptateur];
      onEtape?.({ etape: "repli", iteration, fournisseur: adaptateur.nom, motif: err.name });
      // L'itération est rejouée sur le fournisseur suivant : elle ne compte pas
      // comme un tour perdu du point de vue du raisonnement.
      iteration -= 1;
      continue;
    }

    if (reponse.type === "texte") {
      return {
        type: "texte",
        contenu: reponse.contenu,
        journal,
        fournisseur: adaptateur.nom,
        iterations: iteration,
        echecs,
      };
    }

    // Le modèle demande des outils. On enregistre son tour avant d'exécuter,
    // pour que l'historique reste cohérent même si un outil échoue.
    historique.push({ role: "assistant", appels: reponse.appels });

    // Une demande d'hypothèse suspend tout : inutile d'exécuter les autres
    // appels du même tour, ils reposeraient sur une donnée manquante.
    const suspension = reponse.appels.find((a) => trouverOutil(a.nom, registre)?.suspendLaBoucle);
    if (suspension) {
      journal.push({ outil: suspension.nom, entrees: suspension.arguments, sorties: null, suspension: true });
      return {
        type: "question",
        question: suspension.arguments,
        historique,
        journal,
        fournisseur: adaptateur.nom,
        iterations: iteration,
        echecs,
      };
    }

    for (const appel of reponse.appels) {
      onEtape?.({ etape: "outil", iteration, outil: appel.nom });
      const sorties = executerOutil(appel.nom, appel.arguments, contexte, registre);
      journal.push({ outil: appel.nom, entrees: appel.arguments, sorties });
      historique.push({
        role: "outil",
        idAppel: appel.id,
        nomOutil: appel.nom,
        contenu: sorties,
      });
    }
  }

  // Plafond atteint : on rend ce qu'on a plutôt que de boucler indéfiniment.
  return {
    type: "texte",
    contenu:
      "Je n'ai pas abouti dans le nombre d'étapes imparti. Voici les calculs déjà effectués — " +
      "reformule ta question de façon plus ciblée pour aller au bout.",
    journal,
    fournisseur: adaptateur.nom,
    iterations: maxIterations,
    plafondAtteint: true,
    echecs,
  };
}

/**
 * Ajoute la réponse de l'utilisateur à une question posée par le modèle, et
 * renvoie l'historique prêt à relancer la boucle.
 */
export function repondreAHypothese(historique, question, reponse) {
  return [
    ...historique,
    {
      role: "utilisateur",
      contenu: `Réponse à « ${question?.question ?? "la question posée"} » : ${reponse}`,
    },
  ];
}
