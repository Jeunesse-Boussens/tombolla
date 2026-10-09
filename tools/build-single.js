/*
 * Génère « tombola-casino.html » : le site complet dans UN SEUL fichier
 * (CSS et JavaScript intégrés). Indispensable sur téléphone / tablette,
 * où le gestionnaire de fichiers n'ouvre que le fichier HTML sans le
 * dossier js/ ni style.css.
 *
 * Lancer après chaque modification :  node tools/build-single.js
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const OUTPUT = 'tombola-casino.html';
// Copie pour GitHub Pages quand la source choisie est le dossier /docs.
const PAGES_OUTPUT = 'docs/index.html';

function build() {
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  let html = read('index.html');

  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/, (m, href) => '<style>\n' + read(href) + '\n</style>');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const code = read(src);
    if (/<\/script/i.test(code)) throw new Error(src + ' contient « </script » : intégration impossible.');
    return '<script>\n/* ---- ' + src + ' ---- */\n' + code + '\n</script>';
  });
  if (/<script src=|<link rel="stylesheet"/.test(html)) throw new Error('Une ressource externe n’a pas été intégrée.');

  const banner = '<!-- Fichier généré par tools/build-single.js à partir de index.html, style.css et js/*.js. Ne pas modifier à la main. -->\n';
  return html.replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n' + banner);
}

module.exports = { build, OUTPUT, PAGES_OUTPUT };

if (require.main === module) {
  const html = build();
  fs.writeFileSync(path.join(root, OUTPUT), html);
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, PAGES_OUTPUT), html);
  console.log('✔ ' + OUTPUT + ' et ' + PAGES_OUTPUT + ' générés.');
}
