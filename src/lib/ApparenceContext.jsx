import { createContext, useContext, useEffect, useMemo } from "react";
import { usePersistentState } from "./storage";
import { ACCENTS, ACCENT_DEFAUT, accent as trouverAccent } from "./themes";

/**
 * Préférences d'apparence : thème, accent, densité, mouvement, retour tactile.
 *
 * POURQUOI UN CONTEXTE À PART, et non une tranche de plus dans
 * PatrimoineContext : ce ne sont pas des données patrimoniales. Elles changent
 * pour d'autres raisons, à d'autres moments, et surtout elles sont lues par des
 * composants — la barre de navigation, l'en-tête — qui n'ont aucune raison de
 * se re-rendre quand une position bouge. Les mélanger reviendrait à aggraver
 * exactement le problème que la mémoïsation du contexte patrimonial cherche à
 * contenir.
 *
 * Elles passent en revanche par `usePersistentState`, donc par le cloud : un
 * réglage d'affichage suit d'un appareil à l'autre au même titre que la
 * composition des écrans.
 *
 * LE THÈME EST APPLIQUÉ SUR `<html>`, pas dans React. Les couleurs vivent dans
 * des variables CSS (voir index.css) ; poser un attribut suffit à basculer
 * toute l'application, sans qu'aucun composant n'ait à connaître le thème
 * courant. C'est aussi ce qui permet au thème « auto » d'exister sans
 * JavaScript : en l'absence d'attribut, c'est `prefers-color-scheme` qui
 * décide.
 */

/** Valeurs acceptées pour le thème. `auto` = on suit le système. */
export const THEMES_AFFICHAGE = [
  { id: "auto", libelle: "Automatique", detail: "Suit le réglage du système" },
  { id: "sombre", libelle: "Sombre", detail: "Le thème historique de Patrium" },
  { id: "clair", libelle: "Clair", detail: "Pour la lecture en plein jour" },
];

/** Densité des tableaux et des listes. */
export const DENSITES = [
  { id: "confortable", libelle: "Confortable", detail: "Lignes aérées" },
  { id: "compacte", libelle: "Compacte", detail: "Plus de lignes à l'écran" },
];

const DEFAUTS = {
  theme: "auto",
  accent: ACCENT_DEFAUT,
  densite: "confortable",
  /** Retour tactile sur mobile (navigation, validation, suppression). */
  haptique: true,
  /**
   * `null` = on s'en remet à `prefers-reduced-motion`. C'est le réglage par
   * défaut, et il faut qu'il le reste : un utilisateur qui a désactivé les
   * animations au niveau du système ne devrait pas avoir à le redire ici.
   */
  animations: null,
};

const ApparenceContext = createContext(null);

/** Le système demande-t-il la suppression des animations ? */
function systemeSansMouvement() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ApparenceProvider({ children }) {
  const [apparence, setApparence] = usePersistentState("apparence", DEFAUTS);

  // Les valeurs manquantes sont comblées par les défauts : une préférence
  // ajoutée après coup ne doit pas rendre l'objet persisté invalide.
  const reglages = useMemo(() => ({ ...DEFAUTS, ...(apparence || {}) }), [apparence]);

  // ── Thème ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const racine = document.documentElement;
    if (reglages.theme === "auto") racine.removeAttribute("data-theme");
    else racine.setAttribute("data-theme", reglages.theme);
  }, [reglages.theme]);

  // ── Accent ───────────────────────────────────────────────────────────────
  // Les variables sont posées sur <html> plutôt que dans une feuille : elles
  // dépendent d'un choix fait à l'exécution, ce qu'aucune classe Tailwind ne
  // peut exprimer (l'outil analyse le source en texte brut).
  useEffect(() => {
    const a = trouverAccent(reglages.accent);
    const racine = document.documentElement;
    const [h, s] = a.teinte.split(" ");
    racine.style.setProperty("--accent-h", h);
    racine.style.setProperty("--accent-s", s);
    // La teinte d'appoint reprend la suivante du cercle chromatique : elle ne
    // sert qu'aux halos ambiants, une valeur approchée suffit.
    racine.style.setProperty("--accent-2-h", String((Number(h) + 25) % 360));
    racine.style.setProperty("--accent-2-s", s);
  }, [reglages.accent]);

  // ── Densité ──────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute("data-densite", reglages.densite);
  }, [reglages.densite]);

  // ── Animations ───────────────────────────────────────────────────────────
  // `data-mouvement="reduit"` double la media query CSS : il permet à
  // l'utilisateur de couper les animations DANS l'application sans toucher aux
  // réglages de son système, et inversement de les rallumer.
  useEffect(() => {
    const racine = document.documentElement;
    const reduit = reglages.animations === null ? systemeSansMouvement() : !reglages.animations;
    racine.setAttribute("data-mouvement", reduit ? "reduit" : "complet");
  }, [reglages.animations]);

  const valeur = useMemo(() => {
    const definir = (cle) => (v) => setApparence((prec) => ({ ...DEFAUTS, ...(prec || {}), [cle]: v }));
    return {
      ...reglages,
      accentActif: trouverAccent(reglages.accent),
      accentsDisponibles: ACCENTS,
      /** Le mouvement est-il réduit, tous réglages confondus ? */
      mouvementReduit:
        reglages.animations === null ? systemeSansMouvement() : !reglages.animations,
      setTheme: definir("theme"),
      setAccent: definir("accent"),
      setDensite: definir("densite"),
      setHaptique: definir("haptique"),
      setAnimations: definir("animations"),
    };
  }, [reglages, setApparence]);

  return <ApparenceContext.Provider value={valeur}>{children}</ApparenceContext.Provider>;
}

/**
 * Accès aux préférences. Tolérant à l'absence de provider : plusieurs
 * composants d'interface sont montés isolément dans les tests, et une
 * préférence d'affichage manquante doit dégrader vers les valeurs par défaut
 * plutôt que faire tomber le rendu.
 */
export function useApparence() {
  const ctx = useContext(ApparenceContext);
  if (ctx) return ctx;
  return {
    ...DEFAUTS,
    accentActif: trouverAccent(ACCENT_DEFAUT),
    accentsDisponibles: ACCENTS,
    mouvementReduit: systemeSansMouvement(),
    setTheme: () => {},
    setAccent: () => {},
    setDensite: () => {},
    setHaptique: () => {},
    setAnimations: () => {},
  };
}
