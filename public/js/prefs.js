// public/js/prefs.js · favoris, historique, volume et recherches : 100 % local (AC-033).
// Aucune requête serveur, aucune donnée personnelle transmise.

const KEYS = {
  favorites: 'streamtv.favorites',
  history: 'streamtv.history',
  volume: 'streamtv.volume',
  muted: 'streamtv.muted',
  searches: 'streamtv.searches',
  lastChannel: 'streamtv.lastChannel',
  skin: 'streamtv.skin',
  tvMode: 'streamtv.tvMode',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota ou mode privé */ }
}

const listeners = new Set();
function emit(type) {
  for (const fn of listeners) {
    try { fn(type); } catch { /* un abonné ne casse pas les autres */ }
  }
}

export const prefs = {
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  favorites() {
    const list = read(KEYS.favorites, []);
    return Array.isArray(list) ? list.filter((item) => item && item.id) : [];
  },
  isFavorite(id) { return prefs.favorites().some((item) => item.id === id); },
  toggleFavorite(channel) {
    const list = prefs.favorites();
    const index = list.findIndex((item) => item.id === channel.id);
    if (index >= 0) list.splice(index, 1);
    else list.unshift({
      id: channel.id, name: channel.name, logo: channel.logo, number: channel.number,
      category: channel.category, categoryLabel: channel.categoryLabel, hue: channel.hue,
      at: new Date().toISOString(),
    });
    write(KEYS.favorites, list.slice(0, 300));
    emit('favorites');
    return index < 0;
  },
  removeFavorite(id) {
    write(KEYS.favorites, prefs.favorites().filter((item) => item.id !== id));
    emit('favorites');
  },
  clearFavorites() { write(KEYS.favorites, []); emit('favorites'); },

  history() {
    const list = read(KEYS.history, []);
    return Array.isArray(list) ? list.filter((item) => item && item.id) : [];
  },
  pushHistory(channel) {
    const list = prefs.history().filter((item) => item.id !== channel.id);
    list.unshift({
      id: channel.id, name: channel.name, logo: channel.logo, number: channel.number,
      category: channel.category, categoryLabel: channel.categoryLabel, hue: channel.hue,
      at: new Date().toISOString(),
    });
    write(KEYS.history, list.slice(0, 80));
    emit('history');
  },
  removeHistory(id) {
    write(KEYS.history, prefs.history().filter((item) => item.id !== id));
    emit('history');
  },
  clearHistory() { write(KEYS.history, []); emit('history'); },

  /** Habillage du lecteur : cadre (poste ancien), plein écran, minimal. */
  skin() {
    const value = read(KEYS.skin, 'cadre');
    return ['cadre', 'plein', 'minimal'].includes(value) ? value : 'cadre';
  },
  setSkin(value) { write(KEYS.skin, ['cadre', 'plein', 'minimal'].includes(value) ? value : 'cadre'); emit('skin'); },

  /** Mode télévision : 'auto' (détection de l'appareil), 'on' ou 'off'. */
  tvMode() {
    const value = read(KEYS.tvMode, 'auto');
    return ['auto', 'on', 'off'].includes(value) ? value : 'auto';
  },
  setTvMode(value) { write(KEYS.tvMode, ['auto', 'on', 'off'].includes(value) ? value : 'auto'); emit('tv'); },

  volume() {
    const value = Number(read(KEYS.volume, 0.85));
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.85;
  },
  setVolume(value) { write(KEYS.volume, Math.min(1, Math.max(0, Number(value) || 0))); },
  muted() { return Boolean(read(KEYS.muted, false)); },
  setMuted(value) { write(KEYS.muted, Boolean(value)); },

  searches() {
    const list = read(KEYS.searches, []);
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string').slice(0, 8) : [];
  },
  pushSearch(query) {
    const clean = String(query || '').trim();
    if (clean.length < 2) return;
    const list = prefs.searches().filter((s) => s.toLowerCase() !== clean.toLowerCase());
    list.unshift(clean.slice(0, 60));
    write(KEYS.searches, list.slice(0, 8));
  },
  clearSearches() { write(KEYS.searches, []); },

  lastChannel() { return read(KEYS.lastChannel, null); },
  setLastChannel(channel) {
    if (!channel) return;
    write(KEYS.lastChannel, { id: channel.id, name: channel.name, number: channel.number, at: new Date().toISOString() });
  },
};
