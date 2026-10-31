/**
 * Catalogue de la notion du jour : le texte seul, rangé par thème.
 *
 * Chaque notion a une définition courte (deux ou trois phrases) et un exemple
 * générique aux chiffres ronds, vérifiables à la main. Les exemples calculés
 * sur le patrimoine de l'utilisateur vivent à part, dans `notionDuJour.js`,
 * repérés par l'identifiant de la notion.
 *
 * Les montants qui changent souvent (taux du Livret A, taux des prélèvements
 * sociaux…) ne sont volontairement PAS écrits ici : un texte figé les aurait
 * rendus faux à la révision suivante, sans que rien ne le signale. Les
 * plafonds et les règles stables, eux, le sont.
 */

export const THEMES_NOTIONS = [
  {
    id: "bases",
    libelle: "Bourse : les bases",
    notions: [
      {
        id: "action",
        titre: "Action",
        definition:
          "Un titre de propriété sur une petite part d'une entreprise. Il donne droit à une part des bénéfices, sous forme de dividendes quand elle en verse, et en général à un droit de vote en assemblée générale.",
        generique: "Une société est divisée en 1 million d'actions : avec 100 actions, tu en possèdes 0,01 %.",
      },
      {
        id: "pru",
        titre: "Prix de revient unitaire (PRU)",
        definition:
          "Le prix moyen payé pour chaque titre, frais d'achat compris. Quand tu renforces une ligne, le PRU devient la moyenne de tes achats. Comparé au cours, il dit si la ligne est en plus-value ou en moins-value.",
        generique:
          "Tu achètes 10 titres à 50 €, puis 10 à 40 € : ton PRU est de 45 €. Si le cours remonte à 48 €, la ligne est en plus-value de 3 € par titre.",
      },
      {
        id: "plus-value-latente",
        titre: "Plus-value latente ou réalisée",
        definition:
          "Une plus-value est latente tant que tu n'as pas vendu : elle existe sur le papier et peut encore fondre. Elle devient réalisée au moment de la vente.",
        generique:
          "Tu as acheté pour 1 000 € d'un ETF qui en vaut aujourd'hui 1 150 € : 150 € de plus-value latente. Si tu vends, ces 150 € deviennent une plus-value réalisée.",
      },
      {
        id: "capitalisation-boursiere",
        titre: "Capitalisation boursière",
        definition:
          "Le cours de l'action multiplié par le nombre d'actions : la valeur que la bourse donne à toute l'entreprise. C'est elle qui classe les sociétés en grandes, moyennes ou petites capitalisations.",
        generique: "500 millions d'actions à 40 € : une capitalisation de 20 milliards d'euros.",
      },
      {
        id: "dividende",
        titre: "Dividende",
        definition:
          "La part du bénéfice qu'une société reverse à ses actionnaires, le plus souvent une fois par an en France. Il n'est jamais garanti : la société peut le baisser ou le supprimer d'une année sur l'autre.",
        generique: "Une société verse 2 € par action : avec 50 actions, tu touches 100 € brut.",
      },
      {
        id: "detachement-dividende",
        titre: "Détachement du dividende",
        definition:
          "Le jour du détachement, le cours baisse d'environ le montant du dividende : cette valeur quitte la société pour aller chez l'actionnaire. Il faut détenir l'action la veille au soir pour le toucher.",
        generique:
          "Une action à 50 € détache un dividende de 2 € : elle ouvre aux alentours de 48 €, et les 2 € arrivent sur ton compte quelques jours plus tard.",
      },
      {
        id: "indice-boursier",
        titre: "Indice boursier",
        definition:
          "Un panier de sociétés suivi comme un seul nombre, pour mesurer la tendance d'un marché. Le CAC 40 regroupe 40 grandes sociétés françaises, pondérées par leur taille en bourse.",
        generique: "Si le CAC 40 passe de 8 000 à 8 080 points, il a pris 1 % sur la séance.",
      },
      {
        id: "indice-dividendes-reinvestis",
        titre: "Indice dividendes réinvestis",
        definition:
          "Le CAC 40 que l'on cite partout ne compte pas les dividendes : chaque détachement le fait baisser. Sa version « dividendes réinvestis » (GR) les ajoute, et c'est elle qu'il faut comparer à un portefeuille ou à un ETF capitalisant.",
        generique: "Avec environ 3 % de dividendes par an, l'écart entre les deux versions dépasse 30 % au bout de 10 ans.",
      },
      {
        id: "flottant",
        titre: "Flottant",
        definition:
          "La part des actions réellement échangée en bourse, hors blocs détenus durablement par un fondateur, une famille ou un État. Un faible flottant peut rendre l'action moins liquide et plus agitée.",
        generique: "Si une famille garde 60 % du capital, le flottant n'est que de 40 %.",
      },
      {
        id: "introduction-bourse",
        titre: "Introduction en bourse",
        definition:
          "La première cotation d'une société : elle vend des actions au public pour lever des fonds, ou pour permettre à ses actionnaires de céder une partie de leurs titres.",
        generique:
          "Une société s'introduit à 20 € par action. Dès le premier jour, c'est l'offre et la demande qui fixent le cours, qui peut s'éloigner fortement de ce prix.",
      },
      {
        id: "division-action",
        titre: "Division d'action",
        definition:
          "Une action est divisée en plusieurs : le nombre de titres augmente et le cours baisse d'autant. Ta ligne vaut exactement la même chose, rien n'est gagné ni perdu.",
        generique: "Division par 4 : tes 10 actions à 400 € deviennent 40 actions à 100 €, toujours 4 000 €.",
      },
      {
        id: "rachat-actions",
        titre: "Rachat d'actions",
        definition:
          "La société rachète ses propres actions en bourse, puis les annule souvent. Le bénéfice se répartit alors sur moins d'actions : chaque action restante représente une part un peu plus grande de l'entreprise.",
        generique: "Une société annule 5 % de ses actions : à bénéfice égal, le bénéfice par action augmente d'environ 5,3 %.",
      },
      {
        id: "dilution",
        titre: "Dilution",
        definition:
          "Quand une société émet de nouvelles actions, chaque actionnaire détient une part plus petite de l'entreprise, sauf s'il participe à l'émission.",
        generique: "Tu détiens 1 % d'une société qui double son nombre d'actions sans que tu suives : tu n'en détiens plus que 0,5 %.",
      },
      {
        id: "opa",
        titre: "OPA",
        definition:
          "Une offre publique d'achat : une entreprise propose à tous les actionnaires d'une autre de leur racheter leurs actions à un prix fixé, en général supérieur au cours. Chaque actionnaire choisit d'apporter ou non ses titres.",
        generique: "Une société cotée 30 € fait l'objet d'une OPA à 39 € : la prime est de 30 %.",
      },
      {
        id: "croissance-value",
        titre: "Croissance ou « value »",
        definition:
          "Une action de croissance s'achète pour ses bénéfices futurs : elle se paie cher par rapport à ses bénéfices actuels. Une action « value » se paie peu cher, souvent parce que son activité grandit lentement ou traverse une passe difficile.",
        generique:
          "Une société technologique avec un PER de 40 est typiquement une valeur de croissance ; une banque avec un PER de 8, une valeur « value ».",
      },
      {
        id: "cyclique-defensive",
        titre: "Valeur cyclique ou défensive",
        definition:
          "Les bénéfices d'une valeur cyclique (automobile, luxe, matériaux) suivent la conjoncture : forte hausse en reprise, chute en récession. Une valeur défensive (santé, alimentation, services publics) vend ce dont on a besoin quoi qu'il arrive.",
        generique: "En récession, on continue d'acheter du dentifrice, mais on reporte l'achat d'une voiture.",
      },
    ],
  },
  {
    id: "analyse",
    libelle: "Analyse d'entreprise",
    notions: [
      {
        id: "per",
        titre: "PER (price earnings ratio)",
        definition:
          "Le cours d'une action divisé par son bénéfice par action : combien d'années de bénéfices actuels tu paies. Un PER élevé veut dire que le marché attend une forte croissance, ou que l'action est chère. Il se compare surtout entre sociétés d'un même secteur.",
        generique: "Une action à 100 € pour 5 € de bénéfice par action a un PER de 20 : tu paies 20 ans de bénéfices actuels.",
      },
      {
        id: "rendement-dividende",
        titre: "Rendement du dividende",
        definition:
          "Le dividende annuel divisé par le cours de l'action. Un rendement très élevé n'est pas forcément une bonne affaire : il peut venir d'un cours qui a chuté. Le rendement sur PRU, lui, mesure ce que la ligne rapporte par rapport à ton prix d'achat.",
        generique:
          "Une action à 100 € qui verse 4 € par an a un rendement de 4 %. Si tu l'as achetée 80 €, elle te rapporte 5 % de ton prix d'achat.",
      },
      {
        id: "bpa",
        titre: "Bénéfice par action (BPA)",
        definition:
          "Le bénéfice net de la société divisé par son nombre d'actions : ce qui revient, en théorie, à chaque action sur une année, qu'il soit distribué ou non.",
        generique: "1 milliard d'euros de bénéfice pour 200 millions d'actions : un BPA de 5 €.",
      },
      {
        id: "marge-nette",
        titre: "Marge nette",
        definition:
          "La part du chiffre d'affaires qui reste en bénéfice une fois toutes les charges payées. Elle dit si l'entreprise gagne vraiment de l'argent sur ce qu'elle vend.",
        generique: "10 milliards de chiffre d'affaires et 800 millions de bénéfice net : une marge nette de 8 %.",
      },
      {
        id: "ebitda",
        titre: "EBITDA",
        definition:
          "Le résultat avant intérêts, impôts, dépréciations et amortissements : ce que rapporte l'activité elle-même, avant les choix de financement. Pratique pour comparer, mais il ignore le coût réel des investissements.",
        generique: "Une entreprise peut afficher un bel EBITDA et perdre de l'argent si ses machines doivent être renouvelées sans cesse.",
      },
      {
        id: "flux-tresorerie-disponible",
        titre: "Flux de trésorerie disponible",
        definition:
          "L'argent réellement généré une fois payées les dépenses d'exploitation et les investissements. C'est lui qui finance les dividendes, les rachats d'actions et le remboursement de la dette.",
        generique: "3 milliards de trésorerie d'exploitation moins 1 milliard d'investissements : 2 milliards de flux disponible.",
      },
      {
        id: "dette-nette",
        titre: "Dette nette",
        definition:
          "Les dettes financières moins la trésorerie disponible. Rapportée à l'EBITDA, elle dit en combien d'années l'entreprise pourrait rembourser : au-delà de 3 ans, on commence souvent à surveiller.",
        generique: "5 milliards de dette, 1 milliard de trésorerie et 2 milliards d'EBITDA : une dette nette de 4 milliards, soit 2 années d'EBITDA.",
      },
      {
        id: "roe",
        titre: "Rentabilité des capitaux propres (ROE)",
        definition:
          "Le bénéfice divisé par les capitaux propres : ce que la société rapporte sur l'argent apporté et laissé par ses actionnaires. Un ROE élevé et stable signe souvent une entreprise de qualité, s'il ne vient pas d'une dette excessive.",
        generique: "2 milliards de bénéfice pour 10 milliards de capitaux propres : un ROE de 20 %.",
      },
      {
        id: "taux-distribution",
        titre: "Taux de distribution",
        definition:
          "La part du bénéfice versée en dividendes. Un taux proche ou au-dessus de 100 % signale un dividende fragile : la société distribue plus qu'elle ne gagne.",
        generique: "BPA de 5 € et dividende de 2 € : un taux de distribution de 40 %.",
      },
      {
        id: "rendement-beneficiaire",
        titre: "Rendement bénéficiaire",
        definition:
          "L'inverse du PER : le bénéfice par action divisé par le cours. Il se compare directement au taux d'une obligation ou d'un livret.",
        generique: "Un PER de 20 correspond à un rendement bénéficiaire de 5 %.",
      },
      {
        id: "peg",
        titre: "PEG",
        definition:
          "Le PER divisé par la croissance annuelle attendue des bénéfices, en %. Il corrige le PER : une société chère mais qui croît vite peut avoir un PEG raisonnable. Autour de 1, on parle souvent de prix « juste ».",
        generique: "PER de 30 et bénéfices attendus en hausse de 15 % par an : un PEG de 2.",
      },
      {
        id: "price-to-book",
        titre: "Price to book (P/B)",
        definition:
          "Le cours divisé par les capitaux propres par action, c'est-à-dire la valeur comptable. Sous 1, la bourse valorise la société moins que ce que disent ses comptes, ce qui est fréquent pour les banques.",
        generique: "Capitaux propres de 50 € par action et cours de 40 € : un P/B de 0,8.",
      },
      {
        id: "valeur-entreprise",
        titre: "Valeur d'entreprise / EBITDA",
        definition:
          "La valeur d'entreprise ajoute la dette nette à la capitalisation : c'est le prix de toute l'entreprise, dettes comprises. Divisée par l'EBITDA, elle compare des sociétés plus ou moins endettées.",
        generique: "Capitalisation de 8 milliards, dette nette de 2 milliards et EBITDA de 1 milliard : un ratio de 10.",
      },
      {
        id: "publication-resultats",
        titre: "Publication des résultats",
        definition:
          "Plusieurs fois par an, les sociétés cotées publient leurs comptes. Le cours réagit moins aux chiffres eux-mêmes qu'à l'écart avec ce qu'attendaient les analystes, et aux prévisions pour la suite.",
        generique: "Un bénéfice en hausse de 10 % peut faire baisser l'action si le marché attendait +15 %.",
      },
      {
        id: "guidance",
        titre: "Prévisions de la direction",
        definition:
          "Les objectifs que la direction annonce pour les mois à venir : chiffre d'affaires, marge, investissements. Une prévision revue à la baisse est souvent plus sanctionnée en bourse qu'un mauvais trimestre.",
        generique: "Une société vise désormais 5 % de croissance au lieu de 8 % : l'action peut perdre 10 % dans la journée, malgré de bons résultats passés.",
      },
      {
        id: "avantage-concurrentiel",
        titre: "Avantage concurrentiel durable",
        definition:
          "Ce qui protège une entreprise de ses concurrents sur la durée : marque, brevets, coûts plus bas, réseau d'utilisateurs, clients difficiles à perdre. Il lui permet de garder des marges élevées longtemps.",
        generique: "Un fournisseur lié à ses clients par des contrats de 15 ans et des installations construites pour eux est très difficile à remplacer.",
      },
      {
        id: "consensus",
        titre: "Consensus des analystes",
        definition:
          "La moyenne des prévisions des analystes qui suivent une société : bénéfices, chiffre d'affaires, objectif de cours. C'est la référence à laquelle le marché compare chaque publication.",
        generique: "Le consensus attend un BPA de 3 € et la société publie 3,20 € : ses résultats sont « supérieurs aux attentes ».",
      },
    ],
  },
  {
    id: "fonds",
    libelle: "ETF et fonds",
    notions: [
      {
        id: "etf-indice",
        titre: "ETF et indice",
        definition:
          "Un ETF est un fonds coté en bourse qui suit un indice, c'est-à-dire un panier de sociétés choisi selon des règles fixes (taille, pays…). Acheter une part, c'est acheter un petit morceau de tout le panier, avec des frais en général faibles.",
        generique: "Une part d'un ETF MSCI World t'expose d'un coup à plus de 1 000 sociétés de 23 pays développés.",
      },
      {
        id: "capitalisant-distribuant",
        titre: "ETF capitalisant ou distribuant",
        definition:
          "Un ETF distribuant te verse les dividendes des sociétés qu'il détient. Un capitalisant les réinvestit dans sa propre valeur : aucun versement, mais les intérêts composés jouent sans que tu aies rien à faire.",
        generique:
          "Dans un PEA, les dividendes ne sont pas imposés tant qu'ils restent dans le plan : les deux se valent fiscalement, mais un capitalisant t'évite de réinvestir à la main.",
      },
      {
        id: "frais-courants",
        titre: "Frais courants d'un fonds",
        definition:
          "Les frais de gestion d'un fonds, en % par an, prélevés directement dans sa valeur : tu ne les vois jamais passer. Pour un ETF, ils vont souvent de 0,1 % à 0,5 %.",
        generique: "Sur 10 000 €, 0,2 % de frais coûtent 20 € par an ; 2 %, fréquent pour un fonds actif, 200 €.",
      },
      {
        id: "replication",
        titre: "Réplication physique ou synthétique",
        definition:
          "Un ETF physique achète les titres de l'indice. Un ETF synthétique détient un autre panier et échange sa performance contre celle de l'indice par un contrat (swap). C'est ce qui permet à des ETF Monde d'entrer dans un PEA.",
        generique:
          "Un ETF MSCI World éligible au PEA détient surtout des actions européennes, mais sa valeur suit bien l'indice mondial grâce au swap.",
      },
      {
        id: "ecart-suivi",
        titre: "Écart de suivi",
        definition:
          "La différence entre la performance d'un ETF et celle de son indice. Elle vient des frais, de la méthode de réplication et de la fiscalité des dividendes : plus elle est faible et régulière, mieux l'ETF fait son travail.",
        generique: "L'indice prend 10 % sur l'année, l'ETF 9,8 % : 0,2 point d'écart, souvent l'équivalent de ses frais.",
      },
      {
        id: "gestion-active-passive",
        titre: "Gestion active ou passive",
        definition:
          "Un fonds actif essaie de battre le marché en choisissant ses titres ; un fonds passif se contente de répliquer un indice. Sur 10 ans et plus, une large majorité des fonds actifs font moins bien que leur indice, en grande partie à cause de leurs frais.",
        generique: "Un fonds actif à 1,8 % de frais doit battre son indice de 1,8 point chaque année rien que pour faire jeu égal avec lui.",
      },
      {
        id: "world-acwi",
        titre: "MSCI World et MSCI ACWI",
        definition:
          "Le MSCI World couvre les grandes et moyennes sociétés de 23 pays développés. Le MSCI ACWI y ajoute les pays émergents : Chine, Inde, Taïwan, Brésil…",
        generique: "Les pays émergents pèsent environ 10 % de l'ACWI : un ETF MSCI World seul les laisse de côté.",
      },
      {
        id: "sp500",
        titre: "S&P 500",
        definition:
          "L'indice des 500 plus grandes sociétés américaines, pondérées par leur taille en bourse. Les géants de la technologie y pèsent très lourd : ses dix premières lignes représentent plus d'un tiers de l'indice.",
        generique: "Un ETF S&P 500 éligible au PEA te donne accès à ces 500 sociétés grâce à un swap, comme pour le MSCI World.",
      },
      {
        id: "etf-thematique",
        titre: "ETF thématique",
        definition:
          "Un ETF qui suit un seul secteur ou un thème : énergie propre, robotique, santé… Plus concentré qu'un ETF Monde, il est aussi plus risqué, et les thèmes à la mode s'achètent souvent après leur plus forte hausse.",
        generique: "Les ETF « énergie propre », très recherchés fin 2020, ont ensuite perdu plus de la moitié de leur valeur.",
      },
      {
        id: "opcvm",
        titre: "OPCVM",
        definition:
          "Le nom générique des fonds d'investissement (SICAV, FCP) : ils mettent en commun l'argent de nombreux épargnants et le confient à un gérant. Contrairement à un ETF, ils s'échangent une fois par jour, à une valeur liquidative calculée après la clôture.",
        generique: "Un ordre passé à 11 h sur un fonds classique s'exécute sur la valeur liquidative du soir, que tu ne connais pas au moment de passer l'ordre.",
      },
      {
        id: "ponderation-indice",
        titre: "Pondération d'un indice",
        definition:
          "Dans la plupart des indices, chaque société pèse selon sa taille en bourse : les géants comptent bien plus que les petites. Il existe aussi des indices « équipondérés », où chaque société pèse autant.",
        generique: "Dans un indice équipondéré de 500 sociétés, chacune pèse 0,2 %, quelle que soit sa taille.",
      },
    ],
  },
  {
    id: "fiscalite",
    libelle: "Enveloppes et fiscalité",
    notions: [
      {
        id: "pea-cinq-ans",
        titre: "La règle des 5 ans du PEA",
        definition:
          "Après 5 ans, les gains retirés d'un PEA ne paient plus d'impôt sur le revenu : seuls les prélèvements sociaux restent dus. Avant 5 ans, un retrait est imposé et entraîne en principe la clôture du plan. Les 5 ans partent du premier versement.",
        generique: "Un PEA ouvert en mars 2025 passe les 5 ans en mars 2030. L'ouvrir tôt, même avec une petite somme, fait démarrer le compteur.",
      },
      {
        id: "plafond-pea",
        titre: "Plafond du PEA",
        definition:
          "Le plafond limite les sommes que tu VERSES, pas la valeur du plan. Si tes placements grossissent bien au-delà, aucun problème : seuls tes versements comptent.",
        generique: "Tu verses 150 000 € sur un PEA et ils deviennent 300 000 € : tu ne peux plus rien y verser, mais rien ne t'oblige à retirer quoi que ce soit.",
      },
      {
        id: "liquidites-pea",
        titre: "Liquidités du PEA",
        definition:
          "L'argent versé sur le PEA mais pas encore investi. Il ne rapporte rien, mais il reste dans l'enveloppe et peut servir à acheter quand tu le décides.",
        generique: "Verser 500 € sur ton PEA puis attendre une semaine pour acheter ne change rien à son ancienneté : seule la date du premier versement compte.",
      },
      {
        id: "retenue-source",
        titre: "Retenue à la source",
        definition:
          "Quand une société étrangère verse un dividende, son pays en prélève souvent une partie avant qu'il ne t'arrive. Sur un compte-titres, un crédit d'impôt la compense en grande partie ; dans un PEA, elle est perdue.",
        generique: "Un dividende allemand de 100 € subit une retenue de 26,375 % en Allemagne : dans un PEA, il ne t'en arrive qu'environ 74 €.",
      },
      {
        id: "eligibilite-pea",
        titre: "Ce qui entre dans un PEA",
        definition:
          "Le PEA n'accepte que les actions de sociétés européennes (Union européenne et quelques pays de l'Espace économique européen), et les fonds investis au moins à 75 % dans ces actions. Les actions américaines en direct n'y entrent pas.",
        generique: "Une action allemande ou italienne entre dans un PEA ; une action américaine, non — mais un ETF S&P 500 synthétique, oui.",
      },
      {
        id: "pea-pme",
        titre: "PEA-PME",
        definition:
          "Un second PEA, consacré aux petites et moyennes entreprises européennes, avec la même fiscalité. Les versements cumulés sur PEA et PEA-PME ne peuvent pas dépasser 225 000 €.",
        generique: "Avec 150 000 € versés sur ton PEA, il reste 75 000 € de versements possibles sur un PEA-PME.",
      },
      {
        id: "pea-jeune",
        titre: "PEA jeune",
        definition:
          "Un PEA ouvert par un jeune majeur rattaché au foyer fiscal de ses parents, plafonné à 20 000 € de versements. Au détachement du foyer, il devient un PEA classique et garde son ancienneté.",
        generique: "Ouvert à 19 ans, un PEA jeune a déjà 5 ans d'ancienneté à 24 ans.",
      },
      {
        id: "cto",
        titre: "Compte-titres ordinaire (CTO)",
        definition:
          "Le compte de bourse sans plafond ni restriction : toutes les actions et tous les ETF du monde y sont accessibles. En contrepartie, chaque dividende et chaque vente gagnante y est imposé l'année même.",
        generique: "Une action américaine, impossible à loger dans un PEA, s'achète sur un CTO ; ses dividendes y sont imposés chaque année.",
      },
      {
        id: "flat-tax",
        titre: "Flat tax (PFU)",
        definition:
          "Le prélèvement forfaitaire unique taxe les dividendes, intérêts et plus-values hors enveloppe : 12,8 % d'impôt sur le revenu, plus les prélèvements sociaux. On peut choisir à la place le barème progressif, intéressant pour les foyers peu imposés.",
        generique: "Sur 1 000 € de plus-value réalisée sur un compte-titres, 128 € partent en impôt sur le revenu, avant les prélèvements sociaux.",
      },
      {
        id: "prelevements-sociaux",
        titre: "Prélèvements sociaux",
        definition:
          "Une taxe sur les revenus du patrimoine (intérêts, dividendes, plus-values) qui finance la protection sociale. Ils restent dus même quand l'impôt sur le revenu disparaît, comme pour un PEA de plus de 5 ans. Les livrets réglementés en sont exonérés.",
        generique: "Tu retires 10 000 € de gains d'un PEA de 6 ans : aucun impôt sur le revenu, mais les prélèvements sociaux s'appliquent sur ces 10 000 €.",
      },
      {
        id: "tmi",
        titre: "Tranche marginale d'imposition",
        definition:
          "Le taux d'impôt qui s'applique au dernier euro de tes revenus : 0, 11, 30, 41 ou 45 %. Il ne touche pas tout ton revenu, seulement la part qui dépasse le seuil de cette tranche.",
        generique: "Passer dans la tranche à 30 % ne fait pas payer 30 % sur tout : seuls les euros au-dessus du seuil sont taxés à 30 %.",
      },
      {
        id: "moins-values",
        titre: "Moins-values reportables",
        definition:
          "Sur un compte-titres, une moins-value réalisée s'impute sur les plus-values de la même année, puis des 10 années suivantes. Dans un PEA, rien de tel : seul compte le bilan global au moment du retrait.",
        generique: "1 000 € de moins-value cette année, 1 500 € de plus-value l'an prochain : tu ne seras imposé que sur 500 €.",
      },
      {
        id: "ifu",
        titre: "Imprimé fiscal unique (IFU)",
        definition:
          "Le récapitulatif que ta banque ou ton courtier t'envoie chaque année, avec les dividendes, intérêts et plus-values imposables de l'année précédente. Ses montants sont en principe pré-remplis dans la déclaration de revenus, mais ils se vérifient.",
        generique: "Les dividendes encaissés sur un CTO en 2026 figurent sur l'IFU reçu au printemps 2027, pour la déclaration de cette année-là.",
      },
      {
        id: "assurance-vie",
        titre: "Assurance-vie",
        definition:
          "Une enveloppe qui combine fonds en euros, au capital garanti, et unités de compte (actions, ETF…), non garanties. Après 8 ans, les gains retirés bénéficient d'un abattement annuel d'impôt, et elle facilite la transmission.",
        generique: "Après 8 ans, une personne seule peut retirer jusqu'à 4 600 € de gains par an sans impôt sur le revenu (9 200 € pour un couple), hors prélèvements sociaux.",
      },
      {
        id: "fonds-euros",
        titre: "Fonds en euros",
        definition:
          "Le support garanti de l'assurance-vie : le capital ne peut pas baisser, et les intérêts acquis chaque année le sont définitivement. En échange, le rendement reste limité.",
        generique: "Un fonds en euros à 2,5 % : 10 000 € deviennent 10 250 € en fin d'année, et ce montant ne peut plus redescendre.",
      },
      {
        id: "unites-de-compte",
        titre: "Unités de compte",
        definition:
          "Les supports non garantis d'une assurance-vie : fonds actions, ETF, immobilier… Leur valeur suit les marchés, et l'assureur prélève chaque année des frais de contrat en plus de ceux des fonds.",
        generique: "0,6 % de frais de contrat et 0,2 % de frais d'ETF : une unité de compte te coûte 0,8 % par an.",
      },
      {
        id: "clause-beneficiaire",
        titre: "Clause bénéficiaire",
        definition:
          "Dans une assurance-vie, tu désignes qui recevra l'argent à ton décès. Les sommes versées avant 70 ans bénéficient d'un abattement de 152 500 € par bénéficiaire, en dehors de la succession.",
        generique: "Deux enfants bénéficiaires peuvent recevoir chacun 152 500 € sans droits, soit 305 000 € au total, pour des versements faits avant 70 ans.",
      },
      {
        id: "plan-epargne-retraite",
        titre: "Plan d'épargne retraite",
        definition:
          "Une enveloppe bloquée jusqu'à la retraite, sauf achat de la résidence principale et accidents de la vie. Les versements peuvent être déduits du revenu imposable : l'avantage grandit avec ta tranche d'imposition, et l'impôt est en partie reporté à la sortie.",
        generique: "Avec une tranche à 30 %, verser 1 000 € sur un plan d'épargne retraite réduit ton impôt de 300 € cette année.",
      },
    ],
  },
  {
    id: "epargne",
    libelle: "Épargne et budget",
    notions: [
      {
        id: "interets-composes",
        titre: "Intérêts composés",
        definition:
          "Les intérêts que tu gagnes rapportent à leur tour des intérêts. Sur un an, l'effet est minuscule ; sur vingt ou trente ans, c'est lui qui fait l'essentiel de la croissance.",
        generique: "1 000 € placés à 5 % par an deviennent 1 629 € en 10 ans, et 4 322 € en 30 ans, sans aucun versement supplémentaire.",
      },
      {
        id: "epargne-precaution",
        titre: "Épargne de précaution",
        definition:
          "L'argent disponible tout de suite en cas d'imprévu (panne, perte d'emploi), placé sans risque. On conseille souvent 3 à 6 mois de dépenses. Elle évite de devoir vendre ses placements au mauvais moment.",
        generique: "Avec 1 500 € de dépenses par mois, un matelas de 3 à 6 mois représente 4 500 à 9 000 €.",
      },
      {
        id: "taux-epargne",
        titre: "Taux d'épargne",
        definition:
          "La part de tes revenus que tu mets de côté chaque mois. Au début, c'est le levier le plus puissant : ce que tu épargnes pèse bien plus que le rendement que tu en tires.",
        generique: "Sur 2 000 € de revenus, épargner 400 € par mois, c'est un taux d'épargne de 20 %.",
      },
      {
        id: "livret-a",
        titre: "Livret A",
        definition:
          "Un livret garanti par l'État, dont le taux est fixé par les pouvoirs publics et révisé en principe deux fois par an. Ses intérêts sont exonérés d'impôt et de prélèvements sociaux. Son plafond : 22 950 € de versements.",
        generique: "Les intérêts peuvent faire dépasser le plafond : un Livret A rempli à 22 950 € continue de rapporter.",
      },
      {
        id: "ldds",
        titre: "LDDS",
        definition:
          "Le livret de développement durable et solidaire : même taux et même fiscalité que le Livret A, avec un plafond de 12 000 €. C'est souvent le relais naturel une fois le Livret A rempli.",
        generique: "Livret A et LDDS pleins, c'est 34 950 € disponibles à tout moment, sans impôt sur les intérêts.",
      },
      {
        id: "lep",
        titre: "LEP",
        definition:
          "Le livret d'épargne populaire, réservé aux revenus modestes, sous un plafond de revenu fiscal. Il rapporte au moins 0,5 point de plus que le Livret A, avec un plafond de 10 000 €.",
        generique: "Si tu y as droit, le LEP passe avant le Livret A : même sécurité, meilleur taux.",
      },
      {
        id: "regle-72",
        titre: "Règle de 72",
        definition:
          "Pour savoir en combien d'années un placement double, divise 72 par son rendement annuel en %. C'est une approximation, très bonne entre 2 et 10 %.",
        generique: "À 6 % par an, un capital double en environ 12 ans ; à 2 %, en 36 ans.",
      },
      {
        id: "inflation",
        titre: "Inflation",
        definition:
          "La hausse générale des prix sur un an. Elle grignote le pouvoir d'achat de l'argent qui dort : la Banque centrale européenne vise environ 2 % par an.",
        generique: "Avec 2 % d'inflation par an, 1 000 € n'ont plus que le pouvoir d'achat d'environ 820 € au bout de 10 ans.",
      },
      {
        id: "revenus-passifs",
        titre: "Revenus passifs",
        definition:
          "Ce que ton patrimoine rapporte sans que tu travailles : intérêts, dividendes, loyers. Comparés à tes dépenses, ils mesurent le chemin vers l'indépendance financière.",
        generique: "300 000 € placés à 4 % rapportent 12 000 € par an, soit 1 000 € par mois.",
      },
      {
        id: "regle-50-30-20",
        titre: "Règle 50/30/20",
        definition:
          "Un repère simple pour répartir ses revenus : 50 % pour les besoins (loyer, courses, transport), 30 % pour les envies, 20 % pour l'épargne. À adapter, mais utile pour voir où ça coince.",
        generique: "Sur 2 000 € par mois : 1 000 € de besoins, 600 € d'envies et 400 € d'épargne.",
      },
      {
        id: "se-payer-en-premier",
        titre: "Se payer en premier",
        definition:
          "Programmer un virement d'épargne le jour où arrive le salaire, plutôt qu'épargner ce qui reste en fin de mois. L'épargne devient une dépense fixe, et le reste s'ajuste autour.",
        generique: "Un virement automatique de 200 € le jour de la paie, c'est 2 400 € épargnés dans l'année sans y penser.",
      },
      {
        id: "cout-opportunite",
        titre: "Coût d'opportunité",
        definition:
          "Ce que tu renonces à gagner en choisissant une option plutôt qu'une autre. Laisser dormir de l'argent sur un compte courant a un coût, même invisible : les intérêts qu'il aurait pu rapporter ailleurs.",
        generique: "5 000 € laissés un an sur un compte courant à 0 % au lieu d'un livret à 2 % : 100 € d'intérêts perdus.",
      },
    ],
  },
  {
    id: "risque",
    libelle: "Risque et performance",
    notions: [
      {
        id: "poids-ligne",
        titre: "Poids d'une ligne",
        definition:
          "La part d'une ligne dans le portefeuille. Plus elle pèse lourd, plus son évolution décide de la tienne : une mauvaise nouvelle sur une seule société peut alors coûter cher. Un ETF large répartit ce risque sur des centaines de sociétés.",
        generique: "Sur un portefeuille de 10 000 €, une ligne de 4 000 € pèse 40 % : si elle perd 20 %, c'est tout le portefeuille qui perd 8 %.",
      },
      {
        id: "diversification",
        titre: "Diversification",
        definition:
          "Répartir son argent sur des placements qui ne bougent pas tous en même temps. Elle réduit le risque sans forcément réduire le rendement attendu : c'est pour cela qu'on l'appelle le seul « repas gratuit » de la finance.",
        generique: "Avec une seule action, une faillite peut tout emporter ; dans un ETF de 1 000 sociétés, la même faillite pèse 0,1 %.",
      },
      {
        id: "allocation",
        titre: "Allocation d'actifs",
        definition:
          "La répartition de ton patrimoine entre grandes familles : actions, épargne garantie, immobilier… C'est elle qui décide l'essentiel du risque et du rendement, bien plus que le choix de chaque titre.",
        generique: "60 % en actions et 40 % sur des livrets : si les marchés perdent 30 %, ce patrimoine ne perd que 18 %.",
      },
      {
        id: "risque-change",
        titre: "Risque de change",
        definition:
          "Un titre coté dans une autre devise que l'euro varie aussi avec le taux de change : si le dollar baisse face à l'euro, une action américaine perd de la valeur en euros, même si son cours ne bouge pas. Un ETF coté en euros peut y être exposé lui aussi, par les sociétés qu'il contient.",
        generique: "Une action à 100 $ vaut 90 € quand 1 $ = 0,90 €. Si le dollar retombe à 0,80 €, elle ne vaut plus que 80 €, cours inchangé.",
      },
      {
        id: "drawdown",
        titre: "Baisse maximale (drawdown)",
        definition:
          "La plus forte chute entre un plus haut et le creux qui le suit. C'est une mesure du risque plus parlante que la volatilité : elle dit de combien ton épargne aurait fondu au pire moment.",
        generique: "Au printemps 2020, le MSCI World a perdu environ un tiers de sa valeur en un mois, avant de retrouver son niveau avant la fin de l'année.",
      },
      {
        id: "volatilite",
        titre: "Volatilité",
        definition:
          "L'ampleur des variations d'un placement autour de sa moyenne, exprimée en % par an. Plus elle est élevée, plus le chemin est agité, même si le rendement final est bon.",
        generique: "Les grands indices d'actions ont une volatilité de l'ordre de 15 % par an : une année à −15 % ou +15 % autour de la moyenne n'a rien d'exceptionnel.",
      },
      {
        id: "rendement-annualise",
        titre: "Rendement annualisé",
        definition:
          "Le rendement moyen par an qui, composé, mène du point de départ au point d'arrivée. Il permet de comparer des placements détenus sur des durées différentes.",
        generique: "+50 % en 5 ans, c'est environ +8,4 % par an, et non +10 %.",
      },
      {
        id: "asymetrie-pertes",
        titre: "Asymétrie des pertes",
        definition:
          "Une baisse se rattrape avec une hausse plus forte qu'elle : après −50 %, il faut +100 % pour revenir au point de départ. Limiter les grosses chutes compte donc autant que chercher les hausses.",
        generique: "Un portefeuille qui perd 20 % doit regagner 25 % pour revenir à son niveau.",
      },
      {
        id: "correlation",
        titre: "Corrélation",
        definition:
          "Elle mesure à quel point deux placements évoluent ensemble, de −1 (en sens inverse) à +1 (exactement pareil). Deux lignes très corrélées diversifient peu, même si elles semblent différentes.",
        generique: "Un ETF MSCI World et un ETF S&P 500 sont très corrélés : les États-Unis pèsent plus de 70 % du premier.",
      },
      {
        id: "risque-marche",
        titre: "Risque spécifique et risque de marché",
        definition:
          "Le risque spécifique touche une seule société (scandale, produit raté) et se dilue avec la diversification. Le risque de marché touche tout le monde à la fois (récession, crise) : on ne peut pas le diversifier, seulement le doser.",
        generique: "En mars 2020, presque toutes les actions ont baissé ensemble : c'est le risque de marché, que même 1 000 lignes n'auraient pas évité.",
      },
      {
        id: "ratio-sharpe",
        titre: "Ratio de Sharpe",
        definition:
          "Le rendement obtenu au-delà d'un placement sans risque, divisé par la volatilité. Il dit combien de rendement tu as reçu pour chaque unité de risque prise : au-dessus de 1 sur la durée, c'est très bon.",
        generique: "8 % de rendement, 2 % sans risque et 12 % de volatilité : un Sharpe de 0,5.",
      },
      {
        id: "beta",
        titre: "Bêta",
        definition:
          "La sensibilité d'une action aux mouvements du marché. Un bêta de 1,5 veut dire qu'elle bouge en moyenne 1,5 fois plus que l'indice, dans les deux sens ; un bêta de 0,5, deux fois moins.",
        generique: "Si le marché perd 10 %, une action de bêta 1,5 perd en moyenne 15 %.",
      },
      {
        id: "horizon-placement",
        titre: "Horizon de placement",
        definition:
          "La durée pendant laquelle tu peux laisser ton argent investi sans y toucher. Plus elle est longue, plus tu peux accepter de fluctuations : sur 15 ans et plus, les actions mondiales ont rarement fini en perte.",
        generique: "L'argent d'un achat immobilier prévu dans 2 ans n'a rien à faire en actions : une baisse de 30 % au mauvais moment ne laisserait pas le temps de se refaire.",
      },
      {
        id: "indice-reference",
        titre: "Indice de référence",
        definition:
          "L'indice auquel comparer un portefeuille pour juger sa performance. Un résultat positif ne suffit pas : il faut savoir ce qu'aurait donné la solution la plus simple.",
        generique: "Ton portefeuille fait +8 % quand un simple ETF MSCI World fait +15 % : la performance est réelle, mais l'ETF aurait fait mieux pour moins d'effort.",
      },
      {
        id: "twr-tri",
        titre: "Performance ou rendement de ton argent",
        definition:
          "La performance pondérée par le temps (TWR) mesure la qualité des placements, sans tenir compte du moment de tes versements. Le taux de rendement interne (TRI) mesure ce que TON argent a réellement rapporté, versements compris.",
        generique: "Si tu verses beaucoup juste avant une baisse, ton TRI sera moins bon que la TWR : les placements n'ont pas fait pire, c'est le calendrier des versements.",
      },
      {
        id: "reequilibrage",
        titre: "Rééquilibrage",
        definition:
          "Ramener régulièrement ton portefeuille à la répartition choisie, en vendant ce qui a monté ou en investissant davantage dans ce qui a baissé. Il garde le niveau de risque prévu.",
        generique: "Cible 60/40 : après une bonne année, les actions pèsent 70 %. Tu diriges tes prochains versements vers les livrets jusqu'à revenir à 60/40.",
      },
      {
        id: "effet-levier",
        titre: "Effet de levier",
        definition:
          "Investir avec de l'argent emprunté, ou via un produit qui multiplie les variations. Les gains sont amplifiés, les pertes aussi, et avec certains produits elles peuvent dépasser la mise.",
        generique: "Avec un levier de 2, une baisse de 30 % fait perdre environ 60 % de la mise.",
      },
      {
        id: "liquidite",
        titre: "Liquidité",
        definition:
          "La facilité à vendre un placement rapidement, sans faire baisser son prix. Un livret est parfaitement liquide, une grande action aussi ; un appartement ou une petite valeur peu échangée, beaucoup moins.",
        generique: "Vendre un appartement prend en général plusieurs mois ; vendre un ETF MSCI World, quelques secondes en séance.",
      },
    ],
  },
  {
    id: "macro",
    libelle: "Économie et taux",
    notions: [
      {
        id: "rendement-reel",
        titre: "Rendement réel",
        definition:
          "Ce que rapporte un placement une fois l'inflation déduite. Un livret à 2 % quand les prix montent de 3 % fait perdre du pouvoir d'achat, même si son solde augmente.",
        generique: "Un livret à 3 % avec une inflation de 2 % : ton rendement réel est d'environ 1 %.",
      },
      {
        id: "taux-directeurs",
        titre: "Taux directeurs",
        definition:
          "Les taux auxquels la banque centrale prête aux banques. En les montant, la BCE freine le crédit et l'inflation ; en les baissant, elle soutient l'économie. Ils se répercutent sur les crédits, les livrets et les obligations.",
        generique: "Quand la BCE a monté ses taux en 2022-2023, les taux des crédits immobiliers français sont passés d'environ 1 % à plus de 4 %.",
      },
      {
        id: "recession",
        titre: "Récession",
        definition:
          "Un recul de l'activité économique, souvent défini comme deux trimestres de suite de baisse du PIB. La bourse anticipe : elle baisse souvent avant, et remonte avant la fin.",
        generique: "En 2020, les marchés ont touché leur point bas en mars, bien avant que l'économie ne redémarre.",
      },
      {
        id: "pib",
        titre: "PIB",
        definition:
          "Le produit intérieur brut mesure la valeur de tout ce qui est produit dans un pays sur une période. Sa croissance est le principal indicateur de la santé d'une économie.",
        generique: "Une croissance de 1 % : le pays a produit 1 % de plus que l'année précédente, une fois l'inflation retirée.",
      },
      {
        id: "courbe-taux",
        titre: "Courbe des taux",
        definition:
          "Les taux d'intérêt selon la durée d'emprunt. Normalement, prêter plus longtemps rapporte plus. Quand les taux courts dépassent les taux longs, la courbe est « inversée », souvent le signe d'un ralentissement à venir.",
        generique: "Un État qui paie 3 % à 2 ans et 2,5 % à 10 ans a une courbe inversée.",
      },
      {
        id: "stagflation",
        titre: "Stagflation",
        definition:
          "Le mélange d'une économie qui stagne et d'une inflation élevée. C'est un cas difficile : la banque centrale ne peut pas à la fois baisser ses taux pour soutenir l'activité et les monter pour freiner les prix.",
        generique: "Les années 1970, après les chocs pétroliers, en sont l'exemple classique : croissance faible et inflation à deux chiffres.",
      },
      {
        id: "or",
        titre: "Or",
        definition:
          "Un métal qui ne verse ni intérêt ni dividende, mais que l'on achète comme valeur refuge, contre l'inflation ou les crises. Son prix peut rester très longtemps sans progresser.",
        generique: "Après son pic de 1980, l'once d'or a mis environ 28 ans à retrouver ce prix en dollars.",
      },
    ],
  },
  {
    id: "obligations",
    libelle: "Obligations",
    notions: [
      {
        id: "obligation",
        titre: "Obligation",
        definition:
          "Un prêt que tu fais à un État ou à une entreprise : il te verse un intérêt fixe chaque année (le coupon) et te rembourse à l'échéance. Le risque principal : que l'emprunteur ne puisse pas rembourser.",
        generique: "Une obligation de 1 000 € à 3 % sur 5 ans : 30 € par an pendant 5 ans, puis 1 000 € rendus.",
      },
      {
        id: "prix-obligation",
        titre: "Taux et prix des obligations",
        definition:
          "Quand les taux montent, les obligations déjà émises perdent de la valeur : leur coupon devient moins intéressant que celui des nouvelles. Quand les taux baissent, c'est l'inverse.",
        generique: "Une obligation à 2 % se revend moins cher si les nouvelles rapportent 4 % : personne ne la rachètera au prix d'origine.",
      },
      {
        id: "duration",
        titre: "Duration",
        definition:
          "La sensibilité d'une obligation aux taux d'intérêt, exprimée en années. Pour une duration de 7, une hausse des taux d'un point fait baisser le prix d'environ 7 %.",
        generique: "En 2022, avec la remontée brutale des taux, des obligations d'État à très long terme ont perdu plus de 20 %.",
      },
      {
        id: "notation",
        titre: "Notation de crédit",
        definition:
          "Une note (AAA, AA, A, BBB…) donnée par des agences sur la capacité d'un emprunteur à rembourser. En dessous de BBB−, on parle de « haut rendement » : plus risqué, mieux rémunéré.",
        generique: "Un État noté AA emprunte moins cher qu'une entreprise notée BB : son risque de défaut est jugé plus faible.",
      },
      {
        id: "spread",
        titre: "Spread de crédit",
        definition:
          "L'écart de taux entre un emprunteur et une référence jugée sûre, souvent l'État allemand en zone euro. Il mesure la prime que le marché exige pour le risque.",
        generique: "Si l'Allemagne emprunte à 10 ans à 2,5 % et un autre État à 3,3 %, l'écart de 0,8 point est le spread de cet État.",
      },
      {
        id: "etf-obligataire",
        titre: "ETF obligataire",
        definition:
          "Un ETF qui détient un panier d'obligations. Contrairement à une obligation seule, il n'a pas d'échéance : il remplace sans cesse les titres qui arrivent à terme, donc son prix reste sensible aux taux. Il n'est en général pas éligible au PEA.",
        generique: "Un ETF d'obligations d'État de duration 7 perd environ 7 % si les taux montent d'un point.",
      },
      {
        id: "oat",
        titre: "OAT",
        definition:
          "Les obligations assimilables du Trésor : c'est par elles que l'État français emprunte. Leur taux à 10 ans sert de référence à de nombreux crédits, dont les crédits immobiliers.",
        generique: "Quand le taux de l'OAT à 10 ans monte durablement, les taux des crédits immobiliers suivent en général quelques mois plus tard.",
      },
    ],
  },
  {
    id: "comportement",
    libelle: "Psychologie de l'investisseur",
    notions: [
      {
        id: "aversion-perte",
        titre: "Aversion à la perte",
        definition:
          "Une perte fait environ deux fois plus mal qu'un gain du même montant ne fait plaisir. Ce biais pousse à vendre trop tôt ce qui monte, et à garder trop longtemps ce qui baisse.",
        generique: "Perdre 100 € pèse autant, dans la tête, que gagner environ 200 €.",
      },
      {
        id: "biais-confirmation",
        titre: "Biais de confirmation",
        definition:
          "La tendance à chercher et à retenir les informations qui confirment ce qu'on pense déjà. En bourse, il fait ignorer les signaux qui contredisent sa thèse d'investissement.",
        generique: "Après avoir acheté une action, on lit volontiers les articles enthousiastes, et on survole les mauvaises nouvelles.",
      },
      {
        id: "ancrage",
        titre: "Biais d'ancrage",
        definition:
          "S'accrocher à un chiffre de référence, souvent son prix d'achat, comme s'il disait quelque chose sur la valeur future. Le marché, lui, ne sait pas à quel prix tu as acheté.",
        generique: "« J'attends qu'elle revienne à mon PRU pour vendre » : ton PRU n'a aucune influence sur le cours de demain.",
      },
      {
        id: "peur-de-rater",
        titre: "Peur de rater (FOMO)",
        definition:
          "Acheter parce que tout le monde semble gagner de l'argent sur un placement, souvent après sa plus forte hausse. C'est l'un des moyens les plus sûrs d'acheter cher.",
        generique: "Un actif qui a pris 300 % en six mois fait la une : c'est souvent là qu'arrivent les derniers acheteurs.",
      },
      {
        id: "market-timing",
        titre: "Market timing",
        definition:
          "Essayer d'entrer et de sortir du marché au bon moment. Les meilleures séances arrivent souvent juste après les pires : sortir pour éviter une baisse fait souvent rater le rebond.",
        generique: "Sur 20 ans, rater les 10 meilleures séances d'un grand indice a suffi, selon plusieurs études, à réduire de moitié environ le capital final.",
      },
      {
        id: "biais-domestique",
        titre: "Biais domestique",
        definition:
          "La tendance à surinvestir dans son propre pays, parce qu'on le connaît. La France pèse moins de 3 % de la bourse mondiale : un portefeuille 100 % français est très concentré.",
        generique: "Un portefeuille entièrement investi dans le CAC 40 parie sur moins de 3 % des actions mondiales.",
      },
      {
        id: "exces-confiance",
        titre: "Excès de confiance",
        definition:
          "Surestimer sa capacité à choisir les bons titres ou le bon moment. Il pousse à multiplier les ordres, et chaque ordre coûte des frais et souvent de la performance.",
        generique: "Des études sur des dizaines de milliers de particuliers montrent que ceux qui passent le plus d'ordres obtiennent en moyenne les moins bons résultats.",
      },
      {
        id: "biais-recence",
        titre: "Biais de récence",
        definition:
          "Accorder trop de poids à ce qui vient de se passer, comme si cela allait durer. Après trois bonnes années, on croit que la bourse ne peut que monter ; après un krach, qu'elle ne remontera jamais.",
        generique: "Après la chute de mars 2020, beaucoup ont attendu « que ça se calme » et ont raté la remontée des mois suivants.",
      },
      {
        id: "comptabilite-mentale",
        titre: "Comptabilité mentale",
        definition:
          "Traiter l'argent différemment selon sa provenance ou la case où on l'a rangé, alors qu'un euro vaut un euro. Exemple classique : garder un crédit cher tout en laissant dormir de l'épargne au-delà de son matelas de précaution.",
        generique: "Payer 8 % sur un crédit auto en gardant 5 000 € de trop sur un livret à 2 %, c'est perdre la différence chaque année.",
      },
    ],
  },
  {
    id: "ordres",
    libelle: "Passer des ordres",
    notions: [
      {
        id: "frais-courtage",
        titre: "Frais de courtage",
        definition:
          "Ce que le courtier facture à chaque ordre d'achat ou de vente. Sur un gros ordre, ils pèsent peu ; sur un petit, ils peuvent manger une bonne partie du gain. Les frais courants d'un ETF sont autre chose : ils sont prélevés chaque année dans sa valeur.",
        generique: "2 € de frais sur un achat de 100 €, c'est 2 % : le titre doit monter d'autant rien que pour les couvrir. Sur un achat de 1 000 €, les mêmes 2 € ne coûtent que 0,2 %.",
      },
      {
        id: "ordre-limite",
        titre: "Ordre à cours limité",
        definition:
          "Tu fixes le prix maximal d'achat, ou minimal de vente. L'ordre ne s'exécute qu'à ce prix ou mieux : tu maîtrises le prix, mais pas la certitude d'être exécuté.",
        generique: "Un ordre d'achat limité à 50 € sur une action à 51 € attend que le cours descende à 50 €.",
      },
      {
        id: "ordre-marche",
        titre: "Ordre au marché",
        definition:
          "Il s'exécute tout de suite, au meilleur prix disponible. Pratique sur une grande action très échangée ; risqué sur un titre peu liquide ou à l'ouverture, où le prix obtenu peut surprendre.",
        generique: "Sur une petite valeur, un ordre au marché peut acheter une partie de tes titres à 10 €, puis le reste à 10,40 € faute de vendeurs.",
      },
      {
        id: "ordre-stop",
        titre: "Ordre à seuil de déclenchement",
        definition:
          "Un ordre qui se déclenche quand le cours franchit un seuil, par exemple pour vendre si l'action chute sous un niveau. Une fois déclenché, il peut s'exécuter bien plus bas que le seuil si le cours décroche d'un coup.",
        generique: "Seuil à 45 € sur une action à 50 € : si elle ouvre à 40 € après une mauvaise nouvelle, la vente se fait autour de 40 €, pas 45 €.",
      },
      {
        id: "fourchette",
        titre: "Fourchette de prix",
        definition:
          "L'écart entre le meilleur prix proposé par les acheteurs et celui demandé par les vendeurs. C'est un coût caché à chaque aller-retour : faible sur les grandes valeurs, plus large sur les petites et sur les ETF peu échangés.",
        generique: "Achat à 100,10 €, vente à 99,90 € : 0,2 % perdu sur un aller-retour immédiat, avant tout frais.",
      },
      {
        id: "carnet-ordres",
        titre: "Carnet d'ordres",
        definition:
          "La liste des ordres d'achat et de vente en attente sur un titre, rangés par prix. Le cours se forme là où un acheteur et un vendeur tombent d'accord.",
        generique: "Si 500 titres sont proposés à 20 € et que tu en achètes 800, les 300 suivants sont pris au prix supérieur affiché.",
      },
      {
        id: "horaires-bourse",
        titre: "Horaires de la bourse de Paris",
        definition:
          "Euronext Paris cote en continu de 9 h à 17 h 30. Avant et après, des fixings regroupent les ordres pour fixer un prix d'ouverture et un prix de clôture.",
        generique: "Un ordre passé à 8 h 30 attend le fixing d'ouverture de 9 h : c'est là que s'imprime le premier cours de la journée.",
      },
      {
        id: "vente-decouvert",
        titre: "Vente à découvert",
        definition:
          "Vendre un titre que l'on ne possède pas, en l'empruntant, pour le racheter plus tard moins cher. Le gain est limité, puisque le titre ne peut pas tomber sous 0 ; la perte ne l'est pas. Impossible dans un PEA.",
        generique: "Vendre à découvert à 100 € et racheter à 70 € rapporte 30 € ; racheter à 200 € en coûte 100.",
      },
      {
        id: "droits-garde",
        titre: "Droits de garde",
        definition:
          "Des frais que certaines banques facturent chaque année pour conserver tes titres, en plus des frais d'ordre. Ils sont plafonnés sur le PEA, et beaucoup de courtiers en ligne n'en prennent plus.",
        generique: "0,4 % de droits de garde sur un PEA de 20 000 €, c'est 80 € par an, prélevés que tu achètes ou non.",
      },
      {
        id: "ttf",
        titre: "Taxe sur les transactions financières",
        definition:
          "Une taxe française de quelques dixièmes de pourcent prélevée à l'achat d'actions de grandes sociétés françaises (plus d'un milliard d'euros en bourse), PEA compris. La vente et les ETF n'y sont pas soumis.",
        generique: "Acheter des actions d'une grande société du CAC 40 déclenche la taxe ; acheter un ETF ou une petite société française, non.",
      },
    ],
  },
  {
    id: "immobilier",
    libelle: "Immobilier et crédit",
    notions: [
      {
        id: "taux-endettement",
        titre: "Taux d'endettement",
        definition:
          "La part de tes revenus consacrée au remboursement de tes crédits. Les banques ne doivent pas dépasser 35 %, assurance comprise, sauf exceptions limitées.",
        generique: "Avec 3 000 € de revenus nets par mois, la mensualité maximale tourne autour de 1 050 €.",
      },
      {
        id: "taeg",
        titre: "TAEG",
        definition:
          "Le taux annuel effectif global d'un crédit : il inclut les intérêts, mais aussi l'assurance, les frais de dossier et de garantie. C'est lui qu'il faut comparer d'une offre à l'autre, pas le taux nominal.",
        generique: "Deux prêts à 3,5 % peuvent afficher des TAEG de 3,9 % et 4,2 % selon leurs frais et leur assurance.",
      },
      {
        id: "frais-notaire",
        titre: "Frais de notaire",
        definition:
          "Les frais payés à l'achat d'un bien immobilier, surtout composés de taxes reversées à l'État et aux collectivités. Environ 7 à 8 % du prix dans l'ancien, 2 à 3 % dans le neuf.",
        generique: "Pour un appartement ancien à 200 000 €, compte environ 15 000 € de frais de notaire.",
      },
      {
        id: "apport",
        titre: "Apport personnel",
        definition:
          "La part de l'achat immobilier payée avec ton épargne. Les banques demandent en général qu'il couvre au moins les frais de notaire et de garantie, soit environ 10 % du prix.",
        generique: "Pour un bien à 250 000 €, un apport de 25 000 € couvre en général les frais et rassure la banque.",
      },
      {
        id: "amortissement-credit",
        titre: "Tableau d'amortissement",
        definition:
          "Le calendrier de remboursement d'un crédit. Les mensualités restent constantes, mais leur contenu change : au début, elles paient surtout des intérêts ; à la fin, surtout du capital.",
        generique: "Sur un prêt de 200 000 € à 3,5 % sur 25 ans, la première mensualité (environ 1 001 €) contient environ 583 € d'intérêts.",
      },
      {
        id: "assurance-emprunteur",
        titre: "Assurance emprunteur",
        definition:
          "Elle rembourse le crédit en cas de décès ou d'invalidité. Elle pèse lourd dans le coût total, et la loi permet d'en changer à tout moment pour une offre moins chère à garanties équivalentes.",
        generique: "0,30 % par an sur 200 000 € pendant 20 ans, calculé sur le capital de départ : 12 000 € d'assurance au total.",
      },
      {
        id: "rendement-locatif",
        titre: "Rendement locatif",
        definition:
          "Les loyers annuels divisés par le prix du bien. Le rendement brut ignore les charges, la taxe foncière, les mois sans locataire et les impôts ; le rendement net, plus réaliste, est souvent 1 à 2 points plus bas.",
        generique: "Un studio acheté 150 000 € et loué 650 € par mois : 7 800 € par an, soit 5,2 % brut.",
      },
      {
        id: "scpi",
        titre: "SCPI",
        definition:
          "Des sociétés qui achètent et gèrent des immeubles (bureaux, commerces, santé…) et reversent les loyers aux porteurs de parts. On investit dans la pierre sans gérer de locataires, mais les frais d'entrée sont élevés, souvent 8 à 10 %, et la revente n'est pas garantie rapide.",
        generique: "Avec 10 % de frais d'entrée, 10 000 € investis ne valent qu'environ 9 000 € à la revente le lendemain.",
      },
    ],
  },
  {
    id: "longTerme",
    libelle: "Long terme",
    notions: [
      {
        id: "dca",
        titre: "Investissement programmé (DCA)",
        definition:
          "Investir la même somme à intervalle régulier, quel que soit le niveau du marché. Tu achètes plus de parts quand c'est bas, moins quand c'est haut, et tu n'as pas à deviner le bon moment.",
        generique: "100 € par mois sur un ETF à 50 €, puis à 40 € : tu achètes 2 parts, puis 2,5. Ton prix moyen tombe à 44,44 €, sous la moyenne des deux cours (45 €).",
      },
      {
        id: "commencer-tot",
        titre: "Commencer tôt",
        definition:
          "Avec les intérêts composés, les premières années d'épargne pèsent le plus lourd, parce qu'elles ont le plus de temps pour fructifier.",
        generique: "10 000 € placés à 6 % par an deviennent environ 103 000 € en 40 ans, contre 57 000 € en 30 ans : 10 ans d'avance doublent presque le résultat.",
      },
      {
        id: "effet-frais-long-terme",
        titre: "L'effet des frais sur 30 ans",
        definition:
          "Un écart de frais qui semble minuscule chaque année se compose, comme les rendements, et finit par coûter une part importante du capital final.",
        generique: "10 000 € à 6 % pendant 30 ans donnent environ 57 400 € ; avec 1,5 % de frais en plus, environ 37 500 €.",
      },
      {
        id: "en-une-fois",
        titre: "Investir d'un coup ou en plusieurs fois",
        definition:
          "Historiquement, investir une grosse somme d'un coup a battu le plus souvent un étalement sur plusieurs mois, parce que les marchés montent plus souvent qu'ils ne baissent. L'étalement, lui, limite le regret d'avoir tout investi juste avant une chute.",
        generique: "Selon une étude de Vanguard, l'investissement en une fois a fait mieux qu'un étalement sur 12 mois dans environ deux cas sur trois.",
      },
      {
        id: "regle-4-pourcent",
        titre: "Règle des 4 %",
        definition:
          "Une règle issue d'études américaines : retirer chaque année 4 % de son capital de départ, réévalués de l'inflation, aurait tenu au moins 30 ans dans presque tous les scénarios historiques. Elle donne un ordre de grandeur : un capital de 25 fois ses dépenses annuelles.",
        generique: "Pour 24 000 € de dépenses par an, la règle vise un capital de 600 000 €.",
      },
      {
        id: "retraite-repartition",
        titre: "Retraite par répartition",
        definition:
          "En France, les cotisations des actifs paient les pensions des retraités du moment. Avec moins d'actifs par retraité qu'autrefois, épargner soi-même en complément devient un vrai sujet.",
        generique: "On comptait environ 4 cotisants pour un retraité au début des années 1960, contre environ 1,7 aujourd'hui.",
      },
      {
        id: "krach",
        titre: "Krach boursier",
        definition:
          "Une chute brutale et généralisée des cours en peu de temps. À long terme, les marchés mondiaux ont toujours fini par dépasser leurs plus hauts précédents, mais parfois après de longues années.",
        generique: "Après 2008, il a fallu plusieurs années au MSCI World pour retrouver son plus haut de 2007.",
      },
      {
        id: "correction-baissier",
        titre: "Correction et marché baissier",
        definition:
          "On parle de correction après une baisse de 10 à 20 % depuis un plus haut, et de marché baissier au-delà de 20 %. Les corrections sont fréquentes : il en survient en moyenne une tous les un ou deux ans.",
        generique: "Un indice passe de 100 à 85 : c'est une correction ; à 78, un marché baissier.",
      },
      {
        id: "cryptomonnaies",
        titre: "Cryptomonnaies",
        definition:
          "Des actifs numériques sans émetteur central, dont le bitcoin est le plus connu. Le bitcoin ne verse ni intérêt ni dividende : son prix dépend uniquement de ce que d'autres seront prêts à payer, d'où des variations extrêmes.",
        generique: "Le bitcoin a perdu plus de 75 % de sa valeur à plusieurs reprises, avant de remonter.",
      },
    ],
  },
];
