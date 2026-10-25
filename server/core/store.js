// server/core/store.js — persistance JSON atomique (BUG-09), sauvegardes tournantes, journal d'audit.
// Invariants : écriture tmp → fsync → rename ; un fichier illisible est remplacé par la dernière sauvegarde valide.

import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DEFAULTS, normalizeSettings } from './settings.js';

const FILES = {
  channels: 'channels.json',
  settings: 'settings.json',
  sources: 'sources.json',
  health: 'health.json',
  learning: 'learning.json',
  audit: 'audit.log',
};

const DATA_VERSION = 3;

function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function isoWeek(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return `${target.getUTCFullYear()}-W${String(Math.ceil(((target - yearStart) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

function maskSecrets(value) {
  return String(value)
    .replace(/([?&](?:token|signature|sig|expire|sid|key|password)=)[^&\s]+/gi, '$1***')
    .replace(/(Bearer\s+)[a-f0-9]{8,}/gi, '$1***');
}

export class Store {
  constructor({ dataDir, logger = console }) {
    this.dataDir = dataDir;
    this.backupDir = path.join(dataDir, 'backups');
    this.logDir = path.join(dataDir, 'logs');
    this.logger = logger;
    this.channels = [];
    this.settings = { ...DEFAULTS };
    this.sources = [];
    this.learning = { rules: {}, learned: {}, learnedStats: null, corrections: [], updatedAt: null };
    this.security = { passwordHash: '', salt: '', iterations: 16384, defaultPassword: true, updatedAt: null };
    this.notices = [];
    this.loadedAt = null;
    this.error = null;
    this.writeQueue = Promise.resolve();
    this.auditQueue = Promise.resolve();
  }

  file(key) {
    return path.join(this.dataDir, FILES[key]);
  }

  async ensureDirs() {
    await fsp.mkdir(this.dataDir, { recursive: true });
    await fsp.mkdir(this.backupDir, { recursive: true });
    await fsp.mkdir(this.logDir, { recursive: true });
  }

  /* --------------------------------------------------------------- lecture */

  async readJson(file, fallback) {
    try {
      const raw = await fsp.readFile(file, 'utf8');
      if (!raw.trim()) return { data: fallback, missing: true, corrupt: false };
      return { data: JSON.parse(raw), missing: false, corrupt: false };
    } catch (error) {
      if (error.code === 'ENOENT') return { data: fallback, missing: true, corrupt: false };
      return { data: fallback, missing: false, corrupt: true, error };
    }
  }

  async init() {
    await this.ensureDirs();
    await this.loadChannels();
    await this.loadSettings();
    await this.loadSources();
    await this.loadLearning();
    await this.loadHealthSnapshot();
    this.loadedAt = new Date().toISOString();
    // Les cinq fichiers du contrat §4 existent dès le premier démarrage, même vides.
    await this.saveSources('init');
    await this.saveHealthSnapshot();
    await this.saveLearning('init');
    return this;
  }

  async loadChannels() {
    const { data, missing, corrupt } = await this.readJson(this.file('channels'), null);
    if (!corrupt && data && Array.isArray(data.channels)) {
      this.channels = data.channels;
      this.loadedAt = data.updatedAt || this.loadedAt;
      return;
    }
    if (corrupt) {
      const quarantine = path.join(this.dataDir, `channels.corrupt-${stamp()}.json`);
      try { await fsp.rename(this.file('channels'), quarantine); } catch { /* déjà déplacé */ }
      this.error = 'channels-corrupt';
      this.notices.push('Le catalogue était illisible : il a été mis de côté.');
      const restored = await this.restoreLatestBackup({ silent: true });
      if (restored) {
        this.notices.push(`Catalogue restauré depuis la sauvegarde du ${restored.date}.`);
        return;
      }
      this.channels = [];
      return;
    }
    this.channels = [];
    if (missing) this.loadedAt = null;
  }

  async loadSettings() {
    const { data, corrupt } = await this.readJson(this.file('settings'), null);
    if (!corrupt && data && typeof data === 'object') {
      this.settings = normalizeSettings(data.settings || data);
      if (data.security && typeof data.security === 'object') this.security = { ...this.security, ...data.security };
      return;
    }
    this.settings = { ...DEFAULTS };
  }

  async loadSources() {
    const { data, corrupt } = await this.readJson(this.file('sources'), null);
    if (!corrupt && data && Array.isArray(data.sources)) { this.sources = data.sources; return; }
    this.sources = [
      {
        id: 'iptv-org',
        name: 'iptv-org',
        url: 'https://iptv-org.github.io/iptv/index.m3u',
        license: 'CC0 (base) / listes sous licence de leurs auteurs',
        note: 'Socle : identifiants de guide (tvg-id), catégories et HTTPS.',
        weight: 60,
        enabled: true,
        verified: false,
        lastIngestAt: null,
      },
      {
        id: 'romaxa55',
        name: 'world_ip_tv (romaxa55)',
        url: 'https://romaxa55.github.io/world_ip_tv/output/index.m3u',
        license: 'MIT',
        note: 'Fraîcheur : liste re-testée toutes les 6 h. Ni tvg-id ni catégories ; à passer par scripts/probe-source.js avant ingestion.',
        weight: 30,
        enabled: false,
        verified: false,
        lastIngestAt: null,
      },
      { id: 'catalogue-propre', name: 'Catalogue propre', url: '', weight: 40, enabled: true, lastIngestAt: null },
    ];
  }

  async loadLearning() {
    const { data, corrupt } = await this.readJson(this.file('learning'), null);
    if (!corrupt && data && typeof data === 'object') {
      this.learning = {
        rules: data.rules && typeof data.rules === 'object' ? data.rules : {},
        learned: data.learned && typeof data.learned === 'object' ? data.learned : {},
        learnedStats: data.learnedStats && typeof data.learnedStats === 'object' ? data.learnedStats : null,
        corrections: Array.isArray(data.corrections) ? data.corrections.slice(-500) : [],
        updatedAt: data.updatedAt || null,
      };
    }
  }

  async loadHealthSnapshot() {
    const { data, corrupt } = await this.readJson(this.file('health'), null);
    if (corrupt || !data || typeof data !== 'object') return;
    const entries = data.entries && typeof data.entries === 'object' ? data.entries : {};
    const byId = new Map(Object.entries(entries));
    for (const channel of this.channels) {
      const stored = byId.get(channel.id);
      if (stored && (!channel.health || channel.health.status === 'unknown')) {
        channel.health = { ...channel.health, ...stored };
      }
    }
    this.healthUpdatedAt = data.updatedAt || null;
  }

  /* --------------------------------------------------------------- écriture */

  async atomicWrite(file, content) {
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    const handle = await fsp.open(tmp, 'wx', 0o600);
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fsp.rename(tmp, file);
    } catch (error) {
      await fsp.unlink(tmp).catch(() => {});
      throw error;
    }
    // fsync du dossier : le renommage lui-même doit être durable.
    try {
      const dir = await fsp.open(path.dirname(file), 'r');
      try { await dir.sync(); } finally { await dir.close(); }
    } catch { /* certains systèmes de fichiers refusent fsync sur dossier */ }
  }

  async atomicWriteJson(file, value) {
    await this.atomicWrite(file, `${JSON.stringify(value)}\n`);
  }

  enqueue(task) {
    const next = this.writeQueue.then(task, task);
    this.writeQueue = next.catch(() => {});
    return next;
  }

  async saveChannels(reason = 'update') {
    return this.enqueue(async () => {
      const payload = {
        version: DATA_VERSION,
        updatedAt: new Date().toISOString(),
        reason,
        count: this.channels.length,
        channels: this.channels,
      };
      await this.atomicWriteJson(this.file('channels'), payload);
      this.loadedAt = payload.updatedAt;
      return payload;
    });
  }

  async saveSettings(next, reason = 'settings') {
    return this.enqueue(async () => {
      this.settings = normalizeSettings(next);
      const payload = {
        version: DATA_VERSION,
        updatedAt: new Date().toISOString(),
        reason,
        settings: this.settings,
        security: this.security,
      };
      await this.atomicWriteJson(this.file('settings'), payload);
      return payload;
    });
  }

  async saveSecurity(reason = 'security') {
    return this.saveSettings(this.settings, reason);
  }

  async saveSources(reason = 'sources') {
    return this.enqueue(async () => {
      await this.atomicWriteJson(this.file('sources'), {
        version: DATA_VERSION,
        updatedAt: new Date().toISOString(),
        reason,
        sources: this.sources,
      });
    });
  }

  async saveLearning(reason = 'learning') {
    return this.enqueue(async () => {
      this.learning.updatedAt = new Date().toISOString();
      await this.atomicWriteJson(this.file('learning'), {
        version: DATA_VERSION,
        updatedAt: this.learning.updatedAt,
        reason,
        rules: this.learning.rules,
        learned: this.learning.learned,
        learnedStats: this.learning.learnedStats,
        corrections: this.learning.corrections,
      });
    });
  }

  async saveHealthSnapshot() {
    return this.enqueue(async () => {
      const entries = {};
      for (const channel of this.channels) {
        if (channel.health && channel.health.status !== 'unknown') entries[channel.id] = channel.health;
      }
      await this.atomicWriteJson(this.file('health'), {
        version: DATA_VERSION,
        updatedAt: new Date().toISOString(),
        counts: this.healthCounts(),
        entries,
      });
      this.healthUpdatedAt = new Date().toISOString();
    });
  }

  healthCounts() {
    const counts = { up: 0, flaky: 0, down: 0, unknown: 0 };
    for (const channel of this.channels) {
      const status = channel.health?.status || 'unknown';
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  }

  /* --------------------------------------------------------------- audit */

  async audit(action, meta = {}) {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      action,
      actor: meta.actor || 'admin',
      ip: meta.ip || '',
      requestId: meta.requestId || '',
      channelIds: Array.isArray(meta.channelIds) ? meta.channelIds.slice(0, 200) : undefined,
      count: meta.count,
      result: meta.result || 'ok',
      detail: meta.detail === undefined ? undefined : maskSecrets(String(meta.detail)).slice(0, 500),
    });
    this.auditQueue = this.auditQueue.then(async () => {
      await fsp.appendFile(this.file('audit'), `${line}\n`, { mode: 0o600 }).catch((error) => {
        this.logger.error?.(`audit: ${error.message}`);
      });
    });
    return this.auditQueue;
  }

  async readAudit(lines = 50) {
    try {
      const raw = await fsp.readFile(this.file('audit'), 'utf8');
      const all = raw.trim().split('\n').filter(Boolean);
      return all.slice(-lines).map((line) => {
        try { return JSON.parse(line); } catch { return { at: null, action: 'illisible', raw: maskSecrets(line).slice(0, 200) }; }
      }).reverse();
    } catch {
      return [];
    }
  }

  async logEvent(level, event, detail = {}) {
    const file = path.join(this.logDir, `app-${new Date().toISOString().slice(0, 10)}.jsonl`);
    const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...detail });
    await fsp.appendFile(file, `${line}\n`).catch(() => {});
  }

  /* --------------------------------------------------------------- sauvegardes */

  async backup(reason = 'manual') {
    const now = new Date();
    const weekly = reason === 'auto' && now.getUTCDay() === 0;
    const name = `catalogue-${stamp(now)}${weekly ? '-hebdo' : ''}.json`;
    const payload = {
      version: DATA_VERSION,
      createdAt: now.toISOString(),
      reason,
      count: this.channels.length,
      channels: this.channels,
      settings: this.settings,
    };
    const content = `${JSON.stringify(payload)}\n`;
    const file = path.join(this.backupDir, name);
    await this.atomicWrite(file, content);
    const sha256 = createHash('sha256').update(content).digest('hex');
    await this.atomicWrite(`${file}.sha256`, `${sha256}  ${name}\n`);
    await this.rotateBackups();
    await this.audit('backup.create', { count: this.channels.length, detail: name });
    return { file: name, date: now.toISOString().slice(0, 10), size: Buffer.byteLength(content), sha256, weekly };
  }

  async listBackups() {
    let names = [];
    try { names = await fsp.readdir(this.backupDir); } catch { return []; }
    const files = names.filter((name) => name.endsWith('.json')).sort().reverse();
    const out = [];
    for (const name of files.slice(0, 80)) {
      const full = path.join(this.backupDir, name);
      try {
        const stat = await fsp.stat(full);
        let sha256 = '';
        try { sha256 = (await fsp.readFile(`${full}.sha256`, 'utf8')).split(/\s+/)[0]; } catch { /* empreinte absente */ }
        out.push({
          file: name,
          createdAt: stat.mtime.toISOString(),
          date: stat.mtime.toISOString().slice(0, 10),
          size: stat.size,
          sha256,
          weekly: name.includes('-hebdo'),
        });
      } catch { /* fichier disparu */ }
    }
    return out;
  }

  async rotateBackups() {
    const backups = await this.listBackups();
    const keep = new Set(backups.slice(0, 7).map((backup) => backup.file));
    for (const backup of backups.filter((item) => item.weekly).slice(0, 4)) keep.add(backup.file);
    // Une sauvegarde hebdomadaire par semaine ISO, sur les 4 dernières semaines.
    const weeks = new Set();
    for (const backup of backups) {
      const week = isoWeek(new Date(backup.createdAt));
      if (weeks.has(week) || weeks.size >= 4) continue;
      weeks.add(week);
      keep.add(backup.file);
    }
    for (const backup of backups) {
      if (keep.has(backup.file)) continue;
      await fsp.unlink(path.join(this.backupDir, backup.file)).catch(() => {});
      await fsp.unlink(path.join(this.backupDir, `${backup.file}.sha256`)).catch(() => {});
    }
  }

  async verifyBackup(name) {
    if (!/^catalogue-[0-9]{8}-[0-9]{6}(?:-hebdo)?\.json$/.test(name)) return { ok: false, reason: 'nom' };
    const full = path.join(this.backupDir, name);
    let content;
    try { content = await fsp.readFile(full, 'utf8'); } catch { return { ok: false, reason: 'absent' }; }
    let expected = '';
    try { expected = (await fsp.readFile(`${full}.sha256`, 'utf8')).split(/\s+/)[0]; } catch { /* pas d'empreinte */ }
    if (expected) {
      const actual = createHash('sha256').update(content).digest('hex');
      if (actual !== expected) return { ok: false, reason: 'empreinte' };
    }
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed.channels)) return { ok: false, reason: 'format' };
      return { ok: true, data: parsed };
    } catch {
      return { ok: false, reason: 'json' };
    }
  }

  async restoreLatestBackup({ silent = false } = {}) {
    const backups = await this.listBackups();
    for (const backup of backups) {
      const verified = await this.verifyBackup(backup.file);
      if (verified.ok) {
        this.channels = verified.data.channels;
        if (!silent) await this.saveChannels('restore-latest');
        return { date: backup.date, file: backup.file };
      }
    }
    return null;
  }

  async restore(name) {
    const verified = await this.verifyBackup(name);
    if (!verified.ok) {
      const reasons = { nom: 'nom de fichier refusé', absent: 'fichier introuvable', empreinte: 'empreinte SHA-256 différente', format: 'format inattendu', json: 'fichier illisible' };
      const error = new Error(reasons[verified.reason] || 'sauvegarde invalide');
      error.code = 'ERR-16';
      throw error;
    }
    await this.backup('avant-restauration');
    this.channels = verified.data.channels;
    if (verified.data.settings) this.settings = normalizeSettings(verified.data.settings);
    await this.saveChannels('restore');
    if (verified.data.settings) await this.saveSettings(this.settings, 'restore');
    await this.audit('backup.restore', { count: this.channels.length, detail: name });
    return { count: this.channels.length, file: name };
  }

  /* --------------------------------------------------------------- divers */

  async storageStats() {
    const sizes = {};
    for (const [key, filename] of Object.entries(FILES)) {
      try { sizes[filename] = (await fsp.stat(path.join(this.dataDir, filename))).size; } catch { sizes[filename] = 0; }
    }
    let backupBytes = 0;
    try {
      const names = await fsp.readdir(this.backupDir);
      for (const name of names) {
        try { backupBytes += (await fsp.stat(path.join(this.backupDir, name))).size; } catch { /* ignoré */ }
      }
    } catch { /* dossier absent */ }
    sizes.backups = backupBytes;
    sizes['font-404'] = 0;
    return sizes;
  }

  async flush() {
    await this.writeQueue.catch(() => {});
    await this.auditQueue.catch(() => {});
  }
}
