// tests/client.test.js — contrat de l'interface (§7, §8) vérifié sans navigateur ni dépendance :
// jetons CSS exacts, textes du §8.3, garde-fous clavier, mires, ARIA, limites du DOM.

import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import test, { describe } from 'node:test';

import { ROOT } from './helpers.js';

const read = (relative) => fsp.readFile(path.join(ROOT, relative), 'utf8');

async function listFiles(dir, filter) {
  const out = [];
  for (const entry of await fsp.readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(relative, filter));
    else if (!filter || filter(relative)) out.push(relative);
  }
  return out;
}

const css = await read('public/css/app.css');
const copy = await read('public/js/copy.js');
const player = await read('public/js/player.js');
const app = await read('public/js/app.js');
const index = await read('public/index.html');

describe('Feuille de style unique (§7.1)', () => {
  test('jetons exacts : fond, accent, focus, échelle de 4', () => {
    for (const token of ['--bg:#06070b', '--accent:#ff3d71', '--focus:#7cc4ff', '--text:#f2f5fb', '--muted:#97a0b3']) {
      assert.ok(css.includes(token), `jeton manquant : ${token}`);
    }
    for (const scale of ['--s1:4px', '--s2:8px', '--s3:12px', '--s4:16px', '--s5:24px', '--s6:32px', '--s7:48px']) {
      assert.ok(css.includes(scale), `échelle manquante : ${scale}`);
    }
    assert.match(css, /--fs-xs:12px/, 'aucune police sous 12 px');
    const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
    assert.deepEqual(sizes.filter((size) => size < 12), [], 'une taille de police descend sous 12 px');
  });

  test('une seule feuille, aucun @import, aucune police distante', () => {
    const imports = [...css.matchAll(/@import\s+url\((['"]?)([^)'"]+)\1\)/g)].map((match) => match[2]);
    assert.deepEqual(imports, []);
    assert.equal(/https?:\/\/fonts\./.test(css), false);
    assert.equal(/<link[^>]+stylesheet[^>]+css\/(?!app\.css)/.test(index), false);
  });

  test('quatre points de rupture et aucune largeur fixe sur le corps', () => {
    const breakpoints = [...css.matchAll(/@media\s*\(([^)]+)\)/g)].map((match) => match[1]).join(' | ');
    // §7.4 : ≥ 1280 px, 900–1279 px, 620–899 px, < 620 px.
    for (const width of ['1279', '899', '619']) {
      assert.ok(breakpoints.includes(width), `point de rupture manquant : ${width} px`);
    }
    assert.equal(/max-width:\s*(1023|1024|640|768)px/.test(css), false, 'points de rupture hors cahier des charges');
    assert.equal(/body\s*\{[^}]*width:\s*\d+px/.test(css), false);
  });

  test('les classes utilisées par le JavaScript existent toutes dans la feuille', async () => {
    const files = (await listFiles('public/js', (file) => file.endsWith('.js')));
    const used = new Set();
    for (const file of files) {
      const source = await read(file);
      for (const match of source.matchAll(/class:\s*'([^']+)'/g)) {
        for (const name of match[1].split(/\s+/)) if (name) used.add(name);
      }
      for (const match of source.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)) used.add(match[1]);
    }
    const missing = [...used].filter((name) => !name.includes('-loading')
      && !css.includes(`.${name}`)
      && !new RegExp(`\\.${name}(?![\\w-])`).test(css));
    assert.deepEqual(missing.sort(), [], `classes sans style : ${missing.join(', ')}`);
  });

  test('états et variantes stylés : focus, aria, tonalités', () => {
    for (const selector of [':focus-visible', '[aria-pressed="true"]', '[aria-selected="true"]',
      '[data-tone="danger"]', '[data-state="up"]', '.visually-hidden', '.skip-link']) {
      assert.ok(css.includes(selector), `sélecteur absent : ${selector}`);
    }
    assert.match(css, /prefers-reduced-motion/, 'mouvement réduit pris en compte');
    assert.match(css, /@media print|print\b/, 'feuille imprimable');
  });
});

describe('Textes et messages (§8.3, §9)', () => {
  test('les 12 mires existent avec un titre et une explication distincts', () => {
    const titles = new Set();
    const explanations = new Set();
    for (let index = 1; index <= 12; index += 1) {
      const code = `P-${String(index).padStart(2, '0')}`;
      assert.ok(copy.includes(`'${code}':`), `${code} absent du paquet de textes`);
      const block = copy.slice(copy.indexOf(`'${code}':`), copy.indexOf(`'${code}':`) + 700);
      const title = /title:\s*'([^']+)'/.exec(block)?.[1];
      const explanation = /explanation:\s*'([^']+)'/.exec(block)?.[1];
      assert.ok(title && title.length > 4, `${code} sans titre`);
      assert.ok(explanation && explanation.length > 20, `${code} sans explication`);
      titles.add(title);
      explanations.add(explanation);
    }
    assert.equal(titles.size, 12, '12 titres distincts');
    assert.equal(explanations.size, 12, '12 explications distinctes');
    assert.equal(/undefined|\[object|NaN/.test(copy), false, 'aucun artefact technique dans les textes');
  });

  test('aucun jargon technique dans les textes affichés', () => {
    const forbidden = [/\bnull\b/, /undefined/, /\bNaN\b/, /\bHTTP 4\d\d\b/, /CORS/, /fetch/i, /stack/i, /token expiré/i];
    const displayed = copy
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const pattern of forbidden) {
      assert.equal(pattern.test(displayed), false, `texte interdit : ${pattern}`);
    }
  });

  test('le vocabulaire du cahier des charges est respecté', () => {
    for (const phrase of ['Toute ta télévision, dans un seul endroit', 'Mot de passe incorrect', 'Chaîne introuvable']) {
      assert.ok(copy.includes(phrase), `phrase absente : ${phrase}`);
    }
    assert.match(copy, /Aller au contenu/);
    assert.match(index, /Aller au contenu/);
  });

  test('les constats d’erreur du §9 ont une phrase dédiée', async () => {
    const view = await read('public/js/views/error-codes.js');
    for (let index = 1; index <= 20; index += 1) {
      const code = `ERR-${String(index).padStart(2, '0')}`;
      assert.ok(view.includes(code), `${code} absent du catalogue affiché`);
    }
  });
});

describe('Lecteur (§8.3)', () => {
  test('machine à états : 7 états, une seule reprise automatique', () => {
    for (const state of ['IDLE', 'PREPARING', 'PLAYING', 'PAUSED', 'BUFFERING', 'RETRYING', 'ERROR']) {
      assert.ok(player.includes(`'${state}'`), `état manquant : ${state}`);
    }
    assert.match(player, /this\.attempts < 1/, 'une seule reprise');
    assert.match(player, /clearTimeout\(this\.retryTimer\)/);
    assert.equal(/attempts < [2-9]/.test(player), false, 'aucune boucle de reprise');
  });

  test('les 12 codes de mire sont atteignables et les blocages traduits', () => {
    for (let index = 1; index <= 12; index += 1) {
      const code = `P-${String(index).padStart(2, '0')}`;
      assert.ok(player.includes(code), `${code} jamais déclenché`);
    }
    assert.match(player, /'mixed-content': 'P-01'/);
    assert.match(player, /'ua-required': 'P-02'/);
    assert.match(player, /dead: 'P-04'/);
    assert.match(player, /manual: 'P-11'/);
  });

  test('HLS natif prioritaire, hls.js local, aucun rechargement de page', () => {
    assert.match(player, /canPlayType\('application\/vnd\.apple\.mpegurl'\)/);
    assert.match(player, /window\.Hls/);
    assert.equal(/https?:\/\/[^'"]*hls\.min\.js/.test(player), false, 'hls.js est servi localement');
    assert.match(player, /manifestLoadingMaxRetry:\s*0/);
  });

  test('lecture d’une chaîne : l’URL n’arrive qu’après la requête de fiche', () => {
    assert.match(player, /api\(`\/api\/channels\/\$\{channelOrId\}`\)/);
    assert.match(player, /if \(channel && !channel\.url\)/);
  });

  test('contrôles accessibles : libellés, clavier, aria', () => {
    assert.match(player, /aria-label/);
    assert.match(player, /aria-live/);
    assert.match(player, /role:\s*'dialog'/);
    assert.match(player, /Escape/);
    assert.match(player, /aria-modal/);
  });
});

describe('Raccourcis clavier et garde-fous (BUG-03)', () => {
  test('les raccourcis sont ignorés dans les champs de saisie', () => {
    assert.match(app, /isEditingField/);
    const guard = /const isEditingField[\s\S]{0,600}/.exec(app)?.[0] || '';
    assert.match(guard, /INPUT/);
    assert.match(guard, /TEXTAREA/);
    assert.match(guard, /SELECT/);
    assert.match(guard, /isContentEditable/);
    assert.match(guard, /role="textbox"|role=\\"textbox\\"/);
  });

  test('raccourci de recherche « / » et aide « ? », sans interférer avec la saisie', () => {
    assert.match(copy, /\['\/',\s*'Aller à la recherche'\]/);
    assert.match(copy, /\['\?',\s*'Afficher cette aide'\]/);
    assert.match(app, /key === '\/'/);
  });

  test('Échap ferme la couche active, sans quitter la page', () => {
    assert.match(player, /Escape/);
    assert.match(app, /Escape/);
  });
});

describe('Routage client et rendu', () => {
  test('12 routes connues et un repli 404 explicite', async () => {
    const router = await read('public/js/router.js');
    const names = [...router.matchAll(/name:\s*'([^']+)'/g)].map((match) => match[1]);
    for (const route of ['home', 'search', 'guide', 'channel', 'favorites', 'login', 'admin',
      'legal', 'privacy', 'report', 'help', 'errors']) {
      assert.ok(names.includes(route), `route manquante : ${route}`);
    }
    assert.match(router, /notFound/);
    assert.match(router, /history\.pushState/);
  });

  test('plafond de 120 cartes et pagination respectée côté client', async () => {
    const home = await read('public/js/views/home.js');
    const guide = await read('public/js/views/guide.js');
    assert.match(app, /MAX_DOM_CARDS\s*=\s*120/);
    assert.match(`${home}${guide}`, /pageSize/);
    // Tout pageSize demandé au serveur reste sous le plafond de 60 (EP-03).
    const sizes = [...`${home}${guide}`.matchAll(/pageSize[^\n]{0,40}?(\d{2,3})/g)].map((match) => Number(match[1]));
    assert.ok(sizes.length > 0, 'aucun pageSize détecté');
    for (const size of sizes) assert.ok(size <= 60, `pageSize ${size} dépasse 60`);
  });

  test('carte, recherche, pager : contrats DOM du §7.3', async () => {
    const components = await read('public/js/components.js');
    const home = await read('public/js/views/home.js');
    // <article role="button" tabindex="0" aria-label="{nom}, {catégorie}, chaîne {numéro}">
    assert.match(components, /class: 'card', role: 'button'/);
    assert.match(components, /chaîne \$\{channel\.number\}/);
    assert.match(components, /tabIndex: 0/);
    // Recherche : role="searchbox" + aria-autocomplete="list" + croix + liste de suggestions.
    assert.match(index, /role="searchbox"/);
    assert.match(index, /aria-autocomplete="list"/);
    assert.match(index, /id="search-suggestions"[^>]*role="listbox"|role="listbox"[^>]*id="search-suggestions"/);
    assert.match(index, /id="search-clear"/);
    // Pager : « Page 3 sur 254 · 12 181 chaînes » + précédent/suivant.
    assert.match(home, /Page \$\{fmtNumber\(page\)\} sur \$\{fmtNumber\(pages\)\}/);
    assert.match(home, /'Page précédente'/);
    assert.match(home, /'Page suivante'/);
    // « Charger plus » obligatoire sur l'écran 1, sous le plafond de 120 cartes du DOM.
    assert.match(home, /COPY\.actions\.loadMore/);
    assert.match(home, /CARD_LIMIT = 120/);
  });

  test('états vides et actions : textes opposables du §7.5', () => {
    assert.match(copy, /'Aucune chaîne pour l’instant'/);
    assert.match(copy, /Ajoutez votre première chaîne dans l’administration\./);
    assert.match(copy, /Cette catégorie est vide pour le moment/);
    assert.match(copy, /Revenez au catalogue complet\./);
    assert.match(copy, /message: 'Cliquez sur l’étoile d’une chaîne\.'/);
    assert.match(copy, /'Vous n’avez rien regardé récemment\.'/);
    assert.match(copy, /Toutes les chaînes ont été vérifiées\./);
    assert.match(copy, /loadMore: 'Charger plus'/);
  });

  test('OSD du lecteur : nom, numéro, catégorie, qualité — rien d’autre', () => {
    assert.match(player, /this\.osd = h\('div'/);
    assert.match(player, /channel\.categoryLabel/);
    assert.match(player, /channel\.quality/);
    assert.equal(/class: 'osd'[\s\S]{0,400}healthLabel/.test(player), false, 'l’OSD n’affiche pas l’état de santé');
    // Toute mire propose au moins deux actions (§7.3), même quand la table n’en cite qu’une.
    assert.match(player, /if \(actionIds\.length < 2\) actionIds\.push\('copy'\)/);
  });

  test('échappement systématique : pas de innerHTML avec des données', async () => {
    const files = await listFiles('public/js', (file) => file.endsWith('.js'));
    for (const file of files) {
      const source = await read(file);
      for (const match of source.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)) {
        const value = match[1].trim();
        assert.ok(value.startsWith('`<svg') || value.includes('svg'), `${file} écrit du HTML non statique : ${value.slice(0, 60)}`);
      }
      assert.equal(/insertAdjacentHTML/.test(source), false, `${file} utilise insertAdjacentHTML`);
    }
  });

  test('ARIA : régions vivantes, titres de page, focus géré', async () => {
    assert.match(index, /aria-live="polite"/);
    assert.match(index, /role="status"/);
    assert.match(app, /document\.title/);
    assert.match(app, /main\.focus|focus\(\)/);
    assert.match(index, /<main[^>]+id="main"/);
    // Chaque écran porte son titre de niveau 1 (un seul par vue).
    for (const view of ['home', 'guide', 'channel', 'favorites', 'login', 'admin', 'legal', 'error']) {
      const source = await read(`public/js/views/${view}.js`);
      assert.match(source, /h1|'h1'/, `${view}.js sans titre de niveau 1`);
    }
  });

  test('préférences locales uniquement (favoris, historique, volume)', async () => {
    const prefs = await read('public/js/prefs.js');
    assert.match(prefs, /localStorage/);
    assert.equal(/\/api\/(favoris|favorites|history)/.test(prefs), false, 'aucun favori envoyé au serveur');
    assert.match(prefs, /removeFavorite/);
    assert.match(prefs, /removeHistory/);
  });
});

describe('PWA et résilience hors ligne', () => {
  test('manifeste installable et icônes locales', async () => {
    const manifest = JSON.parse(await read('public/manifest.webmanifest'));
    for (const icon of manifest.icons) {
      const file = icon.src.replace(/^\//, '');
      await fsp.access(path.join(ROOT, 'public', file));
    }
    assert.equal(manifest.icons.every((icon) => icon.src.startsWith('/icons/')), true);
  });

  test('page hors ligne dédiée, sans script inline', async () => {
    const offline = await read('public/offline.html');
    assert.match(offline, /hors ligne|connexion/i);
    assert.equal(/<script(?![^>]*src=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(offline), false);
    await fsp.access(path.join(ROOT, 'public/js/offline.js'));
  });

  test('les modules ES n’utilisent que des imports relatifs', async () => {
    const files = await listFiles('public/js', (file) => file.endsWith('.js'));
    for (const file of files) {
      const source = await read(file);
      for (const match of source.matchAll(/^\s*import\s[^;]*?from\s*'([^']+)'/gm)) {
        assert.match(match[1], /^\.\.?\//, `${file} importe ${match[1]} hors du site`);
      }
      assert.equal(/require\(/.test(source), false, `${file} utilise require`);
    }
  });
});
