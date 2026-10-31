/**
 * Bac à sable « et si » : une fois entré, rien n'est plus écrit sur
 * l'appareil, mais toutes les vues d'une même clé voient la version d'essai.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("./supabaseClient", () => ({ isSupabaseConfigured: false, supabase: null, supabaseConfig: {} }));

const { usePersistentState, entrerBacASable, estBacASable, _resetStorageCache } = await import("./storage");

let ecrire;
function Ecrivain() {
  const [valeur, setValeur] = usePersistentState("profile", "initial");
  ecrire = setValeur;
  return <div data-testid="ecrivain">{valeur}</div>;
}
function Lecteur() {
  const [valeur] = usePersistentState("profile", "initial");
  return <div data-testid="lecteur">{valeur}</div>;
}

describe("bac à sable", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetStorageCache();
  });

  it("garde les modifications en mémoire sans toucher au stockage", async () => {
    localStorage.setItem("patrimoine:profile", JSON.stringify("réel"));
    render(
      <>
        <Ecrivain />
        <Lecteur />
      </>
    );
    expect(screen.getByTestId("ecrivain")).toHaveTextContent("réel");

    act(() => entrerBacASable());
    expect(estBacASable()).toBe(true);
    await act(async () => ecrire("essai"));

    expect(screen.getByTestId("ecrivain")).toHaveTextContent("essai");
    expect(screen.getByTestId("lecteur")).toHaveTextContent("essai");
    expect(JSON.parse(localStorage.getItem("patrimoine:profile"))).toBe("réel");
  });

  it("repart des vraies données une fois le bac à sable quitté", () => {
    localStorage.setItem("patrimoine:profile", JSON.stringify("réel"));
    entrerBacASable();
    _resetStorageCache();
    expect(estBacASable()).toBe(false);
    render(<Lecteur />);
    expect(screen.getByTestId("lecteur")).toHaveTextContent("réel");
  });
});
