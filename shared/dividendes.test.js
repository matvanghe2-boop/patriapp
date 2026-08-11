import { describe, it, expect } from "vitest";
import {
  croissanceAnnuelleMoyenne,
  projeterDividendes,
  serieAvecProjection,
  dividendeAttendu,
  totalAttendu,
  percusParAnnee,
  percusParActif,
  serieAnnuelle,
  comparerAttenduPercu,
  rendementSurPrixDeRevient,
} from "./dividendes.js";

const POSITIONS = [
  { ticker: "AI.PA", quantity: 10, pru: 150, current_price: 180, annual_dividend: 3.2 },
  { ticker: "TTE.PA", quantity: 20, pru: 50, current_price: 60, annual_dividend: 3 },
];

const OPS = [
  { date: "2024-05-20", asset: "AI.PA", type: "DIVIDENDE", amount: 30 },
  { date: "2024-10-01", asset: "TTE.PA", type: "DIVIDENDE", amount: 28 },
  { date: "2025-05-20", asset: "AI.PA", type: "DIVIDENDE", amount: 32 },
  { date: "2025-10-01", asset: "TTE.PA", type: "DIVIDENDE", amount: 32 },
  { date: "2025-03-01", asset: "AI.PA", type: "ACHAT", quantity: 5, price: 170 },
];

describe("dividendeAttendu", () => {
  it("multiplie le dividende par action par la quantité", () => {
    expect(dividendeAttendu(POSITIONS[0])).toBeCloseTo(32, 6);
  });

  it("convertit les lignes en devise", () => {
    const p = { quantity: 10, annual_dividend: 2, currency: "USD", fxRate: 0.9 };
    expect(dividendeAttendu(p)).toBeCloseTo(18, 6);
  });

  it("rend zéro sans dividende annoncé", () => {
    expect(dividendeAttendu({ quantity: 10 })).toBe(0);
  });

  it("totalise le portefeuille", () => {
    expect(totalAttendu(POSITIONS)).toBeCloseTo(92, 6);
  });
});

describe("percusParAnnee", () => {
  it("regroupe les encaissements par année civile", () => {
    expect(percusParAnnee(OPS)).toEqual([
      { annee: "2024", montant: 58, nbVersements: 2 },
      { annee: "2025", montant: 64, nbVersements: 2 },
    ]);
  });

  it("ignore les opérations qui ne sont pas des dividendes", () => {
    // L'achat de 2025 ne doit pas gonfler le total.
    expect(percusParAnnee(OPS).find((a) => a.annee === "2025").nbVersements).toBe(2);
  });

  it("tolère un journal vide", () => {
    expect(percusParAnnee([])).toEqual([]);
  });
});

describe("percusParActif", () => {
  it("classe les actifs par montant décroissant", () => {
    expect(percusParActif(OPS)).toEqual([
      { actif: "AI.PA", montant: 62 },
      { actif: "TTE.PA", montant: 60 },
    ]);
  });
});

describe("serieAnnuelle", () => {
  it("calcule la croissance d'une année pleine sur l'autre", () => {
    const serie = serieAnnuelle(OPS, { anneeCourante: "2026" });
    const a2025 = serie.find((s) => s.annee === "2025");
    // 58 -> 64, soit +10,3 %.
    expect(a2025.croissancePct).toBeCloseTo(10.34, 1);
  });

  it("marque l'année en cours comme partielle et n'en calcule pas la croissance", () => {
    // Sans cela, chaque mois de janvier ferait croire à un effondrement.
    const serie = serieAnnuelle(OPS, { anneeCourante: "2025" });
    const a2025 = serie.find((s) => s.annee === "2025");
    expect(a2025.partielle).toBe(true);
    expect(a2025.croissancePct).toBeNull();
  });

  it("ajoute l'année en cours quand rien n'a encore été perçu", () => {
    const serie = serieAnnuelle(OPS, { attenduAnnuel: 92, anneeCourante: "2026" });
    const a2026 = serie.find((s) => s.annee === "2026");
    expect(a2026).toBeDefined();
    expect(a2026.montant).toBe(0);
    expect(a2026.attendu).toBe(92);
  });
});

describe("comparerAttenduPercu", () => {
  it("rapporte le perçu à l'attendu et à l'avancement de l'année", () => {
    // Au 1er juillet, avoir encaissé la moitié de l'attendu est conforme.
    const r = comparerAttenduPercu(OPS, POSITIONS, new Date("2025-07-01T12:00:00"));
    expect(r.attendu).toBeCloseTo(92, 6);
    expect(r.percu).toBeCloseTo(32, 6);
    expect(r.avancementAnneePct).toBeGreaterThan(45);
    expect(r.avancementAnneePct).toBeLessThan(55);
    expect(r.realisationPct).toBeCloseTo(34.8, 1);
  });

  it("rend une réalisation nulle sans dividende attendu", () => {
    const r = comparerAttenduPercu([], [{ quantity: 1, pru: 10, current_price: 10 }]);
    expect(r.realisationPct).toBeNull();
  });
});

describe("rendementSurPrixDeRevient", () => {
  it("rapporte le dividende attendu au capital réellement investi", () => {
    // Coût : 10 × 150 + 20 × 50 = 2 500 €. Dividende attendu : 92 €.
    expect(rendementSurPrixDeRevient(POSITIONS)).toBeCloseTo(3.68, 2);
  });

  it("ne dépend pas du cours, contrairement au rendement courant", () => {
    const cher = POSITIONS.map((p) => ({ ...p, current_price: p.current_price * 3 }));
    expect(rendementSurPrixDeRevient(cher)).toBeCloseTo(rendementSurPrixDeRevient(POSITIONS), 6);
  });

  it("rend null sans capital investi", () => {
    expect(rendementSurPrixDeRevient([])).toBeNull();
  });
});

// Série à croissance régulière de +10 %/an, pour vérifier le taux composé.
const OPS_CROISSANCE = [
  { date: "2021-05-01", asset: "A", type: "DIVIDENDE", amount: 100 },
  { date: "2022-05-01", asset: "A", type: "DIVIDENDE", amount: 110 },
  { date: "2023-05-01", asset: "A", type: "DIVIDENDE", amount: 121 },
  { date: "2024-05-01", asset: "A", type: "DIVIDENDE", amount: 133.1 },
];

describe("croissanceAnnuelleMoyenne", () => {
  it("mesure le taux annuel composé", () => {
    const c = croissanceAnnuelleMoyenne(OPS_CROISSANCE, { anneeCourante: "2025" });
    expect(c.tauxPct).toBeCloseTo(10, 1);
    expect(c.nbAnnees).toBe(4);
    expect(c.premiere).toBe("2021");
    expect(c.derniere).toBe("2024");
  });

  it("n'est pas la moyenne arithmétique des croissances", () => {
    // +50 % puis −50 % : la moyenne arithmétique dirait 0 %, alors qu'on a
    // perdu 25 % sur la période. Le taux composé doit être négatif.
    const volatile = [
      { date: "2022-05-01", asset: "A", type: "DIVIDENDE", amount: 100 },
      { date: "2023-05-01", asset: "A", type: "DIVIDENDE", amount: 150 },
      { date: "2024-05-01", asset: "A", type: "DIVIDENDE", amount: 75 },
    ];
    const c = croissanceAnnuelleMoyenne(volatile, { anneeCourante: "2025" });
    expect(c.tauxPct).toBeLessThan(0);
    expect(c.tauxPct).toBeCloseTo(-13.4, 1);
  });

  it("exclut l'année en cours, incomplète par nature", () => {
    const c = croissanceAnnuelleMoyenne(OPS_CROISSANCE, { anneeCourante: "2024" });
    expect(c.derniere).toBe("2023");
    expect(c.nbAnnees).toBe(3);
  });

  it("ne rend aucun taux sous deux années pleines", () => {
    const c = croissanceAnnuelleMoyenne(OPS_CROISSANCE.slice(0, 1), { anneeCourante: "2025" });
    expect(c.tauxPct).toBeNull();
  });
});

describe("projeterDividendes", () => {
  it("compose la croissance année après année", () => {
    const p = projeterDividendes({ baseAnnuelle: 100, tauxCroissancePct: 10, annees: 3, anneeDepart: 2025 });
    expect(p.map((x) => x.annee)).toEqual(["2026", "2027", "2028"]);
    expect(p[0].projete).toBeCloseTo(110, 6);
    expect(p[2].projete).toBeCloseTo(133.1, 6);
  });

  it("marque chaque point comme une projection", () => {
    const p = projeterDividendes({ baseAnnuelle: 100, tauxCroissancePct: 5, annees: 2 });
    expect(p.every((x) => x.projection === true)).toBe(true);
  });

  it("ne projette rien sans taux", () => {
    // Extrapoler sur une croissance inventée dessinerait une courbe qui a
    // l'air d'une donnée.
    expect(projeterDividendes({ baseAnnuelle: 100, tauxCroissancePct: null })).toEqual([]);
  });

  it("ne projette rien sans base", () => {
    expect(projeterDividendes({ baseAnnuelle: 0, tauxCroissancePct: 10 })).toEqual([]);
  });

  it("accepte une croissance négative", () => {
    const p = projeterDividendes({ baseAnnuelle: 100, tauxCroissancePct: -10, annees: 1 });
    expect(p[0].projete).toBeCloseTo(90, 6);
  });
});

describe("serieAvecProjection", () => {
  const positions = [{ ticker: "A", quantity: 100, pru: 50, current_price: 60, annual_dividend: 1.5 }];

  it("enchaîne l'historique puis la projection", () => {
    const r = serieAvecProjection(OPS_CROISSANCE, positions, { anneesProjection: 3, anneeCourante: "2025" });
    const annees = r.serie.map((x) => x.annee);
    expect(annees).toEqual(["2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028"]);
    expect(r.serie.filter((x) => x.projection)).toHaveLength(3);
  });

  it("part du dividende attendu, pas du dernier encaissement", () => {
    // Une ligne achetée en cours d'année n'a pas versé une année pleine :
    // partir de son dernier encaissement fausserait toute la courbe.
    const r = serieAvecProjection(OPS_CROISSANCE, positions, { anneesProjection: 1, anneeCourante: "2025" });
    expect(r.attendu).toBeCloseTo(150, 6);
    expect(r.serie.at(-1).projete).toBeCloseTo(150 * 1.1, 0);
  });

  it("laisse imposer un taux différent de celui mesuré", () => {
    const r = serieAvecProjection(OPS_CROISSANCE, positions, { anneesProjection: 1, tauxForce: 3, anneeCourante: "2025" });
    expect(r.tauxRetenu).toBe(3);
    expect(r.tauxEstImpose).toBe(true);
  });

  it("ne projette pas quand la croissance n'est pas mesurable", () => {
    const r = serieAvecProjection([], positions, { anneesProjection: 5, anneeCourante: "2025" });
    expect(r.serie.filter((x) => x.projection)).toHaveLength(0);
    expect(r.tauxRetenu).toBeNull();
  });

  it("cumule la projection", () => {
    const r = serieAvecProjection(OPS_CROISSANCE, positions, { anneesProjection: 2, tauxForce: 0, anneeCourante: "2025" });
    expect(r.cumulProjete).toBeCloseTo(300, 6);
  });
});
