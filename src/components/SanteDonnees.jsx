import { useMemo } from "react";
import { Stethoscope, ChevronRight } from "lucide-react";
import Modal from "./Modal";
import EtatVide from "./EtatVide";
import { PastilleEtat } from "./ui";
import { usePatrimoine } from "../lib/PatrimoineContext";
import { controlesDonnees } from "../lib/qualiteDonnees";
import { allerVers } from "../lib/useHashRoute";

/**
 * Santé des données : toutes les incohérences, chacune avec l'onglet où la
 * corriger. Aucune correction n'est faite d'office — l'application ne sait pas
 * lequel des deux chiffres est le bon.
 */
export default function SanteDonnees({ ouvert, onFermer }) {
  const patrimoine = usePatrimoine();
  const controles = useMemo(
    () => (ouvert ? controlesDonnees(patrimoine) : []),
    // Recalculé à l'ouverture : la liste n'a pas à suivre chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ouvert]
  );
  const parDomaine = useMemo(() => {
    const m = new Map();
    for (const c of controles) {
      if (!m.has(c.domaine)) m.set(c.domaine, []);
      m.get(c.domaine).push(c);
    }
    return [...m.entries()];
  }, [controles]);

  return (
    <Modal open={ouvert} onClose={onFermer} label="Santé des données" showClose panelClassName="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
      <div className="p-5 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg text-slate-50">
            <Stethoscope size={18} className="text-emerald-300" aria-hidden="true" /> Santé des données
          </h2>
          <p className="text-micro text-slate-500 mt-1">
            Ce qui fausse peut-être tes totaux, tous onglets confondus. Rien n'est corrigé d'office.
          </p>
        </div>

        {controles.length === 0 ? (
          <EtatVide picto="recherche" titre="Tout est cohérent">
            Aucune incohérence trouvée dans tes livrets, ton portefeuille, tes relevés, tes abonnements et tes thèses.
          </EtatVide>
        ) : (
          parDomaine.map(([domaine, liste]) => (
            <section key={domaine}>
              <h3 className="text-micro uppercase tracking-wide text-slate-500 mb-1.5">{domaine}</h3>
              <ul className="flex flex-col gap-1.5">
                {liste.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        allerVers(c.lien.onglet, c.lien.sous);
                        onFermer?.();
                      }}
                      className="btn-flash w-full flex items-center gap-3 text-left rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 hover:border-slate-700"
                    >
                      <PastilleEtat etat={c.gravite === "attention" ? "attention" : "neutre"} className="shrink-0">
                        {c.gravite === "attention" ? "À corriger" : "À vérifier"}
                      </PastilleEtat>
                      <span className="flex-1 min-w-0 text-sm text-slate-300">{c.texte}</span>
                      <ChevronRight size={14} className="shrink-0 text-slate-500" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </Modal>
  );
}
