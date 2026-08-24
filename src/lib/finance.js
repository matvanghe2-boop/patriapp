import { dividendeNet } from "../../shared/eligibilitePea";

/**
 * Identifiant local d'une entité saisie (position, opération, note, jalon…).
 *
 * `crypto.randomUUID` quand il est disponible — c'est-à-dire partout en
 * contexte sécurisé, ce qui est le cas de l'application. L'ancienne version
 * ne tirait que sept caractères de `Math.random()`, et trois copies
 * divergentes de cette même fonction traînaient dans les composants (deux sur
 * huit caractères, une sur sept). Ces identifiants servent notamment à
 * reconnaître une opération déjà comptabilisée dans la ligne de base du grand
 * livre : une collision y ferait disparaître un ordre du rejeu.
 */
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);

export const eur = (n, digits = 0) =>
  (n ?? 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: digits });

/** Pourcentage signé (+/-), utilisé pour des variations / gains. */
export const pct = (n, digits = 1) => {
  const v = Number.isFinite(n) ? n : 0;
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)} %`;
};

/** Pourcentage simple, sans signe, pour des taux/ratios (ex: taux d'endettement). */
export const pctPlain = (n, digits = 1) => `${(Number.isFinite(n) ? n : 0).toFixed(digits)} %`;

/**
 * Lecture d'un nombre saisi par l'utilisateur.
 *
 * Remplace les `parseFloat(x) || 0` disséminés dans les composants, qui
 * avaient deux défauts :
 *
 *  1. **La virgule française était tronquée.** `parseFloat("3,5")` vaut 3 :
 *     `parseFloat` s'arrête au premier caractère non numérique. Sur un champ
 *     `type="number"` le navigateur protège en partie, mais pas sur les champs
 *     texte — et une saisie de taux à « 3,5 » devenait « 3 » sans le moindre
 *     signe.
 *  2. **Vide valait zéro.** Effacer un champ pour le resaisir écrivait
 *     immédiatement `0` dans l'état persistant, donc dans le localStorage et
 *     dans le cloud. Sur le taux d'un livret, cela suffisait à fausser le taux
 *     moyen pondéré du patrimoine le temps de la frappe.
 *
 * `null` distingue donc « pas de valeur » de « la valeur zéro ». C'est le même
 * choix que `matelasMois`, qui vaut `null` — et non 0 — quand les dépenses ne
 * sont pas renseignées : un matelas inconnu n'est pas un matelas vide.
 * L'appelant décide de la valeur de repli avec `?? 0`.
 *
 * @param {unknown} valeur Saisie brute (chaîne d'un champ, ou nombre déjà lu).
 * @returns {number|null} Le nombre, ou `null` si la saisie n'en est pas un.
 */
export function lireNombre(valeur) {
  if (typeof valeur === "number") return Number.isFinite(valeur) ? valeur : null;
  if (typeof valeur !== "string") return null;
  const nettoye = valeur.trim().replace(",", ".");
  if (nettoye === "" || nettoye === "-" || nettoye === "." || nettoye === "-.") return null;
  // `Number` plutôt que `parseFloat` : il REFUSE une chaîne partiellement
  // numérique (`Number("12abc")` vaut NaN, `parseFloat("12abc")` vaut 12).
  // Une saisie à moitié valide doit être rejetée, pas devinée.
  const n = Number(nettoye);
  return Number.isFinite(n) ? n : null;
}

/**
 * Montant abrégé, avec l'ordre de grandeur adapté à la valeur.
 *
 * L'ancienne version divisait systématiquement par mille et suffixait « k€ » :
 * un chiffre d'affaires de 26,9 milliards s'affichait « 26940200 k€ », soit
 * huit chiffres à compter à l'œil. C'est illisible sur un tableau, et pire
 * encore sur une graduation d'axe.
 *
 * On passe donc à l'unité qui convient — €, k€, M€, Md€ — avec au plus une
 * décimale : au-delà, la précision n'apporte rien à une valeur déjà abrégée.
 */
export const compact = (n) => {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "0 €";

  const signe = n < 0 ? "-" : "";
  const absolu = Math.abs(n);

  const [valeur, unite] =
    absolu >= 1e9 ? [absolu / 1e9, "Md€"]
    : absolu >= 1e6 ? [absolu / 1e6, "M€"]
    : absolu >= 1e3 ? [absolu / 1e3, "k€"]
    : [absolu, "€"];

  // Une décimale sous 100, aucune au-delà : « 26,9 Md€ » se lit, « 269,4 M€ »
  // aussi, mais « 1234,5 k€ » n'apporte rien de plus que « 1235 k€ ».
  const decimales = valeur < 100 ? 1 : 0;
  const texte = valeur.toFixed(decimales).replace(/\.0$/, "").replace(".", ",");

  return `${signe}${texte} ${unite}`;
};

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

/**
 * Capital projeté après `months` mois, en capitalisant mensuellement un
 * versement régulier. Pendant de `projectCompound`, qui ne raisonne qu'en
 * années pleines et rend une série — inutilisable pour une projection de
 * quelques mois comme celle du Dashboard.
 */
export function projectMonthly(capital, annualRatePct, monthlyContribution, months) {
  const r = (annualRatePct || 0) / 100 / 12;
  const n = Math.max(0, Math.round(months || 0));
  const M0 = capital || 0;
  const P = monthlyContribution || 0;
  if (r === 0) return M0 + P * n;
  const growth = Math.pow(1 + r, n);
  return M0 * growth + P * ((growth - 1) / r);
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

/* ═══════════════════════════════════════════════════════════════════════════
   VALORISATION ET DEVISES

   Les agrégats de l'application additionnaient les `current_price` comme des
   euros quelle que soit la devise de cotation : une position en dollars était
   comptée à parité 1:1, ce qui faussait la valeur du portefeuille, la
   plus-value, la répartition, les exports et le contexte de l'assistant.

   `fxRate` porte le nombre d'euros que vaut UNE unité de la devise de
   cotation, rafraîchi en même temps que les cours (voir /api/fx). Toute
   valorisation passe désormais par les trois fonctions ci-dessous.

   Limite assumée : le PRU est converti au taux du jour, pas à celui de la date
   d'achat. La plus-value affichée mélange donc performance du titre et effet
   de change, sans les distinguer. Les séparer demanderait d'historiser le taux
   à chaque opération — ce que le journal permettrait, mais qui n'a d'intérêt
   qu'une fois les opérations en devise réellement saisies.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Euros par unité de la devise de cotation. 1 pour l'euro ou en l'absence de taux. */
export function tauxPosition(position) {
  const devise = position?.currency;
  if (!devise || devise === "EUR") return 1;
  const taux = position?.fxRate;
  return Number.isFinite(taux) && taux > 0 ? taux : 1;
}

/** Valeur de marché d'une position, en euros. */
export function valeurPosition(position) {
  return (position?.quantity || 0) * (position?.current_price || 0) * tauxPosition(position);
}

/** Prix de revient d'une position (quantité × PRU), en euros. */
export function coutPosition(position) {
  return (position?.quantity || 0) * (position?.pru || 0) * tauxPosition(position);
}

/** Devises de cotation présentes dans un portefeuille, hors euro. */
export function devisesDuPortefeuille(positions = []) {
  return [...new Set(positions.map((p) => p?.currency).filter((d) => d && d !== "EUR"))];
}

/** Positions cotées en devise étrangère dont le taux manque encore. */
export function positionsSansTaux(positions = []) {
  return positions.filter(
    (p) => p?.currency && p.currency !== "EUR" && !(Number.isFinite(p.fxRate) && p.fxRate > 0)
  );
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
  // La date de départ doit avoir une base EXPLOITABLE pour chaque série, pas
  // seulement une valeur non nulle : une base à 0 rend le rebasage impossible
  // (division par zéro) et faisait disparaître la série sans le moindre signal.
  const startIndex = merged.findIndex((row) => keys.every((k) => row[k] != null && row[k] !== 0));
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
 * Date du jour au format ISO (AAAA-MM-JJ), dans le fuseau LOCAL.
 *
 * `new Date().toISOString().slice(0, 10)` renvoie la date UTC : en France
 * (UTC+1/+2), tout ce qui se passe entre minuit et 2 h du matin était donc
 * daté de la veille, alors que les libellés affichés à côté utilisent l'heure
 * locale. Un relevé pris à 00 h 30 écrasait celui de la veille.
 */
export function todayIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Date ISO en JJ/MM/AA. Partagée par l'onglet Bourse et son sous-onglet
 * Performance depuis leur séparation en deux fichiers.
 */
export function formatDateShort(d) {
  if (!d) return "";
  const [y, m, day] = String(d).split("-");
  if (!y || !m || !day) return "";
  return `${day}/${m}/${y.slice(2)}`;
}

/**
 * Point d'historique servant de référence pour une comparaison « il y a N
 * jours » : le relevé le plus proche de la date cible, choisi parmi ceux qui
 * lui sont antérieurs ou égaux.
 *
 * Le Dashboard comparait auparavant le patrimoine courant au relevé le PLUS
 * RÉCENT de l'historique. Depuis que le relevé quotidien s'exécute à chaque
 * ouverture de l'app (useDailySnapshot), ce point le plus récent est celui
 * d'aujourd'hui : l'écart « vs mois dernier » affiché sous le patrimoine net
 * valait donc structurellement 0 €.
 */
export function referencePointDaysAgo(history, days, now = new Date()) {
  const target = new Date(now);
  target.setDate(target.getDate() - days);
  const targetIso = todayIso(target);

  const dated = (history || []).filter((h) => h.date && Number.isFinite(h.value));
  if (dated.length === 0) return null;

  const older = dated.filter((h) => h.date <= targetIso);
  // Historique plus court que la fenêtre demandée : on prend le plus ancien
  // relevé connu, qui reste une base de comparaison honnête (et on le signale
  // via la date retournée).
  const pool = older.length > 0 ? older : dated;
  return pool.reduce((best, h) => (h.date > best.date ? h : best));
}

/**
 * Compacte l'historique de patrimoine : relevé quotidien conservé tel quel sur
 * la période récente, puis un seul point par mois (le dernier du mois) au-delà.
 *
 * Le relevé automatique ajoute un point par jour dans un blob JSON réécrit et
 * repoussé en entier vers le cloud à chaque modification. Sans compactage,
 * l'historique grossit de ~365 entrées par an indéfiniment, alourdissant à la
 * fois le graphique et chaque synchronisation.
 *
 * Les points saisis à la main sont préservés quoi qu'il arrive : ce sont des
 * jalons voulus par l'utilisateur, pas des relevés automatiques.
 */
export function compactHistory(history, { dailyDays = 120, now = new Date() } = {}) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - dailyDays);
  const cutoffIso = todayIso(cutoff);

  const keep = [];
  const monthlyBest = new Map();

  (history || []).forEach((h) => {
    if (!h.date || h.date >= cutoffIso || h.manual) {
      keep.push(h);
      return;
    }
    const month = h.date.slice(0, 7);
    const current = monthlyBest.get(month);
    if (!current || h.date > current.date) monthlyBest.set(month, h);
  });

  return [...monthlyBest.values(), ...keep].sort((a, b) => ((a.date || "") < (b.date || "") ? -1 : 1));
}

/**
 * Écart de patrimoine net sur une fenêtre glissante, en valeur et en
 * pourcentage, avec la date effectivement utilisée comme référence.
 */
export function netWorthDelta(history, currentValue, days = 30, now = new Date()) {
  const ref = referencePointDaysAgo(history, days, now);
  // Une référence datée d'aujourd'hui ne mesure rien : c'est le cas au premier
  // lancement, où le seul relevé existant est celui que l'app vient de créer.
  // Mieux vaut annoncer l'absence d'historique qu'un écart de 0 € présenté
  // comme une variation sur 30 jours.
  if (!ref || ref.date === todayIso(now)) {
    return { abs: 0, pct: 0, refDate: null, hasReference: false };
  }
  const abs = currentValue - ref.value;
  return {
    abs,
    pct: ref.value > 0 ? (abs / ref.value) * 100 : 0,
    refDate: ref.date,
    hasReference: true,
  };
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
export function solveMonthlyForTarget({
  target,
  currentTotal,
  livretsRate,
  bourseRate,
  years,
  livretsCapital,
  bourseCapital,
}) {
  const n = Math.max(1, years);
  // Rendement moyen réellement pondéré par les montants placés sur chaque
  // poche. La moyenne arithmétique simple (livretsRate + bourseRate) / 2
  // utilisée avant supposait implicitement 50/50 : sur un patrimoine composé
  // à 90 % de livrets, elle surestimait largement le rendement attendu et
  // sous-estimait donc l'effort d'épargne nécessaire.
  const wL = Number.isFinite(livretsCapital) ? Math.max(0, livretsCapital) : null;
  const wB = Number.isFinite(bourseCapital) ? Math.max(0, bourseCapital) : null;
  const totalWeight = wL != null && wB != null ? wL + wB : 0;
  const t = totalWeight > 0 ? (livretsRate * wL + bourseRate * wB) / totalWeight : (livretsRate + bourseRate) / 2;

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
 * Génère une séquence de rendements annuels volatils, pour montrer qu'une
 * projection lisse à 6 %/an ne ressemble pas au chemin réellement parcouru.
 *
 * Il s'agit d'un PROFIL DE VOLATILITÉ, pas d'un historique daté. La version
 * précédente annonçait des « rendements annuels réels 2018-2025 » et associait
 * une année civile à chaque valeur — dont une pour 2025 qui n'était encore
 * qu'une hypothèse au moment où elle a été écrite, et qui continuait d'être
 * présentée comme constatée. Rattacher ces chiffres à des millésimes précis
 * obligerait à les corriger tous les ans, sans rien apporter : ce qui compte
 * ici est l'alternance d'années fortes, plates et négatives.
 *
 * L'ordre de grandeur reste celui d'un indice actions large sur un cycle
 * complet, krachs compris.
 */
export function generateVolatileReturns(years, seed = 0) {
  const realReturns = [
    -0.11, // forte correction
    0.26,  // reprise marquée
    -0.07, // choc brutal en cours d'année
    0.29,  // rebond
    -0.10, // repli lié à l'inflation et aux taux
    0.16,  // reprise
    0.08,  // consolidation
    -0.05, // correction modérée
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
  const { transactionId, date, asset, type, quantity, price, fees, amount, montantNet, plusValueRealisee, id, ratio } = order;
  return {
    id, transactionId: transactionId || null, date, asset, type, quantity, price, fees, amount, montantNet, plusValueRealisee,
    // `ratio` n'a de sens que sur une opération sur titres, mais il DOIT
    // survivre à la persistance : sans lui, un split relu depuis le stockage
    // serait rejoué avec un ratio de 1, c'est-à-dire ignoré en silence.
    ...(type === "SPLIT" ? { ratio } : {}),
  };
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
 * jamais le PRU des titres restants.
 *
 * La plus-value réalisée vaut (prix de vente − PRU) × quantité − frais de
 * vente. Les frais d'ACHAT ne sont PAS re-soustraits ici : `computeBuyOperation`
 * les a déjà incorporés au PRU. L'ancienne version les retranchait une seconde
 * fois via `feesAchatAlloues`, ce qui doublait leur impact — achat de 10 titres
 * à 100 € avec 5 € de frais (PRU 100,50) revendus à 100 € donnait une
 * moins-value de 10 € au lieu des 5 € réellement perdus.
 *
 * `totalBuyFees` continue d'être décrémenté au prorata : il ne sert plus au
 * calcul de la plus-value, seulement au suivi du total des frais payés.
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
  const plusValueRealisee = (p - currentPru) * q - f;
  const newTotalBuyFees = Math.max(0, currentTotalBuyFees - feesAchatAlloues);

  return { montantNet, newQuantity, plusValueRealisee, newTotalBuyFees };
}

// ─── COMPTABILITÉ DÉRIVÉE DU JOURNAL D'OPÉRATIONS ────────────────────────────
// `bourse.operations` est la source de vérité. Les positions (quantité, PRU)
// et les mouvements de cash en sont DÉDUITS, plutôt que mis à jour par petites
// touches à chaque ordre. Avant, supprimer ou modifier une opération ne
// rejouait rien : le journal et le portefeuille divergeaient définitivement,
// sans aucun moyen de les réconcilier.

/** Quantité en dessous de laquelle une position est considérée soldée. */
const QTY_EPSILON = 1e-9;

const normalizeTicker = (s) => String(s ?? "").trim().toUpperCase();

/**
 * Ordonne les opérations du plus ancien au plus récent.
 *
 * Le tableau stocké est ANTI-chronologique (chaque nouvel ordre est ajouté en
 * tête). À date égale, on rejoue donc les indices décroissants pour retrouver
 * l'ordre de saisie réel — sans quoi deux ordres du même jour sur le même
 * titre (un achat puis une vente) se rejouaient à l'envers, et la vente était
 * rejetée faute de titres.
 */
function chronologicalOperations(operations) {
  return (operations || [])
    .map((op, index) => ({ op, index }))
    .filter(({ op }) => op && op.date)
    .sort((a, b) => {
      if (a.op.date !== b.op.date) return a.op.date < b.op.date ? -1 : 1;
      return b.index - a.index;
    })
    .map(({ op }) => op);
}

/**
 * Mouvement de trésorerie d'une opération, du point de vue de la poche de
 * cash du compte-titres. Un achat sort de l'argent (prix + frais), une vente
 * en fait rentrer (prix − frais), un dividende le crédite.
 *
 * Avant, seuls les dividendes touchaient `cash_pocket` : une vente retirait
 * les titres du portefeuille sans que le produit de la vente réapparaisse
 * nulle part. La valeur totale du portefeuille chutait donc du montant vendu,
 * comme si l'argent s'était évaporé.
 */
export function operationCashDelta(op) {
  if (!op) return 0;
  const q = Number(op.quantity) || 0;
  const p = Number(op.price) || 0;
  const f = Number(op.fees) || 0;
  const amount = Number(op.amount ?? op.montantNet ?? 0) || 0;
  if (op.type === "DIVIDENDE") return amount;
  if (op.type === "VERSEMENT") return Math.abs(amount);
  if (op.type === "RETRAIT") return -Math.abs(amount);
  if (op.type === "ACHAT") return -(q * p + f);
  if (op.type === "VENTE") return q * p - f;
  // Une opération sur titres ne fait entrer ni sortir d'argent : elle
  // redistribue la même valeur sur un nombre de titres différent.
  if (op.type === "SPLIT") return 0;
  return 0;
}

/**
 * Ratio d'une opération sur titres.
 *
 * Convention : le ratio est le nombre de titres obtenus pour un titre détenu.
 * Un split 1:10 vaut donc 10, un regroupement 10:1 vaut 0,1. La quantité est
 * multipliée par ce ratio, le prix de revient unitaire divisé par lui — la
 * valeur totale de la ligne, elle, ne bouge pas d'un centime.
 *
 * Sans ce traitement, un split rendait la position silencieusement fausse :
 * le journal continuait d'appliquer l'ancienne quantité et l'ancien PRU à un
 * cours divisé par dix, et la ligne affichait −90 % de performance. Le
 * scénario n'a rien de théorique pour qui détient des actions en direct
 * pendant plusieurs années.
 */
export function ratioSplit(op) {
  const r = Number(op?.ratio);
  return Number.isFinite(r) && r > 0 ? r : 1;
}

/** Types d'opérations qui font entrer ou sortir de l'argent du compte. */
export const CASH_MOVEMENT_TYPES = ["VERSEMENT", "RETRAIT"];

/** Somme des mouvements de trésorerie de tout un journal. */
export function totalCashDelta(operations) {
  return (operations || []).reduce((s, op) => s + operationCashDelta(op), 0);
}

/**
 * Ligne de base du grand livre.
 *
 * Reconstruire les positions à partir du journal ne peut pas s'appliquer
 * rétroactivement sans risque : jusqu'ici les positions étaient tenues à la
 * main ET par le journal, sans garantie que les deux se recoupent (lignes
 * saisies directement dans l'onglet Bourse, portefeuille antérieur à la tenue
 * du journal, imports partiels). Rejouer l'existant écraserait donc des
 * quantités et des PRU saisis manuellement.
 *
 * La ligne de base fige l'état actuel comme point de départ : les positions
 * et la poche de cash du jour de la migration sont conservées telles quelles,
 * les opérations déjà enregistrées sont marquées « déjà comptabilisées », et
 * seules les opérations ajoutées ENSUITE sont rejouées par-dessus. Aucune
 * donnée existante n'est réinterprétée, et la comptabilité devient exacte à
 * partir de maintenant.
 */
export function createLedgerBaseline(bourse, precedente = bourse?.ledgerBaseline) {
  /**
   * Date d'ancrage d'un lot : depuis QUAND la ligne est-elle détenue ?
   *
   * C'est la seule information que la ligne de base ne peut pas déduire des
   * positions, et c'est celle dont le TRI a besoin — un taux annualisé sans
   * durée n'a aucun sens.
   *
   * Trois sources, dans cet ordre :
   *
   *  1. **L'ancre déjà connue.** `rebaselineLedger` est appelé à CHAQUE
   *     retouche manuelle d'une position. Sans cette reprise, corriger un
   *     cours suffisait à ramener l'ancre à aujourd'hui, donc à effacer
   *     l'ancienneté de la ligne — et avec elle son TRI, puisque la série ne
   *     couvrait plus aucun jour.
   *  2. **La plus ancienne opération connue** sur ce ticker, quand la ligne
   *     n'avait pas encore d'ancre : le journal sait mieux que nous.
   *  3. **Aujourd'hui**, en dernier recours. Le TRI restera nul trente jours,
   *     ce qui est le comportement correct : on ne sait rien de son passé.
   */
  const premiereOperation = {};
  for (const op of bourse?.operations || []) {
    const t = normalizeTicker(op?.asset);
    if (!t || !op.date) continue;
    if (!premiereOperation[t] || op.date < premiereOperation[t]) premiereOperation[t] = op.date;
  }

  const lots = {};
  for (const p of bourse?.positions || []) {
    const ticker = normalizeTicker(p.ticker);
    if (!ticker) continue;
    lots[ticker] = {
      quantity: Number(p.quantity) || 0,
      pru: Number(p.pru) || 0,
      totalBuyFees: Number(p.totalBuyFees) || 0,
      at: precedente?.lots?.[ticker]?.at || premiereOperation[ticker] || todayIso(),
    };
  }
  // Ancrage de la courbe Capital investi : le total versé saisi à la main dans
  // « Plafond de versements PEA ». C'est le seul chiffre exact — l'utilisateur
  // le connaît, contrairement à toute reconstitution automatique.
  //
  // À défaut (champ jamais renseigné), on retombe sur la meilleure estimation
  // possible : prix de revient des titres détenus + cash disponible.
  const declared = Number(bourse?.peaVersements) || 0;
  const investedOpening =
    declared > 0
      ? declared
      : (bourse?.positions || []).reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.pru) || 0), 0) +
        (bourse?.cash_pocket || 0);

  return {
    at: todayIso(),
    operationIds: (bourse?.operations || []).map((op) => op.id).filter(Boolean),
    cashOpening: bourse?.cash_pocket || 0,
    investedOpening,
    // Uniquement les quantités/PRU de départ : surtout PAS un instantané
    // complet des positions. Les métadonnées (cours actuel rafraîchi, nom,
    // dividende annuel) continuent de vivre dans `bourse.positions` et seraient
    // ramenées en arrière à chaque rejeu si elles étaient figées ici.
    lots,
  };
}

/** Opérations à rejouer : celles qui ne font pas partie de la ligne de base. */
export function operationsAfterBaseline(operations, baseline) {
  if (!baseline) return operations || [];
  const frozen = new Set(baseline.operationIds || []);
  return (operations || []).filter((op) => !frozen.has(op.id));
}

/**
 * Reconstruit les positions en rejouant le journal d'opérations dans l'ordre
 * chronologique, par-dessus les positions de la ligne de base.
 *
 * Ce que la fonction NE touche PAS, pour ne jamais écraser une saisie manuelle :
 *  - les métadonnées de chaque position (nom, type, cours actuel, dividende
 *    annuel, identifiant, secteur…) sont reprises telles quelles de la position
 *    existante du même ticker ; seuls quantité / PRU / frais cumulés bougent ;
 *  - une position qu'AUCUNE opération rejouée ne concerne est conservée
 *    intacte, quantité et PRU compris — y compris une ligne ajoutée à la main
 *    dans l'onglet Bourse après la mise en place de la ligne de base ;
 *  - les lots de la ligne de base servent de socle : un achat rejoué s'y
 *    ajoute en moyenne pondérée au lieu de repartir de zéro.
 */
export function rebuildPositionsFromOperations(operations, currentPositions = [], baselineLots = {}) {
  const replayed = new Map(); // ticker normalisé -> { quantity, pru, totalBuyFees }

  // Socle : les quantités/PRU figés au moment de la mise en place de la ligne
  // de base. Un ticker absent du socle démarre à zéro — sa position actuelle
  // est alors entièrement décrite par les opérations rejouées.
  for (const [ticker, lot] of Object.entries(baselineLots || {})) {
    replayed.set(normalizeTicker(ticker), {
      quantity: Number(lot.quantity) || 0,
      pru: Number(lot.pru) || 0,
      totalBuyFees: Number(lot.totalBuyFees) || 0,
      touched: false,
      // Un titre présent dans le socle est TOUJOURS gouverné par le rejeu,
      // même si aucune opération ne le concerne : c'est ce qui permet à la
      // suppression d'un ordre de ramener réellement la position à son état
      // de départ, au lieu de laisser en place la quantité déjà appliquée.
      inBaseline: true,
    });
  }

  for (const op of chronologicalOperations(operations)) {
    // Les dividendes ne touchent aucune position ; les splits, si.
    if (op.type !== "ACHAT" && op.type !== "VENTE" && op.type !== "SPLIT") continue;
    const ticker = normalizeTicker(op.asset);
    if (!ticker) continue;
    const current = replayed.get(ticker) || null;

    if (op.type === "SPLIT") {
      // Rien à diviser tant qu'aucun titre n'est détenu : un split appliqué à
      // une ligne vide n'a pas de sens, et diviser un PRU nul propagerait des
      // NaN dans tous les calculs aval.
      if (!current || current.quantity <= QTY_EPSILON) continue;
      const ratio = ratioSplit(op);
      replayed.set(ticker, {
        ...current,
        quantity: current.quantity * ratio,
        pru: current.pru / ratio,
        touched: true,
      });
      continue;
    }

    if (op.type === "ACHAT") {
      const { newQuantity, newPru, newTotalBuyFees } = computeBuyOperation(current, op);
      replayed.set(ticker, { ...current, quantity: newQuantity, pru: newPru, totalBuyFees: newTotalBuyFees, touched: true });
    } else {
      // Vente sans titres au compteur : le journal est incohérent (ordre
      // supprimé, import partiel). On l'ignore plutôt que de fabriquer une
      // quantité négative qui rendrait tous les calculs aval absurdes.
      if (!current || current.quantity <= QTY_EPSILON) continue;
      const q = Math.min(Number(op.quantity) || 0, current.quantity);
      const { newQuantity, newTotalBuyFees } = computeSellOperation(current, { ...op, quantity: q });
      replayed.set(ticker, { ...current, quantity: newQuantity, pru: current.pru, totalBuyFees: newTotalBuyFees, touched: true });
    }
  }

  const out = [];

  // On repart de l'ordre d'affichage actuel pour ne pas réorganiser la liste
  // sous les yeux de l'utilisateur à chaque ajout d'ordre.
  for (const position of currentPositions || []) {
    const ticker = normalizeTicker(position.ticker);
    const state = replayed.get(ticker);
    replayed.delete(ticker);
    if (!state || (!state.touched && !state.inBaseline)) {
      // Ni socle ni opération rejouée : ligne ajoutée à la main après la mise
      // en place de la ligne de base, on n'y touche pas.
      out.push(position);
      continue;
    }
    if (state.quantity <= QTY_EPSILON) continue; // position intégralement soldée
    out.push({ ...position, quantity: state.quantity, pru: state.pru, totalBuyFees: state.totalBuyFees });
  }

  // Titres apparus dans le journal mais absents du portefeuille.
  for (const [ticker, state] of replayed) {
    if (!state.touched || state.quantity <= QTY_EPSILON) continue;
    out.push({
      id: uid(),
      ticker,
      name: ticker,
      type: "Action",
      current_price: state.pru,
      annual_dividend: 0,
      quantity: state.quantity,
      pru: state.pru,
      totalBuyFees: state.totalBuyFees,
    });
  }

  return out;
}

/**
 * Cumul des versements réellement apportés au compte, jour par jour — la
 * courbe « Capital investi ».
 *
 * Elle se déduit du journal d'opérations, PAS de l'état courant des positions.
 * L'ancienne version traçait `Σ quantité × PRU`, c'est-à-dire le prix de
 * revient des titres détenus à l'instant T : toute vente la faisait chuter, et
 * un simple arbitrage (vendre A pour acheter B) creusait un trou dans une
 * courbe qui ne peut, par définition, que croître.
 *
 * Conventions — seuls les mouvements d'argent AVEC L'EXTÉRIEUR comptent :
 *  - un VERSEMENT augmente le cumul ;
 *  - un RETRAIT le diminue — le seul cas où la courbe peut descendre ;
 *  - un ACHAT ne change rien : l'argent était déjà sur le compte, il change
 *    seulement de forme (cash → titres). C'est précisément l'erreur de
 *    l'ancienne courbe, qui traitait chaque achat comme un apport ;
 *  - une VENTE ne change rien non plus (titres → cash) ;
 *  - un DIVIDENDE ne change rien : c'est un rendement, pas un apport personnel.
 *
 * La série est donc monotone non-décroissante en l'absence de retrait, par
 * construction et non par accident.
 */
export function computeCumulativeContributions(operations) {
  const byDate = new Map();
  let cumul = 0;

  for (const op of chronologicalOperations(operations)) {
    if (op.type !== "VERSEMENT" && op.type !== "RETRAIT") continue;
    cumul += operationCashDelta(op);
    byDate.set(op.date, cumul); // une seule valeur par jour : la dernière
  }

  return [...byDate.entries()].map(([date, capital]) => ({ date, capital }));
}

/**
 * Valeur du cumul des versements à une date donnée, pour aligner la courbe
 * « Capital investi » sur les dates de l'historique de valorisation (qui a sa
 * propre cadence, quotidienne). Renvoie le dernier palier atteint à cette date.
 */
export function contributionsAsOf(series, date) {
  let value = 0;
  for (const point of series) {
    if (point.date > date) break;
    value = point.capital;
  }
  return value;
}

/**
 * Courbe « Capital investi » prête à l'emploi pour un état `bourse` complet :
 * l'ancrage de départ (versements antérieurs au journal) plus le cumul des
 * versements rejoués par-dessus.
 *
 * Remplace l'ancien `Σ quantité × PRU + cash`, qui mesurait le prix de revient
 * des titres DÉTENUS à l'instant T : toute vente le faisait chuter, et un
 * arbitrage (vendre A pour acheter B) creusait un trou dans une courbe qui ne
 * peut, par construction, que croître.
 */
export function computeInvestedCapital(bourse) {
  const baseline = bourse?.ledgerBaseline;
  const replayable = baseline ? operationsAfterBaseline(bourse?.operations, baseline) : bourse?.operations || [];
  // Avant toute écriture au grand livre, l'ancrage est le total versé saisi à
  // la main : la courbe est donc correcte dès le premier affichage, sans
  // attendre qu'une opération vienne créer la ligne de base.
  const opening = baseline
    ? baseline.investedOpening || 0
    : Number(bourse?.peaVersements) ||
      (bourse?.positions || []).reduce((s, p) => s + (Number(p.quantity) || 0) * (Number(p.pru) || 0), 0) +
        (bourse?.cash_pocket || 0);
  return { opening, series: computeCumulativeContributions(replayable) };
}

/** Valeur de la courbe « Capital investi » à une date donnée. */
export function investedCapitalAsOf({ opening, series }, date) {
  return (opening || 0) + contributionsAsOf(series || [], date);
}

/**
 * Applique un nouveau journal d'opérations à l'état `bourse`, en redéduisant
 * positions, PRU et poche de cash.
 *
 * C'est le SEUL chemin par lequel `bourse.operations` doit être modifié :
 * toute mutation (ajout, édition, suppression, purge) repasse par ici, ce qui
 * garantit que le journal et le portefeuille ne peuvent plus diverger.
 */
export function applyOperationsToBourse(bourse, nextOperations) {
  const baseline = bourse?.ledgerBaseline || createLedgerBaseline(bourse);
  const replayable = operationsAfterBaseline(nextOperations, baseline);
  const next = {
    ...bourse,
    ledgerBaseline: baseline,
    operations: nextOperations,
    positions: rebuildPositionsFromOperations(replayable, bourse?.positions, baseline.lots),
    cash_pocket: (baseline.cashOpening || 0) + totalCashDelta(replayable),
  };

  // Le total versé PEA suit désormais les mouvements de trésorerie : il part
  // du chiffre saisi à la main et monte à chaque versement, descend à chaque
  // retrait. La jauge de plafond et la courbe Capital investi affichent donc
  // le même nombre, au lieu de vivre chacune de leur côté.
  next.peaVersements = Math.max(0, Math.round(investedCapitalAsOf(computeInvestedCapital(next), todayIso())));
  return next;
}

/**
 * Refixe la ligne de base sur l'état courant.
 *
 * À appeler après toute modification MANUELLE des positions (ajout, édition
 * de quantité/PRU, suppression depuis l'onglet Bourse) : la saisie de
 * l'utilisateur devient le nouveau point de départ, et les opérations déjà
 * enregistrées passent en « déjà comptabilisées ».
 *
 * Sans ça, le prochain rejeu du journal recalculerait la position à partir de
 * l'ancien socle et écraserait purement et simplement la correction manuelle.
 */
export function rebaselineLedger(bourse) {
  return { ...bourse, ledgerBaseline: createLedgerBaseline(bourse) };
}

/**
 * Enregistre un ajustement manuel de la poche de cash comme un vrai mouvement
 * daté (VERSEMENT ou RETRAIT) plutôt que comme une écriture silencieuse.
 *
 * Sans ça, l'app n'aurait plus aucun moyen de distinguer « j'ai alimenté mon
 * PEA » (un apport, qui doit faire monter la courbe Capital investi sans
 * compter comme une performance) de « mes titres ont pris de la valeur ».
 */
export function buildCashAdjustment(currentCash, targetCash, date = todayIso()) {
  const delta = Number(targetCash) - Number(currentCash);
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) return null;
  return {
    id: uid(),
    date,
    type: delta > 0 ? "VERSEMENT" : "RETRAIT",
    asset: null,
    amount: Math.abs(delta),
    montantNet: Math.abs(delta),
    quantity: null,
    price: null,
    fees: 0,
    plusValueRealisee: null,
  };
}

/**
 * Les montants agrégés ici sont des EUROS et passent donc par `tauxPosition` :
 * une ligne cotée en dollars était auparavant comptée à parité 1:1, ce qui
 * faussait le dividende annuel total, la moyenne mensuelle et les deux
 * rendements de portefeuille — le reste de l'application ayant déjà été
 * converti (voir `valeurPosition` / `coutPosition`).
 *
 * Les rendements PAR LIGNE, eux, restent calculés en devise de cotation : le
 * dividende et le prix y sont libellés dans la même unité, et le rapport des
 * deux est donc insensible au change. Les convertir ne changerait rien, sinon
 * introduire un arrondi.
 */
export function computeDividendSummary(positions, enveloppe = "PEA") {
  let totalAnnualDividend = 0;
  let totalNet = 0;
  let totalRetenue = 0;
  let totalValue = 0;
  let totalInvested = 0;

  const perPosition = positions.map((p) => {
    const div = p.annual_dividend || 0;
    const annualAmount = div * (p.quantity || 0) * tauxPosition(p);
    // Retenue à la source du pays d'origine. Dans un PEA elle est
    // DÉFINITIVEMENT perdue : l'absence d'imposition française prive le porteur
    // de tout impôt sur lequel imputer le crédit correspondant. Deux lignes
    // affichant le même rendement ne rapportent donc pas la même chose.
    const retenue = dividendeNet(annualAmount, p.ticker, enveloppe);
    const value = valeurPosition(p);
    const invested = coutPosition(p);
    totalAnnualDividend += annualAmount;
    totalNet += retenue.net;
    totalRetenue += retenue.perdue;
    totalValue += value;
    totalInvested += invested;
    return {
      ...p,
      annualAmount,
      annualAmountNet: retenue.net,
      retenueSource: retenue.perdue,
      tauxRetenuePct: retenue.tauxPct,
      retenueRecuperable: retenue.recuperable,
      yieldOnPrice: dividendYieldOnPrice(div, p.current_price),
      yieldOnCost: dividendYieldOnCost(div, p.pru),
      // Rendement réellement encaissé, seul comparable d'une ligne à l'autre.
      yieldOnPriceNet: value > 0 ? (retenue.net / value) * 100 : 0,
    };
  });

  return {
    perPosition,
    totalAnnualDividend,
    totalAnnualDividendNet: totalNet,
    totalRetenueSource: totalRetenue,
    monthlyAverage: totalAnnualDividend / 12,
    monthlyAverageNet: totalNet / 12,
    portfolioYieldOnValue: totalValue > 0 ? (totalAnnualDividend / totalValue) * 100 : 0,
    portfolioYieldOnValueNet: totalValue > 0 ? (totalNet / totalValue) * 100 : 0,
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
/**
 * Taux de rendement interne d'une SÉRIE DE FLUX datés.
 *
 * `computeXIRR` raisonne sur un historique de portefeuille (capital investi et
 * valeur à chaque date). Pour une ligne isolée, on dispose d'autre chose : les
 * ordres eux-mêmes. Cette variante prend directement les flux, ce qui évite de
 * reconstruire un faux historique de valorisation pour une seule position.
 *
 * Convention : un décaissement est négatif (achat), un encaissement positif
 * (vente, dividende), et la valeur de marché actuelle compte comme un
 * encaissement final — c'est ce qu'on récupérerait en soldant aujourd'hui.
 */
export function tauxRendementInterne(flux = []) {
  const valides = flux
    .filter((f) => f?.date && Number.isFinite(f.montant) && f.montant !== 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (valides.length < 2) return null;

  const positifs = valides.some((f) => f.montant > 0);
  const negatifs = valides.some((f) => f.montant < 0);
  // Sans flux dans les deux sens, aucun taux ne peut annuler la valeur
  // actuelle nette : la dichotomie tournerait dans le vide.
  if (!positifs || !negatifs) return null;

  const jours = (toDate(valides[valides.length - 1].date) - toDate(valides[0].date)) / DAY_MS;
  if (jours < MIN_DAYS_FOR_ANNUALIZATION) return null;

  const t0 = toDate(valides[0].date);
  const van = (taux) =>
    valides.reduce((somme, f) => {
      const annees = (toDate(f.date) - t0) / (365.25 * DAY_MS);
      return somme + f.montant / Math.pow(1 + taux, annees);
    }, 0);

  let bas = -0.9999;
  let haut = 5;
  let vanBas = van(bas);
  const vanHaut = van(haut);
  if (!Number.isFinite(vanBas) || !Number.isFinite(vanHaut) || vanBas * vanHaut > 0) return null;

  let milieu = 0;
  for (let i = 0; i < 200; i++) {
    milieu = (bas + haut) / 2;
    const valeur = van(milieu);
    if (Math.abs(valeur) < 1e-7 || haut - bas < 1e-9) break;
    if (vanBas * valeur < 0) {
      haut = milieu;
    } else {
      bas = milieu;
      vanBas = valeur;
    }
  }
  return milieu * 100;
}

/**
 * TRI d'une position, reconstruit depuis le journal d'opérations.
 *
 * Le PRU dit combien on a payé ; le TRI dit ce que l'argent a rapporté compte
 * tenu de QUAND il a été investi. Deux lignes affichant « +30 % » n'ont rien
 * à voir si l'une a mis six ans et l'autre six mois.
 *
 * **Le journal doit couvrir toute la ligne, sinon le résultat est faux — et
 * spectaculairement faux.** Une position détenue avant la mise en service du
 * journal n'a pas d'achat initial enregistré : la série se résume alors à une
 * petite sortie récente suivie de la valeur totale d'aujourd'hui, ce qui
 * produit un rendement de plusieurs centaines de pourcents par an. C'est
 * exactement le symptôme observé — des TRI tous au-dessus de 30 %.
 *
 * Deux garde-fous :
 *
 *  1. La ligne de base du journal (`ledgerBaseline`), quand elle existe,
 *     fournit la quantité et le PRU d'ouverture : on la réinjecte comme un
 *     achat daté, et le calcul redevient exact.
 *  2. À défaut, on vérifie que les quantités du journal reconstituent bien la
 *     position. Si ce n'est pas le cas, aucun taux n'est renvoyé : mieux vaut
 *     ne rien afficher qu'un chiffre flatteur et faux.
 *
 * @returns {{tri: number|null, complet: boolean, quantiteJournal: number, quantitePosition: number}}
 */
export function triPosition(position, operations = [], options = {}) {
  const { baseline = null, aujourdhui = todayIso() } = options;

  const vide = { tri: null, complet: false, approxime: false, quantiteJournal: 0, quantitePosition: position?.quantity || 0 };
  if (!position?.ticker) return vide;
  const ticker = String(position.ticker).toUpperCase();

  const flux = [];
  let quantiteJournal = 0;

  // Ouverture : la ligne de base fige ce qui existait avant le journal.
  //
  // `lot.at` et non `baseline.at` : le second est la date de CRÉATION de la
  // ligne de base, remise à aujourd'hui à chaque retouche manuelle d'une
  // position. Le flux d'ouverture se retrouvait alors daté du même jour que le
  // solde fictif de clôture — une série couvrant zéro jour, qu'aucun taux
  // annualisé ne peut décrire. C'est ce qui empêchait le TRI de s'afficher.
  const lot = baseline?.lots?.[ticker];
  /*
   * Reprise des lignes de base ANTÉRIEURES à l'introduction de `lot.at`.
   *
   * Elles ne portent qu'une date globale, celle de leur dernière création —
   * souvent récente, puisque toute retouche manuelle en refabrique une.
   *
   * On retient la PLUS ANCIENNE des deux pistes disponibles : la date de la
   * ligne de base, et la plus vieille opération connue sur ce ticker. Les deux
   * sont des indices de « depuis quand cette ligne existe », et rien
   * n'ordonne l'une par rapport à l'autre — une ligne de base peut figer des
   * titres détenus bien avant la première opération saisie, comme elle peut
   * être recréée longtemps après.
   *
   * Prendre le minimum allonge la durée retenue, donc ABAISSE le taux. C'est
   * le bon sens de l'erreur : entre deux approximations, l'application préfère
   * systématiquement celle qui ne flatte pas.
   */
  const plusAncienneOperation = (operations || []).reduce((min, op) => {
    if (String(op?.asset || "").toUpperCase() !== ticker || !op?.date) return min;
    return !min || op.date < min ? op.date : min;
  }, null);
  const candidates = [lot?.at, baseline?.at, plusAncienneOperation].filter(Boolean);
  const ancre = lot?.at || (candidates.length ? candidates.sort()[0] : null);
  if (lot?.quantity > 0 && ancre) {
    flux.push({ date: ancre, montant: -Math.abs(lot.quantity * (lot.pru || 0) + (lot.totalBuyFees || 0)) });
    quantiteJournal += lot.quantity;
  }

  /*
   * SEULES LES OPÉRATIONS POSTÉRIEURES À LA LIGNE DE BASE sont rejouées.
   *
   * `createLedgerBaseline` absorbe les opérations existantes dans les lots et
   * mémorise leurs identifiants ; tout le reste de l'application les écarte
   * ensuite via `operationsAfterBaseline`. Cette fonction était la seule à
   * rejouer le journal ENTIER par-dessus la ligne de base : chaque achat
   * comptait deux fois, la quantité reconstituée ressortait doublée, et la
   * ligne était rangée parmi les « journaux incomplets » alors qu'elle était
   * parfaitement complète. Symptôme observé : presque aucune ligne n'affichait
   * de TRI, et celles qui en affichaient un le tiraient de flux dédoublés.
   *
   * Ordre chronologique indispensable : un split multiplie la quantité
   * ACCUMULÉE JUSQUE-LÀ. L'appliquer sur un total incomplet — ce que ferait le
   * tableau stocké, qui est anti-chronologique — donnerait un compte faux et
   * ferait échouer la réconciliation d'une ligne pourtant complète.
   */
  const aRejouer = baseline ? operationsAfterBaseline(operations, baseline) : operations;
  for (const op of chronologicalOperations(aRejouer)) {
    if (String(op.asset || "").toUpperCase() !== ticker) continue;
    const q = Number(op.quantity) || 0;
    if (op.type === "ACHAT") {
      flux.push({ date: op.date, montant: -Math.abs(q * (op.price || 0) + (op.fees || 0)) });
      quantiteJournal += q;
    } else if (op.type === "VENTE") {
      flux.push({ date: op.date, montant: Math.abs(q * (op.price || 0) - (op.fees || 0)) });
      quantiteJournal -= q;
    } else if (op.type === "DIVIDENDE") {
      flux.push({ date: op.date, montant: Math.abs(Number(op.amount ?? op.montantNet ?? 0) || 0) });
    } else if (op.type === "SPLIT") {
      // Aucun flux de trésorerie : le split ne fait qu'échanger des titres
      // contre d'autres titres. Seul le compteur de quantité bouge.
      quantiteJournal *= ratioSplit(op);
    }
  }

  const quantitePosition = Number(position.quantity) || 0;
  // Tolérance relative : les fractions de titre et les arrondis de PRU ne
  // doivent pas invalider un journal par ailleurs complet.
  const ecart = Math.abs(quantiteJournal - quantitePosition);
  const complet = flux.length > 0 && ecart <= Math.max(0.01, quantitePosition * 0.005);

  if (!complet) {
    return { tri: null, complet: false, approxime: false, quantiteJournal, quantitePosition };
  }

  // La ligne encore détenue vaut sa valeur de marché : on la solde fictivement
  // aujourd'hui pour fermer la série.
  const valeur = valeurPosition(position);
  if (valeur > 0) flux.push({ date: aujourdhui, montant: valeur });

  /*
   * Le taux repose-t-il sur une date d'acquisition RÉELLE ?
   *
   * Le critère est l'existence d'un ORDRE DATÉ sur cette ligne, où qu'il se
   * trouve — rejoué ou figé dans la ligne de base. Un achat absorbé par la
   * ligne de base reste un achat daté : c'est lui qui a fourni l'ancre, et le
   * taux est aussi exact que s'il avait été rejoué.
   *
   * Sans aucun ordre, en revanche, l'ancre n'est qu'une trace — la première
   * fois que l'application a vu la ligne. Elle SOUS-ESTIME l'ancienneté, donc
   * SURESTIME le taux. Plutôt que de masquer le chiffre (il reste le meilleur
   * disponible) ou de le présenter comme exact (il ne l'est pas), on le rend
   * avec sa nature. Même logique que les lignes au journal incomplet, listées
   * avec le nombre de titres retracés plutôt que dotées d'un chiffre flatteur.
   */
  const approxime = Boolean(lot?.quantity > 0) && plusAncienneOperation == null;

  return { tri: tauxRendementInterne(flux), complet: true, approxime, quantiteJournal, quantitePosition };
}

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

  // La dichotomie n'a de sens que si la racine est encadrée par les bornes.
  // Sans cette vérification, un portefeuille hors intervalle (perte quasi
  // totale, ou performance supérieure à +500 %/an) faisait converger la boucle
  // vers une borne, et cette borne était renvoyée comme un taux valide.
  let lo = -0.9999, hi = 5;
  let npvLo = npv(lo);
  let npvHi = npv(hi);
  if (!Number.isFinite(npvLo) || !Number.isFinite(npvHi) || npvLo * npvHi > 0) return null;

  let mid = 0;
  for (let i = 0; i < 200; i++) {
    mid = (lo + hi) / 2;
    const val = npv(mid);
    if (Math.abs(val) < 1e-7 || hi - lo < 1e-9) break;
    // On ne recalcule que la borne effectivement déplacée.
    if (npvLo * val < 0) {
      hi = mid;
      npvHi = val;
    } else {
      lo = mid;
      npvLo = val;
    }
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
  let peakDate = history[0].date;
  let maxDD = 0, maxDDDate = null, maxDDPeakDate = null, recoveryDate = null;
  let inDrawdown = false, currentPeakForDD = peak;

  for (const h of history) {
    if (h.valeur >= peak) {
      if (inDrawdown && h.valeur >= currentPeakForDD) inDrawdown = false;
      peak = h.valeur;
      peakDate = h.date;
    }
    const dd = peak > 0 ? ((h.valeur - peak) / peak) * 100 : 0;
    if (dd < maxDD) {
      maxDD = dd;
      maxDDDate = h.date;
      // `peakDate` doit être la date où ce sommet a été atteint le plus
      // récemment AVANT le creux. Chercher la première valeur égale dans tout
      // l'historique pouvait renvoyer une date des mois trop tôt, dès que deux
      // journées partageaient la même valeur arrondie à l'euro.
      maxDDPeakDate = peakDate;
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
  // Un indice de référence sans variance (valeur figée, ou série trop lisse)
  // rend la régression indéterminée : le rapport cov/varB n'y mesure plus que
  // du bruit de calcul flottant et produit un bêta arbitraire. On préfère
  // n'afficher aucune valeur plutôt qu'un chiffre faux.
  if (!(varB > 1e-18)) return null;

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
    // Comme partout ailleurs, la contribution s'exprime en euros : sans
    // conversion, une ligne en devise étrangère pesait dans le classement à
    // hauteur de son montant nominal, pas de sa valeur réelle.
    const value = valeurPosition(p);
    const invested = coutPosition(p);
    return { ticker: p.ticker, name: p.name, gainAbs: value - invested, invested, value };
  });
  const totalAbsGain = items.reduce((s, i) => s + Math.abs(i.gainAbs), 0);
  return items
    .map((i) => ({ ...i, sharePct: totalAbsGain > 0 ? (Math.abs(i.gainAbs) / totalAbsGain) * 100 : 0 }))
    .sort((a, b) => b.gainAbs - a.gainAbs);
}

/**
 * Performance glissante sur plusieurs fenêtres (1M/3M/6M/1A/YTD/depuis
 * l'origine).
 *
 * Chaque fenêtre est mesurée en Time-Weighted Return, exactement comme
 * `computeTWR` : les apports et retraits de capital survenus pendant la
 * fenêtre sont neutralisés. L'ancienne version comparait brutalement la
 * `valeur` de fin à celle de début, si bien qu'un versement de 1 000 € sur un
 * portefeuille de 10 000 € s'affichait « +10 % de performance sur 1 mois »
 * ici, alors que le TWR du même onglet indiquait ~0 %. Les deux chiffres
 * étaient visibles côte à côte et se contredisaient.
 */
export function computeRollingPerformance(history) {
  if (!history || history.length === 0) return null;
  const latest = history[history.length - 1];
  const latestDate = toDate(latest.date);
  const earliestDate = toDate(history[0].date);

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
    const startIndex = history.findIndex((p) => toDate(p.date) >= refDate);
    if (startIndex === -1) return null;
    // On démarre un cran avant la fenêtre quand c'est possible : le premier
    // rendement quotidien a besoin d'un point de référence antérieur.
    const slice = history.slice(Math.max(0, startIndex - 1));
    if (slice.length < 2) return null;
    const returns = computeDailyReturns(slice);
    if (returns.length === 0) return null;
    return (returns.reduce((acc, { r }) => acc * (1 + r / 100), 1) - 1) * 100;
  };

  const overall = computeTWR(history);

  return {
    m1: changeFrom(back(1)),
    m3: changeFrom(back(3)),
    m6: changeFrom(back(6)),
    y1: changeFrom(back(0, 1)),
    ytd: changeFrom(ytdStart),
    sinceOrigin: overall ? overall.totalReturnPct : null,
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

  // Le rendement de référence est le TWR de la période, neutralisé des
  // apports. L'ancienne version rapportait la valeur finale au capital de
  // départ : chaque versement effectué pendant la période était compté comme
  // du rendement, ce qui surévaluait massivement le chiffre sur un plan
  // d'investissement programmé.
  const twr = computeTWR(history);
  if (!twr) return null;

  // Les dividendes sont crédités sur la poche de cash : ils sont donc DÉJÀ
  // dans la valeur du portefeuille, et donc déjà dans le TWR. C'est le
  // rendement « hors dividendes » qu'il faut reconstituer en les retirant, et
  // non l'inverse.
  const values = history.map((h) => h.valeur).filter((v) => Number.isFinite(v) && v > 0);
  const averageValue = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const dividendContributionPct = averageValue > 0 ? (dividendsInPeriod / averageValue) * 100 : 0;

  const withDividends = twr.totalReturnPct;
  const withoutDividends = withDividends - dividendContributionPct;

  return { withDividends, withoutDividends, dividendsInPeriod, dividendContributionPct };
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


/**
 * Plafonds de versements du PEA.
 *
 * Le plafond était codé en dur à 150 000 €, ce qui est le cas du PEA
 * classique — mais pas celui d'un titulaire de 18 à 25 ans encore RATTACHÉ AU
 * FOYER FISCAL de ses parents. Celui-ci détient un « PEA jeune », plafonné à
 * 20 000 € tant que dure le rattachement, et qui devient un PEA ordinaire au
 * moment du détachement.
 *
 * L'écart n'est pas cosmétique : afficher 150 000 € à quelqu'un qui en a
 * 20 000 lui fait croire qu'il a consommé sept fois moins de marge qu'en
 * réalité, sur la jauge principale de son onglet Portefeuille.
 *
 * Le type est stocké dans `bourse.peaType`. En l'absence de choix explicite,
 * on retient le PEA classique : c'est le cas le plus courant, et surestimer le
 * plafond ne déclenche aucune alerte trompeuse — l'inverse, si.
 */
export const PEA_PLAFONDS = {
  classique: { plafond: 150000, label: "PEA classique", detail: "Plafond de versements de 150 000 €." },
  jeune: {
    plafond: 20000,
    label: "PEA jeune (18-25 ans rattaché)",
    detail:
      "Plafond de 20 000 € tant que tu es rattaché au foyer fiscal de tes parents. Il passe à 150 000 € au détachement, sans rien perdre de l'antériorité fiscale.",
  },
};

export const PEA_PLAFOND_VERSEMENTS = PEA_PLAFONDS.classique.plafond;

/** Plafond applicable à un état `bourse` donné. */
export function plafondPea(bourse) {
  return (PEA_PLAFONDS[bourse?.peaType] || PEA_PLAFONDS.classique).plafond;
}

/** Nombre d'années de détention à partir desquelles le PEA est exonéré d'IR. */
export const PEA_ANNEES_EXONERATION = 5;

/** Âge du PEA en années/mois + statut fiscal (règle des 5 ans). */
export function computePeaAge(dateOuverture) {
  if (!dateOuverture) return null;
  const start = new Date(`${dateOuverture}T00:00:00`);
  const now = new Date();
  const totalMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const eligible = totalMonths >= 60;
  const monthsRemaining = Math.max(0, 60 - totalMonths);
  return { years, months, eligible, monthsRemaining };
}
