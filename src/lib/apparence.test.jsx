import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stockage local pur : ces préférences passent par `usePersistentState`, dont
// le chemin cloud n'a rien à voir avec ce qu'on vérifie ici.
vi.mock("./supabaseClient", () => ({
  isSupabaseConfigured: false,
  supabase: null,
  supabaseConfig: { url: "", anonKey: "" },
}));

import { ApparenceProvider, useApparence } from "./ApparenceContext";
import { vibrer, MOTIFS } from "./haptique";

function Sonde() {
  const a = useApparence();
  return (
    <div>
      <span data-testid="theme">{a.theme}</span>
      <span data-testid="accent">{a.accent}</span>
      <span data-testid="densite">{a.densite}</span>
      <button onClick={() => a.setTheme("clair")}>clair</button>
      <button onClick={() => a.setTheme("sombre")}>sombre</button>
      <button onClick={() => a.setTheme("auto")}>auto</button>
      <button onClick={() => a.setAccent("violet")}>violet</button>
      <button onClick={() => a.setDensite("compacte")}>compacte</button>
    </div>
  );
}

const monter = () => render(<ApparenceProvider><Sonde /></ApparenceProvider>);

describe("préférences d'apparence", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-densite");
    document.documentElement.removeAttribute("data-mouvement");
  });

  it("démarre en automatique, ambre, confortable", () => {
    monter();
    expect(screen.getByTestId("theme")).toHaveTextContent("auto");
    expect(screen.getByTestId("accent")).toHaveTextContent("amber");
    expect(screen.getByTestId("densite")).toHaveTextContent("confortable");
  });

  it("ne pose AUCUN attribut de thème en automatique", () => {
    // C'est ce qui permet à `prefers-color-scheme` de décider seul, sans
    // JavaScript : l'absence d'attribut est un état à part entière, pas un
    // oubli.
    monter();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("pose l'attribut sur un choix explicite, et le retire au retour en auto", async () => {
    const u = userEvent.setup();
    monter();
    await u.click(screen.getByText("clair"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("clair");
    await u.click(screen.getByText("sombre"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("sombre");
    await u.click(screen.getByText("auto"));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("écrit la teinte de l'accent sur la racine", () => {
    // Les classes Tailwind ne peuvent pas exprimer un choix fait à l'exécution :
    // l'outil analyse le source en texte brut.
    const u = userEvent.setup();
    monter();
    return u.click(screen.getByText("violet")).then(() => {
      expect(document.documentElement.style.getPropertyValue("--accent-h")).toBe("258");
      expect(document.documentElement.style.getPropertyValue("--accent-s")).toBe("90%");
    });
  });

  it("répercute la densité sur la racine", async () => {
    const u = userEvent.setup();
    monter();
    await u.click(screen.getByText("compacte"));
    expect(document.documentElement.getAttribute("data-densite")).toBe("compacte");
  });

  it("persiste les choix d'une session à l'autre", async () => {
    const u = userEvent.setup();
    const { unmount } = monter();
    await u.click(screen.getByText("clair"));
    await u.click(screen.getByText("violet"));
    unmount();
    monter();
    expect(screen.getByTestId("theme")).toHaveTextContent("clair");
    expect(screen.getByTestId("accent")).toHaveTextContent("violet");
  });

  it("comble les préférences absentes d'un enregistrement ancien", () => {
    // Une préférence ajoutée après coup ne doit pas rendre l'objet persisté
    // invalide : sans les défauts, `densite` vaudrait `undefined` et la classe
    // CSS correspondante n'existerait pas.
    localStorage.setItem("patrimoine:apparence", JSON.stringify({ theme: "sombre" }));
    monter();
    expect(screen.getByTestId("theme")).toHaveTextContent("sombre");
    expect(screen.getByTestId("densite")).toHaveTextContent("confortable");
    expect(screen.getByTestId("accent")).toHaveTextContent("amber");
  });

  it("dégrade proprement sans provider", () => {
    // Plusieurs composants d'interface sont montés isolément dans les tests :
    // une préférence manquante doit retomber sur les défauts, pas faire tomber
    // le rendu.
    render(<Sonde />);
    expect(screen.getByTestId("theme")).toHaveTextContent("auto");
  });
});

describe("retour tactile", () => {
  it("ne fait rien quand l'appareil ne sait pas vibrer", () => {
    const original = navigator.vibrate;
    delete navigator.vibrate;
    expect(vibrer("navigation", true)).toBe(false);
    if (original) navigator.vibrate = original;
  });

  it("respecte le réglage de l'utilisateur", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    vibrer("navigation", false);
    expect(vibrate).not.toHaveBeenCalled();
    vibrer("navigation", true);
    expect(vibrate).toHaveBeenCalledWith(MOTIFS.navigation);
  });

  it("distingue la suppression des autres retours", () => {
    // Une confirmation ne doit pas vibrer comme une suppression : c'est la
    // seule action qu'on peut regretter.
    expect(MOTIFS.suppression).not.toEqual(MOTIFS.validation);
    expect(Array.isArray(MOTIFS.suppression)).toBe(true);
  });

  it("ne propage pas une erreur du navigateur", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: () => { throw new Error("refusé"); },
      configurable: true,
    });
    expect(() => vibrer("validation", true)).not.toThrow();
  });
});
