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
