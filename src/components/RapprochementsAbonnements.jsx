import { useMemo } from "react";
import { Copy, MoonStar, Layers } from "lucide-react";
import { Card, CardLabel, PastilleEtat } from "./ui";
import EtatVide from "./EtatVide";
import Montant from "./Montant";
import { rapprochements } from "../lib/doublonsAbonnements";

/**
 * Rapprochements — onglet Abonnements.
 *
 * PLACÉ ICI ET PAS AILLEURS : l'onglet liste et totalise déjà. Ce widget lui
 * ajoute la seule chose qui manquait pour qu'il serve à décider — le
 * RAPPROCHEMENT. Deux services de streaming, deux assurances qui se recouvrent,
 * un abonnement dont la date de prélèvement n'a plus bougé depuis huit mois :
 * rien de tout cela ne se voit dans une liste triée par date.
 *
 * IL SIGNALE, IL NE CONCLUT PAS. L'application ne peut pas savoir si deux
 * abonnements de la même catégorie font double emploi : une assurance auto et
 * une assurance habitation sont deux « assurances » parfaitement légitimes.
 * Chaque signal est donc formulé comme une vérification à faire, jamais comme
 * une dépense à supprimer — c'est la même retenue que partout ailleurs dans
 * Patrium, où une donnée incertaine est présentée comme telle.
 */

const PRESENTATION = {
  doublon: { icone: Copy, etat: "attention", titre: "À vérifier" },
  dormant: { icone: MoonStar, etat: "critique", titre: "Sans suivi" },
  recouvrement: { icone: Layers, etat: "attention", titre: "À vérifier" },
};

export default function RapprochementsAbonnements({ subs = [], contracts = [] }) {
  const signaux = useMemo(() => rapprochements(subs, contracts), [subs, contracts]);

  const totalEnJeu = signaux
    .filter((s) => s.type !== "recouvrement")
    .reduce((s, x) => s + x.mensuel, 0);

  return (
    <Card accent="teinte-cyan carte-domaine">
      <CardLabel icon={Copy}>Rapprochements</CardLabel>

      {signaux.length === 0 ? (
        <EtatVide picto="abonnements" titre="Rien à rapprocher">
          Aucune catégorie ne compte deux abonnements, et aucune date de prélèvement n'est restée en
          arrière. C'est le bon résultat.
        </EtatVide>
      ) : (
        <>
          <p className="text-mini text-slate-500 mt-1">
            {signaux.length} rapprochement{signaux.length > 1 ? "s" : ""} à vérifier, portant sur{" "}
            <Montant valeur={totalEnJeu} decimales={0} className="text-slate-300" /> par mois.
          </p>

          <ul className="flex flex-col gap-2 mt-3">
            {signaux.map((s) => {
              const p = PRESENTATION[s.type];
              const Icone = p.icone;
              return (
                <li key={s.id} className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex items-start gap-2.5 min-w-0">
                      <Icone size={15} className={`shrink-0 mt-0.5 etat-${p.etat}`} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-corps text-slate-200">{s.libelle}</span>
                        <span className="block text-micro text-slate-500 mt-0.5">{s.detail}</span>
                      </span>
                    </span>
                    <span className="shrink-0 flex flex-col items-end gap-1">
                      <PastilleEtat etat={p.etat}>{p.titre}</PastilleEtat>
                      {s.mensuel > 0 && (
                        <Montant valeur={s.mensuel} decimales={0} className="text-mini text-slate-400" />
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="text-micro text-slate-600 mt-3">
        Deux abonnements d'une même catégorie ne font pas forcément double emploi — une assurance
        auto et une assurance habitation sont deux assurances légitimes. Ces signaux appellent une
        vérification, pas une résiliation.
      </p>
    </Card>
  );
}
