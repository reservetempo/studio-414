/*
  Comment section for Studio 414.

  No login: a visitor types a name with their first comment, it is remembered in
  localStorage, and later comments reuse it ("Commenting as <name>", with a "change"
  control). Without localStorage the name is asked for on each visit.

  Comments are stored in Supabase through its REST API (PostgREST), using plain fetch.
  Set the project URL and anon / publishable key in comments-config.js. While those are
  empty, a demo store keeps comments in this browser's localStorage instead.

  User content is only ever rendered with textContent, never as HTML.
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

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderComment(comment) {
    var item = element('li', 'comment');
    item.appendChild(element('p', 'comment__name', comment.name));
    // white-space: pre-wrap in comments.css keeps the line breaks.
    item.appendChild(element('p', 'comment__body', comment.body));
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

  /* ---------- Start ---------- */

  if (!connected) {
    noteEl.textContent = 'Comments aren’t connected yet, so anything posted here is saved only in this browser.';
    noteEl.hidden = false;
  }

  if (savedName) showIdentity();
  else showNameField();

  loadComments();
})();
