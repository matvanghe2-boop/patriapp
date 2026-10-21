import { describe, it, expect } from "vitest";
import {
  ajouterMouvement,
  retirerMouvement,
  soldeAvant,
  soldeAu,
  debutQuinzaine,
  quinzaineSuivante,
  dateDeValeur,
  serieTauxPour,
  interetsQuinzaines,
  depotsNets,
} from "./livretsMouvements";

const livret = (extra = {}) => ({ id: "l", name: "Livret A", balance: 10000, rate: 0.017, ...extra });

describe("mouvements", () => {
  it("met le solde à jour et garde le mouvement daté", () => {
    let l = ajouterMouvement(livret(), { id: "1", date: "2026-03-10", montant: 500, nature: "depot" });
    l = ajouterMouvement(l, { id: "2", date: "2026-04-02", montant: 200, nature: "retrait" });
    expect(l.balance).toBe(10300);
    expect(l.mouvements.map((m) => m.id)).toEqual(["1", "2"]);
    expect(retirerMouvement(l, "2").balance).toBe(10500);
  });

  it("remonte le temps à partir du solde du jour", () => {
    let l = ajouterMouvement(livret(), { id: "1", date: "2026-03-10", montant: 500, nature: "depot" });
    expect(soldeAvant(l, "2026-03-10")).toBe(10000);
    expect(soldeAu(l, "2026-03-10")).toBe(10500);
    expect(soldeAu(l, "2026-01-01")).toBe(10000);
  });

  it("compte un ajustement avec son signe, sans en faire un dépôt", () => {
    const l = ajouterMouvement(livret(), { id: "1", date: "2026-03-10", montant: -120, nature: "ajustement" });
    expect(l.balance).toBe(9880);
    expect(depotsNets([l], "2026-01-01", "2026-12-31")).toBe(0);
  });
});

describe("règle des quinzaines", () => {
  it("situe le début de quinzaine et la suivante", () => {
    expect(debutQuinzaine("2026-03-10")).toBe("2026-03-01");
    expect(debutQuinzaine("2026-03-20")).toBe("2026-03-16");
    expect(quinzaineSuivante("2026-03-10")).toBe("2026-03-16");
    expect(quinzaineSuivante("2026-03-16")).toBe("2026-04-01");
    expect(quinzaineSuivante("2026-12-20")).toBe("2027-01-01");
  });

  it("fait rapporter un dépôt à la quinzaine suivante, et cesser un retrait dès sa quinzaine", () => {
    expect(dateDeValeur({ date: "2026-03-03", montant: 100, nature: "depot" })).toBe("2026-03-16");
    // Un dépôt le 1er ne rapporte qu'à partir du 16.
    expect(dateDeValeur({ date: "2026-03-01", montant: 100, nature: "depot" })).toBe("2026-03-16");
    expect(dateDeValeur({ date: "2026-03-14", montant: 100, nature: "retrait" })).toBe("2026-03-01");
  });

  it("reconnaît les livrets à taux officiel", () => {
    expect(serieTauxPour({ name: "Livret A" })).not.toBeNull();
    expect(serieTauxPour({ name: "LDDS" })).not.toBeNull();
    expect(serieTauxPour({ name: "LEP" })).not.toBeNull();
    expect(serieTauxPour({ name: "Livret bancaire" })).toBeNull();
  });

  it("calcule les intérêts d'une année au taux saisi, sans mouvement", () => {
    const r = interetsQuinzaines({ name: "Livret bancaire", balance: 12000, rate: 0.02 }, 2026, {});
    expect(r.total).toBeCloseTo(240, 6); // 12 000 × 2 %
    expect(r.methode).toBe("taux saisi");
  });

  it("applique les taux officiels successifs du Livret A", () => {
    // 2025 : 3 % en janvier, 2,4 % de février à juillet, 1,7 % ensuite.
    const r = interetsQuinzaines({ name: "Livret A", balance: 24000, rate: 0.017 }, 2025, {});
    const attendu = 24000 * ((2 * 0.03 + 12 * 0.024 + 10 * 0.017) / 24);
    expect(r.total).toBeCloseTo(attendu, 6);
    expect(r.methode).toBe("taux officiels");
  });

  it("ne fait rapporter un dépôt qu'à partir de sa date de valeur", () => {
    // 2 400 € déposés le 3 décembre : ils ne rapportent qu'à partir du 16,
    // soit une seule quinzaine sur 24.
    const l = ajouterMouvement(
      { name: "Livret bancaire", balance: 0, rate: 0.02 },
      { id: "1", date: "2026-12-03", montant: 2400, nature: "depot" }
    );
    const r = interetsQuinzaines(l, 2026, {});
    expect(r.total).toBeCloseTo((2400 * 0.02) / 24, 6);
  });

  it("signale une année en cours comme une estimation", () => {
    const r = interetsQuinzaines(livret(), 2026, { aujourdhui: "2026-10-21" });
    expect(r.estime).toBe(true);
    expect(r.acquis).toBeLessThan(r.total);
  });
});
