import { describe, it, expect } from "vitest";
import {
  prochainPrelevement, prelevementsDuMois, totaux, economiesRealisees, candidatsResiliation,
  valeurPlacee, rappelsEssais, correspond, rapprocherCompte, aboDepuisCharge, statutDe,
} from "./abonnements";

const AUJ = "2026-10-30";

describe("prochainPrelevement", () => {
  it("projette la date saisie jusqu'à aujourd'hui, selon la périodicité", () => {
    expect(prochainPrelevement({ prochaine_date: "2026-06-05" }, AUJ)).toBe("2026-11-05");
    expect(prochainPrelevement({ prochaine_date: "2026-01-15", frequence: "trimestrielle" }, AUJ)).toBe("2027-01-15");
    expect(prochainPrelevement({ prochaine_date: "2025-03-01", frequence: "annuelle" }, AUJ)).toBe("2027-03-01");
    expect(prochainPrelevement({ prochaine_date: "2026-10-01", frequence: "hebdomadaire" }, AUJ)).toBe("2026-11-05");
  });

  it("ne fait pas dériver un prélèvement du 31", () => {
    expect(prochainPrelevement({ prochaine_date: "2026-01-31" }, "2026-04-02")).toBe("2026-04-30");
    expect(prochainPrelevement({ prochaine_date: "2026-01-31" }, "2026-05-02")).toBe("2026-05-31");
  });

  it("part de la fin d'essai, et ne prévoit rien pour un abonnement résilié", () => {
    expect(prochainPrelevement({ statut: "essai", fin_essai: "2026-11-12", prochaine_date: "2026-10-12" }, AUJ)).toBe("2026-11-12");
    expect(prochainPrelevement({ statut: "resilie", prochaine_date: "2026-10-05" }, AUJ)).toBeNull();
  });
});

describe("prelevementsDuMois", () => {
  it("pose chaque prélèvement sur son jour et cumule", () => {
    const subs = [
      { id: "a", montant: 10, prochaine_date: "2026-01-05" },
      { id: "b", montant: 5, prochaine_date: "2026-08-05" },
      { id: "c", montant: 120, frequence: "annuelle", prochaine_date: "2025-12-20" },
      { id: "d", montant: 2, frequence: "hebdomadaire", prochaine_date: "2026-11-02" },
      { id: "e", montant: 9, statut: "resilie", prochaine_date: "2026-01-10" },
    ];
    const cal = prelevementsDuMois(subs, "2026-11");
    expect(cal.nbJours).toBe(30);
    expect(cal.jours.map((j) => j.jour)).toEqual([2, 5, 9, 16, 23, 30]);
    expect(cal.jours[1].total).toBe(15);
    expect(cal.total).toBe(10 + 5 + 2 * 5);
    expect(prelevementsDuMois(subs, "2026-12").jours.find((j) => j.jour === 20).total).toBe(120);
  });

  it("ne compte un essai qu'à partir de sa fin", () => {
    const essai = { id: "e", montant: 8, statut: "essai", fin_essai: "2026-11-20", prochaine_date: "2026-10-20" };
    const nov = prelevementsDuMois([essai], "2026-11");
    expect(nov.jours).toHaveLength(1);
    expect(nov.jours[0].items[0].essai).toBe(true);
    expect(prelevementsDuMois([essai], "2026-10").jours).toHaveLength(0);
  });
});

describe("totaux et économies", () => {
  it("ne totalise que ce qui coûte aujourd'hui", () => {
    const t = totaux([
      { montant: 10 },
      { montant: 60, frequence: "annuelle", statut: "a_resilier" },
      { montant: 8, statut: "essai" },
      { montant: 15, statut: "resilie" },
    ]);
    expect(t.mensuel).toBeCloseTo(15, 6);
    expect(t.annuel).toBeCloseTo(180, 6);
    expect(t.essais).toHaveLength(1);
    expect(t.resilies).toHaveLength(1);
  });

  it("compte les échéances évitées, pas un prorata", () => {
    const { total, lignes } = economiesRealisees(
      [
        { id: "m", montant: 12, prochaine_date: "2026-01-10", statut: "resilie", resilie_le: "2026-07-01" },
        { id: "a", montant: 100, frequence: "annuelle", prochaine_date: "2026-03-01", statut: "resilie", resilie_le: "2026-08-01" },
      ],
      AUJ
    );
    // Juillet → octobre : quatre prélèvements mensuels évités ; l'annuel ne
    // renouvelle qu'en mars, rien n'est encore économisé.
    expect(lignes[0].echeances).toBe(4);
    expect(lignes[1].montant).toBe(0);
    expect(total).toBe(48);
  });

  it("classe les candidats à la résiliation par coût pondéré de l'usage", () => {
    const c = candidatsResiliation([
      { id: "1", montant: 30, usage: "parfois" },
      { id: "2", montant: 10, usage: "jamais" },
      { id: "3", montant: 50, usage: "souvent" },
      { id: "4", montant: 40 },
      { id: "5", montant: 99, usage: "jamais", statut: "resilie" },
    ]);
    expect(c.map((x) => x.sub.id)).toEqual(["1", "2"]);
  });

  it("place un versement mensuel", () => {
    expect(valeurPlacee(100, 0, 10)).toBeCloseTo(12000, 6);
    expect(valeurPlacee(100, 7, 10)).toBeGreaterThan(16000);
    expect(valeurPlacee(0, 7, 10)).toBe(0);
  });
});

describe("rappelsEssais", () => {
  it("prévient de trois jours avant jusqu'au jour même", () => {
    const subs = [
      { id: "a", label: "Canal+", montant: 24.99, statut: "essai", fin_essai: "2026-10-31" },
      { id: "b", label: "Loin", statut: "essai", fin_essai: "2026-11-20" },
      { id: "c", label: "Passé", statut: "essai", fin_essai: "2026-10-20" },
    ];
    const r = rappelsEssais(subs, AUJ);
    expect(r).toHaveLength(1);
    expect(r[0].label).toMatch(/Canal\+ : premier prélèvement demain \(24,99 €\)/);
    expect(r[0].type).toBe("essai");
    expect(r[0].subId).toBe("a");
  });

  it("se tait une fois le rappel vu, sauf si l'essai est prolongé", () => {
    const vu = { id: "a", statut: "essai", fin_essai: "2026-10-31", rappelEssaiVu: "2026-10-31" };
    expect(rappelsEssais([vu], AUJ)).toEqual([]);
    expect(rappelsEssais([{ ...vu, fin_essai: "2026-11-02" }], AUJ)).toHaveLength(1);
  });
});

describe("rapprochement avec le relevé", () => {
  const op = (id, date, euros, cle) => ({ id, date, montant: -Math.round(euros * 100), famille: "depense", analyse: { cle } });

  it("reconnaît un marchand par tous les mots distinctifs du nom saisi", () => {
    expect(correspond({ label: "Netflix" }, "NETFLIX.COM")).toBe(true);
    expect(correspond({ label: "Disney+" }, "DISNEY PLUS")).toBe(true);
    expect(correspond({ label: "Salle de sport" }, "BASIC FIT")).toBe(false);
    expect(correspond({ label: "Free Box" }, "FREE MOBILE")).toBe(false);
    expect(correspond({ label: "Free Mobile" }, "FREE MOBILE")).toBe(true);
    expect(correspond({ label: "X", cleCompte: "BASIC FIT" }, "BASIC FIT")).toBe(true);
  });

  it("repère un changement de prix et sa date", () => {
    const enrichies = [
      op(1, "2026-07-03", 13.49, "NETFLIX COM"),
      op(2, "2026-08-03", 13.49, "NETFLIX COM"),
      op(3, "2026-09-03", 14.99, "NETFLIX COM"),
      op(4, "2026-10-03", 14.99, "NETFLIX COM"),
    ];
    const { verifications } = rapprocherCompte([{ id: "n", label: "Netflix", montant: 13.49 }], enrichies);
    const v = verifications.n;
    expect(v.alerte).toBe("montant");
    expect(v.depuis).toBe("2026-09-03");
    expect(v.ancien).toBe(13.49);
    expect(v.detail).toMatch(/Passé de 13,49 € à 14,99 €/);
  });

  it("signale un prélèvement qui a cessé, ou qui continue après résiliation", () => {
    const enrichies = [
      op(1, "2026-06-10", 30, "BASIC FIT"),
      op(2, "2026-07-10", 30, "BASIC FIT"),
      op(3, "2026-10-25", 5, "AUTRE CHOSE"),
      op(4, "2026-10-12", 9.99, "SPOTIFY"),
    ];
    const { verifications } = rapprocherCompte(
      [
        { id: "s", label: "Basic Fit", montant: 30 },
        { id: "p", label: "Spotify", montant: 9.99, statut: "resilie", resilie_le: "2026-09-30" },
      ],
      enrichies
    );
    expect(verifications.s.alerte).toBe("absent");
    expect(verifications.p.alerte).toBe("toujours_preleve");
  });

  it("signale un double prélèvement récent", () => {
    const enrichies = [op(1, "2026-10-02", 9.99, "SPOTIFY"), op(2, "2026-10-04", 9.99, "SPOTIFY")];
    const { verifications } = rapprocherCompte([{ id: "p", label: "Spotify", montant: 9.99 }], enrichies);
    expect(verifications.p.alerte).toBe("double");
  });

  it("ne dit rien d'un abonnement conforme, et avoue ne pas l'avoir trouvé", () => {
    const enrichies = [op(1, "2026-09-12", 9.99, "SPOTIFY"), op(2, "2026-10-12", 9.99, "SPOTIFY")];
    const { verifications } = rapprocherCompte(
      [{ id: "p", label: "Spotify", montant: 9.99 }, { id: "x", label: "Inconnu", montant: 3 }],
      enrichies
    );
    expect(verifications.p.alerte).toBeNull();
    expect(verifications.x.trouve).toBe(false);
  });

  it("propose les charges détectées qui ne sont ni suivies ni écartées", () => {
    const charges = [
      { cle: "SPOTIFY", titre: "Spotify", montant: 999, categorie: "abonnements", prochaine: "2026-11-12" },
      { cle: "BASIC FIT", titre: "Basic Fit", montant: 2999, categorie: "sport", prochaine: "2026-11-10" },
      { cle: "EDF", titre: "EDF", montant: 6500, categorie: "factures", prochaine: "2026-11-15" },
    ];
    const { detectes } = rapprocherCompte([{ id: "p", label: "Spotify" }], [], { charges, ignores: ["EDF"] });
    expect(detectes.map((c) => c.cle)).toEqual(["BASIC FIT"]);
  });

  it("prépare un abonnement depuis une charge détectée", () => {
    const abo = aboDepuisCharge({ cle: "SPOTIFY", titre: "Spotify", montant: 999, categorie: "abonnements", prochaine: "2026-11-12" }, "id1");
    expect(abo).toMatchObject({ id: "id1", category: "Streaming", montant: 9.99, cleCompte: "SPOTIFY", statut: "actif" });
    expect(statutDe(abo)).toBe("actif");
    expect(aboDepuisCharge({ cle: "EDF", titre: "EDF", montant: 6500, categorie: "factures" }, "id2").category).toBe("Énergie");
  });
});
