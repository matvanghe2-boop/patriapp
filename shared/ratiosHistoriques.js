/**
 * Ratios reconstitués exercice par exercice, à partir des comptes publiés.
 *
 * Un ratio sans historique ne dit presque rien : « PER 30,9 » ne devient
 * interprétable qu'à côté de « moyenne 24,1 sur quatre exercices ». C'est la
 * différence entre une donnée et un jugement.
 *
 * Tous les ratios ci-dessous sont **calculés**, jamais estimés : chacun est le
 * rapport de deux postes réellement publiés. Le PER historique en particulier
 * utilise le bénéfice par action dilué de l'exercice et le cours de clôture de
 * l'époque — pas le nombre d'actions d'aujourd'hui, qui fausserait toute
 * société ayant racheté ses titres.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

const rapport = (numerateur, denominateur, facteur = 1) => {
  if (numerateur == null || denominateur == null) return null;
  if (!Number.isFinite(numerateur) || !Number.isFinite(denominateur) || denominateur === 0) return null;
  return (numerateur / denominateur) * facteur;
};

/**
 * Définition des ratios dérivables d'un exercice.
 * `meilleur` indique le sens favorable, pour colorer un écart à la moyenne.
 */
export const RATIOS_HISTORIQUES = {
  margeNettePct: {
    libelle: "Marge nette",
    unite: "%",
    meilleur: "haut",
    calcul: (e) => rapport(e.NetIncome, e.TotalRevenue, 100),
  },
  margeEbitdaPct: {
    libelle: "Marge d'EBITDA",
    unite: "%",
    meilleur: "haut",
    calcul: (e) => rapport(e.EBITDA, e.TotalRevenue, 100),
  },
  roePct: {
    libelle: "Rentabilité des capitaux propres",
    unite: "%",
    meilleur: "haut",
    calcul: (e) => rapport(e.NetIncome, e.StockholdersEquity, 100),
  },
  detteSurFondsPropresPct: {
    libelle: "Dette / capitaux propres",
    unite: "%",
    meilleur: "bas",
    calcul: (e) => rapport(e.TotalDebt, e.StockholdersEquity, 100),
  },
  capexSurCaPct: {
    libelle: "Investissements / chiffre d'affaires",
    unite: "%",
    meilleur: "bas",
    // Le capex est publié en négatif : on en prend la valeur absolue, sinon le
    // ratio serait négatif et sa moyenne illisible.
    calcul: (e) => rapport(Math.abs(e.CapitalExpenditure ?? NaN), e.TotalRevenue, 100),
  },
  conversionFcfPct: {
    libelle: "Conversion en trésorerie",
    unite: "%",
    meilleur: "haut",
    calcul: (e) => rapport(e.FreeCashFlow, e.NetIncome, 100),
  },
  per: {
    libelle: "PER",
    unite: "×",
    meilleur: "bas",
    // Cours de clôture de l'exercice ÷ bénéfice par action dilué du même
    // exercice. Exact, pas approché.
    calcul: (e) => (e.DilutedEPS > 0 ? rapport(e.coursCloture, e.DilutedEPS) : null),
  },
};

/** Croissance d'un poste d'un exercice à l'autre, en pourcentage. */
export function croissance(precedent, courant) {
  if (precedent == null || courant == null) return null;
  if (!Number.isFinite(precedent) || !Number.isFinite(courant) || precedent === 0) return null;
  return ((courant - precedent) / Math.abs(precedent)) * 100;
}

/**
 * Calcule tous les ratios pour chaque exercice, du plus ancien au plus récent.
 * @returns {Array<{exercice, [cle]: number|null, croissanceCaPct, croissanceRnPct}>}
 */
export function ratiosParExercice(historique = []) {
  const tries = [...historique].filter((e) => e?.exercice).sort((a, b) => (a.exercice < b.exercice ? -1 : 1));

  return tries.map((e, i) => {
    const precedent = i > 0 ? tries[i - 1] : null;
    const ligne = { exercice: e.exercice };
    for (const [cle, def] of Object.entries(RATIOS_HISTORIQUES)) {
      const v = def.calcul(e);
      ligne[cle] = Number.isFinite(v) ? v : null;
    }
    ligne.croissanceCaPct = precedent ? croissance(precedent.TotalRevenue, e.TotalRevenue) : null;
    ligne.croissanceRnPct = precedent ? croissance(precedent.NetIncome, e.NetIncome) : null;
    ligne.croissanceBpaPct = precedent ? croissance(precedent.DilutedEPS, e.DilutedEPS) : null;
    return ligne;
  });
}

/** Moyenne d'un ratio sur les exercices où il est renseigné. */
export function moyenneRatio(lignes = [], cle) {
  const valeurs = lignes.map((l) => l?.[cle]).filter((v) => Number.isFinite(v));
  if (valeurs.length === 0) return null;
  return valeurs.reduce((s, v) => s + v, 0) / valeurs.length;
}

/**
 * Situe une valeur courante par rapport à sa moyenne historique.
 *
 * `jugement` traduit l'écart dans le sens du ratio : un PER sous sa moyenne
 * est favorable, une marge sous sa moyenne ne l'est pas. Sans cette
 * traduction, l'interface devrait refaire le raisonnement pour chaque ratio.
 */
export function situerParRapportALaMoyenne(valeurCourante, moyenne, meilleur = "haut", seuilNeutrePct = 5) {
  if (!Number.isFinite(valeurCourante) || !Number.isFinite(moyenne) || moyenne === 0) {
    return { ecartPct: null, jugement: "inconnu" };
  }
  const ecartPct = ((valeurCourante - moyenne) / Math.abs(moyenne)) * 100;

  if (Math.abs(ecartPct) < seuilNeutrePct) return { ecartPct, jugement: "conforme" };
  const auDessus = ecartPct > 0;
  const favorable = meilleur === "haut" ? auDessus : !auDessus;
  return { ecartPct, jugement: favorable ? "favorable" : "defavorable" };
}

/**
 * Synthèse prête à l'affichage : pour chaque ratio, la valeur du dernier
 * exercice, la moyenne, et la lecture de l'écart.
 */
export function syntheseRatios(historique = [], { valeursCourantes = {} } = {}) {
  const lignes = ratiosParExercice(historique);
  if (lignes.length === 0) return { lignes: [], synthese: [] };

  const dernier = lignes[lignes.length - 1];

  const synthese = Object.entries(RATIOS_HISTORIQUES).map(([cle, def]) => {
    // Le ratio courant vient des données temps réel quand elles existent (il
    // intègre le cours du jour) ; sinon on retombe sur le dernier exercice.
    const courant = Number.isFinite(valeursCourantes[cle]) ? valeursCourantes[cle] : dernier[cle];
    const moyenne = moyenneRatio(lignes, cle);
    return {
      cle,
      libelle: def.libelle,
      unite: def.unite,
      meilleur: def.meilleur,
      courant: Number.isFinite(courant) ? courant : null,
      moyenne,
      nbExercices: lignes.filter((l) => Number.isFinite(l[cle])).length,
      ...situerParRapportALaMoyenne(courant, moyenne, def.meilleur),
    };
  });

  return { lignes, synthese };
}
