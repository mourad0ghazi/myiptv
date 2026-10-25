// server/http/respond.js — en-têtes de sécurité (§10), compression (BUG-13), réponses JSON et fichiers.
// Toutes les réponses passent par ce module : aucun en-tête n'est ajouté ailleurs.

import { brotliCompressSync, gzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { ERRORS, errorMessage } from '../core/errors.js';

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https: http:",
    "connect-src 'self' https: http:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    'upgrade-insecure-requests',
  ].join('; '),
  'X-DNS-Prefetch-Control': 'off',
};

export const HSTS = 'max-age=31536000; includeSubDomains';

export function newRequestId() {
  return randomBytes(6).toString('hex');
}

export function sendSecurityHeaders(res, { https = false } = {}) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  if (https) res.setHeader('Strict-Transport-Security', HSTS);
}

function accepts(req, encoding) {
  const header = String(req.headers['accept-encoding'] || '').toLowerCase();
  return header.includes(encoding);
}

export function maybeCompress(req, res, payloadBuffer) {
  if (!payloadBuffer || payloadBuffer.length < 1024) return payloadBuffer;
  res.setHeader('Vary', 'Accept-Encoding');
  if (accepts(req, 'br')) {
    const compressed = brotliCompressSync(payloadBuffer, {
      params: { 1: 11, 2: 22 }, // qualité 11, fenêtre 4 Mo
    });
    if (compressed.length < payloadBuffer.length) {
      res.setHeader('Content-Encoding', 'br');
      return compressed;
    }
  }
  if (accepts(req, 'gzip')) {
    const compressed = gzipSync(payloadBuffer, { level: 9 });
    if (compressed.length < payloadBuffer.length) {
      res.setHeader('Content-Encoding', 'gzip');
      return compressed;
    }
  }
  return payloadBuffer;
}

export function sendJson(req, res, status, body, { cache = 'no-store', headers = {}, requestId = '', head = false } = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  if (requestId) res.setHeader('X-Request-Id', requestId);
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  const encoded = maybeCompress(req, res, payload);
  res.setHeader('Content-Length', String(encoded.length));
  if (head || req.method === 'HEAD') { res.end(); return; }
  res.end(encoded);
}

export function sendText(req, res, status, text, { type = 'text/plain; charset=utf-8', cache = 'no-store', headers = {}, head = false } = {}) {
  const payload = Buffer.from(text);
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache);
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  const encoded = maybeCompress(req, res, payload);
  res.setHeader('Content-Length', String(encoded.length));
  if (head || req.method === 'HEAD') { res.end(); return; }
  res.end(encoded);
}

export function sendBuffer(req, res, status, buffer, { type = 'application/octet-stream', cache = 'no-store', headers = {}, head = false } = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache);
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  const encoded = maybeCompress(req, res, buffer);
  res.setHeader('Content-Length', String(encoded.length));
  if (head || req.method === 'HEAD') { res.end(); return; }
  res.end(encoded);
}

/**
 * Envoie une erreur opposable : {error, code, requestId, field?}.
 * `code` absent du catalogue → ERR-18 (jamais de fuite technique).
 */
export function sendError(req, res, code, { params = {}, field = '', status = null, headers = {}, requestId = '', message = '' } = {}) {
  const entry = ERRORS[code] || ERRORS['ERR-18'];
  const finalCode = ERRORS[code] ? code : 'ERR-18';
  const body = {
    error: message || errorMessage(finalCode, { ...params, requestId: requestId || params.requestId }),
    code: finalCode,
  };
  if (field) body.field = field;
  if (requestId) body.requestId = requestId;
  sendJson(req, res, status || entry.status, body, { cache: 'no-store', headers, requestId });
  return body;
}

export function sendRedirect(res, location, status = 302) {
  res.statusCode = status;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

export function noContent(res) {
  res.statusCode = 204;
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}
