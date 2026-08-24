import { useState, useId } from "react";
import { Lock, Mail, LogIn, UserPlus, AlertCircle, CheckCircle2, KeyRound, ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import { translateAuthError, assessPassword, MIN_PASSWORD_LENGTH } from "../lib/authErrors";

/** Marqueur de session « j'utilise l'app sans compte », lu par <AuthGate>. */
export const LOCAL_ONLY_FLAG = "patrimoine:localOnly";

export default function Login() {
  const { signInWithPassword, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const emailId = useId();
  const passwordId = useId();
  const strengthId = useId();

  if (!isSupabaseConfigured) {
    return <NotConfigured />;
  }

  const strength = assessPassword(password);
  const passwordTooWeak = mode === "signup" && password.length > 0 && strength.score < 2;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (mode === "signup" && strength.score < 2) {
      setError(`Mot de passe trop faible. Il lui manque : ${strength.hints.join(", ")}.`);
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { error: err } = await signInWithPassword(email.trim(), password);
        if (err) throw err;
      } else if (mode === "signup") {
        const { error: err } = await signUp(email.trim(), password);
        if (err) throw err;
        setInfo(
          "Compte créé. Si la confirmation par e-mail est activée, vérifie ta boîte mail avant de te connecter."
        );
      } else {
        const { error: err } = await resetPassword(email.trim());
        if (err) throw err;
        // Réponse volontairement identique que le compte existe ou non : le
        // dire permettrait de vérifier si une adresse est inscrite.
        setInfo("Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.");
      }
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const switchTo = (next) => {
    setMode(next);
    setError("");
    setInfo("");
  };

  const TITLES = {
    signin: "Connecte-toi pour retrouver ton patrimoine, partout.",
    signup: "Crée ton compte pour synchroniser tes données.",
    reset: "Reçois un lien pour choisir un nouveau mot de passe.",
  };

  return (
    /*
      COMPOSITION EN DEUX TEMPS.

      C'est le premier écran, le seul que voient ceux qui n'ont pas de compte,
      et le seul écran public de l'application. Il n'affichait que deux champs
      centrés sur fond uni : rien n'y disait ce que fait Patrium, ni ce qui la
      distingue — alors que sa promesse, « tes chiffres ne sortent pas de ton
      navigateur », est précisément ce qu'on veut savoir AVANT de saisir un mot
      de passe.

      Le volet de gauche porte donc cette promesse et trois repères vérifiables.
      Il disparaît sous 1 024 px : sur un téléphone, la seule chose à faire est
      de se connecter, et un argumentaire au-dessus du formulaire ne ferait
      qu'éloigner les champs du pouce.
    */
    <div className="min-h-screen lg:grid lg:grid-cols-2 bg-slate-950">
      <aside className="hidden lg:flex flex-col justify-between p-10 xl:p-14 border-r border-slate-800 relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-24 w-[34rem] h-[34rem] rounded-full bg-amber-400/[0.07] blur-[120px]" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 -right-24 w-[26rem] h-[26rem] rounded-full bg-emerald-400/[0.06] blur-[110px]" />

        <div className="relative font-display text-lead text-slate-100">
          Patri<span className="text-amber-400">um</span>
        </div>

        <div className="relative max-w-md">
          <p className="font-display text-[2rem] leading-[1.15] text-slate-50 text-balance">
            Ton patrimoine, calculé sur ton appareil.
          </p>
          <p className="text-corps text-slate-400 mt-4 text-pretty">
            Livrets, PEA, immobilier, abonnements — réunis dans une seule vue, avec les
            projections qui vont avec.
          </p>

          <ul className="mt-8 flex flex-col gap-3.5">
            {[
              ["Rien ne part en ligne", "Montants, soldes et quantités restent dans ton navigateur. Seuls les tickers sont envoyés, pour récupérer les cours."],
              ["Chiffré côté compte", "La synchronisation est optionnelle. Sans compte, l'application fonctionne entièrement hors ligne."],
              ["Export à tout moment", "Une sauvegarde JSON complète, en un clic, sans passer par nous."],
            ].map(([titre, detail]) => (
              <li key={titre} className="flex gap-3">
                <ShieldCheck size={16} className="shrink-0 mt-0.5 text-emerald-400/80" aria-hidden="true" />
                <span>
                  <span className="block text-corps text-slate-200">{titre}</span>
                  <span className="block text-mini text-slate-500 mt-0.5 text-pretty">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-micro text-slate-600">
          Aucune donnée patrimoniale n'est lisible sans tes identifiants.
        </p>
      </aside>

      <div className="min-h-screen lg:min-h-0 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl text-slate-50 lg:hidden">
            Patri<span className="text-amber-400">um</span>
          </h1>
          <p className="text-corps text-slate-500 mt-1">{TITLES[mode]}</p>
        </div>

        <form onSubmit={submit} className="space-y-3 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <div>
            <label htmlFor={emailId} className="sr-only">
              Adresse e-mail
            </label>
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 focus-within:border-amber-400/60">
              <Mail size={14} className="text-slate-500" aria-hidden="true" />
              <input
                id={emailId}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ton@email.com"
                className="bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none w-full"
              />
            </div>
          </div>

          {mode !== "reset" && (
            <div>
              <label htmlFor={passwordId} className="sr-only">
                Mot de passe
              </label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 focus-within:border-amber-400/60">
                <Lock size={14} className="text-slate-500" aria-hidden="true" />
                <input
                  id={passwordId}
                  type="password"
                  required
                  minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  aria-describedby={mode === "signup" ? strengthId : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mot de passe"
                  className="bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none w-full"
                />
              </div>
              {mode === "signup" && password.length > 0 && (
                <PasswordStrength id={strengthId} strength={strength} />
              )}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2"
            >
              <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {error}
            </p>
          )}
          {info && (
            <p
              role="status"
              className="flex items-start gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2"
            >
              <CheckCircle2 size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {info}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || passwordTooWeak}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-lg px-4 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            {mode === "signin" && <LogIn size={14} aria-hidden="true" />}
            {mode === "signup" && <UserPlus size={14} aria-hidden="true" />}
            {mode === "reset" && <KeyRound size={14} aria-hidden="true" />}
            {loading ? "…" : mode === "signin" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : "Envoyer le lien"}
          </button>

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => switchTo("reset")}
              className="w-full text-center text-xs text-slate-500 hover:text-amber-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
            >
              Mot de passe oublié ?
            </button>
          )}
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          {mode === "reset" ? (
            <button
              onClick={() => switchTo("signin")}
              className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 font-medium rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
            >
              <ArrowLeft size={12} aria-hidden="true" /> Retour à la connexion
            </button>
          ) : (
            <>
              {mode === "signin" ? "Pas encore de compte ?" : "Déjà un compte ?"}{" "}
              <button
                onClick={() => switchTo(mode === "signin" ? "signup" : "signin")}
                className="text-amber-300 hover:text-amber-200 font-medium rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
              >
                {mode === "signin" ? "Créer un compte" : "Se connecter"}
              </button>
            </>
          )}
        </p>

        <p className="text-center text-micro text-slate-600 mt-6">
          Tu resteras connecté(e) sur cet appareil tant que tu ne cliques pas sur « Se déconnecter ».
        </p>
      </div>
      </div>
    </div>
  );
}

const STRENGTH_STYLES = [
  "bg-rose-500 w-1/5",
  "bg-rose-400 w-2/5",
  "bg-amber-400 w-3/5",
  "bg-emerald-400 w-4/5",
  "bg-emerald-400 w-full",
];

function PasswordStrength({ id, strength }) {
  return (
    <div id={id} className="mt-2">
      <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${STRENGTH_STYLES[strength.score]}`} />
      </div>
      <p className="text-micro text-slate-500 mt-1">
        Robustesse : <span className="text-slate-300">{strength.label}</span>
        {strength.hints.length > 0 && <> — il manque {strength.hints.join(", ")}.</>}
      </p>
    </div>
  );
}

/**
 * Sans configuration Supabase, l'écran précédent était un cul-de-sac : un
 * message d'erreur, et aucun moyen d'entrer dans l'application. Une variable
 * d'environnement oubliée au déploiement rendait donc l'app entièrement
 * inutilisable, alors qu'elle fonctionne parfaitement en stockage local.
 */
function NotConfigured() {
  const continueLocally = () => {
    // Drapeau lu par AuthGate, qui laisse alors passer sans session.
    window.sessionStorage.setItem(LOCAL_ONLY_FLAG, "1");
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="max-w-md text-center space-y-3">
        <AlertCircle className="mx-auto text-amber-400" size={28} aria-hidden="true" />
        <h1 className="text-lg font-semibold text-slate-100">Synchronisation non configurée</h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          Ajoute <code className="text-amber-300">VITE_SUPABASE_URL</code> et{" "}
          <code className="text-amber-300">VITE_SUPABASE_ANON_KEY</code> dans les variables
          d'environnement (voir <code className="text-amber-300">.env.example</code>) pour activer la
          connexion et la synchronisation multi-appareils.
        </p>
        <p className="text-sm text-slate-400">
          Tu peux aussi utiliser l'application sans compte : les données resteront alors uniquement
          dans ce navigateur.
        </p>
        <button
          onClick={continueLocally}
          className="text-sm font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
        >
          Continuer en mode local
        </button>
      </div>
    </div>
  );
}
