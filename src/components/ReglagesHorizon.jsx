import { useState } from "react";
import { Shield, ShieldOff, X, AlertTriangle } from "lucide-react";

/**
 * Réglages de confidentialité de l'assistant (§5, jalon 7 de HORIZON_SPEC.md).
 *
 * Un seul réglage, et il est important : le passage du mode A (anonymisation en
 * base 100) au mode B (montants réels).
 *
 * Trois garde-fous, parce qu'un réglage de ce type ne doit jamais s'activer par
 * inadvertance :
 *  1. désactivé par défaut ;
 *  2. écran de consentement explicite avant activation, qui dit ce qui change
 *     ET ce qui ne change pas ;
 *  3. bandeau permanent tant qu'il est actif — voir `BandeauModeReel`.
 *
 * Ce que le mode B ne change pas mérite d'être dit aussi clairement que ce
 * qu'il change : noms, tickers, ISIN et identifiants restent écartés dans les
 * deux modes. Seule l'unité des montants diffère.
 */
export default function ReglagesHorizon({ reglages, onChange, onClose }) {
  const [confirmation, setConfirmation] = useState(false);
  const actif = Boolean(reglages?.montantsReels);

  const basculer = () => {
    if (actif) {
      onChange({ ...reglages, montantsReels: false });
      return;
    }
    setConfirmation(true);
  };

  const confirmer = () => {
    onChange({ ...reglages, montantsReels: true });
    setConfirmation(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Réglages de confidentialité de l'assistant"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-display text-xl text-slate-50">Confidentialité de l&apos;assistant</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-slate-500 hover:text-slate-200">
            <X size={20} />
          </button>
        </div>

        {confirmation ? (
          <div>
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 mb-4">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-100/90 space-y-2">
                <p className="font-medium">Activer l&apos;envoi des montants réels ?</p>
                <p>
                  Tes soldes, ton épargne mensuelle et la valeur de ton patrimoine seront transmis
                  en euros au fournisseur du modèle, au lieu d&apos;être normalisés en base 100.
                </p>
                <p>
                  Ce qui ne change pas : aucun nom de compte, aucun ticker, aucun ISIN, aucune
                  adresse e-mail ni identifiant n&apos;est transmis — dans ce mode comme dans
                  l&apos;autre.
                </p>
                <p>Réversible à tout moment. Le panneau « Voir ce qui est envoyé » reste la référence.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmation(false)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-slate-500"
              >
                Annuler
              </button>
              <button
                onClick={confirmer}
                className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/60 text-amber-200 hover:bg-amber-950/40"
              >
                J&apos;ai compris, activer
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {actif ? (
                    <ShieldOff size={18} className="text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <Shield size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm text-slate-200">
                      {actif ? "Montants réels" : "Anonymisation en base 100"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {actif
                        ? "Tes montants sont transmis en euros. Réponses plus précises, confidentialité réduite."
                        : "Ton patrimoine vaut 100, tout le reste est un ratio. Aucun montant ne sort."}
                    </p>
                  </div>
                </div>
                <button
                  onClick={basculer}
                  role="switch"
                  aria-checked={actif}
                  aria-label="Envoyer les montants réels"
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    actif ? "bg-amber-500/70" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-slate-100 transition-all ${
                      actif ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Ce réglage ne concerne que l&apos;assistant conversationnel. Les formulaires et le
              moteur de calcul tournent entièrement dans ton navigateur et n&apos;envoient rien,
              quel que soit le mode.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Bandeau permanent tant que le mode B est actif. */
export function BandeauModeReel({ onOuvrirReglages }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-2">
      <div className="flex items-center gap-2 text-xs text-amber-200/90">
        <ShieldOff size={14} className="shrink-0" />
        Mode montants réels actif : tes montants sont transmis en euros au fournisseur du modèle.
      </div>
      <button
        onClick={onOuvrirReglages}
        className="text-xs text-amber-300 underline underline-offset-2 hover:text-amber-100 shrink-0"
      >
        Modifier
      </button>
    </div>
  );
}
