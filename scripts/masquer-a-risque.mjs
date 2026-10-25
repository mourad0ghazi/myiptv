#!/usr/bin/env node
// scripts/masquer-a-risque.mjs — retire de la lecture les chaînes que la source
// déclare elle-même fragiles : géo-bloquées (« [Geo-blocked] ») et non permanentes
// (« [Not 24/7] »). Aucune suppression : elles passent en `blocked` avec la raison,
// la fiche reste consultable et affiche l'explication au lieu d'un écran noir.
//
//   node scripts/masquer-a-risque.mjs                  aperçu, aucune écriture
//   node scripts/masquer-a-risque.mjs --commit         applique au catalogue
//   node scripts/masquer-a-risque.mjs --garder-not247  ne traite que la géo
//
// Variables : DATA_DIR (dossier de données). Une sauvegarde est écrite avant modification.

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA = process.env.DATA_DIR || 'data';
const commit = process.argv.includes('--commit');
const geoSeulement = process.argv.includes('--garder-not247');
const fichier = join(DATA, 'channels.json');

let doc;
try {
  doc = JSON.parse(readFileSync(fichier, 'utf8'));
} catch {
  process.stderr.write(`Catalogue illisible ou absent : ${fichier}\n`);
  process.exit(1);
}
const chans = doc.channels || doc;
let geo = 0;
let not247 = 0;

for (const c of chans) {
  if (c.blocked || c.deleted) continue;
  const tags = c.tags || [];
  if (tags.includes('geo')) {
    c.blocked = true;
    c.blockedReason = 'geo';
    geo += 1;
    continue;
  }
  if (!geoSeulement && tags.includes('not-24-7')) {
    c.blocked = true;
    c.blockedReason = 'dead';
    not247 += 1;
  }
}

const lisibles = chans.filter((c) => !c.blocked && !c.deleted).length;
process.stdout.write(`  géo-bloquées retirées .... ${geo}\n`);
process.stdout.write(`  non permanentes retirées . ${not247}\n`);
process.stdout.write(`  encore lisibles .......... ${lisibles} sur ${chans.length}\n`);

if (!commit) {
  process.stdout.write('\n  Aperçu seul : relancez avec --commit pour écrire.\n');
} else {
  copyFileSync(fichier, `${fichier}.avant-masquage`);
  writeFileSync(fichier, `${JSON.stringify(doc, null, 2)}\n`);
  process.stdout.write(`  écrit : ${fichier} (sauvegarde : ${fichier}.avant-masquage)\n`);
}
