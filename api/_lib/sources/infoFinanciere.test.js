import { describe, it, expect, vi } from "vitest";
import {
  mnemonique,
  urlDocumentAutorisee,
  nettoyerTitre,
  evenementsDepots,
  communiquesAgenda,
  combinerAgendas,
  evenementsInfoFinanciere,
} from "./infoFinanciere.js";
import { toIsoDate } from "../routes/calendar.js";

const PDF = (n) => `https://fr.ftp.opendatasoft.com/datadila/INFOFI/ACT/2026/10/FCACT0${n}_20261020.pdf`;

/** Une ligne du jeu de données, au format réel de l'API. */
const depot = ({
  le,
  titre,
  sousType = "Informations privilégiées",
  langue = "Français",
  n = 1,
  societe = "VUSIONGROUP",
}) => ({
  informationdeposee_inf_dat_emt: le,
  informationdeposee_inf_tit_inf: titre,
  informationdeposee_inf_lng_inf: langue,
  sous_type_d_information: sousType,
  identificationsociete_iso_nom_soc: societe,
  url_de_recuperation: PDF(n),
});

const CONTEXTE = { formaterDate: toIsoDate, aujourdhui: "2026-10-24" };

describe("mnemonique", () => {
  it("dérive le mnémonique Euronext d'un symbole parisien", () => {
    expect(mnemonique("VU.PA")).toBe("VU");
    expect(mnemonique("alkal.pa")).toBe("ALKAL");
  });

  it("ignore les autres places", () => {
    expect(mnemonique("AAPL")).toBeNull();
    expect(mnemonique("ADYEN.AS")).toBeNull();
  });

  it("refuse ce qui pourrait altérer la requête", () => {
    // La valeur est insérée dans une clause ODSQL entre guillemets.
    expect(mnemonique('VU" or "1"="1.PA')).toBeNull();
    expect(mnemonique("")).toBeNull();
    expect(mnemonique(null)).toBeNull();
  });
});

describe("urlDocumentAutorisee", () => {
  it("accepte un PDF de l'entrepôt de la DILA", () => {
    expect(urlDocumentAutorisee(PDF(1))).toBe(true);
  });

  it("refuse tout le reste", () => {
    expect(urlDocumentAutorisee("http://fr.ftp.opendatasoft.com/datadila/INFOFI/x.pdf")).toBe(false);
    expect(urlDocumentAutorisee("https://fr.ftp.opendatasoft.com/autre/x.pdf")).toBe(false);
    expect(urlDocumentAutorisee("https://fr.ftp.opendatasoft.com.evil.example/datadila/INFOFI/x.pdf")).toBe(
      false
    );
    expect(urlDocumentAutorisee("https://fr.ftp.opendatasoft.com/datadila/INFOFI/x.html")).toBe(false);
    expect(urlDocumentAutorisee("https://169.254.169.254/datadila/INFOFI/x.pdf")).toBe(false);
    expect(urlDocumentAutorisee("pas une url")).toBe(false);
  });
});

describe("nettoyerTitre", () => {
  it("retire le nom de la société en capitales", () => {
    expect(nettoyerTitre("THERMADOR GROUPE : publication du chiffre d'affaires semestriel 2026")).toBe(
      "Publication du chiffre d'affaires semestriel 2026"
    );
  });

  it("coupe un titre long à son premier séparateur", () => {
    expect(
      nettoyerTitre(
        "Chiffre d'affaires du 3ème trimestre 2026 - Forte croissance au troisième trimestre, portée par la dynamique commerciale"
      )
    ).toBe("Chiffre d'affaires du 3ème trimestre 2026");
  });

  it("garde un titre court intact", () => {
    expect(nettoyerTitre("Vusion - Rapport financier semestriel 2026")).toBe(
      "Vusion - Rapport financier semestriel 2026"
    );
  });
});

describe("evenementsDepots", () => {
  it("garde la version française quand la société dépose dans les deux langues", () => {
    // Air Liquide a déposé l'anglais DEUX JOURS avant le français : un
    // dédoublonnage par jour laissait passer les deux.
    const evts = evenementsDepots(
      [
        depot({
          le: "2026-07-09T06:00:00+00:00",
          titre: "Air Liquide to invest over 200M USD in Texas",
          langue: "Anglais",
        }),
        depot({
          le: "2026-07-11T06:00:00+00:00",
          titre: "Air Liquide va investir plus de 200 millions USD au Texas",
        }),
      ],
      "AI.PA",
      CONTEXTE
    );
    expect(evts).toHaveLength(1);
    expect(evts[0].label).toMatch(/va investir/);
  });

  it("couvre une société qui ne dépose qu'en anglais", () => {
    const evts = evenementsDepots(
      [
        depot({
          le: "2026-10-01T06:00:00+00:00",
          titre: "Q3 2026 revenue",
          sousType: "Information financière trimestrielle",
          langue: "Anglais",
        }),
      ],
      "XX.PA",
      CONTEXTE
    );
    expect(evts).toHaveLength(1);
  });

  it("type chaque dépôt et le tient pour confirmé", () => {
    const evts = evenementsDepots(
      [
        depot({
          le: "2026-10-20T15:40:00+00:00",
          titre: "Chiffre d'affaires du 3ème trimestre 2026",
          sousType: "Information financière trimestrielle",
          n: 1,
        }),
        depot({
          le: "2026-09-21T15:40:00+00:00",
          titre: "Résultats du 1er semestre 2026 : forte croissance",
          n: 2,
        }),
        depot({
          le: "2026-09-23T17:30:00+00:00",
          titre: "Vusion - Rapport financier semestriel 2026",
          sousType: "Rapports financiers et d'audit semestriels/examens réduits",
          n: 3,
        }),
        depot({ le: "2026-09-29T06:00:00+00:00", titre: "JB Hi-Fi choisit Vusion", n: 4 }),
      ],
      "VU.PA",
      CONTEXTE
    );
    const parDate = Object.fromEntries(evts.map((e) => [e.date, e]));
    expect(parDate["2026-10-20"].type).toBe("Chiffre d'affaires");
    expect(parDate["2026-09-21"].type).toBe("Résultats");
    expect(parDate["2026-09-23"]).toMatchObject({
      type: "Communication",
      label: "Rapport financier semestriel",
    });
    expect(parDate["2026-09-29"].type).toBe("Communication");
    expect(evts.every((e) => e.statut === "confirme" && e.fournisseur === "info-financiere" && e.lien)).toBe(
      true
    );
  });

  it("ne prend pas l'annonce d'un document préparatoire pour la publication", () => {
    const [e] = evenementsDepots(
      [
        depot({
          le: "2026-07-01T06:00:00+00:00",
          titre: "Mise en ligne du document Pre-H1 2026 Results Communication",
        }),
      ],
      "AI.PA",
      CONTEXTE
    );
    expect(e.type).toBe("Communication");
  });

  it("ne date pas un dividende ou une assemblée au jour du communiqué qui en parle", () => {
    // L'avis de convocation paraît un mois avant la réunion.
    const [e] = evenementsDepots(
      [
        depot({
          le: "2026-04-01T06:00:00+00:00",
          titre: "Avis de réunion de l'assemblée générale et dividende",
        }),
      ],
      "VU.PA",
      { ...CONTEXTE, aujourdhui: "2026-05-01" }
    );
    expect(e.type).toBe("Communication");
  });

  it("donne un libellé utile aux titres génériques", () => {
    const [e] = evenementsDepots(
      [
        depot({
          le: "2026-09-23T05:30:00+00:00",
          titre: "Informations privilégiées / Communiqué sur comptes, résultats",
        }),
      ],
      "ALSEN.PA",
      CONTEXTE
    );
    expect(e).toMatchObject({ type: "Résultats", label: "Communiqué de résultats" });
  });

  it("ignore les sous-types sans intérêt et l'historique lointain", () => {
    const evts = evenementsDepots(
      [
        depot({
          le: "2026-10-19T16:00:00+00:00",
          titre: "Déclaration des transactions sur actions propres",
          sousType: "Acquisition ou cession des actions de l'émetteur",
        }),
        depot({ le: "2026-03-01T16:00:00+00:00", titre: "Résultats annuels 2025" }),
      ],
      "LSS.PA",
      CONTEXTE
    );
    expect(evts).toEqual([]);
  });

  it("date le dépôt à l'heure de Paris", () => {
    // 23 h 30 UTC le 1er décembre, c'est déjà le 2 à Paris.
    const [e] = evenementsDepots([depot({ le: "2026-12-01T23:30:00+00:00", titre: "Communiqué" })], "VU.PA", {
      ...CONTEXTE,
      aujourdhui: "2026-12-05",
    });
    expect(e.date).toBe("2026-12-02");
  });
});

describe("communiquesAgenda", () => {
  it("choisit les plus récents communiqués susceptibles de porter un agenda", () => {
    const retenus = communiquesAgenda([
      depot({
        le: "2026-10-20T15:40:00+00:00",
        titre: "Q3 2026 Sales",
        sousType: "Information financière trimestrielle",
        langue: "Anglais",
        n: 1,
      }),
      depot({
        le: "2026-10-20T15:40:00+00:00",
        titre: "Chiffre d'affaires du T3 2026",
        sousType: "Information financière trimestrielle",
        n: 2,
      }),
      depot({ le: "2026-09-29T06:00:00+00:00", titre: "JB Hi-Fi choisit Vusion", n: 3 }),
      depot({
        le: "2026-09-21T15:40:00+00:00",
        titre: "Premier semestre 2026 : amélioration de la performance",
        n: 4,
      }),
      depot({ le: "2026-07-30T15:40:00+00:00", titre: "Chiffre d'affaires du S1", n: 5 }),
      depot({ le: "2026-06-01T15:40:00+00:00", titre: "Résultats annuels", n: 6 }),
    ]);
    // Une seule langue, pas le communiqué commercial, au plus trois.
    expect(retenus.map((d) => d.url_de_recuperation)).toEqual([PDF(2), PDF(4), PDF(5)]);
  });
});

describe("combinerAgendas", () => {
  it("laisse le communiqué le plus récent trancher une date déplacée", () => {
    const recent = [{ type: "Résultats", date: "2027-02-25", label: "Résultats annuels" }];
    const ancien = [
      { type: "Résultats", date: "2027-02-18", label: "Résultats annuels" },
      { type: "Assemblée Générale", date: "2027-05-12", label: "Assemblée générale" },
    ];
    expect(combinerAgendas([recent, ancien]).map((e) => e.date)).toEqual(["2027-02-25", "2027-05-12"]);
  });
});

describe("evenementsInfoFinanciere", () => {
  const maintenant = new Date("2026-10-24T08:00:00Z");

  it("rend publications et rendez-vous annoncés, sans toucher aux autres places", async () => {
    const lireDepotsSociete = vi.fn(async () => [
      depot({
        le: "2026-10-20T15:40:00+00:00",
        titre: "Chiffre d'affaires du T3 2026",
        sousType: "Information financière trimestrielle",
        n: 11,
      }),
    ]);
    const lireTexte = vi.fn(
      async () => "Prochains rendez-vous • 18 novembre 2026 : Capital Markets Day à Paris"
    );

    const evts = await evenementsInfoFinanciere(["VU1.PA", "AAPL"], {
      formaterDate: toIsoDate,
      maintenant,
      lireDepotsSociete,
      lireTexte,
    });

    expect(lireDepotsSociete).toHaveBeenCalledTimes(1);
    expect(lireDepotsSociete.mock.calls[0][0]).toBe("VU1");
    const rdv = evts.find((e) => e.date === "2026-11-18");
    expect(rdv).toMatchObject({
      ticker: "VU1.PA",
      type: "Communication",
      label: "Capital Markets Day à Paris",
      statut: "confirme",
      fournisseur: "info-financiere",
      annonceLe: "2026-10-20",
      lien: PDF(11),
    });
    expect(evts.some((e) => e.date === "2026-10-20" && e.type === "Chiffre d'affaires")).toBe(true);
  });

  it("rend les publications même quand la lecture des PDF dépasse le budget", async () => {
    const lireDepotsSociete = async () => [
      depot({
        le: "2026-10-15T06:00:00+00:00",
        titre: "CA T3 2026",
        sousType: "Information financière trimestrielle",
        n: 12,
      }),
    ];
    const lireTexte = () => new Promise(() => {}); // ne répond jamais
    const evts = await evenementsInfoFinanciere(["VU2.PA"], {
      formaterDate: toIsoDate,
      maintenant,
      budgetMs: 30,
      lireDepotsSociete,
      lireTexte,
    });
    expect(evts).toHaveLength(1);
    expect(evts[0].type).toBe("Chiffre d'affaires");
  });

  it("absorbe l'échec de la source", async () => {
    const lireDepotsSociete = async () => {
      throw new Error("HTTP 503");
    };
    await expect(
      evenementsInfoFinanciere(["VU3.PA"], { formaterDate: toIsoDate, maintenant, lireDepotsSociete })
    ).resolves.toEqual([]);
  });
});
