/*
  Comment section for Studio 414.

  No login: a visitor types a name with their first comment, it is remembered in
  localStorage, and later comments reuse it ("Commenting as <name>", with a "change"
  control). Without localStorage the name is asked for on each visit.

  Comments are stored in Supabase through its REST API (PostgREST), using plain fetch.
  Set the project URL and anon / publishable key in comments-config.js. While those are
  empty, a demo store keeps comments in this browser's localStorage instead.

  User content is only ever rendered with textContent, never as HTML.

  Where the section floats over the first screen (comments.css), the owners' layout
  (layout.js, its "comments" part) sets its spot and size, as it does the card's
  (boxes.js); see "Where it floats" below. Visitors can't move it. The owners can also
  hide it (the layout's "commentsHidden"): then it isn't shown and its comments aren't
  fetched until they show it again; see "Hidden by the owners".

  In the owners' preview page (preview.html, which frames the site with ?edit=1), each
  comment gets a Delete button once the page says the owner is signed in. This page
  can't delete (it has only the publishable key), so it asks the preview page by
  postMessage, which deletes with the owner's session and answers; see "Deleting".
*/
(function () {
  'use strict';

  var NAME_KEY = 'studio414.comments.name';
  var DEMO_KEY = 'studio414.comments.demo';
  var NAME_MAX = 40;
  var BODY_MAX = 2000;
  var REQUEST_TIMEOUT_MS = 15000;

  var root = document.getElementById('comments');
  if (!root) return;

  var listEl = document.getElementById('comments-list');
  var statusEl = document.getElementById('comments-status');
  var retryButton = document.getElementById('comments-retry');
  var noteEl = document.getElementById('comments-note');
  var form = document.getElementById('comments-form');
  var nameField = document.getElementById('comments-name-field');
  var nameInput = document.getElementById('comments-name');
  var identityEl = document.getElementById('comments-identity');
  var identityName = document.getElementById('comments-identity-name');
  var changeButton = document.getElementById('comments-change');
  var bodyInput = document.getElementById('comments-body');
  var submitButton = document.getElementById('comments-submit');
  var messageEl = document.getElementById('comments-message');

  var config = window.COMMENTS_CONFIG || {};
  var supabaseUrl = String(config.supabaseUrl || '').trim().replace(/\/+$/, '');
  var supabaseKey = String(config.supabaseAnonKey || '').trim();
  var connected = Boolean(supabaseUrl && supabaseKey);

  /* ---------- localStorage, always optional ---------- */

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  /* ---------- Text helpers ---------- */

  // Counts characters the way Postgres char_length does (an emoji is one, not two).
  function charCount(text) {
    return Array.from(text).length;
  }

  function cleanName(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function cleanBody(value) {
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim();
  }

  function isValidName(name) {
    var count = charCount(name);
    return count >= 1 && count <= NAME_MAX;
  }

  /* ---------- Storage: Supabase REST, or the demo store ---------- */

  function supabaseRequest(path, options) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    var headers = {
      apikey: supabaseKey,
      Accept: 'application/json'
    };
    // The legacy anon key is a JWT (eyJ...) and goes in Authorization as well. The newer
    // publishable key (sb_publishable_...) is not a JWT and goes in apikey only.
    if (/^eyJ/.test(supabaseKey)) headers.Authorization = 'Bearer ' + supabaseKey;
    Object.keys(options.headers || {}).forEach(function (name) {
      headers[name] = options.headers[name];
    });

    return fetch(supabaseUrl + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body,
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (response.ok) return response.json();
      return response.text().then(function (text) {
        var error = new Error('Supabase request failed with HTTP ' + response.status);
        error.status = response.status;
        error.detail = text;
        throw error;
      });
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function normalize(row) {
    if (!row || typeof row !== 'object') return null;
    return {
      id: row.id,
      name: String(row.name == null ? '' : row.name),
      body: String(row.body == null ? '' : row.body),
      created_at: String(row.created_at == null ? '' : row.created_at)
    };
  }

  function normalizeRows(rows) {
    if (!Array.isArray(rows)) throw new Error('Unexpected response from the comments server');
    return rows.map(normalize).filter(Boolean);
  }

  // Demo store: the rows live in memory for this page and are written through to
  // localStorage, so they survive a reload when storage is available.
  var demoRows = null;

  function loadDemoRows() {
    if (demoRows) return demoRows;
    demoRows = [];
    var raw = readStorage(DEMO_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) demoRows = parsed.map(normalize).filter(Boolean);
      } catch (error) {
        demoRows = [];
      }
    }
    return demoRows;
  }

  /** Returns all comments, oldest first. */
  function listComments() {
    if (connected) {
      return supabaseRequest('comments?select=id,name,body,created_at&order=created_at.asc', {})
        .then(normalizeRows);
    }
    return Promise.resolve(loadDemoRows().slice());
  }

  /** Saves a new comment and returns it as stored (with its id and created_at). */
  function addComment(name, body) {
    if (connected) {
      return supabaseRequest('comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ name: name, body: body })
      }).then(function (rows) {
        var row = normalizeRows(rows)[0];
        if (!row) throw new Error('Unexpected response from the comments server');
        return row;
      });
    }
    var rows = loadDemoRows();
    var lastId = rows.reduce(function (max, row) { return Math.max(max, Number(row.id) || 0); }, 0);
    var row = { id: lastId + 1, name: name, body: body, created_at: new Date().toISOString() };
    rows.push(row);
    writeStorage(DEMO_KEY, JSON.stringify(rows));
    return Promise.resolve(row);
  }

  function describeError(error) {
    if (error && error.name === 'AbortError') return 'the server took too long to answer';
    if (error && error.status) return 'server error ' + error.status;
    if (error instanceof TypeError) return 'could not reach the server';
    return 'something went wrong';
  }

  /* ---------- Rendering ---------- */

  var comments = [];
  var loaded = false;
  // Set once the owners' preview page says the owner is signed in (see "Deleting").
  var owner = false;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderComment(comment) {
    var item = element('li', 'comment');
    // The id as the database returns it, for the owner's Delete (see "Deleting").
    item.dataset.id = String(comment.id);
    item.appendChild(element('p', 'comment__name', comment.name));
    // white-space: pre-wrap in comments.css keeps the line breaks.
    item.appendChild(element('p', 'comment__body', comment.body));
    if (owner) item.appendChild(renderDelete(comment));
    return item;
  }

  function renderList() {
    var items = comments.map(renderComment);
    listEl.replaceChildren.apply(listEl, items);
    listEl.hidden = items.length === 0;
    // The list scrolls inside its box; show the newest, which are last, by the form.
    var pane = listEl.parentNode;
    pane.scrollTop = pane.scrollHeight;
  }

  // The status line stays in the page (empty when there is nothing to say), so
  // screen readers keep it as a live region.
  function setStatus(text, showRetry) {
    statusEl.textContent = text;
    statusEl.parentNode.classList.toggle('is-active', Boolean(text));
    retryButton.hidden = !showRetry;
  }

  function showComments() {
    renderList();
    showEmpty();
  }

  // The status line says so when the list is empty (and is empty itself otherwise).
  function showEmpty() {
    setStatus(comments.length ? '' : 'No comments yet. Be the first.', false);
  }

  function loadComments() {
    root.setAttribute('aria-busy', 'true');
    if (!loaded) setStatus('Loading comments…', false);
    return listComments().then(function (rows) {
      comments = rows;
      loaded = true;
      showComments();
    }, function (error) {
      console.warn('Comments could not be loaded:', error, error && error.detail);
      if (loaded) return;
      renderList();
      setStatus('Couldn’t load comments (' + describeError(error) + ').', true);
    }).finally(function () {
      root.removeAttribute('aria-busy');
    });
  }

  /* ---------- Name ---------- */

  var savedName = cleanName(readStorage(NAME_KEY));
  if (!isValidName(savedName)) savedName = '';

  function saveName(name) {
    savedName = name;
    writeStorage(NAME_KEY, name);
  }

  function showIdentity() {
    identityName.textContent = savedName;
    identityEl.hidden = false;
    nameField.hidden = true;
  }

  function showNameField() {
    identityEl.hidden = true;
    nameField.hidden = false;
  }

  /* ---------- Form ---------- */

  var posting = false;

  function setMessage(text, state) {
    messageEl.textContent = text;
    if (state) messageEl.dataset.state = state;
    else delete messageEl.dataset.state;
  }

  function markInvalid(input, text) {
    input.setAttribute('aria-invalid', 'true');
    setMessage(text, 'error');
    input.focus();
  }

  function clearInvalid(input) {
    input.removeAttribute('aria-invalid');
  }

  function setPosting(state) {
    posting = state;
    submitButton.disabled = state;
    submitButton.textContent = state ? 'Posting…' : 'Post comment';
    if (state) form.setAttribute('aria-busy', 'true');
    else form.removeAttribute('aria-busy');
  }

  changeButton.addEventListener('click', function () {
    nameInput.value = savedName;
    showNameField();
    nameInput.focus();
    nameInput.select();
  });

  [nameInput, bodyInput].forEach(function (input) {
    input.addEventListener('input', function () {
      clearInvalid(input);
      // Clear an earlier error or "posted" note once the visitor carries on typing.
      if (!posting && messageEl.textContent) setMessage('');
    });
  });

  retryButton.addEventListener('click', function () {
    loadComments();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (posting) return;

    clearInvalid(nameInput);
    clearInvalid(bodyInput);

    var askingName = !nameField.hidden;
    var name = askingName ? cleanName(nameInput.value) : savedName;
    var body = cleanBody(bodyInput.value);

    if (askingName && !name) {
      markInvalid(nameInput, 'Please enter your name.');
      return;
    }
    if (askingName && charCount(name) > NAME_MAX) {
      markInvalid(nameInput, 'Your name can be at most ' + NAME_MAX + ' characters.');
      return;
    }
    if (!body) {
      markInvalid(bodyInput, 'Please write a comment.');
      return;
    }
    var bodyCount = charCount(body);
    if (bodyCount > BODY_MAX) {
      markInvalid(bodyInput, 'Your comment is ' + bodyCount.toLocaleString('en') +
        ' characters long; the limit is ' + BODY_MAX.toLocaleString('en') + '.');
      return;
    }

    setPosting(true);
    setMessage('');

    addComment(name, body).then(function (row) {
      saveName(name);
      showIdentity();
      bodyInput.value = '';
      if (!comments.some(function (comment) { return comment.id === row.id; })) {
        comments.push(row);
      }
      loaded = true;
      showComments();
      setMessage('Thanks, your comment is posted.', 'success');
      // Pick up anything friends posted in the meantime.
      if (connected) loadComments();
    }, function (error) {
      console.warn('Comment could not be posted:', error, error && error.detail);
      setMessage('Couldn’t post your comment (' + describeError(error) + '). Please try again.', 'error');
    }).finally(function () {
      setPosting(false);
      // Disabling the focused button drops focus to the page; put it back.
      if (!document.activeElement || document.activeElement === document.body) {
        submitButton.focus({ preventScroll: true });
      }
    });
  });

  /* ---------- Deleting: the owner, in the preview page's ?edit=1 frame ---------- */

  // The owners' preview page (preview.html) frames the site with ?edit=1 and, once the
  // owner is signed in, posts { type: 'studio414:owner' }. Only then does each comment
  // (and each one loaded or posted later) get a Delete button, which asks "Delete the
  // comment by <name>?" in place, with Delete and Cancel. This page has only the
  // publishable key, so it can't delete anything itself: the confirming Delete posts
  // { type: 'studio414:commentdelete', id } (the id as the database returns it) to the
  // parent, which deletes the comment with the owner's session and answers
  // { type: 'studio414:commentdeleted', id, ok: true } (the comment leaves the list) or
  // { ..., ok: false, message } (it stays, with the message). Messages count only from
  // the parent page, on this origin. Visitors, and a bare ?edit=1, never get the buttons.

  var editing = new URLSearchParams(window.location.search).get('edit') === '1';
  var framed = window.parent !== window;
  var DELETE_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 5000;
  // Each asked-about comment's step, by id: 'confirm' (asking) or 'waiting' (the parent
  // was asked), with the message of a failed delete. Kept apart from the elements, so
  // they survive the list being drawn again (a reload after posting).
  var deleteStates = {};
  var deleteTimers = {};

  function findComment(key) {
    for (var i = 0; i < comments.length; i += 1) {
      if (String(comments[i].id) === key) return comments[i];
    }
    return null;
  }

  function findItem(key) {
    var items = listEl.children;
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].dataset.id === key) return items[i];
    }
    return null;
  }

  // A text button (comments__link, which the themes style), named by data-role so
  // focus can be put back on it after the line is drawn again.
  function textButton(text, role, onPress) {
    var node = element('button', 'comments__link', text);
    node.type = 'button';
    node.dataset.role = role;
    node.addEventListener('click', onPress);
    return node;
  }

  // The comment's Delete, or the question with its Delete and Cancel.
  function renderDelete(comment) {
    var key = String(comment.id);
    var state = deleteStates[key];
    var line = element('p', 'comment__delete');
    if (!state) {
      var start = textButton('Delete', 'start', function () {
        setDeleteState(key, { step: 'confirm' }, 'cancel');
      });
      start.setAttribute('aria-label', 'Delete the comment by ' + comment.name);
      line.appendChild(start);
      return line;
    }
    var waiting = state.step === 'waiting';
    line.appendChild(element('span', 'comment__question', 'Delete the comment by ' + comment.name + '?'));
    var confirmButton = textButton(waiting ? 'Deleting…' : 'Delete', 'confirm', function () {
      requestDelete(key);
    });
    var cancelButton = textButton('Cancel', 'cancel', function () {
      setDeleteState(key, null, 'start');
    });
    confirmButton.disabled = waiting;
    cancelButton.disabled = waiting;
    line.appendChild(confirmButton);
    line.appendChild(cancelButton);
    if (state.message) {
      var note = element('span', 'comment__error', state.message);
      note.setAttribute('role', 'alert');
      line.appendChild(note);
    }
    return line;
  }

  // Draws the comment's Delete line again for its new step, and focuses the button
  // named by focusRole, if any.
  function setDeleteState(key, state, focusRole) {
    if (state) deleteStates[key] = state;
    else delete deleteStates[key];
    var comment = findComment(key);
    var item = findItem(key);
    if (!comment || !item) return;
    var line = renderDelete(comment);
    var old = item.querySelector('.comment__delete');
    if (old) item.replaceChild(line, old);
    else item.appendChild(line);
    var target = focusRole && line.querySelector('[data-role="' + focusRole + '"]');
    if (target && !target.disabled) target.focus({ preventScroll: true });
  }

  function focusLost() {
    return !document.activeElement || document.activeElement === document.body;
  }

  function requestDelete(key) {
    var comment = findComment(key);
    var state = deleteStates[key];
    if (!comment || !state || state.step === 'waiting') return;
    setDeleteState(key, { step: 'waiting' });
    // Should the parent never answer, the buttons come back rather than stay disabled.
    clearTimeout(deleteTimers[key]);
    deleteTimers[key] = setTimeout(function () {
      deleteFailed(key, 'The preview page didn’t answer. Please try again.');
    }, DELETE_TIMEOUT_MS);
    window.parent.postMessage({ type: 'studio414:commentdelete', id: comment.id }, window.location.origin);
  }

  function deleteFailed(key, message) {
    clearTimeout(deleteTimers[key]);
    delete deleteTimers[key];
    if (!deleteStates[key] || deleteStates[key].step !== 'waiting') return;
    // Disabling the focused button dropped focus to the page; put it back.
    setDeleteState(key, { step: 'confirm', message: message }, focusLost() ? 'confirm' : null);
  }

  function deleteDone(key) {
    clearTimeout(deleteTimers[key]);
    delete deleteTimers[key];
    delete deleteStates[key];
    comments = comments.filter(function (comment) { return String(comment.id) !== key; });
    var item = findItem(key);
    if (!item) return;
    item.remove();
    listEl.hidden = comments.length === 0;
    showEmpty();
    if (focusLost()) listEl.parentNode.focus({ preventScroll: true });
  }

  function onMessage(event) {
    if (event.source !== window.parent || event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'studio414:owner') {
      if (owner) return;
      owner = true;
      Array.prototype.forEach.call(listEl.children, function (item) {
        var comment = findComment(item.dataset.id);
        if (comment) item.appendChild(renderDelete(comment));
      });
    } else if (data.type === 'studio414:commentdeleted' && data.id != null) {
      var key = String(data.id);
      if (data.ok === true) deleteDone(key);
      else deleteFailed(key, String(data.message || '').trim() || 'Couldn’t delete the comment.');
    }
  }

  if (editing && framed) window.addEventListener('message', onMessage);

  /* ---------- Where it floats: the owners' layout (layout.js) ---------- */

  // While the box floats over the first screen (comments.css: wide screens that are
  // tall enough), the owners' "comments" part, fractions of the visible photo turned
  // into page px by toPage(), gives its spot and size. It is never smaller than the
  // CSS lets it be (its min-width, and min-height: min-content, so the form and a
  // usable list always fit), no bigger than the first screen, and kept wholly on it.
  // With no such part, or where the section sits under the first screen, the box has
  // no inline styles: exactly the CSS spot. place() runs again whenever the layout
  // changes (fetched, or apply(), as the preview page does in its ?edit=1 frame), the
  // window is resized (which also switches between floating and not) or the font
  // changes; window.studio414Comments.place runs it on demand.

  var boxEl = document.getElementById('comments-box');
  var html = document.documentElement;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  // Whether the box floats over the first screen now (comments.css positions it so).
  function floating() {
    return window.getComputedStyle(boxEl).position === 'absolute';
  }

  // Where the owners put the box, in page px ({ x, y, w, h }), or null where they
  // leave it to the CSS.
  function ownerRect() {
    var site = window.studio414SiteLayout;
    var layout = site && typeof site.current === 'function' ? site.current() : null;
    return layout && layout.comments ? site.toPage(layout.comments) : null;
  }

  // Where left: 0; top: 0 puts the box: the corner of the page, as a rule.
  function origin() {
    var parent = boxEl.offsetParent;
    if (!parent || parent === document.body || parent === html) return { x: 0, y: 0 };
    var r = parent.getBoundingClientRect();
    return {
      x: r.left + window.pageXOffset + parent.clientLeft,
      y: r.top + window.pageYOffset + parent.clientTop
    };
  }

  function place() {
    ['left', 'top', 'width', 'height'].forEach(function (property) {
      boxEl.style.removeProperty(property);
    });
    // Hidden (see "Hidden by the owners"): it is placed again when shown.
    var r = !root.hidden && floating() ? ownerRect() : null;
    if (!r) return;
    // The first screen, which the hero fills.
    var screenW = html.clientWidth;
    var screenH = html.clientHeight;
    boxEl.style.width = Math.round(Math.min(r.w, screenW)) + 'px';
    boxEl.style.height = Math.round(Math.min(r.h, screenH)) + 'px';
    // Its size as the CSS lets it be, so never under its minimum.
    var w = boxEl.offsetWidth;
    var h = boxEl.offsetHeight;
    var o = origin();
    boxEl.style.left = Math.round(clamp(r.x, 0, Math.max(0, screenW - w)) - o.x) + 'px';
    boxEl.style.top = Math.round(clamp(r.y, 0, Math.max(0, screenH - h)) - o.y) + 'px';
  }

  document.addEventListener('studio414:sitelayout', function () {
    follow();
    place();
  });

  // Once per frame at most.
  var placeQueued = false;
  window.addEventListener('resize', function () {
    if (placeQueued) return;
    placeQueued = true;
    window.requestAnimationFrame(function () {
      placeQueued = false;
      place();
    });
  });

  // The font changes its minimum height, so where it has to sit to stay on screen.
  if (window.MutationObserver) {
    new MutationObserver(place).observe(html, { attributes: true, attributeFilter: ['data-font'] });
  }
  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', place);
  }

  window.studio414Comments = { place: place, floating: floating };

  /* ---------- Hidden by the owners: the owners' layout (layout.js) ---------- */

  // With the layout's "commentsHidden" the section is hidden (comments.css), so it is
  // neither seen nor read by screen readers, wherever it sits, and its comments aren't
  // fetched (they stay in the database). It follows the layout live, as place() does
  // (the fetched row, or apply() in the preview page's frame, where the section is
  // then not floating for edit.js, so it can't be picked or dragged): shown again, it
  // loads its comments then, the first time only; hidden again, it is just hidden. A
  // first visit has no copy of the layout yet (layout.js), so there the comments load
  // at once and the section hides when the fetched layout says so.

  var requested = false; // loadComments() has run

  function ownersHide() {
    var site = window.studio414SiteLayout;
    var layout = site && typeof site.current === 'function' ? site.current() : null;
    return Boolean(layout && layout.commentsHidden === true);
  }

  function follow() {
    var hide = ownersHide();
    if (root.hidden !== hide) root.hidden = hide;
    if (hide || requested) return;
    requested = true;
    loadComments();
  }

  /* ---------- Start ---------- */

  if (!connected) {
    noteEl.textContent = 'Comments aren’t connected yet, so anything posted here is saved only in this browser.';
    noteEl.hidden = false;
  }

  if (savedName) showIdentity();
  else showNameField();

  follow();
  place();
})();
