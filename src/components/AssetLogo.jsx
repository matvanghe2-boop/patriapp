import React, { useState } from "react";

// Le service de logo "par ticker" ambigu confond les places boursières :
// DG.PA (Vinci) est résolu comme DG (Dollar General, US), SAN.PA (Sanofi)
// comme SAN (Banco Santander, US), etc. Pour les valeurs connues, on préfère
// donc un logo par domaine (non ambigu, via le favicon du site officiel). À
// compléter au besoin — quasi tout le CAC 40 et les grandes valeurs
// européennes (Euronext, Xetra, SIX, Milan, Amsterdam, Bruxelles) y sont.
const DOMAIN_OVERRIDES = {
  "AI.PA": "airliquide.com",
  "SAN.PA": "sanofi.com",
  "DG.PA": "vinci.com",
  "MC.PA": "lvmh.com",
  "OR.PA": "loreal.com",
  "BNP.PA": "bnpparibas.com",
  "SU.PA": "se.com",
  "TTE.PA": "totalenergies.com",
  "CS.PA": "axa.com",
  "DSY.PA": "3ds.com",
  "EL.PA": "essilorluxottica.com",
  "RMS.PA": "hermes.com",
  "SGO.PA": "saint-gobain.com",
  "STLAP.PA": "stellantis.com",
  "KER.PA": "kering.com",
  "CAP.PA": "capgemini.com",
  "VIE.PA": "veolia.com",
  "ENGI.PA": "engie.com",
  "ORA.PA": "orange.com",
  "PUB.PA": "publicisgroupe.com",
  "RI.PA": "pernod-ricard.com",
  "SAF.PA": "safran.com",
  "ML.PA": "michelin.com",
  "ACA.PA": "credit-agricole.com",
  "BN.PA": "danone.com",
  "GLE.PA": "societegenerale.com",
  "HO.PA": "thalesgroup.com",
  "LR.PA": "legrand.com",
  "WLN.PA": "worldline.com",
  "ATO.PA": "atos.net",
  "ALO.PA": "alstom.com",
  "EDEN.PA": "edenred.com",
  "TEP.PA": "teleperformance.com",
  "URW.PA": "urw.com",
  "VU.PA": "vusion.com",
  "ADYEN.AS": "adyen.com",
  "STLA.PA": "stellantis.com",
  "VIV.PA": "vivendi.com",
  "BOL.PA": "bollore.com",
  "AC.PA": "accor.com",
  "AIR.PA": "airbus.com",
  "AMUN.PA": "amundi.com",
  "COFA.PA": "coface.com",
  "COV.PA": "covivio.fr",
  "ERF.PA": "eurofins.com",
  "FR.PA": "valeo.com",
  "FDJ.PA": "groupefdj.com",
  "ICAD.PA": "icade.fr",
  "IPN.PA": "ipsen.com",
  "MT.AS": "arcelormittal.com",
  "NEXI.MI": "nexi.it",
  "RNO.PA": "renault.com",
  "RXL.PA": "rexel.com",
  "SCR.PA": "scor.com",
  "SESG.PA": "ses.com",
  "SOI.PA": "soitec.com",
  "SW.PA": "sodexo.com",
  "TFI.PA": "groupe-tf1.fr",
  "UBI.PA": "ubisoft.com",
  "VLA.PA": "valneva.com",
  "VK.PA": "vallourec.com",
  "ASML.AS": "asml.com",
  "SAP.DE": "sap.com",
  "SIE.DE": "siemens.com",
  "ALV.DE": "allianz.com",
  "DTE.DE": "telekom.com",
  "MBG.DE": "mercedes-benz.com",
  "BMW.DE": "bmwgroup.com",
  "VOW3.DE": "volkswagen.com",
  "BAS.DE": "basf.com",
  "DBK.DE": "db.com",
  "NESN.SW": "nestle.com",
  "NOVN.SW": "novartis.com",
  "ROG.SW": "novartis.com",
  "UHR.SW": "swatchgroup.com",
  "ENEL.MI": "enel.com",
  "ENI.MI": "eni.com",
  "ISP.MI": "group.intesasanpaolo.com",
  "UCG.MI": "unicredit.eu",
  "SHEL.AS": "shell.com",
  "PHIA.AS": "philips.com",
  "INGA.AS": "ing.com",
  "AD.AS": "aholddelhaize.com",
  "HEIA.AS": "theheinekencompany.com",
  "UNA.AS": "unilever.com",
  "ABI.BR": "ab-inbev.com",
  "SOLB.BR": "solvay.com",
  "UCB.BR": "ucb.com",
  "KBC.BR": "kbc.com",
};

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

const SIZES = { xs: "w-5 h-5 text-[9px]", sm: "w-7 h-7 text-[10px]", md: "w-9 h-9 text-xs" };

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
