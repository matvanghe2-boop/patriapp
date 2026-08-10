/**
 * Horizon — moteur de calcul du sous-onglet « Projet ».
 *
 * Couche pure : aucune I/O, aucun accès au state global, aucune dépendance à
 * l'IA. Entrées explicites, sorties déterministes. C'est la seule source des
 * chiffres affichés par Horizon — le modèle de langage orchestre les appels,
 * il ne calcule jamais.
 *
 * Deux invariants tiennent tout le reste :
 *
 *  1. Toute hypothèse appliquée sans avoir été demandée est retournée dans
 *     `hypothesesAppliquees[]`. Une valeur par défaut silencieuse est un bug.
 *  2. Toute projection aléatoire prend une graine. Comparer deux scénarios
 *     tirés sur des aléas différents ne compare rien.
 *
 * Voir HORIZON_SPEC.md pour la spécification complète.
 */

// ─── ALÉATOIRE REPRODUCTIBLE ─────────────────────────────────────────────────

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 * `Math.random()` ne se sème pas : impossible de rejouer une projection ou de
 * comparer deux scénarios sur les mêmes aléas. D'où ce générateur.
 */
export function creerGenerateur(graine = 1) {
  let a = (graine >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tirage normal centré réduit (Box-Muller), à partir d'un générateur uniforme. */
export function tirageNormal(next) {
  let u = 0;
  // log(0) diverge : on rejette l'unique valeur interdite.
  while (u === 0) u = next();
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── TABLE DE RÉFÉRENCE (§3.11) ──────────────────────────────────────────────

/**
 * Couples rendement/volatilité utilisés tant que l'historique Patrium est trop
 * court pour en dériver (moins de 24 mois de relevés).
 *
 * Ce n'est pas un cas dégradé : avec ~1 mois d'historique en août 2026, c'est
 * le mode nominal d'Horizon jusque vers août 2028.
 *
 * Rendements NOMINAUX (avant inflation), en pourcentage annuel.
 */
export const RENDEMENTS_REFERENCE = {
  actions: { rendement: 8.0, volatilite: 15.0, libelle: "Actions" },
  obligations: { rendement: 3.0, volatilite: 6.0, libelle: "Obligations" },
  monetaire: { rendement: 2.5, volatilite: 0.5, libelle: "Monétaire / livrets" },
  immobilier: { rendement: 4.0, volatilite: 8.0, libelle: "Immobilier" },
};

export const CLASSES_ACTIFS = Object.keys(RENDEMENTS_REFERENCE);

/**
 * Matrice de corrélation simplifiée entre classes d'actifs.
 *
 * Tirer chaque classe indépendamment sous-estime le risque : lors d'un choc,
 * actions et immobilier baissent ensemble. Ces coefficients sont des ordres de
 * grandeur documentés, remplacés par les corrélations réelles dès que
 * l'historique atteint 60 mois.
 */
export const CORRELATIONS_REFERENCE = {
  actions: { actions: 1.0, obligations: 0.2, monetaire: 0.0, immobilier: 0.4 },
  obligations: { actions: 0.2, obligations: 1.0, monetaire: 0.3, immobilier: 0.2 },
  monetaire: { actions: 0.0, obligations: 0.3, monetaire: 1.0, immobilier: 0.0 },
  immobilier: { actions: 0.4, obligations: 0.2, monetaire: 0.0, immobilier: 1.0 },
};

export const INFLATION_DEFAUT = 2.0;

/**
 * Dernière revue manuelle des valeurs de référence (§10 bis de HORIZON_SPEC.md).
 *
 * Couvre les coûts de possession, les barèmes fiscaux et la table
 * rendement/volatilité. À mettre à jour à chaque revue effectuée — c'est cette
 * date, et elle seule, qui déclenche le rappel.
 *
 * Les rendements sortiront de ce cycle le jour où l'historique Patrium
 * dépassera 24 mois : ils seront alors recalculés en continu.
 */
export const DATE_REVISION_REFERENCES = "2026-08-08";

/** Périodicité de la revue, en mois. */
export const PERIODICITE_REVISION_MOIS = 6;

/**
 * Indique si les valeurs de référence méritent une relecture.
 *
 * Aucune vérification réseau, aucune source distante : juste une comparaison de
 * dates. Une valeur périmée n'est jamais bloquante — elle est signalée, et
 * reste modifiable à la main dans le tableau d'hypothèses.
 */
export function revisionReferencesEchue(aujourdhui = new Date(), derniere = DATE_REVISION_REFERENCES) {
  const depuis = new Date(derniere);
  if (Number.isNaN(depuis.getTime())) return { echue: false, moisEcoules: 0, derniere };
  const moisEcoules = Math.floor((aujourdhui - depuis) / (30.44 * 86400000));
  return {
    echue: moisEcoules >= PERIODICITE_REVISION_MOIS,
    moisEcoules: Math.max(0, moisEcoules),
    derniere,
  };
}

/** Seuils de fiabilité de l'estimation des rendements, en mois d'historique. */
export const SEUIL_ESTIMATION_INDICATIVE = 24;
export const SEUIL_ESTIMATION_EXPLOITABLE = 60;

// ─── 3.1 CRÉDIT ──────────────────────────────────────────────────────────────

/**
 * Tableau d'amortissement d'un prêt à échéances constantes.
 *
 * Le TAEG est résolu numériquement (bissection sur le TRI mensuel des flux)
 * plutôt qu'approché par une formule fermée : avec assurance et frais de
 * dossier, il n'existe pas d'expression analytique du taux effectif.
 */
export function simulerCredit({
  montant,
  tauxAnnuel,
  dureeMois,
  assuranceMensuelle = 0,
  fraisDossier = 0,
}) {
  const C = Math.max(0, montant || 0);
  const n = Math.max(1, Math.round(dureeMois || 0));
  const r = (tauxAnnuel || 0) / 100 / 12;

  const mensualiteHorsAssurance = r === 0 ? C / n : (C * r) / (1 - Math.pow(1 + r, -n));
  const mensualite = mensualiteHorsAssurance + assuranceMensuelle;

  const tableau = [];
  let restantDu = C;
  let totalInterets = 0;

  for (let mois = 1; mois <= n; mois++) {
    const interets = restantDu * r;
    // Dernière échéance : on solde le restant dû pour absorber les arrondis.
    const capital = mois === n ? restantDu : mensualiteHorsAssurance - interets;
    restantDu = Math.max(0, restantDu - capital);
    totalInterets += interets;
    tableau.push({ mois, capital, interets, assurance: assuranceMensuelle, restantDu });
  }

  const coutAssurance = assuranceMensuelle * n;
  const coutTotalCredit = totalInterets + coutAssurance + fraisDossier;

  return {
    mensualite,
    mensualiteHorsAssurance,
    coutTotalCredit,
    totalInterets,
    coutAssurance,
    fraisDossier,
    montantTotalRembourse: C + coutTotalCredit,
    taeg: calculerTaeg({ montant: C, fraisDossier, mensualite, dureeMois: n }),
    tableauAmortissement: tableau,
    hypothesesAppliquees: [],
  };
}

/**
 * TAEG annuel effectif global, par bissection sur le taux mensuel.
 * Le capital réellement perçu est net des frais de dossier ; les échéances
 * incluent l'assurance. C'est ce qui fait diverger le TAEG du taux nominal.
 */
export function calculerTaeg({ montant, fraisDossier, mensualite, dureeMois }) {
  const capitalPercu = montant - fraisDossier;
  if (capitalPercu <= 0 || mensualite <= 0 || dureeMois <= 0) return 0;

  const valeurActuelle = (tauxMensuel) => {
    if (tauxMensuel === 0) return mensualite * dureeMois - capitalPercu;
    return (mensualite * (1 - Math.pow(1 + tauxMensuel, -dureeMois))) / tauxMensuel - capitalPercu;
  };

  // `valeurActuelle` décroît avec le taux : elle vaut la somme brute des
  // échéances moins le capital à taux nul, puis tend vers −capital.
  let bas = 0;
  let haut = 1; // 100 % mensuel : borne haute absurde mais sûre
  // Échéances insuffisantes pour rembourser le capital : pas de taux solution.
  if (valeurActuelle(bas) < 0) return 0;

  for (let i = 0; i < 200; i++) {
    const milieu = (bas + haut) / 2;
    if (valeurActuelle(milieu) > 0) bas = milieu;
    else haut = milieu;
  }
  const tauxMensuel = (bas + haut) / 2;
  return (Math.pow(1 + tauxMensuel, 12) - 1) * 100;
}

// ─── 3.2 COÛT TOTAL DE POSSESSION ────────────────────────────────────────────

/**
 * Postes de coût annuels par catégorie de bien, en pourcentage du prix d'achat.
 *
 * ⚠️ Valeurs indicatives, à confirmer lors de la revue semestrielle. Elles
 * remontent toutes dans `hypothesesAppliquees[]` : rien n'est appliqué en
 * silence, et chaque poste reste modifiable à la main dans l'UI.
 */
export const COUTS_POSSESSION_REFERENCE = {
  voiture: {
    assuranceAnnuellePct: 2.5,
    entretienAnnuellePct: 2.0,
    energieAnnuellePct: 4.0,
    taxeAnnuellePct: 0.3,
    decoteAnnuellePct: 15.0,
    libelle: "Véhicule",
  },
  immobilier: {
    assuranceAnnuellePct: 0.3,
    entretienAnnuellePct: 1.0,
    energieAnnuellePct: 1.5,
    taxeAnnuellePct: 0.8,
    decoteAnnuellePct: -1.0, // appréciation moyenne, d'où le signe négatif
    libelle: "Bien immobilier",
  },
  generique: {
    assuranceAnnuellePct: 0,
    entretienAnnuellePct: 2.0,
    energieAnnuellePct: 0,
    taxeAnnuellePct: 0,
    decoteAnnuellePct: 10.0,
    libelle: "Bien durable",
  },
};

/**
 * Coût réel de détention d'un bien sur la durée : achat, charges récurrentes
 * et perte de valeur. Le prix affiché en vitrine n'est presque jamais le coût.
 */
export function coutTotalPossession({ prixAchat, horizonAnnees, categorie = "generique", overrides = {} }) {
  const prix = Math.max(0, prixAchat || 0);
  const annees = Math.max(0, Math.round(horizonAnnees || 0));
  const ref = COUTS_POSSESSION_REFERENCE[categorie] ?? COUTS_POSSESSION_REFERENCE.generique;

  const hypothesesAppliquees = [];
  const resoudre = (cle, libelle) => {
    if (overrides[cle] != null) return overrides[cle];
    const valeur = (ref[`${cle}Pct`] / 100) * prix;
    hypothesesAppliquees.push({
      cle,
      libelle,
      valeur,
      origine: "reference",
      detail: `${ref[`${cle}Pct`]} % du prix d'achat (catégorie « ${ref.libelle} »)`,
      aVerifier: true,
    });
    return valeur;
  };

  const assurance = resoudre("assuranceAnnuelle", "Assurance annuelle");
  const entretien = resoudre("entretienAnnuelle", "Entretien annuel");
  const energie = resoudre("energieAnnuelle", "Énergie / carburant annuel");
  const taxe = resoudre("taxeAnnuelle", "Taxes annuelles");

  const decotePct = overrides.decoteAnnuellePct ?? ref.decoteAnnuellePct;
  if (overrides.decoteAnnuellePct == null) {
    hypothesesAppliquees.push({
      cle: "decoteAnnuellePct",
      libelle: "Décote annuelle",
      valeur: decotePct,
      origine: "reference",
      detail: `${decotePct} % par an (catégorie « ${ref.libelle} »)`,
      aVerifier: true,
    });
  }

  const chargesAnnuelles = assurance + entretien + energie + taxe;
  const chargesTotales = chargesAnnuelles * annees;
  const valeurResiduelle = prix * Math.pow(1 - decotePct / 100, annees);
  const perteValeur = prix - valeurResiduelle;
  const coutTotal = chargesTotales + perteValeur;

  const ventilation = [
    { poste: "Assurance", montant: assurance * annees },
    { poste: "Entretien", montant: entretien * annees },
    { poste: "Énergie", montant: energie * annees },
    { poste: "Taxes", montant: taxe * annees },
    { poste: "Perte de valeur", montant: perteValeur },
  ].map((p) => ({ ...p, partPct: coutTotal > 0 ? (p.montant / coutTotal) * 100 : 0 }));

  return {
    coutTotal,
    coutAnnuelMoyen: annees > 0 ? coutTotal / annees : 0,
    coutMensuelMoyen: annees > 0 ? coutTotal / (annees * 12) : 0,
    valeurResiduelle,
    perteValeur,
    chargesTotales,
    ventilation,
    hypothesesAppliquees,
  };
}

// ─── 3.3 COÛT D'OPPORTUNITÉ ──────────────────────────────────────────────────

/**
 * Ce qu'une somme aurait rapporté en restant investie.
 * Le poste que les comparaisons d'achat oublient systématiquement.
 */
export function coutOpportunite({ montant, rendementAnnuelPct, horizonAnnees, inflationPct = INFLATION_DEFAUT }) {
  const M = Math.max(0, montant || 0);
  const annees = Math.max(0, horizonAnnees || 0);
  const valeurFutureNominale = M * Math.pow(1 + (rendementAnnuelPct || 0) / 100, annees);
  const valeurFutureReelle = valeurFutureNominale / Math.pow(1 + (inflationPct || 0) / 100, annees);

  return {
    montantInitial: M,
    valeurFutureNominale,
    valeurFutureReelle,
    manqueAGagner: valeurFutureNominale - M,
    manqueAGagnerReel: valeurFutureReelle - M,
    hypothesesAppliquees: [
      {
        cle: "inflationPct",
        libelle: "Inflation",
        valeur: inflationPct,
        origine: inflationPct === INFLATION_DEFAUT ? "defaut" : "utilisateur",
        detail: `${inflationPct} % par an`,
      },
    ],
  };
}

// ─── 3.10 ESTIMATION DES RENDEMENTS DEPUIS L'HISTORIQUE ──────────────────────

/**
 * Dérive rendement et volatilité depuis l'historique Patrium, avec paliers de
 * fiabilité.
 *
 * Le palier compte autant que le chiffre : une volatilité estimée sur quelques
 * mois capture une conjoncture, pas un régime. La projeter sur dix ans
 * produirait des intervalles faussement précis — c'est-à-dire un mensonge
 * présenté avec des décimales.
 *
 * @param {Array<{date: string, valeur: number}>} historique - relevés triés ou non
 */
export function estimerRendements(historique = []) {
  const points = [...historique]
    .filter((p) => p && Number.isFinite(p.valeur) && p.valeur > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const profondeurMois = mesurerProfondeurMois(points);

  if (profondeurMois < SEUIL_ESTIMATION_INDICATIVE) {
    return {
      fiabilite: "insuffisante",
      profondeurMois,
      seuilRequis: SEUIL_ESTIMATION_INDICATIVE,
      source: "reference",
      rendements: { ...RENDEMENTS_REFERENCE },
      correlations: CORRELATIONS_REFERENCE,
      avertissement:
        `Historique insuffisant (${profondeurMois} mois sur ${SEUIL_ESTIMATION_INDICATIVE} requis). ` +
        `Projection basée sur la table de référence, pas sur tes données.`,
    };
  }

  const rendementsQuotidiens = [];
  for (let i = 1; i < points.length; i++) {
    const precedent = points[i - 1].valeur;
    if (precedent > 0) rendementsQuotidiens.push(points[i].valeur / precedent - 1);
  }

  const moyenne = rendementsQuotidiens.reduce((s, r) => s + r, 0) / rendementsQuotidiens.length;
  const variance =
    rendementsQuotidiens.reduce((s, r) => s + (r - moyenne) ** 2, 0) /
    Math.max(1, rendementsQuotidiens.length - 1);

  // Annualisation : 252 séances boursières par an.
  const rendement = (Math.pow(1 + moyenne, 252) - 1) * 100;
  const volatilite = Math.sqrt(variance) * Math.sqrt(252) * 100;

  const exploitable = profondeurMois >= SEUIL_ESTIMATION_EXPLOITABLE;

  return {
    fiabilite: exploitable ? "exploitable" : "indicative",
    profondeurMois,
    seuilRequis: SEUIL_ESTIMATION_EXPLOITABLE,
    source: "historique",
    rendements: { global: { rendement, volatilite, libelle: "Portefeuille global" } },
    correlations: exploitable ? null : CORRELATIONS_REFERENCE,
    avertissement: exploitable
      ? null
      : `Historique de ${profondeurMois} mois : estimation indicative, à interpréter avec prudence.`,
  };
}

/** Profondeur d'un historique en mois pleins, bornée à 0. */
export function mesurerProfondeurMois(points) {
  if (!points || points.length < 2) return 0;
  const debut = new Date(points[0].date);
  const fin = new Date(points[points.length - 1].date);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) return 0;
  const jours = (fin - debut) / 86400000;
  return Math.max(0, Math.floor(jours / 30.44));
}

// ─── 3.4 PROJECTION MONTE-CARLO ──────────────────────────────────────────────

/**
 * Décomposition de Cholesky d'une matrice de corrélation.
 * Permet de transformer des tirages normaux indépendants en tirages corrélés.
 */
export function cholesky(matrice) {
  const n = matrice.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let somme = 0;
      for (let k = 0; k < j; k++) somme += L[i][k] * L[j][k];
      if (i === j) L[i][j] = Math.sqrt(Math.max(0, matrice[i][i] - somme));
      else L[i][j] = L[j][j] === 0 ? 0 : (matrice[i][j] - somme) / L[j][j];
    }
  }
  return L;
}

/** Percentile d'un tableau trié par ordre croissant (interpolation linéaire). */
export function percentile(triees, p) {
  if (!triees.length) return 0;
  const rang = (p / 100) * (triees.length - 1);
  const bas = Math.floor(rang);
  const haut = Math.ceil(rang);
  if (bas === haut) return triees[bas];
  return triees[bas] + (triees[haut] - triees[bas]) * (rang - bas);
}

/**
 * Projection Monte-Carlo du patrimoine, à allocation constante.
 *
 * Les rendements sont log-normaux et corrélés entre classes. La graine rend le
 * résultat reproductible : deux scénarios comparés doivent subir les mêmes
 * aléas, sinon l'écart mesuré est du bruit.
 *
 * Renvoie systématiquement les vues nominale ET réelle : sur un horizon de dix
 * ans, seule la seconde répond à « qu'est-ce que ça achètera ».
 */
export function projeterPatrimoine({
  patrimoineInitial,
  versementMensuel = 0,
  allocation,
  horizonAnnees,
  tirages = 1000,
  graine = 42,
  inflationPct = INFLATION_DEFAUT,
  rendements = RENDEMENTS_REFERENCE,
  correlations = CORRELATIONS_REFERENCE,
  objectifMontant = null,
}) {
  const M0 = Math.max(0, patrimoineInitial || 0);
  const annees = Math.max(1, Math.round(horizonAnnees || 1));
  const nbTirages = Math.max(1, Math.round(tirages));
  const versementAnnuel = (versementMensuel || 0) * 12;

  const classes = Object.keys(allocation).filter((c) => (allocation[c] || 0) > 0);
  const poids = classes.map((c) => allocation[c]);
  const sommePoids = poids.reduce((s, p) => s + p, 0) || 1;
  const partsNormalisees = poids.map((p) => p / sommePoids);

  // Paramètres log-normaux : on veut retrouver le rendement arithmétique visé.
  const parametres = classes.map((c) => {
    const { rendement, volatilite } = rendements[c] ?? RENDEMENTS_REFERENCE[c] ?? { rendement: 0, volatilite: 0 };
    const mu = rendement / 100;
    const sigma = volatilite / 100;
    const sigmaLog = Math.sqrt(Math.log(1 + (sigma * sigma) / ((1 + mu) * (1 + mu))));
    const muLog = Math.log(1 + mu) - (sigmaLog * sigmaLog) / 2;
    return { muLog, sigmaLog };
  });

  const matrice = classes.map((a) => classes.map((b) => (a === b ? 1 : correlations?.[a]?.[b] ?? 0)));
  const L = cholesky(matrice);

  const next = creerGenerateur(graine);
  const trajectoires = Array.from({ length: annees + 1 }, () => []);
  let atteintes = 0;

  for (let t = 0; t < nbTirages; t++) {
    let capital = M0;
    trajectoires[0].push(capital);

    for (let annee = 1; annee <= annees; annee++) {
      const z = classes.map(() => tirageNormal(next));
      // z corrélé = L · z indépendant
      const zCorrele = L.map((ligne) => ligne.reduce((s, coef, k) => s + coef * z[k], 0));

      const rendementPortefeuille = classes.reduce((somme, _, i) => {
        const { muLog, sigmaLog } = parametres[i];
        const rendementClasse = Math.exp(muLog + sigmaLog * zCorrele[i]) - 1;
        return somme + partsNormalisees[i] * rendementClasse;
      }, 0);

      capital = capital * (1 + rendementPortefeuille) + versementAnnuel;
      trajectoires[annee].push(capital);
    }

    if (objectifMontant != null && capital >= objectifMontant) atteintes++;
  }

  const deflateur = (annee) => Math.pow(1 + (inflationPct || 0) / 100, annee);

  const percentiles = trajectoires.map((valeurs, annee) => {
    const triees = [...valeurs].sort((a, b) => a - b);
    const d = deflateur(annee);
    const p = (n) => percentile(triees, n);
    return {
      annee,
      p10: p(10),
      p25: p(25),
      p50: p(50),
      p75: p(75),
      p90: p(90),
      reel: { p10: p(10) / d, p25: p(25) / d, p50: p(50) / d, p75: p(75) / d, p90: p(90) / d },
      verse: M0 + versementAnnuel * annee,
    };
  });

  return {
    percentiles,
    trajectoireMediane: percentiles.map((p) => ({ annee: p.annee, total: p.p50, reel: p.reel.p50 })),
    valeurFinale: percentiles[percentiles.length - 1],
    probabiliteObjectif: objectifMontant != null ? (atteintes / nbTirages) * 100 : null,
    parametres: { tirages: nbTirages, graine, inflationPct, allocation, horizonAnnees: annees },
    hypothesesAppliquees: classes.map((c) => ({
      cle: `rendement.${c}`,
      libelle: rendements[c]?.libelle ?? c,
      valeur: rendements[c]?.rendement,
      origine: rendements === RENDEMENTS_REFERENCE ? "reference" : "historique",
      detail: `${rendements[c]?.rendement} % / an, volatilité ${rendements[c]?.volatilite} %`,
    })),
  };
}

// ─── 3.5 COMPARAISON DE SCÉNARIOS ────────────────────────────────────────────

/**
 * Aligne plusieurs scénarios sur les mêmes aléas et mesure les écarts.
 * Ne tranche pas : produit les chiffres, la décision reste à l'utilisateur.
 *
 * Le premier scénario, ou celui marqué `reference: true`, sert de base.
 */
export function comparerScenarios(scenarios = []) {
  if (!scenarios.length) return { tableau: [], ecarts: [], reference: null };

  const reference = scenarios.find((s) => s.reference) ?? scenarios[0];
  const valeurFinale = (s) => s.projection?.valeurFinale?.p50 ?? 0;
  const valeurFinaleReelle = (s) => s.projection?.valeurFinale?.reel?.p50 ?? 0;
  const base = valeurFinale(reference);

  const tableau = scenarios.map((s) => ({
    nom: s.nom,
    description: s.description ?? null,
    medianeNominale: valeurFinale(s),
    medianeReelle: valeurFinaleReelle(s),
    p10: s.projection?.valeurFinale?.p10 ?? 0,
    p90: s.projection?.valeurFinale?.p90 ?? 0,
    probabiliteObjectif: s.projection?.probabiliteObjectif ?? null,
    estReference: s === reference,
  }));

  const ecarts = tableau
    .filter((l) => !l.estReference)
    .map((l) => ({
      nom: l.nom,
      ecartAbsolu: l.medianeNominale - base,
      ecartRelatifPct: base !== 0 ? ((l.medianeNominale - base) / base) * 100 : 0,
    }));

  return { tableau, ecarts, reference: reference.nom };
}

// ─── 3.6 IMPACT SUR UN OBJECTIF ──────────────────────────────────────────────

/**
 * Traduit un scénario en retard ou avance sur un objectif daté.
 *
 * C'est le calcul le plus parlant du moteur : « cette dépense repousse ton
 * apport de sept mois » dit plus qu'un écart de capital en euros.
 */
export function impactObjectif({ objectif, scenarioAvant, scenarioApres }) {
  const cible = objectif?.montantCible ?? 0;
  const anneesRestantes = anneesJusqua(objectif?.dateCible);

  const dateAtteinte = (projection) => {
    const p = projection?.percentiles ?? [];
    for (let i = 0; i < p.length; i++) {
      if (p[i].p50 >= cible) {
        // Interpolation linéaire dans l'année pour un résultat en mois.
        if (i === 0) return 0;
        const precedent = p[i - 1].p50;
        const part = (cible - precedent) / (p[i].p50 - precedent || 1);
        return (i - 1 + part) * 12;
      }
    }
    return null; // jamais atteint sur l'horizon simulé
  };

  const moisAvant = dateAtteinte(scenarioAvant);
  const moisApres = dateAtteinte(scenarioApres);

  const valeurADate = (projection) => {
    const p = projection?.percentiles ?? [];
    const index = Math.min(Math.round(anneesRestantes), p.length - 1);
    return index >= 0 ? p[index]?.p50 ?? 0 : 0;
  };

  const avantADate = valeurADate(scenarioAvant);
  const apresADate = valeurADate(scenarioApres);
  const ecartMontant = apresADate - avantADate;

  // Effort mensuel supplémentaire pour combler l'écart d'ici la date cible.
  const moisRestants = Math.max(1, Math.round(anneesRestantes * 12));
  const effortCorrectif = ecartMontant < 0 ? -ecartMontant / moisRestants : 0;

  return {
    objectif: objectif?.nom ?? null,
    cible,
    anneesRestantes,
    moisAvant,
    moisApres,
    retardMois: moisAvant != null && moisApres != null ? moisApres - moisAvant : null,
    atteintAvant: moisAvant != null,
    atteintApres: moisApres != null,
    valeurADateAvant: avantADate,
    valeurADateApres: apresADate,
    ecartMontant,
    effortMensuelCorrectif: effortCorrectif,
  };
}

/** Nombre d'années (décimal) entre aujourd'hui et une date cible. */
export function anneesJusqua(dateCible, aujourdhui = new Date()) {
  if (!dateCible) return 0;
  const cible = new Date(dateCible);
  if (Number.isNaN(cible.getTime())) return 0;
  return Math.max(0, (cible - aujourdhui) / (365.25 * 86400000));
}

// ─── 3.7 FISCALITÉ DES ENVELOPPES ────────────────────────────────────────────

/**
 * Barèmes fiscaux français.
 *
 * ⚠️ Saisie manuelle depuis les sources officielles `.gouv.fr`, jamais scrapée :
 * ces pages changent de structure sans préavis, et un parseur cassé produirait
 * des barèmes faux en silence — bien pire qu'un barème périmé mais daté.
 *
 * Chaque entrée porte sa source et sa date de consultation, remontées jusqu'à
 * l'UI. `aVerifier: true` signale une valeur qui n'a pas encore été confirmée
 * à la source par un humain.
 */
export const BAREMES_FISCAUX = {
  prelevementsSociauxPct: 17.2,
  pfuImpotPct: 12.8,
  avAbattementCelibataire: 4600,
  avAbattementCouple: 9200,
  avTauxReduitPct: 7.5,
  peaDureeExonerationAnnees: 5,
  avDureeAbattementAnnees: 8,
  source: {
    url: "https://www.impots.gouv.fr/",
    intitule: "Barèmes des revenus de capitaux mobiliers et prélèvements sociaux",
    dateConsultation: null,
    aVerifier: true,
  },
};

/**
 * Imposition d'un retrait selon l'enveloppe et sa durée de détention.
 *
 * @param {"PEA"|"AV"|"CTO"|"PER"} enveloppe
 */
export function fiscaliteEnveloppe({
  enveloppe,
  montant,
  plusValue,
  dureeDetentionAnnees = 0,
  couple = false,
  tmiPct = 30,
}) {
  const pv = Math.max(0, plusValue || 0);
  const b = BAREMES_FISCAUX;
  const ps = (pv * b.prelevementsSociauxPct) / 100;

  let impot = 0;
  let regime = "";

  switch (enveloppe) {
    case "PEA": {
      const exonere = dureeDetentionAnnees >= b.peaDureeExonerationAnnees;
      impot = exonere ? 0 : (pv * b.pfuImpotPct) / 100;
      regime = exonere
        ? `PEA de plus de ${b.peaDureeExonerationAnnees} ans : plus-value exonérée d'impôt, prélèvements sociaux dus`
        : `PEA de moins de ${b.peaDureeExonerationAnnees} ans : PFU applicable`;
      break;
    }
    case "AV": {
      if (dureeDetentionAnnees >= b.avDureeAbattementAnnees) {
        const abattement = couple ? b.avAbattementCouple : b.avAbattementCelibataire;
        const imposable = Math.max(0, pv - abattement);
        impot = (imposable * b.avTauxReduitPct) / 100;
        regime = `Assurance-vie de plus de ${b.avDureeAbattementAnnees} ans : abattement de ${abattement} € puis ${b.avTauxReduitPct} %`;
      } else {
        impot = (pv * b.pfuImpotPct) / 100;
        regime = `Assurance-vie de moins de ${b.avDureeAbattementAnnees} ans : PFU applicable`;
      }
      break;
    }
    case "PER": {
      // Sortie en capital : la part de plus-value suit le PFU, le capital versé
      // est imposé au barème car il avait été déduit à l'entrée.
      impot = (pv * b.pfuImpotPct) / 100 + ((Math.max(0, (montant || 0) - pv)) * tmiPct) / 100;
      regime = `PER, sortie en capital : plus-value au PFU, capital déduit imposé au barème (TMI ${tmiPct} %)`;
      break;
    }
    case "CTO":
    default: {
      impot = (pv * b.pfuImpotPct) / 100;
      regime = "Compte-titres ordinaire : prélèvement forfaitaire unique";
      break;
    }
  }

  return {
    enveloppe,
    plusValue: pv,
    impotDu: impot,
    prelevementsSociaux: ps,
    totalPrelevements: impot + ps,
    netApresImpot: (montant || 0) - impot - ps,
    tauxEffectifPct: pv > 0 ? ((impot + ps) / pv) * 100 : 0,
    regimeApplique: regime,
    source: b.source,
  };
}
