import { variationDuJour, tauxPosition } from "./finance";
import { dividendeAttendu } from "../../shared/dividendes.js";
import { evenementsReference } from "../../shared/calendrierReference.js";
import { evaluerObjectif } from "./objectifs";

/**
 * Briefing du jour : ce qu'on veut savoir en ouvrant l'application, en
 * quelques phrases, avant de dérouler le reste.
 *
 * Chaque phrase s'appuie sur une donnée déjà présente — variation des cours,
 * agenda publié des sociétés, calendrier de détachement, objectifs. Une
 * phrase sans donnée fiable n'est PAS écrite : un briefing vide vaut mieux
 * qu'un briefing qui comble les trous.
 *
 * Module pur : aucune requête, aucune dépendance React.
 */

const fmtEur = (n) =>
  Math.round(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const signe = (n) => (n >= 0 ? `+${fmtEur(n)}` : `−${fmtEur(Math.abs(n))}`);
const nomCourt = (p) => (p?.name || p?.ticker || "").replace(/\s+(S\.?A\.?|SE|SA|plc|N\.V\.)$/i, "");

/** Contribution de chaque ligne à la variation de la séance, en euros. */
export function contributionsDuJour(positions = []) {
  return (positions || [])
    .map((p) => {
      const q = Number(p?.quantity) || 0;
      const cours = Number(p?.current_price);
      const veille = Number(p?.previousClose);
      if (!q || !(cours > 0) || !(veille > 0)) return null;
      return { position: p, montant: (cours - veille) * q * tauxPosition(p) };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant));
}

/**
 * @returns {Array<{cle: string, ton: "hausse"|"baisse"|"neutre"|"info", texte: string}>}
 */
export function construireBriefing({
  positions = [],
  envelope = "PEA",
  objectifs = [],
  patrimoineNet = 0,
  epargneMensuelle = 0,
  tauxAnnuelPct = 0,
  coursDuJour = true,
  recordDuJour = null,
  aujourdhui,
} = {}) {
  const phrases = [];

  // ── La séance ─────────────────────────────────────────────────────────────
  const variation = variationDuJour(positions);
  if (variation.exploitable) {
    const quand = coursDuJour ? "aujourd'hui" : "à la dernière séance connue";
    if (Math.abs(variation.pourcentage) < 0.05) {
      phrases.push({ cle: "seance", ton: "neutre", texte: `Bourse stable ${quand}.` });
    } else {
      const meneur = contributionsDuJour(positions).find((c) => Math.sign(c.montant) === Math.sign(variation.montant));
      const pct = `${variation.pourcentage >= 0 ? "+" : "−"}${Math.abs(variation.pourcentage).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}\u202f%`;
      phrases.push({
        cle: "seance",
        ton: variation.montant >= 0 ? "hausse" : "baisse",
        texte:
          `${signe(variation.montant)} en bourse ${quand} (${pct})` +
          (meneur ? `, ${variation.montant >= 0 ? "porté par" : "pesé par"} ${nomCourt(meneur.position)} (${signe(meneur.montant)})` : "") +
          ".",
      });
    }
  }

  if (recordDuJour) {
    phrases.push({ cle: "record", ton: "hausse", texte: `Nouveau record de patrimoine : ${fmtEur(recordDuJour)}.` });
  }

  // ── L'agenda de la semaine ────────────────────────────────────────────────
  const fin = new Date(`${aujourdhui}T12:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + 7);
  const finIso = fin.toISOString().slice(0, 10);
  const tickers = [...new Set((positions || []).filter((p) => Number(p?.quantity) > 0).map((p) => p.ticker))];
  const prochains = evenementsReference(tickers)
    .filter((e) => e.date >= aujourdhui && e.date <= finIso)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (prochains.length > 0) {
    const e = prochains[0];
    const jour = new Date(`${e.date}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    phrases.push({
      cle: "agenda",
      ton: "info",
      texte:
        `${e.name} : ${e.label.charAt(0).toLowerCase()}${e.label.slice(1)}, ${e.date === aujourdhui ? "aujourd'hui" : jour}` +
        (prochains.length > 1 ? ` (et ${prochains.length - 1} autre${prochains.length > 2 ? "s" : ""} rendez-vous cette semaine).` : "."),
    });
  }

  // ── Les dividendes du mois ────────────────────────────────────────────────
  const mois = String(Number(aujourdhui.slice(5, 7)));
  const duMois = (positions || [])
    .map((p) => ({ p, part: Number(p?.dividendeMois?.[mois]) || 0 }))
    .filter(({ p, part }) => part > 0 && dividendeAttendu(p, envelope) > 0)
    .map(({ p, part }) => ({ nom: nomCourt(p), montant: dividendeAttendu(p, envelope) * part }));
  if (duMois.length > 0) {
    const total = duMois.reduce((s, d) => s + d.montant, 0);
    phrases.push({
      cle: "dividendes",
      ton: "info",
      texte: `Dividende${duMois.length > 1 ? "s" : ""} attendu${duMois.length > 1 ? "s" : ""} ce mois-ci : ${duMois.map((d) => d.nom).join(", ")} (environ ${fmtEur(total)}, d'après le calendrier de l'an dernier).`,
    });
  }

  // ── L'objectif le plus proche ─────────────────────────────────────────────
  const prochainObjectif = [...(objectifs || [])]
    .filter((o) => o?.echeance && o.cible > patrimoineNet)
    .sort((a, b) => (a.echeance < b.echeance ? -1 : 1))[0];
  if (prochainObjectif) {
    const etat = evaluerObjectif(prochainObjectif, { patrimoineActuel: patrimoineNet, epargneMensuelle, tauxAnnuelPct, aujourdhui });
    phrases.push({
      cle: "objectif",
      ton: etat.enAvance ? "hausse" : "baisse",
      texte: `Objectif « ${prochainObjectif.libelle || "sans nom"} » : ${fmtEur(Math.abs(etat.ecart))} ${etat.enAvance ? "d'avance" : "de retard"} sur la trajectoire.`,
    });
  }

  return phrases;
}
