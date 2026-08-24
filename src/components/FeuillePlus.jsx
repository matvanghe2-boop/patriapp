import Modal from "./Modal";

/**
 * Feuille « Plus » de la barre de navigation basse.
 *
 * Deux problèmes réglés d'un coup :
 *
 *  1. **La barre était à six entrées.** Sur un téléphone standard cela donne
 *     des cibles de 62 px, étiquette comprise, et le dernier libellé était déjà
 *     tronqué. Quatre sections directes plus cette feuille ramènent les cibles
 *     à 78 px.
 *  2. **Les réglages et la rétrospective étaient inatteignables sur mobile.**
 *     Leurs boutons vivent dans la barre latérale, masquée sous 768 px. Ils
 *     n'existaient donc que sur ordinateur, sans que rien ne le signale.
 *
 * La feuille monte depuis le bas (voir `.feuille-bas` dans index.css) : c'est
 * la convention mobile, et la seule zone atteignable d'une main sur un grand
 * téléphone.
 */
export default function FeuillePlus({ ouvert, onFermer, sections = [], actions = [], onNaviguer, actif }) {
  return (
    <Modal
      open={ouvert}
      onClose={onFermer}
      label="Plus"
      panelClassName="feuille-bas w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
    >
      <div className="p-4 pb-6 flex flex-col gap-5">
        {sections.length > 0 && (
          <section>
            <h2 className="text-micro uppercase tracking-wider text-slate-500 mb-2">Sections</h2>
            <div className="grid grid-cols-2 gap-2">
              {sections.map((s) => (
                <button
                  key={s.key}
                  onClick={() => {
                    onNaviguer?.(s.key);
                    onFermer?.();
                  }}
                  aria-current={actif === s.key ? "page" : undefined}
                  className={`btn-flash flex items-center gap-2.5 rounded-xl border px-3 py-3 text-corps text-left transition-colors ${
                    actif === s.key
                      ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                      : "border-slate-700 text-slate-300 hover:border-slate-600 hover:text-slate-100"
                  }`}
                >
                  <s.icon size={17} aria-hidden="true" className="shrink-0" />
                  {s.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {actions.length > 0 && (
          <section>
            <h2 className="text-micro uppercase tracking-wider text-slate-500 mb-2">Actions</h2>
            <div className="flex flex-col">
              {actions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    a.executer?.();
                    onFermer?.();
                  }}
                  className="btn-flash flex items-center gap-3 rounded-lg px-2 py-3 text-corps text-slate-300 hover:text-slate-100 hover:bg-slate-800/50 text-left"
                >
                  {a.icone && <a.icone size={16} aria-hidden="true" className="shrink-0 text-slate-500" />}
                  {a.libelle}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
