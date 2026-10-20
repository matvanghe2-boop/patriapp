import { describe, it, expect } from "vitest";
import { joursDepuis } from "./useMaintenant";

const JOUR = 86400000;
const MAINTENANT = Date.parse("2026-10-20T12:00:00Z");

describe("joursDepuis", () => {
  it("compte les jours pleins écoulés", () => {
    expect(joursDepuis(new Date(MAINTENANT - 3 * JOUR).toISOString(), MAINTENANT)).toBe(3);
    expect(joursDepuis(new Date(MAINTENANT - 5000).toISOString(), MAINTENANT)).toBe(0);
  });

  it("ne renvoie jamais un nombre négatif pour une date juste postérieure", () => {
    // `maintenant` est figé au rendu : un profil enregistré quelques secondes
    // plus tard affichait « Mis à jour il y a -1 jour ».
    expect(joursDepuis(new Date(MAINTENANT + 4000).toISOString(), MAINTENANT)).toBe(0);
  });

  it("lit une date future (horloge décalée) comme aujourd'hui", () => {
    expect(joursDepuis(new Date(MAINTENANT + 2 * JOUR).toISOString(), MAINTENANT)).toBe(0);
  });

  it("renvoie null sans date exploitable", () => {
    expect(joursDepuis(null, MAINTENANT)).toBeNull();
    expect(joursDepuis("pas une date", MAINTENANT)).toBeNull();
  });
});
