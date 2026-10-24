import { describe, it, expect } from "vitest";
import { lireAgenda, typerLibelle, nettoyerLibelle, normaliserTexte } from "./agendaCommunique.js";

// Les extraits ci-dessous reprennent la mise en forme RÉELLE des communiqués
// déposés (texte tel que le rend l'extraction PDF), raccourcie à l'essentiel.
const AUJOURDHUI = "2026-10-24";

describe("lireAgenda — encadrés d'agenda", () => {
  it("lit un agenda « date : libellé » et en écarte le passé (VusionGroup, T3 2026)", () => {
    const texte =
      "Calendrier financier 2026 • 20 octobre 2026 (après bourse) : Chiffre d'affaires du 3\nème\n trimestre 2026 " +
      "Prochains évènements dédiés aux investisseurs • 18 novembre 2026 : Capital Markets Day à Paris " +
      "• 19 novembre 2026 : Consumer Conference de Bank of America à Paris " +
      "• 30 novembre 2026 : European Conference de Berenberg à Londres Communiqué de presse 20 octobre 2026 – 17h40";
    const agenda = lireAgenda(texte, { publieLe: "2026-10-20", aujourdhui: AUJOURDHUI });
    expect(agenda.map((e) => [e.date, e.label])).toEqual([
      ["2026-11-18", "Capital Markets Day à Paris"],
      ["2026-11-19", "Consumer Conference de Bank of America à Paris"],
      ["2026-11-30", "European Conference de Berenberg à Londres"],
    ]);
    expect(agenda.every((e) => e.type === "Communication" && e.origine === "agenda")).toBe(true);
  });

  it("ne décale pas les libellés quand le titre de l'encadré se prolonge", () => {
    // « dédiés aux investisseurs » passait pour le libellé de la première
    // date, et chaque libellé glissait d'un cran vers la date suivante.
    const texte =
      "Prochains évènements dédiés aux investisseurs • 18 novembre 2026 : Capital Markets Day " +
      "• 24 novembre 2026 : Salon Investir Day";
    const agenda = lireAgenda(texte, { aujourdhui: AUJOURDHUI });
    expect(agenda[0]).toMatchObject({ date: "2026-11-18", label: "Capital Markets Day" });
    expect(agenda[1]).toMatchObject({ date: "2026-11-24", label: "Salon Investir Day" });
  });

  it("lit un agenda « libellé : date »", () => {
    const texte =
      "Agenda financier • Chiffre d'affaires du 4e trimestre 2026 : 29 janvier 2027 " +
      "• Résultats annuels 2026 : 18 février 2027 • Assemblée générale : 12 mai 2027";
    const agenda = lireAgenda(texte, { aujourdhui: AUJOURDHUI });
    expect(agenda.map((e) => [e.date, e.type, e.label])).toEqual([
      ["2027-01-29", "Chiffre d'affaires", "Chiffre d'affaires du 4e trimestre 2026"],
      ["2027-02-18", "Résultats", "Résultats annuels 2026"],
      ["2027-05-12", "Assemblée Générale", "Assemblée générale"],
    ]);
  });

  it("lit les formats anglais et numériques", () => {
    const texte =
      "Financial calendar - Full-year 2026 results: February 18, 2027 - Q1 2027 sales: 22/04/2027 - AGM: 12 May 2027";
    const agenda = lireAgenda(texte, { aujourdhui: AUJOURDHUI });
    expect(agenda.map((e) => [e.date, e.type])).toEqual([
      ["2027-02-18", "Résultats"],
      ["2027-04-22", "Chiffre d'affaires"],
      ["2027-05-12", "Assemblée Générale"],
    ]);
  });

  it("ne lit pas l'agenda à l'envers à cause des mentions de séance (Bureau Veritas)", () => {
    // La parenthèse qui suit chaque date existe dans les deux dispositions :
    // comptée comme indice, elle faisait passer le libellé de la ligne
    // suivante pour celui de la date.
    const texte =
      "CALENDRIER FINANCIER 2026 ET 2027 › Résultats annuels 2026 : 25 février 2027 (avant ouverture de la bourse) " +
      "› Chiffre d'affaires du 1er trimestre 2027 : 22 avril 2027 (avant ouverture de la bourse) › Résultats semestriels 2027 : 27 juillet 2027";
    expect(lireAgenda(texte, { aujourdhui: AUJOURDHUI }).map((e) => [e.date, e.label])).toEqual([
      ["2027-02-25", "Résultats annuels 2026"],
      ["2027-04-22", "Chiffre d'affaires du 1er trimestre 2027"],
      ["2027-07-27", "Résultats semestriels 2027"],
    ]);
  });

  it("ignore le jour de la semaine entre le libellé et la date (Icade, Nexity)", () => {
    const icade =
      "CALENDRIER FINANCIER Résultats annuels 2026 : mardi 9 février 2027 après bourse A PROPOS D'ICADE Icade est un acteur immobilier";
    expect(lireAgenda(icade, { aujourdhui: AUJOURDHUI })).toMatchObject([
      { date: "2027-02-09", type: "Résultats", label: "Résultats annuels 2026" },
    ]);

    const nexity =
      "CALENDRIER FINANCIER & INFORMATIONS PRATIQUES • Résultats annuels 2026 mercredi 24 février 2027 (après bourse) " +
      "• Assemblée générale jeudi 20 mai 2027 8 ROC New Nexity – hors activités cédées";
    expect(lireAgenda(nexity, { aujourdhui: AUJOURDHUI }).map((e) => [e.date, e.type, e.label])).toEqual([
      ["2027-02-24", "Résultats", "Résultats annuels 2026"],
      ["2027-05-20", "Assemblée Générale", "Assemblée générale"],
    ]);
  });

  it("referme l'encadré sur « À propos de », accent compris (DLSI)", () => {
    const texte =
      "Prochain rendez-vous : Publication du chiffre d'affaires du 3e trimestre 2026 le 29 octobre 2026 (après bourse) " +
      "À propos de DLSI : Le Groupe DLSI fédère un réseau de plus de 70 agences";
    expect(lireAgenda(texte, { aujourdhui: AUJOURDHUI })).toMatchObject([
      {
        date: "2026-10-29",
        type: "Chiffre d'affaires",
        label: "Publication du chiffre d'affaires du 3e trimestre 2026",
      },
    ]);
  });

  it("sépare les lignes même quand l'une d'elles n'a pas d'année (Altarea)", () => {
    const texte =
      "Calendrier financier indicatif 2026 Chiffre d'affaires du 3ème trimestre : mercredi 21 octobre (après bourse) " +
      "Résultats annuels 2026 : mardi 23 février 2027 (après bourse)";
    // La date sans année n'est pas lue — l'année ne se devine pas — mais elle
    // ne contamine plus le libellé suivant.
    expect(lireAgenda(texte, { aujourdhui: "2026-10-01" })).toMatchObject([
      { date: "2027-02-23", type: "Résultats", label: "Résultats annuels 2026" },
    ]);
  });

  it("coupe une phrase collée au libellé (Ateme)", () => {
    const texte =
      "Prochains événements : 21 janvier 2027 : Chiffre d'affaires annuel 2026 11 mars 2027 : Résultats annuels 2026 " +
      "Toutes les publications auront lieu après la clôture des marchés d'Euronext Paris.";
    expect(lireAgenda(texte, { aujourdhui: AUJOURDHUI }).map((e) => e.label)).toEqual([
      "Chiffre d'affaires annuel 2026",
      "Résultats annuels 2026",
    ]);
  });

  it("déplace « avant bourse » en fin de libellé (Exel Industries)", () => {
    const texte =
      "Prochains rendez-vous • 28 octobre 2026, avant bourse : chiffre d'affaires du 4e trimestre 2025–2026 " +
      "• 18 décembre 2026, avant bourse : résultats annuels 2025–2026 et présentation aux investisseurs";
    expect(lireAgenda(texte, { aujourdhui: AUJOURDHUI }).map((e) => [e.type, e.label])).toEqual([
      ["Chiffre d'affaires", "Chiffre d'affaires du 4e trimestre 2025–2026 (avant bourse)"],
      ["Résultats", "Résultats annuels 2025–2026 et présentation aux investisseurs (avant bourse)"],
    ]);
  });

  it("place la mention de séance en fin de libellé", () => {
    const [e] = lireAgenda(
      "Prochaine publication : 29 janvier 2027 (avant bourse) : Chiffre d'affaires annuel 2026",
      {
        aujourdhui: AUJOURDHUI,
      }
    );
    expect(e.label).toBe("Chiffre d'affaires annuel 2026 (avant bourse)");
  });
});

describe("lireAgenda — phrases au futur", () => {
  it("reconnaît une assemblée annoncée dans le corps du texte (Thermador, T3 2026)", () => {
    const texte =
      "Le directeur général Guillaume Robin Notre assemblée générale se tiendra le lundi 5 avril 2027 à partir de 16 h au Musée des Confluences à Lyon.";
    expect(lireAgenda(texte, { publieLe: "2026-10-15", aujourdhui: AUJOURDHUI })).toEqual([
      { date: "2027-04-05", type: "Assemblée Générale", label: "Assemblée générale", origine: "phrase" },
    ]);
  });

  it("garde le sujet d'une annonce au passif (Air Liquide, octobre 2026)", () => {
    const texte = "Les résultats du troisième trimestre 2026 seront annoncés le 29 Octobre 2026. CONTACTS";
    expect(lireAgenda(texte, { publieLe: "2026-10-07", aujourdhui: AUJOURDHUI })).toEqual([
      {
        date: "2026-10-29",
        type: "Résultats",
        label: "Résultats du troisième trimestre 2026",
        origine: "phrase",
      },
    ]);
  });

  it("ne répète pas un intertitre sans point final (Soitec)", () => {
    const [e] = lireAgenda("Résultats du S1'27 Les résultats du S1'27 seront publiés le 18 novembre 2026.", {
      aujourdhui: AUJOURDHUI,
    });
    expect(e.label).toBe("Résultats du S1'27");
  });

  it("prend ce qui suit un verbe actif", () => {
    const [e] = lireAgenda(
      "Enfin, pour présenter sa nouvelle stratégie, Vusion organisera un Capital Markets Day à Paris le 18 novembre 2026.",
      { aujourdhui: AUJOURDHUI }
    );
    expect(e).toMatchObject({
      date: "2026-11-18",
      type: "Communication",
      label: "Capital Markets Day à Paris",
    });
  });

  it("écarte la date d'arrêté des positions (Schneider, T3 2026)", () => {
    // Le 11 mai passait pour un second détachement : c'était le seul mot de
    // dividende connu avant lui.
    const texte =
      "VI. CALENDRIER DU DI IDENDE AU I RE DE L'E ERCICE 0 Date de détachement du coupon : 10 mai 2027 " +
      "Date d'arrêté des positions : 11 mai 2027 Date de mise en paiement : 12 mai 2027 Information financière";
    expect(
      lireAgenda(texte, { publieLe: "2026-10-16", aujourdhui: AUJOURDHUI }).map((e) => [e.date, e.label])
    ).toEqual([
      ["2027-05-10", "Détachement du dividende"],
      ["2027-05-12", "Mise en paiement du dividende"],
    ]);
  });

  it("lit « sera détaché » et « mis en paiement », accents compris", () => {
    const texte = "Le dividende sera détaché le 10 mai 2027 et mis en paiement le 12 mai 2027.";
    expect(lireAgenda(texte, { aujourdhui: AUJOURDHUI }).map((e) => [e.date, e.label])).toEqual([
      ["2027-05-10", "Détachement du dividende"],
      ["2027-05-12", "Mise en paiement du dividende"],
    ]);
    // `\b` ne voit pas de frontière après « é » : cette forme n'était jamais lue.
    expect(
      lireAgenda("Le solde du dividende sera versé le 14 mai 2027.", { aujourdhui: AUJOURDHUI })
    ).toMatchObject([{ date: "2027-05-14", type: "Dividende", label: "Mise en paiement du dividende" }]);
  });

  it("lit le calendrier de dividende en anglais, sans la record date", () => {
    const texte = "Ex-dividend date: May 10, 2027; record date: May 11, 2027; payment date: May 12, 2027.";
    expect(lireAgenda(texte, { aujourdhui: AUJOURDHUI }).map((e) => [e.date, e.label])).toEqual([
      ["2027-05-10", "Détachement du dividende"],
      ["2027-05-12", "Mise en paiement du dividende"],
    ]);
  });

  it("écarte aussi la date d'arrêté dans un encadré d'agenda", () => {
    const texte =
      "Agenda financier • Détachement du dividende : 10 mai 2027 • Date d'arrêté des positions : 11 mai 2027 • Paiement : 12 mai 2027";
    expect(lireAgenda(texte, { aujourdhui: AUJOURDHUI }).map((e) => [e.date, e.type])).toEqual([
      ["2027-05-10", "Dividende"],
      ["2027-05-12", "Dividende"],
    ]);
  });

  it("distingue détachement et mise en paiement dans la même phrase", () => {
    const texte =
      "Le détachement du dividende interviendra le 8 juin 2027 et la mise en paiement le 10 juin 2027.";
    expect(lireAgenda(texte, { aujourdhui: AUJOURDHUI }).map((e) => [e.date, e.label])).toEqual([
      ["2027-06-08", "Détachement du dividende"],
      ["2027-06-10", "Mise en paiement du dividende"],
    ]);
  });
});

describe("lireAgenda — ce qui n'est PAS un rendez-vous", () => {
  it("ignore une date future sans verbe d'annonce", () => {
    // Sensorion, S1 2026 : un horizon de financement, pas un événement.
    const texte = "La Société estime être en mesure de financer ses activités jusqu'au 31 décembre 2027.";
    expect(lireAgenda(texte, { aujourdhui: AUJOURDHUI })).toEqual([]);
  });

  it("ignore une échéance réglementaire « au plus tard »", () => {
    // Kalray, S1 2026 : une limite, pas une date de publication.
    const texte = "Le rapport financier semestriel sera disponible au plus tard le 31 octobre 2026.";
    expect(lireAgenda(texte, { aujourdhui: AUJOURDHUI })).toEqual([]);
  });

  it("écarte ce qui précède la publication, le passé et l'horizon lointain", () => {
    const texte =
      "Calendrier financier • 15 octobre 2026 : Chiffre d'affaires T3 • 18 février 2027 : Résultats annuels • 18 février 2029 : Résultats annuels 2028";
    const agenda = lireAgenda(texte, { publieLe: "2026-10-01", aujourdhui: AUJOURDHUI });
    expect(agenda.map((e) => e.date)).toEqual(["2027-02-18"]);
  });

  it("refuse une date qui n'existe pas", () => {
    expect(
      lireAgenda("Agenda financier • 31 avril 2027 : Assemblée générale", { aujourdhui: AUJOURDHUI })
    ).toEqual([]);
  });

  it("ne rend rien sans texte ni date du jour", () => {
    expect(lireAgenda("", { aujourdhui: AUJOURDHUI })).toEqual([]);
    expect(lireAgenda("Agenda financier • 18 février 2027 : Résultats", {})).toEqual([]);
  });
});

describe("typerLibelle", () => {
  it("classe l'assemblée avant le dividende qu'elle vote", () => {
    expect(typerLibelle("Assemblée générale appelée à statuer sur la mise en paiement du dividende")).toBe(
      "Assemblée Générale"
    );
  });

  it("ne prend pas une proposition de dividende pour une date de dividende", () => {
    expect(typerLibelle("Résultats annuels 2026 et proposition de dividende")).toBe("Résultats");
    expect(typerLibelle("Détachement du solde du dividende")).toBe("Dividende");
  });

  it("distingue chiffre d'affaires et résultats", () => {
    expect(typerLibelle("Chiffre d'affaires du 3e trimestre")).toBe("Chiffre d'affaires");
    expect(typerLibelle("CA T3 2026")).toBe("Chiffre d'affaires");
    expect(typerLibelle("Chiffre d'affaires et résultats annuels")).toBe("Résultats");
  });

  it("reconnaît le chiffre d'affaires écrit avec une apostrophe typographique (Vinci)", () => {
    expect(typerLibelle("VINCI - 9M 2026 - NOUVELLES HAUSSES DU CHIFFRE D’AFFAIRES ET DES PRISES DE COMMANDES")).toBe(
      "Chiffre d'affaires"
    );
  });

  it("range le reste en communication", () => {
    expect(typerLibelle("Capital Markets Day à Paris")).toBe("Communication");
  });

  it("ne prend pas des résultats cliniques pour une publication financière (OSE)", () => {
    expect(typerLibelle("OSE Immunotherapeutics annonce les résultats de Topline positifs")).toBe(
      "Communication"
    );
    expect(typerLibelle("Résultats du S1'27")).toBe("Résultats");
    expect(typerLibelle("FORTE PROGRESSION DES RÉSULTATS AU 1ER SEMESTRE 2026")).toBe("Résultats");
    expect(typerLibelle("2026 First Half Results")).toBe("Résultats");
  });

  it("ne prend pas une cession d'activité pour une publication d'activité", () => {
    expect(typerLibelle("Cession de l'activité Automation")).toBe("Communication");
    expect(typerLibelle("Activité du 3ème trimestre 2026")).toBe("Chiffre d'affaires");
  });
});

describe("nettoyerLibelle / normaliserTexte", () => {
  it("retire puces, séparateurs et mots de liaison accrochés à la date", () => {
    expect(nettoyerLibelle(" • : les Résultats annuels le lundi")).toBe("Résultats annuels");
  });

  it("recolle les exposants séparés par l'extraction PDF", () => {
    expect(normaliserTexte("3\nème trimestre")).toBe("3ème trimestre");
  });

  it("recompose les accents codés en deux caractères", () => {
    expect(normaliserTexte("assemblée")).toBe("assemblée");
  });
});
