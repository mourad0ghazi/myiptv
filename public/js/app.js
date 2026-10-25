// public/js/app.js — amorçage de la coquille, en-tête, bannières, routeur, enregistrement du service worker.
// Une seule instance d'application : #main est le seul point de montage des vues.

import { api, ApiError, auth } from './api.js';
import { COPY } from './copy.js';
import { h, icon, toast, modal, spinner, debounce } from './ui.js';
import { createRouter } from './router.js';
import { getPlayer } from './player.js';
import { prefs } from './prefs.js';

import { renderHome } from './views/home.js';
import { renderGuide } from './views/guide.js';
import { renderChannel } from './views/channel.js';
import { renderFavorites } from './views/favorites.js';
import { renderLogin } from './views/login.js';

/**
 * Chargements différés : la console d'administration et les pages légales ne sont
 * téléchargées qu'au moment où elles sont ouvertes (premier rendu plus rapide, AC-032).
 */
const loadAdmin = () => import('./views/admin.js');
const loadLegal = () => import('./views/legal.js');
import { renderNotFound, renderFailure, renderOffline } from './views/error.js';

/* Plafond dur de cartes « chaîne » simultanées dans le DOM (§2.4, BUG-12). */
export const MAX_DOM_CARDS = 120;

const state = {
  config: null,
  configAt: 0,
  offline: false,
  booted: false,
  route: null,
  dismissedBanners: new Set(),
  renderToken: 0,
  cleanup: null,
  container: null,
};

const $main = () => document.getElementById('main');

/* ------------------------------------------------------------------ config */

async function loadConfig() {
  const config = await api('/api/config');
  state.config = config;
  state.configAt = Date.now();
  state.offline = false;
  return config;
}

function applyBrand(config) {
  if (!config) return;
  const root = document.documentElement;
  document.title = `${config.brand} · ${config.tagline || COPY.tagline}`;

  document.querySelectorAll('[data-brand], #brand-text, .brand-text').forEach((node) => {
    node.textContent = config.brand || 'StreamTV';
  });
  if (/^#[0-9a-f]{3}([0-9a-f]{6})?$/i.test(config.accent || '')) {
    root.style.setProperty('--accent', config.accent);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#06070b');
  const note = document.querySelector('[data-footer-note]');
  if (note) {
    note.textContent = config.footerNote || '';
    note.hidden = !config.footerNote;
  }
  const legal = document.querySelector('[data-legal-mention]');
  if (legal) legal.textContent = config.legal?.mention || COPY.legal.mention;
  const footerMeta = document.getElementById('footer-meta');
  if (footerMeta) {
    footerMeta.textContent = `${config.brand} v${config.version} · Node.js · zéro dépendance · ${config.totals?.visible ?? 0} chaînes visibles`;
  }
  const logoMark = document.querySelector('.brand-mark');
  if (logoMark && config.logoUrl) {
    const img = h('img', { src: config.logoUrl, alt: '', width: '26', height: '26', loading: 'eager' });
    img.addEventListener('error', () => { img.remove(); }, { once: true });
    logoMark.replaceChildren(img);
  }
}

/* ------------------------------------------------------------------ bannières */

function banner(id, tone, message, actions = []) {
  if (state.dismissedBanners.has(id)) return null;
  const node = h('div', { class: 'banner', dataset: { tone }, id: `banner-${id}` },
    icon(tone === 'danger' ? 'alert' : tone === 'warn' ? 'alert' : 'shield', 16),
    h('p', { text: message }),
    ...actions,
    h('button', {
      class: 'btn btn-quiet btn-sm', type: 'button', 'aria-label': 'Masquer ce message',
      onClick: () => { state.dismissedBanners.add(id); node.remove(); },
    }, icon('close', 14)));
  return node;
}

function renderBanners() {
  const host = document.getElementById('banner-stack');
  if (!host) return;
  const config = state.config;
  const nodes = [];
  if (state.offline) {
    nodes.push(banner('offline', 'danger', COPY.banners.offline, [
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => window.location.reload() }, COPY.actions.retry),
    ]));
  }
  if (config) {
    if (config.defaultPassword) {
      nodes.push(banner('password', 'warn', COPY.banners.defaultPassword, [
        h('a', { class: 'btn btn-ghost btn-sm', href: '/admin?tab=backups', 'data-link': '' }, 'Changer le mot de passe'),
      ]));
    }
    if (config.maintenanceMode) {
      nodes.push(banner('maintenance', 'info', COPY.banners.maintenance));
    }
    for (const [index, notice] of (config.notices || []).entries()) {
      nodes.push(banner(`notice-${index}-${notice.slice(0, 12)}`, 'info', notice));
    }
    if (config.totals?.hidden > 0) {
      nodes.push(banner('hidden', 'info', COPY.banners.hiddenChannels(config.totals.hidden), [
        h('button', {
          class: 'btn btn-quiet btn-sm', type: 'button',
          onClick: () => modal({
            title: 'Chaînes masquées',
            body: h('div', { class: 'prose' },
              h('p', { text: `${config.totals.catalog} chaînes au catalogue, ${config.totals.visible} visibles.` }),
              h('p', { text: config.totals.adultHidden
                ? `${config.totals.adultHidden} chaînes adultes sont masquées par défaut.`
                : 'Des chaînes sont masquées par une décision du propriétaire.' }),
              h('p', { class: 'muted', text: 'Les réglages se trouvent dans l’administration, onglet Réglages.' })),
            actions: [h('a', { class: 'btn btn-primary', href: '/admin?tab=settings', 'data-link': '' }, 'Ouvrir les réglages')],
          }),
        }, 'En savoir plus'),
      ]));
    }
  }
  host.replaceChildren(...nodes.filter(Boolean));
}

/* ------------------------------------------------------------------ vues */

function buildContext(route, container) {
  return {
    config: state.config,
    query: route.query,
    params: route.params,
    route,
    navigate: (to, options) => router.navigate(to, options),
    refreshConfig: async () => {
      try {
        const config = await loadConfig();
        applyBrand(config);
        renderBanners();
        syncHeader(config);
        return config;
      } catch (error) {
        handleApiFailure(error);
        return state.config;
      }
    },
    updateBrand: (settings) => {
      if (!state.config) return;
      state.config = { ...state.config, ...settings };
      applyBrand(state.config);
      renderBanners();
    },
    container,
    isOffline: () => state.offline,
    getPlayer,
    prefs,
  };
}

function clearCurrent() {
  const { container } = state;
  if (container) {
    const root = container.lastElementChild;
    if (root) {
      try { root.dispatchEvent(new CustomEvent('streamtv:leave', { bubbles: false })); } catch { /* ignore */ }
    }
    try { container.dispatchEvent(new CustomEvent('streamtv:leave')); } catch { /* ignore */ }
  }
  if (typeof state.cleanup === 'function') {
    try { state.cleanup(); } catch { /* un nettoyage ne doit jamais bloquer une navigation */ }
  }
  state.cleanup = null;
}

function setTitle(route) {
  const brand = state.config?.brand || 'StreamTV';
  const routeName = document.querySelector('#route-announcer');
  const label = route.name === 'channel' ? 'Fiche chaîne' : routeTitleFor(route);
  document.title = route.name === 'home' ? `${brand} · ${state.config?.tagline || 'Toute la télévision'}` : `${label} · ${brand}`;
  if (routeName) routeName.textContent = label;
}

function routeTitleFor(route) {
  const titles = {
    home: 'Catalogue', search: 'Recherche', guide: 'Guide', channel: 'Fiche chaîne',
    favorites: 'Favoris et historique', login: 'Connexion administration', admin: 'Administration',
    legal: 'Mentions légales', privacy: 'Confidentialité', report: 'Signaler un contenu',
    help: 'Aide et raccourcis', errors: 'Catalogue des messages', notFound: 'Page introuvable',
  };
  return titles[route.name] || 'StreamTV';
}

function markNav(route) {
  const map = { home: 'home', search: 'home', guide: 'guide', favorites: 'favorites', admin: 'admin', login: 'admin' };
  const active = map[route.name] || '';
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

async function renderRoute(route) {
  const main = $main();
  if (!main) return;
  const token = ++state.renderToken;

  clearCurrent();
  markNav(route);
  setTitle(route);
  state.route = route;

  if (state.offline && route.name !== 'errors') {
    const container = h('div', {});
    main.replaceChildren(container);
    state.container = container;
    state.cleanup = renderOffline(container, buildContext(route, container));
    return;
  }

  if (state.config?.maintenanceMode && route.name !== 'admin' && route.name !== 'login' && route.name !== 'help') {
    const container = h('div', {});
    main.replaceChildren(container);
    state.container = container;
    state.cleanup = maintenanceNotice(container);
    return;
  }

  // Conteneur neuf : une vue périmée écrit dans un nœud détaché, jamais dans l'écran courant.
  const container = h('div', { class: 'route-host' });
  main.replaceChildren(container);
  state.container = container;
  const ctx = buildContext(route, container);

  try {
    let cleanup = null;
    switch (route.name) {
      case 'home':
        cleanup = await renderHome(container, ctx);
        break;
      case 'search':
        cleanup = await renderHome(container, { ...ctx, query: { ...route.query, q: route.query.q || '' } });
        break;
      case 'guide':
        cleanup = await renderGuide(container, ctx);
        break;
      case 'channel':
        cleanup = await renderChannel(container, ctx, route.params.id);
        break;
      case 'favorites':
        cleanup = await renderFavorites(container, ctx);
        break;
      case 'login':
        cleanup = await renderLogin(container, ctx);
        break;
      case 'admin': {
        const { renderAdmin } = await loadAdmin();
        cleanup = await renderAdmin(container, ctx);
        break;
      }
      case 'legal':
      case 'privacy':
      case 'report':
      case 'help':
      case 'errors': {
        const views = await loadLegal();
        const render = {
          legal: views.renderLegal, privacy: views.renderPrivacy, report: views.renderReport,
          help: views.renderHelp, errors: views.renderErrors,
        }[route.name];
        cleanup = await render(container, ctx);
        break;
      }
      default:
        cleanup = renderNotFound(container, ctx);
    }
    if (token !== state.renderToken) {
      // Navigation plus récente : on jette le nettoyage de la vue périmée.
      return;
    }
    state.cleanup = typeof cleanup === 'function' ? cleanup : null;
    syncSearchInput(route);
  } catch (error) {
    if (token !== state.renderToken) return;
    handleApiFailure(error, container, route);
  }
}

function maintenanceNotice(container) {
  const view = h('div', { class: 'view page-error' },
    h('div', { class: 'error-shell' },
      h('div', { class: 'empty-icon' }, icon('settings', 26)),
      h('h1', {}, 'Maintenance en cours'),
      h('p', { class: 'muted' }, COPY.banners.maintenance),
      h('p', { class: 'muted' }, 'Le catalogue est momentanément fermé. Revenez dans quelques minutes.'),
      h('div', { class: 'error-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => renderRoute(state.route) }, icon('retry', 16), COPY.actions.retry),
        h('a', { class: 'btn btn-ghost', href: '/admin', 'data-link': '' }, COPY.actions.admin))));
  container.replaceChildren(view);
  return () => {};
}

function handleApiFailure(error, container = null, route = null) {
  if (error?.name === 'AbortError') return;
  const isAuth = error instanceof ApiError && (error.code === 'ERR-07' || error.status === 401);
  if (isAuth) {
    if (state.route?.name === 'admin') {
      toast(COPY.login.expired, { tone: 'error' });
      router.navigate('/connexion?next=/admin', { replace: true });
      return;
    }
    auth.clear();
  }
  if (navigator.onLine === false) {
    state.offline = true;
    renderBanners();
  }
  const host = container || $main();
  if (!host) return;
  const isNotFound = error instanceof ApiError && (error.status === 404 || error.code === 'ERR-10');
  const view = h('div', {});
  host.replaceChildren(view);
  if (isNotFound && route?.name === 'channel') {
    renderFailure(view, buildContext(route, view), error, { onRetry: () => router.navigate('/guide') });
    return;
  }
  renderFailure(view, buildContext(route || state.route, view), error, {
    onRetry: () => renderRoute(state.route),
  });
}

/* ------------------------------------------------------------------ en-tête */

function syncSearchInput(route) {
  const input = document.getElementById('search-input');
  if (!input) return;
  const q = route?.query?.q || '';
  if (input.value !== q) input.value = q;
  toggleClear();
}

function toggleClear() {
  const input = document.getElementById('search-input');
  const clear = document.getElementById('search-clear');
  if (input && clear) clear.hidden = !input.value;
}

function syncHeader(config) {
  const input = document.getElementById('search-input');
  if (input && config) {
    input.setAttribute('placeholder', `Rechercher parmi ${config.totals?.visible ?? 0} chaînes, un pays, une catégorie…`);
  }
  const adminLink = document.querySelector('[data-nav="admin"]');
  if (adminLink) {
    const signed = auth.isSignedIn();
    adminLink.textContent = signed ? 'Administration' : 'Administration';
    adminLink.setAttribute('aria-label', signed ? 'Administration, session ouverte' : 'Administration, connexion requise');
  }
}

function wireHeader() {
  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  const clear = document.getElementById('search-clear');

  if (form && input) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const q = input.value.trim();
      const base = state.route?.name === 'guide' ? '/guide' : '/';
      if (!q) { router.navigate(base); return; }
      if (base === '/guide') router.navigate(`/guide?q=${encodeURIComponent(q)}`);
      else router.navigate(`/?q=${encodeURIComponent(q)}`);
      window.dispatchEvent(new CustomEvent('streamtv:search', { detail: { q } }));
    });
    input.addEventListener('input', debounce(() => {
      toggleClear();
      if (state.route?.name === 'home' || state.route?.name === 'search') {
        window.dispatchEvent(new CustomEvent('streamtv:search', { detail: { q: input.value.trim() } }));
      }
    }, 320));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        input.value = '';
        toggleClear();
        input.blur();
        if (state.route?.name === 'home' || state.route?.name === 'search') router.navigate('/');
      }
    });
  }
  if (clear && input) {
    clear.addEventListener('click', () => {
      input.value = '';
      toggleClear();
      input.focus();
      if (state.route?.name === 'home' || state.route?.name === 'search') router.navigate('/');
    });
  }

  const shortcuts = document.getElementById('shortcuts-btn');
  if (shortcuts) shortcuts.addEventListener('click', openShortcuts);
  const favoriteShortcut = document.getElementById('fav-shortcut');
  if (favoriteShortcut) favoriteShortcut.addEventListener('click', () => router.navigate('/favoris'));
}

function openShortcuts() {
  const rows = COPY.player.shortcuts.map(([keys, label]) => h('div', { class: 'variant' },
    h('kbd', { class: 'kbd' }, keys), h('span', {}, label)));
  modal({
    title: 'Raccourcis clavier',
    body: h('div', {},
      h('div', { class: 'rows' }, rows),
      h('p', { class: 'muted', style: { marginTop: '12px' } },
        'Les raccourcis sont désactivés pendant la saisie dans un champ de texte.'),
      h('div', { class: 'rows', style: { marginTop: '12px' } },
        h('div', { class: 'variant' }, h('kbd', { class: 'kbd' }, '/'), h('span', {}, 'Aller à la recherche')),
        h('div', { class: 'variant' }, h('kbd', { class: 'kbd' }, '?'), h('span', {}, 'Afficher cette aide')))),
    actions: [h('a', { class: 'btn btn-ghost', href: '/aide', 'data-link': '' }, 'Aide complète')],
  });
}

/**
 * Un raccourci global ne doit jamais voler une frappe (BUG-03).
 * Champs de formulaire, zones éditables et lecteurs de contenu sont tous couverts.
 */
const isEditingField = (target) => {
  if (!target || typeof target.tagName !== 'string') return false;
  const tag = target.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') return true;
  if (target.isContentEditable === true || target.getAttribute?.('contenteditable') === 'true') return true;
  return Boolean(target.closest?.('[contenteditable="true"], [role="textbox"]'));
};

function wireKeyboard() {
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape') {
      const backdrop = document.querySelector('.modal-backdrop');
      if (backdrop) return; // la modale gère elle-même Échap
      const player = document.getElementById('player-root');
      if (player && player.childElementCount) return; // le lecteur gère Échap
      return;
    }
    if (isEditingField(event.target)) return;
    if (event.key === '/') {
      const input = document.getElementById('search-input');
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
      return;
    }
    if (event.key === '?') {
      event.preventDefault();
      openShortcuts();
    }
  });
}

/* ------------------------------------------------------------------ hors ligne */

function wireNetwork() {
  window.addEventListener('online', async () => {
    state.offline = false;
    renderBanners();
    toast('Connexion rétablie.', { tone: 'success', duration: 3000 });
    try {
      const config = await loadConfig();
      applyBrand(config);
      syncHeader(config);
      renderBanners();
      if (state.route) renderRoute(state.route);
    } catch { /* nouvel essai à la prochaine navigation */ }
  });
  window.addEventListener('offline', () => {
    state.offline = true;
    renderBanners();
    toast(COPY.states.offline.title, { tone: 'error', duration: 8000 });
  });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !state.config) return;
    const age = Date.now() - state.configAt;
    if (age < 60_000 || !navigator.onLine) return;
    try {
      const config = await loadConfig();
      applyBrand(config);
      renderBanners();
    } catch { /* on garde la configuration en mémoire */ }
  });
}

function wireAuthEvents() {
  window.addEventListener('auth:expired', () => {
    if (state.route?.name === 'admin') {
      toast(COPY.login.expired, { tone: 'error', duration: 6000 });
      router.navigate('/connexion?next=/admin', { replace: true });
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    if (error instanceof ApiError) {
      handleApiFailure(error);
      event.preventDefault();
      return;
    }
    toast('Une action n’a pas abouti. Réessayez.', { tone: 'error' });
  });
}

/* ------------------------------------------------------------------ démarrage */

async function boot() {
  const main = $main();
  if (main) {
    main.replaceChildren(spinner('Chargement du catalogue…'));
  }
  try {
    const config = await loadConfig();
    applyBrand(config);
    syncHeader(config);
    state.booted = true;
  } catch (error) {
    const container = h('div', {});
    if (main) main.replaceChildren(container);
    renderFailure(container, { navigate: (to) => router.navigate(to) }, error, { onRetry: () => boot() });
    if (navigator.onLine === false) {
      state.offline = true;
      renderBanners();
    }
    return false;
  }
  renderBanners();
  return true;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Une nouvelle version est prête. Rechargez pour en profiter.', {
            tone: 'info', duration: 12_000, actionLabel: 'Recharger',
            onAction: () => window.location.reload(),
          });
        }
      });
    });
  } catch {
    // Le site fonctionne sans service worker : aucune action utilisateur requise.
  }
}

const router = createRouter({
  render: renderRoute,
  announce: (route) => {
    const live = document.getElementById('route-announcer');
    if (live) live.textContent = `${routeTitleFor(route)} — page chargée`;
  },
});

async function main() {
  wireHeader();
  wireKeyboard();
  wireNetwork();
  wireAuthEvents();
  const ready = await boot();
  if (ready) router.start();
  document.getElementById('boot-screen')?.remove();
  document.documentElement.classList.remove('is-booting');
  document.documentElement.classList.add('is-ready');
  registerServiceWorker();

  window.__streamtv = {
    version: state.config?.version || '',
    get config() { return state.config; },
    navigate: (to) => router.navigate(to),
    refresh: () => router.refresh(),
    player: () => getPlayer(),
    state,
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}
