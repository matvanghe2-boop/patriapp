import { describe, it, expect } from "vitest";
import { handler } from "./_lib/routes/communique.js";
import { texteLisiblePdf } from "./_lib/sources/infoFinanciere.js";

describe("texteLisiblePdf", () => {
  it("recolle les lignes de mise en page et garde les fins de phrase", () => {
    const brut = "Le chiffre d'affaires du\n3\nème\n trimestre progresse\nde 12 %.\nLa marge s'améliore.";
    expect(texteLisiblePdf(brut)).toBe(
      "Le chiffre d'affaires du 3ème trimestre progresse de 12 %.\nLa marge s'améliore."
    );
  });

  it("remet chaque puce à la ligne", () => {
    expect(texteLisiblePdf("Calendrier • 18 novembre 2026 : CMD • 30 novembre 2026 : Berenberg")).toBe(
      "Calendrier\n• 18 novembre 2026 : CMD\n• 30 novembre 2026 : Berenberg"
    );
  });

  it("retire l'en-tête répété à chaque page, garde les intitulés de tableau", () => {
    const page = (n) =>
      `Communiqué de presse\n__________\nVusionGroup SA – 55, place Nelson Mandela\nVariation (en %)\nContenu de la page ${n}.`;
    const t = texteLisiblePdf([1, 2, 3].map(page).join("\n"));
    expect(t).not.toMatch(/Communiqué de presse|Nelson Mandela|____/);
    expect(t).toContain("Variation (en %)");
    expect(t).toContain("Contenu de la page 3.");
  });

  it("met à la ligne les puces carrées (Vinci, ◼)", () => {
    expect(texteLisiblePdf("Faits marquants ◼ Forte progression ◼ Commandes toniques")).toBe(
      "Faits marquants\n◼ Forte progression\n◼ Commandes toniques"
    );
  });

  it("ne lève pas sur une entrée vide", () => {
    expect(texteLisiblePdf("")).toBe("");
    expect(texteLisiblePdf(undefined)).toBe("");
  });
});

describe("route communique", () => {
  const appeler = (url) => handler({ query: { url } }, { status: () => ({ json: () => {} }) });
  const chercher = (query) => handler({ query }, { status: () => ({ json: () => {} }) });

  it("ne cherche que pour une valeur parisienne et une date valide", async () => {
    await expect(chercher({ symbol: "AAPL", date: "2026-07-29" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(chercher({ symbol: "DG.PA", date: "29/07/2026" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(chercher({})).rejects.toMatchObject({ statusCode: 400 });
  });


  it("refuse toute adresse hors de l'entrepôt de la DILA", async () => {
    // L'URL vient du client : la suivre aveuglément ferait de la route un
    // relais vers n'importe quelle adresse, réseau interne compris.
    for (const url of [
      "https://exemple.fr/communique.pdf",
      "http://169.254.169.254/latest/meta-data/",
      "https://fr.ftp.opendatasoft.com.evil.example/datadila/INFOFI/x.pdf",
      "https://fr.ftp.opendatasoft.com/autre/x.pdf",
      "",
    ]) {
      await expect(appeler(url)).rejects.toMatchObject({ statusCode: 400 });
    }
  });
});
