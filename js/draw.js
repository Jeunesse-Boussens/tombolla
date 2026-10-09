/*
 * draw.js — Logique pure du tirage (aucune dépendance au navigateur).
 *
 * Ce fichier est utilisé :
 *   - dans le navigateur (exposé sous `window.Draw`) ;
 *   - dans Node pour les tests automatisés (`module.exports`).
 *
 * Principe : le résultat de chaque ticket est fixé à l'avance par un
 * générateur pseudo-aléatoire à graine (seed). Même seed + même
 * configuration = exactement le même tirage. Les symboles affichés par
 * les rouleaux sont eux aussi dérivés du seed et du numéro de ticket,
 * ce qui rend l'affichage reproductible et vérifiable.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Draw = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Symboles disponibles                                                 */
  /* ------------------------------------------------------------------ */

  // type "text" : rendu stylé en CSS (pas d'emoji adapté) ; "emoji" sinon.
  var SYMBOLS = [
    { id: 'seven', name: '7', type: 'text', char: '7' },
    { id: 'bar', name: 'BAR', type: 'text', char: 'BAR' },
    { id: 'cherry', name: 'Cerise', type: 'emoji', char: '🍒' },
    { id: 'bell', name: 'Cloche', type: 'emoji', char: '🔔' },
    { id: 'diamond', name: 'Diamant', type: 'emoji', char: '💎' },
    { id: 'clover', name: 'Trèfle', type: 'emoji', char: '🍀' },
    { id: 'crown', name: 'Couronne', type: 'emoji', char: '👑' },
    { id: 'star', name: 'Étoile', type: 'emoji', char: '⭐' },
    { id: 'lemon', name: 'Citron', type: 'emoji', char: '🍋' },
    { id: 'grapes', name: 'Raisin', type: 'emoji', char: '🍇' },
    { id: 'watermelon', name: 'Pastèque', type: 'emoji', char: '🍉' },
    { id: 'moneybag', name: 'Sac d’or', type: 'emoji', char: '💰' },
    { id: 'heart', name: 'Cœur', type: 'emoji', char: '❤️' },
    { id: 'champagne', name: 'Champagne', type: 'emoji', char: '🍾' },
    { id: 'gift', name: 'Cadeau', type: 'emoji', char: '🎁' },
    { id: 'dice', name: 'Dés', type: 'emoji', char: '🎲' }
  ];

  var SYMBOL_IDS = SYMBOLS.map(function (s) { return s.id; });

  // Limites raisonnables (l'affichage du tableau complet reste fluide).
  var MAX_TICKETS = 10000;
  var MAX_NAME_LENGTH = 60;

  function getSymbol(id) {
    for (var i = 0; i < SYMBOLS.length; i++) {
      if (SYMBOLS[i].id === id) return SYMBOLS[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Générateur pseudo-aléatoire à graine                                 */
  /* ------------------------------------------------------------------ */

  // cyrb128 : transforme une chaîne en 4 entiers 32 bits (hachage rapide).
  function cyrb128(str) {
    var h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (var i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }

  // sfc32 : générateur rapide et de bonne qualité, nombres dans [0, 1[.
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  function createRng(seed) {
    var s = cyrb128(String(seed));
    var rng = sfc32(s[0], s[1], s[2], s[3]);
    // On « chauffe » le générateur pour bien mélanger l'état initial.
    for (var i = 0; i < 15; i++) rng();
    return rng;
  }

  // Entier aléatoire dans [0, n[.
  function randInt(rng, n) {
    return Math.floor(rng() * n);
  }

  // Petit hachage texte (empreinte du PIN, empreinte d'un tirage).
  function hashString(str) {
    var h = cyrb128(String(str));
    return h.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('');
  }

  // Seed lisible, ex. « CASINO-7KQ4-M2XP » (sans caractères ambigus).
  function randomSeed() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var values = new Uint32Array(8);
    var cryptoObj = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (cryptoObj && cryptoObj.getRandomValues) {
      cryptoObj.getRandomValues(values);
    } else {
      for (var i = 0; i < values.length; i++) values[i] = Math.floor(Math.random() * 4294967296);
    }
    var out = '';
    for (var j = 0; j < values.length; j++) {
      if (j === 4) out += '-';
      out += alphabet[values[j] % alphabet.length];
    }
    return 'CASINO-' + out;
  }

  /* ------------------------------------------------------------------ */
  /* Validation de la configuration                                       */
  /* ------------------------------------------------------------------ */

  function isPositiveInt(v) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 1;
  }

  /**
   * Vérifie une configuration { ticketCount, prizes: [{id, name, quantity, symbol}] }.
   * Retourne { ok, errors: [texte], warnings: [texte] }.
   */
  function validateConfig(config) {
    var errors = [];
    var warnings = [];
    if (!config || typeof config !== 'object') {
      return { ok: false, errors: ['Configuration absente.'], warnings: warnings };
    }
    var n = config.ticketCount;
    if (!isPositiveInt(n)) {
      errors.push('Le nombre de tickets doit être un nombre entier supérieur ou égal à 1.');
    } else if (n > MAX_TICKETS) {
      errors.push('Le nombre de tickets est limité à ' + MAX_TICKETS + '.');
    }

    var prizes = Array.isArray(config.prizes) ? config.prizes : [];
    if (!Array.isArray(config.prizes)) errors.push('La liste des lots est invalide.');
    if (prizes.length === 0) warnings.push('Aucun lot défini : tous les tickets seront perdants.');
    if (prizes.length > SYMBOLS.length) {
      errors.push('Au maximum ' + SYMBOLS.length + ' lots (un symbole unique par lot).');
    }

    var usedSymbols = {};
    var usedIds = {};
    var total = 0;
    prizes.forEach(function (p, i) {
      var label = 'Lot n°' + (i + 1) + (p && p.name ? ' (« ' + String(p.name).trim() + ' »)' : '');
      if (!p || typeof p !== 'object') {
        errors.push(label + ' : données invalides.');
        return;
      }
      if (!p.id || usedIds[p.id]) errors.push(label + ' : identifiant interne invalide ou en double.');
      usedIds[p.id] = true;

      var name = typeof p.name === 'string' ? p.name.trim() : '';
      if (!name) errors.push(label + ' : le nom du lot est obligatoire.');
      else if (name.length > MAX_NAME_LENGTH) errors.push(label + ' : nom trop long (' + MAX_NAME_LENGTH + ' caractères max).');

      if (!isPositiveInt(p.quantity)) {
        errors.push(label + ' : la quantité doit être un nombre entier supérieur ou égal à 1.');
      } else {
        total += p.quantity;
      }

      if (!getSymbol(p.symbol)) {
        errors.push(label + ' : choisissez un symbole.');
      } else if (usedSymbols[p.symbol]) {
        errors.push(label + ' : le symbole « ' + getSymbol(p.symbol).name + ' » est déjà utilisé par « ' + usedSymbols[p.symbol] + ' ».');
      } else {
        usedSymbols[p.symbol] = name || ('lot n°' + (i + 1));
      }
    });

    if (isPositiveInt(n) && total > n) {
      errors.push('Il y a ' + total + ' lots à gagner pour seulement ' + n + ' tickets : le total des quantités doit être inférieur ou égal au nombre de tickets.');
    }
    if (isPositiveInt(n) && total === n && n > 0 && prizes.length > 0) {
      warnings.push('Tous les tickets sont gagnants.');
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings, totalPrizes: total };
  }

  /* ------------------------------------------------------------------ */
  /* Tirage                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Génère le tirage : mélange de Fisher-Yates des tickets 1..N avec le
   * générateur à graine, puis attribution des lots dans l'ordre de la liste.
   * Un ticket ne peut recevoir qu'un seul lot (chaque position du mélange
   * n'est utilisée qu'une fois).
   *
   * Retourne { seed, ticketCount, assignments: { "12": "lot-1", ... }, fingerprint }.
   */
  function generateDraw(config, seed) {
    var check = validateConfig(config);
    if (!check.ok) {
      var err = new Error(check.errors.join('\n'));
      err.validation = check;
      throw err;
    }
    seed = String(seed == null ? '' : seed).trim();
    if (!seed) throw new Error('Le seed ne peut pas être vide.');

    var n = config.ticketCount;
    var rng = createRng('tirage|' + seed);
    var tickets = new Array(n);
    for (var i = 0; i < n; i++) tickets[i] = i + 1;
    for (var j = n - 1; j > 0; j--) {
      var k = randInt(rng, j + 1);
      var tmp = tickets[j]; tickets[j] = tickets[k]; tickets[k] = tmp;
    }

    var assignments = {};
    var pos = 0;
    config.prizes.forEach(function (p) {
      for (var q = 0; q < p.quantity; q++) {
        assignments[String(tickets[pos++])] = p.id;
      }
    });

    var draw = { seed: seed, ticketCount: n, assignments: assignments };
    draw.fingerprint = drawFingerprint(config, draw);
    return draw;
  }

  // Empreinte courte d'un tirage (pour comparer rapidement deux copies).
  function drawFingerprint(config, draw) {
    var keys = Object.keys(draw.assignments).map(Number).sort(function (a, b) { return a - b; });
    var parts = keys.map(function (t) {
      var p = findPrize(config, draw.assignments[String(t)]);
      return t + ':' + (p ? p.name + '/' + p.symbol : '?');
    });
    return hashString(draw.seed + '#' + draw.ticketCount + '#' + parts.join(',')).slice(0, 12).toUpperCase();
  }

  function findPrize(config, prizeId) {
    if (!config || !config.prizes || prizeId == null) return null;
    for (var i = 0; i < config.prizes.length; i++) {
      if (config.prizes[i].id === prizeId) return config.prizes[i];
    }
    return null;
  }

  // Lot prévu pour un ticket (objet lot) ou null si perdant.
  function prizeForTicket(config, draw, ticket) {
    if (!draw || !draw.assignments) return null;
    return findPrize(config, draw.assignments[String(ticket)]);
  }

  // Liste des gagnants par lot : [{ prize, tickets: [..triés..] }].
  function winnersByPrize(config, draw) {
    var map = {};
    (config.prizes || []).forEach(function (p) { map[p.id] = []; });
    if (draw && draw.assignments) {
      Object.keys(draw.assignments).forEach(function (t) {
        var id = draw.assignments[t];
        if (map[id]) map[id].push(Number(t));
      });
    }
    return (config.prizes || []).map(function (p) {
      return { prize: p, tickets: map[p.id].sort(function (a, b) { return a - b; }) };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Symboles affichés par les rouleaux                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Symboles finaux des 3 rouleaux pour un ticket.
   *  - gagnant : 3 fois le symbole du lot ;
   *  - perdant « presque gagné » : 2 symboles identiques (rouleaux 1 et 2),
   *    le 3e différent ;
   *  - perdant normal : 3 symboles tous différents.
   * Un perdant n'obtient JAMAIS trois symboles identiques.
   *
   * options : { nearMissEnabled: bool, nearMissPercent: 0..100 }
   * Retourne { symbols: [id, id, id], win: bool, nearMiss: bool }.
   */
  function reelSymbols(config, seed, ticket, prizeId, options) {
    var prize = findPrize(config, prizeId);
    if (prize) {
      return { symbols: [prize.symbol, prize.symbol, prize.symbol], win: true, nearMiss: false };
    }
    options = options || {};
    var rng = createRng('rouleaux|' + seed + '|' + ticket);
    var percent = Math.max(0, Math.min(100, Number(options.nearMissPercent) || 0));
    var nearMiss = !!options.nearMissEnabled && rng() * 100 < percent;
    var pool = SYMBOL_IDS.slice();

    if (nearMiss) {
      // Pour le suspense, la paire utilise de préférence le symbole d'un lot.
      var prizeSymbols = (config.prizes || []).map(function (p) { return p.symbol; })
        .filter(function (s) { return SYMBOL_IDS.indexOf(s) !== -1; });
      var pairSource = prizeSymbols.length ? prizeSymbols : pool;
      var pair = pairSource[randInt(rng, pairSource.length)];
      var others = pool.filter(function (s) { return s !== pair; });
      var other = others[randInt(rng, others.length)];
      return { symbols: [pair, pair, other], win: false, nearMiss: true };
    }

    // Trois symboles distincts (tirage sans remise).
    var picked = [];
    for (var i = 0; i < 3; i++) {
      var idx = randInt(rng, pool.length);
      picked.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return { symbols: picked, win: false, nearMiss: false };
  }

  /* ------------------------------------------------------------------ */
  /* Test de cohérence                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Vérifie un tirage. plays (facultatif) : { "12": { prizeId } }.
   * Retourne { ok, checks: [{ label, ok, detail }] }.
   */
  function verifyDraw(config, draw, plays, options) {
    var checks = [];
    function add(label, ok, detail) { checks.push({ label: label, ok: !!ok, detail: detail || '' }); }

    var v = validateConfig(config);
    add('Configuration valide', v.ok, v.ok ? '' : v.errors.join(' '));
    if (!draw || !draw.assignments) {
      add('Tirage présent', false, 'Aucun tirage généré.');
      return { ok: false, checks: checks };
    }
    add('Nombre de tickets identique à la configuration', draw.ticketCount === config.ticketCount,
      'tirage : ' + draw.ticketCount + ', configuration : ' + config.ticketCount);

    // 1. Chaque lot a le bon nombre de gagnants.
    var counts = {};
    var unknown = [];
    var outOfRange = [];
    Object.keys(draw.assignments).forEach(function (t) {
      var id = draw.assignments[t];
      var num = Number(t);
      if (!(num >= 1 && num <= config.ticketCount && Math.floor(num) === num)) outOfRange.push(t);
      if (!findPrize(config, id)) unknown.push(t);
      counts[id] = (counts[id] || 0) + 1;
    });
    var badCounts = (config.prizes || []).filter(function (p) { return (counts[p.id] || 0) !== p.quantity; })
      .map(function (p) { return p.name + ' : ' + (counts[p.id] || 0) + '/' + p.quantity; });
    add('Chaque lot a le bon nombre de gagnants', badCounts.length === 0,
      badCounts.length ? badCounts.join(' ; ') : (config.prizes || []).map(function (p) { return p.name + ' : ' + p.quantity; }).join(' ; '));
    add('Tous les numéros gagnants existent (1 à ' + config.ticketCount + ')', outOfRange.length === 0 && unknown.length === 0,
      outOfRange.length || unknown.length ? 'Problème : ' + outOfRange.concat(unknown).join(', ') : '');

    // 2. Aucun ticket n'a deux lots : chaque ticket n'apparaît qu'une fois
    //    et le nombre de gagnants = total des quantités.
    var total = (config.prizes || []).reduce(function (s, p) { return s + p.quantity; }, 0);
    var winnersCount = Object.keys(draw.assignments).length;
    add('Aucun ticket ne gagne deux lots', winnersCount === total,
      winnersCount + ' tickets gagnants pour ' + total + ' lots');

    // 3. Le tirage régénéré avec le seed est identique.
    var same = false;
    var regenDetail = '';
    try {
      var regen = generateDraw(config, draw.seed);
      var a = Object.keys(regen.assignments);
      same = a.length === winnersCount && a.every(function (t) { return regen.assignments[t] === draw.assignments[t]; });
      regenDetail = 'seed « ' + draw.seed + ' »' + (same ? ' → résultat identique' : ' → résultat DIFFÉRENT');
    } catch (e) {
      regenDetail = e.message;
    }
    add('Le seed redonne exactement le même tirage', same, regenDetail);

    // 4. Les rouleaux affichent toujours le résultat prévu.
    var reelErrors = [];
    for (var t = 1; t <= config.ticketCount; t++) {
      var pid = draw.assignments[String(t)];
      var r = reelSymbols(config, draw.seed, t, pid, options);
      var p = findPrize(config, pid);
      var triple = r.symbols[0] === r.symbols[1] && r.symbols[1] === r.symbols[2];
      if (p && !(triple && r.symbols[0] === p.symbol)) reelErrors.push(t);
      if (!p && triple) reelErrors.push(t);
      if (reelErrors.length > 10) break;
    }
    add('Les rouleaux affichent le résultat prévu (gagnant = 3 symboles du lot, perdant = jamais 3 identiques)',
      reelErrors.length === 0, reelErrors.length ? 'Tickets en erreur : ' + reelErrors.join(', ') : 'Vérifié pour les ' + config.ticketCount + ' tickets');

    // 5. Les parties déjà jouées correspondent au tirage.
    if (plays) {
      var mismatch = [];
      Object.keys(plays).forEach(function (t) {
        var expected = draw.assignments[t] || null;
        if ((plays[t].prizeId || null) !== expected) mismatch.push(t);
      });
      add('Les parties jouées correspondent au tirage', mismatch.length === 0,
        mismatch.length ? 'Tickets incohérents : ' + mismatch.join(', ') : Object.keys(plays).length + ' partie(s) vérifiée(s)');
    }

    return { ok: checks.every(function (c) { return c.ok; }), checks: checks };
  }

  return {
    SYMBOLS: SYMBOLS,
    SYMBOL_IDS: SYMBOL_IDS,
    MAX_TICKETS: MAX_TICKETS,
    getSymbol: getSymbol,
    createRng: createRng,
    hashString: hashString,
    randomSeed: randomSeed,
    validateConfig: validateConfig,
    generateDraw: generateDraw,
    drawFingerprint: drawFingerprint,
    findPrize: findPrize,
    prizeForTicket: prizeForTicket,
    winnersByPrize: winnersByPrize,
    reelSymbols: reelSymbols,
    verifyDraw: verifyDraw
  };
});
