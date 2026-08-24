import { useMemo, useState } from "react";
import { LineChart } from "lucide-react";
import { Card, CardLabel } from "./ui";
import { situerTaux, SERIES } from "../lib/histoireTaux";
import { useMaintenant } from "../lib/useMaintenant";

/**
 * Histoire des taux réglementés — onglet Livrets & Épargne, sous-onglet Taux.
 *
 * PLACÉ ICI ET PAS AILLEURS : `RatesHub` donne le taux du JOUR. Il ne dit pas
 * si le Livret A sort d'un plus haut de quinze ans ou d'un plancher — et c'est
 * précisément ce qui décide s'il faut y laisser son matelas ou le déplacer. Le
 * mettre à côté du taux courant est la seule position où il répond à la
 * question qu'on se pose en le lisant.
 *
 * C'est la même idée que les ratios historiques du screener, appliquée à
 * l'épargne réglementée : la valeur du jour replacée dans sa série.
 *
 * LA COURBE EST EN ESCALIER, pas lissée. Ces taux sont fixés par arrêté et
 * tiennent des mois entiers : les relier par des segments obliques suggérerait
 * une progression continue qui n'existe pas.
 */
export default function HistoireTaux() {
  const [cle, setCle] = useState("livret-a");
  const maintenant = useMaintenant(3_600_000);
  const situation = useMemo(() => situerTaux(cle), [cle]);

  if (!situation) return null;

  const { libelle, courant, moyenne, min, max, rang, points } = situation;

  // Tracé en escalier : chaque palier tient jusqu'au suivant.
  //
  // La borne de droite vient de `useMaintenant` et non de `Date.now()` : lue
  // pendant le rendu, l'heure courante rendrait le composant impur — deux
  // rendus consécutifs sans changement d'état produiraient un tracé différent.
  const L = 300;
  const H = 60;
  const t0 = new Date(points[0].date).getTime();
  const t1 = maintenant;
  const x = (d) => ((new Date(d).getTime() - t0) / (t1 - t0)) * L;
  const y = (t) => H - 4 - ((t - min) / (max - min || 1)) * (H - 12);

  let chemin = `M ${x(points[0].date).toFixed(1)},${y(points[0].taux).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    chemin += ` H ${x(points[i].date).toFixed(1)} V ${y(points[i].taux).toFixed(1)}`;
  }
  chemin += ` H ${L}`;

  const haut = rang >= 66;
  const bas = rang <= 33;

  return (
    <Card accent="teinte-indigo carte-domaine">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel icon={LineChart}>Le taux dans son histoire</CardLabel>
        <div className="flex gap-1">
          {Object.entries(SERIES).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setCle(k)}
              aria-pressed={cle === k}
              className={`btn-flash text-micro rounded-lg border px-2.5 py-1 transition-colors ${
                cle === k
                  ? "border-indigo-400/60 bg-indigo-400/10 text-indigo-200"
                  : "border-slate-700 text-slate-500 hover:text-slate-300"
              }`}
            >
              {v.libelle}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" className="w-full h-16 text-indigo-400" aria-hidden="true">
          {/* Moyenne pondérée par la durée, en repère : c'est elle qui dit si le
              taux du jour est au-dessus ou en dessous de l'ordinaire. */}
          <line x1="0" y1={y(moyenne)} x2={L} y2={y(moyenne)} stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />
          <path d={chemin} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          <circle cx={L} cy={y(courant)} r="3.5" fill="currentColor" />
        </svg>

        <div className="flex justify-between text-micro text-slate-600 mt-1">
          <span>{points[0].date.slice(0, 4)}</span>
          <span>aujourd'hui</span>
        </div>
      </div>

      <p className="text-corps text-slate-300 mt-3">
        <b className="font-data">{courant.toFixed(2).replace(".", ",")} %</b> aujourd'hui, contre{" "}
        <b className="font-data">{moyenne.toFixed(2).replace(".", ",")} %</b> de moyenne sur quinze ans.{" "}
        <span className={haut ? "etat-attention" : bas ? "etat-ok" : "text-slate-400"}>
          {haut
            ? `Le ${libelle} est dans le haut de sa fourchette historique.`
            : bas
              ? `Le ${libelle} est dans le bas de sa fourchette historique.`
              : `Le ${libelle} est dans sa moyenne historique.`}
        </span>
      </p>

      <p className="text-micro text-slate-600 mt-2">
        Moyenne <strong>pondérée par la durée</strong> de chaque palier, et non moyenne des paliers :
        un taux qui a tenu deux ans ne pèse pas comme un autre qui a duré six mois. Les taux sont
        fixés par arrêté et saisis à la main — deux lignes à ajouter par an.
      </p>
    </Card>
  );
}
