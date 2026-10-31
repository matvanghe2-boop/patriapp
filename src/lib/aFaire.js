import { todayIso, valeurPosition, eur, nombre, pct, pctPlain, lireNombre } from "./finance";
import { plafondLegal } from "./plafondsLivrets";
import { alertesPanique, aRelire } from "./theses";
import { recurrences } from "./analyseCompte";
import { rapprocherCompte, statutContrat, statutDe, joursEntre, prochainPrelevement } from "./abonnements";

/**
 * Le centre « À faire » du Dashboard.
 *
 * Chaque onglet produit déjà ses signaux — thèse à relire, contrat à
 * résilier, prélèvement qui a changé de prix, essai qui se termine — mais il
 * fallait faire le tour des onglets pour les voir. Ce module les rassemble en
 * une seule liste, triée par urgence, chaque élément menant à l'onglet ET au
 * sous-onglet où l'on agit.
 *
 * Il ne crée AUCUN signal nouveau : il lit les mêmes fonctions que les
 * onglets, pour qu'une alerte du Dashboard et celle de l'onglet ne puissent
 * jamais se contredire.
 *
 * @returns {{id, urgence: "critique"|"attention"|"info", type, texte, lien: {onglet, sous}, sensible?}[]}
 */
export const URGENCES = { critique: 0, attention: 1, info: 2 };

const dateCourte = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export function elementsAFaire({
  livrets = [], bourse = {}, matelasMois = null, tauxReference = 0,
  strategyNotes = [], series = {},
  subs = [], contracts = [], compteEnrichies = [], ignores = [],
  aujourdhui = todayIso(),
} = {}) {
  const liste = [];
  const ajouter = (e) => liste.push(e);

  // ── Thèses ───────────────────────────────────────────────────────────────
  for (const a of alertesPanique({ notes: strategyNotes, positions: bourse.positions || [], series, aujourdhui })) {
    ajouter({
      id: `panique-${a.note.id}`,
      urgence: "critique",
      type: "these",
      texte:
        a.base === "mois"
          ? `${a.note.ticker} : ${pct(a.variationPct)} en un mois — relis ta thèse avant d'agir.`
          : `${a.note.ticker} est ${pctPlain(Math.abs(a.variationPct), 0)} sous ton prix de revient — relis ta thèse avant d'agir.`,
      lien: { onglet: "strategie", sous: "theses" },
    });
  }
  const aRelireN = (strategyNotes || []).filter((n) => aRelire(n, aujourdhui)).length;
  if (aRelireN > 0) {
    ajouter({
      id: "theses-a-relire",
      urgence: "info",
      type: "these",
      texte: `${aRelireN} thèse${aRelireN > 1 ? "s" : ""} pas relue${aRelireN > 1 ? "s" : ""} depuis six mois.`,
      lien: { onglet: "strategie", sous: "theses" },
    });
  }

  // ── Contrats ─────────────────────────────────────────────────────────────
  for (const c of contracts || []) {
    const st = statutContrat(c, aujourdhui);
    if (st.key === "a_resilier") {
      ajouter({
        id: `contrat-${c.id}`,
        urgence: "critique",
        type: "contrat",
        texte: `${c.label || "Contrat"} : la date limite de résiliation (${dateCourte(st.limite)}) est passée — reconduction le ${dateCourte(c.date_fin)}`,
        lien: { onglet: "abonnements", sous: "contrats" },
      });
    } else if (st.key === "a_renouveler") {
      const j = joursEntre(aujourdhui, st.limite);
      ajouter({
        id: `contrat-${c.id}`,
        urgence: "attention",
        type: "contrat",
        texte: `${c.label || "Contrat"} : ${j === 0 ? "dernier jour" : `${j} jour${j > 1 ? "s" : ""}`} pour résilier avant reconduction.`,
        lien: { onglet: "abonnements", sous: "contrats" },
      });
    }
  }

  // ── Abonnements ──────────────────────────────────────────────────────────
  for (const s of subs || []) {
    if (statutDe(s) !== "essai" || !s.fin_essai) continue;
    const j = joursEntre(aujourdhui, s.fin_essai);
    if (j < 0 || j > 7) continue;
    const montant = lireNombre(s.montant);
    ajouter({
      id: `essai-${s.id}`,
      urgence: j <= 2 ? "critique" : "attention",
      type: "abonnement",
      texte: `Essai ${s.label || ""} : premier prélèvement ${j === 0 ? "aujourd'hui" : j === 1 ? "demain" : `le ${dateCourte(s.fin_essai)}`}${montant ? ` (${eur(montant, 2)})` : ""}.`,
      lien: { onglet: "abonnements", sous: "abonnements" },
    });
  }
  for (const s of subs || []) {
    if (statutDe(s) !== "a_resilier") continue;
    const prochain = prochainPrelevement(s, aujourdhui);
    ajouter({
      id: `a-resilier-${s.id}`,
      urgence: "attention",
      type: "abonnement",
      texte: `${s.label || "Abonnement"} marqué à résilier${prochain ? ` — prochain prélèvement le ${dateCourte(prochain)}` : ""}.`,
      lien: { onglet: "abonnements", sous: "abonnements" },
    });
  }
  if ((compteEnrichies || []).length > 0) {
    const { charges } = recurrences(compteEnrichies);
    const { verifications, detectes } = rapprocherCompte(subs, compteEnrichies, { charges, ignores });
    const urgenceReleve = { toujours_preleve: "critique", double: "critique", montant: "attention", absent: "info" };
    for (const s of subs || []) {
      const v = verifications[s.id];
      if (!v?.trouve || !v.alerte) continue;
      ajouter({
        id: `releve-${s.id}`,
        urgence: urgenceReleve[v.alerte],
        type: "abonnement",
        texte: `${s.label || "Abonnement"} : ${v.detail}`,
        lien: { onglet: "abonnements", sous: "abonnements" },
      });
    }
    if (detectes.length > 0) {
      ajouter({
        id: "abonnements-detectes",
        urgence: "info",
        type: "abonnement",
        texte: `${detectes.length} prélèvement${detectes.length > 1 ? "s" : ""} récurrent${detectes.length > 1 ? "s" : ""} repéré${detectes.length > 1 ? "s" : ""} sur ton relevé, pas encore suivi${detectes.length > 1 ? "s" : ""}.`,
        lien: { onglet: "abonnements", sous: "abonnements" },
      });
    }
  }

  // ── Épargne et liquidités ────────────────────────────────────────────────
  for (const l of livrets || []) {
    const plafond = l.limit || plafondLegal(l.name);
    if (plafond && l.balance / plafond >= 0.95) {
      ajouter({
        id: `livret-${l.id}`,
        urgence: "attention",
        type: "epargne",
        texte: `${l.name} est proche ou au plafond — oriente les prochains versements ailleurs.`,
        lien: { onglet: "livrets" },
      });
    }
  }

  const cash = bourse.cash_pocket || 0;
  const valeurBourse = (bourse.positions || []).reduce((s, p) => s + valeurPosition(p), 0);
  if (cash > 500 && valeurBourse > 0 && cash / (cash + valeurBourse) > 0.15) {
    // Le manque à gagner, et pas seulement le montant détenu : « 2 400 €
    // dorment » se supporte très bien, « ils te coûtent 146 € par an »
    // beaucoup moins. La performance réalisée du portefeuille sert de coût
    // d'opportunité, faute de mieux et parce qu'elle est propre à l'utilisateur.
    ajouter({
      id: "cash-dormant",
      urgence: "info",
      type: "bourse",
      texte: `${eur(cash, 0)} de cash dorment sur ton PEA — environ ${eur(cash * (Math.max(0, tauxReference) / 100), 0)} de manque à gagner par an.`,
      lien: { onglet: "bourse" },
      sensible: true,
    });
  }

  if (matelasMois != null && matelasMois < 3) {
    ajouter({
      id: "matelas-faible",
      urgence: matelasMois < 1 ? "critique" : "attention",
      type: "epargne",
      texte: `Matelas de sécurité de ${nombre(matelasMois, 1)} mois seulement — vise au moins 3 mois de dépenses.`,
      lien: { onglet: "livrets" },
    });
  }

  return liste.sort((a, b) => URGENCES[a.urgence] - URGENCES[b.urgence]);
}
