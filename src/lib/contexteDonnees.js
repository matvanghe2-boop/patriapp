import { valeurPosition, coutPosition, lireNombre, eur } from "./finance";
import { moisDe, categorie } from "./compteCourant";
import { mensualiser, statutDe } from "./abonnements";
import { STATUTS_THESE } from "./theses";
import { auditerContexte } from "../../shared/anonymiser";

/**
 * Contexte de l'assistant « Poser une question à mes données ».
 *
 * Construit côté client, champ par champ (liste blanche, comme
 * `anonymiser.js`), puis audité avant tout envoi. Deux protections :
 *
 *  · AUCUN NOM ne part : lignes, abonnements et objectifs deviennent des alias
 *    (« ligne_1 », « abonnement_2 »). La table de correspondance reste dans le
 *    navigateur, qui remet les vrais noms dans la réponse ;
 *  · en mode A (par défaut), AUCUN EURO ne part : chaque montant est exprimé en
 *    points, 100 points valant la référence (`base`). Le navigateur reconvertit
 *    les points de la réponse en euros. Le mode B — montants réels — reste
 *    celui choisi dans Simulation › Projet, et n'est jamais activé ici.
 */

const arrondir = (n, d = 3) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : 0);

/**
 * @returns {{contexte, facteur, alias: Object<string,string>, audit}}
 *   `facteur` : euros par point (1 en mode B).
 */
export function construireContexteDonnees(etat = {}, { montantsReels = false, nbMois = 12 } = {}) {
  const {
    patrimoineNet = 0, livretsTotal = 0, bourseTotal = 0, cash = 0, dettesTotal = 0,
    profile = {}, tauxEpargne = null, matelasMois = null,
    compteEnrichies = [], bourse = {}, subs = [], strategyNotes = [], objectifs = [],
  } = etat;

  const revenusAnnuels = (lireNombre(profile?.monthly_income) ?? 0) * 12;
  // La référence doit rester grande devant les montants transmis : sinon un
  // patrimoine encore petit ferait dépasser les 1 000 points à des flux
  // annuels, et l'audit refuserait la requête.
  const reference = Math.max(patrimoineNet, revenusAnnuels, 1);
  const facteur = montantsReels ? 1 : reference / 100;
  const pts = (euros) => arrondir((Number(euros) || 0) / facteur, montantsReels ? 2 : 3);
  const alias = {};

  // ── Patrimoine ───────────────────────────────────────────────────────────
  const patrimoine = {
    net: pts(patrimoineNet),
    livrets: pts(livretsTotal),
    bourse: pts(bourseTotal),
    compteCourant: pts(cash),
    dettes: pts(dettesTotal),
  };

  // ── Budget ───────────────────────────────────────────────────────────────
  const budget = {
    revenusMensuels: pts(profile?.monthly_income),
    depensesMensuelles: pts(profile?.monthly_expenses),
    tauxEpargnePct: Number.isFinite(tauxEpargne) ? arrondir(tauxEpargne, 1) : null,
    // Plafonné : des dépenses quasi nulles donneraient un matelas de plusieurs
    // milliers de mois, que l'audit prendrait pour un montant.
    matelasMois: Number.isFinite(matelasMois) ? Math.min(arrondir(matelasMois, 1), 999) : null,
  };

  // ── Compte courant : par mois et par catégorie ───────────────────────────
  const mois = [...new Set((compteEnrichies || []).map((o) => moisDe(o.date)))].sort().slice(-nbMois);
  const parMois = {};
  for (const m of mois) parMois[m] = { depenses: {}, revenus: {}, totalDepenses: 0, totalRevenus: 0 };
  for (const op of compteEnrichies || []) {
    const m = moisDe(op.date);
    if (!parMois[m] || op.famille === "interne" || op.horsBudget) continue;
    const libelle = categorie(op.categorie).libelle;
    const euros = op.montant / 100;
    const cible = op.montant < 0 ? parMois[m].depenses : parMois[m].revenus;
    cible[libelle] = (cible[libelle] || 0) + Math.abs(euros);
  }
  for (const m of mois) {
    const p = parMois[m];
    p.totalDepenses = pts(Object.values(p.depenses).reduce((s, v) => s + v, 0));
    p.totalRevenus = pts(Object.values(p.revenus).reduce((s, v) => s + v, 0));
    for (const cle of Object.keys(p.depenses)) p.depenses[cle] = pts(p.depenses[cle]);
    for (const cle of Object.keys(p.revenus)) p.revenus[cle] = pts(p.revenus[cle]);
  }

  // ── Portefeuille ─────────────────────────────────────────────────────────
  const positions = (bourse?.positions || []).filter((p) => Number(p.quantity) > 0);
  const valeurTotale = positions.reduce((s, p) => s + valeurPosition(p), 0);
  const dividendesRecus = new Map();
  for (const op of bourse?.operations || []) {
    if (op?.type !== "DIVIDENDE") continue;
    const t = String(op.asset || "").toUpperCase();
    dividendesRecus.set(t, (dividendesRecus.get(t) || 0) + Math.abs(lireNombre(op.amount ?? op.montantNet) ?? 0));
  }
  const portefeuille = positions.map((p, i) => {
    const a = `ligne_${i + 1}`;
    alias[a] = p.name && p.name !== p.ticker ? `${p.ticker} (${p.name})` : p.ticker;
    const valeur = valeurPosition(p);
    const cout = coutPosition(p);
    return {
      alias: a,
      type: p.type || "Action",
      valeur: pts(valeur),
      poidsPct: valeurTotale > 0 ? arrondir((valeur / valeurTotale) * 100, 1) : 0,
      plusValuePct: cout > 0 ? arrondir(((valeur - cout) / cout) * 100, 1) : null,
      dividendeAnnuelEstime: pts((lireNombre(p.annual_dividend) ?? 0) * (Number(p.quantity) || 0) * (p.fxRate || 1)),
      dividendesRecus: pts(dividendesRecus.get(String(p.ticker).toUpperCase()) || 0),
    };
  });

  // ── Abonnements ──────────────────────────────────────────────────────────
  const abonnements = (subs || []).map((s, i) => {
    const a = `abonnement_${i + 1}`;
    alias[a] = s.label || "Abonnement";
    return { alias: a, categorie: s.category || "Autre", statut: statutDe(s), coutMensuel: pts(mensualiser(s)), usage: s.usage || null };
  });

  // ── Thèses et objectifs ──────────────────────────────────────────────────
  const actives = (strategyNotes || []).filter((n) => !n.archivee);
  const theses = {
    actives: actives.length,
    cloturees: (strategyNotes || []).length - actives.length,
    parStatut: Object.fromEntries(Object.entries(STATUTS_THESE).map(([k, s]) => [s.libelle, actives.filter((n) => n.statut === k).length])),
  };
  const listeObjectifs = (objectifs || []).map((o, i) => {
    const a = `objectif_${i + 1}`;
    alias[a] = o.libelle || "Objectif";
    const cible = lireNombre(o.cible) ?? 0;
    return { alias: a, cible: pts(cible), echeance: o.echeance || null, progressionPct: cible > 0 ? arrondir((patrimoineNet / cible) * 100, 1) : null };
  });

  const contexte = {
    base: montantsReels
      ? "montants en euros réels"
      : `100 points = ${patrimoineNet >= revenusAnnuels && patrimoineNet > 1 ? "le patrimoine net" : "les revenus annuels"}`,
    patrimoine,
    budget,
    compteCourant: { mois, parMois },
    portefeuille,
    abonnements,
    theses,
    objectifs: listeObjectifs,
  };

  return { contexte, facteur, alias, audit: auditerContexte(contexte, { autoriserMontants: montantsReels }) };
}

/**
 * Rend la réponse du modèle lisible : alias remplacés par les vrais noms, et
 * en mode A, chaque « N points » suivi de son équivalent en euros.
 */
export function rendreReponse(texte, { alias = {}, facteur = 1, montantsReels = false } = {}) {
  let sortie = String(texte || "");
  // Les alias les plus longs d'abord : « ligne_12 » avant « ligne_1 ».
  for (const a of Object.keys(alias).sort((x, y) => y.length - x.length)) {
    sortie = sortie.split(a).join(alias[a]);
  }
  if (!montantsReels) {
    sortie = sortie.replace(/(-?\d+(?:[\s\u202f]\d{3})*(?:[.,]\d+)?)\s*points?\b/gi, (tout, nombre) => {
      const valeur = Number(nombre.replace(/[\s\u202f]/g, "").replace(",", "."));
      if (!Number.isFinite(valeur)) return tout;
      return `${eur(valeur * facteur, Math.abs(valeur * facteur) < 100 ? 2 : 0)}`;
    });
  }
  return sortie;
}
