/**
 * Horizon — adaptateurs de fournisseurs LLM (§6 de HORIZON_SPEC.md).
 *
 * Une interface unique, N implémentations. L'orchestrateur ne connaît que le
 * contrat ci-dessous ; changer de fournisseur est un changement de config.
 *
 *     envoyer({ systeme, messages, outils }) →
 *         { type: "appel_outil", appels: [{ id, nom, arguments }] }
 *       | { type: "texte", contenu }
 *
 * RÈGLE STRUCTURELLE : **aucun fournisseur payant.** Il n'existe pas
 * d'adaptateur Claude, OpenAI ou autre modèle facturé à l'usage dans ce
 * fichier, et aucune variable d'environnement ne peut en activer un. Le coût
 * d'exécution d'Horizon est nul par construction, pas par réglage.
 *
 * Chaîne de repli : Gemini → Groq → Ollama → mode dégradé (formulaires).
 */

/** Erreur signalant un quota épuisé : déclenche le passage au fournisseur suivant. */
export class ErreurQuota extends Error {
  constructor(fournisseur, message) {
    super(message || `Quota épuisé pour ${fournisseur}.`);
    this.name = "ErreurQuota";
    this.fournisseur = fournisseur;
    this.recuperable = true;
  }
}

/** Erreur d'un fournisseur indisponible (réseau, 5xx) : repli également. */
export class ErreurFournisseur extends Error {
  constructor(fournisseur, message) {
    super(message || `${fournisseur} indisponible.`);
    this.name = "ErreurFournisseur";
    this.fournisseur = fournisseur;
    this.recuperable = true;
  }
}

const estQuota = (statut) => statut === 429 || statut === 403;

/**
 * Délai maximal d'un appel au fournisseur. Sans borne, une requête qui traîne
 * consomme tout le budget de la fonction serverless et la fait tuer sans
 * réponse : mieux vaut abandonner ce fournisseur et basculer sur le suivant.
 */
export const DELAI_APPEL_MS = 30_000;

/** Signal d'annulation, en dégradant proprement si l'environnement ne l'offre pas. */
function signalDelai(ms) {
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

/** Convertit un schéma d'outil interne vers le format OpenAPI attendu par Gemini. */
function versDeclarationGemini({ nom, description, parametres }) {
  return { name: nom, description, parameters: parametres };
}

/** Convertit un schéma d'outil interne vers le format OpenAI (Groq, Ollama). */
function versOutilOpenAI({ nom, description, parametres }) {
  return { type: "function", function: { name: nom, description, parameters: parametres } };
}

// ─── GEMINI (fournisseur par défaut) ─────────────────────────────────────────

/**
 * Adaptateur Google Gemini.
 *
 * La clé ne doit jamais atteindre le navigateur : cet adaptateur est instancié
 * côté serveur, dans `api/advisor.js`.
 */
export function creerAdaptateurGemini({
  cle,
  // Choisi après mesure en conditions réelles, pas par principe :
  //  · gemini-2.0-flash / -lite → 429, quota propre à une génération ancienne ;
  //  · gemini-2.5-flash → 404 « no longer available to new users » ;
  //  · gemini-flash-latest → excellente réponse mais 63 s pour un arbitrage
  //    complet, au-dessus du plafond de 60 s d'une fonction serverless ;
  //  · gemini-3.1-flash-lite → 6 s, même méthode, même conclusion (≈23 mois de
  //    retard sur deux essais, contre 22 pour le gros modèle).
  // La qualité de raisonnement compte moins ici qu'ailleurs : le modèle
  // orchestre, il ne calcule pas.
  modele = "gemini-3.1-flash-lite",
  fetchImpl = globalThis.fetch,
  baseUrl = "https://generativelanguage.googleapis.com/v1beta",
  delaiMs = DELAI_APPEL_MS,
} = {}) {
  return {
    nom: "gemini",
    modele,
    disponible: () => Boolean(cle),

    async envoyer({ systeme, messages, outils }) {
      const contents = messages.map((m) => {
        if (m.role === "outil") {
          return {
            role: "user",
            parts: [
              {
                functionResponse: {
                  // L'identifiant d'appel, quand le modèle en fournit un, doit
                  // être renvoyé pour apparier réponse et appel.
                  ...(m.idGemini ? { id: m.idGemini } : {}),
                  name: m.nomOutil,
                  response: enveloppeResultat(m.contenu),
                },
              },
            ],
          };
        }
        if (m.role === "assistant" && m.appels?.length) {
          return {
            role: "model",
            // Le tour du modèle est réémis TEL QUEL. Les générations récentes
            // joignent une `thoughtSignature` à chaque functionCall : la
            // reconstruire à partir du nom et des arguments la perdrait, et
            // l'API rejette alors la suite de la conversation.
            parts: m.appels.map((a) => a.brut ?? { functionCall: { name: a.nom, args: a.arguments } }),
          };
        }
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.contenu ?? "" }],
        };
      });

      const corps = {
        contents,
        ...(systeme ? { systemInstruction: { parts: [{ text: systeme }] } } : {}),
        ...(outils?.length
          ? { tools: [{ functionDeclarations: outils.map(versDeclarationGemini) }] }
          : {}),
      };

      let reponse;
      try {
        reponse = await fetchImpl(`${baseUrl}/models/${modele}:generateContent?key=${cle}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corps),
          signal: signalDelai(delaiMs),
        });
      } catch (err) {
        throw new ErreurFournisseur("gemini", err.name === "TimeoutError" ? `pas de reponse en ${delaiMs} ms` : err.message);
      }

      if (!reponse.ok) {
        const detail = await lireErreur(reponse);
        if (estQuota(reponse.status)) throw new ErreurQuota("gemini", detail);
        throw new ErreurFournisseur("gemini", `HTTP ${reponse.status} — ${detail}`);
      }

      const data = await reponse.json();
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const appels = parts
        .filter((p) => p.functionCall)
        .map((p, i) => ({
          id: p.functionCall.id ?? `${p.functionCall.name}-${i}`,
          idGemini: p.functionCall.id ?? null,
          nom: p.functionCall.name,
          arguments: p.functionCall.args ?? {},
          // Conservé pour réémission fidèle (voir ci-dessus).
          brut: p,
        }));

      if (appels.length) return { type: "appel_outil", appels };
      return { type: "texte", contenu: parts.map((p) => p.text ?? "").join("").trim() };
    },
  };
}

// ─── GROQ (premier repli) ────────────────────────────────────────────────────

/** Adaptateur Groq — API compatible OpenAI, free tier, modèles ouverts. */
export function creerAdaptateurGroq({
  cle,
  modele = "llama-3.3-70b-versatile",
  fetchImpl = globalThis.fetch,
  baseUrl = "https://api.groq.com/openai/v1",
  delaiMs = DELAI_APPEL_MS,
} = {}) {
  return {
    nom: "groq",
    modele,
    disponible: () => Boolean(cle),
    envoyer: (params) =>
      envoyerFormatOpenAI({
        ...params,
        fournisseur: "groq",
        url: `${baseUrl}/chat/completions`,
        entetes: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
        modele,
        fetchImpl,
        delaiMs,
      }),
  };
}

// ─── OLLAMA (repli local, illimité) ──────────────────────────────────────────

/**
 * Adaptateur Ollama — modèle exécuté sur la machine de l'utilisateur.
 * Aucun quota, et surtout : aucune donnée ne quitte la machine, ce qui rend la
 * promesse de confidentialité de Patrium littéralement vraie dans ce mode.
 */
export function creerAdaptateurOllama({
  modele = "qwen2.5:7b",
  fetchImpl = globalThis.fetch,
  baseUrl = "http://127.0.0.1:11434",
  delaiMs = DELAI_APPEL_MS,
} = {}) {
  return {
    nom: "ollama",
    modele,
    disponible: () => Boolean(baseUrl),

    async envoyer({ systeme, messages, outils }) {
      const corps = {
        model: modele,
        stream: false,
        messages: versMessagesOpenAI({ systeme, messages }),
        ...(outils?.length ? { tools: outils.map(versOutilOpenAI) } : {}),
      };

      let reponse;
      try {
        reponse = await fetchImpl(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corps),
          signal: signalDelai(delaiMs),
        });
      } catch (err) {
        throw new ErreurFournisseur("ollama", err.name === "TimeoutError" ? `pas de reponse en ${delaiMs} ms` : err.message);
      }

      if (!reponse.ok) {
        throw new ErreurFournisseur("ollama", `HTTP ${reponse.status} — ${await lireErreur(reponse)}`);
      }

      const data = await reponse.json();
      const message = data?.message ?? {};
      const appels = (message.tool_calls ?? []).map((t, i) => ({
        id: t.id ?? `${t.function?.name}-${i}`,
        nom: t.function?.name,
        // Ollama renvoie parfois un objet, parfois une chaîne JSON.
        arguments: typeof t.function?.arguments === "string" ? analyserJson(t.function.arguments) : t.function?.arguments ?? {},
      }));

      if (appels.length) return { type: "appel_outil", appels };
      return { type: "texte", contenu: (message.content ?? "").trim() };
    },
  };
}

// ─── Format OpenAI, partagé par Groq ─────────────────────────────────────────

function versMessagesOpenAI({ systeme, messages }) {
  const liste = systeme ? [{ role: "system", content: systeme }] : [];
  for (const m of messages) {
    if (m.role === "outil") {
      liste.push({ role: "tool", tool_call_id: m.idAppel, name: m.nomOutil, content: JSON.stringify(m.contenu) });
    } else if (m.role === "assistant" && m.appels?.length) {
      liste.push({
        role: "assistant",
        content: null,
        tool_calls: m.appels.map((a) => ({
          id: a.id,
          type: "function",
          function: { name: a.nom, arguments: JSON.stringify(a.arguments) },
        })),
      });
    } else {
      liste.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.contenu ?? "" });
    }
  }
  return liste;
}

async function envoyerFormatOpenAI({ systeme, messages, outils, fournisseur, url, entetes, modele, fetchImpl, delaiMs = DELAI_APPEL_MS }) {
  const corps = {
    model: modele,
    messages: versMessagesOpenAI({ systeme, messages }),
    ...(outils?.length ? { tools: outils.map(versOutilOpenAI) } : {}),
  };

  let reponse;
  try {
    reponse = await fetchImpl(url, {
      method: "POST",
      headers: entetes,
      body: JSON.stringify(corps),
      signal: signalDelai(delaiMs),
    });
  } catch (err) {
    throw new ErreurFournisseur(fournisseur, err.name === "TimeoutError" ? `pas de reponse en ${delaiMs} ms` : err.message);
  }

  if (!reponse.ok) {
    const detail = await lireErreur(reponse);
    if (estQuota(reponse.status)) throw new ErreurQuota(fournisseur, detail);
    throw new ErreurFournisseur(fournisseur, `HTTP ${reponse.status} — ${detail}`);
  }

  const data = await reponse.json();
  const message = data?.choices?.[0]?.message ?? {};
  const appels = (message.tool_calls ?? []).map((t, i) => ({
    id: t.id ?? `${t.function?.name}-${i}`,
    nom: t.function?.name,
    arguments: analyserJson(t.function?.arguments),
  }));

  if (appels.length) return { type: "appel_outil", appels };
  return { type: "texte", contenu: (message.content ?? "").trim() };
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

/**
 * Gemini exige un objet en réponse de fonction. Un outil qui renvoie un tableau
 * ou un scalaire est donc enveloppé plutôt que rejeté.
 */
function enveloppeResultat(valeur) {
  if (valeur && typeof valeur === "object" && !Array.isArray(valeur)) return valeur;
  return { resultat: valeur };
}

function analyserJson(texte) {
  if (texte == null) return {};
  if (typeof texte === "object") return texte;
  try {
    return JSON.parse(texte);
  } catch {
    // Un modèle gratuit produit parfois du JSON invalide. On renvoie un objet
    // vide : la validation d'arguments signalera les champs manquants, et le
    // modèle corrigera au tour suivant.
    return {};
  }
}

async function lireErreur(reponse) {
  try {
    const texte = await reponse.text();
    return texte.slice(0, 300);
  } catch {
    return "réponse illisible";
  }
}

/**
 * Construit la chaîne de repli à partir de la configuration disponible.
 * L'ordre est fixe et volontairement non configurable côté client.
 *
 * @returns {Array<object>} adaptateurs disponibles, du préféré au dernier recours
 */
export function construireChaine(env = {}, { fetchImpl = globalThis.fetch } = {}) {
  const candidats = [
    env.GEMINI_API_KEY && creerAdaptateurGemini({ cle: env.GEMINI_API_KEY, modele: env.GEMINI_MODEL, fetchImpl }),
    env.GROQ_API_KEY && creerAdaptateurGroq({ cle: env.GROQ_API_KEY, modele: env.GROQ_MODEL, fetchImpl }),
    env.OLLAMA_BASE_URL && creerAdaptateurOllama({ baseUrl: env.OLLAMA_BASE_URL, modele: env.OLLAMA_MODEL, fetchImpl }),
  ];
  return candidats.filter(Boolean).filter((a) => a.disponible());
}
