// Fonction serverless Vercel — GET /api/rates
// Renvoie le catalogue des taux financiers de référence (épargne
// réglementée, crédit, banques centrales, inflation, fiscalité), enrichi
// best-effort par un rafraîchissement live des quelques séries Webstat
// confirmées, si `WEBSTAT_CLIENT_ID` est configuré côté serveur.
//
// Le catalogue de référence (src/lib/ratesCatalog.js) reste la source de
// vérité par défaut : contrairement aux cours de bourse, ces taux ne
// bougent que par décision officielle (Banque de France, BCE, INSEE), à
// dates connues à l'avance. L'absence de clé Webstat ne dégrade donc
// jamais l'utilité de l'endpoint — seulement sa fraîcheur en dernière minute.

import { withApi, cached } from "./_lib/http.js";
import { isWebstatConfigured, fetchLatestObservation } from "./_lib/webstat.js";
import { RATES_CATALOG } from "../src/lib/ratesCatalog.js";

// Un taux réglementé ne change jamais plus d'une fois par jour (et en
// pratique deux fois par an) : un cache long évite de re-solliciter Webstat
// à chaque chargement de l'onglet.
const CACHE_MS = 6 * 60 * 60_000;

async function enrichWithLiveData(catalog) {
  if (!isWebstatConfigured()) {
    return catalog.map((r) => ({ ...r, live: false }));
  }

  return Promise.all(
    catalog.map(async (r) => {
      if (!r.seriesKey) return { ...r, live: false };
      try {
        const obs = await cached(`webstat:${r.seriesKey}`, CACHE_MS, () => fetchLatestObservation(r.seriesKey));
        if (!obs) return { ...r, live: false };
        return { ...r, value: obs.value, effectiveDate: obs.date, live: true };
      } catch {
        // Une série qui échoue à se rafraîchir ne doit jamais faire tomber
        // les autres : on garde sa valeur de référence.
        return { ...r, live: false };
      }
    })
  );
}

async function handler(req, res) {
  const enriched = await enrichWithLiveData(RATES_CATALOG);
  res.status(200).json({
    rates: enriched,
    liveEnabled: isWebstatConfigured(),
    generatedAt: new Date().toISOString(),
  });
}

export default withApi(handler, { methods: ["GET"], limit: 60, windowMs: 60_000, sMaxAge: 3600 });
