// server/core/team.js — comptes d'équipe, rôles et permissions (3.9.0).
// Le propriétaire garde le mot de passe historique ; chaque membre a son propre compte.
// Une permission non accordée est refusée avant le corps de la route, jamais dans l'interface seule.

import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './auth.js';
import { AppError, requireField } from './errors.js';

/** Permissions élémentaires. Elles nomment une action, pas un écran. */
export const PERMISSIONS = [
  'catalogue.read',
  'catalogue.write',
  'catalogue.delete',
  'import',
  'settings',
  'team',
  'reports',
  'analytics',
  'diagnostic',
  'backup',
];

/** Quatre rôles lisibles, du plus large au plus étroit. */
export const ROLES = {
  proprietaire: {
    label: 'Propriétaire',
    description: 'Tous les droits, y compris la gestion des comptes.',
    permissions: PERMISSIONS,
  },
  administrateur: {
    label: 'Administrateur',
    description: 'Tout le catalogue, les réglages et les sauvegardes, sans gérer les comptes.',
    permissions: PERMISSIONS.filter((permission) => permission !== 'team'),
  },
  editeur: {
    label: 'Éditeur',
    description: 'Ajoute, corrige et remplace les liens, importe des listes, consulte les indicateurs.',
    permissions: ['catalogue.read', 'catalogue.write', 'import', 'diagnostic', 'analytics'],
  },
  moderateur: {
    label: 'Modérateur',
    description: 'Traite les signalements et masque une chaîne signalée.',
    permissions: ['catalogue.read', 'catalogue.write', 'reports', 'diagnostic'],
  },
  analyste: {
    label: 'Analyste',
    description: 'Lecture seule : catalogue, diagnostics et statistiques.',
    permissions: ['catalogue.read', 'analytics', 'diagnostic'],
  },
};

export const ROLE_IDS = Object.keys(ROLES);

export const roleLabel = (role) => ROLES[role]?.label || 'Rôle inconnu';

/** Un rôle accorde-t-il cette permission précise ? */
export function can(role, permission) {
  return Boolean(ROLES[role]?.permissions.includes(permission));
}

/** Le propriétaire existe toujours, même sans compte enregistré. */
export function ownerSession() {
  return { role: 'proprietaire', memberId: '', memberName: 'Propriétaire' };
}

/** Vue publique d'un membre : jamais l'empreinte du mot de passe. */
export function publicMember(member) {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    roleLabel: roleLabel(member.role),
    permissions: ROLES[member.role]?.permissions || [],
    disabled: Boolean(member.disabled),
    createdAt: member.createdAt,
    lastLoginAt: member.lastLoginAt || '',
  };
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 120);
}

export function assertEmail(value) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
    throw new AppError('ERR-04', { field: 'email', params: { champ: 'adresse e-mail' } });
  }
  return email;
}

export function assertRole(value) {
  const role = String(value || '').trim();
  if (!ROLES[role] || role === 'proprietaire') {
    throw new AppError('ERR-04', { field: 'role', params: { champ: 'rôle' } });
  }
  return role;
}

/** Crée un membre : identifiant stable, empreinte scrypt, aucun mot de passe en clair. */
export async function buildMember({ name, email, role, password }) {
  const label = requireField(name, 'name', 'nom du membre', { max: 60 });
  const address = assertEmail(email);
  const chosen = assertRole(role);
  const secret = String(password || '');
  if (secret.length < 10) {
    throw new AppError('ERR-04', { field: 'password', params: { champ: 'mot de passe' } });
  }
  const { passwordHash, salt, iterations } = await hashPassword(secret);
  return {
    id: `m-${randomBytes(6).toString('hex')}`,
    name: label,
    email: address,
    role: chosen,
    passwordHash,
    salt,
    iterations,
    disabled: false,
    createdAt: new Date().toISOString(),
    lastLoginAt: '',
  };
}

export async function checkMemberPassword(member, password) {
  if (!member || member.disabled) return false;
  return verifyPassword(password, { passwordHash: member.passwordHash, salt: member.salt, iterations: member.iterations });
}

export function findMember(members, email) {
  const address = normalizeEmail(email);
  if (!address) return null;
  return (members || []).find((member) => normalizeEmail(member.email) === address) || null;
}
