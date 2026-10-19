import { useState, useMemo } from "react";
import { Scale, Sparkles, AlertTriangle, Loader2, Info } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { analyserValeur } from "../lib/api";
import { fourchetteValorisation } from "../../shared/valorisation.js";

/**
 * Trajectoire et valorisation d'une valeur.
 *
 * CE QUI EST CALCULÉ, ET CE QUI EST RÉDIGÉ
 *
 * La fourchette de prix est de l'ARITHMÉTIQUE : le bénéfice par action
 * déduit du cours et du PER, multiplié par le PER moyen des exercices
 * publiés ; le dividende divisé par le rendement moyen. Chaque méthode
 * affiche son calcul pour qu'il puisse être refait à la main.
 *
 * Le modèle n'y touche pas. Il explique la trajectoire — d'où vient
 * l'entreprise, ce que montrent ses marges — et commente le positionnement.
 * Il lui est explicitement interdit d'avancer un prix : « estimer un juste
 * prix » est exactement la question à laquelle un modèle répond avec aplomb
 * et sans fondement.
 *
 * Aucune recommandation d'achat ou de vente, et aucune donnée de portefeuille
 * transmise : seulement des ratios publics, les mêmes que la fiche affiche
 * déjà au-dessus.
 */

const TON_ECART = (pct) => {
  if (pct == null) return "text-slate-400";
  if (pct > 5) return "text-emerald-400";
  if (pct < -5) return "text-rose-400";
  return "text-slate-300";
};

function LigneMethode({ methode, devise }) {
  return (
    <li className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="min-w-0">
        <span className="text-micro text-slate-300 block">{methode.libelle}</span>
        <span className="text-micro text-slate-600 font-data">{methode.detail}</span>
        {methode.fiabilite === "prevision" && (
          <span className="text-micro text-amber-300/80 block">
            repose sur un bénéfice prévu, pas publié
          </span>
        )}
      </span>
      <span className="text-right shrink-0">
        <span className="font-data tabular-nums text-slate-100 block">
          {methode.prix} {devise}
        </span>
        {methode.ecartPct != null && (
          <span className={`text-micro font-data tabular-nums ${TON_ECART(methode.ecartPct)}`}>
            {methode.ecartPct > 0 ? "+" : ""}
            {methode.ecartPct} %
          </span>
        )}
      </span>
    </li>
  );
}

export default function AnalyseValeur({ symbole, devise = "€", donnees = null }) {
  const [analyse, setAnalyse] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  // La fourchette est calculable SANS le modèle : on l'affiche tout de suite,
  // avant même qu'une analyse ait été demandée.
  const valorisation = useMemo(
    () => (donnees ? fourchetteValorisation(donnees) : null),
    [donnees]
  );

  const lancer = async () => {
    setEnCours(true);
    setErreur("");
    try {
      const r = await analyserValeur({ symbole, donnees: donnees || {} });
      if (!r.disponible) {
        setErreur(r.motif || "Analyse indisponible.");
        setAnalyse(null);
        return;
      }
      setAnalyse(r);
    } catch (e) {
      setErreur(e.message || "Analyse impossible pour le moment.");
    } finally {
      setEnCours(false);
    }
  };

  if (!valorisation) return null;

  return (
    <Card accent={CARD_THEMES.cyan}>
      <CardLabel icon={Scale}>Trajectoire et valorisation</CardLabel>

      {!valorisation.exploitable ? (
        <p className="text-micro text-slate-500 mt-1">
          Pas de fourchette calculable pour cette valeur — ses fondamentaux ne sont pas publiés.
          C&apos;est le cas des ETF et des sociétés en perte.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <span className="text-micro text-slate-500">Fourchette calculée</span>
            <span className="font-data tabular-nums text-lg text-slate-100">
              {valorisation.bas} – {valorisation.haut} {devise}
            </span>
            <span className="text-micro text-slate-600">
              cours actuel {valorisation.cours} {devise}
            </span>
          </div>

          <ul className="mt-2.5">
            {valorisation.methodes.map((m) => (
              <LigneMethode key={m.cle} methode={m} devise={devise} />
            ))}
          </ul>

          {/* La dispersion est une information en soi : trois méthodes très
              écartées disent que le titre n'a pas de valorisation
              consensuelle, et c'est utile AVANT de lire une fourchette. */}
          {valorisation.dispersionPct != null && valorisation.dispersionPct > 40 && (
            <p className="text-micro text-amber-300/90 mt-2 flex items-start gap-1.5">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
              Les méthodes s&apos;écartent de {valorisation.dispersionPct} % entre elles : ce titre
              n&apos;a pas de valorisation consensuelle, la fourchette est à prendre avec prudence.
            </p>
          )}

          {valorisation.consensus && (
            <p className="text-micro text-slate-500 mt-2 pt-2 border-t border-slate-800">
              Objectif moyen des analystes :{" "}
              <span className="font-data tabular-nums text-slate-300">
                {valorisation.consensus.prix} {devise}
              </span>{" "}
              <span className={`font-data ${TON_ECART(valorisation.consensus.ecartPct)}`}>
                ({valorisation.consensus.ecartPct > 0 ? "+" : ""}
                {valorisation.consensus.ecartPct} %)
              </span>
              <span className="text-slate-600">
                {" "}
                — c&apos;est l&apos;avis d&apos;un groupe, pas un calcul : il reste hors de la
                fourchette ci-dessus.
              </span>
            </p>
          )}
        </>
      )}

      {/* ─── Partie rédigée ─────────────────────────────────────────────── */}
      {!analyse ? (
        <div className="mt-3">
          <button
            onClick={lancer}
            disabled={enCours}
            className="btn-flash flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            {enCours ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {enCours ? "Analyse en cours…" : "Expliquer la trajectoire"}
          </button>
          {erreur && <p className="text-micro text-amber-300 mt-2">{erreur}</p>}
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-slate-800">
          {analyse.fiable === false && (
            <p className="text-micro text-amber-300 flex items-start gap-1.5 mb-2">
              <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
              {analyse.chiffresDouteux} chiffre(s) cité(s) ne figurent pas dans les données
              transmises : lis cette analyse avec prudence.
            </p>
          )}

          {analyse.trajectoire && (
            <p className="text-sm text-slate-300">{analyse.trajectoire}</p>
          )}
          {analyse.positionnement && (
            <p className="text-sm text-slate-400 mt-2">{analyse.positionnement}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {analyse.forces?.length > 0 && (
              <div>
                <div className="text-micro uppercase tracking-wide text-emerald-400/80 mb-1">Points solides</div>
                <ul className="flex flex-col gap-0.5">
                  {analyse.forces.map((f, i) => (
                    <li key={i} className="text-micro text-slate-400">• {f}</li>
                  ))}
                </ul>
              </div>
            )}
            {analyse.vigilance?.length > 0 && (
              <div>
                <div className="text-micro uppercase tracking-wide text-amber-300/80 mb-1">Points de vigilance</div>
                <ul className="flex flex-col gap-0.5">
                  {analyse.vigilance.map((f, i) => (
                    <li key={i} className="text-micro text-slate-400">• {f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {analyse.incertitudes && (
            <p className="text-micro text-slate-500 mt-3 flex items-start gap-1.5">
              <Info size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
              {analyse.incertitudes}
            </p>
          )}

          <p className="text-micro text-slate-600 mt-3">
            Analyse descriptive, sans recommandation d&apos;achat ni de vente. Les prix ci-dessus
            sont calculés à partir des ratios publiés, pas produits par le modèle.
          </p>
        </div>
      )}
    </Card>
  );
}
