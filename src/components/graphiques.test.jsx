import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  Sparkline, CourbeEvolution, AnneauProgression, AnneauRepartition, CalendrierAnnuel,
  decouperEnSemaines, indexJourSemaine, libelleDate, decrireJour, totauxParMois,
} from "./graphiques";
import Montant, { decouperMontant } from "./Montant";

describe("Sparkline", () => {
  it("ne dessine rien sous deux points", () => {
    // Une « tendance » sur un seul point n'existe pas : mieux vaut ne rien
    // afficher qu'un trait plat qui suggérerait une stabilité observée.
    const { container } = render(<Sparkline valeurs={[42]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("trace autant de sommets que de valeurs", () => {
    const { container } = render(<Sparkline valeurs={[1, 5, 3, 8]} />);
    const points = container.querySelector("polyline").getAttribute("points").trim().split(/\s+/);
    expect(points).toHaveLength(4);
  });

  it("place le point final sur la dernière valeur", () => {
    const { container } = render(<Sparkline valeurs={[0, 10]} hauteur={20} largeur={100} />);
    const cercle = container.querySelector("circle");
    expect(Number(cercle.getAttribute("cx"))).toBe(100);
  });

  it("survit à une série plate sans diviser par zéro", () => {
    const { container } = render(<Sparkline valeurs={[7, 7, 7]} />);
    const points = container.querySelector("polyline").getAttribute("points");
    expect(points).not.toContain("NaN");
  });

  it("garde un trait d'épaisseur constante quand le viewBox est étiré", () => {
    // Sans `non-scaling-stroke`, une courbe large et basse produit un trait
    // épais à l'horizontale et fin à la verticale.
    const { container } = render(<Sparkline valeurs={[1, 2]} />);
    expect(container.querySelector("polyline")).toHaveAttribute("vector-effect", "non-scaling-stroke");
  });
});

describe("CourbeEvolution", () => {
  it("donne à chaque instance son propre dégradé", () => {
    // Deux courbes partageant un identifiant : la seconde écraserait la
    // première. Bug invisible à la relecture, évident à l'écran.
    const { container } = render(
      <>
        <CourbeEvolution valeurs={[1, 2, 3]} />
        <CourbeEvolution valeurs={[3, 2, 1]} />
      </>
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("place un jalon aux coordonnées demandées", () => {
    const { container } = render(
      <CourbeEvolution valeurs={[0, 5, 10, 15]} jalons={[{ id: "a", index: 2 }]} />
    );
    expect(container.querySelectorAll("line")).toHaveLength(1);
  });

  it("borne un index de jalon hors série au lieu de planter", () => {
    const { container } = render(
      <CourbeEvolution valeurs={[0, 5]} jalons={[{ id: "a", index: 99 }]} />
    );
    expect(container.querySelector("line")).not.toBeNull();
  });
});

describe("AnneauProgression", () => {
  it("borne la valeur entre 0 et 100", () => {
    const { getByRole } = render(<AnneauProgression valeur={250} libelle="Objectif" />);
    expect(getByRole("img")).toHaveAttribute("aria-label", "Objectif : 100 %");
  });

  it("annonce sa valeur aux lecteurs d'écran", () => {
    const { getByRole } = render(<AnneauProgression valeur={42} libelle="Matelas" />);
    expect(getByRole("img")).toHaveAttribute("aria-label", "Matelas : 42 %");
  });

  it("marque l'objectif atteint autrement que par la couleur", () => {
    const { container } = render(<AnneauProgression valeur={100} atteint />);
    expect(container.querySelector("svg").getAttribute("class")).toContain("anneau-atteint");
  });
});

describe("AnneauRepartition", () => {
  it("répartit les arcs proportionnellement", () => {
    const { container } = render(
      <AnneauRepartition
        parts={[
          { id: "a", valeur: 75, couleur: "#fff" },
          { id: "b", valeur: 25, couleur: "#000" },
        ]}
        libelle="Répartition"
      />
    );
    // Le premier cercle est la piste de fond ; les deux suivants sont les arcs.
    const arcs = [...container.querySelectorAll("circle")].slice(1);
    const [a, b] = arcs.map((c) => Number(c.getAttribute("stroke-dasharray").split(" ")[0]));
    expect(a / (a + b)).toBeCloseTo(0.75, 2);
  });

  it("ne divise pas par zéro sur un total nul", () => {
    const { container } = render(
      <AnneauRepartition parts={[{ id: "a", valeur: 0, couleur: "#fff" }]} libelle="Vide" />
    );
    expect(container.innerHTML).not.toContain("NaN");
  });
});

describe("CalendrierAnnuel", () => {
  it("laisse sans niveau les jours non relevés", () => {
    // La distinction « pas de relevé » / « variation nulle » est la raison
    // d'être de cette vue.
    const { container } = render(
      <CalendrierAnnuel
        jours={[
          { date: "2026-01-01", variation: 100 },
          { date: "2026-01-02", variation: null },
          { date: "2026-01-03", variation: 0 },
        ]}
      />
    );
    // `[title]` écarte les cases de remplissage qui alignent la première
    // semaine sur le bon jour : elles n'ont pas de date et ne représentent
    // aucun jour.
    const cases = container.querySelectorAll(".calendrier-semaine button");
    expect(cases[0].dataset.n).toBeTruthy();
    expect(cases[1].dataset.n).toBeUndefined();
    expect(cases[2].dataset.n).toBe("0");
  });

  it("gradue par rapport à la distribution, pas par seuils absolus", () => {
    // Un patrimoine de 5 000 € et un de 500 000 € ne bougent pas des mêmes
    // montants, mais la FORME de leur année est la même.
    const petits = render(
      <CalendrierAnnuel jours={[1, 2, 3, 40].map((v, i) => ({ date: `2026-01-0${i + 1}`, variation: v }))} />
    );
    const gros = render(
      <CalendrierAnnuel jours={[100, 200, 300, 4000].map((v, i) => ({ date: `2026-02-0${i + 1}`, variation: v }))} />
    );
    const niveaux = (r) =>
      [...r.container.querySelectorAll(".calendrier-semaine button")].map((e) => e.dataset.n);
    expect(niveaux(petits)).toEqual(niveaux(gros));
  });
});

describe("Montant", () => {
  it("sépare entier, centimes et devise", () => {
    const { entier, fraction, devise } = decouperMontant(48312.4, 2);
    expect(entier.replace(/\s/g, " ")).toContain("48");
    expect(fraction).toBe("40");
    expect(devise).toBe("€");
  });

  it("conserve le signe négatif dans la partie entière", () => {
    expect(decouperMontant(-125, 0).entier).toContain("-");
  });

  it("n'affiche les centimes que si on les demande", () => {
    const { container } = render(<Montant valeur={1234.56} decimales={0} />);
    expect(container.querySelector(".montant-centimes")).toBeNull();
    const avec = render(<Montant valeur={1234.56} decimales={2} />);
    expect(avec.container.querySelector(".montant-centimes").textContent).toBe(",56");
  });

  it("est masquable par le mode Ghost, sauf mention contraire", () => {
    const { container } = render(<Montant valeur={100} />);
    expect(container.firstChild.className).toContain("ghost-blur");
    const public_ = render(<Montant valeur={100} sensible={false} />);
    expect(public_.container.firstChild.className).not.toContain("ghost-blur");
  });

  it("ne pulse pas au premier rendu", () => {
    // Une valeur qui APPARAÎT n'a pas varié : la colorer induirait en erreur.
    const { container } = render(<Montant valeur={100} pulse />);
    expect(container.firstChild.dataset.sens).toBeUndefined();
  });
});

describe("CalendrierAnnuel — lisibilité des périodes", () => {
  const jours = (debut, n) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(`${debut}T00:00:00`);
      d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return { date: iso, variation: i % 3 === 0 ? null : (i % 7) - 3 };
    });

  it("aligne la première case sur son vrai jour de la semaine", () => {
    // Le 1er janvier 2026 est un JEUDI : trois cases vides doivent le précéder
    // pour que la ligne « jeudi » reste la ligne « jeudi ». Sans ce décalage,
    // une colonne ne représentait pas une semaine et toute lecture par période
    // était impossible.
    expect(indexJourSemaine("2026-01-01")).toBe(3);
    const semaines = decouperEnSemaines(jours("2026-01-01", 10));
    expect(semaines[0].jours.slice(0, 3)).toEqual([null, null, null]);
    expect(semaines[0].jours[3].date).toBe("2026-01-01");
  });

  it("découpe en colonnes de sept jours pleines", () => {
    const semaines = decouperEnSemaines(jours("2026-01-01", 30));
    for (const s of semaines) expect(s.jours).toHaveLength(7);
  });

  it("repère la colonne qui ouvre chaque mois", () => {
    const semaines = decouperEnSemaines(jours("2026-01-01", 70));
    const ouvertures = semaines.filter((s) => s.ouvreMois);
    // Janvier, février et mars sont couverts par 70 jours.
    expect(ouvertures.length).toBeGreaterThanOrEqual(3);
    expect(ouvertures[0].mois).toBe(1);
    expect(ouvertures[1].mois).toBe(2);
  });

  it("commence la semaine le lundi, pas le dimanche", () => {
    // Convention française. `getDay()` compte à partir du dimanche.
    expect(indexJourSemaine("2026-01-05")).toBe(0); // un lundi
    expect(indexJourSemaine("2026-01-11")).toBe(6); // un dimanche
  });

  it("nomme la date en toutes lettres", () => {
    expect(libelleDate("2026-03-12")).toBe("jeudi 12 mars 2026");
  });

  it("porte la date et la variation sur chaque case", () => {
    // Une couleur seule dit « ça a monté » ; elle ne dira jamais « le 2 janvier,
    // de 240 € ».
    const { container } = render(
      <CalendrierAnnuel
        jours={[
          { date: "2026-01-01", variation: 240 },
          { date: "2026-01-02", variation: null },
        ]}
      />
    );
    const cases = [...container.querySelectorAll(".calendrier-semaine button")];
    expect(cases[0].title).toContain("jeudi 1 janvier 2026");
    expect(cases[0].title).toContain("+240");
    expect(cases[1].title).toContain("pas de relevé");
  });

  it("affiche les repères de jours et de mois", () => {
    const { container } = render(<CalendrierAnnuel jours={jours("2026-01-01", 60)} />);
    expect(container.querySelector(".calendrier-jours").textContent).toContain("lun.");
    expect(container.querySelector(".calendrier-mois").textContent).toContain("janv.");
  });

  it("réserve la place du détail avant tout survol", () => {
    // Sans hauteur réservée, le calendrier sauterait au premier survol et
    // déplacerait la case visée juste sous le curseur.
    const { container } = render(<CalendrierAnnuel jours={jours("2026-01-01", 20)} />);
    expect(container.querySelector(".calendrier-detail")).not.toBeNull();
  });

  it("ne rend rien sans aucun jour", () => {
    const { container } = render(<CalendrierAnnuel jours={[]} />);
    expect(container.querySelector(".calendrier")).toBeNull();
  });
});

describe("CalendrierAnnuel — contexte des variations", () => {
  const j = (date, o = {}) => ({ date, releve: true, variation: 0, variationParJour: 0, depuis: null, joursCouverts: 1, weekend: false, marcheFerme: false, ...o });

  it("dit « marché fermé » et rien d'autre un jour de fermeture", () => {
    // Le bug rapporté, dans sa forme définitive : plus aucune variation n'est
    // portée par un samedi ou un dimanche.
    const texte = decrireJour(j("2026-03-08", { variation: null, marcheFerme: true, weekend: true }));
    expect(texte).toContain("dimanche 8 mars 2026");
    expect(texte).toContain("marché fermé");
    expect(texte).not.toContain("€");
  });

  it("dit la période couverte quand un jour ouvré absorbe le week-end", () => {
    const texte = decrireJour(
      j("2026-03-09", { variation: 420, variationParJour: 105, depuis: "2026-03-05", joursCouverts: 4 })
    );
    expect(texte).toContain("lundi 9 mars 2026");
    expect(texte).toContain("+420");
    expect(texte).toContain("4 jours");
  });

  it("reste sobre sur un relevé quotidien ordinaire", () => {
    const texte = decrireJour(j("2026-03-05", { variation: 42, variationParJour: 42 }));
    expect(texte).not.toContain("jours");
    expect(texte).not.toContain("marché fermé");
  });

  it("colore selon la variation PAR JOUR, pas selon le total", () => {
    // Deux relevés de même total, l'un couvrant un jour, l'autre trois : la
    // case du second ne doit pas être trois fois plus vive pour un rythme
    // identique.
    const { container } = render(
      <CalendrierAnnuel
        jours={[
          j("2026-01-01", { variation: 300, variationParJour: 100, joursCouverts: 3 }),
          j("2026-01-02", { variation: 100, variationParJour: 100 }),
        ]}
      />
    );
    const cases = [...container.querySelectorAll(".calendrier-semaine button")];
    expect(cases[0].dataset.n).toBe(cases[1].dataset.n);
  });

  it("totalise les variations par mois", () => {
    const totaux = totauxParMois([
      j("2026-01-05", { variation: 100 }),
      j("2026-01-20", { variation: 50 }),
      j("2026-02-03", { variation: -30 }),
    ]);
    expect(totaux.get(1)).toBe(150);
    expect(totaux.get(2)).toBe(-30);
  });

  it("marque les cases de week-end", () => {
    const { container } = render(
      <CalendrierAnnuel jours={[j("2026-03-07", { weekend: true }), j("2026-03-09")]} />
    );
    const cases = [...container.querySelectorAll(".calendrier-semaine button")];
    expect(cases[0].dataset.weekend).toBe("true");
    expect(cases[1].dataset.weekend).toBeUndefined();
  });

  it("n'expose qu'une seule case dans l'ordre de tabulation", () => {
    // Sans quoi traverser le calendrier au clavier demanderait 365 tabulations.
    const { container } = render(
      <CalendrierAnnuel jours={["2026-01-01", "2026-01-02", "2026-01-03"].map((d) => j(d))} />
    );
    const focusables = [...container.querySelectorAll('.calendrier-semaine button[tabindex="0"]')];
    expect(focusables).toHaveLength(1);
  });

  it("affiche une légende et les sous-totaux mensuels", () => {
    const { container } = render(
      <CalendrierAnnuel jours={[j("2026-01-05", { variation: 120 })]} />
    );
    expect(container.querySelector(".calendrier-legende")).not.toBeNull();
    expect(container.querySelector(".calendrier-totaux").textContent).toContain("120");
  });

  it("teinte le fond des semaines agitées", () => {
    const { container } = render(
      <CalendrierAnnuel jours={[j("2026-01-05")]} semainesAgitees={new Set(["2026-01-05"])} />
    );
    expect(container.querySelector(".calendrier-semaine").dataset.agitee).toBe("true");
  });
});
