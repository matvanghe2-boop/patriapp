import { useMemo } from "react";
import { CalendarPlus, CalendarCheck, CalendarClock, Download } from "lucide-react";
import { Card, PastilleEtat } from "../ui";
import EtatVide from "../EtatVide";
import { STATUTS, statutDocument, contratLie, dateFr } from "../../lib/coffre";
import { evenementAgenda, etatAgenda } from "../../lib/coffreAgenda";

/**
 * Sous-onglet « Échéances » du coffre : chaque papier daté, la date à
 * laquelle s'en occuper, et l'état de son rappel dans l'agenda du téléphone.
 *
 * Les dates du coffre étant chiffrées, aucun serveur ne peut prévenir : c'est
 * l'agenda qui s'en charge (voir coffreAgenda.js). Cet écran sert surtout à
 * vérifier que chaque rappel est posé, et à jour.
 */

const BOUTON =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed";

const LIBELLES_AGENDA = {
  absent: {
    libelle: "Ajouter à l'agenda",
    icone: CalendarPlus,
    classe: "border-fuchsia-400/60 text-fuchsia-200",
  },
  a_mettre_a_jour: {
    libelle: "Mettre à jour l'agenda",
    icone: CalendarPlus,
    classe: "border-amber-400/60 text-amber-200",
  },
  a_jour: {
    libelle: "Rouvrir dans l'agenda",
    icone: CalendarCheck,
    classe: "border-slate-700 text-slate-300",
  },
};

export default function VueEcheances({ coffre, contracts, aujourdhui, onAgenda, onExporter, onOuvrir }) {
  const lignes = useMemo(
    () =>
      coffre.documents
        .map((doc) => {
          const contrat = contratLie(doc, contracts);
          const evt = evenementAgenda(doc, coffre.reglages, { aujourdhui, contrat });
          return {
            doc,
            contrat,
            ...statutDocument(doc, coffre.reglages, aujourdhui, contrat),
            evt,
            agenda: etatAgenda(doc, evt),
          };
        })
        .filter((l) => l.echeance)
        .sort((a, b) => (a.rappel || a.echeance).localeCompare(b.rappel || b.echeance)),
    [coffre, contracts, aujourdhui]
  );
  const aPoser = lignes.filter((l) => l.agenda === "absent" || l.agenda === "a_mettre_a_jour").length;
  const exportables = lignes.some((l) => l.evt);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl space-y-2 text-sm text-slate-400">
            <h2 className="text-lead text-slate-100">Rappels dans ton agenda</h2>
            <p>
              Tes dates sont chiffrées : aucun serveur ne peut te prévenir, c'est ton agenda qui s'en charge.
              « Ajouter à l'agenda » ouvre Google Agenda avec le rappel prêt à enregistrer. Sur ordinateur, le
              fichier .ics s'importe dans Google Agenda (Paramètres, puis Importer et exporter).
            </p>
            {aPoser > 0 && (
              <p className="text-fuchsia-300">
                {aPoser} rappel{aPoser > 1 ? "s" : ""} à poser ou à mettre à jour.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onExporter}
            disabled={!exportables}
            className={`${BOUTON} border-slate-700 text-slate-200 hover:border-fuchsia-400/60`}
          >
            <Download size={14} aria-hidden="true" />
            Exporter en .ics
          </button>
        </div>
      </Card>

      {lignes.length === 0 ? (
        <Card>
          <EtatVide picto="calendrier" titre="Aucune échéance à suivre">
            Ajoute une date à un papier (expiration, fin de garantie, reconduction) et son rappel apparaîtra
            ici.
          </EtatVide>
        </Card>
      ) : (
        <ul
          aria-label="Échéances des papiers"
          className="rounded-2xl border border-slate-800 bg-slate-900 divide-y divide-slate-800 overflow-hidden"
        >
          {lignes.map((l) => (
            <LigneEcheance key={l.doc.id} ligne={l} onAgenda={onAgenda} onOuvrir={onOuvrir} />
          ))}
        </ul>
      )}
    </>
  );
}

function LigneEcheance({ ligne, onAgenda, onOuvrir }) {
  const { doc, contrat, statut, echeance, rappel, evt, agenda } = ligne;
  const bouton = LIBELLES_AGENDA[agenda];
  const Icone = bouton?.icone || CalendarClock;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={() => onOuvrir(doc.id)}
        className="flex-1 min-w-[12rem] text-left focus-visible:outline-none focus-visible:underline"
      >
        <span className="block text-sm text-slate-100 truncate">{doc.titre}</span>
        <span className="block text-micro text-slate-500">
          {rappel && `${contrat ? "Résiliation jusqu'au" : "À prévoir le"} ${dateFr(rappel)} · `}
          échéance le {dateFr(echeance)}
        </span>
        {contrat && (
          <span className="block text-micro text-cyan-300">
            Préavis suivi dans Abonnements : {contrat.label || "contrat"}
          </span>
        )}
        {agenda === "a_jour" && (
          <span className="block text-micro text-slate-500">
            Rappel posé le {dateFr(doc.agendaAjouteLe.slice(0, 10))}
          </span>
        )}
        {agenda === "a_mettre_a_jour" && (
          <span className="block text-micro text-amber-300">
            Les dates ont changé depuis le rappel posé le {dateFr(doc.agendaAjouteLe.slice(0, 10))}
          </span>
        )}
      </button>
      {statut !== "a_jour" && (
        <PastilleEtat etat={STATUTS[statut].etat}>{STATUTS[statut].libelle}</PastilleEtat>
      )}
      {evt && bouton && (
        <button
          type="button"
          onClick={() => onAgenda(doc)}
          aria-label={`${bouton.libelle} : ${doc.titre}`}
          className={`${BOUTON} ${bouton.classe} hover:bg-slate-800/60`}
        >
          <Icone size={14} aria-hidden="true" />
          {bouton.libelle}
        </button>
      )}
    </li>
  );
}
