# Sources, licences et traçabilité

Ce document recense tout ce qui n’est pas écrit ici : bibliothèques tierces, jeux de données,
polices, icônes et références. Aucun de ces éléments n’est chargé depuis un service distant à
l’exécution : tout est servi localement par StreamTV.

---

## 1. Bibliothèques d’exécution

### hls.js 1.5.17

| Élément | Valeur |
|---|---|
| Fichier | `public/vendor/hls.min.js` (413 952 octets) |
| Version | 1.5.17 (épinglée, jamais mise à jour automatiquement) |
| Licence | Apache License 2.0 — `public/vendor/hls.js.LICENSE` |
| Origine | `https://registry.npmjs.org/hls.js/-/hls.js-1.5.17.tgz` |
| Empreinte | SHA-256 consignée dans `public/vendor/hls.version.json` |
| Usage | lecture HLS dans les navigateurs sans support natif ; chargé en `defer` |
| Vérification | `tests/security.test.js` recalcule l’empreinte : le fichier n’a pas été modifié |

hls.js est utilisé sans modification. Il n’est pas indispensable : si le navigateur sait lire
`application/vnd.apple.mpegurl` (Safari, iOS), le lecteur n’instancie jamais hls.js.

**Aucune autre bibliothèque.** `package.json` déclare `"dependencies": {}` et
`"devDependencies": {}`. Les tests utilisent uniquement `node:test`, `node:assert` et la
bibliothèque standard.

---

## 2. Données du catalogue de démonstration

### iptv-org (domaine public / CC0)

| Élément | Valeur |
|---|---|
| Source | `https://github.com/iptv-org/iptv` (playlists par pays) |
| Base de connaissances | `https://github.com/iptv-org/database` — `channels.csv`, `logos.csv`, `countries.csv`, `categories.csv` |
| Licence de la base | CC0 1.0 (domaine public) — voir le dépôt iptv-org |
| Usage | construire `data/seed/seed.m3u` : 1 650 entrées réelles, 106 pays |
| Transformation | extraction des attributs `tvg-id`, `tvg-logo`, `group-title`, `#EXTVLCOPT` ; aucune donnée inventée |

Le fichier `data/seed/seed.m3u` conserve les URL d’origine des flux. Ces URL sont publiques par
nature et ne contiennent aucun identifiant personnel. Les flux restent la propriété de leurs
ayants droit : StreamTV n’héberge aucun contenu vidéo et se contente de pointer vers eux.

Le catalogue livré sert de **démonstration** : il ne remplace pas la liste de production du
propriétaire. Les compteurs de référence du cahier des charges (11 320, 14 042, 12 181 chaînes)
correspondent à des jeux de données de production non inclus ici.

### Logos

Les logos référencés par `tvg-logo` appartiennent à leurs chaînes. Ils sont affichés depuis leur
adresse d’origine (`img-src https:` dans la CSP) et ne sont ni copiés ni redimensionnés sur le
serveur. En cas d’image indisponible, l’interface affiche une vignette typographique : aucune
icône d’image brisée (BUG-14).

---

## 3. Typographie et icônes

| Élément | Origine | Licence |
|---|---|---|
| Police d’interface | pile système : `Inter`, `Segoe UI`, `system-ui`, `-apple-system`, `Helvetica Neue`, `Arial` | aucune police téléchargée ; si `Inter` est absente, le système fournit la sienne |
| Icônes | dessinées pour ce projet dans `public/js/ui.js` (SVG en ligne, 24 × 24) | œuvre interne |
| Logo StreamTV | `public/icons/logo.svg` et favicon | œuvre interne |
| Icônes PWA | `public/icons/icon-192.svg`, `icon-512.svg`, `maskable.svg` | œuvre interne |

Aucune icône ne provient d’un jeu tiers (Feather, Lucide, Material) : les tracés ont été écrits
pour ce projet, ce qui évite toute obligation d’attribution et toute dépendance de build.

---

## 4. Références techniques consultées

| Sujet | Référence | Ce qui en a été retenu |
|---|---|---|
| Format M3U / EXTINF | spécification informelle de la communauté IPTV (attributs `tvg-*`, `group-title`, `#EXTGRP`, `#EXTVLCOPT`) | tolérance maximale du parseur, refus explicite d’une playlist HLS |
| HLS (RFC 8216) | *HTTP Live Streaming*, Apple | détection `.m3u8`, repli natif avant hls.js |
| XMLTV | spécification XMLTV | format d’URL accepté pour `epgUrl` (`.xml`, `.xml.gz`) |
| scrypt (RFC 7914) | IETF | paramètres N = 16 384, r = 8, p = 1, sel de 16 octets |
| CSP niveau 3 | W3C | politique exacte du §10, `frame-ancestors`, `worker-src` |
| WCAG 2.2 niveau AA | W3C | contrastes, focus visible, cibles de 24 px, mouvements réduits |
| Node.js 20 LTS | documentation officielle | `node:test`, `fetch`, `crypto.scrypt`, `Intl.DisplayNames` |

---

## 5. Ce qui n’est pas utilisé

Pour éviter toute ambiguïté lors d’un audit :

- **aucun** framework serveur (Express, Fastify, Koa) ni client (React, Vue, Svelte) ;
- **aucun** bundler, transpileur ou minifieur dans la chaîne de livraison ;
- **aucun** CDN, aucune police distante, aucun script de mesure d’audience ;
- **aucun** ORM ni base de données : stockage JSON atomique ;
- **aucun** service tiers à l’exécution : le site fonctionne sur un réseau fermé.

---

## 6. Contenus produits par le projet

| Fichier | Origine | Licence |
|---|---|---|
| `public/epg-demo.xml` | généré par `scripts/make-epg-demo.js` à partir des noms de chaînes du catalogue | contenu du projet, libre de réutilisation ; chaque programme porte la mention « Grille de démonstration » |
| `data/seed/seed.m3u` | extrait des listes publiques iptv-org et de la base iptv-org/database | CC0 pour la base, listes sous licence de leurs auteurs (voir §2) |
| `public/icons/*.svg`, `public/css/app.css`, textes français | écrits pour ce projet | contenu du projet |

---

## 7. Mise à jour d’une dépendance tierce

Seul hls.js est concerné. Procédure :

1. télécharger la version voulue depuis le registre npm, fichier `hls.min.js` ;
2. remplacer `public/vendor/hls.min.js` et `public/vendor/hls.js.LICENSE` ;
3. mettre à jour `public/vendor/hls.version.json` (version, date, empreinte SHA-256) ;
4. incrémenter `CACHE_NAME` dans `public/sw.js` ;
5. exécuter `npm test` : `tests/security.test.js` vérifie l’empreinte et la licence ;
6. noter le changement dans `CHANGELOG.md`.

Toute autre dépendance d’exécution est contraire au cahier des charges et doit être refusée.
