import { useEffect, useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { CarteRepliable } from "./ui";
import { nombre, valeurPosition } from "../lib/finance";
import { fetchHistory } from "../lib/api";
import { matriceCorrelations, SEANCES_MIN } from "../lib/correlations";

/**
 * Corrélation entre les lignes : se diversifient-elles vraiment ?
 *
 * Deux secteurs différents ne garantissent pas une diversification : deux
 * sociétés exposées à la même conjoncture montent et baissent ensemble. Un an
 * de rendements quotidiens le dit sans hypothèse.
 */

/** Couleur d'une case : bleu en sens inverse, gris sans lien, ambre ensemble. */
function fond(rho) {
  if (!Number.isFinite(rho)) return undefined;
  if (rho >= 0) return `rgba(251, 191, 36, ${0.08 + rho * 0.6})`;
  return `rgba(96, 165, 250, ${0.08 + Math.abs(rho) * 0.6})`;
}

function lecture(rho) {
  if (rho >= 0.7) return "évoluent très souvent ensemble";
  if (rho >= 0.4) return "évoluent souvent ensemble";
  if (rho >= 0.15) return "sont faiblement liées";
  if (rho > -0.15) return "évoluent presque indépendamment";
  return "évoluent plutôt en sens inverse";
}

export default function CorrelationsLignes({ positions = [], replie, onBasculer }) {
  const tickers = useMemo(
    () => [...new Set(positions.filter((p) => valeurPosition(p) > 0).map((p) => String(p.ticker).toUpperCase()))],
    [positions]
  );
  const cle = tickers.join(",");
  const [series, setSeries] = useState(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (replie || tickers.length < 2) return undefined;
    let annule = false;
    // Effet de CHARGEMENT : témoin levé avant la requête, pour ne pas laisser
    // la matrice d'un autre portefeuille à l'écran.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeries(null);
    setErreur("");
    fetchHistory(tickers, "1y", "1d")
      .then((r) => {
        if (annule) return;
        setSeries(Object.fromEntries((r || []).filter((x) => x?.ok).map((x) => [String(x.symbol).toUpperCase(), x.series])));
      })
      .catch(() => {
        if (!annule) setErreur("L'historique des cours est indisponible pour le moment : réessaie plus tard.");
      });
    return () => {
      annule = true;
    };
    // `cle` résume `tickers` : la liste est recalculée à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, replie]);

  const resultat = useMemo(() => (series ? matriceCorrelations(series) : null), [series]);

  if (tickers.length < 2) return null;

  const plusLiee = resultat?.paires[0];
  const plusIndependante = resultat?.paires.at(-1);

  return (
    <CarteRepliable
      titre="Corrélation entre tes lignes"
      icon={Link2}
      replie={replie}
      onBasculer={onBasculer}
      resume={resultat?.moyenne != null ? `corrélation moyenne ${nombre(resultat.moyenne, 2)}` : null}
    >
      {erreur ? (
        <p className="text-micro text-amber-300/90 mt-1">{erreur}</p>
      ) : !resultat ? (
        <p className="text-micro text-slate-500 mt-1">Chargement d&apos;un an de cours…</p>
      ) : resultat.paires.length === 0 ? (
        <p className="text-micro text-slate-500 mt-1">
          Pas assez de séances communes (au moins {SEANCES_MIN}) pour mesurer une corrélation.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1 mt-1">
            {plusLiee && (
              <p className="text-sm text-slate-200">
                <span className="font-data">{plusLiee.a}</span> et <span className="font-data">{plusLiee.b}</span>{" "}
                {lecture(plusLiee.rho)} ({nombre(plusLiee.rho, 2)})
                {plusLiee.rho >= 0.6 && " : elles se diversifient peu l'une l'autre"}.
              </p>
            )}
            {plusIndependante && plusIndependante !== plusLiee && (
              <p className="text-micro text-slate-400">
                La paire la plus indépendante : <span className="font-data">{plusIndependante.a}</span> et{" "}
                <span className="font-data">{plusIndependante.b}</span> ({nombre(plusIndependante.rho, 2)}).
              </p>
            )}
          </div>

          {resultat.tickers.length <= 10 && (
            <div className="overflow-x-auto mt-3">
              <table className="border-separate border-spacing-[3px] text-micro">
                <thead>
                  <tr>
                    <th />
                    {resultat.tickers.map((t) => (
                      <th key={t} scope="col" className="font-data font-normal text-slate-500 px-1">
                        {t.replace(/\.[A-Z]+$/, "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultat.tickers.map((ligne, i) => (
                    <tr key={ligne}>
                      <th scope="row" className="font-data font-normal text-slate-500 text-left pr-2">
                        {ligne.replace(/\.[A-Z]+$/, "")}
                      </th>
                      {resultat.tickers.map((colonne, j) => {
                        const rho = resultat.matrice[i][j];
                        return (
                          <td
                            key={colonne}
                            className="font-data tabular-nums text-center rounded px-2 py-1.5 text-slate-100 min-w-[3rem]"
                            style={{ background: i === j ? "rgb(var(--c-slate-800))" : fond(rho) }}
                            title={i === j ? undefined : `${ligne} / ${colonne}`}
                          >
                            {i === j ? "—" : rho == null ? "·" : nombre(rho, 2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-micro text-slate-500 mt-2">
            1 : toujours dans le même sens · 0 : sans lien · négatif : en sens inverse. Calculé sur les
            rendements quotidiens d&apos;un an, aux dates communes aux deux titres. Une corrélation passée
            n&apos;engage pas la suivante : elle monte souvent dans les krachs, quand on en aurait besoin basse.
          </p>
        </>
      )}
    </CarteRepliable>
  );
}
