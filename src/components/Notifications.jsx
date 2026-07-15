import React, { useMemo, useState, useRef, useEffect } from "react";
import { Bell, BellRing, Plus, Trash2, Check, X } from "lucide-react";
import { uid } from "../lib/finance";

const todayStr = () => new Date().toISOString().slice(0, 10);
const currentYearMonth = () => todayStr().slice(0, 7);

/** Un rappel est dû si : mensuel et le jour du mois est atteint sans avoir
 * déjà été acquitté ce mois-ci, ou ponctuel et la date est passée sans avoir
 * été marqué comme fait. */
function isDue(r) {
  if (r.type === "monthly") {
    return new Date().getDate() >= (r.day || 1) && r.lastAck !== currentYearMonth();
  }
  return r.date && r.date <= todayStr() && !r.done;
}

export default function Notifications({ reminders = [], setReminders }) {
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ label: "", type: "monthly", day: 5, date: "" });
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const ref = useRef(null);
  // Évite de renvoyer la même notification système plusieurs fois pour le
  // même rappel pendant la même session (utile car le check tourne en boucle
  // tant que l'onglet reste ouvert).
  const notifiedRef = useRef(new Set());

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const dueList = useMemo(() => reminders.filter(isDue), [reminders]);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPermission(p);
  };

  // Envoie une vraie notification système (via l'API Notification du
  // navigateur) pour chaque rappel dû, une seule fois par rappel/session.
  // Fonctionne tant que l'onglet ou l'app installée est ouvert(e) — voir
  // l'explication "notifications push" pour les limites de cette approche.
  useEffect(() => {
    if (permission !== "granted") return;
    dueList.forEach((r) => {
      const key = `${r.id}-${r.type === "monthly" ? currentYearMonth() : "once"}`;
      if (notifiedRef.current.has(key)) return;
      notifiedRef.current.add(key);
      try {
        new Notification("Patrium — rappel", {
          body: r.label,
          tag: key,
        });
      } catch {
        // Certains navigateurs mobiles exigent de passer par un service
        // worker (registration.showNotification) plutôt que `new Notification`.
        navigator.serviceWorker?.getRegistration?.().then((reg) => {
          reg?.showNotification("Patrium — rappel", { body: r.label, tag: key });
        });
      }
    });
  }, [dueList, permission]);

  const addReminder = () => {
    if (!draft.label.trim()) return;
    setReminders((r) => [
      ...r,
      {
        id: uid(),
        label: draft.label.trim(),
        type: draft.type,
        day: draft.type === "monthly" ? parseInt(draft.day) || 1 : null,
        date: draft.type === "date" ? draft.date : null,
        lastAck: null,
        done: false,
      },
    ]);
    setDraft({ label: "", type: "monthly", day: 5, date: "" });
    setShowAdd(false);
  };

  const acknowledge = (r) =>
    setReminders((list) =>
      list.map((x) => (x.id === r.id ? (x.type === "monthly" ? { ...x, lastAck: currentYearMonth() } : { ...x, done: true }) : x))
    );
  const removeReminder = (id) => setReminders((list) => list.filter((x) => x.id !== id));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative text-slate-400 hover:text-slate-100 p-1.5 rounded-lg border border-transparent hover:border-slate-800"
        title="Notifications"
      >
        {permission === "granted" ? <BellRing size={16} /> : <Bell size={16} />}
        {dueList.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {dueList.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-h-[26rem] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Rappels</span>
            <button onClick={() => setShowAdd((s) => !s)} className="flex items-center gap-1 text-[11px] text-amber-300/80 hover:text-amber-300">
              <Plus size={12} /> Ajouter
            </button>
          </div>

          {permission !== "granted" && permission !== "unsupported" && (
            <button
              onClick={requestPermission}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-amber-200 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 rounded-lg px-2.5 py-1.5 mb-3"
            >
              <BellRing size={12} />
              {permission === "denied"
                ? "Notifications bloquées — autorise-les dans les réglages du navigateur"
                : "Activer les notifications sur cet appareil"}
            </button>
          )}

          {showAdd && (
            <div className="mb-3 p-2.5 rounded-lg border border-slate-800 bg-slate-900 space-y-2">
              <input
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="Ex: Versement PEA"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-400/60"
              />
              <div className="flex items-center gap-2">
                <select
                  value={draft.type}
                  onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-400/60"
                >
                  <option value="monthly">Tous les mois</option>
                  <option value="date">Date précise</option>
                </select>
                {draft.type === "monthly" ? (
                  <input
                    type="number" min={1} max={28} value={draft.day}
                    onChange={(e) => setDraft((d) => ({ ...d, day: e.target.value }))}
                    className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 font-data focus:outline-none focus:border-amber-400/60"
                  />
                ) : (
                  <input
                    type="date" value={draft.date}
                    onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 font-data focus:outline-none focus:border-amber-400/60"
                  />
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAdd(false)} className="text-[11px] text-slate-500 hover:text-slate-300">Annuler</button>
                <button onClick={addReminder} className="text-[11px] font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-3 py-1">
                  Enregistrer
                </button>
              </div>
            </div>
          )}

          {reminders.length === 0 ? (
            <p className="text-[11px] text-slate-600">Aucun rappel configuré.</p>
          ) : (
            <div className="space-y-1.5">
              {reminders.map((r) => {
                const due = isDue(r);
                return (
                  <div
                    key={r.id}
                    className={`flex items-center gap-2 text-xs rounded-lg border px-2.5 py-1.5 ${
                      due ? "border-amber-400/30 bg-amber-400/5" : "border-slate-800 bg-slate-900/50"
                    }`}
                  >
                    <span className="flex-1">
                      <span className={due ? "text-amber-200" : "text-slate-400"}>{r.label}</span>
                      <span className="block text-[10px] text-slate-600">
                        {r.type === "monthly" ? `Le ${r.day} de chaque mois` : r.date}
                      </span>
                    </span>
                    {due && (
                      <button onClick={() => acknowledge(r)} title="Marquer comme fait" className="text-emerald-400 hover:text-emerald-300">
                        <Check size={13} />
                      </button>
                    )}
                    <button onClick={() => removeReminder(r.id)} title="Supprimer" className="text-slate-600 hover:text-rose-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
