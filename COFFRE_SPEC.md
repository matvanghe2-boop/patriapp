# Coffre — Spécification détaillée

> Onglet **« Coffre »** de **Patrium**. Coffre à papiers chiffré de bout en bout :
> pièces d'identité, assurances, factures et garanties, logement, études,
> impôts — avec leurs dates d'échéance et des rappels dans l'agenda du
> téléphone.
>
> Statut : **spec validée le 2026-10-31. Jalon 1 (coffre de base) et jalon 2
> (rappels) livrés, en attente du bloc SQL à exécuter dans Supabase.**
> Cadrage fait le 2026-10-31 (décisions au §14).
> Dernière mise à jour : 2026-10-31

---

## 1. Objectif et périmètre

### Le problème

Les papiers importants vivent aujourd'hui un peu partout : un tiroir, des
pièces jointes de mails, la galerie du téléphone. Deux conséquences :

- on ne les a jamais sous la main quand on en a besoin (attestation
  d'assurance pour le bail, carte de mutuelle à la pharmacie, facture pour
  faire jouer une garantie) ;
- on découvre une échéance trop tard : un passeport périmé la veille d'un
  voyage, alors que les rendez-vous en mairie se prennent des semaines à
  l'avance, ou une garantie expirée d'un mois.

Patrium sait déjà répondre à « qu'est-ce qui arrive bientôt ? » pour l'argent
(`echeances.js`). Le coffre étend la question aux papiers, et range les
papiers eux-mêmes.

### Ce que fait le coffre

1. **Ranger** un document (PDF ou photo) avec un type, un titre et ses dates.
   Le fichier est chiffré **dans le navigateur** avant de partir vers Supabase.
2. **Retrouver** et afficher un document sur le téléphone ou l'ordinateur.
3. **Prévenir** avant l'échéance, avec un délai qui dépend du type de
   document : le rappel atterrit dans l'agenda du téléphone, ainsi que dans
   « Prochaines échéances » et le centre « À faire » de Patrium.
4. **Recevoir** un document depuis n'importe quelle appli Android via le menu
   Partager (scanner du téléphone, pièce jointe Gmail, téléchargement).

### Ce que le coffre ne fait pas

- **Aucune IA, aucun OCR, aucun envoi à un tiers.** Les dates se saisissent à
  la main. Pour un PDF qui contient du texte, le coffre propose les dates qu'il
  y trouve, et cette lecture se fait sur l'appareil (pdf.js, déjà utilisé pour
  les relevés de compte courant).
- **Aucun accès sans le chiffrement.** Le coffre refuse de fonctionner tant que
  le chiffrement de bout en bout de Patrium n'est pas actif (§5).
- **Pas de scanner intégré** dans un premier temps : le scanner du téléphone
  fait mieux (recadrage, redressement, contraste) et l'on partage le résultat
  vers le coffre.
- **Pas d'inventaire des objets** dans un premier temps (jalon 6).
- **Pas d'accès d'urgence pour un proche** pour l'instant (§11).

### Intégration

**Huitième onglet de Patrium**, chargé à la demande (`React.lazy`, comme les
sept autres). Sur mobile, il apparaît dans la feuille « Plus » de la barre
basse, et un **raccourci d'application** Android (appui long sur l'icône de
Patrium → « Coffre ») y mène directement.

```
Patrium
 ├── Dashboard … Abonnements   (existant)
 └── Coffre                    ← nouveau, #/coffre
      ├── Documents            (liste, par catégorie)
      ├── Échéances            (ce qui arrive, rappels d'agenda)   — jalon 2
      └── Réglages             (délais par type, agenda, espace)   — jalon 2
```

Le coffre réutilise :

| Brique existante | Usage dans le coffre |
|---|---|
| `src/lib/chiffrement.js` (AES-GCM 256, PBKDF2) | Clé maîtresse et format d'enveloppe |
| `src/lib/storage.js` (`usePersistentState`, synchro, chiffrement E2E) | Métadonnées du coffre, chiffrées dans le cloud sans code de synchro neuf |
| `src/lib/supabaseClient.js`, `AuthContext.jsx` | Compte et client Supabase, dont `supabase.storage` |
| `src/lib/lirePdf.js` | Aperçu des PDF et suggestion de dates, sur l'appareil |
| `src/lib/echeances.js`, `CentreAFaire.jsx`, `Notifications.jsx` | Rappels visibles dans Patrium |
| `public/sw.js`, `public/manifest.json` | Réception du partage Android, raccourci |

**Raisons du choix de l'onglet** (plutôt qu'une appli à part) : même projet
Supabase, que l'usage quotidien de Patrium garde éveillé (un projet gratuit est
mis en pause après une semaine sans activité) ; chiffrement, synchro, appli
installable et échéances déjà en place ; aucun poids au démarrage, puisque
l'onglet ne se charge qu'à l'ouverture.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Navigateur (téléphone ou ordinateur)                         │
│                                                                │
│  Onglet Coffre ──► coffre.js (modèle, échéances, agenda)       │
│        │                                                       │
│        ├──► coffreFichiers.js  ── chiffre / déchiffre ──┐      │
│        │       (clé de fichier aléatoire, enveloppée     │      │
│        │        par la clé maîtresse de Patrium)         │      │
│        │                                                 ▼      │
│        └──► usePersistentState("coffre")      supabase.storage │
│                 │  (métadonnées, chiffrées      bucket "coffre" │
│                 │   par storage.js)             (octets chiffrés)│
└─────────────────┼─────────────────────────────────────┼────────┘
                  ▼                                     ▼
          table kv_store (RLS)                storage.objects (RLS)
```

### Principe directeur

**Le serveur ne voit que du chiffré.** Le nom, le type, les dates et le
contenu d'un document ne quittent l'appareil qu'après chiffrement. Côté
Supabase, on ne trouve que des blocs d'octets anonymes (`<user_id>/<uuid>.bin`),
leur taille et leur date d'envoi.

---

## 3. Chiffrement

### 3.1 Hiérarchie des clés

```
phrase secrète ──PBKDF2──► clé maîtresse Patrium (K)       existant
                              │
                              ├── chiffre les métadonnées « coffre » dans kv_store
                              │     (comme toutes les autres clés de Patrium)
                              │
                              └── enveloppe une clé de fichier (Kf) par fichier
                                     │
                                     └── chiffre les octets du fichier
```

- **Kf** : clé AES-GCM 256 tirée au hasard pour chaque fichier
  (`crypto.subtle.generateKey`).
- **Kf enveloppée** : `chiffrer(K, octetsBruts(Kf))`, au format d'enveloppe
  existant `{ __chiffre: 1, iv, donnees }`, rangée dans les métadonnées du
  document.

Pourquoi une clé par fichier plutôt que K directement :

1. une **sauvegarde JSON** de Patrium (export, sauvegarde automatique,
   transfert par QR) contient les métadonnées du coffre. Avec des Kf
   enveloppées, la sauvegarde seule ne permet pas d'ouvrir les fichiers ;
2. **changer de clé maîtresse** (jalon 4) ne demandera que de réenvelopper les
   Kf, sans retélécharger ni rechiffrer un seul fichier ;
3. cela prépare le **partage d'un seul document** (accès d'urgence, §11).

### 3.2 Format d'un fichier chiffré

```
octet 0      : version du format (1)
octets 1–12  : vecteur d'initialisation AES-GCM (aléatoire, 12 octets)
octets 13–…  : texte chiffré + étiquette d'authenticité (16 octets)
```

Envoyé tel quel (`application/octet-stream`) vers
`coffre/<user_id>/<fichierId>.bin`. Le type MIME réel et le nom d'origine
restent dans les métadonnées chiffrées.

Un fichier altéré, ou une mauvaise clé, fait échouer le déchiffrement
(AES-GCM est authentifié) : l'interface affiche « fichier illisible » et ne
montre jamais d'octets corrompus.

### 3.3 Verrouillage

Choix assumé au cadrage : **le coffre reste ouvert sur l'appareil**, comme le
reste de Patrium (la clé K est gardée localement). La protection contre le vol
repose sur le **verrouillage du téléphone**, puisqu'Android chiffre son
stockage.

Ajout : un bouton **« Verrouiller cet appareil »**, qui oublie la clé locale.
La phrase secrète sera alors redemandée. Utile avant de prêter l'ordinateur ou
de rendre un téléphone. Une fonction `verrouillerCetAppareil()` est à exposer
dans `storage.js`, qui possède déjà `oublierCleLocale()` en interne.

---

## 4. Stockage

### 4.1 Métadonnées

Une clé `usePersistentState("coffre")`, ajoutée à `STORAGE_KEYS` : elle est
donc synchronisée, chiffrée dans le cloud, exportée dans les sauvegardes et
transférée par QR comme le reste.

En local, elle est en clair dans le localStorage, comme toutes les données de
Patrium. C'est cohérent avec le choix « ouvert sur l'appareil ». Les fichiers,
eux, ne sont jamais stockés en clair.

Les conflits sont arbitrés comme ailleurs (la dernière écriture gagne, clé par
clé). Modifier le coffre sur deux appareils à la même seconde fait perdre
l'une des deux modifications : c'est acceptable pour un usage personnel.

### 4.2 Fichiers

Bucket Supabase Storage **privé** `coffre`, avec une **limite de 20 Mo par
fichier** (le plafond gratuit est de 50 Mo, et un scan de papier pèse
rarement plus de 2 Mo). L'offre gratuite donne 1 Go, soit plusieurs centaines
de documents.

À ajouter dans `sql/schema.sql` (à exécuter une fois dans l'éditeur SQL de
Supabase, comme le reste du fichier) :

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('coffre', 'coffre', false, 20971520)
on conflict (id) do nothing;

-- Chaque utilisateur ne voit, n'écrit et ne supprime QUE son dossier
-- « <user_id>/ ». Pas de politique UPDATE : un fichier n'est jamais modifié,
-- il est remplacé (nouvel envoi, puis suppression de l'ancien).
drop policy if exists "coffre: lire ses fichiers" on storage.objects;
create policy "coffre: lire ses fichiers" on storage.objects for select to authenticated
  using (bucket_id = 'coffre' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "coffre: envoyer ses fichiers" on storage.objects;
create policy "coffre: envoyer ses fichiers" on storage.objects for insert to authenticated
  with check (bucket_id = 'coffre' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "coffre: supprimer ses fichiers" on storage.objects;
create policy "coffre: supprimer ses fichiers" on storage.objects for delete to authenticated
  using (bucket_id = 'coffre' and (storage.foldername(name))[1] = auth.uid()::text);
```

La politique de contenu (`vercel.json`) autorise déjà `https://*.supabase.co`
en `connect-src`, et `blob:` en `img-src` pour l'aperçu des images.

### 4.3 Ordre des écritures

- **Ajout** : chiffrer, envoyer le fichier, **puis** écrire les métadonnées.
  Si l'écriture des métadonnées échoue, il reste un fichier orphelin, illisible
  et sans référence, mais aucune métadonnée ne pointe vers un fichier absent.
- **Suppression** : retirer les métadonnées, **puis** supprimer le fichier. Un
  échec laisse là aussi un orphelin.
- Les orphelins se nettoient depuis « Santé des données » (jalon 5) : les
  fichiers du dossier que plus aucun document ne référence.
- **« Tout réinitialiser »** vide d'abord tout le dossier `coffre/<user_id>/`,
  puis efface les données : sans cela, des scans de pièces d'identité
  resteraient dans le stockage.

---

## 5. Prérequis : compte et chiffrement

| Situation | Ce qu'affiche le coffre |
|---|---|
| Supabase non configuré, ou pas connecté | « Le coffre range tes papiers dans ton espace Supabase : connecte-toi d'abord. » |
| Connecté, chiffrement inactif | Écran d'accueil : à quoi sert le coffre, ce que voit le serveur, puis **« Activer le chiffrement »** (choix de la phrase secrète, via `activerChiffrement`). Prévenir que **toutes** les données de Patrium seront alors chiffrées dans le cloud. |
| Chiffrement actif, appareil verrouillé | Saisie de la phrase (`deverrouillerChiffrement`) |
| Chiffrement actif et clé présente | Le coffre |

**Une seule phrase secrète pour Patrium et le coffre** (décision du §14) :
c'est la clé K de Patrium qui enveloppe les clés de fichier.

---

## 6. Modèle de données

```js
// usePersistentState("coffre")
{
  version: 1,
  documents: [
    {
      id: "doc_…",                    // crypto.randomUUID()
      type: "passeport",              // voir §7
      titre: "Passeport",             // modifiable ; par défaut le libellé du type
      dateDocument: "2021-03-12",     // délivrance, achat, signature… (facultatif)
      echeance: "2031-03-11",         // expiration, fin de garantie, échéance annuelle (facultatif)
      recurrence: null,               // null | "annuelle" (contrats reconduits chaque année)
      rappelJours: null,              // null = délai par défaut du type ; nombre = délai propre au document
      notes: "",                      // texte libre (numéro, agence, contact…)
      fichiers: [
        {
          id: "f_…",                  // nom de l'objet : <user_id>/<id>.bin
          nom: "passeport.pdf",       // nom d'origine
          mime: "application/pdf",
          taille: 482113,             // taille en clair, en octets
          cle: { __chiffre: 1, iv: "…", donnees: "…" }, // Kf enveloppée par K
        },
      ],
      contratId: null,                // contrat d'Abonnements lié (contrat d'assurance, bail) — jalon 2
      agendaAjouteLe: null,           // date du dernier ajout à l'agenda (jalon 2)
      agendaDate: null,               // date et titre du rappel posé, pour repérer un rappel à mettre à jour
      rappelVu: null,                 // date de rappel dont la notification a été acquittée
      creeLe: "2026-11-02T10:12:00.000Z",
      modifieLe: "2026-11-02T10:12:00.000Z",
    },
  ],
  reglages: {
    delais: {},                       // { [type]: jours } — surcharge des délais par défaut
    titreAgendaNeutre: false,         // « Papier à renouveler » au lieu de « Passeport à renouveler »
  },
}
```

Un document peut avoir **plusieurs fichiers** (recto et verso, contrat et
conditions générales). L'interface du jalon 1 n'en envoie qu'un à la fois,
mais le modèle les prévoit dès le départ.

Une migration (`src/lib/migrations.js`) est enregistrée pour la clé `coffre`
dès la version 1, afin que les évolutions suivantes aient un point d'entrée.

---

## 7. Types de documents et délais de rappel

Les délais par défaut sont modifiables (globalement par type dans Réglages, ou
document par document).

| Catégorie | Type | Échéance | Rappel par défaut |
|---|---|---|---|
| Identité | Carte d'identité | Expiration (10 ans) | **4 mois** avant (rendez-vous en mairie) |
| | Passeport | Expiration (10 ans) | **4 mois** |
| | Permis de conduire | Fin de validité du titre (15 ans) | 3 mois |
| | Carte Vitale | — | — |
| | Autre pièce | Expiration | 3 mois |
| Assurances | Contrat d'assurance / mutuelle | Échéance annuelle (récurrente) | 2 mois (le temps de comparer) |
| | Attestation | Fin de validité | 3 semaines |
| | Carte de tiers payant | Fin de validité | 3 semaines |
| Achats | Facture | Fin de garantie (achat + 2 ans proposé) | 1 mois |
| Logement | Bail | Fin du bail | 2 mois |
| | Quittance, état des lieux | — | — |
| Études | Diplôme, relevé de notes | — | — |
| | Certificat de scolarité | Fin d'année scolaire | 3 semaines |
| Impôts | Avis d'imposition, déclaration | — | — |
| Autre | Autre | Facultative | 1 mois |

**Statut d'un document** (pastille dans la liste) :

- **à jour** : pas d'échéance, ou échéance au-delà de la date de rappel ;
- **à prévoir** : la date de rappel est passée et l'échéance est à venir ;
- **expiré** : l'échéance est passée. Pour un document récurrent, l'échéance
  avance d'un an et le statut repart.

Le calcul (`statutDocument`, `dateRappel`, `prochaineEcheance` pour la
récurrence) vit dans `src/lib/coffre.js`, en fonctions pures testées, sur le
modèle de `echeances.js`.

---

## 8. Rappels (jalon 2)

### 8.1 Dans Patrium

`prochainesEcheances()` reçoit une nouvelle source, `coffre`. Comme pour
les préavis de contrat, **la date retenue est celle où il faut agir** (la date
de rappel), avec l'échéance en détail : « Lancer le renouvellement —
Passeport », échéance le 11/03/2031. Une fois le rappel passé, c'est
l'échéance elle-même qui s'affiche quand elle approche. Les documents
remontent ainsi dans :

- **« Prochaines échéances »** (fenêtre de six semaines) ;
- **le centre « À faire »** : « à prévoir » en attention (urgent la dernière
  semaine), « échu » en urgent pendant 30 jours après l'échéance, puis plus
  rien : une garantie terminée depuis un an n'appelle aucune action ;
- **les notifications** que Patrium affiche quand il est ouvert, une par date
  de rappel, jusqu'à l'acquittement (`rappelVu`). Un contrat reconduit sonne
  donc de nouveau l'année suivante.

Les métadonnées étant en clair sur l'appareil, ces rappels fonctionnent même
coffre verrouillé. Un document **lié à un contrat d'Abonnements** n'y figure
pas : Abonnements rappelle déjà son préavis.

Le calcul vit dans `coffre.js` (`echeancesDuCoffre`, `aFaireDuCoffre`,
`rappelsCoffreDus`).

### 8.2 Dans l'agenda du téléphone

Le serveur ne connaît pas les dates (elles sont chiffrées) : il ne peut donc
pas envoyer de rappel lui-même. C'est l'agenda du téléphone qui s'en charge.

- **Par document** : bouton « Ajouter à l'agenda ». Il ouvre Google Agenda avec
  un événement pré-rempli (lien `calendar.google.com/calendar/render?action=TEMPLATE…`,
  événement d'une journée à la date de rappel, `recur=RRULE:FREQ=YEARLY` pour
  un contrat récurrent). Sur Android, le lien s'ouvre dans l'appli Agenda. Un
  enregistrement, et c'est fait.
- **Tout d'un coup** : « Exporter en .ics », pour importer depuis
  l'ordinateur (Google Agenda → Paramètres → Importer et exporter). Une
  alarme à 9 h le jour du rappel, un identifiant stable par document. Sur
  Android, l'appli Google Agenda n'ouvre pas les fichiers `.ics` : c'est le
  bouton par document qui sert sur le téléphone.
- **Titre** : « Passeport — lancer le renouvellement (échéance le
  11/03/2031) » ; pour un contrat reconduit, « (échéance chaque année le
  01/01) » ; pour un contrat lié à Abonnements, « dernier jour pour
  résilier ». Avec le réglage `titreAgendaNeutre` : « Papier à renouveler —
  voir le coffre Patrium ». Jamais de numéro ni de note dans l'agenda.
- **Rappel déjà passé** : l'événement est posé à aujourd'hui (un événement
  dans le passé ne préviendrait personne). Un papier déjà échu n'a pas de
  rappel : c'est le nouveau qu'il faut ranger.
- Le document retient la date et le titre du rappel posé (`agendaAjouteLe`,
  `agendaDate`). Si l'échéance, le délai ou le titre changent ensuite, le
  coffre signale « Mettre à jour l'agenda ». Pour un contrat annuel, seuls le
  jour et le mois comptent, puisque la récurrence fait revenir le rappel.

Le sous-onglet **« Échéances »** liste les papiers datés avec l'état de leur
rappel ; le sous-onglet **« Réglages »** porte les délais par type et le titre
neutre. Le code est dans `coffreAgenda.js`.

---

## 9. Arrivée des documents

### 9.1 Jalon 1 : sélecteur de fichier

Bouton « Ajouter », qui ouvre le sélecteur de fichiers du système (sur
Android, il propose aussi l'appareil photo et les fichiers). Le glisser-déposer
fonctionne sur ordinateur. Types acceptés : PDF, JPEG, PNG, WebP.

### 9.2 Jalon 3 : Partager vers le coffre (Android)

- `manifest.json` déclare un `share_target` (`POST`, `multipart/form-data`,
  fichiers PDF et images) vers `/partage`, et un raccourci « Coffre ».
- `sw.js` intercepte le `POST /partage`, range les fichiers reçus dans
  IndexedDB (en attente, le temps d'une redirection) et redirige vers
  `/#/coffre?partage=1`.
- Le coffre lit les fichiers en attente, ouvre le formulaire « Ranger ce
  document », puis vide la file d'attente.
- Le nom du cache du service worker est incrémenté, comme l'exige le
  commentaire en tête de `sw.js`.

Le partage n'existe que pour l'appli **installée** sur l'écran d'accueil. Il
n'a pas besoin de la caméra. À noter : `vercel.json` interdit actuellement la
caméra (`Permissions-Policy: camera=()`), ce qui compte pour le scanner intégré
envisagé plus tard.

**À savoir côté utilisateur** : le scanner de Google Drive enregistre le scan
en clair dans Drive. Mieux vaut une appli de scan qui enregistre sur le
téléphone, puis supprimer le scan d'origine une fois rangé dans le coffre.

### 9.3 Jalon 3 : suggestion de dates

Pour un PDF qui contient du texte : `extrairePagesPdf` (sur l'appareil), puis
détection des dates (`12/03/2031`, `12.03.2031`, `12 mars 2031`). Celles qui
sont proches de mots-clés (« expire », « valable jusqu'au », « échéance »,
« garantie », « date d'effet ») sont classées en premier. Elles sont
**proposées**, jamais appliquées sans un clic. Pas de suggestion pour une
photo (pas d'OCR, par choix).

---

## 10. Interface

### Liste (écran principal)

```
┌───────────────────────────────────────────────┐
│ Coffre                       [+ Ajouter] [🔒] │
│ 🔍 Rechercher…                                │
│                                               │
│ À PRÉVOIR                                     │
│  ● Passeport        expire dans 3 mois   ›    │
│                                               │
│ IDENTITÉ                                      │
│  ○ Carte d'identité  jusqu'au 04/2033    ›    │
│  ○ Permis de conduire                    ›    │
│ ASSURANCES                                    │
│  ○ Mutuelle         échéance 01/01       ›    │
│ ACHATS                                        │
│  ○ Facture lave-linge  garantie → 09/2027 ›   │
│ …                                             │
│                                               │
│ 12 documents · 18 Mo sur 1 Go                 │
└───────────────────────────────────────────────┘
```

Les documents « à prévoir » et « expirés » remontent en tête ; les autres sont
groupés par catégorie. La recherche porte sur le titre, le type et les notes,
qui sont déchiffrés localement.

### Ajout / modification

Fichier (aperçu miniature), type (liste groupée par catégorie, qui préremplit
le titre et le délai), titre, date du document, échéance (avec « achat + 2
ans » proposé pour une facture), récurrence, délai de rappel (« par défaut :
4 mois »), notes. Une barre de progression couvre « Chiffrement… Envoi… ».

### Fiche document

Aperçu : image en `blob:`, PDF rendu page par page par pdf.js. Puis les
métadonnées et les actions : **Télécharger** (le fichier déchiffré, avec son
nom d'origine), **Ajouter à l'agenda** (jalon 2), **Modifier**,
**Supprimer** (avec confirmation, via `ConfirmContext`).

Rien de déchiffré n'est écrit sur le disque, sauf par un téléchargement
explicite. Les URL `blob:` sont révoquées à la fermeture de la fiche.

---

## 11. Sécurité et confidentialité

### Modèle de menace

| Menace | Protégé ? | Comment |
|---|---|---|
| Fuite de la base ou du stockage Supabase | **Oui** | Le serveur n'a que du chiffré : métadonnées dans `kv_store`, octets dans `coffre/`. Il voit le nombre de fichiers, leur taille et leurs dates d'envoi. |
| Vol du compte Supabase (mot de passe) | **En lecture, oui** | Sans la phrase secrète, rien n'est lisible. L'attaquant peut en revanche **supprimer** des fichiers : les sauvegardes de Patrium ne contiennent pas les fichiers (point ouvert n° 1). |
| Vol du téléphone **verrouillé** | **Oui** | Chiffrement du stockage d'Android et code du téléphone (choix assumé). |
| Vol du téléphone **déverrouillé**, ou code connu | **Non** | Choix assumé : le coffre reste ouvert sur l'appareil. Limité par le bouton « Verrouiller cet appareil ». Le déverrouillage par empreinte est prévu plus tard. |
| Sauvegarde JSON partagée par erreur | **Les fichiers, oui** | Les clés de fichier y sont enveloppées par K. Les titres et les dates, en revanche, y sont en clair. |
| Google Agenda | **Non** (choix assumé) | Il voit le titre et la date du rappel. Un titre neutre est possible ; jamais de numéro ni de note. |
| Appli de scan d'Android | Hors du coffre | Elle peut garder une copie du scan (voir §9.2). |
| Phrase oubliée **et** appareil perdu | **Pas avant le jalon 4** | Le code de secours y répond. D'ici là, la phrase est la seule clé. |
| Script malveillant injecté dans la page | Atténué | La CSP existante (`script-src 'self'`) l'empêche. |

### Code de secours (jalon 4)

À la création, un code aléatoire (128 bits, affiché en groupes lisibles, à
imprimer ou à noter) **enveloppe la clé maîtresse K**. Avec ce code, on rouvre
le coffre et on choisit une nouvelle phrase.

Cela fait évoluer la configuration de chiffrement de Patrium vers une
**version 2** : K n'est plus dérivée directement de la phrase, elle est
enveloppée deux fois, par une clé tirée de la phrase et par une clé tirée du
code de secours. La migration est sans perte : la K actuelle (exportable)
devient la clé maîtresse, et seules ses enveloppes sont créées. Tout Patrium en
profite, et changer de phrase devient possible sans tout rechiffrer.

### Plus tard

- **Déverrouillage par empreinte** (passkey avec l'extension PRF de WebAuthn,
  sur les Android récents) ;
- **accès d'urgence** pour les parents : un second code de secours, ou le
  partage de documents choisis grâce aux clés de fichier ;
- **changement de clé après la perte d'un appareil** : nouvelle K et
  réenveloppement de toutes les Kf.

---

## 12. Jalons

| # | Jalon | Contenu | Tests |
|---|---|---|---|
| **1** | **Coffre de base** | Onglet lazy « Coffre » (+ feuille Plus, + palette de commandes) ; écrans prérequis (§5) ; SQL du bucket et des politiques ; `coffreFichiers.js` (Kf, format §3.2, envoi, téléchargement, suppression) ; `coffre.js` (modèle, types §7, statuts) ; ajout par sélecteur et glisser-déposer ; liste groupée avec statuts ; fiche avec aperçu image et PDF ; téléchargement ; modification ; suppression ; « Verrouiller cet appareil » ; clé `coffre` dans `STORAGE_KEYS` avec sa migration. | Aller-retour chiffrer/déchiffrer ; mauvaise clé et octet altéré → erreur ; enveloppe de Kf ; statuts et dates de rappel (bords : aujourd'hui, 29 février, récurrence) ; composant : prérequis, ajout → liste → suppression avec Supabase simulé. |
| 2 | Rappels | Source `documents` dans `prochainesEcheances` ; lien Google Agenda par document ; export `.ics` ; titre neutre ; réglages des délais ; « rappel à mettre à jour ». | Contenu du lien et du `.ics` (dates, RRULE, échappement) ; intégration aux échéances. |
| 3 | Arrivée des papiers | `share_target` et raccourci ; file d'attente du service worker ; suggestion de dates PDF ; plusieurs fichiers par document. | Analyse des dates (formats, mots-clés) ; file d'attente du partage. |
| 4 | Code de secours | Configuration de chiffrement v2 ; création et impression du code ; réouverture par le code ; changement de phrase. | Migration v1 → v2 sans perte ; mauvaise phrase et mauvais code ; ancienne configuration toujours lisible. |
| 5 | Hors ligne et ménage | Cache local chiffré (IndexedDB) pour consulter sans réseau ; espace utilisé ; nettoyage des orphelins dans « Santé des données ». | Cache : rien en clair ; détection des orphelins. |
| 6 | Inventaire des objets | Objets avec prix, date d'achat, garantie, valeur de revente, liés à leur facture. | À préciser au moment voulu. |

Chaque jalon est une PR distincte. Le merge dans `main` déclenche la mise en
production sur Vercel, et l'auto-merge reste désactivé.

**Fichiers prévus au jalon 1** : `src/components/Coffre.jsx` (onglet),
`src/components/coffre/*` (liste, formulaire, fiche, prérequis),
`src/lib/coffre.js`, `src/lib/coffreFichiers.js` et leurs tests, des ajouts
dans `src/App.jsx`, `src/lib/storage.js` (`verrouillerCetAppareil`),
`src/lib/PatrimoineContext.jsx` (`STORAGE_KEYS`), `src/lib/migrations.js` et
`sql/schema.sql`.

**Action manuelle** au jalon 1 : exécuter le nouveau bloc SQL dans Supabase
(création du bucket et des politiques).

---

## 13. Points ouverts

1. **Sauvegarde des fichiers.** Les sauvegardes JSON de Patrium ne contiennent
   que les métadonnées. Faut-il une « exportation du coffre » (archive des
   fichiers, toujours chiffrés) contre une suppression accidentelle ou
   malveillante ? Proposé : au jalon 5.

Les autres points ont été tranchés à la validation (§14).

---

## 14. Décisions actées (cadrage du 2026-10-31)

| Sujet | Décision |
|---|---|
| Documents | Identité ; assurances et mutuelle ; factures et garanties ; logement, études, impôts |
| Canal des rappels | Agenda du téléphone (plus les échéances de Patrium) |
| Délai des rappels | Selon le type de document, réglable |
| Inventaire des objets | Plus tard (jalon 6) |
| Menaces prioritaires | Vol ou perte du téléphone ; fuite chez l'hébergeur |
| Verrouillage | Ouvert sur l'appareil ; le code du téléphone suffit (choix assumé) |
| Phrase oubliée | Code de secours |
| Accès d'urgence (parents) | Pas pour l'instant |
| Appareils | Android et ordinateur |
| Stockage des fichiers | Supabase Storage, chiffré côté client |
| Dates | Saisie manuelle, avec suggestions tirées des PDF sur l'appareil ; ni IA ni OCR |
| Emplacement | Onglet de Patrium |
| Numérisation | Scanner du téléphone, puis Partager vers le coffre |
| Phrase secrète | La même que Patrium : le coffre exige le chiffrement de Patrium |
| Ordre des jalons | Rappels (2), partage Android (3), puis code de secours (4) |
| Contrats suivis dans Abonnements | Pas de double rappel : le coffre range le contrat et renvoie au préavis d'Abonnements (jalon 2) |
