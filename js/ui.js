/*
 * ui.js — Petits outils d'interface : fenêtres modales (confirmation,
 * saisie, code PIN avec pavé tactile), notifications, échappement HTML.
 * Les fenêtres natives (alert/confirm) sont évitées : elles font sortir
 * du plein écran et sont peu lisibles sur tablette.
 */
(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Raccourci de création d'élément : el('div', {class: 'x'}, 'texte')
  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (html != null) node.innerHTML = html;
    return node;
  }

  function formatTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + formatTime(iso);
  }

  /* ----------------------------- Modales -------------------------------- */

  var openCount = 0;

  /**
   * Ouvre une modale. options :
   *  title, body (HTML), buttons: [{ label, value, kind: 'primary'|'danger'|'' }],
   *  onOpen(box), getValue(value, box) → valeur retournée (ou undefined pour garder ouvert)
   * Retourne une promesse résolue avec la valeur du bouton (null si fermée).
   */
  function modal(options) {
    return new Promise(function (resolve) {
      var overlay = el('div', { class: 'modal-overlay', role: 'dialog', 'aria-modal': 'true' });
      var box = el('div', { class: 'modal-box' + (options.wide ? ' modal-wide' : '') });
      box.innerHTML =
        (options.title ? '<h2 class="modal-title">' + escapeHtml(options.title) + '</h2>' : '') +
        '<div class="modal-body">' + (options.body || '') + '</div>' +
        '<div class="modal-error" aria-live="assertive"></div>' +
        '<div class="modal-actions"></div>';
      var actions = box.querySelector('.modal-actions');
      var buttons = options.buttons || [{ label: 'OK', value: true, kind: 'primary' }];
      buttons.forEach(function (b) {
        var btn = el('button', { type: 'button', class: 'btn ' + (b.kind ? 'btn-' + b.kind : '') }, escapeHtml(b.label));
        btn.addEventListener('click', function () { finish(b.value); });
        actions.appendChild(btn);
      });
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      openCount++;

      function finish(value) {
        var result = value;
        if (options.getValue && value !== null && value !== false) {
          result = options.getValue(value, box);
          if (result === undefined) return; // validation échouée : on reste ouvert
        }
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        openCount--;
        resolve(result);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
        else if (e.key === 'Enter' && options.enterValue !== undefined && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault(); e.stopPropagation(); finish(options.enterValue);
        } else if (options.onKey) {
          options.onKey(e, box);
        }
      }
      document.addEventListener('keydown', onKey, true);

      box.setError = function (msg) { box.querySelector('.modal-error').textContent = msg || ''; };
      if (options.onOpen) options.onOpen(box, finish);
      var focusTarget = box.querySelector('[autofocus]') || box.querySelector('.btn-primary') || box.querySelector('.btn');
      if (focusTarget) setTimeout(function () { focusTarget.focus(); }, 30);
    });
  }

  function alertBox(title, message) {
    return modal({ title: title, body: '<p>' + message + '</p>', enterValue: true });
  }

  function confirmBox(title, message, okLabel, danger) {
    return modal({
      title: title,
      body: '<p>' + message + '</p>',
      buttons: [
        { label: 'Annuler', value: false },
        { label: okLabel || 'Confirmer', value: true, kind: danger ? 'danger' : 'primary' }
      ]
    }).then(function (v) { return v === true; });
  }

  /**
   * Saisie d'un code PIN avec pavé numérique tactile.
   * Retourne une promesse avec le code saisi (texte) ou null.
   */
  function pinPad(title, message) {
    var code = '';
    function render(box) {
      box.querySelector('.pin-dots').textContent = code ? code.replace(/./g, '●') : ' ';
    }
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
    return modal({
      title: title,
      body:
        (message ? '<p>' + message + '</p>' : '') +
        '<div class="pin-dots" aria-label="Code saisi"> </div>' +
        '<div class="pin-pad">' + keys.map(function (k) {
          return '<button type="button" class="pin-key" data-key="' + k + '">' + k + '</button>';
        }).join('') + '</div>',
      buttons: [
        { label: 'Annuler', value: null },
        { label: 'Valider', value: 'ok', kind: 'primary' }
      ],
      enterValue: 'ok',
      onOpen: function (box) {
        box.querySelectorAll('.pin-key').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var k = btn.getAttribute('data-key');
            if (k === 'C') code = '';
            else if (k === '⌫') code = code.slice(0, -1);
            else if (code.length < 8) code += k;
            box.setError('');
            render(box);
          });
        });
      },
      onKey: function (e, box) {
        if (/^[0-9]$/.test(e.key) && code.length < 8) { code += e.key; render(box); e.preventDefault(); }
        else if (e.key === 'Backspace') { code = code.slice(0, -1); render(box); e.preventDefault(); }
      },
      getValue: function (value, box) {
        if (code.length < 4) { box.setError('Le code doit comporter 4 à 8 chiffres.'); return undefined; }
        return code;
      }
    });
  }

  /* --------------------------- Notifications ---------------------------- */

  function toast(message, kind) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var t = el('div', { class: 'toast ' + (kind ? 'toast-' + kind : '') }, escapeHtml(message));
    host.appendChild(t);
    setTimeout(function () { t.classList.add('toast-hide'); }, 3500);
    setTimeout(function () { t.remove(); }, 4200);
  }

  // Rendu HTML d'un symbole (emoji ou texte stylé « 7 » / « BAR »).
  function symbolHtml(id, extraClass) {
    var sym = Draw.getSymbol(id);
    if (!sym) return '';
    return '<span class="sym sym-' + sym.id + ' sym-' + sym.type + (extraClass ? ' ' + extraClass : '') +
      '" title="' + escapeHtml(sym.name) + '">' + sym.char + '</span>';
  }

  window.UI = {
    escapeHtml: escapeHtml,
    symbolHtml: symbolHtml,
    el: el,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    modal: modal,
    alert: alertBox,
    confirm: confirmBox,
    pinPad: pinPad,
    toast: toast,
    isModalOpen: function () { return openCount > 0; }
  };
})();
