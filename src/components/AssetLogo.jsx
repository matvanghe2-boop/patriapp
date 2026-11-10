import { useState } from "react";
import { DOMAINES_LOGOS } from "../lib/domainesLogos";

// La table des domaines vit dans lib/domainesLogos.js (partagée avec le
// script qui relève la couleur de chaque logo).
const DOMAIN_OVERRIDES = DOMAINES_LOGOS;

// Palette de repli déterministe (même ticker -> même couleur d'avatar à chaque rendu).
const FALLBACK_COLORS = [
  "bg-cyan-500/15 text-cyan-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
  "bg-violet-500/15 text-violet-300",
  "bg-sky-500/15 text-sky-300",
];

function colorFor(ticker) {
  const s = String(ticker || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % FALLBACK_COLORS.length;
  return FALLBACK_COLORS[hash];
}

function initials(ticker, name) {
  const base = (ticker || name || "?").replace(/\.[A-Z]{1,3}$/, ""); // enlève le suffixe de place (.PA, .DE...)
  return base.slice(0, 2).toUpperCase();
}

const SIZES = { xs: "w-5 h-5 text-[9px]", sm: "w-7 h-7 text-micro", md: "w-9 h-9 text-xs" };

/**
 * Logo d'entreprise déduit du ticker (service public, sans clé API), avec
 * repli automatique sur un avatar à initiales colorées si l'image est
 * indisponible (ETF, ticker non reconnu, erreur réseau...).
 */
export default function AssetLogo({ ticker, name, size = "sm", className = "" }) {
  const [errored, setErrored] = useState(false);
  const sizeCls = SIZES[size] || SIZES.sm;
  const upperTicker = String(ticker || "").toUpperCase();
  const domain = DOMAIN_OVERRIDES[upperTicker];

  // Le service "par ticker" (financialmodelingprep) résout le symbole sans
  // tenir compte de la place boursière et n'est fiable que pour des tickers
  // US "nus" — inutile ici puisqu'un PEA ne peut pas détenir d'actions US.
  // On utilise donc uniquement les domaines connus, via le service de
  // favicon de DuckDuckGo (fiable, rarement bloqué par les extensions
  // anti-tracking, contrairement à Clearbit qui y est souvent catalogué).
  const logoUrl = domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : null;

  if (!ticker || errored || !logoUrl) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full font-data font-semibold shrink-0 ${sizeCls} ${colorFor(
          ticker || name
        )} ${className}`}
      >
        {initials(ticker, name)}
      </span>
    );
  }

  return (
    <img
      src={logoUrl}
      alt=""
      onError={() => setErrored(true)}
      className={`rounded-full object-contain bg-white/5 shrink-0 ${sizeCls} ${className}`}
    />
  );
}
