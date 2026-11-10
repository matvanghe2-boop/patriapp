import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Flag, Target, Coins, X } from "lucide-react";
import { ecouterMoments } from "../lib/moments";
import { useToast } from "../lib/ToastContext";
import { effetsVivants, mouvementReduit } from "../lib/mouvement";
import Montant from "./Montant";

/**
 * La scène des moments patrimoniaux (voir lib/moments.js).
 *
 * Une carte descend du haut de l'écran, le montant en grand, traversé d'un
 * reflet d'or ; une gerbe de confettis pour un record, un palier ou un
 * objectif, une pièce qui tombe pour un dividende. Elle repart seule au bout
 * de six secondes, d'un clic ou d'Échap, et n'empêche rien en attendant :
 * le reste de l'écran reste cliquable.
 *
 * Effets sobres ou mouvement réduit : le moment redevient le toast qu'il était.
 * Le texte entier est annoncé aux lecteurs d'écran dans les deux cas, et le
 * mode Ghost caviarde le montant comme partout ailleurs.
 */
const ICONES = { record: Crown, palier: Flag, objectif: Target, dividende: Coins };
const ETIQUETTES = { record: "Nouveau record", palier: "Palier franchi", objectif: "Objectif atteint", dividende: "Dividende encaissé" };
const DUREE_MS = 6000;

export default function Moments() {
  const { showToast } = useToast();
  const [file, setFile] = useState([]);
  const courant = file[0] || null;

  useEffect(
    () =>
      ecouterMoments((m) => {
        if (!effetsVivants() || mouvementReduit()) {
          showToast({ message: m.message });
          return;
        }
        setFile((f) => [...f, { ...m, cle: `${m.type}-${Date.now()}-${Math.random()}` }]);
      }),
    [showToast]
  );

  const suivant = useCallback(() => setFile((f) => f.slice(1)), []);

  useEffect(() => {
    if (!courant) return undefined;
    const t = setTimeout(suivant, DUREE_MS);
    const surTouche = (e) => {
      if (e.key === "Escape") suivant();
    };
    document.addEventListener("keydown", surTouche);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", surTouche);
    };
  }, [courant, suivant]);

  if (!courant) return <div aria-live="polite" className="sr-only" />;

  const Icone = ICONES[courant.type] || Crown;
  return (
    <>
      <div aria-live="polite" className="sr-only">
        {courant.message}
      </div>
      {courant.type !== "dividende" && <Confettis cle={courant.cle} type={courant.type} />}
      <div key={courant.cle} className="moment" data-type={courant.type} aria-hidden="true" onClick={suivant}>
        {courant.type === "dividende" && <span className="moment-piece" />}
        <div className="moment-entete">
          <span className="moment-icone">
            <Icone size={16} />
          </span>
          <span className="moment-etiquette">{ETIQUETTES[courant.type]}</span>
          <button type="button" className="moment-fermer" onClick={suivant} tabIndex={-1}>
            <X size={14} />
          </button>
        </div>
        {Number.isFinite(courant.valeur) && (
          <div className="moment-valeur">
            <Montant valeur={courant.valeur} decimales={0} rouleaux depart={courant.depart} />
          </div>
        )}
        <p className="moment-titre">{courant.titre}</p>
        {courant.detail && <p className="moment-detail">{courant.detail}</p>}
        <span className="moment-minuterie" style={{ animationDuration: `${DUREE_MS}ms` }} />
      </div>
    </>
  );
}

/**
 * Gerbe de confettis, dessinée sur un canvas le temps d'une seconde et demie.
 * Les couleurs suivent le moment : or pour un record, teinte de l'accent pour
 * un palier, vert pour un objectif.
 */
function Confettis({ cle, type }) {
  const canvas = useRef(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext?.("2d");
    if (!ctx) return undefined;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    c.width = window.innerWidth * ratio;
    c.height = window.innerHeight * ratio;
    ctx.scale(ratio, ratio);
    const couleurs = {
      record: ["#fbbf24", "#fde68a", "#f59e0b", "#fff7d6"],
      palier: ["#a78bfa", "#fbbf24", "#67e8f9", "#f9a8d4"],
      objectif: ["#34d399", "#a7f3d0", "#fbbf24", "#ecfdf5"],
    }[type] || ["#fbbf24", "#fde68a"];
    const origineX = window.innerWidth / 2;
    const particules = Array.from({ length: 140 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
      const vitesse = 7 + Math.random() * 9;
      return {
        x: origineX + (Math.random() - 0.5) * 120,
        y: 96,
        vx: Math.cos(angle) * vitesse,
        vy: Math.sin(angle) * vitesse * 0.7 + 2,
        r: 3 + Math.random() * 4,
        a: Math.random() * Math.PI,
        va: (Math.random() - 0.5) * 0.3,
        c: couleurs[Math.floor(Math.random() * couleurs.length)],
      };
    });
    const debut = performance.now();
    let image = 0;
    const dessiner = (t) => {
      const ecoule = t - debut;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const fondu = Math.max(0, 1 - ecoule / 2200);
      for (const p of particules) {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        ctx.save();
        ctx.globalAlpha = fondu;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r / 2.5, p.r * 2, p.r / 1.25);
        ctx.restore();
      }
      if (ecoule < 2200) image = requestAnimationFrame(dessiner);
    };
    image = requestAnimationFrame(dessiner);
    return () => cancelAnimationFrame(image);
  }, [cle, type]);
  return <canvas ref={canvas} className="moment-confettis" aria-hidden="true" />;
}
