import { describe, it, expect } from "vitest";
import { construireRetrospective, joursDeLAnnee, anneesDisponibles, nomMois } from "./retrospective";

const releve = (date, value) => ({ date, value });

describe("jours de l'année", () => {
  it("marque d'un null les jours sans relevé", () => {
    // C'est toute la valeur de cette vue par rapport à une courbe : la courbe
    // relie les points et laisse croire à une continuité qui n'existe pas.
    const jours = joursDeLAnnee(
      [releve("2026-01-01", 1000), releve("2026-01-05", 1200)],
      2026,
      new Date("2026-01-06T12:00:00")
    );
    expect(jours).toHaveLength(6);
    expect(jours[0].variation).toBe(0); // premier relevé : pas de comparaison possible
    expect(jours[1].variation).toBeNull();
    expect(jours[2].variation).toBeNull();
    expect(jours[3].variation).toBeNull();
    expect(jours[4].variation).toBe(200);
    expect(jours[5].variation).toBeNull();
  });

  it("ne remplit pas les jours à venir", () => {
    const jours = joursDeLAnnee([releve("2026-01-01", 1000)], 2026, new Date("2026-01-10T12:00:00"));
    expect(jours).toHaveLength(10);
  });

  it("s'arrête au 31 décembre pour une année passée", () => {
    const jours = joursDeLAnnee([releve("2025-06-01", 1000)], 2025, new Date("2026-08-24T12:00:00"));
    expect(jours).toHaveLength(365);
  });

  it("ignore les relevés d'une autre année", () => {
    const jours = joursDeLAnnee(
      [releve("2025-12-31", 900), releve("2026-01-02", 1000)],
      2026,
      new Date("2026-01-03T12:00:00")
    );
    expect(jours.filter((j) => j.variation != null)).toHaveLength(1);
  });
});

describe("rétrospective annuelle", () => {
  // Dates construites en heure LOCALE : `toISOString` bascule en UTC et
  // décalerait tout le jeu d'essai d'un jour à l'est de Greenwich — le test
  // échouerait pour une raison sans rapport avec ce qu'il vérifie.
  const isoLocal = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const annee = (n) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date("2026-01-01T00:00:00");
      d.setDate(d.getDate() + i);
      return releve(isoLocal(d), 10000 + i * 100);
    });

  it("refuse de conclure sous trente jours relevés", () => {
    // Un bilan calculé sur quelques points épars ressemblerait à un bilan sans
    // en être un — c'est le même refus que celui du TRI sur un journal partiel.
    const r = construireRetrospective({ an: 2026, historyPast: annee(10), aujourdHui: new Date("2026-12-31") });
    expect(r.exploitable).toBe(false);
    expect(r.joursReleves).toBe(10);
  });

  it("devient exploitable à partir de trente relevés", () => {
    const r = construireRetrospective({ an: 2026, historyPast: annee(40), aujourdHui: new Date("2026-12-31") });
    expect(r.exploitable).toBe(true);
    expect(r.debut).toBe(10000);
    expect(r.fin).toBe(10000 + 39 * 100);
    expect(r.variation).toBe(3900);
    expect(r.variationPct).toBeCloseTo(39, 1);
  });

  it("écarte les mois à relevé unique du classement", () => {
    // Avec un seul point, début et fin se confondent : le mois ressortirait
    // systématiquement à zéro et fausserait le palmarès.
    const historique = [
      ...annee(35),
      releve("2026-07-15", 99999), // mois de juillet, un seul relevé
    ];
    const r = construireRetrospective({ an: 2026, historyPast: historique, aujourdHui: new Date("2026-12-31") });
    expect(r.meilleurMois?.cle).not.toBe("2026-07");
  });

  it("totalise les dividendes de l'année seulement", () => {
    const r = construireRetrospective({
      an: 2026,
      historyPast: annee(40),
      operations: [
        { type: "DIVIDENDE", amount: 120, date: "2026-03-04" },
        { type: "DIVIDENDE", amount: 80, date: "2026-09-12" },
        { type: "DIVIDENDE", amount: 999, date: "2025-05-05" },
        { type: "ACHAT", amount: 500, date: "2026-02-02" },
      ],
      aujourdHui: new Date("2026-12-31"),
    });
    expect(r.dividendes).toBe(200);
    expect(r.operations).toBe(3);
    expect(r.achats).toBe(1);
    expect(r.ventes).toBe(0);
  });

  it("classe la meilleure ligne en pourcentage, pas en euros", () => {
    // Une position de 300 € qui double bat une position de 30 000 € qui gagne
    // 2 % : c'est la seule mesure comparable entre deux lignes de taille
    // différente.
    const r = construireRetrospective({
      an: 2026,
      historyPast: annee(40),
      positions: [
        { name: "Grosse", ticker: "GRO", pru: 100, current_price: 102 },
        { name: "Petite", ticker: "PET", pru: 10, current_price: 20 },
      ],
      aujourdHui: new Date("2026-12-31"),
    });
    expect(r.meilleureLigne.ticker).toBe("PET");
    expect(r.meilleureLigne.pct).toBeCloseTo(100, 0);
  });

  it("moyenne le taux d'épargne sur les relevés de profil de l'année", () => {
    const r = construireRetrospective({
      an: 2026,
      historyPast: annee(40),
      profileHistory: [
        { date: "2026-01-15", monthly_income: 2000, monthly_expenses: 1000 }, // 50 %
        { date: "2026-06-15", monthly_income: 2000, monthly_expenses: 1400 }, // 30 %
        { date: "2025-06-15", monthly_income: 2000, monthly_expenses: 0 },    // hors année
      ],
      aujourdHui: new Date("2026-12-31"),
    });
    expect(r.tauxEpargneMoyen).toBeCloseTo(40, 1);
  });

  it("survit à un historique vide", () => {
    const r = construireRetrospective({ an: 2026 });
    expect(r.exploitable).toBe(false);
    expect(r.debut).toBeNull();
    expect(r.variation).toBeNull();
    expect(r.meilleureLigne).toBeNull();
    expect(r.tauxEpargneMoyen).toBeNull();
  });
});

describe("utilitaires", () => {
  it("liste les années disponibles, la plus récente d'abord", () => {
    expect(
      anneesDisponibles([releve("2024-05-01", 1), releve("2026-01-01", 2), releve("2024-09-01", 3)])
    ).toEqual([2026, 2024]);
  });

  it("nomme les mois en français", () => {
    expect(nomMois("2026-01")).toBe("janvier");
    expect(nomMois("2026-08")).toBe("août");
    expect(nomMois("2026-12")).toBe("décembre");
  });
});
