import { todayIso, valeurPosition, eur, nombre, pct, pctPlain, lireNombre } from "./finance";
import { plafondLegal } from "./plafondsLivrets";
import { alertesPanique, aRelire, resultatsARelire } from "./theses";
import { recurrences } from "./analyseCompte";
import { rapprocherCompte, statutContrat, statutDe, joursEntre, prochainPrelevement } from "./abonnements";
import { boostsAFinir, interetsFinAnnee, projectionVirement, verifierVirement, deMot } from "./epargne";
import { controlesDonnees } from "./qualiteDonnees";
import { rapprocherAvances, aRelancer } from "./avances";

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
  strategyNotes = [], series = {}, evenements = [],
  subs = [], contracts = [], compteEnrichies = [], ignores = [],
  enveloppes = [], objectifs = [], compteReleves = [], patrimoineNet = 0, avances = [],
  aujourdhui = todayIso(),
} = {}) {
  const liste = [];
  // Un mois abrégé (« sept. ») en fin de phrase doublait le point final.
  const ajouter = (e) => liste.push({ ...e, texte: e.texte.replace(/\.\.$/, ".") });

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
  for (const { note, evenement } of resultatsARelire({ notes: strategyNotes, evenements, aujourdhui })) {
    ajouter({
      id: `resultats-${note.id}-${evenement.date}`,
      urgence: "attention",
      type: "these",
      texte: `${note.ticker} a publié ses résultats le ${dateCourte(evenement.date)} — ta thèse tient-elle toujours face aux chiffres ?`,
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
  for (const b of boostsAFinir(livrets, { aujourdhui })) {
    const apres = pctPlain(b.tauxApres * 100, 2);
    ajouter({
      id: `boost-${b.livret.id}`,
      urgence: b.jours < 0 ? "critique" : "attention",
      type: "epargne",
      texte:
        b.jours < 0
          ? `Le taux boosté de ${b.livret.name} est terminé depuis le ${dateCourte(b.fin)} : passe-le à ${apres} dans ses réglages.`
          : `Le taux boosté de ${b.livret.name} se termine le ${dateCourte(b.fin)}, puis ${apres}.`,
      lien: { onglet: "livrets" },
    });
  }

  const interets = interetsFinAnnee(livrets, { aujourdhui }).filter((x) => x.verse == null);
  if (interets.length > 0) {
    const total = interets.reduce((s, x) => s + x.estime, 0);
    ajouter({
      id: `interets-${interets[0].annee}`,
      urgence: "info",
      type: "epargne",
      texte: `Intérêts ${interets[0].annee} à enregistrer sur ${interets.length} livret${interets.length > 1 ? "s" : ""} (environ ${eur(total, 2)}).`,
      lien: { onglet: "livrets" },
      sensible: true,
    });
  }

  // Un livret dont le virement programmé bute sur le plafond est signalé par
  // le virement, pas une seconde fois par la jauge de remplissage.
  const parVirement = new Set();
  for (const l of livrets || []) {
    const projection = projectionVirement(l, { aujourdhui });
    if (!projection) continue;
    if (projection.atteint || (projection.moisRestants != null && projection.moisRestants <= 2)) {
      parVirement.add(l.id);
      ajouter({
        id: `virement-plafond-${l.id}`,
        urgence: projection.atteint ? "critique" : "attention",
        type: "epargne",
        texte: projection.atteint
          ? `${l.name} est au plafond : redirige ton virement de ${eur(projection.montant)} par mois.`
          : `Ton virement vers ${l.name} atteindra le plafond en ${new Date(`${projection.datePlafond}T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}.`,
        lien: { onglet: "livrets" },
      });
    }
    const controle = verifierVirement(l, compteEnrichies);
    if (controle.statut === "absent") {
      ajouter({
        id: `virement-absent-${l.id}`,
        urgence: "attention",
        type: "epargne",
        texte: `Virement de ${eur(projection.montant)} vers ${l.name} pas repéré sur ton relevé ${deMot(new Date(`${controle.mois}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long" }))}.`,
        lien: { onglet: "livrets" },
      });
    }
  }

  for (const l of livrets || []) {
    if (parVirement.has(l.id)) continue;
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

  // ── Avances non remboursées depuis plus d'un mois ─────────────────────
  for (const s of aRelancer(rapprocherAvances(avances, compteEnrichies), { aujourdhui })) {
    ajouter({
      id: `avance-${s.personne}`,
      urgence: "info",
      type: "epargne",
      texte: `${s.personne} te doit encore ${eur(s.du, 2)} depuis le ${dateCourte(s.depuis)}.`,
      lien: { onglet: "compte", sous: "avances" },
      sensible: true,
    });
  }

  // ── Santé des données : un seul rappel, pour ce qui fausse un calcul ────
  // Le détail vit dans le panneau « Santé des données » ; le répéter ici
  // noierait le reste de la liste.
  const aCorriger = controlesDonnees(
    { livrets, enveloppes, bourse, compteReleves, objectifs, subs, contracts, strategyNotes, patrimoineNet },
    { aujourdhui }
  ).filter((c) => c.gravite === "attention");
  if (aCorriger.length > 0) {
    ajouter({
      id: "sante-donnees",
      urgence: "attention",
      type: "donnees",
      texte: `${aCorriger.length} incohérence${aCorriger.length > 1 ? "s" : ""} à corriger dans tes données : elle${aCorriger.length > 1 ? "s faussent" : " fausse"} certains totaux.`,
      ouvrir: "donnees",
    });
  }

  return liste.sort((a, b) => URGENCES[a.urgence] - URGENCES[b.urgence]);
}
