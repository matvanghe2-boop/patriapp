// Fonction serverless Vercel — POST /api/parse-pdf
// Reçoit un document PDF (encodé en base64 dans le corps JSON) et en extrait
// le texte brut. Gère plusieurs types de documents de courtage :
//   - "avis_operation"    : un avis d'opéré (un seul ordre achat/vente)
//   - "releve_titres"     : un relevé de portefeuille titres (plusieurs lignes)
//   - "releve_especes"    : un relevé de compte espèces (mouvements de cash)
//   - "releve_dividendes" : un relevé de coupons / dividendes perçus
//   - "releve_compte"     : relevé de compte générique (mélange mouvements)
//
// Contrairement à une extraction "tout ou rien", cette fonction renvoie
// TOUJOURS 200 avec la meilleure extraction possible : chaque élément détecté
// porte un flag `complete` (true si tous les champs indispensables sont
// présents). Le frontend peut alors committer directement les lignes
// complètes et proposer la saisie manuelle pré-remplie pour les incomplètes,
// plutôt que de bloquer l'import entier sur un format non reconnu.
//
// Corps attendu : { filename: string, data: string /* base64 */ }
// Réponse : { documentType, orders: [{ complete, broker, transactionId,
//             date, asset, type, quantity, price, fees, amount }], rawExcerpt? }

import pdfParse from "pdf-parse";

export const config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
};

// ─── Normalisation ────────────────────────────────────────────────────────────
function toNumber(raw) {
  if (raw == null) return null;
  const cleaned = String(raw)
    .replace(/[\s\u00A0]/g, "")
    .replace(/€/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toIsoDate(raw) {
  if (!raw) return null;
  let m = raw.match(/(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo}-${d}`;
  }
  m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return raw.match(/\d{4}-\d{2}-\d{2}/)[0];
  return null;
}

function detectBroker(text) {
  const t = text.toLowerCase();
  if (t.includes("boursorama") || t.includes("boursobank")) return "Boursorama";
  if (t.includes("fortuneo")) return "Fortuneo";
  if (t.includes("bourse direct")) return "Bourse Direct";
  return "Inconnu";
}

function detectDocumentType(text) {
  const t = text.toLowerCase();
  if (/dividende|coupon/.test(t)) return "releve_dividendes";
  if (/avis\s*d[’']?op[ée]r[ée]|confirmation\s*d[’']?ordre|avis\s*d[’']?ex[ée]cution|op[ée]ration\s*de\s*bourse/.test(t)) return "avis_operation";
  if (/relev[ée]\s*(?:de\s*)?titres|portefeuille\s*titres|position\s*titres/.test(t)) return "releve_titres";
  if (/relev[ée]\s*(?:de\s*)?esp[eè]ces|mouvements?\s*(?:de\s*)?compte|relev[ée]\s*(?:de\s*)?compte/.test(t)) return "releve_especes";
  return "inconnu";
}

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1]?.trim();
  }
  return null;
}

// ─── Extraction dédiée Boursorama / BoursoBank ───────────────────────────────
// Calée sur le layout réel des avis "OPERATION DE BOURSE" : en-tête avec la
// date ("le JJ/MM/AAAA"), un bloc "ACHAT COMPTANT" / "VENTE COMPTANT", une
// ligne "<quantité> <libellé valeur> Référence : <id>", un "Cours exécuté :
// <prix> EUR", et une ligne de montants "<brut> EUR <commission> EUR
// [<frais> EUR] <net> EUR" sous l'en-tête "Montant brut Commission Frais...".
function extractBoursoramaOrder(text, broker) {
  const rawDate = firstMatch(text, [/\ble\s+(\d{2}\/\d{2}\/\d{4})/i]);

  const typeMatch = text.match(/\b(ACHAT|VENTE)\s+COMPTANT/i);
  const type = typeMatch ? (typeMatch[1].toUpperCase() === "ACHAT" ? "ACHAT" : "VENTE") : null;

  // "4 BNPP EASY S&P 500 UC.EUR ETF Référence : 010114511851"
  // Ancré en début de ligne et restreint aux espaces (pas \s) entre les
  // champs pour éviter d'accrocher un nombre venant d'une autre ligne
  // (ex : les secondes d'un horodatage "15:33:06").
  const lineMatch = text.match(
    /^(\d+(?:[.,]\d+)?)[ \t]+([A-Za-zÀ-ÿ0-9&.\-'][A-Za-zÀ-ÿ0-9&.\-' ]{1,78}?)[ \t]+R[ée]f[ée]rence[ \t]*:[ \t]*([A-Z0-9]+)/im
  );
  const quantity = lineMatch ? toNumber(lineMatch[1]) : null;
  const asset = lineMatch ? lineMatch[2].trim() : null;
  const transactionId = lineMatch ? lineMatch[3].trim() : null;

  const priceRaw = firstMatch(text, [
    /Cours\s*ex[ée]cut[ée]\s*:\s*([\d\s.,]+)\s*EUR/i,
    /Cours\s*demand[ée]\s*:\s*([\d\s.,]+)\s*EUR/i,
  ]);

  const isin = firstMatch(text, [/Code\s*ISIN\s*:\s*([A-Z]{2}[A-Z0-9]{9}\d)/i]);

  // Ligne de montants sous l'en-tête "Montant brut  Commission  Frais (♦)
  // Montant net au débit de votre compte" : 3 nombres si la colonne "Frais"
  // (taxe sur les transactions financières) est vide, 4 sinon.
  let fees = 0;
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => /Montant\s*brut/i.test(l) && /Commission/i.test(l));
  if (headerIdx !== -1) {
    // Les valeurs peuvent être sur la même ligne que l'en-tête ou sur la
    // ligne suivante selon la mise en page de l'export PDF.
    const candidateLines = [lines[headerIdx], lines[headerIdx + 1] || ""].join(" ");
    const nums = candidateLines.match(/[\d\s]+[.,]\d+\s*EUR/gi)?.map(toNumber).filter((n) => n != null) || [];
    if (nums.length === 3) {
      // brut, commission, net -> frais = commission (pas de TTF)
      fees = nums[1];
    } else if (nums.length >= 4) {
      // brut, commission, frais, net -> frais = commission + frais TTF
      fees = nums[1] + nums[2];
    }
  }

  const order = {
    broker,
    transactionId: transactionId || null,
    date: toIsoDate(rawDate),
    asset: asset || isin || null,
    type,
    quantity,
    price: toNumber(priceRaw),
    fees,
  };
  order.complete = ["date", "asset", "type", "quantity", "price"].every((k) => order[k] != null);
  return order;
}

// ─── Extraction d'un avis d'opéré (un seul ordre) ────────────────────────────
function extractSingleOrder(text, broker) {
  const rawDate = firstMatch(text, [
    /date\s*(?:d['e]?\s*ex[ée]cution|d['e]?\s*op[ée]ration|de\s*transaction|de\s*n[ée]gociation)?\s*[:\s]\s*(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})/i,
    /ex[ée]cut[ée]\s*le\s*[:\s]\s*(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})/i,
    /le\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})/,
  ]);

  const typeRaw = firstMatch(text, [
    /\b(achat|vente|souscription|c?e?ssion|rachat)\b/i,
  ]);
  let type = null;
  if (typeRaw) {
    const tl = typeRaw.toLowerCase();
    type = /achat|souscription/.test(tl) ? "ACHAT" : "VENTE";
  }

  const asset = firstMatch(text, [
    /libell[ée]\s*(?:de\s*la\s*valeur|du\s*titre|de\s*l['e]?\s*instrument)?\s*[:\s]\s*([A-Za-zÀ-ÿ0-9 .&\-'/]{2,60})/i,
    /d[ée]signation\s*(?:de\s*la\s*valeur)?\s*[:\s]\s*([A-Za-zÀ-ÿ0-9 .&\-'/]{2,60})/i,
    /valeur\s*[:\s]\s*([A-Za-zÀ-ÿ0-9 .&\-'/]{2,60})/i,
    /titre\s*[:\s]\s*([A-Za-zÀ-ÿ0-9 .&\-'/]{2,60})/i,
    /isin\s*[:\s]?\s*([A-Z]{2}[A-Z0-9]{9}\d)/i,
  ]);

  const quantityRaw = firstMatch(text, [
    /quantit[ée]\s*(?:ex[ée]cut[ée]e)?\s*[:\s]\s*([\d\s]+(?:[.,]\d+)?)/i,
    /nombre\s*de\s*titres\s*[:\s]\s*([\d\s]+)/i,
    /nb\.?\s*titres\s*[:\s]\s*([\d\s]+)/i,
  ]);

  const priceRaw = firstMatch(text, [
    /cours\s*(?:unitaire|moyen|d['e]?\s*ex[ée]cution)?\s*[:\s]\s*([\d\s.,]+)\s*€?/i,
    /prix\s*(?:unitaire|moyen)?\s*[:\s]\s*([\d\s.,]+)\s*€?/i,
  ]);

  const feesRaw = firstMatch(text, [
    /(?:frais\s*(?:de\s*)?courtage|commission\s*(?:de\s*)?courtage|courtage)\s*[:\s]\s*([\d\s.,]+)\s*€?/i,
    /frais\s*(?:et\s*commissions?)?\s*[:\s]\s*([\d\s.,]+)\s*€?/i,
  ]);

  const transactionId = firstMatch(text, [
    /r[ée]f[ée]rence\s*(?:de\s*l['e]?\s*ordre)?\s*[:\s]\s*([A-Z0-9\-]{4,30})/i,
    /n[°o]\s*(?:d['e]?\s*ordre|de\s*transaction|de\s*r[ée]f[ée]rence)\s*[:\s]\s*([A-Z0-9\-]{4,30})/i,
    /identifiant\s*(?:d['e]?\s*ordre)?\s*[:\s]\s*([A-Z0-9\-]{4,30})/i,
  ]);

  const order = {
    broker,
    transactionId: transactionId || null,
    date: toIsoDate(rawDate),
    asset: asset || null,
    type,
    quantity: toNumber(quantityRaw),
    price: toNumber(priceRaw),
    fees: toNumber(feesRaw) ?? 0,
  };
  order.complete = ["date", "asset", "type", "quantity", "price"].every((k) => order[k] != null);
  return order;
}

// ─── Extraction ligne par ligne pour les relevés (plusieurs mouvements) ─────
// Repère les lignes qui commencent par une date et contiennent au moins deux
// nombres (quantité + montant, ou cours + montant). Format toléré :
// "12/03/2026  ACHAT AIR LIQUIDE  10  175,20  1 752,00"
function extractStatementOrders(text, broker) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const orders = [];
  const dateRe = /^(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})/;
  const numRe = /-?\d[\d\s]*(?:[.,]\d+)?/g;

  for (const line of lines) {
    const dm = line.match(dateRe);
    if (!dm) continue;
    const rest = line.slice(dm[0].length).trim();
    const typeM = rest.match(/\b(achat|vente|souscription|rachat)\b/i);
    const nums = rest.match(numRe)?.map(toNumber).filter((n) => n != null) || [];
    if (!typeM || nums.length < 2) continue;

    // Le libellé est le texte entre le type d'opération et le premier nombre.
    const afterType = rest.slice(typeM.index + typeM[0].length);
    const asset = afterType.split(numRe)[0].trim().replace(/^[:\-\s]+/, "") || null;

    const type = /achat|souscription/i.test(typeM[0]) ? "ACHAT" : "VENTE";
    // Heuristique : avant-dernier nombre = quantité, dernier = cours, sauf si
    // 3 nombres ou plus disponibles (quantité, cours, montant) → on prend les 2 premiers.
    const [quantity, price] = nums.length >= 2 ? [nums[0], nums[1]] : [null, null];

    const order = {
      broker,
      transactionId: generatePseudoId(dm[1], asset, type, quantity, price),
      date: toIsoDate(dm[1]),
      asset,
      type,
      quantity,
      price,
      fees: 0,
    };
    order.complete = ["date", "asset", "type", "quantity", "price"].every((k) => order[k] != null);
    if (order.asset) orders.push(order);
  }
  return orders;
}

// ─── Extraction des lignes de dividendes / coupons ──────────────────────────
function extractDividendLines(text, broker) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const orders = [];
  const dateRe = /^(\d{2}[\/\-.]\d{2}[\/\-.]\d{4})/;
  const numRe = /-?\d[\d\s]*(?:[.,]\d+)?/g;

  for (const line of lines) {
    if (!/dividende|coupon/i.test(line)) continue;
    const dm = line.match(dateRe) || text.match(dateRe);
    const nums = line.match(numRe)?.map(toNumber).filter((n) => n != null) || [];
    const amount = nums.length ? nums[nums.length - 1] : null;
    const assetMatch = line.replace(dateRe, "").replace(/dividende|coupon/i, "").match(/[A-Za-zÀ-ÿ0-9 .&\-'/]{2,60}/);

    orders.push({
      broker,
      transactionId: generatePseudoId(dm?.[1], assetMatch?.[0], "DIVIDENDE", amount, null),
      date: toIsoDate(dm?.[1]),
      asset: assetMatch?.[0]?.trim() || null,
      type: "DIVIDENDE",
      quantity: null,
      price: null,
      fees: 0,
      amount,
      complete: !!(dm && amount != null),
    });
  }
  return orders;
}

function generatePseudoId(date, asset, type, a, b) {
  const norm = (s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return `${norm(date)}_${norm(asset)}_${norm(type)}_${norm(a)}_${norm(b)}`;
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
    const documentType = detectDocumentType(text);

    let orders = [];
    if (documentType === "releve_dividendes") {
      orders = extractDividendLines(text, broker);
    } else if (documentType === "releve_titres" || documentType === "releve_especes") {
      orders = extractStatementOrders(text, broker);
    } else {
      // "avis_operation" ou type inconnu : on tente en priorité le layout
      // Boursorama/BoursoBank (calé sur un vrai avis), puis l'extraction
      // générique, puis en dernier repli l'extraction ligne par ligne au cas
      // où le document contiendrait plusieurs mouvements malgré tout.
      let single = broker === "Boursorama" ? extractBoursoramaOrder(text, broker) : null;
      if (!single || !single.complete) {
        const fallback = extractSingleOrder(text, broker);
        if (!single) single = fallback;
        else {
          // Complète les champs manquants du parseur dédié avec le générique.
          for (const k of ["transactionId", "date", "asset", "type", "quantity", "price", "fees"]) {
            if (single[k] == null && fallback[k] != null) single[k] = fallback[k];
          }
          single.complete = ["date", "asset", "type", "quantity", "price"].every((k) => single[k] != null);
        }
      }
      orders = single.complete ? [single] : [...extractStatementOrders(text, broker)];
      if (orders.length === 0) orders = [single];
    }

    const anyComplete = orders.some((o) => o.complete);
    const payload = { documentType, broker, orders };
    if (!anyComplete) {
      // Rien d'exploitable automatiquement : on renvoie quand même un extrait
      // du texte brut pour permettre d'affiner les règles d'extraction, et le
      // frontend bascule sur la saisie manuelle pré-remplie avec le peu qu'on a.
      payload.rawExcerpt = text.slice(0, 1500);
    }

    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Analyse du PDF impossible" });
  }
}
