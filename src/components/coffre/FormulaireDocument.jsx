import { useId, useState } from "react";
import { Upload } from "lucide-react";
import Modal from "../Modal";
import {
  CATEGORIES,
  TYPES,
  FORMATS_ACCEPTES,
  typeDe,
  verifierFichier,
  formatTaille,
  garantieParDefaut,
  dureeEnClair,
  dateFr,
} from "../../lib/coffre";

/**
 * Ajout et modification d'un document du coffre.
 *
 * À l'ajout, le fichier est obligatoire : il est chiffré puis envoyé par
 * `onEnregistrer`, qui peut échouer (réseau, bucket absent) — l'erreur
 * s'affiche alors ici, formulaire intact, pour réessayer sans tout ressaisir.
 * La modification ne touche qu'aux informations : remplacer le fichier, c'est
 * supprimer le document et en ranger un nouveau.
 */

const CHAMP =
  "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40";
const ETIQUETTE = "block text-micro text-slate-500 mb-1";
const ACCEPT = Object.keys(FORMATS_ACCEPTES).join(",");

const VIDE = {
  type: "cni",
  titre: "",
  dateDocument: "",
  echeance: "",
  recurrence: null,
  rappelJours: "",
  notes: "",
  contratId: "",
};

const depuisDocument = (doc) => ({
  type: doc.type,
  titre: doc.titre || "",
  dateDocument: doc.dateDocument || "",
  echeance: doc.echeance || "",
  recurrence: doc.recurrence ?? null,
  rappelJours: doc.rappelJours ?? "",
  notes: doc.notes || "",
  contratId: doc.contratId || "",
});

export default function FormulaireDocument({ ouvert, initial, contracts = [], onFermer, onEnregistrer }) {
  const [enCours, setEnCours] = useState(false);
  const titreFenetre = initial ? "Modifier le document" : "Ranger un document";

  // Le formulaire n'est monté que pendant l'ouverture : chaque ouverture
  // repart ainsi d'un état propre, ou du document à modifier.
  return (
    <Modal
      open={ouvert}
      onClose={enCours ? () => {} : onFermer}
      label={titreFenetre}
      closeOnOverlayClick={false}
      showClose={!enCours}
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      {ouvert && (
        <Formulaire
          initial={initial}
          contracts={contracts}
          titreFenetre={titreFenetre}
          enCours={enCours}
          setEnCours={setEnCours}
          onFermer={onFermer}
          onEnregistrer={onEnregistrer}
        />
      )}
    </Modal>
  );
}

function Formulaire({ initial, contracts, titreFenetre, enCours, setEnCours, onFermer, onEnregistrer }) {
  const ids = useId();
  const modification = !!initial;
  const [v, setV] = useState(() => (initial ? depuisDocument(initial) : VIDE));
  const [fichier, setFichier] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [survol, setSurvol] = useState(false);

  const type = typeDe(v.type);
  const champ = (cle) => (e) => setV((s) => ({ ...s, [cle]: e.target.value }));
  const changerType = (e) => {
    const id = e.target.value;
    setV((s) => ({ ...s, type: id, recurrence: typeDe(id).recurrence || null }));
  };

  const choisir = (f) => {
    if (!f) return;
    const probleme = verifierFichier(f);
    setErreur(probleme);
    setFichier(probleme ? null : f);
  };

  const garantie = !v.echeance ? garantieParDefaut(v.type, v.dateDocument) : null;

  const soumettre = async (e) => {
    e.preventDefault();
    if (!modification) {
      const probleme = verifierFichier(fichier);
      if (probleme) {
        setErreur(probleme);
        return;
      }
    }
    setEnCours(true);
    setErreur(null);
    try {
      await onEnregistrer(v, fichier);
      onFermer();
    } catch (err) {
      setErreur(err?.message || "L'enregistrement n'a pas abouti.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form onSubmit={soumettre} className="p-5 space-y-4">
      <h2 className="font-display text-lg text-slate-50">{titreFenetre}</h2>

      {!modification && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSurvol(false);
            choisir(e.dataTransfer?.files?.[0]);
          }}
          className={`rounded-xl border border-dashed p-4 text-center transition-colors ${
            survol ? "border-fuchsia-400 bg-fuchsia-400/10" : "border-slate-700"
          }`}
        >
          <label
            htmlFor={`${ids}-fichier`}
            className="cursor-pointer flex flex-col items-center gap-1 text-sm text-slate-300"
          >
            <Upload size={20} className="text-fuchsia-300" aria-hidden="true" />
            {fichier ? (
              <span className="text-slate-100">
                {fichier.name} · {formatTaille(fichier.size)}
              </span>
            ) : (
              <span>Choisir un PDF ou une photo</span>
            )}
            <span className="text-micro text-slate-500">ou glisse le fichier ici · 20 Mo au maximum</span>
          </label>
          <input
            id={`${ids}-fichier`}
            type="file"
            accept={ACCEPT}
            aria-label="Fichier à ranger"
            className="sr-only"
            onChange={(e) => choisir(e.target.files?.[0])}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${ids}-type`} className={ETIQUETTE}>
            Type
          </label>
          <select id={`${ids}-type`} value={v.type} onChange={changerType} className={CHAMP}>
            {CATEGORIES.map((c) => (
              <optgroup key={c.id} label={c.libelle}>
                {TYPES.filter((t) => t.categorie === c.id).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.libelle}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-titre`} className={ETIQUETTE}>
            Titre
          </label>
          <input
            id={`${ids}-titre`}
            type="text"
            value={v.titre}
            onChange={champ("titre")}
            placeholder={type.libelle}
            className={CHAMP}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-date`} className={ETIQUETTE}>
            {v.type === "facture" ? "Date d'achat" : "Date du document"}
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            value={v.dateDocument}
            onChange={champ("dateDocument")}
            className={CHAMP}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-echeance`} className={ETIQUETTE}>
            {type.echeance || "Échéance"}
            {!type.echeance && " (facultative)"}
          </label>
          <input
            id={`${ids}-echeance`}
            type="date"
            value={v.echeance}
            onChange={champ("echeance")}
            className={CHAMP}
          />
          {garantie && (
            <button
              type="button"
              onClick={() => setV((s) => ({ ...s, echeance: garantie }))}
              className="mt-1 text-micro text-fuchsia-300 hover:underline"
            >
              Garantie légale : {dateFr(garantie)}
            </button>
          )}
        </div>
        <div>
          <label htmlFor={`${ids}-rappel`} className={ETIQUETTE}>
            Rappel (jours avant l'échéance)
          </label>
          <input
            id={`${ids}-rappel`}
            type="number"
            min="0"
            inputMode="numeric"
            value={v.rappelJours}
            onChange={champ("rappelJours")}
            placeholder={
              type.rappelJours != null
                ? `${type.rappelJours}, soit ${dureeEnClair(type.rappelJours)}`
                : "aucun par défaut"
            }
            className={`${CHAMP} font-data`}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300 sm:mt-5">
          <input
            type="checkbox"
            checked={v.recurrence === "annuelle"}
            onChange={(e) => setV((s) => ({ ...s, recurrence: e.target.checked ? "annuelle" : null }))}
            className="accent-fuchsia-400"
          />
          Se renouvelle chaque année
        </label>
        {type.liableAbonnements && contracts.length > 0 && (
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-contrat`} className={ETIQUETTE}>
              Suivi dans Abonnements
            </label>
            <select id={`${ids}-contrat`} value={v.contratId} onChange={champ("contratId")} className={CHAMP}>
              <option value="">Non : le coffre gère son rappel</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || "Contrat sans nom"}
                  {c.date_fin ? ` — fin le ${dateFr(c.date_fin)}` : ""}
                </option>
              ))}
            </select>
            {v.contratId && (
              <p className="mt-1 text-micro text-slate-500">
                Les dates de ce contrat font foi, et Abonnements rappelle déjà son préavis : le coffre ne
                créera pas de second rappel.
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <label htmlFor={`${ids}-notes`} className={ETIQUETTE}>
          Notes
        </label>
        <textarea
          id={`${ids}-notes`}
          rows={3}
          value={v.notes}
          onChange={champ("notes")}
          placeholder="Numéro, agence, contact… chiffré comme le reste."
          className={CHAMP}
        />
      </div>

      {erreur && (
        <p role="alert" className="text-sm text-rose-300">
          {erreur}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onFermer}
          disabled={enCours}
          className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-slate-100 disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-lg bg-fuchsia-400 hover:bg-fuchsia-300 text-slate-950 text-sm font-semibold px-4 py-2 disabled:opacity-50"
        >
          {enCours
            ? modification
              ? "Enregistrement…"
              : "Chiffrement et envoi…"
            : modification
              ? "Enregistrer"
              : "Chiffrer et ranger"}
        </button>
      </div>
    </form>
  );
}
