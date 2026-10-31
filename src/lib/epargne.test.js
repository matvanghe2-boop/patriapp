import { describe, it, expect } from "vitest";
import {
  ajouterMois, tauxNetDepuisBrut, projectionVirement, verifierVirement, dateObjectif, serieSoldeLivret, serieVarie,
  interetsFinAnnee, boostsAFinir, rendementReel, manqueMatelas, enveloppesEnDepassement, livretsReglementes,
  eligibiliteLep, scenariosRevision, ageFiscal, PLAFONDS_LEP, deMot,
} from "./epargne";
import { interetsQuinzaines } from "./livretsMouvements";
import { elementsAFaire } from "./aFaire";

const AUJ = "2026-10-30";

describe("calendrier", () => {
  it("élide « de » devant une voyelle", () => {
    expect(deMot("octobre")).toBe("d'octobre");
    expect(deMot("mars")).toBe("de mars");
  });

  it("ajoute des mois sans déborder en fin de mois", () => {
    expect(ajouterMois("2026-01-31", 1)).toBe("2026-02-28");
    expect(ajouterMois("2026-11-15", 3)).toBe("2027-02-15");
    expect(ajouterMois("2026-03-10", -4)).toBe("2025-11-10");
  });
});

describe("fiscalité et taux boostés", () => {
  it("déduit la flat tax d'un taux brut", () => {
    expect(tauxNetDepuisBrut(3, 30)).toBeCloseTo(2.1, 6);
    expect(tauxNetDepuisBrut("", 30)).toBeNull();
  });

  it("calcule les intérêts au taux boosté puis au taux d'après", () => {
    const livret = { name: "Livret Boost", balance: 1200, rate: 0.04, boost: { fin: "2026-03-31", tauxApres: 0.01 } };
    const { total } = interetsQuinzaines(livret, 2026);
    // 6 quinzaines à 4 % puis 18 à 1 % sur 1 200 € : 12 + 9 = 21 €.
    expect(total).toBeCloseTo(21, 6);
  });

  it("signale un boost qui se termine bientôt ou qui est déjà fini", () => {
    const livrets = [
      { id: "a", name: "A", boost: { fin: "2026-11-05", tauxApres: 0.01 } },
      { id: "b", name: "B", boost: { fin: "2026-10-01", tauxApres: 0.01 } },
      { id: "c", name: "C", boost: { fin: "2027-02-01", tauxApres: 0.01 } },
    ];
    expect(boostsAFinir(livrets, { aujourdhui: AUJ }).map((b) => [b.livret.id, b.jours])).toEqual([["b", -29], ["a", 6]]);
  });
});

describe("virement programmé", () => {
  const livret = { id: "la", name: "Livret A", balance: 22000, virement: { montant: 400, jour: 5 } };

  it("annonce le mois où le plafond sera atteint", () => {
    const p = projectionVirement(livret, { aujourdhui: AUJ });
    // 950 € de place : trois virements, le dernier en janvier.
    expect(p).toMatchObject({ plafond: 22950, moisRestants: 3, datePlafond: "2027-01-05" });
    expect(projectionVirement({ ...livret, balance: 22950 }, { aujourdhui: AUJ }).atteint).toBe(true);
    expect(projectionVirement({ name: "Compte", balance: 0, virement: { montant: 50, jour: 1 } }, { aujourdhui: AUJ }).datePlafond).toBeNull();
  });

  it("retrouve le virement sur le relevé, ou constate son absence", () => {
    const op = (date, montant, famille = "interne") => ({ date, montant, famille });
    const vu = verifierVirement(livret, [op("2026-10-06", -40000), op("2026-10-28", -1000, "depense")]);
    expect(vu).toMatchObject({ statut: "vu", date: "2026-10-06", mois: "2026-10" });
    const absent = verifierVirement(livret, [op("2026-10-06", -30000), op("2026-10-28", -1000, "depense")]);
    expect(absent).toMatchObject({ statut: "absent", mois: "2026-10" });
    // Relevé qui s'arrête avant la fenêtre du mois : on juge le mois d'avant.
    expect(verifierVirement(livret, [op("2026-09-05", -40000), op("2026-10-03", -500, "depense")])).toMatchObject({ statut: "vu", mois: "2026-09" });
    expect(verifierVirement(livret, []).statut).toBe("inconnu");
  });
});

describe("objectif et historique", () => {
  const mouvements = [
    { id: "1", date: "2026-06-10", nature: "depot", montant: 300 },
    { id: "2", date: "2026-08-10", nature: "depot", montant: 300 },
    { id: "3", date: "2026-10-10", nature: "depot", montant: 300 },
  ];

  it("date l'objectif au rythme réel des dépôts", () => {
    const d = dateObjectif({ balance: 2000, goal: 3500, mouvements }, { aujourdhui: AUJ });
    expect(d.rythme).toBeCloseTo(150, 6);
    expect(d).toMatchObject({ atteint: false, moisRestants: 10, source: "depots", date: "2027-08-30" });
    expect(dateObjectif({ balance: 4000, goal: 3500 }, { aujourdhui: AUJ })).toEqual({ atteint: true });
    expect(dateObjectif({ balance: 1000, goal: 3500 }, { aujourdhui: AUJ })).toBeNull();
    expect(dateObjectif({ balance: 1000, goal: 3500, virement: { montant: 500 } }, { aujourdhui: AUJ }).source).toBe("virement");
  });

  it("reconstitue la courbe du solde depuis les mouvements", () => {
    const serie = serieSoldeLivret({ balance: 2000, mouvements }, { mois: 6, aujourdhui: AUJ });
    expect(serie.map((p) => p.mois)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(serie.map((p) => p.solde)).toEqual([1100, 1400, 1400, 1700, 1700, 2000]);
    expect(serieVarie(serie)).toBe(true);
    expect(serieVarie(serieSoldeLivret({ balance: 500 }, { aujourdhui: AUJ }))).toBe(false);
  });
});

describe("intérêts de fin d'année", () => {
  it("propose l'estimation de janvier à mars, et l'écart une fois enregistrés", () => {
    const livret = { id: "x", name: "Livret bancaire", balance: 2400, rate: 0.02 };
    expect(interetsFinAnnee([livret], { aujourdhui: AUJ })).toEqual([]);
    const [l] = interetsFinAnnee([livret], { aujourdhui: "2027-01-10" });
    expect(l).toMatchObject({ annee: 2026, estime: 48, verse: null });
    // Enregistrés, les intérêts sont DANS le solde (ajouterMouvement l'a augmenté).
    const enregistre = { ...livret, balance: 2447.5, mouvements: [{ id: "i", date: "2026-12-31", nature: "interets", montant: 47.5 }] };
    expect(interetsFinAnnee([enregistre], { aujourdhui: "2027-01-10" })[0]).toMatchObject({ verse: 47.5, ecart: -0.5 });
  });
});

describe("lectures de l'ensemble", () => {
  it("chiffre le rendement réel et le matelas manquant", () => {
    const r = rendementReel({ tauxMoyenPct: 1.7, inflationPct: 1.8, total: 10000 });
    expect(r.reelPct).toBeCloseTo(-0.1, 6);
    expect(r.euros).toBeCloseTo(-10, 6);
    expect(manqueMatelas({ depensesMoisReference: 1000, disponible: 2000 })).toEqual({ objectif: 3000, manque: 1000, mois: 2 });
    expect(manqueMatelas({})).toBeNull();
  });

  it("signale les enveloppes qui dépassent le livret qui les porte", () => {
    const d = enveloppesEnDepassement(
      [{ livretId: "la", amount: 2000 }, { livretId: "la", amount: 1500 }, { livretId: null, amount: 9000 }],
      [{ id: "la", name: "Livret A", balance: 3000 }]
    );
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ total: 3500, depassement: 500 });
  });
});

describe("réglementés", () => {
  it("liste Livret A, LDDS et LEP, détenus ou non", () => {
    const r = livretsReglementes([{ id: "1", name: "Mon LDDS", balance: 1000 }]);
    expect(r.map((x) => [x.libelle, Boolean(x.detenu)])).toEqual([["Livret A", false], ["LDDS", true], ["LEP", false]]);
    expect(r[0]).toMatchObject({ plafond: 22950, tauxPct: 1.7 });
  });

  it("vérifie le droit au LEP selon le revenu et les parts", () => {
    expect(eligibiliteLep({ rfr: 18000, parts: 1 })).toMatchObject({ eligible: true, plafond: PLAFONDS_LEP.unePart });
    expect(eligibiliteLep({ rfr: 30000, parts: 2 })).toMatchObject({ eligible: true, plafond: 23028 + 2 * 6149 });
    expect(eligibiliteLep({ rfr: 30000, parts: 1.5 }).eligible).toBe(false);
    expect(eligibiliteLep({ rfr: null })).toBeNull();
  });

  it("chiffre des scénarios de révision, jamais sous le plancher de 0,5 %", () => {
    const s = scenariosRevision({ balance: 10000 }, 1.7);
    expect(s.map((x) => x.tauxPct)).toEqual([1.2, 1.5, 1.9]);
    expect(s[0].ecart).toBeCloseTo(-50, 6);
    expect(scenariosRevision({ balance: 10000 }, 0.6).map((x) => x.tauxPct)).toEqual([0.5, 0.8]);
  });
});

describe("âge fiscal", () => {
  it("met en avant le prochain jalon d'une assurance-vie ou d'un PEL", () => {
    const av = ageFiscal({ envelope: "AV", name: "Assurance-vie Linxea", ouverture: "2020-03-01" }, { aujourdhui: AUJ });
    expect(av).toMatchObject({ type: "AV", ans: 6, prochain: { ans: 8, date: "2028-03-01" } });
    const pel = ageFiscal({ name: "PEL", ouverture: "2025-06-15" }, { aujourdhui: AUJ });
    expect(pel.prochain).toMatchObject({ ans: 2, date: "2027-06-15" });
    expect(ageFiscal({ name: "Livret A", ouverture: "2020-01-01" })).toBeNull();
    expect(ageFiscal({ envelope: "AV", name: "AV" })).toBeNull();
  });
});

describe("centre « À faire »", () => {
  it("relaie la fin d'un boost, le plafond d'un virement et les intérêts à enregistrer", () => {
    const e = elementsAFaire({
      aujourdhui: "2027-01-10",
      livrets: [
        { id: "b", name: "Livret Boost", balance: 1000, rate: 0.04, boost: { fin: "2027-01-05", tauxApres: 0.01 } },
        { id: "la", name: "Livret A", balance: 22900, rate: 0.017, limit: 22950, virement: { montant: 100, jour: 5 } },
      ],
    });
    const ids = e.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["boost-b", "virement-plafond-la", "interets-2026"]));
    // Signalé par le virement, le Livret A ne l'est pas une seconde fois par la jauge.
    expect(ids).not.toContain("livret-la");
  });
});
