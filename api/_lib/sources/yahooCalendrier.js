/**
 * Source Yahoo « visualization » — le backend de SON propre calendrier.
 *
 * POURQUOI UNE TROISIÈME ENTRÉE CHEZ LE MÊME FOURNISSEUR
 *
 * `v7/finance/quote` et `v10/quoteSummary` ne renvoient qu'UNE prochaine date
 * de résultats, et rien d'autre. Mesuré sur douze valeurs du CAC : seules
 * quatre portaient une date de résultats encore à venir, et deux une date de
 * dividende à venir. Pour Air Liquide, la dernière date connue remontait à
 * juillet — le calendrier paraissait donc vide alors que la ligne était bien
 * suivie.
 *
 * L'endpoint `v1/finance/visualization` est celui qui alimente les pages
 * calendrier de Yahoo. Il expose une table d'événements datés, avec leur
 * libellé complet, et surtout deux choses que les autres n'ont pas :
 *
 *   - les ASSEMBLÉES GÉNÉRALES (« Annual Shareholders Meeting »), dont le
 *     README affirmait jusqu'ici qu'aucun endpoint public ne les fournissait ;
 *   - les conférences de résultats nommées par exercice (« Q3 2026 … Earnings
 *     Call »), ce qui permet de qualifier la publication au lieu d'afficher un
 *     « Résultats » générique.
 *
 * LIMITES, mesurées et non supposées
 *
 * Il ne crée pas de dates qui n'existent pas : pour une société qui n'a pas
 * encore publié son agenda, il ne renvoie que du passé. Son apport est
 * l'ÉTENDUE (AG, libellés qualifiés, historique), pas la divination.
 *
 * Endpoint non documenté, comme le reste de l'accès Yahoo : tout échec est
 * absorbé par l'appelant.
 */

import { cached } from "../http.js";
import { YF_HEADERS, getYahooSession } from "../yahoo.js";

const URL_VISUALISATION = "https://query1.finance.yahoo.com/v1/finance/visualization";
const CACHE_MS = 60 * 60_000;
const DELAI_MS = 8000;

const CHAMPS = ["startdatetime", "ticker", "companyshortname", "epsestimate", "eventname"];

/**
 * Qualifie l'événement à partir de son libellé Yahoo.
 *
 * Le tri compte : « Annual Shareholders Meeting » doit être reconnu AVANT la
 * règle générale, sinon une assemblée générale finirait classée en résultats.
 */
export function typerEvenement(eventname = "") {
  const n = String(eventname).toLowerCase();
  if (n.includes("shareholders meeting") || n.includes("annual meeting")) {
    return { type: "Assemblée Générale", label: "Assemblée générale" };
  }
  if (n.includes("earnings call")) {
    // Le libellé Yahoo commence par l'exercice (« Q3 2026 … »), qu'on garde :
    // c'est lui qui distingue un trimestre d'un exercice complet.
    const exercice = String(eventname).match(/^(Q[1-4]\s*\d{4}|Full Year\s*\d{4}|H[12]\s*\d{4})/i);
    return {
      type: "Communication",
      label: exercice ? `Conférence de résultats — ${exercice[1]}` : "Conférence de résultats",
    };
  }
  return { type: "Résultats", label: "Publication des résultats" };
}

async function interroger(symbole, crumb, cookie) {
  const corps = {
    sortField: "startdatetime",
    // DESCENDANT : la table remonte à 1993 pour certaines valeurs. Trié à
    // l'endroit, on ne recevrait que des événements des années 90 et il
    // faudrait pagine r pour atteindre le présent. Un filtre de date serait
    // plus direct, mais l'endpoint refuse l'opérande (`Invalid operand type
    // for field=startdatetime`), quelle que soit la forme essayée.
    sortType: "DESC",
    entityIdType: "earnings",
    includeFields: CHAMPS,
    query: { operator: "and", operands: [{ operator: "eq", operands: ["ticker", symbole] }] },
    offset: 0,
    size: 25,
  };

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MS);
  try {
    const r = await fetch(`${URL_VISUALISATION}?crumb=${encodeURIComponent(crumb)}`, {
      method: "POST",
      headers: { ...YF_HEADERS, Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Profondeur d'historique conservée.
 *
 * La table remonte à 2019 pour certaines valeurs — vingt-huit lignes pour
 * Sanofi, vingt-neuf pour Apple. Un calendrier qui déverse six ans de
 * publications passées noie les deux dates qui comptent. On garde quatre mois
 * en arrière : assez pour montrer la dernière publication connue quand rien
 * n'est encore annoncé, pas assez pour encombrer.
 */
const HISTORIQUE_JOURS = 120;

/** Transforme la réponse tabulaire en événements de calendrier. */
export function lireDocument(json, symbole, formaterDate, maintenant = new Date()) {
  const doc = json?.finance?.result?.[0]?.documents?.[0];
  if (!doc?.columns || !doc?.rows) return [];

  const colonnes = doc.columns.map((c) => c.id);
  const plancher = new Date(maintenant.getTime() - HISTORIQUE_JOURS * 86400000);
  const evenements = [];

  for (const ligne of doc.rows) {
    const o = Object.fromEntries(colonnes.map((c, i) => [c, ligne[i]]));
    if (!o.startdatetime) continue;

    const d = new Date(o.startdatetime);
    if (Number.isNaN(d.getTime())) continue;
    if (d < plancher) continue;

    const { type, label } = typerEvenement(o.eventname);
    evenements.push({
      ticker: symbole,
      name: o.companyshortname || symbole,
      type,
      date: formaterDate(Math.floor(d.getTime() / 1000)),
      label,
      fournisseur: "yahoo",
      // Ces lignes décrivent des événements programmés et nommés par la
      // société : plus fiables qu'une date extrapolée, sans valoir un dépôt
      // réglementaire. `fusionnerEvenements` tranchera si une autre source
      // confirme la même date.
      statut: "confirme",
      ...(o.epsestimate != null ? { estimates: { beneficeAttendu: o.epsestimate } } : {}),
    });
  }
  return evenements;
}

/**
 * Événements de calendrier pour une liste de symboles.
 * Un échec par symbole ne fait jamais tomber le lot.
 */
export async function evenementsCalendrierYahoo(symboles = [], formaterDate) {
  if (symboles.length === 0) return [];
  let session;
  try {
    session = await getYahooSession();
  } catch {
    return [];
  }

  const resultats = await Promise.all(
    symboles.map(async (s) => {
      try {
        const json = await cached(`visu:${s}`, CACHE_MS, () =>
          interroger(s, session.crumb, session.cookie)
        );
        return lireDocument(json, s, formaterDate);
      } catch {
        return [];
      }
    })
  );
  return resultats.flat();
}
