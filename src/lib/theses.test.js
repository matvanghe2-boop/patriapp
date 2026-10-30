import { describe, it, expect } from "vitest";
import {
  derniereRevue, aRelire, ajouterRevue, filThese, evenementsTheses, progressionObjectif, variationRecente,
  alertesPanique, couverture, photoDepuisFiche, depuisVente, bilanDecisions,
} from "./theses";

const AUJ = "2026-10-30";

describe("revues datées", () => {
  const note = { id: "n1", ticker: "AI.PA", titre: "Air Liquide", statut: "intacte", date: "2026-06-04T10:00:00.000Z" };

  it("prend la date d'écriture tant que la thèse n'a pas été relue", () => {
    expect(derniereRevue(note)).toBe(note.date);
    expect(aRelire(note, AUJ)).toBe(false);
    expect(aRelire({ ...note, date: "2026-01-02T10:00:00.000Z" }, AUJ)).toBe(true);
    expect(aRelire({ ...note, date: "2026-01-02T10:00:00.000Z", archivee: true }, AUJ)).toBe(false);
  });

  it("ajoute une relecture et aligne le statut sur elle", () => {
    const relue = ajouterRevue(note, { id: "r1", statut: "surveiller", commentaire: "  marge en baisse ", date: "2026-10-01T09:00:00.000Z" });
    expect(relue.statut).toBe("surveiller");
    expect(relue.revues).toEqual([{ id: "r1", date: "2026-10-01T09:00:00.000Z", statut: "surveiller", commentaire: "marge en baisse" }]);
    expect(derniereRevue(relue)).toBe("2026-10-01T09:00:00.000Z");
    expect(note.revues).toBeUndefined();
  });

  it("raconte le fil d'une thèse dans l'ordre, clôture comprise", () => {
    const close = {
      ...ajouterRevue(note, { id: "r1", statut: "intacte", date: "2026-07-01T09:00:00.000Z" }),
      archivee: true,
      postmortem: { date: "2026-09-01T09:00:00.000Z", decision: "bonne_decision", resultat_pct: 12 },
    };
    expect(filThese(close).map((e) => e.type)).toEqual(["ecrite", "revue", "cloture"]);
    const ev = evenementsTheses([close]);
    expect(ev.map((e) => e.type)).toEqual(["THESE", "REVUE", "CLOTURE"]);
    expect(ev[1].libelle).toBe("Thèse relue · AI.PA — intacte");
    expect(ev[2].detail).toBe("Bonne décision");
  });
});

describe("lecture face au marché", () => {
  it("situe le cours entre le prix de revient et l'objectif", () => {
    expect(progressionObjectif({ pru: 100, cours: 150, objectif: 200 }).pct).toBeCloseTo(50, 6);
    expect(progressionObjectif({ pru: 100, cours: 90, objectif: 200 }).pct).toBeCloseTo(-10, 6);
    expect(progressionObjectif({ pru: 100, cours: 210, objectif: 200 }).atteint).toBe(true);
    expect(progressionObjectif({ pru: 100, cours: 90, objectif: 80 })).toBeNull();
    expect(progressionObjectif({ pru: null, cours: 90, objectif: 200 })).toBeNull();
  });

  it("mesure la variation sur environ un mois, et se tait si la série est trop courte", () => {
    const serie = [
      { d: "2026-09-25", p: 200 },
      { d: "2026-09-30", p: 190 },
      { d: "2026-10-20", p: 180 },
      { d: "2026-10-30", p: 171 },
    ];
    const v = variationRecente(serie, { aujourdhui: AUJ });
    expect(v.depuis).toBe("2026-09-30");
    expect(v.pct).toBeCloseTo(-10, 6);
    expect(variationRecente([{ d: "2026-10-25", p: 10 }, { d: "2026-10-30", p: 9 }], { aujourdhui: AUJ })).toBeNull();
  });

  it("déclenche l'anti-panique sur une forte baisse, pas sur une thèse tout juste relue", () => {
    const notes = [
      { id: "a", ticker: "AI.PA", statut: "intacte", date: "2026-02-01" },
      { id: "b", ticker: "MC.PA", statut: "intacte", date: "2026-02-01" },
      { id: "c", ticker: "OR.PA", statut: "intacte", date: "2026-02-01", revues: [{ date: "2026-10-25", statut: "intacte" }] },
      { id: "d", ticker: "SU.PA", statut: "intacte", date: "2026-02-01" },
    ];
    const positions = [
      { ticker: "AI.PA", quantity: 10, pru: 150, current_price: 171 },
      { ticker: "MC.PA", quantity: 2, pru: 700, current_price: 560 },
      { ticker: "OR.PA", quantity: 3, pru: 400, current_price: 300 },
      { ticker: "SU.PA", quantity: 3, pru: 200, current_price: 205 },
    ];
    const series = { "AI.PA": [{ d: "2026-09-30", p: 190 }, { d: "2026-10-30", p: 171 }] };
    const a = alertesPanique({ notes, positions, series, aujourdhui: AUJ });
    expect(a.map((x) => [x.note.id, x.base])).toEqual([["b", "pru"], ["a", "mois"]]);
    expect(a[0].variationPct).toBeCloseTo(-20, 6);
  });

  it("compte les lignes du portefeuille sans thèse écrite", () => {
    const c = couverture(
      [{ ticker: "ai.pa" }, { ticker: "MC.PA", archivee: true }],
      [{ ticker: "AI.PA", quantity: 1 }, { ticker: "MC.PA", quantity: 1 }, { ticker: "CW8.PA", quantity: 0 }]
    );
    expect(c).toEqual({ lignes: 2, couvertes: 1, sansThese: ["MC.PA"] });
  });
});

describe("photo, clôture et bilan", () => {
  it("fige ce que la fiche financière disait au moment de la thèse", () => {
    const p = photoDepuisFiche({ cours: 162, devise: "EUR", per: 28.4, rendementPct: 1.9, historique: [] }, "2026-02-04");
    expect(p).toEqual({ date: "2026-02-04", cours: 162, devise: "EUR", per: 28.4, rendementPct: 1.9, piotroski: null });
    expect(photoDepuisFiche({})).toBeNull();
  });

  it("dit ce que le titre a fait depuis la dernière vente", () => {
    const ops = [
      { type: "VENTE", asset: "AI.PA", date: "2026-03-01", price: 150, quantity: 1 },
      { type: "VENTE", asset: "AI.PA", date: "2026-05-01", price: 160, quantity: 1 },
    ];
    const d = depuisVente(ops, "ai.pa", 176);
    expect(d.date).toBe("2026-05-01");
    expect(d.ecartPct).toBeCloseTo(10, 6);
    expect(depuisVente(ops, "AI.PA", 1600).ecartPct).toBeNull();
    expect(depuisVente(ops, "MC.PA", 100)).toBeNull();
  });

  it("tire un bilan des thèses clôturées", () => {
    const close = (id, decision, resultat_pct, debut, fin) => ({
      id, archivee: true, date: debut, postmortem: { decision, resultat_pct, date: fin },
    });
    const b = bilanDecisions([
      close("1", "bonne_decision", 20, "2026-01-01", "2026-03-02"),
      close("2", "bonne_decision", 10, "2026-01-01", "2026-01-31"),
      close("3", "erreur_emotion", -12, "2026-02-01", "2026-02-11"),
      { id: "4", archivee: false },
    ]);
    expect(b.total).toBe(3);
    expect(b.tauxBonnes).toBeCloseTo(66.667, 2);
    expect(b.parDecision.bonne_decision.resultatMoyen).toBe(15);
    expect(b.parDecision.erreur_emotion.nombre).toBe(1);
    expect(b.dureeMoyenneJours).toBeCloseTo(100 / 3, 6);
    expect(b.meilleure.note.id).toBe("1");
    expect(b.pire.note.id).toBe("3");
  });
});
