/*
 * audio.js — Sons générés avec la Web Audio API (aucun fichier externe).
 *
 * Le contexte audio n'est créé qu'au premier geste de l'utilisateur
 * (exigence des navigateurs). Volume global + mode muet.
 */
(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var volume = 0.7;
  var muted = false;
  var lastTick = 0;
  var noiseBuffer = null;

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
      master = ctx.createGain();
      master.connect(ctx.destination);
      applyVolume();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function applyVolume() {
    if (master) master.gain.setValueAtTime(muted ? 0 : volume, ctx.currentTime);
  }

  // Oscillateur avec enveloppe simple (attaque courte, décroissance exponentielle).
  function tone(opts) {
    var c = ensure();
    if (!c || muted || volume === 0) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var dur = opts.duration || 0.2;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + dur);
    if (opts.vibrato) {
      var lfo = c.createOscillator();
      var lfoGain = c.createGain();
      lfo.frequency.value = opts.vibrato;
      lfoGain.gain.value = opts.freq * 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur);
    }
    var peak = opts.gain == null ? 0.3 : opts.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack || 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Bruit blanc filtré (claquement, souffle).
  function noise(opts) {
    var c = ensure();
    if (!c || muted || volume === 0) return;
    if (!noiseBuffer) {
      noiseBuffer = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    var t0 = c.currentTime + (opts.delay || 0);
    var dur = opts.duration || 0.1;
    var src = c.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = c.createBiquadFilter();
    filter.type = opts.filter || 'bandpass';
    filter.frequency.setValueAtTime(opts.freq || 1000, t0);
    if (opts.freqEnd) filter.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + dur);
    var gain = c.createGain();
    gain.gain.setValueAtTime(opts.gain || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  var Sound = {
    // À appeler sur un geste utilisateur pour débloquer l'audio.
    unlock: function () { ensure(); },

    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, Number(v)));
      if (ctx) applyVolume();
    },
    getVolume: function () { return volume; },
    setMuted: function (m) {
      muted = !!m;
      if (ctx) applyVolume();
    },
    isMuted: function () { return muted; },

    key: function () {
      tone({ freq: 880, type: 'square', duration: 0.06, gain: 0.08 });
    },

    error: function () {
      tone({ freq: 160, type: 'sawtooth', duration: 0.18, gain: 0.15 });
      tone({ freq: 120, type: 'sawtooth', duration: 0.25, gain: 0.15, delay: 0.2 });
    },

    // Levier / départ des rouleaux.
    spinStart: function () {
      noise({ freq: 400, freqEnd: 3000, duration: 0.35, gain: 0.25 });
      tone({ freq: 220, freqEnd: 660, type: 'triangle', duration: 0.3, gain: 0.15 });
    },

    // Cliquetis pendant la rotation (limité pour éviter la saturation).
    tick: function () {
      var now = performance.now();
      if (now - lastTick < 55) return;
      lastTick = now;
      tone({ freq: 1500 + Math.random() * 300, type: 'square', duration: 0.025, gain: 0.04 });
    },

    // Arrêt d'un rouleau (« clonk »).
    reelStop: function (index) {
      tone({ freq: 180 - index * 20, freqEnd: 60, type: 'triangle', duration: 0.18, gain: 0.45 });
      noise({ freq: 2500, duration: 0.05, gain: 0.25, filter: 'highpass' });
    },

    // Tension avant l'arrêt du dernier rouleau.
    suspense: function () {
      tone({ freq: 300, freqEnd: 900, type: 'sine', duration: 1.2, gain: 0.08, vibrato: 7 });
    },

    win: function () {
      var notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
      notes.forEach(function (f, i) {
        tone({ freq: f, type: 'square', duration: 0.18, gain: 0.12, delay: i * 0.12 });
        tone({ freq: f / 2, type: 'triangle', duration: 0.2, gain: 0.15, delay: i * 0.12 });
      });
      tone({ freq: 1046.5, type: 'square', duration: 0.9, gain: 0.12, delay: notes.length * 0.12, vibrato: 6 });
      // Pluie de pièces.
      for (var i = 0; i < 24; i++) {
        tone({ freq: 2000 + Math.random() * 1500, type: 'sine', duration: 0.12, gain: 0.06, delay: 1.0 + i * 0.09 });
      }
    },

    lose: function () {
      tone({ freq: 392, type: 'triangle', duration: 0.35, gain: 0.2 });
      tone({ freq: 370, type: 'triangle', duration: 0.35, gain: 0.2, delay: 0.38 });
      tone({ freq: 349, type: 'triangle', duration: 0.35, gain: 0.2, delay: 0.76 });
      tone({ freq: 330, freqEnd: 300, type: 'triangle', duration: 1.0, gain: 0.2, delay: 1.14, vibrato: 5 });
    }
  };

  window.Sound = Sound;
})();
