import { useId } from "react";
import Montant from "./Montant";
import { pctPlain } from "../lib/finance";

/**
 * L'allocation en piles de pièces : une pile par poche, dont la hauteur suit
 * le montant. Les pièces tombent l'une sur l'autre à l'arrivée de la carte.
 *
 * L'anneau dit des PROPORTIONS ; les piles disent des QUANTITÉS — on voit d'un
 * coup d'œil laquelle est la plus haute, et de combien. Les deux se lisent
 * dans la même carte (sélecteur Piles | Anneau du Dashboard).
 *
 * Dessiné à la main en SVG, comme les autres primitives de graphiques.jsx : une
 * pièce, c'est une tranche et une ellipse. Aucune bibliothèque, aucun canvas,
 * et l'animation est une simple translation que le compositeur prend en
 * charge (voir scenes.css, « Piles de pièces »).
 *
 * Le montant et la part restent ÉCRITS sous chaque pile : la hauteur donne
 * l'ordre de grandeur, jamais le chiffre. En mode Ghost ils sont caviardés
 * comme partout ailleurs.
 */

/** Hauteur de la plus grande pile, en pièces. */
const PIECES_MAX = 18;
const RX = 30;
const RY = 10;
const EPAISSEUR = 7;
const LARGEUR = 84;
const HAUTEUR = PIECES_MAX * EPAISSEUR + 2 * RY + 26;
const SOL = HAUTEUR - RY - 6;

/** Nombre de pièces d'une poche : au moins une, pour qu'elle existe à l'écran. */
export function nombreDePieces(valeur, maximum, piecesMax = PIECES_MAX) {
  if (!(valeur > 0) || !(maximum > 0)) return 0;
  return Math.max(1, Math.round((valeur / maximum) * piecesMax));
}

/** Léger décalage latéral, stable d'un rendu à l'autre : une pile n'est jamais d'aplomb. */
function decalage(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return ((x - Math.floor(x)) - 0.5) * 3;
}

export default function PilesAllocation({ poches = [], total = 0 }) {
  const maximum = poches.reduce((m, p) => Math.max(m, p.value || 0), 0);
  return (
    <ul className="piles-allocation" aria-label="Répartition du patrimoine par poche, en piles de pièces">
      {poches.map((p, rang) => (
        <Pile key={p.name} poche={p} rang={rang} pieces={nombreDePieces(p.value, maximum)} total={total} />
      ))}
    </ul>
  );
}

function Pile({ poche, rang, pieces, total }) {
  const id = useId();
  const cx = LARGEUR / 2;
  const sommet = SOL - pieces * EPAISSEUR;
  const part = total > 0 ? (poche.value / total) * 100 : 0;

  return (
    <li className="pile" style={{ "--pile": poche.color, "--retard": `${rang * 130}ms`, "--n": pieces }}>
      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        className="pile-dessin"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {/* Tranche : sombre sur les bords, un reflet au tiers — c'est ce
              dégradé horizontal qui fait lire un cylindre. */}
          <linearGradient id={`${id}-tranche`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--pile) 52%, black)" }} />
            <stop offset="32%" style={{ stopColor: "color-mix(in srgb, var(--pile) 88%, white)" }} />
            <stop offset="62%" style={{ stopColor: "color-mix(in srgb, var(--pile) 78%, black)" }} />
            <stop offset="100%" style={{ stopColor: "color-mix(in srgb, var(--pile) 44%, black)" }} />
          </linearGradient>
          <linearGradient id={`${id}-face`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--pile) 55%, white)" }} />
            <stop offset="100%" style={{ stopColor: "color-mix(in srgb, var(--pile) 92%, black)" }} />
          </linearGradient>
        </defs>

        <ellipse cx={cx} cy={SOL + 3} rx={RX + 5} ry={RY + 1} className="pile-ombre" />

        {Array.from({ length: pieces }, (_, i) => {
          const x = cx + (i === 0 ? 0 : decalage(i + rang * 7));
          const bas = SOL - i * EPAISSEUR;
          const haut = bas - EPAISSEUR;
          return (
            <g key={i} className="piece-pile" style={{ "--i": i }}>
              <path
                d={`M${x - RX},${haut} L${x - RX},${bas} A${RX},${RY} 0 0 0 ${x + RX},${bas} L${x + RX},${haut} Z`}
                fill={`url(#${id}-tranche)`}
              />
              <ellipse cx={x} cy={haut} rx={RX} ry={RY} fill={`url(#${id}-face)`} />
              <ellipse cx={x} cy={haut} rx={RX - 5} ry={RY - 2.4} className="piece-listel" />
              {i === pieces - 1 && (
                <text x={x} y={haut + 0.5} textAnchor="middle" dominantBaseline="central" className="piece-symbole">
                  €
                </text>
              )}
            </g>
          );
        })}

        {/* Un éclat sur la dernière pièce posée. */}
        <path
          className="pile-eclat"
          d="M0,-7 L1.6,-1.6 L7,0 L1.6,1.6 L0,7 L-1.6,1.6 L-7,0 L-1.6,-1.6 Z"
          transform={`translate(${cx + RX - 9} ${sommet - 6})`}
        />
      </svg>
      <span className="pile-nom">{poche.name}</span>
      <span className="pile-chiffres">
        <Montant valeur={poche.value} decimales={0} />
        <span className="font-data ghost-blur text-slate-500"> · {pctPlain(part, 0)}</span>
      </span>
    </li>
  );
}
