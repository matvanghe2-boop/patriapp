/**
 * Les quinze gestes de la refonte, vérifiés là où ils sont vérifiables.
 *
 * Beaucoup relèvent du CSS pur — la coquille flottante, la texture, les
 * feuilles par le bas — et ne peuvent pas être testés dans jsdom, qui
 * n'applique aucune feuille de style. Ce fichier couvre donc ce qui vit dans
 * le DOM : la structure produite, les classes posées, et les régressions que
 * ces gestes pourraient introduire.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, BandeauDomaine, PastilleEtat } from "./ui";
import ModePresentation from "./ModePresentation";
import FeuillePlus from "./FeuillePlus";
import BottomNav from "./BottomNav";
import { Home, PiggyBank, TrendingUp, Calculator, NotebookPen, Repeat } from "lucide-react";

describe("Card — trois rôles", () => {
  it("porte la classe de son rôle", () => {
    const { container, rerender } = render(<Card role="vedette">x</Card>);
    expect(container.firstChild.className).toContain("carte-vedette");
    rerender(<Card role="ambiant">x</Card>);
    expect(container.firstChild.className).toContain("carte-ambiant");
  });

  it("vaut « standard » par défaut, comme avant la refonte", () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstChild.className).toContain("carte-standard");
  });

  it("retire le fond plein sur le rôle ambiant", () => {
    // C'est ce qui l'empêche de disputer l'attention au reste : un fond plein
    // suffirait à le faire lire comme une carte ordinaire.
    const { container, rerender } = render(<Card role="ambiant">x</Card>);
    expect(container.firstChild.className).not.toContain("bg-slate-900");
    rerender(<Card role="standard">x</Card>);
    expect(container.firstChild.className).toContain("bg-slate-900");
  });

  it("continue d'accepter un accent, comme les vingt appels existants", () => {
    const { container } = render(<Card accent="teinte-emerald carte-domaine">x</Card>);
    expect(container.firstChild.className).toContain("teinte-emerald");
  });
});

describe("BandeauDomaine", () => {
  it("rend le titre de page VISIBLE et non plus réservé aux lecteurs d'écran", () => {
    // Le `<h1>` de chaque écran était `sr-only` : on déduisait l'onglet courant
    // de la couleur du fond et d'un bouton surligné dans une barre latérale
    // qui, sur mobile, n'est même pas affichée.
    render(<BandeauDomaine titre="PEA & Bourse" sousTitre="portefeuille, performance" />);
    const titre = screen.getByRole("heading", { level: 1 });
    expect(titre).toHaveTextContent("PEA & Bourse");
    expect(titre.className).not.toContain("sr-only");
    expect(screen.getByText("portefeuille, performance")).toBeInTheDocument();
  });

  it("se passe de sous-titre", () => {
    render(<BandeauDomaine titre="Dashboard" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dashboard");
  });
});

describe("PastilleEtat", () => {
  it("expose son état, indépendamment de l'accent", () => {
    // L'ambre servait à la fois d'accent et d'alerte : depuis que l'accent est
    // réglable, choisir le vert donnait des avertissements verts.
    const { container } = render(<PastilleEtat etat="critique">Matelas faible</PastilleEtat>);
    expect(container.firstChild.dataset.etat).toBe("critique");
  });

  it("retombe sur « neutre »", () => {
    const { container } = render(<PastilleEtat>—</PastilleEtat>);
    expect(container.firstChild.dataset.etat).toBe("neutre");
  });
});

describe("BottomNav — quatre entrées plus « Plus »", () => {
  const onglets = [
    { key: "dashboard", label: "Dashboard", shortLabel: "Accueil", icon: Home, theme: "emerald" },
    { key: "livrets", label: "Livrets", shortLabel: "Épargne", icon: PiggyBank, theme: "indigo" },
    { key: "bourse", label: "Bourse", shortLabel: "Bourse", icon: TrendingUp, theme: "violet" },
    { key: "simulation", label: "Simulation", shortLabel: "Simuler", icon: Calculator, theme: "amber" },
    { key: "strategie", label: "Stratégie", shortLabel: "Stratégie", icon: NotebookPen, theme: "rose" },
    { key: "abonnements", label: "Abonnements", shortLabel: "Abos", icon: Repeat, theme: "cyan" },
  ];

  it("n'affiche que cinq cibles au lieu de six", () => {
    // Six cibles donnent 62 px chacune sur un téléphone standard, étiquette
    // comprise — sous le confortable, et le dernier libellé était tronqué.
    render(<BottomNav tabs={onglets} active="dashboard" onChange={() => {}} onPlus={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("surligne « Plus » quand la section courante s'y trouve", () => {
    // Sans ça, ouvrir Abonnements laisserait la barre sans repère actif.
    render(<BottomNav tabs={onglets} active="abonnements" onChange={() => {}} onPlus={() => {}} />);
    const plus = screen.getByRole("button", { name: /^Plus/ });
    expect(plus.className).toContain("text-amber-300");
  });

  it("annonce ce que « Plus » contient", () => {
    render(<BottomNav tabs={onglets} active="dashboard" onChange={() => {}} onPlus={() => {}} />);
    expect(screen.getByRole("button", { name: /Stratégie, Abonnements/ })).toBeInTheDocument();
  });

  it("garde les six entrées directes si rien ne dépasse", () => {
    render(<BottomNav tabs={onglets.slice(0, 3)} active="dashboard" onChange={() => {}} onPlus={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });
});

describe("FeuillePlus", () => {
  it("expose les sections repliées ET les actions du menu latéral", () => {
    // Les réglages et la rétrospective vivaient dans la barre latérale, masquée
    // sous 768 px : ils n'existaient donc que sur ordinateur.
    render(
      <FeuillePlus
        ouvert
        onFermer={() => {}}
        sections={[{ key: "abonnements", label: "Abonnements", icon: Repeat }]}
        actions={[{ id: "a", libelle: "Apparence", executer: () => {} }]}
        onNaviguer={() => {}}
      />
    );
    expect(screen.getByText("Abonnements")).toBeInTheDocument();
    expect(screen.getByText("Apparence")).toBeInTheDocument();
  });

  it("monte par le bas", () => {
    const { baseElement } = render(<FeuillePlus ouvert onFermer={() => {}} sections={[]} actions={[]} />);
    expect(baseElement.querySelector(".feuille-bas")).not.toBeNull();
  });

  it("ne rend rien quand elle est fermée", () => {
    const { baseElement } = render(<FeuillePlus ouvert={false} onFermer={() => {}} />);
    expect(baseElement.querySelector(".feuille-bas")).toBeNull();
  });
});

describe("ModePresentation", () => {
  it("affiche le patrimoine et les repères, sans navigation", () => {
    render(
      <ModePresentation ouvert onFermer={() => {}} patrimoineNet={48312} deltaPct={3.8} tauxEpargne={42} matelasMois={5.2} />
    );
    expect(screen.getByText(/Patrimoine net/)).toBeInTheDocument();
    expect(screen.getByText("42 %")).toBeInTheDocument();
    expect(screen.getByText("5.2")).toBeInTheDocument();
  });

  it("garde les montants masquables par le mode Ghost", () => {
    // Un raccourci de présentation ne doit pas déshabiller un écran qu'on avait
    // délibérément masqué.
    const { baseElement } = render(
      <ModePresentation ouvert onFermer={() => {}} patrimoineNet={48312} deltaPct={null} />
    );
    expect(baseElement.querySelector(".presentation-valeur.ghost-blur")).not.toBeNull();
  });

  it("ne rend rien quand il est fermé", () => {
    const { baseElement } = render(<ModePresentation ouvert={false} onFermer={() => {}} patrimoineNet={1} />);
    expect(baseElement.querySelector(".presentation")).toBeNull();
  });

  it("tolère des repères absents", () => {
    render(<ModePresentation ouvert onFermer={() => {}} patrimoineNet={100} deltaPct={null} tauxEpargne={null} matelasMois={null} />);
    expect(screen.getByText(/Patrimoine net/)).toBeInTheDocument();
  });
});
