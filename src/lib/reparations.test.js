import { describe, it, expect } from "vitest";
import { reparationsAFaire, appliquerReparations, REPARATIONS } from "./reparations";
import { ajouterMouvement, soldeAu } from "./livretsMouvements";

/*
 * Le cas réel, rejoué sur des données inventées : un PEL créé avec son solde
 * (15 135 €), ses versements du 7 septembre saisis ensuite comme mouvements,
 * puis le solde corrigé au crayon le 27 octobre.
 */
const CATALOGUE = [{ id: "test-ajustement", livretId: "pel", mouvementId: "ajust" }];

function pelAbime() {
  let pel = { id: "pel", name: "PEL", balance: 15135, rate: 0.014, ouverture: "2026-09-01" };
  pel = ajouterMouvement(pel, { id: "d1", date: "2026-09-07", montant: 10000, nature: "depot" });
  pel = ajouterMouvement(pel, { id: "d2", date: "2026-09-07", montant: 5000, nature: "depot" });
  // La correction au crayon : un ajustement de l'écart, daté du jour.
  pel = ajouterMouvement(pel, { id: "ajust", date: "2026-10-27", montant: -15000, nature: "ajustement" });
  return pel;
}

// Compte courant : 2 420 € début septembre, +10 000 € le 4, puis le 7 :
// −10 000 € et −5 000 € vers le PEL, +10 000 € reçus.
const RELEVES = [{ id: "r9", debut: "2026-09-01", fin: "2026-09-30", soldeDebut: 242000, soldeFin: 742000 }];
const OPERATIONS = [
  { id: "o1", releveId: "r9", ordre: 1, date: "2026-09-04", montant: 1000000 },
  { id: "o2", releveId: "r9", ordre: 2, date: "2026-09-07", montant: -1000000 },
  { id: "o3", releveId: "r9", ordre: 3, date: "2026-09-07", montant: 1000000 },
  { id: "o4", releveId: "r9", ordre: 4, date: "2026-09-07", montant: -500000 },
];
const BOURSE_HISTORY = [{ date: "2026-09-01", valeur: 12800 }, { date: "2026-09-04", valeur: 12850 }, { date: "2026-09-07", valeur: 12830 }];

describe("réparation de l'ajustement fantôme du PEL", () => {
  it("le solde du PEL est juste, mais son historique le fait exister avant ses versements", () => {
    const pel = pelAbime();
    expect(pel.balance).toBe(15135);
    expect(soldeAu(pel, "2026-09-03")).toBe(15135);
  });

  it("vise un mouvement précis, une seule fois", () => {
    const livrets = [pelAbime()];
    expect(reparationsAFaire(livrets, [], CATALOGUE)).toHaveLength(1);
    expect(reparationsAFaire(livrets, ["test-ajustement"], CATALOGUE)).toHaveLength(0);
    expect(reparationsAFaire([{ id: "pel", mouvements: [] }], [], CATALOGUE)).toHaveLength(0);
  });

  it("retire l'ajustement sans toucher au solde, puis recalcule la courbe", () => {
    const historique = [
      { id: "h3", date: "2026-09-03", value: 35055, reconstitue: true },
      { id: "h4", date: "2026-09-04", value: 45070, reconstitue: true },
      { id: "h7", date: "2026-09-07", value: 35385, reconstitue: true },
      { id: "hm", date: "2026-09-05", value: 99999, manual: true },
    ];
    const r = appliquerReparations({
      reparations: reparationsAFaire([pelAbime()], [], CATALOGUE),
      livrets: [pelAbime()],
      historique,
      compteOperations: OPERATIONS,
      compteReleves: RELEVES,
      bourse: { positions: [{ ticker: "CW8.PA" }] },
      bourseHistory: BOURSE_HISTORY,
      jusquA: "2026-09-07",
      now: new Date("2026-09-08T12:00:00"),
    });
    const pel = r.livrets[0];
    expect(pel.balance).toBe(15135);
    expect(pel.mouvements.map((m) => m.id)).toEqual(["d1", "d2"]);
    expect(soldeAu(pel, "2026-09-03")).toBe(135);
    expect(r.details).toEqual([{ nom: "PEL", date: "2026-10-27", montant: -15000 }]);

    const valeur = (date) => r.historique.find((h) => h.date === date)?.value;
    // Avant le 4 : compte courant 2 420 + Bourse 12 800 + PEL 135.
    expect(valeur("2026-09-03")).toBe(15355);
    // Le 4 : les 10 000 € reçus ne comptent plus qu'une fois.
    expect(valeur("2026-09-04")).toBe(25405);
    // Le 7 : rien ne change, c'était déjà juste.
    expect(valeur("2026-09-07")).toBe(35385);
    // Un point saisi à la main n'est jamais touché.
    expect(valeur("2026-09-05")).toBe(99999);
  });

  it("vise bien l'ajustement du PEL dans le catalogue réel", () => {
    expect(REPARATIONS.map((r) => r.id)).toContain("pel-ajustement-fantome-2026-10");
  });
});
