import { useEffect, useState } from "react";
import { Thermometer } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { fetchHistory } from "../lib/api";
import { INDEX_CONSTITUENTS } from "../lib/indexConstituents";
import { lectureVix, rangPct, ampleur, reculDepuisPlusHaut, SEMAINES_MOYENNE } from "../lib/thermometre";
import { nombre, pct, pctPlain } from "../lib/finance";

/**
 * L'humeur du marché en trois mesures, sans prévision : la nervosité (VIX),
 * l'ampleur de la hausse sur le CAC 40, et le recul des indices depuis leur
 * plus haut. Ce qu'elles disent de l'avenir, personne ne le sait ; ce
 * qu'elles disent du présent est mesuré.
 */

const TONS_VIX = { calme: "text-emerald-400", normal: "text-slate-200", nerveux: "text-amber-300", tension: "text-rose-400" };
const dateCourte = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export default function ThermometreMarche() {
  const [mesures, setMesures] = useState(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    let annule = false;
    Promise.all([
      fetchHistory(["^VIX"], "5y", "1wk"),
      fetchHistory(["^FCHI", "^GSPC"], "10y", "1wk"),
      fetchHistory(INDEX_CONSTITUENTS.cac40, "1y", "1wk"),
    ])
      .then(([vix, indices, cac]) => {
        if (annule) return;
        const serieVix = vix?.[0]?.ok ? vix[0].series : [];
        const niveau = serieVix.at(-1)?.close ?? null;
        const parIndice = Object.fromEntries((indices || []).filter((r) => r.ok).map((r) => [r.symbol, reculDepuisPlusHaut(r.series)]));
        setMesures({
          vix: niveau != null ? { niveau, lecture: lectureVix(niveau), rang: rangPct(niveau, serieVix.map((b) => b.close)) } : null,
          ampleur: ampleur((cac || []).filter((r) => r.ok)),
          cac: parIndice["^FCHI"] ?? null,
          sp500: parIndice["^GSPC"] ?? null,
        });
      })
      .catch(() => {
        if (!annule) setErreur("Mesures du marché indisponibles pour le moment.");
      });
    return () => {
      annule = true;
    };
  }, []);

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={Thermometer}>Thermomètre du marché</CardLabel>
      {erreur ? (
        <p className="text-micro text-amber-300/90 mt-1">{erreur}</p>
      ) : !mesures ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton rounded-xl" style={{ height: 84 }} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
            <Mesure
              titre="Volatilité attendue (VIX)"
              valeur={mesures.vix ? nombre(mesures.vix.niveau, 1) : "—"}
              ton={mesures.vix ? TONS_VIX[mesures.vix.lecture.etat] : ""}
              sous={mesures.vix ? `${mesures.vix.lecture.libelle} · plus haut que ${pctPlain(mesures.vix.rang, 0)} des semaines depuis 5 ans` : null}
            />
            <Mesure
              titre={`CAC 40 au-dessus de sa moyenne ${SEMAINES_MOYENNE} sem.`}
              valeur={mesures.ampleur ? `${mesures.ampleur.auDessus} / ${mesures.ampleur.total}` : "—"}
              ton={!mesures.ampleur ? "" : mesures.ampleur.pct >= 60 ? "text-emerald-400" : mesures.ampleur.pct <= 40 ? "text-rose-400" : "text-slate-200"}
              sous={mesures.ampleur ? `${pctPlain(mesures.ampleur.pct, 0)} des valeurs : ${mesures.ampleur.pct >= 60 ? "hausse large" : mesures.ampleur.pct <= 40 ? "hausse étroite ou baisse générale" : "marché partagé"}` : null}
            />
            <Recul titre="CAC 40 depuis son plus haut" mesure={mesures.cac} />
            <Recul titre="S&P 500 depuis son plus haut" mesure={mesures.sp500} />
          </div>
          <p className="text-micro text-slate-500 mt-3">
            VIX : paliers d&apos;usage (calme sous 15, nerveux au-delà de 20, tension au-delà de 30). Moyenne de {SEMAINES_MOYENNE}{" "}
            semaines ≈ moyenne de 200 séances. Plus hauts : clôtures hebdomadaires des dix dernières années. Une photographie du
            présent, pas une prévision.
          </p>
        </>
      )}
    </Card>
  );
}

function Mesure({ titre, valeur, ton = "", sous }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 min-w-0">
      <div className="text-micro uppercase tracking-wide text-slate-500 leading-snug">{titre}</div>
      <div className={`font-display text-xl font-data tabular-nums mt-1 ${ton || "text-slate-100"}`}>{valeur}</div>
      {sous && <div className="text-micro text-slate-500 mt-0.5 leading-snug">{sous}</div>}
    </div>
  );
}

function Recul({ titre, mesure }) {
  if (!mesure) return <Mesure titre={titre} valeur="—" />;
  const auPlusHaut = mesure.reculPct > -0.5;
  return (
    <Mesure
      titre={titre}
      valeur={auPlusHaut ? "au plus haut" : pct(mesure.reculPct, 1)}
      ton={auPlusHaut ? "text-emerald-400" : mesure.reculPct <= -20 ? "text-rose-400" : mesure.reculPct <= -10 ? "text-amber-300" : "text-slate-200"}
      sous={`plus haut ${nombre(mesure.plusHaut, 0)} le ${dateCourte(mesure.date)}`}
    />
  );
}
