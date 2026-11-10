import { mouvementReduit } from "./mouvement";

/**
 * Révélation au défilement, et tracé des graphiques au même moment.
 *
 * L'écran arrivait d'un bloc : sur le Dashboard ou dans Bourse, une dizaine de
 * cartes et autant de courbes étaient déjà là, figées, avant même qu'on les
 * regarde. Ici, chaque carte entre quand on l'atteint, en cascade avec ses
 * voisines, et ses graphiques se tracent à ce moment-là : la courbe se dessine
 * de gauche à droite, les barres montent, les anneaux se remplissent.
 *
 * TOUT VIT HORS DE REACT. Une seule installation pour toute la visite
 * (`surveillerRevelations`, appelée par App) : un MutationObserver voit
 * arriver les nouveaux blocs — changement d'onglet, carte dépliée, graphique
 * qui finit de charger — et un IntersectionObserver décide du moment. Aucun
 * composant n'a donc à s'en soucier : une carte devient révélable par sa seule
 * classe `.revelable` (posée par Card, CarteRepliable et SectionRepliable), et
 * un graphique est reconnu tout seul (`svg.recharts-surface`) ou par
 * `data-trace` pour les graphiques dessinés à la main.
 *
 * QUATRE GARDE-FOUS
 *
 *  · Rien n'est caché si ce script ne tourne pas : l'état d'attente n'est
 *    masqué par la feuille de style qu'une fois `data-revele-pret` posé sur
 *    `<html>`, et ce script est le seul à le poser.
 *  · Le mouvement réduit montre tout, tout de suite — y compris s'il est
 *    activé pendant qu'une carte attend son tour.
 *  · Un graphique ne se trace qu'UNE fois par apparition. Un rafraîchissement
 *    de cours modifie la courbe en place : il ne la redessine pas.
 *  · L'impression (export PDF) révèle tout ce qui attendait encore.
 */

const SELECTEUR_BLOC = ".revelable";
const SELECTEUR_GRAPHIQUE = "svg.recharts-surface, svg[data-trace]";
/** Exclus : une modale a sa propre entrée, la doubler la ferait trembler. */
const SELECTEUR_EXCLU = '[role="dialog"], [aria-modal="true"], .sans-revelation';

const PAS_CASCADE_MS = 70;
const CASCADE_MAX = 7;
const DUREE_TRACE_MS = 950;
const COURBE = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Graphiques déjà tracés (ou dont le tracé est en cours). */
const traces = new WeakSet();

function estElement(n) {
  return n && n.nodeType === 1;
}

/** Délai de cascade du bloc qui contient `el`, pour accorder le tracé à son entrée. */
function delaiParent(el) {
  const bloc = el.closest?.('[data-revele="entre"]');
  if (!bloc) return 0;
  return parseFloat(bloc.style.getPropertyValue("--revele-delai")) || 0;
}

/* ─────────────────────────── Préparation des tracés ─────────────────────────
 * Chaque graphique est « préparé » dès qu'il apparaît dans le DOM : ses tracés
 * sont ramenés à zéro AVANT la première peinture (le MutationObserver passe en
 * microtâche, avant le rendu), pour qu'aucune courbe ne s'affiche entière puis
 * disparaisse. Le tracé lui-même attend qu'il soit visible.
 */

function longueur(el) {
  try {
    return el.getTotalLength();
  } catch {
    return 0;
  }
}

function courbesRecharts(svg) {
  return [...svg.querySelectorAll("path.recharts-line-curve, path.recharts-area-curve")].filter((p) => {
    // Une courbe déjà pointillée (projection, référence) a son propre motif :
    // le remplacer le temps du tracé l'effacerait.
    const motif = p.getAttribute("stroke-dasharray");
    return !motif || motif === "none";
  });
}

function preparer(svg) {
  const genre = svg.getAttribute("data-trace") || "recharts";

  if (genre === "recharts") {
    for (const p of courbesRecharts(svg)) {
      const l = longueur(p);
      if (!l) continue;
      p.style.strokeDasharray = `${l}`;
      p.style.strokeDashoffset = `${l}`;
    }
    for (const a of svg.querySelectorAll("path.recharts-area-area, .recharts-line-dots, .recharts-area-dots")) {
      a.style.opacity = "0";
    }
    for (const b of svg.querySelectorAll(".recharts-bar-rectangle")) {
      b.style.transformBox = "fill-box";
      b.style.transformOrigin = "50% 100%";
      b.style.transform = "scaleY(0)";
    }
    for (const s of svg.querySelectorAll(".recharts-pie-sector")) {
      s.style.transformBox = "view-box";
      s.style.transformOrigin = "50% 50%";
      s.style.transform = "scale(0.9)";
      s.style.opacity = "0";
    }
    return;
  }

  if (genre === "anneau") {
    // L'arc se remplit par la transition déjà déclarée sur `.anneau-arc` :
    // il suffit de le partir de zéro, puis de rendre la main à l'attribut.
    const arc = svg.querySelector(".anneau-arc");
    if (arc) arc.style.strokeDasharray = `0 ${2 * Math.PI * Number(arc.getAttribute("r") || 0)}`;
    return;
  }

  if (genre === "repartition") {
    svg.style.opacity = "0";
    svg.style.transform = "rotate(-40deg) scale(0.88)";
    return;
  }

  // « courbe » : courbe dessinée à la main, révélée de gauche à droite d'un
  // seul balayage — trait, aire, jalons et point final ensemble.
  svg.style.clipPath = "inset(0 100% 0 0)";
}

function nettoyer(el, proprietes) {
  for (const p of proprietes) el.style.removeProperty(p);
}

function tracer(svg) {
  const genre = svg.getAttribute("data-trace") || "recharts";
  const depart = delaiParent(svg) + 90;
  // Force le calcul du style de départ : sans lui, la transition partirait de
  // l'état final et il ne se passerait rien.
  void svg.getBoundingClientRect();
  const fin = [];

  if (genre === "recharts") {
    courbesRecharts(svg).forEach((p) => {
      // Longueur relue au dernier moment : la courbe a pu changer depuis sa
      // préparation (largeur enfin connue, cours arrivé entre-temps).
      const l = longueur(p);
      if (!l) return nettoyer(p, ["stroke-dasharray", "stroke-dashoffset"]);
      p.style.transition = "none";
      p.style.strokeDasharray = `${l}`;
      p.style.strokeDashoffset = `${l}`;
      void p.getBoundingClientRect();
      p.style.transition = `stroke-dashoffset ${DUREE_TRACE_MS}ms ${COURBE} ${depart}ms`;
      p.style.strokeDashoffset = "0";
      fin.push(() => nettoyer(p, ["stroke-dasharray", "stroke-dashoffset", "transition"]));
    });
    svg.querySelectorAll("path.recharts-area-area, .recharts-line-dots, .recharts-area-dots").forEach((a) => {
      a.style.transition = `opacity 600ms ease-out ${depart + DUREE_TRACE_MS * 0.45}ms`;
      a.style.opacity = "1";
      fin.push(() => nettoyer(a, ["opacity", "transition"]));
    });
    [...svg.querySelectorAll(".recharts-bar-rectangle")].forEach((b, i) => {
      b.style.transition = `transform 620ms cubic-bezier(0.22, 1, 0.36, 1) ${depart + Math.min(i, 24) * 22}ms`;
      b.style.transform = "scaleY(1)";
      fin.push(() => nettoyer(b, ["transform", "transform-box", "transform-origin", "transition"]));
    });
    [...svg.querySelectorAll(".recharts-pie-sector")].forEach((s, i) => {
      s.style.transition = `transform 620ms cubic-bezier(0.22, 1, 0.36, 1) ${depart + i * 60}ms, opacity 420ms ease-out ${depart + i * 60}ms`;
      s.style.transform = "scale(1)";
      s.style.opacity = "1";
      fin.push(() => nettoyer(s, ["transform", "transform-box", "transform-origin", "opacity", "transition"]));
    });
  } else if (genre === "anneau") {
    const arc = svg.querySelector(".anneau-arc");
    if (arc) {
      arc.style.transitionDelay = `${depart}ms`;
      arc.style.removeProperty("stroke-dasharray");
      fin.push(() => nettoyer(arc, ["transition-delay"]));
    }
  } else if (genre === "repartition") {
    svg.style.transition = `transform 900ms cubic-bezier(0.22, 1, 0.36, 1) ${depart}ms, opacity 500ms ease-out ${depart}ms`;
    svg.style.opacity = "1";
    svg.style.transform = "none";
    fin.push(() => nettoyer(svg, ["opacity", "transform", "transition"]));
  } else {
    svg.style.transition = `clip-path ${DUREE_TRACE_MS + 150}ms ${COURBE} ${depart}ms`;
    svg.style.clipPath = "inset(0 0 0 0)";
    fin.push(() => nettoyer(svg, ["clip-path", "transition"]));
  }

  // Les styles posés pour l'animation sont retirés ensuite : le graphique
  // redevient exactement ce que React a rendu, et un survol ou une mise à
  // jour ultérieure n'hérite d'aucun reste.
  setTimeout(() => fin.forEach((f) => f()), depart + DUREE_TRACE_MS + 1400);
}

/** Rend immédiatement un graphique préparé, sans animation. */
function libererGraphique(svg) {
  svg.querySelectorAll("path, g, circle, .recharts-line-dots, .recharts-area-dots").forEach((el) =>
    nettoyer(el, ["stroke-dasharray", "stroke-dashoffset", "opacity", "transform", "transform-box", "transform-origin", "transition"])
  );
  nettoyer(svg, ["clip-path", "opacity", "transform", "transition"]);
}

/* ───────────────────────────────── Installation ──────────────────────────── */

export function surveillerRevelations() {
  if (
    typeof window === "undefined" ||
    typeof IntersectionObserver === "undefined" ||
    typeof MutationObserver === "undefined"
  ) {
    return () => {};
  }
  const html = document.documentElement;
  html.setAttribute("data-revele-pret", "");

  const blocsEnAttente = new Set();
  const graphiquesEnAttente = new Set();

  const finirBloc = (el) => {
    el.setAttribute("data-revele", "fait");
    el.style.removeProperty("--revele-delai");
  };

  const entrer = (el, delai) => {
    blocsEnAttente.delete(el);
    el.style.setProperty("--revele-delai", `${delai}ms`);
    el.setAttribute("data-revele", "entre");
    const surFin = (e) => {
      if (e.target !== el) return;
      el.removeEventListener("animationend", surFin);
      finirBloc(el);
    };
    el.addEventListener("animationend", surFin);
    // Filet : une animation interrompue (onglet masqué) ne signale pas sa fin.
    setTimeout(() => {
      el.removeEventListener("animationend", surFin);
      if (el.getAttribute("data-revele") === "entre") finirBloc(el);
    }, delai + 1200);
  };

  const observateurBlocs = new IntersectionObserver(
    (entrees) => {
      const visibles = entrees
        .filter((e) => e.isIntersecting)
        // Ordre de lecture : de haut en bas, puis de gauche à droite.
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
      visibles.forEach((e, i) => {
        observateurBlocs.unobserve(e.target);
        entrer(e.target, Math.min(i, CASCADE_MAX) * PAS_CASCADE_MS);
      });
    },
    { rootMargin: "0px 0px -6% 0px", threshold: 0 }
  );

  // On observe le CONTENEUR du graphique, pas le graphique : un
  // IntersectionObserver tient compte du `clip-path` de sa cible, et une
  // courbe masquée par son propre balayage n'aurait jamais été « visible ».
  const parConteneur = new Map();
  const observateurGraphiques = new IntersectionObserver(
    (entrees) => {
      for (const e of entrees) {
        if (!e.isIntersecting) continue;
        observateurGraphiques.unobserve(e.target);
        const svgs = parConteneur.get(e.target) || [];
        parConteneur.delete(e.target);
        for (const svg of svgs) {
          graphiquesEnAttente.delete(svg);
          tracer(svg);
        }
      }
    },
    { rootMargin: "0px 0px -4% 0px", threshold: 0.2 }
  );

  const inscrireBloc = (el) => {
    if (el.hasAttribute("data-revele")) return;
    if (el.closest(SELECTEUR_EXCLU)) return;
    // Un seul niveau : une carte dans une carte entre avec sa parente.
    if (el.parentElement?.closest(SELECTEUR_BLOC)) return;
    el.setAttribute("data-revele", "attente");
    blocsEnAttente.add(el);
    observateurBlocs.observe(el);
  };

  const inscrireGraphique = (svg) => {
    if (traces.has(svg)) return;
    traces.add(svg);
    preparer(svg);
    graphiquesEnAttente.add(svg);
    const conteneur = svg.parentElement || svg;
    if (!parConteneur.has(conteneur)) {
      parConteneur.set(conteneur, []);
      observateurGraphiques.observe(conteneur);
    }
    parConteneur.get(conteneur).push(svg);
  };

  const parcourir = (racine) => {
    if (mouvementReduit()) return;
    if (racine.matches?.(SELECTEUR_BLOC)) inscrireBloc(racine);
    racine.querySelectorAll?.(SELECTEUR_BLOC).forEach(inscrireBloc);
    if (racine.matches?.(SELECTEUR_GRAPHIQUE)) inscrireGraphique(racine);
    racine.querySelectorAll?.(SELECTEUR_GRAPHIQUE).forEach(inscrireGraphique);
  };

  /** Tout montrer, tout de suite : mouvement coupé en route, impression. */
  const toutReveler = () => {
    blocsEnAttente.forEach((el) => {
      observateurBlocs.unobserve(el);
      finirBloc(el);
    });
    blocsEnAttente.clear();
    graphiquesEnAttente.forEach(libererGraphique);
    graphiquesEnAttente.clear();
    parConteneur.forEach((_, conteneur) => observateurGraphiques.unobserve(conteneur));
    parConteneur.clear();
  };

  const mutations = new MutationObserver((liste) => {
    for (const m of liste) {
      if (m.type === "attributes") {
        if (m.target === html && mouvementReduit()) toutReveler();
        continue;
      }
      m.addedNodes.forEach((n) => {
        if (estElement(n)) parcourir(n);
      });
    }
  });
  mutations.observe(document.body, { childList: true, subtree: true });
  mutations.observe(html, { attributes: true, attributeFilter: ["data-mouvement"] });

  window.addEventListener("beforeprint", toutReveler);
  parcourir(document.body);

  return () => {
    toutReveler();
    mutations.disconnect();
    observateurBlocs.disconnect();
    observateurGraphiques.disconnect();
    window.removeEventListener("beforeprint", toutReveler);
    html.removeAttribute("data-revele-pret");
  };
}
