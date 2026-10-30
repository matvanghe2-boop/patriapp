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

  it("ne juge plus un abonnement à sa date de prélèvement saisie", () => {
    // La date saisie ne bouge jamais : l'ancien signal « dormant » finissait
    // par s'allumer sur chaque abonnement, quatre mois après sa création.
    const s = rapprochements(
      [{ id: "1", label: "Salle de sport", montant: 30, prochaine_date: "2025-11-01" }],
      [],
      { aujourdhui: AUJ }
    );
    expect(s).toEqual([]);
  });

  it("relaie ce que le relevé contredit, avec ce qui est en jeu", () => {
    const subs = [
      { id: "1", label: "Netflix", montant: 13.49 },
      { id: "2", label: "Salle", montant: 30 },
      { id: "3", label: "Presse", montant: 10, statut: "resilie" },
    ];
    const verifications = {
      1: { trouve: true, alerte: "montant", detail: "Passé de 13,49 € à 14,99 €", derniere: { montant: 14.99 } },
      2: { trouve: true, alerte: "absent", detail: "plus rien", derniere: { montant: 30 } },
      3: { trouve: true, alerte: "toujours_preleve", detail: "encore prélevé", derniere: { montant: 10 } },
    };
    const s = rapprochements(subs, [], { verifications });
    const parType = Object.fromEntries(s.map((x) => [x.type, x]));
    expect(parType.montant.mensuel).toBeCloseTo(1.5, 6);
    expect(parType.absent.mensuel).toBe(0);
    expect(parType.toujours_preleve.mensuel).toBe(10);
    expect(parType.toujours_preleve.libelle).toBe("Presse — toujours prélevé");
  });

  it("ne compte pas un abonnement résilié dans les doublons de catégorie", () => {
    const s = rapprochements(
      [
        { id: "1", label: "Netflix", category: "Streaming", montant: 14 },
        { id: "2", label: "Disney+", category: "Streaming", montant: 9, statut: "resilie" },
      ],
      []
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
