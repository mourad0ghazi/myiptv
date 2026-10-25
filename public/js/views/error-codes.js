// public/js/views/error-codes.js — les 20 codes d'erreur opposables (§6.3), copie exacte du serveur.

export const ERRORS_CODES = [
  { code: 'ERR-01', status: 400, message: 'Le formulaire est incomplet ou mal formé. Réessayez.' },
  { code: 'ERR-02', status: 400, message: 'Le champ « {champ} » est obligatoire.' },
  { code: 'ERR-03', status: 400, message: '« {champ} » doit être compris entre {min} et {max}.' },
  { code: 'ERR-04', status: 400, message: '« {champ} » n’a pas le bon format.' },
  { code: 'ERR-05', status: 400, message: 'Ce fichier n’est pas une liste M3U : aucune chaîne n’a été trouvée.' },
  { code: 'ERR-06', status: 400, message: 'La requête a été refusée : données illisibles.' },
  { code: 'ERR-07', status: 401, message: 'Votre session a expiré. Reconnectez-vous.' },
  { code: 'ERR-08', status: 401, message: 'Mot de passe incorrect.' },
  { code: 'ERR-09', status: 403, message: 'Cette action n’est pas autorisée.' },
  { code: 'ERR-10', status: 404, message: 'Chaîne introuvable.' },
  { code: 'ERR-11', status: 404, message: 'Cette adresse n’existe pas.' },
  { code: 'ERR-12', status: 405, message: 'Action non autorisée sur cette adresse.' },
  { code: 'ERR-13', status: 409, message: 'Une importation est déjà en cours. Patientez.' },
  { code: 'ERR-14', status: 409, message: 'Cette chaîne existe déjà dans le catalogue.' },
  { code: 'ERR-15', status: 413, message: 'Fichier trop volumineux (maximum {max}).' },
  { code: 'ERR-16', status: 422, message: 'Impossible d’appliquer : {raison}.' },
  { code: 'ERR-17', status: 429, message: 'Trop de tentatives. Réessayez dans {n} minutes.' },
  { code: 'ERR-18', status: 500, message: 'Une erreur interne est survenue. Réessayez ; si elle persiste, signalez-la avec le code {requestId}.' },
  { code: 'ERR-19', status: 503, message: 'Le service est momentanément indisponible. Retour prévu : {heure}.' },
  { code: 'ERR-20', status: 504, message: 'La source n’a pas répondu à temps. Réessayez plus tard.' },
];
