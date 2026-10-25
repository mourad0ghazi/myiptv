// public/js/views/guide.js — écran 2 : guide de zapping, liste dense + filtres par catégorie.
// ≤ 60 lignes par page, jamais plus de 120 nœuds de chaîne dans le DOM.

import { api } from '../api.js';
import { COPY } from '../copy.js';
import {
  h, icon, fmtNumber, skeletonGrid, emptyState, logoNode, healthLabel, toast, debounce,
} from '../ui.js';
import { getPlayer } from '../player.js';
import { prefs } from '../prefs.js';

const ROWS_PER_PAGE = 60;

function guideRow(channel, { onPlay, onOpen }) {
  const row = h('div', { class: 'guide-row', dataset: { channelId: channel.id } },
    h('span', { class: 'guide-num tabular', text: String(channel.number).padStart(3, '0') }),
    h('span', { class: 'guide-logo' }, logoNode(channel, 34)),
    h('span', { class: 'guide-name', dir: 'auto' },
      h('span', { text: channel.name }),
      h('span', { class: 'card-sub' },
        channel.categoryLabel,
        channel.country ? ` · ${channel.country}` : '',
        channel.quality !== 'AUTO' ? ` · ${channel.quality}` : '')),
    h('span', { class: 'card-sub' },
      h('span', { class: 'health-dot', dataset: { state: channel.health }, 'aria-hidden': 'true' }),
      ` ${healthLabel(channel.health)}`),
    h('button', {
      class: 'btn btn-primary btn-sm', type: 'button', 'aria-label': `Regarder ${channel.name}`,
      onClick: (event) => { event.stopPropagation(); onPlay(channel); },
    }, icon('play', 14), COPY.actions.watch),
    h('button', {
      class: 'btn btn-quiet btn-sm', type: 'button', 'aria-label': `Fiche de ${channel.name}`,
      onClick: (event) => { event.stopPropagation(); onOpen(channel.id); },
    }, icon('chevron', 15)));
  row.addEventListener('click', () => onPlay(channel));
  row.tabIndex = 0;
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPlay(channel); }
  });
  return row;
}

export async function renderGuide(container, ctx) {
  const { config, query, navigate } = ctx;
  const state = { page: 1, cat: query.cat || '', q: (query.q || '').trim() };
  const view = h('div', { class: 'view' });

  const player = () => getPlayer();
  const openPlayer = (channel) => {
    const ids = [...container.querySelectorAll('[data-channel-id]')].map((node) => node.dataset.channelId);
    player().open(channel, { queue: ids.length ? ids : [channel.id] });
    prefs.pushHistory(channel);
  };
  const openChannel = (id) => navigate(`/chaine/${id}`);

  // Télécommande numérique : un numéro, une chaîne.
  const jumpInput = h('input', {
    type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '5',
    'aria-label': 'Aller à un numéro de chaîne', placeholder: 'N°', class: 'jump-input',
  });
  const jump = async () => {
    const value = jumpInput.value.trim();
    if (!/^\d{1,5}$/.test(value)) {
      toast('Saisissez un numéro de chaîne, par exemple 42.', { tone: 'error' });
      jumpInput.focus();
      return;
    }
    try {
      const payload = await api(`/api/channels/search?q=${encodeURIComponent(value)}&pageSize=60`);
      const match = payload.channels.find((channel) => channel.number === Number(value));
      if (!match) {
        toast(`Aucune chaîne ne porte le numéro ${value}.`, { tone: 'error' });
        return;
      }
      const full = await api(`/api/channels/${match.id}`);
      openPlayer(full.channel);
    } catch (error) {
      toast(error.message, { tone: 'error' });
    }
  };
  jumpInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); jump(); }
  });
  const jumpBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: jump }, 'Aller');

  const sidebar = h('aside', { class: 'guide-side', 'aria-label': 'Catégories du guide' });
  const listHost = h('div', { class: 'guide-list', id: 'guide-list' });
  const count = h('span', { class: 'count-label', 'aria-live': 'polite' });

  view.append(
    h('div', { class: 'section-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Zapping'),
        h('h1', { style: { fontSize: '30px' } }, 'Le guide')),
      h('div', { class: 'toolbar', style: { margin: 0 } },
        h('label', { class: 'visually-hidden', for: 'jump-input' }, 'Aller à un numéro de chaîne'),
        h('div', { class: 'jump', id: 'jump' }, jumpInput, jumpBtn))),
    h('div', { class: 'guide-wrap' }, sidebar, h('div', {}, h('div', { class: 'toolbar' }, count), listHost)));

  container.replaceChildren(view);

  const renderSidebar = () => {
    const total = config.categories.reduce((sum, category) => sum + category.count, 0);
    sidebar.replaceChildren(
      h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(!state.cat),
        onClick: () => { state.cat = ''; state.page = 1; renderSidebar(); load(); },
      }, 'Tout', h('span', { class: 'chip-count' }, fmtNumber(total))),
      ...config.categories.filter((category) => category.count > 0).map((category) => h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(state.cat === category.id),
        onClick: () => { state.cat = category.id; state.page = 1; renderSidebar(); load(); },
      }, category.short, h('span', { class: 'chip-count' }, fmtNumber(category.count)))));
  };

  let lastPayload = null;
  const load = async () => {
    listHost.replaceChildren(skeletonGrid(8));
    try {
      const params = new URLSearchParams({ page: String(state.page), pageSize: String(ROWS_PER_PAGE) });
      if (state.cat) params.set('category', state.cat);
      if (state.q) params.set('q', state.q);
      const payload = await api(`/api/channels?${params}`);
      lastPayload = payload;
      count.textContent = payload.total
        ? `${fmtNumber(payload.total)} chaînes · page ${payload.page} sur ${payload.pages}`
        : 'Aucune chaîne';
      if (!payload.channels.length) {
        listHost.replaceChildren(emptyState({
          iconName: 'list',
          title: COPY.states.categoryEmpty.title,
          message: COPY.states.categoryEmpty.message,
          actionLabel: COPY.states.categoryEmpty.action,
          onAction: () => { state.cat = ''; state.q = ''; state.page = 1; renderSidebar(); load(); },
        }));
        return;
      }
      const rows = h('div', { class: 'rows' },
        payload.channels.map((channel) => guideRow(channel, { onPlay: openPlayer, onOpen: openChannel })));
      const pager = h('div', { class: 'toolbar', style: { justifyContent: 'center', marginTop: '16px' } },
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', disabled: payload.page <= 1,
          onClick: () => { state.page -= 1; load(); },
        }, icon('chevron', 15, 'style="transform:rotate(180deg)"'), 'Précédent'),
        h('span', { class: 'count-label' }, `Page ${payload.page} sur ${payload.pages}`),
        h('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', disabled: !payload.hasMore,
          onClick: () => { state.page += 1; load(); },
        }, 'Suivant', icon('chevron', 15)));
      listHost.replaceChildren(rows, pager);
    } catch (error) {
      listHost.replaceChildren(emptyState({
        iconName: 'wifiOff',
        title: COPY.states.error.title,
        message: error.message || COPY.states.error.message,
        actionLabel: COPY.actions.retry,
        onAction: load,
      }));
    }
  };

  // Recherche depuis l'en-tête : filtre le guide sans quitter l'écran.
  const onSearch = debounce((event) => {
    state.q = event.detail?.q || '';
    state.page = 1;
    load();
  }, 260);
  window.addEventListener('streamtv:search', onSearch);
  view.addEventListener('streamtv:leave', () => window.removeEventListener('streamtv:search', onSearch));

  renderSidebar();
  await load();
  return () => window.removeEventListener('streamtv:search', onSearch);
}
