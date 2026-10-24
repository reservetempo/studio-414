/*
  Owner page, "Look" section (admin.html, preview.html): the theme and the colour of
  the whole site, the public site and this page.

  - Reads the saved look: the site_settings row 'look' (supabase/look.sql), as
    { theme, color }; no row means Aqua and Classic (studio414Look.DEFAULT). If it
    can't be read, the picks start from the look on the page, with a notice.
  - A radio list of the six themes and a radio grid of the 21 colours (each swatch
    carries data-color="N", so it is drawn in that colour's own palette). A pick
    switches this page at once (studio414Look.apply, look.js); nothing changes for
    visitors until "Save", which upserts the row and keeps the copy look.js reads
    before first paint (studio414Look.save).
  - "Preview the site" opens index.html?theme=<id>&color=<n> in a new tab: a preview
    look.js shows without saving. It is left out when the section has the attribute
    data-look-no-preview (preview.html, which shows the site beside it and switches it
    with this page, see preview.js). "Undo changes" goes back to the saved look; it is
    enabled only while the picks differ from it.
  - On sign-out the page goes back to the saved look.
  When the page itself is a preview (admin.html?theme=...&color=..., as in
  themes/README.md), the picks start from the preview, the page isn't switched to the
  saved look, and on sign-out it goes back to the preview.
*/
(function () {
  'use strict';

  var admin = window.studioAdmin;
  var look = window.studio414Look;
  if (!admin || !look) {
    console.error('admin-look.js: load it after look.js and admin.js');
    return;
  }

  admin.registerSection('look', render);

  function render(body) {
    var disposed = false;
    var start = look.current();   // the look on the page before this section
    var saved = null;             // the saved look, once read: { theme, color }
    var picks = null;             // the look picked here (and on the page)
    var saving = false;

    var root = el('div', 'look');

    var loading = el('p', 'admin-status look-loading', 'Loading the saved look…');

    var form = el('div', 'look-form');
    form.hidden = true;
    var intro = el('p', 'admin-hint look-intro',
      'The theme and colour of the whole site, this page included. A pick shows here ' +
      'straight away; visitors see it once you save.');

    // The themes: a list of radio buttons.
    var themeField = el('div', 'look-field');
    var themeLabel = el('span', 'look-label', 'Theme');
    themeLabel.id = 'look-theme-label';
    var themeList = el('div', 'look-themes');
    themeList.setAttribute('role', 'radiogroup');
    themeList.setAttribute('aria-labelledby', 'look-theme-label');
    var themeInputs = look.THEMES.map(function (theme) {
      var label = el('label', 'look-theme');
      var input = el('input', 'look-theme-input');
      input.type = 'radio';
      input.name = 'look-theme';
      input.value = theme.id;
      label.append(input, el('span', 'look-theme-name', theme.name));
      themeList.appendChild(label);
      return input;
    });
    themeField.append(themeLabel, themeList);

    // The colours: a grid of swatches, each a radio button (kept out of sight, the
    // swatch shows it) in its own colour's palette.
    var colorField = el('div', 'look-field');
    var colorLabel = el('span', 'look-label', 'Colour');
    colorLabel.id = 'look-color-label';
    var colorGrid = el('div', 'look-colors');
    colorGrid.setAttribute('role', 'radiogroup');
    colorGrid.setAttribute('aria-labelledby', 'look-color-label');
    var colorInputs = look.COLORS.map(function (name, n) {
      var label = el('label', 'look-color');
      var input = el('input', 'look-color-input');
      input.type = 'radio';
      input.name = 'look-color';
      input.value = String(n);
      var chip = el('span', 'look-color-chip');
      chip.setAttribute('data-color', String(n));
      chip.setAttribute('aria-hidden', 'true');
      label.append(input, chip, el('span', 'look-color-name', name));
      colorGrid.appendChild(label);
      return input;
    });
    colorField.append(colorLabel, colorGrid);

    var loadError = message('error');
    var error = message('error');
    var ok = message('ok');
    ok.tabIndex = -1;
    var saveButton = button('Save', true);
    var undoButton = button('Undo changes');
    var actions = el('div', 'admin-actions look-actions');
    actions.append(saveButton, undoButton);
    var section = body.closest('[data-section]');
    if (!(section && section.hasAttribute('data-look-no-preview'))) {
      var previewButton = button('Preview the site');
      actions.appendChild(previewButton);
      previewButton.addEventListener('click', function () {
        window.open('index.html?theme=' + encodeURIComponent(picks.theme) +
          '&color=' + picks.color, '_blank', 'noopener');
      });
    }

    form.append(intro, themeField, colorField, loadError, error, ok, actions);
    root.append(loading, form);
    body.appendChild(root);

    themeInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        if (input.checked) pick({ theme: input.value, color: picks.color });
      });
    });
    colorInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        if (input.checked) pick({ theme: picks.theme, color: Number(input.value) });
      });
    });
    saveButton.addEventListener('click', save);
    undoButton.addEventListener('click', function () {
      if (saving || same(picks, saved)) return;
      pick({ theme: saved.theme, color: saved.color });
    });
    load();

    return function cleanup() {
      disposed = true;
      if (!saved) return; // still loading: nothing here has changed the page
      var back = look.preview ? start : saved;
      if (!same(look.current(), back)) look.apply(back);
    };

    function load() {
      admin.client.from('site_settings').select('value').eq('key', 'look').maybeSingle()
        .then(function (result) {
          if (disposed) return;
          if (result.error) throw result.error;
          var value = result.data && result.data.value;
          // (look.js keeps its copy of the row up to date itself.)
          saved = look.valid(value) ? copy(value) : copy(look.DEFAULT);
          show(look.preview ? start : saved);
        })
        .catch(function (err) {
          if (disposed) return;
          saved = copy(start);
          show(start);
          say(loadError, 'The saved look couldn\'t load, so this shows the look on this page. ' +
            describeDbError(err));
        });
    }

    function show(v) {
      loading.hidden = true;
      form.hidden = false;
      pick(v);
    }

    // Sets the picks (and the radio buttons) to v and switches the page to it.
    function pick(v) {
      picks = { theme: v.theme, color: v.color };
      themeInputs.forEach(function (input) { input.checked = input.value === picks.theme; });
      colorInputs.forEach(function (input) { input.checked = Number(input.value) === picks.color; });
      if (!same(look.current(), picks)) look.apply(picks);
      say(error, '');
      say(ok, '');
      update();
    }

    function update() {
      saveButton.disabled = saving;
      undoButton.disabled = saving || same(picks, saved);
    }

    function save() {
      if (saving || !picks) return;
      var value = { theme: picks.theme, color: picks.color };
      saving = true;
      saveButton.textContent = 'Saving…';
      say(error, '');
      say(ok, '');
      update();
      admin.client.from('site_settings').upsert({ key: 'look', value: value })
        .then(function (result) {
          if (disposed) return;
          if (result.error) throw result.error;
          saving = false;
          saved = value;
          look.save(value);
          saveButton.textContent = 'Save';
          update();
          say(loadError, '');
          say(ok, 'Saved. The whole site uses this look now.');
          ok.focus();
        })
        .catch(function (err) {
          if (disposed) return;
          saving = false;
          saveButton.textContent = 'Save';
          update();
          say(error, 'Not saved. ' + describeDbError(err));
        });
    }
  }

  // ---- Helpers -----------------------------------------------------------------------

  function same(a, b) {
    return !!a && !!b && a.theme === b.theme && a.color === b.color;
  }

  function copy(v) {
    return { theme: v.theme, color: v.color };
  }

  function describeDbError(err) {
    var code = err && err.code;
    var text = (err && err.message) || '';
    if (code === '42501') return 'This account isn\'t allowed to change the look (only owners can).';
    if (code === '23514') {
      return 'The database refused the theme or the colour (run supabase/look.sql again).';
    }
    if (code === '42P01' || code === 'PGRST205') {
      return 'The settings table isn\'t set up yet (run supabase/wallpaper.sql, then supabase/look.sql).';
    }
    if (!text || /fetch|network|load failed/i.test(text)) {
      return 'Couldn\'t reach Supabase. Check your connection and try again.';
    }
    return text.replace(/\.?$/, '.');
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(label, primary) {
    var node = el('button', 'admin-button aqua-pill' + (primary ? ' admin-button-primary aqua-pill--tint' : ''), label);
    node.type = 'button';
    return node;
  }

  // A message line: 'error' (role alert) or 'ok' (role status), hidden while empty.
  function message(kind) {
    var node = el('p', 'admin-message admin-message-' + kind);
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.hidden = true;
    return node;
  }

  function say(node, text) {
    node.textContent = text || '';
    node.hidden = !text;
  }
})();
