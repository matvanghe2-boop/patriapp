import { todayIso, lireNombre } from "./finance";
import { raccordsReleves } from "./compteCourant";
import { plafondLegal } from "./plafondsLivrets";
import { statutDe } from "./abonnements";

/**
 * Santé des données — les incohérences de tous les onglets, au même endroit.
 *
 * Chaque onglet contrôle ce qu'il affiche, mais aucune vue ne répondait à
 * « mes données sont-elles en ordre ? ». Une position sans cours, un relevé
 * manquant ou une enveloppe orpheline faussent en silence les totaux du
 * Dashboard : ce module les liste, chacun avec l'onglet où le corriger.
 *
 * Deux gravités seulement : `attention` quand un calcul est faux tant que ce
 * n'est pas corrigé, `info` quand c'est peut-être voulu (un livret au-dessus
 * de son plafond grâce aux intérêts capitalisés).
 *
 * @returns {{id, gravite: "attention"|"info", domaine, texte, lien: {onglet, sous?}}[]}
 */

const JOUR_MS = 86400000;
const joursDepuis = (iso, aujourdhui) => Math.round((new Date(`${aujourdhui}T00:00:00`) - new Date(`${String(iso).slice(0, 10)}T00:00:00`)) / JOUR_MS);
const eurosSimples = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export function controlesDonnees(etat = {}, { aujourdhui = todayIso() } = {}) {
  const {
    livrets = [], enveloppes = [], bourse = {}, compteReleves = [], objectifs = [], subs = [], contracts = [],
    strategyNotes = [], patrimoineNet = 0,
  } = etat;
  const sortie = [];
  const ajouter = (e) => sortie.push(e);

  // ── Livrets ──────────────────────────────────────────────────────────────
  const noms = new Map();
  for (const l of livrets) {
    const nom = String(l.name || "").trim().toLowerCase();
    noms.set(nom, (noms.get(nom) || 0) + 1);
    const plafond = l.limit || plafondLegal(l.name);
    if (plafond && Number(l.balance) > plafond + 1) {
      ajouter({
        id: `livret-plafond-${l.id}`,
        gravite: "info",
        domaine: "Livrets",
        texte: `${l.name} : ${eurosSimples(l.balance)} pour un plafond de ${eurosSimples(plafond)}. Normal si l'écart vient des intérêts capitalisés ; sinon, vérifie le solde.`,
        lien: { onglet: "livrets" },
      });
    }
    if (!(Number(l.rate) > 0)) {
      ajouter({
        id: `livret-taux-${l.id}`,
        gravite: "attention",
        domaine: "Livrets",
        texte: `${l.name} : aucun taux renseigné, ses intérêts comptent pour zéro.`,
        lien: { onglet: "livrets" },
      });
    }
  }
  for (const [nom, n] of noms) {
    if (nom && n > 1) {
      ajouter({
        id: `livret-doublon-${nom}`,
        gravite: "attention",
        domaine: "Livrets",
        texte: `« ${nom} » apparaît ${n} fois : un doublon compterait la même épargne deux fois.`,
        lien: { onglet: "livrets" },
      });
    }
  }
  const idsLivrets = new Set(livrets.map((l) => l.id));
  for (const e of enveloppes) {
    if (e.livretId && !idsLivrets.has(e.livretId)) {
      ajouter({
        id: `enveloppe-orpheline-${e.id}`,
        gravite: "attention",
        domaine: "Livrets",
        texte: `L'enveloppe « ${e.label} » est rattachée à un livret qui n'existe plus.`,
        lien: { onglet: "livrets" },
      });
    }
  }

  // ── Bourse ───────────────────────────────────────────────────────────────
  const positions = (bourse.positions || []).filter((p) => Number(p.quantity) > 0);
  for (const p of positions) {
    if (!(Number(p.current_price) > 0)) {
      ajouter({ id: `pos-cours-${p.id}`, gravite: "attention", domaine: "Bourse", texte: `${p.ticker || p.name} : aucun cours, la ligne compte pour zéro dans le patrimoine.`, lien: { onglet: "bourse" } });
    }
    if (!(Number(p.pru) > 0)) {
      ajouter({ id: `pos-pru-${p.id}`, gravite: "attention", domaine: "Bourse", texte: `${p.ticker || p.name} : prix de revient manquant, la plus-value est fausse.`, lien: { onglet: "bourse" } });
    }
  }
  if (positions.length > 0 && bourse.pricesUpdatedAt) {
    const jours = joursDepuis(bourse.pricesUpdatedAt, aujourdhui);
    if (jours > 7) {
      ajouter({ id: "cours-anciens", gravite: "info", domaine: "Bourse", texte: `Cours actualisés il y a ${jours} jours : la valeur du portefeuille date un peu.`, lien: { onglet: "bourse" } });
    }
  }
  const futures = (bourse.operations || []).filter((o) => o?.date && o.date > aujourdhui);
  if (futures.length > 0) {
    ajouter({
      id: "operations-futures",
      gravite: "attention",
      domaine: "Bourse",
      texte: `${futures.length} opération${futures.length > 1 ? "s" : ""} datée${futures.length > 1 ? "s" : ""} dans le futur : probablement une faute de frappe sur l'année.`,
      lien: { onglet: "strategie", sous: "journal" },
    });
  }

  // ── Compte courant ───────────────────────────────────────────────────────
  for (const t of raccordsReleves(compteReleves)) {
    ajouter({
      id: `releve-trou-${t.apres}`,
      gravite: "attention",
      domaine: "Compte courant",
      texte: `Un relevé manque probablement entre le ${t.apres} et le ${t.avant} : les soldes ne se raccordent pas.`,
      lien: { onglet: "compte" },
    });
  }

  // ── Objectifs, abonnements, contrats, thèses ─────────────────────────────
  for (const o of objectifs) {
    const cible = lireNombre(o.cible) ?? 0;
    if (o.echeance && o.echeance < aujourdhui && cible > patrimoineNet) {
      ajouter({ id: `objectif-${o.id}`, gravite: "info", domaine: "Objectifs", texte: `« ${o.libelle || "Objectif"} » : échéance passée le ${o.echeance}, sans être atteint. À repousser ou à retirer ?`, lien: { onglet: "dashboard" } });
    }
  }
  for (const s of subs) {
    if (statutDe(s) === "resilie") continue;
    if (!(lireNombre(s.montant) > 0)) {
      ajouter({ id: `abo-montant-${s.id}`, gravite: "attention", domaine: "Abonnements", texte: `${s.label || "Un abonnement"} : montant nul ou manquant.`, lien: { onglet: "abonnements" } });
    }
    if (!s.prochaine_date && !s.fin_essai) {
      ajouter({ id: `abo-date-${s.id}`, gravite: "info", domaine: "Abonnements", texte: `${s.label || "Un abonnement"} : sans date de prélèvement, il n'apparaît pas au calendrier.`, lien: { onglet: "abonnements" } });
    }
  }
  for (const c of contracts) {
    if (!c.date_fin) {
      ajouter({ id: `contrat-date-${c.id}`, gravite: "info", domaine: "Abonnements", texte: `${c.label || "Un contrat"} : sans date de fin, aucune alerte de résiliation possible.`, lien: { onglet: "abonnements", sous: "contrats" } });
    }
  }
  const detenus = new Set(positions.map((p) => String(p.ticker || "").toUpperCase()));
  for (const n of strategyNotes) {
    if (n.archivee || !n.ticker || positions.length === 0) continue;
    if (!detenus.has(String(n.ticker).toUpperCase())) {
      ajouter({ id: `these-orpheline-${n.id}`, gravite: "info", domaine: "Stratégie", texte: `Thèse active sur ${n.ticker}, qui n'est plus en portefeuille : la clôturer avec son post-mortem ?`, lien: { onglet: "strategie", sous: "theses" } });
    }
  }

  const ordre = { attention: 0, info: 1 };
  return sortie.sort((a, b) => ordre[a.gravite] - ordre[b.gravite]);
}
