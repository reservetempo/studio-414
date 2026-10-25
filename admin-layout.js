/*
  Owner preview page, "Layout" section (preview.html): saves how the owners arranged
  the public site in the frame beside it, which is every visitor's starting layout.

  - The arranging itself happens in the frame, in its edit mode (edit.js): the owners
    drag the photo's edges, the mailing-list window and the 414. After each finished
    change the frame posts { type: 'studio414:layoutedit', layout } to this page, and
    that layout (the whole layout in force there) becomes the unsaved one shown here.
  - "414 text": the text shown in place of the big 414 (big414Text, layout.js), up to
    20 characters. Each keystroke trims it (control characters become spaces first),
    puts it in the unsaved layout (blank removes big414Text: 414) and applies that to
    the frame at once, which edit mode doesn't post back. The field follows the
    unsaved layout, else the saved one (Undo changes, Back to the default layout).
  - "Show the comment section": a check box, ticked unless the layout hides the
    section (commentsHidden, layout.js). Unticking puts commentsHidden: true in the
    unsaved layout and applies it to the frame at once, as "414 text" does, so the
    frame shows the site without it, as visitors will see it; ticking removes it. The
    comments themselves are kept. It follows the layout like the field does.
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
    big414: ['x', 'y', 'w'],
    comments: ['x', 'y', 'w', 'h']
  };
  var TEXT_MAX = 20; // big414Text's most characters (code points), layout.js
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
    // "414 text", laid out as the sign-in dialog's fields (admin.css, the themes).
    var textField = el('div', 'admin-signin-field layout-field');
    var textLabel = el('label', 'admin-label', '414 text');
    textLabel.htmlFor = 'layout-414-text';
    var textInput = el('input', 'admin-field aqua-field layout-text');
    textInput.id = 'layout-414-text';
    textInput.type = 'text';
    textInput.maxLength = TEXT_MAX;
    textInput.placeholder = '414';
    textInput.autocomplete = 'off';
    textInput.spellcheck = false;
    var textHint = el('span', 'admin-hint layout-text-hint',
      'Shown in place of the big 414. Leave it blank for 414.');
    textHint.id = 'layout-414-text-hint';
    textInput.setAttribute('aria-describedby', textHint.id);
    textField.append(textLabel, textInput, textHint);
    // "Show the comment section": the sign-up window's check box (.workshop__check,
    // admin.css and the themes), as the Workshops section's are.
    var commentsField = el('div', 'admin-signin-field layout-field');
    var commentsLabel = el('label', 'workshop__check layout-check');
    var commentsInput = el('input');
    commentsInput.type = 'checkbox';
    commentsInput.id = 'layout-comments-shown';
    commentsInput.checked = true;
    commentsLabel.append(commentsInput, el('span', 'admin-label', 'Show the comment section'));
    var commentsHint = el('span', 'admin-hint layout-check-hint',
      'Untick it to hide the comment section from visitors. Its comments are kept.');
    commentsHint.id = 'layout-comments-shown-hint';
    commentsInput.setAttribute('aria-describedby', commentsHint.id);
    commentsField.append(commentsLabel, commentsHint);

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

    form.append(intro, textField, commentsField, state, loadError, error, ok, actions);
    root.append(loading, form);
    body.appendChild(root);

    var back = document.querySelector('.preview-back');

    textInput.addEventListener('input', onText);
    commentsInput.addEventListener('change', onComments);
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
      showText();
      showComments();
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
      showText();
      showComments();
      say(error, '');
      say(ok, '');
      update();
    }

    // "414 text" typed: into the unsaved layout, and the frame, at once.
    function onText() {
      if (disposed || !shown || busy) return;
      var api = lib();
      if (!api) return;
      var next = clean(draft !== undefined ? draft : saved) || {};
      var text = textOf(textInput.value);
      if (text) next.big414Text = text;
      else delete next.big414Text;
      if (!api.valid(next)) return;
      draft = clean(next);
      api.apply(draft);
      say(error, '');
      say(ok, '');
      update();
    }

    // The field shows the unsaved layout's text, else the saved one's ('' for 414).
    // Left as typed while it means the same (white space at the ends).
    function showText() {
      var v = draft !== undefined ? draft : saved;
      var text = v && v.big414Text ? v.big414Text : '';
      if (textOf(textInput.value) !== text) textInput.value = text;
    }

    // "Show the comment section" ticked or unticked: into the unsaved layout
    // (commentsHidden: true, or removed), and the frame, at once.
    function onComments() {
      var api = disposed || !shown || busy ? null : lib();
      var next = clean(draft !== undefined ? draft : saved) || {};
      if (commentsInput.checked) delete next.commentsHidden;
      else next.commentsHidden = true;
      if (!api || !api.valid(next)) {
        showComments();
        return;
      }
      draft = clean(next);
      api.apply(draft);
      say(error, '');
      say(ok, '');
      update();
    }

    // The check box shows the unsaved layout, else the saved one: ticked unless hidden.
    function showComments() {
      var v = draft !== undefined ? draft : saved;
      commentsInput.checked = !(v && v.commentsHidden === true);
    }

    function unsaved() {
      return draft !== undefined && !same(draft, saved);
    }

    function update() {
      var changed = shown && unsaved();
      saveButton.disabled = busy || !changed;
      undoButton.disabled = busy || !changed;
      defaultButton.disabled = busy || !shown || (saved === null && !changed);
      textInput.disabled = busy || !shown;
      commentsInput.disabled = busy || !shown;
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
      showText();
      showComments();
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
      showText();
      showComments();
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

  // A clean copy of a layout (its known parts, keys in order, then big414Text and
  // commentsHidden, as layout.js orders them), or null when it has none.
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
    if (typeof v.big414Text === 'string' && v.big414Text) {
      out.big414Text = v.big414Text;
      any = true;
    }
    if (v.commentsHidden === true) {
      out.commentsHidden = true;
      any = true;
    }
    return any ? out : null;
  }

  // The 414's text as layout.js takes it: one line (control characters and line or
  // paragraph separators become spaces), at most TEXT_MAX characters, trimmed. '' is 414.
  function textOf(value) {
    var text = String(value == null ? '' : value)
      .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ');
    return Array.from(text.trim()).slice(0, TEXT_MAX).join('').trim();
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
