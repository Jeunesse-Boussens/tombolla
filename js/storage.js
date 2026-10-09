/*
 * storage.js — Sauvegarde de l'état dans localStorage + fichiers.
 *
 * Deux espaces de stockage strictement séparés :
 *   - « real » : la vraie soirée ;
 *   - « demo » : le mode démonstration (ne touche jamais aux données réelles).
 * Si localStorage est indisponible (navigation privée, réglage bloqué…),
 * on bascule sur une mémoire temporaire et l'interface affiche un avertissement.
 */
(function () {
  'use strict';

  var PREFIX = 'tombolaCasino.';
  var KEYS = {
    real: PREFIX + 'soiree.v1',
    demo: PREFIX + 'demo.v1',
    mode: PREFIX + 'mode',
    prefs: PREFIX + 'prefs'
  };

  var memory = {};
  var available = (function () {
    try {
      var k = PREFIX + '__test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })();
  var lastError = null;

  function getRaw(key) {
    if (!available) return memory[key] == null ? null : memory[key];
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      lastError = e;
      return memory[key] == null ? null : memory[key];
    }
  }

  // Retourne true si l'écriture a réussi dans localStorage.
  function setRaw(key, value) {
    memory[key] = value;
    if (!available) return false;
    try {
      window.localStorage.setItem(key, value);
      lastError = null;
      return true;
    } catch (e) {
      // Quota dépassé ou stockage bloqué en cours de route.
      lastError = e;
      return false;
    }
  }

  function removeRaw(key) {
    delete memory[key];
    if (!available) return;
    try { window.localStorage.removeItem(key); } catch (e) { lastError = e; }
  }

  function readJson(key) {
    var raw = getRaw(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      lastError = e;
      return null;
    }
  }

  /* --------------------------- Fichiers -------------------------------- */

  // Déclenche le téléchargement d'un fichier texte.
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }

  // Ouvre le sélecteur de fichier et retourne une promesse avec le texte lu.
  function pickTextFile(accept) {
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '.json,application/json';
      input.style.display = 'none';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        input.remove();
        if (!file) { reject(new Error('Aucun fichier choisi.')); return; }
        var reader = new FileReader();
        reader.onload = function () { resolve({ name: file.name, text: String(reader.result) }); };
        reader.onerror = function () { reject(new Error('Lecture du fichier impossible.')); };
        reader.readAsText(file, 'utf-8');
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  // Horodatage pour les noms de fichiers : 2026-12-31_23h15
  function fileStamp(date) {
    var d = date || new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + 'h' + p(d.getMinutes());
  }

  window.Store = {
    KEYS: KEYS,
    isAvailable: function () { return available; },
    lastError: function () { return lastError; },
    loadState: function (mode) { return readJson(KEYS[mode]); },
    saveState: function (mode, state) { return setRaw(KEYS[mode], JSON.stringify(state)); },
    clearState: function (mode) { removeRaw(KEYS[mode]); },
    getMode: function () { return getRaw(KEYS.mode) === 'demo' ? 'demo' : 'real'; },
    setMode: function (mode) { setRaw(KEYS.mode, mode); },
    loadPrefs: function () { return readJson(KEYS.prefs) || {}; },
    savePrefs: function (prefs) { setRaw(KEYS.prefs, JSON.stringify(prefs)); },
    download: download,
    pickTextFile: pickTextFile,
    fileStamp: fileStamp
  };
})();
