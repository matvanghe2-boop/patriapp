import { describe, it, expect } from "vitest";
import { construireCsvOperations, echapperCsv, formaterNombre } from "./exportOperations";

describe("echapperCsv", () => {
  it("laisse une valeur simple intacte", () => {
    expect(echapperCsv("ACHAT")).toBe("ACHAT");
  });

  it("encadre et double les guillemets", () => {
    expect(echapperCsv('Air "Liquide"')).toBe('"Air ""Liquide"""');
  });

  it("encadre un champ contenant le séparateur", () => {
    // Sans cela, un nom d'actif contenant un point-virgule décalerait toutes
    // les colonnes suivantes.
    expect(echapperCsv("Nom; avec point-virgule")).toBe('"Nom; avec point-virgule"');
  });

  it("encadre un champ multiligne", () => {
    expect(echapperCsv("a\nb")).toBe('"a\nb"');
  });

  it("rend une chaîne vide pour null/undefined", () => {
    expect(echapperCsv(null)).toBe("");
    expect(echapperCsv(undefined)).toBe("");
  });
});

describe("formaterNombre", () => {
  it("utilise la virgule décimale", () => {
    expect(formaterNombre(12.34)).toBe("12,34");
    expect(formaterNombre("7.5")).toBe("7,5");
  });

  it("rend vide plutôt que NaN", () => {
    expect(formaterNombre(null)).toBe("");
    expect(formaterNombre("abc")).toBe("");
    expect(formaterNombre(undefined)).toBe("");
  });

  it("conserve un zéro explicite", () => {
    expect(formaterNombre(0)).toBe("0");
  });
});

describe("construireCsvOperations", () => {
  const ops = [
    { date: "2026-03-02", type: "VENTE", asset: "AI.PA", quantity: 5, price: 180.5, fees: 2, montantNet: 900.5, plusValueRealisee: 100.25, transactionId: "T2" },
    { date: "2026-01-15", type: "ACHAT", asset: "CW8.PA", quantity: 10, price: 420, fees: 1.5, montantNet: -4201.5, plusValueRealisee: null, transactionId: "T1" },
  ];

  it("écrit un en-tête", () => {
    const lignes = construireCsvOperations([]).split("\r\n");
    expect(lignes[0]).toBe("Date;Type;Actif;Quantité;Cours unitaire;Frais;Montant net;Plus-value réalisée;Référence");
    expect(lignes).toHaveLength(1);
  });

  it("trie les opérations par date croissante", () => {
    const lignes = construireCsvOperations(ops).split("\r\n");
    expect(lignes[1]).toContain("2026-01-15");
    expect(lignes[2]).toContain("2026-03-02");
  });

  it("formate les nombres à la française", () => {
    const lignes = construireCsvOperations(ops).split("\r\n");
    expect(lignes[1]).toContain("420;1,5;-4201,5");
  });

  it("laisse vide une plus-value absente plutôt que d'écrire null", () => {
    const lignes = construireCsvOperations(ops).split("\r\n");
    expect(lignes[1].endsWith(";;T1")).toBe(true);
  });

  it("ne modifie pas le tableau reçu", () => {
    const copie = [...ops];
    construireCsvOperations(ops);
    expect(ops).toEqual(copie);
  });
});
