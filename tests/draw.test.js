/*
 * Tests automatisés de la logique de tirage (aucune dépendance).
 * Lancer :  node --test tests/*.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Draw = require('../js/draw.js');

// Configuration de test : `quantities` = quantités des lots successifs.
function makeConfig(ticketCount, quantities) {
  return {
    ticketCount,
    prizes: quantities.map((q, i) => ({
      id: 'lot-' + (i + 1),
      name: 'Lot ' + (i + 1),
      quantity: q,
      symbol: Draw.SYMBOL_IDS[i]
    }))
  };
}

function countByPrize(draw) {
  const counts = {};
  for (const id of Object.values(draw.assignments)) counts[id] = (counts[id] || 0) + 1;
  return counts;
}

const NEAR_MISS = { nearMissEnabled: true, nearMissPercent: 40 };

// Vérifie toutes les propriétés essentielles d'un tirage.
function assertDrawIsSound(config, draw, options) {
  const counts = countByPrize(draw);
  for (const p of config.prizes) assert.equal(counts[p.id] || 0, p.quantity, 'quantité de ' + p.name);
  const tickets = Object.keys(draw.assignments).map(Number);
  assert.equal(new Set(tickets).size, tickets.length, 'aucun doublon');
  const total = config.prizes.reduce((s, p) => s + p.quantity, 0);
  assert.equal(tickets.length, total, 'un ticket = au plus un lot');
  for (const t of tickets) assert.ok(t >= 1 && t <= config.ticketCount && Number.isInteger(t), 'ticket ' + t + ' dans la plage');

  for (let t = 1; t <= config.ticketCount; t++) {
    const prizeId = draw.assignments[String(t)];
    const r = Draw.reelSymbols(config, draw.seed, t, prizeId, options);
    const triple = r.symbols[0] === r.symbols[1] && r.symbols[1] === r.symbols[2];
    if (prizeId) {
      const prize = Draw.findPrize(config, prizeId);
      assert.ok(r.win, 'ticket ' + t + ' gagnant');
      assert.deepEqual(r.symbols, [prize.symbol, prize.symbol, prize.symbol]);
    } else {
      assert.ok(!r.win);
      assert.ok(!triple, 'perdant ' + t + ' sans triple symbole');
    }
    for (const s of r.symbols) assert.ok(Draw.SYMBOL_IDS.includes(s), 'symbole connu');
  }
  const v = Draw.verifyDraw(config, draw, null, options);
  assert.ok(v.ok, JSON.stringify(v.checks.filter((c) => !c.ok)));
}

test('respect des quantités et absence de doublon', () => {
  const config = makeConfig(200, [1, 3, 5, 10, 20]);
  const draw = Draw.generateDraw(config, 'SEED-A');
  assertDrawIsSound(config, draw, NEAR_MISS);
});

test('reproductibilité : même seed + même configuration = même tirage', () => {
  const config = makeConfig(300, [2, 4, 8]);
  const a = Draw.generateDraw(config, 'NOUVEL-AN-2027');
  const b = Draw.generateDraw(JSON.parse(JSON.stringify(config)), 'NOUVEL-AN-2027');
  assert.deepEqual(a.assignments, b.assignments);
  assert.equal(a.fingerprint, b.fingerprint);
  // Les rouleaux sont eux aussi reproductibles.
  for (let t = 1; t <= 300; t++) {
    assert.deepEqual(
      Draw.reelSymbols(config, a.seed, t, a.assignments[t], NEAR_MISS),
      Draw.reelSymbols(config, b.seed, t, b.assignments[t], NEAR_MISS)
    );
  }
});

test('un seed différent donne un tirage différent', () => {
  const config = makeConfig(500, [5, 5, 5]);
  const a = Draw.generateDraw(config, 'S1');
  const b = Draw.generateDraw(config, 'S2');
  assert.notDeepEqual(a.assignments, b.assignments);
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test('perdant : jamais trois symboles identiques, même avec 100 % de « presque gagné »', () => {
  const config = makeConfig(1000, [3]);
  const draw = Draw.generateDraw(config, 'TRIPLE');
  for (const options of [{ nearMissEnabled: true, nearMissPercent: 100 }, { nearMissEnabled: false }, NEAR_MISS]) {
    assertDrawIsSound(config, draw, options);
  }
  // 100 % : tous les perdants ont exactement une paire sur les rouleaux 1 et 2.
  for (let t = 1; t <= 1000; t++) {
    if (draw.assignments[t]) continue;
    const r = Draw.reelSymbols(config, draw.seed, t, null, { nearMissEnabled: true, nearMissPercent: 100 });
    assert.ok(r.nearMiss);
    assert.equal(r.symbols[0], r.symbols[1]);
    assert.notEqual(r.symbols[1], r.symbols[2]);
  }
});

test('« presque gagné » désactivé : trois symboles tous différents', () => {
  const config = makeConfig(400, [10]);
  const draw = Draw.generateDraw(config, 'DISTINCT');
  for (let t = 1; t <= 400; t++) {
    if (draw.assignments[t]) continue;
    const r = Draw.reelSymbols(config, draw.seed, t, null, { nearMissEnabled: false, nearMissPercent: 80 });
    assert.equal(new Set(r.symbols).size, 3);
    assert.ok(!r.nearMiss);
  }
});

test('le pourcentage de « presque gagné » est approximativement respecté', () => {
  const config = makeConfig(2000, [1]);
  const draw = Draw.generateDraw(config, 'PCT');
  let near = 0;
  let losers = 0;
  for (let t = 1; t <= 2000; t++) {
    if (draw.assignments[t]) continue;
    losers++;
    if (Draw.reelSymbols(config, draw.seed, t, null, { nearMissEnabled: true, nearMissPercent: 30 }).nearMiss) near++;
  }
  const ratio = near / losers;
  assert.ok(ratio > 0.25 && ratio < 0.35, 'ratio observé ' + ratio);
});

test('cas limite : 1 seul ticket', () => {
  const win = makeConfig(1, [1]);
  const d1 = Draw.generateDraw(win, 'X');
  assert.deepEqual(d1.assignments, { 1: 'lot-1' });
  assertDrawIsSound(win, d1, NEAR_MISS);

  const lose = makeConfig(1, []);
  const d2 = Draw.generateDraw(lose, 'X');
  assert.deepEqual(d2.assignments, {});
  assertDrawIsSound(lose, d2, NEAR_MISS);
});

test('cas limite : tous les tickets gagnants', () => {
  const config = makeConfig(50, [10, 15, 25]);
  const v = Draw.validateConfig(config);
  assert.ok(v.ok);
  assert.ok(v.warnings.some((w) => w.includes('Tous les tickets')));
  const draw = Draw.generateDraw(config, 'ALL');
  assert.equal(Object.keys(draw.assignments).length, 50);
  assertDrawIsSound(config, draw, NEAR_MISS);
});

test('cas limite : 0 lot (tous perdants)', () => {
  const config = makeConfig(120, []);
  const v = Draw.validateConfig(config);
  assert.ok(v.ok);
  assert.ok(v.warnings.length > 0);
  const draw = Draw.generateDraw(config, 'ZERO');
  assert.equal(Object.keys(draw.assignments).length, 0);
  assertDrawIsSound(config, draw, NEAR_MISS);
});

test('cas limite : un seul lot', () => {
  const config = makeConfig(100, [7]);
  const draw = Draw.generateDraw(config, 'ONE');
  assertDrawIsSound(config, draw, NEAR_MISS);
});

test('cas limite : N très grand (1000 et 10000)', () => {
  const c1 = makeConfig(1000, [1, 2, 5, 10, 50, 100]);
  assertDrawIsSound(c1, Draw.generateDraw(c1, 'BIG'), NEAR_MISS);
  const c2 = makeConfig(10000, [100, 200, 300]);
  const d2 = Draw.generateDraw(c2, 'HUGE');
  assert.equal(Object.keys(d2.assignments).length, 600);
  assert.ok(Draw.verifyDraw(c2, d2, null, NEAR_MISS).ok);
});

test('tous les symboles utilisés comme lots', () => {
  const config = makeConfig(200, Draw.SYMBOL_IDS.map(() => 2));
  assertDrawIsSound(config, Draw.generateDraw(config, 'FULL'), { nearMissEnabled: true, nearMissPercent: 100 });
});

test('validation : erreurs claires', () => {
  const tooMany = makeConfig(10, [6, 5]);
  const v1 = Draw.validateConfig(tooMany);
  assert.ok(!v1.ok);
  assert.ok(v1.errors.some((e) => e.includes('11 lots') && e.includes('10 tickets')));
  assert.throws(() => Draw.generateDraw(tooMany, 'S'));

  const dupSymbol = makeConfig(10, [1, 1]);
  dupSymbol.prizes[1].symbol = dupSymbol.prizes[0].symbol;
  assert.ok(Draw.validateConfig(dupSymbol).errors.some((e) => e.includes('déjà utilisé')));

  const noName = makeConfig(10, [1]);
  noName.prizes[0].name = '   ';
  assert.ok(Draw.validateConfig(noName).errors.some((e) => e.includes('nom')));

  const badQty = makeConfig(10, [1]);
  badQty.prizes[0].quantity = 1.5;
  assert.ok(Draw.validateConfig(badQty).errors.some((e) => e.includes('quantité')));
  badQty.prizes[0].quantity = 0;
  assert.ok(!Draw.validateConfig(badQty).ok);

  assert.ok(!Draw.validateConfig({ ticketCount: 0, prizes: [] }).ok);
  assert.ok(!Draw.validateConfig({ ticketCount: -3, prizes: [] }).ok);
  assert.ok(!Draw.validateConfig({ ticketCount: Draw.MAX_TICKETS + 1, prizes: [] }).ok);

  const badSymbol = makeConfig(10, [1]);
  badSymbol.prizes[0].symbol = 'licorne';
  assert.ok(!Draw.validateConfig(badSymbol).ok);

  assert.throws(() => Draw.generateDraw(makeConfig(10, [1]), '   '));
});

test('test de cohérence : détecte un tirage modifié', () => {
  const config = makeConfig(100, [3, 3]);
  const draw = Draw.generateDraw(config, 'TAMPER');
  const tampered = JSON.parse(JSON.stringify(draw));
  const winner = Object.keys(tampered.assignments)[0];
  delete tampered.assignments[winner];
  let free = 1;
  while (tampered.assignments[free] || String(free) === winner) free++;
  tampered.assignments[free] = draw.assignments[winner];
  const v = Draw.verifyDraw(config, tampered);
  assert.ok(!v.ok);
  assert.ok(v.checks.some((c) => !c.ok && c.label.includes('seed')));
});

test('test de cohérence : détecte une partie jouée incohérente', () => {
  const config = makeConfig(20, [2]);
  const draw = Draw.generateDraw(config, 'PLAYS');
  const loser = [...Array(20).keys()].map((i) => i + 1).find((t) => !draw.assignments[t]);
  const ok = Draw.verifyDraw(config, draw, { [loser]: { prizeId: null } });
  assert.ok(ok.ok);
  const bad = Draw.verifyDraw(config, draw, { [loser]: { prizeId: 'lot-1' } });
  assert.ok(!bad.ok);
});

test('winnersByPrize regroupe les numéros gagnants triés', () => {
  const config = makeConfig(100, [4, 2]);
  const draw = Draw.generateDraw(config, 'GROUP');
  const groups = Draw.winnersByPrize(config, draw);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].tickets.length, 4);
  assert.equal(groups[1].tickets.length, 2);
  assert.deepEqual(groups[0].tickets, [...groups[0].tickets].sort((a, b) => a - b));
});

test('randomSeed produit des seeds lisibles et différents', () => {
  const seeds = new Set();
  for (let i = 0; i < 50; i++) seeds.add(Draw.randomSeed());
  assert.equal(seeds.size, 50);
  for (const s of seeds) assert.match(s, /^CASINO-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});

test('le générateur à graine est uniforme (contrôle grossier)', () => {
  const rng = Draw.createRng('uniforme');
  const buckets = new Array(10).fill(0);
  for (let i = 0; i < 100000; i++) buckets[Math.floor(rng() * 10)]++;
  for (const b of buckets) assert.ok(b > 9500 && b < 10500, 'bucket ' + b);
});

test('le fichier autonome tombola-casino.html est à jour', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { build, OUTPUT } = require('../tools/build-single.js');
  const current = fs.readFileSync(path.join(__dirname, '..', OUTPUT), 'utf8');
  assert.equal(current, build(), 'Relancez : node tools/build-single.js');
});
