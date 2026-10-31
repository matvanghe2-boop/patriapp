import { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, ChevronLeft, ChevronRight } from "lucide-react";
import { todayIso } from "../lib/finance";
import { construireNotion } from "../lib/notionDuJour";
import { usePatrimoine } from "../lib/PatrimoineContext";

/**
 * Notion du jour, en petite icône dans l'en-tête, à côté des notifications.
 *
 * Un concept de finance, sa définition en deux ou trois phrases, et un
 * exemple : calculé sur le patrimoine quand les données le permettent
 * (« Chez toi »), générique sinon (« Exemple »). Rien ne s'affiche tant
 * qu'on ne clique pas : c'est une lecture à la demande, pas une alerte.
 * Les flèches feuillettent le catalogue sans rien enregistrer : le
 * lendemain, on repart de la notion du jour.
 */
export default function NotionDuJour() {
  const {
    bourse, livrets = [], bourseHistory = [], matelasMois = null, epargneMensuelle = 0, tauxEpargne = 0,
    livretsTotal = 0, bourseTotal = 0,
  } = usePatrimoine();
  const [ouvert, setOuvert] = useState(false);
  const [decalage, setDecalage] = useState(0);
  const ref = useRef(null);
  const bouton = useRef(null);
  const aujourdhui = todayIso();

  useEffect(() => {
    if (!ouvert) return undefined;
    const clicDehors = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOuvert(false);
    };
    const echap = (e) => {
      if (e.key !== "Escape") return;
      setOuvert(false);
      bouton.current?.focus();
    };
    document.addEventListener("mousedown", clicDehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", clicDehors);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  // Calculée seulement à l'ouverture : l'en-tête est sur tous les onglets.
  const notion = useMemo(
    () =>
      ouvert
        ? construireNotion({
            aujourdhui,
            decalage,
            bourse,
            livrets,
            bourseHistory,
            matelasMois,
            epargneMensuelle,
            tauxEpargne,
            livretsTotal,
            bourseTotal,
          })
        : null,
    [ouvert, aujourdhui, decalage, bourse, livrets, bourseHistory, matelasMois, epargneMensuelle, tauxEpargne, livretsTotal, bourseTotal]
  );

  const basculer = () => {
    setOuvert((o) => !o);
    setDecalage(0);
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={bouton}
        type="button"
        onClick={basculer}
        aria-label="Notion du jour"
        aria-expanded={ouvert}
        aria-controls="notion-du-jour"
        title="Notion du jour"
        className="btn-flash shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
      >
        <GraduationCap size={16} aria-hidden="true" />
      </button>

      {notion && (
        <div
          id="notion-du-jour"
          role="dialog"
          aria-label="Notion du jour"
          className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[26rem] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 shadow-xl p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
              {decalage % notion.total === 0 ? "Notion du jour" : `Notion ${notion.rang + 1} sur ${notion.total}`}
            </span>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setDecalage((d) => d - 1)}
                aria-label="Notion précédente"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setDecalage((d) => d + 1)}
                aria-label="Notion suivante"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div aria-live="polite">
            <p className="mt-1 text-micro text-indigo-300/80">{notion.theme}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-100">{notion.titre}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{notion.definition}</p>
            <div className="mt-2.5 rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-2">
              <span className="text-micro uppercase tracking-wider text-slate-500">{notion.perso ? "Chez toi" : "Exemple"}</span>
              <p className={`mt-0.5 text-xs leading-relaxed text-slate-200 ${notion.perso ? "ghost-blur" : ""}`}>{notion.exemple}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
