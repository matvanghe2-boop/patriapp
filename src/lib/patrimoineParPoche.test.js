import { describe, it, expect } from "vitest";
import { decouperParPoche, valeurPortefeuilleAu, pochesSuivies } from "./patrimoineParPoche";

const POINTS = [
  { date: "2026-01-31", value: 30000 },
  { date: "2026-03-31", value: 33000 },
];
const PORTEFEUILLE = [
  { date: "2026-01-30", valeur: 12000, capital: 11000 },
  { date: "2026-03-31", valeur: 13500, capital: 12000 },
];

describe("decouperParPoche", () => {
  it("isole la bourse et met le reste en « Autres »", () => {
    const r = decouperParPoche(POINTS, { bourseHistory: PORTEFEUILLE });
    expect(r.points[0]).toEqual(expect.objectContaining({ poche_bourse: 12000, poche_autres: 18000 }));
    expect(r.points[1]).toEqual(expect.objectContaining({ poche_bourse: 13500, poche_autres: 19500 }));
  });

  it("ne trace un livret qu'à partir de son premier mouvement", () => {
    const livret = {
      name: "Livret A",
      envelope: "Livret",
      balance: 8000,
      mouvements: [{ id: "1", date: "2026-02-15", montant: 1000, nature: "depot" }],
    };
    const r = decouperParPoche(POINTS, { bourseHistory: PORTEFEUILLE, livrets: [livret] });
    // Avant le premier mouvement : solde inconnu, compté dans « Autres ».
    expect(r.points[0].poche_Livret).toBeUndefined();
    expect(r.points[1].poche_Livret).toBe(8000);
    expect(r.points[1].poche_autres).toBe(33000 - 13500 - 8000);
    expect(r.poches).toEqual([expect.objectContaining({ cle: "poche_Livret", libelle: "Livrets réglementés" })]);
  });

  it("refuse de découper sans historique du portefeuille quand il y a des positions", () => {
    expect(decouperParPoche(POINTS, { bourseHistory: [] })).toBeNull();
    // Sans position, tout est légitimement hors bourse.
    expect(decouperParPoche(POINTS, { bourseHistory: [], aDesPositions: false }).points[0].poche_autres).toBe(30000);
  });

  it("signale un résidu négatif plutôt que de tracer une aire sous zéro", () => {
    const r = decouperParPoche([{ date: "2026-03-31", value: 10000 }], { bourseHistory: PORTEFEUILLE });
    expect(r.points[0].poche_autres).toBe(0);
    expect(r.residuNegatif).toBe(true);
  });
});

describe("valeurPortefeuilleAu", () => {
  it("prend le dernier relevé connu à la date", () => {
    expect(valeurPortefeuilleAu(PORTEFEUILLE, "2026-02-10")).toBe(12000);
    expect(valeurPortefeuilleAu(PORTEFEUILLE, "2025-12-31")).toBeNull();
  });

  it("ne liste que les enveloppes ayant un livret suivi", () => {
    expect(pochesSuivies([{ name: "LDDS", balance: 100 }])).toEqual([]);
  });
});
