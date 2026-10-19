import { describe, it, expect } from "vitest";
import { demain, rappelsPourDemain } from "./useRappelsCalendrier";

describe("demain", () => {
  it("passe au mois suivant sans se tromper", () => {
    expect(demain("2026-01-31")).toBe("2026-02-01");
    expect(demain("2026-02-28")).toBe("2026-03-01");
  });

  it("gère une année bissextile", () => {
    expect(demain("2028-02-28")).toBe("2028-02-29");
  });

  it("passe à l'année suivante", () => {
    expect(demain("2026-12-31")).toBe("2027-01-01");
  });
});

describe("rappelsPourDemain", () => {
  const evenements = [
    { ticker: "AI.PA", type: "Résultats", date: "2026-10-20", label: "Résultats T3", statut: "confirme" },
    { ticker: "MC.PA", type: "Résultats", date: "2026-10-20", label: "Résultats T3", statut: "estime" },
    { ticker: "OR.PA", type: "Dividende", date: "2026-10-21", label: "Date ex-dividende", statut: "confirme" },
    { ticker: "SU.PA", type: "Résultats", date: "2026-10-19", label: "Résultats", statut: "confirme" },
  ];

  it("ne retient que les événements du lendemain", () => {
    const r = rappelsPourDemain(evenements, "2026-10-19");
    expect(r.map((x) => x.id)).toEqual(["calendrier-AI.PA-Résultats-2026-10-20"]);
  });

  it("ignore les dates estimées", () => {
    // Prévenir la veille d'une date extrapolée reviendrait à annoncer un
    // rendez-vous que personne n'a fixé.
    const r = rappelsPourDemain(evenements, "2026-10-19");
    expect(r.some((x) => x.id.includes("MC.PA"))).toBe(false);
  });

  it("ignore ce qui est déjà passé ou trop lointain", () => {
    const r = rappelsPourDemain(evenements, "2026-10-19");
    expect(r.some((x) => x.id.includes("SU.PA"))).toBe(false);
    expect(r.some((x) => x.id.includes("OR.PA"))).toBe(false);
  });

  it("produit un libellé lisible dans la cloche de notifications", () => {
    const [r] = rappelsPourDemain(evenements, "2026-10-19");
    expect(r.label).toBe("Demain — AI.PA : Résultats T3");
    expect(r.type).toBe("calendrier");
  });

  it("ne lève pas sur une liste vide ou absente", () => {
    expect(rappelsPourDemain([], "2026-10-19")).toEqual([]);
    expect(rappelsPourDemain(undefined, "2026-10-19")).toEqual([]);
  });
});
