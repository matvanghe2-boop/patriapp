import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, TrendingUp, TrendingDown } from "lucide-react";
import { eur, pct, pctPlain } from "../lib/finance";
import { useValeurAnimee } from "./ui";

const SCROLL_THRESHOLD = 48; // px de défilement avant de basculer en mode condensé

/**
 * En-tête collant qui se condense progressivement au défilement : au repos
 * (scroll = 0) c'est le bandeau complet habituel ; passé SCROLL_THRESHOLD px,
 * il se transforme en une fine barre sticky avec uniquement le total et la
 * performance globale, toujours visibles en haut de l'écran.
 *
 * `condensedContent` (ex: la barre de recherche + notifications existantes)
 * reste affiché en permanence à droite ; seule la partie "résumé chiffré"
 * change de taille/format.
 */
export default function StickySummaryHeader({ patrimoineNet, deltaPct, variationJour, ghostMode, onToggleGhost, children }) {
  const [scrolled, setScrolled] = useState(false);
  const tickingRef = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > SCROLL_THRESHOLD);
        tickingRef.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const perfPositive = (deltaPct ?? 0) >= 0;
  const netAnime = useValeurAnimee(patrimoineNet);

  return (
    <div
      className={`sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 transition-all duration-300 ease-out ${
        scrolled
          ? // Verre dépoli plutôt qu'un fond presque opaque : le contenu
            // continue de transparaître sous l'en-tête, ce qui garde le
            // sentiment d'une page qui défile sous une barre, et non d'un
            // bandeau posé par-dessus. `saturate` évite le gris terne que
            // produit un flou seul sur un fond sombre.
            "bg-slate-950/70 [backdrop-filter:blur(14px)_saturate(160%)] border-b border-slate-700/60 shadow-lg shadow-slate-950/40 py-2"
          : "bg-transparent py-0 mb-2"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Bloc résumé chiffré — se condense au scroll */}
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          {/* `aria-hidden` au repos : ce mot-clé fait doublon avec le titre de
              page affiché plus bas, et `opacity-0 h-0` ne le retire pas de
              l'arbre d'accessibilité — un lecteur d'écran annonçait donc
              « Patrium » deux fois. */}
          <span
            aria-hidden={!scrolled}
            className={`font-display text-slate-50 shrink-0 transition-all duration-300 ${
              scrolled ? "text-sm" : "text-lg opacity-0 h-0 -mt-6" // masqué/rétréci au repos, le vrai titre de page reste affiché plus bas
            }`}
          >
            Patrium
          </span>

          {/*
            `inert` plutôt que `pointer-events-none`.

            Ce bloc est masqué au repos par `opacity-0 h-0`, et
            `pointer-events-none` neutralisait la SOURIS — rien d'autre. Le
            bouton de mode Ghost qu'il contient restait donc atteignable au
            clavier et annoncé par les lecteurs d'écran : on tabulait sur une
            commande invisible, dans un en-tête qui en expose déjà une autre,
            identique, dans la barre latérale.

            `inert` retire l'ensemble du sous-arbre du focus ET de l'arbre
            d'accessibilité en une seule propriété. Il est ignoré par les
            navigateurs qui ne le connaissent pas, où `pointer-events-none`
            conservé ci-dessous garde l'ancien comportement.

            La valeur est un BOOLÉEN et non `""`. React 19 traite la chaîne
            vide d'un attribut booléen comme `false` — il émettait d'ailleurs
            un avertissement à chaque rendu — si bien que `inert` n'était
            jamais posé et que le bouton ci-dessous restait atteignable au
            clavier : exactement le défaut que ce bloc corrige.
          */}
          <div
            inert={!scrolled}
            className={`flex items-center gap-3 font-data tabular-nums transition-all duration-300 ${
              scrolled ? "opacity-100 text-sm" : "opacity-0 pointer-events-none h-0 text-xs"
            }`}
          >
            <span className="text-slate-500 hidden sm:inline">Total :</span>
            <span className={`font-semibold text-slate-100 ${ghostMode ? "ghost-blur" : ""}`}>{eur(netAnime)}</span>

            {/* Variation de la SÉANCE. C'est la première chose qu'on cherche
                en rouvrant l'application, et l'en-tête condensé est souvent
                tout ce qui reste à l'écran sur un téléphone après quelques
                centimètres de défilement.

                Elle passe avant le delta 30 jours, qui parle d'une autre
                échelle de temps : masqué sous 640 px pour que les deux ne se
                disputent pas la largeur. */}
            {variationJour?.exploitable && (
              <span
                className={`flex items-center gap-1 ${
                  variationJour.montant >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
                title="Variation depuis la clôture de la veille"
              >
                {variationJour.montant >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                <span className="font-semibold">
                  {variationJour.montant >= 0 ? "+" : "−"}
                  {pctPlain(Math.abs(variationJour.pourcentage))}
                </span>
                <span className={`hidden xs:inline ${ghostMode ? "ghost-blur" : ""}`}>
                  {variationJour.montant >= 0 ? "+" : "−"}
                  {eur(Math.abs(variationJour.montant))}
                </span>
              </span>
            )}

            {deltaPct != null && (
              <span
                className={`hidden sm:flex items-center gap-1 ${perfPositive ? "text-emerald-400" : "text-rose-400"}`}
                title="Variation sur 30 jours glissants"
              >
                {perfPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {pct(deltaPct)}
                <span className="text-slate-600">30 j</span>
              </span>
            )}

            <button
              onClick={onToggleGhost}
              className="btn-flash text-slate-500 hover:text-slate-200 p-0.5"
              title="Mode Ghost (flouter les montants)"
            >
              {ghostMode ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>

        {/* Zone droite existante (recherche globale, notifications, déconnexion...) */}
        <div className="flex items-center gap-3 shrink-0">{children}</div>
      </div>
    </div>
  );
}
