import { describe, it, expect } from "vitest";
import { etatSeance, feriesEuronext, paques } from "./seance";

describe("séance d'Euronext Paris", () => {
  it("calcule Pâques", () => {
    expect(paques(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(paques(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
  });

  it("connaît les six fériés boursiers, et pas les autres", () => {
    const f = feriesEuronext(2026);
    expect([...f].sort()).toEqual(["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-12-25", "2026-12-26"]);
    expect(f.has("2026-07-14")).toBe(false);
  });

  it("lit l'heure de Paris, quel que soit le fuseau de l'appareil", () => {
    // Mardi 10 novembre 2026 : Paris est en UTC+1.
    expect(etatSeance(new Date("2026-11-10T07:59:00Z"))).toEqual({ ouvert: false, raison: "avant" });
    expect(etatSeance(new Date("2026-11-10T08:00:00Z"))).toEqual({ ouvert: true, raison: "seance" });
    expect(etatSeance(new Date("2026-11-10T16:29:00Z")).ouvert).toBe(true);
    expect(etatSeance(new Date("2026-11-10T16:30:00Z"))).toEqual({ ouvert: false, raison: "apres" });
  });

  it("ferme le week-end et les jours fériés", () => {
    expect(etatSeance(new Date("2026-11-14T10:00:00Z")).raison).toBe("week-end");
    expect(etatSeance(new Date("2026-12-25T10:00:00Z")).raison).toBe("ferie");
  });
});
