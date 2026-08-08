import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ReglagesHorizon, { BandeauModeReel } from "./ReglagesHorizon";

const rendre = (reglages = { montantsReels: false }, onChange = vi.fn()) => {
  render(<ReglagesHorizon reglages={reglages} onChange={onChange} onClose={() => {}} />);
  return onChange;
};

describe("ReglagesHorizon", () => {
  it("affiche l'anonymisation comme mode par défaut", () => {
    rendre();
    expect(screen.getByText("Anonymisation en base 100")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("n'active jamais le mode réel sans passer par un consentement", async () => {
    const user = userEvent.setup();
    const onChange = rendre();

    await user.click(screen.getByRole("switch"));

    // Le clic ouvre l'écran de confirmation, il ne bascule pas le réglage.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Activer l'envoi des montants réels/)).toBeInTheDocument();
  });

  it("dit ce que le mode réel change ET ce qu'il ne change pas", async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole("switch"));

    expect(screen.getByText(/seront transmis\s+en euros/)).toBeInTheDocument();
    expect(screen.getByText(/aucun nom de compte, aucun ticker/)).toBeInTheDocument();
  });

  it("active après confirmation explicite", async () => {
    const user = userEvent.setup();
    const onChange = rendre();

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: /activer/i }));

    expect(onChange).toHaveBeenCalledWith({ montantsReels: true });
  });

  it("laisse annuler sans rien changer", async () => {
    const user = userEvent.setup();
    const onChange = rendre();

    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: /annuler/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("désactive immédiatement, sans confirmation", async () => {
    // Revenir au mode le plus protecteur ne doit jamais être freiné.
    const user = userEvent.setup();
    const onChange = rendre({ montantsReels: true });

    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith({ montantsReels: false });
  });

  it("rappelle que les formulaires n'envoient rien dans les deux modes", () => {
    rendre();
    expect(screen.getByText(/n'envoient rien,\s+quel que soit le mode/)).toBeInTheDocument();
  });
});

describe("BandeauModeReel", () => {
  it("signale le mode actif et propose de le modifier", async () => {
    const user = userEvent.setup();
    const onOuvrir = vi.fn();
    render(<BandeauModeReel onOuvrirReglages={onOuvrir} />);

    expect(screen.getByText(/Mode montants réels actif/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /modifier/i }));
    expect(onOuvrir).toHaveBeenCalled();
  });
});
