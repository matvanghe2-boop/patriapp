import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { lireHash, useSousOnglet } from "./useHashRoute";
import { elementsAFaire } from "./aFaire";
import { migrer, VERSION_DONNEES, sauvegardeTropRecente } from "./migrations";
import { statutContrat, dateLimiteResiliation } from "./abonnements";
import { plafondLegal } from "./plafondsLivrets";
import { construireIndex } from "../components/PaletteCommandes";
import { enrichir } from "./compteCourant";

const AUJ = "2026-10-30";

describe("sous-onglets dans l'URL", () => {
  beforeEach(() => window.history.replaceState(null, "", "#/abonnements"));

  it("lit l'onglet et le sous-onglet du hash", () => {
    expect(lireHash("#/abonnements/calendrier")).toEqual({ onglet: "abonnements", sous: "calendrier" });
    expect(lireHash("#/bourse")).toEqual({ onglet: "bourse", sous: "" });
    expect(lireHash("")).toEqual({ onglet: "", sous: "" });
  });

  function Banc() {
    const [sous, setSous] = useSousOnglet(["abonnements", "calendrier", "contrats"], "abonnements");
    return (
      <>
        <output>{sous}</output>
        <button onClick={() => setSous("contrats")}>contrats</button>
        <button onClick={() => setSous("abonnements")}>défaut</button>
        <button onClick={() => setSous("inconnu")}>inconnu</button>
      </>
    );
  }

  it("écrit le sous-onglet dans l'URL, sans le sous-onglet par défaut", () => {
    render(<Banc />);
    expect(screen.getByRole("status").textContent).toBe("abonnements");
    fireEvent.click(screen.getByText("contrats"));
    expect(window.location.hash).toBe("#/abonnements/contrats");
    fireEvent.click(screen.getByText("inconnu"));
    expect(screen.getByRole("status").textContent).toBe("contrats");
    fireEvent.click(screen.getByText("défaut"));
    expect(window.location.hash).toBe("#/abonnements");
  });

  it("démarre sur le sous-onglet du lien, et suit une navigation sur la même page", () => {
    window.history.replaceState(null, "", "#/abonnements/calendrier");
    render(<Banc />);
    expect(screen.getByRole("status").textContent).toBe("calendrier");
    act(() => {
      window.history.replaceState(null, "", "#/abonnements/contrats");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("status").textContent).toBe("contrats");
  });

  it("retombe sur le sous-onglet par défaut pour un lien périmé", () => {
    window.history.replaceState(null, "", "#/abonnements/nimportequoi");
    render(<Banc />);
    expect(screen.getByRole("status").textContent).toBe("abonnements");
  });
});

describe("centre « À faire »", () => {
  it("rassemble les signaux de tous les onglets, du plus urgent au moins urgent", () => {
    const releve = enrichir([
      { id: "1", date: "2026-09-12", libelle: "PRLV SEPA SPOTIFY", montant: -999 },
      { id: "2", date: "2026-10-12", libelle: "PRLV SEPA SPOTIFY", montant: -1099 },
      { id: "3", date: "2026-09-15", libelle: "PRLV SEPA FREE MOBILE", montant: -1999 },
      { id: "4", date: "2026-10-15", libelle: "PRLV SEPA FREE MOBILE", montant: -1999 },
    ]);
    const e = elementsAFaire({
      aujourdhui: AUJ,
      livrets: [{ id: "la", name: "Livret A", balance: 22900 }],
      bourse: { positions: [{ ticker: "MC.PA", quantity: 2, pru: 700, current_price: 560 }], cash_pocket: 0 },
      matelasMois: 2,
      strategyNotes: [{ id: "n", ticker: "MC.PA", statut: "intacte", date: "2026-01-01" }],
      contracts: [{ id: "c", label: "Assurance", date_fin: "2026-11-20", preavis_jours: 30 }],
      subs: [
        { id: "s", label: "Spotify", montant: 9.99, prochaine_date: "2026-09-12" },
        { id: "e", label: "Canal+", montant: 24.99, statut: "essai", fin_essai: "2026-11-02" },
      ],
      compteEnrichies: releve,
    });
    const ids = e.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining([
      "panique-n", "theses-a-relire", "contrat-c", "essai-e", "releve-s", "abonnements-detectes", "livret-la", "matelas-faible",
    ]));
    // Trié par urgence : tous les « critique » avant le premier « attention ».
    const rangs = e.map((x) => ({ critique: 0, attention: 1, info: 2 })[x.urgence]);
    expect([...rangs].sort((a, b) => a - b)).toEqual(rangs);
    expect(e.find((x) => x.id === "contrat-c")).toMatchObject({ urgence: "critique", lien: { onglet: "abonnements", sous: "contrats" } });
    expect(e.find((x) => x.id === "releve-s").texte).toMatch(/Spotify : Passé de 9,99 € à 10,99 €/);
  });

  it("ne dit rien quand tout est à jour", () => {
    expect(elementsAFaire({ aujourdhui: AUJ })).toEqual([]);
  });
});

describe("contrats et plafonds partagés", () => {
  it("calcule la date limite et le statut d'un contrat", () => {
    const c = { date_fin: "2026-12-31", preavis_jours: 30 };
    expect(dateLimiteResiliation(c)).toBe("2026-12-01");
    expect(statutContrat(c, "2026-10-15").key).toBe("actif");
    expect(statutContrat(c, "2026-11-10").key).toBe("a_renouveler");
    expect(statutContrat(c, "2026-12-05").key).toBe("a_resilier");
    expect(statutContrat(c, "2027-01-02").key).toBe("expire");
  });

  it("reconnaît les plafonds légaux au nom du livret", () => {
    expect(plafondLegal("Mon Livret A")).toBe(22950);
    expect(plafondLegal("LDDS Boursorama")).toBe(12000);
    expect(plafondLegal("Compte à terme")).toBeNull();
  });
});

describe("migrations des données", () => {
  it("met les anciennes données à la forme courante", () => {
    const [s] = migrer("subs", [{ id: "1", label: "Netflix", montant: "13,49" }]);
    expect(s).toMatchObject({ montant: 13.49, frequence: "mensuelle", statut: "actif" });
    const [n] = migrer("strategyNotes", [{ id: "n", statut: "inconnu", objectif_cours: "200" }]);
    expect(n).toMatchObject({ statut: "intacte", revues: [], archivee: false, objectif_cours: 200 });
    const [c] = migrer("contracts", [{ id: "c", preavis_jours: "30" }]);
    expect(c.preavis_jours).toBe(30);
    const [h] = migrer("historyPast", [{ date: "2026-01-01", valeur: 1200 }]);
    expect(h).toEqual({ date: "2026-01-01", valeur: 1200, value: 1200 });
  });

  it("rend une donnée déjà à jour telle quelle, à la référence près", () => {
    const subs = [{ id: "1", label: "Netflix", montant: 13.49, frequence: "mensuelle", statut: "actif" }];
    expect(migrer("subs", subs)).toBe(subs);
    const autre = { a: 1 };
    expect(migrer("cleSansMigration", autre)).toBe(autre);
    expect(migrer("subs", null)).toBeNull();
  });

  it("refuse une sauvegarde venue d'une version plus récente", () => {
    expect(sauvegardeTropRecente({ __versionDonnees: VERSION_DONNEES + 1 })).toBe(true);
    expect(sauvegardeTropRecente({ __versionDonnees: VERSION_DONNEES })).toBe(false);
    expect(sauvegardeTropRecente({ livrets: [] })).toBe(false);
  });
});

describe("index de recherche", () => {
  it("indexe abonnements, contrats et opérations du compte courant, avec leur sous-onglet", () => {
    const index = construireIndex({
      subs: [{ id: "s", label: "Netflix", category: "Streaming", montant: 13.49 }],
      contracts: [{ id: "c", label: "Assurance habitation", date_fin: "2026-11-20" }],
      compteEnrichies: enrichir([{ id: "o", date: "2026-10-03", libelle: "PRLV SEPA EDF", montant: -6500 }]),
      strategyNotes: [{ id: "n", ticker: "AI.PA", titre: "Air Liquide", date: "2026-02-04T10:00:00.000Z" }],
    });
    const parId = Object.fromEntries(index.map((i) => [i.id, i]));
    expect(parId["abo-s"]).toMatchObject({ onglet: "abonnements", libelle: "Netflix" });
    expect(parId["contrat-c"]).toMatchObject({ onglet: "abonnements", sous: "contrats" });
    expect(parId["cc-o"]).toMatchObject({ onglet: "compte", categorie: "Compte courant" });
    expect(parId["note-n"].libelle).toBe("AI.PA — Air Liquide");
    expect(index.find((i) => i.cle.includes("assurance"))).toBeTruthy();
  });
});
