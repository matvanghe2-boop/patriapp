import { deriverCle, versBase64, depuisBase64, ITERATIONS_PBKDF2 } from "./chiffrement";

/**
 * Transfert vers un nouvel appareil, sans compte ni serveur : l'appareil qui
 * envoie affiche ses données en une suite de QR codes qui défile, l'autre la
 * filme avec sa caméra.
 *
 *  · les données (le même contenu que l'export JSON) sont compressées, puis
 *    chiffrées en AES-GCM avec une clé dérivée d'un code à usage unique ;
 *  · ce code s'affiche à côté des QR codes mais n'est jamais dedans : il se
 *    tape sur l'appareil qui reçoit. Une photo des QR codes seuls ne livre
 *    donc rien ;
 *  · le paquet chiffré est découpé en morceaux numérotés qui défilent en
 *    boucle : un morceau manqué repasse au tour suivant.
 */

export const PREFIXE = "PTR1";
/** Caractères du paquet par QR code : un QR lisible par une caméra de téléphone sur un écran. */
export const TAILLE_MORCEAU = 500;
/** Sans I, L, O, 0 ni 1, qui se confondent à la lecture. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LONGUEUR_CODE = 10;
const VERSION = 1;
const METHODES = { brut: 0, gzip: 1 };

/** Code à usage unique, tiré au hasard (environ 49 bits), affiché « XXXXX-XXXXX ». */
export function genererCode() {
  let code = "";
  // Tirage par rejet : pas de biais modulo vers les premiers caractères.
  const limite = 256 - (256 % ALPHABET.length);
  while (code.length < LONGUEUR_CODE) {
    for (const octet of crypto.getRandomValues(new Uint8Array(LONGUEUR_CODE * 2))) {
      if (octet < limite && code.length < LONGUEUR_CODE) code += ALPHABET[octet % ALPHABET.length];
    }
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Ce que tape l'utilisateur, sans tirets, espaces ni minuscules. */
export const normaliserCode = (saisie) => String(saisie || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Compresse ou décompresse en gzip (CompressionStream / DecompressionStream). */
async function transformer(octets, Flux) {
  const flux = new Flux("gzip");
  const ecrivain = flux.writable.getWriter();
  // Écrire sans attendre : le flux ne se vide que pendant la lecture.
  ecrivain.write(octets).catch(() => {});
  ecrivain.close().catch(() => {});
  const lecteur = flux.readable.getReader();
  const morceaux = [];
  let taille = 0;
  for (;;) {
    const { value, done } = await lecteur.read();
    if (done) break;
    morceaux.push(value);
    taille += value.length;
  }
  const sortie = new Uint8Array(taille);
  let position = 0;
  for (const m of morceaux) {
    sortie.set(m, position);
    position += m.length;
  }
  return sortie;
}

/**
 * Données → paquet chiffré en base64 : [version, méthode, sel (16), iv (12), chiffré].
 */
export async function emballer(donnees, code) {
  let octets = new TextEncoder().encode(JSON.stringify(donnees));
  let methode = METHODES.brut;
  if (typeof CompressionStream === "function") {
    octets = await transformer(octets, CompressionStream);
    methode = METHODES.gzip;
  }
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cle = await deriverCle(normaliserCode(code), versBase64(sel), ITERATIONS_PBKDF2);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cle, octets));
  const paquet = new Uint8Array(2 + 16 + 12 + chiffre.length);
  paquet.set([VERSION, methode], 0);
  paquet.set(sel, 2);
  paquet.set(iv, 18);
  paquet.set(chiffre, 30);
  return versBase64(paquet);
}

/** Paquet → données ; lève `CodeIncorrect` si le code ne correspond pas. */
export async function deballer(paquetBase64, code) {
  const paquet = depuisBase64(paquetBase64);
  if (paquet[0] !== VERSION) throw new Error("Version de transfert inconnue");
  const methode = paquet[1];
  const cle = await deriverCle(normaliserCode(code), versBase64(paquet.slice(2, 18)), ITERATIONS_PBKDF2);
  let octets;
  try {
    octets = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: paquet.slice(18, 30) }, cle, paquet.slice(30)));
  } catch {
    const erreur = new Error("Code incorrect");
    erreur.name = "CodeIncorrect";
    throw erreur;
  }
  if (methode === METHODES.gzip) {
    if (typeof DecompressionStream !== "function") throw new Error("Ce navigateur ne sait pas décompresser le transfert");
    octets = await transformer(octets, DecompressionStream);
  }
  return JSON.parse(new TextDecoder().decode(octets));
}

/** Identifiant de session : distingue deux transferts lancés l'un après l'autre. */
export const idSession = () => versBase64(crypto.getRandomValues(new Uint8Array(3))).replace(/[+/=]/g, "x");

/** Découpe le paquet en textes de QR codes : « PTR1|id|index|total|morceau ». */
export function decouper(paquet, { id = idSession(), taille = TAILLE_MORCEAU } = {}) {
  const total = Math.max(1, Math.ceil(paquet.length / taille));
  return Array.from({ length: total }, (_, i) => `${PREFIXE}|${id}|${i}|${total}|${paquet.slice(i * taille, (i + 1) * taille)}`);
}

/** Lit le texte d'un QR code ; null si ce n'est pas un morceau de transfert Patrium. */
export function lireMorceau(texte) {
  const parties = String(texte || "").split("|");
  if (parties.length !== 5 || parties[0] !== PREFIXE) return null;
  const [, id, i, n, morceau] = parties;
  const index = Number(i);
  const total = Number(n);
  if (!id || !Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 0 || index >= total) return null;
  return { id, index, total, morceau };
}

/**
 * Réception : accumule les morceaux lus, dans n'importe quel ordre. Un morceau
 * d'un autre transfert (autre identifiant) redémarre la collecte.
 */
export function creerReception() {
  let id = null;
  let total = 0;
  let morceaux = new Map();
  return {
    ajouter(texte) {
      const m = lireMorceau(texte);
      if (!m) return { valide: false, nouveau: false, recus: morceaux.size, total, complet: false };
      if (m.id !== id) {
        id = m.id;
        total = m.total;
        morceaux = new Map();
      }
      const nouveau = !morceaux.has(m.index);
      morceaux.set(m.index, m.morceau);
      return { valide: true, nouveau, recus: morceaux.size, total, complet: morceaux.size === total };
    },
    assembler() {
      if (!total || morceaux.size !== total) return null;
      return Array.from({ length: total }, (_, i) => morceaux.get(i)).join("");
    },
  };
}
