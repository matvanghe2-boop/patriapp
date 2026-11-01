import { useId, useState } from "react";
import { Printer } from "lucide-react";
import Modal from "../Modal";
import { useToast } from "../../lib/ToastContext";
import { cleChiffrementActive } from "../../lib/storage";
import { versBase64 } from "../../lib/chiffrement";
import { ouvrirFichier } from "../../lib/coffreFichiers";
import { dessinerPagesPdf } from "../../lib/lirePdf";
import { factureDe } from "../../lib/inventaire";
import { htmlDossierSinistre } from "../../lib/dossierSinistre";

/**
 * Préparer un dossier sinistre : choisir les biens touchés, puis ouvrir une
 * page imprimable (voir dossierSinistre.js) à enregistrer en PDF pour
 * l'assureur.
 *
 * La fenêtre est ouverte DANS le clic, avant tout travail asynchrone : ouverte
 * après le déchiffrement des factures, elle serait prise pour une fenêtre
 * surgissante et bloquée. Elle affiche « Préparation… » le temps de déchiffrer
 * les aperçus, puis reçoit la page et lance l'impression.
 */

/** Aperçu d'une facture en URL `data:` : l'image telle quelle, ou la première page d'un PDF. */
async function apercuFacture({ userId, cleMaitresse, facture }) {
  const fichier = facture.fichiers?.[0];
  if (!fichier) return null;
  const blob = await ouvrirFichier({ userId, cleMaitresse, fichier });
  const octets = new Uint8Array(await blob.arrayBuffer());
  if ((fichier.mime || "").startsWith("image/")) return `data:${fichier.mime};base64,${versBase64(octets)}`;
  if (fichier.mime === "application/pdf") {
    const { canvases } = await dessinerPagesPdf(octets, { largeur: 700, maxPages: 1 });
    return canvases[0]?.toDataURL("image/jpeg", 0.85) || null;
  }
  return null;
}

export default function DossierSinistre({ ouvert, objets, documents, userId, aujourdhui, onFermer }) {
  return (
    <Modal
      open={ouvert}
      onClose={onFermer}
      label="Dossier sinistre"
      showClose
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      {ouvert && (
        <Contenu
          objets={objets}
          documents={documents}
          userId={userId}
          aujourdhui={aujourdhui}
          onFermer={onFermer}
        />
      )}
    </Modal>
  );
}

function Contenu({ objets, documents, userId, aujourdhui, onFermer }) {
  const ids = useId();
  const { showToast } = useToast();
  const [choisis, setChoisis] = useState(() => new Set());
  const [avecFactures, setAvecFactures] = useState(true);
  const [enCours, setEnCours] = useState(false);

  const basculer = (id) =>
    setChoisis((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const preparer = () => {
    const retenus = objets.filter((o) => choisis.has(o.id));
    const fenetre = window.open("", "_blank");
    if (!fenetre) {
      showToast({
        type: "error",
        message: "Le navigateur a bloqué la fenêtre d'impression : autorise-la pour Patrium.",
      });
      return;
    }
    fenetre.document.write('<p style="font-family:sans-serif">Préparation du dossier sinistre…</p>');
    setEnCours(true);
    (async () => {
      const apercus = {};
      if (avecFactures) {
        const cleMaitresse = await cleChiffrementActive();
        const factures = [
          ...new Map(
            retenus
              .map((o) => factureDe(o, documents))
              .filter(Boolean)
              .map((f) => [f.id, f])
          ).values(),
        ];
        for (const facture of factures) {
          try {
            const url = cleMaitresse ? await apercuFacture({ userId, cleMaitresse, facture }) : null;
            if (url) apercus[facture.id] = url;
          } catch {
            /* facture illisible ou hors ligne : le dossier part sans son aperçu */
          }
        }
      }
      fenetre.document.open();
      fenetre.document.write(htmlDossierSinistre({ objets: retenus, documents, apercus, aujourdhui }));
      fenetre.document.close();
      fenetre.focus();
      fenetre.print();
      setEnCours(false);
      onFermer();
    })();
  };

  return (
    <div className="p-5 space-y-4">
      <h2 className="font-display text-lg text-slate-50">Dossier sinistre</h2>
      <p className="text-sm text-slate-400">
        Coche les biens touchés (vol, dégât des eaux, incendie). Une page imprimable s'ouvre avec, pour
        chacun, le prix, la date d'achat, le numéro de série, la garantie et la facture : enregistre-la en PDF
        depuis la boîte d'impression pour l'envoyer à ton assureur.
      </p>

      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between text-micro text-slate-500">
          <span>Biens touchés</span>
          <button
            type="button"
            onClick={() => setChoisis(new Set(choisis.size === objets.length ? [] : objets.map((o) => o.id)))}
            className="text-fuchsia-300 hover:underline"
          >
            {choisis.size === objets.length ? "Tout décocher" : "Tout cocher"}
          </button>
        </legend>
        <ul className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800">
          {objets.map((o) => (
            <li key={o.id}>
              <label
                htmlFor={`${ids}-${o.id}`}
                className="flex items-center gap-3 px-3 py-2 text-sm text-slate-200"
              >
                <input
                  id={`${ids}-${o.id}`}
                  type="checkbox"
                  checked={choisis.has(o.id)}
                  onChange={() => basculer(o.id)}
                  className="accent-fuchsia-400"
                />
                {o.nom}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={avecFactures}
          onChange={(e) => setAvecFactures(e.target.checked)}
          className="mt-1 accent-fuchsia-400"
        />
        <span>
          Joindre l'aperçu des factures
          <span className="block text-micro text-slate-500">
            Déchiffrées sur cet appareil pour l'impression : la page imprimée, elle, n'est pas protégée.
          </span>
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onFermer}
          className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-slate-100"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={preparer}
          disabled={choisis.size === 0 || enCours}
          className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-400 hover:bg-fuchsia-300 text-slate-950 text-sm font-semibold px-4 py-2 disabled:opacity-50"
        >
          <Printer size={16} aria-hidden="true" />
          {enCours ? "Préparation…" : "Préparer le dossier"}
        </button>
      </div>
    </div>
  );
}
