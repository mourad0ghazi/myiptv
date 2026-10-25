// server/core/settings.js — les 17 réglages (§4.5), validés ensemble avant toute écriture (BUG-02).
// Un PATCH refusé ne modifie rien : la validation produit la valeur complète ou une liste d'erreurs.

import { LIMITS, SORTS } from './constants.js';
import { errorMessage } from './errors.js';

export const SETTING_KEYS = [
  'brand', 'tagline', 'accent', 'logoUrl', 'pageSize', 'defaultSort', 'showAdult',
  'autoHideAdult', 'featuredIds', 'heroMode', 'showHealthBadge', 'epgUrl', 'footerNote',
  'maintenanceMode', 'targetTable', 'confidenceFloor', 'pageTitleSuffix',
];

export const DEFAULTS = Object.freeze({
  brand: 'StreamTV',
  tagline: 'Toute ta télévision, dans un seul endroit.',
  accent: '#ff3d71',
  logoUrl: '',
  pageSize: 48,
  defaultSort: 'number',
  showAdult: false,
  autoHideAdult: true,
  featuredIds: [],
  heroMode: 'featured',
  showHealthBadge: true,
  epgUrl: '',
  footerNote: '',
  maintenanceMode: false,
  targetTable: 0,
  confidenceFloor: 0.45,
  pageTitleSuffix: '',
});

const HERO_MODES = ['featured', 'random', 'first'];

export const SCHEMA = [
  { key: 'brand', type: 'text', label: 'Nom du site', minLength: 1, maxLength: 24, help: 'Affiché dans l’en-tête, le pied de page et les titres d’onglet.' },
  { key: 'tagline', type: 'text', label: 'Accroche', minLength: 1, maxLength: 90, help: 'Une phrase courte, visible sur l’accueil.' },
  { key: 'accent', type: 'color', label: 'Couleur d’accent', help: 'Format hexadécimal : #ff3d71.' },
  { key: 'logoUrl', type: 'text', label: 'Logo personnalisé', maxLength: 200, help: 'Adresse HTTPS d’un SVG ou PNG, ou vide pour le logo intégré.' },
  { key: 'pageSize', type: 'number', label: 'Chaînes par page', min: 12, max: 60, step: 12, help: 'Entre 12 et 60. Le plafond protège la mémoire du navigateur (BUG-12).' },
  { key: 'defaultSort', type: 'select', label: 'Tri par défaut', options: [
    { value: 'number', label: 'Numéro de chaîne' },
    { value: 'name', label: 'Nom' },
    { value: 'category', label: 'Catégorie' },
    { value: 'recent', label: 'Ajout récent' },
    { value: 'confidence', label: 'Confiance de classement' },
  ], help: 'S’applique à l’accueil et au guide.' },
  { key: 'showAdult', type: 'boolean', label: 'Afficher la catégorie adulte', help: 'Masquée par défaut. L’afficher reste une décision explicite.' },
  { key: 'autoHideAdult', type: 'boolean', label: 'Masquer automatiquement les chaînes adultes', help: 'Appliqué en plus de « Afficher la catégorie adulte ».' },
  { key: 'featuredIds', type: 'ids', label: 'Chaînes en vedette', max: 8, help: 'Huit identifiants au maximum, dans l’ordre d’affichage.' },
  { key: 'heroMode', type: 'select', label: 'Bandeau d’accueil', options: [
    { value: 'featured', label: 'Chaînes en vedette' },
    { value: 'random', label: 'Sélection quotidienne' },
    { value: 'first', label: 'Premières chaînes' },
  ], help: 'Détermine le bandeau de la page d’accueil.' },
  { key: 'showHealthBadge', type: 'boolean', label: 'Afficher l’état des flux', help: 'Pastille de santé sur les cartes publiques.' },
  { key: 'epgUrl', type: 'text', label: 'Adresse du guide des programmes (XMLTV)', maxLength: 200, help: 'Facultatif. https://…/guide.xml ou .xml.gz.' },
  { key: 'footerNote', type: 'text', label: 'Note de pied de page', maxLength: 200, help: 'Mention libre affichée sous le pied de page.' },
  { key: 'maintenanceMode', type: 'boolean', label: 'Mode maintenance', help: 'Le catalogue reste consultable ; un bandeau prévient les visiteurs.' },
  { key: 'targetTable', type: 'number', label: 'Objectif de catalogue', min: 0, max: 100000, help: '0 = automatique. L’objectif de démonstration du cahier des charges est 12 181 chaînes.' },
  { key: 'confidenceFloor', type: 'number', label: 'Seuil de confiance', min: 0, max: 0.9, step: 0.05, help: 'Sous ce seuil, la chaîne entre dans la file « à vérifier ».' },
  { key: 'pageTitleSuffix', type: 'text', label: 'Suffixe de titre d’onglet', maxLength: 30, help: 'Ajouté après « · Nom du site » dans le titre du navigateur.' },
];

const SCHEMA_BY_KEY = Object.fromEntries(SCHEMA.map((item) => [item.key, item]));

function fail(field, code, params = {}) {
  return { field, code, message: errorMessage(code, params) };
}

function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}

/** Valide un objet complet ; retourne {settings, errors}. */
export function validateSettings(input, { existingIds = null, base = DEFAULTS } = {}) {
  const errors = [];
  const settings = { ...base };
  const source = input && typeof input === 'object' ? input : {};

  for (const key of SETTING_KEYS) {
    if (!(key in source)) continue;
    const spec = SCHEMA_BY_KEY[key];
    const value = source[key];
    switch (spec.type) {
      case 'text': {
        const text = cleanText(value);
        if (spec.minLength && !text) { errors.push(fail(key, 'ERR-02', { champ: spec.label })); break; }
        if (text.length > spec.maxLength) {
          errors.push(fail(key, 'ERR-03', { champ: spec.label, min: 0, max: spec.maxLength }));
          break;
        }
        if (key === 'logoUrl' && text) {
          const isHttps = /^https:\/\/[^\s]+$/i.test(text);
          const isData = /^data:image\/(?:png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/i.test(text) && text.length < 150_000;
          if (!isHttps && !isData) { errors.push(fail(key, 'ERR-04', { champ: spec.label })); break; }
        }
        if (key === 'epgUrl' && text && !/^https:\/\/[^\s]+\.(?:xml|xml\.gz)(?:\?[^\s]*)?$/i.test(text)) {
          errors.push(fail(key, 'ERR-04', { champ: spec.label }));
          break;
        }
        settings[key] = text;
        break;
      }
      case 'color': {
        const text = cleanText(value);
        if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) { errors.push(fail(key, 'ERR-04', { champ: spec.label })); break; }
        settings[key] = text.toLowerCase();
        break;
      }
      case 'number': {
        const number = Number(value);
        if (!Number.isFinite(number)) { errors.push(fail(key, 'ERR-04', { champ: spec.label })); break; }
        if (number < spec.min || number > spec.max) {
          errors.push(fail(key, 'ERR-03', { champ: spec.label, min: spec.min, max: spec.max }));
          break;
        }
        settings[key] = spec.key === 'pageSize' || spec.key === 'targetTable' ? Math.round(number) : Math.round(number * 100) / 100;
        break;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') { errors.push(fail(key, 'ERR-04', { champ: spec.label })); break; }
        settings[key] = value;
        break;
      }
      case 'select': {
        const allowed = spec.options.map((option) => option.value);
        if (!allowed.includes(value)) { errors.push(fail(key, 'ERR-04', { champ: spec.label })); break; }
        settings[key] = value;
        break;
      }
      case 'ids': {
        if (!Array.isArray(value)) { errors.push(fail(key, 'ERR-04', { champ: spec.label })); break; }
        const ids = [...new Set(value.map((item) => cleanText(item)).filter(Boolean))];
        if (ids.length > LIMITS.maxFeatured) {
          errors.push(fail(key, 'ERR-03', { champ: spec.label, min: 0, max: LIMITS.maxFeatured }));
          break;
        }
        if (existingIds) {
          const unknown = ids.find((id) => !existingIds.has(id));
          if (unknown) { errors.push(fail(key, 'ERR-04', { champ: `${spec.label} (${unknown})` })); break; }
        }
        settings[key] = ids;
        break;
      }
      default:
        break;
    }
  }

  // Cohérence transversale : autoHideAdult sans showAdult reste valide (c'est le défaut).
  if (settings.defaultSort && !SORTS.includes(settings.defaultSort)) settings.defaultSort = base.defaultSort;
  if (!HERO_MODES.includes(settings.heroMode)) settings.heroMode = base.heroMode;
  return { settings, errors };
}

/** Charge un fichier de réglages éventuellement ancien : clés inconnues ignorées, valeurs bornées. */
export function normalizeSettings(raw) {
  const { settings } = validateSettings(raw || {}, { base: DEFAULTS });
  return settings;
}

export function schemaForClient() {
  return SCHEMA.map((item) => ({
    key: item.key,
    label: item.label,
    type: item.type,
    min: item.min,
    max: item.max,
    step: item.step,
    options: item.options,
    help: item.help,
    maxLength: item.maxLength,
    default: DEFAULTS[item.key],
  }));
}

export function isDefaultBrand(settings) {
  return settings.brand === DEFAULTS.brand;
}
