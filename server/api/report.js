// server/api/report.js — EP-38 : signalement public d'une chaîne (F-25).
// Un signalement est enregistré, jamais appliqué : la suppression n'a lieu qu'au seuil
// de signalements (1000 par défaut), et elle reste réversible depuis l'administration.

import { LIMITS } from '../core/constants.js';
import { AppError, requireOneOf } from '../core/errors.js';
import { REASON_IDS, countFor, recordReport, reportThreshold } from '../core/reports.js';
import { normalizeName } from '../core/text.js';

function findTarget(app, body) {
  const id = typeof body?.channelId === 'string' ? body.channelId.trim() : '';
  if (id) {
    const found = app.store.channels.find((channel) => channel.id === id);
    if (!found) throw new AppError('ERR-10');
    return found;
  }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) throw new AppError('ERR-02', { field: 'name', params: { champ: 'nom de la chaîne' } });
  const wanted = normalizeName(name);
  const exact = app.store.channels.find((channel) => normalizeName(channel.name) === wanted);
  if (exact) return exact;
  // Repli : la recherche insensible aux accents renvoie la chaîne la plus proche.
  const candidates = app.index.search(name);
  if (candidates.length) return candidates[0];
  throw new AppError('ERR-10');
}

export function registerReportRoutes(router, app) {
  // EP-38 — signaler une chaîne. Route publique, débit limité par adresse.
  router.post('/api/report', async ({ body, ip }) => {
    const guard = app.reportGuard.check(ip);
    if (!guard.allowed) {
      throw new AppError('ERR-17', {
        params: { n: Math.max(1, Math.ceil(guard.retryAfterSeconds / 60)) },
        headers: { 'Retry-After': String(guard.retryAfterSeconds) },
      });
    }
    const channel = findTarget(app, body);
    if (channel.deleted) throw new AppError('ERR-10');
    const reason = requireOneOf(body?.reason || 'autre', 'reason', 'motif', REASON_IDS);
    const message = String(body?.message || '').slice(0, LIMITS.reportMessageMax);
    const email = String(body?.email || '').slice(0, 120);
    const result = recordReport({
      state: app.store.reports,
      channel,
      reason,
      message,
      email,
      ip,
      threshold: reportThreshold(),
    });
    app.reportGuard.fail(ip);

    let deleted = false;
    if (result.shouldDelete && !channel.deleted) {
      const at = new Date().toISOString();
      channel.deleted = true;
      channel.deletedAt = at;
      channel.visible = false;
      channel.blocked = true;
      channel.blockedReason = 'retrait-signalement';
      channel.manualOverride = 'retrait-signalement-automatique';
      channel.notes = `Retirée automatiquement après ${result.count} signalements.`;
      channel.updatedAt = at;
      await app.store.saveChannels('report.auto-delete');
      app.index.remove(channel.id);
      await app.store.audit('report.auto-delete', {
        channelIds: [channel.id],
        detail: `${channel.name} : ${result.count} signalements`,
      });
      deleted = true;
    }

    await app.store.saveReports('report.create');
    await app.store.audit('report.create', {
      channelIds: [channel.id],
      detail: `${result.ref} ${reason} (${result.count})`,
    });

    const body2 = {
      ref: result.ref,
      count: result.count,
      threshold: result.threshold,
      duplicate: result.duplicate,
      deleted,
      channel: { id: channel.id, name: channel.name, number: channel.number },
      message: deleted
        ? 'Ce signalement atteint le seuil de retrait. La chaîne a été retirée du catalogue.'
        : result.duplicate
          ? 'Ce signalement a déjà été enregistré récemment pour cette chaîne.'
          : 'Signalement enregistré. Merci, il est examiné sous 72 heures ouvrées.',
    };
    return { status: 201, body: body2, cache: 'no-store' };
  }, { bodyLimit: 4096 });

  // EP-39 — état public d'un signalement, pour suivre sa référence.
  router.get('/api/report/:ref', ({ params }) => {
    const ref = String(params.ref || '').toUpperCase();
    const report = app.store.reports.reports.find((item) => item.ref === ref);
    if (!report) throw new AppError('ERR-11');
    return {
      body: {
        ref: report.ref,
        status: report.status,
        at: report.at,
        decidedAt: report.decidedAt,
        channelName: report.channelName,
        count: countFor(app.store.reports, report.channelId),
        threshold: reportThreshold(),
      },
      cache: 'no-store',
    };
  });
}
