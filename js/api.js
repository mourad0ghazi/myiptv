// demo-api.js — remplace public/js/api.js dans la démonstration statique publiée sur GitHub Pages.
// Même surface publique (api, auth, ApiError, download, Admin), mêmes formes de réponse que le
// serveur Node, mais les données viennent d'un instantané JSON du catalogue. Lecture seule.

import { BASE, withBase } from './base.js';

const TOKEN_KEY = 'streamtv.token';
const PAGE_MIN = 12;
const PAGE_MAX = 60;

export class ApiError extends Error {
  constructor(message, { code = 'ERR-18', status = 0, field = '', requestId = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.field = field;
    this.requestId = requestId;
  }
}

export const auth = {
  token: () => {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  },
  set(token) {
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* stockage indisponible */ }
  },
  clear() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* stockage indisponible */ }
  },
  isSignedIn() { return Boolean(auth.token()); },
};

/* ------------------------------------------------------------------ données */

const cache = new Map();

async function snapshot(name) {
  if (cache.has(name)) return cache.get(name);
  const pending = (async () => {
    let response;
    try {
      response = await fetch(withBase(`demo/${name}.json`), { credentials: 'same-origin' });
    } catch {
      throw new ApiError('La connexion a été interrompue. Vérifiez votre réseau puis réessayez.', { code: 'P-09' });
    }
    if (!response.ok) {
      throw new ApiError('Le catalogue de démonstration est introuvable. Rechargez la page.', { code: 'ERR-18' });
    }
    return response.json();
  })();
  cache.set(name, pending);
  return pending;
}

const plain = (text) => String(text ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

/* ------------------------------------------------------------------ requêtes */

function number(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const SORTERS = {
  number: (a, b) => a.card.number - b.card.number || a.card.id.localeCompare(b.card.id),
  name: (a, b) => a.card.name.localeCompare(b.card.name, 'fr', { sensitivity: 'base' }) || a.card.number - b.card.number,
  category: (a, b) => String(a.card.categoryLabel).localeCompare(String(b.card.categoryLabel), 'fr', { sensitivity: 'base' }) || a.card.number - b.card.number,
  recent: (a, b) => String(b.card.createdAt || '').localeCompare(String(a.card.createdAt || '')) || a.card.number - b.card.number,
};

function matches(entry, filters) {
  const card = entry.card;
  if (filters.category && card.category !== filters.category) return false;
  if (filters.country && card.country !== filters.country) return false;
  if (filters.language && card.language !== filters.language) return false;
  if (filters.quality && card.quality !== filters.quality) return false;
  if (filters.health && (card.health || 'unknown') !== filters.health) return false;
  if (filters.q) {
    const words = plain(filters.q).split(/\s+/).filter(Boolean);
    if (words.length && !words.every((word) => entry.hay.includes(word))) return false;
  }
  return true;
}

async function list(params, { search = false } = {}) {
  const catalog = await snapshot('catalog');
  const filters = {
    category: params.get('category') || '',
    country: params.get('country') || '',
    language: params.get('language') || '',
    quality: params.get('quality') || '',
    health: params.get('health') || '',
    q: (params.get('q') || '').trim(),
  };
  const sort = SORTERS[params.get('sort')] ? params.get('sort') : 'number';
  const pageSize = Math.min(PAGE_MAX, Math.max(PAGE_MIN, number(params.get('pageSize'), 48)));
  const found = catalog.filter((entry) => matches(entry, filters));
  // Un numéro exact passe devant (même règle que l'index de recherche du serveur).
  if (filters.q && /^\d+$/.test(filters.q)) {
    const wanted = Number(filters.q);
    found.sort((a, b) => ((b.card.number === wanted) - (a.card.number === wanted)) || SORTERS[sort](a, b));
  } else {
    found.sort(SORTERS[sort]);
  }
  const total = found.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, number(params.get('page'), 1)));
  const slice = found.slice((page - 1) * pageSize, page * pageSize);
  return {
    channels: slice.map((entry) => entry.card),
    page,
    pageSize,
    pages,
    total,
    hasMore: page < pages,
    meta: {
      query: filters.q,
      search,
      suggestions: [],
      filters: { category: filters.category, country: filters.country, language: filters.language, quality: filters.quality, health: filters.health },
    },
  };
}

async function detail(id) {
  const catalog = await snapshot('catalog');
  const entry = catalog.find((item) => item.card.id === id);
  if (!entry) throw new ApiError('Chaîne introuvable.', { code: 'ERR-10', status: 404 });
  return { channel: entry.detail };
}

async function epg(hours) {
  let payload;
  try {
    payload = await snapshot('epg');
  } catch {
    payload = { enabled: false };
  }
  if (!payload || !payload.enabled) return payload || { enabled: false };
  const limit = new Date(Date.now() + Math.max(1, Math.min(48, hours)) * 3600 * 1000).toISOString();
  const grid = (payload.grid || []).map((row) => ({
    ...row,
    programmes: row.programmes.filter((programme) => programme.start <= limit),
  }));
  return { ...payload, grid, to: limit, cached: true };
}

const READ_ONLY = 'Cette démonstration publique est en lecture seule : la console d’administration n’y est pas disponible.';

/* ------------------------------------------------------------------ entrée */

export async function api(path, { method = 'GET', body = null } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError('Vous êtes hors ligne. Vérifiez votre connexion.', { code: 'P-09' });
  }
  const url = new URL(withBase(path), location.href);
  const route = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname.replace(/^\//, '');
  const params = url.searchParams;
  // Petite latence simulée : les squelettes de chargement restent visibles et testables.
  await new Promise((resolve) => setTimeout(resolve, 40));
  if (method !== 'GET') {
    if (route === 'api/login') {
      throw new ApiError('Le mot de passe ne peut pas être vérifié dans cette démonstration.', { code: 'ERR-08', status: 401 });
    }
    throw new ApiError(READ_ONLY, { code: 'ERR-09', status: 403 });
  }
  if (route === 'api/config') return snapshot('config');
  if (route === 'api/errors/catalog') return snapshot('errors');
  if (route === 'api/session') return { signedIn: false, expiresAt: null, demo: true };
  if (route === 'api/epg') return epg(number(params.get('hours'), 12));
  if (route === 'api/channels') return list(params);
  if (route === 'api/channels/search') return list(params, { search: true });
  if (route.startsWith('api/channels/')) return detail(decodeURIComponent(route.slice('api/channels/'.length)));
  if (route.startsWith('api/admin/')) throw new ApiError(READ_ONLY, { code: 'ERR-07', status: 401 });
  throw new ApiError('Cette adresse n’existe pas.', { code: 'ERR-11', status: 404 });
}

export async function download(path, filename) {
  const payload = await api(path);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Console d'administration : absente d'une démonstration statique, mais l'interface reste utilisable. */
export const Admin = new Proxy({}, {
  get: () => async () => { throw new ApiError(READ_ONLY, { code: 'ERR-07', status: 401 }); },
});
