/*
 * slot.js — Écran de jeu : saisie du numéro, rouleaux animés,
 * effets jackpot (confettis, lumières, sons) et retour automatique.
 *
 * Les rouleaux affichent TOUJOURS le résultat prévu : les symboles finaux
 * viennent de App.play() (donc du tirage). Seuls les symboles qui défilent
 * pendant la rotation sont aléatoires (pure décoration).
 */
(function () {
  'use strict';

  var reels = [];
  var input = '';
  var busy = false;         // rotation en cours ou résultat affiché
  var resultTimer = null;
  var $ = function (id) { return document.getElementById(id); };

  /* --------------------------- Rouleaux --------------------------------- */

  function randomSymbol(exclude) {
    var ids = Draw.SYMBOL_IDS;
    var s;
    do { s = ids[Math.floor(Math.random() * ids.length)]; } while (exclude && exclude.indexOf(s) !== -1);
    return s;
  }

  function cellHtml(id) {
    return '<div class="cell">' + UI.symbolHtml(id) + '</div>';
  }

  // Position du rouleau : k = index (éventuellement fractionnaire) de la
  // case alignée sur la ligne de gain. Exprimé en unités CSS pour rester
  // juste même si la fenêtre change de taille.
  function setPos(reel, k) {
    reel.strip.style.transform = 'translate3d(0, calc(var(--reel-offset) - ' + k.toFixed(4) + ' * var(--cell)), 0)';
  }

  // Rouleau au repos : 3 cases (au-dessus, ligne de gain, en dessous).
  function setIdle(reel, center, above, below) {
    reel.center = center;
    reel.above = above || randomSymbol([center]);
    reel.below = below || randomSymbol([center, reel.above]);
    reel.strip.innerHTML = cellHtml(reel.above) + cellHtml(center) + cellHtml(reel.below);
    setPos(reel, 1);
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  /**
   * Fait tourner un rouleau pendant `duration` ms et l'arrête sur `target`.
   * Retourne une promesse résolue à l'arrêt.
   */
  function spinReel(reel, target, duration, slowEnd) {
    return new Promise(function (resolve) {
      var fillerCount = Math.max(12, Math.round(duration / 1000 * 13));
      var symbols = [reel.above, reel.center, reel.below];
      for (var i = 0; i < fillerCount; i++) symbols.push(randomSymbol([symbols[symbols.length - 1]]));
      var aboveT = randomSymbol([target, symbols[symbols.length - 1]]);
      var belowT = randomSymbol([target, aboveT]);
      symbols.push(aboveT, target, belowT);
      reel.strip.innerHTML = symbols.map(cellHtml).join('');

      var startK = 1;
      var endK = symbols.length - 2;
      var ease = slowEnd ? easeOutQuart : easeOutCubic;
      var t0 = performance.now();
      var lastCell = startK;
      reel.el.classList.add('spinning');

      function frame(now) {
        var p = Math.min(1, (now - t0) / duration);
        var k = startK + (endK - startK) * ease(p);
        setPos(reel, k);
        if (Math.floor(k) !== lastCell) {
          lastCell = Math.floor(k);
          Sound.tick();
        }
        if (p > 0.7) reel.el.classList.remove('spinning');
        if (p < 1) {
          requestAnimationFrame(frame);
        } else {
          setIdle(reel, target, aboveT, belowT);
          reel.inner.classList.remove('bounce');
          void reel.inner.offsetWidth; // relance l'animation CSS
          reel.inner.classList.add('bounce');
          resolve();
        }
      }
      requestAnimationFrame(frame);
    });
  }

  /* --------------------------- Confettis -------------------------------- */

  var Confetti = (function () {
    var canvas, ctx, particles = [], running = false, until = 0, raf = null;
    var colors = ['#ffd700', '#ffec8b', '#e3001b', '#ffffff', '#ff4fa3', '#22d3ee', '#4ade80'];

    function resize() {
      var dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(count, fromX, fromY, spread) {
      for (var i = 0; i < count; i++) {
        var angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
        var speed = 6 + Math.random() * 10;
        particles.push({
          x: fromX, y: fromY,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
          size: 6 + Math.random() * 9,
          color: colors[Math.floor(Math.random() * colors.length)],
          round: Math.random() < 0.3,
          life: 1
        });
      }
    }

    function step() {
      var w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      if (running && performance.now() < until && particles.length < 700) {
        // Pluie continue depuis le haut pendant l'effet.
        for (var r = 0; r < 4; r++) {
          particles.push({
            x: Math.random() * w, y: -20, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3,
            rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, size: 6 + Math.random() * 8,
            color: colors[Math.floor(Math.random() * colors.length)], round: Math.random() < 0.3, life: 1
          });
        }
      }
      particles = particles.filter(function (p) { return p.y < h + 40 && p.life > 0; });
      particles.forEach(function (p) {
        p.vy += 0.18;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2 * (0.4 + Math.abs(Math.sin(p.rot * 2))));
        }
        ctx.restore();
      });
      if (particles.length || (running && performance.now() < until)) {
        raf = requestAnimationFrame(step);
      } else {
        running = false;
        raf = null;
      }
    }

    return {
      init: function (c) {
        canvas = c;
        ctx = c.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
      },
      start: function (ms) {
        var w = window.innerWidth, h = window.innerHeight;
        running = true;
        until = performance.now() + (ms || 4000);
        spawn(120, w * 0.15, h, 1.2);
        spawn(120, w * 0.85, h, 1.2);
        spawn(80, w * 0.5, h * 0.6, 2.5);
        if (!raf) raf = requestAnimationFrame(step);
      },
      stop: function () {
        running = false;
        particles = [];
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  })();

  /* ------------------------- Saisie & messages -------------------------- */

  function maxDigits() {
    var n = App.state.draw ? App.state.draw.ticketCount : App.state.config.ticketCount;
    return String(n || 1).length;
  }

  function renderInput() {
    var v = $('ticket-value');
    v.textContent = input || '—';
    v.classList.toggle('empty', !input);
  }

  function setMessage(html, kind) {
    var m = $('game-message');
    m.innerHTML = html;
    m.className = 'game-message' + (kind ? ' msg-' + kind : '');
    if (kind === 'error') {
      void m.offsetWidth;
      m.classList.add('shake');
    }
  }

  function defaultMessage() {
    setMessage('Entrez votre numéro de ticket');
  }

  function pressKey(key) {
    if (busy) return;
    Sound.unlock();
    if (key === 'clear') input = '';
    else if (key === 'back') input = input.slice(0, -1);
    else if (/^[0-9]$/.test(key)) {
      if (input === '' && key === '0') return;
      if (input.length >= maxDigits()) { Sound.error(); return; }
      input += key;
    }
    Sound.key();
    renderInput();
    if ($('game-message').classList.contains('msg-error')) defaultMessage();
  }

  /* ------------------------------ Partie -------------------------------- */

  function play(force) {
    if (busy) return;
    Sound.unlock();
    App.keepAwake();
    var result = App.play(input, force);
    if (!result.ok) {
      var c = result.check;
      Sound.error();
      if (c.code === 'played') {
        var html = '⛔ Ticket n°' + c.ticket + ' : ce ticket a déjà joué !';
        if (App.isDemo()) html += ' <button type="button" class="btn btn-small" id="btn-replay">Rejouer (démo)</button>';
        setMessage(html, 'error');
        var replay = $('btn-replay');
        if (replay) replay.addEventListener('click', function () { play(true); });
      } else {
        setMessage('⛔ ' + UI.escapeHtml(c.message), 'error');
      }
      return;
    }
    runSpin(result);
  }

  function runSpin(result) {
    busy = true;
    document.body.classList.add('game-busy');
    var machine = $('machine-frame');
    machine.classList.add('is-spinning');
    setMessage('🍀 Bonne chance, ticket n°' + result.ticket + ' !', 'info');
    Sound.spinStart();

    var sym = result.reel.symbols;
    var twoMatch = sym[0] === sym[1];
    var durations = [1900, 2700, twoMatch ? 5200 : 3500];
    var stops = reels.map(function (reel, i) {
      return spinReel(reel, sym[i], durations[i], i === 2 && twoMatch).then(function () {
        Sound.reelStop(i);
        if (i === 1 && twoMatch) {
          reels[2].el.classList.add('suspense');
          Sound.suspense();
          setMessage('😮 Encore un…', 'info');
        }
      });
    });

    Promise.all(stops).then(function () {
      machine.classList.remove('is-spinning');
      reels[2].el.classList.remove('suspense');
      if (result.prize) {
        machine.classList.add('is-jackpot');
        document.body.classList.add('jackpot');
        reels.forEach(function (r) { r.el.classList.add('win'); });
        Sound.win();
        Confetti.start(5000);
        setMessage('🎉 JACKPOT ! 🎉', 'win');
        setTimeout(function () { showResult(result); }, 1100);
      } else {
        setTimeout(function () { Sound.lose(); }, 250);
        setMessage('Pas de chance…', 'lose');
        setTimeout(function () { showResult(result); }, 1300);
      }
    });
  }

  function showResult(result) {
    var card = $('result-card');
    var s = App.state.settings;
    var delay;
    if (result.prize) {
      delay = Math.max(3, Number(s.returnDelayWin) || 15);
      card.className = 'result-card result-win';
      card.innerHTML =
        '<div class="jackpot-title">JACKPOT !</div>' +
        '<div class="result-symbols">' + result.reel.symbols.map(function (id) { return UI.symbolHtml(id); }).join('') + '</div>' +
        '<div class="result-ticket">Ticket n° ' + result.ticket + '</div>' +
        '<div class="result-label">Vous gagnez</div>' +
        '<div class="result-prize">' + UI.escapeHtml(result.prize.name) + '</div>' +
        '<div class="result-hint">Présentez votre ticket à l’organisation 🎉</div>';
    } else {
      delay = Math.max(2, Number(s.returnDelayLose) || 7);
      card.className = 'result-card result-lose';
      card.innerHTML =
        '<div class="lose-title">Pas de chance…</div>' +
        '<div class="result-ticket">Ticket n° ' + result.ticket + '</div>' +
        '<div class="lose-text">Merci d’avoir joué, et bonne année ! 🥂</div>';
    }
    var overlay = $('result-overlay');
    overlay.hidden = false;
    overlay.classList.toggle('is-win', !!result.prize);
    var bar = $('result-countdown-bar');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = 'width ' + delay + 's linear';
    bar.style.width = '0%';
    clearTimeout(resultTimer);
    // Petit délai avant d'accepter un clic, pour éviter une fermeture accidentelle.
    overlay.dataset.ready = '0';
    setTimeout(function () { overlay.dataset.ready = '1'; }, 800);
    resultTimer = setTimeout(closeResult, delay * 1000);
  }

  function closeResult() {
    clearTimeout(resultTimer);
    resultTimer = null;
    $('result-overlay').hidden = true;
    Confetti.stop();
    document.body.classList.remove('jackpot', 'game-busy');
    $('machine-frame').classList.remove('is-jackpot');
    reels.forEach(function (r) { r.el.classList.remove('win'); });
    busy = false;
    input = '';
    renderInput();
    defaultMessage();
  }

  /* --------------------------- Affichage -------------------------------- */

  function refresh() {
    var s = App.state;
    $('game-title').textContent = s.title || 'Grande Tombola du Nouvel An';
    var status = App.status();
    var nr = $('not-ready');
    nr.hidden = status === 'ready';
    if (status === 'unconfigured') {
      $('not-ready-text').textContent = 'Aucun tirage n’a encore été configuré.';
    } else if (status === 'unlocked') {
      $('not-ready-text').textContent = 'Le tirage est prêt mais pas encore verrouillé. Verrouillez-le en administration pour ouvrir le jeu.';
    }
    $('not-ready-admin').textContent = App.hasPin() || App.isDemo() ? '⚙ Administration' : '⚙ Configurer la soirée';
    $('not-ready-demo').hidden = App.isDemo();
    $('btn-mute').textContent = App.prefs.muted ? '🔇' : '🔊';
    $('btn-mute').title = App.prefs.muted ? 'Activer le son' : 'Couper le son';
    if (input.length > maxDigits()) { input = ''; }
    renderInput();
    fitLayout();
  }

  // Ajuste --fit pour que la machine et le pavé tiennent dans l'écran,
  // quelle que soit sa taille (tablette, ordinateur, bannière démo affichée…).
  function fitLayout() {
    var screen = $('screen-game');
    if (screen.hidden) return;
    var fit = 1;
    screen.style.setProperty('--fit', '1');
    var parts = [$('machine-frame'), $('game-message'), document.querySelector('.panel')];
    function overflows() {
      var box = screen.getBoundingClientRect();
      var top = document.querySelector('.game-main').getBoundingClientRect().top;
      return parts.some(function (el) {
        var r = el.getBoundingClientRect();
        return r.bottom > box.bottom - 2 || r.top < top - 1 || r.right > box.right + 1 || r.left < box.left - 1;
      });
    }
    while (fit > 0.5 && overflows()) {
      fit -= 0.04;
      screen.style.setProperty('--fit', fit.toFixed(2));
    }
  }

  function fillBulbs() {
    document.querySelectorAll('[data-bulbs]').forEach(function (row) {
      var n = Number(row.getAttribute('data-bulbs'));
      var html = '';
      for (var i = 0; i < n; i++) html += '<span class="bulb"></span>';
      row.innerHTML = html;
    });
  }

  function onKeyDown(e) {
    if (App.screen !== 'game' || UI.isModalOpen()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var overlay = $('result-overlay');
    if (!overlay.hidden) {
      if ((e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') && overlay.dataset.ready === '1') {
        e.preventDefault();
        closeResult();
      }
      return;
    }
    if (!$('not-ready').hidden) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pressKey(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); pressKey('back'); }
    else if (e.key === 'Escape' || e.key === 'Delete') { e.preventDefault(); pressKey('clear'); }
    else if (e.key === 'Enter') { e.preventDefault(); play(false); }
  }

  var SlotGame = {
    init: function () {
      fillBulbs();
      document.querySelectorAll('#reels .reel').forEach(function (el) {
        var reel = { el: el, inner: el.querySelector('.reel-inner'), strip: el.querySelector('.strip') };
        reels.push(reel);
      });
      // Position de départ : trois symboles différents.
      var start = [randomSymbol()];
      start.push(randomSymbol(start));
      start.push(randomSymbol(start));
      reels.forEach(function (r, i) { setIdle(r, start[i]); });
      Confetti.init($('confetti'));

      $('keypad').addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-key]');
        if (btn) pressKey(btn.getAttribute('data-key'));
      });
      $('btn-play').addEventListener('click', function () { play(false); });
      $('result-overlay').addEventListener('click', function () {
        if ($('result-overlay').dataset.ready === '1') closeResult();
      });
      document.addEventListener('keydown', onKeyDown);

      $('btn-mute').addEventListener('click', function () {
        App.setMuted(!App.prefs.muted);
        Sound.unlock();
        if (!App.prefs.muted) Sound.key();
      });
      $('btn-fullscreen').addEventListener('click', function () { App.toggleFullscreen(); });
      $('btn-admin').addEventListener('click', function () { if (!busy) App.requestAdmin(); });
      $('not-ready-admin').addEventListener('click', function () { App.requestAdmin(); });
      $('not-ready-demo').addEventListener('click', function () {
        App.loadMode('demo');
        App.showScreen('game');
        UI.toast('Mode démo activé : les données de la soirée ne sont pas touchées.', 'success');
      });

      $('demo-reset').addEventListener('click', function () {
        App.resetDemo();
        if (App.screen === 'admin') Admin.render();
        UI.toast('Démo réinitialisée : tous les tickets peuvent rejouer.', 'success');
      });
      $('demo-quit').addEventListener('click', function () {
        if (busy) return;
        App.loadMode('real');
        App.showScreen('game');
        UI.toast('Retour aux données de la soirée.', 'success');
      });

      App.onChange(function () { if (App.screen === 'game') refresh(); });
      var resizeTimer = null;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fitLayout, 120);
      });
      defaultMessage();
    },

    onShow: function () {
      refresh();
    },

    isBusy: function () { return busy; }
  };

  window.SlotGame = SlotGame;
})();
