// server/api/public.js — EP-01 → EP-09 + session et catalogue des messages.
// Aucune route publique ne peut renvoyer une chaîne masquée (THR-06, ER-X12).

import { CATEGORIES, LIMITS, SPEC_VERSION, VERSION } from '../core/constants.js';
import { AppError, ERRORS } from '../core/errors.js';
import { isPublic, projectCard, projectDetail } from '../core/channels.js';
import { buildPredicate, paginate, sortChannels } from '../core/search.js';
import { normalizeQuery } from '../core/text.js';
import { queryInt, queryString } from '../http/router.js';

function publicChannels(app) {
  return app.store.channels.filter((channel) => isPublic(channel, app.store.settings));
}

function categoryCounts(app) {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category.id, 0]));
  for (const channel of app.store.channels) {
    if (!isPublic(channel, app.store.settings)) continue;
    counts[channel.category] = (counts[channel.category] || 0) + 1;
  }
  return counts;
}

function resolveHero(app, visible) {
  const settings = app.store.settings;
  const featuredOrder = (settings.featuredIds || [])
    .map((id) => visible.find((channel) => channel.id === id))
    .filter(Boolean);
  if (settings.heroMode === 'first') {
    return { mode: 'first', channels: visible.slice(0, 4).map(projectCard) };
  }
  if (settings.heroMode === 'featured') {
    const list = featuredOrder.length ? featuredOrder : visible.filter((channel) => channel.featured);
    if (list.length) return { mode: 'featured', channels: list.slice(0, 4).map(projectCard) };
  }
  // Sélection quotidienne stable : la même journée donne le même bandeau.
  const seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const pool = visible.filter((channel) => channel.logo);
  const picked = [];
  const source = pool.length >= 4 ? pool : visible;
  for (let i = 0; i < 4 && source.length; i += 1) {
    picked.push(source[(seed + i * 37) % source.length]);
  }
  return { mode: 'random', channels: picked.map(projectCard) };
}

function listResponse(app, list, { page, pageSize, sort, query }) {
  const sorted = sortChannels(list, sort || app.store.settings.defaultSort);
  const result = paginate(sorted, page, pageSize || app.store.settings.pageSize);
  const all = publicChannels(app);
  return {
    total: result.total,
    page: result.page,
    pages: result.pages,
    pageSize: result.pageSize,
    hasMore: result.hasMore,
    showing: result.items.length,
    channels: result.items.map(projectCard),
    meta: {
      sort: sort || app.store.settings.defaultSort,
      query: query || '',
      catalogTotal: app.store.channels.length,
      visibleTotal: all.length,
      hidden: app.store.channels.length - all.length,
      filters: { category: '', country: '', language: '', quality: '', health: '' },
    },
  };
}

export function registerPublicRoutes(router, app) {
  // EP-01 — état du service.
  router.get('/healthz', () => ({
    // 503 : le service répond mais le catalogue est inexploitable (supervision, AC-102).
    status: app.store.error ? 503 : 200,
    body: {
      status: app.store.error ? 'degraded' : 'ok',
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      channels: app.store.channels.length,
      visible: publicChannels(app).length,
      maintenance: Boolean(app.store.settings.maintenanceMode),
      time: new Date().toISOString(),
    },
    cache: 'no-store',
  }));

  // EP-02 — configuration publique.
  router.get('/api/config', () => {
    const settings = app.store.settings;
    const visible = publicChannels(app);
    const counts = categoryCounts(app);
    const featured = visible
      .filter((channel) => channel.featured || (settings.featuredIds || []).includes(channel.id))
      .slice(0, LIMITS.maxFeatured)
      .map(projectCard);
    const adultHidden = app.store.channels.filter((channel) => channel.category === 'adulte' && !isPublic(channel, settings)).length;
    return {
      body: {
        version: VERSION,
        specVersion: SPEC_VERSION,
        brand: settings.brand,
        tagline: settings.tagline,
        accent: settings.accent,
        logoUrl: settings.logoUrl,
        pageSize: settings.pageSize,
        defaultSort: settings.defaultSort,
        showHealthBadge: settings.showHealthBadge,
        footerNote: settings.footerNote,
        maintenanceMode: settings.maintenanceMode,
        heroMode: settings.heroMode,
        showAdult: settings.showAdult,
        autoHideAdult: settings.autoHideAdult,
        confidenceFloor: settings.confidenceFloor,
        epgUrl: settings.epgUrl,
        categories: CATEGORIES.map((category) => ({ ...category, count: counts[category.id] || 0 })),
        totals: {
          catalog: app.store.channels.length,
          visible: visible.length,
          hidden: app.store.channels.length - visible.length,
          adultHidden,
          target: settings.targetTable || app.store.channels.length,
        },
        health: app.store.healthCounts(),
        hero: resolveHero(app, visible),
        featured,
        defaultPassword: app.auth.isDefaultPasswordActive(),
        notices: app.notices(),
        legal: {
          mention: 'StreamTV diffuse des flux fournis par leurs ayants droit. Ce site n’héberge aucun contenu vidéo.',
          links: [
            { id: 'mentions-legales', title: 'Mentions légales', href: '/mentions-legales' },
            { id: 'confidentialite', title: 'Confidentialité', href: '/confidentialite' },
            { id: 'signalement', title: 'Signaler un contenu', href: '/signaler' },
            { id: 'aide', title: 'Aide & raccourcis', href: '/aide' },
          ],
        },
        time: new Date().toISOString(),
      },
      cache: 'public, max-age=20',
    };
  });

  // EP-03 — liste paginée.
  router.get('/api/channels', ({ query }) => {
    const settings = app.store.settings;
    const filters = {
      category: queryString(query, 'category', { max: 24 }),
      country: queryString(query, 'country', { max: 2 }).toUpperCase(),
      language: queryString(query, 'language', { max: 8 }).toLowerCase(),
      quality: queryString(query, 'quality', { max: 4 }).toUpperCase(),
      health: queryString(query, 'health', { max: 8 }).toLowerCase(),
      featured: query.featured === 'true' ? true : query.featured === 'false' ? false : undefined,
      visibility: 'public',
    };
    let list = app.store.channels.filter(buildPredicate(filters, settings));
    const q = normalizeQuery(queryString(query, 'q', { max: LIMITS.searchMaxLength }));
    if (q) list = app.index.search(q, (channel) => isPublic(channel, settings));
    const body = listResponse(app, list, {
      page: queryInt(query, 'page', { min: 1, max: LIMITS.maxPage }),
      pageSize: queryInt(query, 'pageSize', { min: 1, max: LIMITS.pageSizeMax, fallback: settings.pageSize }),
      sort: queryString(query, 'sort', { max: 12 }),
      query: q,
    });
    body.meta.filters = filters;
    return { body, cache: 'public, max-age=15' };
  });

  // EP-04 — fiche d'une chaîne.
  router.get('/api/channels/:id', ({ params }) => {
    const settings = app.store.settings;
    const channel = app.store.channels.find((item) => item.id === params.id);
    if (!channel || !isPublic(channel, settings)) throw new AppError('ERR-10');
    const related = app.store.channels
      .filter((item) => item.id !== channel.id && item.category === channel.category && isPublic(item, settings))
      .slice(0, 8)
      .map(projectCard);
    return {
      body: {
        channel: projectDetail(channel, settings, app.siteProtocol),
        related,
        variants: channel.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          quality: variant.quality,
          health: variant.health?.status || 'unknown',
        })),
      },
      cache: 'public, max-age=20',
    };
  });

  // EP-05 — recherche accent-insensible.
  router.get('/api/channels/search', ({ query }) => {
    const settings = app.store.settings;
    const q = normalizeQuery(queryString(query, 'q', { max: LIMITS.searchMaxLength }));
    const filters = {
      category: queryString(query, 'category', { max: 24 }),
      country: queryString(query, 'country', { max: 2 }).toUpperCase(),
      language: queryString(query, 'language', { max: 8 }).toLowerCase(),
      quality: queryString(query, 'quality', { max: 4 }).toUpperCase(),
      visibility: 'public',
    };
    // EP-05 exige un terme : sans lui, mieux vaut un refus explicite qu'une liste trompeuse.
    if (!q) throw new AppError('ERR-02', { field: 'q', params: { champ: 'terme recherché' } });
    const predicate = buildPredicate(filters, settings);
    const list = app.index.search(q, predicate);
    const body = listResponse(app, list, {
      page: queryInt(query, 'page', { min: 1, max: LIMITS.maxPage }),
      pageSize: queryInt(query, 'pageSize', { min: 1, max: LIMITS.pageSizeMax, fallback: settings.pageSize }),
      sort: queryString(query, 'sort', { max: 12 }),
      query: q,
    });
    if (q && !body.total) body.meta.suggestions = app.index.suggestions(q);
    body.meta.filters = filters;
    return { body, cache: 'public, max-age=10' };
  });

  // EP-06 — catégories et compteurs.
  router.get('/api/categories', () => {
    const counts = categoryCounts(app);
    return {
      body: {
        categories: CATEGORIES.map((category) => ({ ...category, count: counts[category.id] || 0 })),
        total: publicChannels(app).length,
      },
      cache: 'public, max-age=30',
    };
  });

  // EP-07 — mentions et cadre légal.
  router.get('/api/legal', () => ({
    body: {
      mention: 'StreamTV diffuse des flux fournis par leurs ayants droit. Ce site n’héberge aucun contenu vidéo.',
      hosting: 'Aucun fichier vidéo n’est hébergé ni retransmis par ce service : seuls les liens publics fournis par les sources sont référencés.',
      licenseNote: 'Chaque chaîne porte une justification des droits. Une chaîne sans justification est masquée. Une demande crédible déclenche un retrait sous 72 heures ouvrées.',
      report: {
        title: 'Signaler un contenu',
        delay: '72 heures ouvrées',
        procedure: 'Indiquez le nom exact de la chaîne, son numéro et le motif du signalement. La chaîne est masquée immédiatement à réception.',
      },
      privacy: {
        storage: 'Aucun compte visiteur. Les favoris, l’historique et le volume sont stockés dans votre navigateur, jamais sur le serveur.',
        logs: 'Les journaux techniques sont conservés 14 jours, le journal d’audit 90 jours, sans adresse IP pour les visiteurs.',
        cookies: 'Aucun cookie de mesure d’audience, aucun traceur tiers, aucun profil publicitaire.',
      },
      sources: (app.store.sources || []).map((source) => ({ name: source.name, url: source.url, licence: 'Liste publique fournie par la source' })),
      updatedAt: new Date().toISOString(),
    },
    cache: 'public, max-age=3600',
  }));

  // EP-08 — guide des programmes.
  router.get('/api/epg', () => {
    const url = app.store.settings.epgUrl;
    if (!url) {
      return {
        body: {
          enabled: false,
          message: 'Aucun guide des programmes n’est configuré. Les chaînes restent regardables ; le guide peut être ajouté dans les réglages.',
        },
        cache: 'public, max-age=60',
      };
    }
    return { body: { enabled: true, url, format: url.endsWith('.gz') ? 'xmltv-gzip' : 'xmltv' }, cache: 'public, max-age=300' };
  });

  // EP-09 — version et empreinte du service.
  router.get('/api/version', () => ({
    body: {
      version: VERSION,
      specVersion: SPEC_VERSION,
      node: process.version,
      startedAt: app.startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      routes: app.routeCount || 0,
      catalog: app.store.channels.length,
      dataUpdatedAt: app.store.loadedAt,
    },
    cache: 'no-store',
  }));

  // Catalogue des messages — utilisé par la page /erreurs et le support.
  router.get('/api/errors/catalog', () => ({
    body: {
      errors: Object.entries(ERRORS).map(([code, entry]) => ({ code, status: entry.status, message: entry.message })),
      count: Object.keys(ERRORS).length,
      goldenRule: 'Aucun message d’erreur n’est affiché sans action concrète.',
    },
    cache: 'public, max-age=3600',
  }));

  // Session courante.
  router.get('/api/session', ({ req }) => {
    const token = /^Bearer\s+([a-f0-9]{48})$/i.exec(String(req.headers.authorization || ''))?.[1] || '';
    const session = token ? app.sessions.touch(token) : null;
    return {
    body: {
      signedIn: Boolean(session),
      expiresAt: session ? new Date(session.expiresAt).toISOString() : null,
      defaultPassword: app.auth.isDefaultPasswordActive(),
      sessions: app.sessions.count(),
    },
    cache: 'no-store',
    };
  });

  // Connexion.
  router.post('/api/login', async ({ body, ip, req }) => {
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!password) throw new AppError('ERR-02', { field: 'password', params: { champ: 'mot de passe' } });
    if (password.length > 200) throw new AppError('ERR-04', { field: 'password', params: { champ: 'mot de passe' } });
    const guard = app.loginGuard.check(ip);
    if (!guard.allowed) {
      throw new AppError('ERR-17', {
        params: { n: Math.max(1, Math.ceil(guard.retryAfterSeconds / 60)) },
        headers: { 'Retry-After': String(guard.retryAfterSeconds) },
      });
    }
    const valid = await app.auth.verify(password);
    if (!valid) {
      app.loginGuard.fail(ip);
      await app.store.audit('login.fail', { ip, result: 'refus' });
      throw new AppError('ERR-08');
    }
    app.loginGuard.success(ip);
    const session = app.sessions.create({ ip, userAgent: req.headers['user-agent'] || '' });
    await app.store.audit('login.success', { ip });
    return {
      body: {
        token: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
        defaultPassword: app.auth.isDefaultPasswordActive(),
        message: 'Connexion réussie.',
      },
      cache: 'no-store',
    };
  });

  // Déconnexion.
  router.post('/api/logout', ({ session, req, ip }) => {
    const header = String(req.headers.authorization || '');
    const token = /^Bearer\s+([a-f0-9]{48})$/i.exec(header)?.[1] || '';
    if (token) app.sessions.revoke(token);
    if (session) app.store.audit('logout', { ip });
    return { status: 200, body: { message: 'Déconnecté.' }, cache: 'no-store' };
  });
}
