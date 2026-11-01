/**
 * Champ numérique partagé : un montant écrit à la française doit être retenu,
 * pas silencieusement remplacé par la valeur précédente.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChampNumerique } from "./ui";

describe("ChampNumerique", () => {
  it("retient « 2 100 » et « 1 299,99 € » à la sortie du champ", async () => {
    const u = userEvent.setup();
    const onCommit = vi.fn();
    render(<ChampNumerique aria-label="Revenu" value={1800} onCommit={onCommit} />);
    const champ = screen.getByLabelText("Revenu");

    await u.clear(champ);
    await u.type(champ, "2 100{Enter}");
    expect(onCommit).toHaveBeenLastCalledWith(2100);
    expect(champ).toHaveValue("2100");

    await u.clear(champ);
    await u.type(champ, "1 299,99 €");
    await u.tab();
    expect(onCommit).toHaveBeenLastCalledWith(1299.99);
  });

  it("revient à la valeur en place sur une saisie inexploitable", async () => {
    const u = userEvent.setup();
    const onCommit = vi.fn();
    render(<ChampNumerique aria-label="Revenu" value={1800} onCommit={onCommit} />);
    const champ = screen.getByLabelText("Revenu");
    await u.clear(champ);
    await u.type(champ, "douze{Enter}");
    expect(onCommit).not.toHaveBeenCalled();
    expect(champ).toHaveValue("1800");
  });
});
