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

  // Si la donnée disponible la plus ancienne est postérieure (de plus de 5
  // jours) à la date de référence demandée, l'historique est trop court pour
  // ce calcul — mieux vaut afficher "—" qu'un chiffre basé sur une période
  // plus courte présenté comme si c'était la bonne.
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
