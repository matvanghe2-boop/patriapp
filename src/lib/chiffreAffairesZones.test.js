import { describe, it, expect } from "vitest";
import { ZONES, ZONE_DU_PAYS, REPARTITION_CA, repartitionCaDe, partsDuChiffreAffaires } from "./chiffreAffairesZones";
import { INDICES } from "./compositionEtf";
import { estPaysAgrege } from "./exposition";
import { PLACES, PLACE_SANS_SUFFIXE } from "../../shared/eligibilitePea.js";

// Totaux publiés, pour vérifier qu'aucune ligne n'a été oubliée ou mal
// recopiée : la somme des lignes doit les retrouver au centime près.
const TOTAUX_PUBLIES = { "DG.PA": 74599, "SU.PA": 40152, "AI.PA": 26940.2, "VU.PA": 1472.0 };

describe("catalogue du chiffre d'affaires par zone", () => {
  it("porte sa source, son exercice et sa date, pour que son âge se voie", () => {
    for (const r of Object.values(REPARTITION_CA)) {
      expect(r.societe).toBeTruthy();
      expect(r.source).toBeTruthy();
      expect(r.url).toMatch(/^https:\/\//);
      expect(r.exercice).toBeGreaterThan(2000);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("retrouve le total publié de chaque société", () => {
    for (const [ticker, total] of Object.entries(TOTAUX_PUBLIES)) {
      const somme = REPARTITION_CA[ticker].lignes.reduce((s, l) => s + l.montant, 0);
      expect(somme).toBeCloseTo(total, 6);
    }
  });

  it("range chaque ligne dans UNE zone existante, ou la laisse en bloc", () => {
    for (const r of Object.values(REPARTITION_CA)) {
      for (const l of r.lignes) {
        expect(l.montant).toBeGreaterThan(0);
        expect(Boolean(l.zone) !== Boolean(l.bloc)).toBe(true);
        if (l.zone) expect(ZONES).toContain(l.zone);
      }
    }
  });

  it("donne des parts qui somment à 1", () => {
    for (const ticker of Object.keys(REPARTITION_CA)) {
      const parts = partsDuChiffreAffaires(repartitionCaDe(ticker));
      expect(parts.reduce((s, p) => s + p.part, 0)).toBeCloseTo(1, 9);
    }
    expect(repartitionCaDe("vu.pa").societe).toBe("VusionGroup");
    expect(repartitionCaDe("XYZ.PA")).toBeNull();
    expect(partsDuChiffreAffaires(null)).toEqual([]);
  });

  it("connaît la zone de chaque pays de cotation et de chaque pays d'indice", () => {
    const pays = [
      ...Object.values(PLACES).map((p) => p.pays),
      PLACE_SANS_SUFFIXE.pays,
      ...Object.values(INDICES).flatMap((i) => Object.keys(i.pays).filter((p) => !estPaysAgrege(p))),
    ];
    for (const p of pays) expect(ZONES).toContain(ZONE_DU_PAYS[p]);
  });
});
