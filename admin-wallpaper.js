/*
  Owner page, "Wallpaper" section (admin.html): the photo behind the public site and
  the spot on it where the mailing-list card sits.

  - Shows the current wallpaper: the site_settings row 'wallpaper' (supabase/wallpaper.sql)
    or, until one is saved, the photo in the site's own files. Cloudinary photos are
    shown through a smaller delivery copy (PREVIEW_TRANSFORM) so they load quickly.
  - "Choose photo": asks the cloudinary-sign function (supabase/functions) for an upload
    signature with the owner's session, then uploads the file straight to Cloudinary.
  - "Mark the spot" / "Move the spot": a box the owner drags and resizes (mouse, touch,
    keyboard) over where the card should sit. Nothing is saved until "Save", which
    upserts the row. "Use the original photo" deletes the row.

  The spot is kept as fractions of the photo: cx (centre, from the left), bottom (bottom
  edge, from the top), w and h, the same as --window-cx/-bottom/-w/-h in styles.css.
  Setup: README, "Set up the wallpaper upload".
*/
(function () {
  'use strict';

  var admin = window.studioAdmin;
  if (!admin) {
    console.error('admin-wallpaper.js: load it after admin.js');
    return;
  }

  // The photo in the site's files, used while no wallpaper row exists.
  var BUILT_IN = {
    url: 'photos/IMG_9135-centered.jpg',
    width: 2462,
    height: 1920,
    spot: { cx: 0.5, bottom: 0.4583, w: 0.3184, h: 0.0964 }
  };
  // The built-in spot's shape on the photo (width : height in pixels), shown as a guide.
  var ORIGINAL_SHAPE = (BUILT_IN.spot.w * BUILT_IN.width) / (BUILT_IN.spot.h * BUILT_IN.height);

  var MAX_BYTES = 10 * 1024 * 1024;   // Cloudinary's free plan takes images up to 10 MB
  var MIN_W = 0.05;                    // smallest box: 5% of the photo's width...
  var MIN_H = 0.03;                    // ...and 3% of its height
  var STEP = 0.005;                    // one arrow-key press: 0.5% of the photo
  var PREVIEW_TRANSFORM = 'f_auto,q_auto,c_limit,w_1200';
  // What the database accepts as a wallpaper url (site_settings_wallpaper_shape).
  var CLOUDINARY_URL = /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/[A-Za-z0-9_.,\/-]+$/;
  var HANDLES = ['nw', 'ne', 'sw', 'se'];
  var SIGNED_OUT = 'You\'re signed out. Sign in again, then choose the photo once more.';

  var config = window.COMMENTS_CONFIG || {};
  var supabaseUrl = String(config.supabaseUrl || '').trim().replace(/\/+$/, '');
  var supabaseKey = String(config.supabaseAnonKey || '').trim();

  admin.registerSection('wallpaper', render);

  function render(body) {
    var disposed = false;
    var current = null;   // { url, width, height, spot, builtIn, updatedAt }
    var busy = false;     // an upload or a switch back is running
    var run = null;       // the upload in progress: { stopped, abort, xhr }
    var editor = null;    // { photo: { url, width, height }, rect: { left, top, w, h }, isNew }
    var drag = null;
    var saving = false;

    var root = el('div', 'wallpaper');

    // Loading (and a failed load).
    var loadingPanel = el('div', 'wallpaper-loading');
    var loadingText = el('p', 'admin-status', 'Loading the current wallpaper…');
    var loadError = message('error');
    var retryButton = button('Try again', true);
    loadingPanel.append(loadingText, loadError, retryButton);

    // The current wallpaper.
    var currentPanel = el('div', 'wallpaper-current');
    var currentFigure = el('figure', 'wallpaper-figure');
    var currentImg = photoImg('The current wallpaper, with the mailing-list card\'s spot outlined');
    var currentSpot = el('div', 'wallpaper-spot');
    currentFigure.append(currentImg, currentSpot);
    var caption = el('p', 'wallpaper-caption');
    var progress = el('div', 'wallpaper-progress');
    var progressText = el('span', 'wallpaper-progress-text');
    progressText.setAttribute('role', 'status');
    var progressBar = el('progress', 'wallpaper-progress-bar');
    progressBar.max = 100;
    progressBar.setAttribute('aria-label', 'Upload progress');
    var stopButton = button('Stop upload');
    progress.append(progressText, progressBar, stopButton);
    progress.hidden = true;
    var currentError = message('error');
    var currentOk = message('ok');
    currentOk.tabIndex = -1;
    var chooseButton = button('Choose photo', true);
    var moveButton = button('Move the spot');
    var originalButton = button('Use the original photo');
    var currentActions = el('div', 'admin-actions');
    currentActions.append(chooseButton, moveButton, originalButton);
    var note = el('p', 'admin-hint wallpaper-note',
      'A JPEG, PNG, WebP or HEIC photo, up to 10 MB. After uploading you mark the card\'s ' +
      'spot; nothing changes on the site until you save.');
    var fileInput = el('input', 'wallpaper-file');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    fileInput.tabIndex = -1;
    currentPanel.append(currentFigure, caption, progress, currentError, currentOk,
      currentActions, note, fileInput);

    // Marking the spot.
    var editorPanel = el('div', 'wallpaper-editor');
    var editorTitle = el('h3', 'wallpaper-editor-title');
    editorTitle.tabIndex = -1;
    var editorIntro = el('p', 'wallpaper-editor-intro');
    var hint = el('p', 'admin-hint wallpaper-hint',
      'Drag the box to move it and its corners to resize it. Or select it and use the arrow ' +
      'keys to move it, Shift + arrow keys to resize it.');
    hint.id = 'wallpaper-hint';
    var editorFigure = el('figure', 'wallpaper-figure wallpaper-figure-editor');
    var editorImg = photoImg('The photo to mark');
    var box = el('div', 'wallpaper-box');
    box.tabIndex = 0;
    box.setAttribute('role', 'application');
    box.setAttribute('aria-label', 'The card\'s spot');
    box.setAttribute('aria-describedby', 'wallpaper-hint wallpaper-readout');
    HANDLES.forEach(function (corner) {
      var handle = el('span', 'wallpaper-handle wallpaper-handle-' + corner);
      handle.setAttribute('data-handle', corner);
      handle.setAttribute('aria-hidden', 'true');
      box.appendChild(handle);
    });
    editorFigure.append(editorImg, box);
    var readout = el('p', 'wallpaper-readout');
    readout.id = 'wallpaper-readout';
    readout.setAttribute('aria-live', 'polite');
    var editorError = message('error');
    var saveButton = button('Save', true);
    var cancelButton = button('Cancel');
    var editorActions = el('div', 'admin-actions');
    editorActions.append(saveButton, cancelButton);
    editorPanel.append(editorTitle, editorIntro, hint, editorFigure, readout, editorError,
      editorActions);

    root.append(loadingPanel, currentPanel, editorPanel);
    body.appendChild(root);

    retryButton.addEventListener('click', load);
    chooseButton.addEventListener('click', function () {
      if (busy) return;
      fileInput.value = '';
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file || busy) return;
      clearMessages();
      var problem = checkFile(file);
      if (problem) {
        say(currentError, problem);
        return;
      }
      upload(file);
    });
    stopButton.addEventListener('click', function () {
      if (run) run.stop();
    });
    moveButton.addEventListener('click', function () {
      if (busy || !current || current.builtIn) return;
      openEditor({ url: current.url, width: current.width, height: current.height }, false);
    });
    originalButton.addEventListener('click', useOriginal);
    saveButton.addEventListener('click', save);
    cancelButton.addEventListener('click', function () {
      if (saving) return;
      var wasNew = editor && editor.isNew;
      closeEditor();
      (wasNew ? chooseButton : moveButton).focus();
    });

    box.addEventListener('pointerdown', startDrag);
    box.addEventListener('pointermove', moveDrag);
    box.addEventListener('pointerup', endDrag);
    box.addEventListener('pointercancel', endDrag);
    box.addEventListener('lostpointercapture', endDrag);
    box.addEventListener('keydown', onKey);

    load();

    return function cleanup() {
      disposed = true;
      if (run) run.stop();
      currentImg.onerror = null;
      editorImg.onerror = null;
      editorImg.onload = null;
    };

    // ---- Current wallpaper ---------------------------------------------------------

    function load() {
      showPanel('loading');
      loadingText.hidden = false;
      retryButton.hidden = true;
      say(loadError, '');
      admin.client.from('site_settings').select('value, updated_at').eq('key', 'wallpaper').maybeSingle()
        .then(function (result) {
          if (disposed) return;
          if (result.error) throw result.error;
          setCurrent(result.data ? fromRow(result.data) : null);
          showPanel('current');
        })
        .catch(function (err) {
          if (disposed) return;
          loadingText.hidden = true;
          say(loadError, 'The current wallpaper couldn\'t load. ' + describeDbError(err));
          retryButton.hidden = false;
        });
    }

    function setCurrent(wallpaper) {
      current = wallpaper || {
        url: BUILT_IN.url,
        width: BUILT_IN.width,
        height: BUILT_IN.height,
        spot: copy(BUILT_IN.spot),
        builtIn: true,
        updatedAt: null
      };
      showPhoto(currentFigure, currentImg, current, function () {
        say(currentError, 'The current photo couldn\'t be shown. Check your connection and reload the page.');
      });
      placeBox(currentSpot, spotToRect(current.spot));
      var size = formatNumber(current.width) + ' × ' + formatNumber(current.height);
      caption.textContent = current.builtIn
        ? 'The original photo (' + size + '), from the site\'s own files. Its spot is set ' +
          'there too; upload a photo to mark a new one.'
        : 'Uploaded photo (' + size + ')' +
          (current.updatedAt ? ', saved ' + formatDate(current.updatedAt) : '') + '.';
      moveButton.hidden = current.builtIn;
      originalButton.hidden = current.builtIn;
    }

    function useOriginal() {
      if (busy || !current || current.builtIn) return;
      if (!window.confirm('Go back to the original photo? The uploaded photo and its spot ' +
          'stop showing on the site.')) return;
      clearMessages();
      setBusy(true);
      originalButton.textContent = 'Switching back…';
      admin.client.from('site_settings').delete().eq('key', 'wallpaper')
        .then(function (result) {
          if (disposed) return;
          if (result.error) throw result.error;
          setBusy(false);
          originalButton.textContent = 'Use the original photo';
          setCurrent(null);
          say(currentOk, 'The site uses the original photo again.');
          currentOk.focus();
        })
        .catch(function (err) {
          if (disposed) return;
          setBusy(false);
          originalButton.textContent = 'Use the original photo';
          say(currentError, 'Couldn\'t switch back. ' + describeDbError(err));
        });
    }

    // ---- Upload ----------------------------------------------------------------------

    function upload(file) {
      setBusy(true);
      var thisRun = run = {
        stopped: false,
        abort: null,
        xhr: null,
        stop: function () {
          thisRun.stopped = true;
          if (thisRun.abort) try { thisRun.abort.abort(); } catch (err) { /* already done */ }
          if (thisRun.xhr) try { thisRun.xhr.abort(); } catch (err) { /* already done */ }
        }
      };
      showProgress('Getting ready to upload…', null);

      getSignature(thisRun)
        .then(function (signature) { return sendToCloudinary(thisRun, file, signature); })
        .then(function (photo) {
          if (disposed) return;
          run = null;
          hideProgress();
          setBusy(false);
          openEditor(photo, true);
        })
        .catch(function (err) {
          if (disposed) return;
          run = null;
          hideProgress();
          setBusy(false);
          if (thisRun.stopped) say(currentOk, 'Upload stopped. Nothing was changed.');
          else say(currentError, (err && err.message) || 'The upload didn\'t work. Try again.');
        });
    }

    function getSignature(thisRun) {
      return accessToken().then(function (token) {
        if (thisRun.stopped) throw new Error('stopped');
        if (!token) throw new Error(SIGNED_OUT);
        if (!supabaseUrl) throw new Error('The Supabase settings in comments-config.js are empty.');
        var init = {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, apikey: supabaseKey }
        };
        if (typeof AbortController === 'function') {
          thisRun.abort = new AbortController();
          init.signal = thisRun.abort.signal;
        }
        return fetch(supabaseUrl + '/functions/v1/cloudinary-sign', init).catch(function () {
          throw new Error('Couldn\'t reach Supabase to get ready for the upload. Check your ' +
            'connection and try again.');
        });
      }).then(function (res) {
        thisRun.abort = null;
        return res.json().catch(function () { return null; }).then(function (data) {
          if (res.ok && data && data.cloudName && data.apiKey && data.timestamp &&
              data.signature && data.folder) return data;
          throw new Error(signError(res.status, data));
        });
      });
    }

    function sendToCloudinary(thisRun, file, signature) {
      return new Promise(function (resolve, reject) {
        if (thisRun.stopped) {
          reject(new Error('stopped'));
          return;
        }
        var cloudName = String(signature.cloudName);
        if (!/^[A-Za-z0-9_-]+$/.test(cloudName)) {
          reject(new Error('The upload settings came back wrong (the Cloudinary cloud name). ' +
            'Check the cloudinary-sign function\'s secrets.'));
          return;
        }
        // Exactly these fields: anything else would break the signature.
        var form = new FormData();
        form.append('file', file);
        form.append('api_key', String(signature.apiKey));
        form.append('timestamp', String(signature.timestamp));
        form.append('folder', String(signature.folder));
        form.append('signature', String(signature.signature));

        var xhr = thisRun.xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://api.cloudinary.com/v1_1/' + cloudName + '/image/upload');
        xhr.upload.onprogress = function (e) {
          if (!e.lengthComputable || !e.total) return;
          var done = e.loaded / e.total;
          if (done >= 1) showProgress('Cloudinary is processing the photo…', null);
          else showProgress('Uploading… ' + Math.floor(done * 100) + '%', done);
        };
        xhr.onload = function () {
          thisRun.xhr = null;
          var data = null;
          try { data = JSON.parse(xhr.responseText); } catch (err) { /* not JSON */ }
          if (xhr.status >= 200 && xhr.status < 300 && data) {
            var photo = {
              url: String(data.secure_url || ''),
              width: Number(data.width),
              height: Number(data.height)
            };
            if (photo.url.length > 500 || !CLOUDINARY_URL.test(photo.url)) {
              reject(new Error('Cloudinary sent back a photo address the site can\'t use. ' +
                'Try another photo.'));
            } else if (!(photo.width > 0 && photo.height > 0)) {
              reject(new Error('Cloudinary didn\'t say how big the photo is. Try again.'));
            } else {
              resolve(photo);
            }
            return;
          }
          var reason = data && data.error && data.error.message;
          reject(new Error(reason
            ? 'Cloudinary didn\'t take the photo: ' + reason
            : 'The upload didn\'t work (error ' + xhr.status + '). Try again.'));
        };
        xhr.onerror = function () {
          thisRun.xhr = null;
          reject(new Error('The upload didn\'t go through. Check your connection and try again.'));
        };
        xhr.onabort = function () {
          thisRun.xhr = null;
          reject(new Error('stopped'));
        };
        xhr.send(form);
        showProgress('Uploading… 0%', 0);
      });
    }

    function showProgress(text, fraction) {
      progress.hidden = false;
      progressText.textContent = text;
      if (fraction == null) progressBar.removeAttribute('value');
      else progressBar.value = Math.round(fraction * 100);
    }

    function hideProgress() {
      progress.hidden = true;
      progressText.textContent = '';
    }

    // ---- Marking the spot --------------------------------------------------------------

    function openEditor(photo, isNew) {
      clearMessages();
      editor = {
        photo: { url: photo.url, width: photo.width, height: photo.height },
        rect: spotToRect(current ? current.spot : BUILT_IN.spot),
        isNew: isNew
      };
      saving = false;
      saveButton.disabled = false;
      cancelButton.disabled = false;
      saveButton.textContent = 'Save';
      say(editorError, '');
      editorTitle.textContent = isNew ? 'Mark the spot' : 'Move the spot';
      editorIntro.textContent = isNew
        ? 'Uploaded. Now put the box where the mailing-list card should sit on this photo, ' +
          'like the window on the original photo. It starts where the card sits now.'
        : 'Put the box where the mailing-list card should sit on this photo.';
      showPhoto(editorFigure, editorImg, editor.photo, function () {
        if (!editor) return;
        say(editorError, 'The photo couldn\'t be shown. Check your connection and try again.');
        saveButton.disabled = true;
      });
      editorImg.onload = fixOrientation;
      renderBox();
      showPanel('editor');
      editorTitle.focus();
    }

    function closeEditor() {
      editor = null;
      drag = null;
      box.classList.remove('is-dragging');
      editorImg.onerror = null;
      editorImg.onload = null;
      editorImg.removeAttribute('src');
      showPanel('current');
    }

    // Cloudinary reports the stored size; if the photo shows turned a quarter (camera
    // orientation), keep the size it shows at, which is what the site will show.
    function fixOrientation() {
      if (!editor) return;
      var nw = editorImg.naturalWidth;
      var nh = editorImg.naturalHeight;
      if (!nw || !nh) return;
      var p = editor.photo;
      var shown = nw / nh;
      var reported = p.width / p.height;
      if (Math.abs(shown / reported - 1) > 0.02 && Math.abs(shown * reported - 1) < 0.02) {
        var width = p.width;
        p.width = p.height;
        p.height = width;
        sizeFigure(editorFigure, editorImg, p);
        renderBox();
      }
    }

    function renderBox() {
      if (!editor) return;
      placeBox(box, editor.rect);
      readout.textContent = describeRect(editor.rect, editor.photo);
    }

    function startDrag(e) {
      if (!editor || saving || drag) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var frame = editorFigure.getBoundingClientRect();
      if (!frame.width || !frame.height) return;
      var handle = e.target.closest ? e.target.closest('[data-handle]') : null;
      e.preventDefault();
      box.focus({ preventScroll: true });
      drag = {
        id: e.pointerId,
        mode: handle ? handle.getAttribute('data-handle') : 'move',
        x: e.clientX,
        y: e.clientY,
        fw: frame.width,
        fh: frame.height,
        start: copy(editor.rect)
      };
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* moves still reach the box */ }
      box.classList.add('is-dragging');
      readout.setAttribute('aria-live', 'off');
    }

    function moveDrag(e) {
      if (!drag || !editor || e.pointerId !== drag.id) return;
      e.preventDefault();
      var dx = (e.clientX - drag.x) / drag.fw;
      var dy = (e.clientY - drag.y) / drag.fh;
      editor.rect = dragRect(drag.start, drag.mode, dx, dy);
      renderBox();
    }

    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null;
      box.classList.remove('is-dragging');
      readout.setAttribute('aria-live', 'polite');
      renderBox();
    }

    function onKey(e) {
      if (!editor || saving || e.altKey || e.ctrlKey || e.metaKey) return;
      var dx = 0;
      var dy = 0;
      if (e.key === 'ArrowLeft') dx = -1;
      else if (e.key === 'ArrowRight') dx = 1;
      else if (e.key === 'ArrowUp') dy = -1;
      else if (e.key === 'ArrowDown') dy = 1;
      else return;
      e.preventDefault();
      var r = editor.rect;
      editor.rect = e.shiftKey
        // Wider or narrower from the left edge, taller or shorter from the top edge.
        ? normalize({ left: r.left, top: r.top, w: r.w + dx * STEP, h: r.h + dy * STEP })
        : normalize({ left: r.left + dx * STEP, top: r.top + dy * STEP, w: r.w, h: r.h });
      renderBox();
    }

    function save() {
      if (!editor || saving) return;
      var photo = editor.photo;
      var value = {
        url: photo.url,
        width: Math.round(photo.width),
        height: Math.round(photo.height),
        spot: rectToSpot(editor.rect)
      };
      saving = true;
      saveButton.disabled = true;
      cancelButton.disabled = true;
      saveButton.textContent = 'Saving…';
      say(editorError, '');
      admin.client.from('site_settings').upsert({ key: 'wallpaper', value: value })
        .then(function (result) {
          if (disposed) return;
          if (result.error) throw result.error;
          saving = false;
          setCurrent({
            url: value.url,
            width: value.width,
            height: value.height,
            spot: copy(value.spot),
            builtIn: false,
            updatedAt: new Date().toISOString()
          });
          closeEditor();
          say(currentOk, 'Saved. The site uses this photo and spot now.');
          currentOk.focus();
        })
        .catch(function (err) {
          if (disposed) return;
          saving = false;
          saveButton.disabled = false;
          cancelButton.disabled = false;
          saveButton.textContent = 'Save';
          say(editorError, 'Not saved. ' + describeDbError(err));
        });
    }

    // ---- Helpers -----------------------------------------------------------------------

    function showPanel(name) {
      loadingPanel.hidden = name !== 'loading';
      currentPanel.hidden = name !== 'current';
      editorPanel.hidden = name !== 'editor';
    }

    function setBusy(value) {
      busy = value;
      chooseButton.disabled = value;
      moveButton.disabled = value;
      originalButton.disabled = value;
    }

    function clearMessages() {
      say(currentError, '');
      say(currentOk, '');
    }

    function accessToken() {
      return admin.client.auth.getSession().then(function (result) {
        var session = result && result.data && result.data.session;
        return (session && session.access_token) || null;
      }, function () {
        return (admin.session && admin.session.access_token) || null;
      });
    }
  }

  // ---- Shared helpers (no state) ---------------------------------------------------------

  function signError(status, data) {
    var code = data && data.error;
    if (status === 401 || code === 'not_signed_in') return SIGNED_OUT;
    if (status === 403 || code === 'not_owner') {
      return 'This account isn\'t an owner, so it can\'t upload photos.';
    }
    if (code === 'cloudinary_not_set_up') {
      return ((data && data.message) || 'Cloudinary isn\'t set up yet.') +
        ' Uploads work once it is (README, "Set up the wallpaper upload").';
    }
    if (data && typeof data.message === 'string' && data.message) return data.message;
    return 'Couldn\'t get ready to upload (error ' + status + '). Try again in a moment.';
  }

  function describeDbError(err) {
    var code = err && err.code;
    var text = (err && err.message) || '';
    if (code === '42501') return 'This account isn\'t allowed to change the wallpaper (only owners can).';
    if (code === '23514') return 'The database refused the photo or the spot.';
    if (code === '42P01' || code === 'PGRST205') {
      return 'The settings table isn\'t set up yet (run supabase/wallpaper.sql).';
    }
    if (!text || /fetch|network|load failed/i.test(text)) {
      return 'Couldn\'t reach Supabase. Check your connection and try again.';
    }
    return text.replace(/\.?$/, '.');
  }

  function checkFile(file) {
    var type = String(file.type || '');
    var heic = /\.(heic|heif)$/i.test(file.name || '');
    if (/svg/i.test(type)) return 'Choose a photo (JPEG, PNG, WebP or HEIC), not a drawing (SVG).';
    if (!/^image\//.test(type) && !heic) {
      return 'That file isn\'t a photo. Choose a JPEG, PNG, WebP or HEIC photo.';
    }
    if (!file.size) return 'That file is empty. Choose another photo.';
    if (file.size > MAX_BYTES) {
      return 'That photo is ' + (Math.ceil(file.size / 104857.6) / 10).toFixed(1) +
        ' MB; the limit is 10 MB. ' +
        'Choose a smaller one, or export it smaller first.';
    }
    return '';
  }

  // A wallpaper row as the page uses it, or null if its value isn't usable.
  function fromRow(row) {
    var v = row && row.value;
    var s = v && v.spot;
    var ok = v && typeof v.url === 'string' && v.url && v.width > 0 && v.height > 0 && s &&
      [s.cx, s.bottom, s.w, s.h].every(function (n) { return typeof n === 'number' && isFinite(n); });
    if (!ok) {
      console.warn('admin-wallpaper.js: the saved wallpaper looks wrong, showing the original photo', v);
      return null;
    }
    return {
      url: v.url,
      width: v.width,
      height: v.height,
      spot: { cx: s.cx, bottom: s.bottom, w: s.w, h: s.h },
      builtIn: false,
      updatedAt: row.updated_at || null
    };
  }

  // A smaller, quicker copy of a Cloudinary photo; other addresses are used as they are.
  function previewUrl(url) {
    var match = /^(https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/)(.+)$/.exec(url);
    return match ? match[1] + PREVIEW_TRANSFORM + '/' + match[2] : url;
  }

  function showPhoto(figure, img, photo, onFail) {
    var full = photo.url;
    img.onerror = function () {
      // The smaller copy didn't load: try the photo itself once.
      if (img.getAttribute('src') !== full) img.src = full;
      else if (onFail) onFail();
    };
    sizeFigure(figure, img, photo);
    img.src = previewUrl(full);
  }

  // Reserve the photo's shape before it loads; keep a tall photo within the window.
  function sizeFigure(figure, img, photo) {
    img.width = photo.width;
    img.height = photo.height;
    figure.style.maxWidth = 'calc(70vh * ' + (photo.width / photo.height).toFixed(4) + ')';
  }

  function spotToRect(spot) {
    return normalize({ left: spot.cx - spot.w / 2, top: spot.bottom - spot.h, w: spot.w, h: spot.h });
  }

  function rectToSpot(r) {
    return {
      cx: clamp(round4(r.left + r.w / 2), 0, 1),
      bottom: clamp(round4(r.top + r.h), 0, 1),
      w: clamp(round4(r.w), 0.0001, 1),
      h: clamp(round4(r.h), 0.0001, 1)
    };
  }

  // Keep the box at least the smallest size and wholly on the photo.
  function normalize(r) {
    var w = clamp(r.w, MIN_W, 1);
    var h = clamp(r.h, MIN_H, 1);
    return { left: clamp(r.left, 0, 1 - w), top: clamp(r.top, 0, 1 - h), w: w, h: h };
  }

  // The box after a drag of (dx, dy), as fractions of the photo, from where it started.
  function dragRect(start, mode, dx, dy) {
    if (mode === 'move') {
      return {
        left: clamp(start.left + dx, 0, 1 - start.w),
        top: clamp(start.top + dy, 0, 1 - start.h),
        w: start.w,
        h: start.h
      };
    }
    var left = start.left;
    var top = start.top;
    var right = start.left + start.w;
    var bottom = start.top + start.h;
    if (mode.indexOf('w') !== -1) left = clamp(left + dx, 0, right - MIN_W);
    if (mode.indexOf('e') !== -1) right = clamp(right + dx, left + MIN_W, 1);
    if (mode.indexOf('n') !== -1) top = clamp(top + dy, 0, bottom - MIN_H);
    if (mode.indexOf('s') !== -1) bottom = clamp(bottom + dy, top + MIN_H, 1);
    return { left: left, top: top, w: right - left, h: bottom - top };
  }

  function placeBox(node, r) {
    node.style.left = percent(r.left);
    node.style.top = percent(r.top);
    node.style.width = percent(r.w);
    node.style.height = percent(r.h);
  }

  function describeRect(r, photo) {
    var shape = (r.w * photo.width) / (r.h * photo.height);
    return 'Left edge ' + oneDecimal(r.left) + '% across, top edge ' + oneDecimal(r.top) +
      '% down; ' + oneDecimal(r.w) + '% wide, ' + oneDecimal(r.h) + '% high. Shape ' +
      ratio(shape) + ' (the original spot is about ' + ratio(ORIGINAL_SHAPE) + ').';
  }

  function ratio(x) {
    return x >= 1 ? x.toFixed(1) + ' : 1' : '1 : ' + (1 / x).toFixed(1);
  }

  function oneDecimal(fraction) {
    return (Math.round(fraction * 1000) / 10).toFixed(1);
  }

  function percent(fraction) {
    return (fraction * 100).toFixed(3) + '%';
  }

  function round4(n) {
    return Math.round(n * 10000) / 10000;
  }

  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  function copy(o) {
    var out = {};
    Object.keys(o).forEach(function (k) { out[k] = o[k]; });
    return out;
  }

  function formatNumber(n) {
    return Number(n).toLocaleString('en-GB');
  }

  function formatDate(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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

  function photoImg(alt) {
    var img = el('img', 'wallpaper-photo');
    img.alt = alt;
    img.draggable = false;
    img.decoding = 'async';
    return img;
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
