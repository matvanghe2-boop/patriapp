import { useId, useMemo, useState } from "react";
import { HandCoins, Check, Trash2, Plus, X } from "lucide-react";
import { Card, CardLabel, GhostButton, PastilleEtat, CARD_THEMES } from "./ui";
import EtatVide from "./EtatVide";
import Montant from "./Montant";
import MenuActions from "./MenuActions";
import { uid, todayIso } from "../lib/finance";
import { usePersistentState } from "../lib/storage";
import { useToast } from "../lib/ToastContext";
import { creerAvance, rapprocherAvances, soldesParPersonne } from "../lib/avances";

/**
 * Qui me doit quoi : les avances faites pour d'autres, remboursées dès que
 * leur virement apparaît sur le relevé (voir avances.js).
 */
const dateCourte = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const CHAMP = "w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-lime-400/60";

export default function Avances({ enrichies = [] }) {
  const ids = useId();
  const { showToast } = useToast();
  const [avances, setAvances] = usePersistentState("avances", []);
  const [formulaire, setFormulaire] = useState(false);
  const [brouillon, setBrouillon] = useState({ personne: "", montant: "", motif: "", date: todayIso(), opId: "" });

  const resultats = useMemo(() => rapprocherAvances(avances, enrichies), [avances, enrichies]);
  const soldes = useMemo(() => soldesParPersonne(resultats), [resultats]);
  const totalDu = soldes.reduce((s, x) => s + x.du, 0);
  // Les dépenses récentes du relevé, pour partir d'un paiement réel.
  const depenses = useMemo(
    () => [...enrichies].filter((o) => o.montant < 0 && o.famille !== "interne").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
    [enrichies]
  );

  const champ = (cle) => (e) => setBrouillon((b) => ({ ...b, [cle]: e.target.value }));
  const choisirDepense = (e) => {
    const op = depenses.find((o) => o.id === e.target.value);
    setBrouillon((b) =>
      op ? { ...b, opId: op.id, date: op.date, motif: b.motif || op.analyse?.titre || "", montant: b.montant || String(Math.abs(op.montant) / 100) } : { ...b, opId: "" }
    );
  };
  const ajouter = (e) => {
    e.preventDefault();
    const a = creerAvance({ id: uid(), ...brouillon, opId: brouillon.opId || null });
    if (!a) return;
    setAvances((l) => [...(Array.isArray(l) ? l : []), a]);
    setBrouillon({ personne: "", montant: "", motif: "", date: todayIso(), opId: "" });
    setFormulaire(false);
  };
  const marquerRembourse = (id) =>
    setAvances((l) => l.map((a) => (a.id === id ? { ...a, rembourseManuel: { date: todayIso() } } : a)));
  const supprimer = (id) => {
    const precedent = avances;
    setAvances((l) => l.filter((a) => a.id !== id));
    showToast({ message: "Avance supprimée.", onUndo: () => setAvances(precedent) });
  };

  const tries = [...resultats].sort((a, b) => (a.statut === "rembourse") - (b.statut === "rembourse") || b.avance.date.localeCompare(a.avance.date));

  return (
    <Card accent={CARD_THEMES.lime}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CardLabel icon={HandCoins}>Qui me doit quoi</CardLabel>
        <GhostButton theme="lime" icon={Plus} onClick={() => setFormulaire((f) => !f)}>
          Noter une avance
        </GhostButton>
      </div>
      <p className="text-mini text-slate-500 mt-1">
        Tu as payé pour d'autres ? Note-le : dès que leur virement arrive sur ton relevé, l'avance est soldée toute seule.
      </p>

      {soldes.length > 0 && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
          <div className="text-xs text-slate-400">
            On te doit <Montant valeur={totalDu} decimales={2} className="text-slate-100" />
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {soldes.map((s) => (
              <li key={s.personne} className="rounded-full border border-lime-400/25 bg-lime-500/5 px-2.5 py-0.5 text-micro text-lime-100">
                {s.personne} · <Montant valeur={s.du} decimales={2} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {formulaire && (
        <form onSubmit={ajouter} className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-lime-400/20 bg-slate-950 p-3">
          {depenses.length > 0 && (
            <div className="col-span-2 sm:col-span-4">
              <label htmlFor={`${ids}-depense`} className="text-micro text-slate-500">Partir d'une dépense du relevé (facultatif)</label>
              <select id={`${ids}-depense`} value={brouillon.opId} onChange={choisirDepense} className={CHAMP}>
                <option value="">Aucune</option>
                {depenses.map((o) => (
                  <option key={o.id} value={o.id}>
                    {dateCourte(o.date)} — {o.analyse?.titre} — {(Math.abs(o.montant) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`${ids}-personne`} className="text-micro text-slate-500">Qui</label>
            <input id={`${ids}-personne`} required value={brouillon.personne} onChange={champ("personne")} placeholder="Prénom Nom" className={CHAMP} />
          </div>
          <div>
            <label htmlFor={`${ids}-montant`} className="text-micro text-slate-500">Montant dû (€)</label>
            <input id={`${ids}-montant`} required type="number" step="0.01" min="0" value={brouillon.montant} onChange={champ("montant")} className={`${CHAMP} font-data`} />
          </div>
          <div>
            <label htmlFor={`${ids}-date`} className="text-micro text-slate-500">Date</label>
            <input id={`${ids}-date`} type="date" value={brouillon.date} onChange={champ("date")} className={`${CHAMP} font-data`} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`${ids}-motif`} className="text-micro text-slate-500">Pour quoi</label>
            <input id={`${ids}-motif`} value={brouillon.motif} onChange={champ("motif")} placeholder="Resto, billets…" className={CHAMP} />
          </div>
          <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
            <button type="button" onClick={() => setFormulaire(false)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
              <X size={13} aria-hidden="true" /> Annuler
            </button>
            <button type="submit" className="flex items-center gap-1.5 text-xs font-semibold bg-lime-400 hover:bg-lime-300 text-slate-950 rounded-lg px-4 py-1.5">
              <Check size={14} aria-hidden="true" /> Noter
            </button>
          </div>
          <p className="col-span-2 sm:col-span-4 text-micro text-slate-500">
            Écris le nom comme il apparaît sur ses virements : c'est lui qui sert à les reconnaître.
          </p>
        </form>
      )}

      {tries.length === 0 ? (
        <EtatVide picto="liquidites" titre="Personne ne te doit rien">
          Note une avance pour la suivre jusqu'au remboursement.
        </EtatVide>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {tries.map(({ avance, reste, statut, paiements }) => (
            <li key={avance.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${statut === "rembourse" ? "border-slate-800/60 bg-slate-950/30" : "border-slate-800 bg-slate-950/50"}`}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className={`text-corps ${statut === "rembourse" ? "text-slate-400" : "text-slate-100"}`}>{avance.personne}</span>
                  <PastilleEtat etat={statut === "rembourse" ? "ok" : statut === "partiel" ? "attention" : "neutre"}>
                    {statut === "rembourse" ? "Remboursé" : statut === "partiel" ? "En partie" : "Dû"}
                  </PastilleEtat>
                </span>
                <span className="block text-micro text-slate-500 mt-0.5">
                  {dateCourte(avance.date)}
                  {avance.motif && ` · ${avance.motif}`}
                  {paiements.length > 0 &&
                    ` · ${paiements.map((p) => `${p.manuel ? "marqué remboursé" : "virement"} le ${dateCourte(p.date)}`).join(", ")}`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <Montant valeur={avance.montant} decimales={2} className={`block text-corps ${statut === "rembourse" ? "text-slate-500" : "text-slate-100"}`} />
                {statut === "partiel" && (
                  <span className="block text-micro etat-attention">
                    reste <Montant valeur={reste} decimales={2} />
                  </span>
                )}
              </span>
              <MenuActions
                libelle={`Actions sur l'avance à ${avance.personne}`}
                actions={[
                  statut !== "rembourse" && { libelle: "Marquer remboursé (espèces, Lydia…)", icone: Check, onClick: () => marquerRembourse(avance.id) },
                  { libelle: "Supprimer", icone: Trash2, onClick: () => supprimer(avance.id), danger: true },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
