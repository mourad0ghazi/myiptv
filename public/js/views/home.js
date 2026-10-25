// public/js/views/home.js — écran 1 : accueil et catalogue paginé.
// ≤ 60 chaînes par réponse, ≤ 120 cartes dans le DOM, squelettes pendant le chargement.

import { api } from '../api.js';
import { COPY } from '../copy.js';
import { h, icon, fmtNumber, skeletonGrid, emptyState, spinner, modal, logoNode, toast } from '../ui.js';
import { channelCard, categoryChips, hiddenNotice } from '../components.js';
import { getPlayer } from '../player.js';
import { prefs } from '../prefs.js';

function heroBlock(hero, { config, openChannel, openPlayer }) {
  const featured = hero.channels?.[0];
  if (!featured) {
    return h('section', { class: 'hero' },
      h('div', { class: 'hero-pattern', 'aria-hidden': 'true' }),
      h('div', { class: 'hero-body' },
        h('div', { class: 'hero-logo' }, h('span', { class: 'hero-initial', text: 'ST' })),
        h('div', { class: 'hero-text' },
          h('p', { class: 'eyebrow' }, 'Bienvenue'),
          h('h1', { text: config.brand }),
          h('p', { text: config.tagline }),
          h('div', { class: 'hero-actions' },
            h('a', { class: 'btn btn-primary', href: '/guide', 'data-link': '' }, icon('list', 16), 'Parcourir le guide'),
            h('a', { class: 'btn btn-ghost', href: '/admin', 'data-link': '' }, icon('settings', 16), 'Gérer le catalogue')))));
  }
  const rail = (hero.channels || []).slice(1, 6);
  return h('section', { class: 'hero', 'aria-label': 'Chaîne mise en avant' },
    h('div', { class: 'hero-pattern', 'aria-hidden': 'true' }),
    h('div', { class: 'hero-body' },
      h('div', { class: 'hero-logo' }, logoNode(featured)),
      h('div', { class: 'hero-text' },
        h('p', { class: 'eyebrow' }, hero.mode === 'featured' ? 'En vedette' : 'À découvrir'),
        h('h1', { text: featured.name, dir: 'auto' }),
        h('p', { text: `${featured.categoryLabel} · Chaîne ${featured.number}${featured.country ? ` · ${featured.country}` : ''}${featured.quality !== 'AUTO' ? ` · ${featured.quality}` : ''}` }),
        h('div', { class: 'hero-meta' },
          h('span', { class: 'badge', dataset: { tone: 'accent' } }, icon('sparkles', 13), config.maintenanceMode ? 'Catalogue en maintenance' : 'Disponible maintenant'),
          featured.blocked ? h('span', { class: 'badge', dataset: { tone: 'danger' } }, icon('lock', 13), 'Lecture limitée') : null),
        h('div', { class: 'hero-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPlayer(featured) }, icon('play', 16), COPY.actions.watch),
          h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openChannel(featured.id) }, 'Voir la fiche')))),
    rail.length ? h('div', { class: 'hero-rail', 'aria-label': 'Autres suggestions' },
      rail.map((channel) => h('button', {
        class: 'hero-mini', type: 'button', onClick: () => openChannel(channel.id),
        'aria-label': `Ouvrir ${channel.name}`,
      }, logoNode(channel), channel.name))) : null);
}

function pager(page, pages, total, onChange) {
  if (pages <= 1) {
    return h('p', { class: 'count-label', style: { textAlign: 'center', marginTop: '24px' } },
      `${fmtNumber(total)} chaîne${total > 1 ? 's' : ''}`);
  }
  const windowed = new Set([1, pages, page, page - 1, page + 1, page - 2, page + 2]);
  const numbers = [...windowed].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const items = [];
  let previous = 0;
  for (const number of numbers) {
    if (previous && number - previous > 1) items.push(h('span', { class: 'muted' }, '…'));
    items.push(h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(number === page),
      'aria-label': `Page ${number}`, onClick: () => onChange(number),
    }, String(number)));
    previous = number;
  }
  return h('nav', { class: 'toolbar', style: { justifyContent: 'center', marginTop: '32px', gap: '8px' }, 'aria-label': 'Pagination du catalogue' },
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: page <= 1, onClick: () => onChange(page - 1) },
      icon('chevron', 15, 'style="transform:rotate(180deg)"'), 'Précédent'),
    ...items,
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: page >= pages, onClick: () => onChange(page + 1) },
      'Suivant', icon('chevron', 15)),
    h('span', { class: 'count-label', style: { marginLeft: '12px' } },
      `Page ${page} sur ${pages} · ${fmtNumber(total)} chaînes`));
}

export async function renderHome(container, ctx) {
  const { config, query, navigate } = ctx;
  const state = {
    q: (query.q || '').trim(),
    cat: query.cat || '',
    sort: query.sort || config.defaultSort || 'number',
    page: Math.max(1, Number(query.p) || 1),
  };
  const openPlayer = (channel) => {
    const queue = [...container.querySelectorAll('[data-channel-id]')].map((el) => el.dataset.channelId);
    getPlayer().open(channel, { queue: queue.length ? queue : [channel.id] });
  };
  const openChannel = (id) => navigate(`/chaine/${id}`);

  const setParam = (patch, { resetPage = true } = {}) => {
    const next = { ...state, ...patch };
    if (resetPage) next.page = 1;
    const params = new URLSearchParams();
    if (next.q) params.set('q', next.q);
    if (next.cat) params.set('cat', next.cat);
    if (next.sort && next.sort !== config.defaultSort) params.set('sort', next.sort);
    if (next.page > 1) params.set('p', String(next.page));
    const search = params.toString();
    navigate(`/${search ? `?${search}` : ''}`, { replace: false, keepScroll: false });
  };

  const view = h('div', { class: 'view' });
  container.replaceChildren(view);

  const showHero = !state.q && !state.cat && state.page === 1;
  if (showHero && config.hero) {
    view.append(heroBlock(config.hero, { config, openChannel, openPlayer }));
  }

  const resultsHost = h('div', {});
  const headerHost = h('div', {});

  if (!state.q) {
    headerHost.append(
      h('div', { class: 'section-head' }, h('div', {},
        h('p', { class: 'eyebrow' }, 'Le catalogue'),
        h('h2', {}, state.cat
          ? (config.categories.find((c) => c.id === state.cat)?.label || 'Catégorie')
          : 'Toutes les chaînes'))),
      categoryChips(config.categories, state.cat, (cat) => setParam({ cat })));
  } else {
    headerHost.append(h('div', { class: 'section-head' }, h('div', {},
      h('p', { class: 'eyebrow' }, 'Recherche'),
      h('h2', { dir: 'auto' }, `Résultats pour « ${state.q} »`))));
  }
  view.append(headerHost);

  const toolbar = h('div', { class: 'toolbar' },
    h('span', { class: 'count-label', id: 'result-count', 'aria-live': 'polite' }, 'Recherche en cours…'),
    hiddenNotice(config.totals.hidden, () => modal({
      title: COPY.banners.hiddenChannels(config.totals.hidden),
      body: h('div', { class: 'prose' },
        h('p', { text: `${fmtNumber(config.totals.catalog)} chaînes sont dans le catalogue, ${fmtNumber(config.totals.visible)} sont visibles ici.` }),
        h('p', { text: config.totals.adultHidden
          ? `${fmtNumber(config.totals.adultHidden)} chaînes de catégorie adulte sont masquées par défaut (réglage « autoHideAdult »).`
          : 'Certaines chaînes sont masquées par une décision du propriétaire.' }),
        h('p', { class: 'muted', text: 'Vous pouvez les afficher depuis l’administration, onglet Réglages.' })),
      actions: [h('a', { class: 'btn btn-primary', href: '/admin', 'data-link': '' }, 'Ouvrir les réglages')],
    })),
    h('span', { class: 'spacer' }),
    h('label', { class: 'visually-hidden', for: 'sort-select' }, 'Trier les chaînes'),
    h('select', {
      class: 'select', id: 'sort-select', value: state.sort,
      onChange: (event) => setParam({ sort: event.target.value }),
    },
    [['number', 'Numéro'], ['name', 'Nom'], ['category', 'Catégorie'], ['recent', 'Ajout récent'], ['confidence', 'Confiance']]
      .map(([value, label]) => h('option', { value, selected: value === state.sort }, label))));
  view.append(toolbar);
  view.append(resultsHost);

  let data = null;
  const load = async () => {
    resultsHost.replaceChildren(skeletonGrid(12));
    try {
      const params = new URLSearchParams({
        page: String(state.page), pageSize: String(config.pageSize || 48), sort: state.sort,
      });
      if (state.cat) params.set('category', state.cat);
      let payload;
      if (state.q) {
        params.set('q', state.q);
        payload = await api(`/api/channels/search?${params}`);
        prefs.pushSearch(state.q);
      } else {
        payload = await api(`/api/channels?${params}`);
      }
      data = payload;
      renderResults(payload);
    } catch (error) {
      resultsHost.replaceChildren(emptyState({
        iconName: 'wifiOff',
        title: COPY.states.error.title,
        message: error.message || COPY.states.error.message,
        actionLabel: COPY.actions.retry,
        onAction: load,
      }));
    }
  };

  const renderResults = (payload) => {
    const count = container.querySelector('#result-count');
    if (count) {
      count.textContent = payload.total
        ? `${fmtNumber(payload.total)} chaîne${payload.total > 1 ? 's' : ''}`
        : 'Aucun résultat';
    }
    if (!payload.channels.length) {
      if (state.q) {
        resultsHost.replaceChildren(emptyState({
          iconName: 'search',
          title: COPY.states.searchEmpty.title,
          message: `Aucune chaîne ne correspond à « ${state.q} ». Essayez un autre mot ou effacez les filtres.`,
          actionLabel: 'Effacer la recherche',
          onAction: () => { document.getElementById('search-input').value = ''; setParam({ q: '' }); },
        }));
        if (payload.meta?.suggestions?.length) {
          resultsHost.append(h('div', { style: { textAlign: 'center', marginTop: '16px' } },
            h('p', { class: 'muted' }, 'Peut-être cherchiez-vous :'),
            h('div', { class: 'chips', style: { justifyContent: 'center' } },
              payload.meta.suggestions.map((word) => h('button', {
                class: 'chip', type: 'button', onClick: () => setParam({ q: word }),
              }, word)))));
        }
      } else if (state.cat) {
        resultsHost.replaceChildren(emptyState({
          iconName: 'grid',
          title: COPY.states.categoryEmpty.title,
          message: COPY.states.categoryEmpty.message,
          actionLabel: COPY.states.categoryEmpty.action,
          onAction: () => setParam({ cat: '' }),
        }));
      } else {
        resultsHost.replaceChildren(emptyState({
          iconName: 'tv',
          title: COPY.states.emptyCatalog.title,
          message: COPY.states.emptyCatalog.message,
          actionLabel: COPY.states.emptyCatalog.action,
          onAction: () => navigate('/admin'),
        }));
      }
      return;
    }

    const grid = h('div', { class: 'grid', id: 'catalog-grid' },
      payload.channels.map((channel) => {
        const card = channelCard(channel, { onOpen: () => openChannel(channel.id), onPlay: openPlayer, showHealth: config.showHealthBadge });
        card.dataset.channelId = channel.id;
        return card;
      }));
    resultsHost.replaceChildren(grid, pager(payload.page, payload.pages, payload.total, (page) => setParam({ page }, { resetPage: false })));

    if (payload.total > payload.channels.length) {
      resultsHost.append(h('p', { class: 'count-label', style: { textAlign: 'center', marginTop: '12px' } },
        `Affichage de ${payload.channels.length} chaînes sur ${fmtNumber(payload.total)}. Utilisez la recherche pour aller plus vite.`));
    }
  };

  await load();

  // Synchronisation avec la barre de recherche de l'en-tête.
  const input = document.getElementById('search-input');
  if (input) input.value = state.q;
  const onSearch = (event) => {
    const value = event.detail?.q ?? '';
    setParam({ q: value });
  };
  window.addEventListener('streamtv:search', onSearch);
  view.addEventListener('streamtv:leave', () => window.removeEventListener('streamtv:search', onSearch));
  return () => window.removeEventListener('streamtv:search', onSearch);
}
