import { describe, it, expect } from "vitest";
import { joursAvant, prochainesEcheances } from "./echeances";

const AUJ = "2026-06-01";

describe("joursAvant", () => {
  it("compte les jours pleins, négatifs dans le passé", () => {
    expect(joursAvant("2026-06-08", AUJ)).toBe(7);
    expect(joursAvant("2026-06-01", AUJ)).toBe(0);
    expect(joursAvant("2026-05-25", AUJ)).toBe(-7);
  });

  it("rend null sur une date absente ou invalide", () => {
    expect(joursAvant(null, AUJ)).toBeNull();
    expect(joursAvant("pas-une-date", AUJ)).toBeNull();
  });

  it("traverse un changement d'heure sans dériver d'un jour", () => {
    // Le passage à l'heure d'été 2026 tombe le 29 mars ; un calcul en UTC pur
    // rendrait 30,96 jours et l'arrondi masquerait le problème une fois sur
    // deux. On vérifie l'encadrement du passage.
    expect(joursAvant("2026-04-05", "2026-03-22")).toBe(14);
  });
});

describe("prochainesEcheances", () => {
  it("retient la date de PRÉAVIS et non la fin du contrat", () => {
    // Contrat qui finit dans 100 jours, avec 60 jours de préavis : ce qui
    // arrive bientôt, c'est la limite de résiliation dans 40 jours.
    const liste = prochainesEcheances(
      { contracts: [{ id: "c1", label: "Mutuelle", date_fin: "2026-09-09", preavis_jours: 60 }] },
      { aujourdhui: AUJ }
    );
    expect(liste).toHaveLength(1);
    expect(liste[0].type).toBe("preavis");
    expect(liste[0].date).toBe("2026-07-11");
    expect(liste[0].jours).toBe(40);
  });

  it("bascule sur la fin d'engagement quand le préavis est déjà passé", () => {
    // Fin dans 20 jours, préavis de 90 : la limite est derrière nous, mais la
    // fin d'engagement reste une information à afficher.
    const liste = prochainesEcheances(
      { contracts: [{ id: "c2", label: "Box", date_fin: "2026-06-21", preavis_jours: 90 }] },
      { aujourdhui: AUJ }
    );
    expect(liste).toHaveLength(1);
    expect(liste[0].type).toBe("contrat");
    expect(liste[0].jours).toBe(20);
  });

  it("écarte ce qui est hors fenêtre, passé comme trop lointain", () => {
    const liste = prochainesEcheances(
      {
        evenements: [
          { ticker: "AI", date: "2026-05-20", type: "dividende", label: "Air Liquide" },
          { ticker: "OR", date: "2026-12-01", type: "dividende", label: "L'Oréal" },
          { ticker: "MC", date: "2026-06-15", type: "dividende", label: "LVMH" },
        ],
      },
      { aujourdhui: AUJ }
    );
    expect(liste.map((e) => e.detail)).toEqual(["MC"]);
  });

  it("classe par urgence croissante et marque les trois crans", () => {
    const liste = prochainesEcheances(
      {
        evenements: [
          { ticker: "C", date: "2026-07-05", type: "dividende" },
          { ticker: "A", date: "2026-06-04", type: "dividende" },
          { ticker: "B", date: "2026-06-18", type: "dividende" },
        ],
      },
      { aujourdhui: AUJ }
    );
    expect(liste.map((e) => e.detail)).toEqual(["A", "B", "C"]);
    expect(liste.map((e) => e.urgence)).toEqual(["critique", "attention", "neutre"]);
  });

  it("marque un objectif atteint « ok » plutôt que critique", () => {
    const liste = prochainesEcheances(
      {
        objectifs: [{ id: "o1", libelle: "Apport", echeance: "2026-06-03", cible: 10000 }],
        patrimoineNet: 12000,
      },
      { aujourdhui: AUJ }
    );
    expect(liste[0].atteint).toBe(true);
    expect(liste[0].urgence).toBe("ok");
    expect(liste[0].detail).toBe("100 % atteint");
  });

  it("laisse un objectif non atteint dans son cran d'urgence", () => {
    const liste = prochainesEcheances(
      {
        objectifs: [{ id: "o2", libelle: "Apport", echeance: "2026-06-03", cible: 10000 }],
        patrimoineNet: 4000,
      },
      { aujourdhui: AUJ }
    );
    expect(liste[0].atteint).toBe(false);
    expect(liste[0].urgence).toBe("critique");
    expect(liste[0].detail).toBe("40 % atteint");
  });

  it("ne rend rien sans source", () => {
    expect(prochainesEcheances({}, { aujourdhui: AUJ })).toEqual([]);
    expect(prochainesEcheances(undefined, { aujourdhui: AUJ })).toEqual([]);
  });
});
