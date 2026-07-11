import React, { useState, useMemo } from "react";
import { NotebookPen, Plus, Pencil, X, Check, Search, Filter } from "lucide-react";
import { Card, CardLabel, GhostButton, IconTrash, EmptyState, CARD_THEMES } from "./ui";

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

// ─── Carte d'affichage d'une note ───────────────────────────────────────────
function NoteCard({ note, onEdit, onDelete }) {
  const st = STATUS[note.statut] || STATUS.intacte;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 group">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            {note.ticker && (
              <span className="font-data text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded px-1.5 py-0.5">
                {note.ticker}
              </span>
            )}
            <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${st.bg} ${st.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
              {st.label}
            </span>
          </div>
          <h3 className="font-semibold text-slate-100 truncate">{note.titre}</h3>
          <p className="text-[11px] text-slate-500">{formatDateFr(note.date)}</p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
    </div>
  );
}

// ─── Composant principal ────────────────────────────────────────────────────
/**
 * Stratégie & Logs — journal de bord anti-panique. Chaque note capture une
 * thèse d'investissement au moment lucide de l'achat (pitch, objectif de
 * cours, conditions de vente) pour pouvoir s'y référer froidement lors
 * d'une secousse de marché plutôt que de réagir dans l'émotion.
 * Persisté via usePersistentState côté App.jsx (prop notes/setNotes).
 */
export default function StrategieLogs({ strategyNotes = [], setStrategyNotes, ...rest }) {
  const notes = strategyNotes;
  const setNotes = setStrategyNotes;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const addNote = (values) => {
    setNotes((n) => [{ id: uid(), date: new Date().toISOString(), ...values }, ...n]);
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

  const filtered = useMemo(() => {
    return notes
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
  }, [notes, search, statusFilter]);

  const editingNote = editingId ? notes.find((n) => n.id === editingId) : null;

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

      <Card accent={CARD_THEMES.cyan}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <CardLabel icon={NotebookPen}>Journal de bord</CardLabel>
          <GhostButton onClick={() => { setShowForm((s) => !s); setEditingId(null); }} theme="cyan">
            Nouvelle note
          </GhostButton>
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
              <NoteCard key={note.id} note={note} onEdit={(n) => { setEditingId(n.id); setShowForm(false); }} onDelete={deleteNote} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
