import { describe, it, expect } from "vitest";
import { typerEvenement, lireDocument } from "./yahooCalendrier.js";

// Formateur de date simplifié, équivalent à celui de la route.
const formater = (epochSecondes) => new Date(epochSecondes * 1000).toISOString().slice(0, 10);

/** Construit une réponse de l'endpoint au format tabulaire réel. */
const document = (lignes) => ({
  finance: {
    result: [
      {
        documents: [
          {
            columns: [
              { id: "startdatetime" },
              { id: "ticker" },
              { id: "companyshortname" },
              { id: "epsestimate" },
              { id: "eventname" },
            ],
            rows: lignes,
          },
        ],
      },
    ],
  },
});

describe("typerEvenement", () => {
  it("reconnaît une assemblée générale", () => {
    // C'est l'apport principal de cette source : le README affirmait
    // qu'aucun endpoint public ne fournissait ces dates.
    expect(typerEvenement("Air Liquide SA Annual Shareholders Meeting").type).toBe("Assemblée Générale");
  });

  it("classe l'assemblée AVANT la règle générale", () => {
    // Un libellé contenant les deux mots ne doit pas finir en « Résultats ».
    const r = typerEvenement("Annual Shareholders Meeting 2027");
    expect(r.type).toBe("Assemblée Générale");
  });

  it("qualifie une conférence de résultats par son exercice", () => {
    const r = typerEvenement("Q3 2026 Sanofi SA Earnings Call");
    expect(r.type).toBe("Communication");
    expect(r.label).toBe("Conférence de résultats — Q3 2026");
  });

  it("reconnaît un exercice complet", () => {
    expect(typerEvenement("Full Year 2026 Total Earnings Call").label).toContain("Full Year 2026");
  });

  it("retombe sur une publication de résultats si le libellé ne dit rien", () => {
    expect(typerEvenement("").type).toBe("Résultats");
    expect(typerEvenement(undefined).type).toBe("Résultats");
  });
});

describe("lireDocument", () => {
  const MAINTENANT = new Date("2026-10-19T12:00:00Z");

  it("convertit les lignes en événements datés", () => {
    const json = document([
      ["2026-10-30T16:00:00.000Z", "SAN.PA", "Sanofi", 2.1, "Q3 2026 Sanofi SA Earnings Call"],
    ]);
    const [e] = lireDocument(json, "SAN.PA", formater, MAINTENANT);
    expect(e).toMatchObject({
      ticker: "SAN.PA",
      type: "Communication",
      date: "2026-10-30",
      fournisseur: "yahoo",
      statut: "confirme",
    });
    expect(e.estimates).toEqual({ beneficeAttendu: 2.1 });
  });

  it("écarte l'historique trop ancien", () => {
    // La table remonte à 2019 pour certaines valeurs : vingt-huit lignes pour
    // Sanofi. Les afficher noierait les deux dates qui comptent.
    const json = document([
      ["2020-02-06T16:00:00.000Z", "SAN.PA", "Sanofi", null, "Q4 2019 Earnings Call"],
      ["2026-10-30T16:00:00.000Z", "SAN.PA", "Sanofi", null, "Q3 2026 Earnings Call"],
    ]);
    const out = lireDocument(json, "SAN.PA", formater, MAINTENANT);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2026-10-30");
  });

  it("garde le passé récent, utile quand rien n'est encore annoncé", () => {
    const json = document([
      ["2026-09-15T16:00:00.000Z", "AI.PA", "Air Liquide", null, "Q2 2026 Earnings Call"],
    ]);
    expect(lireDocument(json, "AI.PA", formater, MAINTENANT)).toHaveLength(1);
  });

  it("ignore une ligne sans date ou à date invalide", () => {
    const json = document([
      [null, "AI.PA", "Air Liquide", null, "Earnings Call"],
      ["pas-une-date", "AI.PA", "Air Liquide", null, "Earnings Call"],
    ]);
    expect(lireDocument(json, "AI.PA", formater, MAINTENANT)).toEqual([]);
  });

  it("ne lève pas sur une réponse vide ou malformée", () => {
    expect(lireDocument({}, "AI.PA", formater, MAINTENANT)).toEqual([]);
    expect(lireDocument(null, "AI.PA", formater, MAINTENANT)).toEqual([]);
    expect(lireDocument(document([]), "AI.PA", formater, MAINTENANT)).toEqual([]);
  });
});
