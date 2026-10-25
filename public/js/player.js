// public/js/player.js — lecteur : 7 états, détection de cause, 12 mires (§8).
// Invariants : une seule reprise automatique, hls.destroy() à chaque sortie, aucun minuteur orphelin.

import { api } from './api.js';
import { COPY } from './copy.js';
import { h, icon, toast, copyText, logoNode } from './ui.js';
import { prefs } from './prefs.js';

const MIRES = COPY.player.mires;
const RETRYABLE = new Set(['P-03', 'P-04', 'P-10', 'P-12', 'P-07']);

class Player {
  constructor() {
    this.root = null;
    this.overlay = null;
    this.video = null;
    this.hls = null;
    this.channel = null;
    this.queue = [];
    this.index = -1;
    this.state = 'IDLE';
    this.attempts = 0;
    this.retryTimer = null;
    this.osdTimer = null;
    this.manifestTimer = null;
    this.digitBuffer = '';
    this.digitTimer = null;
    this.onKeyDown = null;
    this.onClose = null;
    this.previousFocus = null;
    this.previousOverflow = '';
    this.liveRegion = null;
    this.mireVisible = false;
  }

  ensureRoot() {
    if (!this.root) this.root = document.getElementById('player-root');
    return this.root;
  }

  /** Ouvre le lecteur sur une chaîne (objet complet ou identifiant). */
  async open(channelOrId, { queue = [], onClose = null } = {}) {
    this.ensureRoot();
    this.onClose = onClose;
    let channel = typeof channelOrId === 'string'
      ? (await api(`/api/channels/${channelOrId}`)).channel
      : channelOrId;
    // Les cartes du catalogue sont volontairement allégées : l'adresse du flux n'arrive qu'à la lecture.
    if (channel && !channel.url) {
      try {
        channel = (await api(`/api/channels/${channel.id}`)).channel;
      } catch {
        channel = { ...channel, url: '' };
      }
    }
    this.queue = Array.isArray(queue) && queue.length ? queue.map((item) => (typeof item === 'string' ? item : item.id)) : [channel.id];
    this.index = Math.max(0, this.queue.indexOf(channel.id));
    await this.mount(channel);
  }

  async mount(channel) {
    this.teardown(false);
    this.channel = channel;
    this.attempts = 0;
    this.previousFocus = document.activeElement;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    prefs.pushHistory(channel);
    prefs.setLastChannel(channel);

    const isHttps = location.protocol === 'https:';
    const qualityOptions = [
      { url: channel.url, quality: channel.quality || 'AUTO', label: 'Source principale' },
      ...(channel.variants || []),
    ].filter((item, i, arr) => item.url && arr.findIndex((x) => x.url === item.url) === i);

    this.video = h('video', {
      playsinline: true, autoplay: true, controls: false, preload: 'metadata',
      'aria-label': `Lecteur : ${channel.name}`,
    });
    this.video.volume = prefs.volume();
    this.video.muted = prefs.muted();

    const qualitySelect = qualityOptions.length > 1
      ? h('select', { class: 'select', 'aria-label': 'Choisir la qualité', onChange: (event) => this.switchQuality(event.target.value) },
        qualityOptions.map((item) => h('option', { value: item.url }, `${item.quality || 'AUTO'} · ${item.label || 'variante'}`)))
      : null;

    const favBtn = h('button', {
      class: 'player-btn', type: 'button', id: 'player-fav',
      'aria-label': COPY.actions.addFavorite, 'aria-pressed': String(prefs.isFavorite(channel.id)),
      onClick: () => {
        const added = prefs.toggleFavorite(channel);
        favBtn.setAttribute('aria-pressed', String(added));
        favBtn.setAttribute('aria-label', added ? COPY.actions.removeFavorite : COPY.actions.addFavorite);
        if (added) favBtn.replaceChildren(icon('star', 18, 'fill="currentColor"'));
        else favBtn.replaceChildren(icon('star', 18));
        toast(added ? 'Ajoutée aux favoris.' : 'Retirée des favoris.', { tone: 'success', duration: 2500 });
      },
    }, icon('star', 18, prefs.isFavorite(channel.id) ? 'fill="currentColor"' : ''));

    this.closeBtn = h('button', { class: 'player-btn', type: 'button', 'aria-label': 'Fermer le lecteur', onClick: () => this.close() }, icon('close', 18));
    this.playBtn = h('button', { class: 'player-btn primary', type: 'button', 'aria-label': 'Lecture ou pause', onClick: () => this.toggle() }, icon('pause', 20));
    this.muteBtn = h('button', { class: 'player-btn', type: 'button', 'aria-label': 'Couper le son', 'aria-pressed': String(this.video.muted), onClick: () => this.toggleMute() },
      icon(this.video.muted ? 'mute' : 'volume', 18));
    this.volumeRange = h('input', {
      type: 'range', min: '0', max: '1', step: '0.05', value: String(this.video.volume),
      'aria-label': 'Volume', onInput: (event) => this.setVolume(Number(event.target.value)),
    });
    // OSD §7.2 : nom, numéro, catégorie, qualité — rien d'autre (l'état de santé reste sur la carte).
    this.osd = h('div', { class: 'osd', dataset: { hidden: 'false' }, 'aria-hidden': 'true' },
      h('strong', { text: `#${channel.number} · ${channel.name}` }),
      h('small', { text: [channel.categoryLabel || 'Catégorie inconnue',
        channel.quality && channel.quality !== 'AUTO' ? channel.quality : null].filter(Boolean).join(' · ') }));
    this.mireHost = h('div', { class: 'mire-host' });

    const stage = h('div', { class: 'player-stage' },
      this.video,
      h('div', { class: 'player-top' },
        h('div', {},
          h('div', { class: 'player-live' }, h('i', { 'aria-hidden': 'true' }), COPY.player.live),
          h('div', { class: 'player-title', text: channel.name }),
          h('div', { class: 'player-sub', text: `Chaîne ${channel.number} · ${channel.categoryLabel || 'Catégorie inconnue'}` })),
        h('div', { style: { display: 'flex', gap: '8px' } }, favBtn, this.closeBtn)),
      this.osd,
      this.mireHost,
      this.liveRegion = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' }),
      h('div', { class: 'player-controls' },
        h('button', { class: 'player-btn', type: 'button', 'aria-label': COPY.actions.previous, disabled: this.queue.length < 2, onClick: () => this.zap(-1) }, icon('prev', 18)),
        this.playBtn,
        h('button', { class: 'player-btn', type: 'button', 'aria-label': COPY.actions.next, disabled: this.queue.length < 2, onClick: () => this.zap(1) }, icon('next', 18)),
        h('div', { class: 'volume' }, this.muteBtn, this.volumeRange),
        h('span', { class: 'spacer' }),
        qualitySelect,
        h('button', { class: 'player-btn', type: 'button', 'aria-label': 'Image dans l’image', onClick: () => this.pictureInPicture() }, icon('pip', 18)),
        h('button', { class: 'player-btn', type: 'button', 'aria-label': 'Plein écran', onClick: () => this.fullscreen() }, icon('full', 18)),
        h('button', { class: 'player-btn', type: 'button', 'aria-label': 'Raccourcis du lecteur', onClick: () => this.showShortcuts() }, icon('settings', 18))));

    this.overlay = h('div', { class: 'player-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Lecteur : ${channel.name}` }, stage);
    this.ensureRoot().replaceChildren(this.overlay);

    this.bindMediaEvents();
    this.bindKeys();
    this.bindGestures(stage);
    this.setState('PREPARING');
    if (this.channel.blocked) {
      this.setState('BLOCKED');
      this.showMire(this.mireForBlocked(this.channel.blocked), this.channel);
      return;
    }
    if (!this.channel.url) {
      this.setState('ERROR');
      this.showMire('P-11', this.channel);
      return;
    }
    if (!navigator.onLine) {
      this.setState('BLOCKED');
      this.showMire('P-09', this.channel);
      return;
    }
    if (isHttps && String(this.channel.url).startsWith('http:')) {
      this.setState('BLOCKED');
      this.showMire('P-01', this.channel);
      return;
    }
    this.startPlayback(this.channel.url);
  }

  startPlayback(url) {
    const video = this.video;
    const canNative = video.canPlayType('application/vnd.apple.mpegurl');
    const isHls = /\.m3u8(\?|$)/i.test(url);
    this.clearTimers();

    // Garde-fou : 15 s sans image = source muette (P-10).
    this.manifestTimer = setTimeout(() => {
      if (this.state === 'PREPARING') {
        this.setState('ERROR');
        this.showMire('P-10', this.channel);
      }
    }, 15_000);

    if (isHls && window.Hls && window.Hls.isSupported()) {
      try {
        this.hls = new window.Hls({
          enableWorker: false, // évite tout blob: sous CSP stricte
          lowLatencyMode: true,
          backBufferLength: 30,
          maxBufferLength: 20,
          manifestLoadingTimeOut: 12_000,
          manifestLoadingMaxRetry: 0,
          levelLoadingMaxRetry: 0,
          fragLoadingMaxRetry: 0,
        });
        this.hls.loadSource(url);
        this.hls.attachMedia(video);
        this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => this.attemptAutoplay());
        this.hls.on(window.Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          this.handleFatalError(data);
        });
      } catch {
        this.setState('ERROR');
        this.showMire('P-12', this.channel);
      }
      return;
    }

    if (isHls && !window.Hls && !canNative) {
      this.setState('ERROR');
      this.showMire('P-08', this.channel);
      return;
    }

    // MP4, ou HLS natif (Safari/iOS), ou HLS sans hls.js mais support natif.
    video.src = url;
    video.addEventListener('loadedmetadata', () => this.attemptAutoplay(), { once: true });
    video.addEventListener('error', () => this.handleMediaError(), { once: true });
  }

  attemptAutoplay() {
    if (this.state === 'BLOCKED') return;
    const promise = this.video.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch((error) => {
        if (error && error.name === 'NotAllowedError') {
          this.setState('PAUSED');
          this.showMire('P-07', this.channel);
        } else if (error && error.name === 'NotSupportedError') {
          this.setState('ERROR');
          this.showMire('P-06', this.channel);
        }
        // AbortError : changement de source pendant la lecture, sans conséquence.
      });
    }
  }

  handleFatalError(data) {
    clearTimeout(this.manifestTimer);
    const code = data.response?.code || 0;
    if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
      if (code === 403) return this.fail('P-05');
      if (code === 404 || code === 410) return this.fail('P-04');
      if (code === 0) return this.fail('P-03');
      return this.fail('P-04');
    }
    if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) return this.fail('P-06');
    return this.fail('P-12');
  }

  handleMediaError() {
    clearTimeout(this.manifestTimer);
    const error = this.video.error;
    if (!error) return this.fail('P-12');
    if (error.code === 4) return this.fail('P-06');
    if (error.code === 2) return this.fail('P-04');
    return this.fail('P-12');
  }

  /** Une seule reprise automatique, sans boucle (BUG-05). */
  fail(code) {
    const params = { nom: this.channel?.name || '', code: code === 'P-12' ? 'PLAY-12' : '' };
    if (RETRYABLE.has(code) && this.attempts < 1) {
      this.attempts += 1;
      this.setState('RETRYING');
      this.setMireState(`Nouvelle tentative…`, 'La source n’a pas répondu. Une seconde tentative est en cours.');
      this.retryTimer = setTimeout(() => {
        this.hideMire();
        this.releaseEngine();
        this.setState('PREPARING');
        this.startPlayback(this.channel.url);
      }, 800);
      return;
    }
    this.setState('ERROR');
    this.showMire(code, params);
  }

  releaseEngine() {
    if (this.hls) {
      try { this.hls.destroy(); } catch { /* déjà détruit */ }
      this.hls = null;
    }
    try { this.video?.removeAttribute('src'); this.video?.load(); } catch { /* sans objet */ }
  }

  /** Annonce vocale discrète : jamais de doublon, jamais de texte technique. */
  announce(message) {
    if (!this.liveRegion) return;
    this.liveRegion.textContent = '';
    const text = String(message || '').trim();
    if (!text) return;
    setTimeout(() => { if (this.liveRegion) this.liveRegion.textContent = text; }, 40);
  }

  setMireState(title, explanation) {
    this.mireHost.replaceChildren(h('div', { class: 'mire' },
      h('div', { class: 'mire-inner' },
        h('div', { class: 'mire-icon' }, icon('retry', 26)),
        h('p', { class: 'mire-code', text: 'Nouvelle tentative' }),
        h('h2', { text: title }),
        h('p', { text: explanation }))));
    this.osd.dataset.hidden = 'true';
    this.mireVisible = true;
    this.announce(`${title}. ${explanation}`);
  }

  hideMire() {
    this.mireHost.replaceChildren();
    this.mireVisible = false;
    if (this.osd) this.osd.dataset.hidden = 'false';
  }

  mireForBlocked(blocked) {
    return { 'mixed-content': 'P-01', 'ua-required': 'P-02', geo: 'P-05', dead: 'P-04', manual: 'P-11' }[blocked] || 'P-12';
  }

  showMire(code, params = {}) {
    const mire = MIRES[code] || MIRES['P-12'];
    try { this.video.pause(); this.video.muted = true; } catch { /* rien à couper */ }
    const explanation = mire.explanation.replace('{nom}', params.nom || this.channel?.name || 'cette chaîne')
      .replace('{code}', params.code || code);
    // §7.3 : une mire propose toujours au moins deux actions. Les tables du §8.3 n'en listent
    // parfois qu'une (P-02, P-05) : « Copier le lien » complète alors sans contredire le texte.
    const actionIds = [...mire.actions];
    if (actionIds.length < 2) actionIds.push('copy');
    const actions = actionIds.map((action) => this.mireAction(action));
    this.mireHost.replaceChildren(h('div', { class: 'mire', role: 'alertdialog', 'aria-label': mire.title },
      h('div', { class: 'mire-inner' },
        h('div', { class: 'mire-icon' }, icon('alert', 26)),
        h('p', { class: 'mire-code', text: mire.code }),
        h('h2', { text: mire.title }),
        h('p', { text: explanation }),
        h('div', { class: 'mire-actions' }, actions))));
    this.osd.dataset.hidden = 'true';
    this.mireVisible = true;
    this.announce(`${mire.title}. ${explanation}`);
    this.setState(code === 'P-07' ? 'PAUSED' : 'ERROR');
  }

  mireAction(action) {
    const label = {
      next: COPY.actions.next, retry: COPY.actions.retry, copy: COPY.actions.copy,
      report: COPY.actions.report, admin: COPY.actions.admin, reload: COPY.actions.reload,
      play: '▶ ' + COPY.actions.watch,
    }[action] || action;
    const primary = action === 'retry' || action === 'play' || action === 'next';
    return h('button', {
      class: `btn ${primary ? 'btn-primary' : 'btn-ghost'}`, type: 'button',
      onClick: () => {
        if (action === 'next') this.zap(1);
        if (action === 'retry' || action === 'play') { this.attempts = 0; this.hideMire(); this.releaseEngine(); this.setState('PREPARING'); this.startPlayback(this.channel.url); }
        if (action === 'copy') copyText(this.channel.url).then((ok) => toast(ok ? 'Lien copié.' : 'Copie impossible sur ce navigateur.', { tone: ok ? 'success' : 'error' }));
        if (action === 'report') window.location.assign(`/signaler?chaine=${encodeURIComponent(this.channel.name)}&id=${this.channel.id}`);
        if (action === 'admin') window.location.assign('/admin');
        if (action === 'reload') window.location.reload();
      },
    }, label);
  }

  bindMediaEvents() {
    const video = this.video;
    video.addEventListener('playing', () => {
      clearTimeout(this.manifestTimer);
      this.attempts = 0;
      this.setState('PLAYING');
      this.hideMire();
      this.showOsd();
    });
    video.addEventListener('pause', () => {
      if (this.state === 'PLAYING') this.setState('PAUSED');
      this.playBtn?.replaceChildren(icon('play', 20));
    });
    video.addEventListener('play', () => this.playBtn?.replaceChildren(icon('pause', 20)));
    /* Tampon réseau : ni erreur ni lecture — l'état BUFFERING est signalé une seule fois. */
    video.addEventListener('waiting', () => {
      if (this.state === 'PLAYING' && !this.mireVisible) {
        this.setState('BUFFERING');
        this.announce('Mise en mémoire du flux…');
      }
    });
    video.addEventListener('stalled', () => {
      if (this.state === 'PLAYING') this.setState('BUFFERING');
    });
    video.addEventListener('canplay', () => {
      if (this.state === 'BUFFERING') this.setState('PLAYING');
    });
    video.addEventListener('ended', () => { this.setState('ENDED'); this.zap(1); });
    video.addEventListener('volumechange', () => {
      prefs.setVolume(video.volume);
      prefs.setMuted(video.muted);
      this.muteBtn?.setAttribute('aria-pressed', String(video.muted));
      this.muteBtn?.replaceChildren(icon(video.muted ? 'mute' : 'volume', 18));
      if (this.volumeRange) this.volumeRange.value = String(video.volume);
    });
    video.addEventListener('click', () => this.toggle());
    video.addEventListener('dblclick', () => this.fullscreen());
    video.addEventListener('mousemove', () => this.showOsd());
  }

  bindKeys() {
    this.onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); if (document.fullscreenElement) document.exitFullscreen?.(); else this.close(); return; }
      const target = event.target;
      const typing = target && (target.closest('input, textarea, select, [contenteditable="true"]'));
      if (typing) return; // BUG-03 : aucun raccourci dans un champ
      if (event.key === ' ' || event.key.toLowerCase() === 'k') { event.preventDefault(); this.toggle(); return; }
      if (event.key === 'm') { this.toggleMute(); return; }
      if (event.key === 'f') { this.fullscreen(); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); this.setVolume(Math.min(1, this.video.volume + 0.1)); return; }
      if (event.key === 'ArrowDown') { event.preventDefault(); this.setVolume(Math.max(0, this.video.volume - 0.1)); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); this.zap(1); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); this.zap(-1); return; }
      if (/^[0-9]$/.test(event.key)) {
        this.digitBuffer += event.key;
        clearTimeout(this.digitTimer);
        this.digitTimer = setTimeout(() => {
          const number = Number(this.digitBuffer);
          this.digitBuffer = '';
          if (number > 0) this.jumpToNumber(number);
        }, 900);
      }
    };
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  /**
   * Gestes tactiles : un tap affiche ou masque l'OSD, un glissement vertical règle le volume,
   * un glissement horizontal change de chaîne. Les commandes de la barre gardent la main :
   * le geste ne s'arme que sur la surface vidéo.
   */
  bindGestures(stage) {
    if (!stage || !this.video) return;
    this.gesture = { x: 0, y: 0, time: 0, volume: 0, armed: false, moved: false };
    const surface = this.video;

    const begin = (event) => {
      if (event.pointerType === 'mouse') return; // souris : les commandes suffisent
      const point = event.touches ? event.touches[0] : event;
      this.gesture = {
        x: point.clientX, y: point.clientY, time: Date.now(),
        volume: this.video.volume, armed: true, moved: false,
      };
    };

    const move = (event) => {
      const gesture = this.gesture;
      if (!gesture?.armed) return;
      const point = event.touches ? event.touches[0] : event;
      const dx = point.clientX - gesture.x;
      const dy = point.clientY - gesture.y;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      gesture.moved = true;
      if (Math.abs(dy) > Math.abs(dx)) {
        // Volume relatif à la position de départ : 1 % par pixel, borné à [0 ; 1].
        this.setVolume(gesture.volume - dy / 240);
        this.showOsd(`Volume ${Math.round(this.video.volume * 100)} %`);
      }
      if (event.cancelable) event.preventDefault();
    };

    const end = (event) => {
      const gesture = this.gesture;
      if (!gesture?.armed) return;
      gesture.armed = false;
      const point = event.changedTouches ? event.changedTouches[0] : event;
      const dx = (point?.clientX ?? gesture.x) - gesture.x;
      const dy = (point?.clientY ?? gesture.y) - gesture.y;
      const elapsed = Date.now() - gesture.time;
      if (gesture.moved && Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy)) {
        this.zap(dx < 0 ? 1 : -1);
        this.showOsd(dx < 0 ? COPY.actions.next : COPY.actions.previous);
        return;
      }
      if (!gesture.moved && elapsed < 400) {
        // Un tap sur l'image : l'OSD s'affiche, puis s'efface s'il était déjà visible.
        if (this.osd?.dataset.hidden === 'false') this.hideOsd();
        else this.showOsd();
      }
    };

    surface.addEventListener('touchstart', begin, { passive: true });
    surface.addEventListener('touchmove', move, { passive: false });
    surface.addEventListener('touchend', end, { passive: true });
    this.detachGestures = () => {
      surface.removeEventListener('touchstart', begin);
      surface.removeEventListener('touchmove', move);
      surface.removeEventListener('touchend', end);
    };
    void stage;
  }

  setVolume(value) {
    if (!this.video) return;
    this.video.volume = Math.min(1, Math.max(0, value));
    this.video.muted = false;
  }

  toggleMute() {
    if (!this.video) return;
    this.video.muted = !this.video.muted;
  }

  toggle() {
    if (!this.video) return;
    if (this.state === 'ERROR' || this.state === 'BLOCKED') return;
    if (this.video.paused) {
      this.hideMire();
      this.video.play().catch(() => this.showMire('P-07', this.channel));
    } else {
      this.video.pause();
    }
  }

  showOsd(message = '') {
    if (!this.osd) return;
    if (this.mireHost?.childElementCount) return;
    if (message) {
      clearTimeout(this.osdNoteTimer);
      const note = this.osd.querySelector('.osd-note') || h('em', { class: 'osd-note' });
      note.textContent = message;
      if (!note.isConnected) this.osd.append(note);
      this.osdNoteTimer = setTimeout(() => note.remove(), 1400);
    }
    this.osd.dataset.hidden = 'false';
    clearTimeout(this.osdTimer);
    this.osdTimer = setTimeout(() => {
      if (this.osd && this.state === 'PLAYING') this.osd.dataset.hidden = 'true';
    }, 3800);
  }

  hideOsd() {
    if (!this.osd) return;
    clearTimeout(this.osdTimer);
    this.osd.dataset.hidden = 'true';
  }

  async zap(direction) {
    if (this.queue.length < 2) return;
    const nextIndex = (this.index + direction + this.queue.length) % this.queue.length;
    const id = this.queue[nextIndex];
    if (!id) return;
    try {
      const { channel } = await api(`/api/channels/${id}`);
      this.index = nextIndex;
      await this.mount(channel);
    } catch (error) {
      toast(error.message || 'Chaîne introuvable.', { tone: 'error' });
    }
  }

  async jumpToNumber(number) {
    try {
      // Les numéros ne sont pas contigus : on passe par l'index de recherche, qui remonte
      // d'abord la chaîne portant exactement ce numéro (score +50, cf. F-18).
      const list = await api(`/api/channels/search?q=${encodeURIComponent(String(number))}&pageSize=24`);
      const found = list.channels.find((item) => item.number === number) || list.channels[0];
      if (!found) {
        toast(`Aucune chaîne au numéro ${number}.`, { tone: 'info' });
        return;
      }
      this.queue = list.channels.map((item) => item.id);
      this.index = this.queue.indexOf(found.id);
      const { channel } = await api(`/api/channels/${found.id}`);
      await this.mount(channel);
    } catch (error) {
      toast(error.message || 'Numéro injoignable.', { tone: 'error' });
    }
  }

  async switchQuality(url) {
    if (!url || !this.video) return;
    this.setState('PREPARING');
    this.attempts = 0;
    this.hideMire();
    this.releaseEngine();
    this.startPlayback(url);
  }

  pictureInPicture() {
    if (document.pictureInPictureEnabled && this.video?.requestPictureInPicture) {
      this.video.requestPictureInPicture().catch(() => toast('L’image dans l’image n’est pas disponible ici.', { tone: 'info' }));
    } else {
      toast('L’image dans l’image n’est pas prise en charge par ce navigateur.', { tone: 'info' });
    }
  }

  fullscreen() {
    if (!this.overlay) return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else this.overlay.requestFullscreen?.().catch(() => toast('Le plein écran est refusé par le navigateur.', { tone: 'info' }));
  }

  showShortcuts() {
    const list = COPY.player.shortcuts.map(([keys, label]) => h('div', { class: 'variant' },
      h('span', {}, h('span', { class: 'kbd', text: keys })),
      h('span', { class: 'muted', text: label })));
    import('./ui.js').then(({ modal }) => {
      const box = modal({ title: 'Raccourcis du lecteur', body: h('div', {}, list) });
      return box;
    });
  }

  setState(state) {
    this.state = state;
    if (this.video) {
      if (state === 'PLAYING') this.video.dataset.state = 'playing';
      else this.video.dataset.state = state.toLowerCase();
    }
  }

  clearTimers() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.manifestTimer);
    clearTimeout(this.osdTimer);
    clearTimeout(this.osdNoteTimer);
  }

  teardown(closeOverlay = true) {
    this.clearTimers();
    clearTimeout(this.digitTimer);
    if (this.onKeyDown) document.removeEventListener('keydown', this.onKeyDown, true);
    this.onKeyDown = null;
    this.detachGestures?.();
    this.detachGestures = null;
    this.releaseEngine();
    if (this.video) {
      try { this.video.pause(); } catch { /* déjà arrêté */ }
      this.video.replaceChildren?.();
      this.video.removeAttribute('src');
      this.video.load?.();
    }
    if (closeOverlay && this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    document.body.style.overflow = this.previousOverflow || '';
    this.video = null;
    this.hls = null;
    this.setState('IDLE');
    if (this.previousFocus && this.previousFocus.focus) {
      try { this.previousFocus.focus(); } catch { /* élément disparu */ }
    }
  }

  close() {
    const channelName = this.channel?.name;
    this.teardown(true);
    this.channel = null;
    if (this.onClose) this.onClose(channelName);
  }
}

let instance = null;
export function getPlayer() {
  if (!instance) instance = new Player();
  return instance;
}
