// Fonction serverless Vercel — GET /api/screen?symbols=AI.PA,MC.PA,...
//
// Renvoie les ratios fondamentaux d'un LOT de titres, pour alimenter le
// screener. C'est un endpoint distinct de `/api/profile`, et la raison tient
// en trois points :
//
//  - `/api/profile` est limité à 30 requêtes/minute et effectue jusqu'à quatre
//    traductions par titre. Screener soixante valeurs y prendrait deux minutes
//    et épuiserait le quota au passage.
//  - Un screener ne lit pas de description d'entreprise : la traduction, qui
//    est le poste le plus coûteux de `/api/profile`, n'a aucune raison d'être
//    ici.
//  - Un PER ou un ROE ne bouge pas à la minute. Le cache peut être bien plus
//    long que celui des cours (une heure contre trente secondes).
//
// Les titres en échec ne font jamais tomber le lot : ils reviennent avec
// `ok: false`, et le screener les affiche comme non évaluables plutôt que de
// les exclure silencieusement — un titre absent d'un filtre pour cause de
// panne réseau ressemble à un titre qui ne passe pas le filtre.

import { withApi, httpError, cached } from "./_lib/http.js";
import { parseSymbols } from "./_lib/yahoo.js";
import { ratiosTitre } from "./_lib/yahooFondamentaux.js";

const CACHE_MS = 60 * 60_000;

// Yahoo tolère mal les rafales : au-delà, les réponses commencent à revenir
// vides sans erreur explicite, ce qui produirait un screener silencieusement
// incomplet.
const TAILLE_LOT = 5;

async function parLots(elements, taille, traitement) {
  const sorties = [];
  for (let i = 0; i < elements.length; i += taille) {
    const lot = elements.slice(i, i + taille);
    sorties.push(...(await Promise.all(lot.map(traitement))));
  }
  return sorties;
}

async function handler(req, res) {
  const symboles = parseSymbols(req.query.symbols);
  if (symboles.length === 0) {
    throw httpError(400, "Paramètre `symbols` manquant ou invalide.");
  }

  const resultats = await parLots(symboles, TAILLE_LOT, async (symbole) => {
    try {
      const ratios = await cached(`screen:${symbole}`, CACHE_MS, async () => {
        const r = await ratiosTitre(symbole);
        if (!r) throw new Error("Fondamentaux indisponibles");
        return r;
      });
      return { ...ratios, ok: true };
    } catch (err) {
      return { symbole, ok: false, error: err.message };
    }
  });

  res.status(200).json(resultats);
}

export default withApi(handler, {
  methods: ["GET"],
  // Chaque requête déclenche jusqu'à quarante appels Yahoo : quota bas, mais
  // le cache d'une heure fait que l'usage réel reste très en dessous.
  limit: 20,
  windowMs: 60_000,
  sMaxAge: 1800,
});
