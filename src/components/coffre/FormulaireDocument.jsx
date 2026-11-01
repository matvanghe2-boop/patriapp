import { useEffect, useId, useState } from "react";
import { Upload, X, FileText, Image as IconeImage } from "lucide-react";
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
import { texteDuPdf } from "../../lib/lirePdf";
import { suggererDates } from "../../lib/datesDocument";

/**
 * Ajout et modification d'un document du coffre.
 *
 * À l'ajout, au moins un fichier est obligatoire ; on peut en joindre
 * plusieurs (recto et verso, contrat et conditions générales). Ils sont
 * chiffrés puis envoyés par `onEnregistrer`, qui peut échouer (réseau, bucket
 * absent) : l'erreur s'affiche alors ici, formulaire intact, pour réessayer
 * sans tout ressaisir. En modification, les fichiers choisis s'AJOUTENT à
 * ceux du document ; on en retire un depuis la fiche.
 *
 * Pour un PDF qui contient du texte, les dates qu'il mentionne sont proposées
 * à côté des champs (voir datesDocument.js). La lecture se fait sur
 * l'appareil, et rien n'est appliqué sans un clic.
 */

const CHAMP =
  "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40";
const ETIQUETTE = "block text-micro text-slate-500 mb-1";
const ACCEPT = Object.keys(FORMATS_ACCEPTES).join(",");
/** Au-delà, mieux vaut un PDF de plusieurs pages qu'une pile de photos. */
export const MAX_FICHIERS = 10;

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

const memeFichier = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

export default function FormulaireDocument({
  ouvert,
  initial,
  fichiersInitiaux = [],
  contracts = [],
  onFermer,
  onEnregistrer,
}) {
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
          fichiersInitiaux={fichiersInitiaux}
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

/** Sépare les fichiers acceptables du premier problème rencontré. */
function trier(liste) {
  const valides = [];
  let probleme = null;
  for (const f of liste) {
    const p = verifierFichier(f);
    if (p) probleme = probleme || `${f.name} : ${p}`;
    else valides.push(f);
  }
  return { valides, probleme };
}

function Formulaire({
  initial,
  fichiersInitiaux,
  contracts,
  titreFenetre,
  enCours,
  setEnCours,
  onFermer,
  onEnregistrer,
}) {
  const ids = useId();
  const modification = !!initial;
  const [v, setV] = useState(() => (initial ? depuisDocument(initial) : VIDE));
  const [depart] = useState(() => trier(fichiersInitiaux));
  const [fichiers, setFichiers] = useState(() => depart.valides.slice(0, MAX_FICHIERS));
  const [erreur, setErreur] = useState(depart.probleme);
  const [survol, setSurvol] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const type = typeDe(v.type);
  const champ = (cle) => (e) => setV((s) => ({ ...s, [cle]: e.target.value }));
  const changerType = (e) => {
    const id = e.target.value;
    setV((s) => ({ ...s, type: id, recurrence: typeDe(id).recurrence || null }));
  };

  const ajouter = (liste) => {
    const { valides, probleme } = trier([...(liste || [])]);
    setErreur(probleme);
    setFichiers((l) =>
      [...l, ...valides.filter((f) => !l.some((x) => memeFichier(x, f)))].slice(0, MAX_FICHIERS)
    );
  };
  const retirer = (i) => setFichiers((l) => l.filter((_, j) => j !== i));

  // Dates proposées, lues dans le premier PDF choisi.
  const pdf = fichiers.find((f) => f.type === "application/pdf") || null;
  useEffect(() => {
    if (!pdf) return undefined;
    let annule = false;
    texteDuPdf(pdf)
      .then((texte) => {
        if (!annule) setSuggestions({ fichier: pdf, ...suggererDates(texte) });
      })
      .catch(() => {
        /* PDF illisible : rien à proposer, la saisie reste possible */
      });
    return () => {
      annule = true;
    };
  }, [pdf]);
  const dates = suggestions && suggestions.fichier === pdf ? suggestions : null;

  const garantie = !v.echeance ? garantieParDefaut(v.type, v.dateDocument) : null;

  const soumettre = async (e) => {
    e.preventDefault();
    if (!modification && fichiers.length === 0) {
      setErreur(erreur || "Choisis au moins un fichier.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      await onEnregistrer(v, fichiers);
      onFermer();
    } catch (err) {
      setErreur(err?.message || "L'enregistrement n'a pas abouti.");
    } finally {
      setEnCours(false);
    }
  };

  const nbExistants = initial?.fichiers?.length || 0;

  return (
    <form onSubmit={soumettre} className="p-5 space-y-4">
      <h2 className="font-display text-lg text-slate-50">{titreFenetre}</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          ajouter(e.dataTransfer?.files);
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
          <span>
            {modification
              ? "Ajouter des fichiers à ce document (facultatif)"
              : fichiers.length
                ? "Ajouter un autre fichier : verso, page suivante…"
                : "Choisir un PDF ou une photo"}
          </span>
          <span className="text-micro text-slate-500">
            ou glisse les fichiers ici · 20 Mo par fichier
            {modification && nbExistants > 0 && ` · le document en a déjà ${nbExistants}`}
          </span>
        </label>
        <input
          id={`${ids}-fichier`}
          type="file"
          multiple
          accept={ACCEPT}
          aria-label="Fichiers à ranger"
          className="sr-only"
          onChange={(e) => {
            ajouter(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {fichiers.length > 0 && (
        <ul className="space-y-1" aria-label="Fichiers choisis">
          {fichiers.map((f, i) => {
            const Icone = f.type.startsWith("image/") ? IconeImage : FileText;
            return (
              <li
                key={`${f.name}-${f.size}-${f.lastModified}`}
                className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-sm"
              >
                <Icone size={16} className="text-slate-500 shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0 truncate text-slate-200">{f.name}</span>
                <span className="text-micro text-slate-500">{formatTaille(f.size)}</span>
                <button
                  type="button"
                  onClick={() => retirer(i)}
                  aria-label={`Retirer ${f.name}`}
                  className="text-slate-500 hover:text-slate-200"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
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
          <Suggestions
            dates={dates?.documents}
            valeur={v.dateDocument}
            onChoisir={(date) => setV((s) => ({ ...s, dateDocument: date }))}
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
          <Suggestions
            dates={dates?.echeances}
            valeur={v.echeance}
            onChoisir={(date) => setV((s) => ({ ...s, echeance: date }))}
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
            ? fichiers.length
              ? "Chiffrement et envoi…"
              : "Enregistrement…"
            : modification
              ? "Enregistrer"
              : "Chiffrer et ranger"}
        </button>
      </div>
    </form>
  );
}

/** Dates trouvées dans le PDF, proposées sous un champ. */
function Suggestions({ dates, valeur, onChoisir }) {
  const proposees = (dates || []).filter((s) => s.date !== valeur);
  if (proposees.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-micro text-slate-500">Dans le PDF :</span>
      {proposees.map((s) => (
        <button
          key={s.date}
          type="button"
          title={s.contexte}
          onClick={() => onChoisir(s.date)}
          className="rounded-md border border-fuchsia-400/40 px-1.5 py-0.5 text-micro font-data text-fuchsia-200 hover:bg-fuchsia-400/10"
        >
          {dateFr(s.date)}
        </button>
      ))}
    </div>
  );
}
