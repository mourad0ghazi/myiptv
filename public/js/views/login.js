// public/js/views/login.js · écran 6 : connexion administration, un seul mot de passe.
// Messages d'erreur inline, jamais de fenêtre native ; 429 affiche le délai exact.

import { auth, api, ApiError } from '../api.js';
import { COPY } from '../copy.js';
import { consoleHref, rememberConsole } from '../console.js';
import { h, icon, toast } from '../ui.js';

export function renderLogin(container, ctx) {
  const { navigate } = ctx;
  const params = new URLSearchParams(location.search);
  const next = params.get('next') && params.get('next').startsWith('/') ? params.get('next') : consoleHref();

  const view = h('div', { class: 'view' });
  const form = h('form', { class: 'login-shell', novalidate: true, autocomplete: 'on' });
  const errorBox = h('div', { class: 'banner', dataset: { tone: 'danger' }, hidden: true, role: 'alert' });
  const errorText = h('p', {});
  errorBox.append(icon('alert', 16), errorText);

  // 3.9.0 : un membre d'équipe se connecte avec son e-mail ; le propriétaire peut le laisser vide.
  const email = h('input', {
    type: 'email', id: 'admin-email', name: 'email', autocomplete: 'username', maxlength: '120',
    'aria-describedby': 'email-help', placeholder: 'vous@exemple.com', value: params.get('email') || '',
  });

  const input = h('input', {
    type: 'password', id: 'admin-password', name: 'password', required: true,
    autocomplete: 'current-password', minlength: '1', maxlength: '200',
    'aria-describedby': 'password-help',
    placeholder: '••••••••',
  });

  const toggle = h('button', {
    class: 'btn btn-quiet btn-sm', type: 'button', 'aria-label': 'Afficher le mot de passe',
    onClick: () => {
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      toggle.setAttribute('aria-label', visible ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
      toggle.textContent = visible ? 'Afficher' : 'Masquer';
    },
  }, 'Afficher');

  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, icon('lock', 16), COPY.actions.signIn);

  form.append(
    h('div', { class: 'login-head' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('shield', 24)),
      h('h1', {}, COPY.login.title),
      h('p', { class: 'muted' }, COPY.login.subtitle)),
    errorBox,
    h('div', { class: 'field' },
      h('label', { for: 'admin-email' }, 'Adresse e-mail'),
      email,
      h('p', { class: 'help', id: 'email-help' }, 'Laissez vide pour le compte propriétaire.')),
    h('div', { class: 'field' },
      h('label', { for: 'admin-password' }, COPY.login.password),
      h('div', { class: 'input-with-action' }, input, toggle),
      h('p', { class: 'help', id: 'password-help' }, COPY.login.hint)),
    submit,
    h('div', { class: 'login-foot' },
      h('a', { class: 'btn btn-quiet btn-sm', href: '/', 'data-link': '' }, icon('chevron', 14, 'style="transform:rotate(180deg)"'), COPY.actions.backHome),
      h('a', { class: 'btn btn-quiet btn-sm', href: '/aide', 'data-link': '' }, 'Aide')));

  const showError = (message) => {
    errorText.textContent = message;
    errorBox.hidden = false;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const password = input.value;
    if (!password) {
      showError(COPY.login.missing);
      input.focus();
      return;
    }
    submit.disabled = true;
    submit.replaceChildren(icon('retry', 16), 'Connexion…');
    try {
      const session = await api('/api/login', { method: 'POST', body: { password, email: email.value.trim() } });
      auth.set(session.token);
      if (session.entry) rememberConsole(session.entry);
      toast(session.role && session.role !== 'proprietaire'
        ? `Connexion réussie : ${session.roleLabel}.`
        : 'Connexion réussie.', { tone: 'success', duration: 3000 });
      if (session.defaultPassword) {
        toast('Mot de passe par défaut actif : changez-le dans l’onglet Sauvegardes.', { tone: 'info', duration: 8000 });
      }
      navigate(session.entry && next === '/connexion' ? session.entry : next, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        const minutes = Math.max(1, Math.ceil((Number(error.retryAfter || error.headers?.['retry-after'] || 900) / 60)));
        showError(COPY.login.locked(minutes));
      } else if (error.status === 401) {
        showError(COPY.login.badPassword);
        input.select();
      } else {
        showError(error.message || COPY.login.badPassword);
      }
      input.focus();
    } finally {
      submit.disabled = false;
      submit.replaceChildren(icon('lock', 16), COPY.actions.signIn);
    }
  });

  view.append(form);
  container.replaceChildren(view);
  queueMicrotask(() => (email.value ? input : email).focus({ preventScroll: true }));
  return () => {};
}
