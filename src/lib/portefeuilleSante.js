import { lireNombre, valeurPosition, tauxPosition, pctPlain } from "./finance";
import { NON_CLASSE } from "./sectors";
import { compositionDe } from "./compositionEtf";
import { valeurParSecteur, partsGeographiques, PAYS_AGREGE } from "./exposition";

/**
 * Santé du portefeuille — quatre risques, mesurés séparément.
 *
 * Un score de diversification existait déjà, isolé et global. Quatre fragilités
 * distinctes se mesurent pourtant à partir des mêmes données, et aucune n'était
 * visible : la concentration sur une ligne, le déséquilibre sectoriel,
 * l'exposition à une devise, et le frottement des frais.
 *
 * LE SCORE GLOBAL N'A D'INTÉRÊT QUE DÉPLIÉ. C'est la composante la plus basse
 * qui dit quoi faire ; la moyenne, elle, ne dit rien — un portefeuille à 68
 * peut être parfaitement équilibré et beaucoup trop concentré, ou l'inverse,
 * et les deux appellent des décisions opposées.
 *
 * Chaque composante renvoie donc sa note ET son constat en clair.
 */

/**
 * Indice de Herfindahl normalisé, ramené sur 100 où 100 = parfaitement réparti.
 *
 * Le HHI est la somme des carrés des parts : il vaut 1 pour une ligne unique et
 * 1/n pour n lignes égales. La normalisation le rend comparable entre
 * portefeuilles de tailles différentes — sans elle, un portefeuille de trois
 * lignes serait mécaniquement « moins bon » qu'un portefeuille de trente, alors
 * que ce n'est pas la même question.
 */
export function scoreRepartition(parts) {
  const valeurs = parts.filter((v) => v > 0);
  const n = valeurs.length;
  if (n === 0) return null;
  if (n === 1) return 0;
  const total = valeurs.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const hhi = valeurs.reduce((s, v) => s + (v / total) ** 2, 0);
  const plancher = 1 / n;
  return Math.max(0, Math.min(100, ((1 - hhi) / (1 - plancher)) * 100));
}

/**
 * @returns {{score: number|null, composantes: object[]}}
 */
export function santePortefeuille(positions = [], { fraisAnnuelsPct = null, secteursManuels = {} } = {}) {
  const lignes = (positions || [])
    .map((p) => ({
      nom: p.name || p.ticker,
      ticker: p.ticker,
      valeur: valeurPosition(p),
      devise: p.currency || "EUR",
      // ETF dont l'indice est au catalogue : déjà réparti sur des centaines
      // de sociétés, il n'est pas une concentration.
      diversifie: Boolean(compositionDe(p.ticker)),
    }))
    .filter((l) => l.valeur > 0);

  if (lignes.length === 0) return { score: null, composantes: [] };

  const total = lignes.reduce((s, l) => s + l.valeur, 0);

  // ── Concentration ────────────────────────────────────────────────────────
  //
  // Un ETF monde pesant 84 % du portefeuille était signalé « critique » comme
  // s'il s'agissait d'une seule action. Or il porte plus d'un millier de
  // sociétés : c'est l'inverse d'une concentration.
  //
  // La note se mesure donc sur les lignes DIRECTES, puis sa pénalité est
  // ramenée à leur poids : 90 % d'ETF monde et 10 % d'une seule action donnent
  // 90, et non 0 — perdre cette action coûterait 10 %, pas tout. Sans ETF, la
  // note est exactement celle d'avant.
  const directes = lignes.filter((l) => !l.diversifie);
  const valeurDirecte = directes.reduce((s, l) => s + l.valeur, 0);
  const partDiversifiee = total > 0 ? ((total - valeurDirecte) / total) * 100 : 0;
  const noteDirecte = directes.length ? scoreRepartition(directes.map((l) => l.valeur)) : 100;
  const concentration = 100 - (100 - noteDirecte) * (valeurDirecte / total);
  const plusGrosse = directes.reduce((m, l) => (!m || l.valeur > m.valeur ? l : m), null);
  const dominante = plusGrosse ? { nom: plusGrosse.nom, part: (plusGrosse.valeur / total) * 100 } : null;

  // ── Secteurs ─────────────────────────────────────────────────────────────
  //
  // ETF décomposés selon leur indice, et « Non classé » MIS À PART : une
  // absence d'information n'est pas un secteur. Compté comme tel, un ETF non
  // décomposé passait pour le secteur dominant et faisait chuter la note.
  const parSecteur = valeurParSecteur(positions, secteursManuels);
  const classes = parSecteur.filter(([nom]) => nom !== NON_CLASSE);
  const valeurClassee = classes.reduce((s, [, v]) => s + v, 0);
  const valeurNonClassee = parSecteur.find(([nom]) => nom === NON_CLASSE)?.[1] || 0;
  const partNonClassee = total > 0 ? (valeurNonClassee / total) * 100 : 0;
  const secteurs = classes.length ? scoreRepartition(classes.map(([, v]) => v)) : null;
  const secteurDominant =
    classes.length && valeurClassee > 0
      ? { nom: classes[0][0], part: (classes[0][1] / valeurClassee) * 100 }
      : null;

  // ── Devises ──────────────────────────────────────────────────────────────
  //
  // Une exposition hors euro n'est pas un défaut en soi — c'est même une
  // diversification. Ce qui se mesure ici, c'est la CONCENTRATION sur une
  // seule devise étrangère, et le fait qu'un taux de change manquant rende la
  // valorisation fausse sans le dire.
  const parDevise = new Map();
  let sansTaux = 0;
  for (const l of lignes) {
    parDevise.set(l.devise, (parDevise.get(l.devise) || 0) + l.valeur);
    const p = positions.find((x) => x.ticker === l.ticker);
    if (l.devise !== "EUR" && tauxPosition(p) === 1) sansTaux += l.valeur;
  }
  const partEuro = (parDevise.get("EUR") || 0) / total;
  const devises =
    parDevise.size === 1 && parDevise.has("EUR")
      ? 100
      : Math.max(0, Math.min(100, scoreRepartition([...parDevise.values()]) * 0.4 + partEuro * 60));

  // ── Frais ────────────────────────────────────────────────────────────────
  //
  // Sans mesure disponible, la composante est ABSENTE plutôt que neutre à 50 :
  // une note inventée pèserait sur le score global exactement comme une vraie.
  const frais =
    fraisAnnuelsPct == null
      ? null
      : Math.max(0, Math.min(100, 100 - (lireNombre(fraisAnnuelsPct) ?? 0) * 40));

  const composantes = [
    {
      cle: "concentration",
      libelle: "Concentration",
      note: concentration,
      constat: !dominante
        ? "Tout le portefeuille est en ETF diversifiés."
        : partDiversifiee > 0
          ? `${dominante.nom} pèse ${pctPlain(dominante.part, 0)} du portefeuille ; les ETF diversifiés (${pctPlain(partDiversifiee, 0)}) comptent comme déjà répartis.`
          : `${dominante.nom} pèse ${pctPlain(dominante.part, 0)} du portefeuille.`,
      seuil: dominante && dominante.part >= 40 ? "critique" : dominante && dominante.part >= 25 ? "attention" : "ok",
    },
    {
      cle: "secteurs",
      libelle: "Secteurs",
      note: secteurs,
      // Part rapportée à la valeur CLASSÉE quand il existe du non classé :
      // c'est sur elle que la note est calculée, et un seuil mesuré sur une
      // autre base contredirait la note affichée à côté.
      constat: !secteurDominant
        ? "Aucune ligne n'a de secteur connu : choisis-le dans la répartition sectorielle."
        : partNonClassee > 0
          ? `${secteurDominant.nom} représente ${pctPlain(secteurDominant.part, 0)} de la part classée ; ${pctPlain(partNonClassee, 0)} non classé, hors de ce calcul.`
          : `${secteurDominant.nom} représente ${pctPlain(secteurDominant.part, 0)} du portefeuille.`,
      seuil: !secteurDominant
        ? "neutre"
        : secteurDominant.part >= 50
          ? "critique"
          : secteurDominant.part >= 35
            ? "attention"
            : "ok",
    },
    {
      cle: "devises",
      libelle: "Devises",
      note: devises,
      constat:
        sansTaux > 0
          ? `${pctPlain(((sansTaux / total) * 100), 0)} du portefeuille est compté à parité faute de taux de change.`
          : parDevise.size === 1
            ? "Tout est libellé en euros."
            : `${pctPlain((partEuro * 100), 0)} en euros.`,
      seuil: sansTaux > 0 ? "critique" : partEuro < 0.3 ? "attention" : "ok",
    },
    {
      cle: "frais",
      libelle: "Frais",
      note: frais,
      constat:
        frais == null
          ? "Aucun frottement mesuré : saisis tes ordres pour l'obtenir."
          : `${pctPlain(lireNombre(fraisAnnuelsPct) ?? 0, 2)} de frottement annuel.`,
      seuil: frais == null ? "neutre" : frais < 60 ? "attention" : "ok",
    },
  ];

  const mesurees = composantes.filter((c) => Number.isFinite(c.note));
  const score = mesurees.length
    ? mesurees.reduce((s, c) => s + c.note, 0) / mesurees.length
    : null;

  return { score, composantes, total, lignes, partDiversifiee, partNonClassee };
}

/**
 * Exposition géographique.
 *
 * La répartition sectorielle existait ; la géographique non — alors que c'est
 * la première question d'un portefeuille censé être diversifié. Un PEA « bien
 * réparti » peut être français à 80 %.
 *
 * Le pays vient, dans l'ordre : de la fiche de l'indice pour un ETF au
 * catalogue, du pays enregistré sur la ligne, puis de la place de cotation
 * (voir exposition.js). La carte restait sinon toujours vide : elle promettait
 * un pays « renseigné en consultant la fiche dans Marché », mais rien ne
 * l'enregistrait jamais.
 *
 * Une ligne dont le pays reste inconnu — un fonds hors catalogue — est comptée
 * à part et JAMAIS répartie au prorata : l'inventer donnerait une carte fausse
 * dont rien ne signalerait l'approximation.
 */
export function expositionGeographique(positions = []) {
  const { parts, inconnu, total } = partsGeographiques(positions);
  if (total <= 0) return { pays: [], inconnu: 0, total: 0 };

  const parPays = new Map();
  let parCotation = 0;
  let parIndice = 0;
  for (const part of parts) {
    parPays.set(part.pays, (parPays.get(part.pays) || 0) + part.valeur);
    if (part.origine === "cotation") parCotation += part.valeur;
    if (part.origine === "indice") parIndice += part.valeur;
  }

  return {
    total,
    inconnu,
    partInconnue: (inconnu / total) * 100,
    // Part dont le pays est DÉDUIT de la place de cotation : à dire à l'écran.
    partCotation: (parCotation / total) * 100,
    partIndice: (parIndice / total) * 100,
    pays: [...parPays.entries()]
      .map(([nom, valeur]) => ({ nom, valeur, part: (valeur / total) * 100, agrege: nom === PAYS_AGREGE }))
      .sort((a, b) => b.valeur - a.valeur),
  };
}
