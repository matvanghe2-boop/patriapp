import { describe, it, expect } from "vitest";
import { reconstituerPatrimoine, appliquerReconstitution } from "./reconstitutionPatrimoine";

const serie = [
  { date: "2026-09-01", solde: 100000 },
  { date: "2026-09-03", solde: 150000 },
];

describe("reconstituerPatrimoine", () => {
  it("additionne chaque soir le compte courant, le portefeuille et les livrets, moins les dettes", () => {
    const { changements } = reconstituerPatrimoine({
      serie,
      bourseHistory: [{ date: "2026-08-30", valeur: 2000 }, { date: "2026-09-02", valeur: 2100 }],
      livrets: [{ balance: 600, mouvements: [{ date: "2026-09-02", montant: 100, nature: "depot" }] }],
      dettesTotal: 50,
      jusquA: "2026-09-03",
    });
    expect(changements).toEqual([
      { date: "2026-09-01", avant: null, apres: 1000 + 2000 + 500 - 50 },
      { date: "2026-09-02", avant: null, apres: 1000 + 2100 + 600 - 50 },
      { date: "2026-09-03", avant: null, apres: 1500 + 2100 + 600 - 50 },
    ]);
  });

  it("corrige un point existant faux, garde un point juste et ne touche jamais un point saisi à la main", () => {
    const { changements } = reconstituerPatrimoine({
      serie,
      portefeuilleVide: true,
      historique: [
        { date: "2026-09-01", value: 7000 },
        { date: "2026-09-02", value: 1000 },
        { date: "2026-09-03", value: 42, manual: true },
      ],
    });
    expect(changements).toEqual([{ date: "2026-09-01", avant: 7000, apres: 1000 }]);
  });

  it("n'invente pas un jour dont la valeur du portefeuille est inconnue", () => {
    const r = reconstituerPatrimoine({ serie, bourseHistory: [{ date: "2026-08-01", valeur: 500 }] });
    expect(r.changements).toEqual([]);
    expect(r.sansPortefeuille).toBe(3);
  });

  it("s'arrête au dernier jour demandé", () => {
    const { changements } = reconstituerPatrimoine({ serie, portefeuilleVide: true, jusquA: "2026-09-02" });
    expect(changements.map((c) => c.date)).toEqual(["2026-09-01", "2026-09-02"]);
  });
});

describe("appliquerReconstitution", () => {
  it("ajoute et corrige les points, marqués comme reconstitués", () => {
    const historique = [{ id: "a", date: "2026-09-01", value: 7000, label: "1 sept." }];
    const nouvel = appliquerReconstitution(
      historique,
      [
        { date: "2026-09-01", avant: 7000, apres: 1000 },
        { date: "2026-09-02", avant: null, apres: 1100 },
      ],
      { now: new Date(2026, 9, 1) }
    );
    expect(nouvel.map((h) => [h.date, h.value, h.reconstitue])).toEqual([
      ["2026-09-01", 1000, true],
      ["2026-09-02", 1100, true],
    ]);
  });
});
