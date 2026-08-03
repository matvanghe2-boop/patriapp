import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fetchRates = vi.fn();
vi.mock("../lib/api", () => ({ fetchRates: (...a) => fetchRates(...a) }));

import RatesHub from "./RatesHub";
import { RATES_CATALOG } from "../lib/ratesCatalog";

const LIVE_PAYLOAD = { rates: RATES_CATALOG.map((r) => ({ ...r, live: false })), liveEnabled: false };

beforeEach(() => {
  fetchRates.mockReset();
});

describe("RatesHub", () => {
  it("affiche le catalogue complet une fois chargé", async () => {
    fetchRates.mockResolvedValue(LIVE_PAYLOAD);
    render(<RatesHub livrets={[]} />);
    expect(await screen.findByText("Livret A")).toBeInTheDocument();
    // Le libellé du LEP apparaît à la fois sur sa carte et dans le sous-texte
    // du KPI « Meilleur taux réglementé » : on vérifie juste sa présence.
    expect(screen.getAllByText(/LEP \(Livret d'Épargne Populaire\)/).length).toBeGreaterThan(0);
  });

  // Les cartes de KPI en haut de page (meilleur taux, prochaine révision)
  // réaffichent le libellé de certains taux, indépendamment du filtrage. Les
  // assertions de filtrage doivent donc porter sur le catalogue lui-même, pas
  // sur le document entier.
  const catalogue = () => within(screen.getByRole("region", { name: /catalogue des taux/i }));

  it("filtre par la barre de recherche", async () => {
    const user = userEvent.setup();
    fetchRates.mockResolvedValue(LIVE_PAYLOAD);
    render(<RatesHub livrets={[]} />);
    await screen.findByText("Livret A");

    await user.type(screen.getByPlaceholderText(/rechercher un taux/i), "inflation");

    expect(catalogue().getByText(/Inflation France/)).toBeInTheDocument();
    expect(catalogue().queryByText("Livret A")).not.toBeInTheDocument();
  });

  it("masque une catégorie désactivée via les filtres", async () => {
    const user = userEvent.setup();
    fetchRates.mockResolvedValue(LIVE_PAYLOAD);
    render(<RatesHub livrets={[]} />);
    await screen.findByText("Livret A");

    await user.click(screen.getByRole("button", { name: /^Épargne$/ }));

    expect(catalogue().queryByText("Livret A")).not.toBeInTheDocument();
    expect(catalogue().getByText(/Inflation France/)).toBeInTheDocument();
  });

  it("signale un écart entre le taux saisi par l'utilisateur et le taux officiel", async () => {
    fetchRates.mockResolvedValue(LIVE_PAYLOAD);
    render(<RatesHub livrets={[{ id: "l1", name: "Livret A", rate: 0.024 }]} />);

    expect(await screen.findByText(/Tout à jour|à vérifier/i)).toBeInTheDocument();
    expect(screen.getByText(/vs officiel/)).toBeInTheDocument();
  });

  it("ne signale aucun écart quand le taux saisi correspond au taux officiel", async () => {
    fetchRates.mockResolvedValue(LIVE_PAYLOAD);
    render(<RatesHub livrets={[{ id: "l1", name: "Livret A", rate: 0.017 }]} />);
    await screen.findByText("Livret A");
    expect(screen.getByText("À jour")).toBeInTheDocument();
  });

  /**
   * Régression : avant correction de fetchRates(), une réponse malformée
   * (ex : fallback SPA HTML sous simple `vite` sans `vercel dev`) faisait
   * planter tout l'onglet au lieu d'afficher le catalogue de secours.
   */
  it("retombe sur le catalogue de référence local quand l'API échoue", async () => {
    fetchRates.mockRejectedValue(new Error("Catalogue des taux indisponible"));
    render(<RatesHub livrets={[]} />);

    expect(await screen.findByText("Livret A")).toBeInTheDocument();
    expect(screen.getByText(/référence hors-ligne/i)).toBeInTheDocument();
  });

  it("affiche un état vide explicite quand la recherche ne trouve rien", async () => {
    const user = userEvent.setup();
    fetchRates.mockResolvedValue(LIVE_PAYLOAD);
    render(<RatesHub livrets={[]} />);
    await screen.findByText("Livret A");

    await user.type(screen.getByPlaceholderText(/rechercher un taux/i), "zzzintrouvable");

    expect(screen.getByText(/Aucun taux ne correspond/)).toBeInTheDocument();
  });

  it("affiche les KPI de synthèse (meilleur taux, Livret A, prochaine révision)", async () => {
    fetchRates.mockResolvedValue(LIVE_PAYLOAD);
    render(<RatesHub livrets={[]} />);
    await screen.findByText("Livret A");

    expect(screen.getByText("Meilleur taux réglementé")).toBeInTheDocument();
    expect(screen.getByText("Livret A en vigueur")).toBeInTheDocument();
    expect(screen.getByText("Prochaine révision connue")).toBeInTheDocument();
  });
});
