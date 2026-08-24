import { useMemo } from "react";
import { CalendarClock, Coins, FileText, Target, CheckCircle2 } from "lucide-react";
import { Card, CardLabel } from "./ui";
import EtatVide from "./EtatVide";
import Montant from "./Montant";
import { prochainesEcheances } from "../lib/echeances";

/**
 * Prochaines échéances — Dashboard.
 *
 * PLACÉ ICI ET PAS AILLEURS : c'est le seul widget de l'application qui
 * traverse tous les domaines. Les dividendes viennent de Bourse, les contrats
 * d'Abonnements, les objectifs du Dashboard lui-même. Le mettre dans l'un de
 * ces onglets reviendrait à le cacher aux deux autres — or sa raison d'être est
 * précisément de réunir ce qui est éparpillé.
 *
 * La fenêtre est courte, six semaines : au-delà, la liste se remplit
 * d'événements sur lesquels on ne peut encore rien faire, et un rappel qu'on ne
 * peut pas suivre cesse d'être lu.
 */

const ICONES = {
  dividende: Coins,
  marche: Coins,
  preavis: FileText,
  contrat: FileText,
  objectif: Target,
};

/** « dans 3 jours », « demain », « aujourd'hui ». */
function quand(jours) {
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return "demain";
  if (jours < 14) return `dans ${jours} jours`;
  return `dans ${Math.round(jours / 7)} semaines`;
}

function formatDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function ProchainesEcheances({
  evenements = [],
  contracts = [],
  objectifs = [],
  patrimoineNet = 0,
}) {
  const echeances = useMemo(
    () => prochainesEcheances({ evenements, contracts, objectifs, patrimoineNet }),
    [evenements, contracts, objectifs, patrimoineNet]
  );

  return (
    <Card accent="teinte-emerald carte-domaine">
      <CardLabel icon={CalendarClock}>Prochaines échéances</CardLabel>

      {echeances.length === 0 ? (
        <EtatVide picto="calendrier" titre="Rien dans les six prochaines semaines">
          Dividendes attendus, fins d'engagement, préavis de résiliation et échéances d'objectifs
          apparaîtront ici dès qu'une date approche.
        </EtatVide>
      ) : (
        <ul className="flex flex-col gap-1.5 mt-2">
          {echeances.map((e) => {
            const Icone = e.atteint ? CheckCircle2 : ICONES[e.type] || CalendarClock;
            return (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
              >
                <span className={`shrink-0 etat-${e.urgence}`}>
                  <Icone size={15} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-corps text-slate-200 truncate">{e.libelle}</span>
                  {e.detail && <span className="block text-micro text-slate-500 truncate">{e.detail}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-mini font-data text-slate-300">{formatDate(e.date)}</span>
                  <span className={`block text-micro etat-${e.urgence}`}>{quand(e.jours)}</span>
                </span>
                {Number.isFinite(e.montant) && e.montant > 0 && (
                  <Montant valeur={e.montant} decimales={0} className="shrink-0 text-corps etat-ok" />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-micro text-slate-600 mt-3">
        Six semaines d'horizon. Un préavis de résiliation est daté du dernier jour utile pour
        l'envoyer, pas de la fin du contrat — un contrat qui se termine dans deux mois avec trois
        mois de préavis est déjà reconduit.
      </p>
    </Card>
  );
}
