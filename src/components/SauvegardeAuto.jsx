import { useEffect, useState } from "react";
import { FolderSync, FolderOpen, Save, XCircle } from "lucide-react";
import Modal from "./Modal";
import { PastilleEtat } from "./ui";
import {
  sauvegardeAutoDisponible, etatSauvegardeAuto, choisirDossier, reprendrePermission, arreterSauvegardeAuto,
  ecrireSauvegarde, INTERVALLE_JOURS,
} from "../lib/sauvegardeAuto";

/**
 * Réglage de la sauvegarde automatique : choisir le dossier, sauvegarder
 * maintenant, arrêter. `exporter` fournit le contenu (le même que l'export
 * JSON manuel).
 */
const dateLisible = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "jamais");

export default function SauvegardeAuto({ ouvert, onFermer, exporter, onSauvegarde }) {
  const [etat, setEtat] = useState(null);
  const [message, setMessage] = useState("");
  const disponible = sauvegardeAutoDisponible();

  const rafraichir = () => etatSauvegardeAuto().then(setEtat);
  useEffect(() => {
    if (ouvert) etatSauvegardeAuto().then(setEtat);
  }, [ouvert]);

  const action = async (fonction) => {
    setMessage("");
    try {
      await fonction();
      await rafraichir();
    } catch (e) {
      // L'annulation du sélecteur de dossier n'est pas une erreur.
      if (e?.name !== "AbortError") setMessage("L'opération n'a pas abouti : le navigateur a refusé l'accès au dossier.");
    }
  };

  const sauvegarder = (poignee) =>
    action(async () => {
      const nom = await ecrireSauvegarde(poignee, exporter());
      onSauvegarde?.();
      setMessage(`Sauvegarde écrite : ${nom}`);
    });

  return (
    <Modal open={ouvert} onClose={onFermer} label="Sauvegarde automatique" showClose>
      <div className="p-5 flex flex-col gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg text-slate-50">
            <FolderSync size={18} className="text-emerald-300" aria-hidden="true" /> Sauvegarde automatique
          </h2>
          <p className="text-micro text-slate-500 mt-1">
            Choisis une fois un dossier — idéalement synchronisé avec ton cloud personnel — et Patrium y écrit une
            sauvegarde tous les {INTERVALLE_JOURS} jours, à l'ouverture. Le fichier est le même que l'export manuel,
            non chiffré.
          </p>
        </div>

        {!disponible ? (
          <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-400">
            Ton navigateur ne permet pas d'écrire dans un dossier (Chrome et Edge sur ordinateur le permettent). Le
            rappel d'export manuel reste actif.
          </p>
        ) : !etat ? null : !etat.active ? (
          <button
            type="button"
            onClick={() => action(async () => sauvegarder(await choisirDossier()))}
            className="btn-flash self-start inline-flex items-center gap-2 rounded-lg bg-emerald-400 hover:bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            <FolderOpen size={15} aria-hidden="true" /> Choisir le dossier
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              Dossier : <span className="font-data text-slate-100">{etat.nom}</span>
              <PastilleEtat etat={etat.permission === "granted" ? "ok" : "attention"}>
                {etat.permission === "granted" ? "Actif" : "Accès à confirmer"}
              </PastilleEtat>
            </div>
            <p className="text-micro text-slate-500">Dernière sauvegarde automatique : {dateLisible(etat.derniere)}</p>
            <div className="flex flex-wrap gap-2">
              {etat.permission !== "granted" ? (
                <button
                  type="button"
                  onClick={() => action(async () => { if (await reprendrePermission(etat.poignee)) await sauvegarder(etat.poignee); })}
                  className="btn-flash inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
                >
                  <FolderSync size={13} aria-hidden="true" /> Reprendre
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => sauvegarder(etat.poignee)}
                  className="btn-flash inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
                >
                  <Save size={13} aria-hidden="true" /> Sauvegarder maintenant
                </button>
              )}
              <button
                type="button"
                onClick={() => action(async () => { if (await choisirDossier()) setMessage("Dossier changé."); })}
                className="btn-flash inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
              >
                <FolderOpen size={13} aria-hidden="true" /> Changer de dossier
              </button>
              <button
                type="button"
                onClick={() => action(arreterSauvegardeAuto)}
                className="btn-flash inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-rose-300"
              >
                <XCircle size={13} aria-hidden="true" /> Arrêter
              </button>
            </div>
          </div>
        )}
        {message && <p className="text-micro text-slate-400" role="status">{message}</p>}
      </div>
    </Modal>
  );
}
