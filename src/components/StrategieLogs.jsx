import React, { useState, useMemo } from "react";
import { NotebookPen, Plus, Pencil, X, Check, Search, Filter, TableProperties, Archive, ArchiveRestore, ClipboardCheck, Wallet, FileSignature, SendHorizonal, Layers, Clock } from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, EmptyState, CARD_THEMES } from "./ui";
import { eur, pct } from "../lib/finance";
import Operations from "./Operations";
import AssetStats from "./AssetStats";
import Timeline from "./Timeline";

// Statuts de thèse — inspirés du tableau "Performance vs Thèse" : un simple
// code couleur suffit à se souvenir de l'état sans relire toute la note.
const STATUS = {
  intacte: { label: "Intacte", dot: "bg-emerald-400", text: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30" },
  surveiller: { label: "À surveiller", dot: "bg-amber-400", text: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/30" },
  invalidee: { label: "Invalidée", dot: "bg-rose-400", text: "text-rose-300", bg: "bg-rose-500/10 border-rose-500/30" },
};

function formatDateFr(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDateShortFr(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const BLANK_NOTE = {
  ticker: "",
  titre: "",
  these: "",
  objectif_cours: "",
  conditions_vente: "",
  statut: "intacte",
  archivee: false,
  postmortem: null, // { date, resultat_pct, bilan, decision } une fois clôturée
};

// ─── Formulaire d'ajout / édition d'une note ────────────────────────────────
function NoteForm({ initial, onCancel, onSubmit }) {
  const [values, setValues] = useState(initial || BLANK_NOTE);

  const submit = (e) => {
    e.preventDefault();
    if (!values.titre.trim() && !values.ticker.trim()) return;
    onSubmit({
      ...values,
      objectif_cours: values.objectif_cours === "" ? null : parseFloat(values.objectif_cours),
    });
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-cyan-400/20 bg-slate-950 p-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-1">
          <label className="text-[11px] text-slate-500">Ticker (optionnel)</label>
          <input
            type="text"
            placeholder="AI.PA"
            value={values.ticker}
            onChange={(e) => setValues((v) => ({ ...v, ticker: e.target.value.toUpperCase() }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
          />
        </div>
        <div className="col-span-2 sm:col-span-2">
          <label className="text-[11px] text-slate-500">Titre de la note</label>
          <input
            required
            type="text"
            placeholder="Ex : Renforcement Air Liquide"
            value={values.titre}
            onChange={(e) => setValues((v) => ({ ...v, titre: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60"
          />
        </div>
        <div className="col-span-1">
          <label className="text-[11px] text-slate-500">Objectif de cours (€)</label>
          <input
            type="number"
            step="0.01"
            placeholder="200"
            value={values.objectif_cours}
            onChange={(e) => setValues((v) => ({ ...v, objectif_cours: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] text-slate-500">Pitch d'achat — pourquoi cette thèse tient (2-3 phrases)</label>
        <textarea
          rows={3}
          maxLength={500}
          placeholder="Ex : Leader mondial des gaz industriels, moat fort (contrats long terme + coûts de changement élevés), croissance des bénéfices régulière > 6%/an, dividende en hausse depuis 20 ans."
          value={values.these}
          onChange={(e) => setValues((v) => ({ ...v, these: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60 resize-y"
        />
      </div>

      <div>
        <label className="text-[11px] text-slate-500">
          Conditions de vente — ce qui invaliderait la thèse (pas "si ça baisse de X%")
        </label>
        <textarea
          rows={2}
          maxLength={500}
          placeholder="Ex : Si la marge opérationnelle passe sous 18%, si le dividende est coupé, si un changement de direction remet la stratégie en cause."
          value={values.conditions_vente}
          onChange={(e) => setValues((v) => ({ ...v, conditions_vente: e.target.value }))}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60 resize-y"
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-500">Statut de la thèse</label>
          <select
            value={values.statut}
            onChange={(e) => setValues((v) => ({ ...v, statut: e.target.value }))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-cyan-400/60"
          >
            {Object.entries(STATUS).map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
            <X size={13} /> Annuler
          </button>
          <button type="submit" className="flex items-center gap-1.5 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg px-4 py-1.5 transition-colors">
            <Check size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Formulaire Post-Mortem (clôture d'une thèse après vente) ──────────────
const DECISIONS = {
  bonne_decision: { label: "Bonne décision", text: "text-emerald-300" },
  erreur_emotion: { label: "Erreur d'émotion", text: "text-rose-300" },
  a_ameliorer: { label: "À améliorer", text: "text-amber-300" },
};

function PostMortemForm({ note, onCancel, onSubmit }) {
  const [resultatPct, setResultatPct] = useState(note.postmortem?.resultat_pct ?? "");
  const [decision, setDecision] = useState(note.postmortem?.decision ?? "bonne_decision");
  const [bilan, setBilan] = useState(note.postmortem?.bilan ?? "");

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      postmortem: {
        date: note.postmortem?.date || new Date().toISOString(),
        resultat_pct: resultatPct === "" ? null : parseFloat(resultatPct),
        decision,
        bilan,
      },
      archivee: true,
    });
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-700 bg-slate-950 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <ClipboardCheck size={15} className="text-cyan-300" />
        Bilan post-mortem — {note.ticker || note.titre}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-slate-500">Résultat final (%)</label>
          <input
            type="number"
            step="0.1"
            placeholder="Ex : 18.5 ou -6.2"
            value={resultatPct}
            onChange={(e) => setResultatPct(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm font-data focus:outline-none focus:border-cyan-400/60"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500">Décision</label>
          <select
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60"
          >
            {Object.entries(DECISIONS).map(([key, d]) => (
              <option key={key} value={key}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-[11px] text-slate-500">Bilan — qu'as-tu appris ?</label>
        <textarea
          rows={3}
          maxLength={500}
          placeholder="Ex : Vendu avec +18%, mais un peu tôt par peur de perdre mes gains. La thèse fondamentale tenait toujours."
          value={bilan}
          onChange={(e) => setBilan(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-cyan-400/60 resize-y"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
          <X size={13} /> Annuler
        </button>
        <button type="submit" className="flex items-center gap-1.5 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg px-4 py-1.5 transition-colors">
          <Check size={14} /> Clôturer la thèse
        </button>
      </div>
    </form>
  );
}


function NoteCard({ note, onEdit, onDelete, onClosePosition, onReopen, onDeclareOperation, highlighted }) {
  const st = STATUS[note.statut] || STATUS.intacte;
  const pm = note.postmortem;
  const dec = pm ? DECISIONS[pm.decision] || DECISIONS.bonne_decision : null;

  return (
    <div
      className={`rounded-xl border p-4 group transition-shadow ${
        note.archivee ? "border-slate-800/60 bg-slate-900/30" : "border-slate-800 bg-slate-900/60"
      } ${highlighted ? "ring-2 ring-cyan-400/70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            {note.ticker && (
              <span className="font-data text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded px-1.5 py-0.5">
                {note.ticker}
              </span>
            )}
            {note.archivee ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border bg-slate-500/10 border-slate-500/30 text-slate-400">
                <Archive size={10} /> Clôturée
              </span>
            ) : (
              <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${st.bg} ${st.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                {st.label}
              </span>
            )}
          </div>
          <h3 className={`font-semibold truncate ${note.archivee ? "text-slate-400" : "text-slate-100"}`}>{note.titre}</h3>
          <p className="text-[11px] text-slate-500">{formatDateFr(note.date)}</p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {note.ticker && (
            <button onClick={() => onDeclareOperation(note)} title="Déclarer une opération" className="text-slate-600 hover:text-cyan-300 p-1"><SendHorizonal size={14} /></button>
          )}
          {note.archivee ? (
            <button onClick={() => onReopen(note.id)} title="Ré-ouvrir la thèse" className="text-slate-600 hover:text-cyan-300 p-1"><ArchiveRestore size={14} /></button>
          ) : (
            <button onClick={() => onClosePosition(note)} title="Clôturer / bilan post-mortem" className="text-slate-600 hover:text-cyan-300 p-1"><ClipboardCheck size={14} /></button>
          )}
          <button onClick={() => onEdit(note)} className="text-slate-600 hover:text-cyan-300 p-1"><Pencil size={14} /></button>
          <IconTrash onClick={() => onDelete(note.id)} />
        </div>
      </div>

      {note.these && (
        <div className="mb-2">
          <div className="text-[11px] text-slate-500 mb-0.5">Thèse d'investissement</div>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.these}</p>
        </div>
      )}

      {note.conditions_vente && (
        <div className="mb-2">
          <div className="text-[11px] text-slate-500 mb-0.5">Conditions de vente</div>
          <p className="text-sm text-slate-400 whitespace-pre-wrap">{note.conditions_vente}</p>
        </div>
      )}

      {note.objectif_cours != null && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-2">
          <span className="text-slate-600">Objectif de cours :</span>
          <span className="font-data font-semibold text-slate-200">{note.objectif_cours} €</span>
        </div>
      )}

      {pm && (
        <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
            <span className="text-[11px] text-slate-500">Bilan post-mortem · {formatDateShortFr(pm.date)}</span>
            <div className="flex items-center gap-2">
              {pm.resultat_pct != null && (
                <span className={`font-data text-xs font-bold ${pm.resultat_pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {pct(pm.resultat_pct)}
                </span>
              )}
              <span className={`text-[10px] font-bold uppercase tracking-wide ${dec?.text}`}>{dec?.label}</span>
            </div>
          </div>
          {pm.bilan && <p className="text-sm text-slate-400 whitespace-pre-wrap">{pm.bilan}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Tableau "Performance vs Thèse" ─────────────────────────────────────────
// Croise chaque note active (non archivée) rattachée à un ticker avec la
// position correspondante du portefeuille (si elle existe encore), pour
// confronter l'objectif de cours et le statut de thèse à la réalité du
// marché en un coup d'œil.
function PerformanceTable({ notes, positions }) {
  const rows = useMemo(() => {
    return notes
      .filter((n) => !n.archivee && n.ticker)
      .map((n) => {
        const pos = positions.find((p) => p.ticker?.toUpperCase() === n.ticker?.toUpperCase());
        const ecartObjectifPct =
          n.objectif_cours && pos?.current_price
            ? ((pos.current_price - n.objectif_cours) / n.objectif_cours) * 100
            : null;
        return { note: n, pos, ecartObjectifPct };
      });
  }, [notes, positions]);

  if (rows.length === 0) {
    return (
      <EmptyState>
        Aucune thèse active liée à un ticker. Ajoute un ticker à tes notes pour les voir apparaître ici, confrontées au cours réel de tes positions.
      </EmptyState>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            <th className="py-2 px-1">Actif</th>
            <th className="py-2 px-1">Statut de la thèse</th>
            <th className="py-2 px-1">Cours actuel</th>
            <th className="py-2 px-1">Objectif de cours</th>
            <th className="py-2 px-1">Écart</th>
            <th className="py-2 px-1">En portefeuille</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {rows.map(({ note, pos, ecartObjectifPct }) => {
            const st = STATUS[note.statut] || STATUS.intacte;
            return (
              <tr key={note.id}>
                <td className="py-2.5 px-1">
                  <div className="font-data font-semibold text-slate-100">{note.ticker}</div>
                  <div className="text-[11px] text-slate-500 truncate max-w-[160px]">{note.titre}</div>
                </td>
                <td className="py-2.5 px-1">
                  <span className={`flex items-center gap-1.5 w-fit text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${st.bg} ${st.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </td>
                <td className="py-2.5 px-1 font-data tabular-nums text-slate-200">
                  {pos ? eur(pos.current_price) : <span className="text-slate-600">—</span>}
                </td>
                <td className="py-2.5 px-1 font-data tabular-nums text-slate-400">
                  {note.objectif_cours != null ? eur(note.objectif_cours) : <span className="text-slate-600">—</span>}
                </td>
                <td className="py-2.5 px-1 font-data tabular-nums">
                  {ecartObjectifPct != null ? (
                    <span className={ecartObjectifPct >= 0 ? "text-emerald-400" : "text-rose-400"}>{pct(ecartObjectifPct)}</span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="py-2.5 px-1">
                  {pos ? (
                    <span className="text-[11px] text-emerald-400 font-medium">Oui · {pos.quantity} titres</span>
                  ) : (
                    <span className="text-[11px] text-slate-600">Non détenu</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Composant principal ────────────────────────────────────────────────────
/**
 * Stratégie & Logs — journal de bord anti-panique. Chaque note capture une
 * thèse d'investissement au moment lucide de l'achat (pitch, objectif de
 * cours, conditions de vente) pour pouvoir s'y référer froidement lors
 * d'une secousse de marché plutôt que de réagir dans l'émotion.
 *
 * Quatre briques :
 * - Journal de bord : création/édition/recherche des notes.
 * - Performance vs Thèse : croise les notes actives avec les positions
 *   réelles du portefeuille (par ticker) pour comparer objectif et réalité.
 * - Post-Mortem : à la clôture d'une thèse (vente réelle ou décision
 *   d'abandon), on fige un bilan chiffré + qualitatif, conservé dans
 *   l'historique plutôt que supprimé.
 * - Timeline : fil d'actualité chronologique du patrimoine (jalons,
 *   dividendes, arbitrages) généré automatiquement depuis les opérations.
 *
 * Persisté via usePersistentState côté App.jsx (props strategyNotes/setStrategyNotes).
 * bourse.positions est lu en lecture seule pour le rapprochement par ticker —
 * aucune écriture n'est faite sur le portefeuille depuis cet écran.
 */
export default function StrategieLogs({
  strategyNotes = [], setStrategyNotes, bourse, setBourse,
  historyPast, patrimoineNet, epargneMensuelle, tauxEpargne,
}) {
  const notes = strategyNotes;
  const setNotes = setStrategyNotes;
  const positions = bourse?.positions || [];

  // ─── Sous-onglets & passerelles Thèse ⇄ Opérations ──────────────────────
  const [subTab, setSubTab] = useState("strategie"); // "strategie" | "operations" | "stats" | "timeline"
  const [presetOperation, setPresetOperation] = useState(null); // { asset, type } pour ouvrir la modale d'opération pré-remplie
  const [highlightTicker, setHighlightTicker] = useState(null);

  const declareOperation = (note) => {
    setPresetOperation({ asset: note.ticker, type: "ACHAT" });
    setSubTab("operations");
  };

  const openThesisForAsset = (asset) => {
    setHighlightTicker(asset?.toUpperCase() || null);
    setSearch(asset || "");
    setSubTab("strategie");
  };

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [closingId, setClosingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const addNote = (values) => {
    setNotes((n) => [{ id: uid(), date: new Date().toISOString(), archivee: false, postmortem: null, ...values }, ...n]);
    setShowForm(false);
  };

  const updateNote = (id, values) => {
    setNotes((n) => n.map((note) => (note.id === id ? { ...note, ...values } : note)));
    setEditingId(null);
  };

  const deleteNote = (id) => {
    if (window.confirm("Supprimer cette note définitivement ?")) {
      setNotes((n) => n.filter((note) => note.id !== id));
    }
  };

  const closeNote = (id, values) => {
    setNotes((n) => n.map((note) => (note.id === id ? { ...note, ...values } : note)));
    setClosingId(null);
  };

  const reopenNote = (id) => {
    setNotes((n) => n.map((note) => (note.id === id ? { ...note, archivee: false } : note)));
  };

  const filtered = useMemo(() => {
    return notes
      .filter((n) => (showArchived ? true : !n.archivee))
      .filter((n) => statusFilter === "all" || n.statut === statusFilter)
      .filter((n) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          n.ticker?.toLowerCase().includes(q) ||
          n.titre?.toLowerCase().includes(q) ||
          n.these?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [notes, search, statusFilter, showArchived]);

  const editingNote = editingId ? notes.find((n) => n.id === editingId) : null;
  const closingNote = closingId ? notes.find((n) => n.id === closingId) : null;
  const archivedCount = notes.filter((n) => n.archivee).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl text-slate-50">
          Stratégie &amp; <span className="text-cyan-300">Logs</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Le journal de bord anti-panique — note tes thèses à l'achat pour t'y référer froidement lors des secousses de marché.
        </p>
      </div>

      {/* Sous-onglets */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-1 flex-wrap">
        <button
          onClick={() => setSubTab("strategie")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "strategie" ? "text-cyan-300 border-b-2 border-cyan-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <FileSignature size={14} /> Stratégie
        </button>
        <button
          onClick={() => setSubTab("operations")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "operations" ? "text-cyan-300 border-b-2 border-cyan-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Wallet size={14} /> Opérations
        </button>
        <button
          onClick={() => setSubTab("stats")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "stats" ? "text-cyan-300 border-b-2 border-cyan-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Layers size={14} /> Statistiques
        </button>
        <button
          onClick={() => setSubTab("timeline")}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-t-lg transition-colors ${
            subTab === "timeline" ? "text-cyan-300 border-b-2 border-cyan-400" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Clock size={14} /> Timeline
        </button>
      </div>

      {subTab === "operations" ? (
        <Operations
          bourse={bourse}
          setBourse={setBourse}
          presetOperation={presetOperation}
          onConsumePreset={() => setPresetOperation(null)}
          onOpenThesis={openThesisForAsset}
        />
      ) : subTab === "stats" ? (
        <AssetStats bourse={bourse} />
      ) : subTab === "timeline" ? (
        <Timeline
          bourse={bourse}
          historyPast={historyPast}
          patrimoineNet={patrimoineNet}
          epargneMensuelle={epargneMensuelle}
          tauxEpargne={tauxEpargne}
        />
      ) : (
      <>
      {/* Performance vs Thèse */}
      <Card accent={CARD_THEMES.cyan}>
        <CardLabel icon={TableProperties}>Performance vs Thèse</CardLabel>
        <PerformanceTable notes={notes} positions={positions} />
      </Card>

      {/* Journal de bord */}
      <Card accent={CARD_THEMES.cyan}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <CardLabel icon={NotebookPen}>Journal de bord</CardLabel>
          <div className="flex items-center gap-2">
            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived((s) => !s)}
                className={`flex items-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-1.5 transition-colors ${
                  showArchived ? "text-cyan-300 border-cyan-500/40 bg-cyan-500/10" : "text-slate-500 border-slate-700 hover:text-slate-300"
                }`}
              >
                <Archive size={13} /> {showArchived ? "Masquer clôturées" : `Voir clôturées (${archivedCount})`}
              </button>
            )}
            <GhostButton onClick={() => { setShowForm((s) => !s); setEditingId(null); setClosingId(null); }} theme="cyan">
              Nouvelle note
            </GhostButton>
          </div>
        </div>

        {showForm && (
          <div className="mb-4">
            <NoteForm onCancel={() => setShowForm(false)} onSubmit={addNote} />
          </div>
        )}

        {editingNote && (
          <div className="mb-4">
            <NoteForm
              initial={editingNote}
              onCancel={() => setEditingId(null)}
              onSubmit={(values) => updateNote(editingId, values)}
            />
          </div>
        )}

        {closingNote && (
          <div className="mb-4">
            <PostMortemForm
              note={closingNote}
              onCancel={() => setClosingId(null)}
              onSubmit={(values) => closeNote(closingId, values)}
            />
          </div>
        )}

        {notes.length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5 flex-1 min-w-[160px] bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5">
              <Search size={13} className="text-slate-600 shrink-0" />
              <input
                type="text"
                placeholder="Rechercher un ticker, un titre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-sm w-full focus:outline-none placeholder-slate-600"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter size={13} className="text-slate-600" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-cyan-400/60"
              >
                <option value="all">Tous statuts</option>
                {Object.entries(STATUS).map(([key, s]) => (
                  <option key={key} value={key}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {notes.length === 0 ? (
          <EmptyState>
            Aucune note pour l'instant. Ajoute ta première thèse d'investissement : pourquoi tu achètes, ton objectif de cours, et surtout, à quelles conditions fondamentales tu vendrais.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState>Aucune note ne correspond à ta recherche.</EmptyState>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {filtered.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={(n) => { setEditingId(n.id); setShowForm(false); setClosingId(null); }}
                onDelete={deleteNote}
                onClosePosition={(n) => { setClosingId(n.id); setShowForm(false); setEditingId(null); }}
                onReopen={reopenNote}
                onDeclareOperation={declareOperation}
                highlighted={!!highlightTicker && note.ticker?.toUpperCase() === highlightTicker}
              />
            ))}
          </div>
        )}
      </Card>
      </>
      )}
    </div>
  );
}
