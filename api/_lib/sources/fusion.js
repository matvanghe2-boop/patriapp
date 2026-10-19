/**
 * Fusion des sources du calendrier — provenance, statut, dédoublonnage.
 *
 * Deux sources décrivent le même monde avec des garanties différentes :
 * Yahoo annonce des dates À VENIR, dont certaines ne sont qu'extrapolées du
 * rythme des trimestres précédents ; EDGAR atteste des dépôts PASSÉS, à date
 * certaine. Les afficher sans les distinguer revenait à présenter une
 * estimation et un fait avec la même autorité.
 *
 * Chaque événement porte donc désormais trois attributs :
 *   - `statut` : "confirme" ou "estime" ;
 *   - `source` : qui l'a fourni ;
 *   - `majLe`  : quand l'information a été relue.
 */

/**
 * Statut d'un événement Yahoo.
 *
 * Yahoo ne publie pas de drapeau « confirmé ». Mais il renvoie, selon sa
 * confiance, soit une date ponctuelle, soit une FOURCHETTE début/fin — et
 * c'est exactement l'aveu qu'on cherche : une fourchette signifie que la
 * société n'a pas encore communiqué sa date. Le reste du code transmet cette
 * distinction via `fourchette`.
 *
 * Une date déjà passée est tenue pour acquise : elle a eu lieu.
 */
export function statutYahoo(evenement, aujourdhui) {
  if (evenement?.fourchette) return "estime";
  if (evenement?.date && aujourdhui && evenement.date < aujourdhui) return "confirme";
  // Un dividende est voté puis annoncé : sa date ex est ferme dès qu'elle
  // existe. Les résultats futurs, eux, restent des prévisions.
  if (evenement?.type === "Dividende") return "confirme";
  return "estime";
}

/** Clé d'identité d'un événement : même titre, même type, même jour. */
function cle(e) {
  return `${e.ticker}|${e.type}|${e.date}`;
}

/**
 * Ordre de préférence des sources en cas de doublon.
 *
 * La saisie manuelle prime sur tout : si l'utilisateur a relevé la date sur
 * l'agenda financier de la société, elle vaut mieux qu'une estimation de
 * fournisseur — et il n'y a aucune raison qu'un rafraîchissement automatique
 * vienne l'écraser. Vient ensuite le dépôt réglementaire, qui est un fait
 * daté, puis l'annonce Yahoo.
 */
const RANG_SOURCE = { manuel: 3, "sec-edgar": 2, yahoo: 1 };

/**
 * Fusionne plusieurs listes d'événements.
 *
 * Deux événements qui décrivent le même fait (même titre, même type, même
 * jour) n'en forment plus qu'un : on garde celui de la source la mieux
 * placée, en conservant les informations que l'autre était seule à porter
 * (estimations d'analystes côté Yahoo, lien vers le document côté EDGAR), et
 * en mémorisant que les deux sources concordent — ce qui est en soi une
 * confirmation.
 */
export function fusionnerEvenements(listes = [], { maintenant = new Date() } = {}) {
  const majLe = maintenant.toISOString();
  const parCle = new Map();

  for (const evenement of listes.flat()) {
    if (!evenement?.date || !evenement?.ticker) continue;
    const k = cle(evenement);
    const candidat = {
      ...evenement,
      // `fournisseur` et non `source` : côté client, `source` désigne déjà
      // l'ORIGINE de la ligne (portefeuille ou watchlist) et est réécrite à
      // la réception. Y loger la provenance de la donnée l'aurait fait
      // disparaître en silence, sans la moindre erreur.
      fournisseur: evenement.fournisseur || "yahoo",
      statut: evenement.statut || "estime",
      majLe,
    };

    const existant = parCle.get(k);
    if (!existant) {
      parCle.set(k, candidat);
      continue;
    }

    // Les deux sources disent la même chose : le fait est corroboré.
    const gagnant =
      (RANG_SOURCE[candidat.fournisseur] || 0) > (RANG_SOURCE[existant.fournisseur] || 0)
        ? candidat
        : existant;
    const perdant = gagnant === candidat ? existant : candidat;

    parCle.set(k, {
      // Les champs du perdant servent de socle : il peut porter des données
      // que le gagnant n'a pas (les estimations d'analystes, par exemple).
      ...perdant,
      ...gagnant,
      // `undefined` écraserait une valeur existante lors de l'étalement.
      estimates: gagnant.estimates ?? perdant.estimates,
      lien: gagnant.lien ?? perdant.lien,
      // Deux sources concordantes valent confirmation, quel que soit le
      // statut que chacune portait isolément.
      statut: gagnant.statut === "confirme" || perdant.statut === "confirme" ? "confirme" : "estime",
      fournisseurs: [...new Set([gagnant.fournisseur, perdant.fournisseur])],
      majLe,
    });
  }

  return [...parCle.values()].sort((a, b) =>
    a.date === b.date ? a.ticker.localeCompare(b.ticker) : a.date.localeCompare(b.date)
  );
}
