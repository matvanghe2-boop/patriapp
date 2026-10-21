import { describe, it, expect } from "vitest";
import { construireBriefing, contributionsDuJour } from "./briefing";

const AUJ = "2026-10-26";
const positions = [
  { ticker: "SU.PA", name: "Schneider Electric SE", quantity: 10, current_price: 220, previousClose: 202 }, // +180
  { ticker: "AI.PA", name: "Air Liquide", quantity: 10, current_price: 174, previousClose: 176, annual_dividend: 3.3, dividendeMois: { 10: 1 } }, // −20
];

describe("construireBriefing", () => {
  it("dit la séance et la ligne qui l'a portée", () => {
    const [seance] = construireBriefing({ positions, aujourdhui: AUJ });
    expect(seance.cle).toBe("seance");
    expect(seance.ton).toBe("hausse");
    expect(seance.texte).toMatch(/^\+160\s€ en bourse aujourd'hui/);
    expect(seance.texte).toMatch(/porté par Schneider Electric \(\+180\s€\)/);
  });

  it("précise quand les cours ne sont pas du jour", () => {
    const [seance] = construireBriefing({ positions, aujourdhui: AUJ, coursDuJour: false });
    expect(seance.texte).toMatch(/à la dernière séance connue/);
  });

  it("annonce le rendez-vous publié de la semaine", () => {
    // Air Liquide publie son chiffre d'affaires le 29 octobre 2026 (catalogue).
    const phrases = construireBriefing({ positions, aujourdhui: AUJ });
    const agenda = phrases.find((p) => p.cle === "agenda");
    expect(agenda.texte).toMatch(/^Air Liquide : chiffre d'affaires du 3e trimestre 2026, jeudi 29 octobre/);
  });

  it("annonce les dividendes attendus ce mois-ci", () => {
    const dividendes = construireBriefing({ positions, aujourdhui: AUJ }).find((p) => p.cle === "dividendes");
    expect(dividendes.texte).toMatch(/Air Liquide \(environ 33\s€/);
  });

  it("situe l'objectif le plus proche", () => {
    const objectif = construireBriefing({
      positions: [],
      aujourdhui: AUJ,
      patrimoineNet: 30000,
      objectifs: [{ id: "o", libelle: "Apport", cible: 60000, departDate: "2026-01-01", departValeur: 20000, echeance: "2027-01-01" }],
    }).find((p) => p.cle === "objectif");
    expect(objectif.texte).toMatch(/Objectif « Apport »/);
    expect(objectif.ton).toBe("baisse");
  });

  it("n'écrit rien sans donnée fiable", () => {
    expect(construireBriefing({ positions: [{ ticker: "X", quantity: 1, current_price: 10 }], aujourdhui: AUJ })).toEqual([]);
  });
});

describe("contributionsDuJour", () => {
  it("classe les lignes par effet absolu sur la séance", () => {
    expect(contributionsDuJour(positions).map((c) => c.position.ticker)).toEqual(["SU.PA", "AI.PA"]);
  });
});
