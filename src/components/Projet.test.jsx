import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import Projet from "./Projet";

// Recharts ne se dimensionne pas dans jsdom (ResponsiveContainer mesure un
// conteneur de taille nulle) : les assertions portent donc sur le texte et les
// commandes, jamais sur le tracé du graphique lui-même.

const patrimoine = { livretsTotal: 20000, bourseTotal: 30000 };

/** Historique court, représentatif de la situation réelle (~1 mois). */
const historiqueCourt = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, "0")}`,
  label: `J${i}`,
  value: 50000 + i * 20,
}));

describe("Projet", () => {
  it("se monte et affiche les trois blocs de paramètres", () => {
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);
    expect(screen.getByText("Le projet")).toBeInTheDocument();
    expect(screen.getByText("Financement")).toBeInTheDocument();
    expect(screen.getByText("Objectif de référence")).toBeInTheDocument();
  });

  it("avertit que les rendements ne viennent pas des données de l'utilisateur", () => {
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);
    expect(screen.getByText(/Hypothèses de rendement non dérivées/)).toBeInTheDocument();
    expect(screen.getByText(/Historique insuffisant/)).toBeInTheDocument();
  });


  /**
   * Les sections secondaires du sous-onglet sont repliées par défaut (le
   * sous-onglet empilait une douzaine de cartes sur un seul défilement). Les
   * tests qui portent sur leur contenu doivent donc les déplier d'abord.
   */
  const deplier = async (user, titre) => {
    const bouton = screen.getByRole("button", { name: new RegExp(titre, "i") });
    if (bouton.getAttribute("aria-expanded") === "false") await user.click(bouton);
  };

  it("fonctionne sans aucun historique", () => {
    render(<Projet {...patrimoine} historyPast={[]} />);
    expect(screen.getByText("Le projet")).toBeInTheDocument();
  });

  it("affiche les quatre indicateurs de verdict", async () => {
    const user = userEvent.setup();
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);
    expect(screen.getByText(/Coût global sur/)).toBeInTheDocument();
    expect(screen.getByText("Effort mensuel")).toBeInTheDocument();
    expect(screen.getByText("Impact sur l'objectif")).toBeInTheDocument();
    // « Manque à gagner » titre le KPI ; il figure aussi dans la ventilation,
    // une fois la section « Détail des coûts » dépliée.
    expect(screen.getAllByText("Manque à gagner")).toHaveLength(1);
    await deplier(user, "Détail des coûts");
    expect(screen.getAllByText("Manque à gagner")).toHaveLength(2);
  });

  it("n'expose les champs de crédit qu'en financement à crédit", async () => {
    const user = userEvent.setup();
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);

    expect(screen.queryByText(/Taux du crédit/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "À crédit" }));
    expect(screen.getByText(/Taux du crédit/)).toBeInTheDocument();
    expect(screen.getByText(/Durée du crédit/)).toBeInTheDocument();
    expect(screen.getByText(/Apport/)).toBeInTheDocument();
  });

  it("fait apparaître le TAEG et la mensualité une fois à crédit", async () => {
    const user = userEvent.setup();
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);
    await user.click(screen.getByRole("button", { name: "À crédit" }));
    await deplier(user, "Détail des coûts");
    // Le récapitulatif du crédit vit dans la carte de ventilation ; « mensualité »
    // apparaît aussi dans le sous-texte du KPI « Effort mensuel ».
    const carte = screen.getByText("Où part l'argent").closest("div.rounded-2xl");
    expect(within(carte).getByText(/TAEG/)).toBeInTheDocument();
    expect(within(carte).getByText(/mensualité/)).toBeInTheDocument();
    expect(within(carte).getByText(/Coût du crédit/)).toBeInTheDocument();
  });

  it("bascule entre euros courants et euros constants", async () => {
    const user = userEvent.setup();
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);

    const bouton = screen.getByRole("button", { name: /Euros courants/ });
    await user.click(bouton);
    expect(screen.getByRole("button", { name: /Euros constants/ })).toBeInTheDocument();
    expect(screen.getByText(/\(euros constants\)/)).toBeInTheDocument();
  });

  it("répercute le libellé du projet dans la légende du graphique", async () => {
    const user = userEvent.setup();
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);

    const champ = screen.getByDisplayValue("Voiture");
    await user.clear(champ);
    await user.type(champ, "Van");
    expect(screen.getByText(/avec et sans « Van »/)).toBeInTheDocument();
  });

  it("liste les hypothèses appliquées plutôt que de les taire", async () => {
    const user = userEvent.setup();
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);
    await deplier(user, "Détail des coûts");
    const carte = screen.getByText("Hypothèses appliquées").closest("div.rounded-2xl");
    expect(within(carte).getByText("Décote annuelle")).toBeInTheDocument();
    expect(within(carte).getByText("Entretien annuel")).toBeInTheDocument();
    // Les valeurs de référence non confirmées à la source sont signalées.
    expect(within(carte).getAllByText("à vérifier").length).toBeGreaterThan(0);
  });

  it("ventile le coût de possession poste par poste", async () => {
    const user = userEvent.setup();
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);
    await deplier(user, "Détail des coûts");
    const carte = screen.getByText("Où part l'argent").closest("div.rounded-2xl");
    expect(within(carte).getByText("Perte de valeur")).toBeInTheDocument();
    expect(within(carte).getByText("Manque à gagner")).toBeInTheDocument();
  });

  it("affiche les deux probabilités d'atteindre l'objectif", () => {
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);
    // « sans le projet » apparaît dans la légende du graphique ET dans le
    // commentaire de probabilité, tous deux dans la section ouverte par défaut.
    expect(screen.getAllByText(/sans le projet/).length).toBeGreaterThan(0);
    expect(screen.getByText(/simulations, mêmes aléas/)).toBeInTheDocument();
  });

  it("porte le disclaimer de simulation", () => {
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);
    expect(screen.getByText(/pas un conseil en investissement/)).toBeInTheDocument();
  });

  it("répercute le changement de catégorie sur les hypothèses", async () => {
    const user = userEvent.setup();
    render(<Projet {...patrimoine} historyPast={historiqueCourt} />);
    await deplier(user, "Détail des coûts");
    // Le libellé de catégorie apparaît dans le chapô de la carte et dans le
    // détail de chaque hypothèse : on vérifie la bascule, pas une occurrence.
    const carte = screen.getByText("Hypothèses appliquées").closest("div.rounded-2xl");
    expect(within(carte).getAllByText(/catégorie « Véhicule »/).length).toBeGreaterThan(0);
    expect(within(carte).queryByText(/catégorie « Bien immobilier »/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "immobilier");
    expect(within(carte).getAllByText(/catégorie « Bien immobilier »/).length).toBeGreaterThan(0);
    expect(within(carte).queryByText(/catégorie « Véhicule »/)).not.toBeInTheDocument();
  });

  it("tient sur un patrimoine nul", () => {
    render(<Projet livretsTotal={0} bourseTotal={0} historyPast={[]} />);
    expect(screen.getByText("Le projet")).toBeInTheDocument();
  });
});
