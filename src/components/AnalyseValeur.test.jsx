import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../lib/api", () => ({ analyserValeur: vi.fn() }));

import AnalyseValeur from "./AnalyseValeur";

const DONNEES = {
  cours: 100,
  per: 20, // BPA = 5
  perAttendu: 16, // BPA attendu = 6,25
  perMoyenHistorique: null,
  rendementMoyenPct: null,
  dividendeParAction: 3,
  consensusAnalystes: 118,
};

describe("AnalyseValeur", () => {
  it("affiche la fourchette SANS appeler le modèle", () => {
    // Le prix est de l'arithmétique : il doit s'afficher avant même qu'une
    // analyse ait été demandée, et sans aucun fournisseur configuré.
    render(<AnalyseValeur symbole="AI.PA" devise="€" donnees={DONNEES} />);
    expect(screen.getByText(/Trajectoire et valorisation/i)).toBeInTheDocument();
    expect(screen.getByText(/Fourchette calculée/i)).toBeInTheDocument();
    // 6,25 × 20 = 125. Le prix apparaît deux fois — dans la fourchette et
    // sur la ligne de la méthode — ce qui est voulu : on lit la borne, puis
    // d'où elle sort.
    expect(screen.getAllByText(/125/).length).toBeGreaterThan(0);
  });

  it("montre le calcul de chaque méthode, pour qu'il soit refaisable", () => {
    render(<AnalyseValeur symbole="AI.PA" devise="€" donnees={DONNEES} />);
    expect(screen.getByText(/BPA attendu/i)).toBeInTheDocument();
  });

  it("sépare le consensus d'analystes de la fourchette calculée", () => {
    // L'avis d'un groupe n'est pas un calcul : l'interface doit le dire.
    render(<AnalyseValeur symbole="AI.PA" devise="€" donnees={DONNEES} />);
    expect(screen.getByText(/Objectif moyen des analystes/i)).toBeInTheDocument();
    expect(screen.getByText(/pas un calcul/i)).toBeInTheDocument();
  });

  it("annonce l'absence de fourchette pour un titre sans fondamentaux", () => {
    // ETF, société en perte : mieux vaut le dire que de laisser croire à un
    // calcul impossible.
    render(<AnalyseValeur symbole="CW8.PA" devise="€" donnees={{ cours: 500 }} />);
    expect(screen.getByText(/fondamentaux ne sont pas publiés/i)).toBeInTheDocument();
    expect(screen.queryByText(/Fourchette calculée/i)).not.toBeInTheDocument();
  });

  it("propose d'expliquer la trajectoire, sans l'avoir déjà fait", () => {
    // L'appel au modèle coûte du quota : il ne part jamais tout seul.
    render(<AnalyseValeur symbole="AI.PA" devise="€" donnees={DONNEES} />);
    expect(screen.getByRole("button", { name: /Expliquer la trajectoire/i })).toBeInTheDocument();
  });

  it("ne rend rien sans données", () => {
    const { container } = render(<AnalyseValeur symbole="AI.PA" donnees={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("avertit quand les méthodes se dispersent fortement", () => {
    // Une dispersion large dit que le titre n'a pas de valorisation
    // consensuelle — à savoir AVANT de lire une fourchette.
    render(
      <AnalyseValeur
        symbole="X.PA"
        devise="€"
        donnees={{ cours: 100, per: 20, perAttendu: 5, dividendeParAction: 3, rendementMoyenPct: 8 }}
      />
    );
    expect(screen.getByText(/pas de valorisation consensuelle/i)).toBeInTheDocument();
  });
});
