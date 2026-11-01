import { useMemo, useState } from "react";
import { Plus, FileText, ChevronRight, Package, Printer } from "lucide-react";
import DossierSinistre from "./DossierSinistre";
import { Card, PastilleEtat } from "../ui";
import EtatVide from "../EtatVide";
import Montant from "../Montant";
import { dateFr } from "../../lib/coffre";
import {
  categorieObjet,
  valeurObjet,
  garantieObjet,
  totauxInventaire,
  trierObjets,
  factureDe,
} from "../../lib/inventaire";

/**
 * Sous-onglet « Objets » du coffre : l'inventaire de ce qu'on possède, avec
 * prix, garantie, facture et valeur du jour (COFFRE_SPEC.md, jalon 6).
 *
 * Le total sert surtout à une question précise : pour combien de biens
 * s'assurer en assurance habitation. La valeur du jour est une vétusté
 * indicative, et l'écran le dit.
 */

const boutonPrincipal =
  "inline-flex items-center gap-2 rounded-lg bg-fuchsia-400 hover:bg-fuchsia-300 text-slate-950 text-sm font-semibold px-4 py-2";

const moisAnnee = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { month: "2-digit", year: "numeric" });

export default function VueObjets({ coffre, userId, aujourdhui, onAjouter, onModifier, onOuvrirDocument }) {
  const [dossierOuvert, setDossierOuvert] = useState(false);
  const objets = useMemo(() => trierObjets(coffre.objets || [], aujourdhui), [coffre.objets, aujourdhui]);
  const totaux = useMemo(
    () => totauxInventaire(coffre.objets || [], aujourdhui),
    [coffre.objets, aujourdhui]
  );

  if (objets.length === 0) {
    return (
      <Card>
        <EtatVide
          picto="maison"
          titre="Aucun objet dans l'inventaire"
          action={
            <button type="button" onClick={onAjouter} className={boutonPrincipal}>
              <Plus size={16} aria-hidden="true" />
              Ajouter un objet
            </button>
          }
        >
          Ordinateur, téléphone, électroménager, vélo : note ce que tu possèdes, avec sa facture et sa
          garantie. En cas de panne, de vol ou de dégât des eaux, tout est au même endroit. Depuis la fiche
          d'une facture, « Ajouter à l'inventaire » préremplit l'objet.
        </EtatVide>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <dl className="grid grid-cols-3 gap-4">
            <div>
              <dt className="text-micro text-slate-500">Objets</dt>
              <dd className="text-lead text-slate-100 font-data">{totaux.nombre}</dd>
            </div>
            <div>
              <dt className="text-micro text-slate-500">Prix d'achat</dt>
              <dd className="text-lead text-slate-100">
                <Montant valeur={totaux.achat} />
              </dd>
            </div>
            <div>
              <dt className="text-micro text-slate-500">Valeur aujourd'hui</dt>
              <dd className="text-lead text-fuchsia-200">
                <Montant valeur={totaux.valeur} />
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDossierOuvert(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-fuchsia-400/60"
            >
              <Printer size={16} aria-hidden="true" />
              Dossier sinistre
            </button>
            <button type="button" onClick={onAjouter} className={boutonPrincipal}>
              <Plus size={16} aria-hidden="true" />
              Ajouter un objet
            </button>
          </div>
        </div>
        <p className="mt-3 text-micro text-slate-500">
          Valeur du jour : estimation indicative, par une vétusté annuelle selon la catégorie (informatique 25
          %, téléphonie 30 %, électroménager 15 %, mobilier 10 %…), sauf valeur saisie. Ce n'est ni une cote
          de revente ni la grille d'un assureur, mais un ordre de grandeur pour choisir le montant de biens à
          assurer.
        </p>
      </Card>

      <ul
        aria-label="Objets de l'inventaire"
        className="rounded-2xl border border-slate-800 bg-slate-900 divide-y divide-slate-800 overflow-hidden"
      >
        {objets.map((o) => (
          <LigneObjet
            key={o.id}
            objet={o}
            documents={coffre.documents}
            aujourdhui={aujourdhui}
            onModifier={onModifier}
            onOuvrirDocument={onOuvrirDocument}
          />
        ))}
      </ul>

      <DossierSinistre
        ouvert={dossierOuvert}
        objets={objets}
        documents={coffre.documents}
        userId={userId}
        aujourdhui={aujourdhui}
        onFermer={() => setDossierOuvert(false)}
      />
    </>
  );
}

function LigneObjet({ objet, documents, aujourdhui, onModifier, onOuvrirDocument }) {
  const { valeur, estimee } = valeurObjet(objet, aujourdhui);
  const garantie = garantieObjet(objet, documents, aujourdhui);
  const facture = factureDe(objet, documents);
  const achat = [
    categorieObjet(objet.categorie).libelle,
    objet.dateAchat && `acheté le ${dateFr(objet.dateAchat)}`,
  ].filter(Boolean);

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={() => onModifier(objet)}
        className="flex flex-1 min-w-[12rem] items-center gap-3 text-left focus-visible:outline-none focus-visible:underline"
      >
        <Package size={18} className="text-slate-500 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-sm text-slate-100 truncate">{objet.nom}</span>
          <span className="block text-micro text-slate-500 truncate">
            {achat.join(" · ")}
            {Number.isFinite(objet.prix) && (
              <>
                {" · "}
                <Montant valeur={objet.prix} />
              </>
            )}
          </span>
        </span>
      </button>
      {garantie.fin && (
        <PastilleEtat etat={garantie.active ? "ok" : "neutre"}>
          {garantie.active ? `Garantie → ${moisAnnee(garantie.fin)}` : "Garantie terminée"}
        </PastilleEtat>
      )}
      {facture && (
        <button
          type="button"
          onClick={() => onOuvrirDocument(facture.id)}
          aria-label={`Facture de ${objet.nom}`}
          className="inline-flex items-center gap-1 text-micro text-fuchsia-300 hover:underline"
        >
          <FileText size={14} aria-hidden="true" />
          Facture
        </button>
      )}
      <span className="w-24 text-right">
        {Number.isFinite(valeur) ? (
          <>
            <Montant valeur={valeur} className="block text-sm text-slate-100" />
            <span className="block text-micro text-slate-500">{estimee ? "estimée" : "saisie"}</span>
          </>
        ) : (
          <span className="text-micro text-slate-500">sans prix</span>
        )}
      </span>
      <ChevronRight size={16} className="text-slate-600 shrink-0" aria-hidden="true" />
    </li>
  );
}
