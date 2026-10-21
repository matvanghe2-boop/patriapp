/**
 * Corrélation entre les lignes du portefeuille.
 *
 * La répartition sectorielle suppose que deux secteurs différents se
 * diversifient. Ce n'est pas toujours vrai : deux sociétés de secteurs
 * distincts peuvent monter et baisser ensemble, parce qu'elles dépendent de
 * la même conjoncture. La corrélation de leurs rendements quotidiens le mesure
 * directement.
 *
 * Coefficient de Pearson sur les rendements quotidiens des DATES COMMUNES aux
 * deux titres — deux places n'ont pas les mêmes jours fériés. En dessous de
 * soixante séances communes, le coefficient n'est pas calculé : sur trois
 * semaines, il mesure surtout le hasard.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

export const SEANCES_MIN = 60;

/** Rendements quotidiens d'une série de clôtures : date → rendement. */
export function rendementsQuotidiens(serie = []) {
  const triee = [...(serie || [])]
    .filter((p) => p?.date && Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const sortie = new Map();
  for (let i = 1; i < triee.length; i++) {
    sortie.set(triee[i].date, triee[i].close / triee[i - 1].close - 1);
  }
  return sortie;
}

/** Corrélation de Pearson sur les dates communes ; `null` si trop peu. */
export function correlation(rendementsA, rendementsB, minCommun = SEANCES_MIN) {
  const a = [];
  const b = [];
  for (const [date, ra] of rendementsA) {
    const rb = rendementsB.get(date);
    if (rb != null) {
      a.push(ra);
      b.push(rb);
    }
  }
  const n = a.length;
  if (n < minCommun) return null;
  const moyA = a.reduce((s, v) => s + v, 0) / n;
  const moyB = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - moyA) * (b[i] - moyB);
    varA += (a[i] - moyA) ** 2;
    varB += (b[i] - moyB) ** 2;
  }
  if (varA === 0 || varB === 0) return null;
  return { rho: cov / Math.sqrt(varA * varB), n };
}

/**
 * Matrice des corrélations et paires classées de la plus liée à la plus
 * indépendante.
 * @param {Record<string, Array<{date, close}>>} series
 */
export function matriceCorrelations(series = {}, minCommun = SEANCES_MIN) {
  const tickers = Object.keys(series).filter((t) => (series[t] || []).length > 1);
  const rendements = Object.fromEntries(tickers.map((t) => [t, rendementsQuotidiens(series[t])]));
  const matrice = tickers.map(() => tickers.map(() => null));
  const paires = [];
  for (let i = 0; i < tickers.length; i++) {
    matrice[i][i] = 1;
    for (let j = i + 1; j < tickers.length; j++) {
      const c = correlation(rendements[tickers[i]], rendements[tickers[j]], minCommun);
      if (!c) continue;
      matrice[i][j] = c.rho;
      matrice[j][i] = c.rho;
      paires.push({ a: tickers[i], b: tickers[j], rho: c.rho, n: c.n });
    }
  }
  paires.sort((x, y) => y.rho - x.rho);
  const moyenne = paires.length ? paires.reduce((s, p) => s + p.rho, 0) / paires.length : null;
  return { tickers, matrice, paires, moyenne };
}
