import { describe, it, expect, vi } from "vitest";
import { executerBoucle, repondreAHypothese, ErreurModeDegrade, MAX_ITERATIONS } from "./orchestrateur";
import { ErreurQuota, ErreurFournisseur } from "./adaptateursLLM";
import {
  REGISTRE_OUTILS,
  schemasOutils,
  trouverOutil,
  validerArguments,
  executerOutil,
  PROMPT_SYSTEME,
} from "./horizonOutils";

// Un adaptateur factice remplace le fournisseur : la boucle doit être testable
// sans réseau, sans clé et sans quota. Chaque scénario est une liste de
// réponses jouées dans l'ordre.
function adaptateurFactice(nom, reponses) {
  const file = [...reponses];
  const appelsRecus = [];
  return {
    nom,
    appelsRecus,
    disponible: () => true,
    envoyer: vi.fn(async (params) => {
      appelsRecus.push(params);
      const suivante = file.shift();
      if (suivante instanceof Error) throw suivante;
      return suivante ?? { type: "texte", contenu: "fin" };
    }),
  };
}

const CONTEXTE = {
  version: 1,
  base: 100,
  patrimoineBase100: 100,
  allocationPct: { actions: 60, obligations: 20, monetaire: 20, immobilier: 0 },
  flux: { tauxEpargnePct: 40 },
};

// ─── REGISTRE D'OUTILS ───────────────────────────────────────────────────────

describe("registre d'outils", () => {
  it("n'expose aucun outil d'écriture", () => {
    // La lecture seule tient à l'absence de capacité, pas à une consigne.
    const interdits = /(creer|ajouter|modifier|supprimer|ecrire|enregistrer|effacer)/i;
    for (const outil of REGISTRE_OUTILS) {
      expect(outil.nom).not.toMatch(interdits);
    }
  });

  it("décrit quand appeler chaque outil, pas seulement ce qu'il fait", () => {
    for (const outil of REGISTRE_OUTILS) {
      expect(outil.description.length).toBeGreaterThan(80);
      expect(outil.description).toMatch(/appelle|utilise|à utiliser/i);
    }
  });

  it("donne un schéma valide à chaque outil", () => {
    for (const outil of REGISTRE_OUTILS) {
      expect(outil.parametres.type).toBe("object");
      expect(outil.parametres.properties).toBeTypeOf("object");
      expect(typeof outil.executer).toBe("function");
    }
  });

  it("n'envoie jamais les exécuteurs au fournisseur", () => {
    for (const schema of schemasOutils()) {
      expect(schema.executer).toBeUndefined();
      expect(Object.keys(schema).sort()).toEqual(["description", "nom", "parametres"]);
    }
  });

  it("expose lire_contexte, que le prompt impose d'appeler en premier", () => {
    expect(trouverOutil("lire_contexte")).toBeTruthy();
    expect(PROMPT_SYSTEME).toContain("lire_contexte");
  });

  it("rappelle au modèle qu'il ne calcule pas lui-même", () => {
    expect(PROMPT_SYSTEME).toMatch(/ne calcules JAMAIS/i);
    expect(PROMPT_SYSTEME).toMatch(/BASE 100/);
  });
});

describe("validerArguments", () => {
  const outil = trouverOutil("simuler_credit");

  it("accepte des arguments conformes", () => {
    expect(validerArguments(outil, { montant: 30, tauxAnnuel: 4.2, dureeMois: 60 }).valide).toBe(true);
  });

  it("signale un paramètre requis manquant", () => {
    const { valide, erreurs } = validerArguments(outil, { montant: 30 });
    expect(valide).toBe(false);
    expect(erreurs.join(" ")).toMatch(/tauxAnnuel/);
  });

  it("signale un type incorrect", () => {
    const { erreurs } = validerArguments(outil, { montant: "trente", tauxAnnuel: 4, dureeMois: 60 });
    expect(erreurs.join(" ")).toMatch(/doit être un nombre/);
  });

  it("signale une valeur hors énumération", () => {
    const tco = trouverOutil("cout_total_possession");
    const { erreurs } = validerArguments(tco, { prixAchat: 30, horizonAnnees: 5, categorie: "bateau" });
    expect(erreurs.join(" ")).toMatch(/doit valoir l'une de/);
  });

  it("tolère un paramètre surnuméraire plutôt que de rejeter l'appel", () => {
    expect(validerArguments(outil, { montant: 30, tauxAnnuel: 4, dureeMois: 60, bavardage: 1 }).valide).toBe(true);
  });
});

describe("executerOutil", () => {
  it("exécute un outil et renvoie son résultat", () => {
    const r = executerOutil("simuler_credit", { montant: 30, tauxAnnuel: 4.2, dureeMois: 60 }, CONTEXTE);
    expect(r.mensualite).toBeGreaterThan(0);
  });

  it("allège le tableau d'amortissement, trop volumineux pour le contexte", () => {
    const r = executerOutil("simuler_credit", { montant: 30, tauxAnnuel: 4.2, dureeMois: 60 }, CONTEXTE);
    expect(r.tableauAmortissement).toBeUndefined();
    expect(r.nombreEcheances).toBe(60);
  });

  it("renvoie le contexte pour lire_contexte", () => {
    expect(executerOutil("lire_contexte", {}, CONTEXTE)).toEqual(CONTEXTE);
  });

  it("renvoie une erreur exploitable sur un outil inconnu, sans lever", () => {
    const r = executerOutil("faire_le_cafe", {}, CONTEXTE);
    expect(r.erreur).toMatch(/Outil inconnu/);
    expect(r.erreur).toMatch(/simuler_credit/); // la liste aide le modèle à corriger
  });

  it("renvoie une erreur exploitable sur des arguments invalides", () => {
    const r = executerOutil("simuler_credit", { montant: 30 }, CONTEXTE);
    expect(r.erreur).toMatch(/Arguments invalides/);
  });

  it("ne laisse pas une exception d'outil casser la boucle", () => {
    const registre = [
      { nom: "explose", description: "x", parametres: { type: "object", properties: {} }, executer: () => { throw new Error("boum"); } },
    ];
    const r = executerOutil("explose", {}, CONTEXTE, registre);
    expect(r.erreur).toMatch(/boum/);
  });
});

// ─── BOUCLE ──────────────────────────────────────────────────────────────────

describe("executerBoucle", () => {
  it("renvoie directement une réponse textuelle", async () => {
    const a = adaptateurFactice("faux", [{ type: "texte", contenu: "Voici le verdict." }]);
    const r = await executerBoucle({ adaptateurs: [a], contexte: CONTEXTE, messages: [] });
    expect(r.type).toBe("texte");
    expect(r.contenu).toBe("Voici le verdict.");
    expect(r.iterations).toBe(1);
  });

  it("exécute un outil puis boucle jusqu'à la réponse", async () => {
    const a = adaptateurFactice("faux", [
      { type: "appel_outil", appels: [{ id: "1", nom: "lire_contexte", arguments: {} }] },
      { type: "texte", contenu: "Ton allocation est à 60 % actions." },
    ]);
    const r = await executerBoucle({ adaptateurs: [a], contexte: CONTEXTE, messages: [] });
    expect(r.contenu).toMatch(/60 %/);
    expect(r.journal).toHaveLength(1);
    expect(r.journal[0].outil).toBe("lire_contexte");
    expect(r.journal[0].sorties).toEqual(CONTEXTE);
  });

  it("réinjecte le résultat de l'outil dans l'historique envoyé au modèle", async () => {
    const a = adaptateurFactice("faux", [
      { type: "appel_outil", appels: [{ id: "1", nom: "lire_contexte", arguments: {} }] },
      { type: "texte", contenu: "ok" },
    ]);
    await executerBoucle({ adaptateurs: [a], contexte: CONTEXTE, messages: [] });

    const second = a.appelsRecus[1].messages;
    expect(second.some((m) => m.role === "assistant" && m.appels)).toBe(true);
    expect(second.some((m) => m.role === "outil" && m.nomOutil === "lire_contexte")).toBe(true);
  });

  it("exécute plusieurs outils d'un même tour", async () => {
    const a = adaptateurFactice("faux", [
      {
        type: "appel_outil",
        appels: [
          { id: "1", nom: "lire_contexte", arguments: {} },
          { id: "2", nom: "cout_opportunite", arguments: { montant: 30, rendementAnnuelPct: 8, horizonAnnees: 10 } },
        ],
      },
      { type: "texte", contenu: "ok" },
    ]);
    const r = await executerBoucle({ adaptateurs: [a], contexte: CONTEXTE, messages: [] });
    expect(r.journal.map((j) => j.outil)).toEqual(["lire_contexte", "cout_opportunite"]);
  });

  it("journalise entrées et sorties de chaque appel", async () => {
    const a = adaptateurFactice("faux", [
      { type: "appel_outil", appels: [{ id: "1", nom: "cout_opportunite", arguments: { montant: 30, rendementAnnuelPct: 8, horizonAnnees: 10 } }] },
      { type: "texte", contenu: "ok" },
    ]);
    const r = await executerBoucle({ adaptateurs: [a], contexte: CONTEXTE, messages: [] });
    expect(r.journal[0].entrees).toEqual({ montant: 30, rendementAnnuelPct: 8, horizonAnnees: 10 });
    expect(r.journal[0].sorties.valeurFutureNominale).toBeGreaterThan(30);
  });

  it("transmet l'erreur d'un outil au modèle au lieu d'interrompre", async () => {
    const a = adaptateurFactice("faux", [
      { type: "appel_outil", appels: [{ id: "1", nom: "simuler_credit", arguments: { montant: 30 } }] },
      { type: "texte", contenu: "Je corrige." },
    ]);
    const r = await executerBoucle({ adaptateurs: [a], contexte: CONTEXTE, messages: [] });
    expect(r.journal[0].sorties.erreur).toMatch(/Arguments invalides/);
    expect(r.type).toBe("texte");
  });

  it("suspend la boucle sur demander_hypothese", async () => {
    const a = adaptateurFactice("faux", [
      {
        type: "appel_outil",
        appels: [{ id: "1", nom: "demander_hypothese", arguments: { question: "Quel taux de crédit ?" } }],
      },
    ]);
    const r = await executerBoucle({ adaptateurs: [a], contexte: CONTEXTE, messages: [] });
    expect(r.type).toBe("question");
    expect(r.question.question).toBe("Quel taux de crédit ?");
    expect(r.historique).toBeTruthy();
  });

  it("n'exécute pas les autres outils du tour quand une hypothèse manque", async () => {
    const a = adaptateurFactice("faux", [
      {
        type: "appel_outil",
        appels: [
          { id: "1", nom: "demander_hypothese", arguments: { question: "Quel taux ?" } },
          { id: "2", nom: "lire_contexte", arguments: {} },
        ],
      },
    ]);
    const r = await executerBoucle({ adaptateurs: [a], contexte: CONTEXTE, messages: [] });
    expect(r.journal.filter((j) => j.outil === "lire_contexte")).toHaveLength(0);
  });

  it("plafonne le nombre d'itérations", async () => {
    const boucleInfinie = Array.from({ length: 50 }, () => ({
      type: "appel_outil",
      appels: [{ id: "x", nom: "lire_contexte", arguments: {} }],
    }));
    const a = adaptateurFactice("faux", boucleInfinie);
    const r = await executerBoucle({ adaptateurs: [a], contexte: CONTEXTE, messages: [] });
    expect(r.plafondAtteint).toBe(true);
    expect(r.iterations).toBe(MAX_ITERATIONS);
  });
});

// ─── CHAÎNE DE REPLI ─────────────────────────────────────────────────────────

describe("executerBoucle — repli gratuit", () => {
  it("bascule sur le fournisseur suivant en cas de quota épuisé", async () => {
    const gemini = adaptateurFactice("gemini", [new ErreurQuota("gemini")]);
    const groq = adaptateurFactice("groq", [{ type: "texte", contenu: "Réponse de secours." }]);

    const r = await executerBoucle({ adaptateurs: [gemini, groq], contexte: CONTEXTE, messages: [] });
    expect(r.fournisseur).toBe("groq");
    expect(r.contenu).toBe("Réponse de secours.");
    expect(r.echecs[0]).toMatchObject({ fournisseur: "gemini", motif: "ErreurQuota" });
  });

  it("bascule aussi sur fournisseur indisponible", async () => {
    const gemini = adaptateurFactice("gemini", [new ErreurFournisseur("gemini", "HTTP 500")]);
    const groq = adaptateurFactice("groq", [{ type: "texte", contenu: "ok" }]);
    const r = await executerBoucle({ adaptateurs: [gemini, groq], contexte: CONTEXTE, messages: [] });
    expect(r.fournisseur).toBe("groq");
  });

  it("conserve l'historique en changeant de fournisseur", async () => {
    const gemini = adaptateurFactice("gemini", [
      { type: "appel_outil", appels: [{ id: "1", nom: "lire_contexte", arguments: {} }] },
      new ErreurQuota("gemini"),
    ]);
    const ollama = adaptateurFactice("ollama", [{ type: "texte", contenu: "Je reprends." }]);

    const r = await executerBoucle({ adaptateurs: [gemini, ollama], contexte: CONTEXTE, messages: [] });
    // Le fournisseur de secours doit voir le travail déjà fait.
    const vu = ollama.appelsRecus[0].messages;
    expect(vu.some((m) => m.role === "outil" && m.nomOutil === "lire_contexte")).toBe(true);
    expect(r.contenu).toBe("Je reprends.");
  });

  it("ne consomme pas une itération pour un repli", async () => {
    const a = adaptateurFactice("a", [new ErreurQuota("a")]);
    const b = adaptateurFactice("b", [{ type: "texte", contenu: "ok" }]);
    const r = await executerBoucle({ adaptateurs: [a, b], contexte: CONTEXTE, messages: [] });
    expect(r.iterations).toBe(1);
  });

  it("lève ErreurModeDegrade quand toute la chaîne échoue", async () => {
    const a = adaptateurFactice("a", [new ErreurQuota("a")]);
    const b = adaptateurFactice("b", [new ErreurFournisseur("b")]);
    await expect(executerBoucle({ adaptateurs: [a, b], contexte: CONTEXTE, messages: [] })).rejects.toThrow(
      ErreurModeDegrade
    );
  });

  it("lève ErreurModeDegrade si aucun fournisseur n'est configuré", async () => {
    await expect(executerBoucle({ adaptateurs: [], contexte: CONTEXTE })).rejects.toThrow(ErreurModeDegrade);
  });

  it("ne masque pas une erreur de programmation derrière un repli", async () => {
    const a = adaptateurFactice("a", [new TypeError("bug interne")]);
    const b = adaptateurFactice("b", [{ type: "texte", contenu: "ok" }]);
    await expect(executerBoucle({ adaptateurs: [a, b], contexte: CONTEXTE })).rejects.toThrow("bug interne");
  });

  it("signale chaque étape à l'appelant", async () => {
    const etapes = [];
    const a = adaptateurFactice("a", [
      { type: "appel_outil", appels: [{ id: "1", nom: "lire_contexte", arguments: {} }] },
      { type: "texte", contenu: "ok" },
    ]);
    await executerBoucle({ adaptateurs: [a], contexte: CONTEXTE, onEtape: (e) => etapes.push(e.etape) });
    expect(etapes).toContain("requete_modele");
    expect(etapes).toContain("outil");
  });
});

describe("repondreAHypothese", () => {
  it("ajoute la réponse de l'utilisateur à l'historique", () => {
    const historique = [{ role: "utilisateur", contenu: "et si j'achète une voiture ?" }];
    const suite = repondreAHypothese(historique, { question: "Quel taux ?" }, "4,2 %");
    expect(suite).toHaveLength(2);
    expect(suite[1].contenu).toMatch(/Quel taux/);
    expect(suite[1].contenu).toMatch(/4,2 %/);
  });
});
