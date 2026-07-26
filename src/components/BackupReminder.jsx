import React, { useState } from "react";
import { Download, X, ShieldAlert } from "lucide-react";
import { getLastBackupAt } from "../lib/storage";

const REMIND_AFTER_DAYS = 30;
const SNOOZE_KEY = "patrimoine:__backupSnoozedUntil";

function daysSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function isSnoozed() {
  try {
    const until = localStorage.getItem(SNOOZE_KEY);
    return until ? new Date(until).getTime() > Date.now() : false;
  } catch {
    return false;
  }
}

function snooze(days) {
  try {
    localStorage.setItem(SNOOZE_KEY, new Date(Date.now() + days * 86_400_000).toISOString());
  } catch {
    /* stockage indisponible */
  }
}

/**
 * Rappel discret d'export de sauvegarde.
 *
 * Le stockage principal reste le localStorage du navigateur : il peut être
 * vidé par un nettoyage de cache, une navigation privée, un changement
 * d'appareil ou une réinstallation — sans avertissement. La synchronisation
 * Supabase couvre le multi-appareils, pas la suppression accidentelle (elle
 * se propage). Un export JSON périodique reste la seule vraie sauvegarde.
 */
export default function BackupReminder({ onExport }) {
  const [dismissed, setDismissed] = useState(false);
  const lastBackup = getLastBackupAt();
  const elapsed = daysSince(lastBackup);

  if (dismissed || isSnoozed() || elapsed < REMIND_AFTER_DAYS) return null;

  const close = () => {
    snooze(7);
    setDismissed(true);
  };

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-5 text-sm"
    >
      <ShieldAlert size={16} className="text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-slate-200">
          {lastBackup
            ? `Dernière sauvegarde exportée il y a ${Math.floor(elapsed)} jours.`
            : "Tu n'as encore jamais exporté de sauvegarde."}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Un vidage du cache du navigateur effacerait les données de cet appareil. L'export JSON est ta
          seule copie hors ligne.
        </p>
        <button
          onClick={() => {
            onExport();
            setDismissed(true);
          }}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
        >
          <Download size={13} aria-hidden="true" /> Exporter maintenant
        </button>
      </div>
      <button
        onClick={close}
        aria-label="Masquer ce rappel pendant une semaine"
        className="text-slate-600 hover:text-slate-300 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 rounded"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
