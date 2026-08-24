/**
 * Les widgets ajoutés, vérifiés sur ce qu'ils PROMETTENT.
 *
 * Chacun porte une retenue explicite dans son en-tête — ne pas conclure à la
 * place de l'utilisateur, ne pas inventer une note absente, ne pas dater un
 * franchissement qui n'a jamais été enregistré. Ce sont ces retenues qui sont
 * testées ici, plus que le rendu : elles se perdent silencieusement au premier
 * remaniement, alors qu'un titre manquant se voit tout de suite.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import ProchainesEcheances from "./ProchainesEcheances";
import SantePortefeuille from "./SantePortefeuille";
import RapprochementsAbonnements from "./RapprochementsAbonnements";
import ComparateurScenarios from "./ComparateurScenarios";
import FriseUnifiee from "./FriseUnifiee";
import HistoireTaux from "./HistoireTaux";
import Decumulation from "./Decumulation";

/** Position valorisable minimale. */
const pos = (ticker, quantity, prix, extra = {}) => ({
  ticker,
  name: ticker,
  quantity,
  current_price: prix,
  currency: "EUR",
  ...extra,
});

/** Date à N jours d'ici, pour bâtir des échéances toujours à venir. */
const dansNJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("ProchainesEcheances", () => {
  it("annonce son horizon plutôt que de laisser croire à une liste complète", () => {
    render(<ProchainesEcheances />);
    expect(screen.getByText(/Rien dans les six prochaines semaines/)).toBeInTheDocument();
  });

  it("date un préavis du dernier jour utile, et non de la fin du contrat", () => {
    render(
      <ProchainesEcheances
        contracts={[{ id: "c1", label: "Mutuelle", date_fin: dansNJours(70), preavis_jours: 60 }]}
      />
    );
    expect(screen.getByText(/Préavis — Mutuelle/)).toBeInTheDocument();
    expect(screen.getByText(/dans 10 jours/)).toBeInTheDocument();
  });

  it("laisse dehors ce qui est hors de la fenêtre", () => {
    render(
      <ProchainesEcheances
        evenements={[{ ticker: "MC", date: dansNJours(120), type: "dividende", label: "LVMH" }]}
      />
    );
    expect(screen.getByText(/Rien dans les six prochaines semaines/)).toBeInTheDocument();
  });
});

describe("SantePortefeuille", () => {
  it("n'invente pas de score sur un portefeuille vide", () => {
    render(<SantePortefeuille positions={[]} />);
    expect(screen.getByText(/Aucune ligne à analyser/)).toBeInTheDocument();
  });

  it("déplie les quatre composantes au lieu d'en rester au score global", () => {
    render(<SantePortefeuille positions={[pos("AAA", 10, 100), pos("BBB", 10, 100)]} />);
    // `getAllByText` : « Secteurs » sert aussi de titre au bloc de répartition
    // plus bas dans la carte. Ce qui compte ici est que les quatre composantes
    // soient dépliées, pas qu'elles soient uniques dans le document.
    for (const libelle of ["Concentration", "Secteurs", "Devises", "Frais"]) {
      expect(screen.getAllByText(libelle).length).toBeGreaterThan(0);
    }
  });

  it("nomme la ligne qui pèse le plus", () => {
    render(
      <SantePortefeuille positions={[pos("AAA", 10, 100), pos("BBB", 1, 100), pos("CCC", 1, 100)]} />
    );
    expect(screen.getByText(/AAA pèse 83 %/)).toBeInTheDocument();
  });
});

describe("RapprochementsAbonnements", () => {
  it("présente l'absence de rapprochement comme le bon résultat", () => {
    render(<RapprochementsAbonnements subs={[]} contracts={[]} />);
    expect(screen.getByText(/Rien à rapprocher/)).toBeInTheDocument();
  });

  it("formule un doublon comme une vérification, jamais comme une résiliation", () => {
    render(
      <RapprochementsAbonnements
        subs={[
          { id: "1", label: "Netflix", category: "Streaming", montant: 14 },
          { id: "2", label: "Disney+", category: "Streaming", montant: 9 },
        ]}
      />
    );
    expect(screen.getByText(/Streaming — 2 abonnements/)).toBeInTheDocument();
    expect(screen.getByText("À vérifier")).toBeInTheDocument();
    expect(screen.getByText(/appellent une vérification, pas une résiliation/)).toBeInTheDocument();
  });
});

describe("ComparateurScenarios", () => {
  const sc = (id, nom, monthly) => ({
    id,
    name: nom,
    years: 10,
    livrets: { capital: 10000, rate: 3, monthly: 0 },
    bourse: { capital: 10000, rate: 7, monthly },
  });

  it("réclame deux scénarios avant de comparer quoi que ce soit", () => {
    render(<ComparateurScenarios scenarios={[sc("a", "Seul", 200)]} />);
    expect(screen.getByText(/Il faut au moins deux scénarios/)).toBeInTheDocument();
  });

  it("classe les scénarios et désigne la référence", () => {
    render(<ComparateurScenarios scenarios={[sc("a", "Prudent", 100), sc("b", "Ambitieux", 400)]} />);
    const lignes = screen.getAllByRole("row").slice(1);
    expect(lignes[0]).toHaveTextContent("Ambitieux");
    expect(lignes[0]).toHaveTextContent("réf.");
  });

  it("explique l'écart par le versement, et pas seulement par le rendement", () => {
    render(<ComparateurScenarios scenarios={[sc("a", "Prudent", 100), sc("b", "Ambitieux", 400)]} />);
    expect(screen.getByText(/son versement mensuel est/)).toBeInTheDocument();
  });
});

describe("FriseUnifiee", () => {
  it("ne date PAS un objectif dont le franchissement n'a pas été enregistré", () => {
    // Objectif atteint mais sans échéance : rien ne permet de le placer sur la
    // frise, et lui inventer une date serait un chiffre plausible et faux.
    render(
      <FriseUnifiee
        operations={[]}
        objectifs={[{ id: "o", libelle: "Apport", cible: 1000 }]}
        patrimoineNet={5000}
      />
    );
    expect(screen.getByText(/Aucun événement daté/)).toBeInTheDocument();
  });

  it("place un objectif atteint à son échéance", () => {
    render(
      <FriseUnifiee
        operations={[]}
        objectifs={[{ id: "o", libelle: "Apport", cible: 1000, echeance: "2026-03-01" }]}
        patrimoineNet={5000}
      />
    );
    expect(screen.getByText(/Objectif atteint · Apport/)).toBeInTheDocument();
  });

  it("laisse dehors un objectif daté mais non atteint", () => {
    render(
      <FriseUnifiee
        operations={[]}
        objectifs={[{ id: "o", libelle: "Apport", cible: 100000, echeance: "2026-03-01" }]}
        patrimoineNet={5000}
      />
    );
    expect(screen.getByText(/Aucun événement daté/)).toBeInTheDocument();
  });

  it("range les événements du plus récent au plus ancien", () => {
    render(
      <FriseUnifiee
        operations={[
          { id: "1", date: "2025-01-10", type: "ACHAT", asset: "ANCIEN", quantity: 1, price: 10 },
          { id: "2", date: "2026-01-10", type: "ACHAT", asset: "RECENT", quantity: 1, price: 10 },
        ]}
      />
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("RECENT");
    expect(items[1]).toHaveTextContent("ANCIEN");
  });
});

describe("HistoireTaux", () => {
  it("annonce la pondération par la durée, qui n'est pas la moyenne des paliers", () => {
    render(<HistoireTaux />);
    expect(screen.getByText(/pondérée par la durée/)).toBeInTheDocument();
  });

  it("désigne la série active par aria-pressed", () => {
    render(<HistoireTaux />);
    expect(screen.getByRole("button", { name: "Livret A" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "LEP" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Decumulation", () => {
  it("annonce le rendement constant comme une hypothèse, pas comme un fait", () => {
    render(<Decumulation patrimoineNet={300000} livretsAvgRate={3} />);
    expect(screen.getByText(/donne un ordre de grandeur/)).toBeInTheDocument();
  });

  it("chiffre le seuil de retrait perpétuel à côté du résultat", () => {
    render(<Decumulation patrimoineNet={300000} livretsAvgRate={4} />);
    expect(screen.getByText(/Perpétuel dès/)).toBeInTheDocument();
  });

  it("expose l'indexation comme un réglage explicite, sans défaut caché", () => {
    render(<Decumulation patrimoineNet={300000} livretsAvgRate={4} />);
    expect(screen.getByText("Indexation")).toBeInTheDocument();
  });
});
