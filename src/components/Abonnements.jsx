import { useMemo, useState, useId } from "react";
import { useSousOnglet } from "../lib/useHashRoute";
import {
  FileText, Repeat, AlertTriangle, CalendarDays, X, Check, Pencil, Trash2, Ban, RotateCcw, PiggyBank,
  Sparkles, Scissors, CircleCheck, Flag,
} from "lucide-react";
import { Card, CardLabel, GhostButton, PageGlow, PastilleEtat, SectionRepliable, CARD_THEMES } from "./ui";
import EtatVide from "./EtatVide";
import Montant from "./Montant";
import OngletsGlissants from "./OngletsGlissants";
import MenuActions from "./MenuActions";
import RapprochementsAbonnements from "./RapprochementsAbonnements";
import AbonnementsDetectes from "./AbonnementsDetectes";
import CalendrierPrelevements from "./CalendrierPrelevements";
import { uid, todayIso, lireNombre, pctPlain } from "../lib/finance";
import { recurrences } from "../lib/analyseCompte";
import { usePersistentState } from "../lib/storage";
import { useToast } from "../lib/ToastContext";
import {
  FREQUENCES, STATUTS, USAGES, CATEGORIES_ABO, statutDe, mensualiser, annualiser, prochainPrelevement,
  joursEntre, totaux, economiesRealisees, candidatsResiliation, valeurPlacee, rapprocherCompte, aboDepuisCharge,
  statutContrat, dateLimiteResiliation,
} from "../lib/abonnements";

function formatDateFr(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const dateCourte = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

const fmtTaux = (t) => pctPlain(t, Number.isInteger(t) ? 0 : 1);

const CHAMP =
  "w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60";

// ─── Module 1 : Contrats & échéances ────────────────────────────────────────
// Le statut (date limite = fin d'engagement − préavis) vit dans
// lib/abonnements.js : le centre « À faire » du Dashboard le lit aussi.

const CONTRACT_CATEGORIES = ["Bail / Logement", "Assurance", "Garantie", "Télécom / Internet", "Énergie", "Autre"];

function ContractForm({ onClose, onSubmit, initial }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const blank = { category: "Bail / Logement", label: "", date_fin: "", preavis_jours: 30, notes: "" };
  const [v, setV] = useState(initial || blank);

  const submit = (e) => {
    e.preventDefault();
    if (!v.label.trim()) return;
    onSubmit({ ...v, preavis_jours: parseInt(v.preavis_jours) || 0 });
  };

  return (
    <form onSubmit={submit} className="mt-3 p-4 rounded-xl border border-cyan-400/20 bg-slate-950 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label htmlFor={`${idsChamps}-nom-du-contrat`} className="text-micro text-slate-500">Nom du contrat</label>
          <input id={`${idsChamps}-nom-du-contrat`} required type="text" placeholder="Assurance habitation" value={v.label}
            onChange={(e) => setV((s) => ({ ...s, label: e.target.value }))} className={CHAMP} />
        </div>
        <div>
          <label htmlFor={`${idsChamps}-categorie`} className="text-micro text-slate-500">Catégorie</label>
          <select id={`${idsChamps}-categorie`} value={v.category} onChange={(e) => setV((s) => ({ ...s, category: e.target.value }))}
            className={CHAMP}>
            {CONTRACT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${idsChamps}-preavis-jours`} className="text-micro text-slate-500">Préavis (jours)</label>
          <input id={`${idsChamps}-preavis-jours`} type="number" min="0" value={v.preavis_jours}
            onChange={(e) => setV((s) => ({ ...s, preavis_jours: e.target.value }))} className={`${CHAMP} font-data`} />
        </div>
        <div className="col-span-2">
          <label htmlFor={`${idsChamps}-date-de-fin`} className="text-micro text-slate-500">Date de fin d'engagement / tacite reconduction</label>
          <input id={`${idsChamps}-date-de-fin`} required type="date" value={v.date_fin}
            onChange={(e) => setV((s) => ({ ...s, date_fin: e.target.value }))} className={`${CHAMP} font-data`} />
        </div>
        <div className="col-span-2">
          <label htmlFor={`${idsChamps}-notes-optionnel`} className="text-micro text-slate-500">Notes (optionnel)</label>
          <input id={`${idsChamps}-notes-optionnel`} type="text" placeholder="N° de contrat, organisme..." value={v.notes}
            onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))} className={CHAMP} />
        </div>
      </div>
      <BoutonsFormulaire onAnnuler={onClose} />
    </form>
  );
}

function BoutonsFormulaire({ onAnnuler, libelle = "Enregistrer" }) {
  return (
    <div className="flex gap-2 justify-end">
      <button type="button" onClick={onAnnuler} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
        <X size={13} aria-hidden="true" /> Annuler
      </button>
      <button type="submit" className="flex items-center gap-1.5 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg px-4 py-1.5">
        <Check size={14} aria-hidden="true" /> {libelle}
      </button>
    </div>
  );
}

function ContractsModule({ contracts, setContracts }) {
  const { showToast } = useToast();
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
  // Annulable : un contrat porte une date d'échéance et un préavis de
  // résiliation qu'on ne retrouve qu'en rouvrant le document d'origine.
  const removeContract = (id) => {
    const precedent = contracts;
    const cible = contracts.find((c) => c.id === id);
    setContracts((c) => c.filter((x) => x.id !== id));
    showToast({
      message: `Contrat « ${cible?.label || "sans nom"} » supprimé.`,
      onUndo: () => setContracts(precedent),
    });
  };

  const sorted = useMemo(
    () => [...contracts].sort((a, b) => (a.date_fin || "9999") < (b.date_fin || "9999") ? -1 : 1),
    [contracts]
  );

  return (
    <Card accent={CARD_THEMES.cyan}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <CardLabel icon={FileText}>Contrats & échéances de résiliation</CardLabel>
        <GhostButton theme="cyan" onClick={() => { setShowForm((s) => !s); setEditingId(null); }}>
          Ajouter un contrat
        </GhostButton>
      </div>

      {showForm && <ContractForm onClose={() => setShowForm(false)} onSubmit={addContract} />}

      {sorted.length === 0 ? (
        <EtatVide picto="calendrier" titre="Aucun contrat suivi">
          Ajoute un bail, une assurance ou une garantie pour ne plus rater une échéance de résiliation.
        </EtatVide>
      ) : (
        <ul className="flex flex-col gap-2 mt-3">
          {sorted.map((c) => {
            if (c.id === editingId) {
              return (
                <li key={c.id}>
                  <ContractForm initial={c} onClose={() => setEditingId(null)} onSubmit={(v) => updateContract(c.id, v)} />
                </li>
              );
            }
            const status = statutContrat(c);
            const deadline = dateLimiteResiliation(c);
            const joursLimite = deadline ? joursEntre(todayIso(), deadline) : null;
            return (
              <li key={c.id} className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-corps text-slate-100">{c.label}</span>
                      <PastilleEtat etat={status.etat}>{status.label}</PastilleEtat>
                    </span>
                    <span className="block text-micro text-slate-500 mt-0.5">
                      {c.category} · fin d'engagement {formatDateFr(c.date_fin)}
                      {c.notes && ` · ${c.notes}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-micro text-slate-500">Résilier avant le</span>
                    <span className={`block font-data text-corps ${status.key === "a_resilier" || status.key === "a_renouveler" ? "etat-attention" : "text-slate-300"}`}>
                      {deadline ? formatDateFr(deadline) : "—"}
                    </span>
                    {joursLimite != null && joursLimite >= 0 && joursLimite <= 60 && (
                      <span className="block text-micro text-slate-500">dans {joursLimite} j · préavis {c.preavis_jours || 0} j</span>
                    )}
                  </span>
                  <MenuActions
                    libelle={`Actions sur ${c.label}`}
                    actions={[
                      { libelle: "Modifier", icone: Pencil, onClick: () => { setEditingId(c.id); setShowForm(false); } },
                      { libelle: "Supprimer", icone: Trash2, onClick: () => removeContract(c.id), danger: true },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ─── Module 2 : Abonnements ──────────────────────────────────────────────────

/**
 * Monogramme coloré par catégorie : un repère qui se lit avant le nom, sans
 * aller chercher le logo d'une marque chez un tiers.
 */
const TEINTES_CATEGORIE = {
  Streaming: "bg-rose-500/15 text-rose-300",
  "Logiciel / Cloud": "bg-indigo-500/15 text-indigo-300",
  "Sport / Bien-être": "bg-emerald-500/15 text-emerald-300",
  Presse: "bg-amber-500/15 text-amber-300",
  Téléphonie: "bg-cyan-500/15 text-cyan-300",
  Assurance: "bg-violet-500/15 text-violet-300",
  Énergie: "bg-orange-500/15 text-orange-300",
  Logement: "bg-teal-500/15 text-teal-300",
  Transport: "bg-sky-500/15 text-sky-300",
};

function Monogramme({ label, categorie }) {
  const lettres =
    String(label || "")
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold ${
        TEINTES_CATEGORIE[categorie] || "bg-slate-800 text-slate-300"
      }`}
    >
      {lettres}
    </span>
  );
}

function SubForm({ onClose, onSubmit, initial }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const blank = {
    category: "Streaming", label: "", montant: "", frequence: "mensuelle", prochaine_date: todayIso(),
    statut: "actif", fin_essai: "", resilie_le: "",
  };
  const [v, setV] = useState(() => ({ ...blank, ...(initial || {}), statut: statutDe(initial) }));
  const champ = (cle) => (e) => setV((s) => ({ ...s, [cle]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!v.label.trim() || v.montant === "") return;
    onSubmit({
      ...v,
      label: v.label.trim(),
      montant: lireNombre(v.montant) ?? 0,
      fin_essai: v.fin_essai || null,
      resilie_le: v.statut === "resilie" ? v.resilie_le || todayIso() : null,
    });
  };

  return (
    <form onSubmit={submit} className="p-4 rounded-xl border border-cyan-400/20 bg-slate-950 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label htmlFor={`${idsChamps}-nom`} className="text-micro text-slate-500">Nom de l'abonnement</label>
          <input id={`${idsChamps}-nom`} required type="text" placeholder="Netflix, Salle de sport..." value={v.label}
            onChange={champ("label")} className={CHAMP} />
        </div>
        <div>
          <label htmlFor={`${idsChamps}-categorie`} className="text-micro text-slate-500">Catégorie</label>
          <select id={`${idsChamps}-categorie`} value={v.category} onChange={champ("category")} className={CHAMP}>
            {CATEGORIES_ABO.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${idsChamps}-statut`} className="text-micro text-slate-500">Statut</label>
          <select id={`${idsChamps}-statut`} value={v.statut} onChange={champ("statut")} className={CHAMP}>
            {Object.entries(STATUTS).map(([k, s]) => <option key={k} value={k}>{s.libelle}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${idsChamps}-montant`} className="text-micro text-slate-500">Montant (€)</label>
          <input id={`${idsChamps}-montant`} required type="number" step="0.01" min="0" value={v.montant}
            onChange={champ("montant")} className={`${CHAMP} font-data`} />
        </div>
        <div>
          <label htmlFor={`${idsChamps}-frequence`} className="text-micro text-slate-500">Fréquence</label>
          <select id={`${idsChamps}-frequence`} value={v.frequence || "mensuelle"} onChange={champ("frequence")} className={CHAMP}>
            {Object.entries(FREQUENCES).map(([k, f]) => <option key={k} value={k}>{f.libelle}</option>)}
          </select>
        </div>
        {v.statut === "essai" ? (
          <div className="col-span-2">
            <label htmlFor={`${idsChamps}-fin-essai`} className="text-micro text-slate-500">Fin de l'essai (premier prélèvement)</label>
            <input id={`${idsChamps}-fin-essai`} required type="date" value={v.fin_essai || ""}
              onChange={champ("fin_essai")} className={`${CHAMP} font-data`} />
          </div>
        ) : (
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`${idsChamps}-prochain`} className="text-micro text-slate-500">Un jour de prélèvement</label>
            <input id={`${idsChamps}-prochain`} type="date" value={v.prochaine_date || ""}
              onChange={champ("prochaine_date")} className={`${CHAMP} font-data`} />
          </div>
        )}
        {v.statut === "resilie" && (
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`${idsChamps}-resilie`} className="text-micro text-slate-500">Résilié le</label>
            <input id={`${idsChamps}-resilie`} type="date" value={v.resilie_le || todayIso()}
              onChange={champ("resilie_le")} className={`${CHAMP} font-data`} />
          </div>
        )}
      </div>
      <p className="text-micro text-slate-500">
        Une seule date suffit : les prélèvements suivants en sont déduits selon la fréquence.
      </p>
      <BoutonsFormulaire onAnnuler={onClose} />
    </form>
  );
}

function Detail({ libelle, children }) {
  return (
    <div>
      <div className="text-micro text-slate-500">{libelle}</div>
      <div className="text-corps text-slate-200 mt-0.5">{children}</div>
    </div>
  );
}

/** Ce que le relevé dit de cet abonnement. */
function VerificationReleve({ verif, avecReleve, onAligner }) {
  if (verif?.trouve) {
    if (verif.alerte) {
      return (
        <div className="mt-3 flex flex-wrap items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-[12rem]">{verif.detail}</span>
          {verif.alerte === "montant" && (
            <button
              type="button"
              onClick={() => onAligner(verif.derniere.montant)}
              className="btn-flash shrink-0 rounded-md border border-amber-400/40 px-2 py-0.5 text-amber-100 hover:bg-amber-500/10"
            >
              Mettre à jour à {verif.derniere.montant.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
            </button>
          )}
        </div>
      );
    }
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
        <CircleCheck size={13} className="etat-ok shrink-0" aria-hidden="true" />
        Vérifié sur ton relevé : <Montant valeur={verif.derniere.montant} decimales={2} /> prélevé le{" "}
        {formatDateFr(verif.derniere.date)}.
      </p>
    );
  }
  if (!avecReleve) return null;
  return (
    <p className="mt-3 text-xs text-slate-500">
      Pas retrouvé sur tes relevés — payé avec une autre carte, ou sous un autre nom ?
    </p>
  );
}

function CarteAbonnement({ sub, verif, avecReleve, tauxPct, onModifier, onChanger, onSupprimer }) {
  const [ouvert, setOuvert] = useState(false);
  const idDetail = useId();
  const aujourdhui = todayIso();
  const statut = statutDe(sub);
  const prochain = prochainPrelevement(sub, aujourdhui);
  const j = prochain ? joursEntre(aujourdhui, prochain) : null;
  const freq = FREQUENCES[sub.frequence] || FREQUENCES.mensuelle;
  const montant = lireNombre(sub.montant) ?? 0;
  const alerte = verif?.trouve && verif.alerte;
  const resilie = statut === "resilie";

  const actions = [
    { libelle: "Modifier", icone: Pencil, onClick: onModifier },
    statut === "essai" && {
      libelle: "Le garder (devient payant)",
      icone: Check,
      onClick: () => onChanger({ statut: "actif", prochaine_date: sub.fin_essai || sub.prochaine_date }),
    },
    statut === "actif" && { libelle: "Marquer à résilier", icone: Flag, onClick: () => onChanger({ statut: "a_resilier" }) },
    !resilie && { libelle: "Marquer comme résilié", icone: Ban, onClick: () => onChanger({ statut: "resilie", resilie_le: aujourdhui }) },
    (resilie || statut === "a_resilier") && {
      libelle: "Réactiver",
      icone: RotateCcw,
      onClick: () => onChanger({ statut: "actif", resilie_le: null }),
    },
    { libelle: "Supprimer", icone: Trash2, onClick: onSupprimer, danger: true },
  ];

  return (
    <li className={`rounded-xl border ${resilie ? "border-slate-800/60 bg-slate-950/30" : "border-slate-800 bg-slate-950/50"}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Monogramme label={sub.label} categorie={sub.category} />
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          aria-controls={idDetail}
          className="min-w-0 flex-1 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={`truncate text-corps ${resilie ? "text-slate-400" : "text-slate-100"}`}>{sub.label}</span>
            {alerte && <AlertTriangle size={13} className="shrink-0 etat-attention" aria-label="Écart avec le relevé" />}
          </span>
          {/* La date d'abord : sur un téléphone, c'est la fin de la ligne qui
              est coupée, et la catégorie se devine au monogramme. */}
          <span className="flex items-center gap-1.5 min-w-0 mt-0.5">
            {statut !== "actif" && (
              <PastilleEtat etat={STATUTS[statut].etat} className="shrink-0">{STATUTS[statut].court}</PastilleEtat>
            )}
            <span className="text-micro text-slate-500 truncate">
              {resilie
                ? sub.resilie_le && `le ${dateCourte(sub.resilie_le)}`
                : prochain &&
                  `${statut === "essai" ? "fin" : "prochain"} ${dateCourte(prochain)}${
                    j <= 5 ? ` (${j === 0 ? "aujourd'hui" : `J-${j}`})` : ""
                  }`}
              <span className="hidden sm:inline">{` · ${sub.category || "Autre"}`}</span>
            </span>
          </span>
        </button>
        <span className="shrink-0 text-right">
          <Montant valeur={montant} decimales={2} className={`block text-corps ${resilie ? "text-slate-500" : "text-slate-100"}`} />
          <span className="block text-micro text-slate-500">/ {freq.court}</span>
        </span>
        <MenuActions libelle={`Actions sur ${sub.label}`} actions={actions} />
      </div>

      {ouvert && (
        <div className="collapse-in">
          <div>
            <div id={idDetail} className="px-3 pb-3">
              <div className="border-t border-slate-800/80 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Detail libelle="Par mois"><Montant valeur={mensualiser(sub)} decimales={2} /></Detail>
                <Detail libelle="Par an"><Montant valeur={annualiser(sub)} decimales={0} /></Detail>
                <Detail libelle={`Placé 10 ans à ${fmtTaux(tauxPct)}`}>
                  <Montant valeur={valeurPlacee(mensualiser(sub), tauxPct, 10)} decimales={0} />
                </Detail>
                <Detail libelle={resilie ? "Résilié le" : statut === "essai" ? "Fin de l'essai" : "Prochain prélèvement"}>
                  <span className="font-data">{formatDateFr(resilie ? sub.resilie_le : prochain)}</span>
                </Detail>
              </div>

              {!resilie && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-micro text-slate-500">Tu l'utilises :</span>
                  <div role="group" aria-label="Fréquence d'usage" className="inline-flex rounded-lg border border-slate-700 p-0.5">
                    {Object.entries(USAGES).map(([k, u]) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={sub.usage === k}
                        onClick={() => onChanger({ usage: sub.usage === k ? null : k })}
                        className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                          sub.usage === k ? "bg-cyan-500/15 text-cyan-200" : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {u.libelle}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <VerificationReleve verif={verif} avecReleve={avecReleve} onAligner={(m) => onChanger({ montant: m })} />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

// À résilier d'abord — c'est là qu'il y a quelque chose à faire —, puis le
// plus coûteux.
const ORDRE_STATUT = { a_resilier: 0, essai: 1, actif: 2 };

function ListeAbonnements({ subs, setSubs, verifications, avecReleve, tauxPct }) {
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const addSub = (v) => { setSubs((s) => [...s, { id: uid(), ...v }]); setShowForm(false); };
  const updateSub = (id, v) => { setSubs((s) => s.map((x) => (x.id === id ? { ...x, ...v } : x))); setEditingId(null); };
  const changer = (sub, patch) => {
    const precedent = subs;
    setSubs((s) => s.map((x) => (x.id === sub.id ? { ...x, ...patch } : x)));
    if (patch.statut === "resilie") {
      showToast({
        message: `« ${sub.label} » résilié : ses prélèvements évités compteront dans tes économies.`,
        onUndo: () => setSubs(precedent),
      });
    }
  };
  // Annulable, au même titre que les contrats.
  const removeSub = (id) => {
    const precedent = subs;
    const cible = subs.find((x) => x.id === id);
    setSubs((s) => s.filter((x) => x.id !== id));
    showToast({
      message: `Abonnement « ${cible?.label || "sans nom"} » supprimé.`,
      onUndo: () => setSubs(precedent),
    });
  };

  const enCours = useMemo(
    () =>
      subs
        .filter((s) => statutDe(s) !== "resilie")
        .sort((a, b) => ORDRE_STATUT[statutDe(a)] - ORDRE_STATUT[statutDe(b)] || mensualiser(b) - mensualiser(a)),
    [subs]
  );
  const resilies = useMemo(() => subs.filter((s) => statutDe(s) === "resilie"), [subs]);
  const candidats = useMemo(() => candidatsResiliation(subs), [subs]);
  const economies = useMemo(() => economiesRealisees(subs), [subs]);

  const carte = (s) =>
    s.id === editingId ? (
      <li key={s.id}>
        <SubForm initial={s} onClose={() => setEditingId(null)} onSubmit={(v) => updateSub(s.id, v)} />
      </li>
    ) : (
      <CarteAbonnement
        key={s.id}
        sub={s}
        verif={verifications[s.id]}
        avecReleve={avecReleve}
        tauxPct={tauxPct}
        onModifier={() => { setEditingId(s.id); setShowForm(false); }}
        onChanger={(patch) => changer(s, patch)}
        onSupprimer={() => removeSub(s.id)}
      />
    );

  return (
    <>
      <Card accent={CARD_THEMES.cyan}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <CardLabel icon={Repeat}>Mes abonnements</CardLabel>
          <GhostButton theme="cyan" onClick={() => { setShowForm((s) => !s); setEditingId(null); }}>
            Ajouter un abonnement
          </GhostButton>
        </div>

        {showForm && (
          <div className="mb-3">
            <SubForm onClose={() => setShowForm(false)} onSubmit={addSub} />
          </div>
        )}

        {enCours.length === 0 ? (
          <EtatVide picto="abonnements" titre="Aucun abonnement en cours">
            Ajoute tes charges fixes — ou suis directement celles détectées sur ton compte courant — pour voir
            leur coût, leur calendrier et ce qu'elles pèseraient placées.
          </EtatVide>
        ) : (
          <ul className="flex flex-col gap-2">{enCours.map(carte)}</ul>
        )}
      </Card>

      {candidats.length > 0 && (
        <Card accent={CARD_THEMES.cyan}>
          <CardLabel icon={Scissors}>À reconsidérer</CardLabel>
          <p className="text-mini text-slate-500 mt-1">
            Ce que tu as dit peu utiliser, du plus coûteux au moins coûteux. À toi de juger s'il vaut ce qu'il coûte.
          </p>
          <ul className="mt-3 divide-y divide-slate-800/70">
            {candidats.map(({ sub }) => (
              <li key={sub.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-corps text-slate-200 truncate">{sub.label}</span>
                  <span className="block text-micro text-slate-500">utilisé {USAGES[sub.usage].libelle.toLowerCase()}</span>
                </span>
                <span className="shrink-0 text-right">
                  <Montant valeur={annualiser(sub)} decimales={0} className="block text-corps text-slate-100" />
                  <span className="block text-micro text-slate-500">par an</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {resilies.length > 0 && (
        <SectionRepliable
          titre="Abonnements résiliés"
          icon={Ban}
          resume={`${resilies.length}${economies.total > 0 ? ` · ${Math.round(economies.total)} € économisés` : ""}`}
        >
          <ul className="flex flex-col gap-2">{resilies.map(carte)}</ul>
        </SectionRepliable>
      )}
    </>
  );
}

// ─── Bandeau d'en-tête ───────────────────────────────────────────────────────

function BandeauCharges({ subs, revenusMensuels, tauxPct, contratsATraiter }) {
  const aujourdhui = todayIso();
  const t = useMemo(() => totaux(subs), [subs]);
  const economies = useMemo(() => economiesRealisees(subs, aujourdhui), [subs, aujourdhui]);
  const prochain = useMemo(
    () =>
      subs
        .map((s) => ({ s, date: prochainPrelevement(s, aujourdhui) }))
        .filter((x) => x.date)
        .sort((a, b) => a.date.localeCompare(b.date))[0] || null,
    [subs, aujourdhui]
  );
  const part = revenusMensuels > 0 ? (t.mensuel / revenusMensuels) * 100 : null;
  const jProchain = prochain ? joursEntre(aujourdhui, prochain.date) : null;

  return (
    <Card role="vedette" accent={CARD_THEMES.cyan}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-400">Charges fixes</div>
          <div className="flex items-baseline gap-2 mt-1">
            <Montant valeur={t.mensuel} decimales={2} className="font-display text-vedette text-slate-50" />
            <span className="text-sm text-slate-500">/ mois</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            <Montant valeur={t.annuel} decimales={0} /> par an · {t.nombre} abonnement{t.nombre > 1 ? "s" : ""} payant
            {t.nombre > 1 ? "s" : ""}
            {part != null && <> · {pctPlain(part, 1)} de tes revenus</>}
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1.5">
          {prochain && (
            <PastilleEtat etat={jProchain <= 3 ? "attention" : "neutre"}>
              Prochain : {prochain.s.label} ·{" "}
              {jProchain === 0 ? "aujourd'hui" : jProchain === 1 ? "demain" : dateCourte(prochain.date)}
            </PastilleEtat>
          )}
          {t.essais.length > 0 && (
            <PastilleEtat etat="attention">
              {t.essais.length} essai{t.essais.length > 1 ? "s" : ""} gratuit{t.essais.length > 1 ? "s" : ""} en cours
            </PastilleEtat>
          )}
          {contratsATraiter > 0 && (
            <PastilleEtat etat="critique">
              {contratsATraiter} contrat{contratsATraiter > 1 ? "s" : ""} à traiter
            </PastilleEtat>
          )}
        </div>
      </div>

      {(t.mensuel > 0 || economies.total > 0) && (
        <div className="mt-4 pt-3 border-t border-slate-800/80 grid sm:grid-cols-2 gap-3 text-xs text-slate-400">
          {t.mensuel > 0 && (
            <p className="flex items-start gap-2">
              <PiggyBank size={14} className="mt-0.5 shrink-0 text-cyan-300" aria-hidden="true" />
              <span>
                Placés à {fmtTaux(tauxPct)} par an (ton hypothèse de Simulation), ces{" "}
                <Montant valeur={t.mensuel} decimales={0} /> par mois feraient{" "}
                <Montant valeur={valeurPlacee(t.mensuel, tauxPct, 10)} decimales={0} className="text-slate-100" /> dans 10 ans.
              </span>
            </p>
          )}
          {economies.total > 0 && (
            <p className="flex items-start gap-2">
              <Sparkles size={14} className="mt-0.5 shrink-0 etat-ok" aria-hidden="true" />
              <span>
                Économies réalisées : <Montant valeur={economies.total} decimales={0} className="etat-ok" /> de
                prélèvements évités depuis tes résiliations.
              </span>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Composant principal ────────────────────────────────────────────────────
/**
 * Abonnements & échéances.
 *
 * L'onglet listait ce que l'utilisateur déclarait. Il croise désormais ce
 * déclaré avec le relevé du compte courant (`rapprocherCompte`) : les
 * prélèvements récurrents pas encore suivis sont proposés, et chaque
 * abonnement suivi est vérifié — prix qui change, prélèvement qui cesse ou
 * qui double, abonnement résilié qui continue d'être prélevé.
 */
export default function Abonnements({
  contracts = [], setContracts, subs = [], setSubs, compteEnrichies = [], profile, sim,
}) {
  const { showToast } = useToast();
  const [ignores, setIgnores] = usePersistentState("abonnementsIgnores", []);
  const [onglet, setOnglet] = useSousOnglet(["abonnements", "calendrier", "contrats"], "abonnements");

  const rec = useMemo(() => recurrences(compteEnrichies), [compteEnrichies]);
  const { verifications, detectes } = useMemo(
    () => rapprocherCompte(subs, compteEnrichies, { charges: rec.charges, ignores }),
    [subs, compteEnrichies, rec, ignores]
  );
  const avecReleve = compteEnrichies.length > 0;
  const tauxPct = sim?.bourse?.rate ?? 6;
  const contratsATraiter = useMemo(
    () => contracts.filter((c) => ["a_resilier", "a_renouveler"].includes(statutContrat(c).key)).length,
    [contracts]
  );
  const nbEnCours = subs.filter((s) => statutDe(s) !== "resilie").length;

  const suivre = (charge) => setSubs((s) => [...(s || []), aboDepuisCharge(charge, uid())]);
  const ignorer = (charge) => {
    const precedent = ignores;
    setIgnores((l) => [...new Set([...(l || []), charge.cle])]);
    showToast({ message: `« ${charge.titre} » ne sera plus proposé.`, onUndo: () => setIgnores(precedent) });
  };

  return (
    <div className="relative space-y-6">
      <PageGlow color="cyan" />

      <div className="relative">
        <h1 className="font-display text-2xl text-slate-50">
          Abonnements &amp; <span className="text-cyan-300">Échéances</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tes charges fixes, vérifiées sur ton relevé, et les contrats à ne pas laisser se reconduire.
        </p>
      </div>

      <BandeauCharges
        subs={subs}
        revenusMensuels={profile?.monthly_income}
        tauxPct={tauxPct}
        contratsATraiter={contratsATraiter}
      />

      {/* Le rapprochement en tête des listes : un signal placé sous deux
          listes longues ne serait jamais vu. */}
      <RapprochementsAbonnements subs={subs} contracts={contracts} verifications={verifications} />

      <OngletsGlissants
        className="teinte-cyan"
        ariaLabel="Sections des abonnements"
        actif={onglet}
        onChange={setOnglet}
        onglets={[
          { id: "abonnements", libelle: "Abonnements", icone: Repeat, badge: nbEnCours || undefined },
          { id: "calendrier", libelle: "Calendrier", icone: CalendarDays },
          { id: "contrats", libelle: "Contrats", icone: FileText, badge: contratsATraiter || undefined },
        ]}
      />

      <div role="tabpanel" id={`panneau-${onglet}`} aria-labelledby={`onglet-${onglet}`} className="space-y-6">
        {onglet === "abonnements" && (
          <>
            <AbonnementsDetectes detectes={detectes} onSuivre={suivre} onIgnorer={ignorer} />
            <ListeAbonnements
              subs={subs}
              setSubs={setSubs}
              verifications={verifications}
              avecReleve={avecReleve}
              tauxPct={tauxPct}
            />
          </>
        )}
        {onglet === "calendrier" && <CalendrierPrelevements subs={subs} revenus={rec.revenus} />}
        {onglet === "contrats" && <ContractsModule contracts={contracts} setContracts={setContracts} />}
      </div>
    </div>
  );
}
