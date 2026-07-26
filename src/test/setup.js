import "@testing-library/jest-dom/vitest";

// jsdom n'implémente pas matchMedia, utilisé par certains composants
// (recharts, media queries Tailwind interrogées en JS).
// recharts mesure ses conteneurs via ResizeObserver, que jsdom n'implémente
// pas. Un bouchon inerte suffit : les tests vérifient la logique et la
// structure accessible, pas les dimensions rendues.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
