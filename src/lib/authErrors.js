/**
 * Traduction des erreurs Supabase.
 *
 * Le SDK renvoie ses messages en anglais et dans un vocabulaire technique
 * (« Invalid login credentials », « AuthApiError: ... »). Les afficher bruts
 * dans une interface intégralement française était à la fois incohérent et
 * peu actionnable pour l'utilisateur.
 *
 * Les correspondances portent sur des fragments : les libellés exacts de
 * Supabase changent d'une version à l'autre, un test de sous-chaîne résiste
 * mieux qu'une égalité stricte.
 */
const RULES = [
  [/invalid login credentials/i, "E-mail ou mot de passe incorrect."],
  [/email not confirmed/i, "Ton adresse e-mail n'a pas encore été confirmée. Vérifie ta boîte mail."],
  [/user already registered|already been registered/i, "Un compte existe déjà avec cette adresse e-mail."],
  [/password should be at least (\d+)/i, "Mot de passe trop court : il faut au moins $1 caractères."],
  [/weak password|password is too weak/i, "Mot de passe trop faible. Ajoute des caractères, des chiffres ou des symboles."],
  [/unable to validate email|invalid email/i, "Cette adresse e-mail n'est pas valide."],
  [/email rate limit exceeded|over_email_send_rate_limit/i, "Trop d'e-mails envoyés. Patiente quelques minutes avant de réessayer."],
  [/rate limit|too many requests/i, "Trop de tentatives. Patiente quelques minutes avant de réessayer."],
  [/network|fetch failed|failed to fetch/i, "Connexion au serveur impossible. Vérifie ta connexion internet."],
  [/user not found/i, "Aucun compte ne correspond à cette adresse e-mail."],
  [/token has expired|expired/i, "Ce lien a expiré. Demande-en un nouveau."],
  [/same password/i, "Le nouveau mot de passe doit être différent de l'ancien."],
];

export function translateAuthError(error) {
  const message = typeof error === "string" ? error : error?.message || "";
  if (!message) return "Une erreur est survenue. Réessaie dans un instant.";

  for (const [pattern, replacement] of RULES) {
    const match = message.match(pattern);
    if (match) {
      return replacement.replace(/\$(\d)/g, (_, i) => match[Number(i)] ?? "");
    }
  }
  // Message inconnu : on reste générique plutôt que d'exposer un libellé
  // technique anglais, tout en gardant le détail dans la console pour le debug.
  console.warn("Erreur d'authentification non traduite :", message);
  return "Connexion impossible pour le moment. Réessaie dans un instant.";
}

// ─── Robustesse du mot de passe ──────────────────────────────────────────────
// Le formulaire se contentait d'un minLength={6} — très insuffisant pour un
// compte qui donne accès à l'intégralité d'un patrimoine.

export const MIN_PASSWORD_LENGTH = 10;

const COMMON_PATTERNS = [/^(.)\1+$/, /^(012|123|234|345|456|567|678|789|890)/, /motdepasse|password|azerty|qwerty/i];

/** Renvoie { score: 0..4, label, hints[] }. */
export function assessPassword(password) {
  const pwd = password || "";
  const hints = [];

  if (pwd.length < MIN_PASSWORD_LENGTH) hints.push(`au moins ${MIN_PASSWORD_LENGTH} caractères`);
  if (!/[a-z]/.test(pwd) || !/[A-Z]/.test(pwd)) hints.push("des minuscules et des majuscules");
  if (!/\d/.test(pwd)) hints.push("au moins un chiffre");
  if (!/[^A-Za-z0-9]/.test(pwd)) hints.push("au moins un caractère spécial");

  let score = 0;
  if (pwd.length >= MIN_PASSWORD_LENGTH) score++;
  if (pwd.length >= 14) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
  if (COMMON_PATTERNS.some((re) => re.test(pwd))) score = Math.min(score, 1);
  if (!pwd) score = 0;

  const LABELS = ["Très faible", "Faible", "Moyen", "Bon", "Excellent"];
  return { score: Math.min(score, 4), label: LABELS[Math.min(score, 4)], hints };
}
