import React, { useState } from "react";
import { Lock, Mail, LogIn, UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { isSupabaseConfigured } from "../lib/supabaseClient";

export default function Login() {
  const { signInWithPassword, signUp } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md text-center space-y-3">
          <AlertCircle className="mx-auto text-amber-400" size={28} />
          <h1 className="text-lg font-semibold text-slate-100">Synchronisation non configurée</h1>
          <p className="text-sm text-slate-400">
            Ajoute <code className="text-amber-300">VITE_SUPABASE_URL</code> et{" "}
            <code className="text-amber-300">VITE_SUPABASE_ANON_KEY</code> dans les variables
            d'environnement (voir <code className="text-amber-300">.env.example</code>) pour activer
            la connexion et la synchronisation multi-appareils.
          </p>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error: err } = await signInWithPassword(email.trim(), password);
        if (err) throw err;
      } else {
        const { error: err } = await signUp(email.trim(), password);
        if (err) throw err;
        setInfo("Compte créé. Si la confirmation par e-mail est activée, vérifie ta boîte mail avant de te connecter.");
      }
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-display text-2xl text-slate-50">
            Patri<span className="text-amber-400">um</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === "signin" ? "Connecte-toi pour retrouver ton patrimoine, partout." : "Crée ton compte pour synchroniser tes données."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 focus-within:border-amber-400/60">
            <Mail size={14} className="text-slate-500" />
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
              className="bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none w-full"
            />
          </div>
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 focus-within:border-amber-400/60">
            <Lock size={14} className="text-slate-500" />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              className="bg-transparent text-sm text-slate-100 placeholder-slate-600 focus:outline-none w-full"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}
          {info && (
            <div className="flex items-start gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
              <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 rounded-lg px-4 py-2.5 transition-colors"
          >
            {mode === "signin" ? <LogIn size={14} /> : <UserPlus size={14} />}
            {loading ? "…" : mode === "signin" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          {mode === "signin" ? "Pas encore de compte ?" : "Déjà un compte ?"}{" "}
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setInfo(""); }}
            className="text-amber-300 hover:text-amber-200 font-medium"
          >
            {mode === "signin" ? "Créer un compte" : "Se connecter"}
          </button>
        </p>

        <p className="text-center text-[11px] text-slate-600 mt-6">
          Tu resteras connecté(e) sur cet appareil tant que tu ne cliques pas sur « Se déconnecter ».
        </p>
      </div>
    </div>
  );
}
