import { appareilEconome } from "../lib/mouvement";

/**
 * Fond vivant : la teinte de l'onglet dérive lentement derrière le contenu.
 *
 * Trois nappes de couleur, de simples dégradés qui se déplacent (aucun flou ni
 * canvas : le compositeur s'en charge sans repeindre). Les deux premières
 * prennent les teintes du domaine ; la troisième dit l'HUMEUR de la séance —
 * un vert à peine plus chaud quand le portefeuille monte, un rose retenu quand
 * il baisse. Le chiffre de la variation reste écrit dans l'en-tête : la couleur
 * n'ajoute qu'une impression, elle n'informe jamais seule.
 *
 * Quatre écrans ont en plus leur propre DÉCOR, posé sur les nappes (`scene`) :
 *
 *  · « bourse »     — des chandeliers flous qui défilent ;
 *  · « livrets »    — des bulles qui montent ;
 *  · « immobilier » — un plan de maison qui se dessine ;
 *  · « coffre »     — du métal brossé, et le cadran d'une porte forte.
 *
 * Chaque décor ne coûte que des `transform` et des `opacity` en continu (voir
 * scenes.css, « Fonds par onglet ») ; le plan se trace une fois, puis ne bouge
 * plus.
 *
 * Le calque est collant (`position: sticky`) et de hauteur nulle : il accompagne
 * le défilement sans occuper de place, et reste confiné à la zone de contenu au
 * lieu de déborder sur la barre latérale. Effets sobres : il disparaît ;
 * mouvement réduit ou appareil économe : il reste, immobile.
 */
export default function FondVivant({ humeur = "neutre", scene = null }) {
  return (
    <div className="fond-vivant" data-humeur={humeur} data-econome={appareilEconome() ? "" : undefined} aria-hidden="true">
      <div className="fond-vivant-scene">
        <span className="fond-vivant-nappe fond-vivant-a" />
        <span className="fond-vivant-nappe fond-vivant-b" />
        <span className="fond-vivant-nappe fond-vivant-c" />
        {scene === "bourse" && <Chandeliers />}
        {scene === "livrets" && <Bulles />}
        {scene === "immobilier" && <PlanMaison />}
        {scene === "coffre" && <MetalBrosse />}
      </div>
    </div>
  );
}

/** Nombre pseudo-aléatoire stable (0 à 1) : le décor est le même à chaque rendu. */
function alea(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* ── Bourse : chandeliers ─────────────────────────────────────────────────── */

const NB_CHANDELIERS = 44;
const PAS_CHANDELIER = 20;
/** Une marche au hasard, calculée une fois : ouverture, clôture, mèches. */
const CHANDELIERS = (() => {
  const liste = [];
  let cours = 150;
  for (let i = 0; i < NB_CHANDELIERS; i++) {
    const ouverture = cours;
    // Légère pente montante : sur un fond, une courbe qui s'effondre inquiète.
    const cloture = Math.max(40, Math.min(250, ouverture + (alea(i) - 0.46) * 58));
    const haut = Math.max(ouverture, cloture) + alea(i + 100) * 22;
    const bas = Math.min(ouverture, cloture) - alea(i + 200) * 22;
    liste.push({ ouverture, cloture, haut, bas });
    cours = cloture;
  }
  return liste;
})();

function Chandeliers() {
  const largeur = NB_CHANDELIERS * PAS_CHANDELIER;
  // Deux fois la même série : la piste glisse de la moitié de sa largeur, la
  // boucle ne se voit pas.
  return (
    <div className="fond-decor fond-chandeliers">
      <svg className="fond-chandeliers-piste" viewBox={`0 0 ${largeur * 2} 300`} preserveAspectRatio="none" focusable="false">
        {[0, 1].map((copie) =>
          CHANDELIERS.map((c, i) => {
            const x = copie * largeur + i * PAS_CHANDELIER + PAS_CHANDELIER / 2;
            const hausse = c.cloture >= c.ouverture;
            const y = (v) => 290 - v;
            return (
              <g key={`${copie}-${i}`} className={hausse ? "chandelier-hausse" : "chandelier-baisse"}>
                <line x1={x} x2={x} y1={y(c.haut)} y2={y(c.bas)} />
                <rect
                  x={x - 5}
                  y={y(Math.max(c.ouverture, c.cloture))}
                  width="10"
                  height={Math.max(3, Math.abs(c.cloture - c.ouverture))}
                  rx="1.5"
                />
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}

/* ── Livrets : bulles ─────────────────────────────────────────────────────── */

const BULLES = Array.from({ length: 13 }, (_, i) => ({
  gauche: 4 + alea(i + 7) * 92,
  taille: 14 + alea(i + 31) * 46,
  duree: 15 + alea(i + 53) * 16,
  retard: -alea(i + 79) * 28,
  derive: (alea(i + 97) - 0.5) * 90,
}));

function Bulles() {
  return (
    <div className="fond-decor fond-bulles">
      {BULLES.map((b, i) => (
        <span
          key={i}
          className="fond-bulle"
          style={{
            left: `${b.gauche.toFixed(1)}%`,
            width: `${b.taille.toFixed(0)}px`,
            height: `${b.taille.toFixed(0)}px`,
            animationDuration: `${b.duree.toFixed(1)}s`,
            animationDelay: `${b.retard.toFixed(1)}s`,
            "--derive": `${b.derive.toFixed(0)}px`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Immobilier : plan de maison ──────────────────────────────────────────── */

/**
 * Les traits du plan, dans l'ordre où un dessinateur les poserait : les murs
 * porteurs, les cloisons, puis les ouvertures et les cotes. `pathLength="1"`
 * ramène chaque tracé à une longueur de 1, ce qui permet de tous les dessiner
 * avec la même règle CSS.
 */
const TRAITS_PLAN = [
  // Murs extérieurs.
  { d: "M20,30 H380 V230 H20 Z", gros: true },
  // Cloisons.
  { d: "M150,30 V132" },
  { d: "M150,168 V230" },
  { d: "M150,132 H232" },
  { d: "M268,132 H380" },
  { d: "M268,132 V230" },
  { d: "M20,150 H96" },
  // Portes : le battant et l'arc de son débattement.
  { d: "M150,132 V168 M150,168 A36,36 0 0 0 186,132", fin: true },
  { d: "M232,132 H268 M232,132 A36,36 0 0 1 268,168", fin: true },
  { d: "M96,150 H132 M96,150 A36,36 0 0 0 132,186", fin: true },
  // Fenêtres : un double trait dans l'épaisseur du mur.
  { d: "M52,26 H118 M52,34 H118 M196,26 H262 M196,34 H262 M300,26 H352 M300,34 H352", fin: true },
  { d: "M384,60 V112 M376,60 V112 M16,180 V214 M24,180 V214", fin: true },
  // Escalier.
  { d: "M300,150 H360 V214 H300 Z M312,150 V214 M324,150 V214 M336,150 V214 M348,150 V214", fin: true },
  // Cotes.
  { d: "M20,248 H380 M20,243 V253 M380,243 V253 M150,243 V253", fin: true },
  { d: "M396,30 V230 M391,30 H401 M391,230 H401", fin: true },
];

function PlanMaison() {
  return (
    <div className="fond-decor fond-plan">
      <svg viewBox="0 0 410 262" focusable="false">
        {TRAITS_PLAN.map((t, i) => (
          <path
            key={i}
            d={t.d}
            pathLength="1"
            className={`plan-trait ${t.gros ? "plan-trait-gros" : ""} ${t.fin ? "plan-trait-fin" : ""}`}
            style={{ "--i": i }}
          />
        ))}
      </svg>
    </div>
  );
}

/* ── Coffre : métal brossé ────────────────────────────────────────────────── */

function MetalBrosse() {
  return (
    <div className="fond-decor fond-metal">
      <span className="fond-metal-cadran" />
      <span className="fond-metal-reflet" />
    </div>
  );
}
