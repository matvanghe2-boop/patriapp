import { withApi, httpError, cached } from "./_lib/http.js";
import { exigerUtilisateur } from "./_lib/auth.js";
import { construireChaine } from "../shared/adaptateursLLM.js";
import { PROMPT_RESUME, construireResume, verifierChiffres } from "../shared/resumePublication.js";
import { PROMPT_ANALYSE, fourchetteValorisation } from "../shared/valorisation.js";
import { urlDocumentAutorisee, texteDocument, texteLisiblePdf } from "./_lib/sources/infoFinanciere.js";
import { ficheComplete } from "./_lib/yahooFondamentaux.js";
import { isValidSymbol } from "./_lib/yahoo.js";
import {
  contexteHistorique,
  verifierIndicateurs,
  evaluerCriteres,
  precautionDePeriode,
  PROMPT_INTERPRETATION,
  donneesInterpretation,
  construireInterpretation,
} from "../shared/interpretationResultats.js";

/**
 * Résumé d'une publication d'entreprise — POST /api/resume
 *
 * Reçoit du TEXTE PUBLIC d'entreprise (communiqué, rapport trimestriel) et
 * renvoie un résumé dont chaque chiffre a été confronté au texte d'origine.
 *
 * CE QUI NE TRANSITE JAMAIS
 *
 * Aucune donnée de portefeuille. Ni montant, ni quantité, ni nom de compte.
 * Cette route ne reçoit qu'un symbole et du texte déjà public — c'est la
 * différence de nature avec `/api/advisor`, qui raisonne sur un contexte
 * patrimonial anonymisé. Il n'y a donc rien à anonymiser ici : il n'y a rien
 * de personnel à l'entrée.
 *
 * POURQUOI UNE AUTHENTIFICATION MALGRÉ DU CONTENU PUBLIC
 *
 * Comme `/api/advisor`, l'abus coûte le quota du fournisseur de modèle au
 * propriétaire. Le contrôle d'origine ne suffit pas : une requête sans
 * en-tête `Origin` est le cas nominal du navigateur en same-origin, mais
 * aussi celui d'un `curl`.
 *
 * DEUX FAÇONS DE FOURNIR LE TEXTE
 *
 *  1. `url` — uniquement vers un hôte de la SEC, ou vers l'entrepôt de
 *     documents d'info-financiere.gouv.fr, où les sociétés françaises
 *     déposent leurs communiqués en PDF. Fetcher une URL arbitraire
 *     transformerait cette fonction en relais vers le réseau interne de
 *     l'hébergeur ; la liste blanche n'est pas une précaution de principe.
 *  2. `texte` — collé par l'utilisateur. C'est la voie qui reste pour les
 *     autres sociétés européennes, dont aucun fournisseur gratuit ne sert les
 *     communiqués, et elle couvre tout le reste sans rien scraper.
 */

const HOTES_AUTORISES = new Set(["www.sec.gov", "sec.gov", "data.sec.gov"]);

// Un communiqué dépasse rarement 80 000 caractères ; au-delà on tronque
// plutôt que de refuser, et on le dit dans la réponse.
const MAX_TEXTE = 80_000;
const MAX_CORPS = 256 * 1024;
const CACHE_MS = 24 * 60 * 60_000;
const DELAI_RECUP_MS = 10_000;

/** Retire le balisage pour ne garder que le texte lisible. */
export function texteLisible(html = "") {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Vérifie qu'une URL vise bien un document de la SEC ou de la DILA. */
export function urlAutorisee(brut) {
  if (urlDocumentAutorisee(brut)) return true;
  let u;
  try {
    u = new URL(String(brut));
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  return HOTES_AUTORISES.has(u.hostname.toLowerCase());
}

async function recupererTexte(url, env = process.env) {
  // Les communiqués français sont des PDF : même lecteur que le calendrier,
  // avec ses bornes de taille et de pages.
  if (urlDocumentAutorisee(url)) {
    try {
      // Sans les en-têtes répétés à chaque page : le modèle lisait sinon six
      // fois la raison sociale et le capital social de la société.
      return texteLisiblePdf(await texteDocument(url));
    } catch (err) {
      throw httpError(502, `Document indisponible (${err.message}).`);
    }
  }

  const enTetes = { Accept: "text/html,application/xhtml+xml" };
  // La SEC exige le même en-tête de contact que pour son API.
  const ua = (env.SEC_USER_AGENT || "").trim();
  if (ua) enTetes["User-Agent"] = ua;

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_RECUP_MS);
  try {
    const r = await fetch(url, { headers: enTetes, signal: controleur.signal, redirect: "follow" });
    if (!r.ok) throw httpError(502, `Document indisponible (HTTP ${r.status}).`);
    return texteLisible(await r.text());
  } finally {
    clearTimeout(minuteur);
  }
}

/** Extrait le JSON d'une réponse de modèle, qui l'enrobe souvent de texte. */
export function lireJsonModele(brut) {
  if (!brut || typeof brut !== "string") return null;
  const sansCloture = brut.replace(/```json\s*|```/gi, "").trim();
  try {
    return JSON.parse(sansCloture);
  } catch {
    // Repli : le premier objet complet trouvé dans la réponse.
    const debut = sansCloture.indexOf("{");
    const fin = sansCloture.lastIndexOf("}");
    if (debut < 0 || fin <= debut) return null;
    try {
      return JSON.parse(sansCloture.slice(debut, fin + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Mode « analyse » : explication de la trajectoire d'une société.
 *
 * Le PRIX n'est jamais demandé au modèle. Il est calculé par
 * `fourchetteValorisation`, à partir de ratios publiés et de règles
 * explicites, et seulement transmis au modèle pour qu'il le commente.
 * « Estimer un juste prix » est précisément la question à laquelle un modèle
 * répond avec aplomb et sans fondement : la réponse doit donc être de
 * l'arithmétique vérifiable, pas une génération.
 *
 * Aucune donnée de portefeuille n'entre ici : seulement des ratios publics
 * de la société, les mêmes que ceux déjà affichés dans sa fiche.
 */
async function analyser(req, res) {
  const { symbole, donnees = {} } = req.body ?? {};
  if (typeof symbole !== "string" || !symbole.trim()) {
    throw httpError(400, "Symbole manquant.");
  }

  const valorisation = fourchetteValorisation(donnees);

  const adaptateurs = construireChaine(process.env);
  if (adaptateurs.length === 0) {
    // La valorisation, elle, ne dépend d'aucun modèle : on la rend quand même.
    return res.status(200).json({ disponible: false, motif: "Aucun fournisseur de modèle configuré.", valorisation });
  }

  // Le modèle reçoit les chiffres mis à plat, et la fourchette DÉJÀ calculée.
  const contexte = JSON.stringify({ symbole: symbole.trim(), ratios: donnees, valorisation }, null, 1);

  let reponse = null;
  for (const adaptateur of adaptateurs) {
    try {
      const sortie = await adaptateur.envoyer({
        systeme: PROMPT_ANALYSE,
        messages: [{ role: "utilisateur", contenu: `Chiffres de ${symbole} :\n\n${contexte}` }],
      });
      reponse = lireJsonModele(sortie?.contenu);
      if (reponse) break;
    } catch {
      /* fournisseur suivant */
    }
  }

  if (!reponse) {
    return res.status(200).json({ disponible: false, motif: "Le fournisseur de modèle n'a pas répondu.", valorisation });
  }

  // Les chiffres cités par le modèle sont confrontés au contexte qu'on lui a
  // transmis : il n'a pas le droit d'en introduire d'autres.
  const champsTexte = [reponse.trajectoire, reponse.positionnement, reponse.incertitudes]
    .filter((t) => typeof t === "string")
    .join(" ");
  const nombresCites = [...champsTexte.matchAll(/-?\d[\d\u00a0\u202f .,]*\d|-?\d/g)].map((m) => m[0]);
  const { rejetes } = verifierChiffres(
    nombresCites.map((v) => ({ libelle: "cité", valeur: v })),
    contexte
  );

  return res.status(200).json({
    disponible: true,
    symbole: symbole.trim(),
    valorisation,
    trajectoire: typeof reponse.trajectoire === "string" ? reponse.trajectoire : "",
    positionnement: typeof reponse.positionnement === "string" ? reponse.positionnement : "",
    forces: Array.isArray(reponse.forces) ? reponse.forces.filter((f) => typeof f === "string") : [],
    vigilance: Array.isArray(reponse.vigilance) ? reponse.vigilance.filter((f) => typeof f === "string") : [],
    incertitudes: typeof reponse.incertitudes === "string" ? reponse.incertitudes : "",
    // Un chiffre cité qui ne figure pas dans les données transmises signale
    // que le modèle a brodé : l'analyse est alors présentée comme incertaine.
    fiable: rejetes.length === 0,
    chiffresDouteux: rejetes.length,
  });
}

async function handler(req, res) {
  const debut = Date.now();
  await exigerUtilisateur(req);

  if (req.body?.mode === "analyse") return analyser(req, res);

  const { symbole, url, texte, guidancePrecedente = null } = req.body ?? {};
  if (typeof symbole !== "string" || !symbole.trim()) {
    throw httpError(400, "Symbole manquant.");
  }

  // L'historique de la société (la fiche de Marché) se charge pendant que le
  // modèle lit le communiqué : il servira à situer les chiffres publiés.
  const promesseFiche = chargerFiche(symbole.trim());

  let source = typeof texte === "string" ? texte.trim() : "";
  let lien = null;

  if (!source) {
    if (!urlAutorisee(url)) {
      throw httpError(
        400,
        "Fournis le texte de la publication, ou un lien vers un document SEC ou info-financiere.gouv.fr. Les autres sources ne sont pas récupérées automatiquement."
      );
    }
    lien = url;
    source = await cached(`resumeTexte:${url}`, CACHE_MS, () => recupererTexte(url));
  }

  if (!source) throw httpError(422, "Aucun texte exploitable dans ce document.");

  const tronque = source.length > MAX_TEXTE;
  const texteSource = tronque ? source.slice(0, MAX_TEXTE) : source;

  const adaptateurs = construireChaine(process.env);
  if (adaptateurs.length === 0) {
    // Sans fournisseur, on ne fabrique pas un résumé dégradé : on rend la
    // matière brute, et l'interface affiche le lien et le texte.
    return res.status(200).json({
      disponible: false,
      // Le message dit quoi faire : c'est le propriétaire de l'application
      // qui le lit, et la seule action possible est côté hébergeur.
      motif:
        "Aucun fournisseur de modèle configuré : ajoute une clé GEMINI_API_KEY (gratuite) ou GROQ_API_KEY dans les variables d'environnement Vercel, puis redéploie.",
      lien,
      texteSource,
      tronque,
    });
  }

  let reponseModele = null;
  let dernierEchec = null;
  for (const adaptateur of adaptateurs) {
    try {
      const sortie = await adaptateur.envoyer({
        systeme: PROMPT_RESUME,
        messages: [{ role: "utilisateur", contenu: `Publication de ${symbole} :\n\n${texteSource}` }],
      });
      // Les adaptateurs renvoient { type: "texte", contenu }. Aucun outil
      // n'est fourni ici : le modèle n'a rien à appeler, juste à lire.
      reponseModele = lireJsonModele(sortie?.contenu);
      if (reponseModele) break;
    } catch (err) {
      dernierEchec = err;
    }
  }

  if (!reponseModele) {
    return res.status(200).json({
      disponible: false,
      motif: dernierEchec ? "Le fournisseur de modèle n'a pas répondu." : "Réponse du modèle illisible.",
      lien,
      texteSource,
      tronque,
    });
  }

  const resume = construireResume({ reponseModele, texteSource, lien, guidancePrecedente });

  // Indicateurs normalisés : même contrôle que les chiffres du résumé. Un
  // indicateur introuvable dans le texte est écarté ET rend le résumé
  // incertain — le modèle a recopié de travers au moins une fois.
  const { valides: indicateurs, rejetes: indicateursRejetes } = verifierIndicateurs(
    reponseModele?.indicateurs,
    texteSource
  );
  resume.indicateurs = indicateurs;
  if (indicateursRejetes.length > 0) {
    resume.fiable = false;
    resume.chiffresRejetes = [
      ...resume.chiffresRejetes,
      ...indicateursRejetes.map((r) => ({ libelle: r.cle, valeur: r.valeur, motif: "absent du texte source" })),
    ];
  }

  // La grille : les indicateurs publiés face à l'historique de la société.
  const contexte = contexteHistorique(await promesseFiche);
  const criteres = evaluerCriteres({
    indicateurs,
    contexte,
    evolutionGuidance: resume.evolutionGuidance,
    tenue: lireTenue(req.body?.tenue),
  });

  // La lecture rédigée est un complément : passé le budget de temps, la
  // grille part seule plutôt que de risquer l'arrêt de la fonction sans
  // réponse du tout.
  const interpretation =
    Date.now() - debut < BUDGET_INTERPRETATION_MS
      ? await interpreterPublication({ adaptateurs, symbole: symbole.trim(), resume, contexte, criteres, texteSource })
      : null;

  return res.status(200).json({
    disponible: true,
    symbole: symbole.trim(),
    tronque,
    ...resume,
    criteres,
    precaution: precautionDePeriode(indicateurs.periode),
    interpretation,
    contexte: contexte
      ? { periode: contexte.periode, nbExercices: contexte.nbExercices, secteur: contexte.secteur }
      : null,
  });
}

/**
 * Au-delà de ce délai écoulé depuis le début de la requête, la lecture
 * rédigée n'est pas demandée : un second appel de modèle pourrait dépasser
 * les 60 s de la fonction.
 */
const BUDGET_INTERPRETATION_MS = 30_000;

/** Fiche financière de Marché, sans jamais faire échouer le résumé. */
async function chargerFiche(symbole) {
  if (!isValidSymbol(symbole)) return null;
  try {
    return await cached(`fund:${symbole}`, 15 * 60_000, () => ficheComplete(symbole));
  } catch {
    return null;
  }
}

/** Le décompte des promesses tenues vient du client : on n'en garde que des entiers plausibles. */
export function lireTenue(brut) {
  const tenues = Number(brut?.tenues);
  const total = Number(brut?.total);
  if (!Number.isInteger(tenues) || !Number.isInteger(total) || total <= 0 || tenues < 0 || tenues > total || total > 200) {
    return null;
  }
  return { tenues, total };
}

/**
 * Lecture rédigée de la publication, à partir de la grille déjà calculée.
 * Exportée pour être testée avec des adaptateurs simulés.
 */
export async function interpreterPublication({ adaptateurs, symbole, resume, contexte, criteres, texteSource }) {
  const donnees = donneesInterpretation({ symbole, resume, criteres, contexte });
  for (const adaptateur of adaptateurs) {
    try {
      const sortie = await adaptateur.envoyer({
        systeme: PROMPT_INTERPRETATION,
        messages: [{ role: "utilisateur", contenu: `Publication de ${symbole} à interpréter :\n\n${donnees}` }],
      });
      const lecture = construireInterpretation(lireJsonModele(sortie?.contenu), { texteSource, donnees });
      if (lecture) return lecture;
    } catch {
      /* fournisseur suivant */
    }
  }
  return null;
}

/** Un résumé complet dépasse les 10 s par défaut, comme l'assistant. */
export const config = { maxDuration: 60 };

export default withApi(handler, {
  methods: ["POST"],
  // Chaque appel consomme le quota du fournisseur de modèle : quota serré.
  limit: 15,
  windowMs: 60_000,
  maxBodyBytes: MAX_CORPS,
  portee: "resume",
});
