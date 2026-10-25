# Journal des versions — StreamTV

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Versionnement sémantique. Toutes les dates sont au format `AAAA-MM-JJ`.

## [3.0.0] — 2026-10-25

Première livraison complète du site décrit par le cahier des charges *StreamTV v2*
(phases 1 « socle » et 2 « durcissement »). Aucune dépendance d’exécution, aucun `npm install`.

### Ajouté — socle

- Serveur HTTP natif (`server/index.js`) : 41 routes, fichiers statiques, repli SPA explicite,
  compression brotli/gzip au-delà de 1 Ko, `Vary: Accept-Encoding`, `HEAD`.
- Stockage JSON atomique (`server/core/store.js`) : cinq fichiers de données, écriture
  temporaire → `fsync` → `rename`, quarantaine d’un fichier illisible, restauration automatique
  de la dernière sauvegarde valide, arrêt propre.
- Parseur M3U `F-01` : BOM, CRLF, attributs, `#EXTGRP`, `#EXTVLCOPT` (User-Agent, referer),
  noms contenant des virgules, URL `//host`, URL orphelines, refus d’une playlist HLS,
  aucun lancer d’exception.
- Déduplication `F-09` (URL, signature nom+pays, similarité de jetons) et fusion des variantes
  `F-21` avec conservation de la meilleure qualité et de l’URL la plus fiable.
- Catégorisation `F-10` en cinq étapes ordonnées (manuel, groupe de genre, indice `tvg-id`,
  mots-clés, repli), confiance fermée `F-11` dans `[0,15 ; 0,95]` avec justifications lisibles.
- Contrat de chaîne complet (36 champs), assertions `A1`–`A10`, projections distinctes pour la
  carte publique, la fiche et la console.
- Recherche `F-17`/`F-18` insensible aux accents, apostrophes, casse et écriture arabe ;
  pagination `F-19` bornée à 60 ; tri total et stable.
- Ingestion `F-20` : aperçu sans écriture (TTL 20 min), commit sérialisé par verrou global,
  annulation exacte, plafonds 20 Mo / 20 s / 120 s, refus d’un catalogue entièrement masqué.
- Sonde de santé `F-16` : `Range: bytes=0-0`, 8 flux en parallèle, 6 s par flux,
  300 flux/minute, blocage automatique après 3 échecs, reprise au premier succès.
- Authentification : `scrypt` (N = 16 384, r = 8, p = 1), jeton Bearer de 48 caractères
  hexadécimaux, TTL glissant de 12 h, 5 sessions au plus, anti-force brute 8/15 min.
- Console d’administration : 5 onglets (Catalogue, Importation, Réglages, Santé, Sauvegardes),
  actions groupées, modale de création, éditeur de règles, exports M3U/JSON, sauvegardes.

### Ajouté — interface

- Coquille unique accessible (lien d’évitement, `main` focalisable, annonces `aria-live`).
- Sept écrans : accueil, recherche, guide, fiche chaîne, favoris/historique, connexion, console.
- Feuille de style unique (`public/css/app.css`) : jetons exacts du §7.1, échelle de 4 px,
  aucune police sous 12 px, quatre points de rupture, thème sombre, `prefers-reduced-motion`.
- Lecteur : HLS natif puis hls.js local, 7 états, **une seule** reprise automatique, 12 mires
  distinctes `P-01`…`P-12`, zapping, saisie directe, OSD masqué à 3,8 s, PiP, plein écran,
  volume et favoris mémorisés.
- PWA : manifeste complet, service worker `streamtv-v3.0.0`, coquille hors ligne, API et
  console jamais mises en cache.
- Copy deck unique (`public/js/copy.js`) : toutes les phrases visibles, y compris les 12 mires
  et les états vides, sans terme technique.

### Ajouté — exploitation

- `scripts/ingest.js` (aperçu, commit, URL ou fichier), `scripts/measure-tagger.js` (mesure du
  moteur), `scripts/backup.js` (sauvegarde, inventaire, vérification des empreintes),
  `scripts/verify.js` (31 contrôles de santé, code de sortie exploitable).
- Sauvegardes quotidiennes à 03:00, rotation 7 quotidiennes + 4 hebdomadaires, empreinte
  SHA-256 vérifiée avant toute restauration, restauration exigeant le mot `RESTAURER`.
- Journal d’audit JSONL, secrets masqués, purge à 30 jours ; journaux purgés à 14 jours.
- `README.md`, `RUNBOOK.md`, `CONFORMITE.md`, `SOURCES.md`, `docs/PV-RECETTE.md`.

### Corrigé — bugs qui ne doivent jamais revenir

- `BUG-01` : la recherche et le classement ignorent désormais les accents (`CINEMA` trouve
  `Cinéma`), avec un test de non-régression.
- `BUG-04` : un JSON syntaxiquement invalide répond `400 ERR-06`, jamais `500`.
- `BUG-06` : une adresse inconnue répond `404` ; une fiche inexistante ne renvoie plus le
  catalogue en `200`.
- `BUG-07` : une importation qui ne trouve aucune chaîne échoue explicitement (`ERR-05`) au
  lieu d’écrire un catalogue vide.
- `BUG-08` : douze messages de mire distincts remplacent le message unique.
- `BUG-09` : toute écriture passe par un fichier temporaire, `fsync`, puis `rename`.
- `BUG-10` : `pageSize` est borné à 60 côté serveur et côté client.
- `BUG-12` : plafond de 120 cartes dans le DOM, pagination systématique.
- `BUG-13` : compression brotli/gzip activée au-delà de 1 Ko.
- `BUG-14` : les images cassées sont remplacées par une vignette typographique, jamais par
  l’icône d’image brisée du navigateur.
- `BUG-20` : les chaînes masquées sont comptées et affichées (`totals.hidden`, bandeau dédié).
- Reprise d’un `jobId` inconnu ou déjà consommé : `422 ERR-16` explicite au lieu de `500`.
- État d’une importation demandé avec l’identifiant de l’aperçu : `status` et `rollback`
  répondent désormais sur le même identifiant.
- Groupes `#EXTGRP` et `User-Agent` qui fuyaient d’une entrée à l’autre après une entrée
  orpheline.

### Sécurité

- CSP complète, HSTS en HTTPS, `nosniff`, `SAMEORIGIN`, `Permissions-Policy` fermée,
  `Referrer-Policy`, `X-DNS-Prefetch-Control`.
- Aucun script en ligne, aucune ressource tierce, aucun `eval` ; vérifié par test.
- Refus de démarrage en production sans `ADMIN_PASSWORD`.
- Restauration de sauvegarde protégée contre la traversée de chemin et contre une empreinte
  modifiée.
- Liste noire de mots de passe élargie (mot courant suivi de chiffres).

### Mesures de la version

| Indicateur | Valeur |
|---|---|
| Chaînes du catalogue de démonstration | 1 475 (1 650 entrées brutes) |
| Débit du moteur | 46 898 chaînes/s |
| Précision sur 41 étiquettes | 97,6 % |
| Accord sur les groupes de genre | 100 % |
| Part « autre » | 0 % |
| `GET /api/channels?pageSize=48` | 17 588 o → 2 512 o gzip |
| Premier chargement (hors hls.js) | 179 Ko brut, 54 Ko gzip |
| Démarrage à froid | 0,69 s |
| Tests | 113 tests, 5 suites |

### Limites connues de cette version

- Comptes multi-utilisateurs, contrôle parental par profil, applications mobiles et TV,
  abonnements, CDN et analytique : hors périmètre (phases 3 et 4 du cahier des charges).
- Migration PostgreSQL non livrée : le catalogue de démonstration (1,7 Mo) reste très en deçà
  du seuil de 30 000 chaînes.
- Guide des programmes XMLTV non branché : `/api/epg` répond `enabled: false` avec un message
  explicite.
- Le catalogue de démonstration est un extrait de 1 650 entrées ; les critères portant sur les
  jeux de 11 320 / 14 042 / 12 181 chaînes sont partiels.

[3.0.0]: #
