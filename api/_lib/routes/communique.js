// GET /api/market?action=communique&url=<PDF déposé sur info-financiere.gouv.fr>
// GET /api/market?action=communique&symbol=DG.PA&date=2026-07-29&type=Résultats
//
// La seconde forme CHERCHE le communiqué quand l'événement n'en porte pas
// (voir `choisirCommunique`).
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
import {
  urlDocumentAutorisee,
  texteDocument,
  texteLisiblePdf,
  communiqueDuJour,
  mnemonique,
} from "../sources/infoFinanciere.js";
import { toIsoDate } from "./calendar.js";

// Un document déposé ne change jamais.
const CACHE_MS = 7 * 24 * 60 * 60_000;
// Un communiqué peut encore être déposé dans l'heure qui suit l'événement :
// une recherche infructueuse n'est pas gardée longtemps.
const CACHE_RECHERCHE_MS = 60 * 60_000;

// Même borne que le résumé : au-delà, c'est un rapport, pas un communiqué.
const MAX_CARACTERES = 80_000;

const TYPES = new Set(["Résultats", "Chiffre d'affaires", "Communication"]);

/**
 * Le document à lire : donné par son lien, ou cherché dans le registre par
 * société et par date quand l'événement n'en porte pas (date de résultats
 * venue de Yahoo, date relevée sur l'agenda de la société…).
 */
async function documentDemande(query) {
  const url = String(query.url || "");
  if (url) {
    if (!urlDocumentAutorisee(url)) {
      throw httpError(400, "Seuls les communiqués déposés sur info-financiere.gouv.fr peuvent être lus ici.");
    }
    return { url };
  }

  const symbole = String(query.symbol || "").toUpperCase();
  const date = String(query.date || "");
  const type = TYPES.has(query.type) ? query.type : null;
  if (!mnemonique(symbole) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw httpError(400, "Paramètres attendus : `url`, ou `symbol` (place de Paris) et `date` (AAAA-MM-JJ).");
  }
  const trouve = await cached(`dila:jour:${symbole}:${date}:${type}`, CACHE_RECHERCHE_MS, () =>
    communiqueDuJour(symbole, date, type, { formaterDate: toIsoDate })
  );
  if (!trouve) {
    const jour = date.split("-").reverse().join("/");
    throw httpError(404, `Aucun communiqué déposé par la société autour du ${jour}.`);
  }
  return trouve;
}

async function handler(req, res) {
  const document = await documentDemande(req.query);
  const { url } = document;

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
  return res.status(200).json({
    url,
    // Présents quand le document a été CHERCHÉ : la fiche dit lequel elle a trouvé.
    titre: document.titre ?? null,
    date: document.date ?? null,
    texte: tronque ? texte.slice(0, MAX_CARACTERES) : texte,
    tronque,
  });
}

// Le CDN peut garder la réponse une journée : le document est immuable.
export const options = { methods: ["GET"], limit: 20, windowMs: 60_000, sMaxAge: 86_400 };

export { handler };
