// Fonction serverless Vercel — GET /api/fx?devises=USD,GBP,CHF
//
// Renvoie le taux de conversion de chaque devise vers l'EURO. Yahoo cote les
// paires comme n'importe quel ticker : `EURUSD=X` vaut « combien de dollars
// pour un euro ». Le taux qui nous intéresse est l'inverse — combien d'euros
// pour une unité de devise — puisqu'on convertit des positions cotées en
// devise étrangère vers la monnaie de référence de l'application.
//
// Sans cet endpoint, tous les agrégats de Patrium additionnaient les cours
// comme des euros, quelle que soit la devise de cotation : une position en
// dollars était comptée à parité 1:1, ce qui faussait la valeur du
// portefeuille, la plus-value, la répartition et les exports.

import { httpError, cached } from "../http.js";
import { fetchJson } from "../yahoo.js";

// Un taux de change bouge peu à l'échelle d'une session ; dix minutes de cache
// suffisent largement pour un suivi de patrimoine, et évitent de retaper Yahoo
// à chaque actualisation de cours.
const CACHE_MS = 10 * 60_000;

/** Trois lettres majuscules — le format ISO 4217, seul accepté. */
const DEVISE_VALIDE = /^[A-Z]{3}$/;
const MAX_DEVISES = 12;

export function parseDevises(brut) {
  if (typeof brut !== "string") return [];
  return [...new Set(
    brut
      .split(",")
      .map((d) => d.trim().toUpperCase())
      .filter((d) => DEVISE_VALIDE.test(d) && d !== "EUR")
  )].slice(0, MAX_DEVISES);
}

async function handler(req, res) {
  const devises = parseDevises(req.query.devises);
  if (devises.length === 0) {
    throw httpError(400, "Paramètre `devises` manquant ou invalide (ex : USD,GBP).");
  }

  const taux = await Promise.all(
    devises.map(async (devise) => {
      try {
        return await cached(`fx:${devise}`, CACHE_MS, async () => {
          const paire = `EUR${devise}=X`;
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(paire)}`;
          const data = await fetchJson(url);
          const cours = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!cours || cours <= 0) throw new Error("Réponse inattendue");
          // `cours` = devise par euro ; on renvoie l'inverse, en euros par
          // unité de devise, directement multipliable par un cours de position.
          return { devise, ok: true, versEuro: 1 / cours, paire };
        });
      } catch (err) {
        // Une devise en échec ne doit pas faire tomber tout le lot : l'appelant
        // laissera la position non convertie et l'avertissement subsistera.
        return { devise, ok: false, error: err.message };
      }
    })
  );

  res.status(200).json(taux);
}

export const options = { methods: ["GET"], limit: 60, windowMs: 60_000, sMaxAge: 600 };

export { handler };
