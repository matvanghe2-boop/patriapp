import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { supabase, isSupabaseConfigured, supabaseConfig } from "./supabaseClient";
import { migrer, VERSION_DONNEES } from "./migrations";
import {
  subscribeSync,
  getSyncState,
  markSyncEnabled,
  markPending,
  markSynced,
  markFailed,
} from "./syncStatus";
import {
  chiffrer,
  dechiffrer,
  estChiffre,
  creerConfiguration,
  verifierPhrase,
  cleCorrespond,
  exporterCle,
  importerCle,
} from "./chiffrement";

const PREFIX = "patrimoine:";
const META_PREFIX = "patrimoine:__meta:";
const TABLE = "kv_store";
const DEBOUNCE_MS = 800;
const MAX_PUSH_ATTEMPTS = 4;

// ─── Bac à sable « et si » ───────────────────────────────────────────────────
/**
 * Mode bac à sable : l'application continue de fonctionner normalement, mais
 * plus RIEN n'est écrit — ni dans le localStorage, ni dans le cloud — et le
 * cloud n'est plus relu. Les modifications vivent en mémoire (`valeursBac`),
 * pour que deux écrans qui lisent la même clé voient la même version d'essai.
 *
 * On en sort en rechargeant la page : la mémoire repart de zéro, les vraies
 * données sont relues telles qu'elles étaient. Il n'y a donc rien à « annuler »,
 * et aucune façon d'enregistrer par accident une donnée d'essai.
 */
let bacASable = false;
const valeursBac = new Map();
const abonnesBac = new Set();

export function entrerBacASable() {
  bacASable = true;
  abonnesBac.forEach((f) => f());
}
export const estBacASable = () => bacASable;
export function abonnerBacASable(fonction) {
  abonnesBac.add(fonction);
  return () => abonnesBac.delete(fonction);
}

// Toute valeur qui entre dans l'application passe par `migrer` : lecture
// locale, réception du cloud, restauration d'une sauvegarde (voir migrations.js).
function readLocal(key, initialValue) {
  if (bacASable && valeursBac.has(key)) return valeursBac.get(key);
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? migrer(key, JSON.parse(raw)) : initialValue;
  } catch {
    return initialValue;
  }
}

function writeLocal(key, value, updatedAt) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    if (updatedAt) localStorage.setItem(META_PREFIX + key, updatedAt);
  } catch (e) {
    console.warn("Sauvegarde locale impossible :", e);
  }
}

/**
 * Horodatage de la dernière modification locale d'une clé. C'est lui qui
 * arbitre le conflit cloud/local : sans cet horodatage, l'ancienne version
 * adoptait systématiquement la valeur cloud au montage, écrasant au passage
 * une modification faite localement entre-temps.
 */
function readLocalUpdatedAt(key) {
  try {
    return localStorage.getItem(META_PREFIX + key);
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Chiffrement de bout en bout (optionnel) ─────────────────────────────────
//
// Quand il est actif, chaque valeur part vers Supabase chiffrée par
// `chiffrement.js`, et revient déchiffrée avant d'être lue. Le localStorage,
// lui, reste en clair : c'est la copie de travail de cet appareil.
//
// La configuration (sel, témoin) est une ligne `__chiffrement` de la même
// table, en clair. La clé dérivée de la phrase secrète est gardée sur
// l'appareil (`__cleChiffrement`) pour ne pas redemander la phrase à chaque
// ouverture. Un appareil qui ne l'a pas est VERROUILLÉ : il ne lit pas les
// lignes chiffrées et, surtout, n'écrit rien — une valeur en clair poussée
// par-dessus une valeur chiffrée l'exposerait et l'écraserait.

const CLE_CONFIG_CHIFFREMENT = "__chiffrement";
const CLE_LOCALE_CHIFFREMENT = "patrimoine:__cleChiffrement";

let chiffrement = { config: null, cle: null, operationEnCours: false };
const abonnesChiffrement = new Set();
let etatChiffrement = { actif: false, verrouille: false };

function notifierChiffrement() {
  etatChiffrement = { actif: !!chiffrement.config, verrouille: !!chiffrement.config && !chiffrement.cle };
  abonnesChiffrement.forEach((f) => f());
}

function oublierCleLocale() {
  chiffrement.cle = null;
  try {
    localStorage.removeItem(CLE_LOCALE_CHIFFREMENT);
  } catch {
    /* stockage indisponible */
  }
}

async function garderCleLocale(cle) {
  chiffrement.cle = cle;
  try {
    localStorage.setItem(CLE_LOCALE_CHIFFREMENT, await exporterCle(cle));
  } catch {
    /* sans stockage, la phrase sera redemandée à la prochaine ouverture */
  }
}

function chargerCleLocale() {
  return (async () => {
    try {
      const texte = typeof localStorage !== "undefined" ? localStorage.getItem(CLE_LOCALE_CHIFFREMENT) : null;
      if (texte) chiffrement.cle = await importerCle(texte);
    } catch {
      chiffrement.cle = null;
    }
  })();
}
let cleChargee = chargerCleLocale();

/**
 * Adopte la configuration lue dans le cloud. Une configuration disparue
 * (désactivée depuis un autre appareil) fait oublier la clé ; une clé qui ne
 * lui correspond pas (autre phrase) aussi. Pendant une activation ou une
 * désactivation en cours sur CET appareil, le cloud est momentanément
 * incohérent : on ne l'écoute pas.
 */
async function adopterConfig(config) {
  await cleChargee;
  if (chiffrement.operationEnCours) return;
  chiffrement.config = config || null;
  if (!chiffrement.config) {
    if (chiffrement.cle) oublierCleLocale();
  } else if (chiffrement.cle && !(await cleCorrespond(chiffrement.cle, chiffrement.config))) {
    oublierCleLocale();
  }
  notifierChiffrement();
}

/** Lignes lisibles par cet appareil : déchiffrées si besoin, écartées s'il est verrouillé. */
async function lignesLisibles(data) {
  const lignes = [];
  for (const row of data || []) {
    if (row.key === CLE_CONFIG_CHIFFREMENT) continue;
    if (!estChiffre(row.value)) {
      lignes.push(row);
      continue;
    }
    if (!chiffrement.cle) continue;
    try {
      lignes.push({ ...row, value: await dechiffrer(chiffrement.cle, row.value) });
    } catch {
      /* chiffrée avec une autre clé : illisible ici */
    }
  }
  return lignes;
}

/**
 * Prépare dès maintenant la version chiffrée de la dernière valeur d'une clé.
 * L'écriture d'urgence de `pagehide` est synchrone et ne peut pas attendre
 * WebCrypto : elle envoie cette version si elle est prête, rien sinon — la clé
 * reste alors marquée et repart à la prochaine ouverture.
 */
function preChiffrer(key) {
  const entry = latestValues.get(key);
  if (!entry || !chiffrement.cle) return;
  const { value, updatedAt } = entry;
  chiffrer(chiffrement.cle, value)
    .then((chiffre) => {
      const courant = latestValues.get(key);
      if (courant && courant.updatedAt === updatedAt) {
        courant.chiffre = chiffre;
        courant.chiffreDe = updatedAt;
      }
    })
    .catch(() => {});
}

/**
 * Écriture cloud avec réessais à délai croissant. Un échec réseau ponctuel
 * (perte de wifi, 503 momentané) ne doit pas se solder par une donnée
 * définitivement absente d'un des appareils ; et un échec durable doit être
 * visible dans l'interface plutôt que noyé dans la console.
 */
async function pushToCloud(key, value, userId, updatedAt) {
  // La configuration de chiffrement doit être connue avant toute écriture :
  // un appareil qui l'ignorerait pousserait en clair.
  await cleChargee;
  await hydraterDepuisCloud();
  if (chiffrement.config && !chiffrement.cle) {
    dirtyKeys.delete(key);
    return false;
  }
  markPending(key);
  let lastError = null;
  for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(2 ** attempt * 400);
    try {
      const valeurCloud = chiffrement.cle ? await chiffrer(chiffrement.cle, value) : value;
      const { error } = await supabase.from(TABLE).upsert({
        id: `${userId}:${key}`,
        user_id: userId,
        key,
        value: valeurCloud,
        updated_at: updatedAt,
      });
      if (error) throw error;
      dirtyKeys.delete(key);
      markSynced(key);
      return true;
    } catch (e) {
      lastError = e;
      // Hors ligne : inutile de brûler les tentatives, le retour en ligne
      // relancera la synchronisation (voir l'écouteur "online" plus bas).
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
    }
  }
  console.warn(`Synchronisation cloud impossible pour "${key}" :`, lastError);
  markFailed(key, lastError);
  return false;
}

// Dernière valeur connue de chaque clé, pour pouvoir tout re-pousser au retour
// en ligne sans dépendre du cycle de vie des composants.
const latestValues = new Map();

// Clés modifiées dont l'écriture cloud n'est pas encore confirmée. C'est ce
// sous-ensemble — presque toujours une seule clé — qu'on tente de sauver à la
// fermeture de la page, et non l'intégralité du patrimoine : une requête
// `keepalive` est plafonnée à 64 Ko de corps par la spécification.
const dirtyKeys = new Set();

/**
 * Abonnés de chaque clé montée, pour pouvoir leur appliquer une valeur plus
 * récente sans remonter le composant (voir `pullAllFromCloud` — c'est ce qui
 * permet à la PWA du téléphone de se mettre à jour sans fermer/rouvrir l'app).
 *
 * UN ENSEMBLE D'ABONNÉS PAR CLÉ, et non un seul `setState`.
 *
 * Une clé peut être lue par plusieurs composants à la fois. C'est le cas de
 * `watchlistDailyData`, consommée par `useAlertesWatchlist` — monté en
 * permanence dans App.jsx — et par `Watchlist.jsx`, monté seulement quand
 * l'onglet Bourse est ouvert. Avec un seul setter par clé, le second montage
 * écrasait silencieusement le premier, ce qui produisait deux défauts :
 *
 *  1. Watchlist rafraîchissait les cours, les écrivait en local et en cloud,
 *     mais la copie de `useAlertesWatchlist` ne bougeait pas : les alertes de
 *     seuil continuaient d'être évaluées sur les cours du démarrage de l'app.
 *     La fonctionnalité d'alerte était donc neutralisée par sa propre source.
 *  2. En quittant l'onglet, le démontage de Watchlist supprimait l'entrée de
 *     la Map alors que le hook d'App était toujours monté : la clé sortait
 *     aussi de `pullAllFromCloud`, qui construit sa liste à partir d'elle.
 *
 * Chaque abonné porte son propre `skipNextPush` : une valeur REÇUE (du cloud
 * ou d'un autre composant) ne doit pas être ré-horodatée, sans quoi elle
 * repartirait vers le cloud comme une modification de cet appareil.
 */
const activeSetters = new Map();

/**
 * Applique une valeur à tous les abonnés d'une clé, sauf à son émetteur.
 *
 * L'abonné dont l'état est DÉJÀ cette valeur est ignoré, et c'est nécessaire :
 * React abandonne un `setState` qui ne change rien (`Object.is`), le composant
 * ne rend pas, son effet de persistance ne s'exécute pas — et le témoin
 * `skipNextPush` qu'on vient d'armer resterait armé. Il ferait alors sauter la
 * sauvegarde de la PROCHAINE modification réelle, celle-là bien voulue.
 */
function diffuser(key, valeur, emetteur = null) {
  const abonnes = activeSetters.get(key);
  if (!abonnes) return;
  for (const abonne of abonnes) {
    if (abonne === emetteur || Object.is(abonne.valeur, valeur)) continue;
    abonne.skipNextPush.current = true;
    abonne.setState(valeur);
  }
}

/**
 * Identité courante, tenue à jour par l'abonnement d'authentification plutôt
 * que redemandée avant chaque lecture et chaque écriture.
 *
 * L'ancienne version appelait `supabase.auth.getUser()`, qui est une requête
 * RÉSEAU de validation du jeton. Avec une trentaine de clés persistées montées
 * dans le même rendu, le seul démarrage de l'application en déclenchait autant
 * — auxquelles s'ajoutait une lecture cloud par clé.
 *
 * `getSession()` lit la session déjà persistée localement par le SDK, sans
 * réseau. Le jeton d'accès est conservé ici parce que `flushAllToCloud` en a
 * besoin de façon SYNCHRONE : sur `pagehide`, plus aucune promesse n'a le
 * temps de se résoudre.
 */
let session = { userId: null, accessToken: null };

function appliquerSession(s) {
  session = { userId: s?.user?.id ?? null, accessToken: s?.access_token ?? null };
}

async function currentUserId() {
  if (!isSupabaseConfigured) return null;
  if (session.userId) return session.userId;
  const { data } = await supabase.auth.getSession();
  appliquerSession(data?.session);
  return session.userId;
}

/**
 * Lecture cloud MUTUALISÉE de toutes les clés de l'utilisateur, en une requête.
 *
 * Chaque `usePersistentState` interrogeait Supabase pour sa propre clé
 * (`eq(id).maybeSingle()`). C'est exactement le problème déjà corrigé pour le
 * polling — voir `pullAllFromCloud` — mais jamais pour le montage, qui est
 * pourtant le moment où toutes les clés arrivent d'un coup.
 *
 * La promesse est partagée : le premier hook qui se monte déclenche la
 * requête, tous les autres attendent le même résultat.
 */
let hydratationCloud = null;

function hydraterDepuisCloud() {
  if (hydratationCloud) return hydratationCloud;
  hydratationCloud = (async () => {
    const userId = await currentUserId();
    if (!userId) return new Map();
    const { data, error } = await supabase
      .from(TABLE)
      .select("key, value, updated_at")
      .eq("user_id", userId);
    if (error || !data) {
      // Un échec ne doit pas être mis en cache : sans cette remise à zéro, une
      // coupure réseau au démarrage ferait croire à toutes les clés que le
      // cloud est vide, et leur ferait pousser l'état local par-dessus.
      hydratationCloud = null;
      return new Map();
    }
    await adopterConfig(data.find((row) => row.key === CLE_CONFIG_CHIFFREMENT)?.value);
    return new Map((await lignesLisibles(data)).map((row) => [row.key, row]));
  })();
  return hydratationCloud;
}

/**
 * Applique une ligne cloud localement si elle est plus récente que ce qu'on a
 * déjà (même arbitrage updated_at que dans l'effet de montage de
 * usePersistentState).
 */
function applyCloudRow(key, row) {
  if (bacASable) return;
  const localUpdatedAt = readLocalUpdatedAt(key);
  if (localUpdatedAt && row.updated_at && row.updated_at <= localUpdatedAt) return;

  const valeur = migrer(key, row.value);
  writeLocal(key, valeur, row.updated_at);
  latestValues.set(key, { value: valeur, updatedAt: row.updated_at });
  // La valeur locale vient d'être remplacée par celle du cloud : il n'y a plus
  // rien à y repousser, et la laisser marquée « à écrire » ferait renvoyer au
  // serveur ce qu'on vient d'en recevoir.
  dirtyKeys.delete(key);
  // Tous les abonnés, et chacun avec son `skipNextPush` armé : l'ancienne
  // version appelait le setter sans ce témoin, si bien qu'une valeur reçue du
  // cloud était aussitôt ré-horodatée « maintenant » par l'effet de
  // persistance et repoussée vers le serveur comme une modification locale.
  diffuser(key, valeur);
  markSynced(key);
}

/**
 * Revérifie le cloud pour toutes les clés actuellement affichées. Déclenché
 * quand l'onglet/l'app revient au premier plan et à intervalles réguliers tant
 * qu'elle est visible — sans abonnement temps réel, juste de simples lectures
 * périodiques, pour que deux appareils connectés au même compte finissent
 * toujours par converger sans action manuelle.
 *
 * Une SEULE requête couvre toutes les clés (`in (…)`). L'ancienne version
 * bouclait en séquentiel avec un `maybeSingle()` par clé : avec ~24 clés
 * montées et un tick toutes les 10 s, cela représentait près de 9 000 requêtes
 * par heure d'application ouverte, pour un unique utilisateur.
 */
let isPolling = false;
async function pullAllFromCloud() {
  if (!isSupabaseConfigured || isPolling || bacASable) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const keys = [...activeSetters.keys()];
  if (keys.length === 0) return;
  isPolling = true;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const { data, error } = await supabase
      .from(TABLE)
      .select("key, value, updated_at")
      .in("id", [...keys, CLE_CONFIG_CHIFFREMENT].map((k) => `${userId}:${k}`));
    if (error || !data) return;
    await adopterConfig(data.find((row) => row.key === CLE_CONFIG_CHIFFREMENT)?.value);
    (await lignesLisibles(data)).forEach((row) => applyCloudRow(row.key, row));
  } finally {
    isPolling = false;
  }
}

// 45 s plutôt que 10 : le retour au premier plan (`visibilitychange`/`focus`)
// déclenche déjà une relecture immédiate, qui couvre le cas réel « je passe
// du téléphone à l'ordi ». Ce tick n'est qu'un filet pour l'app laissée
// ouverte au premier plan sur deux appareils à la fois.
const POLL_INTERVAL_MS = 45_000;

/**
 * Pousse immédiatement les clés en attente, sans attendre le débounce de
 * 800 ms — y compris quand la page est en train d'être détruite.
 *
 * L'ancienne version commençait par `await currentUserId()`, c'est-à-dire par
 * un appel réseau. Sur `pagehide`, le navigateur détruit la page bien avant sa
 * résolution : la boucle de poussée n'était jamais atteinte, et le cas que
 * cette fonction était précisément censée couvrir — « je saisis une valeur puis
 * je referme aussitôt » — restait perdu côté cloud.
 *
 * D'où deux changements : l'identité et le jeton sont déjà en mémoire (aucune
 * attente), et l'écriture part en `keepalive`, seule façon pour une requête de
 * survivre à la fermeture d'un onglet. Le client Supabase n'expose pas cette
 * option, on passe donc directement par PostgREST.
 */
function flushAllToCloud() {
  if (!isSupabaseConfigured || dirtyKeys.size === 0) return;
  const { userId, accessToken } = session;
  if (!userId || !accessToken) return;

  const lignes = [];
  for (const key of dirtyKeys) {
    const entry = latestValues.get(key);
    if (!entry) continue;
    let value = entry.value;
    if (chiffrement.config) {
      if (!chiffrement.cle || !entry.chiffre || entry.chiffreDe !== entry.updatedAt) continue;
      value = entry.chiffre;
    }
    lignes.push({
      id: `${userId}:${key}`,
      user_id: userId,
      key,
      value,
      updated_at: entry.updatedAt,
    });
  }
  if (lignes.length === 0) return;

  try {
    fetch(`${supabaseConfig.url}/rest/v1/${TABLE}?on_conflict=id`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${accessToken}`,
        // `merge-duplicates` fait de ce POST un véritable upsert, comme celui
        // du client ; `return=minimal` évite de rapatrier les lignes écrites.
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(lignes),
    })
      .then((r) => {
        if (r.ok) lignes.forEach(({ key }) => dirtyKeys.delete(key));
      })
      // La page peut disparaître avant la réponse : l'écriture a tout de même
      // été émise, et les clés resteront marquées pour la prochaine ouverture.
      .catch(() => {});
  } catch {
    /* contexte déjà détruit : il n'y a plus rien à tenter */
  }
}

/** Réémission des clés en échec pendant que la page est encore bien vivante. */
async function repousserClesEnAttente() {
  if (!isSupabaseConfigured || dirtyKeys.size === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  for (const key of [...dirtyKeys]) {
    const entry = latestValues.get(key);
    if (entry) pushToCloud(key, entry.value, userId, entry.updatedAt);
  }
}

if (isSupabaseConfigured && typeof window !== "undefined") {
  markSyncEnabled();

  // L'identité est suivie à la source plutôt que redemandée : `onAuthStateChange`
  // émet la session courante dès l'abonnement, puis à chaque connexion,
  // déconnexion et rafraîchissement de jeton.
  supabase.auth.onAuthStateChange((_evenement, s) => {
    const precedent = session.userId;
    appliquerSession(s);
    // Changement de compte : ce qui a été hydraté ne concerne plus personne.
    if (session.userId !== precedent) hydratationCloud = null;
  });

  // Retour en ligne : la page est vivante, on repasse par le client normal et
  // ses réessais plutôt que par l'écriture d'urgence.
  window.addEventListener("online", repousserClesEnAttente);
  // Retour au premier plan (on rouvre la PWA, on change d'onglet) : on revérifie
  // tout de suite plutôt que d'attendre le prochain tick d'intervalle.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullAllFromCloud();
    else flushAllToCloud();
  });
  // pagehide couvre aussi la fermeture d'onglet/app, que visibilitychange ne
  // déclenche pas toujours de façon fiable selon les navigateurs.
  window.addEventListener("pagehide", flushAllToCloud);
  window.addEventListener("focus", pullAllFromCloud);
  setInterval(pullAllFromCloud, POLL_INTERVAL_MS);
}

/**
 * Équivalent de useState, mais qui lit/écrit automatiquement :
 * 1) dans le localStorage du navigateur (cache instantané, fonctionne hors-ligne),
 * 2) et — si un compte est connecté — dans Supabase (table `kv_store`), pour
 *    retrouver exactement les mêmes données sur n'importe quel autre appareil
 *    ou navigateur connecté au même compte.
 *
 * Arbitrage cloud/local : la version la plus récemment modifiée gagne
 * (comparaison des `updated_at`). Une modification faite localement pendant
 * que la requête cloud est en vol n'est donc plus écrasée — c'est le bug que
 * le drapeau `hasHydratedFromCloud`, posé mais jamais lu, était censé éviter.
 *
 * L'arbitrage repose entièrement sur le fait que l'horodatage local N'EST PAS
 * réécrit tant que la valeur n'a pas réellement changé. Les deux gardes qui
 * l'assurent — la lecture de `localUpdatedAt` avant tout `await`, et le
 * témoin `etatAuMontage` — sont indissociables : retirer l'une des deux
 * suffit à rendre la version cloud systématiquement perdante, sans qu'aucune
 * erreur ne soit visible. Le comportement est couvert par `storage.test.jsx`.
 *
 * Limite assumée : deux appareils modifiant la MÊME clé hors ligne en
 * parallèle ne fusionnent pas — le dernier à se reconnecter gagne. Un vrai
 * merge demanderait un modèle de données relationnel plutôt qu'un blob JSON
 * par clé (voir la note « Modèle de données » du README).
 */
export function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => readLocal(key, initialValue));
  const hasHydrated = useRef(false);
  const skipNextPush = useRef(false);
  const pushTimer = useRef(null);

  // Valeur exacte lue au montage. Elle sert de témoin : tant que l'état lui est
  // identique, rien n'a été modifié et il n'y a donc rien à réécrire.
  const etatAuMontage = useRef(state);

  // Le poll périodique (pullAllFromCloud) et les autres consommateurs de la
  // même clé ont besoin de pouvoir appliquer une valeur à ce composant précis,
  // d'où cet enregistrement. L'abonné est conservé dans une ref pour que
  // l'effet de persistance puisse s'exclure lui-même de la diffusion.
  const abonneRef = useRef(null);
  useEffect(() => {
    // `valeur` suit l'état de CET abonné, tenu à jour par l'effet de
    // persistance ci-dessous ; il sert à `diffuser` pour ne rien appliquer à
    // un composant qui porte déjà la valeur.
    const abonne = { setState, skipNextPush, valeur: etatAuMontage.current };
    abonneRef.current = abonne;

    let abonnes = activeSetters.get(key);
    if (!abonnes) {
      abonnes = new Set();
      activeSetters.set(key, abonnes);
    }
    abonnes.add(abonne);

    return () => {
      abonnes.delete(abonne);
      // La clé ne disparaît QUE lorsque plus personne ne l'écoute : c'est ce
      // qui la maintient dans la liste interrogée par pullAllFromCloud tant
      // qu'un composant l'affiche encore.
      if (abonnes.size === 0) activeSetters.delete(key);
    };
  }, [key]);

  // Au montage : on compare la version cloud et la version locale, et on garde
  // la plus récente des deux.
  useEffect(() => {
    let cancelled = false;
    // En bac à sable, une clé montée en cours d'essai ne relit pas le cloud :
    // la version d'essai (ou la version locale) fait foi.
    if (!isSupabaseConfigured || bacASable) {
      hasHydrated.current = true;
      return undefined;
    }
    // Horodatage local lu MAINTENANT, pendant le rendu de l'effet et donc
    // avant tout ce que la suite pourrait écrire. C'était la cause du bug :
    // l'effet de persistance ci-dessous s'exécutait avant que cette requête
    // n'aboutisse et repoussait l'horodatage local à « maintenant ». La
    // comparaison `cloud > local` devenait alors structurellement fausse, et
    // AUCUNE version cloud ne pouvait plus jamais être adoptée au montage —
    // le contraire exact de ce que ce bloc est censé faire.
    const localUpdatedAt = readLocalUpdatedAt(key);

    (async () => {
      let lignes;
      try {
        lignes = await hydraterDepuisCloud();
      } catch (e) {
        markFailed(key, e);
        hasHydrated.current = true;
        return;
      }
      const userId = session.userId;
      if (!userId || cancelled) {
        hasHydrated.current = true;
        return;
      }

      const data = lignes.get(key) || null;
      const cloudIsNewer =
        data && (!localUpdatedAt || (data.updated_at && data.updated_at > localUpdatedAt));

      if (cloudIsNewer) {
        const valeur = migrer(key, data.value);
        skipNextPush.current = true;
        setState(valeur);
        writeLocal(key, valeur, data.updated_at);
        latestValues.set(key, { value: valeur, updatedAt: data.updated_at });
        markSynced(key);
      } else {
        // Rien en cloud (premier appareil), ou version locale plus récente :
        // c'est le local qui fait foi et qu'on pousse. La clé est marquée en
        // attente le temps de la poussée — `pushToCloud` la libère en cas de
        // succès — pour qu'une fermeture immédiate de l'onglet la rattrape.
        const updatedAt = localUpdatedAt || new Date().toISOString();
        latestValues.set(key, { value: state, updatedAt });
        dirtyKeys.add(key);
        pushToCloud(key, state, userId, updatedAt);
      }
      hasHydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // À chaque changement : cache local instantané, puis push cloud débouncé
  // pour ne pas écrire en base à chaque frappe.
  useEffect(() => {
    // L'abonné porte toujours l'état courant de ce composant, avant toute
    // sortie anticipée : c'est ce qui permet à `diffuser` de l'ignorer quand
    // il n'a rien à lui apprendre.
    if (abonneRef.current) abonneRef.current.valeur = state;

    // Rien n'a changé depuis le montage : l'état est encore exactement celui
    // qui a été lu dans le localStorage. Le réécrire ne changerait pas son
    // contenu mais repousserait son horodatage à « maintenant », faisant
    // paraître cet appareil plus récent que le cloud à chaque ouverture — et
    // écrasant au passage une saisie faite ailleurs. C'est l'autre moitié du
    // même bug que celui traité dans l'effet d'hydratation.
    if (state === etatAuMontage.current) {
      latestValues.set(key, {
        value: state,
        updatedAt: readLocalUpdatedAt(key) || new Date().toISOString(),
      });
      return undefined;
    }

    // Valeur qui vient d'être adoptée depuis le cloud : elle est déjà écrite en
    // local avec l'horodatage du cloud. La ré-horodater la ferait passer pour
    // une modification de cet appareil.
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return undefined;
    }

    // Bac à sable : la modification reste en mémoire et suit sur les autres
    // écrans, sans jamais toucher au stockage ni au cloud.
    if (bacASable) {
      valeursBac.set(key, state);
      diffuser(key, state, abonneRef.current);
      return undefined;
    }

    const updatedAt = new Date().toISOString();
    writeLocal(key, state, updatedAt);
    latestValues.set(key, { value: state, updatedAt });
    preChiffrer(key);

    // Les autres composants branchés sur la même clé suivent immédiatement.
    // Sans cette diffusion, ils gardaient la valeur lue à LEUR montage :
    // le localStorage et le cloud étaient à jour, l'écran ne l'était pas.
    diffuser(key, state, abonneRef.current);

    if (!isSupabaseConfigured) return undefined;
    dirtyKeys.add(key);

    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      const userId = await currentUserId();
      if (!userId) return;
      pushToCloud(key, state, userId, updatedAt);
    }, DEBOUNCE_MS);
    return () => clearTimeout(pushTimer.current);
  }, [state, key]);

  return [state, setState];
}

/**
 * Remet à zéro les caches de module (session, hydratation, clés en attente).
 * Réservé aux tests : ces caches sont volontairement partagés par toutes les
 * instances du hook, ils survivent donc au démontage des composants.
 */
export function _resetStorageCache() {
  bacASable = false;
  valeursBac.clear();
  session = { userId: null, accessToken: null };
  hydratationCloud = null;
  latestValues.clear();
  dirtyKeys.clear();
  activeSetters.clear();
  chiffrement = { config: null, cle: null, operationEnCours: false };
  cleChargee = chargerCleLocale();
  notifierChiffrement();
}

/** État de synchronisation courant, pour l'indicateur de l'interface. */
export function useSyncStatus() {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
}

/** Force une réécriture cloud de toutes les clés en échec. */
export function useRetrySync() {
  return useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const userId = await currentUserId();
    if (!userId) return;
    for (const [key, entry] of latestValues) {
      await pushToCloud(key, entry.value, userId, entry.updatedAt);
    }
  }, []);
}

/**
 * Bouton "Actualiser" manuel : relit le cloud tout de suite et applique ce
 * qu'il trouve de plus récent, sans attendre le prochain tick de polling. Le
 * moyen le plus simple et le plus fiable de forcer la synchro à la demande,
 * quel que soit l'appareil.
 */
export function useManualRefresh() {
  return useCallback(() => pullAllFromCloud(), []);
}

export function exportAllData(keys) {
  // La version de forme des données : une version plus ancienne de l'app
  // refusera de restaurer ce qu'elle ne saurait pas lire.
  const dump = { __versionDonnees: VERSION_DONNEES };
  keys.forEach((k) => {
    const raw = localStorage.getItem(PREFIX + k);
    if (raw) {
      try {
        dump[k] = JSON.parse(raw);
      } catch {
        /* ignore */
      }
    }
  });
  return dump;
}

export function importAllData(dump) {
  const now = new Date().toISOString();
  Object.entries(dump).forEach(([k, v]) => {
    localStorage.setItem(PREFIX + k, JSON.stringify(v));
    // On horodate l'import au moment présent : sans cela, la version cloud
    // (plus récente) écraserait la sauvegarde qu'on vient tout juste de
    // restaurer, au prochain chargement.
    localStorage.setItem(META_PREFIX + k, now);
  });
}

export function clearAllData(keys) {
  keys.forEach((k) => {
    localStorage.removeItem(PREFIX + k);
    localStorage.removeItem(META_PREFIX + k);
    // Sans cet oubli en mémoire, le `pagehide` déclenché par le rechargement
    // qui suit la réinitialisation repoussait aussitôt vers le cloud les
    // valeurs qu'on vient d'effacer.
    latestValues.delete(k);
    dirtyKeys.delete(k);
  });
}

export async function clearCloudData(keys) {
  if (!isSupabaseConfigured) return;
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from(TABLE).delete().in(
    "id",
    [...keys, CLE_CONFIG_CHIFFREMENT].map((k) => `${userId}:${k}`)
  );
  // Tout effacer, c'est aussi oublier le chiffrement : sans cela, l'appareil
  // garderait une clé qui ne correspond plus à rien.
  chiffrement.config = null;
  oublierCleLocale();
  notifierChiffrement();
}

// ─── Chiffrement : interface publique ────────────────────────────────────────

/** `{ actif, verrouille }` — verrouillé : chiffré dans le cloud, sans clé sur cet appareil. */
export function useEtatChiffrement() {
  return useSyncExternalStore(
    (f) => {
      abonnesChiffrement.add(f);
      return () => abonnesChiffrement.delete(f);
    },
    () => etatChiffrement,
    () => etatChiffrement
  );
}

/**
 * Réécrit dans le cloud toutes les clés connues de cet appareil, avec leur
 * horodatage d'origine — chiffrées ou en clair selon l'état courant. Renvoie
 * le nombre d'échecs.
 */
async function reecrireTout(userId) {
  const cles = new Set(latestValues.keys());
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !k.startsWith(`${PREFIX}__`)) cles.add(k.slice(PREFIX.length));
    }
  } catch {
    /* stockage indisponible : on s'en tient aux clés en mémoire */
  }
  let echecs = 0;
  for (const key of cles) {
    const entry = latestValues.get(key);
    const value = entry ? entry.value : readLocal(key, undefined);
    if (value === undefined) continue;
    const updatedAt = entry?.updatedAt || readLocalUpdatedAt(key) || new Date().toISOString();
    if (!(await pushToCloud(key, value, userId, updatedAt))) echecs += 1;
  }
  return echecs;
}

async function utilisateurConnecte() {
  if (!isSupabaseConfigured) {
    throw new Error("La synchronisation n'est pas configurée : rien n'est envoyé dans le cloud.");
  }
  const userId = await currentUserId();
  if (!userId) throw new Error("Connecte-toi à ton compte pour gérer le chiffrement.");
  await cleChargee;
  await hydraterDepuisCloud();
  return userId;
}

/**
 * Active le chiffrement : configuration d'abord, puis réécriture chiffrée de
 * toutes les données. Interrompue en chemin, l'opération laisse une
 * configuration et des lignes restées en clair, toujours lisibles : rien
 * n'est perdu.
 */
export async function activerChiffrement(phrase) {
  const userId = await utilisateurConnecte();
  if (chiffrement.config) throw new Error("Le chiffrement est déjà actif.");
  const { cle, config } = await creerConfiguration(phrase);
  chiffrement.operationEnCours = true;
  try {
    const { error } = await supabase.from(TABLE).upsert({
      id: `${userId}:${CLE_CONFIG_CHIFFREMENT}`,
      user_id: userId,
      key: CLE_CONFIG_CHIFFREMENT,
      value: config,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    chiffrement.config = config;
    await garderCleLocale(cle);
    notifierChiffrement();
    return await reecrireTout(userId);
  } finally {
    chiffrement.operationEnCours = false;
  }
}

/** Déverrouille cet appareil avec la phrase secrète ; `false` si elle est fausse. */
export async function deverrouillerChiffrement(phrase) {
  await utilisateurConnecte();
  const cle = await verifierPhrase(phrase, chiffrement.config);
  if (!cle) return false;
  await garderCleLocale(cle);
  notifierChiffrement();
  // Les lignes écartées à l'ouverture sont maintenant lisibles.
  hydratationCloud = null;
  await pullAllFromCloud();
  return true;
}

/**
 * Désactive le chiffrement : réécriture en clair de tout, puis suppression de
 * la configuration — dans cet ordre, pour qu'aucune interruption ne laisse
 * des données chiffrées sans configuration pour les relire.
 */
export async function desactiverChiffrement() {
  const userId = await utilisateurConnecte();
  if (chiffrement.config && !chiffrement.cle) {
    throw new Error("Déverrouille d'abord cet appareil avec ta phrase secrète.");
  }
  const cleAvant = chiffrement.cle;
  const configAvant = chiffrement.config;
  chiffrement.operationEnCours = true;
  try {
    chiffrement.config = null;
    chiffrement.cle = null;
    const echecs = await reecrireTout(userId);
    if (echecs > 0) {
      // Rien n'est supprimé : la configuration reste, et la clé avec elle.
      chiffrement.config = configAvant;
      chiffrement.cle = cleAvant;
      throw new Error(`${echecs} donnée(s) n'ont pas pu être réécrites en clair : réessaie.`);
    }
    await supabase.from(TABLE).delete().in("id", [`${userId}:${CLE_CONFIG_CHIFFREMENT}`]);
    oublierCleLocale();
    return 0;
  } finally {
    chiffrement.operationEnCours = false;
    notifierChiffrement();
  }
}


/**
 * Date du dernier export de sauvegarde, pour pouvoir rappeler à l'utilisateur
 * qu'il n'a pas de copie hors du navigateur depuis longtemps.
 */
const LAST_BACKUP_KEY = "patrimoine:__lastBackupAt";

export function getLastBackupAt() {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

export function markBackupDone() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  } catch {
    /* stockage indisponible : on n'insiste pas */
  }
}
