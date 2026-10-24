/*
  Owner page (admin.html): email and password sign-in through Supabase Auth, then the
  owner check.

  Uses supabase-js (loaded from jsDelivr in admin.html) for sign-in and, in the section
  modules, for owner data. The public site doesn't load it; it keeps plain fetch. The
  Supabase URL and publishable key come from comments-config.js.

  Views: loading -> sign-in -> checking -> owner page, "isn't an owner account", or an
  error. Owners are Supabase Auth users added by hand in the dashboard (no sign-up). Whether an account is an owner is decided by the database:
  is_owner() in supabase/owners.sql.

  Section modules (admin-wallpaper.js, admin-workshops.js) plug in through
  window.studioAdmin. Load each with a plain <script> after admin.js.

    studioAdmin.client     the supabase-js client (signed in as the owner once ready)
    studioAdmin.session    the current Supabase session, or null (kept up to date)
    studioAdmin.isReady()  true while the owner page is showing
    studioAdmin.registerSection(name, render)
        name    the data-section of a <section> in admin.html ("wallpaper", "workshops")
        render  function (body, admin): fills body, the section's content element
                (emptied first), each time the owner page opens. It may return a
                function, called when the owner signs out, to clean up (timers,
                listeners); the "Coming soon" placeholder then comes back.
    studioAdmin.onReady(fn)
        calls fn(admin) each time the owner page opens, and straight away if it's open.

  For example:

    studioAdmin.registerSection('wallpaper', function (body, admin) {
      body.textContent = 'Signed in as ' + admin.session.user.email;
    });
*/
(function () {
  'use strict';

  // How long the owner check may take before the page gives up and offers a retry.
  var CHECK_TIMEOUT_MS = 15000;

  var config = window.COMMENTS_CONFIG || {};
  var supabaseUrl = String(config.supabaseUrl || '').trim().replace(/\/+$/, '');
  var supabaseKey = String(config.supabaseAnonKey || '').trim();

  var views = {
    loading: document.getElementById('admin-loading'),
    signin: document.getElementById('admin-signin'),
    denied: document.getElementById('admin-denied'),
    error: document.getElementById('admin-error'),
    owner: document.getElementById('admin-owner')
  };
  var loadingText = document.getElementById('admin-loading-text');
  var signinForm = document.getElementById('admin-signin-form');
  var signinEmail = document.getElementById('admin-signin-email');
  var signinPassword = document.getElementById('admin-signin-password');
  var signinButton = document.getElementById('admin-signin-submit');
  // The words on the button, changed while signing in.
  var signinText = signinButton.querySelector('[data-admin-label]') || signinButton;
  var signinLabel = signinText.textContent;
  var signinError = document.getElementById('admin-signin-error');
  var errorText = document.getElementById('admin-error-text');
  var retryButton = document.getElementById('admin-retry');
  var errorSignout = views.error.querySelector('[data-admin-signout]');
  var signoutButtons = document.querySelectorAll('[data-admin-signout]');
  var signoutError = document.getElementById('admin-signout-error');
  // The email and Sign out in the menu bar, shown with the owner page only.
  var account = document.getElementById('admin-account');

  // Sections by name: { body, placeholder, render, cleanup }.
  var sections = {};
  Array.prototype.forEach.call(document.querySelectorAll('[data-section]'), function (el) {
    var body = el.querySelector('[data-section-body]') || el;
    sections[el.getAttribute('data-section')] = {
      body: body,
      placeholder: body.innerHTML,
      render: null,
      cleanup: null
    };
  });

  var readyCallbacks = [];
  var ready = false;          // the owner page is showing
  var checkedUserId = null;   // user whose owner check has an answer (owner or not)
  var checkingUserId = null;  // user whose owner check is in flight
  var checkSeq = 0;           // bumped to drop answers to older checks
  var retryAction = null;

  var admin = window.studioAdmin = {
    client: null,
    session: null,
    isReady: function () { return ready; },
    registerSection: registerSection,
    onReady: onReady
  };

  retryButton.addEventListener('click', function () {
    if (retryAction) retryAction();
  });

  if (!supabaseUrl || !supabaseKey) {
    showError('The Supabase settings in comments-config.js are empty, so sign-in can\'t work.', reload);
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    showError('The sign-in library didn\'t load. Check your connection and reload the page.', reload);
    return;
  }

  var client = admin.client = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });

  showLoading('Checking sign-in…');

  client.auth.onAuthStateChange(function (event, session) {
    // supabase-js holds a lock while this runs, so other Supabase calls made here would
    // wait forever. Handle the change just after instead.
    setTimeout(function () { handleSession(event, session); }, 0);
  });

  signinForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (signinButton.disabled) return;
    var email = signinEmail.value.trim();
    var password = signinPassword.value;
    if (!email || !password) return;
    setSignInBusy(true);
    signinError.hidden = true;
    var start;
    try {
      start = client.auth.signInWithPassword({ email: email, password: password });
    } catch (err) {
      start = Promise.resolve({ error: err });
    }
    // On success onAuthStateChange (SIGNED_IN) takes over: the owner check, then the
    // owner page or "isn't an owner account". The form stays busy until then.
    Promise.resolve(start).then(function (result) {
      if (result && result.error) signInFailed(result.error);
      else if (!result || !result.data || !result.data.session) signInFailed(null);
    }, signInFailed);
  });

  Array.prototype.forEach.call(signoutButtons, function (button) {
    button.addEventListener('click', signOut);
  });

  // ---- Sign-in state -------------------------------------------------------------

  function handleSession(event, session) {
    admin.session = session || null;

    if (!session || !session.user) {
      checkSeq++;
      checkedUserId = null;
      checkingUserId = null;
      closeOwnerPage();
      showSignIn();
      return;
    }

    // Token refreshes (and repeat sign-in events) for the same account only update
    // admin.session above; the answer to the owner check stays.
    if (session.user.id === checkedUserId || session.user.id === checkingUserId) return;
    checkOwner();
  }

  function checkOwner() {
    var session = admin.session;
    if (!session || !session.user) {
      showSignIn();
      return;
    }
    var seq = ++checkSeq;
    var userId = session.user.id;
    checkingUserId = userId;
    checkedUserId = null;
    closeOwnerPage();
    setEmail(session.user.email || 'This account');
    showLoading('Checking your account…');

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timedOut = false;
    var timer = controller ? setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, CHECK_TIMEOUT_MS) : null;

    var request = client.rpc('is_owner');
    if (controller) request = request.abortSignal(controller.signal);

    Promise.resolve(request).then(function (result) {
      finish(result.error, result.data);
    }, function (err) {
      finish(err || new Error('unknown error'));
    });

    function finish(error, isOwner) {
      if (timer) clearTimeout(timer);
      if (seq !== checkSeq) return; // signed out, or another check started since
      checkingUserId = null;
      if (error) {
        console.error('Owner check failed:', error);
        showError(describeCheckError(error, timedOut), checkOwner);
        return;
      }
      checkedUserId = userId;
      if (isOwner === true) openOwnerPage();
      else showView('denied');
    }
  }

  function describeCheckError(error, timedOut) {
    var message = String((error && error.message) || '');
    var code = String((error && error.code) || '');
    if (timedOut) {
      return 'Supabase didn\'t answer in time. Check your connection and try again.';
    }
    if (code === 'PGRST202' || code === '42883' ||
        /could not find the function|function .*does not exist/i.test(message)) {
      return 'The owner check isn\'t set up yet: supabase/owners.sql hasn\'t been run in ' +
        'the Supabase SQL Editor (see "Set up the owner page" in the README).';
    }
    if (code === '42501' || /permission denied/i.test(message)) {
      return 'The owner check isn\'t allowed: run supabase/owners.sql again in the ' +
        'Supabase SQL Editor.';
    }
    if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(message)) {
      return 'Your sign-in has expired. Sign out, then sign in again.';
    }
    if (/^(TypeError|FetchError|AbortError)\b/.test(message) ||
        /failed to fetch|networkerror|load failed/i.test(message)) {
      return 'Couldn\'t reach Supabase. Check your connection and try again.';
    }
    return 'Couldn\'t check your account (' + (message || 'unknown error') + ').';
  }

  // A failed sign-in: say why, keep the email, clear the password and go back to it.
  function signInFailed(error) {
    setSignInBusy(false);
    signinPassword.value = '';
    signinError.textContent = signInMessage(error);
    signinError.hidden = false;
    signinPassword.focus();
  }

  function signInMessage(error) {
    var message = String((error && error.message) || '').trim();
    var code = String((error && error.code) || '');
    var status = error && error.status;
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
      return 'That email and password don\'t match an account.';
    }
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
      return 'Couldn\'t sign in: this account isn\'t confirmed yet. Confirm it in the Supabase dashboard.';
    }
    if (status === 429 || /rate limit|too many/i.test(message)) {
      return 'Couldn\'t sign in: too many tries. Wait a few minutes and try again.';
    }
    if ((error && error.name === 'AuthRetryableFetchError') ||
        /^(TypeError|FetchError|AbortError)\b/.test(message) ||
        /failed to fetch|networkerror|load failed/i.test(message)) {
      return 'Couldn\'t sign in: Supabase couldn\'t be reached. Check your connection and try again.';
    }
    return 'Couldn\'t sign in: ' + (message || 'unknown error').replace(/\.$/, '') + '.';
  }

  function signOut() {
    setSignoutDisabled(true);
    signoutError.hidden = true;
    var done;
    try {
      // Signs out on this device only, not on the owner's other devices.
      done = client.auth.signOut({ scope: 'local' });
    } catch (err) {
      done = Promise.resolve({ error: err });
    }
    // On success onAuthStateChange gets SIGNED_OUT and shows the sign-in screen.
    Promise.resolve(done).then(function (result) {
      setSignoutDisabled(false);
      if (result && result.error) signOutFailed(result.error);
    }, function (err) {
      setSignoutDisabled(false);
      signOutFailed(err);
    });
  }

  function signOutFailed(error) {
    signoutError.textContent = 'Couldn\'t sign out: ' +
      ((error && error.message) || 'unknown error') + '. Try again.';
    signoutError.hidden = false;
  }

  // ---- Owner page and sections ---------------------------------------------------

  function openOwnerPage() {
    showView('owner');
    ready = true;
    Object.keys(sections).forEach(function (name) {
      if (sections[name].render) renderSection(name);
    });
    readyCallbacks.slice().forEach(callReady);
  }

  function closeOwnerPage() {
    if (!ready) return;
    ready = false;
    Object.keys(sections).forEach(function (name) {
      var section = sections[name];
      if (section.cleanup) {
        try { section.cleanup(); } catch (err) { console.error(err); }
      }
      section.cleanup = null;
      section.body.innerHTML = section.placeholder;
    });
  }

  function registerSection(name, render) {
    if (typeof render !== 'function') {
      throw new TypeError('studioAdmin.registerSection: render must be a function');
    }
    var section = sections[name];
    if (!section) {
      console.error('studioAdmin.registerSection: admin.html has no data-section="' + name + '"');
      return;
    }
    if (section.render) {
      console.error('studioAdmin.registerSection: "' + name + '" is already registered');
      return;
    }
    section.render = render;
    if (ready) renderSection(name);
  }

  function renderSection(name) {
    var section = sections[name];
    section.body.textContent = '';
    try {
      var cleanup = section.render(section.body, admin);
      section.cleanup = typeof cleanup === 'function' ? cleanup : null;
    } catch (err) {
      console.error(err);
      section.cleanup = null;
      var note = document.createElement('p');
      note.className = 'admin-message admin-message-error';
      note.textContent = 'This section couldn\'t load: ' + ((err && err.message) || 'unknown error') + '.';
      section.body.textContent = '';
      section.body.appendChild(note);
    }
  }

  function onReady(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('studioAdmin.onReady: expects a function');
    }
    readyCallbacks.push(fn);
    if (ready) callReady(fn);
  }

  function callReady(fn) {
    try { fn(admin); } catch (err) { console.error(err); }
  }

  // ---- Views ---------------------------------------------------------------------

  function showView(name) {
    Object.keys(views).forEach(function (key) {
      views[key].hidden = key !== name;
    });
    account.hidden = name !== 'owner';
    signoutError.hidden = true;
  }

  function showLoading(text) {
    loadingText.textContent = text;
    showView('loading');
  }

  // Opening the sign-in view (on load, or after signing out) starts with an empty form.
  // If it's already showing (e.g. a sign-out in another tab), what's typed stays.
  function showSignIn() {
    if (views.signin.hidden) {
      setSignInBusy(false);
      signinForm.reset();
      signinError.hidden = true;
    }
    showView('signin');
  }

  function setSignInBusy(busy) {
    signinEmail.disabled = busy;
    signinPassword.disabled = busy;
    signinButton.disabled = busy;
    signinText.textContent = busy ? 'Signing in…' : signinLabel;
  }

  function showError(message, retry) {
    errorText.textContent = message;
    retryAction = retry;
    errorSignout.hidden = !admin.session;
    showView('error');
  }

  function setEmail(email) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-admin-email]'), function (el) {
      el.textContent = email;
    });
  }

  function setSignoutDisabled(disabled) {
    Array.prototype.forEach.call(signoutButtons, function (button) {
      button.disabled = disabled;
    });
  }

  function reload() {
    location.reload();
  }
})();
