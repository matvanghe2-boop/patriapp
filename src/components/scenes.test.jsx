import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PilesAllocation, { nombreDePieces } from "./PilesAllocation";
import JaugeMatelas, { remplissage, MOIS_PLEIN } from "./JaugeMatelas";
import RubansFlux, { disposerRubans, repartirParticules } from "./RubansFlux";
import BouleDeNeige, { etatBoule, rayonBoule, pasReperes } from "./BouleDeNeige";
import CartesPositions, { meilleureLigne } from "./CartesPositions";
import FondVivant from "./FondVivant";
import ArgentQuiVoyage from "./ArgentQuiVoyage";
import { PastilleCategorie } from "./OperationsCompte";

/**
 * Les effets illustrés (scenes.css). jsdom ne dessine ni n'anime rien : ces
 * tests vérifient ce que chaque scène DIT — les chiffres écrits, les libellés
 * accessibles, la géométrie calculée — et que rien n'y dépend du mouvement.
 */

beforeEach(() => {
  // Un poste de test à deux cœurs passerait pour un « appareil économe ».
  Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
});
afterEach(() => {
  for (const attribut of ["data-mouvement", "data-effets"]) document.documentElement.removeAttribute(attribut);
});

// ─── Piles de pièces ─────────────────────────────────────────────────────────

describe("PilesAllocation", () => {
  const POCHES = [
    { name: "Compte courant", value: 2_000, color: "#94a3b8" },
    { name: "Livrets réglementés", value: 10_000, color: "#2dd4bf" },
    { name: "PEA", value: 20_000, color: "#fbbf24" },
  ];

  it("donne à chaque poche un nombre de pièces proportionnel, et au moins une", () => {
    expect(nombreDePieces(20_000, 20_000)).toBe(18);
    expect(nombreDePieces(10_000, 20_000)).toBe(9);
    expect(nombreDePieces(50, 20_000)).toBe(1);
    expect(nombreDePieces(0, 20_000)).toBe(0);
    expect(nombreDePieces(100, 0)).toBe(0);
  });

  it("écrit le nom, le montant et la part sous chaque pile", () => {
    const { container } = render(<PilesAllocation poches={POCHES} total={32_000} />);
    const piles = screen.getAllByRole("listitem");
    expect(piles).toHaveLength(3);
    expect(within(piles[2]).getByText("PEA")).toBeInTheDocument();
    expect(piles[2]).toHaveTextContent(/20\s000/);
    expect(piles[2]).toHaveTextContent(/63\s%/);
    // La hauteur suit le montant : la pile du PEA est la plus haute.
    const pieces = [...container.querySelectorAll(".pile")].map((p) => p.querySelectorAll(".piece-pile").length);
    expect(pieces).toEqual([2, 9, 18]);
  });

  it("caviarde montants et parts en mode Ghost, comme partout ailleurs", () => {
    const { container } = render(<PilesAllocation poches={POCHES} total={32_000} />);
    expect(container.querySelectorAll(".pile .ghost-blur").length).toBeGreaterThanOrEqual(POCHES.length);
  });
});

// ─── Jauge d'eau du matelas ──────────────────────────────────────────────────

describe("JaugeMatelas", () => {
  it("remplit le verre jusqu'à six mois, pas au-delà", () => {
    expect(MOIS_PLEIN).toBe(6);
    expect(remplissage(0)).toBe(0);
    expect(remplissage(3)).toBe(0.5);
    expect(remplissage(6)).toBe(1);
    expect(remplissage(18)).toBe(1);
    expect(remplissage(null)).toBe(0);
  });

  it("dit le nombre de mois et le repère dans son libellé", () => {
    render(<JaugeMatelas mois={4.2} />);
    const jauge = screen.getByRole("img", { name: /4,2 mois de dépenses, sur un repère de 6 mois/ });
    expect(jauge).not.toHaveAttribute("data-deborde");
    expect(jauge.querySelector(".jauge-eau")).not.toBeNull();
  });

  it("déborde au-delà de six mois", () => {
    render(<JaugeMatelas mois={18.3} />);
    const jauge = screen.getByRole("img", { name: /le verre déborde/ });
    expect(jauge).toHaveAttribute("data-deborde");
    expect(jauge.querySelectorAll(".jauge-goutte")).toHaveLength(2);
  });

  it("reste un verre vide quand le matelas est inconnu", () => {
    render(<JaugeMatelas mois={null} />);
    const jauge = screen.getByRole("img", { name: /inconnu/ });
    expect(jauge.querySelector(".jauge-eau")).toBeNull();
  });
});

// ─── Flux du mois en rubans ──────────────────────────────────────────────────

describe("RubansFlux", () => {
  const SOURCES = [
    { id: "salaire", libelle: "Salaire", montant: 200_000 },
    { id: "aide-familiale", libelle: "Aide familiale", montant: 20_000 },
  ];
  const DESTINATIONS = [
    { id: "courses", libelle: "Courses", montant: 60_000 },
    { id: "interne", libelle: "Vers mes comptes", montant: 100_000 },
    { id: "reste", libelle: "Reste sur le compte", montant: 60_000 },
  ];

  it("donne la même épaisseur à un euro des deux côtés, et un centre sans interstice", () => {
    const plan = disposerRubans({ sources: SOURCES, destinations: DESTINATIONS, largeur: 640, hauteur: 220, marge: 138 });
    const gauche = plan.rubans.filter((r) => r.cote === "source");
    const droite = plan.rubans.filter((r) => r.cote === "destination");
    expect(gauche).toHaveLength(2);
    expect(droite).toHaveLength(3);
    // Salaire (2 000 €) est deux fois plus épais que « Vers mes comptes » (1 000 €).
    expect(gauche[0].h / droite[1].h).toBeCloseTo(2, 5);
    // Les rubans se rejoignent bord à bord sur le nœud central.
    expect(gauche[1].yc).toBeCloseTo(gauche[0].yc + gauche[0].hc, 5);
    const somme = gauche.reduce((s, r) => s + r.hc, 0);
    expect(somme).toBeCloseTo(plan.centre.h, 5);
    // Tout tient dans la hauteur demandée.
    for (const r of plan.rubans) {
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h).toBeLessThanOrEqual(220);
    }
  });

  it("ne dessine rien sans montant ni largeur", () => {
    expect(disposerRubans({ sources: [], destinations: [], largeur: 640, hauteur: 220, marge: 138 }).rubans).toEqual([]);
    expect(disposerRubans({ sources: SOURCES, destinations: DESTINATIONS, largeur: 0, hauteur: 220, marge: 138 }).rubans).toEqual([]);
  });

  it("répartit les particules au prorata, entre une et cinq par ruban", () => {
    const nombres = repartirParticules([{ part: 0.9 }, { part: 0.09 }, { part: 0.01 }], 18);
    expect(nombres).toEqual([5, 2, 1]);
  });

  it("affiche un ruban par ligne, et son montant quand on le touche", () => {
    const { container } = render(<RubansFlux sources={SOURCES} destinations={DESTINATIONS} libelle="Flux d'argent sur mai" />);
    expect(screen.getByRole("img", { name: "Flux d'argent sur mai" })).toBeInTheDocument();
    const rubans = container.querySelectorAll(".ruban");
    expect(rubans).toHaveLength(5);
    expect(screen.getByText("Salaire")).toBeInTheDocument();

    fireEvent.click(rubans[0]);
    const detail = container.querySelector(".rubans-detail");
    expect(detail).toHaveTextContent("Salaire → Compte courant");
    expect(detail).toHaveTextContent(/2\s000/);
  });

  it("fait couler des particules en effets vivants", () => {
    // Sans fournisseur d'apparence, les effets sont « vivants ».
    const { container } = render(<RubansFlux sources={SOURCES} destinations={DESTINATIONS} libelle="Flux" />);
    expect(container.querySelectorAll(".ruban-particule").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".ruban")).toHaveLength(5);
  });

  it("garde les rubans mais aucune particule quand le mouvement est réduit", () => {
    const matchMediaOrigine = window.matchMedia;
    window.matchMedia = (requete) => ({
      ...matchMediaOrigine(requete),
      matches: /prefers-reduced-motion/.test(requete),
    });
    try {
      const { container } = render(<RubansFlux sources={SOURCES} destinations={DESTINATIONS} libelle="Flux" />);
      expect(container.querySelectorAll(".ruban")).toHaveLength(5);
      expect(container.querySelectorAll(".ruban-particule")).toHaveLength(0);
    } finally {
      window.matchMedia = matchMediaOrigine;
    }
  });
});

// ─── Boule de neige ──────────────────────────────────────────────────────────

describe("BouleDeNeige", () => {
  const SERIE = [
    { year: 0, total: 10_000, versed: 10_000 },
    { year: 1, total: 11_600, versed: 11_200 },
    { year: 2, total: 13_300, versed: 12_400 },
    { year: 3, total: 15_100, versed: 13_600 },
    { year: 4, total: 17_000, versed: 14_800 },
  ];

  it("interpole le capital entre deux années", () => {
    expect(etatBoule(SERIE, 0)).toEqual({ total: 10_000, versed: 10_000, interets: 0 });
    const mi = etatBoule(SERIE, 0.5);
    expect(mi.total).toBeCloseTo(10_800, 5);
    expect(mi.interets).toBeCloseTo(200, 5);
    expect(etatBoule(SERIE, 99).total).toBe(17_000);
    expect(etatBoule([], 3)).toEqual({ total: 0, versed: 0, interets: 0 });
  });

  it("fait suivre le capital par la SURFACE de la boule, pas par son diamètre", () => {
    expect(rayonBoule(100, 100, 5, 45)).toBe(45);
    // Quatre fois moins de capital : un rayon deux fois plus petit (hors rayon minimal).
    expect(rayonBoule(25, 100, 0, 40)).toBeCloseTo(20, 5);
    expect(rayonBoule(0, 100, 5, 45)).toBe(5);
  });

  it("espace les repères d'année pour qu'ils restent lisibles", () => {
    expect(pasReperes(7)).toBe(1);
    expect(pasReperes(12)).toBe(2);
    expect(pasReperes(25)).toBe(5);
    expect(pasReperes(40)).toBe(5);
  });

  it("montre la dernière année au repos, et suit le curseur", () => {
    render(<BouleDeNeige serie={SERIE} />);
    expect(screen.getByText("An 4")).toBeInTheDocument();
    expect(screen.getByText(/17\s000/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(screen.getByText("An 2")).toBeInTheDocument();
    expect(screen.getByText(/13\s300/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    expect(screen.getByText("Départ")).toBeInTheDocument();
  });

  it("reste en bas de la pente quand la projection s'allonge", () => {
    const { rerender } = render(<BouleDeNeige serie={SERIE} />);
    rerender(<BouleDeNeige serie={[...SERIE, { year: 5, total: 19_000, versed: 16_000 }]} />);
    expect(screen.getByText("An 5")).toBeInTheDocument();
  });
});

// ─── Carte holographique ─────────────────────────────────────────────────────

describe("carte holographique", () => {
  const POSITIONS = [
    { id: "a", ticker: "AI.PA", name: "Air Liquide", quantity: 10, pru: 100, current_price: 120 },
    { id: "b", ticker: "MC.PA", name: "LVMH", quantity: 1, pru: 500, current_price: 700 },
    { id: "c", ticker: "OR.PA", name: "L'Oréal", quantity: 5, pru: 400, current_price: 380 },
  ];

  it("désigne la meilleure plus-value en pourcentage, pas la plus grosse en euros", () => {
    // Air Liquide : +200 € (+20 %) ; LVMH : +200 € (+40 %).
    expect(meilleureLigne(POSITIONS)).toBe("b");
  });

  it("ne désigne personne si aucune ligne n'est en gain", () => {
    expect(meilleureLigne([POSITIONS[2]])).toBeNull();
    expect(meilleureLigne([])).toBeNull();
    expect(meilleureLigne([{ id: "x", ticker: "X", quantity: 3, pru: 0, current_price: 10 }])).toBeNull();
  });

  it("marque une seule carte, étiquetée « Meilleure ligne »", () => {
    const { container } = render(<CartesPositions positions={POSITIONS} total={2_900} />);
    const holo = container.querySelectorAll(".carte-position[data-holo]");
    expect(holo).toHaveLength(1);
    expect(within(holo[0]).getByText("Meilleure ligne")).toBeInTheDocument();
    expect(holo[0]).toHaveTextContent("MC.PA");
    expect(screen.getAllByText("Meilleure ligne")).toHaveLength(1);
  });
});

// ─── Fonds par onglet ────────────────────────────────────────────────────────

describe("FondVivant", () => {
  it("n'ajoute aucun décor par défaut", () => {
    const { container } = render(<FondVivant />);
    expect(container.querySelector(".fond-decor")).toBeNull();
    expect(container.querySelectorAll(".fond-vivant-nappe")).toHaveLength(3);
  });

  it.each([
    ["bourse", ".fond-chandeliers"],
    ["livrets", ".fond-bulles"],
    ["immobilier", ".fond-plan"],
    ["coffre", ".fond-metal"],
  ])("pose le décor de l'écran « %s »", (scene, selecteur) => {
    const { container } = render(<FondVivant scene={scene} />);
    expect(container.querySelectorAll(".fond-decor")).toHaveLength(1);
    expect(container.querySelector(selecteur)).not.toBeNull();
    // Purement décoratif : rien n'en est annoncé aux lecteurs d'écran.
    expect(container.querySelector(".fond-vivant")).toHaveAttribute("aria-hidden", "true");
  });

  it("double la série de chandeliers, pour une boucle sans couture", () => {
    const { container } = render(<FondVivant scene="bourse" />);
    const chandeliers = container.querySelectorAll(".fond-chandeliers-piste g");
    expect(chandeliers.length % 2).toBe(0);
    expect(chandeliers.length).toBeGreaterThan(40);
  });
});

// ─── Argent qui voyage ───────────────────────────────────────────────────────

describe("ArgentQuiVoyage", () => {
  it("montre le départ, l'arrivée, le montant et les pièces en vol", () => {
    const { container } = render(
      <ArgentQuiVoyage voyage={{ de: "Compte courant", vers: "PEA", montant: 2_000, genre: "bourse" }} onFin={() => {}} />
    );
    const scene = container.querySelector(".voyage");
    expect(scene).toHaveAttribute("aria-hidden", "true");
    expect(scene).toHaveTextContent("Compte courant");
    expect(scene).toHaveTextContent("PEA");
    expect(scene).toHaveTextContent(/\+\s?2\s000/);
    expect(container.querySelectorAll(".voyage-piece")).toHaveLength(10);
    // Le montant passe par <Montant> : il est caviardé en mode Ghost.
    expect(scene.querySelector(".voyage-montant .ghost-blur")).not.toBeNull();
  });
});

// ─── Emojis 3D des catégories ────────────────────────────────────────────────

describe("PastilleCategorie", () => {
  it("affiche l'emoji 3D de la catégorie, servi depuis l'application", () => {
    const { container } = render(<PastilleCategorie id="restauration" />);
    const image = container.querySelector("img.emoji-3d");
    expect(image).toHaveAttribute("src", "/emoji/restauration.png");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it("revient à l'icône au trait si l'image manque", () => {
    const { container } = render(<PastilleCategorie id="sport" />);
    fireEvent.error(container.querySelector("img.emoji-3d"));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("garde l'icône au trait pour une catégorie inconnue", () => {
    const { container } = render(<PastilleCategorie id="categorie-inconnue" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
