// Export "1 clic" du patrimoine, sans dépendance externe :
// - Excel : table HTML servie avec l'extension .xls, qu'Excel/LibreOffice
//   ouvrent nativement (méthode standard sans librairie).
// - PDF : fenêtre imprimable dédiée, l'utilisateur choisit "Enregistrer en PDF"
//   dans la boîte de dialogue d'impression du navigateur.

function buildReportRows({
  patrimoineBrut, patrimoineNet, dettesTotal, livretsTotal, bourseTotal, cash,
  livrets, bourse, envelopeBreakdown,
}) {
  const rows = [];
  rows.push(["Patrimoine — export", new Date().toLocaleDateString("fr-FR")]);
  rows.push([]);
  rows.push(["Synthèse", ""]);
  rows.push(["Patrimoine brut", patrimoineBrut]);
  rows.push(["Passifs / dettes", -dettesTotal]);
  rows.push(["Patrimoine net", patrimoineNet]);
  rows.push([]);
  rows.push(["Répartition par enveloppe fiscale", ""]);
  (envelopeBreakdown || []).forEach((e) => rows.push([e.name, e.value]));
  rows.push([]);
  rows.push(["Livrets & Épargne", ""]);
  rows.push(["Support", "Capital", "Taux net", "Enveloppe"]);
  (livrets || []).forEach((l) => rows.push([l.name, l.balance, `${(l.rate * 100).toFixed(2)} %`, l.envelope || ""]));
  rows.push(["Compte courant", cash || 0, "", "Cash"]);
  rows.push([]);
  rows.push(["PEA & Bourse", ""]);
  rows.push(["Ticker", "Nom", "Quantité", "PRU", "Cours actuel", "Valeur"]);
  (bourse?.positions || []).forEach((p) =>
    rows.push([p.ticker, p.name, p.quantity, p.pru, p.current_price, p.quantity * p.current_price])
  );
  rows.push(["Cash PEA", "", "", "", "", bourse?.cash_pocket || 0]);
  return rows;
}

export function exportToExcel(data) {
  const rows = buildReportRows(data);
  const escapeHtml = (v) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("\n");
  const html = `<html><head><meta charset="utf-8" /></head><body><table border="1">${body}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `patrimoine-export-${new Date().toISOString().slice(0, 10)}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPDF(data) {
  const { patrimoineBrut, patrimoineNet, dettesTotal, envelopeBreakdown, livrets, bourse, cash, diversification } = data;
  const eur = (n) => (n ?? 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const win = window.open("", "_blank", "width=800,height=1000");
  if (!win) return;
  const envRows = (envelopeBreakdown || [])
    .map((e) => `<tr><td>${e.name}</td><td style="text-align:right">${eur(e.value)}</td></tr>`)
    .join("");
  const livretRows = (livrets || [])
    .map((l) => `<tr><td>${l.name}</td><td>${l.envelope || ""}</td><td style="text-align:right">${eur(l.balance)}</td></tr>`)
    .join("");
  const posRows = (bourse?.positions || [])
    .map((p) => `<tr><td>${p.ticker}</td><td>${p.name}</td><td style="text-align:right">${eur(p.quantity * p.current_price)}</td></tr>`)
    .join("");
  win.document.write(`
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Patrimoine — export PDF</title>
      <style>
        body { font-family: -apple-system, Arial, sans-serif; color: #111; padding: 32px; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        h2 { font-size: 14px; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
        td, th { padding: 4px 8px; border-bottom: 1px solid #eee; }
        .kpi { display: flex; gap: 24px; margin-top: 12px; }
        .kpi div { font-size: 12px; color: #555; }
        .kpi strong { display: block; font-size: 18px; color: #111; }
      </style>
    </head>
    <body>
      <h1>Patrimoine — synthèse</h1>
      <div style="font-size:12px;color:#666;">Généré le ${new Date().toLocaleDateString("fr-FR")}</div>
      <div class="kpi">
        <div>Patrimoine brut<strong>${eur(patrimoineBrut)}</strong></div>
        <div>Passifs<strong>-${eur(dettesTotal)}</strong></div>
        <div>Patrimoine net<strong>${eur(patrimoineNet)}</strong></div>
        ${diversification ? `<div>Score diversification<strong>${Math.round(diversification.score)} / 100</strong></div>` : ""}
      </div>

      <h2>Répartition par enveloppe fiscale</h2>
      <table><tbody>${envRows}</tbody></table>

      <h2>Livrets &amp; Épargne</h2>
      <table><tbody>${livretRows}</tbody></table>
      <table><tbody><tr><td>Compte courant</td><td>Cash</td><td style="text-align:right">${eur(cash || 0)}</td></tr></tbody></table>

      <h2>PEA &amp; Bourse</h2>
      <table><tbody>${posRows}</tbody></table>
      <table><tbody><tr><td colspan="2">Cash PEA</td><td style="text-align:right">${eur(bourse?.cash_pocket || 0)}</td></tr></tbody></table>

      <script>window.onload = () => { window.print(); };</script>
    </body>
    </html>
  `);
  win.document.close();
}
