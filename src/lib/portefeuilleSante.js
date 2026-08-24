import { lireNombre, valeurPosition, tauxPosition } from "./finance";
import { getSector } from "./sectors";

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

/** Part de la plus grosse ligne, en pourcentage. */
function partDominante(entrees) {
  const total = entrees.reduce((s, e) => s + e.valeur, 0);
  if (total <= 0) return null;
  const max = entrees.reduce((m, e) => (e.valeur > m.valeur ? e : m), entrees[0]);
  return { nom: max.nom, part: (max.valeur / total) * 100 };
}

/**
 * @returns {{score: number|null, composantes: object[]}}
 */
export function santePortefeuille(positions = [], { fraisAnnuelsPct = null } = {}) {
  const lignes = (positions || [])
    .map((p) => ({
      nom: p.name || p.ticker,
      ticker: p.ticker,
      valeur: valeurPosition(p),
      devise: p.currency || "EUR",
      secteur: getSector(p.ticker) || p.secteur || "Non classé",
    }))
    .filter((l) => l.valeur > 0);

  if (lignes.length === 0) return { score: null, composantes: [] };

  const total = lignes.reduce((s, l) => s + l.valeur, 0);

  // ── Concentration ────────────────────────────────────────────────────────
  const concentration = scoreRepartition(lignes.map((l) => l.valeur));
  const dominante = partDominante(lignes);

  // ── Secteurs ─────────────────────────────────────────────────────────────
  const parSecteur = new Map();
  for (const l of lignes) parSecteur.set(l.secteur, (parSecteur.get(l.secteur) || 0) + l.valeur);
  const secteurs = scoreRepartition([...parSecteur.values()]);
  const secteurDominant = partDominante(
    [...parSecteur.entries()].map(([nom, valeur]) => ({ nom, valeur }))
  );

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
      constat: dominante
        ? `${dominante.nom} pèse ${dominante.part.toFixed(0)} % du portefeuille.`
        : null,
      seuil: dominante && dominante.part >= 40 ? "critique" : dominante && dominante.part >= 25 ? "attention" : "ok",
    },
    {
      cle: "secteurs",
      libelle: "Secteurs",
      note: secteurs,
      constat: secteurDominant
        ? `${secteurDominant.nom} représente ${secteurDominant.part.toFixed(0)} % des lignes.`
        : null,
      seuil: secteurDominant && secteurDominant.part >= 50 ? "critique" : secteurDominant && secteurDominant.part >= 35 ? "attention" : "ok",
    },
    {
      cle: "devises",
      libelle: "Devises",
      note: devises,
      constat:
        sansTaux > 0
          ? `${((sansTaux / total) * 100).toFixed(0)} % du portefeuille est compté à parité faute de taux de change.`
          : parDevise.size === 1
            ? "Tout est libellé en euros."
            : `${(partEuro * 100).toFixed(0)} % en euros.`,
      seuil: sansTaux > 0 ? "critique" : partEuro < 0.3 ? "attention" : "ok",
    },
    {
      cle: "frais",
      libelle: "Frais",
      note: frais,
      constat:
        frais == null
          ? "Aucun frottement mesuré : saisis tes ordres pour l'obtenir."
          : `${(lireNombre(fraisAnnuelsPct) ?? 0).toFixed(2)} % de frottement annuel.`,
      seuil: frais == null ? "neutre" : frais < 60 ? "attention" : "ok",
    },
  ];

  const mesurees = composantes.filter((c) => Number.isFinite(c.note));
  const score = mesurees.length
    ? mesurees.reduce((s, c) => s + c.note, 0) / mesurees.length
    : null;

  return { score, composantes, total, lignes };
}

/**
 * Exposition géographique.
 *
 * La répartition sectorielle existait ; la géographique non — alors que c'est
 * la première question d'un portefeuille censé être diversifié. Un PEA « bien
 * réparti » peut être français à 80 %.
 *
 * Le pays vient de la fiche entreprise, mémorisée sur la position au fil des
 * consultations. Une ligne dont le pays est inconnu est comptée à part et
 * JAMAIS répartie au prorata : l'inventer donnerait une carte fausse dont rien
 * ne signalerait l'approximation.
 */
export function expositionGeographique(positions = []) {
  const parPays = new Map();
  let inconnu = 0;
  let total = 0;

  for (const p of positions || []) {
    const v = valeurPosition(p);
    if (v <= 0) continue;
    total += v;
    const pays = p.pays || p.country || null;
    if (!pays) {
      inconnu += v;
      continue;
    }
    parPays.set(pays, (parPays.get(pays) || 0) + v);
  }

  if (total <= 0) return { pays: [], inconnu: 0, total: 0 };

  return {
    total,
    inconnu,
    partInconnue: (inconnu / total) * 100,
    pays: [...parPays.entries()]
      .map(([nom, valeur]) => ({ nom, valeur, part: (valeur / total) * 100 }))
      .sort((a, b) => b.valeur - a.valeur),
  };
}
