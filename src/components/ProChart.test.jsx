/**
 * Fenêtre initiale du graphique de cours.
 *
 * Le graphique s'ouvrait démesurément zoomé sur la première bougie : on ne
 * voyait jamais la période demandée au premier coup d'œil. La fenêtre visible
 * partait de `{ start: 0, end: 0 }` et n'était recalée que par un ajustement
 * conditionné au CHANGEMENT d'identité de la série — condition fausse au tout
 * premier rendu, puisque la série y est déjà celle qu'on vient de recevoir.
 *
 * Le cas nominal est précisément celui qui échouait : `<Marche>` ne monte le
 * graphique qu'une fois l'historique chargé, donc la série est toujours
 * complète au montage.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ProChart from "./ProChart";

/** Série synthétique : une tendance régulière, pour que chaque barre diffère. */
function serie(n) {
  return Array.from({ length: n }, (_, i) => {
    const base = 100 + i;
    return {
      date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      open: base,
      high: base + 2,
      low: base - 2,
      close: base + 1,
      volume: 1000 + i,
    };
  });
}

/** Nombre de graduations d'abscisse effectivement rendues. */
function graduations(container) {
  return [...container.querySelectorAll("text")].filter((t) => /^\d/.test(t.textContent || "")).length;
}

describe("ProChart — fenêtre au premier rendu", () => {
  it("ouvre la série entière quand les données sont déjà là au montage", () => {
    const { container } = render(<ProChart data={serie(120)} />);
    // Une fenêtre restée à zéro ne laisse qu'UNE barre dans le domaine visible,
    // donc une seule graduation. La série entière en produit plusieurs.
    expect(graduations(container)).toBeGreaterThan(2);
  });

  it("dessine autant de bougies que la série en compte", () => {
    // Le tracé des mèches concatène une commande `M` par barre visible :
    // les compter mesure directement l'étendue de la fenêtre.
    const { container } = render(<ProChart data={serie(60)} style="candle" />);
    const meches = [...container.querySelectorAll("path")]
      .map((p) => (p.getAttribute("d") || "").match(/M /g)?.length || 0)
      .reduce((s, n) => s + n, 0);
    expect(meches).toBeGreaterThanOrEqual(60);
  });

  it("couvre la même étendue qu'après un changement de série", () => {
    // Garde-fou contre une régression asymétrique : le premier rendu et le
    // rechargement d'une nouvelle période doivent aboutir à la même fenêtre.
    const { container, rerender } = render(<ProChart data={serie(80)} />);
    const auMontage = graduations(container);
    rerender(<ProChart data={serie(80).map((b) => ({ ...b }))} />);
    expect(graduations(container)).toBe(auMontage);
  });

  it("ne tombe pas sur une série vide", () => {
    const { container } = render(<ProChart data={[]} />);
    expect(container).toBeTruthy();
  });
});
