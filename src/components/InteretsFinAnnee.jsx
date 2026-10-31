import { useMemo, useState } from "react";
import { Coins, Check } from "lucide-react";
import { Card, CardLabel, PastilleEtat, CARD_THEMES } from "./ui";
import Montant from "./Montant";
import { lireNombre, todayIso } from "../lib/finance";
import { interetsFinAnnee } from "../lib/epargne";

/**
 * Intérêts de l'année écoulée, versés au 31 décembre.
 *
 * Tant qu'ils ne sont pas enregistrés, le solde suivi est faux d'autant et
 * l'année suivante se calcule sur une base trop basse. La carte apparaît de
 * janvier à mars, pré-remplie avec le calcul à la quinzaine : un geste suffit
 * si la banque a versé ce montant, et l'écart se lit sinon.
 */
export default function InteretsFinAnnee({ livrets = [], onMouvement }) {
  const lignes = useMemo(() => interetsFinAnnee(livrets, { aujourdhui: todayIso() }), [livrets]);
  const [saisies, setSaisies] = useState({});
  if (lignes.length === 0) return null;
  const annee = lignes[0].annee;
  const restants = lignes.filter((l) => l.verse == null).length;

  return (
    <Card accent={CARD_THEMES.indigo}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel icon={Coins}>Intérêts {annee} versés au 31 décembre</CardLabel>
        {restants > 0 ? (
          <PastilleEtat etat="attention">{restants} à enregistrer</PastilleEtat>
        ) : (
          <PastilleEtat etat="ok">Tout est enregistré</PastilleEtat>
        )}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {lignes.map(({ livret, estime, verse, ecart }) => (
          <li key={livret.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
            <span className="min-w-0 flex-1 basis-[10rem]">
              <span className="block text-corps text-slate-100">{livret.name}</span>
              <span className="block text-micro text-slate-500">
                Estimé à la quinzaine : <Montant valeur={estime} decimales={2} />
              </span>
            </span>
            {verse == null ? (
              <span className="flex items-center gap-1.5">
                <label htmlFor={`interets-${livret.id}`} className="sr-only">Intérêts versés sur {livret.name}</label>
                <input
                  id={`interets-${livret.id}`}
                  type="number"
                  step="0.01"
                  value={saisies[livret.id] ?? estime}
                  onChange={(e) => setSaisies((s) => ({ ...s, [livret.id]: e.target.value }))}
                  className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data text-right focus:outline-none focus:border-indigo-400/60"
                />
                <button
                  type="button"
                  onClick={() => {
                    const montant = lireNombre(saisies[livret.id] ?? estime);
                    if (montant > 0) onMouvement?.(livret.id, { date: `${annee}-12-31`, nature: "interets", montant });
                  }}
                  className="btn-flash inline-flex items-center gap-1 rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200 hover:bg-indigo-500/20"
                >
                  <Check size={12} aria-hidden="true" /> Enregistrer
                </button>
              </span>
            ) : (
              <span className="text-right text-xs">
                <span className="block text-slate-300">
                  Versé : <Montant valeur={verse} decimales={2} />
                </span>
                {Math.abs(ecart) >= 0.01 && (
                  <span className={`block text-micro ${ecart < 0 ? "etat-attention" : "text-slate-500"}`}>
                    {ecart > 0 ? "+" : ""}
                    <Montant valeur={ecart} decimales={2} /> par rapport à l'estimation
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-micro text-slate-500 mt-3">
        Saisis le montant de ton relevé de livret s'il diffère : un écart signale souvent un mouvement oublié ou
        mal daté.
      </p>
    </Card>
  );
}
