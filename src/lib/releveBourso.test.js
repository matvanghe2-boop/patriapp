import { describe, it, expect } from "vitest";
import { lireReleveBourso, centimesDepuisTexte, dateIso, regrouperLignes, ReleveIllisible } from "./releveBourso";
import { pagesReleveFactice } from "../test/releveFactice";

const ESPACE_INSECABLE = String.fromCharCode(0xa0);

describe("centimesDepuisTexte", () => {
  it("lit les montants à la française, point ou espace comme séparateur de milliers", () => {
    expect(centimesDepuisTexte("162,25")).toBe(16225);
    expect(centimesDepuisTexte("5.000,00")).toBe(500000);
    expect(centimesDepuisTexte(`1${ESPACE_INSECABLE}234,56`)).toBe(123456);
    expect(centimesDepuisTexte("-12,40")).toBe(-1240);
  });

  it("refuse ce qui n'est pas exactement un montant à deux décimales", () => {
    // « 5.000,00 » lu comme 5 € : c'est l'erreur du lecteur de courtage.
    expect(centimesDepuisTexte("5.000.00")).toBeNull();
    expect(centimesDepuisTexte("12")).toBeNull();
    expect(centimesDepuisTexte("30/04/2026")).toBeNull();
    expect(centimesDepuisTexte("CB*1234")).toBeNull();
  });
});

describe("dateIso", () => {
  it("convertit une date française et ignore le reste", () => {
    expect(dateIso("04/05/2026")).toBe("2026-05-04");
    expect(dateIso("05/05/26")).toBeNull();
  });
});

describe("regrouperLignes", () => {
  it("garde sur une même ligne deux fragments décalés d'un point", () => {
    const lignes = regrouperLignes([
      { str: "Nouveau solde", x: 145, y: 150.6, w: 60 },
      { str: "162,25", x: 522, y: 151.6, w: 24 },
    ]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].texte).toBe("Nouveau solde 162,25");
  });
});

describe("lireReleveBourso", () => {
  const releve = lireReleveBourso(pagesReleveFactice());

  it("lit la période, le compte et le titulaire, sans garder l'adresse ni le numéro complet", () => {
    expect(releve.debut).toBe("2026-05-01");
    expect(releve.fin).toBe("2026-05-29");
    expect(releve.compte).toBe("5678");
    expect(releve.titulaire).toBe("MARTIN PAUL");
    expect(JSON.stringify(releve)).not.toContain("LILAS");
    expect(JSON.stringify(releve)).not.toContain("00012345678");
  });

  it("lit toutes les opérations des deux pages, dans l'ordre du relevé", () => {
    expect(releve.operations).toHaveLength(8);
    expect(releve.operations.map((o) => o.date)).toEqual([
      "2026-05-04", "2026-05-05", "2026-05-06", "2026-05-18",
      "2026-05-18", "2026-05-18", "2026-05-25", "2026-05-27",
    ]);
    expect(releve.operations.map((o) => o.ordre)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("signe chaque montant selon sa colonne : débit négatif, crédit positif", () => {
    expect(releve.operations.map((o) => o.montant)).toEqual([
      2000, -100000, -1250, 10000, 10000, -3592, -2000, -123456,
    ]);
  });

  it("garde la date de valeur quand elle diffère de la date d'opération", () => {
    expect(releve.operations[6].date).toBe("2026-05-25");
    expect(releve.operations[6].dateValeur).toBe("2026-05-24");
  });

  it("rattache les compléments à leur opération et s'arrête aux mentions légales", () => {
    const virement = releve.operations[3];
    expect(virement.libelle).toBe("VIR SEPA MME CLAIRE PETIT");
    expect(virement.complements).toEqual(["aide week end", "Vir. de MME CLAIRE PETIT", "Rèf ABC123"]);
  });

  it("recolle un nom coupé en fin de libellé", () => {
    expect(releve.operations[0].libelle).toBe("VIR Virement train Jean MARTINELLI");
    expect(releve.operations[0].complements).toEqual(["MARTINELLI"]);
  });

  it("lit les soldes, y compris un nouveau solde négatif, et vérifie que tout tombe juste", () => {
    expect(releve.soldeDebut).toBe(200000);
    expect(releve.soldeFin).toBe(-8298);
    expect(releve.controle).toEqual({ ok: true, ecart: 0 });
  });

  it("signale un écart quand une ligne a été mal lue", () => {
    const fausse = lireReleveBourso(pagesReleveFactice({ montantCarte: "21,50" }));
    expect(fausse.controle.ok).toBe(false);
    expect(fausse.controle.ecart).toBe(-900);
  });

  it("refuse un PDF qui n'est pas un relevé BoursoBank", () => {
    expect(() => lireReleveBourso([[{ str: "Facture EDF", x: 50, y: 700, w: 60 }]])).toThrow(ReleveIllisible);
  });
});
