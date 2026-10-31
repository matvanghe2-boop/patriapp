import { useState, useMemo, useId, useEffect } from "react";
import { useSousOnglet, allerVers } from "../lib/useHashRoute";
import {
  NotebookPen, Pencil, X, Check, Search, ArchiveRestore, ClipboardCheck, Wallet, FileSignature, SendHorizonal,
  Camera, BookOpenCheck, Trash2, ShieldAlert, Scale, ChevronDown, Trophy, History,
} from "lucide-react";
import { Card, CardLabel, GhostButton, PageGlow, PastilleEtat, CARD_THEMES } from "./ui";
import EtatVide from "./EtatVide";
import OngletsGlissants from "./OngletsGlissants";
import MenuActions from "./MenuActions";
import AssetLogo from "./AssetLogo";
import Operations from "./Operations";
import AssetStats, { buildAssetStats } from "./AssetStats";
import Timeline from "./Timeline";
import FriseUnifiee from "./FriseUnifiee";
import { pct, pctPlain, nombre, uid, lireNombre, todayIso } from "../lib/finance";
import { useToast } from "../lib/ToastContext";
import { usePersistentState } from "../lib/storage";
import { fetchFundamentals, fetchQuotes } from "../lib/api";
import {
  STATUTS_THESE, DECISIONS, derniereRevue, aRelire, ajouterRevue, filThese, progressionObjectif, alertesPanique,
  couverture, photoDepuisFiche, depuisVente, bilanDecisions, resultatsARelire,
} from "../lib/theses";

const dateFr = (iso) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "";

function ilYA(iso, aujourdhui = todayIso()) {
  const j = Math.round((new Date(`${aujourdhui}T00:00:00`) - new Date(`${String(iso).slice(0, 10)}T00:00:00`)) / 86400000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return "hier";
  if (j < 31) return `il y a ${j} j`;
  if (j < 365) return `il y a ${Math.round(j / 30.44)} mois`;
  return `il y a ${nombre(j / 365.25, 1)} an${j >= 730 ? "s" : ""}`;
}

/** Prix dans la devise de cotation : un objectif en dollars ne s'écrit pas en euros. */
const prix = (v, devise = "EUR") =>
  Number.isFinite(v) ? `${nombre(v, 2)} ${!devise || devise === "EUR" ? "€" : devise}` : "—";

const CHAMP =
  "w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-rose-400/60";

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

function Boutons({ onAnnuler, libelle = "Enregistrer" }) {
  return (
    <div className="flex gap-2 justify-end">
      <button type="button" onClick={onAnnuler} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5">
        <X size={13} aria-hidden="true" /> Annuler
      </button>
      <button type="submit" className="flex items-center gap-1.5 text-xs font-semibold bg-rose-400 hover:bg-rose-300 text-slate-950 rounded-lg px-4 py-1.5 transition-colors">
        <Check size={14} aria-hidden="true" /> {libelle}
      </button>
    </div>
  );
}

// ─── Formulaire d'ajout / édition d'une note ────────────────────────────────
function NoteForm({ initial, onCancel, onSubmit }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const [values, setValues] = useState(initial || BLANK_NOTE);

  const submit = (e) => {
    e.preventDefault();
    if (!values.titre.trim() && !values.ticker.trim()) return;
    onSubmit({
      ...values,
      objectif_cours: values.objectif_cours === "" || values.objectif_cours == null ? null : lireNombre(values.objectif_cours),
    });
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-rose-400/20 bg-slate-950 p-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-1">
          <label htmlFor={`${idsChamps}-ticker-optionnel`} className="text-micro text-slate-500">Ticker (optionnel)</label>
          <input id={`${idsChamps}-ticker-optionnel`}
            type="text"
            placeholder="AI.PA"
            value={values.ticker}
            onChange={(e) => setValues((v) => ({ ...v, ticker: e.target.value.toUpperCase() }))}
            className={`${CHAMP} font-data`}
          />
        </div>
        <div className="col-span-2 sm:col-span-2">
          <label htmlFor={`${idsChamps}-titre-de-la`} className="text-micro text-slate-500">Titre de la note</label>
          <input id={`${idsChamps}-titre-de-la`}
            required
            type="text"
            placeholder="Ex : Renforcement Air Liquide"
            value={values.titre}
            onChange={(e) => setValues((v) => ({ ...v, titre: e.target.value }))}
            className={CHAMP}
          />
        </div>
        <div className="col-span-1">
          <label htmlFor={`${idsChamps}-objectif-de-cours`} className="text-micro text-slate-500">Objectif de cours</label>
          <input id={`${idsChamps}-objectif-de-cours`}
            type="number"
            step="0.01"
            placeholder="200"
            value={values.objectif_cours ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, objectif_cours: e.target.value }))}
            className={`${CHAMP} font-data`}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${idsChamps}-pitch-d-achat`} className="text-micro text-slate-500">Pitch d'achat — pourquoi cette thèse tient (2-3 phrases)</label>
        <textarea id={`${idsChamps}-pitch-d-achat`}
          rows={3}
          maxLength={500}
          placeholder="Ex : Leader mondial des gaz industriels, moat fort (contrats long terme + coûts de changement élevés), croissance des bénéfices régulière > 6%/an, dividende en hausse depuis 20 ans."
          value={values.these}
          onChange={(e) => setValues((v) => ({ ...v, these: e.target.value }))}
          className={`${CHAMP} resize-y`}
        />
      </div>

      <div>
        <label htmlFor={`${idsChamps}-conditions-de-vente`} className="text-micro text-slate-500">
          Conditions de vente — ce qui invaliderait la thèse (pas "si ça baisse de X%")
        </label>
        <textarea id={`${idsChamps}-conditions-de-vente`}
          rows={2}
          maxLength={500}
          placeholder="Ex : Si la marge opérationnelle passe sous 18%, si le dividende est coupé, si un changement de direction remet la stratégie en cause."
          value={values.conditions_vente}
          onChange={(e) => setValues((v) => ({ ...v, conditions_vente: e.target.value }))}
          className={`${CHAMP} resize-y`}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={`${idsChamps}-statut-de-la`} className="text-micro text-slate-500">Statut de la thèse</label>
          <select id={`${idsChamps}-statut-de-la`}
            value={values.statut}
            onChange={(e) => setValues((v) => ({ ...v, statut: e.target.value }))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-400/60"
          >
            {Object.entries(STATUTS_THESE).map(([key, s]) => (
              <option key={key} value={key}>{s.libelle}</option>
            ))}
          </select>
        </div>
        <Boutons onAnnuler={onCancel} />
      </div>
    </form>
  );
}

// ─── Relecture d'une thèse ──────────────────────────────────────────────────
/**
 * La relecture en un geste : le statut, et une ligne. Plus long, on ne le
 * ferait pas ; plus court, on ne saurait plus dans six mois pourquoi le
 * statut a changé.
 */
function RevueForm({ note, titre = "Toujours valide ?", commentaireInitial = "", onCancel, onSubmit }) {
  const idCommentaire = useId();
  const [statut, setStatut] = useState(note.statut || "intacte");
  const [commentaire, setCommentaire] = useState(commentaireInitial);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ statut, commentaire }); }}
      className="rounded-xl border border-rose-400/20 bg-slate-950 p-3 flex flex-col gap-3"
    >
      <fieldset>
        <legend className="text-micro text-slate-500 mb-1.5">{titre}</legend>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(STATUTS_THESE).map(([k, s]) => (
            <button
              key={k}
              type="button"
              aria-pressed={statut === k}
              onClick={() => setStatut(k)}
              className={`pastille-etat btn-flash ${statut === k ? "" : "opacity-50 hover:opacity-80"}`}
              data-etat={s.etat}
            >
              {s.libelle}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={idCommentaire} className="text-micro text-slate-500">Une ligne : ce qui a changé — ou pas</label>
        <input
          id={idCommentaire}
          type="text"
          maxLength={240}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          placeholder="Ex : résultats T3 conformes, la marge tient."
          className={CHAMP}
        />
      </div>
      <Boutons onAnnuler={onCancel} libelle="Consigner" />
    </form>
  );
}

// ─── Formulaire Post-Mortem (clôture d'une thèse après vente) ──────────────
function PostMortemForm({ note, suggestion, depuis, onCancel, onSubmit }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const initial = note.postmortem?.resultat_pct ?? (suggestion != null ? Math.round(suggestion * 10) / 10 : "");
  const [resultatPct, setResultatPct] = useState(initial);
  const [decision, setDecision] = useState(note.postmortem?.decision ?? "bonne_decision");
  const [bilan, setBilan] = useState(note.postmortem?.bilan ?? "");

  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      postmortem: {
        date: note.postmortem?.date || new Date().toISOString(),
        resultat_pct: resultatPct === "" ? null : lireNombre(resultatPct),
        decision,
        bilan,
      },
      archivee: true,
    });
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-700 bg-slate-950 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <ClipboardCheck size={15} className="text-rose-300" aria-hidden="true" />
        Bilan post-mortem — {note.ticker || note.titre}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idsChamps}-resultat-final`} className="text-micro text-slate-500">Résultat final (%)</label>
          <input id={`${idsChamps}-resultat-final`}
            type="number"
            step="0.1"
            placeholder="Ex : 18.5 ou -6.2"
            value={resultatPct}
            onChange={(e) => setResultatPct(e.target.value)}
            className={`${CHAMP} font-data`}
          />
        </div>
        <div>
          <label htmlFor={`${idsChamps}-decision`} className="text-micro text-slate-500">Décision</label>
          <select id={`${idsChamps}-decision`} value={decision} onChange={(e) => setDecision(e.target.value)} className={CHAMP}>
            {Object.entries(DECISIONS).map(([key, d]) => (
              <option key={key} value={key}>{d.libelle}</option>
            ))}
          </select>
        </div>
      </div>
      {suggestion != null && note.postmortem?.resultat_pct == null && (
        <p className="text-micro text-slate-500 -mt-1">
          Pré-rempli depuis ton journal d'opérations : plus-values, dividendes et frais compris.
        </p>
      )}
      {depuis?.ecartPct != null && (
        <p className="text-micro text-slate-400 -mt-1">
          Depuis ta dernière vente à {prix(depuis.prix)} le {dateFr(depuis.date)}, le titre a fait{" "}
          <span className={depuis.ecartPct >= 0 ? "etat-ok" : "etat-critique"}>{pct(depuis.ecartPct)}</span>.
        </p>
      )}
      <div>
        <label htmlFor={`${idsChamps}-bilan-qu-as`} className="text-micro text-slate-500">Bilan — qu'as-tu appris ?</label>
        <textarea id={`${idsChamps}-bilan-qu-as`}
          rows={3}
          maxLength={500}
          placeholder="Ex : Vendu avec +18%, mais un peu tôt par peur de perdre mes gains. La thèse fondamentale tenait toujours."
          value={bilan}
          onChange={(e) => setBilan(e.target.value)}
          className={`${CHAMP} resize-y`}
        />
      </div>
      <Boutons onAnnuler={onCancel} libelle="Clôturer la thèse" />
    </form>
  );
}

// ─── Morceaux de la carte de thèse ───────────────────────────────────────────

/** Le chemin du prix de revient à l'objectif, et où en est le cours. */
function BarreObjectif({ position, objectif }) {
  const devise = position.currency || "EUR";
  const p = progressionObjectif({ pru: position.pru, cours: position.current_price, objectif });
  if (!p) {
    const gain = position.pru > 0 ? ((position.current_price - position.pru) / position.pru) * 100 : null;
    return (
      <p className="text-micro text-slate-400">
        Cours <span className="font-data text-slate-200">{prix(position.current_price, devise)}</span> · PRU{" "}
        <span className="font-data">{prix(position.pru, devise)}</span>
        {gain != null && <span className={gain >= 0 ? "etat-ok" : "etat-critique"}> ({pct(gain)})</span>}
        {objectif != null && <> · objectif {prix(objectif, devise)}</>}
      </p>
    );
  }
  const position100 = Math.max(0, Math.min(100, p.pct));
  return (
    <div>
      <div className="flex justify-between text-micro text-slate-500">
        <span>PRU {prix(position.pru, devise)}</span>
        <span>Objectif {prix(objectif, devise)}</span>
      </div>
      <div
        className="relative h-1.5 rounded-full bg-slate-800 mt-1.5"
        role="meter"
        aria-label="Chemin du prix de revient à l'objectif"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position100)}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-rose-300/80" style={{ width: `${position100}%` }} />
        <span
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-slate-950 ${p.pct < 0 ? "bg-rose-500" : "bg-slate-100"}`}
          style={{ left: `${position100}%` }}
        />
      </div>
      <p className="text-micro text-slate-400 mt-1.5">
        Cours <span className="font-data text-slate-200">{prix(position.current_price, devise)}</span> ·{" "}
        {p.atteint
          ? <span className="etat-ok">objectif atteint ({pct(p.ecartObjectifPct)})</span>
          : p.pct < 0
            ? <span className="etat-critique">sous ton prix de revient</span>
            : `${Math.round(p.pct)} % du chemin, encore ${pct(-p.ecartObjectifPct)} à faire`}
      </p>
    </div>
  );
}

/** Ce que le marché disait du titre à l'écriture, face à aujourd'hui. */
function Photo({ note, coursActuel }) {
  const [aujourdhui, setAujourdhui] = useState(null);
  const [etat, setEtat] = useState("repos");
  const photo = note.photo;
  if (!photo) return null;

  const comparer = async () => {
    setEtat("charge");
    try {
      setAujourdhui(photoDepuisFiche(await fetchFundamentals(note.ticker)));
      setEtat("repos");
    } catch {
      setEtat("erreur");
    }
  };

  const ligne = (p) =>
    [
      p.cours != null && prix(p.cours, p.devise),
      p.per != null && `PER ${nombre(p.per, 1)}`,
      p.rendementPct != null && `rdt ${pctPlain(p.rendementPct, 1)}`,
      p.piotroski && `Piotroski ${p.piotroski.score}/${p.piotroski.evalues}`,
    ]
      .filter(Boolean)
      .join(" · ");
  const cours = aujourdhui?.cours ?? coursActuel;
  const evolution = photo.cours > 0 && cours > 0 ? ((cours - photo.cours) / photo.cours) * 100 : null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-micro">
      <div className="flex items-start gap-2">
        <Camera size={12} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-slate-400">
            <span className="text-slate-500">{photo.tardive ? "Photo du" : "À l'écriture,"} {dateFr(photo.date)} :</span>{" "}
            <span className="font-data text-slate-300">{ligne(photo)}</span>
          </p>
          {aujourdhui ? (
            <p className="text-slate-400 mt-0.5">
              <span className="text-slate-500">Aujourd'hui :</span> <span className="font-data text-slate-200">{ligne(aujourdhui)}</span>
              {evolution != null && <span className={evolution >= 0 ? "etat-ok" : "etat-critique"}> ({pct(evolution)})</span>}
            </p>
          ) : (
            <button
              type="button"
              onClick={comparer}
              disabled={etat === "charge"}
              className="btn-flash mt-0.5 text-rose-300 hover:text-rose-200 disabled:opacity-60"
            >
              {etat === "charge" ? "Chargement…" : etat === "erreur" ? "Fiche indisponible — réessayer" : "Comparer à aujourd'hui"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Le fil d'une thèse : écriture, relectures, clôture. */
function FilDeLaThese({ note }) {
  const [ouvert, setOuvert] = useState(false);
  const idFil = useId();
  const fil = filThese(note);
  if (fil.length <= 1) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-controls={idFil}
        className="btn-flash flex items-center gap-1.5 text-micro text-slate-500 hover:text-slate-300"
      >
        <History size={12} aria-hidden="true" />
        Journal de la thèse ({fil.length})
        <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <ol id={idFil} className="frise-unifiee mt-2">
          {fil.map((e) => (
            <li key={e.id} className="frise-ev">
              <span className={`frise-point ${e.type === "cloture" ? "bg-slate-500" : "bg-rose-400"}`} aria-hidden="true" />
              <span className="flex items-center gap-2 flex-wrap text-mini text-slate-300">
                {e.type === "ecrite" ? "Thèse écrite" : e.type === "cloture" ? "Clôturée" : "Relue"}
                {e.type === "revue" && STATUTS_THESE[e.statut] && (
                  <PastilleEtat etat={STATUTS_THESE[e.statut].etat}>{STATUTS_THESE[e.statut].libelle}</PastilleEtat>
                )}
                {e.type === "cloture" && DECISIONS[e.decision] && (
                  <PastilleEtat etat={DECISIONS[e.decision].etat}>{DECISIONS[e.decision].libelle}</PastilleEtat>
                )}
              </span>
              <span className="block text-micro text-slate-500 mt-0.5">
                {dateFr(e.date)}
                {e.commentaire && ` · ${e.commentaire}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NoteCard({
  note, position, highlighted, aujourdhui, publication, onEdit, onDelete, onClose, onReopen, onDeclareOperation, onRevue, onPhoto,
}) {
  const st = STATUTS_THESE[note.statut] || STATUTS_THESE.intacte;
  const pm = note.postmortem;
  const dec = pm ? DECISIONS[pm.decision] || DECISIONS.bonne_decision : null;
  // `false`, ou le motif de la relecture : « simple » ou « resultats ».
  const [relecture, setRelecture] = useState(false);
  const derniere = derniereRevue(note);
  const relue = (note.revues || []).length > 0;
  const enRetard = aRelire(note, aujourdhui);

  const actions = [
    !note.archivee && { libelle: "Relire la thèse", icone: BookOpenCheck, onClick: () => setRelecture(publication ? "resultats" : "simple") },
    { libelle: "Modifier", icone: Pencil, onClick: () => onEdit(note) },
    note.ticker && { libelle: "Déclarer une opération", icone: SendHorizonal, onClick: () => onDeclareOperation(note) },
    note.ticker && !note.photo && { libelle: "Prendre la photo du jour", icone: Camera, onClick: () => onPhoto(note) },
    note.archivee
      ? { libelle: "Ré-ouvrir la thèse", icone: ArchiveRestore, onClick: () => onReopen(note.id) }
      : { libelle: "Clôturer (bilan post-mortem)", icone: ClipboardCheck, onClick: () => onClose(note) },
    { libelle: "Supprimer", icone: Trash2, onClick: () => onDelete(note.id), danger: true },
  ];

  return (
    <article
      className={`rounded-xl border p-4 flex flex-col gap-3 transition-shadow ${
        note.archivee ? "border-slate-800/60 bg-slate-900/30" : "border-slate-800 bg-slate-900/60"
      } ${highlighted ? "ring-2 ring-rose-400/70" : ""}`}
    >
      <header className="flex items-start gap-3">
        {note.ticker && <AssetLogo ticker={note.ticker} size="sm" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {note.ticker && <span className="font-data text-xs font-bold text-rose-300">{note.ticker}</span>}
            {note.archivee ? (
              <PastilleEtat etat="neutre">Clôturée</PastilleEtat>
            ) : (
              <PastilleEtat etat={st.etat}>{st.libelle}</PastilleEtat>
            )}
          </div>
          <h3 className={`font-semibold mt-0.5 ${note.archivee ? "text-slate-400" : "text-slate-100"}`}>{note.titre || note.ticker}</h3>
          <p className="text-micro text-slate-500">
            Écrite le {dateFr(note.date)}
            {relue && derniere && ` · relue ${ilYA(derniere, aujourdhui)}`}
            {enRetard && <span className="etat-attention"> · à relire</span>}
          </p>
        </div>
        <MenuActions libelle={`Actions sur ${note.titre || note.ticker}`} actions={actions} />
      </header>

      {position && !note.archivee && <BarreObjectif position={position} objectif={lireNombre(note.objectif_cours)} />}
      {!position && !note.archivee && note.objectif_cours != null && (
        <p className="text-micro text-slate-400">
          Objectif de cours : <span className="font-data text-slate-200">{prix(lireNombre(note.objectif_cours))}</span>
          {note.ticker && <span className="text-slate-500"> · non détenu</span>}
        </p>
      )}

      {note.these && (
        <div>
          <div className="text-micro text-slate-500 mb-0.5">Thèse d'investissement</div>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.these}</p>
        </div>
      )}

      {note.conditions_vente && (
        <div>
          <div className="text-micro text-slate-500 mb-0.5">Conditions de vente</div>
          <p className="text-sm text-slate-400 whitespace-pre-wrap">{note.conditions_vente}</p>
        </div>
      )}

      <Photo note={note} coursActuel={position?.current_price} />

      {relecture && (
        <RevueForm
          note={note}
          titre={relecture === "resultats" ? "Face aux résultats publiés, la thèse tient-elle ?" : undefined}
          commentaireInitial={relecture === "resultats" && publication ? `Après les résultats du ${dateFr(publication.date)} : ` : ""}
          onCancel={() => setRelecture(false)}
          onSubmit={(r) => { onRevue(note, r); setRelecture(false); }}
        />
      )}

      {/* Une publication de résultats est exactement ce que décrivent les
          conditions de vente : c'est le moment de relire, que le cours ait
          bougé ou non. */}
      {!note.archivee && !relecture && publication && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100 flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[12rem]">
            {note.ticker} a publié ses résultats le {dateFr(publication.date)}
            {publication.label ? ` (${publication.label})` : ""}. Ta thèse tient-elle face aux chiffres ?
          </span>
          <button
            type="button"
            onClick={() => setRelecture("resultats")}
            className="btn-flash rounded-md bg-amber-400/90 hover:bg-amber-300 px-2.5 py-1 font-semibold text-slate-950"
          >
            Relire maintenant
          </button>
          <button
            type="button"
            onClick={() => allerVers("bourse", "calendrier")}
            className="btn-flash rounded-md border border-amber-400/40 px-2.5 py-1 hover:bg-amber-500/10"
          >
            Voir le résumé
          </button>
        </div>
      )}

      {!note.archivee && !relecture && !publication && enRetard && (
        <button
          type="button"
          onClick={() => setRelecture("simple")}
          className="btn-flash self-start inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
        >
          <BookOpenCheck size={13} aria-hidden="true" /> Relire — {relue ? `relue ${ilYA(derniere, aujourdhui)}` : "jamais relue"}
        </button>
      )}

      {pm && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
            <span className="text-micro text-slate-500">Bilan post-mortem · {dateFr(pm.date)}</span>
            <div className="flex items-center gap-2">
              {pm.resultat_pct != null && (
                <span className={`font-data text-xs font-bold ${pm.resultat_pct >= 0 ? "etat-ok" : "etat-critique"}`}>
                  {pct(pm.resultat_pct)}
                </span>
              )}
              {dec && <PastilleEtat etat={dec.etat}>{dec.libelle}</PastilleEtat>}
            </div>
          </div>
          {pm.bilan && <p className="text-sm text-slate-400 whitespace-pre-wrap">{pm.bilan}</p>}
        </div>
      )}

      <FilDeLaThese note={note} />
    </article>
  );
}

// ─── Bandeau et anti-panique ────────────────────────────────────────────────

function Chiffre({ libelle, valeur, detail, ton }) {
  return (
    <div className="min-w-0">
      <div className="text-micro text-slate-500 uppercase tracking-wide">{libelle}</div>
      <div className={`font-display text-chiffre mt-1 ${ton || "text-slate-50"}`}>{valeur}</div>
      {detail && <div className="text-micro text-slate-500 mt-1 truncate">{detail}</div>}
    </div>
  );
}

function BandeauTheses({ notes, positions, aujourdhui }) {
  const actives = notes.filter((n) => !n.archivee);
  const cv = couverture(notes, positions);
  const aRelireN = actives.filter((n) => aRelire(n, aujourdhui)).length;
  const bilan = bilanDecisions(notes);
  return (
    <Card role="vedette" accent={CARD_THEMES.rose}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Chiffre libelle="Thèses actives" valeur={actives.length} detail={`${notes.length - actives.length} clôturée${notes.length - actives.length > 1 ? "s" : ""}`} />
        <Chiffre
          libelle="Lignes couvertes"
          valeur={cv.lignes ? `${cv.couvertes}/${cv.lignes}` : "—"}
          ton={cv.sansThese.length ? "etat-attention" : undefined}
          detail={cv.sansThese.length ? `Sans thèse : ${cv.sansThese.join(", ")}` : cv.lignes ? "Toutes tes lignes ont une thèse" : "Aucune ligne en portefeuille"}
        />
        <Chiffre
          libelle="À relire"
          valeur={aRelireN}
          ton={aRelireN ? "etat-attention" : undefined}
          detail="Pas relues depuis 6 mois"
        />
        <Chiffre
          libelle="Bonnes décisions"
          valeur={bilan.tauxBonnes != null ? pctPlain(bilan.tauxBonnes, 0) : "—"}
          detail={bilan.total ? `sur ${bilan.total} thèse${bilan.total > 1 ? "s" : ""} clôturée${bilan.total > 1 ? "s" : ""}` : "Aucune thèse clôturée"}
        />
      </div>
    </Card>
  );
}

/**
 * Le mode anti-panique — la promesse de l'onglet, rendue active. Il fallait
 * aller chercher sa note au moment précis où l'on n'a pas la tête à ça ; la
 * baisse la fait désormais remonter d'elle-même, avec la seule question qui
 * compte : une de tes conditions de vente est-elle remplie ?
 */
function AlertePanique({ alertes, onRevue }) {
  // La pire baisse d'abord ; une fois relue, la thèse sort de la liste et la
  // suivante prend sa place.
  const a = alertes[0];
  if (!a) return null;
  const { note, position, variationPct, base } = a;
  const titre = base === "mois"
    ? `${note.ticker} : ${pct(variationPct)} en un mois.`
    : `${note.ticker} est ${pctPlain(Math.abs(variationPct), 0)} sous ton prix de revient.`;
  const contexte = { variationPct: Math.round(variationPct * 10) / 10, base, cours: position.current_price };
  const situation = base === "mois"
    ? `une baisse de ${pct(variationPct)} en un mois`
    : `un cours ${pctPlain(Math.abs(variationPct), 0)} sous le prix de revient`;
  const repondre = (statut, conclusion) =>
    onRevue(note, { statut, commentaire: `Relue face à ${situation} : ${conclusion}.`, contexte });

  return (
    <section aria-live="polite" className="rounded-2xl border border-rose-500/40 bg-rose-500/5 p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert size={20} className="text-rose-300 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-micro uppercase tracking-wide text-rose-300">Avant d'agir, relis-toi</p>
          <h2 className="text-lead text-slate-50 mt-1">{titre}</h2>
          <p className="text-mini text-slate-400 mt-2">Voici ce que tu avais écrit le {dateFr(note.date)} :</p>
          {note.these ? (
            <blockquote className="mt-1 border-l-2 border-rose-400/50 pl-3 text-sm text-slate-200 whitespace-pre-wrap">{note.these}</blockquote>
          ) : (
            <p className="mt-1 text-sm text-slate-500">(pas de pitch écrit)</p>
          )}
          {note.conditions_vente && (
            <>
              <p className="text-mini text-slate-400 mt-3">Tes conditions de vente :</p>
              <blockquote className="mt-1 border-l-2 border-slate-600 pl-3 text-sm text-slate-300 whitespace-pre-wrap">{note.conditions_vente}</blockquote>
            </>
          )}
          <p className="text-corps text-slate-100 mt-3">Une de ces conditions est-elle remplie ?</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={() => repondre("intacte", "la thèse tient")}
              className="btn-flash rounded-lg bg-rose-400 hover:bg-rose-300 px-3 py-1.5 text-xs font-semibold text-slate-950"
            >
              Non, la thèse tient
            </button>
            <button
              type="button"
              onClick={() => repondre("surveiller", "à surveiller")}
              className="btn-flash rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Pas sûr, à surveiller
            </button>
            <button
              type="button"
              onClick={() => repondre("invalidee", "une condition de vente est remplie")}
              className="btn-flash rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Oui, thèse invalidée
            </button>
          </div>
          {alertes.length > 1 && (
            <p className="text-micro text-slate-500 mt-3">
              {alertes.length - 1} autre{alertes.length > 2 ? "s" : ""} ligne{alertes.length > 2 ? "s" : ""} en forte baisse ensuite.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Bilan ──────────────────────────────────────────────────────────────────

function BilanDecisions({ notes, bourse }) {
  const bilan = useMemo(() => bilanDecisions(notes), [notes]);
  const closes = useMemo(
    () => notes.filter((n) => n.archivee && n.postmortem).sort((a, b) => String(b.postmortem.date).localeCompare(String(a.postmortem.date))),
    [notes]
  );
  const [cours, setCours] = useState({});

  // Ce que les titres vendus ont fait depuis : une seule requête groupée, à
  // l'ouverture du bilan — pas à chaque rendu de l'onglet.
  const tickersVendus = useMemo(
    () => [...new Set(closes.map((n) => String(n.ticker || "").toUpperCase()).filter(Boolean))].sort().join(","),
    [closes]
  );
  useEffect(() => {
    if (!tickersVendus) return undefined;
    let annule = false;
    fetchQuotes(tickersVendus.split(","))
      .then((q) => {
        if (annule) return;
        setCours(Object.fromEntries(q.filter((x) => x.ok && x.price > 0 && (!x.currency || x.currency === "EUR")).map((x) => [x.symbol.toUpperCase(), x.price])));
      })
      .catch(() => {});
    return () => { annule = true; };
  }, [tickersVendus]);

  if (bilan.total === 0) {
    return (
      <Card accent={CARD_THEMES.rose}>
        <CardLabel icon={Scale}>Bilan de tes décisions</CardLabel>
        <EtatVide picto="notes" titre="Aucune thèse clôturée">
          Quand tu clôtures une thèse avec son post-mortem, elle vient nourrir ce bilan : part de bonnes décisions,
          résultat moyen des erreurs d'émotion, durée de détention.
        </EtatVide>
      </Card>
    );
  }

  const maxNombre = Math.max(...Object.values(bilan.parDecision).map((d) => d.nombre), 1);

  return (
    <>
      <Card accent={CARD_THEMES.rose}>
        <CardLabel icon={Scale}>Bilan de tes décisions</CardLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
          <Chiffre libelle="Clôturées" valeur={bilan.total} />
          <Chiffre libelle="Bonnes décisions" valeur={pctPlain(bilan.tauxBonnes, 0)} />
          <Chiffre
            libelle="Résultat moyen"
            valeur={bilan.resultatMoyen != null ? pct(bilan.resultatMoyen) : "—"}
            ton={bilan.resultatMoyen == null ? undefined : bilan.resultatMoyen >= 0 ? "etat-ok" : "etat-critique"}
          />
          <Chiffre
            libelle="Détention moyenne"
            valeur={bilan.dureeMoyenneJours != null ? `${Math.round(bilan.dureeMoyenneJours / 30.44)} mois` : "—"}
          />
        </div>

        <ul className="mt-5 flex flex-col gap-2.5">
          {Object.entries(DECISIONS).map(([k, d]) => {
            const v = bilan.parDecision[k];
            return (
              <li key={k} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-xs">
                <PastilleEtat etat={d.etat} className="justify-self-start">{d.libelle}</PastilleEtat>
                <span className="h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full bg-rose-300/70" style={{ width: `${(v.nombre / maxNombre) * 100}%` }} />
                </span>
                <span className="text-slate-400 text-right">
                  {v.nombre} · {v.resultatMoyen != null ? <span className="font-data">{pct(v.resultatMoyen)}</span> : "—"}
                </span>
              </li>
            );
          })}
        </ul>

        {(bilan.meilleure || bilan.pire) && (
          <p className="text-micro text-slate-500 mt-4 flex items-start gap-1.5">
            <Trophy size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {bilan.meilleure && <>Meilleure : {bilan.meilleure.note.ticker || bilan.meilleure.note.titre} ({pct(bilan.meilleure.resultat)})</>}
              {bilan.pire && <> · moins bonne : {bilan.pire.note.ticker || bilan.pire.note.titre} ({pct(bilan.pire.resultat)})</>}
            </span>
          </p>
        )}
        <p className="text-micro text-slate-500 mt-2">
          Le journal ne juge pas à ta place : la décision est celle que tu as notée en clôturant. Une vente gagnante peut
          être une erreur d'émotion, et une vente à perte une bonne décision.
        </p>
      </Card>

      <Card accent={CARD_THEMES.rose}>
        <CardLabel icon={ClipboardCheck}>Post-mortems</CardLabel>
        <ul className="mt-3 divide-y divide-slate-800/70">
          {closes.map((n) => {
            const pm = n.postmortem;
            const dec = DECISIONS[pm.decision] || DECISIONS.bonne_decision;
            const position = (bourse?.positions || []).find((p) => String(p.ticker).toUpperCase() === String(n.ticker || "").toUpperCase() && Number(p.quantity) > 0);
            const coursActuel = position?.current_price ?? cours[String(n.ticker || "").toUpperCase()];
            const depuis = n.ticker ? depuisVente(bourse?.operations, n.ticker, coursActuel) : null;
            return (
              <li key={n.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-corps text-slate-200">{n.ticker ? `${n.ticker} — ` : ""}{n.titre}</span>
                    <span className="block text-micro text-slate-500">
                      Clôturée le {dateFr(pm.date)}
                      {depuis?.ecartPct != null && (
                        <> · depuis ta vente : <span className={depuis.ecartPct >= 0 ? "etat-ok" : "etat-critique"}>{pct(depuis.ecartPct)}</span></>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 flex flex-col items-end gap-1">
                    {pm.resultat_pct != null && (
                      <span className={`font-data text-xs font-bold ${pm.resultat_pct >= 0 ? "etat-ok" : "etat-critique"}`}>{pct(pm.resultat_pct)}</span>
                    )}
                    <PastilleEtat etat={dec.etat}>{dec.libelle}</PastilleEtat>
                  </span>
                </div>
                {pm.bilan && <p className="text-mini text-slate-400 mt-1.5 whitespace-pre-wrap">{pm.bilan}</p>}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

// ─── Composant principal ────────────────────────────────────────────────────

const FILTRES = [
  { id: "actives", libelle: "Actives" },
  { id: "intacte", libelle: "Intactes" },
  { id: "surveiller", libelle: "À surveiller" },
  { id: "invalidee", libelle: "Invalidées" },
  { id: "a_relire", libelle: "À relire" },
  { id: "cloturees", libelle: "Clôturées" },
];

/**
 * Stratégie & Logs — journal de bord anti-panique. Chaque note capture une
 * thèse d'investissement au moment lucide de l'achat (pitch, objectif de
 * cours, conditions de vente) pour pouvoir s'y référer froidement lors
 * d'une secousse de marché plutôt que de réagir dans l'émotion.
 *
 * Trois sous-onglets, chacun répondant à une question :
 * - Thèses : pourquoi je détiens chaque ligne, et où elle en est. Chaque
 *   thèse se relit en un geste et garde le fil daté de ses relectures ; une
 *   forte baisse la fait remonter d'elle-même (mode anti-panique).
 * - Journal : que s'est-il passé, et dans quel ordre — opérations, frise des
 *   événements (thèses comprises) et jalons du patrimoine.
 * - Bilan : qu'est-ce que mes décisions m'apprennent — post-mortems,
 *   bilan des décisions et statistiques par ligne.
 *
 * Persisté via usePersistentState côté PatrimoineContext (strategyNotes).
 * bourse.positions est lu en lecture seule pour le rapprochement par ticker —
 * aucune écriture n'est faite sur le portefeuille depuis cet écran, hors du
 * sous-onglet Journal qui porte la saisie des opérations.
 */
export default function StrategieLogs({
  strategyNotes = [], setStrategyNotes, bourse, setBourse,
  historyPast, patrimoineNet, epargneMensuelle, tauxEpargne, objectifs = [],
}) {
  const notes = strategyNotes;
  const setNotes = setStrategyNotes;
  const positions = useMemo(() => bourse?.positions || [], [bourse]);
  const { showToast } = useToast();
  const [series] = usePersistentState("bourseSeriesCours", {});
  const [evenements] = usePersistentState("calendrierEvenements", []);
  const aujourdhui = todayIso();

  // ─── Sous-onglets & passerelles Thèse ⇄ Opérations ──────────────────────
  const [subTab, setSubTab] = useSousOnglet(["theses", "journal", "bilan"], "theses");
  const [presetOperation, setPresetOperation] = useState(null); // { asset, type } pour ouvrir la modale d'opération pré-remplie
  const [highlightTicker, setHighlightTicker] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [closingId, setClosingId] = useState(null);
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState("actives");

  const declareOperation = (note) => {
    setPresetOperation({ asset: note.ticker, type: "ACHAT" });
    setSubTab("journal");
  };

  const openThesisForAsset = (asset) => {
    setHighlightTicker(asset?.toUpperCase() || null);
    setSearch(asset || "");
    setFiltre("actives");
    setSubTab("theses");
  };

  const positionDe = (note) =>
    note.ticker
      ? positions.find((p) => String(p.ticker).toUpperCase() === note.ticker.toUpperCase() && Number(p.quantity) > 0) || null
      : null;

  /**
   * La photo est prise en tâche de fond après l'enregistrement : la note ne
   * doit jamais attendre le réseau, et une fiche indisponible ne doit pas
   * empêcher d'écrire sa thèse.
   */
  const prendrePhoto = async (note, { tardive = false, signaler = false } = {}) => {
    try {
      const photo = photoDepuisFiche(await fetchFundamentals(note.ticker));
      if (!photo) throw new Error("vide");
      setNotes((l) => l.map((n) => (n.id === note.id ? { ...n, photo: tardive ? { ...photo, tardive: true } : photo } : n)));
    } catch {
      if (signaler) showToast({ message: `Fiche financière de ${note.ticker} indisponible pour le moment.` });
    }
  };

  const addNote = (values) => {
    const note = {
      id: uid(), date: new Date().toISOString(), archivee: false, postmortem: null, revues: [],
      ...values, statutInitial: values.statut,
    };
    setNotes((n) => [note, ...n]);
    setShowForm(false);
    if (note.ticker) prendrePhoto(note);
  };

  // Un changement de statut par l'édition est une relecture comme une autre :
  // il entre dans le fil, sinon le journal raconterait une autre histoire que
  // la pastille.
  const updateNote = (id, values) => {
    setNotes((n) =>
      n.map((note) => {
        if (note.id !== id) return note;
        const modifiee = { ...note, ...values };
        return values.statut && values.statut !== note.statut
          ? ajouterRevue({ ...modifiee, statut: note.statut }, { id: uid(), statut: values.statut, commentaire: "Statut modifié" })
          : modifiee;
      })
    );
    setEditingId(null);
  };

  const consignerRevue = (note, { statut, commentaire, contexte }) => {
    setNotes((n) => n.map((x) => (x.id === note.id ? ajouterRevue(x, { id: uid(), statut, commentaire, contexte }) : x)));
    showToast({ message: `Relecture de « ${note.ticker || note.titre} » consignée.` });
  };

  // Suppression annulable plutôt que confirmation bloquante : c'est le geste
  // le plus fréquent de l'app, et le toast « Annuler » évite d'imposer une
  // boîte de dialogue à chaque fois tout en restant réversible.
  const deleteNote = (id) => {
    const previous = notes;
    const note = notes.find((n) => n.id === id);
    setNotes((n) => n.filter((x) => x.id !== id));
    showToast({
      message: `Note « ${note?.titre || note?.ticker || "sans titre"} » supprimée.`,
      onUndo: () => setNotes(previous),
    });
  };

  const closeNote = (id, values) => {
    setNotes((n) => n.map((note) => (note.id === id ? { ...note, ...values } : note)));
    setClosingId(null);
  };

  const reopenNote = (id) => {
    setNotes((n) => n.map((note) => (note.id === id ? { ...note, archivee: false } : note)));
  };

  const alertes = useMemo(
    () => alertesPanique({ notes, positions, series, aujourdhui }),
    [notes, positions, series, aujourdhui]
  );
  const publications = useMemo(
    () => new Map(resultatsARelire({ notes, evenements, aujourdhui }).map((x) => [x.note.id, x.evenement])),
    [notes, evenements, aujourdhui]
  );

  const comptes = useMemo(() => {
    const actives = notes.filter((n) => !n.archivee);
    return {
      actives: actives.length,
      intacte: actives.filter((n) => n.statut === "intacte").length,
      surveiller: actives.filter((n) => n.statut === "surveiller").length,
      invalidee: actives.filter((n) => n.statut === "invalidee").length,
      a_relire: actives.filter((n) => aRelire(n, aujourdhui)).length,
      cloturees: notes.length - actives.length,
    };
  }, [notes, aujourdhui]);

  const filtered = useMemo(() => {
    return notes
      .filter((n) => {
        if (filtre === "cloturees") return n.archivee;
        if (n.archivee) return false;
        if (filtre === "a_relire") return aRelire(n, aujourdhui);
        return filtre === "actives" || n.statut === filtre;
      })
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
  }, [notes, search, filtre, aujourdhui]);

  const closingNote = closingId ? notes.find((n) => n.id === closingId) : null;
  const statsLignes = useMemo(() => buildAssetStats(bourse?.operations || [], positions), [bourse, positions]);
  const suggestionCloture = closingNote?.ticker
    ? statsLignes.find((r) => r.key === closingNote.ticker.toUpperCase())?.rendementPct ?? null
    : null;
  const depuisCloture = closingNote?.ticker
    ? depuisVente(bourse?.operations, closingNote.ticker, positionDe(closingNote)?.current_price)
    : null;

  return (
    <div className="relative space-y-6">
      <PageGlow color="rose" />
      <div className="relative">
        <h1 className="font-display text-2xl text-slate-50">
          Stratégie &amp; <span className="text-rose-300">Logs</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Le journal de bord anti-panique — note tes thèses à l'achat pour t'y référer froidement lors des secousses de marché.
        </p>
      </div>

      {notes.length > 0 && <BandeauTheses notes={notes} positions={positions} aujourdhui={aujourdhui} />}

      <AlertePanique alertes={alertes} onRevue={consignerRevue} />

      <OngletsGlissants
        className="teinte-rose"
        avecPanneaux
        ariaLabel="Sections de Stratégie & Logs"
        actif={subTab}
        onChange={setSubTab}
        onglets={[
          { id: "theses", libelle: "Thèses", icone: FileSignature, badge: comptes.actives || undefined },
          { id: "journal", libelle: "Journal", icone: Wallet },
          { id: "bilan", libelle: "Bilan", icone: Scale, badge: comptes.cloturees || undefined },
        ]}
      />

      <div role="tabpanel" id={`panneau-${subTab}`} aria-labelledby={`onglet-${subTab}`} className="space-y-6">
        {subTab === "journal" && (
          <>
            <Operations
              bourse={bourse}
              setBourse={setBourse}
              presetOperation={presetOperation}
              onConsumePreset={() => setPresetOperation(null)}
              onOpenThesis={openThesisForAsset}
            />
            {/* La frise raconte les ÉVÉNEMENTS — opérations et thèses dans le
                même fil ; la Timeline raconte les JALONS du patrimoine. C'est
                la même question — que s'est-il passé, et dans quel ordre —
                posée à deux échelles. */}
            <FriseUnifiee
              operations={bourse?.operations}
              objectifs={objectifs}
              theses={notes}
              patrimoineNet={patrimoineNet}
            />
            <Timeline
              bourse={bourse}
              historyPast={historyPast}
              patrimoineNet={patrimoineNet}
              epargneMensuelle={epargneMensuelle}
              tauxEpargne={tauxEpargne}
            />
          </>
        )}

        {subTab === "bilan" && (
          <>
            <BilanDecisions notes={notes} bourse={bourse} />
            <AssetStats bourse={bourse} />
          </>
        )}

        {subTab === "theses" && (
          <Card accent={CARD_THEMES.rose}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <CardLabel icon={NotebookPen}>Mes thèses</CardLabel>
              <GhostButton onClick={() => { setShowForm((s) => !s); setEditingId(null); setClosingId(null); }} theme="rose">
                Nouvelle thèse
              </GhostButton>
            </div>

            {showForm && (
              <div className="mb-4">
                <NoteForm onCancel={() => setShowForm(false)} onSubmit={addNote} />
              </div>
            )}

            {closingNote && (
              <div className="mb-4">
                <PostMortemForm
                  note={closingNote}
                  suggestion={suggestionCloture}
                  depuis={depuisCloture}
                  onCancel={() => setClosingId(null)}
                  onSubmit={(values) => closeNote(closingId, values)}
                />
              </div>
            )}

            {notes.length > 0 && (
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5">
                  <Search size={13} className="text-slate-500 shrink-0" aria-hidden="true" />
                  <input
                    type="text"
                    aria-label="Rechercher une thèse"
                    placeholder="Rechercher un ticker, un titre..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-transparent text-sm w-full focus:outline-none placeholder-slate-600"
                  />
                </div>
                <div role="group" aria-label="Filtrer les thèses" className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                  {FILTRES.filter((f) => f.id === "actives" || comptes[f.id] > 0 || filtre === f.id).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={filtre === f.id}
                      onClick={() => setFiltre(f.id)}
                      className={`btn-flash shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                        filtre === f.id
                          ? "border-rose-400/60 bg-rose-500/15 text-rose-200"
                          : "border-slate-700 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {f.libelle}
                      <span className="font-data text-micro opacity-70">{comptes[f.id]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {notes.length === 0 ? (
              <EtatVide
                picto="notes"
                titre="Aucune thèse pour l'instant"
                action={
                  !showForm && (
                    <GhostButton theme="rose" onClick={() => setShowForm(true)}>Écrire ma première thèse</GhostButton>
                  )
                }
              >
                Pourquoi tu achètes, ton objectif de cours, et surtout à quelles conditions fondamentales tu vendrais.
                C'est ce texte qui remontera tout seul si la ligne chute.
              </EtatVide>
            ) : filtered.length === 0 ? (
              <EtatVide picto="recherche">Aucune thèse ne correspond à ce filtre.</EtatVide>
            ) : (
              <div className="grid lg:grid-cols-2 gap-3">
                {filtered.map((note) =>
                  note.id === editingId ? (
                    <NoteForm
                      key={note.id}
                      initial={note}
                      onCancel={() => setEditingId(null)}
                      onSubmit={(values) => updateNote(note.id, values)}
                    />
                  ) : (
                    <NoteCard
                      key={note.id}
                      note={note}
                      position={positionDe(note)}
                      aujourdhui={aujourdhui}
                      onEdit={(n) => { setEditingId(n.id); setShowForm(false); setClosingId(null); }}
                      onDelete={deleteNote}
                      onClose={(n) => { setClosingId(n.id); setShowForm(false); setEditingId(null); }}
                      onReopen={reopenNote}
                      onDeclareOperation={declareOperation}
                      onRevue={consignerRevue}
                      onPhoto={(n) => prendrePhoto(n, { tardive: true, signaler: true })}
                      publication={publications.get(note.id)}
                      highlighted={!!highlightTicker && note.ticker?.toUpperCase() === highlightTicker}
                    />
                  )
                )}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
