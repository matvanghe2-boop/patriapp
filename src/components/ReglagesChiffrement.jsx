import { useId, useState } from "react";
import { LockKeyhole, ShieldCheck, ShieldAlert, LifeBuoy, KeyRound } from "lucide-react";
import Modal from "./Modal";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../lib/ToastContext";
import { useConfirm } from "../lib/ConfirmContext";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import {
  useEtatChiffrement, activerChiffrement, deverrouillerChiffrement, desactiverChiffrement,
  creerCodeSecours, changerPhraseSecrete, deverrouillerAvecCodeSecours,
} from "../lib/storage";

/**
 * Réglage du chiffrement de bout en bout.
 *
 * Trois états : inactif (on peut l'activer), actif sur cet appareil (on peut
 * le désactiver), verrouillé (actif ailleurs, la phrase est demandée). La
 * phrase n'est jamais conservée, ni envoyée : seule la clé qui en dérive
 * reste sur l'appareil.
 *
 * Sur un appareil déverrouillé, on peut aussi créer un code de secours et
 * changer de phrase ; sur un appareil verrouillé, le code de secours remplace
 * une phrase oubliée (voir « Version 2 » dans chiffrement.js).
 */

const dateFr = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

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
  // Phrase oubliée : saisie du code de secours au lieu de la phrase.
  const [modeSecours, setModeSecours] = useState(false);
  const [code, setCode] = useState("");
  // Code de secours tout juste créé : montré une fois, puis oublié.
  const [codeAffiche, setCodeAffiche] = useState(null);
  const [codeNote, setCodeNote] = useState(false);
  const [changement, setChangement] = useState(false);

  const fermer = () => {
    setPhrase("");
    setConfirmation("");
    setNoteeAilleurs(false);
    setErreur(null);
    setModeSecours(false);
    setCode("");
    setCodeAffiche(null);
    setCodeNote(false);
    setChangement(false);
    onFermer();
  };

  /** Règles communes à toute nouvelle phrase ; message d'erreur, ou `null`. */
  const problemeNouvellePhrase = () => {
    if (phrase.length < LONGUEUR_MIN) return `Choisis une phrase d'au moins ${LONGUEUR_MIN} caractères.`;
    if (phrase !== confirmation) return "Les deux saisies ne sont pas identiques.";
    return null;
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

  const recuperer = (e) => {
    e.preventDefault();
    const probleme = problemeNouvellePhrase();
    if (probleme) return setErreur(probleme);
    return executer(async () => {
      const ok = await deverrouillerAvecCodeSecours(code, phrase);
      if (!ok) throw new Error("Code de secours incorrect.");
      showToast({ message: "Coffre et données rouverts : ta nouvelle phrase secrète remplace l'ancienne partout." });
      fermer();
    });
  };

  const creerCode = async () => {
    if (etat.codeSecours) {
      const ok = await confirm({
        title: "Remplacer le code de secours ?",
        message: "L'ancien code cessera aussitôt de fonctionner. Détruis le papier sur lequel tu l'avais noté.",
        confirmLabel: "Remplacer",
      });
      if (!ok) return;
    }
    executer(async () => {
      setCodeAffiche(await creerCodeSecours());
      setCodeNote(false);
    });
  };

  const changerPhrase = (e) => {
    e.preventDefault();
    const probleme = problemeNouvellePhrase();
    if (probleme) return setErreur(probleme);
    return executer(async () => {
      await changerPhraseSecrete(phrase);
      setPhrase("");
      setConfirmation("");
      setChangement(false);
      showToast({ message: "Phrase secrète changée. Tes autres appareils restent déverrouillés." });
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
  } else if (etat.verrouille && modeSecours) {
    contenu = (
      <form onSubmit={recuperer} className="space-y-3">
        <p className="text-sm text-slate-300">
          Saisis ton code de secours, puis choisis une nouvelle phrase secrète. Elle remplacera l'ancienne sur tous tes
          appareils ; rien n'est rechiffré.
        </p>
        <div>
          <label htmlFor={`${ids}-code`} className="text-xs text-slate-500 block mb-1">Code de secours</label>
          <input id={`${ids}-code`} type="text" autoComplete="off" spellCheck={false} autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" className={`${champ} font-data`} />
        </div>
        <div>
          <label htmlFor={`${ids}-recup-phrase`} className="text-xs text-slate-500 block mb-1">Nouvelle phrase secrète</label>
          <input id={`${ids}-recup-phrase`} type="password" autoComplete="new-password" value={phrase} onChange={(e) => setPhrase(e.target.value)} className={champ} />
        </div>
        <div>
          <label htmlFor={`${ids}-recup-confirmation`} className="text-xs text-slate-500 block mb-1">Confirmation</label>
          <input id={`${ids}-recup-confirmation`} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={champ} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={enCours || !code} className={boutonPrincipal}>
            {enCours ? "Vérification…" : "Rouvrir avec le code"}
          </button>
          <button type="button" onClick={() => { setModeSecours(false); setErreur(null); }} className="text-xs text-slate-400 hover:text-slate-200">
            Revenir à la phrase
          </button>
        </div>
      </form>
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
        {etat.codeSecours ? (
          <button
            type="button"
            onClick={() => { setModeSecours(true); setPhrase(""); setErreur(null); }}
            className="flex items-center gap-1.5 text-xs text-amber-300 hover:underline"
          >
            <LifeBuoy size={14} aria-hidden="true" />
            Phrase oubliée ? Utiliser le code de secours
          </button>
        ) : (
          <p className="text-xs text-slate-500">
            Aucun code de secours n'a été créé : une phrase oubliée ne se récupère pas.
          </p>
        )}
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

        {codeAffiche ? (
          <div className="space-y-2 rounded-xl border border-amber-400/40 bg-amber-400/5 p-3">
            <p className="text-sm text-amber-100">Ton code de secours. Il ne sera plus jamais affiché :</p>
            <p data-testid="code-secours" className="font-data text-lg tracking-wider text-slate-50 break-all select-all">
              {codeAffiche}
            </p>
            <p className="text-xs text-slate-400">
              Écris-le sur papier et range-le avec tes papiers importants, mais pas dans le coffre ni dans Patrium : il sert
              justement quand ils sont fermés. Il rouvre tes données si tu oublies ta phrase.
            </p>
            <label className="flex items-start gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={codeNote} onChange={(e) => setCodeNote(e.target.checked)} className="mt-0.5 accent-amber-400" />
              Je l'ai noté sur papier.
            </label>
            <button type="button" disabled={!codeNote} onClick={() => { setCodeAffiche(null); setCodeNote(false); }} className={boutonPrincipal}>
              Terminé
            </button>
          </div>
        ) : (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <h3 className="flex items-center gap-2 text-sm text-slate-200">
              <LifeBuoy size={16} aria-hidden="true" /> Code de secours
            </h3>
            <p className="text-xs text-slate-500">
              {etat.codeSecours
                ? `Créé le ${dateFr(etat.codeSecours)}. En créer un nouveau rend l'ancien inutilisable.`
                : "Aucun pour l'instant : une phrase oubliée rendrait tes données du cloud et ton coffre irrécupérables."}
            </p>
            <button
              type="button"
              onClick={creerCode}
              disabled={enCours}
              className="rounded-lg border border-amber-400/50 px-4 py-2 text-sm text-amber-200 hover:bg-amber-400/10 disabled:opacity-50"
            >
              {etat.codeSecours ? "Remplacer le code de secours" : "Créer un code de secours"}
            </button>
          </div>
        )}

        <div className="space-y-2 border-t border-slate-800 pt-3">
          {changement ? (
            <form onSubmit={changerPhrase} className="space-y-3">
              <div>
                <label htmlFor={`${ids}-changement`} className="text-xs text-slate-500 block mb-1">Nouvelle phrase secrète</label>
                <input id={`${ids}-changement`} type="password" autoComplete="new-password" value={phrase} onChange={(e) => setPhrase(e.target.value)} className={champ} />
              </div>
              <div>
                <label htmlFor={`${ids}-changement-confirmation`} className="text-xs text-slate-500 block mb-1">Confirmation</label>
                <input id={`${ids}-changement-confirmation`} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={champ} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={enCours} className={boutonPrincipal}>
                  {enCours ? "Enregistrement…" : "Changer de phrase"}
                </button>
                <button type="button" onClick={() => { setChangement(false); setPhrase(""); setConfirmation(""); setErreur(null); }} className="text-xs text-slate-400 hover:text-slate-200">
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setChangement(true)} className="flex items-center gap-2 text-sm text-slate-300 hover:text-slate-100">
              <KeyRound size={16} aria-hidden="true" /> Changer de phrase secrète
            </button>
          )}
        </div>

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
