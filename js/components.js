// public/js/components.js — composants partagés : carte, pastilles, en-tête de section.

import { h, icon, logoNode, healthLabel } from './ui.js';
import { prefs } from './prefs.js';
import { COPY } from './copy.js';

export function channelCard(channel, { onOpen, onPlay, showHealth = true } = {}) {
  const fav = prefs.isFavorite(channel.id);
  const play = h('button', {
    class: 'card-play', type: 'button', tabIndex: -1,
    'aria-label': `Regarder ${channel.name}`,
    onClick: (event) => { event.stopPropagation(); onPlay?.(channel); },
  }, h('span', {}, icon('play', 20)));

  const favBtn = h('button', {
    class: 'card-fav', type: 'button',
    'aria-label': fav ? COPY.actions.removeFavorite : COPY.actions.addFavorite,
    'aria-pressed': String(fav),
    onClick: (event) => {
      event.stopPropagation();
      const added = prefs.toggleFavorite(channel);
      favBtn.setAttribute('aria-pressed', String(added));
      favBtn.setAttribute('aria-label', added ? COPY.actions.removeFavorite : COPY.actions.addFavorite);
      favBtn.replaceChildren(icon('star', 15, added ? 'fill="currentColor"' : ''));
    },
  }, icon('star', 15, fav ? 'fill="currentColor"' : ''));

  const flags = [];
  if (channel.blocked) {
    flags.push(h('span', { class: 'badge card-flag', dataset: { tone: 'danger' }, title: 'Cette chaîne ne peut pas être lue sur ce site' },
      icon('lock', 12), channel.blocked === 'mixed-content' ? 'HTTP' : 'Bloquée'));
  }
  if (channel.featured) {
    flags.push(h('span', { class: 'badge card-flag', dataset: { tone: 'accent' }, style: { left: channel.blocked ? '78px' : '8px' } },
      icon('star4', 12), 'Vedette'));
  }

  // Contrat §7.3 : <article role="button" tabindex="0" aria-label="{nom}, {catégorie}, chaîne {numéro}">.
  // Les commandes internes gardent leurs propres libellés et stoppent la propagation.
  const card = h('article', {
    class: 'card', role: 'button', 'aria-label': `${channel.name}, ${channel.categoryLabel || 'catégorie inconnue'}, chaîne ${channel.number}`,
    tabIndex: 0,
    dataset: { blocked: channel.blocked || '' },
    style: { '--hue': String(channel.hue ?? 320) },
    onKeydown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen?.(channel); }
    },
    onClick: () => onOpen?.(channel),
  },
  h('div', { class: 'card-media' }, logoNode(channel), play, favBtn, ...flags),
  h('div', { class: 'card-body' },
    h('span', { class: 'card-num' },
      showHealth ? h('span', { class: 'health-dot', dataset: { state: channel.health || 'unknown' }, title: healthLabel(channel.health), 'aria-hidden': 'true' }) : null,
      `#${channel.number}`,
      channel.quality && channel.quality !== 'AUTO' ? h('span', { class: 'badge', style: { padding: '1px 6px', fontSize: 'var(--fs-xs)' } }, channel.quality) : null),
    h('span', { class: 'card-name', dir: 'auto', text: channel.name }),
    h('span', { class: 'card-sub', dir: 'auto', text: `${channel.categoryLabel || 'Non classée'}${channel.country ? ` · ${channel.country}` : ''}` })));
  return card;
}

export function categoryChips(categories, active, onSelect) {
  const total = categories.reduce((sum, c) => sum + (c.count || 0), 0);
  const chips = [h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(!active),
    onClick: () => onSelect(''),
  }, 'Tout', h('span', { class: 'chip-count' }, String(total)))];
  for (const category of categories) {
    chips.push(h('button', {
      class: 'chip', type: 'button',
      'aria-pressed': String(active === category.id),
      disabled: !category.count,
      title: category.count ? `${category.count} chaînes` : 'Aucune chaîne dans cette catégorie',
      onClick: () => onSelect(category.id),
    }, category.label, h('span', { class: 'chip-count' }, String(category.count || 0))));
  }
  return h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrer par catégorie' }, chips);
}

export function sectionHead(eyebrow, title, extra = null) {
  return h('div', { class: 'section-head' },
    h('div', {}, eyebrow ? h('p', { class: 'eyebrow', text: eyebrow }) : null, h('h2', { text: title })),
    extra);
}

export function hiddenNotice(hidden, onExplain) {
  if (!hidden) return null;
  return h('button', { class: 'chip', type: 'button', onClick: onExplain, title: 'Pourquoi ce nombre diffère du catalogue complet' },
    icon('lock', 13), COPY.banners.hiddenChannels(hidden));
}

export function statCard(label, value, hint = '', tone = '') {
  return h('div', { class: 'stat', dataset: tone ? { tone } : {} },
    h('p', { class: 'stat-label', text: label }),
    h('p', { class: 'stat-value', text: value }),
    hint ? h('p', { class: 'stat-hint', text: hint }) : null);
}
