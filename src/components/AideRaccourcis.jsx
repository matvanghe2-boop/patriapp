import { useEffect, useState } from "react";
import Modal from "./Modal";

/**
 * Aide-mémoire des raccourcis clavier.
 *
 * `Ctrl`+`K` existait déjà et n'était annoncé que dans le champ de recherche.
 * Les flèches du calendrier, Échap, la navigation entre sous-onglets : rien
 * n'était découvrable, et un raccourci qu'on ignore n'existe pas.
 *
 * La touche `?` est la convention — c'est aussi le seul endroit où cette liste
 * peut vivre sans encombrer l'interface en permanence.
 *
 * ELLE NE SE DÉCLENCHE PAS PENDANT UNE SAISIE. Sans cette garde, taper un point
 * d'interrogation dans une note de thèse ouvrirait la fenêtre au lieu d'écrire
 * le caractère.
 */
const RACCOURCIS = [
  { touches: ["Ctrl", "K"], quoi: "Ouvrir la palette de commandes" },
  { touches: ["?"], quoi: "Afficher cet aide-mémoire" },
  { touches: ["Échap"], quoi: "Fermer une fenêtre ou annuler une saisie" },
  { touches: ["↑", "↓"], quoi: "Parcourir les résultats de la palette" },
  { touches: ["↵"], quoi: "Ouvrir le résultat sélectionné" },
  { touches: ["←", "→"], quoi: "Changer de sous-onglet, une fois l'un d'eux au focus" },
  { touches: ["↑", "↓", "←", "→"], quoi: "Parcourir le calendrier — jour par jour, semaine par semaine" },
  { touches: ["Entrée"], quoi: "Valider un champ chiffré sans quitter le clavier" },
];

/** Le focus est-il dans un champ de saisie ? */
function enSaisie() {
  const el = document.activeElement;
  if (!el) return false;
  const balise = el.tagName;
  return balise === "INPUT" || balise === "TEXTAREA" || balise === "SELECT" || el.isContentEditable;
}

export default function AideRaccourcis() {
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    const surTouche = (e) => {
      if (e.key !== "?" || enSaisie() || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      setOuvert((o) => !o);
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, []);

  return (
    <Modal
      open={ouvert}
      onClose={() => setOuvert(false)}
      label="Raccourcis clavier"
      showClose
      panelClassName="feuille-bas w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      <div className="p-5 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-lg text-slate-50">Raccourcis</h2>
          <p className="text-mini text-slate-500 mt-0.5">
            La touche <span className="touche">?</span> ouvre et referme cette liste.
          </p>
        </div>

        <dl className="raccourcis-liste">
          {RACCOURCIS.map((r) => (
            <div key={r.quoi} className="contents">
              <dt>{r.quoi}</dt>
              <dd>
                {r.touches.map((t) => (
                  <kbd key={t} className="touche">{t}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}
