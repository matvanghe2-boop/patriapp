import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import Modal from "../Modal";
import Medaille from "./Medaille";
import {
  ecouterBadges, BADGE_PAR_ID, rareteDe, estANiveaux, libelleSeuil, NIVEAU_MAX, RARETES,
} from "../../lib/badges";
import { useToast } from "../../lib/ToastContext";
import { effetsVivants, mouvementReduit } from "../../lib/mouvement";
import { jouerSon } from "../../lib/sons";

/**
 * La scène des badges débloqués (voir lib/badges.js, `annoncerBadges`).
 *
 *  · Un badge : la médaille tourne en grand, avec sa matière et son niveau.
 *  · Plusieurs d'un coup — le premier passage, qui débloque tout ce qui est
 *    déjà acquis, ou un import qui en fait tomber plusieurs : UNE seule
 *    célébration, toutes les médailles côte à côte.
 *
 * Effets sobres ou mouvement réduit : un simple toast, comme les moments.
 */
const VISIBLES = 12;
const COULEURS = {
  commun: ["#f7d6b4", "#c98546", "#fbbf24"],
  "peu-commun": ["#ffffff", "#c3ccd8", "#93c5fd"],
  rare: ["#fff6c2", "#f0c43a", "#fbbf24", "#fde68a"],
  epique: ["#f8fbff", "#c4b5fd", "#9ad0ff", "#ff9ad5"],
  legendaire: ["#8fe6ff", "#ffffff", "#a0ffd8", "#ff9ad5", "#fff3a0"],
};

const rangDe = (n) => rareteDe(BADGE_PAR_ID[n.id], n.niveau).rang;
/** Les plus rares d'abord, puis l'ordre du catalogue. */
const trier = (nouveautes) =>
  [...nouveautes].sort((a, b) => rangDe(b) - rangDe(a) || BADGE_PAR_ID[a.id].numero - BADGE_PAR_ID[b.id].numero);

function niveauEnClair(badge, niveau) {
  if (!estANiveaux(badge)) return rareteDe(badge).libelle;
  return `Niveau ${niveau} sur ${NIVEAU_MAX} · ${libelleSeuil(badge, niveau)}`;
}

function messageDe(annonce, nouveautes) {
  const noms = nouveautes.map((n) => `${BADGE_PAR_ID[n.id].nom} (${rareteDe(BADGE_PAR_ID[n.id], n.niveau).matiere})`);
  if (nouveautes.length === 1) return `Badge débloqué : ${noms[0]}.`;
  const tete = noms.slice(0, 4).join(", ");
  return `${nouveautes.length} badges débloqués : ${tete}${nouveautes.length > 4 ? "…" : "."}`;
}

export default function CelebrationBadges({ onVoir }) {
  const { showToast } = useToast();
  const [file, setFile] = useState([]);
  const courante = file[0] || null;

  useEffect(
    () =>
      ecouterBadges((annonce) => {
        const nouveautes = trier((annonce?.nouveautes || []).filter((n) => BADGE_PAR_ID[n.id]));
        if (!nouveautes.length) return;
        if (!effetsVivants() || mouvementReduit()) {
          showToast({ message: messageDe(annonce, nouveautes) });
          return;
        }
        setFile((f) => [...f, { ...annonce, nouveautes, cle: `${Date.now()}-${Math.random()}` }]);
      }),
    [showToast]
  );

  const fermer = useCallback(() => setFile((f) => f.slice(1)), []);
  const voir = useCallback(() => {
    setFile([]);
    onVoir?.();
  }, [onVoir]);

  useEffect(() => {
    if (courante) jouerSon("piece");
  }, [courante]);

  if (!courante) return null;

  const { nouveautes } = courante;
  const groupe = courante.groupe || nouveautes.length > 1;
  const meilleure = rareteDe(BADGE_PAR_ID[nouveautes[0].id], nouveautes[0].niveau);
  const titreId = `celebration-${courante.cle}`;

  return (
    <>
      <Confettis key={courante.cle} couleurs={COULEURS[meilleure.id]} quantite={groupe ? 200 : 140} />
      <Modal
        open
        onClose={fermer}
        labelledBy={titreId}
        panelClassName="celebration-badges-panneau w-full max-w-lg rounded-2xl border border-fuchsia-400/30 bg-slate-900 shadow-2xl"
      >
        {groupe ? (
          <Groupe annonce={courante} titreId={titreId} />
        ) : (
          <Seul nouveaute={nouveautes[0]} titreId={titreId} />
        )}
        <div className="flex flex-wrap justify-center gap-2 px-6 pb-6">
          <button
            type="button"
            onClick={voir}
            className="btn-flash rounded-xl bg-fuchsia-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-fuchsia-300"
          >
            Voir la vitrine
          </button>
          <button
            type="button"
            onClick={fermer}
            className="btn-flash rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:text-slate-100"
          >
            Fermer
          </button>
        </div>
      </Modal>
    </>
  );
}

function Seul({ nouveaute, titreId }) {
  const badge = BADGE_PAR_ID[nouveaute.id];
  const rarete = rareteDe(badge, nouveaute.niveau);
  return (
    <div className="flex flex-col items-center gap-3 px-6 pt-8 pb-5 text-center">
      <p className="text-micro uppercase tracking-wider text-fuchsia-300">
        {nouveaute.depuis > 0 ? "Niveau supérieur" : badge.secret ? "Badge secret découvert" : "Nouveau badge"}
      </p>
      <div className="py-4">
        <Medaille badge={badge} niveau={nouveaute.niveau} taille="xl" anime="tour" />
      </div>
      <h2 id={titreId} className="font-display text-2xl text-slate-50">
        {badge.nom}
      </h2>
      <p className="text-sm text-slate-300">
        <span className="font-semibold">{rarete.matiere}</span> · {rarete.libelle}
        {estANiveaux(badge) && <span className="text-slate-400"> — {niveauEnClair(badge, nouveaute.niveau)}</span>}
      </p>
      <p className="text-sm text-slate-400 max-w-sm">{badge.condition}</p>
    </div>
  );
}

function Groupe({ annonce, titreId }) {
  const { nouveautes } = annonce;
  const visibles = nouveautes.slice(0, VISIBLES);
  const medailles = nouveautes.reduce((s, n) => s + (n.niveau - n.depuis), 0);
  const parRarete = RARETES.map((r) => ({
    ...r,
    nombre: nouveautes.filter((n) => rareteDe(BADGE_PAR_ID[n.id], n.niveau).id === r.id).length,
  })).filter((r) => r.nombre > 0);

  return (
    <div className="flex flex-col items-center gap-4 px-6 pt-8 pb-5 text-center">
      <p className="flex items-center gap-1.5 text-micro uppercase tracking-wider text-fuchsia-300">
        <Sparkles size={13} aria-hidden="true" />
        {annonce.premierPassage ? "Ta vitrine s'ouvre" : "Nouveaux badges"}
      </p>
      <h2 id={titreId} className="font-display text-2xl text-slate-50">
        {nouveautes.length} badges débloqués d'un coup
      </h2>
      <p className="text-sm text-slate-400 max-w-sm">
        {annonce.premierPassage
          ? `Tout ce que tu as déjà accompli compte : ${medailles} médaille${medailles > 1 ? "s" : ""} pour commencer.`
          : `${medailles} médaille${medailles > 1 ? "s" : ""} de plus dans ta vitrine.`}
      </p>
      <ul className="celebration-badges-grille grid grid-cols-3 sm:grid-cols-4 gap-x-3 gap-y-5 py-2">
        {visibles.map((n, i) => {
          const badge = BADGE_PAR_ID[n.id];
          return (
            <li key={n.id} style={{ "--rang": i }} className="flex flex-col items-center gap-2">
              <Medaille badge={badge} niveau={n.niveau} taille="md" anime="balancement" />
              <span className="text-micro leading-tight text-slate-300">{badge.nom}</span>
            </li>
          );
        })}
      </ul>
      {nouveautes.length > VISIBLES && (
        <p className="text-micro text-slate-500">et {nouveautes.length - VISIBLES} autre{nouveautes.length - VISIBLES > 1 ? "s" : ""} dans la vitrine</p>
      )}
      <p className="text-micro text-slate-400">
        {parRarete.map((r) => `${r.nombre} ${r.matiere.toLowerCase()}`).join(" · ")}
      </p>
    </div>
  );
}

/** Gerbe de confettis aux couleurs de la médaille la plus rare. */
function Confettis({ couleurs = ["#fbbf24"], quantite = 140 }) {
  const canvas = useRef(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext?.("2d");
    if (!ctx) return undefined;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    c.width = window.innerWidth * ratio;
    c.height = window.innerHeight * ratio;
    ctx.scale(ratio, ratio);
    const particules = Array.from({ length: quantite }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const vitesse = 8 + Math.random() * 10;
      return {
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 160,
        y: window.innerHeight * 0.38,
        vx: Math.cos(angle) * vitesse,
        vy: Math.sin(angle) * vitesse * 0.8,
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
      const fondu = Math.max(0, 1 - ecoule / 2600);
      for (const p of particules) {
        p.vy += 0.3;
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
      if (ecoule < 2600) image = requestAnimationFrame(dessiner);
    };
    image = requestAnimationFrame(dessiner);
    return () => cancelAnimationFrame(image);
  }, [couleurs, quantite]);
  return <canvas ref={canvas} className="celebration-badges-confettis" aria-hidden="true" />;
}
