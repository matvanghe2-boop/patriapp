/**
 * Extraction du texte positionné d'un PDF, DANS LE NAVIGATEUR.
 *
 * L'import des relevés de courtage envoie le fichier à `/api/parse-pdf`. Un
 * relevé de compte courant est d'une autre sensibilité : noms des personnes
 * avec qui l'on échange de l'argent, lieux, habitudes. Il est donc lu ici, par
 * pdf.js, sans jamais quitter l'appareil — seules les opérations extraites
 * rejoignent ensuite la synchronisation, comme le reste des données.
 *
 * Deux conséquences pratiques : l'import fonctionne hors ligne, et sans
 * `vercel dev` en local.
 *
 * pdf.js pèse lourd (le worker fait plus d'un mégaoctet) : il n'est chargé
 * qu'au premier import, jamais au démarrage de l'application. La version
 * « legacy » est retenue pour les Safari d'iOS un peu anciens.
 */
export async function extrairePagesPdf(fichier) {
  const [pdfjs, { default: urlWorker }] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = urlWorker;

  const donnees = new Uint8Array(await fichier.arrayBuffer());
  // `isEvalSupported: false` : la politique de contenu de la page interdit
  // `eval`, et pdf.js s'en sert sinon pour accélérer le rendu des polices.
  const chargement = pdfjs.getDocument({ data: donnees, isEvalSupported: false });
  try {
    const pdf = await chargement.promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      const page = await pdf.getPage(n);
      const { items } = await page.getTextContent();
      pages.push(
        items
          .filter((it) => typeof it.str === "string" && it.str.trim())
          .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }))
      );
    }
    return pages;
  } finally {
    // C'est la tâche de chargement qui libère le document ET le worker ; le
    // document lui-même n'expose plus `destroy` depuis pdf.js 6.
    await chargement.destroy();
  }
}
