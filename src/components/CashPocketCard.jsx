import { useState } from "react";
import { Wallet } from "lucide-react";
import { Card, CardLabel, CARD_THEMES } from "./ui";
import { applyOperationsToBourse, buildCashAdjustment, lireNombre } from "../lib/finance";

/**
 * Poche de liquidités du portefeuille, corrigeable au centime. Sortie de
 * Bourse.jsx.
 */

/**
 * Poche de cash — modifiable à la main. Tout écart est tracé, mais comme un
 * AJUSTEMENT de solde, et non plus comme un versement ou un retrait.
 *
 * La trace reste indispensable : `cash_pocket` est rejoué depuis le journal,
 * une correction non écrite ne tiendrait pas d'un rechargement à l'autre.
 * Mais sa NATURE comptait autant que son existence. En créant un VERSEMENT ou
 * un RETRAIT, l'ancienne version déclarait un mouvement d'argent entre le
 * compte courant et le portefeuille — un flux externe, donc du capital
 * investi en plus ou en moins, et une performance faussée d'autant.
 *
 * Or on corrige son solde presque toujours pour la raison inverse : une
 * vente, un dividende ou des frais qui ne tombaient pas au centime près.
 * Après une vente, recaler le solde créait ainsi un retrait du montant de la
 * vente — l'argent était pourtant toujours là, simplement passé des titres
 * vers le cash.
 *
 * Un vrai versement se saisit désormais depuis Opérations, explicitement.
 *
 * La saisie n'est validée qu'à la sortie du champ (ou sur Entrée) : sinon
 * chaque frappe créerait sa propre écriture.
 */
/**
 * Le solde est rejoué depuis le journal, par additions successives : il porte
 * donc les scories de l'arithmétique flottante (555,8100000000001). Le champ
 * les affichait telles quelles — « 555,810000 » tronqué dans sa case. On
 * l'arrondit au centime pour l'affichage ; l'écart résiduel reste sous le
 * seuil de `buildCashAdjustment`, qui n'écrit donc rien si l'on quitte le
 * champ sans y toucher.
 */
const auCentime = (n) => String(Math.round((Number(n) || 0) * 100) / 100);

export default function CashPocketCard({ bourse, setBourse }) {
  const current = bourse.cash_pocket || 0;
  const [draft, setDraft] = useState(auCentime(current));

  // Resynchronisation du brouillon quand la valeur de référence change
  // (import de relevé, rejeu du journal, arrivée d'une valeur cloud).
  //
  // C'était un effet, qui repeignait donc le champ avec l'ancienne valeur
  // avant de le corriger au rendu suivant. L'ajustement pendant le rendu est
  // le motif documenté par React pour « réagir au changement d'une prop » :
  // le rendu est relancé immédiatement, sans rien afficher entre les deux.
  const [refPrecedente, setRefPrecedente] = useState(current);
  if (current !== refPrecedente) {
    setRefPrecedente(current);
    setDraft(auCentime(current));
  }

  const commit = () => {
    const target = lireNombre(draft);
    if (!Number.isFinite(target)) {
      setDraft(auCentime(current));
      return;
    }
    const movement = buildCashAdjustment(current, target);
    if (!movement) return;
    setBourse((b) => applyOperationsToBourse(b, [movement, ...(b.operations || [])]));
  };

  return (
    <Card accent={CARD_THEMES.violet}>
      <CardLabel icon={Wallet}>Poche cash disponible</CardLabel>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          title="Une correction est enregistrée comme ajustement de solde daté dans le journal d'opérations."
          className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm font-data tabular-nums ghost-blur focus:outline-none focus:border-amber-400/60 focus-visible:ring-2 focus-visible:ring-amber-400/30"
        />
        <span className="text-xs text-slate-500">€</span>
      </div>
      {/* Le libellé annonçait encore « versement ou retrait » : c'était
          l'ancien comportement, celui qui faussait la performance. Une
          correction crée désormais un ajustement de solde. */}
      <p className="text-micro text-slate-500 mt-1">
        Corriger le solde crée un ajustement — un versement se saisit dans Opérations
      </p>
    </Card>
  );
}
