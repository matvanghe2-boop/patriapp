import { useId, useMemo } from "react";

/**
 * Primitives graphiques écrites à la main, sans recharts.
 *
 * POURQUOI PAS RECHARTS : la bibliothèque pèse 460 Ko et monte un arbre React
 * complet par graphique. C'est un prix raisonnable pour la courbe principale du
 * Dashboard ; c'en est un absurde pour une micro-courbe répétée sur chaque
 * ligne d'un tableau de positions, ou pour un anneau de progression qui n'est
 * qu'un arc de cercle.
 *
 * Ces composants sont volontairement pauvres : pas d'axes, pas de légende, pas
 * d'infobulle. Ils montrent une FORME. Dès qu'il faut lire une valeur précise,
 * c'est le graphique complet qu'il faut, pas celui-ci.
 *
 * Tous héritent de la couleur par `currentColor` : posés dans un conteneur
 * teinté (`teinte-violet`, `text-emerald-400`…), ils prennent la couleur du
 * domaine sans qu'on ait à la leur passer.
 */

/** Ramène une série de nombres dans un viewBox de `largeur` × `hauteur`. */
function versPoints(valeurs, largeur, hauteur, marge = 2) {
  const n = valeurs.length;
  if (n < 2) return [];
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  // Série plate : on la centre au lieu de diviser par zéro.
  const etendue = max - min || 1;
  const h = hauteur - marge * 2;
  return valeurs.map((v, i) => [
    (i / (n - 1)) * largeur,
    marge + h - ((v - min) / etendue) * h,
  ]);
}

/**
 * Micro-courbe de tendance, pour une ligne de tableau.
 *
 * `vector-effect="non-scaling-stroke"` est ce qui empêche le trait de se
 * déformer quand le viewBox est étiré par `preserveAspectRatio="none"` —
 * le défaut classique des sparklines faites à la main : sans lui, une courbe
 * large et basse produit un trait épais à l'horizontale et fin à la verticale.
 */
export function Sparkline({ valeurs = [], largeur = 100, hauteur = 26, className = "" }) {
  const points = useMemo(
    () => versPoints(valeurs, largeur, hauteur),
    [valeurs, largeur, hauteur]
  );
  if (points.length < 2) return null;

  const dernier = points[points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${largeur} ${hauteur}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Le point final dit « c'est ici qu'on en est » — sans lui, l'œil doit
          chercher de quel côté la courbe se termine. */}
      <circle cx={dernier[0]} cy={dernier[1]} r="2.2" fill="currentColor" />
    </svg>
  );
}

/**
 * Courbe d'évolution avec aire dégradée, jalons et point final accentué.
 *
 * Trois ajouts par rapport à une simple ligne, et chacun répond à une question
 * distincte : l'aire donne du poids à la grandeur, le point final indique où
 * l'on en est, les jalons replacent les objectifs atteints dans le temps.
 */
export function CourbeEvolution({
  valeurs = [],
  jalons = [],
  largeur = 320,
  hauteur = 96,
  className = "",
  libelle,
}) {
  const idDegrade = useId();
  const points = useMemo(
    () => versPoints(valeurs, largeur, hauteur, 6),
    [valeurs, largeur, hauteur]
  );
  if (points.length < 2) return null;

  const ligne = points.map(([x, y]) => `${x},${y}`).join(" ");
  const aire = `${ligne} ${largeur},${hauteur} 0,${hauteur}`;
  const dernier = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${largeur} ${hauteur}`}
      className={className}
      role={libelle ? "img" : undefined}
      aria-label={libelle}
      aria-hidden={libelle ? undefined : "true"}
      focusable="false"
    >
      <defs>
        {/* L'identifiant vient de `useId` : deux courbes sur le même écran
            partageraient sinon le même dégradé, et la seconde écraserait la
            première — un bug invisible à la relecture et évident à l'écran. */}
        <linearGradient id={idDegrade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      <polygon points={aire} fill={`url(#${idDegrade})`} />
      <polyline
        points={ligne}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {jalons.map((j) => {
        const i = Math.max(0, Math.min(points.length - 1, j.index));
        const [x, y] = points[i];
        return (
          <g key={j.id ?? j.index}>
            <line
              x1={x}
              y1="0"
              x2={x}
              y2={hauteur}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.4"
            />
            <circle cx={x} cy={y} r="3" fill="rgb(var(--c-slate-950))" stroke="currentColor" strokeWidth="1.6" />
          </g>
        );
      })}

      <circle cx={dernier[0]} cy={dernier[1]} r="4" fill="currentColor" />
      <circle cx={dernier[0]} cy={dernier[1]} r="8" fill="currentColor" opacity="0.18" />
    </svg>
  );
}

/**
 * Anneau de progression.
 *
 * Remplace la barre de 6 px pour les objectifs datés : sur le seul écran de
 * l'application qui mesure une distance à parcourir, l'anneau tient la
 * comparaison entre plusieurs cibles dans un même coup d'œil, et libère son
 * centre pour le pourcentage.
 *
 * `atteint` change la nature de l'affichage, pas seulement sa couleur : c'est
 * le seul moment réjouissant de cette application, et jusqu'ici il ne se
 * passait rien quand la barre touchait 100 %.
 */
export function AnneauProgression({
  valeur = 0,
  taille = 64,
  epaisseur = 6,
  atteint = false,
  libelle,
  className = "",
  children,
}) {
  const pc = Math.max(0, Math.min(100, Number.isFinite(valeur) ? valeur : 0));
  const r = (taille - epaisseur) / 2;
  const circonference = 2 * Math.PI * r;
  const rempli = (pc / 100) * circonference;

  return (
    <svg
      viewBox={`0 0 ${taille} ${taille}`}
      width={taille}
      height={taille}
      className={`${atteint ? "anneau-atteint" : ""} ${className}`}
      role="img"
      aria-label={libelle ? `${libelle} : ${Math.round(pc)} %` : `${Math.round(pc)} %`}
      focusable="false"
    >
      <circle
        cx={taille / 2}
        cy={taille / 2}
        r={r}
        fill="none"
        stroke="rgb(var(--c-slate-800))"
        strokeWidth={epaisseur}
      />
      <circle
        cx={taille / 2}
        cy={taille / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={epaisseur}
        strokeDasharray={`${rempli} ${circonference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
        className="anneau-arc"
      />
      {children ?? (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="font-data"
          style={{ fill: "rgb(var(--c-slate-100))", fontSize: taille * 0.22 }}
        >
          {Math.round(pc)} %
        </text>
      )}
    </svg>
  );
}

/**
 * Anneau de répartition, avec le total en son centre.
 *
 * Le camembert obligeait à aller chercher le total ailleurs sur l'écran.
 * Le creuser libère exactement la place où ce chiffre est attendu.
 */
export function AnneauRepartition({
  parts = [],
  taille = 132,
  epaisseur = 16,
  centre,
  libelle,
  className = "",
}) {
  const total = parts.reduce((s, p) => s + (p.valeur || 0), 0);
  const r = (taille - epaisseur) / 2;
  const circonference = 2 * Math.PI * r;

  // `reduce` et non un accumulateur muté pendant le rendu : le compilateur
  // React refuse — à juste titre — une variable réassignée après le rendu, et
  // le décalage cumulé de chaque arc se dérive très bien de ceux d'avant.
  const arcs = parts.reduce((acc, p) => {
    const longueur = total > 0 ? ((p.valeur || 0) / total) * circonference : 0;
    const debut = acc.reduce((s, a) => s + a.longueur, 0);
    return [...acc, { ...p, longueur, decalage: -debut }];
  }, []);

  return (
    <svg
      viewBox={`0 0 ${taille} ${taille}`}
      width={taille}
      height={taille}
      className={className}
      role="img"
      aria-label={libelle}
      focusable="false"
    >
      <circle
        cx={taille / 2}
        cy={taille / 2}
        r={r}
        fill="none"
        stroke="rgb(var(--c-slate-800))"
        strokeWidth={epaisseur}
      />
      {arcs.map((a) => (
        <circle
          key={a.id ?? a.libelle}
          cx={taille / 2}
          cy={taille / 2}
          r={r}
          fill="none"
          stroke={a.couleur}
          strokeWidth={epaisseur}
          strokeDasharray={`${a.longueur} ${circonference}`}
          strokeDashoffset={a.decalage}
          transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
        />
      ))}
      {centre}
    </svg>
  );
}

/**
 * Calendrier de l'année : une case par jour, teintée selon la variation.
 *
 * `useDailySnapshot` pose un point de patrimoine net par jour, et personne ne
 * les regardait autrement qu'en courbe. Cette grille répond à une question que
 * la courbe ne sait pas poser — à quoi ressemble une année ? — et surtout elle
 * rend visibles les JOURS SANS RELEVÉ, ceux où l'application n'a pas été
 * ouverte. Une courbe les relie en silence, et laisse croire à une continuité
 * qui n'existe pas.
 *
 * @param {{date: string, variation: number|null}[]} jours
 */
export function CalendrierAnnuel({ jours = [], className = "" }) {
  // Les variations sont réparties en quatre crans par rapport à l'écart type,
  // et non par seuils absolus : un patrimoine de 5 000 € et un de 500 000 € ne
  // bougent pas des mêmes montants, mais la FORME de l'année est la même.
  const crans = useMemo(() => {
    const v = jours.map((j) => j.variation).filter((x) => Number.isFinite(x) && x !== 0);
    if (v.length === 0) return { p1: 1, p2: 1, p3: 1 };
    const abs = v.map(Math.abs).sort((a, b) => a - b);
    const q = (f) => abs[Math.min(abs.length - 1, Math.floor(abs.length * f))];
    return { p1: q(0.33), p2: q(0.66), p3: q(0.9) };
  }, [jours]);

  const niveau = (variation) => {
    if (!Number.isFinite(variation) || variation === 0) return 0;
    const a = Math.abs(variation);
    const signe = variation > 0 ? 1 : -1;
    if (a >= crans.p3) return signe * 3;
    if (a >= crans.p2) return signe * 2;
    return signe * 1;
  };

  return (
    <div className={`calendrier-annuel ${className}`} role="img" aria-label="Variation quotidienne du patrimoine sur l'année">
      {jours.map((j) => (
        <i
          key={j.date}
          data-n={j.variation == null ? undefined : niveau(j.variation)}
          title={j.date}
        />
      ))}
    </div>
  );
}
