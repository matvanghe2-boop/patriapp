import { describe, it, expect } from "vitest";
import { htmlDossierSinistre } from "./dossierSinistre";

const AUJOURDHUI = "2026-11-02";
const documents = [
  { id: "f", type: "facture", titre: "Facture Darty", dateDocument: "2025-05-10", echeance: "2027-05-10", fichiers: [] },
];
const objets = [
  {
    id: "a",
    nom: "Lave-linge <Bosch>",
    categorie: "electromenager",
    dateAchat: "2025-05-10",
    prix: 600,
    numeroSerie: "WAN28 & co",
    factureId: "f",
    notes: "",
  },
  { id: "b", nom: "Vélo", categorie: "mobilite", prix: 800, valeurManuelle: 500, notes: "Cadenas U" },
];

describe("htmlDossierSinistre", () => {
  const html = htmlDossierSinistre({ objets, documents, apercus: { f: "data:image/png;base64,AAAA" }, aujourdhui: AUJOURDHUI });

  it("liste chaque bien avec ses détails, et le total", () => {
    expect(html).toContain("Dossier sinistre — liste des biens");
    expect(html).toContain("Établi le 02/11/2026");
    expect(html).toMatch(/1\s400,00\s€/);
    expect(html).toContain("Cadenas U");
    expect(html).toContain("jusqu'au 10/05/2027 (d'après la facture)");
    expect(html).toContain("Facture Darty, du 10/05/2025");
  });

  it("échappe ce que l'utilisateur a saisi", () => {
    expect(html).toContain("Lave-linge &lt;Bosch&gt;");
    expect(html).toContain("WAN28 &amp; co");
    expect(html).not.toContain("<Bosch>");
  });

  it("joint l'aperçu de la facture, et ne contient aucun script", () => {
    expect(html).toContain('<img src="data:image/png;base64,AAAA" alt="Facture : Facture Darty" />');
    expect(html).not.toMatch(/<script/i);
  });

  it("marque les valeurs estimées et laisse les valeurs saisies telles quelles", () => {
    expect(html).toMatch(/500,00\s€<\/td>/);
    expect(html).toContain(" *</td>");
  });
});
