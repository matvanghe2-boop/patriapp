import { describe, it, expect } from "vitest";
import {
  construireContexteAnonymise,
  auditerContexte,
  rebaser,
  versBase100,
  VERSION_CONTEXTE,
  REGLES_ANONYMISATION,
} from "./anonymiser";

// L'anonymiseur est la pièce sur laquelle repose toute la promesse de
// confidentialité d'Horizon. Les tests vérifient donc deux choses distinctes :
// que le contexte produit est numériquement juste, et surtout qu'il ne contient
// RIEN de ce qui doit rester dans le navigateur.

/** État Patrium réaliste, volontairement truffé de données identifiantes. */
const ETAT = {
  profile: { monthly_income: 3000, monthly_expenses: 1800 },
  livrets: [
    { id: "la", name: "Livret A", balance: 9000, rate: 0.017, envelope: "Livret" },
    { id: "av", name: "Assurance-Vie Linxea Spirit", balance: 15000, rate: 0.025, envelope: "AV" },
  ],
  bourse: {
    envelope: "PEA",
    cash_pocket: 1000,
    positions: [
      { id: "cw8", ticker: "CW8.PA", name: "Amundi MSCI World", quantity: 100, current_price: 400, type: "ETF" },
      { id: "ai", ticker: "AI.PA", name: "Air Liquide", quantity: 100, current_price: 150, type: "Action" },
    ],
  },
  dettes: [{ id: "d1", name: "Crédit auto", balance: 5000 }],
  cash: 2000,
  enveloppes: [
    { id: "e1", label: "Projet Immo Bordeaux", amount: 12000, colorIdx: 0 },
    { id: "e2", label: "Voyage Japon", amount: 3000, colorIdx: 1 },
  ],
  historyPast: [
    { date: "2026-07-01", label: "J1", value: 70000 },
    { date: "2026-08-01", label: "J31", value: 72000 },
  ],
  patrimoineNet: 72000,
};

// Actifs : monétaire 9 000 + 1 000 + 2 000 = 12 000 ; obligations 15 000 ;
// actions 100×400 + 100×150 = 55 000. Total = 82 000.

describe("construireContexteAnonymise — justesse", () => {
  it("répartit les actifs dans les quatre classes", () => {
    const { contexte } = construireContexteAnonymise(ETAT);
    const a = contexte.allocationPct;
    expect(a.actions).toBeCloseTo((55000 / 82000) * 100, 1);
    expect(a.obligations).toBeCloseTo((15000 / 82000) * 100, 1);
    expect(a.monetaire).toBeCloseTo((12000 / 82000) * 100, 1);
    expect(a.immobilier).toBe(0);
  });

  it("répartit 100 % de l'allocation", () => {
    const { contexte } = construireContexteAnonymise(ETAT);
    const somme = Object.values(contexte.allocationPct).reduce((s, v) => s + v, 0);
    expect(somme).toBeCloseTo(100, 1);
  });

  it("classe le fonds euro d'assurance-vie en obligataire, pas en monétaire", () => {
    // Le classer en monétaire sous-estimerait rendement et volatilité.
    const { contexte } = construireContexteAnonymise(ETAT);
    expect(contexte.allocationPct.obligations).toBeGreaterThan(0);
  });

  it("réduit revenus et dépenses à un taux d'épargne", () => {
    // (3 000 − 1 800) / 3 000 = 40 %
    const { contexte } = construireContexteAnonymise(ETAT);
    expect(contexte.flux.tauxEpargnePct).toBeCloseTo(40, 1);
  });

  it("exprime l'épargne de sécurité en mois de dépenses", () => {
    // 12 000 de monétaire / 1 800 de dépenses = 6,7 mois
    const { contexte } = construireContexteAnonymise(ETAT);
    expect(contexte.reserves.epargneSecuriteMois).toBeCloseTo(6.7, 1);
  });

  it("calcule le taux d'endettement sur le patrimoine net", () => {
    // 5 000 / 72 000 = 6,9 %
    const { contexte } = construireContexteAnonymise(ETAT);
    expect(contexte.endettement.tauxEndettementPct).toBeCloseTo(6.9, 1);
  });

  it("réduit chaque objectif à une part du patrimoine", () => {
    const { contexte } = construireContexteAnonymise(ETAT);
    expect(contexte.objectifs).toHaveLength(2);
    // 12 000 / 72 000 = 16,67 %
    expect(contexte.objectifs[0].partPatrimoinePct).toBeCloseTo(16.67, 1);
  });

  it("mesure la profondeur de l'historique en mois", () => {
    const { contexte } = construireContexteAnonymise(ETAT);
    expect(contexte.historique.profondeurMois).toBe(1);
  });

  it("conserve les types d'enveloppes fiscales, sans montant", () => {
    const { contexte } = construireContexteAnonymise(ETAT);
    expect(contexte.enveloppesFiscales).toEqual(["AV", "Livret", "PEA"]);
  });

  it("porte un numéro de version de schéma", () => {
    const { contexte } = construireContexteAnonymise(ETAT);
    expect(contexte.version).toBe(VERSION_CONTEXTE);
  });
});

describe("construireContexteAnonymise — confidentialité", () => {
  /** Tout le contexte, aplati en texte : rien ne doit s'y cacher. */
  const texte = () => JSON.stringify(construireContexteAnonymise(ETAT).contexte);

  it("ne laisse fuir aucun montant en euros", () => {
    const t = texte();
    for (const montant of ["9000", "15000", "55000", "72000", "3000", "1800", "12000", "2000"]) {
      expect(t).not.toContain(montant);
    }
  });

  it("ne laisse fuir aucun ticker ni nom d'actif", () => {
    const t = texte();
    expect(t).not.toContain("CW8");
    expect(t).not.toContain("AI.PA");
    expect(t).not.toContain("Amundi");
    expect(t).not.toContain("Air Liquide");
  });

  it("ne laisse fuir aucun nom de compte", () => {
    const t = texte();
    expect(t).not.toContain("Livret A");
    expect(t).not.toContain("Linxea");
    expect(t).not.toContain("Crédit auto");
  });

  it("ne laisse fuir aucun libellé d'objectif", () => {
    const t = texte();
    expect(t).not.toContain("Bordeaux");
    expect(t).not.toContain("Japon");
    expect(t).not.toContain("Projet Immo");
  });

  it("ne laisse fuir aucun identifiant technique", () => {
    const t = texte();
    for (const id of ['"la"', '"av"', '"cw8"', '"e1"', '"d1"']) {
      expect(t).not.toContain(id);
    }
  });

  it("produit un contexte que son propre audit juge sain", () => {
    const { contexte } = construireContexteAnonymise(ETAT);
    const { sain, alertes } = auditerContexte(contexte);
    expect(alertes).toEqual([]);
    expect(sain).toBe(true);
  });

  it("fonctionne en liste blanche : un champ inconnu de Patrium ne transite pas", () => {
    const { contexte } = construireContexteAnonymise({
      ...ETAT,
      champSecretAjouteDemain: "iban FR76 3000 4000 5000",
      profile: { ...ETAT.profile, email: "mat@example.com" },
    });
    const t = JSON.stringify(contexte);
    expect(t).not.toContain("iban");
    expect(t).not.toContain("example.com");
  });
});

describe("construireContexteAnonymise — cas limites", () => {
  it("ne plante pas sur un état vide", () => {
    const { contexte } = construireContexteAnonymise({});
    expect(contexte.version).toBe(VERSION_CONTEXTE);
    expect(contexte.allocationPct.actions).toBe(0);
  });

  it("ne plante pas sans argument", () => {
    expect(() => construireContexteAnonymise()).not.toThrow();
  });

  it("laisse l'épargne de sécurité à null sans dépenses connues", () => {
    const { contexte } = construireContexteAnonymise({ ...ETAT, profile: {} });
    expect(contexte.reserves.epargneSecuriteMois).toBeNull();
  });

  it("retombe sur le total des actifs si le patrimoine net est absent", () => {
    const { facteurBase100 } = construireContexteAnonymise({ ...ETAT, patrimoineNet: 0 });
    expect(facteurBase100).toBeCloseTo(820, 6); // 82 000 / 100
  });

  it("ignore un objectif à montant nul", () => {
    const { contexte } = construireContexteAnonymise({
      ...ETAT,
      enveloppes: [{ id: "x", label: "Vide", amount: 0 }],
    });
    expect(contexte.objectifs).toEqual([]);
  });
});

describe("mode B — montants réels (jalon 7)", () => {
  const modeB = () => construireContexteAnonymise({ ...ETAT, montantsReels: true });

  it("transmet le patrimoine en euros au lieu de la base 100", () => {
    const { contexte } = modeB();
    expect(contexte.unite).toBe("euros");
    expect(contexte.patrimoine).toBe(72000);
  });

  it("ramène le facteur de conversion à 1 : plus rien à re-multiplier", () => {
    expect(modeB().facteurBase100).toBe(1);
  });

  it("écarte toujours noms, tickers, libellés et identifiants", () => {
    // Le mode B change l'unité des montants, PAS le périmètre de ce qui est
    // envoyé. C'est la confusion la plus facile à faire, et la plus coûteuse.
    const t = JSON.stringify(modeB().contexte);
    for (const secret of ["CW8", "Air Liquide", "Livret A", "Linxea", "Bordeaux", "Japon", '"cw8"']) {
      expect(t).not.toContain(secret);
    }
  });

  it("laisse l'allocation en pourcentages dans les deux modes", () => {
    const { contexte } = modeB();
    expect(contexte.allocationPct.actions).toBeCloseTo((55000 / 82000) * 100, 1);
  });

  it("reste en base 100 tant que le mode n'est pas demandé", () => {
    const { contexte, facteurBase100 } = construireContexteAnonymise(ETAT);
    expect(contexte.unite).toBe("base100");
    expect(contexte.patrimoine).toBe(100);
    expect(facteurBase100).toBeCloseTo(720, 6);
  });
});

describe("auditerContexte — autorisation des montants", () => {
  it("refuse un montant tant qu'il n'est pas autorisé", () => {
    expect(auditerContexte({ patrimoine: 72000 }).sain).toBe(false);
  });

  it("accepte les montants quand le mode B est déclaré", () => {
    expect(auditerContexte({ patrimoine: 72000 }, { autoriserMontants: true }).sain).toBe(true);
  });

  it("continue de refuser un ticker même en mode B", () => {
    // Lever le seuil des montants ne doit pas lever la détection d'identifiants.
    const { sain, alertes } = auditerContexte({ ligne: "CW8.PA" }, { autoriserMontants: true });
    expect(sain).toBe(false);
    expect(alertes[0].motif).toBe("ticker boursier");
  });

  it("continue de refuser e-mails, ISIN et clés identifiantes en mode B", () => {
    const opt = { autoriserMontants: true };
    expect(auditerContexte({ c: "mat@example.com" }, opt).sain).toBe(false);
    expect(auditerContexte({ c: "FR0010315770" }, opt).sain).toBe(false);
    expect(auditerContexte({ compte: { name: "x" } }, opt).sain).toBe(false);
  });

  it("valide le contexte réellement produit en mode B", () => {
    const { contexte } = construireContexteAnonymise({ ...ETAT, montantsReels: true });
    expect(auditerContexte(contexte, { autoriserMontants: true }).alertes).toEqual([]);
  });
});

describe("rebaser / versBase100", () => {
  it("reconvertit une valeur base 100 en euros", () => {
    const { facteurBase100 } = construireContexteAnonymise(ETAT); // 72 000 / 100 = 720
    expect(rebaser(100, facteurBase100)).toBeCloseTo(72000, 6);
    expect(rebaser(150, facteurBase100)).toBeCloseTo(108000, 6);
  });

  it("est l'inverse exact de versBase100", () => {
    const { facteurBase100 } = construireContexteAnonymise(ETAT);
    expect(rebaser(versBase100(28000, facteurBase100), facteurBase100)).toBeCloseTo(28000, 6);
  });

  it("renvoie 0 sur un facteur absent plutôt que NaN ou Infinity", () => {
    expect(rebaser(100, 0)).toBe(0);
    expect(versBase100(28000, 0)).toBe(0);
  });
});

describe("auditerContexte", () => {
  it("repère un montant en euros oublié", () => {
    const { alertes } = auditerContexte({ patrimoine: 72000 });
    expect(alertes).toHaveLength(1);
    expect(alertes[0].motif).toBe("nombre trop grand pour un ratio");
    expect(alertes[0].chemin).toBe("patrimoine");
  });

  it("repère un ticker", () => {
    const { alertes } = auditerContexte({ positions: ["CW8.PA"] });
    expect(alertes[0].motif).toBe("ticker boursier");
    expect(alertes[0].chemin).toBe("positions[0]");
  });

  it("repère un code ISIN", () => {
    const { alertes } = auditerContexte({ ligne: "FR0010315770" });
    expect(alertes[0].motif).toBe("code ISIN");
  });

  it("repère une adresse e-mail", () => {
    const { alertes } = auditerContexte({ contact: "mat@example.com" });
    expect(alertes[0].motif).toBe("adresse e-mail");
  });

  it("repère une clé identifiante même si sa valeur semble anodine", () => {
    const { alertes } = auditerContexte({ compte: { name: "x" } });
    expect(alertes.some((a) => a.motif === "clé potentiellement identifiante")).toBe(true);
  });

  it("descend dans les structures imbriquées", () => {
    const { alertes } = auditerContexte({ a: { b: { c: [{ d: 99999 }] } } });
    expect(alertes[0].chemin).toBe("a.b.c[0].d");
  });

  it("ne signale rien sur un objet de ratios légitime", () => {
    const { sain } = auditerContexte({ allocationPct: { actions: 67.1 }, base: 100 });
    expect(sain).toBe(true);
  });
});

describe("REGLES_ANONYMISATION", () => {
  it("documente chaque traitement pour le panneau de transparence", () => {
    expect(REGLES_ANONYMISATION.length).toBeGreaterThanOrEqual(6);
    for (const r of REGLES_ANONYMISATION) {
      expect(r.donnee).toBeTruthy();
      expect(r.traitement).toBeTruthy();
    }
  });
});
