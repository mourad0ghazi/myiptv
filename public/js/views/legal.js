// public/js/views/legal.js — pages d'information : mentions, confidentialité, signalement, aide, messages.
// Aucune de ces pages ne modifie l'état du site : elles sont lisibles hors connexion après un premier passage.

import { COPY } from '../copy.js';
import { h, icon, fmtDate, toast, copyText } from '../ui.js';
import { ERRORS_CODES } from './error-codes.js';

const CONTACT = 'contact@streamtv.example';
const UPDATED = '2026-10-25';

function page(title, eyebrow, sections, { config } = {}) {
  const brand = config?.brand || 'StreamTV';
  return h('div', { class: 'view' },
    h('div', { class: 'section-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, eyebrow),
        h('h1', { style: { fontSize: 'clamp(28px,4vw,38px)' } }, title)),
      h('span', { class: 'badge' }, icon('clock', 12), `Mise à jour le ${fmtDate(UPDATED)}`)),
    h('div', { class: 'prose', style: { maxWidth: '74ch' } }, sections),
    h('div', { class: 'toolbar', style: { marginTop: '32px' } },
      h('a', { class: 'btn btn-ghost btn-sm', href: '/', 'data-link': '' }, icon('chevron', 14, 'style="transform:rotate(180deg)"'), COPY.actions.backHome),
      h('a', { class: 'btn btn-quiet btn-sm', href: '/aide', 'data-link': '' }, 'Aide & raccourcis'),
      h('span', { class: 'count-label', style: { marginLeft: 'auto' } }, `${brand} · document public`)));
}

const section = (title, ...content) => h('section', { style: { marginTop: '28px' } },
  h('h2', { style: { fontSize: '20px', marginBottom: '10px' } }, title),
  ...content);

const paragraph = (text, className = '') => h('p', { class: className, text });
const list = (items) => h('ul', { class: 'prose-list' }, items.map((item) => h('li', { text: item })));

export function renderLegal(container, ctx) {
  const config = ctx.config;
  container.replaceChildren(page('Mentions légales', 'Cadre juridique', [
    paragraph(config.legal?.mention || COPY.legal.mention),
    section('Éditeur du site',
      paragraph(`Le catalogue ${config.brand} est édité par un éditeur indépendant. Contact : ${CONTACT}.`),
      paragraph('Directeur de la publication : l’éditeur. Hébergement : infrastructure mutualisée de l’éditeur, Union européenne.')),
    section('Nature du service',
      paragraph('StreamTV est un catalogue de liens : il référence des adresses de flux publiées par leurs ayants droit ou par des sources tierces.'),
      paragraph('Aucun fichier vidéo n’est hébergé, enregistré, transcodé ou retransmis par ce service. Le lecteur se connecte directement à la source.')),
    section('Propriété intellectuelle',
      paragraph('Les marques, noms et logos des chaînes appartiennent à leurs propriétaires respectifs. Leur présence dans le catalogue est descriptive et informative.'),
      paragraph('Le code, les textes et l’identité visuelle du site sont protégés. Toute reproduction intégrale sans autorisation est interdite.')),
    section('Responsabilité',
      paragraph('Le catalogue peut évoluer, être incomplet ou contenir des liens devenus indisponibles : l’éditeur ne garantit ni la disponibilité ni la conformité des flux tiers.'),
      paragraph('Chaque chaîne porte une justification des droits dans le catalogue. Une chaîne sans justification est masquée.')),
    section('Signalement et retrait',
      paragraph('Toute demande crédible de retrait est traitée sous 72 heures ouvrées ; la chaîne est masquée immédiatement à réception.'),
      h('a', { class: 'btn btn-ghost btn-sm', href: '/signaler', 'data-link': '' }, icon('alert', 14), 'Ouvrir la procédure de signalement')),
    section('Crédits techniques',
      paragraph('Node.js 20, modules natifs uniquement. Client HTML/CSS/JS en modules ES, sans cadriciel ni bundler. hls.js 1.5.17, bibliothèque libre (Apache-2.0), incluse dans le dépôt.'),
      paragraph('Listes de chaînes et métadonnées de démonstration : iptv-org, publiées sous licence CC0.')),
  ], { config }));
  return () => {};
}

export function renderPrivacy(container, ctx) {
  container.replaceChildren(page('Confidentialité', 'Vos données', [
    paragraph('Cette version de StreamTV ne crée aucun compte visiteur et ne dépose aucun traceur.'),
    section('Ce qui reste sur votre appareil',
      list([
        'Vos favoris, votre historique de lecture, le volume et les dernières recherches.',
        'Ces données sont stockées dans le stockage local de votre navigateur, sous le préfixe « streamtv. ».',
        'Elles ne sont jamais envoyées au serveur et ne sont pas synchronisées entre appareils.',
        'Les vider est immédiat depuis la page Favoris (« Vider ») ou en effaçant les données du site.',
      ])),
    section('Ce que le serveur enregistre',
      list([
        'Des journaux techniques sans adresse IP pour les visiteurs : méthode, adresse, code de réponse, durée. Conservation 14 jours.',
        'Le journal d’audit des actions d’administration (horodatage, action, identifiants de chaînes) : conservation 90 jours, adresse IP incluse pour la sécurité.',
        'Aucun contenu regardé, aucune recherche, aucun identifiant publicitaire.',
      ])),
    section('Cookies et stockage',
      list([
        'Aucun cookie de mesure d’audience, aucun cookie publicitaire, aucun bouton social tiers.',
        'Le service worker conserve les fichiers du site et les réponses publiques du catalogue pour l’affichage hors ligne.',
        'La session d’administration utilise le stockage de session du navigateur : elle disparaît à la fermeture de l’onglet.',
      ])),
    section('Vos droits',
      paragraph('Vous pouvez lire, exporter ou supprimer les données locales à tout moment : elles sont visibles dans l’onglet Stockage de votre navigateur, et les boutons « Vider » les effacent.'),
      paragraph(`Pour les journaux d’audit et toute question : ${CONTACT}. Réponse sous 30 jours.`)),
    section('Sécurité',
      list([
        'Mot de passe administrateur protégé par scrypt (N=16384, r=8, p=1) et sel aléatoire de 128 bits.',
        'Jeton de session 48 caractères hexadécimaux, durée de vie glissante de 12 heures, cinq sessions simultanées au maximum.',
        'En-têtes de sécurité stricts : CSP, HSTS, nosniff, frame-ancestors, Permissions-Policy.',
      ])),
  ], { config: ctx.config }));
  return () => {};
}

export function renderReport(container, ctx) {
  const channelName = ctx.query.chaine || '';
  const input = h('input', { type: 'text', id: 'report-channel', value: channelName, maxlength: '120', required: true });
  const url = h('input', { type: 'url', id: 'report-url', placeholder: 'https://…', maxlength: '300' });
  const email = h('input', { type: 'email', id: 'report-email', placeholder: 'vous@exemple.fr', maxlength: '120' });
  const reason = h('select', { id: 'report-reason' },
    ['Droits d’auteur', 'Contenu illicite', 'Flux indisponible', 'Mauvaise catégorie', 'Autre'].map((value) => h('option', { value }, value)));
  const message = h('textarea', { id: 'report-message', maxlength: '1200', placeholder: 'Précisez le motif, la chaîne et la date constatée.' });
  const result = h('div', { class: 'banner', dataset: { tone: 'info' }, hidden: true, role: 'status' });

  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, icon('alert', 16), 'Préparer le signalement');

  const form = h('form', { novalidate: true },
    h('div', { class: 'form-row' },
      h('div', { class: 'field' }, h('label', { for: 'report-channel' }, 'Chaîne concernée'), input),
      h('div', { class: 'field' }, h('label', { for: 'report-reason' }, 'Motif'), reason)),
    h('div', { class: 'form-row' },
      h('div', { class: 'field' }, h('label', { for: 'report-url' }, 'Adresse du flux (facultatif)'), url),
      h('div', { class: 'field' }, h('label', { for: 'report-email' }, 'Votre adresse (facultatif)'), email)),
    h('div', { class: 'field' }, h('label', { for: 'report-message' }, 'Précisions'), message),
    h('p', { class: 'help' }, 'Le signalement ouvre votre logiciel de courrier avec un message déjà rédigé. Aucune donnée n’est envoyée par ce site.'),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' } }, submit),
    result);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!input.value.trim()) {
      toast('Indiquez le nom de la chaîne concernée.', { tone: 'error' });
      input.focus();
      return;
    }
    const subject = `Signalement — ${input.value.trim()}`;
    const body = [
      `Chaîne : ${input.value.trim()}`,
      `Motif : ${reason.value}`,
      url.value ? `Adresse du flux : ${url.value}` : '',
      email.value ? `Réponse souhaitée à : ${email.value}` : '',
      `Date du constat : ${new Date().toISOString().slice(0, 10)}`,
      '',
      message.value || '(aucune précision complémentaire)',
    ].filter(Boolean).join('\n');
    const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    result.hidden = false;
    result.replaceChildren(icon('check', 16), h('div', {},
      h('p', { text: 'Votre message est prêt dans votre logiciel de courrier.' }),
      h('p', { class: 'muted', style: { fontSize: '13px' } },
        'La chaîne est masquée immédiatement à réception du signalement. La vérification et la réponse interviennent sous 72 heures ouvrées.'),
      h('button', {
        class: 'btn btn-quiet btn-sm', type: 'button',
        onClick: async () => { const done = await copyText(mailto); toast(done ? 'Lien de signalement copié.' : 'Copie impossible.', { tone: done ? 'success' : 'error' }); },
      }, icon('copy', 14), 'Copier le lien')));
    window.location.href = mailto;
  });

  container.replaceChildren(page('Signaler un contenu', 'Retrait sous 72 heures', [
    paragraph('Un doute sur les droits d’un flux, un contenu illicite ou une chaîne mal classée ? Ce canal est prioritaire et documenté.'),
    section('Ce que nous faisons', list([
      'La chaîne concernée est masquée immédiatement, sur simple demande crédible.',
      'L’action est journalisée avec la date, la source et l’identifiant de la chaîne.',
      'La source est corrigée sous 72 heures ouvrées, puis la chaîne est réévaluée avant toute remise en ligne.',
      'Vous recevez une réponse à l’adresse indiquée, si vous en fournissez une.',
    ])),
    section('Formulaire', form),
    section('Contact direct',
      paragraph(`Si le formulaire ne s’ouvre pas, écrivez à ${CONTACT} en indiquant le nom exact de la chaîne, son numéro et le motif.`)),
  ], { config: ctx.config }));
  return () => {};
}

export function renderHelp(container, ctx) {
  const config = ctx.config;
  container.replaceChildren(page('Aide & raccourcis', 'Mode d’emploi', [
    paragraph('StreamTV se pilote au clavier comme à la télécommande. Tout ce qui suit fonctionne sur ordinateur, tablette et téléphone.'),
    section('Les quatre gestes utiles', list([
      'Chercher : la barre accepte les accents, les apostrophes, l’arabe et les numéros de chaîne. « cafe » trouve « Café ».',
      'Filtrer : les pastilles de catégories se combinent avec le tri et la pagination.',
      'Regarder : un clic sur une carte lance la lecture en superposition ; Échap ferme le lecteur.',
      'Retrouver : l’étoile range la chaîne dans vos favoris, sur cet appareil uniquement.',
    ])),
    section('Raccourcis du lecteur',
      h('div', { class: 'rows' }, COPY.player.shortcuts.map(([keys, label]) => h('div', { class: 'variant' },
        h('span', { class: 'kbd', text: keys }), h('span', { class: 'muted', text: label }))))),
    section('Raccourcis généraux', list([
      '/ : placer le curseur dans la recherche',
      '? : afficher la liste des raccourcis',
      'Échap : fermer une fenêtre, puis le lecteur',
      'Les raccourcis sont ignorés pendant la saisie dans un champ de texte.',
    ])),
    section('Questions fréquentes',
      h('h3', { style: { marginTop: '12px' } }, 'Une chaîne affiche « non testée »'),
      paragraph('Aucune sonde n’a encore mesuré ce flux. Ce n’est pas une erreur : lancez une sonde depuis l’administration, onglet Santé.'),
      h('h3', { style: { marginTop: '12px' } }, '« Chaîne non lisible sur ce site »'),
      paragraph('Le flux est diffusé en HTTP alors que le site est en HTTPS : le navigateur bloque ce mélange. La mire propose la chaîne suivante ou la copie du lien pour un lecteur externe.'),
      h('h3', { style: { marginTop: '12px' } }, 'Le catalogue affiche moins de chaînes que le nombre total'),
      paragraph('Certaines chaînes sont masquées : catégorie adulte ou décision du propriétaire. Le badge « chaînes masquées » donne le compte exact et le lien vers le réglage.'),
      h('h3', { style: { marginTop: '12px' } }, 'Pourquoi les favoris ne suivent-ils pas d’un appareil à l’autre ?'),
      paragraph('Ils sont stockés localement, sans compte : c’est le choix de confidentialité de cette version.')),
    section('Accessibilité',
      list([
        'Navigation complète au clavier, focus visible de 3 px, ordre de tabulation logique.',
        'Contrastes conformes AA : texte principal sur fond sombre, textes secondaires ≥ 4,5:1.',
        'Aucun texte inférieur à 12 px, cibles tactiles de 44 px minimum.',
        'Animations désactivées si votre système le demande (prefers-reduced-motion).',
        'Lecteur d’écran : chaque changement de page est annoncé, chaque image décorative est ignorée.',
      ])),
    section('Besoin d’aide ?',
      paragraph(`Écrivez à ${CONTACT} ou consultez le catalogue des messages dans la page « Erreurs ».`),
      h('a', { class: 'btn btn-ghost btn-sm', href: '/erreurs', 'data-link': '' }, icon('alert', 14), 'Catalogue des messages')),
  ], { config }));
  return () => {};
}

export function renderErrors(container, ctx) {
  const mires = Object.values(COPY.player.mires);
  container.replaceChildren(page('Catalogue des messages', 'Transparence', [
    paragraph('Chaque message du site porte un code stable, une cause unique et au moins une action possible. Les textes ci-dessous sont les textes affichés, mot pour mot.'),
    section('Règle d’or',
      paragraph('Aucune erreur n’est affichée sans action concrète : changer de chaîne, réessayer, copier le lien, signaler, ou revenir au catalogue.')),
    section('Lecteur — les 12 mires',
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Code'), h('th', {}, 'Titre'), h('th', {}, 'Cause'), h('th', {}, 'Action'))),
        h('tbody', {}, mires.map((mire) => h('tr', {},
          h('td', { class: 'tabular' }, mire.code),
          h('td', { dir: 'auto' }, mire.title),
          h('td', { class: 'muted' }, mire.explanation),
          h('td', { class: 'muted' }, mire.actions.join(' · ')))))))),
    section('Service — les 20 codes d’erreur',
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Code'), h('th', {}, 'Statut'), h('th', {}, 'Message'))),
        h('tbody', {}, ERRORS_CODES.map((entry) => h('tr', {},
          h('td', { class: 'tabular' }, entry.code),
          h('td', { class: 'tabular' }, String(entry.status)),
          h('td', { dir: 'auto' }, entry.message))))))),
    section('Trois niveaux de protection',
      list([
        'Le client : messages français, aucune trace technique, actions directes.',
        'L’API : codes opposables, identifiant de requête pour le support, champ fautif indiqué.',
        'Le serveur : validation en sept étapes, journal d’audit, écriture atomique, sauvegardes vérifiées.',
      ])),
    section('Signaler un message inattendu',
      paragraph('Copiez l’identifiant de requête affiché avec le message et envoyez-le avec le formulaire de signalement.'),
      h('a', { class: 'btn btn-ghost btn-sm', href: '/signaler', 'data-link': '' }, icon('alert', 14), 'Signaler')),
  ], { config: ctx.config }));
  return () => {};
}
