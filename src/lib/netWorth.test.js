import { describe, it, expect } from "vitest";
import {
  referencePointDaysAgo,
  netWorthDelta,
  compactHistory,
  projectMonthly,
} from "./finance";

// Date de référence fixe : ces fonctions raisonnent toutes en « il y a N jours »
// et seraient sinon dépendantes du jour d'exécution.
const NOW = new Date("2026-08-03T12:00:00");

describe("referencePointDaysAgo", () => {
  const history = [
    { date: "2026-05-01", value: 30000 },
    { date: "2026-07-04", value: 38000 },
    { date: "2026-07-20", value: 39000 },
    { date: "2026-08-03", value: 40000 },
  ];

  it("retient le relevé le plus proche de la date cible, sans jamais la dépasser", () => {
    // J-30 = 2026-07-04. Le relevé du 20 juillet est plus récent que la cible :
    // le retenir reviendrait à comparer sur 14 jours en annonçant 30.
    expect(referencePointDaysAgo(history, 30, NOW).date).toBe("2026-07-04");
  });

  it("ignore le relevé du jour, qui est celui auquel on se compare", () => {
    expect(referencePointDaysAgo(history, 30, NOW).value).toBe(38000);
  });

  it("se rabat sur le plus ancien relevé si l'historique est plus court que la fenêtre", () => {
    const court = [{ date: "2026-07-28", value: 100 }];
    expect(referencePointDaysAgo(court, 30, NOW).date).toBe("2026-07-28");
  });

  it("rend null sur un historique vide ou non daté", () => {
    expect(referencePointDaysAgo([], 30, NOW)).toBeNull();
    expect(referencePointDaysAgo([{ value: 10 }], 30, NOW)).toBeNull();
  });
});

describe("netWorthDelta", () => {
  it("mesure l'écart contre le relevé d'il y a 30 jours, pas contre le dernier", () => {
    // Le bug d'origine : le relevé quotidien crée un point chaque jour, donc
    // « le dernier point » est celui d'aujourd'hui et l'écart valait toujours 0.
    const history = [
      { date: "2026-07-04", value: 38000 },
      { date: "2026-08-02", value: 39800 },
      { date: "2026-08-03", value: 40000 },
    ];
    const d = netWorthDelta(history, 40000, 30, NOW);
    expect(d.abs).toBe(2000);
    expect(d.pct).toBeCloseTo(5.263, 3);
    expect(d.refDate).toBe("2026-07-04");
    expect(d.hasReference).toBe(true);
  });

  it("n'annonce pas de variation quand le seul relevé disponible est celui du jour", () => {
    const d = netWorthDelta([{ date: "2026-08-03", value: 40000 }], 40000, 30, NOW);
    expect(d.hasReference).toBe(false);
    expect(d.abs).toBe(0);
  });

  it("gère une baisse", () => {
    const history = [{ date: "2026-06-01", value: 50000 }];
    expect(netWorthDelta(history, 45000, 30, NOW).abs).toBe(-5000);
  });
});

describe("compactHistory", () => {
  it("garde le relevé quotidien récent intact", () => {
    const history = [
      { date: "2026-08-01", value: 1 },
      { date: "2026-08-02", value: 2 },
      { date: "2026-08-03", value: 3 },
    ];
    expect(compactHistory(history, { now: NOW })).toHaveLength(3);
  });

  it("ne conserve qu'un point par mois au-delà de la fenêtre quotidienne", () => {
    const history = [
      { date: "2025-01-05", value: 1 },
      { date: "2025-01-19", value: 2 },
      { date: "2025-01-31", value: 3 },
      { date: "2025-02-14", value: 4 },
      { date: "2026-08-03", value: 5 },
    ];
    const out = compactHistory(history, { now: NOW });
    // Janvier ne garde que son dernier relevé, février le sien, plus le point
    // du jour qui reste dans la fenêtre quotidienne.
    expect(out.map((h) => h.date)).toEqual(["2025-01-31", "2025-02-14", "2026-08-03"]);
  });

  it("préserve les points saisis à la main, quelle que soit leur ancienneté", () => {
    const history = [
      { date: "2025-01-05", value: 1, manual: true },
      { date: "2025-01-31", value: 3 },
    ];
    const out = compactHistory(history, { now: NOW });
    expect(out.map((h) => h.date)).toEqual(["2025-01-05", "2025-01-31"]);
  });

  it("rend une série triée par date", () => {
    const history = [
      { date: "2026-08-03", value: 3 },
      { date: "2025-03-31", value: 1 },
      { date: "2025-06-30", value: 2 },
    ];
    const out = compactHistory(history, { now: NOW });
    expect(out.map((h) => h.date)).toEqual(["2025-03-31", "2025-06-30", "2026-08-03"]);
  });
});

describe("projectMonthly", () => {
  it("reste additif à taux nul", () => {
    expect(projectMonthly(1000, 0, 100, 6)).toBe(1600);
  });

  it("capitalise le capital et les versements", () => {
    // 1000 € à 12 %/an (1 %/mois) pendant 12 mois, sans versement.
    expect(projectMonthly(1000, 12, 0, 12)).toBeCloseTo(1126.83, 2);
  });

  it("dépasse la projection linéaire dès que le taux est positif", () => {
    const lineaire = 10000 + 200 * 6;
    expect(projectMonthly(10000, 5, 200, 6)).toBeGreaterThan(lineaire);
  });
});
