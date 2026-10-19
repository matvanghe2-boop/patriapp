/**
 * Source SEC EDGAR — publications réglementaires des sociétés américaines.
 *
 * POURQUOI UNE DEUXIÈME SOURCE
 *
 * Tout le calendrier reposait sur Yahoo, endpoint non officiel dont le README
 * documente déjà la fragilité. Plus gênant encore : Yahoo ne dit pas si une
 * date de résultats est CONFIRMÉE par la société ou simplement estimée à
 * partir du rythme des trimestres précédents. Les deux s'affichaient de la
 * même façon, et on ne pouvait pas savoir laquelle on regardait.
 *
 * CE QU'EDGAR APPORTE, ET CE QU'IL N'APPORTE PAS
 *
 * EDGAR est un registre de dépôts : il recense ce qui a ÉTÉ publié, avec une
 * date certaine. Il ne contient aucun calendrier prévisionnel. On n'en tire
 * donc pas de dates futures — ce serait les inventer — mais deux choses que
 * Yahoo ne donne pas :
 *
 *   1. les communiqués importants (formulaire 8-K), qui sont précisément la
 *      catégorie « communiqué » demandée, et qui n'existent nulle part chez
 *      Yahoo ;
 *   2. une CONFIRMATION : quand un 10-Q ou un 10-K a effectivement été déposé
 *      à la date annoncée, l'événement passe de « estimé » à « confirmé ».
 *
 * CONDITIONS D'USAGE
 *
 * L'API est publique, gratuite et sans clé, mais la SEC impose un en-tête
 * `User-Agent` nominatif comportant un moyen de contact, et recommande de ne
 * pas dépasser 10 requêtes par seconde. Sans cet en-tête, elle répond 403.
 * Il n'est donc PAS codé en dur ici : il vient de `SEC_USER_AGENT`, et sans
 * cette variable la source reste simplement éteinte — le calendrier continue
 * de fonctionner avec Yahoo seul.
 *
 * Documentation : https://www.sec.gov/search-filings/edgar-application-programming-interfaces
 */

import { cached } from "../http.js";

const BASE_DONNEES = "https://data.sec.gov";
const CORRESPONDANCE_TICKERS = "https://www.sec.gov/files/company_tickers.json";

// La table ticker → CIK pèse quelques centaines de kilo-octets et ne bouge
// qu'à la marge : une journée de cache est largement raisonnable.
const CACHE_CORRESPONDANCE_MS = 24 * 60 * 60_000;
// Les dépôts d'une société changent au plus quelques fois par trimestre.
const CACHE_DEPOTS_MS = 6 * 60 * 60_000;

const DELAI_MS = 8000;

/** Formulaires retenus, et ce qu'ils signifient pour l'utilisateur. */
const FORMULAIRES = {
  "10-K": { type: "Résultats", label: "Rapport annuel (10-K)" },
  "10-Q": { type: "Résultats", label: "Rapport trimestriel (10-Q)" },
  "8-K": { type: "Communication", label: "Communiqué (8-K)" },
  "DEF 14A": { type: "Assemblée Générale", label: "Convocation à l'assemblée (DEF 14A)" },
};

/**
 * L'en-tête exigé par la SEC. Absent ⇒ source désactivée, silencieusement :
 * c'est un enrichissement, pas une dépendance.
 */
export function enTetesSec(env = process.env) {
  const ua = (env.SEC_USER_AGENT || "").trim();
  if (!ua) return null;
  return { "User-Agent": ua, Accept: "application/json" };
}

export function estActive(env = process.env) {
  return enTetesSec(env) !== null;
}

/**
 * Un symbole Yahoo américain n'a pas de suffixe de place (AAPL, MSFT), là où
 * les européens en portent un (AI.PA, ADYEN.AS). EDGAR ne couvrant que les
 * sociétés enregistrées aux États-Unis, on écarte d'emblée tout ce qui porte
 * un point — cela évite autant d'appels inutiles que de faux positifs.
 */
export function estSymboleAmericain(symbole) {
  return typeof symbole === "string" && /^[A-Z][A-Z0-9-]{0,5}$/.test(symbole);
}

async function lireJson(url, enTetes) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    const r = await fetch(url, { headers: enTetes, signal: controleur.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(minuteur);
  }
}

/** Table ticker → CIK, mise en cache pour la journée. */
export async function correspondanceCik(enTetes) {
  return cached("sec:tickers", CACHE_CORRESPONDANCE_MS, async () => {
    const data = await lireJson(CORRESPONDANCE_TICKERS, enTetes);
    const table = {};
    for (const entree of Object.values(data || {})) {
      if (!entree?.ticker || entree.cik_str == null) continue;
      // Le CIK doit être formaté sur dix chiffres pour l'API des dépôts.
      table[String(entree.ticker).toUpperCase()] = String(entree.cik_str).padStart(10, "0");
    }
    return table;
  });
}

/**
 * Dépôts récents d'une société, convertis en événements de calendrier.
 *
 * `depuis` borne la profondeur : un historique complet remonte à 1993 et
 * n'aurait aucun intérêt dans un calendrier tourné vers les prochaines
 * échéances.
 */
export async function depotsRecents(symbole, { enTetes, depuis, maintenant = new Date() }) {
  const table = await correspondanceCik(enTetes);
  const cik = table[symbole.toUpperCase()];
  if (!cik) return [];

  const data = await cached(`sec:depots:${cik}`, CACHE_DEPOTS_MS, () =>
    lireJson(`${BASE_DONNEES}/submissions/CIK${cik}.json`, enTetes)
  );

  const recentes = data?.filings?.recent;
  if (!recentes?.form || !recentes?.filingDate) return [];

  const nom = data.name || symbole;
  const borne =
    depuis ||
    new Date(maintenant.getTime() - 120 * 86400000).toISOString().slice(0, 10);

  const evenements = [];
  for (let i = 0; i < recentes.form.length; i++) {
    const formulaire = recentes.form[i];
    const config = FORMULAIRES[formulaire];
    if (!config) continue;

    const date = recentes.filingDate[i];
    if (!date || date < borne) continue;

    evenements.push({
      ticker: symbole,
      name: nom,
      type: config.type,
      date,
      label: config.label,
      // Un dépôt EDGAR est un fait daté, pas une prévision : il est confirmé
      // par construction. C'est tout ce qui le distingue d'une date Yahoo.
      statut: "confirme",
      fournisseur: "sec-edgar",
      // Lien vers le document lui-même, pour pouvoir le lire.
      lien:
        recentes.accessionNumber?.[i] != null
          ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(
              recentes.accessionNumber[i]
            ).replace(/-/g, "")}/${recentes.primaryDocument?.[i] || ""}`
          : null,
    });
  }
  return evenements;
}

/**
 * Enrichit une liste de symboles. Les erreurs sont absorbées symbole par
 * symbole : EDGAR est un complément, son indisponibilité ne doit jamais
 * vider un calendrier que Yahoo a correctement rempli.
 */
export async function evenementsSec(symboles = [], env = process.env) {
  const enTetes = enTetesSec(env);
  if (!enTetes) return [];

  const americains = symboles.filter(estSymboleAmericain);
  if (americains.length === 0) return [];

  const resultats = await Promise.all(
    americains.map(async (s) => {
      try {
        return await depotsRecents(s, { enTetes });
      } catch {
        return [];
      }
    })
  );
  return resultats.flat();
}
