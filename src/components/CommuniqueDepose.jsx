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
 * `annonceLe` distingue les deux cas : pour une publication passée, c'est LE
 * communiqué de l'événement ; pour une date à venir, c'est celui où la
 * société l'a annoncée — le dire évite de croire qu'on lit déjà les résultats.
 */
export default function CommuniqueDepose({ url, date, annonceLe = null }) {
  const [etat, setEtat] = useState({ chargement: true, texte: "", tronque: false, erreur: "" });

  useEffect(() => {
    let actif = true;
    // Effet de CHARGEMENT : il interroge le réseau et tient lui-même son état.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEtat({ chargement: true, texte: "", tronque: false, erreur: "" });
    fetchCommunique(url)
      .then(
        (r) => actif && setEtat({ chargement: false, texte: r.texte || "", tronque: !!r.tronque, erreur: "" })
      )
      .catch((e) => actif && setEtat({ chargement: false, texte: "", tronque: false, erreur: e.message }));
    return () => {
      actif = false;
    };
  }, [url]);

  const jour = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR") : "");

  return (
    <section className="rounded-xl border border-[#222] bg-[#0a0a0a] p-3 mb-2" aria-label="Communiqué déposé">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-micro text-[#888]">
          <FileText size={12} aria-hidden="true" />
          {annonceLe
            ? `Communiqué du ${jour(annonceLe)}, qui annonce cette date`
            : `Communiqué du ${jour(date)}`}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-micro text-sky-400 hover:text-sky-300 shrink-0"
        >
          <ExternalLink size={10} aria-hidden="true" /> PDF
        </a>
      </div>

      {etat.chargement && (
        <p className="flex items-center gap-1.5 text-micro text-[#777]">
          <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Chargement du communiqué…
        </p>
      )}

      {etat.erreur && <p className="text-micro text-amber-300/90">{etat.erreur}</p>}

      {etat.texte && (
        <>
          <div
            className="max-h-56 overflow-y-auto pr-1 text-xs leading-relaxed text-[#ccc] whitespace-pre-line"
            tabIndex={0}
            aria-label="Texte du communiqué"
          >
            {etat.texte}
          </div>
          {etat.tronque && (
            <p className="text-micro text-[#666] mt-1.5">Texte tronqué : le PDF complet reste accessible.</p>
          )}
        </>
      )}
    </section>
  );
}
