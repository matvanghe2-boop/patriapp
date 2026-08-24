import { describe, it, expect } from "vitest";
import { situerTaux, SERIES, LIVRET_A, LEP } from "./histoireTaux";

const AUJ = new Date("2026-06-01T00:00:00Z");

describe("les séries elles-mêmes", () => {
  it("sont classées par date croissante, sans doublon", () => {
    for (const [cle, { serie }] of Object.entries(SERIES)) {
      const dates = serie.map((p) => p.date);
      expect(dates, cle).toEqual([...dates].sort());
      expect(new Set(dates).size, cle).toBe(dates.length);
    }
  });

  it("ne portent que des taux plausibles", () => {
    for (const p of [...LIVRET_A, ...LEP]) {
      expect(p.taux).toBeGreaterThanOrEqual(0);
      expect(p.taux).toBeLessThan(15);
    }
  });
});

describe("situerTaux", () => {
  it("rend null sur une série inconnue", () => {
    expect(situerTaux("pel")).toBeNull();
  });

  it("garde le palier qui courait AVANT la fenêtre", () => {
    // Sans lui, la courbe démarrerait dans le vide : le taux en vigueur au
    // premier jour de la période retenue ne serait nulle part.
    const s = situerTaux("livret-a", { anneesRetenues: 5, aujourdhui: AUJ });
    expect(s.points[0].date < "2021-06-01").toBe(true);
  });

  it("prend le dernier palier comme taux courant", () => {
    const s = situerTaux("livret-a", { aujourdhui: AUJ });
    expect(s.courant).toBe(LIVRET_A.at(-1).taux);
  });

  it("encadre le courant par le min et le max de la fenêtre", () => {
    const s = situerTaux("livret-a", { aujourdhui: AUJ });
    expect(s.min).toBeLessThanOrEqual(s.courant);
    expect(s.max).toBeGreaterThanOrEqual(s.courant);
    expect(s.moyenne).toBeGreaterThanOrEqual(s.min);
    expect(s.moyenne).toBeLessThanOrEqual(s.max);
  });

  it("pondère la moyenne par la DURÉE de chaque palier", () => {
    /*
     * C'est la propriété qui distingue cette moyenne d'une moyenne de paliers.
     * Le Livret A a tenu 0,5 % pendant plus de deux ans (2020-2022) puis a
     * connu plusieurs révisions rapprochées : la moyenne pondérée doit être
     * tirée vers le bas par ce long palier, donc rester sous la moyenne
     * arithmétique des paliers.
     */
    const s = situerTaux("livret-a", { aujourdhui: AUJ });
    const arithmetique = s.points.reduce((a, p) => a + p.taux, 0) / s.points.length;
    expect(s.moyenne).not.toBeCloseTo(arithmetique, 3);
  });

  it("situe le taux courant par un rang entre 0 et 100", () => {
    for (const cle of Object.keys(SERIES)) {
      const s = situerTaux(cle, { aujourdhui: AUJ });
      expect(s.rang, cle).toBeGreaterThanOrEqual(0);
      expect(s.rang, cle).toBeLessThanOrEqual(100);
    }
  });

  it("place au rang 0 un taux qui est le plus bas de sa fenêtre", () => {
    // Fenêtre d'un an : le dernier palier n'a rien en dessous de lui si c'est
    // aussi le plus bas — le rang compte les paliers strictement inférieurs.
    const s = situerTaux("livret-a", { anneesRetenues: 15, aujourdhui: AUJ });
    const plusBas = s.points.filter((p) => p.taux < s.courant).length;
    expect(s.rang).toBeCloseTo((plusBas / s.points.length) * 100, 6);
  });

  it("rend null quand la fenêtre ne contient pas deux points", () => {
    // Une fenêtre de zéro année ne laisse que le palier en cours, repris de
    // l'avant-fenêtre : rien à tracer, et surtout rien à comparer.
    expect(situerTaux("livret-a", { anneesRetenues: 0, aujourdhui: AUJ })).toBeNull();
  });
});
