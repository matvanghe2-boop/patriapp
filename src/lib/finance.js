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

// ─── MÉTRIQUES DE PERFORMANCE AVANCÉES ───────────────────────────────────────
// Toutes ces fonctions travaillent uniquement à partir de `bourseHistory`
// (une entrée par jour : { date, valeur, capital, sp500, cac40, msciWorld }),
// c'est-à-dire des données réellement constatées — aucune extrapolation.
// Références de marché utilisées pour situer l'utilisateur (moyennes
// long terme communément admises, à titre indicatif uniquement) :
export const MARKET_BENCHMARKS = {
  sharpe: { good: 1, market: 0.5, label: "Ratio de Sharpe" },
  beta: { market: 1, label: "Bêta" },
  volatility: { market: 15, label: "Volatilité annualisée (actions monde, %)" },
  maxDrawdown: { market: -20, label: "Max drawdown indicatif (correction moyenne, %)" },
  annualReturn: { market: 7, investorAvg: 4.7, label: "Rendement annualisé (%)" },
  // investorAvg = écart de comportement moyen constaté (études type DALBAR /
  // Morningstar Mind The Gap) entre la performance des marchés et celle
  // réellement perçue par l'investisseur moyen, du fait du market timing.
};

const DAY_MS = 24 * 60 * 60 * 1000;
const toDate = (iso) => new Date(`${iso}T00:00:00`);

// Annualiser un rendement mesuré sur quelques jours seulement produit des
// nombres absurdes (composer +2% sur 3 jours donne +183%/an). En dessous de
// ces seuils, on renvoie le total brut sur la période plutôt qu'un taux
// annualisé, et les métriques purement statistiques (volatilité, Sharpe,
// alpha/bêta) sont carrément désactivées faute d'échantillon significatif.
export const MIN_DAYS_FOR_ANNUALIZATION = 30;
export const MIN_POINTS_FOR_STATS = 20;

/** Nombre d'années (fraction) entre deux dates ISO. */
function yearsBetween(startIso, endIso) {
  return Math.max((toDate(endIso) - toDate(startIso)) / (365.25 * DAY_MS), 1 / 365.25);
}

/**
 * Série des rendements quotidiens (en %) calculés à partir de `valeur`,
 * en neutralisant l'effet des apports/retraits de capital entre deux jours
 * (méthode Time-Weighted Return simplifiée à fréquence quotidienne) :
 * r_t = (V_t - flux_t) / V_(t-1) - 1, où flux_t est la variation de capital
 * investi entre t-1 et t (un versement gonfle V_t sans que ce soit une
 * performance, un retrait le réduit sans que ce soit une perte).
 */
export function computeDailyReturns(history) {
  if (!history || history.length < 2) return [];
  const out = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    if (!prev.valeur || !cur.valeur) continue;
    const flux = (cur.capital ?? prev.capital ?? 0) - (prev.capital ?? 0);
    const adjustedValue = cur.valeur - flux;
    const r = (adjustedValue - prev.valeur) / prev.valeur;
    if (Number.isFinite(r)) out.push({ date: cur.date, r: r * 100 });
  }
  return out;
}

/** Écart-type (population) d'une liste de nombres. */
function stdDev(values) {
  if (!values.length) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Rendement annualisé "vrai" (Time-Weighted Return composé), à partir de la
 * chaîne des rendements quotidiens neutralisés des flux de capital. C'est la
 * mesure qui reflète la performance de gestion, indépendamment des dates de
 * versement — contrairement à un simple (valeur finale / capital investi).
 *
 * En dessous de MIN_DAYS_FOR_ANNUALIZATION jours d'historique, annualiser
 * n'a aucun sens statistique (un +2% sur 3 jours composé sur 365 jours
 * donne +183%/an) : on renvoie alors annualizedPct = null et on laisse
 * l'appelant afficher le total brut sur période à la place.
 */
export function computeTWR(history) {
  const returns = computeDailyReturns(history);
  if (returns.length === 0) return null;
  const cumGrowth = returns.reduce((acc, { r }) => acc * (1 + r / 100), 1);
  const totalReturnPct = (cumGrowth - 1) * 100;
  const daysSpan = (toDate(history[history.length - 1].date) - toDate(history[0].date)) / DAY_MS;
  const years = yearsBetween(history[0].date, history[history.length - 1].date);
  const reliable = daysSpan >= MIN_DAYS_FOR_ANNUALIZATION;
  const annualized = reliable ? (Math.pow(cumGrowth, 1 / years) - 1) * 100 : null;
  return { totalReturnPct, annualizedPct: annualized, years, daysSpan, reliable };
}

/**
 * XIRR (taux de rendement interne) approximatif à partir des flux de
 * capital observés jour par jour dans l'historique + la valeur finale du
 * portefeuille. Résolution par dichotomie sur le taux annuel r tel que
 * la somme des flux actualisés = 0.
 */
export function computeXIRR(history) {
  if (!history || history.length < 2) return null;
  const daysSpan = (toDate(history[history.length - 1].date) - toDate(history[0].date)) / DAY_MS;
  if (daysSpan < MIN_DAYS_FOR_ANNUALIZATION) return null;
  const flows = [];
  let prevCapital = history[0].capital ?? 0;
  if (prevCapital > 0) flows.push({ date: history[0].date, amount: -prevCapital });
  for (let i = 1; i < history.length; i++) {
    const delta = (history[i].capital ?? prevCapital) - prevCapital;
    if (Math.abs(delta) > 0.01) flows.push({ date: history[i].date, amount: -delta });
    prevCapital = history[i].capital ?? prevCapital;
  }
  const last = history[history.length - 1];
  flows.push({ date: last.date, amount: last.valeur });
  if (flows.length < 2) return null;

  const t0 = toDate(flows[0].date);
  const npv = (rate) =>
    flows.reduce((sum, f) => {
      const years = (toDate(f.date) - t0) / (365.25 * DAY_MS);
      return sum + f.amount / Math.pow(1 + rate, years);
    }, 0);

  let lo = -0.99, hi = 5;
  let mid = 0;
  for (let i = 0; i < 100; i++) {
    mid = (lo + hi) / 2;
    const val = npv(mid);
    if (Math.abs(val) < 1e-6) break;
    if (npv(lo) * val < 0) hi = mid; else lo = mid;
  }
  return Number.isFinite(mid) ? mid * 100 : null;
}

/** Volatilité annualisée (%) à partir de l'écart-type des rendements quotidiens.
 * Renvoie null en dessous de MIN_POINTS_FOR_STATS points — un écart-type
 * calculé sur 2-3 jours n'est pas représentatif et fait exploser le chiffre
 * une fois annualisé (×√252). */
export function computeVolatility(history) {
  const returns = computeDailyReturns(history).map((d) => d.r);
  if (returns.length < MIN_POINTS_FOR_STATS) return null;
  return stdDev(returns) * Math.sqrt(252);
}

/**
 * Max drawdown (pire baisse en % depuis un plus haut) et durée de
 * récupération (en jours) jusqu'à ce que la valeur repasse au-dessus de ce
 * plus haut. Si non encore récupéré, recoveryDays = null.
 */
export function computeMaxDrawdown(history) {
  if (!history || history.length < 2) return null;
  let peak = history[0].valeur;
  let maxDD = 0, maxDDDate = null, maxDDPeakDate = null, recoveryDate = null;
  let inDrawdown = false, currentPeakForDD = peak;

  for (const h of history) {
    if (h.valeur >= peak) {
      if (inDrawdown && h.valeur >= currentPeakForDD) inDrawdown = false;
      peak = h.valeur;
    }
    const dd = peak > 0 ? ((h.valeur - peak) / peak) * 100 : 0;
    if (dd < maxDD) {
      maxDD = dd;
      maxDDDate = h.date;
      maxDDPeakDate = history.find((x) => x.valeur === peak)?.date ?? null;
      currentPeakForDD = peak;
      inDrawdown = true;
      recoveryDate = null;
    } else if (inDrawdown && h.valeur >= currentPeakForDD) {
      recoveryDate = h.date;
      inDrawdown = false;
    }
  }

  const recoveryDays = recoveryDate && maxDDDate ? Math.round((toDate(recoveryDate) - toDate(maxDDDate)) / DAY_MS) : null;

  return {
    maxDrawdownPct: maxDD,
    peakDate: maxDDPeakDate,
    troughDate: maxDDDate,
    recoveryDate,
    recoveryDays,
    stillInDrawdown: inDrawdown,
  };
}

/**
 * Zones de drawdown pour affichage graphique (segments où la valeur est
 * sous le plus haut précédent). Renvoie un tableau [{date, ddPct, peak}].
 */
export function computeDrawdownSeries(history) {
  if (!history || history.length === 0) return [];
  let peak = history[0].valeur;
  return history.map((h) => {
    if (h.valeur > peak) peak = h.valeur;
    const ddPct = peak > 0 ? ((h.valeur - peak) / peak) * 100 : 0;
    return { date: h.date, ddPct, peak };
  });
}

/** Ratio de Sharpe annualisé = (rendement annualisé - taux sans risque) / volatilité annualisée.
 * Hérite naturellement des garde-fous de computeTWR (annualizedPct) et
 * computeVolatility (null en dessous du seuil minimum de points). */
export function computeSharpeRatio(history, riskFreeRatePct = 2.5) {
  const twr = computeTWR(history);
  const vol = computeVolatility(history);
  if (!twr || twr.annualizedPct == null || !vol || vol === 0) return null;
  return (twr.annualizedPct - riskFreeRatePct) / vol;
}

/** Meilleur / pire jour et meilleur / pire mois (en %), à partir des rendements quotidiens. */
export function computeBestWorst(history) {
  const returns = computeDailyReturns(history);
  if (returns.length === 0) return null;

  let bestDay = returns[0], worstDay = returns[0];
  for (const d of returns) {
    if (d.r > bestDay.r) bestDay = d;
    if (d.r < worstDay.r) worstDay = d;
  }

  const byMonth = {};
  returns.forEach(({ date, r }) => {
    const key = date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(r);
  });
  const monthly = Object.entries(byMonth).map(([month, rs]) => ({
    month,
    r: (rs.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100,
  }));
  let bestMonth = null, worstMonth = null;
  monthly.forEach((m) => {
    if (!bestMonth || m.r > bestMonth.r) bestMonth = m;
    if (!worstMonth || m.r < worstMonth.r) worstMonth = m;
  });

  return { bestDay, worstDay, bestMonth, worstMonth };
}

/**
 * Alpha / Bêta vs un indice de référence, calculés par régression linéaire
 * simple des rendements quotidiens du portefeuille sur ceux de l'indice
 * (méthode des moindres carrés). Alpha est exprimé en % annualisé.
 */
export function computeAlphaBeta(history, benchmarkKey = "sp500") {
  if (!history || history.length < MIN_POINTS_FOR_STATS) return null;
  const pairs = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1], cur = history[i];
    if (!prev.valeur || !cur.valeur || prev[benchmarkKey] == null || cur[benchmarkKey] == null) continue;
    const flux = (cur.capital ?? prev.capital ?? 0) - (prev.capital ?? 0);
    const rp = (cur.valeur - flux - prev.valeur) / prev.valeur;
    const rb = (cur[benchmarkKey] - prev[benchmarkKey]) / prev[benchmarkKey];
    if (Number.isFinite(rp) && Number.isFinite(rb)) pairs.push({ rp, rb });
  }
  if (pairs.length < MIN_POINTS_FOR_STATS) return null;

  const n = pairs.length;
  const meanP = pairs.reduce((s, p) => s + p.rp, 0) / n;
  const meanB = pairs.reduce((s, p) => s + p.rb, 0) / n;
  let cov = 0, varB = 0;
  pairs.forEach((p) => {
    cov += (p.rp - meanP) * (p.rb - meanB);
    varB += (p.rb - meanB) ** 2;
  });
  cov /= n; varB /= n;
  if (varB === 0) return null;

  const beta = cov / varB;
  const alphaDaily = meanP - beta * meanB;
  const alphaAnnualized = (Math.pow(1 + alphaDaily, 252) - 1) * 100;

  return { beta, alphaAnnualizedPct: alphaAnnualized, n };
}

/**
 * Contribution de chaque ligne à la performance du portefeuille, en euros
 * et en % du gain/perte total (plus-value latente uniquement — cohérent
 * avec l'affichage "positions" du portefeuille).
 */
export function computeContribution(positions) {
  const items = positions.map((p) => {
    const gainAbs = (p.current_price - p.pru) * p.quantity;
    return { ticker: p.ticker, name: p.name, gainAbs, invested: p.pru * p.quantity, value: p.current_price * p.quantity };
  });
  const totalAbsGain = items.reduce((s, i) => s + Math.abs(i.gainAbs), 0);
  return items
    .map((i) => ({ ...i, sharePct: totalAbsGain > 0 ? (Math.abs(i.gainAbs) / totalAbsGain) * 100 : 0 }))
    .sort((a, b) => b.gainAbs - a.gainAbs);
}

/**
 * Performance glissante sur plusieurs fenêtres (1M/3M/6M/1A/YTD/depuis
 * l'origine), en % de variation de `valeur`, mesurée par comparaison au
 * premier point disponible sur ou après la date cible.
 */
export function computeRollingPerformance(history) {
  if (!history || history.length === 0) return null;
  const latest = history[history.length - 1];
  const latestDate = toDate(latest.date);
  const earliestDate = toDate(history[0].date);

  const findOnOrAfter = (targetDate) => history.find((p) => toDate(p.date) >= targetDate) || history[0];
  const back = (months, years = 0) => {
    const d = new Date(latestDate);
    d.setFullYear(d.getFullYear() - years);
    d.setMonth(d.getMonth() - months);
    return d;
  };
  const ytdStart = new Date(latestDate.getFullYear(), 0, 1);

  const changeFrom = (refDate) => {
    const tooShort = earliestDate.getTime() > refDate.getTime() + 5 * DAY_MS;
    if (tooShort) return null;
    const ref = findOnOrAfter(refDate);
    if (!ref || !ref.valeur) return null;
    return ((latest.valeur - ref.valeur) / ref.valeur) * 100;
  };

  return {
    m1: changeFrom(back(1)),
    m3: changeFrom(back(3)),
    m6: changeFrom(back(6)),
    y1: changeFrom(back(0, 1)),
    ytd: changeFrom(ytdStart),
    sinceOrigin: history[0].valeur > 0 ? ((latest.valeur - history[0].valeur) / history[0].valeur) * 100 : null,
  };
}

/**
 * Ratio frais cumulés / performance : total des frais payés (achats +
 * ventes, issus de `bourse.operations`) rapporté au gain total généré
 * (plus-values latentes + réalisées). Renvoie aussi les montants bruts.
 */
export function computeFeeEfficiency(operations, totalGainAbs) {
  const totalFees = (operations || []).reduce((s, op) => s + (op.fees || 0), 0);
  const totalGain = (operations || []).reduce((s, op) => s + (op.plusValueRealisee || 0), 0) + (totalGainAbs || 0);
  const ratioPct = totalGain !== 0 ? (totalFees / Math.abs(totalGain)) * 100 : null;
  return { totalFees, totalGain, ratioPct };
}

/**
 * Rendement total avec dividendes réinvestis (TSR) vs sans, à partir des
 * dividendes réellement enregistrés dans `bourse.operations` (type
 * DIVIDENDE) et de la plus-value du portefeuille sur la période couverte
 * par `history`.
 */
export function computeTSR(history, operations) {
  if (!history || history.length < 2) return null;
  const start = history[0].date;
  const end = history[history.length - 1].date;
  const dividendsInPeriod = (operations || [])
    .filter((op) => op.type === "DIVIDENDE" && op.date >= start && op.date <= end)
    .reduce((s, op) => s + (op.amount || op.montantNet || 0), 0);

  const capitalStart = history[0].capital || history[0].valeur;
  const valueEnd = history[history.length - 1].valeur;
  const withoutDividends = capitalStart > 0 ? ((valueEnd - capitalStart) / capitalStart) * 100 : 0;
  const withDividends = capitalStart > 0 ? ((valueEnd + dividendsInPeriod - capitalStart) / capitalStart) * 100 : 0;

  return { withDividends, withoutDividends, dividendsInPeriod };
}

/**
 * Devine l'enveloppe fiscale d'un support d'épargne à partir de son nom,
 * pour les données existantes qui n'ont pas encore de champ `envelope`.
 */
export function guessEnvelope(name) {
  const key = (name || "").toLowerCase();
  if (key.includes("assurance") || key.includes(" av") || key.startsWith("av ") || key === "av") return "AV";
  if (key.includes("per") && !key.includes("perso")) return "PER";
  if (key.includes("pea")) return "PEA";
  if (key.includes("cto") || key.includes("compte-titres") || key.includes("compte titres")) return "CTO";
  return "Livret";
}

/** Libellés/couleurs standard pour les enveloppes fiscales. */
export const ENVELOPE_META = {
  PEA: { label: "PEA", color: "#fbbf24" },
  CTO: { label: "CTO", color: "#f472b6" },
  AV: { label: "Assurance-Vie", color: "#818cf8" },
  PER: { label: "PER", color: "#22d3ee" },
  Livret: { label: "Livrets réglementés", color: "#2dd4bf" },
  Cash: { label: "Compte courant", color: "#94a3b8" },
};

/**
 * Score de diversification globale basé sur l'indice de Herfindahl-Hirschman
 * (HHI) appliqué à la répartition par classe d'actif. Renvoie un score de
 * 0 (tout concentré sur une seule classe) à 100 (parfaitement réparti entre
 * toutes les classes présentes).
 */
export function computeDiversificationScore(classes) {
  const items = (classes || []).filter((c) => c.value > 0);
  const total = items.reduce((s, c) => s + c.value, 0);
  if (total <= 0 || items.length === 0) return { score: 0, hhi: 0, n: 0, weights: [] };
  const weights = items.map((c) => ({ name: c.name, weight: c.value / total }));
  const hhi = weights.reduce((s, w) => s + w.weight * w.weight, 0);
  const n = items.length;
  // HHI minimal atteignable avec n classes = 1/n (répartition parfaitement égale).
  const hhiMin = 1 / n;
  // Normalise entre 0 (hhi = 1, tout concentré) et 100 (hhi = hhiMin, réparti au mieux).
  const score = n <= 1 ? 0 : Math.max(0, Math.min(100, ((1 - hhi) / (1 - hhiMin)) * 100));
  return { score, hhi, n, weights };
}

/** Filtre un historique sur une fenêtre glissante ("1M","3M","6M","1A","YTD","MAX"). */
export function filterHistoryByRange(history, range) {
  if (!history || history.length === 0 || range === "MAX") return history;
  const latest = toDate(history[history.length - 1].date);
  let from;
  if (range === "YTD") {
    from = new Date(latest.getFullYear(), 0, 1);
  } else {
    const months = { "1M": 1, "3M": 3, "6M": 6, "1A": 12 }[range] ?? 12;
    from = new Date(latest);
    from.setMonth(from.getMonth() - months);
  }
  return history.filter((h) => toDate(h.date) >= from);
}
