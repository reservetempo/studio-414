/*
  Owner preview page, "Layout" section (preview.html): saves how the owners arranged
  the public site in the frame beside it, which is every visitor's starting layout.

  - The arranging itself happens in the frame, in its edit mode (edit.js): the owners
    drag the photo's edges, the mailing-list window and the 414. After each finished
    change the frame posts { type: 'studio414:layoutedit', layout } to this page, and
    that layout (the whole layout in force there) becomes the unsaved one shown here.
  - Reads the saved layout: the site_settings row 'layout' (supabase/layout.sql); no
    row means the default (CSS) layout, null. The section shows once the row is read
    and the frame has loaded (the frame's studio414SiteLayout checks values, layout.js).
  - "Save" checks the unsaved layout with valid() and upserts the row; the frame's
    copy (studio414SiteLayout.save) is updated to match. "Undo changes" puts the frame
    back to the saved layout. "Back to the default layout" deletes the row, after a
    confirm, and puts the frame back to the CSS layout.
  - Each time the frame loads (the Look section can reload it) it is switched to the
    unsaved layout if there is one, else to the saved one (apply(), which edit mode
    doesn't post back, and which keeps the frame's own fetch of the row from
    overriding it).
  - With unsaved changes, leaving the page asks first: the browser's own warning
    (beforeunload), and a confirm on the "Owner page" link.
  - On sign-out the frame goes back to the saved layout.
*/
(function () {
  'use strict';

  var admin = window.studioAdmin;
  var preview = window.studioPreview;
  if (!admin || !preview) {
    console.error('admin-layout.js: load it after admin.js and preview.js');
    return;
  }

  var PARTS = {
    photo: ['scale'],
    card: ['x', 'y', 'w', 'h'],
    big414: ['x', 'y', 'w']
  };
  var MESSAGE = 'studio414:layoutedit';

  admin.registerSection('layout', render);

  function render(body) {
    var disposed = false;
    var row = undefined;    // the row's value once read (null: no row), undefined until then
    var rowFailed = false;  // the row couldn't be read
    var shown = false;      // the form is showing (the row is read and the frame loaded)
    var saved = null;       // the saved layout (clean, or null: the default)
    var draft = undefined;  // the unsaved layout from the frame (clean or null), or undefined
    var busy = false;       // saving or deleting
    var leaving = false;    // the owner confirmed leaving by the "Owner page" link

    var root = el('div', 'layout');
    var loading = el('p', 'admin-status layout-loading', 'Loading the saved layout…');

    var form = el('div', 'layout-form');
    form.hidden = true;
    var intro = el('p', 'admin-hint layout-intro',
      'In the preview, drag the photo\'s edges to resize it, the mailing list window by ' +
      'its title bar or a corner, and the 414 to move it or by a corner to resize it. ' +
      'Visitors see the new layout once you save. On the site the 414 starts where ' +
      'you place it here, then drifts and bounces around the first screen.');
    var state = el('p', 'admin-status layout-state');
    state.setAttribute('aria-live', 'polite');

    var loadError = message('error');
    var error = message('error');
    var ok = message('ok');
    ok.tabIndex = -1;
    var saveButton = button('Save', true);
    var undoButton = button('Undo changes');
    var defaultButton = button('Back to the default layout');
    var actions = el('div', 'admin-actions layout-actions');
    actions.append(saveButton, undoButton, defaultButton);

    form.append(intro, state, loadError, error, ok, actions);
    root.append(loading, form);
    body.appendChild(root);

    var back = document.querySelector('.preview-back');

    saveButton.addEventListener('click', save);
    undoButton.addEventListener('click', undo);
    defaultButton.addEventListener('click', toDefault);
    window.addEventListener('message', onMessage);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pageshow', onPageShow);
    if (back) back.addEventListener('click', onBack);
    preview.frame.addEventListener('load', onFrameLoad);

    load();
    if (preview.site()) onFrameLoad();

    return function cleanup() {
      disposed = true;
      window.removeEventListener('message', onMessage);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pageshow', onPageShow);
      if (back) back.removeEventListener('click', onBack);
      preview.frame.removeEventListener('load', onFrameLoad);
      var api = lib();
      if (api && shown && unsaved()) api.apply(saved);
      draft = undefined;
    };

    function load() {
      admin.client.from('site_settings').select('value').eq('key', 'layout').maybeSingle()
        .then(function (result) {
          if (disposed) return;
          if (result.error) throw result.error;
          row = result.data ? result.data.value : null;
          ready();
        })
        .catch(function (err) {
          if (disposed) return;
          row = null;
          rowFailed = true;
          say(loadError, 'The saved layout couldn\'t load, so this starts from the layout in ' +
            'the preview. ' + describeDbError(err));
          ready();
        });
    }

    // The frame's studio414SiteLayout, once it has loaded; else null.
    function lib() {
      var win = preview.site();
      return (win && win.studio414SiteLayout) || null;
    }

    // Shows the form once the row is read and the frame has loaded.
    function ready() {
      var api = lib();
      if (shown || row === undefined || !api) return;
      if (rowFailed) {
        saved = clean(api.current());
      } else if (row !== null && !api.valid(row)) {
        saved = null;
        say(loadError, 'The saved layout isn\'t one this site can use, so this starts from ' +
          'the default layout.');
      } else {
        saved = clean(row);
      }
      shown = true;
      loading.hidden = true;
      form.hidden = false;
      sync();
      update();
    }

    // Each load of the framed site.
    function onFrameLoad() {
      if (disposed) return;
      if (!shown) ready();
      else sync();
    }

    // Switches the frame to the unsaved layout, or else to the saved one (unless the
    // row couldn't be read: the frame then keeps its own).
    function sync() {
      var api = lib();
      if (!api) return;
      if (unsaved()) api.apply(draft);
      else if (!rowFailed) api.apply(saved);
    }

    function onMessage(event) {
      if (disposed || event.origin !== location.origin) return;
      if (event.source !== preview.frame.contentWindow) return;
      var data = event.data;
      if (!data || data.type !== MESSAGE) return;
      var api = lib();
      if (data.layout !== null && !(api ? api.valid(data.layout) : isObject(data.layout))) return;
      draft = clean(data.layout);
      say(error, '');
      say(ok, '');
      update();
    }

    function unsaved() {
      return draft !== undefined && !same(draft, saved);
    }

    function update() {
      var changed = shown && unsaved();
      saveButton.disabled = busy || !changed;
      undoButton.disabled = busy || !changed;
      defaultButton.disabled = busy || !shown || (saved === null && !changed);
      state.textContent = '';
      if (changed) {
        state.append(el('strong', null, 'Unsaved changes.'),
          ' Visitors still see the ' + (saved ? 'saved' : 'default') + ' layout.');
      } else {
        state.textContent = saved ? 'Visitors see the saved layout, as in the preview.'
          : 'No layout saved: visitors see the default layout.';
      }
    }

    function save() {
      if (busy || !unsaved()) return;
      var api = lib();
      if (!api) {
        say(error, 'Not saved: the preview is still loading. Try again in a moment.');
        return;
      }
      var value = draft === null ? {} : draft;
      if (!api.valid(value)) {
        say(error, 'Not saved: this layout isn\'t one the site can use. Undo the changes ' +
          'and try again.');
        return;
      }
      value = clean(value);
      setBusy(true, saveButton, 'Saving…');
      admin.client.from('site_settings').upsert({ key: 'layout', value: value || {} })
        .then(function (result) {
          if (disposed) return;
          if (result.error) throw result.error;
          saved = value;
          draft = undefined;
          rowFailed = false;
          var now = lib();
          if (now) now.save(value);
          setBusy(false, saveButton, 'Save');
          say(loadError, '');
          say(ok, 'Saved. Visitors start from this layout now.');
          ok.focus();
        })
        .catch(function (err) {
          if (disposed) return;
          setBusy(false, saveButton, 'Save');
          say(error, 'Not saved. ' + describeDbError(err));
        });
    }

    function undo() {
      if (busy || !unsaved()) return;
      draft = undefined;
      var api = lib();
      if (api) api.apply(saved);
      say(error, '');
      say(ok, '');
      update();
    }

    function toDefault() {
      if (busy || !shown) return;
      if (!window.confirm('Go back to the default layout? This removes the saved layout ' +
          '(and any unsaved changes), so visitors see the site as first designed.')) return;
      if (saved === null) { // no row: only the unsaved changes to drop
        finishDefault('Back to the default layout.');
        return;
      }
      setBusy(true, defaultButton, 'Removing…');
      admin.client.from('site_settings').delete().eq('key', 'layout')
        .then(function (result) {
          if (disposed) return;
          if (result.error) throw result.error;
          setBusy(false, defaultButton, 'Back to the default layout');
          finishDefault('Back to the default layout. Visitors start from it now.');
        })
        .catch(function (err) {
          if (disposed) return;
          setBusy(false, defaultButton, 'Back to the default layout');
          say(error, 'The saved layout wasn\'t removed. ' + describeDbError(err));
        });
    }

    function finishDefault(text) {
      saved = null;
      draft = undefined;
      rowFailed = false;
      var api = lib();
      if (api) {
        api.apply(null);
        api.save(null);
      }
      say(loadError, '');
      say(error, '');
      say(ok, text);
      update();
      ok.focus();
    }

    function setBusy(on, which, label) {
      busy = on;
      which.textContent = label;
      if (on) {
        say(error, '');
        say(ok, '');
      }
      update();
    }

    function onBeforeUnload(event) {
      if (leaving || !shown || !unsaved()) return;
      event.preventDefault();
      event.returnValue = '';
    }

    function onPageShow() {
      leaving = false;
    }

    // The "Owner page" link: asks first with unsaved changes (not for a new tab).
    function onBack(event) {
      if (!shown || !unsaved()) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (window.confirm('Your layout changes aren\'t saved. Leave this page without saving them?')) {
        leaving = true;
      } else {
        event.preventDefault();
      }
    }
  }

  // ---- Helpers -----------------------------------------------------------------------

  function isObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  // A clean copy of a layout (its known parts, keys in order), or null when it has none.
  function clean(v) {
    if (!isObject(v)) return null;
    var out = {};
    var any = false;
    Object.keys(PARTS).forEach(function (name) {
      if (!isObject(v[name])) return;
      out[name] = {};
      PARTS[name].forEach(function (key) { out[name][key] = v[name][key]; });
      any = true;
    });
    return any ? out : null;
  }

  function same(a, b) {
    return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
  }

  function describeDbError(err) {
    var code = err && err.code;
    var text = (err && err.message) || '';
    if (code === '42501') return 'This account isn\'t allowed to change the layout (only owners can).';
    if (code === '23514') {
      return 'The database refused the layout (run supabase/layout.sql again).';
    }
    if (code === '42P01' || code === 'PGRST205') {
      return 'The settings table isn\'t set up yet (run supabase/wallpaper.sql, then supabase/layout.sql).';
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
