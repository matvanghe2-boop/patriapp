import { useId, useState } from "react";
import { LockKeyhole, ShieldCheck, ShieldAlert } from "lucide-react";
import Modal from "./Modal";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../lib/ToastContext";
import { useConfirm } from "../lib/ConfirmContext";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import {
  useEtatChiffrement, activerChiffrement, deverrouillerChiffrement, desactiverChiffrement,
} from "../lib/storage";

/**
 * Réglage du chiffrement de bout en bout.
 *
 * Trois états : inactif (on peut l'activer), actif sur cet appareil (on peut
 * le désactiver), verrouillé (actif ailleurs, la phrase est demandée). La
 * phrase n'est jamais conservée, ni envoyée : seule la clé qui en dérive
 * reste sur l'appareil.
 */

const LONGUEUR_MIN = 10;

export default function ReglagesChiffrement({ ouvert, onFermer }) {
  const { user } = useAuth();
  const etat = useEtatChiffrement();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const ids = useId();
  const [phrase, setPhrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [noteeAilleurs, setNoteeAilleurs] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  const fermer = () => {
    setPhrase("");
    setConfirmation("");
    setNoteeAilleurs(false);
    setErreur(null);
    onFermer();
  };

  const executer = async (action) => {
    setEnCours(true);
    setErreur(null);
    try {
      await action();
    } catch (e) {
      setErreur(e?.message || "L'opération n'a pas abouti.");
    } finally {
      setEnCours(false);
    }
  };

  const activer = (e) => {
    e.preventDefault();
    if (phrase.length < LONGUEUR_MIN) return setErreur(`Choisis une phrase d'au moins ${LONGUEUR_MIN} caractères.`);
    if (phrase !== confirmation) return setErreur("Les deux saisies ne sont pas identiques.");
    if (!noteeAilleurs) return setErreur("Note d'abord ta phrase en lieu sûr : sans elle, rien ne se récupère.");
    return executer(async () => {
      const echecs = await activerChiffrement(phrase);
      showToast({
        message: echecs
          ? `Chiffrement activé, mais ${echecs} donnée(s) n'ont pas pu être réécrites : elles le seront à la prochaine modification.`
          : "Chiffrement activé : tes données synchronisées sont désormais chiffrées.",
      });
      fermer();
    });
  };

  const deverrouiller = (e) => {
    e.preventDefault();
    return executer(async () => {
      const ok = await deverrouillerChiffrement(phrase);
      if (!ok) throw new Error("Phrase secrète incorrecte.");
      showToast({ message: "Appareil déverrouillé : tes données synchronisées sont de nouveau lisibles ici." });
      fermer();
    });
  };

  const desactiver = async () => {
    const ok = await confirm({
      title: "Désactiver le chiffrement ?",
      message:
        "Tes données seront réécrites en clair dans le cloud. Elles restent protégées par ton compte, mais plus contre un accès direct à la base.",
      confirmLabel: "Désactiver",
      danger: true,
    });
    if (!ok) return;
    executer(async () => {
      await desactiverChiffrement();
      showToast({ message: "Chiffrement désactivé." });
      fermer();
    });
  };

  const champ =
    "w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/40";
  const boutonPrincipal =
    "rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-semibold px-4 py-2 disabled:opacity-50";

  let contenu;
  if (!isSupabaseConfigured || !user) {
    contenu = (
      <p className="text-sm text-slate-400">
        Le chiffrement protège les données envoyées dans le cloud. En mode local, rien ne quitte ce navigateur : il n'y a
        rien à chiffrer. Connecte-toi à ton compte pour l'activer.
      </p>
    );
  } else if (etat.verrouille) {
    contenu = (
      <form onSubmit={deverrouiller} className="space-y-3">
        <p className="text-sm text-slate-300">
          Tes données synchronisées sont chiffrées. Saisis ta phrase secrète pour les retrouver sur cet appareil ; elle
          ne sera plus demandée ensuite.
        </p>
        <label htmlFor={`${ids}-phrase`} className="text-xs text-slate-500 block">Phrase secrète</label>
        <input id={`${ids}-phrase`} type="password" autoComplete="current-password" value={phrase} onChange={(e) => setPhrase(e.target.value)} className={champ} />
        <button type="submit" disabled={enCours || !phrase} className={boutonPrincipal}>
          {enCours ? "Vérification…" : "Déverrouiller"}
        </button>
      </form>
    );
  } else if (etat.actif) {
    contenu = (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm text-emerald-300">
          <ShieldCheck size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
          Actif : tout ce qui part dans le cloud est chiffré dans ce navigateur, avec une clé tirée de ta phrase secrète.
        </p>
        <p className="text-xs text-slate-500">
          Sur un nouvel appareil, la phrase te sera demandée une fois. Sans elle, les données du cloud sont illisibles —
          celles déjà présentes sur un appareil déverrouillé restent accessibles.
        </p>
        <button
          type="button"
          onClick={desactiver}
          disabled={enCours}
          className="rounded-lg border border-rose-500/40 px-4 py-2 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
        >
          {enCours ? "Réécriture en cours…" : "Désactiver le chiffrement"}
        </button>
      </div>
    );
  } else {
    contenu = (
      <form onSubmit={activer} className="space-y-3">
        <p className="text-sm text-slate-300">
          Tes données sont protégées par ton compte : personne d'autre ne peut les lire. Le chiffrement va plus loin — même
          un accès direct à la base ne montrerait que des données illisibles.
        </p>
        <p className="flex items-start gap-2 text-xs text-amber-200">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          Ta phrase secrète n'est envoyée nulle part et ne peut pas être réinitialisée. Perdue, elle rend tes données du
          cloud irrécupérables.
        </p>
        <div>
          <label htmlFor={`${ids}-nouvelle`} className="text-xs text-slate-500 block mb-1">Phrase secrète</label>
          <input id={`${ids}-nouvelle`} type="password" autoComplete="new-password" value={phrase} onChange={(e) => setPhrase(e.target.value)} className={champ} />
        </div>
        <div>
          <label htmlFor={`${ids}-confirmation`} className="text-xs text-slate-500 block mb-1">Confirmation</label>
          <input id={`${ids}-confirmation`} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={champ} />
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={noteeAilleurs} onChange={(e) => setNoteeAilleurs(e.target.checked)} className="mt-0.5 accent-amber-400" />
          J'ai noté ma phrase secrète en lieu sûr.
        </label>
        <button type="submit" disabled={enCours} className={boutonPrincipal}>
          {enCours ? "Chiffrement en cours…" : "Activer le chiffrement"}
        </button>
      </form>
    );
  }

  return (
    <Modal
      open={ouvert}
      onClose={fermer}
      label="Chiffrement de bout en bout"
      showClose
      panelClassName="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      <div className="p-5 space-y-4">
        <h2 className="flex items-center gap-2 font-display text-lg text-slate-50">
          <LockKeyhole size={18} aria-hidden="true" /> Chiffrement de bout en bout
        </h2>
        {contenu}
        {erreur && <p role="alert" className="text-xs text-rose-300">{erreur}</p>}
      </div>
    </Modal>
  );
}

/** Bandeau affiché tant que cet appareil n'a pas la phrase secrète. */
export function BandeauChiffrementVerrouille({ onOuvrir }) {
  const etat = useEtatChiffrement();
  if (!etat.verrouille) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
      <p className="flex items-start gap-2">
        <LockKeyhole size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        Tes données synchronisées sont chiffrées. Saisis ta phrase secrète pour les retrouver sur cet appareil — rien n'est
        synchronisé d'ici là.
      </p>
      <button
        type="button"
        onClick={onOuvrir}
        className="rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-semibold px-3 py-1.5"
      >
        Déverrouiller
      </button>
    </div>
  );
}
