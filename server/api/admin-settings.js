// server/api/admin-settings.js · lecture et écriture des réglages du site (3.11.0).
// Extraits de admin.js pour garder chaque fichier sous la limite de 900 lignes et
// un seul rôle : ici, tout ce qui touche aux réglages, y compris l'entrée secrète.

import { LICENSE_NOTES } from '../core/constants.js';
import { AppError } from '../core/errors.js';
import { DEFAULTS, schemaForClient, validateSettings } from '../core/settings.js';

export function registerSettingsRoutes(base, app) {
  // Lecture : les valeurs, le schéma complet et les valeurs par défaut.
  base.get('/api/admin/settings', () => ({
    body: {
      settings: app.store.settings,
      schema: schemaForClient(),
      defaults: DEFAULTS,
      licenseNotes: LICENSE_NOTES,
      adminPath: app.store.settings.adminPath,
      deviceLock: Boolean(app.store.settings.adminDeviceLock),
      deviceCount: app.store.devices.length,
    },
    cache: 'no-store',
  }));

  // Écriture : validation globale, aucune écriture partielle.
  base.patch('/api/admin/settings', async ({ body, ip, requestId }) => {
    const patch = body && typeof body === 'object' ? body : {};
    const unknown = Object.keys(patch).filter((key) => !(key in DEFAULTS));
    if (unknown.length) throw new AppError('ERR-04', { field: unknown[0], params: { champ: unknown[0] } });
    const existingIds = new Set(app.store.channels.filter((channel) => !channel.deleted).map((channel) => channel.id));
    const { settings, errors } = validateSettings(patch, { existingIds, base: app.store.settings });
    if (errors.length) {
      const first = errors[0];
      throw new AppError(first.code, { field: first.field, message: first.message });
    }
    const next = { ...app.store.settings, ...settings };
    // On ne ferme pas la porte en laissant la clé dehors : le verrou d'appareil n'est
    // accepté que si un appareil est déjà enregistré.
    if (next.adminDeviceLock && !app.store.settings.adminDeviceLock && !app.store.devices.length) {
      throw new AppError('ERR-16', { params: { raison: 'aucun appareil enregistré' } });
    }
    const cheminChange = next.adminPath !== app.store.settings.adminPath;
    await app.store.saveSettings(next, 'settings.update');
    await app.store.audit('settings.update', { ip, requestId, detail: Object.keys(patch).join(',') });
    return {
      body: {
        settings: app.store.settings,
        message: cheminChange
          ? `Adresse de la console changée : /${app.store.settings.adminPath}`
          : 'Réglages enregistrés.',
        requiresReload: cheminChange,
        adminPath: app.store.settings.adminPath,
      },
      cache: 'no-store',
    };
  });

  // Réinitialisation complète.
  base.post('/api/admin/settings/reset', async ({ ip }) => {
    await app.store.saveSettings({ ...DEFAULTS }, 'settings.reset');
    await app.store.audit('settings.reset', { ip });
    return {
      body: { settings: app.store.settings, message: 'Les 19 réglages ont retrouvé leurs valeurs par défaut.' },
      cache: 'no-store',
    };
  });
}
