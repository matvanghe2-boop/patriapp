import React, { useMemo } from "react";
import { TrendingUp, Coins, ShoppingCart, TrendingDown, Repeat, Sparkles } from "lucide-react";
import { Card, EmptyState } from "./ui";
import { eur } from "../lib/finance";

const MILESTONE_THRESHOLDS = [
  1000, 5000, 10000, 25000, 50000, 75000, 100000, 150000, 200000, 250000, 500000, 750000, 1000000,
];

function toDate(iso) {
  return new Date(`${iso}T00:00:00`);
}

function relativeLabel(iso) {
  const today = new Date().toISOString().slice(0, 10);
  const diffDays = Math.round((toDate(today) - toDate(iso)) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 14) return "Il y a 1 semaine";
  if (diffDays < 30) return `Il y a ${Math.round(diffDays / 7)} semaines`;
  if (diffDays < 60) return "Il y a 1 mois";
  const d = toDate(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

const EVENT_STYLES = {
  milestone: { icon: Sparkles, color: "#34d399", bg: "bg-emerald-500/10 border-emerald-500/30" },
  ath: { icon: TrendingUp, color: "#34d399", bg: "bg-emerald-500/10 border-emerald-500/30" },
  dividende: { icon: Coins, color: "#22d3ee", bg: "bg-cyan-500/10 border-cyan-500/30" },
  achat: { icon: ShoppingCart, color: "#a78bfa", bg: "bg-violet-500/10 border-violet-500/30" },
  vente: { icon: TrendingDown, color: "#fb7185", bg: "bg-rose-500/10 border-rose-500/30" },
  arbitrage: { icon: Repeat, color: "#fbbf24", bg: "bg-amber-500/10 border-amber-500/30" },
};

/**
 * Construit les événements "jalons" (nouveau sommet historique + paliers
 * ronds franchis) à partir de l'historique de patrimoine (historyPast) et de
 * la valeur actuelle. On reconstitue la série chronologique complète
 * (historique + aujourd'hui), puis on détecte, dans l'ordre, chaque nouveau
 * plus haut et chaque seuil rond franchi à la hausse.
 */
function buildMilestoneEvents(historyPast, patrimoineNet) {
  const today = new Date().toISOString().slice(0, 10);
  const points = [...(historyPast || [])]
    .filter((h) => h.date && Number.isFinite(h.value))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  points.push({ date: today, value: Math.round(patrimoineNet) });

  const events = [];
  let runningMax = -Infinity;
  let crossedThresholds = new Set();

  points.forEach((p, i) => {
    if (i === 0) {
      runningMax = p.value;
      MILESTONE_THRESHOLDS.filter((t) => p.value >= t).forEach((t) => crossedThresholds.add(t));
      return;
    }
    // Nouveau sommet historique
    if (p.value > runningMax) {
      events.push({
        date: p.date,
        kind: "ath",
        title: "Nouveau sommet historique",
        desc: `Ton patrimoine net a atteint ${eur(p.value, 0)}, un nouveau plus haut.`,
        sensitive: true,
      });
      runningMax = p.value;
    }
    // Paliers ronds franchis à la hausse
    MILESTONE_THRESHOLDS.forEach((t) => {
      if (p.value >= t && !crossedThresholds.has(t)) {
        crossedThresholds.add(t);
        events.push({
          date: p.date,
          kind: "milestone",
          title: `Cap des ${eur(t, 0)} franchi`,
          desc: `Ton patrimoine net a dépassé ${eur(t, 0)} pour la première fois.`,
          sensitive: false,
        });
      }
    });
  });

  return events;
}

/**
 * Construit les événements liés aux opérations (dividendes, achats, ventes,
 * arbitrages). Un arbitrage est détecté quand, à la même date, une vente et
 * un achat portent sur des actifs différents — on les regroupe alors en un
 * seul événement plutôt que deux entrées séparées.
 */
function buildOperationEvents(operations) {
  const events = [];
  const byDate = new Map();
  (operations || []).forEach((op) => {
    if (!op.date) return;
    if (!byDate.has(op.date)) byDate.set(op.date, []);
    byDate.get(op.date).push(op);
  });

  byDate.forEach((ops, date) => {
    const divs = ops.filter((o) => o.type === "DIVIDENDE");
    divs.forEach((d) => {
      events.push({
        date,
        kind: "dividende",
        title: `Dividende reçu — ${d.asset}`,
        desc: `+${eur(d.amount ?? d.montantNet ?? 0, 2)} versés par ${d.asset}. Ce cash est disponible pour être réinvesti.`,
        sensitive: true,
      });
    });

    const sells = ops.filter((o) => o.type === "VENTE");
    const buys = ops.filter((o) => o.type === "ACHAT");
    const sellAssets = new Set(sells.map((o) => o.asset));
    const buyAssets = new Set(buys.map((o) => o.asset));
    const isArbitrage = sells.length > 0 && buys.length > 0 && [...sellAssets].some((a) => !buyAssets.has(a));

    if (isArbitrage) {
      const sellLabel = sells.map((o) => `${o.quantity} ${o.asset}`).join(", ");
      const buyLabel = buys.map((o) => `${o.quantity} ${o.asset}`).join(", ");
      events.push({
        date,
        kind: "arbitrage",
        title: "Arbitrage stratégique",
        desc: `Vente de ${sellLabel} pour acheter ${buyLabel}, le même jour.`,
        sensitive: true,
      });
      return;
    }

    sells.forEach((o) => {
      events.push({
        date,
        kind: "vente",
        title: `Vente — ${o.asset}`,
        desc: `Vente de ${o.quantity} actions ${o.asset} au cours de ${eur(o.price, 2)}.`,
        sensitive: true,
      });
    });
    buys.forEach((o) => {
      events.push({
        date,
        kind: "achat",
        title: `Renforcement — ${o.asset}`,
        desc: `Achat de ${o.quantity} actions ${o.asset} au cours de ${eur(o.price, 2)}.`,
        sensitive: true,
      });
    });
  });

  return events;
}

export default function Timeline({ bourse, historyPast, patrimoineNet, epargneMensuelle, tauxEpargne }) {
  const events = useMemo(() => {
    const milestoneEvents = buildMilestoneEvents(historyPast, patrimoineNet);
    const opEvents = buildOperationEvents(bourse?.operations);
    const all = [...milestoneEvents, ...opEvents];
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return all;
  }, [historyPast, patrimoineNet, bourse]);

  return (
    <div className="flex flex-col gap-4">
      {epargneMensuelle != null && (
        <Card>
          <p className="text-sm text-slate-300">
            💡 Ce mois-ci, ton effort d'épargne représente <span className="font-data font-semibold text-emerald-400">{eur(epargneMensuelle, 0)}</span>
            {tauxEpargne != null && (
              <> soit <span className="font-data font-semibold text-emerald-400">{tauxEpargne.toFixed(0)}%</span> de tes revenus.</>
            )}
          </p>
        </Card>
      )}

      <Card>
        {events.length === 0 ? (
          <EmptyState>
            Aucun événement pour l'instant — les jalons de patrimoine, dividendes reçus et arbitrages apparaîtront ici automatiquement au fil de tes opérations.
          </EmptyState>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-[9px] top-1 bottom-1 w-px bg-slate-800" />
            <div className="flex flex-col gap-5">
              {events.map((ev, i) => {
                const style = EVENT_STYLES[ev.kind] || EVENT_STYLES.milestone;
                const Icon = style.icon;
                return (
                  <div key={i} className="relative">
                    <span
                      className="absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-950"
                      style={{ background: style.color }}
                    >
                      <Icon size={11} className="text-slate-950" strokeWidth={2.5} />
                    </span>
                    <div className={`rounded-xl border px-4 py-3 ${style.bg}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-semibold text-slate-100">{ev.title}</span>
                        <span className="text-[11px] text-slate-500 shrink-0">{relativeLabel(ev.date)}</span>
                      </div>
                      <p className={`text-sm text-slate-400 ${ev.sensitive ? "ghost-blur" : ""}`}>{ev.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
