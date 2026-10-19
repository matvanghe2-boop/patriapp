import { withApi, httpError, cached } from "./_lib/http.js";
import { exigerUtilisateur } from "./_lib/auth.js";
import { construireChaine } from "../shared/adaptateursLLM.js";
import { PROMPT_RESUME, construireResume } from "../shared/resumePublication.js";

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
 *  1. `url` — uniquement vers un hôte de la SEC. Fetcher une URL arbitraire
 *     transformerait cette fonction en relais vers le réseau interne de
 *     l'hébergeur ; la liste blanche n'est pas une précaution de principe.
 *  2. `texte` — collé par l'utilisateur. C'est la seule voie possible pour
 *     les sociétés européennes, dont aucun fournisseur gratuit ne sert les
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

/** Vérifie qu'une URL vise bien un document de la SEC. */
export function urlAutorisee(brut) {
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

async function handler(req, res) {
  await exigerUtilisateur(req);

  const { symbole, url, texte, guidancePrecedente = null } = req.body ?? {};
  if (typeof symbole !== "string" || !symbole.trim()) {
    throw httpError(400, "Symbole manquant.");
  }

  let source = typeof texte === "string" ? texte.trim() : "";
  let lien = null;

  if (!source) {
    if (!urlAutorisee(url)) {
      throw httpError(
        400,
        "Fournis le texte de la publication, ou un lien vers un document SEC. Les autres sources ne sont pas récupérées automatiquement."
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
      motif: "Aucun fournisseur de modèle configuré.",
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
  return res.status(200).json({ disponible: true, symbole: symbole.trim(), tronque, ...resume });
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
