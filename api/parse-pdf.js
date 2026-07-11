// Fonction serverless Vercel — POST /api/parse-pdf
// Reçoit un avis d'opéré au format PDF (encodé en base64 dans le corps JSON),
// en extrait le texte brut puis en tire un ordre standardisé via des
// expressions régulières adaptées aux relevés Boursorama, Fortuneo et
// Bourse Direct. Aucune donnée n'est persistée côté serveur : le fichier
// n'existe que le temps de la requête.
//
// Le corps attendu : { filename: string, data: string /* base64, sans le
// préfixe "data:application/pdf;base64," */ }
//
// Réponse : { broker, transactionId, date, asset, type, quantity, price, fees }

import pdfParse from "pdf-parse";

export const config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
};

// ─── Détection du courtier ───────────────────────────────────────────────────
function detectBroker(text) {
  const t = text.toLowerCase();
  if (t.includes("boursorama")) return "Boursorama";
  if (t.includes("fortuneo")) return "Fortuneo";
  if (t.includes("bourse direct")) return "Bourse Direct";
  return "Inconnu";
}

// ─── Normalisation des nombres au format français (1 234,56 → 1234.56) ──────
function toNumber(raw) {
  if (raw == null) return null;
  const cleaned = String(raw)
    .replace(/\s|\u00A0/g, "")
    .replace(/€/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ─── Normalisation d'une date au format ISO (YYYY-MM-DD) ────────────────────
function toIsoDate(raw) {
  if (!raw) return null;
  const m = raw.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo}-${d}`;
  }
  const m2 = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return raw;
  return null;
}

// Cherche la première correspondance parmi plusieurs regex candidates
// (les formats de relevés varient selon les courtiers).
function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1]?.trim();
  }
  return null;
}

function extractOrder(text, broker) {
  const rawDate = firstMatch(text, [
    /date\s*(?:d['e]?\s*ex[ée]cution|d['e]?\s*op[ée]ration|de\s*transaction)?\s*[:\s]\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
    /ex[ée]cut[ée]\s*le\s*[:\s]\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})/,
  ]);

  const typeRaw = firstMatch(text, [/\b(achat|vente)\b/i]);
  const type = typeRaw ? (typeRaw.toLowerCase() === "achat" ? "ACHAT" : "VENTE") : null;

  const asset = firstMatch(text, [
    /libell[ée]\s*(?:de\s*la\s*valeur|du\s*titre)?\s*[:\s]\s*([A-Za-zÀ-ÿ0-9 .&\-']{2,60})/i,
    /valeur\s*[:\s]\s*([A-Za-zÀ-ÿ0-9 .&\-']{2,60})/i,
    /titre\s*[:\s]\s*([A-Za-zÀ-ÿ0-9 .&\-']{2,60})/i,
  ]);

  const quantityRaw = firstMatch(text, [
    /quantit[ée]\s*[:\s]\s*([\d\s]+)/i,
    /nombre\s*de\s*titres\s*[:\s]\s*([\d\s]+)/i,
  ]);

  const priceRaw = firstMatch(text, [
    /cours\s*(?:unitaire|d['e]?\s*ex[ée]cution)?\s*[:\s]\s*([\d\s.,]+)\s*€?/i,
    /prix\s*unitaire\s*[:\s]\s*([\d\s.,]+)\s*€?/i,
  ]);

  const feesRaw = firstMatch(text, [
    /(?:frais\s*(?:de\s*)?courtage|commission)\s*[:\s]\s*([\d\s.,]+)\s*€?/i,
    /frais\s*[:\s]\s*([\d\s.,]+)\s*€?/i,
  ]);

  const transactionId = firstMatch(text, [
    /r[ée]f[ée]rence\s*(?:de\s*l['e]?\s*ordre)?\s*[:\s]\s*([A-Z0-9\-]{4,30})/i,
    /n[°o]\s*(?:d['e]?\s*ordre|de\s*transaction)\s*[:\s]\s*([A-Z0-9\-]{4,30})/i,
    /identifiant\s*(?:d['e]?\s*ordre)?\s*[:\s]\s*([A-Z0-9\-]{4,30})/i,
  ]);

  return {
    broker,
    transactionId: transactionId || null,
    date: toIsoDate(rawDate),
    asset: asset || null,
    type,
    quantity: toNumber(quantityRaw),
    price: toNumber(priceRaw),
    fees: toNumber(feesRaw) ?? 0,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { data } = req.body || {};
    if (!data) return res.status(400).json({ error: "Aucun fichier reçu" });

    const buffer = Buffer.from(data, "base64");
    const parsed = await pdfParse(buffer);
    const text = parsed.text.replace(/\r/g, "");

    const broker = detectBroker(text);
    const order = extractOrder(text, broker);

    // Champs strictement indispensables pour comptabiliser l'ordre.
    const missing = ["date", "asset", "type", "quantity", "price"].filter((k) => order[k] == null);
    if (missing.length > 0) {
      return res.status(422).json({
        error: `Impossible d'extraire automatiquement : ${missing.join(", ")}. Utilisez la saisie manuelle.`,
        partial: order,
      });
    }

    return res.status(200).json(order);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Analyse du PDF impossible" });
  }
}
