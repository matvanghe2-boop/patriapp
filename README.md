# 📊 Patrium

Dashboard personnel de gestion de patrimoine et de simulation financière.

## Où vont tes données

C'est la question la plus importante pour une app de ce type, donc autant y répondre en premier et sans détour.

| Donnée | Où elle est stockée | Qui peut la lire |
| --- | --- | --- |
| Livrets, positions, opérations, historique, abonnements… | `localStorage` du navigateur **et**, si tu as un compte, table `kv_store` de ta base Supabase | Toi seul — la sécurité au niveau ligne (RLS) de Supabase restreint chaque ligne à son propriétaire |
| Relevés PDF du compte courant | **Nulle part** : le fichier est lu dans le navigateur (pdf.js) et n'est envoyé à aucun serveur | Personne |
| Opérations extraites de ces relevés (dates, montants, libellés — donc les noms des personnes avec qui tu échanges de l'argent), nom du titulaire, quatre derniers chiffres du compte | Comme le reste : `localStorage` et `kv_store` | Toi seul. L'adresse, l'IBAN et le numéro complet du compte ne sont jamais conservés |
| E-mail + mot de passe | Supabase Auth | Toi seul |
| Tickers que tu consultes | Envoyés à **Yahoo Finance** (via `/api/*`) pour récupérer les cours | Yahoo |
| Mnémoniques des valeurs parisiennes du calendrier (`VU` pour `VU.PA`) | Envoyés par le serveur à l'API publique d'**info-financiere.gouv.fr** pour lire les communiqués déposés | La DILA (opérateur du site, pour l'AMF) |
| Descriptions d'entreprises (texte public fourni par Yahoo) | Envoyées à un endpoint public de **Google Translate** pour l'affichage en français | Google |
| Mesure d'audience : page consultée, référent, pays, navigateur, système et type d'appareil — sans cookie, et jamais une donnée patrimoniale | Envoyée par le navigateur à **Vercel Web Analytics**, sur la même origine (`/_vercel/insights`) | Vercel |
| Noms de domaine des sociétés affichées (pour leur logo) | Demandés à `icons.duckduckgo.com` par le navigateur, une requête par logo affiché | DuckDuckGo |
| Questions posées à l'assistant du sous-onglet **Projet**, accompagnées d'un contexte **anonymisé** : répartition en pourcentages, taux d'épargne, mois d'épargne de sécurité. Aucun montant, aucun nom de compte, aucun ticker. | Envoyées au fournisseur de modèle configuré — **Gemini** par défaut, sinon Groq, sinon Ollama | Le fournisseur configuré, ou personne du tout avec Ollama, qui tourne en local |

Ce qui n'est **jamais** envoyé nulle part : tes montants, tes soldes, tes quantités détenues, ton PRU, tes revenus. Les endpoints `/api/*` ne reçoivent que des symboles boursiers (`AI.PA`, `CW8.PA`…), jamais une position.

**Une exception, et elle est sous ton contrôle.** Le sous-onglet Projet propose un réglage « montants réels », **désactivé par défaut**, qui transmet tes montants en euros au lieu de les normaliser en base 100. Il ne s'active que derrière un écran de consentement, affiche un bandeau permanent tant qu'il est actif, et se désactive en un clic sans confirmation. Même dans ce mode, aucun nom de compte, ticker, ISIN ni identifiant ne part : le mode change l'unité des montants, pas le périmètre de ce qui est envoyé. Le bouton « Voir ce qui est envoyé » affiche à tout moment la charge utile exacte.

Sans clé de fournisseur configurée, l'assistant ne s'affiche pas et le sous-onglet Projet fonctionne entièrement dans le navigateur, via ses formulaires.

Sans configuration Supabase, l'app fonctionne en **mode local pur** : rien ne sort du navigateur, à part les tickers ci-dessus.

⚠️ La synchronisation Supabase n'est **pas une sauvegarde** : une suppression se propage sur tous les appareils. L'export JSON (menu latéral) reste la seule vraie copie de secours — l'app te le rappelle si tu n'en as pas fait depuis 30 jours.

« Réinitialiser » efface les données **locales et cloud** : sur un compte connecté, l'effacement se propage donc à tous tes appareils.

## Ce que contient l'app

L'application démarre **vide** : aucun patrimoine fictif n'est préchargé. Un bouton « Charger un jeu d'exemple » est proposé sur le Dashboard tant que rien n'est saisi, et il annonce clairement que ses chiffres sont inventés.

- **Dashboard** — patrimoine brut/net, plus-value latente, taux d'épargne, allocation d'actifs, historique du patrimoine net (relevé automatique une fois par jour), variation sur 30 jours glissants, projection à 6 mois capitalisée au taux moyen pondéré du patrimoine, **objectifs datés** avec avance/retard et effort mensuel requis
- **Compte courant** — import des relevés PDF BoursoBank, affichés comme dans une application bancaire (opérations par jour, solde du soir, détail du libellé), avec le budget réel du mois. Trois sous-onglets : **Opérations** (entrées, sorties, catégories, principaux postes, courbe du solde), **Analyse** (flux du mois, comparaison aux mois précédents, rythme des dépenses, calendrier, zoom par catégorie, petites dépenses, jeux d'argent) et **Épargne & charges** (argent qui dort face au Livret A, charges fixes et reste à vivre, revenus réguliers, épargne effective). Le solde du dernier relevé est le compte courant du patrimoine, et le profil mensuel du Dashboard se calcule sur les relevés. Voir « Compte courant : lire le relevé plutôt que le saisir » plus bas
- **Livrets & Épargne** — suivi des supports à capital garanti, plafonds, matelas de sécurité, enveloppes de ventilation
- **PEA & Bourse** — positions, plus/moins-values, **plus-value nette après impôt** selon l'enveloppe et l'ancienneté du PEA, recherche par **ticker, ISIN ou nom**, actualisation des cours **avec conversion de change**, import PDF de relevés de courtage, watchlist avec **alertes de seuil**, heatmap sectorielle, calendrier financier
- **Screener fondamental** — sous-onglet de PEA & Bourse. Six recettes assumées (dividende solide, value, qualité, défensif, momentum, repli), applicables de trois façons : filtrer un indice, **retourner le filtre contre ses propres lignes**, ou chercher des titres dans les secteurs sous-représentés du portefeuille. Chaque titre reçoit un **score sur 100** dont le détail est consultable, et deux titres se **comparent ratio par ratio**
- **Fiche financière** — dans Marché : ratios complets (PER, PEG, VE/EBITDA, marges, ROE, payout, dette), **quatre exercices publiés** avec chiffre d'affaires, EBITDA, capex et flux de trésorerie, le consensus d'analystes, et surtout **les ratios d'aujourd'hui replacés dans leur historique** (« PER 30,9 contre 27,6 de moyenne sur quatre exercices »)
- **Rééquilibrage** — sous les positions : **poids cible saisissable ligne par ligne**, avec le total affiché en permanence et ce qu'il reste à répartir ; plan d'ordres complet, besoin de liquidités et impact fiscal des ventes. Remplace l'ancien simulateur d'ordre, qui ne raisonnait que sur une ligne à la fois alors que vendre l'une modifie le poids de toutes les autres
- **Simulation** — intérêts composés sur l'ensemble du patrimoine (poche Livrets + poche Bourse, chacune avec son taux et son versement), scénarios comparables
- **Immobilier & Crédit** — sous-onglet de Simulation : apport, mensualités sur 15/20/25 ans, alerte taux d'endettement (norme HCSF 35 %), suivi des travaux
- **Variation du jour** — sous la valeur du portefeuille, et dans l'en-tête condensé du mobile. Mesurée depuis la **clôture de la veille de chaque ligne**, pas depuis un relevé enregistré : c'est la source de cours qui sait qu'un lundi se compare au vendredi et que les places ne ferment pas les mêmes jours, là où un relevé interne n'existe que les jours d'ouverture de l'application. Les versements et retraits ne comptent pas comme de la performance — ils ne bougent que la poche cash, qui reste au dénominateur sans entrer au numérateur. Conversion de change incluse ; une ligne sans cours de veille est exclue des deux termes plutôt que comptée à zéro, et leur nombre est affiché
- **Journal d'opérations et poche cash** — corriger la poche cash crée un **ajustement de solde**, pas un versement. La distinction n'est pas cosmétique : un versement est un flux externe, il entre dans le capital investi et modifie la performance. Recaler son solde après une vente créait donc un retrait du montant de la vente, alors que l'argent n'avait pas quitté le portefeuille. Un vrai versement se saisit explicitement depuis Opérations, où les types **Versement** et **Retrait** ont été ajoutés. Pour les écritures déjà enregistrées, « Réparer le journal » les repère et propose de les convertir — l'écran distingue ce qui est certain de ce qui n'est que probable, et ne convertit rien sans validation
- **Recalcul de l'historique** — dans Performance. Le rattrapage ne comble que les trous, jamais un point existant ; ce recalcul rejoue le journal corrigé contre les clôtures réelles et corrige les relevés qui avaient figé une valeur fausse (le « faux creux » d'une vente). Il affiche l'écart jour par jour **avant** d'écrire, et reste annulable
- **Dividendes & TRI** — dans Performance : dividendes attendus confrontés aux dividendes réellement encaissés, **projection à 5 ou 10 ans** au rythme de croissance mesuré sur ton propre historique (taux composé, ajustable à la main), rendement sur prix de revient, et **taux de rendement interne par ligne**

  Le TRI n'est affiché que si le journal d'opérations couvre **toute** la position. Sans le coût d'achat initial, la série se résume à une petite sortie récente suivie de la valeur totale d'aujourd'hui — ce qui produit des rendements de plusieurs centaines de pourcents. Les lignes incomplètes sont listées avec le nombre de titres retracés, plutôt que dotées d'un chiffre flatteur et faux.
- **Stratégie & Logs** — journal des thèses d'investissement, timeline des jalons, opérations, **export CSV du journal** (déclaration, changement de courtier)
- **Abonnements** — dépenses récurrentes, contrats et échéances de résiliation
- **Sauvegarde** — export/import JSON depuis le menu latéral

### Compte courant : lire le relevé plutôt que le saisir

La synchronisation bancaire automatique demande un contrat d'agrégateur professionnel ; l'onglet part donc du document que la banque fournit déjà, le **relevé mensuel PDF** (« Extrait de votre compte en EUR » chez BoursoBank).

- **Lu dans le navigateur.** `src/lib/lirePdf.js` charge pdf.js à la demande (jamais au démarrage) et en tire le texte positionné ; `src/lib/releveBourso.js` le transforme en opérations. Le PDF ne quitte pas l'appareil, l'import marche hors ligne et sans `vercel dev`. L'import de relevés de courtage, lui, reste sur `/api/parse-pdf`.
- **Les positions, pas le texte.** Un montant ne dit pas seul s'il est un débit ou un crédit : c'est sa colonne qui le dit. Le lecteur repère les en-têtes « Débit » et « Crédit » et range chaque montant selon son abscisse. Les libellés coupés en fin de ligne (« DUPONTE » / « LLIER ») sont recollés.
- **Chaque relevé est vérifié.** Solde de départ + opérations doit redonner exactement le nouveau solde, en centimes entiers. L'aperçu le dit avant toute écriture ; un écart signale une ligne mal lue. Entre deux relevés, un solde de clôture différent du solde d'ouverture suivant signale un mois manquant.
- **Pas de doublons.** Une empreinte (date, montant, libellé, référence, rang d'apparition) rend le réimport sans effet, sans fusionner pour autant deux virements identiques le même jour.
- **Classement proposé, jamais imposé.** Chaque opération reçoit une catégorie : choix manuel, puis règle (« toujours classer ce magasin en Courses »), puis virement entre ses propres comptes (reconnu au nom du titulaire), puis mots-clés, puis défaut selon le type. Les mouvements **entre ses comptes** et vers l'épargne ne comptent ni en dépense ni en revenu. Les virements d'une même personne se regroupent sous son nom quel que soit le motif (« Vir PEL de… », « Virement train… »), si bien qu'une seule règle suffit à classer, par exemple, l'aide d'un parent en « Aide familiale » — catégorie qu'aucun libellé ne permet d'attribuer d'office.
- **Les opérations ponctuelles se mettent à part.** Un don de 20 000 € reste un revenu, mais le compter dans le mois afficherait 98 % d'épargne là où le budget courant n'a pas bougé. Une opération mise à part sort des entrées, des sorties, des catégories et des flux mensuels ; elle reste dans la liste et dans le solde. L'onglet propose la mise à part quand une opération de plus de 1 000 € dépasse à elle seule la médiane des entrées (ou des sorties) d'un mois — il ne la fait jamais d'office, et ne repose plus la question une fois qu'on a répondu.
- **Le patrimoine suit les relevés.** Dès qu'un relevé est importé, le compte courant du patrimoine est le solde du dernier relevé (sa date est rappelée sur le Dashboard), et le profil mensuel — revenus, dépenses, donc taux d'épargne et matelas de sécurité — est la moyenne des trois derniers mois réels, hors virements entre ses comptes et opérations mises à part. Les valeurs saisies à la main restent stockées et reprennent la main si tous les relevés sont retirés. Le compte courant n'est plus éditable dans Livrets & Épargne.
- **Entre deux relevés, les gros mouvements se saisissent à la main.** Le relevé n'arrive qu'une fois le mois clos : un virement de 2 000 € vers le PEA début octobre restait compté sur le compte courant (relevé de septembre) ET sur le PEA. Les « mouvements depuis le dernier relevé » corrigent le solde estimé, donc le patrimoine et le Dashboard, et rien d'autre : ce sont des estimations, absentes de toutes les statistiques. À l'import du relevé qui couvre leur date, ils sont retirés et remplacés par les vraies opérations.
- **Des statistiques qui ne devinent pas.** Une charge fixe n'est reconnue que si le même marchand revient pour un montant comparable deux mois (prélèvement) ou trois mois à date stable (carte, virement) ; les noms coupés par la banque (« DUPONTELLI ») sont rattachés à leur forme complète pour qu'une règle les couvre tous. L'argent qui dort ne compte que ce qui dépasse un mois de dépenses, au taux du Livret A du catalogue et sous son plafond.

Limites : seul le format BoursoBank est lu pour l'instant ; les opérations d'un relevé ne sont connues qu'une fois le mois clos.

### Sur mobile et hors ligne

L'app est installable (PWA) et pensée pour le téléphone : navigation par **barre basse** atteignable au pouce, en-tête qui se condense au défilement pour garder le patrimoine net visible, et **tous les tableaux transformés en cartes empilées** sous 768 px — plus aucun défilement horizontal.

Le service worker met la coquille applicative en cache : l'app **démarre et reste utilisable sans réseau**, puisque toutes les données patrimoniales vivent déjà dans le navigateur. Les endpoints `/api/*` ne sont jamais mis en cache — un cours de bourse périmé servi en silence serait pire qu'une erreur visible.

**Les mises à jour sont proposées, pas imposées.** Le service worker prenait auparavant la main dès son installation (`skipWaiting`) et purgeait les caches de la version précédente — dans un onglet déjà ouvert. Comme les onglets sont chargés à la demande avec des noms de fragment hachés, ouvrir « PEA & Bourse » après un déploiement pouvait échouer sur un `Failed to fetch dynamically imported module` : écran vide, aucune explication, réparable seulement par un rechargement manuel. Le nouveau worker attend désormais, et un bandeau « Une nouvelle version est prête » propose le rechargement au moment choisi.

### Ce que le screener sait et ne sait pas

Les fondamentaux ne sont **pas** récupérés à la demande. Ils sont générés hors ligne, une fois par semaine, et servis comme actifs statiques depuis `public/univers/` : le navigateur les charge une fois puis filtre en local, sans aucun appel réseau.

Ce n'est pas une optimisation, c'est ce qui rend l'échelle possible. Le quota de `/api/market?action=screen` (20 requêtes/minute) imposait à lui seul plus de sept minutes d'attente pour quelques milliers de titres, et Yahoo renvoie des réponses vides sans erreur explicite bien avant ça — donc un univers silencieusement amputé.

Effet de bord appréciable : ces fichiers étant de simples ressources statiques de même origine, le service worker les met en cache comme le reste de la coquille. **Le screener fonctionne hors ligne.**

```bash
npm run univers                    # régénère tous les instantanés
npm run univers -- sbf120          # un seul
node scripts/importer-ishares.mjs <export.xls> russell2000   # composition → liste de tickers
```

Trois limites, énoncées parce qu'elles se voient à l'usage :

- **Les compositions sont des instantanés**, pas un miroir en direct des indices. Celles du SBF 120 et des small caps françaises sont maintenues à la main ; celles du STOXX 600 et du Russell 2000 sont importées d'un export iShares. Un symbole qui ne répond plus est rapporté dans `data/listes/rapport.json` — il ne provoque aucune erreur visible, il ressort simplement absent, ce qui ressemble à un titre qui ne passe pas le filtre.
- **Les fondamentaux datent d'au plus une semaine.** Un PER ou un ROE ne bougent pas à la journée, et la date de génération est affichée dans l'interface : un job silencieusement cassé serait sinon indiscernable d'un job sain. Le sous-onglet « Mes lignes » interroge, lui, l'API en direct — ce sont quelques symboles, exactement le dimensionnement pour lequel l'endpoint a été conçu.
- **La couverture chute sur les petites valeurs** : 96 % des champs renseignés sur le SBF 120, 88 % sur les small caps françaises, où le PER n'est publié que pour un titre sur deux (beaucoup sont en perte, ou relèvent d'Euronext Growth). `couvertureTitre` mesure cette disponibilité titre par titre.
- **Le consensus s'arrête à l'exercice suivant.** L'application affiche donc un PER estimé sur deux exercices — l'année en cours et la suivante. Pas de troisième année : elle ne pourrait qu'être extrapolée, et s'afficherait à côté de vrais consensus sans que rien ne les distingue.
- **Une donnée manquante n'est pas un échec.** Un titre dont le taux de distribution n'est pas publié n'est pas éliminé du filtre : le critère ressort « indéterminé » et le nombre de critères réellement évalués est affiché. Sans cette distinction, un titre disparaîtrait d'un écran pour une raison étrangère au filtre.

### Calendrier financier : plusieurs sources, et un statut assumé

Le calendrier couvre le portefeuille et la watchlist : résultats, dividendes, conférences, communiqués, assemblées.

**Ce qui manquait n'était pas des dates, mais leur degré de certitude.** Yahoo ne dit jamais si une date de résultats est communiquée par la société ou simplement extrapolée du rythme des trimestres précédents — les deux s'affichaient à l'identique. Il existe pourtant un aveu exploitable : quand Yahoo renvoie une **fourchette** plutôt qu'un jour, c'est que la société n'a rien annoncé. Chaque événement porte donc désormais un statut **Confirmé** ou **Estimé**, sa provenance, et l'heure de sa dernière relecture.

**Deuxième source : SEC EDGAR** (`SEC_USER_AGENT`), pour les lignes américaines. EDGAR est un registre de dépôts : il ne contient aucun calendrier prévisionnel, et on n'en tire donc aucune date future — ce serait les inventer. Il apporte deux choses que Yahoo n'a pas : les **communiqués (8-K)**, qui n'existent nulle part chez Yahoo, et une **confirmation** — un 10-Q effectivement déposé fait passer l'événement d'estimé à confirmé. Quand les deux sources décrivent le même fait, elles n'en forment qu'un seul et le dépôt réglementaire l'emporte, sans perdre les estimations d'analystes que Yahoo était seule à porter.

**Les dates sont calculées en heure de Paris.** Elles étaient dérivées en UTC : une publication américaine tombant après la clôture de New York (21 h ou 22 h UTC) était le même jour à Paris en hiver, mais le lendemain en été. Le calendrier décalait donc certaines dates d'un jour, de façon saisonnière.

**Rappel la veille** — optionnel, désactivé par défaut, et réservé aux événements **confirmés** : prévenir la veille d'une date estimée reviendrait à annoncer un rendez-vous que personne n'a fixé.

**Troisième source : info-financiere.gouv.fr**, pour les lignes françaises — sans clé, rien à configurer. Toute société cotée sur un marché français, Euronext Growth compris, doit y déposer son information réglementée, que la DILA republie en données ouvertes pour le compte de l'AMF. Elle apporte :

- les **publications déposées** — résultats, chiffre d'affaires, communiqués, documents d'assemblée — à leur date certaine et avec le lien vers le PDF. Les déclarations hebdomadaires de rachat d'actions, de droits de vote et de franchissement de seuil sont écartées : elles noyaient le reste ;
- les **dates à venir annoncées par la société elle-même**, lues dans le texte de ses trois derniers communiqués (`api/_lib/sources/agendaCommunique.js`) : l'encadré « Calendrier financier » / « Prochains rendez-vous », ou une phrase au futur (« Notre assemblée générale se tiendra le lundi 5 avril 2027 »). Une date future ailleurs dans le texte n'est pas retenue — « financer ses activités jusqu'à fin 2027 » n'est pas un rendez-vous — et une date sans jour ou sans année non plus. Ces dates sont **Confirmées** : c'est la société qui les écrit. Le communiqué le plus récent tranche quand une date a été déplacée.

Quand la société annonce sa date, l'estimation Yahoo qui tombait à quelques jours de là disparaît, au lieu de rester affichée à côté de la vraie.

**Le calendrier garde sa dernière synchronisation.** Au rechargement, il affiche aussitôt les événements de la visite précédente (« Affichage de la synchro du 24/10 15:30 — actualisation en cours… ») et les remplace quand la nouvelle synchronisation aboutit. Avant, seuls le catalogue et les saisies manuelles — calculés dans le navigateur — apparaissaient pendant toute la synchronisation : 8 événements sur 52. La liste lue par les rappels « c'est demain » n'est plus réécrite à l'ouverture avec cette seule partie.

**Le communiqué reste attaché, et se cherche au besoin.** Quand une date du catalogue ou une saisie manuelle prime sur une date d'API, l'événement garde le PDF déposé : l'agenda donne la date, le registre donne le texte. Pour une publication passée sans document — date de résultats venue de Yahoo, communiqué plus ancien que l'historique gardé —, la fiche le cherche dans le registre (le jour même, à un jour près) et dit lequel elle a trouvé. Pour des résultats, un communiqué sur un contrat le même jour n'est jamais retenu.

Quand Yahoo ne répond pas, les communiqués français restent affichés, mais le calendrier le **dit** (« dividendes et dates de résultats estimées manquent ») et cette réponse incomplète n'est pas mise en cache : le prochain « Actualiser » repart des sources.

Mesuré le 24 octobre 2026 sur 37 valeurs du SBF 120 hors CAC 40 et de small caps :

| | Yahoo seul | Avec info-financiere |
| --- | --- | --- |
| Valeurs avec au moins une date **à venir** | 6 sur 37 | **21 sur 37** |
| Valeurs avec leurs publications récentes | — | **34 sur 37** |

Pour VusionGroup, Yahoo n'avait plus rien depuis le 21 septembre — pas même le chiffre d'affaires du T3 du 20 octobre ; le calendrier montre désormais ses huit dépôts récents et son Capital Markets Day du 18 novembre. Ce qui reste sans date, c'est ce que la société n'a pas encore annoncé : la source ne devine rien.

Limites : la lecture des PDF dispose de douze secondes par requête — au-delà, les publications sont rendues sans l'agenda, que la requête suivante trouve en cache ; une société absente du registre sous son mnémonique (Coface, ou une valeur du Marché libre) n'y est pas couverte ; les valeurs étrangères cotées à Paris non plus.

### Dates d'agenda : pourquoi la saisie manuelle existe

Aucune API gratuite ne publie l'agenda **à venir** des valeurs d'Euronext sous forme de données. Ce n'est pas une supposition, c'est mesuré :

| Source | Résultat |
| --- | --- |
| Yahoo (12 valeurs du CAC) | **4 sur 12** avaient une date de résultats encore à venir, 2 sur 12 une date de dividende. Pour Schneider, Veolia et Vinci, la dernière date connue remontait à juillet |
| Yahoo, endpoint calendrier | Pour Air Liquide : deux événements en tout, tous deux de 2025 |
| Twelve Data (offre gratuite) | Refuse les symboles Euronext **y compris sur `/quote`**, et ferme `/earnings`, `/dividends` et `/earnings_calendar` à tous les plans inférieurs à « grow ». Inutilisable ici |
| Euronext | Chiffre les réponses de son propre site |
| SEC EDGAR | Ne couvre que les sociétés américaines |

Ces dates existent pourtant : elles sont publiées sur l'**agenda financier** du site investisseurs de chaque société, et le plus souvent répétées dans ses communiqués — que la source info-financiere lit désormais (voir ci-dessus). Celles qu'aucun communiqué ne reprend restent hors de portée.

Le calendrier permet donc aussi de les **saisir à la main**, avec le lien vers la source. C'est le même parti pris que `shared/ratesCatalog.js` pour les taux réglementés : quand aucune API ne sert la donnée, une référence tenue à la main, datée et sourcée, vaut mieux qu'une case vide. Ces dates **priment sur toutes les sources automatiques** — un rafraîchissement ne les écrase jamais.

### Résumés de communiqués et de résultats

Le détail d'un événement de résultats propose de résumer la publication avec le fournisseur de modèle déjà configuré (Gemini par défaut).

**Le communiqué est lu dans la fiche même.** Pour une valeur française, ouvrir un événement charge le texte du communiqué déposé sur info-financiere.gouv.fr (`/api/market?action=communique`), débarrassé des en-têtes et pieds de page répétés à chaque page ; pour une date à venir, c'est le communiqué qui l'**annonce**, et la fiche le dit. Le bouton « Résumer ce communiqué » part directement de ce document. La lecture du texte ne demande pas de compte — c'est un document public, et seul l'entrepôt de la DILA est accepté — mais le résumé, qui coûte un appel de modèle, en demande toujours un.

**Les chiffres publiés sont remis dans l'historique de la société.** Un résumé ne dit pas si des résultats sont bons : une croissance de 5 % est excellente pour une société qui en faisait 2, inquiétante pour une qui en faisait 25. Chaque résumé est donc suivi d'une **grille de critères calculée par le code** (`shared/interpretationResultats.js`), jamais par le modèle :

| Critère | Comparé à | Verdict |
| --- | --- | --- |
| Croissance du chiffre d'affaires | médiane des croissances annuelles passées | ±3 points : accélération, tendance, ralentissement ; recul si négative |
| Marges (EBITDA, opérationnelle, nette) | la **même** marge, en médiane sur les exercices passés (12 derniers mois pour l'opérationnelle) | ±1 point : amélioration, stable, dégradation |
| Résultat net, free cash-flow | leur signe | hausse ou baisse, trésorerie générée ou consommée |
| Endettement (dette nette / EBITDA) | repères usuels des prêteurs | ≤ 1 faible, ≤ 2,5 modéré, au-delà élevé |
| Perspectives | la guidance précédente, sinon le mot du communiqué | relevée, maintenue ou confirmée, abaissée ou suspendue |
| Promesses tenues | les guidances des publications déjà résumées | ≥ 75 % tenues ou ≤ 40 %, à partir de deux précédents |
| Valorisation | médiane des PER passés, sur trois exercices bénéficiaires au moins | ±20 % |

L'historique est celui de la fiche Marché (comptes annuels, consensus). La référence est une **médiane**, pas une moyenne : les ratios d'une petite valeur sont heurtés — la conversion en trésorerie de Vusion va de −1 393 % à 202 % selon l'exercice — et une seule année aberrante suffit à fausser une moyenne. Ce qui ne peut pas être jugé est affiché comme tel, jamais compté neutre ; un trimestre ou un semestre comparé à des exercices complets porte une mise en garde sur la saisonnalité.

Le modèle intervient deux fois, chaque fois sous contrôle : il **extrait** du communiqué des indicateurs normalisés (croissance, marges, free cash-flow, levier, statut de la guidance), recopiés tels quels et confrontés au texte — un indicateur introuvable est écarté et rend le résumé incertain ; puis il **rédige l'interprétation** (lecture d'ensemble, points solides, points de vigilance, à surveiller) à partir de la grille, sans pouvoir contredire un verdict ni citer un chiffre absent du communiqué et de l'historique. Si le temps manque pour ce second appel, la grille part seule.

**Aucun chiffre n'est pris au mot.** Tout nombre avancé par le modèle est confronté au texte source ; ceux qui ne s'y retrouvent pas sont **retirés et comptés**, et le résumé est alors marqué « incertain » plutôt que réparé en silence. Un modèle qui « arrondit » 4 732 M€ en 4,7 Md€ produit une valeur absente du communiqué : indiscernable d'une invention, donc traitée comme telle. La consigne lui interdit explicitement de calculer, d'arrondir ou de convertir.

La **guidance** est comparée à la précédente sur le milieu de fourchette (relevée, maintenue, abaissée), et l'historique permet de dire si l'entreprise a **tenu ses promesses passées** — les exercices sans réalisé connu sont ignorés plutôt que comptés comme manqués.

**Confidentialité** : la route `/api/resume` ne reçoit qu'un symbole et du texte **déjà public**. Jamais un montant, jamais une quantité, jamais un nom de compte. Elle exige un jeton de session, comme l'assistant, parce que son abus coûte le quota du fournisseur de modèle.

Deux façons de fournir le texte : un lien vers un document **de la SEC ou d'info-financiere.gouv.fr** (liste blanche stricte — récupérer une URL arbitraire ferait de la fonction un relais vers le réseau interne de l'hébergeur), ou le **texte collé**, qui reste la voie pour les autres sociétés européennes et ne scrape rien. Sans fournisseur de modèle configuré, l'écran affiche le lien et le texte brut, sans résumé.

Ton neutre : aucune recommandation d'achat, de vente ou de conservation, aucune cible de cours.

### Quand la source de cours tombe

Toutes les données de marché — cours, change, fondamentaux, calendrier, fiches — viennent d'une seule source non officielle. Une panne de sa part se manifestait par une série d'échecs isolés dont rien ne donnait la cause commune : un cours qui ne bouge plus, une fiche vide, un screener sans résultat. On en concluait naturellement que son propre portefeuille ou son propre filtre était en cause.

`/api/market?action=health` interroge donc un symbole témoin — le CAC 40, qui ne peut être ni radié ni suspendu durablement — et renvoie un verdict explicite. L'application affiche un bandeau « source de cours indisponible » après **deux** vérifications négatives consécutives, pour ne pas clignoter sur un incident d'une seconde, et le retire dès le retour à la normale.

Le contrôle porte sur la **valeur** renvoyée, pas sur le statut HTTP : le mode d'échec le plus courant de cette source est une réponse 200 au corps vide.

### Devises

Les positions cotées hors zone euro sont converties au taux du jour, récupéré en même temps que les cours (`/api/market?action=fx`). Le prix de revient est converti à ce même taux : la plus-value affichée inclut donc l'effet de change sans le distinguer de la performance du titre — l'interface le signale. Une position dont le taux n'a pas pu être récupéré est comptée à parité 1:1, et l'avertissement le dit explicitement.

### Mode Ghost

Le bouton en forme d'œil floute tous les montants, y compris les graduations des graphiques, pour pouvoir montrer son écran sans exposer ses chiffres. Survoler une valeur la révèle temporairement. Les graphiques de données publiques (performance sectorielle) ne sont pas floutés.

### Sécurité de l'assistant

`/api/advisor` exige un jeton de session Supabase valide dès que Supabase est configuré. C'est la seule route dont l'abus coûte quelque chose : une question déclenche jusqu'à douze appels au fournisseur de modèle. Le contrôle d'origine ne suffisait pas — une requête sans en-tête `Origin` est le cas nominal du navigateur en same-origin, mais aussi celui d'un `curl`.

## Stack technique

- **Frontend** : React 19 + Vite 8 + Tailwind CSS 3, `recharts` pour les graphiques, `lucide-react` pour les icônes
- **Backend** : fonctions serverless Vercel dans `api/` (aucun framework). **Trois fonctions seulement**, et c'est une contrainte assumée : Vercel compte une fonction par fichier de `api/`, et le plan Hobby en autorise douze.
  - `api/market.js` — routeur unique des données de marché : `?action=quote|search|history|calendar|profile|fx|screen|fundamentals|rates|health`. Chaque route garde ses propres quotas et sa propre durée de cache, déclarés dans `api/_lib/routes/`.
  - `api/advisor.js` — assistant Horizon (`maxDuration: 60`, authentification obligatoire).
  - `api/parse-pdf.js` — import de relevés (corps jusqu'à 12 Mo).

  Les fichiers de test qui vivent à côté des endpoints sont exclus par `.vercelignore` : Vercel les déployait comme de vraies fonctions, ce qui les rendait publiquement accessibles et les faisait compter dans le quota.
- **Code partagé** : `shared/` regroupe les modules chargés à la fois par le navigateur et par les fonctions serverless (moteur Horizon, anonymiseur, adaptateurs de modèles, catalogue de taux). La frontière est explicite plutôt que dissimulée dans des imports `../src/lib`
- **Auth & synchronisation** : Supabase (Postgres + Auth), optionnel
- **Stockage** : `localStorage` en cache local systématique, Supabase en miroir si un compte est connecté
- **Tests** : Vitest — `npm test`
- **Lint** : ESLint 9 en configuration « à plat » (`eslint.config.js`). Le projet est à **zéro avertissement** : toute nouvelle occurrence se voit donc immédiatement. Les quelques exceptions à `react-hooks/set-state-in-effect` portent chacune, sur place, un `eslint-disable-next-line` accompagné de sa raison — un effet qui LANCE un chargement lève légitimement son témoin avant l'appel réseau.

  ESLint reste en 9 et non en 10 : `eslint-plugin-react` 7.37.5, la dernière version publiée, déclare `eslint@^9.7` en pair et **échoue réellement** sur ESLint 10 (`contextOrFilename.getFilename is not a function`). C'est un plafond de l'écosystème, à relever dès que le greffon suit.

### Scripts

```bash
npm run dev        # serveur de développement Vite
npm run build      # build de production
npm test           # tests unitaires
npm run lint       # ESLint
npm run format     # Prettier
npm run verify     # lint + tests + build (ce que fait la CI)
```

---

## 🚀 Déploiement sur Vercel

C'est la façon la plus simple d'avoir un vrai site avec les cours de bourse fonctionnels (les fonctions de `api/` ne tournent que sur Vercel ou via `vercel dev`, pas avec un simple `npm run dev`).

### 1. Pousser le projet sur GitHub

```bash
git init
git add .
git commit -m "Initial commit — Patrium"
```

Crée un dépôt vide sur [github.com/new](https://github.com/new), puis :

```bash
git remote add origin https://github.com/<ton-pseudo>/<nom-du-repo>.git
git branch -M main
git push -u origin main
```

### 2. Importer le projet sur Vercel

1. Va sur [vercel.com/new](https://vercel.com/new)
2. Sélectionne le dépôt
3. Vercel détecte **Vite** automatiquement
4. Renseigne les variables d'environnement (section suivante), puis **Deploy**

À chaque `git push` sur `main`, Vercel redéploie. Le workflow GitHub Actions (`.github/workflows/ci.yml`) lance lint + tests + build sur chaque push et chaque pull request.

### 3. Variables d'environnement

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | non | URL du projet Supabase. Absente ⇒ mode local pur, sans compte |
| `VITE_SUPABASE_ANON_KEY` | non | Clé publique Supabase (protégée par RLS) |
| `ALLOWED_ORIGINS` | non (voir ci-dessous) | Origines **supplémentaires** autorisées à appeler `api/*`, séparées par des virgules. Le domaine de production est déjà accepté automatiquement ; à renseigner pour un domaine personnalisé non encore rattaché au projet, ou une autre origine légitime |
| `WEBSTAT_CLIENT_ID` | non | Identifiant client Banque de France (Webstat), pour rafraîchir en direct quelques taux du sous-onglet Taux. Absent ⇒ catalogue de référence maintenu à la main (voir plus bas) |
| `SEC_USER_AGENT` | non | En-tête de contact exigé par la SEC (`"Patrium contact@domaine.fr"`), pour enrichir le calendrier des dépôts réglementaires américains. Absent ⇒ source éteinte, Yahoo seul |

Les variables préfixées `VITE_` sont **intégrées au JavaScript envoyé au navigateur** : elles sont donc publiques par construction. C'est acceptable pour la clé `anon` de Supabase (c'est son rôle, la sécurité repose sur RLS) ; n'y mets jamais de clé de service.

### 4. Créer la table Supabase

Exécute `sql/schema.sql` dans l'éditeur SQL de ton projet Supabase. La table est protégée par RLS : chaque utilisateur ne voit que ses propres lignes.

### 5. (Optionnel) Domaine personnalisé

Réglages du projet Vercel → **Domains**.

⚠️ **Confidentialité** : l'URL Vercel est publique. N'importe qui avec le lien peut ouvrir la page de connexion — mais sans identifiants, aucune donnée n'est accessible.

---

## 💻 En local

### Frontend seul (sans cours de bourse)

```bash
npm install
npm run dev
```
→ `http://localhost:5173`. Tout fonctionne sauf ce qui dépend de `api/`.

### Avec les fonctions serverless

```bash
npm install -g vercel
vercel dev
```
→ frontend **et** fonctions `api/*` ensemble, comme en production.

---

## 🔎 Données de marché : ce qu'il faut savoir

- Cours, recherche, historique, calendrier et fiches entreprise passent par l'endpoint **non officiel** de Yahoo Finance. C'est gratuit et sans clé API, mais **non documenté et non garanti** : il peut ralentir, tomber ou changer de comportement sans préavis.
- Les fiches entreprise passent en plus par un endpoint public de Google Translate pour la traduction en français, avec repli silencieux sur le texte anglais en cas d'échec. Même réserve : service non contractuel.
- En cas d'échec, l'app **ne plante jamais** : un message s'affiche et la saisie manuelle reste possible.
- Toute la couche d'accès est centralisée dans `api/_lib/yahoo.js`. Pour changer de fournisseur ou ajouter un fournisseur de secours, c'est le seul fichier à toucher — le frontend (`src/lib/api.js`) est inchangé.

### Fournisseurs de données boursières gratuits — pour aller plus loin

Yahoo Finance couvre aujourd'hui l'intégralité des besoins (cours, recherche, historique, calendrier, fiches entreprise) mais reste un endpoint non officiel. Voici les alternatives gratuites les plus sérieuses si un jour il fallait le doubler ou le remplacer — aucune n'est branchée dans le code actuel, elles sont documentées ici pour une implémentation future :

| Fournisseur | Quota gratuit | Nécessite une clé | Points forts | Limites |
| --- | --- | --- | --- | --- |
| **Finnhub** | 60 req/min | Oui (gratuite, email) | Quota généreux, cours temps réel, profils d'entreprise, recherche de symbole | Chandeliers (historique intraday/quotidien) **non inclus** dans le plan gratuit |
| **Twelve Data** | 800 crédits/jour | Oui (gratuite, email) | Bonne couverture d'échanges internationaux, séries temporelles complètes | Données différées de 4h sur le plan gratuit |
| **Alpha Vantage** | 5 req/min, 25/jour | Oui (gratuite, email) | Doyen du secteur, très documenté | Quota très bas, données différées de 15 min |
| **Frankfurter.app** | Illimité | **Non** | Taux de change officiels BCE, aucune clé requise, idéal pour un ETF/action coté en devise étrangère | Uniquement des taux de change, pas de cours d'actions/ETF |
| **EODHD** | Essai limité | Oui | Couverture large (actions, crypto, forex, fondamentaux) une fois payant | Plan gratuit très restreint, l'essentiel est payant |

Recommandation si l'app devait un jour se doubler d'un fournisseur de secours : **Finnhub** pour les cours (quota le plus confortable), complété par **Frankfurter.app** pour les taux de change — le seul des deux à ne nécessiter aucune inscription.

### Protections des endpoints `api/*`

Les fonctions sont publiques par nature (pas d'authentification, elles ne servent que des données de marché publiques), mais elles ne sont plus un proxy ouvert :

- **Origine** : les requêtes navigateur venant d'un domaine non autorisé sont rejetées (403). Sont acceptés : le domaine de production (`VERCEL_PROJECT_PRODUCTION_URL`), l'URL du déploiement courant (`VERCEL_URL`) et tout ce que liste `ALLOWED_ORIGINS`.

  ⚠️ **`VERCEL_URL` ne suffit pas, et c'est contre-intuitif.** Elle désigne le *déploiement* (`patriapp-m6h8f0z1a-….vercel.app`, différente à chaque mise en ligne), jamais l'adresse à laquelle les utilisateurs arrivent. Tant qu'elle était la seule origine Vercel acceptée, l'application se refusait elle-même — sans que cela se voie sur les cours, puisqu'un navigateur n'envoie pas d'en-tête `Origin` sur un GET same-origin. Seules les **deux routes en POST** étaient touchées, la spécification Fetch imposant l'en-tête même same-origin : l'import de relevés PDF et l'assistant Horizon répondaient « Origine non autorisée » à tous les utilisateurs. D'où l'ajout de `VERCEL_PROJECT_PRODUCTION_URL`, qui porte le domaine stable (personnalisé s'il existe, sinon `<projet>.vercel.app`).
- **Débit** : fenêtre glissante par IP et par endpoint (de 10 req/min pour `parse-pdf` à 120 pour `quote`)
- **Cache** : mémoire + `s-maxage` CDN, pour ne pas retaper Yahoo à chaque rechargement de page
- **Validation** : les symboles sont filtrés par expression régulière stricte avant toute interpolation dans une URL externe
- **Upload** : `parse-pdf` plafonne la taille, vérifie la signature `%PDF-` et refuse tout le reste

Limite connue : le compteur de débit et le cache sont **par instance serverless** (mémoire locale, remise à zéro à froid). C'est suffisant pour couper un abus grossier ; un quota strict demanderait un store partagé (Vercel KV / Upstash Redis).

Deux points méritent d'être connus, parce qu'ils ont chacun rendu une protection inopérante sans qu'aucune erreur ne le signale :

- **Le compartiment de débit est la ROUTE, pas le chemin.** Les dix actions partagent l'URL `/api/market` : en déduisant le compartiment du chemin, elles partageaient aussi un unique compteur. La limite réellement appliquée était donc la plus basse des dix, et consulter ses cours (`quote`, 120/min) suffisait à faire répondre 429 au premier appel du screener (`screen`, 20/min), dont le quota n'avait pourtant jamais servi. D'où l'option `portee`, passée par `market.js` à chaque enveloppe.
- **`Vary: Origin` est posé sans condition, y compris sur les refus.** Il n'était écrit que sur les réponses portant un en-tête `Origin`. Or toutes les routes de marché déclarent un `s-maxage` : le CDN mettait en cache la réponse d'une requête *sans* `Origin` — le cas nominal du navigateur en same-origin — sous une clé indépendante de l'origine, puis la servait à n'importe qui. Vérifié en production avant correctif : `Origin: https://evil.example` recevait 200 depuis le cache, alors que le même appel forcé en MISS recevait bien 403. Le contrôle d'origine fonctionnait parfaitement et n'était simplement jamais atteint.

### En-têtes de sécurité du document (`vercel.json`)

Les en-têtes posés par `withApi` ne couvrent que `/api/*`. La **page**, elle, n'en portait aucun — alors que c'est elle qui détient le jeton de session Supabase dans le `localStorage`, aux côtés de toutes les données patrimoniales : tout script qui s'y exécute peut lire les deux.

`vercel.json` applique donc à tout ce qui n'est pas `/api/*` (ces routes gardent les leurs, et une politique de contenu n'a aucun sens sur du JSON) :

| En-tête | Rôle |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`, aucune exception pour les scripts |
| `X-Frame-Options: DENY` | doublon de `frame-ancestors` pour les navigateurs qui l'ignorent encore |
| `X-Content-Type-Options: nosniff` | pas de deviner-le-type |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | caméra, micro et géolocalisation refusés — aucun n'est utilisé |

Trois assouplissements, et seulement trois :

- `style-src 'unsafe-inline'` — les composants Orbit injectent une balise `<style>`, et l'interface pose ~70 attributs `style={{…}}` (recharts en particulier). `script-src` n'a **aucune** exception : le build Vite ne produit ni script ni style *inline* dans `index.html`, c'est vérifiable sur `dist/`.
- `img-src … https://icons.duckduckgo.com` — source des logos d'entreprise (`AssetLogo.jsx`).
- `connect-src … https://*.supabase.co` — l'authentification et la synchronisation. Un projet Supabase servi depuis un **domaine personnalisé** ne correspondrait pas à ce motif et la connexion échouerait : c'est la seule ligne à adapter en cas de changement d'hébergement.

⚠️ **À savoir** : les logos d'entreprise sont demandés à `icons.duckduckgo.com`, qui apprend donc quels titres tu consultes. C'est le même type de fuite que les tickers envoyés à Yahoo, et il n'était pas mentionné dans le tableau « Où vont tes données » ci-dessus.

## 💶 Sous-onglet Taux (Livrets & Épargne)

Barème centralisé des taux réglementés, de crédit, de banques centrales, d'inflation et de fiscalité, avec recherche, filtres par catégorie et comparaison automatique aux livrets réellement détenus (`src/components/RatesHub.jsx`).

**Pourquoi ce n'est pas branché en direct sur l'API Webstat de la Banque de France** — vérifié par appel direct au moment de l'implémentation : le catalogue **public et sans clé** de Webstat (`https://webstat.banque-france.fr/api/explore/v2.1/...`, Opendatasoft Explore API) ne sert que des **métadonnées de recherche**. Sur plus de 42 000 jeux de données catalogués, un seul expose des enregistrements requêtables via cette API publique, et ce n'est pas une série de taux. Les valeurs réelles (taux du Livret A, du LEP, du CEL...) ne sont accessibles qu'via l'**API sécurisée** `api.webstat.banque-france.fr`, avec un identifiant client (`X-IBM-Client-Id`) obtenu par inscription gratuite sur [developer.webstat.banque-france.fr](https://developer.webstat.banque-france.fr/).

En conséquence, l'onglet fonctionne en **deux couches**, comme le reste de l'app avec Yahoo/Supabase :

1. **Catalogue de référence** (`shared/ratesCatalog.js`) — la source de vérité par défaut : taux officiels maintenus à la main, chacun avec sa date d'entrée en vigueur, sa date de révision connue et sa source citée. Valeurs vérifiées le 26/07/2026 (Livret A 1,70 %, LDDS 1,70 %, LEP 2,50 %, CEL 1,25 % brut, PEL 1,75 % brut, taux d'usure crédit ≥20 ans 5,19 %, BCE dépôt/refi/prêt marginal 2,25/2,40/2,65 %, inflation INSEE +1,8 % sur un an).
2. **Rafraîchissement live optionnel** (`api/_lib/routes/rates.js` + `api/_lib/webstat.js`, servis par `/api/market?action=rates`) — si `WEBSTAT_CLIENT_ID` est configuré, l'endpoint tente de récupérer la dernière observation des quelques séries dont la clé Webstat est confirmée (Livret A, LEP, CEL) et remplace la valeur de référence en cas de succès ; sinon la référence reste affichée, avec un badge « Référence » plutôt que « Live ».

Sans clé configurée ni connexion à `/api/rates` (ex : `npm run dev` sans `vercel dev`), l'onglet retombe sur le catalogue de référence importé directement côté client — jamais d'onglet vide ni d'erreur bloquante.

**Pour aller plus loin** : élargir `RATES_CATALOG` (Euribor 12 mois, taux d'usure par durée, PASS, barème de l'IR...), ou identifier davantage de `seriesKey` Webstat confirmées pour étendre le rafraîchissement live au-delà des trois séries actuelles.

## 🗂️ Structure du projet

L'arborescence complète et à jour est dans `structure.txt`, régénéré par
`npm run structure` et vérifié par la CI. Les grandes lignes :

```
patrium/
├── api/                        # 3 fonctions serverless Vercel (quota Hobby : 12)
│   ├── _lib/
│   │   ├── http.js             # CORS, limitation de débit, cache, erreurs
│   │   ├── auth.js             # vérification du jeton Supabase (advisor)
│   │   ├── yahoo.js            # accès Yahoo mutualisé, session, validation
│   │   ├── yahooFondamentaux.js
│   │   ├── pdfParsing.js       # extraction des relevés (fonctions pures, testées)
│   │   ├── webstat.js          # taux Banque de France (optionnel)
│   │   └── routes/             # une route = un fichier, monté par market.js
│   │       ├── quote.js  search.js  history.js  calendar.js  profile.js
│   │       └── fx.js  screen.js  fundamentals.js  rates.js  health.js
│   ├── market.js               # routeur unique : ?action=quote|search|…
│   ├── advisor.js              # assistant Horizon (maxDuration 60, auth requise)
│   └── parse-pdf.js            # import de relevés de courtage
├── shared/                     # modules chargés par le navigateur ET par api/
│   ├── horizon.js  horizonOutils.js  orchestrateur.js  adaptateursLLM.js
│   ├── anonymiser.js           # base 100 + audit de fuite
│   └── ratesCatalog.js  screener.js  dividendes.js  reequilibrage.js  …
├── public/                     # manifest PWA, service worker, icônes, orbit-header.js
├── sql/
│   └── schema.sql              # table kv_store + RLS
├── src/
│   ├── components/             # composants d'interface
│   │   ├── Dashboard.jsx  Livrets.jsx  Bourse.jsx  Simulation.jsx
│   │   ├── Immobilier.jsx  StrategieLogs.jsx  Abonnements.jsx  Screener.jsx
│   │   ├── Login.jsx  ErrorBoundary.jsx  SyncIndicator.jsx  BackupReminder.jsx
│   │   ├── EtatSourceMarche.jsx   # bandeau « source de cours indisponible »
│   │   ├── MiseAJourDisponible.jsx # bandeau « nouvelle version prête »
│   │   ├── Marche.jsx  Watchlist.jsx  Timeline.jsx  Operations.jsx  …
│   │   └── ui.jsx              # briques partagées (Card, AddPanel, Skeleton…)
│   ├── lib/
│   │   ├── PatrimoineContext.jsx  # état patrimonial + valeurs dérivées
│   │   ├── AuthContext.jsx        # session Supabase
│   │   ├── ToastContext.jsx       # notifications
│   │   ├── ConfirmContext.jsx     # dialogue de confirmation accessible
│   │   ├── storage.js             # persistance locale + synchro cloud
│   │   ├── syncStatus.js          # état de synchronisation
│   │   ├── finance.js             # formules financières
│   │   ├── authErrors.js          # messages d'auth en français, robustesse mdp
│   │   ├── useHashRoute.js        # onglet ↔ URL
│   │   ├── useDailySnapshot.js    # relevé quotidien du patrimoine
│   │   ├── useMaintenant.js       # instant stable pour les badges de fraîcheur
│   │   └── api.js                 # appels vers api/*
│   ├── App.jsx                 # coquille de navigation
│   ├── main.jsx                # providers + service worker
│   └── index.css
├── .github/workflows/ci.yml
├── eslint.config.js            # ESLint 9, configuration « à plat »
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.cjs
└── postcss.config.cjs
```

## 🧱 Modèle de données — limite assumée

Supabase sert de **stockage clé/valeur JSON**, pas de base relationnelle : une seule table `kv_store` avec une ligne par (utilisateur, clé). Conséquences à connaître :

- Aucune validation ni contrainte côté serveur — la forme des données est garantie uniquement par le code client
- Aucune requête ni agrégation possible en SQL
- **Pas de fusion en cas de conflit** : deux appareils modifiant la même clé hors ligne ne fusionnent pas, le dernier à se reconnecter gagne. L'arbitrage se fait sur l'horodatage de dernière modification (`updated_at`), ce qui évite l'écrasement d'une modification locale par une version cloud plus ancienne, mais ne remplace pas un vrai merge.

Passer à un schéma relationnel (tables `positions`, `operations`, `livrets`…) est le prérequis à toute fusion fine, à des statistiques côté serveur et à des migrations propres.

## 🛠️ Pour aller plus loin

- Découper `Bourse.jsx` (~1 100 lignes), `Dashboard.jsx` (~970) et `ProChart.jsx` (~820) en sous-composants, et les faire lire `usePatrimoine()` au lieu de recevoir l'état complet en props
- Passer à un schéma Supabase relationnel (voir ci-dessus)
- Support multi-devises (l'euro est aujourd'hui codé en dur dans le formatage et le parsing PDF)
- Virtualisation des longues listes d'opérations
- Quota de débit partagé entre instances serverless (Vercel KV)
- Rééquilibrage de portefeuille PEA + diversification sectorielle/géographique
- Injection automatique de l'apport immobilier depuis le module Simulation
