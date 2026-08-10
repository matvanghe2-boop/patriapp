import { useMemo, useState } from "react";
import { FileText, Repeat, AlertTriangle, CalendarClock, Wallet, X } from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, EmptyState, PageGlow, CARD_THEMES } from "./ui";
import { eur, uid, todayIso } from "../lib/finance";

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateFr(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Module 1 : Contrats & échéances ────────────────────────────────────────
// Statut dérivé de : date de fin d'engagement + préavis de résiliation (jours).
// deadline = date_fin - préavis. À partir de là, le contrat est "à résilier".
function computeContractStatus(contract) {
  const today = todayIso();
  if (!contract.date_fin) return { key: "actif", label: "Actif", cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" };
  if (contract.date_fin < today) return { key: "expire", label: "Expiré", cls: "bg-slate-500/10 border-slate-500/30 text-slate-400" };

  const deadline = addDays(contract.date_fin, -(contract.preavis_jours || 0));
  if (today >= deadline) return { key: "a_resilier", label: "À résilier", cls: "bg-rose-500/10 border-rose-500/30 text-rose-300" };

  const daysToDeadline = Math.round((new Date(`${deadline}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
  if (daysToDeadline <= 30) return { key: "a_renouveler", label: "À renouveler", cls: "bg-amber-500/10 border-amber-500/30 text-amber-300" };

  return { key: "actif", label: "Actif", cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" };
}

const CONTRACT_CATEGORIES = ["Bail / Logement", "Assurance", "Garantie", "Télécom / Internet", "Énergie", "Autre"];

function ContractForm({ open, onClose, onSubmit, initial }) {
  const blank = { category: "Bail / Logement", label: "", date_fin: "", preavis_jours: 30, notes: "" };
  const [v, setV] = useState(initial || blank);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!v.label.trim()) return;
    onSubmit({ ...v, preavis_jours: parseInt(v.preavis_jours) || 0 });
  };

  return (
    <form onSubmit={submit} className="mt-3 p-4 rounded-xl border border-cyan-400/20 bg-slate-950 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="text-[11px] text-slate-500">Nom du contrat</label>
          <input required type="text" placeholder="Assurance habitation" value={v.label}
            onChange={(e) => setV((s) => ({ ...s, label: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60" />
        </div>
        <div>
          <label className="text-[11px] text-slate-500">Catégorie</label>
          <select value={v.category} onChange={(e) => setV((s) => ({ ...s, category: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60">
            {CONTRACT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-slate-500">Préavis (jours)</label>
          <input type="number" min="0" value={v.preavis_jours}
            onChange={(e) => setV((s) => ({ ...s, preavis_jours: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60" />
        </div>
        <div className="col-span-2">
          <label className="text-[11px] text-slate-500">Date de fin d'engagement / tacite reconduction</label>
          <input required type="date" value={v.date_fin}
            onChange={(e) => setV((s) => ({ ...s, date_fin: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60" />
        </div>
        <div className="col-span-2">
          <label className="text-[11px] text-slate-500">Notes (optionnel)</label>
          <input type="text" placeholder="N° de contrat, organisme..." value={v.notes}
            onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
          <X size={13} /> Annuler
        </button>
        <button type="submit" className="text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg px-4 py-1.5">
          Enregistrer
        </button>
      </div>
    </form>
  );
}

function ContractsModule({ contracts, setContracts }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const addContract = (v) => {
    setContracts((c) => [...c, { id: uid(), ...v }]);
    setShowForm(false);
  };
  const updateContract = (id, v) => {
    setContracts((c) => c.map((x) => (x.id === id ? { ...x, ...v } : x)));
    setEditingId(null);
  };
  const removeContract = (id) => setContracts((c) => c.filter((x) => x.id !== id));

  const sorted = useMemo(
    () => [...contracts].sort((a, b) => (a.date_fin || "9999") < (b.date_fin || "9999") ? -1 : 1),
    [contracts]
  );
  const editingContract = editingId ? contracts.find((c) => c.id === editingId) : null;

  return (
    <Card accent={CARD_THEMES.cyan}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <CardLabel icon={FileText}>Contrats & échéances de résiliation</CardLabel>
        <GhostButton theme="cyan" onClick={() => { setShowForm((s) => !s); setEditingId(null); }}>
          Ajouter un contrat
        </GhostButton>
      </div>

      {showForm && <ContractForm open onClose={() => setShowForm(false)} onSubmit={addContract} />}
      {editingContract && (
        <ContractForm open initial={editingContract} onClose={() => setEditingId(null)} onSubmit={(v) => updateContract(editingId, v)} />
      )}

      {sorted.length === 0 ? (
        <EmptyState>Aucun contrat suivi — ajoute un bail, une assurance ou une garantie pour ne plus rater une échéance de résiliation.</EmptyState>
      ) : (
        <div className="overflow-x-auto mt-2 -mx-1">
          <table className="w-full text-sm min-w-[680px] table-cards">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="py-2 px-1">Contrat</th>
                <th className="py-2 px-1">Catégorie</th>
                <th className="py-2 px-1">Fin d'engagement</th>
                <th className="py-2 px-1">Date limite de résiliation</th>
                <th className="py-2 px-1">Statut</th>
                <th className="py-2 px-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sorted.map((c) => {
                const status = computeContractStatus(c);
                const deadline = c.date_fin ? addDays(c.date_fin, -(c.preavis_jours || 0)) : null;
                return (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                    <td data-label="Contrat" className="py-2.5 px-1">
                      <div className="text-slate-100 font-medium">{c.label}</div>
                      {c.notes && <div className="text-[11px] text-slate-500">{c.notes}</div>}
                    </td>
                    <td data-label="Catégorie" className="py-2.5 px-1 text-slate-400 text-xs">{c.category}</td>
                    <td data-label="Fin d'engagement" className="py-2.5 px-1 font-data tabular-nums text-slate-300">{formatDateFr(c.date_fin)}</td>
                    <td data-label="Date limite de résiliation" className="py-2.5 px-1 font-data tabular-nums text-amber-300">
                      {deadline ? formatDateFr(deadline) : "—"}
                      {c.preavis_jours > 0 && <span className="text-[10px] text-slate-600 block">préavis {c.preavis_jours} j</span>}
                    </td>
                    <td data-label="Statut" className="py-2.5 px-1">
                      <span className={`flex items-center gap-1.5 w-fit text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${status.cls}`}>
                        {status.key === "a_resilier" && <AlertTriangle size={11} />}
                        {status.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-1">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingId(c.id); setShowForm(false); }} className="text-[11px] text-slate-500 hover:text-cyan-300 px-2">
                          Modifier
                        </button>
                        <IconTrash onClick={() => removeContract(c.id)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Module 2 : Dépenses récurrentes / abonnements ─────────────────────────
function monthlyEquivalent(sub) {
  return sub.frequence === "annuelle" ? sub.montant / 12 : sub.montant;
}
function annualEquivalent(sub) {
  return sub.frequence === "annuelle" ? sub.montant : sub.montant * 12;
}

// Prochaine date de prélèvement à partir de la dernière échéance connue,
// projetée en avant (mensuelle : +1 mois, annuelle : +1 an) jusqu'à tomber
// sur ou après aujourd'hui.
function nextChargeDate(sub) {
  if (!sub.prochaine_date) return null;
  let d = new Date(`${sub.prochaine_date}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);
  while (d < today) {
    if (sub.frequence === "annuelle") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

const SUB_CATEGORIES = ["Streaming", "Logiciel / Cloud", "Sport / Bien-être", "Presse", "Téléphonie", "Assurance", "Autre"];

function SubForm({ open, onClose, onSubmit, initial }) {
  const blank = { category: "Streaming", label: "", montant: "", frequence: "mensuelle", prochaine_date: todayIso() };
  const [v, setV] = useState(initial || blank);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!v.label.trim() || !v.montant) return;
    onSubmit({ ...v, montant: parseFloat(v.montant) || 0 });
  };

  return (
    <form onSubmit={submit} className="mt-3 p-4 rounded-xl border border-amber-400/20 bg-slate-950 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="text-[11px] text-slate-500">Nom de l'abonnement</label>
          <input required type="text" placeholder="Netflix, Salle de sport..." value={v.label}
            onChange={(e) => setV((s) => ({ ...s, label: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-amber-400/60" />
        </div>
        <div>
          <label className="text-[11px] text-slate-500">Catégorie</label>
          <select value={v.category} onChange={(e) => setV((s) => ({ ...s, category: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-amber-400/60">
            {SUB_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-slate-500">Fréquence</label>
          <select value={v.frequence} onChange={(e) => setV((s) => ({ ...s, frequence: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-amber-400/60">
            <option value="mensuelle">Mensuelle</option>
            <option value="annuelle">Annuelle</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] text-slate-500">Montant (€)</label>
          <input required type="number" step="0.01" min="0" value={v.montant}
            onChange={(e) => setV((s) => ({ ...s, montant: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
        </div>
        <div>
          <label className="text-[11px] text-slate-500">Prochain prélèvement</label>
          <input type="date" value={v.prochaine_date}
            onChange={(e) => setV((s) => ({ ...s, prochaine_date: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-amber-400/60" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
          <X size={13} /> Annuler
        </button>
        <button type="submit" className="text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-4 py-1.5">
          Enregistrer
        </button>
      </div>
    </form>
  );
}

function SubsModule({ subs, setSubs }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const addSub = (v) => { setSubs((s) => [...s, { id: uid(), ...v }]); setShowForm(false); };
  const updateSub = (id, v) => { setSubs((s) => s.map((x) => (x.id === id ? { ...x, ...v } : x))); setEditingId(null); };
  const removeSub = (id) => setSubs((s) => s.filter((x) => x.id !== id));

  const totals = useMemo(() => {
    const monthly = subs.reduce((s, x) => s + monthlyEquivalent(x), 0);
    const annual = subs.reduce((s, x) => s + annualEquivalent(x), 0);
    return { monthly, annual };
  }, [subs]);

  const editingSub = editingId ? subs.find((s) => s.id === editingId) : null;
  const sorted = useMemo(() => [...subs].sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a)), [subs]);

  return (
    <Card accent={CARD_THEMES.amber}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <CardLabel icon={Repeat}>Dépenses récurrentes & abonnements</CardLabel>
        <GhostButton onClick={() => { setShowForm((s) => !s); setEditingId(null); }}>Ajouter un abonnement</GhostButton>
      </div>

      {/* Totaux lissés, réactifs */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide">Coût mensuel cumulé</div>
          <div className="font-display text-lg text-amber-300 ghost-blur">{eur(totals.monthly, 2)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] text-slate-500 uppercase tracking-wide">Coût annuel cumulé</div>
          <div className="font-display text-lg text-amber-300 ghost-blur">{eur(totals.annual, 2)}</div>
        </div>
      </div>

      {showForm && <SubForm open onClose={() => setShowForm(false)} onSubmit={addSub} />}
      {editingSub && <SubForm open initial={editingSub} onClose={() => setEditingId(null)} onSubmit={(v) => updateSub(editingId, v)} />}

      {sorted.length === 0 ? (
        <EmptyState>Aucun abonnement suivi — ajoute tes charges fixes pour voir le coût mensuel/annuel cumulé.</EmptyState>
      ) : (
        <div className="overflow-x-auto mt-2 -mx-1">
          <table className="w-full text-sm min-w-[640px] table-cards">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="py-2 px-1">Abonnement</th>
                <th className="py-2 px-1">Fréquence</th>
                <th className="py-2 px-1">Équiv. mensuel</th>
                <th className="py-2 px-1">Équiv. annuel</th>
                <th className="py-2 px-1">Prochain prélèvement</th>
                <th className="py-2 px-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sorted.map((s) => {
                const next = nextChargeDate(s);
                const daysToNext = next
                  ? Math.round((new Date(`${next}T00:00:00`) - new Date(`${todayIso()}T00:00:00`)) / 86400000)
                  : null;
                const soon = daysToNext != null && daysToNext <= 5;
                return (
                  <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                    <td data-label="Abonnement" className="py-2.5 px-1">
                      <div className="text-slate-100 font-medium">{s.label}</div>
                      <div className="text-[11px] text-slate-500">{s.category}</div>
                    </td>
                    <td data-label="Fréquence" className="py-2.5 px-1 text-slate-400 text-xs capitalize">{s.frequence}</td>
                    <td data-label="Équiv. mensuel" className="py-2.5 px-1 font-data tabular-nums text-slate-200 ghost-blur">{eur(monthlyEquivalent(s), 2)}</td>
                    <td data-label="Équiv. annuel" className="py-2.5 px-1 font-data tabular-nums text-slate-400 ghost-blur">{eur(annualEquivalent(s), 2)}</td>
                    <td data-label="Prochain prélèvement" className="py-2.5 px-1">
                      {next ? (
                        <span className={`flex items-center gap-1.5 w-fit text-[11px] font-data px-2 py-0.5 rounded border ${
                          soon ? "text-rose-300 border-rose-500/30 bg-rose-500/10" : "text-slate-400 border-slate-700 bg-slate-900/50"
                        }`}>
                          {soon && <CalendarClock size={11} />}
                          {formatDateFr(next)} {soon && `(${daysToNext === 0 ? "aujourd'hui" : `J-${daysToNext}`})`}
                        </span>
                      ) : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="py-2.5 px-1">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingId(s.id); setShowForm(false); }} className="text-[11px] text-slate-500 hover:text-amber-300 px-2">
                          Modifier
                        </button>
                        <IconTrash onClick={() => removeSub(s.id)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Composant principal ────────────────────────────────────────────────────
export default function Abonnements({ contracts = [], setContracts, subs = [], setSubs }) {
  const totalMonthlySubs = useMemo(() => subs.reduce((s, x) => s + monthlyEquivalent(x), 0), [subs]);
  const contractsToAct = useMemo(
    () => contracts.filter((c) => ["a_resilier", "a_renouveler"].includes(computeContractStatus(c).key)).length,
    [contracts]
  );

  return (
    <div className="relative space-y-6">
      <PageGlow color="cyan" />
      <div className="relative">
        <h1 className="font-display text-2xl text-slate-50">
          Abonnements &amp; <span className="text-cyan-300">Échéances</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">Contrats à surveiller et charges fixes récurrentes, en un coup d'œil.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card accent={CARD_THEMES.cyan}>
          <CardLabel icon={AlertTriangle}>Contrats à traiter</CardLabel>
          <div className={`font-display text-xl ${contractsToAct > 0 ? "text-amber-300" : "text-slate-100"}`}>{contractsToAct}</div>
        </Card>
        <Card accent={CARD_THEMES.amber}>
          <CardLabel icon={Wallet}>Charges fixes / mois</CardLabel>
          <div className="font-display text-xl text-amber-300 ghost-blur">{eur(totalMonthlySubs, 2)}</div>
        </Card>
      </div>

      <ContractsModule contracts={contracts} setContracts={setContracts} />
      <SubsModule subs={subs} setSubs={setSubs} />
    </div>
  );
}
