import { useEffect, useId, useMemo, useRef, useState } from "react";
import Montant from "./Montant";
import { useApparence } from "../lib/ApparenceContext";
import { appareilEconome } from "../lib/mouvement";

/**
 * Le flux du mois en rubans : à gauche d'où vient l'argent, au centre le
 * compte courant, à droite où il part. La largeur d'un ruban est son montant ;
 * des particules coulent le long, des revenus vers les dépenses et l'épargne.
 *
 * Il remplace le diagramme de Sankey de recharts, pour trois raisons : ses
 * étiquettes mangeaient la moitié de la largeur (il était masqué sur
 * téléphone), il ne savait pas s'animer, et un ruban n'est qu'une courbe de
 * Bézier — pas de quoi charger un moteur de mise en page.
 *
 * LES PARTICULES sont de l'ambiance : effets vivants seulement, jamais sur un
 * appareil économe, et mises en pause dès que la carte quitte l'écran. Elles
 * sont animées par SMIL (`animateMotion`), donc sans une ligne de JavaScript
 * par image. Le tracé des rubans, lui, informe : il reste dans tous les modes,
 * et les listes sous le schéma redisent chaque montant en clair.
 */

const LARGEUR_NOEUD = 7;
// Assez pour que deux étiquettes voisines de rubans très fins ne se touchent pas.
const ECART = 13;
const MARGE_V = 10;

/** Couleur d'un ruban selon ce qu'il représente. */
function couleurFlux(id, cote) {
  if (id === "interne") return "var(--c-sky-400)"; // épargne, mouvements entre mes comptes
  if (id === "ponctuel") return "var(--c-amber-400)";
  if (id === "solde" || id === "reste") return "var(--c-slate-400)";
  return cote === "source" ? "var(--c-emerald-400)" : "var(--c-rose-400)";
}

/** Raccourcit un libellé pour qu'il tienne dans la marge. */
function abreger(texte, max) {
  return texte.length > max ? `${texte.slice(0, Math.max(1, max - 1)).trimEnd()}…` : texte;
}

/**
 * Géométrie des rubans, en pixels. Fonction pure : testable sans navigateur.
 *
 * Une seule échelle verticale pour les deux côtés — un euro a la même
 * épaisseur à gauche et à droite — et un nœud central sans interstice, où les
 * rubans se rejoignent bord à bord.
 */
export function disposerRubans({ sources = [], destinations = [], largeur, hauteur, marge }) {
  const total = Math.max(
    sources.reduce((s, x) => s + x.montant, 0),
    destinations.reduce((s, x) => s + x.montant, 0)
  );
  if (!(total > 0) || !(largeur > 0)) return { rubans: [], noeuds: [], centre: null };

  const utile = hauteur - 2 * MARGE_V;
  const echelle = Math.min(
    (utile - ECART * Math.max(0, sources.length - 1)) / total,
    (utile - ECART * Math.max(0, destinations.length - 1)) / total
  );
  const xGauche = marge;
  const xDroite = largeur - marge - LARGEUR_NOEUD;
  const xCentre = largeur / 2 - LARGEUR_NOEUD / 2;
  const hCentre = total * echelle;
  const yCentre = (hauteur - hCentre) / 2;

  const colonne = (lignes, cote) => {
    const hauteurs = lignes.map((l) => Math.max(1.5, l.montant * echelle));
    const pile = hauteurs.reduce((s, h) => s + h, 0) + ECART * Math.max(0, lignes.length - 1);
    let y = (hauteur - pile) / 2;
    let yc = yCentre;
    return lignes.map((l, i) => {
      const h = hauteurs[i];
      const hc = l.montant * echelle;
      const r = { ...l, cote, y, h, yc, hc, part: l.montant / total };
      y += h + ECART;
      yc += hc;
      return r;
    });
  };

  const trace = (x0, y0, h0, x1, y1, h1) => {
    const xm = (x0 + x1) / 2;
    return {
      aire: `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h1} C${xm},${y1 + h1} ${xm},${y0 + h0} ${x0},${y0 + h0} Z`,
      // Fil central, suivi par les particules ; `decale` l'écarte du milieu.
      fil: (decale = 0) =>
        `M${x0},${y0 + h0 * (0.5 + decale)} C${xm},${y0 + h0 * (0.5 + decale)} ${xm},${y1 + h1 * (0.5 + decale)} ${x1},${y1 + h1 * (0.5 + decale)}`,
    };
  };

  const gauche = colonne(sources, "source").map((r) => ({
    ...r,
    xNoeud: xGauche,
    ...trace(xGauche + LARGEUR_NOEUD, r.y, r.h, xCentre, r.yc, Math.max(1.5, r.hc)),
  }));
  const droite = colonne(destinations, "destination").map((r) => ({
    ...r,
    xNoeud: xDroite,
    ...trace(xCentre + LARGEUR_NOEUD, r.yc, Math.max(1.5, r.hc), xDroite, r.y, r.h),
  }));

  return {
    rubans: [...gauche, ...droite],
    centre: { x: xCentre, y: yCentre, h: hCentre },
    xGauche,
    xDroite,
  };
}

/** Répartit un budget de particules entre les rubans, au prorata des montants. */
export function repartirParticules(rubans, budget) {
  return rubans.map((r) => Math.max(1, Math.min(5, Math.round(r.part * budget))));
}

export default function RubansFlux({ sources, destinations, libelle }) {
  const id = useId();
  const cadre = useRef(null);
  const svg = useRef(null);
  const [largeur, setLargeur] = useState(0);
  const [survol, setSurvol] = useState(null);
  const { effets, mouvementReduit } = useApparence();
  const particules = effets === "vivant" && !mouvementReduit && !appareilEconome();

  // La largeur réelle de la carte : le schéma se redessine à sa mesure plutôt
  // que de s'étirer, pour que les étiquettes gardent leur taille.
  useEffect(() => {
    const el = cadre.current;
    if (!el) return undefined;
    const mesurer = () => setLargeur(Math.round(el.getBoundingClientRect().width));
    mesurer();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, []);

  // Hors de l'écran, les particules s'arrêtent : aucune raison d'animer ce
  // que personne ne regarde.
  useEffect(() => {
    const el = svg.current;
    if (!el || !particules || typeof IntersectionObserver === "undefined") return undefined;
    const observateur = new IntersectionObserver(([entree]) => {
      if (entree.isIntersecting) el.unpauseAnimations?.();
      else el.pauseAnimations?.();
    });
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [particules, largeur]);

  const etroit = largeur > 0 && largeur < 520;
  const marge = etroit ? 96 : 138;
  const hauteur = Math.max(etroit ? 190 : 220, (etroit ? 30 : 36) * Math.max(sources.length, destinations.length));
  const plan = useMemo(
    () => disposerRubans({ sources, destinations, largeur, hauteur, marge }),
    [sources, destinations, largeur, hauteur, marge]
  );
  const nombres = useMemo(() => repartirParticules(plan.rubans, etroit ? 12 : 18), [plan.rubans, etroit]);
  // 6,4 px par caractère à 11 px : un peu large, pour qu'une étiquette faite
  // de lettres pleines (« Vers mes comptes ») ne morde jamais sur le bord.
  const caracteres = Math.floor((marge - 12) / 6.4);
  const actif = plan.rubans.find((r) => `${r.cote}-${r.id}` === survol) || null;

  return (
    <div ref={cadre} className="rubans-flux">
      {largeur > 0 && plan.centre && (
        <svg
          ref={svg}
          viewBox={`0 0 ${largeur} ${hauteur}`}
          width={largeur}
          height={hauteur}
          role="img"
          aria-label={libelle}
          focusable="false"
          data-trace="courbe"
          onPointerLeave={() => setSurvol(null)}
        >
          <defs>
            {plan.rubans.map((r) => {
              const couleur = `rgb(${couleurFlux(r.id, r.cote)})`;
              const versCentre = r.cote === "source";
              return (
                <linearGradient key={`${r.cote}-${r.id}`} id={`${id}-${r.cote}-${r.id}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={versCentre ? couleur : "hsl(var(--teinte))"} stopOpacity={versCentre ? 0.5 : 0.28} />
                  <stop offset="100%" stopColor={versCentre ? "hsl(var(--teinte))" : couleur} stopOpacity={versCentre ? 0.28 : 0.5} />
                </linearGradient>
              );
            })}
          </defs>

          {plan.rubans.map((r, i) => {
            const cle = `${r.cote}-${r.id}`;
            const couleur = `rgb(${couleurFlux(r.id, r.cote)})`;
            const gauche = r.cote === "source";
            return (
              <g
                key={cle}
                className="ruban"
                data-actif={survol === cle ? "" : undefined}
                data-efface={survol && survol !== cle ? "" : undefined}
                onPointerEnter={() => setSurvol(cle)}
                onClick={() => setSurvol((s) => (s === cle ? null : cle))}
              >
                <path d={r.aire} fill={`url(#${id}-${cle})`} className="ruban-aire" />
                <rect x={r.xNoeud} y={r.y} width={LARGEUR_NOEUD} height={r.h} rx="2" fill={couleur} />
                <text
                  x={gauche ? r.xNoeud - 7 : r.xNoeud + LARGEUR_NOEUD + 7}
                  y={r.y + r.h / 2}
                  textAnchor={gauche ? "end" : "start"}
                  dominantBaseline="central"
                  className="ruban-etiquette"
                >
                  {abreger(r.libelle, caracteres)}
                </text>
                {particules &&
                  Array.from({ length: nombres[i] }, (_, k) => {
                    // Durée et départ stables d'un rendu à l'autre : un ruban
                    // large coule un peu plus vite, chaque particule a son rang.
                    const duree = 3.4 - Math.min(1, r.part * 2) + (k % 3) * 0.35;
                    const debut = -((k + 0.5) / nombres[i]) * duree - (i % 4) * 0.4;
                    const decale = nombres[i] === 1 ? 0 : ((k / (nombres[i] - 1)) - 0.5) * 0.56;
                    return (
                      <circle key={k} r={r.h > 10 ? 2 : 1.5} fill={couleur} className="ruban-particule">
                        <animateMotion dur={`${duree}s`} begin={`${debut}s`} repeatCount="indefinite" path={r.fil(decale)} />
                        <animate
                          attributeName="opacity"
                          values="0;1;1;0"
                          keyTimes="0;0.14;0.86;1"
                          dur={`${duree}s`}
                          begin={`${debut}s`}
                          repeatCount="indefinite"
                        />
                      </circle>
                    );
                  })}
              </g>
            );
          })}

          <rect
            x={plan.centre.x}
            y={plan.centre.y}
            width={LARGEUR_NOEUD}
            height={plan.centre.h}
            rx="2.5"
            className="ruban-centre"
          />
        </svg>
      )}
      {/* Le ruban survolé (ou touché), en toutes lettres. La ligne garde sa
          hauteur : rien ne saute quand on passe d'un ruban à l'autre. */}
      <p className="rubans-detail" aria-hidden={actif ? undefined : "true"}>
        {actif ? (
          <>
            {actif.cote === "source" ? `${actif.libelle} → Compte courant` : `Compte courant → ${actif.libelle}`} :{" "}
            <Montant valeur={actif.montant / 100} decimales={2} className="text-slate-100" />
          </>
        ) : (
          <span className="text-slate-500">Survole ou touche un ruban pour lire son montant.</span>
        )}
      </p>
    </div>
  );
}
