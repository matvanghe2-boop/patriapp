// Fonction serverless Vercel — GET /api/fundamentals?symbol=AI.PA
//
// Fiche financière complète d'un titre : ratios courants, historique annuel
// (quatre exercices) et consensus d'analystes.
//
// Ce que l'endpoint ne fera PAS, et c'est délibéré : projeter au-delà de
// l'exercice suivant. Yahoo publie un consensus pour l'année en cours et la
// suivante, pas au-delà. Prolonger la courbe sur une troisième année
// supposerait d'extrapoler nous-mêmes une croissance de bénéfices et de
// l'afficher comme un consensus d'analystes — ce serait un chiffre inventé
// présenté comme une donnée de marché.

import { httpError, cached } from "../http.js";
import { isValidSymbol } from "../yahoo.js";
import { ficheComplete } from "../yahooFondamentaux.js";

// Les comptes annuels ne changent que quatre fois par an ; les ratios courants
// bougent avec le cours, mais pas assez pour justifier moins d'un quart d'heure.
const CACHE_MS = 15 * 60_000;

async function handler(req, res) {
  const symbole = String(req.query.symbol || "").trim();
  if (!isValidSymbol(symbole)) {
    throw httpError(400, "Paramètre `symbol` manquant ou invalide.");
  }

  const fiche = await cached(`fund:${symbole}`, CACHE_MS, async () => {
    const f = await ficheComplete(symbole);
    if (!f) throw httpError(404, "Aucune donnée fondamentale pour ce symbole.");
    return f;
  });

  res.status(200).json(fiche);
}

export const options = { methods: ["GET"], limit: 40, windowMs: 60_000, sMaxAge: 900 };

export { handler };
