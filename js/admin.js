/*
 * admin.js — Écran d'administration (protégé par PIN) et vue imprimable.
 *
 * Onglets : tableau de bord, lots & tickets, tirage (vérifiabilité),
 * journal des parties, réglages & sécurité. Les actions des boutons
 * passent par des attributs data-action (délégation d'événements).
 */
(function () {
  'use strict';

  var esc = function (v) { return UI.escapeHtml(v); };
  var $ = function (id) { return document.getElementById(id); };

  var Admin = {
    tab: 'dashboard',
    draft: null,      // copie de travail de la configuration
    dirty: false,     // modifications non enregistrées
    drawFilter: 'all',
    drawSearch: '',
    lastVerify: null
  };

  /* ----------------------------- Outils --------------------------------- */

  function symbolLabel(id) {
    var s = Draw.getSymbol(id);
    if (!s) return '?';
    return s.type === 'emoji' ? s.char + ' ' + s.name : s.char === s.name ? s.name : s.char + ' ' + s.name;
  }

  function prizeCell(prize) {
    if (!prize) return '<span class="muted">perdu</span>';
    return '<span class="prize-cell">' + UI.symbolHtml(prize.symbol, 'sym-mini') + ' ' + esc(prize.name) + '</span>';
  }

  function statusBadge() {
    var st = App.status();
    if (st === 'ready') return '<span class="badge badge-ok">🔒 Tirage verrouillé — jeu ouvert</span>';
    if (st === 'unlocked') return '<span class="badge badge-warn">Tirage généré, non verrouillé</span>';
    return '<span class="badge badge-off">Aucun tirage</span>';
  }

  function cloneConfig(c) { return JSON.parse(JSON.stringify(c)); }

  /* -------------------------- Bandeau d'alertes ------------------------- */

  function renderAlerts() {
    var html = '';
    if (!Store.isAvailable()) {
      html += '<div class="alert alert-danger">⚠ Le stockage du navigateur est indisponible : rien n’est sauvegardé automatiquement. Utilisez « Sauvegarder maintenant » très régulièrement, ou ouvrez le site dans un autre navigateur (hors navigation privée).</div>';
    } else if (!App.lastSaveOk) {
      html += '<div class="alert alert-danger">⚠ La dernière sauvegarde automatique a échoué (stockage plein ?). Téléchargez une sauvegarde maintenant.</div>';
    }
    if (App.isDemo()) {
      html += '<div class="alert alert-demo">🎲 Mode démo : données fictives stockées à part. Les données de la vraie soirée ne sont jamais modifiées. Pas de code PIN en démo.</div>';
    }
    var reminder = App.backupReminder();
    if (reminder && App.isLocked()) {
      html += '<div class="alert alert-warn">💾 Pensez à sauvegarder : ' + esc(reminder) + ' <button type="button" class="btn btn-small btn-primary" data-action="backup">Sauvegarder maintenant</button></div>';
    }
    $('admin-alerts').innerHTML = html;
    $('admin-mode').textContent = App.isDemo() ? '— MODE DÉMO' : '';
  }

  /* -------------------------- Tableau de bord --------------------------- */

  function renderDashboard() {
    var st = App.stats();
    var s = App.state;
    var totalPrizes = s.config.prizes.reduce(function (a, p) { return a + p.quantity; }, 0);
    var won = st.wins.length;
    var lastBackup = s.lastBackupAt ? UI.formatDateTime(s.lastBackupAt) : 'jamais';

    var html = '<div class="card"><div class="card-row">' + statusBadge() +
      '<span class="muted">Dernière sauvegarde sur fichier : ' + esc(lastBackup) + '</span></div></div>';

    html += '<div class="kpis">' +
      kpi(st.played, 'tickets joués', 'sur ' + st.total) +
      kpi(st.remaining, 'tickets restants', '') +
      kpi(won, 'lots gagnés', 'sur ' + totalPrizes) +
      kpi(totalPrizes - won, 'lots restants', '') +
      '</div>';

    html += '<div class="card"><h3>Lots</h3>';
    if (!st.prizes.length) html += '<p class="muted">Aucun lot configuré.</p>';
    else {
      html += '<table class="table"><thead><tr><th>Lot</th><th class="num">Quantité</th><th class="num">Gagnés</th><th class="num">Restants</th><th>Progression</th></tr></thead><tbody>';
      st.prizes.forEach(function (p) {
        var pct = p.prize.quantity ? Math.round(p.won / p.prize.quantity * 100) : 0;
        html += '<tr><td>' + prizeCell(p.prize) + '</td><td class="num">' + p.prize.quantity + '</td><td class="num">' + p.won +
          '</td><td class="num"><strong>' + p.remaining + '</strong></td><td><div class="progress"><div style="width:' + pct + '%"></div></div></td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    html += '<div class="card"><h3>Lots déjà gagnés</h3>';
    if (!st.wins.length) html += '<p class="muted">Aucun lot gagné pour l’instant.</p>';
    else {
      html += '<table class="table"><thead><tr><th>Heure</th><th class="num">Ticket</th><th>Lot</th></tr></thead><tbody>';
      st.wins.forEach(function (w) {
        html += '<tr><td>' + UI.formatTime(w.time) + '</td><td class="num"><strong>' + w.ticket + '</strong></td><td>' + prizeCell(App.getPrize(w.prizeId)) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    html += '<div class="card"><h3>Actions rapides</h3><div class="btn-row">' +
      '<button type="button" class="btn btn-primary" data-action="backup">💾 Sauvegarder maintenant</button>' +
      '<button type="button" class="btn" data-action="restore">📂 Restaurer une sauvegarde</button>' +
      '<button type="button" class="btn" data-action="print"' + (s.draw ? '' : ' disabled') + '>🖨 Plan B / vue imprimable</button>' +
      '<button type="button" class="btn" data-action="verify"' + (s.draw ? '' : ' disabled') + '>✅ Test de cohérence</button>' +
      '<button type="button" class="btn" data-action="fullscreen">⛶ Plein écran</button>' +
      '</div>' + verifyHtml() + '</div>';
    return html;
  }

  function kpi(value, label, sub) {
    return '<div class="kpi"><div class="kpi-value">' + value + '</div><div class="kpi-label">' + label +
      (sub ? ' <span class="muted">' + sub + '</span>' : '') + '</div></div>';
  }

  /* ------------------------ Lots & tickets ------------------------------ */

  function ensureDraft() {
    if (!Admin.draft || !Admin.dirty) {
      Admin.draft = cloneConfig(App.state.config);
      Admin.dirty = false;
    }
  }

  function symbolOptions(selected, usedByOthers) {
    return Draw.SYMBOLS.map(function (s) {
      var used = usedByOthers.indexOf(s.id) !== -1;
      return '<option value="' + s.id + '"' + (s.id === selected ? ' selected' : '') + (used ? ' disabled' : '') + '>' +
        esc(symbolLabel(s.id)) + (used ? ' (déjà pris)' : '') + '</option>';
    }).join('');
  }

  function renderConfig() {
    var locked = App.isLocked();
    if (locked) {
      var c = App.state.config;
      var html = '<div class="alert alert-info">🔒 Le tirage est verrouillé : la configuration ne peut plus être modifiée (sauf réinitialisation complète dans « Réglages &amp; sécurité »).</div>';
      html += '<div class="card"><p><strong>' + c.ticketCount + '</strong> tickets, numérotés de 1 à ' + c.ticketCount + '.</p>';
      html += '<table class="table"><thead><tr><th>Symbole</th><th>Lot</th><th class="num">Quantité</th></tr></thead><tbody>';
      c.prizes.forEach(function (p) {
        html += '<tr><td>' + UI.symbolHtml(p.symbol, 'sym-mini') + ' ' + esc(Draw.getSymbol(p.symbol).name) + '</td><td>' + esc(p.name) + '</td><td class="num">' + p.quantity + '</td></tr>';
      });
      html += '</tbody></table></div>';
      return html;
    }

    ensureDraft();
    var d = Admin.draft;
    var html2 = '<div class="card"><h3>Tickets</h3>' +
      '<label class="field"><span>Nombre total de tickets (numérotés de 1 à N)</span>' +
      '<input type="number" inputmode="numeric" min="1" max="' + Draw.MAX_TICKETS + '" step="1" data-field="ticketCount" value="' + esc(d.ticketCount) + '"></label></div>';

    html2 += '<div class="card"><h3>Lots</h3>';
    if (!d.prizes.length) html2 += '<p class="muted">Aucun lot pour l’instant. Ajoutez le premier lot ci-dessous.</p>';
    else {
      html2 += '<div class="prize-list">';
      d.prizes.forEach(function (p, i) {
        var others = d.prizes.filter(function (o, j) { return j !== i; }).map(function (o) { return o.symbol; });
        html2 += '<div class="prize-row" data-index="' + i + '">' +
          '<span class="prize-preview">' + UI.symbolHtml(p.symbol) + '</span>' +
          '<label class="field"><span>Symbole</span><select data-pfield="symbol">' + symbolOptions(p.symbol, others) + '</select></label>' +
          '<label class="field field-grow"><span>Nom du lot</span><input type="text" maxlength="60" data-pfield="name" value="' + esc(p.name) + '" placeholder="ex. Panier garni"></label>' +
          '<label class="field field-small"><span>Quantité</span><input type="number" inputmode="numeric" min="1" step="1" data-pfield="quantity" value="' + esc(p.quantity) + '"></label>' +
          '<button type="button" class="btn btn-danger btn-icon" data-action="del-prize" title="Supprimer ce lot">🗑</button>' +
          '</div>';
      });
      html2 += '</div>';
    }
    var canAdd = d.prizes.length < Draw.SYMBOLS.length;
    html2 += '<div class="btn-row"><button type="button" class="btn" data-action="add-prize"' + (canAdd ? '' : ' disabled') + '>＋ Ajouter un lot</button></div></div>';

    html2 += '<div class="card"><div id="config-validation"></div><div class="btn-row">' +
      '<button type="button" class="btn btn-primary" data-action="save-config">✔ Enregistrer la configuration</button>' +
      '<button type="button" class="btn" data-action="discard-config">Annuler les modifications</button>' +
      '</div></div>';
    return html2;
  }

  function renderConfigValidation() {
    var box = $('config-validation');
    if (!box || !Admin.draft) return;
    var v = Draw.validateConfig(Admin.draft);
    var n = Admin.draft.ticketCount;
    var html = '';
    if (Admin.dirty) html += '<p class="badge badge-warn">Modifications non enregistrées</p>';
    if (typeof n === 'number' && n >= 1) {
      html += '<p>Total : <strong>' + v.totalPrizes + '</strong> lot(s) à gagner pour <strong>' + n + '</strong> tickets — ' +
        Math.max(0, n - v.totalPrizes) + ' ticket(s) perdant(s).</p>';
    }
    v.errors.forEach(function (e) { html += '<div class="alert alert-danger">✖ ' + esc(e) + '</div>'; });
    v.warnings.forEach(function (w) { html += '<div class="alert alert-warn">⚠ ' + esc(w) + '</div>'; });
    if (v.ok && !v.warnings.length) html += '<div class="alert alert-ok">✔ Configuration valide.</div>';
    box.innerHTML = html;
  }

  function onConfigInput(e) {
    var t = e.target;
    if (!Admin.draft) return;
    var num = function (v) { return v === '' ? NaN : Number(v); };
    if (t.dataset.field === 'ticketCount') {
      Admin.draft.ticketCount = num(t.value);
    } else if (t.dataset.pfield) {
      var row = t.closest('.prize-row');
      var p = Admin.draft.prizes[Number(row.dataset.index)];
      if (t.dataset.pfield === 'quantity') p.quantity = num(t.value);
      else if (t.dataset.pfield === 'name') p.name = t.value;
      else if (t.dataset.pfield === 'symbol') {
        p.symbol = t.value;
        Admin.dirty = true;
        renderTab(); // met à jour les symboles disponibles des autres lots
        return;
      }
    } else {
      return;
    }
    Admin.dirty = true;
    renderConfigValidation();
  }

  function addPrize() {
    ensureDraft();
    var used = Admin.draft.prizes.map(function (p) { return p.symbol; });
    var free = Draw.SYMBOL_IDS.filter(function (s) { return used.indexOf(s) === -1; })[0];
    Admin.draft.prizes.push({ id: App.newPrizeId(), name: '', quantity: 1, symbol: free });
    Admin.dirty = true;
    renderTab();
    var inputs = document.querySelectorAll('.prize-row [data-pfield="name"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function saveConfig() {
    var d = Admin.draft;
    d.prizes.forEach(function (p) { p.name = String(p.name || '').trim(); });
    var v = Draw.validateConfig(d);
    if (!v.ok) {
      renderConfigValidation();
      UI.alert('Configuration invalide', 'Corrigez les erreurs indiquées en rouge avant d’enregistrer.');
      return;
    }
    var proceed = App.state.draw
      ? UI.confirm('Modifier la configuration', 'Un tirage a déjà été généré. Enregistrer la nouvelle configuration <strong>effacera ce tirage</strong> : il faudra le régénérer.', 'Enregistrer et effacer le tirage', true)
      : Promise.resolve(true);
    proceed.then(function (ok) {
      if (!ok) return;
      try {
        App.setConfig(cloneConfig(d));
        Admin.dirty = false;
        UI.toast('Configuration enregistrée.', 'success');
        renderTab();
      } catch (e) {
        UI.alert('Erreur', esc(e.message));
      }
    });
  }

  /* ------------------------------ Tirage -------------------------------- */

  function renderDraw() {
    var s = App.state;
    var d = s.draw;
    var locked = App.isLocked();
    var played = Object.keys(s.plays).length;
    var v = Draw.validateConfig(s.config);
    var html = '<div class="card"><div class="card-row">' + statusBadge() + '</div>';

    if (Admin.dirty) {
      html += '<div class="alert alert-warn">⚠ Vous avez des modifications de lots non enregistrées (onglet « Lots &amp; tickets »). Le tirage utilise la configuration enregistrée.</div>';
    }
    if (!v.ok) {
      html += '<div class="alert alert-danger">La configuration enregistrée est invalide : corrigez-la dans l’onglet « Lots &amp; tickets ».</div>';
    }

    if (!locked) {
      html += '<h3>Graine (seed) du tirage</h3>' +
        '<p class="muted">Même seed + même configuration = exactement le même tirage. Notez le seed pour pouvoir prouver le tirage.</p>' +
        '<div class="seed-row"><input type="text" id="seed-input" class="seed-input" maxlength="64" value="' + esc(s.seedDraft || (d && d.seed) || '') + '">' +
        '<button type="button" class="btn" data-action="new-seed">🎲 Nouveau seed</button></div>' +
        '<div class="btn-row">' +
        '<button type="button" class="btn btn-primary" data-action="generate"' + (v.ok && !played ? '' : ' disabled') + '>' + (d ? '↻ Régénérer le tirage' : '🎲 Générer le tirage') + '</button>' +
        (d ? '<button type="button" class="btn btn-gold" data-action="lock">🔒 Verrouiller le tirage</button>' : '') +
        '</div>';
    } else if (App.isDemo()) {
      html += '<div class="btn-row"><button type="button" class="btn" data-action="unlock-demo">🔓 Déverrouiller (démo uniquement)</button></div>';
    }

    if (d) {
      html += '<dl class="draw-info">' +
        '<dt>Seed</dt><dd><code>' + esc(d.seed) + '</code></dd>' +
        '<dt>Empreinte</dt><dd><code>' + esc(d.fingerprint) + '</code></dd>' +
        '<dt>Tickets</dt><dd>' + d.ticketCount + ' (dont ' + Object.keys(d.assignments).length + ' gagnants)</dd>' +
        '<dt>Généré le</dt><dd>' + esc(UI.formatDateTime(d.generatedAt)) + '</dd>' +
        '<dt>Verrouillé le</dt><dd>' + (d.lockedAt && locked ? esc(UI.formatDateTime(d.lockedAt)) : '—') + '</dd>' +
        '</dl>';
    }
    html += '</div>';

    html += '<div class="card"><h3>Vérification &amp; export</h3><div class="btn-row">' +
      '<button type="button" class="btn" data-action="verify"' + (d ? '' : ' disabled') + '>✅ Test de cohérence</button>' +
      '<button type="button" class="btn" data-action="export-json"' + (d ? '' : ' disabled') + '>⬇ Export JSON</button>' +
      '<button type="button" class="btn" data-action="export-csv"' + (d ? '' : ' disabled') + '>⬇ Export CSV</button>' +
      '<button type="button" class="btn" data-action="print"' + (d ? '' : ' disabled') + '>🖨 Vue imprimable / Plan B</button>' +
      '<button type="button" class="btn" data-action="import">📂 Importer un tirage</button>' +
      '</div>' + verifyHtml() + '</div>';

    if (d) html += renderDrawTable();
    return html;
  }

  function renderDrawTable() {
    var s = App.state;
    var d = s.draw;
    var filters = [['all', 'Tous'], ['win', 'Gagnants'], ['lose', 'Perdants'], ['played', 'Joués'], ['unplayed', 'Non joués']];
    var html = '<div class="card"><h3>Tableau complet du tirage</h3><div class="table-tools">' +
      filters.map(function (f) {
        return '<button type="button" class="btn btn-small' + (Admin.drawFilter === f[0] ? ' btn-primary' : '') + '" data-action="filter" data-filter="' + f[0] + '">' + f[1] + '</button>';
      }).join('') +
      '<input type="search" inputmode="numeric" id="draw-search" placeholder="Rechercher un n°" value="' + esc(Admin.drawSearch) + '">' +
      '</div><div class="table-scroll"><table class="table table-compact"><thead><tr><th class="num">Ticket</th><th>Résultat</th><th>Statut</th></tr></thead><tbody>';
    var rows = [];
    for (var t = 1; t <= d.ticketCount; t++) {
      var pid = d.assignments[String(t)];
      var play = s.plays[String(t)];
      var f = Admin.drawFilter;
      if (f === 'win' && !pid) continue;
      if (f === 'lose' && pid) continue;
      if (f === 'played' && !play) continue;
      if (f === 'unplayed' && play) continue;
      if (Admin.drawSearch && String(t).indexOf(Admin.drawSearch) === -1) continue;
      rows.push('<tr class="' + (pid ? 'row-win' : '') + '"><td class="num"><strong>' + t + '</strong></td><td>' + prizeCell(App.getPrize(pid)) +
        '</td><td>' + (play ? '✔ joué à ' + UI.formatTime(play.time) : '<span class="muted">—</span>') + '</td></tr>');
    }
    html += rows.join('') + '</tbody></table>';
    if (!rows.length) html += '<p class="muted">Aucun ticket ne correspond.</p>';
    html += '</div></div>';
    return html;
  }

  function verifyHtml() {
    var r = Admin.lastVerify;
    if (!r) return '';
    var html = '<div class="verify ' + (r.ok ? 'verify-ok' : 'verify-ko') + '"><h4>' +
      (r.ok ? '✅ Tirage cohérent : tous les contrôles sont réussis' : '❌ Problème détecté') +
      ' <span class="muted">(' + esc(UI.formatTime(r.time)) + ')</span></h4><ul>';
    r.checks.forEach(function (c) {
      html += '<li class="' + (c.ok ? 'ok' : 'ko') + '">' + (c.ok ? '✔' : '✖') + ' ' + esc(c.label) +
        (c.detail ? '<br><span class="muted">' + esc(c.detail) + '</span>' : '') + '</li>';
    });
    return html + '</ul></div>';
  }

  function generate() {
    var input = $('seed-input');
    var seed = input ? input.value.trim() : '';
    if (!seed) { UI.alert('Seed manquant', 'Saisissez un seed ou cliquez sur « Nouveau seed ».'); return; }
    var proceed = App.state.draw
      ? UI.confirm('Régénérer le tirage', 'Le tirage actuel sera remplacé par un nouveau tirage avec le seed « ' + esc(seed) + ' ».', 'Régénérer')
      : Promise.resolve(true);
    proceed.then(function (ok) {
      if (!ok) return;
      try {
        var d = App.generate(seed);
        Admin.lastVerify = null;
        UI.toast('Tirage généré (' + Object.keys(d.assignments).length + ' gagnants).', 'success');
        renderTab();
      } catch (e) {
        UI.alert('Impossible de générer le tirage', esc(e.message).replace(/\n/g, '<br>'));
      }
    });
  }

  function lockDraw() {
    var check = App.verify();
    if (!check.ok) {
      Admin.lastVerify = Object.assign({ time: new Date().toISOString() }, check);
      renderTab();
      UI.alert('Verrouillage impossible', 'Le test de cohérence a échoué. Voir le détail.');
      return;
    }
    UI.confirm('Verrouiller le tirage',
      'Une fois verrouillé, <strong>le tirage et la liste des lots ne pourront plus être modifiés</strong> (sauf réinitialisation complète). Le jeu sera ouvert.<br><br>' +
      'Conseil : exportez le tirage (JSON) et imprimez le plan B juste après.', '🔒 Verrouiller').then(function (ok) {
      if (!ok) return;
      App.lock();
      UI.toast('Tirage verrouillé : la machine est prête !', 'success');
      renderTab();
    });
  }

  function runVerify() {
    if (!App.state.draw) return;
    Admin.lastVerify = Object.assign({ time: new Date().toISOString() }, App.verify());
    renderTab();
    UI.toast(Admin.lastVerify.ok ? 'Test de cohérence réussi.' : 'Le test de cohérence a détecté un problème !', Admin.lastVerify.ok ? 'success' : 'error');
  }

  /* ------------------------------ Journal ------------------------------- */

  var LOG_TYPES = {
    partie: '🎰 Partie', annulation: '↩ Annulation', tirage: '🎲 Tirage', verrouillage: '🔒 Verrouillage',
    import: '📂 Import', restauration: '📂 Restauration', systeme: 'ℹ Système'
  };

  function renderLog() {
    var s = App.state;
    var html = '<div class="card"><h3>Annuler une partie</h3>' +
      '<p class="muted">En cas d’erreur de saisie (mauvais numéro entré) : le ticket redevient « non joué ». L’annulation reste tracée dans le journal.</p>' +
      '<div class="seed-row"><input type="number" inputmode="numeric" min="1" id="cancel-ticket" placeholder="N° de ticket">' +
      '<button type="button" class="btn btn-danger" data-action="cancel-play">↩ Annuler la partie</button></div></div>';

    html += '<div class="card"><h3>Journal (' + s.log.length + ' entrées)</h3><div class="btn-row">' +
      '<button type="button" class="btn" data-action="export-log-csv">⬇ Export CSV</button>' +
      '<button type="button" class="btn" data-action="export-log-json">⬇ Export JSON</button></div>';
    if (!s.log.length) html += '<p class="muted">Journal vide.</p>';
    else {
      // Dernière partie enregistrée pour chaque ticket encore « joué ».
      var latestPlay = {};
      s.log.forEach(function (e, i) { if (e.type === 'partie') latestPlay[e.ticket] = i; });
      html += '<div class="table-scroll"><table class="table table-compact"><thead><tr><th>Heure</th><th>Type</th><th class="num">Ticket</th><th>Détail</th><th></th></tr></thead><tbody>';
      for (var i = s.log.length - 1; i >= 0; i--) {
        var e = s.log[i];
        var canCancel = e.type === 'partie' && latestPlay[e.ticket] === i && s.plays[String(e.ticket)];
        html += '<tr class="log-' + esc(e.type) + (e.prizeId && e.type === 'partie' ? ' row-win' : '') + '"><td>' + esc(UI.formatDateTime(e.time)) + '</td><td>' + esc(LOG_TYPES[e.type] || e.type) +
          '</td><td class="num">' + (e.ticket ? '<strong>' + e.ticket + '</strong>' : '') + '</td><td>' + esc(e.message || '') + '</td><td>' +
          (canCancel ? '<button type="button" class="btn btn-small" data-action="cancel-play" data-ticket="' + e.ticket + '">Annuler</button>' : '') + '</td></tr>';
      }
      html += '</tbody></table></div>';
    }
    return html + '</div>';
  }

  function cancelPlay(ticket) {
    ticket = Number(ticket);
    var play = App.state.plays[String(ticket)];
    if (!ticket || !play) {
      UI.alert('Annulation impossible', 'Le ticket n°' + esc(ticket || '?') + ' n’a pas été joué.');
      return;
    }
    var prize = App.getPrize(play.prizeId);
    UI.confirm('Annuler la partie du ticket n°' + ticket,
      'Partie jouée à ' + UI.formatTime(play.time) + ' — résultat : <strong>' + (prize ? esc(prize.name) : 'perdu') + '</strong>.<br>' +
      'Le ticket pourra rejouer (il obtiendra le même résultat, fixé par le tirage).', 'Annuler la partie', true).then(function (ok) {
      if (!ok) return;
      App.cancelPlay(ticket, 'annulée par l’organisateur');
      UI.toast('Partie du ticket n°' + ticket + ' annulée.', 'success');
      renderTab();
    });
  }

  /* ------------------------- Réglages & sécurité ------------------------ */

  function renderSettings() {
    var s = App.state;
    var st = s.settings;
    var html = '<div class="card"><h3>Affichage</h3>' +
      '<label class="field"><span>Titre affiché sur la machine</span><input type="text" maxlength="60" data-setting="title" value="' + esc(s.title) + '"></label>' +
      '<label class="check"><input type="checkbox" data-setting="nearMissEnabled"' + (st.nearMissEnabled ? ' checked' : '') + '> Effet « presque gagné » (2 symboles identiques sur 3 pour certains perdants)</label>' +
      '<label class="field"><span>Part des perdants avec « presque gagné » : <strong id="nm-value">' + st.nearMissPercent + ' %</strong></span>' +
      '<input type="range" min="0" max="100" step="5" data-setting="nearMissPercent" value="' + st.nearMissPercent + '"' + (st.nearMissEnabled ? '' : ' disabled') + '></label>' +
      '<p class="muted">Réglage d’affichage uniquement : il ne change jamais qui gagne (modifiable même après verrouillage).</p>' +
      '<div class="field-row">' +
      '<label class="field field-small"><span>Retour auto. après un gain (s)</span><input type="number" min="3" max="120" data-setting="returnDelayWin" value="' + st.returnDelayWin + '"></label>' +
      '<label class="field field-small"><span>Retour auto. après une perte (s)</span><input type="number" min="2" max="120" data-setting="returnDelayLose" value="' + st.returnDelayLose + '"></label>' +
      '</div></div>';

    html += '<div class="card"><h3>Son</h3>' +
      '<label class="field"><span>Volume : <strong id="vol-value">' + Math.round(App.prefs.volume * 100) + ' %</strong></span>' +
      '<input type="range" min="0" max="1" step="0.05" data-pref="volume" value="' + App.prefs.volume + '"></label>' +
      '<label class="check"><input type="checkbox" data-pref="muted"' + (App.prefs.muted ? ' checked' : '') + '> Muet</label>' +
      '<div class="btn-row"><button type="button" class="btn" data-action="test-sound" data-sound="win">🔊 Tester : victoire</button>' +
      '<button type="button" class="btn" data-action="test-sound" data-sound="lose">🔊 Tester : défaite</button>' +
      '<button type="button" class="btn" data-action="test-sound" data-sound="reelStop">🔊 Tester : rouleau</button></div></div>';

    html += '<div class="card"><h3>Sauvegardes</h3>' +
      '<p>L’état est enregistré automatiquement dans le navigateur après chaque partie. Pour plus de sécurité, téléchargez régulièrement une sauvegarde sur fichier (par ex. sur une clé USB).</p>' +
      '<div class="btn-row"><button type="button" class="btn btn-primary" data-action="backup">💾 Sauvegarder maintenant</button>' +
      '<button type="button" class="btn" data-action="restore">📂 Restaurer une sauvegarde</button></div></div>';

    html += '<div class="card"><h3>Mode démo</h3>';
    if (App.isDemo()) {
      html += '<p>Vous êtes en mode démo. Les données de la vraie soirée sont intactes.</p><div class="btn-row">' +
        '<button type="button" class="btn" data-action="demo-reset">↺ Réinitialiser la démo</button>' +
        '<button type="button" class="btn btn-primary" data-action="demo-quit">Quitter la démo</button></div>';
    } else {
      html += '<p>Pour présenter le concept : 100 tickets et 5 lots fictifs, stockés à part. La vraie soirée n’est jamais touchée.</p>' +
        '<div class="btn-row"><button type="button" class="btn" data-action="demo-start">🎲 Lancer le mode démo</button></div>';
    }
    html += '</div>';

    if (!App.isDemo()) {
      html += '<div class="card"><h3>Code PIN</h3><div class="btn-row">' +
        '<button type="button" class="btn" data-action="change-pin">🔑 Changer le code PIN</button></div></div>';
    }

    html += '<div class="card card-danger"><h3>Zone dangereuse</h3>' +
      '<p>La réinitialisation complète efface le tirage, les parties et le journal' + (App.isDemo() ? ' de la démo' : ' de la soirée') + '. Téléchargez une sauvegarde avant !</p>' +
      '<label class="check"><input type="checkbox" id="reset-keep"> Conserver la liste des lots et le nombre de tickets</label>' +
      '<div class="btn-row"><button type="button" class="btn btn-danger" data-action="reset-all">⚠ Réinitialisation complète</button></div></div>';
    return html;
  }

  function onSettingInput(e) {
    var t = e.target;
    var st = App.state.settings;
    if (t.dataset.setting) {
      var key = t.dataset.setting;
      if (key === 'title') App.state.title = t.value.trim() || 'Grande Tombola du Nouvel An';
      else if (key === 'nearMissEnabled') {
        st.nearMissEnabled = t.checked;
        var range = document.querySelector('[data-setting="nearMissPercent"]');
        if (range) range.disabled = !t.checked;
      } else if (key === 'nearMissPercent') {
        st.nearMissPercent = Number(t.value);
        $('nm-value').textContent = t.value + ' %';
      } else if (key === 'returnDelayWin' || key === 'returnDelayLose') {
        var v = Number(t.value);
        if (v >= 2 && v <= 120) st[key] = v;
      }
      App.save();
    } else if (t.dataset.pref === 'volume') {
      App.setVolume(Number(t.value));
      $('vol-value').textContent = Math.round(Number(t.value) * 100) + ' %';
    } else if (t.dataset.pref === 'muted') {
      App.setMuted(t.checked);
    }
  }

  function changePin() {
    UI.pinPad('Code PIN actuel', 'Saisissez le code PIN actuel.').then(function (pin) {
      if (pin == null) return;
      if (!App.checkPin(pin)) { UI.toast('Code PIN incorrect.', 'error'); return; }
      App.state.pinHash = null;
      App.createPin().then(function (ok) {
        if (!ok) {
          // Abandon : on remet l'ancien code.
          App.setPin(pin);
          UI.toast('Code PIN inchangé.', '');
        }
      });
    });
  }

  function resetAll() {
    var keep = $('reset-keep') && $('reset-keep').checked;
    var askPin = App.isDemo()
      ? Promise.resolve(true)
      : UI.pinPad('Réinitialisation complète', 'Saisissez le code PIN pour continuer.').then(function (pin) {
        if (pin == null) return false;
        if (!App.checkPin(pin)) { UI.toast('Code PIN incorrect.', 'error'); return false; }
        return true;
      });
    askPin.then(function (ok) {
      if (!ok) return false;
      return UI.confirm('Réinitialisation complète (1/2)',
        'Le tirage, les ' + Object.keys(App.state.plays).length + ' partie(s) jouée(s) et le journal seront <strong>définitivement effacés</strong>' +
        (keep ? ' (la liste des lots sera conservée)' : '') + '.<br>Avez-vous téléchargé une sauvegarde ?', 'Continuer', true);
    }).then(function (ok) {
      if (!ok) return false;
      return UI.modal({
        title: 'Réinitialisation complète (2/2)',
        body: '<p>Dernière confirmation : tapez <strong>EFFACER</strong> ci-dessous.</p><input type="text" class="confirm-input" autofocus autocomplete="off">',
        buttons: [{ label: 'Annuler', value: null }, { label: 'Tout effacer', value: 'go', kind: 'danger' }],
        enterValue: 'go',
        getValue: function (v, box) {
          if (box.querySelector('.confirm-input').value.trim().toUpperCase() !== 'EFFACER') {
            box.setError('Tapez EFFACER pour confirmer.');
            return undefined;
          }
          return true;
        }
      });
    }).then(function (ok) {
      if (ok !== true) return;
      App.resetAll(keep);
      Admin.draft = null;
      Admin.dirty = false;
      Admin.lastVerify = null;
      UI.toast('Réinitialisation effectuée.', 'success');
      renderTab();
    });
  }

  /* ----------------------- Sauvegarde / import -------------------------- */

  function backup() {
    App.downloadBackup();
    UI.toast('Sauvegarde téléchargée. Copiez-la sur une clé USB ou un téléphone.', 'success');
    Admin.render();
  }

  function importFile(expectedKind) {
    Store.pickTextFile('.json,application/json').then(function (file) {
      var parsed = App.parseImport(file.text);
      if (!parsed.ok) { UI.alert('Import impossible', esc(parsed.error)); return; }
      var lines = '<p><strong>' + (parsed.kind === 'tirage' ? 'Tirage' : 'Sauvegarde') + '</strong> : ' + esc(parsed.summary) + '.</p>';
      if (parsed.kind !== expectedKind) {
        lines += '<p class="muted">' + (parsed.kind === 'tirage' ? 'Ce fichier est un export de tirage : les parties jouées seront remises à zéro.' : 'Ce fichier est une sauvegarde complète : les parties et le journal seront restaurés.') + '</p>';
      }
      if (parsed.fileMode && parsed.fileMode !== App.mode) {
        lines += '<div class="alert alert-warn">⚠ Ce fichier provient du ' + (parsed.fileMode === 'demo' ? 'mode démo' : 'mode soirée') + '.</div>';
      }
      if (parsed.warnings.length) {
        lines += '<div class="alert alert-danger">⚠ Contrôles en échec :<br>' + parsed.warnings.map(esc).join('<br>') + '</div>';
      }
      lines += '<p>Les données actuelles' + (App.isDemo() ? ' de la démo' : ' de la soirée') + ' (' + Object.keys(App.state.plays).length +
        ' partie(s) jouée(s)) seront <strong>remplacées</strong>. Le tirage importé sera verrouillé.</p>';
      return UI.confirm('Importer « ' + esc(file.name) + ' » ?', lines, 'Importer', parsed.warnings.length > 0).then(function (ok) {
        if (!ok) return;
        App.applyImport(parsed, file.name);
        Admin.draft = null;
        Admin.dirty = false;
        Admin.lastVerify = null;
        UI.toast('Import réussi.', 'success');
        Admin.render();
      });
    }).catch(function () { /* sélection annulée */ });
  }

  /* -------------------------- Vue imprimable ---------------------------- */

  function renderPrint() {
    var s = App.state;
    var d = s.draw;
    var full = $('print-full').checked;
    if (!d) { $('print-page').innerHTML = '<p>Aucun tirage.</p>'; return; }
    var groups = Draw.winnersByPrize(s.config, d);
    var html = '<header class="print-header"><h1>' + esc(s.title) + (App.isDemo() ? ' — DÉMO' : '') + '</h1>' +
      '<h2>Plan B — Liste des numéros gagnants par lot</h2>' +
      '<p>Tickets numérotés de 1 à <strong>' + d.ticketCount + '</strong> · Seed : <code>' + esc(d.seed) + '</code> · Empreinte : <code>' + esc(d.fingerprint) + '</code><br>' +
      'Tirage généré le ' + esc(UI.formatDateTime(d.generatedAt)) + (d.locked ? ' · verrouillé le ' + esc(UI.formatDateTime(d.lockedAt)) : ' · <strong>NON VERROUILLÉ</strong>') +
      ' · Imprimé le ' + esc(UI.formatDateTime(new Date().toISOString())) + '</p></header>';

    html += '<p class="print-howto"><strong>Mode d’emploi en cas de panne :</strong> chercher le numéro du ticket ci-dessous. S’il apparaît, il gagne le lot indiqué (cocher la case quand le lot est remis). Sinon, le ticket est perdant. ' +
      'Les tickets marqués « ✔ joué » avaient déjà joué au moment de l’impression.</p>';

    groups.forEach(function (g) {
      html += '<section class="print-prize"><h3>' + UI.symbolHtml(g.prize.symbol, 'sym-mini') + ' ' + esc(g.prize.name) +
        ' <span class="muted">(' + g.tickets.length + ' gagnant' + (g.tickets.length > 1 ? 's' : '') + ')</span></h3><ul class="print-tickets">';
      g.tickets.forEach(function (t) {
        var played = s.plays[String(t)];
        html += '<li><span class="box">☐</span> <strong>' + t + '</strong>' + (played ? ' <em>✔ joué</em>' : '') + '</li>';
      });
      html += '</ul></section>';
    });
    if (!groups.length) html += '<p>Aucun lot : tous les tickets sont perdants.</p>';
    html += '<p><strong>Tous les autres numéros sont perdants.</strong></p>';

    if (full) {
      html += '<section class="print-full"><h3>Tableau complet des tickets</h3><div class="print-grid">';
      for (var t = 1; t <= d.ticketCount; t++) {
        var p = App.getPrize(d.assignments[String(t)]);
        html += '<div class="pg-cell' + (p ? ' pg-win' : '') + '"><strong>' + t + '</strong> ' + (p ? UI.symbolHtml(p.symbol, 'sym-mini') + ' ' + esc(p.name) : '–') +
          (s.plays[String(t)] ? ' ✔' : '') + '</div>';
      }
      html += '</div></section>';
    }
    $('print-page').innerHTML = html;
  }

  function showPrint() {
    renderPrint();
    App.showScreen('print');
    window.scrollTo(0, 0);
  }

  /* ---------------------------- Rendu général --------------------------- */

  function renderTab() {
    var content = $('admin-content');
    var html;
    switch (Admin.tab) {
      case 'config': html = renderConfig(); break;
      case 'draw': html = renderDraw(); break;
      case 'log': html = renderLog(); break;
      case 'settings': html = renderSettings(); break;
      default: html = renderDashboard();
    }
    content.innerHTML = html;
    document.querySelectorAll('#admin-tabs [data-tab]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === Admin.tab);
      b.setAttribute('aria-selected', b.dataset.tab === Admin.tab ? 'true' : 'false');
    });
    if (Admin.tab === 'config') renderConfigValidation();
    renderAlerts();
  }

  Admin.render = function () { renderTab(); };

  function onAction(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    var a = btn.dataset.action;
    switch (a) {
      case 'backup': backup(); break;
      case 'restore': importFile('sauvegarde'); break;
      case 'import': importFile('tirage'); break;
      case 'print': showPrint(); break;
      case 'verify': runVerify(); break;
      case 'fullscreen': App.toggleFullscreen(); break;
      case 'add-prize': addPrize(); break;
      case 'del-prize': {
        var idx = Number(btn.closest('.prize-row').dataset.index);
        Admin.draft.prizes.splice(idx, 1);
        Admin.dirty = true;
        renderTab();
        break;
      }
      case 'save-config': saveConfig(); break;
      case 'discard-config':
        Admin.draft = null;
        Admin.dirty = false;
        renderTab();
        break;
      case 'new-seed': {
        var seed = Draw.randomSeed();
        $('seed-input').value = seed;
        App.state.seedDraft = seed;
        App.save();
        break;
      }
      case 'generate': generate(); break;
      case 'lock': lockDraw(); break;
      case 'unlock-demo':
        App.unlockDemo();
        UI.toast('Démo déverrouillée : vous pouvez modifier les lots et régénérer.', 'success');
        renderTab();
        break;
      case 'export-json': App.exportDrawJson(); break;
      case 'export-csv': App.exportDrawCsv(); break;
      case 'export-log-csv': App.exportLogCsv(); break;
      case 'export-log-json': App.exportLogJson(); break;
      case 'filter': Admin.drawFilter = btn.dataset.filter; renderTab(); break;
      case 'cancel-play': cancelPlay(btn.dataset.ticket || ($('cancel-ticket') && $('cancel-ticket').value)); break;
      case 'test-sound': Sound.unlock(); Sound[btn.dataset.sound](0); break;
      case 'change-pin': changePin(); break;
      case 'reset-all': resetAll(); break;
      case 'demo-start':
        confirmLeaveDraft().then(function (ok) {
          if (!ok) return;
          App.loadMode('demo');
          Admin.tab = 'dashboard';
          App.showScreen('game');
          UI.toast('Mode démo activé.', 'success');
        });
        break;
      case 'demo-reset':
        App.resetDemo();
        Admin.draft = null; Admin.dirty = false; Admin.lastVerify = null;
        UI.toast('Démo réinitialisée.', 'success');
        renderTab();
        break;
      case 'demo-quit':
        App.loadMode('real');
        Admin.draft = null; Admin.dirty = false; Admin.lastVerify = null;
        Admin.tab = 'dashboard';
        App.showScreen('game');
        UI.toast('Retour aux données de la soirée.', 'success');
        break;
    }
  }

  function confirmLeaveDraft() {
    if (!Admin.dirty) return Promise.resolve(true);
    return UI.confirm('Modifications non enregistrées', 'Les modifications des lots n’ont pas été enregistrées. Les abandonner ?', 'Abandonner', true)
      .then(function (ok) {
        if (ok) { Admin.draft = null; Admin.dirty = false; }
        return ok;
      });
  }

  Admin.init = function () {
    $('admin-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (!b) return;
      Admin.tab = b.dataset.tab;
      Admin.lastVerify = Admin.tab === 'draw' || Admin.tab === 'dashboard' ? Admin.lastVerify : null;
      renderTab();
    });
    var content = $('admin-content');
    content.addEventListener('click', onAction);
    $('admin-alerts').addEventListener('click', onAction);
    content.addEventListener('input', function (e) {
      if (Admin.tab === 'config') onConfigInput(e);
      else if (Admin.tab === 'settings' && e.target.type !== 'checkbox') onSettingInput(e);
      else if (e.target.id === 'draw-search') {
        Admin.drawSearch = e.target.value.replace(/\D/g, '');
        var pos = e.target.selectionStart;
        renderTab();
        var s = $('draw-search');
        s.focus();
        try { s.setSelectionRange(pos, pos); } catch (err) { /* type search */ }
      } else if (e.target.id === 'seed-input') {
        App.state.seedDraft = e.target.value;
        Store.saveState(App.mode, App.state);
      }
    });
    content.addEventListener('change', function (e) {
      if (Admin.tab === 'config' && e.target.tagName === 'SELECT') onConfigInput(e);
      else if (Admin.tab === 'settings' && e.target.type === 'checkbox' && e.target.id !== 'reset-keep') onSettingInput(e);
    });

    $('admin-back').addEventListener('click', function () {
      confirmLeaveDraft().then(function (ok) { if (ok) App.showScreen('game'); });
    });
    $('admin-backup').addEventListener('click', backup);
    $('print-go').addEventListener('click', function () { window.print(); });
    $('print-full').addEventListener('change', renderPrint);
    $('print-back').addEventListener('click', function () { App.showScreen('admin'); });
  };

  window.Admin = Admin;
})();
