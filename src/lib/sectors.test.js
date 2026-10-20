import { describe, it, expect } from "vitest";
import { getSector, NON_CLASSE, SECTOR_COLORS, SECTOR_HEX } from "./sectors";

describe("classement sectoriel des lignes détenues", () => {
  it.each([
    // Rangées selon ce qu'elles font réellement, pas selon l'étiquette commode.
    ["AI.PA", "Matériaux"], // gaz industriels et hydrogène : des matières de base
    ["SU.PA", "Industrie"], // équipements électriques, même portés par la transition
    ["DG.PA", "Utilities & infrastructures"], // concessions : autoroutes, aéroports
    ["VIE.PA", "Utilities & infrastructures"], // eau, déchets, énergie
    ["VU.PA", "Technologie"], // étiquettes électroniques et logiciel
    ["TTE.PA", "Énergie"],
    ["SAN.PA", "Santé & pharmacie"],
  ])("%s → %s", (ticker, secteur) => {
    expect(getSector(ticker)).toBe(secteur);
  });

  it("dit « Non classé » plutôt que d'inventer un secteur « Autre »", () => {
    // Un ETF monde couvre tous les secteurs : l'appeler « Autre » en faisait
    // un secteur de plus, qui dominait la répartition.
    expect(getSector("CW8.PA")).toBe(NON_CLASSE);
    expect(getSector("")).toBe(NON_CLASSE);
  });

  it("donne une couleur à chaque secteur employé", () => {
    for (const s of ["Matériaux", "Utilities & infrastructures", NON_CLASSE]) {
      expect(SECTOR_COLORS[s]).toBeDefined();
      expect(SECTOR_HEX[s]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
