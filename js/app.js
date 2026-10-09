/*
 * app.js — Cœur de l'application : état, modes (soirée / démo),
 * actions (jouer, annuler, tirage, verrouillage, import/export),
 * navigation entre les écrans, plein écran et maintien de l'écran allumé.
 *
 * Modèle de données (un objet par mode, sauvegardé dans localStorage) :
 * {
 *   version, title,
 *   config:   { ticketCount, prizes: [{ id, name, quantity, symbol }] },
 *   seedDraft: seed proposé avant génération,
 *   draw:     null | { seed, ticketCount, assignments: { "12": "lot-1" }, fingerprint,
 *                      generatedAt, locked, lockedAt },
 *   plays:    { "12": { time, prizeId } },
 *   log:      [{ time, type, ticket, prizeId, prizeName, message }],
 *   settings: { nearMissEnabled, nearMissPercent, returnDelayWin, returnDelayLose },
 *   pinHash, lastBackupAt, nextPrizeId
 * }
 */
(function () {
  'use strict';

  var FORMAT = 'tombola-casino';
  var STATE_VERSION = 1;

  var App = {
    mode: 'real',
    state: null,
    prefs: { volume: 0.7, muted: false },
    lastSaveOk: true,
    listeners: []
  };

  /* ------------------------------ État ---------------------------------- */

  function defaultSettings() {
    return { nearMissEnabled: true, nearMissPercent: 30, returnDelayWin: 15, returnDelayLose: 7 };
  }

  function emptyState() {
    return {
      version: STATE_VERSION,
      title: 'Grande Tombola du Nouvel An',
      config: { ticketCount: 200, prizes: [] },
      seedDraft: Draw.randomSeed(),
      draw: null,
      plays: {},
      log: [],
      settings: defaultSettings(),
      pinHash: null,
      lastBackupAt: null,
      playsAtLastBackup: 0,
      nextPrizeId: 1
    };
  }

  // Lots fictifs pour présenter le concept à l'organisation.
  function demoState() {
    var s = emptyState();
    s.title = 'Tombola du Nouvel An — Démo';
    s.config = {
      ticketCount: 100,
      prizes: [
        { id: 'lot-1', name: 'Week-end pour deux', quantity: 1, symbol: 'seven' },
        { id: 'lot-2', name: 'Panier garni du terroir', quantity: 2, symbol: 'diamond' },
        { id: 'lot-3', name: 'Bouteille de champagne', quantity: 4, symbol: 'champagne' },
        { id: 'lot-4', name: 'Bon d’achat 20 CHF', quantity: 6, symbol: 'bell' },
        { id: 'lot-5', name: 'Boîte de chocolats', quantity: 10, symbol: 'cherry' }
      ]
    };
    s.nextPrizeId = 6;
    s.settings.nearMissPercent = 35;
    s.seedDraft = 'DEMO-NOUVEL-AN';
    var draw = Draw.generateDraw(s.config, s.seedDraft);
    var now = new Date().toISOString();
    draw.generatedAt = now;
    draw.locked = true;
    draw.lockedAt = now;
    s.draw = draw;
    s.log.push({ time: now, type: 'systeme', message: 'Démo chargée (100 tickets, 5 lots, seed DEMO-NOUVEL-AN)' });
    return s;
  }

  // Complète un état chargé (anciennes versions, champs manquants).
  function normalize(s) {
    var base = emptyState();
    if (!s || typeof s !== 'object') return base;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = s[k] !== undefined ? s[k] : base[k]; });
    out.settings = Object.assign(defaultSettings(), s.settings || {});
    out.config = out.config && typeof out.config === 'object' ? out.config : base.config;
    if (!Array.isArray(out.config.prizes)) out.config.prizes = [];
    out.plays = out.plays && typeof out.plays === 'object' ? out.plays : {};
    out.log = Array.isArray(out.log) ? out.log : [];
    var maxId = 0;
    out.config.prizes.forEach(function (p) {
      var m = /(\d+)$/.exec(p.id || '');
      if (m) maxId = Math.max(maxId, Number(m[1]));
    });
    out.nextPrizeId = Math.max(Number(out.nextPrizeId) || 1, maxId + 1);
    return out;
  }

  App.save = function () {
    App.lastSaveOk = Store.saveState(App.mode, App.state);
    App.emit();
    return App.lastSaveOk;
  };

  App.onChange = function (fn) { App.listeners.push(fn); };
  App.emit = function () { App.listeners.forEach(function (fn) { fn(); }); };

  App.isDemo = function () { return App.mode === 'demo'; };

  App.addLog = function (type, data) {
    var entry = Object.assign({ time: new Date().toISOString(), type: type }, data || {});
    App.state.log.push(entry);
    return entry;
  };

  App.getPrize = function (id) { return Draw.findPrize(App.state.config, id); };

  // 'unconfigured' (aucun tirage) | 'unlocked' (tirage non verrouillé) | 'ready'
  App.status = function () {
    var d = App.state.draw;
    if (!d) return 'unconfigured';
    if (!d.locked) return 'unlocked';
    return 'ready';
  };

  App.isLocked = function () { return !!(App.state.draw && App.state.draw.locked); };

  /* ---------------------------- Partie ---------------------------------- */

  /**
   * Vérifie un numéro avant de jouer.
   * Retourne { ok, code: 'notready'|'invalid'|'played', message }.
   */
  App.checkTicket = function (value) {
    if (App.status() !== 'ready') {
      return { ok: false, code: 'notready', message: 'La machine n’est pas encore prête.' };
    }
    var n = App.state.draw.ticketCount;
    var str = String(value == null ? '' : value).trim();
    var num = Number(str);
    if (!str || !/^\d+$/.test(str) || num < 1 || num > n) {
      return { ok: false, code: 'invalid', message: 'Numéro invalide : entrez un numéro entre 1 et ' + n + '.' };
    }
    if (App.state.plays[String(num)]) {
      return { ok: false, code: 'played', ticket: num, message: 'Ce ticket a déjà joué !' };
    }
    return { ok: true, ticket: num };
  };

  /**
   * Enregistre la partie (AVANT l'animation, pour qu'un rechargement de
   * page pendant la rotation ne permette pas de rejouer) et renvoie les
   * symboles à afficher. force = rejouer (démo uniquement).
   */
  App.play = function (value, force) {
    var check = App.checkTicket(value);
    if (!check.ok && !(force && App.isDemo() && check.code === 'played')) return { ok: false, check: check };
    var ticket = check.ticket;
    var draw = App.state.draw;
    var prizeId = draw.assignments[String(ticket)] || null;
    var prize = App.getPrize(prizeId);
    var reel = Draw.reelSymbols(App.state.config, draw.seed, ticket, prizeId, App.state.settings);
    var time = new Date().toISOString();
    App.state.plays[String(ticket)] = { time: time, prizeId: prizeId };
    App.addLog('partie', {
      ticket: ticket,
      prizeId: prizeId,
      prizeName: prize ? prize.name : null,
      message: (prize ? 'Gagné : ' + prize.name : 'Perdu') + (force ? ' (rejoué en démo)' : '')
    });
    App.save();
    return { ok: true, ticket: ticket, prize: prize, reel: reel };
  };

  // Annule une partie (erreur de saisie) : le ticket redevient « non joué ».
  App.cancelPlay = function (ticket, reason) {
    var key = String(ticket);
    var play = App.state.plays[key];
    if (!play) return false;
    var prize = App.getPrize(play.prizeId);
    delete App.state.plays[key];
    App.addLog('annulation', {
      ticket: Number(ticket),
      prizeId: play.prizeId,
      prizeName: prize ? prize.name : null,
      message: 'Partie annulée (jouée à ' + UI.formatTime(play.time) + ')' + (reason ? ' — ' + reason : '')
    });
    App.save();
    return true;
  };

  /* ------------------------- Statistiques ------------------------------- */

  App.stats = function () {
    var s = App.state;
    var n = s.draw ? s.draw.ticketCount : s.config.ticketCount;
    var played = Object.keys(s.plays).length;
    var wonByPrize = {};
    var wins = [];
    Object.keys(s.plays).forEach(function (t) {
      var pid = s.plays[t].prizeId;
      if (pid) {
        wonByPrize[pid] = (wonByPrize[pid] || 0) + 1;
        wins.push({ ticket: Number(t), prizeId: pid, time: s.plays[t].time });
      }
    });
    wins.sort(function (a, b) { return a.time < b.time ? 1 : -1; });
    var prizes = s.config.prizes.map(function (p) {
      var won = wonByPrize[p.id] || 0;
      return { prize: p, won: won, remaining: p.quantity - won };
    });
    return { total: n, played: played, remaining: n - played, prizes: prizes, wins: wins };
  };

  /* ---------------------- Configuration & tirage ------------------------ */

  App.newPrizeId = function () { return 'lot-' + (App.state.nextPrizeId++); };

  // Remplace la configuration (refusé si verrouillé). Invalide le tirage existant.
  App.setConfig = function (config) {
    if (App.isLocked()) throw new Error('Le tirage est verrouillé : la configuration ne peut plus être modifiée.');
    App.state.config = config;
    if (App.state.draw) {
      App.state.draw = null;
      App.addLog('systeme', { message: 'Configuration modifiée : tirage précédent effacé' });
    }
    App.save();
  };

  App.generate = function (seed) {
    if (App.isLocked()) throw new Error('Le tirage est verrouillé.');
    if (Object.keys(App.state.plays).length) throw new Error('Des parties ont déjà été jouées.');
    var draw = Draw.generateDraw(App.state.config, seed);
    draw.generatedAt = new Date().toISOString();
    draw.locked = false;
    draw.lockedAt = null;
    App.state.draw = draw;
    App.state.seedDraft = draw.seed;
    App.addLog('tirage', { message: 'Tirage généré — seed « ' + draw.seed + ' », empreinte ' + draw.fingerprint });
    App.save();
    return draw;
  };

  App.lock = function () {
    if (!App.state.draw) throw new Error('Générez d’abord le tirage.');
    App.state.draw.locked = true;
    App.state.draw.lockedAt = new Date().toISOString();
    App.addLog('verrouillage', { message: 'Tirage verrouillé — empreinte ' + App.state.draw.fingerprint });
    App.save();
  };

  // Démo uniquement : permet de montrer la configuration et le tirage.
  App.unlockDemo = function () {
    if (!App.isDemo() || !App.state.draw) return;
    App.state.draw.locked = false;
    App.state.plays = {};
    App.addLog('systeme', { message: 'Démo : tirage déverrouillé, parties effacées' });
    App.save();
  };

  App.verify = function () {
    return Draw.verifyDraw(App.state.config, App.state.draw, App.state.plays, App.state.settings);
  };

  // Réinitialisation complète du mode courant (le PIN est conservé).
  App.resetAll = function (keepConfig) {
    var old = App.state;
    var s = emptyState();
    s.pinHash = old.pinHash;
    s.title = old.title;
    s.settings = old.settings;
    if (keepConfig) {
      s.config = old.config;
      s.nextPrizeId = old.nextPrizeId;
    }
    App.state = s;
    App.addLog('systeme', { message: 'Réinitialisation complète' + (keepConfig ? ' (lots conservés)' : '') });
    App.save();
  };

  /* --------------------------- Code PIN --------------------------------- */

  function pinHash(pin) { return Draw.hashString('pin|tombola|' + pin); }
  App.hasPin = function () { return !!App.state.pinHash; };
  App.checkPin = function (pin) { return !!App.state.pinHash && pinHash(pin) === App.state.pinHash; };
  App.setPin = function (pin) {
    App.state.pinHash = pinHash(pin);
    App.addLog('systeme', { message: 'Code PIN défini' });
    App.save();
  };

  /* ------------------------------ Modes --------------------------------- */

  App.loadMode = function (mode) {
    App.mode = mode === 'demo' ? 'demo' : 'real';
    Store.setMode(App.mode);
    var loaded = Store.loadState(App.mode);
    if (loaded) {
      App.state = normalize(loaded);
    } else {
      App.state = App.mode === 'demo' ? demoState() : emptyState();
      App.save();
    }
    document.body.classList.toggle('is-demo', App.isDemo());
    App.emit();
  };

  App.resetDemo = function () {
    if (!App.isDemo()) return;
    App.state = demoState();
    App.save();
  };

  /* ------------------------- Export / import ---------------------------- */

  function drawPayload() {
    var s = App.state;
    return {
      format: FORMAT,
      kind: 'tirage',
      version: STATE_VERSION,
      exportedAt: new Date().toISOString(),
      mode: App.mode,
      title: s.title,
      config: s.config,
      draw: s.draw,
      winners: Draw.winnersByPrize(s.config, s.draw).map(function (g) {
        return { lot: g.prize.name, symbole: Draw.getSymbol(g.prize.symbol).name, tickets: g.tickets };
      })
    };
  }

  function backupPayload() {
    var s = JSON.parse(JSON.stringify(App.state));
    delete s.pinHash; // le PIN reste propre à l'appareil
    return {
      format: FORMAT,
      kind: 'sauvegarde',
      version: STATE_VERSION,
      exportedAt: new Date().toISOString(),
      mode: App.mode,
      state: s
    };
  }

  function prefix() { return App.isDemo() ? 'DEMO_' : ''; }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // CSV au format « Excel français » : séparateur « ; » et BOM UTF-8.
  function toCsv(rows) {
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n') + '\r\n';
  }

  App.exportDrawJson = function () {
    Store.download(prefix() + 'tirage_' + Store.fileStamp() + '.json', JSON.stringify(drawPayload(), null, 2), 'application/json');
  };

  App.exportDrawCsv = function () {
    var s = App.state;
    var rows = [['Ticket', 'Résultat', 'Symbole', 'Joué', 'Heure de jeu']];
    for (var t = 1; t <= s.draw.ticketCount; t++) {
      var p = App.getPrize(s.draw.assignments[String(t)]);
      var play = s.plays[String(t)];
      rows.push([t, p ? p.name : 'perdu', p ? Draw.getSymbol(p.symbol).name : '', play ? 'oui' : 'non', play ? UI.formatDateTime(play.time) : '']);
    }
    Store.download(prefix() + 'tirage_' + Store.fileStamp() + '.csv', toCsv(rows), 'text/csv');
  };

  App.exportLogCsv = function () {
    var rows = [['Date et heure', 'Type', 'Ticket', 'Lot', 'Détail']];
    App.state.log.forEach(function (e) {
      rows.push([UI.formatDateTime(e.time), e.type, e.ticket || '', e.prizeName || '', e.message || '']);
    });
    Store.download(prefix() + 'journal_' + Store.fileStamp() + '.csv', toCsv(rows), 'text/csv');
  };

  App.exportLogJson = function () {
    var payload = { format: FORMAT, kind: 'journal', exportedAt: new Date().toISOString(), mode: App.mode, log: App.state.log };
    Store.download(prefix() + 'journal_' + Store.fileStamp() + '.json', JSON.stringify(payload, null, 2), 'application/json');
  };

  App.downloadBackup = function () {
    Store.download(prefix() + 'sauvegarde_tombola_' + Store.fileStamp() + '.json', JSON.stringify(backupPayload(), null, 2), 'application/json');
    App.state.lastBackupAt = new Date().toISOString();
    App.state.playsAtLastBackup = Object.keys(App.state.plays).length;
    App.save();
  };

  // Faut-il rappeler de faire une sauvegarde ? (parties jouées depuis la dernière)
  App.backupReminder = function () {
    var played = Object.keys(App.state.plays).length;
    var last = App.state.lastBackupAt;
    if (!App.state.draw) return null;
    if (!last) return 'Aucune sauvegarde sur fichier n’a encore été faite.';
    var since = played - (App.state.playsAtLastBackup || 0);
    var minutes = Math.round((Date.now() - new Date(last).getTime()) / 60000);
    if (since > 0 && (minutes >= 30 || since >= 20)) {
      return since + ' partie(s) jouée(s) depuis la dernière sauvegarde (il y a ' + minutes + ' min).';
    }
    return null;
  };

  /**
   * Analyse un fichier importé (tirage ou sauvegarde).
   * Retourne { ok, error } ou { ok, kind, state, warnings, summary }.
   */
  App.parseImport = function (text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'Ce fichier n’est pas un fichier JSON valide.' }; }
    if (!data || data.format !== FORMAT) return { ok: false, error: 'Ce fichier ne provient pas de la tombola casino.' };

    var src;
    if (data.kind === 'tirage') {
      src = { title: data.title, config: data.config, draw: data.draw, plays: {}, log: [] };
    } else if (data.kind === 'sauvegarde' && data.state) {
      src = data.state;
    } else {
      return { ok: false, error: 'Type de fichier non reconnu (attendu : tirage ou sauvegarde).' };
    }
    var v = Draw.validateConfig(src.config);
    if (!v.ok) return { ok: false, error: 'Configuration invalide dans le fichier : ' + v.errors.join(' ') };
    if (!src.draw || !src.draw.assignments || !src.draw.seed) return { ok: false, error: 'Le fichier ne contient pas de tirage.' };

    var state = normalize(src);
    var warnings = [];
    var check = Draw.verifyDraw(state.config, state.draw, state.plays, state.settings);
    check.checks.forEach(function (c) { if (!c.ok) warnings.push(c.label + (c.detail ? ' (' + c.detail + ')' : '')); });
    return {
      ok: true,
      kind: data.kind,
      fileMode: data.mode,
      state: state,
      warnings: warnings,
      summary: state.config.ticketCount + ' tickets, ' + state.config.prizes.length + ' lot(s), seed « ' + state.draw.seed +
        ' », ' + Object.keys(state.plays).length + ' partie(s) jouée(s)'
    };
  };

  App.applyImport = function (parsed, fileName) {
    var state = parsed.state;
    state.pinHash = App.state.pinHash; // on garde le PIN de cet appareil
    if (!state.draw.locked) {
      state.draw.locked = true;
      state.draw.lockedAt = new Date().toISOString();
    }
    App.state = state;
    App.addLog(parsed.kind === 'tirage' ? 'import' : 'restauration', {
      message: (parsed.kind === 'tirage' ? 'Tirage importé' : 'Sauvegarde restaurée') + ' depuis « ' + fileName + ' »' +
        (parsed.warnings.length ? ' — AVERTISSEMENTS : ' + parsed.warnings.join(' ; ') : '')
    });
    App.save();
  };

  /* ---------------------------- Écrans ---------------------------------- */

  App.screen = 'game';
  App.showScreen = function (name) {
    App.screen = name;
    ['game', 'admin', 'print'].forEach(function (s) {
      document.getElementById('screen-' + s).hidden = s !== name;
    });
    document.body.setAttribute('data-screen', name);
    if (name === 'game') SlotGame.onShow();
    if (name === 'admin') Admin.render();
  };

  // Accès à l'administration : PIN obligatoire pour la vraie soirée.
  App.requestAdmin = function () {
    if (App.isDemo()) { App.showScreen('admin'); return; }
    if (!App.hasPin()) {
      createPin().then(function (ok) { if (ok) App.showScreen('admin'); });
      return;
    }
    UI.pinPad('Administration', 'Entrez le code PIN de l’organisateur.').then(function (pin) {
      if (pin == null) return;
      if (App.checkPin(pin)) App.showScreen('admin');
      else { Sound.error(); UI.toast('Code PIN incorrect.', 'error'); }
    });
  };

  function createPin() {
    return UI.pinPad('Créer le code PIN', 'Première configuration : choisissez un code PIN (4 à 8 chiffres). Il protégera l’administration pendant la soirée. <strong>Notez-le !</strong>')
      .then(function (pin1) {
        if (pin1 == null) return false;
        return UI.pinPad('Confirmer le code PIN', 'Saisissez à nouveau le même code.').then(function (pin2) {
          if (pin2 == null) return false;
          if (pin1 !== pin2) {
            return UI.alert('Codes différents', 'Les deux codes ne correspondent pas. Recommencez.').then(function () { return false; });
          }
          App.setPin(pin1);
          UI.toast('Code PIN enregistré.', 'success');
          return true;
        });
      });
  }
  App.createPin = createPin;

  /* -------------------- Plein écran & écran allumé ---------------------- */

  var wakeLock = null;
  App.keepAwake = function () {
    if (!('wakeLock' in navigator) || wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* non disponible : sans conséquence */ });
  };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') App.keepAwake();
  });

  App.isFullscreen = function () {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  };
  App.toggleFullscreen = function () {
    var d = document.documentElement;
    try {
      if (App.isFullscreen()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else if (d.requestFullscreen) {
        d.requestFullscreen().catch(function () { UI.toast('Plein écran refusé par le navigateur.', 'error'); });
      } else if (d.webkitRequestFullscreen) {
        d.webkitRequestFullscreen();
      } else {
        UI.toast('Plein écran non disponible : utilisez le menu du navigateur.', 'error');
      }
    } catch (e) {
      UI.toast('Plein écran non disponible.', 'error');
    }
    App.keepAwake();
  };

  /* -------------------------- Préférences ------------------------------- */

  App.setVolume = function (v) {
    App.prefs.volume = v;
    Sound.setVolume(v);
    Store.savePrefs(App.prefs);
  };
  App.setMuted = function (m) {
    App.prefs.muted = m;
    Sound.setMuted(m);
    Store.savePrefs(App.prefs);
    App.emit();
  };

  /* ---------------------------- Démarrage ------------------------------- */

  App.init = function () {
    App.prefs = Object.assign({ volume: 0.7, muted: false }, Store.loadPrefs());
    Sound.setVolume(App.prefs.volume);
    Sound.setMuted(App.prefs.muted);

    if (!Store.isAvailable()) document.body.classList.add('no-storage');

    App.loadMode(Store.getMode());
    SlotGame.init();
    Admin.init();
    App.showScreen('game');

    // Avertissement en cas de fermeture / rechargement pendant la soirée.
    window.addEventListener('beforeunload', function (e) {
      if (!App.isDemo() && App.isLocked()) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });

    // Signale un échec d'écriture (quota, stockage bloqué en cours de route).
    App.onChange(function () {
      document.body.classList.toggle('save-failed', Store.isAvailable() && !App.lastSaveOk);
    });

    App.keepAwake();
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', App.init);
})();
