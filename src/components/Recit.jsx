import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Pause, Play } from "lucide-react";

/**
 * Récit plein écran, diapositive après diapositive.
 *
 * La rétrospective de l'année et le bilan du mois empilaient leurs chiffres
 * sur un seul écran, qu'on parcourait en diagonale. Racontés un par un, à
 * plein écran, chacun a son moment : le montant de l'année qui roule, la
 * courbe qui se trace, le meilleur mois, le dividende.
 *
 * Gestes habituels des « stories » : toucher la droite avance, la gauche
 * revient, un appui maintenu met en pause. Au clavier : flèches, Espace,
 * Échap. Les barres du haut disent où l'on en est.
 *
 * Le défilement automatique est tenu par une minuterie JavaScript, pas par la
 * fin de l'animation des barres : en mouvement réduit, les animations sont
 * ramenées à rien et le récit sauterait sinon toutes ses diapositives d'un
 * coup.
 *
 * @param {Array<{cle: string, teinte?: number, contenu: React.ReactNode}>} diapos
 */
export default function Recit({ diapos, onFermer, titre, duree = 6500 }) {
  const [index, setIndex] = useState(0);
  const [pause, setPause] = useState(false);
  const soi = useRef(null);
  // Temps restant de la diapositive en cours, pour reprendre après une pause
  // là où l'on s'était arrêté. Lié à son index : un changement de diapositive
  // repart d'une durée pleine.
  const reste = useRef({ index: 0, ms: duree });
  const appui = useRef(0);
  const pauseParAppui = useRef(false);

  const total = diapos.length;
  const aller = useCallback(
    (n) => {
      if (n >= total) {
        setPause(true);
        return;
      }
      const cible = Math.max(0, n);
      reste.current = { index: cible, ms: duree };
      setIndex(cible);
    },
    [total, duree]
  );

  // Minuterie de la diapositive courante, qui reprend où elle s'était arrêtée.
  useEffect(() => {
    if (pause || index >= total - 1) return undefined;
    const debut = performance.now();
    const ms = reste.current.index === index ? reste.current.ms : duree;
    const t = setTimeout(() => aller(index + 1), ms);
    return () => {
      clearTimeout(t);
      if (reste.current.index === index) reste.current = { index, ms: Math.max(0, ms - (performance.now() - debut)) };
    };
  }, [index, pause, total, aller, duree]);

  useEffect(() => {
    soi.current?.focus();
    const surTouche = (e) => {
      if (e.key === "Escape") onFermer?.();
      else if (e.key === "ArrowRight") aller(index + 1);
      else if (e.key === "ArrowLeft") aller(index - 1);
      else if (e.key === " ") {
        e.preventDefault();
        setPause((p) => !p);
      } else return;
    };
    document.addEventListener("keydown", surTouche);
    const debordement = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = debordement;
    };
  }, [index, aller, onFermer]);

  const surAppui = (e) => {
    if (e.target.closest("button, a, select, input")) return;
    clearTimeout(appui.current);
    appui.current = setTimeout(() => {
      pauseParAppui.current = true;
      setPause(true);
    }, 220);
  };
  const surRelache = (e) => {
    if (e.target.closest("button, a, select, input")) return;
    clearTimeout(appui.current);
    if (pauseParAppui.current) {
      pauseParAppui.current = false;
      setPause(false);
      return;
    }
    const r = soi.current.getBoundingClientRect();
    if (e.clientX - r.left < r.width * 0.3) aller(index - 1);
    else aller(index + 1);
  };

  const diapo = diapos[Math.min(index, total - 1)];
  return createPortal(
    <div
      ref={soi}
      role="dialog"
      aria-modal="true"
      aria-label={titre}
      tabIndex={-1}
      className="recit"
      style={{ "--recit-h": diapo?.teinte ?? "var(--accent-h, 38)" }}
      onPointerDown={surAppui}
      onPointerUp={surRelache}
      onPointerCancel={() => clearTimeout(appui.current)}
    >
      <div className="recit-barres" aria-hidden="true">
        {diapos.map((d, i) => (
          <span key={d.cle} className="recit-barre">
            <span
              className={`recit-remplissage ${i < index ? "recit-vue" : i === index ? "recit-encours" : ""}`}
              style={i === index ? { animationDuration: `${duree}ms`, animationPlayState: pause ? "paused" : "running" } : undefined}
            />
          </span>
        ))}
      </div>
      <div className="recit-commandes">
        <span className="recit-titre">{titre}</span>
        <button type="button" onClick={() => setPause((p) => !p)} aria-label={pause ? "Reprendre" : "Mettre en pause"}>
          {pause ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button type="button" onClick={onFermer} aria-label="Fermer le récit">
          <X size={18} />
        </button>
      </div>

      <div key={diapo?.cle} className="recit-diapo" aria-live="polite">
        {diapo?.contenu}
      </div>

      <p className="sr-only">
        Diapositive {index + 1} sur {total}. Flèches pour naviguer, Espace pour mettre en pause, Échap pour fermer.
      </p>
    </div>,
    document.body
  );
}

/** Une ligne de diapositive : petite étiquette, puis ce qu'elle annonce. */
export function Etiquette({ children }) {
  return <p className="recit-etiquette">{children}</p>;
}
