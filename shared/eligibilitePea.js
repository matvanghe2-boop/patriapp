/**
 * Éligibilité au PEA et retenue à la source sur les dividendes.
 *
 * Deux règles distinctes qui découlent toutes deux du PAYS de cotation, et que
 * l'application ignorait complètement :
 *
 *  1. **Éligibilité.** Un PEA n'accepte que des sociétés dont le siège est
 *     dans l'Union européenne ou l'Espace économique européen. Rien
 *     n'empêchait d'ajouter `AAPL` à un portefeuille déclaré PEA, et toute la
 *     fiscalité affichée derrière devenait fausse.
 *
 *  2. **Retenue à la source.** Un dividende versé par une société étrangère
 *     subit une retenue dans son pays d'origine. Hors PEA, elle donne droit à
 *     un crédit d'impôt qui l'annule en pratique. **Dans un PEA, non** :
 *     l'absence d'imposition française prive le porteur de tout impôt sur
 *     lequel imputer ce crédit, et la retenue est donc définitivement perdue.
 *
 *     Conséquence directe pour une sélection de titres orientée rendement :
 *     deux lignes affichant 4 % ne rapportent pas la même chose.
 *
 *         Air Liquide (France)  4,0 % annoncé → 4,0 % encaissé
 *         Allianz (Allemagne)   4,0 % annoncé → ~3,4 % encaissé
 *
 * Le pays se déduit du suffixe du ticker Yahoo, seule information de
 * localisation dont l'application dispose sans appel réseau supplémentaire.
 *
 * ⚠️ Les taux ci-dessous sont les taux **conventionnels** applicables à un
 * résident fiscal français. Le taux réellement appliqué dépend de la
 * convention et surtout des démarches que le courtier effectue à ta place :
 * certains appliquent le taux réduit d'office, d'autres retiennent le taux
 * interne plein. À confronter à un avis d'opéré réel plutôt qu'à prendre pour
 * argent comptant.
 */

/**
 * Suffixe Yahoo → place de cotation.
 *
 * `eee` : Espace économique européen, donc éligible au PEA.
 * `retenue` : retenue à la source conventionnelle sur dividendes, en %.
 */
export const PLACES = {
  PA: { pays: "France", code: "FR", eee: true, retenue: 0 },
  AS: { pays: "Pays-Bas", code: "NL", eee: true, retenue: 15 },
  BR: { pays: "Belgique", code: "BE", eee: true, retenue: 15 },
  DE: { pays: "Allemagne", code: "DE", eee: true, retenue: 15 },
  F: { pays: "Allemagne", code: "DE", eee: true, retenue: 15 },
  MC: { pays: "Espagne", code: "ES", eee: true, retenue: 15 },
  MI: { pays: "Italie", code: "IT", eee: true, retenue: 15 },
  LS: { pays: "Portugal", code: "PT", eee: true, retenue: 15 },
  VI: { pays: "Autriche", code: "AT", eee: true, retenue: 15 },
  IR: { pays: "Irlande", code: "IE", eee: true, retenue: 15 },
  HE: { pays: "Finlande", code: "FI", eee: true, retenue: 15 },
  ST: { pays: "Suède", code: "SE", eee: true, retenue: 15 },
  CO: { pays: "Danemark", code: "DK", eee: true, retenue: 15 },
  OL: { pays: "Norvège", code: "NO", eee: true, retenue: 15 },
  AT: { pays: "Grèce", code: "GR", eee: true, retenue: 15 },
  WA: { pays: "Pologne", code: "PL", eee: true, retenue: 15 },
  PR: { pays: "Tchéquie", code: "CZ", eee: true, retenue: 15 },
  BD: { pays: "Hongrie", code: "HU", eee: true, retenue: 15 },

  // Hors EEE : inéligibles au PEA. La retenue reste indiquée car elle
  // s'applique bel et bien sur un compte-titres ordinaire — où elle ouvre en
  // revanche droit à un crédit d'impôt.
  L: { pays: "Royaume-Uni", code: "GB", eee: false, retenue: 0 },
  SW: { pays: "Suisse", code: "CH", eee: false, retenue: 15 },
  TO: { pays: "Canada", code: "CA", eee: false, retenue: 15 },
  T: { pays: "Japon", code: "JP", eee: false, retenue: 10 },
  HK: { pays: "Hong Kong", code: "HK", eee: false, retenue: 0 },
  AX: { pays: "Australie", code: "AU", eee: false, retenue: 15 },
};

/** Un ticker sans suffixe est coté aux États-Unis (convention Yahoo). */
export const PLACE_SANS_SUFFIXE = {
  pays: "États-Unis",
  code: "US",
  eee: false,
  retenue: 15,
};

/** Enveloppes soumises à la règle d'éligibilité géographique. */
const ENVELOPPES_RESTREINTES = new Set(["PEA", "PEA-PME"]);

/**
 * Pays de l'Espace économique européen, tels que Yahoo les nomme.
 *
 * C'est le SIÈGE SOCIAL qui détermine l'éligibilité au PEA, pas la place de
 * cotation — et les deux divergent plus souvent qu'on ne le croit. Shell plc
 * se négocie sur Euronext Amsterdam mais est domiciliée au Royaume-Uni : elle
 * est inéligible, alors que son suffixe `.AS` laisse croire l'inverse. Sur le
 * seul STOXX 600, six sociétés sont dans ce cas.
 *
 * Le suffixe reste le repli quand le pays n'est pas publié : il est juste dans
 * l'immense majorité des cas, et vaut mieux qu'une absence de réponse.
 *
 * ⚠️ NUANCE PRATIQUE, dans l'autre sens cette fois. Le critère légal est bien
 * le siège social, et une douzaine de sociétés du Russell 2000 le satisfont —
 * Adient, Alkermes, Perrigo (Irlande), Constellium (France), Zegna (Italie)…
 * Mais elles ne sont cotées qu'aux États-Unis, et un PEA ne peut router
 * d'ordre que vers une place européenne : en pratique le courtier les
 * refusera, faute de ligne de cotation atteignable. Le drapeau répond donc à
 * « cette société est-elle éligible ? », pas à « puis-je l'acheter sur mon
 * PEA ? ». Pour ces titres, il faut chercher une éventuelle cotation
 * européenne du même émetteur.
 */
const PAYS_EEE = new Set([
  "France", "Germany", "Netherlands", "Spain", "Italy", "Belgium", "Portugal",
  "Austria", "Ireland", "Finland", "Sweden", "Denmark", "Norway", "Poland",
  "Czech Republic", "Czechia", "Hungary", "Greece", "Luxembourg", "Iceland",
  "Liechtenstein", "Estonia", "Latvia", "Lithuania", "Slovakia", "Slovenia",
  "Croatia", "Romania", "Bulgaria", "Cyprus", "Malta",
]);

/**
 * Le siège social est-il dans l'EEE ?
 * `null` quand le pays n'est pas renseigné — on ne devine pas.
 */
export function paysDansEee(pays) {
  if (!pays || typeof pays !== "string") return null;
  return PAYS_EEE.has(pays.trim());
}

/**
 * Place de cotation d'un ticker. `null` si le suffixe est inconnu — on ne
 * devine pas : une éligibilité supposée à tort est pire qu'une absence de
 * réponse.
 */
export function placeDuTicker(ticker) {
  const t = String(ticker || "").trim().toUpperCase();
  if (!t) return null;
  const point = t.lastIndexOf(".");
  if (point === -1) return PLACE_SANS_SUFFIXE;
  const suffixe = t.slice(point + 1);
  return PLACES[suffixe] || null;
}

/**
 * Le titre est-il détenable dans cette enveloppe ?
 *
 * @param ticker      symbole Yahoo
 * @param enveloppe   "PEA", "CTO"…
 * @param paysSiege   pays du siège social, quand il est connu. C'est LUI qui
 *                    fait foi : le suffixe de cotation n'est qu'un repli.
 * @returns {{eligible: boolean|null, pays: string|null, motif: string|null}}
 */
export function verifierEligibilite(ticker, enveloppe = "PEA", paysSiege = null) {
  const place = placeDuTicker(ticker);

  if (!ENVELOPPES_RESTREINTES.has(String(enveloppe || "").toUpperCase())) {
    return { eligible: true, pays: paysSiege ?? place?.pays ?? null, motif: null };
  }

  // Le siège social prime quand il est connu.
  const parSiege = paysDansEee(paysSiege);
  if (parSiege === true) return { eligible: true, pays: paysSiege, motif: null };
  if (parSiege === false) {
    return {
      eligible: false,
      pays: paysSiege,
      motif: `Siège social hors Espace économique européen (${paysSiege}) : un PEA ne peut pas la détenir, quelle que soit sa place de cotation.`,
    };
  }

  if (!place) {
    return {
      eligible: null,
      pays: null,
      motif: "Place de cotation non reconnue — vérifie l'éligibilité auprès de ton courtier.",
    };
  }
  if (place.eee) return { eligible: true, pays: place.pays, motif: null };

  return {
    eligible: false,
    pays: place.pays,
    motif: `Société cotée hors Espace économique européen (${place.pays}) : un PEA ne peut pas la détenir.`,
  };
}

/** Taux de retenue à la source applicable à un ticker, en %. */
export function tauxRetenue(ticker) {
  return placeDuTicker(ticker)?.retenue ?? 0;
}

/**
 * Dividende réellement encaissé, retenue à la source déduite.
 *
 * La retenue n'est définitivement perdue que dans une enveloppe non imposée
 * (PEA). Sur un compte-titres ordinaire elle ouvre droit à un crédit d'impôt
 * qui la neutralise en pratique : le brut y est donc la bonne mesure.
 *
 * @returns {{brut: number, net: number, tauxPct: number, perdue: number, recuperable: boolean}}
 */
export function dividendeNet(montantBrut, ticker, enveloppe = "PEA") {
  const brut = Number.isFinite(Number(montantBrut)) ? Number(montantBrut) : 0;
  const tauxPct = tauxRetenue(ticker);
  const dansPea = ENVELOPPES_RESTREINTES.has(String(enveloppe || "").toUpperCase());

  if (!dansPea || tauxPct <= 0) {
    return { brut, net: brut, tauxPct, perdue: 0, recuperable: !dansPea && tauxPct > 0 };
  }

  const perdue = brut * (tauxPct / 100);
  return { brut, net: brut - perdue, tauxPct, perdue, recuperable: false };
}
