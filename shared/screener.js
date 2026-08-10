/**
 * Moteur de screener — critères, recettes et évaluation.
 *
 * Deux partis pris structurent ce fichier.
 *
 * **Un screener doit dire pourquoi.** `evaluerTitre` ne rend pas un booléen
 * mais le détail critère par critère : ce qui était attendu, ce qui a été
 * constaté, et si ça passe. Un filtre qui se contente de faire disparaître des
 * lignes n'apprend rien, et on finit par lui faire confiance sans savoir sur
 * quoi.
 *
 * **Une donnée manquante n'est pas un échec.** Yahoo ne publie pas tous les
 * ratios pour tous les titres — le payout d'une société qui ne distribue pas,
 * le PER d'une société en perte. Traiter l'absence comme un rejet exclurait
 * des titres pour une raison qui n'a rien à voir avec le critère. Ces cas
 * ressortent en `indetermine`, comptés à part et affichés comme tels.
 *
 * Ce module est pur : aucune requête réseau, aucune dépendance React. Il est
 * partagé entre le navigateur et les fonctions serverless.
 */

/** Sens de comparaison d'un critère. */
export const SENS = { MIN: "min", MAX: "max" };

/**
 * Catalogue des critères disponibles.
 * `cle` correspond au champ renvoyé par /api/screen.
 */
export const CRITERES = {
  per: { libelle: "PER", sens: SENS.MAX, unite: "×", aide: "Cours rapporté au bénéfice par action des douze derniers mois." },
  perForward: { libelle: "PER estimé", sens: SENS.MAX, unite: "×", aide: "Cours rapporté au bénéfice attendu sur l'exercice à venir." },
  peg: { libelle: "PEG", sens: SENS.MAX, unite: "", aide: "PER divisé par la croissance attendue. Sous 1, la croissance n'est pas encore payée." },
  priceToBook: { libelle: "Cours / actif net", sens: SENS.MAX, unite: "×", aide: "Rapport entre la capitalisation et les capitaux propres comptables." },
  evEbitda: { libelle: "VE / EBITDA", sens: SENS.MAX, unite: "×", aide: "Valeur d'entreprise sur excédent brut d'exploitation — insensible à la structure de dette." },
  rendementPct: { libelle: "Rendement du dividende", sens: SENS.MIN, unite: "%", aide: "Dividende annuel rapporté au cours." },
  payoutPct: { libelle: "Taux de distribution", sens: SENS.MAX, unite: "%", aide: "Part du bénéfice versée en dividende. Au-delà de 80 %, la marge de sécurité est mince." },
  roePct: { libelle: "Rentabilité des capitaux propres", sens: SENS.MIN, unite: "%", aide: "Bénéfice rapporté aux capitaux propres." },
  margeNettePct: { libelle: "Marge nette", sens: SENS.MIN, unite: "%", aide: "Bénéfice net rapporté au chiffre d'affaires." },
  margeOperationnellePct: { libelle: "Marge opérationnelle", sens: SENS.MIN, unite: "%", aide: "Résultat d'exploitation rapporté au chiffre d'affaires." },
  detteSurFondsPropresPct: { libelle: "Dette / capitaux propres", sens: SENS.MAX, unite: "%", aide: "Endettement rapporté aux capitaux propres." },
  ratioLiquidite: { libelle: "Ratio de liquidité", sens: SENS.MIN, unite: "", aide: "Actif courant sur passif courant. Sous 1, le court terme est tendu." },
  capitalisation: { libelle: "Capitalisation", sens: SENS.MIN, unite: "€", aide: "Valeur boursière totale." },
  beta: { libelle: "Bêta", sens: SENS.MAX, unite: "", aide: "Amplitude des variations par rapport au marché. Sous 1, le titre bouge moins que l'indice." },
  positionFourchettePct: { libelle: "Position dans la fourchette 52 s.", sens: SENS.MIN, unite: "%", aide: "0 % = au plus bas de l'année, 100 % = au plus haut." },
};

/**
 * Recettes prêtes à l'emploi.
 *
 * Chacune assume une doctrine et l'annonce : un screener sans point de vue
 * n'est qu'une grille de curseurs vides, qu'on regarde une fois. Les seuils
 * sont des repères courants de l'analyse fondamentale, pas des vérités — ils
 * restent modifiables critère par critère dans l'interface.
 */
export const RECETTES = [
  {
    id: "dividende-solide",
    nom: "Dividende solide",
    resume: "Rendement correct, mais surtout tenable dans la durée.",
    pourquoi:
      "Le rendement seul est trompeur : un titre qui chute affiche mécaniquement un rendement élevé. Le taux de distribution et la rentabilité disent si le dividende est finançable.",
    criteres: [
      { cle: "rendementPct", seuil: 3 },
      { cle: "payoutPct", seuil: 70 },
      { cle: "roePct", seuil: 10 },
    ],
  },
  {
    id: "value",
    nom: "Value",
    resume: "Sociétés peu chères au regard de leurs actifs et de leurs bénéfices.",
    pourquoi:
      "Filtre d'inspiration Graham : payer peu par rapport à l'actif net et au bénéfice, en écartant les bilans trop endettés.",
    criteres: [
      { cle: "per", seuil: 15 },
      { cle: "priceToBook", seuil: 1.5 },
      { cle: "detteSurFondsPropresPct", seuil: 100 },
    ],
  },
  {
    id: "qualite",
    nom: "Qualité à prix raisonnable",
    resume: "Entreprises très rentables, sans payer n'importe quel prix.",
    pourquoi:
      "Une rentabilité élevée et durable finit par se payer. Le plafond de valorisation évite de confondre bonne entreprise et bon investissement.",
    criteres: [
      { cle: "roePct", seuil: 15 },
      { cle: "margeNettePct", seuil: 10 },
      { cle: "per", seuil: 25 },
    ],
  },
  {
    id: "defensif",
    nom: "Défensif",
    resume: "Peu volatil, bilan sain, dividende présent.",
    pourquoi:
      "Pensé pour la poche stable d'un portefeuille : un bêta faible amortit les secousses, un ratio de liquidité correct évite les mauvaises surprises.",
    criteres: [
      { cle: "beta", seuil: 1 },
      { cle: "ratioLiquidite", seuil: 1 },
      { cle: "rendementPct", seuil: 2 },
    ],
  },
  {
    id: "momentum",
    nom: "Momentum",
    resume: "Titres proches de leur plus haut annuel, avec des marges qui tiennent.",
    pourquoi:
      "Un cours proche de son plus haut traduit souvent une dynamique persistante. Le critère de marge écarte les hausses purement spéculatives.",
    criteres: [
      { cle: "positionFourchettePct", seuil: 70 },
      { cle: "margeOperationnellePct", seuil: 10 },
    ],
  },
  {
    id: "decote",
    nom: "Repli sur des sociétés rentables",
    resume: "Bas de fourchette annuelle, mais fondamentaux intacts.",
    pourquoi:
      "L'inverse du momentum : chercher un point d'entrée sur des sociétés dont le cours a reculé sans que la rentabilité se dégrade.",
    criteres: [
      { cle: "positionFourchettePct", seuil: 35, sensInverse: true },
      { cle: "roePct", seuil: 12 },
      { cle: "margeNettePct", seuil: 8 },
    ],
  },
];

export function recetteParId(id) {
  return RECETTES.find((r) => r.id === id) ?? null;
}

/**
 * Évalue un critère sur un titre.
 * `sensInverse` retourne la comparaison d'un critère du catalogue — utile pour
 * « position basse dans la fourchette », qui utilise le même champ que le
 * momentum mais dans l'autre sens.
 */
export function evaluerCritere(titre, { cle, seuil, sensInverse = false }) {
  const definition = CRITERES[cle];
  if (!definition) return null;

  const valeur = titre?.[cle];
  const sens = sensInverse
    ? definition.sens === SENS.MIN ? SENS.MAX : SENS.MIN
    : definition.sens;

  if (valeur == null || !Number.isFinite(valeur)) {
    return { cle, libelle: definition.libelle, seuil, sens, valeur: null, statut: "indetermine", unite: definition.unite };
  }

  const passe = sens === SENS.MIN ? valeur >= seuil : valeur <= seuil;
  return {
    cle,
    libelle: definition.libelle,
    seuil,
    sens,
    valeur,
    unite: definition.unite,
    statut: passe ? "ok" : "echec",
  };
}

/**
 * Évalue un titre contre une liste de critères.
 *
 * Un titre est retenu s'il ne rate AUCUN critère renseigné. Les critères
 * indéterminés ne le disqualifient pas, mais sont comptés : un titre retenu
 * sur deux critères évalués et trois indéterminés n'a pas la même valeur qu'un
 * titre retenu sur cinq, et l'interface doit pouvoir le montrer.
 */
export function evaluerTitre(titre, criteres = []) {
  const details = criteres.map((c) => evaluerCritere(titre, c)).filter(Boolean);
  const echecs = details.filter((d) => d.statut === "echec");
  const indetermines = details.filter((d) => d.statut === "indetermine");
  const reussis = details.filter((d) => d.statut === "ok");

  return {
    symbole: titre?.symbole ?? null,
    retenu: echecs.length === 0 && reussis.length > 0,
    details,
    nbReussis: reussis.length,
    nbEchecs: echecs.length,
    nbIndetermines: indetermines.length,
    // Sur combien de critères réellement évaluables le titre a-t-il été jugé.
    fiabilite: details.length > 0 ? reussis.length + echecs.length : 0,
  };
}

/**
 * Applique une recette à un univers de titres.
 * Les titres retenus sortent en premier, puis ceux qui ratent le moins de
 * critères — un titre à un seul échec mérite d'être vu, pas enterré.
 */
export function appliquerRecette(univers = [], criteres = []) {
  const evalues = univers
    .filter((t) => t && t.ok !== false)
    .map((t) => ({ titre: t, evaluation: evaluerTitre(t, criteres) }));

  return evalues.sort((a, b) => {
    if (a.evaluation.retenu !== b.evaluation.retenu) return a.evaluation.retenu ? -1 : 1;
    if (a.evaluation.nbEchecs !== b.evaluation.nbEchecs) return a.evaluation.nbEchecs - b.evaluation.nbEchecs;
    return b.evaluation.nbReussis - a.evaluation.nbReussis;
  });
}

/**
 * Screener retourné : applique les critères aux titres DÉTENUS.
 *
 * C'est la question qu'on ne se pose jamais spontanément — non pas « qu'est-ce
 * que j'achète ? » mais « est-ce que ce que je détiens passerait encore le
 * filtre qui me l'a fait acheter ? ».
 *
 * @param positions   lignes du portefeuille ({ ticker, quantity, ... })
 * @param fondamentaux ratios indexés par symbole
 */
export function auditerPortefeuille(positions = [], fondamentaux = [], criteres = []) {
  const parSymbole = new Map(fondamentaux.filter((f) => f?.symbole).map((f) => [f.symbole.toUpperCase(), f]));

  return positions
    .map((p) => {
      const ticker = String(p?.ticker || "").toUpperCase();
      const titre = parSymbole.get(ticker);
      if (!titre || titre.ok === false) {
        return { position: p, titre: null, evaluation: null, indisponible: true };
      }
      return { position: p, titre, evaluation: evaluerTitre(titre, criteres), indisponible: false };
    })
    .sort((a, b) => {
      // Ce qui décroche en premier : c'est là qu'il y a une décision à prendre.
      if (a.indisponible !== b.indisponible) return a.indisponible ? 1 : -1;
      return (b.evaluation?.nbEchecs ?? 0) - (a.evaluation?.nbEchecs ?? 0);
    });
}

/**
 * Suggestions de diversification : titres de l'univers appartenant aux
 * secteurs les moins représentés dans le portefeuille.
 *
 * Le screener cesse d'être un catalogue pour devenir une réponse à
 * l'allocation réelle.
 *
 * @param poidsParSecteur  { "Technology": 42.3, ... } en pourcentage
 */
export function suggererDiversification(univers = [], poidsParSecteur = {}, { exclure = [], limite = 8 } = {}) {
  const dejaDetenus = new Set(exclure.map((t) => String(t).toUpperCase()));

  const candidats = univers.filter(
    (t) => t && t.ok !== false && t.secteur && !dejaDetenus.has(String(t.symbole).toUpperCase())
  );

  // Un secteur absent du portefeuille pèse 0 : c'est le cas le plus intéressant,
  // et il doit remonter en tête plutôt que d'être ignoré faute de clé.
  const poids = (secteur) => poidsParSecteur[secteur] ?? 0;

  const secteursTries = [...new Set(candidats.map((t) => t.secteur))].sort((a, b) => poids(a) - poids(b));

  const sorties = [];
  // Un tour par secteur avant d'en reprendre un second : sans ça, le secteur
  // le plus fourni en titres monopoliserait toute la liste.
  for (let rang = 0; sorties.length < limite && rang < 10; rang++) {
    for (const secteur of secteursTries) {
      if (sorties.length >= limite) break;
      const duSecteur = candidats
        .filter((t) => t.secteur === secteur)
        .sort((a, b) => (b.roePct ?? -Infinity) - (a.roePct ?? -Infinity));
      if (duSecteur[rang]) {
        sorties.push({ titre: duSecteur[rang], secteur, poidsActuelPct: poids(secteur) });
      }
    }
  }

  return sorties;
}

/** Répartition sectorielle d'un portefeuille, en pourcentage de sa valeur. */
export function poidsSectoriels(positions = [], fondamentaux = [], valeurDe = (p) => p.quantity * p.current_price) {
  const parSymbole = new Map(fondamentaux.filter((f) => f?.symbole).map((f) => [f.symbole.toUpperCase(), f]));
  const parSecteur = {};
  let total = 0;

  for (const p of positions) {
    const valeur = valeurDe(p) || 0;
    if (valeur <= 0) continue;
    total += valeur;
    const secteur = parSymbole.get(String(p?.ticker || "").toUpperCase())?.secteur || "Non classé";
    parSecteur[secteur] = (parSecteur[secteur] || 0) + valeur;
  }

  if (total <= 0) return {};
  return Object.fromEntries(Object.entries(parSecteur).map(([s, v]) => [s, (v / total) * 100]));
}
