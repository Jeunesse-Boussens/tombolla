/*
 * Test de bout en bout de l'interface dans un vrai navigateur (Chromium).
 * Facultatif : nécessite Playwright (npm i -g playwright), qui n'est PAS
 * une dépendance du site. Le site est ouvert en file:// comme le jour J.
 *
 * Lancer :  node tests/ui/ui.e2e.mjs [dossier-captures] [--formats] [--page=tombola-casino.html]
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const formatsOnly = args.includes('--formats'); // ne teste que les formats d'écran
const shots = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(here, 'screenshots'));
// --page=tombola-casino.html pour tester la version en un seul fichier.
const pageArg = args.find((a) => a.startsWith('--page='));
const url = pathToFileURL(path.join(root, pageArg ? pageArg.slice(7) : 'index.html')).href;
fs.mkdirSync(shots, { recursive: true });

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* essai global */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();

let step = 0;
function log(msg) { console.log(`  ✔ ${++step}. ${msg}`); }

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, hasTouch: true });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('dialog', (d) => d.accept()); // beforeunload
  return { context, page };
}

async function typeTicket(page, n) {
  for (const ch of String(n)) await page.click(`#keypad button[data-key="${ch}"]`);
}

async function waitResult(page) {
  await page.waitForSelector('#result-overlay:not([hidden])', { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('result-overlay').dataset.ready === '1');
}

async function centerSymbols(page) {
  return page.$$eval('#reels .strip', (strips) => strips.map((s) => s.children[1].firstElementChild.className.match(/sym-([a-z]+)/)[1]));
}

async function closeResult(page) {
  await page.click('#result-overlay');
  await page.waitForSelector('#result-overlay', { state: 'hidden' });
}

try {
  if (!formatsOnly) {
  /* ------------------------------ Démo ---------------------------------- */
  const { context, page } = await newPage({ width: 1024, height: 768 });
  await page.goto(url);
  await page.waitForSelector('#not-ready:not([hidden])');
  log('Premier lancement : écran « La machine se prépare »');
  await page.screenshot({ path: path.join(shots, '01-premier-lancement.png') });

  await page.click('#not-ready-demo');
  await page.waitForSelector('#not-ready', { state: 'hidden' });
  assert.ok(await page.isVisible('#demo-banner'));
  log('Mode démo activé, bannière visible');

  const demo = await page.evaluate(() => ({
    assignments: App.state.draw.assignments,
    prizes: App.state.config.prizes,
    n: App.state.draw.ticketCount
  }));
  assert.equal(demo.n, 100);
  assert.equal(demo.prizes.length, 5);
  const winner = Number(Object.keys(demo.assignments)[0]);
  const prize = demo.prizes.find((p) => p.id === demo.assignments[winner]);
  let loser = 1;
  while (demo.assignments[loser]) loser++;

  await page.screenshot({ path: path.join(shots, '02-demo-accueil-paysage.png') });
  await typeTicket(page, winner);
  assert.equal(await page.textContent('#ticket-value'), String(winner));
  await page.click('#btn-play');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shots, '03-rotation.png') });
  await waitResult(page);
  assert.ok(await page.isVisible('.result-win'));
  assert.ok((await page.textContent('.result-prize')).includes(prize.name));
  assert.deepEqual(await centerSymbols(page), [prize.symbol, prize.symbol, prize.symbol]);
  await page.screenshot({ path: path.join(shots, '04-jackpot.png') });
  log(`Ticket gagnant ${winner} → « ${prize.name} », 3 × ${prize.symbol}`);
  await closeResult(page);

  // Perdant au clavier.
  await page.keyboard.type(String(loser));
  await page.keyboard.press('Enter');
  await waitResult(page);
  assert.ok(await page.isVisible('.result-lose'));
  const ls = await centerSymbols(page);
  assert.ok(!(ls[0] === ls[1] && ls[1] === ls[2]), 'perdant sans triple');
  await page.screenshot({ path: path.join(shots, '05-perdu.png') });
  log(`Ticket perdant ${loser} (clavier) → symboles ${ls.join(', ')}`);
  await closeResult(page);

  // Ticket déjà joué (démo : bouton « Rejouer »).
  await typeTicket(page, winner);
  await page.click('#btn-play');
  assert.match(await page.textContent('#game-message'), /déjà joué/);
  assert.ok(await page.isVisible('#btn-replay'));
  await page.screenshot({ path: path.join(shots, '06-deja-joue.png') });
  log('Ticket déjà joué refusé, bouton « Rejouer (démo) » proposé');
  await page.click('#btn-replay');
  await waitResult(page);
  await closeResult(page);
  log('Rejouer en démo fonctionne');

  // Numéro invalide.
  await page.keyboard.type('999');
  await page.keyboard.press('Enter');
  assert.match(await page.textContent('#game-message'), /Numéro invalide/);
  log('Numéro hors plage refusé');
  await page.keyboard.press('Escape');

  // Rechargement : l'état est restauré.
  await page.reload();
  await page.waitForSelector('#demo-banner');
  const playedAfterReload = await page.evaluate(() => Object.keys(App.state.plays).length);
  assert.equal(playedAfterReload, 2);
  assert.equal(await page.evaluate(() => App.mode), 'demo');
  log('Rechargement de la page : mode et parties restaurés');

  // Admin démo (sans PIN) + test de cohérence.
  await page.click('#btn-admin');
  await page.waitForSelector('#screen-admin:not([hidden])');
  await page.screenshot({ path: path.join(shots, '07-admin-tableau-de-bord.png'), fullPage: true });
  await page.click('[data-tab="draw"]');
  await page.click('[data-action="verify"]');
  await page.waitForSelector('.verify-ok');
  await page.screenshot({ path: path.join(shots, '08-admin-tirage.png'), fullPage: true });
  log('Démo : administration et test de cohérence OK');

  // Réinitialiser la démo en un clic.
  await page.click('#demo-reset');
  assert.equal(await page.evaluate(() => Object.keys(App.state.plays).length), 0);
  log('Réinitialisation de la démo en un clic');

  // Quitter la démo : la vraie soirée est intacte.
  await page.click('#demo-quit');
  await page.waitForSelector('#not-ready:not([hidden])');
  const realState = await page.evaluate(() => ({ mode: App.mode, plays: Object.keys(App.state.plays).length, draw: App.state.draw }));
  assert.equal(realState.mode, 'real');
  assert.equal(realState.plays, 0);
  assert.equal(realState.draw, null);
  log('Sortie de démo : données réelles intactes');

  /* -------------------------- Vraie soirée ------------------------------ */
  async function pin(code) {
    for (const ch of code) await page.click(`.modal-box .pin-key[data-key="${ch}"]`);
    await page.click('.modal-box .btn-primary');
  }
  await page.click('#not-ready-admin');
  await pin('2468');
  await pin('2468');
  await page.waitForSelector('#screen-admin:not([hidden])');
  log('Code PIN créé (2 saisies)');

  await page.click('[data-tab="config"]');
  await page.fill('[data-field="ticketCount"]', '30');
  await page.click('[data-action="add-prize"]');
  await page.fill('.prize-row:nth-child(1) [data-pfield="name"]', 'Jambon');
  await page.fill('.prize-row:nth-child(1) [data-pfield="quantity"]', '2');
  await page.click('[data-action="add-prize"]');
  await page.fill('.prize-row:nth-child(2) [data-pfield="name"]', 'Bouteille');
  await page.fill('.prize-row:nth-child(2) [data-pfield="quantity"]', '40');
  assert.match(await page.textContent('#config-validation'), /total des quantités/);
  log('Validation : trop de lots pour le nombre de tickets → erreur claire');
  await page.fill('.prize-row:nth-child(2) [data-pfield="quantity"]', '3');
  await page.screenshot({ path: path.join(shots, '09-admin-lots.png'), fullPage: true });
  await page.click('[data-action="save-config"]');
  await page.click('[data-tab="draw"]');
  await page.fill('#seed-input', 'TEST-SEED-1');
  await page.click('[data-action="generate"]');
  await page.waitForSelector('.draw-info');
  const fp1 = await page.evaluate(() => App.state.draw.fingerprint);
  await page.click('[data-action="generate"]'); // régénérer avec le même seed
  await page.click('.modal-box .btn-primary');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => App.state.draw.fingerprint), fp1);
  log('Même seed → même tirage (empreinte ' + fp1 + ')');
  await page.click('[data-action="lock"]');
  await page.click('.modal-box .btn-primary');
  await page.waitForSelector('.badge-ok');
  log('Tirage verrouillé');

  const real = await page.evaluate(() => App.state.draw.assignments);
  let realLoser = 1;
  while (real[realLoser]) realLoser++;
  await page.click('#admin-back');
  await page.waitForSelector('#not-ready', { state: 'hidden' });
  await typeTicket(page, realLoser);
  await page.click('#btn-play');
  await waitResult(page);
  await closeResult(page);
  await typeTicket(page, realLoser);
  await page.click('#btn-play');
  assert.match(await page.textContent('#game-message'), /déjà joué/);
  assert.equal(await page.$('#btn-replay'), null);
  log('Soirée : ticket déjà joué refusé (pas de « rejouer »)');

  await page.reload();
  await page.waitForSelector('#not-ready', { state: 'hidden' });
  assert.equal(await page.evaluate(() => Object.keys(App.state.plays).length), 1);
  log('Soirée : rechargement → partie conservée');

  // Mauvais PIN puis bon PIN, annulation de partie.
  await page.click('#btn-admin');
  await pin('1111');
  await page.waitForSelector('.toast-error');
  await page.click('#btn-admin');
  await pin('2468');
  await page.waitForSelector('#screen-admin:not([hidden])');
  log('Mauvais PIN refusé, bon PIN accepté');
  await page.click('[data-tab="log"]');
  await page.fill('#cancel-ticket', String(realLoser));
  await page.click('[data-action="cancel-play"]');
  await page.click('.modal-box .btn-danger');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => Object.keys(App.state.plays).length), 0);
  assert.ok(await page.evaluate(() => App.state.log.some((e) => e.type === 'annulation')));
  log('Annulation d’une partie tracée dans le journal');

  await page.click('[data-tab="dashboard"]');
  await page.click('[data-action="print"]');
  await page.waitForSelector('#screen-print:not([hidden])');
  await page.screenshot({ path: path.join(shots, '10-plan-b.png'), fullPage: true });
  log('Vue imprimable / plan B');

  assert.deepEqual(page.errors, [], 'aucune erreur JavaScript');
  log('Aucune erreur JavaScript dans la console');
  await context.close();
  }

  /* ----------------------- Formats d'écran ------------------------------ */
  const formats = [
    ['tablette-portrait', { width: 768, height: 1024 }],
    ['tablette-paysage', { width: 1180, height: 820 }],
    ['ordinateur', { width: 1920, height: 1080 }],
    ['petit-portable', { width: 1366, height: 768 }],
    ['telephone', { width: 390, height: 844 }]
  ];
  for (const [name, viewport] of formats) {
    const { context: c, page: p } = await newPage(viewport);
    await p.goto(url);
    await p.click('#not-ready-demo');
    await p.waitForSelector('#not-ready', { state: 'hidden' });
    // Rien ne doit déborder de l'écran.
    await p.screenshot({ path: path.join(shots, `20-${name}.png`) });
    const overflow = await p.evaluate(() => {
      const sel = ['#machine-frame', '.panel', '#keypad', '#btn-play', '#ticket-display', '.marquee', '#game-message'];
      return sel.filter((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return r.bottom > window.innerHeight + 1 || r.right > window.innerWidth + 1 || r.left < -1 || r.top < -1;
      });
    });
    assert.deepEqual(overflow, [], 'débordement en ' + name);
    assert.deepEqual(p.errors, []);
    log(`Affichage ${name} (${viewport.width}×${viewport.height}) sans débordement`);
    await c.close();
  }
  console.log(`\nTous les tests d’interface sont réussis. Captures : ${shots}`);
} catch (e) {
  console.error('\n✖ ÉCHEC :', e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
