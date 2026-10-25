// public/js/views/admin.js — écran 7 : console d'administration, sept onglets.
// La coquille ne rend que les compteurs et les onglets ; chaque onglet vit dans views/admin/.

import { Admin, auth } from '../api.js';
import { COPY } from '../copy.js';
import { h, icon, fmtNumber, spinner, emptyState } from '../ui.js';
import { statCard } from '../components.js';

import { renderCatalogue } from './admin/catalogue.js';
import { renderImport } from './admin/import.js';
import { renderSettings } from './admin/settings.js';
import { renderHealth } from './admin/health.js';
import { renderBackups } from './admin/backups.js';
import { renderLiens } from './admin/liens.js';
import { renderSignalements } from './admin/signalements.js';

const TABS = [
  ['catalogue', 'Catalogue'],
  ['liens', 'Chaînes et liens'],
  ['signalements', 'Signalements'],
  ['import', 'Importation'],
  ['reglages', 'Réglages'],
  ['sante', 'Santé'],
  ['sauvegardes', 'Sauvegardes'],
];

export async function renderAdmin(container, ctx) {
  const view = h('div', { class: 'view' });
  container.replaceChildren(view);

  if (!auth.token()) {
    view.append(h('div', { class: 'login-shell' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('lock', 24)),
      h('h1', {}, 'Administration verrouillée'),
      h('p', { class: 'muted' }, 'Connectez-vous pour gérer le catalogue, les réglages et les sauvegardes.'),
      h('a', { class: 'btn btn-primary btn-block', href: '/connexion?next=/admin', 'data-link': '' }, icon('lock', 16), COPY.actions.signIn),
      h('a', { class: 'btn btn-quiet btn-sm', href: '/', 'data-link': '' }, 'Revenir au catalogue')));
    return () => {};
  }

  let stats = null;
  try {
    stats = await Admin.stats();
  } catch (error) {
    if (apiGuard(ctx, error, { silent: true })) return () => {};
    view.replaceChildren(emptyState({
      iconName: 'wifiOff',
      title: 'La console n’a pas répondu',
      message: error.message || 'Réessayez dans un instant.',
      actionLabel: COPY.actions.retry,
      onAction: () => renderAdmin(container, ctx),
    }));
    return () => {};
  }

  const state = {
    tab: TABS.some(([id]) => id === ctx.query.onglet) ? ctx.query.onglet : 'catalogue',
    page: 1,
    q: '',
    category: '',
    visibility: 'all',
    selection: new Set(),
    preview: null,
    probe: null,
  };

  const panel = h('div', { class: 'admin-panel' });
  const tabsBar = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Onglets de l’administration' });
  const kpis = h('div', { class: 'stat-grid' });

  const refreshStats = async () => {
    try {
      stats = await Admin.stats();
      renderKpis();
    } catch (error) {
      apiGuard(ctx, error, { silent: true });
    }
  };

  const renderKpis = () => {
    kpis.replaceChildren(
      statCard('Chaînes actives', fmtNumber(stats.active), `${fmtNumber(stats.visible)} visibles`, 'ok'),
      statCard('Masquées', fmtNumber(stats.hidden), `${fmtNumber(stats.deleted)} supprimées`, stats.hidden ? 'warn' : ''),
      statCard('Disponibles', fmtNumber(stats.health.up), `${fmtNumber(stats.health.unknown)} non testées`),
      statCard('Confiance', `${Math.round((stats.confidence.average || 0) * 100)} %`, `seuil ${Math.round(stats.confidence.floor * 100)} %`),
      statCard('Moteur', `${fmtNumber(stats.confidence.engine.vitesse)} ch/s`, `accord ${Math.round(stats.confidence.engine.accordGenre * 100)} %`),
      statCard('Mémoire disque', `${(stats.storage.sizeTotal / 1024 / 1024).toFixed(1)} Mo`, 'JSON atomique'));
  };

  const renderTabs = () => {
    tabsBar.replaceChildren(...TABS.map(([id, label]) => h('button', {
      class: 'tab', type: 'button', role: 'tab', id: `tab-${id}`, 'aria-selected': String(state.tab === id),
      'aria-controls': 'admin-panel',
      onClick: () => {
        state.tab = id;
        history.replaceState(history.state, '', `/admin?onglet=${id}`);
        renderTabs();
        renderPanel();
      },
    }, label)));
  };

  const renderPanel = async () => {
    panel.setAttribute('aria-labelledby', `tab-${state.tab}`);
    panel.replaceChildren(spinner('Chargement…'));
    try {
      if (state.tab === 'catalogue') await renderCatalogue(panel, ctx, state, { refreshStats, stats: () => stats });
      else if (state.tab === 'liens') await renderLiens(panel, ctx, state, { stats: () => stats });
      else if (state.tab === 'signalements') await renderSignalements(panel, ctx, state, { stats: () => stats });
      else if (state.tab === 'import') await renderImport(panel, ctx, state, { refreshStats });
      else if (state.tab === 'reglages') await renderSettings(panel, ctx, { refreshStats });
      else if (state.tab === 'sante') await renderHealth(panel, ctx, state, { refreshStats, stats: () => stats });
      else await renderBackups(panel, ctx, { refreshStats, stats: () => stats });
    } catch (error) {
      if (apiGuard(ctx, error, { silent: true })) return;
      panel.replaceChildren(emptyState({
        iconName: 'wifiOff',
        title: 'Cet onglet n’a pas pu se charger',
        message: error.message || 'Réessayez.',
        actionLabel: COPY.actions.retry,
        onAction: renderPanel,
      }));
    }
  };

  view.append(
    h('div', { class: 'admin-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Console'),
        h('h1', { style: { fontSize: 'clamp(26px,3.4vw,34px)' } }, 'Administration')),
      h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('span', { class: 'badge', dataset: { tone: stats.sessions ? 'ok' : 'warn' } }, icon('shield', 12), `${stats.sessions} session${stats.sessions > 1 ? 's' : ''}`),
        h('a', { class: 'btn btn-ghost btn-sm', href: '/', 'data-link': '' }, icon('tv', 14), 'Voir le site'))),
    kpis,
    tabsBar,
    panel);

  renderKpis();
  renderTabs();
  await renderPanel();
  return () => {};
}
