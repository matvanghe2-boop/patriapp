import { withApi, httpError } from "./_lib/http.js";
import { exigerUtilisateur } from "./_lib/auth.js";
import { construireChaine } from "../shared/adaptateursLLM.js";
import { executerBoucle, ErreurModeDegrade } from "../shared/orchestrateur.js";
import { auditerContexte } from "../shared/anonymiser.js";
import { construirePromptSysteme } from "../shared/horizonOutils.js";
import {
  REGISTRE_DONNEES, construirePromptDonnees, PROMPT_CATEGORIES, questionCategories,
} from "../shared/assistantsDonnees.js";

/**
 * Trois assistants partagent cette route, et donc son contrôle d'identité, son
 * audit et sa limite de débit :
 *  · « horizon » (défaut) — simulation de projet, avec les outils d'Horizon ;
 *  · « donnees » — question sur ses propres chiffres (voir assistantsDonnees.js) ;
 *  · « categories » — catégorie de budget pour des noms de marchands.
 * Une route de plus aurait été une fonction serverless de plus, avec ses propres
 * garde-fous à tenir synchrones.
 */
const MODES = ["horizon", "donnees", "categories"];

/**
 * Assistant Horizon — orchestration côté serveur.
 *
 * Le navigateur envoie une question et un contexte DÉJÀ anonymisé (base 100,
 * voir `anonymiser.js`) ; cette route pilote la boucle d'outils et renvoie la
 * réponse accompagnée du journal des calculs.
 *
 * Pourquoi côté serveur : la clé du fournisseur ne doit jamais atteindre le
 * bundle client. C'est la seule raison — les outils eux-mêmes sont des
 * fonctions pures qui tourneraient aussi bien dans le navigateur.
 *
 * Aucun fournisseur payant n'est joignable depuis ici : `construireChaine` ne
 * sait instancier que Gemini, Groq et Ollama.
 */

// Deuxième filet, après celui du navigateur. Si un contexte contenant des
// montants réels arrive ici — bug côté client, appel forgé, futur mode B mal
// câblé — on refuse plutôt que de le transmettre au fournisseur.
const SEUIL_AUDIT = 1000;

async function handler(req, res) {
  // Contrôle d'identité AVANT tout : c'est la seule route de l'API dont l'abus
  // coûte quelque chose au propriétaire (quota du fournisseur de modèle). Le
  // contrôle d'origine ne suffit pas — une requête sans en-tête `Origin` est
  // légitime pour le navigateur comme pour un `curl`.
  await exigerUtilisateur(req);

  const { question, contexte, historique = [], montantsReels = false, mode = "horizon" } = req.body ?? {};

  if (!MODES.includes(mode)) {
    throw httpError(400, "Mode d'assistant inconnu.");
  }

  if (typeof question !== "string" || !question.trim()) {
    throw httpError(400, "Question manquante.");
  }
  if (!contexte || typeof contexte !== "object") {
    throw httpError(400, "Contexte manquant.");
  }

  // Le mode B doit être déclaré : sans déclaration, un contexte contenant des
  // montants est refusé. C'est ce qui empêche une fuite silencieuse de passer
  // pour un fonctionnement normal.
  const audit = auditerContexte(contexte, {
    seuilMontant: SEUIL_AUDIT,
    autoriserMontants: montantsReels === true,
  });
  if (!audit.sain) {
    // Le détail des alertes reste côté serveur : il contiendrait précisément
    // les valeurs qu'on refuse de laisser circuler.
    console.warn("Contexte refusé par l'audit :", audit.alertes.map((a) => a.chemin).join(", "));
    throw httpError(400, "Le contexte transmis contient des données non anonymisées. Requête refusée.");
  }

  const adaptateurs = construireChaine(process.env);
  if (!adaptateurs.length) {
    throw httpError(503, "Aucun fournisseur configuré. Le simulateur à formulaires reste disponible.");
  }

  // En mode « categories », le modèle n'a aucun outil pour lire le contexte :
  // la liste des marchands lui est donc donnée dans la question elle-même.
  const contenu = mode === "categories" ? questionCategories(contexte) : question;
  const messages = [...historique, { role: "utilisateur", contenu }];

  const parMode = {
    // L'unité annoncée au modèle doit suivre celle du contexte, sinon il
    // écrira « points » devant des euros, ou l'inverse.
    horizon: { systeme: construirePromptSysteme({ montantsReels: montantsReels === true }) },
    donnees: { systeme: construirePromptDonnees({ montantsReels: montantsReels === true }), registre: REGISTRE_DONNEES },
    categories: { systeme: PROMPT_CATEGORIES, registre: [], maxIterations: 2 },
  };

  try {
    const resultat = await executerBoucle({
      adaptateurs,
      contexte,
      messages,
      ...parMode[mode],
    });
    return res.status(200).json(resultat);
  } catch (err) {
    if (err instanceof ErreurModeDegrade) {
      return res.status(503).json({
        erreur: err.message,
        modeDegrade: true,
        echecs: err.echecs.map((e) => ({ fournisseur: e.fournisseur, motif: e.motif })),
      });
    }
    throw err;
  }
}

/**
 * Un raisonnement complet prend une trentaine de secondes en conditions
 * réelles : le plafond Vercel par défaut (10 s) tuerait la requête en plein
 * milieu, sans réponse. La boucle s'arrête d'elle-même à 50 s (BUDGET_MS),
 * ce qui laisse de la marge sous ce plafond.
 */
export const config = { maxDuration: 60 };

export default withApi(handler, {
  methods: ["POST"],
  // Une question déclenche jusqu'à douze appels au fournisseur : la limite est
  // bien plus basse que celle des routes de cotation.
  limit: 20,
  windowMs: 60_000,
  maxBodyBytes: 256 * 1024,
});
