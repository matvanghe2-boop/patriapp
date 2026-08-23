// Fonction serverless Vercel — GET /api/market?action=health
//
// POURQUOI CETTE ROUTE EXISTE
//
// Toute la donnée de marché de Patrium — cours, taux de change, fondamentaux,
// calendrier, fiche entreprise — passe par une seule source : l'API Yahoo
// Finance, que `_lib/yahoo.js` décrit lui-même comme « non officielle, non
// documentée, elle peut changer sans préavis ». La négociation cookie + crumb
// qu'il implémente est déjà la réponse à un premier changement unilatéral de
// leur part.
//
// Le problème n'est pas la panne : c'est qu'elle est INDISCERNABLE d'un
// résultat normal. Un symbole qui ne répond plus ressort exactement comme un
// titre qui n'existe pas ; un lot de cours vide ressemble à un portefeuille
// sans position. Le README documente déjà ce symptôme côté screener : un
// symbole absent « ressemble à un titre qui ne passe pas le filtre ».
//
// Cette route interroge donc un symbole de référence dont on SAIT qu'il doit
// répondre, et renvoie un verdict explicite. L'interface peut alors dire
// « la source de cours est indisponible » au lieu de laisser chaque ligne
// échouer isolément, sans explication.

import { cached } from "../http.js";
import { fetchJson } from "../yahoo.js";

// Le CAC 40. Un indice plutôt qu'une action : il ne peut ni être radié, ni
// changer de place de cotation, ni faire l'objet d'une suspension durable —
// autant de faux positifs qu'un titre isolé finirait par produire.
const SYMBOLE_TEMOIN = "^FCHI";

// Assez court pour que le retour à la normale se voie vite, assez long pour
// qu'un bandeau affiché sur plusieurs onglets ne martèle pas Yahoo.
const CACHE_MS = 60_000;

/**
 * @returns {Promise<{ok: boolean, source: string, motif?: string, verifieLe: string}>}
 */
async function verifier() {
  const debut = Date.now();
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOLE_TEMOIN)}`;
    const data = await fetchJson(url);
    const prix = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    // Une réponse HTTP 200 dont le contenu est vide est le mode d'échec le
    // plus courant de cette source : c'est bien la VALEUR qu'il faut vérifier,
    // pas le code de statut.
    if (prix == null) {
      return {
        ok: false,
        source: "yahoo",
        motif: "reponse-vide",
        verifieLe: new Date().toISOString(),
        latenceMs: Date.now() - debut,
      };
    }
    return {
      ok: true,
      source: "yahoo",
      verifieLe: new Date().toISOString(),
      latenceMs: Date.now() - debut,
    };
  } catch (err) {
    return {
      ok: false,
      source: "yahoo",
      // `err.message` vient de `fetchJson`, qui ne renvoie que des libellés
      // maison (« HTTP 429 », « Délai dépassé ») : rien d'interne n'est exposé.
      motif: err.message || "injoignable",
      verifieLe: new Date().toISOString(),
      latenceMs: Date.now() - debut,
    };
  }
}

async function handler(req, res) {
  const etat = await cached("health:yahoo", CACHE_MS, verifier);
  // Toujours 200 : c'est un DIAGNOSTIC, pas une erreur. Répondre 503 rendrait
  // la panne de la source indiscernable d'une panne de cette route-ci.
  res.status(200).json(etat);
}

export const options = { methods: ["GET"], limit: 30, windowMs: 60_000, sMaxAge: 60 };

export { handler, verifier, SYMBOLE_TEMOIN };
