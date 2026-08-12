import { describe, it, expect } from "vitest";
import {
  placeDuTicker,
  verifierEligibilite,
  tauxRetenue,
  dividendeNet,
} from "./eligibilitePea";

describe("placeDuTicker", () => {
  it("lit le suffixe Yahoo", () => {
    expect(placeDuTicker("AI.PA")).toMatchObject({ pays: "France", eee: true });
    expect(placeDuTicker("ASML.AS")).toMatchObject({ pays: "Pays-Bas", eee: true });
    expect(placeDuTicker("ALV.DE")).toMatchObject({ pays: "Allemagne", eee: true });
  });

  it("traite l'absence de suffixe comme une cotation américaine", () => {
    expect(placeDuTicker("AAPL")).toMatchObject({ pays: "États-Unis", eee: false });
  });

  it("ne devine pas un suffixe inconnu", () => {
    // Mieux vaut ne rien affirmer qu'affirmer à tort une éligibilité.
    expect(placeDuTicker("TOTO.ZZ")).toBeNull();
  });

  it("tolère la casse et les espaces", () => {
    expect(placeDuTicker("  ai.pa  ")).toMatchObject({ pays: "France" });
  });

  it("ne renvoie rien pour une entrée vide", () => {
    expect(placeDuTicker("")).toBeNull();
    expect(placeDuTicker(null)).toBeNull();
  });
});

describe("verifierEligibilite", () => {
  it("accepte une société de l'EEE dans un PEA", () => {
    expect(verifierEligibilite("AI.PA", "PEA")).toMatchObject({ eligible: true, pays: "France" });
    expect(verifierEligibilite("ASML.AS", "PEA")).toMatchObject({ eligible: true });
  });

  it("refuse une société hors EEE dans un PEA", () => {
    const r = verifierEligibilite("AAPL", "PEA");
    expect(r.eligible).toBe(false);
    expect(r.pays).toBe("États-Unis");
    expect(r.motif).toMatch(/hors Espace économique européen/);
  });

  it("refuse aussi le Royaume-Uni, sorti de l'EEE", () => {
    expect(verifierEligibilite("SHEL.L", "PEA").eligible).toBe(false);
  });

  it("n'impose aucune restriction sur un compte-titres ordinaire", () => {
    expect(verifierEligibilite("AAPL", "CTO")).toMatchObject({ eligible: true });
    expect(verifierEligibilite("AAPL", "AV").eligible).toBe(true);
  });

  it("signale son incertitude plutôt que de trancher", () => {
    expect(verifierEligibilite("TOTO.ZZ", "PEA")).toMatchObject({ eligible: null });
  });
});

describe("tauxRetenue", () => {
  it("n'applique aucune retenue sur une société française", () => {
    expect(tauxRetenue("AI.PA")).toBe(0);
  });

  it("applique le taux conventionnel sur les autres places", () => {
    expect(tauxRetenue("ALV.DE")).toBe(15);
    expect(tauxRetenue("AAPL")).toBe(15);
    expect(tauxRetenue("7203.T")).toBe(10);
  });
});

describe("dividendeNet", () => {
  it("laisse intact un dividende français en PEA", () => {
    const r = dividendeNet(100, "AI.PA", "PEA");
    expect(r.net).toBe(100);
    expect(r.perdue).toBe(0);
  });

  it("ampute un dividende étranger en PEA, sans récupération possible", () => {
    // C'est tout l'enjeu : la retenue est définitivement perdue dans un PEA.
    const r = dividendeNet(100, "ALV.DE", "PEA");
    expect(r.net).toBeCloseTo(85, 6);
    expect(r.perdue).toBeCloseTo(15, 6);
    expect(r.recuperable).toBe(false);
  });

  it("laisse le brut sur un CTO, où la retenue ouvre droit à un crédit d'impôt", () => {
    const r = dividendeNet(100, "ALV.DE", "CTO");
    expect(r.net).toBe(100);
    expect(r.recuperable).toBe(true);
  });

  it("compare deux titres à rendement affiché identique", () => {
    // Le cas qui motive la fonctionnalité : 4 % annoncés des deux côtés.
    const francais = dividendeNet(400, "AI.PA", "PEA");
    const allemand = dividendeNet(400, "ALV.DE", "PEA");
    expect(francais.net).toBe(400);
    expect(allemand.net).toBeCloseTo(340, 6);
    expect(francais.net - allemand.net).toBeCloseTo(60, 6);
  });

  it("reste neutre sur une entrée non numérique", () => {
    expect(dividendeNet(undefined, "ALV.DE", "PEA").net).toBe(0);
  });
});
