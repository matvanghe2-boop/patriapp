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
 * Fusionne plusieurs séries nommées { name, series: [{date, close}] } en une
 * seule liste d'objets { date, [name]: close, ... } triée par date.
 */
export function mergeSeriesByDate(namedSeries) {
  const map = new Map();
  namedSeries.forEach(({ name, series }) => {
    (series || []).forEach(({ date, close }) => {
      if (!map.has(date)) map.set(date, { date });
      map.get(date)[name] = close;
    });
  });
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
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
 * Reconstruit la valeur historique d'un portefeuille en appliquant la
 * composition ACTUELLE (quantités détenues aujourd'hui) aux cours
 * historiques de chaque ligne.
 *
 * Hypothèse simplificatrice assumée : les quantités sont supposées
 * constantes sur toute la période affichée (pas d'historique des
 * achats/ventes). Seules les dates communes à TOUTES les lignes sont
 * conservées, pour éviter les creux artificiels liés aux jours fériés
 * propres à chaque place boursière.
 */
export function reconstructPortfolioValue(positions, historyBySymbol, cashPocket = 0) {
  const valid = positions.filter((p) => historyBySymbol[p.ticker]?.ok && historyBySymbol[p.ticker].series.length > 0);
  if (valid.length === 0) return [];

  const dateSets = valid.map((p) => new Set(historyBySymbol[p.ticker].series.map((s) => s.date)));
  const commonDates = [...dateSets[0]].filter((d) => dateSets.every((set) => set.has(d))).sort();

  const closeMaps = valid.map((p) => ({
    p,
    m: new Map(historyBySymbol[p.ticker].series.map((s) => [s.date, s.close])),
  }));

  return commonDates.map((date) => ({
    date,
    value: closeMaps.reduce((sum, { p, m }) => sum + m.get(date) * p.quantity, 0) + cashPocket,
  }));
}
