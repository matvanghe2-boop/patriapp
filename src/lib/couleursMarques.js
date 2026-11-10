import releves from "./couleursMarques.json";

/**
 * Couleur de marque d'une valeur, pour éclairer sa fiche et sa part du
 * portefeuille.
 *
 * Les couleurs viennent des logos, relevées par `node scripts/couleurs-logos.mjs`
 * (le navigateur ne peut pas lire les pixels d'un logo servi par un autre
 * domaine). Le script écarte les logos sans couleur franche ; quelques marques
 * dont le favicon est monochrome ou introuvable sont complétées ici à la main.
 * Relancer le script de temps en temps suffit à suivre les nouveaux logos.
 */
const COMPLEMENTS = {
  "RMS.PA": "#f37021", // Hermès : l'orange de la boîte
  "ML.PA": "#27509b", // Michelin
  "SAF.PA": "#1d2c5e", // Safran
  "ACA.PA": "#009597", // Crédit Agricole
  "RNO.PA": "#f7c800", // Renault
  "HEIA.AS": "#13853d", // Heineken
};

function hexVersHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: Math.round(h * 60), s, l };
}

/** Couleur brute (hexadécimale) relevée pour un ticker, ou `null`. */
export function couleurMarque(ticker) {
  const t = String(ticker || "").toUpperCase();
  return COMPLEMENTS[t] || releves[t] || null;
}

/**
 * Teinte et saturation de la marque, sans la luminosité.
 *
 * La luminosité d'un logo ne convient ni au thème sombre ni au clair : le bleu
 * nuit d'Airbus disparaîtrait sur le fond sombre. On garde donc la TEINTE de la
 * marque, une saturation suffisante pour qu'elle se reconnaisse, et chaque thème
 * fixe sa propre luminosité (voir `.avec-marque` dans effets.css), comme pour
 * les teintes de domaine.
 */
export function teinteMarque(ticker) {
  const hex = couleurMarque(ticker);
  if (!hex) return null;
  const { h, s } = hexVersHsl(hex);
  return { h, s: Math.round(Math.min(92, Math.max(48, s * 100))) };
}

/**
 * Variables CSS à poser sur un élément `.avec-marque`. Sans couleur connue,
 * l'objet est vide et l'élément garde la teinte de son onglet.
 */
export function styleMarque(ticker) {
  const t = teinteMarque(ticker);
  return t ? { "--marque-h": t.h, "--marque-s": `${t.s}%` } : {};
}
