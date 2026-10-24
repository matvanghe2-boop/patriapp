// GET /api/market?action=communique&url=<PDF déposé sur info-financiere.gouv.fr>
//
// Texte d'un communiqué de société, extrait du PDF déposé, pour l'afficher
// dans la fiche d'un événement du calendrier sans quitter l'application —
// puis le résumer.
//
// POURQUOI SANS AUTHENTIFICATION, CONTRAIREMENT AU RÉSUMÉ
//
// `/api/resume` coûte un appel de modèle au propriétaire : il exige un compte.
// Ici, rien ne coûte au-delà de la lecture d'un PDF public, et le texte rendu
// est celui que la société a elle-même publié. Le quota par minute et le cache
// suffisent à borner l'abus.
//
// POURQUOI UNE LISTE BLANCHE STRICTE
//
// L'URL vient du client. Seul l'entrepôt de documents de la DILA est lu
// (`urlDocumentAutorisee`) : accepter n'importe quelle adresse ferait de cette
// route un relais vers le réseau interne de l'hébergeur.

import { httpError, cached } from "../http.js";
import { urlDocumentAutorisee, texteDocument, texteLisiblePdf } from "../sources/infoFinanciere.js";

// Un document déposé ne change jamais.
const CACHE_MS = 7 * 24 * 60 * 60_000;

// Même borne que le résumé : au-delà, c'est un rapport, pas un communiqué.
const MAX_CARACTERES = 80_000;

async function handler(req, res) {
  const url = String(req.query.url || "");
  if (!urlDocumentAutorisee(url)) {
    throw httpError(400, "Seuls les communiqués déposés sur info-financiere.gouv.fr peuvent être lus ici.");
  }

  let texte;
  try {
    texte = await cached(`dila:texte:${url}`, CACHE_MS, async () =>
      texteLisiblePdf(await texteDocument(url)).slice(0, MAX_CARACTERES + 1)
    );
  } catch {
    throw httpError(502, "Communiqué indisponible pour le moment. Le lien vers le PDF reste utilisable.");
  }

  if (!texte) throw httpError(422, "Aucun texte lisible dans ce document (PDF scanné ?).");

  const tronque = texte.length > MAX_CARACTERES;
  return res.status(200).json({ url, texte: tronque ? texte.slice(0, MAX_CARACTERES) : texte, tronque });
}

// Le CDN peut garder la réponse une journée : le document est immuable.
export const options = { methods: ["GET"], limit: 20, windowMs: 60_000, sMaxAge: 86_400 };

export { handler };
