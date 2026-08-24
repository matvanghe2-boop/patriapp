import { useId, useMemo, useRef, useState } from "react";

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

/* ═══════════════════════════════════════════════════════════════════════════
   CALENDRIER ANNUEL
   ═══════════════════════════════════════════════════════════════════════════ */

const JOURS_SEMAINE = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const MOIS_COURTS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

/**
 * Indice du jour dans une semaine commençant le LUNDI (0 = lundi, 6 = dimanche).
 *
 * `getDay()` compte à partir du dimanche : le décalage `+6 % 7` le ramène à la
 * convention française. La date est reconstruite composant par composant, et
 * non parsée depuis la chaîne ISO, parce que `new Date("2026-03-12")` est
 * interprétée en UTC et bascule d'un jour à l'ouest de Greenwich.
 */
export function indexJourSemaine(iso) {
  const [a, m, j] = String(iso).split("-").map(Number);
  return (new Date(a, m - 1, j).getDay() + 6) % 7;
}

/**
 * Découpe la série de jours en colonnes de semaine alignées sur le vrai jour
 * de la semaine, et repère les colonnes qui ouvrent un mois.
 */
export function decouperEnSemaines(jours = []) {
  if (jours.length === 0) return [];

  const semaines = [];
  // Cases vides avant le premier jour : c'est ce décalage qui garantit qu'une
  // ligne corresponde toujours au même jour de la semaine.
  let courante = new Array(indexJourSemaine(jours[0].date)).fill(null);

  for (const jour of jours) {
    courante.push(jour);
    if (courante.length === 7) {
      semaines.push(courante);
      courante = [];
    }
  }
  if (courante.length > 0) {
    semaines.push([...courante, ...new Array(7 - courante.length).fill(null)]);
  }

  return semaines.map((jours7, i) => {
    const premier = jours7.find(Boolean);
    const mois = premier ? Number(premier.date.slice(5, 7)) : null;
    const precedent = i > 0 ? semaines[i - 1].find(Boolean) : null;
    const moisPrecedent = precedent ? Number(precedent.date.slice(5, 7)) : null;
    return {
      jours: jours7,
      mois,
      // Une colonne « ouvre » un mois quand son premier jour réel appartient à
      // un mois différent de celui de la colonne précédente. C'est ce drapeau
      // qui porte à la fois le filet de séparation et l'étiquette.
      ouvreMois: mois != null && mois !== moisPrecedent,
    };
  });
}

/** « 2026-03-12 » → « jeudi 12 mars 2026 ». */
export function libelleDate(iso) {
  const [a, m, j] = String(iso).split("-").map(Number);
  return new Date(a, m - 1, j).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Total de variation par mois, pour la rangée de sous-totaux. */
export function totauxParMois(jours = []) {
  const totaux = new Map();
  for (const j of jours) {
    if (!Number.isFinite(j.variation)) continue;
    const mois = Number(j.date.slice(5, 7));
    totaux.set(mois, (totaux.get(mois) || 0) + j.variation);
  }
  return totaux;
}

const formatDefaut = (n) => `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString("fr-FR")} €`;
const formatCourt = (n) => {
  const a = Math.abs(n);
  const signe = n > 0 ? "+" : n < 0 ? "−" : "";
  if (a >= 1000) return `${signe}${(a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(".", ",")} k€`;
  return `${signe}${Math.round(a)} €`;
};

/**
 * Phrase décrivant une case, employée telle quelle en info-bulle et dans la
 * ligne de détail.
 *
 * Elle dit systématiquement SUR QUELLE PÉRIODE porte l'écart. C'est ce qui
 * manquait et ce qui produisait un contresens : une variation affichée un
 * dimanche, alors que les marchés sont fermés et que rien n'avait bougé ce
 * jour-là. L'écart était réel, mais il appartenait au dernier jour ouvré.
 */
export function decrireJour(jour, format = formatDefaut) {
  if (!jour) return "";
  const date = libelleDate(jour.date);
  // Trois états distincts, et les confondre serait mensonger : « marché
  // fermé » n'est pas « pas de relevé », qui n'est pas « variation nulle ».
  if (jour.marcheFerme) return `${date} — marché fermé`;
  if (jour.variation == null) return `${date} — pas de relevé`;

  const morceaux = [`${date} — ${format(jour.variation)}`];
  if (jour.joursCouverts > 1 && jour.depuis) {
    morceaux.push(`depuis le ${libelleDate(jour.depuis)} (${jour.joursCouverts} jours)`);
  }
  return morceaux.join(" · ");
}

/**
 * Calendrier de l'année : une case par jour, teintée selon la variation.
 *
 * `useDailySnapshot` pose un point de patrimoine net par jour, et personne ne
 * les regardait autrement qu'en courbe. Cette grille répond à une question que
 * la courbe ne sait pas poser — à quoi ressemble une année ? — et surtout elle
 * rend visibles les JOURS SANS RELEVÉ, ceux où l'application n'a pas été
 * ouverte. Une courbe les relie en silence et laisse croire à une continuité
 * qui n'existe pas.
 *
 * L'INTENSITÉ VIENT DE `variationParJour`, PAS DE `variation`. Un relevé qui
 * suit trois jours de silence porte l'écart des trois jours ; le peindre à
 * pleine intensité produirait une case criarde pour un rythme ordinaire. La
 * couleur montre donc une cadence, l'info-bulle donne le montant exact et la
 * période qu'il recouvre.
 *
 * @param {{date, variation, variationParJour, depuis, joursCouverts, weekend}[]} jours
 * @param {Set<string>} semainesAgitees  Dates (une par semaine) de forte volatilité de marché.
 */
export function CalendrierAnnuel({
  jours = [],
  formatVariation = formatDefaut,
  semainesAgitees = null,
  className = "",
}) {
  const [survole, setSurvole] = useState(null);
  const [focusIso, setFocusIso] = useState(null);
  const grilleRef = useRef(null);

  const semaines = useMemo(() => decouperEnSemaines(jours), [jours]);
  const totaux = useMemo(() => totauxParMois(jours), [jours]);
  // « Relevé » = l'application est passée ce jour-là. C'est distinct de « porte
  // une variation », qu'un jour de fermeture n'a jamais.
  const reels = useMemo(() => jours.filter((j) => j.releve ?? j.variation != null), [jours]);

  /*
   * Les variations sont réparties en trois crans par rapport à la DISTRIBUTION
   * observée, et non par seuils absolus : un patrimoine de 5 000 € et un de
   * 500 000 € ne bougent pas des mêmes montants, mais la forme de leur année
   * est la même. Des seuils fixes ne coloreraient rien chez l'un et tout chez
   * l'autre.
   */
  const crans = useMemo(() => {
    const v = jours
      .map((j) => j.variationParJour ?? j.variation)
      .filter((x) => Number.isFinite(x) && x !== 0);
    if (v.length === 0) return { p1: 1, p2: 1, p3: 1 };
    const abs = v.map(Math.abs).sort((a, b) => a - b);
    const q = (f) => abs[Math.min(abs.length - 1, Math.floor(abs.length * f))];
    return { p1: q(0.33), p2: q(0.66), p3: q(0.9) };
  }, [jours]);

  const niveau = (jour) => {
    const v = jour.variationParJour ?? jour.variation;
    if (!Number.isFinite(v) || v === 0) return 0;
    const a = Math.abs(v);
    const signe = v > 0 ? 1 : -1;
    if (a >= crans.p3) return signe * 3;
    if (a >= crans.p2) return signe * 2;
    return signe * 1;
  };

  const actif = survole || reels.find((j) => j.date === focusIso) || null;
  const moisActif = actif ? Number(actif.date.slice(5, 7)) : null;

  /**
   * Déplacement au clavier.
   *
   * Haut/bas suivent la colonne, c'est-à-dire un jour ; gauche/droite sautent
   * d'une semaine, c'est-à-dire sept jours. C'est la géométrie de la grille,
   * pas une convention arbitraire : la flèche va là où l'œil regarde.
   *
   * Une seule case est dans l'ordre de tabulation (`tabIndex` mobile) — sans
   * quoi traverser le calendrier au clavier demanderait 365 tabulations.
   */
  const auClavier = (e) => {
    const pas = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
    if (pas == null && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();

    const index = jours.findIndex((j) => j.date === (focusIso ?? actif?.date));
    const depart = index >= 0 ? index : 0;
    const cible =
      e.key === "Home" ? 0
      : e.key === "End" ? jours.length - 1
      : Math.max(0, Math.min(jours.length - 1, depart + pas));

    const jour = jours[cible];
    if (!jour) return;
    setFocusIso(jour.date);
    setSurvole(null);
    grilleRef.current?.querySelector(`[data-date="${jour.date}"]`)?.focus();
  };

  if (semaines.length === 0) return null;

  const premierFocusable = focusIso ?? jours[jours.length - 1]?.date;

  return (
    <div className={`calendrier ${className}`} data-mois-actif={moisActif ?? undefined}>
      <div className="calendrier-grille">
        {/* Repères de jours : un sur deux. Sept étiquettes sur une colonne de
            sept cases de 11 px se chevaucheraient. */}
        <div className="calendrier-jours" aria-hidden="true">
          {JOURS_SEMAINE.map((j, i) => (
            <span key={j}>{i % 2 === 0 ? j : ""}</span>
          ))}
        </div>

        <div className="calendrier-defilement">
          {/* Étiquettes de mois, alignées sur la colonne qui ouvre le mois.
              Elles débordent volontairement sur les colonnes suivantes : une
              semaine fait 11 px de large, « sept. » n'y tiendrait jamais. */}
          <div className="calendrier-mois" aria-hidden="true">
            {semaines.map((s, i) => (
              <span key={i} data-mois={s.ouvreMois ? s.mois : undefined}>
                {s.ouvreMois ? MOIS_COURTS[s.mois - 1] : ""}
              </span>
            ))}
          </div>

          <div
            className="calendrier-semaines"
            ref={grilleRef}
            role="grid"
            aria-label={`Variation quotidienne du patrimoine, ${reels.length} jours relevés sur ${jours.length}. Flèches pour parcourir.`}
            onKeyDown={auClavier}
            onMouseLeave={() => setSurvole(null)}
          >
            {semaines.map((s, i) => {
              const premierReel = s.jours.find(Boolean);
              const agitee = Boolean(semainesAgitees && premierReel && semainesAgitees.has(premierReel.date));
              return (
                <div
                  key={i}
                  role="row"
                  className="calendrier-semaine"
                  data-ouvre-mois={s.ouvreMois || undefined}
                  data-agitee={agitee || undefined}
                >
                  {s.jours.map((jour, k) =>
                    jour ? (
                      <button
                        key={jour.date}
                        type="button"
                        role="gridcell"
                        data-date={jour.date}
                        data-n={jour.variation == null ? undefined : niveau(jour)}
                        data-mois={Number(jour.date.slice(5, 7))}
                        data-weekend={jour.weekend || undefined}
                        data-ferme={jour.marcheFerme || undefined}
                        // Une seule case dans l'ordre de tabulation : les
                        // flèches font le reste.
                        tabIndex={jour.date === premierFocusable ? 0 : -1}
                        title={decrireJour(jour, formatVariation)}
                        aria-label={decrireJour(jour, formatVariation)}
                        onMouseEnter={() => setSurvole(jour)}
                        onFocus={() => setFocusIso(jour.date)}
                      />
                    ) : (
                      <span key={`vide-${i}-${k}`} className="calendrier-hors-annee" aria-hidden="true" />
                    )
                  )}
                </div>
              );
            })}
          </div>

          {/* Sous-totaux mensuels : la grille dit la forme, ces chiffres disent
              l'ampleur. Même alignement que les étiquettes de mois. */}
          <div className="calendrier-totaux" aria-hidden="true">
            {semaines.map((s, i) => (
              <span key={i} data-mois={s.ouvreMois ? s.mois : undefined}>
                {s.ouvreMois && totaux.has(s.mois) ? (
                  <em className={totaux.get(s.mois) >= 0 ? "est-hausse" : "est-baisse"}>
                    {formatCourt(totaux.get(s.mois))}
                  </em>
                ) : (
                  ""
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/*
        Détail du jour visé — au survol comme au clavier.

        La zone conserve sa hauteur même vide : sans cela, le calendrier
        sauterait de quelques pixels au premier survol, ce qui déplacerait la
        case visée juste sous le curseur.
      */}
      <p className="calendrier-detail" aria-live="polite">
        {actif ? (
          <>
            <span className="calendrier-detail-date">{libelleDate(actif.date)}</span>
            {actif.marcheFerme ? (
              <span className="calendrier-detail-vide">marché fermé — aucune séance ce jour-là</span>
            ) : actif.variation == null ? (
              <span className="calendrier-detail-vide">pas de relevé ce jour-là</span>
            ) : (
              <>
                <span
                  className={`calendrier-detail-valeur ghost-blur ${
                    actif.variation > 0 ? "est-hausse" : actif.variation < 0 ? "est-baisse" : ""
                  }`}
                >
                  {formatVariation(actif.variation)}
                </span>
                {actif.joursCouverts > 1 && actif.depuis && (
                  <span className="calendrier-detail-note">
                    sur {actif.joursCouverts} jours, depuis le {libelleDate(actif.depuis)}
                  </span>
                )}
              </>
            )}
          </>
        ) : (
          <span className="calendrier-detail-invite">
            Survole une case, ou parcours au clavier avec les flèches.
          </span>
        )}
      </p>

      {/* Légende : sans elle, on devine ce que veut dire un vert foncé. */}
      <div className="calendrier-legende" aria-hidden="true">
        <span>baisse</span>
        <i data-n="-3" />
        <i data-n="-2" />
        <i data-n="-1" />
        <i data-n="0" />
        <i data-n="1" />
        <i data-n="2" />
        <i data-n="3" />
        <span>hausse</span>
        <span className="calendrier-legende-sep">
          <i className="calendrier-legende-vide" /> pas de relevé
        </span>
        <span className="calendrier-legende-sep">
          <i className="calendrier-legende-ferme" /> marché fermé
        </span>
      </div>
    </div>
  );
}

/**
 * Deux années empilées, pour comparer les saisons.
 *
 * Un patrimoine se lit mal sur douze mois : les creux de janvier et les
 * versements de fin d'année reviennent tous les ans, et on ne les reconnaît
 * qu'en les voyant se répéter.
 */
export function CalendrierCompare({ annees = [], formatVariation = formatDefaut, semainesAgitees = null, className = "" }) {
  if (annees.length === 0) return null;
  return (
    <div className={`calendrier-compare ${className}`}>
      {annees.map(({ an, jours }) => (
        <div key={an} className="calendrier-compare-annee">
          <span className="calendrier-compare-etiquette font-data">{an}</span>
          <CalendrierAnnuel jours={jours} formatVariation={formatVariation} semainesAgitees={semainesAgitees} />
        </div>
      ))}
    </div>
  );
}
