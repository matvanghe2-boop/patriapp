// Fonction serverless Vercel — GET /api/calendar?symbols=AI.PA,ADYEN.AS,...
// Récupère les événements financiers à venir (prochaine date de détachement
// de dividende, prochaine publication de résultats, prochaine assemblée
// générale) pour chaque ticker, via le module quoteSummary de Yahoo Finance
// (calendarEvents). Exécuté côté serveur pour éviter le CORS et pour ne pas
// exposer directement l'API Yahoo au navigateur.

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

// Yahoo renvoie les dates soit en timestamp epoch secondes, soit en objet {raw, fmt}.
function toIsoDate(value) {
  if (value == null) return null;
  const raw = typeof value === "object" ? value.raw : value;
  if (raw == null) return null;
  const d = new Date(raw * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchCalendarForSymbol(symbol) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    symbol
  )}?modules=calendarEvents,price`;
  const r = await fetch(url, { headers: YF_HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  const result = data?.quoteSummary?.result?.[0];
  if (!result) throw new Error("Réponse inattendue");

  const ce = result.calendarEvents || {};
  const shortName = result.price?.shortName || result.price?.longName || symbol;

  const events = [];

  // Dividende — Yahoo fournit exDividendDate et parfois dividendDate (mise en paiement)
  const exDiv = toIsoDate(ce.exDividendDate);
  if (exDiv) {
    events.push({
      ticker: symbol,
      name: shortName,
      type: "Dividende",
      date: exDiv,
      label: "Date ex-dividende",
    });
  }
  const payDiv = toIsoDate(ce.dividendDate);
  if (payDiv) {
    events.push({
      ticker: symbol,
      name: shortName,
      type: "Dividende",
      date: payDiv,
      label: "Mise en paiement",
    });
  }

  // Résultats trimestriels — earnings.earningsDate est un tableau (borne basse/haute possible)
  const earningsDates = ce.earnings?.earningsDate;
  if (Array.isArray(earningsDates)) {
    earningsDates.forEach((ed) => {
      const iso = toIsoDate(ed);
      if (iso) {
        events.push({
          ticker: symbol,
          name: shortName,
          type: "Résultats",
          date: iso,
          label: "Publication des résultats",
        });
      }
    });
  }

  // Assemblée générale — Yahoo n'expose pas systématiquement cette date dans
  // calendarEvents selon les places boursières. Aucune date n'est fabriquée :
  // si Yahoo ne la fournit pas pour ce titre, aucun événement "AG" n'apparaît.

  return events;
}

export default async function handler(req, res) {
  const symbolsParam = req.query.symbols;
  if (!symbolsParam) return res.status(400).json({ error: "Paramètre symbols manquant" });

  const symbols = [...new Set(symbolsParam.split(",").map((s) => s.trim()).filter(Boolean))];

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const events = await fetchCalendarForSymbol(symbol);
        return { symbol, ok: true, events };
      } catch (err) {
        return { symbol, ok: false, error: err.message, events: [] };
      }
    })
  );

  res.status(200).json(results);
}
