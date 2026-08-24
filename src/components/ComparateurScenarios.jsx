import { useMemo } from "react";
import { GitCompare, Trophy } from "lucide-react";
import { Card, CardLabel } from "./ui";
import EtatVide from "./EtatVide";
import Montant from "./Montant";
import { projectCompound, lireNombre } from "../lib/finance";

/**
 * Comparateur de scénarios — onglet Simulation.
 *
 * PLACÉ ICI ET PAS AILLEURS : `simScenarios` est enregistré par cet onglet, et
 * le bouton « Sauvegarder ce scénario » y vit déjà. Le comparateur est la
 * moitié manquante de ce bouton — enregistrer sans pouvoir comparer ne sert
 * qu'à accumuler.
 *
 * CE QUE LE COMPARATEUR APPREND, ET QU'UN SCÉNARIO SEUL NE PEUT PAS DIRE :
 * pourquoi l'un l'emporte. Un plan « offensif » peut rapporter moins qu'un plan
 * « équilibré » simplement parce que son versement mensuel est plus faible —
 * et rouvrir les scénarios un par un ne le révèle jamais, puisqu'il faut alors
 * retenir les chiffres de tête. L'écart est donc décomposé.
 */

/** Valeur finale d'un scénario, poches sécurisée et bourse réunies. */
function valeurFinale(sc) {
  const annees = lireNombre(sc?.years) ?? 0;
  const poches = ["livrets", "bourse"];
  return poches.reduce((total, poche) => {
    const p = sc?.[poche] || {};
    const serie = projectCompound(
      lireNombre(p.capital) ?? 0,
      lireNombre(p.rate) ?? 0,
      lireNombre(p.monthly) ?? 0,
      annees
    );
    return total + (serie[serie.length - 1]?.total ?? 0);
  }, 0);
}

/** Versement mensuel total, toutes poches confondues. */
function versementTotal(sc) {
  return ["livrets", "bourse"].reduce((s, poche) => s + (lireNombre(sc?.[poche]?.monthly) ?? 0), 0);
}

export default function ComparateurScenarios({ scenarios = [] }) {
  const compares = useMemo(() => {
    const evalues = scenarios
      .map((sc) => ({
        id: sc.id,
        nom: sc.name || sc.nom || "Sans nom",
        annees: lireNombre(sc.years) ?? 0,
        finale: valeurFinale(sc),
        versement: versementTotal(sc),
        verse: versementTotal(sc) * 12 * (lireNombre(sc.years) ?? 0),
      }))
      .sort((a, b) => b.finale - a.finale);

    if (evalues.length === 0) return [];
    const meilleur = evalues[0];
    return evalues.map((e) => ({
      ...e,
      meilleur: e.id === meilleur.id,
      ecart: e.finale - meilleur.finale,
      // Le gain NET de l'effort : ce que le scénario rapporte au-delà de ce
      // qu'on y a versé. C'est cette colonne qui explique les classements
      // contre-intuitifs.
      gain: e.finale - e.verse,
    }));
  }, [scenarios]);

  return (
    <Card accent="teinte-amber carte-domaine">
      <CardLabel icon={GitCompare}>Comparateur de scénarios</CardLabel>

      {compares.length < 2 ? (
        <EtatVide picto="objectifs" titre="Il faut au moins deux scénarios">
          Règle une projection, enregistre-la avec « Sauvegarder ce scénario », puis recommence avec
          d'autres hypothèses — le comparateur les mettra côte à côte.
        </EtatVide>
      ) : (
        <>
          <div className="overflow-x-auto mt-2">
            <table className="table-donnees text-corps">
              <thead>
                <tr>
                  <th>Scénario</th>
                  <th className="col-nombre">Horizon</th>
                  <th className="col-nombre">Versé</th>
                  <th className="col-nombre">Capital final</th>
                  <th className="col-nombre">Gain net</th>
                  <th className="col-nombre">Écart</th>
                </tr>
              </thead>
              <tbody>
                {compares.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="flex items-center gap-1.5">
                        {c.meilleur && <Trophy size={12} className="etat-ok shrink-0" aria-hidden="true" />}
                        <span className="truncate">{c.nom}</span>
                      </span>
                    </td>
                    <td className="col-nombre text-slate-400">{c.annees} ans</td>
                    <td className="col-nombre">
                      <Montant valeur={c.verse} decimales={0} className="text-slate-400" />
                    </td>
                    <td className="col-nombre">
                      <Montant valeur={c.finale} decimales={0} className="text-slate-100" />
                    </td>
                    <td className="col-nombre">
                      <Montant valeur={c.gain} decimales={0} className="etat-ok" />
                    </td>
                    <td className="col-nombre">
                      {c.meilleur ? (
                        <span className="text-slate-600">réf.</span>
                      ) : (
                        <Montant valeur={c.ecart} decimales={0} className="etat-critique" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/*
            L'explication de l'écart, quand elle est mesurable. C'est tout
            l'intérêt d'un comparateur : sans elle, on lit un classement sans
            comprendre ce qui le produit.
          */}
          {compares.length >= 2 && (() => {
            const [premier, second] = compares;
            const ecartVersement = premier.versement - second.versement;
            if (Math.abs(ecartVersement) < 10) return null;
            return (
              <p className="text-micro text-slate-500 mt-3">
                « {premier.nom} » l'emporte notamment parce que son versement mensuel est
                supérieur de <b className="font-data">{Math.round(Math.abs(ecartVersement))} €</b> à
                celui de « {second.nom} » — la différence de rendement n'explique donc pas tout
                l'écart.
              </p>
            );
          })()}
        </>
      )}
    </Card>
  );
}
