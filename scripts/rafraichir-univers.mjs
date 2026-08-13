/**
 * Régénère les instantanés d'univers du screener.
 *
 *   npm run univers              # tous les univers déclarés
 *   npm run univers -- sbf120    # un seul
 *
 * POURQUOI HORS LIGNE. Le screener interrogeait Yahoo à chaque écran. À
 * quelques milliers de titres c'est structurellement impossible : le quota de
 * `/api/market?action=screen` (20 requêtes/minute) imposerait à lui seul plus
 * de sept minutes d'attente, et Yahoo commencerait de toute façon à renvoyer
 * des réponses vides bien avant. Les fondamentaux sont donc récupérés ici,
 * une fois par semaine, et servis comme un actif statique — le navigateur
 * filtre en local, instantanément.
 *
 * Une fois par semaine et non par jour : un PER, un ROE ou une marge ne
 * bougent pas à la journée, et un instantané quotidien ferait grossir le dépôt
 * cinq fois plus vite pour une fraîcheur dont personne n'a l'usage.
 *
 * POLITESSE. Yahoo tolère mal les rafales — `api/_lib/routes/screen.js` le
 * documente déjà : au-delà d'une certaine cadence les réponses reviennent
 * vides SANS erreur explicite, ce qui produirait un univers silencieusement
 * amputé. D'où une concurrence basse, une pause entre les lots, et surtout un
 * garde-fou : si le taux d'échec dépasse un seuil, on s'arrête au lieu
 * d'écrire un instantané dégradé par-dessus un instantané sain.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ratiosTitre } from "../api/_lib/yahooFondamentaux.js";
import { encoderInstantane } from "../shared/universSnapshot.js";
import { verifierEligibilite } from "../shared/eligibilitePea.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER_LISTES = join(RACINE, "data", "listes");
const DOSSIER_SORTIE = join(RACINE, "public", "univers");

/** Univers déclarés. Ajouter une entrée + un fichier de tickers suffit. */
const UNIVERS = [
  { cle: "sbf120", fichier: "sbf120.txt", libelle: "SBF 120", zone: "France" },
  { cle: "fr-small", fichier: "fr-small.txt", libelle: "Small caps françaises", zone: "France" },
  { cle: "stoxx600", fichier: "stoxx600.txt", libelle: "STOXX Europe 600", zone: "Europe" },
  { cle: "russell2000", fichier: "russell2000.txt", libelle: "Russell 2000", zone: "États-Unis" },
];

// Réglages de cadence. Volontairement conservateurs : le script tourne dans un
// job hebdomadaire où dix minutes de plus ne coûtent rien, alors qu'un
// bannissement coûterait la fonctionnalité entière.
const CONCURRENCE = 4;
const PAUSE_ENTRE_LOTS_MS = 250;
const TENTATIVES = 3;
/** Au-delà, on considère que la source nous a fermé la porte. */
const TAUX_ECHEC_MAX = 0.4;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function lireListe(fichier) {
  const chemin = join(DOSSIER_LISTES, fichier);
  if (!existsSync(chemin)) return null;
  return [
    ...new Set(
      readFileSync(chemin, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => l.toUpperCase())
    ),
  ];
}

/** Un titre, avec réessais espacés. `null` si la source n'a rien voulu dire. */
async function recupererTitre(symbole) {
  for (let tentative = 0; tentative < TENTATIVES; tentative++) {
    if (tentative > 0) await dormir(500 * 2 ** tentative);
    try {
      const ratios = await ratiosTitre(symbole);
      // Un titre sans nom ni cours n'est pas une donnée partielle, c'est une
      // réponse vide : le symbole n'existe probablement plus.
      if (ratios && (ratios.nom || ratios.cours != null)) return ratios;
    } catch {
      /* on retente */
    }
  }
  return null;
}

async function recupererUnivers(symboles, libelle) {
  const titres = [];
  const morts = [];
  let faits = 0;

  for (let i = 0; i < symboles.length; i += CONCURRENCE) {
    const lot = symboles.slice(i, i + CONCURRENCE);
    const resultats = await Promise.all(lot.map(recupererTitre));

    resultats.forEach((ratios, j) => {
      const symbole = lot[j];
      if (!ratios) {
        morts.push(symbole);
        return;
      }
      // L'éligibilité PEA dépend du SIÈGE SOCIAL, pas de la place de cotation.
      // Les deux divergent : Shell plc se négocie sur Euronext Amsterdam mais
      // est domiciliée au Royaume-Uni, donc inéligible. Yahoo publie le pays du
      // siège dans `assetProfile.country` ; le suffixe ne sert que de repli.
      const verdict = verifierEligibilite(symbole, "PEA", ratios.pays);
      titres.push({
        ...ratios,
        symbole,
        // Calculée ici plutôt que dans le navigateur : c'est une propriété du
        // titre, elle a sa place dans l'instantané au même titre que son
        // secteur, et elle permet un filtre « éligible PEA » instantané.
        eee: verdict.eligible === true,
      });
    });

    faits += lot.length;
    process.stdout.write(`\r  ${libelle} : ${faits}/${symboles.length} (${morts.length} sans réponse)   `);
    await dormir(PAUSE_ENTRE_LOTS_MS);
  }
  process.stdout.write("\n");

  return { titres, morts };
}

async function main() {
  const demandes = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const aTraiter = UNIVERS.filter((u) => demandes.length === 0 || demandes.includes(u.cle));

  if (aTraiter.length === 0) {
    console.error(`Univers inconnu. Disponibles : ${UNIVERS.map((u) => u.cle).join(", ")}`);
    process.exit(1);
  }

  mkdirSync(DOSSIER_SORTIE, { recursive: true });
  const rapport = { genereLe: new Date().toISOString(), univers: {} };
  let echecGlobal = false;

  for (const univers of aTraiter) {
    const symboles = lireListe(univers.fichier);
    if (!symboles) {
      // Un univers déclaré mais dont la liste n'a pas encore été fournie n'est
      // pas une erreur : c'est le cas de STOXX 600 et Russell 2000 tant que
      // leurs compositions n'ont pas été déposées.
      console.log(`· ${univers.libelle} : data/listes/${univers.fichier} absent, ignoré.`);
      continue;
    }

    console.log(`\n▸ ${univers.libelle} — ${symboles.length} symboles`);
    const { titres, morts } = await recupererUnivers(symboles, univers.libelle);

    const tauxEchec = symboles.length > 0 ? morts.length / symboles.length : 0;
    if (tauxEchec > TAUX_ECHEC_MAX) {
      // On n'écrase PAS l'instantané précédent : mieux vaut des données de la
      // semaine dernière qu'un univers amputé de moitié par une panne.
      console.error(
        `  ✗ ${(tauxEchec * 100).toFixed(0)} % d'échecs — instantané NON écrit, l'ancien est conservé.`
      );
      rapport.univers[univers.cle] = { erreur: "taux d'échec trop élevé", tauxEchecPct: tauxEchec * 100, morts };
      echecGlobal = true;
      continue;
    }

    const instantane = encoderInstantane(titres, {
      univers: univers.cle,
      libelle: univers.libelle,
      zone: univers.zone,
      genereLe: new Date().toISOString(),
      source: "Yahoo Finance",
    });

    const chemin = join(DOSSIER_SORTIE, `${univers.cle}.json`);
    writeFileSync(chemin, JSON.stringify(instantane));
    const ko = (JSON.stringify(instantane).length / 1024).toFixed(0);
    console.log(`  ✓ ${titres.length} titres écrits (${ko} Ko) → public/univers/${univers.cle}.json`);
    if (morts.length > 0) {
      console.log(`  · ${morts.length} sans réponse : ${morts.slice(0, 12).join(", ")}${morts.length > 12 ? "…" : ""}`);
    }

    rapport.univers[univers.cle] = {
      demandes: symboles.length,
      retenus: titres.length,
      morts,
      tailleKo: Number(ko),
    };
  }

  writeFileSync(join(DOSSIER_LISTES, "rapport.json"), JSON.stringify(rapport, null, 2) + "\n");
  console.log("\nRapport écrit dans data/listes/rapport.json");
  if (echecGlobal) process.exit(1);
}

main().catch((err) => {
  console.error("\nÉchec du rafraîchissement :", err);
  process.exit(1);
});
