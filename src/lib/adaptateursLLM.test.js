import { describe, it, expect, vi } from "vitest";
import {
  creerAdaptateurGemini,
  creerAdaptateurGroq,
  creerAdaptateurOllama,
  construireChaine,
  ErreurQuota,
  ErreurFournisseur,
} from "./adaptateursLLM";

/** Réponse HTTP factice. */
const reponseOk = (data) => ({ ok: true, status: 200, json: async () => data });
const reponseKo = (status, texte = "erreur") => ({ ok: false, status, text: async () => texte });

const OUTILS = [
  {
    nom: "lire_contexte",
    description: "Lit le contexte.",
    parametres: { type: "object", properties: {}, required: [] },
  },
];

const MESSAGES = [{ role: "utilisateur", contenu: "Et si j'achète une voiture ?" }];

// ─── GEMINI ──────────────────────────────────────────────────────────────────

describe("creerAdaptateurGemini", () => {
  const geminiTexte = { candidates: [{ content: { parts: [{ text: "Voici le verdict." }] } }] };
  const geminiOutil = {
    candidates: [{ content: { parts: [{ functionCall: { name: "lire_contexte", args: {} } }] } }] ,
  };

  it("lit une réponse textuelle", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(geminiTexte));
    const a = creerAdaptateurGemini({ cle: "k", fetchImpl });
    expect(await a.envoyer({ messages: MESSAGES, outils: OUTILS })).toEqual({
      type: "texte",
      contenu: "Voici le verdict.",
    });
  });

  it("lit un appel d'outil", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(geminiOutil));
    const a = creerAdaptateurGemini({ cle: "k", fetchImpl });
    const r = await a.envoyer({ messages: MESSAGES, outils: OUTILS });
    expect(r.type).toBe("appel_outil");
    expect(r.appels[0].nom).toBe("lire_contexte");
  });

  it("envoie la clé en paramètre d'URL, jamais dans le corps", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(geminiTexte));
    const a = creerAdaptateurGemini({ cle: "secret-123", fetchImpl });
    await a.envoyer({ messages: MESSAGES, outils: OUTILS });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain("key=secret-123");
    expect(options.body).not.toContain("secret-123");
  });

  it("traduit les schémas d'outils au format functionDeclarations", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(geminiTexte));
    await creerAdaptateurGemini({ cle: "k", fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS });
    const corps = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(corps.tools[0].functionDeclarations[0].name).toBe("lire_contexte");
  });

  it("place le prompt système dans systemInstruction", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(geminiTexte));
    await creerAdaptateurGemini({ cle: "k", fetchImpl }).envoyer({
      systeme: "Tu es un assistant.",
      messages: MESSAGES,
      outils: OUTILS,
    });
    const corps = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(corps.systemInstruction.parts[0].text).toBe("Tu es un assistant.");
  });

  it("traduit un résultat d'outil en functionResponse", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(geminiTexte));
    await creerAdaptateurGemini({ cle: "k", fetchImpl }).envoyer({
      messages: [
        ...MESSAGES,
        { role: "assistant", appels: [{ id: "1", nom: "lire_contexte", arguments: {} }] },
        { role: "outil", idAppel: "1", nomOutil: "lire_contexte", contenu: { base: 100 } },
      ],
      outils: OUTILS,
    });
    const corps = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const dernier = corps.contents[corps.contents.length - 1];
    expect(dernier.parts[0].functionResponse.name).toBe("lire_contexte");
    expect(dernier.parts[0].functionResponse.response).toEqual({ base: 100 });
  });

  it("enveloppe un résultat non-objet, que Gemini refuserait", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(geminiTexte));
    await creerAdaptateurGemini({ cle: "k", fetchImpl }).envoyer({
      messages: [{ role: "outil", idAppel: "1", nomOutil: "x", contenu: [1, 2, 3] }],
      outils: OUTILS,
    });
    const corps = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(corps.contents[0].parts[0].functionResponse.response).toEqual({ resultat: [1, 2, 3] });
  });

  it("lève ErreurQuota sur 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseKo(429, "quota"));
    await expect(
      creerAdaptateurGemini({ cle: "k", fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS })
    ).rejects.toThrow(ErreurQuota);
  });

  it("lève ErreurQuota sur 403", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseKo(403, "resource exhausted"));
    await expect(
      creerAdaptateurGemini({ cle: "k", fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS })
    ).rejects.toThrow(ErreurQuota);
  });

  it("lève ErreurFournisseur sur 500 et sur panne réseau", async () => {
    const surCinqCents = creerAdaptateurGemini({ cle: "k", fetchImpl: vi.fn().mockResolvedValue(reponseKo(500)) });
    await expect(surCinqCents.envoyer({ messages: MESSAGES, outils: OUTILS })).rejects.toThrow(ErreurFournisseur);

    const surReseau = creerAdaptateurGemini({ cle: "k", fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNRESET")) });
    await expect(surReseau.envoyer({ messages: MESSAGES, outils: OUTILS })).rejects.toThrow(ErreurFournisseur);
  });

  it("réémet le tour du modèle tel quel, signature de pensée comprise", async () => {
    // Constaté en conditions réelles : les générations récentes joignent une
    // `thoughtSignature` à chaque functionCall. Reconstruire l'appel à partir
    // du nom et des arguments la perdrait, et l'API rejette alors la suite.
    const brut = {
      functionCall: { name: "lire_contexte", args: {}, id: "sig-1" },
      thoughtSignature: "EoMCCoACARFNMg9",
    };
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(geminiTexte));
    await creerAdaptateurGemini({ cle: "k", fetchImpl }).envoyer({
      messages: [
        { role: "assistant", appels: [{ id: "sig-1", nom: "lire_contexte", arguments: {}, brut }] },
      ],
      outils: OUTILS,
    });
    const corps = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(corps.contents[0].parts[0]).toEqual(brut);
  });

  it("extrait la signature et l'identifiant d'un appel reçu", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      reponseOk({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "lire_contexte", args: {}, id: "xyz" }, thoughtSignature: "abc" }],
            },
          },
        ],
      })
    );
    const r = await creerAdaptateurGemini({ cle: "k", fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS });
    expect(r.appels[0].idGemini).toBe("xyz");
    expect(r.appels[0].brut.thoughtSignature).toBe("abc");
  });

  it("renvoie l'identifiant d'appel dans la functionResponse", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(geminiTexte));
    await creerAdaptateurGemini({ cle: "k", fetchImpl }).envoyer({
      messages: [{ role: "outil", idGemini: "xyz", nomOutil: "lire_contexte", contenu: { base: 100 } }],
      outils: OUTILS,
    });
    const corps = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(corps.contents[0].parts[0].functionResponse.id).toBe("xyz");
  });

  it("borne la durée d'un appel", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(geminiTexte));
    await creerAdaptateurGemini({ cle: "k", fetchImpl, delaiMs: 5000 }).envoyer({ messages: MESSAGES, outils: OUTILS });
    expect(fetchImpl.mock.calls[0][1].signal).toBeDefined();
  });

  it("traite un dépassement de délai comme un fournisseur indisponible, donc repliable", async () => {
    const expiration = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    const fetchImpl = vi.fn().mockRejectedValue(expiration);
    await expect(
      creerAdaptateurGemini({ cle: "k", fetchImpl, delaiMs: 10 }).envoyer({ messages: MESSAGES, outils: OUTILS })
    ).rejects.toThrow(ErreurFournisseur);
  });

  it("cible un modèle assez rapide pour tenir dans une fonction serverless", () => {
    // Mesuré : gemini-flash-latest met 63 s pour un arbitrage complet, au-delà
    // du plafond de 60 s ; flash-lite met 6 s pour la même conclusion.
    expect(creerAdaptateurGemini({ cle: "k" }).modele).toBe("gemini-3.1-flash-lite");
  });

  it("se déclare indisponible sans clé", () => {
    expect(creerAdaptateurGemini({}).disponible()).toBe(false);
    expect(creerAdaptateurGemini({ cle: "k" }).disponible()).toBe(true);
  });
});

// ─── GROQ ────────────────────────────────────────────────────────────────────

describe("creerAdaptateurGroq", () => {
  const groqTexte = { choices: [{ message: { content: "Réponse." } }] };

  it("lit une réponse textuelle", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(groqTexte));
    const r = await creerAdaptateurGroq({ cle: "k", fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS });
    expect(r).toEqual({ type: "texte", contenu: "Réponse." });
  });

  it("analyse les arguments d'outil, transmis en chaîne JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      reponseOk({
        choices: [
          {
            message: {
              tool_calls: [{ id: "c1", function: { name: "simuler_credit", arguments: '{"montant":30}' } }],
            },
          },
        ],
      })
    );
    const r = await creerAdaptateurGroq({ cle: "k", fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS });
    expect(r.appels[0].arguments).toEqual({ montant: 30 });
  });

  it("survit à un JSON d'arguments invalide plutôt que de planter", async () => {
    // Un modèle gratuit produit parfois du JSON malformé : la validation
    // d'arguments prendra le relais et le modèle corrigera au tour suivant.
    const fetchImpl = vi.fn().mockResolvedValue(
      reponseOk({
        choices: [{ message: { tool_calls: [{ id: "c1", function: { name: "x", arguments: "{pas du json" } }] } }],
      })
    );
    const r = await creerAdaptateurGroq({ cle: "k", fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS });
    expect(r.appels[0].arguments).toEqual({});
  });

  it("envoie la clé en en-tête Authorization", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(groqTexte));
    await creerAdaptateurGroq({ cle: "abc", fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer abc");
  });

  it("place le prompt système en premier message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk(groqTexte));
    await creerAdaptateurGroq({ cle: "k", fetchImpl }).envoyer({
      systeme: "Consignes.",
      messages: MESSAGES,
      outils: OUTILS,
    });
    const corps = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(corps.messages[0]).toEqual({ role: "system", content: "Consignes." });
  });

  it("lève ErreurQuota sur 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseKo(429));
    await expect(
      creerAdaptateurGroq({ cle: "k", fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS })
    ).rejects.toThrow(ErreurQuota);
  });
});

// ─── OLLAMA ──────────────────────────────────────────────────────────────────

describe("creerAdaptateurOllama", () => {
  it("lit une réponse textuelle", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk({ message: { content: "Local." } }));
    const r = await creerAdaptateurOllama({ fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS });
    expect(r).toEqual({ type: "texte", contenu: "Local." });
  });

  it("accepte des arguments d'outil déjà désérialisés", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      reponseOk({ message: { tool_calls: [{ function: { name: "simuler_credit", arguments: { montant: 30 } } }] } })
    );
    const r = await creerAdaptateurOllama({ fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS });
    expect(r.appels[0].arguments).toEqual({ montant: 30 });
  });

  it("n'envoie aucune clé — le modèle tourne en local", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk({ message: { content: "x" } }));
    await creerAdaptateurOllama({ fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain("127.0.0.1");
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("désactive le streaming, incompatible avec la boucle", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reponseOk({ message: { content: "x" } }));
    await creerAdaptateurOllama({ fetchImpl }).envoyer({ messages: MESSAGES, outils: OUTILS });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).stream).toBe(false);
  });
});

// ─── CHAÎNE ──────────────────────────────────────────────────────────────────

describe("construireChaine", () => {
  it("respecte l'ordre Gemini → Groq → Ollama", () => {
    const chaine = construireChaine({
      GEMINI_API_KEY: "g",
      GROQ_API_KEY: "q",
      OLLAMA_BASE_URL: "http://localhost:11434",
    });
    expect(chaine.map((a) => a.nom)).toEqual(["gemini", "groq", "ollama"]);
  });

  it("omet les fournisseurs non configurés", () => {
    expect(construireChaine({ GROQ_API_KEY: "q" }).map((a) => a.nom)).toEqual(["groq"]);
  });

  it("renvoie une chaîne vide sans configuration — le mode dégradé prendra le relais", () => {
    expect(construireChaine({})).toEqual([]);
  });

  it("n'instancie aucun fournisseur payant, même si on le lui demande", () => {
    // La contrainte est structurelle : aucune variable d'environnement ne peut
    // activer un modèle facturé à l'usage, parce qu'aucun adaptateur n'existe.
    const chaine = construireChaine({
      ANTHROPIC_API_KEY: "sk-ant-xxx",
      OPENAI_API_KEY: "sk-xxx",
      CLAUDE_API_KEY: "sk-ant-yyy",
    });
    expect(chaine).toEqual([]);
  });
});
