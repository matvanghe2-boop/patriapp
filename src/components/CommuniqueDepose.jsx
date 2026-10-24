import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { fetchCommunique } from "../lib/api";

/**
 * Le communiqué déposé derrière un événement du calendrier, lu sur place.
 *
 * Avant, la fiche n'offrait qu'un lien vers le PDF : il fallait quitter
 * l'application pour savoir ce que la société avait annoncé, puis recoller le
 * texte pour le résumer. Le texte est désormais chargé dès l'ouverture de la
 * fiche, et le résumé part du même document.
 *
 * Deux façons de désigner le document : son lien (`url`), ou, quand
 * l'événement n'en porte pas, la société et la date (`symbole`, `date`,
 * `type`) — le serveur le cherche alors dans le registre. `onTrouve` remonte
 * le lien du document trouvé, pour que le résumé parte du même.
 *
 * `annonceLe` distingue deux cas : pour une publication passée, c'est LE
 * communiqué de l'événement ; pour une date à venir, c'est celui où la
 * société l'a annoncée — le dire évite de croire qu'on lit déjà les résultats.
 */
export default function CommuniqueDepose({ url = null, symbole = null, date, type = null, annonceLe = null, onTrouve }) {
  const [etat, setEtat] = useState({ chargement: true, document: null, erreur: "", absent: false });

  useEffect(() => {
    let actif = true;
    // Effet de CHARGEMENT : il interroge le réseau et tient lui-même son état.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEtat({ chargement: true, document: null, erreur: "", absent: false });
    fetchCommunique(url || { symbole, date, type })
      .then((r) => {
        if (!actif) return;
        setEtat({ chargement: false, document: r, erreur: "", absent: false });
        if (!url && r?.url) onTrouve?.(r.url);
      })
      .catch((e) => {
        if (!actif) return;
        // Une recherche sans résultat n'est pas une panne : la société n'a
        // simplement rien déposé ce jour-là, ou pas sous une forme reconnue.
        const absent = !url && /aucun communiqué/i.test(e.message);
        setEtat({ chargement: false, document: null, erreur: e.message, absent });
      });
    return () => {
      actif = false;
    };
    // `onTrouve` est un rappel du parent : le changer ne doit pas relancer la lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, symbole, date, type]);

  const jour = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR") : "");
  const doc = etat.document;
  const lien = url || doc?.url || null;

  // Rien de trouvé par la recherche : une ligne discrète, pas un encadré vide.
  if (etat.absent) {
    return <p className="text-micro text-[#666] mb-2">{etat.erreur} Le résumé reste possible en collant le texte.</p>;
  }

  return (
    <section className="rounded-xl border border-[#222] bg-[#0a0a0a] p-3 mb-2" aria-label="Communiqué déposé">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-micro text-[#888]">
          <FileText size={12} aria-hidden="true" />
          {annonceLe
            ? `Communiqué du ${jour(annonceLe)}, qui annonce cette date`
            : `Communiqué du ${jour(doc?.date || date)}`}
        </div>
        {lien && (
          <a
            href={lien}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-micro text-sky-400 hover:text-sky-300 shrink-0"
          >
            <ExternalLink size={10} aria-hidden="true" /> PDF
          </a>
        )}
      </div>

      {/* Trouvé par recherche : on dit lequel, pour qu'on puisse juger si
          c'est bien le bon. */}
      {!url && doc?.titre && <p className="text-micro text-[#aaa] mb-1.5">{doc.titre}</p>}

      {etat.chargement && (
        <p className="flex items-center gap-1.5 text-micro text-[#777]">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          {url ? "Chargement du communiqué…" : "Recherche du communiqué déposé…"}
        </p>
      )}

      {etat.erreur && <p className="text-micro text-amber-300/90">{etat.erreur}</p>}

      {doc?.texte && (
        <>
          <div
            // `break-words` : un lien d'inscription au webcast, sans espace,
            // débordait et ajoutait une barre de défilement horizontale.
            className="max-h-56 overflow-y-auto pr-1 text-xs leading-relaxed text-[#ccc] whitespace-pre-line break-words"
            tabIndex={0}
            aria-label="Texte du communiqué"
          >
            {doc.texte}
          </div>
          {doc.tronque && (
            <p className="text-micro text-[#666] mt-1.5">Texte tronqué : le PDF complet reste accessible.</p>
          )}
        </>
      )}
    </section>
  );
}
