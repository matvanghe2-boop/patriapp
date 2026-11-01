/**
 * Chiffrement de bout en bout des données synchronisées.
 *
 * Les valeurs envoyées à Supabase sont chiffrées DANS LE NAVIGATEUR, avec une
 * clé tirée d'une phrase secrète que seul l'utilisateur connaît. La sécurité
 * au niveau ligne de Supabase protège déjà des autres utilisateurs ; ce
 * chiffrement protège aussi de quiconque aurait accès à la base elle-même.
 *
 *  · AES-GCM 256 bits, un vecteur d'initialisation aléatoire par écriture ;
 *  · clé dérivée par PBKDF2-SHA256 (310 000 itérations) d'une phrase secrète
 *    et d'un sel aléatoire, stockés dans une ligne de configuration en clair
 *    — le sel n'est pas un secret, il empêche seulement les tables
 *    précalculées ;
 *  · une valeur témoin chiffrée dans la configuration permet de vérifier une
 *    phrase saisie sans rien déchiffrer d'autre.
 *
 * Tout passe par WebCrypto (`crypto.subtle`), disponible dans tous les
 * navigateurs récents comme dans Node : aucune bibliothèque, aucun code de
 * cryptographie écrit à la main.
 */

export const ITERATIONS_PBKDF2 = 310000;
const TEMOIN = "patrium";
const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

/** Octets → base64, par tranches : une opération étalée sur 200 Ko dépasserait la pile. */
export function versBase64(octets) {
  const vue = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let binaire = "";
  for (let i = 0; i < vue.length; i += 0x8000) {
    binaire += String.fromCharCode.apply(null, vue.subarray(i, i + 0x8000));
  }
  return btoa(binaire);
}

export function depuisBase64(texte) {
  const binaire = atob(texte);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return octets;
}

const aleatoire = (n) => crypto.getRandomValues(new Uint8Array(n));

/** Une valeur stockée est-elle chiffrée ? */
export function estChiffre(valeur) {
  return !!valeur && typeof valeur === "object" && valeur.__chiffre === 1;
}

/** Clé AES dérivée de la phrase secrète et du sel. */
export async function deriverCle(phrase, sel, iterations = ITERATIONS_PBKDF2) {
  const base = await crypto.subtle.importKey(
    "raw",
    encodeur.encode(String(phrase).normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: depuisBase64(sel), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    // Exportable : la clé est gardée sur l'appareil pour ne pas redemander la
    // phrase à chaque ouverture. Les données locales y sont de toute façon en
    // clair ; la clé n'y affaiblit donc rien.
    true,
    ["encrypt", "decrypt"]
  );
}

/** Chiffre une valeur JSON. */
export async function chiffrer(cle, valeur) {
  const iv = aleatoire(12);
  const donnees = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cle, encodeur.encode(JSON.stringify(valeur)));
  return { __chiffre: 1, iv: versBase64(iv), donnees: versBase64(donnees) };
}

/** Déchiffre une valeur ; lève une erreur si la clé n'est pas la bonne. */
export async function dechiffrer(cle, enveloppe) {
  const clair = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: depuisBase64(enveloppe.iv) },
    cle,
    depuisBase64(enveloppe.donnees)
  );
  return JSON.parse(decodeur.decode(clair));
}

/** Nouvelle configuration : sel, itérations et témoin chiffré, avec la clé correspondante. */
export async function creerConfiguration(phrase) {
  const sel = versBase64(aleatoire(16));
  const cle = await deriverCle(phrase, sel);
  return {
    cle,
    config: { version: 1, sel, iterations: ITERATIONS_PBKDF2, temoin: await chiffrer(cle, TEMOIN) },
  };
}

/**
 * Clé de la phrase si elle est la bonne, `null` sinon.
 *
 * Deux formes de configuration coexistent (voir « Version 2 » plus bas) : sans
 * enveloppe `phrase`, la clé SE DÉRIVE de la phrase, comme depuis le début ;
 * avec, la phrase ouvre l'enveloppe qui contient la clé.
 */
export async function verifierPhrase(phrase, config) {
  if (!config?.temoin || (!config.phrase && !config.sel)) return null;
  try {
    const cle = config.phrase
      ? await ouvrirEnveloppe(phrase, config.phrase)
      : await deriverCle(phrase, config.sel, config.iterations);
    return (await dechiffrer(cle, config.temoin)) === TEMOIN ? cle : null;
  } catch {
    return null;
  }
}

/** La clé correspond-elle à cette configuration ? */
export async function cleCorrespond(cle, config) {
  if (!cle || !config?.temoin) return false;
  try {
    return (await dechiffrer(cle, config.temoin)) === TEMOIN;
  } catch {
    return false;
  }
}

export async function exporterCle(cle) {
  return versBase64(await crypto.subtle.exportKey("raw", cle));
}

export async function importerCle(texte) {
  return crypto.subtle.importKey("raw", depuisBase64(texte), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

// ─── Version 2 : clé enveloppée, code de secours ────────────────────────────
//
// En version 1, la clé EST la dérivée de la phrase : oublier la phrase, c'est
// perdre la clé, et changer de phrase obligerait à tout rechiffrer.
//
// La version 2 garde exactement la même clé — rien n'est rechiffré, le témoin
// ne change pas — et la range dans des enveloppes : une ouverte par la phrase
// (`phrase`), une ouverte par le code de secours (`secours`). N'importe
// laquelle des deux rend la clé. Une configuration v1 n'a aucune enveloppe et
// reste lisible telle quelle ; elle gagne :
//
//  · `secours` à la création d'un code de secours, sans toucher à la phrase ;
//  · `phrase` au premier changement de phrase. Dès lors, l'ancienne phrase ne
//    dérive plus rien d'utile : seule l'enveloppe fait foi.
//
// Le code de secours compte 25 caractères tirés d'un alphabet de 31 (environ
// 124 bits) : comme la phrase, il passe par PBKDF2, et il est hors de portée
// d'une recherche exhaustive.

/** Sans I, L, O, 0 ni 1, qui se confondent à la lecture d'un papier. */
const ALPHABET_SECOURS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LONGUEUR_SECOURS = 25;

/** Code de secours tiré au hasard, affiché en cinq groupes : « ABCDE-FGHJK-… ». */
export function genererCodeSecours() {
  let code = "";
  // Tirage par rejet : pas de biais modulo vers les premiers caractères.
  const limite = 256 - (256 % ALPHABET_SECOURS.length);
  while (code.length < LONGUEUR_SECOURS) {
    for (const octet of aleatoire(LONGUEUR_SECOURS * 2)) {
      if (octet < limite && code.length < LONGUEUR_SECOURS) code += ALPHABET_SECOURS[octet % ALPHABET_SECOURS.length];
    }
  }
  return code.match(/.{5}/g).join("-");
}

/** Ce que tape l'utilisateur, sans tirets, espaces ni minuscules. */
export const normaliserCodeSecours = (saisie) =>
  String(saisie || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** Enveloppe la clé avec un secret (phrase ou code) : `{ sel, iterations, cle }`. */
async function envelopper(cle, secret) {
  const sel = versBase64(aleatoire(16));
  const cleDuSecret = await deriverCle(secret, sel);
  const brute = versBase64(new Uint8Array(await crypto.subtle.exportKey("raw", cle)));
  return { sel, iterations: ITERATIONS_PBKDF2, cle: await chiffrer(cleDuSecret, brute) };
}

/** Rend la clé d'une enveloppe ; lève une erreur si le secret n'est pas le bon. */
async function ouvrirEnveloppe(secret, enveloppe) {
  const cleDuSecret = await deriverCle(secret, enveloppe.sel, enveloppe.iterations);
  return importerCle(await dechiffrer(cleDuSecret, enveloppe.cle));
}

/**
 * Crée (ou remplace) le code de secours de la clé `cle`.
 * @returns {Promise<{ code: string, config: object }>} le code, à montrer UNE
 *   fois, et la configuration complétée de son enveloppe.
 */
export async function ajouterCodeSecours(cle, config) {
  const code = genererCodeSecours();
  const secours = { ...(await envelopper(cle, normaliserCodeSecours(code))), creeLe: new Date().toISOString() };
  return { code, config: { ...config, version: 2, secours } };
}

/** Clé rendue par le code de secours s'il est le bon, `null` sinon. */
export async function verifierCodeSecours(code, config) {
  if (!config?.secours || !config?.temoin) return null;
  try {
    const cle = await ouvrirEnveloppe(normaliserCodeSecours(code), config.secours);
    return (await dechiffrer(cle, config.temoin)) === TEMOIN ? cle : null;
  } catch {
    return null;
  }
}

/** Nouvelle phrase pour la même clé : seule l'enveloppe `phrase` change, aucune donnée n'est rechiffrée. */
export async function remplacerPhrase(cle, nouvellePhrase, config) {
  if (!(await cleCorrespond(cle, config))) throw new Error("Cette clé ne correspond pas à la configuration.");
  return { ...config, version: 2, phrase: await envelopper(cle, nouvellePhrase) };
}
