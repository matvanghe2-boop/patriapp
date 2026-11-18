/**
 * Sons discrets — coupés par défaut.
 *
 * Aucun fichier : les sons sont SYNTHÉTISÉS à la demande par l'API Web
 * Audio, ce qui ne pèse rien dans le paquet et rien sur le réseau.
 *
 *  · « piece »  — le tintement d'une pièce, sur un dividende encaissé.
 *
 * TROIS GARDE-FOUS, les mêmes que pour le retour tactile (haptique.js) :
 *
 *  · Le réglage est lu À L'APPEL sur `<html data-sons>` (posé par
 *    ApparenceContext), pas capturé à l'import : il se coupe en cours de
 *    session. Sans l'attribut — premier rendu, tests — c'est le silence.
 *  · On teste la CAPACITÉ, pas la plateforme : sans Web Audio, rien ne se
 *    passe, sans erreur.
 *  · Un navigateur refuse de jouer avant un premier geste de l'utilisateur.
 *    Un son refusé n'est jamais une raison d'interrompre quoi que ce soit.
 */

let contexte = null;
/** Dernier départ de chaque son, pour ne pas le doubler. */
const derniers = new Map();
const ECART_MIN_MS = 250;

/** Les sons sont-ils demandés ? */
export function sonsActifs() {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-sons") === "oui";
}

function obtenirContexte() {
  if (typeof window === "undefined") return null;
  const Classe = window.AudioContext || window.webkitAudioContext;
  if (!Classe) return null;
  if (!contexte) contexte = new Classe();
  return contexte;
}

/** Une note qui s'éteint : attaque franche, décroissance exponentielle. */
function note(ctx, sortie, { frequence, debut, duree, volume, forme = "sine", glisseVers = null }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = forme;
  osc.frequency.setValueAtTime(frequence, debut);
  if (glisseVers) osc.frequency.exponentialRampToValueAtTime(glisseVers, debut + duree);
  gain.gain.setValueAtTime(0.0001, debut);
  gain.gain.exponentialRampToValueAtTime(volume, debut + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  osc.connect(gain).connect(sortie);
  osc.start(debut);
  osc.stop(debut + duree + 0.02);
}

const PARTITIONS = {
  // Deux partiels aigus, le second une quinte au-dessus et un souffle plus
  // tard : c'est l'écart entre les deux qui fait « pièce » plutôt que « bip ».
  piece(ctx, sortie, t) {
    note(ctx, sortie, { frequence: 1318.5, debut: t, duree: 0.34, volume: 0.05, forme: "triangle" });
    note(ctx, sortie, { frequence: 1975.5, debut: t + 0.07, duree: 0.5, volume: 0.045 });
    note(ctx, sortie, { frequence: 3951, debut: t + 0.07, duree: 0.22, volume: 0.012 });
  },
};

/**
 * Joue un son, si le réglage le permet.
 *
 * @param {"piece"} nom
 * @param {{ force?: boolean }} [options]  `force` : pour l'aperçu donné au
 *        moment où l'on active le réglage, avant que l'attribut soit posé.
 * @returns {boolean} `true` si le son est parti.
 */
export function jouerSon(nom, { force = false } = {}) {
  if (!force && !sonsActifs()) return false;
  const partition = PARTITIONS[nom];
  if (!partition) return false;
  // Deux appels coup sur coup (effet rejoué en mode strict, deux dividendes
  // importés ensemble) ne font qu'un son.
  const maintenant = Date.now();
  if (maintenant - (derniers.get(nom) ?? -Infinity) < ECART_MIN_MS) return false;
  derniers.set(nom, maintenant);
  try {
    const ctx = obtenirContexte();
    if (!ctx) return false;
    if (ctx.state === "suspended") ctx.resume?.().catch?.(() => {});
    partition(ctx, ctx.destination, ctx.currentTime + 0.02);
    return true;
  } catch {
    return false;
  }
}
