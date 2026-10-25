// public/js/views/admin/health.js — onglet Santé : sonde bornée, états up/flaky/down/unknown.
// Une sonde ne bloque jamais la console : elle est plafonnée en durée et en nombre.

import { Admin } from '../../api.js';
import { h, icon, modal, toast, spinner, emptyState, fmtNumber, healthLabel } from '../../ui.js';
import { statCard } from '../../components.js';
import { confirmModal, apiGuard } from './common.js';
import { channelModal } from './catalogue.js';

/* ------------------------------------------------------------------ santé */

async function renderHealth(host, ctx, state, { refreshStats, stats }) {
  const current = stats();
  const probeHost = h('div', {});
  const limit = h('select', { class: 'select', 'aria-label': 'Nombre de chaînes à sonder' },
    [20, 40, 80, 100].map((value) => h('option', { value: String(value), selected: value === 40 }, `${value} chaînes`)));
  const probeBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button' },
    icon('heart', 14), 'Lancer une sonde');

  probeBtn.addEventListener('click', () => {
    confirmModal({
      title: 'Sonder les flux',
      message: 'Chaque flux est testé une seule fois, sans lecture vidéo. Les résultats mettent à jour la pastille de santé et les blocages automatiques.',
      confirmLabel: 'Sonder',
      danger: false,
      onConfirm: async () => {
        document.querySelector('.modal-backdrop')?.remove();
        probeBtn.disabled = true;
        probeBtn.replaceChildren(icon('retry', 14), 'Sonde en cours…');
        probeHost.replaceChildren(spinner('Test des flux, 8 en parallèle, 6 secondes maximum par flux…'));
        try {
          const result = await Admin.probe({ limit: Number(limit.value) });
          state.probe = result;
          probeHost.replaceChildren(h('div', { class: 'banner', dataset: { tone: 'info' } },
            icon('check', 16), h('p', { text: result.message })));
          toast(result.message, { tone: 'success', duration: 6000 });
          await refreshStats();
          renderHealth(host, ctx, state, { refreshStats, stats });
        } catch (error) {
          if (apiGuard(ctx, error)) return;
          probeHost.replaceChildren(h('div', { class: 'banner', dataset: { tone: 'danger' } }, icon('alert', 16), h('p', { text: error.message })));
        } finally {
          probeBtn.disabled = false;
          probeBtn.replaceChildren(icon('heart', 14), 'Lancer une sonde');
        }
      },
    });
  });

  const engine = current.confidence.engine;
  const maxCount = Math.max(...current.confidence.histogram.map((bucket) => bucket.count), 1);
  const host2 = h('div', {});
  host.replaceChildren(
    h('div', { class: 'stat-grid' },
      statCard('Disponibles', fmtNumber(current.health.up), 'sonde réussie', 'ok'),
      statCard('Instables', fmtNumber(current.health.flaky), 'lenteur, CORS ou 5xx', 'warn'),
      statCard('Indisponibles', fmtNumber(current.health.down), '3 échecs consécutifs', 'danger'),
      statCard('Non testées', fmtNumber(current.health.unknown), 'état initial obligatoire')),
    h('section', { class: 'panel', style: { marginTop: '16px' } },
      h('p', { class: 'eyebrow' }, 'Mesure'),
      h('h2', { style: { fontSize: '20px', marginBottom: '4px' } }, 'Sonde de disponibilité'),
      h('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Concurrence 8, délai 6 secondes, plafond de 300 sondes par minute.'),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, limit, probeBtn),
      probeHost),
    h('section', { class: 'panel', style: { marginTop: '16px' } },
      h('p', { class: 'eyebrow' }, 'Cerveau du catalogue'),
      h('h2', { style: { fontSize: '20px', marginBottom: '12px' } }, 'Moteur de catégorisation'),
      h('div', { class: 'stat-grid' },
        statCard('Vitesse', `${fmtNumber(engine.vitesse)} ch/s`, 'cible ≥ 5 000', engine.vitesse >= 5000 ? 'ok' : 'warn'),
        statCard('Accord au groupe', `${Math.round(engine.accordGenre * 100)} %`, 'cible ≥ 85 %', engine.accordGenre >= 0.85 ? 'ok' : 'warn'),
        statCard('Sous 0,45', `${(engine.sous045 * 100).toFixed(1)} %`, 'cible ≤ 10 %', engine.sous045 <= 0.1 ? 'ok' : 'warn'),
        statCard('Confiance moyenne', (engine.confianceMoyenne || 0).toFixed(2), 'cible ≥ 0,80', engine.confianceMoyenne >= 0.8 ? 'ok' : 'warn')),
      h('div', { class: 'histogram', style: { marginTop: '16px' } },
        current.confidence.histogram.map((bucket) => h('div', { class: 'hist-row' },
          h('span', { class: 'count-label' }, `${Math.round(bucket.min * 100)}–${Math.round(bucket.max * 100)} %`),
          h('span', { class: 'hist-bar' }, h('span', { style: { width: `${Math.round((bucket.count / maxCount) * 100)}%` } })),
          h('span', { class: 'tabular' }, fmtNumber(bucket.count))))),
      h('p', { class: 'muted', style: { marginTop: '12px', fontSize: '13px' } },
        `Décisions : ${Object.entries(current.sources).map(([key, value]) => `${key} ${fmtNumber(value)}`).join(' · ')} — ${fmtNumber(engine.total)} chaînes mesurées en ${engine.durationMs} ms.`)),
    h('section', { class: 'panel', style: { marginTop: '16px' } },
      h('div', { class: 'section-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, 'Qualité'), h('h2', { style: { fontSize: '20px' } }, 'File « à vérifier »')),
        h('span', { class: 'badge' }, `seuil ${Math.round(current.confidence.floor * 100)} %`)),
      current.queue.length
        ? h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'N°'), h('th', {}, 'Chaîne'), h('th', {}, 'Catégorie'), h('th', {}, 'Confiance'), h('th', {}, 'Motif'), h('th', {}, ''))),
          h('tbody', {}, current.queue.map((item) => h('tr', {},
            h('td', { class: 'num' }, String(item.number)),
            h('td', { dir: 'auto' }, item.name),
            h('td', {}, item.categoryLabel),
            h('td', { class: 'num' }, `${Math.round(item.confidence * 100)} %`),
            h('td', { class: 'muted', style: { fontSize: '12px' } }, item.reasons?.[0] || '—'),
            h('td', {}, h('button', {
              class: 'btn btn-quiet btn-sm', type: 'button',
              onClick: () => channelModal(ctx, item.id, { onDone: () => renderHealth(host, ctx, state, { refreshStats, stats }) }),
            }, icon('edit', 14), 'Corriger')))))))
        : emptyState({ iconName: 'check', title: 'Aucune chaîne en attente', message: 'Toutes les chaînes dépassent le seuil de confiance.' })),
    state.probe?.results?.length ? h('section', { class: 'panel', style: { marginTop: '16px' } },
      h('h2', { style: { fontSize: '18px', marginBottom: '10px' } }, `Résultat de la dernière sonde (${state.probe.durationMs} ms)`),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'N°'), h('th', {}, 'Chaîne'), h('th', {}, 'État'), h('th', {}, 'HTTP'), h('th', {}, 'Latence'), h('th', {}, 'Cause'))),
        h('tbody', {}, state.probe.results.slice(0, 60).map((item) => h('tr', {},
          h('td', { class: 'num' }, String(item.number)),
          h('td', { dir: 'auto' }, item.name),
          h('td', {}, healthLabel(item.status)),
          h('td', { class: 'num' }, item.httpStatus ? String(item.httpStatus) : '—'),
          h('td', { class: 'num' }, `${item.latencyMs} ms`),
          h('td', { class: 'muted' }, item.reason))))))) : null);
  host.append(host2);
}

export { renderHealth };
