import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Sans Supabase configuré, l'app tourne en stockage local pur : c'est le mode
// le plus simple à monter en test, et il couvre malgré tout toute la coquille
// de navigation, le routage par URL et les dialogues.
vi.mock("./lib/supabaseClient", () => ({
  isSupabaseConfigured: false,
  supabase: null,
}));

import App from "./App.jsx";
import { AuthProvider } from "./lib/AuthContext";
import { PatrimoineProvider } from "./lib/PatrimoineContext";
import { ToastProvider } from "./lib/ToastContext";
import { ConfirmProvider } from "./lib/ConfirmContext";

function renderApp() {
  return render(
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <PatrimoineProvider>
            <App />
          </PatrimoineProvider>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

describe("App", () => {
  it("monte sans erreur et affiche la navigation principale", async () => {
    renderApp();
    const nav = screen.getByRole("navigation", { name: /navigation principale/i });
    expect(within(nav).getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "PEA & Bourse" })).toBeInTheDocument();
  });

  it("marque l'onglet courant pour les lecteurs d'écran", () => {
    renderApp();
    const nav = screen.getByRole("navigation", { name: /navigation principale/i });
    expect(within(nav).getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  // La barre latérale (bureau) et la barre basse (mobile) coexistent dans le
  // DOM — seul le CSS en masque une selon la largeur. Les clics de navigation
  // doivent donc désigner explicitement l'une des deux.
  const sidebar = () => within(screen.getByRole("navigation", { name: /navigation principale/i }));

  it("écrit l'onglet dans l'URL, pour que le lien soit partageable et le retour arrière utile", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(sidebar().getByRole("button", { name: "Simulation" }));
    expect(window.location.hash).toBe("#/simulation");
  });

  it("propose une navigation basse distincte sur mobile", () => {
    renderApp();
    const bottom = screen.getByRole("navigation", { name: /navigation rapide/i });
    // Mêmes destinations que la barre latérale, libellés courts à l'écran mais
    // nom complet annoncé aux lecteurs d'écran.
    expect(within(bottom).getByRole("button", { name: "PEA & Bourse" })).toBeInTheDocument();
    expect(within(bottom).getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("ouvre directement le bon onglet quand l'URL en désigne un", () => {
    window.location.hash = "#/strategie";
    renderApp();
    const nav = screen.getByRole("navigation", { name: /navigation principale/i });
    expect(within(nav).getByRole("button", { name: "Stratégie & Logs" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("ne propose plus « Immobilier & Crédit » dans le menu principal", () => {
    renderApp();
    const nav = screen.getByRole("navigation", { name: /navigation principale/i });
    expect(within(nav).queryByRole("button", { name: /immobilier/i })).not.toBeInTheDocument();
  });

  it("redirige un ancien lien #/immobilier vers Simulation plutôt que vers l'accueil", () => {
    window.location.hash = "#/immobilier";
    renderApp();
    const nav = screen.getByRole("navigation", { name: /navigation principale/i });
    expect(within(nav).getByRole("button", { name: "Simulation" })).toHaveAttribute("aria-current", "page");
    // L'URL est réécrite : elle ne doit pas contredire l'onglet affiché.
    expect(window.location.hash).toBe("#/simulation");
  });

  it("expose Immobilier & Crédit en sous-onglet de Simulation", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(sidebar().getByRole("button", { name: "Simulation" }));

    const sousOnglet = await screen.findByRole("button", { name: /immobilier & crédit/i });
    await user.click(sousOnglet);

    // Le contenu du module immobilier est bien rendu, avec son propre titre.
    expect(await screen.findByRole("heading", { name: /immobilier|crédit/i })).toBeInTheDocument();
    expect(screen.getAllByText(/endettement/i).length).toBeGreaterThan(0);
  });

  it("retombe sur le Dashboard si l'URL désigne un onglet inexistant", () => {
    window.location.hash = "#/nimportequoi";
    renderApp();
    const nav = screen.getByRole("navigation", { name: /navigation principale/i });
    expect(within(nav).getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("propose un lien d'évitement vers le contenu principal", () => {
    renderApp();
    expect(screen.getByRole("link", { name: /aller au contenu principal/i })).toHaveAttribute(
      "href",
      "#contenu-principal"
    );
  });

  it("demande confirmation avant d'effacer les données, au lieu d'un window.confirm", async () => {
    const user = userEvent.setup();
    // Si le code utilisait encore window.confirm, ce mock renverrait false et
    // aucune boîte de dialogue applicative n'apparaîtrait.
    const nativeConfirm = vi.fn(() => false);
    vi.stubGlobal("confirm", nativeConfirm);

    renderApp();
    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/irréversible/i)).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("referme le dialogue de confirmation sur Échap sans rien effacer", async () => {
    const user = userEvent.setup();
    localStorage.setItem("patrimoine:cash", "1234");

    renderApp();
    await user.click(screen.getByRole("button", { name: /réinitialiser/i }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("patrimoine:cash")).toBe("1234");
  });

  it("refuse un fichier JSON qui n'est pas une sauvegarde Patrium", async () => {
    const user = userEvent.setup();
    renderApp();

    const input = document.querySelector('input[type="file"]');
    const file = new File([JSON.stringify({ nimporte: "quoi" })], "autre.json", {
      type: "application/json",
    });
    await user.upload(input, file);

    expect(await screen.findByText(/ne ressemble pas à une sauvegarde Patrium/i)).toBeInTheDocument();
    // Aucune confirmation ne doit être proposée pour un fichier rejeté.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
