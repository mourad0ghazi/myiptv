# Procès-verbal de recette — StreamTV v3.0.0

| Élément | Valeur |
|---|---|
| Objet | recette du site StreamTV, conforme au cahier des charges *StreamTV v2* |
| Version livrée | 3.0.0 |
| Date de recette | 25 octobre 2026 |
| Environnement | Node.js 22.22.3 (compatible 20 LTS), 8 cœurs, 16 Go de mémoire, Linux, réseau local |
| Dossier de recette | machine vierge, `data/` recréé depuis `data/seed/seed.m3u` |
| Référentiel de preuve | `npm test` (5 suites), `scripts/verify.js` (31 contrôles), `scripts/measure-tagger.js`, smoke tests DOM (jsdom 24) |
| Décision | **Recette prononcée avec réserves** (voir §7) |

---

## 1. Objet et méthode

La recette vérifie que la livraison tient les 118 critères du §11 du cahier des charges.
Trois niveaux de preuve sont utilisés :

1. **Tests automatisés** (`npm test`) : algorithmes, contrat HTTP, sécurité, contrat de
   l’interface, règles de livraison (900 lignes, zéro dépendance, 118 critères couverts).
2. **Contrôles d’exploitation** (`node scripts/verify.js`) : cohérence du catalogue, des fichiers,
   des sauvegardes, de la sécurité et du service en ligne.
3. **Essais d’interface** (smoke tests jsdom) : rendu sans erreur des 12 routes, cinq onglets de
   la console, modale de création, lecteur (montage, contrôles, mire, fermeture par `Échap`).

Chaque essai a été exécuté sur un dossier de données **neuf**, puis sur le catalogue de
démonstration complet (1 475 chaînes), afin de couvrir à la fois le premier démarrage et le
régime normal.

---

## 2. Résultats des tests automatisés

Commande : `npm test`

```text
1..48
# tests 113
# suites 15
# pass 113
# fail 0
# cancelled 0
# skipped 0
# duration_ms 13785.258410
```

Aucun échec, aucun test ignoré. Les cinq suites démarrent chacune leur propre serveur sur un
dossier temporaire : le catalogue livré n’a pas été modifié par la recette.

Détail par suite :

| Suite | Tests | Résultat | Points couverts |
|---|---:|---|---|
| `tests/core.test.js` | 35 | conforme | parseur (BOM, CRLF, arabe, virgules, `#EXTGRP`, `//host`, HLS refusé), 2 fixtures de 2 000 lignes, déduplication, fusion des variantes, catégorisation, confiance, recherche (accents, arabe, pays), pagination, tri, réglages, contrat de chaîne, assertions A1–A10 |
| `tests/api.test.js` | 27 | conforme | 41 routes, 20 codes d’erreur, ordre de contrôle, pagination bornée, compression, en-têtes, importation complète (aperçu → commit → annulation), idempotence, verrou concurrent, sauvegarde/restauration, mot de passe, écriture atomique, refus de démarrage en production |
| `tests/security.test.js` | 15 | conforme | scrypt, jetons, TTL, plafond de sessions, force brute, audit sans secret, CSP, injection, traversée de chemin, sauvegarde corrompue, fichiers publics sans script en ligne |
| `tests/client.test.js` | 25 | conforme | jetons CSS, quatre points de rupture, classes présentes, 12 mires distinctes, 7 états, une seule reprise, garde-fous clavier, ARIA, plafond de cartes, PWA |
| `tests/conformite.test.js` | 11 | conforme | 900 lignes maximum, aucun marqueur de travail, zéro dépendance, 20 codes, 17 réglages, 18 catégories, documents présents, 118 critères couverts |

---

## 3. Contrôles d’exploitation

Commande : `node scripts/verify.js --base http://127.0.0.1:3000`

```text
30/31 contrôles réussis, 1 avertissement(s).

Avertissements :
  ! mot de passe par défaut changé (mot de passe par défaut encore actif — à changer avant mise en ligne)
```

Les 30 contrôles réussis couvrent : version, 20 codes, 17 réglages, 18 catégories, validité des
réglages, catalogue non vide (1 475), 36 champs obligatoires présents, identifiants sha1 tronqués,
catégories connues, confiances bornées, aucun doublon d’identifiant, numéros uniques, cinq
fichiers de données, sauvegarde présente et vérifiée, scrypt N = 16 384, journal d’audit lisible
et sans secret, service en ligne, contrat `/api/config`, plafond de pagination, console protégée
(401), fiche inconnue en 404, CSP présente, `nosniff` présent, parseur opérationnel.

L’avertissement est **attendu** sur une installation de démonstration : le mot de passe `admin`
est actif et signalé par un bandeau dans l’interface. Il devient une exigence bloquante avant
mise en ligne (AC-101, RUNBOOK §8).

---

## 4. Mesures

### 4.1 Moteur de classement

Commande : `node scripts/measure-tagger.js`

```text
Chaînes analysées        1475
Débit                    46 551 chaînes/s (cible ≥ 5 000)
Confiance moyenne        0.849
Part sous 0,45           0.0 % (cible ≤ 30 %)
Part « autre »           0.0 % (cible 0 %)
Précision échantillon    97,6 % sur 41 étiquettes
Accord groupes de genre  100,0 %
```

Répartition obtenue : divertissement 372, info 286, religion 244, musique 217, sport 66,
jeunesse 54, éducation 45, cinéma 43, documentaire 36, téléachat 31, voyage 27, séries 26,
santé 21, cuisine 5, sciences 2, autre 0.

Seul désaccord consigné : « Arte » classé en divertissement au lieu de documentaire — le groupe
source est « Culture », qui ne fait pas partie des groupes de genre du cahier des charges.
Aucune correction forcée n’a été appliquée pour ne pas masquer un cas réel à traiter par
règles personnalisées.

### 4.2 Réponses HTTP

| Requête | Brut | gzip | brotli |
|---|---:|---:|---:|
| `GET /api/channels?pageSize=48` | 17 588 o | 2 512 o | 2 173 o |
| `GET /api/config` | 3 786 o | 1 415 o | 1 216 o |
| `GET /` | 5 434 o | 1 986 o | 1 617 o |
| `GET /css/app.css` | 41 106 o | 8 653 o | 7 647 o |

### 4.3 Chargement initial et empreinte

| Mesure | Valeur | Cible |
|---|---|---|
| Premier chargement (hors hls.js, administration et pages légales différées) | 179 745 o brut, 55 939 o gzip | ≤ 180 Ko |
| hls.js | 413 952 o, chargé uniquement si nécessaire | hors cible |
| Démarrage à froid (1 475 chaînes) | 0,69 s | < 5 s |
| Cartes dans le DOM | 48 (accueil), 120 maximum | ≤ 120 |
| Temps de réponse local `GET /` | 1,4 ms | ≤ 2,5 s au premier rendu |

---

## 5. Essais d’interface (smoke tests jsdom)

| Écran | Résultat | Détail observé |
|---|---|---|
| `/` | conforme | héros, 2 bandeaux, 48 cartes, 18 filtres |
| `/guide` | conforme | en-tête « Zapping », saut au numéro, compteurs par catégorie |
| `/favoris` | conforme | deux sections, état vide avec action |
| `/connexion` | conforme | formulaire, mention du mot de passe unique |
| `/admin` (sans jeton) | conforme | écran de verrouillage, aucun contenu protégé |
| `/admin` (avec jeton) | conforme | 5 onglets fonctionnels : Catalogue (60 lignes), Importation, Configuration (17 réglages), Santé, Sauvegardes |
| Modale « Ajouter une chaîne » | conforme | ouverture, champs, focus sur le premier champ |
| `/chaine/de127beab63f` | conforme | fiche complète, rareté, actions |
| `/mentions-legales`, `/confidentialite`, `/signaler`, `/aide`, `/erreurs` | conformes | contenus complets, date de mise à jour |
| `/nexiste-pas` | conforme | page 404 dédiée, retour au catalogue |
| Lecteur | conforme | overlay monté, 7 contrôles, mire affichée, `Échap` ferme et rend la main (`state: IDLE`) |

Aucune erreur de console n’a été relevée pendant le parcours des 12 routes.

---

## 6. Critères — résultat de synthèse

| Famille | Critères | Vérifiés | Partiels | Hors périmètre |
|---|---:|---:|---:|---:|
| A — Démarrage | 5 | 5 | 0 | 0 |
| B — Parseur M3U | 8 | 7 | 1 | 0 |
| C — Déduplication et ingestion | 7 | 3 | 3 | 1 |
| D — Catégorisation | 9 | 9 | 0 | 0 |
| E — Catalogue et performance | 10 | 8 | 2 | 0 |
| F — Recherche et règles | 10 | 9 | 1 | 0 |
| G — Lecteur et flux | 20 | 13 | 7 | 0 |
| H — Accessibilité | 10 | 6 | 4 | 0 |
| I — PWA et portabilité | 10 | 6 | 4 | 0 |
| J — Sécurité | 10 | 9 | 1 | 0 |
| K — Exploitation | 10 | 7 | 3 | 0 |
| L — Légal et finalisation | 9 | 5 | 4 | 0 |
| **Total** | **118** | **87** | **30** | **1** |

Le détail critère par critère figure dans `CONFORMITE.md` §2.

---

## 7. Réserves

Les réserves ci-dessous sont **acceptées** par le maître d’ouvrage pour cette version ; elles
conditionnent la mise en production.

1. **Jeux de données de production absents** (AC-006, AC-015, AC-017). Les volumes de référence
   (11 320 / 14 042 / 12 181 chaînes) ne sont pas fournis. La livraison prouve la chaîne de
   traitement sur 2 000 lignes réelles et sur 1 475 chaînes dédupliquées.
2. **Mesures navigateur manquantes** (AC-032, AC-067, AC-068, AC-070, AC-071, AC-079, AC-082).
   Les mesures sont serveur et jsdom. Aucun essai sur appareil réel, réseau lent ou lecteur
   d’écran physique n’est joint.
3. **Guide des programmes XMLTV non implémenté** (F-23). L’API répond `enabled: false` avec un
   message explicite : aucune fonctionnalité factice n’est proposée.
4. **Migration PostgreSQL non livrée** (F-24). Le seuil de bascule (30 000 chaînes, 40 Mo) et la
   procédure cible sont documentés dans `RUNBOOK.md` §6.
5. **Phases 3 et 4 hors périmètre** : comptes, contrôle parental, applications mobiles et TV,
   abonnements, CDN, analytique.
6. **Mot de passe de démonstration actif.** À changer impérativement avant exposition publique.
7. **Sauvegardes hors site non automatisées.** La copie hors serveur reste une tâche
   d’exploitation.

Aucune de ces réserves ne masque un défaut connu du code : les critères concernés sont marqués
« Partiel » ou « Hors périmètre » dans `CONFORMITE.md`, jamais « Vérifié ».

---

## 8. Décision et signatures

**Décision : recette prononcée avec réserves.**
Le site est déclaré conforme aux phases 1 et 2 du cahier des charges, sous réserve de la levée
des points du §7 avant ouverture publique.

| Rôle | Nom | Date | Signature |
|---|---|---|---|
| Maître d’ouvrage | | 25 octobre 2026 | |
| Direction technique | | 25 octobre 2026 | |
| Recette fonctionnelle | | 25 octobre 2026 | |
| Exploitation | | 25 octobre 2026 | |

### Contrôle final avant signature

```bash
npm test                                            # attendu : # fail 0
node scripts/verify.js --base http://127.0.0.1:3000 # attendu : 0 erreur, 1 avertissement
node scripts/measure-tagger.js                      # attendu : toutes cibles ✓
```

| Contrôle | Exigence | Résultat |
|---|---|---|
| `npm test` | 0 échec | conforme (113/113) |
| `verify.js` | 0 erreur | conforme (1 avertissement attendu) |
| `measure-tagger.js` | toutes cibles tenues | conforme |
| Sauvegarde récente | < 26 h | conforme |
| Restauration testée | oui | conforme |
| Mot de passe changé | oui | **à faire avant mise en ligne** |

---

## 9. Annexes

- `README.md` — démarrage, architecture, API, mesures, limites.
- `RUNBOOK.md` — exploitation, incidents, sauvegardes, mise à jour.
- `CONFORMITE.md` — 118 critères, 22 bugs de non-régression, 24 algorithmes, matrice des routes.
- `SOURCES.md` — licences et traçabilité.
- `CHANGELOG.md` — historique de la version.
- `data/audit.log` — journal des actions effectuées pendant la recette.
- `data/backups/` — sauvegardes créées pendant la recette, avec empreintes SHA-256.
