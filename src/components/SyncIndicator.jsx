import React from "react";
import { Cloud, CloudOff, RefreshCw, AlertTriangle, Check } from "lucide-react";
import { useSyncStatus, useRetrySync } from "../lib/storage";

/**
 * Petit témoin d'état de la synchronisation multi-appareils.
 *
 * Sans lui, un échec d'écriture cloud n'existait que dans la console : rien
 * ne distinguait « mes données sont bien sur mon téléphone et mon PC » de
 * « ça fait 20 minutes que plus rien ne part ». Pour une app qui sert de
 * référentiel patrimonial, c'est la différence entre une sauvegarde et une
 * illusion de sauvegarde.
 */
export default function SyncIndicator() {
  const { status, pending, failed, lastSyncedAt, lastError } = useSyncStatus();
  const retry = useRetrySync();

  if (status === "off") return null;

  const relative = lastSyncedAt ? formatRelative(lastSyncedAt) : null;

  const VIEWS = {
    idle: {
      Icon: lastSyncedAt ? Check : Cloud,
      tone: "text-slate-500 hover:text-slate-300",
      label: lastSyncedAt ? `Synchronisé ${relative}` : "Synchronisation active",
      spin: false,
    },
    syncing: {
      Icon: RefreshCw,
      tone: "text-amber-300",
      label: `Synchronisation en cours (${pending})`,
      spin: true,
    },
    offline: {
      Icon: CloudOff,
      tone: "text-slate-400",
      label: `Hors ligne — ${failed} modification(s) en attente. Tout est gardé sur cet appareil et repartira au retour du réseau.`,
      spin: false,
    },
    error: {
      Icon: AlertTriangle,
      tone: "text-rose-300 hover:text-rose-200",
      label: `Échec de synchronisation sur ${failed} élément(s)${lastError ? ` : ${lastError}` : ""}. Cliquer pour réessayer.`,
      spin: false,
    },
  };

  const view = VIEWS[status] || VIEWS.idle;
  const actionable = status === "error";

  return (
    <button
      type="button"
      onClick={actionable ? retry : undefined}
      aria-label={view.label}
      title={view.label}
      // L'état est annoncé aux lecteurs d'écran quand il change, mais sans
      // interrompre : "polite" attend une pause dans la lecture en cours.
      aria-live="polite"
      className={`flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 ${view.tone} ${
        actionable ? "hover:border-rose-500/30 cursor-pointer" : "cursor-default"
      }`}
    >
      <view.Icon size={14} className={view.spin ? "animate-spin" : ""} aria-hidden="true" />
      {status === "error" && <span className="hidden sm:inline">Non synchronisé</span>}
    </button>
  );
}

function formatRelative(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `le ${new Date(iso).toLocaleDateString("fr-FR")}`;
}
