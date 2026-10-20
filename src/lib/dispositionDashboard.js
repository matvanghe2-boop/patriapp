/**
 * Disposition du Dashboard : quels blocs s'affichent, et dans quel ordre.
 *
 * Le Dashboard empile une dizaine de blocs. Tout le monde ne regarde pas les
 * mêmes : on doit pouvoir monter ce qu'on consulte chaque jour et masquer ce
 * qui ne sert pas, sans rien perdre — un bloc masqué se réaffiche d'un clic.
 *
 * La préférence enregistrée ne contient que des identifiants. Elle doit
 * survivre aux évolutions de l'application dans les deux sens :
 *  - un bloc AJOUTÉ après coup n'existe pas dans un ordre enregistré : il
 *    apparaît quand même, à sa place par défaut, au lieu de rester invisible
 *    pour qui a un jour personnalisé son écran ;
 *  - un bloc RETIRÉ laisse un identifiant orphelin : il est ignoré.
 */

export const BLOCS_DASHBOARD = [
  { id: "actions", libelle: "Actions prioritaires" },
  { id: "profil", libelle: "Profil mensuel" },
  { id: "vedette", libelle: "Patrimoine net" },
  { id: "kpis", libelle: "Indicateurs : brut, bourse, épargne" },
  { id: "allocation", libelle: "Allocation et évolution" },
  { id: "cascade", libelle: "Ce qui a fait bouger le patrimoine" },
  { id: "objectifs", libelle: "Objectifs" },
  { id: "passifs", libelle: "Passifs" },
  { id: "echeances", libelle: "Prochaines échéances" },
];

const IDS = BLOCS_DASHBOARD.map((b) => b.id);

export const DISPOSITION_DEFAUT = Object.freeze({ ordre: IDS, masques: [] });

/**
 * Ordre effectif : celui de la préférence pour les blocs qu'elle connaît, et
 * pour les autres, la place qu'ils ont par défaut — juste après le bloc qui
 * les précède dans l'ordre d'origine.
 */
export function ordreEffectif(disposition) {
  const voulu = (Array.isArray(disposition?.ordre) ? disposition.ordre : []).filter(
    (id, i, tous) => IDS.includes(id) && tous.indexOf(id) === i
  );
  const resultat = [...voulu];
  for (const id of IDS) {
    if (resultat.includes(id)) continue;
    let position = 0;
    for (let k = IDS.indexOf(id) - 1; k >= 0; k--) {
      const j = resultat.indexOf(IDS[k]);
      if (j >= 0) {
        position = j + 1;
        break;
      }
    }
    resultat.splice(position, 0, id);
  }
  return resultat;
}

/** Blocs à afficher, dans l'ordre. */
export function blocsVisibles(disposition) {
  const masques = new Set(Array.isArray(disposition?.masques) ? disposition.masques : []);
  return ordreEffectif(disposition).filter((id) => !masques.has(id));
}

export function estMasque(disposition, id) {
  return Array.isArray(disposition?.masques) && disposition.masques.includes(id);
}

/** Monte (sens = -1) ou descend (sens = +1) un bloc d'un cran. */
export function deplacer(disposition, id, sens) {
  const ordre = ordreEffectif(disposition);
  const i = ordre.indexOf(id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= ordre.length) return disposition;
  [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
  return { ...disposition, ordre, masques: disposition?.masques || [] };
}

export function basculerMasque(disposition, id) {
  const masques = Array.isArray(disposition?.masques) ? disposition.masques : [];
  return {
    ...disposition,
    ordre: ordreEffectif(disposition),
    masques: masques.includes(id) ? masques.filter((m) => m !== id) : [...masques, id],
  };
}

export function estParDefaut(disposition) {
  const ordre = ordreEffectif(disposition);
  return ordre.every((id, i) => id === IDS[i]) && !(disposition?.masques || []).length;
}
