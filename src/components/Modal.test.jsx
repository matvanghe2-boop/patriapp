/**
 * Modale : le focus ne doit pas sauter quand le parent se redessine.
 *
 * Régression corrigée avec le code de secours du coffre : `onClose`, recréé à
 * chaque rendu du parent, relançait l'effet de focus à chaque frappe. Le focus
 * partait sur le bouton « Fermer » après le premier caractère, et une espace
 * refermait la fenêtre — taper une phrase secrète était impossible.
 */
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";

function Parent({ surFermeture }) {
  const [valeur, setValeur] = useState("");
  return (
    <Modal open label="Essai" showClose onClose={() => surFermeture(valeur)}>
      <input aria-label="Champ" value={valeur} onChange={(e) => setValeur(e.target.value)} />
    </Modal>
  );
}

describe("Modal", () => {
  it("garde le focus dans un champ dont l'état vit chez le parent", async () => {
    const u = userEvent.setup();
    const surFermeture = vi.fn();
    render(<Parent surFermeture={surFermeture} />);
    const champ = screen.getByLabelText("Champ");
    await u.type(champ, "une phrase avec des espaces");
    expect(champ).toHaveValue("une phrase avec des espaces");
    expect(document.activeElement).toBe(champ);
    expect(surFermeture).not.toHaveBeenCalled();
  });

  it("appelle la dernière version de onClose sur Échap", async () => {
    const u = userEvent.setup();
    const surFermeture = vi.fn();
    render(<Parent surFermeture={surFermeture} />);
    await u.type(screen.getByLabelText("Champ"), "abc");
    await u.keyboard("{Escape}");
    expect(surFermeture).toHaveBeenCalledWith("abc");
  });
});
