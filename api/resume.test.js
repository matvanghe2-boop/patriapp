import { describe, it, expect } from "vitest";
import { urlAutorisee, texteLisible, lireJsonModele } from "./resume.js";

describe("urlAutorisee", () => {
  it("accepte un document de la SEC", () => {
    expect(urlAutorisee("https://www.sec.gov/Archives/edgar/data/320193/000032019326000081/aapl.htm")).toBe(true);
    expect(urlAutorisee("https://data.sec.gov/submissions/CIK0000320193.json")).toBe(true);
  });

  it("accepte un communiqué déposé sur info-financiere.gouv.fr", () => {
    expect(urlAutorisee("https://fr.ftp.opendatasoft.com/datadila/INFOFI/ACT/2026/10/FCACT081907_20261020.pdf")).toBe(true);
  });

  it("refuse le même hôte hors de l'entrepôt de documents", () => {
    expect(urlAutorisee("https://fr.ftp.opendatasoft.com/autre/chemin.pdf")).toBe(false);
  });

  it("refuse tout autre hôte", () => {
    // Fetcher une URL arbitraire transformerait la fonction en relais vers le
    // réseau interne de l'hébergeur : la liste blanche n'est pas théorique.
    expect(urlAutorisee("https://exemple.fr/communique.html")).toBe(false);
    expect(urlAutorisee("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(urlAutorisee("https://evil.example/?x=sec.gov")).toBe(false);
  });

  it("refuse un hôte qui se contente de FINIR par sec.gov", () => {
    // `sec.gov.evil.example` passerait un test de suffixe naïf.
    expect(urlAutorisee("https://sec.gov.evil.example/doc")).toBe(false);
  });

  it("refuse le HTTP en clair et les protocoles exotiques", () => {
    expect(urlAutorisee("http://www.sec.gov/doc")).toBe(false);
    expect(urlAutorisee("file:///etc/passwd")).toBe(false);
  });

  it("refuse une entrée vide ou invalide", () => {
    expect(urlAutorisee("")).toBe(false);
    expect(urlAutorisee(null)).toBe(false);
    expect(urlAutorisee("pas une url")).toBe(false);
  });
});

describe("texteLisible", () => {
  it("retire le balisage et garde le texte", () => {
    const html = "<p>Chiffre d'affaires de <b>4 732</b> M&amp;€</p>";
    expect(texteLisible(html)).toBe("Chiffre d'affaires de 4 732 M&€");
  });

  it("supprime scripts et styles, contenu compris", () => {
    const html = "<script>var x = 999;</script><p>CA 4 732</p><style>.a{color:red}</style>";
    const t = texteLisible(html);
    // 999 vient d'un script : le laisser polluerait le référentiel de
    // vérification des chiffres.
    expect(t).not.toContain("999");
    expect(t).toContain("4 732");
  });

  it("ne lève pas sur une entrée vide", () => {
    expect(texteLisible("")).toBe("");
    expect(texteLisible(undefined)).toBe("");
  });
});

describe("lireJsonModele", () => {
  it("lit un JSON nu", () => {
    expect(lireJsonModele('{"resume":"ok"}')).toEqual({ resume: "ok" });
  });

  it("lit un JSON enrobé d'une clôture Markdown", () => {
    // Les modèles encadrent très souvent leur réponse de ```json.
    expect(lireJsonModele('```json\n{"resume":"ok"}\n```')).toEqual({ resume: "ok" });
  });

  it("récupère l'objet au milieu d'une phrase", () => {
    expect(lireJsonModele('Voici le résumé : {"resume":"ok"} J\'espère que cela convient.')).toEqual({
      resume: "ok",
    });
  });

  it("renvoie null plutôt que de deviner", () => {
    expect(lireJsonModele("je n'ai pas compris la demande")).toBeNull();
    expect(lireJsonModele("")).toBeNull();
    expect(lireJsonModele(null)).toBeNull();
  });
});
