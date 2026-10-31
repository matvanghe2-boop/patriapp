import { useState, useMemo, useEffect, useId } from "react";
import { useSousOnglet } from "../lib/useHashRoute";
import OngletsGlissants from "./OngletsGlissants";
import { PiggyBank, ShieldCheck, Target, Trash2, Plus, X, ChevronDown, ChevronUp, AlertTriangle, ArrowUp, ArrowDown, Minus, Wallet, Pencil, Check, Percent } from "lucide-react";
import { Card, CardLabel, GhostButton, AddPanel, EmptyState, PageGlow, CARD_THEMES } from "./ui";
import { eur, uid, guessEnvelope, todayIso, lireNombre, pctPlain, nombre } from "../lib/finance";
import { usePersistentState } from "../lib/storage";
import { useToast } from "../lib/ToastContext";
import RatesHub from "./RatesHub";
import EtatVide from "./EtatVide";
import MouvementsLivrets from "./MouvementsLivrets";
import { ajouterMouvement, retirerMouvement, interetsQuinzaines } from "../lib/livretsMouvements";
import { plafondLegal } from "../lib/plafondsLivrets";
import {
  projectionVirement, verifierVirement, dateObjectif, serieSoldeLivret, serieVarie, rendementReel, manqueMatelas,
  enveloppesEnDepassement, ageFiscal, deMot,
} from "../lib/epargne";
import { inflationOfficielle } from "../lib/inflation";
import { Sparkline } from "./graphiques";
import MenuActions from "./MenuActions";
import ReglagesLivret from "./ReglagesLivret";
import InteretsFinAnnee from "./InteretsFinAnnee";
import LivretsReglementes from "./LivretsReglementes";

// ─── Historique du matelas de sécurité (texte seul, pas de graphique) ────────
/**
 * Le relevé du matelas de sécurité passe par `usePersistentState`, donc par la
 * synchronisation cloud, l'export JSON et « Réinitialiser ».
 *
 * Il était écrit en direct dans le localStorage sous une clé absente de
 * STORAGE_KEYS : la donnée ne suivait pas d'un appareil à l'autre, n'était pas
 * sauvegardée, et survivait à une réinitialisation. C'est exactement le défaut
 * qui avait été corrigé pour `allocationTarget` — ce cas-ci avait été oublié.
 */
function useMatelasTrend(matelasMois) {
  const [releve, setReleve] = usePersistentState("matelasHistory", null);

  useEffect(() => {
    if (!Number.isFinite(matelasMois)) return;
    const today = todayIso();
    setReleve((precedent) => {
      if (precedent?.date === today) return precedent;
      // La valeur d'avant aujourd'hui devient la référence de comparaison.
      return { date: today, value: matelasMois, prevValue: precedent?.value ?? null };
    });
  }, [matelasMois, setReleve]);

  const refValue = releve?.prevValue ?? null;
  if (refValue == null || !Number.isFinite(matelasMois)) return null;
  return { delta: matelasMois - refValue, refValue };
}

function MatelasTrendBadge({ matelasMois }) {
  const trend = useMatelasTrend(matelasMois);
  if (!trend || Math.abs(trend.delta) < 0.05) return null;
  const up = trend.delta > 0;
  return (
    <span className={`flex items-center gap-1 text-micro mt-1 ${up ? "text-emerald-400/90" : "text-amber-300/90"}`}>
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {up ? "+" : ""}{nombre(trend.delta, 1)} mois vs dernier relevé
    </span>
  );
}

// ─── Smart Progress Bar ───────────────────────────────────────────────────────
function SmartProgressBar({ value, max, goal, color = "bg-indigo-400" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const goalPct = (goal && max > 0) ? Math.min(100, (goal / max) * 100) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2 w-full rounded-full bg-slate-800 overflow-visible">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
        {goalPct !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-amber-400/80 rounded-full"
            style={{ left: `${goalPct}%` }}
            title={`Objectif : ${eur(goal)}`}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-micro text-slate-500 font-data">
        <span>{pctPlain(pct, 0)}</span>
        <span className="ghost-blur">{eur(value, 0)} / {eur(max, 0)}</span>
      </div>
    </div>
  );
}

// ─── Alerte de saturation des plafonds (bandeau compact, sans graphique) ─────
function SaturationAlert({ livrets }) {
  const flagged = useMemo(() => {
    return livrets
      .map((l) => {
        const limit = l.limit || plafondLegal(l.name);
        if (!limit) return null;
        const ratio = l.balance / limit;
        if (ratio < 0.85) return null;
        return { ...l, limit, ratio, full: ratio >= 1 };
      })
      .filter(Boolean)
      .sort((a, b) => b.ratio - a.ratio);
  }, [livrets]);

  if (flagged.length === 0) return null;

  return (
    <Card accent={CARD_THEMES.amber}>
      <CardLabel icon={AlertTriangle}>Plafonds bientôt atteints</CardLabel>
      <div className="space-y-1.5 mt-2">
        {flagged.map((l) => (
          <div key={l.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-300">{l.name}</span>
            <span className={`font-data tabular-nums text-[12px] ${l.full ? "text-rose-400" : "text-amber-300"}`}>
              {l.full ? "Plafond atteint" : `${Math.round(l.ratio * 100)}% du plafond`}
              <span className="text-slate-500 ml-1.5 ghost-blur">({eur(l.limit - l.balance, 0)} restants)</span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-micro text-slate-500 mt-2">
        Envisage un autre support pour tes prochains versements sur ces comptes.
      </p>
    </Card>
  );
}

// ─── Simulateur : où placer mon prochain versement ────────────────────────────
function NextDepositAdvisor({ livrets }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const [amount, setAmount] = useState(500);

  const ranked = useMemo(() => {
    return livrets
      .map((l) => {
        const limit = l.limit || plafondLegal(l.name);
        const room = limit ? Math.max(0, limit - l.balance) : Infinity;
        return { ...l, limit, room };
      })
      .filter((l) => l.room > 0)
      .sort((a, b) => b.rate - a.rate);
  }, [livrets]);

  // Répartit le montant en cascade : priorité au taux le plus élevé, dans la limite de la place restante
  const allocation = useMemo(() => {
    let remaining = amount;
    const result = [];
    for (const l of ranked) {
      if (remaining <= 0) break;
      const alloc = Math.min(remaining, l.room);
      if (alloc <= 0) continue;
      result.push({ ...l, alloc });
      remaining -= alloc;
    }
    return { result, leftover: remaining };
  }, [ranked, amount]);

  if (livrets.length === 0) return null;

  return (
    <Card accent={CARD_THEMES.indigo}>
      <CardLabel icon={Wallet}>Où placer mon prochain versement ?</CardLabel>
      <div className="flex items-center gap-2 mt-2">
        <label htmlFor={`${idsChamps}-montant-a-placer`} className="text-xs text-slate-500">Montant à placer</label>
        <input id={`${idsChamps}-montant-a-placer`}
          type="number"
          value={amount}
          onChange={(e) => setAmount(lireNombre(e.target.value) ?? 0)}
          className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums focus:outline-none focus:border-indigo-400/60"
        />
        <span className="text-xs text-slate-500">€</span>
      </div>

      {allocation.result.length === 0 ? (
        <EmptyState picto="epargne">Tous tes livrets sont au plafond — envisage l'onglet Bourse pour ce montant.</EmptyState>
      ) : (
        <div className="space-y-1.5 mt-3">
          {allocation.result.map((l, i) => (
            <div key={l.id} className="flex items-center justify-between text-sm rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
              <span className="flex items-center gap-2">
                <span className="text-micro text-indigo-300 bg-indigo-400/10 border border-indigo-400/20 rounded-full w-5 h-5 flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-slate-300">{l.name}</span>
                <span className="text-micro text-amber-300/80">{pctPlain((l.rate * 100), 2)}</span>
              </span>
              <span className="font-data tabular-nums text-emerald-400 ghost-blur">{eur(l.alloc, 0)}</span>
            </div>
          ))}
          {allocation.leftover > 0.5 && (
            <p className="text-micro text-amber-300/80 mt-1">
              <span className="ghost-blur">{eur(allocation.leftover, 0)}</span> restants une fois tous les plafonds atteints — à orienter vers la Bourse ou un autre support.
            </p>
          )}
        </div>
      )}
      <p className="text-micro text-slate-500 mt-3">
        Classement par taux net décroissant, dans la limite de la place restante sous chaque plafond.
      </p>
    </Card>
  );
}

// ─── Ventilation / Enveloppes tags ────────────────────────────────────────────
const ENVELOPPE_COLORS = [
  { bg: "bg-teal-400/15 border-teal-400/30 text-teal-300", dot: "bg-teal-400" },
  { bg: "bg-violet-400/15 border-violet-400/30 text-violet-300", dot: "bg-violet-400" },
  { bg: "bg-amber-400/15 border-amber-400/30 text-amber-300", dot: "bg-amber-400" },
  { bg: "bg-rose-400/15 border-rose-400/30 text-rose-300", dot: "bg-rose-400" },
  { bg: "bg-sky-400/15 border-sky-400/30 text-sky-300", dot: "bg-sky-400" },
];

function Ventilation({ livretsTotal, livrets = [], enveloppes, setEnveloppes }) {
  // Chaque étiquette est reliée à son champ (voir C-05) : `useId` garantit
  // des identifiants uniques même si ce formulaire est monté deux fois.
  const idsChamps = useId();
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ label: "", amount: "", livretId: "" });
  const [expanded, setExpanded] = useState(true);

  const totalTagged = enveloppes.reduce((s, e) => s + e.amount, 0);
  const remaining = livretsTotal - totalTagged;

  const addEnv = () => {
    if (!draft.label || !draft.amount) return;
    setEnveloppes((prev) => [
      ...prev,
      {
        id: uid(),
        label: draft.label,
        amount: lireNombre(draft.amount) ?? 0,
        colorIdx: prev.length % ENVELOPPE_COLORS.length,
        livretId: draft.livretId || null,
      },
    ]);
    setDraft({ label: "", amount: "", livretId: "" });
    setShowAdd(false);
  };
  const removeEnv = (id) => setEnveloppes((prev) => prev.filter((e) => e.id !== id));
  const updateEnv = (id, amount) =>
    setEnveloppes((prev) => prev.map((e) => e.id === id ? { ...e, amount: lireNombre(amount) ?? 0 } : e));
  const rattacher = (id, livretId) =>
    setEnveloppes((prev) => prev.map((e) => (e.id === id ? { ...e, livretId: livretId || null } : e)));
  // Le total peut tenir alors qu'un livret ne le peut pas : 3 000 € réservés
  // au voyage sur un Livret A qui n'en contient que 2 000.
  const depassements = enveloppesEnDepassement(enveloppes, livrets);

  return (
    <Card accent={CARD_THEMES.indigo}>
      <div className="flex items-center justify-between">
        <CardLabel icon={Target}>Ventilation de l'épargne</CardLabel>
        <div className="flex items-center gap-2">
          <GhostButton onClick={() => setShowAdd((s) => !s)} icon={Plus}>Ajouter une enveloppe</GhostButton>
          <button onClick={() => setExpanded((e) => !e)} className="text-slate-500 hover:text-slate-300">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Total bar split visually */}
          {livretsTotal > 0 && enveloppes.length > 0 && (
            <div className="mt-3 mb-4">
              <div className="flex h-3 rounded-full overflow-hidden gap-px">
                {enveloppes.map((e, i) => {
                  const pct = (e.amount / livretsTotal) * 100;
                  const colors = ["bg-teal-400", "bg-violet-400", "bg-amber-400", "bg-rose-400", "bg-sky-400"];
                  return (
                    <div
                      key={e.id}
                      className={`${colors[e.colorIdx ?? i % colors.length]} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${e.label} : ${eur(e.amount)}`}
                    />
                  );
                })}
                {remaining > 0 && (
                  <div
                    className="bg-slate-700 transition-all"
                    style={{ width: `${(remaining / livretsTotal) * 100}%` }}
                    title={`Non alloué : ${eur(remaining)}`}
                  />
                )}
              </div>
              <div className="flex items-center justify-between text-micro text-slate-500 mt-1 font-data">
                <span>0 €</span>
                <span className="ghost-blur">{eur(livretsTotal)}</span>
              </div>
            </div>
          )}

          {/* Envelopes list */}
          {enveloppes.length === 0 ? (
            <EmptyState picto="epargne">Aucune enveloppe — segmente ton épargne par usage pour mieux piloter.</EmptyState>
          ) : (
            <div className="space-y-2 mt-2">
              {enveloppes.map((e, i) => {
                const colors = ENVELOPPE_COLORS[e.colorIdx ?? i % ENVELOPPE_COLORS.length];
                const pct = livretsTotal > 0 ? (e.amount / livretsTotal) * 100 : 0;
                return (
                  <div key={e.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${colors.bg}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                    <span className="flex-1 min-w-0 text-sm font-medium truncate">{e.label}</span>
                    {livrets.length > 0 && (
                      <select
                        aria-label={`Livret qui porte « ${e.label} »`}
                        value={e.livretId || ""}
                        onChange={(ev) => rattacher(e.id, ev.target.value)}
                        className="max-w-[8rem] bg-black/20 border border-white/10 rounded-lg px-1.5 py-1 text-micro focus:outline-none focus:border-white/30"
                      >
                        <option value="">Tous livrets</option>
                        {livrets.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    )}
                    <span className="text-micro opacity-60 font-data">{pctPlain(pct, 0)}</span>
                    <input
                      type="number"
                      value={e.amount}
                      onChange={(ev) => updateEnv(e.id, ev.target.value)}
                      className="w-24 bg-black/20 border border-white/10 rounded-lg px-2 py-1 text-sm font-data tabular-nums text-right ghost-blur focus:outline-none focus:border-white/30"
                    />
                    <span className="text-micro opacity-50">€</span>
                    <button onClick={() => removeEnv(e.id)} className="opacity-40 hover:opacity-80 ml-1">
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
              {/* Remainder */}
              {Math.abs(remaining) > 1 && (
                <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${remaining >= 0 ? "border-slate-700 text-slate-500" : "border-rose-400/30 text-rose-400"}`}>
                  <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                  <span className="flex-1">{remaining >= 0 ? "Non alloué" : "Dépassement"}</span>
                  <span className="font-data tabular-nums ghost-blur">
                    {remaining >= 0 ? eur(remaining) : `−${eur(Math.abs(remaining))}`}
                  </span>
                  {remaining < 0 && <AlertTriangle size={13} className="text-rose-400" />}
                </div>
              )}
            </div>
          )}

          {depassements.map((d) => (
            <p key={d.livret.id} className="mt-2 flex items-start gap-2 rounded-lg border border-rose-400/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Les enveloppes rattachées à {d.livret.name} totalisent <span className="ghost-blur">{eur(d.total)}</span>, pour{" "}
                <span className="ghost-blur">{eur(d.livret.balance)}</span> sur le livret :{" "}
                <span className="ghost-blur">{eur(d.depassement)}</span> réservés n'existent pas.
              </span>
            </p>
          ))}

          {/* Add envelope inline form */}
          {showAdd && (
            <div className="mt-3 flex items-end gap-2 p-3 rounded-xl border border-amber-400/20 bg-slate-950">
              <div className="flex-1">
                <label htmlFor={`${idsChamps}-nom-de-l`} className="text-micro text-slate-500 block mb-1">Nom de l'enveloppe</label>
                <input id={`${idsChamps}-nom-de-l`}
                  type="text"
                  placeholder="Matelas urgence, Voyage..."
                  value={draft.label}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-400/60"
                />
              </div>
              <div className="w-28">
                <label htmlFor={`${idsChamps}-montant`} className="text-micro text-slate-500 block mb-1">Montant (€)</label>
                <input id={`${idsChamps}-montant`}
                  type="number"
                  placeholder="3000"
                  value={draft.amount}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 font-data tabular-nums focus:outline-none focus:border-amber-400/60"
                />
              </div>
              {livrets.length > 0 && (
                <div className="w-36">
                  <label htmlFor={`${idsChamps}-livret`} className="text-micro text-slate-500 block mb-1">Sur quel livret</label>
                  <select
                    id={`${idsChamps}-livret`}
                    value={draft.livretId}
                    onChange={(e) => setDraft((d) => ({ ...d, livretId: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-400/60"
                  >
                    <option value="">Tous livrets</option>
                    {livrets.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button onClick={addEnv} className="text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-3 py-1.5">Ajouter</button>
              <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-300 py-1.5"><X size={14} /></button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ─── Livret row with smart progress bar ──────────────────────────────────────
const dateMois = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
const dateJour = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function LivretRow({ l, onRemove, onUpdateGoal, onUpdateBalance, onMouvement, onReglages, compteEnrichies = [] }) {
  const [reglages, setReglages] = useState(false);
  const aujourdhui = todayIso();
  const serie = useMemo(() => serieSoldeLivret(l, { aujourdhui }), [l, aujourdhui]);
  const projection = projectionVirement(l, { aujourdhui });
  const controle = l.virement ? verifierVirement(l, compteEnrichies) : null;
  const objectif = dateObjectif(l, { aujourdhui });
  const age = ageFiscal(l, { aujourdhui });
  const boostActif = l.boost?.fin && l.boost.fin >= aujourdhui;
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const [goalDraft, setGoalDraft] = useState(l.goal ?? "");
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState(l.balance);

  const hasLimit = !!l.limit;
  const hasGoal = !!l.goal;
  const barMax = l.goal ?? l.limit;
  const barColor = l.goal
    ? "bg-violet-400"
    : l.limit
    ? l.balance / l.limit > 0.9
      ? "bg-rose-400"
      : l.balance / l.limit > 0.6
      ? "bg-amber-400"
      : "bg-indigo-400"
    : "bg-indigo-400";

  const saveGoal = () => {
    const g = lireNombre(goalDraft);
    onUpdateGoal(l.id, g > 0 ? g : null);
    setShowGoalEdit(false);
  };

  const startEditBalance = () => {
    setBalanceDraft(l.balance);
    setEditingBalance(true);
  };
  const saveBalance = () => {
    const v = lireNombre(balanceDraft);
    if (Number.isFinite(v) && v >= 0) onUpdateBalance(l.id, v);
    setEditingBalance(false);
  };
  // ±50 : un vrai dépôt ou retrait daté du jour, plus une simple retouche du
  // solde — c'est ce qui construit l'historique du livret sans saisie.
  const nudge = (delta) =>
    onMouvement(l.id, { date: todayIso(), nature: delta > 0 ? "depot" : "retrait", montant: Math.abs(delta) });

  return (
    <>
    <tr className="group">
      <td data-label="Support" className="py-3 pr-3 text-slate-200 font-medium">
        {l.name}
        <span className="ml-2 text-micro uppercase tracking-wide text-indigo-300/70 border border-indigo-400/30 rounded-full px-1.5 py-0.5 align-middle">
          {l.envelope || guessEnvelope(l.name)}
        </span>
        {(l.fiscalise || l.boost || age) && (
          <span className="block mt-1 text-micro font-normal text-slate-500">
            {l.fiscalise && l.tauxBrut != null && <>brut {pctPlain(l.tauxBrut, 2)} avant flat tax</>}
            {l.fiscalise && l.tauxBrut != null && (l.boost || age) && " · "}
            {l.boost && (
              <span className={boostActif ? "text-amber-300/90" : "etat-critique"}>
                {boostActif ? `boosté jusqu'au ${dateJour(l.boost.fin)}` : `boost terminé le ${dateJour(l.boost.fin)}`}
              </span>
            )}
            {l.boost && age && " · "}
            {age && (
              <>
                {age.type === "AV" ? "assurance-vie" : "PEL"} de {age.ans} an{age.ans > 1 ? "s" : ""}
                {age.prochain && <> — {age.prochain.ans} ans le {dateJour(age.prochain.date)} : {age.prochain.texte}</>}
              </>
            )}
          </span>
        )}
      </td>
      <td data-label="Capital" className="py-3 pr-3">
        {editingBalance ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={balanceDraft}
              onChange={(e) => setBalanceDraft(e.target.value)}
              className="w-24 bg-slate-950 border border-indigo-400/50 rounded-lg px-1.5 py-1 text-xs font-data tabular-nums ghost-blur focus:outline-none focus:border-indigo-400"
              autoFocus
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => { if (e.key === "Enter") saveBalance(); if (e.key === "Escape") setEditingBalance(false); }}
            />
            <button onClick={saveBalance} className="text-indigo-300 hover:text-indigo-200"><Check size={13} /></button>
            <button onClick={() => setEditingBalance(false)} className="text-slate-500 hover:text-slate-300"><X size={13} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => nudge(-50)}
              className="revele-survol text-slate-500 hover:text-rose-400"
              title="−50 €"
            >
              <Minus size={12} />
            </button>
            <button
              onClick={startEditBalance}
              className="font-data tabular-nums text-slate-100 ghost-blur hover:text-indigo-300 flex items-center gap-1 transition-colors"
              title="Modifier le solde"
            >
              {eur(l.balance)}
              <Pencil size={10} className="revele-survol text-slate-500" aria-hidden="true" />
            </button>
            <button
              onClick={() => nudge(50)}
              className="revele-survol text-slate-500 hover:text-emerald-400"
              title="+50 €"
            >
              <Plus size={12} />
            </button>
          </div>
        )}
        {/* Douze mois de solde, reconstitués depuis les mouvements datés. */}
        {serieVarie(serie) && (
          <Sparkline valeurs={serie.map((p) => p.solde)} largeur={88} hauteur={20} className="mt-1 text-indigo-300/80" />
        )}
      </td>
      <td data-label="Taux net" className="py-3 pr-3 font-data tabular-nums text-amber-300/90">{pctPlain((l.rate * 100), 2)}</td>
      <td data-label="Intérêts / an" className="py-3 pr-3 font-data tabular-nums text-emerald-400 ghost-blur">{eur(l.balance * l.rate)}</td>
      <td data-label="Remplissage" className="py-3 pr-3 min-w-[160px]">
        {barMax ? (
          <SmartProgressBar
            value={l.balance}
            max={barMax}
            color={barColor}
          />
        ) : (
          <span className="text-micro text-slate-500">—</span>
        )}
        {projection && (
          <span className="block text-micro text-slate-400 mt-1">
            Virement de {eur(projection.montant)}/mois le {l.virement.jour}
            {projection.datePlafond && !projection.atteint && <> · plafond atteint en {dateMois(projection.datePlafond)}</>}
            {projection.atteint && <span className="etat-critique"> · plafond atteint, redirige le virement</span>}
          </span>
        )}
        {controle?.statut === "vu" && (
          <span className="block text-micro etat-ok mt-0.5">Repéré sur ton relevé le {dateJour(controle.date)}</span>
        )}
        {controle?.statut === "absent" && (
          <span className="block text-micro etat-attention mt-0.5">Pas repéré sur ton relevé {deMot(dateMois(`${controle.mois}-01`))}</span>
        )}
        {/* Goal / limit labels */}
        <div className="flex items-center gap-2 mt-1">
          {hasGoal && (
            <span className="text-micro text-violet-400/80 bg-violet-400/10 border border-violet-400/20 rounded-full px-2 py-0.5 ghost-blur">
              Objectif : {eur(l.goal, 0)}
            </span>
          )}
          {hasLimit && !hasGoal && (
            <span className="text-micro text-slate-500">
              Plafond légal : {eur(l.limit, 0)}
            </span>
          )}
        </div>
      </td>
      <td data-label="Objectif projet" className="py-3 pr-3">
        {objectif && !showGoalEdit && (
          <span className="block text-micro text-violet-300/90 mb-1">
            {objectif.atteint
              ? "Objectif atteint"
              : `Atteint vers ${dateMois(objectif.date)}, au rythme de ${eur(objectif.rythme)}/mois${objectif.source === "virement" ? " (virement)" : ""}`}
          </span>
        )}
        {showGoalEdit ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              placeholder="Ex: 10000"
              className="w-20 bg-slate-950 border border-violet-400/40 rounded-lg px-1.5 py-1 text-xs font-data focus:outline-none"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") saveGoal(); if (e.key === "Escape") setShowGoalEdit(false); }}
            />
            <button onClick={saveGoal} className="text-micro bg-violet-500 hover:bg-violet-400 text-white rounded px-1.5 py-0.5">OK</button>
            <button onClick={() => setShowGoalEdit(false)}><X size={11} className="text-slate-500" /></button>
          </div>
        ) : (
          <button
            onClick={() => { setGoalDraft(l.goal ?? ""); setShowGoalEdit(true); }}
            className="revele-survol text-micro text-slate-500 hover:text-violet-400 border border-transparent hover:border-violet-400/30 rounded-full px-2 py-0.5 transition-colors"
          >
            <Target size={10} className="inline mr-1" />
            {hasGoal ? "Modifier objectif" : "Fixer objectif"}
          </button>
        )}
      </td>
      <td className="py-3 text-right">
        <MenuActions
          className="flex justify-end"
          libelle={`Actions sur ${l.name}`}
          actions={[
            { libelle: "Réglages : taux, virement, ouverture", icone: Pencil, onClick: () => setReglages(true) },
            { libelle: "Supprimer", icone: Trash2, onClick: () => onRemove(l.id), danger: true },
          ]}
        />
      </td>
    </tr>
    {reglages && (
      <tr>
        <td colSpan={7} className="pb-3">
          <ReglagesLivret
            livret={l}
            onAnnuler={() => setReglages(false)}
            onEnregistrer={(v) => {
              onReglages(l.id, v);
              setReglages(false);
            }}
          />
        </td>
      </tr>
    )}
    </>
  );
}

// ─── Main Livrets component ───────────────────────────────────────────────────
export default function Livrets({
  livrets, setLivrets, matelasMois, livretsTotal, livretsAvgRate,
  enveloppes, setEnveloppes,
  // Lus sur le compte courant : matelas « mois les plus chers », argent qui
  // dort au-delà d'un mois de dépenses, et relevé pour vérifier les virements.
  matelasMoisPrudent = null, depensesMoisReference = null, matelasCompteCourant = 0, compteEnrichies = [],
}) {
  const { showToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [subTab, setSubTab] = useSousOnglet(["mes-livrets", "taux"], "mes-livrets");

  const addLivret = (v) =>
    setLivrets((l) => [
      ...l,
      { id: uid(), name: v.name, balance: lireNombre(v.balance) ?? 0, rate: lireNombre(v.rate) / 100, limit: lireNombre(v.limit) > 0 ? lireNombre(v.limit) : null, goal: null, envelope: v.envelope || "Livret" },
    ]);
  // Annulable : un livret porte un solde, un taux et un plafond ressaisis à la
  // main, et sa suppression se propage à tous les appareils.
  const removeLivret = (id) => {
    const precedent = livrets;
    const cible = livrets.find((l) => l.id === id);
    setLivrets((l) => l.filter((x) => x.id !== id));
    showToast({
      message: `${cible?.name || "Support"} supprimé.`,
      onUndo: () => setLivrets(precedent),
    });
  };
  const updateGoal = (id, goal) => setLivrets((l) => l.map((x) => x.id === id ? { ...x, goal } : x));
  /*
   * Corriger le solde au crayon enregistre un AJUSTEMENT daté : le solde
   * change comme avant, mais l'écart est gardé, et le passé reste
   * reconstituable. Ce n'est ni un dépôt ni un retrait — on recale sur le
   * relevé de la banque.
   */
  const updateBalance = (id, balance) =>
    setLivrets((l) =>
      l.map((x) =>
        x.id === id
          ? ajouterMouvement(x, { id: uid(), date: todayIso(), nature: "ajustement", montant: balance - (Number(x.balance) || 0) })
          : x
      )
    );
  const enregistrerMouvement = (id, mouvement) =>
    setLivrets((l) => l.map((x) => (x.id === id ? ajouterMouvement(x, { id: uid(), ...mouvement }) : x)));
  // Réglages d'une ligne (taux, boost, virement, ouverture) : fusionnés tels
  // quels, un réglage vidé valant `null`.
  const reglerLivret = (id, reglages) => setLivrets((l) => l.map((x) => (x.id === id ? { ...x, ...reglages } : x)));
  const supprimerMouvement = (id, idMouvement) =>
    setLivrets((l) => l.map((x) => (x.id === id ? retirerMouvement(x, idMouvement) : x)));

  const totalInterets = livrets.reduce((s, l) => s + l.balance * l.rate, 0);
  const inflation = inflationOfficielle();
  const reel = rendementReel({ tauxMoyenPct: livretsAvgRate, inflationPct: inflation.tauxPct, total: livretsTotal });
  const matelasPrudent = manqueMatelas({ depensesMoisReference, disponible: livretsTotal + matelasCompteCourant });

  return (
    <div className="relative space-y-6">
      <PageGlow color="indigo" />
      <div className="relative">
        <h1 className="font-display text-2xl text-slate-50">
          Livrets &amp; <span className="text-indigo-400">Épargne sécurisée</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">Capital garanti : livrets réglementés et fonds en euros. Le compte courant a son propre onglet.</p>
      </div>

      {/* Sous-onglets — même barre glissante que les autres pages, et le
          sous-onglet ouvert vit dans l'URL (voir useSousOnglet). */}
      <OngletsGlissants
        className="teinte-indigo"
        ariaLabel="Sections de Livrets & Épargne"
        actif={subTab}
        onChange={setSubTab}
        onglets={[
          { id: "mes-livrets", libelle: "Mes livrets", icone: PiggyBank },
          { id: "taux", libelle: "Taux", icone: Percent },
        ]}
      />

      {subTab === "taux" && <RatesHub livrets={livrets} />}

      {subTab === "mes-livrets" && (
      <>
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card accent={CARD_THEMES.indigo} className="flex items-center gap-4">
          <div className="rounded-full bg-indigo-400/10 text-indigo-300 p-3 shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Matelas de sécurité</div>
            {/* `matelasMois` vaut null tant que les dépenses mensuelles ne sont
                pas renseignées : le matelas est inconnu, pas nul. */}
            {matelasMois == null ? (
              <>
                <div className="font-display text-lg text-slate-500">—</div>
                <div className="text-micro text-slate-500">
                  Renseigne tes dépenses mensuelles dans le Dashboard
                </div>
              </>
            ) : (
              <>
                <div className="font-display text-lg text-slate-50">{nombre(matelasMois, 1)} mois</div>
                <div className="text-micro text-slate-500">de dépenses couvertes</div>
                <MatelasTrendBadge matelasMois={matelasMois} />
                {/* Le même matelas compté sur les mois les plus chers : un
                    budget irrégulier se protège avec ceux-là, pas avec un
                    mois moyen. */}
                {matelasMoisPrudent != null && matelasPrudent && (
                  <div className="text-micro text-slate-400 mt-1">
                    {nombre(matelasMoisPrudent, 1)} mois de tes mois les plus chers
                    {matelasPrudent.manque > 0 ? (
                      <span className="etat-attention ghost-blur"> · il manque {eur(matelasPrudent.manque)} pour 3 mois</span>
                    ) : (
                      <span className="etat-ok"> · 3 mois couverts</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
        <Card accent={CARD_THEMES.indigo}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total épargne sécurisée</div>
          <div className="font-display text-xl text-slate-50 ghost-blur">{eur(livretsTotal)}</div>
          <div className="text-xs text-indigo-300/80 mt-0.5">Taux moyen {pctPlain(livretsAvgRate, 2)}</div>
          {livretsTotal > 0 && (
            <div className="text-micro text-slate-500 mt-1">
              Après inflation ({pctPlain(inflation.tauxPct, 1)}, {inflation.source}) :{" "}
              <span className={reel.reelPct < 0 ? "etat-attention" : "etat-ok"}>
                {reel.reelPct > 0 ? "+" : ""}
                {pctPlain(reel.reelPct, 2)}
              </span>
              {", soit "}
              <span className="ghost-blur">
                {reel.euros >= 0 ? "+" : "−"}
                {eur(Math.abs(reel.euros))}
              </span>{" "}
              de pouvoir d'achat par an
            </div>
          )}
        </Card>
        <Card accent={CARD_THEMES.indigo}>
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Intérêts estimés / an</div>
          <div className="font-display text-xl text-emerald-400 ghost-blur">{eur(totalInterets)}</div>
          <div className="text-micro text-slate-500 mt-0.5 ghost-blur">soit {eur(totalInterets / 12)} / mois</div>
          {/* Au taux du jour, le total ignore les changements de taux et les
              dates de valeur. L'année en cours, calculée comme la banque, se
              lit juste en dessous. */}
          <div className="text-micro text-slate-500 mt-0.5 ghost-blur">
            {todayIso().slice(0, 4)}, à la quinzaine :{" "}
            {eur(
              livrets.reduce(
                (s, l) => s + interetsQuinzaines(l, Number(todayIso().slice(0, 4)), { aujourdhui: todayIso() }).total,
                0
              )
            )}
          </div>
        </Card>
      </div>

      {/* Compte courant */}

      {/* Alerte de saturation des plafonds */}
      <SaturationAlert livrets={livrets} />

      {/* De janvier à mars : les intérêts de l'année écoulée à enregistrer. */}
      <InteretsFinAnnee livrets={livrets} onMouvement={enregistrerMouvement} />

      {/* Livrets table — la carte des mouvements suit juste après. */}
      <Card accent={CARD_THEMES.indigo}>
        <div className="flex items-center justify-between mb-3">
          <CardLabel icon={PiggyBank}>Comptes &amp; supports</CardLabel>
          <GhostButton theme="indigo" onClick={() => setShowAdd((s) => !s)}>Ajouter un livret</GhostButton>
        </div>

        {livrets.length === 0 ? (
          <EtatVide
                picto="epargne"
                titre="Aucun support d'épargne"
                action={<GhostButton onClick={() => setShowAdd(true)} theme="indigo">Ajouter un livret</GhostButton>}
              >
                Livret A, LDDS, assurance-vie… Patrium suit les plafonds, calcule le taux moyen
                pondéré de ton épargne et te dit où placer ton prochain versement.
              </EtatVide>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-cards table-donnees">
              <thead>
                <tr className="text-left text-micro uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  <th className="py-2 pr-3">Support</th>
                  <th className="py-2 pr-3">Capital</th>
                  <th className="py-2 pr-3">Taux net</th>
                  <th className="py-2 pr-3">Intérêts / an</th>
                  <th className="py-2 pr-3 min-w-[160px]">Remplissage</th>
                  <th className="py-2 pr-3 min-w-[140px]">Objectif projet</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {livrets.map((l) => (
                  <LivretRow
                    key={l.id}
                    l={l}
                    onRemove={removeLivret}
                    onUpdateGoal={updateGoal}
                    onUpdateBalance={updateBalance}
                    onMouvement={enregistrerMouvement}
                    onReglages={reglerLivret}
                    compteEnrichies={compteEnrichies}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AddPanel
          open={showAdd}
          onClose={() => setShowAdd(false)}
          onSubmit={addLivret}
          fields={[
            { key: "name", label: "Nom du support", type: "text", placeholder: "LDDS, PEL...", required: true },
            { key: "balance", label: "Capital (€)", type: "number", step: "100", required: true },
            { key: "rate", label: "Taux annuel net (%)", type: "number", step: "0.1", required: true },
            { key: "limit", label: "Plafond légal (€, optionnel)", type: "number", step: "100", default: 0 },
            { key: "envelope", label: "Enveloppe fiscale", type: "select", options: ["Livret", "AV", "PER", "PEA", "CTO"], default: "Livret" },
          ]}
        />
      </Card>

      {/* Mouvements datés et intérêts à la quinzaine. */}
      {livrets.length > 0 && (
        <MouvementsLivrets
          livrets={livrets}
          onMouvement={enregistrerMouvement}
          onRetirerMouvement={supprimerMouvement}
        />
      )}

      {/* Simulateur : où placer mon prochain versement */}
      <NextDepositAdvisor livrets={livrets} />

      {/* Livret A, LDDS, LEP : détenus ou non, droit au LEP, prochaine révision. */}
      <LivretsReglementes livrets={livrets} argentQuiDort={matelasCompteCourant} />

      {/* Ventilation des enveloppes */}
      <Ventilation livretsTotal={livretsTotal} livrets={livrets} enveloppes={enveloppes ?? []} setEnveloppes={setEnveloppes} />
      </>
      )}
    </div>
  );
}
