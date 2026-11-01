import { useId, useState } from "react";
import Modal from "../Modal";
import { typeDe, dateFr } from "../../lib/coffre";
import { CATEGORIES_OBJETS, valeurObjet, garantieObjet, normaliserObjet } from "../../lib/inventaire";

/**
 * Ajout et modification d'un objet de l'inventaire.
 *
 * La facture se choisit parmi les documents du coffre : liée, elle donne la
 * fin de garantie (son échéance) et s'ouvre depuis la liste. Sans facture, on
 * peut saisir la fin de garantie ; sinon, la garantie légale de deux ans à
 * partir de la date d'achat est proposée.
 */

const CHAMP =
  "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/40";
const ETIQUETTE = "block text-micro text-slate-500 mb-1";

const VIDE = {
  nom: "",
  categorie: "informatique",
  dateAchat: "",
  prix: "",
  valeurManuelle: "",
  garantieFin: "",
  factureId: "",
  numeroSerie: "",
  notes: "",
};

const depuisObjet = (o) => ({
  nom: o.nom || "",
  categorie: o.categorie || "autre",
  dateAchat: o.dateAchat || "",
  prix: o.prix ?? "",
  valeurManuelle: o.valeurManuelle ?? "",
  garantieFin: o.garantieFin || "",
  factureId: o.factureId || "",
  numeroSerie: o.numeroSerie || "",
  notes: o.notes || "",
});

export default function FormulaireObjet({
  ouvert,
  objet,
  saisie,
  documents,
  aujourdhui,
  onFermer,
  onEnregistrer,
  onSupprimer,
}) {
  const titre = objet ? "Modifier l'objet" : "Ajouter un objet";
  return (
    <Modal
      open={ouvert}
      onClose={onFermer}
      label={titre}
      closeOnOverlayClick={false}
      showClose
      panelClassName="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      {ouvert && (
        <Formulaire
          titre={titre}
          objet={objet}
          saisie={saisie}
          documents={documents}
          aujourdhui={aujourdhui}
          onFermer={onFermer}
          onEnregistrer={onEnregistrer}
          onSupprimer={onSupprimer}
        />
      )}
    </Modal>
  );
}

function Formulaire({ titre, objet, saisie, documents, aujourdhui, onFermer, onEnregistrer, onSupprimer }) {
  const ids = useId();
  const [v, setV] = useState(() => ({ ...VIDE, ...(objet ? depuisObjet(objet) : {}), ...(saisie || {}) }));
  const champ = (cle) => (e) => setV((s) => ({ ...s, [cle]: e.target.value }));

  // Factures d'abord : ce sont elles qui portent une fin de garantie.
  const liables = [...documents].sort(
    (a, b) => (b.type === "facture") - (a.type === "facture") || a.titre.localeCompare(b.titre, "fr")
  );
  const apercu = normaliserObjet(v);
  const { valeur } = valeurObjet({ ...apercu, valeurManuelle: null }, aujourdhui);
  const garantie = garantieObjet(apercu, documents, aujourdhui);

  const soumettre = (e) => {
    e.preventDefault();
    onEnregistrer(v);
    onFermer();
  };

  return (
    <form onSubmit={soumettre} className="p-5 space-y-4">
      <h2 className="font-display text-lg text-slate-50">{titre}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label htmlFor={`${ids}-nom`} className={ETIQUETTE}>
            Objet
          </label>
          <input
            id={`${ids}-nom`}
            type="text"
            required
            value={v.nom}
            onChange={champ("nom")}
            placeholder="Ordinateur portable, lave-linge, vélo…"
            className={CHAMP}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-categorie`} className={ETIQUETTE}>
            Catégorie
          </label>
          <select id={`${ids}-categorie`} value={v.categorie} onChange={champ("categorie")} className={CHAMP}>
            {CATEGORIES_OBJETS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-achat`} className={ETIQUETTE}>
            Date d'achat
          </label>
          <input
            id={`${ids}-achat`}
            type="date"
            value={v.dateAchat}
            onChange={champ("dateAchat")}
            className={CHAMP}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-prix`} className={ETIQUETTE}>
            Prix d'achat (€)
          </label>
          <input
            id={`${ids}-prix`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={v.prix}
            onChange={champ("prix")}
            className={`${CHAMP} font-data`}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-valeur`} className={ETIQUETTE}>
            Valeur aujourd'hui (€, facultative)
          </label>
          <input
            id={`${ids}-valeur`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={v.valeurManuelle}
            onChange={champ("valeurManuelle")}
            placeholder={Number.isFinite(valeur) ? `estimée : ${valeur} €` : ""}
            className={`${CHAMP} font-data`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${ids}-facture`} className={ETIQUETTE}>
            Facture dans le coffre
          </label>
          <select id={`${ids}-facture`} value={v.factureId} onChange={champ("factureId")} className={CHAMP}>
            <option value="">Aucune</option>
            {liables.map((d) => (
              <option key={d.id} value={d.id}>
                {d.titre}
                {d.type !== "facture" ? ` (${typeDe(d.type).libelle})` : ""}
              </option>
            ))}
          </select>
        </div>
        {garantie.source !== "facture" && (
          <div>
            <label htmlFor={`${ids}-garantie`} className={ETIQUETTE}>
              Fin de garantie
            </label>
            <input
              id={`${ids}-garantie`}
              type="date"
              value={v.garantieFin}
              onChange={champ("garantieFin")}
              className={CHAMP}
            />
          </div>
        )}
        <div className={garantie.source === "facture" ? "sm:col-span-2" : ""}>
          <label htmlFor={`${ids}-serie`} className={ETIQUETTE}>
            Numéro de série
          </label>
          <input
            id={`${ids}-serie`}
            type="text"
            value={v.numeroSerie}
            onChange={champ("numeroSerie")}
            className={`${CHAMP} font-data`}
          />
        </div>
      </div>
      {garantie.fin && (
        <p className="text-micro text-slate-500">
          {garantie.source === "facture" &&
            `Garantie jusqu'au ${dateFr(garantie.fin)}, d'après la facture liée.`}
          {garantie.source === "saisie" && `Garantie jusqu'au ${dateFr(garantie.fin)}.`}
          {garantie.source === "legale" &&
            `Sans autre information : garantie légale de deux ans, jusqu'au ${dateFr(garantie.fin)}.`}
        </p>
      )}

      <div>
        <label htmlFor={`${ids}-notes`} className={ETIQUETTE}>
          Notes
        </label>
        <textarea
          id={`${ids}-notes`}
          rows={2}
          value={v.notes}
          onChange={champ("notes")}
          placeholder="Magasin, extension de garantie, réparations…"
          className={CHAMP}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {objet ? (
          <button
            type="button"
            onClick={() => onSupprimer(objet)}
            className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
          >
            Retirer de l'inventaire
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onFermer}
            className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-slate-100"
          >
            Annuler
          </button>
          <button
            type="submit"
            className="rounded-lg bg-fuchsia-400 hover:bg-fuchsia-300 text-slate-950 text-sm font-semibold px-4 py-2"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </form>
  );
}
