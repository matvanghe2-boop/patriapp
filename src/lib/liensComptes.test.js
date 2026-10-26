import { describe, it, expect } from "vitest";
import { enrichir } from "./compteCourant";
import {
  mouvementsAutresComptes, rapprocher, estimerSolde, virementsSansCorrespondance, enregistrerDansBourse,
  enregistrerSurLivret,
} from "./liensComptes";

const releves = [{ id: "s", debut: "2026-09-01", fin: "2026-09-30", soldeDebut: 237430, soldeFin: 733554 }];
const bourse = (operations) => ({ envelope: "PEA", cash_pocket: 0, positions: [], operations });
const versement = (id, date, amount, extra = {}) => ({ id, date, type: "VERSEMENT", amount, asset: null, ...extra });

describe("mouvementsAutresComptes", () => {
  it("lit les versements du PEA et les dépôts des livrets, du point de vue du compte courant", () => {
    const m = mouvementsAutresComptes({
      bourse: bourse([versement("v1", "2026-10-02", 2000), { id: "r1", date: "2026-10-20", type: "RETRAIT", amount: 300 }]),
      livrets: [{ id: "la", name: "Livret A", mouvements: [{ id: "d1", date: "2026-10-05", montant: 500, nature: "depot" }] }],
    });
    expect(m.map((x) => [x.compte, x.montant])).toEqual([
      ["PEA", -200000],
      ["Livret A", -50000],
      ["PEA", 30000],
    ]);
  });
});

describe("estimerSolde", () => {
  it("retire du solde un versement PEA saisi après le dernier relevé, sans saisie dans le compte courant", () => {
    const mouvements = mouvementsAutresComptes({ bourse: bourse([versement("v1", "2026-10-02", 2000)]) });
    const e = estimerSolde({ releves, mouvements });
    expect(e).toMatchObject({ solde: 533554, ajustement: -200000 });
    expect(e.autres.map((m) => m.id)).toEqual(["v1"]);
  });

  it("ne compte pas deux fois un virement saisi à la fois dans PEA & Bourse et dans le compte courant", () => {
    const mouvements = mouvementsAutresComptes({ bourse: bourse([versement("v1", "2026-10-02", 2000)]) });
    const provisoires = [{ id: "p1", date: "2026-10-03", libelle: "Virement PEA", montant: -200000 }];
    const e = estimerSolde({ releves, provisoires, mouvements });
    expect(e.ajustement).toBe(-200000);
    expect(e.provisoiresEnDouble.map((p) => p.id)).toEqual(["p1"]);
  });

  it("ne rajoute pas un versement que la banque a déjà passé dans le relevé, quelques jours avant sa saisie", () => {
    const operations = enrichir(
      [{ id: "o1", date: "2026-09-30", montant: -200000, libelle: "VIR Virement depuis BoursoBank", complements: ["MARTIN PAUL"] }],
      { titulaire: "MARTIN PAUL" }
    );
    const mouvements = mouvementsAutresComptes({ bourse: bourse([versement("v1", "2026-10-01", 2000)]) });
    const e = estimerSolde({ releves, operations, mouvements });
    expect(e.ajustement).toBe(0);
    expect(e.liens.get("o1").id).toBe("v1");
  });

  it("ignore un versement marqué comme payé depuis une autre banque", () => {
    const mouvements = mouvementsAutresComptes({
      bourse: bourse([versement("v1", "2026-10-02", 2000, { horsCompteCourant: true })]),
    });
    const e = estimerSolde({ releves, mouvements });
    expect(e.ajustement).toBe(0);
    expect(e.horsCompte.map((m) => m.id)).toEqual(["v1"]);
  });

  it("garde le solde du relevé tel quel quand rien ne s'est passé depuis", () => {
    expect(estimerSolde({ releves })).toMatchObject({ solde: 733554, ajustement: 0 });
    expect(estimerSolde({ releves: [] })).toBeNull();
  });
});

describe("rapprochement à l'import", () => {
  const operations = enrichir(
    [
      { id: "o1", date: "2026-09-07", montant: -1000000, libelle: "VIR M MARTIN PAUL", complements: [] },
      { id: "o2", date: "2026-09-07", montant: -500000, libelle: "VIR Virement depuis BoursoBank", complements: ["MARTIN PAUL"] },
      { id: "o3", date: "2026-09-25", montant: -2000, libelle: "VIR INST WINAMAX", complements: [] },
    ],
    { titulaire: "MARTIN PAUL" }
  );

  it("rattache un virement à un versement de même montant à quelques jours près, jamais à un virement vers un tiers", () => {
    const mouvements = mouvementsAutresComptes({
      bourse: bourse([versement("v1", "2026-09-08", 5000), versement("v2", "2026-09-25", 20)]),
    });
    const liens = rapprocher(operations, mouvements);
    expect(liens.get("o2").id).toBe("v1");
    expect(liens.has("o3")).toBe(false);
  });

  it("liste les virements vers ses comptes qu'aucun onglet ne connaît", () => {
    const mouvements = mouvementsAutresComptes({ bourse: bourse([versement("v1", "2026-09-08", 5000)]) });
    const liens = rapprocher(operations, mouvements);
    expect(virementsSansCorrespondance(operations, liens).map((o) => o.id)).toEqual(["o1"]);
  });

  it("enregistre un virement du relevé comme versement PEA ou comme dépôt sur un livret", () => {
    const op = operations[0];
    const b = enregistrerDansBourse(bourse([]), op);
    expect(b.operations[0]).toMatchObject({ type: "VERSEMENT", amount: 10000, date: "2026-09-07", origine: "compte-courant" });
    const livret = enregistrerSurLivret({ id: "la", name: "Livret A", balance: 0, mouvements: [] }, op);
    expect(livret.balance).toBe(10000);
    expect(livret.mouvements[0]).toMatchObject({ nature: "depot", montant: 10000 });
  });
});
