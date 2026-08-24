import { describe, it, expect } from "vitest";
import { mensualiser, rapprochements } from "./doublonsAbonnements";

const AUJ = "2026-06-01";

describe("mensualiser", () => {
  it("ramène chaque périodicité au mois", () => {
    expect(mensualiser({ montant: 120, frequence: "annuelle" })).toBeCloseTo(10, 6);
    expect(mensualiser({ montant: 30, frequence: "trimestrielle" })).toBeCloseTo(10, 6);
    expect(mensualiser({ montant: 10, frequence: "hebdomadaire" })).toBeCloseTo(43.333, 3);
    expect(mensualiser({ montant: 12, frequence: "mensuelle" })).toBe(12);
  });

  it("traite une périodicité absente comme mensuelle", () => {
    expect(mensualiser({ montant: 15 })).toBe(15);
    expect(mensualiser(undefined)).toBe(0);
  });
});

describe("rapprochements", () => {
  it("ne signale rien quand chaque catégorie est unique", () => {
    const s = rapprochements(
      [
        { id: "1", label: "Netflix", category: "Streaming", montant: 14 },
        { id: "2", label: "Free", category: "Télécom", montant: 20 },
      ],
      [],
      { aujourdhui: AUJ }
    );
    expect(s).toEqual([]);
  });

  it("rapproche deux abonnements d'une même catégorie et totalise leur coût", () => {
    const s = rapprochements(
      [
        { id: "1", label: "Netflix", category: "Streaming", montant: 14 },
        { id: "2", label: "Disney+", category: "Streaming", montant: 9 },
      ],
      [],
      { aujourdhui: AUJ }
    );
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe("doublon");
    expect(s[0].mensuel).toBeCloseTo(23, 6);
    expect(s[0].detail).toBe("Netflix, Disney+");
  });

  it("additionne des périodicités différentes dans le même rapprochement", () => {
    const s = rapprochements(
      [
        { id: "1", label: "Antivirus", category: "Logiciel", montant: 60, frequence: "annuelle" },
        { id: "2", label: "Cloud", category: "Logiciel", montant: 3 },
      ],
      [],
      { aujourdhui: AUJ }
    );
    expect(s[0].mensuel).toBeCloseTo(8, 6);
  });

  it("repère un abonnement dormant au-delà de quatre mois", () => {
    const s = rapprochements(
      [{ id: "1", label: "Salle de sport", montant: 30, prochaine_date: "2025-11-01" }],
      [],
      { aujourdhui: AUJ }
    );
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe("dormant");
    expect(s[0].detail).toContain("2025-11-01");
  });

  it("ne signale pas comme dormant un prélèvement récent ou à venir", () => {
    const s = rapprochements(
      [
        { id: "1", label: "Récent", montant: 30, prochaine_date: "2026-04-01" },
        { id: "2", label: "À venir", montant: 30, prochaine_date: "2026-07-01" },
      ],
      [],
      { aujourdhui: AUJ }
    );
    expect(s).toEqual([]);
  });

  it("signale un recouvrement de contrats sans lui prêter de coût", () => {
    // Le coût d'un contrat n'est pas connu ici : lui en inventer un fausserait
    // le total « en jeu » affiché par le widget.
    const s = rapprochements(
      [],
      [
        { id: "c1", label: "Assurance auto", category: "Assurance" },
        { id: "c2", label: "Assurance habitation", category: "Assurance" },
      ],
      { aujourdhui: AUJ }
    );
    expect(s).toHaveLength(1);
    expect(s[0].type).toBe("recouvrement");
    expect(s[0].mensuel).toBe(0);
  });

  it("met en tête le rapprochement le plus coûteux", () => {
    const s = rapprochements(
      [
        { id: "1", label: "A", category: "Petit", montant: 3 },
        { id: "2", label: "B", category: "Petit", montant: 2 },
        { id: "3", label: "C", category: "Gros", montant: 40 },
        { id: "4", label: "D", category: "Gros", montant: 30 },
      ],
      [],
      { aujourdhui: AUJ }
    );
    expect(s.map((x) => x.id)).toEqual(["cat-Gros", "cat-Petit"]);
  });

  it("ignore les entrées sans catégorie plutôt que de les regrouper", () => {
    const s = rapprochements(
      [
        { id: "1", label: "A", montant: 3 },
        { id: "2", label: "B", montant: 2 },
      ],
      [],
      { aujourdhui: AUJ }
    );
    expect(s).toEqual([]);
  });

  it("survit à des listes absentes", () => {
    expect(rapprochements(undefined, undefined, { aujourdhui: AUJ })).toEqual([]);
  });
});
