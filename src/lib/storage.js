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
  ajouterCodeSecours,
  verifierCodeSecours,
  remplacerPhrase,
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

/**
 * Horodatages comparés comme des INSTANTS, et non comme des chaînes.
 *
 * Un même instant s'écrit de deux façons ici : `…30.120Z` quand l'appareil
 * l'a produit (`toISOString`), `…30.12+00:00` quand il revient de Postgres,
 * qui écrit le fuseau et rogne les zéros de fin. Comparées comme des chaînes,
 * deux écritures du même instant paraissaient différentes — et la réparation
 * des divergences (voir `pullAllFromCloud`) aurait repoussé la clé à chaque
 * relecture.
 */
function instant(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** `a` est strictement plus récent que `b` ; un horodatage absent est le plus ancien. */
function plusRecent(a, b) {
  const ta = instant(a);
  const tb = instant(b);
  if (ta == null) return false;
  return tb == null || ta > tb;
}

/**
 * Horodatage d'une écriture qui ne revendique aucune fraîcheur : l'appareil
 * n'avait encore rien enregistré pour cette clé (voir `setAuto`).
 */
const EPOQUE = new Date(0).toISOString();

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
let etatChiffrement = { actif: false, verrouille: false, codeSecours: null };

function notifierChiffrement() {
  etatChiffrement = {
    actif: !!chiffrement.config,
    verrouille: !!chiffrement.config && !chiffrement.cle,
    // Date de création du code de secours, `null` s'il n'y en a pas.
    codeSecours: chiffrement.config?.secours?.creeLe || null,
  };
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
/**
 * Écriture cloud CONDITIONNELLE : la ligne n'est remplacée que si sa version
 * est plus ancienne que celle qu'on envoie (ou du même instant).
 *
 * C'était un `upsert`, c'est-à-dire un écrasement sans condition. Toute
 * écriture d'un appareil en retard — le bouton de synchronisation qui
 * repoussait tout, une poussée partie avant que le cloud n'ait été lu —
 * remplaçait donc la version plus récente d'un autre appareil. Et elle le
 * faisait avec son VIEIL horodatage : l'appareil à jour, plus récent que ce
 * qu'il relisait, ne l'adoptait pas et ne repoussait rien non plus. Les deux
 * appareils restaient séparés pour de bon, quelle que soit la synchronisation
 * demandée — une ligne de portefeuille ajoutée sur l'ordinateur n'atteignait
 * jamais le téléphone.
 *
 * La condition est évaluée par Postgres dans l'`UPDATE` lui-même : aucune
 * fenêtre entre la vérification et l'écriture. Une clé encore absente du
 * cloud passe par un `INSERT`, dont l'échec sur conflit (23505) signale qu'un
 * autre appareil l'a créée entre-temps — avec une version que l'`UPDATE`
 * n'avait pas le droit de remplacer.
 */
async function ecrireSiPlusRecente(ligne) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ value: ligne.value, updated_at: ligne.updated_at })
    .eq("id", ligne.id)
    // Guillemets : l'horodatage contient « : » et « . », réservés par la
    // syntaxe des filtres `or` de PostgREST. Une ligne sans horodatage passe
    // pour la plus ancienne.
    .or(`updated_at.is.null,updated_at.lte."${ligne.updated_at}"`)
    .select("id");
  if (error) throw error;
  if (data && data.length > 0) return "ecrite";
  const { error: erreurInsertion } = await supabase.from(TABLE).insert(ligne);
  if (!erreurInsertion) return "ecrite";
  if (erreurInsertion.code === "23505") return "plus-recente-en-cloud";
  throw erreurInsertion;
}

/** Ligne cloud d'une clé : `brute` telle qu'elle est stockée, `lisible` déchiffrée (ou `null`). */
async function relireLigne(key, userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("key, value, updated_at")
    .in("id", [`${userId}:${key}`]);
  if (error) throw error;
  const brute = (data || []).find((row) => row.key === key);
  if (!brute) return null;
  const [lisible] = await lignesLisibles([brute]);
  return { brute, lisible: lisible || null };
}

/**
 * Pousse la DERNIÈRE valeur connue d'une clé, avec réessais à délai croissant.
 * Un échec réseau ponctuel (perte de wifi, 503 momentané) ne doit pas se
 * solder par une donnée définitivement absente d'un des appareils ; et un
 * échec durable doit être visible dans l'interface plutôt que noyé dans la
 * console.
 *
 * `value` et `updatedAt` ne servent que de repli : c'est `latestValues` qui
 * fait foi au moment d'écrire. L'ancienne version poussait la valeur figée à
 * l'appel, après avoir attendu la première lecture du cloud. Sur un téléphone
 * resté en retard, une actualisation des cours partie pendant cette lecture
 * finissait donc par envoyer le portefeuille PÉRIMÉ, horodaté « maintenant »,
 * alors que l'appareil venait d'adopter la version à jour : l'écran montrait
 * la bonne version, le cloud recevait l'ancienne.
 */
async function pushToCloud(key, value, userId, updatedAt) {
  // La configuration de chiffrement doit être connue avant toute écriture :
  // un appareil qui l'ignorerait pousserait en clair. Une lecture qui a ÉCHOUÉ
  // ne dit rien de ce que contient le cloud : on n'écrit pas à l'aveugle, la
  // clé reste marquée et repartira à la prochaine relecture.
  await cleChargee;
  if (!(await hydraterDepuisCloud())) {
    markFailed(key, new Error("Lecture du cloud impossible pour l'instant."));
    return false;
  }
  if (chiffrement.config && !chiffrement.cle) {
    dirtyKeys.delete(key);
    return false;
  }
  markPending(key);
  let lastError = null;
  let apresConflit = false;
  for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
    if (attempt > 0 && !apresConflit) await sleep(2 ** attempt * 400);
    apresConflit = false;
    // Remplacée par une version du cloud entre-temps : plus rien à écrire.
    if (!dirtyKeys.has(key)) {
      markSynced(key);
      return true;
    }
    const derniere = latestValues.get(key) || { value, updatedAt };
    const horodatage = derniere.updatedAt || new Date().toISOString();
    try {
      const valeurCloud = chiffrement.cle ? await chiffrer(chiffrement.cle, derniere.value) : derniere.value;
      const resultat = await ecrireSiPlusRecente({
        id: `${userId}:${key}`,
        user_id: userId,
        key,
        value: valeurCloud,
        updated_at: horodatage,
      });
      if (resultat === "ecrite") {
        // Une modification arrivée pendant l'aller-retour garde sa marque :
        // c'est sa propre poussée qui l'enverra.
        const courante = latestValues.get(key);
        if (!courante || (courante.value === derniere.value && courante.updatedAt === derniere.updatedAt)) {
          dirtyKeys.delete(key);
        }
        markSynced(key);
        return true;
      }
      // Le cloud porte une version plus récente que la nôtre : c'est elle
      // qu'on adopte, au lieu de l'écraser.
      apresConflit = true;
      const relue = await relireLigne(key, userId);
      if (!relue) continue; // effacée entre-temps : l'insertion repassera
      if (!relue.lisible) {
        lastError = new Error("Une version plus récente existe dans le cloud, mais cet appareil ne peut pas la lire.");
        continue;
      }
      applyCloudRow(key, relue.lisible);
      // Adoptée, mais stockée dans l'autre mode (en clair pendant une
      // activation du chiffrement, chiffrée pendant une désactivation) : elle
      // est réécrite telle quelle, avec son propre horodatage.
      const adoptee = latestValues.get(key)?.updatedAt === relue.lisible.updated_at;
      if (adoptee && estChiffre(relue.brute.value) !== Boolean(chiffrement.cle)) dirtyKeys.add(key);
    } catch (e) {
      lastError = e;
      // Hors ligne : inutile de brûler les tentatives, le retour en ligne
      // relancera la synchronisation (voir l'écouteur "online" plus bas).
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
    }
  }
  if (!dirtyKeys.has(key)) {
    markSynced(key);
    return true;
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
 *
 * Rend `null` quand la lecture a ÉCHOUÉ, et non une table vide. La remise à
 * zéro ci-dessous ne protégeait que les appels SUIVANTS : toutes les clés
 * montées au démarrage attendaient déjà cette même promesse, recevaient une
 * table vide, concluaient « rien dans le cloud » et poussaient leur état
 * local par-dessus — une coupure réseau à l'ouverture suffisait.
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
      // Un échec n'est pas mis en cache : la prochaine écriture ou relecture
      // retentera la lecture.
      hydratationCloud = null;
      return null;
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
  if (localUpdatedAt && !plusRecent(row.updated_at, localUpdatedAt)) return;

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
 *
 * Une relecture déjà en vol est PARTAGÉE plutôt qu'ignorée : le bouton de
 * synchronisation pressé pendant la relecture automatique du retour au
 * premier plan attend désormais son résultat, au lieu de rendre la main
 * aussitôt sans rien avoir relu.
 */
let relectureEnCours = null;
function pullAllFromCloud() {
  if (!isSupabaseConfigured || bacASable) return Promise.resolve();
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return Promise.resolve();
  if (relectureEnCours) return relectureEnCours;
  const keys = [...activeSetters.keys()];
  if (keys.length === 0) return Promise.resolve();
  relectureEnCours = (async () => {
    const userId = await currentUserId();
    if (!userId) return;
    const { data, error } = await supabase
      .from(TABLE)
      .select("key, value, updated_at")
      .in("id", [...keys, CLE_CONFIG_CHIFFREMENT].map((k) => `${userId}:${k}`));
    if (error || !data) return;
    await adopterConfig(data.find((row) => row.key === CLE_CONFIG_CHIFFREMENT)?.value);
    const lisibles = await lignesLisibles(data);
    lisibles.forEach((row) => applyCloudRow(row.key, row));
    reparerDivergences(lisibles, userId);
  })()
    .catch((e) => console.warn("Relecture du cloud impossible :", e))
    .finally(() => {
      relectureEnCours = null;
    });
  return relectureEnCours;
}

/**
 * Répare ce que la relecture vient de révéler : une clé dont cet appareil
 * porte une version PLUS RÉCENTE que celle du cloud, ou une modification
 * restée en attente d'écriture, repart vers le cloud.
 *
 * Sans cette étape, une divergence était définitive. L'appareil à jour
 * n'écrit que lorsqu'on modifie quelque chose ; tant qu'il ne le faisait pas,
 * le cloud gardait la version d'un appareil en retard, et cet appareil-là
 * n'avait rien à relire de neuf. Désormais, il suffit que l'appareil à jour
 * soit ouvert pour que l'autre finisse par le rejoindre.
 *
 * Seules les lignes PRÉSENTES dans le cloud sont comparées : une clé absente
 * peut avoir été effacée volontairement depuis un autre appareil, et ce n'est
 * pas à une relecture de la ressusciter (le montage s'en charge, comme avant,
 * pour un premier appareil). L'écriture reste conditionnelle : si un troisième
 * appareil a écrit entre-temps, c'est sa version qui est adoptée.
 */
function reparerDivergences(lisibles, userId) {
  if (chiffrement.config && !chiffrement.cle) return;
  const aPousser = new Set(dirtyKeys);
  for (const row of lisibles) {
    if (latestValues.has(row.key) && plusRecent(readLocalUpdatedAt(row.key), row.updated_at)) aPousser.add(row.key);
  }
  for (const key of aPousser) {
    const entree = latestValues.get(key);
    if (!entree) continue;
    dirtyKeys.add(key);
    pushToCloud(key, entree.value, userId, entree.updatedAt);
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
 *
 * Même règle que `ecrireSiPlusRecente` : un `PATCH` filtré sur l'horodatage,
 * et non plus un upsert sans condition, pour qu'une fermeture d'onglet ne
 * puisse pas écraser une version plus récente venue d'ailleurs. Une clé qui
 * n'existe pas encore dans le cloud n'est pas créée ici ; elle reste marquée,
 * et le montage suivant la poussera.
 */
function flushAllToCloud() {
  if (!isSupabaseConfigured || dirtyKeys.size === 0) return;
  const { userId, accessToken } = session;
  if (!userId || !accessToken) return;

  for (const key of dirtyKeys) {
    const entry = latestValues.get(key);
    if (!entry || !entry.updatedAt) continue;
    let value = entry.value;
    if (chiffrement.config) {
      if (!chiffrement.cle || !entry.chiffre || entry.chiffreDe !== entry.updatedAt) continue;
      value = entry.chiffre;
    }
    const filtre = new URLSearchParams({
      id: `eq.${userId}:${key}`,
      or: `(updated_at.is.null,updated_at.lte."${entry.updatedAt}")`,
      select: "id",
    });
    try {
      fetch(`${supabaseConfig.url}/rest/v1/${TABLE}?${filtre}`, {
        method: "PATCH",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseConfig.anonKey,
          Authorization: `Bearer ${accessToken}`,
          // Les lignes réellement remplacées reviennent (leur seul `id`) :
          // c'est ce qui distingue « écrite » de « refusée, plus récente
          // ailleurs », que le statut HTTP ne dit pas.
          Prefer: "return=representation",
        },
        body: JSON.stringify({ value, updated_at: entry.updatedAt }),
      })
        .then(async (r) => {
          const ecrites = r.ok && typeof r.json === "function" ? await r.json() : [];
          if (Array.isArray(ecrites) && ecrites.length > 0 && latestValues.get(key) === entry) dirtyKeys.delete(key);
        })
        // La page peut disparaître avant la réponse : l'écriture a tout de même
        // été émise, et la clé restera marquée pour la prochaine ouverture.
        .catch(() => {});
    } catch {
      /* contexte déjà détruit : il n'y a plus rien à tenter */
    }
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

  /*
   * DEUX SETTERS : l'écriture voulue et l'écriture automatique.
   *
   * L'arbitrage entre appareils compare des horodatages : la dernière version
   * MODIFIÉE l'emporte. Or une bonne part des écritures ne sont pas des
   * modifications — l'actualisation des cours, la clôture de la veille, le
   * relevé quotidien. Elles portaient pourtant l'horodatage « maintenant ».
   *
   * Sur un téléphone resté en retard, ouvrir l'onglet Bourse rafraîchissait
   * les cours de SON portefeuille périmé et le déclarait aussitôt plus récent
   * que tout : une ligne ajoutée sur l'ordinateur pouvait perdre l'arbitrage
   * face à de simples cours.
   *
   * `setAuto` écrit comme `setState`, mais garde l'horodatage de la version
   * qu'il complète. Contre une version plus récente ailleurs, il perd —
   * l'écriture conditionnelle la refuse et cet appareil adopte l'autre — et
   * les cours seront simplement actualisés de nouveau, sur la bonne base.
   */
  const ecritureAuto = useRef(false);
  const ecritureVoulue = useRef(false);
  const setVoulu = useCallback((valeur) => {
    ecritureVoulue.current = true;
    setState(valeur);
  }, []);
  const setAuto = useCallback((valeur) => {
    ecritureAuto.current = true;
    setState(valeur);
  }, []);

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
      // Lecture échouée (`null`) : on ne sait rien du cloud, donc on n'y
      // pousse rien. L'ancienne version prenait l'échec pour « cloud vide »
      // et écrasait la version des autres appareils avec la copie locale.
      // La prochaine relecture (retour au premier plan, intervalle, bouton)
      // fera l'arbitrage.
      if (!userId || cancelled || !lignes) {
        hasHydrated.current = true;
        return;
      }

      const data = lignes.get(key) || null;
      const cloudIsNewer = data && (!localUpdatedAt || plusRecent(data.updated_at, localUpdatedAt));

      if (cloudIsNewer) {
        const valeur = migrer(key, data.value);
        skipNextPush.current = true;
        setState(valeur);
        writeLocal(key, valeur, data.updated_at);
        latestValues.set(key, { value: valeur, updatedAt: data.updated_at });
        // Une écriture faite pendant la lecture (une actualisation des cours
        // sur la copie périmée, typiquement) est remplacée par la version du
        // cloud : elle n'a plus rien à envoyer.
        dirtyKeys.delete(key);
        markSynced(key);
      } else {
        // Rien en cloud (premier appareil), ou version locale plus récente :
        // c'est le local qui fait foi et qu'on pousse. La clé est marquée en
        // attente le temps de la poussée — `pushToCloud` la libère en cas de
        // succès — pour qu'une fermeture immédiate de l'onglet la rattrape.
        //
        // Si une écriture a eu lieu pendant la lecture, `latestValues` la
        // porte déjà : on ne la remplace pas par l'état figé du montage.
        if (readLocalUpdatedAt(key) === localUpdatedAt) {
          latestValues.set(key, { value: state, updatedAt: localUpdatedAt || new Date().toISOString() });
        }
        const derniere = latestValues.get(key);
        dirtyKeys.add(key);
        pushToCloud(key, derniere.value, userId, derniere.updatedAt);
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

    // Nature de l'écriture qui a produit cet état, lue puis remise à zéro
    // avant toute sortie anticipée. Une écriture voulue mêlée à une
    // écriture automatique dans le même rendu l'emporte : l'ensemble est
    // alors une modification de cet appareil.
    const auto = ecritureAuto.current && !ecritureVoulue.current;
    ecritureAuto.current = false;
    ecritureVoulue.current = false;

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

    // Écriture automatique (voir `setAuto`) : elle garde l'horodatage de la
    // version qu'elle complète, et ne revendique donc aucune fraîcheur.
    const updatedAt = auto ? readLocalUpdatedAt(key) || EPOQUE : new Date().toISOString();
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

  return [state, setVoulu, setAuto];
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

/**
 * Réessaie l'écriture cloud des clés en attente ou en échec — et d'elles
 * seules.
 *
 * L'ancienne version repoussait TOUTES les clés connues de l'appareil, avec
 * leur horodatage, par un écrasement sans condition, et en même temps que la
 * relecture du cloud. Presser « synchroniser » sur un appareil en retard
 * renvoyait donc sa copie périmée par-dessus la version à jour d'un autre
 * appareil : le geste censé récupérer les données de l'ordinateur était
 * précisément celui qui les effaçait du cloud.
 */
export function useRetrySync() {
  return useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const userId = await currentUserId();
    if (!userId) return;
    for (const key of [...dirtyKeys]) {
      const entry = latestValues.get(key);
      if (entry) await pushToCloud(key, entry.value, userId, entry.updatedAt);
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
 * Clé de chiffrement de cet appareil, ou `null` si le chiffrement est inactif
 * ou l'appareil verrouillé. Le coffre à papiers en enveloppe ses clés de
 * fichier (voir coffreFichiers.js).
 */
export async function cleChiffrementActive() {
  await cleChargee;
  return chiffrement.config ? chiffrement.cle : null;
}

/**
 * Oublie la clé de cet appareil : la phrase secrète sera redemandée. Les
 * données déjà présentes sur l'appareil restent lisibles par Patrium ; ce
 * sont la synchronisation et les fichiers du coffre qui se ferment.
 */
export function verrouillerCetAppareil() {
  if (!chiffrement.config) return;
  oublierCleLocale();
  notifierChiffrement();
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
    // Marquée « à écrire » : `pushToCloud` n'écrit que les clés en attente.
    dirtyKeys.add(key);
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

// ─── Code de secours et changement de phrase (version 2, voir chiffrement.js) ─
//
// Aucune de ces opérations ne rechiffre de donnée : la clé reste la même, seule
// la configuration gagne ou remplace une enveloppe. Les autres appareils, qui
// gardent cette clé, ne voient donc aucune différence.

/** Écrit une configuration de chiffrement dans le cloud, puis l'adopte ici. */
async function ecrireConfiguration(userId, config) {
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
  } finally {
    chiffrement.operationEnCours = false;
    notifierChiffrement();
  }
}

async function cleDeverrouillee() {
  const userId = await utilisateurConnecte();
  if (!chiffrement.config) throw new Error("Le chiffrement n'est pas actif.");
  if (!chiffrement.cle) throw new Error("Déverrouille d'abord cet appareil avec ta phrase secrète.");
  return userId;
}

/**
 * Crée le code de secours, ou le remplace : l'ancien cesse alors de servir.
 * Rend le code en clair, à montrer une seule fois ; il n'est conservé nulle
 * part, seule son enveloppe part dans le cloud.
 */
export async function creerCodeSecours() {
  const userId = await cleDeverrouillee();
  const { code, config } = await ajouterCodeSecours(chiffrement.cle, chiffrement.config);
  await ecrireConfiguration(userId, config);
  return code;
}

/** Change la phrase secrète sur un appareil déverrouillé. */
export async function changerPhraseSecrete(nouvellePhrase) {
  const userId = await cleDeverrouillee();
  await ecrireConfiguration(userId, await remplacerPhrase(chiffrement.cle, nouvellePhrase, chiffrement.config));
}

/**
 * Phrase oubliée : le code de secours rouvre la clé, et une nouvelle phrase la
 * remplace aussitôt. `false` si le code n'est pas le bon.
 */
export async function deverrouillerAvecCodeSecours(code, nouvellePhrase) {
  const userId = await utilisateurConnecte();
  const cle = await verifierCodeSecours(code, chiffrement.config);
  if (!cle) return false;
  await ecrireConfiguration(userId, await remplacerPhrase(cle, nouvellePhrase, chiffrement.config));
  await garderCleLocale(cle);
  notifierChiffrement();
  hydratationCloud = null;
  await pullAllFromCloud();
  return true;
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
