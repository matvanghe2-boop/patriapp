/**
 * Relevé BoursoBank FACTICE, sous la forme où pdf.js le restitue : des
 * fragments de texte positionnés, page par page.
 *
 * Les abscisses et la mise en page reproduisent un vrai relevé (colonnes
 * Débit / Crédit alignées à droite, compléments en retrait, mentions légales
 * en pied de page, en-tête de tableau répété en page 2). Les noms, montants
 * et numéros sont inventés.
 */

const LARGEUR_CAR = 4.8;
const fragment = (x, y, str) => ({ str, x, y, w: str.length * LARGEUR_CAR });
// Montants alignés à droite sous leur colonne, comme sur le document.
const debit = (y, str) => ({ str, x: 479.3 - str.length * LARGEUR_CAR, y, w: str.length * LARGEUR_CAR });
const credit = (y, str) => ({ str, x: 546 - str.length * LARGEUR_CAR, y, w: str.length * LARGEUR_CAR });

function enteteTableau(y) {
  return [
    fragment(46.2, y + 6.6, "Date"),
    fragment(94.8, y, "Libellé"),
    fragment(381, y, "Valeur"),
    fragment(441.6, y, "Débit"),
    fragment(506.4, y, "Crédit"),
    fragment(46.2, y - 6, "opération"),
  ];
}

function enteteCompte(y, page) {
  return [
    fragment(46.2, y + 23, "Date"),
    fragment(94.2, y + 23, "N° de RIB"),
    fragment(45.6, y, "30/05/2026"),
    fragment(96.6, y, "40618"),
    fragment(130.2, y, "80479"),
    fragment(166.2, y, "00012345678"),
    fragment(236.4, y, "44"),
    fragment(265.8, y, "EUR"),
    fragment(295.2, y, "du 01/05/2026 au 29/05/2026"),
    fragment(531, y, `${page}/2`),
    fragment(378, y - 63, "MOUVEMENTS EN EUR"),
  ];
}

const PIED = [
  fragment(82.8, 97, "A réception d'un extrait de compte vous disposez d'un délai de quatre mois"),
  fragment(84.6, 62, "Boursorama - SA au capital de 53 576 889,20 € - RCS Nanterre"),
  fragment(137.4, 53, "44 rue Traversière - CS 80134 - 92772 Boulogne Billancourt Cedex"),
];

export function pagesReleveFactice({ montantCarte = "12,50" } = {}) {
  const page1 = [
    fragment(320.4, 800, "Extrait de votre compte en EUR"),
    fragment(322.2, 780, "BOURSOBANK"),
    fragment(320.4, 644, "M"),
    fragment(336, 644, "MARTIN PAUL"),
    fragment(320.4, 632, "1 RUE DES LILAS"),
    ...enteteCompte(515, 1),
    ...enteteTableau(427),
    fragment(327, 405, "SOLDE AU :"),
    fragment(375, 405, "30/04/2026"),
    credit(405, "2.000,00"),

    // Libellé coupé au milieu du nom : « MARTINE » + « LLI ».
    fragment(45.6, 371, "04/05/2026"),
    fragment(94.8, 371, "VIR Virement train Jean MARTINE"),
    fragment(375, 371, "04/05/2026"),
    credit(371, "20,00"),
    fragment(112.2, 360, "LLI"),
    fragment(112.2, 348, "MARTINELLI"),

    fragment(46.2, 314, "05/05/2026"),
    fragment(94.8, 314, "VIR Virement depuis BoursoBank"),
    fragment(375, 314, "05/05/2026"),
    debit(314, "1.000,00"),
    fragment(112.2, 302, "MARTIN PAUL"),
    fragment(112.2, 290, "Rèf : SCT406182026050500611111111"),

    fragment(45.6, 267, "06/05/2026"),
    fragment(94.8, 267, "CARTE 05/05/26 CARREFOUR CITY"),
    fragment(230, 267, "CB*1234"),
    fragment(375, 267, "06/05/2026"),
    debit(267, montantCarte),

    fragment(46.2, 221, "18/05/2026"),
    fragment(94.8, 221, "VIR SEPA MME"),
    fragment(153.6, 221, "CLAIRE PETIT"),
    fragment(375, 221, "18/05/2026"),
    credit(221, "100,00"),
    fragment(112.2, 209, "aide week end"),
    fragment(112.2, 198, "Vir. de MME CLAIRE PETIT"),
    fragment(112.2, 186, "Rèf ABC123"),
    ...PIED,
  ];

  const page2 = [
    ...enteteCompte(710, 2),
    ...enteteTableau(633.6),
    // Même jour, même montant, même personne que la dernière opération de la
    // page 1 : c'est un SECOND virement, pas une répétition.
    fragment(46.2, 615, "18/05/2026"),
    fragment(94.8, 615, "VIR SEPA MME"),
    fragment(153.6, 615, "CLAIRE PETIT"),
    fragment(375, 615, "18/05/2026"),
    credit(615, "100,00"),
    fragment(112.2, 603.6, "Virement de MME CLAIRE PETIT"),
    fragment(112.2, 580, "Rèf XYZ789"),

    fragment(46.2, 534, "18/05/2026"),
    fragment(94.8, 534, "PRLV SEPA BASIC FIT FRANCE"),
    fragment(375, 534, "18/05/2026"),
    debit(534, "35,92"),
    fragment(112.2, 522.6, "19-05-2026 / 15-06-2026"),
    fragment(112.2, 511.2, "GT025046302441720AE"),
    fragment(112.2, 499.2, "RUM 210006499"),

    fragment(46.2, 337, "25/05/2026"),
    fragment(94.8, 337, "VIR INST WINAMAX"),
    fragment(375, 337, "24/05/2026"),
    debit(337, "20,00"),
    fragment(112.2, 325.8, "S0IA1GPGAI2ENF4O9A"),

    fragment(46.2, 268, "27/05/2026"),
    fragment(94.8, 268, "CARTE 26/05/26 PHARMACIE DU CENTRE"),
    fragment(260, 268, "CB*1234"),
    fragment(375, 268, "27/05/2026"),
    debit(268, "1.234,56"),

    // Le montant du nouveau solde est un point plus haut que son libellé,
    // comme sur le vrai document. Solde négatif : il est en colonne Débit.
    fragment(145.2, 150.6, "Nouveau solde en EUR :"),
    debit(151.6, "82,98"),
    fragment(145.2, 137.4, "Montant frais bancaires* :"),
    debit(142.8, "0,00"),
    credit(142.8, "0,00"),
    ...PIED,
  ];

  return [page1, page2];
}
