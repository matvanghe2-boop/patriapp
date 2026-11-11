import { useId } from "react";

/**
 * Le matelas de sécurité en verre d'eau.
 *
 * Un verre qui se remplit à mesure que le matelas couvre de mois de dépenses :
 * plein à six mois, le repère habituel. Au-delà, l'eau passe au vert et
 * DÉBORDE — l'argent qui dépasse le matelas n'a plus rien à y faire, il
 * pourrait travailler ailleurs. Deux graduations, à trois et six mois.
 *
 * Le niveau informe : il reste affiché, immobile, en effets sobres et
 * animations coupées. Seuls la houle, les bulles et les gouttes sont de
 * l'ambiance (voir scenes.css, « Jauge d'eau »). Le nombre de mois reste écrit
 * à côté du verre : la jauge n'est jamais la seule à le dire.
 */

/** Niveau plein, en mois de dépenses. */
export const MOIS_PLEIN = 6;

const HAUT = 9; // bord du verre
const FOND = 72; // fond intérieur
const COURSE = FOND - HAUT;

/** Part du verre remplie (0 à 1) pour un matelas de `mois` mois. */
export function remplissage(mois, plein = MOIS_PLEIN) {
  if (!Number.isFinite(mois) || mois <= 0) return 0;
  return Math.min(1, mois / plein);
}

export default function JaugeMatelas({ mois, className = "" }) {
  const id = useId();
  const connu = Number.isFinite(mois);
  const part = remplissage(mois);
  const deborde = connu && mois > MOIS_PLEIN;
  const niveau = FOND - part * COURSE;
  const libelle = !connu
    ? "Matelas de sécurité inconnu : verre vide"
    : `Matelas de sécurité : ${mois.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mois de dépenses${
        deborde ? `, au-delà du repère de ${MOIS_PLEIN} mois : le verre déborde` : `, sur un repère de ${MOIS_PLEIN} mois`
      }`;

  return (
    <svg
      viewBox="0 0 72 84"
      className={`jauge-matelas ${className}`}
      data-deborde={deborde ? "" : undefined}
      role="img"
      aria-label={libelle}
      focusable="false"
    >
      <defs>
        <clipPath id={`${id}-verre`}>
          <path d="M11.6,9 L16.2,69.4 Q16.5,72.6 19.6,72.6 L44.4,72.6 Q47.5,72.6 47.8,69.4 L52.4,9 Z" />
        </clipPath>
      </defs>

      {/* Flaque et gouttes : seulement quand le verre déborde. */}
      {deborde && (
        <>
          <ellipse cx="32" cy="77.5" rx="26" ry="3.2" className="jauge-flaque" />
          <path className="jauge-goutte jauge-goutte-g" d="M9.4,10 q2.2,3.2 0,5 q-2.2,-1.8 0,-5 z" />
          <path className="jauge-goutte jauge-goutte-d" d="M54.6,10 q2.2,3.2 0,5 q-2.2,-1.8 0,-5 z" />
        </>
      )}

      {/* L'eau. Le groupe extérieur porte le niveau, l'intérieur la montée à
          l'arrivée, les tracés la houle : trois mouvements qui ne se gênent pas. */}
      {part > 0 && (
        <g clipPath={`url(#${id}-verre)`}>
          <g transform={`translate(0 ${niveau.toFixed(1)})`}>
            <g className="jauge-eau" style={{ "--course": `${(FOND - niveau).toFixed(1)}px` }}>
              <path
                className="jauge-vague jauge-vague-b"
                d="M-32,0 q8,2.4 16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0 V80 H-32 Z"
              />
              <path
                className="jauge-vague jauge-vague-a"
                d="M-32,1 q8,-2.8 16,0 t16,0 t16,0 t16,0 t16,0 t16,0 t16,0 V80 H-32 Z"
              />
              <circle className="jauge-bulle" cx="24" cy="22" r="1.5" />
              <circle className="jauge-bulle jauge-bulle-2" cx="38" cy="30" r="1" />
            </g>
          </g>
        </g>
      )}

      {/* Le verre, par-dessus l'eau : parois, reflet, graduations. */}
      <path
        className="jauge-verre"
        d="M10,8 L15,70 Q15.4,74 19.4,74 L44.6,74 Q48.6,74 49,70 L54,8"
        strokeDasharray={connu ? undefined : "3 3"}
      />
      <path className="jauge-reflet" d="M15.6,14 L19,60" />
      <g className="jauge-graduations">
        <path d={`M52.6,${HAUT + 1.5} h5 M50.2,${FOND - COURSE / 2} h5`} />
        <text x="60" y={HAUT + 1.5} dominantBaseline="central">6</text>
        <text x="57.6" y={FOND - COURSE / 2} dominantBaseline="central">3</text>
      </g>
    </svg>
  );
}
