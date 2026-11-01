import { useEffect, useRef, useState } from "react";
import { Download, Pencil, Trash2, CalendarPlus, CalendarCheck, Repeat, Package } from "lucide-react";
import Modal from "../Modal";
import { PastilleEtat } from "../ui";
import {
  STATUTS,
  statutDocument,
  typeDe,
  categorieDe,
  dateFr,
  echeanceEnClair,
  formatTaille,
  conservationDocument,
  SOURCE_CONSERVATION,
} from "../../lib/coffre";
import { ouvrirFichier } from "../../lib/coffreFichiers";
import { cleChiffrementActive } from "../../lib/storage";
import { dessinerPagesPdf } from "../../lib/lirePdf";
import { etatAgenda } from "../../lib/coffreAgenda";
import { allerVers } from "../../lib/useHashRoute";

/**
 * Fiche d'un document du coffre : ses informations, l'aperçu de son fichier
 * et les actions.
 *
 * Le fichier est téléchargé et déchiffré en mémoire, jamais écrit sur le
 * disque — sauf par le bouton « Télécharger », geste explicite. L'URL `blob:`
 * de l'aperçu est révoquée à la fermeture de la fiche.
 */
export default function FicheDocument({
  document: doc,
  userId,
  reglages,
  aujourdhui,
  contrat = null,
  evenement = null,
  onAgenda,
  onFermer,
  onModifier,
  onSupprimer,
  onRetirerFichier,
  onAjouterObjet,
}) {
  return (
    <Modal
      open={!!doc}
      onClose={onFermer}
      label={doc ? doc.titre : "Document"}
      showClose
      panelClassName="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      {doc && (
        <Contenu
          key={doc.id}
          doc={doc}
          userId={userId}
          reglages={reglages}
          aujourdhui={aujourdhui}
          contrat={contrat}
          evenement={evenement}
          onAgenda={onAgenda}
          onModifier={onModifier}
          onSupprimer={onSupprimer}
          onRetirerFichier={onRetirerFichier}
          onAjouterObjet={onAjouterObjet}
        />
      )}
    </Modal>
  );
}

function Contenu({
  doc,
  userId,
  reglages,
  aujourdhui,
  contrat,
  evenement,
  onAgenda,
  onModifier,
  onSupprimer,
  onRetirerFichier,
  onAjouterObjet,
}) {
  const [index, setIndex] = useState(0);
  const fichiers = doc.fichiers || [];
  const fichier = fichiers[Math.min(index, fichiers.length - 1)] || null;
  const dechiffre = useFichierDechiffre(userId, fichier);
  const type = typeDe(doc.type);
  const statut = statutDocument(doc, reglages, aujourdhui, contrat);
  const agenda = etatAgenda(doc, evenement);
  const conservation = conservationDocument(doc, aujourdhui);

  const infos = [
    statut.echeance && {
      terme: type.echeance || "Échéance",
      valeur: `${dateFr(statut.echeance)} · ${echeanceEnClair(statut)}${doc.recurrence === "annuelle" ? " · chaque année" : ""}`,
    },
    statut.rappel && {
      terme: contrat ? "Résiliation possible jusqu'au" : "À prévoir à partir du",
      valeur: dateFr(statut.rappel),
    },
    doc.dateDocument && {
      terme: doc.type === "facture" ? "Date d'achat" : "Date du document",
      valeur: dateFr(doc.dateDocument),
    },
  ].filter(Boolean);

  return (
    <div className="p-5 space-y-4">
      <div className="pr-8">
        <h2 className="font-display text-lg text-slate-50">{doc.titre}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-micro text-slate-500">
          <span>
            {type.libelle} · {categorieDe(type.categorie).libelle}
          </span>
          {statut.statut !== "aucune" && (
            <PastilleEtat etat={STATUTS[statut.statut].etat}>{STATUTS[statut.statut].libelle}</PastilleEtat>
          )}
        </div>
      </div>

      {infos.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {infos.map((i) => (
            <div key={i.terme}>
              <dt className="text-micro text-slate-500">{i.terme}</dt>
              <dd className="text-slate-200">{i.valeur}</dd>
            </div>
          ))}
        </dl>
      )}
      {doc.notes && <p className="text-sm text-slate-300 whitespace-pre-wrap">{doc.notes}</p>}

      {conservation && (
        <p className={`text-micro ${conservation.depassee ? "text-amber-300" : "text-slate-500"}`}>
          Conservation : {conservation.libelle}{" "}
          <a
            href={SOURCE_CONSERVATION.url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted hover:text-slate-300"
          >
            Durées indicatives de service-public.fr
          </a>
        </p>
      )}

      {contrat && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/5 px-3 py-2 text-sm">
          <span className="text-slate-300">
            Suivi dans Abonnements : {contrat.label || "contrat"}. Ses dates font foi, et son préavis y est
            déjà rappelé.
          </span>
          <button
            type="button"
            onClick={() => allerVers("abonnements", "contrats")}
            className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:underline"
          >
            <Repeat size={14} aria-hidden="true" />
            Voir le contrat
          </button>
        </div>
      )}

      {evenement && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 px-3 py-2 text-sm">
          <span className={agenda === "a_mettre_a_jour" ? "text-amber-300" : "text-slate-400"}>
            {agenda === "absent" && "Pas encore de rappel dans ton agenda."}
            {agenda === "a_jour" &&
              `Rappel posé dans ton agenda le ${dateFr(doc.agendaAjouteLe.slice(0, 10))}.`}
            {agenda === "a_mettre_a_jour" && "Les dates ont changé depuis le rappel posé dans ton agenda."}
          </span>
          <button
            type="button"
            onClick={() => onAgenda(doc)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-400/60 px-3 py-1.5 text-xs text-fuchsia-200 hover:bg-slate-800/60"
          >
            {agenda === "a_jour" ? (
              <CalendarCheck size={14} aria-hidden="true" />
            ) : (
              <CalendarPlus size={14} aria-hidden="true" />
            )}
            {agenda === "absent"
              ? "Ajouter à l'agenda"
              : agenda === "a_jour"
                ? "Rouvrir dans l'agenda"
                : "Mettre à jour l'agenda"}
          </button>
        </div>
      )}

      {fichiers.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Fichiers du document">
          {fichiers.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={i === index}
              className={`rounded-lg border px-2 py-1 text-micro ${i === index ? "border-fuchsia-400 text-fuchsia-300" : "border-slate-700 text-slate-400"}`}
            >
              {f.nom}
            </button>
          ))}
          {fichier && (
            <button
              type="button"
              onClick={() => onRetirerFichier(doc, fichier)}
              className="rounded-lg px-2 py-1 text-micro text-rose-300 hover:underline"
            >
              Retirer ce fichier
            </button>
          )}
        </div>
      )}

      {fichier && <Apercu fichier={fichier} dechiffre={dechiffre} />}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
        <span className="text-micro text-slate-500">
          {fichier ? `${fichier.nom} · ${formatTaille(fichier.taille)}` : "Aucun fichier"}
        </span>
        <div className="flex flex-wrap gap-2">
          {dechiffre.statut === "pret" ? (
            <a
              href={dechiffre.url}
              download={fichier.nom}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-fuchsia-400/60"
            >
              <Download size={14} aria-hidden="true" />
              Télécharger
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-500"
            >
              <Download size={14} aria-hidden="true" />
              Télécharger
            </button>
          )}
          {doc.type === "facture" && onAjouterObjet && (
            <button
              type="button"
              onClick={() => onAjouterObjet(doc)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-fuchsia-400/60"
            >
              <Package size={14} aria-hidden="true" />
              Ajouter à l'inventaire
            </button>
          )}
          <button
            type="button"
            onClick={() => onModifier(doc)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-fuchsia-400/60"
          >
            <Pencil size={14} aria-hidden="true" />
            Modifier
          </button>
          <button
            type="button"
            onClick={() => onSupprimer(doc)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
          >
            <Trash2 size={14} aria-hidden="true" />
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

/** Télécharge et déchiffre un fichier du coffre ; `{ statut: "chargement" | "pret" | "erreur", blob, url, message }`. */
function useFichierDechiffre(userId, fichier) {
  // L'état porte l'identifiant du fichier qu'il décrit : passer à un autre
  // fichier se lit « chargement » sans remettre l'état à zéro dans l'effet.
  const [etat, setEtat] = useState({ id: null, statut: "chargement" });

  useEffect(() => {
    if (!fichier) return undefined;
    let annule = false;
    let url = null;
    (async () => {
      try {
        const cleMaitresse = await cleChiffrementActive();
        if (!cleMaitresse) throw new Error("Le coffre s'est verrouillé : saisis ta phrase secrète.");
        const blob = await ouvrirFichier({ userId, cleMaitresse, fichier });
        if (annule) return;
        url = URL.createObjectURL(blob);
        setEtat({ id: fichier.id, statut: "pret", blob, url });
      } catch (e) {
        if (!annule)
          setEtat({ id: fichier.id, statut: "erreur", message: e?.message || "Fichier illisible." });
      }
    })();
    return () => {
      annule = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [userId, fichier]);

  return fichier && etat.id === fichier.id ? etat : { statut: "chargement" };
}

function Apercu({ fichier, dechiffre }) {
  if (dechiffre.statut === "chargement") {
    return <p className="text-sm text-slate-500">Déchiffrement du fichier…</p>;
  }
  if (dechiffre.statut === "erreur") {
    return (
      <p role="alert" className="text-sm text-rose-300">
        {dechiffre.message}
      </p>
    );
  }
  if ((fichier.mime || "").startsWith("image/")) {
    return <img src={dechiffre.url} alt={`Aperçu de ${fichier.nom}`} className="w-full h-auto rounded-lg" />;
  }
  if (fichier.mime === "application/pdf") return <ApercuPdf blob={dechiffre.blob} nom={fichier.nom} />;
  return null;
}

function ApercuPdf({ blob, nom }) {
  const conteneur = useRef(null);
  const [etat, setEtat] = useState({ statut: "chargement" });

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const octets = new Uint8Array(await blob.arrayBuffer());
        const largeur = conteneur.current?.clientWidth || 600;
        const { canvases, total } = await dessinerPagesPdf(octets, { largeur });
        if (annule || !conteneur.current) return;
        canvases.forEach((c) => {
          c.className = "w-full h-auto rounded-lg bg-white";
        });
        conteneur.current.replaceChildren(...canvases);
        setEtat({ statut: "pret", affichees: canvases.length, total });
      } catch {
        if (!annule) setEtat({ statut: "erreur" });
      }
    })();
    return () => {
      annule = true;
    };
  }, [blob]);

  return (
    <div>
      {etat.statut === "chargement" && <p className="text-sm text-slate-500">Préparation de l'aperçu…</p>}
      {etat.statut === "erreur" && (
        <p className="text-sm text-slate-400">Aperçu impossible : télécharge le fichier pour l'ouvrir.</p>
      )}
      <div ref={conteneur} role="img" aria-label={`Aperçu de ${nom}`} className="space-y-3" />
      {etat.statut === "pret" && etat.total > etat.affichees && (
        <p className="mt-2 text-micro text-slate-500">
          {etat.total - etat.affichees} page(s) de plus : télécharge le fichier pour tout voir.
        </p>
      )}
    </div>
  );
}
