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

/** Clé de la phrase si elle est la bonne, `null` sinon. */
export async function verifierPhrase(phrase, config) {
  if (!config?.sel || !config?.temoin) return null;
  try {
    const cle = await deriverCle(phrase, config.sel, config.iterations);
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
