import { useEffect, useMemo, useState } from "react";
import { Sprout } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from "recharts";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { nombre, pct } from "../lib/finance";
import { fetchHistory } from "../lib/api";
import { dividendesParAnnee, lireHistoriqueDividendes } from "../lib/historiqueDividendes";
import { useMaintenant } from "../lib/useMaintenant";

/**
 * Le dividende par action sur dix ans : croissance, régularité, coupures.
 *
 * Le suivi des dividendes du portefeuille ne montre que ce qui a été encaissé
 * depuis l'achat ; avant d'acheter, c'est l'histoire de la société qui
 * compte — a-t-elle tenu son dividende en 2020 ?
 */

const COULEURS = { normal: "#34d399", baisse: "#fb7185", atypique: "#475569", enCours: "#34d39955" };

function Infobulle({ active, payload, devise }) {
  if (!active || !payload?.length) return null;
  const e = payload[0]?.payload;
  if (!e) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-2 text-micro shadow-xl max-w-[16rem]">
      <div className="text-slate-300">
        {e.annee}
        {e.enCours ? " — année en cours" : ""}
      </div>
      <div className="font-data tabular-nums text-slate-100">
        {nombre(e.montant, 2)} {devise} par action · {e.versements} versement{e.versements > 1 ? "s" : ""}
      </div>
      {e.exceptionnel > 0 && (
        <div className="text-amber-300">+ {nombre(e.exceptionnel, 2)} {devise} exceptionnel, mis à part</div>
      )}
      {e.atypique && (
        <div className="text-slate-400">Montant incohérent avec les années voisines : donnée source douteuse, hors calculs.</div>
      )}
    </div>
  );
}

export default function DividendesLongTerme({ symbole, devise = "" }) {
  const [detachements, setDetachements] = useState(null);
  const maintenant = useMaintenant();
  const aujourdhui = new Date(maintenant).toISOString().slice(0, 10);

  useEffect(() => {
    if (!symbole) return undefined;
    let annule = false;
    // Effet de CHARGEMENT : les détachements du titre précédent ne doivent pas
    // rester affichés pendant la requête.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetachements(null);
    fetchHistory([symbole], "max", "1mo", { dividendes: true })
      .then((r) => {
        if (!annule) setDetachements(r?.[0]?.ok ? r[0].dividendes || [] : []);
      })
      .catch(() => {
        if (!annule) setDetachements([]);
      });
    return () => {
      annule = true;
    };
  }, [symbole]);

  const { annees } = useMemo(() => dividendesParAnnee(detachements || [], { aujourdhui }), [detachements, aujourdhui]);
  const lecture = useMemo(() => lireHistoriqueDividendes(annees), [annees]);

  // Rien tant que rien n'est chargé, et rien pour un titre qui ne verse pas :
  // la fiche « Dividende » dit déjà que le rendement est nul.
  if (!detachements || !lecture) return null;

  const baisses = new Set(lecture.baisses.map((b) => b.annee));
  const couleur = (e) => (e.enCours ? COULEURS.enCours : e.atypique ? COULEURS.atypique : baisses.has(e.annee) ? COULEURS.baisse : COULEURS.normal);
  const derniereBaisse = lecture.baisses.at(-1);

  return (
    <Card accent={CARD_THEMES.emerald}>
      <CardLabel icon={Sprout}>Le dividende sur dix ans</CardLabel>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
        <Chiffre libelle={`Dividende ${lecture.derniere.annee}`} valeur={`${nombre(lecture.derniere.montant, 2)} ${devise}`} />
        <Chiffre libelle="Croissance / an sur 5 ans" valeur={lecture.croissance5ansPct != null ? pct(lecture.croissance5ansPct, 1) : "—"} />
        <Chiffre libelle="Croissance / an sur 10 ans" valeur={lecture.croissance10ansPct != null ? pct(lecture.croissance10ansPct, 1) : "—"} />
        <Chiffre
          libelle="Années sans baisse"
          valeur={lecture.sansBaisseDepuisLeDebut ? `≥ ${lecture.anneesSansBaisse}` : String(lecture.anneesSansBaisse)}
          sous={lecture.sansBaisseDepuisLeDebut ? `aucune baisse depuis ${lecture.premiereAnnee}` : derniereBaisse ? `dernière baisse : ${derniereBaisse.annee} (${pct(derniereBaisse.variationPct, 0)})` : null}
        />
      </div>

      <div style={{ height: 180 }} className="mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={annees} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgb(var(--c-slate-800))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="annee" tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "rgb(var(--c-slate-500))", fontSize: 10 }} axisLine={false} tickLine={false} width={34} tickFormatter={(v) => nombre(v, 1)} />
            <Tooltip content={<Infobulle devise={devise} />} cursor={{ fill: "rgba(148,163,184,0.08)" }} />
            <Bar dataKey="montant" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {annees.map((e) => (
                <Cell key={e.annee} fill={couleur(e)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-micro text-slate-500 mt-2">
        Dividende par action détaché chaque année, ajusté des divisions d&apos;actions. En rouge, une baisse ; en clair,
        l&apos;année en cours, incomplète et jamais comptée.
        {lecture.atypiques.length > 0 &&
          ` En gris, ${lecture.atypiques.join(", ")} : montant incohérent avec les années voisines, probablement une erreur de la source, laissé hors des calculs.`}
        {annees.some((e) => e.exceptionnel > 0) && " Les dividendes exceptionnels sont mis à part : ils ne font ni une hausse ni, l'année suivante, une baisse."}
      </p>
    </Card>
  );
}

function Chiffre({ libelle, valeur, sous }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-micro uppercase tracking-wide text-slate-500">{libelle}</div>
      <div className="font-display text-base text-slate-100 mt-0.5 font-data tabular-nums">{valeur}</div>
      {sous && <div className="text-micro text-slate-500 mt-0.5">{sous}</div>}
    </div>
  );
}
