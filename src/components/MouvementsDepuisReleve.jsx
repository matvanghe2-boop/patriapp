import { useId, useState } from "react";
import { Hourglass, Plus } from "lucide-react";
import { Card, CardLabel, IconTrash } from "./ui";
import Montant from "./Montant";
import { MontantSigne } from "./OperationsCompte";
import { lireNombre, todayIso, uid } from "../lib/finance";

/**
 * Mouvements connus depuis le dernier relevé, saisis à la main.
 *
 * Le relevé d'un mois n'arrive qu'une fois le mois clos. Un gros mouvement
 * entre-temps — un virement vers le PEA — faisait mentir le patrimoine
 * pendant des semaines. Ces lignes corrigent le solde estimé, donc le
 * patrimoine, et rien d'autre : elles disparaissent d'elles-mêmes à l'import
 * du relevé qui couvre leur date.
 */

const dateCourte = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");

function lendemain(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(a, m - 1, j + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function joursEntre(debut, fin) {
  const [a1, m1, j1] = debut.split("-").map(Number);
  const [a2, m2, j2] = fin.split("-").map(Number);
  return Math.round((new Date(a2, m2 - 1, j2) - new Date(a1, m1 - 1, j1)) / 86400000);
}

export default function MouvementsDepuisReleve({ estime, setProvisoires, onMarquerHorsCompte }) {
  const ids = useId();
  const aujourdhui = todayIso();
  const premierJour = lendemain(estime.date);
  const vierge = { date: aujourdhui > premierJour ? aujourdhui : premierJour, libelle: "", montant: "", sens: "sortie" };
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState(vierge);
  const [erreur, setErreur] = useState(null);
  const retard = joursEntre(estime.date, aujourdhui);

  const ajouter = (e) => {
    e.preventDefault();
    // `\s` couvre aussi les espaces insécables : « 2 000 » se lit 2000.
    const valeur = lireNombre(String(brouillon.montant).replace(/\s/g, ""));
    if (!valeur || valeur <= 0) return setErreur("Indique un montant positif ; le sens se choisit à côté.");
    if (!(brouillon.date > estime.date)) {
      return setErreur(`La date doit suivre le dernier relevé (${dateCourte(estime.date)}) : avant, il contient déjà les vraies opérations.`);
    }
    const centimes = Math.round(valeur * 100) * (brouillon.sens === "sortie" ? -1 : 1);
    setProvisoires((p) => [
      ...(p || []),
      { id: uid(), date: brouillon.date, libelle: brouillon.libelle.trim() || "Mouvement", montant: centimes },
    ]);
    setBrouillon(vierge);
    setErreur(null);
    setOuvert(false);
  };

  const champ =
    "bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-400/40";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardLabel icon={Hourglass}>Depuis le relevé du {dateCourte(estime.date)}</CardLabel>
        {!ouvert && (
          <button
            type="button"
            onClick={() => setOuvert(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
          >
            <Plus size={13} aria-hidden="true" /> Ajouter un mouvement
          </button>
        )}
      </div>

      {estime.provisoires.length + estime.autres.length + estime.provisoiresEnDouble.length + estime.horsCompte.length > 0 ? (
        <>
          <ul className="divide-y divide-slate-800/70 text-sm mt-1">
            {/* Saisis dans PEA & Bourse ou dans un livret : comptés d'office,
                sans rien ressaisir ici. */}
            {estime.autres.map((m) => (
              <li key={m.cle} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="text-xs text-slate-500 w-20">{dateCourte(m.date)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-slate-200">{m.libelle}</span>
                  <span className="block text-micro text-slate-500">
                    Enregistré dans {m.source === "bourse" ? "PEA & Bourse" : "Livrets & Épargne"}
                  </span>
                </span>
                <MontantSigne centimes={m.montant} />
                {onMarquerHorsCompte && (
                  <button
                    type="button"
                    onClick={() => onMarquerHorsCompte(m, true)}
                    className="text-micro text-slate-500 hover:text-slate-200 underline underline-offset-2"
                  >
                    Pas depuis ce compte
                  </button>
                )}
              </li>
            ))}
            {estime.provisoires.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <span className="text-xs text-slate-500 w-20">{dateCourte(p.date)}</span>
                <span className="flex-1 min-w-0 truncate text-slate-200">{p.libelle}</span>
                <MontantSigne centimes={p.montant} />
                <IconTrash
                  onClick={() => setProvisoires((liste) => (liste || []).filter((x) => x.id !== p.id))}
                  label={`Retirer « ${p.libelle} »`}
                />
              </li>
            ))}
            {estime.provisoiresEnDouble.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2 opacity-70">
                <span className="text-xs text-slate-500 w-20">{dateCourte(p.date)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-slate-300 line-through">{p.libelle}</span>
                  <span className="block text-micro text-slate-500">
                    Doublon de « {p.double.libelle} », déjà compté : tu peux le retirer
                  </span>
                </span>
                <MontantSigne centimes={p.montant} />
                <IconTrash
                  onClick={() => setProvisoires((liste) => (liste || []).filter((x) => x.id !== p.id))}
                  label={`Retirer « ${p.libelle} »`}
                />
              </li>
            ))}
            {estime.horsCompte.map((m) => (
              <li key={m.cle} className="flex items-center gap-3 py-2 opacity-70">
                <span className="text-xs text-slate-500 w-20">{dateCourte(m.date)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-slate-300">{m.libelle}</span>
                  <span className="block text-micro text-slate-500">Payé depuis une autre banque : non compté</span>
                </span>
                {onMarquerHorsCompte && (
                  <button
                    type="button"
                    onClick={() => onMarquerHorsCompte(m, false)}
                    className="text-micro text-slate-500 hover:text-slate-200 underline underline-offset-2"
                  >
                    Il vient bien de ce compte
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400 mt-2">
            Solde estimé : <Montant valeur={estime.solde / 100} decimales={2} className="text-slate-100" /> — relevé{" "}
            <Montant valeur={estime.soldeReleve / 100} decimales={2} />, {estime.ajustement > 0 ? "+" : ""}
            <Montant valeur={estime.ajustement / 100} decimales={2} /> depuis.
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-400 mt-1">
          {retard > 7
            ? `Ton dernier relevé s'arrête il y a ${retard} jours. Si un gros mouvement a eu lieu depuis — un virement vers ton PEA, une grosse dépense — ajoute-le : ton patrimoine restera juste en attendant le prochain relevé.`
            : "Aucun mouvement depuis le dernier relevé."}
        </p>
      )}

      {ouvert && (
        <form onSubmit={ajouter} className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor={`${ids}-date`} className="text-micro text-slate-500 block mb-1">Date</label>
              <input
                id={`${ids}-date`}
                type="date"
                min={premierJour}
                required
                value={brouillon.date}
                onChange={(e) => setBrouillon((b) => ({ ...b, date: e.target.value }))}
                className={`${champ} w-full`}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor={`${ids}-libelle`} className="text-micro text-slate-500 block mb-1">Libellé</label>
              <input
                id={`${ids}-libelle`}
                type="text"
                placeholder="Virement vers mon PEA"
                value={brouillon.libelle}
                onChange={(e) => setBrouillon((b) => ({ ...b, libelle: e.target.value }))}
                className={`${champ} w-full`}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-sens`} className="text-micro text-slate-500 block mb-1">Sens</label>
              <select
                id={`${ids}-sens`}
                value={brouillon.sens}
                onChange={(e) => setBrouillon((b) => ({ ...b, sens: e.target.value }))}
                className={`${champ} w-full`}
              >
                <option value="sortie">Sortie du compte</option>
                <option value="entree">Entrée sur le compte</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${ids}-montant`} className="text-micro text-slate-500 block mb-1">Montant (€)</label>
              <input
                id={`${ids}-montant`}
                type="text"
                inputMode="decimal"
                placeholder="2000"
                value={brouillon.montant}
                onChange={(e) => setBrouillon((b) => ({ ...b, montant: e.target.value }))}
                className={`${champ} w-full font-data tabular-nums`}
              />
            </div>
          </div>
          {erreur && <p role="alert" className="text-xs text-rose-300">{erreur}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOuvert(false);
                setErreur(null);
                setBrouillon(vierge);
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="rounded-lg border border-lime-400/50 bg-lime-400/15 px-3 py-1.5 text-xs text-lime-100 hover:bg-lime-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/40"
            >
              Ajouter
            </button>
          </div>
        </form>
      )}

      <p className="text-micro text-slate-500 mt-3">
        Ces mouvements corrigent seulement le solde et le patrimoine, en attendant le relevé. Les versements saisis dans
        PEA & Bourse ou dans un livret y figurent d'office : inutile de les ressaisir ici. Rien n'entre dans les
        statistiques, et tout est remplacé par les vraies opérations à l'import du relevé qui couvre leur date.
      </p>
    </Card>
  );
}
