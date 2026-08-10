// Fonction serverless Vercel — point d'entrée unique des données de marché.
//
//   GET /api/market?action=quote&symbols=AI.PA,MC.PA
//   GET /api/market?action=fundamentals&symbol=AI.PA
//   …
//
// POURQUOI UN ROUTEUR PLUTÔT QU'UN FICHIER PAR ENDPOINT
//
// Vercel transforme chaque fichier de `api/` en fonction serverless distincte,
// et le plan Hobby en autorise douze. Avec un fichier par endpoint, l'ajout du
// screener et des taux de change a fait passer le projet à treize — le
// déploiement échouait.
//
// Regrouper les neuf routes de données de marché derrière un seul fichier
// ramène le total à trois fonctions. Ce n'est pas un compromis de mise en
// œuvre : ces routes partagent la même enveloppe (`withApi`), la même source
// (Yahoo) et le même modèle de cache. Les séparer n'apportait qu'une
// contrainte de quota.
//
// Deux endpoints restent des fichiers à part, parce qu'ils portent une
// configuration propre que Vercel lit au niveau du fichier :
//   - `advisor.js`   : `maxDuration: 60` (un raisonnement complet dépasse les
//                      10 s par défaut) et une authentification obligatoire ;
//   - `parse-pdf.js` : `bodyParser.sizeLimit` à 12 Mo pour l'envoi de PDF.
//
// Chaque route conserve ses propres quotas et sa propre durée de cache : ils
// sont déclarés à côté du handler, dans `_lib/routes/`, et appliqués ici.

import { withApi, httpError } from "./_lib/http.js";

import * as quote from "./_lib/routes/quote.js";
import * as search from "./_lib/routes/search.js";
import * as history from "./_lib/routes/history.js";
import * as calendar from "./_lib/routes/calendar.js";
import * as profile from "./_lib/routes/profile.js";
import * as fx from "./_lib/routes/fx.js";
import * as screen from "./_lib/routes/screen.js";
import * as fundamentals from "./_lib/routes/fundamentals.js";
import * as rates from "./_lib/routes/rates.js";

const ROUTES = { quote, search, history, calendar, profile, fx, screen, fundamentals, rates };

export const ACTIONS = Object.keys(ROUTES);

// Une enveloppe par route, construite une seule fois : `withApi` referme sur
// des compteurs de débit qui doivent persister d'une requête à l'autre.
// La reconstruire à chaque appel remettrait le quota à zéro à chaque requête,
// c'est-à-dire supprimerait la limitation de débit sans que rien ne le signale.
const ENVELOPPES = Object.fromEntries(
  Object.entries(ROUTES).map(([nom, route]) => [nom, withApi(route.handler, route.options)])
);

/**
 * Le plafond par défaut d'une fonction serverless est de dix secondes. Une
 * requête de screener interroge jusqu'à vingt titres auprès de Yahoo : c'est
 * court, mais pas toujours sous dix secondes quand la source répond lentement.
 * Trente secondes laissent de la marge sans immobiliser la fonction.
 */
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const action = String(req.query?.action || "").trim();
  const enveloppe = ENVELOPPES[action];

  if (!enveloppe) {
    // Réponse traitée par une enveloppe minimale, pour que le refus porte les
    // mêmes en-têtes de sécurité et le même contrôle d'origine que le reste.
    return withApi(async () => {
      throw httpError(400, `Action inconnue. Attendu : ${ACTIONS.join(", ")}.`);
    }, { methods: ["GET"], limit: 60, windowMs: 60_000 })(req, res);
  }

  return enveloppe(req, res);
}
