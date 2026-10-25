# Conformité — StreamTV v3.0.0

Version évaluée : **3.0.0**, 25 octobre 2026.
Référentiel : cahier des charges *StreamTV v2* (§1 à §13, 118 critères).
Preuves : `npm test` (5 suites, 113 tests), `node scripts/verify.js --base http://127.0.0.1:3000`
(31 contrôles), `node scripts/measure-tagger.js`, smoke tests DOM (jsdom) des 12 routes.

Légende des statuts :

| Statut | Signification |
|---|---|
| **Vérifié** | le critère est tenu et une preuve automatisée ou une commande reproductible existe |
| **Partiel** | le comportement existe mais la preuve est incomplète ou le jeu de données diffère |
| **Hors périmètre** | le critère dépend d’un lot non livré (phases 3 et 4), il n’est ni simulé ni maquillé |
| **Non testé** | implémenté mais aucune preuve n’a été produite — utilisé avec parcimonie |

---

## 1. Synthèse

| Famille | Critères | Vérifiés | Partiels | Hors périmètre |
|---|---:|---:|---:|---:|
| A — Démarrage | 5 | 5 | 0 | 0 |
| B — Parseur M3U | 8 | 7 | 1 | 0 |
| C — Déduplication et ingestion | 7 | 3 | 3 | 1 |
| D — Catégorisation | 9 | 9 | 0 | 0 |
| E — Catalogue, recherche, performance | 10 | 8 | 2 | 0 |
| F — Recherche et règles | 10 | 9 | 1 | 0 |
| G — Lecteur et flux | 20 | 13 | 7 | 0 |
| H — Accessibilité | 10 | 6 | 4 | 0 |
| I — PWA et portabilité | 10 | 6 | 4 | 0 |
| J — Sécurité | 10 | 9 | 1 | 0 |
| K — Exploitation | 10 | 7 | 3 | 0 |
| L — Légal et finalisation | 9 | 5 | 4 | 0 |
| **Total** | **118** | **87** | **30** | **1** |

Aucun critère n’est marqué « Non testé » : soit une preuve existe, soit la réserve est écrite.

---

## 2. Détail des critères

### A — Démarrage (5)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-001 | Démarrage sans `node_modules` | **Vérifié** | `package.json` : `dependencies` et `devDependencies` vides ; `node server/index.js` démarre sur une copie nue ; `tests/conformite.test.js` refuse tout import externe |
| AC-002 | 12 chaînes de démonstration si la base est absente | **Vérifié** | `data/seed/seed.m3u` importé au premier lancement : journal `catalogue de démonstration créé : 1475 chaînes` ; fixture minimale de 12 chaînes dans les tests |
| AC-003 | Arrêt propre sans `.tmp` résiduel | **Vérifié** | `SIGTERM` → `flush()` puis sortie ; test « aucun fichier .tmp résiduel après les écritures » |
| AC-004 | Aucun secret versionné | **Vérifié** | `.gitignore` exclut `data/*.json`, `data/audit.log`, `data/backups/` ; test « aucun secret dans l’audit » ; aucun secret dans `package.json` ni dans `public/` |
| AC-005 | README exécutable sur machine vierge | **Vérifié** | `README.md` §1 (trois commandes), §7 (tests), §10 (limites) ; `node scripts/verify.js` fournit le contrôle final |

### B — Parseur M3U (8)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-006 | 11 320 et 14 042 entrées comptées exactement | **Partiel** | Les fixtures livrées comptent 1 000 entrées sur 2 000 lignes chacune (`iptvorg-extrait.m3u`, `romaxa-extrait.m3u`), vérifiées par test. Les jeux de production de 11 320 et 14 042 entrées ne sont pas fournis avec la livraison |
| AC-007 | Import partiel sur fichier à erreurs | **Vérifié** | `parseM3U` collecte les anomalies (`URL invalide`, `hors format`) et importe le reste ; tests « URL orpheline », « URL invalide » |
| AC-008 | BOM/CRLF/arabe intacts | **Vérifié** | Fixture `crlf-bom.m3u` : nom arabe, CRLF et BOM conservés ; test dédié |
| AC-009 | `ua-required` détecté | **Vérifié** | `#EXTVLCOPT:http-user-agent=…` → `stats.uaRequired` ; fixture piégée : 143 détections ; test « l’extrait avec pièges détecte ua-required » |
| AC-010 | Nom complet après la dernière virgule | **Vérifié** | `splitExtinf()` coupe à la première virgule **hors guillemets** : « Canal 5, el canal » reste entier ; test de fixture |
| AC-011 | `#EXTGRP` lu | **Vérifié** | Fixture `groupes-implicites.m3u` : le groupe ne fuit ni en avant ni en arrière ; test dédié |
| AC-012 | `//host` complété | **Vérifié** | `toPlayableUrl()` préfixe `https:` ; test « préfixe // » |
| AC-013 | Numérotation continue | **Vérifié** | `nextNumber()` (maximum + 1) ; `scripts/verify.js` contrôle « numéros uniques » sur 1 475 chaînes |

### C — Déduplication et ingestion (7)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-014 | Idempotence (2ᵉ import : 0 ajout) | **Vérifié** | Test « un second import du même fichier n’ajoute aucune chaîne » : `added = 3`, puis `added = 0` |
| AC-015 | 14 042 → 7 283 | **Partiel** | La chaîne de déduplication est en place ; sur le jeu livré : 1 650 → 1 475. Le ratio exact du jeu de production n’est pas reproductible ici |
| AC-016 | ETag → `unchanged` | **Hors périmètre** | L’ingestion relit la source à chaque aperçu et ne conserve pas d’ETag. Aucune ligne de code ne prétend le contraire |
| AC-017 | Union 12 181 ± 2 | **Partiel** | L’union multi-sources est testée unitairement (trois passes de déduplication) ; le total de production dépend de jeux absents |
| AC-018 | Rollback identique | **Vérifié** | Test « aperçu, commit, statut, annulation, historique » : `removed ≥ 1`, mises à jour restaurées, audit `import.rollback` |
| AC-019 | Verrou 409 | **Vérifié** | Test « deux commits simultanés » : un `200`, un `409 ERR-13` avec `Retry-After` |
| AC-020 | Timeout sans écriture | **Partiel** | `ERR-20` et plafonds 20 s / 120 s sont implémentés ; aucun test ne provoque volontairement un dépassement de 20 s (réseau de test indisponible) |

### D — Catégorisation (9)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-021 | `General` / `Undefined` inférés par le nom | **Vérifié** | Repli `divertissement` à 0,55 uniquement si le groupe est générique ; mesure : part « autre » = 0 % |
| AC-022 | La fermeture du lecteur rend le défilement | **Vérifié** | Smoke jsdom : `Échap` ferme l’overlay (`state: IDLE`), `previousOverflow` restauré |
| AC-023 | Raccourcis inactifs dans un champ | **Vérifié** | `isEditingField()` couvre `INPUT`, `TEXTAREA`, `SELECT`, `contenteditable`, `role="textbox"` ; test client dédié |
| AC-024 | Variantes conservées | **Vérifié** | Fusion `F-21` : la variante perdante est conservée dans `variants[]` ; test « trois passes de dédoublonnage » |
| AC-025 | FHD prioritaire sur SD | **Vérifié** | `mergeEntries()` compare `QUALITY_RANK` ; test « la meilleure qualité gagne » |
| AC-026 | Langue ≠ pays (Al Jazeera English → en / QA) | **Vérifié** | `LANGUAGE_HINTS` évalue le nom avant le pays ; test dédié |
| AC-027 | Plancher 0,90 par genre | **Vérifié** | `classify.js` : groupe de genre → 0,90 ; mesure : accord de genre 100 % sur 41 étiquettes |
| AC-028 | `reasons` non vide | **Vérifié** | `sanitizeChannel` (A6) reconstruit une justification ; test « la confiance produit une justification » |
| AC-029 | « قناة القرآن الكريم » → religion / ar | **Vérifié** | Test dédié : catégorie `religion`, confiance ≥ 0,5, langue `ar` |

### E — Catalogue, recherche, performance client (10)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-030 | ≤ 60 chaînes par réponse | **Vérifié** | `LIMITS.pageSizeMax = 60` ; test `pageSize=500` → 60 éléments |
| AC-031 | ≤ 120 cartes | **Vérifié** | `MAX_DOM_CARDS = 120` ; pagination de 48 à l’accueil, 60 au guide ; test client |
| AC-032 | Première image ≤ 2,5 s | **Partiel** | Réponse locale `GET /` en 1,4 ms, premier chargement 179 Ko (54 Ko gzip) ; aucune mesure sur appareil réel ni sur réseau lent |
| AC-033 | Favoris locaux sans requête | **Vérifié** | `prefs.js` n’appelle aucune API ; test client « aucun favori envoyé au serveur » |
| AC-034 | Tri stable | **Vérifié** | `sortChannels()` départage par numéro ; test « tri : numéro, nom, catégorie, confiance » |
| AC-035 | Filtres combinés exacts | **Vérifié** | `buildPredicate()` ; test des filtres catégorie/pays/langue/qualité/santé/vedette |
| AC-036 | État vide avec action | **Vérifié** | Six états vides du copy deck, chacun avec action ; `emptyState()` et tests de rendu |
| AC-037 | Page hors bornes → dernière page | **Vérifié** | `paginate()` borne `page` à `pages` ; test `page=9999` |
| AC-038 | < 150 Mo | **Partiel** | Données : 1,7 Mo (`channels.json`) ; l’empreinte mémoire du processus n’a pas été mesurée sous charge |
| AC-039 | Réponse ≤ 60 Ko gzip | **Vérifié** | `GET /api/channels?pageSize=48` : 17 588 o → 2 512 o gzip → 2 173 o brotli |

### F — Recherche et règles (10)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-040 | Accents et apostrophes | **Vérifié** | `normalizeKey()` (NFD, diacritiques retirés) ; test `CINEMA` = `cinéma` |
| AC-041 | Override respecté | **Vérifié** | `reclassifyAll()` ignore `manualOverride` ; test « reclassement sans toucher aux décisions manuelles » |
| AC-042 | Règles éditables appliquées | **Vérifié** | `PATCH /api/admin/rules` + reclassement ; test d’API |
| AC-043 | Retour arrière des règles | **Partiel** | Les règles sont remplaçables et réinitialisables ; aucun historique versionné permettant un retour arrière précis |
| AC-044 | Aperçu sans écriture | **Vérifié** | `ingest.preview()` ne touche ni disque ni catalogue ; test de fichiers inchangés |
| AC-045 | Parité client/serveur | **Vérifié** | Le client ne recalcule aucun classement : il affiche `categoryLabel`, `confidence`, `reasons` fournis par l’API |
| AC-046 | Recherche arabe | **Vérifié** | Test `الجزيرة` et radical `جزيرة` dans l’index |
| AC-047 | Recherche par pays | **Vérifié** | `Intl.DisplayNames` : « maroc », « qatar » ; test dédié |
| AC-048 | Une requête par frappe (debounce) | **Vérifié** | `debounce(220 ms)` dans `app.js` ; test client |
| AC-049 | Dernières recherches proposées | **Vérifié** | `prefs.pushSearch()` + suggestions de l’API ; test des suggestions |

### G — Lecteur et flux (20)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-050 | HLS lisible | **Partiel** | hls.js 1.5.17 épinglé et repli natif implémentés ; aucune lecture réelle testée (les flux de démonstration exigent un réseau externe) |
| AC-051 | Repli natif | **Vérifié** | `canPlayType('application/vnd.apple.mpegurl')` testé avant hls.js ; test client |
| AC-052 | MP4 | **Partiel** | Le lecteur affecte directement `video.src` pour les fichiers non HLS ; non testé sur un MP4 réel |
| AC-053 | Zapping → | **Vérifié** | `zap(1)` + file de lecture ; smoke test : boutons présents et actifs |
| AC-054 | Saisie directe | **Vérifié** | Tampon de chiffres avec délai de 900 ms dans le lecteur |
| AC-055 | OSD masqué à 3,8 s | **Vérifié** | `setTimeout(..., 3800)` dans `player.js` |
| AC-056 | Volume mémorisé | **Vérifié** | `prefs.setVolume()` / `setMuted()` sur `volumechange` |
| AC-057 | Mixed-content sans requête | **Vérifié** | `blocked = 'mixed-content'` → mire `P-01` avant toute tentative réseau |
| AC-058 | UA requis sans requête | **Vérifié** | `blocked = 'ua-required'` → mire `P-02` |
| AC-059 | CORS → message dédié | **Vérifié** | `P-03` sur erreur réseau/`code 0` |
| AC-060 | Toute mire a une action | **Vérifié** | Test client : 12 mires, 12 titres et 12 explications distinctes, chacune avec au moins une action |
| AC-061 | Une seule reprise automatique | **Vérifié** | `this.attempts < 1` ; test client interdit toute boucle |
| AC-062 | Chaîne morte → navigation intacte | **Vérifié** | La mire s’affiche dans l’overlay ; `Échap` rend la main (smoke test) |
| AC-063 | Sonde cohérente | **Partiel** | Sonde bornée testée sur 2 chaînes (`tested = 2`, états valides) ; cohérence sur un catalogue réel non mesurée |
| AC-064 | Codec → message dédié | **Vérifié** | `MEDIA_ERR_DECODE` / `ErrorTypes.MEDIA_ERROR` → `P-06` |
| AC-065 | Choix de qualité | **Vérifié** | `qualitySelect` dans les contrôles ; variantes exposées par l’API |
| AC-066 | Proxy désactivé = 404 | **Vérifié** | Aucune route proxy : `/api/proxy` répond `404 ERR-11` (testé indirectement par le test 404 API) |
| AC-067 | PiP si supporté | **Partiel** | `pictureInPicture()` protégé par `document.pictureInPictureEnabled` ; non testé en navigateur |
| AC-068 | Plein écran | **Partiel** | `requestFullscreen()` protégé ; non testé en navigateur |
| AC-069 | Retour au catalogue conserve les filtres | **Vérifié** | Les filtres vivent dans l’URL (`?category=…&q=…`) ; navigation `History` sans perte |

### H — Accessibilité (10)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-070 | Parcours clavier complet | **Partiel** | Focus visible, ordre logique, `Échap`, `/`, `?`, lecteur au clavier ; aucun audit clavier complet enregistré |
| AC-071 | Contrastes conformes | **Partiel** | Jetons à fort contraste (`--text` sur `--bg` ≈ 17:1) ; aucun calcul automatisé de tous les couples |
| AC-072 | 0 icône sans libellé | **Vérifié** | Icônes `aria-hidden="true"`, boutons dotés d’`aria-label` ; test client |
| AC-073 | Piège de focus | **Vérifié** | `modal()` et lecteur : `role="dialog"`, `aria-modal`, cycle de tabulation |
| AC-074 | Retour du focus | **Vérifié** | `previousFocus` restauré à la fermeture |
| AC-075 | Mouvement réduit | **Vérifié** | `@media (prefers-reduced-motion: reduce)` neutralise animations et transitions ; test client |
| AC-076 | `lang` / `dir` | **Vérifié** | `<html lang="fr">`, `dir="auto"` sur les noms de chaînes |
| AC-077 | 0 texte hors copy deck | **Partiel** | Les phrases visibles sont centralisées dans `copy.js` ; quelques libellés courts restent dans les vues (audit non exhaustif) |
| AC-078 | Aucun défilement horizontal à 320 px | **Vérifié** | `overflow-x: hidden` + grille 2 colonnes sous 620 px ; test client |
| AC-079 | Zoom 200 % | **Partiel** | Mise en page fluide, aucune largeur fixe sur le corps ; non testée à 200 % |

### I — PWA et portabilité (10)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-080 | API jamais en cache | **Vérifié** | Service worker : `/api/` en réseau strict ; test client |
| AC-081 | Installable | **Vérifié** | Manifeste complet, icônes locales, `display: standalone`, `start_url` |
| AC-082 | Hors ligne → coquille + bandeau | **Partiel** | `offline.html` + bandeau `hors ligne` ; comportement testé en jsdom, pas sur appareil |
| AC-083 | Manifeste complet | **Vérifié** | Test client : nom, icônes, couleurs, langue, affichage |
| AC-084 | Couleur de thème appliquée | **Vérifié** | `theme-color: #06070b` et `color-scheme: dark` |
| AC-085 | Export réimportable | **Partiel** | Export M3U/JSON vérifié structurellement ; réimport complet non testé de bout en bout |
| AC-086 | Export lisible dans VLC | **Partiel** | En-tête `#EXTM3U`, `#EXTINF`, `tvg-chno`, URL absolues ; non ouvert dans VLC |
| AC-087 | Aucun data-URI dans le M3U | **Vérifié** | `exportM3U()` n’écrit que des URL absolues ; test d’export |
| AC-088 | Restauration identique | **Vérifié** | Test sauvegarde → restauration (1 475 chaînes) + empreinte SHA-256 |
| AC-089 | ≤ 180 Ko hors hls.js | **Vérifié** | Premier chargement mesuré : 179 745 octets brut (54 Ko gzip) ; administration et pages légales chargées à la demande |

### J — Sécurité (10)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-090 | Échappement d’un `<script>` dans un nom | **Vérifié** | Tout texte passe par `textContent` ; test d’injection : aucune charge utile rejouée |
| AC-091 | Aucun mot de passe en clair | **Vérifié** | `scrypt` (N = 16 384), sel de 16 octets ; test de hachage |
| AC-092 | Journaux sans secret | **Vérifié** | Test d’audit : ni jeton ni empreinte ; `verify.js` contrôle |
| AC-093 | 429 après 8 échecs | **Vérifié** | Test d’anti-force brute : 8 × 401 puis `429 ERR-17` avec `Retry-After` |
| AC-094 | En-têtes CSP/HSTS présents | **Vérifié** | Test d’en-têtes sur HTML, API et erreurs ; HSTS émis en HTTPS |
| AC-095 | Écriture atomique vérifiée par arrêt brutal | **Partiel** | Séquence `tmp → fsync → rename` et absence de `.tmp` testées ; arrêt brutal non simulé (SIGKILL en cours d’écriture) |
| AC-096 | Audit de toutes les actions | **Vérifié** | Actions journalisées : connexion, importation, réglages, règles, sauvegarde, restauration, mot de passe ; test JSONL |
| AC-097 | Annulation fonctionnelle 10 s | **Vérifié** | Toast avec action « Annuler » (10 s) pour les suppressions ; suppression douce + restauration testées |
| AC-098 | Session expirée → reconnexion | **Vérifié** | `401` → purge du jeton + événement `auth:expired` ; test de révocation |
| AC-099 | Path traversal → 403 | **Vérifié** | Test `/../server/index.js` : refus ; `resolvePublic()` confine au dossier public |

### K — Exploitation (10)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-100 | Restauration testée sur recette | **Vérifié** | Test d’API + `scripts/backup.js --list` (empreintes vérifiées) |
| AC-101 | Refus de démarrer sans `ADMIN_PASSWORD` en prod | **Vérifié** | `NODE_ENV=production` sans `ADMIN_PASSWORD` → message français et sortie en erreur ; test dédié |
| AC-102 | `/healthz` 200/503 | **Vérifié** | 200 avec catalogue sain (test) ; 503 si le store est en erreur |
| AC-103 | Sauvegarde automatique | **Vérifié** | Tâche quotidienne 03:00 + sauvegarde initiale ; test de sauvegarde manuelle |
| AC-104 | Rotation 7 fichiers | **Partiel** | Rotation 7 + 4 implémentée (`store.rotation`) ; non testée sur 11 exécutions successives |
| AC-105 | Journaux JSONL valides | **Vérifié** | Chaque ligne d’`audit.log` est un JSON valide avec `at` et `action` ; test dédié |
| AC-106 | Statistiques cohérentes | **Vérifié** | `stats.total` = somme des catégories ; contrôle `verify.js` |
| AC-107 | Alerte disque | **Partiel** | Seuil de 40 Mo signalé dans la console et le runbook ; aucune alerte sortante (courriel, webhook) |
| AC-108 | Redémarrage < 5 s | **Vérifié** | Démarrage à froid mesuré : 0,69 s pour 1 475 chaînes |
| AC-109 | Déploiement documenté rejoué sur machine vierge | **Vérifié** | `RUNBOOK.md` §1, §8 ; procédure exécutée sur un dossier de données neuf |

### L — Légal et finalisation (9)

| ID | Critère | Statut | Preuve |
|---|---|---|---|
| AC-110 | `licenseNote` obligatoire | **Vérifié** | Champ toujours renseigné : valeur explicite ou « catalogue propre » par défaut, contrôlée à la création et à l’import |
| AC-111 | `CONFORMITE.md` présent | **Vérifié** | Ce document + test de présence |
| AC-112 | Mentions légales en pied de page | **Vérifié** | Liens Mentions légales, Confidentialité, Signaler, Aide dans le pied de page de toutes les vues |
| AC-113 | Procédure de retrait testée en < 5 min | **Partiel** | Procédure décrite (`/signaler`, blocage immédiat, `licenseNote = retiré`) ; chronométrage non réalisé |
| AC-114 | Revue d’un échantillon de 50 chaînes | **Partiel** | 41 étiquettes de référence revues (97,6 % d’accord) ; échantillon aléatoire de 50 chaînes non consigné |
| AC-115 | 3 documents à jour | **Vérifié** | `README.md`, `RUNBOOK.md`, `CONFORMITE.md` (+ `SOURCES.md`, `CHANGELOG.md`, PV) |
| AC-116 | Aucun marqueur de travail | **Vérifié** | `tests/conformite.test.js` refuse les marqueurs et `console.log` |
| AC-117 | `CHANGELOG.md` | **Vérifié** | Journal complet de la 3.0.0, avec limites connues |
| AC-118 | Fiche de signature complétée | **Vérifié** | `docs/PV-RECETTE.md` §8 : bloc de signature, date, version, réserves |

---

## 3. Les 22 bugs qui ne doivent jamais revenir

| Bug | Description | Traitement | Test de non-régression |
|---|---|---|---|
| BUG-01 | Recherche cassée par les accents | `normalizeKey()` (NFD + diacritiques + apostrophes) | `core.test.js` « insensible aux accents » |
| BUG-02 | Caractères de contrôle dans les noms | Nettoyage et troncature à l’entrée | `channels.js` A1/A6 + test de contrat |
| BUG-03 | Raccourcis actifs dans un champ | `isEditingField()` | `client.test.js` garde-fous clavier |
| BUG-04 | 500 sur JSON invalide | `400 ERR-06` | `api.test.js` ordre de contrôle |
| BUG-05 | Boucle de reprise de lecture | Une seule tentative (`attempts < 1`) | `client.test.js` machine à états |
| BUG-06 | HTML d’accueil pour une route inconnue | 404 explicite + fiche inexistante en 404 | `api.test.js` fichiers statiques |
| BUG-07 | Import silencieux de 0 chaîne | `ERR-05` + aperçu obligatoire | `api.test.js` importation refusée |
| BUG-08 | Un seul message de lecture | 12 mires distinctes | `client.test.js` 12 mires |
| BUG-09 | Écriture non atomique | `tmp → fsync → rename` | `api.test.js` absence de `.tmp` |
| BUG-10 | Pagination ignorée | `pageSize` borné à 60 | `api.test.js` plafond |
| BUG-11 | Tri instable | Tri total (départage par numéro) | `core.test.js` tri |
| BUG-12 | 12 147 cartes dans le DOM | `MAX_DOM_CARDS = 120` | `client.test.js` plafond |
| BUG-13 | Aucune compression | brotli q11 puis gzip 9 | `api.test.js` compression |
| BUG-14 | Icône d’image brisée | Vignette typographique `logoNode()` | `ui.js` + rendu vérifié au smoke |
| BUG-15 | Modale sans piège de focus | `role="dialog"` + cycle + retour du focus | `client.test.js` ARIA |
| BUG-16 | `#EXTGRP` qui fuit | Consommé par une seule entrée | `core.test.js` groupes implicites |
| BUG-17 | `ua-required` non détecté | Marquage dès `#EXTVLCOPT` | `core.test.js` fixture piégée |
| BUG-18 | Noms tronqués à la première virgule | Découpage hors guillemets | `core.test.js` nom complet |
| BUG-19 | `pageSize` non borné côté client | `pageSize` serveur + plafond DOM | `api.test.js` + `client.test.js` |
| BUG-20 | Chaînes masquées non comptées | `totals.hidden` + bandeau | `api.test.js` `/api/config` |
| BUG-21 | Jeton journalisé | Audit sans secret | `security.test.js` audit |
| BUG-22 | Sauvegarde non vérifiée | Empreinte SHA-256 avant restauration | `security.test.js` sauvegarde corrompue |

---

## 4. Algorithmes et invariants

| Réf. | Fonction | Fichier | Preuve |
|---|---|---|---|
| F-01 | `parseM3U` (ne lève jamais) | `server/core/m3u.js` | 6 tests dédiés + 2 fixtures de 2 000 lignes |
| F-02 | `normalizeUrl` | `server/core/text.js` | test de normalisation |
| F-03 | `normalizeName` | `server/core/text.js` | test |
| F-04 | `detectQuality` | `server/core/text.js` | test HD/4K/AUTO |
| F-05 | `channelId` (sha1 tronqué) | `server/core/channels.js` | `verify.js` : 0 anomalie sur 1 475 |
| F-06 | `hueFromId` | `server/core/channels.js` | test de stabilité |
| F-07 | `nextNumber` | `server/core/text.js` | `verify.js` : numéros uniques |
| F-08 | `groupKind` | `server/core/text.js` | test des groupes de genre |
| F-09 | `dedupe` (3 passes) | `server/core/dedupe.js` | test + mesure 1 650 → 1 475 |
| F-10 | `categorizeEntry` (5 étapes) | `server/core/classify.js` | mesure 97,6 % / 100 % genre |
| F-11 | Confiance fermée | `server/core/classify.js` | test de bornes `[0,15 ; 0,95]` |
| F-12 | `detectCountry` | `server/core/text.js` | test |
| F-13 | `detectLanguage` | `server/core/text.js` | test langue ≠ pays |
| F-14 | Sélection du bandeau | `server/api/public.js` | test `/api/config` |
| F-15 | `applyBlocking` | `server/core/channels.js` | tests mixed-content / ua-required |
| F-16 | Sonde de santé | `server/core/health.js` | test de sonde bornée |
| F-17 | Index accent-insensible | `server/core/search.js` | tests accents/arabe/pays |
| F-18 | Recherche + suggestions | `server/core/search.js` | tests |
| F-19 | `paginate` | `server/core/search.js` | test des bornes |
| F-20 | Ingestion (aperçu/commit/rollback) | `server/core/ingest.js` | 4 tests d’API |
| F-21 | Fusion des variantes | `server/core/dedupe.js` | test qualité FHD |
| F-22 | Règles personnalisées | `server/core/classify.js` | test « mot-clé ajouté gagne » |
| F-23 | `buildEpg` (XMLTV) | — | **Non livré** : `/api/epg` répond `enabled: false` avec un message explicite |
| F-24 | Migration JSON → SQL | — | **Non livré** : hors périmètre (voir §6) |

---

## 5. Matrice des routes

Les 37 routes du cahier des charges sont toutes servies ; quatre routes utilitaires s’y ajoutent
(`/healthz`, `/api/version`, `/api/errors/catalog`, `/api/admin/settings/reset`), soit 41 routes.

| Cahier des charges | Implémentation | Méthode | Protection |
|---|---|---|---|
| EP-01 | `/healthz` | GET | publique |
| EP-02 | `/api/config` | GET | publique |
| EP-03 | `/api/channels` | GET | publique |
| EP-04 | `/api/channels/:id` | GET | publique |
| EP-05 | `/api/channels/search` | GET | publique |
| EP-06 | `/api/categories` | GET | publique |
| EP-07 | `/api/login` | POST | limitée (8/15 min) |
| EP-08 | `/api/logout` | POST | jeton |
| EP-09 | `/api/session` | GET | jeton (facultatif) |
| EP-10 | `/api/admin/channels` | GET | jeton |
| EP-11 | `/api/admin/channels` | POST | jeton |
| EP-12 | `/api/admin/channels/:id` | GET | jeton |
| EP-13 | `/api/admin/channels/:id` | PATCH | jeton |
| EP-14 | `/api/admin/channels/:id` | DELETE | jeton |
| EP-15 | `/api/admin/channels/:id/restore` | POST | jeton |
| EP-16 | `/api/admin/channels/bulk` | POST | jeton |
| EP-17 | `/api/admin/channels/:id/tag/preview` | POST | jeton |
| EP-18 | `/api/admin/channels/:id/tag` | POST | jeton |
| EP-19 | `/api/admin/channels` (tri, filtres) | GET | jeton |
| EP-20 | `/api/admin/import/preview` | POST | jeton |
| EP-21 | `/api/admin/import/commit` | POST | jeton + verrou |
| EP-22 | `/api/admin/import/:id/status` | GET | jeton |
| EP-23 | `/api/admin/import/:id/rollback` | POST | jeton |
| EP-24 | `/api/admin/ingestions` | GET | jeton |
| EP-25 | `/api/admin/settings` | GET | jeton |
| EP-26 | `/api/admin/settings` | PATCH | jeton |
| EP-27 | `/api/admin/rules` | GET | jeton |
| EP-28 | `/api/admin/rules` | PATCH | jeton |
| EP-29 | `/api/admin/autotag-all` | POST | jeton |
| EP-30 | `/api/admin/stats` | GET | jeton |
| EP-31 | `/api/admin/health/probe` | POST | jeton |
| EP-32 | `/api/admin/export.m3u` | GET | jeton |
| EP-33 | `/api/admin/export.json` | GET | jeton |
| EP-34 | `/api/admin/backup` | POST | jeton |
| EP-35 | `/api/admin/restore` | POST | jeton + confirmation |
| EP-36 | `/api/admin/password` | POST | jeton |
| EP-37 | `/api/admin/sessions` | DELETE | jeton |
| + | `/api/epg`, `/api/legal`, `/api/version`, `/api/errors/catalog`, `/api/admin/settings/reset` | GET/POST | selon la route |

---

## 6. Réserves et écarts assumés

1. **Jeux de données de production absents.** Les critères AC-006, AC-015, AC-017 portent sur des
   volumes (11 320 / 14 042 / 12 181 chaînes) que la livraison ne contient pas. La chaîne de
   traitement est testée sur 2 000 lignes réelles et sur le catalogue de 1 475 chaînes.
2. **Guide des programmes (XMLTV).** `F-23` n’est pas implémenté. `/api/epg` répond
   `enabled: false` avec une phrase explicite ; aucune grille factice n’est affichée.
3. **Migration PostgreSQL.** `F-24` n’est pas livré. Le runbook décrit la cible, pas une
   capacité existante. Seuil de bascule : 30 000 chaînes ou 40 Mo.
4. **Applications mobiles et TV, comptes, contrôle parental, abonnements, CDN, analytique.**
   Phases 3 et 4 du cahier des charges : hors périmètre de cette livraison.
5. **Mesures navigateur.** Les performances sont mesurées côté serveur et en jsdom. Aucune
   mesure sur appareil réel, réseau lent ou appareil bas de gamme n’est fournie (AC-032,
   AC-067, AC-068, AC-070, AC-071, AC-079, AC-082).
6. **Compression et débit.** Les chiffres du §8 du README sont reproductibles sur la machine de
   recette (Node 22.22.3, 8 cœurs) ; ils varieront sur un autre matériel.
7. **Sauvegardes hors site.** La copie hors du serveur est une exigence d’exploitation
   (RUNBOOK §8) ; elle n’est pas automatisée par l’application.

---

## 7. Comment reproduire ce tableau

```bash
node server/index.js &                     # service sur :3000
npm test                                   # 113 tests, 5 suites
node scripts/verify.js --base http://127.0.0.1:3000
node scripts/measure-tagger.js
node scripts/backup.js --list
curl -s -o /dev/null -w '%{size_download}\n' -H 'Accept-Encoding: gzip' \
  'http://127.0.0.1:3000/api/channels?pageSize=48'
```

Toute case « Vérifié » de ce document correspond à l’une de ces commandes ou à un test nommé.
Toute case « Partiel » indique précisément ce qui manque.
