/**
 * Journal d'erreurs, sur l'appareil seulement.
 *
 * Un écran qui casse ne laissait aucune trace : l'erreur passait dans la
 * console, que personne n'ouvre sur un téléphone, et disparaissait au
 * rechargement. Ce journal garde les dernières erreurs — message, pile
 * d'appels tronquée, onglet ouvert — pour qu'elles puissent être copiées et
 * transmises à la main.
 *
 * Volontairement HORS de la synchronisation et des sauvegardes : ce sont des
 * informations de diagnostic propres à un appareil, pas des données
 * patrimoniales. Rien n'est envoyé nulle part.
 */

const CLE = "patrium:journalErreurs";
const MAX_ENTREES = 50;
const MAX_PILE = 1500;

export function lireJournal() {
  try {
    const brut = localStorage.getItem(CLE);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

const abonnes = new Set();
export function abonnerJournal(fonction) {
  abonnes.add(fonction);
  return () => abonnes.delete(fonction);
}

/**
 * Consigne une erreur. Deux erreurs identiques à la suite (une boucle de
 * rendu) ne font qu'une entrée, avec un compteur.
 */
export function consignerErreur(erreur, { source = "application", contexte = null } = {}) {
  try {
    const message = String(erreur?.message || erreur || "Erreur inconnue").slice(0, 500);
    const pile = String(erreur?.stack || "").slice(0, MAX_PILE);
    const onglet = typeof window !== "undefined" ? window.location.hash || "#/" : null;
    const liste = lireJournal();
    const derniere = liste[liste.length - 1];
    if (derniere && derniere.message === message && derniere.source === source) {
      derniere.occurrences = (derniere.occurrences || 1) + 1;
      derniere.date = new Date().toISOString();
    } else {
      liste.push({ date: new Date().toISOString(), source, message, pile, onglet, contexte: contexte ? String(contexte).slice(0, 500) : null, occurrences: 1 });
    }
    localStorage.setItem(CLE, JSON.stringify(liste.slice(-MAX_ENTREES)));
    abonnes.forEach((f) => f());
  } catch {
    // Le journal ne doit jamais devenir lui-même une source d'erreur.
  }
}

export function viderJournal() {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* ignore */
  }
  abonnes.forEach((f) => f());
}

/** Rapport en texte brut, prêt à coller dans un message. */
export function rapportTexte(liste = lireJournal(), { navigateur = typeof navigator !== "undefined" ? navigator.userAgent : "" } = {}) {
  const lignes = [`Patrium — journal d'erreurs (${liste.length})`, `Navigateur : ${navigateur}`, ""];
  for (const e of liste) {
    lignes.push(`[${e.date}] ${e.source}${e.occurrences > 1 ? ` ×${e.occurrences}` : ""} — ${e.onglet || ""}`);
    lignes.push(e.message);
    if (e.contexte) lignes.push(`Contexte : ${e.contexte}`);
    if (e.pile) lignes.push(e.pile.split("\n").slice(0, 6).join("\n"));
    lignes.push("");
  }
  return lignes.join("\n");
}

/** Branche les erreurs non rattrapées du navigateur sur le journal. */
export function installerJournal() {
  if (typeof window === "undefined") return () => {};
  const surErreur = (e) => consignerErreur(e.error || e.message, { source: "erreur" });
  const surRejet = (e) => consignerErreur(e.reason, { source: "promesse" });
  window.addEventListener("error", surErreur);
  window.addEventListener("unhandledrejection", surRejet);
  return () => {
    window.removeEventListener("error", surErreur);
    window.removeEventListener("unhandledrejection", surRejet);
  };
}
