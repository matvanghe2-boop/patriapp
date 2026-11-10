import { useEffect, useId, useMemo, useRef, useState } from "react";
import { History, Play, Pause } from "lucide-react";
import { Card, CardLabel } from "./ui";
import Montant from "./Montant";
import { AnneauRepartition } from "./graphiques";
import { eur } from "../lib/finance";

/**
 * Remonter le temps : rejouer son patrimoine mois après mois.
 *
 * La courbe du Dashboard montre le chemin d'un coup ; ce curseur le refait à
 * la main. À chaque mois choisi, le patrimoine net de la fin du mois roule
 * jusqu'à sa valeur, la courbe s'allume jusqu'à ce point, et l'anneau montre
 * la part de la Bourse à ce moment-là. « Rejouer » parcourt toute l'histoire,
 * un mois par battement.
 *
 * Rien n'est recalculé : ce sont les relevés quotidiens (dernier relevé de
 * chaque mois) et l'historique du portefeuille, tels qu'ils sont enregistrés.
 */
const PAS_LECTURE_MS = 750;
const LARGEUR = 520;
const HAUTEUR = 120;
const MARGE = 8;

function moisDe(iso) {
  return String(iso).slice(0, 7);
}

function libelleMois(cle) {
  return new Date(`${cle}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** Dernière valeur de chaque mois, dans l'ordre. */
function finsDeMois(points, champ) {
  const parMois = new Map();
  for (const p of points || []) {
    const v = Number(p?.[champ]);
    if (!p?.date || !Number.isFinite(v)) continue;
    const cle = moisDe(p.date);
    const connu = parMois.get(cle);
    if (!connu || p.date > connu.date) parMois.set(cle, { date: p.date, valeur: v });
  }
  return [...parMois.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([cle, p]) => ({ cle, ...p }));
}

export default function RemonterLeTemps({ historyPast = [], bourseHistory = [], patrimoineNet = 0 }) {
  const mois = useMemo(() => finsDeMois(historyPast, "value"), [historyPast]);
  const bourseParMois = useMemo(
    () => new Map(finsDeMois(bourseHistory, "valeur").map((p) => [p.cle, p.valeur])),
    [bourseHistory]
  );
  const [index, setIndex] = useState(null);
  const [lecture, setLecture] = useState(false);
  const idDegrade = useId();
  const minuterie = useRef(0);

  const dernier = mois.length - 1;
  const i = index == null ? dernier : Math.min(index, dernier);

  // Lecture : un mois par battement, jusqu'au dernier.
  useEffect(() => {
    if (!lecture) return undefined;
    minuterie.current = setTimeout(() => {
      if (i >= dernier) setLecture(false);
      else setIndex(i + 1);
    }, PAS_LECTURE_MS);
    return () => clearTimeout(minuterie.current);
  }, [lecture, i, dernier]);

  const points = useMemo(() => {
    if (mois.length < 2) return [];
    const valeurs = mois.map((m) => m.valeur);
    const min = Math.min(...valeurs);
    const max = Math.max(...valeurs);
    const etendue = max - min || 1;
    return mois.map((m, k) => [
      MARGE + (k / (mois.length - 1)) * (LARGEUR - 2 * MARGE),
      MARGE + (1 - (m.valeur - min) / etendue) * (HAUTEUR - 2 * MARGE),
    ]);
  }, [mois]);

  if (mois.length < 3) return null;

  const courant = mois[i];
  const bourse = bourseParMois.get(courant.cle);
  const horsBourse = bourse != null ? Math.max(0, courant.valeur - bourse) : null;
  const ecart = patrimoineNet - courant.valeur;
  const ligne = points.map(([x, y]) => `${x},${y}`).join(" ");
  const parcouru = points.slice(0, i + 1).map(([x, y]) => `${x},${y}`).join(" ");
  const [cx, cy] = points[i];

  const lancer = () => {
    if (lecture) {
      setLecture(false);
      return;
    }
    if (i >= dernier) setIndex(0);
    setLecture(true);
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <CardLabel icon={History}>Remonter le temps</CardLabel>
        <button
          type="button"
          onClick={lancer}
          className="btn-flash flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-emerald-400/50 hover:text-emerald-200"
        >
          {lecture ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
          {lecture ? "Pause" : "Rejouer"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-micro uppercase tracking-wider text-slate-500 first-letter:uppercase">{libelleMois(courant.cle)}</p>
          <Montant valeur={courant.valeur} decimales={0} rouleaux className="block text-chiffre text-slate-50" />
          <p className="text-mini text-slate-400 mt-1">
            {i === dernier ? (
              "Ce mois-ci"
            ) : (
              <>
                Depuis :{" "}
                <span className={`ghost-blur font-data ${ecart >= 0 ? "etat-ok" : "etat-critique"}`}>
                  {ecart >= 0 ? "+" : "−"}
                  {eur(Math.abs(ecart))}
                </span>
              </>
            )}
          </p>
        </div>
        {bourse != null && (
          <div className="flex items-center gap-3 remonter-anneau">
            <AnneauRepartition
              taille={88}
              epaisseur={12}
              libelle={`Répartition en ${libelleMois(courant.cle)}`}
              parts={[
                { id: "bourse", libelle: "Bourse", valeur: bourse, couleur: "rgb(var(--c-violet-400))" },
                { id: "hors", libelle: "Hors bourse", valeur: horsBourse, couleur: "rgb(var(--c-emerald-400))" },
              ]}
            />
            <dl className="text-micro space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-400" aria-hidden="true" />
                <dt className="text-slate-500">Bourse</dt>
                <dd className="font-data text-slate-200 ghost-blur">{eur(bourse)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
                <dt className="text-slate-500">Hors bourse</dt>
                <dd className="font-data text-slate-200 ghost-blur">{eur(horsBourse)}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {/* La courbe s'étire sur toute la largeur de la carte (`none`) ; le
          repère est posé en HTML par-dessus, pour rester rond. */}
      <div className="relative mt-3 h-28 w-full ghost-blur">
        <svg
          viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full text-emerald-400"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={idDegrade} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline points={ligne} fill="none" stroke="rgb(var(--c-slate-700))" strokeWidth="1.5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <polygon points={`${parcouru} ${cx},${HAUTEUR} ${points[0][0]},${HAUTEUR}`} fill={`url(#${idDegrade})`} />
          <polyline points={parcouru} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          className="remonter-repere-ligne"
          style={{ left: `${(cx / LARGEUR) * 100}%` }}
          aria-hidden="true"
        />
        <span
          className="remonter-repere-point"
          style={{ left: `${(cx / LARGEUR) * 100}%`, top: `${(cy / HAUTEUR) * 100}%` }}
          aria-hidden="true"
        />
      </div>

      <input
        type="range"
        min={0}
        max={dernier}
        value={i}
        onChange={(e) => {
          setLecture(false);
          setIndex(Number(e.target.value));
        }}
        aria-label="Mois affiché"
        aria-valuetext={libelleMois(courant.cle)}
        className="remonter-curseur w-full mt-2"
      />
      <div className="flex justify-between text-micro text-slate-500 mt-1">
        <span className="first-letter:uppercase">{libelleMois(mois[0].cle)}</span>
        <span className="first-letter:uppercase">{libelleMois(mois[dernier].cle)}</span>
      </div>
    </Card>
  );
}
