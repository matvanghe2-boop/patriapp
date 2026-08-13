/**
 * Carte repliable — la brique qui permet de composer l'écran Portefeuille.
 *
 * Deux propriétés comptent, et aucune n'est cosmétique :
 *
 *  1. Le contenu est réellement DÉMONTÉ quand la carte est repliée. Un simple
 *     masquage CSS laisserait les graphiques recharts se rendre en permanence,
 *     c'est-à-dire exactement le coût qu'on cherche à supprimer en repliant.
 *  2. L'état vient de l'appelant et n'est jamais gardé en interne : c'est ce
 *     qui permet de le persister. Une carte qui mémoriserait son propre repli
 *     rouvrirait tout à chaque rechargement.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarteRepliable } from "./ui";

const Contenu = () => <div data-testid="contenu">contenu lourd</div>;

describe("CarteRepliable", () => {
  it("monte le contenu quand la carte est dépliée", () => {
    render(
      <CarteRepliable titre="Répartition par ligne" replie={false} onBasculer={() => {}}>
        <Contenu />
      </CarteRepliable>
    );
    expect(screen.getByTestId("contenu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Répartition par ligne/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("démonte le contenu quand la carte est repliée", () => {
    render(
      <CarteRepliable titre="Répartition par ligne" replie onBasculer={() => {}}>
        <Contenu />
      </CarteRepliable>
    );
    // `queryBy` et non `getBy` : on affirme une ABSENCE.
    expect(screen.queryByTestId("contenu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Répartition par ligne/ })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("remonte la bascule sans garder d'état interne", async () => {
    const onBasculer = vi.fn();
    render(
      <CarteRepliable titre="Positions" replie onBasculer={onBasculer}>
        <Contenu />
      </CarteRepliable>
    );

    await userEvent.click(screen.getByRole("button", { name: /Positions/ }));

    expect(onBasculer).toHaveBeenCalledTimes(1);
    // Le contenu reste démonté : le composant n'a pas décidé tout seul de
    // s'ouvrir. C'est l'appelant — donc l'état persisté — qui commande.
    expect(screen.queryByTestId("contenu")).not.toBeInTheDocument();
  });

  it("affiche le résumé seulement une fois replié", () => {
    const { rerender } = render(
      <CarteRepliable titre="Dividendes" replie={false} onBasculer={() => {}} resume="420 € par an">
        <Contenu />
      </CarteRepliable>
    );
    expect(screen.queryByText(/420 € par an/)).not.toBeInTheDocument();

    rerender(
      <CarteRepliable titre="Dividendes" replie onBasculer={() => {}} resume="420 € par an">
        <Contenu />
      </CarteRepliable>
    );
    // Replié, la carte doit encore dire quelque chose d'utile — sinon on ne
    // sait plus ce qu'on a rangé.
    expect(screen.getByText(/420 € par an/)).toBeInTheDocument();
  });

  it("n'entraîne pas de repli quand on clique une action de l'en-tête", async () => {
    const onBasculer = vi.fn();
    const onAction = vi.fn();
    render(
      <CarteRepliable
        titre="Plafond de versements PEA"
        replie={false}
        onBasculer={onBasculer}
        actions={<button onClick={onAction}>Modifier</button>}
      >
        <Contenu />
      </CarteRepliable>
    );

    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));

    expect(onAction).toHaveBeenCalledTimes(1);
    // Le bouton d'action est un frère du bouton de repli, pas un enfant :
    // aucun risque que « Modifier » referme la carte qu'on veut éditer.
    expect(onBasculer).not.toHaveBeenCalled();
  });
});
