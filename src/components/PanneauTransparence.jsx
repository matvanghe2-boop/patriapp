import { useMemo, useState } from "react";
import { Shield, ShieldAlert, X, Copy, Check } from "lucide-react";
import { auditerContexte, REGLES_ANONYMISATION } from "../../shared/anonymiser";
import Modal from "./Modal";

/**
 * Panneau « Voir ce qui est envoyé » (§5 de HORIZON_SPEC.md).
 *
 * Affiche le contexte anonymisé **exactement tel qu'il partira** quand
 * l'assistant sera branché (jalon 4), accompagné du verdict de l'audit
 * automatique et de la liste des traitements appliqués.
 *
 * C'est ce panneau qui distingue une anonymisation vérifiable d'une simple
 * déclaration d'intention : il ne décrit pas ce que le code est censé faire,
 * il montre l'objet réellement produit. Même esprit que le « vérifie toi-même »
 * de YouTube Wrapped, où l'on invite à ouvrir l'onglet Réseau.
 *
 * Le JSON affiché est celui passé en prop — jamais une reconstruction : une
 * seconde sérialisation pourrait diverger de l'originale sans qu'on le voie.
 */
export default function PanneauTransparence({ contexte, montantsReels = false, onClose }) {
  const [copie, setCopie] = useState(false);

  const json = useMemo(() => JSON.stringify(contexte, null, 2), [contexte]);
  // En mode B, la présence de montants est voulue : l'audit ne doit pas la
  // signaler comme une fuite. Il continue en revanche de traquer noms,
  // tickers, ISIN, e-mails et identifiants, qui restent interdits.
  const audit = useMemo(
    () => auditerContexte(contexte, { autoriserMontants: montantsReels }),
    [contexte, montantsReels]
  );

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé, permission refusée) :
      // le JSON reste lisible et sélectionnable à l'écran, rien n'est perdu.
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      label="Ce qui est envoyé à l'assistant"
      overlayClassName="bg-slate-950/80"
      panelClassName="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display text-xl text-slate-50">Ce qui est envoyé</h2>
            <p className="text-sm text-slate-500 mt-1">
              {montantsReels
                ? "Le contenu exact transmis à l'assistant. Montants réels activés — aucun nom, aucun ticker, aucun identifiant malgré tout."
                : "Le contenu exact transmis à l'assistant. Aucun montant, aucun nom, aucun identifiant."}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-slate-500 hover:text-slate-200 transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Verdict de l'audit automatique */}
        {audit.sain ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/20 px-4 py-3 mb-4">
            <Shield size={16} className="text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-200/90">
              {montantsReels
                ? "Audit automatique : aucun ticker, ISIN, e-mail ni identifiant détecté. Les montants sont transmis, comme tu l'as autorisé."
                : "Audit automatique : aucun montant, ticker, ISIN, e-mail ni identifiant détecté."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-rose-500/50 bg-rose-950/20 px-4 py-3 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <ShieldAlert size={16} className="text-rose-400 shrink-0" />
              <p className="text-xs text-rose-200 font-medium">
                {audit.alertes.length} anomalie{audit.alertes.length > 1 ? "s" : ""} détectée
                {audit.alertes.length > 1 ? "s" : ""} — ne pas envoyer
              </p>
            </div>
            <ul className="space-y-1 pl-7">
              {audit.alertes.map((a, i) => (
                <li key={`${a.chemin}-${i}`} className="text-xs text-rose-300/90">
                  <code className="text-rose-200">{a.chemin}</code> — {a.motif}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Charge utile exacte */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wider text-slate-500">Charge utile</h3>
          <button
            onClick={copier}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            {copie ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            {copie ? "Copié" : "Copier"}
          </button>
        </div>
        <pre className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300 overflow-x-auto mb-6">
          {json}
        </pre>

        {/* Traitements appliqués */}
        <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Traitements appliqués</h3>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-xs table-cards table-donnees">
            <thead>
              <tr className="bg-slate-950/60 text-slate-500">
                <th className="text-left font-medium px-3 py-2">Donnée Patrium</th>
                <th className="text-left font-medium px-3 py-2">Traitement</th>
              </tr>
            </thead>
            <tbody>
              {REGLES_ANONYMISATION.map((r) => (
                <tr key={r.donnee} className="border-t border-slate-800">
                  <td data-label="Donnée" className="px-3 py-2 text-slate-400">{r.donnee}</td>
                  <td data-label="Traitement" className="px-3 py-2 text-slate-300">{r.traitement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-600 mt-4">
          L&apos;assistant conversationnel n&apos;est pas encore branché : ce panneau montre dès
          maintenant ce qui partira le jour où il le sera.
        </p>
      </div>
    </Modal>
  );
}
