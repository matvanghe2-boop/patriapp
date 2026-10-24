/**
 * Catalogue de référence des dates d'agenda financier.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * Aucune source gratuite ne publie l'agenda à venir des valeurs d'Euronext.
 * Mesuré, pas supposé : sur douze valeurs du CAC, Yahoo n'avait une date de
 * résultats encore à venir que pour quatre d'entre elles ; l'offre gratuite
 * de Twelve Data refuse les symboles Euronext jusque sur `/quote` ; Euronext
 * chiffre les réponses de son propre site ; SEC EDGAR ne couvre que les
 * sociétés américaines.
 *
 * Ces dates existent pourtant. Elles sont publiées par les sociétés
 * elles-mêmes, dans leur communiqué de résultats ou sur la page « agenda
 * financier » de leur site investisseurs.
 *
 * Depuis le 24 octobre 2026, la source info-financiere.gouv.fr
 * (`api/_lib/sources/infoFinanciere.js`) relève automatiquement celles que
 * les sociétés écrivent dans leurs communiqués déposés. Ce catalogue reste
 * pour les dates qu'aucun communiqué ne reprend — celles de la seule page
 * investisseurs — et il garde la priorité sur la source automatique.
 *
 * C'est exactement la situation de `ratesCatalog.js` pour les taux
 * réglementés, et la réponse est la même : une référence tenue à la main,
 * datée et sourcée, vaut mieux qu'une case vide.
 *
 * ─── RÈGLES DE TENUE, À RESPECTER POUR TOUT AJOUT ───────────────────────
 *
 *  1. **Seulement des dates CONFIRMÉES par la société.** Le communiqué de
 *     l'entreprise ou sa page investisseurs font foi. Les agrégateurs
 *     (Zonebourse, abcbourse, investing…) ont été vérifiés et se sont
 *     révélés périmés ou contradictoires : l'un donnait encore le 29 octobre
 *     pour un chiffre d'affaires Schneider publié le 16, un autre le
 *     5 novembre pour une publication Veolia que la société annonce au 6.
 *  2. **Aucune date déduite d'un rythme.** « Les résultats annuels tombent
 *     toujours vers le 20 février, donc ce sera le 20 février » produit une
 *     date fausse qui s'affichera comme une date vraie. S'il n'y a pas de
 *     confirmation, il n'y a pas de ligne.
 *  3. **Chaque entrée porte sa source et sa date de vérification**, pour
 *     qu'on puisse la recontrôler sans refaire l'enquête.
 *
 * Les dates saisies à la main par l'utilisateur priment sur ce catalogue :
 * il connaît ses lignes mieux que cette liste.
 */

/** Date à laquelle les entrées ci-dessous ont été vérifiées une à une. */
export const VERIFIE_LE = "2026-10-19";

/**
 * Un événement = { date, type, label }.
 * `type` reprend les catégories affichées par le calendrier.
 */
export const CALENDRIER_REFERENCE = {
  "TTE.PA": {
    nom: "TotalEnergies",
    source: "https://totalenergies.com/news/calendar",
    evenements: [
      { date: "2026-10-29", type: "Résultats", label: "Résultats du 3e trimestre 2026" },
      { date: "2026-12-31", type: "Dividende", label: "Ex-dividende — 2e acompte 2026" },
      { date: "2027-02-10", type: "Résultats", label: "Résultats du 4e trimestre et de l'exercice 2026" },
      { date: "2027-03-31", type: "Dividende", label: "Ex-dividende — 3e acompte 2026" },
      { date: "2027-04-23", type: "Résultats", label: "Résultats du 1er trimestre 2027" },
      { date: "2027-05-21", type: "Assemblée Générale", label: "Assemblée générale 2027" },
      { date: "2027-06-30", type: "Dividende", label: "Ex-dividende — solde 2026" },
      { date: "2027-07-23", type: "Résultats", label: "Résultats du 2e trimestre et du 1er semestre 2027" },
      { date: "2027-10-28", type: "Résultats", label: "Résultats du 3e trimestre 2027" },
    ],
  },

  "AI.PA": {
    nom: "Air Liquide",
    source: "https://www.airliquide.com/investors/events-calendar",
    evenements: [
      { date: "2026-10-29", type: "Chiffre d'affaires", label: "Chiffre d'affaires du 3e trimestre 2026" },
      // Les résultats annuels 2026 ne sont PAS encore annoncés. Les éditions
      // précédentes sont tombées vers le 20 février, mais extrapoler
      // produirait une date fausse présentée comme vraie.
    ],
  },

  "SU.PA": {
    nom: "Schneider Electric",
    source: "https://www.se.com/ww/en/assets/pdf/release-Q3-revenues-2026",
    evenements: [
      { date: "2027-02-18", type: "Résultats", label: "Résultats annuels 2026" },
      { date: "2027-05-10", type: "Dividende", label: "Ex-dividende — exercice 2026" },
      { date: "2027-05-12", type: "Dividende", label: "Mise en paiement du dividende 2026" },
      // Le chiffre d'affaires du T3 2026 a été publié le 16 octobre 2026 :
      // c'est du passé, et plusieurs agendas tiers l'annonçaient encore au
      // 29 octobre.
    ],
  },

  "VIE.PA": {
    nom: "Veolia",
    source: "https://www.veolia.com/en/our-media/press-releases/2026-first-half-results",
    evenements: [
      { date: "2026-11-06", type: "Chiffre d'affaires", label: "Chiffres clés des 9 premiers mois 2026" },
      { date: "2027-02-17", type: "Résultats", label: "Résultats annuels 2026" },
      // Zonebourse annonce le 5 novembre pour les neuf mois ; le communiqué
      // de la société dit le 6. C'est la société qui fait foi.
    ],
  },

  "DG.PA": {
    nom: "Vinci",
    source: "https://www.vinci.com/vinci.nsf/fr/finance/pages/agenda.htm",
    evenements: [
      { date: "2026-10-22", type: "Chiffre d'affaires", label: "Chiffre d'affaires du 3e trimestre 2026" },
      { date: "2027-04-13", type: "Assemblée Générale", label: "Assemblée générale annuelle" },
      // Les résultats annuels 2026 ne sont pas confirmés à ce jour.
    ],
  },

  "SAN.PA": {
    nom: "Sanofi",
    source: "https://www.sanofi.com/en/investors/financial-results-and-events",
    evenements: [
      { date: "2027-01-28", type: "Résultats", label: "Résultats du 4e trimestre et de l'exercice 2026" },
    ],
  },

  "VU.PA": {
    nom: "VusionGroup",
    source: "https://www.vusion.com/fr/newsroom/chiffre-daffaires-du-1er-trimestre-2026/",
    evenements: [
      { date: "2026-10-20", type: "Chiffre d'affaires", label: "Chiffre d'affaires du 3e trimestre 2026 (après bourse)" },
      // Aucune date 2027 communiquée à ce jour. Les résultats annuels sont
      // tombés le 26 février en 2025 comme en 2026, mais reconduire ce
      // rythme fabriquerait une date que la société n'a pas annoncée.
      //
      // À noter : abcbourse présente la publication du 30 juillet 2026 comme
      // les « résultats du 1er semestre », alors que la société la décrit
      // comme le chiffre d'affaires du S1 — les résultats complets sont
      // venus le 21 septembre. Un libellé d'agrégateur n'est pas une source.
    ],
  },
};

/**
 * Événements de référence pour les tickers suivis, au format du calendrier.
 *
 * Ne renvoie que ce qui concerne les lignes réellement détenues ou
 * surveillées : le catalogue peut grossir sans encombrer l'agenda de
 * quelqu'un qui ne détient aucune de ces valeurs.
 */
export function evenementsReference(tickersSuivis = [], catalogue = CALENDRIER_REFERENCE) {
  const suivis = new Set(tickersSuivis.map((t) => String(t).toUpperCase()));
  const sortie = [];

  for (const [ticker, fiche] of Object.entries(catalogue)) {
    if (!suivis.has(ticker.toUpperCase())) continue;
    for (const e of fiche.evenements) {
      sortie.push({
        ticker,
        name: fiche.nom,
        type: e.type,
        date: e.date,
        label: e.label,
        fournisseur: "reference",
        // Relevée dans le communiqué ou l'agenda officiel de la société :
        // c'est un fait publié, pas une extrapolation.
        statut: "confirme",
        lien: fiche.source,
        verifieLe: VERIFIE_LE,
      });
    }
  }
  return sortie;
}

/** Tickers couverts par le catalogue, pour pouvoir l'annoncer dans l'interface. */
export function tickersCouverts(catalogue = CALENDRIER_REFERENCE) {
  return Object.keys(catalogue);
}
