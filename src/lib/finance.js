export const uid = () => Math.random().toString(36).slice(2, 9);

export const eur = (n, digits = 0) =>
  (n ?? 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: digits });

/** Pourcentage signé (+/-), utilisé pour des variations / gains. */
export const pct = (n, digits = 1) => {
  const v = Number.isFinite(n) ? n : 0;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)} %`;
};

/** Pourcentage simple, sans signe, pour des taux/ratios (ex: taux d'endettement). */
export const pctPlain = (n, digits = 1) => `${(Number.isFinite(n) ? n : 0).toFixed(digits)} %`;

export const compact = (n) => `${Math.round(n / 1000)} k€`;

/**
 * Projection à intérêts composés avec versements mensuels capitalisés annuellement.
 * Vf = M0·(1+t)^n + P·((1+t)^n − 1)/t
 * Renvoie un tableau année par année (année 0 = situation de départ).
 */
export function projectCompound(capital, annualRatePct, monthlyContribution, years) {
  const t = (annualRatePct || 0) / 100;
  const P = (monthlyContribution || 0) * 12;
  const M0 = capital || 0;
  const n = Math.max(0, Math.round(years || 0));
  const data = [];
  for (let y = 0; y <= n; y++) {
    const growth = Math.pow(1 + t, y);
    const total = t === 0 ? M0 + P * y : M0 * growth + (P * (growth - 1)) / t;
    const versed = M0 + P * y;
    data.push({ year: y, total, versed, interets: total - versed });
  }
  return data;
}

/** Mensualité d'un prêt amortissable classique. */
export function monthlyPayment(principal, annualRatePct, years) {
  const r = (annualRatePct || 0) / 100 / 12;
  const n = Math.max(1, Math.round((years || 0) * 12));
  const C = Math.max(0, principal || 0);
  if (C === 0) return 0;
  if (r === 0) return C / n;
  return (C * r) / (1 - Math.pow(1 + r, -n));
}

/** Taux moyen pondéré par le capital (ex: taux moyen des livrets). */
export function weightedAverageRate(items, balanceKey = "balance", rateKey = "rate") {
  const total = items.reduce((s, i) => s + i[balanceKey], 0);
  if (total === 0) return 0;
  return items.reduce((s, i) => s + i[balanceKey] * i[rateKey], 0) / total;
}

/**
 * Insère ou met à jour (par date) une entrée dans une série déjà triée par
 * date. Utilisé pour le suivi quotidien du portefeuille : une seule entrée
 * par jour, mise à jour si on revient plusieurs fois le même jour.
 */
export function upsertByDate(arr, entry) {
  const idx = arr.findIndex((e) => e.date === entry.date);
  if (idx >= 0) {
    const copy = [...arr];
    copy[idx] = entry;
    return copy;
  }
  return [...arr, entry].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Rebase plusieurs séries à 100 à partir d'un point de départ COMMUN — la
 * première date où toutes les clés demandées disposent d'une valeur. C'est
 * indispensable pour comparer équitablement un portefeuille à des indices
 * dont l'historique disponible peut démarrer à des dates différentes.
 */
export function rebaseTo100(merged, keys) {
  const startIndex = merged.findIndex((row) => keys.every((k) => row[k] != null));
  if (startIndex === -1) return [];
  const bases = {};
  keys.forEach((k) => {
    bases[k] = merged[startIndex][k];
  });
  return merged.slice(startIndex).map((row) => {
    const out = { date: row.date };
    keys.forEach((k) => {
      if (row[k] != null && bases[k]) out[k] = (row[k] / bases[k]) * 100;
    });
    return out;
  });
}

/**
 * Calcule les variations de performance RÉELLES (YTD, 1 mois, 6 mois, 1 an,
 * 5 ans) d'un titre à partir de son historique de clôtures quotidiennes.
 * Aucune hypothèse ni simulation : uniquement les cours déjà constatés du
 * titre lui-même (utilisé pour la Watchlist, sur des titres non détenus).
 */
export function computeReturnMetrics(series) {
  if (!series || series.length === 0) return null;
  const latest = series[series.length - 1];
  const latestDate = new Date(`${latest.date}T00:00:00`);
  const earliestDate = new Date(`${series[0].date}T00:00:00`);

  const findOnOrAfter = (targetDate) => series.find((p) => new Date(`${p.date}T00:00:00`) >= targetDate) || series[0];

  const back = (months, years = 0) => {
    const d = new Date(latestDate);
    d.setFullYear(d.getFullYear() - years);
    d.setMonth(d.getMonth() - months);
    return d;
  };
  const ytdStart = new Date(latestDate.getFullYear(), 0, 1);

  const changeFrom = (refDate) => {
    const tooShort = earliestDate.getTime() > refDate.getTime() + 5 * 24 * 60 * 60 * 1000;
    if (tooShort) return null;
    const ref = findOnOrAfter(refDate);
    if (!ref || !ref.close) return null;
    return ((latest.close - ref.close) / ref.close) * 100;
  };

  return {
    latestClose: latest.close,
    latestDate: latest.date,
    ytd: changeFrom(ytdStart),
    m1: changeFrom(back(1)),
    m6: changeFrom(back(6)),
    y1: changeFrom(back(0, 1)),
    y5: changeFrom(back(0, 5)),
  };
}

// ─── NOUVELLES FONCTIONS POUR LA SIMULATION ──────────────────────────────────

/**
 * Calcule l'épargne mensuelle nécessaire pour atteindre un objectif de capital.
 * Résout l'équation : target = currentTotal * (1 + t)^n + (P * ((1 + t)^n - 1) / t)
 * en inversant pour trouver P (épargne mensuelle).
 */
export function solveMonthlyForTarget({ target, currentTotal, livretsRate, bourseRate, years }) {
  const n = Math.max(1, years);
  // On calcule le rendement moyen pondéré entre livrets et bourse
  const avgRate = (livretsRate + bourseRate) / 2;
  const t = avgRate;
  
  // Croissance du capital existant
  const growth = Math.pow(1 + t, n);
  const capitalGrowth = currentTotal * growth;
  
  if (capitalGrowth >= target) return 0;
  
  // Montant total à atteindre via les versements
  const needed = target - capitalGrowth;
  
  // Formule inverse : P = needed * t / ((1 + t)^n - 1)
  // P est le montant annuel, on divise par 12 pour le mensuel
  if (t === 0) {
    return needed / n / 12;
  }
  const annualContribution = (needed * t) / (growth - 1);
  return annualContribution / 12;
}

/**
 * Génère une séquence de rendements annuels basée sur des années historiques réelles.
 * Cycle de 8 ans incluant krachs et reprises (CAC 40 / MSCI World approximatif).
 */
export function generateVolatileReturns(years, seed = 0) {
  // Séquence de rendements annuels réels approximatifs (2018-2025)
  // Basé sur les performances du CAC 40 / MSCI World
  const realReturns = [
    -0.11, // 2018 : correction (-11%)
    0.26,  // 2019 : forte reprise (+26%)
    -0.07, // 2020 : krach COVID (-7%)
    0.29,  // 2021 : rebond post-COVID (+29%)
    -0.10, // 2022 : krach inflation (-10%)
    0.16,  // 2023 : reprise (+16%)
    0.08,  // 2024 : consolidation (+8%)
    -0.05, // 2025 : correction (-5%)
  ];
  
  const result = [];
  for (let i = 0; i < years; i++) {
    const idx = (i + seed) % realReturns.length;
    result.push(realReturns[idx]);
  }
  return result;
}

/**
 * Calcule la prime d'assurance emprunteur mensuelle.
 * @param {number} capital - Montant emprunté
 * @param {number} tauxAnnuel - Taux d'assurance annuel en % (ex: 0.20)
 * @returns {number} Prime mensuelle
 */
export function assuranceMensuelle(capital, tauxAnnuel) {
  return capital * (tauxAnnuel / 100) / 12;
}

/**
 * Applique l'inflation à une série de valeurs pour calculer le pouvoir d'achat réel.
 */
export function applyInflation(values, inflationRatePct) {
  const rate = inflationRatePct / 100;
  return values.map((v, i) => v / Math.pow(1 + rate, i));
}

// ─── DIVIDENDES ──────────────────────────────────────────────────────────────

export function dividendYieldOnPrice(annualDividendPerShare, currentPrice) {
  if (!currentPrice || currentPrice <= 0) return 0;
  return ((annualDividendPerShare || 0) / currentPrice) * 100;
}

export function dividendYieldOnCost(annualDividendPerShare, pru) {
  if (!pru || pru <= 0) return 0;
  return ((annualDividendPerShare || 0) / pru) * 100;
}

// ─── OPÉRATIONS BOURSIÈRES (ACHAT / VENTE) ───────────────────────────────────
// Ces fonctions sont pures : elles ne touchent à aucun état React, elles
// prennent la position actuelle (ou null si l'actif n'est pas encore détenu)
// et l'ordre à comptabiliser, et renvoient les nouvelles valeurs à appliquer.

/**
 * Génère une empreinte unique pour un ordre quand le courtier ne fournit
 * pas d'identifiant clair dans le PDF. Combine les données structurantes
 * de l'ordre : date_ticker_type_quantite_prix.
 */
/**
 * Ne garde, avant persistance dans le localStorage, que les champs
 * strictement nécessaires à la comptabilité et aux graphiques. Le nom du
 * courtier (et tout autre identifiant de compte que le parseur PDF aurait pu
 * capter) n'est jamais écrit en stockage local — il ne sert que le temps de
 * l'import pour l'affichage d'un message de confirmation. `transactionId`
 * est conservé : c'est une référence d'ordre (pas un identifiant de compte),
 * indispensable à la logique anti-doublons.
 */
export function sanitizeOperation(order) {
  const { transactionId, date, asset, type, quantity, price, fees, amount, montantNet, plusValueRealisee, id } = order;
  return { id, transactionId: transactionId || null, date, asset, type, quantity, price, fees, amount, montantNet, plusValueRealisee };
}

export function generateOperationHash({ date, asset, type, quantity, price }) {
  const norm = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return `${norm(date)}_${norm(asset)}_${norm(type)}_${norm(quantity)}_${norm(price)}`;
}

/**
 * ACHAT — les frais s'ajoutent au coût de l'investissement et sont donc
 * amortis dans le nouveau PRU.
 */
export function computeBuyOperation(position, { quantity, price, fees = 0 }) {
  const q = Number(quantity) || 0;
  const p = Number(price) || 0;
  const f = Number(fees) || 0;

  const currentQty = position?.quantity || 0;
  const currentPru = position?.pru || 0;
  const currentTotalBuyFees = position?.totalBuyFees || 0;

  const montantNet = q * p + f;
  const newQuantity = currentQty + q;
  const newPru = newQuantity > 0 ? (currentQty * currentPru + q * p + f) / newQuantity : 0;
  const newTotalBuyFees = currentTotalBuyFees + f;

  return { montantNet, newQuantity, newPru, newTotalBuyFees };
}

/**
 * VENTE — les frais se déduisent du montant récupéré. Une vente ne modifie
 * jamais le PRU des titres restants. La plus-value réalisée est définitive
 * et nette des frais d'achat (alloués au prorata des titres vendus) et de
 * vente.
 */
export function computeSellOperation(position, { quantity, price, fees = 0 }) {
  const q = Number(quantity) || 0;
  const p = Number(price) || 0;
  const f = Number(fees) || 0;

  const currentQty = position?.quantity || 0;
  const currentPru = position?.pru || 0;
  const currentTotalBuyFees = position?.totalBuyFees || 0;

  const feesPerShare = currentQty > 0 ? currentTotalBuyFees / currentQty : 0;
  const feesAchatAlloues = feesPerShare * q;

  const montantNet = q * p - f;
  const newQuantity = currentQty - q;
  const plusValueRealisee = (p - currentPru) * q - feesAchatAlloues - f;
  const newTotalBuyFees = Math.max(0, currentTotalBuyFees - feesAchatAlloues);

  return { montantNet, newQuantity, plusValueRealisee, newTotalBuyFees };
}

export function computeDividendSummary(positions) {
  let totalAnnualDividend = 0;
  let totalValue = 0;
  let totalInvested = 0;

  const perPosition = positions.map((p) => {
    const div = p.annual_dividend || 0;
    const annualAmount = div * p.quantity;
    const value = p.quantity * p.current_price;
    const invested = p.quantity * p.pru;
    totalAnnualDividend += annualAmount;
    totalValue += value;
    totalInvested += invested;
    return {
      ...p,
      annualAmount,
      yieldOnPrice: dividendYieldOnPrice(div, p.current_price),
      yieldOnCost: dividendYieldOnCost(div, p.pru),
    };
  });

  return {
    perPosition,
    totalAnnualDividend,
    monthlyAverage: totalAnnualDividend / 12,
    portfolioYieldOnValue: totalValue > 0 ? (totalAnnualDividend / totalValue) * 100 : 0,
    portfolioYieldOnCost: totalInvested > 0 ? (totalAnnualDividend / totalInvested) * 100 : 0,
  };
}
