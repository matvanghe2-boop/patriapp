import { useState } from "react";
import { Wallet, AlertCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { CardLabel } from "./ui";
import { eur } from "../lib/finance";
import { useMaintenant, joursDepuis } from "../lib/useMaintenant";
import Montant from "./Montant";

/** Date courte à la française (« 04 févr. 2026 »), partagée par le Dashboard. */
export function formatDateFr(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Profil mensuel : lecture sur les relevés et fraîcheur de la saisie.
 * Sortis de Dashboard.jsx.
 */

// ─── Profil mensuel lu sur les relevés ───────────────────────────────────────
/**
 * Dès qu'un relevé de compte courant est importé, revenus et dépenses ne se
 * saisissent plus : ce sont les moyennes réelles des derniers mois, hors
 * mouvements entre ses comptes et opérations mises à part. Le profil saisi
 * reste stocké et reprend la main si les relevés sont retirés.
 */
export function ProfilReel({ profile }) {
  const mois = (profile.periode || []).map((m) => {
    const [a, n] = m.split("-").map(Number);
    return new Date(a, n - 1, 1).toLocaleDateString("fr-FR", { month: "long" });
  });
  const periode =
    mois.length > 1 ? `moyenne de ${mois[0]} à ${mois[mois.length - 1]}` : mois.length === 1 ? `mois de ${mois[0]}` : "";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <CardLabel icon={Wallet}>Profil mensuel</CardLabel>
        <div className="text-sm text-slate-400">
          Revenus <Montant valeur={profile.monthly_income} decimales={0} className="text-slate-100" /> / mois
        </div>
        <div className="text-sm text-slate-400">
          Dépenses <Montant valeur={profile.monthly_expenses} decimales={0} className="text-slate-100" /> / mois
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Calculé sur tes relevés de compte courant{periode ? `, ${periode}` : ""} — hors virements entre tes comptes et
        opérations ponctuelles mises à part.{" "}
        <a href="#/compte" className="text-emerald-300 hover:underline">
          Voir le compte courant
        </a>
      </p>
    </div>
  );
}

// ─── Fraîcheur du profil mensuel ──────────────────────────────────────────────
const PROFILE_STALE_DAYS = 120;

export function ProfileFreshness({ updatedAt, history = [] }) {
  const [showHistory, setShowHistory] = useState(false);
  // Instant figé pour ce rendu (voir useMaintenant) : `Date.now()` appelé ici
  // rendait le composant impur et laissait le badge périmé indéfiniment.
  const maintenant = useMaintenant();

  if (!updatedAt) {
    return (
      <p className="text-micro text-slate-500 mt-3">
        Renseigne ton revenu et tes dépenses : le taux d'épargne et le matelas de sécurité en
        dépendent.
      </p>
    );
  }

  const days = joursDepuis(updatedAt, maintenant);
  const stale = days >= PROFILE_STALE_DAYS;
  const previous = history.slice(0, -1).slice(-6).reverse();

  return (
    <div className="mt-3 pt-3 border-t border-slate-800">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className={`flex items-center gap-1.5 text-micro ${stale ? "text-amber-300" : "text-slate-500"}`}>
          {stale ? <AlertCircle size={11} aria-hidden="true" /> : <Clock size={11} aria-hidden="true" />}
          {days === 0
            ? "Mis à jour aujourd'hui"
            : stale
              ? `Inchangé depuis ${days} jours — vérifie que c'est toujours d'actualité`
              : `Mis à jour il y a ${days} jour${days > 1 ? "s" : ""}`}
        </span>
        {previous.length > 0 && (
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="flex items-center gap-1 text-micro text-emerald-300/70 hover:text-emerald-300"
          >
            {showHistory ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
            Historique
          </button>
        )}
      </div>

      {showHistory && previous.length > 0 && (
        <ul className="mt-2 space-y-1">
          {previous.map((h) => (
            <li key={h.date} className="flex items-center justify-between text-micro text-slate-500">
              <span className="font-data tabular-nums">{formatDateFr(h.date)}</span>
              <span className="font-data tabular-nums ghost-blur">
                {eur(h.monthly_income)} − {eur(h.monthly_expenses)} ={" "}
                <span className="text-slate-300">{eur(h.monthly_income - h.monthly_expenses)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
