import { lireNombre, todayIso } from "./finance";

/**
 * Prochaines échéances — l'agrégation.
 *
 * Quatre types de dates vivent dans Patrium sans jamais se croiser : les
 * dividendes attendus, les fins d'engagement de contrat, les préavis de
 * résiliation, et les échéances d'objectifs. Chacun est visible dans son
 * onglet, mais aucun écran ne répond à « qu'est-ce qui arrive bientôt ».
 *
 * Le calcul vit ici plutôt que dans le composant parce que la règle du préavis
 * est la seule chose délicate du lot, et qu'elle mérite d'être testée sans
 * monter d'interface.
 */

const JOUR_MS = 86400000;

/** Jours pleins entre aujourd'hui et une date ISO. Négatif si elle est passée. */
export function joursAvant(iso, aujourdhui = todayIso()) {
  if (!iso) return null;
  const a = new Date(`${aujourdhui}T00:00:00`);
  const b = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / JOUR_MS);
}

/** Ajoute des jours à une date ISO, en restant sur le calendrier local. */
function decaler(iso, jours) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + jours);
  return todayIso(d);
}

/**
 * Construit la liste des échéances à venir, tous domaines confondus.
 *
 * @param {object} sources
 * @param {number} fenetreJours  Horizon retenu. Six semaines par défaut : au-delà,
 *   la liste se remplit d'événements sur lesquels on ne peut encore rien faire.
 * @returns {{id, date, jours, type, libelle, detail, urgence}[]}
 */
export function prochainesEcheances(
  { evenements = [], contracts = [], objectifs = [], patrimoineNet = 0 } = {},
  { fenetreJours = 42, aujourdhui = todayIso() } = {}
) {
  const liste = [];

  // ── Dividendes et événements de marché déjà récupérés ────────────────────
  for (const e of evenements) {
    const jours = joursAvant(e.date, aujourdhui);
    if (jours == null || jours < 0 || jours > fenetreJours) continue;
    liste.push({
      id: `ev-${e.ticker}-${e.date}-${e.type}`,
      date: e.date,
      jours,
      type: e.type === "dividende" ? "dividende" : "marche",
      libelle: e.label || `${e.name || e.ticker}`,
      detail: e.ticker,
      montant: lireNombre(e.montant),
    });
  }

  // ── Contrats : fin d'engagement ET date limite de résiliation ────────────
  for (const c of contracts) {
    if (!c?.date_fin) continue;

    /*
     * La date qui compte n'est PAS la fin du contrat : c'est le dernier jour
     * pour envoyer sa résiliation, soit la fin moins le préavis. Un contrat
     * qui se termine dans deux mois avec trois mois de préavis est déjà perdu,
     * et c'est exactement le cas qu'un rappel doit attraper.
     */
    const preavis = lireNombre(c.preavis_jours) ?? 0;
    const limite = preavis > 0 ? decaler(c.date_fin, -preavis) : c.date_fin;
    const joursLimite = joursAvant(limite, aujourdhui);

    if (joursLimite != null && joursLimite >= 0 && joursLimite <= fenetreJours) {
      liste.push({
        id: `preavis-${c.id}`,
        date: limite,
        jours: joursLimite,
        type: "preavis",
        libelle: `Préavis — ${c.label || "contrat"}`,
        detail: preavis > 0 ? `${preavis} jours avant le ${c.date_fin}` : "sans préavis",
      });
      continue;
    }

    const joursFin = joursAvant(c.date_fin, aujourdhui);
    if (joursFin != null && joursFin >= 0 && joursFin <= fenetreJours) {
      liste.push({
        id: `fin-${c.id}`,
        date: c.date_fin,
        jours: joursFin,
        type: "contrat",
        libelle: `Fin d'engagement — ${c.label || "contrat"}`,
        detail: c.category || "",
      });
    }
  }

  // ── Objectifs datés ──────────────────────────────────────────────────────
  for (const o of objectifs) {
    const jours = joursAvant(o?.echeance, aujourdhui);
    if (jours == null || jours < 0 || jours > fenetreJours) continue;
    const cible = lireNombre(o.cible) ?? 0;
    const pc = cible > 0 ? Math.min(100, (patrimoineNet / cible) * 100) : 0;
    liste.push({
      id: `obj-${o.id}`,
      date: o.echeance,
      jours,
      type: "objectif",
      libelle: `Échéance — ${o.libelle || "objectif"}`,
      detail: `${pc.toFixed(0)} % atteint`,
      // Un objectif déjà atteint n'est plus une échéance à surveiller : il ne
      // reste dans la liste que pour être fêté, pas pour inquiéter.
      atteint: pc >= 100,
    });
  }

  return liste
    .map((e) => ({
      ...e,
      // Trois crans, et le seuil bas est volontairement court : une échéance à
      // trois semaines n'appelle aucune action aujourd'hui, la signaler en
      // rouge userait le signal.
      urgence: e.atteint ? "ok" : e.jours <= 7 ? "critique" : e.jours <= 21 ? "attention" : "neutre",
    }))
    .sort((a, b) => a.jours - b.jours);
}
