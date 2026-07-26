// Fonction serverless Vercel — POST /api/parse-pdf
// Reçoit un document PDF (encodé en base64 dans le corps JSON) et en extrait
// les opérations. Gère plusieurs types de documents de courtage :
//   - "avis_operation"    : un avis d'opéré (un seul ordre achat/vente)
//   - "releve_titres"     : un relevé de portefeuille titres (plusieurs lignes)
//   - "releve_especes"    : un relevé de compte espèces (mouvements de cash)
//   - "releve_dividendes" : un relevé de coupons / dividendes perçus
//   - "releve_compte"     : relevé de compte générique (mélange mouvements)
//
// Contrairement à une extraction "tout ou rien", cette fonction renvoie
// TOUJOURS 200 avec la meilleure extraction possible : chaque élément détecté
// porte un flag `complete` (true si tous les champs indispensables sont
// présents). Le frontend peut alors committer directement les lignes
// complètes et proposer la saisie manuelle pré-remplie pour les incomplètes.
//
// Toute la logique d'extraction vit dans _lib/pdfParsing.js (fonctions pures,
// couvertes par des tests unitaires) ; ce fichier ne fait que le transport.
//
// Corps attendu : { filename?: string, data: string /* base64 */ }

import pdfParse from "pdf-parse";
import { withApi, httpError } from "./_lib/http.js";
import { parseStatementText } from "./_lib/pdfParsing.js";

const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 Mo de PDF décodé
const MAX_BODY_BYTES = 12 * 1024 * 1024; // le base64 pèse ~33 % de plus

export const config = {
  api: {
    bodyParser: { sizeLimit: "12mb" },
  },
};

// Un PDF commence toujours par la signature "%PDF-". La vérifier évite de
// lancer pdf-parse sur un binaire arbitraire envoyé par un client hostile.
const PDF_MAGIC = "%PDF-";

async function handler(req, res) {
  const { data } = req.body || {};
  if (!data || typeof data !== "string") throw httpError(400, "Aucun fichier reçu.");

  // Bornage AVANT décodage : décoder d'abord reviendrait à allouer la mémoire
  // qu'on cherche justement à limiter.
  if (data.length > MAX_BODY_BYTES) {
    throw httpError(413, `Fichier trop volumineux (max ${MAX_PDF_BYTES / 1024 / 1024} Mo).`);
  }

  let buffer;
  try {
    buffer = Buffer.from(data, "base64");
  } catch {
    throw httpError(400, "Fichier illisible (encodage invalide).");
  }
  if (buffer.length === 0) throw httpError(400, "Fichier vide.");
  if (buffer.length > MAX_PDF_BYTES) {
    throw httpError(413, `Fichier trop volumineux (max ${MAX_PDF_BYTES / 1024 / 1024} Mo).`);
  }
  if (buffer.subarray(0, PDF_MAGIC.length).toString("latin1") !== PDF_MAGIC) {
    throw httpError(400, "Ce fichier n'est pas un PDF valide.");
  }

  let parsed;
  try {
    parsed = await pdfParse(buffer);
  } catch {
    throw httpError(422, "Ce PDF n'a pas pu être lu (fichier protégé, corrompu ou scanné ?).");
  }

  return res.status(200).json(parseStatementText(parsed.text));
}

// Endpoint le plus coûteux (CPU + mémoire) et le plus exposé : quota serré.
export default withApi(handler, {
  methods: ["POST"],
  limit: 10,
  windowMs: 60_000,
  maxBodyBytes: MAX_BODY_BYTES,
});
